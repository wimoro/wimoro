-- Mode Pro : partager une analyse dans les chats, en mode Compte.
--
-- Une analyse partagée est un INSTANTANÉ du graphique : les bougies visibles, les indicateurs calculés, les tracés et un
-- commentaire. Les prix affichés par le Mode Pro sont simulés par l'écran : le serveur ne peut ni les recalculer ni les
-- vérifier. Il traite donc l'instantané pour ce qu'il est, un contenu écrit par un joueur, et le remet au propre avant de
-- le garder (wm.ana_propre) : seuls les champs connus sont repris ; chaque nombre est borné ; chaque couleur et chaque
-- réglage est vérifié ; les identifiants sont refaits ; les textes des tracés perdent tout caractère qu'un navigateur
-- pourrait lire comme du code. Un instantané refusé n'est pas gardé.
--
-- Règles (celles de la démo, js/demo.js) :
--  · l'analyse se partage dans le chat général, le chat de SON marché, le chat de son clan, ou à un ami en message privé
--    (rang Bronze, comme tout message privé) : un à quatre salons, chacun une seule fois ;
--  · elle compte comme un message : 2 XP (20 par jour au plus), missions « chat » et « chat d'un marché » ;
--  · le commentaire est facultatif (280 caractères) ;
--  · dans un salon public, un joueur simulé lui répond quelques secondes plus tard.
-- Précisions du mode Compte :
--  · le message de chat ne porte qu'une référence ; l'instantané se lit à part (api_ana), avec les mêmes droits que le
--    salon où il a été publié, et plus du tout quand le message a été masqué par l'administration ;
--  · 12 analyses par 24 heures au plus par joueur, 400 Ko au plus chacune ;
--  · la réponse du joueur simulé cite le pseudo de l'auteur : elle n'est plus servie dès que le message de l'analyse a
--    disparu (masqué par l'administration, ou parti avec le compte de son auteur).
-- Rien n'est supprimé.

create table if not exists wm.analyses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  market_id text not null,
  snap jsonb not null,                                   -- l'instantané remis au propre
  octets integer not null,
  at timestamptz not null default now()
);
create index if not exists analyses_user on wm.analyses (user_id, at desc);
alter table wm.analyses enable row level security;
revoke all on wm.analyses from public, anon, authenticated;

