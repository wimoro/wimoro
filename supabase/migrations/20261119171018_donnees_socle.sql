-- Données réelles, lot 6 (19 nov. 2026) : le socle. Le serveur va chercher les cours, les garde et les sert au site.
--
-- Rien de ce qui existe ne change pour un joueur : aucune fonction existante n'est modifiée, aucune ligne n'est effacée.
-- Ajouts :
--   * la sauvegarde, dans backup_20261119, des tables où ce lot écrit (réglages, droits, registre de l'équipe, tâches) ;
--   * pg_net, et un jeton créé par la base elle-même dans Vault (wm_cron_jeton) : il n'apparaît ni dans le dépôt ni dans un
--     journal. wm.appeler(fonction, corps) réveille une Edge Function avec ce jeton ; l'Edge Function le fait vérifier par
--     srv_jeton_ok (clé de service), sinon elle refuse (401) sans rien faire ;
--   * wm.sources : chaque source, son rang dans la cascade de sa famille, la clé qu'elle demande (le NOM du secret, jamais sa
--     valeur), son quota, sa cadence, ses appels du jour, ses erreurs, sa pause après un refus (429, 403, 5xx), son état ;
--   * wm.px_marches et wm.px_feries : séances, fuseaux et jours fériés des places (2026-2028), pour savoir si un marché
--     est ouvert ; wm.px_actifs : les 37 cours suivis ; wm.px_dernier : le dernier cours de chacun ; wm.px_echantillons :
--     un anneau d'une heure (un emplacement par tranche de 3 secondes), mis à jour en place, jamais vidé ;
--   * wm.live_cache et api_live() : l'instantané léger que lit le site (visiteurs compris, sans réveiller les bots) —
--     cours, état « direct » (d), « retardé » (r) ou « simulé » (s), marché ouvert ou non ;
--   * l'Edge Function « donnees » (verify_jwt désactivé, jeton vérifié), réveillée chaque minute par la tâche wm-donnees :
--     une boucle d'environ 55 secondes, un passage toutes les 3 secondes, qui écrit par srv_cours_ingerer ;
--   * deux actions du panneau : sources_etat (lecture) et source_activer (couper ou rallumer une source, journalisé).
-- Secours en cascade : source principale, puis la suivante, puis la dernière valeur connue (marquée « retardée »), et en
-- dernier recours seulement une valeur simulée discrète (le niveau de référence de l'actif, marqué « simulé »).

-- ══ 0. Sauvegarde (avant toute écriture) ══
-- Une table déjà sauvée (lot 0 ou lot précédent) garde sa copie la plus ancienne.
create or replace function backup_20261119.sauver_table(p_nom text, p_copie text default null) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  s text := split_part(p_nom, '.', 1); n text := split_part(p_nom, '.', 2);
  c text := coalesce(p_copie, split_part(p_nom, '.', 1) || '_' || split_part(p_nom, '.', 2));
  v_oid oid := format('%I.%I', split_part(p_nom, '.', 1), split_part(p_nom, '.', 2))::regclass::oid; v_n bigint;
begin
  if exists (select 1 from backup_20261119.tables t where t.nom = p_nom) then return null; end if;
  execute format('create table backup_20261119.%I as table %I.%I', c, s, n);
  execute format('alter table backup_20261119.%I enable row level security', c);
  execute format('revoke all on backup_20261119.%I from public, anon, authenticated', c);
  execute format('select count(*) from backup_20261119.%I', c) into v_n;
  insert into backup_20261119.tables (nom, copie, lignes, colonnes, contraintes, index, declencheurs, regles, rls, droits)
  select p_nom, 'backup_20261119.' || c, v_n,
    (select coalesce(jsonb_agg(jsonb_build_object('nom', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'non_nul', a.attnotnull,
              'defaut', pg_get_expr(d.adbin, d.adrelid), 'identite', nullif(a.attidentity::text, ''), 'genere', nullif(a.attgenerated::text, ''))
              order by a.attnum), '[]'::jsonb)
     from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped),
    (select coalesce(jsonb_agg(jsonb_build_object('nom', k.conname, 'def', pg_get_constraintdef(k.oid)) order by k.conname), '[]'::jsonb)
     from pg_catalog.pg_constraint k where k.conrelid = v_oid),
    (select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid), '[]'::jsonb) from pg_catalog.pg_index i where i.indrelid = v_oid),
    (select coalesce(jsonb_agg(pg_get_triggerdef(g.oid) order by g.tgname), '[]'::jsonb) from pg_catalog.pg_trigger g where g.tgrelid = v_oid and not g.tgisinternal),
    (select coalesce(jsonb_agg(jsonb_build_object('nom', r.polname, 'cmd', r.polcmd::text, 'roles', r.polroles::regrole[]::text[],
              'using', pg_get_expr(r.polqual, r.polrelid), 'check', pg_get_expr(r.polwithcheck, r.polrelid)) order by r.polname), '[]'::jsonb)
     from pg_catalog.pg_policy r where r.polrelid = v_oid),
    (select x.relrowsecurity from pg_catalog.pg_class x where x.oid = v_oid),
    (select x.relacl::text from pg_catalog.pg_class x where x.oid = v_oid);
  return 'backup_20261119.' || c;
end $$;
revoke all on function backup_20261119.sauver_table(text, text) from public, anon, authenticated;

-- Définitions des fonctions existantes modifiées par les lots suivants (celles d'avant le lot, telles qu'en vigueur).
create table if not exists backup_20261119.fonctions_lots (
  signature text not null,
  lot text not null,
  definition text not null,
  droits text,
  proprietaire text not null,
  sauve_at timestamptz not null default now(),
  primary key (signature, lot)
);
alter table backup_20261119.fonctions_lots enable row level security;
revoke all on backup_20261119.fonctions_lots from public, anon, authenticated;
create or replace function backup_20261119.sauver_fonction(p_signature text, p_lot text) returns text
language sql security invoker set search_path = '' as $$
  insert into backup_20261119.fonctions_lots (signature, lot, definition, droits, proprietaire)
  select p.oid::regprocedure::text, p_lot, pg_get_functiondef(p.oid), p.proacl::text, pg_get_userbyid(p.proowner)
  from pg_catalog.pg_proc p where p.oid = p_signature::regprocedure
  on conflict (signature, lot) do nothing
  returning signature
$$;
revoke all on function backup_20261119.sauver_fonction(text, text) from public, anon, authenticated;

select backup_20261119.sauver_table('wm.reglages');
select backup_20261119.sauver_table('wm.droits_liste');
select backup_20261119.sauver_table('wm.equipe_actions');
select backup_20261119.sauver_table('cron.job');

-- ══ 1. pg_net et le jeton des tâches ══
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- 64 caractères hexadécimaux tirés au hasard par la base ; créé une seule fois.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'wm_cron_jeton',
  'Jeton des tâches planifiées vers les Edge Functions de Wimoro (vérifié par srv_jeton_ok).')
