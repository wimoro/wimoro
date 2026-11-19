-- Marchés réels, lot 9 (19 nov. 2026) : le cycle de vie des marchés du catalogue, leur résolution, leur annulation, et les
-- actions de l'équipe sur les marchés (porte api_equipe).
--
-- Rien ne change pour un joueur du site en ligne : le cycle ne parcourt que les fiches du catalogue (wm.fiches) ; les 27
-- anciens marchés n'en ont pas (ils n'en recevront qu'à la mise en ligne, pour être retirés), et l'ancien panneau
-- (api_admin) les gère comme avant. Tant que le catalogue n'est pas en ligne, aucune fiche n'a de ligne dans le moteur :
-- clore, résoudre ou annuler n'y écrit donc que dans wm.fiches. Après la mise en ligne, le paiement passe par les
-- fonctions existantes, sans les modifier : wm.marche_regler (1 $ par part gagnante) et wm.marche_suites (duels,
-- combinés), exactement comme wm.adm_marche_resoudre.
--
-- États (wm.fiches.cycle) et ce qu'en voit le moteur (public.markets.status) :
--   ouvert → open ; suspendu, ferme, a_resoudre → closed (wm.buy refuse déjà : marche_ferme ; les bots s'arrêtent) ;
--   resolu → resolved + yes/no ; annule → resolved + voided (valeur déjà admise par la contrainte de la table).
--   (« proposé » : un brouillon de wm.propositions_jour, lot 11, sans fiche.)
-- Transitions, par la tâche wm-cycle (chaque minute) :
--   suspendu → ouvert à la fin d'une suspension datée ; ouvert ou suspendu → ferme à l'heure de fin des mises ;
--   touche : seuil atteint avant la fin → résolu « oui » tout de suite (valeur, heure et source gardées) ;
--   ferme → résolu automatiquement : prix (cours relevé à l'heure dite dans l'anneau des cours, clôture officielle d'une
--   séance, cours de référence BCE), sport (score final d'une source de sport) — la valeur et la source sont enregistrées ;
--   ferme → a_resoudre : valeur trop proche du seuil (marge de la règle : l'équipe vérifie la source officielle), donnée
--   absente après le délai, marché d'actualité ou décision (toujours tranché par un membre de l'équipe dans le panneau).
-- Annulation (wm.annuler) : chaque position est remboursée au prix d'achat (parts × prix moyen), par une écriture
-- « annulation » du journal d'argent ; les frais déjà payés ne sont pas rendus ; duels en jeu rendus (wm.duel_rendre),
-- sélection d'un combiné annulée (cote recalculée sans elle, mise rendue s'il n'en reste aucune), lots des copies libérés.
-- Rien n'est jamais supprimé.

-- ══ 0. Sauvegarde ══
select backup_20261119.sauver_lot('wm.reglages', 'lot9');
select backup_20261119.sauver_lot('wm.equipe_actions', 'lot9');
select backup_20261119.sauver_lot('cron.job', 'lot9');
select backup_20261119.sauver_table('wm.duels');
select backup_20261119.sauver_table('wm.combos');
select backup_20261119.sauver_table('wm.copies_lots');
select backup_20261119.sauver_table('public.positions');

-- ══ 1. Réglages ══
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
select x.cle, 'catalogue', x.libelle, x.explication, x.type, x.v::jsonb, x.v::jsonb, x.mn, x.mx, false, false, true, null, x.ordre
from (values
  ('cycle.actif', 'Cycle de vie automatique', 'La tâche wm-cycle ferme les marchés à l''heure, les résout quand la source le permet, ouvre les successeurs ; faux : plus rien d''automatique.', 'booleen', 'true', null::numeric, null::numeric, 301),
  ('cycle.attente_min', 'Attente d''une donnée', 'Minutes d''attente d''un cours ou d''un score après l''heure du résultat, avant de confier le marché à l''équipe.', 'entier', '60', 5, 1440, 302),
  ('equipe.moderateur_xp_max', 'XP qu''un modérateur peut ajuster', 'Plafond d''un ajustement d''XP par un modérateur, en plus ou en moins.', 'entier', '1000', 0, 100000, 303)
) as x(cle, libelle, explication, type, v, mn, mx, ordre)
on conflict (cle) do nothing;

-- ══ 2. Les matchs suivis (lot 11 : remplis par l'Edge Function « quotidien » depuis les sources de sport) ══
create table if not exists wm.sport_matchs (
  id text primary key,                                -- « oldb:83242 » (OpenLigaDB), « fd:… » (football-data.org), « as:… », « bdl:… »
  sport text not null check (sport in ('foot', 'nba', 'tennis')),
  competition text,
  debut_at timestamptz not null,
  dom jsonb not null,                                 -- {nom, id}
  ext jsonb not null,
  statut text not null default 'prevu' check (statut in ('prevu', 'en_cours', 'termine', 'reporte', 'annule')),
  score_dom integer,
  score_ext integer,
  minute integer,
  periode text,
  source text not null,
  final_at timestamptz,
  maj_at timestamptz not null default now()
);
alter table wm.sport_matchs enable row level security;
revoke all on wm.sport_matchs from public, anon, authenticated;
create index if not exists sport_matchs_debut on wm.sport_matchs (debut_at);

-- ══ 3. Étapes branchées sur le cycle (comme wm.suites_blocs) : successeurs (lot 10), propositions (lot 11) ══
create table if not exists wm.cycle_blocs (
  cle text primary key,
  quand text not null check (quand in ('ferme', 'resolu', 'annule', 'tick')),
  fonction text not null,                             -- regproc : (text) → jsonb, ou () → jsonb pour « tick »
  ordre integer not null default 100
);
alter table wm.cycle_blocs enable row level security;
revoke all on wm.cycle_blocs from public, anon, authenticated;

create or replace function wm.cycle_etapes(p_quand text, p_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b record; x jsonb; v jsonb := '{}'::jsonb;
begin
  for b in select c.cle, c.fonction from wm.cycle_blocs c where c.quand = p_quand order by c.ordre, c.cle loop
    begin
      if p_quand = 'tick' then execute format('select to_jsonb(%s())', b.fonction::regproc) into x;
      else execute format('select to_jsonb(%s($1))', b.fonction::regproc) using p_id into x; end if;
      v := v || jsonb_build_object(b.cle, x);
    exception when others then
      v := v || jsonb_build_object(b.cle, jsonb_build_object('erreur', left(sqlerrm, 200)));   -- une étape en panne n'arrête pas le cycle
    end;
  end loop;
  return v;
end $$;

-- ══ 4. Valeurs lues dans les cours (wm.px_echantillons : anneau d'une heure ; wm.px_dernier : dernier cours) ══
-- Le cours d'un actif à l'instant T : l'échantillon le plus proche dans ±p_tol secondes, sinon le dernier cours s'il est
-- assez proche de T. Rien si l'heure est passée de plus d'une heure (l'anneau est réécrit) : le marché va à l'équipe.
create or replace function wm.cycle_cours_a(p_actif text, p_t timestamptz, p_tol integer default 90) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('v', e.prix, 'source', e.source, 't', e.t) from wm.px_echantillons e
     where e.actif = p_actif and e.t between p_t - make_interval(secs => p_tol) and p_t + make_interval(secs => p_tol)
     order by abs(extract(epoch from e.t - p_t)), e.t limit 1),
    (select jsonb_build_object('v', d.prix, 'source', d.source, 't', coalesce(d.source_t, d.t)) from wm.px_dernier d
     where d.actif = p_actif and abs(extract(epoch from coalesce(d.source_t, d.t) - p_t)) <= p_tol))
$$;

-- La clôture d'une séance (actions, indices) : le dernier cours d'un actif quand il est daté de la séance attendue, entre
-- cinq minutes avant l'heure de clôture et 45 minutes après (au-delà, la place a peut-être rouvert : l'équipe vérifie).
create or replace function wm.cycle_cloture(p_actif text, p_cloture_at timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('v', d.prix, 'source', d.source, 't', d.source_t) from wm.px_dernier d
  where d.actif = p_actif and d.source_t between p_cloture_at - interval '5 minutes' and p_cloture_at + interval '45 minutes'
$$;

-- Le cours de référence de la BCE d'un jour (taux du jour de Frankfurter, qui republie la BCE).
create or replace function wm.cycle_reference_bce(p_actif text, p_jour date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('v', d.prix, 'source', d.source, 't', d.source_t) from wm.px_dernier d
  where d.actif = p_actif and d.source = 'frankfurter' and (d.source_t at time zone 'UTC')::date = p_jour
$$;

-- Comparaison au seuil : « au-dessus de X » est strictement supérieur ; une égalité donne non.
create or replace function wm.cycle_compare(p_v numeric, p_op text, p_seuil numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p_v is null or p_seuil is null then null
              when p_op in ('>', 'au_dessus') then case when p_v > p_seuil then 'oui' else 'non' end
              when p_op = '>=' then case when p_v >= p_seuil then 'oui' else 'non' end
              when p_op = '<' then case when p_v < p_seuil then 'oui' else 'non' end
              when p_op = '<=' then case when p_v <= p_seuil then 'oui' else 'non' end end
$$;

-- ══ 5. Résoudre ══
-- p_issue : « oui » ou « non » (binaire), ou l'identifiant de l'option gagnante. p_par : le membre de l'équipe (vide :
-- l'automate). Paiement par les fonctions existantes (wm.marche_regler, wm.marche_suites), sans les modifier. Une
-- résolution ne s'annule pas.
create or replace function wm.resoudre(p_id text, p_issue text, p_par uuid, p_valeur jsonb default null, p_source text default null,
                                       p_preuve text default null, p_motif text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches; o wm.fiches_options; v_reg jsonb := '{}'::jsonb; v_suites jsonb := '{}'::jsonb; v_n integer := 0; v_verse numeric := 0;
begin
  select * into f from wm.fiches x where x.id = p_id for update;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if f.cycle in ('resolu', 'annule') then perform wm.fail('deja_resolu'); end if;
  if f.nature = 'binaire' then
    if p_issue is null or p_issue not in ('oui', 'non') then perform wm.fail('issue_invalide'); end if;
  elsif not exists (select 1 from wm.fiches_options x where x.fiche_id = f.id and x.market_id = p_issue) then
    perform wm.fail('issue_invalide');
  end if;
  if p_preuve is not null and (p_preuve !~ '^https://[^\s<>"`\\]+$' or char_length(p_preuve) > 500) then perform wm.fail('preuve_invalide'); end if;

  if f.moteur then
    if f.nature = 'binaire' then
      v_reg := jsonb_build_object(f.id, wm.marche_regler(f.id, p_issue));
      v_suites := jsonb_build_object(f.id, wm.marche_suites(f.id, p_issue));
    else
      -- comme wm.adm_marche_resoudre : l'option gagnante par « oui », toutes les autres par « non »
      for o in select * from wm.fiches_options x where x.fiche_id = f.id order by x.ordre loop
        if exists (select 1 from public.markets m where m.id = o.market_id and coalesce(m.status, 'open') <> 'resolved') then
          v_reg := v_reg || jsonb_build_object(o.market_id, wm.marche_regler(o.market_id, case when o.market_id = p_issue then 'oui' else 'non' end));
          v_suites := v_suites || jsonb_build_object(o.market_id, wm.marche_suites(o.market_id, case when o.market_id = p_issue then 'oui' else 'non' end));
        end if;
      end loop;
      update public.market_groups set status = 'resolved', resolution_outcome = p_issue where id = f.id;
    end if;
    select coalesce(sum((x.value ->> 'joueurs')::integer), 0), coalesce(sum((x.value ->> 'verse')::numeric), 0) into v_n, v_verse from jsonb_each(v_reg) x;
  end if;

  update wm.fiches set cycle = 'resolu', resolu_issue = p_issue, resolu_valeur = p_valeur, resolu_source = left(p_source, 300),
    resolu_preuve = p_preuve, resolu_at = now(), resolu_par = p_par, propose = null, suspendu_motif = null, suspendu_jusqua = null, maj_par = p_par
  where id = f.id;
  perform wm.journal_noter(p_par, 'marche_resoudre', 'marche', f.id, jsonb_build_object('cycle', f.cycle),
    jsonb_build_object('issue', p_issue, 'valeur', p_valeur, 'source', p_source, 'preuve', p_preuve, 'joueurs', v_n, 'verse', v_verse), p_motif, null);
  perform wm.cycle_etapes('resolu', f.id);
  return jsonb_build_object('id', f.id, 'issue', p_issue, 'joueurs', v_n, 'verse', v_verse, 'reglement', v_reg, 'suites', v_suites);
end $$;

-- ══ 6. Annuler, avec remboursement au prix d'achat ══
-- Les combinés : la sélection du marché annulé est marquée « void » ; la cote et le gain sont recalculés sans elle ; s'il
-- ne reste aucune sélection, la mise est rendue (état « cashed », montant encaissé = mise) ; si toutes les autres sont
-- déjà gagnées, le combiné est payé. Jamais wm.marche_suites(…, 'annule') : les combinés le compteraient perdu.
create or replace function wm.combos_annuler(p_market text) returns integer
language plpgsql security definer set search_path = '' as $$
declare c wm.combos; v_legs jsonb; v_leg jsonb; v_mult float8; v_restantes integer; v_gagnees integer; v_brut numeric; v_frais numeric; v_gain numeric; v_solde numeric; n integer := 0;
begin
  for c in select * from wm.combos x where x.etat = 'open' and x.legs @> jsonb_build_array(jsonb_build_object('m', p_market)) order by x.id for update loop
    select e into v_leg from jsonb_array_elements(c.legs) e where e ->> 'm' = p_market and e ->> 'res' is null limit 1;
    if v_leg is null then continue; end if;
    select jsonb_agg(case when e ->> 'm' = p_market and e ->> 'res' is null then e || '{"res": "void"}'::jsonb else e end order by o) into v_legs
    from jsonb_array_elements(c.legs) with ordinality t(e, o);
    v_mult := c.mult / greatest(coalesce((v_leg ->> 'mult')::float8, 1), 1e-9);
    select count(*) filter (where coalesce(e ->> 'res', '') <> 'void'), count(*) filter (where e ->> 'res' = 'won') into v_restantes, v_gagnees from jsonb_array_elements(v_legs) e;
    if v_restantes = 0 then
      update wm.combos set legs = v_legs, mult = 1, etat = 'cashed', encaisse = c.mise, fin_at = now() where id = c.id;
      update public.user_stats set balance = balance + c.mise where user_id = c.user_id returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (c.user_id, c.mise, v_solde, 'combo_rembourse', c.id::text);
      perform wm.notify(c.user_id, 'layers', 'combo_rembourse', jsonb_build_object('id', c.id, 'm', p_market, 'amt', c.mise), '#combines');
    else
      v_brut := round((c.mise * v_mult)::numeric, 2);
      v_frais := round(v_brut * wm.reglage_num('frais.combines.commission', 0.05), 2);
      v_gain := least(v_brut - v_frais, wm.reglage_num('combines.gain_max', 50000));
      if v_gagnees = v_restantes then
        update wm.combos set legs = v_legs, mult = v_mult, frais = v_frais, gain = v_gain, etat = 'won', fin_at = now() where id = c.id;
        update public.user_stats set balance = balance + v_gain, bets_settled = coalesce(bets_settled, 0) + 1, bets_won = coalesce(bets_won, 0) + 1,
          profit_realized = coalesce(profit_realized, 0) + v_gain - c.mise where user_id = c.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (c.user_id, v_gain, v_solde, 'combo_gain', c.id::text);
        perform wm.notify(c.user_id, 'trophy', 'combo_gagne', jsonb_build_object('id', c.id, 'n', v_restantes, 'mult', round(v_mult::numeric, 2), 'gain', v_gain - c.mise), '#combines');
      else
        update wm.combos set legs = v_legs, mult = v_mult, frais = v_frais, gain = v_gain where id = c.id;
        perform wm.notify(c.user_id, 'layers', 'combo_selection_annulee', jsonb_build_object('id', c.id, 'm', p_market, 'mult', round(v_mult::numeric, 2), 'gain', v_gain), '#combines');
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Rembourse les positions d'un marché du moteur au prix d'achat ; duels rendus, combinés recalculés, lots de copies libérés.
create or replace function wm.marche_annuler_moteur(p_market text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pos public.positions; v_m numeric; v_solde numeric; v_n integer := 0; v_total numeric := 0; d record; v_duels integer := 0; v_combos integer;
begin
  update public.markets set status = 'resolved', resolution_outcome = 'voided', resolved_at = now(), updated_at = now() where id = p_market;
  for pos in select * from public.positions p where p.market_id = p_market and p.shares > 0 order by p.user_id, p.side for update loop
    v_m := round(pos.shares * pos.average_price / 100, 2);
    update public.user_stats s set balance = s.balance + v_m where s.user_id = pos.user_id returning s.balance into v_solde;
    if v_m > 0 then
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (pos.user_id, v_m, v_solde, 'annulation', p_market || ':' || pos.side);
    end if;
    insert into public.position_history (user_id, kind, market_id, question, side, was_winner, pnl) values (pos.user_id, 'res', p_market, 'annule|' || p_market, pos.side, null, 0);
    update public.positions set shares = 0, updated_at = now() where id = pos.id;
    perform wm.notify(pos.user_id, 'info', 'marche_annule', jsonb_build_object('m', p_market, 's', pos.side, 'rembourse', v_m), '#profil');
    v_n := v_n + 1; v_total := v_total + v_m;
  end loop;
  update public.market_live_state set open_yes = 0, open_no = 0, mm_cash = mm_cash - v_total, seq = seq + 1, updated_at = now() where market_id = p_market;
  for d in select x.id, x.par, x.adv, x.etat from wm.duels x where x.m = p_market and x.etat in ('open', 'active') order by x.id loop
    perform wm.duel_rendre(d.id, 'void');
    perform wm.notify(d.par, 'swords', 'duel_annule', jsonb_build_object('m', p_market, 'id', d.id), '#duels');
    if d.etat = 'active' and d.adv is not null then perform wm.notify(d.adv, 'swords', 'duel_annule', jsonb_build_object('m', p_market, 'id', d.id), '#duels'); end if;
    v_duels := v_duels + 1;
  end loop;
  v_combos := wm.combos_annuler(p_market);
  update wm.copies_lots set sh = 0, cout = 0 where market_id = p_market and sh > 0;
  perform realtime.send(jsonb_build_object('id', p_market, 'st', 'resolved', 'o', 'annule'), 'etat', 'marches', false);
  return jsonb_build_object('joueurs', v_n, 'rembourse', v_total, 'duels', v_duels, 'combines', v_combos);
end $$;

create or replace function wm.annuler(p_id text, p_par uuid, p_motif text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches; o record; v jsonb := '{}'::jsonb; v_n integer := 0; v_total numeric := 0;
begin
  select * into f from wm.fiches x where x.id = p_id for update;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if f.cycle in ('resolu', 'annule') then perform wm.fail('deja_resolu'); end if;
  if f.moteur then
    for o in select f.id as m where f.nature = 'binaire'
             union all select x.market_id from wm.fiches_options x where f.nature = 'options' and x.fiche_id = f.id loop
      v := v || jsonb_build_object(o.m, wm.marche_annuler_moteur(o.m));
    end loop;
    if f.nature = 'options' then update public.market_groups set status = 'resolved', resolution_outcome = 'voided' where id = f.id; end if;
    select coalesce(sum((x.value ->> 'joueurs')::integer), 0), coalesce(sum((x.value ->> 'rembourse')::numeric), 0) into v_n, v_total from jsonb_each(v) x;
  end if;
  update wm.fiches set cycle = 'annule', annule_motif = left(btrim(coalesce(p_motif, '')), 500), annule_at = now(), annule_par = p_par, propose = null, maj_par = p_par
  where id = f.id;
  perform wm.journal_noter(p_par, 'marche_annuler', 'marche', f.id, jsonb_build_object('cycle', f.cycle),
    jsonb_build_object('cycle', 'annule', 'joueurs', v_n, 'rembourse', v_total, 'detail', v), p_motif, null);
  perform wm.cycle_etapes('annule', f.id);
  return jsonb_build_object('id', f.id, 'joueurs', v_n, 'rembourse', v_total, 'detail', v);
end $$;

-- Aperçu d'une annulation, sans rien changer : positions remboursées (joueur désigné par une empreinte), montants, duels et
-- combinés touchés.
create or replace function wm.annuler_apercu(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select f.id as m from wm.fiches f where f.id = p_id and f.nature = 'binaire' and f.moteur
             union all select x.market_id from wm.fiches_options x join wm.fiches f on f.id = x.fiche_id where f.id = p_id and f.moteur),
  p as (select p.user_id, p.market_id, p.side, p.shares, p.average_price, round(p.shares * p.average_price / 100, 2) as montant,
               coalesce(u.is_demo, false) as bot
        from public.positions p join m on m.m = p.market_id left join public.users u on u.id = p.user_id where p.shares > 0)
  select jsonb_build_object('id', p_id,
    'positions', coalesce((select jsonb_agg(jsonb_build_object('joueur', left(md5(p.user_id::text), 10), 'm', p.market_id, 's', p.side, 'parts', p.shares,
                                                             'prix_moyen', p.average_price, 'montant', p.montant, 'bot', p.bot) order by p.montant desc) from p), '[]'::jsonb),
    'joueurs', (select count(distinct p.user_id) from p), 'total', (select coalesce(sum(p.montant), 0) from p),
    'duels', (select count(*) from wm.duels d join m on m.m = d.m where d.etat in ('open', 'active')),
    'combines', (select count(*) from wm.combos c, m where c.etat = 'open' and c.legs @> jsonb_build_array(jsonb_build_object('m', m.m))))
$$;

-- ══ 7. États du moteur ══
-- Le statut du moteur suit le cycle (ouvert : open ; suspendu, fermé, à résoudre : closed).
create or replace function wm.fiche_statut_moteur(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches; v_st text;
begin
  select * into f from wm.fiches x where x.id = p_id;
  if not found or not f.moteur or f.cycle in ('resolu', 'annule') then return; end if;
  v_st := case when f.cycle = 'ouvert' then 'open' else 'closed' end;
  update public.markets m set status = v_st, updated_at = now()
  where coalesce(m.status, 'open') <> v_st and coalesce(m.status, 'open') <> 'resolved'
    and (m.id = f.id or m.id in (select x.market_id from wm.fiches_options x where x.fiche_id = f.id));
  if found then
    perform realtime.send(jsonb_build_object('id', f.id, 'st', v_st), 'etat', 'marches', false);
  end if;
  if f.nature = 'options' then update public.market_groups set status = case when v_st = 'open' then 'open' else 'closed' end where id = f.id and status <> 'resolved'; end if;
end $$;

-- Confier un marché à l'équipe (« à résoudre »), avec le résultat que propose l'automate s'il en a un.
create or replace function wm.cycle_a_resoudre(p_id text, p_propose jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update wm.fiches set cycle = 'a_resoudre', propose = p_propose where id = p_id and cycle in ('ouvert', 'suspendu', 'ferme');
  if found then
    perform wm.fiche_statut_moteur(p_id);
    perform wm.journal_noter(null, 'marche_a_resoudre', 'marche', p_id, null, p_propose, null, null);
  end if;
end $$;

-- ══ 8. Résolution automatique d'un marché fermé ══
-- Rend {fait: true} quand le marché a été résolu ou confié à l'équipe, {fait: false} quand la donnée n'est pas encore là.
create or replace function wm.cycle_resoudre_auto(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f wm.fiches; r jsonb; v jsonb; v_ref jsonb; v_issue text; v_marge numeric; v_seuil numeric; v_ecart numeric; m wm.sport_matchs;
  v_attente interval := make_interval(mins => wm.reglage_num('cycle.attente_min', 60)::integer); v_au timestamptz; v_opt text;
begin
  select * into f from wm.fiches x where x.id = p_id;
  if not found or f.cycle <> 'ferme' then return jsonb_build_object('fait', false); end if;
  r := f.regle; v_marge := coalesce(wm.num(r ->> 'marge'), 0.003);
  if r ->> 'type' in ('prix', 'cloture', 'reference_bce') then
    v_seuil := wm.num(r ->> 'seuil');
    v := case r ->> 'type'
           when 'prix' then wm.cycle_cours_a(r ->> 'actif', wm.cat_date(r ->> 'au'))
           when 'cloture' then wm.cycle_cloture(r ->> 'actif', wm.cat_date(r ->> 'cloture_at'))
           else wm.cycle_reference_bce(r ->> 'actif', (r ->> 'jour')::date) end;
    if v is null then
      if now() > coalesce(f.resolution_at, f.ferme_at) + v_attente then
        perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'donnee_absente'));
        return jsonb_build_object('fait', true, 'a_resoudre', true);
      end if;
      return jsonb_build_object('fait', false);
    end if;
    v_issue := wm.cycle_compare((v ->> 'v')::numeric, r ->> 'op', v_seuil);
    v_ecart := abs((v ->> 'v')::numeric / v_seuil - 1);
    if v_ecart < v_marge then
      perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'trop_proche', 'issue', v_issue, 'valeur', v, 'seuil', v_seuil, 'marge', v_marge));
      return jsonb_build_object('fait', true, 'a_resoudre', true);
    end if;
    perform wm.resoudre(f.id, v_issue, null, v || jsonb_build_object('seuil', v_seuil, 'op', r ->> 'op'), v ->> 'source', null, 'résolution automatique');
    return jsonb_build_object('fait', true, 'issue', v_issue);
  elsif r ->> 'type' in ('hausse', 'hausse_cloture') then
    v_ref := r -> 'ref';
    v := case r ->> 'type' when 'hausse' then wm.cycle_cours_a(r ->> 'actif', wm.cat_date(r ->> 'fin')) else wm.cycle_cloture(r ->> 'actif', wm.cat_date(r ->> 'cloture_at')) end;
    if v_ref is null or v is null then
      if now() > coalesce(f.resolution_at, f.ferme_at) + v_attente then
        perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'donnee_absente', 'ref', v_ref, 'valeur', v));
        return jsonb_build_object('fait', true, 'a_resoudre', true);
      end if;
      return jsonb_build_object('fait', false);
    end if;
    v_issue := case when (v ->> 'v')::numeric > (v_ref ->> 'v')::numeric then 'oui' else 'non' end;
    if abs((v ->> 'v')::numeric / (v_ref ->> 'v')::numeric - 1) < v_marge then
      perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'trop_proche', 'issue', v_issue, 'ref', v_ref, 'valeur', v, 'marge', v_marge));
      return jsonb_build_object('fait', true, 'a_resoudre', true);
    end if;
    perform wm.resoudre(f.id, v_issue, null, jsonb_build_object('ref', v_ref, 'fin', v), v ->> 'source', null, 'résolution automatique');
    return jsonb_build_object('fait', true, 'issue', v_issue);
  elsif r ->> 'type' = 'touche' then
    -- fin de la fenêtre sans que le seuil ait été vu : « non », sauf si le plus haut observé en est proche
    v := (select c.detail -> 'max' from wm.cat_cotes c where c.market_id = f.id);
    if v is not null and (v ->> 'v')::numeric >= wm.num(r ->> 'seuil') * (1 - coalesce(wm.num(r ->> 'marge'), 0.01)) then
      perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'trop_proche', 'issue', 'non', 'max', v, 'seuil', r -> 'seuil'));
      return jsonb_build_object('fait', true, 'a_resoudre', true);
    end if;
    perform wm.resoudre(f.id, 'non', null, jsonb_build_object('max', v, 'seuil', r -> 'seuil'), 'cours relevés par Wimoro', null, 'résolution automatique');
    return jsonb_build_object('fait', true, 'issue', 'non');
  elsif r ->> 'type' = 'match' then
    select * into m from wm.sport_matchs s
    where s.id = any (array['oldb:' || coalesce(r ->> 'openligadb', '-'), 'fd:' || coalesce(r ->> 'fd', '-'), 'as:' || coalesce(r ->> 'as', '-'), 'bdl:' || coalesce(r ->> 'bdl', '-')])
       or (s.sport = r ->> 'sport' and abs(extract(epoch from s.debut_at - wm.cat_date(r ->> 'debut'))) <= 1800
           and lower(s.dom ->> 'nom') like '%' || lower(split_part(coalesce(r ->> 'dom', '?'), ' ', 1)) || '%'
           and lower(s.ext ->> 'nom') like '%' || lower(split_part(coalesce(r ->> 'ext', '?'), ' ', 1)) || '%')
    order by s.maj_at desc limit 1;
    if found and m.statut = 'termine' and m.score_dom is not null and m.score_ext is not null then
      v_opt := case when r ->> 'sport' = 'nba' then case when m.score_dom > m.score_ext then 'home' else 'away' end
                    else case when m.score_dom > m.score_ext then 'home' when m.score_dom < m.score_ext then 'away' else 'draw' end end;
      if not exists (select 1 from wm.fiches_options x where x.market_id = f.id || '-' || v_opt) then
        perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'option_absente', 'score', jsonb_build_array(m.score_dom, m.score_ext)));
        return jsonb_build_object('fait', true, 'a_resoudre', true);
      end if;
      perform wm.resoudre(f.id, f.id || '-' || v_opt, null, jsonb_build_object('score', jsonb_build_array(m.score_dom, m.score_ext), 'match', m.id),
                          m.source, null, 'résolution automatique');
      return jsonb_build_object('fait', true, 'issue', v_opt);
    end if;
    if (found and m.statut in ('reporte', 'annule')) or now() > coalesce(f.resolution_at, f.ferme_at) + v_attente then
      perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', case when found then 'match_' || m.statut else 'score_absent' end,
        'score', case when found then jsonb_build_array(m.score_dom, m.score_ext) end));
      return jsonb_build_object('fait', true, 'a_resoudre', true);
    end if;
    return jsonb_build_object('fait', false);
  end if;
  -- manuel (actualité, décisions, classements…) : l'équipe tranche ; un cours indicatif est proposé s'il y en a un
  v_au := wm.cat_date(r -> 'indicatif' ->> 'au');
  v := case when v_au is not null then wm.cycle_cours_a(r -> 'indicatif' ->> 'actif', v_au, 900) end;
  perform wm.cycle_a_resoudre(f.id, jsonb_build_object('raison', 'decision_humaine', 'indicatif', v,
    'issue', case when v is not null then wm.cycle_compare((v ->> 'v')::numeric, r -> 'indicatif' ->> 'op', wm.num(r -> 'indicatif' ->> 'seuil')) end));
  return jsonb_build_object('fait', true, 'a_resoudre', true);
