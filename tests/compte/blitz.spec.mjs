// Blitz Royale en mode Compte : la salle (joueurs simulés, issues, cagnotte) se déduit de l'heure avec le moteur partagé ;
// l'entrée, les choix, le rachat et le gain du joueur sont écrits par le serveur. Le faux serveur applique les mêmes règles.
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);                                                // début d'un créneau de 15 minutes
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const NOM = { 1: 'oui', 0: 'non', 2: 'be' };
const salle = page => lire(page, () => { const r = S.bz.royale; return r ? { etat: r.state, manche: r.round, pause: !!r.between, inscrits: r.bots.length, moi: r.me ? { vie: r.me.alive, choix: r.me.choice, rachat: r.me.rebuy, paye: r.me.paid } : null } : null; });
const issue = (page, i) => lire(page, i => MoteurEclair.bzIssue(MoteurEclair.bzId(Date.now()), i).out, i);
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'fn' && /^blitz_(join|choose|rebuy|settle)$/.test((c.args || {}).action || '')).map(c => c.args.action + (c.args.choice ? ':' + c.args.choice : '')));
const ouvrirBlitz = page => ouvrir(page, { mode: 'compte', hash: '#blitz', horloge: T0 + 30000, faux: { etat: { me: { balance: 500 } } } });
const choisir = async (page, i, juste) => {
  const out = await issue(page, i), v = juste ? NOM[out] : NOM[out === 1 ? 0 : 1];
  await page.locator(`[data-a="bz-choose"][data-v="${v}"]`).click();
  await expect.poll(async () => ((await salle(page)).moi || {}).choix).toBe(juste ? out : (out === 1 ? 0 : 1));
};

test('entrer, choisir juste dix fois : survivant, la part de la cagnotte arrive sur le solde ; tout passe par le serveur', async ({ page }) => {
  test.setTimeout(90000);
  const { erreurs } = await ouvrirBlitz(page);
  await page.clock.runFor(1500);
  expect(await salle(page)).toMatchObject({ etat: 'lobby', moi: null });
  const id = await lire(page, () => MoteurEclair.bzId(Date.now()));
  expect(await lire(page, id => S.bz.royale.sid === id && S.bz.royale.target === MoteurEclair.bzBots(id).n, id), 'la salle est celle que calcule le moteur').toBe(true);
  await page.locator('[data-a="bz-join"]').click();
  await expect(toast(page, 'Entered the Blitz Royale')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp }))).toEqual({ solde: 490, xp: 10 });
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached(); await page.clock.runFor(1500);
  expect((await salle(page)).moi, 'l’inscription est rendue par le serveur').toMatchObject({ vie: true, paye: 10 });

  await page.clock.runFor(92000);                                                            // départ à 2 minutes : manche 1, choix ouverts
  for (let i = 1; i <= 10; i++) {
    expect(await salle(page)).toMatchObject({ etat: 'live', manche: i, pause: false, moi: { vie: true } });
    await choisir(page, i, true);
    await page.clock.runFor(58000);                                                          // une seconde après la fin de la manche
    if (i < 10) { await expect(toast(page, `Round ${i}: you survive`)).toBeVisible(); await page.clock.runFor(12000); }   // pause de 10 secondes, puis manche suivante
  }
  await expect(toast(page, 'Blitz won')).toBeVisible({ timeout: 15000 });
  const fin = await lire(page, id => ({ solde: S.me.balance, h: S.me.history[0], dernier: S.bz.history[0], clos: __fakeSB.db.blitzClos[id], regles: S.me.settled, gagnes: S.me.wins }), id);
  expect(fin.clos.survivants).toBeGreaterThanOrEqual(1);
  expect(fin.solde).toBeCloseTo(490 + fin.clos.chacun, 2);
  expect(fin.h).toMatchObject({ k: 'blitz', win: true }); expect(fin.h.q).toMatch(/^Blitz Royale: survivor on /);
  expect(fin.dernier).toMatchObject({ me: 'won', alive: fin.clos.survivants, each: fin.clos.chacun });
  expect([fin.regles, fin.gagnes]).toEqual([1, 1]);
  const faits = await appels(page);
  expect(faits[0]).toBe('blitz_join'); expect(faits.filter(a => a.startsWith('blitz_choose'))).toHaveLength(10); expect(faits[faits.length - 1]).toBe('blitz_settle');
  await page.clock.runFor(8000);                                                             // six secondes plus tard : salle d'attente du Blitz suivant
  expect(await salle(page)).toMatchObject({ etat: 'lobby', moi: null });
  expect(erreurs).toEqual([]);
});

