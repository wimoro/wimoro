-- Panneau d'administration, lot 3 (19 nov. 2026), constantes lues dans les réglages (2/4) : cotation (STABLE), bornes des paris, de la mise éclair, de La Série, du Blitz et des duels.
--
-- Chaque fonction ci-dessous est sa définition en vigueur (pg_get_functiondef). On n'y a fait que remplacer des littéraux
-- par wm.reglage_num('<clé>', <le même littéral>) (lignes marquées « [réglage] ») et ajouter des lignes marquées « [ajout] »
-- (plafonds facultatifs, vides par défaut). Produites par tools/garde-fonctions.mjs, vérifiées par tests/sql/gardes.spec.mjs :
-- avec les valeurs par défaut, rien ne change. Définitions d'avant : backup_20261119.fonctions (lot 0).

CREATE OR REPLACE FUNCTION wm.quote_buy(p_p double precision, p_depth double precision, p_cat text, p_disc boolean, p_side text, p_total double precision, OUT sh double precision, OUT cost double precision, OUT fee double precision, OUT avg double precision, OUT impact double precision, OUT complet boolean, OUT max_total double precision)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION wm.buy(p_market text, p_side text, p_total numeric, p_key uuid, p_opts jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid();
  v_total numeric := round(p_total, 2);
  s public.user_stats; mk public.markets; l public.market_live_state; q record;
  v_prev jsonb; v_ids text[]; v_sens integer := case when p_side = 'oui' then 1 else -1 end;
  v_p numeric; v_fee numeric; v_cout numeric; v_solde numeric; v_tier integer; v_pos public.positions; v_res jsonb;
begin
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_total is null or v_total < wm.reglage_num('paris.mise_min', 1) then perform wm.fail('montant_min'); end if;   -- [réglage] paris.mise_min
  if p_key is null then perform wm.fail('cle_absente'); end if;
  if v_total > wm.reglage_num('paris.mise_max', null) then perform wm.fail('montant_max'); end if;   -- [ajout] plafond des paris (vide par défaut : aucun)

  select * into s from public.user_stats where user_id = v_uid for update;            -- verrou du joueur, toujours en premier
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = p_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;         -- même clé : déjà appliquée, on renvoie le même résultat
  perform wm.rg_garde(v_uid);                                                         -- jeu responsable : pas de pari pendant une pause
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris

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
end $function$;

CREATE OR REPLACE FUNCTION public.srv_eclair_miser(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user);
  v_manche bigint := wm.num(p ->> 'manche')::bigint; v_jeu text := p ->> 'jeu'; v_cote text := p ->> 'cote';
  v_amt numeric := round(wm.num(p ->> 'amt'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; v_ms float8; v_tier integer; v_fee float8; v_solde numeric; m wm.eclair_mises; v_res jsonb;
begin
  if v_cote is null or v_cote not in ('oui', 'non', 'be') then perform wm.fail('cote_invalide'); end if;
  if v_jeu is null or v_manche is null then perform wm.fail('jeu_inconnu'); end if;
  if v_amt is null or v_amt < wm.reglage_num('eclair.mise_min', 1) or v_amt > wm.reglage_num('eclair.mise_max', 10000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] eclair.mise_min, eclair.mise_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);                                                         -- jeu responsable : pas de mise pendant une pause
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
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
end $function$;

CREATE OR REPLACE FUNCTION public.srv_serie_start(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user); v_gid text := p ->> 'gid'; v_stake numeric := round(wm.num(p ->> 'stake'), 2);
  v_t bigint := wm.num(p ->> 't')::bigint; v_p0 float8 := wm.num(p ->> 'p0')::float8; v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; v_solde numeric; r wm.series; v_res jsonb;
begin
  if v_gid is null or v_t is null or v_p0 is null or v_p0 <= 0 then perform wm.fail('jeu_inconnu'); end if;
  if v_stake is null or not (v_stake = any (wm.reglage_liste('serie.mises', array[5, 10, 25, 50, 100]))) then perform wm.fail('montant_invalide'); end if;   -- [réglage] serie.mises
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  if abs(wm.ms() - v_t) > 2500 then perform wm.fail('horloge'); end if;
  if exists (select 1 from wm.series x where x.user_id = v_uid and x.state = 'running') then perform wm.fail('serie_en_cours'); end if;
  if s.balance < v_stake then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_stake;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1 where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_stake, v_solde, 'serie', v_gid);
  insert into wm.series (user_id, gid, stake, stack, step, r_start, p0) values (v_uid, v_gid, v_stake, v_stake, 1, v_t, v_p0) returning * into r;
  v_res := wm.reponse(v_uid, jsonb_build_object('serie', wm.serie_json(r)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'serie', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.srv_blitz_join(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user); v_id bigint := wm.num(p ->> 'id')::bigint; v_buyin numeric := round(wm.num(p ->> 'buyin'), 2);
  v_debut bigint := wm.num(p ->> 'debut')::bigint; v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; v_solde numeric; v_res jsonb;
begin
  if v_id is null or v_debut is null or v_buyin is null or v_buyin not in (wm.reglage_num('blitz.buyin', 10), wm.reglage_num('blitz.buyin_prime', 25)) then perform wm.fail('requete'); end if;   -- [réglage] blitz.buyin, blitz.buyin_prime
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  if wm.ms() >= v_debut then perform wm.fail('inscriptions_closes'); end if;
  if wm.ms() < v_debut - 1800000 then perform wm.fail('requete'); end if;                      -- pas d'inscription plus de 30 minutes à l'avance
  if exists (select 1 from wm.blitz_joueurs j where j.blitz = v_id and j.user_id = v_uid) then perform wm.fail('deja_inscrit'); end if;
  if s.balance < v_buyin then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_buyin;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1 where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_buyin, v_solde, 'blitz', v_id::text);
  insert into wm.blitz_joueurs (blitz, user_id, paye) values (v_id, v_uid, v_buyin);
  perform wm.xp_add(v_uid, 10, 'blitz');
  v_res := wm.reponse(v_uid, jsonb_build_object('blitz', wm.blitz_vue(v_uid, v_id, '{}'::integer[])));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'blitz', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.srv_blitz_rebuy(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user); v_id bigint := wm.num(p ->> 'id')::bigint; v_issue integer := wm.num(p ->> 'issue1')::integer;
  v_fin1 bigint := wm.num(p ->> 'fin1')::bigint; v_debut2 bigint := wm.num(p ->> 'debut2')::bigint; v_prix numeric := round(wm.num(p ->> 'prix'), 2);
  s public.user_stats; j wm.blitz_joueurs; v_solde numeric; v_now bigint := wm.ms();
begin
  if v_id is null or v_issue is null or v_fin1 is null or v_debut2 is null or v_prix is distinct from wm.reglage_num('blitz.rachat', 50) then perform wm.fail('requete'); end if;   -- [réglage] blitz.rachat
  select * into s from public.user_stats where user_id = v_uid for update;
  select * into j from wm.blitz_joueurs x where x.blitz = v_id and x.user_id = v_uid for update;
  if not found then perform wm.fail('pas_inscrit'); end if;
  if j.rachat then perform wm.fail('rachat_fait'); end if;
  if wm.blitz_chute(j.choix, false, array[v_issue], 1) <> 1 then perform wm.fail('rachat_indisponible'); end if;   -- seulement si l'on est tombé à la manche 1
  if v_now < v_fin1 or v_now >= v_debut2 then perform wm.fail('rachat_indisponible'); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  if s.balance < v_prix then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_prix;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_prix, v_solde, 'blitz_rachat', v_id::text);
  update wm.blitz_joueurs set rachat = true, paye = paye + v_prix where blitz = v_id and user_id = v_uid;
  return wm.reponse(v_uid, jsonb_build_object('blitz', wm.blitz_vue(v_uid, v_id, array[v_issue])));
end $function$;

CREATE OR REPLACE FUNCTION wm.duel_create(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); v_m text := p ->> 'm'; v_cote text := p ->> 'side'; v_mise numeric := round(wm.num(p ->> 'stake'), 2);
  v_adv uuid := nullif(p ->> 'opp', '')::uuid; v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; mk public.markets; l public.market_live_state; q record; v_prev jsonb; v_tier integer; v_frais numeric; v_solde numeric;
  d wm.duels; v_bot boolean := false; v_prix integer; v_res jsonb;
begin
  if v_cote is null or v_cote not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_mise is null or v_mise < wm.reglage_num('duels.mise_min', 5) or v_mise > wm.reglage_num('duels.mise_max', 5000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] duels.mise_min, duels.mise_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  select * into mk from public.markets where id = v_m;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
  select * into l from public.market_live_state where market_id = v_m;
  if v_adv is not null then
    if v_adv = v_uid then perform wm.fail('duel_indisponible'); end if;
    if not exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = v_adv) or (f.user_id = v_adv and f.friend_id = v_uid))) then perform wm.fail('pas_amis'); end if;
    select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_adv;
  end if;
  if (select count(*) from wm.duels x where x.par = v_uid and x.etat = 'open') >= wm.reglage_num('duels.max_ouverts', 10) then perform wm.fail('trop_de_duels'); end if;   -- [réglage] duels.max_ouverts
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  select * into q from wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), mk.category, coalesce(v_tier, 0) >= 5, v_cote, v_mise::float8);
  v_frais := round(coalesce(q.fee, 0)::numeric, 2);
  if s.balance < v_mise + v_frais then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_mise - v_frais;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1, profit_realized = coalesce(profit_realized, 0) - v_frais where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -(v_mise + v_frais), v_solde, 'duel', v_m);
  v_prix := round(case when v_cote = 'oui' then l.current_probability else 100 - l.current_probability end)::integer;
  insert into wm.duels (code, par, adv, m, cote, mise, frais, prix0, expire_at)
  values ('D' || upper(substr(md5(gen_random_uuid()::text), 1, 7)), v_uid, v_adv, v_m, v_cote, v_mise, v_frais, v_prix, now() + interval '1 hour' * wm.reglage_num('duels.expiration_h', 48)) returning * into d;   -- [réglage] duels.expiration_h
  if v_bot then d := wm.duel_accepter(d.id, v_adv, v_prix, 0);                         -- un bot défié accepte aussitôt, à la cote du moment
  elsif v_adv is not null then perform wm.notify(v_adv, 'swords', 'duel_recu', jsonb_build_object('id', d.id, 'u', v_uid, 'm', v_m, 's', v_cote, 'k', v_mise), '#duel-' || d.id); end if;
  v_res := wm.reponse(v_uid, jsonb_build_object('duel', wm.duel_json(d), 'duels', wm.duels_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'duel', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.srv_duel_eclair_creer(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user);
  v_gid text := p ->> 'gid'; v_cote text := p ->> 'side'; v_mise numeric := round(wm.num(p ->> 'stake'), 2);
  v_adv uuid := nullif(p ->> 'opp', '')::uuid; v_key uuid := nullif(p ->> 'key', '')::uuid; v_prix integer := wm.num(p ->> 'prix')::integer;
  s public.user_stats; v_prev jsonb; v_tier integer; v_frais numeric; v_solde numeric; d wm.duels; v_bot boolean := false; v_res jsonb;
  v_manche bigint; v_ms float8; v_ferme timestamptz;
begin
  if v_gid is null or v_gid !~ '^[a-z0-9]{2,12}$' then perform wm.fail('jeu_inconnu'); end if;
  if v_cote is null or v_cote not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_mise is null or v_mise < wm.reglage_num('duels.mise_min', 5) or v_mise > wm.reglage_num('duels.mise_max', 5000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] duels.mise_min, duels.mise_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if v_prix is null or v_prix < 2 or v_prix > 98 then perform wm.fail('cote_indisponible'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  if v_adv is not null then
    if v_adv = v_uid then perform wm.fail('duel_indisponible'); end if;
    if not exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = v_adv) or (f.user_id = v_adv and f.friend_id = v_uid))) then perform wm.fail('pas_amis'); end if;
    select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_adv;
  end if;
  if (select count(*) from wm.duels x where x.par = v_uid and x.etat = 'open') >= wm.reglage_num('duels.max_ouverts', 10) then perform wm.fail('trop_de_duels'); end if;   -- [réglage] duels.max_ouverts

  -- la manche : celle en cours, ou la suivante s'il reste moins de dix secondes de mises (horloge de la base)
  v_manche := wm.eclair_manche(); v_ms := wm.eclair_depuis(v_manche);
  if v_ms >= 20000 then v_manche := v_manche + 1; end if;
  v_ferme := timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => (v_manche - 1) * 45 + 30);

  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  v_frais := round(case when coalesce(v_tier, 0) >= 5 then wm.num(p ->> 'frais_remise') else wm.num(p ->> 'frais') end, 2);   -- remise à partir du rang Diamant
  if v_frais is null or v_frais < 0 or v_frais >= v_mise then perform wm.fail('montant_invalide'); end if;
  if s.balance < v_mise + v_frais then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_mise - v_frais;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1, profit_realized = coalesce(profit_realized, 0) - v_frais where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -(v_mise + v_frais), v_solde, 'duel', 'flash:' || v_gid || ':' || v_manche);
  insert into wm.duels (code, par, adv, m, cote, mise, frais, prix0, expire_at, manche)
  values ('D' || upper(substr(md5(gen_random_uuid()::text), 1, 7)), v_uid, v_adv, 'flash:' || v_gid, v_cote, v_mise, v_frais, v_prix, least(now() + interval '2 minutes', v_ferme), v_manche)
  returning * into d;
  if v_bot then d := wm.duel_accepter(d.id, v_adv, v_prix, 0);                    -- un bot défié accepte aussitôt, au prix du moment
  elsif v_adv is not null then
    perform wm.notify(v_adv, 'swords', 'duel_recu', jsonb_build_object('id', d.id, 'u', v_uid, 'm', d.m, 'r', d.manche, 's', v_cote, 'k', v_mise), '#duel-' || d.id);
  end if;
  v_res := wm.reponse(v_uid, jsonb_build_object('duel', wm.duel_json(d), 'duels', wm.duels_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'duel', v_res);
  return v_res;
end $function$;

select wm.droits();
