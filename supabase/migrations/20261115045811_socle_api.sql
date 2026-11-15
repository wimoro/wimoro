-- Socle de la nouvelle API (lot 1) : schéma privé, état du joueur, comptes, préférences, notifications.
--
-- Principes (voir docs/BACKEND.md) :
--   * Le client n'appelle que des fonctions « api_* » du schéma public. Ce sont des enveloppes d'une ligne,
--     SECURITY INVOKER, qui délèguent à la logique rangée dans le schéma privé « wm ».
--   * Le schéma « wm » n'est pas exposé par l'API : ses fonctions sont SECURITY DEFINER, search_path vide,
--     et n'accordent EXECUTE qu'aux rôles qui en ont besoin.
--   * Une erreur métier est une exception dont le message est un code stable (« session », « pseudo_pris »…).
--   * Toute fonction qui modifie quelque chose renvoie { me: {…état à jour…}, ev: [événements à afficher] }.
--   * Rien n'est supprimé : une notification effacée est seulement marquée.

create schema if not exists wm;
revoke all on schema wm from public;
grant usage on schema wm to anon, authenticated, service_role;

-- ── Aides ───────────────────────────────────────────────────────────────────────────────────────
create or replace function wm.fail(p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

create or replace function wm.uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'session' using errcode = 'P0001'; end if;
  return v;
end $$;

-- File d'événements de la transaction en cours (XP gagnée, notification, badge…) : les aides y déposent
-- ce que l'interface devra afficher, la fonction appelée la vide dans sa réponse.
create or replace function wm.ev(p_event jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('wm.ev', (coalesce(nullif(current_setting('wm.ev', true), ''), '[]')::jsonb || jsonb_build_array(p_event))::text, true);
end $$;

create or replace function wm.ev_take() returns jsonb
language plpgsql set search_path = '' as $$
declare v jsonb := coalesce(nullif(current_setting('wm.ev', true), ''), '[]')::jsonb;
begin
  perform set_config('wm.ev', '[]', true);
  return v;
end $$;

-- ── Colonnes ajoutées ───────────────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists interests text[] not null default '{}',
  add column if not exists welcome_bonus boolean not null default false,
  add column if not exists is_public boolean not null default true,
  add column if not exists kyc_at timestamptz,
  add column if not exists is_test boolean not null default false,
  add column if not exists rank_seen smallint not null default 0;

-- Un pseudo est unique sans tenir compte de la casse, et n'utilise que lettres, chiffres, point et tiret bas.
create unique index if not exists users_username_lower_key on public.users (lower(username));
alter table public.users add constraint users_username_format check (username ~ '^[A-Za-z0-9._]{3,20}$');

alter table public.notifications
  add column if not exists code text,
  add column if not exists params jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz;
alter table public.notifications alter column text set default '';
create index if not exists idx_notifications_user_recent on public.notifications (user_id, created_at desc) where deleted_at is null;

alter table public.missions
  add column if not exists code text;
create unique index if not exists missions_user_code_key on public.missions (user_id, code) where code is not null;

-- Préférences d'interface du joueur (mode d'affichage, alertes, dessins du Mode Pro…) : un petit document
-- que seul son propriétaire lit et écrit, par les fonctions api_state et api_prefs_save.
create table if not exists wm.user_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_prefs_taille check (pg_column_size(prefs) <= 262144)
);
alter table wm.user_prefs enable row level security;

-- ── Rang : même calcul que le front (core.js, rankFrom) ─────────────────────────────────────────
create or replace function wm.rank_of(p_xp integer, p_settled integer, p_wins integer, p_deposits integer, p_flash_wins integer, p_followed integer, p_pos integer, out t integer, out d integer)
language plpgsql immutable set search_path = '' as $$
declare
  -- seuils d'XP des 3 divisions de chaque rang (DIV_XP), Fer → Radiant
  seuils integer[] := array[0,100,200, 300,450,600, 800,1000,1200, 1450,1700,1950, 2250,2550,2850, 3200,3600,4000, 4500,5000,5500, 6100,6700,7300, 8000,8000,8000];
  xp integer := coalesce(p_xp, 0);
  settled integer := coalesce(p_settled, 0);
  acc integer := round(coalesce(p_wins, 0)::numeric / greatest(1, coalesce(p_settled, 0)) * 100);
  ok boolean;
