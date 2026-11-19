-- Ce que Supabase fournit d'office (rôles, schémas auth / cron / realtime), en version minimale.
-- Sert uniquement à charger le schéma de Wimoro dans une base Postgres embarquée pour les tests.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create role supabase_admin nologin;
create role dashboard_user nologin;
grant anon, authenticated, service_role to postgres;

create schema auth;
create schema extensions;
create schema cron;
create schema realtime;
create schema vault;
create schema storage;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;

-- Mêmes droits par défaut que sur un projet Supabase : tout est accordé, c'est la RLS qui filtre.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  is_anonymous boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
-- Sessions et facteurs de double authentification : forme minimale des tables de Supabase Auth (colonnes relevées en
-- production le 19 nov. 2026), lues par les fonctions de l'équipe (déconnexion forcée, double authentification).
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  aal text default 'aal1',
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet
);
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type text not null default 'totp',
  status text not null default 'unverified',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- pg_cron : on enregistre les tâches, on ne les exécute pas.
create table cron.job (jobid bigserial primary key, schedule text, command text, nodename text default 'localhost', nodeport int default 5432, database text default 'postgres', username text default 'postgres', active boolean default true, jobname text unique);
create table cron.job_run_details (jobid bigint, runid bigserial primary key, job_pid int, database text, username text, command text, status text, return_message text, start_time timestamptz, end_time timestamptz);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid
$$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d)
$$;
create or replace function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null) returns void language sql as $$
  update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command), active = coalesce(alter_job.active, j.active) where j.jobid = job_id
$$;

-- Realtime : les messages diffusés depuis la base sont simplement rangés dans une table, pour pouvoir les compter.
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast', payload jsonb, event text, private boolean default false, inserted_at timestamptz not null default now());
alter table realtime.messages enable row level security;
grant select on realtime.messages to authenticated;
grant usage on schema realtime to anon, authenticated, service_role;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql security definer as $$
  insert into realtime.messages (payload, event, topic, private) values (payload, event, topic, private)
$$;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create publication supabase_realtime;
