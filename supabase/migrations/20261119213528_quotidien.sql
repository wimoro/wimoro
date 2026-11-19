-- Marchés réels, lot 11 (19 nov. 2026) : la tâche quotidienne (Edge Function « quotidien »), la file des propositions du
-- jour, les résultats des matchs et la copie des images.
--
-- Rien ne change pour un joueur du site en ligne. Ajouts :
--   * les sources de la tâche (wm.sources, nouvelles lignes) : Currents (clé CURRENTS_API_KEY), Wikipédia « À la une »
--     (en, fr, he), Hacker News, deux sites de marchés publics pour les tendances (usage interne, jamais nommés dans le
--     produit), Groq (clé GROQ_API_KEY), un emplacement pour une clé payante (GEMINI_API_KEY), football-data.org,
--     API-Sports et balldontlie (clés), OpenLigaDB (Bundesliga, sans clé), Wikimedia Commons (images). Sans clé, une source
--     est seulement « inactive — clé absente » : la tâche passe à la suivante. Ces lignes portent config.tache = 'quotidien' ;
--   * [ajout] srv_donnees_config (la collecte des cours, Edge Function « donnees ») ne lit plus ces lignes : un contrôle
--     ajouté, ses propres sources sont servies exactement comme avant (sans lui, elle noterait chaque minute leurs clés
--     « absentes », puisqu'elle ne les connaît pas) ;
--   * srv_quotidien_config / srv_quotidien_enregistrer / srv_sport_maj / srv_images_a_copier / srv_image_enregistrer :
--     les appels de l'Edge Function (clé de service seulement) ;
--   * wm.propositions_tick (étape du cycle, chaque minute) : une proposition de match (« auto ») s'ouvre 48 h avant le coup
--     d'envoi s'il reste une place parmi les marchés d'actualité (catalogue.actus_max, 30) ; un sujet d'actualité attend la
--     validation d'un membre de l'équipe ; une proposition non traitée expire ;
--   * les actions du panneau : propositions_liste, proposition_modifier, proposition_valider, proposition_refuser (et
--     proposition_remettre, son inverse), quotidien_lancer ;
--   * les tâches planifiées wm-quotidien (chaque jour à 05:30 UTC) et wm-quotidien-reveil (toutes les 10 minutes : n'appelle
--     l'Edge Function que s'il y a des images à copier ou des résultats de matchs à relever).

-- ══ 0. Sauvegarde ══
select backup_20261119.sauver_lot('wm.sources', 'lot11');
select backup_20261119.sauver_lot('wm.reglages', 'lot11');
select backup_20261119.sauver_lot('wm.equipe_actions', 'lot11');
select backup_20261119.sauver_lot('cron.job', 'lot11');
select backup_20261119.sauver_fonction('public.srv_donnees_config()', 'lot11');

-- ══ 1. Réglages ══
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
select x.cle, 'catalogue', x.libelle, x.explication, x.type, x.v::jsonb, x.v::jsonb, x.mn, x.mx, false, false, true, null, x.ordre
from (values
  ('quotidien.actif', 'Tâche quotidienne', 'Chaque jour à 05:30 UTC, la fonction « quotidien » lit l''actualité, les tendances et les calendriers sportifs et prépare des propositions ; faux : plus rien.', 'booleen', 'true', null::numeric, null::numeric, 320),
  ('quotidien.ia', 'Rédaction par une IA', 'Si une clé d''IA est enregistrée (Groq, ou la clé payante Gemini), un seul appel par jour rédige les sujets dans les trois langues ; faux : gabarits seulement.', 'booleen', 'true', null, null, 321),
  ('catalogue.actus_max', 'Marchés d''actualité ouverts', 'Nombre de marchés d''actualité (sujets et matchs) que le serveur garde ouverts ; les matchs s''ouvrent d''eux-mêmes tant qu''il reste une place.', 'entier', '30', 0, 200, 322),
  ('catalogue.sport_auto', 'Matchs ouverts d''office', 'Un match du calendrier s''ouvre de lui-même 48 h avant le coup d''envoi (fait vérifiable) ; faux : il attend lui aussi la validation.', 'booleen', 'true', null, null, 323)
) as x(cle, libelle, explication, type, v, mn, mx, ordre)
on conflict (cle) do nothing;
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
values ('quotidien.sujets_exclus', 'catalogue', 'Sujets exclus', 'Mots qui écartent un titre d''actualité (décès, violence, santé…), dans les trois langues.', 'json',
  '["mort", "meurt", "décès", "décédé", "tué", "attentat", "otage", "victime", "cancer", "hospitalisé", "killed", "dies", "dead", "death", "attack", "shooting", "murder", "hostage", "terror", "suicide", "hospital", "נהרג", "נרצח", "פיגוע", "מת", "חטוף"]',
  '["mort", "meurt", "décès", "décédé", "tué", "attentat", "otage", "victime", "cancer", "hospitalisé", "killed", "dies", "dead", "death", "attack", "shooting", "murder", "hostage", "terror", "suicide", "hospital", "נהרג", "נרצח", "פיגוע", "מת", "חטוף"]',
  null, null, false, false, true, null, 324)
on conflict (cle) do nothing;

-- ══ 2. Les sources de la tâche quotidienne ══
insert into wm.sources (id, nom, rangs, nature, cle_requise, secret, cadence_s, quota_min, quota_jour, marge, config)
select x.id, x.nom, x.rangs::jsonb, x.nature, x.cle_requise, x.secret, x.cadence_s, x.quota_min, x.quota_jour, x.marge, '{"tache": "quotidien"}'::jsonb from (values
  ('currents', 'Currents (gros titres)', '{"actualite": 1}', 'differe', true, 'CURRENTS_API_KEY', 3600, null, 250, 0.5),
  ('wikipedia', 'Wikipédia, « À la une » et articles les plus lus', '{"actualite": 2, "tendances": 3}', 'differe', false, null, 3600, null, null, 0.5),
  ('hackernews', 'Hacker News (tech)', '{"actualite": 3}', 'differe', false, null, 3600, null, null, 0.5),
  ('tendances_a', 'Marchés publics de prédiction A (tendances, interne)', '{"tendances": 1}', 'differe', false, null, 3600, null, null, 0.5),
  ('tendances_b', 'Marchés publics de prédiction B (tendances, interne)', '{"tendances": 2}', 'differe', false, null, 3600, null, null, 0.5),
  ('groq', 'Groq (rédaction en trois langues)', '{"ia": 1}', 'direct', true, 'GROQ_API_KEY', 3600, null, 1000, 0.5),
  ('gemini', 'Google Gemini (clé payante, emplacement)', '{"ia": 2}', 'direct', true, 'GEMINI_API_KEY', 3600, null, 100, 0.5),
  ('football_data', 'football-data.org (calendrier, résultats)', '{"sport": 1}', 'direct', true, 'FOOTBALL_DATA_API_KEY', 60, 10, null, 0.5),
  ('apisports', 'API-Sports, API-Football (direct, résultats)', '{"sport": 2}', 'direct', true, 'APISPORTS_API_KEY', 420, null, 100, 0.5),
  ('balldontlie', 'balldontlie (NBA)', '{"sport_nba": 1}', 'direct', true, 'BALLDONTLIE_API_KEY', 30, 5, null, 0.5),
  ('openligadb', 'OpenLigaDB (Bundesliga, licence ODbL)', '{"sport": 3}', 'direct', false, null, 120, null, null, 0.5),
  ('commons', 'Wikimedia Commons (images libres)', '{"images": 1}', 'direct', false, null, 1, null, null, 0.5)
) as x(id, nom, rangs, nature, cle_requise, secret, cadence_s, quota_min, quota_jour, marge)
on conflict (id) do nothing;

-- [ajout] La collecte des cours ne lit que ses sources : le texte de 20261119171018_donnees_socle.sql, plus le seul filtre
-- « config.tache <> 'quotidien' » (sauvegardée avant : backup_20261119.fonctions_lots, lot11).
create or replace function public.srv_donnees_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    't', wm.en_ms(clock_timestamp()),
    'reglages', jsonb_build_object('actif', wm.reglage_bool('donnees.actif', true), 'cadence_s', wm.reglage_num('donnees.cadence_s', 3),
                                   'boucle_s', wm.reglage_num('donnees.boucle_s', 55)),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'rangs', s.rangs, 'nature', s.nature, 'cle_requise', s.cle_requise,
        'secret', s.secret, 'actif', s.actif, 'cadence_s', s.cadence_s, 'quota_min', s.quota_min, 'quota_jour', s.quota_jour, 'marge', s.marge,
        'appels_jour', case when s.jour = (clock_timestamp() at time zone 'UTC')::date then s.appels_jour else 0 end,
        'erreurs_suite', s.erreurs_suite, 'pause_jusqua', wm.en_ms(s.pause_jusqua), 'dernier_ok', wm.en_ms(s.dernier_ok_at),
        'dernier_appel', wm.en_ms(greatest(s.dernier_ok_at, s.derniere_erreur_at)), 'config', s.config)
        order by s.id) from wm.sources s where coalesce(s.config ->> 'tache', '') <> 'quotidien'), '[]'::jsonb),   -- [ajout] le filtre
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'famille', a.famille, 'marche', a.marche, 'symboles', a.symboles,
        'ouvert', wm.marche_ouvert(a.marche, clock_timestamp()), 'dernier', wm.en_ms(d.t)) order by a.ordre, a.id)
        from wm.px_actifs a left join wm.px_dernier d on d.actif = a.id), '[]'::jsonb),
    'marches', coalesce((select jsonb_object_agg(m.id, wm.marche_ouvert(m.id, clock_timestamp())) from wm.px_marches m), '{}'::jsonb))
