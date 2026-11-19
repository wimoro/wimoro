# Wimoro : sources gratuites de données crypto

Recherche du jeudi 19 novembre 2026. Tous les appels réels ont été faits le 19/11/2026 entre 12:57 et 13:24 UTC (heures notées `HH:MM:SSZ`). Prix, historique à la seconde, clôtures, classement par capitalisation et logos pour BTC, ETH, SOL, XRP, BNB, DOGE, ADA, AVAX, LINK et TON.

Convention : « vérifié » = constaté par un appel ou lu sur la page citée ; « non vérifié » = pas d'appel ni de lecture directe (source secondaire ou page illisible).

---

## 0. L'essentiel en 10 lignes

1. **Live dans le navigateur** : WebSocket public Binance `data-stream.binance.vision` (sans clé, 1 mise à jour/s par actif, les 10 actifs sur une connexion). Secours : Kraken WS v2. Dernier recours : cache Supabase rafraîchi par le serveur.
2. **Pari flash (moyenne de 3 sources)** : Binance (bougies 1 s) + OKX (bougies 1 s) + Gate (trades horodatés à la ms), toutes en USDT. Ce sont les plus liquides des 10 actifs (dernier trade souvent à moins de 5 s). Secours : Coinbase Advanced (trades `start/end`, USD), puis Kraken (trades `since`, USD).
3. **Clôture à 23:59** : moyenne Coinbase + Kraken + Bitstamp (USD, bougie 1 min). Secours : Binance (USDT). Dernier recours : CoinGecko (points toutes les 5 min).
4. **Classement par capitalisation** : instantané CoinGecko Demo pris par le serveur à l'heure de résolution. Secours : CoinMarketCap Basic. Les règles du marché doivent préciser si les stablecoins et les jetons dérivés comptent.
5. **Logos** : à héberger nous-mêmes. Trust Wallet assets (licence MIT, 10/10 actifs) ou spothq/cryptocurrency-icons (CC0, 9/10 : pas de TON).
6. **Comptes gratuits** : CoinGecko Demo (`COINGECKO_API_KEY`, recommandé) ; CoinMarketCap Basic (`CMC_API_KEY`, conseillé en secours) ; Pyth (`PYTH_API_KEY`, à évaluer).
7. **Alerte TON** : Toncoin a été renommé **GRAM**. Binance `TONUSDT` est à l'arrêt (`status=BREAK`). OKX, Gate et Bitstamp ne listent que GRAM ; Coinbase, Kraken et Bitfinex gardent « TON ». Il faut soit une table de correspondance par plateforme, soit remplacer TON par LTC (présent partout, logo CC0).
8. **Alerte conditions d'usage (CGU)** : toutes les bourses dont les CGU ont pu être lues limitent l'affichage ou la redistribution de leurs données. Coinbase interdit l'affichage à des tiers et l'usage comme « benchmark » ; OKX réserve les données à un usage personnel. Acceptable pour une maquette non commerciale, à valider (accord écrit ou fournisseur sous licence) avant toute monétisation.
9. **Morts ou payants** : CoinCap v2 (DNS mort ; v3 = clé, 500 crédits/mois), CryptoCompare/CoinDesk (401, clé requise), Pyth Hermes public (401, clé requise), Messari v1 (404).
10. **Supabase** : forcer la région UE des Edge Functions (en-tête `x-region`), car Binance bloquerait les IP US (blocage rapporté, non vérifié). Une tâche pg_cron toutes les 15 s = 172 800 invocations/mois, soit 35 % du quota gratuit.

---

## 1. Méthode

- **Point de départ** : README de public-apis (`https://raw.githubusercontent.com/public-apis/public-apis/master/README.md`). Téléchargé à 12:57:13Z (HTTP 200, 373 929 octets), seule la section « Cryptocurrency » a été extraite. Candidats retenus depuis cette liste : Binance, Coinbase, Kraken, KuCoin, Gateio, Gemini, OKEx (OKX), Bybit, Bitfinex, CoinGecko, Coinpaprika, CoinCap, Coinlore, CoinMarketCap, CryptoCompare, DefiLlama, Messari.
  - Plusieurs informations du README sont **périmées**. CoinCap y est noté « No auth » alors que v2 est mort et v3 exige une clé. CryptoCompare y est noté « No » auth alors qu'il renvoie 401. Binance, Kraken, OKX, Gate, KuCoin et Coinbase y sont notés `apiKey`, alors que leurs données de marché publiques s'obtiennent sans clé.
  - Ajoutés par recherche personnelle : Bitstamp, Binance `data-api.binance.vision`, Coinbase Advanced Trade (endpoints `/market/` publics) et Pyth.
- **Outils** : Node 26.13.1 (`fetch` et `WebSocket` intégrés).
  - Scripts dans `(notes de travail, hors dépôt) d1\scripts-crypto\` : `lib.mjs`, `probe-rest.mjs`, `probe-ton.mjs`, `probe-alt.mjs`, `probe-history.mjs`, `probe-ws.mjs`, `probe-fresh.mjs`, `probe-liquidity.mjs`, `probe-daily.mjs`, `probe-logos.mjs`.
  - Sorties brutes dans le dossier voisin `...\scratchpad\d1\results-crypto\`.
- **Test CORS** : chaque requête envoyait `Origin: https://example.org`. La colonne « navigateur » s'appuie sur l'en-tête `Access-Control-Allow-Origin` (ACAO) reçu.
- **Volume** : environ 300 appels, dont 14 WebSocket de 5 s. Au moins 1,3 s séparait deux appels au même hôte, sauf pour la mesure de liquidité, qui alternait 6 hôtes à 350 ms d'intervalle (environ 2 s par hôte).
- **IP de test** : `api.binance.com` répond 200, donc l'IP n'est pas bloquée par Binance. Le **blocage des IP US n'a pas pu être testé directement**.
- **Sécurité** : réponses et pages traitées comme des données, jamais comme des instructions. Deux pages de la documentation Supabase contenaient des consignes adressées aux agents IA ; elles ont été ignorées. La page légale de Coinbase répond 403 aux clients automatisés et n'a pas été contournée. Aucun compte créé, aucune clé utilisée.

---

## 2. Tableau des sources

Abréviations : ACAO = `Access-Control-Allow-Origin` (CORS) ; « origine renvoyée » = le serveur renvoie l'origine reçue, donc le CORS est autorisé.