begin
  t := 0;
  for i in 1..8 loop
    ok := xp >= seuils[i * 3 + 1] and case i
      when 1 then settled >= 3
      when 2 then settled >= 10 and coalesce(p_deposits, 0) >= 1
      when 3 then settled >= 25 and acc >= 50
      when 4 then settled >= 60 and acc >= 55 and coalesce(p_flash_wins, 0) >= 3
      when 5 then settled >= 120 and acc >= 57 and coalesce(p_followed, 0) >= 25
      when 6 then settled >= 200 and acc >= 58 and coalesce(p_followed, 0) >= 100
      when 7 then settled >= 320 and acc >= 60 and coalesce(p_followed, 0) >= 300
      else coalesce(p_pos, 999999) <= 100
    end;
    exit when not ok;
    t := i;
  end loop;
  d := 0;
  if t < 8 then
    if xp >= seuils[t * 3 + 2] then d := 1; end if;
    if xp >= seuils[t * 3 + 3] then d := 2; end if;
  end if;
end $$;

-- ── Notifications : un code et des paramètres, traduits chez le lecteur ─────────────────────────
create or replace function wm.notify(p_user uuid, p_icon text, p_code text, p_params jsonb default '{}'::jsonb, p_href text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_at timestamptz;
begin
  insert into public.notifications (user_id, icon, text, code, params, href)
  values (p_user, p_icon, '', p_code, coalesce(p_params, '{}'::jsonb), coalesce(p_href, ''))
  returning id, created_at into v_id, v_at;
  if p_user = auth.uid() then
    perform wm.ev(jsonb_build_object('k', 'notif', 'n', jsonb_build_object(
      'id', v_id, 'ic', p_icon, 'code', p_code, 'p', coalesce(p_params, '{}'::jsonb), 'href', coalesce(p_href, ''),
      'at', (extract(epoch from v_at) * 1000)::bigint, 'read', false)));
  end if;
end $$;

-- Recalcule le rang enregistré d'un joueur (affiché aux autres) ; prévient s'il a monté.
create or replace function wm.rank_refresh(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.user_stats; r record;
begin
  select * into s from public.user_stats where user_id = p_user for update;
  if not found then return; end if;
  select * into r from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position);
  if r.t is distinct from s.rank_tier or r.d is distinct from s.rank_division then
    update public.user_stats set rank_tier = r.t, rank_division = r.d where user_id = p_user;
    if r.t * 3 + r.d > coalesce(s.rank_tier, 0) * 3 + coalesce(s.rank_division, 0) then
      perform wm.notify(p_user, 'trophy', 'rank_up', jsonb_build_object('t', r.t, 'd', r.d), '#rang');
    end if;
  end if;
end $$;

create or replace function wm.xp_add(p_user uuid, p_amount integer, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_amount, 0) <= 0 then return; end if;
  update public.user_stats set xp = xp + p_amount where user_id = p_user;
  if p_user = auth.uid() then perform wm.ev(jsonb_build_object('k', 'xp', 'n', p_amount, 'src', p_source)); end if;
  perform wm.rank_refresh(p_user);
end $$;

-- ── Missions de départ (les mêmes que dans la démo : premier dépôt, première manche, premier message) ──
create or replace function wm.missions_init(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.missions (user_id, mission_type, label, code, goal_value, xp_reward, action_href)
  values (p_user, 'dep', 'dep1', 'dep1', 1, 100, '#depot'),
         (p_user, 'flashbet', 'fb1', 'fb1', 1, 50, '#eclair'),
         (p_user, 'chat', 'chat1', 'chat1', 1, 20, '#chat')
  on conflict do nothing;
end $$;

create or replace function wm.mission_progress(p_user uuid, p_type text, p_n integer default 1) returns void
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in
    update public.missions set current_progress = least(goal_value, current_progress + p_n)
    where user_id = p_user and code is not null and mission_type = p_type and not is_claimed and current_progress < goal_value
    returning code, current_progress, goal_value, xp_reward
  loop
    if p_user = auth.uid() then
      perform wm.ev(jsonb_build_object('k', 'mission', 'id', m.code, 'have', m.current_progress, 'goal', m.goal_value, 'xp', m.xp_reward));
    end if;
    if m.current_progress >= m.goal_value then
      perform wm.notify(p_user, 'gift', 'mission_done', jsonb_build_object('id', m.code, 'xp', m.xp_reward), '#rang');
    end if;
  end loop;
end $$;

-- ── Badges : mêmes conditions que le front (core.js, BADGES) ────────────────────────────────────
create or replace function wm.badges_check(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.user_stats; b record;
begin
  select * into s from public.user_stats where user_id = p_user;
  if not found then return; end if;
  for b in
    select x.id from (values
      ('first', s.bets_placed >= 1), ('streak7', s.streak_best >= 7), ('contra', coalesce(s.contra_wins, 0) >= 1),
      ('voice', s.messages_total >= 50), ('dep', s.deposits_count >= 1), ('flash3', s.flash_wins >= 3),
      ('fol25', s.followed_bets_count >= 25), ('clanfounder', s.clan_created_id is not null),
      ('clanweek', coalesce(s.clan_week_champion, 0) >= 1), ('whale', s.bets_max_amount >= 500)
    ) as x(id, ok)
    where x.ok and not exists (select 1 from public.user_badges ub where ub.user_id = p_user and ub.badge_id = x.id)
  loop
    insert into public.user_badges (user_id, badge_id) values (p_user, b.id) on conflict do nothing;
    if p_user = auth.uid() then perform wm.ev(jsonb_build_object('k', 'badge', 'id', b.id)); end if;
    perform wm.notify(p_user, 'star', 'badge', jsonb_build_object('id', b.id), '#profil');
  end loop;
end $$;

-- ── Fiche publique d'un joueur (ce que les autres voient) ───────────────────────────────────────
create or replace function wm.fiche(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'n', u.username, 't', coalesce(s.rank_tier, 0), 'd', coalesce(s.rank_division, 0),
    'tone', (('x' || substr(md5(u.id::text), 1, 4))::bit(16)::int % 4),
    'photo', coalesce(u.avatar_photo, ''), 'color', coalesce(u.avatar_color, '#2448FF'),
    'bio', case when u.is_public then coalesce(u.bio, '') else '' end,
    'profit', case when u.is_public then round(coalesce(s.profit_realized, 0)) else 0 end,
    'acc', case when u.is_public then coalesce(s.bets_accuracy_pct, 0) else 0 end,
    'bets', case when u.is_public then coalesce(s.bets_placed, 0) else 0 end,
    'fol', coalesce(s.followers_count, 0), 'bot', u.is_demo, 'pub', case when u.is_public then 1 else 0 end)
  from public.users u left join public.user_stats s on s.user_id = u.id
  where u.id = p_user
$$;

-- ── Bloc « me » : profil + statistiques, dans les noms de champs que l'interface utilise déjà (S.me) ──
create or replace function wm.me(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'n', u.username, 'email', coalesce(au.email, ''), 'photo', coalesce(u.avatar_photo, ''), 'color', coalesce(u.avatar_color, '#2448FF'),
    'bio', coalesce(u.bio, ''), 'wallet', coalesce(u.wallet_address, ''), 'interests', to_jsonb(u.interests),
    'kyc', coalesce(u.kyc_verified, false), 'kycAt', (extract(epoch from u.kyc_at) * 1000)::bigint,
    'onboarded', coalesce(u.onboarded, false), 'welcomed', coalesce(u.welcomed, false), 'obBonus', u.welcome_bonus,
    'pub', u.is_public, 'since', (extract(epoch from u.created_at) * 1000)::bigint, 'rankSeen', u.rank_seen,
    'balance', s.balance, 'xp', s.xp, 'settled', s.bets_settled, 'wins', s.bets_won, 'played', s.bets_placed,
    'flashWins', s.flash_wins, 'flashStreak', s.flash_streak_current, 'flashBest', s.flash_streak_best, 'flashProfit', s.flash_profit_total,
    'followed', s.followed_bets_count, 'deposits', s.deposits_count, 'depDay', coalesce(s.deposits_last_date::text, ''),
    'streak', greatest(1, coalesce(s.streak_current, 1)), 'bestStreak', greatest(1, coalesce(s.streak_best, 1)),
    'pos', coalesce(s.seasonal_position, 38901), 'msgsTotal', s.messages_total,
    'chatXP', case when s.chat_last_date = current_date then coalesce(s.chat_xp_today, 0) else 0 end, 'chatDay', coalesce(s.chat_last_date::text, ''),
    'maxBet', s.bets_max_amount, 'realized', s.profit_realized, 'contraWins', coalesce(s.contra_wins, 0),
    'followers', s.followers_count, 'copiers', s.copiers_count)
  from public.users u
  join public.user_stats s on s.user_id = u.id
  left join auth.users au on au.id = u.id
  where u.id = p_user
$$;

-- Réponse commune des fonctions qui modifient quelque chose.
create or replace function wm.reponse(p_user uuid, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('me', wm.me(p_user), 'ev', wm.ev_take()) || coalesce(p_extra, '{}'::jsonb)
$$;

-- ── État complet du joueur ──────────────────────────────────────────────────────────────────────
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v jsonb;
  v_ids uuid[];
begin
  if not exists (select 1 from public.users where id = v_uid) then perform wm.fail('profil_absent'); end if;
  perform wm.missions_init(v_uid);
  insert into wm.user_prefs (user_id) values (v_uid) on conflict do nothing;

  select array_agg(distinct x) into v_ids from (
    select case when f.user_id = v_uid then f.friend_id else f.user_id end as x from public.friendships f where (f.user_id = v_uid or f.friend_id = v_uid) and f.status in ('pending', 'accepted')
    union select uf.followed_id from public.user_following uf where uf.follower_id = v_uid
  ) q;

  v := jsonb_build_object(
    'v', 1,
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'uid', v_uid,
    'me', wm.me(v_uid),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('m', p.market_id, 's', p.side, 'sh', p.shares, 'avg', p.average_price) order by p.created_at)
                           from public.positions p where p.user_id = v_uid and p.shares > 0), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by (h ->> 'at')::bigint desc) from (
                           select jsonb_build_object('k', ph.kind, 'm', ph.market_id, 'q', ph.question, 's', ph.side, 'win', coalesce(ph.was_winner, false), 'pnl', ph.pnl, 'at', (extract(epoch from ph.settled_at) * 1000)::bigint) as h
                           from public.position_history ph where ph.user_id = v_uid order by ph.settled_at desc limit 100) x), '[]'::jsonb),
    'deps', coalesce((select jsonb_agg(x.j order by x.at desc) from (
                           select d.created_at as at, jsonb_build_object('id', d.id, 'coin', d.coin, 'net', d.network, 'amt', d.coin_amount, 'usd', d.usd_equivalent, 'conf', d.confirmations_received, 'need', d.confirmations_required, 'label', d.label, 'st', d.status, 'at', (extract(epoch from d.created_at) * 1000)::bigint) as j
                           from public.deposits d where d.user_id = v_uid order by d.created_at desc limit 50) x), '[]'::jsonb),
    'wds', coalesce((select jsonb_agg(x.j order by x.at desc) from (
                           select w.requested_at as at, jsonb_build_object('id', w.id, 'net', w.network, 'addr', w.destination_address, 'amt', w.amount_usd, 'st', case when w.status = 'completed' then 'sent' else 'pending' end, 'at', (extract(epoch from w.requested_at) * 1000)::bigint) as j
                           from public.withdrawals w where w.user_id = v_uid order by w.requested_at desc limit 50) x), '[]'::jsonb),
    'notifs', coalesce((select jsonb_agg(x.j order by x.at desc) from (
                           select n.created_at as at, jsonb_build_object('id', n.id, 'ic', n.icon, 'code', n.code, 'p', n.params, 'text', n.text, 'href', coalesce(n.href, ''), 'read', coalesce(n.is_read, false), 'at', (extract(epoch from n.created_at) * 1000)::bigint) as j
                           from public.notifications n where n.user_id = v_uid and n.deleted_at is null order by n.created_at desc limit 30) x), '[]'::jsonb),
    'missions', coalesce((select jsonb_agg(jsonb_build_object('id', m.code, 'type', m.mission_type, 'goal', m.goal_value, 'have', m.current_progress, 'xp', m.xp_reward, 'go', m.action_href, 'claimed', m.is_claimed) order by m.created_at, m.code)
                           from public.missions m where m.user_id = v_uid and m.code is not null), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(ub.badge_id order by ub.unlocked_at) from public.user_badges ub where ub.user_id = v_uid), '[]'::jsonb),
    'friends', coalesce((select jsonb_agg(case when f.user_id = v_uid then f.friend_id else f.user_id end) from public.friendships f where (f.user_id = v_uid or f.friend_id = v_uid) and f.status = 'accepted'), '[]'::jsonb),
    'freqIn', coalesce((select jsonb_agg(f.user_id) from public.friendships f where f.friend_id = v_uid and f.status = 'pending'), '[]'::jsonb),
    'freqOut', coalesce((select jsonb_agg(f.friend_id) from public.friendships f where f.user_id = v_uid and f.status = 'pending'), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(uf.followed_id) from public.user_following uf where uf.follower_id = v_uid), '[]'::jsonb),
    'watch', coalesce((select jsonb_agg(w.market_id) from public.user_watchlist w where w.user_id = v_uid), '[]'::jsonb),
    'prefs', coalesce((select up.prefs from wm.user_prefs up where up.user_id = v_uid), '{}'::jsonb),
    'users', coalesce((select jsonb_object_agg(x::text, wm.fiche(x)) from unnest(coalesce(v_ids, '{}'::uuid[])) x), '{}'::jsonb)
  );
  return v;
