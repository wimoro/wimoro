-- Copy trading en mode Compte.
--
-- Règles du mode Démo (js/copy.js), tenues par le serveur : à partir du rang Or, un joueur copie un profil public qui
-- l'autorise (10 paris au moins). Il fixe un budget (50 $ minimum), une mise fixe ou un pourcentage de la mise copiée,
-- des catégories, un arrêt de perte. Chaque nouveau pari du joueur copié est reproduit par le même carnet d'ordres que
-- les paris ordinaires (prix, impact, frais), chaque vente aussi. Le joueur copié touche 20 % des frais payés par ses
-- copieurs, pris sur la part de Wimoro. 10 copies actives au plus, 15 XP à la première.
-- Les bots copiés n'ont pas de paris à eux sur le serveur : une tâche (wm-copies, toutes les 20 secondes) leur en fait
-- placer au rythme de la démo, uniquement pour ceux qui sont copiés. Les paris d'un vrai joueur sont suivis à la fin de
-- sa propre opération. Un pari copié ne déclenche jamais d'autres copies (pas de chaîne, pas de boucle).
-- Rien n'est supprimé : une copie arrêtée et un lot vendu restent en base, à l'état terminé.

create table if not exists wm.copies (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,     -- le copieur
  cible uuid not null references public.users(id) on delete cascade,       -- le joueur copié
  budget numeric(12,2) not null,
  mode text not null default 'fixed' check (mode in ('fixed', 'prop')),
  per numeric(12,2) not null default 0,               -- mise fixe par pari
  pct smallint not null default 0,                    -- ou pourcentage de la mise copiée
  cap numeric(12,2) not null default 0,               -- plafond par pari en mode pourcentage (0 : aucun)
  cats text[],                                        -- catégories copiées (null : toutes)
  stop smallint not null default 0,                   -- arrêt de perte, en % du budget (0 : aucun)
  etat text not null default 'active' check (etat in ('active', 'paused', 'stopped')),
  why text,
  realise numeric(14,4) not null default 0,
  n integer not null default 0,
  donne numeric(14,4) not null default 0,             -- reversé au joueur copié
  fin_pnl numeric(14,2) not null default 0,
  gardes integer not null default 0,                  -- positions laissées ouvertes à l'arrêt
  sec_budget boolean not null default false,          -- « budget épuisé » déjà signalé
  sec_solde boolean not null default false,           -- « solde insuffisant » déjà signalé
  cree_at timestamptz not null default now(),
  fin_at timestamptz
);
create table if not exists wm.copies_lots (
  copie bigint not null references wm.copies(id) on delete cascade,
  market_id text not null,
  side text not null check (side in ('oui', 'non')),
  sh numeric(20,8) not null default 0,
  cout numeric(14,4) not null default 0,
  primary key (copie, market_id, side)
);
create table if not exists wm.copies_journal (
  id bigint generated always as identity primary key,
  copie bigint not null references wm.copies(id) on delete cascade,
  k text not null,                                    -- 'open', 'exit', 'skip'
  market_id text, side text, amt numeric(14,2), pnl numeric(14,2), why text,
  at timestamptz not null default now()
);
alter table wm.copies enable row level security;
alter table wm.copies_lots enable row level security;
alter table wm.copies_journal enable row level security;
revoke all on wm.copies, wm.copies_lots, wm.copies_journal from public, anon, authenticated;
create unique index if not exists copies_vivante on wm.copies (user_id, cible) where etat <> 'stopped';
create index if not exists copies_cible on wm.copies (cible) where etat = 'active';
create index if not exists copies_journal_copie on wm.copies_journal (copie, id desc);

