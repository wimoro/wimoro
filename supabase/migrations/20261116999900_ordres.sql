-- Ordres à cours limité, stop loss et take profit en mode Compte.
--
-- Règles du mode Démo (js/orders.js), tenues par le serveur :
--  · achat limite : un prix maximum en ¢ et un montant. Le montant est réservé sur le solde ; ce qui peut s'exécuter sous ce
--    prix l'est tout de suite, le reste attend dans le carnet (exécutions partielles). Moins de 0,50 $ restant : rendu.
--  · vente limite : un prix minimum et un nombre de parts. Les parts ne sont pas bloquées : si elles ont été vendues
--    entre-temps, l'ordre est annulé.
--  · protection d'une position : stop loss et take profit, vente de toutes les parts au marché quand la meilleure demande
--    passe le seuil.
-- Les ordres en attente sont revus toutes les 3 secondes (tâche wm-ordres) : le prix bouge avec les bots et les joueurs.
-- Les devis plafonnés sont la copie de quoteBuyCap / quoteSellCap de js/engine.js (test de parité dans tests/sql).

create table if not exists wm.ordres (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  market_id text not null,
  side text not null check (side in ('oui', 'non')),
  kind text not null check (kind in ('buy', 'sell')),
  lp smallint not null check (lp between 1 and 99),   -- prix limite en ¢
  init numeric(20,8) not null,                        -- achat : $ réservés au départ ; vente : parts à vendre au départ
  cash numeric(14,2) not null default 0,              -- achat : $ encore réservés
  sh numeric(20,8) not null default 0,                -- achat : parts obtenues ; vente : parts restant à vendre
  spent numeric(14,2) not null default 0,             -- achat : $ dépensés, frais compris
  fee numeric(14,2) not null default 0,
  pro numeric(14,2) not null default 0,               -- vente : $ encaissés
  pnl numeric(14,2) not null default 0,
  etat text not null default 'open' check (etat in ('open', 'filled', 'cancelled')),
  why text,                                           -- annulation : 'user', 'noshares', 'closed'
  cree_at timestamptz not null default now(),
  maj_at timestamptz,
  fin_at timestamptz
);
create table if not exists wm.protections (
  user_id uuid not null references public.users(id) on delete cascade,
  market_id text not null,
  side text not null check (side in ('oui', 'non')),
  stop smallint not null default 0 check (stop between 0 and 99),
  tp smallint not null default 0 check (tp between 0 and 99),
  cree_at timestamptz not null default now(),
  primary key (user_id, market_id, side)
);
alter table wm.ordres enable row level security;
alter table wm.protections enable row level security;
revoke all on wm.ordres, wm.protections from public, anon, authenticated;
create index if not exists ordres_ouverts on wm.ordres (market_id, id) where etat = 'open';
create index if not exists ordres_joueur on wm.ordres (user_id, id desc);
create index if not exists protections_marche on wm.protections (market_id);

-- ── Carnet : meilleure offre, meilleure demande, devis plafonnés ──
create or replace function wm.demi_ecart(p_depth float8) returns float8
language sql immutable set search_path = '' as $$ select greatest(0.1::float8, least(1.5::float8, 15 / sqrt(p_depth))) / 100 $$;
create or replace function wm.meilleure_offre(p_p float8, p_depth float8, p_side text) returns float8
language sql immutable set search_path = '' as $$ select least(0.99::float8, (case when p_side = 'oui' then p_p else 100 - p_p end) / 100 + wm.demi_ecart(p_depth)) $$;
create or replace function wm.meilleure_demande(p_p float8, p_depth float8, p_side text) returns float8
language sql immutable set search_path = '' as $$ select greatest(0.01::float8, (case when p_side = 'oui' then p_p else 100 - p_p end) / 100 - wm.demi_ecart(p_depth)) $$;

-- Achat limité : on dépense p_total (frais compris) tant que le prix reste ≤ p_cap ($) ; « reste » attend.
create or replace function wm.quote_buy_cap(p_p float8, p_depth float8, p_cat text, p_disc boolean, p_side text, p_total float8, p_cap float8,
  out sh float8, out cost float8, out fee float8, out avg float8, out impact float8, out reste float8)
