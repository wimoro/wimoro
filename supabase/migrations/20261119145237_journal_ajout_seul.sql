-- Panneau d'administration, lot 1 (suite) : le journal est en ajout seul.
--
-- Sur wm.journal (nouveau journal de l'équipe) et sur wm.admin_journal (journal de l'ancien panneau), des déclencheurs
-- refusent toute modification, tout effacement et tout vidage : pour tout le monde, y compris le propriétaire de la base
-- et les fonctions du serveur. Ils sont posés en mode « toujours » : même une session en mode réplique les déclenche.
-- Seule une migration qui retirerait un déclencheur pourrait passer outre : elle serait visible dans le dépôt, et la
-- chaîne d'empreintes du journal signalerait aussitôt toute entrée changée (wm.journal_verifier).
-- Aucune ligne n'est lue ni écrite ici.

create or replace function wm.journal_immuable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'journal_immuable' using errcode = 'P0001', detail = tg_table_schema || '.' || tg_table_name || ' : ' || tg_op;
end $$;

create trigger journal_ajout_seul before update or delete on wm.journal for each row execute function wm.journal_immuable();
create trigger journal_jamais_vide before truncate on wm.journal for each statement execute function wm.journal_immuable();
create trigger admin_journal_ajout_seul before update or delete on wm.admin_journal for each row execute function wm.journal_immuable();
create trigger admin_journal_jamais_vide before truncate on wm.admin_journal for each statement execute function wm.journal_immuable();
alter table wm.journal enable always trigger journal_ajout_seul;
alter table wm.journal enable always trigger journal_jamais_vide;
alter table wm.admin_journal enable always trigger admin_journal_ajout_seul;
alter table wm.admin_journal enable always trigger admin_journal_jamais_vide;

select wm.droits();
