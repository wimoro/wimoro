-- Duels sur une manche éclair, en mode Compte.
--
-- Règles du mode Démo, tenues par le serveur :
--  * le défieur choisit un jeu éclair, son camp et sa mise ; le duel porte sur la manche en cours, ou sur la suivante s'il
--    reste moins de dix secondes de mises ; sa mise et ses frais sont pris tout de suite (séquestre) ;
--  * l'adversaire prend l'autre camp au prix du moment : la cagnotte vaut la mise du défieur divisée par ce prix ;
--  * à la fin de la manche, le camp gagnant prend la cagnotte ; un « break even » annule le duel et rend les deux mises ;
--  * sans réponse à la fermeture des mises de la manche (deux minutes au plus), la mise du défieur lui est rendue ;
--  * un bot défié accepte aussitôt.
-- Le serveur ne se fie pas au navigateur pour les prix, les frais ni l'issue : ils viennent du moteur éclair, exécuté par
-- l'Edge Function « eclair » (actions duel_create, duel_accept, duel_settle), qui écrit par les fonctions
-- srv_duel_eclair_… réservées à la clé de service. La manche, elle, est fixée par l'horloge de la base.
-- Différence voulue avec la démo : on ne peut plus accepter un duel une fois les mises de sa manche fermées (la
-- trajectoire du prix serait déjà en partie connue).

alter table wm.duels add column if not exists manche bigint;                       -- duel éclair : la manche jouée (null pour un marché)
create index if not exists duels_eclair on wm.duels (manche) where m like 'flash:%' and etat in ('open', 'active');

create or replace function wm.duel_json(d wm.duels) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'code', d.code, 'm', d.m, 'side', d.cote, 'by', d.par, 'opp', d.adv, 'stake', d.mise, 'fee', d.frais,
    'st', d.etat, 'at', (extract(epoch from d.cree_at) * 1000)::bigint, 'expiresAt', (extract(epoch from d.expire_at) * 1000)::bigint,
    'price0', d.prix0, 'price', d.prix, 'oppStake', d.mise_adv, 'oppFee', d.frais_adv, 'pot', d.cagnotte, 'winSide', d.gagnant,
    'acceptAt', (extract(epoch from d.accepte_at) * 1000)::bigint, 'settleAt', (extract(epoch from d.regle_at) * 1000)::bigint)
    || case when d.manche is not null then jsonb_build_object('round', d.manche) else '{}'::jsonb end
$$;

-- Millisecondes écoulées depuis le début d'une manche (négatif : elle n'a pas commencé). Une manche dure 45 s, dont 30 s de mises.
create or replace function wm.eclair_depuis(p_manche bigint) returns float8
language sql stable set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) - extract(epoch from timestamptz '2026-11-01 00:00:00+00')) * 1000 - (p_manche - 1) * 45000
$$;

-- Règlement : le gagnant prend la cagnotte ; statistiques et historique des deux joueurs (pas des bots).
-- Un duel éclair n'a pas de marché : son historique porte le jeu et la manche.
create or replace function wm.duel_regler(p_id bigint, p_gagnant text) returns void
language plpgsql security definer set search_path = '' as $$
declare d wm.duels; j record; v_gagne boolean; v_mise numeric; v_pnl numeric; v_solde numeric; v_eclair boolean;
begin
  select * into d from wm.duels x where x.id = p_id and x.etat = 'active' for update;
  if not found then return; end if;
  v_eclair := d.m like 'flash:%';
  update wm.duels set etat = 'regle', gagnant = p_gagnant, regle_at = now() where id = p_id;
  for j in select u.id, (u.id = d.par) as defieur from public.users u where u.id in (d.par, d.adv) and not coalesce(u.is_demo, false) order by u.id loop
    v_gagne := (case when j.defieur then d.cote else case d.cote when 'oui' then 'non' else 'oui' end end) = p_gagnant;
    v_mise := case when j.defieur then d.mise else d.mise_adv end;
    v_pnl := case when v_gagne then d.cagnotte - v_mise else -v_mise end;
    update public.user_stats set balance = balance + case when v_gagne then d.cagnotte else 0 end,
      bets_settled = coalesce(bets_settled, 0) + 1, bets_won = coalesce(bets_won, 0) + case when v_gagne then 1 else 0 end,
      profit_realized = coalesce(profit_realized, 0) + v_pnl,
      bets_accuracy_pct = round(100.0 * (coalesce(bets_won, 0) + case when v_gagne then 1 else 0 end) / (coalesce(bets_settled, 0) + 1))
    where user_id = j.id returning balance into v_solde;
    if v_gagne then insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.id, d.cagnotte, v_solde, 'duel_gain', d.id::text); end if;
    insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl)
    values (j.id, 'res', case when v_eclair then null else d.m end,
            'duel|' || (case when j.defieur then d.adv else d.par end)::text || '|' || d.m || case when v_eclair then '|' || d.manche::text else '' end,
            case when j.defieur then d.cote else case d.cote when 'oui' then 'non' else 'oui' end end, v_gagne, v_pnl);
    if v_gagne then perform wm.xp_add(j.id, 20, 'duel'); end if;
    perform wm.rank_refresh(j.id); perform wm.badges_check(j.id);
    perform wm.notify(j.id, 'swords', case when v_gagne then 'duel_gagne' else 'duel_perdu' end,
      jsonb_build_object('id', d.id, 'm', d.m, 'r', d.manche, 'u', case when j.defieur then d.adv else d.par end, 'pnl', v_pnl), '#duel-' || d.id);
  end loop;
