# Wimoro — Données SPORT gratuites (football, basket, tennis)

Recherche du jeudi 19 novembre 2026, appels réels faits entre **12:57Z et 13:36Z** (heures UTC) depuis un poste local (Git Bash + curl, User-Agent curl par défaut, **pas** depuis une IP cloud). Environ 115 requêtes au total, espacées de 2 à 7 s par source. Aucune clé, aucun compte, aucun e-mail utilisés.

- Journal brut de chaque appel (heure UTC | nom | code HTTP | taille | type | URL) : `(notes de travail, hors dépôt) d1\dl-sport\calls.log`
- Réponses brutes (`*.body`, `*.hdr`) : même dossier `dl-sport\`
- Scripts (bash + node, lecture des JSON comme données uniquement) : `(notes de travail, hors dépôt) d1\scripts-sport\` (`call.sh`, `espn_summary.js`, `espn_window.js`, `live_compare.js`, `wikiphoto.sh`)
- Règle appliquée : tout fait vient d'un appel fait ou d'une page lue ; sinon c'est écrit **« non vérifié »**.

---

## 0. Résumé (pour décider vite)

| Sport | Calendrier (J→J+7) | Live | Résultat final | Comptes à créer |
|---|---|---|---|---|
| Football | football-data.org (officiel, gratuit, 6 des 7 compétitions) + ESPN pour l'Europa League | ESPN (seule source gratuite **temps réel** vérifiée, sans clé — mais CGU Disney défavorables) ; secours API-Football (100 req/jour) | football-data.org + ESPN concordants (Europa League : ESPN + API-Football) | football-data.org, API-Sports |
| NBA | balldontlie (plan gratuit : endpoint Games, usage commercial permis) | balldontlie (5 req/min) ; secours ESPN | balldontlie + ESPN concordants | balldontlie |
| EuroLeague (option) | flux officiel `api-live.euroleague.net` (sans clé, non documenté) | `live.euroleague.net/api/Header` | idem + API-Basketball | (API-Sports) |
| Tennis | ESPN ATP/WTA (ATP Finals visibles ; **pas de Coupe Davis**) | ESPN (score jeu par jeu, serveur) | ESPN (+ AcesAPI en 2e source si compte) | (AcesAPI, optionnel) |

Rejetés : flux JSON du CDN NBA (403 Akamai), Sofascore (403), FotMob (CGU interdisent les robots), TheSportsDB gratuit (réponses tronquées à 1-3 matchs par requête, livescore officiellement payant), SportScore (widget limité, docs bloquées), api-tennis.com (essai 14 j), Sportradar (essai 30 j), RapidAPI (carte bancaire exigée même en gratuit), balldontlie ATP/foot/EuroLeague (matchs payants), Sportmonks gratuit (Danemark + Écosse seulement), API-Sports tennis (n'existe pas).

---

## 1. Point de départ : public-apis (section « Sports & Fitness »)

Fichier `https://raw.githubusercontent.com/public-apis/public-apis/master/README.md` téléchargé à 12:57:02Z (HTTP 200, 373 929 octets), section lue lignes 2552 et suivantes. Entrées pertinentes retenues pour test : **API-FOOTBALL** (`apiKey`), **balldontlie** (listée « No » auth mais en réalité clé requise, voir plus bas), **Football-Data** (`X-Mashape-Key` dans la liste ; en réalité `X-Auth-Token`), **NBA Data** (API-Sports via RapidAPI), **OpenLigaDB** (No), **TheSportsDB** (`apiKey`), **SportScore** (No — « football, basketball, cricket and tennis »), **AcesAPI** (tennis, `apiKey`), **Sportmonks Football** (`apiKey`). Autres entrées football à clé (KickoffAPI, OpenFoot API, Football Leagues, StrikerAPI, Realtime Sports, TheRundown, 5DollarFootball…) : **non testées** (clé requise, conditions non vérifiées). ESPN, le CDN NBA, Sofascore, FotMob, EuroLeague, api-tennis, Sportradar viennent de ma recherche complémentaire.

---

## 2. Tableaux des sources

Légende délai : **Live** = suit le match en direct ; **Différé** = retard annoncé par l'éditeur ; **Après** = rempli après le match.

### 2.1 Football

