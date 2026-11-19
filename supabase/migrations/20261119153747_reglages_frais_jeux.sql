-- Panneau d'administration, lot 3 (19 nov. 2026), constantes lues dans les réglages (3/4) : combinés (bornes, frais, gain, encaissement), stacks (bornes, commission), copies (budget, mise, part du copié).
--
-- Chaque fonction ci-dessous est sa définition en vigueur (pg_get_functiondef). On n'y a fait que remplacer des littéraux
-- par wm.reglage_num('<clé>', <le même littéral>) (lignes marquées « [réglage] ») et ajouter des lignes marquées « [ajout] »
-- (plafonds facultatifs, vides par défaut). Produites par tools/garde-fonctions.mjs, vérifiées par tests/sql/gardes.spec.mjs :
-- avec les valeurs par défaut, rien ne change. Définitions d'avant : backup_20261119.fonctions (lot 0).

CREATE OR REPLACE FUNCTION wm.combo_place(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); v_mise numeric := round(wm.num(p ->> 'stake'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; l jsonb; mk public.markets; v_prix float8; v_m float8; v_mult float8 := 1; v_legs jsonb := '[]'::jsonb;
  v_vus text[] := '{}'; v_cle text; v_n integer := 0; v_brut numeric; v_frais numeric; v_gain numeric; v_solde numeric; c wm.combos; v_res jsonb;
begin
  if v_mise is null or v_mise < wm.reglage_num('combines.mise_min', 2) or v_mise > wm.reglage_num('combines.mise_max', 1000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] combines.mise_min, combines.mise_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if jsonb_typeof(p -> 'legs') is distinct from 'array' or jsonb_array_length(p -> 'legs') < 2 or jsonb_array_length(p -> 'legs') > wm.reglage_num('combines.selections_max', 6) then perform wm.fail('combine_incomplet'); end if;   -- [réglage] combines.selections_max
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  for l in select * from jsonb_array_elements(p -> 'legs') loop
    if l ->> 's' is null or l ->> 's' not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
    select * into mk from public.markets where id = l ->> 'm';
    if not found then perform wm.fail('marche_inconnu'); end if;
    if coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
    v_cle := coalesce(mk.group_parent_id, mk.id);                                       -- une seule issue par marché à cotes multiples
    if v_cle = any (v_vus) then perform wm.fail('selection_en_double'); end if;
    v_vus := v_vus || v_cle;
    select case when l ->> 's' = 'oui' then x.current_probability else 100 - x.current_probability end::float8 into v_prix from public.market_live_state x where x.market_id = mk.id;
    if v_prix is null then perform wm.fail('marche_inconnu'); end if;
    v_m := 100 / greatest(1::float8, v_prix);
    v_mult := v_mult * v_m; v_n := v_n + 1;
    v_legs := v_legs || jsonb_build_array(jsonb_build_object('m', mk.id, 's', l ->> 's', 'price', v_prix, 'mult', v_m, 'res', null));
  end loop;
  if s.balance < v_mise then perform wm.fail('solde_insuffisant'); end if;
  v_brut := round((v_mise * v_mult)::numeric, 2); v_frais := round(v_brut * wm.reglage_num('frais.combines.commission', 0.05), 2); v_gain := least(v_brut - v_frais, wm.reglage_num('combines.gain_max', 50000));   -- [réglage] frais.combines.commission   -- [réglage] combines.gain_max
  v_solde := s.balance - v_mise;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1 where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_mise, v_solde, 'combo', v_n || ' sélections');
  insert into wm.combos (user_id, mise, mult, frais, gain, legs) values (v_uid, v_mise, v_mult, v_frais, v_gain, v_legs) returning * into c;
  perform wm.xp_add(v_uid, 10 + 5 * v_n, 'combo');
  perform wm.badges_check(v_uid);
  v_res := wm.reponse(v_uid, jsonb_build_object('combo', wm.combo_json(c), 'combos', wm.combos_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'combo', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION wm.combo_valeur(c wm.combos)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l jsonb; v_p float8 := 1; v_prix float8;
begin
  if c.etat <> 'open' then return 0; end if;
  for l in select * from jsonb_array_elements(c.legs) loop
    if l ->> 'res' = 'lost' then return 0; end if;
    if l ->> 'res' = 'won' then continue; end if;
    select case when l ->> 's' = 'oui' then s.current_probability else 100 - s.current_probability end::float8 into v_prix from public.market_live_state s where s.market_id = l ->> 'm';
    if v_prix is null then return 0; end if;
    v_p := v_p * v_prix / 100;
  end loop;
  return trunc((c.gain * v_p * wm.reglage_num('combines.encaisse_decote', 0.95))::numeric, 2);   -- [réglage] combines.encaisse_decote
end $function$;

CREATE OR REPLACE FUNCTION wm.stack_create(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); v_buyin numeric := round(wm.num(p ->> 'buyin'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid; v_adv uuid;
  s public.user_stats; v_prev jsonb; v_solde numeric; v_bot boolean; x wm.stacks; v_res jsonb;
begin
  if v_buyin is null or v_buyin < wm.reglage_num('stacks.buyin_min', 5) or v_buyin > wm.reglage_num('stacks.buyin_max', 1000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] stacks.buyin_min, stacks.buyin_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if coalesce(p ->> 'opp', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform wm.fail('joueur_inconnu'); end if;
  v_adv := (p ->> 'opp')::uuid;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_adv;
  if not found or v_adv = v_uid then perform wm.fail('joueur_inconnu'); end if;
  if not v_bot then perform wm.fail('stack_joueur_reel'); end if;                 -- un vrai joueur devrait donner son accord et sa mise
  if (select count(*) from wm.stacks y where y.user_id = v_uid and y.etat = 'active') >= wm.reglage_num('stacks.max_actifs', 5) then perform wm.fail('trop_de_duels'); end if;   -- [réglage] stacks.max_actifs
  if s.balance < v_buyin then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_buyin;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into wm.stacks (user_id, adv, buyin, ref, fin_at) values (v_uid, v_adv, v_buyin, round(wm.resultat(v_uid), 2), now() + interval '7 days') returning * into x;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_buyin, v_solde, 'stack', x.id::text);
  perform wm.notify(v_uid, 'swords', 'stack_lance', jsonb_build_object('id', x.id, 'u', v_adv, 'k', v_buyin), '#duels');
  v_res := wm.reponse(v_uid, jsonb_build_object('stack', x.id, 'stacks', wm.stacks_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'stack', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION wm.stacks_avant(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s wm.stacks; v_moi integer; v_lui integer; v_pot numeric; v_solde numeric; v_res numeric; n integer := 0;
begin
  if not exists (select 1 from wm.stacks x where x.user_id = p_user and x.etat = 'active' and x.fin_at <= now()) then return 0; end if;
  perform 1 from public.user_stats where user_id = p_user for update;
  v_res := wm.resultat(p_user);
  for s in select * from wm.stacks x where x.user_id = p_user and x.etat = 'active' and x.fin_at <= now() order by x.id for update loop
    v_moi := greatest(0, round(1000 + v_res - s.ref))::integer; v_lui := wm.stack_adverse(s.id, 168);
    v_pot := round(s.buyin * 2 * (1 - wm.reglage_num('frais.stacks.commission', 0.04)), 2);   -- [réglage] frais.stacks.commission
    update wm.stacks set etat = case when v_moi > v_lui then 'won' when v_moi < v_lui then 'lost' else 'void' end, mon_stack = v_moi, son_stack = v_lui, regle_at = now() where id = s.id;
    if v_moi > v_lui then
      update public.user_stats set balance = balance + v_pot, profit_realized = coalesce(profit_realized, 0) + v_pot - s.buyin where user_id = p_user returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, v_pot, v_solde, 'stack_gain', s.id::text);
      perform wm.xp_add(p_user, 30, 'stack');
      perform wm.rank_refresh(p_user); perform wm.badges_check(p_user);
    elsif v_moi = v_lui then
      update public.user_stats set balance = balance + s.buyin where user_id = p_user returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, s.buyin, v_solde, 'stack_rendu', s.id::text);
    else
      update public.user_stats set profit_realized = coalesce(profit_realized, 0) - s.buyin where user_id = p_user;
    end if;
    perform wm.notify(p_user, 'swords', case when v_moi > v_lui then 'stack_gagne' when v_moi < v_lui then 'stack_perdu' else 'stack_nul' end,
      jsonb_build_object('id', s.id, 'u', s.adv, 'gain', v_pot - s.buyin, 'moi', v_moi, 'lui', v_lui), '#duels');
    n := n + 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION wm.copy_start(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); v_cible uuid := nullif(p ->> 'u', '')::uuid; v_edit bigint := nullif(p ->> 'edit', '')::bigint;
  v_budget numeric := round(wm.num(p ->> 'budget'), 2); v_mode text := case when p ->> 'mode' = 'prop' then 'prop' else 'fixed' end;
  v_per numeric := coalesce(round(wm.num(p ->> 'per'), 2), 0); v_pct numeric := coalesce(round(wm.num(p ->> 'pct')), 0); v_cap numeric := coalesce(round(wm.num(p ->> 'cap'), 2), 0);
  v_stop numeric := coalesce(wm.num(p ->> 'stop'), 0); v_cats text[]; v_tier integer; v_premier boolean; v_bot boolean; v_n integer := 0; e jsonb; r record;
  s public.user_stats; c wm.copies;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  select r2.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r2;
  if coalesce(v_tier, 0) < 3 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Or
  if jsonb_typeof(p -> 'cats') = 'array' and jsonb_array_length(p -> 'cats') > 0 then
    select array_agg(x) into v_cats from jsonb_array_elements_text(p -> 'cats') x
    where x in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport', 'Sport live', 'Bourse', 'Matières', 'Devises');
  end if;
  if v_budget is null or v_budget < wm.reglage_num('copies.budget_min', 50) then perform wm.fail('budget_min'); end if;   -- [réglage] copies.budget_min
  if v_mode = 'fixed' and (v_per < wm.reglage_num('copies.mise_min', 5) or v_per > v_budget) then perform wm.fail('mise_copie_invalide'); end if;   -- [réglage] copies.mise_min
  if v_mode = 'prop' and (v_pct < 1 or v_pct > 100 or (v_cap > 0 and v_cap < wm.reglage_num('copies.mise_min', 5))) then perform wm.fail('mise_copie_invalide'); end if;   -- [réglage] copies.mise_min
  if v_stop <> trunc(v_stop) or v_stop < 0 or v_stop > 90 then perform wm.fail('mise_copie_invalide'); end if;

  if v_edit is not null then                                                    -- réglages d'une copie en cours
    update wm.copies set budget = v_budget, mode = v_mode, per = v_per, pct = v_pct, cap = case when v_mode = 'prop' then v_cap else 0 end, cats = v_cats, stop = v_stop,
      sec_budget = false, sec_solde = false
    where id = v_edit and user_id = v_uid and etat <> 'stopped' returning * into c;
    if not found then perform wm.fail('copie_indisponible'); end if;
    perform wm.copie_garde(c.id);
    return wm.reponse(v_uid, jsonb_build_object('copies', wm.copies_etat(v_uid), 'copie', c.id));
  end if;

  if v_cible is null or v_cible = v_uid or not wm.copie_possible(v_cible) then perform wm.fail('copie_indisponible'); end if;
  if v_budget > s.balance then perform wm.fail('budget_solde'); end if;
  if exists (select 1 from wm.copies x where x.user_id = v_uid and x.cible = v_cible and x.etat <> 'stopped') then perform wm.fail('copie_existe'); end if;
  if (select count(*) from wm.copies x where x.user_id = v_uid and x.etat <> 'stopped') >= wm.reglage_num('copies.max_actives', 10) then perform wm.fail('trop_de_copies'); end if;   -- [réglage] copies.max_actives
  v_premier := not exists (select 1 from wm.copies x where x.user_id = v_uid);
  insert into wm.copies (user_id, cible, budget, mode, per, pct, cap, cats, stop)
  values (v_uid, v_cible, v_budget, v_mode, v_per, v_pct, case when v_mode = 'prop' then v_cap else 0 end, v_cats, v_stop) returning * into c;
  if v_premier then perform wm.xp_add(v_uid, 15, 'copie'); end if;
  perform wm.notify(v_uid, 'copy', 'copie_debut', jsonb_build_object('u', v_cible, 'budget', v_budget, 'mode', v_mode, 'per', v_per, 'pct', v_pct, 'cap', c.cap), '#copie');

  -- « copier aussi ses paris en cours » : ceux d'un vrai joueur se lisent en base ; ceux d'un bot sont ceux que l'écran affiche
  if coalesce((p ->> 'withOpen')::boolean, false) then
    select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_cible;
    if v_bot then
      for e in select x from jsonb_array_elements(case when jsonb_typeof(p -> 'existing') = 'array' then p -> 'existing' else '[]'::jsonb end) x limit 3 loop
        if wm.copie_executer(c.id, e ->> 'm', e ->> 's', least(5000, greatest(0, coalesce(wm.num(e ->> 'amt'), 0))), true) ->> 'r' = 'ok' then v_n := v_n + 1; end if;
      end loop;
    else
      for r in select x.market_id, x.side, round(x.shares * x.average_price / 100, 2) as amt from public.positions x where x.user_id = v_cible and x.shares > 0.05 order by x.updated_at desc limit 3 loop
        if wm.copie_executer(c.id, r.market_id, r.side, r.amt, true) ->> 'r' = 'ok' then v_n := v_n + 1; end if;
      end loop;
    end if;
    perform wm.copie_garde(c.id);
  end if;
  return wm.reponse(v_uid, jsonb_build_object('copies', wm.copies_etat(v_uid), 'copie', c.id, 'ouvertes', v_n));
end $function$;

CREATE OR REPLACE FUNCTION wm.copie_executer(p_copie bigint, p_market text, p_side text, p_mise numeric, p_attendre boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c wm.copies; s public.user_stats; mk public.markets; l public.market_live_state; q record;
  v_user uuid; v_ids text[]; v_amt numeric; v_libre numeric; v_tier integer; v_fee numeric; v_cout numeric; v_part numeric; v_solde numeric; v_p numeric;
  v_sens integer := case when p_side = 'oui' then 1 else -1 end; v_bot boolean;
begin
  select x.user_id into v_user from wm.copies x where x.id = p_copie and x.etat = 'active';
  if not found then return jsonb_build_object('r', 'ferme'); end if;
  if wm.bloque(v_user, 'paris') then return jsonb_build_object('r', 'bloque'); end if;   -- [ajout] copieur bloqué : rien, jamais d'exception
  if p_attendre then select * into s from public.user_stats where user_id = v_user for update;
  else select * into s from public.user_stats where user_id = v_user for update skip locked; end if;
  if not found then return jsonb_build_object('r', 'occupe'); end if;
  select * into c from wm.copies x where x.id = p_copie and x.etat = 'active' for update;
  if not found then return jsonb_build_object('r', 'ferme'); end if;
  select * into mk from public.markets where id = p_market;
  if not found or coalesce(mk.status, 'open') <> 'open' or p_side not in ('oui', 'non') then return jsonb_build_object('r', 'ferme'); end if;
  if c.cats is not null and array_length(c.cats, 1) > 0 and not (mk.category = any (c.cats)) then return jsonb_build_object('r', 'cat'); end if;

  v_libre := greatest(0, c.budget + c.realise - coalesce((select sum(x.cout) from wm.copies_lots x where x.copie = c.id and x.sh > 0), 0));
  if c.mode = 'prop' then
    v_amt := coalesce(p_mise, 0) * c.pct / 100;
    if c.cap > 0 then v_amt := least(v_amt, c.cap); end if;
    v_amt := least(v_amt, v_libre);                                             -- proportionnel : ce que le budget permet encore
  else v_amt := c.per; end if;
  v_amt := trunc(v_amt, 2);
  if v_amt < wm.reglage_num('copies.mise_min', 5) or v_libre < v_amt then return jsonb_build_object('r', 'budget'); end if;   -- [réglage] copies.mise_min
  if s.balance < v_amt then return jsonb_build_object('r', 'balance'); end if;

  v_ids := wm.fratrie(p_market);
  perform 1 from public.market_live_state x where x.market_id = any (v_ids) order by x.market_id for update;
  select * into l from public.market_live_state where market_id = p_market;
  if not found then return jsonb_build_object('r', 'ferme'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  select * into q from wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), mk.category, coalesce(v_tier, 0) >= 5, p_side, v_amt::float8);
  if not q.complet or q.sh <= 0 then return jsonb_build_object('r', 'liq'); end if;

  v_fee := round(q.fee::numeric, 2); v_cout := v_amt - v_fee;
  select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = c.cible;
  v_part := case when v_bot then 0 else trunc(v_fee * wm.reglage_num('frais.copies.part_copie', 0.20), 2) end;             -- part du joueur copié, prise sur les frais de Wimoro   -- [réglage] frais.copies.part_copie
  update public.user_stats set balance = balance - v_amt, bets_placed = bets_placed + 1,
    bets_max_amount = greatest(coalesce(bets_max_amount, 0), v_amt), profit_realized = coalesce(profit_realized, 0) - v_fee
  where user_id = c.user_id returning balance into v_solde;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (c.user_id, -v_amt, v_solde, 'copie', p_market || ':' || p_side);
  insert into public.positions (user_id, market_id, side, shares, average_price)
  values (c.user_id, p_market, p_side, q.sh::numeric, (q.avg * 100)::numeric)
  on conflict (user_id, market_id, side) do update set
    average_price = ((public.positions.average_price * public.positions.shares + excluded.average_price * excluded.shares) / nullif(public.positions.shares + excluded.shares, 0)),
    shares = public.positions.shares + excluded.shares, updated_at = now();
  insert into wm.copies_lots (copie, market_id, side, sh, cout) values (c.id, p_market, p_side, q.sh::numeric, v_cout)
  on conflict (copie, market_id, side) do update set sh = wm.copies_lots.sh + excluded.sh, cout = wm.copies_lots.cout + excluded.cout;
  update wm.copies set realise = realise - v_fee, n = n + 1, donne = donne + v_fee * wm.reglage_num('frais.copies.part_copie', 0.20) where id = c.id;   -- [réglage] frais.copies.part_copie

  v_p := round(greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens))::numeric, 6);
  update public.market_live_state set
    current_probability = v_p,
    anchor_probability = round(greatest(5::float8, least(95::float8, coalesce(anchor_probability, current_probability)::float8 + q.impact * v_sens * 0.7))::numeric, 6),
    volume_total = volume_total + v_cout, participants_count = coalesce(participants_count, 0) + 1,
    open_yes = open_yes + case when p_side = 'oui' then q.sh::numeric else 0 end,
    open_no = open_no + case when p_side = 'non' then q.sh::numeric else 0 end,
    mm_cash = mm_cash + v_cout, fees = fees + v_fee - v_part,
    price_history = wm.ph_push(price_history, round(v_p, 2)), seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform wm.group_rebalance(p_market, (v_p - l.current_probability)::float8);
  perform wm.badges_check(c.user_id);
  perform wm.tick_emit(v_ids);
  perform wm.copie_note(c.id, 'open', p_market, p_side, v_amt);
  return jsonb_build_object('r', 'ok', 'amt', v_amt, 'part', v_part);
end $function$;

select wm.droits();
