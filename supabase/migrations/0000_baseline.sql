-- ═══════════════════════════════════════════════════════════════════════════
-- Wimoro — état du back Supabase AVANT réparation (schéma public et objets liés)
-- Photo prise le 2026-11-14 23:39:27 UTC — Postgres 17.11
-- Généré par supabase/tools/build_baseline.mjs à partir de supabase/tools/export_catalogue.sql.
--
-- Ce fichier est une PHOTO du schéma, reconstituée depuis le catalogue Postgres. Il sert de
-- référence et de point de départ pour reconstruire un projet vide. Il n'a PAS été rejoué tel
-- quel sur la base de production (elle est déjà dans cet état) : ne pas le lancer dessus.
-- Les 22 migrations d'origine sont conservées, pour mémoire, dans supabase/historique/.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── 1. Extensions ──────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;  -- version 1.6.4
create extension if not exists pg_stat_statements with schema extensions;  -- version 1.11
create extension if not exists pgcrypto with schema extensions;  -- version 1.3
create extension if not exists supabase_vault with schema vault;  -- version 0.3.2
create extension if not exists "uuid-ossp" with schema extensions;  -- version 1.1

-- ── 4. Tables ──────────────────────────────────────────────────────────────

-- admin_users : ~1 lignes, 32 Ko
create table public.admin_users (
  user_id uuid not null,
  role text default 'admin'::text,
  created_at timestamp with time zone default now()
);
alter table public.admin_users add constraint admin_users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'super_admin'::text])));
alter table public.admin_users add constraint admin_users_pkey PRIMARY KEY (user_id);

-- auth_accounts : ~0 lignes, 32 Ko
create table public.auth_accounts (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  email text not null,
  password_hash text,
  auth_type text default 'email'::text not null,
  is_verified boolean default false,
  verification_token text,
  created_at timestamp with time zone default now()
);
alter table public.auth_accounts add constraint auth_accounts_auth_type_check CHECK ((auth_type = ANY (ARRAY['email'::text, 'wallet'::text])));
alter table public.auth_accounts add constraint auth_accounts_pkey PRIMARY KEY (id);

-- badges : ~10 lignes, 32 Ko
create table public.badges (
  id text not null,
  name text not null,
  icon text not null,
  condition_query text,
  description text
);
alter table public.badges add constraint badges_pkey PRIMARY KEY (id);

-- balance_adjustments : ~1 lignes, 64 Ko
create table public.balance_adjustments (
  id uuid default gen_random_uuid() not null,
  target_user_id uuid not null,
  admin_user_id uuid not null,
  amount numeric(15,2) not null,
  reason text,
  balance_before numeric(15,2) not null,
  balance_after numeric(15,2) not null,
  created_at timestamp with time zone default now()
);
alter table public.balance_adjustments add constraint balance_adjustments_pkey PRIMARY KEY (id);

-- balance_ledger : ~5159 lignes, 928 Ko
create table public.balance_ledger (
  id bigint generated always as identity not null,
  user_id uuid not null,
  amount numeric(15,2) not null,
  balance_after numeric(15,2) not null,
  kind text not null,
  ref_id text,
  created_at timestamp with time zone default now()
);
alter table public.balance_ledger add constraint balance_ledger_pkey PRIMARY KEY (id);

-- chat_messages : ~9959 lignes, 2760 Ko
create table public.chat_messages (
  id bigint generated always as identity not null,
  room_id text not null,
  user_id uuid not null,
  message_type text default 'msg'::text,
  text_content text,
  bet_ref jsonb,
  reactions jsonb default '{}'::jsonb,
  my_reactions text[] default '{}'::text[],
  followers_count integer default 0,
  is_pinned boolean default false,
  created_at timestamp with time zone default now()
);
alter table public.chat_messages add constraint chat_messages_message_type_check CHECK ((message_type = ANY (ARRAY['msg'::text, 'bet'::text, 'ana'::text, 'evt'::text])));
alter table public.chat_messages add constraint chat_messages_pkey PRIMARY KEY (id);

-- chat_room_members : ~0 lignes, 24 Ko
create table public.chat_room_members (
  room_id text not null,
  user_id uuid not null,
  unread_count integer default 0,
  last_read_at timestamp with time zone
);
alter table public.chat_room_members add constraint chat_room_members_pkey PRIMARY KEY (room_id, user_id);

-- chat_rooms : ~33 lignes, 32 Ko
create table public.chat_rooms (
  id text not null,
  name text not null,
  kind text not null,
  market_id text,
  clan_id uuid,
  private_user_ids uuid[],
  created_at timestamp with time zone default now()
);
alter table public.chat_rooms add constraint chat_rooms_kind_check CHECK ((kind = ANY (ARRAY['global'::text, 'vip'::text, 'market'::text, 'dm'::text, 'clan'::text])));
alter table public.chat_rooms add constraint chat_rooms_pkey PRIMARY KEY (id);

-- clan_leaderboard_weekly : ~0 lignes, 24 Ko
create table public.clan_leaderboard_weekly (
  id bigint generated always as identity not null,
  clan_id uuid not null,
  user_id uuid not null,
  week_start_date date not null,
  profit_weekly numeric(15,2) default 0,
  position_in_clan integer
);
alter table public.clan_leaderboard_weekly add constraint clan_leaderboard_weekly_pkey PRIMARY KEY (id);
alter table public.clan_leaderboard_weekly add constraint clan_leaderboard_weekly_clan_id_user_id_week_start_date_key UNIQUE (clan_id, user_id, week_start_date);

-- clan_members : ~4 lignes, 48 Ko
create table public.clan_members (
  clan_id uuid not null,
  user_id uuid not null,
  joined_at timestamp with time zone default now(),
  role text default 'member'::text
);
alter table public.clan_members add constraint clan_members_role_check CHECK ((role = ANY (ARRAY['founder'::text, 'member'::text])));
alter table public.clan_members add constraint clan_members_pkey PRIMARY KEY (clan_id, user_id);

-- clans : ~4 lignes, 48 Ko
create table public.clans (
  id uuid default gen_random_uuid() not null,
  name text not null,
  founder_user_id uuid not null,
  description text default ''::text,
  emblem_color text default '#2448FF'::text,
  emblem_icon text default 'shield'::text,
  member_count integer default 1,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.clans add constraint clans_pkey PRIMARY KEY (id);
alter table public.clans add constraint clans_name_key UNIQUE (name);

-- combos : ~0 lignes, 16 Ko
create table public.combos (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  stake numeric(15,2) not null,
  potential_payout numeric(15,2) not null,
  status text default 'open'::text,
  legs jsonb not null,
  created_at timestamp with time zone default now(),
  settled_at timestamp with time zone
);
alter table public.combos add constraint combos_status_check CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text, 'cashed'::text])));
alter table public.combos add constraint combos_pkey PRIMARY KEY (id);

-- copy_copies : ~0 lignes, 24 Ko
create table public.copy_copies (
  id uuid default gen_random_uuid() not null,
  copier_user_id uuid not null,
  copied_from_user_id uuid not null,
  original_position_id uuid,
  created_at timestamp with time zone default now()
);
alter table public.copy_copies add constraint copy_copies_pkey PRIMARY KEY (id);

-- copy_following : ~0 lignes, 40 Ko
create table public.copy_following (
  copy_follower_id uuid not null,
  copy_target_user_id uuid not null,
  is_active boolean default true,
  min_accuracy integer,
  max_bet_multiplier numeric(4,2) default 1.00,
  started_at timestamp with time zone default now()
);
alter table public.copy_following add constraint copy_following_pkey PRIMARY KEY (copy_follower_id, copy_target_user_id);

-- crypto_prices : ~5 lignes, 32 Ko
create table public.crypto_prices (
  coin text not null,
  price_usd numeric(15,4) not null,
  updated_at timestamp with time zone default now()
);
alter table public.crypto_prices add constraint crypto_prices_pkey PRIMARY KEY (coin);

-- deposits : ~15 lignes, 64 Ko
create table public.deposits (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  coin text not null,
  network text not null,
  coin_amount numeric(18,8) not null,
  usd_equivalent numeric(15,2),
  confirmations_received integer default 0,
  confirmations_required integer default 1,
  label text,
  tx_hash text,
  status text default 'pending'::text,
  created_at timestamp with time zone default now()
);
alter table public.deposits add constraint deposits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'completed'::text])));
alter table public.deposits add constraint deposits_pkey PRIMARY KEY (id);

-- duels : ~4 lignes, 32 Ko
create table public.duels (
  id uuid default gen_random_uuid() not null,
  creator_id uuid not null,
  opponent_id uuid,
  market_id text not null,
  creator_side text not null,
  creator_stake numeric(15,2) not null,
  opponent_stake numeric(15,2),
  pot numeric(15,2) default 0,
  status text default 'open'::text,
  winner_id uuid,
  created_at timestamp with time zone default now(),
  settled_at timestamp with time zone
);
alter table public.duels add constraint duels_status_check CHECK ((status = ANY (ARRAY['open'::text, 'active'::text, 'settled'::text, 'expired'::text, 'declined'::text])));
alter table public.duels add constraint duels_pkey PRIMARY KEY (id);

-- features : ~19 lignes, 32 Ko
create table public.features (
  id text not null,
  feature_name text not null,
  required_tier integer default 0,
  icon text,
  description text,
  link_href text
);
alter table public.features add constraint features_pkey PRIMARY KEY (id);

-- flash_bets : ~27561 lignes, 5704 Ko
create table public.flash_bets (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  round_id uuid not null,
  game_id text not null,
  side text not null,
  amount_wager numeric(15,2) not null,
  profit_loss numeric(15,2),
  result text,
  created_at timestamp with time zone default now(),
  settled_at timestamp with time zone
);
alter table public.flash_bets add constraint flash_bets_result_check CHECK (((result = ANY (ARRAY['win'::text, 'lose'::text, 'push'::text])) OR (result IS NULL)));
alter table public.flash_bets add constraint flash_bets_side_check CHECK ((side = ANY (ARRAY['a'::text, 'b'::text, 'be'::text])));
alter table public.flash_bets add constraint flash_bets_pkey PRIMARY KEY (id);

-- flash_games : ~19 lignes, 32 Ko
create table public.flash_games (
  id text not null,
  code text not null,
  category text not null,
  kind text not null,
  name text not null,
  tab_label text,
  question text not null,
  answer_a text not null,
  answer_b text not null,
  answer_be text,
  sub_asset text,
  volatility_k numeric(8,5),
  initial_price numeric(15,4),
  price_formatter text,
  cents_formatter text,
  break_even_prob numeric(6,5),
  break_even_description text,
  result_string_a text,
  result_string_b text,
  result_string_be text,
  how_to_play text,
  mk_board_fn text,
  created_at timestamp with time zone default now()
);
alter table public.flash_games add constraint flash_games_kind_check CHECK ((kind = ANY (ARRAY['dir'::text, 'vol'::text, 'event'::text])));
alter table public.flash_games add constraint flash_games_pkey PRIMARY KEY (id);

-- flash_rounds : ~7817 lignes, 1816 Ko
create table public.flash_rounds (
  id uuid default gen_random_uuid() not null,
  game_id text not null,
  round_number integer not null,
  round_start_time timestamp with time zone not null,
  round_duration_ms integer default 45000,
  open_duration_ms integer default 30000,
  current_tick integer default 0,
  current_price numeric(15,4),
  break_even_odds numeric(5,2),
  pool_yes numeric(15,2) default 0,
  pool_no numeric(15,2) default 0,
  pool_breakeven numeric(15,2) default 0,
  status text default 'open'::text,
  result_side text,
  price_path jsonb default '[]'::jsonb,
  activity_level integer default 0,
  updated_at timestamp with time zone default now(),
  lock_price numeric(15,4),
  open_price numeric(15,4),
  total_pool numeric(15,2) default 0
);
alter table public.flash_rounds add constraint flash_rounds_result_side_check CHECK (((result_side = ANY (ARRAY['a'::text, 'b'::text, 'be'::text])) OR (result_side IS NULL)));
alter table public.flash_rounds add constraint flash_rounds_status_check CHECK ((status = ANY (ARRAY['open'::text, 'settled'::text, 'archived'::text])));
alter table public.flash_rounds add constraint flash_rounds_pkey PRIMARY KEY (id);

-- friendships : ~7 lignes, 48 Ko
create table public.friendships (
  user_id uuid not null,
  friend_id uuid not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now()
);
alter table public.friendships add constraint friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])));
alter table public.friendships add constraint friendships_pkey PRIMARY KEY (user_id, friend_id);

-- market_bets : ~14335 lignes, 1880 Ko
create table public.market_bets (
  id bigint generated always as identity not null,
  market_id text not null,
  side integer not null,
  amount_pct numeric(4,3) default 0,
  user_is_me integer default 0,
  timestamp timestamp with time zone default now()
);
alter table public.market_bets add constraint market_bets_side_check CHECK ((side = ANY (ARRAY[0, 1])));
alter table public.market_bets add constraint market_bets_user_is_me_check CHECK ((user_is_me = ANY (ARRAY[0, 1])));
alter table public.market_bets add constraint market_bets_pkey PRIMARY KEY (id);

-- market_groups : ~3 lignes, 64 Ko
create table public.market_groups (
  id text not null,
  category text not null,
  question text not null,
  short_question text,
  creator_user_id uuid,
  close_date date,
  close_time time without time zone,
  close_label text,
  close_long_label text,
  days_until_close integer,
  resolution_rules text,
  status text default 'open'::text,
  resolution_outcome text,
  participants_count integer default 0,
  messages_count integer default 0,
  volume_total numeric(15,2) default 0,
  heat_level numeric(4,1) default 0,
  created_at timestamp with time zone default now()
);
alter table public.market_groups add constraint market_groups_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'resolved'::text])));
alter table public.market_groups add constraint market_groups_pkey PRIMARY KEY (id);

-- market_live_state : ~27 lignes, 176 Ko
create table public.market_live_state (
  market_id text not null,
  current_probability numeric(5,2) default 50,
  anchor_probability numeric(5,2) default 50,
  volume_total numeric(15,2) default 0,
  participants_count integer default 0,
  messages_count integer default 0,
  heat_level numeric(4,1) default 0,
  online_users_count integer default 0,
  updated_at timestamp with time zone default now(),
  liquidity_depth numeric(15,2) default 400,
  price_history jsonb default '[]'::jsonb
);
alter table public.market_live_state add constraint market_live_state_pkey PRIMARY KEY (market_id);

-- market_outcomes : ~17 lignes, 64 Ko
create table public.market_outcomes (
  id text not null,
  group_id text not null,
  market_id text not null,
  label text not null,
  question text,
  current_probability numeric(5,2) default 0,
  initial_probability numeric(5,2) default 0,
  volume numeric(15,2) default 0,
  participants_count integer default 0,
  created_at timestamp with time zone default now()
);
alter table public.market_outcomes add constraint market_outcomes_pkey PRIMARY KEY (id);

-- market_price_history : ~11450 lignes, 2776 Ko
create table public.market_price_history (
  id uuid default gen_random_uuid() not null,
  market_id text not null,
  price numeric(5,2) not null,
  timestamp timestamp with time zone default now(),
  sequence integer not null
);
alter table public.market_price_history add constraint market_price_history_pkey PRIMARY KEY (id);

