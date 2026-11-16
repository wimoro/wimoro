// Chat de clan en mode Compte : un salon réservé aux membres, tenu par le serveur, reçu par un sujet PRIVÉ.
// tests/sql/clan-chat.spec.mjs prouve côté base qu'un joueur d'un autre clan ne peut ni lire, ni écrire, ni s'abonner.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const BOT = '99999999-9999-4999-8999-999999999999';
const FICHES = {
  [AMI]: { n: 'lea_reelle', t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1, clan: 'c1' },
  [BOT]: { n: 'karim', t: 3, d: 0, tone: 2, color: '', photo: '', bio: '', profit: 0, acc: 0, bets: 40, fol: 0, bot: true, pub: 1, clan: null },
};
const SALON = 'clan:c1';
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const fil = page => lire(page, s => (S.rooms[s] ? S.rooms[s].msgs : []).filter(x => x.k !== 'evt').map(x => [x.u, x.text, x.sid]), SALON);
const essai = (page, nom, args) => page.evaluate(async ([nom, args]) => { try { await API.call(nom, args); return 'accepté'; } catch (e) { return e.code; } }, [nom, args]);

test('chat du clan : ouvert en rejoignant le clan, historique et messages donnés par le serveur, reçus par le sujet privé du clan ; fermé en le quittant', async ({ page }) => {
  const chat = { [SALON]: [
    { id: 'b1', u: BOT, k: 'msg', text: '', tpl: { g: 'C', i: 0 }, at: Date.now() - 12 * 60000 },
    { id: 810, u: AMI, k: 'msg', text: 'Salut le clan', at: Date.now() - 60000, r: { '🔥': 1 } },
  ] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#clan-c1', faux: { fiches: FICHES, chat, etat: { me: { xp: 400, settled: 3, balance: 300 } } } });
  // pas encore membre : le salon n'existe pas pour ce joueur
  expect(await essai(page, 'api_chat_history', { p_room: SALON })).toBe('salon_indisponible');
  expect(await essai(page, 'api_chat_send', { p_room: SALON, p_text: 'je passe' })).toBe('salon_indisponible');
  await page.locator('[data-a="cl-join"]').first().click();
  await expect(toast(page, 'Welcome to')).toBeVisible();
  await page.locator('[data-a="cl-ctab"][data-v="chat"]').click();
  const feed = page.locator('.feed[data-room="' + SALON + '"]');
  await expect(feed.locator('.msg')).toHaveCount(2);
  // l'accueil vient du serveur (gabarit traduit à l'écran), plus rien n'est inventé par le navigateur
  expect(await fil(page)).toEqual([[BOT, await lire(page, () => _t('Qui prend le Clásico ce soir ?')), 'b1'], [AMI, 'Salut le clan', 810]]);
  await expect(feed.locator('.msg').nth(1).locator('[data-a="react"][data-e="🔥"]')).toHaveText('🔥 1');
  // abonnement : le sujet privé du clan, jamais un sujet public
  expect(await lire(page, () => __fakeSB.prives())).toContain(SALON);
  expect(await lire(page, () => __fakeSB.sujets().filter(s => s.startsWith('salon:clan')))).toEqual([]);
  // écrire
  const champ = page.locator('.composer input[data-in="' + SALON + '"]');
  await champ.fill('Bonsoir à tous'); await champ.press('Enter');
  await expect(feed.locator('.msg.mine', { hasText: 'Bonsoir à tous' })).toHaveCount(1);
  expect(await appels(page, 'api_chat_send')).toEqual([{ p_room: SALON, p_text: 'je passe' }, { p_room: SALON, p_text: 'Bonsoir à tous' }]);   // le premier, avant d'être membre, avait été refusé
  // un autre membre écrit : reçu en direct par le sujet privé
  await page.evaluate(([s, u, f]) => __fakeSB.emit(s, 'msg', { id: 811, u, k: 'msg', text: 'On se retrouve sur le clasico', at: Date.now(), f }), [SALON, AMI, FICHES[AMI]]);
  await expect(feed.locator('.msg', { hasText: 'On se retrouve sur le clasico' })).toHaveCount(1);
  // réagir : même fonction que dans les autres salons
  await feed.locator('.msg').nth(1).locator('[data-a="react"][data-e="🔥"]').click();
  await expect(feed.locator('.msg').nth(1).locator('[data-a="react"][data-e="🔥"]')).toHaveText('🔥 2');
  expect(await appels(page, 'api_chat_react')).toEqual([{ p_room: SALON, p_msg: '810', p_emoji: '🔥' }]);
  await page.waitForTimeout(1500);
  expect((await fil(page)).every(x => x[2] != null), 'tous les messages viennent du serveur').toBe(true);
  expect(await fil(page)).toHaveLength(4);
  // rechargé : tout revient du serveur
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  await page.locator('[data-a="cl-ctab"][data-v="chat"]').click();
  await expect(feed.locator('.msg')).toHaveCount(3);                                             // le message reçu en direct n'était qu'une diffusion simulée
  // quitter le clan : plus d'abonnement, plus d'accès
  await page.locator('[data-a="cl-leave"]').first().click();
  await page.locator('[data-a="cl-leave-do"]').click();
  await expect.poll(() => lire(page, () => S.me.clan)).toBeNull();
  await expect.poll(() => lire(page, () => __fakeSB.prives().filter(s => s.startsWith('clan:')))).toEqual([]);
  expect(await essai(page, 'api_chat_history', { p_room: SALON })).toBe('salon_indisponible');
  expect(erreurs).toEqual([]);
});
