// La cascade de la collecte de bout en bout : configuration lue en base (srv_donnees_config), cascade.js avec un faux
// réseau qui sert les réponses ENREGISTRÉES (tests/fixtures/donnees/), écriture par srv_cours_ingerer, lecture par api_live.
// Principale en panne → secours ; secours en panne → dernier recours ; plus rien → dernière valeur « retardée » ; jamais
// rien → « simulée ». Quotas, cadences, pauses, clés absentes. Toute adresse imprévue fait échouer le test (jamais de réseau).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { creerBase, enTantQue, q } from './base.mjs';

globalThis.fetch = async url => { throw new Error('appel réseau interdit dans les tests : ' + url); };
const C = await import('../../supabase/functions/donnees/cascade.js');

const F = 'tests/fixtures/donnees/';
const lu = n => JSON.parse(fs.readFileSync(F + n, 'utf8'));
const ok = (corps, ms = 12) => ({ statut: 200, corps, ms });
const okTexte = texte => ({ statut: 200, corps: null, texte, ms: 15 });
const non = (statut, retryAfter = 0) => ({ statut, corps: null, ms: 9, retryAfter });

// Réponses enregistrées, rafraîchies pour l'heure du test : le dernier point de Yahoo à maintenant − 10 s (l'Europe garde son
// retard de 15 min), gold-api à maintenant − 5 s. Les autres gardent leur date (taux du jour).
function yahooFrais(now) {
  const y = lu('yahoo_spark.json'), dernier = Math.max(...Object.values(y).map(v => v.timestamp.at(-1)));
  const decalage = Math.floor((now - 10000) / 1000) - dernier;
  for (const v of Object.values(y)) v.timestamp = v.timestamp.map(t => t + decalage);
  return y;
}
const goldFrais = (n, now) => ({ ...lu(n), updatedAt: new Date(now - 5000).toISOString() });

/** Faux réseau : chaque appel est noté ; une adresse sans règle lève. */
function reseau(regles) {
  const appels = [];
  const chercher = async (url, o = {}) => {
    appels.push({ url, entetes: o.entetes || {} });
    for (const [motif, rep] of regles) if (motif.test(url)) return typeof rep === 'function' ? rep(url, o) : rep;
    throw new Error('adresse non prévue : ' + url);
  };
  chercher.appels = appels;
  chercher.hotes = () => appels.map(a => new URL(a.url).hostname);
  return chercher;
}
const NOMINAL = now => [
  [/data-api\.binance\.vision\/api\/v3\/ticker/, ok(lu('binance_ticker.json'))],
  [/api\.kraken\.com\/0\/public\/Ticker/, ok(lu('kraken_ticker.json'))],
  [/api\.coinbase\.com\/v2\/exchange-rates/, ok(lu('coinbase_rates.json'))],
  [/query1\.finance\.yahoo\.com\/v8\/finance\/spark/, ok(yahooFrais(now))],
  [/api\.gold-api\.com\/price\/XAU/, ok(goldFrais('goldapi_xau.json', now))],
  [/api\.gold-api\.com\/price\/XAG/, ok(goldFrais('goldapi_xag.json', now))],
  [/api\.goldprice\.dev/, ok(lu('goldprice_xau.json'))],
  [/api\.frankfurter\.dev/, ok(lu('frankfurter.json'))],
  [/currency-api\.pages\.dev/, ok(lu('fawaz_usd.json'))],
  [/fred\.stlouisfed\.org.*DCOILWTICO/, okTexte(fs.readFileSync(F + 'fred_wti.csv', 'utf8'))],
  [/fred\.stlouisfed\.org.*DCOILBRENTEU/, okTexte(fs.readFileSync(F + 'fred_brent.csv', 'utf8'))],
  [/finnhub\.io\/api\/v1\/quote/, ok(lu('finnhub_quote_doc.json'))],
  [/eodhd\.com/, ok(lu('eodhd_realtime.json'))],
  [/api\.twelvedata\.com\/market_state/, ok(lu('twelvedata_market_state.json'))],
  [/api\.exchangerate\.dev/, ok(lu('exchangerate_dev.json'))],
  [/api\.eia\.gov/, ok(lu('eia_spot_doc.json'))],
];

