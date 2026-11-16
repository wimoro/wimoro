-- Salon VIP, en mode Compte : réservé au rang Ascendant et aux deux rangs au-dessus, comme à l'écran.
--
--  * Écrire, relire, réagir, partager une mise ou une analyse y suivent les règles des autres salons. Un joueur d'un rang
--    inférieur reçoit « rang insuffisant ».
--  * Ses messages ne passent par aucun sujet public : ils sont diffusés sur le sujet PRIVÉ « vip », qu'une règle sur
--    realtime.messages n'ouvre qu'aux joueurs de ce rang (wm.vip_ok). Même limite que pour les clans : ce droit est vérifié
--    à l'abonnement, puis gardé jusqu'à l'expiration du jeton du joueur (une heure au plus).
--  * Les bots n'y parlent pas (dans la démo aussi, ce salon ne contient que les messages des joueurs) ; ils y réagissent.
--  * Le panel d'administration voit et peut masquer ses messages.
--  * Au passage : suivre une mise partagée demande maintenant d'avoir accès au salon où elle a été publiée (jusqu'ici, un
--    joueur extérieur à un clan pouvait suivre, par son numéro, une mise partagée dans le chat de ce clan).
-- Rien n'est supprimé.

-- Le joueur connecté a-t-il le rang du salon VIP ? Appelée par la règle d'accès ci-dessous, au nom du joueur.
create or replace function wm.vip_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.t >= 6
                   from public.user_stats s, wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r
                   where s.user_id = (select auth.uid())), false)
$$;

create policy "wm_vip_lit_son_salon" on realtime.messages for select to authenticated
  using (realtime.topic() = 'vip' and (select wm.vip_ok()));

-- Droits : une fonction appelée par une règle d'accès doit rester exécutable par le joueur connecté.
create or replace function wm.droits() returns void
language plpgsql security definer set search_path = '' as $$
declare
  visiteur text[] := array['pseudo_libre', 'markets'];     -- appelables sans être connecté
  service text[] := array['login_lookup'];                 -- Edge Functions seulement (clé de service)
  regles text[] := array['clan_sujet', 'vip_ok'];          -- appelées par une règle d'accès (RLS), au nom du joueur connecté
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
    elsif nom = any (api) or (f.nspname = 'wm' and nom = any (regles)) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ── Les salons ouverts à l'appelant : le général, ceux des marchés, celui de son clan, et le salon VIP s'il en a le rang ──
create or replace function wm.chat_salon_ok(p_room text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_room = 'general'
    or (p_room like 'm:%' and exists (select 1 from public.markets m where m.id = substr(p_room, 3)))
    or (p_room like 'clan:%' and p_room = wm.clan_sujet())
    or (p_room = 'vip' and wm.vip_ok()), false)