-- Une notification toujours poussée en direct, même quand elle naît à la fin de l'opération de son destinataire.
create or replace function wm.notify_direct(p_user uuid, p_icon text, p_code text, p_params jsonb default '{}'::jsonb, p_href text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_at timestamptz;
begin
  insert into public.notifications (user_id, icon, text, code, params, href)
  values (p_user, p_icon, '', p_code, coalesce(p_params, '{}'::jsonb), coalesce(p_href, '')) returning id, created_at into v_id, v_at;
  perform realtime.send(jsonb_build_object('n', jsonb_build_object('id', v_id, 'ic', p_icon, 'code', p_code, 'p', coalesce(p_params, '{}'::jsonb), 'href', coalesce(p_href, ''),
    'at', (extract(epoch from v_at) * 1000)::bigint, 'read', false)), 'notif', 'joueur:' || p_user::text, true);
end $$;

-- ── Qui peut être copié : profil public, copie autorisée (toujours pour un bot), 10 paris au moins ──
create or replace function wm.copie_possible(p_cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.is_public and coalesce(s.bets_placed, 0) >= 10
      and (coalesce(u.is_demo, false) or coalesce((select (up.prefs -> 'prefs' ->> 'copyok')::boolean from wm.user_prefs up where up.user_id = u.id), false))
    from public.users u join public.user_stats s on s.user_id = u.id where u.id = p_cible), false)
$$;

-- ── Ce que le copieur voit ──
create or replace function wm.copie_json(c wm.copies) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'u', c.cible, 'at', (extract(epoch from c.cree_at) * 1000)::bigint, 'status', c.etat, 'why', c.why,
    'budget', c.budget, 'mode', c.mode, 'per', c.per, 'pct', c.pct, 'cap', c.cap, 'cats', case when c.cats is null then null else to_jsonb(c.cats) end, 'stop', c.stop,
    'realized', c.realise, 'n', c.n, 'given', c.donne, 'endPnl', c.fin_pnl, 'kept', c.gardes, 'end', (extract(epoch from c.fin_at) * 1000)::bigint,
    'holds', coalesce((select jsonb_agg(jsonb_build_object('m', l.market_id, 's', l.side, 'sh', l.sh, 'cost', l.cout) order by l.market_id, l.side)
                       from wm.copies_lots l where l.copie = c.id and l.sh > 0), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(x.j order by x.id desc) from (
                       select j.id, jsonb_strip_nulls(jsonb_build_object('k', j.k, 'm', j.market_id, 's', j.side, 'amt', j.amt, 'pnl', j.pnl, 'why', j.why,
                         'at', (extract(epoch from j.at) * 1000)::bigint)) as j
                       from wm.copies_journal j where j.copie = c.id order by j.id desc limit 30) x), '[]'::jsonb))
$$;
-- Ses copies (les vivantes, et les 10 dernières arrêtées), les fiches des joueurs copiés ; et, quand c'est lui qu'on copie,
-- le nombre de ses copieurs et ce qu'ils lui ont rapporté.
create or replace function wm.copies_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with l as ((select * from wm.copies c where c.user_id = p_user and c.etat <> 'stopped')
             union all (select * from wm.copies c where c.user_id = p_user and c.etat = 'stopped' order by c.id desc limit 10))
  select jsonb_build_object(
    'list', coalesce((select jsonb_agg(wm.copie_json(l) order by l.id desc) from l), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(x.cible::text, wm.fiche(x.cible)) from (select distinct cible from l) x), '{}'::jsonb),
    'copiers', (select count(*) from wm.copies c where c.cible = p_user and c.etat = 'active'),
    'earn', coalesce((select sum(b.amount) from public.balance_ledger b where b.user_id = p_user and b.kind = 'copie_revenu'), 0))
$$;

create or replace function wm.copie_note(p_copie bigint, p_k text, p_market text, p_side text, p_amt numeric default null, p_pnl numeric default null, p_why text default null)
returns void language sql security definer set search_path = '' as $$
  insert into wm.copies_journal (copie, k, market_id, side, amt, pnl, why) values (p_copie, p_k, p_market, p_side, p_amt, p_pnl, p_why)
$$;

