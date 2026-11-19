-- Panneau d'administration, lot 3 (19 nov. 2026), constantes lues dans les réglages (4/4) : plafonds du site pour les dépôts et les retraits, création de clan, mise et commission des guerres.
--
-- Chaque fonction ci-dessous est sa définition en vigueur (pg_get_functiondef). On n'y a fait que remplacer des littéraux
-- par wm.reglage_num('<clé>', <le même littéral>) (lignes marquées « [réglage] ») et ajouter des lignes marquées « [ajout] »
-- (plafonds facultatifs, vides par défaut). Produites par tools/garde-fonctions.mjs, vérifiées par tests/sql/gardes.spec.mjs :
-- avec les valeurs par défaut, rien ne change. Définitions d'avant : backup_20261119.fonctions (lot 0).

CREATE OR REPLACE FUNCTION wm.demo_deposit(p jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform wm.garde(v_uid, 'depots');   -- [ajout] blocage des dépôts
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
  if v_usd + coalesce((select sum(x.usd_equivalent) from public.deposits x where x.user_id = v_uid and x.label is null and x.created_at >= now() - interval '1 day'), 0) > wm.reglage_num('depots.max_jour', null) then perform wm.fail('limite_depot'); end if;   -- [ajout] plafond du site par jour (vide par défaut : aucun)

  insert into public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, status, method, fee, due_at)
  values (v_uid, v_coin, v_net, v_amt, v_usd, 0, v_need, 'pending', v_method, v_fee, now() + make_interval(secs => v_need * v_pas / 1000.0))
  returning * into d;
  v_res := wm.reponse(v_uid, jsonb_build_object('dep', wm.dep_json(d)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'demo_deposit', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION wm.demo_withdraw(p jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform wm.garde(v_uid, 'retraits');   -- [ajout] blocage des retraits
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
  if v_amt > wm.reglage_num('retraits.max', null) then perform wm.fail('retrait_max'); end if;   -- [ajout] plafond d'un retrait (vide par défaut : aucun)

  v_solde := s.balance - v_amt;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into public.withdrawals (user_id, network, destination_address, amount_usd, coin, coin_amount, status, method, fee, due_at)
  values (v_uid, v_net, v_addr, v_amt, case when v_method = 'crypto' then 'USDC' else 'USD' end, v_amt, 'pending', v_method, v_fee, now() + make_interval(secs => v_ms / 1000.0))
  returning * into w;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_amt, v_solde, 'demo_withdraw', w.id::text);
  v_res := wm.reponse(v_uid, jsonb_build_object('wd', wm.wd_json(w)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, p_key, 'demo_withdraw', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_create(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); v_nom text := wm.texte_propre(p ->> 'name'); v_tag text := upper(btrim(coalesce(p ->> 'tag', ''))); v_desc text := wm.texte_propre(p ->> 'desc');
  v_acces text := coalesce(p ->> 'access', 'open'); v_rang numeric := coalesce(wm.num(p ->> 'minRank'), 0); v_ic text := coalesce(p ->> 'ic', 'shield'); v_col text := coalesce(p ->> 'col', '#2448FF');
  v_langues text[]; v_cats text[]; v_tier integer; v_solde numeric; v_id text; v_code text; v_parti timestamptz;
  s public.user_stats; u public.users;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  select * into u from public.users where id = v_uid;
  if exists (select 1 from wm.clan_membres m where m.user_id = v_uid and m.parti_at is null) then perform wm.fail('clan_deja'); end if;
  select max(m.parti_at) into v_parti from wm.clan_membres m where m.user_id = v_uid;
  if v_parti is not null and v_parti > now() - interval '7 days' then perform wm.fail('clan_attente'); end if;
  select x.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) x;
  if coalesce(v_tier, 0) < 2 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Argent
  if u.created_at > now() - interval '14 days' then perform wm.fail('compte_trop_recent'); end if;
  if wm.texte_refuse(v_nom) or wm.texte_refuse(v_desc) then perform wm.fail('texte_refuse'); end if;
  if length(v_nom) < 3 or length(v_nom) > 28 then perform wm.fail('clan_nom_invalide'); end if;
  if v_tag !~ '^[A-Z0-9]{3,4}$' then perform wm.fail('clan_tag_invalide'); end if;
  if exists (select 1 from wm.clans_demo d where d.tag = v_tag) or exists (select 1 from wm.clans_joueurs j where j.tag = v_tag) then perform wm.fail('clan_tag_pris'); end if;
  if length(v_desc) > 200 or v_acces not in ('open', 'apply', 'invite') or v_rang <> trunc(v_rang) or v_rang < 0 or v_rang > 7
     or v_ic not in ('shield', 'bolt', 'flame', 'crown', 'star', 'trophy', 'target', 'league', 'chart', 'rotate') or v_col !~ '^#[0-9A-Fa-f]{6}$' then perform wm.fail('clan_invalide'); end if;
  select coalesce(array_agg(x), '{fr}') into v_langues from jsonb_array_elements_text(case when jsonb_typeof(p -> 'lang') = 'array' then p -> 'lang' else '[]'::jsonb end) x where x in ('fr', 'en', 'he', 'es', 'pt');
  select coalesce(array_agg(x), '{}') into v_cats from (select x from jsonb_array_elements_text(case when jsonb_typeof(p -> 'cats') = 'array' then p -> 'cats' else '[]'::jsonb end) x
    where x in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport', 'Sport live', 'Bourse', 'Matières', 'Devises') limit 3) y;
  if s.balance < wm.reglage_num('clans.frais_creation', 50) then perform wm.fail('solde_insuffisant'); end if;   -- [réglage] clans.frais_creation

  update public.user_stats set balance = balance - wm.reglage_num('clans.frais_creation', 50), profit_realized = coalesce(profit_realized, 0) - wm.reglage_num('clans.frais_creation', 50) where user_id = v_uid returning balance into v_solde;   -- frais non remboursables   -- [réglage] clans.frais_creation
  v_id := 'u' || nextval('wm.clans_joueurs_seq');
  v_code := 'WMR-' || upper(translate(substr(md5(v_id || ':' || v_uid::text), 1, 4), '01io', 'XYZW'));
  while exists (select 1 from wm.clans_demo d where d.code = v_code) or exists (select 1 from wm.clans_joueurs j where j.code = v_code) loop
    v_code := 'WMR-' || upper(translate(substr(md5(v_code || v_id), 1, 4), '01io', 'XYZW'));
  end loop;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -wm.reglage_num('clans.frais_creation', 50), v_solde, 'clan', v_id);   -- [réglage] clans.frais_creation
  insert into wm.clans_joueurs (id, nom, tag, ic, col, langues, cats, description, acces, rang_min, chef, code)
  values (v_id, v_nom, v_tag, v_ic, v_col, v_langues, v_cats, v_desc, v_acces, v_rang, v_uid, v_code);
  perform wm.clan_entrer(v_uid, v_id, 'chef');
  perform wm.badges_check(v_uid);
  perform wm.notify(v_uid, 'shield', 'clan_cree', jsonb_build_object('id', v_id, 'name', v_nom, 'tag', v_tag), '#clan-' || v_id);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid), 'id', v_id));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_war()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); moi record; g wm.clan_guerres; v_ennemi text; v_bots integer; m public.chat_messages;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  select * into moi from wm.clan_moi(v_uid);
  if moi.role <> 'chef' or not moi.joueurs then perform wm.fail('role_insuffisant'); end if;
  perform 1 from wm.clans_joueurs j where j.id = moi.clan for update;
  perform wm.clan_guerres_avancer(v_uid);
  if exists (select 1 from wm.clan_guerres x where x.clan_id = moi.clan and x.etat = 'live') then perform wm.fail('guerre_en_cours'); end if;
  select d.id into v_ennemi from wm.clans_demo d where d.division = 'bronze' order by random() limit 1;   -- un clan de sa division (un clan de joueurs débute en bronze)
  if v_ennemi is null then perform wm.fail('clan_inconnu'); end if;
  select count(*)::integer into v_bots from wm.clan_membres x join public.users u on u.id = x.user_id and u.is_demo where x.clan_id = moi.clan and x.parti_at is null;
  insert into wm.clan_guerres (clan_id, ennemi, par, bots, fin) values (moi.clan, v_ennemi, v_uid, least(v_bots, 7), now() + interval '48 hours') returning * into g;
  if g.buyin is distinct from wm.reglage_num('clans.guerre_buyin', 20) then update wm.clan_guerres set buyin = wm.reglage_num('clans.guerre_buyin', 20) where id = g.id returning * into g; end if;   -- [ajout] mise de la guerre (réglage ; 20 par défaut, comme la colonne)
  perform wm.clan_fil_poser(moi.clan, v_uid, 'guerre', jsonb_build_object('foe', v_ennemi, 'k', g.buyin));
  perform wm.chat_salon_creer('clan:' || moi.clan);
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source)
  values ('clan:' || moi.clan, v_uid, 'evt', '', jsonb_build_object('code', 'guerre', 'foe', v_ennemi, 'k', g.buyin), 'joueur') returning * into m;
  perform wm.chat_diffuser(m.room_id, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_guerres_avancer(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g wm.clan_guerres; v jsonb; v_a integer; v_b integer; v_n integer; v_pot numeric; v_part numeric; j record; v_solde numeric; v_etat text; v_regles integer := 0;
begin
  for g in
    select x.* from wm.clan_guerres x
    where x.etat = 'live' and x.fin <= now()
      and (x.clan_id in (select m.clan_id from wm.clan_membres m where m.user_id = p_user and m.parti_at is null)
        or x.id in (select jj.guerre_id from wm.clan_guerre_joueurs jj where jj.user_id = p_user and jj.gain is null))
    order by x.id for update of x skip locked
  loop
    v := wm.guerre_json(g);
    select coalesce(sum(p), 0) into v_a from (select (e ->> 'pts')::integer as p from jsonb_array_elements(v -> 'mine') e order by 1 desc limit 10) s;
    select coalesce(sum(p), 0) into v_b from (select (e ->> 'pts')::integer as p from jsonb_array_elements(v -> 'theirs') e order by 1 desc limit 10) s;
    v_n := g.bots + (select count(*) from wm.clan_guerre_joueurs x where x.guerre_id = g.id);
    v_pot := g.buyin * (10 + v_n);
    v_etat := case when v_a > v_b then 'won' when v_a < v_b then 'lost' else 'draw' end;
    v_part := case when v_etat = 'won' and v_n > 0 then round(v_pot * (1 - wm.reglage_num('frais.guerres.commission', 0.04)) / v_n, 2) else 0 end;   -- [réglage] frais.guerres.commission
    update wm.clan_guerres set etat = v_etat, score_nous = v_a, score_eux = v_b, cagnotte = v_pot, regle_at = now() where id = g.id;
    for j in select x.user_id, x.paye, (select (e ->> 'pts')::integer from jsonb_array_elements(v -> 'mine') e where e ->> 'u' = x.user_id::text limit 1) as pts
             from wm.clan_guerre_joueurs x where x.guerre_id = g.id order by x.user_id loop
      update wm.clan_guerre_joueurs set points = j.pts, gain = case v_etat when 'won' then v_part when 'draw' then j.paye else 0 end where guerre_id = g.id and user_id = j.user_id;
      if v_etat = 'won' then
        update public.user_stats set balance = balance + v_part, profit_realized = coalesce(profit_realized, 0) + v_part - j.paye where user_id = j.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, v_part, v_solde, 'guerre_gain', g.id::text);
        perform wm.xp_add(j.user_id, 50, 'guerre');
        perform wm.rank_refresh(j.user_id); perform wm.badges_check(j.user_id);
      elsif v_etat = 'draw' then
        update public.user_stats set balance = balance + j.paye where user_id = j.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, j.paye, v_solde, 'guerre_rendu', g.id::text);
      else
        update public.user_stats set profit_realized = coalesce(profit_realized, 0) - j.paye where user_id = j.user_id;
      end if;
      if j.user_id = p_user then
        perform wm.notify(j.user_id, 'shield', 'guerre_' || v_etat, jsonb_build_object('id', g.clan_id, 'foe', g.ennemi, 'gain', v_part - j.paye, 'pot', v_pot, 'a', v_a, 'b', v_b), '#clan-' || g.clan_id);
      else
        perform wm.notify_direct(j.user_id, 'shield', 'guerre_' || v_etat, jsonb_build_object('id', g.clan_id, 'foe', g.ennemi, 'gain', v_part - j.paye, 'pot', v_pot, 'a', v_a, 'b', v_b), '#clan-' || g.clan_id);
      end if;
    end loop;
    v_regles := v_regles + 1;
  end loop;
  return v_regles;
end $function$;

select wm.droits();
