-- Connexion par pseudo : point d'entrée réservé au service de connexion (Edge Function « connexion »).
-- Le schéma « wm » n'étant pas exposé par l'API, le service passe par cette enveloppe, que seul le rôle
-- service_role peut exécuter. Aucun client (visiteur ou joueur connecté) ne peut l'appeler.
create or replace function public.srv_login_lookup(p_pseudo text) returns text
language sql security invoker set search_path = '' as $$ select wm.login_lookup(p_pseudo) $$;
revoke all on function public.srv_login_lookup(text) from public, anon, authenticated;
grant execute on function public.srv_login_lookup(text) to service_role;
