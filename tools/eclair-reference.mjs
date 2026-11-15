// Produit tests/fixtures/eclair-reference.json : les issues, les prix et les cagnottes du pari éclair calculés par le
// code du site (js/flash.js) sur 500 manches. Ce fichier a été généré AVANT l'extraction du moteur dans
// js/moteur-eclair.js : il sert de référence pour prouver que le moteur extrait donne exactement les mêmes résultats
// (tests/eclair-moteur.spec.mjs). Ne le régénérer que si les règles du jeu changent volontairement.
//
//   node tools/serve.mjs &            (dans un autre terminal)
//   node tools/eclair-reference.mjs
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const R0 = 100000, N = 500;
const nav = await chromium.launch({ channel: process.env.CHROME ? 'chrome' : undefined });
const page = await nav.newPage();
await page.addInitScript(() => { localStorage.setItem('wimoro-lang', 'en'); });
await page.goto('http://127.0.0.1:4173/index.html#accueil');
await page.waitForSelector('#view > *');
const ref = await page.evaluate(([R0, N]) => {
  const out = { r0: R0, n: N, jeux: GAMES.map(d => ({ id: d.id, kind: d.kind, cat: d.cat, k: d.k, p0: d.p0, be: d.be, p: d.p, bep: d.bep })), issues: {}, prix: {}, cagnottes: {}, beMult: {} };
  for (const d of GAMES) {
    out.beMult[d.id] = beMult(d);
    let s = ''; for (let r = R0; r < R0 + N; r++) s += fOutcome(d, r);
    out.issues[d.id] = s;
    if (d.kind === 'dir') { out.prix[d.id] = []; for (let r = R0; r < R0 + N; r += 10) { const P = fPlan(d, r); out.prix[d.id].push([P[0], P[60], P[180]]); } }
    out.cagnottes[d.id] = [];
    const garde = G('btc').plan;
    for (let r = R0; r < R0 + N; r += 10) {
      const g = { gid: d.id, hist: [] };
      fRoundInit(g, d, r);
      G('btc').plan = fPlan(GM.btc, r);                       // le pari « Secousse » lit la trajectoire du Bitcoin de la même manche
      fAdvance(d, g, r, 60, false); const mi = [g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players];
      fAdvance(d, g, r, 180, false);
      out.cagnottes[d.id].push([mi, [g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players, g.bets.length]]);
    }
    G('btc').plan = garde;
  }
  return out;
}, [R0, N]);
await nav.close();
fs.mkdirSync('tests/fixtures', { recursive: true });
fs.writeFileSync('tests/fixtures/eclair-reference.json', JSON.stringify(ref));
console.log('référence écrite :', Object.keys(ref.issues).length, 'jeux,', N, 'manches,', fs.statSync('tests/fixtures/eclair-reference.json').size, 'octets');
