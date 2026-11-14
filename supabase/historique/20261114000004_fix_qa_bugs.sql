-- Migration d'origine 20261114000004_fix_qa_bugs — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Fix 1: place_bet balance_after was NULL because v_new_balance was computed
-- before the ledger insert, but the variable was correct. The issue is that
-- the SELECT balance INTO v_balance uses the user_stats row, but the QA users
-- didn't have user_stats rows yet.

-- Fix: ensure user_stats row exists for all auth users
-- The trigger handle_new_user creates it on INSERT into users,
-- but if users row doesn't exist, the trigger never fires.

-- Fix 2: place_bet ledger insert - ensure balance_after is set correctly
CREATE OR REPLACE FUNCTION public.place_bet(
  p_market_id text,
  p_side text,
  p_amount numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_market record;
  v_depth numeric;
  v_mid numeric;
  v_half numeric;
  v_a0 numeric;
  v_cost numeric;
  v_shares numeric;
  v_avg_price numeric;
  v_fee_rate numeric;
  v_fee numeric;
  v_total numeric;
  v_new_price numeric;
  v_new_balance numeric;
  v_impact numeric;
  v_category text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_side NOT IN ('oui', 'non') THEN RAISE EXCEPTION 'Side must be oui or non'; END IF;

  -- Ensure user_stats exists
  INSERT INTO public.user_stats (user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;

  -- Lock user row
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  -- Get market
  SELECT * INTO v_market FROM public.market_live_state WHERE market_id = p_market_id FOR UPDATE;
  IF v_market IS NULL THEN RAISE EXCEPTION 'Market not found'; END IF;

  -- Get category
  SELECT category INTO v_category FROM public.markets WHERE id = p_market_id;
  v_fee_rate := public.wm_fee_rate(COALESCE(v_category, 'Crypto'));

  -- Depth, midpoint, spread
  v_depth := public.book_depth(v_market.volume_total, v_market.liquidity_depth) * 100;
  v_mid := CASE WHEN p_side = 'oui' THEN v_market.current_probability / 100.0 ELSE (100 - v_market.current_probability) / 100.0 END;
  v_half := LEAST(1.5, GREATEST(0.1, 15 / sqrt(GREATEST(1, v_depth / 100)))) / 100;
  v_a0 := LEAST(0.99, v_mid + v_half);

  -- Iterative fee calculation
  v_total := p_amount;
  v_cost := v_total / (1 + v_fee_rate / 2);
  FOR i IN 1..12 LOOP
    IF v_cost <= 0 THEN EXIT; END IF;
    v_shares := 2 * v_cost / (v_a0 + sqrt(v_a0 * v_a0 + 2 * v_cost / GREATEST(1, v_depth)));
    v_avg_price := CASE WHEN v_shares > 0 THEN v_cost / v_shares ELSE v_a0 END;
    v_fee := v_cost * v_fee_rate * (1 - v_avg_price);
    v_cost := GREATEST(0, v_total - v_fee);
  END LOOP;

  -- Final
  v_shares := CASE WHEN v_cost > 0 THEN 2 * v_cost / (v_a0 + sqrt(v_a0 * v_a0 + 2 * v_cost / GREATEST(1, v_depth))) ELSE 0 END;
  v_avg_price := CASE WHEN v_shares > 0 THEN v_cost / v_shares ELSE v_a0 END;
  v_fee := v_cost * v_fee_rate * (1 - v_avg_price);
  v_total := v_cost + v_fee;

  IF v_total <= 0 OR v_shares <= 0 THEN RAISE EXCEPTION 'Invalid bet'; END IF;
  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - v_total;

  -- Debit
  UPDATE public.user_stats SET
    balance = v_new_balance, bets_placed = bets_placed + 1,
    bets_max_amount = GREATEST(bets_max_amount, v_total),
    profit_realized = profit_realized - v_fee, xp = xp + 10
  WHERE user_id = v_user_id;

  -- Ledger (with explicit NOT NULL balance_after)
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, -v_total, COALESCE(v_new_balance, 0), 'bet', p_market_id || ':' || p_side);

  -- Position
  INSERT INTO public.positions (user_id, market_id, side, shares, average_price)
  VALUES (v_user_id, p_market_id, p_side, round(v_shares::numeric, 2), round((v_avg_price * 100)::numeric, 4))
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    average_price = round(((positions.average_price * positions.shares + (v_avg_price * 100) * round(v_shares::numeric, 2)) / GREATEST(0.01, positions.shares + round(v_shares::numeric, 2)))::numeric, 4),
    shares = positions.shares + round(v_shares::numeric, 2),
    updated_at = now();

  -- Market price update
  v_impact := v_shares / GREATEST(1, v_depth);
  v_new_price := CASE WHEN p_side = 'oui'
    THEN LEAST(97, GREATEST(3, v_market.current_probability + v_impact * 100))
    ELSE LEAST(97, GREATEST(3, v_market.current_probability - v_impact * 100)) END;

  UPDATE public.market_live_state SET
    current_probability = round(v_new_price::numeric, 2),
    volume_total = volume_total + v_total, participants_count = participants_count + 1, updated_at = now()
  WHERE market_id = p_market_id;

  RETURN jsonb_build_object('new_balance', v_new_balance, 'shares', round(v_shares::numeric, 2),
    'avg_price', round((v_avg_price * 100)::numeric, 2), 'fee', round(v_fee::numeric, 2),
    'total', round(v_total::numeric, 2), 'new_market_price', round(v_new_price::numeric, 2));
END;
$$;

-- Fix demo_deposit to also ensure user_stats exists
CREATE OR REPLACE FUNCTION public.demo_deposit(p_coin text, p_network text, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Ensure rows exist
  INSERT INTO public.users (id, username, email, onboarded, welcomed, is_demo)
  VALUES (v_uid, '', '', true, true, false) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_stats (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;

  SELECT balance + p_amount INTO v_new_balance FROM public.user_stats WHERE user_id = v_uid;
  UPDATE public.user_stats SET balance = v_new_balance, deposits_count = deposits_count + 1 WHERE user_id = v_uid;

  INSERT INTO public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, status)
  VALUES (v_uid, p_coin, p_network, p_amount, p_amount, 12, 12, 'completed');

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, p_amount, COALESCE(v_new_balance, p_amount), 'deposit', p_coin || ':' || p_network);

  UPDATE public.user_stats SET xp = xp + 100 WHERE user_id = v_uid AND deposits_count = 1;

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;

-- Fix demo_withdrawal similarly
CREATE OR REPLACE FUNCTION public.demo_withdrawal(p_network text, p_address text, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  INSERT INTO public.user_stats (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_balance, 0) < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - p_amount;
  UPDATE public.user_stats SET balance = v_new_balance WHERE user_id = v_uid;

  INSERT INTO public.withdrawals (user_id, network, destination_address, amount_usd, status)
  VALUES (v_uid, p_network, p_address, p_amount, 'completed');

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, -p_amount, COALESCE(v_new_balance, 0), 'withdrawal', p_network);

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;