| Source | Appel testé (URL exacte) | Résultat (code HTTP, extrait, heure UTC) | Clé ? | Quota gratuit (+ lien) | Délai | Appel serveur possible ? | Conditions d'usage (+ lien) | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Binance REST** (`api.binance.com`, `data-api.binance.vision`) | `GET https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","TONUSDT"]` (encodé en URL) ; `GET https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=2` | **200**, 13:00:30Z : `{"symbol":"BTCUSDT","price":"63888.39000000"}`, en-tête `x-mbx-used-weight-1m: 5`, ACAO `*`. data-api **200**, 13:00:32Z, même prix. Bougie 1 s : `[[1795093233000,"63888.38000000",…]]`. | Non | 6 000 points de « poids »/min/IP (`rateLimits` de `/api/v3/exchangeInfo`, observé). klines = 2, aggTrades = 4, ticker/price = 2 (1 symbole) ou 4 (plusieurs) : [doc market data](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints). Dépassement : 429, puis bannissement 418 de 2 min à 3 j : [doc limits](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits) | Temps réel. La bougie 1 s de T est disponible à T+3 s (testé). | Oui depuis notre IP. Blocage 451 des IP US rapporté par des forums ([dev.binance.vision](https://dev.binance.vision/t/api-error-451-unavailable-for-legal-reasons/13828)), **non vérifié**. `data-api.binance.vision` sert « only public market data » ([FAQ](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only)). | Page officielle [binance.com/en/terms](https://www.binance.com/en/terms) rendue en JavaScript, **non lisible** par nos outils. Selon un [guide tiers](https://cryptomarkets.tools/guides/exchange-api-terms) qui cite les CGU archivées de 2023 (§III.1.b), sans accord écrit sont interdits notamment les « Data feeding or streaming services » et les « websites/apps/services that charge for or otherwise profit from » ces données (**non vérifié** en source primaire). | **PRIMAIRE** pour le pari flash, le cache de prix et la clôture (en secours) |
| **Binance WebSocket** | `wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker` ; `wss://data-stream.binance.vision/stream?streams=btcusdt@miniTicker` | 13:09:24Z : 4 messages en 5 s (2 flux), `{"stream":"btcusdt@miniTicker","data":{"e":"24hrMiniTicker",…,"c":"63920.00000000"…`. 13:09:39Z (data-stream) : 3 messages en 5 s. | Non | miniTicker et kline_1s : une mise à jour toutes les 1 000 ms ([doc WS](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)). Limites de connexion **non vérifiées** (page tronquée). | ≈1 s | Oui. Navigateur : oui, une WebSocket n'est pas soumise au CORS. | Idem Binance REST | **PRIMAIRE** pour le live navigateur (maquette non commerciale) |
| **Coinbase Exchange REST** | `GET https://api.exchange.coinbase.com/products/BTC-USD/ticker` ; `…/products/BTC-USD/trades?limit=1000` ; `…/candles?granularity=60` | **200**, 13:00:42Z : `{"ask":"63834.28","bid":"63834.27",…,"price":"63834.28",…,"time":"2026-11-19T13:00:42.378813861Z"}`, ACAO `*`. | Non | 10 requêtes/s/IP, rafales jusqu'à 15 ([doc](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits)) | Temps réel. Bougies : 60 s minimum. `/trades` : pagination par identifiant de trade uniquement. | Oui | [Market Data Terms](https://www.coinbase.com/legal/market_data) : page **403** pour client automatisé (non contourné). Extraits obtenus via moteur de recherche : interdit de « Redistribute, display, or disseminate the Market Data… to any third party outside of your organization » et d'utiliser les données « as a benchmark » sans accord écrit (**partiellement vérifié**). La [doc Exchange](https://docs.cdp.coinbase.com/exchange/introduction/welcome) (lue) précise que l'accès à l'API vaut acceptation de ces conditions. | **SECOURS** serveur. **REJETÉ** pour l'affichage. |
| **Coinbase Advanced Trade, endpoints publics `/market/`** | `GET https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/ticker?limit=100&start=<T-30>&end=<T+1>` ; `…/candles?granularity=ONE_MINUTE&start=…&end=…` | **200**, 13:00:49Z : `{"trades":[{"trade_id":"1136703858","product_id":"BTC-USD","price":"63828.4",…`. Pas d'ACAO. `cache-control: public, max-age=14400` observé. | Non | REST : 10 req/s/IP selon des sources tierces (**non vérifié**). WS : 8 connexions/s et 8 messages non authentifiés/s par IP ([doc](https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-rate-limits)). | Temps réel. Historique de trades d'au moins 365 j, à la µs (testé). | Oui. Navigateur : non (pas de CORS). | Mêmes Market Data Terms présumés (**non vérifié** pour Advanced) | **SECOURS n°1** pour le pari flash et la clôture |
| **Coinbase WebSocket** | `wss://ws-feed.exchange.coinbase.com` (ticker BTC-USD) ; `wss://advanced-trade-ws.coinbase.com` (ticker, sans JWT) | 13:09:55Z : 46 messages en 5 s, `{"type":"ticker",…,"product_id":"BTC-USD","price":"63840.87"…`. Advanced 13:10:01Z : 25 messages. | Non (ticker) | Advanced : 8 connexions/s/IP (même doc) | Temps réel | Oui | CGU affichage : voir ci-dessus | **REJETÉ** pour le navigateur (CGU) |
| **Kraken REST** | `GET https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD` ; `…/Trades?pair=XBTUSD&since=<T-30>&count=1000` ; `…/OHLC?pair=ETHUSD&interval=1440` | **200**, 13:00:57Z : `{"error":[],"result":{"XETHZUSD":{"a":["1807.12000","6","6.000"],…`, ACAO = origine renvoyée. | Non | « Calling the public endpoints at a frequency of 1 per second (or less) would remain within the rate limits ». Trades et OHLC sont limités par IP **et** par paire ([support](https://support.kraken.com/articles/206548367)). | Temps réel. OHLC 1 min limité aux 720 dernières bougies (observé). `Trades` : au moins 365 j (testé). | Oui | [Terms of Service](https://www.kraken.com/legal/global-terms), mis à jour le 18/11/2026, §9 : interdit de « resell, transfer, assign, distribute or otherwise commercially exploit or make available to any third party Our Content », de « develop any third-party applications that interact with Our Content without our prior written consent », et le scraping. Aucune clause propre aux données de marché ou à l'API (zone grise). | **SECOURS** (clôture USD, pari flash en dernier recours) |
| **Kraken WS v2** | `wss://ws.kraken.com/v2` + `{"method":"subscribe","params":{"channel":"ticker","symbol":["BTC/USD"]}}` | 13:10:07Z : 15 messages en 5 s, `{"channel":"ticker","type":"snapshot","data":[{"symbol":"BTC/USD","bid":63865.4,…` | Non | **non vérifié** | Temps réel (`event_trigger: trades`) | Oui | Idem Kraken REST | **SECOURS** pour le live navigateur |
| **Bitstamp** | `GET https://www.bitstamp.net/api/v2/ticker/btcusd/` ; `…/transactions/btcusd/?time=minute` ; `…/ohlc/ethusd/?step=60&start=<ts>&limit=1` ; WS `wss://ws.bitstamp.net` (`live_trades_btcusd`) | **200**, 13:01:09Z : `{"timestamp":"1795093268",…,"last":"63835.42",…`. ACAO `*` sur transactions et OHLC, absent sur ticker. WS 13:10:19Z : 2 messages en 5 s. | Non | **non vérifié** (sources tierces : 400 req/s, 8 000 à 10 000 req/10 min) | Temps réel. `transactions` couvre seulement la dernière minute, heure ou journée, à la seconde. OHLC 60 s disponible au moins 1 an (testé). | Oui | [terms-of-use](https://www.bitstamp.net/terms-of-use/) vide pour nos outils (rendue en JS) : **non vérifié** | **SECOURS** pour la clôture USD. **REJETÉ** pour le pari flash (liquidité). |
| **OKX** | `GET https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT&bar=1s&after=<(T+1)*1000>&limit=1` ; `…/market/candles?bar=1s` ; WS `wss://ws.okx.com:8443/ws/v5/public` | **200**, 13:01:15Z (ticker) : `{"code":"0","data":[{"instType":"SPOT","instId":"BTC-USDT","last":"63876.3"…`, ACAO = origine renvoyée. WS 13:10:13Z : 27 messages, avec l'avis « WebSocket port 8443 will be retired soon. Please migrate to port 443. » | Non | **non vérifié** (doc trop longue ; source tierce : 40 req/2 s pour `candles`) | Temps réel. Bougies 1 s disponibles à 30 j mais pas à 365 j (testé). | Oui | [OKX API Agreement](https://www.okx.com/help/okx-api-agreement), mis à jour le 28/07/2026, §9.4 : Market Data « solely for your own personal, non-commercial trading and account management purposes ». Interdit de « resell, redistribute, publish, display, or otherwise make Market Data available to any third party ». « Public access does not grant any right to redistribute… » | **PRIMAIRE n°2** pour le pari flash (serveur uniquement, CGU à valider). **REJETÉ** pour le navigateur. |
| **Gate** | `GET https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT` ; `…/spot/candlesticks?currency_pair=BTC_USDT&interval=10s&from=<t>&to=<t>` ; `…/spot/trades?currency_pair=BTC_USDT&from=<T-20>&to=<T>&limit=1000` ; WS `wss://api.gateio.ws/ws/v4/` | **200**, 13:01:23Z : `[{"currency_pair":"BTC_USDT","last":"63879.1",…`, `x-gate-ratelimit-limit: 200`, ACAO `*`. WS 13:10:25Z : environ 1 message/s. | Non | « 200r/10s per endpoint », par IP, pour tous les endpoints publics ([doc](https://www.gate.com/docs/developers/apiv4/en/)) | Temps réel. Bougies 10 s limitées à environ 27,8 h ; trades limités à 30 j (messages d'erreur de l'API, voir §4). | Oui | **non trouvées** (non vérifié) | **PRIMAIRE n°3** pour le pari flash |
| **Bitfinex** | `GET https://api-pub.bitfinex.com/v2/ticker/tBTCUSD` ; `…/v2/trades/tBTCUSD/hist?start=…&end=…&limit=1&sort=-1` ; WS `wss://api-pub.bitfinex.com/ws/2` | **200**, 13:01:32Z : `[63861,3.23998078,63870,…]`. Pas d'ACAO. WS OK. | Non | 10 à 90 req/min selon l'endpoint ; blocage IP de 60 s ; WS 20 connexions/min et 25 canaux par connexion ([doc](https://docs.bitfinex.com/docs/requirements-and-limitations)) | Temps réel. Trades : au moins 365 j (testé). | Oui | **non vérifié** | **DERNIER RECOURS** (historique). BNB absent. Son « USD » cote au niveau de l'USDT. |
| **Gemini** | `GET https://api.gemini.com/v1/pubticker/btcusd` ; `…/v1/trades/btcusd?timestamp=<ts>` | **200**, 13:01:37Z : `{"bid":"63794.99000","ask":"63795.00000","last":"63812.03000"…`. Historique : **400** `"HistoricalDataNotAvailable"… earliest available historical datetime 2026-08-21 13:08:38` (soit 90 j). | Non | **non vérifié** | Temps réel, mais peu de trades (dernier trade BTC 21 s avant T) | Oui | **non vérifié** | **REJETÉ** (ADA et TON absents, liquidité faible) |
| **KuCoin** | `GET https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT` ; WS via `POST https://api.kucoin.com/api/v1/bullet-public` | **200**, 13:02:41Z : `{"code":"200000","data":{"time":1795093356877,…,"price":"63851"…`, `gw-ratelimit-limit: 2000`, pas d'ACAO. Jeton WS sans clé, puis 37 messages en 5 s. | Non | `gw-ratelimit-limit: 2000` observé (fenêtre de temps non vérifiée) | Temps réel. Bougies 1 min minimum. | Oui | **non vérifié** | **REJETÉ** (pas d'historique à la seconde, `TON-USDT` renvoie `data:null`) |
| **Bybit** | `GET https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT` ; WS `wss://stream.bybit.com/v5/public/spot` | **200**, 13:02:47Z : `{"retCode":0,"retMsg":"OK",…"lastPrice":"63847.4"…`. WS : 11 messages en 5 s. | Non | **non vérifié** | Temps réel. Bougies 1 min minimum. | Oui depuis notre IP | Selon un guide tiers, les CGU API (§6.6) interdisent l'usage « for any similar benchmarking purposes » (**non vérifié**) | **REJETÉ** (`TONUSDT` : « Not supported symbols », pas d'historique à la seconde) |
| **CoinGecko sans clé** | `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,binancecoin,dogecoin,cardano,avalanche-2,chainlink,the-open-network&vs_currencies=usd&include_last_updated_at=true` | **200**, 13:01:56Z : `{"bitcoin":{"usd":63827,"last_updated_at":1795093296},…`, `cache-control: max-age=30, … s-maxage=60`, ACAO `*`. | Non | « roughly 5 calls per minute » ; « All keyless requests share an IP-based rate pool » ; « not recommended for production environments » ([doc keyless](https://docs.coingecko.com/docs/keyless-public-api)). Historique ≤ 365 j (erreur 10012 observée). | 20 à 60 s (dernière mise à jour 20 s avant l'appel ; cache CDN de 60 s) | Oui, mais le quota est partagé par IP, donc risque de 429 sur des IP cloud partagées (inférence) | Attribution exigée ([guide d'attribution](https://brand.coingecko.com/resources/attribution-guide)). [API Terms](https://www.coingecko.com/en/api_terms) du 5/9/2025 : §4.3 « Powered by CoinGecko » ; §6.1.1 « refresh the cache at least every 24 hours » ; §6.2 interdit de « duplicate, reproduce, copy, store… any Data » ; §4.1.6 interdit de revendre ou redistribuer l'accès à l'API. | **DERNIER RECOURS** (développement, secours) |
| **CoinGecko Demo** (clé gratuite) | `GET https://api.coingecko.com/api/v3/ping?x_cg_demo_api_key=INVALID-NO-KEY` ; `GET https://pro-api.coingecko.com/api/v3/ping` | **401**, 13:02:07Z : `{"status":{…"error_code":10002,"error_message":"API Key Missing. Please make sure you're using the right authentication method…`. pro-api : **401** `{"status":{"error_code":10002,"error_message":"API Key Missing"}}`, 13:02:04Z. | Oui (gratuite), en-tête `x-cg-demo-api-key` | 10 000 appels/mois, 100 appels/min, données « from 60 sec », historique journalier et horaire sur 1 an, points 5 min sur 1 jour. Licence commerciale à partir de Basic (35 $/mois) ([pricing](https://www.coingecko.com/en/api/pricing)). | ≥ 60 s | Oui (clé côté serveur, recommandé par la [doc](https://docs.coingecko.com/demo/reference/authentication)) | Attribution exigée, mêmes API Terms | **PRIMAIRE** pour le classement (d) et le cache d'affichage sans risque CGU |
| **CoinMarketCap Basic** | `GET https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=10` | **401**, 13:03:00Z : `{"status":{…"error_code":1002,"error_message":"API key missing.",…}}` | Oui (gratuite), en-tête `X-CMC_PRO_API_KEY` | 15 000 crédits/mois, 50 req/min, mise à jour toutes les 15 s, historique : intraday 1 mois, cotations et classements quotidiens 1 an ([pricing](https://coinmarketcap.com/api/pricing/)). Historique non testé. | 15 s | Serveur uniquement (« direct requests from client-side JavaScript is not supported », [FAQ](https://coinmarketcap.com/api/faq/)) | Licence commerciale incluse : 1 produit, jusqu'à 100 000 utilisateurs, pas de redistribution comme service autonome (page pricing). Page [Terms](https://coinmarketcap.com/api/terms/) en 404 : attribution **non vérifiée**. | **SECOURS** pour le classement et l'affichage |
| **CoinPaprika** | `GET https://api.coinpaprika.com/v1/tickers/btc-bitcoin` ; `…/v1/tickers/eth-ethereum/historical?start=2026-11-18&interval=1h` | **200**, 13:02:10Z : `{"id":"btc-bitcoin",…,"rank":1,…,"last_updated":"2026-11-19T13:01:13Z","quotes":{"USD":{"price":63833.95…`, `ratelimit-limit: 20000`. Historique : **402** « Getting hourly historical data before 2026-11-18 13:02:14 … is not allowed in this plan ». | Non | 20 000 appels/mois/IP, 10 req/s/IP, mise à jour « within 10 minutes », 1 an de prix quotidiens, horaire sur 24 h ([pricing](https://coinpaprika.com/api/pricing/)) | ≤ 10 min | Oui | Gratuit = « Personal use only. Commercial use starts with Starter », avec mention « Powered by CoinPaprika » | **REJETÉ** en production (usage personnel). Contrôle croisé en développement. |
| **CoinCap** | `GET https://api.coincap.io/v2/assets?limit=2` ; `GET https://rest.coincap.io/v3/assets?limit=2` ; WS `wss://ws.coincap.io/prices?assets=bitcoin` et `wss://wss.coincap.io/prices?assets=bitcoin` | v2 : **échec DNS** `ENOTFOUND`, 13:02:16Z. v3 : **401** `{"error":"Unauthorized"}`, 13:02:18Z. WS : `{"error":"Unauthorized: API key is required"}`. | Oui | 500 crédits/mois, 5 req/min ; WebSocket à partir du plan Growth ([splash.coincap.io](https://splash.coincap.io/)) | n/a | n/a | n/a | **REJETÉ** |
| **CoinLore** | `GET https://api.coinlore.net/api/tickers/?start=0&limit=10` | **200**, 13:02:21Z : `{"data":[{"id":"90","symbol":"BTC",…,"rank":1,"price_usd":"63895.60"…`, ACAO `*` | Non | Pas de limite stricte, environ 1 req/s recommandé ([page API](https://www.coinlore.com/cryptocurrency-data-api)) | **non vérifié** | Oui | [ToS](https://www.coinlore.com/terms-of-use) du 21/12/2025 : §6 « copying, redistributing, or commercial use of content is prohibited without our express written consent » ; §4 interdit les bots et le scraping | **REJETÉ** en production. Contrôle croisé en développement. |
| **CoinDesk Data / CryptoCompare** | `GET https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD` ; `GET https://data-api.coindesk.com/index/cc/v1/latest/tick?market=cadli&instruments=BTC-USD` | **401**, 13:02:51Z : « API key required, please refer to the documentation at https://developers.coindesk.com/ » (même réponse pour les deux) | Oui | **non vérifié** | n/a | n/a | **non vérifié** | **REJETÉ** |
| **Pyth (Hermes / Benchmarks)** | `GET https://hermes.pyth.network/v2/price_feeds?asset_type=crypto` ; `GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=e62df6c8…5b43&parsed=true` ; `GET https://benchmarks.pyth.network/v1/updates/price/<T>?ids=…` | Métadonnées : **200** (429 flux crypto, les 10 actifs présents). Prix : **401** `unauthorized`, 13:08:40Z. Benchmarks : **401**. | Oui désormais | Compte gratuit « Pyth Terminal » puis « View your API key » ([doc](https://docs.pyth.network/price-feeds/pro/acquire-api-key)). Limites **non vérifiées**. | (≈ 1 s selon le produit, **non vérifié**) | Probablement (non testé) | **non vérifié** | **À ÉVALUER** (oracle agrégé, possible 4e source indépendante) |
| **DefiLlama coins** | `GET https://coins.llama.fi/prices/current/coingecko:bitcoin,coingecko:ethereum` ; `…/prices/historical/<ts>/coingecko:ethereum?searchWidth=600` | **200**, 13:02:57Z : `{"coins":{"coingecko:bitcoin":{"price":63772.27325,"symbol":"BTC","timestamp":1795093376,"confidence":0.999}…`. Historique : point à 5 s près. | Non | **non vérifié** | ≈ temps réel | Oui | **non vérifié**. Indépendance vis-à-vis de CoinGecko non vérifiée (identifiants `coingecko:`). | **DERNIER RECOURS** (c) |
| **Messari** | `GET https://data.messari.io/api/v1/assets/btc/metrics/market-data` | **404**, corps vide, 13:03:01Z | n/a | n/a | n/a | n/a | n/a | **REJETÉ** |

Note : `https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT` répond aussi 200 (13:00:40Z), mais Binance.US est une entité distincte réservée aux résidents US ; elle n'a pas été retenue.

---

## 3. Couverture des 10 actifs, et le cas TON / GRAM

Constaté entre 13:00 et 13:05Z à partir des listes de paires (une requête de liste par plateforme), puis vérifié par les prix à 13:23Z.

| Actif | Binance (USDT) | OKX (USDT) | Gate (USDT) | Coinbase (USD) | Kraken (USD) | Bitstamp (USD) | Bitfinex (USD) | Gemini (USD) | Pyth |
|---|---|---|---|---|---|---|---|---|---|
| BTC, ETH, SOL, XRP, DOGE, AVAX, LINK | oui | oui | oui | oui | oui (BTC=`XBTUSD`, DOGE=`XDGUSD`) | oui | oui | oui | oui |
| BNB | oui | oui | oui | oui | oui | oui | **non** | oui | oui |
| ADA | oui | oui | oui | oui | oui | oui | oui | **non** | oui |
| TON | `TONUSDT` en **BREAK**, utiliser `GRAMUSDT` | `TON-USDT` « doesn't exist », utiliser `GRAM-USDT` | « currency TON is delisted », utiliser `GRAM_USDT` | `TON-USD` (pas de GRAM) | `TONUSD` (pas de GRAM) | `GRAM/USD` (pas de TON) | `TONUSD` | GRAM seulement | `TON/USD` et `GRAM/USD` |

- CoinGecko (`/search?query=toncoin`, 13:03:46Z) : `"id":"the-open-network","name":"Gram (prev. Toncoin)","symbol":"GRAM","market_cap_rank":31`.
- Binance `TONUSDT` : `status=BREAK` (13:04:24Z) ; ses dernières bougies journalières datent du 28 au 30/06/2026, autour de 1,60 $. La valeur 1,60 renvoyée par `ticker/price` est donc un prix **figé**, alors que CoinGecko donne 1,026 $.
- Prix à 13:23Z : `GRAMUSDT` 1,029 (Binance), 1,030 (OKX), 1,0291 (Gate) ; `TON-USD` 1,0295 (Coinbase) ; `TONUSD` 1,029 (Kraken). C'est bien le même actif.
- KuCoin `TON-USDT` renvoie `data:null` et Bybit `TONUSDT` « Not supported symbols ».
- **Décision produit à prendre** :
  - (a) garder l'actif sous le nom « GRAM (ex-TON) » avec une table de correspondance par plateforme ;
  - (b) le remplacer par **LTC**, listé sur toutes les plateformes testées (Binance, OKX, Gate, Coinbase, Kraken, Bitstamp, Bitfinex, Gemini, Pyth) et disponible dans le pack de logos CC0 ;
  - HYPE (10e capitalisation sur CoinGecko) est listé partout aussi, mais son logo manque dans le pack CC0.

---

## 4. Historique à la seconde (besoin b)

### 4.1 Profondeur d'historique (BTC, testée à 13:04–13:08Z)

Définition retenue : **prix à la seconde T = dernier prix échangé avant T+1 s**, c'est-à-dire la clôture de la bougie 1 s qui commence à T.

| Source / méthode | Résolution | T−90 s | T−1 j | T−7 j | T−30 j | T−365 j | Limite constatée |
|---|---|---|---|---|---|---|---|
| Binance `GET /api/v3/klines?interval=1s&startTime&endTime` (data-api) | bougie 1 s exacte | OK | OK | OK | OK | OK | aucune jusqu'à 1 an |
| Binance `GET /api/v3/aggTrades?startTime&endTime` | ms | OK | OK | OK | OK | OK | ≥ 1 an |
| OKX `GET /api/v5/market/history-candles?bar=1s&after=` | 1 s | OK | OK | OK | OK | **vide** (`"data":[]`) | entre 30 j et 1 an |
| OKX `GET /api/v5/market/history-trades?type=2&after=` | ms | OK | OK | OK | OK | **vide** | entre 30 j et 1 an |
| Gate `GET /api/v4/spot/candlesticks?interval=10s&from&to` | 10 s | OK | OK | **400** | 400 | 400 | « Candlestick too long ago. Maximum 10000 points ago are allowed », soit 10 000 × 10 s ≈ **27,8 h** |
| Gate `GET /api/v4/spot/trades?from&to` | ms | OK | OK | OK | **400** | 400 | « for public trades older than 30 days, download from historical data instead » |
| Kraken `GET /0/public/Trades?since=<s>&count=1000` | ns | OK | OK | OK | OK | OK | ≥ 1 an |
| Bitfinex `GET /v2/trades/tBTCUSD/hist?start&end&sort=-1` | ms | OK | OK | OK | OK | OK | ≥ 1 an |
| Coinbase Advanced `GET …/market/products/BTC-USD/ticker?start&end&limit=100` | µs | OK | OK | OK | OK | OK | ≥ 1 an |
| Coinbase Exchange `GET /products/BTC-USD/trades?limit=1000` | pagination par `trade_id` | **non** : la 1re page (1 000 trades BTC) ne remonte pas jusqu'à T−90 s, mesuré environ 3 min plus tard | – | – | – | – | inutilisable par date (page AVAX : environ 67 min) |
| Gemini `GET /v1/trades/btcusd?timestamp=` | ms | OK (trade 21 s avant T) | OK | OK | **non** (réponse hors fenêtre) | **400** | ≤ 90 j (message de l'API) |
| Bitstamp `GET /api/v2/transactions/btcusd/?time=hour` | s | OK | – | – | – | – | dernière minute, heure ou journée seulement |
| Pyth Benchmarks et Hermes | – | **401** | 401 | 401 | 401 | 401 | clé requise |
| CoinGecko `market_chart/range` | 5 min (plage ≤ 1 j) | – | – | – | – | 401 (sans clé, > 365 j) | pas à la seconde |
| CoinPaprika (gratuit) | horaire | – | **402** | – | – | – | 24 h seulement |

### 4.2 Même seconde, plusieurs sources (BTC à T−90 s = 2026-11-19T13:04:43Z)

- **Plateformes en USDT** : Binance 63 814,01 ; OKX 63 814,6 ; Gate 63 815,7 (trade à 13:04:41.148).
- **Plateformes en USD** : Coinbase 63 745,19 ; Kraken 63 742,6 ; Bitstamp 63 748,72.
- **Autres** : Bitfinex « USD » 63 810 ; Gemini 63 779,77 (trade 21 s avant T).
- **Écart structurel USDT / USD d'environ 0,11 %.** À T−365 j (2025-11-19T13:06:13Z) : Binance 91 614,97 ; Kraken 91 567,7 ; Coinbase 91 552,36 ; Bitfinex 91 799.

### 4.3 Disponibilité juste après T (requêtes envoyées à T+3 s)

- Binance et OKX : la bougie 1 s de T est déjà servie.
- Coinbase : un trade à 13:11:52.112 pour T = 13:11:52.
- Kraken : un trade 1,25 s avant la fin de T.
- Bitfinex : dernier trade 4,5 s avant ; Bitstamp : 6 s avant.
- Gate : la bougie 10 s en cours n'est pas close, donc utiliser l'endpoint `trades` pour une seconde exacte.
- Binance et OKX **remplissent les secondes sans trade** (volume 0, clôture reprise de la seconde précédente). Exemple Binance : 300 bougies 1 s renvoyées, 248 avec trades. Pour juger de la fraîcheur, regarder le nombre de trades (`trades`) ou le volume.

### 4.4 Fraîcheur réelle sur les 10 actifs

Âge du dernier trade avant T, sur une fenêtre de 60 s, mesuré une seule fois à 13:23Z (une seule mesure, à confirmer sur 24 h). Prix entre parenthèses.

| Actif | Binance | OKX | Coinbase | Kraken | Gate | Bitstamp |
|---|---|---|---|---|---|---|
| BTC | 1,0 s (63 766) | 0,0 s | 0,1 s (63 693) | 2,6 s | 1,1 s | 8,0 s |
| ETH | 0,0 s | 1,0 s | 0,3 s | 3,0 s | 1,3 s | 2,0 s |
| SOL | 2,0 s | 0,0 s | 0,8 s | 6,4 s | 2,5 s | 9,0 s |
| XRP | 2,0 s | 4,0 s | 4,0 s | 2,5 s | 2,1 s | 17,0 s |
| BNB | 1,0 s | 2,0 s | **41,6 s** | **26,1 s** | 2,7 s | **> 60 s** |
| DOGE | 7,0 s | 8,0 s | 8,2 s | **27,5 s** | 1,4 s | 7,0 s |
| ADA | 0,0 s | **> 60 s** | **26,0 s** | **19,6 s** | 2,8 s | 0,0 s |
| AVAX | 0,0 s | 9,0 s | 9,6 s | **24,3 s** | 3,5 s | **> 60 s** |
| LINK | 3,0 s | 1,0 s | 2,5 s | **26,3 s** | 3,5 s | **> 60 s** |
| TON/GRAM | 2,0 s | 7,0 s | **18,9 s** | **32,3 s** | 4,4 s | **> 60 s** |

Conclusion : pour des manches de 45 s, seules **Binance, Gate et OKX** donnent un prix frais (moins de 10 s) sur presque tous les actifs. Exception : ADA sur OKX. Coinbase convient aux grandes capitalisations. Kraken, Bitstamp et Bitfinex (AVAX à 112 s, mesuré à 13:11Z) sont trop peu liquides sur les altcoins.

### 4.5 Règle de règlement proposée

1. `P_source(T)` = clôture de la bougie 1 s qui commence à T (Binance, OKX), ou prix du dernier trade horodaté avant T+1 s (Gate, Coinbase, Kraken, Bitfinex).
2. Une source est **valide** si son dernier trade réel a au plus 10 s (paramètre à régler).
3. **Mêmes sources aux deux bornes** de la manche. Résultat = signe de (moyenne des `P_fin` − moyenne des `P_début`), ce qui revient à la moyenne des écarts par source : l'écart USDT/USD, constant sur 45 s, s'annule. Une source invalide à une borne est retirée des deux bornes.
4. Au moins **2 sources valides**, sinon la manche est annulée et les mises rendues.
5. Interrogation à T_fin+5 s, puis nouvelles tentatives à +15 s, +60 s et +10 min. Les données restent disponibles longtemps : Binance au moins 1 an, OKX au moins 30 j, Gate 30 j (trades).
6. Nombre d'appels par manche : Binance 1 (klines 1 s de T_début−10 s à T_fin, `limit` ≤ 1000), OKX 1 (`history-candles` 1 s, `after`=T_fin+1 s, `limit=60` ; `limit=300` a été accepté sur `/market/candles`), Gate 1 à 2 (`trades` de T_début−10 à T_fin : environ 85 trades BTC en 20 s observés, ce qui tient dans `limit=1000`).

---

## 5. Clôture journalière à une heure donnée (besoin c)

Test sur ETH, bougie 1 min du **2026-11-18 à 23:59 UTC** (clôture = prix à 23:59:59.999), appels à 13:19–13:20Z :

| Source | Appel | Résultat |
|---|---|---|
| Binance | `GET https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT&interval=1m&startTime=1795046340000&limit=1` | **200**, clôture 1 777,19 (USDT). Bougie 1 s de 23:59:59 : volume 0, clôture reprise 1 777,19. |
| Coinbase | `GET https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=60&start=2026-11-18T23:59:00.000Z&end=2026-11-19T00:00:00.000Z` | **200**, `[1795046340,1774.21,1775.32,1775.32,1774.64,…]`, clôture **1 774,64** |
| Bitstamp | `GET https://www.bitstamp.net/api/v2/ohlc/ethusd/?step=60&start=1795046340&limit=1` | **200**, clôture **1 774,10** |
| Kraken | `GET https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&since=1795046280` | **200**, mais la 1re bougie est à 01:19Z : seules les 720 dernières minutes sont servies, 23:59 n'est déjà plus disponible. Bougie journalière (`interval=1440`) du 18/11 : clôture **1 774,77**. `Trades?since=1795046370` renvoie bien les trades de 23:59:30 et après. |
| CoinGecko sans clé | `GET https://api.coingecko.com/api/v3/coins/ethereum/market_chart/range?vs_currency=usd&from=1795045440&to=1795047240` | **200**, points toutes les 5 min, point 00:00:00Z = 1 775,10 |
| CoinPaprika | `GET https://api.coinpaprika.com/v1/coins/eth-ethereum/ohlcv/latest` | **200**, clôture du 18/11 (`time_close` 23:59:59Z) = 1 777,43 |
| 1 an avant | Coinbase Advanced `…/market/products/ETH-USD/candles?granularity=ONE_MINUTE&start=1763510340&end=1763510400` ; Bitstamp `…/ohlc/ethusd/?step=60&start=1763510340&limit=1` | **200** : 3 121,74 (Coinbase) et 3 121,73 (Bitstamp). CoinGecko sans clé au-delà de 365 j : **401** `error_code 10012`. |

Moyenne USD (Coinbase, Bitstamp, Kraken journalier) ≈ 1 774,50, contre 1 777,19 sur Binance en USDT (+0,15 %). Pour un marché « au-dessus de 6 000 $ », **la référence doit être en USD et écrite dans les règles** (sources et bougie).

---

## 6. Classement par capitalisation (besoin d)

| Rang | CoinGecko `coins/markets` (13:01:58Z) | CoinLore `tickers` (13:02:21Z) |
|---|---|---|
| 1 | BTC | BTC |
| 2 | ETH (220,6 Md$) | ETH (220,9 Md$) |
| 3 | USDT (175,1 Md$) | USDT (183,1 Md$) |
| 4–8 | BNB, USDC, XRP, SOL, TRX | BNB, USDC, XRP, SOL, TRX |
| 9 | **FIGR_HELOC** (`figure-heloc`, actif du monde réel tokenisé) | HYPE |
| 10 | HYPE | **STETH** (ETH « staké », jeton dérivé) |

- Les méthodes diffèrent : prise en compte des actifs réels tokenisés et des jetons dérivés, capitalisation de l'USDT à 175 ou 183 Md$. Les règles du marché doivent donc fixer **la source, l'horodatage exact et les exclusions** : stablecoins, jetons « wrapped » ou « staked », actifs réels tokenisés.
- Historique disponible :
  - CoinGecko `/coins/{id}/history?date=jj-mm-aaaa` donne un instantané à 00:00 UTC (testé sans clé les 18 et 19/11/2026 : 200). La version Demo offre 1 an d'historique journalier (page pricing).
  - CoinMarketCap Basic annonce 1 an de « daily rankings » (page pricing, non testé faute de clé).

---

## 7. Logos (besoin e)

| Source | URL testée | Résultat (13:17Z) | Licence / conditions | Verdict |
|---|---|---|---|---|
| **Trust Wallet assets** | `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png`. Chemins : `ethereum`, `solana`, `ripple`, `binance`, `doge`, `cardano`, `avalanchec`, `ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA` (LINK), `ton` + `/info/logo.png` | **200** pour les **10/10**, `image/png`, ACAO `*` | Dépôt sous licence **MIT** (`GET https://api.github.com/repos/trustwallet/assets/license` : `spdx_id: MIT`). Maintenu (dernier push le 2026-11-19T12:19:44Z). | **PRIMAIRE** (copie locale) |
| **spothq/cryptocurrency-icons** (npm 0.18.1, via jsDelivr) | `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/btc.svg` (et eth, sol, xrp, bnb, doge, ada, avax, link, ton, hype, ltc, trx) | **200** `image/svg+xml` pour btc, eth, sol, xrp, bnb, doge, ada, avax, link, ltc, trx ; **404** pour **ton** et **hype** | **CC0-1.0** (API GitHub, `LICENSE.md`). Dernier push le 2024-08-19, donc pas à jour (pas de TON ni de HYPE). | **SECOURS** (SVG, 9/10) |
| CoinGecko (CDN) | `https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400` (URL `image` renvoyée par `/coins/markets`) | **200** `image/png`, ACAO `*` | Les API Terms ne disent rien des logos des cryptomonnaies (seule la marque CoinGecko est encadrée, §4.4). Le nouveau logo GRAM s'y trouve (`Gram_Circular_Badge.png`). | Utile en développement ; pas de lien direct en production |
| CoinMarketCap (CDN) | `https://s2.coinmarketcap.com/static/img/coins/64x64/1.png` | **200**, ACAO `*` | Conditions **non vérifiées** (page Terms en 404) | REJETÉ |
| CoinCap | `https://assets.coincap.io/assets/icons/btc@2x.png` | **200**, pas d'ACAO | **non vérifié** ; service désormais payant ou à clé | REJETÉ |
| CoinPaprika | `https://static.coinpaprika.com/coin/btc-bitcoin/logo.png` | **200** | Offre gratuite limitée à un usage personnel | REJETÉ |
| cryptologos.cc | `https://cryptologos.cc/logos/bitcoin-btc-logo.svg` | **200** `image/svg+xml`, ACAO `*` | **non vérifié** | REJETÉ (conditions inconnues) |

Recommandation logos :
- **Copier une fois** les fichiers dans le site statique ou dans Supabase Storage, sans lien direct vers un CDN tiers.
- Prendre Trust Wallet pour les 10 actifs, ou spothq en SVG pour 9 actifs plus Trust Wallet pour TON/GRAM.
- Conserver les fichiers `LICENSE` : la licence MIT exige de reproduire la notice, par exemple sur une page « Crédits ».
- Le logo TON/GRAM a changé (voir CoinGecko) : à revérifier.
- Point juridique général, non vérifié projet par projet : MIT et CC0 couvrent les fichiers du dépôt, pas les droits de marque des projets. Une utilisation pour identifier l'actif est l'usage courant ; à valider si le site devient commercial.

---

## 8. Recommandation

### 8.1 Par besoin

| Besoin | Primaire | Secours | Dernier recours |
|---|---|---|---|
| (a) Prix live dans le navigateur | Binance WS : `wss://data-stream.binance.vision/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker/solusdt@miniTicker/xrpusdt@miniTicker/bnbusdt@miniTicker/dogeusdt@miniTicker/adausdt@miniTicker/avaxusdt@miniTicker/linkusdt@miniTicker/gramusdt@miniTicker` | Kraken WS v2 `wss://ws.kraken.com/v2`, canal `ticker`, 10 paires USD dont `TON/USD`. Le symbole DOGE en v2 est à vérifier (v1 = `XDG/USD`). Bascule automatique si Binance ne répond pas en 5 s (cas des visiteurs US). | Table Supabase `crypto_prices` (cache serveur, voir 8.3), interrogée toutes les 30 s par le navigateur. Variante **sans risque CGU** : n'afficher que des prix CoinGecko Demo, avec « Data provided by CoinGecko » et une mise à jour d'au moins 60 s. |
| (b) Prix à la seconde, pari flash (moyenne de 3) | **Binance** (klines 1 s) + **OKX** (bougies 1 s) + **Gate** (trades à la ms), toutes en USDT | Coinbase Advanced (`/market/…/ticker?start&end`, USD) ; la règle « mêmes sources aux deux bornes » neutralise l'écart USD/USDT | Kraken `Trades since` (USD), puis Bitfinex `trades/hist`. Annulation si moins de 2 sources valides. |
| (c) Clôture à 23:59 | Moyenne **Coinbase** (candles 60 s) + **Kraken** (`Trades since`, dernier trade avant 00:00:00, à lire avant 12 h sinon via trades) + **Bitstamp** (OHLC `step=60`), en USD | Binance klines 1 min (USDT), signalé comme tel | CoinGecko Demo (point 5 min au plus tard à 00:00), puis DefiLlama `prices/historical` |
| (d) Classement par capitalisation | Instantané **CoinGecko Demo** `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50` à l'heure de résolution (par ex. 31/12 à 23:59:00Z), plus un second à 00:00:30Z | **CoinMarketCap Basic** `/v1/cryptocurrency/listings/latest` au même moment | CoinGecko `/coins/{id}/history?date=01-01-2027` (00:00 UTC) pour les candidats ; CoinLore seulement en contrôle (CGU) |
| (e) Logos | Trust Wallet assets (MIT), copie locale | spothq cryptocurrency-icons (CC0, SVG) | CDN CoinGecko (développement uniquement) |

**Les 3 sources à moyenner pour le pari flash : Binance + OKX + Gate.** Ce trio réunit à la fois la seconde exacte, la meilleure liquidité sur les 10 actifs (section 4.4) et une même devise de cotation (USDT). Réserve : les CGU d'OKX interdisent explicitement tout usage non personnel (§9.4). Si l'équipe écarte OKX, prendre **Binance + Gate + Coinbase** ; mais Coinbase interdit l'usage « as a benchmark » (extrait non vérifié en page directe). Aucune bourse lue n'autorise clairement ce type d'usage. Pour une maquette sans argent réel, on retient le trio techniquement le plus fiable et on consigne ce choix dans `docs/PLAN.md`.

### 8.2 Intégration Supabase

- Créer le projet dans une **région UE** et forcer la région des Edge Functions avec l'en-tête `x-region: eu-west-3` (ou `eu-central-1`), ou le paramètre de requête `forceFunctionRegion` dont la syntaxe exacte reste à vérifier ([doc](https://supabase.com/docs/guides/functions/regional-invocation)). Par défaut, une fonction s'exécute « in the region closest to the user making the request », ce qui expose au blocage Binance des IP US (non vérifié).
- pg_cron : « Jobs can run anywhere from every second to once a year ». Recommandation : « no more than 8 Jobs run concurrently », chaque tâche durant moins de 10 min ([doc](https://supabase.com/docs/guides/cron)).
- Offre gratuite ([pricing](https://supabase.com/pricing)) : 500 000 invocations d'Edge Functions/mois ; 2 M messages Realtime/mois et 200 connexions simultanées ; base de 500 Mo ; 5 Go de trafic sortant ; **projet mis en pause après une semaine d'inactivité**. Il n'a pas été vérifié si des tâches cron comptent comme une activité.
- Les clés (CoinGecko Demo, CoinMarketCap) restent **uniquement côté serveur**, dans les secrets Supabase. Les deux fournisseurs déconseillent ou ne prennent pas en charge l'appel depuis le navigateur.

### 8.3 Fréquences de rafraîchissement et calculs

Hypothèse : **une seule tâche pg_cron `crypto-tick` toutes les 15 s**, qui appelle une Edge Function. Celle-ci règle les manches terminées depuis au moins 5 s, rafraîchit le cache de prix une fois sur deux (30 s) et CoinGecko une fois sur 40 (10 min). Pire cas pour les paris : 10 actifs × 1 manche/min (45 s de jeu + 15 s de pause) = 10 règlements/min. Mois de 30 jours = 43 200 min.

| Source | Usage | Fréquence | Calcul | Marge |
|---|---|---|---|---|
| Supabase Edge Functions | `crypto-tick` | toutes les 15 s | 4/min × 1 440 × 30 = **172 800/mois** | 35 % des 500 000 |
| Binance (REST) | cache `ticker/price` 10 symboles (poids 4) + règlement klines 1 s (poids 2) | 30 s + 10/min | 2 × 4 + 10 × 2 = **28 de poids/min** | 0,5 % de 6 000/min |
| OKX | règlement (1 appel/manche) | 10/min | 10/min ; limite non vérifiée (source tierce : 40/2 s = 1 200/min) | environ 0,8 % (non vérifié) |
| Gate | règlement (1 à 2 appels/manche) | ≤ 20/min | 20/min, contre 200/10 s/endpoint = 1 200/min | ≤ 1,7 % |
| Kraken | cache `Ticker` 10 paires en 1 appel ; règlement en secours | 30 s ; ≤ 20/min en secours | 2/min = 0,033 req/s ; en secours +0,33 req/s, soit 0,37 req/s | 3 % en temps normal, 37 % de la cadence conseillée (1 req/s) en secours |
| Coinbase Advanced (secours) | règlement, 2 appels/manche | ≤ 20/min | 0,33 req/s, contre 10 req/s | 3,3 % |
| CoinGecko Demo | `/coins/markets` (prix, capitalisation, rang, image), 1 appel pour 50 actifs ; contrôle de clôture 10 appels/jour ; instantanés de classement | 10 min | 144/j × 30 = 4 320 + 300 + environ 10 = **≈ 4 630/mois** ; au plus 1 appel/min | 46 % des 10 000 ; 1 % des 100/min |
| CoinMarketCap Basic | `listings/latest?limit=20` | toutes les heures, plus les instantanés de résolution | 24 × 30 = **720 appels/mois** ; coût en crédits par appel non vérifié (1 crédit supposé) | environ 5 % des 15 000 |
| Clôture (Coinbase, Kraken, Bitstamp) | bougie 23:59 pour 10 actifs | 00:00:30Z, nouvelles tentatives à 00:05 et 01:00 | 10 × 3 = 30 appels/jour par passage | négligeable |
| WebSocket navigateur | live | push | 0 appel serveur | – |

- **Stockage** (estimation, non vérifiée) : dans le pire cas, 10 manches/min × 2 bornes × 3 sources = 86 400 lignes brutes/jour. À environ 150 o par ligne, cela fait environ 13 Mo/jour, donc les 500 Mo seraient atteints en environ 38 jours. Deux parades : purger les données brutes au-delà de 14 jours, ou stocker une seule ligne par borne avec un champ `jsonb` regroupant les 3 sources.
- **Sans clé CoinGecko** (pool sans clé) : au plus 1 appel/10 min, et des erreurs 429 sont à prévoir sur une IP cloud partagée. D'où la clé Demo.

---

## 9. Comptes gratuits à créer

Aucun compte n'a été créé et aucune adresse e-mail saisie. Les étapes ci-dessous viennent des pages citées ; le détail exact des écrans n'a pas été vérifié.

1. **CoinGecko Demo, recommandé** (classement, cache d'affichage sans risque CGU, contrôle des clôtures)
   - Page : https://www.coingecko.com/en/api/pricing, bouton « Start for Free » ou « Start with our Demo Plan » (« No credit card required »).
   - Étapes : créer le compte, puis aller sur le Developer Dashboard (https://www.coingecko.com/en/developers/dashboard) et cliquer « + Add New Key » ([doc](https://docs.coingecko.com/docs/setting-up-your-api-key)).
   - Utilisation : en-tête **`x-cg-demo-api-key`**, base `https://api.coingecko.com/api/v3/`. Le paramètre `x_cg_demo_api_key` existe mais est déconseillé, car il expose la clé dans les journaux ([doc](https://docs.coingecko.com/demo/reference/authentication)).
   - Secret Supabase : **`COINGECKO_API_KEY`** (`supabase secrets set COINGECKO_API_KEY=…`, lu avec `Deno.env.get('COINGECKO_API_KEY')`).
   - Obligation : afficher « Data provided by CoinGecko » (lien vers coingecko.com) près des données.
2. **CoinMarketCap Basic, conseillé en secours** (classement ; licence commerciale incluse)
   - Page : https://pro.coinmarketcap.com/signup ; la clé se trouve ensuite dans le portail développeur (écran non vérifié).
   - Utilisation : en-tête **`X-CMC_PRO_API_KEY`**, base `https://pro-api.coinmarketcap.com` ([doc](https://coinmarketcap.com/api/documentation/guides/authentication)). Jamais depuis le navigateur.
   - Secret Supabase : **`CMC_API_KEY`**.
3. **Pyth, optionnel, à évaluer avant d'en dépendre** (oracle agrégé, prix horodatés, possible 4e source indépendante)
   - Page : la doc https://docs.pyth.network/price-feeds/pro/acquire-api-key indique « Sign up for a free Pyth Terminal account », puis « View your API key » ; le lien de la doc pointe vers app.pyth.com. Quotas et CGU non vérifiés.
   - Secret Supabase : **`PYTH_API_KEY`**.
- **Comptes inutiles** : CoinCap (500 crédits/mois, 5 req/min, pas de WS en gratuit), CoinDesk/CryptoCompare (offre gratuite non vérifiée), CoinPaprika (pas de clé nécessaire, mais usage personnel seulement).

---

## 10. Points non vérifiés et limites

- Blocage des IP US par Binance (451), OKX, Bybit et Gate : pas d'IP US pour tester.
- CGU de Binance (page en JavaScript), Coinbase (403 : seuls des extraits via moteur de recherche et un guide tiers ont été lus), Bitstamp, Gate, Bitfinex, Gemini, KuCoin, DefiLlama et Pyth : non lues en source primaire. CoinMarketCap : page Terms en 404.
- Limites de débit d'OKX, Bitstamp, Gemini, Kraken WS et Binance WS (connexions) : non vérifiées.
- Mesure de liquidité (4.4) : une seule mesure à 13:23Z, à refaire sur 24 h (heures creuses et week-end) avant de figer le seuil de 10 s.
- Coût en crédits d'un appel `listings/latest` CoinMarketCap et accès réel des comptes gratuits (Demo, Basic) aux endpoints historiques : à confirmer une fois les clés créées.