end $$;

-- ══ 9. La tâche du cycle (wm-cycle, chaque minute) ══
create or replace function wm.cycle_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f record; n jsonb := '{}'::jsonb; v jsonb; v_max numeric; v_ref jsonb; c integer;
begin
  if not wm.reglage_bool('cycle.actif', true) then return jsonb_build_object('actif', false); end if;
  if not pg_try_advisory_xact_lock(hashtext('wm.cycle_tick')) then return jsonb_build_object('occupe', true); end if;
  perform set_config('wm.journal_origine', 'automate', true);

  -- 1. fin des suspensions datées
  for f in select x.id from wm.fiches x where x.cycle = 'suspendu' and x.suspendu_jusqua <= now() and x.ferme_at > now() order by x.id loop
    update wm.fiches set cycle = 'ouvert', suspendu_motif = null, suspendu_jusqua = null where id = f.id;
    perform wm.fiche_statut_moteur(f.id);
    perform wm.journal_noter(null, 'marche_rouvrir', 'marche', f.id, jsonb_build_object('cycle', 'suspendu'), jsonb_build_object('cycle', 'ouvert'), 'fin de la suspension', null);
  end loop;

  -- 2. « touche » : le plus haut des deux dernières minutes ; seuil atteint → fermé puis résolu « oui »
  for f in select x.id, x.regle from wm.fiches x where x.cycle in ('ouvert', 'suspendu', 'ferme') and x.regle ->> 'type' = 'touche' order by x.id loop
    select max(e.prix) into v_max from wm.px_echantillons e where e.actif = f.regle ->> 'actif' and e.t > now() - interval '2 minutes';
    if v_max is null then continue; end if;
    update wm.cat_cotes set detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('max', jsonb_build_object('v', v_max, 't', now())), maj_at = now()
    where market_id = f.id and (detail -> 'max' is null or (detail -> 'max' ->> 'v')::numeric < v_max);
    if v_max >= wm.num(f.regle ->> 'seuil') and now() <= coalesce(wm.cat_date(f.regle ->> 'jusqua'), 'infinity')
       and now() >= coalesce(wm.cat_date(f.regle ->> 'de'), '-infinity') then
      v := (select jsonb_build_object('v', e.prix, 'source', e.source, 't', e.t) from wm.px_echantillons e
            where e.actif = f.regle ->> 'actif' and e.t > now() - interval '2 minutes' order by e.prix desc, e.t limit 1);
      update wm.fiches set cycle = 'ferme' where id = f.id and cycle in ('ouvert', 'suspendu');
      perform wm.fiche_statut_moteur(f.id);
      perform wm.resoudre(f.id, 'oui', null, v || jsonb_build_object('seuil', f.regle -> 'seuil'), v ->> 'source', null, 'seuil atteint');
      n := n || jsonb_build_object('touche:' || f.id, v);
    end if;
  end loop;

  -- 3. fin des mises
  c := 0;
  for f in select x.id from wm.fiches x where x.cycle in ('ouvert', 'suspendu') and x.ferme_at <= now() order by x.ferme_at, x.id loop
    update wm.fiches set cycle = 'ferme', suspendu_motif = null, suspendu_jusqua = null where id = f.id;
    perform wm.fiche_statut_moteur(f.id);
    perform wm.journal_noter(null, 'marche_fermer', 'marche', f.id, null, jsonb_build_object('cycle', 'ferme'), 'fin des mises', null);
    perform wm.cycle_etapes('ferme', f.id);
    c := c + 1;
  end loop;
  if c > 0 then n := n || jsonb_build_object('fermes', c); end if;

  -- 4. valeurs de référence des marchés « en hausse » (relevées une fois, gardées dans la règle)
  for f in select x.id, x.regle from wm.fiches x where x.cycle in ('ouvert', 'suspendu', 'ferme') and x.regle ->> 'type' in ('hausse', 'hausse_cloture') and x.regle -> 'ref' is null loop
    v_ref := case f.regle ->> 'type'
               when 'hausse' then case when now() >= wm.cat_date(f.regle ->> 'debut') then wm.cycle_cours_a(f.regle ->> 'actif', wm.cat_date(f.regle ->> 'debut')) end
               else wm.cycle_cloture(f.regle ->> 'actif', wm.cat_date(f.regle ->> 'ref_cloture_at')) end;
    if v_ref is not null then update wm.fiches set regle = regle || jsonb_build_object('ref', v_ref) where id = f.id; end if;
  end loop;

  -- 5. résultats
  c := 0;
  for f in select x.id from wm.fiches x where x.cycle = 'ferme' and coalesce(x.resolution_at, x.ferme_at) <= now() order by x.ferme_at, x.id loop
    v := wm.cycle_resoudre_auto(f.id);
    if (v ->> 'fait')::boolean then c := c + 1; end if;
  end loop;
  if c > 0 then n := n || jsonb_build_object('resultats', c); end if;

  -- 6. étapes des lots suivants (propositions du jour, ouvertures de matchs…)
  v := wm.cycle_etapes('tick');
  if v <> '{}'::jsonb then n := n || jsonb_build_object('etapes', v); end if;
  return n;
