-- Migration d'origine 20261113000000_initial_schema — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- WIMORO - Complete Database Schema for Supabase
-- ============================================================

-- ============================================================
-- 1. CORE USER TABLES
-- ============================================================

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (char_length(username) BETWEEN 3 AND 20),
  email text NOT NULL UNIQUE,
  password_hash text,
  avatar_photo text DEFAULT '',
  avatar_color text DEFAULT '#2448FF',
  bio text DEFAULT '',
  wallet_address text,
  kyc_verified boolean DEFAULT false,
  kyc_document_status text DEFAULT 'pending' CHECK (kyc_document_status IN ('pending','approved','rejected')),
  profile_photo_imported text,
  onboarded boolean DEFAULT false,
  welcomed boolean DEFAULT false,
  is_demo boolean DEFAULT false,
  language_preference text DEFAULT 'fr' CHECK (language_preference IN ('en','fr','he')),
  theme_preference text DEFAULT 'auto' CHECK (theme_preference IN ('light','dark','auto')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance numeric(15,2) DEFAULT 1000000,
  credit_demo numeric(15,2) DEFAULT 0,
  xp integer DEFAULT 0,
  followers_count integer DEFAULT 0,
  following_count integer DEFAULT 0,
  rank_tier integer DEFAULT 0 CHECK (rank_tier BETWEEN 0 AND 8),
  rank_division integer DEFAULT 0 CHECK (rank_division BETWEEN 0 AND 2),
  seasonal_position integer,
  profit_total numeric(15,2) DEFAULT 0,
  profit_realized numeric(15,2) DEFAULT 0,
  streak_current integer DEFAULT 1,
  streak_best integer DEFAULT 1,
  streak_last_date date,
  bets_placed integer DEFAULT 0,
  bets_won integer DEFAULT 0,
  bets_settled integer DEFAULT 0,
  bets_accuracy_pct integer DEFAULT 50 CHECK (bets_accuracy_pct BETWEEN 0 AND 100),
  bets_max_amount numeric(15,2) DEFAULT 0,
  followed_bets_count integer DEFAULT 0,
  contra_wins integer DEFAULT 0,
  deposits_count integer DEFAULT 0,
  deposits_last_date date,
  flash_wins integer DEFAULT 0,
  flash_streak_current integer DEFAULT 0,
  flash_streak_best integer DEFAULT 0,
  flash_profit_total numeric(15,2) DEFAULT 0,
  messages_total integer DEFAULT 0,
  chat_xp_today integer DEFAULT 0,
  chat_last_date date,
  clan_created_id uuid,
  clan_joined_id uuid,
  clan_week_champion integer DEFAULT 0,
  copies_count integer DEFAULT 0,
  copiers_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  chart_type text DEFAULT 'courbe',
  flash_mode text DEFAULT 'free' CHECK (flash_mode IN ('free','rot')),
  flash_category text DEFAULT 'Tout',
  flash_alerts jsonb DEFAULT '[]'::jsonb,
  false_alarm_alerts jsonb DEFAULT '[]'::jsonb,
  default_deposit_coin text,
  default_deposit_network text,
  default_withdraw_network text,
  fiat_deposit_amount text,
  fiat_withdraw_amount text,
  copy_trading_enabled boolean DEFAULT false,
  copy_trading_min_accuracy integer,
  market_sort text DEFAULT 'actifs',
  time_filter text DEFAULT '1 j',
  home_chat_room text DEFAULT 'general',
  market_interest_categories jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text,
  auth_type text NOT NULL DEFAULT 'email' CHECK (auth_type IN ('email','wallet')),
  is_verified boolean DEFAULT false,
  verification_token text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. MARKET TABLES
-- ============================================================

CREATE TABLE public.market_groups (
  id text PRIMARY KEY,
  category text NOT NULL,
  question text NOT NULL,
  short_question text,
  creator_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  close_date date,
  close_time time,
  close_label text,
  close_long_label text,
  days_until_close integer,
  resolution_rules text,
  status text DEFAULT 'open' CHECK (status IN ('open','closed','resolved')),
  resolution_outcome text,
  participants_count integer DEFAULT 0,
  messages_count integer DEFAULT 0,
  volume_total numeric(15,2) DEFAULT 0,
  heat_level numeric(4,1) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.markets (
  id text PRIMARY KEY,
  category text NOT NULL,
  question text NOT NULL,
  short_question text,
  creator_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  current_probability numeric(5,2) DEFAULT 50,
  initial_probability numeric(5,2) DEFAULT 50,
  volume_total numeric(15,2) DEFAULT 0,
  volume_24h numeric(15,2) DEFAULT 0,
  participants_count integer DEFAULT 0,
  messages_count integer DEFAULT 0,
  heat_level numeric(4,1) DEFAULT 0,
  hot_until timestamptz,
  close_date date,
  close_time time,
  close_label text,
  close_long_label text,
  days_until_close integer,
  resolved_at timestamptz,
  resolution_source text,
  resolution_rules text,
  status text DEFAULT 'open' CHECK (status IN ('open','closing_soon','closed','resolved')),
  resolution_outcome text CHECK (resolution_outcome IN ('yes','no','ambiguous','voided') OR resolution_outcome IS NULL),
  anchor_probability numeric(5,2) DEFAULT 50,
  liquidity_depth numeric(15,2) DEFAULT 0,
  online_users_count integer DEFAULT 0,
  people_count integer DEFAULT 0,
  group_parent_id text REFERENCES public.market_groups(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.market_outcomes (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES public.market_groups(id) ON DELETE CASCADE,
  market_id text NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  label text NOT NULL,
  question text,
  current_probability numeric(5,2) DEFAULT 0,
  initial_probability numeric(5,2) DEFAULT 0,
  volume numeric(15,2) DEFAULT 0,
  participants_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.market_bets (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market_id text NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  side integer NOT NULL CHECK (side IN (0, 1)),
  amount_pct numeric(4,3) DEFAULT 0,
  user_is_me integer DEFAULT 0 CHECK (user_is_me IN (0, 1)),
  timestamp timestamptz DEFAULT now()
);

CREATE TABLE public.market_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id text NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  price numeric(5,2) NOT NULL,
  timestamp timestamptz DEFAULT now(),
  sequence integer NOT NULL
);

-- ============================================================
-- 3. POSITIONS & ORDERS
-- ============================================================

CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id text NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('oui','non','be')),
  shares numeric(12,2) NOT NULL,
  average_price numeric(12,4) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, market_id, side)
);

CREATE TABLE public.position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('res','sell','flash','be')),
  market_id text REFERENCES public.markets(id) ON DELETE SET NULL,
  question text,
  side text NOT NULL CHECK (side IN ('oui','non','be','haut','bas')),
  was_winner boolean,
  pnl numeric(15,2) NOT NULL,
  settled_at timestamptz DEFAULT now()
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id text NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  order_type text NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit','market')),
  side text NOT NULL CHECK (side IN ('oui','non')),
  quantity numeric(12,2) NOT NULL,
  limit_price numeric(12,4),
  status text DEFAULT 'open' CHECK (status IN ('open','partial','filled','cancelled')),
  filled_quantity numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. FLASH GAMES