| Source | Appel testé (URL exacte) | Résultat (HTTP, extrait, heure UTC) | Clé ? | Quota gratuit (+ lien) | Délai | Appel serveur possible ? | Conditions d'usage (+ lien) | Verdict |
|---|---|---|---|---|---|---|---|---|
| **ESPN site API** (non officielle) | `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=202611` (idem `esp.1`, `ita.1`, `ger.1`, `fra.1`, `uefa.champions`, `uefa.europa`) ; live : `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard` ; détail : `.../soccer/eng.1/summary?event=401879246` | 200 à 12:59:24Z, 29 067 o, 32 matchs de novembre ; ex. `2026-11-21T12:30Z Manchester City vs Fulham STATUS_SCHEDULED`. Les 7 compétitions : 200 entre 12:59:38Z et 12:59:51Z. Live 13:12:23Z : `France U17 1-0 Haiti U17 · STATUS_FIRST_HALF · displayClock 11' · period 1`. Final : `Liverpool 0 - Arsenal 1 (W) STATUS_FULL_TIME completed=true` (summary, 13:22:36Z). **Piège** : `dates=20261119-20261126` → 400 `{"code":400,"message":"Failed to get events endpoint."}` (12:58:23Z) ; utiliser `dates=YYYYMM` ou `dates=YYYYMMDD`. | Non | Aucun quota publié. En-têtes observés : `Cache-Control: max-age=7` (eng.1), `max-age=10` (soccer/all), `Access-Control-Allow-Origin: *` | **Live** (minute, période, statut ; même score et même minute 11' que FotMob le 19/11 à 13:12Z) | Oui depuis curl sans en-tête particulier ; depuis IP cloud : non vérifié (aucun blocage observé ni documenté trouvé) | API publique fermée en 2014 (clés désactivées le 8/12/2014 : https://www.cmswire.com/cms/customer-experience/espn-slam-dunks-its-public-api-026291.php). CGU Disney (couvrent la marque ESPN) : interdit d'« access, monitor, copy or extract … using a robot, spider, script, or other automated means » (2.B.x) et tout usage « commercial or business-related » (2.B.viii) : https://disneytermsofuse.com/english/ | **Primaire LIVE** (seule source gratuite vérifiée qui permet un rafraîchissement toutes les 30 s des 7 compétitions sans quota publié), **secours calendrier/résultat** — risque CGU à accepter explicitement (maquette non commerciale, appels serveur modérés, cache) |
| **football-data.org** v4 | `https://api.football-data.org/v4/competitions` ; `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=2026-11-19&dateTo=2026-11-26` ; `https://api.football-data.org/v4/matches?dateFrom=2026-11-21&dateTo=2026-11-22` | Sans clé : `/competitions` 200 à 13:00:57Z (`{"count":192,...}`, en-têtes `X-Authenticated-Client: anonymous`, `X-Requests-Available: 49`, `X-RequestCounter-Reset: 86400`) ; `/competitions/PL/matches` **403** à 13:01:05Z (`"The resource you are looking for is restricted..."`) ; `/matches` 200 mais `"resultSet":{"count":0}` à 13:21:12Z (samedi pourtant chargé → l'anonyme ne voit aucun match). Plan gratuit = `TIER_ONE` dans la réponse : **BSA, ELC, PL, CL, EC, FL1, BL1, SA, DED, PPL, PD, WC** ; Europa League `EL` = `TIER_TWO` (payant). | Oui (gratuite) | Gratuit : 12 compétitions, **10 appels/min** ; anonyme : 100 requêtes/24 h, seulement zones et compétitions : https://www.football-data.org/pricing , https://docs.football-data.org/general/v4/policies.html | **Différé** : « Scores delayed », durée non publiée (non vérifié) ; le live est à 12 €/mois | Oui (curl OK) ; IP cloud non vérifié | CGU (https://www.football-data.org/client/register , section T&C) : attribution obligatoire « Football data provided by the Football-Data.org API » (7.1) ; 1 clé = 1 application / 1 domaine (2.3) ; clé à ne pas publier dans un dépôt open source (6.1) ; logos « copyrighted by their legal owner » (9.2) ; pas de clause « non commercial » trouvée | **Primaire calendrier + résultat final** (PL, LaLiga, Serie A, Bundesliga, Ligue 1, Ligue des champions). Pas l'Europa League. |
| **API-Football** (API-Sports) v3 | `https://v3.football.api-sports.io/fixtures?league=39&season=2026&from=2026-11-19&to=2026-11-26` ; `https://v3.football.api-sports.io/status` | 403 à 13:02:59Z et 13:02:56Z : `"errors":{"token":"Missing application key, Check our documentation on how to add your API key in headers."}` → API vivante | Oui (gratuite) | **100 requêtes/jour**, sans carte, « Free plans are limited in terms of available seasons » ; quota remis à zéro à 00:00 UTC ; limite/minute du gratuit non chiffrée : https://www.api-football.com/pricing , https://www.api-football.com/terms (pages lues via navigateur, Cloudflare bloque curl) | **Live** : « updated every 15 seconds » (doc https://www.api-football.com/documentation-v3) | Oui pour l'API (réponse JSON à curl) ; le site vitrine est derrière Cloudflare | Projets « applications, websites, fantasy soccer games » autorisés, revente interdite, un seul compte par développeur ; « betting platforms … may require additional licenses » ; logos fournis « solely for identification and descriptive purposes » (https://www.api-football.com/terms) | **Secours LIVE + confirmation résultat Europa League** (`fixtures?ids=` jusqu'à 20 matchs par appel). Saison 2026 accessible en gratuit : **non vérifié** (à tester dès la clé obtenue). |
| **OpenLigaDB** | `https://api.openligadb.de/getmatchdata/bl1` ; `https://api.openligadb.de/getmatchdata/bl1/2026/9` ; `https://api.openligadb.de/getcurrentgroup/bl1` | 200 à 13:06:20Z : 9 matchs de la 10e journée (`2026-11-20T19:30:00Z FC Bayern München vs 1. FC Köln`) ; J9 200 à 13:06:37Z : `Halbzeit 0-0`, `Endergebnis 2-0` (Freiburg–Union) ; `{"groupName":"10. Spieltag"}` | Non | Aucun quota publié (site https://www.openligadb.de/) | Communautaire : saisie par les utilisateurs ; mise à jour tardive observée (HSV–Gladbach du 06/11, `lastUpdateDateTime` 2026-11-10) | Oui (curl OK) | Données sous **ODbL** (« Die über diese API bereitgestellten Daten stehen unter der Open Database License ») ; détail des obligations ODbL : non relu ici ; « kostenloses Community-Projekt » : https://www.openligadb.de/ | **Secours / 3e source pour la Bundesliga uniquement** |
| **TheSportsDB** (clé publique `123`) | `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4328` ; `.../eventsday.php?d=2026-11-21&l=4328` ; `.../livescore.php?s=Soccer` ; `https://www.thesportsdb.com/api/v2/json/livescore/soccer` | 200 (13:05:03Z) : **1 seul** match (`Manchester City vs Fulham`) ; 200 (13:05:06Z) : **3** matchs ; v1 livescore 200 (13:05:13Z) : 20 matchs, `updated 2026-11-19 13:05:01` ; v2 **400** (13:05:09Z) `"Missing API key in header"` | Clé publique `123` | Gratuit : 30 req/min, résultats tronqués (eventsnextleague 1, eventsday 3, eventsseason 15) : https://www.thesportsdb.com/documentation ; livescore « 2 min » seulement en payant (9 $/mois) : https://www.thesportsdb.com/pricing | Livescore v1 vu avec ~1-2 min de retard (9' quand ESPN affichait 11') mais **non documenté en gratuit** | Oui (curl OK) | Gratuit = développement ; utilisateurs payants doivent citer la source ; images surtout créées par des fans, CC seulement pour ce que TheSportsDB possède, logos « as is » : https://www.thesportsdb.com/docs_terms_of_use.php | **Rejeté** comme source principale (troncature) ; utilisable ponctuellement en contrôle croisé |
| **FotMob** (non officiel) | `https://www.fotmob.com/api/data/matches?date=20261121` ; `...?date=20261119&timezone=UTC` ; `https://www.fotmob.com/api/matches?date=20261121` | 200 (13:07:00Z) 156 ligues, ex. `"Premier League","matches":[{"id":5795522,...,"Manchester City"` ; live 13:12:24Z `France U17 1-0 Haiti U17 liveTime.long "10:35"` ; ancien chemin `/api/matches` → 404 | Non | Aucun publié | Live | Techniquement oui (curl OK) | « The use of automatic services (robots, crawler, indexing etc.) as well as other methods for systematic or regular use is not permitted. » (https://www.fotmob.com/terms) | **Rejeté** (CGU explicites contre les robots). Utilisé ici uniquement pour 2 contrôles croisés. |
| **Sofascore** (non officiel) | `https://api.sofascore.com/api/v1/sport/football/events/live` ; `https://www.sofascore.com/api/v1/sport/football/scheduled-events/2026-11-21` | **403** (13:06:49Z, 13:06:54Z) `{"error": {"code": 403, "reason": "Forbidden" }}` (serveur Varnish) | Non | — | — | **Non** (refusé même depuis un poste local) | Non vérifié (CGU non trouvées) | **Rejeté** |
| **SportScore** | `https://sportscore.com/api/widget/matches/?sport=tennis&limit=10` (chemin trouvé dans le code du client PyPI `sportscore` 0.2.0) ; `https://sportscore.com/developers/openapi.yaml` | Widget 200 (13:08:46Z) mais 10 matchs seulement, sans filtre date/compétition, `x-sc-widget-cache: STALE`, `"updated": "2026-11-19T12:03:56"` ; doc/OpenAPI **403 Cloudflare** (13:07:50Z, 13:08:18Z) | Non | « ~10,000 req / 24h / IP » contre un lien « Powered by SportScore » (https://pypi.org/project/sportscore/) | Widget en cache (1 h observée) | Widget oui, doc non | Lien retour dofollow obligatoire ; CGU https://sportscore.com/developers/terms/ non lues (bloquées) | **Rejeté** (inutilisable pour un calendrier ciblé) |
| **Sportmonks** (gratuit) | non appelé | Page lue : gratuit = « Danish Superliga & Scottish Premiership » | Oui | https://www.sportmonks.com/football-api/free-plan | — | — | — | **Rejeté** (aucune compétition demandée) |

### 2.2 Basketball (NBA, EuroLeague)

| Source | Appel testé (URL exacte) | Résultat (HTTP, extrait, heure UTC) | Clé ? | Quota gratuit (+ lien) | Délai | Appel serveur possible ? | Conditions d'usage (+ lien) | Verdict |
|---|---|---|---|---|---|---|---|---|
| **ESPN NBA** (non officiel) | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` ; `...?dates=20261119` ; `...?dates=202611&limit=300` | 200 (12:57:53Z) : 12 matchs du 18/11 (date US), ex. `Cleveland Cavaliers 121 - 124 Memphis Grizzlies STATUS_FINAL period=4` ; `dates=20261119` 200 (13:00:20Z) : 4 matchs à `2026-11-20T01:00Z` ; `dates=202611` seul = **100** matchs (plafond) ; avec `limit=300` 200 (13:00:33Z), 306 939 o, 215 matchs dont 48 dans la fenêtre | Non | Aucun publié ; `Cache-Control: max-age=1` | Live attendu (structure `state=in`, `period`, `displayClock` vue en football/tennis) ; **live NBA non observé** pendant la session (matchs à partir de 00:00Z) | Oui (curl OK) ; IP cloud non vérifié | Mêmes CGU Disney que ci-dessus | **Secours** NBA (calendrier, live, résultat) |
| **CDN NBA** (`cdn.nba.com` liveData) | `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json` | **403** (13:04:19Z) `Access Denied` (Akamai, `errors.edgesuite.net`) | Non | — | — | **Non** avec un client serveur normal ; `stats.nba.com` « does not respond to many cloud-hosting IP ranges » (https://pypi.org/project/nba-api/) | CGU NBA : pas de reproduction du « Basketball Content », statistiques non utilisables pour un « database … of comprehensive, regularly updated statistics » (https://www.nba.com/termsofuse) | **Rejeté** |
| **balldontlie** (NBA) | `https://api.balldontlie.io/v1/games?dates[]=2026-11-19` ; `https://api.balldontlie.io/v1/teams` | **401** `Unauthorized` (13:04:34Z, 13:04:37Z) → API vivante | Oui (gratuite) | Gratuit : **5 req/min**, endpoints Teams, Players, **Games** : https://docs.balldontlie.io/ | « Game data is realtime for in-progress games » (doc ; non vérifié sans clé) ; champs `status` (« 1st Qtr »… « Final »), `status_state` (`scheduled`, `in_progress`, `final`, `postponed`…), `period`, `time` | Oui (API Express sur Render, CORS `*`) | « You may use Data … for any lawful personal or commercial purpose » ; cache/stockage permis ; pas d'attribution exigée ; interdit de bâtir une API concurrente (https://www.balldontlie.io/terms) | **Primaire NBA** (calendrier, live, résultat) |
| **API-NBA / API-Basketball** (API-Sports) | `https://v2.nba.api-sports.io/status` ; `https://v1.basketball.api-sports.io/status` | 403 (13:03:06Z, 13:03:03Z) `"Missing application key"` | Oui (même compte qu'API-Football) | « Once registered on our dashboard you will also have Free access to our other APIs: … Basketball, … NBA » (https://www.api-football.com/sports) ; quota exact par API : **non vérifié** (pages api-sports.io bloquées par Cloudflare, même en navigateur) | Non vérifié | Oui pour l'API | Mêmes CGU API-Sports | **Dernier recours** NBA ; **secours EuroLeague** |
| **EuroLeague** (flux officiel « Competition Engine », non documenté) | `https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games` ; `https://live.euroleague.net/api/Header?gamecode=120&seasoncode=E2026` | 200 (13:11:24Z) : 380 matchs de la saison 2026-27, 20 dans la fenêtre, ex. `2026-11-19T17:15:00Z Maccabi Rapyd Tel Aviv vs Dubai Basketball` ; Header 200 (13:17:17Z) : `"Live":false,..."ScoreA":"83","ScoreB":"79",..."GameTime":"40:00"` (Besiktas–Real Madrid) | Non (le swagger déclare un schéma `ApiKey` mais les appels passent sans) | Aucun publié ; `Cache-Control: public, max-age=7200` sur la liste | Live via `Header` (`Live`, `Quarter`, `RemainingPartialTime`) — non observé en direct (1er match à 17:15Z) | Oui (curl OK) | **Non vérifié** (CGU du site non trouvées) | **Option / secours** EuroLeague (risque juridique inconnu) |
| **balldontlie EuroLeague** | doc lue | Games = « Requires ALL-STAR or GOAT » | Oui | https://euroleague.balldontlie.io/ | — | — | — | **Rejeté** (matchs payants) |
| **TheSportsDB NBA** | `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-11-19&l=4387` | 200 (13:09:14Z) : 3 matchs seulement, ex. `Cleveland Cavaliers 121 - 124 Memphis Grizzlies FT` | Clé `123` | eventsday limité à 3 | Après | Oui | voir 2.1 | **Rejeté** (troncature) ; contrôle croisé ponctuel |

### 2.3 Tennis (ATP/WTA ; ATP Finals ; Coupe Davis)

Ce qui se joue réellement : **Nitto ATP Finals**, Inalpi Arena, Turin, 15→22 nov. 2026 (lu dans la réponse ESPN) ; côté WTA, ESPN ne montre cette semaine que le **LP Open by IND** à Colina (Chili), 15→22 nov. (catégorie non indiquée, non vérifiée) ; **Coupe Davis Final 8** à Bologne du **24 au 29 nov. 2026** (communiqué lu : https://tennistourtalk.com/137708/schedule-confirmed-for-2026-davis-cup-final-8). Aucune API gratuite testée ne couvre la Coupe Davis (le calendrier ATP d'ESPN s'arrête au 22/11 ; `dates=20261124` → 0 événement).

| Source | Appel testé (URL exacte) | Résultat (HTTP, extrait, heure UTC) | Clé ? | Quota gratuit (+ lien) | Délai | Appel serveur possible ? | Conditions d'usage (+ lien) | Verdict |
|---|---|---|---|---|---|---|---|---|
| **ESPN tennis** (non officiel) | `https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard` ; `.../tennis/wta/scoreboard` ; `.../tennis/atp/scoreboard?dates=202611` ; `...?dates=20261124` | ATP 200 (12:57:55Z) : « Nitto ATP Finals », 15 simples + 15 doubles. **Live observé** sur Jodar–Shelton : 13:04:17Z `STATUS_SCHEDULED "8:10 AM EST"` (horaire décalé de 13:00Z à 13:10Z en temps réel) → 13:13:39Z `STATUS_IN_PROGRESS "1st Set"` → 13:20:55Z jeux `0-1`, service Jodar → 13:25:47Z `1-2` → 13:35:38Z `2-3`. WTA 200 (13:00:44Z) : « LP Open by IND », Colina. `dates=20261124` 200 mais 0 événement (13:11:03Z) | Non | Aucun publié ; `Cache-Control: max-age=5` à `6` | **Live** : jeux du set en cours (`linescores`), numéro de set (`period`), serveur (`possession`) ; score du jeu en cours (points) : non observé | Oui (curl OK) ; IP cloud non vérifié | CGU Disney (voir 2.1) | **Primaire tennis** (seule source gratuite vérifiée) — même réserve CGU ; pas de Coupe Davis |
| **AcesAPI** | `POST https://mcp.acesapi.com/v1/get_schedule` (corps `{}`) | **401** (13:10:33Z) `"Missing API key... Get a free key with 500 credits every month at https://acesapi.com/signup"` | Oui (gratuite, « no card ») | **500 crédits/mois**, 10 à 60 req/min selon le solde ; coût en crédits par appel non vérifié : https://acesapi.com/docs | `get_schedule` = « Upcoming and in-progress matches for the next days » ; fréquence live non publiée | Oui (API répond) | « Singles only » ; CGU non lues (non vérifié) | **Secours** (2e source de résultat, simples uniquement) |
| **api-tennis.com** | `https://api.api-tennis.com/tennis/?method=get_events` | 200 (13:27:05Z) `{"error":"1","result":[{"param":"APIkey","msg":"The field is mandatory"...` | Oui | **Essai 14 jours** puis Starter 40 $/mois (https://api-tennis.com/) | non vérifié | Oui | non lues | **Rejeté** (essai seulement) |
| **Sportradar Tennis** | `https://api.sportradar.com/tennis/trial/v3/en/schedules/live/summaries.json` | **403** (13:27:08Z) `Authentication Error` | Oui | **Essai 30 jours**, 1 000 requêtes / 30 j glissants, 1 QPS ; « Production access is reserved for Sportradar customers » (https://developer.sportradar.com/getting-started/docs/your-account) | Live (non vérifié) | Oui | réservé aux clients en production | **Rejeté** (essai seulement) |
| **RapidAPI** (API tennis « freemium ») | non appelé | Doc RapidAPI : les API freemium « require a credit card, even for the free plan », dépassements facturés (https://docs.rapidapi.com/v2.0/docs/api-pricing) | Oui + carte | — | — | — | — | **Rejeté** (carte bancaire, risque de facturation) |
| **balldontlie ATP/WTA** | `https://api.balldontlie.io/atp/v1/matches` | **401** (13:27:11Z) `Unauthorized` | Oui | Gratuit = Players, Tournaments, Rankings ; **Matches : No** (https://atp.balldontlie.io/) | — | Oui | voir 2.2 | **Rejeté** (matchs payants) |
| **API-Sports tennis** | `https://v1.tennis.api-sports.io/status` | `curl: (6) Could not resolve host` (13:03:10Z) ; la liste officielle des API ne contient pas le tennis (https://www.api-football.com/sports) | — | — | — | — | — | **Rejeté** (n'existe pas) |
| **TheSportsDB tennis** | `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-11-19&s=Tennis` | 200 (13:09:11Z) `{"events":null}` | Clé `123` | — | — | Oui | — | **Rejeté** |
| **SportScore tennis** | `https://sportscore.com/api/widget/matches/?sport=tennis&limit=10` | 200 (13:08:46Z), 10 matchs de Challengers (ex. `Darwin Blanch 2-0 Samir Banerjee, ATP Challenger Drummondville`), cache `STALE` | Non | voir 2.1 | En cache | Widget oui | lien retour obligatoire | **Rejeté** |
| **Sofascore tennis** | `https://api.sofascore.com/api/v1/sport/tennis/events/live` | **403** (13:27:13Z) | — | — | — | Non | non vérifié | **Rejeté** |

---

## 3. Matchs réels des 7 prochains jours (jeu. 19 → jeu. 26 nov. 2026, heures UTC)

Source principale de la liste : **ESPN** (`scoreboard?dates=202611`, appels de 12:59:24Z à 13:00:33Z). Contrôles croisés faits : **OpenLigaDB** confirme les 9 matchs de Bundesliga (mêmes heures) ; **FotMob** confirme les 26 matchs du samedi 21/11 des 5 grands championnats (mêmes heures UTC) ; **TheSportsDB** confirme Man City–Fulham, Newcastle–Arsenal, Bournemouth–Forest et Tottenham–Ipswich. L'identifiant ESPN (`id`) est donné pour réutilisation directe (`.../summary?event=<id>`).

### Premier League (10 matchs)
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 21/11 12:30 | Manchester City – Fulham | 401879233 |
| 21/11 15:00 | AFC Bournemouth – Nottingham Forest | 401879238 |
| 21/11 15:00 | Aston Villa – Sunderland | 401878756 |
| 21/11 15:00 | Chelsea – Leeds United | 401879236 |
| 21/11 15:00 | Coventry City – Crystal Palace | 401879235 |
| 21/11 15:00 | Tottenham Hotspur – Ipswich Town | 401878754 |
| 21/11 17:30 | Newcastle United – Arsenal | 401879232 |
| 22/11 14:00 | Hull City – Brighton & Hove Albion | 401879234 |
| 22/11 16:30 | Liverpool – Manchester United | 401878755 |
| 23/11 20:00 | Brentford – Everton | 401879237 |

### LaLiga (10 matchs)
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 20/11 20:00 | Athletic Club – Espanyol | 401882805 |
| 21/11 13:00 | Alavés – Deportivo (La Corogne) | 401882806 |
| 21/11 15:15 | Rayo Vallecano – Valencia | 401882799 |
| 21/11 17:30 | Sevilla – Real Betis | 401882797 |
| 21/11 20:00 | Real Madrid – Celta Vigo | 401882798 |
| 22/11 13:00 | Barcelona – Villarreal | 401882804 |
| 22/11 15:15 | Racing Santander – Real Sociedad | 401882800 |
| 22/11 17:30 | Osasuna – Málaga | 401882801 |
| 22/11 20:00 | Getafe – Atlético Madrid | 401882803 |
| 23/11 20:00 | Levante – Elche | 401882802 |

### Serie A (10 matchs)
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 21/11 14:00 | Como – Cagliari | 401875056 |
| 21/11 14:00 | Lazio – Lecce | 401874981 |
| 21/11 17:00 | Parma – AS Roma | 401874967 |
| 21/11 19:45 | Napoli – Torino | 401875067 |
| 22/11 11:30 | Juventus – Venezia | 401875008 |
| 22/11 14:00 | Bologna – Udinese | 401875047 |
| 22/11 14:00 | Sassuolo – Genoa | 401874960 |
| 22/11 17:00 | AC Milan – Frosinone | 401874989 |
| 22/11 19:45 | Atalanta – Internazionale | 401875001 |
| 23/11 19:45 | Monza – Fiorentina | 401875009 |

### Bundesliga (9 matchs, 10e journée — confirmés par OpenLigaDB)
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 20/11 19:30 | Bayern Munich – FC Cologne (1. FC Köln) | 401884736 |
| 21/11 14:30 | 1. FC Union Berlin – RB Leipzig | 401884732 |
| 21/11 14:30 | Bayer Leverkusen – SC Paderborn 07 | 401884735 |
| 21/11 14:30 | Borussia Mönchengladbach – Borussia Dortmund | 401884731 |
| 21/11 14:30 | Eintracht Frankfurt – TSG Hoffenheim | 401884734 |
| 21/11 14:30 | SV Elversberg – SC Freiburg | 401884728 |
| 21/11 17:30 | Schalke 04 – VfB Stuttgart | 401884729 |
| 22/11 14:30 | FC Augsburg – Mainz | 401884733 |
| 22/11 16:30 | Werder Bremen – Hamburg SV | 401884730 |

### Ligue 1 (9 matchs)
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 20/11 19:45 | Troyes – Le Havre AC | 401876395 |
| 21/11 16:15 | Nice – Paris Saint-Germain | 401876398 |
| 21/11 19:45 | AS Monaco – AJ Auxerre | 401876399 |
| 21/11 19:45 | Lens – Toulouse | 401876403 |
| 21/11 19:45 | Lille – Lyon | 401876402 |
| 21/11 19:45 | Strasbourg – Brest | 401876396 |
| 22/11 14:00 | Paris FC – Angers | 401876397 |
| 22/11 16:15 | Lorient – Stade Rennais | 401876401 |
| 22/11 19:45 | Marseille – Le Mans | 401876400 |

### Ligue des champions (18 matchs)
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 24/11 17:45 | Bodo/Glimt – LASK Linz | 401915380 |
| 24/11 17:45 | Galatasaray – Aston Villa | 401915300 |
| 24/11 20:00 | Arsenal – Borussia Dortmund | 401915295 |
| 24/11 20:00 | Como – AEK Athens | 401915296 |
| 24/11 20:00 | Feyenoord Rotterdam – FC Porto | 401915294 |
| 24/11 20:00 | Manchester City – Napoli | 401915379 |
| 24/11 20:00 | RB Leipzig – Lens | 401915299 |
| 24/11 20:00 | Real Madrid – PSV Eindhoven | 401915298 |
| 24/11 20:00 | Slovan Bratislava – Real Betis | 401915297 |
| 25/11 17:45 | Sabah FK – Barcelona | 401915378 |
| 25/11 17:45 | Slavia Prague – Villarreal | 401915293 |
| 25/11 20:00 | Atlético Madrid – Viking FK | 401915291 |
| 25/11 20:00 | Club Brugge – Liverpool | 401915292 |
| 25/11 20:00 | Internazionale – VfB Stuttgart | 401915376 |
| 25/11 20:00 | Lille – Bayern Munich | 401915377 |
| 25/11 20:00 | Paris Saint-Germain – AS Roma | 401915374 |
| 25/11 20:00 | Shakhtar Donetsk – Fenerbahce | 401915375 |
| 25/11 20:00 | Sporting CP – Manchester United | 401915373 |

### Ligue Europa (18 matchs, tous le 26/11)
17:45 : Besiktas – Hapoel Be'er (401915506), Celta Vigo – AFC Bournemouth (401915519), Dinamo Zagreb – Bayer Leverkusen (401915517), Marseille – Levski Sofia (401915507), Olympiacos – AC Milan (401915521), RB Salzburg – Ararat-Armenia (401915520), Union St.-Gilloise – Lech Poznan (401915508), Viktoria Plzen – Benfica (401915518).
20:00 : Crystal Palace – Real Sociedad (401915504), Ferencvaros – NK Celje (401915516), Juventus – Omonia Nicosia (401915502), Lyon – Lillestrom (401915501), NEC Nijmegen – Stade Rennais (401915505), OFI Crete – Anderlecht (401915503), Sparta Prague – AZ Alkmaar (401915514), Sunderland – Jagiellonia Bialystok (401915513), Torreense – Celtic (401915512), TSG Hoffenheim – SK Sturm Graz (401915515).

### NBA (sélection de 12 affiches sur les 48 matchs de la fenêtre ; ESPN, « domicile – extérieur »)
Attention : la date NBA est la date **US (ET)** ; un match « du 19/11 » commence le 20/11 à 01:00Z.
| UTC | Domicile – Extérieur | id ESPN |
|---|---|---|
| 20/11 01:00 | Minnesota Timberwolves – New York Knicks | 401910021 |
| 20/11 01:00 | Memphis Grizzlies – Golden State Warriors | 401910019 |
| 21/11 01:00 | Oklahoma City Thunder – New Orleans Pelicans | 401909310 |
| 21/11 03:00 | Denver Nuggets – Houston Rockets | 401909312 |
| 21/11 03:00 | Los Angeles Lakers – Sacramento Kings | 401909313 |
| 22/11 03:00 | Sacramento Kings – Boston Celtics | 401910028 |
| 22/11 23:00 | Miami Heat – Oklahoma City Thunder | 401910030 |
| 23/11 01:30 | Golden State Warriors – Boston Celtics | 401910035 |
| 24/11 03:00 | Los Angeles Lakers – Utah Jazz | 401910044 |
| 25/11 22:00 | Philadelphia 76ers – Miami Heat | 401909317 |
| 26/11 00:30 | New York Knicks – Cleveland Cavaliers | 401909319 |
| 26/11 00:30 | Oklahoma City Thunder – Minnesota Timberwolves | 401909320 |

Contrôle croisé des résultats de la nuit du 18/11 : TheSportsDB donne les mêmes scores qu'ESPN pour les 3 matchs qu'il renvoie (Cavaliers 121-124 Grizzlies, Pacers 104-119 Rockets, Heat 137-130 Bucks).

### EuroLeague (bonus — flux officiel `api-live.euroleague.net`, 20 matchs)
19/11 : 17:15 Maccabi Rapyd Tel Aviv – Dubai Basketball ; 18:00 Zalgiris Kaunas – Panathinaikos AKTOR Athens ; 19:00 FC Bayern Munich – Kosner Baskonia ; 19:30 Armani Olimpia Milan – Fenerbahce Tarfin Istanbul ; 19:45 Paris Basketball – Hapoel IBI Tel Aviv ; 20:00 Valencia Basket – Virtus Bologna.
20/11 : 17:30 Anadolu Efes – LDLC ASVEL ; 19:15 Olympiacos – Real Madrid ; 19:30 FC Barcelona – Crvena Zvezda ; 19:45 Partizan – Besiktas.
24/11 : 17:00 Besiktas – Paris Basketball ; 18:00 Crvena Zvezda – Virtus Bologna ; 19:00 FC Bayern Munich – Maccabi Rapyd Tel Aviv ; 19:30 Valencia Basket – Panathinaikos ; 19:45 LDLC ASVEL – Armani Olimpia Milan ; 20:00 FC Barcelona – Fenerbahce.
25/11 : 16:00 Dubai Basketball – Partizan ; 19:15 Olympiacos – Hapoel IBI Tel Aviv ; 19:30 Baskonia – Anadolu Efes ; 19:45 Real Madrid – Zalgiris Kaunas.

### Tennis
**Nitto ATP Finals (Turin) — ESPN, état à 13:35:38Z**
| UTC | Tableau / tour | Match | id ESPN | État |
|---|---|---|---|---|
| 19/11 13:10 | Simple, poules | Rafael Jodar – Ben Shelton | 187507 | en cours (2-3, 1er set) |
| 19/11 17:00 | Double, poules | Arribage / Olivetti – Heliovaara / Patten | 187516 | prévu |
| 19/11 19:30 | Simple, poules | Arthur Fils – Alexander Zverev | 187504 | prévu |
| 20/11 10:30 | Double, poules | Granollers / Zeballos – Harrison / Skupski | 187521 | prévu |
| 20/11 13:00 | Simple, poules | Flavio Cobolli – Carlos Alcaraz | 187510 | prévu |
| 20/11 17:00 | Double, poules | Krawietz / Puetz – Bolelli / Vavassori | 187526 | prévu |
| 20/11 19:30 | Simple, poules | Frances Tiafoe – Daniil Medvedev | 187513 | prévu |
| 21/11 | Simple : demi-finales | à déterminer | 187527, 187528 | heure « TBD » (ESPN affiche 05:00Z) |
| 21/11 | Double : demi-finales | à déterminer | 187530, 187531 | idem |
| 22/11 | Finales simple / double | à déterminer | 187529 / 187532 | idem |

**LP Open by IND (WTA, Colina, Chili) — ESPN** : 19/11 14:30 Carole Monnet – Lucia Bronzetti ; 16:00 Veronika Erjavec – Valeriya Strakhova ; 18:30 Irene Burillo – Anastasia Zolotareva ; 22:00 Andrea Lazaro Garcia – Fernanda Labrana ; quarts le 20/11 (dont Laura Samson – Rebeka Masarova), demies le 21/11, finale le 22/11 (horaires « TBD »).

**Coupe Davis Final 8 (Bologne) — source : communiqué (pas une API), https://tennistourtalk.com/137708/schedule-confirmed-for-2026-davis-cup-final-8** (heures CET converties en UTC) : mar. 24/11 15:00 Tchéquie – Canada ; mer. 25/11 15:00 Italie – Corée du Sud ; jeu. 26/11 09:00 Grande-Bretagne – Allemagne ; jeu. 26/11 pas avant 16:00 Autriche – Espagne ; demies 27/11 15:00 et 28/11 11:00 ; finale 29/11 14:00. Aucune source gratuite testée ne fournit ces rencontres → création et résolution **manuelles** si l'on veut ces marchés.

### Preuves de fiabilité des résultats finaux (contrôles faits)
- Bundesliga J9 : ESPN et OpenLigaDB donnent **8 scores finaux identiques sur 8** comparés automatiquement (le 9e, Köln–Leverkusen, n'a pas été apparié à cause du nom « FC Cologne » chez ESPN → il faut une table de correspondance par identifiant, pas par nom).
- Live : à 13:12:23Z, ESPN, FotMob et TheSportsDB donnaient le même score (France U17 1-0 Haïti U17) ; minute 11' chez ESPN/FotMob, 9' chez TheSportsDB (mise à jour 13:11:01).

---

## 4. Logos et photos

| Besoin | Source | URL testée | Résultat | Licence / conditions |
|---|---|---|---|---|
| Logos foot | ESPN (champ `team.logo` du scoreboard) | `https://a.espncdn.com/i/teamlogos/soccer/500/382.png` | 200 image/png | Contenus et marques de Disney ou de ses concédants, pas d'usage commercial (https://disneytermsofuse.com/english/) ; les blasons restent des marques des clubs |
| Logos foot | football-data.org (`crest` / `emblem`) | `https://crests.football-data.org/57.png` ; `https://crests.football-data.org/PL.png` (dans la réponse) | 200 image/png | T&C 9.2 : « All graphics, including team logos … are copyrighted by their legal owner. You'll have to obtain consent » |
| Logos foot | API-Football (média) | `https://media.api-sports.io/football/teams/42.png` | 200 image/png | Gratuits, ne comptent pas dans le quota, « solely for identification and descriptive purposes », droits tiers ; CDN limité → les stocker chez soi (https://www.api-football.com/documentation-v3) |
| Logos foot | TheSportsDB | `https://r2.thesportsdb.com/images/media/team/badge/vwpvry1467462651.png` | 200 image/png | Surtout créés par des fans ; CC seulement pour ce que TheSportsDB détient ; logos de marque « as is » |
| Logos foot | OpenLigaDB (`teamIconUrl`) → Wikimedia Commons | `File:Logo FC Bayern München (2002–2017).svg`, `File:FC Schalke 04 Logo.png`, `File:SV-Werder-Bremen-Logo.svg` (API Commons, 13:20:44Z) | 200 | **Public domain** + « trademarked » pour les 3 ; mais OpenLigaDB mélange aussi imgur et `assets.dfb.de` (droits inconnus) |
| Logos NBA | ESPN | `https://a.espncdn.com/i/teamlogos/nba/500/mem.png` | 200 image/png | Disney (voir ci-dessus) |
| Logos NBA | CDN NBA | `https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg` | 200 image/svg+xml (alors que le liveData est en 403) | CGU NBA : marques utilisables seulement « with the written permission of its respective owner » (https://www.nba.com/termsofuse) |
| Logos EuroLeague | flux officiel (`images.crest`) | URLs `media-cdn.incrowdsports.com/...`, `media-cdn.cortextech.io/...` présentes dans la réponse | non téléchargées | non vérifié |
| Photos tennis | ESPN | athlète `https://site.web.api.espn.com/apis/common/v3/sports/tennis/atp/athletes/9250` (200, **aucun champ headshot**) ; `https://a.espncdn.com/i/headshots/tennis/players/full/9250.png` | **404** | ESPN ne fournit que des drapeaux pour le tennis (`https://a.espncdn.com/i/teamlogos/countries/500/esp.png` → 200) |
| Photos tennis | **Wikidata (P18) + Wikimedia Commons** | `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Ben%20Shelton...` → Q108532383 → P18 `Shelton MCM23 (27) (52883150181).jpg` → `https://commons.wikimedia.org/w/api.php?action=query&titles=File:...&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=400` | 200 (13:13:22Z→13:13:31Z) ; Shelton : **CC BY-SA 2.0**, auteur « si.robi » ; Alcaraz : `Carlos Alcaraz Roland Garros 2025 (cropped).jpg`, **CC BY-SA 4.0**, auteur « Like tears in rain / derivative work: Kacir » ; `AttributionRequired: true` | Licence libre renvoyée par l'API (avec URL de la licence) ; attribution exigée (`AttributionRequired: true`) → afficher auteur + licence + lien ; autres clauses de la licence : non relues ici |
| Photos tennis | TheSportsDB (`searchplayers`) | `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=Ben_Shelton` | 200 mais 1 seul résultat et **mauvaise personne** (« Shelton Benjamin », sport « Fighting ») | Champ `strCreativeCommons` ; inutilisable en gratuit |

**Recommandation images** : ne jamais lier directement (« hotlink ») ESPN ou le CDN NBA. Télécharger une fois côté serveur, ranger dans Supabase Storage (bucket public `sport-media`), et garder pour chaque image : `source_url`, `licence`, `auteur`, `texte_attribution`, `date_recuperation`. Photos de joueurs : Wikimedia Commons uniquement (licences CC/PD lues via l'API), avec une page « Crédits ». Logos : ce sont des marques ; usage d'identification seulement (pas de modification, pas d'impression de partenariat). Si la licence d'un logo est inconnue, afficher un badge neutre généré (initiales + couleurs) — c'est le choix le plus sûr pour une maquette.

---

## 5. Recommandation

### 5.1 Qui fait quoi (par sport et par besoin)

| Sport / besoin | Primaire | Secours | Dernier recours |
|---|---|---|---|
| **Foot — calendrier J→J+7** | football-data.org `GET /v4/competitions/{PL,PD,SA,BL1,FL1,CL}/matches?dateFrom=J&dateTo=J+7` ; Europa League via ESPN `soccer/uefa.europa/scoreboard?dates=YYYYMM` | ESPN `soccer/{slug}/scoreboard?dates=YYYYMM` (1 appel = le mois entier ; 2 appels si J+7 change de mois) | API-Football `fixtures?league=…&season=2026&from=…&to=…` ; OpenLigaDB (Bundesliga) |
| **Foot — live (score, minute, statut)** | ESPN `soccer/{slug}/scoreboard?dates=YYYYMMDD` (statut `pre`/`in`/`post`, `displayClock`, `period`) | API-Football `fixtures?live=<ids ligues>` (1 appel = tous les matchs en cours des ligues choisies) | football-data.org `matches?status=LIVE` (différé) ; OpenLigaDB (Bundesliga, communautaire) |
| **Foot — résultat final** | football-data.org `status=FINISHED` + `score.fullTime` **et** ESPN `status.type.completed=true` (`STATUS_FULL_TIME`) concordants ; Europa League : ESPN + API-Football | API-Football `fixtures?ids=a-b-c` (≤ 20 matchs/appel) | OpenLigaDB (`Endergebnis`) ; résolution manuelle |
| **NBA — calendrier** | balldontlie `GET /v1/games?start_date=J&end_date=J+7&per_page=100` | ESPN `basketball/nba/scoreboard?dates=YYYYMM&limit=300` | API-NBA (API-Sports) |
| **NBA — live** | balldontlie `GET /v1/games?dates[]=<date US>` (`status`, `period`, `time`, `status_state`) | ESPN `basketball/nba/scoreboard?dates=<date US>` | API-NBA |
| **NBA — résultat final** | balldontlie `status_state=final` **et** ESPN `STATUS_FINAL` concordants | API-NBA | TheSportsDB (3 matchs/jour) ; manuel |
| **EuroLeague (option)** | flux officiel : liste `api-live.euroleague.net/v2/competitions/E/seasons/E2026/games`, live `live.euroleague.net/api/Header?gamecode=N&seasoncode=E2026` | API-Basketball (API-Sports ; saison 2026 en gratuit non vérifiée) | manuel |
| **Tennis — calendrier** | ESPN `tennis/{atp,wta}/scoreboard` (tournoi en cours, tous les matchs) | AcesAPI `get_schedule` (simples) | saisie manuelle (obligatoire pour la Coupe Davis) |
| **Tennis — live** | ESPN (même appel ; `period` = set, `linescores` = jeux, `possession` = serveur) | aucune source gratuite conforme vérifiée | marché sans live (affichage du résultat à la fin) |
| **Tennis — résultat final** | ESPN `STATUS_FINAL` + `winner=true` | AcesAPI (2e source, simples) | manuel (abandons/forfaits : statuts ESPN non observés, non vérifié) |

**Décision à acter par l'équipe** : ESPN est la seule source gratuite qui donne le direct pour les 7 compétitions de foot et pour le tennis, sans clé ; mais ses CGU (Disney) interdisent l'extraction automatisée et l'usage commercial. Pour une **maquette non commerciale à argent fictif**, je recommande de l'accepter **côté serveur seulement**, à fréquence modérée, avec cache et un interrupteur (« kill-switch ») qui bascule sur API-Football/football-data.org. Si l'équipe refuse ce risque : foot live via API-Football (~1 appel toutes les 7 min un samedi, voir 5.3), tennis sans live (résolution après match via AcesAPI ou à la main).

### 5.2 Règle de résolution automatique d'un marché « Qui gagne ? »
1. Fermer le marché au **premier** signal « fini » de la source live (ESPN `state=post` / balldontlie `status_state=final`). Refuser les ordres si la dernière mise à jour live a plus de 90 s (sinon des joueurs qui regardent la TV profitent du retard).
2. Résoudre automatiquement seulement si **deux sources indépendantes** donnent le même vainqueur (foot : 1 / N / 2) et au moins **10 min** après le premier signal (les mises à jour tardives existent : OpenLigaDB a encore modifié la fiche d'un match 4 jours après).
3. Désaccord, une seule source après 2 h, statut `POSTPONED`/`CANCELLED`/`SUSPENDED`/`AWARDED` (football-data) ou statut inconnu → file de résolution manuelle (`POSTPONED`/`CANCELLED` → annulation et remboursement des jetons).
4. Toujours stocker les identifiants de chaque source (id ESPN, id football-data, id balldontlie…) dans une table de correspondance : les noms diffèrent (« FC Cologne » / « 1. FC Köln »).

### 5.3 Fréquences de rafraîchissement (avec le calcul)

| Source | Tâche (pg_cron → Edge Function) | Fréquence | Calcul | Limite | Marge |
|---|---|---|---|---|---|
| football-data.org | Calendrier : 6 compétitions | 06:00 et 18:00 UTC | 6 appels × 2 = **12/jour** | 10/min | énorme |
| football-data.org | Confirmation des résultats : `GET /v4/matches?date=J&status=FINISHED` | toutes les 2 min, de (coup d'envoi + 105 min) jusqu'à confirmation | samedi 21/11 : ~14:15→22:30 = 8,25 h × 30 = **~250/jour** ; pointe 0,5/min | 10/min | 95 % |
| football-data.org | (dernier recours live) `matches?status=LIVE` | 1/min pendant les matchs | 0,5 + 1 = 1,5/min | 10/min | 85 % |
| ESPN foot | Calendrier : 7 ligues `dates=YYYYMM` | 2×/jour | 7 × 2 = **14/jour** (28 en fin de mois) | aucune publiée → plafond maison 20/min, 6 000/jour | — |
| ESPN foot | Live : 1 ligue = 1 appel `dates=YYYYMMDD` | toutes les **30 s**, seulement si un match suivi de la ligue est entre (coup d'envoi − 5 min) et `post` | samedi 21/11 : PL 12:25→19:30 (7,1 h) + LaLiga 12:55→22:00 (9,1 h) + Serie A 13:55→21:45 (7,8 h) + Bundesliga 14:25→19:30 (5,1 h) + Ligue 1 16:10→21:45 (5,6 h) = 34,7 h × 120 = **~4 160 appels** ; pointe 5 ligues × 2 = **10/min** ; mercredi C1 25/11 : 17:40→22:00 = 4,3 h × 120 = **~520** | plafond maison 20/min | 50 % sous le plafond maison |
| API-Football | Mode normal : confirmation Europa League + arbitrages | 1 appel `fixtures?ids=` (18 matchs du 26/11 = 1 appel) + ≤ 5 arbitrages | **≤ 10/jour** | 100/jour | 90 % |
| API-Football | Mode secours (ESPN coupé) : `fixtures?live=<7 ids>` | samedi : 85 appels sur 12:25→22:00 (575 min) → **1 toutes les 7 min** ; mercredi C1 : 260 min / 3,5 min = **74 appels** | 85 + 10 réserve = 95/jour | 100/jour | 5 % (mode dégradé) |
| balldontlie | Calendrier : `games?start_date&end_date&per_page=100` (48 matchs) | 2×/jour | **2/jour** | 5/min | — |
| balldontlie | Live : `games?dates[]=<date US>` (≤ 15 matchs en 1 appel) | toutes les **30 s** entre le 1er entre-deux et le dernier « Final » | nuit type 00:00→06:30Z = 6,5 h × 120 = **780/nuit** ; **2/min** | 5/min | 60 % (limiteur global à 4/min pour laisser passer calendrier et reprises) |
| ESPN NBA | Contrôle du résultat | 1 appel `dates=<date US>` 15 min après le dernier match | **1-2/jour** | — | — |
| ESPN tennis | Live ATP + WTA | toutes les **60 s** par circuit si un match suivi est `in` | ATP Finals 10:30→~23:00 = 12,5 h × 60 = 750 + WTA Colina 14:30→~24:00 = 9,5 h × 60 = 570 → **~1 320/jour**, ≤ 2/min | plafond maison | large |
| ESPN tennis | Calendrier | 2×/jour × 2 circuits | **4/jour** | — | — |
| OpenLigaDB | 3e source Bundesliga | 1 appel 30 min après chaque fin de match + 1 le lendemain matin | **~6/journée de BL** | aucune publiée | — |
| EuroLeague (option) | Liste + live `Header` par match en cours | liste 1×/jour (`max-age=7200`) ; live 30 s/match | jeudi 19/11 : 6 matchs × ~2 h × 120 = **~1 440** ; pointe 4 à 5 matchs simultanés (vers 19:45–20:00) → 8 à 10/min | aucune publiée | — |
| AcesAPI (option) | 2e source tennis | 1 `get_schedule`/jour + ≤ 10 contrôles | ≤ 16 crédits/jour (500/30) | 500 crédits/mois | coût réel par appel non vérifié |

Règles communes : un seul appel par source et par cycle (le navigateur ne lit que la base Supabase), respect du `Cache-Control`, arrêt immédiat et repli sur 429/403/5xx (attente exponentielle), journal des appels dans une table pour surveiller les quotas.

### 5.4 Points non vérifiés (à contrôler avant la mise en route)
- Appels depuis une IP cloud (Supabase Edge Functions) : **non testés** (tous mes appels viennent d'un poste local). Premier test à faire depuis une Edge Function pour ESPN, football-data, balldontlie, API-Sports, OpenLigaDB, EuroLeague.
- Retard exact des scores sur le plan gratuit football-data.org ; présence du champ `minute` en gratuit.
- Accès à la saison 2026 sur le plan gratuit API-Football ; quota gratuit exact d'API-NBA / API-Basketball ; ids de ligues API-Football (39, 140, 135, 78, 61, 2, 3 = ids usuels, non vérifiés sans clé).
- Live NBA chez ESPN et chez balldontlie (aucun match NBA pendant la session).
- Statuts ESPN pour prolongation/tirs au but (`STATUS_FINAL_AET`, `STATUS_FINAL_PEN`), report, abandon ou forfait au tennis : **non observés**.
- Conditions d'usage du flux EuroLeague et de Sofascore : non trouvées.

---

## 6. Comptes gratuits à créer (par le propriétaire ; je n'en ai créé aucun)

| Site | Étapes | Nom de la clé / en-tête | Secret Supabase proposé | Pourquoi |
|---|---|---|---|---|
| **football-data.org** — https://www.football-data.org/client/register | Formulaire : prénom (`name`), e-mail (`email`), langage de programmation (facultatif), cocher « I accept the terms and conditions », bouton « Create account » → le **token arrive par e-mail** (lien « Forgot your token? Resend it » sur la même page). | En-tête **`X-Auth-Token: <token>`** (doc : `curl -XGET 'https://api.football-data.org/v4/competitions/CL/matches' -H "X-Auth-Token: UR_TOKEN"`, https://docs.football-data.org/general/v4/coding_client.html) | `FOOTBALL_DATA_API_KEY` | Calendrier + résultats officiels PL, LaLiga, Serie A, Bundesliga, Ligue 1, C1. Obligations : afficher « Football data provided by the Football-Data.org API » ; 1 clé = 1 site ; ne jamais la publier dans un dépôt. |
| **API-Sports** (API-Football, donne aussi accès Basketball + NBA) — https://dashboard.api-football.com/register | Nom, e-mail, mot de passe (ou « Sign Up with Google ») → e-mail de confirmation → tableau de bord → **Account → My Access** → copier la clé (régénérable). Aucune carte demandée pour le gratuit ; ne rien souscrire. CGU : « forbidden to have multiple accounts to increase the limit of the free plan ». | En-tête **`x-apisports-key: <clé>`** (bases : `https://v3.football.api-sports.io`, `https://v1.basketball.api-sports.io`, `https://v2.nba.api-sports.io`) | `APISPORTS_API_KEY` | Secours live foot (mise à jour 15 s), confirmation Europa League, secours EuroLeague/NBA. Premier appel à faire : `/status` puis un `fixtures?league=39&season=2026` pour vérifier l'accès à la saison en cours. |
| **balldontlie** — https://app.balldontlie.io/signup | Créer le compte (détail du formulaire non vérifié), copier la clé dans le tableau de bord. **Ne pas lancer l'essai GOAT de 7 jours** (moyen de paiement exigé). | En-tête **`Authorization: <clé>`** (sans « Bearer ») | `BALLDONTLIE_API_KEY` | NBA : calendrier, live, résultats (plan gratuit, 5 req/min, usage commercial autorisé). |
| *(optionnel)* **AcesAPI** — https://acesapi.com/signup (clés : https://acesapi.com/dashboard/keys) | Inscription (détail non vérifié) ; 500 crédits/mois sans carte. | En-tête **`x-api-key: <clé>`** ou `Authorization: Bearer <clé>` | `ACESAPI_API_KEY` | 2e source pour résoudre les marchés de tennis (simples seulement). |

Sans compte : ESPN, OpenLigaDB, flux EuroLeague, Wikidata/Wikimedia Commons (pour les photos, mettre un User-Agent générique descriptif). À **ne pas** créer : RapidAPI (carte bancaire même en gratuit), Sportradar (essai 30 jours), api-tennis.com (essai 14 jours), TheSportsDB premium (payant).
