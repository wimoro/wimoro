-- Clans en mode Compte, suite : fil d'activité, outils du chef et des officiers, appels de clan.
--
-- Règles du mode Démo (js/clans.js), tenues par le serveur :
--  · fil d'activité du clan (30 dernières lignes) : arrivées, départs, fondation, mises des membres qui l'acceptent
--    (réglage « Partager mes mises et mes gains dans le fil du clan », coché par défaut), promotions, exclusions, appels ;
--  · le chef nomme jusqu'à 5 officiers ; chef et officiers excluent un membre (un officier n'exclut qu'un simple membre),
--    invitent un ami, lancent un appel de clan (un marché et un côté, épinglés en tête du fil et annoncés dans le chat du
--    clan) ; quelques secondes plus tard, de 2 à 5 membres l'ont suivi et son auteur en est prévenu.
-- Précisions du mode Compte :
--  · un ami simulé (bot) invité rejoint aussitôt le clan, comme dans la démo ; un vrai joueur n'est jamais ajouté d'office :
--    il reçoit une notification avec le code d'invitation et rejoint, ou non, de lui-même ;
--  · un membre exclu attend 7 jours avant de rejoindre un autre clan, comme après un départ ;
--  · les « suivis » d'un appel sont simulés (au plus le nombre des autres membres) et calculés au passage de son auteur.
-- Ces fonctions demandent d'être chef ou officier : elles ne concernent donc que les clans créés par des joueurs.
-- Rien n'est supprimé.

create table if not exists wm.clan_fil (
  id bigint generated always as identity primary key,
  clan_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,   -- un compte supprimé emporte ses lignes
  code text not null,                                   -- rejoint, quitte, fonde, mise, officier, exclu, invite, appel
  params jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists clan_fil_clan on wm.clan_fil (clan_id, id desc);
create table if not exists wm.clan_appels (
  id bigint generated always as identity primary key,
  clan_id text not null,
  market_id text not null,
  side text not null check (side in ('oui', 'non')),
  par uuid not null references public.users(id) on delete cascade,
  at timestamptz not null default now(),
  suivis_at timestamptz not null,                       -- à partir de quand le nombre de suivis est connu
  suivis integer                                        -- null : pas encore calculé
);
create index if not exists clan_appels_clan on wm.clan_appels (clan_id, id desc);
alter table wm.clan_fil enable row level security;
alter table wm.clan_appels enable row level security;
revoke all on wm.clan_fil, wm.clan_appels from public, anon, authenticated;

create or replace function wm.clan_fil_poser(p_clan text, p_user uuid, p_code text, p_params jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into wm.clan_fil (clan_id, user_id, code, params) values (p_clan, p_user, p_code, coalesce(p_params, '{}'::jsonb))
$$;

-- Le clan d'un joueur, pour sa fiche : son appartenance s'il en a une (un bot invité dans un clan de joueurs en a une) ;
-- sinon, pour un bot, le clan de démonstration que lui donne son identifiant.
create or replace function wm.clan_de(p_user uuid, p_bot boolean) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.clan_id from wm.clan_membres m where m.user_id = p_user and m.parti_at is null),
                  case when coalesce(p_bot, false) and abs(hashtext(p_user::text)::bigint) % 5 <> 4 then 'c' || (61 + (abs(hashtext(p_user::text)::bigint) / 5) % 40)::text end)
$$;

-- ── Le fil se remplit tout seul : arrivées, départs, mises ──
create or replace function wm.clan_entrer(p_user uuid, p_clan text, p_role text default 'membre') returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into wm.clan_membres (user_id, clan_id, role, jour) values (p_user, p_clan, p_role, current_date);
  update wm.clan_candidatures set etat = 'annulee', fin_at = now() where user_id = p_user and etat = 'attente' and clan_id <> p_clan;
  perform wm.clan_fil_poser(p_clan, p_user, case when p_role = 'chef' then 'fonde' else 'rejoint' end);
end $$;