-- ============================================================

CREATE TABLE public.flash_games (
  id text PRIMARY KEY,
  code text NOT NULL,
  category text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dir','vol','event')),
  name text NOT NULL,
  tab_label text,
  question text NOT NULL,
  answer_a text NOT NULL,
  answer_b text NOT NULL,
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
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.flash_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.flash_games(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  round_start_time timestamptz NOT NULL,
  round_duration_ms integer DEFAULT 45000,
  open_duration_ms integer DEFAULT 30000,
  current_tick integer DEFAULT 0,
  current_price numeric(15,4),
  break_even_odds numeric(5,2),
  pool_yes numeric(15,2) DEFAULT 0,
  pool_no numeric(15,2) DEFAULT 0,
  pool_breakeven numeric(15,2) DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open','settled','archived')),
  result_side text CHECK (result_side IN ('a','b','be') OR result_side IS NULL),
  price_path jsonb DEFAULT '[]'::jsonb,
  activity_level integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.flash_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.flash_rounds(id) ON DELETE CASCADE,
  game_id text NOT NULL REFERENCES public.flash_games(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('a','b','be')),
  amount_wager numeric(15,2) NOT NULL,
  profit_loss numeric(15,2),
  result text CHECK (result IN ('win','lose','push') OR result IS NULL),
  created_at timestamptz DEFAULT now(),
  settled_at timestamptz
);

-- ============================================================
-- 5. CHAT & MESSAGING
-- ============================================================

CREATE TABLE public.chat_rooms (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('global','vip','market','dm','clan')),
  market_id text REFERENCES public.markets(id) ON DELETE SET NULL,
  clan_id uuid,
  private_user_ids uuid[],
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id text NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_type text DEFAULT 'msg' CHECK (message_type IN ('msg','bet','ana','evt')),
  text_content text,
  bet_ref jsonb,
  reactions jsonb DEFAULT '{}'::jsonb,
  my_reactions text[] DEFAULT '{}',
  followers_count integer DEFAULT 0,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.chat_room_members (
  room_id text NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  unread_count integer DEFAULT 0,
  last_read_at timestamptz,
  PRIMARY KEY (room_id, user_id)
);

-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  icon text NOT NULL,
  text text NOT NULL,
  href text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 7. RANKING & PROGRESSION
-- ============================================================

CREATE TABLE public.tier_ranks (
  id integer PRIMARY KEY,
  name text NOT NULL UNIQUE,
  gradient_color_light text,
  gradient_color_dark text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tier_conditions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tier_id integer NOT NULL REFERENCES public.tier_ranks(id) ON DELETE CASCADE,
  condition_key text NOT NULL,
  condition_value integer NOT NULL
);

CREATE TABLE public.tier_divisions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tier_id integer NOT NULL REFERENCES public.tier_ranks(id) ON DELETE CASCADE,
  division integer NOT NULL CHECK (division BETWEEN 0 AND 2),
  xp_required integer NOT NULL,
  UNIQUE(tier_id, division)
);

