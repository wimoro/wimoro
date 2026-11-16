-- Clans en mode Compte : appartenance, création, contribution.
--
-- Règles du mode Démo (js/clans.js), tenues par le serveur :
--  · l'annuaire des 100 clans de démonstration est celui de l'écran (mêmes identifiants, tags, accès, rang minimum, codes) ;
--  · rejoindre un clan ouvert, ou tout clan avec son code d'invitation ; candidater à un clan « sur candidature » (réponse
--    d'un officier au bout de quelques secondes, favorable 8 fois sur 10, comme dans la démo) ; un seul clan à la fois ;
--    50 membres au plus ; quitter impose 7 jours d'attente avant d'en rejoindre un autre ;
--  · créer un clan : rang Argent, compte de plus de 14 jours, 50 $ de frais non remboursables, nom de 3 à 28 caractères,
--    tag de 3 ou 4 lettres ou chiffres, unique ;
--  · contribution : le volume misé par un membre, plafonné à 2 000 $ par jour, devient son XP de clan ; une mise sur un
--    marché où un autre membre du même clan a déjà une position ne compte pas ;
--  · le tag du clan suit le joueur partout (fiche publique). Les bots portent, comme dans la démo, le tag d'un clan.
-- Restent indisponibles en mode Compte, et annoncés comme tels : guerres de clans, appels de clan, chat de clan,
-- promotions, exclusions et invitations nominatives.
-- Rien n'est supprimé : quitter un clan ferme l'appartenance, une candidature traitée reste en base.

