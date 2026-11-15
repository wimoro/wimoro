-- La Série en mode Compte (lot 4.4, suite).
--
-- Règles (celles du mode Démo) : une mise ; chaque manche dure 60 secondes ; le joueur choisit Haut, Bas ou Break even dans
-- les 30 premières secondes, avec tout son stack ; bonne prédiction : stack × cote (après frais), et la manche suivante
-- commence aussitôt ; mauvaise : tout est perdu. Sans choix : mise rendue s'il n'a encore rien gagné, sinon encaissement
-- automatique. 12 manches au plus.
-- Qui décide quoi : l'Edge Function « eclair » exécute le même moteur que l'écran avec l'horloge du serveur (prix de
-- départ, cotes du moment, issue de la manche) ; les fonctions srv_serie_… ci-dessous, réservées à la clé de service,
-- tiennent l'argent et l'état, et revérifient l'heure avec l'horloge de la base. Le joueur ne choisit donc ni sa cote,
-- ni son prix de départ, ni l'issue.

create table if not exists wm.series (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  gid text not null,
  stake numeric(12,2) not null,
  stack numeric(14,2) not null,
  step integer not null default 1,
  state text not null default 'running' check (state in ('running', 'lost', 'cashed')),
  r_start bigint not null,                      -- début de la manche en cours (millisecondes, horloge du serveur)
  p0 float8 not null,                           -- prix de départ de la manche en cours
  choice text check (choice in ('oui', 'non', 'be')),
  mult float8,
  fee numeric(14,2) not null default 0,
  won integer not null default 0,
  hist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table wm.series enable row level security;
revoke all on wm.series from public, anon, authenticated;
create unique index if not exists series_une_en_cours on wm.series (user_id) where state = 'running';
create index if not exists series_joueur on wm.series (user_id, id desc);

create or replace function wm.ms() returns bigint
language sql volatile set search_path = '' as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function wm.serie_json(s wm.series) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'gid', s.gid, 'stake', s.stake, 'stack', s.stack, 'step', s.step, 'state', s.state, 'rStart', s.r_start,
    'p0', s.p0, 'choice', s.choice, 'mult', s.mult, 'fee', s.fee, 'won', s.won, 'hist', s.hist,
    'at', (extract(epoch from s.created_at) * 1000)::bigint, 'endAt', (extract(epoch from s.ended_at) * 1000)::bigint)
$$;
-- La série du joueur : celle en cours, sinon la dernière terminée (l'écran la rappelle).
create or replace function wm.serie_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select wm.serie_json(s) from wm.series s where s.user_id = p_user order by s.id desc limit 1
$$;

-- Fin d'une série gagnante : le stack est versé. p_mode : 'encaissee' (par le joueur), 'auto' (sans choix), 'max' (12 manches).
create or replace function wm.serie_encaisser(p_id bigint, p_stack numeric, p_fin timestamptz) returns wm.series
language plpgsql security definer set search_path = '' as $$
declare r wm.series; v_solde numeric; v_pnl numeric;
begin
  select * into r from wm.series s where s.id = p_id for update;
  v_pnl := p_stack - r.stake;
  update public.user_stats set balance = balance + p_stack, bets_settled = coalesce(bets_settled, 0) + 1, bets_won = coalesce(bets_won, 0) + 1,
    profit_realized = coalesce(profit_realized, 0) + v_pnl,
    bets_accuracy_pct = round(100.0 * (coalesce(bets_won, 0) + 1) / (coalesce(bets_settled, 0) + 1))
  where user_id = r.user_id returning balance into v_solde;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (r.user_id, p_stack, v_solde, 'serie_gain', r.gid || ':' || r.id);
  insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl, settled_at)
  values (r.user_id, 'flash', null, 'serie|' || r.gid || '|' || r.won || '|' || r.won || '|' || round(p_stack / r.stake, 1), 'oui', true, v_pnl, p_fin);
  update wm.series set state = 'cashed', stack = p_stack, step = won, choice = null, ended_at = p_fin where id = p_id returning * into r;
  perform wm.xp_add(r.user_id, 20 + r.won * 10, 'serie');
  perform wm.rank_refresh(r.user_id); perform wm.badges_check(r.user_id);
  return r;
