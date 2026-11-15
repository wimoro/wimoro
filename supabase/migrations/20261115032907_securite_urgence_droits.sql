-- Urgence sécurité (audit K01 à K13). Ferme les trous sans changer le comportement des fonctions d'action.
--
--  1. Les e-mails ne sont plus lisibles par l'API (K01).
--  2. Les fonctions internes (administration, bots, règlements) ne sont plus appelables par les clients (K02, K05, K07).
--  3. Les clients ne peuvent plus écrire directement dans les tables d'argent, de jeu et de social (K04, K06, K10).
--  4. Les salons de chat privés et de clan ne sont lisibles que par leurs membres (K09).
--  5. L'XP d'amitié n'est donnée que si une demande est réellement acceptée (K08).
--  6. Chat : longueur, salon autorisé, fréquence et plafond d'XP contrôlés par le serveur (K13).
--  7. search_path fixé sur toutes les fonctions (K12) ; droits par défaut resserrés pour les objets futurs.
--
-- Partie 1 sur 2 : droits et fonctions. Rien n'est supprimé ici. Le nettoyage des policies devenues
-- sans objet et de la publication temps réel est dans « securite_urgence_nettoyage ».
--
-- Effet connu sur l'ancien front (encore en ligne tant que la nouvelle version n'est pas livrée) :
-- la connexion par PSEUDO ne marche plus (elle lisait la colonne e-mail avec la clé publique). La connexion par e-mail marche.

-- ── 1 et 3. Droits sur les tables ───────────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;           -- la RLS filtre les lignes

-- Profil : seules les colonnes publiques sont lisibles ; l'e-mail ne sort plus (le client le connaît par sa session).
revoke select on public.users from anon, authenticated;
grant select (id, username, avatar_photo, avatar_color, bio, is_demo, created_at) on public.users to anon, authenticated;
grant update (username, avatar_photo, avatar_color, bio) on public.users to authenticated;

-- Vue d'administration : plus aucun accès par l'API, et elle respecte désormais la RLS.
revoke all on public.admin_players_view from anon, authenticated;
alter view public.admin_players_view set (security_invoker = true);

-- Seules écritures directes encore permises au joueur connecté, sur ses propres lignes (RLS) :
grant insert, update on public.user_full_state, public.user_preferences to authenticated;   -- préférences d'interface
grant insert, delete on public.user_following, public.user_watchlist to authenticated;      -- suivre un joueur, un marché

-- Les mises à jour restantes ne peuvent pas changer le propriétaire de la ligne.
alter policy "Users can update own profile" on public.users with check ((select auth.uid()) = id);
alter policy "Users update own state" on public.user_full_state with check ((select auth.uid()) = user_id);
alter policy "Users update own preferences" on public.user_preferences with check ((select auth.uid()) = user_id);

-- ── 4. Chat : lecture des salons publics, et du salon de son clan ──────────────────────────────
-- La policy existante (« tout le monde lit tout ») est resserrée puis renommée.
alter policy "Chat messages are publicly readable" on public.chat_messages
  using (
    room_id in ('general', 'vip', 'blitz')
    or room_id like 'm:%'
    or exists (
      select 1 from public.clan_members cm
      where cm.user_id = (select auth.uid()) and chat_messages.room_id = 'clan:' || cm.clan_id::text
    )
  );
alter policy "Chat messages are publicly readable" on public.chat_messages rename to "Lecture des salons publics et de son clan";

create or replace function public.get_chat_history(p_room_id text, p_limit integer default 50)
 returns table(id bigint, room_id text, username text, avatar_color text, message_type text, text_content text, reactions jsonb, created_at timestamp with time zone)
 language sql stable security definer
 set search_path = public, pg_temp
as $function$
  select cm.id, cm.room_id, u.username, u.avatar_color, cm.message_type, cm.text_content, cm.reactions, cm.created_at
  from public.chat_messages cm
  join public.users u on u.id = cm.user_id
  where cm.room_id = p_room_id
    and (
      p_room_id in ('general', 'vip', 'blitz')
      or p_room_id like 'm:%'
      or exists (select 1 from public.clan_members m where m.user_id = auth.uid() and p_room_id = 'clan:' || m.clan_id::text)
    )
  order by cm.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$function$;

