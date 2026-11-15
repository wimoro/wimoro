-- Migration d'origine 20261114000005_fix_deposit — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Fix demo_deposit: don't try to insert into users table
-- The user should already exist. Just ensure user_stats exists.
CREATE OR REPLACE FUNCTION public.demo_deposit(p_coin text, p_network text, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Ensure user_stats exists (user row must already exist)
  INSERT INTO public.user_stats (user_id, balance) VALUES (v_uid, 0) ON CONFLICT (user_id) DO NOTHING;

  -- Get current balance
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  v_new_balance := COALESCE(v_balance, 0) + p_amount;

  -- Credit
  UPDATE public.user_stats SET balance = v_new_balance, deposits_count = deposits_count + 1 WHERE user_id = v_uid;

  -- Record deposit
  BEGIN
    INSERT INTO public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, status)
    VALUES (v_uid, p_coin, p_network, p_amount, p_amount, 12, 12, 'completed');
  EXCEPTION WHEN foreign_key_violation THEN
    -- User not in users table yet, skip deposit record
    NULL;
  END;

  -- Ledger
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, p_amount, v_new_balance, 'deposit', p_coin || ':' || p_network);

  -- XP for first deposit
  IF (SELECT deposits_count FROM public.user_stats WHERE user_id = v_uid) = 1 THEN
    UPDATE public.user_stats SET xp = xp + 100 WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;

-- Same fix for demo_withdrawal
CREATE OR REPLACE FUNCTION public.demo_withdrawal(p_network text, p_address text, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  INSERT INTO public.user_stats (user_id, balance) VALUES (v_uid, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_balance, 0) < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - p_amount;
  UPDATE public.user_stats SET balance = v_new_balance WHERE user_id = v_uid;

  BEGIN
    INSERT INTO public.withdrawals (user_id, network, destination_address, amount_usd, status)
    VALUES (v_uid, p_network, p_address, p_amount, 'completed');
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, -p_amount, v_new_balance, 'withdrawal', p_network);

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;
