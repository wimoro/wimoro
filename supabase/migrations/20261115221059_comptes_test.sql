-- Comptes de test de la suite de bout en bout (e-mail wimoro-e2e-…@example.com, un domaine réservé aux essais).
--
-- Chaque passage de la suite crée trois comptes jetables dans la vraie base. Jusqu'ici ils y restaient, avec leurs
-- messages dans le chat. Cette migration :
--   1. donne à un compte de test le moyen de se supprimer lui-même à la fin de la suite (api_test_end) ;
--   2. donne au serveur de quoi supprimer d'un coup ceux qui restent (wm.test_purge, aucun droit pour les clients) ;
--   3. supprime ceux qui sont en base aujourd'hui — suppression autorisée explicitement par le propriétaire du projet
--      le 15 nov. 2026, pour ces comptes-là uniquement.
-- Garde-fou commun : si le nombre de comptes ou de profils qui ne sont PAS des comptes de test change, tout est annulé.
-- Ce qui appartient à un compte (positions, messages, amitiés, notifications, opérations…) part avec lui : les clés
-- étrangères vers public.users sont en cascade.

create or replace function wm.est_compte_test(p_email text) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(p_email ~ '^wimoro-e2e-[a-z0-9-]+@example\.com$', false) $$;

-- Supprime, parmi les comptes donnés, ceux qui sont des comptes de test (les autres sont ignorés). Renvoie leur nombre.
create or replace function wm.test_supprimer(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_comptes bigint; v_profils bigint;
begin
  select coalesce(array_agg(a.id), '{}') into v_ids from auth.users a where a.id = any (p_ids) and wm.est_compte_test(a.email);
  select count(*) into v_comptes from auth.users a where not (a.id = any (v_ids));
  select count(*) into v_profils from public.users u where not (u.id = any (v_ids));
  delete from public.users u where u.id = any (v_ids);
  delete from auth.users a where a.id = any (v_ids);
  if (select count(*) from auth.users) <> v_comptes or (select count(*) from public.users) <> v_profils then
    raise exception 'suppression_incoherente' using errcode = 'P0001';
  end if;
  return coalesce(array_length(v_ids, 1), 0);
end $$;

create or replace function wm.test_purge() returns int
language sql security definer set search_path = '' as $$
  select wm.test_supprimer(coalesce(array_agg(a.id), '{}')) from auth.users a where wm.est_compte_test(a.email) $$;

-- Un compte de test se supprime lui-même. Tout autre compte est refusé (auth.uid() et non wm.uid() : un compte de test
-- qui s'est auto-exclu pendant la suite doit pouvoir partir aussi).
create or replace function wm.test_end() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'session' using errcode = 'P0001'; end if;
  if wm.test_supprimer(array[v_uid]) <> 1 then raise exception 'reserve_aux_tests' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.api_test_end() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.test_end() $$;
select wm.droits();

select wm.test_purge();
