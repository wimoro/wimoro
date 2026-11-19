-- Marchés réels, lot 8 (19 nov. 2026) : le catalogue des marchés vit sur le serveur.
--
-- Rien de ce que voit aujourd'hui un joueur du site en ligne ne change : l'ancien écran (branche main) affiche les 27
-- anciens marchés écrits en dur et achète, vend, discute dessus comme avant. Ce lot n'écrit dans AUCUNE table que lit
-- cet écran (public.markets, market_live_state, market_groups, chat_rooms…) tant que l'interrupteur catalogue.serveur est
-- éteint : les fiches vivent dans le schéma wm, et leurs lignes « moteur » (marché, carnet, salon de chat) ne naissent
-- qu'à la mise en ligne du nouvel écran (fichier supabase/migrations/a_appliquer_a_la_mise_en_ligne_catalogue.sql).
-- Ainsi api_markets, api_state, l'achat, la vente, le chat et les bots restent identiques à l'octet près.
--
-- Ajouts :
--   * la sauvegarde, dans backup_20261119, des tables du moteur que les lots suivants rempliront, et une copie « lot8 »
--     des petites tables où ce lot écrit (réglages, droits, révisions) ;
--   * wm.cat_categories : les 7 catégories (Crypto, Bourse, Économie, Politique, Sport, Tech, Jeux vidéo et culture),
--     leurs noms en trois langues, leur icône de repli et la catégorie du barème des frais qu'elles utilisent ;
--   * wm.images : une ligne par image, copiée en 128 × 128 dans le bucket public « marches » par l'Edge Function
--     « quotidien » (lot 11), avec son crédit (titre, auteur, licence, adresse, source) ;
--   * wm.fiches (une par marché, binaire ou à plusieurs options), wm.fiches_options (nom en trois langues, probabilité de
--     départ et image de chaque option), wm.cat_cotes (le prix servi tant que le moteur n'a pas de ligne, et la dernière
--     probabilité du modèle, lot 10) ;
--   * wm.fiche_creer(fiche) : le seul chemin de création (catalogue initial, successeurs, propositions validées, équipe) ;
--     wm.fiche_moteur(id) : les lignes du moteur, créées comme le fait wm.prop_promouvoir (marché, état en direct, salon) ;
--   * api_catalogue(depuis, langue) et api_credits() : lecture pour tous (visiteurs compris), sans réveiller les bots ;
--   * l'événement « cat » {rev, ids} sur le sujet public « site » : une fois par transaction qui change le catalogue ;
--   * le réglage public catalogue.serveur (éteint) ; le bucket « marches » ;
--   * les 60 marchés ouverts : 30 permanents et 30 d'actualité, vérifiés le 19 nov. 2026 (docs/DONNEES.md, § 7).

-- ══ 0. Sauvegarde (avant toute écriture) ══
-- Copie datée d'une petite table, même si une copie plus ancienne existe déjà (sauver_table garde la plus ancienne).
create or replace function backup_20261119.sauver_lot(p_nom text, p_lot text) returns text
language plpgsql security invoker set search_path = '' as $$
declare s text := split_part(p_nom, '.', 1); n text := split_part(p_nom, '.', 2); c text := split_part(p_nom, '.', 1) || '_' || split_part(p_nom, '.', 2) || '_' || p_lot;
begin
  if p_lot !~ '^[a-z0-9]{2,12}$' then raise exception 'lot invalide'; end if;
  if to_regclass(format('backup_20261119.%I', c)) is not null then return null; end if;
  execute format('create table backup_20261119.%I as table %I.%I', c, s, n);
  execute format('alter table backup_20261119.%I enable row level security', c);
  execute format('revoke all on backup_20261119.%I from public, anon, authenticated', c);
  return 'backup_20261119.' || c;
end $$;
revoke all on function backup_20261119.sauver_lot(text, text) from public, anon, authenticated;

select backup_20261119.sauver_table('public.market_groups');
select backup_20261119.sauver_table('public.market_live_state');
select backup_20261119.sauver_table('public.market_outcomes');
select backup_20261119.sauver_table('public.chat_rooms');
select backup_20261119.sauver_table('wm.revisions');
select backup_20261119.sauver_lot('wm.reglages', 'lot8');
select backup_20261119.sauver_lot('wm.droits_liste', 'lot8');
select backup_20261119.sauver_lot('wm.revisions', 'lot8');