end $$;

-- ══ 10. Présence (nombre exact de joueurs en ligne) et relevé d'argent du joueur ══
create table if not exists wm.presences (
  user_id uuid primary key references public.users (id) on delete cascade,
  vu_at timestamptz not null default now()
);
alter table wm.presences enable row level security;
revoke all on wm.presences from public, anon, authenticated;

-- Le nouvel écran l'appelle toutes les 60 s quand l'onglet est visible (joueurs connectés) ; une écriture par minute au plus.
create or replace function wm.presence() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  insert into wm.presences (user_id, vu_at) values (v_uid, now())
  on conflict (user_id) do update set vu_at = now() where wm.presences.vu_at < now() - interval '50 seconds';
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.api_presence() returns jsonb
language sql set search_path = '' as $$ select wm.presence() $$;

-- Les opérations d'argent du joueur (son relevé : paris, gains, dépôts, ajustements de l'équipe, remboursements…), par pages.
create or replace function wm.operations(p_avant bigint default null, p_n integer default 50) returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (select b.id, b.kind, b.amount, b.balance_after, b.ref_id, b.created_at from public.balance_ledger b
             where b.user_id = wm.uid() and (p_avant is null or b.id < p_avant)
             order by b.id desc limit least(greatest(coalesce(p_n, 50), 1), 200))
  select jsonb_build_object('operations', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'k', o.kind, 'montant', o.amount, 'solde', o.balance_after,
           'ref', case when o.kind = 'ajustement_admin' then null else o.ref_id end, 'at', wm.en_ms(o.created_at)) order by o.id desc), '[]'::jsonb),
    'suite', case when count(*) = least(greatest(coalesce(p_n, 50), 1), 200) then min(o.id) end)
  from o
