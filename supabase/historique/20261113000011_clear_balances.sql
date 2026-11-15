-- Migration d'origine 20261113000011_clear_balances — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Create a clear admin view for player balances
CREATE OR REPLACE VIEW public.admin_players_view AS
SELECT
  u.id,
  u.username,
  u.email,
  u.is_demo AS is_bot,
  '$' || to_char(s.balance, 'FM999,999,999.00') AS balance_display,
  s.balance AS balance_raw,
  s.rank_tier,
  CASE s.rank_tier
    WHEN 0 THEN 'Fer'
    WHEN 1 THEN 'Bronze'
    WHEN 2 THEN 'Argent'
    WHEN 3 THEN 'Or'
    WHEN 4 THEN 'Platine'
    WHEN 5 THEN 'Diamant'
    WHEN 6 THEN 'Ascendant'
    WHEN 7 THEN 'Immortel'
    WHEN 8 THEN 'Radiant'
  END AS rank_name,
  s.rank_division,
  s.xp,
  s.bets_placed,
  s.bets_won,
  s.bets_accuracy_pct AS accuracy,
  s.flash_wins,
  '$' || to_char(s.profit_realized, 'FM999,999,999.00') AS profit_display,
  s.profit_realized AS profit_raw,
  u.created_at
FROM public.users u
JOIN public.user_stats s ON s.user_id = u.id
ORDER BY u.is_demo ASC, s.balance DESC;

-- Drop old functions (return type changed from numeric to text)
DROP FUNCTION IF EXISTS public.admin_set_balance(text, numeric, text);

DROP FUNCTION IF EXISTS public.admin_adjust_balance(text, numeric, text);

DROP FUNCTION IF EXISTS public.admin_get_player(text);

CREATE OR REPLACE FUNCTION public.admin_set_balance(
  target_username text,
  new_balance numeric,
  adjustment_reason text DEFAULT 'Admin set balance'
)
RETURNS TABLE (
  username text,
  balance_before text,
  balance_after text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_final numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username
     OR u.email = target_username
     OR u.username ILIKE target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;
  v_final := GREATEST(0, new_balance);

  UPDATE public.user_stats SET balance = v_final WHERE user_id = v_user_id;

  UPDATE public.user_full_state
  SET state = jsonb_set(COALESCE(state, '{}'::jsonb), '{balance}', to_jsonb(v_final), true),
      updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_full_state (user_id, state)
    VALUES (v_user_id, jsonb_build_object('balance', v_final))
    ON CONFLICT (user_id) DO UPDATE SET
      state = jsonb_set(COALESCE(public.user_full_state.state, '{}'::jsonb), '{balance}', to_jsonb(v_final), true),
      updated_at = now();
  END IF;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), new_balance - v_before, adjustment_reason, v_before, v_final);

  RETURN QUERY SELECT v_username,
    '$' || to_char(v_before, 'FM999,999,999.00'),
    '$' || to_char(v_final, 'FM999,999,999.00');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  target_username text,
  adjustment numeric,
  adjustment_reason text DEFAULT 'Admin adjustment'
)
RETURNS TABLE (
  username text,
  balance_before text,
  balance_after text,
  adjustment_amount text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username
     OR u.email = target_username
     OR u.username ILIKE target_username;

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

  RETURN QUERY SELECT v_username,
    '$' || to_char(v_before, 'FM999,999,999.00'),
    '$' || to_char(v_after, 'FM999,999,999.00'),
    CASE WHEN adjustment >= 0 THEN '+' ELSE '' END || '$' || to_char(adjustment, 'FM999,999,999.00');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_player(search_term text)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  balance_display text,
  balance_raw numeric,
  rank_name text,
  rank_tier integer,
  xp integer,
  bets_placed integer,
  accuracy integer,
  flash_wins integer,
  profit_display text,
  is_bot boolean,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.username, u.email,
    '$' || to_char(s.balance, 'FM999,999,999.00'),
    s.balance,
    CASE s.rank_tier
      WHEN 0 THEN 'Fer' WHEN 1 THEN 'Bronze' WHEN 2 THEN 'Argent'
      WHEN 3 THEN 'Or' WHEN 4 THEN 'Platine' WHEN 5 THEN 'Diamant'
      WHEN 6 THEN 'Ascendant' WHEN 7 THEN 'Immortel' WHEN 8 THEN 'Radiant'
    END,
    s.rank_tier, s.xp, s.bets_placed, s.bets_accuracy_pct, s.flash_wins,
    '$' || to_char(s.profit_realized, 'FM999,999,999.00'),
    u.is_demo, u.created_at
  FROM public.users u
  JOIN public.user_stats s ON s.user_id = u.id
  WHERE u.username ILIKE '%' || search_term || '%'
     OR u.email ILIKE '%' || search_term || '%'
  ORDER BY u.is_demo ASC, u.created_at DESC
  LIMIT 20;
END;
$$;
