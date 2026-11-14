-- Migration d'origine 20261113000007_fix_admin_balance — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Fix admin functions to also update user_full_state JSON blob

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  target_username text,
  adjustment numeric,
  adjustment_reason text DEFAULT 'Admin adjustment'
)
RETURNS TABLE (
  username text,
  balance_before numeric,
  balance_after numeric,
  adjustment_amount numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username OR u.email = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;
  v_after := GREATEST(0, v_before + adjustment);

  UPDATE public.user_stats SET balance = v_after WHERE user_id = v_user_id;

  -- Also update the JSON blob
  UPDATE public.user_full_state
  SET state = jsonb_set(state, '{balance}', to_jsonb(v_after)),
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), adjustment, adjustment_reason, v_before, v_after);

  RETURN QUERY SELECT v_username, v_before, v_after, adjustment;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_balance(
  target_username text,
  new_balance numeric,
  adjustment_reason text DEFAULT 'Admin set balance'
)
RETURNS TABLE (
  username text,
  balance_before numeric,
  balance_after numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_final numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username OR u.email = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;
  v_final := GREATEST(0, new_balance);

  UPDATE public.user_stats SET balance = v_final WHERE user_id = v_user_id;

  -- Also update the JSON blob
  UPDATE public.user_full_state
  SET state = jsonb_set(state, '{balance}', to_jsonb(v_final)),
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), new_balance - v_before, adjustment_reason, v_before, v_final);

  RETURN QUERY SELECT v_username, v_before, v_final;
END;
$$;

-- Also accept email in get_player (already works but make explicit)
CREATE OR REPLACE FUNCTION public.admin_get_player(search_term text)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  balance numeric,
  xp integer,
  rank_tier integer,
  rank_division integer,
  bets_placed integer,
  bets_won integer,
  accuracy integer,
  flash_wins integer,
  profit numeric,
  is_bot boolean,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.username, u.email, s.balance, s.xp, s.rank_tier, s.rank_division,
    s.bets_placed, s.bets_won, s.bets_accuracy_pct, s.flash_wins,
    s.profit_realized, u.is_demo, u.created_at
  FROM public.users u
  JOIN public.user_stats s ON s.user_id = u.id
  WHERE u.username ILIKE '%' || search_term || '%'
     OR u.email ILIKE '%' || search_term || '%'
  ORDER BY u.is_demo ASC, u.created_at DESC
  LIMIT 20;
END;
$$;