-- Résultat latent d'une copie : ses lots au prix du marché, moins leur coût.
create or replace function wm.copie_latent(p_copie bigint) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.sh * (case when l.side = 'oui' then s.current_probability else 100 - s.current_probability end) / 100 - l.cout), 0)
  from wm.copies_lots l join public.market_live_state s on s.market_id = l.market_id where l.copie = p_copie and l.sh > 0
$$;

-- ── Reproduire un pari : même carnet, mêmes frais que pour un pari ordinaire ──
-- Renvoie { r: 'ok' | 'cat' | 'budget' | 'balance' | 'liq' | 'ferme' | 'occupe', amt, part }.
-- p_attendre : vrai seulement quand c'est le copieur lui-même qui agit ; sinon un copieur occupé n'est jamais attendu.
create or replace function wm.copie_executer(p_copie bigint, p_market text, p_side text, p_mise numeric, p_attendre boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c wm.copies; s public.user_stats; mk public.markets; l public.market_live_state; q record;
  v_user uuid; v_ids text[]; v_amt numeric; v_libre numeric; v_tier integer; v_fee numeric; v_cout numeric; v_part numeric; v_solde numeric; v_p numeric;
  v_sens integer := case when p_side = 'oui' then 1 else -1 end; v_bot boolean;
begin
  select x.user_id into v_user from wm.copies x where x.id = p_copie and x.etat = 'active';
  if not found then return jsonb_build_object('r', 'ferme'); end if;
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
  if v_amt < 5 or v_libre < v_amt then return jsonb_build_object('r', 'budget'); end if;
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
  v_part := case when v_bot then 0 else trunc(v_fee * 0.20, 2) end;             -- part du joueur copié, prise sur les frais de Wimoro
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
  update wm.copies set realise = realise - v_fee, n = n + 1, donne = donne + v_fee * 0.20 where id = c.id;

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
end $$;

-- ── Vendre un lot copié (en tout ou partie) ; renvoie son résultat net. Le copieur est déjà verrouillé par l'appelant. ──
create or replace function wm.copie_vendre(p_copie bigint, p_market text, p_side text) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  c wm.copies; h wm.copies_lots; pos public.positions; l public.market_live_state; mk public.markets; q record;
  v_ids text[]; v_sh numeric; v_vendu numeric; v_cout numeric; v_pro numeric; v_pnl numeric; v_reste numeric; v_solde numeric; v_p numeric;
  v_sens integer := case when p_side = 'oui' then -1 else 1 end;
begin
  select * into c from wm.copies x where x.id = p_copie for update;
  select * into h from wm.copies_lots x where x.copie = p_copie and x.market_id = p_market and x.side = p_side and x.sh > 0 for update;
  if not found then return null; end if;
  select * into mk from public.markets where id = p_market;
  v_ids := wm.fratrie(p_market);
  perform 1 from public.market_live_state x where x.market_id = any (v_ids) order by x.market_id for update;
  select * into l from public.market_live_state where market_id = p_market;
  select * into pos from public.positions where user_id = c.user_id and market_id = p_market and side = p_side for update;
  v_sh := least(h.sh, coalesce(pos.shares, 0));
  if v_sh > 0.000001 and coalesce(mk.status, 'open') = 'open' then
    select * into q from wm.quote_sell(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), p_side, v_sh::float8);
    v_vendu := least(v_sh, q.sh::numeric);
    if v_vendu <= 0.000000001 then return 0; end if;
    v_pro := trunc(q.pro::numeric, 2);
    v_cout := h.cout * (v_vendu / h.sh);
    v_pnl := round(v_pro - v_cout, 2);
    v_reste := pos.shares - v_vendu;
    if v_reste < 0.05 then v_reste := 0; end if;
    update public.positions set shares = v_reste, updated_at = now() where id = pos.id;
    update public.user_stats set balance = balance + v_pro, profit_realized = coalesce(profit_realized, 0) + v_pro - round(v_vendu * pos.average_price / 100, 2)
    where user_id = c.user_id returning balance into v_solde;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (c.user_id, v_pro, v_solde, 'copie_vente', p_market || ':' || p_side);
    insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl)
    values (c.user_id, 'sell', p_market, 'via|copy|' || c.cible::text, p_side, v_pnl >= 0, v_pnl);
    v_p := round(greatest(1::float8, least(99::float8, l.current_probability::float8 + q.impact * v_sens))::numeric, 6);
    update public.market_live_state set
      current_probability = v_p, volume_total = volume_total + v_pro,
      open_yes = greatest(0, open_yes - case when p_side = 'oui' then pos.shares - v_reste else 0 end),
      open_no = greatest(0, open_no - case when p_side = 'non' then pos.shares - v_reste else 0 end),
      mm_cash = mm_cash - v_pro,
      price_history = wm.ph_push(price_history, round(v_p, 2)), seq = seq + 1, updated_at = now()
    where market_id = p_market;
    perform wm.group_rebalance(p_market, (v_p - l.current_probability)::float8);
    perform wm.tick_emit(v_ids);
    update wm.copies_lots set sh = case when h.sh - v_vendu < 0.05 then 0 else h.sh - v_vendu end, cout = case when h.sh - v_vendu < 0.05 then 0 else h.cout - v_cout end
    where copie = p_copie and market_id = p_market and side = p_side;
  else                                                                          -- déjà vendu à la main (ou marché fermé) : sorti de la copie au prix du marché
    v_pnl := round(h.sh * (case when p_side = 'oui' then l.current_probability else 100 - l.current_probability end) / 100 - h.cout, 2);
    update wm.copies_lots set sh = 0, cout = 0 where copie = p_copie and market_id = p_market and side = p_side;
  end if;
  update wm.copies set realise = realise + v_pnl where id = p_copie;
  return v_pnl;
