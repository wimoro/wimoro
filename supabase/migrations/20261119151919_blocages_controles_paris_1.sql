-- Panneau d'administration, lot 2 (19 nov. 2026), contrôles ajoutés aux fonctions existantes (1/4) : identité de l'appelant (wm.uid : déconnexion forcée, blocage du site, maintenance ; vaut aussi pour les Edge Functions, qui passent par wm.agir_pour puis wm.uid) et paris (achat, mise éclair, Série, Blitz, duels).
--
-- Chaque fonction ci-dessous est sa définition en vigueur (pg_get_functiondef), à laquelle on n'a fait qu'AJOUTER des
-- lignes marquées « [ajout] » (produites par tools/garde-fonctions.mjs, vérifiées par tests/sql/gardes.spec.mjs). Pour un
-- joueur sans blocage, hors maintenance et avec les réglages par défaut, chaque contrôle ne trouve rien et ne fait rien.
-- Les définitions d'avant sont dans backup_20261119.fonctions (lot 0).

CREATE OR REPLACE FUNCTION wm.uid()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v uuid := auth.uid(); v_excl timestamptz; v_susp timestamptz;
begin
  if v is null then raise exception 'session' using errcode = 'P0001'; end if;
  select r.excl_until, r.susp_until into v_excl, v_susp from wm.rg r where r.user_id = v;
  if v_susp is not null and v_susp > now() then
    raise exception 'suspendu' using errcode = 'P0001',
      detail = case when v_susp = 'infinity' then '-1' else ((extract(epoch from v_susp) * 1000)::bigint)::text end;
  end if;
  if v_excl is not null and v_excl > now() then
    raise exception 'exclu' using errcode = 'P0001',
      detail = case when v_excl = 'infinity' then '-1' else ((extract(epoch from v_excl) * 1000)::bigint)::text end;
  end if;
  perform wm.uid_gardes(v);   -- [ajout] déconnexion forcée, blocage du site, maintenance
  return v;
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
  if v_total is null or v_total < 1 then perform wm.fail('montant_min'); end if;
  if p_key is null then perform wm.fail('cle_absente'); end if;

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
  if v_amt is null or v_amt < 1 or v_amt > 10000 then perform wm.fail('montant_invalide'); end if;
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
  if v_stake is null or v_stake not in (5, 10, 25, 50, 100) then perform wm.fail('montant_invalide'); end if;
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
  if v_id is null or v_debut is null or v_buyin is null or v_buyin not in (10, 25) then perform wm.fail('requete'); end if;
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
  if v_id is null or v_issue is null or v_fin1 is null or v_debut2 is null or v_prix is distinct from 50 then perform wm.fail('requete'); end if;
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
  if v_mise is null or v_mise < 5 or v_mise > 5000 then perform wm.fail('montant_invalide'); end if;
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
  if (select count(*) from wm.duels x where x.par = v_uid and x.etat = 'open') >= 10 then perform wm.fail('trop_de_duels'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  select * into q from wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), mk.category, coalesce(v_tier, 0) >= 5, v_cote, v_mise::float8);
  v_frais := round(coalesce(q.fee, 0)::numeric, 2);
  if s.balance < v_mise + v_frais then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_mise - v_frais;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1, profit_realized = coalesce(profit_realized, 0) - v_frais where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -(v_mise + v_frais), v_solde, 'duel', v_m);
  v_prix := round(case when v_cote = 'oui' then l.current_probability else 100 - l.current_probability end)::integer;
  insert into wm.duels (code, par, adv, m, cote, mise, frais, prix0, expire_at)
  values ('D' || upper(substr(md5(gen_random_uuid()::text), 1, 7)), v_uid, v_adv, v_m, v_cote, v_mise, v_frais, v_prix, now() + interval '48 hours') returning * into d;
  if v_bot then d := wm.duel_accepter(d.id, v_adv, v_prix, 0);                         -- un bot défié accepte aussitôt, à la cote du moment
  elsif v_adv is not null then perform wm.notify(v_adv, 'swords', 'duel_recu', jsonb_build_object('id', d.id, 'u', v_uid, 'm', v_m, 's', v_cote, 'k', v_mise), '#duel-' || d.id); end if;
  v_res := wm.reponse(v_uid, jsonb_build_object('duel', wm.duel_json(d), 'duels', wm.duels_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'duel', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION wm.duel_accepter(p_id bigint, p_adv uuid, p_prix integer, p_frais numeric)
 RETURNS wm.duels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d wm.duels; s public.user_stats; v_pot numeric; v_autre numeric; v_solde numeric; v_bot boolean;
begin
  select * into d from wm.duels x where x.id = p_id for update;
  if not found or d.etat <> 'open' then perform wm.fail('duel_indisponible'); end if;
  if d.expire_at <= now() then perform wm.fail('duel_indisponible'); end if;
  if p_adv = d.par or (d.adv is not null and d.adv <> p_adv) then perform wm.fail('duel_indisponible'); end if;
  if p_prix is null or p_prix < 2 or p_prix > 98 then perform wm.fail('cote_indisponible'); end if;
  v_pot := round(d.mise * 100 / p_prix, 2); v_autre := round(v_pot * (100 - p_prix) / 100, 2);
  select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = p_adv;
  if not coalesce(v_bot, false) then
    select * into s from public.user_stats where user_id = p_adv for update;
    if not found then perform wm.fail('profil_absent'); end if;
    perform wm.rg_garde(p_adv);
    perform wm.garde(p_adv, 'paris');   -- [ajout] blocage des paris de celui qui accepte
    if s.balance < v_autre + coalesce(p_frais, 0) then perform wm.fail('solde_insuffisant'); end if;
    v_solde := s.balance - v_autre - coalesce(p_frais, 0);
    update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1, profit_realized = coalesce(profit_realized, 0) - coalesce(p_frais, 0) where user_id = p_adv;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_adv, -(v_autre + coalesce(p_frais, 0)), v_solde, 'duel', d.id::text);
  end if;
  update wm.duels set adv = p_adv, prix = p_prix, mise_adv = v_autre, frais_adv = coalesce(p_frais, 0), cagnotte = v_pot, etat = 'active', accepte_at = now()
  where id = p_id returning * into d;
  update public.market_live_state set volume_total = volume_total + d.mise + v_autre, participants_count = participants_count + 1, updated_at = now() where market_id = d.m;
  return d;
end $function$;

select wm.droits();
