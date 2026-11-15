-- Migration d'origine 20261114000001_phase1_balance_server — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- PHASE 1: Balance as Server-Side Source of Truth
-- ============================================================

-- 1. Balance ledger (audit trail)
CREATE TABLE IF NOT EXISTS public.balance_ledger (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(15,2) NOT NULL,
  balance_after numeric(15,2) NOT NULL,
  kind text NOT NULL,
  ref_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON public.balance_ledger(user_id, created_at DESC);

ALTER TABLE public.balance_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ledger" ON public.balance_ledger FOR SELECT USING (auth.uid() = user_id);

-- 2. Fix negative balances then add constraint
UPDATE public.user_stats SET balance = 0 WHERE balance < 0;

DO $$ BEGIN
  ALTER TABLE public.user_stats ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Engine constants
CREATE OR REPLACE FUNCTION public.eng_constants()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"BOOK_PCT":0.006,"BOOK_MIN":400,"LIQ_RATE":0.01,"PM_K":0.70,"RANK_DISC":0.90,"PMAX":0.99,"PMIN":0.01}'::jsonb;
$$;

-- 4. Book depth calculation
CREATE OR REPLACE FUNCTION public.book_depth(p_volume numeric, p_liq numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(400, COALESCE(p_liq, GREATEST(400, p_volume * 0.006)));
$$;

-- 5. Fee rate by category
CREATE OR REPLACE FUNCTION public.wm_fee_rate(p_category text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_category
    WHEN 'Crypto' THEN 0.07 WHEN 'Bourse' THEN 0.04 WHEN 'Tech et IA' THEN 0.04
    WHEN 'Matières' THEN 0.04 WHEN 'Devises' THEN 0.04
    ELSE 0.05
  END * 0.70;  -- PM_K = 0.70
$$;

-- 6. CORE: Place a bet (buy shares)
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF p_side NOT IN ('oui', 'non') THEN
    RAISE EXCEPTION 'Side must be oui or non';
  END IF;

  -- Lock user row to prevent race conditions
  SELECT balance INTO v_balance
  FROM public.user_stats
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- Get market state
  SELECT * INTO v_market
  FROM public.market_live_state
  WHERE market_id = p_market_id
  FOR UPDATE;

  IF v_market IS NULL THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  -- Get market category for fees
  v_fee_rate := public.wm_fee_rate(
    (SELECT category FROM public.markets WHERE id = p_market_id)
  );

  -- Calculate depth, midpoint, spread
  v_depth := public.book_depth(v_market.volume_total, v_market.liquidity_depth) * 100;
  v_mid := CASE WHEN p_side = 'oui'
    THEN v_market.current_probability / 100.0
    ELSE (100 - v_market.current_probability) / 100.0
  END;
  v_half := LEAST(1.5, GREATEST(0.1, 15 / sqrt(v_depth / 100))) / 100;
  v_a0 := LEAST(0.99, v_mid + v_half);

  -- Calculate fee first (iterative, like the JS version)
  v_total := p_amount;
  v_cost := v_total / (1 + v_fee_rate / 2);

  -- bookBuy: shares = 2*cost / (A0 + sqrt(A0^2 + 2*cost/D))
  FOR i IN 1..12 LOOP
    IF v_cost <= 0 THEN EXIT; END IF;
    v_shares := 2 * v_cost / (v_a0 + sqrt(v_a0 * v_a0 + 2 * v_cost / v_depth));
    v_avg_price := CASE WHEN v_shares > 0 THEN v_cost / v_shares ELSE v_a0 END;
    v_fee := v_cost * v_fee_rate * (1 - v_avg_price);
    v_cost := GREATEST(0, v_total - v_fee);
  END LOOP;

  -- Final calculation
  v_shares := CASE WHEN v_cost > 0
    THEN 2 * v_cost / (v_a0 + sqrt(v_a0 * v_a0 + 2 * v_cost / v_depth))
    ELSE 0 END;
  v_avg_price := CASE WHEN v_shares > 0 THEN v_cost / v_shares ELSE v_a0 END;
  v_fee := v_cost * v_fee_rate * (1 - v_avg_price);
  v_total := v_cost + v_fee;

  IF v_total <= 0 OR v_shares <= 0 THEN
    RAISE EXCEPTION 'Invalid bet calculation';
  END IF;

  -- Check balance
  IF v_balance < v_total THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Debit balance
  v_new_balance := v_balance - v_total;
  UPDATE public.user_stats SET
    balance = v_new_balance,
    bets_placed = bets_placed + 1,
    bets_max_amount = GREATEST(bets_max_amount, v_total),
    profit_realized = profit_realized - v_fee
  WHERE user_id = v_user_id;

  -- Insert ledger entry
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, -v_total, v_new_balance, 'bet', p_market_id || ':' || p_side);

  -- Upsert position
  INSERT INTO public.positions (user_id, market_id, side, shares, average_price)
  VALUES (v_user_id, p_market_id, p_side, round(v_shares::numeric, 2), round((v_avg_price * 100)::numeric, 4))
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    average_price = round(((positions.average_price * positions.shares + (v_avg_price * 100) * round(v_shares::numeric, 2)) / (positions.shares + round(v_shares::numeric, 2)))::numeric, 4),
    shares = positions.shares + round(v_shares::numeric, 2),
    updated_at = now();

  -- Update market price
  v_impact := v_shares / v_depth;
  v_new_price := CASE WHEN p_side = 'oui'
    THEN LEAST(97, GREATEST(3, v_market.current_probability + v_impact * 100))
    ELSE LEAST(97, GREATEST(3, v_market.current_probability - v_impact * 100))
  END;

  UPDATE public.market_live_state SET
    current_probability = round(v_new_price::numeric, 2),
    volume_total = volume_total + v_total,
    participants_count = participants_count + 1,
    updated_at = now()
  WHERE market_id = p_market_id;

  -- Grant XP (10 per bet)
  UPDATE public.user_stats SET xp = xp + 10 WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'new_balance', v_new_balance,
    'shares', round(v_shares::numeric, 2),
    'avg_price', round((v_avg_price * 100)::numeric, 2),
    'fee', round(v_fee::numeric, 2),
    'total', round(v_total::numeric, 2),
    'new_market_price', round(v_new_price::numeric, 2)
  );