-- ── Remise au propre d'un instantané ──
-- Un nombre : écrit en chiffres, dans ses bornes.
create or replace function wm.ana_nombre(p jsonb, p_min numeric, p_max numeric) returns numeric
language plpgsql stable set search_path = '' as $$
declare v numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' or length(p #>> '{}') > 40 then perform wm.fail('analyse_invalide'); end if;
  v := (p #>> '{}')::numeric;
  if v < p_min or v > p_max then perform wm.fail('analyse_invalide'); end if;
  return round(v, 6);
end $$;
-- Un nombre entier.
create or replace function wm.ana_entier(p jsonb, p_min integer, p_max integer) returns integer
language plpgsql stable set search_path = '' as $$
declare v numeric := wm.ana_nombre(p, p_min, p_max);
begin
  if v <> trunc(v) then perform wm.fail('analyse_invalide'); end if;
  return v::integer;
end $$;
-- Une suite de p_n nombres (ou de vides), chacun dans ses bornes, à deux décimales comme à l'écran.
create or replace function wm.ana_serie(p jsonb, p_n integer, p_min numeric, p_max numeric) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> p_n then perform wm.fail('analyse_invalide'); end if;
  if exists (select 1 from jsonb_array_elements(p) e
             where jsonb_typeof(e) not in ('number', 'null') or (jsonb_typeof(e) = 'number' and length(e #>> '{}') > 40)) then perform wm.fail('analyse_invalide'); end if;
  if exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) = 'number' and not ((e #>> '{}')::numeric between p_min and p_max)) then perform wm.fail('analyse_invalide'); end if;
  select jsonb_agg(case when jsonb_typeof(e) = 'number' then to_jsonb(trim_scale(round((e #>> '{}')::numeric, 2))) else 'null'::jsonb end order by o) into v
  from jsonb_array_elements(p) with ordinality t(e, o);
  return v;
end $$;
-- Un point d'un tracé : [instant, prix].
create or replace function wm.ana_point(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2 then perform wm.fail('analyse_invalide'); end if;
  return jsonb_build_array(trim_scale(round(wm.ana_nombre(p -> 0, 0, 100000000000000), 0)), trim_scale(round(wm.ana_nombre(p -> 1, -1000, 1000), 4)));
end $$;
-- Une couleur : l'encre du thème, ou six chiffres hexadécimaux.
create or replace function wm.ana_couleur(p jsonb) returns text
language plpgsql stable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'string' or (p #>> '{}') !~ '^(ink|#[0-9a-fA-F]{6})$' then perform wm.fail('analyse_invalide'); end if;
  return p #>> '{}';
end $$;
-- Le texte d'un tracé : une ligne de 60 caractères au plus, sans aucun caractère qu'un navigateur pourrait lire comme du
-- code (chevrons, guillemets droits, apostrophe droite, accent grave, barre oblique inverse : remplacés par leur
-- équivalent typographique ; caractères de contrôle : retirés).
create or replace function wm.ana_texte(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(regexp_replace(translate(coalesce(p, ''), '<>"`' || chr(92) || chr(39), '‹›”’/’'), '[[:cntrl:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g')), 60)
$$;

create or replace function wm.ana_propre(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_m text; v_iv text; v_prix numeric; v_n integer; v_vn numeric; v_ms numeric; d jsonb; v_o bigint; k text; v_p jsonb; v_vals jsonb; v_cles text[]; c text;
  v_inds jsonb := '[]'::jsonb; v_dr jsonb := '[]'::jsonb; v_un jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then perform wm.fail('analyse_invalide'); end if;
  if octet_length(p::text) > 400000 then perform wm.fail('analyse_trop_lourde'); end if;
  v_m := p ->> 'm';
  if v_m is null or not exists (select 1 from public.markets x where x.id = v_m) then perform wm.fail('marche_inconnu'); end if;
  select round(l.current_probability, 2) into v_prix from public.market_live_state l where l.market_id = v_m;   -- le prix du serveur au moment du partage
  v_iv := p ->> 'iv';
  if v_iv is null or v_iv not in ('1m', '5m', '15m', '1h', '4h', '1d', '1w', 'max') then perform wm.fail('analyse_invalide'); end if;
  if coalesce(p ->> 'type', '') not in ('courbe', 'bougies') or coalesce(p ->> 'side', '') not in ('oui', 'non') then perform wm.fail('analyse_invalide'); end if;
  v_n := wm.ana_entier(p -> 'n', 1, 4000);
  v_vn := wm.ana_nombre(p -> 'vn', 1, 8000);
  v_ms := wm.ana_nombre(p -> 'ms', 60000, 604800000);
  if v_ms not in (60000, 300000, 900000, 3600000, 14400000, 86400000, 604800000) then perform wm.fail('analyse_invalide'); end if;

  -- indicateurs : la sorte, ses réglages dans leurs bornes, ses valeurs calculées (une suite par courbe)
  if p -> 'inds' is null or jsonb_typeof(p -> 'inds') <> 'array' or jsonb_array_length(p -> 'inds') > 24 then perform wm.fail('analyse_invalide'); end if;
  for d, v_o in select t.e, t.o from jsonb_array_elements(p -> 'inds') with ordinality t(e, o) order by t.o loop
    if jsonb_typeof(d) <> 'object' then perform wm.fail('analyse_invalide'); end if;
    k := d ->> 'k';
    if k is null or k not in ('sma', 'ema', 'bb', 'vwap', 'rsi', 'macd') then perform wm.fail('analyse_invalide'); end if;
    if k in ('sma', 'ema', 'rsi') then v_p := jsonb_build_object('len', wm.ana_entier(d #> '{p,len}', 2, 400));
    elsif k = 'bb' then v_p := jsonb_build_object('len', wm.ana_entier(d #> '{p,len}', 2, 400), 'k', trim_scale(round(wm.ana_nombre(d #> '{p,k}', 0.5, 5), 1)));
    elsif k = 'macd' then
      v_p := jsonb_build_object('fast', wm.ana_entier(d #> '{p,fast}', 2, 200), 'slow', wm.ana_entier(d #> '{p,slow}', 3, 400), 'sig', wm.ana_entier(d #> '{p,sig}', 2, 100));
      if (v_p ->> 'slow')::integer <= (v_p ->> 'fast')::integer then perform wm.fail('analyse_invalide'); end if;
    else
      if coalesce(d #>> '{p,anc}', '') not in ('auto', 'day', 'week', 'all') then perform wm.fail('analyse_invalide'); end if;
      v_p := jsonb_build_object('anc', d #>> '{p,anc}');
    end if;
    v_cles := case when k in ('bb', 'macd') then array['a', 'b', 'c'] else array['a'] end;
    if d -> 'vals' is null or jsonb_typeof(d -> 'vals') <> 'object' or (select count(*) from jsonb_object_keys(d -> 'vals')) <> cardinality(v_cles) then perform wm.fail('analyse_invalide'); end if;
    v_vals := '{}'::jsonb;
    foreach c in array v_cles loop v_vals := v_vals || jsonb_build_object(c, wm.ana_serie(d -> 'vals' -> c, v_n, -1000000, 1000000)); end loop;
    v_inds := v_inds || jsonb_build_array(jsonb_build_object('id', 'i' || v_o, 'k', k, 'p', v_p, 'c', wm.ana_couleur(d -> 'c'), 'w', wm.ana_entier(d -> 'w', 1, 3), 'vals', v_vals));
  end loop;

  -- tracés : la sorte, un ou deux points, une couleur, une épaisseur, un texte court
  if p -> 'dr' is null or jsonb_typeof(p -> 'dr') <> 'array' or jsonb_array_length(p -> 'dr') > 300 then perform wm.fail('analyse_invalide'); end if;
  for d, v_o in select t.e, t.o from jsonb_array_elements(p -> 'dr') with ordinality t(e, o) order by t.o loop
    if jsonb_typeof(d) <> 'object' then perform wm.fail('analyse_invalide'); end if;
    k := d ->> 'k';
    if k is null or k not in ('trend', 'hline', 'vline', 'rect', 'arrow', 'text', 'level') then perform wm.fail('analyse_invalide'); end if;
    if d -> 'txt' is not null and jsonb_typeof(d -> 'txt') not in ('string', 'null') then perform wm.fail('analyse_invalide'); end if;
    v_un := jsonb_build_object('id', 'd' || v_o, 'k', k, 'a', wm.ana_point(d -> 'a'), 'c', wm.ana_couleur(d -> 'c'), 'w', wm.ana_entier(d -> 'w', 1, 3), 'txt', wm.ana_texte(d ->> 'txt'));
    if k in ('trend', 'arrow', 'rect') then v_un := v_un || jsonb_build_object('b', wm.ana_point(d -> 'b')); end if;
    v_dr := v_dr || jsonb_build_array(v_un);
  end loop;

  return jsonb_build_object('v', 1, 'm', v_m, 'iv', v_iv, 'type', p ->> 'type', 'side', p ->> 'side', 'p', trim_scale(v_prix),
    'ms', trim_scale(v_ms), 'T0', trim_scale(round(wm.ana_nombre(p -> 'T0', 946684800000, (extract(epoch from now()) * 1000)::numeric + 34560000000), 0)), 'n', v_n,
    'o', wm.ana_serie(p -> 'o', v_n, 0, 100), 'h', wm.ana_serie(p -> 'h', v_n, 0, 100), 'l', wm.ana_serie(p -> 'l', v_n, 0, 100), 'c', wm.ana_serie(p -> 'c', v_n, 0, 100),
    'vol', wm.ana_serie(p -> 'vol', v_n, 0, 10000000000000),
    'end', trim_scale(round(wm.ana_nombre(p -> 'end', 0, v_n + v_vn), 4)), 'vn', trim_scale(round(v_vn, 4)), 'inds', v_inds, 'dr', v_dr);
end $$;

-- ── Un message du chat : une analyse porte sa référence (l'instantané se lit à part) ──
create or replace function wm.chat_json(m public.chat_messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', coalesce(m.message_type, 'msg'), 'text', coalesce(m.text_content, ''),
    'at', (extract(epoch from m.created_at) * 1000)::bigint)
    || case when m.message_type = 'bet' then jsonb_build_object('bet', m.bet_ref, 'fc', coalesce(m.followers_count, 0)) else '{}'::jsonb end
    || case when m.message_type = 'evt' then jsonb_build_object('ev', m.bet_ref) else '{}'::jsonb end
    || case when m.message_type = 'ana' then jsonb_build_object('ana', m.bet_ref) else '{}'::jsonb end
    || case when coalesce(m.reactions, '{}'::jsonb) <> '{}'::jsonb then jsonb_build_object('r', m.reactions) else '{}'::jsonb end
$$;

-- ── Partager une analyse ──
create or replace function wm.ana_share(p_snap jsonb, p_rooms text[], p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── Lire des instantanés : par leurs messages, avec les droits du salon de chaque message ──
create or replace function wm.ana(p_msgs bigint[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_clan text := wm.clan_sujet(); v jsonb;
begin
  if p_msgs is null or cardinality(p_msgs) < 1 or cardinality(p_msgs) > 6 then perform wm.fail('analyse_inconnue'); end if;
  select coalesce(jsonb_object_agg(c.id::text, a.snap || jsonb_build_object('id', 'a' || a.id, 'at', (extract(epoch from a.at) * 1000)::bigint)), '{}'::jsonb) into v
  from public.chat_messages c join wm.analyses a on a.id = (c.bet_ref ->> 'ana')::bigint
  where c.id = any (p_msgs) and c.message_type = 'ana' and c.source = 'joueur'
    and (c.room_id = 'general' or c.room_id like 'm:%'
      or (c.room_id like 'clan:%' and c.room_id = v_clan)
      or (c.room_id like 'dm:%' and v_uid::text = any (string_to_array(substr(c.room_id, 4), ':'))
          and exists (select 1 from public.friendships f where f.status = 'accepted'
                      and wm.dm_salon(f.user_id, f.friend_id) = c.room_id and v_uid in (f.user_id, f.friend_id))));
  return jsonb_build_object('snaps', v);
end $$;

create or replace function public.api_ana_share(p_snap jsonb, p_rooms text[], p_text text default '') returns jsonb
language sql security invoker set search_path = '' as $$ select wm.ana_share(p_snap, p_rooms, p_text) $$;
create or replace function public.api_ana(p_msgs bigint[]) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.ana(p_msgs) $$;

-- ── Les bots dans le chat : dans un salon public, l'analyse d'un joueur reçoit d'abord la réponse d'un joueur simulé ──
-- (trois secondes à deux minutes après le partage, une seule fois par message ; l'écran compose la phrase, gabarit « A »).
create or replace function wm.bots_chat() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_chat float8 := greatest(0::float8, least(3::float8, coalesce((cfg ->> 'chat')::float8, 1)));
  s record; v_msg jsonb; v_ana bigint; v_auteur text; v_bot uuid;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) or v_chat <= 0 then return; end if;
  if not coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false) then return; end if;
  for s in select b.room, b.dernier from wm.chat_bots b where b.vu_at > now() - interval '6 minutes' order by b.vu_at desc limit 8 for update skip locked loop
    if s.room = 'general' or s.room like 'm:%' then
      select c.id, u.username into v_ana, v_auteur from public.chat_messages c join public.users u on u.id = c.user_id
      where c.room_id = s.room and c.message_type = 'ana' and c.source = 'joueur' and not (c.bet_ref ? 'rep')
        and c.created_at between now() - interval '2 minutes' and now() - interval '3 seconds'
      order by c.created_at, c.id limit 1;
      if found then
        update public.chat_messages set bet_ref = bet_ref || jsonb_build_object('rep', 1) where id = v_ana;
        select u.id into v_bot from public.users u where u.is_demo and u.id is distinct from s.dernier
        offset floor(random() * greatest(1, (select count(*) from public.users x where x.is_demo) - 1))::int limit 1;
        if v_bot is not null then
          v_msg := jsonb_build_object('id', 'b' || nextval('wm.chat_bot_seq'), 'u', v_bot, 'k', 'msg', 'text', '',
            'at', (extract(epoch from now()) * 1000)::bigint, 'tpl', jsonb_build_object('g', 'A', 'i', floor(random() * 10000)::int, 'n', v_auteur, 'a', v_ana));
          perform wm.chat_bot_poser(s.room, v_msg);
          perform realtime.send(v_msg || jsonb_build_object('f', wm.fiche(v_bot)), 'msg', 'salon:' || s.room, false);
        end if;
        continue;
      end if;
    end if;
    if random() < 0.25 * v_chat then perform wm.chat_bot_reagir(s.room); end if;
    continue when random() >= 0.35 * v_chat;
    v_msg := wm.chat_bot_msg(s.room, now(), s.dernier);
    continue when v_msg is null;
    perform wm.chat_bot_poser(s.room, v_msg);
    perform realtime.send(v_msg || jsonb_build_object('f', wm.fiche((v_msg ->> 'u')::uuid)), 'msg', 'salon:' || s.room, false);
  end loop;
end $$;

-- ── Historique d'un salon : la réponse à une analyse suit le sort de cette analyse ──
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
    union all select t.v from jsonb_array_elements(coalesce(v_bots, '[]'::jsonb)) t(v)
    where coalesce(t.v -> 'tpl' ->> 'g', '') <> 'A'
       or exists (select 1 from public.chat_messages c where c.id = (t.v -> 'tpl' ->> 'a')::bigint and c.room_id = p_room and c.source = 'joueur'))
  select coalesce((select jsonb_agg(t.j order by (t.j ->> 'at')::bigint, t.j ->> 'id') from tout t), '[]'::jsonb),
         coalesce((select jsonb_object_agg(a.u, wm.fiche(a.u::uuid)) from (select distinct t.j ->> 'u' as u from tout t) a), '{}'::jsonb)
  into v_msgs, v_users;
  return jsonb_build_object('room', p_room, 'msgs', v_msgs, 'users', v_users, 'mes', wm.chat_mes(v_uid, p_room));
end $$;

select wm.droits();
