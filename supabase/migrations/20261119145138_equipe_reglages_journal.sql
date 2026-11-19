-- Panneau d'administration et réglages, lot 1 (19 nov. 2026) : réglages, équipe, journal, porte unique.
--
-- Rien de ce qui existe ne change pour un joueur. Ajouts :
--   * wm.reglages : les constantes du jeu (frais, limites, mises, bonus…), une ligne par réglage avec sa catégorie, son
--     libellé, une phrase d'explication, sa valeur, sa valeur par défaut (= la constante d'aujourd'hui) et ses bornes.
--     Lecture par l'écran : api_site() (visiteurs compris : réglages publics, annonce, maintenance). Les fonctions du jeu
--     les liront aux lots suivants ; tant qu'un réglage garde sa valeur par défaut, rien ne change.
--   * l'équipe : deux rôles, « administrateur » (tout) et « modérateur » (joueurs et chat). Les comptes de
--     public.admin_users (aujourd'hui WimoroAdmin) sont administrateurs ; cette table et sa contrainte ne changent pas.
--   * wm.journal : qui, quand, quoi, sur quoi, avant, après, motif, et comment l'annuler ; chaque entrée porte l'empreinte
--     SHA-256 de la précédente (une altération se voit). Les entrées de l'ancien panneau y sont recopiées. L'interdiction
--     de modifier, d'effacer ou de vider le journal est posée par la migration suivante (journal_ajout_seul).
--   * une seule porte, api_equipe(action, paramètres) → wm.equipe : registre des actions (wm.equipe_actions), rôle vérifié
--     à CHAQUE appel (un joueur ordinaire : « interdit »), motif obligatoire pour les actions sensibles, double
--     authentification (aal2) exigée dès qu'un membre a enrôlé un code, 120 écritures par minute au plus.
-- Trois fonctions existantes reçoivent un contrôle ajouté, sans effet sur les comptes d'aujourd'hui :
--   * wm.is_admin() : un administrateur retiré de l'équipe (ou devenu modérateur) perd aussi l'ancienne porte ;
--   * wm.admin() : la double authentification, dès qu'un code est enrôlé ;
--   * wm.droits() : ses trois listes sont complétées par la table wm.droits_liste (au départ : api_site, pour les visiteurs).
-- Leurs définitions d'avant sont dans backup_20261119.fonctions (lot 0).

-- ── Petites aides ──
create or replace function wm.en_ms(t timestamptz) returns bigint
language sql stable set search_path = '' as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function wm.eq_uuid(t text) returns uuid
language sql immutable set search_path = '' as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end
$$;

-- une date donnée en millisecondes (comme l'écran) ou en texte ISO ; vide ou illisible : null
create or replace function wm.eq_date(t text) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare n numeric := wm.num(t);
begin
  if t is null or btrim(t) = '' then return null; end if;
  if n is not null then return to_timestamp(n / 1000.0); end if;
  return t::timestamptz;
exception when others then return null;
end $$;

-- ══ 1. Réglages ══
create table if not exists wm.reglages (
  cle text primary key,
  categorie text not null,
  libelle text not null,                            -- en français
  explication text not null,                        -- une phrase, en français
  type text not null check (type in ('nombre', 'entier', 'booleen', 'liste', 'json')),
  valeur jsonb not null,
  defaut jsonb not null,                            -- la constante en vigueur avant les réglages
  min numeric,
  max numeric,
  facultatif boolean not null default false,        -- la valeur peut être vide (null) : « aucun plafond »
  public boolean not null default false,            -- lu par l'écran (api_site)
  applique boolean not null default true,           -- faux : le serveur ne l'applique pas encore (lot qui le branchera)
  dedie text,                                       -- s'écrit par cette action de l'équipe, pas par reglage_modifier
  ordre integer not null default 0,
  maj_at timestamptz not null default now(),
  maj_par uuid
);
alter table wm.reglages enable row level security;
revoke all on wm.reglages from public, anon, authenticated;

create table if not exists wm.revisions (
  nom text primary key,
  rev bigint not null default 0
);
alter table wm.revisions enable row level security;
revoke all on wm.revisions from public, anon, authenticated;
insert into wm.revisions (nom, rev) values ('reglages', 1) on conflict (nom) do nothing;

insert into wm.reglages (cle, categorie, libelle, explication, type, valeur, defaut, min, max, facultatif, public, applique, dedie, ordre)
select x.cle, x.categorie, x.libelle, x.explication, x.type, x.v::jsonb, x.v::jsonb, x.mn, x.mx, x.fac, x.pub, x.app, x.dedie, x.ordre
from (values
  ('frais.k', 'frais', 'Multiplicateur des frais des paris', 'Les frais d''un pari sur un marché valent ce multiplicateur fois le barème de sa catégorie (0,70 : 70 % du barème Polymarket).', 'nombre', '0.70', 0, 1.5, false, true, true, null, 10),
  ('frais.taux.crypto', 'frais', 'Barème Crypto', 'Taux de base des frais des marchés Crypto, avant le multiplicateur.', 'nombre', '0.07', 0, 0.15, false, true, true, null, 11),
  ('frais.taux.football', 'frais', 'Barème Football', 'Taux de base des frais des marchés Football, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 12),
  ('frais.taux.politique', 'frais', 'Barème Politique', 'Taux de base des frais des marchés Politique, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 13),
  ('frais.taux.tech_ia', 'frais', 'Barème Tech et IA', 'Taux de base des frais des marchés Tech et IA, avant le multiplicateur.', 'nombre', '0.04', 0, 0.15, false, true, true, null, 14),
  ('frais.taux.economie', 'frais', 'Barème Économie', 'Taux de base des frais des marchés Économie, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 15),
  ('frais.taux.culture', 'frais', 'Barème Culture', 'Taux de base des frais des marchés Culture, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 16),
  ('frais.taux.meteo', 'frais', 'Barème Météo', 'Taux de base des frais des marchés Météo, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 17),
  ('frais.taux.sport', 'frais', 'Barème Sport', 'Taux de base des frais des marchés Sport, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 18),
  ('frais.taux.sport_live', 'frais', 'Barème Sport live', 'Taux de base des frais des marchés Sport live, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 19),
  ('frais.taux.bourse', 'frais', 'Barème Bourse', 'Taux de base des frais des marchés Bourse, avant le multiplicateur.', 'nombre', '0.04', 0, 0.15, false, true, true, null, 20),
  ('frais.taux.matieres', 'frais', 'Barème Matières', 'Taux de base des frais des marchés Matières, avant le multiplicateur.', 'nombre', '0.04', 0, 0.15, false, true, true, null, 21),
  ('frais.taux.devises', 'frais', 'Barème Devises', 'Taux de base des frais des marchés Devises, avant le multiplicateur.', 'nombre', '0.04', 0, 0.15, false, true, true, null, 22),
  ('frais.taux.defaut', 'frais', 'Barème des autres catégories', 'Taux de base des frais d''une catégorie absente du barème, avant le multiplicateur.', 'nombre', '0.05', 0, 0.15, false, true, true, null, 23),
  ('frais.remise_rang', 'frais', 'Remise du rang Diamant', 'Les frais d''un joueur du rang Diamant ou au-dessus sont multipliés par ce nombre (0,90 : 10 % de remise).', 'nombre', '0.90', 0.5, 1, false, true, true, null, 24),
  ('frais.eclair.k', 'frais', 'Multiplicateur des frais éclair', 'Les frais d''une mise éclair valent ce multiplicateur fois le barème ; ils sont calculés par le moteur éclair, qui lira ce réglage au lot du pari éclair.', 'nombre', '0.70', 0, 1.5, false, true, false, null, 25),
  ('frais.serie.facteur', 'frais', 'Frais de La Série', 'Les frais d''une manche de La Série valent ce facteur fois ceux d''une mise éclair ; calculés par le moteur éclair, branchés au lot du pari éclair.', 'nombre', '0.5', 0, 1, false, true, false, null, 26),
  ('frais.blitz.commission', 'frais', 'Prélèvement du Blitz', 'Part de la cagnotte du Blitz Royale gardée par Wimoro ; calculée par le moteur éclair, branchée au lot du pari éclair.', 'nombre', '0.05', 0, 0.15, false, true, false, null, 27),
  ('frais.combines.commission', 'frais', 'Frais des combinés', 'Part du gain brut d''un pari combiné prélevée à sa validation.', 'nombre', '0.05', 0, 0.2, false, true, true, null, 28),
  ('frais.stacks.commission', 'frais', 'Frais des duels de stack', 'Part de la cagnotte d''un duel de stack gardée par Wimoro.', 'nombre', '0.04', 0, 0.15, false, true, true, null, 29),
  ('frais.guerres.commission', 'frais', 'Frais des guerres de clans', 'Part de la cagnotte d''une guerre de clans gardée par Wimoro.', 'nombre', '0.04', 0, 0.15, false, true, true, null, 30),
  ('frais.copies.part_copie', 'frais', 'Part du joueur copié', 'Part des frais d''un pari copié reversée au joueur copié.', 'nombre', '0.20', 0, 0.5, false, true, true, null, 31),
  ('frais.retraits.base', 'frais', 'Retrait sur Base', 'Frais fixes, en dollars, d''un retrait crypto sur le réseau Base.', 'nombre', '0.05', 0, 20, false, true, true, null, 32),
  ('frais.retraits.ethereum', 'frais', 'Retrait sur Ethereum', 'Frais fixes, en dollars, d''un retrait crypto sur le réseau Ethereum.', 'nombre', '2', 0, 20, false, true, true, null, 33),
  ('frais.retraits.arbitrum', 'frais', 'Retrait sur Arbitrum', 'Frais fixes, en dollars, d''un retrait crypto sur le réseau Arbitrum.', 'nombre', '0.1', 0, 20, false, true, true, null, 34),
  ('frais.retraits.polygon', 'frais', 'Retrait sur Polygon', 'Frais fixes, en dollars, d''un retrait crypto sur le réseau Polygon.', 'nombre', '0.05', 0, 20, false, true, true, null, 35),
  ('frais.retraits.solana', 'frais', 'Retrait sur Solana', 'Frais fixes, en dollars, d''un retrait crypto sur le réseau Solana.', 'nombre', '0.01', 0, 20, false, true, true, null, 36),
  ('frais.depots_fiat.card', 'frais', 'Dépôt par carte', 'Part du montant prélevée sur un dépôt par carte.', 'nombre', '0.025', 0, 0.05, false, true, true, null, 37),
  ('frais.depots_fiat.bank', 'frais', 'Dépôt par virement', 'Part du montant prélevée sur un dépôt par virement.', 'nombre', '0', 0, 0.05, false, true, true, null, 38),
  ('frais.depots_fiat.paypal', 'frais', 'Dépôt par PayPal', 'Part du montant prélevée sur un dépôt par PayPal.', 'nombre', '0.019', 0, 0.05, false, true, true, null, 39),
  ('frais.retraits_fiat.card', 'frais', 'Retrait vers une carte', 'Part du montant prélevée sur un retrait vers une carte.', 'nombre', '0.015', 0, 0.05, false, true, true, null, 40),
  ('frais.retraits_fiat.bank', 'frais', 'Retrait par virement', 'Part du montant prélevée sur un retrait par virement.', 'nombre', '0', 0, 0.05, false, true, true, null, 41),
  ('frais.retraits_fiat.paypal', 'frais', 'Retrait par PayPal', 'Part du montant prélevée sur un retrait par PayPal.', 'nombre', '0.01', 0, 0.05, false, true, true, null, 42),
  ('paris.mise_min', 'paris', 'Mise minimum d''un pari', 'Plus petite mise acceptée sur un marché, en dollars.', 'nombre', '1', 1, 1000, false, true, true, null, 50),
  ('paris.mise_max', 'paris', 'Mise maximum d''un pari', 'Plus grosse mise acceptée sur un marché, en dollars ; vide : seule la liquidité du marché limite la mise.', 'nombre', 'null', 1, 10000000, true, true, true, null, 51),
  ('eclair.mise_min', 'eclair', 'Mise minimum éclair', 'Plus petite mise acceptée sur un pari éclair, en dollars.', 'nombre', '1', 1, 10000, false, true, true, null, 60),
  ('eclair.mise_max', 'eclair', 'Mise maximum éclair', 'Plus grosse mise acceptée sur un pari éclair, en dollars.', 'nombre', '10000', 1, 10000, false, true, true, null, 61),
  ('eclair.be_marge', 'eclair', 'Marge du break even', 'Le break even est payé à sa cote juste moins cette marge ; calculé par le moteur éclair, branché au lot du pari éclair.', 'nombre', '0.05', 0.02, 0.15, false, true, false, null, 62),
  ('eclair.be_min', 'eclair', 'Cote minimum du break even', 'Plus petite cote du break even ; calculée par le moteur éclair, branchée au lot du pari éclair.', 'nombre', '5', 2, 10, false, true, false, null, 63),
  ('eclair.be_max', 'eclair', 'Cote maximum du break even', 'Plus grande cote du break even ; calculée par le moteur éclair, branchée au lot du pari éclair.', 'nombre', '40', 10, 50, false, true, false, null, 64),
  ('eclair.be_plafond', 'eclair', 'Plafond de gain éclair', 'Une mise éclair ne rapporte jamais plus que ce multiple ; calculé par le moteur éclair, branché au lot du pari éclair.', 'nombre', '50', 10, 50, false, true, false, null, 65),
  ('serie.mises', 'serie', 'Mises de La Série', 'Montants de départ acceptés pour La Série, en dollars.', 'liste', '[5, 10, 25, 50, 100]', 1, 1000, false, true, true, null, 70),
  ('blitz.buyin', 'blitz', 'Entrée du Blitz', 'Prix d''entrée d''un Blitz Royale ordinaire, en dollars.', 'nombre', '10', 1, 100, false, true, true, null, 80),
  ('blitz.buyin_prime', 'blitz', 'Entrée du Blitz de 21 h', 'Prix d''entrée du Blitz Royale de 21 h, en dollars.', 'nombre', '25', 1, 250, false, true, true, null, 81),
  ('blitz.rachat', 'blitz', 'Rachat du Blitz', 'Prix du rachat unique après une chute à la première manche, en dollars.', 'nombre', '50', 1, 500, false, true, true, null, 82),
  ('duels.mise_min', 'duels', 'Mise minimum d''un duel', 'Plus petite mise d''un duel entre amis, en dollars.', 'nombre', '5', 5, 5000, false, true, true, null, 90),
  ('duels.mise_max', 'duels', 'Mise maximum d''un duel', 'Plus grosse mise d''un duel entre amis, en dollars.', 'nombre', '5000', 5, 5000, false, true, true, null, 91),
  ('duels.expiration_h', 'duels', 'Expiration d''un duel', 'Un duel sur un marché que personne n''accepte est remboursé au bout de ce nombre d''heures.', 'entier', '48', 1, 168, false, true, true, null, 92),
  ('duels.max_ouverts', 'duels', 'Duels en attente', 'Nombre de duels en attente d''un adversaire qu''un joueur peut avoir à la fois.', 'entier', '10', 1, 50, false, true, true, null, 93),
  ('stacks.buyin_min', 'stacks', 'Entrée minimum d''un stack', 'Plus petite entrée d''un duel de stack, en dollars.', 'nombre', '5', 1, 1000, false, true, true, null, 100),
  ('stacks.buyin_max', 'stacks', 'Entrée maximum d''un stack', 'Plus grosse entrée d''un duel de stack, en dollars.', 'nombre', '1000', 5, 10000, false, true, true, null, 101),
  ('stacks.max_actifs', 'stacks', 'Stacks en cours', 'Nombre de duels de stack en cours qu''un joueur peut avoir à la fois.', 'entier', '5', 1, 20, false, true, true, null, 102),
  ('combines.mise_min', 'combines', 'Mise minimum d''un combiné', 'Plus petite mise d''un pari combiné, en dollars.', 'nombre', '2', 1, 1000, false, true, true, null, 110),
  ('combines.mise_max', 'combines', 'Mise maximum d''un combiné', 'Plus grosse mise d''un pari combiné, en dollars.', 'nombre', '1000', 2, 100000, false, true, true, null, 111),
  ('combines.gain_max', 'combines', 'Gain maximum d''un combiné', 'Un pari combiné ne rapporte jamais plus que ce montant, en dollars.', 'nombre', '50000', 1000, 1000000, false, true, true, null, 112),
  ('combines.encaisse_decote', 'combines', 'Encaissement anticipé d''un combiné', 'Un combiné encaissé avant la fin vaut sa valeur du moment multipliée par ce nombre (0,95 : 5 % de frais).', 'nombre', '0.95', 0.8, 1, false, true, true, null, 113),
  ('combines.selections_max', 'combines', 'Sélections d''un combiné', 'Nombre maximum de sélections dans un pari combiné.', 'entier', '6', 2, 10, false, true, true, null, 114),
  ('copies.budget_min', 'copies', 'Budget minimum d''une copie', 'Plus petit budget pour copier un joueur, en dollars.', 'nombre', '50', 5, 10000, false, true, true, null, 120),
  ('copies.mise_min', 'copies', 'Mise minimum copiée', 'Plus petite mise d''un pari copié, en dollars.', 'nombre', '5', 1, 1000, false, true, true, null, 121),
  ('copies.max_actives', 'copies', 'Copies en cours', 'Nombre de joueurs qu''on peut copier à la fois.', 'entier', '10', 1, 50, false, true, true, null, 122),
  ('clans.frais_creation', 'clans', 'Création d''un clan', 'Prix de création d''un clan, en dollars, non remboursable.', 'nombre', '50', 0, 1000, false, true, true, null, 130),
  ('clans.guerre_buyin', 'clans', 'Entrée d''une guerre de clans', 'Mise de chaque participant à une guerre de clans, en dollars.', 'nombre', '20', 0, 500, false, true, true, null, 131),
  ('depots.fiat_min', 'depots', 'Dépôt minimum par carte, virement ou PayPal', 'Plus petit dépôt par carte, virement ou PayPal, en dollars ; c''est aussi le plus petit retrait par ces moyens.', 'nombre', '10', 1, 1000, false, true, true, null, 140),
  ('depots.fiat_max', 'depots', 'Dépôt maximum par carte, virement ou PayPal', 'Plus gros dépôt par carte, virement ou PayPal, en dollars.', 'nombre', '5000', 10, 100000, false, true, true, null, 141),
  ('depots.max', 'depots', 'Dépôt maximum', 'Plus gros dépôt accepté, tous moyens confondus, en dollars.', 'nombre', '1000000', 1000, 1000000, false, true, true, null, 142),
  ('depots.max_jour', 'depots', 'Plafond de dépôt par jour', 'Total des dépôts d''un joueur sur 24 heures, en dollars ; vide : aucun plafond (le joueur peut toujours fixer le sien).', 'nombre', 'null', 1, 10000000, true, true, true, null, 143),
  ('depots.min.usdc', 'depots', 'Dépôt minimum en USDC', 'Plus petit dépôt accepté en USDC.', 'nombre', '5', 0.000001, 1000000, false, true, true, null, 144),
  ('depots.min.usdt', 'depots', 'Dépôt minimum en USDT', 'Plus petit dépôt accepté en USDT.', 'nombre', '5', 0.000001, 1000000, false, true, true, null, 145),
  ('depots.min.eth', 'depots', 'Dépôt minimum en ETH', 'Plus petit dépôt accepté en ETH.', 'nombre', '0.002', 0.000001, 1000000, false, true, true, null, 146),
  ('depots.min.btc', 'depots', 'Dépôt minimum en BTC', 'Plus petit dépôt accepté en BTC.', 'nombre', '0.0001', 0.000001, 1000000, false, true, true, null, 147),
  ('depots.min.sol', 'depots', 'Dépôt minimum en SOL', 'Plus petit dépôt accepté en SOL.', 'nombre', '0.03', 0.000001, 1000000, false, true, true, null, 148),
  ('retraits.min', 'retraits', 'Retrait crypto minimum', 'Plus petit retrait crypto, en dollars.', 'nombre', '5', 1, 1000, false, true, true, null, 150),
  ('retraits.max', 'retraits', 'Retrait maximum', 'Plus gros retrait accepté, en dollars ; vide : seul le solde limite le retrait.', 'nombre', 'null', 1, 10000000, true, true, true, null, 151),
  ('parrainage.bonus', 'parrainage', 'Bonus de parrainage', 'Montant offert au filleul à son inscription et au parrain au premier pari du filleul, en dollars.', 'nombre', '10', 0, 100, false, true, true, null, 160),
  ('chat.salons', 'chat', 'Salons : mode lent et fermeture', 'Pour chaque salon réglé : délai minimum entre deux messages d''un joueur, en secondes, et salon fermé ou non.', 'json', '{}', null, null, false, true, true, 'salon_regler', 170),
  ('chat.mots_interdits', 'chat', 'Mots interdits', 'Un message qui contient l''un de ces mots est refusé.', 'json', '[]', null, null, false, false, true, 'mots_interdits', 171),
  ('chat.mots_prives', 'chat', 'Mots interdits en privé', 'Les mots interdits valent aussi dans les messages privés.', 'booleen', 'false', null, null, false, false, true, 'mots_interdits', 172),
  ('site.maintenance', 'site', 'Maintenance', 'Pendant la maintenance, le serveur refuse toute action d''un joueur ; l''équipe passe.', 'booleen', 'false', null, null, false, true, true, 'maintenance', 180),
  ('site.maintenance_message', 'site', 'Message de maintenance', 'Texte affiché pendant la maintenance, en français, anglais et hébreu.', 'json', 'null', null, null, true, true, true, 'maintenance', 181),
  ('site.annonce', 'site', 'Annonce', 'Bandeau montré à tous les visiteurs et joueurs, jusqu''à sa date de fin.', 'json', 'null', null, null, true, true, true, 'annonce_publier', 182),
  ('equipe.mfa_obligatoire', 'equipe', 'Double authentification pour tous', 'Tout membre de l''équipe doit valider un code à six chiffres, même s''il n''en a pas encore enrôlé.', 'booleen', 'false', null, null, false, false, true, null, 190),
  ('equipe.moderateur_solde_max', 'equipe', 'Ajustement maximum d''un modérateur', 'Un modérateur ne peut pas ajuster un solde de plus de ce montant à la fois, en dollars.', 'nombre', '1000', 0, 100000, false, false, true, null, 191)
) as x(cle, categorie, libelle, explication, type, v, mn, mx, fac, pub, app, dedie, ordre)
on conflict (cle) do nothing;

-- Lecture : jamais d'exception ; clé absente ou valeur d'un autre type → la valeur par défaut donnée (la constante).
create or replace function wm.reglage(p_cle text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select r.valeur from wm.reglages r where r.cle = p_cle
$$;
create or replace function wm.reglage_num(p_cle text, p_defaut numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(r.valeur) = 'number' then (r.valeur #>> '{}')::numeric end from wm.reglages r where r.cle = p_cle), p_defaut)
$$;
create or replace function wm.reglage_bool(p_cle text, p_defaut boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(r.valeur) = 'boolean' then (r.valeur #>> '{}')::boolean end from wm.reglages r where r.cle = p_cle), p_defaut)
$$;
create or replace function wm.reglage_json(p_cle text, p_defaut jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(r.valeur, 'null'::jsonb) from wm.reglages r where r.cle = p_cle), p_defaut)
$$;

-- Écriture : la seule voie, appelée par les actions de l'équipe après leurs contrôles ; la révision avance.
create or replace function wm.reglage_ecrire(p_cle text, p_valeur jsonb, p_par uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_rev bigint;
begin
  update wm.reglages set valeur = coalesce(p_valeur, 'null'::jsonb), maj_at = now(), maj_par = p_par where cle = p_cle;
  if not found then perform wm.fail('reglage_inconnu'); end if;
  update wm.revisions set rev = rev + 1 where nom = 'reglages' returning rev into v_rev;
  return v_rev;
end $$;

-- Deux réglages qui se tiennent : un minimum ne dépasse jamais son maximum.
create or replace function wm.reglages_coherents() returns void
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  for c in select * from (values ('paris.mise_min', 'paris.mise_max'), ('eclair.mise_min', 'eclair.mise_max'), ('duels.mise_min', 'duels.mise_max'),
                                 ('stacks.buyin_min', 'stacks.buyin_max'), ('combines.mise_min', 'combines.mise_max'),
                                 ('depots.fiat_min', 'depots.fiat_max'), ('depots.fiat_max', 'depots.max')) x(a, b) loop
    if wm.reglage_num(c.a, null) > wm.reglage_num(c.b, null) then perform wm.fail('reglage_incoherent'); end if;
  end loop;
end $$;

create or replace function wm.reglage_vue(r wm.reglages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('cle', r.cle, 'categorie', r.categorie, 'libelle', r.libelle, 'explication', r.explication, 'type', r.type,
    'valeur', r.valeur, 'defaut', r.defaut, 'min', r.min, 'max', r.max, 'facultatif', r.facultatif, 'public', r.public,
    'applique', r.applique, 'dedie', r.dedie, 'maj_at', wm.en_ms(r.maj_at), 'maj_par', r.maj_par)
$$;

-- Ce que l'écran lit (visiteurs compris) : réglages publics, annonce en cours, maintenance. Ne réveille pas les bots.
create or replace function wm.site() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rev', coalesce((select v.rev from wm.revisions v where v.nom = 'reglages'), 0),
    'v', coalesce((select jsonb_object_agg(r.cle, r.valeur) from wm.reglages r where r.public), '{}'::jsonb),
    'annonce', (select a.valeur from wm.reglages a where a.cle = 'site.annonce' and jsonb_typeof(a.valeur) = 'object'
                and (wm.num(a.valeur ->> 'fin') is null or wm.num(a.valeur ->> 'fin') > extract(epoch from now()) * 1000)),
    'maintenance', jsonb_build_object('actif', wm.reglage_bool('site.maintenance', false),
                                      'message', wm.reglage_json('site.maintenance_message', 'null'::jsonb)))
$$;

-- ══ 2. Équipe ══
create table if not exists wm.equipe_membres (
  user_id uuid primary key references public.users (id) on delete cascade,
  role text not null check (role in ('administrateur', 'moderateur')),
  ajoute_par uuid,
  ajoute_at timestamptz,
  motif text,
  retire_at timestamptz,                            -- rempli : ne fait plus partie de l'équipe (rien n'est supprimé)
  retire_par uuid
);
alter table wm.equipe_membres enable row level security;
revoke all on wm.equipe_membres from public, anon, authenticated;

-- Le rôle d'un compte : sa ligne d'équipe si elle existe (vide si retiré), sinon « administrateur » pour un compte de
-- public.admin_users (l'ancien panneau), sinon aucun.
create or replace function wm.role_equipe(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when m.user_id is not null then case when m.retire_at is null then m.role end
              when exists (select 1 from public.admin_users a where a.user_id = x.u) then 'administrateur' end
  from (select p_user as u) x left join wm.equipe_membres m on m.user_id = x.u
$$;

create or replace function wm.equipe_nb_administrateurs() returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select m.user_id from wm.equipe_membres m where m.retire_at is null and m.role = 'administrateur'
    union
    select a.user_id from public.admin_users a where not exists (select 1 from wm.equipe_membres m where m.user_id = a.user_id)) x
$$;

-- Double authentification : niveau aal2 exigé dès que le compte a un code vérifié, ou pour tous si le réglage le dit.
create or replace function wm.equipe_aal_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') in ('aal2', 'aal3')
      or (not exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
          and not wm.reglage_bool('equipe.mfa_obligatoire', false))
$$;

-- ══ 3. Journal ══
create table if not exists wm.journal (
  id bigint primary key,                            -- rang dans la chaîne, posé par le déclencheur
  at timestamptz not null default now(),
  admin_id uuid,                                    -- vide : automate ou migration
  role text,
  origine text not null default 'panneau' check (origine in ('panneau', 'ancien_panneau', 'automate', 'migration')),
  action text not null,
  cible_type text,                                  -- joueur, membre, reglage, message, clan, bots…
  cible text,
  avant jsonb,
  apres jsonb,
  motif text,
  inverse jsonb,                                    -- {action, p} : ce qui annule cette entrée ; vide : non annulable
  annule_id bigint,                                 -- l'entrée que celle-ci annule
  precedente bytea,                                 -- empreinte de l'entrée précédente
  empreinte bytea not null                          -- SHA-256 de cette entrée et de la précédente
);
alter table wm.journal enable row level security;
revoke all on wm.journal from public, anon, authenticated;
create index if not exists idx_journal_cible on wm.journal (cible_type, cible, id desc);
create index if not exists idx_journal_admin on wm.journal (admin_id, id desc);
create index if not exists idx_journal_action on wm.journal (action, id desc);
create index if not exists idx_journal_at on wm.journal (at);
create unique index if not exists idx_journal_annule on wm.journal (annule_id) where annule_id is not null;   -- une entrée ne s'annule qu'une fois

create or replace function wm.journal_empreinte(e wm.journal) returns bytea
language sql stable set search_path = '' as $$
  select sha256(convert_to(jsonb_build_array(encode(e.precedente, 'hex'), e.id, (extract(epoch from e.at) * 1000000)::bigint, e.admin_id, e.role,
    e.origine, e.action, e.cible_type, e.cible, e.avant, e.apres, e.motif, e.inverse, e.annule_id)::text, 'UTF8'))
$$;

-- Chaque entrée reçoit son rang et son empreinte, une à la fois (verrou), quelles que soient les valeurs proposées.
create or replace function wm.journal_avant_ajout() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_prec wm.journal;
begin
  perform pg_advisory_xact_lock(hashtext('wm.journal'));
  select * into v_prec from wm.journal j order by j.id desc limit 1;
  new.id := coalesce(v_prec.id, 0) + 1;
  new.at := coalesce(new.at, now());
  new.precedente := v_prec.empreinte;
  new.empreinte := wm.journal_empreinte(new);
  return new;
end $$;
create trigger journal_chaine before insert on wm.journal for each row execute function wm.journal_avant_ajout();
alter table wm.journal enable always trigger journal_chaine;

-- Refait la chaîne : la première entrée dont le rang, le lien ou l'empreinte ne tient pas est signalée.
create or replace function wm.journal_verifier() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e wm.journal; v_prec bytea; v_attendu bigint := 1;
begin
  for e in select * from wm.journal j order by j.id loop
    if e.id <> v_attendu or e.precedente is distinct from v_prec or e.empreinte is distinct from wm.journal_empreinte(e) then
      return jsonb_build_object('ok', false, 'n', (select count(*) from wm.journal), 'rompue', e.id,
        'tete', (select encode(j.empreinte, 'hex') from wm.journal j order by j.id desc limit 1));
    end if;
    v_prec := e.empreinte; v_attendu := e.id + 1;
  end loop;
  return jsonb_build_object('ok', true, 'n', v_attendu - 1, 'rompue', null, 'tete', encode(v_prec, 'hex'));
end $$;

-- Une entrée : rôle de l'auteur au moment de l'action ; l'annulation en cours (le cas échéant) est notée par la porte.
create or replace function wm.journal_noter(p_admin uuid, p_action text, p_cible_type text, p_cible text, p_avant jsonb, p_apres jsonb,
                                            p_motif text, p_inverse jsonb default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into wm.journal (admin_id, role, origine, action, cible_type, cible, avant, apres, motif, inverse, annule_id)
  values (p_admin, wm.role_equipe(p_admin), coalesce(nullif(current_setting('wm.journal_origine', true), ''), 'panneau'), p_action, p_cible_type, p_cible,
          p_avant, p_apres, nullif(left(btrim(coalesce(p_motif, '')), 500), ''), p_inverse, nullif(current_setting('wm.annule_id', true), '')::bigint)
  returning id into v_id;
  return v_id;
end $$;

-- Les décisions de l'ancien panneau (wm.admin_journal) sont recopiées dans le journal, telles quelles.
create or replace function wm.journal_ancien_type(p_action text) returns text
language sql immutable set search_path = '' as $$
  select case when p_action in ('solde', 'xp', 'rang', 'kyc', 'suspension', 'suspension_levee', 'message_masque') then 'joueur'
              when p_action like 'marche\_%' then 'marche' when p_action = 'bots' then 'bots' end
$$;
create or replace function wm.journal_copier_ancien() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('wm.porte_equipe', true), '') = 'on' then return null; end if;   -- la nouvelle porte journalise elle-même
  insert into wm.journal (at, admin_id, role, origine, action, cible_type, cible, apres, motif)
  values (new.at, new.admin_id, wm.role_equipe(new.admin_id), 'ancien_panneau', new.action, wm.journal_ancien_type(new.action), new.cible,
          new.detail, nullif(left(btrim(coalesce(new.detail ->> 'motif', '')), 500), ''));
  return null;
end $$;
insert into wm.journal (at, admin_id, role, origine, action, cible_type, cible, apres, motif)
select a.at, a.admin_id, wm.role_equipe(a.admin_id), 'ancien_panneau', a.action, wm.journal_ancien_type(a.action), a.cible, a.detail,
       nullif(left(btrim(coalesce(a.detail ->> 'motif', '')), 500), '')
from wm.admin_journal a order by a.id;
create trigger admin_journal_copie after insert on wm.admin_journal for each row execute function wm.journal_copier_ancien();

create or replace function wm.journal_vue(j wm.journal) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', j.id, 'at', wm.en_ms(j.at), 'admin', j.admin_id,
    'par', coalesce((select u.username from public.users u where u.id = j.admin_id), j.admin_id::text, 'automate'),
    'role', j.role, 'origine', j.origine, 'action', j.action, 'cible_type', j.cible_type, 'cible', j.cible,
    'avant', j.avant, 'apres', j.apres, 'motif', j.motif, 'annule_id', j.annule_id,
    'annulee_par', (select x.id from wm.journal x where x.annule_id = j.id),
    'annulable', j.inverse is not null and not exists (select 1 from wm.journal x where x.annule_id = j.id))
$$;

create or replace function wm.journal_choisir(p_admin uuid, p_joueur uuid, p_action text, p_du timestamptz, p_au timestamptz, p_avant bigint)
returns setof wm.journal
language sql stable security definer set search_path = '' as $$
  select x.* from wm.journal x
  where (p_admin is null or x.admin_id = p_admin)
    and (p_joueur is null or (x.cible_type = 'joueur' and x.cible = p_joueur::text))
    and (p_action is null or x.action = p_action)
    and (p_du is null or x.at >= p_du) and (p_au is null or x.at < p_au)
    and (p_avant is null or x.id < p_avant)
$$;

-- Une cellule CSV (RFC 4180) : toujours entre guillemets, guillemets doublés ; une cellule qui commencerait par un signe
-- de formule (= + - @, tabulation, retour) reçoit une apostrophe devant, pour que le tableur ne l'exécute pas.
create or replace function wm.csv_champ(t text) returns text
language sql immutable set search_path = '' as $$
  select '"' || replace(case when left(coalesce(t, ''), 1) in ('=', '+', '-', '@', chr(9), chr(13)) then '''' || t else coalesce(t, '') end, '"', '""') || '"'
$$;

-- ── Annuler une entrée exige que la cible soit encore dans l'état noté « après » : l'état actuel, sous la même forme ──
create or replace function wm.eq_etat(e wm.journal) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if e.cible_type = 'reglage' then return (select jsonb_build_object('valeur', r.valeur) from wm.reglages r where r.cle = e.cible); end if;
  if e.cible_type = 'membre' then return jsonb_build_object('role', wm.role_equipe(wm.eq_uuid(e.cible))); end if;
  return null;                                      -- pas de contrôle d'état pour les autres cibles
end $$;

-- ══ 4. La porte ══
create table if not exists wm.equipe_actions (
  action text primary key,
  fonction text not null,                           -- wm.eq_<action>(p_admin uuid, p jsonb) → jsonb
  famille text not null,                            -- reglages, equipe, journal, joueurs, chat, site, tableau
  roles text[] not null,
  ecrit boolean not null default false,             -- écrit quelque chose (motif éventuel, débit de 120 par minute)
  motif boolean not null default false,             -- motif obligatoire (3 caractères au moins)
  annulable boolean not null default false,
  description text not null
);
alter table wm.equipe_actions enable row level security;
revoke all on wm.equipe_actions from public, anon, authenticated;

create or replace function wm.eq_moi(p_admin uuid, p_role text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', p_role, 'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'facteurs', (select count(*) from auth.mfa_factors f where f.user_id = p_admin and f.status = 'verified'),
    'mfa_requise', p_role is not null and not wm.equipe_aal_ok(p_admin),
    'permissions', coalesce((select jsonb_agg(a.action order by a.action) from wm.equipe_actions a where p_role = any (a.roles)), '[]'::jsonb),
    'ancien_panneau', wm.is_admin())
$$;

-- La seule porte du panneau. Le rôle est vérifié à chaque appel, pour chaque action ; un joueur ordinaire n'apprend rien
-- (« interdit », même pour une action qui n'existe pas).
create or replace function wm.equipe(p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_role text; a wm.equipe_actions; v_res jsonb;
begin
  p := coalesce(p, '{}'::jsonb);
  if jsonb_typeof(p) <> 'object' then perform wm.fail('requete'); end if;
  v_role := wm.role_equipe(v_uid);
  if p_action = 'moi' then return wm.eq_moi(v_uid, v_role); end if;
  if v_role is null then perform wm.fail('interdit'); end if;
  select * into a from wm.equipe_actions x where x.action = p_action;
  if not found then perform wm.fail('action_inconnue'); end if;
  if not (v_role = any (a.roles)) then perform wm.fail('interdit'); end if;
  if not wm.equipe_aal_ok(v_uid) then perform wm.fail('mfa_requise'); end if;
  if a.ecrit then
    if a.motif and char_length(btrim(coalesce(p ->> 'motif', ''))) < 3 then perform wm.fail('motif_requis'); end if;
    perform wm.debit(v_uid, 'equipe', 120, 'trop_vite');
  end if;
  perform set_config('wm.porte_equipe', 'on', true);
  execute format('select %s($1, $2)', a.fonction::regproc) using v_uid, p into v_res;
  perform set_config('wm.porte_equipe', '', true);
  return v_res;
end $$;
create or replace function public.api_equipe(p_action text, p jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.equipe(p_action, p) $$;

create or replace function public.api_site() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.site() $$;

-- ── Actions : réglages ──
create or replace function wm.eq_reglages_lire(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'reglages', coalesce((select jsonb_agg(wm.reglage_vue(r) order by r.categorie, r.ordre, r.cle) from wm.reglages r
                          where coalesce(p ->> 'categorie', '') = '' or r.categorie = p ->> 'categorie'), '[]'::jsonb),
    'bots', coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb),
    'rev', coalesce((select v.rev from wm.revisions v where v.nom = 'reglages'), 0))
$$;

create or replace function wm.eq_reglage_modifier(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r wm.reglages; v jsonb := p -> 'valeur'; v_n numeric; x jsonb; v_rev bigint; v_j bigint;
begin
  select * into r from wm.reglages g where g.cle = p ->> 'cle' for update;
  if not found then perform wm.fail('reglage_inconnu'); end if;
  if r.dedie is not null or r.type = 'json' then perform wm.fail('reglage_dedie'); end if;
  if not r.applique then perform wm.fail('reglage_inactif'); end if;
  if not (p ? 'valeur') then perform wm.fail('reglage_invalide'); end if;
  if r.type in ('nombre', 'entier') then
    if jsonb_typeof(v) = 'null' then
      if not r.facultatif then perform wm.fail('reglage_invalide'); end if;
    else
      if jsonb_typeof(v) <> 'number' then perform wm.fail('reglage_invalide'); end if;
      v_n := (v #>> '{}')::numeric;
      if (r.min is not null and v_n < r.min) or (r.max is not null and v_n > r.max) or (r.type = 'entier' and v_n <> trunc(v_n)) then
        perform wm.fail('reglage_invalide');
      end if;
    end if;
  elsif r.type = 'booleen' then
    if jsonb_typeof(v) <> 'boolean' then perform wm.fail('reglage_invalide'); end if;
  elsif r.type = 'liste' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) < 1 or jsonb_array_length(v) > 10 then perform wm.fail('reglage_invalide'); end if;
    for x in select e from jsonb_array_elements(v) e loop
      if jsonb_typeof(x) <> 'number' or (r.min is not null and (x #>> '{}')::numeric < r.min) or (r.max is not null and (x #>> '{}')::numeric > r.max) then
        perform wm.fail('reglage_invalide');
      end if;
    end loop;
    if (select count(distinct e) from jsonb_array_elements(v) e) <> jsonb_array_length(v) then perform wm.fail('reglage_invalide'); end if;
  else
    perform wm.fail('reglage_dedie');
  end if;
  if v = r.valeur then perform wm.fail('reglage_inchange'); end if;
  v_rev := wm.reglage_ecrire(r.cle, v, p_admin);
  perform wm.reglages_coherents();
  v_j := wm.journal_noter(p_admin, 'reglage_modifier', 'reglage', r.cle, jsonb_build_object('valeur', r.valeur), jsonb_build_object('valeur', v),
    p ->> 'motif', jsonb_build_object('action', 'reglage_modifier', 'p', jsonb_build_object('cle', r.cle, 'valeur', r.valeur)));
  return jsonb_build_object('reglage', (select wm.reglage_vue(g) from wm.reglages g where g.cle = r.cle), 'rev', v_rev, 'journal', v_j);
end $$;

-- ── Actions : équipe ──
create or replace function wm.eq_equipe_liste(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('membres', coalesce((select jsonb_agg(x.m order by x.actif desc, x.role, x.n) from (
    select m.retire_at is null as actif, m.role, u.username as n,
           jsonb_build_object('id', u.id, 'n', u.username, 'email', coalesce(a.email, ''), 'role', m.role, 'actif', m.retire_at is null, 'origine', 'equipe',
             'ajoute_at', wm.en_ms(m.ajoute_at), 'retire_at', wm.en_ms(m.retire_at),
             'facteurs', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')) as m
    from wm.equipe_membres m join public.users u on u.id = m.user_id left join auth.users a on a.id = m.user_id
    union all
    select true, 'administrateur', u.username,
           jsonb_build_object('id', u.id, 'n', u.username, 'email', coalesce(a.email, ''), 'role', 'administrateur', 'actif', true, 'origine', 'ancien',
             'ajoute_at', wm.en_ms(d.created_at), 'retire_at', null,
             'facteurs', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
    from public.admin_users d join public.users u on u.id = d.user_id left join auth.users a on a.id = d.user_id
    where not exists (select 1 from wm.equipe_membres m where m.user_id = d.user_id)) x), '[]'::jsonb))
$$;

-- Ajouter un membre : un compte joueur existant, confirmé, ni bot ni compte de test, désigné par son e-mail ou son identifiant.
create or replace function wm.eq_equipe_ajouter(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_role text := p ->> 'role'; v_user uuid; u record;
begin
  if v_role is null or v_role not in ('administrateur', 'moderateur') then perform wm.fail('role_invalide'); end if;
  if p ? 'id' then v_user := wm.eq_uuid(p ->> 'id');
  else select a.id into v_user from auth.users a where lower(a.email) = lower(btrim(coalesce(p ->> 'email', ''))); end if;
  select x.id, coalesce(x.is_demo, false) as bot, coalesce(x.is_test, false) as essai, a.email, a.email_confirmed_at into u
  from public.users x left join auth.users a on a.id = x.id where x.id = v_user;
  if not found or v_user is null then perform wm.fail('joueur_inconnu'); end if;
  if u.bot or u.essai or u.email is null or u.email_confirmed_at is null or wm.est_compte_test(u.email) then perform wm.fail('compte_refuse'); end if;
  if wm.role_equipe(v_user) is not null then perform wm.fail('deja_membre'); end if;
  insert into wm.equipe_membres (user_id, role, ajoute_par, ajoute_at, motif, retire_at, retire_par)
  values (v_user, v_role, p_admin, now(), left(btrim(coalesce(p ->> 'motif', '')), 500), null, null)
  on conflict (user_id) do update set role = excluded.role, ajoute_par = excluded.ajoute_par, ajoute_at = excluded.ajoute_at, motif = excluded.motif,
    retire_at = null, retire_par = null;
  perform wm.journal_noter(p_admin, 'equipe_ajouter', 'membre', v_user::text, jsonb_build_object('role', null), jsonb_build_object('role', v_role),
    p ->> 'motif', jsonb_build_object('action', 'equipe_retirer', 'p', jsonb_build_object('id', v_user)));
  return wm.eq_equipe_liste(p_admin, '{}'::jsonb);
end $$;

create or replace function wm.eq_equipe_retirer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_avant text := wm.role_equipe(wm.eq_uuid(p ->> 'id'));
begin
  if v_avant is null then perform wm.fail('membre_inconnu'); end if;
  if v_avant = 'administrateur' and wm.equipe_nb_administrateurs() <= 1 then perform wm.fail('dernier_administrateur'); end if;
  insert into wm.equipe_membres (user_id, role, ajoute_at, motif, retire_at, retire_par)
  values (v_user, v_avant, (select a.created_at from public.admin_users a where a.user_id = v_user), left(btrim(coalesce(p ->> 'motif', '')), 500), now(), p_admin)
  on conflict (user_id) do update set retire_at = now(), retire_par = p_admin, motif = excluded.motif;
  perform wm.journal_noter(p_admin, 'equipe_retirer', 'membre', v_user::text, jsonb_build_object('role', v_avant), jsonb_build_object('role', null),
    p ->> 'motif', jsonb_build_object('action', 'equipe_ajouter', 'p', jsonb_build_object('id', v_user, 'role', v_avant)));
  return wm.eq_equipe_liste(p_admin, '{}'::jsonb);
end $$;

create or replace function wm.eq_equipe_role(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_avant text := wm.role_equipe(wm.eq_uuid(p ->> 'id')); v_role text := p ->> 'role';
begin
  if v_avant is null then perform wm.fail('membre_inconnu'); end if;
  if v_role is null or v_role not in ('administrateur', 'moderateur') then perform wm.fail('role_invalide'); end if;
  if v_role = v_avant then perform wm.fail('role_inchange'); end if;
  if v_avant = 'administrateur' and wm.equipe_nb_administrateurs() <= 1 then perform wm.fail('dernier_administrateur'); end if;
  insert into wm.equipe_membres (user_id, role, ajoute_par, ajoute_at, motif)
  values (v_user, v_role, p_admin, coalesce((select a.created_at from public.admin_users a where a.user_id = v_user), now()), left(btrim(coalesce(p ->> 'motif', '')), 500))
  on conflict (user_id) do update set role = excluded.role, motif = excluded.motif;
  perform wm.journal_noter(p_admin, 'equipe_role', 'membre', v_user::text, jsonb_build_object('role', v_avant), jsonb_build_object('role', v_role),
    p ->> 'motif', jsonb_build_object('action', 'equipe_role', 'p', jsonb_build_object('id', v_user, 'role', v_avant)));
  return wm.eq_equipe_liste(p_admin, '{}'::jsonb);
end $$;

-- ── Actions : journal ──
create or replace function wm.eq_journal_lire(p_admin uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_n integer := least(greatest(coalesce(wm.num(p ->> 'n')::integer, 50), 1), 200);
  v_admin uuid := wm.eq_uuid(p ->> 'admin'); v_joueur uuid := wm.eq_uuid(p ->> 'joueur');
  v_action text := nullif(btrim(coalesce(p ->> 'action', '')), ''); v_res jsonb; v_min bigint; v_nb integer;
begin
  -- un modérateur lit ses propres entrées, ou celles d'un joueur qu'il ouvre
  if wm.role_equipe(p_admin) is distinct from 'administrateur' and v_joueur is null then v_admin := p_admin; end if;
  select coalesce(jsonb_agg(wm.journal_vue(j) order by j.id desc), '[]'::jsonb), min(j.id), count(*) into v_res, v_min, v_nb
  from (select * from wm.journal_choisir(v_admin, v_joueur, v_action, wm.eq_date(p ->> 'du'), wm.eq_date(p ->> 'au'), wm.num(p ->> 'avant')::bigint) x
        order by x.id desc limit v_n) j;
  return jsonb_build_object('entrees', v_res, 'suite', case when v_nb = v_n then v_min end);
end $$;

create or replace function wm.eq_journal_csv(p_admin uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_admin uuid := wm.eq_uuid(p ->> 'admin'); v_joueur uuid := wm.eq_uuid(p ->> 'joueur');
  v_action text := nullif(btrim(coalesce(p ->> 'action', '')), ''); v_du timestamptz := wm.eq_date(p ->> 'du'); v_au timestamptz := wm.eq_date(p ->> 'au');
  v_n integer; v_corps text;
begin
  select count(*) into v_n from (select 1 from wm.journal_choisir(v_admin, v_joueur, v_action, v_du, v_au, null) limit 10001) c;
  select string_agg(concat_ws(',', wm.csv_champ(e.id::text),
      wm.csv_champ(to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      wm.csv_champ(to_char(e.at at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS')),
      wm.csv_champ(coalesce((select u.username from public.users u where u.id = e.admin_id), e.admin_id::text, 'automate')),
      wm.csv_champ(e.role), wm.csv_champ(e.action), wm.csv_champ(e.cible_type), wm.csv_champ(e.cible), wm.csv_champ(e.motif),
      wm.csv_champ(e.avant::text), wm.csv_champ(e.apres::text), wm.csv_champ(e.annule_id::text), wm.csv_champ(e.origine),
      wm.csv_champ(encode(e.empreinte, 'hex'))), E'\r\n' order by e.id) into v_corps
  from (select * from wm.journal_choisir(v_admin, v_joueur, v_action, v_du, v_au, null) x order by x.id limit 10000) e;
  return jsonb_build_object(
    'csv', chr(65279) || '"id","date_utc","date_paris","qui","role","action","cible_type","cible","motif","avant","apres","annule_id","origine","empreinte"'
           || E'\r\n' || coalesce(v_corps || E'\r\n', ''),
    'lignes', least(v_n, 10000), 'tronque', v_n > 10000,
    'nom', 'wimoro-journal-' || to_char(now() at time zone 'Europe/Paris', 'YYYYMMDD') || '.csv');
end $$;

create or replace function wm.eq_journal_verifier(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$ select wm.journal_verifier() $$;

-- Annuler : l'inverse noté au moment de l'action passe par la porte (mêmes droits, mêmes contrôles) et se journalise avec
-- le numéro de l'entrée annulée ; l'entrée d'origine n'est jamais modifiée.
create or replace function wm.eq_journal_annuler(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e wm.journal; a wm.equipe_actions; v_etat jsonb; v_res jsonb;
begin
  select * into e from wm.journal j where j.id = wm.num(p ->> 'id')::bigint for update;
  if not found then perform wm.fail('entree_inconnue'); end if;
  if e.inverse is null then perform wm.fail('non_annulable'); end if;
  if exists (select 1 from wm.journal j where j.annule_id = e.id) then perform wm.fail('deja_annule'); end if;
  select * into a from wm.equipe_actions x where x.action = e.action;
  -- un modérateur n'annule que ses propres décisions sur les joueurs et le chat
  if wm.role_equipe(p_admin) is distinct from 'administrateur' and (e.admin_id is distinct from p_admin or coalesce(a.famille, '') not in ('joueurs', 'chat')) then
    perform wm.fail('interdit');
  end if;
  v_etat := wm.eq_etat(e);
  if v_etat is not null and v_etat is distinct from e.apres then perform wm.fail('deja_modifie'); end if;
  perform set_config('wm.annule_id', e.id::text, true);
  v_res := wm.equipe(e.inverse ->> 'action', coalesce(e.inverse -> 'p', '{}'::jsonb)
                     || jsonb_build_object('motif', 'Annulation de l''entrée n° ' || e.id || ' : ' || btrim(coalesce(p ->> 'motif', ''))));
  perform set_config('wm.annule_id', '', true);
  return coalesce(v_res, '{}'::jsonb) || jsonb_build_object('annule', e.id);
end $$;

-- ── Le registre ──
insert into wm.equipe_actions (action, fonction, famille, roles, ecrit, motif, annulable, description) values
  ('reglages_lire', 'wm.eq_reglages_lire', 'reglages', '{administrateur}', false, false, false, 'Lire les réglages (frais, limites, mises) et le réglage des bots.'),
  ('reglage_modifier', 'wm.eq_reglage_modifier', 'reglages', '{administrateur}', true, true, true, 'Changer un réglage, dans ses bornes ; il vaut dès l''action suivante.'),
  ('equipe_liste', 'wm.eq_equipe_liste', 'equipe', '{administrateur}', false, false, false, 'Voir les membres de l''équipe et leur rôle.'),
  ('equipe_ajouter', 'wm.eq_equipe_ajouter', 'equipe', '{administrateur}', true, true, true, 'Ajouter un compte joueur à l''équipe, par son e-mail, avec un rôle.'),
  ('equipe_retirer', 'wm.eq_equipe_retirer', 'equipe', '{administrateur}', true, true, true, 'Retirer un membre de l''équipe (jamais le dernier administrateur).'),
  ('equipe_role', 'wm.eq_equipe_role', 'equipe', '{administrateur}', true, true, true, 'Changer le rôle d''un membre.'),
  ('journal_lire', 'wm.eq_journal_lire', 'journal', '{administrateur,moderateur}', false, false, false, 'Lire le journal, avec des filtres (auteur, joueur, action, dates).'),
  ('journal_csv', 'wm.eq_journal_csv', 'journal', '{administrateur}', false, false, false, 'Exporter le journal en CSV (10 000 lignes au plus par export).'),
  ('journal_verifier', 'wm.eq_journal_verifier', 'journal', '{administrateur}', false, false, false, 'Vérifier la chaîne d''empreintes du journal.'),
  ('journal_annuler', 'wm.eq_journal_annuler', 'journal', '{administrateur,moderateur}', true, true, false, 'Annuler une entrée du journal (l''annulation est elle-même journalisée).')
on conflict (action) do update set fonction = excluded.fonction, famille = excluded.famille, roles = excluded.roles, ecrit = excluded.ecrit,
  motif = excluded.motif, annulable = excluded.annulable, description = excluded.description;

-- ══ 5. Contrôles ajoutés à trois fonctions existantes ══
-- wm.is_admin : la même condition, et le compte est toujours administrateur de l'équipe (pas retiré, pas devenu modérateur).
CREATE OR REPLACE FUNCTION wm.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
    and wm.role_equipe((select auth.uid())) is not distinct from 'administrateur'      -- [ajout] retiré de l'équipe : plus d'accès
$function$;

-- wm.admin : la double authentification, dès qu'un code est enrôlé (une ligne ajoutée après le contrôle du rôle).
CREATE OR REPLACE FUNCTION wm.admin(p_action text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin uuid := wm.uid(); v_res jsonb;
begin
  if p_action = 'moi' then return jsonb_build_object('admin', wm.is_admin()); end if;
  if not wm.is_admin() then perform wm.fail('interdit'); end if;
  if not wm.equipe_aal_ok(v_admin) then perform wm.fail('mfa_requise'); end if;   -- [ajout] double authentification
  p := coalesce(p, '{}'::jsonb);
  case p_action
    when 'chiffres' then v_res := wm.adm_chiffres();
    when 'joueurs' then v_res := wm.adm_joueurs(p ->> 'q');
    when 'joueur' then v_res := wm.adm_joueur((p ->> 'id')::uuid);
    when 'solde' then v_res := wm.adm_solde(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 'delta'), p ->> 'motif');
    when 'xp' then v_res := wm.adm_xp(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 'delta')::integer);
    when 'rang' then v_res := wm.adm_rang(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 't')::integer, wm.num(p ->> 'd')::integer);
    when 'kyc' then v_res := wm.adm_kyc(v_admin, (p ->> 'id')::uuid, (p ->> 'ok')::boolean);
    when 'suspendre' then v_res := wm.adm_suspendre(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 'jours')::integer, p ->> 'motif');
    when 'marches' then v_res := wm.adm_marches();
    when 'marche' then v_res := wm.adm_marche_enregistrer(v_admin, p);
    when 'marche_etat' then v_res := wm.adm_marche_etat(v_admin, p ->> 'id', p ->> 'etat');
    when 'resoudre' then v_res := wm.adm_marche_resoudre(v_admin, p ->> 'id', p ->> 'issue');
    when 'chat' then v_res := wm.adm_chat();
    when 'masquer' then v_res := wm.adm_chat_masquer(v_admin, wm.num(p ->> 'id')::bigint);
    when 'bots' then v_res := wm.adm_bots(v_admin, p);
    when 'journal' then v_res := wm.adm_journal();
    else perform wm.fail('action_inconnue');
  end case;
  return v_res;
end $function$;

-- wm.droits : les trois listes sont complétées par des données (wm.droits_liste) ; un lot ajoute un nom sans réécrire la fonction.
create table if not exists wm.droits_liste (
  nom text not null,                                -- nom après « api_ » (ou de la fonction wm pour une règle d'accès)
  qui text not null check (qui in ('visiteur', 'service', 'regle')),
  primary key (nom, qui)
);
alter table wm.droits_liste enable row level security;
revoke all on wm.droits_liste from public, anon, authenticated;
insert into wm.droits_liste (nom, qui) values ('site', 'visiteur') on conflict do nothing;

CREATE OR REPLACE FUNCTION wm.droits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  visiteur text[] := array['pseudo_libre', 'markets'];     -- appelables sans être connecté
  service text[] := array['login_lookup'];                 -- Edge Functions seulement (clé de service)
  regles text[] := array['clan_sujet', 'vip_ok'];          -- appelées par une règle d'accès (RLS), au nom du joueur connecté
  api text[]; f record; nom text;
begin
  visiteur := visiteur || coalesce((select array_agg(l.nom order by l.nom) from wm.droits_liste l where l.qui = 'visiteur'), '{}'::text[]);   -- [ajout]
  service := service || coalesce((select array_agg(l.nom order by l.nom) from wm.droits_liste l where l.qui = 'service'), '{}'::text[]);      -- [ajout]
  regles := regles || coalesce((select array_agg(l.nom order by l.nom) from wm.droits_liste l where l.qui = 'regle'), '{}'::text[]);          -- [ajout]
  select coalesce(array_agg(substr(p.proname, 5)), '{}') into api
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'api\_%';
  for f in
    select p.oid::regprocedure as sig, p.proname, n.nspname
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wm' or (n.nspname = 'public' and (p.proname like 'api\_%' or p.proname like 'srv\_%'))
  loop
    nom := case when f.nspname = 'wm' then f.proname else substr(f.proname, 5) end;
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'srv\_%' or (f.nspname = 'wm' and nom = any (service)) then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif nom = any (visiteur) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif nom = any (api) or (f.nspname = 'wm' and nom = any (regles)) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $function$;

select wm.droits();
