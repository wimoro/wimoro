-- Migration d'origine 20261113000005_fix_chat_rooms — telle qu'enregistrée dans supabase_migrations.schema_migrations.
-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.

-- Create chat rooms for all markets
INSERT INTO public.chat_rooms (id, name, kind, market_id)
SELECT 'm:' || id, '#' || id, 'market', id
FROM public.markets
ON CONFLICT (id) DO NOTHING;

-- Also fix bot_chat_activity to only use existing rooms
CREATE OR REPLACE FUNCTION public.bot_chat_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;