CREATE TABLE public.badges (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL,
  condition_query text,
  description text
);

CREATE TABLE public.user_badges (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_type text NOT NULL CHECK (mission_type IN ('bet','flashbet','chat','chatm','flashwin','dep')),
  label text NOT NULL,
  goal_value integer NOT NULL,
  current_progress integer DEFAULT 0,
  xp_reward integer NOT NULL,
  is_claimed boolean DEFAULT false,
  action_href text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- ============================================================
-- 8. CLANS
-- ============================================================

CREATE TABLE public.clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  founder_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description text DEFAULT '',
  emblem_color text DEFAULT '#2448FF',
  emblem_icon text DEFAULT 'shield',
  member_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.clan_members (
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  role text DEFAULT 'member' CHECK (role IN ('founder','member')),
  PRIMARY KEY (clan_id, user_id)
);

CREATE TABLE public.clan_leaderboard_weekly (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  profit_weekly numeric(15,2) DEFAULT 0,
  position_in_clan integer,
  UNIQUE(clan_id, user_id, week_start_date)
);

-- Add FK references from user_stats to clans now that clans table exists
ALTER TABLE public.user_stats
  ADD CONSTRAINT fk_user_stats_clan_created FOREIGN KEY (clan_created_id) REFERENCES public.clans(id) ON DELETE SET NULL;

ALTER TABLE public.user_stats
  ADD CONSTRAINT fk_user_stats_clan_joined FOREIGN KEY (clan_joined_id) REFERENCES public.clans(id) ON DELETE SET NULL;

-- Add FK reference from chat_rooms to clans
ALTER TABLE public.chat_rooms
  ADD CONSTRAINT fk_chat_rooms_clan FOREIGN KEY (clan_id) REFERENCES public.clans(id) ON DELETE SET NULL;

-- ============================================================
-- 9. COPY TRADING
-- ============================================================

CREATE TABLE public.copy_following (
  copy_follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  copy_target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  min_accuracy integer,
  max_bet_multiplier numeric(4,2) DEFAULT 1.00,
  started_at timestamptz DEFAULT now(),
  PRIMARY KEY (copy_follower_id, copy_target_user_id)
);

CREATE TABLE public.copy_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copier_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  copied_from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  original_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 10. FINANCE
-- ============================================================

CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coin text NOT NULL,
  network text NOT NULL,
  coin_amount numeric(18,8) NOT NULL,
  usd_equivalent numeric(15,2),
  confirmations_received integer DEFAULT 0,
  confirmations_required integer DEFAULT 1,
  label text,
  tx_hash text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network text NOT NULL,
  destination_address text NOT NULL,
  amount_usd numeric(15,2) NOT NULL,
  coin text,
  coin_amount numeric(18,8),
  status text DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  requested_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.crypto_prices (
  coin text PRIMARY KEY,
  price_usd numeric(15,4) NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 11. FEATURE GATES
-- ============================================================

CREATE TABLE public.features (
  id text PRIMARY KEY,
  feature_name text NOT NULL,
  required_tier integer DEFAULT 0 REFERENCES public.tier_ranks(id),
  icon text,
  description text,
  link_href text
);

-- ============================================================
-- WIMORO - Indexes
-- ============================================================

-- Users
CREATE INDEX idx_users_username ON public.users(username);

CREATE INDEX idx_users_email ON public.users(email);

-- User Stats
CREATE INDEX idx_user_stats_rank ON public.user_stats(rank_tier, rank_division);

CREATE INDEX idx_user_stats_xp ON public.user_stats(xp DESC);

CREATE INDEX idx_user_stats_profit ON public.user_stats(profit_total DESC);

CREATE INDEX idx_user_stats_seasonal ON public.user_stats(seasonal_position);

-- Auth
CREATE INDEX idx_auth_accounts_user ON public.auth_accounts(user_id);

CREATE INDEX idx_auth_accounts_email ON public.auth_accounts(email);

-- Markets
CREATE INDEX idx_markets_category ON public.markets(category);

CREATE INDEX idx_markets_status ON public.markets(status);

CREATE INDEX idx_markets_group ON public.markets(group_parent_id);

CREATE INDEX idx_markets_heat ON public.markets(heat_level DESC);

CREATE INDEX idx_markets_close_date ON public.markets(close_date);

-- Market Groups
CREATE INDEX idx_market_groups_status ON public.market_groups(status);

CREATE INDEX idx_market_groups_category ON public.market_groups(category);

-- Market Outcomes
CREATE INDEX idx_market_outcomes_group ON public.market_outcomes(group_id);

CREATE INDEX idx_market_outcomes_market ON public.market_outcomes(market_id);

-- Market Bets
CREATE INDEX idx_market_bets_market ON public.market_bets(market_id);

CREATE INDEX idx_market_bets_timestamp ON public.market_bets(timestamp DESC);

-- Market Price History
CREATE INDEX idx_market_price_history_market ON public.market_price_history(market_id, sequence);

CREATE INDEX idx_market_price_history_timestamp ON public.market_price_history(market_id, timestamp DESC);

-- Positions
CREATE INDEX idx_positions_user ON public.positions(user_id);

CREATE INDEX idx_positions_market ON public.positions(market_id);

CREATE INDEX idx_positions_user_market ON public.positions(user_id, market_id);

-- Position History
CREATE INDEX idx_position_history_user ON public.position_history(user_id);

CREATE INDEX idx_position_history_settled ON public.position_history(settled_at DESC);

-- Orders
CREATE INDEX idx_orders_user ON public.orders(user_id);

CREATE INDEX idx_orders_market ON public.orders(market_id);

CREATE INDEX idx_orders_status ON public.orders(status);

-- Flash
CREATE INDEX idx_flash_rounds_game ON public.flash_rounds(game_id);

CREATE INDEX idx_flash_rounds_status ON public.flash_rounds(game_id, status);

CREATE INDEX idx_flash_bets_user ON public.flash_bets(user_id);

CREATE INDEX idx_flash_bets_round ON public.flash_bets(round_id);

-- Chat
CREATE INDEX idx_chat_messages_room ON public.chat_messages(room_id, created_at DESC);

CREATE INDEX idx_chat_messages_user ON public.chat_messages(user_id);

CREATE INDEX idx_chat_room_members_user ON public.chat_room_members(user_id);

-- Notifications
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- Missions
CREATE INDEX idx_missions_user ON public.missions(user_id);

CREATE INDEX idx_missions_expires ON public.missions(expires_at);

-- Clans
CREATE INDEX idx_clan_members_user ON public.clan_members(user_id);

CREATE INDEX idx_clan_leaderboard_week ON public.clan_leaderboard_weekly(week_start_date, clan_id);

-- Copy Trading
CREATE INDEX idx_copy_following_target ON public.copy_following(copy_target_user_id);

CREATE INDEX idx_copy_copies_copier ON public.copy_copies(copier_user_id);

CREATE INDEX idx_copy_copies_from ON public.copy_copies(copied_from_user_id);

-- Deposits & Withdrawals
CREATE INDEX idx_deposits_user ON public.deposits(user_id);

CREATE INDEX idx_deposits_status ON public.deposits(status);

CREATE INDEX idx_withdrawals_user ON public.withdrawals(user_id);

CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);

-- ============================================================
-- WIMORO - Triggers (auto-update updated_at)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.markets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.flash_rounds
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- Auto-create user_stats and user_preferences on user creation
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id);
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_created AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- WIMORO - Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_outcomes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_bets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_price_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flash_games ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flash_rounds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flash_bets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tier_ranks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tier_conditions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tier_divisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clan_leaderboard_weekly ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.copy_following ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.copy_copies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crypto_prices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PUBLIC READ tables (anyone can read)
-- ============================================================