END;
$$;

-- 7. CORE: Sell position
CREATE OR REPLACE FUNCTION public.sell_position(
  p_market_id text,
  p_side text,
  p_shares numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pos record;
  v_market record;
  v_depth numeric;
  v_mid numeric;
  v_half numeric;
  v_b0 numeric;
  v_sell_shares numeric;
  v_proceeds numeric;
  v_new_balance numeric;
  v_new_price numeric;
  v_impact numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Get position
  SELECT * INTO v_pos FROM public.positions
  WHERE user_id = v_user_id AND market_id = p_market_id AND side = p_side
  FOR UPDATE;

  IF v_pos IS NULL OR v_pos.shares <= 0 THEN
    RAISE EXCEPTION 'No position to sell';
  END IF;

  v_sell_shares := LEAST(p_shares, v_pos.shares);

  -- Get market
  SELECT * INTO v_market FROM public.market_live_state
  WHERE market_id = p_market_id FOR UPDATE;

  -- bookSell calculation
  v_depth := public.book_depth(v_market.volume_total, v_market.liquidity_depth) * 100;
  v_mid := CASE WHEN p_side = 'oui'
    THEN v_market.current_probability / 100.0
    ELSE (100 - v_market.current_probability) / 100.0
  END;
  v_half := LEAST(1.5, GREATEST(0.1, 15 / sqrt(v_depth / 100))) / 100;
  v_b0 := GREATEST(0.01, v_mid - v_half);

  -- pro = s * B0 - s^2 / (2*D)
  v_proceeds := v_sell_shares * v_b0 - (v_sell_shares * v_sell_shares) / (2 * v_depth);
  v_proceeds := GREATEST(0, v_proceeds);

  -- Credit balance
  SELECT balance INTO v_new_balance FROM public.user_stats WHERE user_id = v_user_id FOR UPDATE;
  v_new_balance := v_new_balance + v_proceeds;

  UPDATE public.user_stats SET
    balance = v_new_balance,
    profit_realized = profit_realized + v_proceeds - (v_sell_shares * v_pos.average_price / 100)
  WHERE user_id = v_user_id;

  -- Ledger
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, v_proceeds, v_new_balance, 'sell', p_market_id || ':' || p_side);

  -- Update position
  IF v_sell_shares >= v_pos.shares THEN
    DELETE FROM public.positions WHERE id = v_pos.id;
    -- Move to history
    INSERT INTO public.position_history (user_id, kind, market_id, side, was_winner, pnl)
    VALUES (v_user_id, 'sell', p_market_id, p_side, v_proceeds > (v_sell_shares * v_pos.average_price / 100),
      v_proceeds - (v_sell_shares * v_pos.average_price / 100));
  ELSE
    UPDATE public.positions SET shares = shares - v_sell_shares, updated_at = now() WHERE id = v_pos.id;
  END IF;

  -- Update market
  v_impact := v_sell_shares / v_depth;
  v_new_price := CASE WHEN p_side = 'oui'
    THEN LEAST(97, GREATEST(3, v_market.current_probability - v_impact * 100))
    ELSE LEAST(97, GREATEST(3, v_market.current_probability + v_impact * 100))
  END;

  UPDATE public.market_live_state SET
    current_probability = round(v_new_price::numeric, 2),
    volume_total = volume_total + v_proceeds,
    updated_at = now()
  WHERE market_id = p_market_id;

  RETURN jsonb_build_object(
    'new_balance', v_new_balance,
    'proceeds', round(v_proceeds::numeric, 2),
    'shares_sold', v_sell_shares,
    'new_market_price', round(v_new_price::numeric, 2)
  );
