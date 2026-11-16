-- Blitz Royale en mode Compte (lot 4.4, fin).
--
-- Un Blitz par créneau de 15 minutes. La salle (joueurs simulés, leurs choix, les issues des manches, le jackpot reporté)
-- se déduit de l'heure : l'Edge Function « eclair » la calcule avec le même moteur que l'écran. Ce fichier tient ce qui
-- ne se déduit pas : les vrais joueurs — leur entrée, leur rachat, leurs choix, leur gain.
--   inscription : avant le départ ; le buy-in est pris une fois.
--   choix       : pendant les 30 premières secondes de la manche, tant qu'on est en vie (les issues passées viennent du moteur).
--   rachat      : une seule fois, seulement si l'on est tombé à la manche 1, avant le début de la manche 2.
--   clôture     : après la dernière manche, pour tous les inscrits d'un coup ; les survivants (simulés et vrais) se partagent
--                 la cagnotte moins 5 %. N'importe quel inscrit peut la déclencher ; la rejouer ne change rien.
-- Toutes ces fonctions sont réservées à la clé de service et revérifient l'heure avec l'horloge de la base.

create table if not exists wm.blitz_joueurs (
  blitz bigint not null,
  user_id uuid not null references public.users(id) on delete cascade,
  paye numeric(12,2) not null,
  rachat boolean not null default false,
  choix jsonb not null default '{}'::jsonb,       -- { "1": 1, "2": 0 … } : 1 = Haut, 0 = Bas, 2 = break even
  regle boolean not null default false,
  gagne boolean,
  gain numeric(14,2) not null default 0,
  sortie integer,                                 -- manche d'élimination (null : survivant)
  created_at timestamptz not null default now(),
  primary key (blitz, user_id)
);
alter table wm.blitz_joueurs enable row level security;
revoke all on wm.blitz_joueurs from public, anon, authenticated;
create index if not exists blitz_joueurs_a_regler on wm.blitz_joueurs (user_id) where not regle;

create table if not exists wm.blitz_clos (
  blitz bigint primary key,
  joueurs integer not null, survivants integer not null, cagnotte numeric(16,2) not null, chacun numeric(16,2) not null, manches integer not null,
  clos_at timestamptz not null default now()
);
alter table wm.blitz_clos enable row level security;
revoke all on wm.blitz_clos from public, anon, authenticated;

-- Manche où le joueur tombe (0 : encore en vie après p_jusqu manches). Un rachat efface une chute à la manche 1.
create or replace function wm.blitz_chute(p_choix jsonb, p_rachat boolean, p_issues integer[], p_jusqu integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare c integer;
begin
  for i in 1..least(coalesce(p_jusqu, 0), coalesce(array_length(p_issues, 1), 0)) loop
    c := (p_choix ->> i::text)::integer;
    if c is null or c <> p_issues[i] then
      if i = 1 and p_rachat then continue; end if;
      return i;
    end if;
  end loop;
  return 0;
end $$;

create or replace function wm.blitz_issues(p jsonb) returns integer[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x::integer order by o), '{}'::integer[]) from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) with ordinality t(x, o)
$$;