end $$;
-- Aucune manche gagnée et pas de choix (ou abandon avant de choisir) : la mise est rendue.
create or replace function wm.serie_rendre(p_id bigint, p_fin timestamptz) returns wm.series
language plpgsql security definer set search_path = '' as $$
declare r wm.series; v_solde numeric;
begin
  select * into r from wm.series s where s.id = p_id for update;
  update public.user_stats set balance = balance + r.stake where user_id = r.user_id returning balance into v_solde;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (r.user_id, r.stake, v_solde, 'serie_rendue', r.gid || ':' || r.id);
  update wm.series set state = 'cashed', stack = stake, step = 0, choice = null, ended_at = p_fin where id = p_id returning * into r;
  return r;
end $$;
create or replace function wm.serie_hist(r wm.series) returns jsonb
language sql stable set search_path = '' as $$
  select case when r.state = 'cashed' and r.won > 0 then jsonb_build_array(jsonb_build_object('k', 'flash', 'q', 'serie|' || r.gid || '|' || r.won || '|' || r.won || '|' || round(r.stack / r.stake, 1),
           's', 'oui', 'win', true, 'pnl', r.stack - r.stake, 'at', (extract(epoch from r.ended_at) * 1000)::bigint))
         when r.state = 'lost' then jsonb_build_array(jsonb_build_object('k', 'flash', 'q', 'serie|' || r.gid || '|' || r.won || '|' || r.step || '|0',
           's', 'non', 'win', false, 'pnl', -r.stake, 'at', (extract(epoch from r.ended_at) * 1000)::bigint))
         else '[]'::jsonb end
$$;