-- market_proposals : ~0 lignes, 16 Ko
create table public.market_proposals (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  question text not null,
  category text not null,
  close_date date,
  close_time time without time zone,
  resolution_source text,
  resolution_rules text,
  initial_probability numeric(5,2) default 50,
  votes_for integer default 0,
  votes_against integer default 0,
  votes_needed integer default 10,
  status text default 'voting'::text,
  created_at timestamp with time zone default now()
);
alter table public.market_proposals add constraint market_proposals_status_check CHECK ((status = ANY (ARRAY['voting'::text, 'approved'::text, 'rejected'::text, 'live'::text])));
alter table public.market_proposals add constraint market_proposals_pkey PRIMARY KEY (id);

-- markets : ~27 lignes, 144 Ko
create table public.markets (
  id text not null,
  category text not null,
  question text not null,
  short_question text,
  creator_user_id uuid,
  current_probability numeric(5,2) default 50,
  initial_probability numeric(5,2) default 50,
  volume_total numeric(15,2) default 0,
  volume_24h numeric(15,2) default 0,
  participants_count integer default 0,
  messages_count integer default 0,
  heat_level numeric(4,1) default 0,
  hot_until timestamp with time zone,
  close_date date,
  close_time time without time zone,
  close_label text,
  close_long_label text,
  days_until_close integer,
  resolved_at timestamp with time zone,
  resolution_source text,
  resolution_rules text,
  status text default 'open'::text,
  resolution_outcome text,
  anchor_probability numeric(5,2) default 50,
  liquidity_depth numeric(15,2) default 0,
  online_users_count integer default 0,
  people_count integer default 0,
  group_parent_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.markets add constraint markets_resolution_outcome_check CHECK (((resolution_outcome = ANY (ARRAY['yes'::text, 'no'::text, 'ambiguous'::text, 'voided'::text])) OR (resolution_outcome IS NULL)));
alter table public.markets add constraint markets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closing_soon'::text, 'closed'::text, 'resolved'::text])));
alter table public.markets add constraint markets_pkey PRIMARY KEY (id);

-- missions : ~15 lignes, 64 Ko
create table public.missions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  mission_type text not null,
  label text not null,
  goal_value integer not null,
  current_progress integer default 0,
  xp_reward integer not null,
  is_claimed boolean default false,
  action_href text,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);
alter table public.missions add constraint missions_mission_type_check CHECK ((mission_type = ANY (ARRAY['bet'::text, 'flashbet'::text, 'chat'::text, 'chatm'::text, 'flashwin'::text, 'dep'::text])));
alter table public.missions add constraint missions_pkey PRIMARY KEY (id);

-- newsletter_subscribers : ~4 lignes, 48 Ko
create table public.newsletter_subscribers (
  id uuid default gen_random_uuid() not null,
  email text not null,
  subscribed boolean default true,
  created_at timestamp with time zone default now(),
  unsubscribed_at timestamp with time zone
);
alter table public.newsletter_subscribers add constraint newsletter_subscribers_pkey PRIMARY KEY (id);
alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_key UNIQUE (email);

-- notifications : ~32 lignes, 80 Ko
create table public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  icon text not null,
  text text not null,
  href text,
  is_read boolean default false,
  created_at timestamp with time zone default now()
);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);

-- orders : ~0 lignes, 40 Ko
create table public.orders (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  market_id text not null,
  order_type text default 'limit'::text not null,
  side text not null,
  quantity numeric(12,2) not null,
  limit_price numeric(12,4),
  status text default 'open'::text,
  filled_quantity numeric(12,2) default 0,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);
alter table public.orders add constraint orders_order_type_check CHECK ((order_type = ANY (ARRAY['limit'::text, 'market'::text])));
alter table public.orders add constraint orders_side_check CHECK ((side = ANY (ARRAY['oui'::text, 'non'::text])));
alter table public.orders add constraint orders_status_check CHECK ((status = ANY (ARRAY['open'::text, 'partial'::text, 'filled'::text, 'cancelled'::text])));
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);

-- position_history : ~0 lignes, 32 Ko
create table public.position_history (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text not null,
  market_id text,
  question text,
  side text not null,
  was_winner boolean,
  pnl numeric(15,2) not null,
  settled_at timestamp with time zone default now()
);
alter table public.position_history add constraint position_history_kind_check CHECK ((kind = ANY (ARRAY['res'::text, 'sell'::text, 'flash'::text, 'be'::text])));
alter table public.position_history add constraint position_history_side_check CHECK ((side = ANY (ARRAY['oui'::text, 'non'::text, 'be'::text, 'haut'::text, 'bas'::text])));
alter table public.position_history add constraint position_history_pkey PRIMARY KEY (id);

-- positions : ~14 lignes, 96 Ko
create table public.positions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  market_id text not null,
  side text not null,
  shares numeric(12,2) not null,
  average_price numeric(12,4) not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.positions add constraint positions_side_check CHECK ((side = ANY (ARRAY['oui'::text, 'non'::text, 'be'::text])));
alter table public.positions add constraint positions_pkey PRIMARY KEY (id);
alter table public.positions add constraint positions_user_id_market_id_side_key UNIQUE (user_id, market_id, side);

-- tier_conditions : ~18 lignes, 32 Ko
create table public.tier_conditions (
  id bigint generated always as identity not null,
  tier_id integer not null,
  condition_key text not null,
  condition_value integer not null
);
alter table public.tier_conditions add constraint tier_conditions_pkey PRIMARY KEY (id);

-- tier_divisions : ~25 lignes, 40 Ko
create table public.tier_divisions (
  id bigint generated always as identity not null,
  tier_id integer not null,
  division integer not null,
  xp_required integer not null
);
alter table public.tier_divisions add constraint tier_divisions_division_check CHECK (((division >= 0) AND (division <= 2)));
alter table public.tier_divisions add constraint tier_divisions_pkey PRIMARY KEY (id);
alter table public.tier_divisions add constraint tier_divisions_tier_id_division_key UNIQUE (tier_id, division);

-- tier_ranks : ~9 lignes, 48 Ko
create table public.tier_ranks (
  id integer not null,
  name text not null,
  gradient_color_light text,
  gradient_color_dark text,
  created_at timestamp with time zone default now()
);
alter table public.tier_ranks add constraint tier_ranks_pkey PRIMARY KEY (id);
alter table public.tier_ranks add constraint tier_ranks_name_key UNIQUE (name);

-- user_badges : ~13 lignes, 32 Ko
create table public.user_badges (
  user_id uuid not null,
  badge_id text not null,
  unlocked_at timestamp with time zone default now()
);
alter table public.user_badges add constraint user_badges_pkey PRIMARY KEY (user_id, badge_id);

-- user_following : ~3740 lignes, 736 Ko
create table public.user_following (
  follower_id uuid not null,
  followed_id uuid not null,
  created_at timestamp with time zone default now()
);
alter table public.user_following add constraint user_following_pkey PRIMARY KEY (follower_id, followed_id);

-- user_full_state : ~10021 lignes, 7232 Ko
create table public.user_full_state (
  user_id uuid not null,
  state jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now()
);
alter table public.user_full_state add constraint user_full_state_pkey PRIMARY KEY (user_id);

-- user_preferences : ~10021 lignes, 1568 Ko
create table public.user_preferences (
  user_id uuid not null,
  chart_type text default 'courbe'::text,
  flash_mode text default 'free'::text,
  flash_category text default 'Tout'::text,
  flash_alerts jsonb default '[]'::jsonb,
  false_alarm_alerts jsonb default '[]'::jsonb,
  default_deposit_coin text,
  default_deposit_network text,
  default_withdraw_network text,
  fiat_deposit_amount text,
  fiat_withdraw_amount text,
  copy_trading_enabled boolean default false,
  copy_trading_min_accuracy integer,
  market_sort text default 'actifs'::text,
  time_filter text default '1 j'::text,
  home_chat_room text default 'general'::text,
  market_interest_categories jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default now()
);
alter table public.user_preferences add constraint user_preferences_flash_mode_check CHECK ((flash_mode = ANY (ARRAY['free'::text, 'rot'::text])));
alter table public.user_preferences add constraint user_preferences_pkey PRIMARY KEY (user_id);

-- user_stats : ~10021 lignes, 3144 Ko
create table public.user_stats (
  user_id uuid not null,
  balance numeric(15,2) default 0,
  credit_demo numeric(15,2) default 0,
  xp integer default 0,
  followers_count integer default 0,
  following_count integer default 0,
  rank_tier integer default 0,
  rank_division integer default 0,
  seasonal_position integer,
  profit_total numeric(15,2) default 0,
  profit_realized numeric(15,2) default 0,
  streak_current integer default 1,
  streak_best integer default 1,
  streak_last_date date,
  bets_placed integer default 0,
  bets_won integer default 0,
  bets_settled integer default 0,
  bets_accuracy_pct integer default 50,
  bets_max_amount numeric(15,2) default 0,
  followed_bets_count integer default 0,
  contra_wins integer default 0,
  deposits_count integer default 0,
  deposits_last_date date,
  flash_wins integer default 0,
  flash_streak_current integer default 0,
  flash_streak_best integer default 0,
  flash_profit_total numeric(15,2) default 0,
  messages_total integer default 0,
  chat_xp_today integer default 0,
  chat_last_date date,
  clan_created_id uuid,
  clan_joined_id uuid,
  clan_week_champion integer default 0,
  copies_count integer default 0,
  copiers_count integer default 0,
  updated_at timestamp with time zone default now()
);
alter table public.user_stats add constraint balance_non_negative CHECK ((balance >= (0)::numeric));
alter table public.user_stats add constraint user_stats_bets_accuracy_pct_check CHECK (((bets_accuracy_pct >= 0) AND (bets_accuracy_pct <= 100)));
alter table public.user_stats add constraint user_stats_rank_division_check CHECK (((rank_division >= 0) AND (rank_division <= 2)));
alter table public.user_stats add constraint user_stats_rank_tier_check CHECK (((rank_tier >= 0) AND (rank_tier <= 8)));
alter table public.user_stats add constraint user_stats_pkey PRIMARY KEY (user_id);

-- user_watchlist : ~0 lignes, 16 Ko
create table public.user_watchlist (
  user_id uuid not null,
  market_id text not null,
  created_at timestamp with time zone default now()
);
alter table public.user_watchlist add constraint user_watchlist_pkey PRIMARY KEY (user_id, market_id);

-- users : ~10021 lignes, 4512 Ko
create table public.users (
  id uuid default gen_random_uuid() not null,
  username text not null,
  email text not null,
  password_hash text,
  avatar_photo text default ''::text,
  avatar_color text default '#2448FF'::text,
  bio text default ''::text,
  wallet_address text,
  kyc_verified boolean default false,
  kyc_document_status text default 'pending'::text,
  profile_photo_imported text,
  onboarded boolean default false,
  welcomed boolean default false,
  is_demo boolean default false,
  language_preference text default 'fr'::text,
  theme_preference text default 'auto'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.users add constraint users_kyc_document_status_check CHECK ((kyc_document_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.users add constraint users_language_preference_check CHECK ((language_preference = ANY (ARRAY['en'::text, 'fr'::text, 'he'::text])));
alter table public.users add constraint users_theme_preference_check CHECK ((theme_preference = ANY (ARRAY['light'::text, 'dark'::text, 'auto'::text])));
alter table public.users add constraint users_username_check CHECK (((char_length(username) >= 3) AND (char_length(username) <= 20)));
alter table public.users add constraint users_pkey PRIMARY KEY (id);
alter table public.users add constraint users_email_key UNIQUE (email);
alter table public.users add constraint users_username_key UNIQUE (username);

-- withdrawals : ~4 lignes, 64 Ko
create table public.withdrawals (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  network text not null,
  destination_address text not null,
  amount_usd numeric(15,2) not null,
  coin text,
  coin_amount numeric(18,8),
  status text default 'pending'::text,
  requested_at timestamp with time zone default now(),
  completed_at timestamp with time zone
);
alter table public.withdrawals add constraint withdrawals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])));
alter table public.withdrawals add constraint withdrawals_pkey PRIMARY KEY (id);

