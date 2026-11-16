-- Paris combinés en mode Compte.
--
-- Règles du mode Démo, tenues par le serveur : 2 à 6 sélections Oui/Non sur des marchés différents (une seule issue par
-- marché à cotes multiples), une seule mise de 2 $ à 1 000 $ ; la cote est le produit des cotes de chaque sélection
-- (100 / prix en ¢, prix bloqués à la validation) ; Wimoro prend 5 % du gain brut et plafonne le gain à 50 000 $.
-- Encaissement anticipé : gain promis × probabilité implicite du moment, moins 5 %. À la résolution d'un marché, une
-- sélection perdante fait tomber le combiné ; toutes gagnantes, il est payé.

create table if not exists wm.combos (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  mise numeric(12,2) not null,
  mult float8 not null,
  frais numeric(14,2) not null,
  gain numeric(14,2) not null,                    -- gain promis si tout passe
  etat text not null default 'open' check (etat in ('open', 'won', 'lost', 'cashed')),
  legs jsonb not null,                            -- [{ m, s, price, mult, res }] ; res : null, 'won' ou 'lost'
  encaisse numeric(14,2),
  cree_at timestamptz not null default now(),
  fin_at timestamptz
);
alter table wm.combos enable row level security;
revoke all on wm.combos from public, anon, authenticated;
create index if not exists combos_joueur on wm.combos (user_id, id desc);
create index if not exists combos_ouverts on wm.combos using gin (legs jsonb_path_ops) where etat = 'open';

create or replace function wm.combo_json(c wm.combos) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'at', (extract(epoch from c.cree_at) * 1000)::bigint, 'stake', c.mise, 'mult', c.mult, 'fee', c.frais, 'pay', c.gain,
    'status', c.etat, 'legs', c.legs, 'cash', c.encaisse, 'endAt', (extract(epoch from c.fin_at) * 1000)::bigint)
$$;
create or replace function wm.combos_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(wm.combo_json(c) order by c.id desc), '[]'::jsonb) from (select * from wm.combos x where x.user_id = p_user order by x.id desc limit 30) c
$$;

-- Valeur du moment d'un combiné ouvert : gain promis × probabilité implicite des sélections pas encore résolues, moins 5 %.
create or replace function wm.combo_valeur(c wm.combos) returns numeric
language plpgsql stable security definer set search_path = '' as $$
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
  return trunc((c.gain * v_p * 0.95)::numeric, 2);
end $$;

