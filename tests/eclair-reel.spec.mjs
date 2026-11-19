// Moteur v2 du pari éclair (js/moteur-eclair.js) : les manches à cours réels, réglées sur les fixations du serveur.
// Les mêmes fixations donnent la même issue, la même cagnotte et le même gain dans le navigateur (visiteur, compte Démo) et
// dans les Edge Functions (copies conformes du moteur) : vérifié ici sous Node et dans un vrai navigateur.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { ouvrir } from './helpers/app.mjs';

const charger = f => { const bac = {}; bac.globalThis = bac; vm.runInNewContext(fs.readFileSync(f, 'utf8'), bac); return bac.MoteurEclair; };
const ME = charger('js/moteur-eclair.js');
const fix = (s, a = 0) => { const k = Object.keys(s).sort(); let t = 0; for (const x of k) t += s[x]; return { e: 'ok', p: t / k.length, n: k.length, s, a }; };
const absent = a => ({ e: 'absent', p: null, n: 0, s: {}, a });

test('trois copies conformes du moteur : le site, l’Edge Function « eclair » et l’Edge Function « donnees »', () => {
  const ref = fs.readFileSync('js/moteur-eclair.js', 'utf8');
  expect(fs.readFileSync('supabase/functions/eclair/moteur-eclair.js', 'utf8')).toBe(ref);
  expect(fs.readFileSync('supabase/functions/donnees/moteur-eclair.js', 'utf8')).toBe(ref);
});

test('moyenne des sources : valeurs aberrantes écartées, deux sources en désaccord → la prioritaire, calcul identique quel que soit l’ordre', () => {
  expect(ME.composite([['binance', 63180.68], ['okx', 63183], ['gate', 63180]])).toEqual({ s: { binance: 63180.68, okx: 63183, gate: 63180 }, x: [], p: (63180.68 + 63180 + 63183) / 3, n: 3 });
  const aberrante = ME.composite([['binance', 63180.68], ['okx', 63183], ['gate', 64000]]);       // Gate à 1,3 % : écartée
  expect(aberrante.x).toEqual(['gate']); expect(aberrante.n).toBe(2);
  expect(ME.composite([['binance', 100], ['okx', 101]])).toMatchObject({ s: { binance: 100 }, x: ['okx'], n: 1 });   // 1 % d'écart : la première seule
  expect(ME.composite([['binance', 100], ['okx', 100.2]])).toMatchObject({ n: 2, p: 100.1 });
  expect(ME.composite([['gate', 5]])).toMatchObject({ s: { gate: 5 }, n: 1, p: 5 });
  expect(ME.composite([['a', NaN], ['b', -1], ['c', null]])).toEqual({ s: {}, x: [], p: null, n: 0 });
  // Coinbase (USD) à 0,11 % sous l'USDT reste dans la tolérance de 0,3 %
  expect(ME.composite([['binance', 63180.68], ['okx', 63183], ['coinbase', 63110.54]]).n).toBe(3);
  const a = ME.composite([['binance', 1.0000001], ['okx', 1.0000002], ['gate', 1.0000003]]);
  const b = ME.composite([['gate', 1.0000003], ['binance', 1.0000001], ['okx', 1.0000002]]);
  expect(b.p).toBe(a.p);                                                                        // somme dans l'ordre des noms
});

test('issue d’une manche réelle : hausse, baisse, égalité, annulation (fixation absente, sources communes insuffisantes, égalité sans break even)', () => {
  const d = ME.JEUX.btc, P = { pbe: .04, smin: 2, beoff: false };
  const F0 = fix({ binance: 63000, okx: 63002, gate: 63001 });
  expect(ME.issueReelle(d, F0, fix({ binance: 63100, okx: 63102, gate: 63101 }), P)).toBe(1);
  expect(ME.issueReelle(d, F0, fix({ binance: 62900, okx: 62902, gate: 62901 }), P)).toBe(0);
  expect(ME.issueReelle(d, F0, fix({ binance: 63000.5, okx: 63002, gate: 63001 }), P)).toBe(2);   // écart sous la bande (3,06e-5)
  expect(ME.issueReelle(d, F0, absent(), P)).toBeNull();
  expect(ME.issueReelle(d, F0, fix({ gate: 63101 }), P)).toBeNull();                              // une seule source commune pour 2 exigées
  expect([ME.motifAnnule(d, F0, fix({ gate: 63101 }), P), ME.motifAnnule(d, F0, absent(), P), ME.motifAnnule(d, F0, fix({ binance: 63000.5, okx: 63002, gate: 63001 }), { ...P, beoff: true }),
    ME.motifAnnule(d, F0, fix({ binance: 63100, okx: 63102, gate: 63101 }), P)]).toEqual(['sources_insuffisantes', 'fixation_absente', 'egalite_sans_break_even', null]);
  expect(ME.issueReelle(d, F0, fix({ binance: 63000.5, okx: 63002, gate: 63001 }), { ...P, beoff: true })).toBeNull();
  // une source absente à un bout est retirée des deux : l'écart USD/USDT de Coinbase s'annule
  const G0 = fix({ binance: 63000, okx: 63002, coinbase: 62930 }), G1 = fix({ binance: 63010, okx: 63012, coinbase: 62940, gate: 64000 });
  expect(ME.communes(G0, G1)).toEqual(['binance', 'coinbase', 'okx']);
  expect(ME.issueReelle(d, G0, G1, P)).toBe(1);
  // Secousse : une forte variation du Bitcoin gagne « oui »
  const v = ME.JEUX.vol;
  expect(ME.issueReelle(v, F0, fix({ binance: 63100, okx: 63102, gate: 63101 }), P)).toBe(1);     // +0,16 % > 0,05 %
  expect(ME.issueReelle(v, F0, fix({ binance: 63010, okx: 63012, gate: 63011 }), P)).toBe(0);     // +0,016 %
  expect(ME.issueReelle(ME.JEUX.tennis, F0, F0, P)).toBeNull();                                   // un événement sportif n'est jamais réel
});