-- Markets
CREATE POLICY "Markets are publicly readable" ON public.markets FOR SELECT USING (true);

CREATE POLICY "Market groups are publicly readable" ON public.market_groups FOR SELECT USING (true);

CREATE POLICY "Market outcomes are publicly readable" ON public.market_outcomes FOR SELECT USING (true);

CREATE POLICY "Market bets are publicly readable" ON public.market_bets FOR SELECT USING (true);

CREATE POLICY "Market price history is publicly readable" ON public.market_price_history FOR SELECT USING (true);

-- Flash games config
CREATE POLICY "Flash games are publicly readable" ON public.flash_games FOR SELECT USING (true);

CREATE POLICY "Flash rounds are publicly readable" ON public.flash_rounds FOR SELECT USING (true);

-- Ranking config
CREATE POLICY "Tier ranks are publicly readable" ON public.tier_ranks FOR SELECT USING (true);

CREATE POLICY "Tier conditions are publicly readable" ON public.tier_conditions FOR SELECT USING (true);

CREATE POLICY "Tier divisions are publicly readable" ON public.tier_divisions FOR SELECT USING (true);

CREATE POLICY "Badges are publicly readable" ON public.badges FOR SELECT USING (true);

-- Features config
CREATE POLICY "Features are publicly readable" ON public.features FOR SELECT USING (true);

