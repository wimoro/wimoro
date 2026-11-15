-- Argent fictif (« démo ») et jeu responsable (lot 4.7).
--
-- Dépôts, retraits et KYC restent FICTIFS : aucun prestataire de paiement, aucune vérification d'identité réelle.
-- Ils se comportent comme des vrais et sont enregistrés par le serveur :
--   * api_demo_deposit   crée un dépôt « en attente » ; il est crédité quand ses confirmations sont écoulées
--                        (l'animation d'origine est conservée : 650 ms par confirmation) ;
--   * api_demo_withdraw  débite tout de suite, puis le retrait passe à « envoyé » après quelques secondes ;
--   * api_demo_settle    règle ce qui est arrivé à échéance (appelé par l'écran à la fin de l'animation, et à chaque
--                        chargement de l'état : rien ne reste bloqué si l'onglet est fermé entre-temps) ;
--   * api_demo_kyc       valide le KYC fictif. Les nom, prénom et date de naissance saisis servent seulement au
--                        contrôle (majorité) et ne sont PAS conservés.
-- Jeu responsable, appliqué par le serveur (et plus seulement par l'écran) :
--   * plafonds de dépôt par jour, semaine, mois : une baisse s'applique tout de suite, une hausse ou une suppression
--     après 48 heures de réflexion ;
--   * pause : paris et dépôts refusés, retraits possibles, impossible à écourter ;
--   * auto-exclusion : toutes les fonctions du compte sont refusées pendant la durée choisie.
-- Les barèmes sont ceux du front (js/core.js COINS et NETS, js/views.js WFEE, js/account.js FIAT).

-- ── Colonnes ────────────────────────────────────────────────────────────────────────────────────
alter table public.deposits
  add column if not exists method text not null default 'crypto',
  add column if not exists fee numeric(15,2) not null default 0,
  add column if not exists due_at timestamptz;
alter table public.withdrawals
  add column if not exists method text not null default 'crypto',
  add column if not exists fee numeric(15,2) not null default 0,
  add column if not exists due_at timestamptz;

create table if not exists wm.rg (
  user_id uuid primary key references public.users(id) on delete cascade,
  lim jsonb not null default '{"day": 0, "week": 0, "month": 0}'::jsonb,
  pend jsonb not null default '{}'::jsonb,
  pause_until timestamptz,
  excl_until timestamptz,                       -- 'infinity' : exclusion définitive
  updated_at timestamptz not null default now()
);
alter table wm.rg enable row level security;

-- ── Aides ───────────────────────────────────────────────────────────────────────────────────────
create or replace function wm.num(t text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  v := t::numeric;
  if v = 'NaN'::numeric or v = 'Infinity'::numeric or v = '-Infinity'::numeric then return null; end if;
  return v;
exception when others then return null;
end $$;
create or replace function wm.jour(t text) returns date
language plpgsql immutable set search_path = '' as $$
begin return t::date; exception when others then return null; end $$;

create or replace function wm.argent() returns jsonb
language sql immutable set search_path = '' as $$ select '{
  "coins": {
    "USDC": {"min": 5, "fixe": true, "nets": ["Base", "Ethereum", "Arbitrum", "Solana", "Polygon"]},
    "USDT": {"min": 5, "fixe": true, "nets": ["Ethereum", "Tron", "Arbitrum", "Solana"]},
    "ETH":  {"min": 0.002, "nets": ["Ethereum", "Base", "Arbitrum"]},
    "BTC":  {"min": 0.0001, "nets": ["Bitcoin", "Lightning"]},
    "SOL":  {"min": 0.03, "nets": ["Solana"]}},
  "nets": {
    "Base": {"conf": 12, "fmt": "evm", "wfee": 0.05}, "Ethereum": {"conf": 12, "fmt": "evm", "wfee": 2},
    "Arbitrum": {"conf": 12, "fmt": "evm", "wfee": 0.1}, "Polygon": {"conf": 30, "fmt": "evm", "wfee": 0.05},
    "Solana": {"conf": 1, "fmt": "sol", "wfee": 0.01}, "Tron": {"conf": 20}, "Bitcoin": {"conf": 2}, "Lightning": {"conf": 1}},
  "fiat": {
    "card":   {"df": 0.025, "wf": 0.015, "need": 3, "pas": 650, "wd_ms": 3500},
    "bank":   {"df": 0, "wf": 0, "need": 8, "pas": 700, "wd_ms": 6000},
    "paypal": {"df": 0.019, "wf": 0.01, "need": 3, "pas": 650, "wd_ms": 3500}},
  "depot_max": 1000000, "fiat_min": 10, "fiat_max": 5000, "retrait_min": 5, "wd_ms": 4500
}'::jsonb $$;

-- ── Session : un compte en auto-exclusion ne peut plus rien appeler ─────────────────────────────
create or replace function wm.uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid(); v_excl timestamptz;
begin
  if v is null then raise exception 'session' using errcode = 'P0001'; end if;
  select r.excl_until into v_excl from wm.rg r where r.user_id = v;
  if v_excl is not null and v_excl > now() then
    raise exception 'exclu' using errcode = 'P0001',
      detail = case when v_excl = 'infinity' then '-1' else ((extract(epoch from v_excl) * 1000)::bigint)::text end;
  end if;
  return v;
end $$;

-- ── Jeu responsable ─────────────────────────────────────────────────────────────────────────────
-- État lu par l'écran : { lim: {day, week, month}, pend: {k: {v, at}}, pause: ms | 0, excl: ms | -1 | 0 }.
-- Les changements de plafond arrivés à échéance sont appliqués au passage.
create or replace function wm.rg_json(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r wm.rg; k text; v_ch boolean := false; v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into r from wm.rg where user_id = p_user;
  if not found then
    return jsonb_build_object('lim', jsonb_build_object('day', 0, 'week', 0, 'month', 0), 'pend', '{}'::jsonb, 'pause', 0, 'excl', 0);
  end if;
  for k in select jsonb_object_keys(r.pend) loop
    if (r.pend -> k ->> 'at')::bigint <= v_now then
      r.lim := jsonb_set(r.lim, array[k], r.pend -> k -> 'v'); r.pend := r.pend - k; v_ch := true;
      perform wm.notify(p_user, 'shield', 'rg_limite', jsonb_build_object('k', k, 'v', r.lim -> k), '#responsable');
    end if;
  end loop;
  if v_ch then update wm.rg set lim = r.lim, pend = r.pend, updated_at = now() where user_id = p_user; end if;
  return jsonb_build_object('lim', r.lim, 'pend', r.pend,
    'pause', case when r.pause_until > now() then (extract(epoch from r.pause_until) * 1000)::bigint else 0 end,
    'excl', case when r.excl_until = 'infinity' then -1 when r.excl_until > now() then (extract(epoch from r.excl_until) * 1000)::bigint else 0 end);
end $$;

-- Pendant une pause : ni pari ni dépôt.
create or replace function wm.rg_garde(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from wm.rg r where r.user_id = p_user and r.pause_until > now()) then perform wm.fail('pause'); end if;
end $$;

create or replace function wm.rg_limit(p_k text, p_v numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); r wm.rg; v numeric := greatest(0, round(coalesce(p_v, 0))); cur numeric; res text;
begin
  if p_k is null or p_k not in ('day', 'week', 'month') or v > 100000000 then perform wm.fail('limite_invalide'); end if;
  insert into wm.rg (user_id) values (v_uid) on conflict (user_id) do nothing;
  perform wm.rg_json(v_uid);                                                          -- applique d'abord ce qui est arrivé à échéance
  select * into r from wm.rg where user_id = v_uid for update;
  cur := coalesce((r.lim ->> p_k)::numeric, 0);
  if v = cur then
    r.pend := r.pend - p_k; res := 'same';
  elsif cur > 0 and (v = 0 or v > cur) then                                           -- hausse ou suppression : 48 heures de réflexion
    r.pend := r.pend || jsonb_build_object(p_k, jsonb_build_object('v', v, 'at', (extract(epoch from now() + interval '48 hours') * 1000)::bigint));
    res := 'pending';
  else
    r.lim := jsonb_set(r.lim, array[p_k], to_jsonb(v)); r.pend := r.pend - p_k; res := 'now';
  end if;
  update wm.rg set lim = r.lim, pend = r.pend, updated_at = now() where user_id = v_uid;
  return wm.reponse(v_uid, jsonb_build_object('rg', wm.rg_json(v_uid), 'r', res));
end $$;

create or replace function wm.rg_pend_cancel(p_k text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  update wm.rg set pend = pend - coalesce(p_k, ''), updated_at = now() where user_id = v_uid;
  return wm.reponse(v_uid, jsonb_build_object('rg', wm.rg_json(v_uid)));
end $$;

create or replace function wm.rg_pause(p_hours integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_fin timestamptz;
begin
  if p_hours is null or p_hours not in (24, 72, 168, 720) then perform wm.fail('duree_invalide'); end if;
  insert into wm.rg (user_id) values (v_uid) on conflict (user_id) do nothing;
  update wm.rg set pause_until = greatest(coalesce(pause_until, now()), now() + make_interval(hours => p_hours)), updated_at = now()   -- jamais écourtée
  where user_id = v_uid returning pause_until into v_fin;
  perform wm.notify(v_uid, 'shield', 'rg_pause', jsonb_build_object('at', (extract(epoch from v_fin) * 1000)::bigint), '#responsable');
  return wm.reponse(v_uid, jsonb_build_object('rg', wm.rg_json(v_uid)));
end $$;

create or replace function wm.rg_exclude(p_months integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_fin timestamptz;
begin
  if p_months is null or p_months not in (0, 6, 12, 36) then perform wm.fail('duree_invalide'); end if;
  insert into wm.rg (user_id) values (v_uid) on conflict (user_id) do nothing;
  update wm.rg set pause_until = null, updated_at = now(),
    excl_until = greatest(coalesce(excl_until, now()), case when p_months = 0 then 'infinity'::timestamptz else now() + make_interval(days => p_months * 30) end)
  where user_id = v_uid returning excl_until into v_fin;
  return jsonb_build_object('excl', case when v_fin = 'infinity' then -1 else (extract(epoch from v_fin) * 1000)::bigint end);
end $$;

-- ── Dépôts et retraits : ce que l'écran affiche ─────────────────────────────────────────────────
create or replace function wm.dep_json(d public.deposits) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'coin', d.coin, 'net', d.network, 'amt', d.coin_amount, 'usd', d.usd_equivalent,
    'need', d.confirmations_required, 'label', d.label, 'method', nullif(d.method, 'crypto'), 'fee', d.fee,
    'st', case when d.status = 'pending' then 'pending' else 'done' end,
    'conf', case when d.status <> 'pending' then d.confirmations_required
                 when d.due_at is null then coalesce(d.confirmations_received, 0)
                 else greatest(0, least(d.confirmations_required - 1, floor(d.confirmations_required
                      * extract(epoch from (clock_timestamp() - d.created_at)) / greatest(0.001, extract(epoch from (d.due_at - d.created_at))))))::int end,
    'at', (extract(epoch from d.created_at) * 1000)::bigint,
    'due', (extract(epoch from d.due_at) * 1000)::bigint)
$$;
create or replace function wm.wd_json(w public.withdrawals) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', w.id, 'net', w.network, 'addr', w.destination_address, 'amt', w.amount_usd, 'fee', w.fee,
    'method', nullif(w.method, 'crypto'), 'st', case when w.status = 'completed' then 'sent' else 'pending' end,
    'at', (extract(epoch from w.requested_at) * 1000)::bigint, 'due', (extract(epoch from w.due_at) * 1000)::bigint)
$$;
create or replace function wm.deps_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(wm.dep_json(x) order by x.created_at desc), '[]'::jsonb)
  from (select * from public.deposits d where d.user_id = p_user order by d.created_at desc limit 50) x
$$;
create or replace function wm.wds_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(wm.wd_json(x) order by x.requested_at desc), '[]'::jsonb)
  from (select * from public.withdrawals w where w.user_id = p_user order by w.requested_at desc limit 50) x
$$;

-- ── Règlement de ce qui est arrivé à échéance ───────────────────────────────────────────────────
create or replace function wm.demo_regler(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare d public.deposits; w public.withdrawals; v_solde numeric; n integer := 0; v_dep boolean := false;
begin
  if not exists (select 1 from public.deposits x where x.user_id = p_user and x.status = 'pending' and x.due_at <= now())
     and not exists (select 1 from public.withdrawals x where x.user_id = p_user and x.status = 'pending' and x.due_at <= now()) then
    return 0;
  end if;
  perform 1 from public.user_stats where user_id = p_user for update;                 -- verrou du joueur
  for d in select * from public.deposits x where x.user_id = p_user and x.status = 'pending' and x.due_at <= now() order by x.created_at for update loop
    update public.user_stats set balance = balance + d.usd_equivalent, deposits_count = coalesce(deposits_count, 0) + 1
    where user_id = p_user returning balance into v_solde;
    update public.deposits set status = 'completed', confirmations_received = confirmations_required where id = d.id;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, d.usd_equivalent, v_solde, 'demo_deposit', d.id::text);
    if p_user = auth.uid() then perform wm.ev(jsonb_build_object('k', 'dep', 'id', d.id, 'usd', d.usd_equivalent)); end if;
    perform wm.notify(p_user, 'wallet', 'dep_credited', jsonb_build_object('usd', d.usd_equivalent, 'amt', d.coin_amount, 'coin', d.coin, 'net', d.network, 'method', nullif(d.method, 'crypto')), '#depot');
    perform wm.mission_progress(p_user, 'dep', 1);
    update public.user_stats set deposits_last_date = current_date where user_id = p_user and deposits_last_date is distinct from current_date;
    if found then perform wm.xp_add(p_user, 100, 'depot'); end if;                    -- 100 XP au premier dépôt de la journée
    n := n + 1; v_dep := true;
  end loop;
  for w in select * from public.withdrawals x where x.user_id = p_user and x.status = 'pending' and x.due_at <= now() order by x.requested_at for update loop
    update public.withdrawals set status = 'completed', completed_at = now() where id = w.id;
    if p_user = auth.uid() then perform wm.ev(jsonb_build_object('k', 'wd', 'id', w.id)); end if;
    perform wm.notify(p_user, 'out', 'wd_sent', jsonb_build_object('recv', w.amount_usd - w.fee, 'net', w.network, 'method', nullif(w.method, 'crypto')), '#retrait');
    n := n + 1;
  end loop;
  if v_dep then perform wm.rank_refresh(p_user); perform wm.badges_check(p_user); end if;
  return n;
end $$;

create or replace function wm.demo_settle() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  perform wm.demo_regler(v_uid);
  return wm.reponse(v_uid, jsonb_build_object('deps', wm.deps_json(v_uid), 'wds', wm.wds_json(v_uid)));
end $$;

-- ── Dépôt fictif ────────────────────────────────────────────────────────────────────────────────
create or replace function wm.demo_deposit(p jsonb, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); cfg jsonb := wm.argent();
  v_method text := coalesce(p ->> 'method', 'crypto'); v_coin text; v_net text;
  v_amt numeric := wm.num(p ->> 'amt'); v_usd numeric; v_fee numeric := 0; v_need integer; v_pas integer := 650;
  u public.users; v_rg jsonb; k text; v_lim numeric; v_deja numeric; v_prev jsonb; d public.deposits; v_res jsonb;
begin
  if p_key is null then perform wm.fail('cle_absente'); end if;
  select * into u from public.users where id = v_uid for update;                      -- un dépôt à la fois par joueur : plafonds exacts
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = p_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  if v_amt is null or v_amt <= 0 then perform wm.fail('montant_invalide'); end if;

  if v_method = 'crypto' then
    v_coin := p ->> 'coin'; v_net := p ->> 'net';
    if v_coin is null or cfg -> 'coins' -> v_coin is null then perform wm.fail('monnaie_invalide'); end if;
    if v_net is null or not (cfg -> 'coins' -> v_coin -> 'nets') ? v_net then perform wm.fail('reseau_invalide'); end if;
    if v_amt < (cfg -> 'coins' -> v_coin ->> 'min')::numeric then perform wm.fail('depot_min'); end if;
    if coalesce((cfg -> 'coins' -> v_coin ->> 'fixe')::boolean, false) then
      v_usd := round(v_amt, 2);                                                       -- USDC et USDT : 1 pour 1
    else
      v_usd := round(wm.num(p ->> 'usd'), 2);                                         -- BTC, ETH, SOL : cours affiché à l'écran (moteur éclair)
      if v_usd is null or v_usd <= 0 then perform wm.fail('montant_invalide'); end if;
    end if;
    v_need := least((cfg -> 'nets' -> v_net ->> 'conf')::integer, 12);
  elsif cfg -> 'fiat' ? v_method then
    if not coalesce(u.kyc_verified, false) then perform wm.fail('kyc_requis'); end if;
    v_amt := round(v_amt, 2);
    if v_amt < (cfg ->> 'fiat_min')::numeric then perform wm.fail('depot_min'); end if;
    if v_amt > (cfg ->> 'fiat_max')::numeric then perform wm.fail('depot_max'); end if;
    v_fee := round(v_amt * (cfg -> 'fiat' -> v_method ->> 'df')::numeric, 2);
    v_usd := v_amt - v_fee; v_coin := 'USD'; v_net := v_method;
    v_need := (cfg -> 'fiat' -> v_method ->> 'need')::integer; v_pas := (cfg -> 'fiat' -> v_method ->> 'pas')::integer;
  else
    perform wm.fail('moyen_invalide');
  end if;
  if v_usd > (cfg ->> 'depot_max')::numeric then perform wm.fail('depot_max'); end if; -- borne technique (argent fictif)

  -- jeu responsable : pause, puis plafonds par jour, semaine, mois
  perform wm.rg_garde(v_uid);
  v_rg := wm.rg_json(v_uid);
  foreach k in array array['day', 'week', 'month'] loop
    v_lim := coalesce((v_rg -> 'lim' ->> k)::numeric, 0);
    if v_lim > 0 then
      select coalesce(sum(x.usd_equivalent), 0) into v_deja from public.deposits x
      where x.user_id = v_uid and x.label is null
        and x.created_at >= now() - case k when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '30 days' end;
      if v_deja + v_usd > v_lim then perform wm.fail('limite_depot'); end if;
    end if;
  end loop;

  insert into public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, status, method, fee, due_at)
  values (v_uid, v_coin, v_net, v_amt, v_usd, 0, v_need, 'pending', v_method, v_fee, now() + make_interval(secs => v_need * v_pas / 1000.0))
  returning * into d;
  v_res := wm.reponse(v_uid, jsonb_build_object('dep', wm.dep_json(d)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'demo_deposit', v_res);
  return v_res;
end $$;

-- ── Retrait fictif ──────────────────────────────────────────────────────────────────────────────
create or replace function wm.demo_withdraw(p jsonb, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); cfg jsonb := wm.argent();
  v_method text := coalesce(p ->> 'method', 'crypto'); v_net text; v_addr text; v_fmt text;
  v_amt numeric := round(wm.num(p ->> 'amt'), 2); v_fee numeric; v_ms integer; v_solde numeric;
  s public.user_stats; v_prev jsonb; w public.withdrawals; v_res jsonb;
begin
  if p_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = p_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  if v_amt is null or v_amt <= 0 then perform wm.fail('montant_invalide'); end if;

  if v_method = 'crypto' then
    v_net := p ->> 'net'; v_addr := btrim(coalesce(p ->> 'addr', ''));
    if v_net is null or cfg -> 'nets' -> v_net -> 'wfee' is null then perform wm.fail('reseau_invalide'); end if;
    v_fmt := cfg -> 'nets' -> v_net ->> 'fmt';
    if not (case v_fmt when 'evm' then v_addr ~ '^0x[0-9a-fA-F]{40}$' when 'sol' then v_addr ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' else false end) then
      perform wm.fail('adresse_invalide');
    end if;
    if v_amt < (cfg ->> 'retrait_min')::numeric then perform wm.fail('retrait_min'); end if;
    v_fee := (cfg -> 'nets' -> v_net ->> 'wfee')::numeric; v_ms := (cfg ->> 'wd_ms')::integer;
  elsif cfg -> 'fiat' ? v_method then
    if not coalesce((select u.kyc_verified from public.users u where u.id = v_uid), false) then perform wm.fail('kyc_requis'); end if;
    if v_amt < (cfg ->> 'fiat_min')::numeric then perform wm.fail('retrait_min'); end if;
    v_fee := round(v_amt * (cfg -> 'fiat' -> v_method ->> 'wf')::numeric, 2);
    v_net := v_method; v_addr := v_method; v_ms := (cfg -> 'fiat' -> v_method ->> 'wd_ms')::integer;
  else
    perform wm.fail('moyen_invalide');
  end if;
  if s.balance < v_amt then perform wm.fail('solde_insuffisant'); end if;

  v_solde := s.balance - v_amt;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into public.withdrawals (user_id, network, destination_address, amount_usd, coin, coin_amount, status, method, fee, due_at)
  values (v_uid, v_net, v_addr, v_amt, case when v_method = 'crypto' then 'USDC' else 'USD' end, v_amt, 'pending', v_method, v_fee, now() + make_interval(secs => v_ms / 1000.0))
  returning * into w;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_amt, v_solde, 'demo_withdraw', w.id::text);
  v_res := wm.reponse(v_uid, jsonb_build_object('wd', wm.wd_json(w)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'demo_withdraw', v_res);
  return v_res;
end $$;

-- ── KYC fictif ──────────────────────────────────────────────────────────────────────────────────
create or replace function wm.demo_kyc(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_bd date := wm.jour(p ->> 'bd');
begin
  if btrim(coalesce(p ->> 'fn', '')) = '' or btrim(coalesce(p ->> 'ln', '')) = '' then perform wm.fail('kyc_nom'); end if;
  if v_bd is null or v_bd > (current_date - interval '18 years')::date then perform wm.fail('kyc_age'); end if;
  if not coalesce((p ->> 'doc')::boolean, false) then perform wm.fail('kyc_piece'); end if;
  -- rien de ce qui a été saisi n'est conservé : seul le résultat l'est
  update public.users set kyc_verified = true, kyc_at = now() where id = v_uid and not coalesce(kyc_verified, false);
  if found then perform wm.notify(v_uid, 'shield', 'kyc_ok', '{}'::jsonb, '#depot'); end if;
  return wm.reponse(v_uid);
end $$;

-- ── Acheter : refusé pendant une pause (seul ajout par rapport à la version précédente) ─────────
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
  perform wm.rg_garde(v_uid);                                                         -- jeu responsable : pas de pari pendant une pause

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

-- ── État complet du joueur : dépôts et retraits réglés au passage, jeu responsable ──────────────
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

-- ── Fonctions publiques et droits ───────────────────────────────────────────────────────────────
create or replace function public.api_demo_deposit(p jsonb, p_key uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.demo_deposit(p, p_key) $$;
create or replace function public.api_demo_withdraw(p jsonb, p_key uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.demo_withdraw(p, p_key) $$;
create or replace function public.api_demo_kyc(p jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.demo_kyc(p) $$;
create or replace function public.api_demo_settle() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.demo_settle() $$;
create or replace function public.api_rg_limit(p_k text, p_v numeric) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.rg_limit(p_k, p_v) $$;
create or replace function public.api_rg_pend_cancel(p_k text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.rg_pend_cancel(p_k) $$;
create or replace function public.api_rg_pause(p_hours integer) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.rg_pause(p_hours) $$;
create or replace function public.api_rg_exclude(p_months integer) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.rg_exclude(p_months) $$;

create or replace function wm.droits() returns void
language plpgsql security definer set search_path = '' as $$
declare
  joueur text[] := array['state', 'profile_update', 'onboarding', 'rank_seen', 'prefs_save', 'notifs_read', 'notif_hide', 'buy', 'sell', 'present',
                         'demo_deposit', 'demo_withdraw', 'demo_kyc', 'demo_settle', 'rg_limit', 'rg_pend_cancel', 'rg_pause', 'rg_exclude'];
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
