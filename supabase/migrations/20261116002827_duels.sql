-- Duels entre amis sur un marché (lot 4.6, suite).
--
-- Règles du mode Démo, tenues par le serveur :
--   * le défieur choisit un marché, son camp et sa mise ; sa mise et ses frais sont pris tout de suite (séquestre) ;
--   * l'ami désigné (ou celui qui ouvre le lien d'invitation) accepte en prenant le camp inverse. La cote est celle du
--     marché au moment de l'acceptation : si le camp du défieur vaut 70 ¢, il engage 70 % de la cagnotte, l'autre 30 % ;
--   * le duel est réglé avec la résolution du marché : le gagnant prend la cagnotte ;
--   * refusé, annulé ou sans réponse sous 48 heures : la mise est rendue (les frais d'ouverture restent acquis, comme en Démo) ;
--   * un bot défié accepte aussitôt.
-- Les duels sur une manche éclair et les duels de stack ne sont pas encore reliés : l'écran les annonce indisponibles.

create table if not exists wm.duels (
  id bigint generated always as identity primary key,
  code text not null unique,
  par uuid not null references public.users(id) on delete cascade,
  adv uuid references public.users(id) on delete cascade,          -- null : ouvert à qui reçoit le lien
  m text not null,
  cote text not null check (cote in ('oui', 'non')),
  mise numeric(12,2) not null,
  frais numeric(12,2) not null default 0,
  etat text not null default 'open' check (etat in ('open', 'active', 'regle', 'void', 'expired', 'declined')),
  prix0 integer, prix integer, mise_adv numeric(12,2), frais_adv numeric(12,2), cagnotte numeric(14,2),
  gagnant text check (gagnant in ('oui', 'non')),
  cree_at timestamptz not null default now(), accepte_at timestamptz, regle_at timestamptz, expire_at timestamptz not null
);
alter table wm.duels enable row level security;
revoke all on wm.duels from public, anon, authenticated;
create index if not exists duels_par on wm.duels (par, id desc);
create index if not exists duels_adv on wm.duels (adv, id desc);
create index if not exists duels_marche on wm.duels (m) where etat in ('open', 'active');

create or replace function wm.duel_json(d wm.duels) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'code', d.code, 'm', d.m, 'side', d.cote, 'by', d.par, 'opp', d.adv, 'stake', d.mise, 'fee', d.frais,
    'st', d.etat, 'at', (extract(epoch from d.cree_at) * 1000)::bigint, 'expiresAt', (extract(epoch from d.expire_at) * 1000)::bigint,
    'price0', d.prix0, 'price', d.prix, 'oppStake', d.mise_adv, 'oppFee', d.frais_adv, 'pot', d.cagnotte, 'winSide', d.gagnant,
    'acceptAt', (extract(epoch from d.accepte_at) * 1000)::bigint, 'settleAt', (extract(epoch from d.regle_at) * 1000)::bigint)
$$;

-- Rend les mises d'un duel ouvert ou en cours (les frais restent acquis) et le ferme dans l'état donné.
create or replace function wm.duel_rendre(p_id bigint, p_etat text) returns void
language plpgsql security definer set search_path = '' as $$
declare d wm.duels; v_solde numeric;
begin
  select * into d from wm.duels x where x.id = p_id and x.etat in ('open', 'active') for update;
  if not found then return; end if;
  if not exists (select 1 from public.users u where u.id = d.par and u.is_demo) then
    update public.user_stats set balance = balance + d.mise where user_id = d.par returning balance into v_solde;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (d.par, d.mise, v_solde, 'duel_rendu', d.id::text);
  end if;
  if d.etat = 'active' and d.adv is not null and not exists (select 1 from public.users u where u.id = d.adv and u.is_demo) then
    update public.user_stats set balance = balance + d.mise_adv where user_id = d.adv returning balance into v_solde;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (d.adv, d.mise_adv, v_solde, 'duel_rendu', d.id::text);
  end if;
  update wm.duels set etat = p_etat, regle_at = now() where id = p_id;
end $$;

-- Les duels sans réponse depuis plus de 48 heures : mise rendue, défieur prévenu.
create or replace function wm.duels_expirer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d record;
begin
  for d in select x.id, x.par, x.m from wm.duels x where x.etat = 'open' and x.expire_at <= now() and (x.par = p_user or x.adv = p_user) order by x.id for update loop
    perform wm.duel_rendre(d.id, 'expired');
    perform wm.notify(d.par, 'swords', 'duel_expire', jsonb_build_object('m', d.m, 'id', d.id), '#duels');
  end loop;