-- Crypto prices
CREATE POLICY "Crypto prices are publicly readable" ON public.crypto_prices FOR SELECT USING (true);

-- Clans (publicly browsable)
CREATE POLICY "Clans are publicly readable" ON public.clans FOR SELECT USING (true);

CREATE POLICY "Clan members are publicly readable" ON public.clan_members FOR SELECT USING (true);

CREATE POLICY "Clan leaderboard is publicly readable" ON public.clan_leaderboard_weekly FOR SELECT USING (true);

-- Chat rooms (publicly browsable, DMs filtered by app logic)
CREATE POLICY "Chat rooms are publicly readable" ON public.chat_rooms FOR SELECT USING (true);

CREATE POLICY "Chat messages are publicly readable" ON public.chat_messages FOR SELECT USING (true);

-- ============================================================
-- USER PROFILES (public read, own write)
-- ============================================================

CREATE POLICY "Users profiles are publicly readable" ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "User stats are publicly readable" ON public.user_stats FOR SELECT USING (true);

CREATE POLICY "Users can update own stats" ON public.user_stats FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats" ON public.user_stats FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User badges are publicly readable" ON public.user_badges FOR SELECT USING (true);

-- ============================================================
-- PRIVATE USER DATA (own data only)
-- ============================================================

-- Preferences
CREATE POLICY "Users read own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auth accounts
CREATE POLICY "Users read own auth" ON public.auth_accounts FOR SELECT USING (auth.uid() = user_id);

-- Positions
CREATE POLICY "Users read own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own positions" ON public.positions FOR DELETE USING (auth.uid() = user_id);

-- Position History
CREATE POLICY "Users read own position history" ON public.position_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own position history" ON public.position_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Orders
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own orders" ON public.orders FOR UPDATE USING (auth.uid() = user_id);

-- Flash bets
CREATE POLICY "Users read own flash bets" ON public.flash_bets FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own flash bets" ON public.flash_bets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Missions
CREATE POLICY "Users read own missions" ON public.missions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own missions" ON public.missions FOR UPDATE USING (auth.uid() = user_id);

-- Chat room members
CREATE POLICY "Users read own memberships" ON public.chat_room_members FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own memberships" ON public.chat_room_members FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users insert own memberships" ON public.chat_room_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Chat messages (users can insert their own)
CREATE POLICY "Users insert own messages" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Copy trading
CREATE POLICY "Users read own copy following" ON public.copy_following FOR SELECT USING (auth.uid() = copy_follower_id);

CREATE POLICY "Users insert own copy following" ON public.copy_following FOR INSERT WITH CHECK (auth.uid() = copy_follower_id);

CREATE POLICY "Users update own copy following" ON public.copy_following FOR UPDATE USING (auth.uid() = copy_follower_id);

CREATE POLICY "Users delete own copy following" ON public.copy_following FOR DELETE USING (auth.uid() = copy_follower_id);

CREATE POLICY "Users read own copies" ON public.copy_copies FOR SELECT USING (auth.uid() = copier_user_id);

-- Deposits & Withdrawals
CREATE POLICY "Users read own deposits" ON public.deposits FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own deposits" ON public.deposits FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own withdrawals" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own withdrawals" ON public.withdrawals FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Clans (members can manage)
CREATE POLICY "Users create clans" ON public.clans FOR INSERT WITH CHECK (auth.uid() = founder_user_id);

CREATE POLICY "Founders update own clan" ON public.clans FOR UPDATE USING (auth.uid() = founder_user_id);

CREATE POLICY "Users join clans" ON public.clan_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users leave clans" ON public.clan_members FOR DELETE USING (auth.uid() = user_id);

-- User badges (system inserts, user reads)
CREATE POLICY "Users insert own badges" ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- WIMORO - Reference / Seed Data
-- ============================================================

-- ============================================================
-- TIER RANKS
-- ============================================================

INSERT INTO public.tier_ranks (id, name, gradient_color_light, gradient_color_dark) VALUES
  (0, 'Fer',       '#A4AAB2', '#5B6068'),
  (1, 'Bronze',    '#DDA171', '#8A5530'),
  (2, 'Argent',    '#D3D9E1', '#7E8896'),
  (3, 'Or',        '#F7D774', '#C08A12'),
  (4, 'Platine',   '#7EE0D6', '#1A8584'),
  (5, 'Diamant',   '#CDB9FF', '#7350E3'),
  (6, 'Ascendant', '#82E6AC', '#13804F'),
  (7, 'Immortel',  '#FF96A9', '#AE2139'),
  (8, 'Radiant',   '#FFE27A', '#E59A00');

