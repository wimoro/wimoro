# Wimoro : données « actions & indices » gratuites (étude du jeudi 19/11/2026)

Périmètre : cotations d'une dizaine d'actions (AAPL, NVDA, MSFT, TSLA, AMZN, GOOGL, META, MC.PA, ASML.AS, TTE.PA) et des indices S&P 500, Nasdaq 100 / Composite, Dow Jones, CAC 40, DAX, Nikkei 225 ; clôture officielle pour résoudre les marchés ; statut ouvert/fermé et jours fériés (NYSE/Nasdaq, Euronext Paris, Xetra, Tokyo) ; logos.

Conventions :
- Toutes les heures sont en **UTC**. Les appels ont été faits le 19/11/2026 entre 12:57 et 13:35 UTC depuis un poste Windows (IP résidentielle) avec curl 8.23 (Schannel) et `fetch` de Node 26. À 13:00 UTC, l'Europe était ouverte et Wall Street fermé (pré-marché), ce qui a permis de voir les deux états.
- **Aucune clé réelle** n'a été utilisée, aucun compte créé. Seules les clés publiques `demo` que les docs d'Alpha Vantage, Twelve Data et EODHD utilisent dans leurs exemples ont servi.
- Les réponses brutes sont dans `(notes de travail, hors dépôt) d1\dl-bourse\` (fichiers `<label>.body` et `<label>.hdr`). Les scripts sont dans `(notes de travail, hors dépôt) d1\scripts-bourse\`.
- « non vérifié » = je n'ai ni fait l'appel ni lu la page qui le prouve.

---

## 0. En bref

1. **Aucune API gratuite testée n'accorde le droit d'afficher les cours au public.** Les licences gratuites sont « personnelles », « internes » ou « non-display » (Finnhub, Alpha Vantage, Twelve Data, FMP, Massive, Tiingo, EODHD, StockData). Yahoo interdit en plus la collecte automatisée. Pour une maquette à argent fictif, c'est un risque à assumer en connaissance de cause : voir §5.1.
2. **Une seule source gratuite couvre tout en un seul appel** (actions US + actions EU + indices US/EU/JP) : l'API non officielle Yahoo `v8/finance/spark`, sans clé ni cookie. Elle répond avec l'User-Agent de `fetch` (Node, ou un UA « Deno/… »), mais renvoie 429 avec l'UA de curl.
3. **Stooq n'est plus utilisable** : l'URL CSV `q/l` renvoie 404, l'export `q/d/l` passe par un défi JavaScript, et une clé est exigée depuis mars 2026.
4. **Seules les actions US ont des API officielles gratuites en temps réel** : Finnhub `/quote` (60 appels/min) et Twelve Data Basic (8 crédits/min, « non-display »). Pour les indices et l'Europe, aucune API officielle gratuite ne donne de cours en séance : Alpha Vantage, Massive et Marketstack ne fournissent que la fin de journée, EODHD un différé de 15 min limité à 20 appels/jour.
5. **Délais Yahoo** (d'après la page d'aide Yahoo ; mesures : Euronext 15 min 10 s, AAPL en pré-marché US 13 s) : actions Nasdaq et indices S&P/Dow/Nasdaq en **temps réel** ; Euronext et Xetra **15 min** (mesuré : 15 min 10 s) ; Tokyo 20 min, indices Nikkei 30 min. **Les paris flash de 45 s ne doivent porter que sur des symboles en temps réel**, voir §3.5.
6. **Statut d'ouverture** : la source primaire doit être notre propre table de calendrier dans Postgres, remplie depuis les pages officielles (NYSE, Nasdaq, Euronext, Deutsche Börse, JPX ; dates 2026 et 2027 au §3.2). Les API (Twelve Data `market_state`, Finnhub `market-status`/`market-holiday`, et `currentTradingPeriod` de Yahoo) servent de contrôle. **Nager.Date ne convient pas** : un jour férié civil n'est pas un jour de fermeture boursière.
7. **Logos** : **logoapi.sh** (sans clé, usage commercial autorisé, cache autorisé, pas d'attribution), avec **logo.dev** en secours (clé « publishable », lien d'attribution obligatoire pour un projet commercial).
8. **Comptes à créer** : Finnhub (`FINNHUB_API_KEY`), Twelve Data (`TWELVEDATA_API_KEY`), EODHD (`EODHD_API_TOKEN`). logo.dev (`LOGODEV_PUBLISHABLE_KEY`) seulement si logoapi.sh fait défaut.

---

## 1. Méthode

1. J'ai téléchargé le README de public-apis (`https://raw.githubusercontent.com/public-apis/public-apis/master/README.md`, HTTP 200, 373 929 octets, 12:57:01Z) et extrait par `grep`/`awk` les sections **Finance**, **Business** et **Calendar**. Candidats retenus pour test :
   - Finance : Alpha Vantage, EOD Historical Data (EODHD), Financial Modeling Prep, Finnhub, IEX Cloud, Marketstack, Polygon (devenu Massive), StockData, Twelve Data, « Yahoo Finance » (yfapi.net), Alpaca.
   - Business : Clearbit Logo et Logoapi (logoapi.sh).
   - Calendar : Nager.Date (testé), The Calendar (page lue, pas d'appel) et TradingCalendars (clé requise, non testé).
2. J'ai complété par une recherche web : pages de prix et CGU de chaque fournisseur, pages officielles des bourses, aide Yahoo, ticket pandas-datareader sur Stooq, widgets TradingView, FRED et logo.dev.
3. Appels réels avec `t.sh` (curl ; il enregistre l'heure UTC, le code HTTP, le type et un extrait), espacés de quelques secondes, au plus 2 à 5 appels par source.

---

## 2. Tableau des sources (cotations et clôtures)

Légende des verdicts : **P** = primaire, **S** = secours, **DR** = dernier recours, **R** = rejeté.

| Source | Appel testé (URL exacte) | Résultat (code HTTP, extrait, heure UTC) | Clé ? | Quota gratuit (+ lien) | Délai | Appel serveur possible ? | Conditions d'usage (+ lien) | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Yahoo Finance v8 `chart`** (non officiel) | `https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d` (UA curl puis UA navigateur) ; `https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d` ; `…/chart/%5EFCHI?interval=1d&range=1d` ; `https://query1.finance.yahoo.com/v8/finance/chart/MC.PA?interval=1d&range=1d` ; `https://query2.finance.yahoo.com/v8/finance/chart/NVDA?period1=1794960000&period2=1795046400&interval=1d` | **12:58:38Z, UA curl : 429** `Edge: Too Many Requests`. **12:58:38Z, UA navigateur : 200**, sans cookie ni crumb : `"symbol":"AAPL",…"regularMarketTime":1795035601,…"regularMarketPrice":352.45` et `currentTradingPeriod.regular` 14:30→21:00Z. **12:58:58Z** ^GSPC 200 : `"instrumentType":"INDEX","regularMarketPrice":7323.63`. **12:58:59Z** ^FCHI 200 : `8149.97`, cotation de 12:43:45Z (≈ 15 min de retard). MC.PA 200 : `393.85`, cotation de 12:43:49Z. **13:19:40-41Z**, `fetch` de Node avec l'UA par défaut puis l'UA « Deno/2.1.4 » : **200**. **13:21:02Z** NVDA, barre du 18/11 : close `150.96` | Non | Aucun quota publié. Limites opaques : 429 observé avec l'UA curl | Selon `https://help.yahoo.com/kb/SLN2310.html` : Nasdaq **temps réel** ; indices S&P, Dow Jones et Nasdaq **temps réel** ; NYSE Indices 15 min ; Euronext Paris (.PA) et Amsterdam (.AS) **15 min** ; Xetra (.DE) 15 min ; Tokyo (.T) 20 min ; indices Nikkei **30 min**. **Mesuré** : Euronext ≈ 15 min ; AAPL en pré-marché à **13 s** (§2.1) | Oui techniquement (curl avec UA navigateur, `fetch` de Node avec l'UA par défaut) depuis une IP résidentielle. **Depuis les IP cloud de Supabase : non vérifié** | `https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html` : §2(d) point 9 interdit d'« access or collect data … from our Services using any automated means » ; §2(e) interdit l'accès « using a method other than the interface and the instructions that we provide » et l'usage « for any commercial purpose ». API non documentée | **P** pour les indices et les actions EU (seule source gratuite). **S** pour les actions US. Risques CGU et rupture à assumer (§5.1) |
| **Yahoo v8 `spark`** (lot, non officiel) | `https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL,NVDA,MSFT,TSLA,AMZN,GOOGL,META,MC.PA,ASML.AS,TTE.PA,%5EGSPC,%5ENDX,%5EIXIC,%5EDJI,%5EFCHI,%5EGDAXI,%5EN225&range=1d&interval=1d` ; `https://query2.finance.yahoo.com/v8/finance/spark?symbols=NVDA,MC.PA,%5EGDAXI,%5EN225&range=5d&interval=1d` | **12:59:13Z 200, 17 symboles sur 17 en un seul appel** : `"AAPL":{"close":[352.45],"chartPreviousClose":351.91,…}`, ^GDAXI 25743.32 à 12:44:12Z, ASML.AS 1312.4 à 12:44:07Z, ^N225 59444.21 à 06:45:03Z. **13:23:16Z 200** : 5 clôtures journalières par symbole (NVDA 166.19…150.96) | Non | Idem | Idem | Idem | Idem | **P** : c'est l'appel à utiliser (1 requête pour tout le panier) |
| Yahoo v7 `quote` | `https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,%5EGSPC` | **12:59:12Z 401** `{"code":"Unauthorized","description":"User is unable to access this feature …"}` | Cookie et crumb requis | n/a | n/a | n/a | Idem | **R** (verrouillé) |
| **Stooq** | `https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv` ; `https://stooq.com/q/l/?s=%5Espx+%5Ecac+%5Edax&f=sd2t2ohlcv&h&e=csv` ; idem sur `stooq.pl` et avec UA navigateur ; `https://stooq.com/q/d/l/?s=aapl.us&i=d` ; `https://stooq.com/q/d/?s=spy.us&get_apikey` | **12:59:42-54Z 404** `The page you requested does not exist or has been moved` sur toutes les variantes de `q/l`. **12:59:55Z 200**, mais page HTML `This site requires JavaScript to verify your browser` (preuve de travail en JS) pour `q/d/l`. **13:06:36Z** : même défi sur la page de demande de clé | Oui depuis mars 2026 : « As March 2026, Stooq requires an API key for data downloads » (`https://github.com/pydata/pandas-datareader/issues/1012`) | Non vérifié | n/a | **Non** : il faudrait exécuter leur JavaScript | Non vérifiées | **R** |
| **Finnhub** | `https://finnhub.io/api/v1/quote?symbol=AAPL` ; `https://finnhub.io/api/v1/stock/market-status?exchange=US` ; `https://finnhub.io/api/v1/stock/market-holiday?exchange=US` ; `https://finnhub.io/api/v1/stock/profile2?symbol=AAPL` (toutes sans clé) | **13:00:04-07Z 401** `{"error":"Please use an API key."}` sur les 4 URL. Le service répond | Oui : paramètre `token=` ou en-tête `X-Finnhub-Token` (doc) | Free : « **60 API calls/minute** », licence « Personal Use » (`https://finnhub.io/pricing`, tableau des offres). Plafond global « 30 API calls/ second », 429 au-delà (`https://finnhub.io/docs/api/rate-limit`). `quote`, `market-status`, `market-holiday` et `profile2` ne portent pas la mention premium dans le schéma de la doc ; `stock/candle` porte « Premium Access Required » | `/quote` : « real-time quote data for US stocks ». L'international en temps réel est réservé aux « Enterprise clients » (doc `/quote`). Indices sur l'offre gratuite : non vérifié | Oui (API REST officielle) | `https://finnhub.io/terms-of-service` : « You hereby agree to not redistribute or share access to data or derived results … with anyone or any 3rd party without written approval from Finnhub. All plan listed on Finnhub website is strictly for personal use unless explicitly stated otherwise. » ; « All data must be deleted should your subscription to that data ends. » | **P** pour les actions US (temps réel, API officielle). **S** pour le statut et les fériés US. Redistribution interdite sans accord écrit |
| **Alpha Vantage** | `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=demo` ; `…GLOBAL_QUOTE&symbol=AAPL&apikey=demo` ; `…GLOBAL_QUOTE&symbol=IBM` (sans clé) ; `https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=demo` | **13:00:15Z 200** `"05. price": "228.5300", "07. latest trading day": "2026-11-18"`. **13:00:16Z 200** `"Information": "The **demo** API key is for demo purposes only…"` pour AAPL. Sans clé : **200** `"Error Message": "the parameter apikey is invalid or missing…"` (les erreurs arrivent en HTTP 200). **13:00:24Z 200** MARKET_STATUS sur 16 marchés : US `closed` (09:30–16:15), France `open` (09:00–17:30), Germany `open` (08:00–20:00), Japan `closed` (09:00–15:00) | Oui (`apikey`) | « 25 API requests per day » (`https://www.alphavantage.co/premium/`, FAQ de `https://www.alphavantage.co/support/`) | GLOBAL_QUOTE : « updated at the end of each trading day for all users » ; le temps réel et le différé 15 min US sont premium (`entitlement=realtime` ou `entitlement=delayed`, `https://www.alphavantage.co/documentation/`) | Oui | CGU (PDF) `https://www.alphavantage.co/terms_of_service/` : licence « for personal, non-commercial use ». Est « commercial » tout usage « that goes beyond … activities that are private and individual in nature » ou qui donne accès à d'autres personnes | **R** : 25 appels/jour, fin de journée seulement, horaires inexacts (fermeture US à 16:15, Tokyo à 15:00 alors que JPX ferme à 15:30) |
| **Twelve Data** | `https://api.twelvedata.com/quote?symbol=AAPL&apikey=demo` ; `…/quote?symbol=AAPL` (sans clé) ; `…/quote?symbol=MSFT&apikey=demo` ; `https://api.twelvedata.com/market_state?exchange=NASDAQ&apikey=demo` ; `https://api.twelvedata.com/market_state?apikey=demo` ; `https://api.twelvedata.com/eod?symbol=AAPL&apikey=demo` | **13:00:35Z 200** `"close":"352.45001","previous_close":"351.91000","is_market_open":false`. Sans clé : **401** `"**apikey** parameter is incorrect or not specified…"`. MSFT avec `demo` : **401** `"The 'demo' API key is only used for initial familiarity…"`. **13:00:44Z 200** `"is_market_open":false,"time_to_open":"01:29:15"` (NASDAQ). **13:00:54Z 200**, 140 places en **1 appel** : XPAR `open` (`time_to_close":"03:39:05"`), XETR `open`, XNYS `closed`, XJPX `closed`. **13:00:45Z 200** `/eod` : `"datetime":"2026-11-18","close":"352.45001"` | Oui (`apikey`) | Basic : « 8 (800 a day) » crédits (`https://twelvedata.com/pricing`). `/quote` et `/eod` coûtent 1 crédit par symbole, `/market_state` 1 crédit par requête (`https://twelvedata.com/llms-full.txt`) | Basic : « Real-time US equities and ETFs », forex et crypto. L'Europe en temps réel commence à l'offre Pro. Les indices ne figurent pas dans Basic | Oui | Basic = « **Internal non-display usage** » (`https://twelvedata.com/pricing.md`). `https://twelvedata.com/terms` : §2.3(l) interdit « Use Free Tier data for commercial purposes » ; §2.2(e) n'autorise l'affichage externe qu'avec un « Redistribution Rights Add-On » ; §16.2(a) « All Data must be deleted within 30 days » | **S** pour le statut des places (1 crédit couvre ~140 places) et le contrôle des clôtures US. Pas d'affichage |
| **Financial Modeling Prep** | `https://financialmodelingprep.com/stable/quote?symbol=AAPL` ; idem avec `&apikey=demo` | **13:01:03-04Z 401** `"Error Message": "Invalid API KEY…"` (la clé `demo` ne marche plus) | Oui | Basic : « 250 Calls / Day », « End of Day Historical Data », bande passante de 500 MB sur 30 jours glissants. « US Coverage » à partir de Starter (payant), « Global Coverage » en Ultimate (`https://site.financialmodelingprep.com/pricing-plans`) | Fin de journée | Oui | §2.2.2 : « Without a specific agreement with FMP, customers are prohibited from showcasing FMP Services or Data on platforms including … websites … irrespective of whether such usage is complimentary or paid » ; §2.2.1 : usage personnel (`https://site.financialmodelingprep.com/terms-of-service`) | **R** |
| **Massive** (ex-Polygon.io) | `https://api.polygon.io/v2/aggs/ticker/AAPL/prev` ; `https://api.massive.com/v2/aggs/ticker/AAPL/prev` ; `https://api.massive.com/v1/marketstatus/now` | **13:01:13-15Z 401** `{"status":"ERROR",…"error":"API Key was not provided"}` | Oui | Stocks Basic à 0 $ : « 5 API Calls / Minute », « End of Day Data », « 2 Years Historical Data », « All US Stocks Tickers », sans snapshot ni websocket, `license_type: personal`. Indices Basic : « Limited Index Tickers », fin de journée (`https://massive.com/pricing?product=stocks`) | Fin de journée | Oui | « solely for your own personal, non-commercial, and non-business purposes » (`https://massive.com/legal/individuals-terms-of-service`) | **R** : États-Unis seulement, fin de journée, 5 appels/min, usage personnel |
| **Tiingo** | `https://api.tiingo.com/iex/?tickers=aapl,msft` ; `https://api.tiingo.com/tiingo/daily/aapl/prices` | **13:01:22-23Z 403** `{"detail":"Please supply a token"}` | Oui | 50 requêtes/h, 1 000/jour, 500 symboles/mois, 1 GB/mois (`https://www.tiingo.com/about/pricing`) | Non vérifié pour l'offre gratuite | Oui | « Internal Use Only » ; « may not display or share the data with another person or organization » (page des prix) | **R** |
| **Marketstack** | `https://api.marketstack.com/v2/eod/latest?symbols=AAPL` ; `http://api.marketstack.com/v1/eod/latest?symbols=AAPL` | **13:01:23-24Z 401** `"code": "missing_access_key"` | Oui | **100 requêtes/mois**, fin de journée, 1 an. Indices à partir de Basic (`https://marketstack.com/pricing`) | Fin de journée | Oui | « Non-Commercial Use » (page des prix) | **R** |
| **EODHD** | `https://eodhd.com/api/real-time/AAPL.US?api_token=demo&fmt=json` ; `https://eodhd.com/api/eod/AAPL.US?api_token=demo&fmt=json&from=2026-11-16` ; `https://eodhd.com/api/real-time/MC.PA?api_token=demo&fmt=json` ; `https://eodhd.com/api/exchange-details/US?api_token=demo&fmt=json` ; `…/real-time/AAPL.US?fmt=json` (sans clé) | **13:01:31Z 200** `"close":352.45,"previousClose":352.32`. Incohérence : `/eod` donne 351.91 pour le 17/11. **13:01:33Z 200**, 3 jours dont `"2026-11-18",…"close":352.45`. MC.PA avec `demo` : **403** `Forbidden. Please contact support…`. `exchange-details` avec `demo` : **403**. Sans clé : **401** `Unauthenticated` | Oui (`api_token`). La clé `demo` ne couvre que quelques tickers | « 20 free API calls per day ». Fin de journée sur 1 an, mondial y compris indices. Cotation « live » différée de 15 min (`https://eodhd.com/pricing`) | 15 min (live), fin de journée | Oui | Usage non professionnel « solely in a personal capacity » ; interdit « Selling, reselling, retransmitting, redistributing, displaying, or granting access to the Information » (`https://eodhd.com/financial-apis/terms-conditions`) | **DR** : contrôle des clôtures EU et Nikkei (20 appels/jour) |
| **FRED** (Fed de St. Louis) | `https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500&cosd=2026-11-10` ; `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DJIA,NASDAQCOM,NASDAQ100,NIKKEI225&cosd=2026-11-16` ; `https://api.stlouisfed.org/fred/series/observations?series_id=SP500&file_type=json` | **13:15:24Z 200** CSV `2026-11-18,7323.63` (= ^GSPC Yahoo). **13:25:26Z 200**, mais `cosd` est ignoré quand on demande plusieurs séries (632 Ko d'historique). Dernières lignes : DJIA 50198.17, NASDAQCOM 24429.88, NASDAQ100 27116.26 (18/11), NIKKEI225 59444.21 (19/11), tous identiques à Yahoo. API JSON sans clé : **400** `Variable api_key is not set` | Le CSV est sans clé ; l'API JSON en demande une | Non vérifié | Clôture du jour J, publiée le soir même (« Updated: Nov 18, 2026 7:02 PM CST », soit 01:02 UTC le 19/11) | Oui | Série SP500 : « Reproduction of S&P 500 in any form is prohibited except with the prior written permission of S&P Dow Jones Indices LLC ». Historique limité à 10 ans (`https://fred.stlouisfed.org/series/SP500`) | **S** pour le contrôle **interne** des clôtures d'indices US (sans affichage) |
| Nasdaq.com (API non officielle) | `https://api.nasdaq.com/api/market-info` (UA navigateur) | **13:16:24Z 200** `"marketIndicator":"Pre Market","marketCountDown":"Market Opens in 1H 13M","marketOpeningTime":"Nov 19, 2026 09:30 AM ET"` | Non | n/a | n/a | Oui techniquement | Non documentée. `https://www.nasdaq.com/terms-of-use` renvoie 404 : CGU non trouvées | **R** (DR possible pour le statut US) |
| Alpaca | `https://data.alpaca.markets/v2/stocks/AAPL/quotes/latest` ; `https://paper-api.alpaca.markets/v2/clock` | **13:16:23Z 401** `401 Authorization Required` (nginx) | Oui | Non vérifié | Non vérifié | Oui | Non vérifiées | **R** (non approfondi : États-Unis seulement d'après public-apis) |
| IEX Cloud | `https://cloud.iexapis.com/stable/stock/aapl/quote` | **13:20:44Z** : DNS `Could not resolve host` | n/a | n/a | n/a | n/a | n/a | **R** (service fermé) |
| « Yahoo Finance » de public-apis (yfapi.net) | `https://yfapi.net/v6/finance/quote?symbols=AAPL` | **13:20:44Z 403** `{"message":"Forbidden","hint":"Sign up for API key https://financeapi.net/tutorial"}` | Oui | Non vérifié | Non vérifié | Oui | Revendeur tiers, non approfondi | **R** |
| StockData.org | `https://api.stockdata.org/v1/data/quote?symbols=AAPL` | **13:20:45Z 401** `"invalid_api_token"` | Oui | 100 requêtes/jour, 3 symboles par requête (`https://www.stockdata.org/pricing`) | Non vérifié | Oui | « solely for your personal, non-commercial use » (`https://www.stockdata.org/tos`) | **R** |
| Widgets TradingView (affichage seul) | `https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js` (statut vérifié, script non exécuté) | **13:20:51Z 200** `text/javascript` | Non | Aucun quota mentionné | « we are only allowed to stream delayed data » pour les bourses (`https://www.tradingview.com/widget-docs/faq/data`) | **Non** : c'est un widget dans le navigateur, et « We don't have an API that gives access to data » | « We provide widgets as a technology piece for FREE with default TradingView branding » ; « easily embed onto any website » (`https://www.tradingview.com/widget/`) | Option d'**affichage** propre juridiquement (§5.1). Ne sert pas à résoudre les paris |

**Clôtures du 18/11/2026 comparées** (même valeur partout = bon signe pour la résolution) : AAPL 352.45 chez Yahoo, Twelve Data (`352.45001`) et EODHD ; ^GSPC 7323.63 chez Yahoo et FRED ; ^DJI 50198.17, ^IXIC 24429.88 et ^NDX 27116.26 chez Yahoo et FRED ; ^N225 59444.21 (19/11) chez Yahoo et FRED. Les volumes diffèrent selon la source : AAPL 34 090 200 (Yahoo), 33 393 854 (Twelve Data), 34 209 928 (EODHD).

### 2.1 Fraîcheur mesurée des cotations US

- **13:34:17Z**, appel `https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d&includePrePost=true` : **200**, 191 barres d'une minute.
  - La dernière barre est à **13:34:04Z** (close 354.24), soit **13 s avant l'appel** : le flux US de Yahoo est en temps réel, au moins en pré-marché.
  - Pendant le pré-marché, `meta.regularMarketTime` reste sur la clôture de la veille (2026-11-18T21:00:01Z, 352.45). Ce champ ne bouge qu'en séance régulière, ce qui permet de savoir si elle a commencé.
- **13:34:17Z**, EODHD `https://eodhd.com/api/real-time/AAPL.US?api_token=demo&fmt=json` : **200**, toujours sur la clôture du 18/11 (`"timestamp":1795035600`). Pas de pré-marché avec la clé `demo`.
- **Non mesuré** :
  - le délai en **séance régulière** : Wall Street ouvre à 14:30 UTC, après la fin des tests (un script de mesure avait été préparé, puis arrêté) ;
  - Finnhub, faute de clé ;
  - Twelve Data en séance, car la clé `demo` n'a été testée qu'avant l'ouverture.

  À vérifier dès que les clés existent : pendant la séance, comparer l'heure de l'appel à `last_quote_at` (Twelve Data). Chez Finnhub, le schéma `Quote` de la doc ne liste que `c`, `d`, `dp`, `h`, `l`, `o` et `pc` : la présence d'un horodatage est à vérifier.

---

## 3. Ouverture des marchés et jours fériés

### 3.1 Horaires réguliers (heure locale de la place)

| Place | Séance | Source |
|---|---|---|
| NYSE / Nasdaq | 9:30 à 16:00 ET (« Core Trading Session ») ; séance réduite jusqu'à 13:00 ET certains jours | `https://www.nyse.com/markets/hours-calendars` |
| Euronext Paris et Amsterdam | Séance continue de 09:00 à 17:30 CET. Concordance de trois API : Yahoo `currentTradingPeriod.regular` = 08:00–16:30 UTC ; Alpha Vantage MARKET_STATUS « Paris 09:00 17:30 » ; Twelve Data XPAR ferme vers 16:40 UTC, soit 17:40 CET (fixing et « trading at last » inclus). **Horaires exacts du fixing et des demi-séances : non vérifiés pour 2026** (page Euronext lue sans ces heures). Les communiqués Euronext de 2014 à 2020, vus seulement dans des extraits de recherche, indiquent une fin de séance à 14:05 CET les jours de demi-séance. Par prudence, on peut fixer 14:00 CET dans la table, à confirmer en décembre | API ci-contre et `https://www.euronext.com/en/trade/trading-hours-holidays` |
| Xetra (Deutsche Börse) | « Trading on Xetra takes place from Mondays to Fridays from 9 until 17:30 CET » | `https://cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours` |
| Tokyo (TSE) | 9:00–11:30 et 12:30–15:30 JST | `https://www.jpx.co.jp/english/equities/trading/domestic/01.html` |

Pour le calcul, toujours raisonner en **heure locale avec le fuseau IANA** (`America/New_York`, `Europe/Paris`, `Europe/Berlin`, `Asia/Tokyo`), jamais avec un décalage UTC fixe. Les changements d'heure des États-Unis et de l'Europe ne tombent pas les mêmes semaines. Le 19/11, Yahoo indique `gmtoffset` −18000 pour New York et +3600 pour Paris.

### 3.2 Calendriers officiels (à charger dans une table Postgres)

**NYSE** (`https://www.nyse.com/markets/hours-calendars`), identique pour **Nasdaq** en 2026 (`https://www.nasdaq.com/market-activity/stock-market-holiday-schedule`, lue par curl à 13:17:45Z) :

| Jour férié | 2026 | 2027 | 2028 |
|---|---|---|---|
| New Year's Day | jeu. 1 janv. | ven. 1 janv. | aucun (1/1/2028 tombe un samedi) |
| Martin Luther King, Jr. Day | lun. 19 janv. | lun. 18 janv. | lun. 17 janv. |
| Washington's Birthday | lun. 16 févr. | lun. 15 févr. | lun. 21 févr. |
| Good Friday | ven. 3 avr. | ven. 26 mars | ven. 14 avr. |
| Memorial Day | lun. 25 mai | lun. 31 mai | lun. 29 mai |
| Juneteenth | ven. 19 juin | ven. 18 juin (observé) | lun. 19 juin |
| Independence Day | ven. 3 juil. (observé) | lun. 5 juil. (observé) | mar. 4 juil. |
| Labor Day | lun. 7 sept. | lun. 6 sept. | lun. 4 sept. |
| Thanksgiving | **jeu. 26 nov.** | jeu. 25 nov. | jeu. 23 nov. |
| Christmas | **ven. 25 déc.** | ven. 24 déc. (observé) | lun. 25 déc. |

Fermeture anticipée à **13:00 ET** : **ven. 27/11/2026**, **jeu. 24/12/2026**, ven. 26/11/2027, lun. 3/7/2028 et ven. 24/11/2028.

**Euronext** (`https://www.euronext.com/en/trade/trading-hours-holidays`). Fermé sur toutes les places en 2026 : 1 janv., 3 avr. (Good Friday), 6 avr. (Easter Monday), 1 mai, **25 déc.** Demi-séances pour Paris et Amsterdam : **jeu. 24/12/2026** et **jeu. 31/12/2026**. En 2027 : fermé les 1 janv., 26 mars et 29 mars ; demi-séances les 24 et 31 déc. Le 1/5/2027 et le 25/12/2027 tombent un samedi. Les fermetures propres à d'autres places (Dublin, Oslo, Athènes, Milan) ne concernent pas Paris ni Amsterdam.

**Xetra / Börse Frankfurt** (page Deutsche Börse citée au §3.1). Pas de négociation en 2026 : 1 janv., 3 avr., 6 avr., 1 mai, **24 déc.**, **25 déc.**, 26 déc. (samedi), **31 déc.** « ** No trading but settlement is open » s'applique aux 24 et 31 déc. En 2027 : 1 janv., 26 mars, 29 mars, 1 mai (samedi), 24 déc., 25 et 26 déc. (week-end), 31 déc. **Jours fériés allemands où l'on négocie quand même** en 2026 : Ascension (14 mai), lundi de Pentecôte (25 mai), Fête-Dieu (4 juin).

**JPX / Tokyo** (`https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html`, mise à jour du 6 févr. 2026, lue par curl à 13:12:06Z).
- 2026 : 1, 2, 12 janv. ; 11 et 23 févr. ; 20 mars ; 29 avr. ; 4, 5 et 6 mai ; 20 juil. ; 11 août ; 21, 22 et 23 sept. ; 12 oct. ; 3 nov. ; **23 nov.** ; **31 déc.** (3 janv. et 3 mai tombent un week-end).
- 2027 : 1 et 11 janv. ; 11 et 23 févr. ; 22 mars ; 29 avr. ; 3, 4 et 5 mai ; 19 juil. ; 11 août ; 20 et 23 sept. ; 11 oct. ; 3 et 23 nov. ; 31 déc.

**Prochaines fermetures à partir du 19/11/2026** : Tokyo lun. 23/11 ; NYSE/Nasdaq jeu. 26/11, puis séance réduite ven. 27/11 ; demi-séance Euronext jeu. 24/12, Xetra fermé jeu. 24/12, séance réduite NYSE/Nasdaq jeu. 24/12 ; NYSE/Nasdaq, Euronext et Xetra fermés ven. 25/12 (Tokyo ouvert : le 25/12 n'est pas férié à la JPX) ; Xetra fermé et demi-séance Euronext jeu. 31/12 ; Tokyo fermé jeu. 31/12. Conséquence pour un marché « clôture de NVDA au 31/12 » : ce jour-là, NYSE et Nasdaq sont **ouverts toute la journée** (le 31/12/2026 ne figure ni dans les fériés ni dans les fermetures anticipées). À l'inverse, **il n'y a pas de clôture Xetra le 31/12** : un marché « DAX au 31/12 » doit prévoir la règle « dernière clôture disponible » (le 30/12).

### 3.3 Sources testées pour le statut et les fériés

| Source | Ce qu'elle donne | Résultat du test | Verdict |
|---|---|---|---|
| Table maison (ci-dessus) + fonction SQL | Statut calculé chaque minute, sans dépendance externe | n/a | **P** |
| Yahoo `currentTradingPeriod` + `regularMarketTime` (dans chaque réponse `chart`) | Fenêtres pré/régulière/post du jour en UTC et heure de la dernière cotation | 12:58:58Z : ^GSPC `regular` 14:30→21:00Z ; ^FCHI `regular` 08:00→16:30Z | **S** (contrôle gratuit à chaque appel ; si la cotation est trop vieille, considérer le marché comme fermé) |
| Twelve Data `/market_state` (1 crédit, toutes les places) | `is_market_open`, `time_to_open`, `time_to_close` | 13:00:54Z, 140 places : XPAR et XETR ouverts, XNYS et XJPX fermés | **S** |
| Finnhub `/stock/market-status`, `/stock/market-holiday` | `isOpen`, `session` (« pre-market »…), `holiday` ; liste de fériés avec `tradingHour` (ex. « 09:30-13:00 ») d'après l'exemple de réponse de la doc | 401 sans clé (13:00:04-05Z). Codes de places hors US : la doc montre `US` et `L` ; `PA`, `DE` et `T` **non vérifiés** | **S** (US) |
| Alpha Vantage `MARKET_STATUS` | open/closed pour 16 marchés | 13:00:24Z 200 : horaires faux (US 16:15 ; Japon 15:00 au lieu de 15:30 ; Allemagne 08:00–20:00, ce qui n'est pas Xetra) ; 25 appels/jour | **R** |
| Massive `/v1/marketstatus/now` | Statut US | 401 sans clé (13:01:15Z) ; usage personnel | **R** |
| Nasdaq `api/market-info` (non officielle) | « Pre Market », compte à rebours | 13:16:24Z 200 | **DR** (US seulement, CGU inconnues) |
| **Nager.Date** | Jours fériés **civils** par pays | 13:01:52-53Z, 200 pour US, FR et DE (`https://date.nager.at/api/v3/PublicHolidays/2026/US`, `/FR`, `/DE`) | **R** pour le calendrier boursier (voir §3.4) |
| the-calendar.net | « US stock market holidays (2026) » seulement, CC BY 4.0 (`https://the-calendar.net/api/`) | Non appelé (page lue) | **R** (ni Europe ni Japon) |

### 3.4 Pourquoi Nager.Date ne convient pas (preuves tirées des réponses du 19/11)

- **US** : Nager liste le 12/10 (Columbus Day, type « Bank ») et le 11/11 (Veterans Day), deux jours où NYSE est ouvert. Good Friday (3/4) n'y figure qu'en régional, alors que NYSE est fermé ce jour-là. Les séances réduites (27/11, 24/12) n'y figurent pas.
- **FR** : Nager liste le 8/5, l'Ascension (14/5), le lundi de Pentecôte (25/5), le 14/7, le 15/8, le 1/11 et le 11/11, jours où **Euronext est ouvert**. Il ne liste pas Good Friday (3/4), jour où Euronext est fermé.
- **DE** : Nager liste le 3/10 et l'Ascension, la Pentecôte et la Fête-Dieu (régionaux), jours où Xetra négocie. Il ne liste pas les 24/12 et 31/12, jours où Xetra est fermé.

Nager.Date peut au mieux servir d'alerte (« jour férié civil : vérifier le calendrier boursier »).

### 3.5 Règles proposées pour « Marché fermé » et les paris flash de 45 s

1. `is_open(place, now)` = jour ouvré local, pas dans la table des fermetures, et heure locale dans la séance (en tenant compte des séances réduites et de la pause de midi à Tokyo).
2. Pour chaque symbole : **les paris flash restent ouverts** si (a) sa place est ouverte, (b) l'heure de cotation reçue (`regularMarketTime` chez Yahoo ; chez Finnhub, horodatage à confirmer, voir §2.1) a moins de 2 min de retard une fois déduit le délai nominal de la source, et (c) on n'est pas dans les 5 dernières minutes avant la clôture (le fixing de clôture peut faire sauter le prix). Sinon, afficher « Marché fermé : dernier cours de clôture X (date) ».
3. **Pas de paris flash sur les symboles différés** : CAC 40, DAX, MC.PA, ASML.AS et TTE.PA sont différés de 15 min chez Yahoo, le Nikkei de 30 min. Sur une série différée, le résultat d'un pari de 45 s est déjà visible sur n'importe quel site temps réel : c'est une triche facile, même avec de l'argent fictif. Les paris flash ne sont donc proposés que sur les actions US (Finnhub ou Yahoo, temps réel) et les indices US S&P 500, Dow Jones et Nasdaq (Yahoo, temps réel). Pour l'Europe et le Japon, seuls des paris longs, résolus à la clôture, sont proposés.
4. Pour résoudre un pari flash, prendre le prix de référence = dernière cotation en cache au moment du pari, et le prix final = première cotation dont l'heure ≥ heure de référence + 45 s. Il faut toujours dater avec l'heure de la cotation, pas l'heure murale du serveur.

---

## 4. Logos d'entreprises

| Source | Appel testé | Résultat (heure UTC) | Clé ? | Quota | Conditions (+ lien) | Verdict |
|---|---|---|---|---|---|---|
| **logoapi.sh** | `https://logoapi.sh/ticker/AAPL.svg` ; `https://logoapi.sh/ticker/MC.PA.svg` ; `https://logoapi.sh/lvmh.com.svg` | **13:02:37-39Z 200** `image/svg+xml`. AAPL : vrai tracé vectoriel de la pomme, 1 365 octets. MC.PA : mot-symbole LVMH, avec l'en-tête `X-Logo-Fallback: wordmark`. Aucun `<script>` dans les SVG. `Cache-Control: public, max-age=86400` | **Non** | « 2M requests a month per site. Free. No key. » ; 429 avec `Retry-After` au-delà (`https://logoapi.sh/docs`) | « No key, no signup, no attribution. Commercial use included. » ; « You may use and cache our logos in your app or site » ; « You may not bulk-download them to build or feed another logo service » ; marques « exclusive property of their respective owners », affichées « for informational and educational purposes only » ; préavis de 12 mois avant réduction de l'offre gratuite (`https://logoapi.sh/terms`) | **P** |
| **logo.dev** | `https://img.logo.dev/apple.com` ; `https://img.logo.dev/ticker/AAPL` (sans jeton) | **13:02:07-08Z 401** `"invalid api token…"` / `"missing api token"` | Oui : clé **publishable** dans `?token=` (utilisable dans le navigateur) et clé secrète `sk_` réservée au serveur | 500 000 requêtes CDN/mois (`https://www.logo.dev/pricing`) | « Commercial projects keep a link back to Logo.dev » (lien « Logos provided by Logo.dev » obligatoire en offre gratuite pour un projet commercial) ; stockage et service depuis nos serveurs autorisés (page des prix) ; tickers avec suffixe (`/ticker/AZN.L`, `.PA`…) (`https://www.logo.dev/docs/logo-images/ticker`) | **S** (compte requis) |
| Finnhub (URL statique) | `https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png` | **13:00:08Z 200** PNG 1000×1000, accessible sans clé | Non pour l'image ; oui pour `profile2` qui donne l'URL | n/a | CGU Finnhub : usage personnel, pas de redistribution sans accord écrit | **R** (licence) |
| FMP `image-stock` | `https://financialmodelingprep.com/image-stock/AAPL.png` ; `…/image-stock/MC.PA.png` | **13:01:05-06Z 200** PNG 100×100 (AAPL) et 128×128 (MC.PA, logo LVMH vérifié visuellement) | Non | n/a | CGU FMP §2.2.2 : pas d'affichage sur un site sans accord ; rien de spécifique aux logos | **R** (licence) |
| Clearbit Logo | `https://logo.clearbit.com/apple.com` | **13:02:07Z** : DNS `Could not resolve host` | n/a | n/a | n/a | **R** (service arrêté) |
| Parqet | `https://assets.parqet.com/logos/symbol/AAPL?format=png` | **13:02:08Z 403**, page Cloudflare « Attention Required! » | n/a | n/a | Non vérifiées | **R** |
| Favicons Google | `https://www.google.com/s2/favicons?domain=apple.com&sz=128` | **13:03:12Z 301** vers `t0.gstatic.com/faviconV2?…` | Non | Non documenté | Service non documenté | **DR** (icône de site, pas un logo) |
| Dépôts GitHub de logos | `https://api.github.com/repos/nvstly/icons` ; `…/repos/davidepalazzo/ticker-logos` | **13:03:1xZ 200** : `license: NOASSERTION` pour les deux (NYSE et Nasdaq uniquement) | n/a | n/a | Pas de licence claire | **R** |

Remarques :
- Un logo reste une **marque** de l'entreprise. L'affichage pour identifier une valeur cotée est l'usage visé par logoapi.sh, mais je n'ai pas fait d'analyse juridique. Les indices n'ont pas de logo d'entreprise : utiliser un drapeau ou un badge texte (« S&P 500 », « CAC 40 »).
- Implémentation : un job mensuel télécharge les 10 logos (logoapi.sh, puis logo.dev en secours) dans Supabase Storage, ou mémorise simplement l'URL. Les CGU de logoapi.sh autorisent le cache et interdisent seulement l'aspiration du catalogue. Dernier recours : monogramme généré localement (initiales sur pastille de couleur), sans aucune dépendance.

---

## 5. Recommandation

### 5.1 Point juridique (à lire d'abord)

| Source | Licence de l'offre gratuite | Affichage public autorisé ? |
|---|---|---|
| Yahoo (non officiel) | CGU grand public : pas d'accès automatisé, pas d'usage commercial | Non |
| Finnhub | « strictly for personal use » | Non, sans accord écrit |
| Twelve Data | « Internal non-display usage » | Non, sauf add-on de redistribution payant |
| Alpha Vantage | « personal, non-commercial use » | Non |
| FMP | Personnel ; §2.2.2 | Non, « irrespective of whether such usage is complimentary or paid » |
| Massive | « personal, non-commercial, and non-business » | Non |
| Tiingo | « Internal Use Only » | Non |
| EODHD | Non professionnel, personnel | Non (« displaying » interdit) |
| Widgets TradingView | Gratuits avec le logo TradingView | **Oui** (affichage dans le navigateur, données différées, pas d'API) |
| logoapi.sh | Usage commercial inclus | **Oui** |

Conclusion : **pour une maquette en accès restreint** (équipe, testeurs invités), on peut s'appuyer sur ces sources gratuites en restant sobre (cache, pas de revente, pas d'export). **Avant toute ouverture publique**, il faut :
- soit afficher les cours via les **widgets TradingView** (gratuits, différés, logo imposé) et garder les données serveur pour la logique interne (résolution, pause des paris) ;
- soit passer à une offre avec droit d'affichage. Ce point est hors du périmètre « gratuit » et n'a pas été chiffré.

Cette décision revient au propriétaire et sera notée dans `docs/PLAN.md`.

### 5.2 Par besoin : primaire, secours, dernier recours

| Besoin | Primaire | Secours | Dernier recours |
|---|---|---|---|
| **a) Cours « live » des actions US** (7) | **Finnhub `/quote`** (temps réel, API officielle, 60 appels/min) | Yahoo `spark` (Nasdaq en temps réel) | Dernière clôture en base, avec le libellé « cours indisponible » |
| **a) Cours des actions EU** (MC.PA, ASML.AS, TTE.PA) et des **indices** (S&P 500, Nasdaq 100/Composite, Dow, CAC 40, DAX, Nikkei) | **Yahoo `spark`** (1 appel pour les 17 symboles ; US temps réel, EU 15 min, Nikkei 30 min) | Aucune source gratuite équivalente : EODHD « live » différé de 15 min, mais 20 appels/jour seulement (quelques rafraîchissements par jour) | Dernière clôture en base, libellé « différé / fermé » |
| **b) Clôture officielle** (résolution) | **Yahoo** (`spark` `range=5d&interval=1d`, ou `chart` avec `period1/period2`) | Contrôle croisé : actions US avec Finnhub `/quote` champ `pc` (« Previous close price ») le lendemain avant l'ouverture, ou Twelve Data `/eod` ; indices US avec **FRED** CSV (SP500, DJIA, NASDAQCOM, NASDAQ100), usage interne ; EU et Nikkei avec **EODHD** `/eod` (ou FRED NIKKEI225) | En cas d'écart de plus de 0,01 (ou de 0,02 %) entre deux sources, ou de source manquante : **suspendre la résolution** et la signaler pour validation manuelle |
| **c) Ouvert / fermé + fériés** | **Table maison** (fériés et séances réduites des §3.2, horaires du §3.1) + fonction SQL | Twelve Data `/market_state` (toutes places) ; Finnhub `market-status` et `market-holiday` (US) ; Yahoo `currentTradingPeriod` et fraîcheur de `regularMarketTime` | Si toutes les sources se contredisent : **considérer le marché comme fermé** et suspendre les paris flash (option la plus sûre) |
| **d) Logos** | **logoapi.sh** | **logo.dev** (compte + clé publishable + lien d'attribution) | Monogramme local |

### 5.3 Fréquences de rafraîchissement (avec le calcul)

Hypothèses : 17 symboles (7 actions US, 3 actions EU, 7 indices). Séances en heure d'hiver, en UTC : Tokyo 00:00–06:30, Europe 08:00–16:30 (fixing jusqu'à ~16:40), New York 14:30–21:00. Fenêtre « Europe ou US ouvert » = 08:00–21:00, soit **13 h**. Tokyo seul = **6,5 h**. Reste de la journée = **4,5 h**. En heure d'été, l'Europe et les US avancent d'1 h en UTC ; le calcul se fait en heure locale, donc ça ne change rien.

1. **Yahoo `spark`, 1 requête = 17 symboles** (pas de quota publié, je vise au plus 2 req/min) :
   - Europe ou US ouvert : toutes les **30 s**, soit 2 × 60 × 13 = **1 560 req/jour**.
   - Tokyo seul : toutes les **60 s**, soit 60 × 6,5 = **390 req/jour**.
   - Hors séance : toutes les **15 min**, soit 4 × 4,5 = **18 req/jour** (dernières cotations, corrections).
   - Week-end : 0, ou 1 par heure (24).
   - **Total ≈ 1 968 req/jour ouvré, au plus 2 req/min.** Sur un 429, backoff exponentiel (1, 2, 4… jusqu'à 30 min), puis bascule vers les secours.
   - Garder l'UA par défaut de Deno. Un UA « Deno/2.1.4 », envoyé par `fetch` de Node, a reçu 200 ; seul l'UA de curl a été bloqué. Inutile d'usurper un UA de navigateur. **Le comportement réel depuis une Edge Function Supabase (IP cloud, pile TLS de Deno) reste à vérifier** avec une fonction de test qui fait un seul appel.
2. **Finnhub `/quote`, 1 symbole par appel, 7 actions US, quota de 60/min :**
   - Séance US (14:30–21:00) : toutes les **15 s** → 7 × 4 = **28 appels/min**, soit **47 % du quota (marge 53 %)**. Sur la journée, 28 × 60 × 6,5 = 10 920 appels ; la page des prix n'indique qu'une limite par minute.
   - Plus `market-status?exchange=US` toutes les 5 min (0,2/min) et `market-holiday?exchange=US` 1 fois par jour. **Pointe ≈ 28,2/min, sous les 60/min.** Variante économe : 30 s, soit 14/min (23 %).
   - Le matin (09:00–14:00 UTC), 7 appels pour récupérer `pc`, le contrôle croisé de la clôture de la veille.
3. **Twelve Data `/market_state`, 1 crédit par requête pour toutes les places :** toutes les **15 min** sur 24 h = **96 crédits/jour**, soit **12 % des 800/jour**. Au plus 1 crédit/min sur 8 (marge 87 %). En option, `/eod` sur les 7 actions US : 7 crédits/jour, ce qui porte le total à **103/800 (13 %)**.
4. **Clôtures officielles** :
   - Yahoo `spark` `range=5d&interval=1d` (1 requête) à 07:00 (Tokyo J), 17:00 (Europe J), 21:30 (US J), plus une passe de confirmation à J+1 12:00, soit **4 req/jour**. **La résolution utilise la valeur de confirmation.**
   - **FRED** : 1 série par appel avec `cosd` (sinon l'historique entier, 632 Ko), à J+1 06:00 → **4 appels/jour** (SP500, DJIA, NASDAQCOM, NASDAQ100), + NIKKEI225 si besoin.
   - **EODHD** `/eod` pour MC.PA, ASML.AS, TTE.PA, CAC, DAX et Nikkei à J+1 → **6 appels/jour = 30 % des 20/jour (marge 70 %)**. Codes d'indices EODHD (`.INDX`) non vérifiés.
5. **Statut d'ouverture** : calcul SQL local chaque minute, sans appel externe.
6. **Logos** : 10 logos rafraîchis tous les 30 jours → 10 req/mois sur 2 000 000 (≈ 0,0005 %).

### 5.4 Mise en œuvre côté Supabase (esquisse)

- **pg_cron** accepte des intervalles en secondes : « `[1-59] seconds` », par exemple `'30 seconds'` (`https://github.com/citusdata/pg_cron`). Supabase Cron annonce des jobs « from every second to once a year », recommande au plus 8 jobs simultanés et 10 min par job (`https://supabase.com/docs/guides/cron`).
- Jobs prévus :
  - `quotes-yahoo` (30 s, no-op si toutes les places sont fermées) ;
  - `quotes-finnhub-us` (15 s en séance US) ;
  - `market-state` (15 min) ;
  - `eod-close` (4 passes par jour) ;
  - `logos` (mensuel).
- Chaque job appelle une Edge Function qui écrit dans des tables `market_quotes(symbol, price, quote_time, source, fetched_at)`, `market_closes(symbol, date, close, source, confirmed)` et `market_calendar(exchange, date, kind, close_time_local)`. Le site lit uniquement ces tables (ou Realtime) : **le navigateur n'appelle jamais une API à clé**.
- Pièges vus pendant les tests :
  - Alpha Vantage renvoie ses erreurs en HTTP 200 : il faut tester les clés `Information` et `Error Message`.
  - Pour EU et Tokyo, la dernière barre `spark` est la séance en cours, pas une clôture.
  - Yahoo `fulldayPrice` ≠ `close` pour les actions US (≈ prix pré/post-marché, non vérifié précisément) : utiliser `regularMarketPrice` et `close`.
  - EODHD `real-time.previousClose` (352.32) ne correspond pas à son propre `/eod` (351.91) : ne pas l'utiliser pour résoudre.

---

## 6. Comptes gratuits à créer

Aucun compte n'a été créé pendant l'étude. Les secrets se règlent dans le tableau de bord (« Edge Function Secrets » : Key + Value, puis Save) ou en CLI avec `supabase secrets set NOM=valeur`, et se lisent avec `Deno.env.get('NOM')`. Les noms ne peuvent pas commencer par `SUPABASE_` (`https://supabase.com/docs/guides/functions/secrets`).

| Priorité | Service | Page d'inscription | Étapes (d'après la page lue) | Nom de la clé chez le fournisseur → secret Supabase | Pourquoi |
|---|---|---|---|---|---|
| 1 | **Finnhub** | `https://finnhub.io/register` (HTTP 200 à 13:21:11Z) | Formulaire à 3 champs : `Name`, `Email`, `Password` (vus dans le code JS du site, juste avant le texte de confirmation). En s'inscrivant, on confirme être « a qualified non-professional (personal use) … or a commercial/professional user with our written approval ». La clé apparaît ensuite sur le tableau de bord (`https://finnhub.io/dashboard`, lien cité par la doc) | « API key », passée en `token=` ou en en-tête `X-Finnhub-Token` → **`FINNHUB_API_KEY`** | Actions US en temps réel (paris flash), `pc` pour contrôler la clôture, statut et fériés US |
| 2 | **Twelve Data** | `https://twelvedata.com/register` (HTTP 200 à 13:21:12Z) | Full name, Email, Password (8 caractères minimum), Confirm password, ou « Sign up with Google / Apple ». Emplacement de la clé dans le tableau de bord : non vérifié | Paramètre `apikey` (testé avec `demo`) → **`TWELVEDATA_API_KEY`** | `/market_state` pour toutes les places en 1 crédit ; `/eod` US en contrôle |
| 3 | **EODHD** | `https://eodhd.com/register` (HTTP 200 à 13:21:14Z) | La page lue ne montre que « Sign up with » Google ou GitHub. « get your API key … within seconds » | Paramètre `api_token` (testé avec `demo`) → **`EODHD_API_TOKEN`** | Contrôle croisé des clôtures EU et Nikkei (20 appels/jour) |
| Optionnel | **logo.dev** | `https://www.logo.dev/signup` (HTTP 429 à 13:21:13Z, page protégée contre les robots, contenu non lu) | Création de compte (étapes non vérifiées). La doc nomme une clé publishable (paramètre `token`) et une clé secrète `sk_` | Clé publishable → **`LOGODEV_PUBLISHABLE_KEY`** (non secrète par nature, mais à garder côté serveur si les logos sont recopiés dans Storage) | Seulement si logoapi.sh ne suffit pas. Lien « Logos provided by Logo.dev » obligatoire pour un projet commercial |
| Non | Alpha Vantage (`https://www.alphavantage.co/support/#api-key` : « Which of the following best describes you? », Organization facultatif, Email ; « 25 API requests per day ») | n/a | n/a | n/a | Inutile : fin de journée seulement, 25 appels/jour, horaires de MARKET_STATUS inexacts |
| Non | FMP, Massive, Tiingo, Marketstack, StockData, FRED (clé API) | n/a | n/a | n/a | Rien de plus que les sources retenues. Le CSV FRED suffit, sans clé |

---

## Annexe A : candidats de public-apis écartés sans test approfondi

Finance : AIR Stock Discovery, Aletheia, Arkleon, AuraStream, Drillr, Duceus, FinBridge, Filingrail, StockFit, Wealthnow, XFINLAB, XOOMAR, Hotstoks, Styvio, TickerLayer, TILLA, Finage, Intrinio, IG, Tradier, Clear Street. Ce sont surtout des données fondamentales, SEC, crypto ou macro, ou des offres à clé sans offre gratuite claire. Je ne les ai pas testés. Futures Clock ne couvre que les horaires des contrats à terme. TradingCalendars (Calendar) demande une clé et n'a pas été testé.

## Annexe B : fichiers de preuve

Les fichiers `dl-bourse\<label>.body` et `.hdr` correspondent aux libellés suivants : `yahoo_*`, `stooq_*`, `finnhub_*`, `av_*`, `td_*`, `fmp_*`, `polygon_*`, `massive_*`, `tiingo_*`, `marketstack_*`, `eodhd_*`, `nager_*`, `fred_*`, `nasdaq_*`, `alpaca_*`, `logoapi_*`, `logodev_*`, `parqet_*`, `google_favicon`, `gh_*`, `tradingview_widget_js_txt`, `iexcloud_api`, `yfapi_nokey`, `stockdata_nokey`, `pre_yahoo_aapl_1m` et `pre_eodhd_aapl` (mesure en pré-marché), et `jpx_*` (pages JPX). Le PDF des CGU d'Alpha Vantage et son texte extrait sont dans `dl-bourse\pdf-av\`. Les logos téléchargés pour contrôle visuel sont dans `dl-bourse\logos\`.