-- ── Valider : p = { legs: [{ m, s }], stake, key } ──
create or replace function wm.combo_place(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_mise numeric := round(wm.num(p ->> 'stake'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; l jsonb; mk public.markets; v_prix float8; v_m float8; v_mult float8 := 1; v_legs jsonb := '[]'::jsonb;
  v_vus text[] := '{}'; v_cle text; v_n integer := 0; v_brut numeric; v_frais numeric; v_gain numeric; v_solde numeric; c wm.combos; v_res jsonb;
begin
  if v_mise is null or v_mise < 2 or v_mise > 1000 then perform wm.fail('montant_invalide'); end if;
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if jsonb_typeof(p -> 'legs') is distinct from 'array' or jsonb_array_length(p -> 'legs') < 2 or jsonb_array_length(p -> 'legs') > 6 then perform wm.fail('combine_incomplet'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
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
  v_brut := round((v_mise * v_mult)::numeric, 2); v_frais := round(v_brut * 0.05, 2); v_gain := least(v_brut - v_frais, 50000);
  v_solde := s.balance - v_mise;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1 where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_mise, v_solde, 'combo', v_n || ' sélections');
  insert into wm.combos (user_id, mise, mult, frais, gain, legs) values (v_uid, v_mise, v_mult, v_frais, v_gain, v_legs) returning * into c;
  perform wm.xp_add(v_uid, 10 + 5 * v_n, 'combo');
  perform wm.badges_check(v_uid);
  v_res := wm.reponse(v_uid, jsonb_build_object('combo', wm.combo_json(c), 'combos', wm.combos_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'combo', v_res);
  return v_res;
end $$;

-- ── Encaisser avant la fin ──
create or replace function wm.combo_cash(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); c wm.combos; v numeric; v_pnl numeric; v_solde numeric; v_n integer;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into c from wm.combos x where x.id = p_id and x.user_id = v_uid for update;
  if not found or c.etat <> 'open' then perform wm.fail('combine_indisponible'); end if;
  v := wm.combo_valeur(c);
  if v <= 0 then perform wm.fail('combine_indisponible'); end if;
  v_pnl := v - c.mise; v_n := jsonb_array_length(c.legs);
  update public.user_stats set balance = balance + v, bets_settled = coalesce(bets_settled, 0) + 1, bets_won = coalesce(bets_won, 0) + case when v_pnl >= 0 then 1 else 0 end,
    profit_realized = coalesce(profit_realized, 0) + v_pnl,
    bets_accuracy_pct = round(100.0 * (coalesce(bets_won, 0) + case when v_pnl >= 0 then 1 else 0 end) / (coalesce(bets_settled, 0) + 1))
  where user_id = v_uid returning balance into v_solde;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, v, v_solde, 'combo_encaisse', c.id::text);
  insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl) values (v_uid, 'res', null, 'combo|c|' || v_n || '|' || v, 'oui', v_pnl >= 0, v_pnl);
  update wm.combos set etat = 'cashed', encaisse = v, fin_at = now() where id = c.id returning * into c;
  perform wm.xp_add(v_uid, 10, 'combo');
  perform wm.rank_refresh(v_uid); perform wm.badges_check(v_uid);
  return wm.reponse(v_uid, jsonb_build_object('combo', wm.combo_json(c), 'combos', wm.combos_etat(v_uid),
    'hist', jsonb_build_array(jsonb_build_object('k', 'res', 'q', 'combo|c|' || v_n || '|' || v, 's', 'oui', 'win', v_pnl >= 0, 'pnl', v_pnl, 'at', (extract(epoch from now()) * 1000)::bigint))));
end $$;

-- ── À la résolution d'un marché : les combinés ouverts qui le contiennent ──
create or replace function wm.combos_marche(p_market text, p_issue text) returns integer
language plpgsql security definer set search_path = '' as $$
declare c wm.combos; v_legs jsonb; v_gagne boolean; v_tout boolean; v_solde numeric; v_n integer; n integer := 0;
begin
  for c in select * from wm.combos x where x.etat = 'open' and x.legs @> jsonb_build_array(jsonb_build_object('m', p_market)) order by x.id for update loop
    select jsonb_agg(case when e ->> 'm' = p_market and e ->> 'res' is null then e || jsonb_build_object('res', case when e ->> 's' = p_issue then 'won' else 'lost' end) else e end order by o),
           bool_or(e ->> 'm' = p_market and e ->> 's' = p_issue)
      into v_legs, v_gagne from jsonb_array_elements(c.legs) with ordinality t(e, o);
    v_n := jsonb_array_length(c.legs);
    if not coalesce(v_gagne, false) then
      update wm.combos set legs = v_legs, etat = 'lost', fin_at = now() where id = c.id;
      update public.user_stats set bets_settled = coalesce(bets_settled, 0) + 1, profit_realized = coalesce(profit_realized, 0) - c.mise,
        bets_accuracy_pct = round(100.0 * coalesce(bets_won, 0) / (coalesce(bets_settled, 0) + 1)) where user_id = c.user_id;
      insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl) values (c.user_id, 'res', p_market, 'combo|p|' || v_n || '|' || p_market, 'non', false, -c.mise);
      perform wm.rank_refresh(c.user_id);
      perform wm.notify(c.user_id, 'layers', 'combo_perdu', jsonb_build_object('id', c.id, 'n', v_n, 'm', p_market), '#combines');
    else
      select bool_and(coalesce(e ->> 'res', '') = 'won') into v_tout from jsonb_array_elements(v_legs) e;   -- une sélection pas encore résolue n'est pas « gagnée »
      if v_tout then
        update wm.combos set legs = v_legs, etat = 'won', fin_at = now() where id = c.id;
        update public.user_stats set balance = balance + c.gain, bets_settled = coalesce(bets_settled, 0) + 1, bets_won = coalesce(bets_won, 0) + 1,
          profit_realized = coalesce(profit_realized, 0) + c.gain - c.mise,
          bets_accuracy_pct = round(100.0 * (coalesce(bets_won, 0) + 1) / (coalesce(bets_settled, 0) + 1)) where user_id = c.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (c.user_id, c.gain, v_solde, 'combo_gain', c.id::text);
        insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl) values (c.user_id, 'res', p_market, 'combo|g|' || v_n || '|' || round(c.mult::numeric, 2), 'oui', true, c.gain - c.mise);
        perform wm.rank_refresh(c.user_id); perform wm.badges_check(c.user_id);
        perform wm.notify(c.user_id, 'trophy', 'combo_gagne', jsonb_build_object('id', c.id, 'n', v_n, 'mult', round(c.mult::numeric, 2), 'gain', c.gain - c.mise), '#combines');
      else
        update wm.combos set legs = v_legs where id = c.id;                              -- sélection gagnée, le combiné continue
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function wm.combos() returns jsonb
language sql security definer set search_path = '' as $$ select wm.combos_etat(wm.uid()) $$;