$$;
create or replace function public.api_operations(p_avant bigint default null, p_n integer default 50) returns jsonb
language sql set search_path = '' as $$ select wm.operations(p_avant, p_n) $$;

-- ══ 11. Actions de l'équipe sur les marchés (porte api_equipe) ══
create or replace function wm.eq_fiche(p_id text) returns wm.fiches
language plpgsql stable security definer set search_path = '' as $$
declare f wm.fiches;
begin
  select * into f from wm.fiches x where x.id = lower(btrim(coalesce(p_id, '')));
  if not found then perform wm.fail('marche_inconnu'); end if;
  return f;
end $$;

-- La fiche complète pour l'équipe : tout, y compris la justification de la probabilité de départ et les vérifications.
create or replace function wm.eq_fiche_vue(f wm.fiches) returns jsonb
language sql stable security definer set search_path = '' as $$
  select wm.fiche_vue(f, null) || jsonb_strip_nulls(jsonb_build_object(
    'nature', f.nature, 'categorie', f.categorie, 'moteur_cat', f.moteur_cat, 'textes', f.textes, 'regle', f.regle, 'p0', f.p0, 'p0_justif', f.p0_justif,
    'verifs', f.verifs, 'propose', f.propose, 'moteur', f.moteur, 'masque', f.masque, 'origine', f.origine, 'modele_id', f.modele_id, 'periode', f.periode,
    'image', (select jsonb_build_object('id', i.id, 'fichier', i.fichier, 'etat', i.etat, 'chemin', i.chemin, 'credit', i.credit, 'erreur', i.erreur) from wm.images i where i.id = f.image_id),
    'options', (select jsonb_agg(jsonb_build_object('id', o.market_id, 'code', o.code, 'noms', o.noms, 'p0', o.p0,
                  'image', (select jsonb_build_object('fichier', i.fichier, 'etat', i.etat, 'chemin', i.chemin) from wm.images i where i.id = o.image_id)) order by o.ordre)
                from wm.fiches_options o where o.fiche_id = f.id),
    'cotes', (select jsonb_object_agg(c.market_id, jsonb_build_object('prix', c.prix, 'modele', c.modele, 'detail', c.detail, 'modele_at', wm.en_ms(c.modele_at)))
              from wm.cat_cotes c where c.market_id = f.id or c.market_id in (select o.market_id from wm.fiches_options o where o.fiche_id = f.id)),
    'positions', (select jsonb_build_object('n', count(*), 'mises', coalesce(round(sum(p.shares * p.average_price / 100), 2), 0)) from public.positions p
                  where p.shares > 0 and (p.market_id = f.id or p.market_id in (select o.market_id from wm.fiches_options o where o.fiche_id = f.id))),
    'resolu_par', f.resolu_par, 'annule_par', f.annule_par, 'maj_par', f.maj_par, 'cree_at', wm.en_ms(f.cree_at), 'maj_at', wm.en_ms(f.maj_at)))
