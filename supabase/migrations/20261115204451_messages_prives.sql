-- Messages privés et sujet personnel de chaque joueur (lot 4.5, suite ; K09).
--
--  * Chaque joueur a un sujet temps réel PRIVÉ, « joueur:<son identifiant> ». Une règle sur realtime.messages n'autorise
--    que lui à s'y abonner : un message privé ou une notification ne peut donc être reçu par personne d'autre.
--  * api_dm_send(joueur, texte) : entre amis seulement, à partir du rang qui débloque les messages privés ; même anti-spam
--    et même progression que le chat public. Le message est enregistré, puis poussé sur le sujet privé du destinataire.
--  * api_dm_history(joueur) : les 60 derniers messages de la conversation, pour ses deux participants seulement.
--  * api_dm_list() : les conversations du joueur, la plus récente d'abord.
--  * Les notifications destinées à un autre joueur (demande d'ami, acceptation, message reçu) sont aussi poussées sur son
--    sujet privé : il les voit arriver sans recharger.

create policy "wm_joueur_lit_son_sujet" on realtime.messages for select to authenticated
  using (realtime.topic() = 'joueur:' || (select auth.uid())::text);

-- La liste des salons est lisible par tous : on en retire les salons privés, dont le nom porte l'identifiant des deux joueurs.
-- (Les messages privés, eux, n'ont jamais été lisibles directement : la règle de chat_messages ne couvre que les salons publics.)
alter policy "Chat rooms are publicly readable" on public.chat_rooms using (kind is distinct from 'dm');

-- ── Notifications : poussées en direct quand elles s'adressent à quelqu'un d'autre que l'appelant ──
create or replace function wm.notify(p_user uuid, p_icon text, p_code text, p_params jsonb default '{}'::jsonb, p_href text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_at timestamptz; v_n jsonb;
begin
  insert into public.notifications (user_id, icon, text, code, params, href)
  values (p_user, p_icon, '', p_code, coalesce(p_params, '{}'::jsonb), coalesce(p_href, ''))
  returning id, created_at into v_id, v_at;
  v_n := jsonb_build_object('id', v_id, 'ic', p_icon, 'code', p_code, 'p', coalesce(p_params, '{}'::jsonb), 'href', coalesce(p_href, ''),
                            'at', (extract(epoch from v_at) * 1000)::bigint, 'read', false);
  if p_user = auth.uid() then
    perform wm.ev(jsonb_build_object('k', 'notif', 'n', v_n));
  else
    perform realtime.send(jsonb_build_object('n', v_n), 'notif', 'joueur:' || p_user::text, true);
  end if;
end $$;

-- ── Messages privés ─────────────────────────────────────────────────────────────────────────────
create or replace function wm.dm_salon(a uuid, b uuid) returns text
language sql immutable set search_path = '' as $$ select 'dm:' || least(a, b)::text || ':' || greatest(a, b)::text $$;

-- Qui peut écrire à qui : un ami, et à partir du rang Bronze (le rang qui débloque les messages privés à l'écran).
create or replace function wm.dm_garde(p_moi uuid, p_autre uuid, p_ecrire boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare s public.user_stats; v_tier integer;
begin
  if p_autre is null or p_autre = p_moi or not exists (select 1 from public.users u where u.id = p_autre) then perform wm.fail('joueur_inconnu'); end if;
  if not exists (select 1 from public.friendships f where f.status = 'accepted'
                 and ((f.user_id = p_moi and f.friend_id = p_autre) or (f.user_id = p_autre and f.friend_id = p_moi))) then perform wm.fail('pas_amis'); end if;
  if p_ecrire then
    select * into s from public.user_stats where user_id = p_moi;
    select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
    if coalesce(v_tier, 0) < 1 then perform wm.fail('rang_insuffisant'); end if;
  end if;
end $$;

create or replace function wm.dm_history(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_salon text; v_msgs jsonb;
begin
  perform wm.dm_garde(v_uid, p_user, false);
  v_salon := wm.dm_salon(v_uid, p_user);
  select coalesce(jsonb_agg(wm.chat_json(d) order by d.created_at, d.id), '[]'::jsonb) into v_msgs
  from (select * from public.chat_messages c where c.room_id = v_salon and c.source = 'joueur' order by c.created_at desc, c.id desc limit 60) d;
  return jsonb_build_object('u', p_user, 'msgs', v_msgs, 'users', jsonb_build_object(p_user::text, wm.fiche(p_user)));
end $$;

create or replace function wm.dm_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  with moi as (select wm.uid() as id),
  conv as (
    select case when split_part(c.room_id, ':', 2)::uuid = moi.id then split_part(c.room_id, ':', 3)::uuid else split_part(c.room_id, ':', 2)::uuid end as autre, max(c.created_at) as dernier
    from public.chat_messages c, moi
    where c.source = 'joueur' and c.room_id like 'dm:%' and (c.room_id like 'dm:' || moi.id::text || ':%' or c.room_id like 'dm:%:' || moi.id::text)
    group by 1 order by 2 desc limit 20)
  select jsonb_build_object('ids', coalesce(jsonb_agg(conv.autre order by conv.dernier desc), '[]'::jsonb),
                            'users', coalesce(jsonb_object_agg(conv.autre::text, wm.fiche(conv.autre)), '{}'::jsonb)) from conv
$$;

create or replace function wm.dm_send(p_user uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'));
  s public.user_stats; v_salon text; v_quand timestamptz; v_avant text; n integer; m public.chat_messages; v_deja integer; v_gain integer; v_moi text;
begin
  perform wm.dm_garde(v_uid, p_user, true);
  if v_text = '' then perform wm.fail('message_vide'); end if;
  if char_length(v_text) > 280 then perform wm.fail('message_trop_long'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  -- même anti-spam que le chat public
  select c.created_at, c.text_content into v_quand, v_avant from public.chat_messages c where c.user_id = v_uid order by c.created_at desc, c.id desc limit 1;
  if found then
    if v_quand > now() - interval '1 second' then perform wm.fail('trop_vite'); end if;
    if v_avant = v_text and v_quand > now() - interval '30 seconds' then perform wm.fail('message_repete'); end if;
  end if;
  select count(*) into n from public.chat_messages c where c.user_id = v_uid and c.created_at > now() - interval '1 minute';
  if n >= 12 then perform wm.fail('trop_de_messages'); end if;

  v_salon := wm.dm_salon(v_uid, p_user);
  insert into public.chat_rooms (id, name, kind) values (v_salon, 'Privé', 'dm') on conflict (id) do nothing;
  insert into public.chat_messages (room_id, user_id, message_type, text_content, source) values (v_salon, v_uid, 'msg', v_text, 'joueur') returning * into m;
  v_deja := case when s.chat_last_date = current_date then coalesce(s.chat_xp_today, 0) else 0 end;
  v_gain := greatest(0, least(2, 20 - v_deja));
  update public.user_stats set messages_total = coalesce(messages_total, 0) + 1, chat_last_date = current_date, chat_xp_today = v_deja + v_gain where user_id = v_uid;
  if v_gain > 0 then perform wm.xp_add(v_uid, v_gain, 'chat'); end if;
  perform wm.mission_progress(v_uid, 'chat', 1);
  perform wm.badges_check(v_uid);

  -- au destinataire seulement : son sujet privé ; et une notification s'il n'en a pas déjà une, non lue, de cet expéditeur
  perform realtime.send(wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)), 'dm', 'joueur:' || p_user::text, true);
  if not exists (select 1 from public.notifications x where x.user_id = p_user and x.code = 'dm_recu' and x.params ->> 'u' = v_uid::text
                 and not coalesce(x.is_read, false) and x.deleted_at is null) then
    select username into v_moi from public.users where id = v_uid;
    perform wm.notify(p_user, 'send', 'dm_recu', jsonb_build_object('u', v_uid, 'n', v_moi), '#chat');
  end if;
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $$;

create or replace function public.api_dm_history(p_user uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.dm_history(p_user) $$;
create or replace function public.api_dm_list() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.dm_list() $$;
create or replace function public.api_dm_send(p_user uuid, p_text text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.dm_send(p_user, p_text) $$;
select wm.droits();
