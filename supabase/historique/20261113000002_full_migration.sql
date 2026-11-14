-- Migration d'origine 20261113000002_full_migration — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- ============================================================
-- Full data migration: everything on Supabase, no more localStorage
-- ============================================================

-- 1. User full state (JSON blob for complete S.me - ensures nothing is lost)
CREATE TABLE IF NOT EXISTS public.user_full_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_full_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own state" ON public.user_full_state FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own state" ON public.user_full_state FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own state" ON public.user_full_state FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_full_state
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Friends system
CREATE TABLE IF NOT EXISTS public.friendships (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);

CREATE POLICY "Users read own friendships" ON public.friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users insert own friendships" ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update friendships involving them" ON public.friendships FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users delete own friendships" ON public.friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 3. User following (separate from friends)
CREATE TABLE IF NOT EXISTS public.user_following (
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id)
);

ALTER TABLE public.user_following ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_following_followed ON public.user_following(followed_id);

CREATE POLICY "Following is publicly readable" ON public.user_following FOR SELECT USING (true);

CREATE POLICY "Users manage own follows" ON public.user_following FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users unfollow" ON public.user_following FOR DELETE USING (auth.uid() = follower_id);

-- 4. Market proposals (user-created markets)
CREATE TABLE IF NOT EXISTS public.market_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  category text NOT NULL,
  close_date date,
  close_time time,
  resolution_source text,
  resolution_rules text,
  initial_probability numeric(5,2) DEFAULT 50,
  votes_for integer DEFAULT 0,
  votes_against integer DEFAULT 0,
  votes_needed integer DEFAULT 10,
  status text DEFAULT 'voting' CHECK (status IN ('voting','approved','rejected','live')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.market_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposals are publicly readable" ON public.market_proposals FOR SELECT USING (true);

CREATE POLICY "Users create proposals" ON public.market_proposals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own proposals" ON public.market_proposals FOR UPDATE USING (auth.uid() = user_id);

-- 5. Watchlist
CREATE TABLE IF NOT EXISTS public.user_watchlist (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, market_id)
);

ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own watchlist" ON public.user_watchlist FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own watchlist" ON public.user_watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove from watchlist" ON public.user_watchlist FOR DELETE USING (auth.uid() = user_id);