test('foule simulée : elle penche du côté de la manche r − 2, seulement si les deux fixations étaient connues avant l’ouverture', () => {
  const r = 40000, t = ME.t0(r);
  const F = { [r - 2]: fix({ a: 100 }, t - 50000), [r - 1]: fix({ a: 101 }, t - 5000) };
  expect(ME.penchant(r, F)).toBe(1);
  expect(ME.penchant(r, { ...F, [r - 1]: fix({ a: 99 }, t - 5000) })).toBe(-1);
  expect(ME.penchant(r, { ...F, [r - 1]: fix({ a: 101 }, t + 1) })).toBe(0);                      // écrite après l'ouverture : neutre
  expect(ME.penchant(r, { [r - 1]: F[r - 1] })).toBe(0);
  expect(ME.penchant(r, { ...F, [r - 2]: absent(t - 50000) })).toBe(0);
  // la cagnotte ne dépend que de la manche, du tick, de la mise et de ce penchant : deux calculs donnent la même
  const ctx = { mode: 'reel', P: { pbe: .04, smin: 2, beoff: false }, F };
  const my = { s: 'oui', amt: 50, net: 48.6, mult: 0, tk: 22 };
  expect(ME.etatReel(ME.JEUX.btc, r, 180, my, ctx)).toEqual(ME.etatReel(ME.JEUX.btc, r, 180, my, ctx));
  expect(ME.etatReel(ME.JEUX.btc, r, 180, my, ctx)).not.toEqual(ME.etatReel(ME.JEUX.btc, r, 180, my, { ...ctx, F: {} }));
});

test('règlement réel : gain à la cagnotte, perte, break even plafonné à sa cote, manche annulée ; break even fermé au-delà du seuil', () => {
  const d = ME.JEUX.eth, r = 40100, t = ME.t0(r), P = { pbe: .04, smin: 2, beoff: false };
  const F = { [r - 2]: fix({ a: 1780, b: 1781 }, t - 60000), [r - 1]: fix({ a: 1781, b: 1782 }, t - 10000), [r]: fix({ a: 1782, b: 1783 }, t + 3000), [r + 1]: fix({ a: 1790, b: 1791 }, t + 48000) };
  const ctx = { mode: 'reel', P, F };
  const oui = { s: 'oui', amt: 100, net: 97.5, mult: 0, tk: 30 }, non = { s: 'non', amt: 100, net: 97.5, mult: 0, tk: 30 };
  const g = ME.etatReel(d, r, 180, oui, ctx);
  const rOui = ME.reglerReel(d, r, oui, ctx);
  expect(rOui).toMatchObject({ out: 1, win: true }); expect(rOui.pay).toBeCloseTo(oui.net * ME.total(g) / g.pool.o, 9);
  expect(ME.reglerReel(d, r, non, ctx)).toMatchObject({ out: 1, win: false, pay: 0, pnl: -100 });
  expect(ME.reglerReel(d, r, oui, { ...ctx, F: { ...F, [r + 1]: absent(t + 170000) } })).toMatchObject({ annule: true, motif: 'fixation_absente', pay: 0 });
  const be = { s: 'be', amt: 10, net: 9.8, mult: ME.beMultReel(d, P), tk: 5 };
  const egal = { ...ctx, F: { ...F, [r + 1]: fix({ a: 1782.01, b: 1783 }, t + 48000) } };
  const rBe = ME.reglerReel(d, r, be, egal);
  expect(rBe.out).toBe(2); expect(rBe.win).toBe(true); expect(rBe.pay).toBeLessThanOrEqual(be.net * be.mult + 1e-9);
  // break even fermé (fréquence observée trop haute) : pas de mise possible, et l'égalité annule la manche
  const ferme = { ...P, pbe: .2, beoff: true };
  expect(ME.beMaxReel(ME.etatReel(d, r, 10, null, ctx), d, ferme)).toBe(0);
  expect(ME.reglerReel(d, r, oui, { ...egal, P: ferme })).toMatchObject({ annule: true, motif: 'egalite_sans_break_even' });
  expect(ME.beMultReel(d, { pbe: .1 })).toBeCloseTo(9.5, 9); expect(ME.beMultReel(d, {})).toBe(ME.beMult(d));
  const px = ME.prixReel(d, g, P); expect(px.o + px.n + px.e).toBe(100);
});