create table if not exists wm.clans_demo (
  id text primary key,
  tag text not null,
  acces text not null check (acces in ('open', 'apply', 'invite')),
  rang_min smallint not null,
  division text not null,
  n integer not null,                                 -- membres simulés
  code text not null unique
);
insert into wm.clans_demo (id, tag, acces, rang_min, division, n, code) values
  ('c1','LONO','open',0,'bronze',30,'WMR-LTLS'), ('c2','PAFE','apply',1,'bronze',24,'WMR-4KMB'), ('c3','GRBO','invite',0,'bronze',33,'WMR-SAT5'), ('c4','CRSO','open',0,'bronze',44,'WMR-4XSP'), ('c5','VILA','apply',0,'bronze',21,'WMR-CGZQ'),
  ('c6','DRNO','invite',1,'bronze',31,'WMR-5Z2L'), ('c7','REFE','open',0,'bronze',32,'WMR-JAAK'), ('c8','VEST','open',0,'bronze',36,'WMR-LFBW'), ('c9','COTE','invite',0,'bronze',31,'WMR-9P5V'), ('c10','TALA','open',1,'bronze',15,'WMR-DZRH'),
  ('c11','SANO','apply',0,'bronze',45,'WMR-FTCG'), ('c12','LIFE','invite',1,'bronze',45,'WMR-XEAB'), ('c13','REBO','open',0,'bronze',45,'WMR-PRPB'), ('c14','TITE','apply',1,'bronze',41,'WMR-4EGZ'), ('c15','DALA','invite',0,'bronze',14,'WMR-WAZN'),
  ('c16','LYNO','open',1,'bronze',45,'WMR-YAK9'), ('c17','PHFE','apply',0,'bronze',24,'WMR-BAJN'), ('c18','SPBO','invite',1,'bronze',35,'WMR-XFAB'), ('c19','AITE','open',0,'bronze',13,'WMR-5H7C'), ('c20','COLA','apply',1,'bronze',32,'WMR-PLYF'),
  ('c21','FANO','invite',1,'argent',21,'WMR-KA9G'), ('c22','VIFE','open',2,'argent',43,'WMR-JNY7'), ('c23','DRBO','apply',1,'argent',30,'WMR-2UYA'), ('c24','RETE','invite',2,'argent',35,'WMR-RPZU'), ('c25','ECLR','open',0,'argent',47,'WMR-MRLJ'),
  ('c26','CONO','apply',2,'argent',15,'WMR-EF3Y'), ('c27','TAFE','invite',1,'argent',42,'WMR-Y8UC'), ('c28','SABO','open',2,'argent',17,'WMR-EQ6L'), ('c29','LITE','apply',1,'argent',36,'WMR-M7PC'), ('c30','MACR','open',0,'argent',41,'WMR-CDYY'),
  ('c31','TINO','open',1,'argent',48,'WMR-NCHW'), ('c32','DAFE','apply',2,'argent',37,'WMR-VF73'), ('c33','LYBO','invite',1,'argent',18,'WMR-T347'), ('c34','PHTE','open',2,'argent',47,'WMR-2JBB'), ('c35','SPLA','apply',1,'argent',27,'WMR-WA8S'),
  ('c36','AINO','invite',2,'argent',17,'WMR-49G5'), ('c37','COFE','open',1,'argent',12,'WMR-Q226'), ('c38','LOBO','apply',2,'argent',43,'WMR-TM7P'), ('c39','PATE','invite',1,'argent',12,'WMR-ZBFR'), ('c40','GRLA','open',2,'argent',40,'WMR-DLLQ'),
  ('c41','RENO','apply',2,'or',25,'WMR-953E'), ('c42','PIFE','invite',3,'or',29,'WMR-XJL9'), ('c43','COBO','open',2,'or',30,'WMR-JAC9'), ('c44','TATE','apply',3,'or',45,'WMR-D8ZP'), ('c45','SALA','invite',2,'or',34,'WMR-5CHN'),
  ('c46','LINO','open',3,'or',48,'WMR-CCSG'), ('c47','REFE','apply',2,'or',37,'WMR-YZAM'), ('c48','TIBO','invite',3,'or',32,'WMR-6DMU'), ('c49','DATE','open',2,'or',27,'WMR-RNB2'), ('c50','LYLA','apply',3,'or',18,'WMR-V9G2'),
  ('c51','PHNO','invite',2,'or',36,'WMR-3DXG'), ('c52','SPFE','open',3,'or',31,'WMR-XPCR'), ('c53','AIBO','apply',2,'or',46,'WMR-V278'), ('c54','COTE','invite',3,'or',26,'WMR-DJQY'), ('c55','LOLA','open',2,'or',15,'WMR-ESVX'),
  ('c56','PANO','apply',3,'or',29,'WMR-G9R7'), ('c57','GRFE','invite',2,'or',49,'WMR-EDNU'), ('c58','FABO','open',3,'or',40,'WMR-ZVSZ'), ('c59','VITE','apply',2,'or',46,'WMR-PTHT'), ('c60','DRLA','invite',3,'or',12,'WMR-P5Z7'),
  ('c61','TANO','open',3,'platine',20,'WMR-T7QJ'), ('c62','SAFE','apply',4,'platine',47,'WMR-QRAK'), ('c63','LIBO','invite',3,'platine',17,'WMR-XQRE'), ('c64','RETE','open',4,'platine',17,'WMR-YKAR'), ('c65','TILA','apply',3,'platine',15,'WMR-CMDD'),
  ('c66','DANO','invite',4,'platine',18,'WMR-CAZY'), ('c67','LYFE','open',3,'platine',29,'WMR-UCFH'), ('c68','PHBO','apply',4,'platine',41,'WMR-FEP4'), ('c69','SPTE','invite',3,'platine',24,'WMR-NB77'), ('c70','AILA','open',4,'platine',48,'WMR-DG6M'),
  ('c71','CONO','apply',3,'platine',17,'WMR-U274'), ('c72','LOFE','invite',4,'platine',37,'WMR-SPW4'), ('c73','PABO','open',3,'platine',38,'WMR-WDWS'), ('c74','GRTE','apply',4,'platine',29,'WMR-3ADJ'), ('c75','FALA','invite',3,'platine',47,'WMR-9EX4'),
  ('c76','VINO','open',4,'platine',16,'WMR-HZHM'), ('c77','DRFE','apply',3,'platine',41,'WMR-7LZW'), ('c78','REBO','invite',4,'platine',15,'WMR-SGAC'), ('c79','PITE','open',3,'platine',15,'WMR-57B5'), ('c80','COLA','apply',4,'platine',19,'WMR-KND8'),
  ('c81','RENO','invite',4,'diamant',36,'WMR-LEPL'), ('c82','TIFE','open',5,'diamant',44,'WMR-H35X'), ('c83','DABO','apply',4,'diamant',41,'WMR-BQAZ'), ('c84','LYTE','invite',5,'diamant',14,'WMR-EB7E'), ('c85','PHLA','open',4,'diamant',34,'WMR-KSZW'),
  ('c86','SPNO','apply',5,'diamant',33,'WMR-UCFG'), ('c87','AIFE','invite',4,'diamant',13,'WMR-QC9W'), ('c88','COBO','open',5,'diamant',12,'WMR-8EXQ'), ('c89','LOTE','apply',4,'diamant',44,'WMR-WVBC'), ('c90','PALA','invite',5,'diamant',22,'WMR-7ACG'),
  ('c91','GRNO','open',4,'diamant',40,'WMR-YSHB'), ('c92','FAFE','apply',5,'diamant',12,'WMR-2SVN'), ('c93','VIBO','invite',4,'diamant',26,'WMR-NRQ9'), ('c94','DRTE','open',5,'diamant',13,'WMR-KG74'), ('c95','RELA','apply',4,'diamant',41,'WMR-FJYH'),
  ('c96','PINO','invite',5,'diamant',16,'WMR-ANA6'), ('c97','COFE','open',4,'diamant',43,'WMR-DYRM'), ('c98','TABO','apply',5,'diamant',26,'WMR-YA3J'), ('c99','SATE','invite',4,'diamant',24,'WMR-55PN'), ('c100','LILA','open',5,'diamant',21,'WMR-WW5H')
