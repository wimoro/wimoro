-- Migration d'origine 20261113000013_realtime_user — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Enable Realtime on user_stats and users for live admin edits
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_stats;

ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
