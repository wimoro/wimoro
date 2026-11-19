-- MISE EN LIGNE DU CATALOGUE DES MARCHÉS RÉELS (lot 12) — À APPLIQUER LE JOUR OÙ LE NOUVEL ÉCRAN EST EN LIGNE, PAS AVANT.
--
-- Ce fichier n'est pas dans la liste des migrations appliquées (son nom ne commence pas par un numéro de version) : la base
-- embarquée des tests ne le charge pas d'elle-même, et rien n'est fait en production tant qu'il n'est pas appliqué. Le jour
-- de la mise en ligne (docs/EXPLOITATION.md, § 10) : apply_migration avec le texte exact de ce fichier, nom
-- « mise_en_ligne_catalogue », puis renommer le fichier avec la version rendue (comme toute migration).
--
-- Ce qu'il fait, dans une seule transaction (tout ou rien) :
--   1. sauvegarde les tables touchées (backup_20261119, copies « lot12 ») ;
--   2. donne une fiche « ancien » (masquée) à chacun des 27 anciens marchés fictifs (et à leurs 3 groupes), puis les ANNULE
--      par wm.annuler : chaque position ouverte est remboursée au prix d'achat (parts × prix moyen, écriture « annulation »
--      du journal d'argent, ligne d'historique, notification « marche_annule ») ; duels en jeu rendus, sélections des
--      combinés annulées, lots des copies libérés ; les marchés passent à « resolved / voided » et sortent de l'affichage.
--      Rien n'est supprimé (les lignes restent, les parts passent à 0) ;
--   3. allume catalogue.serveur : l'écran affiche le catalogue du serveur ;
--   4. crée les lignes du moteur des fiches du catalogue (marché, carnet, salon), avec leur prix du moment ;
--   5. donne une fiche aux marchés proposés par des joueurs ou créés depuis l'ancien panneau, et pose deux déclencheurs pour
--      la suite : un marché créé par un ancien chemin reçoit sa fiche ; un marché fermé, rouvert ou résolu par l'ancien
--      panneau aligne sa fiche.
-- Rejouer le fichier ne rembourse pas deux fois (une fiche déjà annulée est passée).

-- ══ 0. Sauvegarde ══
select backup_20261119.sauver_lot('public.positions', 'lot12');
select backup_20261119.sauver_lot('public.user_stats', 'lot12');
select backup_20261119.sauver_lot('public.balance_ledger', 'lot12');
select backup_20261119.sauver_lot('public.position_history', 'lot12');
select backup_20261119.sauver_lot('public.markets', 'lot12');
select backup_20261119.sauver_lot('public.market_live_state', 'lot12');
select backup_20261119.sauver_lot('public.market_groups', 'lot12');
select backup_20261119.sauver_lot('wm.duels', 'lot12');
select backup_20261119.sauver_lot('wm.combos', 'lot12');
select backup_20261119.sauver_lot('wm.copies_lots', 'lot12');
select backup_20261119.sauver_lot('wm.fiches', 'lot12');
select backup_20261119.sauver_lot('wm.reglages', 'lot12');

-- ══ 1. Les anciens marchés fictifs ══
-- Catégorie d'affichage d'un marché d'avant (la fiche est masquée : elle ne sert qu'au retrait et à l'historique).
create or replace function wm.cat_de_moteur(p_cat text) returns text
language sql immutable set search_path = '' as $$
  select case p_cat when 'Crypto' then 'crypto' when 'Bourse' then 'bourse' when 'Économie' then 'economie' when 'Politique' then 'politique'
                    when 'Football' then 'sport' when 'Sport' then 'sport' when 'Sport live' then 'sport' when 'Tech et IA' then 'tech' else 'culture' end
$$;

