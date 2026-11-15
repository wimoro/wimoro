-- Marchés et paris (lot 2) : moteur de prix côté serveur, achat, vente, état des marchés.
--
--  * Le moteur reprend exactement les formules de js/engine.js (carnet d'ordres, frais, impact) : pour un même état
--    du marché, l'aperçu du ticket et l'exécution donnent le même résultat. Vérifié par tests/sql/moteur.spec.mjs,
--    qui compare les deux sur des centaines de cas tirés au hasard.
--  * Acheter et vendre sont atomiques : verrou du joueur, puis du marché (et de ses frères si le marché a plusieurs
--    issues), toujours dans le même ordre. Une clé d'idempotence empêche qu'une opération soit appliquée deux fois.
--  * Chaque part achetée par un joueur a pour contrepartie le teneur de marché (les bots) : open_yes / open_no
--    comptent les parts en circulation, mm_cash l'argent reçu des joueurs. À la résolution, les gagnants sont
--    payés 1 $ par part : la plateforme n'est jamais exposée par un pari.
--  * Les issues d'un même marché totalisent toujours 100 %.

-- ── Réglages et clés d'idempotence ──────────────────────────────────────────────────────────────
create table if not exists wm.config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table wm.config enable row level security;
insert into wm.config (key, value) values ('bots', '{"actif": true, "intensite": 1}'::jsonb) on conflict (key) do nothing;

create table if not exists wm.ops (
  user_id uuid not null references public.users(id) on delete cascade,
  key uuid not null,
  op text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table wm.ops enable row level security;
create index if not exists idx_ops_date on wm.ops (created_at);

-- ── Colonnes ────────────────────────────────────────────────────────────────────────────────────
alter table public.market_live_state
  add column if not exists d0 numeric(5,2),
  add column if not exists open_yes numeric(20,8) not null default 0,
  add column if not exists open_no numeric(20,8) not null default 0,
  add column if not exists mm_cash numeric(18,2) not null default 0,
  add column if not exists fees numeric(18,2) not null default 0,
  add column if not exists hot_until timestamptz,
  add column if not exists seq bigint not null default 0;
alter table public.positions
  alter column shares type numeric(20,8),
  alter column average_price type numeric(12,6);
create index if not exists idx_ledger_user_date on public.balance_ledger (user_id, created_at desc);

-- ── Moteur (js/engine.js) ───────────────────────────────────────────────────────────────────────
-- taux de frais : barème par catégorie × 70 %, × 90 % à partir du rang Diamant
create or replace function wm.fee_rate(p_cat text, p_disc boolean) returns float8
language sql immutable set search_path = '' as $$
  select (case p_cat when 'Crypto' then 0.07 when 'Tech et IA' then 0.04 when 'Bourse' then 0.04 when 'Matières' then 0.04 when 'Devises' then 0.04 else 0.05 end)::float8
         * 0.70::float8 * (case when p_disc then 0.90 else 1 end)::float8
$$;
-- profondeur du carnet, en parts par cent de prix
create or replace function wm.depth(p_vol float8, p_liq float8) returns float8
language sql immutable set search_path = '' as $$
  select greatest(400::float8, coalesce(p_liq, greatest(400::float8, coalesce(p_vol, 0) * 0.006::float8)))
$$;

-- Devis d'achat : `p_total` est ce que le joueur débite, frais compris (quoteBuy).
create or replace function wm.quote_buy(p_p float8, p_depth float8, p_cat text, p_disc boolean, p_side text, p_total float8,
  out sh float8, out cost float8, out fee float8, out avg float8, out impact float8, out complet boolean, out max_total float8)
language plpgsql immutable set search_path = '' as $$
declare
  d float8 := p_depth * 100;
  mid float8 := (case when p_side = 'oui' then p_p else 100 - p_p end) / 100;
  half float8 := greatest(0.1::float8, least(1.5::float8, 15 / sqrt(p_depth))) / 100;
  a0 float8 := least(0.99::float8, mid + half);
  cap float8 := greatest(0::float8, d * (0.99::float8 - a0));
  max_cost float8 := a0 * cap + cap * cap / (2 * d);
  th float8 := wm.fee_rate(p_cat, p_disc);
  a float8 := p_total / (1 + th / 2);
  c float8; s float8; av float8; f float8; na float8;
begin
  for i in 1..12 loop
    c := greatest(0::float8, least(a, max_cost));
    s := case when c > 0 then 2 * c / (a0 + sqrt(a0 * a0 + 2 * c / d)) else 0 end;
    av := case when s > 0 then c / s else a0 end;
    f := c * th * (1 - av);
    na := greatest(0::float8, p_total - f);
    if abs(na - a) < 1e-10 then a := na; exit; end if;
    a := na;
  end loop;
  c := greatest(0::float8, least(a, max_cost));
  s := case when c > 0 then 2 * c / (a0 + sqrt(a0 * a0 + 2 * c / d)) else 0 end;
  av := case when s > 0 then c / s else a0 end;
  sh := s; cost := c; avg := av;
  fee := c * th * (1 - av);
  impact := (s / d) * 100;
  complet := a <= max_cost + 1e-9;
  max_total := max_cost + max_cost * th * (1 - (case when cap > 0 then max_cost / cap else a0 end));
end $$;

-- Devis de vente : on vend `p_sh` parts en mangeant les demandes (quoteSell).
create or replace function wm.quote_sell(p_p float8, p_depth float8, p_side text, p_sh float8,
  out sh float8, out pro float8, out avg float8, out impact float8, out complet boolean)
language plpgsql immutable set search_path = '' as $$
declare
  d float8 := p_depth * 100;
  mid float8 := (case when p_side = 'oui' then p_p else 100 - p_p end) / 100;
  half float8 := greatest(0.1::float8, least(1.5::float8, 15 / sqrt(p_depth))) / 100;
  b0 float8 := greatest(0.01::float8, mid - half);
  cap float8 := greatest(0::float8, d * (b0 - 0.01::float8));
begin
  sh := greatest(0::float8, least(p_sh, cap));
  pro := sh * b0 - sh * sh / (2 * d);
  avg := case when sh > 0 then pro / sh else b0 end;
  impact := (sh / d) * 100;
  complet := p_sh <= cap + 1e-9;
end $$;

-- ── Marchés à issues multiples : les issues totalisent 100 % ────────────────────────────────────
-- L'issue p_market vient de bouger de p_delta points : les autres compensent au prorata de leur poids
-- (groupRebalance dans js/groups.js), puis l'écart d'arrondi est porté par la plus probable d'entre elles.
create or replace function wm.group_rebalance(p_market text, p_delta float8) returns void
language plpgsql security definer set search_path = '' as $$
declare v_parent text; v_tot float8; v_ecart numeric; v_gros text;
begin
  select group_parent_id into v_parent from public.markets where id = p_market;
  if v_parent is null then return; end if;
  if coalesce(p_delta, 0) <> 0 then
    select sum(l.current_probability)::float8 into v_tot
    from public.market_live_state l join public.markets m on m.id = l.market_id
    where m.group_parent_id = v_parent and m.id <> p_market;
    if coalesce(v_tot, 0) > 0 then
      update public.market_live_state l
      set current_probability = round(greatest(1::float8, least(97::float8, l.current_probability::float8 - p_delta * l.current_probability::float8 / v_tot))::numeric, 2),
          seq = l.seq + 1, updated_at = now()
      from public.markets m
      where m.id = l.market_id and m.group_parent_id = v_parent and m.id <> p_market;
    end if;
  end if;
  select 100 - sum(l.current_probability) into v_ecart
  from public.market_live_state l join public.markets m on m.id = l.market_id where m.group_parent_id = v_parent;
  if v_ecart is not null and v_ecart <> 0 then
    select l.market_id into v_gros
    from public.market_live_state l join public.markets m on m.id = l.market_id
    where m.group_parent_id = v_parent and m.id <> p_market and l.current_probability + v_ecart between 1 and 98
    order by l.current_probability desc, l.market_id limit 1;
    if v_gros is not null then
      update public.market_live_state set current_probability = current_probability + v_ecart, seq = seq + 1 where market_id = v_gros;
    end if;
  end if;
end $$;

-- ── Diffusion : un message par changement groupé, sur le sujet public « marches » ───────────────
create or replace function wm.market_json(l public.market_live_state) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(l.current_probability, round(l.volume_total), l.participants_count, l.liquidity_depth)
$$;
create or replace function wm.tick_emit(p_ids text[], p_extra jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_object_agg(l.market_id, wm.market_json(l)) into v from public.market_live_state l where l.market_id = any (p_ids);
  if v is null and (p_extra is null or p_extra = '{}'::jsonb) then return; end if;
  perform realtime.send(jsonb_build_object('t', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'm', coalesce(v, '{}'::jsonb)) || coalesce(p_extra, '{}'::jsonb), 'tick', 'marches', false);
end $$;

-- ajoute un point à l'historique court du marché (160 derniers points, pour la courbe en direct)
create or replace function wm.ph_push(p_ph jsonb, p_p numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_array_length(coalesce(p_ph, '[]'::jsonb)) >= 160
              then (coalesce(p_ph, '[]'::jsonb) - 0) || jsonb_build_array(p_p)
              else coalesce(p_ph, '[]'::jsonb) || jsonb_build_array(p_p) end
$$;

-- frères d'un marché (lui compris), pour les verrous et la diffusion
create or replace function wm.fratrie(p_market text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m2.id order by m2.id), array[p_market])
  from public.markets m join public.markets m2 on m2.id = m.id or (m.group_parent_id is not null and m2.group_parent_id = m.group_parent_id)
  where m.id = p_market
$$;

-- ── Acheter ─────────────────────────────────────────────────────────────────────────────────────
create or replace function wm.buy(p_market text, p_side text, p_total numeric, p_key uuid, p_opts jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v_total numeric := round(p_total, 2);
  s public.user_stats; mk public.markets; l public.market_live_state; q record;
  v_prev jsonb; v_ids text[]; v_sens integer := case when p_side = 'oui' then 1 else -1 end;
  v_p float8; v_fee numeric; v_solde numeric; v_pos public.positions; v_res jsonb;
begin
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_total is null or v_total < 1 then perform wm.fail('montant_min'); end if;
  if p_key is null then perform wm.fail('cle_absente'); end if;

  select * into s from public.user_stats where user_id = v_uid for update;            -- verrou du joueur, toujours en premier
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = p_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;         -- même clé : déjà appliquée, on renvoie le même résultat

  select * into mk from public.markets where id = p_market;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
  v_ids := wm.fratrie(p_market);
  perform 1 from public.market_live_state x where x.market_id = any (v_ids) order by x.market_id for update;
  select * into l from public.market_live_state where market_id = p_market;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if s.balance < v_total then perform wm.fail('solde_insuffisant'); end if;

  select * into q from wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), mk.category, coalesce(s.rank_tier, 0) >= 5, p_side, v_total::float8);
  if not q.complet or q.sh <= 0 then perform wm.fail('liquidite'); end if;         -- seule la liquidité du marché limite la mise

  v_fee := round(q.fee::numeric, 2);
  v_solde := s.balance - v_total;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1,
    bets_max_amount = greatest(coalesce(bets_max_amount, 0), v_total), profit_realized = coalesce(profit_realized, 0) - v_fee
  where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_total, v_solde, 'bet', p_market || ':' || p_side);

  insert into public.positions (user_id, market_id, side, shares, average_price)
  values (v_uid, p_market, p_side, q.sh::numeric, (q.avg * 100)::numeric)
  on conflict (user_id, market_id, side) do update set
    average_price = ((public.positions.average_price * public.positions.shares + excluded.average_price * excluded.shares) / nullif(public.positions.shares + excluded.shares, 0)),
    shares = public.positions.shares + excluded.shares, updated_at = now()
  returning * into v_pos;

  v_p := greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens));
  update public.market_live_state set
    current_probability = round(v_p::numeric, 2),
    anchor_probability = round(greatest(5::float8, least(95::float8, coalesce(anchor_probability, current_probability)::float8 + q.impact * v_sens * 0.7))::numeric, 2),
    volume_total = volume_total + round(q.cost::numeric, 2), participants_count = coalesce(participants_count, 0) + 1,
    open_yes = open_yes + case when p_side = 'oui' then q.sh::numeric else 0 end,
    open_no = open_no + case when p_side = 'non' then q.sh::numeric else 0 end,
    mm_cash = mm_cash + round(q.cost::numeric, 2), fees = fees + v_fee,
    price_history = wm.ph_push(price_history, round(v_p::numeric, 2)), seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform wm.group_rebalance(p_market, (round(v_p::numeric, 2) - l.current_probability)::float8);

  perform wm.xp_add(v_uid, 10, 'pari');
  perform wm.mission_progress(v_uid, 'bet', 1);
  perform wm.badges_check(v_uid);
  perform wm.notify(v_uid, 'check', 'bet_placed', jsonb_build_object('amt', v_total, 's', p_side, 'm', p_market), '#profil');
  perform wm.tick_emit(v_ids);

  select * into l from public.market_live_state where market_id = p_market;
  v_res := wm.reponse(v_uid, jsonb_build_object(
    'pos', jsonb_build_object('m', p_market, 's', p_side, 'sh', v_pos.shares, 'avg', v_pos.average_price),
    'q', jsonb_build_object('sh', q.sh, 'avg', q.avg * 100, 'fee', v_fee, 'total', v_total, 'cost', round(q.cost::numeric, 2), 'impact', q.impact),
    'marches', (select jsonb_object_agg(x.market_id, wm.market_json(x)) from public.market_live_state x where x.market_id = any (v_ids))));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'buy', v_res);
  return v_res;
