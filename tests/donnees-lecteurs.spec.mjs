// Lecteurs des sources de données (supabase/functions/donnees/lecteurs.js), testés sur de VRAIES réponses enregistrées le
// 19 nov. 2026 (tests/fixtures/donnees/, outil tools/donnees-enregistrer.mjs) ; Finnhub et l'EIA, qui demandent une clé, sur
// la forme de leur documentation (fichiers *_doc.json). Aucun test n'appelle le réseau : fetch est remplacé par une garde.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const appelsInterdits = [];
globalThis.fetch = async url => { appelsInterdits.push(String(url)); throw new Error('appel réseau interdit dans les tests : ' + url); };
const L = await import('../supabase/functions/donnees/lecteurs.js');

const F = 'tests/fixtures/donnees/';
const json = n => JSON.parse(fs.readFileSync(F + n, 'utf8'));
const texte = n => fs.readFileSync(F + n, 'utf8');
const T = json('_journal.json').frontiere_ms;                    // frontière de manche éclair enregistrée (2026-11-19 16:39:00 UTC)

test('garde : aucun test ne peut appeler le réseau, et les modules de la collecte n’appellent jamais fetch eux-mêmes', async () => {
  await expect(fetch('https://exemple.invalid/')).rejects.toThrow(/interdit/);
  appelsInterdits.length = 0;
  for (const f of ['lecteurs.js', 'cascade.js', 'fixations.js']) expect(fs.readFileSync('supabase/functions/donnees/' + f, 'utf8'), f).not.toMatch(/\bfetch\s*\(/);
  expect(T).toBe(Date.UTC(2026, 10, 19, 16, 39, 0));
});

test('places crypto : Binance, Kraken (paires renommées), Coinbase (taux inversés), CoinGecko (heure de la cotation)', () => {
  const sym = { btc: 'BTCUSDT', eth: 'ETHUSDT', doge: 'DOGEUSDT', ltc: 'LTCUSDT' };
  expect(L.binanceTicker(json('binance_ticker.json'), sym)).toEqual({ btc: { p: 63194.07, st: null }, eth: { p: 1782.92, st: null }, doge: { p: 0.05888, st: null }, ltc: { p: 43.48, st: null } });
  const k = L.krakenTicker(json('kraken_ticker.json'), { btc: 'XBTUSD', eth: 'ETHUSD', doge: 'XDGUSD', ada: 'ADAUSD', ltc: 'LTCUSD', xrp: 'XRPUSD' });
  expect(k.btc.p).toBe(63134.3); expect(k.ada.p).toBe(0.153107);
  expect(Object.keys(k).sort()).toEqual(['ada', 'btc', 'doge', 'eth', 'ltc', 'xrp']);
  const c = L.coinbaseRates(json('coinbase_rates.json'), { btc: 'BTC', eth: 'ETH', inconnu: 'ZZZ' });
  expect(c.btc.p).toBeCloseTo(1 / 0.0000158494354352, 6); expect(c.btc.p).toBeGreaterThan(62000); expect(c.btc.p).toBeLessThan(64000);
  expect(c).not.toHaveProperty('inconnu');
  expect(L.coingeckoSimple(json('coingecko_simple.json'), { btc: 'bitcoin', avax: 'avalanche-2' })).toEqual({ btc: { p: 63073, st: 1795106364000 }, avax: { p: 7, st: 1795106364000 } });
});

test('actions et indices : Yahoo (dernier point et son heure ; Europe et Tokyo différés), EODHD, Finnhub, Twelve Data', () => {
  const y = L.yahooSpark(json('yahoo_spark.json'), { nvda: 'NVDA', spy: 'SPY', spx: '^GSPC', cac: '^FCHI', n225: '^N225', mc: 'MC.PA', absent: 'NOPE' });
  expect(y.nvda).toEqual({ p: 153.506, st: Date.UTC(2026, 10, 19, 16, 39, 34) });
  expect(y.spx.p).toBe(7326); expect(y.spy.p).toBe(730.812);
  expect(y.cac.st).toBe(Date.UTC(2026, 10, 19, 16, 20)); expect(y.mc).toEqual({ p: 391.55, st: Date.UTC(2026, 10, 19, 16, 20) });   // 15 min de retard
  expect(y.n225).toEqual({ p: 59444.21, st: Date.UTC(2026, 10, 19, 6, 30) });                       // Tokyo fermé : dernière cotation du jour
  expect(y).not.toHaveProperty('absent');
  expect(L.eodhdRealtime(json('eodhd_realtime.json'), { aapl: 'AAPL.US' })).toEqual({ aapl: { p: 349.585, st: 1795105440000 } });
  expect(L.finnhubQuote(json('finnhub_quote_doc.json'), { nvda: 'NVDA' })).toEqual({ nvda: { p: 153.51, st: 1795106374000 } });
  expect(L.finnhubQuote({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }, { x: 'INCONNU' })).toEqual({});   // symbole inconnu chez Finnhub
  const m = L.twelvedataMarketState(json('twelvedata_market_state.json'));
  expect(m).toMatchObject({ XNYS: true, XNAS: true, XJPX: false, XPAR: true, XETR: true });
});

test('or, argent, devises, pétrole : gold-api, goldprice.dev, fawazahmed0, exchangerate.dev, Frankfurter, EIA, FRED', () => {
  expect(L.goldApi(json('goldapi_xau.json'), { xau: 'XAU' })).toEqual({ xau: { p: 3687.77002, st: Date.parse('2026-11-19T16:39:34Z') } });
  expect(L.goldApi(json('goldapi_xag.json'), { xau: 'XAU' })).toEqual({});                             // la réponse n'est pas celle demandée
  expect(L.goldApi(json('goldapi_xag.json'), { xag: 'XAG' }).xag.p).toBe(44.674999);
  expect(L.goldpriceDev(json('goldprice_xau.json'), { xau: 'XAU' })).toEqual({ xau: { p: 3678.91, st: Date.parse('2026-11-19T16:24:02.314959+00:00') } });
  const fz = L.fawazRates(json('fawaz_usd.json'), { eurusd: '1/eur', usdjpy: 'jpy', xau: '1/xau', xag: '1/xag' });
  expect(fz.eurusd.p).toBeCloseTo(1 / 0.91179755, 10); expect(fz.usdjpy.p).toBe(159.56568478);
  expect(fz.xau.p).toBeCloseTo(3728.87, 1); expect(fz.xau.st).toBe(Date.UTC(2026, 10, 19));            // une valeur par jour
  const ex = L.exchangerateDev(json('exchangerate_dev.json'), { eurusd: '1/EUR', gbpusd: '1/GBP', usdjpy: 'JPY', usdils: 'ILS', usdchf: 'CHF' });
  expect(ex.eurusd.p).toBeCloseTo(1 / 0.91081, 10); expect(ex.usdjpy).toEqual({ p: 159.835, st: Date.parse('2026-11-19T16:23:59Z') });
  expect(Object.keys(ex)).toHaveLength(5);
  const fr = L.frankfurter(json('frankfurter.json'), { eurusd: '1/EUR', usdils: 'ILS' });
  expect(fr.eurusd.p).toBeCloseTo(1 / 0.90975, 10); expect(fr.usdils).toEqual({ p: 3.2887, st: Date.UTC(2026, 10, 19) });
  expect(L.eiaSpot(json('eia_spot_doc.json'), { wti: 'RWTC', brent: 'RBRTE' })).toEqual({ wti: { p: 89.53, st: Date.UTC(2026, 10, 17) }, brent: { p: 92.94, st: Date.UTC(2026, 10, 17) } });
  expect(L.fredCsv(texte('fred_wti.csv'), { wti: 'DCOILWTICO' })).toEqual({ wti: { p: 89.53, st: Date.UTC(2026, 10, 17) } });
  expect(L.fredCsv('observation_date,DCOILBRENTEU\n2026-11-16,92.90\n2026-11-17,.\n', { brent: 'DCOILBRENTEU' })).toEqual({ brent: { p: 92.9, st: Date.UTC(2026, 10, 16) } });
});

test('pari éclair : le prix de la seconde T chez Binance, OKX, Gate et Coinbase, seulement s’il y a eu un vrai échange récent', () => {
  expect(L.binanceKlines1s(json('binance_klines_1s.json'), T)).toEqual({ p: 63180.68 });
  expect(L.okxCandles1s(json('okx_candles_1s.json'), T)).toEqual({ p: 63183 });
  expect(L.gateTrades(json('gate_trades.json'), T)).toEqual({ p: 63180 });
  expect(L.coinbaseTrades(json('coinbase_trades.json'), T)).toEqual({ p: 63110.54 });                 // en USD : 0,1 % sous l'USDT, comme prévu
  // une autre seconde que celle demandée : rien (la bougie T + 45 s n'est pas dans la réponse)
  expect(L.binanceKlines1s(json('binance_klines_1s.json'), T + 45000)).toBeNull();
  expect(L.gateTrades(json('gate_trades.json'), T + 45000)).toBeNull();
  // aucune transaction dans les 10 secondes : prix figé, source écartée pour cette seconde
  const morte = json('binance_klines_1s.json').map(k => { const c = [...k]; c[8] = 0; return c; });
  expect(L.binanceKlines1s(morte, T)).toBeNull();
  const okxMorte = json('okx_candles_1s.json'); okxMorte.data = okxMorte.data.map(k => { const c = [...k]; c[5] = '0'; return c; });
  expect(L.okxCandles1s(okxMorte, T)).toBeNull();
  expect(L.finnhubAu({ c: 153.5, t: T / 1000 - 2 }, T)).toEqual({ p: 153.5 });
  expect(L.finnhubAu({ c: 153.5, t: T / 1000 - 600 }, T)).toBeNull();                                 // dernière transaction trop vieille
});

test('réponse d’un format inattendu : erreur « format » (la source compte en échec, la cascade passe à la suivante)', () => {
  const cas = [
    () => L.binanceTicker({ code: -1121, msg: 'Invalid symbol.' }, { btc: 'BTCUSDT' }),
    () => L.krakenTicker({ error: ['EQuery:Unknown asset pair'], result: {} }, { btc: 'XBTUSD' }),
    () => L.coinbaseRates({ errors: [{ id: 'not_found' }] }, { btc: 'BTC' }),
    () => L.coingeckoSimple({ status: { error_code: 429, error_message: 'Rate limited' } }, { btc: 'bitcoin' }),
    () => L.yahooSpark({ spark: { result: null, error: { code: 'Not Found', description: 'No data found' } } }, { nvda: 'NVDA' }),
    () => L.finnhubQuote({ error: 'You don\'t have access to this resource.' }, { nvda: 'NVDA' }),
    () => L.exchangerateDev({ result: 'error', 'error-type': 'invalid-key' }, { eurusd: '1/EUR' }),
    () => L.eiaSpot({ error: 'API_KEY_MISSING' }, { wti: 'RWTC' }),
    () => L.fredCsv('<html>indisponible</html>', { wti: 'DCOILWTICO' }),
    () => L.goldpriceDev({ detail: 'rate limited' }, { xau: 'XAU' }),
    () => L.okxCandles1s({ code: '51001', msg: 'Instrument ID does not exist', data: [] }, T),
    () => L.gateTrades({ label: 'INVALID_CURRENCY', message: 'Invalid currency' }, T),
    () => L.twelvedataMarketState({ code: 401, message: '**apikey** parameter is incorrect', status: 'error' }),
  ];
  for (const f of cas) { let e = null; try { f(); } catch (x) { e = x; } expect(e && e.code, String(f)).toBe('format'); }
  expect(L.nombre('63180.5')).toBe(63180.5); expect(L.nombre('NA')).toBeNull(); expect(L.nombre(-1)).toBeNull(); expect(L.nombre('')).toBeNull();
  expect(appelsInterdits).toEqual([]);
});