where not exists (select 1 from vault.secrets where name = 'wm_cron_jeton');

-- L'Edge Function compare le jeton reçu à celui de Vault (empreintes SHA-256). Clé de service seulement.
create or replace function public.srv_jeton_ok(p_jeton text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(p_jeton) >= 32 and exists (select 1 from vault.decrypted_secrets s where s.name = 'wm_cron_jeton'
    and sha256(convert_to(s.decrypted_secret, 'UTF8')) = sha256(convert_to(p_jeton, 'UTF8'))), false)
$$;

-- ══ 2. Réglages de la collecte (valeurs par défaut = ce que fait ce lot) ══
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
select x.cle, x.categorie, x.libelle, x.explication, x.type, x.v::jsonb, x.v::jsonb, x.mn, x.mx, false, false, true, null, x.ordre
from (values
  ('donnees.actif', 'donnees', 'Collecte des données réelles', 'Chaque minute, le serveur réveille la fonction qui va chercher les cours ; faux : plus aucun appel aux sources, le site garde les dernières valeurs.', 'booleen', 'true', null::numeric, null::numeric, 200),
  ('donnees.cadence_s', 'donnees', 'Rythme de la collecte', 'Secondes entre deux passages de la collecte ; chaque source garde en plus sa propre cadence et son quota.', 'entier', '3', 2, 10, 201),
  ('donnees.boucle_s', 'donnees', 'Durée d''une collecte', 'Secondes de travail de la fonction à chaque réveil (elle est réveillée chaque minute).', 'entier', '55', 20, 110, 202)
) as x(cle, categorie, libelle, explication, type, v, mn, mx, ordre)
on conflict (cle) do nothing;