create or replace function wm.clan_leave() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); m wm.clan_membres; v_suivant uuid;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  update wm.clan_membres set parti_at = now() where user_id = v_uid and parti_at is null returning * into m;
  if not found then perform wm.fail('clan_absent'); end if;
  perform wm.clan_fil_poser(m.clan_id, v_uid, 'quitte');
  if m.role = 'chef' then
    select x.user_id into v_suivant from wm.clan_membres x join public.users u on u.id = x.user_id
    where x.clan_id = m.clan_id and x.parti_at is null order by coalesce(u.is_demo, false), (x.role = 'officier') desc, x.depuis limit 1;   -- un vrai joueur d'abord
    update wm.clans_joueurs set chef = v_suivant where id = m.clan_id;
    if v_suivant is not null then
      update wm.clan_membres set role = 'chef' where user_id = v_suivant and clan_id = m.clan_id and parti_at is null;
      if not exists (select 1 from public.users u where u.id = v_suivant and u.is_demo) then
        perform wm.notify_direct(v_suivant, 'shield', 'clan_chef', jsonb_build_object('id', m.clan_id), '#clan-' || m.clan_id);
      end if;
    end if;
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

create or replace function wm.clan_compter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m wm.clan_membres; v_marche text := case when new.kind in ('bet', 'copie') then split_part(new.ref_id, ':', 1) end; v_ajout numeric; v_jour numeric;
begin
  select * into m from wm.clan_membres x where x.user_id = new.user_id and x.parti_at is null;
  if not found then return null; end if;
  if v_marche is not null and exists (select 1 from wm.clan_membres x join public.positions p on p.user_id = x.user_id and p.market_id = v_marche and p.shares > 0
             where x.clan_id = m.clan_id and x.parti_at is null and x.user_id <> new.user_id) then
    update wm.clan_membres set ecartes = ecartes + 1 where id = m.id;           -- un autre membre du clan est déjà sur ce marché
    return null;
  end if;
  v_jour := case when m.jour = current_date then m.vol_jour else 0 end;
  v_ajout := greatest(0, least(2000 - v_jour, -new.amount));
  update wm.clan_membres set jour = current_date, vol_jour = v_jour + v_ajout, xp = xp + v_ajout where id = m.id;
  -- le fil du clan : la mise d'un membre sur un marché, s'il l'accepte (réglage coché par défaut)
  if new.kind = 'bet' and v_marche is not null and exists (select 1 from public.markets k where k.id = v_marche)
     and coalesce((select (up.prefs -> 'prefs' ->> 'clanFeed')::boolean from wm.user_prefs up where up.user_id = new.user_id), true) then
    perform wm.clan_fil_poser(m.clan_id, new.user_id, 'mise', jsonb_build_object('amt', round(-new.amount), 'm', v_marche));
  end if;
  return null;
end $$;

