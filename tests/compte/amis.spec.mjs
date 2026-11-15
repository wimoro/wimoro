// Amis en mode Compte : recherche d'un joueur, demande, annulation, acceptation, refus, retrait — écrits par le serveur.
// Couvre B11 et la recette 5 (partie amis) avec le faux serveur ; tests/e2e/comptes.spec.mjs le fait entre deux vrais comptes.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const BOT = '33333333-3333-4333-8333-333333333333';
const fiche = (n, plus = {}) => ({ n, t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1, ...plus });
const FICHES = { [AMI]: fiche('lea_reelle'), [BOT]: fiche('maxou_bot', { bot: true }) };
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const listes = page => lire(page, () => ({ amis: S.me.friends.slice(), recues: S.me.freqIn.slice(), envoyees: S.me.freqOut.slice(), xp: S.me.xp }));
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);

test('chercher un joueur par son pseudo, lui envoyer une demande, l’annuler : tout est écrit par le serveur', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#amis', faux: { fiches: FICHES } });
  expect(await listes(page)).toMatchObject({ amis: [], recues: [], envoyees: [] });           // aucun ami inventé par le navigateur
  await page.locator('[data-fq]').fill('lea');
  const resultat = page.locator('[data-fres] .frow');
  await expect(resultat).toHaveCount(1);                                                      // trouvé par le serveur
  await expect(resultat).toContainText('lea_reelle');
  expect(await appels(page, 'api_users_search')).toEqual([{ p_q: 'lea' }]);                  // une seule recherche pour trois lettres tapées
  await resultat.locator('[data-a="fr-add"]').click();
  await expect(toast(page, 'Friend request sent')).toBeVisible();
  expect(await listes(page)).toMatchObject({ amis: [], envoyees: [AMI] });
  expect(await appels(page, 'api_friend')).toEqual([{ p_action: 'add', p_user: AMI }]);
  await page.reload(); await pret(page);
  expect((await listes(page)).envoyees).toEqual([AMI]);                                       // toujours là : c'est le serveur qui la garde
  await expect(page.locator('.frow', { hasText: 'lea_reelle' }).first()).toBeVisible();
  await page.locator('[data-a="fr-cancel"]').first().click();
  await expect.poll(() => listes(page).then(l => l.envoyees)).toEqual([]);
  await page.reload(); await pret(page);
  expect(await listes(page)).toMatchObject({ amis: [], recues: [], envoyees: [] });
  expect(erreurs).toEqual([]);
});

test('recette 5 · accepter une demande reçue : amis des deux côtés, 15 XP ; puis retirer cet ami', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#amis', faux: { fiches: FICHES, etat: { freqIn: [AMI], users: { [AMI]: FICHES[AMI] } } } });
  await expect(page.locator('.frow', { hasText: 'lea_reelle' })).toBeVisible();
  await page.locator('[data-a="fr-accept"]').first().click();
  await expect(toast(page, 'You and lea_reelle are friends')).toBeVisible();
  expect(await listes(page)).toEqual({ amis: [AMI], recues: [], envoyees: [], xp: 15 });
  await page.reload(); await pret(page);
  expect(await listes(page)).toEqual({ amis: [AMI], recues: [], envoyees: [], xp: 15 });
  await page.locator('[data-a="fr-remove"]').first().click();
  await expect(toast(page, 'removed from your friends')).toBeVisible();
  expect((await listes(page)).amis).toEqual([]);
  // redevenir amis ne redonne pas d'XP
  await page.evaluate(u => { __fakeSB.etat().freqIn.push(u); __fakeSB.persist(); }, AMI);   // elle redemande
  await page.reload(); await pret(page);
  await page.locator('[data-a="fr-accept"]').first().click();
  await expect.poll(() => listes(page).then(l => l.amis)).toEqual([AMI]);
  expect((await listes(page)).xp).toBe(15);
  expect(erreurs).toEqual([]);
});

test('refuser une demande ; un bot accepte tout de suite ; un refus du serveur est affiché', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#amis', faux: { fiches: FICHES, etat: { freqIn: [AMI], users: { [AMI]: FICHES[AMI] } } } });
  await page.locator('[data-a="fr-decline"]').first().click();
  await expect.poll(() => listes(page).then(l => l.recues)).toEqual([]);
  await page.locator('[data-fq]').fill('maxou');
  await page.locator('[data-fres] [data-a="fr-add"]').click();
  await expect(toast(page, 'You and maxou_bot are friends')).toBeVisible();
  expect(await listes(page)).toMatchObject({ amis: [BOT], envoyees: [], xp: 15 });
  // le serveur refuse (trop de demandes) : message clair, rien ne change
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_friend: { error: { message: 'trop_de_demandes', code: 'P0001' } } }; });
  await page.locator('[data-fq]').fill('lea');
  await page.locator('[data-fres] [data-a="fr-add"]').click();
  await expect(toast(page, 'Too many friend requests')).toBeVisible();
  expect(await listes(page)).toMatchObject({ amis: [BOT], envoyees: [] });
});

test('mode Démo : les amis restent locaux (demande acceptée par un personnage simulé, aucun appel)', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', hash: '#amis', horloge: Date.UTC(2026, 10, 15, 12) });
  await page.clock.runFor(1500); await page.keyboard.press('Escape');
  const avant = await lire(page, () => ({ amis: friendsOf().length, envoyees: fOut().length }));
  await page.locator('[data-a="fr-add"]').first().click();
  expect(await lire(page, () => fOut().length)).toBe(avant.envoyees + 1);
  await page.clock.runFor(9000);                                                              // le personnage accepte au bout de quelques secondes
  expect(await lire(page, () => ({ amis: friendsOf().length, envoyees: fOut().length }))).toEqual({ amis: avant.amis + 1, envoyees: avant.envoyees });
  expect(await lire(page, () => typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'rpc').length)).toBe(0);
});