-- ── 5. Clés étrangères ─────────────────────────────────────────────────────
alter table public.admin_users add constraint admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.auth_accounts add constraint auth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.balance_adjustments add constraint balance_adjustments_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES users(id);
alter table public.balance_adjustments add constraint balance_adjustments_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.balance_ledger add constraint balance_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.chat_room_members add constraint chat_room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;
alter table public.chat_room_members add constraint chat_room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.chat_rooms add constraint chat_rooms_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL;
alter table public.chat_rooms add constraint fk_chat_rooms_clan FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE SET NULL;
alter table public.clan_leaderboard_weekly add constraint clan_leaderboard_weekly_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
alter table public.clan_leaderboard_weekly add constraint clan_leaderboard_weekly_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.clan_members add constraint clan_members_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
alter table public.clan_members add constraint clan_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.clans add constraint clans_founder_user_id_fkey FOREIGN KEY (founder_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.combos add constraint combos_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.copy_copies add constraint copy_copies_copied_from_user_id_fkey FOREIGN KEY (copied_from_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.copy_copies add constraint copy_copies_copier_user_id_fkey FOREIGN KEY (copier_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.copy_copies add constraint copy_copies_original_position_id_fkey FOREIGN KEY (original_position_id) REFERENCES positions(id) ON DELETE SET NULL;
alter table public.copy_following add constraint copy_following_copy_follower_id_fkey FOREIGN KEY (copy_follower_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.copy_following add constraint copy_following_copy_target_user_id_fkey FOREIGN KEY (copy_target_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.deposits add constraint deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.duels add constraint duels_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id);
alter table public.duels add constraint duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES users(id);
alter table public.duels add constraint duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES users(id);
alter table public.features add constraint features_required_tier_fkey FOREIGN KEY (required_tier) REFERENCES tier_ranks(id);
alter table public.flash_bets add constraint flash_bets_game_id_fkey FOREIGN KEY (game_id) REFERENCES flash_games(id) ON DELETE CASCADE;
alter table public.flash_bets add constraint flash_bets_round_id_fkey FOREIGN KEY (round_id) REFERENCES flash_rounds(id) ON DELETE CASCADE;
alter table public.flash_bets add constraint flash_bets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.flash_rounds add constraint flash_rounds_game_id_fkey FOREIGN KEY (game_id) REFERENCES flash_games(id) ON DELETE CASCADE;
alter table public.friendships add constraint friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.friendships add constraint friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.market_bets add constraint market_bets_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE;
alter table public.market_groups add constraint market_groups_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.market_outcomes add constraint market_outcomes_group_id_fkey FOREIGN KEY (group_id) REFERENCES market_groups(id) ON DELETE CASCADE;
alter table public.market_outcomes add constraint market_outcomes_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE;
alter table public.market_price_history add constraint market_price_history_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE;
alter table public.market_proposals add constraint market_proposals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.markets add constraint markets_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.markets add constraint markets_group_parent_id_fkey FOREIGN KEY (group_parent_id) REFERENCES market_groups(id) ON DELETE SET NULL;
alter table public.missions add constraint missions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.position_history add constraint position_history_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL;
alter table public.position_history add constraint position_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.positions add constraint positions_market_id_fkey FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE;
alter table public.positions add constraint positions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.tier_conditions add constraint tier_conditions_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES tier_ranks(id) ON DELETE CASCADE;
alter table public.tier_divisions add constraint tier_divisions_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES tier_ranks(id) ON DELETE CASCADE;
alter table public.user_badges add constraint user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE;
alter table public.user_badges add constraint user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_following add constraint user_following_followed_id_fkey FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_following add constraint user_following_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_full_state add constraint user_full_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_preferences add constraint user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_stats add constraint fk_user_stats_clan_created FOREIGN KEY (clan_created_id) REFERENCES clans(id) ON DELETE SET NULL;
alter table public.user_stats add constraint fk_user_stats_clan_joined FOREIGN KEY (clan_joined_id) REFERENCES clans(id) ON DELETE SET NULL;
alter table public.user_stats add constraint user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_watchlist add constraint user_watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.withdrawals add constraint withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── 6. Index (hors index créés par une contrainte) ─────────────────────────
CREATE INDEX idx_auth_accounts_email ON public.auth_accounts USING btree (email);
CREATE INDEX idx_auth_accounts_user ON public.auth_accounts USING btree (user_id);
CREATE INDEX idx_balance_adj_admin ON public.balance_adjustments USING btree (admin_user_id);
CREATE INDEX idx_balance_adj_target ON public.balance_adjustments USING btree (target_user_id);
CREATE INDEX idx_ledger_user ON public.balance_ledger USING btree (user_id, created_at DESC);
CREATE INDEX idx_chat_messages_room ON public.chat_messages USING btree (room_id, created_at DESC);
CREATE INDEX idx_chat_messages_user ON public.chat_messages USING btree (user_id);
CREATE INDEX idx_chat_room_members_user ON public.chat_room_members USING btree (user_id);
CREATE INDEX idx_clan_leaderboard_week ON public.clan_leaderboard_weekly USING btree (week_start_date, clan_id);
CREATE INDEX idx_clan_members_user ON public.clan_members USING btree (user_id);
CREATE INDEX idx_copy_copies_copier ON public.copy_copies USING btree (copier_user_id);
CREATE INDEX idx_copy_copies_from ON public.copy_copies USING btree (copied_from_user_id);
CREATE INDEX idx_copy_following_target ON public.copy_following USING btree (copy_target_user_id);
CREATE INDEX idx_deposits_status ON public.deposits USING btree (status);
CREATE INDEX idx_deposits_user ON public.deposits USING btree (user_id);
CREATE INDEX idx_flash_bets_round ON public.flash_bets USING btree (round_id);
CREATE INDEX idx_flash_bets_user ON public.flash_bets USING btree (user_id);
CREATE INDEX idx_flash_rounds_game ON public.flash_rounds USING btree (game_id);
CREATE INDEX idx_flash_rounds_status ON public.flash_rounds USING btree (game_id, status);
CREATE INDEX idx_friendships_friend ON public.friendships USING btree (friend_id);
CREATE INDEX idx_market_bets_market ON public.market_bets USING btree (market_id);
CREATE INDEX idx_market_bets_timestamp ON public.market_bets USING btree ("timestamp" DESC);
CREATE INDEX idx_market_groups_category ON public.market_groups USING btree (category);
CREATE INDEX idx_market_groups_status ON public.market_groups USING btree (status);
CREATE INDEX idx_market_outcomes_group ON public.market_outcomes USING btree (group_id);
CREATE INDEX idx_market_outcomes_market ON public.market_outcomes USING btree (market_id);
CREATE INDEX idx_market_price_history_market ON public.market_price_history USING btree (market_id, sequence);
CREATE INDEX idx_market_price_history_timestamp ON public.market_price_history USING btree (market_id, "timestamp" DESC);
CREATE INDEX idx_markets_category ON public.markets USING btree (category);
CREATE INDEX idx_markets_close_date ON public.markets USING btree (close_date);
CREATE INDEX idx_markets_group ON public.markets USING btree (group_parent_id);
CREATE INDEX idx_markets_heat ON public.markets USING btree (heat_level DESC);
CREATE INDEX idx_markets_status ON public.markets USING btree (status);
CREATE INDEX idx_missions_expires ON public.missions USING btree (expires_at);
CREATE INDEX idx_missions_user ON public.missions USING btree (user_id);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read, created_at DESC);
CREATE INDEX idx_orders_market ON public.orders USING btree (market_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);
CREATE INDEX idx_position_history_settled ON public.position_history USING btree (settled_at DESC);
CREATE INDEX idx_position_history_user ON public.position_history USING btree (user_id);
CREATE INDEX idx_positions_market ON public.positions USING btree (market_id);
CREATE INDEX idx_positions_user ON public.positions USING btree (user_id);
CREATE INDEX idx_positions_user_market ON public.positions USING btree (user_id, market_id);
CREATE INDEX idx_following_followed ON public.user_following USING btree (followed_id);
CREATE INDEX idx_user_stats_profit ON public.user_stats USING btree (profit_total DESC);
CREATE INDEX idx_user_stats_rank ON public.user_stats USING btree (rank_tier, rank_division);
CREATE INDEX idx_user_stats_seasonal ON public.user_stats USING btree (seasonal_position);
CREATE INDEX idx_user_stats_xp ON public.user_stats USING btree (xp DESC);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_username ON public.users USING btree (username);
CREATE INDEX idx_withdrawals_status ON public.withdrawals USING btree (status);
CREATE INDEX idx_withdrawals_user ON public.withdrawals USING btree (user_id);

-- ── 7. Fonctions ───────────────────────────────────────────────────────────

-- _post_bet_hook(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public._post_bet_hook(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public.progress_mission(p_user_id, 'bet', 1);
  PERFORM public.check_badges();
END;
$function$;

-- accept_duel(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.accept_duel(p_duel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_duel record;
  v_balance numeric;
  v_new_balance numeric;
  v_fee numeric;
BEGIN
  SELECT * INTO v_duel FROM public.duels WHERE id = p_duel_id AND status = 'open' FOR UPDATE;
  IF v_duel IS NULL THEN RAISE EXCEPTION 'Duel not found'; END IF;
  IF v_duel.creator_id = v_uid THEN RAISE EXCEPTION 'Cannot accept own duel'; END IF;

  v_fee := round((v_duel.creator_stake * 0.05)::numeric, 2);
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < (v_duel.creator_stake + v_fee) THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - v_duel.creator_stake - v_fee;
  UPDATE public.user_stats SET balance = v_new_balance WHERE user_id = v_uid;

  UPDATE public.duels SET
    opponent_id = v_uid,
    opponent_stake = v_duel.creator_stake,
    pot = v_duel.creator_stake * 2,
    status = 'active'
  WHERE id = p_duel_id;

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, -(v_duel.creator_stake + v_fee), v_new_balance, 'duel', p_duel_id::text);

  RETURN jsonb_build_object('status', 'active', 'new_balance', v_new_balance);
END;
$function$;

-- accept_friend_request(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_from_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  UPDATE public.friendships SET status = 'accepted'
  WHERE user_id = p_from_user_id AND friend_id = v_uid AND status = 'pending';

  -- Grant XP for making a friend
  UPDATE public.user_stats SET xp = xp + 15 WHERE user_id = v_uid;
  UPDATE public.user_stats SET xp = xp + 15 WHERE user_id = p_from_user_id;

  RETURN jsonb_build_object('status', 'accepted');
END;
$function$;

-- admin_adjust_balance(text,numeric,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(target_username text, adjustment numeric, adjustment_reason text DEFAULT 'Admin adjustment'::text)
 RETURNS TABLE(username text, balance_before text, balance_after text, adjustment_amount text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username
     OR u.email = target_username
     OR u.username ILIKE target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;
  v_after := GREATEST(0, v_before + adjustment);

  UPDATE public.user_stats SET balance = v_after WHERE user_id = v_user_id;

  UPDATE public.user_full_state
  SET state = jsonb_set(COALESCE(state, '{}'::jsonb), '{balance}', to_jsonb(v_after), true),
      updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_full_state (user_id, state)
    VALUES (v_user_id, jsonb_build_object('balance', v_after))
    ON CONFLICT (user_id) DO UPDATE SET
      state = jsonb_set(COALESCE(public.user_full_state.state, '{}'::jsonb), '{balance}', to_jsonb(v_after), true),
      updated_at = now();
  END IF;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), adjustment, adjustment_reason, v_before, v_after);

  RETURN QUERY SELECT v_username,
    '$' || to_char(v_before, 'FM999,999,999.00'),
    '$' || to_char(v_after, 'FM999,999,999.00'),
    CASE WHEN adjustment >= 0 THEN '+' ELSE '' END || '$' || to_char(adjustment, 'FM999,999,999.00');
END;
$function$;

-- admin_balance_history(text,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_balance_history(target_username text DEFAULT NULL::text, n integer DEFAULT 50)
 RETURNS TABLE(adjusted_at timestamp with time zone, username text, amount numeric, reason text, before_bal numeric, after_bal numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT ba.created_at, u.username, ba.amount, ba.reason, ba.balance_before, ba.balance_after
  FROM public.balance_adjustments ba
  JOIN public.users u ON u.id = ba.target_user_id
  WHERE (target_username IS NULL OR u.username = target_username)
  ORDER BY ba.created_at DESC
  LIMIT n;
END;
$function$;

-- admin_ban_user(text,boolean) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_ban_user(target_username text, ban boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE username = target_username;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  IF ban THEN
    UPDATE public.user_stats SET balance = 0 WHERE user_id = v_user_id;
    UPDATE public.users SET bio = '[BANNED] ' || COALESCE(bio, '') WHERE id = v_user_id;
    RETURN target_username || ' has been banned';
  ELSE
    UPDATE public.users SET bio = REPLACE(bio, '[BANNED] ', '') WHERE id = v_user_id;
    RETURN target_username || ' has been unbanned';
  END IF;
END;
$function$;

-- admin_get_player(text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_get_player(search_term text)
 RETURNS TABLE(user_id uuid, username text, email text, balance_display text, balance_raw numeric, rank_name text, rank_tier integer, xp integer, bets_placed integer, accuracy integer, flash_wins integer, profit_display text, is_bot boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.username, u.email,
    '$' || to_char(s.balance, 'FM999,999,999.00'),
    s.balance,
    CASE s.rank_tier
      WHEN 0 THEN 'Fer' WHEN 1 THEN 'Bronze' WHEN 2 THEN 'Argent'
      WHEN 3 THEN 'Or' WHEN 4 THEN 'Platine' WHEN 5 THEN 'Diamant'
      WHEN 6 THEN 'Ascendant' WHEN 7 THEN 'Immortel' WHEN 8 THEN 'Radiant'
    END,
    s.rank_tier, s.xp, s.bets_placed, s.bets_accuracy_pct, s.flash_wins,
    '$' || to_char(s.profit_realized, 'FM999,999,999.00'),
    u.is_demo, u.created_at
  FROM public.users u
  JOIN public.user_stats s ON s.user_id = u.id
  WHERE u.username ILIKE '%' || search_term || '%'
     OR u.email ILIKE '%' || search_term || '%'
  ORDER BY u.is_demo ASC, u.created_at DESC
  LIMIT 20;
END;
$function$;

-- admin_set_balance(text,numeric,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_set_balance(target_username text, new_balance numeric, adjustment_reason text DEFAULT 'Admin set balance'::text)
 RETURNS TABLE(username text, balance_before text, balance_after text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_final numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username
     OR u.email = target_username
     OR u.username ILIKE target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;
  v_final := GREATEST(0, new_balance);

  UPDATE public.user_stats SET balance = v_final WHERE user_id = v_user_id;

  UPDATE public.user_full_state
  SET state = jsonb_set(COALESCE(state, '{}'::jsonb), '{balance}', to_jsonb(v_final), true),
      updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_full_state (user_id, state)
    VALUES (v_user_id, jsonb_build_object('balance', v_final))
    ON CONFLICT (user_id) DO UPDATE SET
      state = jsonb_set(COALESCE(public.user_full_state.state, '{}'::jsonb), '{balance}', to_jsonb(v_final), true),
      updated_at = now();
  END IF;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), new_balance - v_before, adjustment_reason, v_before, v_final);

  RETURN QUERY SELECT v_username,
    '$' || to_char(v_before, 'FM999,999,999.00'),
    '$' || to_char(v_final, 'FM999,999,999.00');
END;
$function$;

-- admin_set_player(text,numeric,integer,integer,integer,integer,integer,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_set_player(target_username text, p_balance numeric DEFAULT NULL::numeric, p_xp integer DEFAULT NULL::integer, p_rank_tier integer DEFAULT NULL::integer, p_rank_division integer DEFAULT NULL::integer, p_bets_placed integer DEFAULT NULL::integer, p_bets_won integer DEFAULT NULL::integer, p_flash_wins integer DEFAULT NULL::integer)
 RETURNS TABLE(username text, field_updated text, new_value text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_username text;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username OR u.email = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  IF p_balance IS NOT NULL THEN
    UPDATE public.user_stats SET balance = p_balance WHERE user_id = v_user_id;
    UPDATE public.user_full_state SET state = jsonb_set(COALESCE(state,'{}'::jsonb), '{balance}', to_jsonb(p_balance), true), updated_at = now() WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'balance'::text, p_balance::text;
  END IF;

  IF p_xp IS NOT NULL THEN
    UPDATE public.user_stats SET xp = p_xp WHERE user_id = v_user_id;
    UPDATE public.user_full_state SET state = jsonb_set(COALESCE(state,'{}'::jsonb), '{xp}', to_jsonb(p_xp), true), updated_at = now() WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'xp'::text, p_xp::text;
  END IF;

  IF p_rank_tier IS NOT NULL THEN
    UPDATE public.user_stats SET rank_tier = LEAST(8, GREATEST(0, p_rank_tier)), rank_division = COALESCE(p_rank_division, 0) WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'rank'::text, (p_rank_tier::text || '.' || COALESCE(p_rank_division, 0)::text);
  END IF;

  IF p_bets_placed IS NOT NULL THEN
    UPDATE public.user_stats SET bets_placed = p_bets_placed WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'bets_placed'::text, p_bets_placed::text;
  END IF;

  IF p_bets_won IS NOT NULL THEN
    UPDATE public.user_stats SET bets_won = p_bets_won WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'bets_won'::text, p_bets_won::text;
  END IF;

  IF p_flash_wins IS NOT NULL THEN
    UPDATE public.user_stats SET flash_wins = p_flash_wins WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_username, 'flash_wins'::text, p_flash_wins::text;
  END IF;
END;
$function$;

-- admin_set_rank(text,text,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_set_rank(target_username text, rank_name text, division integer DEFAULT 0)
 RETURNS TABLE(username text, old_rank text, new_rank text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_username text;
  v_old_tier integer;
  v_old_div integer;
  v_new_tier integer;
  rank_names text[] := ARRAY['Fer','Bronze','Argent','Or','Platine','Diamant','Ascendant','Immortel','Radiant'];
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username
     OR u.email = target_username
     OR u.username ILIKE target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Joueur "%" introuvable', target_username;
  END IF;

  -- Resolve rank name to tier number
  v_new_tier := NULL;
  FOR i IN 0..8 LOOP
    IF lower(rank_names[i+1]) = lower(rank_name) THEN
      v_new_tier := i;
    END IF;
  END LOOP;

  -- Also accept numbers directly
  IF v_new_tier IS NULL AND rank_name ~ '^\d$' THEN
    v_new_tier := rank_name::integer;
  END IF;

  IF v_new_tier IS NULL OR v_new_tier < 0 OR v_new_tier > 8 THEN
    RAISE EXCEPTION 'Rang invalide "%". Utilise: Fer, Bronze, Argent, Or, Platine, Diamant, Ascendant, Immortel, Radiant', rank_name;
  END IF;

  SELECT s.rank_tier, s.rank_division INTO v_old_tier, v_old_div
  FROM public.user_stats s WHERE s.user_id = v_user_id;

  UPDATE public.user_stats SET
    rank_tier = v_new_tier,
    rank_division = LEAST(2, GREATEST(0, division)),
    xp = v_new_tier * 900 + LEAST(2, GREATEST(0, division)) * 300
  WHERE user_id = v_user_id;

  -- Sync blob
  UPDATE public.user_full_state
  SET state = jsonb_set(
    jsonb_set(COALESCE(state, '{}'::jsonb), '{xp}', to_jsonb(v_new_tier * 900 + LEAST(2, GREATEST(0, division)) * 300), true),
    '{balance}', COALESCE(state->'balance', to_jsonb(0)), true
  ), updated_at = now()
  WHERE user_id = v_user_id;

  RETURN QUERY SELECT v_username,
    rank_names[v_old_tier+1] || ' ' || CASE v_old_div WHEN 0 THEN 'I' WHEN 1 THEN 'II' ELSE 'III' END,
    rank_names[v_new_tier+1] || ' ' || CASE division WHEN 0 THEN 'I' WHEN 1 THEN 'II' ELSE 'III' END;
END;
$function$;

-- admin_top_players(integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.admin_top_players(n integer DEFAULT 20)
 RETURNS TABLE(username text, email text, balance numeric, xp integer, rank_tier integer, bets_placed integer, accuracy integer, profit numeric, is_bot boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.username, u.email, s.balance, s.xp, s.rank_tier,
         s.bets_placed, s.bets_accuracy_pct, s.profit_realized, u.is_demo
  FROM public.users u
  JOIN public.user_stats s ON s.user_id = u.id
  ORDER BY s.balance DESC
  LIMIT n;
END;
$function$;

-- book_depth(numeric,numeric) — security invoker, search_path NON fixé
CREATE OR REPLACE FUNCTION public.book_depth(p_volume numeric, p_liq numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT GREATEST(400, COALESCE(p_liq, GREATEST(400, p_volume * 0.006)));
$function$;

-- bot_chat_activity() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.bot_chat_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  bot record;
  target_room text;
  msg_text text;
  msg_pool text[];
BEGIN
  msg_pool := ARRAY[
    'Je mise gros sur le oui 🔥',
    'Le non est sous-coté ici',
    'Qui d''autre voit ça monter ?',
    'Le marché va corriger bientôt',
    'Les whales accumulent en silence',
    'Je suis all-in depuis ce matin',
    'Quelqu''un a des infos ?',
    'Le volume est en train d''exploser',
    'Patience, les probas vont se normaliser',
    'J''ai pris une position à 35%',
    'Le flash BTC est chaud en ce moment 🚀',
    'Les cotes bougent pas mal',
    'Je prends le non à ce prix-là',
    'Ça sent le retournement',
    'Belle opportunité sur ce marché',
    'Le consensus est trop fort, je joue le contra',
    'Premier pari du jour, on verra bien',
    'Les stats sont en ma faveur',
    'Je hedge avec une position inverse',
    'Bravo à ceux qui ont pris le oui tôt',
    'La liquidité est bonne ici',
    'Attention au closing, ça va bouger',
    'Classique, le marché sous-estime ce risque',
    'J''ai gagné 3 flash d''affilée 💰',
    'Le salon VIP est calme ce soir',
    'Quelqu''un pour un duel ?',
    'Mon clan est en tête cette semaine',
    'Les bots market-maker font bien leur taf',
    'Je suis Diamant maintenant 💎',
    'Gg le pari, bien vu'
  ];

  FOR bot IN SELECT id FROM public.users WHERE is_demo = true ORDER BY random() LIMIT (3 + floor(random() * 3)::int)
  LOOP
    -- Pick from existing rooms only
    SELECT id INTO target_room FROM public.chat_rooms ORDER BY random() LIMIT 1;
    IF target_room IS NULL THEN target_room := 'general'; END IF;

    msg_text := msg_pool[1 + floor(random() * array_length(msg_pool, 1))::int];

    INSERT INTO public.chat_messages (room_id, user_id, message_type, text_content)
    VALUES (target_room, bot.id, 'msg', msg_text);

    UPDATE public.user_stats SET messages_total = messages_total + 1 WHERE user_id = bot.id;
  END LOOP;
END;
$function$;

-- bot_flash_activity() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.bot_flash_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  game record;
  bot record;
  round_id uuid;
  bet_side text;
  bet_amount numeric;
BEGIN
  -- For each active flash game, have some bots participate
  FOR game IN SELECT id FROM public.flash_games ORDER BY random() LIMIT 3
  LOOP
    -- Get or create current round
    SELECT fr.id INTO round_id
    FROM public.flash_rounds fr
    WHERE fr.game_id = game.id AND fr.status = 'open'
    ORDER BY fr.round_number DESC LIMIT 1;

    IF round_id IS NULL THEN
      INSERT INTO public.flash_rounds (game_id, round_number, round_start_time, status)
      VALUES (game.id, COALESCE((SELECT MAX(round_number) + 1 FROM public.flash_rounds WHERE game_id = game.id), 1), now(), 'open')
      RETURNING id INTO round_id;
    END IF;

    -- 5-15 bots bet per round
    FOR bot IN SELECT id FROM public.users WHERE is_demo = true ORDER BY random() LIMIT (5 + floor(random() * 11)::int)
    LOOP
      bet_side := CASE floor(random() * 3)::int WHEN 0 THEN 'a' WHEN 1 THEN 'b' ELSE 'be' END;
      bet_amount := round((5 + random() * 495)::numeric, 2);

      INSERT INTO public.flash_bets (user_id, round_id, game_id, side, amount_wager)
      VALUES (bot.id, round_id, game.id, bet_side, bet_amount);

      -- Update pools
      UPDATE public.flash_rounds SET
        pool_yes = pool_yes + CASE WHEN bet_side = 'a' THEN bet_amount ELSE 0 END,
        pool_no = pool_no + CASE WHEN bet_side = 'b' THEN bet_amount ELSE 0 END,
        pool_breakeven = pool_breakeven + CASE WHEN bet_side = 'be' THEN bet_amount ELSE 0 END,
        activity_level = activity_level + 1
      WHERE id = round_id;

      UPDATE public.user_stats SET flash_wins = flash_wins + CASE WHEN random() < 0.45 THEN 1 ELSE 0 END
      WHERE user_id = bot.id;
    END LOOP;

    -- Settle old rounds
    UPDATE public.flash_rounds SET
      status = 'settled',
      result_side = CASE floor(random() * 3)::int WHEN 0 THEN 'a' WHEN 1 THEN 'b' ELSE 'be' END
    WHERE game_id = game.id
      AND status = 'open'
      AND round_start_time < now() - interval '45 seconds';
  END LOOP;
END;
$function$;

-- bot_market_make() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.bot_market_make()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  mk record;
  bot record;
  bet_side integer;
  bet_amount numeric;
  price_delta numeric;
  new_price numeric;
BEGIN
  FOR mk IN SELECT * FROM public.market_live_state ORDER BY random() LIMIT 5
  LOOP
    SELECT id INTO bot FROM public.users WHERE is_demo = true ORDER BY random() LIMIT 1;
    IF bot.id IS NULL THEN CONTINUE; END IF;
    bet_side := CASE WHEN random() < (mk.current_probability / 100.0) THEN 1 ELSE 0 END;
    bet_amount := round((10 + 4990 * pow(random(), 2.5))::numeric, 2);
    price_delta := (random() - 0.5) * 1.5;
    IF bet_side = 1 THEN price_delta := price_delta + 0.3; ELSE price_delta := price_delta - 0.3; END IF;
    new_price := GREATEST(2, LEAST(98, mk.current_probability + price_delta));

    UPDATE public.market_live_state SET
      current_probability = round(new_price, 2),
      volume_total = volume_total + bet_amount,
      participants_count = participants_count + 1,
      price_history = CASE
        WHEN jsonb_array_length(COALESCE(price_history,'[]'::jsonb)) > 200
        THEN (price_history - 0) || jsonb_build_array(round(new_price,2))
        ELSE COALESCE(price_history,'[]'::jsonb) || jsonb_build_array(round(new_price,2))
      END,
      updated_at = now()
    WHERE market_id = mk.market_id;

    INSERT INTO public.market_bets (market_id, side, amount_pct, user_is_me, timestamp)
    VALUES (mk.market_id, bet_side, LEAST(1, bet_amount / 5000.0), 0, now());
  END LOOP;
END;
$function$;

-- bot_social_activity() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.bot_social_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  bot1 uuid;
  bot2 uuid;
  msg record;
BEGIN
  -- Bots follow each other (10 new follows)
  FOR i IN 1..10 LOOP
    SELECT id INTO bot1 FROM public.users WHERE is_demo = true ORDER BY random() LIMIT 1;
    SELECT id INTO bot2 FROM public.users WHERE is_demo = true AND id != bot1 ORDER BY random() LIMIT 1;
    IF bot1 IS NOT NULL AND bot2 IS NOT NULL THEN
      INSERT INTO public.user_following (follower_id, followed_id)
      VALUES (bot1, bot2)
      ON CONFLICT DO NOTHING;
      UPDATE public.user_stats SET followers_count = followers_count + 1 WHERE user_id = bot2;
      UPDATE public.user_stats SET following_count = following_count + 1 WHERE user_id = bot1;
    END IF;
  END LOOP;

  -- React to recent chat messages
  FOR msg IN SELECT id, reactions FROM public.chat_messages
             WHERE created_at > now() - interval '5 minutes'
             ORDER BY random() LIMIT 5
  LOOP
    UPDATE public.chat_messages SET
      reactions = COALESCE(reactions, '{}'::jsonb) ||
        jsonb_build_object(
          CASE floor(random() * 5)::int
            WHEN 0 THEN '🔥' WHEN 1 THEN '👍' WHEN 2 THEN '🚀'
            WHEN 3 THEN '💰' ELSE '🎯'
          END,
          COALESCE((reactions->>CASE floor(random() * 5)::int
            WHEN 0 THEN '🔥' WHEN 1 THEN '👍' WHEN 2 THEN '🚀'
            WHEN 3 THEN '💰' ELSE '🎯'
          END)::int, 0) + 1
        )
    WHERE id = msg.id;
  END LOOP;
END;
$function$;

-- bot_tick() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.bot_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public.bot_market_make();
  PERFORM public.bot_chat_activity();
  IF random() < 0.3 THEN
    PERFORM public.flash_tick_server();
  END IF;
  IF random() < 0.2 THEN
    PERFORM public.bot_social_activity();
  END IF;
END;
$function$;

-- check_badges() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.check_badges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_stats record;
  v_new_badges text[] := '{}';
BEGIN
  SELECT * INTO v_stats FROM public.user_stats WHERE user_id = v_uid;

  -- first: played >= 1
  IF v_stats.bets_placed >= 1 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id=v_uid AND badge_id='first') THEN
    INSERT INTO public.user_badges (user_id, badge_id) VALUES (v_uid, 'first') ON CONFLICT DO NOTHING;
    v_new_badges := array_append(v_new_badges, 'first');
  END IF;
  -- streak7: best streak >= 7
  IF v_stats.streak_best >= 7 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id=v_uid AND badge_id='streak7') THEN
    INSERT INTO public.user_badges (user_id, badge_id) VALUES (v_uid, 'streak7') ON CONFLICT DO NOTHING;
    v_new_badges := array_append(v_new_badges, 'streak7');
  END IF;
  -- voice: messages >= 50
  IF v_stats.messages_total >= 50 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id=v_uid AND badge_id='voice') THEN
    INSERT INTO public.user_badges (user_id, badge_id) VALUES (v_uid, 'voice') ON CONFLICT DO NOTHING;
    v_new_badges := array_append(v_new_badges, 'voice');
  END IF;
  -- dep: deposits >= 1
  IF v_stats.deposits_count >= 1 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id=v_uid AND badge_id='dep') THEN
    INSERT INTO public.user_badges (user_id, badge_id) VALUES (v_uid, 'dep') ON CONFLICT DO NOTHING;
    v_new_badges := array_append(v_new_badges, 'dep');
  END IF;
  -- flash3: flash wins >= 3
  IF v_stats.flash_wins >= 3 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id=v_uid AND badge_id='flash3') THEN
    INSERT INTO public.user_badges (user_id, badge_id) VALUES (v_uid, 'flash3') ON CONFLICT DO NOTHING;
    v_new_badges := array_append(v_new_badges, 'flash3');
  END IF;
  -- whale: max bet >= 500
  IF v_stats.bets_max_amount >= 500 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id=v_uid AND badge_id='whale') THEN
    INSERT INTO public.user_badges (user_id, badge_id) VALUES (v_uid, 'whale') ON CONFLICT DO NOTHING;
    v_new_badges := array_append(v_new_badges, 'whale');
  END IF;

  RETURN jsonb_build_object('new_badges', v_new_badges);
END;
$function$;

-- claim_mission(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.claim_mission(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mission record;
BEGIN
  SELECT * INTO v_mission FROM public.missions
  WHERE id = p_mission_id AND user_id = v_uid AND NOT is_claimed;

  IF v_mission IS NULL THEN RAISE EXCEPTION 'Mission not found or already claimed'; END IF;
  IF v_mission.current_progress < v_mission.goal_value THEN RAISE EXCEPTION 'Mission not complete'; END IF;

  UPDATE public.missions SET is_claimed = true WHERE id = p_mission_id;
  UPDATE public.user_stats SET xp = xp + v_mission.xp_reward WHERE user_id = v_uid;

  RETURN jsonb_build_object('xp_granted', v_mission.xp_reward);
END;
$function$;

-- clear_notifications() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.clear_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.notifications WHERE user_id = auth.uid();
END;
$function$;

-- create_clan(text,text,text,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.create_clan(p_name text, p_description text DEFAULT ''::text, p_emblem_color text DEFAULT '#2448FF'::text, p_emblem_icon text DEFAULT 'shield'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_clan_id uuid;
  v_balance numeric;
  v_fee numeric := 500; -- clan creation fee
BEGIN
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < v_fee THEN RAISE EXCEPTION 'Insufficient balance (500$ required)'; END IF;

  INSERT INTO public.clans (name, founder_user_id, description, emblem_color, emblem_icon)
  VALUES (p_name, v_uid, p_description, p_emblem_color, p_emblem_icon)
  RETURNING id INTO v_clan_id;

  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_clan_id, v_uid, 'founder');

  -- Debit fee
  UPDATE public.user_stats SET balance = balance - v_fee WHERE user_id = v_uid;
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  SELECT v_uid, -v_fee, balance, 'clan', v_clan_id::text FROM public.user_stats WHERE user_id = v_uid;

  -- Create clan chat room
  INSERT INTO public.chat_rooms (id, name, kind, clan_id) VALUES ('clan:' || v_clan_id, p_name, 'clan', v_clan_id);

  RETURN jsonb_build_object('clan_id', v_clan_id, 'new_balance', (SELECT balance FROM public.user_stats WHERE user_id = v_uid));
END;
$function$;

-- create_duel(text,text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.create_duel(p_market_id text, p_side text, p_stake numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
  v_duel_id uuid;
  v_fee numeric;
BEGIN
  v_fee := round((p_stake * 0.05)::numeric, 2);
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < (p_stake + v_fee) THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - p_stake - v_fee;
  UPDATE public.user_stats SET balance = v_new_balance WHERE user_id = v_uid;

  INSERT INTO public.duels (creator_id, market_id, creator_side, creator_stake, pot)
  VALUES (v_uid, p_market_id, p_side, p_stake, p_stake)
  RETURNING id INTO v_duel_id;

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, -(p_stake + v_fee), v_new_balance, 'duel', v_duel_id::text);

  RETURN jsonb_build_object('duel_id', v_duel_id, 'new_balance', v_new_balance);
END;
$function$;

-- create_notification(uuid,text,text,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_icon text, p_text text, p_href text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, icon, text, href)
  VALUES (p_user_id, p_icon, p_text, p_href);
  -- Keep max 30
  DELETE FROM public.notifications WHERE id IN (
    SELECT id FROM public.notifications WHERE user_id = p_user_id
    ORDER BY created_at DESC OFFSET 30
  );
END;
$function$;

-- decline_friend_request(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.decline_friend_request(p_from_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.friendships
  WHERE user_id = p_from_user_id AND friend_id = auth.uid() AND status = 'pending';
  RETURN jsonb_build_object('status', 'declined');
END;
$function$;

-- delete_notification(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.delete_notification(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.notifications WHERE id = p_id AND user_id = auth.uid();
END;
$function$;

-- demo_deposit(text,text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.demo_deposit(p_coin text, p_network text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Ensure user_stats exists (user row must already exist)
  INSERT INTO public.user_stats (user_id, balance) VALUES (v_uid, 0) ON CONFLICT (user_id) DO NOTHING;

  -- Get current balance
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  v_new_balance := COALESCE(v_balance, 0) + p_amount;

  -- Credit
  UPDATE public.user_stats SET balance = v_new_balance, deposits_count = deposits_count + 1 WHERE user_id = v_uid;

  -- Record deposit
  BEGIN
    INSERT INTO public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, status)
    VALUES (v_uid, p_coin, p_network, p_amount, p_amount, 12, 12, 'completed');
  EXCEPTION WHEN foreign_key_violation THEN
    -- User not in users table yet, skip deposit record
    NULL;
  END;

  -- Ledger
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, p_amount, v_new_balance, 'deposit', p_coin || ':' || p_network);

  -- XP for first deposit
  IF (SELECT deposits_count FROM public.user_stats WHERE user_id = v_uid) = 1 THEN
    UPDATE public.user_stats SET xp = xp + 100 WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$function$;

-- demo_withdrawal(text,text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.demo_withdrawal(p_network text, p_address text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  INSERT INTO public.user_stats (user_id, balance) VALUES (v_uid, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_balance, 0) < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - p_amount;
  UPDATE public.user_stats SET balance = v_new_balance WHERE user_id = v_uid;

  BEGIN
    INSERT INTO public.withdrawals (user_id, network, destination_address, amount_usd, status)
    VALUES (v_uid, p_network, p_address, p_amount, 'completed');
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, -p_amount, v_new_balance, 'withdrawal', p_network);

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$function$;

-- eng_constants() — security invoker, search_path NON fixé
CREATE OR REPLACE FUNCTION public.eng_constants()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"BOOK_PCT":0.006,"BOOK_MIN":400,"LIQ_RATE":0.01,"PM_K":0.70,"RANK_DISC":0.90,"PMAX":0.99,"PMIN":0.01}'::jsonb;
$function$;

-- flash_bet(text,text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.flash_bet(p_game_id text, p_side text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_new_balance numeric;
  v_round_id uuid;
  v_fee numeric;
  v_net numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_side NOT IN ('a','b','be') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  -- Lock balance
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  -- Fee = 5%
  v_fee := round((p_amount * 0.05)::numeric, 2);
  v_net := p_amount - v_fee;

  -- Get current open round
  SELECT id INTO v_round_id FROM public.flash_rounds
  WHERE game_id = p_game_id AND status = 'open'
  ORDER BY round_number DESC LIMIT 1;

  IF v_round_id IS NULL THEN
    -- Create a new round
    INSERT INTO public.flash_rounds (game_id, round_number, round_start_time, status)
    VALUES (p_game_id, COALESCE((SELECT max(round_number)+1 FROM public.flash_rounds WHERE game_id=p_game_id),1), now(), 'open')
    RETURNING id INTO v_round_id;
  END IF;

  -- Debit balance
  v_new_balance := v_balance - p_amount;
  UPDATE public.user_stats SET balance = v_new_balance, bets_placed = bets_placed + 1 WHERE user_id = v_uid;

  -- Insert bet
  INSERT INTO public.flash_bets (user_id, round_id, game_id, side, amount_wager)
  VALUES (v_uid, v_round_id, p_game_id, p_side, v_net);

  -- Update round pools
  UPDATE public.flash_rounds SET
    pool_yes = pool_yes + CASE WHEN p_side = 'a' THEN v_net ELSE 0 END,
    pool_no = pool_no + CASE WHEN p_side = 'b' THEN v_net ELSE 0 END,
    pool_breakeven = pool_breakeven + CASE WHEN p_side = 'be' THEN v_net ELSE 0 END,
    total_pool = total_pool + v_net,
    activity_level = activity_level + 1
  WHERE id = v_round_id;

  -- Ledger
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_uid, -p_amount, v_new_balance, 'flash', p_game_id);

  -- XP
  UPDATE public.user_stats SET xp = xp + 10 WHERE user_id = v_uid;

  RETURN jsonb_build_object('new_balance', v_new_balance, 'round_id', v_round_id, 'net', v_net);
END;
$function$;

-- flash_settle_round(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.flash_settle_round(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_round record;
  v_result_side text;
  v_winning_pool numeric;
  v_total numeric;
  v_bet record;
  v_payout numeric;
  v_settled int := 0;
BEGIN
  SELECT * INTO v_round FROM public.flash_rounds WHERE id = p_round_id AND status = 'open' FOR UPDATE;
  IF v_round IS NULL THEN RETURN jsonb_build_object('error', 'Round not found or already settled'); END IF;

  -- Determine winner (random for now — in production, based on price)
  v_result_side := CASE floor(random() * 3)::int WHEN 0 THEN 'a' WHEN 1 THEN 'b' ELSE 'be' END;
  v_total := v_round.pool_yes + v_round.pool_no + v_round.pool_breakeven;
  v_winning_pool := CASE v_result_side
    WHEN 'a' THEN v_round.pool_yes
    WHEN 'b' THEN v_round.pool_no
    WHEN 'be' THEN v_round.pool_breakeven
    ELSE 0 END;

  -- Mark round as settled
  UPDATE public.flash_rounds SET status = 'settled', result_side = v_result_side WHERE id = p_round_id;

  -- Pay winners
  IF v_winning_pool > 0 THEN
    FOR v_bet IN SELECT * FROM public.flash_bets WHERE round_id = p_round_id AND side = v_result_side
    LOOP
      v_payout := v_bet.amount_wager * (v_total / v_winning_pool);
      UPDATE public.user_stats SET
        balance = balance + v_payout,
        flash_wins = flash_wins + 1
      WHERE user_id = v_bet.user_id;

      UPDATE public.flash_bets SET profit_loss = v_payout - v_bet.amount_wager, result = 'win' WHERE id = v_bet.id;

      INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
      SELECT v_bet.user_id, v_payout,
        (SELECT balance FROM public.user_stats WHERE user_id = v_bet.user_id),
        'flash_win', v_round.game_id;

      v_settled := v_settled + 1;
    END LOOP;
  END IF;

  -- Mark losers
  UPDATE public.flash_bets SET profit_loss = -amount_wager, result = 'lose'
  WHERE round_id = p_round_id AND side != v_result_side;

  RETURN jsonb_build_object('result', v_result_side, 'winners', v_settled, 'pool', v_total);
END;
$function$;

-- flash_tick_server() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.flash_tick_server()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_round record;
  v_game record;
BEGIN
  -- Settle old rounds
  FOR v_round IN SELECT id FROM public.flash_rounds
    WHERE status = 'open' AND round_start_time < now() - interval '45 seconds'
  LOOP
    PERFORM public.flash_settle_round(v_round.id);
  END LOOP;

  -- Create new rounds
  FOR v_game IN SELECT id FROM public.flash_games
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.flash_rounds WHERE game_id = v_game.id AND status = 'open') THEN
      INSERT INTO public.flash_rounds (game_id, round_number, round_start_time, status)
      VALUES (v_game.id, COALESCE((SELECT max(round_number)+1 FROM public.flash_rounds WHERE game_id=v_game.id),1), now(), 'open');
    END IF;
  END LOOP;

  -- Bot flash bets
  PERFORM public.bot_flash_activity();
END;
$function$;

-- get_chat_history(text,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_chat_history(p_room_id text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, room_id text, username text, avatar_color text, message_type text, text_content text, reactions jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT cm.id, cm.room_id, u.username, u.avatar_color, cm.message_type, cm.text_content, cm.reactions, cm.created_at
  FROM public.chat_messages cm
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.room_id = p_room_id
  ORDER BY cm.created_at DESC
  LIMIT p_limit;
$function$;

-- get_clan_members(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_clan_members(p_clan_id uuid)
 RETURNS TABLE(username text, avatar_color text, role text, joined_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT u.username, u.avatar_color, cm.role, cm.joined_at
  FROM public.clan_members cm
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.clan_id = p_clan_id
  ORDER BY cm.role DESC, cm.joined_at;
$function$;

-- get_clans() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_clans()
 RETURNS TABLE(id uuid, name text, description text, emblem_color text, emblem_icon text, member_count integer, founder_username text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT c.id, c.name, c.description, c.emblem_color, c.emblem_icon, c.member_count, u.username
  FROM public.clans c
  JOIN public.users u ON u.id = c.founder_user_id
  ORDER BY c.member_count DESC;
$function$;

-- get_friends() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_friends()
 RETURNS TABLE(username text, avatar_color text, status text, direction text, user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT u.username, u.avatar_color, f.status,
    CASE WHEN f.user_id = auth.uid() THEN 'out' ELSE 'in' END as direction,
    CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END as user_id
  FROM public.friendships f
  JOIN public.users u ON u.id = CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END
  WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
$function$;

-- get_leaderboard(text,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_period text DEFAULT 'season'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank bigint, username text, avatar_color text, balance numeric, profit numeric, accuracy integer, bets_placed integer, is_bot boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT row_number() OVER (ORDER BY s.profit_realized DESC) as rank,
    u.username, u.avatar_color, s.balance, s.profit_realized, s.bets_accuracy_pct, s.bets_placed, u.is_demo
  FROM public.user_stats s
  JOIN public.users u ON u.id = s.user_id
  WHERE s.bets_placed > 0
  ORDER BY s.profit_realized DESC
  LIMIT p_limit;
$function$;

-- get_markets() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_markets()
 RETURNS SETOF market_live_state
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT * FROM public.market_live_state;
$function$;

-- get_my_badges() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_badges()
 RETURNS TABLE(badge_id text, unlocked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT badge_id, unlocked_at FROM public.user_badges WHERE user_id = auth.uid();
$function$;

-- get_my_balance() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_balance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_stats record;
BEGIN
  SELECT balance, xp, bets_placed, bets_won, bets_settled, bets_accuracy_pct,
         deposits_count, flash_wins, followed_bets_count, profit_realized,
         streak_current, streak_best, copiers_count, messages_total,
         rank_tier, rank_division
  INTO v_stats
  FROM public.user_stats WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'balance', v_stats.balance,
    'xp', v_stats.xp,
    'played', v_stats.bets_placed,
    'wins', v_stats.bets_won,
    'settled', v_stats.bets_settled,
    'accuracy', v_stats.bets_accuracy_pct,
    'deposits', v_stats.deposits_count,
    'flashWins', v_stats.flash_wins,
    'followed', v_stats.followed_bets_count,
    'realized', v_stats.profit_realized,
    'streak', v_stats.streak_current,
    'bestStreak', v_stats.streak_best,
    'copiers', v_stats.copiers_count,
    'msgsTotal', v_stats.messages_total,
    'rank_tier', v_stats.rank_tier,
    'rank_division', v_stats.rank_division
  );
END;
$function$;

-- get_my_clan() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_clan()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_clan_id uuid; v_role text;
BEGIN
  SELECT cm.clan_id, cm.role INTO v_clan_id, v_role FROM public.clan_members cm WHERE cm.user_id = auth.uid() LIMIT 1;
  IF v_clan_id IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'role', v_role, 'member_count', c.member_count, 'emblem_color', c.emblem_color)
    FROM public.clans c WHERE c.id = v_clan_id);
END;
$function$;

-- get_my_copies() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_copies()
 RETURNS TABLE(username text, avatar_color text, is_active boolean, started_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT u.username, u.avatar_color, cf.is_active, cf.started_at
  FROM public.copy_following cf
  JOIN public.users u ON u.id = cf.copy_target_user_id
  WHERE cf.copy_follower_id = auth.uid();
$function$;

-- get_my_deposits() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_deposits()
 RETURNS TABLE(id uuid, coin text, network text, coin_amount numeric, usd_equivalent numeric, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id, coin, network, coin_amount, usd_equivalent, status, created_at
  FROM public.deposits WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 50;
$function$;

-- get_my_friends() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_friends()
 RETURNS TABLE(user_id uuid, username text, avatar_color text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT u.id, u.username, u.avatar_color, f.status
  FROM public.friendships f
  JOIN public.users u ON u.id = CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END
  WHERE (f.user_id = auth.uid() OR f.friend_id = auth.uid())
    AND f.status = 'accepted';
$function$;

-- get_my_history(integer,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_history(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, market_id text, question text, side text, was_winner boolean, pnl numeric, settled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id, kind, market_id, question, side, was_winner, pnl, settled_at
  FROM public.position_history
  WHERE user_id = auth.uid()
  ORDER BY settled_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

-- get_my_notifications(integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, icon text, text text, href text, is_read boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id, icon, text, href, is_read, created_at
  FROM public.notifications WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT p_limit;
$function$;

-- get_my_positions() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_positions()
 RETURNS TABLE(market_id text, side text, shares numeric, average_price numeric, current_price numeric, pnl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT p.market_id, p.side, p.shares, p.average_price,
    CASE WHEN p.side = 'oui' THEN mls.current_probability ELSE 100 - mls.current_probability END as current_price,
    p.shares * (CASE WHEN p.side = 'oui' THEN mls.current_probability ELSE 100 - mls.current_probability END - p.average_price) / 100 as pnl
  FROM public.positions p
  JOIN public.market_live_state mls ON mls.market_id = p.market_id
  WHERE p.user_id = auth.uid();
$function$;

-- get_my_withdrawals() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.get_my_withdrawals()
 RETURNS TABLE(id uuid, network text, destination_address text, amount_usd numeric, status text, requested_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id, network, destination_address, amount_usd, status, requested_at
  FROM public.withdrawals WHERE user_id = auth.uid()
  ORDER BY requested_at DESC LIMIT 50;
$function$;

-- grant_xp(uuid,integer,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.grant_xp(p_user_id uuid, p_amount integer, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.user_stats SET xp = xp + p_amount WHERE user_id = p_user_id;
END;
$function$;

-- handle_auth_user_created() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_username text;
  v_email text;
BEGIN
  v_email := NEW.email;
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(v_email, '@', 1) || '_' || substr(NEW.id::text, 1, 4)
  );

  -- Ensure unique username
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_username := v_username || substr(md5(random()::text), 1, 3);
  END LOOP;

  -- Insert into public.users
  INSERT INTO public.users (id, username, email, avatar_color, onboarded, welcomed, is_demo)
  VALUES (NEW.id, v_username, v_email, '#2448FF', true, true, false)
  ON CONFLICT (id) DO NOTHING;

  -- user_stats and user_full_state are created by handle_new_user trigger on users table

  RETURN NEW;
END;
$function$;

-- handle_new_user() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_full_state (user_id, state) VALUES (NEW.id, '{}'::jsonb) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- handle_updated_at() — security invoker, search_path NON fixé
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- init_daily_missions() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.init_daily_missions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid uuid := auth.uid(); v_today date := current_date;
BEGIN
  -- Delete old unclaimed missions
  DELETE FROM public.missions WHERE user_id = v_uid AND expires_at < now() AND NOT is_claimed;

  -- Create today's missions if not exists
  IF NOT EXISTS (SELECT 1 FROM public.missions WHERE user_id = v_uid AND created_at::date = v_today) THEN
    INSERT INTO public.missions (user_id, mission_type, label, goal_value, xp_reward, action_href, expires_at) VALUES
      (v_uid, 'bet', 'Place un pari', 1, 50, '#accueil', now() + interval '1 day'),
      (v_uid, 'flashbet', 'Joue un pari eclair', 1, 50, '#eclair', now() + interval '1 day'),
      (v_uid, 'chat', 'Ecris un message', 3, 30, '#chat', now() + interval '1 day');
  END IF;

  RETURN jsonb_build_object('missions', (SELECT json_agg(row_to_json(m)) FROM public.missions m WHERE m.user_id = v_uid AND NOT m.is_claimed));
END;
$function$;

-- join_clan(uuid) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.join_clan(p_clan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (p_clan_id, v_uid, 'member')
  ON CONFLICT DO NOTHING;

  UPDATE public.clans SET member_count = member_count + 1 WHERE id = p_clan_id;

  RETURN jsonb_build_object('status', 'joined');
END;
$function$;

-- leave_clan() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.leave_clan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid uuid := auth.uid(); v_clan_id uuid;
BEGIN
  SELECT clan_id INTO v_clan_id FROM public.clan_members WHERE user_id = v_uid;
  IF v_clan_id IS NULL THEN RAISE EXCEPTION 'Not in a clan'; END IF;
  DELETE FROM public.clan_members WHERE clan_id = v_clan_id AND user_id = v_uid;
  UPDATE public.clans SET member_count = GREATEST(0, member_count - 1) WHERE id = v_clan_id;
  RETURN jsonb_build_object('status', 'left');
END;
$function$;

-- mark_notifications_read() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.mark_notifications_read()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.notifications SET is_read = true WHERE user_id = auth.uid() AND NOT is_read;
END;
$function$;

-- newsletter_subscribe(text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.newsletter_subscribe(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.newsletter_subscribers (email, subscribed)
  VALUES (lower(trim(p_email)), true)
  ON CONFLICT (email) DO UPDATE SET subscribed = true, unsubscribed_at = null;
  RETURN jsonb_build_object('status', 'subscribed');
END;
$function$;

-- newsletter_unsubscribe(text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.newsletter_unsubscribe(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.newsletter_subscribers SET subscribed = false, unsubscribed_at = now()
  WHERE email = lower(trim(p_email));
  RETURN jsonb_build_object('status', 'unsubscribed');
END;
$function$;

-- place_bet(text,text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.place_bet(p_market_id text, p_side text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_market record;
  v_depth numeric;
  v_mid numeric;
  v_half numeric;
  v_a0 numeric;
  v_cost numeric;
  v_shares numeric;
  v_avg_price numeric;
  v_fee_rate numeric;
  v_fee numeric;
  v_total numeric;
  v_new_price numeric;
  v_new_balance numeric;
  v_impact numeric;
  v_category text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_side NOT IN ('oui', 'non') THEN RAISE EXCEPTION 'Side must be oui or non'; END IF;

  -- Ensure user_stats exists
  INSERT INTO public.user_stats (user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;

  -- Lock user row
  SELECT balance INTO v_balance FROM public.user_stats WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  -- Get market
  SELECT * INTO v_market FROM public.market_live_state WHERE market_id = p_market_id FOR UPDATE;
  IF v_market IS NULL THEN RAISE EXCEPTION 'Market not found'; END IF;

  -- Get category
  SELECT category INTO v_category FROM public.markets WHERE id = p_market_id;
  v_fee_rate := public.wm_fee_rate(COALESCE(v_category, 'Crypto'));

  -- Depth, midpoint, spread
  v_depth := public.book_depth(v_market.volume_total, v_market.liquidity_depth) * 100;
  v_mid := CASE WHEN p_side = 'oui' THEN v_market.current_probability / 100.0 ELSE (100 - v_market.current_probability) / 100.0 END;
  v_half := LEAST(1.5, GREATEST(0.1, 15 / sqrt(GREATEST(1, v_depth / 100)))) / 100;
  v_a0 := LEAST(0.99, v_mid + v_half);

  -- Iterative fee calculation
  v_total := p_amount;
  v_cost := v_total / (1 + v_fee_rate / 2);
  FOR i IN 1..12 LOOP
    IF v_cost <= 0 THEN EXIT; END IF;
    v_shares := 2 * v_cost / (v_a0 + sqrt(v_a0 * v_a0 + 2 * v_cost / GREATEST(1, v_depth)));
    v_avg_price := CASE WHEN v_shares > 0 THEN v_cost / v_shares ELSE v_a0 END;
    v_fee := v_cost * v_fee_rate * (1 - v_avg_price);
    v_cost := GREATEST(0, v_total - v_fee);
  END LOOP;

  -- Final
  v_shares := CASE WHEN v_cost > 0 THEN 2 * v_cost / (v_a0 + sqrt(v_a0 * v_a0 + 2 * v_cost / GREATEST(1, v_depth))) ELSE 0 END;
  v_avg_price := CASE WHEN v_shares > 0 THEN v_cost / v_shares ELSE v_a0 END;
  v_fee := v_cost * v_fee_rate * (1 - v_avg_price);
  v_total := v_cost + v_fee;

  IF v_total <= 0 OR v_shares <= 0 THEN RAISE EXCEPTION 'Invalid bet'; END IF;
  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_balance := v_balance - v_total;

  -- Debit
  UPDATE public.user_stats SET
    balance = v_new_balance, bets_placed = bets_placed + 1,
    bets_max_amount = GREATEST(bets_max_amount, v_total),
    profit_realized = profit_realized - v_fee, xp = xp + 10
  WHERE user_id = v_user_id;

  -- Ledger (with explicit NOT NULL balance_after)
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, -v_total, COALESCE(v_new_balance, 0), 'bet', p_market_id || ':' || p_side);

  -- Position
  INSERT INTO public.positions (user_id, market_id, side, shares, average_price)
  VALUES (v_user_id, p_market_id, p_side, round(v_shares::numeric, 2), round((v_avg_price * 100)::numeric, 4))
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    average_price = round(((positions.average_price * positions.shares + (v_avg_price * 100) * round(v_shares::numeric, 2)) / GREATEST(0.01, positions.shares + round(v_shares::numeric, 2)))::numeric, 4),
    shares = positions.shares + round(v_shares::numeric, 2),
    updated_at = now();

  -- Market price update
  v_impact := v_shares / GREATEST(1, v_depth);
  v_new_price := CASE WHEN p_side = 'oui'
    THEN LEAST(97, GREATEST(3, v_market.current_probability + v_impact * 100))
    ELSE LEAST(97, GREATEST(3, v_market.current_probability - v_impact * 100)) END;

  UPDATE public.market_live_state SET
    current_probability = round(v_new_price::numeric, 2),
    volume_total = volume_total + v_total, participants_count = participants_count + 1, updated_at = now()
  WHERE market_id = p_market_id;

  RETURN jsonb_build_object('new_balance', v_new_balance, 'shares', round(v_shares::numeric, 2),
    'avg_price', round((v_avg_price * 100)::numeric, 2), 'fee', round(v_fee::numeric, 2),
    'total', round(v_total::numeric, 2), 'new_market_price', round(v_new_price::numeric, 2));
END;
$function$;

-- progress_mission(uuid,text,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.progress_mission(p_user_id uuid, p_type text, p_amount integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.missions SET current_progress = LEAST(goal_value, current_progress + p_amount)
  WHERE user_id = p_user_id AND mission_type = p_type AND NOT is_claimed AND expires_at > now();
END;
$function$;

-- react_to_message(bigint,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.react_to_message(p_message_id bigint, p_emoji text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reactions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.chat_messages SET
    reactions = jsonb_set(
      COALESCE(reactions, '{}'::jsonb),
      ARRAY[p_emoji],
      to_jsonb(COALESCE((reactions->>p_emoji)::int, 0) + 1)
    )
  WHERE id = p_message_id
  RETURNING reactions INTO v_reactions;

  RETURN v_reactions;
END;
$function$;

-- remove_friend(text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid uuid := auth.uid(); v_fid uuid;
BEGIN
  SELECT id INTO v_fid FROM public.users WHERE username ILIKE p_friend_username;
  IF v_fid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  DELETE FROM public.friendships WHERE
    (user_id = v_uid AND friend_id = v_fid) OR (user_id = v_fid AND friend_id = v_uid);
  RETURN jsonb_build_object('status', 'removed');
END;
$function$;

-- search_users(text,integer) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.search_users(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(user_id uuid, username text, avatar_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id, username, avatar_color
  FROM public.users
  WHERE username ILIKE '%' || trim(p_query) || '%'
    AND is_demo = false
    AND id != auth.uid()
    AND length(trim(p_query)) >= 2
  ORDER BY
    CASE WHEN username ILIKE trim(p_query) THEN 0
         WHEN username ILIKE trim(p_query) || '%' THEN 1
         ELSE 2 END,
    username
  LIMIT p_limit;
$function$;

-- sell_position(text,text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.sell_position(p_market_id text, p_side text, p_shares numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_pos record;
  v_market record;
  v_depth numeric;
  v_mid numeric;
  v_half numeric;
  v_b0 numeric;
  v_sell_shares numeric;
  v_proceeds numeric;
  v_new_balance numeric;
  v_new_price numeric;
  v_impact numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Get position
  SELECT * INTO v_pos FROM public.positions
  WHERE user_id = v_user_id AND market_id = p_market_id AND side = p_side
  FOR UPDATE;

  IF v_pos IS NULL OR v_pos.shares <= 0 THEN
    RAISE EXCEPTION 'No position to sell';
  END IF;

  v_sell_shares := LEAST(p_shares, v_pos.shares);

  -- Get market
  SELECT * INTO v_market FROM public.market_live_state
  WHERE market_id = p_market_id FOR UPDATE;

  -- bookSell calculation
  v_depth := public.book_depth(v_market.volume_total, v_market.liquidity_depth) * 100;
  v_mid := CASE WHEN p_side = 'oui'
    THEN v_market.current_probability / 100.0
    ELSE (100 - v_market.current_probability) / 100.0
  END;
  v_half := LEAST(1.5, GREATEST(0.1, 15 / sqrt(v_depth / 100))) / 100;
  v_b0 := GREATEST(0.01, v_mid - v_half);

  -- pro = s * B0 - s^2 / (2*D)
  v_proceeds := v_sell_shares * v_b0 - (v_sell_shares * v_sell_shares) / (2 * v_depth);
  v_proceeds := GREATEST(0, v_proceeds);

  -- Credit balance
  SELECT balance INTO v_new_balance FROM public.user_stats WHERE user_id = v_user_id FOR UPDATE;
  v_new_balance := v_new_balance + v_proceeds;

  UPDATE public.user_stats SET
    balance = v_new_balance,
    profit_realized = profit_realized + v_proceeds - (v_sell_shares * v_pos.average_price / 100)
  WHERE user_id = v_user_id;

  -- Ledger
  INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  VALUES (v_user_id, v_proceeds, v_new_balance, 'sell', p_market_id || ':' || p_side);

  -- Update position
  IF v_sell_shares >= v_pos.shares THEN
    DELETE FROM public.positions WHERE id = v_pos.id;
    -- Move to history
    INSERT INTO public.position_history (user_id, kind, market_id, side, was_winner, pnl)
    VALUES (v_user_id, 'sell', p_market_id, p_side, v_proceeds > (v_sell_shares * v_pos.average_price / 100),
      v_proceeds - (v_sell_shares * v_pos.average_price / 100));
  ELSE
    UPDATE public.positions SET shares = shares - v_sell_shares, updated_at = now() WHERE id = v_pos.id;
  END IF;

  -- Update market
  v_impact := v_sell_shares / v_depth;
  v_new_price := CASE WHEN p_side = 'oui'
    THEN LEAST(97, GREATEST(3, v_market.current_probability - v_impact * 100))
    ELSE LEAST(97, GREATEST(3, v_market.current_probability + v_impact * 100))
  END;

  UPDATE public.market_live_state SET
    current_probability = round(v_new_price::numeric, 2),
    volume_total = volume_total + v_proceeds,
    updated_at = now()
  WHERE market_id = p_market_id;

  RETURN jsonb_build_object(
    'new_balance', v_new_balance,
    'proceeds', round(v_proceeds::numeric, 2),
    'shares_sold', v_sell_shares,
    'new_market_price', round(v_new_price::numeric, 2)
  );
END;
$function$;

-- send_chat_message(text,text,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.send_chat_message(p_room_id text, p_text text, p_type text DEFAULT 'msg'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_msg_id bigint;
  v_username text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(trim(p_text)) = 0 THEN RAISE EXCEPTION 'Empty message'; END IF;

  SELECT username INTO v_username FROM public.users WHERE id = v_uid;

  INSERT INTO public.chat_messages (room_id, user_id, message_type, text_content)
  VALUES (p_room_id, v_uid, p_type, trim(p_text))
  RETURNING id INTO v_msg_id;

  -- Update stats
  UPDATE public.user_stats SET messages_total = messages_total + 1 WHERE user_id = v_uid;

  -- Grant 2 XP for chat (capped at 20 per day via client)
  UPDATE public.user_stats SET xp = xp + 2 WHERE user_id = v_uid;

  RETURN jsonb_build_object('id', v_msg_id, 'username', v_username);
END;
$function$;

-- send_friend_request(text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target_id uuid;
BEGIN
  SELECT id INTO v_target_id FROM public.users WHERE username ILIKE p_target_username;
  IF v_target_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_target_id = v_uid THEN RAISE EXCEPTION 'Cannot add yourself'; END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_uid, v_target_id, 'pending')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status', 'pending', 'target', p_target_username);
END;
$function$;

-- settle_market(text,text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.settle_market(p_market_id text, p_outcome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pos record;
  v_payout numeric;
  v_count int := 0;
  v_total_payout numeric := 0;
BEGIN
  -- Only service role can call this
  -- In production, add admin check here

  -- Update market status
  UPDATE public.markets SET status = 'resolved', resolution_outcome = p_outcome, resolved_at = now()
  WHERE id = p_market_id;
  UPDATE public.market_live_state SET
    current_probability = CASE WHEN p_outcome = 'yes' THEN 99 ELSE 1 END
  WHERE market_id = p_market_id;

  -- Settle all positions
  FOR v_pos IN SELECT * FROM public.positions WHERE market_id = p_market_id
  LOOP
    -- Winners: side matches outcome. Each share pays $1.
    IF (v_pos.side = 'oui' AND p_outcome = 'yes') OR (v_pos.side = 'non' AND p_outcome = 'no') THEN
      v_payout := v_pos.shares; -- $1 per share
    ELSE
      v_payout := 0;
    END IF;

    -- Credit winner balance
    IF v_payout > 0 THEN
      UPDATE public.user_stats SET
        balance = balance + v_payout,
        bets_won = bets_won + 1,
        bets_settled = bets_settled + 1,
        profit_realized = profit_realized + v_payout - (v_pos.shares * v_pos.average_price / 100)
      WHERE user_id = v_pos.user_id;

      INSERT INTO public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
      SELECT v_pos.user_id, v_payout,
        (SELECT balance FROM public.user_stats WHERE user_id = v_pos.user_id),
        'settlement', p_market_id;
    ELSE
      UPDATE public.user_stats SET bets_settled = bets_settled + 1 WHERE user_id = v_pos.user_id;
    END IF;

    -- Move to history
    INSERT INTO public.position_history (user_id, kind, market_id, side, was_winner, pnl)
    VALUES (v_pos.user_id, 'res', p_market_id, v_pos.side, v_payout > 0,
      v_payout - (v_pos.shares * v_pos.average_price / 100));

    v_count := v_count + 1;
    v_total_payout := v_total_payout + v_payout;
  END LOOP;

  -- Delete all positions for this market
  DELETE FROM public.positions WHERE market_id = p_market_id;

  RETURN jsonb_build_object('positions_settled', v_count, 'total_payout', v_total_payout);
END;
$function$;

-- start_copy(text,numeric) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.start_copy(p_target_username text, p_budget numeric DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid uuid := auth.uid(); v_tid uuid;
BEGIN
  SELECT id INTO v_tid FROM public.users WHERE username ILIKE p_target_username;
  IF v_tid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_tid = v_uid THEN RAISE EXCEPTION 'Cannot copy yourself'; END IF;

  INSERT INTO public.copy_following (copy_follower_id, copy_target_user_id, is_active)
  VALUES (v_uid, v_tid, true) ON CONFLICT DO NOTHING;

  UPDATE public.user_stats SET copiers_count = copiers_count + 1 WHERE user_id = v_tid;

  RETURN jsonb_build_object('status', 'following', 'target', p_target_username);
END;
$function$;

-- stop_copy(text) — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.stop_copy(p_target_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid uuid := auth.uid(); v_tid uuid;
BEGIN
  SELECT id INTO v_tid FROM public.users WHERE username ILIKE p_target_username;
  IF v_tid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  DELETE FROM public.copy_following WHERE copy_follower_id = v_uid AND copy_target_user_id = v_tid;
  UPDATE public.user_stats SET copiers_count = GREATEST(0, copiers_count - 1) WHERE user_id = v_tid;

  RETURN jsonb_build_object('status', 'stopped');
END;
$function$;

-- sync_stats_to_blob() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.sync_stats_to_blob()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.user_full_state
  SET state = COALESCE(state, '{}'::jsonb)
    || jsonb_build_object(
      'balance', NEW.balance,
      'xp', NEW.xp,
      'followers', NEW.followers_count,
      'pos', NEW.seasonal_position,
      'realized', NEW.profit_realized,
      'streak', NEW.streak_current,
      'bestStreak', NEW.streak_best,
      'played', NEW.bets_placed,
      'wins', NEW.bets_won,
      'settled', NEW.bets_settled,
      'maxBet', NEW.bets_max_amount,
      'followed', NEW.followed_bets_count,
      'contraWins', NEW.contra_wins,
      'deposits', NEW.deposits_count,
      'flashWins', NEW.flash_wins,
      'flashStreak', NEW.flash_streak_current,
      'flashBest', NEW.flash_streak_best,
      'flashProfit', NEW.flash_profit_total,
      'msgsTotal', NEW.messages_total,
      'chatXP', NEW.chat_xp_today,
      'copiers', NEW.copiers_count
    ),
    updated_at = now()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$function$;

-- sync_users_to_blob() — SECURITY DEFINER, search_path NON fixé
CREATE OR REPLACE FUNCTION public.sync_users_to_blob()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.user_full_state
  SET state = COALESCE(state, '{}'::jsonb)
    || jsonb_build_object(
      'n', NEW.username,
      'email', NEW.email,
      'photo', NEW.avatar_photo,
      'color', NEW.avatar_color,
      'bio', NEW.bio,
      'wallet', NEW.wallet_address,
      'kyc', NEW.kyc_verified,
      'onboarded', NEW.onboarded,
      'welcomed', NEW.welcomed
    ),
    updated_at = now()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$function$;

-- wm_fee_rate(text) — security invoker, search_path NON fixé
CREATE OR REPLACE FUNCTION public.wm_fee_rate(p_category text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_category
    WHEN 'Crypto' THEN 0.07 WHEN 'Bourse' THEN 0.04 WHEN 'Tech et IA' THEN 0.04
    WHEN 'Matières' THEN 0.04 WHEN 'Devises' THEN 0.04
    ELSE 0.05
  END * 0.70;  -- PM_K = 0.70
$function$;

-- ── 8. Vues ────────────────────────────────────────────────────────────────
create or replace view public.admin_players_view as
 SELECT u.id,
    u.username,
    u.email,
    u.is_demo AS is_bot,
    '$'::text || to_char(s.balance, 'FM999,999,999.00'::text) AS balance_display,
    s.balance AS balance_raw,
    s.rank_tier,
        CASE s.rank_tier
            WHEN 0 THEN 'Fer'::text
            WHEN 1 THEN 'Bronze'::text
            WHEN 2 THEN 'Argent'::text
            WHEN 3 THEN 'Or'::text
            WHEN 4 THEN 'Platine'::text
            WHEN 5 THEN 'Diamant'::text
            WHEN 6 THEN 'Ascendant'::text
            WHEN 7 THEN 'Immortel'::text
            WHEN 8 THEN 'Radiant'::text
            ELSE NULL::text
        END AS rank_name,
    s.rank_division,
    s.xp,
    s.bets_placed,
    s.bets_won,
    s.bets_accuracy_pct AS accuracy,
    s.flash_wins,
    '$'::text || to_char(s.profit_realized, 'FM999,999,999.00'::text) AS profit_display,
    s.profit_realized AS profit_raw,
    u.created_at
   FROM users u
     JOIN user_stats s ON s.user_id = u.id
  ORDER BY u.is_demo, s.balance DESC;

-- ── 9. Triggers ────────────────────────────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clans FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.flash_rounds FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.markets FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_full_state FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_stats FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER sync_stats_to_blob AFTER UPDATE ON public.user_stats FOR EACH ROW EXECUTE FUNCTION sync_stats_to_blob();
CREATE TRIGGER on_user_created AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER sync_users_to_blob AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION sync_users_to_blob();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_created();  -- sur auth.users

-- ── 10. Sécurité au niveau des lignes (RLS) ────────────────────────────────

alter table public.admin_users enable row level security;
create policy "Admins read admin list" on public.admin_users for select to public
  using ((auth.uid() IN ( SELECT admin_users_1.user_id
   FROM admin_users admin_users_1)));

alter table public.auth_accounts enable row level security;
create policy "Users can insert own auth" on public.auth_accounts for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own auth" on public.auth_accounts for select to public
  using ((auth.uid() = user_id));

alter table public.badges enable row level security;
create policy "Badges are publicly readable" on public.badges for select to public
  using (true);

alter table public.balance_adjustments enable row level security;
create policy "Admins read adjustments" on public.balance_adjustments for select to public
  using ((auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users)));

alter table public.balance_ledger enable row level security;
create policy "Users read own ledger" on public.balance_ledger for select to public
  using ((auth.uid() = user_id));

alter table public.chat_messages enable row level security;
create policy "Chat messages are publicly readable" on public.chat_messages for select to public
  using (true);
create policy "Users insert own messages" on public.chat_messages for insert to public
  with check ((auth.uid() = user_id));

alter table public.chat_room_members enable row level security;
create policy "Users insert own memberships" on public.chat_room_members for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own memberships" on public.chat_room_members for select to public
  using ((auth.uid() = user_id));
create policy "Users update own memberships" on public.chat_room_members for update to public
  using ((auth.uid() = user_id));

alter table public.chat_rooms enable row level security;
create policy "Chat rooms are publicly readable" on public.chat_rooms for select to public
  using (true);

alter table public.clan_leaderboard_weekly enable row level security;
create policy "Clan leaderboard is publicly readable" on public.clan_leaderboard_weekly for select to public
  using (true);

alter table public.clan_members enable row level security;
create policy "Clan members are publicly readable" on public.clan_members for select to public
  using (true);
create policy "Users join clans" on public.clan_members for insert to public
  with check ((auth.uid() = user_id));
create policy "Users leave clans" on public.clan_members for delete to public
  using ((auth.uid() = user_id));

alter table public.clans enable row level security;
create policy "Clans are publicly readable" on public.clans for select to public
  using (true);
create policy "Founders update own clan" on public.clans for update to public
  using ((auth.uid() = founder_user_id));
create policy "Users create clans" on public.clans for insert to public
  with check ((auth.uid() = founder_user_id));

alter table public.combos enable row level security;
create policy "Users read own combos" on public.combos for select to public
  using ((auth.uid() = user_id));

alter table public.copy_copies enable row level security;
create policy "Users read own copies" on public.copy_copies for select to public
  using ((auth.uid() = copier_user_id));

alter table public.copy_following enable row level security;
create policy "Users delete own copy following" on public.copy_following for delete to public
  using ((auth.uid() = copy_follower_id));
create policy "Users insert own copy following" on public.copy_following for insert to public
  with check ((auth.uid() = copy_follower_id));
create policy "Users read own copy following" on public.copy_following for select to public
  using ((auth.uid() = copy_follower_id));
create policy "Users update own copy following" on public.copy_following for update to public
  using ((auth.uid() = copy_follower_id));

alter table public.crypto_prices enable row level security;
create policy "Crypto prices are publicly readable" on public.crypto_prices for select to public
  using (true);

alter table public.deposits enable row level security;
create policy "Users insert own deposits" on public.deposits for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own deposits" on public.deposits for select to public
  using ((auth.uid() = user_id));

alter table public.duels enable row level security;
create policy "Users read duels they participate in" on public.duels for select to public
  using (((auth.uid() = creator_id) OR (auth.uid() = opponent_id)));

alter table public.features enable row level security;
create policy "Features are publicly readable" on public.features for select to public
  using (true);

alter table public.flash_bets enable row level security;
create policy "Users insert own flash bets" on public.flash_bets for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own flash bets" on public.flash_bets for select to public
  using ((auth.uid() = user_id));

alter table public.flash_games enable row level security;
create policy "Flash games are publicly readable" on public.flash_games for select to public
  using (true);

alter table public.flash_rounds enable row level security;
create policy "Flash rounds are publicly readable" on public.flash_rounds for select to public
  using (true);

alter table public.friendships enable row level security;
create policy "Users delete own friendships" on public.friendships for delete to public
  using (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
create policy "Users insert own friendships" on public.friendships for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own friendships" on public.friendships for select to public
  using (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
create policy "Users update friendships involving them" on public.friendships for update to public
  using (((auth.uid() = user_id) OR (auth.uid() = friend_id)));

alter table public.market_bets enable row level security;
create policy "Market bets are publicly readable" on public.market_bets for select to public
  using (true);

alter table public.market_groups enable row level security;
create policy "Market groups are publicly readable" on public.market_groups for select to public
  using (true);

alter table public.market_live_state enable row level security;
create policy "Authenticated update market state" on public.market_live_state for insert to public
  with check ((auth.uid() IS NOT NULL));
create policy "Authenticated users update market state" on public.market_live_state for update to public
  using ((auth.uid() IS NOT NULL));
create policy "Market state is publicly readable" on public.market_live_state for select to public
  using (true);

alter table public.market_outcomes enable row level security;
create policy "Market outcomes are publicly readable" on public.market_outcomes for select to public
  using (true);

alter table public.market_price_history enable row level security;
create policy "Authenticated users can insert price history" on public.market_price_history for insert to public
  with check ((auth.uid() IS NOT NULL));
create policy "Market price history is publicly readable" on public.market_price_history for select to public
  using (true);

alter table public.market_proposals enable row level security;
create policy "Proposals are publicly readable" on public.market_proposals for select to public
  using (true);
create policy "Users create proposals" on public.market_proposals for insert to public
  with check ((auth.uid() = user_id));
create policy "Users update own proposals" on public.market_proposals for update to public
  using ((auth.uid() = user_id));

alter table public.markets enable row level security;
create policy "Markets are publicly readable" on public.markets for select to public
  using (true);

alter table public.missions enable row level security;
create policy "Users read own missions" on public.missions for select to public
  using ((auth.uid() = user_id));
create policy "Users update own missions" on public.missions for update to public
  using ((auth.uid() = user_id));

alter table public.newsletter_subscribers enable row level security;
-- (aucune policy : table inaccessible via l'API, sauf par les fonctions SECURITY DEFINER)

alter table public.notifications enable row level security;
create policy "Users delete own notifications" on public.notifications for delete to public
  using ((auth.uid() = user_id));
create policy "Users insert own notifications" on public.notifications for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own notifications" on public.notifications for select to public
  using ((auth.uid() = user_id));
create policy "Users update own notifications" on public.notifications for update to public
  using ((auth.uid() = user_id));

alter table public.orders enable row level security;
create policy "Users insert own orders" on public.orders for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own orders" on public.orders for select to public
  using ((auth.uid() = user_id));
create policy "Users update own orders" on public.orders for update to public
  using ((auth.uid() = user_id));

alter table public.position_history enable row level security;
create policy "Users insert own position history" on public.position_history for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own position history" on public.position_history for select to public
  using ((auth.uid() = user_id));

alter table public.positions enable row level security;
create policy "Users delete own positions" on public.positions for delete to public
  using ((auth.uid() = user_id));
create policy "Users insert own positions" on public.positions for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own positions" on public.positions for select to public
  using ((auth.uid() = user_id));
create policy "Users update own positions" on public.positions for update to public
  using ((auth.uid() = user_id));

alter table public.tier_conditions enable row level security;
create policy "Tier conditions are publicly readable" on public.tier_conditions for select to public
  using (true);

alter table public.tier_divisions enable row level security;
create policy "Tier divisions are publicly readable" on public.tier_divisions for select to public
  using (true);

alter table public.tier_ranks enable row level security;
create policy "Tier ranks are publicly readable" on public.tier_ranks for select to public
  using (true);

alter table public.user_badges enable row level security;
create policy "User badges are publicly readable" on public.user_badges for select to public
  using (true);
create policy "Users insert own badges" on public.user_badges for insert to public
  with check ((auth.uid() = user_id));

alter table public.user_following enable row level security;
create policy "Following is publicly readable" on public.user_following for select to public
  using (true);
create policy "Users manage own follows" on public.user_following for insert to public
  with check ((auth.uid() = follower_id));
create policy "Users unfollow" on public.user_following for delete to public
  using ((auth.uid() = follower_id));

alter table public.user_full_state enable row level security;
create policy "Users insert own state" on public.user_full_state for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own state" on public.user_full_state for select to public
  using ((auth.uid() = user_id));
create policy "Users update own state" on public.user_full_state for update to public
  using ((auth.uid() = user_id));

alter table public.user_preferences enable row level security;
create policy "Service can insert user preferences" on public.user_preferences for insert to public
  with check (true);
create policy "Users insert own preferences" on public.user_preferences for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own preferences" on public.user_preferences for select to public
  using ((auth.uid() = user_id));
create policy "Users update own preferences" on public.user_preferences for update to public
  using ((auth.uid() = user_id));

alter table public.user_stats enable row level security;
create policy "Service can insert user stats" on public.user_stats for insert to public
  with check (true);
create policy "User stats are publicly readable" on public.user_stats for select to public
  using (true);
create policy "Users can insert own stats" on public.user_stats for insert to public
  with check ((auth.uid() = user_id));
create policy "Users can update own stats" on public.user_stats for update to public
  using ((auth.uid() = user_id));

alter table public.user_watchlist enable row level security;
create policy "Users manage own watchlist" on public.user_watchlist for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own watchlist" on public.user_watchlist for select to public
  using ((auth.uid() = user_id));
create policy "Users remove from watchlist" on public.user_watchlist for delete to public
  using ((auth.uid() = user_id));

alter table public.users enable row level security;
create policy "Users can insert own profile" on public.users for insert to public
  with check ((auth.uid() = id));
create policy "Users can update own profile" on public.users for update to public
  using ((auth.uid() = id));
create policy "Users profiles are publicly readable" on public.users for select to public
  using (true);

alter table public.withdrawals enable row level security;
create policy "Users insert own withdrawals" on public.withdrawals for insert to public
  with check ((auth.uid() = user_id));
create policy "Users read own withdrawals" on public.withdrawals for select to public
  using ((auth.uid() = user_id));

-- ── 11. Droits (GRANT) ─────────────────────────────────────────────────────
-- Tables
grant delete, insert, maintain, references, select, trigger, truncate, update on public.admin_users to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.admin_users to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.admin_users to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.auth_accounts to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.auth_accounts to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.auth_accounts to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.badges to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.badges to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.badges to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.balance_adjustments to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.balance_adjustments to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.balance_adjustments to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.balance_ledger to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.balance_ledger to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.balance_ledger to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_messages to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_messages to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_messages to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_room_members to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_room_members to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_room_members to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_rooms to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_rooms to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.chat_rooms to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clan_leaderboard_weekly to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clan_leaderboard_weekly to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clan_leaderboard_weekly to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clan_members to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clan_members to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clan_members to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clans to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clans to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.clans to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.combos to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.combos to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.combos to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.copy_copies to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.copy_copies to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.copy_copies to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.copy_following to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.copy_following to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.copy_following to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.crypto_prices to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.crypto_prices to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.crypto_prices to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.deposits to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.deposits to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.deposits to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.duels to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.duels to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.duels to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.features to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.features to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.features to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_bets to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_bets to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_bets to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_games to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_games to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_games to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_rounds to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_rounds to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.flash_rounds to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.friendships to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.friendships to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.friendships to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_bets to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_bets to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_bets to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_groups to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_groups to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_groups to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_live_state to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_live_state to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_live_state to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_outcomes to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_outcomes to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_outcomes to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_price_history to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_price_history to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_price_history to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_proposals to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_proposals to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.market_proposals to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.markets to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.markets to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.markets to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.missions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.missions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.missions to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.newsletter_subscribers to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.newsletter_subscribers to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.newsletter_subscribers to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.notifications to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.notifications to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.notifications to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.orders to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.orders to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.orders to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.position_history to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.position_history to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.position_history to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.positions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.positions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.positions to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_conditions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_conditions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_conditions to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_divisions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_divisions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_divisions to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_ranks to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_ranks to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.tier_ranks to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_badges to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_badges to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_badges to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_following to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_following to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_following to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_full_state to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_full_state to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_full_state to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_preferences to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_preferences to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_preferences to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_stats to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_stats to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_stats to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_watchlist to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_watchlist to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.user_watchlist to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.users to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.users to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.users to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.withdrawals to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.withdrawals to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.withdrawals to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.admin_players_view to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.admin_players_view to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.admin_players_view to service_role;

-- Fonctions (qui a le droit de les exécuter)
revoke all on function public._post_bet_hook(uuid) from public, anon, authenticated;
grant execute on function public._post_bet_hook(uuid) to anon, authenticated, service_role, public;
revoke all on function public.accept_duel(uuid) from public, anon, authenticated;
grant execute on function public.accept_duel(uuid) to anon, authenticated, service_role, public;
revoke all on function public.accept_friend_request(uuid) from public, anon, authenticated;
grant execute on function public.accept_friend_request(uuid) to anon, authenticated, service_role, public;
revoke all on function public.admin_adjust_balance(text,numeric,text) from public, anon, authenticated;
grant execute on function public.admin_adjust_balance(text,numeric,text) to anon, authenticated, service_role, public;
revoke all on function public.admin_balance_history(text,integer) from public, anon, authenticated;
grant execute on function public.admin_balance_history(text,integer) to anon, authenticated, service_role, public;
revoke all on function public.admin_ban_user(text,boolean) from public, anon, authenticated;
grant execute on function public.admin_ban_user(text,boolean) to anon, authenticated, service_role, public;
revoke all on function public.admin_get_player(text) from public, anon, authenticated;
grant execute on function public.admin_get_player(text) to anon, authenticated, service_role, public;
revoke all on function public.admin_set_balance(text,numeric,text) from public, anon, authenticated;
grant execute on function public.admin_set_balance(text,numeric,text) to anon, authenticated, service_role, public;
revoke all on function public.admin_set_player(text,numeric,integer,integer,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_set_player(text,numeric,integer,integer,integer,integer,integer,integer) to anon, authenticated, service_role, public;
revoke all on function public.admin_set_rank(text,text,integer) from public, anon, authenticated;
grant execute on function public.admin_set_rank(text,text,integer) to anon, authenticated, service_role, public;
revoke all on function public.admin_top_players(integer) from public, anon, authenticated;
grant execute on function public.admin_top_players(integer) to anon, authenticated, service_role, public;
revoke all on function public.book_depth(numeric,numeric) from public, anon, authenticated;
grant execute on function public.book_depth(numeric,numeric) to anon, authenticated, service_role, public;
revoke all on function public.bot_chat_activity() from public, anon, authenticated;
grant execute on function public.bot_chat_activity() to anon, authenticated, service_role, public;
revoke all on function public.bot_flash_activity() from public, anon, authenticated;
grant execute on function public.bot_flash_activity() to anon, authenticated, service_role, public;
revoke all on function public.bot_market_make() from public, anon, authenticated;
grant execute on function public.bot_market_make() to anon, authenticated, service_role, public;
revoke all on function public.bot_social_activity() from public, anon, authenticated;
grant execute on function public.bot_social_activity() to anon, authenticated, service_role, public;
revoke all on function public.bot_tick() from public, anon, authenticated;
grant execute on function public.bot_tick() to anon, authenticated, service_role, public;
revoke all on function public.check_badges() from public, anon, authenticated;
grant execute on function public.check_badges() to anon, authenticated, service_role, public;
revoke all on function public.claim_mission(uuid) from public, anon, authenticated;
grant execute on function public.claim_mission(uuid) to anon, authenticated, service_role, public;
revoke all on function public.clear_notifications() from public, anon, authenticated;
grant execute on function public.clear_notifications() to anon, authenticated, service_role, public;
revoke all on function public.create_clan(text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_clan(text,text,text,text) to anon, authenticated, service_role, public;
revoke all on function public.create_duel(text,text,numeric) from public, anon, authenticated;
grant execute on function public.create_duel(text,text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.create_notification(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.create_notification(uuid,text,text,text) to anon, authenticated, service_role, public;
revoke all on function public.decline_friend_request(uuid) from public, anon, authenticated;
grant execute on function public.decline_friend_request(uuid) to anon, authenticated, service_role, public;
revoke all on function public.delete_notification(uuid) from public, anon, authenticated;
grant execute on function public.delete_notification(uuid) to anon, authenticated, service_role, public;
revoke all on function public.demo_deposit(text,text,numeric) from public, anon, authenticated;
grant execute on function public.demo_deposit(text,text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.demo_withdrawal(text,text,numeric) from public, anon, authenticated;
grant execute on function public.demo_withdrawal(text,text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.eng_constants() from public, anon, authenticated;
grant execute on function public.eng_constants() to anon, authenticated, service_role, public;
revoke all on function public.flash_bet(text,text,numeric) from public, anon, authenticated;
grant execute on function public.flash_bet(text,text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.flash_settle_round(uuid) from public, anon, authenticated;
grant execute on function public.flash_settle_round(uuid) to anon, authenticated, service_role, public;
revoke all on function public.flash_tick_server() from public, anon, authenticated;
grant execute on function public.flash_tick_server() to anon, authenticated, service_role, public;
revoke all on function public.get_chat_history(text,integer) from public, anon, authenticated;
grant execute on function public.get_chat_history(text,integer) to anon, authenticated, service_role, public;
revoke all on function public.get_clan_members(uuid) from public, anon, authenticated;
grant execute on function public.get_clan_members(uuid) to anon, authenticated, service_role, public;
revoke all on function public.get_clans() from public, anon, authenticated;
grant execute on function public.get_clans() to anon, authenticated, service_role, public;
revoke all on function public.get_friends() from public, anon, authenticated;
grant execute on function public.get_friends() to anon, authenticated, service_role, public;
revoke all on function public.get_leaderboard(text,integer) from public, anon, authenticated;
grant execute on function public.get_leaderboard(text,integer) to anon, authenticated, service_role, public;
revoke all on function public.get_markets() from public, anon, authenticated;
grant execute on function public.get_markets() to anon, authenticated, service_role, public;
revoke all on function public.get_my_badges() from public, anon, authenticated;
grant execute on function public.get_my_badges() to anon, authenticated, service_role, public;
revoke all on function public.get_my_balance() from public, anon, authenticated;
grant execute on function public.get_my_balance() to anon, authenticated, service_role, public;
revoke all on function public.get_my_clan() from public, anon, authenticated;
grant execute on function public.get_my_clan() to anon, authenticated, service_role, public;
revoke all on function public.get_my_copies() from public, anon, authenticated;
grant execute on function public.get_my_copies() to anon, authenticated, service_role, public;
revoke all on function public.get_my_deposits() from public, anon, authenticated;
grant execute on function public.get_my_deposits() to anon, authenticated, service_role, public;
revoke all on function public.get_my_friends() from public, anon, authenticated;
grant execute on function public.get_my_friends() to anon, authenticated, service_role, public;
revoke all on function public.get_my_history(integer,integer) from public, anon, authenticated;
grant execute on function public.get_my_history(integer,integer) to anon, authenticated, service_role, public;
revoke all on function public.get_my_notifications(integer) from public, anon, authenticated;
grant execute on function public.get_my_notifications(integer) to anon, authenticated, service_role, public;
revoke all on function public.get_my_positions() from public, anon, authenticated;
grant execute on function public.get_my_positions() to anon, authenticated, service_role, public;
revoke all on function public.get_my_withdrawals() from public, anon, authenticated;
grant execute on function public.get_my_withdrawals() to anon, authenticated, service_role, public;
revoke all on function public.grant_xp(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.grant_xp(uuid,integer,text) to anon, authenticated, service_role, public;
revoke all on function public.handle_auth_user_created() from public, anon, authenticated;
grant execute on function public.handle_auth_user_created() to anon, authenticated, service_role, public;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to anon, authenticated, service_role, public;
revoke all on function public.handle_updated_at() from public, anon, authenticated;
grant execute on function public.handle_updated_at() to anon, authenticated, service_role, public;
revoke all on function public.init_daily_missions() from public, anon, authenticated;
grant execute on function public.init_daily_missions() to anon, authenticated, service_role, public;
revoke all on function public.join_clan(uuid) from public, anon, authenticated;
grant execute on function public.join_clan(uuid) to anon, authenticated, service_role, public;
revoke all on function public.leave_clan() from public, anon, authenticated;
grant execute on function public.leave_clan() to anon, authenticated, service_role, public;
revoke all on function public.mark_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_notifications_read() to anon, authenticated, service_role, public;
revoke all on function public.newsletter_subscribe(text) from public, anon, authenticated;
grant execute on function public.newsletter_subscribe(text) to anon, authenticated, service_role, public;
revoke all on function public.newsletter_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.newsletter_unsubscribe(text) to anon, authenticated, service_role, public;
revoke all on function public.place_bet(text,text,numeric) from public, anon, authenticated;
grant execute on function public.place_bet(text,text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.progress_mission(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.progress_mission(uuid,text,integer) to anon, authenticated, service_role, public;
revoke all on function public.react_to_message(bigint,text) from public, anon, authenticated;
grant execute on function public.react_to_message(bigint,text) to anon, authenticated, service_role, public;
revoke all on function public.remove_friend(text) from public, anon, authenticated;
grant execute on function public.remove_friend(text) to anon, authenticated, service_role, public;
revoke all on function public.search_users(text,integer) from public, anon, authenticated;
grant execute on function public.search_users(text,integer) to anon, authenticated, service_role, public;
revoke all on function public.sell_position(text,text,numeric) from public, anon, authenticated;
grant execute on function public.sell_position(text,text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.send_chat_message(text,text,text) from public, anon, authenticated;
grant execute on function public.send_chat_message(text,text,text) to anon, authenticated, service_role, public;
revoke all on function public.send_friend_request(text) from public, anon, authenticated;
grant execute on function public.send_friend_request(text) to anon, authenticated, service_role, public;
revoke all on function public.settle_market(text,text) from public, anon, authenticated;
grant execute on function public.settle_market(text,text) to anon, authenticated, service_role, public;
revoke all on function public.start_copy(text,numeric) from public, anon, authenticated;
grant execute on function public.start_copy(text,numeric) to anon, authenticated, service_role, public;
revoke all on function public.stop_copy(text) from public, anon, authenticated;
grant execute on function public.stop_copy(text) to anon, authenticated, service_role, public;
revoke all on function public.sync_stats_to_blob() from public, anon, authenticated;
grant execute on function public.sync_stats_to_blob() to anon, authenticated, service_role, public;
revoke all on function public.sync_users_to_blob() from public, anon, authenticated;
grant execute on function public.sync_users_to_blob() to anon, authenticated, service_role, public;
revoke all on function public.wm_fee_rate(text) from public, anon, authenticated;
grant execute on function public.wm_fee_rate(text) to anon, authenticated, service_role, public;

-- ── 12. Temps réel (publications) ──────────────────────────────────────────
-- publication supabase_realtime : 6 table(s) (insert=true, update=true, delete=true)
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.flash_rounds;
alter publication supabase_realtime add table public.market_live_state;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.user_stats;
alter publication supabase_realtime add table public.users;
-- publication supabase_realtime_messages_publication : 6 table(s) (insert=true, update=true, delete=true)

-- ── 13. Tâches planifiées (pg_cron) ────────────────────────────────────────
-- tâche n°1 — 1889 exécutions, 82 en échec, durée moyenne 0.158s, max 1.379s
select cron.schedule('bot-tick', '* * * * *', $cron$SELECT public.bot_tick()$cron$);
-- tâche n°2 — 377 exécutions, 24 en échec, durée moyenne 0.425s, max 1.287s
select cron.schedule('bot-burst', '*/5 * * * *', $cron$
  SELECT public.bot_market_make();
  SELECT public.bot_market_make();
  SELECT public.bot_market_make();
  SELECT public.bot_chat_activity();
  SELECT public.bot_chat_activity();
$cron$);
-- tâche n°3 — 378 exécutions, 0 en échec, durée moyenne 0.143s, max 1.666s
select cron.schedule('flash-tick-server', '* * * * *', $cron$SELECT public.flash_tick_server()$cron$);

-- ── 14. Stockage de fichiers ───────────────────────────────────────────────
-- (aucun bucket)