language plpgsql immutable set search_path = '' as $$
declare
  d float8 := p_depth * 100;
  a0 float8 := wm.meilleure_offre(p_p, p_depth, p_side);
  p float8 := least(p_cap, 0.99::float8);
  th float8 := wm.fee_rate(p_cat, p_disc);
  cap_sh float8; cap_cost float8; cap_avg float8; cap_fee float8; q record;
begin
  if p <= a0 + 1e-12 then sh := 0; cost := 0; fee := 0; avg := a0; impact := 0; reste := p_total; return; end if;
  cap_sh := d * (p - a0);
  cap_cost := a0 * cap_sh + cap_sh * cap_sh / (2 * d);
  cap_avg := case when cap_sh > 0 then cap_cost / cap_sh else a0 end;
  cap_fee := cap_cost * th * (1 - cap_avg);
  if p_total >= cap_cost + cap_fee - 1e-9 then
    sh := cap_sh; cost := cap_cost; fee := cap_fee; avg := cap_avg; impact := cap_sh / d * 100; reste := p_total - cap_cost - cap_fee; return;
  end if;
  select * into q from wm.quote_buy(p_p, p_depth, p_cat, p_disc, p_side, p_total);
  sh := q.sh; cost := q.cost; fee := q.fee; avg := q.avg; impact := q.impact; reste := 0;
end $$;

-- Vente limitée : on vend p_sh parts tant que le prix reste ≥ p_floor ($) ; « reste » attend.
create or replace function wm.quote_sell_cap(p_p float8, p_depth float8, p_side text, p_sh float8, p_floor float8,
  out sh float8, out pro float8, out avg float8, out impact float8, out reste float8)
language plpgsql immutable set search_path = '' as $$
declare
  d float8 := p_depth * 100;
  b0 float8 := wm.meilleure_demande(p_p, p_depth, p_side);
  p float8 := greatest(p_floor, 0.01::float8);
  cap_sh float8; q record;
begin
  if b0 <= p + 1e-12 then sh := 0; pro := 0; avg := b0; impact := 0; reste := p_sh; return; end if;
  cap_sh := d * (b0 - p);
  if p_sh > cap_sh + 1e-9 then
    sh := cap_sh; pro := b0 * cap_sh - cap_sh * cap_sh / (2 * d); avg := case when cap_sh > 0 then pro / cap_sh else b0 end;
    impact := cap_sh / d * 100; reste := p_sh - cap_sh; return;
  end if;
  select * into q from wm.quote_sell(p_p, p_depth, p_side, p_sh);
  sh := q.sh; pro := q.pro; avg := q.avg; impact := q.impact; reste := 0;
end $$;

-- ── Ce que le joueur voit ──
create or replace function wm.ordre_json(o wm.ordres) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'm', o.market_id, 's', o.side, 'k', o.kind, 'lp', o.lp, 'init', o.init, 'cash', o.cash, 'sh', o.sh,
    'spent', o.spent, 'fee', o.fee, 'pro', o.pro, 'pnl', o.pnl, 'status', o.etat, 'why', o.why,
    'at', (extract(epoch from o.cree_at) * 1000)::bigint, 'last', (extract(epoch from o.maj_at) * 1000)::bigint, 'end', (extract(epoch from o.fin_at) * 1000)::bigint)
$$;
-- Tous les ordres en attente, et les 20 derniers terminés.
create or replace function wm.ordres_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(wm.ordre_json(o) order by o.id desc), '[]'::jsonb) from (
    (select * from wm.ordres x where x.user_id = p_user and x.etat = 'open')
    union all
    (select * from wm.ordres x where x.user_id = p_user and x.etat <> 'open' order by x.id desc limit 20)) o
$$;
create or replace function wm.protections_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('m', g.market_id, 's', g.side, 'stop', g.stop, 'tp', g.tp, 'at', (extract(epoch from g.cree_at) * 1000)::bigint) order by g.cree_at), '[]'::jsonb)
  from wm.protections g where g.user_id = p_user