-- 6. Market state (live probability, volume, etc. - updated in realtime)
CREATE TABLE IF NOT EXISTS public.market_live_state (
  market_id text PRIMARY KEY,
  current_probability numeric(5,2) DEFAULT 50,
  anchor_probability numeric(5,2) DEFAULT 50,
  volume_total numeric(15,2) DEFAULT 0,
  participants_count integer DEFAULT 0,
  messages_count integer DEFAULT 0,
  heat_level numeric(4,1) DEFAULT 0,
  online_users_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.market_live_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Market state is publicly readable" ON public.market_live_state FOR SELECT USING (true);

CREATE POLICY "Authenticated update market state" ON public.market_live_state FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users update market state" ON public.market_live_state FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 7. Enable Realtime on chat_messages and market_live_state
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

ALTER PUBLICATION supabase_realtime ADD TABLE public.market_live_state;

ALTER PUBLICATION supabase_realtime ADD TABLE public.flash_rounds;

-- 8. Auto-create user_full_state on user creation (update trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_full_state (user_id, state) VALUES (NEW.id, '{}'::jsonb) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Seed markets into markets table
INSERT INTO public.markets (id, category, question, short_question, current_probability, initial_probability, volume_total, participants_count, messages_count, heat_level, close_date, status, resolution_rules, anchor_probability)
VALUES
  ('btc150k', 'Crypto', 'Le Bitcoin dépassera-t-il 150 000 $ avant le 31 décembre ?', 'Bitcoin à 150 000 $', 63, 51, 4200000, 1284, 312, 3.2, '2026-12-31', 'open', 'Ce marché se résout par Oui si le prix du Bitcoin atteint ou dépasse 150 000 $ sur Coinbase (paire BTC-USD) à n''importe quel moment avant le 31 décembre 2026 à 23:59, heure de Paris. Sinon, il se résout par Non.', 63),
  ('clasico', 'Football', 'Le Barça gagnera-t-il le prochain Clásico ?', 'Barça au Clásico', 54, 50, 860000, 1204, 842, 2.6, '2026-11-13', 'open', 'Ce marché se résout par Oui si le FC Barcelone gagne le match dans le temps réglementaire. Un match nul ou une défaite donne Non.', 54),
  ('ia-olympiades', 'Tech et IA', 'Une IA remportera-t-elle l''or aux Olympiades de maths 2027 ?', 'IA aux Olympiades', 72, 63, 1300000, 2310, 518, 2, '2026-11-27', 'open', 'Ce marché se résout par Oui si un système d''IA obtient un score de médaille d''or selon le barème officiel des Olympiades internationales de mathématiques 2027, confirmé par les organisateurs.', 72),
  ('eth6000', 'Crypto', 'Ethereum finira-t-il novembre au-dessus de 6 000 $ ?', 'Ethereum à 6 000 $', 28, 33, 2100000, 3045, 276, 2.2, '2026-11-30', 'open', 'Ce marché se résout par Oui si le prix de clôture d''Ethereum (ETH-USD sur Coinbase) le 30 novembre 2026 à 23:59 est strictement supérieur à 6 000 $.', 28),
  ('box-office', 'Culture', 'Le film le plus vu de 2026 dépassera-t-il 1 milliard $ ?', 'Un film à 1 milliard $', 46, 45, 540000, 688, 94, 1, '2026-12-31', 'open', 'Ce marché se résout par Oui si au moins un film sorti en 2026 dépasse 1 milliard de dollars de recettes mondiales selon Box Office Mojo au 31 décembre 2026.', 46),
  ('neige-noel', 'Météo', 'Neigera-t-il à Paris le jour de Noël ?', 'Neige à Paris à Noël', 17, 19, 210000, 1512, 201, 1.2, '2026-12-25', 'open', 'Ce marché se résout par Oui si Météo-France relève des chutes de neige à la station Paris-Montsouris le 25 décembre 2026.', 17),
  ('bce', 'Économie', 'La BCE baissera-t-elle ses taux en décembre ?', 'Baisse des taux de la BCE', 61, 58, 1800000, 977, 143, 1.4, '2026-12-17', 'open', 'Ce marché se résout par Oui si la Banque centrale européenne annonce une baisse de son taux de dépôt lors de sa réunion de décembre 2026.', 61),
  ('ldc', 'Football', 'Un club français atteindra-t-il les demi-finales de la Ligue des champions ?', 'Un club français en demie', 33, 34, 950000, 1830, 388, 1.6, '2027-04-30', 'open', 'Ce marché se résout par Oui si au moins un club de Ligue 1 se qualifie pour les demi-finales de la Ligue des champions 2026-2027.', 33),
  ('sol-eth', 'Crypto', 'Solana dépassera-t-il Ethereum en volume quotidien cette semaine ?', 'Solana devant Ethereum', 41, 36, 720000, 1102, 167, 1.8, '2026-11-18', 'open', 'Ce marché se résout par Oui si, au moins un jour de la semaine, le volume des plateformes décentralisées de Solana dépasse celui d''Ethereum selon DefiLlama.', 41),
  ('roland-garros', 'Sport', 'Un Français atteindra-t-il la finale de Roland-Garros 2027 ?', 'Un Français en finale à Roland', 23, 21, 390000, 947, 133, 0.9, '2027-06-06', 'open', 'Ce marché se résout par Oui si un joueur français atteint la finale du simple messieurs de Roland-Garros 2027.', 23)
ON CONFLICT (id) DO NOTHING;

-- 10. Seed market groups
INSERT INTO public.market_groups (id, category, question, short_question, close_date, status, resolution_rules, participants_count, messages_count, volume_total, heat_level)
VALUES
  ('presid27', 'Politique', 'Qui remportera l''élection présidentielle française de 2027 ?', 'Présidentielle 2027', '2027-05-09', 'open', 'Ce marché se résout sur le résultat officiel du second tour, tel que proclamé par le Conseil constitutionnel.', 4120, 962, 5356000, 3),
  ('ldc27', 'Football', 'Quelle équipe remportera la Ligue des champions 2026-2027 ?', 'Ligue des champions 2027', '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale de la Ligue des champions de l''UEFA 2026-2027.', 5380, 1410, 6994000, 3.4),
  ('crypto2', 'Crypto', 'Quelle sera la deuxième cryptomonnaie par capitalisation au 31 décembre 2027 ?', '2e crypto fin 2027', '2027-12-31', 'open', 'Ce marché se résout d''après le classement par capitalisation de CoinGecko le 31 décembre 2027 à 23:59 (UTC), stablecoins exclus.', 2210, 388, 2873000, 1.8)
ON CONFLICT (id) DO NOTHING;

-- 11. Seed group outcome markets
INSERT INTO public.markets (id, category, question, short_question, current_probability, initial_probability, volume_total, participants_count, messages_count, heat_level, close_date, status, resolution_rules, group_parent_id, anchor_probability)
VALUES
  -- Présidentielle 2027
  ('presid27-roux', 'Politique', 'Présidentielle 2027 : Camille Roux sera-t-elle élue ?', 'Camille Roux (Présidentielle 2027)', 34, 29, 1819040, 2266, 449, 2.04, '2027-05-09', 'open', 'Ce marché se résout sur le résultat officiel du second tour.', 'presid27', 34),
  ('presid27-lefevre', 'Politique', 'Présidentielle 2027 : Antoine Lefèvre sera-t-il élu ?', 'Antoine Lefèvre (Présidentielle 2027)', 27, 30, 1532480, 2060, 317, 1.41, '2027-05-09', 'open', 'Ce marché se résout sur le résultat officiel du second tour.', 'presid27', 27),
  ('presid27-benali', 'Politique', 'Présidentielle 2027 : Nadia Benali sera-t-elle élue ?', 'Nadia Benali (Présidentielle 2027)', 18, 16, 1070080, 1565, 221, 1.14, '2027-05-09', 'open', 'Ce marché se résout sur le résultat officiel du second tour.', 'presid27', 18),
  ('presid27-moreau', 'Politique', 'Présidentielle 2027 : Julien Moreau sera-t-il élu ?', 'Julien Moreau (Présidentielle 2027)', 12, 14, 878880, 1319, 166, 0.96, '2027-05-09', 'open', 'Ce marché se résout sur le résultat officiel du second tour.', 'presid27', 12),
  ('presid27-autre', 'Politique', 'Présidentielle 2027 : un autre candidat sera-t-il élu ?', 'Autre (Présidentielle 2027)', 9, 11, 770640, 1183, 140, 0.87, '2027-05-09', 'open', 'Ce marché se résout sur le résultat officiel du second tour.', 'presid27', 9),
  -- Ligue des champions
  ('ldc27-real', 'Football', 'Ligue des champions 2027 : le Real Madrid soulèvera-t-il la coupe ?', 'Real Madrid (LdC 2027)', 22, 20, 2098560, 2806, 537, 1.43, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 22),
  ('ldc27-city', 'Football', 'Ligue des champions 2027 : Manchester City soulèvera-t-il la coupe ?', 'Man City (LdC 2027)', 18, 19, 1818840, 2569, 451, 1.29, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 18),
  ('ldc27-psg', 'Football', 'Ligue des champions 2027 : le PSG soulèvera-t-il la coupe ?', 'PSG (LdC 2027)', 15, 13, 1609040, 2380, 388, 1.19, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 15),
  ('ldc27-barca', 'Football', 'Ligue des champions 2027 : le Barça soulèvera-t-il la coupe ?', 'Barça (LdC 2027)', 14, 15, 1539120, 2316, 366, 1.15, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 14),
  ('ldc27-bayern', 'Football', 'Ligue des champions 2027 : le Bayern soulèvera-t-il la coupe ?', 'Bayern (LdC 2027)', 11, 12, 1329400, 2124, 298, 1.04, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 11),
  ('ldc27-liverpool', 'Football', 'Ligue des champions 2027 : Liverpool soulèvera-t-il la coupe ?', 'Liverpool (LdC 2027)', 9, 10, 1189600, 1997, 254, 0.97, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 9),
  ('ldc27-autre', 'Football', 'Ligue des champions 2027 : une autre équipe soulèvera-t-elle la coupe ?', 'Autre (LdC 2027)', 11, 11, 1329400, 2124, 298, 1.04, '2027-06-05', 'open', 'Ce marché se résout sur le vainqueur officiel de la finale.', 'ldc27', 11),
  -- Crypto 2
  ('crypto2-eth', 'Crypto', 'Ethereum sera-t-il encore la 2e crypto fin 2027 ?', 'Ethereum (2e crypto)', 61, 64, 2174530, 1815, 254, 1.46, '2027-12-31', 'open', 'Ce marché se résout d''après le classement CoinGecko.', 'crypto2', 61),
  ('crypto2-sol', 'Crypto', 'Solana sera-t-il la 2e crypto fin 2027 ?', 'Solana (2e crypto)', 19, 16, 1290870, 1293, 143, 0.7, '2027-12-31', 'open', 'Ce marché se résout d''après le classement CoinGecko.', 'crypto2', 19),
  ('crypto2-xrp', 'Crypto', 'XRP sera-t-il la 2e crypto fin 2027 ?', 'XRP (2e crypto)', 9, 10, 977870, 992, 91, 0.34, '2027-12-31', 'open', 'Ce marché se résout d''après le classement CoinGecko.', 'crypto2', 9),
  ('crypto2-bnb', 'Crypto', 'BNB sera-t-il la 2e crypto fin 2027 ?', 'BNB (2e crypto)', 6, 5, 890370, 906, 74, 0.22, '2027-12-31', 'open', 'Ce marché se résout d''après le classement CoinGecko.', 'crypto2', 6),
  ('crypto2-autre', 'Crypto', 'Une autre crypto sera-t-elle la 2e fin 2027 ?', 'Autre (2e crypto)', 5, 5, 861120, 877, 68, 0.18, '2027-12-31', 'open', 'Ce marché se résout d''après le classement CoinGecko.', 'crypto2', 5)
ON CONFLICT (id) DO NOTHING;

-- 12. Seed market_live_state for all markets
INSERT INTO public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, messages_count, heat_level, online_users_count)
SELECT id, current_probability, anchor_probability, volume_total, participants_count, messages_count, heat_level, 0
FROM public.markets
ON CONFLICT (market_id) DO NOTHING;

-- 13. Seed market outcomes
INSERT INTO public.market_outcomes (id, group_id, market_id, label, question, current_probability, initial_probability, volume, participants_count)
VALUES
  ('presid27-roux', 'presid27', 'presid27-roux', 'Camille Roux', 'Présidentielle 2027 : Camille Roux sera-t-elle élue ?', 34, 29, 1819040, 2266),
  ('presid27-lefevre', 'presid27', 'presid27-lefevre', 'Antoine Lefèvre', 'Présidentielle 2027 : Antoine Lefèvre sera-t-il élu ?', 27, 30, 1532480, 2060),
  ('presid27-benali', 'presid27', 'presid27-benali', 'Nadia Benali', 'Présidentielle 2027 : Nadia Benali sera-t-elle élue ?', 18, 16, 1070080, 1565),
  ('presid27-moreau', 'presid27', 'presid27-moreau', 'Julien Moreau', 'Présidentielle 2027 : Julien Moreau sera-t-il élu ?', 12, 14, 878880, 1319),
  ('presid27-autre', 'presid27', 'presid27-autre', 'Un autre candidat', 'Présidentielle 2027 : un autre candidat sera-t-il élu ?', 9, 11, 770640, 1183),
  ('ldc27-real', 'ldc27', 'ldc27-real', 'Real Madrid', 'LdC 2027 : le Real Madrid soulèvera-t-il la coupe ?', 22, 20, 2098560, 2806),
  ('ldc27-city', 'ldc27', 'ldc27-city', 'Manchester City', 'LdC 2027 : Manchester City soulèvera-t-il la coupe ?', 18, 19, 1818840, 2569),
  ('ldc27-psg', 'ldc27', 'ldc27-psg', 'Paris Saint-Germain', 'LdC 2027 : le PSG soulèvera-t-il la coupe ?', 15, 13, 1609040, 2380),
  ('ldc27-barca', 'ldc27', 'ldc27-barca', 'FC Barcelone', 'LdC 2027 : le Barça soulèvera-t-il la coupe ?', 14, 15, 1539120, 2316),
  ('ldc27-bayern', 'ldc27', 'ldc27-bayern', 'Bayern Munich', 'LdC 2027 : le Bayern soulèvera-t-il la coupe ?', 11, 12, 1329400, 2124),
  ('ldc27-liverpool', 'ldc27', 'ldc27-liverpool', 'Liverpool', 'LdC 2027 : Liverpool soulèvera-t-il la coupe ?', 9, 10, 1189600, 1997),
  ('ldc27-autre', 'ldc27', 'ldc27-autre', 'Une autre équipe', 'LdC 2027 : une autre équipe soulèvera-t-elle la coupe ?', 11, 11, 1329400, 2124),
  ('crypto2-eth', 'crypto2', 'crypto2-eth', 'Ethereum', 'Ethereum sera-t-il encore la 2e crypto fin 2027 ?', 61, 64, 2174530, 1815),
  ('crypto2-sol', 'crypto2', 'crypto2-sol', 'Solana', 'Solana sera-t-il la 2e crypto fin 2027 ?', 19, 16, 1290870, 1293),
  ('crypto2-xrp', 'crypto2', 'crypto2-xrp', 'XRP', 'XRP sera-t-il la 2e crypto fin 2027 ?', 9, 10, 977870, 992),
  ('crypto2-bnb', 'crypto2', 'crypto2-bnb', 'BNB', 'BNB sera-t-il la 2e crypto fin 2027 ?', 6, 5, 890370, 906),
  ('crypto2-autre', 'crypto2', 'crypto2-autre', 'Une autre crypto', 'Une autre crypto sera-t-elle la 2e fin 2027 ?', 5, 5, 861120, 877)
ON CONFLICT (id) DO NOTHING;

-- 14. Insert user_full_state into the new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_full_state (user_id, state) VALUES (NEW.id, '{}'::jsonb) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
