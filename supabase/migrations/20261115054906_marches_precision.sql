-- Prix des marchés : 6 décimales au lieu de 2, et comptes au centime près.
--
--  * Avec 2 décimales, l'effet d'un petit ordre sur le prix (moins de 0,005 point) disparaissait à l'arrondi : sur un
--    marché profond, un pari de 50 $ ne faisait pas bouger le prix, et un gros ordre découpé en petits ne payait plus
--    son impact. Le mode Démo, lui, garde toute la précision. Le serveur fait maintenant pareil.
--    (Test : tests/sql/moteur.spec.mjs, « un ordre découpé en petits paie le même impact ».)
--  * Le coût versé au teneur de marché est « montant débité − frais » : débit du joueur = coût + frais, au centime.
--  * La remise sur les frais (rang Diamant et plus) est calculée sur le rang du moment, avec la même règle que l'écran.
--  * Les diffusions envoient les prix sans zéros inutiles (62.67 et non 62.670000).

alter table public.market_live_state
  alter column current_probability type numeric(9,6),
  alter column anchor_probability type numeric(9,6);

create or replace function wm.market_json(l public.market_live_state) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(trim_scale(l.current_probability), round(l.volume_total), l.participants_count, l.liquidity_depth)
$$;

create or replace function wm.markets() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'm', coalesce(jsonb_object_agg(l.market_id, jsonb_build_object(
      'p', trim_scale(l.current_probability), 'd0', coalesce(l.d0, m.initial_probability, round(l.current_probability, 2)), 'vol', round(l.volume_total),
      'people', l.participants_count, 'liq', l.liquidity_depth, 'st', m.status,
      'hot', case when l.hot_until > now() then (extract(epoch from l.hot_until) * 1000)::bigint end,
      'ph', coalesce(l.price_history, '[]'::jsonb))), '{}'::jsonb))
  from public.market_live_state l join public.markets m on m.id = l.market_id
$$;

-- L'issue p_market vient de bouger de p_delta points : les autres compensent au prorata de leur poids, puis l'écart
-- d'arrondi est porté par la plus probable d'entre elles. Le total fait exactement 100.
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
      set current_probability = round(greatest(1::float8, least(97::float8, l.current_probability::float8 - p_delta * l.current_probability::float8 / v_tot))::numeric, 6),
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

-- ── Acheter ─────────────────────────────────────────────────────────────────────────────────────
create or replace function wm.buy(p_market text, p_side text, p_total numeric, p_key uuid, p_opts jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid();
  v_total numeric := round(p_total, 2);
  s public.user_stats; mk public.markets; l public.market_live_state; q record;
  v_prev jsonb; v_ids text[]; v_sens integer := case when p_side = 'oui' then 1 else -1 end;
  v_p numeric; v_fee numeric; v_cout numeric; v_solde numeric; v_tier integer; v_pos public.positions; v_res jsonb;
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

  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  select * into q from wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), mk.category, coalesce(v_tier, 0) >= 5, p_side, v_total::float8);
  if not q.complet or q.sh <= 0 then perform wm.fail('liquidite'); end if;         -- seule la liquidité du marché limite la mise

  v_fee := round(q.fee::numeric, 2);
  v_cout := v_total - v_fee;                                                          -- débit du joueur = coût + frais, au centime
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

  v_p := round(greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens))::numeric, 6);
  update public.market_live_state set
    current_probability = v_p,
    anchor_probability = round(greatest(5::float8, least(95::float8, coalesce(anchor_probability, current_probability)::float8 + q.impact * v_sens * 0.7))::numeric, 6),
    volume_total = volume_total + v_cout, participants_count = coalesce(participants_count, 0) + 1,
    open_yes = open_yes + case when p_side = 'oui' then q.sh::numeric else 0 end,
    open_no = open_no + case when p_side = 'non' then q.sh::numeric else 0 end,
    mm_cash = mm_cash + v_cout, fees = fees + v_fee,
    price_history = wm.ph_push(price_history, round(v_p, 2)), seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform wm.group_rebalance(p_market, (v_p - l.current_probability)::float8);

  perform wm.xp_add(v_uid, 10, 'pari');
  perform wm.mission_progress(v_uid, 'bet', 1);
  perform wm.badges_check(v_uid);
  perform wm.notify(v_uid, 'check', 'bet_placed', jsonb_build_object('amt', v_total, 's', p_side, 'm', p_market), '#profil');
  perform wm.tick_emit(v_ids);

  v_res := wm.reponse(v_uid, jsonb_build_object(
    'pos', jsonb_build_object('m', p_market, 's', p_side, 'sh', v_pos.shares, 'avg', v_pos.average_price),
    'q', jsonb_build_object('sh', q.sh, 'avg', q.avg * 100, 'fee', v_fee, 'total', v_total, 'cost', v_cout, 'impact', q.impact),
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
  v_sh numeric; v_pro numeric; v_pnl numeric; v_solde numeric; v_reste numeric; v_p numeric; v_res jsonb;
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

  v_p := round(greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens))::numeric, 6);
  update public.market_live_state set
    current_probability = v_p, volume_total = volume_total + v_pro,
    open_yes = greatest(0, open_yes - case when p_side = 'oui' then pos.shares - v_reste else 0 end),
    open_no = greatest(0, open_no - case when p_side = 'non' then pos.shares - v_reste else 0 end),
    mm_cash = mm_cash - v_pro,
    price_history = wm.ph_push(price_history, round(v_p, 2)), seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform wm.group_rebalance(p_market, (v_p - l.current_probability)::float8);
  perform wm.tick_emit(v_ids);

  v_res := wm.reponse(v_uid, jsonb_build_object(
    'pos', jsonb_build_object('m', p_market, 's', p_side, 'sh', v_reste, 'avg', pos.average_price),
    'q', jsonb_build_object('sh', v_sh, 'pro', v_pro, 'pnl', v_pnl, 'avg', q.avg * 100, 'impact', q.impact),
    'hist', jsonb_build_object('k', 'sell', 'm', p_market, 's', p_side, 'win', v_pnl >= 0, 'pnl', v_pnl, 'at', (extract(epoch from now()) * 1000)::bigint),
    'marches', (select jsonb_object_agg(x.market_id, wm.market_json(x)) from public.market_live_state x where x.market_id = any (v_ids))));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'sell', v_res);
  return v_res;
end $$;

select wm.droits();
