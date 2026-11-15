-- Migration d'origine 20261113000006_admin_tools — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- WIMORO Admin Tools: manage player balances
-- ============================================================

-- 1. Admin users table
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  role text DEFAULT 'admin' CHECK (role IN ('admin','super_admin')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin list" ON public.admin_users FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM public.admin_users)
);

-- 2. Balance adjustment log (audit trail)
CREATE TABLE IF NOT EXISTS public.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES public.users(id),
  amount numeric(15,2) NOT NULL,
  reason text,
  balance_before numeric(15,2) NOT NULL,
  balance_after numeric(15,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read adjustments" ON public.balance_adjustments FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM public.admin_users)
);

CREATE INDEX idx_balance_adj_target ON public.balance_adjustments(target_user_id);

CREATE INDEX idx_balance_adj_admin ON public.balance_adjustments(admin_user_id);

-- 3. Check player info (by username or email)
CREATE OR REPLACE FUNCTION public.admin_get_player(search_term text)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  balance numeric,
  xp integer,
  rank_tier integer,
  rank_division integer,
  bets_placed integer,
  bets_won integer,
  accuracy integer,
  flash_wins integer,
  profit numeric,
  is_bot boolean,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.username,
    u.email,
    s.balance,
    s.xp,
    s.rank_tier,
    s.rank_division,
    s.bets_placed,
    s.bets_won,
    s.bets_accuracy_pct,
    s.flash_wins,
    s.profit_realized,
    u.is_demo,
    u.created_at
  FROM public.users u
  JOIN public.user_stats s ON s.user_id = u.id
  WHERE u.username ILIKE '%' || search_term || '%'
     OR u.email ILIKE '%' || search_term || '%'
  ORDER BY u.created_at DESC
  LIMIT 20;
END;
$$;

-- 4. Add or remove balance
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  target_username text,
  adjustment numeric,
  adjustment_reason text DEFAULT 'Admin adjustment'
)
RETURNS TABLE (
  username text,
  balance_before numeric,
  balance_after numeric,
  adjustment_amount numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;
  v_after := GREATEST(0, v_before + adjustment);

  UPDATE public.user_stats SET balance = v_after WHERE user_id = v_user_id;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), adjustment, adjustment_reason, v_before, v_after);

  RETURN QUERY SELECT v_username, v_before, v_after, adjustment;
END;
$$;

-- 5. Set exact balance
CREATE OR REPLACE FUNCTION public.admin_set_balance(
  target_username text,
  new_balance numeric,
  adjustment_reason text DEFAULT 'Admin set balance'
)
RETURNS TABLE (
  username text,
  balance_before numeric,
  balance_after numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_before numeric;
BEGIN
  SELECT u.id, u.username INTO v_user_id, v_username
  FROM public.users u
  WHERE u.username = target_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found', target_username;
  END IF;

  SELECT s.balance INTO v_before FROM public.user_stats s WHERE s.user_id = v_user_id;

  UPDATE public.user_stats SET balance = GREATEST(0, new_balance) WHERE user_id = v_user_id;

  INSERT INTO public.balance_adjustments (target_user_id, admin_user_id, amount, reason, balance_before, balance_after)
  VALUES (v_user_id, COALESCE(auth.uid(), v_user_id), new_balance - v_before, adjustment_reason, v_before, GREATEST(0, new_balance));

  RETURN QUERY SELECT v_username, v_before, GREATEST(0::numeric, new_balance);
END;
$$;

-- 6. List top players by balance
CREATE OR REPLACE FUNCTION public.admin_top_players(n integer DEFAULT 20)
RETURNS TABLE (
  username text,
  email text,
  balance numeric,
  xp integer,
  rank_tier integer,
  bets_placed integer,
  accuracy integer,
  profit numeric,
  is_bot boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT u.username, u.email, s.balance, s.xp, s.rank_tier,
         s.bets_placed, s.bets_accuracy_pct, s.profit_realized, u.is_demo
  FROM public.users u
  JOIN public.user_stats s ON s.user_id = u.id
  ORDER BY s.balance DESC
  LIMIT n;
END;
$$;

-- 7. List recent balance adjustments
CREATE OR REPLACE FUNCTION public.admin_balance_history(target_username text DEFAULT NULL, n integer DEFAULT 50)
RETURNS TABLE (
  adjusted_at timestamptz,
  username text,
  amount numeric,
  reason text,
  before_bal numeric,
  after_bal numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT ba.created_at, u.username, ba.amount, ba.reason, ba.balance_before, ba.balance_after
  FROM public.balance_adjustments ba
  JOIN public.users u ON u.id = ba.target_user_id
  WHERE (target_username IS NULL OR u.username = target_username)
  ORDER BY ba.created_at DESC
  LIMIT n;
END;
$$;

-- 8. Ban/unban a user
CREATE OR REPLACE FUNCTION public.admin_ban_user(target_username text, ban boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;