-- La fiche d'un marché du moteur qui n'en a pas (ancien, joueur, ancien panneau) : le même texte dans les trois langues.
create or replace function wm.fiche_depuis_moteur(p_id text, p_origine text, p_masque boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.markets; g public.market_groups; o record; v_tx jsonb; v_cycle text; v_n integer := 0;
begin
  if exists (select 1 from wm.fiches f where f.id = p_id) or exists (select 1 from wm.fiches_options x where x.market_id = p_id) then return null; end if;
  select * into g from public.market_groups x where x.id = p_id;
  if found then
    v_tx := jsonb_build_object('q', g.question, 'court', coalesce(g.short_question, left(g.question, 40)), 'critere', coalesce(g.resolution_rules, ''));
    v_cycle := case when g.status = 'resolved' then 'resolu' when g.status = 'closed' then 'ferme' else 'ouvert' end;
    insert into wm.fiches (id, nature, categorie, moteur_cat, textes, ferme_at, origine, cycle, masque, moteur, p0_justif)
    values (g.id, 'options', wm.cat_de_moteur(g.category), g.category, jsonb_build_object('fr', v_tx, 'en', v_tx, 'he', v_tx),
            coalesce((g.close_date + coalesce(g.close_time, '23:59'::time)) at time zone 'Europe/Paris', now()), p_origine, v_cycle, p_masque, true,
            'Marché d''avant le catalogue du serveur.');
    for o in select x.id, x.initial_probability, coalesce(oc.label, x.short_question, x.question) as nom from public.markets x
             left join public.market_outcomes oc on oc.market_id = x.id where x.group_parent_id = g.id order by x.id loop
      v_n := v_n + 1;
      insert into wm.fiches_options (market_id, fiche_id, code, ordre, noms, p0)
      values (o.id, g.id, coalesce(nullif(left(regexp_replace(substr(o.id, char_length(g.id) + 2), '[^a-z0-9]', '', 'g'), 10), ''), 'o' || v_n),
              v_n, jsonb_build_object('fr', left(o.nom, 40), 'en', left(o.nom, 40), 'he', left(o.nom, 40)), least(99, greatest(1, coalesce(o.initial_probability, 10))));
    end loop;
    return g.id;
  end if;
  select * into m from public.markets x where x.id = p_id;
  if not found or m.group_parent_id is not null then return null; end if;
  v_tx := jsonb_build_object('q', m.question, 'court', coalesce(m.short_question, left(m.question, 40)), 'critere', coalesce(m.resolution_rules, ''));
  v_cycle := case when m.status = 'resolved' then case when m.resolution_outcome = 'voided' then 'annule' else 'resolu' end when m.status = 'closed' then 'ferme' else 'ouvert' end;
  insert into wm.fiches (id, nature, categorie, moteur_cat, textes, ferme_at, origine, cycle, masque, moteur, p0, resolu_issue, p0_justif)
  values (m.id, 'binaire', wm.cat_de_moteur(m.category), m.category, jsonb_build_object('fr', v_tx, 'en', v_tx, 'he', v_tx),
          coalesce((m.close_date + coalesce(m.close_time, '23:59'::time)) at time zone 'Europe/Paris', now()), p_origine, v_cycle, p_masque, true,
          least(99, greatest(1, coalesce(m.initial_probability, 50))), case m.resolution_outcome when 'yes' then 'oui' when 'no' then 'non' end,
          'Marché d''avant le catalogue du serveur.');
  return m.id;
end $$;

create or replace function wm.mise_en_ligne_catalogue() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ANCIENS constant text[] := array['bce', 'box-office', 'btc150k', 'clasico', 'eth6000', 'ia-olympiades', 'ldc', 'neige-noel', 'roland-garros', 'sol-eth',
                                   'presid27', 'ldc27', 'crypto2'];
  a text; v jsonb := '{}'::jsonb; r jsonb; n_moteur integer := 0; n_joueurs integer := 0; f record; v_total numeric := 0; v_pos integer := 0;
begin
  perform set_config('wm.journal_origine', 'migration', true);
  -- 1. les anciens marchés fictifs : fiche masquée, puis annulation avec remboursement au prix d'achat
  foreach a in array ANCIENS loop
    if not exists (select 1 from public.markets m where m.id = a and m.creator_user_id is null)
       and not exists (select 1 from public.market_groups g where g.id = a and g.creator_user_id is null) then continue; end if;
    perform wm.fiche_depuis_moteur(a, 'ancien', true);
    update wm.fiches set masque = true where id = a and origine = 'ancien';
    if exists (select 1 from wm.fiches x where x.id = a and x.cycle not in ('resolu', 'annule')) then
      r := wm.annuler(a, null, 'Retrait du catalogue fictif : positions remboursées au prix d''achat');
      v := v || jsonb_build_object(a, jsonb_build_object('joueurs', r -> 'joueurs', 'rembourse', r -> 'rembourse'));
      v_pos := v_pos + (r ->> 'joueurs')::integer; v_total := v_total + (r ->> 'rembourse')::numeric;
    end if;
  end loop;
  -- 2. l'interrupteur : l'écran affiche le catalogue du serveur
  if not wm.reglage_bool('catalogue.serveur', false) then
    perform wm.reglage_ecrire('catalogue.serveur', 'true'::jsonb, null);
    perform wm.journal_noter(null, 'reglage_modifier', 'reglage', 'catalogue.serveur', jsonb_build_object('valeur', false), jsonb_build_object('valeur', true),
      'Mise en ligne du catalogue des marchés réels', null);
  end if;
  -- 3. les lignes du moteur des fiches du catalogue (au prix du moment)
  for f in select x.id from wm.fiches x where not x.moteur and x.origine <> 'ancien' and x.cycle in ('ouvert', 'suspendu', 'ferme', 'a_resoudre') order by x.id loop
    perform wm.fiche_moteur(f.id); n_moteur := n_moteur + 1;
  end loop;
  -- 4. les marchés de joueurs et de l'ancien panneau reçoivent leur fiche (visible)
  for f in select m.id, case when exists (select 1 from public.admin_users au where au.user_id = m.creator_user_id) then 'admin' else 'joueur' end as orig
           from public.markets m where m.creator_user_id is not null and m.group_parent_id is null
             and not exists (select 1 from wm.fiches x where x.id = m.id) order by m.id loop
    perform wm.fiche_depuis_moteur(f.id, f.orig, false); n_joueurs := n_joueurs + 1;
  end loop;
  perform wm.journal_noter(null, 'mise_en_ligne_catalogue', 'tache', 'catalogue', null,
    jsonb_build_object('anciens', v, 'positions_remboursees', v_pos, 'total_rembourse', v_total, 'moteur', n_moteur, 'fiches_joueurs', n_joueurs), 'Mise en ligne du catalogue', null);
  return jsonb_build_object('anciens', v, 'positions_remboursees', v_pos, 'total_rembourse', v_total, 'moteur', n_moteur, 'fiches_joueurs', n_joueurs);
end $$;

-- ══ 2. Les chemins d'avant après la mise en ligne ══
-- Un marché créé par un ancien chemin (proposition de joueur mise en ligne, ancien panneau) reçoit sa fiche.
create or replace function wm.marches_fiche_auto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if wm.reglage_bool('catalogue.serveur', false) and new.group_parent_id is null
     and not exists (select 1 from wm.fiches f where f.id = new.id) and not exists (select 1 from wm.fiches_options x where x.market_id = new.id) then
    perform wm.fiche_depuis_moteur(new.id, case when exists (select 1 from public.admin_users au where au.user_id = new.creator_user_id) then 'admin' else 'joueur' end, false);
  end if;
  return null;
end $$;
create or replace trigger marches_fiche_auto after insert on public.markets for each row execute function wm.marches_fiche_auto();

-- Un marché fermé, rouvert ou résolu par l'ancien panneau (api_admin) : sa fiche suit, si elle ne le sait pas déjà.
create or replace function wm.marches_statut_fiche() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_fiche text := coalesce((select f.id from wm.fiches f where f.id = new.id), (select x.fiche_id from wm.fiches_options x where x.market_id = new.id));
begin
  if v_fiche is null then return null; end if;
  if new.status = 'resolved' and new.resolution_outcome in ('yes', 'no') then
    update wm.fiches set cycle = 'resolu', resolu_at = coalesce(resolu_at, now()), resolu_source = coalesce(resolu_source, 'ancien panneau'),
      resolu_issue = coalesce(resolu_issue, case when nature = 'binaire' then case new.resolution_outcome when 'yes' then 'oui' else 'non' end
                                                 when new.resolution_outcome = 'yes' then new.id end)
    where id = v_fiche and cycle not in ('resolu', 'annule') and (nature = 'binaire' or new.resolution_outcome = 'yes');
  elsif new.status = 'closed' and old.status = 'open' then
    update wm.fiches set cycle = 'suspendu', suspendu_motif = coalesce(suspendu_motif, 'ancien panneau') where id = v_fiche and cycle = 'ouvert';
  elsif new.status = 'open' and old.status = 'closed' then
    update wm.fiches set cycle = 'ouvert', suspendu_motif = null, suspendu_jusqua = null where id = v_fiche and cycle = 'suspendu' and ferme_at > now();
  end if;
  return null;
end $$;
create or replace trigger marches_statut_fiche after update of status on public.markets for each row when (old.status is distinct from new.status)
  execute function wm.marches_statut_fiche();

-- ══ 3. La mise en ligne ══
select wm.mise_en_ligne_catalogue();

select wm.droits();