END;
$$;

-- 8. Demo deposit (credits balance immediately)
CREATE OR REPLACE FUNCTION public.demo_deposit(
  p_coin text,
  p_network text,
  p_amount numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT balance + p_amount INTO v_new_balance
  FROM public.user_stats WHERE user_id = v_user_id;

  UPDATE public.user_stats SET
    balance = v_new_balance,
    deposits_count = deposits_count + 1
  WHERE user_id = v_user_id;

  INSERT INTO public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, status)
  VALUES (v_user_id, p_coin, p_network, p_amount, p_amount, 12, 12, 'completed');

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, p_amount, v_new_balance, 'deposit', p_coin || ':' || p_network);

  -- Grant XP for first deposit
  UPDATE public.user_stats SET xp = xp + 100 WHERE user_id = v_user_id AND deposits_count = 1;

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;

-- 9. Demo withdrawal
CREATE OR REPLACE FUNCTION public.demo_withdrawal(
  p_network text,
  p_address text,
  p_amount numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_user_id FOR UPDATE;

  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE public.user_stats SET balance = v_new_balance WHERE user_id = v_user_id;

  INSERT INTO public.withdrawals (user_id, network, destination_address, amount_usd, status)
  VALUES (v_user_id, p_network, p_address, p_amount, 'completed');

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, -p_amount, v_new_balance, 'withdrawal', p_network);

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;

-- 10. Get user balance (read-only, for sync)
CREATE OR REPLACE FUNCTION public.get_my_balance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stats record;
BEGIN
  SELECT balance, xp, bets_placed, bets_won, bets_settled, bets_accuracy_pct,
         deposits_count, flash_wins, followed_bets_count, profit_realized,
         streak_current, streak_best, copiers_count, messages_total,
         rank_tier, rank_division
  INTO v_stats
  FROM public.user_stats WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'balance', v_stats.balance,
    'xp', v_stats.xp,
    'played', v_stats.bets_placed,
    'wins', v_stats.bets_won,
    'settled', v_stats.bets_settled,
    'accuracy', v_stats.bets_accuracy_pct,
    'deposits', v_stats.deposits_count,
    'flashWins', v_stats.flash_wins,
    'followed', v_stats.followed_bets_count,
    'realized', v_stats.profit_realized,
    'streak', v_stats.streak_current,
    'bestStreak', v_stats.streak_best,
    'copiers', v_stats.copiers_count,
    'msgsTotal', v_stats.messages_total,
    'rank_tier', v_stats.rank_tier,
    'rank_division', v_stats.rank_division
  );
END;
$$;