$$;
-- Bloc commun aux réponses : ordres, protections, positions et prix des marchés touchés.
create or replace function wm.ordres_reponse(p_user uuid, p_market text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('orders', wm.ordres_json(p_user), 'guards', wm.protections_json(p_user),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('m', p.market_id, 's', p.side, 'sh', p.shares, 'avg', p.average_price) order by p.created_at)
                           from public.positions p where p.user_id = p_user and p.shares > 0), '[]'::jsonb),
    'marches', coalesce((select jsonb_object_agg(x.market_id, wm.market_json(x)) from public.market_live_state x where x.market_id = any (wm.fratrie(p_market))), '{}'::jsonb))
$$;

-- ── Écritures d'une vente faite par un ordre ou une protection (le joueur et le marché sont déjà verrouillés) ──
create or replace function wm.vente_ecrire(p_user uuid, p_market text, p_side text, p_sh numeric, p_pro float8, p_impact float8, p_via text,
  out pro numeric, out pnl numeric, out reste numeric)
language plpgsql security definer set search_path = '' as $$
declare pos public.positions; l public.market_live_state; v_solde numeric; v_p numeric; v_sens integer := case when p_side = 'oui' then -1 else 1 end;
begin
  select * into pos from public.positions where user_id = p_user and market_id = p_market and side = p_side for update;
  select * into l from public.market_live_state where market_id = p_market;
  pro := trunc(p_pro::numeric, 2);                                             -- jamais un centime de trop
  pnl := pro - round(p_sh * pos.average_price / 100, 2);
  reste := pos.shares - p_sh;
  if reste < 0.05 then reste := 0; end if;                                     -- une poussière de part ne reste pas en portefeuille
  update public.positions set shares = reste, updated_at = now() where id = pos.id;
  if reste = 0 then delete from wm.protections g where g.user_id = p_user and g.market_id = p_market and g.side = p_side; end if;
  update public.user_stats set balance = balance + pro, profit_realized = coalesce(profit_realized, 0) + pnl where user_id = p_user returning balance into v_solde;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, pro, v_solde, 'sell', p_market || ':' || p_side);
  insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl) values (p_user, 'sell', p_market, 'via|' || p_via, p_side, pnl >= 0, pnl);
  v_p := round(greatest(1::float8, least(99::float8, l.current_probability::float8 + p_impact * v_sens))::numeric, 6);
  update public.market_live_state set
    current_probability = v_p, volume_total = volume_total + pro,
    open_yes = greatest(0, open_yes - case when p_side = 'oui' then pos.shares - reste else 0 end),
    open_no = greatest(0, open_no - case when p_side = 'non' then pos.shares - reste else 0 end),
    mm_cash = mm_cash - pro,
    price_history = wm.ph_push(price_history, round(v_p, 2)), seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform wm.group_rebalance(p_market, (v_p - l.current_probability)::float8);
end $$;

