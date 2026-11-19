# Images des marchés Wimoro : sources gratuites, licences et traitement

Recherche du jeudi 2026-11-19. Tous les appels ont été faits réellement (curl depuis Git Bash), entre 12:58Z et 13:22Z (heures UTC).
Les pages de documentation ont été lues le même jour (WebFetch) entre 13:00Z et 13:22Z.
Toute affirmation qui ne vient pas d'un appel ou d'une page lue est marquée **non vérifié**.
Aucun compte créé, aucun e-mail saisi, aucune clé utilisée (seule exception : la clé de test **publique** `123` de TheSportsDB, publiée dans leur documentation).
User-Agent envoyé à tous les domaines Wikimedia : exactement `WimoroImages/1.0 (https://wimoro.com)`. Aux autres domaines : `image-source-test/1.0` (ou `Mozilla/5.0 (compatible; image-source-test/1.0)` pour 4 pages de documentation FMP et Finnhub).

---

## Résumé

1. **Wikimedia (Wikidata → Commons) est la seule source à la fois libre et documentée fichier par fichier** (licence, auteur, attribution requise, restrictions). Elle couvre les personnes (P18), une partie des logos (P154, P8972), les drapeaux (P41), des logos de jeux (GTA VI : domaine public) et de cryptos (Bitcoin : domaine public).
2. **Piège n°1** : le résumé REST de Wikipédia (et `pilicense=any`) renvoie aussi des fichiers **non libres** stockés sur en.wikipedia (écusson du Real Madrid, jaquette de GTA VI : `Fair use`, `NonFree=true`). Il faut filtrer : `prop=pageimages&pilicense=free`, puis contrôle obligatoire par l'API Commons (`extmetadata`).
3. **Piège n°2** : Wikimedia refuse maintenant les largeurs de miniature non standard (128 px → **HTTP 400**). Largeurs admises : 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840. L'API arrondit à la taille standard supérieure (256 demandé → URL en 330 px).
4. **Images fournies par les API de données** : techniquement elles marchent toutes, mais ESPN (conditions Disney), TheSportsDB (clé gratuite = développement seulement, aucun droit sur les logos), football-data.org (§9.2 : accord des clubs requis), FMP et Finnhub interdisent ou n'accordent pas la réutilisation. logo.dev et Brandfetch imposent le hotlink (incompatible avec la copie dans Storage). L'API logo de Clearbit est morte (le DNS ne résout plus). CoinGecko est utilisable comme repli avec la mention « Powered by CoinGecko », mais ses CGU déconseillent le stockage (rafraîchir sous 24 h). Les icônes de `spothq/cryptocurrency-icons` sont libres de droit d'auteur (CC0) pour environ 500 cryptos ; les marques restent aux projets.
5. **Écussons des grands clubs européens** : absents de Commons (non libres). Il faut un repli (initiales), ou le drapeau du pays pour les équipes nationales.
6. **Supabase gratuit** : les transformations d'images (redimensionnement à la volée) ne sont **pas incluses**. Il faut donc produire nous-mêmes des fichiers de taille fixe.
7. **Recommandation** : une Edge Function d'ingestion qui utilise ImageScript `https://deno.land/x/imagescript@1.3.0/mod.ts`. Deux rapports publics la disent fonctionnelle sur Supabase, alors que `npm:imagescript` y plante. Sortie : 128×128 px, PNG pour les logos, JPEG qualité ≈ 80 pour les photos, cible < 15 ko (mesuré : 5 à 12 ko à 120–128 px). Tester ImageScript 3.20.4 (JSR, pur TypeScript, encodage WebP) avant de basculer dessus.
8. **Aucun compte gratuit n'est nécessaire** pour les images : Wikimedia, Wikidata, l'API Commons, spothq et Lucide marchent sans compte ni clé, avec le User-Agent indiqué. La section « Comptes gratuits à créer » est donc omise. Deux comptes resteraient optionnels, seulement si l'équipe choisit ces options :
   - **CoinGecko Demo**, si l'image CoinGecko sert de repli depuis une Edge Function (le mode sans clé est limité par IP partagée) ;
   - **football-data.org**, mais seulement pour les données de match, pas pour les écussons, qui ne sont pas licenciés.

---

## 1. Méthode et point de départ (public-apis)

Fichier lu : `https://raw.githubusercontent.com/public-apis/public-apis/master/README.md` (200, 373 929 o, 12:58:19Z), filtré par grep (non affiché en entier).

| Section du README | Entrées utiles pour des images | Remarque |
|---|---|---|
| Open Data | **Wikipedia** (auth « No »), **Wikidata** (indiqué `OAuth`, mais la lecture marche sans authentification, voir §2) | Base de la chaîne recommandée |
| Cryptocurrency | **CoinGecko** (No), **Coinpaprika** (No), CoinCap, CryptoCompare… | CoinGecko et Coinpaprika testés |
| Sports & Fitness | **TheSportsDB** (« Crowd-Sourced Sports Data and Artwork », `apiKey`), **Football-Data** (football-data.org), API-FOOTBALL, « Football Standings » (données ESPN), balldontlie | TheSportsDB et football-data.org testés ; ESPN testé directement |
| Photography | Unsplash, Pexels, Pixabay, Flickr, Getty, Lorem Picsum, Lightdrift… | **Écartées** : ce sont des banques ou des moteurs de recherche d'images (interdit par la consigne « pas de recherche d'images au hasard ») |
| Business (logos) | **Clearbit Logo**, **Logoapi** (« Free SVG company logos by domain… No signup ») | Les deux testés |
| Finance | **Financial Modeling Prep**, **Finnhub** | Les deux testés (Finnhub sans clé) |
| Art & Design | Iconify, Icons8, Noun Project… | Inutile : nous avons déjà Lucide |

Recherches complémentaires : documentation Wikimedia (User-Agent, Robot policy, tailles de miniatures, réutilisation de Commons), CGU de chaque service, documentation et tarifs Supabase, ImageScript (GitHub, JSR, deno.land), rapports d'usage sur GitHub.

---

## 2. Tableau des sources testées

Légende du verdict : ✅ retenu · ⚠️ possible sous conditions · ❌ à exclure.