end $$;

-- ── Arrêter une copie, en vendant ou non ses positions ──
create or replace function wm.copie_arreter(p_copie bigint, p_why text, p_vendre boolean) returns wm.copies
language plpgsql security definer set search_path = '' as $$
declare c wm.copies; h record; v_latent numeric; v_gardes integer;
begin
  select * into c from wm.copies x where x.id = p_copie and x.etat <> 'stopped' for update;
  if not found then return null; end if;
  if p_vendre then
    for h in select x.market_id, x.side from wm.copies_lots x where x.copie = p_copie and x.sh > 0 order by x.market_id, x.side loop
      perform wm.copie_vendre(p_copie, h.market_id, h.side);
    end loop;
  end if;
  v_latent := wm.copie_latent(p_copie);
  select count(*) into v_gardes from wm.copies_lots x where x.copie = p_copie and x.sh > 0;
  update wm.copies_lots set sh = 0, cout = 0 where copie = p_copie and sh > 0;       -- les positions restantes ne sont plus suivies par la copie
  update wm.copies set etat = 'stopped', why = p_why, fin_pnl = round(realise + v_latent, 2), gardes = v_gardes, fin_at = now() where id = p_copie returning * into c;
  if p_why = 'stop' then
    perform wm.notify_direct(c.user_id, 'copy', 'copie_stop', jsonb_build_object('u', c.cible, 'pnl', c.fin_pnl), '#copie');
  end if;
  return c;
end $$;