end $$;

-- ── Défier sur une manche éclair ──
-- p : { gid, side, stake, opp, key } du joueur ; { prix, frais, frais_remise } calculés par l'Edge Function.
create or replace function public.srv_duel_eclair_creer(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user);
  v_gid text := p ->> 'gid'; v_cote text := p ->> 'side'; v_mise numeric := round(wm.num(p ->> 'stake'), 2);
  v_adv uuid := nullif(p ->> 'opp', '')::uuid; v_key uuid := nullif(p ->> 'key', '')::uuid; v_prix integer := wm.num(p ->> 'prix')::integer;
  s public.user_stats; v_prev jsonb; v_tier integer; v_frais numeric; v_solde numeric; d wm.duels; v_bot boolean := false; v_res jsonb;
  v_manche bigint; v_ms float8; v_ferme timestamptz;
begin
  if v_gid is null or v_gid !~ '^[a-z0-9]{2,12}$' then perform wm.fail('jeu_inconnu'); end if;
  if v_cote is null or v_cote not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_mise is null or v_mise < 5 or v_mise > 5000 then perform wm.fail('montant_invalide'); end if;
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if v_prix is null or v_prix < 2 or v_prix > 98 then perform wm.fail('cote_indisponible'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  if v_adv is not null then
    if v_adv = v_uid then perform wm.fail('duel_indisponible'); end if;
    if not exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = v_adv) or (f.user_id = v_adv and f.friend_id = v_uid))) then perform wm.fail('pas_amis'); end if;
    select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_adv;
  end if;
  if (select count(*) from wm.duels x where x.par = v_uid and x.etat = 'open') >= 10 then perform wm.fail('trop_de_duels'); end if;

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
end $$;

-- ── Lire un duel éclair avant de l'accepter (l'Edge Function calcule ensuite le prix et les frais) ──
create or replace function public.srv_duel_eclair_lire(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.agir_pour(p_user); d wm.duels;
begin
  select * into d from wm.duels x where (x.id = wm.num(p ->> 'id')::bigint or x.code = upper(nullif(p ->> 'code', ''))) and x.m like 'flash:%';
  if not found or d.etat <> 'open' or d.par = v_uid or (d.adv is not null and d.adv <> v_uid) then perform wm.fail('duel_indisponible'); end if;
  return jsonb_build_object('id', d.id, 'gid', substr(d.m, 7), 'side', d.cote, 'stake', d.mise, 'round', d.manche);
end $$;

-- ── Accepter : p = { id, prix, frais, frais_remise } — prix du camp du défieur au moment de l'acceptation ──
create or replace function public.srv_duel_eclair_accepter(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.agir_pour(p_user); d wm.duels; s public.user_stats; v_tier integer; v_frais numeric; v_prix integer := wm.num(p ->> 'prix')::integer;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select * into d from wm.duels x where x.id = wm.num(p ->> 'id')::bigint and x.m like 'flash:%' for update;
  if not found or d.etat <> 'open' then perform wm.fail('duel_indisponible'); end if;
  if wm.eclair_depuis(d.manche) >= 30000 then perform wm.fail('mises_fermees'); end if;      -- les mises de la manche sont fermées : trop tard
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  v_frais := round(coalesce(case when coalesce(v_tier, 0) >= 5 then wm.num(p ->> 'frais_remise') else wm.num(p ->> 'frais') end, 0), 2);
  if v_frais < 0 then perform wm.fail('montant_invalide'); end if;
  d := wm.duel_accepter(d.id, v_uid, v_prix, v_frais);
  perform wm.notify(d.par, 'swords', 'duel_accepte', jsonb_build_object('id', d.id, 'u', v_uid, 'm', d.m, 'r', d.manche, 'pot', d.cagnotte), '#duel-' || d.id);
  return wm.reponse(v_uid, jsonb_build_object('duel', wm.duel_json(d), 'duels', wm.duels_etat(v_uid)));
end $$;

-- ── Les duels éclair du joueur dont la manche est terminée (à régler ou à rendre) ──
create or replace function public.srv_duel_eclair_ouverts(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.agir_pour(p_user);
begin
  return jsonb_build_object('duels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'gid', substr(x.m, 7), 'round', x.manche) order by x.id) from (
      select * from wm.duels d where (d.par = v_uid or d.adv = v_uid) and d.m like 'flash:%' and d.etat in ('open', 'active') and wm.eclair_depuis(d.manche) >= 45000
      order by d.id limit 40) x), '[]'::jsonb));