create or replace function public.api_combo_place(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.combo_place(p) $$;
create or replace function public.api_combo_cash(p_id bigint) returns jsonb language sql security invoker set search_path = '' as $$ select wm.combo_cash(p_id) $$;
create or replace function public.api_combos() returns jsonb language sql security invoker set search_path = '' as $$ select wm.combos() $$;

-- ── Ce qui suit la résolution d'un marché : duels et combinés (un seul point d'entrée pour les lots à venir) ──
create or replace function wm.marche_suites(p_market text, p_issue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object('duels', wm.duels_marche(p_market, p_issue), 'combines', wm.combos_marche(p_market, p_issue));
end $$;

create or replace function wm.adm_marche_resoudre(p_admin uuid, p_market text, p_issue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mk public.markets; v_res jsonb; v_autres jsonb := '{}'::jsonb; f record; v_suites jsonb;
begin
  if p_issue is null or p_issue not in ('oui', 'non') then perform wm.fail('issue_invalide'); end if;
  select * into mk from public.markets m where m.id = p_market for update;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if mk.status = 'resolved' then perform wm.fail('deja_resolu'); end if;
  v_res := wm.marche_regler(p_market, p_issue);
  v_suites := jsonb_build_object(p_market, wm.marche_suites(p_market, p_issue));
  if mk.group_parent_id is not null and p_issue = 'oui' then          -- une seule issue peut gagner : les autres se résolvent par « non »
    for f in select m.id from public.markets m where m.group_parent_id = mk.group_parent_id and m.id <> p_market and coalesce(m.status, 'open') <> 'resolved' order by m.id for update loop
      v_autres := v_autres || jsonb_build_object(f.id, wm.marche_regler(f.id, 'non'));
      v_suites := v_suites || jsonb_build_object(f.id, wm.marche_suites(f.id, 'non'));
    end loop;
    update public.market_groups set status = 'resolved' where id = mk.group_parent_id;
  end if;
  perform wm.adm_note(p_admin, 'marche_resolu', p_market, v_res || jsonb_build_object('issue', p_issue, 'autres', v_autres, 'suites', v_suites));
  return wm.adm_marches() || jsonb_build_object('reglement', v_res, 'autres', v_autres);
end $$;

-- ── L'état du joueur porte ses combinés ──
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := wm.state_socle(); v_uid uuid := (v ->> 'uid')::uuid;
begin
  perform wm.duels_expirer(v_uid);
  return v || jsonb_build_object('serie', wm.serie_etat(v_uid),
    'blitz', coalesce((select jsonb_agg(j.blitz order by j.blitz) from wm.blitz_joueurs j where j.user_id = v_uid and not j.regle), '[]'::jsonb),
    'duels', wm.duels_etat(v_uid), 'combos', wm.combos_etat(v_uid));
end $$;

select wm.droits();
