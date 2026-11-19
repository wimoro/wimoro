// Lecteurs des sources de données : une réponse déjà décodée (JSON, ou texte pour un CSV) → des cotations.
//
//   lire(corps, symboles) → { <actif>: { p, st } }
//     symboles : { <actif>: <symbole chez la source> } pour les actifs demandés dans cet appel ;
//     p : prix (nombre > 0) ; st : heure de la cotation chez la source, en millisecondes (null : inconnue — la base prendra
//     alors l'heure de son écriture).
// Module pur : aucun appel réseau, aucune horloge. Une réponse d'un format inattendu lève une erreur (code « format ») : la
// source compte alors comme en échec et la cascade passe à la suivante. Testé sur des réponses enregistrées
// (tests/fixtures/donnees/, tests/donnees-lecteurs.spec.mjs).
//
// Convention des devises : un symbole « 1/EUR » veut dire « inverse du taux reçu » (la source donne des EUR pour 1 USD ;
// EUR/USD = 1 / taux). « JPY » se prend tel quel (USD/JPY).

export function erreurFormat(source, quoi) {
  const e = new Error(`format ${source} : ${quoi}`);
  e.code = 'format';
  return e;
}
/** nombre strictement positif et fini, à partir d'un nombre ou d'un texte ; sinon null */
export function nombre(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
const heure = v => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) && t > 0 ? t : null; };
const jourUtc = j => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j) ? Date.parse(j + 'T00:00:00Z') : null);
/** taux reçu → cours, selon la convention « 1/X » */
function taux(symbole, valeur) {
  const v = nombre(valeur);
  if (v === null) return null;
  return symbole.startsWith('1/') ? 1 / v : v;
}
const cleTaux = s => s.replace(/^1\//, '');

// ── Places crypto ────────────────────────────────────────────────────────────────────────────────

/** Binance, /api/v3/ticker/price?symbols=[…] : [{ symbol, price }] (pas d'heure : celle de l'appel) */
export function binanceTicker(corps, symboles) {
  if (!Array.isArray(corps)) throw erreurFormat('binance', 'liste attendue');
  const par = new Map(corps.filter(x => x && typeof x.symbol === 'string').map(x => [x.symbol, x.price]));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) { const p = nombre(par.get(s)); if (p) out[a] = { p, st: null }; }
  return out;
}

/** Kraken, /0/public/Ticker?pair=… : { error: [], result: { XXBTZUSD: { c: [dernier, volume] } } }.
 *  Kraken renomme certaines paires dans sa réponse (XBTUSD → XXBTZUSD) : on ramène « X…Z… » à la forme demandée. */
export function krakenTicker(corps, symboles) {
  if (!corps || !Array.isArray(corps.error) || typeof corps.result !== 'object' || corps.result === null) throw erreurFormat('kraken', 'réponse inattendue');
  if (corps.error.length) throw erreurFormat('kraken', String(corps.error[0]));
  const norm = k => (k.length === 8 && k[0] === 'X' && k[4] === 'Z' ? k.slice(1, 4) + k.slice(5) : k);
  const par = new Map(Object.entries(corps.result).map(([k, v]) => [norm(k), v]));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) { const v = par.get(s) || par.get(norm(s)); const p = v && Array.isArray(v.c) ? nombre(v.c[0]) : null; if (p) out[a] = { p, st: null }; }
  return out;
}

/** Coinbase, /v2/exchange-rates?currency=USD : { data: { currency: 'USD', rates: { BTC: '0.0000158' } } } → 1 / taux */
export function coinbaseRates(corps, symboles) {
  const r = corps && corps.data && corps.data.rates;
  if (!r || typeof r !== 'object' || corps.data.currency !== 'USD') throw erreurFormat('coinbase', 'taux en USD attendus');
  const out = {};
  for (const [a, s] of Object.entries(symboles)) { const t = nombre(r[s]); if (t) out[a] = { p: 1 / t, st: null }; }
  return out;
}

