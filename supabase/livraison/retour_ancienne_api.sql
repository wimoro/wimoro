-- RETOUR ARRIÈRE de la fermeture de l'ancienne API. À n'appliquer QUE si l'on remet l'ancien site en ligne
-- (voir docs/EXPLOITATION.md, « Revenir en arrière »). À passer comme une migration, d'un seul bloc.
--
-- Rétablit exactement l'état relevé en production le 15 nov. 2026, juste avant la fermeture :
-- droits de lecture des tables, quelques droits d'écriture, policies d'écriture, publication temps réel,
-- droit d'appeler les 43 anciennes fonctions, ancienne tâche planifiée du pari éclair.
-- Les trous de sécurité fermés par la migration d'urgence (e-mails lisibles, fonctions d'administration ouvertes)
-- ne sont PAS rouverts par ce fichier.

-- ── 1. Lecture des tables (toujours filtrée par les policies de lecture, restées en place) ──────────────────────
grant select on
  public.admin_users, public.auth_accounts, public.badges, public.balance_adjustments, public.balance_ledger,
  public.chat_messages, public.chat_room_members, public.chat_rooms, public.clan_leaderboard_weekly, public.clan_members,
  public.clans, public.combos, public.copy_copies, public.copy_following, public.crypto_prices, public.deposits,
  public.duels, public.features, public.flash_bets, public.flash_games, public.flash_rounds, public.friendships,
  public.market_bets, public.market_groups, public.market_live_state, public.market_outcomes, public.market_price_history,
  public.market_proposals, public.markets, public.missions, public.newsletter_subscribers, public.notifications,
  public.orders, public.position_history, public.positions, public.tier_conditions, public.tier_divisions,
  public.tier_ranks, public.user_badges, public.user_following, public.user_full_state, public.user_preferences,
  public.user_stats, public.user_watchlist, public.withdrawals
to anon, authenticated;
grant select (id, username, bio, avatar_color, avatar_photo, is_demo, created_at) on public.users to anon, authenticated;

-- ── 2. Écritures que l'ancien site faisait encore lui-même ──────────────────────────────────────────────────────
grant update (username, bio, avatar_color, avatar_photo) on public.users to authenticated;
grant insert, update on public.user_full_state, public.user_preferences to authenticated;
grant insert, delete on public.user_following, public.user_watchlist to authenticated;

