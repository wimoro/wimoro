-- Données réelles, lot 7 (19 nov. 2026) : le pari éclair à cours réels.
--
-- Le principe : à chaque frontière de manche (toutes les 45 s), le serveur FIXE le cours de chaque jeu réel — moyenne de
-- trois sources sans clé pour la crypto (Binance, OKX, Gate ; Coinbase en secours), valeurs aberrantes écartées ; la
-- cotation Finnhub pour les actions US en séance, si la clé existe. Une fixation est écrite une fois et ne change plus.
-- La manche r va de la fixation r à la fixation r + 1 : l'issue, la cagnotte et les gains en découlent par le moteur
-- (js/moteur-eclair.js, copie conforme dans les Edge Functions), le même pour le navigateur, le compte Démo et le serveur.
--
-- Le mode de chaque jeu pour chaque manche (réel, en pause, simulé, retiré) est FIGÉ deux manches d'avance, et ne change
-- plus : un réglage modifié vaut à partir de la deuxième manche suivante, et tous les joueurs voient le même mode.
--   * réel : le jeu a une vraie source, sa place est ouverte sur toute la manche (une minute avant, cinq après), ses sources
--     sont utilisables (clé présente) et une fixation a réussi depuis moins de 10 minutes ;
--   * en pause : place fermée (nuit, week-end, jour férié), clé absente, ou données muettes — mises refusées, la rotation de
--     l'écran propose les jeux ouverts 24 h sur 24 ;
--   * simulé : l'interrupteur eclair.cours_reels est éteint (TOUS les jeux, comme avant ce lot), ou le jeu n'a pas de vraie
--     source gratuite (CAC 40, or, argent, pétrole, devises, sport : docs/DONNEES.md § 1.2), ou la simulation de secours est
--     allumée — moteur d'avant, inchangé, marqué « simulé » ;
--   * retiré : sorti de la rotation par l'équipe.
-- Fixation de fin absente après le délai de grâce (120 s) : la manche est annulée et les mises RENDUES — par une table
-- nouvelle (wm.eclair_remboursements) et une écriture « flash_rembourse » du journal d'argent ; aucune contrainte existante
-- ne change. La mise est close à l'état « perdue » avec un gain égal à la mise (la seule clôture que la contrainte
-- d'aujourd'hui permet) : le remboursement en est la vérité, et rien n'est compté au joueur (ni XP, ni série, ni pari réglé).
--
-- Deux fonctions existantes reçoivent une ligne de contrôle ajoutée (srv_eclair_miser, srv_duel_eclair_creer :
-- wm.eclair_garde), sans effet tant que l'interrupteur est éteint. Leurs définitions d'avant sont sauvées
-- (backup_20261119.fonctions_lots, lot « lot7 »). Rien n'est supprimé ; les anneaux sont réécrits en place.

-- ══ 0. Sauvegarde ══
select backup_20261119.sauver_table('wm.eclair_mises');
select backup_20261119.sauver_table('wm.sources');
select backup_20261119.sauver_table('wm.live_cache');
select backup_20261119.sauver_table('wm.reglages');                -- déjà sauvée au lot 6 : la copie d'avant les deux lots reste
select backup_20261119.sauver_table('wm.droits_liste');
select backup_20261119.sauver_table('cron.job');
select backup_20261119.sauver_fonction('public.srv_eclair_miser(uuid,jsonb)', 'lot7');
select backup_20261119.sauver_fonction('public.srv_duel_eclair_creer(uuid,jsonb)', 'lot7');