$$;

create or replace function wm.eq_marches_liste(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'marches', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'q', f.textes -> 'fr' ->> 'q', 'court', f.textes -> 'fr' ->> 'court', 'c', f.categorie,
        'k', f.nature, 'st', f.cycle, 'g', f.origine, 'f', wm.en_ms(f.ferme_at), 'z', wm.en_ms(f.resolution_at), 'propose', f.propose, 'moteur', f.moteur,
        'masque', f.masque, 'modele', f.modele_id, 'image', (select i.etat from wm.images i where i.id = f.image_id)) order by f.ferme_at, f.id)
      from wm.fiches f
      where (p ->> 'etat' is null or f.cycle = p ->> 'etat') and (p ->> 'categorie' is null or f.categorie = p ->> 'categorie')
        and (coalesce((p ->> 'masques')::boolean, false) or not f.masque)
        and (p ->> 'q' is null or position(lower(p ->> 'q') in lower(f.id || ' ' || (f.textes -> 'fr' ->> 'q'))) > 0)), '[]'::jsonb),
    'compte', (select jsonb_object_agg(x.cycle, x.n) from (select f.cycle, count(*) as n from wm.fiches f where not f.masque group by f.cycle) x),
    'en_ligne', wm.reglage_bool('catalogue.serveur', false))