on conflict (id) do update set tag = excluded.tag, acces = excluded.acces, rang_min = excluded.rang_min, division = excluded.division, n = excluded.n, code = excluded.code;

create table if not exists wm.clans_joueurs (
  id text primary key,
  nom text not null,
  tag text not null unique,
  ic text not null default 'shield',
  col text not null default '#2448FF',
  langues text[] not null default '{fr}',
  cats text[] not null default '{}',
  description text not null default '',
  acces text not null default 'open' check (acces in ('open', 'apply', 'invite')),
  rang_min smallint not null default 0 check (rang_min between 0 and 7),
  chef uuid references public.users(id) on delete set null,
  code text not null unique,
  cree_at timestamptz not null default now()
);
create sequence if not exists wm.clans_joueurs_seq;
create table if not exists wm.clan_membres (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  clan_id text not null,
  role text not null default 'membre' check (role in ('chef', 'officier', 'membre')),
  xp numeric(14,2) not null default 0,                -- contribution : volume misé, plafonné par jour
  jour date,                                          -- jour du compteur ci-dessous
  vol_jour numeric(14,2) not null default 0,
  ecartes integer not null default 0,                 -- mises non comptées (un autre membre était déjà sur le marché)
  depuis timestamptz not null default now(),
  parti_at timestamptz                                -- null : appartenance en cours
);
create unique index if not exists clan_membres_actif on wm.clan_membres (user_id) where parti_at is null;
create index if not exists clan_membres_clan on wm.clan_membres (clan_id) where parti_at is null;
create index if not exists clan_membres_joueur on wm.clan_membres (user_id, id desc);
create table if not exists wm.clan_candidatures (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  clan_id text not null,
  etat text not null default 'attente' check (etat in ('attente', 'acceptee', 'refusee', 'annulee')),
  at timestamptz not null default now(),
  fin_at timestamptz
);
create unique index if not exists clan_candidatures_attente on wm.clan_candidatures (user_id, clan_id) where etat = 'attente';
alter table wm.clans_demo enable row level security;
alter table wm.clans_joueurs enable row level security;
alter table wm.clan_membres enable row level security;
alter table wm.clan_candidatures enable row level security;
revoke all on wm.clans_demo, wm.clans_joueurs, wm.clan_membres, wm.clan_candidatures from public, anon, authenticated;
revoke all on sequence wm.clans_joueurs_seq from public, anon, authenticated;