$$;

-- ══ 3. Ce que lit l'Edge Function (clé de service seulement) ══
create or replace function public.srv_quotidien_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'actif', wm.reglage_bool('quotidien.actif', true), 'ia', wm.reglage_bool('quotidien.ia', true),
    'exclus', wm.reglage_json('quotidien.sujets_exclus', '[]'::jsonb),
    'actus_max', wm.reglage_num('catalogue.actus_max', 30)::integer,
    'actus_ouvertes', (select count(*) from wm.fiches f where f.origine in ('actu', 'sport') and f.cycle in ('ouvert', 'suspendu') and not f.masque),
    'saison_bl', case when extract(month from now()) >= 7 then extract(year from now())::integer else extract(year from now())::integer - 1 end,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'actif', s.actif, 'secret', s.secret, 'pause_jusqua', wm.en_ms(s.pause_jusqua)) order by s.id)
                         from wm.sources s where s.id in ('currents', 'wikipedia', 'hackernews', 'tendances_a', 'tendances_b', 'groq', 'gemini', 'football_data', 'apisports', 'balldontlie', 'openligadb', 'commons')), '[]'::jsonb),
    -- matchs dont il faut relever le score : ceux des fiches du catalogue entre trois heures avant et six heures après le coup d'envoi
    'matchs_suivis', coalesce((select jsonb_agg(distinct x.id) from (
        select case when f.regle ->> 'openligadb' is not null then 'oldb:' || (f.regle ->> 'openligadb') when f.regle ->> 'fd' is not null then 'fd:' || (f.regle ->> 'fd')
                    when f.regle ->> 'as' is not null then 'as:' || (f.regle ->> 'as') when f.regle ->> 'bdl' is not null then 'bdl:' || (f.regle ->> 'bdl') end as id
        from wm.fiches f where f.regle ->> 'type' = 'match' and f.cycle in ('ouvert', 'suspendu', 'ferme', 'a_resoudre')
          and wm.cat_date(f.regle ->> 'debut') between now() - interval '6 hours' and now() + interval '3 hours') x where x.id is not null), '[]'::jsonb),
    'cles_connues', coalesce((select jsonb_agg(p.cle) from wm.propositions_jour p where p.cle is not null and p.cree_at > now() - interval '30 days'), '[]'::jsonb))