// Chaque scénario a sa propre base neuve : une boucle de collecte repart toujours de l'état gardé en base.
let db;
test.beforeEach(async () => { db = await creerBase(); });
test.afterEach(async () => { await db.close(); });
const srv = async (sql, params) => (await q(db, `select ${sql} as r`, params))[0].r;
const config = () => srv('public.srv_donnees_config()');
const ingerer = p => srv('public.srv_cours_ingerer($1::jsonb)', [JSON.stringify(p)]);
const live = async () => (await enTantQue(db, null, s => s('select public.api_live() as r')))[0].r;
const source = async id => (await q(db, 'select * from wm.sources where id = $1', [id]))[0];
/** la configuration, avec les marchés comme ouverts (le test ne dépend pas de l'heure à laquelle il tourne) */
async function etatOuvert(cles = {}, now = Date.now()) {
  const cfg = await config();
  for (const a of cfg.actifs) a.ouvert = true;
  return C.etatInitial(cfg, cles, now);
}

test('cadences et quotas : l’intervalle entre deux appels vient de la cadence et des quotas (× marge), jamais moins', async () => {
  const e = await etatOuvert();
  const s = id => e.sources[id];
  expect(C.intervalle(s('binance'))).toBe(6000);
  expect(C.intervalle(s('finnhub'), 9)).toBe(30000);                     // 9 actions : 27 s au quota de 20 par minute, la cadence l'emporte
  expect(C.intervalle(s('eodhd'))).toBe(8640000);                        // 20 par jour × 0,5 : un appel toutes les 2 h 24
  expect(C.intervalle(s('exchangerate'))).toBe(1080000);                 // 160 par jour × 0,5 : toutes les 18 min
  expect(C.intervalle(s('coingecko'))).toBe(600000);
  expect(C.intervalle(s('yahoo'))).toBe(30000);
  expect(C.plafondMinute(s('finnhub'))).toBe(20); expect(C.plafondJour(s('eodhd'))).toBe(10); expect(C.plafondJour(s('binance'))).toBe(Infinity);
  expect([C.pause(1, 503, 0), C.pause(2, 503, 0), C.pause(3, 0, 0), C.pause(9, 503, 0), C.pause(1, 429, 120), C.pause(1, 401, 0), C.pause(1, 403, 0)])
    .toEqual([30000, 60000, 120000, 1800000, 120000, 1800000, 1800000]);
  expect([C.echec(503), C.echec(429), C.echec(418), C.echec(403), C.echec(0), C.echec(404), C.echec(200)]).toEqual([true, true, true, true, true, false, false]);
});

test('passage nominal sans aucune clé : une source par famille, les 37 cours, les sources à clé restent inactives', async () => {
  const now = Date.now(), e = await etatOuvert({}, now), net = reseau(NOMINAL(now));
  const r = await C.passe(e, now, net);
  expect(net.hotes().sort()).toEqual(['api.frankfurter.dev', 'api.gold-api.com', 'api.gold-api.com', 'data-api.binance.vision',
    'fred.stlouisfed.org', 'fred.stlouisfed.org', 'query1.finance.yahoo.com']);
  expect(r.cours).toHaveLength(37); expect(r.manquants).toEqual([]);
  const src = Object.fromEntries(r.cours.map(c => [c.a, c.src]));
  expect([src.btc, src.nvda, src.spx, src.mc, src.xau, src.eurusd, src.wti]).toEqual(['binance', 'yahoo', 'yahoo', 'yahoo', 'goldapi', 'frankfurter', 'fred']);
  for (const a of net.appels) expect(a.entetes).not.toHaveProperty('X-Finnhub-Token');
  const cles = C.presenceDesCles(e);
  expect(cles.filter(c => !c.cle).map(c => c.id).sort()).toEqual(['coingecko', 'eia', 'eodhd', 'exchangerate', 'finnhub', 'goldprice', 'twelvedata']);
  await ingerer({ cours: r.cours, sources: [...cles, ...r.sources] });
  const l = await live();
  expect(l.cours.btc).toMatchObject({ p: 63194.07, e: 'd' });
  expect(l.cours.nvda.e).toBe('d'); expect(l.cours.mc.e).toBe('r');          // Europe : 15 min de retard chez Yahoo → « retardé »
  expect(l.cours.xau.e).toBe('d'); expect(l.cours.eurusd.e).toBe('r'); expect(l.cours.wti).toMatchObject({ p: 89.53, e: 'r' });
  expect(Object.values(l.cours).filter(c => c.e === 's')).toEqual([]);
  expect((await source('finnhub'))).toMatchObject({ etat: 'inactif', raison: 'cle_absente' });
  expect((await source('binance'))).toMatchObject({ etat: 'direct', raison: 'ok', appels_jour: 1 });
  expect((await source('fred'))).toMatchObject({ etat: 'differe', appels_jour: 2 });
  expect((await source('kraken'))).toMatchObject({ etat: 'inactif', raison: 'en_reserve' });
  // le passage suivant, 3 s plus tard : rien n'est dû (cadences)
  const net2 = reseau(NOMINAL(now)); const r2 = await C.passe(e, now + 3000, net2);
  expect(net2.appels).toEqual([]); expect(r2.cours).toEqual([]);
  // une boucle qui redémarre (réveil suivant) reprend l'heure du dernier appel en base : FRED n'est pas rappelé avant 6 h
  const e2 = C.etatInitial(await config(), {}, now + 60000); for (const a of Object.values(e2.actifs)) a.ouvert = true;
  const net3 = reseau(NOMINAL(now)); await C.passe(e2, now + 60000, net3);
  expect(net3.hotes()).not.toContain('fred.stlouisfed.org'); expect(net3.hotes()).toContain('data-api.binance.vision');
});