-- ============================================================
-- TIER CONDITIONS
-- ============================================================

-- Tier 0 (Fer): no conditions
-- Tier 1 (Bronze)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (1, 'settled', 3);

-- Tier 2 (Argent)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (2, 'settled', 10),
  (2, 'deposits', 1);

-- Tier 3 (Or)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (3, 'settled', 25),
  (3, 'acc', 50);

-- Tier 4 (Platine)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (4, 'settled', 60),
  (4, 'acc', 55),
  (4, 'flashWins', 3);

-- Tier 5 (Diamant)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (5, 'settled', 120),
  (5, 'acc', 57),
  (5, 'followed', 25);

-- Tier 6 (Ascendant)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (6, 'settled', 200),
  (6, 'acc', 58),
  (6, 'followed', 100);

-- Tier 7 (Immortel)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (7, 'settled', 320),
  (7, 'acc', 60),
  (7, 'followed', 300);

-- Tier 8 (Radiant)
INSERT INTO public.tier_conditions (tier_id, condition_key, condition_value) VALUES
  (8, 'top', 100);

-- ============================================================
-- TIER DIVISIONS (XP required)
-- ============================================================

INSERT INTO public.tier_divisions (tier_id, division, xp_required) VALUES
  -- Fer
  (0, 0, 0),
  (0, 1, 100),
  (0, 2, 200),
  -- Bronze
  (1, 0, 300),
  (1, 1, 450),
  (1, 2, 600),
  -- Argent
  (2, 0, 800),
  (2, 1, 1000),
  (2, 2, 1200),
  -- Or
  (3, 0, 1450),
  (3, 1, 1700),
  (3, 2, 1950),
  -- Platine
  (4, 0, 2250),
  (4, 1, 2550),
  (4, 2, 2850),
  -- Diamant
  (5, 0, 3200),
  (5, 1, 3600),
  (5, 2, 4000),
  -- Ascendant
  (6, 0, 4500),
  (6, 1, 5000),
  (6, 2, 5500),
  -- Immortel
  (7, 0, 6100),
  (7, 1, 6700),
  (7, 2, 7300),
  -- Radiant (single division)
  (8, 0, 8000);

-- ============================================================
-- BADGES
-- ============================================================

INSERT INTO public.badges (id, name, icon, condition_query, description) VALUES
  ('first',       'Premier pari',       'check',   'played >= 1',        'Place ton premier pari'),
  ('streak7',     'Série de 7 jours',   'flame',   'bestStreak >= 7',    'Connecte-toi 7 jours de suite'),
  ('contra',      'Contre la foule',    'down',    'contraWins >= 1',    'Gagne un pari contre 70%+ des joueurs'),
  ('voice',       'Voix du live chat',  'chat',    'msgsTotal >= 50',    'Envoie 50 messages dans le chat'),
  ('dep',         'Premier dépôt',      'wallet',  'deposits >= 1',      'Fais ton premier dépôt'),
  ('flash3',      'Triplé éclair',      'bolt',    'flashWins >= 3',     'Gagne 3 paris éclair'),
  ('fol25',       'Suivi par 25',       'users',   'followed >= 25',     '25 joueurs suivent tes paris'),
  ('clanfounder', 'Fondateur de clan',  'shield',  'clanCreated != null', 'Crée un clan'),
  ('clanweek',    'Champion de clan',   'trophy',  'weekChamp >= 1',     'Finis premier du classement hebdomadaire de ton clan'),
  ('whale',       'Grosse mise',        'target',  'maxBet >= 500',      'Place un pari de 500$ ou plus');

-- ============================================================
-- FEATURES (gated by tier)
-- ============================================================

