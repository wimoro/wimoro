-- Sauvegarde de sécurité prise avant la réparation front/back (15 nov. 2026).
-- Copie de toutes les tables du schéma public dans un schéma à part, non exposé à l'API.
-- Purement additif : ne modifie aucune table existante.
-- À supprimer une fois la recette validée :  drop schema backup_20261115 cascade;
create schema if not exists backup_20261115;
revoke all on schema backup_20261115 from public;
comment on schema backup_20261115 is 'Copie des tables public prise le 2026-11-15 avant la reparation front/back. A supprimer une fois la recette validee.';

do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    order by c.relname
  loop
    execute format('create table if not exists backup_20261115.%I as table public.%I', r.relname, r.relname);
    execute format('alter table backup_20261115.%I enable row level security', r.relname);
    execute format('revoke all on backup_20261115.%I from public, anon, authenticated', r.relname);
  end loop;
end $$;