-- ── Un clan, de démonstration ou créé par un joueur, vu par les règles d'accès ──
create or replace function wm.clan_regles(p_clan text, out existe boolean, out acces text, out rang_min integer, out code text, out membres integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  select true, d.acces, d.rang_min, d.code, d.n into existe, acces, rang_min, code, membres from wm.clans_demo d where d.id = p_clan;
  if not found then
    select true, j.acces, j.rang_min, j.code, 0 into existe, acces, rang_min, code, membres from wm.clans_joueurs j where j.id = p_clan;
  end if;
  existe := coalesce(existe, false);
  membres := coalesce(membres, 0) + (select count(*) from wm.clan_membres m where m.clan_id = p_clan and m.parti_at is null);
end $$;

-- Le tag de clan d'un joueur, pour sa fiche : son clan s'il en a un ; pour un bot, celui d'un clan de démonstration.
create or replace function wm.clan_de(p_user uuid, p_bot boolean) returns text
language sql stable security definer set search_path = '' as $$
  select case when coalesce(p_bot, false) then case when abs(hashtext(p_user::text)) % 5 <> 4 then 'c' || (61 + (abs(hashtext(p_user::text)) / 5) % 40)::text end
              else (select m.clan_id from wm.clan_membres m where m.user_id = p_user and m.parti_at is null) end
$$;

-- ── Fiche publique : elle porte maintenant le clan du joueur, et s'il autorise la copie de ses paris ──
create or replace function wm.fiche(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'n', u.username, 't', coalesce(s.rank_tier, 0), 'd', coalesce(s.rank_division, 0),
    'tone', (('x' || substr(md5(u.id::text), 1, 4))::bit(16)::int % 4),
    'photo', coalesce(u.avatar_photo, ''), 'color', coalesce(u.avatar_color, '#2448FF'),
    'bio', case when u.is_public then coalesce(u.bio, '') else '' end,
    'profit', case when u.is_public then round(coalesce(s.profit_realized, 0)) else 0 end,
    'acc', case when u.is_public then coalesce(s.bets_accuracy_pct, 0) else 0 end,
    'bets', case when u.is_public then coalesce(s.bets_placed, 0) else 0 end,
    'fol', coalesce(s.followers_count, 0), 'bot', u.is_demo, 'pub', case when u.is_public then 1 else 0 end,
    'clan', wm.clan_de(u.id, u.is_demo),
    'cp', case when coalesce(u.is_demo, false) or coalesce((select (up.prefs -> 'prefs' ->> 'copyok')::boolean from wm.user_prefs up where up.user_id = u.id), false) then 1 else 0 end)
  from public.users u left join public.user_stats s on s.user_id = u.id
  where u.id = p_user
$$;

-- ── Ce que le joueur voit : son clan, sa contribution, ses candidatures, et les clans créés par des joueurs ──
create or replace function wm.clan_joueur_json(j wm.clans_joueurs, p_moi uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', j.id, 'name', j.nom, 'tag', j.tag, 'emblem', jsonb_build_object('ic', j.ic, 'col', j.col), 'lang', to_jsonb(j.langues), 'cats', to_jsonb(j.cats),
    'desc', j.description, 'access', j.acces, 'minRank', j.rang_min, 'chief', j.chef, 'createdAt', (extract(epoch from j.cree_at) * 1000)::bigint,
    'code', case when exists (select 1 from wm.clan_membres m where m.clan_id = j.id and m.user_id = p_moi and m.parti_at is null) then j.code end,   -- le code ne se lit que de l'intérieur
    'members', coalesce((select jsonb_agg(jsonb_build_object('u', m.user_id, 'role', m.role, 'since', (extract(epoch from m.depuis) * 1000)::bigint, 'pts', round(m.xp)) order by m.depuis)
                         from wm.clan_membres m where m.clan_id = j.id and m.parti_at is null), '[]'::jsonb))
$$;
create or replace function wm.clan_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mine', (select jsonb_build_object('id', m.clan_id, 'role', m.role, 'since', (extract(epoch from m.depuis) * 1000)::bigint, 'xp', m.xp,
               'jour', case when m.jour = current_date then m.vol_jour else 0 end, 'ecartes', m.ecartes)
             from wm.clan_membres m where m.user_id = p_user and m.parti_at is null),
    'leftAt', (select (extract(epoch from max(m.parti_at)) * 1000)::bigint from wm.clan_membres m where m.user_id = p_user and m.parti_at is not null),
    'apps', coalesce((select jsonb_object_agg(c.clan_id, (extract(epoch from c.at) * 1000)::bigint) from wm.clan_candidatures c where c.user_id = p_user and c.etat = 'attente'), '{}'::jsonb),
    'clans', coalesce((select jsonb_agg(wm.clan_joueur_json(j, p_user) order by j.cree_at) from (select * from wm.clans_joueurs x order by x.cree_at desc limit 200) j), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(x.user_id::text, wm.fiche(x.user_id)) from (
                select distinct m.user_id from wm.clan_membres m join wm.clans_joueurs j on j.id = m.clan_id where m.parti_at is null and m.user_id <> p_user limit 400) x), '{}'::jsonb))
