-- Migration d'origine 20261113000008_fix_jsonb_set — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Fix: use jsonb_set with create_missing = true, and also handle rank updates

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

  -- Update structured table
  UPDATE public.user_stats SET balance = v_final WHERE user_id = v_user_id;

  -- Update JSON blob (with create_missing = true)
  UPDATE public.user_full_state
  SET state = jsonb_set(COALESCE(state, '{}'::jsonb), '{balance}', to_jsonb(v_final), true),
      updated_at = now()
  WHERE user_id = v_user_id;

  -- If no row in user_full_state, insert one
  IF NOT FOUND THEN
    INSERT INTO public.user_full_state (user_id, state)
    VALUES (v_user_id, jsonb_build_object('balance', v_final))
    ON CONFLICT (user_id) DO UPDATE SET
      state = jsonb_set(COALESCE(public.user_full_state.state, '{}'::jsonb), '{balance}', to_jsonb(v_final), true),
      updated_at = now();
  END IF;

  -- Log
  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), new_balance - v_before, adjustment_reason, v_before, v_final);

  RETURN QUERY SELECT v_username, v_before, v_final;
END;
$$;

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

  UPDATE public.user_full_state
  SET state = jsonb_set(COALESCE(state, '{}'::jsonb), '{balance}', to_jsonb(v_after), true),
      updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_full_state (user_id, state)
    VALUES (v_user_id, jsonb_build_object('balance', v_after))
    ON CONFLICT (user_id) DO UPDATE SET
      state = jsonb_set(COALESCE(public.user_full_state.state, '{}'::jsonb), '{balance}', to_jsonb(v_after), true),
      updated_at = now();
  END IF;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), adjustment, adjustment_reason, v_before, v_after);

  RETURN QUERY SELECT v_username, v_before, v_after, adjustment;
END;
$$;

-- New: admin_set_rank — also updates blob
CREATE OR REPLACE FUNCTION public.admin_set_rank(
  target_username text,
  new_tier integer,
  new_division integer DEFAULT 0
)
RETURNS TABLE (
  username text,
  old_tier integer,
  old_division integer,
  new_tier_out integer,
  new_division_out integer
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_old_tier integer;
  v_old_div integer;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username OR u.email = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.rank_tier, s.rank_division INTO v_old_tier, v_old_div
  FROM public.user_stats s WHERE s.user_id = v_user_id;

  UPDATE public.user_stats SET
    rank_tier = LEAST(8, GREATEST(0, new_tier)),
    rank_division = LEAST(2, GREATEST(0, new_division))
  WHERE user_id = v_user_id;

  -- Update blob: set xp to match tier level
  UPDATE public.user_full_state
  SET state = jsonb_set(
        jsonb_set(COALESCE(state, '{}'::jsonb), '{xp}', to_jsonb(new_tier * 900 + new_division * 300), true),
        '{balance}', COALESCE(state->'balance', to_jsonb(0)), true
      ),
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN QUERY SELECT v_username, v_old_tier, v_old_div,
    LEAST(8, GREATEST(0, new_tier)), LEAST(2, GREATEST(0, new_division));
END;
$$;

-- New: admin_set_player — update multiple fields at once
CREATE OR REPLACE FUNCTION public.admin_set_player(
  target_username text,
  p_balance numeric DEFAULT NULL,
  p_xp integer DEFAULT NULL,
  p_rank_tier integer DEFAULT NULL,
  p_rank_division integer DEFAULT NULL,
  p_bets_placed integer DEFAULT NULL,
  p_bets_won integer DEFAULT NULL,
  p_flash_wins integer DEFAULT NULL
)
RETURNS TABLE (username text, field_updated text, new_value text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username OR u.email = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  IF p_balance IS NOT NULL THEN
    UPDATE public.user_stats SET balance = p_balance WHERE user_id = v_user_id;
    UPDATE public.user_full_state SET state = jsonb_set(COALESCE(state,'{}'::jsonb), '{balance}', to_jsonb(p_balance), true), updated_at = now() WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'balance'::text, p_balance::text;
  END IF;

  IF p_xp IS NOT NULL THEN
    UPDATE public.user_stats SET xp = p_xp WHERE user_id = v_user_id;
    UPDATE public.user_full_state SET state = jsonb_set(COALESCE(state,'{}'::jsonb), '{xp}', to_jsonb(p_xp), true), updated_at = now() WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'xp'::text, p_xp::text;
  END IF;

  IF p_rank_tier IS NOT NULL THEN
    UPDATE public.user_stats SET rank_tier = LEAST(8, GREATEST(0, p_rank_tier)), rank_division = COALESCE(p_rank_division, 0) WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'rank'::text, (p_rank_tier::text || '.' || COALESCE(p_rank_division, 0)::text);
  END IF;

  IF p_bets_placed IS NOT NULL THEN
    UPDATE public.user_stats SET bets_placed = p_bets_placed WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'bets_placed'::text, p_bets_placed::text;
  END IF;

  IF p_bets_won IS NOT NULL THEN
    UPDATE public.user_stats SET bets_won = p_bets_won WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'bets_won'::text, p_bets_won::text;
  END IF;

  IF p_flash_wins IS NOT NULL THEN
    UPDATE public.user_stats SET flash_wins = p_flash_wins WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'flash_wins'::text, p_flash_wins::text;
  END IF;
END;
$$;