test('principale en panne (503) : le secours prend le relais dans le même passage ; la principale reprend après sa pause', async () => {
  const now = Date.now(), e = await etatOuvert({}, now);
  const regles = [[/data-api\.binance\.vision/, non(503)], ...NOMINAL(now)];
  const r = await C.passe(e, now, reseau(regles));
  const crypto = r.cours.filter(c => ['btc', 'eth', 'doge'].includes(c.a));
  expect(crypto.map(c => c.src)).toEqual(['kraken', 'kraken', 'kraken']);
  expect(r.cours.find(c => c.a === 'btc').p).toBe(63134.3);
  const b = r.sources.find(s => s.id === 'binance'), k = r.sources.find(s => s.id === 'kraken');
  expect(b).toMatchObject({ appels: 1, ok: 0, err: 1, code: 503, erreur: 'HTTP 503' }); expect(b.pause_ms).toBe(now + 30000);
  expect(k).toMatchObject({ appels: 1, ok: 1, err: 0 });
  await ingerer({ cours: r.cours, sources: r.sources });
  expect((await source('binance'))).toMatchObject({ etat: 'erreur', raison: 'pause', erreurs_suite: 1, dernier_code: 503 });
  // pendant la pause : Binance n'est pas rappelée ; le rythme est celui de Kraken (10 s)
  const n6 = reseau(regles); await C.passe(e, now + 6000, n6); expect(n6.appels).toEqual([]);
  const n10 = reseau(regles); await C.passe(e, now + 10000, n10); expect(n10.hotes()).toContain('api.kraken.com'); expect(n10.hotes()).not.toContain('data-api.binance.vision');
  // la pause finie, Binance répond de nouveau : elle redevient la source, son compteur d'erreurs repart de zéro
  const n31 = reseau(NOMINAL(now)); const r31 = await C.passe(e, now + 31000, n31);
  expect(n31.hotes()).toContain('data-api.binance.vision');
  expect(r31.cours.find(c => c.a === 'btc').src).toBe('binance');
  await ingerer({ cours: r31.cours, sources: r31.sources });
  expect((await source('binance'))).toMatchObject({ etat: 'direct', erreurs_suite: 0, pause_jusqua: null });
});