end $$;

-- Les duels du joueur (40 derniers) et les fiches de ses adversaires.
create or replace function wm.duels_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with l as (select * from wm.duels d where d.par = p_user or d.adv = p_user order by d.id desc limit 40)
  select jsonb_build_object(
    'liste', coalesce((select jsonb_agg(wm.duel_json(l) order by l.id desc) from l), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(a.u::text, wm.fiche(a.u)) from (select distinct case when l.par = p_user then l.adv else l.par end as u from l) a where a.u is not null), '{}'::jsonb))
$$;

-- Acceptation : la cote du marché fixe les deux mises ; celle de l'accepteur est prise (sauf s'il est un bot).
create or replace function wm.duel_accepter(p_id bigint, p_adv uuid, p_prix integer, p_frais numeric) returns wm.duels
language plpgsql security definer set search_path = '' as $$
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
    if s.balance < v_autre + coalesce(p_frais, 0) then perform wm.fail('solde_insuffisant'); end if;
    v_solde := s.balance - v_autre - coalesce(p_frais, 0);
    update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1, profit_realized = coalesce(profit_realized, 0) - coalesce(p_frais, 0) where user_id = p_adv;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_adv, -(v_autre + coalesce(p_frais, 0)), v_solde, 'duel', d.id::text);
  end if;
  update wm.duels set adv = p_adv, prix = p_prix, mise_adv = v_autre, frais_adv = coalesce(p_frais, 0), cagnotte = v_pot, etat = 'active', accepte_at = now()
  where id = p_id returning * into d;
  update public.market_live_state set volume_total = volume_total + d.mise + v_autre, participants_count = participants_count + 1, updated_at = now() where market_id = d.m;
  return d;
end $$;

-- Règlement : le gagnant prend la cagnotte ; statistiques et historique des deux joueurs (pas des bots).
create or replace function wm.duel_regler(p_id bigint, p_gagnant text) returns void
language plpgsql security definer set search_path = '' as $$
declare d wm.duels; j record; v_gagne boolean; v_mise numeric; v_pnl numeric; v_solde numeric;
begin
  select * into d from wm.duels x where x.id = p_id and x.etat = 'active' for update;
  if not found then return; end if;
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
    values (j.id, 'res', d.m, 'duel|' || (case when j.defieur then d.adv else d.par end)::text || '|' || d.m, case when j.defieur then d.cote else case d.cote when 'oui' then 'non' else 'oui' end end, v_gagne, v_pnl);
    if v_gagne then perform wm.xp_add(j.id, 20, 'duel'); end if;
    perform wm.rank_refresh(j.id); perform wm.badges_check(j.id);
    perform wm.notify(j.id, 'swords', case when v_gagne then 'duel_gagne' else 'duel_perdu' end,
      jsonb_build_object('id', d.id, 'm', d.m, 'u', case when j.defieur then d.adv else d.par end, 'pnl', v_pnl), '#duel-' || d.id);
  end loop;
end $$;

-- À la résolution d'un marché : ses duels en cours sont réglés, ceux restés sans réponse sont rendus.
create or replace function wm.duels_marche(p_market text, p_issue text) returns integer
language plpgsql security definer set search_path = '' as $$
declare d record; n integer := 0;
begin
  for d in select x.id, x.etat, x.par from wm.duels x where x.m = p_market and x.etat in ('open', 'active') order by x.id for update loop
    if d.etat = 'active' then perform wm.duel_regler(d.id, p_issue); n := n + 1;
    else perform wm.duel_rendre(d.id, 'expired'); perform wm.notify(d.par, 'swords', 'duel_expire', jsonb_build_object('m', p_market, 'id', d.id), '#duels'); end if;
  end loop;
  return n;
end $$;