/** CoinGecko, /simple/price?ids=…&vs_currencies=usd&include_last_updated_at=true : { bitcoin: { usd, last_updated_at } } */
export function coingeckoSimple(corps, symboles) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) throw erreurFormat('coingecko', 'objet attendu');
  if (corps.status && corps.status.error_code) throw erreurFormat('coingecko', String(corps.status.error_message || corps.status.error_code));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) {
    const v = corps[s]; const p = v ? nombre(v.usd) : null;
    if (p) out[a] = { p, st: v.last_updated_at ? v.last_updated_at * 1000 : null };
  }
  return out;
}

// ── Actions et indices ───────────────────────────────────────────────────────────────────────────

/** Finnhub, /api/v1/quote?symbol=… : { c, d, dp, h, l, o, pc, t } (c = 0 pour un symbole inconnu) */
export function finnhubQuote(corps, symboles) {
  if (!corps || typeof corps !== 'object') throw erreurFormat('finnhub', 'objet attendu');
  if (corps.error) throw erreurFormat('finnhub', String(corps.error));
  const out = {}, p = nombre(corps.c);
  for (const a of Object.keys(symboles)) if (p) out[a] = { p, st: nombre(corps.t) ? corps.t * 1000 : null };
  return out;
}

/** Yahoo, /v8/finance/spark?symbols=…&range=1d&interval=5m : { NVDA: { timestamp: […], close: […] } } — dernier point non vide.
 *  L'heure du dernier point est celle de la dernière cotation (US en temps réel, Europe 15 min, Tokyo 20 à 30 min). */
export function yahooSpark(corps, symboles) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) throw erreurFormat('yahoo', 'objet attendu');
  if (corps.spark && corps.spark.error) throw erreurFormat('yahoo', String(corps.spark.error.description || corps.spark.error.code));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) {
    const v = corps[s];
    if (!v || !Array.isArray(v.close)) continue;
    let i = v.close.length - 1;
    while (i >= 0 && nombre(v.close[i]) === null) i--;
    if (i < 0) continue;
    const ts = Array.isArray(v.timestamp) ? v.timestamp[i] : null;
    out[a] = { p: nombre(v.close[i]), st: nombre(ts) ? ts * 1000 : null };
  }
  return out;
}

/** EODHD, /api/real-time/<code>?s=…&fmt=json : un objet { code, timestamp, close } ou une liste d'objets ; « NA » s'il n'y a rien */
export function eodhdRealtime(corps, symboles) {
  const liste = Array.isArray(corps) ? corps : corps && typeof corps === 'object' ? [corps] : null;
  if (!liste) throw erreurFormat('eodhd', 'objet ou liste attendu');
  const par = new Map(liste.filter(x => x && typeof x.code === 'string').map(x => [x.code, x]));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) {
    const v = par.get(s); const p = v ? nombre(v.close) : null;
    if (p) out[a] = { p, st: nombre(v.timestamp) ? v.timestamp * 1000 : null };
  }
  return out;
}

/** Twelve Data, /market_state : [{ code: 'XNYS', is_market_open: true }] → { XNYS: true } (contrôle des calendriers, pas un cours) */
export function twelvedataMarketState(corps) {
  const liste = Array.isArray(corps) ? corps : corps && Array.isArray(corps.data) ? corps.data : null;
  if (!liste) throw erreurFormat('twelvedata', String(corps && (corps.message || corps.status) || 'liste attendue'));
  const out = {};
  for (const x of liste) if (x && typeof x.code === 'string' && typeof x.is_market_open === 'boolean') out[x.code] = x.is_market_open;
  return out;
}

// ── Or, argent, devises, pétrole ────────────────────────────────────────────────────────────────

/** gold-api.com, /price/XAU : { symbol: 'XAU', price, updatedAt } (un nouveau prix toutes les 30 s) */
export function goldApi(corps, symboles) {
  if (!corps || typeof corps !== 'object' || typeof corps.symbol !== 'string') throw erreurFormat('goldapi', 'objet avec un symbole attendu');
  const out = {};
  for (const [a, s] of Object.entries(symboles)) if (corps.symbol === s && nombre(corps.price)) out[a] = { p: nombre(corps.price), st: heure(corps.updatedAt) };
  return out;
}

