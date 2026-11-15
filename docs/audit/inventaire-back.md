# Inventaire du back Supabase

Généré par `tools/audit/inventaire-back.mjs` à partir du catalogue Postgres exporté le 2026-11-14 23:39 UTC (Postgres 17.11, base de 47.5 Mo).

- 46 tables, 92 policies RLS, 71 fonctions, 1 vue, 3 tâches cron.
- Comptes d'authentification : 19 (tous confirmés). Stockage de fichiers : 0 objet. Extensions : pg_cron, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.

## Tables

| Table | Lignes (estim.) | Taille | RLS | Qui peut faire quoi (policies) | Triggers |
|---|---:|---:|---|---|---|
| `user_full_state` | 10021 | 7.1 Mo | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | set_updated_at |
| `flash_bets` | 27561 | 5.6 Mo | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)` | — |
| `users` | 10021 | 4.4 Mo | oui | **ajout** :  (contrôle `(auth.uid() = id)`)<br>**modification** : `(auth.uid() = id)`<br>**lecture** : `true` | on_user_created, set_updated_at, sync_users_to_blob |
| `user_stats` | 10021 | 3.1 Mo | oui | **ajout** :  (contrôle `true`)<br>**lecture** : `true`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**modification** : `(auth.uid() = user_id)` | set_updated_at, sync_stats_to_blob |
| `market_price_history` | 11450 | 2.7 Mo | oui | **ajout** :  (contrôle `(auth.uid() IS NOT NULL)`)<br>**lecture** : `true` | — |
| `chat_messages` | 9959 | 2.7 Mo | oui | **lecture** : `true`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`) | — |
| `market_bets` | 14335 | 1.8 Mo | oui | **lecture** : `true` | — |
| `flash_rounds` | 7817 | 1.8 Mo | oui | **lecture** : `true` | set_updated_at |
| `user_preferences` | 10021 | 1.5 Mo | oui | **ajout** :  (contrôle `true`)<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | set_updated_at |
| `balance_ledger` | 5159 | 928 Ko | oui | **lecture** : `(auth.uid() = user_id)` | — |
| `user_following` | 3740 | 736 Ko | oui | **lecture** : `true`<br>**ajout** :  (contrôle `(auth.uid() = follower_id)`)<br>**suppression** : `(auth.uid() = follower_id)` | — |
| `market_live_state` | 27 | 176 Ko | oui | **ajout** :  (contrôle `(auth.uid() IS NOT NULL)`)<br>**modification** : `(auth.uid() IS NOT NULL)`<br>**lecture** : `true` | — |
| `markets` | 27 | 144 Ko | oui | **lecture** : `true` | set_updated_at |
| `positions` | 14 | 96 Ko | oui | **suppression** : `(auth.uid() = user_id)`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | set_updated_at |
| `notifications` | 32 | 80 Ko | oui | **suppression** : `(auth.uid() = user_id)`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | — |
| `balance_adjustments` | 1 | 64 Ko | oui | **lecture** : `(auth.uid() IN ( SELECT admin_users.user_id FROM admin_users))` | — |
| `deposits` | 15 | 64 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)` | — |
| `market_groups` | 3 | 64 Ko | oui | **lecture** : `true` | — |
| `market_outcomes` | 17 | 64 Ko | oui | **lecture** : `true` | — |
| `missions` | 15 | 64 Ko | oui | **lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | — |
| `withdrawals` | 4 | 64 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)` | — |
| `clan_members` | 4 | 48 Ko | oui | **lecture** : `true`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**suppression** : `(auth.uid() = user_id)` | — |
| `clans` | 4 | 48 Ko | oui | **lecture** : `true`<br>**modification** : `(auth.uid() = founder_user_id)`<br>**ajout** :  (contrôle `(auth.uid() = founder_user_id)`) | set_updated_at |
| `friendships` | 7 | 48 Ko | oui | **suppression** : `((auth.uid() = user_id) OR (auth.uid() = friend_id))`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `((auth.uid() = user_id) OR (auth.uid() = friend_id))`<br>**modification** : `((auth.uid() = user_id) OR (auth.uid() = friend_id))` | — |
| `newsletter_subscribers` | 4 | 48 Ko | oui | _aucune : accès par fonctions uniquement_ | — |
| `tier_ranks` | 9 | 48 Ko | oui | **lecture** : `true` | — |
| `copy_following` | 0 | 40 Ko | oui | **suppression** : `(auth.uid() = copy_follower_id)`<br>**ajout** :  (contrôle `(auth.uid() = copy_follower_id)`)<br>**lecture** : `(auth.uid() = copy_follower_id)`<br>**modification** : `(auth.uid() = copy_follower_id)` | — |
| `orders` | 0 | 40 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | set_updated_at |
| `tier_divisions` | 25 | 40 Ko | oui | **lecture** : `true` | — |
| `admin_users` | 1 | 32 Ko | oui | **lecture** : `(auth.uid() IN ( SELECT admin_users_1.user_id FROM admin_users admin_users_1))` | — |
| `auth_accounts` | 0 | 32 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)` | — |
| `badges` | 10 | 32 Ko | oui | **lecture** : `true` | — |
| `chat_rooms` | 33 | 32 Ko | oui | **lecture** : `true` | — |
| `crypto_prices` | 5 | 32 Ko | oui | **lecture** : `true` | — |
| `duels` | 4 | 32 Ko | oui | **lecture** : `((auth.uid() = creator_id) OR (auth.uid() = opponent_id))` | — |
| `features` | 19 | 32 Ko | oui | **lecture** : `true` | — |
| `flash_games` | 19 | 32 Ko | oui | **lecture** : `true` | — |
| `position_history` | 0 | 32 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)` | — |
| `tier_conditions` | 18 | 32 Ko | oui | **lecture** : `true` | — |
| `user_badges` | 13 | 32 Ko | oui | **lecture** : `true`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`) | — |
| `chat_room_members` | 0 | 24 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**modification** : `(auth.uid() = user_id)` | — |
| `clan_leaderboard_weekly` | 0 | 24 Ko | oui | **lecture** : `true` | — |
| `copy_copies` | 0 | 24 Ko | oui | **lecture** : `(auth.uid() = copier_user_id)` | — |
| `combos` | 0 | 16 Ko | oui | **lecture** : `(auth.uid() = user_id)` | — |
| `market_proposals` | 0 | 16 Ko | oui | **lecture** : `true`<br>**ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**modification** : `(auth.uid() = user_id)` | — |
| `user_watchlist` | 0 | 16 Ko | oui | **ajout** :  (contrôle `(auth.uid() = user_id)`)<br>**lecture** : `(auth.uid() = user_id)`<br>**suppression** : `(auth.uid() = user_id)` | — |

Toutes les tables accordent tous les droits SQL aux rôles `anon` et `authenticated` (réglage par défaut de Supabase) : seule la RLS filtre.

## Fonctions

| Fonction | Renvoie | Mode | search_path | Exécutable par | Contrôle `auth.uid()` | Taille |
|---|---|---|---|---|---|---:|
| `_post_bet_hook(p_user_id uuid)` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 240 |
| `accept_duel(p_duel_id uuid)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 1336 |
| `accept_friend_request(p_from_user_id uuid)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 561 |
| `admin_adjust_balance(target_username text, adjustment numeric, adjustment_reason text)` | TABLE(username text, balance_before text, balance_after text… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 1879 |
| `admin_balance_history(target_username text, n integer)` | TABLE(adjusted_at timestamp with time zone, username text, a… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 630 |
| `admin_ban_user(target_username text, ban boolean)` | text | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 766 |
| `admin_get_player(search_term text)` | TABLE(user_id uuid, username text, email text, balance_displ… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 1163 |
| `admin_set_balance(target_username text, new_balance numeric, adjustment_reason text)` | TABLE(username text, balance_before text, balance_after text… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 1754 |
| `admin_set_player(target_username text, p_balance numeric, p_xp integer, p_rank_tier integer, p_rank_division integer, p_bets_placed integer, p_bets_won integer, p_flash_wins integer)` | TABLE(username text, field_updated text, new_value text) | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 2422 |
| `admin_set_rank(target_username text, rank_name text, division integer)` | TABLE(username text, old_rank text, new_rank text) | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 2174 |
| `admin_top_players(n integer)` | TABLE(username text, email text, balance numeric, xp integer… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 562 |
| `book_depth(p_volume numeric, p_liq numeric)` | numeric | invoker | **non fixé** | anon, authenticated, public | **aucun** | 219 |
| `bot_chat_activity()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 2046 |
| `bot_flash_activity()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 2183 |
| `bot_market_make()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 1571 |
| `bot_social_activity()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 1554 |
| `bot_tick()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 357 |
| `check_badges()` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 2303 |
| `claim_mission(p_mission_id uuid)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 746 |
| `clear_notifications()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 205 |
| `create_clan(p_name text, p_description text, p_emblem_color text, p_emblem_icon text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 1420 |
| `create_duel(p_market_id text, p_side text, p_stake numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 1067 |
| `create_notification(p_user_id uuid, p_icon text, p_text text, p_href text)` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 497 |
| `decline_friend_request(p_from_user_id uuid)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 333 |
| `delete_notification(p_id uuid)` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 228 |
| `demo_deposit(p_coin text, p_network text, p_amount numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 1664 |
| `demo_withdrawal(p_network text, p_address text, p_amount numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 1257 |
| `eng_constants()` | jsonb | invoker | **non fixé** | anon, authenticated, public | **aucun** | 237 |
| `flash_bet(p_game_id text, p_side text, p_amount numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 2344 |
| `flash_settle_round(p_round_id uuid)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 2094 |
| `flash_tick_server()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 897 |
| `get_chat_history(p_room_id text, p_limit integer)` | TABLE(id bigint, room_id text, username text, avatar_color t… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 595 |
| `get_clan_members(p_clan_id uuid)` | TABLE(username text, avatar_color text, role text, joined_at… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 429 |
| `get_clans()` | TABLE(id uuid, name text, description text, emblem_color tex… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 445 |
| `get_friends()` | TABLE(username text, avatar_color text, status text, directi… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 600 |
| `get_leaderboard(p_period text, p_limit integer)` | TABLE(rank bigint, username text, avatar_color text, balance… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 654 |
| `get_markets()` | SETOF market_live_state | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 187 |
| `get_my_badges()` | TABLE(badge_id text, unlocked_at timestamp with time zone) | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 265 |
| `get_my_balance()` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 1120 |
| `get_my_clan()` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 540 |
| `get_my_copies()` | TABLE(username text, avatar_color text, is_active boolean, s… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 413 |
| `get_my_deposits()` | TABLE(id uuid, coin text, network text, coin_amount numeric,… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 423 |
| `get_my_friends()` | TABLE(user_id uuid, username text, avatar_color text, status… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 464 |
| `get_my_history(p_limit integer, p_offset integer)` | TABLE(id uuid, kind text, market_id text, question text, sid… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 510 |
| `get_my_notifications(p_limit integer)` | TABLE(id uuid, icon text, text text, href text, is_read bool… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 406 |
| `get_my_positions()` | TABLE(market_id text, side text, shares numeric, average_pri… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 672 |
| `get_my_withdrawals()` | TABLE(id uuid, network text, destination_address text, amoun… | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 423 |
| `grant_xp(p_user_id uuid, p_amount integer, p_source text)` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 255 |
| `handle_auth_user_created()` | trigger | SECURITY DEFINER | **non fixé** | anon, authenticated, public | (trigger) | 873 |
| `handle_new_user()` | trigger | SECURITY DEFINER | **non fixé** | anon, authenticated, public | (trigger) | 432 |
| `handle_updated_at()` | trigger | invoker | **non fixé** | anon, authenticated, public | (trigger) | 165 |
| `init_daily_missions()` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 1023 |
| `join_clan(p_clan_id uuid)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 435 |
| `leave_clan()` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 554 |
| `mark_notifications_read()` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 239 |
| `newsletter_subscribe(p_email text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 390 |
| `newsletter_unsubscribe(p_email text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 338 |
| `place_bet(p_market_id text, p_side text, p_amount numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 4548 |
| `progress_mission(p_user_id uuid, p_type text, p_amount integer)` | void | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 386 |
| `react_to_message(p_message_id bigint, p_emoji text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 555 |
| `remove_friend(p_friend_username text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 529 |
| `search_users(p_query text, p_limit integer)` | TABLE(user_id uuid, username text, avatar_color text) | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 576 |
| `sell_position(p_market_id text, p_side text, p_shares numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 3197 |
| `send_chat_message(p_room_id text, p_text text, p_type text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | oui (refuse l'anonyme) | 959 |
| `send_friend_request(p_target_username text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 667 |
| `settle_market(p_market_id text, p_outcome text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | **aucun** | 2230 |
| `start_copy(p_target_username text, p_budget numeric)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 765 |
| `stop_copy(p_target_username text)` | jsonb | SECURITY DEFINER | **non fixé** | anon, authenticated, public | utilise auth.uid() sans refuser l'anonyme | 601 |
| `sync_stats_to_blob()` | trigger | SECURITY DEFINER | **non fixé** | anon, authenticated, public | (trigger) | 1088 |
| `sync_users_to_blob()` | trigger | SECURITY DEFINER | **non fixé** | anon, authenticated, public | (trigger) | 587 |
| `wm_fee_rate(p_category text)` | numeric | invoker | **non fixé** | anon, authenticated, public | **aucun** | 334 |

## Tâches planifiées (pg_cron)

| N° | Nom | Fréquence | Commande | Exécutions | Échecs | Durée moy. | Durée max |
|---|---|---|---|---:|---:|---:|---:|
| 1 | bot-tick | `* * * * *` | `SELECT public.bot_tick()` | 1889 | 82 | 0.158 s | 1.379 s |
| 2 | bot-burst | `*/5 * * * *` | `SELECT public.bot_market_make(); SELECT public.bot_market_make(); SELECT public.bot_market_make(); SELECT public.bot_chat_activity(); SELECT public.bot_chat_activity();` | 377 | 24 | 0.425 s | 1.287 s |
| 3 | flash-tick-server | `* * * * *` | `SELECT public.flash_tick_server()` | 378 | 0 | 0.143 s | 1.666 s |

Journal `cron.job_run_details` : 616 Ko, jamais purgé.

## Temps réel

- Publication `supabase_realtime` : public.chat_messages, public.flash_rounds, public.market_live_state, public.notifications, public.user_stats, public.users
- Publication `supabase_realtime_messages_publication` : realtime.messages_2026_11_12, realtime.messages_2026_11_13, realtime.messages_2026_11_14, realtime.messages_2026_11_15, realtime.messages_2026_11_16, realtime.messages_2026_11_17

## Triggers hors schéma public

- `on_auth_user_created` sur `auth.users` : `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_created()`