-- ══ 1. Réglages (publics : l'écran les lit par api_site) ══
insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
select x.cle, x.categorie, x.libelle, x.explication, x.type, x.v::jsonb, x.v::jsonb, x.mn, x.mx, false, true, true, null, x.ordre
from (values
  ('eclair.cours_reels', 'eclair', 'Pari éclair à cours réels', 'Allumé : les jeux qui ont une vraie source se jouent sur les cours fixés par le serveur ; éteint : tous les jeux restent simulés, comme avant. Vaut à partir de la deuxième manche suivante.', 'booleen', 'false', null::numeric, null::numeric, 300),
  ('eclair.secours_simule', 'eclair', 'Simulation de secours', 'Allumé : un jeu réel dont les sources se taisent passe en simulation, marquée « simulé », au lieu d''être mis en pause.', 'booleen', 'false', null, null, 301),
  ('eclair.grace_s', 'eclair', 'Délai de grâce de la fin de manche', 'Secondes d''attente de la fixation de fin d''une manche réelle ; passé ce délai sans elle, la manche est annulée et les mises rendues.', 'entier', '120', 30, 300, 302),
  ('eclair.pbe_max', 'eclair', 'Égalités au plus', 'Si une égalité (break even) arrive plus souvent que ce taux sur un jeu réel, sa mise break even est fermée et une égalité annule la manche (mises rendues).', 'nombre', '0.08', 0.04, 0.2, 303)
) as x(cle, categorie, libelle, explication, type, v, mn, mx, ordre)
on conflict (cle) do nothing;

-- ══ 2. Les actifs fixés, les jeux, les sources des fixations ══
create table if not exists wm.eclair_actifs (
  id text primary key,                              -- btc, eth, sol, doge, nvda, tsla, spy, qqq
  nom text not null,
  marche text not null references wm.px_marches (id),
  smin smallint not null check (smin >= 1),         -- sources concordantes exigées (aux deux bouts d'une manche)
  sources jsonb not null,                           -- [{src, sym, secours}] dans l'ordre de priorité
  actif boolean not null default true
);
alter table wm.eclair_actifs enable row level security;
revoke all on wm.eclair_actifs from public, anon, authenticated;
insert into wm.eclair_actifs (id, nom, marche, smin, sources) values
  ('btc', 'Bitcoin', 'CRYPTO', 2, '[{"src":"binance_eclair","sym":"BTCUSDT"},{"src":"okx_eclair","sym":"BTC-USDT"},{"src":"gate_eclair","sym":"BTC_USDT"},{"src":"coinbase_eclair","sym":"BTC-USD","secours":true}]'),
  ('eth', 'Ethereum', 'CRYPTO', 2, '[{"src":"binance_eclair","sym":"ETHUSDT"},{"src":"okx_eclair","sym":"ETH-USDT"},{"src":"gate_eclair","sym":"ETH_USDT"},{"src":"coinbase_eclair","sym":"ETH-USD","secours":true}]'),
  ('sol', 'Solana', 'CRYPTO', 2, '[{"src":"binance_eclair","sym":"SOLUSDT"},{"src":"okx_eclair","sym":"SOL-USDT"},{"src":"gate_eclair","sym":"SOL_USDT"},{"src":"coinbase_eclair","sym":"SOL-USD","secours":true}]'),
  ('doge', 'Dogecoin', 'CRYPTO', 2, '[{"src":"binance_eclair","sym":"DOGEUSDT"},{"src":"okx_eclair","sym":"DOGE-USDT"},{"src":"gate_eclair","sym":"DOGE_USDT"},{"src":"coinbase_eclair","sym":"DOGE-USD","secours":true}]'),
  ('nvda', 'Nvidia', 'NYSE', 1, '[{"src":"finnhub_eclair","sym":"NVDA"}]'),
  ('tsla', 'Tesla', 'NYSE', 1, '[{"src":"finnhub_eclair","sym":"TSLA"}]'),
  ('spy', 'S&P 500 (fonds SPY)', 'NYSE', 1, '[{"src":"finnhub_eclair","sym":"SPY"}]'),
  ('qqq', 'Nasdaq 100 (fonds QQQ)', 'NYSE', 1, '[{"src":"finnhub_eclair","sym":"QQQ"}]')
on conflict (id) do nothing;

-- Les 19 jeux du moteur. « reel » : se joue sur les fixations quand tout est réuni ; « simule » : pas de vraie source
-- gratuite (raison écrite) ; « retire » : sorti de la rotation. bande et pbe_modele sont ceux du moteur (d.be, beP(d)).
create table if not exists wm.eclair_jeux (
  jeu text primary key,
  config text not null check (config in ('reel', 'simule', 'retire')),
  actif text references wm.eclair_actifs (id),
  bande float8,
  pbe_modele float8,
  raison text not null,
  ordre smallint not null default 0
);
alter table wm.eclair_jeux enable row level security;
revoke all on wm.eclair_jeux from public, anon, authenticated;
insert into wm.eclair_jeux (jeu, config, actif, bande, pbe_modele, raison, ordre) values
  ('btc', 'reel', 'btc', 0.00003064285714285714, 0.04015568527674884, 'Moyenne de Binance, OKX et Gate (prix à la seconde, sans clé) ; Coinbase en secours.', 1),
  ('eth', 'reel', 'eth', 0.000039, 0.04015568527674884, 'Moyenne de Binance, OKX et Gate ; Coinbase en secours.', 2),
  ('sol', 'reel', 'sol', 0.000052928571428571425, 0.04015568527674884, 'Moyenne de Binance, OKX et Gate ; Coinbase en secours.', 3),
  ('doge', 'reel', 'doge', 0.00006685714285714285, 0.04015568527674884, 'Moyenne de Binance, OKX et Gate ; Coinbase en secours.', 4),
  ('vol', 'reel', 'btc', 0.00003142857142857143, 0.04118441219557001, 'Secousse du Bitcoin : les mêmes fixations que le Bitcoin.', 5),
  ('ndx', 'reel', 'qqq', 0.000011142857142857143, 0.04015568527674884, 'Fonds QQQ (Nasdaq 100) chez Finnhub, en séance, avec la clé FINNHUB_API_KEY.', 6),
  ('spx', 'reel', 'spy', 0.000016714285714285713, 0.04015568527674884, 'Fonds SPY (S&P 500) chez Finnhub, en séance, avec la clé FINNHUB_API_KEY.', 7),
  ('nvda', 'reel', 'nvda', 0.000025071428571428567, 0.04015568527674884, 'Finnhub, en séance, avec la clé FINNHUB_API_KEY.', 8),
  ('tsla', 'reel', 'tsla', 0.00003064285714285714, 0.04015568527674884, 'Finnhub, en séance, avec la clé FINNHUB_API_KEY.', 9),
  ('cac', 'simule', null, 0.0000195, 0.04015568527674884, 'Aucune source gratuite en temps réel : Yahoo et EODHD ont 15 min de retard (un pari de 45 s serait joué d''avance).', 10),
  ('gold', 'simule', null, 0.000013928571428571427, 0.04015568527674884, 'Pas de prix à la seconde gratuit et fiable : gold-api change toutes les 30 s ; les jetons crypto (PAXG) cotent 0,3 à 0,4 % sous le vrai prix.', 11),
  ('silver', 'simule', null, 0.000025071428571428567, 0.04015568527674884, 'Aucune source gratuite à la seconde.', 12),
  ('oil', 'simule', null, 0.000025071428571428567, 0.04015568527674884, 'Aucune source gratuite à la seconde (EIA et FRED : une valeur par jour).', 13),
  ('eurusd', 'simule', null, 0.000006128571428571429, 0.04015568527674884, 'Aucune source gratuite à la seconde dont l''affichage est permis (exchangerate.dev : 15 min ; BCE : un taux par jour).', 14),
  ('gbpusd', 'simule', null, 0.0000069642857142857136, 0.04015568527674884, 'Aucune source gratuite à la seconde dont l''affichage est permis.', 15),
  ('usdjpy', 'simule', null, 0.000008357142857142856, 0.04015568527674884, 'Aucune source gratuite à la seconde ; USD/JPY presque sans échanges sur les places crypto.', 16),
  ('tennis', 'simule', null, null, 0.04, 'Événement sportif simulé : pas de vrai match découpé en manches de 45 s.', 17),
  ('basket', 'simule', null, null, 0.04, 'Événement sportif simulé : pas de vrai match découpé en manches de 45 s.', 18),
  ('foot', 'simule', null, null, 0.03, 'Événement sportif simulé : pas de vrai match découpé en manches de 45 s.', 19)
on conflict (jeu) do nothing;

-- Les sources des fixations : appelées à chaque frontière (pas à une cadence), avec leurs quotas (part de Finnhub : 20 par
-- minute sur 60, la collecte des cours gardant les 40 autres).
insert into wm.sources (id, nom, rangs, nature, cle_requise, secret, cadence_s, quota_min, quota_jour, marge) values
  ('binance_eclair', 'Binance, bougies d''une seconde (éclair)', '{"eclair": 1}', 'direct', false, null, 1, 1000, null, 0.5),
  ('okx_eclair', 'OKX, bougies d''une seconde (éclair)', '{"eclair": 2}', 'direct', false, null, 1, 600, null, 0.5),
  ('gate_eclair', 'Gate, transactions (éclair)', '{"eclair": 3}', 'direct', false, null, 1, 600, null, 0.5),
  ('coinbase_eclair', 'Coinbase, transactions (éclair, secours)', '{"eclair": 4}', 'direct', false, null, 1, 300, null, 0.5),
  ('finnhub_eclair', 'Finnhub, cotation de frontière (éclair)', '{"eclair": 1}', 'direct', true, 'FINNHUB_API_KEY', 1, 20, null, 0.5)
on conflict (id) do nothing;

-- ══ 3. Les anneaux de 48 heures (3 840 manches), réécrits en place, et les tables permanentes ══
create or replace function wm.eclair_slot(p_m bigint) returns integer
language sql immutable set search_path = '' as $$ select (((p_m % 3840) + 3840) % 3840)::integer $$;
create or replace function wm.eclair_t0(p_m bigint) returns timestamptz
language sql immutable set search_path = '' as $$ select timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => ((p_m - 1) * 45)::double precision) $$;

-- La fixation d'un actif à la frontière d'une manche (le départ de cette manche) : écrite une fois, jamais réécrite.
create table if not exists wm.eclair_fixations (
  actif text not null,
  slot integer not null check (slot >= 0 and slot < 3840),
  manche bigint not null,
  t timestamptz not null,                           -- l'heure fixée : le début de la manche
  etat text not null check (etat in ('ok', 'absent')),
  prix float8,                                      -- moyenne des sources gardées
  n smallint not null default 0,
  s jsonb not null default '{}'::jsonb,             -- {source: cours} gardées
  x jsonb not null default '[]'::jsonb,             -- sources écartées (aberrantes)
  ecrit_at timestamptz not null default clock_timestamp(),
  primary key (actif, slot)
) with (fillfactor = 80);
alter table wm.eclair_fixations enable row level security;
revoke all on wm.eclair_fixations from public, anon, authenticated;
create index if not exists idx_eclair_fixations_manche on wm.eclair_fixations (actif, manche);

-- Le mode de chaque jeu pour chaque manche, figé d'avance (jamais réécrit pour la même manche).
create table if not exists wm.eclair_manches (
  jeu text not null,
  slot integer not null check (slot >= 0 and slot < 3840),
  manche bigint not null,
  mode text not null check (mode in ('reel', 'pause', 'simule', 'retire')),
  raison text,                                      -- ferme, cle, source, donnees, interrupteur, pas_de_source, secours, retire
  pbe float8,                                       -- fréquence du break even retenue (réel)
  smin smallint,
  beoff boolean not null default false,             -- break even fermé : une égalité annule la manche
  fige_at timestamptz not null default clock_timestamp(),
  primary key (jeu, slot)
) with (fillfactor = 80);
alter table wm.eclair_manches enable row level security;
revoke all on wm.eclair_manches from public, anon, authenticated;

-- Les manches réelles encore ouvertes au bout de 40 heures (une mise ou un duel pas réglé : le joueur n'est pas revenu) :
-- leur mode et leurs quatre fixations, recopiés par la tâche avant que les anneaux ne les effacent. Permanent : une mise
-- réglée après 48 heures garde sa preuve. Rien n'est écrit pour les manches réglées à temps (presque toutes).
create table if not exists wm.eclair_preuves (
  jeu text not null,
  manche bigint not null,
  mode text not null,
  pbe float8,
  smin smallint,
  beoff boolean,
  actif text,
  f jsonb,                                          -- {manche − 2, manche − 1, manche, manche + 1 : fixation}
  complete_at timestamptz,
  cree_at timestamptz not null default now(),
  primary key (jeu, manche)
);
alter table wm.eclair_preuves enable row level security;
revoke all on wm.eclair_preuves from public, anon, authenticated;

-- Les mises rendues d'une manche annulée (la vérité du remboursement ; la mise reste dans wm.eclair_mises, close).
create table if not exists wm.eclair_remboursements (
  mise_id bigint primary key references wm.eclair_mises (id) on delete cascade,
  user_id uuid not null,
  jeu text not null,
  manche bigint not null,
  montant numeric(15,2) not null,
  motif text not null,
  at timestamptz not null default now()
);
alter table wm.eclair_remboursements enable row level security;
revoke all on wm.eclair_remboursements from public, anon, authenticated;

-- La fréquence observée du break even sur les vraies fixations (48 heures).
create table if not exists wm.eclair_calibrage (
  jeu text primary key references wm.eclair_jeux (jeu),
  pbe float8,                                       -- vide : pas encore 200 manches observées (la valeur du modèle sert)
  n integer not null default 0,
  n_be integer not null default 0,
  maj_at timestamptz
);
alter table wm.eclair_calibrage enable row level security;
revoke all on wm.eclair_calibrage from public, anon, authenticated;

-- ══ 4. Modes, fixations, contexte ══
create or replace function wm.eclair_fixation(p_actif text, p_m bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('e', f.etat, 'p', f.prix, 'n', f.n, 's', f.s, 'a', wm.en_ms(f.ecrit_at))
  from wm.eclair_fixations f where f.actif = p_actif and f.slot = wm.eclair_slot(p_m) and f.manche = p_m
$$;

-- Le mode qu'aurait la manche si on le figeait maintenant (rien n'est écrit).
create or replace function wm.eclair_mode_calcul(p_jeu text, p_m bigint) returns wm.eclair_manches
language plpgsql stable security definer set search_path = '' as $$
declare
  j wm.eclair_jeux; a wm.eclair_actifs; r wm.eclair_manches; v_t0 timestamptz := wm.eclair_t0(p_m); v_t1 timestamptz := wm.eclair_t0(p_m + 1);
  v_dispo integer; v_pause text;
begin
  r.jeu := p_jeu; r.slot := wm.eclair_slot(p_m); r.manche := p_m; r.fige_at := clock_timestamp(); r.beoff := false;
  select * into j from wm.eclair_jeux x where x.jeu = p_jeu;
  if not found then r.mode := 'simule'; r.raison := 'inconnu'; return r; end if;
  if j.config = 'retire' then r.mode := 'retire'; r.raison := 'retire'; return r; end if;
  if not wm.reglage_bool('eclair.cours_reels', false) then r.mode := 'simule'; r.raison := 'interrupteur'; return r; end if;
  if j.config = 'simule' then r.mode := 'simule'; r.raison := 'pas_de_source'; return r; end if;
  select * into a from wm.eclair_actifs x where x.id = j.actif;
  if not found or not a.actif then v_pause := 'source';
  elsif not (wm.marche_ouvert(a.marche, v_t0 - interval '60 seconds') and wm.marche_ouvert(a.marche, v_t0)
             and wm.marche_ouvert(a.marche, v_t1) and wm.marche_ouvert(a.marche, v_t1 + interval '300 seconds')) then v_pause := 'ferme';
  else
    select count(*) into v_dispo from jsonb_array_elements(a.sources) e join wm.sources s on s.id = e ->> 'src'
    where s.actif and (not s.cle_requise or s.cle_presente is true);
    if v_dispo < a.smin then
      v_pause := case when exists (select 1 from jsonb_array_elements(a.sources) e join wm.sources s on s.id = e ->> 'src'
                                   where s.cle_requise and s.cle_presente is not true) then 'cle' else 'source' end;
    elsif not exists (select 1 from wm.eclair_fixations f where f.actif = a.id and f.etat = 'ok' and f.ecrit_at > clock_timestamp() - interval '10 minutes') then
      v_pause := 'donnees';
    end if;
  end if;
  if v_pause is null then
    r.mode := 'reel'; r.smin := a.smin;
    r.pbe := coalesce((select c.pbe from wm.eclair_calibrage c where c.jeu = p_jeu), j.pbe_modele);
    r.beoff := r.pbe > wm.reglage_num('eclair.pbe_max', 0.08);
  elsif v_pause in ('donnees', 'source') and wm.reglage_bool('eclair.secours_simule', false) then
    r.mode := 'simule'; r.raison := 'secours';
  else
    r.mode := 'pause'; r.raison := v_pause;
  end if;
  return r;
end $$;

-- Fige le mode de tous les jeux pour les manches p_de à p_a (celles déjà figées ne bougent jamais).
create or replace function wm.eclair_figer(p_de bigint, p_a bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare j record; m bigint; r wm.eclair_manches; n integer := 0;
begin
  for j in select x.jeu from wm.eclair_jeux x order by x.ordre loop
    for m in p_de .. least(p_a, p_de + 10) loop
      continue when exists (select 1 from wm.eclair_manches e where e.jeu = j.jeu and e.slot = wm.eclair_slot(m) and e.manche = m);
      r := wm.eclair_mode_calcul(j.jeu, m);
      insert into wm.eclair_manches as e (jeu, slot, manche, mode, raison, pbe, smin, beoff, fige_at)
      values (r.jeu, r.slot, r.manche, r.mode, r.raison, r.pbe, r.smin, r.beoff, r.fige_at)
      on conflict (jeu, slot) do update set manche = excluded.manche, mode = excluded.mode, raison = excluded.raison, pbe = excluded.pbe,
        smin = excluded.smin, beoff = excluded.beoff, fige_at = excluded.fige_at
      where e.manche < excluded.manche;                                         -- l'anneau : seule une manche plus ancienne est remplacée
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

-- Le contexte d'une manche pour le moteur : mode, paramètres, et les fixations r − 2 à r + 1 de son actif.
-- « attente » : manche réelle dont le départ ou la fin n'est pas encore fixé, et dont le délai de grâce court encore.
create or replace function wm.eclair_contexte_un(p_jeu text, p_m bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  j wm.eclair_jeux; e wm.eclair_manches; pr wm.eclair_preuves; v_mode text; v_f jsonb := '{}'::jsonb; k bigint; v_fix jsonb;
  v_grace integer := wm.reglage_num('eclair.grace_s', 120)::integer;
begin
  select * into j from wm.eclair_jeux x where x.jeu = p_jeu;
  select * into e from wm.eclair_manches x where x.jeu = p_jeu and x.slot = wm.eclair_slot(p_m) and x.manche = p_m;
  select * into pr from wm.eclair_preuves x where x.jeu = p_jeu and x.manche = p_m;
  v_mode := coalesce(e.mode, pr.mode, 'simule');
  if v_mode = 'reel' then
    for k in p_m - 2 .. p_m + 1 loop
      v_fix := coalesce(wm.eclair_fixation(coalesce(j.actif, pr.actif), k), pr.f -> k::text);
      if v_fix is not null then v_f := v_f || jsonb_build_object(k::text, v_fix); end if;
    end loop;
  end if;
  return jsonb_build_object('jeu', p_jeu, 'r', p_m, 'mode', v_mode, 'raison', coalesce(e.raison, case when e.mode is null and pr.mode is null then 'non_fige' end),
    'actif', coalesce(j.actif, pr.actif),
    'P', jsonb_build_object('pbe', coalesce(e.pbe, pr.pbe), 'smin', coalesce(e.smin, pr.smin), 'beoff', coalesce(e.beoff, pr.beoff, false)),
    'F', v_f,
    'attente', v_mode = 'reel' and (not (v_f ? p_m::text) or not (v_f ? (p_m + 1)::text))
               and clock_timestamp() < wm.eclair_t0(p_m + 1) + make_interval(secs => v_grace));
end $$;

-- Contrôle ajouté aux mises et aux duels (lignes « [ajout] »). Interrupteur éteint : la manche est figée « simulée » et la
-- mise passe comme avant le lot. Sinon :
--   jeu_en_pause : manche figée en pause ou retirée, ou départ réel fixé « absent » ;
--   mode_change  : l'Edge Function a calculé la cagnotte et les frais dans un autre mode que celui figé (elle recommence).
-- Une manche pas encore figée (tâche en retard) l'est ici, comme le ferait la tâche.
create or replace function wm.eclair_garde(p_jeu text, p_manche bigint, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare e wm.eclair_manches; v_actif text;
begin
  if p_jeu is null or p_manche is null then return; end if;
  select * into e from wm.eclair_manches x where x.jeu = p_jeu and x.slot = wm.eclair_slot(p_manche) and x.manche = p_manche;
  if not found and exists (select 1 from wm.eclair_jeux j where j.jeu = p_jeu) and p_manche between wm.eclair_manche() - 1 and wm.eclair_manche() + 2 then
    perform wm.eclair_figer(p_manche, p_manche);
    select * into e from wm.eclair_manches x where x.jeu = p_jeu and x.slot = wm.eclair_slot(p_manche) and x.manche = p_manche;
  end if;
  if not found then return; end if;
  if e.mode in ('pause', 'retire') then perform wm.fail('jeu_en_pause'); end if;
  if (e.mode = 'reel') is distinct from (coalesce(p_mode, 'simule') = 'reel') then perform wm.fail('mode_change'); end if;
  if e.mode = 'reel' then
    select j.actif into v_actif from wm.eclair_jeux j where j.jeu = p_jeu;
    if (wm.eclair_fixation(v_actif, p_manche) ->> 'e') = 'absent' then perform wm.fail('jeu_en_pause'); end if;
  end if;
end $$;

-- ══ 5. L'instantané éclair (dans api_live) ══
-- {on, r, grace_s, jeux: {jeu: {m: modes des manches r, r+1, r+2 (r réel, p pause, s simulé, x retiré), raison, actif,
--  pbe, beoff, rouvre (ms, place fermée)}}, f: {actif: [[manche, prix, sources, état, écrite (ms)], … 4 dernières]}}
-- Tout simulé (interrupteur éteint, aucun jeu retiré) : { on: false, r } seulement — api_live reste léger.
create or replace function wm.live_eclair_refaire() returns void
language plpgsql security definer set search_path = '' as $$
declare v_r bigint := wm.eclair_manche(); v jsonb;
begin
  if not wm.reglage_bool('eclair.cours_reels', false) and not exists (
       select 1 from wm.eclair_jeux j join wm.eclair_manches e on e.jeu = j.jeu
       and e.slot in (wm.eclair_slot(v_r), wm.eclair_slot(v_r + 1), wm.eclair_slot(v_r + 2)) and e.manche between v_r and v_r + 2 and e.mode <> 'simule') then
    update wm.live_cache set eclair = jsonb_build_object('on', false, 'r', v_r), eclair_at = clock_timestamp() where id = 1;
    return;
  end if;
  select jsonb_build_object('on', wm.reglage_bool('eclair.cours_reels', false), 'r', v_r, 'grace_s', wm.reglage_num('eclair.grace_s', 120),
    'jeux', coalesce((select jsonb_object_agg(j.jeu, jsonb_build_object(
        'm', (select string_agg(case coalesce(e.mode, 'simule') when 'reel' then 'r' when 'pause' then 'p' when 'retire' then 'x' else 's' end, '' order by g.k)
              from generate_series(v_r, v_r + 2) g(k) left join wm.eclair_manches e on e.jeu = j.jeu and e.slot = wm.eclair_slot(g.k) and e.manche = g.k),
        'raison', e0.raison, 'actif', j.actif, 'pbe', e0.pbe, 'beoff', coalesce(e0.beoff, false),
        'rouvre', case when e0.mode = 'pause' and e0.raison = 'ferme' then wm.en_ms(wm.marche_prochaine_ouverture(a.marche, clock_timestamp())) end))
      from wm.eclair_jeux j
      left join wm.eclair_manches e0 on e0.jeu = j.jeu and e0.slot = wm.eclair_slot(v_r) and e0.manche = v_r
      left join wm.eclair_actifs a on a.id = j.actif), '{}'::jsonb),
    'f', coalesce((select jsonb_object_agg(a.id, coalesce((
        select jsonb_agg(jsonb_build_array(f.manche, f.prix, f.n, f.etat, wm.en_ms(f.ecrit_at)) order by f.manche)
        from wm.eclair_fixations f where f.actif = a.id and f.manche between v_r - 3 and v_r
          and f.slot in (wm.eclair_slot(v_r - 3), wm.eclair_slot(v_r - 2), wm.eclair_slot(v_r - 1), wm.eclair_slot(v_r))), '[]'::jsonb))
      from wm.eclair_actifs a where a.actif), '{}'::jsonb))
  into v;
  update wm.live_cache set eclair = v, eclair_at = clock_timestamp() where id = 1;
end $$;

-- ══ 6. Ce que l'Edge Function « donnees » appelle : la configuration des fixations, et l'écriture d'une frontière ══
create or replace function public.srv_eclair_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('r', wm.eclair_manche(), 'grace_s', wm.reglage_num('eclair.grace_s', 120),
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'marche', a.marche, 'smin', a.smin, 'sources', a.sources,
        'ouvert', wm.marche_ouvert(a.marche, clock_timestamp()),
        'fixees', (select coalesce(jsonb_agg(f.manche order by f.manche), '[]'::jsonb) from wm.eclair_fixations f
                   where f.actif = a.id and f.manche between wm.eclair_manche() - 3 and wm.eclair_manche()
                     and f.slot in (wm.eclair_slot(wm.eclair_manche() - 3), wm.eclair_slot(wm.eclair_manche() - 2), wm.eclair_slot(wm.eclair_manche() - 1), wm.eclair_slot(wm.eclair_manche()))))
        order by a.id)
      from wm.eclair_actifs a where a.actif and exists (select 1 from wm.eclair_jeux j where j.actif = a.id and j.config = 'reel')), '[]'::jsonb))
$$;

-- Une frontière de manche : p = { manche, actifs: { <actif>: { s: {source: cours}, x: [écartées], final } } }.
-- « ok » avec au moins smin sources ; « absent » seulement quand l'Edge Function a fini d'essayer (final). La frontière
-- doit être passée et son délai de grâce pas encore écoulé. Une fixation déjà écrite pour cette manche ne change jamais.
create or replace function public.srv_eclair_fixer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m bigint := wm.num(p ->> 'manche')::bigint; v_now timestamptz := clock_timestamp(); v_t timestamptz; a wm.eclair_actifs;
  k text; v jsonb; v_s jsonb; v_n integer; v_etat text; v_prix float8; v_ecrits jsonb := '[]'::jsonb;
  v_grace integer := wm.reglage_num('eclair.grace_s', 120)::integer;
begin
  if v_m is null or jsonb_typeof(p -> 'actifs') is distinct from 'object' then perform wm.fail('requete'); end if;
  v_t := wm.eclair_t0(v_m);
  if v_t > v_now then perform wm.fail('trop_tot'); end if;
  if v_now > v_t + make_interval(secs => v_grace) then perform wm.fail('trop_tard'); end if;
  for k, v in select e.key, e.value from jsonb_each(p -> 'actifs') e loop
    select * into a from wm.eclair_actifs x where x.id = k and x.actif;
    continue when not found or jsonb_typeof(v) <> 'object';
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_s
    from jsonb_each(case when jsonb_typeof(v -> 's') = 'object' then v -> 's' else '{}'::jsonb end) e
    where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::float8 > 0
      and exists (select 1 from jsonb_array_elements(a.sources) z where z ->> 'src' = e.key);
    select count(*) into v_n from jsonb_object_keys(v_s);
    if v_n >= a.smin then v_etat := 'ok';
    elsif (v ->> 'final') = 'true' then v_etat := 'absent';
    else continue;                                                              -- pas assez de sources : la fonction réessaiera
    end if;
    select avg((e.value #>> '{}')::float8) into v_prix from jsonb_each(v_s) e;
    insert into wm.eclair_fixations as f (actif, slot, manche, t, etat, prix, n, s, x, ecrit_at)
    values (k, wm.eclair_slot(v_m), v_m, v_t, v_etat, v_prix, v_n, v_s, case when jsonb_typeof(v -> 'x') = 'array' then v -> 'x' else '[]'::jsonb end, v_now)
    on conflict (actif, slot) do update set manche = excluded.manche, t = excluded.t, etat = excluded.etat, prix = excluded.prix, n = excluded.n,
      s = excluded.s, x = excluded.x, ecrit_at = excluded.ecrit_at
    where f.manche < excluded.manche;
    if found then v_ecrits := v_ecrits || to_jsonb(k); end if;
  end loop;
  perform wm.live_eclair_refaire();
  return jsonb_build_object('ok', true, 'manche', v_m, 'ecrits', v_ecrits);
end $$;

-- ══ 7. Ce que l'Edge Function « eclair » appelle ══
-- Le contexte de manches : p = { items: [{jeu, manche}] (60 au plus) }. Fige d'abord les modes de la manche en cours et des
-- deux suivantes (au cas où la tâche aurait du retard). Lecture seule sinon : rien n'est écrit par mise.
create or replace function public.srv_eclair_contexte(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_r bigint := wm.eclair_manche(); x jsonb; v_out jsonb := '[]'::jsonb; v_m bigint;
begin
  perform wm.eclair_figer(v_r, v_r + 2);
  for x in select e from jsonb_array_elements(case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end) e limit 60 loop
    v_m := wm.num(x ->> 'manche')::bigint;
    continue when v_m is null or v_m > v_r + 2 or not exists (select 1 from wm.eclair_jeux j where j.jeu = x ->> 'jeu');
    v_out := v_out || jsonb_build_array(wm.eclair_contexte_un(x ->> 'jeu', v_m));
  end loop;
  return jsonb_build_object('t', wm.en_ms(clock_timestamp()), 'r', v_r, 'cours_reels', wm.reglage_bool('eclair.cours_reels', false), 'items', v_out);
end $$;

-- Rendre les mises d'une manche réelle annulée : p_res = [{ id, motif }] (calculé par le moteur). La mise est rendue, la
-- manche reste une manche jouée sans effet : ni XP, ni série, ni pari réglé. Une manche simulée ne s'annule jamais.
create or replace function public.srv_eclair_rembourser(p_user uuid, p_res jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_maintenant bigint := wm.eclair_manche(); x jsonb; m wm.eclair_mises; v_solde numeric;
  v_motif text; v_ctx jsonb; v_out jsonb := '[]'::jsonb; v_id uuid; v_at timestamptz; v_p jsonb; v_texte text;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  for x in select e from jsonb_array_elements(case when jsonb_typeof(p_res) = 'array' then p_res else '[]'::jsonb end) e limit 60 loop
    select * into m from wm.eclair_mises e where e.id = wm.num(x ->> 'id')::bigint and e.user_id = v_uid and e.etat = 'ouverte' and e.manche < v_maintenant for update;
    continue when not found;
    v_ctx := wm.eclair_contexte_un(m.jeu, m.manche);
    continue when v_ctx ->> 'mode' is distinct from 'reel' or (v_ctx ->> 'attente')::boolean;
    v_motif := case when x ->> 'motif' in ('fixation_absente', 'sources_insuffisantes', 'egalite_sans_break_even') then x ->> 'motif' else 'manche_annulee' end;
    insert into wm.eclair_remboursements (mise_id, user_id, jeu, manche, montant, motif) values (m.id, v_uid, m.jeu, m.manche, m.amt, v_motif);
    update public.user_stats set balance = balance + m.amt where user_id = v_uid returning balance into v_solde;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, m.amt, v_solde, 'flash_rembourse', m.jeu || ':' || m.manche);
    update wm.eclair_mises set etat = 'perdue', gain = m.amt, settled_at = now() where id = m.id;
    v_p := jsonb_build_object('g', m.jeu, 'r', m.manche, 'amt', m.amt, 'motif', v_motif);
    v_texte := 'Éclair ' || m.jeu || ', manche ' || m.manche || ' : annulée, ta mise de ' || to_char(m.amt, 'FM999999990.00') || ' $ t''est rendue.';
    insert into public.notifications (user_id, icon, text, code, params, href) values (v_uid, 'bolt', v_texte, 'flash_rembourse', v_p, '#eclair')
    returning id, created_at into v_id, v_at;
    perform wm.ev(jsonb_build_object('k', 'notif', 'n', jsonb_build_object('id', v_id, 'ic', 'bolt', 'code', 'flash_rembourse', 'p', v_p, 'text', v_texte,
      'href', '#eclair', 'at', wm.en_ms(v_at), 'read', false)));
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', m.id, 'g', m.jeu, 'r', m.manche, 's', m.cote, 'amt', m.amt, 'motif', v_motif));
  end loop;
  return wm.reponse(v_uid, jsonb_build_object('rembourses', v_out, 'eclair', wm.eclair_json(v_uid)));
end $$;

-- ══ 8. Ce que lisent les visiteurs et le compte Démo : l'historique des fixations d'un jeu (48 heures) ══
create or replace function wm.fixations(p_jeu text, p_de bigint default null, p_a bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j wm.eclair_jeux; v_r bigint := wm.eclair_manche(); v_de bigint; v_a bigint;
begin
  select * into j from wm.eclair_jeux x where x.jeu = p_jeu;
  if not found then perform wm.fail('jeu_inconnu'); end if;
  v_a := least(coalesce(p_a, v_r), v_r + 2);
  v_de := greatest(coalesce(p_de, v_a - 11), v_a - 99, v_r - 3830);
  if v_de > v_a then v_de := v_a; end if;
  return jsonb_build_object('jeu', p_jeu, 'actif', j.actif, 'config', j.config, 'de', v_de, 'a', v_a, 'r', v_r,
    'manches', coalesce((select jsonb_object_agg(g.k::text, jsonb_build_object('mode', e.mode, 'raison', e.raison,
                  'P', jsonb_build_object('pbe', e.pbe, 'smin', e.smin, 'beoff', e.beoff)))
                from generate_series(v_de, v_a) g(k) join wm.eclair_manches e on e.jeu = p_jeu and e.slot = wm.eclair_slot(g.k) and e.manche = g.k), '{}'::jsonb),
    'F', coalesce((select jsonb_object_agg(g.k::text, wm.eclair_fixation(j.actif, g.k))
                   from generate_series(v_de - 2, v_a + 1) g(k) where j.actif is not null and wm.eclair_fixation(j.actif, g.k) is not null), '{}'::jsonb));
end $$;
create or replace function public.api_fixations(p_jeu text, p_de bigint default null, p_a bigint default null) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.fixations(p_jeu, p_de, p_a) $$;
insert into wm.droits_liste (nom, qui) values ('fixations', 'visiteur') on conflict do nothing;

-- ══ 9. Les tâches : figer les modes, déclarer les fixations absentes, garder la preuve des mises oubliées ; calibrer le break even ══
create or replace function wm.eclair_fixer() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r bigint := wm.eclair_manche(); v_grace integer := wm.reglage_num('eclair.grace_s', 120)::integer; a wm.eclair_actifs; m bigint;
  n_figes integer; n_absentes integer := 0; n_preuves integer := 0;
begin
  n_figes := wm.eclair_figer(v_r, v_r + 2);
  -- une frontière d'une manche réelle restée sans fixation après le délai de grâce : « absente », pour toujours
  for a in select * from wm.eclair_actifs x where x.actif loop
    for m in v_r - 12 .. v_r loop
      continue when wm.eclair_t0(m) + make_interval(secs => v_grace) > clock_timestamp();
      continue when exists (select 1 from wm.eclair_fixations f where f.actif = a.id and f.slot = wm.eclair_slot(m) and f.manche = m);
      continue when not exists (select 1 from wm.eclair_manches e join wm.eclair_jeux j on j.jeu = e.jeu
                                where j.actif = a.id and e.mode = 'reel' and ((e.slot = wm.eclair_slot(m) and e.manche = m) or (e.slot = wm.eclair_slot(m - 1) and e.manche = m - 1)));
      insert into wm.eclair_fixations as f (actif, slot, manche, t, etat, prix, n, s, x, ecrit_at)
      values (a.id, wm.eclair_slot(m), m, wm.eclair_t0(m), 'absent', null, 0, '{}'::jsonb, '[]'::jsonb, clock_timestamp())
      on conflict (actif, slot) do update set manche = excluded.manche, t = excluded.t, etat = excluded.etat, prix = excluded.prix, n = excluded.n,
        s = excluded.s, x = excluded.x, ecrit_at = excluded.ecrit_at
      where f.manche < excluded.manche;
      if found then n_absentes := n_absentes + 1; end if;
    end loop;
  end loop;
  -- la preuve des manches réelles encore ouvertes au bout de 40 heures (mise ou duel pas réglé), avant que les anneaux de
  -- 48 heures ne les effacent : leur mode et leurs quatre fixations
  insert into wm.eclair_preuves (jeu, manche, mode, pbe, smin, beoff, actif, f, complete_at)
  select e.jeu, e.manche, e.mode, e.pbe, e.smin, e.beoff, j.actif,
         (select coalesce(jsonb_object_agg(g.k::text, wm.eclair_fixation(j.actif, g.k)) filter (where wm.eclair_fixation(j.actif, g.k) is not null), '{}'::jsonb)
          from generate_series(o.manche - 2, o.manche + 1) g(k)), clock_timestamp()
  from (select x.jeu, x.manche from wm.eclair_mises x where x.etat = 'ouverte' and x.manche between v_r - 3830 and v_r - 3200
        union
        select substr(d.m, 7), d.manche from wm.duels d where d.m like 'flash:%' and d.etat in ('open', 'active') and d.manche between v_r - 3830 and v_r - 3200) o
  join wm.eclair_manches e on e.jeu = o.jeu and e.slot = wm.eclair_slot(o.manche) and e.manche = o.manche and e.mode = 'reel'
  join wm.eclair_jeux j on j.jeu = e.jeu
  where not exists (select 1 from wm.eclair_preuves p where p.jeu = o.jeu and p.manche = o.manche)
  on conflict (jeu, manche) do nothing;
  get diagnostics n_preuves = row_count;
  perform wm.live_eclair_refaire();
  return jsonb_build_object('figes', n_figes, 'absentes', n_absentes, 'preuves', n_preuves);
end $$;

-- La fréquence du break even observée sur 48 heures de vraies fixations (prix moyens de deux frontières consécutives) ;
-- retenue à partir de 200 manches, sinon celle du modèle. Elle ne vaut que pour les manches figées ensuite.
create or replace function wm.eclair_calibrer() returns integer
language plpgsql security definer set search_path = '' as $$
declare j record; v_n integer; v_be integer; k integer := 0;
begin
  for j in select x.jeu, x.actif, x.bande from wm.eclair_jeux x where x.config = 'reel' and x.actif is not null and x.bande is not null loop
    select count(*), count(*) filter (where abs(b.prix / a.prix - 1) <= j.bande) into v_n, v_be
    from wm.eclair_fixations a join wm.eclair_fixations b on b.actif = a.actif and b.manche = a.manche + 1
    where a.actif = j.actif and a.etat = 'ok' and b.etat = 'ok' and a.prix > 0 and a.t > clock_timestamp() - interval '48 hours';
    insert into wm.eclair_calibrage as c (jeu, pbe, n, n_be, maj_at)
    values (j.jeu, case when v_n >= 200 then greatest(v_be::float8 / v_n, 0.002) end, v_n, v_be, clock_timestamp())
    on conflict (jeu) do update set pbe = excluded.pbe, n = excluded.n, n_be = excluded.n_be, maj_at = excluded.maj_at;
    k := k + 1;
  end loop;
  return k;
end $$;

select cron.schedule('wm-eclair-fix', '10 seconds', $$select wm.eclair_fixer()$$);
select cron.schedule('wm-eclair-calibrage', '17 * * * *', $$select wm.eclair_calibrer()$$);

-- ══ 10. Deux fonctions existantes reçoivent une ligne de contrôle (produites par tools/garde-fonctions.mjs, lot 7) ══
CREATE OR REPLACE FUNCTION public.srv_eclair_miser(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user);
  v_manche bigint := wm.num(p ->> 'manche')::bigint; v_jeu text := p ->> 'jeu'; v_cote text := p ->> 'cote';
  v_amt numeric := round(wm.num(p ->> 'amt'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid;
  s public.user_stats; v_prev jsonb; v_ms float8; v_tier integer; v_fee float8; v_solde numeric; m wm.eclair_mises; v_res jsonb;
begin
  if v_cote is null or v_cote not in ('oui', 'non', 'be') then perform wm.fail('cote_invalide'); end if;
  if v_jeu is null or v_manche is null then perform wm.fail('jeu_inconnu'); end if;
  if v_amt is null or v_amt < wm.reglage_num('eclair.mise_min', 1) or v_amt > wm.reglage_num('eclair.mise_max', 10000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] eclair.mise_min, eclair.mise_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);                                                         -- jeu responsable : pas de mise pendant une pause
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  -- l'horloge de la base confirme celle de l'Edge Function : la manche est en cours et ses mises sont ouvertes
  -- (30 secondes ; 1,5 seconde de tolérance entre les deux horloges)
  v_ms := (extract(epoch from clock_timestamp()) - extract(epoch from timestamptz '2026-11-01 00:00:00+00')) * 1000 - (v_manche - 1) * 45000;
  if v_ms < -1500 or v_ms >= 31500 then perform wm.fail('mises_fermees'); end if;
  perform wm.eclair_garde(v_jeu, v_manche, p ->> 'mode');   -- [ajout] cours réels : jeu en pause, ou mode de la manche différent de celui du calcul
  if exists (select 1 from wm.eclair_mises x where x.user_id = v_uid and x.manche = v_manche and x.jeu = v_jeu) then perform wm.fail('deja_mise'); end if;
  if s.balance < v_amt then perform wm.fail('solde_insuffisant'); end if;
  if v_cote = 'be' and v_amt > coalesce(wm.num(p ->> 'be_max'), 0) then perform wm.fail('be_plein'); end if;

  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  v_fee := case when coalesce(v_tier, 0) >= 5 then wm.num(p ->> 'fee_remise') else wm.num(p ->> 'fee') end::float8;   -- remise à partir du rang Diamant
  if v_fee is null or v_fee < 0 or v_fee >= v_amt then perform wm.fail('montant_invalide'); end if;

  v_solde := s.balance - v_amt;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1 where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_amt, v_solde, 'flash', v_jeu || ':' || v_manche);
  insert into wm.eclair_mises (user_id, manche, jeu, cote, amt, fee, net, mult, prix, tk)
  values (v_uid, v_manche, v_jeu, v_cote, v_amt, v_fee, v_amt - v_fee, case when v_cote = 'be' then coalesce(wm.num(p ->> 'mult'), 0)::float8 else 0 end,
          wm.num(p ->> 'prix')::integer, greatest(0, least(180, coalesce(wm.num(p ->> 'tk'), 0)))::integer)
  returning * into m;
  perform wm.xp_add(v_uid, 10, 'eclair');
  perform wm.mission_progress(v_uid, 'flashbet', 1);
  perform wm.badges_check(v_uid);
  v_res := wm.reponse(v_uid, jsonb_build_object('mise', wm.eclair_mise_json(m)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'eclair', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.srv_duel_eclair_creer(p_user uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := wm.agir_pour(p_user);
  v_gid text := p ->> 'gid'; v_cote text := p ->> 'side'; v_mise numeric := round(wm.num(p ->> 'stake'), 2);
  v_adv uuid := nullif(p ->> 'opp', '')::uuid; v_key uuid := nullif(p ->> 'key', '')::uuid; v_prix integer := wm.num(p ->> 'prix')::integer;
  s public.user_stats; v_prev jsonb; v_tier integer; v_frais numeric; v_solde numeric; d wm.duels; v_bot boolean := false; v_res jsonb;
  v_manche bigint; v_ms float8; v_ferme timestamptz;
begin
  if v_gid is null or v_gid !~ '^[a-z0-9]{2,12}$' then perform wm.fail('jeu_inconnu'); end if;
  if v_cote is null or v_cote not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;
  if v_mise is null or v_mise < wm.reglage_num('duels.mise_min', 5) or v_mise > wm.reglage_num('duels.mise_max', 5000) then perform wm.fail('montant_invalide'); end if;   -- [réglage] duels.mise_min, duels.mise_max
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if v_prix is null or v_prix < 2 or v_prix > 98 then perform wm.fail('cote_indisponible'); end if;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  perform wm.garde(v_uid, 'paris');   -- [ajout] blocage des paris
  if v_adv is not null then
    if v_adv = v_uid then perform wm.fail('duel_indisponible'); end if;
    if not exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = v_adv) or (f.user_id = v_adv and f.friend_id = v_uid))) then perform wm.fail('pas_amis'); end if;
    select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_adv;
  end if;
  if (select count(*) from wm.duels x where x.par = v_uid and x.etat = 'open') >= wm.reglage_num('duels.max_ouverts', 10) then perform wm.fail('trop_de_duels'); end if;   -- [réglage] duels.max_ouverts

  -- la manche : celle en cours, ou la suivante s'il reste moins de dix secondes de mises (horloge de la base)
  v_manche := wm.eclair_manche(); v_ms := wm.eclair_depuis(v_manche);
  if v_ms >= 20000 then v_manche := v_manche + 1; end if;
  perform wm.eclair_garde(v_gid, v_manche, p ->> 'mode');   -- [ajout] cours réels : jeu en pause, ou mode de la manche différent de celui du calcul
  v_ferme := timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => (v_manche - 1) * 45 + 30);

  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  v_frais := round(case when coalesce(v_tier, 0) >= 5 then wm.num(p ->> 'frais_remise') else wm.num(p ->> 'frais') end, 2);   -- remise à partir du rang Diamant
  if v_frais is null or v_frais < 0 or v_frais >= v_mise then perform wm.fail('montant_invalide'); end if;
  if s.balance < v_mise + v_frais then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_mise - v_frais;
  update public.user_stats set balance = v_solde, bets_placed = bets_placed + 1, profit_realized = coalesce(profit_realized, 0) - v_frais where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -(v_mise + v_frais), v_solde, 'duel', 'flash:' || v_gid || ':' || v_manche);
  insert into wm.duels (code, par, adv, m, cote, mise, frais, prix0, expire_at, manche)
  values ('D' || upper(substr(md5(gen_random_uuid()::text), 1, 7)), v_uid, v_adv, 'flash:' || v_gid, v_cote, v_mise, v_frais, v_prix, least(now() + interval '2 minutes', v_ferme), v_manche)
  returning * into d;
  if v_bot then d := wm.duel_accepter(d.id, v_adv, v_prix, 0);                    -- un bot défié accepte aussitôt, au prix du moment
  elsif v_adv is not null then
    perform wm.notify(v_adv, 'swords', 'duel_recu', jsonb_build_object('id', d.id, 'u', v_uid, 'm', d.m, 'r', d.manche, 's', v_cote, 'k', v_mise), '#duel-' || d.id);
  end if;
  v_res := wm.reponse(v_uid, jsonb_build_object('duel', wm.duel_json(d), 'duels', wm.duels_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'duel', v_res);
  return v_res;
end $function$;

select wm.droits();