-- ══ 3. Les places : séances, fuseaux, jours fériés ══
create table if not exists wm.px_marches (
  id text primary key,                              -- NYSE, EURONEXT, XETRA, TSE, FX, CME, ICE, CRYPTO
  nom text not null,
  fuseau text not null,                             -- fuseau IANA : les heures sont locales (changements d'heure compris)
  genre text not null check (genre in ('continu', 'seances', 'hebdo')),
  seances jsonb not null default '[]'::jsonb,       -- « seances » : [["09:30","16:00"]] en heure locale, du lundi au vendredi
  hebdo jsonb,                                      -- « hebdo » : {"ouvre_dim":"17:00","ferme_ven":"16:00","pause":["16:00","17:00"]}
  controle jsonb,                                   -- dernier relevé d'une source de contrôle (Twelve Data), pour l'équipe
  maj_at timestamptz not null default now()
);
alter table wm.px_marches enable row level security;
revoke all on wm.px_marches from public, anon, authenticated;

create table if not exists wm.px_feries (
  marche text not null references wm.px_marches (id),
  jour date not null,
  ferme_a time,                                     -- vide : fermé toute la journée ; sinon fermeture anticipée (heure locale)
  libelle text not null,
  primary key (marche, jour)
);
alter table wm.px_feries enable row level security;
revoke all on wm.px_feries from public, anon, authenticated;

insert into wm.px_marches (id, nom, fuseau, genre, seances, hebdo) values
  ('CRYPTO', 'Places crypto (24 h sur 24)', 'UTC', 'continu', '[]', null),
  ('NYSE', 'NYSE et Nasdaq', 'America/New_York', 'seances', '[["09:30","16:00"]]', null),
  ('EURONEXT', 'Euronext Paris et Amsterdam', 'Europe/Paris', 'seances', '[["09:00","17:30"]]', null),
  ('XETRA', 'Xetra (Francfort)', 'Europe/Berlin', 'seances', '[["09:00","17:30"]]', null),
  ('TSE', 'Bourse de Tokyo', 'Asia/Tokyo', 'seances', '[["09:00","11:30"],["12:30","15:30"]]', null),
  ('FX', 'Devises (repère CME)', 'America/Chicago', 'hebdo', '[]', '{"ouvre_dim":"17:00","ferme_ven":"16:00","pause":["16:00","17:00"]}'),
  ('CME', 'Or, argent, pétrole WTI (CME Globex)', 'America/Chicago', 'hebdo', '[]', '{"ouvre_dim":"17:00","ferme_ven":"16:00","pause":["16:00","17:00"]}'),
  ('ICE', 'Pétrole Brent (ICE Futures Europe)', 'Europe/London', 'hebdo', '[]', '{"ouvre_dim":"23:00","ferme_ven":"23:00","pause":["23:00","01:00"]}')
on conflict (id) do nothing;

-- Calendriers officiels (docs/donnees/d1-bourse.md, § 3.2). Euronext : demi-séance jusqu'à 14:00 par prudence.
insert into wm.px_feries (marche, jour, ferme_a, libelle) values
  ('NYSE', '2026-01-01', null, 'New Year''s Day'), ('NYSE', '2026-01-19', null, 'Martin Luther King, Jr. Day'),
  ('NYSE', '2026-02-16', null, 'Washington''s Birthday'), ('NYSE', '2026-04-03', null, 'Good Friday'), ('NYSE', '2026-05-25', null, 'Memorial Day'),
  ('NYSE', '2026-06-19', null, 'Juneteenth'), ('NYSE', '2026-07-03', null, 'Independence Day (observé)'), ('NYSE', '2026-09-07', null, 'Labor Day'),
  ('NYSE', '2026-11-26', null, 'Thanksgiving'), ('NYSE', '2026-11-27', '13:00', 'Lendemain de Thanksgiving'),
  ('NYSE', '2026-12-24', '13:00', 'Veille de Noël'), ('NYSE', '2026-12-25', null, 'Christmas'),
  ('NYSE', '2027-01-01', null, 'New Year''s Day'), ('NYSE', '2027-01-18', null, 'Martin Luther King, Jr. Day'),
  ('NYSE', '2027-02-15', null, 'Washington''s Birthday'), ('NYSE', '2027-03-26', null, 'Good Friday'), ('NYSE', '2027-05-31', null, 'Memorial Day'),
  ('NYSE', '2027-06-18', null, 'Juneteenth (observé)'), ('NYSE', '2027-07-05', null, 'Independence Day (observé)'), ('NYSE', '2027-09-06', null, 'Labor Day'),
  ('NYSE', '2027-11-25', null, 'Thanksgiving'), ('NYSE', '2027-11-26', '13:00', 'Lendemain de Thanksgiving'), ('NYSE', '2027-12-24', null, 'Christmas (observé)'),
  ('NYSE', '2028-01-17', null, 'Martin Luther King, Jr. Day'), ('NYSE', '2028-02-21', null, 'Washington''s Birthday'), ('NYSE', '2028-04-14', null, 'Good Friday'),
  ('NYSE', '2028-05-29', null, 'Memorial Day'), ('NYSE', '2028-06-19', null, 'Juneteenth'), ('NYSE', '2028-07-03', '13:00', 'Veille de l''Independence Day'),
  ('NYSE', '2028-07-04', null, 'Independence Day'), ('NYSE', '2028-09-04', null, 'Labor Day'), ('NYSE', '2028-11-23', null, 'Thanksgiving'),
  ('NYSE', '2028-11-24', '13:00', 'Lendemain de Thanksgiving'), ('NYSE', '2028-12-25', null, 'Christmas'),
  ('EURONEXT', '2026-01-01', null, 'Jour de l''an'), ('EURONEXT', '2026-04-03', null, 'Vendredi saint'), ('EURONEXT', '2026-04-06', null, 'Lundi de Pâques'),
  ('EURONEXT', '2026-05-01', null, 'Fête du travail'), ('EURONEXT', '2026-12-24', '14:00', 'Veille de Noël (demi-séance)'), ('EURONEXT', '2026-12-25', null, 'Noël'),
  ('EURONEXT', '2026-12-31', '14:00', 'Saint-Sylvestre (demi-séance)'),
  ('EURONEXT', '2027-01-01', null, 'Jour de l''an'), ('EURONEXT', '2027-03-26', null, 'Vendredi saint'), ('EURONEXT', '2027-03-29', null, 'Lundi de Pâques'),
  ('EURONEXT', '2027-12-24', '14:00', 'Veille de Noël (demi-séance)'), ('EURONEXT', '2027-12-31', '14:00', 'Saint-Sylvestre (demi-séance)'),
  ('XETRA', '2026-01-01', null, 'Neujahr'), ('XETRA', '2026-04-03', null, 'Karfreitag'), ('XETRA', '2026-04-06', null, 'Ostermontag'),
  ('XETRA', '2026-05-01', null, 'Tag der Arbeit'), ('XETRA', '2026-12-24', null, 'Heiligabend'), ('XETRA', '2026-12-25', null, 'Weihnachten'),
  ('XETRA', '2026-12-31', null, 'Silvester'),
  ('XETRA', '2027-01-01', null, 'Neujahr'), ('XETRA', '2027-03-26', null, 'Karfreitag'), ('XETRA', '2027-03-29', null, 'Ostermontag'),
  ('XETRA', '2027-12-24', null, 'Heiligabend'), ('XETRA', '2027-12-31', null, 'Silvester'),
  ('TSE', '2026-01-01', null, 'Nouvel an'), ('TSE', '2026-01-02', null, 'Nouvel an'), ('TSE', '2026-01-12', null, 'Seijin no Hi'),
  ('TSE', '2026-02-11', null, 'Kenkoku Kinen no Hi'), ('TSE', '2026-02-23', null, 'Tennō Tanjōbi'), ('TSE', '2026-03-20', null, 'Shunbun no Hi'),
  ('TSE', '2026-04-29', null, 'Shōwa no Hi'), ('TSE', '2026-05-04', null, 'Midori no Hi'), ('TSE', '2026-05-05', null, 'Kodomo no Hi'),
  ('TSE', '2026-05-06', null, 'Jour férié de remplacement'), ('TSE', '2026-07-20', null, 'Umi no Hi'), ('TSE', '2026-08-11', null, 'Yama no Hi'),
  ('TSE', '2026-09-21', null, 'Keirō no Hi'), ('TSE', '2026-09-22', null, 'Kokumin no Kyūjitsu'), ('TSE', '2026-09-23', null, 'Shūbun no Hi'),
  ('TSE', '2026-10-12', null, 'Supōtsu no Hi'), ('TSE', '2026-11-03', null, 'Bunka no Hi'), ('TSE', '2026-11-23', null, 'Kinrō Kansha no Hi'),
  ('TSE', '2026-12-31', null, 'Fin d''année'),
  ('TSE', '2027-01-01', null, 'Nouvel an'), ('TSE', '2027-01-11', null, 'Seijin no Hi'), ('TSE', '2027-02-11', null, 'Kenkoku Kinen no Hi'),
  ('TSE', '2027-02-23', null, 'Tennō Tanjōbi'), ('TSE', '2027-03-22', null, 'Shunbun no Hi (remplacement)'), ('TSE', '2027-04-29', null, 'Shōwa no Hi'),
  ('TSE', '2027-05-03', null, 'Kenpō Kinenbi'), ('TSE', '2027-05-04', null, 'Midori no Hi'), ('TSE', '2027-05-05', null, 'Kodomo no Hi'),
  ('TSE', '2027-07-19', null, 'Umi no Hi'), ('TSE', '2027-08-11', null, 'Yama no Hi'), ('TSE', '2027-09-20', null, 'Keirō no Hi'),
  ('TSE', '2027-09-23', null, 'Shūbun no Hi'), ('TSE', '2027-10-11', null, 'Supōtsu no Hi'), ('TSE', '2027-11-03', null, 'Bunka no Hi'),
  ('TSE', '2027-11-23', null, 'Kinrō Kansha no Hi'), ('TSE', '2027-12-31', null, 'Fin d''année')
on conflict (marche, jour) do nothing;

-- Un marché est-il ouvert à l'instant t ? Heure locale de la place (changements d'heure compris), jours fériés, fermetures
-- anticipées, pause de midi (Tokyo), pause quotidienne des marchés « hebdo » (CME : 16:00-17:00 ; ICE : 23:00-01:00).
-- Les jours fériés des marchés « hebdo » ne sont pas tenus (ils ne servent qu'à l'affichage).
create or replace function wm.marche_ouvert(p_marche text, p_t timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  m wm.px_marches; f wm.px_feries; s jsonb; v_loc timestamp; v_h time; v_dow integer; v_fin time; a time; b time;
begin
  select * into m from wm.px_marches x where x.id = p_marche;
  if not found or p_t is null then return false; end if;
  if m.genre = 'continu' then return true; end if;
  v_loc := p_t at time zone m.fuseau; v_h := v_loc::time; v_dow := extract(isodow from v_loc)::integer;   -- 1 lundi … 7 dimanche
  if m.genre = 'seances' then
    if v_dow > 5 then return false; end if;
    select * into f from wm.px_feries x where x.marche = p_marche and x.jour = v_loc::date;
    if found and f.ferme_a is null then return false; end if;
    for s in select e from jsonb_array_elements(m.seances) e loop
      v_fin := (s ->> 1)::time;
      if f.ferme_a is not null and f.ferme_a < v_fin then v_fin := f.ferme_a; end if;
      if v_h >= (s ->> 0)::time and v_h < v_fin then return true; end if;
    end loop;
    return false;
  end if;
  -- « hebdo » : du dimanche (ouvre_dim) au vendredi (ferme_ven), hors pause quotidienne [a, b[
  if v_dow = 6 then return false; end if;
  if v_dow = 7 then return v_h >= (m.hebdo ->> 'ouvre_dim')::time; end if;
  if v_dow = 5 and v_h >= (m.hebdo ->> 'ferme_ven')::time then return false; end if;
  a := (m.hebdo -> 'pause' ->> 0)::time; b := (m.hebdo -> 'pause' ->> 1)::time;
  if a < b then return not (v_h >= a and v_h < b); end if;
  -- pause à cheval sur minuit : le soir du lundi au jeudi, le matin du mardi au vendredi
  return not ((v_dow between 1 and 4 and v_h >= a) or (v_dow between 2 and 5 and v_h < b));
end $$;

-- Prochaine ouverture d'une place à séances (null : déjà ouverte, continue, ou rien dans les 15 jours).
create or replace function wm.marche_prochaine_ouverture(p_marche text, p_t timestamptz default now()) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare m wm.px_marches; f wm.px_feries; s jsonb; v_loc timestamp; d date; v_fin time; i integer;
begin
  select * into m from wm.px_marches x where x.id = p_marche;
  if not found or m.genre <> 'seances' or p_t is null or wm.marche_ouvert(p_marche, p_t) then return null; end if;
  v_loc := p_t at time zone m.fuseau;
  for i in 0..15 loop
    d := v_loc::date + i;
    continue when extract(isodow from d) > 5;
    select * into f from wm.px_feries x where x.marche = p_marche and x.jour = d;
    continue when found and f.ferme_a is null;
    for s in select e from jsonb_array_elements(m.seances) e loop
      v_fin := (s ->> 1)::time;
      if f.ferme_a is not null and f.ferme_a < v_fin then v_fin := f.ferme_a; end if;
      continue when (s ->> 0)::time >= v_fin;
      if d + (s ->> 0)::time > v_loc then return (d + (s ->> 0)::time) at time zone m.fuseau; end if;
    end loop;
  end loop;
  return null;
end $$;

-- ══ 4. Les sources ══
create table if not exists wm.sources (
  id text primary key,                              -- binance, kraken, finnhub…
  nom text not null,
  rangs jsonb not null,                             -- {famille: rang dans la cascade} : 1 principale, 2 secours, 3 et plus dernier recours
  nature text not null default 'direct' check (nature in ('direct', 'differe')),   -- « differe » : valeurs du jour par nature
  cle_requise boolean not null default false,
  secret text,                                      -- NOM du secret des Edge Functions (jamais sa valeur)
  cle_presente boolean,                             -- relevé par l'Edge Function à chaque passage (null : pas encore vu)
  actif boolean not null default true,              -- l'équipe peut couper une source (action source_activer)
  cadence_s integer not null check (cadence_s > 0), -- au plus un lot d'appels par cadence
  quota_min integer check (quota_min > 0),          -- appels par minute que Wimoro s'autorise avant la marge (null : pas de limite publiée)
  quota_jour integer check (quota_jour > 0),        -- appels par jour (null : pas de limite publiée)
  marge numeric not null default 0.5 check (marge > 0 and marge <= 1),   -- part du quota réellement utilisée
  jour date,                                        -- jour (UTC) du compteur appels_jour
  appels_jour integer not null default 0,
  appels_total bigint not null default 0,
  erreurs_suite integer not null default 0,
  pause_jusqua timestamptz,                         -- après un refus (429, 403, 5xx…) : plus d'appel avant cette heure
  etat text not null default 'inactif' check (etat in ('direct', 'differe', 'simule', 'erreur', 'inactif')),
  raison text,                                      -- ok, en_reserve, cle_absente, desactivee, pause, echec
  dernier_ok_at timestamptz,
  derniere_erreur text,
  derniere_erreur_at timestamptz,
  dernier_code integer,
  dernier_ms integer,
  config jsonb not null default '{}'::jsonb,
  maj_at timestamptz not null default now()
);
alter table wm.sources enable row level security;
revoke all on wm.sources from public, anon, authenticated;

-- Quotas et cadences : docs/DONNEES.md, § 1.6 et § 3 (calculs). Les secrets sont lus par l'Edge Function ; sans clé, la
-- source est simplement inactive (raison « cle_absente ») et la cascade passe à la suivante.
insert into wm.sources (id, nom, rangs, nature, cle_requise, secret, cadence_s, quota_min, quota_jour, marge) values
  ('binance', 'Binance (miroir de données)', '{"crypto": 1}', 'direct', false, null, 6, 1000, null, 0.5),
  ('kraken', 'Kraken', '{"crypto": 2}', 'direct', false, null, 10, 60, null, 0.5),
  ('coinbase', 'Coinbase', '{"crypto": 3}', 'direct', false, null, 30, 600, null, 0.5),
  ('coingecko', 'CoinGecko (offre Demo)', '{"crypto": 4}', 'direct', true, 'COINGECKO_API_KEY', 600, 100, 330, 0.5),
  ('finnhub', 'Finnhub', '{"actions_us": 1}', 'direct', true, 'FINNHUB_API_KEY', 30, 40, null, 0.5),
  ('yahoo', 'Yahoo Finance (spark)', '{"actions_us": 2, "indices": 1, "actions_eu": 1}', 'direct', false, null, 30, 4, 6000, 0.5),
  ('eodhd', 'EODHD', '{"indices": 2, "actions_eu": 2}', 'direct', true, 'EODHD_API_TOKEN', 900, null, 20, 0.5),
  ('twelvedata', 'Twelve Data (état des places)', '{"controle": 1}', 'direct', true, 'TWELVEDATA_API_KEY', 900, 8, 800, 0.5),
  ('goldapi', 'gold-api.com', '{"metaux": 1}', 'direct', false, null, 30, 60, null, 0.5),
  ('goldprice', 'goldprice.dev', '{"metaux": 2}', 'direct', false, 'GOLDPRICE_DEV_API_KEY', 900, 10, 2400, 0.5),
  ('fawaz', 'fawazahmed0 currency-api', '{"metaux": 3, "devises": 3}', 'differe', false, null, 21600, null, null, 0.5),
  ('exchangerate', 'exchangerate.dev', '{"devises": 1}', 'direct', true, 'EXCHANGERATE_DEV_API_KEY', 900, 10, 160, 0.5),
  ('frankfurter', 'Frankfurter (taux BCE)', '{"devises": 2}', 'differe', false, null, 3600, null, null, 0.5),
  ('eia', 'EIA (données officielles)', '{"petrole": 1}', 'differe', true, 'EIA_API_KEY', 21600, null, 100, 0.5),
  ('fred', 'FRED (CSV sans clé)', '{"petrole": 2}', 'differe', false, null, 21600, null, null, 0.5)
on conflict (id) do nothing;

-- État d'une source, calculé de ses relevés (jamais d'erreur).
create or replace function wm.source_etat(x wm.sources, p_t timestamptz) returns text[]
language sql stable set search_path = '' as $$
  select case
    when not x.actif then array['inactif', 'desactivee']
    when x.cle_requise and x.cle_presente is not true then array['inactif', 'cle_absente']
    when x.pause_jusqua > p_t then array['erreur', 'pause']
    when x.dernier_ok_at is not null and x.dernier_ok_at >= coalesce(x.derniere_erreur_at, '-infinity'::timestamptz) then array[x.nature, 'ok']
    when x.derniere_erreur_at is not null then array['erreur', 'echec']
    else array['inactif', 'en_reserve'] end                                                       -- jamais appelée : la principale suffit
$$;

-- ══ 5. Les cours ══
create table if not exists wm.px_actifs (
  id text primary key,                              -- btc, nvda, spx, xau, eurusd, wti…
  famille text not null check (famille in ('crypto', 'actions_us', 'indices', 'actions_eu', 'metaux', 'devises', 'petrole')),
  nom text not null,
  marche text not null references wm.px_marches (id),
  symboles jsonb not null default '{}'::jsonb,      -- {source: symbole chez elle} ; « 1/EUR » : inverse du taux reçu
  decimales smallint not null default 2,
  ref numeric not null check (ref > 0),             -- niveau du 19 nov. 2026 : la valeur simulée, en dernier recours
  seuil_direct_s integer not null,                  -- au-delà de cet âge, le cours est « retardé »
  ordre smallint not null default 0
);
alter table wm.px_actifs enable row level security;
revoke all on wm.px_actifs from public, anon, authenticated;

insert into wm.px_actifs (id, famille, nom, marche, symboles, decimales, ref, seuil_direct_s, ordre) values
  ('btc', 'crypto', 'Bitcoin', 'CRYPTO', '{"binance":"BTCUSDT","kraken":"XBTUSD","coinbase":"BTC","coingecko":"bitcoin"}', 2, 63194.07, 60, 1),
  ('eth', 'crypto', 'Ethereum', 'CRYPTO', '{"binance":"ETHUSDT","kraken":"ETHUSD","coinbase":"ETH","coingecko":"ethereum"}', 2, 1782.92, 60, 2),
  ('sol', 'crypto', 'Solana', 'CRYPTO', '{"binance":"SOLUSDT","kraken":"SOLUSD","coinbase":"SOL","coingecko":"solana"}', 2, 73.84, 60, 3),
  ('xrp', 'crypto', 'XRP', 'CRYPTO', '{"binance":"XRPUSDT","kraken":"XRPUSD","coinbase":"XRP","coingecko":"ripple"}', 4, 0.9761, 60, 4),
  ('bnb', 'crypto', 'BNB', 'CRYPTO', '{"binance":"BNBUSDT","kraken":"BNBUSD","coinbase":"BNB","coingecko":"binancecoin"}', 2, 587.24, 60, 5),
  ('doge', 'crypto', 'Dogecoin', 'CRYPTO', '{"binance":"DOGEUSDT","kraken":"XDGUSD","coinbase":"DOGE","coingecko":"dogecoin"}', 5, 0.05888, 60, 6),
  ('ada', 'crypto', 'Cardano', 'CRYPTO', '{"binance":"ADAUSDT","kraken":"ADAUSD","coinbase":"ADA","coingecko":"cardano"}', 4, 0.1534, 60, 7),
  ('avax', 'crypto', 'Avalanche', 'CRYPTO', '{"binance":"AVAXUSDT","kraken":"AVAXUSD","coinbase":"AVAX","coingecko":"avalanche-2"}', 3, 7.021, 60, 8),
  ('link', 'crypto', 'Chainlink', 'CRYPTO', '{"binance":"LINKUSDT","kraken":"LINKUSD","coinbase":"LINK","coingecko":"chainlink"}', 3, 9.06, 60, 9),
  ('ltc', 'crypto', 'Litecoin', 'CRYPTO', '{"binance":"LTCUSDT","kraken":"LTCUSD","coinbase":"LTC","coingecko":"litecoin"}', 2, 43.48, 60, 10),
  ('nvda', 'actions_us', 'Nvidia', 'NYSE', '{"finnhub":"NVDA","yahoo":"NVDA"}', 2, 153.51, 120, 20),
  ('aapl', 'actions_us', 'Apple', 'NYSE', '{"finnhub":"AAPL","yahoo":"AAPL"}', 2, 349.97, 120, 21),
  ('msft', 'actions_us', 'Microsoft', 'NYSE', '{"finnhub":"MSFT","yahoo":"MSFT"}', 2, 514.63, 120, 22),
  ('tsla', 'actions_us', 'Tesla', 'NYSE', '{"finnhub":"TSLA","yahoo":"TSLA"}', 2, 383.15, 120, 23),
  ('amzn', 'actions_us', 'Amazon', 'NYSE', '{"finnhub":"AMZN","yahoo":"AMZN"}', 2, 269.57, 120, 24),
  ('googl', 'actions_us', 'Alphabet', 'NYSE', '{"finnhub":"GOOGL","yahoo":"GOOGL"}', 2, 288.94, 120, 25),
  ('meta', 'actions_us', 'Meta', 'NYSE', '{"finnhub":"META","yahoo":"META"}', 2, 620.00, 120, 26),
  ('spy', 'actions_us', 'S&P 500 (fonds SPY)', 'NYSE', '{"finnhub":"SPY","yahoo":"SPY"}', 2, 730.81, 120, 27),
  ('qqq', 'actions_us', 'Nasdaq 100 (fonds QQQ)', 'NYSE', '{"finnhub":"QQQ","yahoo":"QQQ"}', 2, 664.00, 120, 28),
  ('spx', 'indices', 'S&P 500', 'NYSE', '{"yahoo":"^GSPC","eodhd":"GSPC.INDX"}', 2, 7326.00, 120, 30),
  ('ndx', 'indices', 'Nasdaq 100', 'NYSE', '{"yahoo":"^NDX","eodhd":"NDX.INDX"}', 2, 27288.45, 120, 31),
  ('dji', 'indices', 'Dow Jones', 'NYSE', '{"yahoo":"^DJI","eodhd":"DJI.INDX"}', 2, 49811.47, 120, 32),
  ('cac', 'indices', 'CAC 40', 'EURONEXT', '{"yahoo":"^FCHI","eodhd":"FCHI.INDX"}', 2, 8088.69, 120, 33),
  ('dax', 'indices', 'DAX', 'XETRA', '{"yahoo":"^GDAXI","eodhd":"GDAXI.INDX"}', 2, 25514.38, 120, 34),
  ('n225', 'indices', 'Nikkei 225', 'TSE', '{"yahoo":"^N225","eodhd":"N225.INDX"}', 2, 59444.21, 120, 35),
  ('mc', 'actions_eu', 'LVMH', 'EURONEXT', '{"yahoo":"MC.PA","eodhd":"MC.PA"}', 2, 391.55, 120, 40),
  ('asml', 'actions_eu', 'ASML', 'EURONEXT', '{"yahoo":"ASML.AS","eodhd":"ASML.AS"}', 2, 1289.20, 120, 41),
  ('tte', 'actions_eu', 'TotalEnergies', 'EURONEXT', '{"yahoo":"TTE.PA","eodhd":"TTE.PA"}', 2, 79.40, 120, 42),
  ('xau', 'metaux', 'Or (once)', 'CME', '{"goldapi":"XAU","goldprice":"XAU","fawaz":"1/xau"}', 2, 3687.77, 300, 50),
  ('xag', 'metaux', 'Argent (once)', 'CME', '{"goldapi":"XAG","goldprice":"XAG","fawaz":"1/xag"}', 3, 44.675, 300, 51),
  ('eurusd', 'devises', 'EUR/USD', 'FX', '{"exchangerate":"1/EUR","frankfurter":"1/EUR","fawaz":"1/eur"}', 5, 1.09792, 600, 60),
  ('gbpusd', 'devises', 'GBP/USD', 'FX', '{"exchangerate":"1/GBP","frankfurter":"1/GBP","fawaz":"1/gbp"}', 5, 1.31160, 600, 61),
  ('usdjpy', 'devises', 'USD/JPY', 'FX', '{"exchangerate":"JPY","frankfurter":"JPY","fawaz":"jpy"}', 3, 159.835, 600, 62),
  ('usdils', 'devises', 'USD/ILS', 'FX', '{"exchangerate":"ILS","frankfurter":"ILS","fawaz":"ils"}', 4, 3.2982, 600, 63),
  ('usdchf', 'devises', 'USD/CHF', 'FX', '{"exchangerate":"CHF","frankfurter":"CHF","fawaz":"chf"}', 4, 0.8429, 600, 64),
  ('wti', 'petrole', 'Pétrole WTI', 'CME', '{"eia":"RWTC","fred":"DCOILWTICO"}', 2, 89.53, 3600, 70),
  ('brent', 'petrole', 'Pétrole Brent', 'ICE', '{"eia":"RBRTE","fred":"DCOILBRENTEU"}', 2, 92.94, 3600, 71)
on conflict (id) do nothing;

-- Le dernier cours de chaque actif (une ligne par actif, mise à jour en place).
create table if not exists wm.px_dernier (
  actif text primary key references wm.px_actifs (id),
  prix numeric not null check (prix > 0),
  source text not null,
  source_t timestamptz,                             -- heure de la cotation chez la source (vide : inconnue, on garde l'heure d'écriture)
  t timestamptz not null,                           -- heure d'écriture en base (jamais antidatée)
  n bigint not null default 1
);
alter table wm.px_dernier enable row level security;
revoke all on wm.px_dernier from public, anon, authenticated;

-- Anneau d'une heure : un emplacement par actif et par tranche de 3 secondes (slot = secondes depuis 1970 / 3, modulo 1200),
-- réécrit en place à chaque tour. Rien n'est jamais effacé.
create table if not exists wm.px_echantillons (
  actif text not null,
  slot integer not null check (slot >= 0 and slot < 1200),
  t timestamptz not null,
  prix numeric not null,
  source text not null,
  primary key (actif, slot)
) with (fillfactor = 70);
alter table wm.px_echantillons enable row level security;
revoke all on wm.px_echantillons from public, anon, authenticated;

-- L'instantané lu par le site : une seule ligne, refaite à chaque passage de la collecte.
create table if not exists wm.live_cache (
  id smallint primary key check (id = 1),
  cours jsonb not null default '{}'::jsonb,
  familles jsonb not null default '{}'::jsonb,
  cours_at timestamptz,
  eclair jsonb,                                     -- partie du pari éclair (lot 7)
  eclair_at timestamptz
);
alter table wm.live_cache enable row level security;
revoke all on wm.live_cache from public, anon, authenticated;
insert into wm.live_cache (id) values (1) on conflict (id) do nothing;

-- Une seule boucle de collecte à la fois : un bail, renouvelé à chaque passage.
create table if not exists wm.donnees_boucle (
  id smallint primary key check (id = 1),
  porteur uuid,
  debut_at timestamptz,
  jusqua timestamptz,
  passes integer not null default 0,
  maj_at timestamptz
);
alter table wm.donnees_boucle enable row level security;
revoke all on wm.donnees_boucle from public, anon, authenticated;
insert into wm.donnees_boucle (id) values (1) on conflict (id) do nothing;

-- Refait l'instantané des cours : direct (d) si la cotation a moins que le seuil de son actif, retardé (r) au-delà ou si elle
-- vient d'une source par nature différée, simulé (s) si aucune source n'a jamais répondu (niveau de référence).
create or replace function wm.live_cours_refaire(p_t timestamptz default clock_timestamp()) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cours jsonb; v_fam jsonb;
begin
  with x as (
    select a.id, a.famille, a.decimales, coalesce(d.prix, a.ref) as prix,
           case when d.actif is null then 's'
                when coalesce(s.nature, 'direct') = 'differe' then 'r'
                when p_t - coalesce(d.source_t, d.t) <= make_interval(secs => a.seuil_direct_s) then 'd'
                else 'r' end as e,
           coalesce(d.source_t, d.t) as st, wm.marche_ouvert(a.marche, p_t) as o
    from wm.px_actifs a left join wm.px_dernier d on d.actif = a.id left join wm.sources s on s.id = d.source)
  select coalesce(jsonb_object_agg(x.id, jsonb_build_object('p', round(x.prix, x.decimales + 2), 'e', x.e, 't', wm.en_ms(x.st), 'o', x.o::integer)), '{}'::jsonb),
         coalesce((select jsonb_object_agg(y.famille, y.e) from (
            select x2.famille, case when bool_or(x2.e = 's') then 'simule' when bool_or(x2.e = 'r') then 'differe' else 'direct' end as e
            from x x2 group by x2.famille) y), '{}'::jsonb)
    into v_cours, v_fam
  from x;
  update wm.live_cache set cours = v_cours, familles = v_fam, cours_at = p_t where id = 1;
end $$;

-- Ce que lit le site : instantané (un seul accès), et la courbe des 90 dernières secondes d'un actif s'il la demande.
-- Ouvert aux visiteurs ; ne réveille pas les bots (aucun signal de présence).
create or replace function wm.live(p_serie text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('v', 1, 't', wm.en_ms(clock_timestamp()), 'cours', c.cours, 'familles', c.familles, 'cours_at', wm.en_ms(c.cours_at),
           'eclair', c.eclair, 'eclair_at', wm.en_ms(c.eclair_at), 'next', 10000)
      || case when p_serie is null then '{}'::jsonb else jsonb_build_object('serie', coalesce((
           select jsonb_agg(jsonb_build_array(wm.en_ms(e.t), e.prix) order by e.t) from wm.px_echantillons e
           where e.actif = p_serie and e.t > clock_timestamp() - interval '90 seconds'), '[]'::jsonb)) end
  from wm.live_cache c where c.id = 1
$$;
create or replace function public.api_live(p_serie text default null) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.live(p_serie) $$;
insert into wm.droits_liste (nom, qui) values ('live', 'visiteur') on conflict do nothing;

-- ══ 6. Ce que l'Edge Function « donnees » appelle (clé de service seulement) ══
-- Le bail : une seule boucle à la fois. Durée 0 : la boucle rend le bail en partant.
create or replace function public.srv_donnees_bail(p_porteur uuid, p_duree_s integer default 70) returns boolean
language plpgsql security definer set search_path = '' as $$
declare b wm.donnees_boucle; v_now timestamptz := clock_timestamp();
begin
  if p_porteur is null then return false; end if;
  select * into b from wm.donnees_boucle where id = 1 for update;
  if b.porteur is not null and b.porteur <> p_porteur and b.jusqua > v_now then return false; end if;
  if coalesce(p_duree_s, 70) <= 0 then
    update wm.donnees_boucle set jusqua = v_now, maj_at = v_now where id = 1 and porteur = p_porteur;
    return true;
  end if;
  update wm.donnees_boucle set porteur = p_porteur,
    debut_at = case when b.porteur is distinct from p_porteur then v_now else b.debut_at end,
    passes = case when b.porteur is distinct from p_porteur then 0 else b.passes end,
    jusqua = v_now + make_interval(secs => least(greatest(p_duree_s, 5), 120)), maj_at = v_now
  where id = 1;
  return true;
end $$;

-- La configuration d'une boucle : sources (compteurs du jour, pause), actifs et symboles, places ouvertes, réglages.
create or replace function public.srv_donnees_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    't', wm.en_ms(clock_timestamp()),
    'reglages', jsonb_build_object('actif', wm.reglage_bool('donnees.actif', true), 'cadence_s', wm.reglage_num('donnees.cadence_s', 3),
                                   'boucle_s', wm.reglage_num('donnees.boucle_s', 55)),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'rangs', s.rangs, 'nature', s.nature, 'cle_requise', s.cle_requise,
        'secret', s.secret, 'actif', s.actif, 'cadence_s', s.cadence_s, 'quota_min', s.quota_min, 'quota_jour', s.quota_jour, 'marge', s.marge,
        'appels_jour', case when s.jour = (clock_timestamp() at time zone 'UTC')::date then s.appels_jour else 0 end,
        'erreurs_suite', s.erreurs_suite, 'pause_jusqua', wm.en_ms(s.pause_jusqua), 'dernier_ok', wm.en_ms(s.dernier_ok_at),
        'dernier_appel', wm.en_ms(greatest(s.dernier_ok_at, s.derniere_erreur_at)), 'config', s.config)
        order by s.id) from wm.sources s), '[]'::jsonb),
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'famille', a.famille, 'marche', a.marche, 'symboles', a.symboles,
        'ouvert', wm.marche_ouvert(a.marche, clock_timestamp()), 'dernier', wm.en_ms(d.t)) order by a.ordre, a.id)
        from wm.px_actifs a left join wm.px_dernier d on d.actif = a.id), '[]'::jsonb),
    'marches', coalesce((select jsonb_object_agg(m.id, wm.marche_ouvert(m.id, clock_timestamp())) from wm.px_marches m), '{}'::jsonb))