test('tomber à la manche 1, racheter avant la manche 2, tomber encore : 60 $ perdus, pas un de plus', async ({ page }) => {
  test.setTimeout(90000);
  const { erreurs } = await ouvrirBlitz(page);
  await page.clock.runFor(1500);
  await page.locator('[data-a="bz-join"]').click();
  await expect.poll(async () => ((await salle(page)).moi || {}).paye).toBe(10);
  await page.clock.runFor(92000);
  await choisir(page, 1, false);
  await page.clock.runFor(57500);                                                            // fin de la manche 1 : pause
  await expect(toast(page, 'Eliminated at round 1')).toBeVisible();
  expect(await salle(page)).toMatchObject({ etat: 'live', manche: 1, pause: true, moi: { vie: false, rachat: false } });
  await page.locator('[data-a="bz-rebuy"]').click();
  await expect(toast(page, 'Rebuy accepted')).toBeVisible();
  expect(await lire(page, () => S.me.balance)).toBe(440);
  expect((await salle(page)).moi).toMatchObject({ vie: true, rachat: true, paye: 60 });
  await page.clock.runFor(15000);                                                            // manche 2 : aucun choix
  expect(await salle(page)).toMatchObject({ manche: 2, pause: false, moi: { vie: true } });
  await page.clock.runFor(55500);                                                            // une seconde après la fin de la manche 2
  await expect(toast(page, 'Eliminated at round 2')).toBeVisible();
  expect((await salle(page)).moi).toMatchObject({ vie: false });
  await expect(page.locator('[data-a="bz-rebuy"]')).toHaveCount(0);                          // un seul rachat
  await page.clock.runFor(585000);                                                           // jusqu'à la fin du Blitz : clôture
  await expect.poll(() => lire(page, () => S.me.history[0] && S.me.history[0].k), { timeout: 15000 }).toBe('blitz');
  expect(await lire(page, () => ({ solde: S.me.balance, win: S.me.history[0].win, pnl: S.me.history[0].pnl, regles: S.me.settled, gagnes: S.me.wins }))).toEqual({ solde: 440, win: false, pnl: -60, regles: 1, gagnes: 0 });
  expect((await appels(page)).filter(a => !a.startsWith('blitz_choose'))).toEqual(['blitz_join', 'blitz_rebuy', 'blitz_settle']);
  expect(erreurs).toEqual([]);
});

test('spectateur : la salle vit sans rien écrire ; le mode Démo ne parle pas au serveur', async ({ page, browser }) => {
  const { erreurs } = await ouvrirBlitz(page);
  await page.clock.runFor(200000);                                                           // manche 2 en cours, sans être inscrit
  const s = await salle(page);
  expect(s).toMatchObject({ etat: 'live', moi: null }); expect(s.inscrits).toBeGreaterThan(1800);
  await expect(page.locator('[data-a="bz-join"]')).toHaveCount(0);                            // les inscriptions sont closes
  expect(await lire(page, () => S.me.balance)).toBe(500);
  expect(await appels(page)).toEqual([]);
  expect(erreurs).toEqual([]);
  const ctx = await browser.newContext(), demo = await ctx.newPage();
  await ouvrir(demo, { mode: 'demo', hash: '#blitz', horloge: T0 + 30000 });
  await demo.clock.runFor(3000);
  expect(await lire(demo, () => typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'fn' || c.kind === 'rpc').length)).toBe(0);
  expect(await lire(demo, () => !!S.bz.royale)).toBe(true);
  await ctx.close();
});
