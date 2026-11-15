-- Fermeture de l'ancienne API, juste après la mise en ligne du nouveau site (15 nov. 2026).
--
-- Le nouveau site ne passe que par les fonctions api_… (et deux Edge Functions). Vérifié avant d'appliquer ce fichier :
-- tests/ancienne-api.spec.mjs (le site ne cite aucune ancienne fonction et ne lit aucune table), et les journaux du
-- serveur (depuis la mise en ligne, aucun appel à une ancienne fonction).
-- L'ancien site, lui, lisait les tables directement et appelait 43 fonctions qui contournent les nouvelles règles :
--   * place_bet, sell_position : ancien calcul des prix, sans contrepartie ni remise de rang à jour ;
--   * demo_deposit, demo_withdrawal : crédit immédiat, sans plafond de jeu responsable ni pause ;
--   * flash_bet, claim_mission, create_duel… : écritures que le serveur ne contrôle plus de la même façon.
-- Ce fichier ne fait que retirer des droits et arrêter une tâche planifiée : aucune donnée, aucune table, aucune
-- fonction n'est supprimée. Retour arrière : supabase/livraison/retour_ancienne_api.sql rétablit l'état d'avant.

-- 1. Anciennes fonctions : plus personne ne peut les appeler
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'accept_duel', 'accept_friend_request', 'check_badges', 'claim_mission', 'clear_notifications', 'create_clan', 'create_duel',
      'decline_friend_request', 'delete_notification', 'demo_deposit', 'demo_withdrawal', 'flash_bet', 'get_chat_history',
      'get_clan_members', 'get_clans', 'get_friends', 'get_leaderboard', 'get_markets', 'get_my_badges', 'get_my_balance',
      'get_my_clan', 'get_my_copies', 'get_my_deposits', 'get_my_friends', 'get_my_history', 'get_my_notifications',
      'get_my_positions', 'get_my_withdrawals', 'init_daily_missions', 'join_clan', 'leave_clan', 'mark_notifications_read',
      'newsletter_subscribe', 'newsletter_unsubscribe', 'place_bet', 'react_to_message', 'remove_friend', 'search_users',
      'sell_position', 'send_chat_message', 'send_friend_request', 'start_copy', 'stop_copy')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 2. Tables : plus aucun accès direct pour les visiteurs ni pour les joueurs
--    (retire aussi les droits donnés colonne par colonne sur public.users ; sans droit de lecture, le temps réel
--    ne peut plus non plus leur transmettre les changements de ces tables)
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

-- 3. Ancienne tâche planifiée du pari éclair (une manche par minute dans public.flash_rounds) : arrêtée.
--    Le pari éclair du nouveau site est réglé par l'Edge Function « eclair ».
select cron.unschedule(j.jobname) from cron.job j where j.jobname = 'flash-tick-server';
