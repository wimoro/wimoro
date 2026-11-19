# Données réelles de Wimoro

Ce document explique d'où viennent les données réelles du site (cours, scores, sujets d'actualité, images), comment
elles sont récupérées, gardées en cache et servies, et ce qu'il faut pour les faire marcher. Il s'adresse à l'équipe qui
reprendra le projet. Il est écrit en deux temps :

- **§ 1, la recherche des sources** (19 novembre 2026, avant tout code) : chaque source essayée, le résultat du vrai
  appel, la clé, le quota, le délai, l'appel depuis le serveur, les conditions d'usage, la décision. Les notes complètes,
  avec chaque appel, sont dans [`docs/donnees/`](donnees/) (une note par type de données).
- **§ 2 et suivants, l'architecture et les procédures**, rédigés avec le code (branche `marches-et-admin`).

Rappel de la règle : le serveur (fonctions Supabase et tâches planifiées) va chercher les données, les met en cache et
les sert au site. Le navigateur n'appelle jamais une API qui demande une clé ou qui a un quota serré. Il peut lire
directement un flux public sans clé si ses conditions d'usage le permettent.

---

## 1. Recherche des sources (19 novembre 2026)

### 1.1 Méthode

- Point de départ : le répertoire <https://github.com/public-apis/public-apis> (sections Cryptocurrency, Finance,
  Currency Exchange, Business, Sports & Fitness, News, Open Data, Machine Learning, Photography), complété par des
  recherches sur le web (pages de tarifs, documentation, conditions d'usage).
- Six recherches menées en parallèle, une par type de données : crypto ; actions et indices ; matières premières et
  devises ; sport ; actualité, tendances et IA ; images. **Au moins trois sources candidates par type**, toutes testées
  par de vrais appels, le 19/11/2026 entre 12:56 et 13:36 UTC. Environ 1 000 appels en tout, sans créer de compte ni
  utiliser de clé (une source à clé est appelée sans clé pour prouver qu'elle répond, par exemple par un 401).
- Puis un **test depuis les serveurs de Supabase** (§ 1.3) : une fonction temporaire `sondes` a appelé 32 adresses depuis
  trois régions (Sydney, Francfort, Virginie), le même jour à 13:39 UTC.

Notes détaillées (tableaux complets, extraits des réponses, calculs) :

| Type | Note |
|---|---|
| Crypto | [donnees/d1-crypto.md](donnees/d1-crypto.md) |
| Actions et indices | [donnees/d1-bourse.md](donnees/d1-bourse.md) |
| Matières premières et devises | [donnees/d1-matieres-devises.md](donnees/d1-matieres-devises.md) |
| Sport | [donnees/d1-sport.md](donnees/d1-sport.md) |
| Actualité, tendances, IA | [donnees/d1-actualite-ia.md](donnees/d1-actualite-ia.md) |
| Images | [donnees/d1-images.md](donnees/d1-images.md) |

### 1.2 Synthèse : sources retenues et écartées

Légende : **P** principale, **S** secours, **R** dernier recours (avant la dernière valeur connue « retardée », puis la
simulation discrète). « Clé » = compte gratuit nécessaire ; le nom entre parenthèses est le nom du secret Supabase.

#### Crypto (BTC, ETH, SOL, XRP, BNB, DOGE, ADA, AVAX, LINK, LTC)

| Besoin | Source | Rôle | Clé | Délai | Remarque |
|---|---|---|---|---|---|
| Cours en direct dans le navigateur | Binance, flux `data-stream.binance.vision` (WebSocket) | P | non | temps réel, 1/s | un seul flux pour les 10 actifs |
| | Kraken WebSocket v2 | S | non | temps réel | |
| | cache Supabase (Binance + Kraken REST toutes les 30 s ; CoinGecko toutes les 10 min) | R | — | 30 s | |
| Prix à la seconde pour l'Éclair (moyenne de 3) | Binance bougies 1 s (`data-api.binance.vision`), OKX bougies 1 s, Gate transactions horodatées | P (×3) | non | historique ≥ 30 jours | même source aux deux bouts d'une manche (l'écart USDT / USD s'annule) |
| | Coinbase transactions publiques, Kraken transactions | S | non | | |
| Clôture à une heure donnée (résolution) | moyenne Coinbase + Kraken + Bitstamp, bougies 1 min (USD) | P | non | | Kraken ne garde que 12 h de bougies 1 min : lire ses transactions |
| | Binance bougie 1 min | S | non | | |
| | CoinGecko (points de 5 min) | R | oui | | |
| Classement par capitalisation | CoinGecko « Demo » (`COINGECKO_API_KEY`) | P | oui | | mention « Data provided by CoinGecko » obligatoire |
| | CoinMarketCap Basic (`CMC_API_KEY`) | S | oui | | facultatif |
| Logos | Trust Wallet assets (MIT), spothq cryptocurrency-icons (CC0) | P | non | | recopiés dans le stockage Supabase |

Écartées : CoinCap (v2 éteinte, v3 avec clé et 500 crédits/mois), CryptoCompare / CoinDesk (401), Pyth Hermes (401),
Messari v1 (404), CoinPaprika et CoinLore (usage personnel ou non commercial seulement : contrôles internes uniquement).
TON a été renommé GRAM et sa cotation est interrompue chez Binance : **LTC le remplace** dans la liste.

#### Actions et indices

| Besoin | Source | Rôle | Clé | Délai |
|---|---|---|---|---|
| Actions US en direct (NVDA, AAPL, MSFT, TSLA, AMZN, GOOGL, META) | Finnhub `/quote` (`FINNHUB_API_KEY`) | P | oui | temps réel, 60 appels/min |
| | Yahoo `v8/finance/spark` (non officiel) | S | non | US quasi temps réel |
| Actions européennes et indices (S&P 500, Nasdaq, Dow, CAC 40, DAX, Nikkei) | Yahoo `spark` (1 appel pour 17 symboles) | P | non | US temps réel, Europe 15 min, Tokyo 30 min |
| | EODHD (`EODHD_API_TOKEN`), 20 appels/jour | S | oui | 15 min |
| Clôture officielle (résolution) | Yahoo (clôtures journalières), contrôlée par Finnhub `pc`, FRED (CSV sans clé) et EODHD `/eod` | P + contrôles | | fin de journée |
| Ouvert ou fermé, jours fériés | table du calendrier dans la base (fériés et demi-séances 2026-2027 de NYSE/Nasdaq, Euronext, Xetra, Tokyo) | P | — | — |
| | Twelve Data `/market_state` (`TWELVEDATA_API_KEY`), Finnhub `market-status` | S | oui | |
| Logos d'entreprises | logoapi.sh (usage commercial et cache autorisés) | P | non | |
| | logo.dev | S | oui | |

Écartées : Stooq (défi anti-robot, clé exigée depuis mars 2026), Alpha Vantage (25 appels/jour, fin de journée), FMP,
Massive, Tiingo, Marketstack (rien de plus que les sources retenues), Nager.Date (jours fériés civils, pas boursiers).

#### Matières premières et devises

| Besoin | Source | Rôle | Clé | Délai |
|---|---|---|---|---|
| Or et argent (affichage) | gold-api.com (usage commercial autorisé) | P | non | le prix change toutes les 30 s |
| | goldprice.dev (`GOLDPRICE_DEV_API_KEY`) | S | oui (100/h par adresse sans clé) | 15 min sans clé |
| | fawazahmed0 currency-api | R | non | une valeur par jour |
| Devises, dont le shekel (affichage) | exchangerate.dev (`EXCHANGERATE_DEV_API_KEY`, lien de crédit visible obligatoire) | P | oui | 15 min |
| | Frankfurter (taux BCE) | S | non | une valeur par jour |
| | fawazahmed0, open.er-api | R | non | une valeur par jour |
| Pétrole WTI et Brent | EIA, données officielles (`EIA_API_KEY`) | P | oui | quotidien, publié le mercredi |
| | FRED, CSV sans clé | S | non | quotidien |
| Résolution des devises | taux de référence BCE (taux croisés) | P | non | quotidien vers 16:00 CET |
| Résolution de l'or | « fixing Wimoro » : médiane gold-api.com, goldprice.dev et indice d'un contrat or, relevée à 15:00 heure de Londres, réponses brutes archivées | P | | |

Écartées : Yahoo (429 dès le premier appel pour cette recherche), Stooq (anti-robot), exchangerate.host (100
requêtes/mois), Twelve Data (pas d'affichage en gratuit, ni or ni pétrole), Finnhub (usage personnel), MetalpriceAPI
(évaluation seulement), Alpha Vantage (25/jour, licence non commerciale), LBMA (blocage et licence requise).

**Éclair sur les matières et les devises** : aucune source gratuite ne donne un prix à la seconde fiable pour le pétrole,
les devises (yen, shekel) ou l'argent. L'or n'est possible qu'aux heures de marché, avec les prix de contrats sur des
places crypto (proches mais différents du vrai prix). Décision : **les manches Éclair restent sur des prix réels
(crypto, et actions US en séance)** ; voir la partie D pour les autres jeux.

#### Sport

| Sport et besoin | Source | Rôle | Clé |
|---|---|---|---|
| Foot : calendrier et résultat final (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Ligue des champions) | football-data.org (`FOOTBALL_DATA_API_KEY`), 10 appels/min | P | oui |
| | API-Football / API-Sports (`APISPORTS_API_KEY`), 100 appels/jour | S | oui |
| | OpenLigaDB (Bundesliga) | R | non |
| Foot : direct (score, minute, statut) | API-Football (1 appel = tous les matchs en cours des ligues suivies) | P | oui |
| | football-data.org `status=LIVE` | S | oui |
| NBA : calendrier, direct, résultat | balldontlie (`BALLDONTLIE_API_KEY`), 5 appels/min, usage commercial permis | P | oui |
| | API-NBA (API-Sports) | S | oui |
| Tennis : calendrier, résultat | AcesAPI (`ACESAPI_API_KEY`), 500 crédits/mois | P | oui |
| | création et résolution par un associé dans le panel | R | — |
| Logos des équipes | Wikimedia Commons quand le logo y est libre ; sinon icône de la catégorie | P | non |
| Photos des joueurs de tennis | Wikidata puis Wikimedia Commons (CC BY-SA, auteur fourni) | P | non |

Écartées : **ESPN** (son filtre refuse tout programme qui se déclare robot, et ses conditions d'usage interdisent la
collecte automatique : voir § 1.3), Sofascore (403), FotMob (conditions anti-robots), le flux de données de la NBA
(403), TheSportsDB gratuit (1 à 3 matchs par requête), SportScore, api-tennis.com et Sportradar (essais seulement),
RapidAPI (carte bancaire exigée), Sportmonks.

#### Actualité, tendances, IA

| Besoin | Source | Rôle | Clé |
|---|---|---|---|
| Gros titres avec lien vers l'article (en, fr, he) | Currents (`CURRENTS_API_KEY`), 250 requêtes/jour, usage commercial permis avec attribution | P | oui |
| | Wikipédia « À la une » (en, fr, he), Hacker News (tech) | S | non |
| | GDELT DOC 2.0 | R | non (mais 429 et délais dépassés : § 1.3) |
| Sujets tendance et marchés d'autres plateformes (jamais nommées dans le produit) | Polymarket Gamma (sans clé) | P | non |
| | Manifold (sans clé, usage non commercial) | S | non |
| | Wikipédia « les plus lus » (en, fr, he) | S | non |
| Rédaction des questions en 3 langues | Groq, modèle `openai/gpt-oss-120b` (`GROQ_API_KEY`) : 1 000 requêtes/jour, JSON strict | P | oui |
| | Cloudflare Workers AI (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`) | S | oui |
| | OpenRouter, modèles gratuits (`OPENROUTER_API_KEY`) | S | oui |
| | modèles de phrases en 3 langues (sans IA) | R | — |
| Emplacement pour une clé d'IA payante | Google Gemini (`GEMINI_API_KEY`, facturation activée) | plus tard | oui |

Écartées : flux RSS de Google Actualités, BBC et Le Monde (usage personnel), The Guardian (IA et traduction
interdites), NewsAPI (développement seulement, 24 h de retard), GNews, NewsData, TheNewsAPI, Mediastack (non
commercial ou retardés), Kalshi (données réservées aux membres), Metaculus (403, non commercial), Mistral (facturation
exigée), Hugging Face (plus de crédits gratuits), GitHub Models (retiré), Cohere (essai seulement). Gemini gratuit :
ses conditions réservent les clients de l'Espace économique européen aux offres payantes.

#### Images

| Type d'image | Chaîne de sources |
|---|---|
| Personne (candidat, dirigeant, joueur) | Wikidata (photo P18) → Wikimedia Commons (licence, auteur, attribution) → initiale sur fond gris |
| Entreprise | Wikidata (logo P154) → Commons → logoapi.sh → icône de la catégorie |
| Crypto | Commons → Trust Wallet assets (MIT) / spothq (CC0) |
| Équipe | Commons si le logo y est libre → icône de la catégorie (les logos des grands clubs ne sont pas libres sur Commons) |
| Jeu vidéo, film | Commons (par exemple le logo de GTA VI y est dans le domaine public) → icône de la catégorie |
| Sujet sans image évidente | icône sobre de la catégorie (jeu Lucide du site) |

À ne jamais reprendre : les fichiers « non libres » propres à Wikipédia en anglais (affiches, couvertures, la plupart des
logos de clubs), les images des API de données (ESPN, TheSportsDB, football-data.org, FMP, Finnhub : leurs conditions
l'interdisent), les dossiers de presse. Clearbit n'existe plus. Le filtre `pilicense=free` de l'API PageImages écarte
les fichiers non libres.

Traitement : le stockage Supabase n'offre pas le redimensionnement sur l'offre gratuite ; les images sont réduites par
une fonction du serveur (bibliothèque ImageScript, sans dépendance native) en 128 × 128 px, PNG pour les logos, JPEG
qualité 80 pour les photos, moins de 15 Ko. Wikimedia n'accepte que certaines largeurs de vignette (120, 250, 330 px…).
Pour chaque image, la base garde le titre, l'auteur, la source, la licence et son lien ; une page de crédits les montre.

### 1.3 Test depuis les serveurs de Supabase

Fonction temporaire `sondes` (liste d'adresses figée), appelée le 19/11/2026 à 13:39 UTC depuis trois régions, avec
l'en-tête `User-Agent: WimoroBot/1.0 (https://wimoro.com)`. Code HTTP et durée :

| Source | Sydney (`ap-southeast-2`, région de la base) | Francfort | Virginie |
|---|---|---|---|
| Binance, miroir de données (`data-api.binance.vision`) : cours et bougies 1 s | 200 | 200 | 200 |
| Binance (`api.binance.com`) | 200 | 200 | **451** (pays bloqué) |
| OKX bougies 1 s ; Gate ; Coinbase ; Kraken ; Bitstamp ; CoinGecko sans clé | 200 | 200 | 200 |
| Yahoo `spark` (AAPL, S&P 500, CAC 40) | 200 | 200 | 200 |
| Finnhub sans clé | 401 (attendu) | 401 | 401 |
| logoapi.sh ; gold-api.com ; Frankfurter ; fawazahmed0 ; FRED CSV | 200 | 200 | 200 |
| **ESPN** (foot, NBA, tennis) | **403** | **403** | **403** |
| football-data.org sans clé | 403 (attendu sans clé) | 403 | 403 |
| balldontlie sans clé | 401 (attendu) | 401 | 401 |
| OpenLigaDB | 200 | 200 | 200 |
| **GDELT** | délai de 8 s dépassé | dépassé | dépassé |
| Wikipédia « À la une » ; Hacker News ; Polymarket Gamma ; Manifold | 200 | 200 | 200 |
| Currents, Groq sans clé | 401 (attendu) | 401 | 401 |
| Wikimedia Commons ; Wikidata ; Trust Wallet (GitHub) | 200 | 200 | 200 |

Conclusions :
1. Les fonctions du serveur sont appelées **en forçant la région de la base** (en-tête `x-region: ap-southeast-2`) :
   c'est la plus proche des données, et Binance y répond (en Virginie, `api.binance.com` renvoie 451).
2. **ESPN est écarté** : le même appel, fait depuis ce poste, répond 200 avec l'identifiant de curl et 403 avec
   l'identifiant honnête de Wimoro. C'est donc un filtre anti-robot ; le contourner en se faisant passer pour un
   navigateur irait contre ce filtre et contre les conditions d'usage d'ESPN. Le foot en direct passe par API-Football,
   le tennis par AcesAPI et le panel.
3. **GDELT** ne répond pas dans le délai (ni d'ici, ni depuis le serveur) : il reste un dernier recours, jamais indispensable.

### 1.4 Conditions d'usage : ce qu'il faut savoir avant une ouverture commerciale

Wimoro est aujourd'hui une maquette de présentation, sans recette. Plusieurs offres gratuites ne sont autorisées que
pour un usage personnel ou non commercial :

| Famille | Restriction de l'offre gratuite | Pour une ouverture commerciale |
|---|---|---|
| Cours de Bourse (Finnhub, Twelve Data, EODHD, Yahoo) | affichage public non autorisé (usage personnel ou interne) | widgets d'affichage gratuits avec la marque du fournisseur, ou offre payante avec droit d'affichage |
| Places crypto (Binance, OKX, Coinbase) | affichage à des tiers ou usage commercial restreint selon les conditions | accord écrit ou flux sous licence |
| Matchs en direct | les sources gratuites conformes sont lentes (API-Football : 100 appels/jour) | offre payante (API-Sports, Sportradar…) |
| Sujets tendance (Polymarket, Manifold) | licence personnelle ou non commerciale | rédiger les sujets à partir de l'actualité seule |
| CoinGecko, exchangerate.dev, football-data.org, logo.dev | mention de la source obligatoire | conserver la mention |

Le site montre les mentions obligatoires (CoinGecko, football-data.org, exchangerate.dev, Currents) dans une ligne
discrète près des données concernées et sur la page des crédits.

### 1.5 Comptes gratuits et noms des secrets

Les clés sont rangées **uniquement** dans les secrets des fonctions Supabase (tableau de bord → Edge Functions →
Secrets), jamais dans le dépôt ni dans le code envoyé au navigateur. Les noms ne peuvent pas commencer par `SUPABASE_`.

| Priorité | Service | Inscription | Secret |
|---|---|---|---|
| Indispensable | Finnhub | <https://finnhub.io/register> | `FINNHUB_API_KEY` |
| Indispensable | football-data.org | <https://www.football-data.org/client/register> (clé par e-mail) | `FOOTBALL_DATA_API_KEY` |
| Indispensable | API-Sports (API-Football) | <https://dashboard.api-football.com/register> | `APISPORTS_API_KEY` |
| Indispensable | balldontlie | <https://app.balldontlie.io/signup> | `BALLDONTLIE_API_KEY` |
| Indispensable | Groq | <https://console.groq.com/keys> | `GROQ_API_KEY` |
| Indispensable | Currents | <https://currentsapi.services/en/register> | `CURRENTS_API_KEY` |
| Indispensable | CoinGecko (offre Demo) | <https://www.coingecko.com/en/developers/dashboard> | `COINGECKO_API_KEY` |
| Indispensable | EIA | <https://www.eia.gov/opendata/register.php> (clé par e-mail) | `EIA_API_KEY` |
| Conseillé | AcesAPI (tennis) | <https://acesapi.com/signup> | `ACESAPI_API_KEY` |
| Conseillé | Twelve Data | <https://twelvedata.com/register> | `TWELVEDATA_API_KEY` |
| Conseillé | exchangerate.dev | <https://exchangerate.dev/signup> | `EXCHANGERATE_DEV_API_KEY` |
| Conseillé | goldprice.dev | <https://goldprice.dev/signup> | `GOLDPRICE_DEV_API_KEY` |
| Conseillé | EODHD | <https://eodhd.com/register> | `EODHD_API_TOKEN` |
| Facultatif | FRED, CoinMarketCap, Cloudflare Workers AI, OpenRouter, logo.dev | voir les notes détaillées | `FRED_API_KEY`, `CMC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_TOKEN`, `OPENROUTER_API_KEY`, `LOGODEV_PUBLISHABLE_KEY` |
| Plus tard (payant) | Google AI Studio, facturation activée | <https://aistudio.google.com/apikey> | `GEMINI_API_KEY` |

Sans compte : cours crypto (Binance, OKX, Gate, Coinbase, Kraken, Bitstamp), or et argent (gold-api.com), devises
(Frankfurter), pétrole en secours (FRED CSV), Yahoo, logoapi.sh, OpenLigaDB, Wikipédia et Wikidata, Wikimedia Commons,
Hacker News, Polymarket Gamma, Manifold.

### 1.6 Fréquences de rafraîchissement retenues (marge sous les quotas gratuits)

| Source | Fréquence | Calcul | Quota gratuit | Utilisé |
|---|---|---|---|---|
| Crypto, cache serveur (Binance + Kraken + Coinbase) | 30 s | 3 × 2 880 = 8 640 appels/jour | aucun quota publié pour ces appels publics (limites par seconde très larges) | — |
| Éclair, prix de manche (Binance + OKX + Gate, bougies 1 s) | une fois par manche de 45 s et par actif réel | 1 920 manches/jour × 1 appel par source et par actif ; pour 10 actifs chez Binance : 10 × 1,33/min × poids 2 ≈ 27 de poids/min | Binance : 6 000 de poids/min (observé) ; OKX et Gate : non vérifié (source tierce : OKX 40 requêtes/2 s) | Binance < 1 % |
| Finnhub `/quote`, 7 actions US | 15 s en séance (6 h 30) | 7 × 4/min = 28/min | 60/min | 47 % |
| Yahoo `spark`, 17 symboles en 1 appel | 30 s si une Bourse est ouverte, 15 min sinon | ≈ 1 970/jour, ≤ 2/min | non publié | — |
| Twelve Data `/market_state` | 15 min | 96 crédits/jour | 800 crédits/jour | 12 % |
| gold-api.com | 60 s | 1 440/jour | non publié (sans clé) | — |
| exchangerate.dev | 15 min de 7 h à 23 h (UTC) en semaine | 64/jour × 22 j ≈ 1 400/mois | 5 000/mois | 28 % |
| EIA | 1 fois par jour | 30/mois | non publié, large | — |
| football-data.org | calendrier 2×/jour ; résultats toutes les 2 min après la fin d'un match ; direct 1/min | pointe 1,5/min | 10/min | 15 % |
| API-Football | direct toutes les 7 min un samedi chargé | ≤ 95/jour | 100/jour | 95 % les jours chargés, moins sinon |
| balldontlie | calendrier 2×/jour ; direct toutes les 30 s pendant les matchs | 2/min | 5/min | 40 % |
| AcesAPI | calendrier 1×/jour + ≤ 10 contrôles | ≤ 16 crédits/jour | 500/mois | ≈ 96 % au pire (à surveiller) |
| Currents | 1 collecte/jour + 2 rafraîchissements | 22 requêtes/jour | 250/jour | 9 % |
| Groq | 6 rédactions/jour | 6 requêtes/jour | 1 000/jour, 200 000 jetons/jour | 1 % des requêtes, ≈ 28 % des jetons |
| Polymarket Gamma, Manifold, Wikipédia | 1 à 3 fois par jour | quelques appels | non publié | — |

Ces fréquences seront appliquées et vérifiées par le serveur (table des sources, compteur d'appels du jour, arrêt
automatique et passage au secours en cas de 429, 403 ou 5xx). Elles sont reprises au § 3 avec le budget des appels de
fonctions Supabase (500 000 par mois sur l'offre gratuite).

---

## 2. Architecture

*Lot 6 (le socle des données), 19 nov. 2026, branche `marches-et-admin-donnees`. Migration `20261119171018_donnees_socle`,
Edge Function `donnees`. Tests : `tests/sql/donnees.spec.mjs`, `tests/sql/donnees-cascade.spec.mjs`,
`tests/donnees-lecteurs.spec.mjs`.*

### 2.1 Le chemin d'une donnée

```
pg_cron, tâche wm-donnees (chaque minute)
  └─ wm.appeler('donnees') ── pg_net ──▶ Edge Function « donnees » (région de la base, Sydney : en-tête x-region)
                                         · refus 401 sans le jeton x-wm-jeton (créé par la base dans Vault, vérifié par srv_jeton_ok)
                                         · un bail : une seule boucle à la fois (srv_donnees_bail)
                                         · boucle de 55 s, un passage toutes les 3 s :
                                             cascade.js  : pour chaque famille, la première source utilisable et « due »
                                             lecteurs.js : réponse de la source → cotations { actif: { prix, heure } }
        srv_cours_ingerer ◀──────────────┘
          ├─ wm.px_dernier       le dernier cours de chaque actif (37 lignes, mises à jour en place)
          ├─ wm.px_echantillons  l'anneau d'une heure (un emplacement par tranche de 3 s, réécrit en place, jamais vidé)
          ├─ wm.sources          appels du jour, erreurs, pause, état de chaque source
          └─ wm.live_cache       l'instantané servi au site
site (visiteurs compris) ── api_live() ──▶ wm.live_cache (un seul accès, environ 2 Ko ; ne réveille pas les bots)
```

Le navigateur n'appelle jamais une source à clé ni à quota serré : il lit `api_live()`. Les clés vivent seulement dans
les secrets des Edge Functions ; la base n'en connaît que le **nom** (`wm.sources.secret`) et sa présence
(`wm.sources.cle_presente`, relevée par la fonction à chaque boucle). L'en-tête d'identification est honnête :
`WimoroBot/1.0 (https://wimoro.com)` ; aucune source n'est appelée en se faisant passer pour un navigateur.

### 2.2 La cascade, famille par famille

Secours en cascade : la source principale ; si elle échoue, n'a pas de clé, est en pause ou au bout de son quota, la
suivante **dans le même passage** ; si plus aucune ne répond, la dernière valeur connue reste affichée et passe à
« retardée » en vieillissant ; si aucune source n'a jamais répondu, une valeur simulée discrète (le niveau de référence
de l'actif, relevé le 19 nov. 2026) marquée « simulée ».

| Famille (actifs) | Rang 1 | Rang 2 | Rang 3 et plus | Ce qui sert **aujourd'hui, sans aucune clé** |
|---|---|---|---|---|
| Crypto (BTC, ETH, SOL, XRP, BNB, DOGE, ADA, AVAX, LINK, LTC) | Binance, toutes les 6 s | Kraken, 10 s | Coinbase (30 s), puis CoinGecko (clé, 10 min) | Binance, « direct » |
| Actions US (Nvidia, Apple, Microsoft, Tesla, Amazon, Alphabet, Meta, fonds SPY et QQQ) | Finnhub (clé), 30 s, un appel par action | Yahoo `spark`, 30 s | — | Yahoo, « direct » en séance |
| Indices (S&P 500, Nasdaq 100, Dow Jones, CAC 40, DAX, Nikkei) | Yahoo `spark`, 30 s (un appel pour les 18 symboles) | EODHD (clé), 10 appels par jour au plus | — | Yahoo : US « direct », CAC, DAX et Nikkei « retardés » (15 à 30 min chez Yahoo) |
| Actions européennes (LVMH, ASML, TotalEnergies) | Yahoo `spark` | EODHD (clé) | — | Yahoo, « retardé » (15 min) |
| Or, argent | gold-api.com, 30 s | goldprice.dev (15 min ; clé facultative) | fawazahmed0 (une valeur par jour) | gold-api, « direct » |
| Devises (EUR/USD, GBP/USD, USD/JPY, USD/ILS, USD/CHF) | exchangerate.dev (clé), toutes les 18 min | Frankfurter (taux BCE), 1 h | fawazahmed0 | Frankfurter, « retardé » (taux du jour) |
| Pétrole (WTI, Brent) | EIA (clé), toutes les 6 h | FRED (CSV sans clé), 6 h | — | FRED, « retardé » (J−2) |
| Contrôle des places | Twelve Data (clé) `/market_state`, 15 min | — | — | rien (le calendrier de la base suffit) |

Une place fermée (nuit, week-end, jour férié) n'est rafraîchie que toutes les 15 minutes ; la crypto ne ferme jamais.

### 2.3 Les états

- **Un cours** (`api_live().cours.<actif>.e`) : `d` direct (cotation plus jeune que le seuil de l'actif : 60 s pour la
  crypto, 120 s pour les actions et indices, 5 min pour l'or, 10 min pour les devises, 1 h pour le pétrole), `r` retardé
  (plus vieux, ou venant d'une source par nature différée), `s` simulé (jamais reçu). `o` : la place est ouverte (1) ou
  fermée (0) ; `t` : heure de la cotation chez la source.
- **Une famille** (`api_live().familles`) : la pire de ses valeurs (`simule` > `differe` > `direct`).
- **Une source** (`wm.sources.etat`, `raison`) : `direct` ou `differe` (`ok` : dernier appel réussi), `erreur`
  (`pause` après un refus, `echec`), `inactif` (`cle_absente`, `desactivee` par l'équipe, `en_reserve` : jamais appelée
  car la principale suffit). L'équipe les voit par l'action `sources_etat` et coupe une source par `source_activer`
  (motif, journalisée, annulable).

### 2.4 Quotas, cadences, pauses (appliqués par le serveur)

- Chaque source a sa cadence (`cadence_s`), ses quotas publiés ou que Wimoro s'impose (`quota_min`, `quota_jour`) et une
  marge (`marge` = 0,5 : on n'utilise que la moitié). Intervalle entre deux lots de n appels :
  `max(cadence, n × 60 / (quota_min × marge), n × 86 400 / (quota_jour × marge))` secondes ; un lot qui dépasserait le
  plafond de la minute ou du jour n'est pas envoyé et la cascade passe à la suivante.
- Les appels du jour sont comptés en base (`appels_jour`, remis à zéro à minuit UTC) ; l'heure du dernier appel aussi :
  une boucle qui redémarre ne rappelle pas trop tôt une source lente (FRED, EIA).
- Un refus (429, 418, 403, 401, 5xx), un délai dépassé (5 s, 8 s pour FRED) ou une réponse illisible mettent la source en
  pause : 30 s, puis le double à chaque échec (30 min au plus ; 401 et 403 : 30 min d'emblée ; `Retry-After` respecté).
  Un 404 (symbole inconnu) n'est pas une panne.
- Pas de journal bavard : une ligne par boucle (passages, appels, erreurs), et les erreurs espacées de 10 s au moins (la
  limite est de 100 événements par 10 s).

## 3. Tâches planifiées et budget

### 3.1 Tâches

| Tâche | Rythme | Commande | Rôle |
|---|---|---|---|
| `wm-donnees` | chaque minute | `select wm.appeler('donnees', '{"tache":"boucle"}')` | réveille l'Edge Function de collecte (une invocation) |

Pour couper la collecte sans rien supprimer : le réglage `donnees.actif` à faux (`reglage_modifier`, ou une migration
`update wm.reglages set valeur = 'false' where cle = 'donnees.actif'`) ; `wm.appeler` ne réveille alors plus la fonction,
et le site garde les dernières valeurs (qui passent à « retardées »).

### 3.2 Budget des invocations d'Edge Functions (500 000 par mois sur l'offre gratuite)

| Poste | Calcul | Par mois |
|---|---|---|
| `donnees` (lot 6) | 1 réveil par minute : 60 × 24 × 30 | 43 200 (8,6 %) |
| `eclair` (joueurs, inchangé) | ≈ 170 appels par heure de jeu active × 300 à 1 000 heures | 51 000 à 170 000 |
| `connexion` | ≈ 50 par jour | ≈ 1 500 |
| **Total** | | **≈ 96 000 à 215 000 (19 à 43 %)** |

La boucle dure 55 s pour une durée maximale de 150 s ; elle consomme quelques centaines de millisecondes de calcul par
réveil (limite : 2 s), l'essentiel étant de l'attente réseau.

### 3.3 Appels aux sources (sans clé, aujourd'hui)

| Source | Rythme | Par jour | Marge |
|---|---|---|---|
| Binance `ticker/price` (10 symboles, poids 4) | 6 s | 14 400 | 40 de poids par minute sur 6 000 (0,7 %) |
| Yahoo `spark` (18 symboles) | 30 s si une place est ouverte, 15 min sinon | ≤ 2 880 | plafond que Wimoro s'impose : 3 000 par jour |
| gold-api.com (XAU, XAG) | 30 s | 5 760 | « pas plusieurs requêtes par seconde » : un appel toutes les 15 s en moyenne |
| Frankfurter | 1 h | 24 | pas de quota |
| FRED (2 séries) | 6 h | 8 | pas de quota |
| Kraken, Coinbase, goldprice.dev, fawazahmed0 | seulement si la principale tombe | — | — |

Avec les clés : Finnhub 9 appels toutes les 30 s en séance (18 par minute pour un plafond de 20, soit 30 % de la limite de
60 par minute), et toutes les 15 min hors séance ; EODHD 10 par jour au plus (sur 20) ; exchangerate.dev 80 par jour (sur
160, soit 5 000 par mois) ; EIA 4 par jour ; CoinGecko 144 par jour (sur 330) ; Twelve Data 96 par jour (sur 800).

### 3.4 Base et pg_net

- `srv_cours_ingerer` : 10 à 20 écritures par minute (mises à jour en place) ; `wm.px_echantillons` tient au plus
  37 × 1 200 lignes.
- pg_net garde chaque réponse 6 heures (`net._http_response`, 360 lignes environ), puis l'efface lui-même ; le journal de
  pg_cron reçoit 1 440 lignes de plus par jour (la purge existante garde 6 heures).

## 4. Tables ajoutées

Toutes dans le schéma `wm`, RLS activée sans règle, aucun droit pour les clients : seules les fonctions y accèdent.

| Table | Contenu | Taille |
|---|---|---|
| `wm.sources` | une ligne par source : rangs par famille, nature, nom du secret, présence de la clé, cadence, quotas, marge, appels du jour et au total, erreurs, pause, état et raison | 15 lignes |
| `wm.px_marches`, `wm.px_feries` | places (fuseau IANA, séances, pause, semaine « hebdo » des devises et matières) et jours fériés ou fermetures anticipées 2026-2028 (NYSE/Nasdaq, Euronext, Xetra, Tokyo) | 8 et 98 lignes |
| `wm.px_actifs` | les 37 cours suivis : famille, place, symbole chez chaque source, décimales, niveau de référence, seuil du « direct » | 37 lignes |
| `wm.px_dernier` | dernier cours de chaque actif, sa source, l'heure chez la source et l'heure d'écriture | 37 lignes |
| `wm.px_echantillons` | anneau d'une heure, `(actif, slot)` avec `slot = secondes / 3 modulo 1 200`, réécrit en place | ≤ 44 400 lignes, quelques Mo |
| `wm.live_cache` | l'instantané d'`api_live` (cours, familles ; partie éclair au lot 7) | 1 ligne |
| `wm.donnees_boucle` | le bail de la boucle de collecte | 1 ligne |

Sauvegarde prise avant d'écrire (lot 6) : `backup_20261119.wm_reglages`, `wm_droits_liste`, `wm_equipe_actions`,
`cron_job` (schéma et données, dans `backup_20261119.tables`) ; nouvelle table `backup_20261119.fonctions_lots` pour les
définitions des fonctions existantes que les lots suivants complètent.

## 5. Cycle de vie d'un marché

*Rédigé avec le code (partie D).*

## 6. Validation des marchés du jour et résolution

*Rédigé avec le code (parties D et E).*
