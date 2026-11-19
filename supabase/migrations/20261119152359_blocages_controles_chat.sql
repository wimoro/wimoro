-- Panneau d'administration, lot 2 (19 nov. 2026), contrôles ajoutés aux fonctions existantes (4/4) : chat (blocage de tous les salons ou d'un seul, salon fermé, mode lent, mots interdits).
--
-- Chaque fonction ci-dessous est sa définition en vigueur (pg_get_functiondef), à laquelle on n'a fait qu'AJOUTER des
-- lignes marquées « [ajout] » (produites par tools/garde-fonctions.mjs, vérifiées par tests/sql/gardes.spec.mjs). Pour un
-- joueur sans blocage, hors maintenance et avec les réglages par défaut, chaque contrôle ne trouve rien et ne fait rien.
-- Les définitions d'avant sont dans backup_20261119.fonctions (lot 0).

CREATE OR REPLACE FUNCTION wm.chat_send(p_room text, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'));
  s public.user_stats; v_quand timestamptz; v_avant text; n integer; m public.chat_messages; v_deja integer; v_gain integer;
begin
  perform wm.chat_salon(p_room);
  perform wm.garde(v_uid, 'chat', p_room);   -- [ajout] blocage du chat (tous les salons ou celui-ci)
  perform wm.chat_regles(v_uid, p_room, v_text);   -- [ajout] salon fermé, mode lent, mots interdits
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

  perform wm.chat_salon_creer(p_room);
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

  perform wm.chat_diffuser(p_room, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $function$;

CREATE OR REPLACE FUNCTION wm.chat_share(p_room text, p_market text, p_side text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); s public.user_stats; pos public.positions; m public.chat_messages; v_tier integer; v_n integer; v_bot uuid; v_quand timestamptz;
  v_ami uuid; v_salon text := p_room; v_moi text;
begin
  if coalesce(p_room, '') like 'dm:%' then                                         -- conversation privée : un ami, comme pour un message
    if substr(p_room, 4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform wm.fail('salon_indisponible'); end if;
    v_ami := substr(p_room, 4)::uuid;
    perform wm.dm_garde(v_uid, v_ami, true);
    v_salon := wm.dm_salon(v_uid, v_ami);
  else
    perform wm.chat_salon(p_room);
  end if;
  perform wm.garde(v_uid, 'chat', case when v_ami is not null then 'dm' else p_room end);   -- [ajout] blocage du chat
  if v_ami is null then perform wm.chat_regles(v_uid, p_room, ''); end if;   -- [ajout] salon fermé, mode lent
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 1 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Bronze
  select * into pos from public.positions p where p.user_id = v_uid and p.market_id = p_market and p.side = p_side and p.shares > 0.05;
  if not found then perform wm.fail('position_absente'); end if;
  select max(c.created_at) into v_quand from public.chat_messages c where c.user_id = v_uid;
  if v_quand > now() - interval '1 second' then perform wm.fail('trop_vite'); end if;
  if exists (select 1 from public.chat_messages c where c.user_id = v_uid and c.message_type = 'bet' and c.bet_ref ->> 'm' = p_market and c.bet_ref ->> 's' = p_side
             and c.created_at > now() - interval '24 hours') then perform wm.fail('deja_partage'); end if;

  if v_ami is null then perform wm.chat_salon_creer(p_room);
  else insert into public.chat_rooms (id, name, kind) values (v_salon, 'Privé', 'dm') on conflict (id) do nothing;
  end if;
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, followers_count, source)
  values (v_salon, v_uid, 'bet', '', jsonb_build_object('m', p_market, 's', p_side, 'amt', round(pos.shares * pos.average_price / 100), 'price', round(pos.average_price)), 0, 'joueur')
  returning * into m;
  perform wm.xp_add(v_uid, 5, 'partage');
  perform wm.badges_check(v_uid);

  if v_ami is not null then
    -- au destinataire seulement : son sujet privé ; et une notification s'il n'en a pas déjà une, non lue, de cet expéditeur
    perform realtime.send(wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)), 'dm', 'joueur:' || v_ami::text, true);
    if not exists (select 1 from public.notifications x where x.user_id = v_ami and x.code = 'dm_recu' and x.params ->> 'u' = v_uid::text
                   and not coalesce(x.is_read, false) and x.deleted_at is null) then
      select username into v_moi from public.users where id = v_uid;
      perform wm.notify(v_ami, 'send', 'dm_recu', jsonb_build_object('u', v_uid, 'n', v_moi), '#chat');
    end if;
    return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
  end if;

  v_n := 1 + abs(hashtext(m.id::text)::bigint) % 3;                              -- un à trois joueurs la suivront, comme dans la démo
  for i in 0..v_n - 1 loop
    select u.id into v_bot from public.users u where coalesce(u.is_demo, false)
      and not exists (select 1 from wm.chat_suivis c where c.message_id = m.id and c.user_id = u.id) order by random() limit 1;
    exit when v_bot is null;
    insert into wm.chat_suivis (message_id, user_id, du_at) values (m.id, v_bot, now() + make_interval(secs => 4 + i * 5.2 + random() * 3.5)) on conflict do nothing;
  end loop;

  perform wm.chat_diffuser(p_room, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $function$;

CREATE OR REPLACE FUNCTION wm.chat_react(p_room text, p_msg text, p_emoji text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform wm.garde(v_uid, 'chat', case when v_autre is not null then 'dm' else v_salon end);   -- [ajout] blocage du chat
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
    perform wm.chat_diffuser(v_salon, 're', jsonb_build_object('id', v_id, 'r', v_r));
  end if;
  return jsonb_build_object('id', v_id, 'r', v_r, 'my', v_my);
end $function$;

CREATE OR REPLACE FUNCTION wm.ana_share(p_snap jsonb, p_rooms text[], p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'));
  s public.user_stats; v_snap jsonb; v_m text; r text; v_rooms text[] := '{}'::text[]; v_ami uuid; v_salon text; a wm.analyses; m public.chat_messages;
  v_ref jsonb; v_msgs jsonb := '{}'::jsonb; v_quand timestamptz; n integer; v_deja integer; v_gain integer; v_moi text;
begin
  if char_length(v_text) > 280 then perform wm.fail('message_trop_long'); end if;
  if p_rooms is null or cardinality(p_rooms) < 1 or cardinality(p_rooms) > 4 then perform wm.fail('salon_indisponible'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;            -- un partage à la fois par joueur
  if not found then perform wm.fail('profil_absent'); end if;
  v_snap := wm.ana_propre(p_snap);
  v_m := v_snap ->> 'm';

  -- les salons : le général, le salon du marché analysé, celui de son clan, un ami ; chacun une seule fois
  foreach r in array p_rooms loop
    if r is null or r = any (v_rooms) then perform wm.fail('salon_indisponible'); end if;
    if r like 'dm:%' then
      if v_ami is not null or substr(r, 4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform wm.fail('salon_indisponible'); end if;
      v_ami := substr(r, 4)::uuid;
      perform wm.dm_garde(v_uid, v_ami, true);
    elsif r like 'm:%' then
      if r <> 'm:' || v_m then perform wm.fail('salon_indisponible'); end if;
    else
      perform wm.chat_salon(r);
    end if;
    v_rooms := v_rooms || r;
    perform wm.garde(v_uid, 'chat', case when r like 'dm:%' then 'dm' else r end);   -- [ajout] blocage du chat
    perform wm.chat_regles(v_uid, case when r like 'dm:%' then 'dm' else r end, v_text);   -- [ajout] salon fermé, mode lent, mots interdits
  end loop;

  -- anti-spam : comme un message (pas deux en moins d'une seconde, 12 par minute), et 12 analyses par 24 heures
  select max(c.created_at) into v_quand from public.chat_messages c where c.user_id = v_uid;
  if v_quand > now() - interval '1 second' then perform wm.fail('trop_vite'); end if;
  select count(*) into n from public.chat_messages c where c.user_id = v_uid and c.created_at > now() - interval '1 minute';
  if n >= 12 then perform wm.fail('trop_de_messages'); end if;
  select count(*) into n from wm.analyses x where x.user_id = v_uid and x.at > now() - interval '24 hours';
  if n >= 12 then perform wm.fail('trop_d_analyses'); end if;

  insert into wm.analyses (user_id, market_id, snap, octets) values (v_uid, v_m, v_snap, octet_length(v_snap::text)) returning * into a;
  v_ref := jsonb_build_object('ana', a.id, 'm', v_m, 'iv', v_snap ->> 'iv', 'ni', jsonb_array_length(v_snap -> 'inds'), 'nd', jsonb_array_length(v_snap -> 'dr'));
  foreach r in array v_rooms loop
    if r like 'dm:%' then
      v_salon := wm.dm_salon(v_uid, v_ami);
      insert into public.chat_rooms (id, name, kind) values (v_salon, 'Privé', 'dm') on conflict (id) do nothing;
      insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source) values (v_salon, v_uid, 'ana', v_text, v_ref, 'joueur') returning * into m;
      -- au destinataire seulement : son sujet privé ; et une notification s'il n'en a pas déjà une, non lue, de cet expéditeur
      perform realtime.send(wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)), 'dm', 'joueur:' || v_ami::text, true);
      if not exists (select 1 from public.notifications x where x.user_id = v_ami and x.code = 'dm_recu' and x.params ->> 'u' = v_uid::text
                     and not coalesce(x.is_read, false) and x.deleted_at is null) then
        select username into v_moi from public.users where id = v_uid;
        perform wm.notify(v_ami, 'send', 'dm_recu', jsonb_build_object('u', v_uid, 'n', v_moi), '#chat');
      end if;
    else
      perform wm.chat_salon_creer(r);
      insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source) values (r, v_uid, 'ana', v_text, v_ref, 'joueur') returning * into m;
      perform wm.chat_diffuser(r, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
    end if;
    v_msgs := v_msgs || jsonb_build_object(r, wm.chat_json(m));
  end loop;

  -- progression : celle d'un message, une seule fois quel que soit le nombre de salons
  v_deja := case when s.chat_last_date = current_date then coalesce(s.chat_xp_today, 0) else 0 end;
  v_gain := greatest(0, least(2, 20 - v_deja));
  update public.user_stats set messages_total = coalesce(messages_total, 0) + 1, chat_last_date = current_date, chat_xp_today = v_deja + v_gain where user_id = v_uid;
  if v_gain > 0 then perform wm.xp_add(v_uid, v_gain, 'chat'); end if;
  perform wm.mission_progress(v_uid, 'chat', 1);
  if exists (select 1 from unnest(v_rooms) x where x like 'm:%') then perform wm.mission_progress(v_uid, 'chatm', 1); end if;
  perform wm.badges_check(v_uid);

  return wm.reponse(v_uid, jsonb_build_object('msgs', v_msgs,
    'snap', a.snap || jsonb_build_object('id', 'a' || a.id, 'at', (extract(epoch from a.at) * 1000)::bigint)));
end $function$;

CREATE OR REPLACE FUNCTION wm.dm_send(p_user uuid, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'));
  s public.user_stats; v_salon text; v_quand timestamptz; v_avant text; n integer; m public.chat_messages; v_deja integer; v_gain integer; v_moi text;
begin
  perform wm.dm_garde(v_uid, p_user, true);
  perform wm.garde(v_uid, 'chat', 'dm');   -- [ajout] blocage du chat (messages privés compris)
  perform wm.chat_regles(v_uid, 'dm', v_text);   -- [ajout] mots interdits, si le réglage vaut aussi en privé
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
end $function$;

select wm.droits();