-- ── 6. Envoi d'un message : contrôles côté serveur ─────────────────────────────────────────────
create or replace function public.send_chat_message(p_room_id text, p_text text, p_type text default 'msg'::text)
 returns jsonb
 language plpgsql security definer
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_text text := trim(coalesce(p_text, ''));
  v_msg_id bigint;
  v_username text;
  v_today integer;
  v_gain integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if length(v_text) = 0 then raise exception 'Empty message'; end if;
  if length(v_text) > 280 then raise exception 'Message too long'; end if;
  if not (
    p_room_id in ('general', 'vip', 'blitz')
    or p_room_id like 'm:%'
    or exists (select 1 from public.clan_members m where m.user_id = v_uid and p_room_id = 'clan:' || m.clan_id::text)
  ) then
    raise exception 'Room not allowed';
  end if;
  -- anti-spam : 5 messages au plus par tranche de 10 secondes
  if (select count(*) from public.chat_messages where user_id = v_uid and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Too many messages';
  end if;

  select username into v_username from public.users where id = v_uid;

  -- un client ne peut publier que des messages ordinaires (les cartes et événements viennent du serveur)
  insert into public.chat_messages (room_id, user_id, message_type, text_content)
  values (p_room_id, v_uid, 'msg', v_text)
  returning id into v_msg_id;

  -- +2 XP par message, 20 XP par jour au plus
  select case when chat_last_date = current_date then coalesce(chat_xp_today, 0) else 0 end into v_today
  from public.user_stats where user_id = v_uid for update;
  v_gain := least(2, greatest(0, 20 - coalesce(v_today, 0)));
  update public.user_stats set
    messages_total = messages_total + 1,
    xp = xp + v_gain,
    chat_xp_today = coalesce(v_today, 0) + v_gain,
    chat_last_date = current_date
  where user_id = v_uid;

  return jsonb_build_object('id', v_msg_id, 'username', v_username, 'xp_gain', v_gain);
end;
$function$;

-- ── 5. Amitié : pas d'XP sans demande réellement acceptée ──────────────────────────────────────
create or replace function public.accept_friend_request(p_from_user_id uuid)
 returns jsonb
 language plpgsql security definer
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.friendships set status = 'accepted'
  where user_id = p_from_user_id and friend_id = v_uid and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('status', 'none');
  end if;
  update public.user_stats set xp = xp + 15 where user_id in (v_uid, p_from_user_id);
  return jsonb_build_object('status', 'accepted');
end;
$function$;

-- ── 2 et 7. Fonctions : search_path fixé, et qui a le droit d'appeler quoi ─────────────────────
do $$
declare
  f record;
  -- jamais appelées par un client : administration, bots, règlements, aides internes
  interne text[] := array[
    'admin_adjust_balance','admin_balance_history','admin_ban_user','admin_get_player','admin_set_balance',
    'admin_set_player','admin_set_rank','admin_top_players',
    'bot_chat_activity','bot_flash_activity','bot_market_make','bot_social_activity','bot_tick',
    'flash_settle_round','flash_tick_server','settle_market',
    'grant_xp','progress_mission','create_notification','_post_bet_hook',
    'book_depth','wm_fee_rate','eng_constants'];
  -- utiles aussi à un visiteur non connecté
  visiteur text[] := array['get_markets','get_leaderboard','get_clans','get_clan_members','get_chat_history',
    'newsletter_subscribe','newsletter_unsubscribe'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, (p.prorettype = 'trigger'::regtype) as is_trigger
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.is_trigger or f.proname = any(interne) then continue; end if;
    execute format('grant execute on function %s to authenticated', f.sig);
    if f.proname = any(visiteur) then execute format('grant execute on function %s to anon', f.sig); end if;
  end loop;
end $$;

-- ── Objets futurs : rien n'est accordé d'office aux clients ────────────────────────────────────
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;
