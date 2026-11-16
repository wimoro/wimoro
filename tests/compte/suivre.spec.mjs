// Suivre un joueur en mode Compte : la liste et le compteur d'abonnés sont tenus par le serveur.
// Les partages en image (Série, clan) sont disponibles : ils ne font que dessiner une image avec le vrai code de parrainage.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const LEA = { n: 'lea', t: 4, d: 0, tone: 0, bets: 120, acc: 61, profit: 900, fol: 30, bio: '', photo: '', color: '', bot: false, pub: 1 };
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === 'api_follow').map(c => c.args));

test('suivre puis ne plus suivre : tenu par le serveur, gardé après rechargement ; un refus est affiché', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#joueur-' + AMI, faux: { etat: { me: { balance: 100 }, users: { [AMI]: LEA }, prefs: { v: 1, tmode: 'all' } } } });
  const bouton = page.locator(`[data-a="follow-user"][data-u="${AMI}"]`).first();
  await expect(bouton).toHaveText('Follow');
  await bouton.click();
  await expect(toast(page, 'You follow lea')).toBeVisible();
  await expect(bouton).toHaveText('Following');
  expect(await lire(page, id => ({ suivis: S.me.following, abonnes: USERS[id].fol }), AMI)).toEqual({ suivis: [AMI], abonnes: 31 });
  expect(await appels(page)).toEqual([{ p_user: AMI, p_on: true }]);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  expect(await lire(page, () => S.me.following)).toEqual([AMI]);                                  // tout vient du serveur
  await page.locator(`[data-a="follow-user"][data-u="${AMI}"]`).first().click();
  await expect(page.locator(`[data-a="follow-user"][data-u="${AMI}"]`).first()).toHaveText('Follow');
  expect(await lire(page, id => ({ suivis: S.me.following, abonnes: USERS[id].fol }), AMI)).toEqual({ suivis: [], abonnes: 30 });
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_follow: { error: { message: 'trop_de_suivis', code: 'P0001' } } }; });
  await page.locator(`[data-a="follow-user"][data-u="${AMI}"]`).first().click();
  await expect(toast(page, 'You already follow 500 players')).toBeVisible();
  expect(await lire(page, () => S.me.following)).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('partage en image de son clan : disponible en mode Compte, avec le code de parrainage du serveur', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#clan-c1', faux: { etat: { me: { balance: 100 }, ref: { code: 'LEAB-7K3', bonus: 10, by: null, list: [] } } } });
  await page.locator('[data-a="cl-join"]').first().click();
  await expect.poll(() => lire(page, () => S.me.clan && S.me.clan.id)).toBe('c1');
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'cl-share'; document.body.appendChild(b); b.click(); b.remove(); });
  await expect.poll(() => lire(page, () => (S.ui.shareTxt || ''))).toContain('LEAB-7K3');         // le vrai code, pas un code inventé à l'écran
  expect(await lire(page, () => (S.ui.shareImg || '').startsWith('data:image/png'))).toBe(true);
  await expect(page.locator('.toast', { hasText: 'Coming soon for accounts' })).toHaveCount(0);
  expect(erreurs).toEqual([]);
});
