// Fixations du pari éclair de bout en bout : configuration lue en base (srv_donnees_config, srv_eclair_config),
// fixations.js avec un faux réseau qui sert les réponses ENREGISTRÉES le 19 nov. 2026 (bougies d'une seconde de Binance et
// d'OKX, transactions de Gate et de Coinbase), écriture par srv_eclair_fixer, lecture par api_fixations. Calendrier des
// essais (rattrapage d'une frontière manquée), secours, valeur aberrante, pauses, quotas, clé absente. Jamais de réseau.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { creerBase, enTantQue, q } from './base.mjs';

globalThis.fetch = async url => { throw new Error('appel réseau interdit dans les tests : ' + url); };
const C = await import('../../supabase/functions/donnees/cascade.js');
const X = await import('../../supabase/functions/donnees/fixations.js');
const ME = globalThis.MoteurEclair;                                             // chargé par fixations.js (copie conforme du moteur)

const F = 'tests/fixtures/donnees/';
const lu = n => JSON.parse(fs.readFileSync(F + n, 'utf8'));
const T0 = lu('_journal.json').frontiere_ms, M0 = ME.round(T0);                 // 2026-11-19 16:39:00 UTC, manche 35893
const ok = (corps, ms = 20) => ({ statut: 200, corps, ms });
const non = (statut, retryAfter = 0) => ({ statut, corps: null, ms: 9, retryAfter });

/** Les réponses enregistrées, déplacées à la frontière T (mêmes prix, mêmes écarts de temps). */
function enregistrees(T) {
  const d = T - T0;
  const binance = lu('binance_klines_1s.json').map(k => { const c = [...k]; c[0] += d; c[6] += d; return c; });
  const okx = lu('okx_candles_1s.json'); okx.data = okx.data.map(k => { const c = [...k]; c[0] = String(Number(c[0]) + d); return c; });
  const gate = lu('gate_trades.json').map(x => ({ ...x, create_time_ms: (Number(x.create_time_ms) + d).toFixed(3), create_time: String(Math.floor((Number(x.create_time_ms) + d) / 1000)) }));
  const coinbase = lu('coinbase_trades.json'); coinbase.trades = coinbase.trades.map(x => ({ ...x, time: new Date(Date.parse(x.time) + d).toISOString() }));
  return { binance, okx, gate, coinbase, finnhub: { ...lu('finnhub_quote_doc.json'), t: T / 1000 - 1 } };
}
/** Faux réseau : chaque appel est noté ; une adresse sans règle lève (aucun appel réel possible). */
function reseau(regles) {
  const appels = [];
  const chercher = async (url, o = {}) => {
    appels.push({ url, entetes: o.entetes || {} });
    for (const [re, rep] of regles) if (re.test(url)) return typeof rep === 'function' ? rep(url) : rep;
    throw new Error('adresse imprévue : ' + url);
  };
  chercher.appels = appels;
  chercher.hotes = () => appels.map(a => new URL(a.url).hostname);
  return chercher;
}
const NOMINAL = T => { const e = enregistrees(T); return [[/binance\.vision/, ok(e.binance)], [/okx\.com/, ok(e.okx)], [/gateio\.ws/, ok(e.gate)], [/coinbase\.com/, ok(e.coinbase)], [/finnhub\.io/, ok(e.finnhub)]]; };

let db, cfg, cfgE;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  db = await creerBase();
  cfg = (await q(db, 'select public.srv_donnees_config() as r'))[0].r;
  cfgE = (await q(db, 'select public.srv_eclair_config() as r'))[0].r;
});
test.afterAll(async () => { await db.close(); });
const etat = (cles = {}, now = T0) => C.etatInitial(cfg, cles, now);
const actif = id => cfgE.actifs.find(a => a.id === id);
const essai = (m, groupe, rang, final = false) => ({ m, T: ME.t0(m), groupe, rang, final });

