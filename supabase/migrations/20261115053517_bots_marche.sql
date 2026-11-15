-- Bots teneurs de marché (lot 3) : un seul moteur, côté serveur, qui anime tous les marchés pour tout le monde.
--
-- Portage de la logique du mode Démo (js/core.js : botBet, driftAnchors, burst ; js/engine.js : growLiq) :
--   * chaque marché a une ancre qui dérive lentement ; les bots misent de façon à ramener le prix vers l'ancre ;
--   * de temps en temps, une rafale dans un sens (« signal de foule ») ;
--   * la profondeur du carnet suit le volume avec un temps de retard ;
--   * les issues d'un même marché totalisent toujours 100 %.
-- Budget : un tick toutes les 3 secondes, 4 à 5 mises agrégées par tick, AUCUNE ligne créée par action de bot
-- (les marchés sont mis à jour en place) et un seul message diffusé par tick, avec tous les marchés modifiés.
-- Réglage : wm.config, clé « bots » → { "actif": true|false, "intensite": 0 à 3 }.

-- Une rafale : 10 à 19 mises dans le même sens sur un marché. Renvoie le signal à diffuser.
create or replace function wm.bots_burst() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mk record; v_sens integer; v_n integer; v_p float8; v_anchor float8; v_vol float8 := 0; v_people integer := 0; v_p0 numeric;
begin
  select l.market_id, l.current_probability::float8 as p, coalesce(l.anchor_probability, l.current_probability)::float8 as anchor
    into mk
  from public.market_live_state l join public.markets m on m.id = l.market_id
  where coalesce(m.status, 'open') = 'open'
  order by -ln(greatest(random(), 1e-12)) / greatest(0.05, coalesce(m.heat_level, 1)::float8) limit 1;
  if mk.market_id is null then return null; end if;
  perform 1 from public.market_live_state x where x.market_id = any (wm.fratrie(mk.market_id)) order by x.market_id for update;
  select l.current_probability::float8, coalesce(l.anchor_probability, l.current_probability)::float8, l.current_probability
    into v_p, v_anchor, v_p0 from public.market_live_state l where l.market_id = mk.market_id;
  -- 6 fois sur 10 dans le sens du favori, sinon à contre-courant
  v_sens := case when (random() < 0.6) = (v_p > 50) then 1 else -1 end;
  v_n := 10 + floor(random() * 10)::int;
  for i in 1..v_n loop
    v_p := greatest(3::float8, least(97::float8, v_p + v_sens * (0.22 + random() * 0.3)));
    v_anchor := greatest(5::float8, least(95::float8, v_anchor + v_sens * 0.2));
    v_vol := v_vol + 600 + random() * 3000;
    if random() < 0.5 then v_people := v_people + 1; end if;
  end loop;
  update public.market_live_state set
    current_probability = round(v_p::numeric, 2), anchor_probability = round(v_anchor::numeric, 2),
    volume_total = volume_total + round(v_vol::numeric), participants_count = coalesce(participants_count, 0) + v_people,
    hot_until = now() + interval '90 seconds',
    price_history = wm.ph_push(price_history, round(v_p::numeric, 2)), seq = seq + 1, updated_at = now()
  where market_id = mk.market_id;
  perform wm.group_rebalance(mk.market_id, (round(v_p::numeric, 2) - v_p0)::float8);
  return jsonb_build_object('m', mk.market_id, 's', case when v_sens > 0 then 'oui' else 'non' end,
    'n', 40 + floor(random() * 80)::int, 'mins', 5, 'from', round(v_p0), 'to', round(v_p::numeric));
end $$;

