// La Série en mode Compte : lancée, jouée, réglée et encaissée par le serveur ; l'écran affiche et annonce, il n'écrit rien.
// Le faux serveur applique les mêmes règles que la base, avec le même moteur que la page.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, debutManche } from '../helpers/app.mjs';

const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const serie = page => lire(page, () => { const s = S.me.serie; return s ? { state: s.state, step: s.step, stack: s.stack, stake: s.stake, choice: s.choice, mult: s.mult, hist: s.hist.length } : null; });
const appelsFn = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'fn' && /^serie_/.test((c.args || {}).action || '')).map(c => [c.args.action, c.args.gid, c.args.stake, c.args.choice].filter(x => x !== undefined)));
const issue = page => lire(page, () => MoteurEclair.serieIssue(MoteurEclair.JEUX[S.me.serie.gid], __fakeSB.etat().serie.rStart).out);
const ouvrirSerie = (page, plus = {}) => ouvrir(page, { mode: 'compte', hash: '#serie', horloge: debutManche() + 4000, faux: { etat: { me: { balance: 500 } }, ...plus } });

test('lancer, choisir juste, gagner la manche, encaisser : tout est écrit par le serveur et se retrouve après rechargement', async ({ page }) => {
  const { erreurs } = await ouvrirSerie(page);
  await page.locator('[data-a="sr-start"]').click();
  await expect(toast(page, 'Streak started at $10')).toBeVisible();
  expect(await serie(page)).toMatchObject({ state: 'running', step: 1, stack: 10, stake: 10, choice: null });
  expect(await lire(page, () => S.me.balance)).toBe(490);
  await page.reload(); await pret(page);                                                     // la série en cours est rendue par le serveur
  expect(await serie(page)).toMatchObject({ state: 'running', step: 1, stack: 10 });
  await expect(page.locator('.srcard.onair')).toBeVisible();

  const juste = await issue(page);
  await page.locator(`[data-a="sr-play"][data-v="${juste}"]`).click();
  await expect.poll(async () => (await serie(page)).choice).toBe(juste);
  const { mult } = await serie(page);
  expect(mult).toBeGreaterThan(1);                                                           // la cote est celle renvoyée par le serveur
  expect(await lire(page, () => S.me.xp)).toBe(10);
  await page.clock.runFor(61000);                                                            // fin de la manche : le serveur règle
  await expect(toast(page, 'Round 1 won')).toBeVisible();
  const apres = await serie(page);
  expect(apres).toMatchObject({ state: 'running', step: 2, choice: null, hist: 1 });
  expect(apres.stack).toBeCloseTo(Math.round((10 - await lire(page, () => __fakeSB.etat().serie.hist.length && Math.round(10 * MoteurEclair.taux(MoteurEclair.JEUX.btc.cat, false) * .5 * 100) / 100)) * mult * 100) / 100, 2);
  expect(await lire(page, () => S.me.balance), 'rien n’est versé tant que la série continue').toBe(490);

  await page.locator('[data-a="sr-cash"]').click();
  await expect(toast(page, 'Cashed out')).toBeVisible();
  expect(await serie(page)).toMatchObject({ state: 'cashed', step: 1 });
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(490 + apres.stack, 2);
  expect(await lire(page, () => ({ k: S.me.history[0].k, q: S.me.history[0].q, win: S.me.history[0].win, regles: S.me.settled, gagnes: S.me.wins }))).toMatchObject({ k: 'serie', win: true, regles: 1, gagnes: 1 });
  expect(await lire(page, () => S.me.history[0].q)).toMatch(/^The .* Streak: 1 of 1, cashed out at ×/);
  expect(await appelsFn(page)).toEqual([['serie_start', 'btc', 10], ['serie_play', 'btc', juste], ['serie_settle'], ['serie_cash']]);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, k: S.me.history[0].k, etat: S.me.serie.state }))).toMatchObject({ k: 'serie', etat: 'cashed' });
  expect(erreurs).toEqual([]);
});

test('choisir faux : la série est perdue, la mise seulement ; sans choix : la mise est rendue', async ({ page }) => {
  const { erreurs } = await ouvrirSerie(page);
  await page.locator('[data-a="sr-stake"][data-v="25"]').click();
  await page.locator('[data-a="sr-start"]').click();
  await expect.poll(async () => (await serie(page) || {}).state).toBe('running');
  const juste = await issue(page), faux = juste === 'oui' ? 'non' : 'oui';
  await page.locator(`[data-a="sr-play"][data-v="${faux}"]`).click();
  await expect.poll(async () => (await serie(page)).choice).toBe(faux);
  await page.clock.runFor(61000);
  await expect(toast(page, 'Streak lost at round 1')).toBeVisible();
  expect(await serie(page)).toMatchObject({ state: 'lost', stack: 0 });
  expect(await lire(page, () => ({ solde: S.me.balance, k: S.me.history[0].k, win: S.me.history[0].win, pnl: S.me.history[0].pnl, regles: S.me.settled, gagnes: S.me.wins }))).toEqual({ solde: 475, k: 'serie', win: false, pnl: -25, regles: 1, gagnes: 0 });

  await page.locator('[data-a="sr-start"]').click();                                         // nouvelle série, aucun choix
  await expect.poll(async () => (await serie(page) || {}).state).toBe('running');
  expect(await lire(page, () => S.me.balance)).toBe(450);
  await page.clock.runFor(61000);
  await expect(toast(page, 'Streak cancelled')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, regles: S.me.settled, etat: S.me.serie.state }))).toEqual({ solde: 475, regles: 1, etat: 'cashed' });
  expect(erreurs).toEqual([]);
});

test('refus du serveur : affiché clairement, rien ne change ; le mode Démo ne passe pas par le serveur', async ({ page, browser }) => {
  await ouvrirSerie(page, { fn: { eclair: 'serie_en_cours' } });
  await page.locator('[data-a="sr-start"]').click();
  await expect(toast(page, 'You already have a streak in progress')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, serie: S.me.serie }))).toEqual({ solde: 500, serie: null });

  const ctx = await browser.newContext(), demo = await ctx.newPage();                       // un navigateur neuf : aucune session
  await ouvrir(demo, { mode: 'demo', hash: '#serie', horloge: debutManche() + 4000 });
  await demo.clock.runFor(1500); await demo.keyboard.press('Escape');
  const avant = await lire(demo, () => S.me.balance);
  await demo.locator('[data-a="sr-start"]').click();
  expect(await lire(demo, () => ({ etat: S.me.serie.state, mise: S.me.serie.stake }))).toEqual({ etat: 'running', mise: 10 });
  expect(await lire(demo, () => S.me.balance)).toBe(avant - 10);
  expect(await lire(demo, () => typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'fn' || c.kind === 'rpc').length)).toBe(0);
  await ctx.close();
});
