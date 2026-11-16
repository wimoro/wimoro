-- Réactions sous les messages du chat, en mode Compte.
--
-- Règles du mode Démo, tenues par le serveur : quatre réactions (🔥 👀 💸 🎯) ; un clic pose la sienne, un second la
-- retire ; le compteur est vu en direct par les lecteurs du salon (ou par l'autre participant d'une conversation privée).
-- Les bots réagissent aussi aux derniers messages des salons regardés ; quand c'est au message d'un joueur, une fois sur
-- deux il en est prévenu en direct (+1 XP), comme dans la démo.
--   * Les compteurs vivent avec le message : colonne reactions pour un message de joueur, champ r dans l'anneau du salon
--     pour un message de bot. Les bots ne créent aucune ligne.
--   * wm.chat_reactions ne garde que les réactions des vrais joueurs, pour savoir lesquelles sont les leurs. Retirer sa
--     réaction marque la ligne inactive.
--   * wm.debit : compteur d'actions par minute et par joueur (ici : 40 réactions par minute au plus).
-- Au passage : le panel d'administration reçoit le type de chaque message, pour nommer les mises partagées (texte vide).

create table if not exists wm.chat_reactions (
  room text not null,                                                        -- general, m:<marché> ou dm:<a>:<b>
  msg text not null,                                                         -- numéro d'un message de joueur, ou b<n> pour un message de bot
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  actif boolean not null default true,
  maj_at timestamptz not null default now(),
  primary key (room, msg, user_id, emoji)
);
alter table wm.chat_reactions enable row level security;
revoke all on wm.chat_reactions from public, anon, authenticated;
create index if not exists chat_reactions_joueur on wm.chat_reactions (user_id, room, maj_at desc) where actif;

create table if not exists wm.debits (
  user_id uuid not null references public.users(id) on delete cascade,
  cle text not null,
  minute timestamptz not null,
  n integer not null default 0,
  primary key (user_id, cle)
);
alter table wm.debits enable row level security;
revoke all on wm.debits from public, anon, authenticated;

-- Compte une action de plus dans la minute en cours ; au-delà de p_max, l'action est refusée.
create or replace function wm.debit(p_user uuid, p_cle text, p_max integer, p_code text default 'trop_vite') returns void
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_min timestamptz := date_trunc('minute', now());
begin
  insert into wm.debits as d (user_id, cle, minute, n) values (p_user, p_cle, v_min, 1)
  on conflict (user_id, cle) do update set n = case when d.minute = v_min then d.n + 1 else 1 end, minute = v_min
  returning d.n into v_n;
  if v_n > p_max then perform wm.fail(p_code); end if;
end $$;

-- Un message du chat : avec ses réactions, s'il en a.
create or replace function wm.chat_json(m public.chat_messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', coalesce(m.message_type, 'msg'), 'text', coalesce(m.text_content, ''),
    'at', (extract(epoch from m.created_at) * 1000)::bigint)
    || case when m.message_type = 'bet' then jsonb_build_object('bet', m.bet_ref, 'fc', coalesce(m.followers_count, 0)) else '{}'::jsonb end
    || case when coalesce(m.reactions, '{}'::jsonb) <> '{}'::jsonb then jsonb_build_object('r', m.reactions) else '{}'::jsonb end
$$;

-- Les réactions du lecteur dans un salon : { message : [réactions] } (les 200 plus récentes).
create or replace function wm.chat_mes(p_user uuid, p_salon text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.msg, x.e), '{}'::jsonb)
  from (select r.msg, jsonb_agg(r.emoji order by r.maj_at, r.emoji) as e
        from (select r0.msg, r0.emoji, r0.maj_at from wm.chat_reactions r0
              where r0.user_id = p_user and r0.room = p_salon and r0.actif order by r0.maj_at desc limit 200) r
        group by r.msg) x
$$;