$$;

-- ── Entrer dans un clan (règles communes à « rejoindre », « code » et « candidature acceptée ») ──
create or replace function wm.clan_entrer(p_user uuid, p_clan text, p_role text default 'membre') returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into wm.clan_membres (user_id, clan_id, role, jour) values (p_user, p_clan, p_role, current_date);
  update wm.clan_candidatures set etat = 'annulee', fin_at = now() where user_id = p_user and etat = 'attente' and clan_id <> p_clan;
end $$;
create or replace function wm.clan_verifier(p_user uuid, p_clan text, out acces text, out code text)
language plpgsql security definer set search_path = '' as $$
declare r record; s public.user_stats; v_tier integer; v_parti timestamptz;
begin
  select * into r from wm.clan_regles(p_clan);
  if not r.existe then perform wm.fail('clan_inconnu'); end if;
  if exists (select 1 from wm.clan_membres m where m.user_id = p_user and m.parti_at is null) then perform wm.fail('clan_deja'); end if;
  select max(m.parti_at) into v_parti from wm.clan_membres m where m.user_id = p_user;
  if v_parti is not null and v_parti > now() - interval '7 days' then perform wm.fail('clan_attente'); end if;
  if r.membres >= 50 then perform wm.fail('clan_complet'); end if;
  select * into s from public.user_stats where user_id = p_user;
  select x.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) x;
  if coalesce(v_tier, 0) < r.rang_min then perform wm.fail('rang_insuffisant'); end if;
  acces := r.acces; code := r.code;
end $$;