-- ── Le rôle de l'appelant dans son clan (refus s'il n'en a pas) ──
create or replace function wm.clan_moi(p_user uuid, out clan text, out role text, out joueurs boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  select m.clan_id, m.role into clan, role from wm.clan_membres m where m.user_id = p_user and m.parti_at is null;
  if not found then perform wm.fail('clan_absent'); end if;
  joueurs := exists (select 1 from wm.clans_joueurs j where j.id = clan);
end $$;

-- ── Nommer un officier (le chef, 5 officiers au plus) ──
create or replace function wm.clan_promote(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); moi record; c wm.clan_membres;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into moi from wm.clan_moi(v_uid);
  if moi.role <> 'chef' then perform wm.fail('role_insuffisant'); end if;
  perform 1 from wm.clans_joueurs j where j.id = moi.clan for update;                     -- une décision à la fois par clan
  select * into c from wm.clan_membres x where x.user_id = p_user and x.clan_id = moi.clan and x.parti_at is null for update;
  if not found or c.user_id = v_uid then perform wm.fail('membre_inconnu'); end if;
  if c.role <> 'membre' then perform wm.fail('deja_officier'); end if;
  if (select count(*) from wm.clan_membres x where x.clan_id = moi.clan and x.parti_at is null and x.role = 'officier') >= 5 then perform wm.fail('trop_d_officiers'); end if;
  update wm.clan_membres set role = 'officier' where id = c.id;
  perform wm.clan_fil_poser(moi.clan, v_uid, 'officier', jsonb_build_object('u', p_user));
  if not exists (select 1 from public.users u where u.id = p_user and u.is_demo) then
    perform wm.notify_direct(p_user, 'shield', 'clan_officier', jsonb_build_object('id', moi.clan), '#clan-' || moi.clan);
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- ── Exclure un membre (le chef : n'importe qui d'autre ; un officier : un simple membre) ──
create or replace function wm.clan_kick(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); moi record; c wm.clan_membres;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into moi from wm.clan_moi(v_uid);
  if moi.role not in ('chef', 'officier') then perform wm.fail('role_insuffisant'); end if;
  select * into c from wm.clan_membres x where x.user_id = p_user and x.clan_id = moi.clan and x.parti_at is null for update;
  if not found or c.user_id = v_uid then perform wm.fail('membre_inconnu'); end if;
  if c.role = 'chef' or (moi.role = 'officier' and c.role <> 'membre') then perform wm.fail('role_insuffisant'); end if;
  update wm.clan_membres set parti_at = now() where id = c.id;
  perform wm.clan_fil_poser(moi.clan, v_uid, 'exclu', jsonb_build_object('u', p_user));
  if not exists (select 1 from public.users u where u.id = p_user and u.is_demo) then
    perform wm.notify_direct(p_user, 'shield', 'clan_exclu', jsonb_build_object('id', moi.clan), '#clans');
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- ── Inviter un ami (chef et officiers) : un bot rejoint aussitôt ; un vrai joueur reçoit le code et décide ──
create or replace function wm.clan_invite(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); moi record; r record; v_bot boolean; v_code text; v_fait text;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into moi from wm.clan_moi(v_uid);
  if moi.role not in ('chef', 'officier') then perform wm.fail('role_insuffisant'); end if;
  if p_user is null or p_user = v_uid then perform wm.fail('joueur_inconnu'); end if;
  select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = p_user;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  if not exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = p_user) or (f.user_id = p_user and f.friend_id = v_uid))) then perform wm.fail('pas_amis'); end if;
  if exists (select 1 from wm.clan_membres x where x.user_id = p_user and x.parti_at is null) then perform wm.fail('clan_deja'); end if;
  select * into r from wm.clan_regles(moi.clan);
  if r.membres >= 50 then perform wm.fail('clan_complet'); end if;
  if v_bot then
    insert into wm.clan_membres (user_id, clan_id, role, jour) values (p_user, moi.clan, 'membre', current_date);
    perform wm.clan_fil_poser(moi.clan, p_user, 'invite', jsonb_build_object('par', v_uid));
    v_fait := 'rejoint';
  else
    if exists (select 1 from public.notifications n where n.user_id = p_user and n.code = 'clan_invite' and n.params ->> 'id' = moi.clan and n.created_at > now() - interval '1 day') then perform wm.fail('deja_invite'); end if;
    perform wm.notify_direct(p_user, 'shield', 'clan_invite', jsonb_build_object('id', moi.clan, 'u', v_uid, 'code', r.code), '#clans');
    v_fait := 'invite';
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid), 'r', v_fait));
end $$;

