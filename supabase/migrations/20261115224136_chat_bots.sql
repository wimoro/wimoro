-- Messages des bots dans le chat (lot 4.5, fin ; K26).
--
-- En mode Compte, le chat ne contenait que les messages des vrais joueurs : des salons vides. Les bots y parlent
-- désormais, comme en mode Démo, avec trois règles :
--   * un message de bot n'est pas un texte : c'est un gabarit et ses paramètres ({g, i, m, p, s} : famille de phrases,
--     numéro tiré au sort, marché, prix, côté). L'écran en fait une phrase dans la langue du lecteur. Plus de messages
--     figés en français pour un lecteur anglais ou hébreu.
--   * les bots ne parlent que dans les salons qu'un joueur a à l'écran (wm.chat_bots.vu_at, rafraîchi par
--     api_chat_history puis api_chat_seen), et seulement quand un joueur est présent.
--   * aucune ligne n'est créée : chaque salon garde ses 30 derniers messages de bots dans un anneau mis à jour en place.
--     Les messages des joueurs restent dans public.chat_messages ; l'historique mêle les deux, dans l'ordre du temps.
-- Réglage : wm.config, clé « bots », champ « chat » (0 = muets, 1 = normal, jusqu'à 3).

create table if not exists wm.chat_bots (
  room text primary key,
  vu_at timestamptz not null default now(),
  msgs jsonb not null default '[]'::jsonb,
  dernier uuid
);
alter table wm.chat_bots enable row level security;
revoke all on wm.chat_bots from public, anon, authenticated;
create sequence if not exists wm.chat_bot_seq;
revoke all on sequence wm.chat_bot_seq from public, anon, authenticated;

-- Un joueur a ce salon à l'écran.
create or replace function wm.chat_vu(p_room text) returns void
language sql security definer set search_path = '' as $$
  insert into wm.chat_bots (room, vu_at) values (p_room, now())
  on conflict (room) do update set vu_at = now() where wm.chat_bots.vu_at < now() - interval '30 seconds'
$$;

-- Fabrique un message de bot pour ce salon (sans l'enregistrer). p_pas : le bot qui vient de parler, à éviter.
create or replace function wm.chat_bot_msg(p_room text, p_at timestamptz, p_pas uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_bot uuid; v_m text; v_p float8;
begin
  select u.id into v_bot from public.users u where u.is_demo and u.id is distinct from p_pas
  offset floor(random() * greatest(1, (select count(*) from public.users x where x.is_demo) - 1))::int limit 1;
  if p_room = 'general' then
    select l.market_id, l.current_probability::float8 into v_m, v_p
    from public.market_live_state l join public.markets m on m.id = l.market_id
    where coalesce(m.status, 'open') = 'open'
    order by -ln(greatest(random(), 1e-12)) / greatest(0.05, coalesce(m.heat_level, 1)::float8) limit 1;
  else
    select l.market_id, l.current_probability::float8 into v_m, v_p from public.market_live_state l where l.market_id = substr(p_room, 3);
  end if;
  if v_bot is null or v_m is null then return null; end if;
  return jsonb_build_object('id', 'b' || nextval('wm.chat_bot_seq'), 'u', v_bot, 'k', 'msg', 'text', '',
    'at', (extract(epoch from p_at) * 1000)::bigint,
    'tpl', jsonb_build_object('g', case when p_room = 'general' then 'G' else 'M' end, 'i', floor(random() * 10000)::int,
                              'm', v_m, 'p', round(v_p::numeric, 1), 's', case when random() < v_p / 100 then 1 else 0 end));
end $$;

-- Pose un message dans l'anneau du salon (30 au plus).
create or replace function wm.chat_bot_poser(p_room text, p_msg jsonb) returns void
language sql security definer set search_path = '' as $$
  update wm.chat_bots b set dernier = (p_msg ->> 'u')::uuid,
    msgs = (select coalesce(jsonb_agg(x.v order by x.o), '[]'::jsonb)
            from (select t.v, t.o from jsonb_array_elements(b.msgs || jsonb_build_array(p_msg)) with ordinality t(v, o) order by t.o desc limit 30) x)
  where b.room = p_room
$$;

-- À l'ouverture d'un salon resté silencieux (anneau vide, ou dernier message vieux de plus de 20 minutes) : six
-- messages datés des dernières minutes, pour qu'il ne s'ouvre pas vide.
create or replace function wm.chat_bots_amorce(p_room text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_msgs jsonb; v_dernier uuid; v_msg jsonb; v_min float8;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) or coalesce((cfg ->> 'chat')::float8, 1) <= 0 then return; end if;
  select b.msgs into v_msgs from wm.chat_bots b where b.room = p_room for update;
  if not found then return; end if;
  if jsonb_array_length(v_msgs) > 0 and ((v_msgs -> -1) ->> 'at')::bigint > (extract(epoch from now() - interval '20 minutes') * 1000)::bigint then return; end if;
  update wm.chat_bots b set msgs = '[]'::jsonb where b.room = p_room;
  foreach v_min in array array[14, 11, 9, 6, 4, 1.5]::float8[] loop
    v_msg := wm.chat_bot_msg(p_room, now() - make_interval(secs => v_min * 60), v_dernier);
    if v_msg is not null then perform wm.chat_bot_poser(p_room, v_msg); v_dernier := (v_msg ->> 'u')::uuid; end if;
  end loop;
end $$;

-- Historique d'un salon public : les 60 derniers messages de joueurs et l'anneau des bots, dans l'ordre du temps.
create or replace function wm.chat_history(p_room text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_msgs jsonb; v_users jsonb; v_bots jsonb;
begin
  perform wm.chat_salon(p_room);
  perform wm.chat_vu(p_room);
  perform wm.chat_bots_amorce(p_room);
  select b.msgs into v_bots from wm.chat_bots b where b.room = p_room;
  with derniers as (
    select * from public.chat_messages c where c.room_id = p_room and c.source = 'joueur' order by c.created_at desc, c.id desc limit 60),
  tout as (
    select wm.chat_json(d) as j from derniers d
    union all select t.v from jsonb_array_elements(coalesce(v_bots, '[]'::jsonb)) t(v))
  select coalesce((select jsonb_agg(t.j order by (t.j ->> 'at')::bigint, t.j ->> 'id') from tout t), '[]'::jsonb),
         coalesce((select jsonb_object_agg(a.u, wm.fiche(a.u::uuid)) from (select distinct t.j ->> 'u' as u from tout t) a), '{}'::jsonb)
  into v_msgs, v_users;
  return jsonb_build_object('room', p_room, 'msgs', v_msgs, 'users', v_users);
end $$;

-- Le joueur a toujours ces salons à l'écran (rappel envoyé avec le signal de présence, toutes les 4 minutes).
create or replace function wm.chat_seen(p_rooms text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); r text;
begin
  for r in select distinct x from unnest(coalesce(p_rooms, '{}'::text[])) x limit 6 loop
    if r = 'general' or (r like 'm:%' and exists (select 1 from public.markets m where m.id = substr(r, 3))) then perform wm.chat_vu(r); end if;
  end loop;
end $$;
create or replace function public.api_chat_seen(p_rooms text[]) returns void
language sql security invoker set search_path = '' as $$ select wm.chat_seen(p_rooms) $$;

-- Un bot parle (ou se tait) : appelé toutes les 5 secondes. Environ un message toutes les 7 secondes, réparti entre
-- les salons regardés depuis moins de 6 minutes. Rien du tout si personne n'est là.
create or replace function wm.bots_chat() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_chat float8 := greatest(0::float8, least(3::float8, coalesce((cfg ->> 'chat')::float8, 1)));
  v_room text; v_dernier uuid; v_msg jsonb;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) or v_chat <= 0 then return; end if;
  if not coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false) then return; end if;
  if random() >= 0.7 * v_chat then return; end if;
  select b.room, b.dernier into v_room, v_dernier from wm.chat_bots b
  where b.vu_at > now() - interval '6 minutes' order by random() limit 1 for update skip locked;
  if v_room is null then return; end if;
  v_msg := wm.chat_bot_msg(v_room, now(), v_dernier);
  if v_msg is null then return; end if;
  perform wm.chat_bot_poser(v_room, v_msg);
  perform realtime.send(v_msg || jsonb_build_object('f', wm.fiche((v_msg ->> 'u')::uuid)), 'msg', 'salon:' || v_room, false);
end $$;

select wm.droits();
select cron.schedule('wm-bots-chat', '5 seconds', 'select wm.bots_chat()');
