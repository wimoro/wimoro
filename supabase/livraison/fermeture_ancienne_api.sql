-- À APPLIQUER COMME MIGRATION, JUSTE APRÈS LA MISE EN LIGNE DU NOUVEAU SITE (fusion de la pull request dans main).
-- Ce fichier n'est pas dans supabase/migrations/ exprès : tant que l'ancien site est en ligne, il a besoin de ces fonctions.
--
-- Fermeture de l'ancienne API. Le nouveau site ne passe que par les fonctions api_… ; les anciennes fonctions restent
-- pourtant appelables par n'importe quel compte connecté, et contournent les nouvelles règles :
--   * place_bet, sell_position : ancien calcul des prix, sans carnet d'ordres ni contrepartie ;
--   * demo_deposit, demo_withdrawal : crédit immédiat, sans plafond de jeu responsable ni pause ;
--   * flash_bet, claim_mission, create_duel… : écritures que le serveur ne contrôle plus de la même façon.
-- On retire seulement le droit de les appeler (aucune suppression : un retour en arrière reste possible en rendant le
-- droit). Les fonctions utilisées par les règles d'accès des tables ne sont pas touchées.
--
-- Après application : relancer les « advisors » de sécurité ; les 50 alertes « SECURITY DEFINER function executable »
-- doivent avoir disparu. L'ancienne tâche planifiée du pari éclair s'arrête par une migration à part, quand le pari
-- éclair du nouveau site sera relié au serveur.

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