-- ── Lancer une série : p = { gid, stake, t, p0, key } (t et p0 viennent du moteur, pas du joueur) ──
create or replace function public.srv_serie_start(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── Choisir : p = { gid, choice, mult, taux, taux_remise } (cote et taux viennent du moteur) ──
create or replace function public.srv_serie_play(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_choice text := p ->> 'choice'; v_mult float8 := wm.num(p ->> 'mult')::float8;
  s public.user_stats; r wm.series; v_tier integer; v_taux float8; v_now bigint := wm.ms();
begin
  if v_choice is null or v_choice not in ('oui', 'non', 'be') then perform wm.fail('cote_invalide'); end if;
  if v_mult is null or v_mult < 1 or v_mult > 60 then perform wm.fail('montant_invalide'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  select * into r from wm.series x where x.user_id = v_uid and x.state = 'running' for update;
  if not found or r.gid is distinct from (p ->> 'gid') then perform wm.fail('serie_absente'); end if;
  if r.choice is not null then perform wm.fail('deja_choisi'); end if;
  if v_now < r.r_start - 1500 or v_now >= r.r_start + 31500 then perform wm.fail('choix_fermes'); end if;       -- 30 secondes, 1,5 s de tolérance
  select k.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) k;
  v_taux := case when coalesce(v_tier, 0) >= 5 then wm.num(p ->> 'taux_remise') else wm.num(p ->> 'taux') end::float8;
  if v_taux is null or v_taux < 0 or v_taux > 0.2 then perform wm.fail('montant_invalide'); end if;
  update wm.series set choice = v_choice, mult = v_mult, fee = round((stack * v_taux)::numeric, 2) where id = r.id returning * into r;
  -- les 10 XP de la série sont donnés au premier choix, quand la mise est vraiment en jeu : lancer puis reprendre sa mise ne rapporte rien
  if r.step = 1 then perform wm.xp_add(v_uid, 10, 'serie'); end if;
  return wm.reponse(v_uid, jsonb_build_object('serie', wm.serie_json(r)));
end $$;

-- ── Lire la série en cours (pour l'Edge Function) ──
create or replace function public.srv_serie_lire(p_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('now', wm.ms(), 'serie', (select wm.serie_json(s) from wm.series s where s.user_id = p_user and s.state = 'running'))
$$;

-- ── Régler la manche terminée : p = { id, step, out, p1 } (issue et prix d'arrivée viennent du moteur) ──
create or replace function public.srv_serie_regler(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_out text := p ->> 'out'; v_p1 float8 := wm.num(p ->> 'p1')::float8;
  r wm.series; v_fin timestamptz; v_stack numeric; v_regle text; v_step integer;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into r from wm.series x where x.id = wm.num(p ->> 'id')::bigint and x.user_id = v_uid and x.state = 'running' for update;
  if not found or r.step is distinct from wm.num(p ->> 'step')::integer then                 -- déjà réglée : on rend l'état, sans rien refaire
    return wm.reponse(v_uid, jsonb_build_object('serie', wm.serie_etat(v_uid), 'regle', null));
  end if;
  if wm.ms() < r.r_start + 60000 then perform wm.fail('manche_en_cours'); end if;
  if v_out is null or v_out not in ('oui', 'non', 'be') or v_p1 is null or v_p1 <= 0 then perform wm.fail('requete'); end if;
  v_fin := to_timestamp((r.r_start + 60000) / 1000.0); v_step := r.step;
  if r.choice is null then
    if r.won = 0 then r := wm.serie_rendre(r.id, v_fin); v_regle := 'rendue';
    else r := wm.serie_encaisser(r.id, r.stack, v_fin); v_regle := 'auto'; end if;
  elsif r.choice = v_out then
    v_stack := round(((r.stack - r.fee) * r.mult)::numeric, 2);
    update wm.series set won = won + 1, hist = hist || jsonb_build_array(jsonb_build_object('step', r.step, 'choice', r.choice, 'out', v_out, 'mult', r.mult, 'p0', r.p0, 'p1', v_p1, 'win', true))
    where id = r.id returning * into r;
    if r.step >= 12 then r := wm.serie_encaisser(r.id, v_stack, v_fin); v_regle := 'max';
    else
      update wm.series set stack = v_stack, step = step + 1, r_start = r_start + 60000, p0 = v_p1, choice = null, mult = null, fee = 0 where id = r.id returning * into r;
      v_regle := 'gagnee';
    end if;
  else
    update wm.series set state = 'lost', stack = 0, ended_at = v_fin,
      hist = hist || jsonb_build_array(jsonb_build_object('step', r.step, 'choice', r.choice, 'out', v_out, 'mult', r.mult, 'p0', r.p0, 'p1', v_p1, 'win', false))
    where id = r.id returning * into r;
    update public.user_stats set bets_settled = coalesce(bets_settled, 0) + 1, profit_realized = coalesce(profit_realized, 0) - r.stake,
      bets_accuracy_pct = round(100.0 * coalesce(bets_won, 0) / (coalesce(bets_settled, 0) + 1)) where user_id = v_uid;
    insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl, settled_at)
    values (v_uid, 'flash', null, 'serie|' || r.gid || '|' || r.won || '|' || r.step || '|0', 'non', false, -r.stake, v_fin);
    perform wm.rank_refresh(v_uid);
    v_regle := 'perdue';
  end if;
  return wm.reponse(v_uid, jsonb_build_object('serie', wm.serie_json(r), 'hist', wm.serie_hist(r),
    'regle', jsonb_build_object('r', v_regle, 'step', v_step, 'out', v_out, 'p1', v_p1, 'stack', r.stack, 'stake', r.stake, 'gid', r.gid, 'won', r.won)));
end $$;

-- ── Encaisser (ou reprendre sa mise si rien n'est encore gagné) : seulement avant d'avoir choisi ──
create or replace function public.srv_serie_cash(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.agir_pour(p_user); r wm.series; v_regle text; v_step integer;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into r from wm.series x where x.user_id = v_uid and x.state = 'running' for update;
  if not found then perform wm.fail('serie_absente'); end if;
  if r.choice is not null then perform wm.fail('deja_choisi'); end if;
  if wm.ms() >= r.r_start + 60000 then perform wm.fail('choix_fermes'); end if;                -- la manche est finie : c'est le règlement qui décide
  v_step := r.step;
  if r.won = 0 then r := wm.serie_rendre(r.id, now()); v_regle := 'rendue';
  else r := wm.serie_encaisser(r.id, r.stack, now()); v_regle := 'encaissee'; end if;
  return wm.reponse(v_uid, jsonb_build_object('serie', wm.serie_json(r), 'hist', wm.serie_hist(r),
    'regle', jsonb_build_object('r', v_regle, 'step', v_step, 'stack', r.stack, 'stake', r.stake, 'gid', r.gid, 'won', r.won)));
end $$;

-- ── L'état du joueur porte sa série (en cours ou dernière terminée) ──
alter function wm.state() rename to state_socle;
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := wm.state_socle();
begin
  return v || jsonb_build_object('serie', wm.serie_etat((v ->> 'uid')::uuid));
end $$;

select wm.droits();
