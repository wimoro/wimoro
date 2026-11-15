-- Classement (lot 4.6, suite ; B17, K46).
--
-- api_leaderboard() : les 50 joueurs au plus grand gain réalisé, vrais joueurs et bots mêlés, sous forme de fiches
-- publiques (jamais d'e-mail). Un profil privé n'y figure pas. L'écran remplit son annuaire avec ces fiches : le
-- classement n'est plus vide en mode Compte.
-- Limite connue : le serveur ne tient qu'un gain total par joueur. Les vues « Semaine » et « Mois » de l'écran en sont
-- déduites par le même calcul qu'en mode Démo, pas par des statistiques tenues période par période.

create index if not exists idx_user_stats_profit on public.user_stats (profit_realized desc nulls last);

create or replace function wm.leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v jsonb;
begin
  select jsonb_build_object('ids', coalesce(jsonb_agg(x.id order by x.profit desc, x.id), '[]'::jsonb),
                            'users', coalesce(jsonb_object_agg(x.id::text, wm.fiche(x.id)), '{}'::jsonb)) into v
  from (select u.id, coalesce(s.profit_realized, 0) as profit
        from public.user_stats s join public.users u on u.id = s.user_id
        where u.is_public and u.id <> v_uid
        order by s.profit_realized desc nulls last, u.id limit 50) x;
  return v;
end $$;
create or replace function public.api_leaderboard() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.leaderboard() $$;
select wm.droits();
