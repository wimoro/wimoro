-- Migration d'origine 20261113000012_rank_names — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Admin function: set rank by NAME (not number)
-- Usage: SELECT * FROM admin_set_rank('Test12', 'Diamant');
-- Or:    SELECT * FROM admin_set_rank('<email-masque>', 'Or', 2);

DROP FUNCTION IF EXISTS public.admin_set_rank(text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_set_rank(
  target_username text,
  rank_name text,
  division integer DEFAULT 0
)
RETURNS TABLE (
  username text,
  old_rank text,
  new_rank text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_old_tier integer;
  v_old_div integer;
  v_new_tier integer;
  rank_names text[] := ARRAY['Fer','Bronze','Argent','Or','Platine','Diamant','Ascendant','Immortel','Radiant'];
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username
     OR u.email = target_username
     OR u.username ILIKE target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Joueur "%" introuvable', target_username;
  END IF;

  -- Resolve rank name to tier number
  v_new_tier := NULL;
  FOR i IN 0..8 LOOP
    IF lower(rank_names[i+1]) = lower(rank_name) THEN
      v_new_tier := i;
    END IF;
  END LOOP;

  -- Also accept numbers directly
  IF v_new_tier IS NULL AND rank_name ~ '^\d$' THEN
    v_new_tier := rank_name::integer;
  END IF;

  IF v_new_tier IS NULL OR v_new_tier < 0 OR v_new_tier > 8 THEN
    RAISE EXCEPTION 'Rang invalide "%". Utilise: Fer, Bronze, Argent, Or, Platine, Diamant, Ascendant, Immortel, Radiant', rank_name;
  END IF;

  SELECT s.rank_tier, s.rank_division INTO v_old_tier, v_old_div
  FROM public.user_stats s WHERE s.user_id = v_user_id;

  UPDATE public.user_stats SET
    rank_tier = v_new_tier,
    rank_division = LEAST(2, GREATEST(0, division)),
    xp = v_new_tier * 900 + LEAST(2, GREATEST(0, division)) * 300
  WHERE user_id = v_user_id;

  -- Sync blob
  UPDATE public.user_full_state
  SET state = jsonb_set(
    jsonb_set(COALESCE(state, '{}'::jsonb), '{xp}', to_jsonb(v_new_tier * 900 + LEAST(2, GREATEST(0, division)) * 300), true),
    '{balance}', COALESCE(state->'balance', to_jsonb(0)), true
  ), updated_at = now()
  WHERE user_id = v_user_id;

  RETURN QUERY SELECT v_username,
    rank_names[v_old_tier+1] || ' ' || CASE v_old_div WHEN 0 THEN 'I' WHEN 1 THEN 'II' ELSE 'III' END,
    rank_names[v_new_tier+1] || ' ' || CASE division WHEN 0 THEN 'I' WHEN 1 THEN 'II' ELSE 'III' END;
END;
$$;

-- Add a comment on user_stats.rank_tier for clarity in dashboard
COMMENT ON COLUMN public.user_stats.rank_tier IS '0=Fer, 1=Bronze, 2=Argent, 3=Or, 4=Platine, 5=Diamant, 6=Ascendant, 7=Immortel, 8=Radiant';

COMMENT ON COLUMN public.user_stats.rank_division IS '0=I, 1=II, 2=III';