/** goldprice.dev, /v1/prices?symbol=XAU-USD-SPOT : { symbols: [{ symbol: 'XAU', price: '3678.91', computed_at }] } */
export function goldpriceDev(corps, symboles) {
  if (!corps || !Array.isArray(corps.symbols)) throw erreurFormat('goldprice', 'liste « symbols » attendue');
  const par = new Map(corps.symbols.filter(x => x && typeof x.symbol === 'string').map(x => [x.symbol, x]));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) { const v = par.get(s); const p = v ? nombre(v.price) : null; if (p) out[a] = { p, st: heure(v.computed_at) }; }
  return out;
}

/** fawazahmed0 currency-api, /v1/currencies/usd.json : { date, usd: { eur, jpy, xau… } } (unités pour 1 USD ; une valeur par jour) */
export function fawazRates(corps, symboles) {
  if (!corps || !corps.usd || typeof corps.usd !== 'object') throw erreurFormat('fawaz', 'taux « usd » attendus');
  const st = jourUtc(corps.date), out = {};
  for (const [a, s] of Object.entries(symboles)) { const p = taux(s, corps.usd[cleTaux(s)]); if (p) out[a] = { p, st }; }
  return out;
}

/** exchangerate.dev, /v1/latest/USD?symbols=… : { result: 'success', base: 'USD', rates: { EUR }, data_updated_at } (15 min de retard) */
export function exchangerateDev(corps, symboles) {
  if (!corps || corps.result !== 'success' || corps.base !== 'USD' || !corps.rates) throw erreurFormat('exchangerate', String(corps && (corps['error-type'] || corps.error) || 'réponse inattendue'));
  const st = heure(corps.data_updated_at) ?? heure(corps.timestamp), out = {};
  for (const [a, s] of Object.entries(symboles)) {
    if (corps.stale && corps.stale[cleTaux(s)] === true) continue;                    // taux signalé périmé par la source
    const p = taux(s, corps.rates[cleTaux(s)]); if (p) out[a] = { p, st };
  }
  return out;
}

/** Frankfurter (taux de la BCE), /v1/latest?base=USD&symbols=… : { base: 'USD', date, rates: { EUR } } (une valeur par jour ouvré) */
export function frankfurter(corps, symboles) {
  if (!corps || corps.base !== 'USD' || !corps.rates) throw erreurFormat('frankfurter', 'taux en USD attendus');
  const st = jourUtc(corps.date), out = {};
  for (const [a, s] of Object.entries(symboles)) { const p = taux(s, corps.rates[cleTaux(s)]); if (p) out[a] = { p, st }; }
  return out;
}

/** EIA v2, /petroleum/pri/spt/data : { response: { data: [{ period: '2026-11-17', series: 'RWTC', value: 89.53 }] } } — la plus récente */
export function eiaSpot(corps, symboles) {
  const data = corps && corps.response && corps.response.data;
  if (!Array.isArray(data)) throw erreurFormat('eia', String(corps && corps.error || 'liste « response.data » attendue'));
  const out = {};
  for (const [a, s] of Object.entries(symboles)) {
    let meilleur = null;
    for (const x of data) if (x && x.series === s && nombre(x.value) && jourUtc(x.period) && (!meilleur || x.period > meilleur.period)) meilleur = x;
    if (meilleur) out[a] = { p: nombre(meilleur.value), st: jourUtc(meilleur.period) };
  }
  return out;
}

/** FRED, /graph/fredgraph.csv?id=DCOILWTICO : « observation_date,DCOILWTICO » puis « 2026-11-17,89.53 » (« . » : pas de valeur) */
export function fredCsv(texte, symboles) {
  if (typeof texte !== 'string' || !/^observation_date,|^DATE,/i.test(texte.trim())) throw erreurFormat('fred', 'CSV attendu');
  const lignes = texte.trim().split(/\r?\n/), entete = lignes[0].split(','), out = {};
  for (const [a, s] of Object.entries(symboles)) {
    const col = entete.indexOf(s);
    if (col < 1) continue;
    for (let i = lignes.length - 1; i >= 1; i--) {
      const c = lignes[i].split(','), p = nombre(c[col]);
      if (p && jourUtc(c[0])) { out[a] = { p, st: jourUtc(c[0]) }; break; }
    }
  }
  return out;
}