-- Arrêt de perte : si la perte de la copie atteint sa limite, elle s'arrête et vend ses positions.
create or replace function wm.copie_garde(p_copie bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c wm.copies;
begin
  select * into c from wm.copies x where x.id = p_copie and x.etat <> 'stopped' and x.stop > 0;
  if not found or c.realise + wm.copie_latent(p_copie) > -c.budget * c.stop / 100 then return false; end if;
  perform wm.copie_arreter(p_copie, 'stop', true);
  return true;
end $$;

-- ── Le joueur copié vient de parier : ses copies actives reproduisent le pari ──
create or replace function wm.copies_suivre(p_cible uuid, p_market text, p_side text, p_mise numeric) returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; v jsonb; n integer := 0; v_part numeric := 0; v_solde numeric;
begin
  if not wm.copie_possible(p_cible) then                                         -- profil passé en privé, ou copie retirée : ses copies s'arrêtent
    for c in select x.id, x.user_id from wm.copies x where x.cible = p_cible and x.etat <> 'stopped' order by x.id loop
      perform wm.copie_arreter(c.id, 'private', false);                         -- les positions déjà copiées restent au portefeuille du copieur
      perform wm.notify_direct(c.user_id, 'copy', 'copie_fin', jsonb_build_object('u', p_cible), '#copie');
    end loop;
    return 0;
  end if;
  for c in select x.id, x.user_id, x.sec_budget, x.sec_solde from wm.copies x where x.cible = p_cible and x.etat = 'active' order by x.id loop
    v := wm.copie_executer(c.id, p_market, p_side, p_mise);
    if v ->> 'r' = 'ok' then
      n := n + 1; v_part := v_part + coalesce((v ->> 'part')::numeric, 0);
      perform wm.notify_direct(c.user_id, 'copy', 'copie_ouverte', jsonb_build_object('u', p_cible, 'amt', (v ->> 'amt')::numeric, 's', p_side, 'm', p_market), '#copie');
      perform wm.copie_garde(c.id);
    elsif v ->> 'r' in ('budget', 'balance') then
      perform wm.copie_note(c.id, 'skip', p_market, p_side, null, null, v ->> 'r');
      if (v ->> 'r' = 'budget' and not c.sec_budget) or (v ->> 'r' = 'balance' and not c.sec_solde) then      -- signalé une seule fois
        update wm.copies set sec_budget = sec_budget or v ->> 'r' = 'budget', sec_solde = sec_solde or v ->> 'r' = 'balance' where id = c.id;
        perform wm.notify_direct(c.user_id, 'copy', 'copie_a_sec', jsonb_build_object('u', p_cible, 'why', v ->> 'r'), '#copie');
      end if;
    elsif v ->> 'r' in ('cat', 'liq') then
      perform wm.copie_note(c.id, 'skip', p_market, p_side, null, null, v ->> 'r');
    end if;
  end loop;
  if v_part >= 0.01 then                                                        -- la part du joueur copié, créditée en une fois
    update public.user_stats set balance = balance + v_part where user_id = p_cible returning balance into v_solde;
    if found then
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_cible, v_part, v_solde, 'copie_revenu', p_market || ':' || p_side);
      perform wm.notify_direct(p_cible, 'copy', 'copie_revenu', jsonb_build_object('gain', v_part, 'n', n), '#copie');
    end if;
  end if;
  return n;
end $$;

-- ── Le joueur copié vient de vendre : les copies qui détiennent ce lot le vendent aussi ──
create or replace function wm.copies_sortir(p_cible uuid, p_market text, p_side text) returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; v_pnl numeric; n integer := 0;
begin
  for c in select x.id, x.user_id from wm.copies x join wm.copies_lots l on l.copie = x.id and l.market_id = p_market and l.side = p_side and l.sh > 0
           where x.cible = p_cible and x.etat = 'active' order by x.id loop
    perform 1 from public.user_stats where user_id = c.user_id for update skip locked;
    continue when not found;                                                    -- copieur occupé : son lot reste ouvert
    v_pnl := wm.copie_vendre(c.id, p_market, p_side);
    continue when v_pnl is null;
    n := n + 1;
    perform wm.copie_note(c.id, 'exit', p_market, p_side, null, v_pnl);
    perform wm.notify_direct(c.user_id, 'copy', 'copie_sortie', jsonb_build_object('u', p_cible, 'm', p_market, 's', p_side, 'pnl', v_pnl), '#copie');
    perform wm.copie_garde(c.id);
  end loop;
  return n;