test('principale et secours en panne : le dernier recours (Coinbase) ; réponse illisible = panne, comme un refus', async () => {
  const now = Date.now(), e = await etatOuvert({}, now);
  const regles = [[/data-api\.binance\.vision/, ok({ code: -1121, msg: 'Invalid symbol.' })], [/api\.kraken\.com/, { statut: 0, erreur: 'delai', ms: 5000 }], ...NOMINAL(now)];
  const r = await C.passe(e, now, reseau(regles));
  expect(r.cours.find(c => c.a === 'btc')).toMatchObject({ src: 'coinbase' });
  expect(r.cours.find(c => c.a === 'btc').p).toBeCloseTo(1 / 0.0000158494354352, 6);
  expect(r.sources.find(s => s.id === 'binance').erreur).toMatch(/format binance/);
  expect(r.sources.find(s => s.id === 'kraken')).toMatchObject({ code: 0, erreur: 'delai', err: 1 });
  expect(e.sources.binance.pauseJusqua).toBe(now + 30000); expect(e.sources.kraken.pauseJusqua).toBe(now + 30000);
});

test('plus aucune source : la dernière valeur connue est gardée, puis marquée « retardée » ; un cours jamais reçu reste « simulé »', async () => {
  const db2 = db;
  const now = Date.now(), cfg = (await q(db2, 'select public.srv_donnees_config() as r'))[0].r;
  for (const a of cfg.actifs) a.ouvert = true;
  const e = C.etatInitial(cfg, {}, now);
  const pannes = [[/binance|kraken|coinbase/, non(502)], ...NOMINAL(now)];
  const r = await C.passe(e, now, reseau(pannes));
  expect(r.cours.filter(c => ['btc', 'eth', 'sol'].includes(c.a))).toEqual([]);
  expect(r.manquants).toEqual(expect.arrayContaining(['btc', 'eth', 'sol']));
  await q(db2, 'select public.srv_cours_ingerer($1::jsonb)', [JSON.stringify({ cours: [{ a: 'btc', p: 63000, src: 'binance' }, ...r.cours], sources: r.sources })]);
  const lire = async () => (await enTantQue(db2, null, s => s('select public.api_live() as r')))[0].r;
  expect((await lire()).cours.btc).toMatchObject({ p: 63000, e: 'd' });
  await q(db2, `update wm.px_dernier set t = now() - interval '5 minutes' where actif = 'btc'`);     // les sources se taisent depuis 5 min
  await q(db2, 'select public.srv_cours_ingerer($1::jsonb)', [JSON.stringify({ sources: r.sources })]);
  const l = await lire();
  expect(l.cours.btc).toMatchObject({ p: 63000, e: 'r' });                       // dernière valeur connue, retardée
  expect(l.cours.eth).toMatchObject({ p: 1782.92, e: 's' });                     // jamais reçue : simulée au niveau de référence
  expect(l.familles.crypto).toBe('simule');
});

test('refus avec Retry-After et clé refusée : la pause suit la source ; une clé présente sert sans jamais apparaître dans l’adresse', async () => {
  const now = Date.now(), e = await etatOuvert({ FINNHUB_API_KEY: 'cle-finnhub-de-test', EODHD_API_TOKEN: 'jeton-eodhd-de-test' }, now);
  const net = reseau([[/finnhub\.io/, non(401)], [/query1\.finance\.yahoo\.com/, non(429, 120)], ...NOMINAL(now)]);
  const r = await C.passe(e, now, net);
  const fh = net.appels.filter(a => a.url.includes('finnhub.io'));
  expect(fh).toHaveLength(1);                                                   // refus dès le premier symbole : on n'insiste pas
  expect(fh[0].entetes['X-Finnhub-Token']).toBe('cle-finnhub-de-test'); expect(fh[0].url).not.toContain('cle-finnhub');
  expect(e.sources.finnhub.pauseJusqua).toBe(now + 1800000);                     // clé refusée : 30 min
  expect(e.sources.yahoo.pauseJusqua).toBe(now + 120000);                        // Retry-After : 120 s
  // indices et actions européennes : EODHD (rang 2, sa clé existe) prend le relais ; son jeton est masqué pour un journal
  const eod = net.appels.find(a => a.url.includes('eodhd.com'));
  expect(eod).toBeTruthy(); expect(C.sansSecret(eod.url)).not.toContain('jeton-eodhd');
  expect(r.sources.find(s => s.id === 'finnhub')).toMatchObject({ cle: true, code: 401, err: 1 });
  expect(JSON.stringify(r)).not.toMatch(/cle-finnhub-de-test|jeton-eodhd-de-test/);
});

