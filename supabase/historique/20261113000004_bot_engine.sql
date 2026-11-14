-- Migration d'origine 20261113000004_bot_engine — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- WIMORO Bot Engine: server-side market making & activity
-- Runs via pg_cron or Supabase Edge Functions
-- ============================================================

-- ============================================================
-- 1. Market Making: bots place bets, move prices
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_market_make()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m record;
  bot record;
  bet_side integer;
  bet_amount numeric;
  price_delta numeric;
  new_price numeric;
BEGIN
  FOR m IN SELECT market_id, current_probability, volume_total, participants_count, messages_count
           FROM public.market_live_state
           ORDER BY random() LIMIT 5
  LOOP
    -- Pick a random bot
    SELECT id, username INTO bot
    FROM public.users
    WHERE is_demo = true
    ORDER BY random() LIMIT 1;

    IF bot.id IS NULL THEN CONTINUE; END IF;

    -- Decide bet side: slightly biased toward current probability
    bet_side := CASE WHEN random() < (m.current_probability / 100.0) THEN 1 ELSE 0 END;

    -- Bet amount: 10-5000, power law
    bet_amount := round((10 + 4990 * pow(random(), 2.5))::numeric, 2);

    -- Price impact: small random walk biased by bet
    price_delta := (random() - 0.5) * 1.5;
    IF bet_side = 1 THEN price_delta := price_delta + 0.3;
    ELSE price_delta := price_delta - 0.3;
    END IF;

    new_price := GREATEST(2, LEAST(98, m.current_probability + price_delta));

    -- Update market live state
    UPDATE public.market_live_state SET
      current_probability = round(new_price, 2),
      volume_total = volume_total + bet_amount,
      participants_count = participants_count + 1,
      updated_at = now()
    WHERE market_id = m.market_id;

    -- Record the bet
    INSERT INTO public.market_bets (market_id, side, amount_pct, user_is_me, timestamp)
    VALUES (m.market_id, bet_side, LEAST(1, bet_amount / 5000.0), 0, now());

    -- Update bot stats
    UPDATE public.user_stats SET
      bets_placed = bets_placed + 1,
      balance = balance - bet_amount
    WHERE user_id = bot.id;

    -- Record price history point
    INSERT INTO public.market_price_history (market_id, price, timestamp, sequence)
    VALUES (m.market_id, round(new_price, 2), now(),
      COALESCE((SELECT MAX(sequence) + 1 FROM public.market_price_history WHERE market_id = m.market_id), 1));
  END LOOP;
END;
$$;

-- ============================================================
-- 2. Chat Activity: bots send messages
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_chat_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  bot record;
  room_id text;
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

  -- Pick 3-5 random bots to chat
  FOR bot IN SELECT id FROM public.users WHERE is_demo = true ORDER BY random() LIMIT (3 + floor(random() * 3)::int)
  LOOP
    -- Pick random room (general or a market room)
    IF random() < 0.6 THEN
      room_id := 'general';
    ELSE
      SELECT 'm:' || market_id INTO room_id FROM public.market_live_state ORDER BY random() LIMIT 1;
    END IF;

    IF room_id IS NULL THEN room_id := 'general'; END IF;

    -- Pick random message
    msg_text := msg_pool[1 + floor(random() * array_length(msg_pool, 1))::int];

    -- Insert message
    INSERT INTO public.chat_messages (room_id, user_id, message_type, text_content)
    VALUES (room_id, bot.id, 'msg', msg_text);

    -- Update bot message count
    UPDATE public.user_stats SET messages_total = messages_total + 1 WHERE user_id = bot.id;
  END LOOP;
END;
$$;

-- ============================================================
-- 3. Flash Game Bots: participate in flash rounds
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_flash_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- 4. Social Activity: follows, reactions
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_social_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ============================================================
-- 5. Master bot tick: runs all bot functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.bot_market_make();
  PERFORM public.bot_chat_activity();
  IF random() < 0.3 THEN
    PERFORM public.bot_flash_activity();
  END IF;
  IF random() < 0.2 THEN
    PERFORM public.bot_social_activity();
  END IF;
END;
$$;

-- ============================================================
-- 6. Enable pg_cron and schedule bot activity
-- ============================================================

-- Enable pg_cron extension (available on Supabase Pro plan)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage
GRANT USAGE ON SCHEMA cron TO postgres;

-- Run bot_tick every minute (market making + chat + flash + social)
SELECT cron.schedule('bot-tick', '* * * * *', 'SELECT public.bot_tick()');

-- Run a burst of activity every 5 minutes
SELECT cron.schedule('bot-burst', '*/5 * * * *', $$
  SELECT public.bot_market_make();
  SELECT public.bot_market_make();
  SELECT public.bot_market_make();
  SELECT public.bot_chat_activity();
  SELECT public.bot_chat_activity();
$$);