end $$;

-- ── Vrais joueurs copiés : leurs paris et leurs ventes sont suivis à la fin de leur propre opération ──
-- (déclencheur différé : le pari du joueur est entièrement écrit avant que ses copies ne s'exécutent ; une erreur dans une
-- copie n'annule jamais le pari). Les écritures des copies elles-mêmes ('copie', 'copie_vente') ne déclenchent rien.
create or replace function wm.copies_declencheur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from wm.copies c where c.cible = new.user_id and c.etat = 'active') then return null; end if;
  begin
    if new.kind = 'bet' and new.amount < 0 then
      perform wm.copies_suivre(new.user_id, split_part(new.ref_id, ':', 1), split_part(new.ref_id, ':', 2), -new.amount);
    elsif new.kind = 'sell' then
      perform wm.copies_sortir(new.user_id, split_part(new.ref_id, ':', 1), split_part(new.ref_id, ':', 2));
    end if;
  exception when others then
    raise warning 'copies non suivies pour % : %', new.user_id, sqlerrm;
  end;
  return null;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger t where t.tgname = 'copies_suivre' and t.tgrelid = 'public.balance_ledger'::regclass) then
    create constraint trigger copies_suivre after insert on public.balance_ledger deferrable initially deferred
      for each row when (new.kind in ('bet', 'sell')) execute function wm.copies_declencheur();
  end if;
end $$;

-- ── Tâche de fond (toutes les 20 secondes) : arrêts de perte, et paris des bots copiés ──
create or replace function wm.copies_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_m text; v_s text; v_cats text[]; n_paris integer := 0; n_ventes integer := 0; n_stops integer := 0;
begin
  if not exists (select 1 from wm.copies where etat = 'active') then return jsonb_build_object('paris', 0, 'ventes', 0, 'arrets', 0); end if;
  for r in select c.id, c.user_id from wm.copies c where c.etat <> 'stopped' and c.stop > 0 order by c.id loop
    begin
      perform 1 from public.user_stats where user_id = r.user_id for update skip locked;
      if found and wm.copie_garde(r.id) then n_stops := n_stops + 1; end if;
    exception when others then raise warning 'arrêt de perte non vérifié (copie %) : %', r.id, sqlerrm;
    end;
  end loop;
  for r in select distinct c.cible from wm.copies c join public.users u on u.id = c.cible where c.etat = 'active' and coalesce(u.is_demo, false) loop
    continue when random() < 0.5;                                               -- un bot copié agit une fois sur deux
    begin
      select l.market_id, l.side into v_m, v_s from wm.copies c join wm.copies_lots l on l.copie = c.id and l.sh > 0
      where c.cible = r.cible and c.etat = 'active' order by random() limit 1;
      if found and random() < 0.3 then                                          -- il revend un de ses paris
        n_ventes := n_ventes + wm.copies_sortir(r.cible, v_m, v_s);
      else                                                                      -- il place un nouveau pari, 7 fois sur 10 dans les catégories d'un de ses copieurs
        select c.cats into v_cats from wm.copies c where c.cible = r.cible and c.etat = 'active' order by random() limit 1;
        select m.id into v_m from public.markets m join public.market_live_state l on l.market_id = m.id
        where coalesce(m.status, 'open') = 'open' and (v_cats is null or array_length(v_cats, 1) is null or random() >= 0.7 or m.category = any (v_cats))
        order by -ln(greatest(random(), 1e-12)) / greatest(0.05, coalesce(m.heat_level, 1)::float8) limit 1;
        continue when v_m is null;
        select case when random() < greatest(0.2, least(0.8, 0.5 + (coalesce(l.anchor_probability, l.current_probability) - l.current_probability)::float8 * 0.05
                 + (l.current_probability::float8 - 50) / 150)) then 'oui' else 'non' end into v_s
        from public.market_live_state l where l.market_id = v_m;
        n_paris := n_paris + wm.copies_suivre(r.cible, v_m, v_s, (array[50, 80, 120, 200, 300, 500, 750, 1200])[1 + floor(random() * 8)::integer]);
      end if;
    exception when others then raise warning 'bot copié % non joué : %', r.cible, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('paris', n_paris, 'ventes', n_ventes, 'arrets', n_stops);
