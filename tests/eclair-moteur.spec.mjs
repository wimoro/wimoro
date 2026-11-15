// Moteur du pari éclair (js/moteur-eclair.js) : module pur utilisé à l'identique par le navigateur et par le serveur.
// Il doit donner EXACTEMENT les issues, les prix et les cagnottes du code d'origine : la référence
// tests/fixtures/eclair-reference.json a été produite par js/flash.js avant l'extraction (tools/eclair-reference.mjs).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { ouvrir } from './helpers/app.mjs';

const REF = JSON.parse(fs.readFileSync('tests/fixtures/eclair-reference.json', 'utf8'));
const charger = fichier => { const bac = {}; bac.globalThis = bac; vm.runInNewContext(fs.readFileSync(fichier, 'utf8'), bac); return bac.MoteurEclair; };
const ME = charger('js/moteur-eclair.js');
const ENGINE = vm.runInNewContext(fs.readFileSync('js/engine.js', 'utf8') + '\n;({ flashFee, flashPayout, flashPool, beProb, beMultFair, beRoom, wmRate })', { module: undefined });

test('les jeux du moteur ont les mêmes nombres que ceux du site', () => {
  expect(ME.LISTE.map(d => d.id)).toEqual(REF.jeux.map(d => d.id));
  for (const ref of REF.jeux) {
    const d = ME.JEUX[ref.id];
    expect({ kind: d.kind, cat: d.cat, k: d.k, p0: d.p0, be: d.be, p: d.p, bep: d.bep }, ref.id).toEqual({ kind: ref.kind, cat: ref.cat, k: ref.k, p0: ref.p0, be: ref.be, p: ref.p, bep: ref.bep });
    expect(ME.beMult(d), 'cote du break even de ' + ref.id).toBe(REF.beMult[ref.id]);
  }
});

test('mêmes issues que le code d’origine : 19 jeux × 500 manches', () => {
  let n = 0;
  for (const d of ME.LISTE) {
    let s = ''; for (let r = REF.r0; r < REF.r0 + REF.n; r++) s += ME.issue(d, r);
    expect(s, d.id).toBe(REF.issues[d.id]); n += s.length;
  }
  expect(n).toBe(19 * 500);
});

// Le niveau d'un actif se calcule de proche en proche à partir de la manche précédente quand elle est connue, sinon par
// une somme de 1 200 termes : les deux chemins s'accordent à 1e-9 près, pas au dernier chiffre (c'était déjà vrai du code
// d'origine entre deux navigateurs ouverts à des moments différents). Pour une égalité exacte avec la référence, on
// parcourt donc les manches dans le même ordre qu'elle ; un second test borne l'écart d'un calcul « à froid ».
const dansLOrdre = M => { for (const d of M.LISTE) for (let r = REF.r0; r < REF.r0 + REF.n; r++) M.issue(d, r); return M; };

test('mêmes prix que le code d’origine (début, tick 60, fin de manche)', () => {
  const M = dansLOrdre(charger('js/moteur-eclair.js'));
  for (const d of M.LISTE.filter(d => d.kind === 'dir')) {
    // Node et Chrome n'ont pas la même version du moteur JavaScript : Math.exp peut différer au dernier chiffre (1e-16).
    // L'égalité exacte est vérifiée dans le navigateur, plus bas ; ici, à 1e-12 près.
    let pire = 0, n = 0;
    for (let r = REF.r0; r < REF.r0 + REF.n; r += 10) { const P = M.plan(d, r), ref = REF.prix[d.id][n++]; [P[0], P[60], P[180]].forEach((v, i) => { pire = Math.max(pire, Math.abs(v / ref[i] - 1)); }); }
    expect(n).toBe(50);
    expect(pire, d.id).toBeLessThan(1e-12);
  }
});

test('un calcul « à froid » (serveur qui démarre, onglet qui s’ouvre) donne les mêmes issues et des prix égaux à 1e-9 près', () => {
  let pire = 0, issues = 0;
  for (const d of ME.LISTE) {
    for (let r = REF.r0 + 5; r < REF.r0 + REF.n; r += 37) {
      const M = charger('js/moteur-eclair.js');                                     // aucun niveau en mémoire
      expect(String(M.issue(d, r)), d.id + ' manche ' + r).toBe(REF.issues[d.id][r - REF.r0]); issues++;
      if (d.kind === 'dir' && (r - REF.r0) % 10 === 0) { const P = M.plan(d, r), ref = REF.prix[d.id][(r - REF.r0) / 10]; pire = Math.max(pire, Math.abs(P[180] / ref[2] - 1)); }
    }
  }
  expect(issues).toBeGreaterThan(250);
  expect(pire).toBeLessThan(1e-9);
});

test('mêmes cagnottes que le code d’origine : départ puis mises simulées des autres joueurs, au tick 60 et en fin de manche', () => {
  const ME = dansLOrdre(charger('js/moteur-eclair.js'));
  for (const d of ME.LISTE) {
    const lus = [];
    for (let r = REF.r0; r < REF.r0 + REF.n; r += 10) {
      const dep = ME.depart(d, r), g = { pool: dep.pool, players: dep.players }, P = d.kind === 'event' ? null : ME.plan(d.kind === 'vol' ? ME.JEUX.btc : d, r);
      let mises = 0, mi = null;
      for (let i = 1; i <= 180; i++) { if (ME.mises(d, g, r, i, P)) mises++; if (i === 60) mi = [g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players]; }
      lus.push([mi, [g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players, mises]]);
      // la fonction « état » du serveur retombe sur la même cagnotte
      const e = ME.etat(d, r, 180);
      expect([e.pool.o, e.pool.n, e.pool.e, e.pool.eProm || 0, e.players]).toEqual([g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players]);
    }
    expect(lus, d.id).toEqual(REF.cagnottes[d.id]);
  }
});