-- ── 3. Policies d'écriture (retirées par securite_urgence_nettoyage puis par fermeture_ancienne_api) ────────────
create policy "Users can insert own auth" on public.auth_accounts for insert to public with check ((auth.uid() = user_id));
create policy "Users insert own messages" on public.chat_messages for insert to public with check ((auth.uid() = user_id));
create policy "Users insert own memberships" on public.chat_room_members for insert to public with check ((auth.uid() = user_id));
create policy "Users update own memberships" on public.chat_room_members for update to public using ((auth.uid() = user_id));
create policy "Users join clans" on public.clan_members for insert to public with check ((auth.uid() = user_id));
create policy "Users leave clans" on public.clan_members for delete to public using ((auth.uid() = user_id));
create policy "Founders update own clan" on public.clans for update to public using ((auth.uid() = founder_user_id));
create policy "Users create clans" on public.clans for insert to public with check ((auth.uid() = founder_user_id));
create policy "Users delete own copy following" on public.copy_following for delete to public using ((auth.uid() = copy_follower_id));
create policy "Users insert own copy following" on public.copy_following for insert to public with check ((auth.uid() = copy_follower_id));
create policy "Users update own copy following" on public.copy_following for update to public using ((auth.uid() = copy_follower_id));
create policy "Users insert own deposits" on public.deposits for insert to public with check ((auth.uid() = user_id));
create policy "Users insert own flash bets" on public.flash_bets for insert to public with check ((auth.uid() = user_id));
create policy "Users delete own friendships" on public.friendships for delete to public using (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
create policy "Users insert own friendships" on public.friendships for insert to public with check ((auth.uid() = user_id));
create policy "Users update friendships involving them" on public.friendships for update to public using (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
create policy "Authenticated update market state" on public.market_live_state for insert to public with check ((auth.uid() IS NOT NULL));
create policy "Authenticated users update market state" on public.market_live_state for update to public using ((auth.uid() IS NOT NULL));
create policy "Authenticated users can insert price history" on public.market_price_history for insert to public with check ((auth.uid() IS NOT NULL));
create policy "Users create proposals" on public.market_proposals for insert to public with check ((auth.uid() = user_id));
create policy "Users update own proposals" on public.market_proposals for update to public using ((auth.uid() = user_id));
create policy "Users update own missions" on public.missions for update to public using ((auth.uid() = user_id));
create policy "Users delete own notifications" on public.notifications for delete to public using ((auth.uid() = user_id));
create policy "Users insert own notifications" on public.notifications for insert to public with check ((auth.uid() = user_id));
create policy "Users update own notifications" on public.notifications for update to public using ((auth.uid() = user_id));
create policy "Users insert own orders" on public.orders for insert to public with check ((auth.uid() = user_id));
create policy "Users update own orders" on public.orders for update to public using ((auth.uid() = user_id));
create policy "Users insert own position history" on public.position_history for insert to public with check ((auth.uid() = user_id));
create policy "Users delete own positions" on public.positions for delete to public using ((auth.uid() = user_id));
create policy "Users insert own positions" on public.positions for insert to public with check ((auth.uid() = user_id));
create policy "Users update own positions" on public.positions for update to public using ((auth.uid() = user_id));
create policy "Users insert own badges" on public.user_badges for insert to public with check ((auth.uid() = user_id));
create policy "Users manage own follows" on public.user_following for insert to public with check ((auth.uid() = follower_id));
create policy "Users unfollow" on public.user_following for delete to public using ((auth.uid() = follower_id));
create policy "Users insert own state" on public.user_full_state for insert to public with check ((auth.uid() = user_id));
create policy "Users update own state" on public.user_full_state for update to public using ((auth.uid() = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Service can insert user preferences" on public.user_preferences for insert to public with check (true);
create policy "Users insert own preferences" on public.user_preferences for insert to public with check ((auth.uid() = user_id));
create policy "Users update own preferences" on public.user_preferences for update to public using ((auth.uid() = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Service can insert user stats" on public.user_stats for insert to public with check (true);
create policy "Users can insert own stats" on public.user_stats for insert to public with check ((auth.uid() = user_id));
create policy "Users can update own stats" on public.user_stats for update to public using ((auth.uid() = user_id));
create policy "Users manage own watchlist" on public.user_watchlist for insert to public with check ((auth.uid() = user_id));
create policy "Users remove from watchlist" on public.user_watchlist for delete to public using ((auth.uid() = user_id));
create policy "Users can insert own profile" on public.users for insert to public with check ((auth.uid() = id));
create policy "Users can update own profile" on public.users for update to public using ((auth.uid() = id)) with check ((( SELECT auth.uid() AS uid) = id));
create policy "Users insert own withdrawals" on public.withdrawals for insert to public with check ((auth.uid() = user_id));

-- ── 4. Publication temps réel ────────────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.chat_messages, public.flash_rounds, public.market_live_state,
  public.notifications, public.user_stats, public.users;

-- ── 5. Droit d'appeler les anciennes fonctions (43 pour un joueur connecté, dont 7 aussi pour un visiteur) ──────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
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
    execute format('grant execute on function %s to authenticated', f.sig);
    if f.proname in ('get_chat_history', 'get_clan_members', 'get_clans', 'get_leaderboard', 'get_markets',
                     'newsletter_subscribe', 'newsletter_unsubscribe') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;

-- ── 6. Ancienne tâche planifiée du pari éclair ──────────────────────────────────────────────────────────────────
select cron.schedule('flash-tick-server', '* * * * *', 'SELECT public.flash_tick_server()');