$$;

-- Un passage de la collecte : les cotations reçues, puis le bilan de chaque source appelée.
--   p : { porteur, cours: [{a, p, src, st}], sources: [{id, appels, ok, err, code, erreur, ms, pause_ms, cle}],
--         controle: {XNYS: true, …} (facultatif) }
-- L'heure d'un échantillon est celle de son écriture en base (jamais antidatée). Une cotation plus ancienne que celle déjà
-- gardée pour un actif ne la remplace pas.
create or replace function public.srv_cours_ingerer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp(); v_jour date := (clock_timestamp() at time zone 'UTC')::date;
  c jsonb; s jsonb; v_prix numeric; v_st timestamptz; v_n integer := 0; v_slot integer; v_ok integer; v_err integer; v_pause numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then perform wm.fail('requete'); end if;
  v_slot := (floor(extract(epoch from v_now) / 3)::bigint % 1200)::integer;
  for c in select e from jsonb_array_elements(case when jsonb_typeof(p -> 'cours') = 'array' then p -> 'cours' else '[]'::jsonb end) e loop
    v_prix := wm.num(c ->> 'p');
    continue when v_prix is null or v_prix <= 0 or not exists (select 1 from wm.px_actifs a where a.id = c ->> 'a');
    v_st := case when wm.num(c ->> 'st') > 0 then to_timestamp(wm.num(c ->> 'st') / 1000.0) end;
    if v_st > v_now then v_st := v_now; end if;                                 -- horloge d'une source en avance : bornée à maintenant
    insert into wm.px_dernier as d (actif, prix, source, source_t, t, n) values (c ->> 'a', v_prix, left(coalesce(c ->> 'src', '?'), 40), v_st, v_now, 1)
    on conflict (actif) do update set prix = excluded.prix, source = excluded.source, source_t = excluded.source_t, t = excluded.t, n = d.n + 1
    where coalesce(excluded.source_t, excluded.t) >= coalesce(d.source_t, d.t);
    insert into wm.px_echantillons as e (actif, slot, t, prix, source) values (c ->> 'a', v_slot, v_now, v_prix, left(coalesce(c ->> 'src', '?'), 40))
    on conflict (actif, slot) do update set t = excluded.t, prix = excluded.prix, source = excluded.source;
    v_n := v_n + 1;
  end loop;
  for s in select e from jsonb_array_elements(case when jsonb_typeof(p -> 'sources') = 'array' then p -> 'sources' else '[]'::jsonb end) e loop
    v_ok := greatest(coalesce(wm.num(s ->> 'ok'), 0), 0)::integer; v_err := greatest(coalesce(wm.num(s ->> 'err'), 0), 0)::integer;
    v_pause := wm.num(s ->> 'pause_ms');
    update wm.sources x set
      appels_jour = case when x.jour = v_jour then x.appels_jour else 0 end + greatest(coalesce(wm.num(s ->> 'appels'), 0), 0)::integer,
      appels_total = x.appels_total + greatest(coalesce(wm.num(s ->> 'appels'), 0), 0)::integer,
      jour = v_jour,
      cle_presente = case when jsonb_typeof(s -> 'cle') = 'boolean' then (s ->> 'cle')::boolean else x.cle_presente end,
      erreurs_suite = case when v_ok > 0 then 0 else x.erreurs_suite + v_err end,
      pause_jusqua = case when v_pause is null then x.pause_jusqua when v_pause <= 0 then null else to_timestamp(v_pause / 1000.0) end,
      dernier_ok_at = case when v_ok > 0 then v_now else x.dernier_ok_at end,
      derniere_erreur = case when v_err > 0 then left(coalesce(s ->> 'erreur', 'erreur'), 300) else x.derniere_erreur end,
      derniere_erreur_at = case when v_err > 0 and v_ok = 0 then v_now else x.derniere_erreur_at end,
      dernier_code = coalesce(wm.num(s ->> 'code')::integer, x.dernier_code),
      dernier_ms = coalesce(wm.num(s ->> 'ms')::integer, x.dernier_ms),
      maj_at = v_now
    where x.id = s ->> 'id';
  end loop;
  update wm.sources x set etat = (wm.source_etat(x, v_now))[1], raison = (wm.source_etat(x, v_now))[2]
  where x.etat is distinct from (wm.source_etat(x, v_now))[1] or x.raison is distinct from (wm.source_etat(x, v_now))[2];
  if jsonb_typeof(p -> 'controle') = 'object' then
    update wm.px_marches m set controle = jsonb_build_object('source', 'twelvedata', 'ouvert', p -> 'controle' -> (case m.id
        when 'NYSE' then 'XNYS' when 'EURONEXT' then 'XPAR' when 'XETRA' then 'XETR' when 'TSE' then 'XJPX' end), 'at', wm.en_ms(v_now)), maj_at = v_now
    where m.id in ('NYSE', 'EURONEXT', 'XETRA', 'TSE');
  end if;
  perform wm.live_cours_refaire(v_now);
  if wm.eq_uuid(p ->> 'porteur') is not null then
    update wm.donnees_boucle set jusqua = greatest(jusqua, v_now + interval '20 seconds'), passes = passes + 1, maj_at = v_now
    where id = 1 and porteur = wm.eq_uuid(p ->> 'porteur');
  end if;
  return jsonb_build_object('ok', true, 't', wm.en_ms(v_now), 'cours', v_n);
