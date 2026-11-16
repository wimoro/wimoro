// Salon VIP en mode Compte : relié au serveur pour les joueurs du rang Ascendant (sujet privé « vip »), fermé pour les
// autres comme à l'écran. Le faux serveur applique les règles de supabase/migrations/…_salon_vip.sql ;
// tests/sql/salon-vip.spec.mjs les prouve côté base.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const FICHE = { n: 'lea_reelle', t: 6, d: 0, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 240, fol: 120, bot: false, pub: 1 };
const ASCENDANT = { xp: 4600, settled: 200, wins: 130, deposits: 1, flashWins: 3, followed: 100, balance: 500 };
const ARGENT = { xp: 900, settled: 12, wins: 7, deposits: 1, balance: 500 };
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const CHAT = { vip: [{ id: 700, u: AMI, k: 'msg', text: 'Bienvenue au salon', at: Date.now() - 60000, r: { '🔥': 2 } }] };

test('rang Ascendant : le salon VIP s’ouvre, son historique vient du serveur, on y écrit et on y reçoit en direct, sur un sujet privé', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { fiches: { [AMI]: FICHE }, chat: CHAT, etat: { me: ASCENDANT, prefs: { v: 1, tmode: 'all' } } } });
  expect(await lire(page, () => can('vip'))).toBe(true);
  await page.locator('[data-a="troom"][data-room="vip"]').first().click();
  const fil = page.locator('.feed[data-room="vip"]');
  await expect(fil.locator('.msg', { hasText: 'Bienvenue au salon' })).toHaveCount(1);              // l'historique du serveur
  await expect(page.locator('.vipprev')).toHaveCount(0);
  expect(await appels(page, 'api_chat_history')).toContainEqual({ p_room: 'vip' });
  expect(await lire(page, () => API.topics().filter(t => /vip/.test(t))), 'un seul sujet, privé : jamais « salon:vip »').toEqual(['vip']);
  const champ = page.locator('.composer input[data-in="vip"]');
  await champ.fill('Bonsoir à tous'); await champ.press('Enter');
  await expect(fil.locator('.msg.mine', { hasText: 'Bonsoir à tous' })).toHaveCount(1);
  expect(await appels(page, 'api_chat_send')).toEqual([{ p_room: 'vip', p_text: 'Bonsoir à tous' }]);
  await expect(toast(page, 'Coming soon for accounts')).toHaveCount(0);
  // un autre joueur du salon écrit : reçu en direct par le sujet privé
  await page.evaluate(([ami, fiche]) => __fakeSB.emit('vip', 'msg', { id: 701, u: ami, k: 'msg', text: 'Qui est sur la manche de 22 h ?', at: Date.now(), f: fiche }), [AMI, FICHE]);
  await expect(fil.locator('.msg', { hasText: 'Qui est sur la manche de 22 h ?' })).toHaveCount(1);
  // réagir : le compteur vient du serveur
  await fil.locator('.msg', { hasText: 'Bienvenue au salon' }).locator('[data-a="react"][data-e="🔥"]').click();
  await expect(fil.locator('.msg', { hasText: 'Bienvenue au salon' }).locator('[data-a="react"][data-e="🔥"]')).toHaveText('🔥 3');
  expect(await appels(page, 'api_chat_react')).toEqual([{ p_room: 'vip', p_msg: '700', p_emoji: '🔥' }]);
  // rechargé : tout revient du serveur
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  await page.locator('[data-a="troom"][data-room="vip"]').first().click();
  await expect(page.locator('.feed[data-room="vip"] .msg.mine', { hasText: 'Bonsoir à tous' })).toHaveCount(1);
  expect(erreurs).toEqual([]);
});

test('sans le rang : le salon VIP reste l’aperçu verrouillé de l’écran ; rien n’est demandé au serveur, aucun sujet n’est écouté', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { fiches: { [AMI]: FICHE }, chat: CHAT, etat: { me: ARGENT, prefs: { v: 1, tmode: 'all' } } } });
  expect(await lire(page, () => can('vip'))).toBe(false);
  await page.locator('[data-a="troom"][data-room="vip"]').first().click();                         // le salon se choisit, mais n'affiche que son aperçu verrouillé
  await expect(page.locator('.vipprev')).toHaveCount(1);
  await expect(page.locator('.vipprev')).toContainText('Ascendant rank only');
  await expect(page.locator('.feed[data-room="vip"]')).toHaveCount(0);
  await expect(page.locator('#view')).not.toContainText('Bienvenue au salon');
  expect((await appels(page, 'api_chat_history')).filter(a => a.p_room === 'vip')).toEqual([]);
  expect(await lire(page, () => API.topics().filter(t => /vip/.test(t)))).toEqual([]);
  // et si l'on force l'appel : le serveur refuse
  expect(await lire(page, async () => { try { await API.call('api_chat_history', { p_room: 'vip' }); return 'accepté'; } catch (e) { return e.code; } })).toBe('rang_insuffisant');
  expect(erreurs).toEqual([]);
});
