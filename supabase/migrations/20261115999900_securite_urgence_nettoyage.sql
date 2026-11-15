-- Urgence sécurité, partie 2 sur 2 : nettoyage.
-- Depuis la partie 1, les clients n'ont plus le droit d'écrire dans ces tables : leurs policies d'écriture
-- sont devenues sans objet. On les retire pour que la liste des policies dise la vérité.
-- On retire aussi les profils et les statistiques de la publication temps réel (K11).

-- ── 3. Policies d'écriture devenues sans objet ─────────────────────────────────────────────────
do $$
declare p record;
begin
  for p in
    select c.relname as tbl, pol.polname as name, pol.polcmd as cmd, pg_get_expr(pol.polwithcheck, pol.polrelid) as chk
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relnamespace = 'public'::regnamespace
      and pol.polcmd in ('a', 'w', 'd')                         -- insert, update, delete
      and (
        c.relname not in ('users', 'user_full_state', 'user_preferences', 'user_following', 'user_watchlist')
        or (c.relname = 'users' and pol.polcmd = 'a')            -- le profil est créé par le trigger d'inscription
        or (c.relname = 'user_preferences' and pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true')
      )
  loop
    execute format('drop policy %I on public.%I', p.name, p.tbl);
  end loop;
end $$;

-- ── Temps réel : ne plus diffuser les profils ni les statistiques (K11) ────────────────────────
alter publication supabase_realtime drop table public.users;
alter publication supabase_realtime drop table public.user_stats;