INSERT INTO public.features (id, feature_name, required_tier, icon, description) VALUES
  -- Tier 0
  ('bet',      'Parier sur tous les marchés',                                    0, 'target',  'Accès à tous les marchés de prédiction'),
  ('chat',     'Live chat global et de chaque marché',                           0, 'chat',    'Discuter dans le chat global et les chats de marché'),
  ('flash',    'Pari éclair : rotation ou tous les paris en parallèle',          0, 'bolt',    'Accès aux jeux flash 45 secondes'),
  ('pro1',     'Mode Pro : 1 indicateur à la fois, outils de dessin illimités', 0, 'chart',   'Mode graphique avancé avec 1 indicateur'),
  -- Tier 1
  ('dm',       'Messages privés',                                                1, 'send',    'Envoyer des messages privés aux autres joueurs'),
  ('share',    'Partager tes mises dans les chats',                              1, 'share',   'Afficher tes paris dans le chat'),
  -- Tier 2
  ('follow',   'Suivre la mise d''un joueur en un clic',                         2, 'users',   'Suivre les paris d''un joueur'),
  ('clan',     'Créer un clan',                                                  2, 'shield',  'Fonder et gérer un clan'),
  ('pro2',     'Mode Pro : 2 indicateurs en même temps',                         2, 'chart',   'Mode graphique avec 2 indicateurs simultanés'),
  -- Tier 3
  ('propose',  'Créer un pari et le soumettre au vote',                          3, 'plus',    'Proposer de nouveaux marchés'),
  ('copy',     'Copier automatiquement les paris d''un joueur',                  3, 'copy',    'Copy trading automatique'),
  -- Tier 4
  ('stats',    'Statistiques avancées des marchés',                              4, 'chart',   'Accès aux stats détaillées'),
  ('pro3',     'Mode Pro : 3 indicateurs en même temps',                         4, 'chart',   'Mode graphique avec 3 indicateurs simultanés'),
  -- Tier 5
  ('fees',     'Frais réduits de 10 %',                                          5, 'percent', 'Réduction des frais de trading'),
  ('verified', 'Badge vérifié sur ton profil',                                   5, 'shield',  'Badge de vérification visible'),
  -- Tier 6
  ('vip',      'Accès au salon VIP',                                             6, 'crown',   'Salon de discussion exclusif'),
  -- Tier 7
  ('publish',  'Publier un pari sans passer par le vote',                        7, 'out',     'Publication directe de marchés'),
  -- Tier 8
  ('opinion',  'Ton avis affiché sur chaque marché',                             8, 'eye',     'Ton opinion mise en avant'),
  ('pro4',     'Mode Pro : indicateurs illimités, plusieurs fois le même si tu veux', 8, 'chart', 'Mode graphique sans limites');

-- ============================================================
-- FLASH GAMES
-- ============================================================