-- ── Appel de clan (chef et officiers) : un marché et un côté, en tête du fil et dans le chat du clan ──
create or replace function wm.clan_call(p_market text, p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); moi record; m public.chat_messages;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into moi from wm.clan_moi(v_uid);
  if moi.role not in ('chef', 'officier') then perform wm.fail('role_insuffisant'); end if;
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if not exists (select 1 from public.markets k where k.id = p_market and coalesce(k.status, 'open') = 'open') then perform wm.fail('marche_inconnu'); end if;
  if (select count(*) from wm.clan_appels a where a.clan_id = moi.clan and a.at > now() - interval '1 hour') >= 6 then perform wm.fail('trop_d_appels'); end if;
  insert into wm.clan_appels (clan_id, market_id, side, par, suivis_at) values (moi.clan, p_market, p_side, v_uid, now() + make_interval(secs => 5 + random() * 8));
  perform wm.clan_fil_poser(moi.clan, v_uid, 'appel', jsonb_build_object('m', p_market, 's', p_side));
  -- annonce dans le chat du clan : une ligne d'événement, composée à l'écran dans la langue du lecteur
  perform wm.chat_salon_creer('clan:' || moi.clan);
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source)
  values ('clan:' || moi.clan, v_uid, 'evt', '', jsonb_build_object('code', 'appel', 'm', p_market, 's', p_side), 'joueur') returning * into m;
  perform wm.chat_diffuser(m.room_id, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- Les appels de l'appelant dont le délai est passé : de 2 à 5 membres l'ont suivi (au plus les autres membres du clan).
create or replace function wm.clan_appels_avancer(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a record; v_n integer; n integer := 0;
begin
  for a in select x.id, x.clan_id, x.market_id from wm.clan_appels x where x.par = p_user and x.suivis is null and x.suivis_at <= now() order by x.id for update skip locked loop
    v_n := least(2 + (abs(hashtext('appel:' || a.id::text)::bigint) % 4)::integer,
                 greatest(0, (select count(*)::integer from wm.clan_membres m where m.clan_id = a.clan_id and m.parti_at is null) - 1));
    update wm.clan_appels set suivis = v_n where id = a.id;
    if v_n > 0 then perform wm.notify(p_user, 'users', 'clan_appel_suivi', jsonb_build_object('n', v_n, 'm', a.market_id, 'id', a.clan_id), '#clan-' || a.clan_id); end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Un message du chat : une ligne d'événement porte son code et ses paramètres.
create or replace function wm.chat_json(m public.chat_messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', coalesce(m.message_type, 'msg'), 'text', coalesce(m.text_content, ''),
    'at', (extract(epoch from m.created_at) * 1000)::bigint)
    || case when m.message_type = 'bet' then jsonb_build_object('bet', m.bet_ref, 'fc', coalesce(m.followers_count, 0)) else '{}'::jsonb end
    || case when m.message_type = 'evt' then jsonb_build_object('ev', m.bet_ref) else '{}'::jsonb end
    || case when coalesce(m.reactions, '{}'::jsonb) <> '{}'::jsonb then jsonb_build_object('r', m.reactions) else '{}'::jsonb end
$$;

-- Les bots ne réagissent pas à une ligne d'événement (elle n'affiche pas de réactions).
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
    from (select * from public.chat_messages x where x.room_id = p_room and x.source = 'joueur' and coalesce(x.message_type, 'msg') <> 'evt'
            and x.created_at > now() - interval '6 hours'
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

-- ── Ce que le joueur voit : son clan, avec son fil d'activité et ses appels ──
create or replace function wm.clan_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mien as (select m.* from wm.clan_membres m where m.user_id = p_user and m.parti_at is null),
  fil as (select f.* from wm.clan_fil f, mien where f.clan_id = mien.clan_id order by f.id desc limit 30),
  appels as (select a.* from wm.clan_appels a, mien where a.clan_id = mien.clan_id order by a.id desc limit 6)
  select jsonb_build_object(
    'mine', (select jsonb_build_object('id', m.clan_id, 'role', m.role, 'since', (extract(epoch from m.depuis) * 1000)::bigint, 'xp', m.xp,
               'jour', case when m.jour = current_date then m.vol_jour else 0 end, 'ecartes', m.ecartes) from mien m),
    'leftAt', (select (extract(epoch from max(m.parti_at)) * 1000)::bigint from wm.clan_membres m where m.user_id = p_user and m.parti_at is not null),
    'apps', coalesce((select jsonb_object_agg(c.clan_id, (extract(epoch from c.at) * 1000)::bigint) from wm.clan_candidatures c where c.user_id = p_user and c.etat = 'attente'), '{}'::jsonb),
    'clans', coalesce((select jsonb_agg(wm.clan_joueur_json(j, p_user) order by j.cree_at) from (select * from wm.clans_joueurs x order by x.cree_at desc limit 200) j), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(jsonb_build_object('u', f.user_id, 'code', f.code, 'p', f.params, 'at', (extract(epoch from f.at) * 1000)::bigint) order by f.id desc) from fil f), '[]'::jsonb),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'm', a.market_id, 's', a.side, 'by', a.par, 'at', (extract(epoch from a.at) * 1000)::bigint, 'n', coalesce(a.suivis, 0)) order by a.id desc) from appels a), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(x.u::text, wm.fiche(x.u)) from (
                select distinct m.user_id as u from wm.clan_membres m join wm.clans_joueurs j on j.id = m.clan_id where m.parti_at is null and m.user_id <> p_user
                union select f.user_id from fil f where f.user_id is not null and f.user_id <> p_user
                union select (f.params ->> 'u')::uuid from fil f where f.params ? 'u'
                union select (f.params ->> 'par')::uuid from fil f where f.params ? 'par'
                union select a.par from appels a where a.par <> p_user
                limit 400) x where x.u is not null), '{}'::jsonb))
$$;

create or replace function wm.clan() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  perform wm.clan_candidatures_avancer(v_uid);
  perform wm.clan_appels_avancer(v_uid);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

create or replace function public.api_clan_promote(p_user uuid) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_promote(p_user) $$;
create or replace function public.api_clan_kick(p_user uuid) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_kick(p_user) $$;
create or replace function public.api_clan_invite(p_user uuid) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_invite(p_user) $$;
create or replace function public.api_clan_call(p_market text, p_side text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_call(p_market, p_side) $$;

insert into wm.etat_blocs (cle, fonction, ordre, avant) values ('clan_appels', 'wm.clan_appels_avancer', 42, true)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre, avant = excluded.avant;

select wm.droits();