end $$;

-- ══ 7. Réveiller une Edge Function (tâches planifiées) ══
-- Le jeton est lu dans Vault au moment de l'appel : il n'est ni dans le texte de la tâche, ni dans le dépôt.
-- En-tête x-region : la fonction tourne dans la région de la base (Sydney), où Binance répond (en Virginie : 451).
create or replace function wm.appeler(p_fonction text, p_corps jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_jeton text; v_id bigint;
begin
  if p_fonction is null or p_fonction !~ '^[a-z][a-z0-9_-]{1,40}$' then perform wm.fail('requete'); end if;
  if p_fonction = 'donnees' and not wm.reglage_bool('donnees.actif', true) then return null; end if;   -- collecte coupée
  select s.decrypted_secret into v_jeton from vault.decrypted_secrets s where s.name = 'wm_cron_jeton';
  if v_jeton is null then perform wm.fail('jeton_absent'); end if;
  v_id := net.http_post(
    url := 'https://brmwvxncyeypefsgiepf.supabase.co/functions/v1/' || p_fonction,
    body := coalesce(p_corps, '{}'::jsonb),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-wm-jeton', v_jeton, 'x-region', 'ap-southeast-2',
                                  'apikey', 'sb_publishable_iw7LMAYTnX_ETs-mj9sIPQ_pnSdgOd2'),
    timeout_milliseconds := 5000);
  return v_id;
