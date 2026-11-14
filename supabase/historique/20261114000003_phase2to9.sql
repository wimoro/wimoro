-- Migration d'origine 20261114000003_phase2to9 — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- PHASES 2-9: Complete backend migration
-- ============================================================

-- ============================================================
-- PHASE 2: Shared market state
-- ============================================================

-- Market price history (append-only for charts)
ALTER TABLE public.market_live_state ADD COLUMN IF NOT EXISTS price_history jsonb DEFAULT '[]'::jsonb;

-- RPC: Get all market states
CREATE OR REPLACE FUNCTION public.get_markets()
RETURNS SETOF public.market_live_state LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT * FROM public.market_live_state;
$$;

-- Update bot_market_make to also append to price_history
CREATE OR REPLACE FUNCTION public.bot_market_make()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- PHASE 3: Real-time chat
-- ============================================================

-- RPC: Send chat message (server-side, grants XP)
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_room_id text,
  p_text text,
  p_type text DEFAULT 'msg'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- RPC: Get chat history for a room
CREATE OR REPLACE FUNCTION public.get_chat_history(
  p_room_id text,
  p_limit int DEFAULT 50
)
RETURNS TABLE(id bigint, room_id text, username text, avatar_color text, message_type text, text_content text, reactions jsonb, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT cm.id, cm.room_id, u.username, u.avatar_color, cm.message_type, cm.text_content, cm.reactions, cm.created_at
  FROM public.chat_messages cm
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.room_id = p_room_id
  ORDER BY cm.created_at DESC
  LIMIT p_limit;
$$;

-- RPC: React to message
CREATE OR REPLACE FUNCTION public.react_to_message(
  p_message_id bigint,
  p_emoji text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- PHASE 4: Positions & History
-- ============================================================

-- RPC: Get user positions with current market prices
CREATE OR REPLACE FUNCTION public.get_my_positions()
RETURNS TABLE(market_id text, side text, shares numeric, average_price numeric, current_price numeric, pnl numeric)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.market_id, p.side, p.shares, p.average_price,
    CASE WHEN p.side = 'oui' THEN mls.current_probability ELSE 100 - mls.current_probability END as current_price,
    p.shares * (CASE WHEN p.side = 'oui' THEN mls.current_probability ELSE 100 - mls.current_probability END - p.average_price) / 100 as pnl
  FROM public.positions p
  JOIN public.market_live_state mls ON mls.market_id = p.market_id
  WHERE p.user_id = auth.uid();
$$;

-- RPC: Get user history (paginated)
CREATE OR REPLACE FUNCTION public.get_my_history(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE(id uuid, kind text, market_id text, question text, side text, was_winner boolean, pnl numeric, settled_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, kind, market_id, question, side, was_winner, pnl, settled_at
  FROM public.position_history
  WHERE user_id = auth.uid()
  ORDER BY settled_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- RPC: Settle a market (admin only)
CREATE OR REPLACE FUNCTION public.settle_market(
  p_market_id text,
  p_outcome text -- 'yes' or 'no'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- PHASE 5: Flash games server-side
-- ============================================================

-- Add columns for server-side flash
ALTER TABLE public.flash_rounds ADD COLUMN IF NOT EXISTS lock_price numeric(15,4);

ALTER TABLE public.flash_rounds ADD COLUMN IF NOT EXISTS open_price numeric(15,4);

ALTER TABLE public.flash_rounds ADD COLUMN IF NOT EXISTS total_pool numeric(15,2) DEFAULT 0;

-- RPC: Flash bet (already in Phase 1 as shell, now full)
CREATE OR REPLACE FUNCTION public.flash_bet(
  p_game_id text,
  p_side text,
  p_amount numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- Flash round settlement
CREATE OR REPLACE FUNCTION public.flash_settle_round(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- Master flash tick (called by pg_cron)
CREATE OR REPLACE FUNCTION public.flash_tick_server()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- Schedule flash tick every minute
SELECT cron.schedule('flash-tick-server', '* * * * *', 'SELECT public.flash_tick_server()');

-- ============================================================
-- PHASE 6: XP, Rank, Missions, Badges (server-side)
-- ============================================================

-- RPC: Grant XP (internal, called by other RPCs)
CREATE OR REPLACE FUNCTION public.grant_xp(p_user_id uuid, p_amount int, p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.user_stats SET xp = xp + p_amount WHERE user_id = p_user_id;
END;
$$;

-- RPC: Claim mission
CREATE OR REPLACE FUNCTION public.claim_mission(p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- PHASE 7: Social features
-- ============================================================

-- RPC: Send friend request
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- RPC: Accept friend request
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_from_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- RPC: Get friends list
CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS TABLE(user_id uuid, username text, avatar_color text, status text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT u.id, u.username, u.avatar_color, f.status
  FROM public.friendships f
  JOIN public.users u ON u.id = CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END
  WHERE (f.user_id = auth.uid() OR f.friend_id = auth.uid())
    AND f.status = 'accepted';
$$;

-- RPC: Get leaderboard (real data!)
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_period text DEFAULT 'season',
  p_limit int DEFAULT 50
)
RETURNS TABLE(rank bigint, username text, avatar_color text, balance numeric, profit numeric, accuracy int, bets_placed int, is_bot boolean)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT row_number() OVER (ORDER BY s.profit_realized DESC) as rank,
    u.username, u.avatar_color, s.balance, s.profit_realized, s.bets_accuracy_pct, s.bets_placed, u.is_demo
  FROM public.user_stats s
  JOIN public.users u ON u.id = s.user_id
  WHERE s.bets_placed > 0
  ORDER BY s.profit_realized DESC
  LIMIT p_limit;
$$;

-- RPC: Create clan
CREATE OR REPLACE FUNCTION public.create_clan(
  p_name text,
  p_description text DEFAULT '',
  p_emblem_color text DEFAULT '#2448FF',
  p_emblem_icon text DEFAULT 'shield'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- RPC: Join clan
CREATE OR REPLACE FUNCTION public.join_clan(p_clan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (p_clan_id, v_uid, 'member')
  ON CONFLICT DO NOTHING;

  UPDATE public.clans SET member_count = member_count + 1 WHERE id = p_clan_id;

  RETURN jsonb_build_object('status', 'joined');
END;
$$;

-- ============================================================
-- PHASE 8: Duels & Combos
-- ============================================================

-- Duels table
CREATE TABLE IF NOT EXISTS public.duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.users(id),
  opponent_id uuid REFERENCES public.users(id),
  market_id text NOT NULL,
  creator_side text NOT NULL,
  creator_stake numeric(15,2) NOT NULL,
  opponent_stake numeric(15,2),
  pot numeric(15,2) DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open','active','settled','expired','declined')),
  winner_id uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  settled_at timestamptz
);

ALTER TABLE public.duels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read duels they participate in" ON public.duels FOR SELECT
  USING (auth.uid() = creator_id OR auth.uid() = opponent_id);

-- Combos table
CREATE TABLE IF NOT EXISTS public.combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  stake numeric(15,2) NOT NULL,
  potential_payout numeric(15,2) NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open','won','lost','cashed')),
  legs jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  settled_at timestamptz
);

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own combos" ON public.combos FOR SELECT USING (auth.uid() = user_id);

-- RPC: Create duel
CREATE OR REPLACE FUNCTION public.create_duel(
  p_market_id text,
  p_side text,
  p_stake numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- RPC: Accept duel
CREATE OR REPLACE FUNCTION public.accept_duel(p_duel_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- PHASE 9: Demo deposits/withdrawals
-- ============================================================

-- demo_deposit already created in Phase 1
-- demo_withdrawal already created in Phase 1

-- RPC: Get deposit history
CREATE OR REPLACE FUNCTION public.get_my_deposits()
RETURNS TABLE(id uuid, coin text, network text, coin_amount numeric, usd_equivalent numeric, status text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, coin, network, coin_amount, usd_equivalent, status, created_at
  FROM public.deposits WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 50;
$$;

-- RPC: Get withdrawal history
CREATE OR REPLACE FUNCTION public.get_my_withdrawals()
RETURNS TABLE(id uuid, network text, destination_address text, amount_usd numeric, status text, requested_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, network, destination_address, amount_usd, status, requested_at
  FROM public.withdrawals WHERE user_id = auth.uid()
  ORDER BY requested_at DESC LIMIT 50;
$$;

-- ============================================================
-- Update master bot_tick to include flash
-- ============================================================
CREATE OR REPLACE FUNCTION public.bot_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- Notifications RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, icon text, text text, href text, is_read boolean, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, icon, text, href, is_read, created_at
  FROM public.notifications WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_icon text,
  p_text text,
  p_href text DEFAULT ''
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, icon, text, href)
  VALUES (p_user_id, p_icon, p_text, p_href);
  -- Keep max 30
  DELETE FROM public.notifications WHERE id IN (
    SELECT id FROM public.notifications WHERE user_id = p_user_id
    ORDER BY created_at DESC OFFSET 30
  );
END;
$$;
