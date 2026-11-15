-- Migration d'origine 20261114000002_fix_market_state — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Add liquidity_depth to market_live_state
ALTER TABLE public.market_live_state ADD COLUMN IF NOT EXISTS liquidity_depth numeric(15,2) DEFAULT 400;

-- Set initial liquidity based on volume
UPDATE public.market_live_state SET liquidity_depth = GREATEST(400, volume_total * 0.006);