end $$;

-- ── Comptes ─────────────────────────────────────────────────────────────────────────────────────
create or replace function wm.pseudo_reserve(p text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(p) = any (array['admin', 'administrateur', 'wimoro', 'wemoro', 'support', 'moderateur', 'moderator', 'system', 'systeme', 'me', 'user26', 'null', 'undefined'])
$$;

-- Un visiteur peut vérifier si un pseudo est libre (les pseudos sont publics).
create or replace function wm.pseudo_libre(p_pseudo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_pseudo ~ '^[A-Za-z0-9._]{3,20}$'
     and not wm.pseudo_reserve(p_pseudo)
     and not exists (select 1 from public.users u where lower(u.username) = lower(p_pseudo))
$$;

-- Inscription : le profil est créé ici, avec le pseudo choisi (transmis par signUp) s'il est valide et libre.
create or replace function public.handle_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_voulu text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  v_base text;
  v_pseudo text;
  v_essai integer := 0;
begin
  if v_voulu is null or v_voulu !~ '^[A-Za-z0-9._]{3,20}$' or wm.pseudo_reserve(v_voulu) then
    v_voulu := null;
  end if;
  v_base := coalesce(v_voulu, 'joueur' || substr(replace(new.id::text, '-', ''), 1, 6));
  v_pseudo := v_base;
  while exists (select 1 from public.users u where lower(u.username) = lower(v_pseudo)) loop
    v_essai := v_essai + 1;
    v_pseudo := left(v_base, 16) || substr(md5(new.id::text || v_essai::text), 1, 4);
  end loop;

  insert into public.users (id, username, email, avatar_color, onboarded, welcomed, is_demo, is_test)
  values (new.id, v_pseudo, coalesce(new.email, new.id::text || '@sans-email.invalid'), '#2448FF', false, false, false,
          coalesce(new.raw_user_meta_data ->> 'test', '') = 'true')
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function wm.profile_update(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v_n text := p ->> 'n';
  v_bio text := p ->> 'bio';
  v_color text := p ->> 'color';
  v_photo text := p ->> 'photo';
begin
  if p ? 'n' then
    if v_n is null or v_n !~ '^[A-Za-z0-9._]{3,20}$' or wm.pseudo_reserve(v_n) then perform wm.fail('pseudo_invalide'); end if;
    if exists (select 1 from public.users u where lower(u.username) = lower(v_n) and u.id <> v_uid) then perform wm.fail('pseudo_pris'); end if;
  end if;
  if p ? 'bio' and length(coalesce(v_bio, '')) > 160 then perform wm.fail('bio_trop_longue'); end if;
  if p ? 'color' and coalesce(v_color, '') !~ '^#[0-9A-Fa-f]{6}$' then perform wm.fail('couleur_invalide'); end if;
  -- avatar : un identifiant de la galerie (« g:renard ») ou rien ; les photos importées arriveront avec le stockage de fichiers
  if p ? 'photo' and coalesce(v_photo, '') !~ '^(g:[a-z0-9-]{1,24})?$' then perform wm.fail('photo_invalide'); end if;
  if p ? 'lang' and coalesce(p ->> 'lang', '') not in ('en', 'fr', 'he') then perform wm.fail('langue_invalide'); end if;
  if p ? 'theme' and coalesce(p ->> 'theme', '') not in ('light', 'dark', 'auto') then perform wm.fail('theme_invalide'); end if;

  update public.users set
    username = case when p ? 'n' then v_n else username end,
    bio = case when p ? 'bio' then coalesce(v_bio, '') else bio end,
    avatar_color = case when p ? 'color' then v_color else avatar_color end,
    avatar_photo = case when p ? 'photo' then coalesce(v_photo, '') else avatar_photo end,
    is_public = case when p ? 'pub' then coalesce((p ->> 'pub')::boolean, true) else is_public end,
    language_preference = case when p ? 'lang' then p ->> 'lang' else language_preference end,
    theme_preference = case when p ? 'theme' then p ->> 'theme' else theme_preference end,
    interests = case when p ? 'interests' then coalesce(array(select jsonb_array_elements_text(p -> 'interests') limit 12), '{}') else interests end,
    welcomed = case when p ? 'welcomed' then true else welcomed end
  where id = v_uid;
  return wm.reponse(v_uid);
end $$;

-- Onboarding : couleur et centres d'intérêt passent par profile_update ; ici, les 100 XP de bienvenue et la fin.
create or replace function wm.onboarding(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_fait boolean;
begin
  if coalesce((p ->> 'bonus')::boolean, false) then
    update public.users set welcome_bonus = true where id = v_uid and not welcome_bonus returning true into v_fait;
    if v_fait then perform wm.xp_add(v_uid, 100, 'bienvenue'); end if;
  end if;
  if coalesce((p ->> 'done')::boolean, false) then
    update public.users set onboarded = true where id = v_uid;
  end if;
  return wm.reponse(v_uid);
end $$;

create or replace function wm.rank_seen(p_rang integer) returns void
language sql security definer set search_path = '' as $$
  update public.users set rank_seen = greatest(rank_seen, least(26, greatest(0, p_rang)))::smallint where id = wm.uid()
$$;

-- ── Préférences d'interface ─────────────────────────────────────────────────────────────────────
create or replace function wm.prefs_save(p_prefs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then perform wm.fail('prefs_invalides'); end if;
  if pg_column_size(p_prefs) > 262144 then perform wm.fail('prefs_trop_grandes'); end if;
  insert into wm.user_prefs (user_id, prefs, updated_at) values (v_uid, p_prefs, now())
  on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now();
end $$;

-- ── Notifications ───────────────────────────────────────────────────────────────────────────────
create or replace function wm.notifs_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set is_read = true where user_id = wm.uid() and not coalesce(is_read, false) and deleted_at is null
$$;
create or replace function wm.notif_hide(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set deleted_at = now() where user_id = wm.uid() and deleted_at is null and (p_id is null or id = p_id)
$$;

-- ── Connexion par pseudo : réservé au service de connexion (Edge Function), jamais aux clients ──
create table if not exists wm.login_attempts (
  pseudo text not null,
  at timestamptz not null default now()
);
create index if not exists idx_login_attempts on wm.login_attempts (pseudo, at desc);
alter table wm.login_attempts enable row level security;

-- Renvoie l'e-mail du compte, ou NULL si le pseudo est inconnu ou si trop d'essais ont été faits (10 en 10 minutes).
create or replace function wm.login_lookup(p_pseudo text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_p text := lower(trim(coalesce(p_pseudo, ''))); v_email text;
begin
  if v_p !~ '^[a-z0-9._]{3,20}$' then return null; end if;
  if (select count(*) from wm.login_attempts a where a.pseudo = v_p and a.at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop_de_tentatives' using errcode = 'P0001';
  end if;
  insert into wm.login_attempts (pseudo) values (v_p);
  select au.email into v_email from public.users u join auth.users au on au.id = u.id where lower(u.username) = v_p and not u.is_demo;
  return v_email;
end $$;

-- ── Qui peut appeler quoi ───────────────────────────────────────────────────────────────────────
revoke all on all functions in schema wm from public, anon, authenticated;
grant execute on function wm.state(), wm.profile_update(jsonb), wm.onboarding(jsonb), wm.rank_seen(integer),
  wm.prefs_save(jsonb), wm.notifs_read(), wm.notif_hide(uuid) to authenticated;
grant execute on function wm.pseudo_libre(text) to anon, authenticated;
grant execute on function wm.login_lookup(text) to service_role;

-- ── L'API publique : des enveloppes d'une ligne ─────────────────────────────────────────────────
create or replace function public.api_state() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.state() $$;
create or replace function public.api_pseudo_libre(p_pseudo text) returns boolean
language sql stable security invoker set search_path = '' as $$ select wm.pseudo_libre(p_pseudo) $$;
create or replace function public.api_profile_update(p jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.profile_update(p) $$;
create or replace function public.api_onboarding(p jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.onboarding(p) $$;
create or replace function public.api_rank_seen(p_rang integer) returns void
language sql security invoker set search_path = '' as $$ select wm.rank_seen(p_rang) $$;
create or replace function public.api_prefs_save(p_prefs jsonb) returns void
language sql security invoker set search_path = '' as $$ select wm.prefs_save(p_prefs) $$;
create or replace function public.api_notifs_read() returns void
language sql security invoker set search_path = '' as $$ select wm.notifs_read() $$;
create or replace function public.api_notif_hide(p_id uuid default null) returns void
language sql security invoker set search_path = '' as $$ select wm.notif_hide(p_id) $$;

revoke all on function public.api_state(), public.api_pseudo_libre(text), public.api_profile_update(jsonb), public.api_onboarding(jsonb),
  public.api_rank_seen(integer), public.api_prefs_save(jsonb), public.api_notifs_read(), public.api_notif_hide(uuid) from public, anon, authenticated;
grant execute on function public.api_state(), public.api_profile_update(jsonb), public.api_onboarding(jsonb),
  public.api_rank_seen(integer), public.api_prefs_save(jsonb), public.api_notifs_read(), public.api_notif_hide(uuid) to authenticated;
grant execute on function public.api_pseudo_libre(text) to anon, authenticated;

-- Les comptes existants reçoivent leurs missions de départ ; leur rang enregistré est remis à jour (sans notification).
do $$
declare r record;
begin
  for r in select u.id from public.users u where not u.is_demo loop
    perform wm.missions_init(r.id);
  end loop;
end $$;
update public.user_stats s set rank_tier = x.t, rank_division = x.d
from (
  select s2.user_id, r.t, r.d
  from public.user_stats s2
  join public.users u on u.id = s2.user_id and not u.is_demo
  cross join lateral wm.rank_of(s2.xp, s2.bets_settled, s2.bets_won, s2.deposits_count, s2.flash_wins, s2.followed_bets_count, s2.seasonal_position) r
) x
where x.user_id = s.user_id and (s.rank_tier is distinct from x.t or s.rank_division is distinct from x.d);