test('garde, adresses et configuration : huit actifs fixés, les sources de la migration, la clé Finnhub seulement chez Finnhub', async () => {
  await expect(fetch('https://exemple.invalid/')).rejects.toThrow(/interdit/);
  expect(fs.readFileSync('supabase/functions/donnees/fixations.js', 'utf8')).not.toMatch(/\bfetch\s*\(/);
  expect(cfgE.actifs.map(a => a.id)).toEqual(['btc', 'doge', 'eth', 'nvda', 'qqq', 'sol', 'spy', 'tsla']);
  expect(actif('btc')).toMatchObject({ marche: 'CRYPTO', smin: 2, fixees: [] });
  expect(actif('btc').sources.map(s => s.src)).toEqual(['binance_eclair', 'okx_eclair', 'gate_eclair', 'coinbase_eclair']);
  expect(actif('spy')).toMatchObject({ marche: 'NYSE', smin: 1, sources: [{ src: 'finnhub_eclair', sym: 'SPY' }] });
  const T = T0, S = T / 1000;
  expect(Object.fromEntries(Object.entries(X.SOURCES_FIX).map(([k, v]) => [k, v.url(k === 'finnhub_eclair' ? 'NVDA' : 'BTC', T)]))).toEqual({
    binance_eclair: `https://data-api.binance.vision/api/v3/klines?symbol=BTC&interval=1s&startTime=${T - 9000}&limit=10`,
    okx_eclair: `https://www.okx.com/api/v5/market/candles?instId=BTC&bar=1s&after=${T + 1000}&limit=10`,
    gate_eclair: `https://api.gateio.ws/api/v4/spot/trades?currency_pair=BTC&from=${S - 10}&to=${S + 1}&limit=100`,
    coinbase_eclair: `https://api.coinbase.com/api/v3/brokerage/market/products/BTC/ticker?limit=100&start=${S - 10}&end=${S + 1}`,
    finnhub_eclair: 'https://finnhub.io/api/v1/quote?symbol=NVDA',
  });
  expect(X.SOURCES_FIX.finnhub_eclair.entetes('k')).toEqual({ 'X-Finnhub-Token': 'k' });
  for (const id of ['binance_eclair', 'okx_eclair', 'gate_eclair', 'coinbase_eclair']) expect(X.SOURCES_FIX[id].entetes).toBeUndefined();
});

test('calendrier d’une boucle de 55 s : la frontière de la minute pile (entre deux boucles) est rattrapée ; les essais après la fin attendent la boucle suivante', () => {
  // la boucle démarre 2 s après la frontière de 16:39:00 et s'arrête à 16:39:57 ; NYSE ouvert pour nvda, pas pour spy
  const c = { grace_s: 120, actifs: [{ ...actif('btc'), fixees: [M0 - 3, M0 - 2] }, { ...actif('nvda'), ouvert: true }, { ...actif('spy'), ouvert: false }] };
  const now = T0 + 2000, fin = T0 + 57000, cal = X.calendrier(c, now, fin);
  const vu = cal.map(e => [e.m - M0, e.groupe, (e.at - ME.t0(e.m)) / 1000, e.rang, e.final, e.actifs.join()]);
  expect(vu).toEqual([
    [-1, 'crypto', 2 + 45, 2, true, 'btc'],                                    // 16:38:15 pas fixée : un essai final tout de suite (historique)
    [0, 'crypto', 3, 0, false, 'btc'],
    [0, 'bourse', 4, 2, true, 'nvda'],                                          // cotation de 16:39:00 encore à 4 s : le dernier essai
    [0, 'crypto', 8, 1, false, 'btc'],
    [0, 'crypto', 15, 2, true, 'btc'],
    [1, 'bourse', 0.3, 0, false, 'nvda'], [1, 'bourse', 1.5, 1, false, 'nvda'], [1, 'crypto', 3, 0, false, 'btc'],
    [1, 'bourse', 4, 2, true, 'nvda'], [1, 'crypto', 8, 1, false, 'btc'],      // 16:39:45 + 15 s tombe après la fin : boucle suivante
  ]);                                                                           // (16:38:15 pour nvda : trop vieille pour une cotation)
  // la boucle suivante (16:40:02) rattrape 16:39:45 par un essai final ; une frontière au-delà du délai de grâce est laissée à la base
  const c2 = { grace_s: 120, actifs: [{ ...actif('btc'), fixees: [M0 - 1, M0] }] };
  expect(X.calendrier(c2, T0 + 62000, T0 + 117000).filter(e => e.m === M0 + 1).map(e => [e.rang, e.final, e.at])).toEqual([[2, true, T0 + 62000]]);
  const tard = X.calendrier({ grace_s: 120, actifs: [actif('btc')] }, T0 + 118000, T0 + 119000).map(e => e.m);
  expect(tard).toEqual([M0 + 1, M0 + 2]); expect(tard).not.toContain(M0);    // 16:39:00 à 2 s de la fin de son délai : à la base
});

test('essai nominal : Binance, OKX et Gate à la seconde de la frontière, rien chez Coinbase (secours inutile) ; écrit, lu par tous', async () => {
  const e = etat(), net = reseau(NOMINAL(T0)), acquis = {};
  const r = await X.essayer(e, essai(M0, 'crypto', 0), [actif('btc')], acquis, T0 + 3000, net);
  expect(net.hotes().sort()).toEqual(['api.gateio.ws', 'data-api.binance.vision', 'www.okx.com']);
  expect(r.ecrire).toEqual({ btc: { s: { binance_eclair: 63180.68, okx_eclair: 63183, gate_eclair: 63180 }, x: [], final: false } });
  expect(r.sources.map(s => [s.id, s.appels, s.ok, s.err]).sort()).toEqual([['binance_eclair', 1, 1, 0], ['gate_eclair', 1, 1, 0], ['okx_eclair', 1, 1, 0]]);
  for (const a of net.appels) expect(a.entetes).toEqual({});
  // la même chose à la frontière en cours, écrite en base : la fixation est la moyenne des trois, et chacun la lit pareil
  const m = ME.round(Date.now()), T = ME.t0(m);
  const r2 = await X.essayer(etat(), essai(m, 'crypto', 0), [actif('btc'), actif('eth')], {}, T + 3000, reseau(NOMINAL(T)));
  const w = (await q(db, 'select public.srv_eclair_fixer($1::jsonb) as r', [JSON.stringify({ manche: m, actifs: r2.ecrire })]))[0].r;
  expect(w.ecrits.sort()).toEqual(['btc', 'eth']);
  const f = (await q(db, 'select wm.eclair_fixation($1, $2) as r', ['btc', m]))[0].r;
  expect(f).toMatchObject({ e: 'ok', n: 3, s: r2.ecrire.btc.s });
  expect(f.p).toBeCloseTo(ME.composite(Object.entries(r2.ecrire.btc.s)).p, 9);
  const vu = (await enTantQue(db, null, s => s('select public.api_fixations($1, $2, $3) as r', ['btc', m, m])))[0].r;
  expect(vu.F[String(m)]).toEqual(f);
  expect((await q(db, 'select public.srv_eclair_config() as r'))[0].r.actifs.find(a => a.id === 'btc').fixees).toContain(m);
});

test('principale en panne : pause de 30 s, Coinbase en secours à l’essai suivant ; valeur aberrante écartée ; trois sources muettes → « absente »', async () => {
  const e = etat(), acquis = {}, regles = [[/binance\.vision/, non(503)], ...NOMINAL(T0)];
  const r1 = await X.essayer(e, essai(M0, 'crypto', 0), [actif('btc')], acquis, T0 + 3000, reseau(regles));
  expect(r1.ecrire).toEqual({});                                                // deux sources sur trois : on attend l'essai suivant
  expect(e.sources.binance_eclair.pauseJusqua).toBe(T0 + 3000 + 30000);
  const net2 = reseau(regles), r2 = await X.essayer(e, essai(M0, 'crypto', 1), [actif('btc')], acquis, T0 + 8000, net2);
  expect(net2.hotes()).toEqual(['api.coinbase.com']);                           // Binance en pause, OKX et Gate déjà lus : le secours seul
  expect(r2.ecrire.btc).toEqual({ s: { okx_eclair: 63183, gate_eclair: 63180, coinbase_eclair: 63110.54 }, x: [], final: false });
  // Gate 1,3 % au-dessus des autres : écartée (la médiane des trois)
  const fausse = enregistrees(T0).gate.map(x => ({ ...x, price: String(Number(x.price) * 1.013) }));
  const r3 = await X.essayer(etat(), essai(M0, 'crypto', 0), [actif('btc')], {}, T0 + 3000, reseau([[/gateio\.ws/, ok(fausse)], ...NOMINAL(T0)]));
  expect(r3.ecrire.btc).toMatchObject({ x: ['gate_eclair'], s: { binance_eclair: 63180.68, okx_eclair: 63183 } });
  // plus rien : rien d'écrit avant le dernier essai, puis « final » sans source → la base écrit la fixation absente
  const m = ME.round(Date.now()), T = ME.t0(m), muet = [[/./, non(502)]], e4 = etat(), a4 = {};
  for (const [rang, dt] of [[0, 3000], [1, 8000]]) expect((await X.essayer(e4, essai(m, 'crypto', rang), [actif('sol')], a4, T + dt, reseau(muet))).ecrire).toEqual({});
  const r4 = await X.essayer(e4, essai(m, 'crypto', 2, true), [actif('sol')], a4, T + 15000, reseau(muet));
  expect(r4.ecrire).toEqual({ sol: { s: {}, x: [], final: true } });
  await q(db, 'select public.srv_eclair_fixer($1::jsonb)', [JSON.stringify({ manche: m, actifs: r4.ecrire })]);
  expect((await q(db, 'select wm.eclair_fixation($1, $2) as r', ['sol', m]))[0].r).toMatchObject({ e: 'absent', n: 0 });
});

test('actions US : sans clé, aucun appel ; avec la clé, la cotation lue juste après la frontière ; trop vieille, on attend ; quota de la minute tenu', async () => {
  const bourse = ['nvda', 'tsla', 'spy', 'qqq'].map(actif), T = T0;
  const sans = reseau(NOMINAL(T)), eSans = etat({}), aSans = {};
  expect((await X.essayer(eSans, essai(M0, 'bourse', 0), bourse, aSans, T + 300, sans)).ecrire).toEqual({});
  expect((await X.essayer(eSans, essai(M0, 'bourse', 2, true), bourse, aSans, T + 4000, sans)).ecrire).toEqual({});   // pas même « absente »
  expect(sans.appels).toEqual([]);
  const e = etat({ FINNHUB_API_KEY: 'cle-de-test' }), net = reseau(NOMINAL(T));
  const r = await X.essayer(e, essai(M0, 'bourse', 0), bourse, {}, T + 300, net);
  expect(Object.keys(r.ecrire).sort()).toEqual(['nvda', 'qqq', 'spy', 'tsla']);
  expect(r.ecrire.nvda).toEqual({ s: { finnhub_eclair: 153.51 }, x: [], final: false });
  for (const a of net.appels) expect(a.entetes).toEqual({ 'X-Finnhub-Token': 'cle-de-test' });
  expect(r.sources).toEqual([expect.objectContaining({ id: 'finnhub_eclair', appels: 4, ok: 4, cle: true })]);
  // une cotation dont la dernière transaction date de 10 minutes : pas de prix à cette seconde, on réessaie
  const vieille = reseau([[/finnhub\.io/, ok({ ...enregistrees(T).finnhub, t: T / 1000 - 600 })]]);
  expect((await X.essayer(etat({ FINNHUB_API_KEY: 'k' }), essai(M0, 'bourse', 0), [actif('nvda')], {}, T + 300, vieille)).ecrire).toEqual({});
  // quota : 20 par minute × marge 0,5 = 10 appels ; le troisième essai de quatre actifs n'en a plus que 2
  const eq = etat({ FINNHUB_API_KEY: 'k' }), muet = [[/finnhub\.io/, ok({ c: 0, t: 0 })]];
  const n = [];
  for (const [rang, dt] of [[0, 300], [1, 1500], [2, 4000]]) { const nq = reseau(muet); await X.essayer(eq, essai(M0, 'bourse', rang, rang === 2), bourse, {}, T + dt, nq); n.push(nq.appels.length); }
  expect(n).toEqual([4, 4, 2]);
  expect(C.plafondMinute(eq.sources.finnhub_eclair)).toBe(10);
});
