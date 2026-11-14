-- Migration d'origine 20261113000003_create_bots — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- WIMORO - Generate 10,000 bot users for prediction market
-- Run as a single transaction
-- ============================================================
BEGIN;

-- ============================================================
-- 1. Helper function: generate varied French/international usernames
-- ============================================================
CREATE OR REPLACE FUNCTION _bot_username(seq integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE (seq % 50)
    -- French first names (plain)
    WHEN  0 THEN 'lucas'    || seq
    WHEN  1 THEN 'emma'     || seq
    WHEN  2 THEN 'hugo'     || seq
    WHEN  3 THEN 'chloe'    || seq
    WHEN  4 THEN 'louis'    || seq
    WHEN  5 THEN 'lea'      || seq
    WHEN  6 THEN 'nathan'   || seq
    WHEN  7 THEN 'manon'    || seq
    WHEN  8 THEN 'theo'     || seq
    WHEN  9 THEN 'camille'  || seq
    -- Handle style: prefix_name
    WHEN 10 THEN 'crypto_marc'   || seq
    WHEN 11 THEN 'trader_sophie' || seq
    WHEN 12 THEN 'bet_king'      || seq
    WHEN 13 THEN 'flash_julie'   || seq
    WHEN 14 THEN 'pro_yann'      || seq
    WHEN 15 THEN 'degen_alex'    || seq
    WHEN 16 THEN 'whale_paul'    || seq
    WHEN 17 THEN 'alpha_sarah'   || seq
    WHEN 18 THEN 'bull_nico'     || seq
    WHEN 19 THEN 'bear_lisa'     || seq
    -- Gaming-style names
    WHEN 20 THEN 'xDarkPredx'    || seq
    WHEN 21 THEN 'SniperBet'     || seq
    WHEN 22 THEN 'NovaTrade'     || seq
    WHEN 23 THEN 'ZenMaster'     || seq
    WHEN 24 THEN 'PhantomOdds'   || seq
    WHEN 25 THEN 'VortexPro'     || seq
    WHEN 26 THEN 'NeoPredict'    || seq
    WHEN 27 THEN 'AceFlash'      || seq
    WHEN 28 THEN 'StormBet'      || seq
    WHEN 29 THEN 'PixelTrader'   || seq
    -- International first names
    WHEN 30 THEN 'mehdi'    || seq
    WHEN 31 THEN 'fatima'   || seq
    WHEN 32 THEN 'youssef'  || seq
    WHEN 33 THEN 'amina'    || seq
    WHEN 34 THEN 'romain'   || seq
    WHEN 35 THEN 'oceane'   || seq
    WHEN 36 THEN 'karim'    || seq
    WHEN 37 THEN 'ines'     || seq
    WHEN 38 THEN 'antoine'  || seq
    WHEN 39 THEN 'clara'    || seq
    -- More handle styles
    WHEN 40 THEN 'le_trader'     || seq
    WHEN 41 THEN 'miss_prono'    || seq
    WHEN 42 THEN 'monsieur_bet'  || seq
    WHEN 43 THEN 'paris_gagnant' || seq
    WHEN 44 THEN 'la_cote'       || seq
    WHEN 45 THEN 'mr_flash'      || seq
    WHEN 46 THEN 'top_predic'    || seq
    WHEN 47 THEN 'ez_profit'     || seq
    WHEN 48 THEN 'risk_taker'    || seq
    WHEN 49 THEN 'smart_money'   || seq
  END;
$$;

-- ============================================================
-- 2. Generate 10,000 bot users + stats in one CTE chain
-- ============================================================
WITH params AS (
  SELECT generate_series(1, 10000) AS seq
),
bot_users AS (
  SELECT
    gen_random_uuid()                          AS id,
    _bot_username(p.seq)                       AS username,
    'bot_' || p.seq || '@wimoro.internal'      AS email,
    -- Random hex avatar color
    '#' || lpad(to_hex((random() * 16777215)::int), 6, '0') AS avatar_color,
    -- Random bio from a small set
    CASE (p.seq % 8)
      WHEN 0 THEN 'Passionnee de predictions'
      WHEN 1 THEN 'Trader amateur, reves de whale'
      WHEN 2 THEN 'Les probas ne mentent pas'
      WHEN 3 THEN 'Flash addict'
      WHEN 4 THEN 'Je bet donc je suis'
      WHEN 5 THEN ''
      WHEN 6 THEN 'Le marche a toujours raison'
      WHEN 7 THEN 'Crypto degen depuis 2021'
    END                                         AS bio,
    -- Spread created_at over the last 6 months
    now() - (random() * interval '180 days')    AS created_at,
    -- Power-law rank_tier: most users low tier, few high
    -- Using floor(pow(random(), 2.5) * 9) clamped to 0-8
    LEAST(8, floor(pow(random(), 2.5) * 9)::int) AS rank_tier,
    -- Raw random values we reuse for correlated stats
    random()                                    AS r_balance,
    random()                                    AS r_activity,
    random()                                    AS r_accuracy,
    p.seq
  FROM params p
),
inserted_users AS (
  INSERT INTO public.users (id, username, email, avatar_photo, avatar_color, bio, onboarded, welcomed, is_demo, created_at)
  SELECT
    bu.id,
    bu.username,
    bu.email,
    '',
    bu.avatar_color,
    bu.bio,
    true,
    true,
    true,  -- mark as demo/bot
    bu.created_at
  FROM bot_users bu
  RETURNING id
),
-- Build stats derived from the random seeds
bot_stats AS (
  SELECT
    bu.id                                                          AS user_id,
    -- Power-law balance: most have 500-10k, few have millions
    -- Formula: 500 + (4999500 * r_balance^4)  => heavy left skew
    round((500 + 4999500 * pow(bu.r_balance, 4))::numeric, 2)                AS balance,
    -- XP correlated to rank_tier: tier * 1000 +/- noise
    LEAST(8000, GREATEST(0,
      bu.rank_tier * 900 + floor(random() * 800)
    ))::int                                                        AS xp,
    -- Followers/following: light social activity
    floor(bu.r_activity * 150)::int                                AS followers_count,
    floor(random() * 100)::int                                     AS following_count,
    bu.rank_tier,
    -- Division within tier
    floor(random() * 3)::int                                       AS rank_division,
    -- Bets placed: correlated with activity
    GREATEST(0, floor(bu.r_activity * 1000))::int                  AS bets_placed,
    -- Accuracy between 30-75%
    (30 + floor(bu.r_accuracy * 46))::int                          AS bets_accuracy_pct,
    -- Flash wins 0-200
    floor(random() * 201)::int                                     AS flash_wins,
    -- Messages 0-500
    floor(random() * 501)::int                                     AS messages_total,
    -- Streak
    GREATEST(1, floor(random() * 15))::int                         AS streak_current,
    GREATEST(1, floor(random() * 30))::int                         AS streak_best,
    -- Profit realized: can be negative for losers, positive for winners
    round(((random() - 0.4) * 200000)::numeric, 2)                           AS profit_realized,
    bu.r_activity
  FROM bot_users bu
)
INSERT INTO public.user_stats (
  user_id, balance, xp,
  followers_count, following_count,
  rank_tier, rank_division,
  bets_placed, bets_won, bets_settled, bets_accuracy_pct,
  flash_wins, messages_total,
  streak_current, streak_best,
  profit_realized
)
SELECT
  bs.user_id,
  bs.balance,
  bs.xp,
  bs.followers_count,
  bs.following_count,
  bs.rank_tier,
  bs.rank_division,
  bs.bets_placed,
  -- bets_won derived from accuracy: bets_placed * accuracy%
  GREATEST(0, floor(bs.bets_placed * bs.bets_accuracy_pct / 100.0))::int,
  -- bets_settled: between bets_won and bets_placed
  GREATEST(
    floor(bs.bets_placed * bs.bets_accuracy_pct / 100.0)::int,
    floor(bs.bets_placed * (0.7 + random() * 0.3))::int
  ),
  bs.bets_accuracy_pct,
  bs.flash_wins,
  bs.messages_total,
  bs.streak_current,
  GREATEST(bs.streak_current, bs.streak_best),
  bs.profit_realized
FROM bot_stats bs;

-- ============================================================
-- 3. Cleanup helper function
-- ============================================================
DROP FUNCTION IF EXISTS _bot_username(integer);

COMMIT;