// ── Pari éclair : le prix d'une seconde précise T (frontière de manche) ──────────────────────────
// Chaque lecteur rend { p } : le dernier prix échangé avant T + 1 s, s'il y a eu un échange réel dans les 10 secondes
// avant T + 1 s ; sinon null (source « périmée » pour cette seconde, retirée des deux bouts de la manche).
const FRAIS_MS = 10000;

/** Binance, /api/v3/klines?interval=1s&startTime=T-9000&limit=10 : [[ouverture, o, h, l, clôture, volume, fin, …, transactions, …]] */
export function binanceKlines1s(corps, T) {
  if (!Array.isArray(corps)) throw erreurFormat('binance', 'liste de bougies attendue');
  const b = corps.find(k => Array.isArray(k) && k[0] === T);
  if (!b || nombre(b[4]) === null) return null;
  const vivantes = corps.filter(k => Array.isArray(k) && k[0] <= T && k[0] > T + 1000 - FRAIS_MS && Number(k[8]) > 0);
  return vivantes.length ? { p: nombre(b[4]) } : null;
}

/** OKX, /api/v5/market/candles?bar=1s&after=T+1000&limit=10 : { code: '0', data: [[ts, o, h, l, c, vol, …]] } (récentes d'abord) */
export function okxCandles1s(corps, T) {
  if (!corps || corps.code !== '0' || !Array.isArray(corps.data)) throw erreurFormat('okx', String(corps && corps.msg || 'réponse inattendue'));
  const b = corps.data.find(k => Array.isArray(k) && Number(k[0]) === T);
  if (!b || nombre(b[4]) === null) return null;
  const vivantes = corps.data.filter(k => Array.isArray(k) && Number(k[0]) <= T && Number(k[0]) > T + 1000 - FRAIS_MS && Number(k[5]) > 0);
  return vivantes.length ? { p: nombre(b[4]) } : null;
}

/** Gate, /api/v4/spot/trades?from=T/1000-10&to=T/1000+1 : [{ create_time_ms: '1795106340449.7', price }] */
export function gateTrades(corps, T) {
  if (!Array.isArray(corps)) throw erreurFormat('gate', String(corps && (corps.message || corps.label) || 'liste attendue'));
  let meilleur = null;
  for (const x of corps) {
    const t = Number(x && x.create_time_ms);
    if (Number.isFinite(t) && t < T + 1000 && t >= T + 1000 - FRAIS_MS && nombre(x.price) && (!meilleur || t > meilleur.t)) meilleur = { t, p: nombre(x.price) };
  }
  return meilleur ? { p: meilleur.p } : null;
}

/** Coinbase Advanced (public), /market/products/BTC-USD/ticker?start&end : { trades: [{ price, time: ISO }] } (cours en USD) */
export function coinbaseTrades(corps, T) {
  if (!corps || !Array.isArray(corps.trades)) throw erreurFormat('coinbase', 'liste « trades » attendue');
  let meilleur = null;
  for (const x of corps.trades) {
    const t = heure(x && x.time);
    if (t !== null && t < T + 1000 && t >= T + 1000 - FRAIS_MS && nombre(x.price) && (!meilleur || t > meilleur.t)) meilleur = { t, p: nombre(x.price) };
  }
  return meilleur ? { p: meilleur.p } : null;
}

/** Finnhub /quote lu juste après T : prix gardé si la dernière transaction (t, en secondes) a moins de 15 s */
export function finnhubAu(corps, T) {
  if (!corps || typeof corps !== 'object') throw erreurFormat('finnhub', 'objet attendu');
  const p = nombre(corps.c), t = nombre(corps.t);
  if (!p || !t) return null;
  return Math.abs(t * 1000 - T) <= 15000 ? { p } : null;
}