-- Ce que l'écran doit savoir des vrais joueurs du Blitz : combien, leur part de la cagnotte, combien en vie après chaque
-- manche terminée, et la situation de l'appelant. p = { id, issues: [issue de chaque manche terminée] }.
create or replace function wm.blitz_vue(p_user uuid, p_id bigint, p_issues integer[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p_id,
    'n', (select count(*) from wm.blitz_joueurs j where j.blitz = p_id),
    'pot', (select coalesce(sum(j.paye), 0) from wm.blitz_joueurs j where j.blitz = p_id),
    'vivants', (select coalesce(jsonb_agg((select count(*) from wm.blitz_joueurs j where j.blitz = p_id and wm.blitz_chute(j.choix, j.rachat, p_issues, i) = 0) order by i), '[]'::jsonb)
                from generate_series(1, coalesce(array_length(p_issues, 1), 0)) i),
    'moi', (select jsonb_build_object('paye', j.paye, 'rachat', j.rachat, 'choix', j.choix, 'regle', j.regle, 'gagne', j.gagne, 'gain', j.gain,
                     'sortie', nullif(wm.blitz_chute(j.choix, j.rachat, p_issues, coalesce(array_length(p_issues, 1), 0)), 0))
            from wm.blitz_joueurs j where j.blitz = p_id and j.user_id = p_user),
    'clos', (select jsonb_build_object('joueurs', c.joueurs, 'survivants', c.survivants, 'cagnotte', c.cagnotte, 'chacun', c.chacun, 'manches', c.manches) from wm.blitz_clos c where c.blitz = p_id))
$$;

create or replace function public.srv_blitz_etat(p_user uuid, p jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('now', wm.ms(), 'blitz', wm.blitz_vue(p_user, wm.num(p ->> 'id')::bigint, wm.blitz_issues(p -> 'issues')))
$$;

-- ── Entrer : p = { id, buyin, debut, key } ──
create or replace function public.srv_blitz_join(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── Choisir : p = { id, manche, debut (de la manche), choice, issues (des manches précédentes) } ──
create or replace function public.srv_blitz_choose(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_id bigint := wm.num(p ->> 'id')::bigint; v_i integer := wm.num(p ->> 'manche')::integer;
  v_debut bigint := wm.num(p ->> 'debut')::bigint; v_c integer := wm.num(p ->> 'choice')::integer; v_issues integer[] := wm.blitz_issues(p -> 'issues');
  j wm.blitz_joueurs; v_now bigint := wm.ms();
begin
  if v_id is null or v_i is null or v_i < 1 or v_i > 10 or v_debut is null then perform wm.fail('requete'); end if;
  if v_c is null or v_c not in (0, 1, 2) then perform wm.fail('cote_invalide'); end if;
  if coalesce(array_length(v_issues, 1), 0) <> v_i - 1 then perform wm.fail('requete'); end if;
  select * into j from wm.blitz_joueurs x where x.blitz = v_id and x.user_id = v_uid for update;
  if not found then perform wm.fail('pas_inscrit'); end if;
  if wm.blitz_chute(j.choix, j.rachat, v_issues, v_i - 1) <> 0 then perform wm.fail('elimine'); end if;
  if v_now < v_debut - 1500 or v_now >= v_debut + 31500 then perform wm.fail('choix_fermes'); end if;
  update wm.blitz_joueurs set choix = choix || jsonb_build_object(v_i::text, v_c) where blitz = v_id and user_id = v_uid;
  return wm.reponse(v_uid, jsonb_build_object('blitz', wm.blitz_vue(v_uid, v_id, v_issues)));
end $$;

-- ── Rachat : p = { id, issue1, fin1, debut2, prix } ──
create or replace function public.srv_blitz_rebuy(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  if s.balance < v_prix then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_prix;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_prix, v_solde, 'blitz_rachat', v_id::text);
  update wm.blitz_joueurs set rachat = true, paye = paye + v_prix where blitz = v_id and user_id = v_uid;
  return wm.reponse(v_uid, jsonb_build_object('blitz', wm.blitz_vue(v_uid, v_id, array[v_issue])));
end $$;

-- ── Clôture : p = { id, debut, issues (10), bots: { n, buyin, vivants: [après chaque manche] }, report } ──
-- Le Blitz s'arrête à la première manche après laquelle plus personne n'est en vie (simulés et vrais), au plus tard à la 10e.
create or replace function public.srv_blitz_clore(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_id bigint := wm.num(p ->> 'id')::bigint; v_debut bigint := wm.num(p ->> 'debut')::bigint;
  v_issues integer[] := wm.blitz_issues(p -> 'issues'); v_bots integer[] := wm.blitz_issues(p -> 'bots' -> 'vivants');
  v_nbots integer := wm.num(p -> 'bots' ->> 'n')::integer; v_buyin numeric := wm.num(p -> 'bots' ->> 'buyin'); v_report numeric := coalesce(wm.num(p ->> 'report'), 0);
  v_l integer := 10; v_reels integer; v_bv integer; v_pot numeric; v_surv integer; v_chacun numeric; v_n integer;
  j record; v_chute integer; v_solde numeric; v_hist jsonb := '[]'::jsonb; v_fin timestamptz;
begin
  if v_id is null or v_debut is null or coalesce(array_length(v_issues, 1), 0) <> 10 or v_nbots is null or v_buyin is null then perform wm.fail('requete'); end if;
  perform pg_advisory_xact_lock(7788992, (v_id % 2147483647)::integer);               -- une seule clôture à la fois par Blitz
  if not exists (select 1 from wm.blitz_clos c where c.blitz = v_id) then
    for i in 1..10 loop
      v_bv := coalesce(v_bots[i], 0);
      select count(*) into v_reels from wm.blitz_joueurs x where x.blitz = v_id and wm.blitz_chute(x.choix, x.rachat, v_issues, i) = 0;
      if v_bv + v_reels = 0 then v_l := i; exit; end if;
    end loop;
    if wm.ms() < v_debut + (v_l - 1) * 70000 + 60000 then perform wm.fail('blitz_en_cours'); end if;
    v_fin := to_timestamp((v_debut + (v_l - 1) * 70000 + 60000) / 1000.0);
    select count(*), coalesce(sum(x.paye), 0) into v_n, v_pot from wm.blitz_joueurs x where x.blitz = v_id;
    select count(*) into v_reels from wm.blitz_joueurs x where x.blitz = v_id and wm.blitz_chute(x.choix, x.rachat, v_issues, v_l) = 0;
    v_pot := v_pot + v_report + v_nbots * v_buyin;
    v_surv := coalesce(v_bots[v_l], 0) + v_reels;
    v_chacun := case when v_surv > 0 then trunc(v_pot * 0.95 / v_surv, 2) else 0 end;
    insert into wm.blitz_clos (blitz, joueurs, survivants, cagnotte, chacun, manches) values (v_id, v_nbots + v_n, v_surv, v_pot, v_chacun, v_l);
    for j in select * from wm.blitz_joueurs x where x.blitz = v_id and not x.regle order by x.user_id for update loop
      v_chute := wm.blitz_chute(j.choix, j.rachat, v_issues, v_l);
      if v_chute = 0 then
        update public.user_stats set balance = balance + v_chacun, bets_settled = coalesce(bets_settled, 0) + 1, bets_won = coalesce(bets_won, 0) + 1,
          profit_realized = coalesce(profit_realized, 0) + v_chacun - j.paye,
          bets_accuracy_pct = round(100.0 * (coalesce(bets_won, 0) + 1) / (coalesce(bets_settled, 0) + 1))
        where user_id = j.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, v_chacun, v_solde, 'blitz_gain', v_id::text);
        insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl, settled_at)
        values (j.user_id, 'flash', null, 'blitz|g|' || (v_nbots + v_n), 'oui', true, v_chacun - j.paye, v_fin);
        update wm.blitz_joueurs set regle = true, gagne = true, gain = v_chacun, sortie = null where blitz = v_id and user_id = j.user_id;
        perform wm.xp_add(j.user_id, 80, 'blitz');
        if j.user_id <> v_uid then perform wm.notify(j.user_id, 'trophy', 'blitz_gagne', jsonb_build_object('gain', v_chacun, 'paye', j.paye), '#blitz'); end if;
        if j.user_id = v_uid then v_hist := jsonb_build_array(jsonb_build_object('k', 'flash', 'q', 'blitz|g|' || (v_nbots + v_n), 's', 'oui', 'win', true, 'pnl', v_chacun - j.paye, 'at', (extract(epoch from v_fin) * 1000)::bigint)); end if;
      else
        update public.user_stats set bets_settled = coalesce(bets_settled, 0) + 1, profit_realized = coalesce(profit_realized, 0) - j.paye,
          bets_accuracy_pct = round(100.0 * coalesce(bets_won, 0) / (coalesce(bets_settled, 0) + 1)) where user_id = j.user_id;
        insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl, settled_at)
        values (j.user_id, 'flash', null, 'blitz|p|' || (v_nbots + v_n), 'non', false, -j.paye, v_fin);
        update wm.blitz_joueurs set regle = true, gagne = false, gain = 0, sortie = v_chute where blitz = v_id and user_id = j.user_id;
        if j.user_id = v_uid then v_hist := jsonb_build_array(jsonb_build_object('k', 'flash', 'q', 'blitz|p|' || (v_nbots + v_n), 's', 'non', 'win', false, 'pnl', -j.paye, 'at', (extract(epoch from v_fin) * 1000)::bigint)); end if;
      end if;
      perform wm.rank_refresh(j.user_id); perform wm.badges_check(j.user_id);
    end loop;
  end if;
  return wm.reponse(v_uid, jsonb_build_object('blitz', wm.blitz_vue(v_uid, v_id, v_issues), 'hist', v_hist));
end $$;

-- ── L'état du joueur : ses Blitz pas encore réglés (pour demander leur clôture au retour) ──
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := wm.state_socle(); v_uid uuid := (v ->> 'uid')::uuid;
begin
  return v || jsonb_build_object('serie', wm.serie_etat(v_uid),
    'blitz', coalesce((select jsonb_agg(j.blitz order by j.blitz) from wm.blitz_joueurs j where j.user_id = v_uid and not j.regle), '[]'::jsonb));
end $$;

select wm.droits();
