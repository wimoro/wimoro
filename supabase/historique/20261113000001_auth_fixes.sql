-- Migration d'origine 20261113000001_auth_fixes — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Allow authenticated users to insert their own user record (for signup flow)
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow the trigger function to insert stats/prefs (runs as SECURITY DEFINER, so already bypasses RLS)
-- But also allow direct inserts from the client for signup flow
CREATE POLICY "Service can insert user stats" ON public.user_stats
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can insert user preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (true);

-- Allow users to read their own auth accounts
CREATE POLICY "Users can insert own auth" ON public.auth_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Market price history: allow authenticated users to insert
CREATE POLICY "Authenticated users can insert price history" ON public.market_price_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Notifications: ensure insert policy exists for the sync
-- (already created in 003_rls.sql but making sure)

-- Position history: allow insert for authenticated users
-- (already created in 003_rls.sql)

-- Flash bets: allow users to insert
-- (already created in 003_rls.sql);
