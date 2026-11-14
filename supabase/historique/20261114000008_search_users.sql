-- Migration d'origine 20261114000008_search_users — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- Secure user search RPC for friend search
-- Returns ONLY public info: id, username, avatar_color
-- Never exposes email or private data
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_users(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, avatar_color text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, username, avatar_color
  FROM public.users
  WHERE username ILIKE '%' || trim(p_query) || '%'
    AND is_demo = false
    AND id != auth.uid()
    AND length(trim(p_query)) >= 2
  ORDER BY
    CASE WHEN username ILIKE trim(p_query) THEN 0
         WHEN username ILIKE trim(p_query) || '%' THEN 1
         ELSE 2 END,
    username
  LIMIT p_limit;
$$;
