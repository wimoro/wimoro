-- Partager une mise dans une conversation privée, en mode Compte.
--
-- Règles (celles du partage dans un salon, js/views.js) : rang Bronze, une position ouverte, 5 XP, une fois par 24 heures
-- et par position ; l'ami peut « suivre cette mise » (rang Argent, même position) : 20 XP pour l'auteur.
-- Précisions du mode Compte :
--  · le salon est la conversation avec un ami (« dm:<identifiant de l'ami> ») : mêmes conditions qu'un message privé
--    (amis, rang Bronze) ; la carte n'est poussée qu'à lui, sur son sujet privé, avec la notification habituelle ;
--  · aucun joueur simulé ne suit une mise partagée en privé ;
--  · seul l'autre participant, s'il est toujours ami, peut la suivre ; le compteur n'est alors envoyé qu'aux deux
--    participants, chacun sur son sujet privé.
-- Rien n'est supprimé.

-- ── Un suivi crédité : le compteur part vers le salon, ou vers les deux participants d'une conversation privée ──
create or replace function wm.chat_suivi_crediter(p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare x wm.chat_suivis; m public.chat_messages; v_n integer;
begin
  select * into x from wm.chat_suivis c where c.id = p_id and c.fait_at is null for update skip locked;
  if not found then return false; end if;
  select * into m from public.chat_messages c where c.id = x.message_id;
  if not found or m.message_type <> 'bet' then return false; end if;
  perform 1 from public.user_stats where user_id = m.user_id for update skip locked;
  if not found then return false; end if;
  update wm.chat_suivis set fait_at = now() where id = x.id;
  update public.chat_messages set followers_count = coalesce(followers_count, 0) + 1 where id = m.id returning followers_count into v_n;
  update public.user_stats set followed_bets_count = coalesce(followed_bets_count, 0) + 1 where user_id = m.user_id;
  perform wm.xp_add(m.user_id, 20, 'mise_suivie');
  perform wm.badges_check(m.user_id);
  perform wm.notify_direct(m.user_id, 'users', 'mise_suivie',
    jsonb_build_object('u', x.user_id, 'n', (select u.username from public.users u where u.id = x.user_id), 'm', m.bet_ref ->> 'm', 'id', m.id,
                       'room', case when m.room_id like 'dm:%' then 'dm:' || x.user_id::text else m.room_id end),
    case when m.room_id like 'm:%' then '#marche-' || substr(m.room_id, 3) else '#chat' end);
  if m.room_id like 'dm:%' then                                                    -- u : l'autre participant, vu par le destinataire
    perform realtime.send(jsonb_build_object('id', m.id, 'fc', v_n, 'u', x.user_id), 'fc', 'joueur:' || m.user_id::text, true);
    perform realtime.send(jsonb_build_object('id', m.id, 'fc', v_n, 'u', m.user_id), 'fc', 'joueur:' || x.user_id::text, true);
  else
    perform wm.chat_diffuser(m.room_id, 'fc', jsonb_build_object('id', m.id, 'fc', v_n));
  end if;
  return true;
end $$;

-- ── Partager une de ses positions : dans un salon, ou à un ami en privé ──
create or replace function wm.chat_share(p_room text, p_market text, p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); s public.user_stats; pos public.positions; m public.chat_messages; v_tier integer; v_n integer; v_bot uuid; v_quand timestamptz;
  v_ami uuid; v_salon text := p_room; v_moi text;
begin
  if coalesce(p_room, '') like 'dm:%' then                                         -- conversation privée : un ami, comme pour un message
    if substr(p_room, 4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform wm.fail('salon_indisponible'); end if;
    v_ami := substr(p_room, 4)::uuid;
    perform wm.dm_garde(v_uid, v_ami, true);
    v_salon := wm.dm_salon(v_uid, v_ami);
  else
    perform wm.chat_salon(p_room);
  end if;
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 1 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Bronze
  select * into pos from public.positions p where p.user_id = v_uid and p.market_id = p_market and p.side = p_side and p.shares > 0.05;
  if not found then perform wm.fail('position_absente'); end if;
  select max(c.created_at) into v_quand from public.chat_messages c where c.user_id = v_uid;
  if v_quand > now() - interval '1 second' then perform wm.fail('trop_vite'); end if;
  if exists (select 1 from public.chat_messages c where c.user_id = v_uid and c.message_type = 'bet' and c.bet_ref ->> 'm' = p_market and c.bet_ref ->> 's' = p_side
             and c.created_at > now() - interval '24 hours') then perform wm.fail('deja_partage'); end if;

  if v_ami is null then perform wm.chat_salon_creer(p_room);
  else insert into public.chat_rooms (id, name, kind) values (v_salon, 'Privé', 'dm') on conflict (id) do nothing;
  end if;
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, followers_count, source)
  values (v_salon, v_uid, 'bet', '', jsonb_build_object('m', p_market, 's', p_side, 'amt', round(pos.shares * pos.average_price / 100), 'price', round(pos.average_price)), 0, 'joueur')
  returning * into m;
  perform wm.xp_add(v_uid, 5, 'partage');
  perform wm.badges_check(v_uid);

  if v_ami is not null then
    -- au destinataire seulement : son sujet privé ; et une notification s'il n'en a pas déjà une, non lue, de cet expéditeur
    perform realtime.send(wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)), 'dm', 'joueur:' || v_ami::text, true);
    if not exists (select 1 from public.notifications x where x.user_id = v_ami and x.code = 'dm_recu' and x.params ->> 'u' = v_uid::text
                   and not coalesce(x.is_read, false) and x.deleted_at is null) then
      select username into v_moi from public.users where id = v_uid;
      perform wm.notify(v_ami, 'send', 'dm_recu', jsonb_build_object('u', v_uid, 'n', v_moi), '#chat');
    end if;
    return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
  end if;

  v_n := 1 + abs(hashtext(m.id::text)::bigint) % 3;                              -- un à trois joueurs la suivront, comme dans la démo
  for i in 0..v_n - 1 loop
    select u.id into v_bot from public.users u where coalesce(u.is_demo, false)
      and not exists (select 1 from wm.chat_suivis c where c.message_id = m.id and c.user_id = u.id) order by random() limit 1;
    exit when v_bot is null;
    insert into wm.chat_suivis (message_id, user_id, du_at) values (m.id, v_bot, now() + make_interval(secs => 4 + i * 5.2 + random() * 3.5)) on conflict do nothing;
  end loop;

  perform wm.chat_diffuser(p_room, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $$;

-- ── Suivre une mise partagée : avec l'accès à son salon, ou en étant l'autre participant (et l'ami) de la conversation ──
create or replace function wm.chat_follow(p_msg bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); s public.user_stats; m public.chat_messages; v_tier integer; v_id bigint; v_acces boolean;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 2 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Argent
  select * into m from public.chat_messages c where c.id = p_msg and c.message_type = 'bet' and c.source = 'joueur';
  if not found or m.user_id = v_uid then perform wm.fail('mise_indisponible'); end if;
  if m.room_id like 'dm:%' then
    v_acces := m.room_id = wm.dm_salon(v_uid, m.user_id)
      and exists (select 1 from public.friendships f where f.status = 'accepted'
                  and ((f.user_id = v_uid and f.friend_id = m.user_id) or (f.user_id = m.user_id and f.friend_id = v_uid)));
  else
    v_acces := wm.chat_salon_ok(m.room_id);
  end if;
  if not coalesce(v_acces, false) then perform wm.fail('mise_indisponible'); end if;
  if not exists (select 1 from public.positions p where p.user_id = v_uid and p.market_id = m.bet_ref ->> 'm' and p.side = m.bet_ref ->> 's' and p.shares > 0.05) then
    perform wm.fail('position_absente');
  end if;
  insert into wm.chat_suivis (message_id, user_id) values (p_msg, v_uid) on conflict do nothing returning id into v_id;
  if v_id is null then perform wm.fail('deja_suivi'); end if;
  perform wm.chat_suivi_crediter(v_id);                                          -- si l'auteur est occupé, la tâche le créditera dans 5 secondes
  perform wm.xp_add(v_uid, 5, 'suivre');
  return wm.reponse(v_uid, jsonb_build_object('id', p_msg, 'fc', (select coalesce(c.followers_count, 0) from public.chat_messages c where c.id = p_msg)));
end $$;

select wm.droits();