-- ── Annuler un ordre en attente : la réserve d'un achat revient sur le solde ──
-- Le verrou du joueur passe toujours en premier. Sans p_attendre (tâche de fond, résolution d'un marché), un joueur occupé
-- n'est pas attendu : son ordre est repris au passage suivant, 3 secondes plus tard.
create or replace function wm.ordre_clore(p_id bigint, p_why text, p_notifier boolean default true, p_attendre boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o wm.ordres; v_user uuid; v_rendu numeric := 0; v_solde numeric;
begin
  select x.user_id into v_user from wm.ordres x where x.id = p_id and x.etat = 'open';
  if not found then return null; end if;
  if p_attendre then perform 1 from public.user_stats where user_id = v_user for update;
  else perform 1 from public.user_stats where user_id = v_user for update skip locked; end if;
  if not found then return null; end if;
  select * into o from wm.ordres x where x.id = p_id and x.etat = 'open' for update;
  if not found then return null; end if;
  if o.kind = 'buy' and o.cash > 0 then
    v_rendu := o.cash;
    update public.user_stats set balance = balance + v_rendu where user_id = o.user_id returning balance into v_solde;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (o.user_id, v_rendu, v_solde, 'ordre_rendu', o.id::text);
  end if;
  update wm.ordres set etat = 'cancelled', why = p_why, cash = 0, fin_at = now() where id = o.id returning * into o;
  if p_notifier and p_why <> 'user' then
    perform wm.notify(o.user_id, 'info', 'ordre_annule', jsonb_build_object('id', o.id, 'm', o.market_id, 's', o.side, 'k', o.kind, 'why', p_why, 'rendu', v_rendu), '#marche-' || o.market_id);
  end if;
  return jsonb_build_object('k', o.kind, 'annule', p_why, 'rendu', v_rendu, 'ordre', wm.ordre_json(o));
end $$;

-- ── Exécuter ce qui peut l'être d'un ordre en attente ──
-- p_attendre : faux depuis la tâche de fond, qui n'attend jamais un joueur occupé (il sera repris 3 secondes plus tard).
create or replace function wm.ordre_remplir(p_id bigint, p_attendre boolean default false, p_notifier boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o wm.ordres; s public.user_stats; mk public.markets; l public.market_live_state; pos public.positions; q record; v record;
  v_user uuid; v_ids text[]; v_tier integer; v_depth float8; v_sens integer; v_total numeric; v_fee numeric; v_cout numeric; v_reste numeric;
  v_sh numeric; v_vendu numeric; v_p numeric; v_solde numeric; v_fini boolean; v_premier boolean; v_res jsonb;
begin
  select x.user_id into v_user from wm.ordres x where x.id = p_id and x.etat = 'open';
  if not found then return null; end if;
  if p_attendre then select * into s from public.user_stats where user_id = v_user for update;      -- verrou du joueur, toujours en premier
  else select * into s from public.user_stats where user_id = v_user for update skip locked; end if;
  if not found then return null; end if;
  select * into o from wm.ordres x where x.id = p_id and x.etat = 'open' for update;
  if not found then return null; end if;
  select * into mk from public.markets where id = o.market_id;
  if not found or coalesce(mk.status, 'open') <> 'open' then return null; end if;                    -- fermé : l'ordre attend ; résolu : wm.ordres_marche l'annule
  v_ids := wm.fratrie(o.market_id);
  perform 1 from public.market_live_state x where x.market_id = any (v_ids) order by x.market_id for update;
  select * into l from public.market_live_state where market_id = o.market_id;
  if not found then return null; end if;
  v_depth := wm.depth(l.volume_total::float8, l.liquidity_depth::float8);

  if o.kind = 'buy' then
    select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
    select * into q from wm.quote_buy_cap(l.current_probability::float8, v_depth, mk.category, coalesce(v_tier, 0) >= 5, o.side, o.cash::float8, o.lp::float8 / 100);
    if q.sh <= 1e-9 then return null; end if;
    v_total := case when q.reste <= 0 then o.cash else least(o.cash, round((q.cost + q.fee)::numeric, 2)) end;
    if v_total < 0.01 then return null; end if;                                                      -- trop peu pour valoir une écriture
    v_fee := least(v_total, round(q.fee::numeric, 2)); v_cout := v_total - v_fee;
    v_reste := o.cash - v_total; v_fini := v_reste < 0.5; v_premier := o.sh = 0; v_sens := case when o.side = 'oui' then 1 else -1 end;

    insert into public.positions (user_id, market_id, side, shares, average_price)
    values (o.user_id, o.market_id, o.side, q.sh::numeric, (q.avg * 100)::numeric)
    on conflict (user_id, market_id, side) do update set
      average_price = ((public.positions.average_price * public.positions.shares + excluded.average_price * excluded.shares) / nullif(public.positions.shares + excluded.shares, 0)),
      shares = public.positions.shares + excluded.shares, updated_at = now();
    update public.user_stats set
      balance = balance + case when v_fini then v_reste else 0 end,                                  -- moins de 0,50 $ restant : rendu
      bets_placed = bets_placed + case when v_premier then 1 else 0 end,                             -- la première exécution compte pour un pari
      bets_max_amount = case when v_premier then greatest(coalesce(bets_max_amount, 0), o.init) else bets_max_amount end,
      profit_realized = coalesce(profit_realized, 0) - v_fee
    where user_id = o.user_id returning balance into v_solde;
    if v_fini and v_reste > 0 then
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (o.user_id, v_reste, v_solde, 'ordre_rendu', o.id::text);
    end if;
    update wm.ordres set cash = case when v_fini then 0 else v_reste end, sh = sh + q.sh::numeric, spent = spent + v_total, fee = fee + v_fee,
      etat = case when v_fini then 'filled' else 'open' end, maj_at = now(), fin_at = case when v_fini then now() end
    where id = o.id returning * into o;

    v_p := round(greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens))::numeric, 6);
    update public.market_live_state set
      current_probability = v_p,
      anchor_probability = round(greatest(5::float8, least(95::float8, coalesce(anchor_probability, current_probability)::float8 + q.impact * v_sens * 0.7))::numeric, 6),
      volume_total = volume_total + v_cout, participants_count = coalesce(participants_count, 0) + 1,
      open_yes = open_yes + case when o.side = 'oui' then q.sh::numeric else 0 end,
      open_no = open_no + case when o.side = 'non' then q.sh::numeric else 0 end,
      mm_cash = mm_cash + v_cout, fees = fees + v_fee,
      price_history = wm.ph_push(price_history, round(v_p, 2)), seq = seq + 1, updated_at = now()
    where market_id = o.market_id;
    perform wm.group_rebalance(o.market_id, (v_p - l.current_probability)::float8);
    if v_premier then                                                                                -- XP du pari à la première exécution, pas au dépôt de l'ordre :
      perform wm.xp_add(o.user_id, 10, 'ordre');                                                     -- placer puis annuler ne rapporte rien
      perform wm.mission_progress(o.user_id, 'bet', 1);
    end if;
    perform wm.badges_check(o.user_id);
    v_res := jsonb_build_object('k', 'buy', 'sh', q.sh, 'avg', q.avg * 100, 'total', v_total, 'fee', v_fee, 'done', v_fini, 'premier', v_premier);
  else
    select * into pos from public.positions where user_id = o.user_id and market_id = o.market_id and side = o.side for update;
    v_sh := least(o.sh, coalesce(pos.shares, 0));
    if v_sh <= 0.05 then return wm.ordre_clore(o.id, 'noshares', p_notifier); end if;              -- les parts ont été vendues entre-temps
    select * into q from wm.quote_sell_cap(l.current_probability::float8, v_depth, o.side, v_sh::float8, o.lp::float8 / 100);
    if q.sh <= 1e-9 or trunc(q.pro::numeric, 2) < 0.01 then return null; end if;
    v_vendu := least(v_sh, q.sh::numeric); v_premier := o.pro = 0;
    select * into v from wm.vente_ecrire(o.user_id, o.market_id, o.side, v_vendu, q.pro, q.impact, 'limit');
    v_reste := o.sh - v_vendu; v_fini := v_reste < 0.05;
    update wm.ordres set sh = case when v_fini then 0 else v_reste end, pro = pro + v.pro, pnl = pnl + v.pnl,
      etat = case when v_fini then 'filled' else 'open' end, maj_at = now(), fin_at = case when v_fini then now() end
    where id = o.id returning * into o;
    v_res := jsonb_build_object('k', 'sell', 'sh', v_vendu, 'avg', q.avg * 100, 'pro', v.pro, 'pnl', v.pnl, 'done', v_fini, 'premier', v_premier,
      'hist', jsonb_build_object('k', 'sell', 'm', o.market_id, 'q', 'via|limit', 's', o.side, 'win', v.pnl >= 0, 'pnl', v.pnl, 'at', (extract(epoch from now()) * 1000)::bigint));
  end if;

  perform wm.tick_emit(v_ids);
  if p_notifier then
    if v_fini or v_premier then                                                                      -- première et dernière exécution : notification
      perform wm.notify(o.user_id, 'check', 'ordre_execute', (v_res - 'hist') || jsonb_build_object('id', o.id, 'm', o.market_id, 's', o.side), '#marche-' || o.market_id);
    else                                                                                             -- entre les deux : l'écran se met à jour, sans notification
      perform realtime.send(jsonb_build_object('k', 'ordre', 'id', o.id), 'maj', 'joueur:' || o.user_id::text, true);
    end if;
  end if;
  return v_res || jsonb_build_object('ordre', wm.ordre_json(o));
end $$;

-- ── Stop loss / take profit : vente de toute la position au marché quand la meilleure demande passe le seuil ──
create or replace function wm.protection_verifier(p_user uuid, p_market text, p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g wm.protections; s public.user_stats; mk public.markets; l public.market_live_state; pos public.positions; q record; v record;
  v_ids text[]; v_depth float8; v_bid float8; v_via text; v_vendu numeric;
begin
  select * into s from public.user_stats where user_id = p_user for update skip locked;
  if not found then return null; end if;
  select * into g from wm.protections x where x.user_id = p_user and x.market_id = p_market and x.side = p_side for update;
  if not found then return null; end if;
  select * into mk from public.markets where id = p_market;
  if not found or coalesce(mk.status, 'open') <> 'open' then return null; end if;
  v_ids := wm.fratrie(p_market);
  perform 1 from public.market_live_state x where x.market_id = any (v_ids) order by x.market_id for update;
  select * into l from public.market_live_state where market_id = p_market;
  if not found then return null; end if;
  select * into pos from public.positions where user_id = p_user and market_id = p_market and side = p_side for update;
  if not found or pos.shares <= 0.05 then                                                            -- plus de position : la protection n'a plus d'objet
    delete from wm.protections x where x.user_id = p_user and x.market_id = p_market and x.side = p_side;
    return jsonb_build_object('retiree', true);
  end if;
  v_depth := wm.depth(l.volume_total::float8, l.liquidity_depth::float8);
  v_bid := wm.meilleure_demande(l.current_probability::float8, v_depth, p_side) * 100;
  v_via := case when g.stop > 0 and v_bid <= g.stop then 'stop' when g.tp > 0 and v_bid >= g.tp then 'tp' end;
  if v_via is null then return null; end if;
  select * into q from wm.quote_sell(l.current_probability::float8, v_depth, p_side, pos.shares::float8);
  if q.sh <= 1e-9 or trunc(q.pro::numeric, 2) < 0.01 then return null; end if;
  v_vendu := least(pos.shares, q.sh::numeric);
  select * into v from wm.vente_ecrire(p_user, p_market, p_side, v_vendu, q.pro, q.impact, v_via);
  perform wm.tick_emit(v_ids);
  perform wm.notify(p_user, 'shield', 'protection', jsonb_build_object('k', v_via, 'm', p_market, 's', p_side, 'sh', v_vendu, 'avg', q.avg * 100, 'pnl', v.pnl), '#profil');
  return jsonb_build_object('k', v_via, 'sh', v_vendu, 'pro', v.pro, 'pnl', v.pnl, 'reste', v.reste);
end $$;

-- ── Marché résolu : les ordres en attente sont annulés (réserves rendues), les protections retirées ──
create or replace function wm.ordres_marche(p_market text, p_issue text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select x.id from wm.ordres x where x.market_id = p_market and x.etat = 'open' order by x.id loop
    if wm.ordre_clore(r.id, 'closed') is not null then n := n + 1; end if;
  end loop;
  delete from wm.protections g where g.market_id = p_market;
  return n;
end $$;

-- ── Tâche de fond : toutes les 3 secondes ──
create or replace function wm.ordres_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v jsonb; n_o integer := 0; n_g integer := 0;
begin
  if not exists (select 1 from wm.ordres where etat = 'open') and not exists (select 1 from wm.protections) then
    return jsonb_build_object('ordres', 0, 'protections', 0);
  end if;
  for r in select m.id from public.markets m where m.status = 'resolved'                              -- filet : la résolution le fait déjà
             and (exists (select 1 from wm.ordres o where o.market_id = m.id and o.etat = 'open') or exists (select 1 from wm.protections g where g.market_id = m.id)) loop
    perform wm.ordres_marche(r.id);
  end loop;
  for r in select o.id from wm.ordres o
             join public.markets m on m.id = o.market_id
             join public.market_live_state l on l.market_id = o.market_id
           where o.etat = 'open' and coalesce(m.status, 'open') = 'open' and (
             (o.kind = 'buy' and o.lp::float8 / 100 > wm.meilleure_offre(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), o.side) + 1e-12)
             or (o.kind = 'sell' and (o.lp::float8 / 100 < wm.meilleure_demande(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), o.side) - 1e-12
                  or not exists (select 1 from public.positions p where p.user_id = o.user_id and p.market_id = o.market_id and p.side = o.side and p.shares > 0.05))))
           order by o.market_id, o.id loop
    begin
      v := wm.ordre_remplir(r.id, false, true);
      if v is not null then n_o := n_o + 1; end if;
    exception when others then                                                                       -- un ordre en erreur ne bloque pas les autres
      raise warning 'ordre % non traité : %', r.id, sqlerrm;
    end;
  end loop;
  for r in select g.user_id, g.market_id, g.side from wm.protections g
             join public.markets m on m.id = g.market_id
             join public.market_live_state l on l.market_id = g.market_id
             left join public.positions p on p.user_id = g.user_id and p.market_id = g.market_id and p.side = g.side
           where coalesce(m.status, 'open') = 'open' and (coalesce(p.shares, 0) <= 0.05
             or (g.stop > 0 and wm.meilleure_demande(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), g.side) * 100 <= g.stop)
             or (g.tp > 0 and wm.meilleure_demande(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), g.side) * 100 >= g.tp))
           order by g.market_id, g.user_id loop
    begin
      v := wm.protection_verifier(r.user_id, r.market_id, r.side);
      if v is not null then n_g := n_g + 1; end if;
    exception when others then
      raise warning 'protection non traitée (% sur %) : %', r.user_id, r.market_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('ordres', n_o, 'protections', n_g);
