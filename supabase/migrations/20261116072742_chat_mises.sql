-- Partager une mise dans le chat, et la suivre, en mode Compte.
--
-- Règles du mode Démo, tenues par le serveur : à partir du rang Bronze, un joueur partage une de ses positions dans un
-- salon (+5 XP) ; elle apparaît comme une carte. Dans les secondes qui suivent, un à trois joueurs (des bots) la suivent,
-- et chaque suivi rapporte 20 XP à son auteur et compte pour ses rangs (« mises suivies »). À partir du rang Argent, un
-- vrai joueur peut la suivre aussi : il lui faut une position sur le même marché et le même côté (+5 XP pour lui).
-- Bornes techniques : une même position se partage une fois par 24 heures ; on ne suit une mise qu'une fois.
-- Les suivis des bots sont programmés à l'avance et crédités par la tâche wm-suivis (toutes les 5 secondes).

create table if not exists wm.chat_suivis (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,     -- celui qui suit : un bot, ou un joueur
  du_at timestamptz not null default now(),
  fait_at timestamptz,
  unique (message_id, user_id)
);
alter table wm.chat_suivis enable row level security;
revoke all on wm.chat_suivis from public, anon, authenticated;
create index if not exists chat_suivis_dus on wm.chat_suivis (du_at) where fait_at is null;

-- Un message du chat : une mise partagée porte sa carte (marché, côté, montant, prix) et son nombre de suivis.
create or replace function wm.chat_json(m public.chat_messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', coalesce(m.message_type, 'msg'), 'text', coalesce(m.text_content, ''),
    'at', (extract(epoch from m.created_at) * 1000)::bigint)
    || case when m.message_type = 'bet' then jsonb_build_object('bet', m.bet_ref, 'fc', coalesce(m.followers_count, 0)) else '{}'::jsonb end
$$;

-- ── Créditer un suivi : +1 sur la carte, 20 XP et une « mise suivie » de plus pour l'auteur ──
-- L'auteur occupé n'est pas attendu : le suivi reste dû et la tâche le reprend 5 secondes plus tard.
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
    jsonb_build_object('u', x.user_id, 'n', (select u.username from public.users u where u.id = x.user_id), 'm', m.bet_ref ->> 'm', 'id', m.id, 'room', m.room_id),
    case when m.room_id like 'm:%' then '#marche-' || substr(m.room_id, 3) else '#chat' end);
  perform realtime.send(jsonb_build_object('id', m.id, 'fc', v_n), 'fc', 'salon:' || m.room_id, false);
  return true;
end $$;

create or replace function wm.chat_suivis_tick() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select c.id from wm.chat_suivis c where c.fait_at is null and c.du_at <= now() order by c.du_at limit 200 loop
    begin
      if wm.chat_suivi_crediter(r.id) then n := n + 1; end if;
    exception when others then raise warning 'suivi % non crédité : %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

-- ── Partager une de ses positions dans un salon ──
create or replace function wm.chat_share(p_room text, p_market text, p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); s public.user_stats; pos public.positions; m public.chat_messages; v_tier integer; v_n integer; v_bot uuid; v_quand timestamptz;
begin
  perform wm.chat_salon(p_room);
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

  insert into public.chat_rooms (id, name, kind, market_id)
  values (p_room, case when p_room like 'm:%' then '#' || substr(p_room, 3) else 'Général' end,
          case when p_room like 'm:%' then 'market' else 'global' end, case when p_room like 'm:%' then substr(p_room, 3) end)
  on conflict (id) do nothing;
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, followers_count, source)
  values (p_room, v_uid, 'bet', '', jsonb_build_object('m', p_market, 's', p_side, 'amt', round(pos.shares * pos.average_price / 100), 'price', round(pos.average_price)), 0, 'joueur')
  returning * into m;
  perform wm.xp_add(v_uid, 5, 'partage');
  perform wm.badges_check(v_uid);

  v_n := 1 + abs(hashtext(m.id::text)) % 3;                                      -- un à trois joueurs la suivront, comme dans la démo
  for i in 0..v_n - 1 loop
    select u.id into v_bot from public.users u where coalesce(u.is_demo, false)
      and not exists (select 1 from wm.chat_suivis c where c.message_id = m.id and c.user_id = u.id) order by random() limit 1;
    exit when v_bot is null;
    insert into wm.chat_suivis (message_id, user_id, du_at) values (m.id, v_bot, now() + make_interval(secs => 4 + i * 5.2 + random() * 3.5)) on conflict do nothing;
  end loop;

  perform realtime.send(wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)), 'msg', 'salon:' || p_room, false);
  return wm.reponse(v_uid, jsonb_build_object('msg', wm.chat_json(m)));
end $$;

-- ── Suivre la mise partagée par un autre joueur (après avoir parié comme lui) ──
create or replace function wm.chat_follow(p_msg bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); s public.user_stats; m public.chat_messages; v_tier integer; v_id bigint;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 2 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Argent
  select * into m from public.chat_messages c where c.id = p_msg and c.message_type = 'bet' and c.source = 'joueur';
  if not found or m.user_id = v_uid then perform wm.fail('mise_indisponible'); end if;
  if not exists (select 1 from public.positions p where p.user_id = v_uid and p.market_id = m.bet_ref ->> 'm' and p.side = m.bet_ref ->> 's' and p.shares > 0.05) then
    perform wm.fail('position_absente');
  end if;
  insert into wm.chat_suivis (message_id, user_id) values (p_msg, v_uid) on conflict do nothing returning id into v_id;
  if v_id is null then perform wm.fail('deja_suivi'); end if;
  perform wm.chat_suivi_crediter(v_id);                                          -- si l'auteur est occupé, la tâche le créditera dans 5 secondes
  perform wm.xp_add(v_uid, 5, 'suivre');
  return wm.reponse(v_uid, jsonb_build_object('id', p_msg, 'fc', (select coalesce(c.followers_count, 0) from public.chat_messages c where c.id = p_msg)));
end $$;

create or replace function public.api_chat_share(p_room text, p_market text, p_side text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.chat_share(p_room, p_market, p_side) $$;
create or replace function public.api_chat_follow(p_msg bigint) returns jsonb language sql security invoker set search_path = '' as $$ select wm.chat_follow(p_msg) $$;

select cron.schedule('wm-suivis', '5 seconds', 'select wm.chat_suivis_tick()');

select wm.droits();
