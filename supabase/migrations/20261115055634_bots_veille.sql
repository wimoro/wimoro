-- Bots : mode veille quand aucun joueur n'est connecté.
--
-- Mesure en production (tick toutes les 3 secondes, diffusion à chaque tick) : 28 800 messages par jour, 920 octets en
-- moyenne, gardés 3 jours par Supabase, soit environ 150 Mo en permanence sur les 500 Mo de l'offre gratuite, même si
-- personne ne regarde. Désormais :
--   * un joueur présent se signale (au chargement des marchés, puis toutes les 4 minutes tant que l'onglet est visible) ;
--   * sans présence depuis 6 minutes, les bots passent en veille : un tick sur dix seulement (les prix continuent de
--     vivre, lentement) et plus aucune diffusion ;
--   * dès qu'un joueur revient, le rythme normal reprend au tick suivant (3 secondes au plus).
-- Les messages sont aussi plus légers : seuls les marchés réellement modifiés sont envoyés.

create or replace function wm.present() returns void
language sql security definer set search_path = '' as $$
  insert into wm.config (key, value, updated_at) values ('presence', '{}'::jsonb, now())
  on conflict (key) do update set updated_at = now() where wm.config.updated_at < now() - interval '30 seconds'
$$;
create or replace function public.api_present() returns void
language sql security invoker set search_path = '' as $$ select wm.present() $$;

-- Lire les marchés, c'est être là : la lecture réveille les bots.
create or replace function wm.markets() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform wm.present();
  return (
    select jsonb_build_object(
      'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
      'm', coalesce(jsonb_object_agg(l.market_id, jsonb_build_object(
        'p', trim_scale(l.current_probability), 'd0', coalesce(l.d0, m.initial_probability, round(l.current_probability, 2)), 'vol', round(l.volume_total),
        'people', l.participants_count, 'liq', l.liquidity_depth, 'st', m.status,
        'hot', case when l.hot_until > now() then (extract(epoch from l.hot_until) * 1000)::bigint end,
        'ph', coalesce(l.price_history, '[]'::jsonb))), '{}'::jsonb))
    from public.market_live_state l join public.markets m on m.id = l.market_id);
end $$;
create or replace function public.api_markets() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.markets() $$;

create or replace function wm.bots_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_present boolean := coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false);
  v_int float8 := greatest(0::float8, least(3::float8, coalesce((cfg ->> 'intensite')::float8, 1)));
  v_n integer; v_ids text[] := '{}'; v_bets jsonb := '[]'::jsonb; v_sig jsonb;
  mk record; v_p float8; v_anchor float8; v_p0 numeric; v_new numeric; v_po float8; v_sens integer; v_a float8;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) then return; end if;
  if not v_present and random() >= 0.1 then return; end if;                        -- veille : un tick sur dix
  if not pg_try_advisory_xact_lock(7788991) then return; end if;                   -- jamais deux ticks en même temps
  -- en mode Démo, un bot mise toutes les 650 ms : sur un tick de 3 s, cela fait 4 à 5 mises
  v_n := floor(4.6 * v_int + random())::int;

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
    with maj as (
      update public.market_live_state l set liquidity_depth = round((greatest(400, coalesce(l.liquidity_depth, 400)) + (greatest(400, l.volume_total * 0.006) - greatest(400, coalesce(l.liquidity_depth, 400))) * 0.01)::numeric, 2)
      where greatest(400, l.volume_total * 0.006) > greatest(400, coalesce(l.liquidity_depth, 400)) + 0.5
      returning l.market_id)
    select v_ids || coalesce(array_agg(maj.market_id), '{}') into v_ids from maj;
  end if;
  -- rafale : en moyenne toutes les 47 secondes (26 s × 55 % en mode Démo)
  if random() < 3.0 / 47 * v_int then
    v_sig := wm.bots_burst();
    if v_sig is not null then v_ids := v_ids || wm.fratrie(v_sig ->> 'm'); end if;
  end if;

  if not v_present then return; end if;                                            -- veille : personne à qui diffuser
  if array_length(v_ids, 1) is null and v_sig is null then return; end if;
  perform wm.tick_emit(array(select distinct x from unnest(v_ids) x),
    jsonb_build_object('b', v_bets) || case when v_sig is null then '{}'::jsonb else jsonb_build_object('sig', v_sig) end);
end $$;

-- ── Qui a le droit d'appeler quoi : « present » s'ajoute aux fonctions des joueurs ───────────────
create or replace function wm.droits() returns void
language plpgsql security definer set search_path = '' as $$
declare
  joueur text[] := array['state', 'profile_update', 'onboarding', 'rank_seen', 'prefs_save', 'notifs_read', 'notif_hide', 'buy', 'sell', 'present'];
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
