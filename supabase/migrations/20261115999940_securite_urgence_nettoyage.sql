-- EN ATTENTE D'UNE CONFIRMATION MANUELLE DU PROPRIÉTAIRE (l'outil de base de données la demande pour tout « drop »).
--
-- Nettoyage après la fermeture de l'ancienne API. Rien ici n'est nécessaire à la sécurité : depuis la fermeture, les
-- visiteurs et les joueurs n'ont plus aucun droit sur les tables. Ce fichier range ce qui est devenu sans objet :
--   1. les policies d'écriture (plus personne n'a le droit d'écrire, elles ne décident plus de rien) ;
--   2. la publication temps réel (le site écoute des sujets diffusés par le serveur, plus les changements de tables ;
--      la vider évite au serveur de décoder ces changements pour rien).
-- Aucune donnée n'est touchée. Retour arrière : supabase/livraison/retour_ancienne_api.sql.

-- 1. Policies d'écriture devenues sans objet
do $$
declare p record;
begin
  for p in
    select c.relname as tbl, pol.polname as name
    from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relnamespace = 'public'::regnamespace and pol.polcmd in ('a', 'w', 'd')      -- insert, update, delete
  loop
    execute format('drop policy %I on public.%I', p.name, p.tbl);
  end loop;
end $$;

-- 2. Temps réel : la publication ne diffuse plus aucune table
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' loop
    execute format('alter publication supabase_realtime drop table %I.%I', t.schemaname, t.tablename);
  end loop;
end $$;
