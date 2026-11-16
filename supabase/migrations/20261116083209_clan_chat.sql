-- Chat de clan, en mode Compte : un salon réservé aux membres.
--
--  * Le salon « clan:<identifiant> » n'est ouvert qu'aux membres actuels du clan : écrire, lire l'historique, réagir,
--    partager une mise. Pour tout autre joueur, il répond « salon indisponible ».
--  * Ses messages ne passent pas par un sujet public : ils sont diffusés sur le sujet PRIVÉ « clan:<identifiant> », qu'une
--    règle sur realtime.messages n'ouvre qu'aux membres (wm.clan_sujet). Limite connue de Supabase Realtime : ce droit est
--    vérifié à l'abonnement, puis gardé jusqu'à l'expiration du jeton du joueur (une heure au plus). Un membre qui vient
--    de quitter le clan peut donc encore recevoir les nouveaux messages pendant ce délai s'il garde sa connexion ouverte ;
--    il ne peut plus ni relire l'historique, ni écrire, ni réagir.
--  * wm.chat_diffuser choisit le sujet d'un salon (public ou privé) : toutes les diffusions du chat passent par elle.
--  * À sa première ouverture, le salon reçoit les trois messages d'accueil de la démo (gabarit « C »), écrits par des bots
--    sans clan. Les bots n'y parlent pas ensuite ; ils y réagissent, comme ailleurs.
--  * Le panel d'administration voit et peut masquer les messages des salons de clan (pas les messages privés).

-- Le sujet privé du clan de l'appelant (null s'il n'en a pas). Appelée par la règle d'accès ci-dessous, au nom du joueur.
create or replace function wm.clan_sujet() returns text
language sql stable security definer set search_path = '' as $$
  select 'clan:' || m.clan_id from wm.clan_membres m where m.user_id = (select auth.uid()) and m.parti_at is null
$$;

create policy "wm_membre_lit_son_clan" on realtime.messages for select to authenticated
  using (realtime.topic() = (select wm.clan_sujet()));

-- Droits : une fonction appelée par une règle d'accès doit rester exécutable par le joueur connecté.
create or replace function wm.droits() returns void
language plpgsql security definer set search_path = '' as $$
declare
  visiteur text[] := array['pseudo_libre', 'markets'];     -- appelables sans être connecté
  service text[] := array['login_lookup'];                 -- Edge Functions seulement (clé de service)
  regles text[] := array['clan_sujet'];                    -- appelées par une règle d'accès (RLS), au nom du joueur connecté
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

