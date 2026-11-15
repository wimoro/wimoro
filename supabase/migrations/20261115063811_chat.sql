-- Chat (lot 4.5, première partie) : salons publics — le salon général et le salon de chaque marché.
--
--  * api_chat_history(salon) : les 60 derniers messages et la fiche publique de leurs auteurs (jamais d'e-mail).
--  * api_chat_send(salon, texte) : le serveur contrôle (salon, longueur, anti-spam), enregistre, attribue la progression
--    (2 XP par message, 20 XP par jour au plus, mission, badge) et diffuse le message aux lecteurs du salon, avec la fiche
--    de l'auteur : chacun l'affiche avec le bon pseudo et le bon rang, sans autre requête.
--  * Diffusion sur un sujet public par salon (« salon:general », « salon:m:<marché> ») : on ne s'abonne qu'au salon à l'écran.
--  * Les salons VIP, de clan et privés ne sont pas ouverts ici : ils demandent des canaux privés (lot suivant) et restent
--    annoncés comme indisponibles en mode Compte.
--  * Les anciens messages (textes figés en français écrits par les anciens bots) ne sont pas supprimés mais ne sont plus
--    servis : seuls les messages écrits par les joueurs via cette fonction le sont (colonne source).

alter table public.chat_messages add column if not exists source text not null default 'ancien';
create index if not exists idx_chat_user_date on public.chat_messages (user_id, created_at desc);
create index if not exists idx_chat_salon_joueurs on public.chat_messages (room_id, created_at desc) where source = 'joueur';

-- Le salon est-il ouvert aux joueurs connectés ? (général et marchés existants)
create or replace function wm.chat_salon(p_room text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_room = 'general' then return; end if;
  if p_room like 'm:%' and exists (select 1 from public.markets m where m.id = substr(p_room, 3)) then return; end if;
  perform wm.fail('salon_indisponible');
end $$;

create or replace function wm.chat_json(m public.chat_messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', coalesce(m.message_type, 'msg'), 'text', coalesce(m.text_content, ''),
    'at', (extract(epoch from m.created_at) * 1000)::bigint)
$$;

create or replace function wm.chat_history(p_room text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_msgs jsonb; v_users jsonb;
begin
  perform wm.chat_salon(p_room);
  with derniers as (
    select * from public.chat_messages c where c.room_id = p_room and c.source = 'joueur' order by c.created_at desc, c.id desc limit 60)
  select coalesce((select jsonb_agg(wm.chat_json(d) order by d.created_at, d.id) from derniers d), '[]'::jsonb),
         coalesce((select jsonb_object_agg(a.u::text, wm.fiche(a.u)) from (select distinct d.user_id as u from derniers d) a), '{}'::jsonb)
  into v_msgs, v_users;
  return jsonb_build_object('room', p_room, 'msgs', v_msgs, 'users', v_users);
end $$;

create or replace function wm.chat_send(p_room text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'));
  s public.user_stats; v_quand timestamptz; v_avant text; n integer; m public.chat_messages; v_deja integer; v_gain integer;
begin
  perform wm.chat_salon(p_room);
  if v_text = '' then perform wm.fail('message_vide'); end if;
  if char_length(v_text) > 280 then perform wm.fail('message_trop_long'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;            -- un message à la fois par joueur
  if not found then perform wm.fail('profil_absent'); end if;

  -- anti-spam : pas deux messages en moins d'une seconde, pas le même deux fois de suite, 12 par minute au plus
  select c.created_at, c.text_content into v_quand, v_avant from public.chat_messages c where c.user_id = v_uid order by c.created_at desc, c.id desc limit 1;
  if found then
    if v_quand > now() - interval '1 second' then perform wm.fail('trop_vite'); end if;
    if v_avant = v_text and v_quand > now() - interval '30 seconds' then perform wm.fail('message_repete'); end if;
  end if;
  select count(*) into n from public.chat_messages c where c.user_id = v_uid and c.created_at > now() - interval '1 minute';
  if n >= 12 then perform wm.fail('trop_de_messages'); end if;

  insert into public.chat_rooms (id, name, kind, market_id)
  values (p_room, case when p_room like 'm:%' then '#' || substr(p_room, 3) else 'Général' end,
          case when p_room like 'm:%' then 'market' else 'global' end, case when p_room like 'm:%' then substr(p_room, 3) end)
  on conflict (id) do nothing;
  insert into public.chat_messages (room_id, user_id, message_type, text_content, source)
  values (p_room, v_uid, 'msg', v_text, 'joueur') returning * into m;

  -- progression : 2 XP par message, 20 XP par jour au plus
  v_deja := case when s.chat_last_date = current_date then coalesce(s.chat_xp_today, 0) else 0 end;
  v_gain := greatest(0, least(2, 20 - v_deja));
  update public.user_stats set messages_total = coalesce(messages_total, 0) + 1, chat_last_date = current_date, chat_xp_today = v_deja + v_gain
  where user_id = v_uid;
  if v_gain > 0 then perform wm.xp_add(v_uid, v_gain, 'chat'); end if;
  perform wm.mission_progress(v_uid, 'chat', 1);
  if p_room like 'm:%' then perform wm.mission_progress(v_uid, 'chatm', 1); end if;
  perform wm.badges_check(v_uid);

  perform realtime.send(wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)), 'msg', 'salon:' || p_room, false);
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $$;

create or replace function public.api_chat_history(p_room text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.chat_history(p_room) $$;
create or replace function public.api_chat_send(p_room text, p_text text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.chat_send(p_room, p_text) $$;
select wm.droits();