-- ── Rejoindre : un clan ouvert, ou n'importe quel clan avec son code d'invitation ──
create or replace function wm.clan_join(p_clan text, p_code text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_code text := upper(btrim(coalesce(p_code, ''))); r record;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  if p_clan is null then                                                        -- par le code seul (clan créé par un joueur, inconnu de l'écran)
    select coalesce((select d.id from wm.clans_demo d where d.code = v_code), (select j.id from wm.clans_joueurs j where j.code = v_code)) into p_clan;
    if p_clan is null then perform wm.fail('clan_inconnu'); end if;
  end if;
  select * into r from wm.clan_verifier(v_uid, p_clan);
  if r.acces <> 'open' and v_code is distinct from r.code then perform wm.fail('clan_ferme'); end if;
  perform wm.clan_entrer(v_uid, p_clan);
  perform wm.notify(v_uid, 'shield', 'clan_rejoint', jsonb_build_object('id', p_clan), '#clan-' || p_clan);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- ── Candidater : un officier répond au bout de quelques secondes (favorablement 8 fois sur 10) ──
create or replace function wm.clan_apply(p_clan text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); r record;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into r from wm.clan_verifier(v_uid, p_clan);
  if r.acces <> 'apply' then perform wm.fail('clan_ferme'); end if;
  insert into wm.clan_candidatures (user_id, clan_id) values (v_uid, p_clan) on conflict do nothing;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;
-- Les candidatures du joueur vieilles de 6 secondes reçoivent leur réponse (au passage du joueur : chargement, relecture).
create or replace function wm.clan_candidatures_avancer(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; n integer := 0; v_ok boolean;
begin
  for c in select x.id, x.clan_id from wm.clan_candidatures x where x.user_id = p_user and x.etat = 'attente' and x.at <= now() - interval '6 seconds' order by x.id for update skip locked loop
    v_ok := abs(hashtext(c.id::text || ':' || p_user::text)) % 10 < 8;
    if v_ok then
      begin
        perform wm.clan_verifier(p_user, c.clan_id);                             -- les règles sont revérifiées au moment d'entrer
        perform wm.clan_entrer(p_user, c.clan_id);
      exception when others then v_ok := false;
      end;
    end if;
    update wm.clan_candidatures set etat = case when v_ok then 'acceptee' else 'refusee' end, fin_at = now() where id = c.id;
    perform wm.notify(p_user, 'shield', case when v_ok then 'clan_accepte' else 'clan_refuse' end, jsonb_build_object('id', c.clan_id), '#clan-' || c.clan_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Quitter : 7 jours d'attente ensuite ; si le chef d'un clan de joueurs part, le plus ancien officier (ou membre) lui succède ──
create or replace function wm.clan_leave() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); m wm.clan_membres; v_suivant uuid;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  update wm.clan_membres set parti_at = now() where user_id = v_uid and parti_at is null returning * into m;
  if not found then perform wm.fail('clan_absent'); end if;
  if m.role = 'chef' then
    select x.user_id into v_suivant from wm.clan_membres x where x.clan_id = m.clan_id and x.parti_at is null order by (x.role = 'officier') desc, x.depuis limit 1;
    update wm.clans_joueurs set chef = v_suivant where id = m.clan_id;
    if v_suivant is not null then
      update wm.clan_membres set role = 'chef' where user_id = v_suivant and clan_id = m.clan_id and parti_at is null;
      perform wm.notify_direct(v_suivant, 'shield', 'clan_chef', jsonb_build_object('id', m.clan_id), '#clan-' || m.clan_id);
    end if;
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- ── Créer : p = { name, tag, desc, ic, col, lang, cats, access, minRank } ──
create or replace function wm.clan_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_nom text := wm.texte_propre(p ->> 'name'); v_tag text := upper(btrim(coalesce(p ->> 'tag', ''))); v_desc text := wm.texte_propre(p ->> 'desc');
  v_acces text := coalesce(p ->> 'access', 'open'); v_rang numeric := coalesce(wm.num(p ->> 'minRank'), 0); v_ic text := coalesce(p ->> 'ic', 'shield'); v_col text := coalesce(p ->> 'col', '#2448FF');
  v_langues text[]; v_cats text[]; v_tier integer; v_solde numeric; v_id text; v_code text; v_parti timestamptz;
  s public.user_stats; u public.users;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select * into u from public.users where id = v_uid;
  if exists (select 1 from wm.clan_membres m where m.user_id = v_uid and m.parti_at is null) then perform wm.fail('clan_deja'); end if;
  select max(m.parti_at) into v_parti from wm.clan_membres m where m.user_id = v_uid;
  if v_parti is not null and v_parti > now() - interval '7 days' then perform wm.fail('clan_attente'); end if;
  select x.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) x;
  if coalesce(v_tier, 0) < 2 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Argent
  if u.created_at > now() - interval '14 days' then perform wm.fail('compte_trop_recent'); end if;
  if wm.texte_refuse(v_nom) or wm.texte_refuse(v_desc) then perform wm.fail('texte_refuse'); end if;
  if length(v_nom) < 3 or length(v_nom) > 28 then perform wm.fail('clan_nom_invalide'); end if;
  if v_tag !~ '^[A-Z0-9]{3,4}$' then perform wm.fail('clan_tag_invalide'); end if;
  if exists (select 1 from wm.clans_demo d where d.tag = v_tag) or exists (select 1 from wm.clans_joueurs j where j.tag = v_tag) then perform wm.fail('clan_tag_pris'); end if;
  if length(v_desc) > 200 or v_acces not in ('open', 'apply', 'invite') or v_rang <> trunc(v_rang) or v_rang < 0 or v_rang > 7
     or v_ic not in ('shield', 'bolt', 'flame', 'crown', 'star', 'trophy', 'target', 'league', 'chart', 'rotate') or v_col !~ '^#[0-9A-Fa-f]{6}$' then perform wm.fail('clan_invalide'); end if;
  select coalesce(array_agg(x), '{fr}') into v_langues from jsonb_array_elements_text(case when jsonb_typeof(p -> 'lang') = 'array' then p -> 'lang' else '[]'::jsonb end) x where x in ('fr', 'en', 'he', 'es', 'pt');
  select coalesce(array_agg(x), '{}') into v_cats from (select x from jsonb_array_elements_text(case when jsonb_typeof(p -> 'cats') = 'array' then p -> 'cats' else '[]'::jsonb end) x
    where x in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport', 'Sport live', 'Bourse', 'Matières', 'Devises') limit 3) y;
  if s.balance < 50 then perform wm.fail('solde_insuffisant'); end if;

  update public.user_stats set balance = balance - 50, profit_realized = coalesce(profit_realized, 0) - 50 where user_id = v_uid returning balance into v_solde;   -- frais non remboursables
  v_id := 'u' || nextval('wm.clans_joueurs_seq');
  v_code := 'WMR-' || upper(translate(substr(md5(v_id || ':' || v_uid::text), 1, 4), '01io', 'XYZW'));
  while exists (select 1 from wm.clans_demo d where d.code = v_code) or exists (select 1 from wm.clans_joueurs j where j.code = v_code) loop
    v_code := 'WMR-' || upper(translate(substr(md5(v_code || v_id), 1, 4), '01io', 'XYZW'));
  end loop;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -50, v_solde, 'clan', v_id);
  insert into wm.clans_joueurs (id, nom, tag, ic, col, langues, cats, description, acces, rang_min, chef, code)
  values (v_id, v_nom, v_tag, v_ic, v_col, v_langues, v_cats, v_desc, v_acces, v_rang, v_uid, v_code);
  perform wm.clan_entrer(v_uid, v_id, 'chef');
  perform wm.badges_check(v_uid);
  perform wm.notify(v_uid, 'shield', 'clan_cree', jsonb_build_object('id', v_id, 'name', v_nom, 'tag', v_tag), '#clan-' || v_id);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid), 'id', v_id));