-- ══ 1. Catégories ══
create table if not exists wm.cat_categories (
  id text primary key check (id in ('crypto', 'bourse', 'economie', 'politique', 'sport', 'tech', 'culture')),
  noms jsonb not null,                                -- {fr, en, he}
  moteur text not null,                               -- catégorie écrite dans public.markets : celle du barème des frais (wm.fee_rate)
  icone text not null,                                -- icône du jeu Lucide montrée quand le marché n'a pas d'image
  ordre smallint not null
);
alter table wm.cat_categories enable row level security;
revoke all on wm.cat_categories from public, anon, authenticated;
insert into wm.cat_categories (id, noms, moteur, icone, ordre) values
  ('crypto', '{"fr": "Crypto", "en": "Crypto", "he": "קריפטו"}', 'Crypto', 'bitcoin', 1),
  ('bourse', '{"fr": "Bourse", "en": "Stocks", "he": "בורסה"}', 'Bourse', 'candlestick-chart', 2),
  ('economie', '{"fr": "Économie", "en": "Economy", "he": "כלכלה"}', 'Économie', 'landmark', 3),
  ('politique', '{"fr": "Politique", "en": "Politics", "he": "פוליטיקה"}', 'Politique', 'vote', 4),
  ('sport', '{"fr": "Sport", "en": "Sports", "he": "ספורט"}', 'Sport', 'trophy', 5),
  ('tech', '{"fr": "Tech", "en": "Tech", "he": "טכנולוגיה"}', 'Tech et IA', 'cpu', 6),
  ('culture', '{"fr": "Jeux vidéo et culture", "en": "Games and culture", "he": "גיימינג ותרבות"}', 'Culture', 'gamepad-2', 7)
on conflict (id) do nothing;