// Des contextes variés (tendances, absences, égalités, sources différentes) pour comparer les deux exécutions du moteur.
function cas() {
  const R = ME.rng(20261119), out = [];
  for (let i = 0; i < 40; i++) {
    const ids = ['btc', 'eth', 'sol', 'doge', 'vol', 'nvda', 'spx', 'ndx', 'tsla'], d = ids[i % ids.length], r = 40500 + i * 7, t = ME.t0(r);
    const base = d === 'doge' ? .06 : d === 'nvda' ? 150 : 1000 + R() * 60000, v = () => base * (1 + (R() - .5) * .002);
    const F = { [r - 2]: fix({ a: v(), b: v() }, t - 60000), [r - 1]: fix({ a: v(), b: v() }, t - (R() < .2 ? -2000 : 9000)) };
    if (R() > .1) F[r] = fix({ a: v(), b: v(), c: v() }, t + 3000);
    if (R() > .15) F[r + 1] = i % 9 === 4 ? fix({ ...F[r] ? F[r].s : { a: base } }, t + 48000) : fix({ a: v(), b: v() }, t + 48000); else F[r + 1] = absent(t + 170000);
    const P = { pbe: .03 + R() * .06, smin: d === 'nvda' || d === 'spx' || d === 'ndx' || d === 'tsla' ? 1 : 2, beoff: R() < .2 };
    const s = ['oui', 'non', 'be'][i % 3], amt = 5 + Math.round(R() * 200);
    out.push({ d, r, ctx: { mode: 'reel', P, F }, my: { s, amt, net: amt * .975, mult: s === 'be' ? ME.beMultReel(ME.JEUX[d], P) : 0, tk: Math.floor(R() * 120) } });
  }
  return out;
}
function calculer(M, liste) {
  return liste.map(c => {
    const d = M.JEUX[c.d], g = M.etatReel(d, c.r, c.my.tk, null, c.ctx);
    return { regle: M.reglerReel(d, c.r, c.my, c.ctx), issue: M.issueReelle(d, c.ctx.F[c.r], c.ctx.F[c.r + 1], c.ctx.P), pen: M.penchant(c.r, c.ctx.F),
      frais: M.frais(d, g, c.my.s, c.my.amt, false), prix: M.prixReel(d, g, c.ctx.P), beMax: M.beMaxReel(g, d, c.ctx.P), pool: g.pool,
      // la fixation elle-même (moyenne, sources écartées) : celle que l'Edge Function « donnees » calcule avec sa copie
      fixation: M.composite(Object.entries(c.ctx.F[c.r - 1] ? c.ctx.F[c.r - 1].s : {}).concat([['aberrante', 1.02 * (c.ctx.F[c.r - 1] ? c.ctx.F[c.r - 1].p : 1)]])) };
  });
}

test('navigateur et serveur : les mêmes fixations donnent exactement les mêmes issues, frais, cagnottes et gains', async ({ page }) => {
  const liste = cas();
  const node = calculer(ME, liste), copie = calculer(charger('supabase/functions/eclair/moteur-eclair.js'), liste);
  expect(copie).toEqual(node);
  expect(calculer(charger('supabase/functions/donnees/moteur-eclair.js'), liste)).toEqual(node);
  expect(node.every(x => x.fixation.x.includes('aberrante'))).toBe(true);                      // 2 % au-dessus : toujours écartée
  expect(node.filter(x => x.regle.annule).length).toBeGreaterThan(2);                           // des manches annulées font partie des cas
  expect(new Set(node.map(x => x.issue)).size).toBeGreaterThanOrEqual(3);
  const { erreurs } = await ouvrir(page, { mode: 'demo' });
  const nav = await page.evaluate(([l, src]) => {
    const M = window.MoteurEclair;
    return (new Function('M', 'liste', 'return (' + src + ')(M, liste)'))(M, l);
  }, [liste, calculer.toString()]);
  expect(nav).toEqual(node);                                                                    // égalité exacte, au dernier chiffre
  expect(erreurs).toEqual([]);
});