-- ── Les salons ouverts à l'appelant : le général, ceux des marchés, et celui de son clan ──
create or replace function wm.chat_salon(p_room text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_room = 'general' then return; end if;
  if p_room like 'm:%' and exists (select 1 from public.markets m where m.id = substr(p_room, 3)) then return; end if;
  if p_room like 'clan:%' and p_room = wm.clan_sujet() then return; end if;
  perform wm.fail('salon_indisponible');
end $$;

-- La ligne du salon, créée au premier message.
create or replace function wm.chat_salon_creer(p_room text) returns void
language sql security definer set search_path = '' as $$
  insert into public.chat_rooms (id, name, kind, market_id)
  values (p_room, case when p_room like 'm:%' then '#' || substr(p_room, 3) when p_room like 'clan:%' then 'Clan' else 'Général' end,
          case when p_room like 'm:%' then 'market' when p_room like 'clan:%' then 'clan' else 'global' end,
          case when p_room like 'm:%' then substr(p_room, 3) end)
  on conflict (id) do nothing
$$;

-- Diffuse un événement aux lecteurs d'un salon : sujet public « salon:… », ou sujet privé du clan.
create or replace function wm.chat_diffuser(p_room text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_room like 'clan:%' then perform realtime.send(p_payload, p_event, p_room, true);
  else perform realtime.send(p_payload, p_event, 'salon:' || p_room, false);
  end if;
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
end $$;

-- ── Mises partagées : mêmes règles, diffusion par le sujet du salon ──
create or replace function wm.chat_suivi_crediter(p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare x wm.chat_suivis; m public.chat_messages; v_n integer;
begin
  select * into x from wm.chat_suivis c where c.id = p_id and c.fait_at is null for update skip locked;
  if not found then return false; end if;
  select * into m from public.chat_messages c where c.id = x.message_id;
  if not found or m.message_type <> 'bet' then return false; end if;
  perform 1 from public.user_stats where user_id = m.user_id for update skip locked;
  if not found then return false; end if;
  update wm.chat_suivis set fait_at = now() where id = x.id;
  update public.chat_messages set followers_count = coalesce(followers_count, 0) + 1 where id = m.id returning followers_count into v_n;
  update public.user_stats set followed_bets_count = coalesce(followed_bets_count, 0) + 1 where user_id = m.user_id;
  perform wm.xp_add(m.user_id, 20, 'mise_suivie');
  perform wm.badges_check(m.user_id);
  perform wm.notify_direct(m.user_id, 'users', 'mise_suivie',
    jsonb_build_object('u', x.user_id, 'n', (select u.username from public.users u where u.id = x.user_id), 'm', m.bet_ref ->> 'm', 'id', m.id, 'room', m.room_id),
    case when m.room_id like 'm:%' then '#marche-' || substr(m.room_id, 3) else '#chat' end);
  perform wm.chat_diffuser(m.room_id, 'fc', jsonb_build_object('id', m.id, 'fc', v_n));
  return true;
end $$;

create or replace function wm.chat_share(p_room text, p_market text, p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); s public.user_stats; pos public.positions; m public.chat_messages; v_tier integer; v_n integer; v_bot uuid; v_quand timestamptz;
begin
  perform wm.chat_salon(p_room);
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

  perform wm.chat_salon_creer(p_room);
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, followers_count, source)
  values (p_room, v_uid, 'bet', '', jsonb_build_object('m', p_market, 's', p_side, 'amt', round(pos.shares * pos.average_price / 100), 'price', round(pos.average_price)), 0, 'joueur')
  returning * into m;
  perform wm.xp_add(v_uid, 5, 'partage');
  perform wm.badges_check(v_uid);

  v_n := 1 + abs(hashtext(m.id::text)::bigint) % 3;                              -- un à trois joueurs la suivront, comme dans la démo
  for i in 0..v_n - 1 loop
    select u.id into v_bot from public.users u where coalesce(u.is_demo, false)
      and not exists (select 1 from wm.chat_suivis c where c.message_id = m.id and c.user_id = u.id) order by random() limit 1;
    exit when v_bot is null;
    insert into wm.chat_suivis (message_id, user_id, du_at) values (m.id, v_bot, now() + make_interval(secs => 4 + i * 5.2 + random() * 3.5)) on conflict do nothing;
  end loop;

  perform wm.chat_diffuser(p_room, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $$;

-- ── Réactions : mêmes règles, diffusion par le sujet du salon ──
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
    perform wm.chat_diffuser(v_salon, 're', jsonb_build_object('id', v_id, 'r', v_r));
  end if;
  return jsonb_build_object('id', v_id, 'r', v_r, 'my', v_my);
end $$;

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
  perform wm.chat_diffuser(p_room, 're', jsonb_build_object('id', v_idj, 'r', v_r));
end $$;

-- ── Amorce : un salon de clan reçoit, une seule fois, les trois messages d'accueil de la démo ──
create or replace function wm.chat_bots_amorce(p_room text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_msgs jsonb; v_dernier uuid; v_msg jsonb; v_min float8; v_bot uuid;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) or coalesce((cfg ->> 'chat')::float8, 1) <= 0 then return; end if;
  select b.msgs into v_msgs from wm.chat_bots b where b.room = p_room for update;
  if not found then return; end if;
  if p_room like 'clan:%' then
    if jsonb_array_length(v_msgs) > 0 or exists (select 1 from public.chat_messages c where c.room_id = p_room) then return; end if;
    for i in 0..2 loop                                                            -- des bots sans tag de clan (un sur cinq)
      select u.id into v_bot from public.users u
      where u.is_demo and abs(hashtext(u.id::text)::bigint) % 5 = 4 and u.id is distinct from v_dernier order by random() limit 1;
      exit when v_bot is null;
      perform wm.chat_bot_poser(p_room, jsonb_build_object('id', 'b' || nextval('wm.chat_bot_seq'), 'u', v_bot, 'k', 'msg', 'text', '',
        'at', (extract(epoch from now() - make_interval(mins => 12 - i * 4)) * 1000)::bigint, 'tpl', jsonb_build_object('g', 'C', 'i', i)));
      v_dernier := v_bot;
    end loop;
    return;
  end if;
  if jsonb_array_length(v_msgs) > 0 and ((v_msgs -> -1) ->> 'at')::bigint > (extract(epoch from now() - interval '20 minutes') * 1000)::bigint then return; end if;
  update wm.chat_bots b set msgs = '[]'::jsonb where b.room = p_room;
  foreach v_min in array array[14, 11, 9, 6, 4, 1.5]::float8[] loop
    v_msg := wm.chat_bot_msg(p_room, now() - make_interval(secs => v_min * 60), v_dernier);
    if v_msg is not null then perform wm.chat_bot_poser(p_room, v_msg); v_dernier := (v_msg ->> 'u')::uuid; end if;
  end loop;
end $$;

-- Le joueur a toujours ces salons à l'écran : celui de son clan compte aussi.
create or replace function wm.chat_seen(p_rooms text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); r text;
begin
  for r in select distinct x from unnest(coalesce(p_rooms, '{}'::text[])) x limit 6 loop
    if r = 'general' or (r like 'm:%' and exists (select 1 from public.markets m where m.id = substr(r, 3)))
       or (r like 'clan:%' and r = wm.clan_sujet()) then perform wm.chat_vu(r); end if;
  end loop;
end $$;

-- ── Administration : les salons de clan se modèrent comme les salons publics ──
create or replace function wm.adm_chat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('msgs', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'room', c.room_id, 'u', c.user_id, 'n', u.username,
    'text', coalesce(c.text_content, ''), 'k', coalesce(c.message_type, 'msg'), 'bet', c.bet_ref,
    'at', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc, c.id desc), '[]'::jsonb))
  from (select * from public.chat_messages x where x.source = 'joueur' and (x.room_id = 'general' or x.room_id like 'm:%' or x.room_id like 'clan:%')
        order by x.created_at desc, x.id desc limit 80) c
  join public.users u on u.id = c.user_id
$$;

create or replace function wm.adm_chat_masquer(p_admin uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages;
begin
  update public.chat_messages c set source = 'masque'
  where c.id = p_id and c.source = 'joueur' and (c.room_id = 'general' or c.room_id like 'm:%' or c.room_id like 'clan:%') returning * into m;
  if not found then perform wm.fail('message_inconnu'); end if;
  perform wm.adm_note(p_admin, 'message_masque', m.user_id::text, jsonb_build_object('id', m.id, 'room', m.room_id, 'text', left(coalesce(m.text_content, ''), 280)));
  perform wm.chat_diffuser(m.room_id, 'del', jsonb_build_object('id', m.id));
  return wm.adm_chat();
end $$;

select wm.droits();