end $$;

-- ── Vendre ──────────────────────────────────────────────────────────────────────────────────────
create or replace function wm.sell(p_market text, p_side text, p_shares numeric, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  s public.user_stats; mk public.markets; l public.market_live_state; pos public.positions; q record;
  v_prev jsonb; v_ids text[]; v_sens integer := case when p_side = 'oui' then -1 else 1 end;
  v_sh numeric; v_pro numeric; v_pnl numeric; v_solde numeric; v_reste numeric; v_p float8; v_res jsonb;
begin
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if p_shares is null or p_shares <= 0 then perform wm.fail('quantite_invalide'); end if;
  if p_key is null then perform wm.fail('cle_absente'); end if;

  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = p_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;

  select * into mk from public.markets where id = p_market;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
  v_ids := wm.fratrie(p_market);
  perform 1 from public.market_live_state x where x.market_id = any (v_ids) order by x.market_id for update;
  select * into l from public.market_live_state where market_id = p_market;
  select * into pos from public.positions where user_id = v_uid and market_id = p_market and side = p_side for update;
  if not found or pos.shares <= 0 then perform wm.fail('position_absente'); end if;

  v_sh := least(p_shares, pos.shares);
  select * into q from wm.quote_sell(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), p_side, v_sh::float8);
  if not q.complet or q.sh <= 0 then perform wm.fail('liquidite'); end if;

  v_pro := trunc(q.pro::numeric, 2);                                                  -- jamais un centime de trop
  v_pnl := v_pro - round(v_sh * pos.average_price / 100, 2);
  v_solde := s.balance + v_pro;
  v_reste := pos.shares - v_sh;
  if v_reste < 0.05 then v_reste := 0; end if;                                        -- une poussière de part ne reste pas en portefeuille
  update public.positions set shares = v_reste, updated_at = now() where id = pos.id;
  update public.user_stats set balance = v_solde, profit_realized = coalesce(profit_realized, 0) + v_pnl where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, v_pro, v_solde, 'sell', p_market || ':' || p_side);
  insert into public.position_history (user_id, kind, market_id, side, was_winner, pnl) values (v_uid, 'sell', p_market, p_side, v_pnl >= 0, v_pnl);

  v_p := greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens));
  update public.market_live_state set
    current_probability = round(v_p::numeric, 2), volume_total = volume_total + v_pro,
    open_yes = greatest(0, open_yes - case when p_side = 'oui' then pos.shares - v_reste else 0 end),
    open_no = greatest(0, open_no - case when p_side = 'non' then pos.shares - v_reste else 0 end),
    mm_cash = mm_cash - v_pro,
    price_history = wm.ph_push(price_history, round(v_p::numeric, 2)), seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform wm.group_rebalance(p_market, (round(v_p::numeric, 2) - l.current_probability)::float8);
  perform wm.tick_emit(v_ids);

  v_res := wm.reponse(v_uid, jsonb_build_object(
    'pos', jsonb_build_object('m', p_market, 's', p_side, 'sh', v_reste, 'avg', pos.average_price),
    'q', jsonb_build_object('sh', v_sh, 'pro', v_pro, 'pnl', v_pnl, 'avg', q.avg * 100, 'impact', q.impact),
    'hist', jsonb_build_object('k', 'sell', 'm', p_market, 's', p_side, 'win', v_pnl >= 0, 'pnl', v_pnl, 'at', (extract(epoch from now()) * 1000)::bigint),
    'marches', (select jsonb_object_agg(x.market_id, wm.market_json(x)) from public.market_live_state x where x.market_id = any (v_ids))));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'sell', v_res);
  return v_res;