-- ── Défier : p = { m, side, stake, opp, key } ──
create or replace function wm.duel_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── Accepter : par numéro (ami désigné) ou par code (lien d'invitation) ──
create or replace function wm.duel_accept(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); d wm.duels; s public.user_stats; mk public.markets; l public.market_live_state; q record; v_tier integer; v_prix integer; v_autre numeric; v_frais numeric;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select * into d from wm.duels x where (x.id = wm.num(p ->> 'id')::bigint or x.code = upper(nullif(p ->> 'code', ''))) for update;
  if not found or d.etat <> 'open' then perform wm.fail('duel_indisponible'); end if;
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

-- ── Refuser (l'ami désigné) ou annuler (le défieur) : la mise du défieur lui est rendue ──
create or replace function wm.duel_close(p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); d wm.duels;
begin
  select * into d from wm.duels x where x.id = p_id for update;
  if not found or d.etat <> 'open' then perform wm.fail('duel_indisponible'); end if;
  if p_action = 'cancel' and d.par = v_uid then
    perform wm.duel_rendre(d.id, 'expired');
  elsif p_action = 'decline' and d.adv = v_uid then
    perform wm.duel_rendre(d.id, 'declined');
    perform wm.notify(d.par, 'swords', 'duel_decline', jsonb_build_object('id', d.id, 'u', v_uid, 'm', d.m), '#duels');
  else perform wm.fail('duel_indisponible'); end if;
  return wm.reponse(v_uid, jsonb_build_object('duels', wm.duels_etat(v_uid)));
end $$;

-- ── Ouvrir un lien d'invitation : le duel et la fiche du défieur (seulement s'il attend encore une réponse) ──
create or replace function wm.duel_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); d wm.duels;
begin
  select * into d from wm.duels x where x.code = upper(btrim(coalesce(p_code, ''))) and x.etat = 'open' and x.expire_at > now() and (x.adv is null or x.adv = v_uid or x.par = v_uid);
  if not found then perform wm.fail('duel_indisponible'); end if;
  return jsonb_build_object('duel', wm.duel_json(d), 'users', jsonb_build_object(d.par::text, wm.fiche(d.par)));
end $$;

create or replace function wm.duels() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  perform wm.duels_expirer(v_uid);
  return wm.duels_etat(v_uid);
end $$;

create or replace function public.api_duel_create(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.duel_create(p) $$;
create or replace function public.api_duel_accept(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.duel_accept(p) $$;
create or replace function public.api_duel_close(p_id bigint, p_action text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.duel_close(p_id, p_action) $$;
create or replace function public.api_duel_code(p_code text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.duel_code(p_code) $$;
create or replace function public.api_duels() returns jsonb language sql security invoker set search_path = '' as $$ select wm.duels() $$;

-- ── Résolution d'un marché : ses duels sont réglés avec lui (issues sœurs comprises) ──
create or replace function wm.adm_marche_resoudre(p_admin uuid, p_market text, p_issue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mk public.markets; v_res jsonb; v_autres jsonb := '{}'::jsonb; f record; v_duels integer;
begin
  if p_issue is null or p_issue not in ('oui', 'non') then perform wm.fail('issue_invalide'); end if;
  select * into mk from public.markets m where m.id = p_market for update;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if mk.status = 'resolved' then perform wm.fail('deja_resolu'); end if;
  v_res := wm.marche_regler(p_market, p_issue);
  v_duels := wm.duels_marche(p_market, p_issue);
  if mk.group_parent_id is not null and p_issue = 'oui' then          -- une seule issue peut gagner : les autres se résolvent par « non »
    for f in select m.id from public.markets m where m.group_parent_id = mk.group_parent_id and m.id <> p_market and coalesce(m.status, 'open') <> 'resolved' order by m.id for update loop
      v_autres := v_autres || jsonb_build_object(f.id, wm.marche_regler(f.id, 'non'));
      v_duels := v_duels + wm.duels_marche(f.id, 'non');
    end loop;
    update public.market_groups set status = 'resolved' where id = mk.group_parent_id;
  end if;
  perform wm.adm_note(p_admin, 'marche_resolu', p_market, v_res || jsonb_build_object('issue', p_issue, 'autres', v_autres, 'duels', v_duels));
  return wm.adm_marches() || jsonb_build_object('reglement', v_res, 'autres', v_autres);
end $$;

-- ── L'état du joueur porte ses duels ──
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := wm.state_socle(); v_uid uuid := (v ->> 'uid')::uuid;
begin
  perform wm.duels_expirer(v_uid);
  return v || jsonb_build_object('serie', wm.serie_etat(v_uid),
    'blitz', coalesce((select jsonb_agg(j.blitz order by j.blitz) from wm.blitz_joueurs j where j.user_id = v_uid and not j.regle), '[]'::jsonb),
    'duels', wm.duels_etat(v_uid));
end $$;

select wm.droits();
