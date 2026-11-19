// Enregistre de vraies réponses des sources de données, pour les tests des lecteurs (tests/donnees-*.spec.mjs).
//
// Les tests n'appellent JAMAIS une vraie API : ils lisent ces réponses enregistrées. Cet outil ne sert qu'à les
// renouveler, à la main, si une source change de format :   node tools/donnees-enregistrer.mjs tests/fixtures/donnees
// Il n'appelle que des adresses publiques sans clé, ou les clés « demo » officielles qu'EODHD et Twelve Data donnent dans
// leur documentation, avec l'identifiant honnête de Wimoro (jamais celui d'un navigateur). Une vingtaine d'appels en tout.
// Les sources à clé (Finnhub, EIA, exchangerate.dev avec clé…) ont leurs réponses d'exemple écrites d'après leur
// documentation, dans le même dossier (fichiers *_doc.json).
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) { console.error('usage : node tools/donnees-enregistrer.mjs <dossier de sortie>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const UA = 'WimoroBot/1.0 (https://wimoro.com)';
const FEPOCH = Date.UTC(2026, 10, 1), FDUR = 45000;
// une frontière de manche éclair passée d'au moins 6 secondes : toutes les sources ont déjà la seconde demandée
const now = Date.now();
let r = Math.floor((now - FEPOCH) / FDUR) + 1; let T = FEPOCH + (r - 1) * FDUR;
if (now - T < 6000) { r -= 1; T -= FDUR; }
const S = Math.floor(T / 1000);
const enc = encodeURIComponent;
const cibles = [
  ['binance_ticker.json', 'https://data-api.binance.vision/api/v3/ticker/price?symbols=' + enc(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT']))],
  ['kraken_ticker.json', 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,XRPUSD,BNBUSD,XDGUSD,ADAUSD,AVAXUSD,LINKUSD,LTCUSD'],
  ['coinbase_rates.json', 'https://api.coinbase.com/v2/exchange-rates?currency=USD'],
  ['coingecko_simple.json', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,binancecoin,dogecoin,cardano,avalanche-2,chainlink,litecoin&vs_currencies=usd&include_last_updated_at=true'],
  ['yahoo_spark.json', 'https://query1.finance.yahoo.com/v8/finance/spark?symbols=' + ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', '^GSPC', '^NDX', '^DJI', '^FCHI', '^GDAXI', '^N225', 'MC.PA', 'ASML.AS', 'TTE.PA'].map(enc).join(',') + '&range=1d&interval=5m'],
  ['eodhd_realtime.json', 'https://eodhd.com/api/real-time/AAPL.US?api_token=demo&fmt=json'],
  ['twelvedata_market_state.json', 'https://api.twelvedata.com/market_state?apikey=demo'],
  ['goldapi_xau.json', 'https://api.gold-api.com/price/XAU'],
  ['goldapi_xag.json', 'https://api.gold-api.com/price/XAG'],
  ['goldprice_xau.json', 'https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT'],
  ['fawaz_usd.json', 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'],
  ['exchangerate_dev.json', 'https://api.exchangerate.dev/v1/latest/USD?symbols=EUR,GBP,JPY,ILS,CHF'],
  ['frankfurter.json', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,ILS,CHF'],
  ['fred_wti.csv', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILWTICO&cosd=2026-10-20'],
  ['fred_brent.csv', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU&cosd=2026-10-20'],
  // pari éclair : la même seconde T chez les quatre sources de fixation
  ['binance_klines_1s.json', `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1s&startTime=${T - 9000}&limit=10`],
  ['okx_candles_1s.json', `https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1s&after=${T + 1000}&limit=10`],
  ['gate_trades.json', `https://api.gateio.ws/api/v4/spot/trades?currency_pair=BTC_USDT&from=${S - 10}&to=${S + 1}&limit=1000`],
  ['coinbase_trades.json', `https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/ticker?limit=100&start=${S - 10}&end=${S + 1}`],
];
const journal = { enregistre_le: new Date().toISOString(), frontiere_ms: T, manche: r, ua: UA, appels: [] };
for (const [nom, url] of cibles) {
  const t0 = Date.now();
  try {
    const rep = await fetch(url, { headers: { 'User-Agent': UA, Accept: nom.endsWith('.csv') ? 'text/csv' : 'application/json' }, signal: AbortSignal.timeout(12000) });
    const texte = await rep.text();
    fs.writeFileSync(path.join(OUT, nom), texte);
    journal.appels.push({ nom, url, statut: rep.status, octets: texte.length, ms: Date.now() - t0 });
    console.log(rep.status, nom, texte.length);
  } catch (e) {
    journal.appels.push({ nom, url, erreur: String(e && e.message || e), ms: Date.now() - t0 });
    console.log('ERREUR', nom, e && e.message);
  }
  await new Promise(ok => setTimeout(ok, 400));
}
fs.writeFileSync(path.join(OUT, '_journal.json'), JSON.stringify(journal, null, 2) + '\n');