end $$;

-- ── Placer un ordre : p = { m, s, k: 'buy' | 'sell', lp, amt (achat, en $) ou sh (vente, en parts), key } ──
create or replace function wm.order_place(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_key uuid := nullif(p ->> 'key', '')::uuid; v_m text := p ->> 'm'; v_s text := p ->> 's'; v_k text := p ->> 'k';
  v_lp numeric := wm.num(p ->> 'lp'); v_amt numeric; v_sh numeric; v_solde numeric; v_premier boolean; v_fill jsonb; v_prev jsonb; v_res jsonb;
  s public.user_stats; mk public.markets; pos public.positions; o wm.ordres;
begin
  if v_s is null or v_s not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_k is null or v_k not in ('buy', 'sell') then perform wm.fail('ordre_invalide'); end if;
  if v_lp is null or v_lp <> trunc(v_lp) or v_lp < 1 or v_lp > 99 then perform wm.fail('prix_invalide'); end if;
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select x.result into v_prev from wm.ops x where x.user_id = v_uid and x.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  select * into mk from public.markets where id = v_m;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
  if (select count(*) from wm.ordres x where x.user_id = v_uid and x.etat = 'open') >= 50 then perform wm.fail('trop_ordres'); end if;   -- borne technique

  if v_k = 'buy' then
    v_amt := round(wm.num(p ->> 'amt'), 2);
    if v_amt is null or v_amt < 1 then perform wm.fail('montant_min'); end if;
    if s.balance < v_amt then perform wm.fail('solde_insuffisant'); end if;
    v_premier := not exists (select 1 from wm.ordres x where x.user_id = v_uid and x.kind = 'buy');
    update public.user_stats set balance = balance - v_amt where user_id = v_uid returning balance into v_solde;   -- le montant est réservé
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_amt, v_solde, 'ordre', v_m || ':' || v_s);
    insert into wm.ordres (user_id, market_id, side, kind, lp, init, cash) values (v_uid, v_m, v_s, 'buy', v_lp, v_amt, v_amt) returning * into o;
    if v_premier then perform wm.xp_add(v_uid, 15, 'ordre'); end if;                                  -- premier ordre limite du joueur (une seule fois)
  else
    select * into pos from public.positions where user_id = v_uid and market_id = v_m and side = v_s;
    if not found or pos.shares <= 0.05 then perform wm.fail('position_absente'); end if;
    v_sh := least(wm.num(p ->> 'sh'), pos.shares);
    if v_sh is null or v_sh <= 0.05 then perform wm.fail('quantite_invalide'); end if;
    insert into wm.ordres (user_id, market_id, side, kind, lp, init, sh) values (v_uid, v_m, v_s, 'sell', v_lp, v_sh, v_sh) returning * into o;
  end if;

  v_fill := wm.ordre_remplir(o.id, true, false);                                                     -- ce qui peut s'exécuter l'est tout de suite
  select * into o from wm.ordres x where x.id = o.id;
  perform wm.notify(v_uid, 'check', 'ordre_place', jsonb_build_object('id', o.id, 'k', v_k, 'm', v_m, 's', v_s, 'lp', o.lp, 'n', o.init, 'done', o.etat = 'filled'), '#marche-' || v_m);
  v_res := wm.reponse(v_uid, wm.ordres_reponse(v_uid, v_m) || jsonb_build_object('ordre', wm.ordre_json(o), 'fill', v_fill - 'ordre'));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'ordre', v_res);
  return v_res;