end $$;

-- ── Relire son clan (l'écran suit ainsi une candidature en attente) ──
create or replace function wm.clan() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  perform wm.clan_candidatures_avancer(v_uid);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- ── Contribution : chaque mise d'un membre (marché, pari copié, éclair, combiné) compte pour son clan, jusqu'à 2 000 $ par jour ──
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
  return null;
end $$;
create or replace trigger clan_compter after insert on public.balance_ledger
  for each row when (new.kind in ('bet', 'copie', 'flash', 'combo') and new.amount < 0) execute function wm.clan_compter();

create or replace function public.api_clan_join(p_clan text, p_code text default null) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_join(p_clan, p_code) $$;
create or replace function public.api_clan_apply(p_clan text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_apply(p_clan) $$;
create or replace function public.api_clan_leave() returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_leave() $$;
create or replace function public.api_clan_create(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_create(p) $$;
create or replace function public.api_clan() returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan() $$;

-- ── Le lot enregistre ses blocs (voir …_etat_blocs.sql) ──
insert into wm.etat_blocs (cle, fonction, ordre, avant) values ('clan_candidatures', 'wm.clan_candidatures_avancer', 40, true), ('clan', 'wm.clan_etat', 100, false)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre, avant = excluded.avant;

select wm.droits();
