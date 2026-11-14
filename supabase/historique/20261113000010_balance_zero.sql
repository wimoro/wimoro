-- Migration d'origine 20261113000010_balance_zero — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- New accounts start with 0 balance (not 1M demo credits)
ALTER TABLE public.user_stats ALTER COLUMN balance SET DEFAULT 0;