-- ── Poser ou retirer sa réaction ──
create or replace function wm.chat_react(p_room text, p_msg text, p_emoji text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_salon text; v_autre uuid; v_on boolean; v_r jsonb; v_n integer; v_my jsonb; v_msgs jsonb; v_idx integer; v_id jsonb;
  m public.chat_messages;
begin
  if p_emoji is null or p_emoji not in ('🔥', '👀', '💸', '🎯') then perform wm.fail('reaction_invalide'); end if;
  if coalesce(p_room, '') like 'dm:%' then
    if substr(p_room, 4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform wm.fail('salon_indisponible'); end if;
    v_autre := substr(p_room, 4)::uuid;
    perform wm.dm_garde(v_uid, v_autre, false);
    v_salon := wm.dm_salon(v_uid, v_autre);
  else
    perform wm.chat_salon(p_room);
    v_salon := p_room;
  end if;
  perform wm.debit(v_uid, 'reaction', 40, 'trop_de_reactions');

  if coalesce(p_msg, '') ~ '^[0-9]{1,18}$' then                                   -- message d'un joueur
    select * into m from public.chat_messages c where c.id = p_msg::bigint and c.room_id = v_salon and c.source = 'joueur' for update;
    if not found then perform wm.fail('message_indisponible'); end if;
    insert into wm.chat_reactions as r (room, msg, user_id, emoji) values (v_salon, p_msg, v_uid, p_emoji)
    on conflict (room, msg, user_id, emoji) do update set actif = not r.actif, maj_at = now() returning r.actif into v_on;
    v_r := coalesce(m.reactions, '{}'::jsonb);
    v_n := greatest(0, coalesce((v_r ->> p_emoji)::integer, 0) + case when v_on then 1 else -1 end);
    v_r := case when v_n = 0 then v_r - p_emoji else jsonb_set(v_r, array[p_emoji], to_jsonb(v_n)) end;
    update public.chat_messages set reactions = v_r where id = m.id;
    v_id := to_jsonb(m.id);
  elsif coalesce(p_msg, '') ~ '^b[0-9]{1,18}$' and v_autre is null then           -- message d'un bot, dans l'anneau du salon
    select b.msgs into v_msgs from wm.chat_bots b where b.room = v_salon for update;
    select (t.o - 1)::integer, coalesce(t.v -> 'r', '{}'::jsonb) into v_idx, v_r
    from jsonb_array_elements(coalesce(v_msgs, '[]'::jsonb)) with ordinality t(v, o) where t.v ->> 'id' = p_msg;
    if v_idx is null then perform wm.fail('message_indisponible'); end if;
    insert into wm.chat_reactions as r (room, msg, user_id, emoji) values (v_salon, p_msg, v_uid, p_emoji)
    on conflict (room, msg, user_id, emoji) do update set actif = not r.actif, maj_at = now() returning r.actif into v_on;
    v_n := greatest(0, coalesce((v_r ->> p_emoji)::integer, 0) + case when v_on then 1 else -1 end);
    v_r := case when v_n = 0 then v_r - p_emoji else jsonb_set(v_r, array[p_emoji], to_jsonb(v_n)) end;
    update wm.chat_bots b set msgs = jsonb_set(v_msgs, array[v_idx::text, 'r'], v_r) where b.room = v_salon;
    v_id := to_jsonb(p_msg);
  else
    perform wm.fail('message_indisponible');
  end if;

  select coalesce(jsonb_agg(r.emoji order by r.maj_at, r.emoji), '[]'::jsonb) into v_my
  from wm.chat_reactions r where r.room = v_salon and r.msg = p_msg and r.user_id = v_uid and r.actif;
  if v_autre is not null then                                                     -- conversation privée : à l'autre participant seulement
    perform realtime.send(jsonb_build_object('id', v_id, 'r', v_r, 'u', v_uid), 're', 'joueur:' || v_autre::text, true);
  else
    perform realtime.send(jsonb_build_object('id', v_id, 'r', v_r), 're', 'salon:' || v_salon, false);
  end if;
  return jsonb_build_object('id', v_id, 'r', v_r, 'my', v_my);
end $$;

create or replace function public.api_chat_react(p_room text, p_msg text, p_emoji text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.chat_react(p_room, p_msg, p_emoji) $$;

-- ── Historiques : avec les réactions du lecteur ──
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
  return jsonb_build_object('room', p_room, 'msgs', v_msgs, 'users', v_users, 'mes', wm.chat_mes(v_uid, p_room));
end $$;

create or replace function wm.dm_history(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_salon text; v_msgs jsonb;
begin
  perform wm.dm_garde(v_uid, p_user, false);
  v_salon := wm.dm_salon(v_uid, p_user);
  select coalesce(jsonb_agg(wm.chat_json(d) order by d.created_at, d.id), '[]'::jsonb) into v_msgs
  from (select * from public.chat_messages c where c.room_id = v_salon and c.source = 'joueur' order by c.created_at desc, c.id desc limit 60) d;
  return jsonb_build_object('u', p_user, 'msgs', v_msgs, 'users', jsonb_build_object(p_user::text, wm.fiche(p_user)), 'mes', wm.chat_mes(v_uid, v_salon));
end $$;

-- ── Un bot réagit à l'un des 8 derniers messages du salon (joueurs et bots mêlés) ──
-- Une fois sur trois, de préférence au message d'un joueur ; alors, une fois sur deux, son auteur en est prévenu (+1 XP).
create or replace function wm.chat_bot_reagir(p_room text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_msgs jsonb; v_id text; v_joueur boolean; v_k text; v_auteur uuid; v_e text; v_bot uuid; v_r jsonb; v_idx integer; v_idj jsonb;
begin
  select b.msgs into v_msgs from wm.chat_bots b where b.room = p_room;
  if not found then return; end if;
  with tout as (
    select t.v ->> 'id' as id, (t.v ->> 'at')::bigint as at, false as joueur, 'msg'::text as k, null::uuid as auteur
    from jsonb_array_elements(v_msgs) t(v)
    union all
    select c.id::text, (extract(epoch from c.created_at) * 1000)::bigint, true, coalesce(c.message_type, 'msg'), c.user_id
    from (select * from public.chat_messages x where x.room_id = p_room and x.source = 'joueur' and x.created_at > now() - interval '6 hours'
          order by x.created_at desc, x.id desc limit 8) c),
  derniers as (select * from tout order by at desc, id desc limit 8),
  tirage as (select random() < 0.35 as joueur_dabord)
  select d.id, d.joueur, d.k, d.auteur into v_id, v_joueur, v_k, v_auteur
  from derniers d cross join tirage g order by (g.joueur_dabord and d.joueur) desc, random() limit 1;
  if v_id is null then return; end if;
  v_e := case when v_k = 'bet' then (array['🔥', '💸'])[1 + floor(random() * 2)::integer]
              else (array['🔥', '👀', '💸', '🎯'])[1 + floor(random() * 4)::integer] end;

  if v_joueur then
    update public.chat_messages c
    set reactions = jsonb_set(coalesce(c.reactions, '{}'::jsonb), array[v_e], to_jsonb(coalesce((c.reactions ->> v_e)::integer, 0) + 1))
    where c.id = v_id::bigint and c.source = 'joueur' returning c.reactions into v_r;
    if not found then return; end if;
    v_idj := to_jsonb(v_id::bigint);
    if random() < 0.5 then                                                        -- l'auteur occupé n'est pas attendu : pas d'annonce cette fois
      perform 1 from public.user_stats s where s.user_id = v_auteur for update skip locked;
      if found then
        select u.id into v_bot from public.users u where u.is_demo
        offset floor(random() * greatest(1, (select count(*) from public.users x where x.is_demo)))::integer limit 1;
        if v_bot is not null then
          perform wm.xp_add(v_auteur, 1, 'reaction');
          perform realtime.send(jsonb_build_object('u', v_bot, 'n', (select u.username from public.users u where u.id = v_bot), 'e', v_e, 'id', v_idj, 'room', p_room),
                                'reac', 'joueur:' || v_auteur::text, true);
        end if;
      end if;
    end if;
  else
    select (t.o - 1)::integer, coalesce(t.v -> 'r', '{}'::jsonb) into v_idx, v_r
    from jsonb_array_elements(v_msgs) with ordinality t(v, o) where t.v ->> 'id' = v_id;
    if v_idx is null then return; end if;
    v_r := jsonb_set(v_r, array[v_e], to_jsonb(coalesce((v_r ->> v_e)::integer, 0) + 1));
    update wm.chat_bots b set msgs = jsonb_set(v_msgs, array[v_idx::text, 'r'], v_r) where b.room = p_room;
    v_idj := to_jsonb(v_id);
  end if;
  perform realtime.send(jsonb_build_object('id', v_idj, 'r', v_r), 're', 'salon:' || p_room, false);
end $$;

-- Les bots dans le chat : à chaque passage, chaque salon regardé a une chance de recevoir une réaction (environ une toutes
-- les 20 secondes par salon) puis, comme avant, une chance de recevoir un message.
create or replace function wm.bots_chat() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_chat float8 := greatest(0::float8, least(3::float8, coalesce((cfg ->> 'chat')::float8, 1)));
  s record; v_msg jsonb;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) or v_chat <= 0 then return; end if;
  if not coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false) then return; end if;
  for s in select b.room, b.dernier from wm.chat_bots b where b.vu_at > now() - interval '6 minutes' order by b.vu_at desc limit 8 for update skip locked loop
    if random() < 0.25 * v_chat then perform wm.chat_bot_reagir(s.room); end if;
    continue when random() >= 0.35 * v_chat;
    v_msg := wm.chat_bot_msg(s.room, now(), s.dernier);
    continue when v_msg is null;
    perform wm.chat_bot_poser(s.room, v_msg);
    perform realtime.send(v_msg || jsonb_build_object('f', wm.fiche((v_msg ->> 'u')::uuid)), 'msg', 'salon:' || s.room, false);
  end loop;
end $$;

-- ── Administration : le type du message, pour nommer les mises partagées ──
create or replace function wm.adm_chat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('msgs', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'room', c.room_id, 'u', c.user_id, 'n', u.username,
    'text', coalesce(c.text_content, ''), 'k', coalesce(c.message_type, 'msg'), 'bet', c.bet_ref,
    'at', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc, c.id desc), '[]'::jsonb))
  from (select * from public.chat_messages x where x.source = 'joueur' and (x.room_id = 'general' or x.room_id like 'm:%') order by x.created_at desc, x.id desc limit 80) c
  join public.users u on u.id = c.user_id
$$;

select wm.droits();
