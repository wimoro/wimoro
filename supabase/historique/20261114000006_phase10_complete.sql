-- Migration d'origine 20261114000006_phase10_complete — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- PHASE 10: Complete frontend integration — all 7 priorities
-- ============================================================

-- ============================================================
-- P1: FRIENDS (complete CRUD)
-- ============================================================

-- Get friends list
CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE(username text, avatar_color text, status text, direction text, user_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT u.username, u.avatar_color, f.status,
    CASE WHEN f.user_id = auth.uid() THEN 'out' ELSE 'in' END as direction,
    CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END as user_id
  FROM public.friendships f
  JOIN public.users u ON u.id = CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END
  WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
$$;

-- Remove friend
CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid := auth.uid(); v_fid uuid;
BEGIN
  SELECT id INTO v_fid FROM public.users WHERE username ILIKE p_friend_username;
  IF v_fid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  DELETE FROM public.friendships WHERE
    (user_id = v_uid AND friend_id = v_fid) OR (user_id = v_fid AND friend_id = v_uid);
  RETURN jsonb_build_object('status', 'removed');
END;
$$;

-- Decline friend request
CREATE OR REPLACE FUNCTION public.decline_friend_request(p_from_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.friendships
  WHERE user_id = p_from_user_id AND friend_id = auth.uid() AND status = 'pending';
  RETURN jsonb_build_object('status', 'declined');
END;
$$;

-- ============================================================
-- P2: CLANS (enhanced)
-- ============================================================

-- Leave clan
CREATE OR REPLACE FUNCTION public.leave_clan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid := auth.uid(); v_clan_id uuid;
BEGIN
  SELECT clan_id INTO v_clan_id FROM public.clan_members WHERE user_id = v_uid;
  IF v_clan_id IS NULL THEN RAISE EXCEPTION 'Not in a clan'; END IF;
  DELETE FROM public.clan_members WHERE clan_id = v_clan_id AND user_id = v_uid;
  UPDATE public.clans SET member_count = GREATEST(0, member_count - 1) WHERE id = v_clan_id;
  RETURN jsonb_build_object('status', 'left');
END;
$$;

-- Get clan members
CREATE OR REPLACE FUNCTION public.get_clan_members(p_clan_id uuid)
RETURNS TABLE(username text, avatar_color text, role text, joined_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT u.username, u.avatar_color, cm.role, cm.joined_at
  FROM public.clan_members cm
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.clan_id = p_clan_id
  ORDER BY cm.role DESC, cm.joined_at;
$$;

-- Get all clans
CREATE OR REPLACE FUNCTION public.get_clans()
RETURNS TABLE(id uuid, name text, description text, emblem_color text, emblem_icon text, member_count int, founder_username text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT c.id, c.name, c.description, c.emblem_color, c.emblem_icon, c.member_count, u.username
  FROM public.clans c
  JOIN public.users u ON u.id = c.founder_user_id
  ORDER BY c.member_count DESC;
$$;

-- Get my clan
CREATE OR REPLACE FUNCTION public.get_my_clan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_clan_id uuid; v_role text;
BEGIN
  SELECT cm.clan_id, cm.role INTO v_clan_id, v_role FROM public.clan_members cm WHERE cm.user_id = auth.uid() LIMIT 1;
  IF v_clan_id IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'role', v_role, 'member_count', c.member_count, 'emblem_color', c.emblem_color)
    FROM public.clans c WHERE c.id = v_clan_id);
END;
$$;

-- ============================================================
-- P3: COPY TRADING
-- ============================================================

-- Start copying a trader
CREATE OR REPLACE FUNCTION public.start_copy(p_target_username text, p_budget numeric DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- Stop copying
CREATE OR REPLACE FUNCTION public.stop_copy(p_target_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid := auth.uid(); v_tid uuid;
BEGIN
  SELECT id INTO v_tid FROM public.users WHERE username ILIKE p_target_username;
  IF v_tid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  DELETE FROM public.copy_following WHERE copy_follower_id = v_uid AND copy_target_user_id = v_tid;
  UPDATE public.user_stats SET copiers_count = GREATEST(0, copiers_count - 1) WHERE user_id = v_tid;

  RETURN jsonb_build_object('status', 'stopped');
END;
$$;

-- Get who I'm copying
CREATE OR REPLACE FUNCTION public.get_my_copies()
RETURNS TABLE(username text, avatar_color text, is_active boolean, started_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT u.username, u.avatar_color, cf.is_active, cf.started_at
  FROM public.copy_following cf
  JOIN public.users u ON u.id = cf.copy_target_user_id
  WHERE cf.copy_follower_id = auth.uid();
$$;

-- ============================================================
-- P4: MISSIONS & BADGES (server-side)
-- ============================================================

-- Create daily missions for a user (called on login)
CREATE OR REPLACE FUNCTION public.init_daily_missions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- Progress a mission (called internally by place_bet, flash_bet, send_chat_message)
CREATE OR REPLACE FUNCTION public.progress_mission(p_user_id uuid, p_type text, p_amount int DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.missions SET current_progress = LEAST(goal_value, current_progress + p_amount)
  WHERE user_id = p_user_id AND mission_type = p_type AND NOT is_claimed AND expires_at > now();
END;
$$;

-- Check and award badges
CREATE OR REPLACE FUNCTION public.check_badges()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- Get my badges
CREATE OR REPLACE FUNCTION public.get_my_badges()
RETURNS TABLE(badge_id text, unlocked_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT badge_id, unlocked_at FROM public.user_badges WHERE user_id = auth.uid();
$$;

-- ============================================================
-- P5: NEWSLETTER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  subscribed boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.newsletter_subscribe(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.newsletter_subscribers (email, subscribed)
  VALUES (lower(trim(p_email)), true)
  ON CONFLICT (email) DO UPDATE SET subscribed = true, unsubscribed_at = null;
  RETURN jsonb_build_object('status', 'subscribed');
END;
$$;

CREATE OR REPLACE FUNCTION public.newsletter_unsubscribe(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.newsletter_subscribers SET subscribed = false, unsubscribed_at = now()
  WHERE email = lower(trim(p_email));
  RETURN jsonb_build_object('status', 'unsubscribed');
END;
$$;

-- ============================================================
-- P6: NOTIFICATIONS (persistent)
-- ============================================================

-- Create notification (called by other RPCs)
-- Already exists from Phase 2-9 migration

-- Mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_notifications_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.notifications SET is_read = true WHERE user_id = auth.uid() AND NOT is_read;
END;
$$;

-- Clear all notifications
CREATE OR REPLACE FUNCTION public.clear_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.notifications WHERE user_id = auth.uid();
END;
$$;

-- Delete single notification
CREATE OR REPLACE FUNCTION public.delete_notification(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.notifications WHERE id = p_id AND user_id = auth.uid();
END;
$$;

-- ============================================================
-- Update place_bet, flash_bet, send_chat_message to also
-- progress missions and create notifications
-- ============================================================

-- Enhance place_bet to progress missions
-- (missions progress is lightweight, just increment a counter)
CREATE OR REPLACE FUNCTION public._post_bet_hook(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.progress_mission(p_user_id, 'bet', 1);
  PERFORM public.check_badges();
END;
$$;

-- Add Realtime to notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