$$;

-- Un match vu chez une source (calendrier, direct, résultat) : gardé ou mis à jour, jamais effacé.
create or replace function wm.sport_match_maj(m jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_debut timestamptz := to_timestamp(wm.num(m ->> 'debut') / 1000);
begin
  if coalesce(m ->> 'id', '') !~ '^(oldb|fd|as|bdl):[0-9A-Za-z-]{1,30}$' or v_debut is null or coalesce(m ->> 'sport', '') not in ('foot', 'nba', 'tennis') then return; end if;
  insert into wm.sport_matchs (id, sport, competition, debut_at, dom, ext, statut, score_dom, score_ext, minute, source, final_at, maj_at)
  values (m ->> 'id', m ->> 'sport', left(m ->> 'competition', 40), v_debut, coalesce(m -> 'dom', '{}'::jsonb), coalesce(m -> 'ext', '{}'::jsonb),
          coalesce(nullif(m ->> 'statut', ''), 'prevu'), wm.num(m ->> 'score_dom')::integer, wm.num(m ->> 'score_ext')::integer, wm.num(m ->> 'minute')::integer,
          left(coalesce(m ->> 'source', 'inconnue'), 40), case when m ->> 'statut' = 'termine' then now() end, now())
  on conflict (id) do update set statut = excluded.statut, debut_at = excluded.debut_at,
    score_dom = coalesce(excluded.score_dom, wm.sport_matchs.score_dom), score_ext = coalesce(excluded.score_ext, wm.sport_matchs.score_ext),
    minute = excluded.minute, source = excluded.source, maj_at = now(),
    final_at = case when excluded.statut = 'termine' then coalesce(wm.sport_matchs.final_at, now()) else wm.sport_matchs.final_at end
  where wm.sport_matchs.statut <> 'termine' or excluded.statut = 'termine';
end $$;

-- Le bilan des sources appelées : appels du jour, dernier succès, dernière erreur, clé présente (jamais sa valeur).
create or replace function wm.quotidien_sources(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s jsonb; v_jour date := (now() at time zone 'UTC')::date;
begin
  for s in select e from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e loop
    update wm.sources x set
      appels_jour = case when x.jour = v_jour then x.appels_jour else 0 end + coalesce(wm.num(s ->> 'appels')::integer, 0), jour = v_jour,
      appels_total = x.appels_total + coalesce(wm.num(s ->> 'appels')::integer, 0),
      cle_presente = case when s ? 'cle' then (s ->> 'cle')::boolean else x.cle_presente end,
      dernier_ok_at = case when (s ->> 'ok')::boolean then now() else x.dernier_ok_at end,
      derniere_erreur = case when s ->> 'erreur' is not null then left(s ->> 'erreur', 200) else x.derniere_erreur end,
      derniere_erreur_at = case when s ->> 'erreur' is not null then now() else x.derniere_erreur_at end,
      erreurs_suite = case when (s ->> 'ok')::boolean then 0 when s ->> 'erreur' is not null then x.erreurs_suite + 1 else x.erreurs_suite end,
      dernier_code = coalesce(wm.num(s ->> 'code')::integer, x.dernier_code), dernier_ms = coalesce(wm.num(s ->> 'ms')::integer, x.dernier_ms), maj_at = now()
    where x.id = s ->> 'id';
    update wm.sources x set etat = (wm.source_etat(x, now()))[1], raison = (wm.source_etat(x, now()))[2] where x.id = s ->> 'id';
  end loop;
end $$;

create or replace function public.srv_sport_maj(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb; n integer := 0;
begin
  for m in select e from jsonb_array_elements(coalesce(p -> 'matchs', '[]'::jsonb)) e loop perform wm.sport_match_maj(m); n := n + 1; end loop;
  perform wm.quotidien_sources(p -> 'sources');
  return jsonb_build_object('matchs', n);
end $$;

-- Les propositions du jour (matchs « auto », sujets « en attente ») ; un même sujet ou un même match n'entre qu'une fois.
create or replace function public.srv_quotidien_enregistrer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x jsonb; m jsonb; n integer := 0; v_auto boolean := wm.reglage_bool('catalogue.sport_auto', true); v_etat text;
begin
  for m in select e from jsonb_array_elements(coalesce(p -> 'matchs', '[]'::jsonb)) e loop perform wm.sport_match_maj(m); end loop;
  for x in select e from jsonb_array_elements(coalesce(p -> 'propositions', '[]'::jsonb)) e loop
    if jsonb_typeof(x -> 'brouillon') is distinct from 'object' or coalesce(x ->> 'cle', '') = '' or char_length(x ->> 'cle') > 120 then continue; end if;
    v_etat := case when x ->> 'etat' = 'auto' and v_auto then 'auto' else 'en_attente' end;
    insert into wm.propositions_jour (origine, etat, cle, brouillon, sources, score, ouvre_at, expire_at)
    values (case when x ->> 'origine' in ('ia', 'gabarit', 'sport', 'tendance') then x ->> 'origine' else 'gabarit' end, v_etat, x ->> 'cle', x -> 'brouillon',
            coalesce(x -> 'sources', '[]'::jsonb), wm.num(x ->> 'score'), wm.cat_date(x ->> 'ouvre_at'),
            coalesce(wm.cat_date(x ->> 'expire_at'), now() + interval '48 hours'))
    on conflict (cle) do nothing;
    if found then n := n + 1; end if;
  end loop;
  perform wm.quotidien_sources(p -> 'sources');
  perform set_config('wm.journal_origine', 'automate', true);
  perform wm.journal_noter(null, 'quotidien', 'tache', 'quotidien', null, jsonb_build_object('propositions', n, 'matchs', jsonb_array_length(coalesce(p -> 'matchs', '[]'::jsonb)),
    'ia', p -> 'ia', 'refus', p -> 'refus'), null, null);
  return jsonb_build_object('propositions', n);
end $$;

-- ══ 4. Images ══
-- Le prochain lot d'images à copier (8 au plus : le calcul d'une Edge Function est borné) ; chaque essai est compté.
create or replace function public.srv_images_a_copier(p_n integer default 8) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  with l as (select i.id from wm.images i where i.etat = 'a_copier' and i.essais < 5 order by i.essais, i.id limit least(greatest(coalesce(p_n, 8), 1), 20) for update skip locked),
  u as (update wm.images i set essais = essais + 1, maj_at = now() from l where i.id = l.id returning i.id, i.fichier, i.genre)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'fichier', u.fichier, 'genre', u.genre) order by u.id), '[]'::jsonb) into v from u;
  return v;