-- ══ 2. Images ══
-- Copiées une seule fois (clé « commons:<titre> »), réduites en 128 × 128 (PNG pour les logos, JPEG qualité 80 pour les
-- photos, moins de 15 Ko) par l'Edge Function « quotidien », rangées dans le bucket public « marches » sous leur empreinte.
-- Sources, dans cet ordre : Wikimedia Commons (fichiers libres seulement, jamais les fichiers « non libres » de
-- en.wikipedia), les images d'une API de données si ses conditions le permettent, le site officiel ; sinon pas d'image
-- (l'écran montre l'icône de la catégorie ou l'initiale).
create table if not exists wm.images (
  id bigint generated always as identity primary key,
  cle text not null unique,
  source text not null check (source in ('wikimedia_commons', 'api', 'site_officiel')),
  fichier text,                                       -- titre du fichier chez Commons (« File:Bitcoin.svg »)
  page_url text check (page_url is null or page_url ~ '^https://'),
  genre text not null default 'logo' check (genre in ('logo', 'photo')),
  etat text not null default 'a_copier' check (etat in ('a_copier', 'copiee', 'echec', 'refusee')),
  chemin text,                                        -- dans le bucket « marches » : img/<sha256>.png ou .jpg
  mime text,
  largeur smallint,
  hauteur smallint,
  octets integer,
  sha256 text,
  credit jsonb,                                       -- {titre, auteur, licence, licence_url, source, url, restrictions}
  essais smallint not null default 0,
  erreur text,
  cree_at timestamptz not null default now(),
  copiee_at timestamptz,
  maj_at timestamptz not null default now()
);
alter table wm.images enable row level security;
revoke all on wm.images from public, anon, authenticated;
create index if not exists images_a_copier on wm.images (id) where etat = 'a_copier';

-- Le bucket public des images des marchés : lecture pour tous, écriture par la seule clé de service (aucune règle
-- d'écriture sur storage.objects).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marches', 'marches', true, 32768, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- ══ 3. Fiches ══
create table if not exists wm.fiches (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,39}$'),    -- identifiant du marché (binaire) ou du groupe (options)
  nature text not null check (nature in ('binaire', 'options')),
  categorie text not null references wm.cat_categories (id),
  moteur_cat text not null,                           -- catégorie du barème des frais écrite dans public.markets
  textes jsonb not null,                              -- {fr: {q, court, critere}, en: {…}, he: {…}}
  image_id bigint references wm.images (id),
  ouvre_at timestamptz not null default now(),
  ferme_at timestamptz not null,                      -- fin des mises
  resolution_at timestamptz,                          -- heure attendue du résultat
  source_nom text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  regle jsonb not null default '{"type": "manuel"}'::jsonb,   -- règle lue par la machine (lot 9)
  lien jsonb,                                         -- donnée vivante : {actif: 'btc'} ou {match: {...}}
  p0 numeric(5,2) check (p0 is null or (p0 >= 1 and p0 <= 99)),   -- binaire : probabilité de départ (%)
  p0_justif text,                                     -- justification (interne : jamais servie aux joueurs)
  origine text not null check (origine in ('modele', 'actu', 'sport', 'joueur', 'admin', 'ancien')),
  modele_id text,                                     -- marché permanent : son modèle (lot 10) et sa période
  periode text,
  cycle text not null default 'ouvert' check (cycle in ('ouvert', 'suspendu', 'ferme', 'a_resoudre', 'resolu', 'annule')),
  masque boolean not null default false,
  moteur boolean not null default false,              -- les lignes du moteur existent (marché, carnet, salon)
  suspendu_motif text,
  suspendu_jusqua timestamptz,
  verifs jsonb not null default '[]'::jsonb,          -- adresses de vérification (internes)
  propose jsonb,                                      -- « à résoudre » : résultat proposé par l'automate, valeur, source
  resolu_issue text,                                  -- binaire : oui ou non ; options : identifiant de l'option gagnante
  resolu_valeur jsonb,
  resolu_source text,
  resolu_preuve text,
  resolu_at timestamptz,
  resolu_par uuid,
  annule_motif text,
  annule_at timestamptz,
  annule_par uuid,
  opt_v integer not null default 0,                   -- change quand une option change (révision du catalogue)
  rev bigint not null default 0,                      -- révision du catalogue de son dernier changement
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  maj_par uuid,
  unique (modele_id, periode)
);
alter table wm.fiches enable row level security;
revoke all on wm.fiches from public, anon, authenticated;
create index if not exists fiches_rev on wm.fiches (rev);
create index if not exists fiches_vivantes on wm.fiches (ferme_at) where cycle in ('ouvert', 'suspendu', 'ferme', 'a_resoudre');

create table if not exists wm.fiches_options (
  market_id text primary key check (market_id ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  fiche_id text not null references wm.fiches (id),
  code text not null check (code ~ '^[a-z0-9]{1,10}$'),
  ordre smallint not null,
  noms jsonb not null,                                -- {fr, en, he}
  p0 numeric(5,2) not null check (p0 > 0 and p0 < 100),
  image_id bigint references wm.images (id),
  unique (fiche_id, code)
);
alter table wm.fiches_options enable row level security;
revoke all on wm.fiches_options from public, anon, authenticated;
create index if not exists fiches_options_fiche on wm.fiches_options (fiche_id, ordre);

-- Le prix d'un marché du catalogue tant que le moteur n'a pas de ligne (avant la mise en ligne), et la dernière probabilité
-- du modèle (lot 10). Mis à jour en place, jamais vidé.
create table if not exists wm.cat_cotes (
  market_id text primary key,
  prix numeric(9,6) not null check (prix > 0 and prix < 100),
  modele numeric(9,6),
  detail jsonb,
  modele_at timestamptz,
  maj_at timestamptz not null default now()
);
alter table wm.cat_cotes enable row level security;
revoke all on wm.cat_cotes from public, anon, authenticated;

insert into wm.revisions (nom, rev) values ('catalogue', 0) on conflict (nom) do nothing;

-- ══ 4. Réglage : l'interrupteur de la mise en ligne ══
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
values ('catalogue.serveur', 'catalogue', 'Catalogue du serveur en ligne',
  'Vrai : l''écran affiche le catalogue du serveur et les nouveaux marchés sont ouverts aux mises ; les anciens marchés fictifs sont retirés. Passe à vrai par la migration de mise en ligne seulement.',
  'booleen', 'false', 'false', null, null, false, true, true, 'mise_en_ligne', 300)
on conflict (cle) do nothing;

-- ══ 5. Aides ══
create or replace function wm.cat_date(t text) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin return t::timestamptz; exception when others then return null; end $$;

-- Un texte du catalogue : espaces normalisés, longueur bornée ; jamais de chevron ouvrant (aucune balise possible), d'accent
-- grave, de barre oblique inverse ni de caractère de contrôle. Le signe « > » des libellés (« BTC > 65 000 $ ») et le
-- guillemet droit des sigles hébreux sont permis ; l'écran échappe tout texte.
create or replace function wm.cat_texte(p text, p_max integer, p_obligatoire boolean default true) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if v = '' then
    if p_obligatoire then perform wm.fail('texte_invalide'); end if;
    return null;
  end if;
  if char_length(v) > p_max or v ~ '[<`\\]' or v ~ '[[:cntrl:]]' then perform wm.fail('texte_invalide'); end if;
  return v;
end $$;

-- Les textes d'une fiche : question (200 caractères), libellé court (24) et critère de résolution (1 500), dans les trois
-- langues, toutes obligatoires.
create or replace function wm.cat_textes(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then perform wm.fail('textes_incomplets'); end if;
  foreach k in array array['fr', 'en', 'he'] loop
    if jsonb_typeof(p -> k) is distinct from 'object' then perform wm.fail('textes_incomplets'); end if;
    v := v || jsonb_build_object(k, jsonb_build_object(
      'q', wm.cat_texte(p -> k ->> 'q', 200), 'court', wm.cat_texte(p -> k ->> 'court', 24), 'critere', wm.cat_texte(p -> k ->> 'critere', 1500)));
  end loop;
  return v;
end $$;

-- Le nom d'une option dans les trois langues (40 caractères chacun).
create or replace function wm.cat_noms(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p) is distinct from 'object' then perform wm.fail('textes_incomplets'); end if;
  return jsonb_build_object('fr', wm.cat_texte(p ->> 'fr', 40), 'en', wm.cat_texte(p ->> 'en', 40), 'he', wm.cat_texte(p ->> 'he', 40));
end $$;

-- La référence d'une image (fichier libre de Wikimedia Commons) : créée « à copier » si elle est nouvelle.
create or replace function wm.image_ref(p jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_f text := btrim(coalesce(p ->> 'fichier', '')); v_id bigint;
begin
  if v_f = '' then return null; end if;
  v_f := replace(v_f, '_', ' ');
  if v_f !~* '^File:[^<>`\\|{}#\[\]]{1,200}\.(svg|png|jpe?g|gif|webp|tiff?)$' then perform wm.fail('image_invalide'); end if;
  insert into wm.images (cle, source, fichier, page_url, genre)
  values ('commons:' || v_f, 'wikimedia_commons', v_f, 'https://commons.wikimedia.org/wiki/' || replace(v_f, ' ', '_'),
          case when p ->> 'genre' = 'photo' then 'photo' else 'logo' end)
  on conflict (cle) do update set maj_at = wm.images.maj_at
  returning id into v_id;
  return v_id;
end $$;

-- Les types de règles que le cycle de vie sait lire (lot 9) ; une règle inconnue est refusée.
create or replace function wm.cat_regle(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{"type": "manuel"}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' or coalesce(p ->> 'type', '') not in ('manuel', 'prix', 'cloture', 'reference_bce', 'hausse', 'hausse_cloture', 'touche', 'match')
    then perform wm.fail('regle_invalide'); end if;
  return p;
end $$;

-- ══ 6. Créer une fiche ══
-- p : {id, nature, categorie, moteur_cat?, textes, image?: {fichier, genre}, ouvre_at?, ferme_at, resolution_at?,
--      source?: {nom, url}, regle?, lien?, p0 (binaire), p0_justif?, origine, modele_id?, periode?, verifs?,
--      options?: [{code, noms, p0, image?}]}
-- Les probabilités de départ des options sont ramenées à 100 % exactement. Les lignes du moteur ne sont créées que si le
-- catalogue du serveur est en ligne (catalogue.serveur) : avant, rien n'est écrit dans les tables que lit l'ancien écran.
create or replace function wm.fiche_creer(p jsonb, p_par uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := lower(btrim(coalesce(p ->> 'id', '')));
  v_nat text := coalesce(p ->> 'nature', case when jsonb_typeof(p -> 'options') = 'array' then 'options' else 'binaire' end);
  v_cat wm.cat_categories; v_textes jsonb := wm.cat_textes(p -> 'textes');
  v_ouvre timestamptz := coalesce(wm.cat_date(p ->> 'ouvre_at'), now());
  v_ferme timestamptz := wm.cat_date(p ->> 'ferme_at');
  v_res timestamptz := wm.cat_date(p ->> 'resolution_at');
  v_orig text := coalesce(p ->> 'origine', 'admin');
  v_p0 numeric; v_tot numeric := 0; v_n integer := 0; o jsonb; v_mid text; v_code text; v_reste numeric; v_gros text;
  v_src_nom text := wm.cat_texte(p -> 'source' ->> 'nom', 120, false);
  v_src_url text := nullif(btrim(coalesce(p -> 'source' ->> 'url', '')), '');
begin
  if v_id !~ '^[a-z0-9][a-z0-9-]{2,39}$' then perform wm.fail('identifiant_invalide'); end if;
  if exists (select 1 from wm.fiches f where f.id = v_id) or exists (select 1 from wm.fiches_options x where x.market_id = v_id)
     or exists (select 1 from public.markets m where m.id = v_id) or exists (select 1 from public.market_groups g where g.id = v_id) then
    perform wm.fail('identifiant_pris');
  end if;
  select * into v_cat from wm.cat_categories c where c.id = p ->> 'categorie';
  if not found then perform wm.fail('categorie_invalide'); end if;
  if v_nat not in ('binaire', 'options') or v_orig not in ('modele', 'actu', 'sport', 'joueur', 'admin', 'ancien') then perform wm.fail('requete'); end if;
  if v_ferme is null or v_ferme <= v_ouvre or v_ferme <= now() or (v_res is not null and v_res < v_ferme) then perform wm.fail('date_invalide'); end if;
  if v_src_url is not null and (v_src_url !~ '^https://[^\s<>"`\\]+$' or char_length(v_src_url) > 500) then perform wm.fail('source_invalide'); end if;
  if p ? 'lien' and jsonb_typeof(p -> 'lien') not in ('object', 'null') then perform wm.fail('requete'); end if;

  if v_nat = 'binaire' then
    v_p0 := round(wm.num(p ->> 'p0'), 2);
    if v_p0 is null or v_p0 < 1 or v_p0 > 99 then perform wm.fail('probabilite_invalide'); end if;
  else
    if jsonb_typeof(p -> 'options') is distinct from 'array' or jsonb_array_length(p -> 'options') < 2 or jsonb_array_length(p -> 'options') > 12 then
      perform wm.fail('options_invalides');
    end if;
    select sum(wm.num(x ->> 'p0')) into v_tot from jsonb_array_elements(p -> 'options') x;
    if v_tot is null or v_tot < 90 or v_tot > 110
       or exists (select 1 from jsonb_array_elements(p -> 'options') x where coalesce(wm.num(x ->> 'p0'), 0) <= 0) then
      perform wm.fail('probabilite_invalide');
    end if;
  end if;

  insert into wm.fiches (id, nature, categorie, moteur_cat, textes, image_id, ouvre_at, ferme_at, resolution_at, source_nom, source_url,
                         regle, lien, p0, p0_justif, origine, modele_id, periode, verifs, maj_par)
  values (v_id, v_nat, v_cat.id, coalesce(nullif(btrim(coalesce(p ->> 'moteur_cat', '')), ''), v_cat.moteur), v_textes,
          wm.image_ref(p -> 'image'), v_ouvre, v_ferme, v_res, v_src_nom, v_src_url, wm.cat_regle(p -> 'regle'),
          case when jsonb_typeof(p -> 'lien') = 'object' then p -> 'lien' end, v_p0,
          left(nullif(btrim(coalesce(p ->> 'p0_justif', '')), ''), 2000), v_orig, nullif(p ->> 'modele_id', ''), nullif(p ->> 'periode', ''),
          case when jsonb_typeof(p -> 'verifs') = 'array' then p -> 'verifs' else '[]'::jsonb end, p_par);

  if v_nat = 'binaire' then
    insert into wm.cat_cotes (market_id, prix) values (v_id, v_p0) on conflict (market_id) do update set prix = excluded.prix, maj_at = now();
  else
    for o in select x from jsonb_array_elements(p -> 'options') x loop
      v_n := v_n + 1;
      v_code := lower(btrim(coalesce(o ->> 'code', '')));
      if v_code !~ '^[a-z0-9]{1,10}$' then perform wm.fail('options_invalides'); end if;
      v_mid := v_id || '-' || v_code;
      if v_mid !~ '^[a-z0-9][a-z0-9-]{2,39}$' or exists (select 1 from public.markets m where m.id = v_mid)
         or exists (select 1 from wm.fiches f where f.id = v_mid) or exists (select 1 from wm.fiches_options x where x.market_id = v_mid) then
        perform wm.fail('identifiant_pris');
      end if;
      insert into wm.fiches_options (market_id, fiche_id, code, ordre, noms, p0, image_id)
      values (v_mid, v_id, v_code, v_n, wm.cat_noms(o -> 'noms'), round(wm.num(o ->> 'p0') * 100 / v_tot, 2), wm.image_ref(o -> 'image'));
      insert into wm.cat_cotes (market_id, prix) values (v_mid, round(wm.num(o ->> 'p0') * 100 / v_tot, 6))
      on conflict (market_id) do update set prix = excluded.prix, maj_at = now();
    end loop;
    -- total à 100 exactement (l'écart d'arrondi va à la plus grosse option), comme wm.group_rebalance
    select 100 - sum(x.p0) into v_reste from wm.fiches_options x where x.fiche_id = v_id;
    select x.market_id into v_gros from wm.fiches_options x where x.fiche_id = v_id order by x.p0 desc, x.ordre limit 1;
    if v_reste <> 0 then update wm.fiches_options set p0 = p0 + v_reste where market_id = v_gros; end if;
    select 100 - sum(c.prix) into v_reste from wm.cat_cotes c join wm.fiches_options x on x.market_id = c.market_id where x.fiche_id = v_id;
    if v_reste <> 0 then update wm.cat_cotes set prix = prix + v_reste where market_id = v_gros; end if;
  end if;

  if wm.reglage_bool('catalogue.serveur', false) then perform wm.fiche_moteur(v_id); end if;
  return v_id;
end $$;

-- Les lignes du moteur d'une fiche, comme wm.prop_promouvoir les crée pour un marché proposé par un joueur : le marché
-- (public.markets), son état en direct (public.market_live_state), son salon de chat ; pour un marché à plusieurs
-- options, le groupe (public.market_groups), un marché et un salon par option, et les issues (public.market_outcomes).
-- Une seule fois par fiche (idempotent).
create or replace function wm.fiche_moteur(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare f wm.fiches; o wm.fiches_options; v_p numeric; v_q text; v_court text; v_regles text; v_jour date; v_heure time; v_st text; v_lib text;
begin
  select * into f from wm.fiches x where x.id = p_id for update;
  if not found or f.moteur then return; end if;
  v_jour := (f.ferme_at at time zone 'UTC')::date; v_heure := (f.ferme_at at time zone 'UTC')::time;
  v_q := f.textes -> 'fr' ->> 'q'; v_court := f.textes -> 'fr' ->> 'court'; v_regles := left(f.textes -> 'fr' ->> 'critere', 1500);
  v_st := case f.cycle when 'ouvert' then 'open' when 'resolu' then 'resolved' when 'annule' then 'resolved' else 'closed' end;
  if f.nature = 'binaire' then
    v_p := round(coalesce((select c.prix from wm.cat_cotes c where c.market_id = f.id), f.p0, 50), 6);
    insert into public.markets (id, category, question, short_question, creator_user_id, current_probability, initial_probability, anchor_probability,
                                heat_level, close_date, close_time, resolution_source, resolution_rules, status)
    values (f.id, f.moteur_cat, v_q, v_court, null, round(v_p, 2), coalesce(f.p0, round(v_p, 2)), round(v_p, 2), 1.5, v_jour, v_heure, f.source_url, v_regles, v_st);
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth, d0)
    values (f.id, v_p, v_p, 0, 0, 6000, coalesce(f.p0, round(v_p, 2)));
    perform wm.chat_salon_creer('m:' || f.id);
  else
    insert into public.market_groups (id, category, question, short_question, close_date, close_time, resolution_rules, status, heat_level)
    values (f.id, f.moteur_cat, v_q, v_court, v_jour, v_heure, v_regles, v_st, 1.5);
    for o in select * from wm.fiches_options x where x.fiche_id = f.id order by x.ordre loop
      v_p := round(coalesce((select c.prix from wm.cat_cotes c where c.market_id = o.market_id), o.p0), 6);
      v_lib := o.noms ->> 'fr';
      insert into public.markets (id, category, question, short_question, creator_user_id, current_probability, initial_probability, anchor_probability,
                                  heat_level, close_date, close_time, resolution_source, resolution_rules, status, group_parent_id)
      values (o.market_id, f.moteur_cat, left(v_court || ' : ' || v_lib, 200), left(v_lib, 60), null, round(v_p, 2), o.p0, round(v_p, 2), 1.5,
              v_jour, v_heure, f.source_url, v_regles, v_st, f.id);
      insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth, d0)
      values (o.market_id, v_p, v_p, 0, 0, 6000, o.p0);
      insert into public.market_outcomes (id, group_id, market_id, label, question, current_probability, initial_probability)
      values (o.market_id, f.id, o.market_id, left(v_lib, 60), left(v_court || ' : ' || v_lib, 200), round(v_p, 2), o.p0);
      perform wm.chat_salon_creer('m:' || o.market_id);
    end loop;
  end if;
  update wm.fiches set moteur = true where id = f.id;
end $$;

-- Graine : une liste de fiches, créées dans l'ordre (catalogue initial, tests).
create or replace function wm.catalogue_semer(p jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare x jsonb; n integer := 0;
begin
  for x in select e from jsonb_array_elements(p) e loop perform wm.fiche_creer(x, null); n := n + 1; end loop;
  return n;
end $$;

-- ══ 7. Révision du catalogue et événement « cat » ══
-- Toute fiche créée ou changée (hors prix) prend la révision de sa transaction ; une seule révision par transaction.
create or replace function wm.fiches_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'rev' - 'maj_at') = (to_jsonb(old) - 'rev' - 'maj_at') then return new; end if;
  v := nullif(current_setting('wm.cat_rev', true), '')::bigint;
  if v is null then
    update wm.revisions set rev = rev + 1 where nom = 'catalogue' returning rev into v;
    perform set_config('wm.cat_rev', v::text, true);
  end if;
  new.rev := v;
  new.maj_at := now();
  return new;
end $$;
create or replace trigger fiches_revision before insert or update on wm.fiches for each row execute function wm.fiches_revision();

-- Une option créée ou changée change sa fiche (opt_v), donc la révision.
create or replace function wm.fiches_options_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update wm.fiches set opt_v = opt_v + 1 where id = new.fiche_id;
  return null;
end $$;
create or replace trigger fiches_options_revision after insert or update on wm.fiches_options for each row execute function wm.fiches_options_revision();

-- À la fin de la transaction, un seul message « cat » sur le sujet public « site » : {rev, ids} (les fiches changées),
-- pour que l'écran relise api_catalogue(rev d'avant). Un message n'est publié que si la transaction aboutit.
create or replace function wm.fiches_diffuser() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rev bigint := nullif(current_setting('wm.cat_rev', true), '')::bigint; v_deja text := coalesce(current_setting('wm.diffuses', true), '');
begin
  if v_rev is null or position('|cat|' in v_deja) > 0 then return null; end if;
  perform realtime.send(jsonb_build_object('rev', v_rev,
    'ids', coalesce((select jsonb_agg(f.id order by f.id) from wm.fiches f where f.rev = v_rev), '[]'::jsonb)), 'cat', 'site', false);
  perform set_config('wm.diffuses', v_deja || '|cat|', true);
  return null;
end $$;
create constraint trigger fiches_diffusion after insert or update on wm.fiches deferrable initially deferred
  for each row execute function wm.fiches_diffuser();

-- ══ 8. Lecture : api_catalogue, api_credits ══
-- Une fiche telle que l'écran la lit (champs courts) ; textes dans la langue demandée (repli : français, puis anglais),
-- ou dans les trois. La justification de la probabilité de départ et les adresses de vérification ne sortent jamais.
create or replace function wm.fiche_vue(f wm.fiches, p_langue text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select case when p_langue in ('fr', 'en', 'he') then
                  jsonb_build_object('q', coalesce(f.textes -> p_langue ->> 'q', f.textes -> 'fr' ->> 'q'),
                                     's', coalesce(f.textes -> p_langue ->> 'court', f.textes -> 'fr' ->> 'court'),
                                     'r', coalesce(f.textes -> p_langue ->> 'critere', f.textes -> 'fr' ->> 'critere'))
                else jsonb_build_object('fr', jsonb_build_object('q', f.textes -> 'fr' ->> 'q', 's', f.textes -> 'fr' ->> 'court', 'r', f.textes -> 'fr' ->> 'critere'),
                                        'en', jsonb_build_object('q', f.textes -> 'en' ->> 'q', 's', f.textes -> 'en' ->> 'court', 'r', f.textes -> 'en' ->> 'critere'),
                                        'he', jsonb_build_object('q', f.textes -> 'he' ->> 'q', 's', f.textes -> 'he' ->> 'court', 'r', f.textes -> 'he' ->> 'critere')) end as v)
  select jsonb_strip_nulls(jsonb_build_object(
    'id', f.id, 'k', case f.nature when 'binaire' then 'b' else 'o' end, 'c', f.categorie, 't', t.v,
    'i', (select i.chemin from wm.images i where i.id = f.image_id and i.etat = 'copiee'),
    'o', wm.en_ms(f.ouvre_at), 'f', wm.en_ms(f.ferme_at), 'z', wm.en_ms(f.resolution_at),
    'src', case when f.source_nom is not null or f.source_url is not null then jsonb_strip_nulls(jsonb_build_object('n', f.source_nom, 'u', f.source_url)) end,
    'st', f.cycle, 'g', f.origine,
    'per', case when f.modele_id is not null then jsonb_build_object('m', f.modele_id, 'p', f.periode) end,
    'l', f.lien,
    'p', case when f.nature = 'binaire' then trim_scale(round(coalesce(
            (select l.current_probability from public.market_live_state l where f.moteur and l.market_id = f.id),
            (select c.prix from wm.cat_cotes c where c.market_id = f.id), f.p0), 2)) end,
    'opt', case when f.nature = 'options' then (
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', o.market_id, 'c', o.code,
              't', case when p_langue in ('fr', 'en', 'he') then to_jsonb(coalesce(o.noms ->> p_langue, o.noms ->> 'fr')) else o.noms end,
              'p', trim_scale(round(coalesce((select l.current_probability from public.market_live_state l where f.moteur and l.market_id = o.market_id),
                                             (select c.prix from wm.cat_cotes c where c.market_id = o.market_id), o.p0), 2)),
              'i', (select i.chemin from wm.images i where i.id = o.image_id and i.etat = 'copiee'))) order by o.ordre)
            from wm.fiches_options o where o.fiche_id = f.id) end,
    'sus', case when f.cycle = 'suspendu' then jsonb_strip_nulls(jsonb_build_object('m', f.suspendu_motif, 'j', wm.en_ms(f.suspendu_jusqua))) end,
    'res', case when f.cycle = 'resolu' then jsonb_strip_nulls(jsonb_build_object('o', f.resolu_issue, 'v', f.resolu_valeur, 's', f.resolu_source,
            'pr', f.resolu_preuve, 'at', wm.en_ms(f.resolu_at))) end,
    'ann', case when f.cycle = 'annule' then jsonb_strip_nulls(jsonb_build_object('m', f.annule_motif, 'at', wm.en_ms(f.annule_at))) end,
    'rev', f.rev))
  from t
$$;

-- Le catalogue public : les fiches visibles (ouvertes, suspendues, fermées, à résoudre, et résolues ou annulées depuis moins
-- de 3 jours) ; avec p_depuis (une révision déjà lue), seulement ce qui a changé depuis, et la liste des fiches retirées
-- (x). Une seule lecture de la base, sans réveiller les bots (pas de wm.present()).
create or replace function wm.catalogue(p_depuis bigint default 0, p_langue text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'v', 1, 'rev', coalesce((select r.rev from wm.revisions r where r.nom = 'catalogue'), 0), 't', wm.en_ms(clock_timestamp()),
    'en_ligne', wm.reglage_bool('catalogue.serveur', false),
    'img', 'https://brmwvxncyeypefsgiepf.supabase.co/storage/v1/object/public/marches/',
    'cats', case when coalesce(p_depuis, 0) <= 0 then (select jsonb_agg(jsonb_build_object('id', c.id,
              'n', case when p_langue in ('fr', 'en', 'he') then to_jsonb(c.noms ->> p_langue) else c.noms end, 'ic', c.icone) order by c.ordre)
              from wm.cat_categories c) end,
    'm', coalesce((select jsonb_agg(wm.fiche_vue(f, p_langue) order by f.ferme_at, f.id) from wm.fiches f
                   where not f.masque and f.rev > coalesce(p_depuis, 0)
                     and (f.cycle in ('ouvert', 'suspendu', 'ferme', 'a_resoudre') or coalesce(f.resolu_at, f.annule_at, f.maj_at) > now() - interval '3 days')), '[]'::jsonb),
    'x', coalesce((select jsonb_agg(f.id order by f.id) from wm.fiches f
                   where coalesce(p_depuis, 0) > 0 and f.rev > p_depuis and f.masque), '[]'::jsonb))
$$;

create or replace function public.api_catalogue(p_depuis bigint default 0, p_langue text default null) returns jsonb
language sql set search_path = '' as $$ select wm.catalogue(p_depuis, p_langue) $$;

-- Les crédits des images copiées (page des crédits de l'écran).
create or replace function wm.credits() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('img', 'https://brmwvxncyeypefsgiepf.supabase.co/storage/v1/object/public/marches/',
    'images', coalesce(jsonb_agg(jsonb_build_object('i', i.chemin, 'credit', i.credit) order by i.id), '[]'::jsonb))
  from wm.images i where i.etat = 'copiee'
$$;
create or replace function public.api_credits() returns jsonb
language sql set search_path = '' as $$ select wm.credits() $$;

insert into wm.droits_liste (nom, qui) values ('catalogue', 'visiteur'), ('credits', 'visiteur') on conflict do nothing;

-- ══ 9. Les 60 marchés ouverts ══
-- (texte produit à partir des fiches de recherche du 19 nov. 2026, relues et traduites ; voir docs/DONNEES.md, § 7)
-- La graine des 60 marchés (texte généré) suit dans les migrations catalogue_graine_1 à _6 : des envois de taille
-- raisonnable, une fiche par entrée, relisibles.

select wm.droits();
