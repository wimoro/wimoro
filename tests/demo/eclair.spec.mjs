// Recette 2 (mode Démo) : le pari éclair accepte la mise, l'affiche, la règle à la fin de la manche,
// met à jour le solde et l'historique, et la mise survit à un rechargement en cours de manche.
// Couvre B02 (le clic sur un bouton de pari éclair ne faisait plus rien).
import { test, expect } from '@playwright/test';
import { ouvrir, lire, debutManche } from '../helpers/app.mjs';

const etat = page => lire(page, () => ({ solde: S.me.balance, joues: S.me.played, regles: S.me.settled, xp: S.me.xp, mise: G(S.ui.fgame).my, ouvert: flashPhase().open, manche: S.flash.round }));

test('B02 · mode Démo : miser, voir sa mise, être réglé à la fin de la manche', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: debutManche() + 2000 });
  const avant = await etat(page);
  expect(avant.ouvert, 'les mises sont ouvertes en début de manche').toBe(true);
  expect(avant.mise).toBeNull();

  await page.locator('[data-a="flash-bet"]:not([disabled])').first().click();
  const pendant = await etat(page);
  expect(pendant.mise, 'la mise est enregistrée').not.toBeNull();
  expect(pendant.mise.amt).toBe(10);
  expect(pendant.solde).toBeCloseTo(avant.solde - 10, 2);
  expect(pendant.joues).toBe(avant.joues + 1);
  expect(pendant.xp).toBe(avant.xp + 10);
  await expect(page.locator('#view')).toContainText('Your stake: $10.00');

  await page.clock.runFor(47000);                                   // fin de la manche de 45 s
  const apres = await etat(page);
  expect(apres.manche).toBe(avant.manche + 1);
  expect(apres.mise, 'la mise de la manche terminée est soldée').toBeNull();
  expect(apres.regles).toBe(avant.regles + 1);
  const gain = apres.solde - pendant.solde;                          // 0 si perdu, > 0 si gagné : jamais négatif
  expect(gain).toBeGreaterThanOrEqual(0);
  const hist = await lire(page, () => S.me.history[0]);
  expect(hist.k).toBe('flash');
  expect(hist.pnl).toBeCloseTo(gain - 10, 2);
  expect(erreurs).toEqual([]);
});

test('mode Démo : la mise est toujours là après un rechargement en cours de manche', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: debutManche() + 2000 });
  await page.locator('[data-a="flash-bet"]:not([disabled])').first().click();
  const avant = await etat(page);
  expect(avant.mise).not.toBeNull();
  await page.clock.runFor(1000);                                     // laisse la sauvegarde différée (400 ms) s'écrire
  await page.reload();
  await expect(page.locator('#view > *').first()).toBeAttached();
  const apres = await etat(page);
  expect(apres.manche).toBe(avant.manche);
  expect(apres.mise, 'mise restaurée').toMatchObject({ s: avant.mise.s, amt: 10 });
  expect(apres.solde).toBeCloseTo(avant.solde, 2);
});

test('mode Démo : mises fermées en fin de manche, une seule mise par pari', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: debutManche() + 2000 });
  const b = page.locator('[data-a="flash-bet"]:not([disabled])').first();
  await b.click();
  const s1 = (await etat(page)).solde;
  await page.evaluate(() => flashBet('non', null, S.ui.fgame));       // seconde mise sur le même pari : refusée
  expect((await etat(page)).solde).toBe(s1);
  await page.clock.runFor(31000);                                    // les mises ferment 30 s après le début
  expect((await etat(page)).ouvert).toBe(false);
});