end $$;

-- Le résultat d'une copie : chemin dans le bucket, taille, empreinte, crédit ; ou l'échec et sa raison. Les fiches qui
-- montrent l'image changent de révision (l'écran la recharge).
create or replace function public.srv_image_enregistrer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint := wm.num(p ->> 'id')::bigint; v_etat text := p ->> 'etat';
begin
  if v_etat is null or v_etat not in ('copiee', 'echec', 'refusee') then perform wm.fail('requete'); end if;
  if v_etat = 'copiee' and (coalesce(p ->> 'chemin', '') !~ '^img/[0-9a-f]{64}\.(png|jpg)$' or wm.num(p ->> 'octets') > 32768) then perform wm.fail('requete'); end if;
  update wm.images set etat = case when v_etat = 'echec' and essais < 5 then 'a_copier' else v_etat end, chemin = coalesce(p ->> 'chemin', chemin), mime = coalesce(p ->> 'mime', mime),
    largeur = coalesce(wm.num(p ->> 'largeur')::smallint, largeur), hauteur = coalesce(wm.num(p ->> 'hauteur')::smallint, hauteur),
    octets = coalesce(wm.num(p ->> 'octets')::integer, octets), sha256 = coalesce(p ->> 'sha256', sha256),
    credit = case when jsonb_typeof(p -> 'credit') = 'object' then p -> 'credit' else credit end, erreur = left(p ->> 'erreur', 300),
    copiee_at = case when v_etat = 'copiee' then now() else copiee_at end, maj_at = now()
  where id = v_id;
  if v_etat = 'copiee' then
    update wm.fiches set opt_v = opt_v + 1 where image_id = v_id or id in (select o.fiche_id from wm.fiches_options o where o.image_id = v_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ══ 5. Les propositions dans le cycle (chaque minute) ══
create or replace function wm.propositions_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x wm.propositions_jour; v_places integer; v_id text; n integer := 0; e integer := 0;
begin
  update wm.propositions_jour set etat = 'expiree', maj_at = now() where etat in ('auto', 'en_attente') and expire_at < now();
  get diagnostics e = row_count;
  v_places := wm.reglage_num('catalogue.actus_max', 30)::integer
            - (select count(*) from wm.fiches f where f.origine in ('actu', 'sport') and f.cycle in ('ouvert', 'suspendu') and not f.masque);
  for x in select * from wm.propositions_jour p where p.etat = 'auto' and p.ouvre_at <= now() order by p.ouvre_at, p.score desc nulls last, p.id loop
    exit when v_places <= 0;
    begin
      v_id := wm.fiche_creer(x.brouillon || jsonb_build_object('origine', 'sport'), null);
      update wm.propositions_jour set etat = 'ouverte', fiche_id = v_id, decide_at = now(), maj_at = now() where id = x.id;
      perform wm.journal_noter(null, 'proposition_ouvrir', 'proposition', x.id::text, jsonb_build_object('etat', 'auto'), jsonb_build_object('fiche', v_id), 'match du calendrier', null);
      v_places := v_places - 1; n := n + 1;
    exception when others then
      update wm.propositions_jour set etat = 'expiree', motif = left('ouverture impossible : ' || sqlerrm, 300), maj_at = now() where id = x.id;
    end;
  end loop;
  return case when n + e > 0 then jsonb_build_object('ouvertes', n, 'expirees', e) else '{}'::jsonb end;
end $$;
insert into wm.cycle_blocs (cle, quand, fonction, ordre) values ('propositions', 'tick', 'wm.propositions_tick', 20) on conflict (cle) do nothing;

-- ══ 6. Réveil de l'Edge Function ══
-- Toutes les 10 minutes : la fonction n'est appelée que s'il y a des images à copier ou des scores de matchs à relever.
create or replace function wm.quotidien_reveil() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_taches text[] := '{}';
begin
  if not wm.reglage_bool('quotidien.actif', true) then return null; end if;
  if exists (select 1 from wm.images i where i.etat = 'a_copier' and i.essais < 5) then v_taches := v_taches || 'images'::text; end if;
  if jsonb_array_length(public.srv_quotidien_config() -> 'matchs_suivis') > 0 then v_taches := v_taches || 'sport'::text; end if;
  if array_length(v_taches, 1) is null then return jsonb_build_object('taches', '[]'::jsonb); end if;
  perform wm.appeler('quotidien', jsonb_build_object('taches', to_jsonb(v_taches)));
  return jsonb_build_object('taches', to_jsonb(v_taches));
end $$;

-- ══ 7. Les actions du panneau ══
create or replace function wm.eq_propositions_liste(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('propositions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'jour', x.jour, 'origine', x.origine, 'etat', x.etat, 'cle', x.cle,
      'brouillon', x.brouillon, 'sources', x.sources, 'score', x.score, 'ouvre_at', wm.en_ms(x.ouvre_at), 'expire_at', wm.en_ms(x.expire_at),
      'decide_par', x.decide_par, 'decide_at', wm.en_ms(x.decide_at), 'motif', x.motif, 'fiche_id', x.fiche_id) order by x.etat = 'en_attente' desc, x.jour desc, x.score desc nulls last, x.id desc)
    from (select * from wm.propositions_jour y where (p ->> 'etat' is null or y.etat = p ->> 'etat') order by y.id desc limit least(greatest(coalesce(wm.num(p ->> 'n')::integer, 100), 1), 300)) x), '[]'::jsonb),
    'compte', (select jsonb_object_agg(z.etat, z.n) from (select etat, count(*) as n from wm.propositions_jour group by etat) z))
