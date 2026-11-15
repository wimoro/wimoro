// Mode Démo, parcours complet d'un compte local : inscription simulée par portefeuille → onboarding en 5 étapes →
// crédit de démonstration de 1 000 000 $ → achat → vente. C'est le comportement de référence du commit 3a1d258.
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

test('compte local : inscription, onboarding, crédit démo, achat puis vente', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#inscription' });
  await page.locator('[data-a="wallet-modal"]').click();
  await page.locator('.md [data-a="wallet"]').first().click();
  await expect(page).toHaveURL(/#bienvenue/, { timeout: 6000 });                    // la signature simulée prend 1,6 s

  // Onboarding : couleur → centres d'intérêt → KYC (sans) → rangs → 100 XP de bienvenue
  expect(await lire(page, () => ({ logged: S.me.logged, onboarded: S.me.onboarded, solde: S.me.balance, credit: S.me.deps[0].label }))).toEqual({ logged: true, onboarded: false, solde: 1e6, credit: 'Crédit démo' });
  const suivant = page.locator('[data-a="ob-next"]');
  await page.locator('[data-a="ob-color"]').nth(1).click();
  await suivant.click();
  await expect(suivant).toBeDisabled();                                              // au moins un centre d'intérêt
  await page.locator('[data-a="ob-int"]').first().click();
  await suivant.click();
  await page.locator('[data-a="ob-kpick"][data-v="crypto"]').click();
  await suivant.click();
  await suivant.click();
  await suivant.click();                                                             // « Récupérer mes 100 XP »
  await expect.poll(() => lire(page, () => S.me.xp)).toBe(100);
  await page.locator('[data-a="ob-next"]').click({ timeout: 4000 });                 // « Découvrir les marchés »
  await expect(page).toHaveURL(/#accueil/);
  expect(await lire(page, () => S.me.onboarded)).toBe(true);

  // Achat de 50 $ depuis la page du marché
  await page.evaluate(() => { location.hash = '#marche-btc150k'; });
  const ticket = page.locator('[data-ticket="page"]');
  await ticket.locator('[data-tamt="page"]').fill('50');
  const prixAvant = await lire(page, () => MK.btc150k.p);
  await ticket.locator('[data-a="buy"]').click();
  const apresAchat = await lire(page, () => ({ solde: S.me.balance, pos: S.me.positions.filter(p => p.m === 'btc150k'), xp: S.me.xp, joues: S.me.played, prix: MK.btc150k.p, mission: S.me.missions.map(m => m.have) }));
  expect(apresAchat.solde).toBeCloseTo(1e6 - 50, 2);
  expect(apresAchat.pos).toHaveLength(1);
  expect(apresAchat.pos[0].sh).toBeGreaterThan(50);
  expect(apresAchat.xp).toBe(110);
  expect(apresAchat.joues).toBe(1);
  expect(apresAchat.prix).toBeGreaterThan(prixAvant);                                // l'achat de Oui fait monter le prix

  // Vente de toute la position
  await ticket.locator('[data-a="tmode"][data-v="sell"]').click();
  await ticket.locator('[data-a="preset"][data-v="1"]').click();
  await ticket.locator('[data-a="sell"]').click();
  const apresVente = await lire(page, () => ({ solde: S.me.balance, reste: S.me.positions.reduce((t, p) => t + p.sh, 0), hist: S.me.history[0] }));
  expect(apresVente.reste).toBeLessThan(0.1);                                        // « tout vendre » arrondit au dixième de part
  expect(apresVente.solde).toBeGreaterThan(1e6 - 50);
  expect(apresVente.solde).toBeLessThan(1e6);                                        // acheter puis revendre ne rapporte jamais d'argent
  expect(apresVente.hist.k).toBe('sell');
  expect(erreurs).toEqual([]);
});

test('compte démo User26 : connexion en un clic, puis retour à un état visiteur propre à la déconnexion', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#connexion' });
  await page.locator('[data-a="demo-login"]').click();
  await expect(page).toHaveURL(/#accueil/);
  expect(await lire(page, () => ({ n: S.me.n, pos: S.me.positions.length, demo: S.auth.demo }))).toEqual({ n: 'User26', pos: 5, demo: true });
  await page.evaluate(() => logout());
  await expect(page).toHaveURL(/#connexion/);
  expect(await lire(page, () => ({ logged: S.me.logged, pos: S.me.positions.length, notifs: S.me.notifs.length, amis: (S.me.friends || []).length }))).toEqual({ logged: false, pos: 0, notifs: 0, amis: 0 });
  expect(erreurs).toEqual([]);
});
