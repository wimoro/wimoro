-- Pari éclair côté serveur (lot 4.4).
--
-- Le moteur du pari éclair est déterministe : tout se déduit de l'heure (js/moteur-eclair.js). Le serveur l'exécute dans
-- l'Edge Function « eclair », qui en embarque une copie conforme, et n'écrit en base que par les fonctions ci-dessous,
-- réservées à la clé de service (préfixe srv_). Un joueur ne peut donc ni fixer ses frais, ni décider de son gain.
--   * miser  : l'Edge Function calcule, avec SON horloge, la manche, le tick, les frais et la cote du break even ; la
--              base vérifie l'heure à son tour, la pause, le solde, une seule mise par pari et par manche, puis débite.
--   * régler : l'Edge Function rejoue chaque manche terminée (cagnotte, issue, gain) ; la base crédite, tient les
--              statistiques, l'historique, les XP, les missions et les notifications.
-- Comme dans le navigateur, la cagnotte d'une manche est celle des joueurs simulés plus la mise du joueur : l'aperçu
-- affiché et le règlement du serveur donnent donc le même résultat.

create table if not exists wm.eclair_mises (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  manche bigint not null,
  jeu text not null,
  cote text not null check (cote in ('oui', 'non', 'be')),
  amt numeric(15,2) not null,
  fee float8 not null,
  net float8 not null,
  mult float8 not null default 0,
  prix integer,
  tk integer not null,
  etat text not null default 'ouverte' check (etat in ('ouverte', 'gagnee', 'perdue')),
  gain numeric(15,2),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (user_id, manche, jeu)
);
alter table wm.eclair_mises enable row level security;
create index if not exists idx_eclair_ouvertes on wm.eclair_mises (user_id, manche) where etat = 'ouverte';

-- Numéro de la manche en cours : une manche de 45 secondes, comptée depuis le 1er novembre 2026 (UTC), comme dans le moteur.
create or replace function wm.eclair_manche(p_t timestamptz default clock_timestamp()) returns bigint
language sql stable set search_path = '' as $$
  select floor((extract(epoch from p_t) - extract(epoch from timestamptz '2026-11-01 00:00:00+00')) / 45)::bigint + 1
$$;