end $$;

-- ── État des marchés, pour le démarrage ─────────────────────────────────────────────────────────
create or replace function wm.markets() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'm', coalesce(jsonb_object_agg(l.market_id, jsonb_build_object(
      'p', l.current_probability, 'd0', coalesce(l.d0, m.initial_probability, l.current_probability), 'vol', round(l.volume_total),
      'people', l.participants_count, 'liq', l.liquidity_depth, 'st', m.status,
      'hot', case when l.hot_until > now() then (extract(epoch from l.hot_until) * 1000)::bigint end,
      'ph', coalesce(l.price_history, '[]'::jsonb))), '{}'::jsonb))
  from public.market_live_state l join public.markets m on m.id = l.market_id
$$;

create or replace function public.api_markets() returns jsonb
language sql stable security invoker set search_path = '' as $$ select wm.markets() $$;
create or replace function public.api_buy(p_market text, p_side text, p_total numeric, p_key uuid, p_opts jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.buy(p_market, p_side, p_total, p_key, p_opts) $$;
create or replace function public.api_sell(p_market text, p_side text, p_shares numeric, p_key uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.sell(p_market, p_side, p_shares, p_key) $$;

-- ── Qui a le droit d'appeler quoi : une seule liste, réappliquée à chaque migration ─────────────
-- « joueur » : connecté. « visiteur » : tout le monde. « service » : Edge Functions seulement.
-- Tout le reste du schéma wm (aides, moteur, bots) n'est appelable par aucun client.
-- La fonction publique api_xxx suit les droits de wm.xxx.
create or replace function wm.droits() returns void
language plpgsql security definer set search_path = '' as $$
declare
  joueur text[] := array['state', 'profile_update', 'onboarding', 'rank_seen', 'prefs_save', 'notifs_read', 'notif_hide', 'buy', 'sell'];
  visiteur text[] := array['pseudo_libre', 'markets'];
  service text[] := array['login_lookup'];
  f record; nom text;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, n.nspname
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wm' or (n.nspname = 'public' and (p.proname like 'api\_%' or p.proname like 'srv\_%'))
  loop
    nom := case when f.nspname = 'wm' then f.proname else substr(f.proname, 5) end;
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'srv\_%' or (f.nspname = 'wm' and nom = any (service)) then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif nom = any (visiteur) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif nom = any (joueur) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
select wm.droits();

-- ── Remise en état des prix ─────────────────────────────────────────────────────────────────────
-- Les anciens bots ont poussé presque tous les marchés à 2 % ou 98 % (audit K20). On repart des valeurs de référence
-- de la table markets (celles du front), avec une courbe de départ qui y mène, et des issues qui totalisent 100 %.
update public.market_live_state l set
  current_probability = m.current_probability,
  anchor_probability = m.current_probability,
  d0 = m.initial_probability,
  liquidity_depth = greatest(400, round(l.volume_total * 0.006, 2)),
  price_history = (
    select jsonb_agg(round(greatest(2, least(98, m.initial_probability + (m.current_probability - m.initial_probability) * (i / 119.0)
             + (random() - 0.5) * 4 * (1 - i / 119.0)))::numeric, 2) order by i)
    from generate_series(0, 119) i),
  seq = l.seq + 1, updated_at = now()
from public.markets m where m.id = l.market_id;
update public.market_live_state l set price_history = jsonb_set(l.price_history, '{119}', to_jsonb(l.current_probability)) where jsonb_array_length(l.price_history) = 120;
