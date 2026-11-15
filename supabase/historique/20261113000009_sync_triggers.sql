-- Migration d'origine 20261113000009_sync_triggers — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- Auto-sync: when user_stats or users table changes,
-- update the user_full_state JSON blob automatically
-- ============================================================

-- 1. Trigger: user_stats changes → update blob
CREATE OR REPLACE FUNCTION public.sync_stats_to_blob()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

DROP TRIGGER IF EXISTS sync_stats_to_blob ON public.user_stats;

CREATE TRIGGER sync_stats_to_blob
  AFTER UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.sync_stats_to_blob();

-- 2. Trigger: users table changes → update blob
CREATE OR REPLACE FUNCTION public.sync_users_to_blob()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

DROP TRIGGER IF EXISTS sync_users_to_blob ON public.users;

CREATE TRIGGER sync_users_to_blob
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_users_to_blob();