test('quota de la minute et du jour : une source qui l’atteindrait n’est pas appelée, la cascade passe à la suivante', async () => {
  const now = Date.now(), e = await etatOuvert({ FINNHUB_API_KEY: 'k', EODHD_API_TOKEN: 'k' }, now);
  e.sources.finnhub.quota_min = 8;                                               // 4 appels par minute avec la marge : pas assez pour 9 actions
  e.sources.eodhd.appelsJour = 10;                                               // plafond du jour atteint (20 × 0,5)
  const net = reseau([[/query1\.finance\.yahoo\.com/, non(503)], ...NOMINAL(now)]);
  const r = await C.passe(e, now, net);
  expect(net.hotes()).not.toContain('finnhub.io'); expect(net.hotes()).not.toContain('eodhd.com');
  expect(r.manquants).toEqual(expect.arrayContaining(['nvda', 'spx', 'mc']));     // rien d'autre : les cours restent ceux d'avant (retardés)
  // avec le quota normal : Finnhub sert les 9 actions US, une requête par symbole, en-tête de clé
  const e2 = await etatOuvert({ FINNHUB_API_KEY: 'k' }, now), net2 = reseau(NOMINAL(now));
  const r2 = await C.passe(e2, now, net2);
  expect(net2.appels.filter(a => a.url.includes('finnhub.io'))).toHaveLength(9);
  expect(r2.cours.filter(c => c.src === 'finnhub').map(c => c.a).sort()).toEqual(['aapl', 'amzn', 'googl', 'meta', 'msft', 'nvda', 'qqq', 'spy', 'tsla']);
  expect(e2.sources.finnhub.minute).toHaveLength(9);
  expect(C.utilisable(e2.sources.finnhub, now + 1000, 9)).toBe(true);            // 9 + 9 ≤ 20 dans la minute
  expect(C.utilisable(e2.sources.finnhub, now + 1000, 12)).toBe(false);          // 9 + 12 > 20
});

test('place fermée : ses cours ne sont rafraîchis que toutes les 15 minutes ; la crypto, elle, ne ferme jamais', async () => {
  const now = Date.now(), cfg = await config();
  for (const a of cfg.actifs) a.ouvert = a.famille === 'crypto';
  const e = C.etatInitial(cfg, {}, now);
  for (const a of Object.keys(e.dernierOk)) e.dernierOk[a] = now - 60000;        // tout a été rafraîchi il y a une minute
  const r = C.aRafraichir(e, now);
  expect(r.sort()).toEqual(['ada', 'avax', 'bnb', 'btc', 'doge', 'eth', 'link', 'ltc', 'sol', 'xrp']);
  for (const a of Object.keys(e.dernierOk)) e.dernierOk[a] = now - 16 * 60000;
  const apres16 = C.aRafraichir(e, now);
  expect(apres16).toEqual(expect.arrayContaining(['nvda', 'cac', 'xau']));
  expect(apres16).not.toContain('eurusd');                                       // sans clé exchangerate.dev : le rythme de Frankfurter (1 h)
  for (const a of Object.keys(e.dernierOk)) e.dernierOk[a] = now - 61 * 60000;
  expect(C.aRafraichir(e, now)).toContain('eurusd');
});

test('contrôle des places (Twelve Data, si sa clé existe) : enregistré en base pour l’équipe, au plus toutes les 15 minutes', async () => {
  const now = Date.now(), net = reseau(NOMINAL(now));
  const sans = await etatOuvert({}, now);
  expect(await C.controler(sans, now, net)).toBeNull();                          // pas de clé : pas d'appel
  const avec = await etatOuvert({ TWELVEDATA_API_KEY: 'k' }, now);
  const c = await C.controler(avec, now, net);
  expect(c.controle).toMatchObject({ XNYS: true, XJPX: false });
  expect(await C.controler(avec, now + 60000, net)).toBeNull();                  // trop tôt
  await ingerer({ controle: c.controle, sources: [c.source] });
  const m = await q(db, `select id, controle from wm.px_marches where id in ('NYSE', 'TSE') order by id`);
  expect(m.map(x => [x.id, x.controle.ouvert, x.controle.source])).toEqual([['NYSE', true, 'twelvedata'], ['TSE', false, 'twelvedata']]);
  expect(net.appels.filter(a => a.url.includes('twelvedata'))).toHaveLength(1);
});