$$;

create or replace function wm.eq_proposition(p jsonb) returns wm.propositions_jour
language plpgsql stable security definer set search_path = '' as $$
declare x wm.propositions_jour;
begin
  select * into x from wm.propositions_jour y where y.id = wm.num(p ->> 'id')::bigint;
  if not found then perform wm.fail('proposition_inconnue'); end if;
  return x;
end $$;

-- Modifier le brouillon (fusion des champs donnés) ; seulement tant qu'elle n'est ni ouverte ni refusée.
create or replace function wm.eq_proposition_modifier(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x wm.propositions_jour := wm.eq_proposition(p); v jsonb;
begin
  if x.etat not in ('auto', 'en_attente', 'expiree') then perform wm.fail('etat_invalide'); end if;
  if jsonb_typeof(p -> 'brouillon') is distinct from 'object' then perform wm.fail('requete'); end if;
  v := (x.brouillon || (p -> 'brouillon')) - 'a_rediger';
  update wm.propositions_jour set brouillon = v, etat = case when etat = 'expiree' then 'en_attente' else etat end,
    expire_at = greatest(coalesce(expire_at, now()), now() + interval '48 hours'), maj_at = now() where id = x.id;
  perform wm.journal_noter(p_admin, 'proposition_modifier', 'proposition', x.id::text, jsonb_build_object('brouillon', x.brouillon), jsonb_build_object('brouillon', v),
    p ->> 'motif', jsonb_build_object('action', 'proposition_modifier', 'p', jsonb_build_object('id', x.id, 'brouillon', x.brouillon)));
  return jsonb_build_object('proposition', (select to_jsonb(y) from wm.propositions_jour y where y.id = x.id));
end $$;

-- Valider : le marché naît par wm.fiche_creer (mêmes contrôles qu'à la main : trois langues, dates, probabilités).
create or replace function wm.eq_proposition_valider(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x wm.propositions_jour := wm.eq_proposition(p); v jsonb; v_id text;
begin
  if x.etat not in ('auto', 'en_attente', 'expiree') then perform wm.fail('etat_invalide'); end if;
  v := (x.brouillon || coalesce(case when jsonb_typeof(p -> 'brouillon') = 'object' then p -> 'brouillon' end, '{}'::jsonb)) - 'a_rediger' - 'sujet' - 'predecesseur';
  if x.origine = 'successeur' then v := v || jsonb_build_object('origine', 'modele');
  elsif coalesce(v ->> 'origine', '') not in ('actu', 'sport') then v := v || jsonb_build_object('origine', 'actu'); end if;
  v_id := wm.fiche_creer(v, p_admin);
  update wm.propositions_jour set etat = 'ouverte', fiche_id = v_id, brouillon = v, decide_par = p_admin, decide_at = now(), motif = left(p ->> 'motif', 300), maj_at = now()
  where id = x.id;
  perform wm.journal_noter(p_admin, 'proposition_valider', 'proposition', x.id::text, jsonb_build_object('etat', x.etat), jsonb_build_object('etat', 'ouverte', 'fiche', v_id), p ->> 'motif', null);
  return jsonb_build_object('fiche', wm.eq_fiche_vue(wm.eq_fiche(v_id)));
end $$;

create or replace function wm.eq_proposition_refuser(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x wm.propositions_jour := wm.eq_proposition(p);
begin
  if x.etat not in ('auto', 'en_attente', 'expiree') then perform wm.fail('etat_invalide'); end if;
  update wm.propositions_jour set etat = 'refusee', decide_par = p_admin, decide_at = now(), motif = left(p ->> 'motif', 300), maj_at = now() where id = x.id;
  perform wm.journal_noter(p_admin, 'proposition_refuser', 'proposition', x.id::text, jsonb_build_object('etat', x.etat), jsonb_build_object('etat', 'refusee'),
    p ->> 'motif', jsonb_build_object('action', 'proposition_remettre', 'p', jsonb_build_object('id', x.id, 'etat', x.etat)));
  return jsonb_build_object('ok', true);
end $$;

-- L'inverse d'un refus (depuis le journal) : la proposition revient dans son état d'avant.
create or replace function wm.eq_proposition_remettre(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x wm.propositions_jour := wm.eq_proposition(p); v_etat text := coalesce(nullif(p ->> 'etat', ''), 'en_attente');
begin
  if x.etat <> 'refusee' then perform wm.fail('deja_modifie'); end if;
  if v_etat not in ('auto', 'en_attente', 'expiree') then v_etat := 'en_attente'; end if;
  update wm.propositions_jour set etat = v_etat, decide_par = null, decide_at = null, expire_at = greatest(coalesce(expire_at, now()), now() + interval '24 hours'), maj_at = now() where id = x.id;
  perform wm.journal_noter(p_admin, 'proposition_remettre', 'proposition', x.id::text, jsonb_build_object('etat', 'refusee'), jsonb_build_object('etat', v_etat), p ->> 'motif', null);
  return jsonb_build_object('ok', true);
end $$;

-- Relancer la tâche du jour à la demande (une invocation de l'Edge Function).
create or replace function wm.eq_quotidien_lancer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t text := coalesce(nullif(p ->> 'tache', ''), 'jour');
begin
  if v_t not in ('jour', 'images', 'sport') then perform wm.fail('requete'); end if;
  perform wm.appeler('quotidien', jsonb_build_object('tache', v_t));
  perform wm.journal_noter(p_admin, 'quotidien_lancer', 'tache', 'quotidien', null, jsonb_build_object('tache', v_t), p ->> 'motif', null);
  return jsonb_build_object('lance', v_t);
end $$;

insert into wm.equipe_actions (action, fonction, famille, roles, ecrit, motif, annulable, description) values
  ('propositions_liste', 'wm.eq_propositions_liste', 'propositions', '{administrateur}', false, false, false, 'Les propositions du jour (matchs, sujets, successeurs à valider)'),
  ('proposition_modifier', 'wm.eq_proposition_modifier', 'propositions', '{administrateur}', true, false, true, 'Modifier un brouillon (textes, dates, options, source)'),
  ('proposition_valider', 'wm.eq_proposition_valider', 'propositions', '{administrateur}', true, true, false, 'Valider : le marché s''ouvre'),
  ('proposition_refuser', 'wm.eq_proposition_refuser', 'propositions', '{administrateur}', true, true, true, 'Refuser une proposition'),
  ('proposition_remettre', 'wm.eq_proposition_remettre', 'propositions', '{administrateur}', true, true, false, 'Remettre une proposition refusée en attente'),
  ('quotidien_lancer', 'wm.eq_quotidien_lancer', 'propositions', '{administrateur}', true, false, false, 'Relancer la tâche quotidienne, la copie des images ou le relevé des scores')
on conflict (action) do nothing;

-- ══ 8. Tâches planifiées ══ (le réveil tombe aux minutes 5, 15… 55 : jamais en même temps que la tâche du jour de 05:30)
select cron.schedule('wm-quotidien', '30 5 * * *', $$select wm.appeler('quotidien', '{"tache":"jour"}'::jsonb) where wm.reglage_bool('quotidien.actif', true)$$);
select cron.schedule('wm-quotidien-reveil', '5-59/10 * * * *', 'select wm.quotidien_reveil()');

select wm.droits();