INSERT INTO public.flash_games (id, code, category, kind, name, tab_label, question, answer_a, answer_b, answer_be, sub_asset, volatility_k, initial_price, break_even_prob, break_even_description) VALUES
  -- Crypto (directional)
  ('btc',    'BTC',   'Crypto',      'dir', 'Bitcoin',        'BTC',   'Le Bitcoin sera-t-il plus haut ou plus bas dans 45 secondes ?',    'Plus haut', 'Plus bas', 'Break even', 'le Bitcoin',      0.00015714, 97412.35,   NULL, 'le prix ne bouge quasiment pas'),
  ('eth',    'ETH',   'Crypto',      'dir', 'Ethereum',       'ETH',   'L''Ethereum sera-t-il plus haut ou plus bas dans 45 secondes ?',   'Plus haut', 'Plus bas', 'Break even', 'l''Ethereum',     0.00020000, 3482.60,    NULL, 'le prix ne bouge quasiment pas'),
  ('sol',    'SOL',   'Crypto',      'dir', 'Solana',         'SOL',   'Solana sera-t-il plus haut ou plus bas dans 45 secondes ?',        'Plus haut', 'Plus bas', 'Break even', 'Solana',          0.00027143, 188.42,     NULL, 'le prix ne bouge quasiment pas'),
  ('doge',   'DOGE',  'Crypto',      'dir', 'Dogecoin',       'DOGE',  'Le Dogecoin sera-t-il plus haut ou plus bas dans 45 secondes ?',   'Plus haut', 'Plus bas', 'Break even', 'le Dogecoin',     0.00034286, 0.18425,    NULL, 'le prix ne bouge quasiment pas'),

  -- Bourse (directional)
  ('ndx',    'NDX',   'Bourse',      'dir', 'Nasdaq 100',     'NDX',   'Le Nasdaq 100 sera-t-il plus haut ou plus bas dans 45 secondes ?', 'Plus haut', 'Plus bas', 'Break even', 'le Nasdaq 100',   0.00005714, 25841.20,   NULL, 'le prix ne bouge quasiment pas'),
  ('spx',    'SPX',   'Bourse',      'dir', 'S&P 500',        'SPX',   'Le S&P 500 sera-t-il plus haut ou plus bas dans 45 secondes ?',   'Plus haut', 'Plus bas', 'Break even', 'le S&P 500',      0.00008571, 6812.40,    NULL, 'le prix ne bouge quasiment pas'),
  ('cac',    'CAC',   'Bourse',      'dir', 'CAC 40',         'CAC',   'Le CAC 40 sera-t-il plus haut ou plus bas dans 45 secondes ?',    'Plus haut', 'Plus bas', 'Break even', 'le CAC 40',       0.00010000, 8124.60,    NULL, 'le prix ne bouge quasiment pas'),
  ('nvda',   'NVDA',  'Bourse',      'dir', 'Nvidia',         'NVDA',  'Nvidia sera-t-il plus haut ou plus bas dans 45 secondes ?',       'Plus haut', 'Plus bas', 'Break even', 'Nvidia',          0.00012857, 142.35,     NULL, 'le prix ne bouge quasiment pas'),
  ('tsla',   'TSLA',  'Bourse',      'dir', 'Tesla',          'TSLA',  'Tesla sera-t-il plus haut ou plus bas dans 45 secondes ?',        'Plus haut', 'Plus bas', 'Break even', 'Tesla',           0.00015714, 248.70,     NULL, 'le prix ne bouge quasiment pas'),

  -- Matières (directional)
  ('gold',   'XAU',   'Matières',    'dir', 'Or',             'Or',    'L''or sera-t-il plus haut ou plus bas dans 45 secondes ?',         'Plus haut', 'Plus bas', 'Break even', 'l''or',           0.00007143, 4126.80,    NULL, 'le prix ne bouge quasiment pas'),
  ('silver', 'XAG',   'Matières',    'dir', 'Argent',         'Argent','L''argent sera-t-il plus haut ou plus bas dans 45 secondes ?',     'Plus haut', 'Plus bas', 'Break even', 'l''argent',       0.00012857, 48.62,      NULL, 'le prix ne bouge quasiment pas'),
  ('oil',    'BRENT', 'Matières',    'dir', 'Pétrole Brent',  'Brent', 'Le pétrole Brent sera-t-il plus haut ou plus bas dans 45 sec ?',  'Plus haut', 'Plus bas', 'Break even', 'le pétrole Brent',0.00012857, 64.20,      NULL, 'le prix ne bouge quasiment pas'),

  -- Devises (directional)
  ('eurusd', 'EUR',   'Devises',     'dir', 'Euro / dollar',  'EUR',   'L''euro/dollar sera-t-il plus haut ou plus bas dans 45 sec ?',    'Plus haut', 'Plus bas', 'Break even', 'l''euro/dollar',  0.00003143, 1.1642,     NULL, 'le prix ne bouge quasiment pas'),
  ('gbpusd', 'GBP',   'Devises',     'dir', 'Livre / dollar', 'GBP',   'La livre/dollar sera-t-elle plus haut ou plus bas dans 45 sec ?', 'Plus haut', 'Plus bas', 'Break even', 'la livre/dollar', 0.00003571, 1.3125,     NULL, 'le prix ne bouge quasiment pas'),
  ('usdjpy', 'JPY',   'Devises',     'dir', 'Dollar / yen',   'JPY',   'Le dollar/yen sera-t-il plus haut ou plus bas dans 45 sec ?',     'Plus haut', 'Plus bas', 'Break even', 'le dollar/yen',   0.00004286, 152.84,     NULL, 'le prix ne bouge quasiment pas'),

  -- Volatility
  ('vol',    'SEC',   'Crypto',      'vol', 'Secousse',       'Secousse', 'Le Bitcoin va-t-il bouger de plus de 0,05 % en 45 secondes ?',  'Ça bouge',  'Ça reste calme', 'Break even', 'le Bitcoin', 0.00003143, NULL, NULL, 'le Bitcoin reste quasi immobile (±0,003 %)'),

  -- Events
  ('tennis', 'TEN',   'Sport live',  'event', 'Tennis',       'Tennis',   'Marin va-t-il gagner le prochain point ?',                       'Marin',         'Duval',           'Let',          NULL, NULL, NULL, 0.04000, 'le point est rejoué (let)'),
  ('basket', 'BSK',   'Sport live',  'event', 'Basket',       'Basket',   'Le prochain tir des Lions sera-t-il à 3 points ?',               'À 3 points',   'À 2 points',      'Balle perdue', NULL, NULL, NULL, 0.04000, 'aucun tir, la balle est perdue'),
  ('foot',   'FOOT',  'Sport live',  'event', 'Foot',         'Foot',     'Y aura-t-il un corner dans la prochaine minute ?',               'Oui, un corner','Non',             'But',          NULL, NULL, NULL, 0.03000, 'un but est marqué dans la minute');

-- ============================================================
-- DEFAULT CHAT ROOMS
-- ============================================================

INSERT INTO public.chat_rooms (id, name, kind) VALUES
  ('general', 'Général', 'global'),
  ('vip',     'Salon VIP', 'vip');

-- ============================================================
-- CRYPTO PRICES (initial snapshot)
-- ============================================================

INSERT INTO public.crypto_prices (coin, price_usd) VALUES
  ('BTC',  97412.35),
  ('ETH',  3482.60),
  ('SOL',  188.42),
  ('USDC', 1.00),
  ('USDT', 1.00);