$$;

create or replace function wm.eq_marche_fiche(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select wm.eq_fiche_vue(wm.eq_fiche(p ->> 'id')) || jsonb_build_object('journal', coalesce((select jsonb_agg(wm.journal_vue(j) order by j.id desc)
    from (select * from wm.journal j where j.cible_type = 'marche' and j.cible = lower(btrim(coalesce(p ->> 'id', ''))) order by j.id desc limit 30) j), '[]'::jsonb))
$$;

create or replace function wm.eq_marche_creer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id text; v_f jsonb := coalesce(p -> 'fiche', p) - 'motif';
begin
  v_id := wm.fiche_creer(v_f || jsonb_build_object('origine', case when v_f ->> 'origine' in ('actu', 'sport') then v_f ->> 'origine' else 'admin' end), p_admin);
  perform wm.journal_noter(p_admin, 'marche_creer', 'marche', v_id, null, wm.eq_fiche_vue(wm.eq_fiche(v_id)) - 'cotes' - 'positions', p ->> 'motif', null);
  return jsonb_build_object('marche', wm.eq_fiche_vue(wm.eq_fiche(v_id)));
end $$;

-- Ce que marche_modifier peut changer, tel quel (pour l'annulation et le contrôle « déjà modifié »).
create or replace function wm.eq_fiche_etat(f wm.fiches) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('textes', f.textes, 'categorie', f.categorie, 'moteur_cat', f.moteur_cat, 'ferme_at', f.ferme_at, 'resolution_at', f.resolution_at,
    'source', jsonb_build_object('nom', f.source_nom, 'url', f.source_url), 'regle', f.regle,
    'image', (select jsonb_build_object('fichier', i.fichier, 'genre', i.genre) from wm.images i where i.id = f.image_id),
    'options', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'noms', o.noms,
                 'image', (select jsonb_build_object('fichier', i.fichier, 'genre', i.genre) from wm.images i where i.id = o.image_id)) order by o.ordre)
               from wm.fiches_options o where o.fiche_id = f.id), '[]'::jsonb))
$$;