test('frais et gains : mêmes formules que js/engine.js, sur 2 000 cas tirés au hasard', () => {
  const R = ME.rng(20261115), cotes = ['oui', 'non', 'be'];
  for (let i = 0; i < 2000; i++) {
    const d = ME.LISTE[Math.floor(R() * ME.LISTE.length)], g = { pool: { o: Math.round(R() * 4000), n: Math.round(R() * 4000), e: Math.round(R() * 200), eProm: R() * 800 } };
    const cote = cotes[i % 3], amt = 1 + Math.round(R() * 500), remise = R() < .3;
    expect(ME.frais(d, g, cote, amt, remise)).toBe(ENGINE.flashFee(d.cat, g, cote, amt, remise));
    const my = { s: cote, net: amt * .97, mult: cote === 'be' ? ME.beMult(d) : 0 };
    expect(ME.gain(g, my)).toBe(ENGINE.flashPayout(g, my));
    expect(ME.beRoom(g)).toBe(ENGINE.beRoom(g));
  }
  expect(ME.taux('Crypto', true)).toBe(ENGINE.wmRate('Crypto', true));
});

test('la mise du joueur entre dans la cagnotte à son tick, et le règlement rejoue la manche entière', () => {
  const d = ME.JEUX.btc, r = REF.r0 + 7;
  const avant = ME.etat(d, r, 40);
  const fee = ME.frais(d, avant, 'oui', 100, false), my = { s: 'oui', amt: 100, net: 100 - fee, mult: 0, tk: 40 };
  const apres = ME.etat(d, r, 40, my);
  expect(apres.pool.o).toBeCloseTo(avant.pool.o + my.net, 9); expect(apres.pool.n).toBe(avant.pool.n);
  const res = ME.regler(d, r, my), fin = ME.etat(d, r, 180, my), out = ME.issue(d, r);
  expect(res.out).toBe(out);
  expect(res.win).toBe(out === 1);
  if (res.win) { expect(res.pay).toBeCloseTo(my.net * (fin.pool.o + fin.pool.n + fin.pool.e) / fin.pool.o, 9); expect(res.pnl).toBeCloseTo(res.pay - 100, 9); }
  else expect(res).toMatchObject({ pay: 0, pnl: -100 });
  // le break even : cote bloquée à la mise, jamais plus que la cagnotte ne peut couvrir
  const be = { s: 'be', amt: 10, net: 9.8, mult: ME.beMult(d), tk: 10 };
  const g = ME.etat(d, r, 180, be);
  expect(ME.gain(g, be)).toBeLessThanOrEqual(be.net * be.mult + 1e-9);
  expect(ME.beMax(ME.etat(d, r, 10), d)).toBeGreaterThan(0);
  // horloge : numéro de manche, tick, phase de mises
  const t = ME.t0(r);
  expect([ME.round(t), ME.round(t + 44999), ME.round(t + 45000)]).toEqual([r, r, r + 1]);
  expect([ME.tick(t), ME.tick(t + 10000), ME.tick(t + 44999)]).toEqual([0, 40, 179]);
  expect([ME.ouvert(t + 29999), ME.ouvert(t + 30000)]).toEqual([true, false]);
});

test('le site (js/flash.js, qui délègue au moteur) donne toujours les valeurs de référence', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo' });
  const lu = await page.evaluate(([R0, N]) => {
    const out = { issues: {}, cagnottes: {}, prix: {} };
    const garde = G('btc').plan;
    for (const d of GAMES) {
      let s = ''; for (let r = R0; r < R0 + N; r++) s += fOutcome(d, r);
      out.issues[d.id] = s; out.cagnottes[d.id] = [];
      if (d.kind === 'dir') { out.prix[d.id] = []; for (let r = R0; r < R0 + N; r += 10) { const P = fPlan(d, r); out.prix[d.id].push([P[0], P[60], P[180]]); } }
      for (let r = R0; r < R0 + N; r += 10) {
        const g = { gid: d.id, hist: [] };
        fRoundInit(g, d, r); G('btc').plan = fPlan(GM.btc, r);
        fAdvance(d, g, r, 60, false); const mi = [g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players];
        fAdvance(d, g, r, 180, false);
        out.cagnottes[d.id].push([mi, [g.pool.o, g.pool.n, g.pool.e, g.pool.eProm || 0, g.players, g.bets.length]]);
      }
    }
    G('btc').plan = garde;
    return out;
  }, [REF.r0, REF.n]);
  expect(lu.issues).toEqual(REF.issues);
  expect(lu.prix, 'prix identiques au dernier chiffre').toEqual(REF.prix);
  expect(lu.cagnottes).toEqual(REF.cagnottes);
  expect(erreurs).toEqual([]);
});

test('le serveur embarque une copie conforme du moteur', () => {
  const copie = 'supabase/functions/eclair/moteur-eclair.js';
  test.skip(!fs.existsSync(copie), 'la fonction serveur du pari éclair n’est pas encore dans le dépôt');
  expect(fs.readFileSync(copie, 'utf8')).toBe(fs.readFileSync('js/moteur-eclair.js', 'utf8'));
});
