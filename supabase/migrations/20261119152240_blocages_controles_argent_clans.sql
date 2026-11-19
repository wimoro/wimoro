-- Panneau d'administration, lot 2 (19 nov. 2026), contrôles ajoutés aux fonctions existantes (3/4) : dépôts, retraits, création de marchés et clans (un clan dissous est refusé ; quitter un clan reste toujours possible).
--
-- Chaque fonction ci-dessous est sa définition en vigueur (pg_get_functiondef), à laquelle on n'a fait qu'AJOUTER des
-- lignes marquées « [ajout] » (produites par tools/garde-fonctions.mjs, vérifiées par tests/sql/gardes.spec.mjs). Pour un
-- joueur sans blocage, hors maintenance et avec les réglages par défaut, chaque contrôle ne trouve rien et ne fait rien.
-- Les définitions d'avant sont dans backup_20261119.fonctions (lot 0).

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

CREATE OR REPLACE FUNCTION wm.proposal_create(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.uid(); v_q text := wm.texte_propre(p ->> 'q'); v_cat text := btrim(coalesce(p ->> 'cat', ''));
  v_src text := wm.texte_propre(p ->> 'src'); v_regles text := wm.texte_propre(p ->> 'rules');
  v_date date := wm.jour(p ->> 'date'); v_heure time; v_p0 numeric := wm.num(p ->> 'p0'); v_tier integer;
  s public.user_stats; x wm.propositions;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  perform wm.garde(v_uid, 'creation');   -- [ajout] blocage de la création de marchés
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 3 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Or
  if wm.texte_refuse(v_q) or wm.texte_refuse(v_src) or wm.texte_refuse(v_regles) then perform wm.fail('texte_refuse'); end if;
  if length(v_q) < 15 or length(v_q) > 120 or v_q !~ '\?$' then perform wm.fail('question_invalide'); end if;
  if v_cat not in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport') then perform wm.fail('categorie_invalide'); end if;
  begin v_heure := coalesce(nullif(btrim(coalesce(p ->> 'time', '')), ''), '21:00')::time; exception when others then perform wm.fail('date_invalide'); end;
  if v_date is null or v_date < current_date or v_date > current_date + 730 then perform wm.fail('date_invalide'); end if;
  if length(v_src) < 3 or length(v_src) > 120 then perform wm.fail('source_invalide'); end if;
  if length(v_regles) < 30 or length(v_regles) > 600 then perform wm.fail('regles_invalides'); end if;
  if v_p0 is null or v_p0 <> trunc(v_p0) or v_p0 < 5 or v_p0 > 95 then perform wm.fail('montant_invalide'); end if;
  if exists (select 1 from wm.propositions y where y.user_id = v_uid and y.etat = 'vote' and lower(y.q) = lower(v_q)) then perform wm.fail('proposition_en_double'); end if;
  if (select count(*) from wm.propositions y where y.user_id = v_uid and y.cree_at > now() - interval '24 hours') >= 5 then perform wm.fail('trop_de_propositions'); end if;   -- borne technique

  insert into wm.propositions (user_id, q, cat, date_fin, heure, src, regles, p0) values (v_uid, v_q, v_cat, v_date, v_heure, v_src, v_regles, v_p0) returning * into x;
  perform wm.xp_add(v_uid, 10, 'proposition');
  perform wm.notify(v_uid, 'plus', 'prop_vote', jsonb_build_object('id', x.id, 'q', wm.titre_court(v_q)), '#creer');
  return wm.reponse(v_uid, jsonb_build_object('prop', wm.prop_json(x, v_uid), 'props', wm.props_etat(v_uid)));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_join(p_clan text, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); v_code text := upper(btrim(coalesce(p_code, ''))); r record;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  if p_clan is null then                                                        -- par le code seul (clan créé par un joueur, inconnu de l'écran)
    select coalesce((select d.id from wm.clans_demo d where d.code = v_code), (select j.id from wm.clans_joueurs j where j.code = v_code)) into p_clan;
    if p_clan is null then perform wm.fail('clan_inconnu'); end if;
  end if;
  perform wm.clan_dissous_garde(p_clan);   -- [ajout] clan dissous par l'équipe
  select * into r from wm.clan_verifier(v_uid, p_clan);
  if r.acces <> 'open' and v_code is distinct from r.code then perform wm.fail('clan_ferme'); end if;
  perform wm.clan_entrer(v_uid, p_clan);
  perform wm.notify(v_uid, 'shield', 'clan_rejoint', jsonb_build_object('id', p_clan), '#clan-' || p_clan);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_apply(p_clan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); r record;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  perform wm.clan_dissous_garde(p_clan);   -- [ajout] clan dissous par l'équipe
  select * into r from wm.clan_verifier(v_uid, p_clan);
  if r.acces <> 'apply' then perform wm.fail('clan_ferme'); end if;
  insert into wm.clan_candidatures (user_id, clan_id) values (v_uid, p_clan) on conflict do nothing;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
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
  if s.balance < 50 then perform wm.fail('solde_insuffisant'); end if;

  update public.user_stats set balance = balance - 50, profit_realized = coalesce(profit_realized, 0) - 50 where user_id = v_uid returning balance into v_solde;   -- frais non remboursables
  v_id := 'u' || nextval('wm.clans_joueurs_seq');
  v_code := 'WMR-' || upper(translate(substr(md5(v_id || ':' || v_uid::text), 1, 4), '01io', 'XYZW'));
  while exists (select 1 from wm.clans_demo d where d.code = v_code) or exists (select 1 from wm.clans_joueurs j where j.code = v_code) loop
    v_code := 'WMR-' || upper(translate(substr(md5(v_code || v_id), 1, 4), '01io', 'XYZW'));
  end loop;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -50, v_solde, 'clan', v_id);
  insert into wm.clans_joueurs (id, nom, tag, ic, col, langues, cats, description, acces, rang_min, chef, code)
  values (v_id, v_nom, v_tag, v_ic, v_col, v_langues, v_cats, v_desc, v_acces, v_rang, v_uid, v_code);
  perform wm.clan_entrer(v_uid, v_id, 'chef');
  perform wm.badges_check(v_uid);
  perform wm.notify(v_uid, 'shield', 'clan_cree', jsonb_build_object('id', v_id, 'name', v_nom, 'tag', v_tag), '#clan-' || v_id);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid), 'id', v_id));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_promote(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); moi record; c wm.clan_membres;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  select * into moi from wm.clan_moi(v_uid);
  if moi.role <> 'chef' then perform wm.fail('role_insuffisant'); end if;
  perform 1 from wm.clans_joueurs j where j.id = moi.clan for update;                     -- une décision à la fois par clan
  select * into c from wm.clan_membres x where x.user_id = p_user and x.clan_id = moi.clan and x.parti_at is null for update;
  if not found or c.user_id = v_uid then perform wm.fail('membre_inconnu'); end if;
  if c.role <> 'membre' then perform wm.fail('deja_officier'); end if;
  if (select count(*) from wm.clan_membres x where x.clan_id = moi.clan and x.parti_at is null and x.role = 'officier') >= 5 then perform wm.fail('trop_d_officiers'); end if;
  update wm.clan_membres set role = 'officier' where id = c.id;
  perform wm.clan_fil_poser(moi.clan, v_uid, 'officier', jsonb_build_object('u', p_user));
  if not exists (select 1 from public.users u where u.id = p_user and u.is_demo) then
    perform wm.notify_direct(p_user, 'shield', 'clan_officier', jsonb_build_object('id', moi.clan), '#clan-' || moi.clan);
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_kick(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); moi record; c wm.clan_membres;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  select * into moi from wm.clan_moi(v_uid);
  if moi.role not in ('chef', 'officier') then perform wm.fail('role_insuffisant'); end if;
  select * into c from wm.clan_membres x where x.user_id = p_user and x.clan_id = moi.clan and x.parti_at is null for update;
  if not found or c.user_id = v_uid then perform wm.fail('membre_inconnu'); end if;
  if c.role = 'chef' or (moi.role = 'officier' and c.role <> 'membre') then perform wm.fail('role_insuffisant'); end if;
  update wm.clan_membres set parti_at = now() where id = c.id;
  perform wm.clan_fil_poser(moi.clan, v_uid, 'exclu', jsonb_build_object('u', p_user));
  if not exists (select 1 from public.users u where u.id = p_user and u.is_demo) then
    perform wm.notify_direct(p_user, 'shield', 'clan_exclu', jsonb_build_object('id', moi.clan), '#clans');
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_invite(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); moi record; r record; v_bot boolean; v_code text; v_fait text;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  select * into moi from wm.clan_moi(v_uid);
  if moi.role not in ('chef', 'officier') then perform wm.fail('role_insuffisant'); end if;
  if p_user is null or p_user = v_uid then perform wm.fail('joueur_inconnu'); end if;
  select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = p_user;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  if not exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = p_user) or (f.user_id = p_user and f.friend_id = v_uid))) then perform wm.fail('pas_amis'); end if;
  if exists (select 1 from wm.clan_membres x where x.user_id = p_user and x.parti_at is null) then perform wm.fail('clan_deja'); end if;
  select * into r from wm.clan_regles(moi.clan);
  if r.membres >= 50 then perform wm.fail('clan_complet'); end if;
  if v_bot then
    insert into wm.clan_membres (user_id, clan_id, role, jour) values (p_user, moi.clan, 'membre', current_date);
    perform wm.clan_fil_poser(moi.clan, p_user, 'invite', jsonb_build_object('par', v_uid));
    v_fait := 'rejoint';
  else
    if exists (select 1 from public.notifications n where n.user_id = p_user and n.code = 'clan_invite' and n.params ->> 'id' = moi.clan and n.created_at > now() - interval '1 day') then perform wm.fail('deja_invite'); end if;
    perform wm.notify_direct(p_user, 'shield', 'clan_invite', jsonb_build_object('id', moi.clan, 'u', v_uid, 'code', r.code), '#clans');
    v_fait := 'invite';
  end if;
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid), 'r', v_fait));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_call(p_market text, p_side text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); moi record; m public.chat_messages;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  select * into moi from wm.clan_moi(v_uid);
  if moi.role not in ('chef', 'officier') then perform wm.fail('role_insuffisant'); end if;
  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if not exists (select 1 from public.markets k where k.id = p_market and coalesce(k.status, 'open') = 'open') then perform wm.fail('marche_inconnu'); end if;
  if (select count(*) from wm.clan_appels a where a.clan_id = moi.clan and a.at > now() - interval '1 hour') >= 6 then perform wm.fail('trop_d_appels'); end if;
  insert into wm.clan_appels (clan_id, market_id, side, par, suivis_at) values (moi.clan, p_market, p_side, v_uid, now() + make_interval(secs => 5 + random() * 8));
  perform wm.clan_fil_poser(moi.clan, v_uid, 'appel', jsonb_build_object('m', p_market, 's', p_side));
  -- annonce dans le chat du clan : une ligne d'événement, composée à l'écran dans la langue du lecteur
  perform wm.chat_salon_creer('clan:' || moi.clan);
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source)
  values ('clan:' || moi.clan, v_uid, 'evt', '', jsonb_build_object('code', 'appel', 'm', p_market, 's', p_side), 'joueur') returning * into m;
  perform wm.chat_diffuser(m.room_id, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
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
  perform wm.clan_fil_poser(moi.clan, v_uid, 'guerre', jsonb_build_object('foe', v_ennemi, 'k', g.buyin));
  perform wm.chat_salon_creer('clan:' || moi.clan);
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source)
  values ('clan:' || moi.clan, v_uid, 'evt', '', jsonb_build_object('code', 'guerre', 'foe', v_ennemi, 'k', g.buyin), 'joueur') returning * into m;
  perform wm.chat_diffuser(m.room_id, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $function$;

CREATE OR REPLACE FUNCTION wm.clan_war_join()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := wm.uid(); moi record; g wm.clan_guerres; s public.user_stats; v_solde numeric;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  perform wm.garde(v_uid, 'clans');   -- [ajout] blocage des clans
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris (mise de la guerre)
  select * into moi from wm.clan_moi(v_uid);
  select * into g from wm.clan_guerres x where x.clan_id = moi.clan and x.etat = 'live' and x.fin > now() for update;
  if not found then perform wm.fail('guerre_absente'); end if;
  if exists (select 1 from wm.clan_guerre_joueurs j where j.guerre_id = g.id and j.user_id = v_uid) then perform wm.fail('guerre_deja'); end if;
  perform wm.rg_garde(v_uid);
  if s.balance < g.buyin then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - g.buyin;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -g.buyin, v_solde, 'guerre', g.id::text);
  insert into wm.clan_guerre_joueurs (guerre_id, user_id, paye) values (g.id, v_uid, g.buyin);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $function$;

select wm.droits();