end $$;

create or replace function wm.order_cancel(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); o wm.ordres; v jsonb;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into o from wm.ordres x where x.id = p_id and x.user_id = v_uid and x.etat = 'open';
  if not found then perform wm.fail('ordre_indisponible'); end if;
  v := wm.ordre_clore(o.id, 'user', false, true);
  if v is null then perform wm.fail('ordre_indisponible'); end if;
  return wm.reponse(v_uid, wm.ordres_reponse(v_uid, o.market_id) || jsonb_build_object('ordre', v -> 'ordre', 'rendu', v -> 'rendu'));
end $$;

-- ── Protéger une position : p = { m, s, stop, tp } (¢ ; 0 ou absent = pas de seuil) ──
create or replace function wm.guard_set(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_m text := p ->> 'm'; v_s text := p ->> 's';
  v_stop numeric := coalesce(wm.num(p ->> 'stop'), 0); v_tp numeric := coalesce(wm.num(p ->> 'tp'), 0); v_px float8;
  mk public.markets; l public.market_live_state;
begin
  if v_s is null or v_s not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_stop <> trunc(v_stop) or v_tp <> trunc(v_tp) or v_stop < 0 or v_stop > 99 or v_tp < 0 or v_tp > 99 then perform wm.fail('prix_invalide'); end if;
  if v_stop = 0 and v_tp = 0 then perform wm.fail('seuil_absent'); end if;
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into mk from public.markets where id = v_m;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
  if not exists (select 1 from public.positions x where x.user_id = v_uid and x.market_id = v_m and x.side = v_s and x.shares > 0.05) then perform wm.fail('position_absente'); end if;
  select * into l from public.market_live_state where market_id = v_m;
  if not found then perform wm.fail('marche_inconnu'); end if;
  v_px := case when v_s = 'oui' then l.current_probability else 100 - l.current_probability end::float8;
  if v_stop > 0 and v_stop >= v_px then perform wm.fail('stop_invalide'); end if;                    -- sous le prix actuel
  if v_tp > 0 and v_tp <= v_px then perform wm.fail('tp_invalide'); end if;                          -- au-dessus du prix actuel
  insert into wm.protections (user_id, market_id, side, stop, tp) values (v_uid, v_m, v_s, v_stop, v_tp)
  on conflict (user_id, market_id, side) do update set stop = excluded.stop, tp = excluded.tp, cree_at = now();
  return wm.reponse(v_uid, jsonb_build_object('guards', wm.protections_json(v_uid)));
end $$;

create or replace function wm.guard_del(p_market text, p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  delete from wm.protections g where g.user_id = v_uid and g.market_id = p_market and g.side = p_side;
  return wm.reponse(v_uid, jsonb_build_object('guards', wm.protections_json(v_uid)));
end $$;

create or replace function public.api_order_place(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.order_place(p) $$;
create or replace function public.api_order_cancel(p_id bigint) returns jsonb language sql security invoker set search_path = '' as $$ select wm.order_cancel(p_id) $$;
create or replace function public.api_guard_set(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.guard_set(p) $$;
create or replace function public.api_guard_del(p_market text, p_side text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.guard_del(p_market, p_side) $$;

-- ── Le lot enregistre ses blocs : l'état du joueur porte ses ordres et ses protections ; à la résolution d'un marché,
--    ses ordres en attente sont annulés. Aucune fonction commune n'est réécrite (voir …_etat_blocs.sql). ──
insert into wm.etat_blocs (cle, fonction, ordre) values ('orders', 'wm.ordres_json', 60), ('guards', 'wm.protections_json', 70)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre;
insert into wm.suites_blocs (cle, fonction, ordre) values ('ordres', 'wm.ordres_marche', 30)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre;

select cron.schedule('wm-ordres', '3 seconds', 'select wm.ordres_tick()');

select wm.droits();