$$;
create or replace function wm.chat_salon(p_room text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if wm.chat_salon_ok(p_room) then return; end if;
  if p_room = 'vip' then perform wm.fail('rang_insuffisant'); end if;
  perform wm.fail('salon_indisponible');
end $$;

-- La ligne du salon, créée au premier message.
create or replace function wm.chat_salon_creer(p_room text) returns void
language sql security definer set search_path = '' as $$
  insert into public.chat_rooms (id, name, kind, market_id)
  values (p_room, case when p_room like 'm:%' then '#' || substr(p_room, 3) when p_room like 'clan:%' then 'Clan' when p_room = 'vip' then 'VIP' else 'Général' end,
          case when p_room like 'm:%' then 'market' when p_room like 'clan:%' then 'clan' when p_room = 'vip' then 'vip' else 'global' end,
          case when p_room like 'm:%' then substr(p_room, 3) end)
  on conflict (id) do nothing
$$;

-- Diffuse un événement aux lecteurs d'un salon : sujet public « salon:… », ou sujet privé (clan, VIP).
create or replace function wm.chat_diffuser(p_room text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_room like 'clan:%' or p_room = 'vip' then perform realtime.send(p_payload, p_event, p_room, true);
  else perform realtime.send(p_payload, p_event, 'salon:' || p_room, false);
  end if;
end $$;

-- Les salons que le joueur regarde (pour les bots) : ceux auxquels il a accès.
create or replace function wm.chat_seen(p_rooms text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); r text;
begin
  for r in select distinct x from unnest(coalesce(p_rooms, '{}'::text[])) x limit 6 loop
    if wm.chat_salon_ok(r) then perform wm.chat_vu(r); end if;
  end loop;
end $$;

-- ── Suivre une mise partagée : il faut avoir accès au salon où elle a été publiée ──
create or replace function wm.chat_follow(p_msg bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); s public.user_stats; m public.chat_messages; v_tier integer; v_id bigint;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 2 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Argent
  select * into m from public.chat_messages c where c.id = p_msg and c.message_type = 'bet' and c.source = 'joueur';
  if not found or m.user_id = v_uid or not wm.chat_salon_ok(m.room_id) then perform wm.fail('mise_indisponible'); end if;
  if not exists (select 1 from public.positions p where p.user_id = v_uid and p.market_id = m.bet_ref ->> 'm' and p.side = m.bet_ref ->> 's' and p.shares > 0.05) then
    perform wm.fail('position_absente');
  end if;
  insert into wm.chat_suivis (message_id, user_id) values (p_msg, v_uid) on conflict do nothing returning id into v_id;
  if v_id is null then perform wm.fail('deja_suivi'); end if;
  perform wm.chat_suivi_crediter(v_id);                                          -- si l'auteur est occupé, la tâche le créditera dans 5 secondes
  perform wm.xp_add(v_uid, 5, 'suivre');
  return wm.reponse(v_uid, jsonb_build_object('id', p_msg, 'fc', (select coalesce(c.followers_count, 0) from public.chat_messages c where c.id = p_msg)));
end $$;

-- ── Lire des instantanés d'analyse : le salon VIP se lit avec son rang ──
create or replace function wm.ana(p_msgs bigint[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_clan text := wm.clan_sujet(); v_vip boolean := wm.vip_ok(); v jsonb;
begin
  if p_msgs is null or cardinality(p_msgs) < 1 or cardinality(p_msgs) > 6 then perform wm.fail('analyse_inconnue'); end if;
  select coalesce(jsonb_object_agg(c.id::text, a.snap || jsonb_build_object('id', 'a' || a.id, 'at', (extract(epoch from a.at) * 1000)::bigint)), '{}'::jsonb) into v
  from public.chat_messages c join wm.analyses a on a.id = (c.bet_ref ->> 'ana')::bigint
  where c.id = any (p_msgs) and c.message_type = 'ana' and c.source = 'joueur'
    and (c.room_id = 'general' or c.room_id like 'm:%'
      or (c.room_id like 'clan:%' and c.room_id = v_clan)
      or (c.room_id = 'vip' and v_vip)
      or (c.room_id like 'dm:%' and v_uid::text = any (string_to_array(substr(c.room_id, 4), ':'))
          and exists (select 1 from public.friendships f where f.status = 'accepted'
                      and wm.dm_salon(f.user_id, f.friend_id) = c.room_id and v_uid in (f.user_id, f.friend_id))));
  return jsonb_build_object('snaps', v);
end $$;

-- ── Administration : le salon VIP se modère comme les autres ──
create or replace function wm.adm_chat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('msgs', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'room', c.room_id, 'u', c.user_id, 'n', u.username,
    'text', coalesce(c.text_content, ''), 'k', coalesce(c.message_type, 'msg'), 'bet', c.bet_ref,
    'at', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc, c.id desc), '[]'::jsonb))
  from (select * from public.chat_messages x where x.source = 'joueur' and (x.room_id = 'general' or x.room_id = 'vip' or x.room_id like 'm:%' or x.room_id like 'clan:%')
        order by x.created_at desc, x.id desc limit 80) c
  join public.users u on u.id = c.user_id
$$;

create or replace function wm.adm_chat_masquer(p_admin uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages;
begin
  update public.chat_messages c set source = 'masque'
  where c.id = p_id and c.source = 'joueur' and (c.room_id = 'general' or c.room_id = 'vip' or c.room_id like 'm:%' or c.room_id like 'clan:%') returning * into m;
  if not found then perform wm.fail('message_inconnu'); end if;
  perform wm.adm_note(p_admin, 'message_masque', m.user_id::text, jsonb_build_object('id', m.id, 'room', m.room_id, 'text', left(coalesce(m.text_content, ''), 280)));
  perform wm.chat_diffuser(m.room_id, 'del', jsonb_build_object('id', m.id));
  return wm.adm_chat();
end $$;

select wm.droits();
