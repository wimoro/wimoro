-- Panneau d'administration et réglages, lot 0 (19 nov. 2026) : filet de sécurité, pris AVANT toute autre modification.
--
-- Copie dans un schéma à part, invisible de l'API :
--   1. la définition (pg_get_functiondef) et les droits de toutes les fonctions des schémas wm et public. Les lots suivants
--      n'ajoutent que des contrôles (blocages, réglages, frais) à certaines d'entre elles ; pour remettre une ancienne
--      définition, une migration d'une ligne suffit :
--        select backup_20261119.restaurer('wm.buy(text,text,numeric,uuid,jsonb)');
--   2. le schéma (colonnes, contraintes, index, déclencheurs, règles d'accès, droits) et les données des tables que les lots
--      suivants touchent : déclencheurs ajoutés (journal de l'ancien panneau, marchés) ou lignes écrites par les nouvelles
--      actions de l'équipe (solde, KYC, rang, messages masqués, clans, réglage des bots).
-- Purement additif : aucune table, aucune fonction, aucune donnée existante n'est modifiée.
create schema if not exists backup_20261119;
revoke all on schema backup_20261119 from public, anon, authenticated;
comment on schema backup_20261119 is 'Sauvegarde du 19 nov. 2026, prise avant le panneau d''administration complet et les réglages (lot 0).';

-- ── 1. Les fonctions ──
create table backup_20261119.fonctions (
  signature text primary key,                    -- wm.buy(text,text,numeric,uuid,jsonb)
  nom text not null,                             -- wm.buy
  definition text not null,                      -- texte exact de pg_get_functiondef : il se rejoue tel quel
  droits text,                                   -- droits d'appel (proacl)
  proprietaire text not null,
  sauve_at timestamptz not null default now()
);
alter table backup_20261119.fonctions enable row level security;
revoke all on backup_20261119.fonctions from public, anon, authenticated;
insert into backup_20261119.fonctions (signature, nom, definition, droits, proprietaire)
select p.oid::regprocedure::text, n.nspname || '.' || p.proname, pg_get_functiondef(p.oid), p.proacl::text, pg_get_userbyid(p.proowner)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('wm', 'public') and p.prokind in ('f', 'p')
  and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');

-- ── 2. Les tables touchées : schéma et données ──
create table backup_20261119.tables (
  nom text primary key,                          -- public.users
  copie text not null,                           -- backup_20261119.public_users
  lignes bigint not null,
  colonnes jsonb not null,
  contraintes jsonb not null,
  index jsonb not null,
  declencheurs jsonb not null,
  regles jsonb not null,
  rls boolean not null,
  droits text,
  sauve_at timestamptz not null default now()
);
alter table backup_20261119.tables enable row level security;
revoke all on backup_20261119.tables from public, anon, authenticated;

do $$
declare t text; s text; n text; c text; v_oid oid; v_n bigint;
begin
  foreach t in array array['public.admin_users', 'public.markets', 'public.users', 'public.user_stats', 'public.balance_ledger',
                           'public.notifications', 'public.chat_messages', 'wm.admin_journal', 'wm.config', 'wm.clans_joueurs',
                           'wm.clan_membres', 'wm.rg'] loop
    s := split_part(t, '.', 1); n := split_part(t, '.', 2); c := s || '_' || n;
    v_oid := format('%I.%I', s, n)::regclass::oid;
    execute format('create table backup_20261119.%I as table %I.%I', c, s, n);
    execute format('alter table backup_20261119.%I enable row level security', c);
    execute format('revoke all on backup_20261119.%I from public, anon, authenticated', c);
    execute format('select count(*) from backup_20261119.%I', c) into v_n;
    insert into backup_20261119.tables (nom, copie, lignes, colonnes, contraintes, index, declencheurs, regles, rls, droits)
    select t, 'backup_20261119.' || c, v_n,
      (select coalesce(jsonb_agg(jsonb_build_object('nom', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'non_nul', a.attnotnull,
                'defaut', pg_get_expr(d.adbin, d.adrelid), 'identite', nullif(a.attidentity::text, ''), 'genere', nullif(a.attgenerated::text, ''))
                order by a.attnum), '[]'::jsonb)
       from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped),
      (select coalesce(jsonb_agg(jsonb_build_object('nom', k.conname, 'def', pg_get_constraintdef(k.oid)) order by k.conname), '[]'::jsonb)
       from pg_catalog.pg_constraint k where k.conrelid = v_oid),
      (select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid), '[]'::jsonb)
       from pg_catalog.pg_index i where i.indrelid = v_oid),
      (select coalesce(jsonb_agg(pg_get_triggerdef(g.oid) order by g.tgname), '[]'::jsonb)
       from pg_catalog.pg_trigger g where g.tgrelid = v_oid and not g.tgisinternal),
      (select coalesce(jsonb_agg(jsonb_build_object('nom', r.polname, 'cmd', r.polcmd::text, 'roles', r.polroles::regrole[]::text[],
                'using', pg_get_expr(r.polqual, r.polrelid), 'check', pg_get_expr(r.polwithcheck, r.polrelid)) order by r.polname), '[]'::jsonb)
       from pg_catalog.pg_policy r where r.polrelid = v_oid),
      (select x.relrowsecurity from pg_catalog.pg_class x where x.oid = v_oid),
      (select x.relacl::text from pg_catalog.pg_class x where x.oid = v_oid);
  end loop;
end $$;

-- ── 3. Remettre une ancienne définition (réservé aux migrations : aucun client n'y a accès) ──
create or replace function backup_20261119.restaurer(p_signature text) returns text
language plpgsql security invoker set search_path = '' as $$
declare v_def text;
begin
  select f.definition into v_def from backup_20261119.fonctions f where f.signature = p_signature;
  if v_def is null then raise exception 'fonction_absente' using errcode = 'P0001', detail = p_signature; end if;
  execute v_def;                                 -- create or replace : les droits d'appel de la fonction sont conservés
  return p_signature;
end $$;
revoke all on function backup_20261119.restaurer(text) from public, anon, authenticated;
