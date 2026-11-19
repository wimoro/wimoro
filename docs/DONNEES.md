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

### 2.5 Le pari éclair à cours réels (lot 7)

*Lot 7, 19 nov. 2026. Migration `20261119180634_eclair_reel`, Edge Functions `donnees` (v3) et `eclair` (v5), moteur v2
(`js/moteur-eclair.js`, copie conforme dans les deux fonctions). Tests : `tests/eclair-reel.spec.mjs`,
`tests/sql/eclair-reel.spec.mjs`, `tests/sql/eclair-edge.spec.mjs`, `tests/sql/donnees-fixations.spec.mjs`.*

**Interrupteur.** `eclair.cours_reels` (réglage public, **éteint**) : éteint, tous les jeux restent simulés exactement comme
avant. Allumé, il vaut à partir de la deuxième manche suivante (les modes sont figés deux manches d'avance). Les réglages
`eclair.secours_simule` (éteint : un jeu réel sans données passe en pause ; allumé : en simulation marquée « simulé »),
`eclair.grace_s` (120 s : attente de la fixation de fin) et `eclair.pbe_max` (8 % : au-delà, la mise break even ferme).

**Une fixation par frontière.** À chaque frontière de manche T (toutes les 45 s), la boucle de la fonction `donnees`
(la même invocation, aucun appel de plus) lit le cours de chaque actif réel **à la seconde T** :

| Actifs | Sources (dans l'ordre) | Essais | Sources concordantes exigées |
|---|---|---|---|
| Bitcoin, Ether, Solana, Dogecoin | Binance (bougie d'une seconde), OKX (bougie d'une seconde), Gate (transactions) ; Coinbase (transactions, en USD) en secours | T + 3 s, T + 8 s, T + 15 s (final) | 2 |
| Fonds SPY et QQQ, Nvidia, Tesla | Finnhub `/quote` (clé `FINNHUB_API_KEY`), en séance seulement | T + 0,3 s, T + 1,5 s, T + 4 s (final) | 1 |

- Le cours d'une source à la seconde T : son dernier prix échangé avant T + 1 s, s'il y a eu au moins un échange dans les
  10 s ; sinon la source est « périmée » pour cette seconde. Finnhub : la cotation lue juste après T, gardée si sa dernière
  transaction a moins de 15 s.
- La moyenne et l'écart des valeurs aberrantes sont ceux du moteur (`composite`) : avec trois sources ou plus, celles à
  plus de 0,3 % de la médiane sont écartées ; avec deux qui s'écartent, la première seule.
- Une fixation est écrite **une fois** (`srv_eclair_fixer`) et ne change plus ; « absente » si la collecte a fini
  d'essayer sans assez de sources, ou si la tâche `wm-eclair-fix` la constate manquante après le délai de grâce.
- La frontière de la minute pile (une sur quatre) tombe entre deux boucles : la boucle suivante la rattrape dans les
  secondes qui suivent (historique à la seconde pour la crypto ; la cotation Finnhub, lue jusqu'à 12 s après T).
- Une source qui refuse (429, 5xx…) est mise en pause comme dans la cascade ; ses quotas (`wm.sources`, lignes
  `*_eclair`) sont tenus de la même façon.

**Le mode de chaque manche**, figé deux manches d'avance (`wm.eclair_manches`), identique pour tous :

| Mode | Quand | Pour le joueur |
|---|---|---|
| réel (`r`) | interrupteur allumé, jeu à vraie source, place ouverte sur toute la manche (une minute avant, cinq après), sources utilisables, une fixation réussie depuis moins de 10 min | moteur v2 sur les fixations |
| en pause (`p`) | place fermée (`ferme`, avec l'heure de réouverture `rouvre`), clé absente (`cle`), sources coupées (`source`), données muettes (`donnees`) | mises refusées (`jeu_en_pause`) ; l'écran propose les jeux ouverts |
| simulé (`s`) | interrupteur éteint (`interrupteur`), jeu sans vraie source (`pas_de_source`), simulation de secours (`secours`) | moteur d'avant, inchangé |
| retiré (`x`) | sorti de la rotation (`wm.eclair_jeux.config = 'retire'`) | mises refusées |

**Les jeux** (décision du lot 7, d'après le § 1.2) :

| Jeux | Mode visé | Pourquoi |
|---|---|---|
| Bitcoin, Ether, Solana, Dogecoin, Secousse (fixations du Bitcoin) | **réel**, 24 h sur 24, **sans clé** | trois places gratuites à la seconde |
| Nasdaq 100 (fonds QQQ), S&P 500 (fonds SPY), Nvidia, Tesla | **réel en séance avec la clé Finnhub** ; en pause sinon (nuit, week-end, fériés, ou clé absente) | Finnhub est la seule source gratuite à la seconde |
| CAC 40, or, argent, pétrole, EUR/USD, GBP/USD, USD/JPY | **simulé**, marqué « simulé » | aucune source gratuite à la seconde (Yahoo et EODHD : 15 min de retard pour le CAC ; or : 30 s ; devises : 15 min) |
| Tennis, basket, foot | **simulé** | pas de vrai match découpé en manches de 45 s |

Aucun jeu n'est retiré ; l'équipe peut en retirer un par la table `wm.eclair_jeux`.

**Le règlement (moteur v2).** La manche r va de la fixation r à la fixation r + 1. L'issue compare la moyenne des
sources **présentes aux deux bouts** (un écart constant entre deux places, USD contre USDT, s'annule) ; une égalité est
un écart sous la bande du jeu. La foule simulée penche du côté de la manche r − 2 (deux fixations connues de tous avant
l'ouverture), la cagnotte et les frais en découlent ; le navigateur et le serveur calculent donc exactement la même chose
(testé au dernier chiffre dans un vrai navigateur). Le break even d'une manche réelle se paie sur sa fréquence observée
(`wm.eclair_calibrage`, recalculée chaque heure sur 48 h, retenue à partir de 200 manches ; sinon celle du modèle) ; au-delà
de `eclair.pbe_max`, la mise break even ferme et une égalité annule la manche.

**Manche annulée** (fixation absente, sources communes insuffisantes, égalité sans break even) : chaque mise est
**rendue** — une ligne dans `wm.eclair_remboursements` (la vérité du remboursement), une écriture `flash_rembourse` du
journal d'argent, une notification `flash_rembourse` ; la mise est close « perdue » avec un gain égal à la mise (seule
clôture que la contrainte existante permet ; aucune contrainte n'est changée). Rien n'est compté au joueur : ni XP, ni
série, ni pari réglé, ni historique. Un duel sur une manche annulée rend les deux mises (issue 2). Une manche simulée ne
s'annule jamais. Tant que la fin n'est pas fixée et que le délai court, la mise attend.

**Preuves.** Les fixations et les modes vivent dans des anneaux de 48 h (3 840 manches, réécrits en place). Pour une mise
ou un duel encore ouvert au bout de 40 h (joueur pas revenu), la tâche recopie le mode et les quatre fixations dans
`wm.eclair_preuves` : le règlement reste le même, même des jours plus tard. Rien n'est écrit pour les autres.

**Limites connues.** La foule simulée ne suit pas le cours pendant la manche (le serveur n'a pas de cours partagé à chaque
tick) : un joueur qui regarde le vrai cours avant de miser a un avantage, comme avec la trajectoire simulée d'avant (qui,
elle, se calculait d'avance à partir du code public). Le volume des clans compte la mise d'une manche annulée. Une
cotation Finnhub rattrapée après la minute pile peut dater de quelques secondes après T (15 s au plus), pareil pour tous.

## 3. Tâches planifiées et budget

### 3.1 Tâches

| Tâche | Rythme | Commande | Rôle |
|---|---|---|---|
| `wm-donnees` | chaque minute | `select wm.appeler('donnees', '{"tache":"boucle"}')` | réveille l'Edge Function de collecte (une invocation) ; depuis le lot 7, la même boucle écrit aussi les fixations éclair |
| `wm-eclair-fix` (lot 7) | toutes les 10 s | `select wm.eclair_fixer()` | fige les modes des manches en cours et des deux suivantes, déclare « absentes » les fixations manquantes après le délai de grâce, garde la preuve des mises oubliées, refait la partie éclair de l'instantané (SQL seul, aucune invocation) |
| `wm-eclair-calibrage` (lot 7) | chaque heure, à la 17ᵉ minute | `select wm.eclair_calibrer()` | fréquence observée du break even sur 48 h de vraies fixations |
| `wm-cycle` (lot 9) | chaque minute | `select wm.cycle_tick()` | fin des suspensions, seuils « touche », fin des mises, valeurs de référence, résultats automatiques, successeurs (lot 10), propositions (lot 11) ; SQL seul |
| `wm-ancres` (lot 10) | toutes les 30 s | `select wm.ancres_tick()` | probabilité du modèle des marchés du catalogue (cours réels) ; SQL seul |
| `wm-quotidien` (lot 11) | chaque jour à 05:30 UTC | `select wm.appeler('quotidien', '{"tache":"jour"}')` | propositions du jour (une invocation) |
| `wm-quotidien-reveil` (lot 11) | minutes 5, 15… 55 | `select wm.quotidien_reveil()` | réveille `quotidien` seulement s'il reste des images à copier ou un match à suivre (de 3 h avant à 6 h après le coup d'envoi) |

Pour couper la collecte sans rien supprimer : le réglage `donnees.actif` à faux (`reglage_modifier`, ou une migration
`update wm.reglages set valeur = 'false' where cle = 'donnees.actif'`) ; `wm.appeler` ne réveille alors plus la fonction,
et le site garde les dernières valeurs (qui passent à « retardées »).

### 3.2 Budget des invocations d'Edge Functions (500 000 par mois sur l'offre gratuite)

| Poste | Calcul | Par mois |
|---|---|---|
| `donnees` (lots 6 et 7) | 1 réveil par minute : 60 × 24 × 30 ; les fixations éclair tournent dans la même boucle | 43 200 (8,6 %) |
| `eclair` (joueurs) | ≈ 170 appels par heure de jeu active × 300 à 1 000 heures ; le lot 7 n'ajoute aucune invocation (un appel de plus **à la base** par mise ou règlement, pas à une fonction) | 51 000 à 170 000 |
| `connexion` | ≈ 50 par jour | ≈ 1 500 |
| `quotidien` (lot 11) | 1 par jour, plus au plus 6 par heure les jours de match (une invocation suit tous les matchs) et 11 en tout pour la première copie des 83 images | 30 à ≈ 2 000 |
| `wm-eclair-fix`, `wm-eclair-calibrage` | SQL dans la base, pas des Edge Functions | 0 |
| **Total** | | **≈ 96 000 à 217 000 (19 à 43 %)** |

La boucle dure 55 s pour une durée maximale de 150 s ; elle consomme quelques centaines de millisecondes de calcul par
réveil (limite : 2 s), l'essentiel étant de l'attente réseau. Les fixations y ajoutent environ 12 petites réponses JSON
toutes les 45 s (et 4 en séance avec la clé Finnhub).

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

Fixations éclair (lot 7), 1 920 frontières par jour :

| Source | Appels | Par jour | Marge |
|---|---|---|---|
| Binance `klines` 1 s (4 actifs, poids 2) | 4 par frontière | ≈ 7 700 | ≈ 11 de poids par minute sur 6 000 |
| OKX `market/candles` 1 s | 4 par frontière | ≈ 7 700 | 5 par minute ; limite publiée : 40 par 2 s |
| Gate `spot/trades` | 4 par frontière | ≈ 7 700 | limite publiée : 200 par 10 s |
| Coinbase `ticker` (secours, et au dernier essai d'un rattrapage) | 0 à 4 par frontière | ≤ 7 700 | plafond que Wimoro s'impose : 150 par minute |
| Finnhub `/quote` (clé, en séance) | 4 par frontière, 3 essais au plus | ≈ 2 100 | 10 par minute au plus ; avec la collecte, 28 par minute sur 60 |

### 3.4 Base et pg_net

- `srv_cours_ingerer` : 10 à 20 écritures par minute (mises à jour en place) ; `wm.px_echantillons` tient au plus
  37 × 1 200 lignes.
- pg_net garde chaque réponse 6 heures (`net._http_response`, 360 lignes environ), puis l'efface lui-même ; le journal de
  pg_cron reçoit 1 440 lignes de plus par jour (la purge existante garde 6 heures).
- Lot 7 : `srv_eclair_fixer` écrit au plus 8 fixations toutes les 45 s (en place) ; `wm-eclair-fix` ajoute 8 640 lignes
  par jour au journal de pg_cron (même purge) ; les anneaux tiennent au plus 30 720 fixations et 72 960 modes (quelques Mo).

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

Lot 7 (pari éclair à cours réels) :

| Table | Contenu | Taille |
|---|---|---|
| `wm.eclair_actifs` | les 8 actifs fixés : place, sources concordantes exigées, sources dans l'ordre (symbole, secours) | 8 lignes |
| `wm.eclair_jeux` | les 19 jeux : `reel`, `simule` ou `retire`, actif suivi, bande d'égalité, fréquence du modèle, raison | 19 lignes |
| `wm.eclair_fixations` | anneau de 48 h, `(actif, slot)` avec `slot = manche modulo 3 840` : état, cours moyen, sources gardées et écartées, heure d'écriture ; jamais réécrite pour la même manche | ≤ 30 720 lignes |
| `wm.eclair_manches` | anneau de 48 h des modes figés `(jeu, slot)` : mode, raison, fréquence du break even, sources exigées, break even fermé | ≤ 72 960 lignes |
| `wm.eclair_preuves` | mode et quatre fixations des manches réelles encore ouvertes au bout de 40 h (permanent) | rare |
| `wm.eclair_remboursements` | les mises rendues d'une manche annulée (mise, joueur, montant, motif) | une ligne par mise rendue |
| `wm.eclair_calibrage` | fréquence observée du break even par jeu réel, sur 48 h | 9 lignes |
| `wm.sources` | 5 lignes de plus : `binance_eclair`, `okx_eclair`, `gate_eclair`, `coinbase_eclair`, `finnhub_eclair` | 20 lignes |

Sauvegarde prise avant d'écrire (lot 7) : `wm.eclair_mises`, `wm.sources`, `wm.live_cache` (dans `backup_20261119.tables`) ;
définitions d'avant de `srv_eclair_miser` et `srv_duel_eclair_creer` dans `backup_20261119.fonctions_lots` (lot `lot7`).

Marchés réels, lots 8 à 11 (catalogue du serveur, cycle de vie, modèles, tâche quotidienne) :

| Table | Contenu | Taille |
|---|---|---|
| `wm.cat_categories` | les 7 catégories : noms en trois langues, icône de repli, catégorie du barème des frais | 7 lignes |
| `wm.fiches` | une fiche par marché (binaire ou à options) : textes fr, en, he (question, libellé court de 24 caractères au plus, critère), catégorie, image, ouverture, fin des mises, heure du résultat, source, règle lue par la machine, lien vers la donnée vivante, probabilité de départ et sa justification (interne), origine, modèle et période, état du cycle, suspension, résolution (issue, valeur, source, preuve), annulation, révision | 60 lignes le 19 nov. 2026 |
| `wm.fiches_options` | les options d'un marché à options : code, noms en trois langues, probabilité de départ, image ; l'identifiant du marché du moteur est `<fiche>-<code>` | 151 lignes |
| `wm.cat_cotes` | le prix servi tant que le moteur n'a pas de ligne (avant la mise en ligne) et la dernière probabilité du modèle | une ligne par marché |
| `wm.images` | une ligne par fichier libre de Wikimedia Commons : état (à copier, copiée, échec, refusée), chemin dans le bucket, taille, empreinte, crédit (titre, auteur, licence, adresse) | 83 lignes |
| `wm.sport_matchs` | les matchs vus chez une source de sport (calendrier, direct, résultat), jamais effacés | quelques lignes par jour |
| `wm.cycle_blocs` | les étapes branchées sur le cycle (successeurs, propositions), comme `wm.suites_blocs` | 4 lignes |
| `wm.presences` | le dernier signal de présence de chaque joueur (nouvel écran, toutes les 60 s) | une ligne par joueur |
| `wm.modeles` | les 30 modèles des marchés permanents : famille, règle (actif, pas du seuil, volatilité, marge), gabarits en trois langues, calendrier, options | 30 lignes |
| `wm.propositions_jour` | les brouillons : matchs du calendrier (« auto »), sujets d'actualité et successeurs (« en attente »), décisions de l'équipe | quelques dizaines par jour |
| `wm.sources` | 12 lignes de plus, marquées `config.tache = 'quotidien'` (la collecte des cours ne les lit pas) | 32 lignes |

Bucket Storage public `marches` (32 Ko au plus par fichier, PNG et JPEG) : `img/<sha256>.png|jpg`, 128 × 128, mis en
cache un an. Sauvegardes prises avant d'écrire : copies « lot8 » à « lot11 » de `wm.reglages`, `wm.droits_liste`,
`wm.revisions`, `wm.equipe_actions`, `wm.sources`, `cron.job` ; tables `public.market_groups`, `market_live_state`,
`market_outcomes`, `chat_rooms`, `positions`, `wm.duels`, `wm.combos`, `wm.copies_lots` (dans `backup_20261119.tables`) ;
définition d'avant de `srv_donnees_config` (`backup_20261119.fonctions_lots`, lot `lot11`).

## 5. Cycle de vie d'un marché

Chaque marché du catalogue a une fiche (`wm.fiches`) et un état (`cycle`). Tant que le catalogue n'est pas en ligne
(réglage `catalogue.serveur` éteint), les fiches n'ont aucune ligne dans le moteur (`public.markets`) : l'écran d'avant
ne les voit pas, et tout le cycle ne s'écrit que dans `wm`. Après la mise en ligne, l'état du moteur suit la fiche.

| État | Moteur | Quand |
|---|---|---|
| proposé | — | brouillon de `wm.propositions_jour` (match du calendrier, sujet du jour, successeur d'une édition), sans fiche |
| `ouvert` | `open` | à la création (`wm.fiche_creer`), ou à la fin d'une suspension datée |
| `suspendu` | `closed` | par l'équipe (`marche_suspendre`, motif, fin facultative) ; les mises sont refusées (`marche_ferme`) |
| `ferme` | `closed` | à l'heure de fin des mises (tâche `wm-cycle`, chaque minute) ; « touche » : dès que le seuil est vu |
| `a_resoudre` | `closed` | l'automate ne peut pas trancher : valeur trop proche du seuil (marge de la règle), donnée absente après `cycle.attente_min` (60 min), marché d'actualité ou décision humaine ; le résultat proposé est gardé (`propose`) |
| `resolu` | `resolved` + yes/no | automatique (valeur, source, heure gardées) ou par l'équipe (issue, lien de la preuve) ; paiement par `wm.marche_regler` (1 $ par part gagnante) et `wm.marche_suites` (duels, combinés), comme l'ancien panneau |
| `annule` | `resolved` + voided | par l'équipe (`marche_annuler`) : chaque position remboursée au prix d'achat (parts × prix moyen, écriture « annulation »), duels en jeu rendus, sélection des combinés annulée (cote recalculée, mise rendue s'il n'en reste aucune), lots des copies libérés ; les frais payés restent acquis |

Résolution automatique, par type de règle :

| Règle | Marchés | Valeur lue | Trop proche → équipe |
|---|---|---|---|
| `prix` | Bitcoin, Solana, XRP fin de mois | cours de l'anneau d'une heure à l'heure dite (± 90 s), sinon dernier cours assez proche | écart < 0,4 % |
| `hausse` | Bitcoin de la semaine | cours de départ relevé au début, cours de fin | écart < 0,2 % |
| `hausse_cloture` | S&P 500 de la semaine | clôtures des deux séances | écart < 0,05 % |
| `cloture` | Nvidia, Tesla, CAC 40 | dernier cours daté de la séance (5 min avant à 45 min après la clôture) | 0,2 à 0,3 % |
| `reference_bce` | euro / dollar | cours de référence BCE du jour (Frankfurter) | 0,05 % |
| `touche` | Ether à 2 000 $ | plus haut des deux dernières minutes, à chaque passage : « oui » dès que le seuil est vu ; à la fin, « non » | plus haut à moins de 1 % du seuil |
| `match` | les 9 matchs | score final d'une source de sport (`wm.sport_matchs`) : option domicile, nul ou extérieur | match reporté ou score absent 60 min après l'heure du résultat |
| `manuel` | or (cours indicatif proposé), réunions de banques centrales, inflation, classements, élections, actualité, saisons | — | toujours : l'équipe tranche |

Sans clé de sport aujourd'hui, seuls les deux matchs de Bundesliga ont un score automatique (OpenLigaDB) ; les sept
autres passent « à résoudre » et l'équipe les tranche avec le lien du score officiel.

Successeurs (lot 10) : quand une instance d'un marché permanent se ferme (ou est résolue, si le seuil suivant dépend du
résultat), `wm.modele_suivant` crée la période suivante : seuil rond tiré du cours du moment, probabilité de départ du
modèle (lognormale sans dérive ; barrière ; Poisson pour le football, loi normale pour la NBA), textes des gabarits en
trois langues. Les éditions dont les candidats changent (présidentielles, Premier ministre, Starship, Game Awards,
Oscars, Grammys) donnent un brouillon à valider. La tâche `wm-ancres` (30 s) met le prix servi au niveau du modèle avant
la mise en ligne ; après, la valeur de référence du marché, et rapproche l'ancre des bots (au-delà de 8 points) et le prix
(au-delà de 15 points, 30 % du chemin), sans toucher `wm.bots_tick` ni les anciens marchés.

## 6. Validation des marchés du jour et résolution

**Chaque jour à 05:30 UTC** (`wm-quotidien`), l'Edge Function `quotidien` lit les calendriers (OpenLigaDB sans clé ;
football-data.org et balldontlie avec leur clé), les gros titres (Currents avec sa clé ; sinon Wikipédia « À la une » en,
fr, he et Hacker News), les tendances (Wikipédia, deux sites de marchés publics, usage interne jamais nommé à l'écran), et
écrit des brouillons (`srv_quotidien_enregistrer`) :

- **un match** devient une proposition « auto » : elle s'ouvre seule 48 h avant le coup d'envoi (`wm.propositions_tick`,
  chaque minute) s'il reste une place parmi les marchés d'actualité (`catalogue.actus_max`, 30) ; `catalogue.sport_auto`
  à faux : elle attend la validation ;
- **un sujet d'actualité** attend toujours l'équipe : rédigé dans les trois langues par l'IA si une clé est enregistrée
  (Groq, ou l'emplacement `GEMINI_API_KEY` ; un seul appel par jour, réponse JSON contrôlée : catégorie, longueurs, dates,
  probabilités, source), sinon un brouillon « à rédiger » avec le titre et le lien ; les sujets exclus
  (`quotidien.sujets_exclus` : décès, violence, santé…) sont écartés ;
- une proposition non traitée expire (48 h, ou au coup d'envoi).

**Valider** (panneau, porte `api_equipe`) : `propositions_liste` → `proposition_modifier` (fusion des champs, annulable) →
`proposition_valider` (le marché naît par `wm.fiche_creer` : trois langues, dates, probabilités contrôlées) ou
`proposition_refuser` (motif ; annulable depuis le journal). `quotidien_lancer` relance la tâche à la demande.

**Résoudre** : la liste `marches_liste` (filtre `etat: 'a_resoudre'`) montre le résultat proposé par l'automate ;
`marche_fiche` donne tout (critère, source, valeur relevée, journal). `marche_resoudre` exige le lien de la preuve
(`https://…`) ; l'issue est « oui », « non » ou le code d'une option. Une résolution ne s'annule pas : en cas de doute,
`marche_suspendre` d'abord. `marche_annuler_apercu` montre les remboursements (joueurs désignés par une empreinte) avant
`marche_annuler`.

**Images** : à la création d'une fiche, chaque fichier Commons est noté « à copier » ; `wm-quotidien-reveil` (minutes 5,
15… 55) réveille la fonction tant qu'il en reste (8 par appel) : vignette 250 px (logo) ou 330 px (photo), licence libre
vérifiée (domaine public, CC0, CC BY, CC BY-SA, GFDL ; jamais « fair use », NC ou ND), réduction 128 × 128 par moyenne des
pixels, PNG (logo) ou JPEG qualité 80 (photo), moins de 15 Ko, crédit gardé et servi par `api_credits`. Sans image : l'écran
montre l'icône de la catégorie.

## 7. Les 60 marchés ouverts le 19 nov. 2026

Vérifiés le 19 nov. 2026 (cours, calendriers, sondages, marchés publics, sources officielles) ; la justification de chaque
probabilité de départ est dans la fiche (`p0_justif`, interne). « Permanent » : un modèle crée la période suivante.

| Catégorie | Permanents (30) | Actualité (30) |
|---|---|---|
| Crypto (8) | `btc-fin-decembre-2026`, `sol-fin-novembre-2026`, `btc-semaine-2026-11-23`, `xrp-fin-decembre-2026`, `eth-2000-avant-2027` | `btc-vs-or-2026`, `strategy-vente-btc-2026`, `kraken-ipo-juin-2027` |
| Bourse (6) | `sp500-semaine-2026-11-23`, `nvda-fin-decembre-2026`, `cac40-annee-2026`, `top-capitalisation-fin-2026`, `tsla-fin-decembre-2026` | `anthropic-prix-ipo-fin-2026` |
| Économie (8) | `fed-decembre-2026`, `bce-decembre-2026`, `cpi-usa-novembre-2026`, `eurusd-fin-decembre-2026`, `or-fin-decembre-2026` | `shutdown-usa-decembre-2026`, `budget-france-2027`, `boe-decembre-2026` |
| Politique (8) | `presidentielle-france-2027`, `presidentielle-usa-2028`, `approbation-trump-31-12-2026`, `lecornu-premier-ministre-31-03-2027` | `espagne-legislatives-2026`, `israel-prochain-pm`, `le-pen-liste-officielle-2027`, `taipei-maire-28-11-2026` |
| Tech (7) | `ia-arena-texte-31-12-2026`, `cap-2e-place-fin-2026`, `starship-vol-16-avant-2027`, `app-store-top-fin-2026` | `nvidia-prochain-pdg`, `tesla-spacex-accord-fusion`, `openai-introduction-en-bourse` |
| Jeux vidéo et culture (7) | `game-awards-2026`, `oscars-2027-meilleur-film`, `grammys-2027-album-de-l-annee` | `avengers-doomsday-premier-week-end`, `gta6-sur-pc-avant-avril-2027`, `time-personnalite-2026`, `box-office-thanksgiving-2026` |
| Sport (16) | `ucl-winner-2026-27`, `nba-champion-2027`, `pl-winner-2026-27`, `ao-men-2027` | matchs : `pl-new-ars-2026-11-21`, `pl-liv-mun-2026-11-22`, `liga-sev-bet-2026-11-21`, `sa-ata-int-2026-11-22`, `bl-bmg-bvb-2026-11-21`, `l1-lil-lyo-2026-11-21`, `ucl-psg-rom-2026-11-25`, `bl-svw-hsv-2026-11-22`, `nba-okc-mia-2026-11-22` ; `news-jaissle-newcastle-2026`, `news-mancity-sanction-2027`, `news-sinner-ao-2027` |

Les 27 anciens marchés fictifs (BCE, Bitcoin 150 000 $, Clásico, présidentielle 2027 inventée…) restent ceux de l'écran
d'avant jusqu'à la mise en ligne ; la migration de mise en ligne les annule en remboursant chaque position au prix d'achat
(`docs/EXPLOITATION.md`, § 10).
