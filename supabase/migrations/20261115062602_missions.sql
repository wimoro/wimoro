-- Missions : la récompense est attribuée par le serveur (lot 4.8).
--
--  * api_mission_claim : une mission terminée et pas encore réclamée donne ses XP, une seule fois.
--  * wm.droits() n'a plus de liste de fonctions de joueurs à tenir à jour : toute fonction publique api_xxx est ouverte aux
--    joueurs connectés (avec la fonction wm.xxx qu'elle appelle), sauf celles de la liste « visiteur », ouvertes à tous.
--    Tout le reste du schéma wm reste fermé aux clients. Une nouvelle migration n'a plus qu'à appeler wm.droits().

create or replace function wm.missions_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.code, 'type', m.mission_type, 'goal', m.goal_value, 'have', m.current_progress, 'xp', m.xp_reward, 'go', m.action_href, 'claimed', m.is_claimed) order by m.created_at, m.code), '[]'::jsonb)
  from public.missions m where m.user_id = p_user and m.code is not null
$$;

create or replace function wm.mission_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_xp integer;
begin
  update public.missions set is_claimed = true
  where user_id = v_uid and code = p_id and not is_claimed and current_progress >= goal_value
  returning xp_reward into v_xp;
  if not found then perform wm.fail('mission_indisponible'); end if;                  -- inconnue, pas terminée ou déjà réclamée
  perform wm.xp_add(v_uid, v_xp, 'mission');
  perform wm.badges_check(v_uid);
  return wm.reponse(v_uid, jsonb_build_object('missions', wm.missions_json(v_uid)));
end $$;
create or replace function public.api_mission_claim(p_id text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.mission_claim(p_id) $$;

create or replace function wm.droits() returns void
language plpgsql security definer set search_path = '' as $$
declare
  visiteur text[] := array['pseudo_libre', 'markets'];     -- appelables sans être connecté
  service text[] := array['login_lookup'];                 -- Edge Functions seulement (clé de service)
  api text[]; f record; nom text;
begin
  select coalesce(array_agg(substr(p.proname, 5)), '{}') into api
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'api\_%';
  for f in
    select p.oid::regprocedure as sig, p.proname, n.nspname
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wm' or (n.nspname = 'public' and (p.proname like 'api\_%' or p.proname like 'srv\_%'))
  loop
    nom := case when f.nspname = 'wm' then f.proname else substr(f.proname, 5) end;
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'srv\_%' or (f.nspname = 'wm' and nom = any (service)) then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif nom = any (visiteur) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif nom = any (api) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
select wm.droits();