end $$;

-- ══ 8. Le panneau : état des sources, couper ou rallumer une source ══
create or replace function wm.eq_sources_etat(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'rangs', s.rangs, 'etat', s.etat, 'raison', s.raison,
        'actif', s.actif, 'cle_requise', s.cle_requise, 'secret', s.secret, 'cle_presente', s.cle_presente, 'cadence_s', s.cadence_s,
        'quota_min', s.quota_min, 'quota_jour', s.quota_jour, 'marge', s.marge,
        'appels_jour', case when s.jour = (clock_timestamp() at time zone 'UTC')::date then s.appels_jour else 0 end,
        'plafond_jour', case when s.quota_jour is not null then floor(s.quota_jour * s.marge) end,
        'appels_total', s.appels_total, 'erreurs_suite', s.erreurs_suite, 'pause_jusqua', wm.en_ms(s.pause_jusqua),
        'dernier_ok', wm.en_ms(s.dernier_ok_at), 'derniere_erreur', s.derniere_erreur, 'derniere_erreur_at', wm.en_ms(s.derniere_erreur_at),
        'dernier_code', s.dernier_code, 'dernier_ms', s.dernier_ms) order by s.id) from wm.sources s), '[]'::jsonb),
    'marches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nom', m.nom, 'ouvert', wm.marche_ouvert(m.id, clock_timestamp()),
        'rouvre', wm.en_ms(wm.marche_prochaine_ouverture(m.id, clock_timestamp())), 'controle', m.controle) order by m.id) from wm.px_marches m), '[]'::jsonb),
    'familles', (select c.familles from wm.live_cache c where c.id = 1),
    'cours_at', (select wm.en_ms(c.cours_at) from wm.live_cache c where c.id = 1),
    'boucle', (select jsonb_build_object('debut', wm.en_ms(b.debut_at), 'jusqua', wm.en_ms(b.jusqua), 'passes', b.passes) from wm.donnees_boucle b where b.id = 1))