end $$;

-- ── Régler : p_res = [ { id, out } ] — issue de la manche calculée par le moteur (1 : premier camp, 0 : second, 2 : break even) ──
create or replace function public.srv_duel_eclair_regler(p_user uuid, p_res jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.agir_pour(p_user); x jsonb; d wm.duels; v_out integer; n integer := 0;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  for x in select v from jsonb_array_elements(case when jsonb_typeof(p_res) = 'array' then p_res else '[]'::jsonb end) t(v) limit 40 loop
    select * into d from wm.duels y where y.id = wm.num(x ->> 'id')::bigint and y.m like 'flash:%' and (y.par = v_uid or y.adv = v_uid) and y.etat in ('open', 'active') for update;
    continue when not found;
    continue when wm.eclair_depuis(d.manche) < 45000;                                  -- la manche n'est pas finie
    v_out := wm.num(x ->> 'out')::integer;
    if d.etat = 'open' then
      perform wm.duel_rendre(d.id, 'expired');
      perform wm.notify(d.par, 'swords', 'duel_expire', jsonb_build_object('m', d.m, 'r', d.manche, 'id', d.id), '#duels');
    elsif v_out = 2 then                                                               -- break even : les deux mises sont rendues
      perform wm.duel_rendre(d.id, 'void');
      perform wm.notify(d.par, 'swords', 'duel_nul', jsonb_build_object('m', d.m, 'r', d.manche, 'id', d.id), '#duel-' || d.id);
      if d.adv is not null and not exists (select 1 from public.users u where u.id = d.adv and u.is_demo) then
        perform wm.notify(d.adv, 'swords', 'duel_nul', jsonb_build_object('m', d.m, 'r', d.manche, 'id', d.id), '#duel-' || d.id);
      end if;
    elsif v_out in (0, 1) then
      perform wm.duel_regler(d.id, case when v_out = 1 then 'oui' else 'non' end);
    else continue;
    end if;
    n := n + 1;
  end loop;
  return wm.reponse(v_uid, jsonb_build_object('duels', wm.duels_etat(v_uid), 'regles', n));
end $$;

-- Un duel éclair resté sans réponse : rendu à la fermeture des mises (son délai), comme les autres duels expirés.
create or replace function wm.duels_expirer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d record;
begin
  for d in select x.id, x.par, x.m, x.manche from wm.duels x where x.etat = 'open' and x.expire_at <= now() and (x.par = p_user or x.adv = p_user) order by x.id for update loop
    perform wm.duel_rendre(d.id, 'expired');
    perform wm.notify(d.par, 'swords', 'duel_expire', jsonb_build_object('m', d.m, 'r', d.manche, 'id', d.id), '#duels');
  end loop;
end $$;

-- Un duel éclair ne se crée ni ne s'accepte par les fonctions des marchés (elles ne connaissent pas ses prix).
create or replace function wm.duel_accept(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); d wm.duels; s public.user_stats; mk public.markets; l public.market_live_state; q record; v_tier integer; v_prix integer; v_autre numeric; v_frais numeric;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select * into d from wm.duels x where (x.id = wm.num(p ->> 'id')::bigint or x.code = upper(nullif(p ->> 'code', ''))) for update;
  if not found or d.etat <> 'open' or d.m like 'flash:%' then perform wm.fail('duel_indisponible'); end if;
  select * into mk from public.markets where id = d.m;
  if not found or coalesce(mk.status, 'open') <> 'open' then perform wm.fail('marche_ferme'); end if;
  select * into l from public.market_live_state where market_id = d.m;
  v_prix := round(case when d.cote = 'oui' then l.current_probability else 100 - l.current_probability end)::integer;
  if v_prix < 2 or v_prix > 98 then perform wm.fail('cote_indisponible'); end if;
  v_autre := round(round(d.mise * 100 / v_prix, 2) * (100 - v_prix) / 100, 2);
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  select * into q from wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), mk.category, coalesce(v_tier, 0) >= 5,
                                    case d.cote when 'oui' then 'non' else 'oui' end, v_autre::float8);
  v_frais := round(coalesce(q.fee, 0)::numeric, 2);
  d := wm.duel_accepter(d.id, v_uid, v_prix, v_frais);
  perform wm.notify(d.par, 'swords', 'duel_accepte', jsonb_build_object('id', d.id, 'u', v_uid, 'm', d.m, 'pot', d.cagnotte), '#duel-' || d.id);
  return wm.reponse(v_uid, jsonb_build_object('duel', wm.duel_json(d), 'duels', wm.duels_etat(v_uid)));
end $$;

revoke all on function public.srv_duel_eclair_creer(uuid, jsonb), public.srv_duel_eclair_lire(uuid, jsonb), public.srv_duel_eclair_accepter(uuid, jsonb),
  public.srv_duel_eclair_ouverts(uuid), public.srv_duel_eclair_regler(uuid, jsonb) from public, anon, authenticated;
select wm.droits();
