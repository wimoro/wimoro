-- Marchés réels, lot 10 (19 nov. 2026) : les 30 modèles des marchés permanents, leurs successeurs, et la cohérence de
-- l'activité simulée avec la réalité (wm-ancres).
--
-- Rien ne change pour un joueur du site en ligne : wm.bots_tick n'est pas modifiée, et la tâche wm-ancres ne touche que les
-- fiches du catalogue (les 27 anciens marchés n'en ont pas). Avant la mise en ligne, elle n'écrit que wm.cat_cotes (le
-- prix servi par api_catalogue) ; après, elle écrit la valeur de référence du marché (public.markets.current_probability),
-- vers laquelle wm.bots_tick rappelle déjà les ancres, et rapproche l'ancre et le prix quand ils s'en écartent trop.
--
--   * wm.modeles : un modèle par marché permanent (famille, actif, pas du seuil, volatilité, gabarits des textes en trois
--     langues, calendrier des réunions ou des publications, options). wm.modele_suivant(fiche) crée le successeur quand
--     l'instance se ferme (ou quand elle est résolue, si le seuil suivant dépend du résultat : CAC 40, IPC, cote de Trump,
--     saisons sportives) : période suivante, seuil calculé sur le cours du moment (un nombre rond), probabilité de départ du
--     modèle. Idempotent (une seule fiche par modèle et par période). Les éditions dont les candidats ou les nommés
--     changent (élections, Premier ministre, Starship, Game Awards, Oscars, Grammys) donnent un brouillon à valider dans le
--     panneau (wm.propositions_jour).
--   * Probabilité du modèle (wm.modele_proba) : prix au-dessus d'un seuil : loi lognormale sans dérive, P = Φ(d2),
--     d2 = (ln(S/K) − σ²T/2) / (σ√T) ; seuil atteint avant une date : 2·(1 − Φ(ln(K/S) / (σ√T))) ; semaine en hausse :
--     Φ(−σ√T/2), puis la même loi depuis le cours de départ ; football : loi de Poisson sur le temps restant, à partir du
--     score et de la minute (λ ajustés sur les probabilités de départ) ; NBA : écart final ~ N(m + μf, σ²f), σ = 12 points.
--     Sans score en direct (aucune clé de sport aujourd'hui), un match garde sa probabilité de départ.

-- ══ 0. Sauvegarde ══
select backup_20261119.sauver_lot('wm.reglages', 'lot10');
select backup_20261119.sauver_lot('cron.job', 'lot10');

-- ══ 1. Réglages ══
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
select x.cle, 'catalogue', x.libelle, x.explication, x.type, x.v::jsonb, x.v::jsonb, x.mn, x.mx, false, false, true, null, x.ordre
from (values
  ('ancres.actif', 'Activité simulée cohérente', 'Toutes les 30 s, la probabilité du modèle (cours réels) devient la valeur de référence des marchés du catalogue ; faux : plus de rappel vers le modèle.', 'booleen', 'true', null::numeric, null::numeric, 310),
  ('ancres.rattrapage', 'Écart de l''ancre', 'Points d''écart entre le modèle et l''ancre des bots au-delà desquels l''ancre fait la moitié du chemin.', 'nombre', '8', 2, 30, 311),
  ('ancres.saut', 'Écart du prix', 'Points d''écart entre le modèle et le prix au-delà desquels le prix fait une partie du chemin à chaque passage.', 'nombre', '15', 5, 40, 312),
  ('ancres.force', 'Part du chemin', 'Part de l''écart rattrapée par le prix à chaque passage quand il dépasse le seuil.', 'nombre', '0.3', 0, 1, 313)
) as x(cle, libelle, explication, type, v, mn, mx, ordre)
on conflict (cle) do nothing;

-- ══ 2. Mathématiques du modèle ══
-- Fonction de répartition de la loi normale (Abramowitz et Stegun 26.2.17, erreur < 7,5e-8).
create or replace function wm.phi(x float8) returns float8
language plpgsql immutable set search_path = '' as $$
declare t float8; d float8; p float8;
begin
  if x is null then return null; end if;
  if x > 12 then return 1; end if;
  if x < -12 then return 0; end if;
  t := 1 / (1 + 0.2316419 * abs(x));
  d := 0.3989422804014327 * exp(-x * x / 2);
  p := d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return case when x >= 0 then 1 - p else p end;
end $$;

-- Sa réciproque (algorithme d'Acklam, erreur relative < 1,2e-9).
create or replace function wm.phi_inv(p float8) returns float8
language plpgsql immutable set search_path = '' as $$
declare q float8; r float8;
  a1 constant float8 := -3.969683028665376e+01; a2 constant float8 := 2.209460984245205e+02; a3 constant float8 := -2.759285104469687e+02;
  a4 constant float8 := 1.383577518672690e+02; a5 constant float8 := -3.066479806614716e+01; a6 constant float8 := 2.506628277459239e+00;
  b1 constant float8 := -5.447609879822406e+01; b2 constant float8 := 1.615858368580409e+02; b3 constant float8 := -1.556989798598866e+02;
  b4 constant float8 := 6.680131188771972e+01; b5 constant float8 := -1.328068155288572e+01;
  c1 constant float8 := -7.784894002430293e-03; c2 constant float8 := -3.223964580411365e-01; c3 constant float8 := -2.400758277161838e+00;
  c4 constant float8 := -2.549732539343734e+00; c5 constant float8 := 4.374664141464968e+00; c6 constant float8 := 2.938163982698783e+00;
  d1 constant float8 := 7.784695709041462e-03; d2 constant float8 := 3.224671290700398e-01; d3 constant float8 := 2.445134137142996e+00; d4 constant float8 := 3.754408661907416e+00;
begin
  if p is null or p <= 0 or p >= 1 then return null; end if;
  if p < 0.02425 then
    q := sqrt(-2 * ln(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  elsif p > 1 - 0.02425 then
    q := sqrt(-2 * ln(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  end if;
  q := p - 0.5; r := q * q;
  return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
end $$;

-- P(S_T > K), loi lognormale sans dérive ; T en années.
create or replace function wm.mod_lognormal(p_s float8, p_k float8, p_sigma float8, p_t float8) returns float8
language sql immutable set search_path = '' as $$
  select case when p_s is null or p_k is null or p_s <= 0 or p_k <= 0 or p_sigma is null or p_sigma <= 0 then null
              when coalesce(p_t, 0) <= 0 then case when p_s > p_k then 1 else 0 end
              else wm.phi((ln(p_s / p_k) - p_sigma * p_sigma * p_t / 2) / (p_sigma * sqrt(p_t))) end
$$;

-- P(le cours touche K avant T), K au-dessus du cours (principe de réflexion, sans dérive).
create or replace function wm.mod_barriere(p_s float8, p_k float8, p_sigma float8, p_t float8) returns float8
language sql immutable set search_path = '' as $$
  select case when p_s is null or p_k is null or p_s <= 0 or p_k <= 0 or p_sigma is null or p_sigma <= 0 then null
              when p_s >= p_k then 1
              when coalesce(p_t, 0) <= 0 then 0
              else least(1, 2 * (1 - wm.phi(ln(p_k / p_s) / (p_sigma * sqrt(p_t))))) end
$$;

-- Football : probabilités 1 / N / 2 au score (a, b), λ des deux équipes sur le temps restant (fraction r du match).
create or replace function wm.mod_poisson(p_lh float8, p_la float8, p_a integer, p_b integer, p_r float8) returns float8[]
language plpgsql immutable set search_path = '' as $$
declare lh float8 := greatest(p_lh * p_r, 0); la float8 := greatest(p_la * p_r, 0); ph float8[] := '{}'; pa float8[] := '{}'; i integer; j integer;
  v1 float8 := 0; vn float8 := 0; v2 float8 := 0; f float8;
begin
  for i in 0..10 loop
    f := 1; for j in 1..i loop f := f * j; end loop;
    ph := ph || (exp(-lh) * power(lh, i) / f);
    pa := pa || (exp(-la) * power(la, i) / f);
  end loop;
  for i in 0..10 loop for j in 0..10 loop
    if p_a + i > p_b + j then v1 := v1 + ph[i + 1] * pa[j + 1];
    elsif p_a + i = p_b + j then vn := vn + ph[i + 1] * pa[j + 1];
    else v2 := v2 + ph[i + 1] * pa[j + 1]; end if;
  end loop; end loop;
  return array[v1, vn, v2];
end $$;

-- NBA : P(victoire à domicile), écart m à la fraction f du match restant, p0 la probabilité de départ du domicile.
create or replace function wm.mod_nba(p_p0 float8, p_m float8, p_f float8) returns float8
language sql immutable set search_path = '' as $$
  select case when coalesce(p_f, 0) <= 0 then case when p_m > 0 then 1 when p_m < 0 then 0 else 0.5 end
              else wm.phi((coalesce(p_m, 0) + 12 * wm.phi_inv(least(greatest(p_p0, 0.01), 0.99)) * p_f) / (12 * sqrt(p_f))) end
$$;

-- ══ 3. Les modèles des marchés permanents ══
create table if not exists wm.modeles (
  id text primary key,
  famille text not null check (famille in ('prix_seuil', 'cloture_seuil', 'reference_bce', 'prix_or', 'prix_hausse', 'hausse_cloture', 'prix_touche',
                                           'cloture_annuelle', 'reunion', 'indicateur', 'classement', 'seuil_manuel', 'saison', 'edition')),
  categorie text not null references wm.cat_categories (id),
  actif boolean not null default true,
  ouverture text not null default 'fermeture' check (ouverture in ('fermeture', 'resolution')),   -- quand naît le successeur
  suite text not null default 'auto' check (suite in ('auto', 'brouillon')),
  regle jsonb not null default '{}'::jsonb,           -- actif, pas du seuil, volatilité, marge, heures…
  gabarit jsonb not null,                             -- {fr: {q, court, critere}, en, he} avec repères {K} {D} {d}…
  calendrier jsonb,                                   -- réunions ou publications à venir
  options jsonb,                                      -- [{code, noms, p0, image}]
  image jsonb,
  source jsonb,
  moteur_cat text,
  ordre smallint not null default 0,
  dernier_id text,
  maj_at timestamptz not null default now()
);
alter table wm.modeles enable row level security;
revoke all on wm.modeles from public, anon, authenticated;

-- Brouillons de marchés (lot 11 : propositions du jour ; ici : successeurs des éditions), validés dans le panneau.
create table if not exists wm.propositions_jour (
  id bigint generated always as identity primary key,
  jour date not null default ((now() at time zone 'UTC')::date),
  origine text not null check (origine in ('ia', 'gabarit', 'sport', 'tendance', 'admin', 'successeur')),
  etat text not null default 'en_attente' check (etat in ('auto', 'en_attente', 'validee', 'refusee', 'ouverte', 'expiree')),
  cle text unique,                                    -- sujet, match ou modèle : un seul brouillon par sujet
  brouillon jsonb not null,                           -- fiche complète (le format de wm.fiche_creer)
  sources jsonb not null default '[]'::jsonb,
  score numeric,
  ouvre_at timestamptz,
  expire_at timestamptz,
  decide_par uuid,
  decide_at timestamptz,
  motif text,
  fiche_id text,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now()
);
alter table wm.propositions_jour enable row level security;
revoke all on wm.propositions_jour from public, anon, authenticated;
create index if not exists propositions_jour_etat on wm.propositions_jour (etat, jour desc);

-- ══ 4. Mise en forme des seuils et des dates dans les trois langues ══
create or replace function wm.mod_nombre(p_v numeric, p_dec integer, p_langue text) returns text
language plpgsql immutable set search_path = '' as $$
declare s text := to_char(round(p_v, p_dec), 'FM999,999,999,990' || case when p_dec > 0 then '.' || repeat('0', p_dec) else '' end);
begin
  if p_langue = 'fr' then s := replace(replace(replace(s, ',', '~'), '.', ','), '~', ' '); end if;
  return s;
end $$;

-- Un montant : « 65 000 $ » (fr), « $65,000 » (en), « 65,000 דולר » (he) ; compact : « 65 k$ », « $65K », « 65K$ ».
create or replace function wm.mod_montant(p_v numeric, p_dec integer, p_langue text, p_compact boolean default false) returns text
language plpgsql immutable set search_path = '' as $$
declare n text;
begin
  if p_compact and p_v >= 1000 then
    n := wm.mod_nombre(p_v / 1000, case when p_v % 1000 = 0 then 0 else 1 end, p_langue);
    return case p_langue when 'fr' then n || ' k$' when 'en' then '$' || n || 'K' else n || 'K$' end;
  end if;
  n := wm.mod_nombre(p_v, p_dec, p_langue);
  return case p_langue when 'fr' then n || ' $' when 'en' then '$' || n else case when p_compact then n || '$' else n || ' דולר' end end;
end $$;

-- Une date : longue (« 31 janvier 2027 », « January 31, 2027 », « 31 בינואר 2027 »), courte (« 31/01 », « Jan 31 »,
-- « 31.1 »), numérique (« 31/01/2027 »), mois (« janvier 2027 », « January 2027 », « בינואר 2027 »), mois court.
create or replace function wm.mod_date(p_j date, p_langue text, p_style text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  m integer := extract(month from p_j); d integer := extract(day from p_j); y integer := extract(year from p_j);
  fr text[] := array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  frc text[] := array['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  en text[] := array['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  he text[] := array['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
begin
  if p_j is null then return null; end if;
  if p_style = 'long' then
    return case p_langue when 'fr' then case when d = 1 then '1er' else d::text end || ' ' || fr[m] || ' ' || y
                         when 'en' then en[m] || ' ' || d || ', ' || y else d || ' ב' || he[m] || ' ' || y end;
  elsif p_style = 'court' then
    return case p_langue when 'fr' then lpad(d::text, 2, '0') || '/' || lpad(m::text, 2, '0') when 'en' then left(en[m], 3) || ' ' || d else d || '.' || m end;
  elsif p_style = 'num' then
    return case p_langue when 'en' then lpad(m::text, 2, '0') || '/' || lpad(d::text, 2, '0') || '/' || y else lpad(d::text, 2, '0') || '/' || lpad(m::text, 2, '0') || '/' || y end;
  elsif p_style = 'mois' then
    return case p_langue when 'fr' then fr[m] || ' ' || y when 'en' then en[m] || ' ' || y else 'ב' || he[m] || ' ' || y end;
  elsif p_style = 'mois_court' then
    return case p_langue when 'fr' then frc[m] when 'en' then left(en[m], 3) else he[m] end;
  elsif p_style = 'jm' then                            -- jour et mois, sans l'année (« 30 novembre », « November 30 », « 30 בנובמבר »)
    return case p_langue when 'fr' then case when d = 1 then '1er' else d::text end || ' ' || fr[m] when 'en' then en[m] || ' ' || d else d || ' ב' || he[m] end;
  end if;
  return p_j::text;
end $$;

-- Remplit les repères d'un gabarit ({K}, {D}…) avec les valeurs d'une langue.
create or replace function wm.mod_remplir(p_t text, p_vars jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare k text; v text := p_t;
begin
  if v is null or p_vars is null then return v; end if;
  for k in select jsonb_object_keys(p_vars) loop v := replace(v, '{' || k || '}', coalesce(p_vars ->> k, '')); end loop;
  return v;
end $$;

create or replace function wm.mod_textes(p_gabarit jsonb, p_vars jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_object_agg(l, jsonb_build_object(
    'q', wm.mod_remplir(p_gabarit -> l ->> 'q', p_vars -> l), 'court', wm.mod_remplir(p_gabarit -> l ->> 'court', p_vars -> l),
    'critere', wm.mod_remplir(p_gabarit -> l ->> 'critere', p_vars -> l)))
  from unnest(array['fr', 'en', 'he']) l
$$;

-- ══ 5. Calendriers des places ══
create or replace function wm.mod_jour_ouvre(p_place text, p_j date) returns boolean
language sql stable security definer set search_path = '' as $$
  select extract(isodow from p_j) < 6
     and not exists (select 1 from wm.px_feries f where f.marche = p_place and f.jour = p_j and f.ferme_a is null)
$$;

-- Le dernier jour de séance jusqu'à une date (fin de mois, 31 décembre).
create or replace function wm.mod_dernier_ouvre(p_place text, p_fin date) returns date
language sql stable security definer set search_path = '' as $$
  select max(j)::date from generate_series(p_fin - 10, p_fin, interval '1 day') j where wm.mod_jour_ouvre(p_place, j::date)
$$;

-- Clôture et ouverture d'une séance (heure locale de la place, demi-séances comprises).
create or replace function wm.mod_cloture(p_place text, p_j date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (p_j + coalesce((select f.ferme_a from wm.px_feries f where f.marche = p_place and f.jour = p_j), (m.seances -> -1 ->> 1)::time)) at time zone m.fuseau
  from wm.px_marches m where m.id = p_place
$$;
create or replace function wm.mod_ouverture(p_place text, p_j date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (p_j + (m.seances -> 0 ->> 0)::time) at time zone m.fuseau from wm.px_marches m where m.id = p_place
$$;

-- ══ 6. Probabilité du modèle d'une fiche ══
-- Rend {p} (binaire, en %) ou {opts: {marché: p}} (options), avec le détail du calcul ; rien sans modèle ou sans cours frais.
create or replace function wm.modele_proba(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f wm.fiches; r jsonb; mo wm.modeles; d wm.px_dernier; v_s float8; v_k float8; v_sig float8; v_t float8; v_p float8; v_base float8;
  v_fin timestamptz; v_ref float8; m wm.sport_matchs; v_lh float8; v_la float8; v_r float8; v_a integer := 0; v_b integer := 0; x float8[];
begin
  select * into f from wm.fiches x where x.id = p_id;
  if not found then return null; end if;
  r := f.regle;
  if r ->> 'type' = 'match' then
    select * into m from wm.sport_matchs s where s.id = any (array['oldb:' || coalesce(r ->> 'openligadb', '-'), 'fd:' || coalesce(r ->> 'fd', '-'), 'bdl:' || coalesce(r ->> 'bdl', '-')])
    order by s.maj_at desc limit 1;
    if not found or m.statut <> 'en_cours' or m.minute is null then return null; end if;   -- pas de score en direct : la probabilité de départ reste
    if r ->> 'sport' = 'foot' and wm.num(r ->> 'lh') is not null then
      v_lh := wm.num(r ->> 'lh'); v_la := wm.num(r ->> 'la');
      v_a := coalesce(m.score_dom, 0); v_b := coalesce(m.score_ext, 0); v_r := greatest(0, (94 - least(m.minute, 94))::float8 / 94);
      x := wm.mod_poisson(v_lh, v_la, v_a, v_b, v_r);
      return jsonb_build_object('opts', jsonb_build_object(f.id || '-home', 100 * x[1], f.id || '-draw', 100 * x[2], f.id || '-away', 100 * x[3]),
        'detail', jsonb_build_object('modele', 'poisson', 'lh', v_lh, 'la', v_la, 'score', jsonb_build_array(v_a, v_b), 'minute', m.minute));
    elsif r ->> 'sport' = 'nba' then
      v_p := (select o.p0 from wm.fiches_options o where o.market_id = f.id || '-home') / 100;
      v_p := wm.mod_nba(v_p, coalesce(m.score_dom, 0) - coalesce(m.score_ext, 0), greatest(0, (48 - least(m.minute, 48))::float8 / 48));
      return jsonb_build_object('opts', jsonb_build_object(f.id || '-home', 100 * v_p, f.id || '-away', 100 * (1 - v_p)),
        'detail', jsonb_build_object('modele', 'nba', 'ecart', coalesce(m.score_dom, 0) - coalesce(m.score_ext, 0), 'minute', m.minute));
    end if;
    return null;
  end if;
  if r ->> 'type' = 'manuel' and r -> 'indicatif' is not null then r := (r -> 'indicatif') || jsonb_build_object('type', 'prix'); end if;
  if coalesce(r ->> 'type', '') not in ('prix', 'cloture', 'reference_bce', 'hausse', 'hausse_cloture', 'touche') then return null; end if;
  select * into mo from wm.modeles x where x.id = f.modele_id;
  v_sig := coalesce(wm.num(mo.regle ->> 'sigma'), wm.num(r ->> 'sigma'));
  if v_sig is null then return null; end if;
  v_base := case when r ->> 'actif' in ('btc', 'eth', 'sol', 'xrp', 'bnb', 'doge', 'ada', 'avax', 'link', 'ltc') then 365 else 252 end;
  select * into d from wm.px_dernier x where x.actif = r ->> 'actif';
  if not found or now() - d.t > (case when v_base = 365 then interval '15 minutes' else interval '4 days' end) then return null; end if;   -- cours trop vieux : rien
  v_s := d.prix;
  v_fin := coalesce(wm.cat_date(r ->> 'au'), wm.cat_date(r ->> 'cloture_at'), wm.cat_date(r ->> 'fin'), wm.cat_date(r ->> 'jusqua'),
                    ((r ->> 'jour')::date + time '16:00') at time zone 'UTC', f.resolution_at);
  v_t := greatest(extract(epoch from v_fin - now()), 0) / 86400 / 365;      -- années civiles ; σ annuelle (crypto : 365 j, places : rapportée au calendrier)
  if r ->> 'type' in ('prix', 'cloture', 'reference_bce') then
    v_k := wm.num(r ->> 'seuil'); v_p := wm.mod_lognormal(v_s, v_k, v_sig, v_t);
  elsif r ->> 'type' = 'touche' then
    v_k := wm.num(r ->> 'seuil'); v_p := wm.mod_barriere(v_s, v_k, v_sig, v_t);
  else
    v_ref := wm.num(r -> 'ref' ->> 'v');
    if v_ref is null then
      v_p := wm.phi(-v_sig * sqrt(greatest(extract(epoch from v_fin - greatest(now(), coalesce(wm.cat_date(r ->> 'debut'), wm.cat_date(r ->> 'ref_cloture_at'), now()))), 0) / 86400 / 365) / 2);
    else
      v_p := wm.mod_lognormal(v_s, v_ref, v_sig, v_t);
    end if;
  end if;
  if v_p is null then return null; end if;
  return jsonb_build_object('p', 100 * v_p, 'detail', jsonb_build_object('modele', case when r ->> 'type' = 'touche' then 'barriere' else 'lognormal' end,
    'cours', v_s, 'seuil', coalesce(v_k, v_ref), 'sigma', v_sig, 'jours', round((v_t * 365)::numeric, 2), 'source', d.source, 'cours_t', wm.en_ms(d.t)));
end $$;

-- ══ 7. La tâche wm-ancres (toutes les 30 s) ══
-- Avant la mise en ligne : le prix servi suit le modèle. Après : le modèle devient la valeur de référence du marché ; l'ancre
-- des bots fait la moitié du chemin au-delà de ancres.rattrapage points ; le prix en fait une part (ancres.force) au-delà de
-- ancres.saut points. Bornes 3 à 97. Les marchés sans modèle (actualité, joueurs) et les 27 anciens ne sont pas touchés.
create or replace function wm.ancres_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f wm.fiches; v jsonb; k text; v_p numeric; l public.market_live_state; v_new numeric; v_ids text[] := '{}'; n integer := 0;
  v_ratt numeric := wm.reglage_num('ancres.rattrapage', 8); v_saut numeric := wm.reglage_num('ancres.saut', 15); v_force numeric := wm.reglage_num('ancres.force', 0.3);
  v_present boolean := coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false);
begin
  if not wm.reglage_bool('ancres.actif', true) then return jsonb_build_object('actif', false); end if;
  if not pg_try_advisory_xact_lock(hashtext('wm.ancres_tick')) then return jsonb_build_object('occupe', true); end if;
  for f in select * from wm.fiches x where x.cycle in ('ouvert', 'suspendu') and not x.masque
             and (x.regle ->> 'type' in ('prix', 'cloture', 'reference_bce', 'hausse', 'hausse_cloture', 'touche', 'match') or x.regle -> 'indicatif' is not null)
           order by x.id loop
    v := wm.modele_proba(f.id);
    if v is null then continue; end if;
    for k, v_p in select x.key, (x.value #>> '{}')::numeric from jsonb_each(case when v ? 'opts' then v -> 'opts' else jsonb_build_object(f.id, v -> 'p') end) x loop
      v_p := round(least(97, greatest(3, v_p)), 6);
      update wm.cat_cotes set modele = v_p, detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('m', v -> 'detail'), modele_at = now(),
        prix = case when f.moteur then prix else v_p end, maj_at = now()
      where market_id = k;
      if f.moteur then
        update public.markets set current_probability = round(v_p, 2) where id = k and coalesce(status, 'open') = 'open';
        select * into l from public.market_live_state x where x.market_id = k for update;
        if found then
          if abs(v_p - coalesce(l.anchor_probability, l.current_probability)) > v_ratt then
            update public.market_live_state set anchor_probability = round(greatest(5, least(95, coalesce(anchor_probability, current_probability) + (v_p - coalesce(anchor_probability, current_probability)) / 2)), 6)
            where market_id = k;
          end if;
          if abs(v_p - l.current_probability) > v_saut and f.cycle = 'ouvert' then
            v_new := round(greatest(3, least(97, l.current_probability + (v_p - l.current_probability) * v_force)), 6);
            update public.market_live_state set current_probability = v_new, price_history = wm.ph_push(price_history, round(v_new, 2)), seq = seq + 1, updated_at = now()
            where market_id = k;
            perform wm.group_rebalance(k, (v_new - l.current_probability)::float8);
            v_ids := v_ids || wm.fratrie(k);
          end if;
        end if;
      end if;
      n := n + 1;
    end loop;
  end loop;
  if v_present and array_length(v_ids, 1) is not null then perform wm.tick_emit(array(select distinct x from unnest(v_ids) x)); end if;
  return jsonb_build_object('marches', n, 'deplaces', coalesce(array_length(v_ids, 1), 0));
end $$;

-- ══ 8. Successeurs ══
-- Le seuil rond le plus proche du cours : multiple du pas (le pas dépend du niveau : [[plafond, pas], …, [null, pas]]).
create or replace function wm.mod_seuil(p_s numeric, p_pas jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare e jsonb; v_pas numeric;
begin
  for e in select x from jsonb_array_elements(p_pas) x loop
    if e ->> 0 is null or p_s < (e ->> 0)::numeric then v_pas := (e ->> 1)::numeric; exit; end if;
  end loop;
  return round(p_s / v_pas) * v_pas;
end $$;

-- Crée le successeur d'une fiche permanente (ou son brouillon). Rien si ce n'est pas le moment (règle « ouverture » du
-- modèle), si le successeur existe déjà, ou si le cours nécessaire manque : la tâche réessaie (wm.modeles_rattraper).
create or replace function wm.modele_suivant(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f wm.fiches; mo wm.modeles; r jsonb; v_per text; v_mois date; v_j date; v_au timestamptz; v_ferme timestamptz; v_res timestamptz; v_s numeric; v_k numeric;
  v_dec integer; v_vars jsonb := '{}'::jsonb; v_regle jsonb; v_p0 numeric; v_fiche jsonb; v_cal jsonb; v_id text; l text; v_opts jsonb; v_debut timestamptz;
  v_fin timestamptz; v_premier date; v_dernier date; v_ref_j date; v_val numeric; v_sig numeric; v_t float8; v_annee integer;
begin
  select * into f from wm.fiches x where x.id = p_id;
  if not found or f.modele_id is null then return null; end if;
  select * into mo from wm.modeles x where x.id = f.modele_id and x.actif;
  if not found then return null; end if;
  if f.cycle in ('ouvert', 'suspendu') or (mo.ouverture = 'resolution' and f.cycle <> 'resolu') then return null; end if;
  r := mo.regle; v_dec := coalesce((r ->> 'dec')::integer, 0); v_sig := wm.num(r ->> 'sigma');

  -- période suivante
  if mo.famille in ('prix_hausse', 'hausse_cloture') then
    v_debut := (to_date(f.periode, 'IYYY-"W"IW') + 7)::timestamp at time zone 'UTC';
    v_per := to_char(v_debut at time zone 'UTC', 'IYYY-"W"IW');
  elsif mo.famille = 'cloture_annuelle' then
    v_per := (f.periode::integer + 1)::text;
  elsif mo.famille = 'saison' then                      -- « 2026-27 » → « 2027-28 » ; « 2027 » → « 2028 »
    v_per := case when f.periode ~ '^\d{4}-\d{2}$' then (left(f.periode, 4)::integer + 1)::text || '-' || lpad(((right(f.periode, 2)::integer + 1) % 100)::text, 2, '0')
                  when f.periode ~ '^\d{4}$' then (f.periode::integer + 1)::text else f.periode || '-suite' end;
  elsif mo.famille = 'edition' then                     -- l'édition suivante : l'année plus le pas du modèle (5 ans pour une présidentielle…)
    v_per := case when f.periode ~ '^\d{4}' then (left(f.periode, 4)::integer + coalesce(wm.num(r ->> 'pas_annees'), 1)::integer)::text else f.periode || '-suite' end;
  elsif mo.famille in ('reunion', 'indicateur') then
    select e into v_cal from jsonb_array_elements(mo.calendrier) e where e ->> 'periode' > f.periode order by e ->> 'periode' limit 1;
    if v_cal is null then return jsonb_build_object('attente', 'calendrier_epuise'); end if;
    v_per := v_cal ->> 'periode';
  elsif mo.famille = 'seuil_manuel' then
    v_mois := (to_date(f.periode || '-01', 'YYYY-MM-DD') + interval '1 month')::date; v_per := to_char(v_mois, 'YYYY-MM');
  else
    v_mois := (to_date(f.periode || '-01', 'YYYY-MM-DD') + interval '1 month')::date; v_per := to_char(v_mois, 'YYYY-MM');
  end if;
  if exists (select 1 from wm.fiches x where x.modele_id = mo.id and x.periode = v_per)
     or exists (select 1 from wm.propositions_jour p where p.cle = 'modele:' || mo.id || ':' || v_per) then
    return jsonb_build_object('deja', v_per);
  end if;
  v_id := regexp_replace(left(mo.id, 24), '-+$', '') || '-' || lower(v_per);

  if mo.famille in ('prix_seuil', 'cloture_seuil', 'reference_bce', 'prix_or', 'prix_touche') then
    select d.prix into v_s from wm.px_dernier d where d.actif = r ->> 'actif' and d.t > now() - interval '4 days';
    if v_s is null then return jsonb_build_object('attente', 'cours_absent'); end if;
    v_k := wm.mod_seuil(v_s * coalesce(wm.num(r ->> 'facteur'), 1), r -> 'pas');
    v_dernier := (v_mois + interval '1 month' - interval '1 day')::date;
    if mo.famille = 'prix_seuil' then
      v_j := v_dernier; v_au := (v_j + 1)::timestamp at time zone 'UTC'; v_ferme := v_au - interval '1 day 1 minute'; v_res := v_au + interval '5 minutes';
      v_regle := jsonb_build_object('type', 'prix', 'actif', r ->> 'actif', 'op', '>', 'seuil', v_k, 'au', v_au, 'marge', coalesce(wm.num(r ->> 'marge'), 0.004));
    elsif mo.famille = 'cloture_seuil' then
      v_j := wm.mod_dernier_ouvre(r ->> 'place', v_dernier); v_au := wm.mod_cloture(r ->> 'place', v_j);
      v_ferme := (v_j - 1)::timestamp at time zone 'UTC' + interval '23 hours 59 minutes'; v_res := v_au + interval '30 minutes';
      v_regle := jsonb_build_object('type', 'cloture', 'actif', r ->> 'actif', 'op', '>', 'seuil', v_k, 'jour', v_j, 'cloture_at', v_au, 'place', r ->> 'place', 'marge', coalesce(wm.num(r ->> 'marge'), 0.003));
    elsif mo.famille = 'reference_bce' then
      v_j := wm.mod_dernier_ouvre('EURONEXT', v_dernier); v_au := (v_j + time '16:00') at time zone 'UTC';
      v_ferme := (v_j - 1)::timestamp at time zone 'UTC' + interval '23 hours 59 minutes'; v_res := v_au;
      v_regle := jsonb_build_object('type', 'reference_bce', 'actif', r ->> 'actif', 'op', '>', 'seuil', v_k, 'jour', v_j, 'marge', coalesce(wm.num(r ->> 'marge'), 0.0005));
    elsif mo.famille = 'prix_or' then
      select max(j)::date into v_j from generate_series(v_dernier - 6, v_dernier, interval '1 day') j where extract(isodow from j) < 6;
      v_au := (v_j + time '15:00') at time zone 'Europe/London'; v_ferme := (v_j - 1)::timestamp at time zone 'UTC' + interval '23 hours 59 minutes';
      v_res := (v_j + 1)::timestamp at time zone 'UTC' + interval '12 hours';
      v_regle := jsonb_build_object('type', 'manuel', 'indicatif', jsonb_build_object('actif', r ->> 'actif', 'op', '>', 'seuil', v_k, 'au', v_au));
    else                                                -- prix_touche : fenêtre du mois
      v_debut := v_mois::timestamp at time zone 'UTC'; v_fin := (v_dernier + 1)::timestamp at time zone 'UTC'; v_j := v_dernier;
      v_ferme := v_fin - interval '1 day 1 minute'; v_res := v_fin + interval '5 minutes'; v_au := v_fin;
      v_regle := jsonb_build_object('type', 'touche', 'actif', r ->> 'actif', 'seuil', v_k, 'de', v_debut, 'jusqua', v_fin, 'marge', coalesce(wm.num(r ->> 'marge'), 0.01));
    end if;
    foreach l in array array['fr', 'en', 'he'] loop
      v_vars := v_vars || jsonb_build_object(l, jsonb_build_object(
        'K', wm.mod_montant(v_k, v_dec, l), 'K2', wm.mod_montant(v_k, greatest(v_dec, 2), l), 'Kc', wm.mod_montant(v_k, v_dec, l, true),
        'Kn', wm.mod_nombre(v_k, v_dec, l), 'Kn4', wm.mod_nombre(v_k, 4, l),
        'D', wm.mod_date(v_j, l, 'long'), 'd', wm.mod_date(v_j, l, 'court'), 'Dn', wm.mod_date(v_j, l, 'num'), 'D1', wm.mod_date(v_j + 1, l, 'long'),
        'M', wm.mod_date(v_mois, l, 'mois'), 'Mc', wm.mod_date(v_mois, l, 'mois_court'), 'De', wm.mod_date(v_mois, l, 'long'), 'Y', extract(year from v_j)::text));
    end loop;
    v_t := greatest(extract(epoch from v_au - now()), 0) / 86400 / 365;
    v_p0 := 100 * case when mo.famille = 'prix_touche' then wm.mod_barriere(v_s, v_k, v_sig, v_t) else wm.mod_lognormal(v_s, v_k, v_sig, v_t) end;
  elsif mo.famille in ('prix_hausse', 'hausse_cloture') then
    v_fin := v_debut + interval '7 days';
    if mo.famille = 'prix_hausse' then
      v_ferme := v_debut; v_res := v_fin + interval '5 minutes';
      v_regle := jsonb_build_object('type', 'hausse', 'actif', r ->> 'actif', 'debut', v_debut, 'fin', v_fin, 'marge', coalesce(wm.num(r ->> 'marge'), 0.002));
      v_premier := (v_debut at time zone 'UTC')::date; v_dernier := v_premier + 6;
    else
      select min(j)::date, max(j)::date into v_premier, v_dernier from generate_series((v_debut at time zone 'UTC')::date, (v_debut at time zone 'UTC')::date + 4, interval '1 day') j
      where wm.mod_jour_ouvre(r ->> 'place', j::date);
      if v_premier is null then return jsonb_build_object('attente', 'semaine_sans_seance'); end if;
      select max(j)::date into v_ref_j from generate_series(v_premier - 10, v_premier - 1, interval '1 day') j where wm.mod_jour_ouvre(r ->> 'place', j::date);
      v_ferme := wm.mod_ouverture(r ->> 'place', v_premier); v_au := wm.mod_cloture(r ->> 'place', v_dernier); v_res := v_au + interval '30 minutes';
      v_regle := jsonb_build_object('type', 'hausse_cloture', 'actif', r ->> 'actif', 'ref_jour', v_ref_j, 'jour', v_dernier, 'place', r ->> 'place',
        'ref_cloture_at', wm.mod_cloture(r ->> 'place', v_ref_j), 'cloture_at', v_au, 'marge', coalesce(wm.num(r ->> 'marge'), 0.0005));
    end if;
    foreach l in array array['fr', 'en', 'he'] loop
      v_vars := v_vars || jsonb_build_object(l, jsonb_build_object('W1', wm.mod_date(v_premier, l, 'jm'), 'W1L', wm.mod_date(v_premier, l, 'long'),
        'W2', wm.mod_date(v_dernier, l, 'long'), 'w', wm.mod_date(v_premier, l, 'court'), 'J', wm.mod_date(v_dernier, l, 'long'),
        'R', wm.mod_date(coalesce(v_ref_j, v_premier - 1), l, 'long'), 'F', wm.mod_date((v_fin at time zone 'UTC')::date, l, 'long')));
    end loop;
    v_p0 := 100 * wm.phi(-coalesce(v_sig, 0.3) * sqrt(7.0 / 365) / 2);
  elsif mo.famille in ('cloture_annuelle', 'indicateur', 'seuil_manuel') then
    v_val := wm.num(f.resolu_valeur ->> 'v');
    if v_val is null then                                -- valeur de l'instance absente : brouillon pour l'équipe
      insert into wm.propositions_jour (origine, etat, cle, brouillon, motif)
      values ('successeur', 'en_attente', 'modele:' || mo.id || ':' || v_per, jsonb_build_object('modele_id', mo.id, 'periode', v_per, 'id', v_id, 'predecesseur', f.id), 'valeur_absente')
      on conflict (cle) do nothing;
      return jsonb_build_object('brouillon', v_per, 'raison', 'valeur_absente');
    end if;
    if mo.famille = 'cloture_annuelle' then
      v_annee := v_per::integer; v_k := v_val;
      v_j := wm.mod_dernier_ouvre(r ->> 'place', make_date(v_annee, 12, 31)); v_au := wm.mod_cloture(r ->> 'place', v_j);
      v_ferme := (v_j - 1)::timestamp at time zone 'UTC' + interval '23 hours 59 minutes'; v_res := v_au + interval '1 hour';
      v_regle := jsonb_build_object('type', 'cloture', 'actif', r ->> 'actif', 'op', '>', 'seuil', v_k, 'jour', v_j, 'cloture_at', v_au, 'place', r ->> 'place', 'marge', coalesce(wm.num(r ->> 'marge'), 0.002));
      v_p0 := 100 * coalesce(wm.mod_lognormal(v_k::float8, v_k::float8, v_sig, greatest(extract(epoch from v_au - now()), 0) / 86400 / 365), 0.5);
    elsif mo.famille = 'indicateur' then
      v_k := round(v_val, 1); v_j := (v_cal ->> 'publication')::date;
      v_ferme := wm.cat_date(v_cal ->> 'ferme_at'); v_res := wm.cat_date(v_cal ->> 'resolution_at');
      v_regle := jsonb_build_object('type', 'manuel', 'seuil', v_k, 'unite', '%');
      v_mois := to_date(v_per || '-01', 'YYYY-MM-DD'); v_p0 := 50;
    else
      v_k := round(v_val); v_j := (v_mois + interval '1 month' - interval '1 day')::date;
      v_ferme := v_j::timestamp at time zone 'UTC' + interval '5 hours'; v_res := (v_j + 1)::timestamp at time zone 'UTC' + interval '12 hours';
      v_regle := jsonb_build_object('type', 'manuel', 'seuil', v_k, 'unite', '%'); v_p0 := 50;
    end if;
    foreach l in array array['fr', 'en', 'he'] loop
      v_vars := v_vars || jsonb_build_object(l, jsonb_build_object('Kn', wm.mod_nombre(v_k, case when mo.famille = 'cloture_annuelle' then 2 else 1 end, l),
        'Kp', wm.mod_nombre(v_k, case when mo.famille = 'seuil_manuel' then 0 else 1 end, l) || case when l = 'fr' then ' %' else '%' end,
        'Kp1', wm.mod_nombre(v_k, 1, l) || case when l = 'fr' then ' %' else '%' end,
        'D', wm.mod_date(v_j, l, 'long'), 'd', wm.mod_date(v_j, l, 'court'), 'Y', coalesce(v_annee, extract(year from v_j))::text,
        'Yp', (coalesce(v_annee, extract(year from v_j)) - 1)::text,
        'Dp', wm.mod_date((wm.cat_date(f.regle ->> 'cloture_at') at time zone 'UTC')::date, l, 'long'),
        'R', wm.mod_date(coalesce(v_mois, v_j), l, 'mois'), 'Rc', wm.mod_date(coalesce(v_mois, v_j), l, 'mois_court'), 'E', wm.mod_date(v_j, l, 'long')));
    end loop;
  elsif mo.famille = 'reunion' then
    v_j := (v_cal ->> 'jour')::date; v_ferme := wm.cat_date(v_cal ->> 'ferme_at'); v_res := wm.cat_date(v_cal ->> 'resolution_at');
    v_regle := jsonb_build_object('type', 'manuel');
    foreach l in array array['fr', 'en', 'he'] loop
      v_vars := v_vars || jsonb_build_object(l, jsonb_build_object('E', wm.mod_date(v_j, l, 'long'), 'e', wm.mod_date(v_j, l, 'court')));
    end loop;
  elsif mo.famille = 'classement' then
    v_dernier := (v_mois + interval '1 month' - interval '1 day')::date;
    v_j := case when r ->> 'place' is not null then wm.mod_dernier_ouvre(r ->> 'place', v_dernier) else v_dernier end;
    v_ferme := v_j::timestamp at time zone 'UTC' + coalesce((r ->> 'ferme_h')::interval, interval '12 hours');
    v_res := v_j::timestamp at time zone 'UTC' + coalesce((r ->> 'resultat_h')::interval, interval '36 hours');
    v_regle := jsonb_build_object('type', 'manuel');
    foreach l in array array['fr', 'en', 'he'] loop
      v_vars := v_vars || jsonb_build_object(l, jsonb_build_object('D', wm.mod_date(v_j, l, 'long'), 'd', wm.mod_date(v_j, l, 'court')));
    end loop;
    -- options et probabilités de départ : celles de l'instance qui se termine, à son dernier prix
    select jsonb_agg(jsonb_build_object('code', o.code, 'noms', o.noms, 'p0', greatest(1, round(coalesce(
             (select x.current_probability from public.market_live_state x where f.moteur and x.market_id = o.market_id),
             (select c.prix from wm.cat_cotes c where c.market_id = o.market_id), o.p0), 1)),
             'image', (select jsonb_build_object('fichier', i.fichier, 'genre', i.genre) from wm.images i where i.id = o.image_id)) order by o.ordre)
      into v_opts from wm.fiches_options o where o.fiche_id = f.id;
  else                                                  -- saison (successeur ouvert) ou édition (brouillon) : dates décalées, à vérifier
    v_annee := left(v_per, 4)::integer - left(f.periode, 4)::integer;
    v_ferme := f.ferme_at + make_interval(years => v_annee) - interval '14 days'; v_res := f.resolution_at + make_interval(years => v_annee) - interval '14 days';
    v_regle := f.regle;
    foreach l in array array['fr', 'en', 'he'] loop
      v_vars := v_vars || jsonb_build_object(l, jsonb_build_object('S', v_per,
        'Sl', case when v_per ~ '^\d{4}-\d{2}$' then left(v_per, 4) || '-' || (left(v_per, 4)::integer + 1)::text else v_per end, 'Y', left(v_per, 4),
        'Yf', case when v_per ~ '^\d{4}-\d{2}$' then (left(v_per, 4)::integer + 1)::text else v_per end));
    end loop;
    v_annee := null;
    select jsonb_agg(jsonb_build_object('code', o.code, 'noms', o.noms, 'p0', o.p0,
             'image', (select jsonb_build_object('fichier', i.fichier, 'genre', i.genre) from wm.images i where i.id = o.image_id)) order by o.ordre)
      into v_opts from wm.fiches_options o where o.fiche_id = f.id;
  end if;

  v_fiche := jsonb_strip_nulls(jsonb_build_object('id', v_id, 'nature', case when coalesce(v_opts, mo.options) is not null then 'options' else 'binaire' end,
    'categorie', mo.categorie, 'moteur_cat', coalesce(mo.moteur_cat, f.moteur_cat),
    'textes', wm.mod_textes(mo.gabarit, v_vars), 'image', coalesce(mo.image, (select jsonb_build_object('fichier', i.fichier, 'genre', i.genre) from wm.images i where i.id = f.image_id)),
    'ferme_at', v_ferme, 'resolution_at', v_res, 'source', coalesce(mo.source, jsonb_build_object('nom', f.source_nom, 'url', f.source_url)),
    'regle', v_regle, 'lien', f.lien, 'origine', 'modele', 'modele_id', mo.id, 'periode', v_per,
    'p0', case when v_opts is null and mo.options is null then round(least(97, greatest(3, coalesce(v_p0, 50))), 1) end,
    'p0_justif', case when v_p0 is not null and v_s is not null then format('Modèle %s : cours %s, seuil %s, σ = %s, %s jours.',
                   case when mo.famille = 'prix_touche' then 'de barrière' else 'lognormal' end, v_s, v_k, v_sig, round((v_t * 365)::numeric, 1))
                 when v_opts is not null then 'Probabilités de départ : dernier prix de l''instance précédente (' || f.id || ').'
                 else 'Probabilité de départ par défaut du modèle ; à ajuster par l''équipe si besoin.' end,
    'options', coalesce(v_opts, mo.options)));

  if mo.suite = 'brouillon' then
    insert into wm.propositions_jour (origine, etat, cle, brouillon, motif)
    values ('successeur', 'en_attente', 'modele:' || mo.id || ':' || v_per, v_fiche, 'édition suivante à vérifier (candidats, nommés, dates)')
    on conflict (cle) do nothing;
    return jsonb_build_object('brouillon', v_id);
  end if;
  if v_ferme is null or v_ferme <= now() + interval '10 minutes' then return jsonb_build_object('attente', 'dates', 'ferme_at', v_ferme); end if;
  perform wm.fiche_creer(v_fiche, null);
  update wm.modeles set dernier_id = v_id, maj_at = now() where id = mo.id;
  perform wm.journal_noter(null, 'marche_successeur', 'marche', v_id, jsonb_build_object('predecesseur', f.id), jsonb_build_object('periode', v_per, 'p0', v_fiche -> 'p0', 'regle', v_regle), null, null);
  return jsonb_build_object('cree', v_id);
end $$;

-- Rattrapage : un modèle actif dont la dernière instance est fermée ou résolue sans successeur (cours absent au moment
-- voulu, tâche arrêtée…) réessaie à chaque passage du cycle.
create or replace function wm.modeles_rattraper() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x record; v jsonb := '{}'::jsonb; r jsonb;
begin
  for x in select distinct on (f.modele_id) f.id, f.modele_id, f.cycle from wm.fiches f join wm.modeles m on m.id = f.modele_id and m.actif
           where f.origine = 'modele' order by f.modele_id, f.ferme_at desc loop
    if x.cycle in ('ferme', 'a_resoudre', 'resolu', 'annule') then
      r := wm.modele_suivant(x.id);
      if r ? 'cree' or r ? 'brouillon' then v := v || jsonb_build_object(x.modele_id, r); end if;
    end if;
  end loop;
  return v;
end $$;

insert into wm.cycle_blocs (cle, quand, fonction, ordre) values
  ('successeur_ferme', 'ferme', 'wm.modele_suivant', 10),
  ('successeur_resolu', 'resolu', 'wm.modele_suivant', 10),
  ('successeurs_rattrapage', 'tick', 'wm.modeles_rattraper', 10)
on conflict (cle) do nothing;

-- Graine des modèles.
create or replace function wm.modeles_semer(p jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare x jsonb; n integer := 0;
begin
  for x in select e from jsonb_array_elements(p) e loop
    insert into wm.modeles (id, famille, categorie, ouverture, suite, regle, gabarit, calendrier, options, image, source, moteur_cat, ordre)
    values (x ->> 'id', x ->> 'famille', x ->> 'categorie', coalesce(x ->> 'ouverture', 'fermeture'), coalesce(x ->> 'suite', 'auto'),
            coalesce(x -> 'regle', '{}'::jsonb), x -> 'gabarit', x -> 'calendrier', x -> 'options', x -> 'image', x -> 'source', x ->> 'moteur_cat', n + 1)
    on conflict (id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Les modèles (texte généré) suivent dans les migrations modeles_graine_1 à _2, qui lancent ensuite les ancres.


select wm.droits();