-- Les fonctions srv_ sont appelées avec la clé de service : elles agissent pour un joueur donné. On installe son identité
-- pour la durée de la transaction, afin que toutes les aides (contrôle d'auto-exclusion, événements, réponse) valent pour lui.
create or replace function wm.agir_pour(p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or not exists (select 1 from public.users u where u.id = p_user) then raise exception 'session' using errcode = 'P0001'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return wm.uid();
end $$;

create or replace function wm.eclair_mise_json(m wm.eclair_mises) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'r', m.manche, 'g', m.jeu, 's', m.cote, 'amt', m.amt, 'fee', m.fee, 'net', m.net,
    'price', m.prix, 'mult', m.mult, 'tk', m.tk)
$$;
-- Ce que l'écran doit savoir au chargement : les mises de la manche en cours, et s'il reste des manches à régler.
create or replace function wm.eclair_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('r', wm.eclair_manche(),
    'du', (select count(*) from wm.eclair_mises m where m.user_id = p_user and m.etat = 'ouverte' and m.manche < wm.eclair_manche()),
    'b', coalesce((select jsonb_object_agg(m.jeu, wm.eclair_mise_json(m)) from wm.eclair_mises m
                   where m.user_id = p_user and m.etat = 'ouverte' and m.manche = wm.eclair_manche()), '{}'::jsonb))
$$;

-- ── Miser ───────────────────────────────────────────────────────────────────────────────────────
-- p : { manche, jeu, cote, amt, fee, fee_remise, mult, prix, tk, be_max, key } — calculé par l'Edge Function.
create or replace function public.srv_eclair_miser(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user);
  v_manche bigint := wm.num(p ->> 'manche')::bigint; v_jeu text := p ->> 'jeu'; v_cote text := p ->> 'cote';
  v_amt numeric := round(wm.num(p ->> 'amt'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; v_ms float8; v_tier integer; v_fee float8; v_solde numeric; m wm.eclair_mises; v_res jsonb;
begin
  if v_cote is null or v_cote not in ('oui', 'non', 'be') then perform wm.fail('cote_invalide'); end if;
  if v_jeu is null or v_manche is null then perform wm.fail('jeu_inconnu'); end if;
  if v_amt is null or v_amt < 1 or v_amt > 10000 then perform wm.fail('montant_invalide'); end if;
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);                                                         -- jeu responsable : pas de mise pendant une pause
  -- l'horloge de la base confirme celle de l'Edge Function : la manche est en cours et ses mises sont ouvertes
  -- (30 secondes ; 1,5 seconde de tolérance entre les deux horloges)
  v_ms := (extract(epoch from clock_timestamp()) - extract(epoch from timestamptz '2026-11-01 00:00:00+00')) * 1000 - (v_manche - 1) * 45000;
  if v_ms < -1500 or v_ms >= 31500 then perform wm.fail('mises_fermees'); end if;
  if exists (select 1 from wm.eclair_mises x where x.user_id = v_uid and x.manche = v_manche and x.jeu = v_jeu) then perform wm.fail('deja_mise'); end if;
  if s.balance < v_amt then perform wm.fail('solde_insuffisant'); end if;
  if v_cote = 'be' and v_amt > coalesce(wm.num(p ->> 'be_max'), 0) then perform wm.fail('be_plein'); end if;

  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  v_fee := case when coalesce(v_tier, 0) >= 5 then wm.num(p ->> 'fee_remise') else wm.num(p ->> 'fee') end::float8;   -- remise à partir du rang Diamant
  if v_fee is null or v_fee < 0 or v_fee >= v_amt then perform wm.fail('montant_invalide'); end if;

  v_solde := s.balance - v_amt;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1 where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_amt, v_solde, 'flash', v_jeu || ':' || v_manche);
  insert into wm.eclair_mises (user_id, manche, jeu, cote, amt, fee, net, mult, prix, tk)
  values (v_uid, v_manche, v_jeu, v_cote, v_amt, v_fee, v_amt - v_fee, case when v_cote = 'be' then coalesce(wm.num(p ->> 'mult'), 0)::float8 else 0 end,
          wm.num(p ->> 'prix')::integer, greatest(0, least(180, coalesce(wm.num(p ->> 'tk'), 0)))::integer)
  returning * into m;
  perform wm.xp_add(v_uid, 10, 'eclair');
  perform wm.mission_progress(v_uid, 'flashbet', 1);
  perform wm.badges_check(v_uid);
  v_res := wm.reponse(v_uid, jsonb_build_object('mise', wm.eclair_mise_json(m)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'eclair', v_res);
  return v_res;
end $$;

-- ── Mises à régler : celles des manches terminées ───────────────────────────────────────────────
create or replace function public.srv_eclair_ouvertes(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.agir_pour(p_user);
begin
  return jsonb_build_object('manche', wm.eclair_manche(),
    'mises', coalesce((select jsonb_agg(wm.eclair_mise_json(x) order by x.manche, x.id) from (
        select * from wm.eclair_mises m where m.user_id = v_uid and m.etat = 'ouverte' and m.manche < wm.eclair_manche() order by m.manche, m.id limit 60) x), '[]'::jsonb));
end $$;

-- ── Régler ──────────────────────────────────────────────────────────────────────────────────────
-- p_res : [ { id, win, pay, part } ] — calculé par l'Edge Function en rejouant chaque manche avec le moteur.
-- « part » : part de la cagnotte (en %) qui était sur l'issue gagnante (30 % ou moins : victoire « contre la foule »).
create or replace function public.srv_eclair_regler(p_user uuid, p_res jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_maintenant bigint := wm.eclair_manche();
  x jsonb; m wm.eclair_mises; v_win boolean; v_pay numeric; v_pnl numeric; v_part integer; v_solde numeric; v_at timestamptz;
  v_regles jsonb := '[]'::jsonb; v_hist jsonb := '[]'::jsonb; n integer := 0;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  for x in select * from jsonb_array_elements(coalesce(p_res, '[]'::jsonb)) loop
    select * into m from wm.eclair_mises e where e.id = wm.num(x ->> 'id')::bigint and e.user_id = v_uid and e.etat = 'ouverte' and e.manche < v_maintenant for update;
    continue when not found;
    v_win := coalesce((x ->> 'win')::boolean, false);
    v_pay := case when v_win then round(greatest(0, coalesce(wm.num(x ->> 'pay'), 0)), 2) else 0 end;
    v_pnl := v_pay - m.amt; v_part := coalesce(wm.num(x ->> 'part'), 50)::integer;
    v_at := timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => m.manche * 45);       -- fin de la manche
    update public.user_stats set
      balance = balance + v_pay, bets_settled = coalesce(bets_settled, 0) + 1,
      flash_profit_total = coalesce(flash_profit_total, 0) + v_pnl, profit_realized = coalesce(profit_realized, 0) + v_pnl,
      bets_won = coalesce(bets_won, 0) + case when v_win then 1 else 0 end,
      flash_wins = coalesce(flash_wins, 0) + case when v_win then 1 else 0 end,
      flash_streak_current = case when v_win then coalesce(flash_streak_current, 0) + 1 else 0 end,
      flash_streak_best = greatest(coalesce(flash_streak_best, 0), case when v_win then coalesce(flash_streak_current, 0) + 1 else 0 end),
      contra_wins = coalesce(contra_wins, 0) + case when v_win and v_part <= 30 then 1 else 0 end,
      bets_accuracy_pct = round(100.0 * (coalesce(bets_won, 0) + case when v_win then 1 else 0 end) / (coalesce(bets_settled, 0) + 1))
    where user_id = v_uid returning balance into v_solde;
    if v_pay > 0 then
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, v_pay, v_solde, 'flash_gain', m.jeu || ':' || m.manche);
    end if;
    update wm.eclair_mises set etat = case when v_win then 'gagnee' else 'perdue' end, gain = v_pay, settled_at = now() where id = m.id;
    insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl, settled_at)
    values (v_uid, 'flash', null, 'eclair|' || m.jeu || '|' || m.manche, m.cote, v_win, v_pnl, v_at);
    v_hist := v_hist || jsonb_build_array(jsonb_build_object('k', 'flash', 'q', 'eclair|' || m.jeu || '|' || m.manche, 's', m.cote, 'win', v_win, 'pnl', v_pnl, 'at', (extract(epoch from v_at) * 1000)::bigint));
    v_regles := v_regles || jsonb_build_array(jsonb_build_object('id', m.id, 'g', m.jeu, 'r', m.manche, 's', m.cote, 'amt', m.amt, 'win', v_win, 'pay', v_pay, 'pnl', v_pnl, 'tard', m.manche < v_maintenant - 1));
    if v_win then
      perform wm.xp_add(v_uid, case when m.cote = 'be' then 120 else 40 end, 'eclair');
      perform wm.mission_progress(v_uid, 'flashwin', 1);
    end if;
    if m.manche < v_maintenant - 1 then                                               -- réglée après coup : une notification le dit
      perform wm.notify(v_uid, 'bolt', case when v_win then 'flash_gagne' else 'flash_perdu' end,
        jsonb_build_object('g', m.jeu, 'r', m.manche, 'pay', v_pay, 'amt', m.amt), '#eclair');
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform wm.rank_refresh(v_uid); perform wm.badges_check(v_uid); end if;
  return wm.reponse(v_uid, jsonb_build_object('regles', v_regles, 'hist', v_hist, 'eclair', wm.eclair_json(v_uid)));
end $$;

-- ── État complet du joueur : avec ses mises éclair de la manche en cours (seul ajout) ───────────
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v jsonb; v_rg jsonb;
  v_ids uuid[];
begin
  if not exists (select 1 from public.users where id = v_uid) then perform wm.fail('profil_absent'); end if;
  perform wm.missions_init(v_uid);
  insert into wm.user_prefs (user_id) values (v_uid) on conflict do nothing;
  perform wm.demo_regler(v_uid);                    -- un dépôt arrivé à échéance pendant l'absence est crédité maintenant
  v_rg := wm.rg_json(v_uid);

  select array_agg(distinct x) into v_ids from (
    select case when f.user_id = v_uid then f.friend_id else f.user_id end as x from public.friendships f where (f.user_id = v_uid or f.friend_id = v_uid) and f.status in ('pending', 'accepted')
    union select uf.followed_id from public.user_following uf where uf.follower_id = v_uid
  ) q;

  v := jsonb_build_object(
    'v', 1,
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'uid', v_uid,
    'me', wm.me(v_uid),
    'rg', v_rg,
    'eclair', wm.eclair_json(v_uid),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('m', p.market_id, 's', p.side, 'sh', p.shares, 'avg', p.average_price) order by p.created_at)
                           from public.positions p where p.user_id = v_uid and p.shares > 0), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by (h ->> 'at')::bigint desc) from (
                           select jsonb_build_object('k', ph.kind, 'm', ph.market_id, 'q', ph.question, 's', ph.side, 'win', coalesce(ph.was_winner, false), 'pnl', ph.pnl, 'at', (extract(epoch from ph.settled_at) * 1000)::bigint) as h
                           from public.position_history ph where ph.user_id = v_uid order by ph.settled_at desc limit 100) x), '[]'::jsonb),
    'deps', wm.deps_json(v_uid),
    'wds', wm.wds_json(v_uid),
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

select wm.droits();