end $$;

-- ── Démarrer ou régler une copie ──
-- p = { u, budget, mode, per, pct, cap, cats, stop, edit (identifiant d'une copie à régler), existing: [{ m, s, amt }] }
create or replace function wm.copy_start(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_cible uuid := nullif(p ->> 'u', '')::uuid; v_edit bigint := nullif(p ->> 'edit', '')::bigint;
  v_budget numeric := round(wm.num(p ->> 'budget'), 2); v_mode text := case when p ->> 'mode' = 'prop' then 'prop' else 'fixed' end;
  v_per numeric := coalesce(round(wm.num(p ->> 'per'), 2), 0); v_pct numeric := coalesce(round(wm.num(p ->> 'pct')), 0); v_cap numeric := coalesce(round(wm.num(p ->> 'cap'), 2), 0);
  v_stop numeric := coalesce(wm.num(p ->> 'stop'), 0); v_cats text[]; v_tier integer; v_premier boolean; v_bot boolean; v_n integer := 0; e jsonb; r record;
  s public.user_stats; c wm.copies;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r2.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r2;
  if coalesce(v_tier, 0) < 3 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Or
  if jsonb_typeof(p -> 'cats') = 'array' and jsonb_array_length(p -> 'cats') > 0 then
    select array_agg(x) into v_cats from jsonb_array_elements_text(p -> 'cats') x
    where x in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport', 'Sport live', 'Bourse', 'Matières', 'Devises');
  end if;
  if v_budget is null or v_budget < 50 then perform wm.fail('budget_min'); end if;
  if v_mode = 'fixed' and (v_per < 5 or v_per > v_budget) then perform wm.fail('mise_copie_invalide'); end if;
  if v_mode = 'prop' and (v_pct < 1 or v_pct > 100 or (v_cap > 0 and v_cap < 5)) then perform wm.fail('mise_copie_invalide'); end if;
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
  if (select count(*) from wm.copies x where x.user_id = v_uid and x.etat <> 'stopped') >= 10 then perform wm.fail('trop_de_copies'); end if;
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
end $$;

-- ── Mettre en pause, reprendre, arrêter (en gardant ou en vendant les positions copiées) ──
create or replace function wm.copy_set(p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); c wm.copies;
begin
  if p_action is null or p_action not in ('pause', 'resume', 'stop', 'stop_close') then perform wm.fail('action_invalide'); end if;
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into c from wm.copies x where x.id = p_id and x.user_id = v_uid and x.etat <> 'stopped' for update;
  if not found then perform wm.fail('copie_indisponible'); end if;
  if p_action = 'pause' then update wm.copies set etat = 'paused' where id = c.id returning * into c;
  elsif p_action = 'resume' then update wm.copies set etat = 'active', sec_budget = false, sec_solde = false where id = c.id returning * into c;
  else c := wm.copie_arreter(c.id, 'manual', p_action = 'stop_close'); end if;
  return wm.reponse(v_uid, jsonb_build_object('copies', wm.copies_etat(v_uid), 'copie', c.id, 'endPnl', c.fin_pnl, 'kept', c.gardes));
end $$;

create or replace function public.api_copy_start(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.copy_start(p) $$;
create or replace function public.api_copy_set(p_id bigint, p_action text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.copy_set(p_id, p_action) $$;

-- ── Le lot enregistre son bloc (voir …_etat_blocs.sql) ──
insert into wm.etat_blocs (cle, fonction, ordre) values ('copies', 'wm.copies_etat', 90)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre;

select cron.schedule('wm-copies', '20 seconds', 'select wm.copies_tick()');

select wm.droits();
