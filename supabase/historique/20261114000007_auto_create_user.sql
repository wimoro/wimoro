-- Migration d'origine 20261114000007_auto_create_user — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- AUTO-CREATE user row when a new Auth user signs up
-- This is the ROOT FIX for all "user not in table" errors
-- ============================================================

-- Trigger function that creates users + user_stats + user_full_state
-- when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_username text;
  v_email text;
BEGIN
  v_email := NEW.email;
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(v_email, '@', 1) || '_' || substr(NEW.id::text, 1, 4)
  );

  -- Ensure unique username
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_username := v_username || substr(md5(random()::text), 1, 3);
  END LOOP;

  -- Insert into public.users
  INSERT INTO public.users (id, username, email, avatar_color, onboarded, welcomed, is_demo)
  VALUES (NEW.id, v_username, v_email, '#2448FF', true, true, false)
  ON CONFLICT (id) DO NOTHING;

  -- user_stats and user_full_state are created by handle_new_user trigger on users table

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_created();

-- Also: fix all existing auth users that don't have a users row
INSERT INTO public.users (id, username, email, avatar_color, onboarded, welcomed, is_demo)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1) || '_' || substr(au.id::text, 1, 4)),
  au.email,
  '#2448FF',
  true,
  true,
  false
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Ensure user_stats exists for all users
INSERT INTO public.user_stats (user_id)
SELECT id FROM public.users WHERE id NOT IN (SELECT user_id FROM public.user_stats)
ON CONFLICT (user_id) DO NOTHING;

-- Ensure user_full_state exists for all users
INSERT INTO public.user_full_state (user_id, state)
SELECT id, '{}'::jsonb FROM public.users WHERE id NOT IN (SELECT user_id FROM public.user_full_state)
ON CONFLICT (user_id) DO NOTHING;