| Source | Appel testé (URL exacte) | Résultat (code HTTP, extrait, heure UTC) | Clé ? | Quota / limites (+ lien) | Licence et attribution | Appel serveur possible ? | Verdict |
|---|---|---|---|---|---|---|---|
| **Wikipédia : résumé REST** | `https://en.wikipedia.org/api/rest_v1/page/summary/Jensen_Huang` (aussi `Bitcoin`, `Real_Madrid_CF`, `Grand_Theft_Auto_VI`, `Carlos_Alcaraz`, `Nvidia`, `Jordan_Bardella`, `Alexandria_Ocasio-Cortez`) | 200 ×8 (12:59:14Z → 12:59:16Z, puis 13:12:28Z). Jensen Huang → Commons `Jensen_Huang_Stanford_2026-04-30_010_(cropped).jpg` (miniature 330×439). Bitcoin → Commons `Bitcoin.svg`. Alcaraz → Commons (photo Laureus 2024). Nvidia → **photo du siège**, pas le logo. **Real_Madrid_CF → `…/wikipedia/en/thumb/5/56/Real_Madrid_CF.svg/…` (local en.wikipedia)**. **GTA VI → `upload.wikimedia.org/wikipedia/en/4/46/Grand_Theft_Auto_VI.png` (local)**. Les miniatures sont servies par `thumb.wikimedia.org` en 330 px. En-têtes : `cache-control: s-maxage=1209600, max-age=300`, `access-control-allow-origin: *`. | Non (User-Agent descriptif requis) | REST non authentifié : 3 requêtes simultanées au plus, moins de 5 req/s ([Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)) | La réponse ne donne pas la licence, il faut l'API Commons. Elle renvoie aussi des images non libres. | Oui | ⚠️ Découverte seulement : ne jamais copier sans contrôle de licence |
| **Wikipédia : PageImages (filtre de licence)** | `https://en.wikipedia.org/w/api.php?action=query&titles=Real_Madrid_CF%7CGrand_Theft_Auto_VI%7CJensen_Huang%7CNvidia%7CCarlos_Alcaraz&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=250&pilicense=free&format=json&formatversion=2` | 200 (13:14:31Z). Avec `pilicense=free` : Real Madrid → **aucune**, GTA VI → **aucune** ; Jensen Huang, Alcaraz et Nvidia → fichiers Commons en 250 px. Même appel avec `pilicense=any` → renvoie `Real_Madrid_CF.svg` et `Grand_Theft_Auto_VI.png` (`/wikipedia/en/`). | Non | API Action non authentifiée : 1 requête à la fois, moins de 5 req/s ([Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)) | Filtre « free » fait par Wikipédia, à confirmer avec Commons | Oui | ✅ Meilleur point d'entrée « page Wikipédia → image libre » |
| **en.wikipedia : imageinfo sur fichiers non libres** | `https://en.wikipedia.org/w/api.php?action=query&titles=File%3AGrand_Theft_Auto_VI.png%7CFile%3AReal_Madrid_CF.svg&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&iiextmetadatafilter=LicenseShortName%7CLicense%7CLicenseUrl%7CUsageTerms%7CAttributionRequired%7CCopyrighted%7CArtist%7CCredit%7CRestrictions%7CNonFree&format=json` | 200 (13:12:17Z). Les deux fichiers : `LicenseShortName=Fair use`, `UsageTerms=Fair use of copyrighted material in the context of …`, `NonFree=true`, URL `/wikipedia/en/…` | Non | Idem API Action | **Non libre** : usage « fair use » propre à Wikipédia | — | ❌ Ces fichiers ne doivent jamais être copiés (règle de rejet automatique) |
| **Wikimedia Commons : imageinfo + extmetadata** | `https://commons.wikimedia.org/w/api.php?action=query&titles=File%3AJensen_Huang_Stanford_2026-04-30_010_%28cropped%29.jpg%7CFile%3ANVIDIA_logo.svg%7CFile%3ABitcoin.svg%7CFile%3ACarlos_Alcaraz_Roland_Garros_2025_%28cropped%29.jpg%7CFile%3AGrand_Theft_Auto_VI_logo.svg%7CFile%3AReal_Madrid_CF.svg&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&iiurlwidth=256&format=json&formatversion=1` | 200 (12:59:44Z). `Bitcoin.svg` : Public domain, `AttributionRequired=false`, `Restrictions=trademarked`. `NVIDIA_logo.svg` : **Apache License 2.0, attribution requise**, Artist=Nvidia, trademarked, 656×120 (très horizontal). `Grand_Theft_Auto_VI_logo.svg` : Public domain, trademarked, Artist=Rockstar Games. Photo Jensen Huang : **CC BY-SA 4.0**, Anderseidesvik, `Restrictions=personality`. Photo Alcaraz (Roland-Garros 2025) : CC BY-SA 4.0, « Like tears in rain derivative work: Kacir ». `Real_Madrid_CF.svg` : **absent de Commons**. `iiurlwidth=256` → `thumburl` en **330px** (arrondi), `thumbwidth=256`. Autres appels : logos à 13:06:01Z (Lakers PD, `Microsoft icon.svg` PD, `Apple logo black.svg` PD, `CelticsWordmark.svg` PD, tous trademarked ; `Football Club Barcelona Color Update.png` **CC0 « Own work » d'un contributeur → licence douteuse, revue manuelle**) ; candidats à 13:12:35Z (AOC : PD, U.S. House Office of Photography, personality ; Bardella : licence « European Parliament », attribution requise, Artist=European Union) ; drapeaux France et Brésil à 13:19:15Z (PD, `Restrictions=insignia`). | Non | API Action : 1 requête à la fois, moins de 5 req/s ; plusieurs titres groupés par appel (6 testés) ([Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)) | Champs utiles : `LicenseShortName`, `LicenseUrl`, `Artist`, `Credit`, `AttributionRequired`, `UsageTerms`, `Restrictions`, `NonFree`, `descriptionurl` | Oui | ✅ **Source de vérité de la licence** (obligatoire avant toute copie) |
| **Miniatures Wikimedia** | `https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/Bitcoin.svg/120px-Bitcoin.svg.png` puis `…/128px-Bitcoin.svg.png` ; mêmes chemins sur `upload.wikimedia.org` | 120 px → 200, PNG 120×120, 4 921 o (12:59:59Z), sur les deux hôtes. **128 px → 400** « Error: 400, Use thumbnail sizes listed on https://w.wiki/GHai » (12:59:59Z), sur les deux hôtes. `w.wiki/GHai` → 301 vers [Common thumbnail sizes](https://www.mediawiki.org/wiki/Common_thumbnail_sizes). Fichiers téléchargés sans les paramètres `utm_…` ajoutés par l'API : 200. | Non | Médias : 2 connexions simultanées au plus, 25 Mbit/s au plus, « prefer thumbnails » ([Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)) ; tailles standard : 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840 | Celle du fichier | Oui | ✅ Utiliser le `thumburl` renvoyé par l'API (120 ou 250 px), jamais une largeur « maison » |
| **Wikidata : wbgetentities** | `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q305177%7CQ182477%7CQ8682%7CQ131723%7CQ85518537%7CQ23648408&props=labels%7Cclaims&languages=en&format=json` | 200 (12:59:30Z, 963 674 o, réponse lourde). Jensen Huang **P18** = `Jensen Huang Stanford 2026-04-30 010 (cropped).jpg`. Nvidia **P154** = `NVIDIA logo.svg` (son P18 est le siège). Real Madrid : **pas de P154**, P41 = `Bianco viola RMA.png`, P18 = façade, P6364 (couleur officielle) = Q23444, Q3257809. Bitcoin **P154** = `Bitcoin.svg` (rang « preferred ») et `Bitcoin logo.svg`. Alcaraz **P18** = `Carlos Alcaraz Roland Garros 2025 (cropped).jpg`. GTA VI **P154** = `Grand Theft Auto VI logo.svg`. Libellés vérifiés (13:17:06Z) : P8972 = « small logo or icon… rendered at sizes as small as 16×16 pixels ». | Non (lecture sans OAuth) | API Action : 1 requête à la fois, moins de 5 req/s | Wikidata ne fait que pointer vers un fichier Commons, dont la licence est à vérifier | Oui | ✅ Lien entité → fichier (P18 personnes, P154 logo, P8972 petit logo ou icône, P41 drapeau) |
| **Wikidata : SPARQL** | `https://query.wikidata.org/sparql?query=SELECT+%3Fitem+%3FitemLabel+%3Flogo+%3Ficon+WHERE+%7B+VALUES+%3Fitem+%7B+wd%3AQ7156+wd%3AQ131371+wd%3AQ121783+wd%3AQ483020+wd%3AQ50602+wd%3AQ8682+wd%3AQ182477+wd%3AQ312+wd%3AQ2283+%7D+OPTIONAL+%7B+%3Fitem+wdt%3AP154+%3Flogo+%7D+OPTIONAL+%7B+%3Fitem+wdt%3AP8972+%3Ficon+%7D+SERVICE+wikibase%3Alabel+%7B+bd%3AserviceParam+wikibase%3Alanguage+%22en%22.+%7D+%7D` | 200 (13:05:50Z, 4 106 o). Apple : P154 ×2. Microsoft : P154 + **P8972 `Microsoft icon.svg`**. FC Barcelona : P154 (png douteux, voir ci-dessus). Lakers : P154 ×2. Celtics : wordmark. Nvidia : P154. **Real Madrid, Manchester City, PSG : aucun logo.** | Non | Non mesuré ici (même étiquette Wikimedia) | — | Oui | ✅ Pratique pour traiter un lot ; couverture faible pour les grands clubs européens |
| **CoinGecko : API sans clé + CDN d'images** | `https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false` ; `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&per_page=3&page=1` ; `https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400` (+ `small`, `thumb`) | 200 (13:01:56Z). `image.thumb`, `image.small` et `image.large` pointent vers `coin-images.coingecko.com` ; `/coins/markets` donne `image` en `large`. Images (13:02:04Z → 13:02:17Z) : large = PNG 250×250, 12 242 o ; small = 50×50, 2 514 o ; thumb = 25×25, 1 269 o. En-têtes : `Cache-Control: max-age=30`, Cloudflare. | Non (« keyless ») ; clé Demo gratuite possible (non créée) | Sans clé : « IP-based rate limiting — shared across all users on the same IP » ([rate limit](https://docs.coingecko.com/docs/common-errors-rate-limit)) ; Demo : 100 appels/min, 10 000 par mois, « Attribution required » ([tarifs](https://www.coingecko.com/en/api/pricing)) | [CGU API](https://www.coingecko.com/en/api_terms) (version du 5 sept. 2025) : §4.3 « Powered by CoinGecko » ; §6.1 « We do not encourage caching or storage of Data », rafraîchir « at least every 24 hours » ; §6.2 pas de copie ni de stockage au-delà. Les logos des projets ne sont pas traités explicitement. | Oui. Risque d'après le texte : l'IP sortante des Edge Functions est probablement partagée (**non vérifié**), donc une clé Demo est plus sûre | ⚠️ Repli crypto, avec mention et rafraîchissement ; zone grise pour la copie dans Storage |
| **spothq/cryptocurrency-icons** | `https://api.github.com/repos/spothq/cryptocurrency-icons` ; `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png` | 200 (13:02:05Z) : licence **CC0-1.0**, non archivé, **dernier push 2024-08-19**, 2 756 étoiles. Icône 128 : 200, PNG 128×128 (palette), 2 589 o (13:02:17Z). Le README annonce environ 500 cryptos, en PNG 32, 32@2x et 128, plus SVG, et une icône `generic`. | Non | GitHub raw (non documenté ici) | CC0 1.0. Le README demande seulement : « All we ask is that you don't claim them as your own, and share this resource with others. » Les marques restent aux projets. | Oui (copie unique, ou paquet npm `cryptocurrency-icons` mentionné dans le README) | ✅ Pour les cryptos couvertes ; ⚠️ plus mis à jour depuis août 2024 |
| **Coinpaprika** | `https://api.coinpaprika.com/v1/coins/btc-bitcoin` | 200 (13:13:45Z), `logo=https://static.coinpaprika.com/coin/btc-bitcoin/logo.png` (HEAD : 200, PNG, 5 334 o) | Non | **Non vérifié** | CGU **non vérifiées** | Oui | ⚠️ Non retenu tant que les CGU ne sont pas lues |
| **ESPN (API du site + CDN)** | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams` ; `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams` ; `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/86.png&w=128&h=128` | 200 (13:03:00Z) : 30 équipes NBA, logos `https://a.espncdn.com/i/teamlogos/nba/500/bos.png` (500×500) et variantes 4096×4096 ; Liga : 20 équipes, Real Madrid `https://a.espncdn.com/i/teamlogos/soccer/500/86.png` (HEAD : 200, 43 601 o). Redimensionneur « combiner » : 200, **PNG 128×128, 11 919 o** (13:03:10Z). | Non (API non documentée) | Non documenté | [Conditions Disney](https://disneytermsofuse.com/english/) (mises à jour le 24 mai 2024, elles nomment ESPN) : §2.A « for your personal, noncommercial use only » et « no right to reproduce, distribute… » ; §2.B(x) interdiction d'« access, monitor, copy or extract … using a robot, spider, script » | Techniquement oui ; contractuellement non | ❌ Ne pas utiliser |
| **football-data.org (API + CDN des écussons)** | `https://api.football-data.org/v4/teams/86` (sans clé) ; `https://api.football-data.org/v4/competitions` ; `https://api.football-data.org/v4/competitions/PD/teams` ; `https://crests.football-data.org/86.png` (+ `.svg`) | `/teams/86` → **403** « restricted… check your subscription » (13:03:21Z), `X-Authenticated-Client: anonymous`, `X-Requests-Available: 48`. `/competitions` → 200 (13:03:36Z), emblèmes du type `https://crests.football-data.org/PL.png` et `…/laliga.png`. `/competitions/PD/teams` → 403. Écusson 86 : **200, PNG 200×200 (palette), 10 954 o** (13:03:37Z) ; SVG : 200, 31 967 o. | Clé gratuite pour `/teams` (non créée) ; le CDN des écussons répond sans clé | Sans authentification : 100 requêtes par 24 h, zones et compétitions seulement ; gratuit : 10 req/min ([policies](https://docs.football-data.org/general/v4/policies.html)) | [CGU](https://www.football-data.org/client/register) (mises à jour le 1er juin 2018) : §7.1 attribution « Football data provided by the Football-Data.org API » ; **§9.2 « All graphics, including team logos and profile photos, are copyrighted by their legal owner. You'll have to obtain consent from the respective owners… »** | Oui | ❌ Pour les écussons sans accord des clubs (la source le dit elle-même) |
| **TheSportsDB (v1)** | `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=Real%20Madrid` ; `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=Carlos%20Alcaraz` ; `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Real%20Madrid` ; `https://r2.thesportsdb.com/images/media/team/badge/vwvwrw1473502969.png/tiny` (+ `/small`) | Clé `123` : 200 (13:03:49Z), `strBadge=https://r2.thesportsdb.com/images/media/team/badge/vwvwrw1473502969.png` ; Alcaraz : 200, `strCutout` et `strThumb`. **Clé `3` → 403** « The old '3' Free Sports API key is permanently disabled, Please use the new test key "123" » (13:03:50Z). Badge `/tiny` → PNG **100×100, 31 410 o** ; `/small` → 200×200, 57 824 o ; original : 164 620 o ; cutout `/small` : 200×200, 22 401 o ; thumb `/tiny` : JPEG 100×100, 4 971 o (13:03:59Z → 13:04:00Z). La documentation annonce `/tiny` = 50 px et `/small` = 250 px, ce qui n'a pas été observé. | Clé de test publique `123` | Gratuit : 30 req/min ([documentation](https://www.thesportsdb.com/documentation)) | [CGU](https://www.thesportsdb.com/docs_terms_of_use.php) : « Most of our artwork is custom and is created by our users » ; « This does not grant permission to use a third-party trademark » ; « A paid API subscription does not grant rights to third-party artwork » ; en gratuit, « lookup data and artwork for your development projects » ; « Use only images for which you can demonstrate the necessary rights » | Oui | ❌ En production (gratuit = développement seulement ; aucun droit sur les logos ; fichiers lourds) |
| **FMP image-stock** | `https://financialmodelingprep.com/image-stock/NVDA.png` | **200 sans clé**, PNG 250×250, 11 180 o (13:06:15Z). La page de documentation s'intitule « Company Logo API - Legacy ». | Non pour cette URL | **Non vérifié** | [ToS](https://site.financialmodelingprep.com/terms-of-service) §2.2.2 : « Without a specific agreement with FMP, customers are prohibited from showcasing FMP Services or Data on platforms including … websites » ; « may not copy or download any content from the Services except with the prior written approval of FMP » | Techniquement oui ; contractuellement non | ❌ |
| **Finnhub profile2** | `https://finnhub.io/api/v1/stock/profile2?symbol=NVDA` (sans clé) | **401** `{"error":"Please use an API key."}` (13:08:20Z). La documentation montre un champ `logo` (« Logo image. ») ; le format de l'URL est **non vérifié**. | **Oui** (non créée) | Le ToS mentionne une limite de 30 appels/s en plus de celle du plan | [ToS](https://finnhub.io/terms-of-service) : « agree to not redistribute or share access to data or derived results … without written approval » ; « strictly for personal use unless explicitly stated otherwise » | Oui avec clé ; contractuellement non | ❌ |
| **logo.dev** | `https://img.logo.dev/nvidia.com` (sans jeton) | **401** `{"msg":"invalid api token…"}` (13:06:17Z) | **Oui** (`pk_` pour les images, `sk_` pour l'API) | **Non vérifié** (non indiqué dans les pages lues) | [Attribution](https://www.logo.dev/docs/platform/attribution.md) : un projet commercial en plan gratuit doit afficher le lien « Logos provided by Logo.dev ». [Fair use](https://www.logo.dev/docs/platform/fair-use.md) : le hotlink est le modèle prévu ; « A server that fetches img.logo.dev images and passes them on to your users » n'est pas du fair use ; pour stocker, passer par l'API (plan **non vérifié**) | Non pour notre modèle (copie dans Storage) | ❌ |
| **Brandfetch Logo API** | Non appelé (client ID obligatoire) | — | **Oui** (client ID) | 1 000 000 requêtes/mois en fair use ([guidelines](https://docs.brandfetch.com/logo-api/guidelines.md)) | « Logo API images must be hotlinked rather than stored » ; « Programmatic access to logo images is not permitted » ; aucune attribution requise | **Non** | ❌ Incompatible avec la copie dans Storage |
| **Clearbit Logo** | `https://logo.clearbit.com/nvidia.com` | **Échec DNS** « Could not resolve host: logo.clearbit.com » (13:06:17Z). `nslookup` : le nom n'a aucune adresse, alors que `clearbit.com` résout. | — | — | Annonce HubSpot : « As of December 1, 2025, we will sunset the public Clearbit Logo API » ([post](https://community.hubspot.com/t/clearbit-logo-api-will-be-sunset-on-december-1-2025/134244)) | — | ❌ Service arrêté |
| **logoapi.sh** | `https://logoapi.sh/nvidia.com.svg` | 200, SVG de 2 786 o (13:09:01Z), viewBox 2074×398 (horizontal), sans `<script>` | Non | « 2M requests a month per site » ([docs](https://logoapi.sh/docs)) | [Terms](https://logoapi.sh/terms) : « You may use and cache our logos in your app or site » ; « No attribution required » ; sources : gilbarbara/logos (CC0) et simple-icons (CC0) ; logos « exclusive property of their respective owners », « for informational and educational purposes only » ; pas de date de mise à jour | Oui | ⚠️ Repli possible pour les entreprises (provenance de chaque logo inconnue) |
| **Simple Icons** | `https://api.github.com/repos/simple-icons/simple-icons` ; `https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/nvidia.svg` | 200 (13:16:09Z) : dépôt CC0-1.0, actif (push du 2026-11-19), 26 238 étoiles ; `nvidia.svg` : 881 o, viewBox 24×24 (symbole carré monochrome) | Non | — | [DISCLAIMER](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) : « Simple Icons is released under CC0 - though that doesn't mean to imply that all icons within the project are also CC0 » ; « We ask that our users seek the correct permissions » | Oui | ⚠️ Symboles carrés pratiques ; licence à vérifier icône par icône |
| **Lucide** (déjà dans le projet) | `https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE` | 200 (13:13:19Z) : « ISC License », une partie dérivée de Feather | Non | — | ISC : garder la notice de licence dans le code | — | ✅ Icônes de catégorie |
| **Sites officiels** (exemple : NVIDIA) | Page lue : `https://www.nvidia.com/en-us/about-nvidia/legal-info/logo-brand-usage/` | Les éléments de marque « may not be used in any manner that isn't expressly authorized in writing by NVIDIA » ; « Do not distort or modify the logo » ; « Do not use artwork from third -party websites that contains NVIDIA branding and imagery … This includes editorial imagery. » | — | — | Autorisation écrite exigée (pour cette marque) | — | ❌ Par défaut ; seulement si la charte d'une marque autorise explicitement l'usage |

### 2.1 Images téléchargées (tailles réelles)

Dossier : `(notes de travail, hors dépôt) d1\images-test\` (rien n'y a été exécuté ; les SVG sont enregistrés en `.svg.txt`).

| Fichier | Source | Format et dimensions | Taille |
|---|---|---|---|
| `btc-thumbhost-120.png` | Commons `Bitcoin.svg` 120 px (thumb.wikimedia.org) | PNG RGBA 120×120 | 4 921 o |
| `wm-jensen-120.jpg` | Commons, photo de Jensen Huang, 120 px | JPEG 120×160 (EXIF avec description) | 6 991 o |
| `wm-jensen-250.jpg` | Même fichier, 250 px | JPEG 250×333 | 23 255 o |
| `wm-alcaraz-120.jpg` | Commons, photo d'Alcaraz (Roland-Garros 2025), 120 px | JPEG 120×178 | 8 639 o |
| `wm-nvidia-logo-250.png` | Commons `NVIDIA_logo.svg`, 250 px | PNG RGBA 250×46 (horizontal) | 4 440 o |
| `wm-gta6-logo-120.png` | Commons `Grand_Theft_Auto_VI_logo.svg`, 120 px | PNG RGBA 120×94 | 9 039 o |
| `spothq-btc-128.png` | spothq 128/color | PNG palette 128×128 | 2 589 o |
| `cg-btc-large.png` / `cg-btc-small.png` / `cg-btc-thumb.png` | CoinGecko | PNG 250×250 / 50×50 / 25×25 | 12 242 / 2 514 / 1 269 o |
| `espn-rma-combiner-128.png` | Redimensionneur ESPN (test technique seulement) | PNG RGBA 128×128 | 11 919 o |
| `fd-crest-86.png` | football-data.org (test technique seulement) | PNG palette 200×200 | 10 954 o |
| `tsdb-rma-badge-tiny.png` / `tsdb-rma-badge-small.png` | TheSportsDB | PNG RGBA 100×100 / 200×200 | 31 410 / 57 824 o |
| `tsdb-alcaraz-cutout-small.png` / `tsdb-alcaraz-thumb-tiny.jpg` | TheSportsDB | PNG 200×200 / JPEG 100×100 | 22 401 / 4 971 o |
| `fmp-NVDA.png` | FMP (test technique seulement) | PNG RGBA 250×250 | 11 180 o |
| `logoapi-nvidia.svg.txt` / `simpleicons-nvidia.svg.txt` | logoapi.sh / Simple Icons | SVG | 2 786 / 881 o |
| `btc-*-128.bin` | Les deux tests en 128 px (non standard) | Page d'erreur HTML (400) | 3 267 o |

À retenir : un PNG ou un JPEG de 120–128 px pèse **5 à 12 ko** quand il est bien encodé. Les fichiers TheSportsDB (non optimisés) dépassent 30 ko pour 100 px.

---

## 3. Par type d'image : chaîne de sources recommandée

L'ordre demandé (1. Wikipédia et Commons, 2. images des API de données, 3. sites officiels) est respecté. Mais les CGU lues bloquent presque toujours les étapes 2 et 3. **En pratique : Commons quand c'est libre, sinon le repli** (initiale sur gris, ou icône Lucide). Deux jeux d'icônes libres (spothq pour les cryptos, Simple Icons pour les marques) peuvent servir d'étape intermédiaire. Ils ne sont ni des API de données ni des sites officiels : c'est un choix à valider par l'équipe.

Règle commune à toutes les étapes Wikimedia :
Wikidata (QID) → propriété → fichier → **API Commons (`extmetadata`)** → licence acceptée ? → `thumburl` en 250 px (ou 120 px).

**Crypto (logo de la crypto)**
1. Wikidata **P8972** (petit logo ou icône) si présent, sinon **P154** → Commons. Exemple : `Bitcoin.svg`, domaine public, attribution non requise, `trademarked`.
2. **spothq/cryptocurrency-icons** (CC0, PNG 128×128 ou SVG) si la crypto y figure (environ 500 cryptos, plus mis à jour depuis 2024-08).
3. **CoinGecko** `image.large` (250 px), en réutilisant l'appel déjà fait pour les cours. Conditions : mention « Powered by CoinGecko », re-téléchargement périodique (CGU §6.1), copie dans Storage en zone grise.
4. Repli : initiale ou ticker sur gris neutre.

**Entreprise (action)**
1. Wikidata **P8972**, puis **P154** → Commons. Exemples : `Microsoft icon.svg` (PD, carré 512×512) ; `Apple logo black.svg` (PD) ; `NVIDIA logo.svg` (Apache 2.0, attribution requise, logotype horizontal 656×120, illisible une fois réduit dans un carré).
2. Les API de données sont exclues : FMP et Finnhub par leurs CGU, logo.dev et Brandfetch par le hotlink obligatoire, Clearbit est mort. Options à valider : **Simple Icons** (symbole carré monochrome, licence à vérifier par icône) ou **logoapi.sh** (cache autorisé, sans attribution, provenance inconnue).
3. Site officiel : seulement si la charte l'autorise explicitement (NVIDIA : non, sans accord écrit).
4. Repli : ticker ou initiale sur gris.

**Équipe (football, NBA)**
1. Wikidata **P154** → Commons. Disponible pour une partie des franchises NBA : `Los Angeles Lakers logo.svg` PD, `CelticsWordmark.svg` PD (logotype). **Absent** pour le Real Madrid, Manchester City et le PSG. Cas douteux à revoir à la main : `Football Club Barcelona Color Update.png`, marqué « CC0 Own work » par un contributeur.
2. **Équipes nationales** : drapeau du pays (Wikidata P41 du pays, Commons, domaine public, restriction `insignia`).
3. Images des API : écussons football-data.org techniquement parfaits (PNG 200×200 d'environ 11 ko, SVG), mais **§9.2 de leurs CGU : accord des propriétaires requis**. À ne pas utiliser sans décision explicite et assumée. ESPN et TheSportsDB sont exclus.
4. Site officiel du club : non (marque et droit d'auteur).
5. Repli : initiales du club (« RM ») sur gris. Option : teinter le cercle avec la couleur officielle Wikidata P6364 (présente pour le Real Madrid ; libellés non résolus, **non vérifié**).

**Joueur de tennis**
1. Wikidata **P18** → Commons. Exemple : Alcaraz, CC BY-SA 4.0. Autre accès : PageImages `pilicense=free` sur la page Wikipédia, qui renvoie la photo Laureus 2024.
2. API : les cutouts et thumbs TheSportsDB sont réservés au développement, ESPN est exclu. Rien d'utilisable en production.
3. Sites ATP et WTA : **non vérifié** (aucune licence lue). Exclus par défaut.
4. Repli : initiales.

**Personne (PDG, candidat à un poste, par exemple « prochain PDG de Nvidia »)**
1. Wikidata **P18** → Commons. Exemple : Jensen Huang, CC BY-SA 4.0, `Restrictions=personality`.
2. Si `Restrictions` contient `personality` : affichage informatif seulement, rien qui suggère un soutien. La page de réutilisation de Commons cite « commercial use of images of people may require the explicit agreement of the subject ».
3. Repli : initiales (fréquent pour les dirigeants moins connus).

**Jeu vidéo ou film (ex. GTA VI)**
1. Wikidata **P154** → Commons. Exemple : `Grand Theft Auto VI logo.svg`, domaine public, `trademarked`, auteur Rockstar Games : **utilisable**.
2. Jaquettes et affiches : fichiers locaux d'en.wikipedia en « Fair use » (exemple : `Grand_Theft_Auto_VI.png`, `NonFree=true`). **Interdits.**
3. Visuels de l'éditeur : **non vérifié** pour Rockstar. Exclus par défaut, comme pour NVIDIA.
4. Repli : icône Lucide de la catégorie.

**Élection (une photo par candidat)**
1. Wikidata **P18** → Commons. Les portraits officiels sont souvent libres : AOC (domaine public, U.S. House Office of Photography, personality) ; Bardella (licence « European Parliament », attribution requise, auteur « European Union »).
2. Suggestion de neutralité : si un candidat n'a pas de photo libre, utiliser les initiales pour **tous** les candidats du marché.
3. Sites de campagne : **non vérifié**, exclus par défaut.

**Icône de catégorie (sujet sans image évidente)**
- Lucide (ISC), rendue côté front en SVG intégré. Aucun fichier dans Storage, aucun crédit visible nécessaire (notice ISC dans le code).

---

## 4. Taille, format et traitement

### 4.1 Supabase Storage, plan gratuit
- **Transformations d'images non incluses.** La [page tarifs](https://supabase.com/pricing) indique « Image transformations: Not included » pour le plan gratuit. La [documentation](https://supabase.com/docs/guides/storage/serving/image-transformations) dit « Image Resizing is currently enabled for Pro Plan and above ». En Pro : 100 images d'origine incluses, puis 5 $ pour 1 000.
- Plan gratuit : 1 Go de stockage, 50 Mo par fichier au plus, 5 Go d'egress plus 5 Go d'egress en cache, 500 000 invocations d'Edge Functions. « Free projects are paused after 1 week of inactivity. »
- Bucket **public** conseillé. La documentation CDN dit que les objets d'un bucket public sont mieux mis en cache : « better cache hit rate compared to private buckets » ([CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals)).
- Ordre de grandeur (calcul, pas une mesure) : à 10 ko par image, 1 Go représente environ 100 000 images, et 5 Go d'egress représentent environ 500 000 affichages non mis en cache.

### 4.2 Contraintes Wikimedia
- **Tailles standard seulement** : 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840 ([Common thumbnail sizes](https://www.mediawiki.org/wiki/Common_thumbnail_sizes)). Les demandes directes non standard sont rejetées : 400 observé à 12:59:59Z (la page cite aussi un 429). L'API `imageinfo` arrondit à la taille supérieure : `iiurlwidth=256` donne une URL en 330 px.
- Le résumé REST donne pour les SVG un `originalimage` qui est une miniature PNG de 120 px, avec les dimensions d'origine (64×64 pour Bitcoin). Pour une photo de 4914 px, il donne la miniature de 3840 px.
- **User-Agent** ([politique](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)) : format « `<client name>/<version> (<contact information>) <library/framework name>/<version>` ». Le contact peut être un e-mail, un site web ou un utilisateur wiki. Un UA absent ou générique (curl, python-requests…) peut recevoir un **403**. Ne pas imiter un navigateur. Côté navigateur, utiliser l'en-tête `Api-User-Agent`. Notre UA `WimoroImages/1.0 (https://wimoro.com)` respecte ce format. Il faut que le site donne un moyen de contacter l'exploitant (**non vérifié**).
- **Débits** ([Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)) : API Action 1 requête à la fois et moins de 5 req/s ; REST 3 requêtes à la fois et moins de 5 req/s ; médias 2 connexions au plus et 25 Mbit/s au plus. Sur un 429, respecter `Retry-After`. Envoyer `Accept-Encoding: gzip` pour les API.

### 4.3 Limites des Edge Functions
D'après [limits](https://supabase.com/docs/guides/functions/limits) :
- 256 Mo de mémoire, **2 s de CPU par requête**, 150 s de durée totale en gratuit ;
- paquet de 20 Mo (CLI) ou 5 Mo (dashboard) ;
- « `libvips` and `sharp` » non pris en charge, pas de Web Workers.

L'[exemple officiel](https://supabase.com/docs/guides/functions/examples/image-manipulation) précise : « Only WASM-based libraries are supported » et « handle large images (> 5MB) your function may return a resource limit exceeded error ».
Imports acceptés : `npm:`, `jsr:`, `node:`, deno.land/x ([dependencies](https://supabase.com/docs/guides/functions/dependencies)).
**Conséquence** : ne jamais décoder les variantes ESPN de 4096 px ou des originaux Commons de plusieurs Mo. Toujours partir d'une miniature de 250 px au plus, et traiter une image par appel.

### 4.4 Bibliothèques de redimensionnement

| Bibliothèque | Version (date) | Licence | Formats | Sur Supabase Edge | Remarques |
|---|---|---|---|---|---|
| **ImageScript 1.3.0** `https://deno.land/x/imagescript@1.3.0/mod.ts` | 1.3.0 | AGPL-3.0-or-later **OR MIT** (choisir MIT) | Décode PNG, JPEG, TIFF, GIF ; rendu SVG ; encode PNG, JPEG, GIF (README 1.3.0). Modules WASM internes (`utils/wasm/png.js`, `jpeg.js`…). **Pas de WebP.** | ✅ **Deux rapports publics**. PR fusionnée le 2026-10-31 ([closetiq-studio#6](https://github.com/tryclosetiq/closetiq-studio/pull/6)) : « `npm:imagescript@1.3.0` crashes in Supabase's edge runtime with `unsupported arch/platform` », passage à deno.land/x. PR fusionnée le 2026-11-13 ([kiez-coins-app#373](https://github.com/amyria3/kiez-coins-app/pull/373)) : même correction, fonction « Live als v9 ». | Utiliser l'URL deno.land/x, **pas** `npm:imagescript` |
| **ImageScript 3.20.4** `jsr:@matmen/imagescript@3.20.4` | v3.20.4 publiée le 2026-11-18 (v4.0.0-rc.5 le 2026-11-15) ; dépôt déplacé vers `imagescript/ImageScript`, très actif | MIT sur JSR ; AGPL-3.0-or-later OR MIT dans le dépôt | « pure TypeScript: no WebAssembly, no native binaries, no dependencies ». PNG, JPEG, **WebP**, AVIF et JPEG XL en lecture et écriture ; rendu SVG. JSR : compatible Deno, Cloudflare Workers, Node, Bun, navigateurs ; score 100 %. | **Non vérifié** sur Supabase (aucun rapport trouvé, impossible à déployer sans compte) | Paquet npm de 2,56 Mo ; multithread seulement si des workers existent (absents sur Supabase) |
| **magick-wasm** `npm:@imagemagick/magick-wasm@^0` | 0.0.46 (npm modifié le 2026-11-03) | Apache-2.0 | ImageMagick, « over 100 major file formats » (WebP **non vérifié** précisément) | ✅ C'est l'exemple officiel Supabase (redimensionnement et flou, sortie PNG) | Lourd : 32,5 Mo une fois décompressé, chargement du `.wasm` au démarrage |

### 4.5 Options comparées

| Option | Pour | Contre |
|---|---|---|
| A. Copier la miniature Wikimedia (120 ou 250 px) telle quelle, carré fait en CSS (`object-fit`) | Aucun code image, aucun coût CPU | Proportions variables ; sources non Wikimedia hétérogènes (CoinGecko 250 px, spothq 128 px) ; poids variable (23 ko en 250 px) |
| **B. Edge Function d'ingestion + ImageScript** (recommandé) | Automatique à la création d'un marché ou d'une option ; même format partout ; tout reste dans Supabase | Limite de 2 s de CPU (source ≤ 250 px nécessaire) ; v1.3.0 sans WebP |
| C. Script local ponctuel (Deno ou Node + ImageScript, ou sharp en local) puis envoi dans Storage | Aucune limite CPU ; idéal pour un premier lot | Dépend d'un poste de développeur ; pas automatique |

**Recommandation : B**, avec le même code lançable en local avec Deno pour les rattrapages (C).
- **Taille cible : 128×128 px.** Une seule taille sert le carré du marché (jusqu'à 64 px CSS en écran 2×) et le petit cercle des options.
- **Format** : **PNG** pour les logos et icônes (transparence), **JPEG qualité ≈ 80** pour les photos, avec ImageScript 1.3.0. Passer au WebP si ImageScript 3.20.4 est validé par un déploiement de test.
- **Poids cible : moins de 15 ko.** Mesures proches : 4,9 à 9,0 ko (PNG et JPEG Commons de 120 px), 11,9 ko (PNG de 128 px). La valeur à 128×128 après réencodage est une **estimation non mesurée** : environ 6 à 12 ko.

### 4.6 Pipeline recommandé (pas à pas)
1. **Résoudre l'entité** : titre de page ou QID → Wikidata. Ordre des propriétés : P8972, puis P154 pour les logos ; P18 pour les personnes ; P41 du pays pour une équipe nationale. Pour les cryptos sans P154 : spothq, puis CoinGecko.
2. **Vérifier la licence** avec Commons `imageinfo` et `extmetadata`, en regroupant les titres. Rejeter si `NonFree=true`, si `LicenseShortName` vaut « Fair use », ou si l'URL n'est pas sous `/wikipedia/commons/` (voir 5.2).
3. **Télécharger** le `thumburl` renvoyé pour `iiurlwidth=250`, avec l'UA Wikimedia, 2 connexions au plus et des appels API en série.
4. **Transformer** :
   - photos : recadrage carré décalé vers le haut (visage), puis 128×128 ;
   - logos : mise à l'échelle **sans déformation** dans 112×112, centrée sur un fond transparent de 128×128 ;
   - ne jamais recolorer ni retoucher un logo (les chartes de marque l'interdisent, voir NVIDIA).
5. **Encoder** : PNG pour les logos, JPEG q≈80 pour les photos (WebP plus tard si la v3 est validée). Rejeter et journaliser tout fichier de plus de 15 ko.
6. **Envoyer dans Storage** : bucket public `images`, chemin par entité et empreinte (exemple : `entities/Q305177-<sha8>.jpg`), `contentType` explicite, `cacheControl` long (l'exemple de la doc montre `'3600'` ; viser par exemple `'31536000'`). Nouveau chemin à chaque changement plutôt que d'écraser (invalidation du CDN **non vérifiée**). Une entité (club, coin, personne) partagée par plusieurs marchés = un seul fichier.
7. **Enregistrer les métadonnées et les crédits** (voir 5.1), puis relier le marché ou l'option à l'image.
8. **Rythme** : une image par invocation ; file d'attente « en attente » traitée petit à petit ; mettre en cache les réponses Wikidata et Commons.

### 4.7 Affichage côté front
- `<img loading="lazy" decoding="async" width="…" height="…">` avec des dimensions explicites (pas de décalage de mise en page).
- `border-radius` pour le carré arrondi, `50%` pour le cercle des options. `object-fit: cover` pour les photos, `contain` pour les logos.
- S'il n'y a pas d'image ou en cas d'erreur (`onerror`) : initiale sur gris neutre. Catégorie sans image : icône Lucide.

### 4.8 Sécurité
- **SSRF** : liste blanche d'hôtes pour l'ingestion (`commons.wikimedia.org`, `www.wikidata.org`, `thumb.wikimedia.org`, `upload.wikimedia.org`, `raw.githubusercontent.com` pour spothq, `coin-images.coingecko.com`). Taille maximale téléchargée (par exemple 2 Mo). Contrôle du type et des octets magiques.
- **Toujours réencoder** (décoder puis encoder) : cela retire les charges utiles cachées. L'EXIF est présent dans les JPEG Commons ; sa suppression par ImageScript est **non vérifiée**.
- **Ne jamais servir un SVG tiers depuis Storage** (il peut contenir du script) : le rastériser en PNG.
- Fonction réservée à l'admin (`verify_jwt` et rôle). La clé `service_role` reste côté serveur.

---

## 5. Crédits et licences

### 5.1 Ce qu'il faut stocker par image

| Champ | Exemple (photo de Jensen Huang) | Origine |
|---|---|---|
| `storage_path`, `width`, `height`, `bytes`, `format`, `sha256` | `entities/Q305177-ab12cd34.jpg`, 128, 128, … | Pipeline |
| `entity_kind`, `wikidata_qid`, `wikidata_property` | person, Q305177, P18 | Wikidata |
| `source_kind` | commons \| spothq \| coingecko \| lucide \| fallback | Pipeline |
| `source_file_title` | `File:Jensen Huang Stanford 2026-04-30 010 (cropped).jpg` | Commons |
| `source_page_url` | `https://commons.wikimedia.org/wiki/File:Jensen_Huang_Stanford_2026-04-30_010_(cropped).jpg` | `descriptionurl` |
| `source_file_url` | URL de la miniature réellement téléchargée | `thumburl` |
| `author_text` (et `author_html` brut) | Anderseidesvik | `Artist` (HTML à nettoyer) |
| `credit_text` | Own work | `Credit` |
| `license_short`, `license_url` | CC BY-SA 4.0, `https://creativecommons.org/licenses/by-sa/4.0` | `LicenseShortName`, `LicenseUrl` |
| `attribution_required` | true | `AttributionRequired` |
| `restrictions` | personality (ou trademarked, insignia) | `Restrictions` |
| `modifications` | « recadrée et redimensionnée en 128×128 » | Pipeline |
| `credit_line` (pré-formatée) | « Jensen Huang, Anderseidesvik, Wikimedia Commons, CC BY-SA 4.0, recadrée » | Calculé |
| `retrieved_at`, `needs_review`, `reviewed_by` | 2026-11-19T13:01:22Z, false, — | Pipeline |

### 5.2 Règles d'acceptation automatique
- **Accepter** : `LicenseShortName` parmi Public domain, CC0, CC BY x.x, CC BY-SA x.x (licences observées aujourd'hui), avec `NonFree` vide et une URL sous `/wikipedia/commons/`.
- **Revue manuelle** (`needs_review=true`) :
  - licences propres à une institution (« European Parliament ») ou logicielles (« Apache License 2.0 »), à accepter avec attribution ;
  - logos de grands clubs marqués « Own work » ou CC0 par un contributeur.
- **Rejeter** : `NonFree=true` ; « Fair use » ; fichier local d'une Wikipédia (`/wikipedia/en/…`) ; tout fichier sans `extmetadata`.

### 5.3 Affichage des crédits
- Commons demande de créditer l'auteur réel, d'indiquer la licence et de mettre le lien vers la licence quand elle l'exige. Pour le domaine public, « attribution is recommended to give correct provenance » ([Reusing content](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)).
- CC BY-SA 4.0 : « give appropriate credit, provide a link to the license, and indicate if changes were made ». En ShareAlike, l'image dérivée doit être diffusée sous la même licence. Rien ne doit suggérer un soutien du concédant ([acte CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.en)).
- Creative Commons recommande le format **TASL** (Title, Author, Source, License). L'attribution peut se faire « in any reasonable manner » et l'organisme suggère de publier une page web de crédits ([bonnes pratiques](https://wiki.creativecommons.org/Recommended_practices_for_attribution)).
- **Mise en œuvre proposée** :
  - une page « Crédits images » qui liste chaque image (titre, auteur, lien source, licence avec lien, modifications) ;
  - sur la carte du marché, un petit lien « © » ou une infobulle (`title`) vers l'entrée correspondante ;
  - en pied de page : « Les logos et marques appartiennent à leurs propriétaires et servent uniquement à identifier l'entité ; aucune affiliation. »

### 5.4 Mentions par source (si la source est utilisée)
- CoinGecko : « Powered by CoinGecko », police d'au moins 10 (CGU §4.3).
- football-data.org, pour les **données** : « Football data provided by the Football-Data.org API » (CGU §7.1).
- spothq : aucune mention obligatoire (CC0). Il faut seulement ne pas présenter les icônes comme les nôtres.
- Lucide : notice ISC dans le code source.

### 5.5 Ce qui est interdit
- Les fichiers **non libres d'en.wikipedia** (« Fair use », `NonFree=true`) : écussons de clubs, jaquettes, affiches.
- Les logos d'**ESPN** (conditions Disney), de **FMP** (§2.2.2), de **Finnhub** (pas de redistribution), de **TheSportsDB** en production (gratuit = développement ; aucun droit sur les marques) ; les **écussons football-data.org** sans accord des clubs (§9.2).
- La copie dans Storage d'images **logo.dev** ou **Brandfetch** : ces services imposent le hotlink.
- Les **kits presse, visuels éditoriaux et logos de sites officiels** sans autorisation écrite. NVIDIA, par exemple, exclut aussi l'« editorial imagery » des sites tiers.
- La modification d'un logo (déformation, recoloration, effets).
- Toute image issue d'une recherche (Google Images, banques de photos).
- Une licence de droit d'auteur libre **ne donne pas** de droit sur la marque (`trademarked`) ni sur l'image de la personne (`personality`). Évaluation juridique **non vérifiée** : à faire valider si le site devient commercial.

---

## 6. Non vérifié ou à valider
- ImageScript 3.20.4 (JSR) dans le runtime Supabase, temps CPU réel et poids WebP : aucun déploiement de test possible sans compte.
- Temps CPU d'ImageScript 1.3.0 pour une source de 250 px : non mesuré, probablement très inférieur à 2 s (estimation).
- Valeur par défaut de `cacheControl` et invalidation du CDN Supabase lors d'un écrasement.
- Format de l'URL `logo` de Finnhub, offre d'API de logo.dev en plan gratuit, CGU de Coinpaprika, sites ATP, WTA, Rockstar et sites de campagne.
- Existence d'une page de contact sur wimoro.com (la politique User-Agent attend un contact joignable).
- Toutes les appréciations juridiques (marques, droit à l'image, usage commercial).

---

## 7. Fichiers produits
- Rapport : `(notes de travail, hors dépôt) d1\images.md`
- Scripts :
  - `(notes de travail, hors dépôt) d1\scripts-images\fetch.sh` (appel, puis journal du code HTTP, du type, de la taille et de l'heure UTC)
  - `(notes de travail, hors dépôt) d1\scripts-images\summary.js` (extraction des champs JSON)
- Réponses brutes et journal de tous les appels :
  - `(notes de travail, hors dépôt) d1\dl-images\` (rien n'y a été exécuté)
  - `(notes de travail, hors dépôt) d1\dl-images\_log.tsv`
- Images de test : `(notes de travail, hors dépôt) d1\images-test\`