$$;

create or replace function wm.eq_source_activer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x wm.sources; v_actif boolean;
begin
  if jsonb_typeof(p -> 'actif') is distinct from 'boolean' then perform wm.fail('requete'); end if;
  v_actif := (p ->> 'actif')::boolean;
  select * into x from wm.sources s where s.id = p ->> 'id' for update;
  if not found then perform wm.fail('source_inconnue'); end if;
  if x.actif = v_actif then perform wm.fail('reglage_inchange'); end if;
  update wm.sources s set actif = v_actif, maj_at = now() where s.id = x.id;
  update wm.sources s set etat = (wm.source_etat(s, now()))[1], raison = (wm.source_etat(s, now()))[2] where s.id = x.id;
  perform wm.journal_noter(p_admin, 'source_activer', 'source', x.id, jsonb_build_object('actif', x.actif), jsonb_build_object('actif', v_actif),
    p ->> 'motif', jsonb_build_object('action', 'source_activer', 'p', jsonb_build_object('id', x.id, 'actif', x.actif)));
  return wm.eq_sources_etat(p_admin, '{}'::jsonb);
end $$;

insert into wm.equipe_actions (action, fonction, famille, roles, ecrit, motif, annulable, description) values
  ('sources_etat', 'wm.eq_sources_etat', 'sources', '{administrateur}', false, false, false,
   'État des sources de données : direct, retardé, en erreur ou inactif (clé absente), appels du jour et quota, places ouvertes.'),
  ('source_activer', 'wm.eq_source_activer', 'sources', '{administrateur}', true, true, true,
   'Couper ou rallumer une source de données : la cascade passe alors à la suivante.')
on conflict (action) do nothing;

-- ══ 9. La tâche planifiée ══
select cron.schedule('wm-donnees', '* * * * *', $$select wm.appeler('donnees', '{"tache":"boucle"}'::jsonb)$$);

select wm.droits();