create or replace function wm.bots_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_n integer; v_ids text[] := '{}'; v_bets jsonb := '[]'::jsonb; v_sig jsonb;
  mk record; v_p float8; v_anchor float8; v_p0 numeric; v_new numeric; v_po float8; v_sens integer; v_a float8;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) then return; end if;
  if not pg_try_advisory_xact_lock(7788991) then return; end if;                   -- jamais deux ticks en même temps
  -- en mode Démo, un bot mise toutes les 650 ms : sur un tick de 3 s, cela fait 4 à 5 mises
  v_n := floor(4.6 * greatest(0::float8, least(3::float8, coalesce((cfg ->> 'intensite')::float8, 1))) + random())::int;

  for i in 1..v_n loop
    -- marché tiré au sort, pondéré par sa « chaleur »
    select l.market_id into mk
    from public.market_live_state l join public.markets m on m.id = l.market_id
    where coalesce(m.status, 'open') = 'open'
    order by -ln(greatest(random(), 1e-12)) / greatest(0.05, coalesce(m.heat_level, 1)::float8) limit 1;
    exit when mk.market_id is null;
    perform 1 from public.market_live_state x where x.market_id = any (wm.fratrie(mk.market_id)) order by x.market_id for update;
    select l.current_probability::float8, coalesce(l.anchor_probability, l.current_probability)::float8, l.current_probability
      into v_p, v_anchor, v_p0 from public.market_live_state l where l.market_id = mk.market_id;
    -- plus le prix est sous l'ancre, plus la mise a de chances d'être un achat de Oui
    v_po := greatest(0.12::float8, least(0.88::float8, 0.5 + (v_anchor - v_p) * 0.05));
    v_sens := case when random() < v_po then 1 else -1 end;
    v_a := power(random(), 2.3::float8);
    v_new := round(greatest(3::float8, least(97::float8, v_p + v_sens * (0.04 + v_a * 0.5)))::numeric, 2);
    update public.market_live_state set
      current_probability = v_new, volume_total = volume_total + round((30 + v_a * 2800)::numeric),
      participants_count = coalesce(participants_count, 0) + case when random() < 0.3 then 1 else 0 end,
      price_history = wm.ph_push(price_history, v_new), seq = seq + 1, updated_at = now()
    where market_id = mk.market_id;
    perform wm.group_rebalance(mk.market_id, (v_new - v_p0)::float8);
    v_ids := v_ids || wm.fratrie(mk.market_id);
    v_bets := v_bets || jsonb_build_array(jsonb_build_array(mk.market_id, v_sens, round(v_a::numeric, 2)));
  end loop;

  -- dérive des ancres : en moyenne toutes les 10 secondes
  if random() < 0.3 then
    update public.market_live_state l set anchor_probability = round(greatest(5::float8, least(95::float8, coalesce(l.anchor_probability, l.current_probability)::float8 + (random() - 0.5) * 1.4))::numeric, 2)
    from public.markets m where m.id = l.market_id and coalesce(m.status, 'open') = 'open';
  end if;
  -- profondeur du carnet : rattrape 1 % de l'écart avec sa cible (0,6 % du volume), en moyenne toutes les 15 secondes
  if random() < 0.2 then
    update public.market_live_state l set liquidity_depth = round((greatest(400, coalesce(l.liquidity_depth, 400)) + (greatest(400, l.volume_total * 0.006) - greatest(400, coalesce(l.liquidity_depth, 400))) * 0.01)::numeric, 2)
    where greatest(400, l.volume_total * 0.006) > greatest(400, coalesce(l.liquidity_depth, 400));
    v_ids := v_ids || array(select l.market_id from public.market_live_state l);
  end if;
  -- rafale : en moyenne toutes les 47 secondes (26 s × 55 % en mode Démo)
  if random() < 3.0 / 47 * greatest(0::float8, least(3::float8, coalesce((cfg ->> 'intensite')::float8, 1))) then
    v_sig := wm.bots_burst();
    if v_sig is not null then v_ids := v_ids || wm.fratrie(v_sig ->> 'm'); end if;
  end if;

  if array_length(v_ids, 1) is null and v_sig is null then return; end if;
  perform wm.tick_emit(array(select distinct x from unnest(v_ids) x),
    jsonb_build_object('b', v_bets) || case when v_sig is null then '{}'::jsonb else jsonb_build_object('sig', v_sig) end);
end $$;

select wm.droits();

-- ── Planification ───────────────────────────────────────────────────────────────────────────────
-- Les deux anciennes tâches (elles poussaient les prix vers 2 % et 98 % et se bloquaient entre elles) sont arrêtées.
-- « flash-tick-server » reste en place tant que l'ancien front est en ligne : il règle ses paris éclair.
select cron.unschedule('bot-tick');
select cron.unschedule('bot-burst');
select cron.schedule('wm-bots', '3 seconds', 'select wm.bots_tick()');