-- Modifier une fiche : textes (3 langues), catégorie, image, fin des mises, heure du résultat, source, règle, noms et images
-- des options. Les titres du moteur suivent (public.markets, groupe, issues). Annulable : l'inverse remet l'état d'avant,
-- refusé (deja_modifie) si la fiche a changé depuis.
create or replace function wm.eq_marche_modifier(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f wm.fiches := wm.eq_fiche(p ->> 'id'); v_avant jsonb; v_textes jsonb; v_ferme timestamptz; v_res timestamptz; o jsonb; x wm.fiches_options;
  v_img bigint; v_cat wm.cat_categories; v_apres jsonb; v_src_url text;
begin
  if f.cycle in ('resolu', 'annule') then perform wm.fail('deja_resolu'); end if;
  v_avant := wm.eq_fiche_etat(f);
  if p ? 'attendu' and p -> 'attendu' is distinct from v_avant then perform wm.fail('deja_modifie'); end if;
  v_textes := case when p ? 'textes' then wm.cat_textes(p -> 'textes') else f.textes end;
  v_ferme := case when p ? 'ferme_at' then wm.cat_date(p ->> 'ferme_at') else f.ferme_at end;
  v_res := case when p ? 'resolution_at' then wm.cat_date(p ->> 'resolution_at') else f.resolution_at end;
  if v_ferme is null or (p ? 'resolution_at' and p ->> 'resolution_at' is not null and v_res is null) or (v_res is not null and v_res < v_ferme) then perform wm.fail('date_invalide'); end if;
  if p ? 'ferme_at' and v_ferme <> f.ferme_at and v_ferme <= now() and f.cycle in ('ouvert', 'suspendu') then perform wm.fail('date_invalide'); end if;
  if p ? 'categorie' then
    select * into v_cat from wm.cat_categories c where c.id = p ->> 'categorie';
    if not found then perform wm.fail('categorie_invalide'); end if;
  end if;
  v_src_url := case when p ? 'source' then nullif(btrim(coalesce(p -> 'source' ->> 'url', '')), '') else f.source_url end;
  if v_src_url is not null and (v_src_url !~ '^https://[^\s<>"`\\]+$' or char_length(v_src_url) > 500) then perform wm.fail('source_invalide'); end if;
  v_img := case when p ? 'image' then wm.image_ref(p -> 'image') else f.image_id end;

  update wm.fiches set textes = v_textes, categorie = coalesce(v_cat.id, categorie),
    moteur_cat = case when p ? 'moteur_cat' then coalesce(nullif(btrim(p ->> 'moteur_cat'), ''), moteur_cat) when v_cat.id is not null then v_cat.moteur else moteur_cat end,
    ferme_at = v_ferme, resolution_at = v_res,
    source_nom = case when p ? 'source' then wm.cat_texte(p -> 'source' ->> 'nom', 120, false) else source_nom end, source_url = v_src_url,
    regle = case when p ? 'regle' then wm.cat_regle(p -> 'regle') else regle end, image_id = v_img, maj_par = p_admin
  where id = f.id;
  if jsonb_typeof(p -> 'options') = 'array' then
    for o in select e from jsonb_array_elements(p -> 'options') e loop
      select * into x from wm.fiches_options y where y.fiche_id = f.id and y.code = o ->> 'code';
      if not found then perform wm.fail('options_invalides'); end if;
      update wm.fiches_options set noms = case when o ? 'noms' then wm.cat_noms(o -> 'noms') else noms end,
        image_id = case when o ? 'image' then wm.image_ref(o -> 'image') else image_id end
      where market_id = x.market_id;
    end loop;
  end if;
  select * into f from wm.fiches y where y.id = f.id;
  if f.moteur then                                    -- les titres et la clôture du moteur suivent
    update public.markets m set question = case when f.nature = 'binaire' then f.textes -> 'fr' ->> 'q'
                                                 else left((f.textes -> 'fr' ->> 'court') || ' : ' || (o2.noms ->> 'fr'), 200) end,
      short_question = case when f.nature = 'binaire' then f.textes -> 'fr' ->> 'court' else left(o2.noms ->> 'fr', 60) end,
      category = f.moteur_cat, close_date = (f.ferme_at at time zone 'UTC')::date, close_time = (f.ferme_at at time zone 'UTC')::time,
      resolution_rules = left(f.textes -> 'fr' ->> 'critere', 1500), resolution_source = f.source_url, updated_at = now()
    from (select f.id as mid, null::jsonb as noms union all select y.market_id, y.noms from wm.fiches_options y where y.fiche_id = f.id) o2
    where m.id = o2.mid;
    update public.market_groups set question = f.textes -> 'fr' ->> 'q', short_question = f.textes -> 'fr' ->> 'court', category = f.moteur_cat,
      close_date = (f.ferme_at at time zone 'UTC')::date, close_time = (f.ferme_at at time zone 'UTC')::time where id = f.id;
    update public.market_outcomes mo set label = left(y.noms ->> 'fr', 60) from wm.fiches_options y where y.fiche_id = f.id and mo.id = y.market_id;
  end if;
  v_apres := wm.eq_fiche_etat(f);
  if v_apres = v_avant then perform wm.fail('reglage_inchange'); end if;
  perform wm.journal_noter(p_admin, 'marche_modifier', 'marche', f.id, v_avant, v_apres, p ->> 'motif',
    jsonb_build_object('action', 'marche_modifier', 'p', v_avant || jsonb_build_object('id', f.id, 'attendu', v_apres)));
  return jsonb_build_object('marche', wm.eq_fiche_vue(f));
end $$;

create or replace function wm.eq_marche_suspendre(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches := wm.eq_fiche(p ->> 'id'); v_jusqua timestamptz := wm.cat_date(p ->> 'jusqua');
begin
  if f.cycle <> 'ouvert' then perform wm.fail('etat_invalide'); end if;
  if v_jusqua is not null and v_jusqua <= now() then perform wm.fail('date_invalide'); end if;
  update wm.fiches set cycle = 'suspendu', suspendu_motif = left(btrim(coalesce(p ->> 'motif', '')), 300), suspendu_jusqua = v_jusqua, maj_par = p_admin where id = f.id;
  perform wm.fiche_statut_moteur(f.id);
  perform wm.journal_noter(p_admin, 'marche_suspendre', 'marche', f.id, jsonb_build_object('cycle', 'ouvert'),
    jsonb_build_object('cycle', 'suspendu', 'jusqua', wm.en_ms(v_jusqua)), p ->> 'motif', jsonb_build_object('action', 'marche_rouvrir', 'p', jsonb_build_object('id', f.id)));
  return jsonb_build_object('marche', wm.eq_fiche_vue(wm.eq_fiche(f.id)));
end $$;

create or replace function wm.eq_marche_rouvrir(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches := wm.eq_fiche(p ->> 'id');
begin
  if f.cycle <> 'suspendu' then perform wm.fail('etat_invalide'); end if;
  if f.ferme_at <= now() then perform wm.fail('date_invalide'); end if;
  update wm.fiches set cycle = 'ouvert', suspendu_motif = null, suspendu_jusqua = null, maj_par = p_admin where id = f.id;
  perform wm.fiche_statut_moteur(f.id);
  perform wm.journal_noter(p_admin, 'marche_rouvrir', 'marche', f.id, jsonb_build_object('cycle', 'suspendu'), jsonb_build_object('cycle', 'ouvert'),
    p ->> 'motif', jsonb_build_object('action', 'marche_suspendre', 'p', jsonb_build_object('id', f.id)));
  return jsonb_build_object('marche', wm.eq_fiche_vue(wm.eq_fiche(f.id)));
end $$;

-- Trancher : l'issue (oui, non ou l'identifiant d'une option), le lien de la preuve (obligatoire), la valeur relevée si
-- utile. Les mises s'arrêtent d'abord si elles couraient encore. Ne s'annule pas.
create or replace function wm.eq_marche_resoudre(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches := wm.eq_fiche(p ->> 'id'); v_issue text := btrim(coalesce(p ->> 'issue', ''));
begin
  if coalesce(p ->> 'preuve', '') = '' then perform wm.fail('preuve_requise'); end if;
  if f.nature = 'options' and v_issue !~ '-' then v_issue := f.id || '-' || v_issue; end if;   -- code d'option accepté
  if f.cycle in ('ouvert', 'suspendu') then
    update wm.fiches set cycle = 'ferme', suspendu_motif = null, suspendu_jusqua = null where id = f.id;
    perform wm.fiche_statut_moteur(f.id);
  end if;
  return wm.resoudre(f.id, v_issue, p_admin, case when p ? 'valeur' then p -> 'valeur' end, coalesce(p ->> 'source', 'décision de l''équipe'), p ->> 'preuve', p ->> 'motif');
end $$;

create or replace function wm.eq_marche_annuler_apercu(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select wm.annuler_apercu((wm.eq_fiche(p ->> 'id')).id)
$$;

create or replace function wm.eq_marche_annuler(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return wm.annuler((wm.eq_fiche(p ->> 'id')).id, p_admin, p ->> 'motif');
end $$;

-- ── Ce que le panneau demandait aussi (relevé de son agent) ──
-- Les clans de joueurs, dissous compris.
create or replace function wm.eq_clans_liste(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('clans', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'tag', c.tag, 'chef', c.chef,
      'chef_nom', (select u.username from public.users u where u.id = c.chef), 'acces', c.acces, 'cree_at', wm.en_ms(c.cree_at),
      'membres', (select count(*) from wm.clan_membres m where m.clan_id = c.id and m.parti_at is null),
      'dissous', d.clan_id is not null, 'dissous_at', wm.en_ms(d.at), 'dissous_par', d.par, 'motif', d.motif) order by c.cree_at desc), '[]'::jsonb))
  from wm.clans_joueurs c left join wm.clans_dissous d on d.clan_id = c.id
  where (p ->> 'q' is null or position(lower(p ->> 'q') in lower(c.nom || ' ' || c.tag)) > 0)
    and (p ->> 'dissous' is null or (d.clan_id is not null) = (p ->> 'dissous')::boolean)
$$;

-- La liste des mots interdits, en lecture (modérateurs compris : le réglage n'est pas public).
create or replace function wm.eq_mots_interdits_lire(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mots', wm.reglage_json('chat.mots_interdits', '[]'::jsonb), 'prives', wm.reglage_bool('chat.mots_prives', false))
$$;

-- Ajuster l'XP d'un joueur (jamais en dessous de zéro) ; un modérateur est plafonné par equipe.moderateur_xp_max.
create or replace function wm.eq_joueur_xp(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_delta integer; v_avant integer; v_apres integer;
begin
  perform wm.eq_cible(p_admin, v_user, false);
  v_delta := wm.num(p ->> 'delta')::integer;
  if v_delta is null or v_delta = 0 or abs(v_delta) > 100000 then perform wm.fail('montant_invalide'); end if;
  if wm.role_equipe(p_admin) = 'moderateur' and abs(v_delta) > wm.reglage_num('equipe.moderateur_xp_max', 1000) then perform wm.fail('plafond_moderateur'); end if;
  select s.xp into v_avant from public.user_stats s where s.user_id = v_user for update;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  v_apres := greatest(0, coalesce(v_avant, 0) + v_delta);
  update public.user_stats set xp = v_apres where user_id = v_user;
  perform wm.rank_refresh(v_user);
  perform wm.joueur_signal(v_user, 'etat');
  perform wm.journal_noter(p_admin, 'joueur_xp', 'joueur', v_user::text, jsonb_build_object('xp', v_avant), jsonb_build_object('xp', v_apres, 'delta', v_apres - v_avant),
    p ->> 'motif', jsonb_build_object('action', 'joueur_xp', 'p', jsonb_build_object('id', v_user, 'delta', v_avant - v_apres)));
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', v_user));
end $$;

-- Joueurs en ligne : exact (signal de présence du nouvel écran, moins de 2 minutes), et sessions rafraîchies dans l'heure.
create or replace function wm.eq_en_ligne(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'joueurs', (select count(*) from wm.presences x join public.users u on u.id = x.user_id where x.vu_at > now() - interval '2 minutes' and not coalesce(u.is_demo, false)),
    'joueurs_5min', (select count(*) from wm.presences x where x.vu_at > now() - interval '5 minutes'),
    'sessions_1h', (select count(distinct s.user_id) from auth.sessions s where coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) > now() - interval '65 minutes'),
    'present', coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false),
    't', wm.en_ms(now()))
$$;

-- Le relevé d'argent d'un joueur (balance_ledger), par pages.
create or replace function wm.eq_joueur_operations(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (select b.* from public.balance_ledger b where b.user_id = wm.eq_uuid(p ->> 'id') and (p ->> 'avant' is null or b.id < wm.num(p ->> 'avant'))
             order by b.id desc limit least(greatest(coalesce(wm.num(p ->> 'n')::integer, 50), 1), 200))
  select jsonb_build_object('operations', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'k', o.kind, 'montant', o.amount, 'solde', o.balance_after,
           'ref', o.ref_id, 'at', wm.en_ms(o.created_at)) order by o.id desc), '[]'::jsonb), 'suite', min(o.id))
  from o
$$;

insert into wm.equipe_actions (action, fonction, famille, roles, ecrit, motif, annulable, description) values
  ('marches_liste', 'wm.eq_marches_liste', 'marches', '{administrateur}', false, false, false, 'Les marchés du catalogue, par état, catégorie ou texte'),
  ('marche_fiche', 'wm.eq_marche_fiche', 'marches', '{administrateur}', false, false, false, 'La fiche complète d''un marché, sa justification, ses cotes et son journal'),
  ('marche_creer', 'wm.eq_marche_creer', 'marches', '{administrateur}', true, true, false, 'Créer un marché (textes en trois langues, catégorie, options, dates, source)'),
  ('marche_modifier', 'wm.eq_marche_modifier', 'marches', '{administrateur}', true, true, true, 'Modifier textes, image, catégorie, options, fin des mises, critère, source'),
  ('marche_suspendre', 'wm.eq_marche_suspendre', 'marches', '{administrateur}', true, true, true, 'Suspendre les mises d''un marché'),
  ('marche_rouvrir', 'wm.eq_marche_rouvrir', 'marches', '{administrateur}', true, true, true, 'Rouvrir les mises d''un marché suspendu'),
  ('marche_resoudre', 'wm.eq_marche_resoudre', 'marches', '{administrateur}', true, true, false, 'Trancher un marché : issue, lien de la preuve, valeur'),
  ('marche_annuler_apercu', 'wm.eq_marche_annuler_apercu', 'marches', '{administrateur}', false, false, false, 'Aperçu des remboursements d''une annulation'),
  ('marche_annuler', 'wm.eq_marche_annuler', 'marches', '{administrateur}', true, true, false, 'Annuler un marché : positions remboursées au prix d''achat'),
  ('clans_liste', 'wm.eq_clans_liste', 'chat', '{administrateur,moderateur}', false, false, false, 'Les clans de joueurs, dissous compris'),
  ('mots_interdits_lire', 'wm.eq_mots_interdits_lire', 'chat', '{administrateur,moderateur}', false, false, false, 'Lire la liste des mots interdits'),
  ('joueur_xp', 'wm.eq_joueur_xp', 'joueurs', '{administrateur,moderateur}', true, true, true, 'Ajuster l''XP d''un joueur'),
  ('en_ligne', 'wm.eq_en_ligne', 'joueurs', '{administrateur,moderateur}', false, false, false, 'Nombre de joueurs en ligne'),
  ('joueur_operations', 'wm.eq_joueur_operations', 'joueurs', '{administrateur,moderateur}', false, false, false, 'Le relevé d''argent d''un joueur')
on conflict (action) do nothing;

-- ══ 12. La tâche planifiée ══
select cron.schedule('wm-cycle', '* * * * *', 'select wm.cycle_tick()');

select wm.droits();
