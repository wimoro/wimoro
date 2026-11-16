// Mises partagées dans le chat, en mode Compte : la carte, ses suivis et leurs XP sont tenus par le serveur.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const M = (id, p) => ({ market_id: id, current_probability: p, anchor_probability: p, volume_total: 2e6, participants_count: 500, liquidity_depth: 30000 });
const BRONZE = { xp: 400, settled: 4, wins: 2, deposits: 0, balance: 500 }, ARGENT = { xp: 900, settled: 12, wins: 7, deposits: 1, balance: 500 };
const LEA = { n: 'lea', t: 3, d: 0, tone: 1, bets: 80, acc: 60, profit: 300, fol: 4, bio: '', photo: '', color: '', bot: false, pub: 1 };
const appels = (page, re) => lire(page, src => __fakeSB.journal().filter(c => c.kind === 'rpc' && new RegExp(src).test(c.name)).map(c => [c.name, c.args]), re.source);
const cartes = (page, salon) => lire(page, s => (S.rooms[s] ? S.rooms[s].msgs : []).filter(x => x.k === 'bet').map(x => ({ u: x.u, m: x.bet.m, s: x.bet.s, amt: x.bet.amt, suivis: x.followers | 0, sid: x.sid })), salon);

test('partager une mise : carte posée par le serveur, +5 XP ; un joueur la suit : +20 XP et compteur en direct ; une seule fois par jour', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { marches: [M('btc150k', 60)], etat: { me: BRONZE, positions: [{ m: 'btc150k', s: 'oui', sh: 200, avg: 50 }], prefs: { v: 1, tmode: 'all' } } } });   // tmode « all » : comme en démo, cette bulle ne s'affiche que si le joueur veut toutes les notifications
  await page.locator('[data-a="share"]').first().click();
  await page.locator('[data-a="share-pick"][data-i="0"]').click();
  await expect.poll(async () => (await cartes(page, 'general')).length).toBe(1);
  const [c] = await cartes(page, 'general');
  expect(c).toMatchObject({ u: 'me', m: 'btc150k', s: 'oui', amt: 100, suivis: 0 });
  expect(await lire(page, () => S.me.xp)).toBe(405);                                              // +5 XP, donnés par le serveur
  expect(await appels(page, /^api_chat_share/)).toEqual([['api_chat_share', { p_room: 'general', p_market: 'btc150k', p_side: 'oui' }]]);
  await page.evaluate(id => __fakeSB.suiviBot(id, 'karim'), c.sid);                               // un joueur la suit (tâche du serveur)
  await expect(toast(page, 'karim followed your bet')).toBeVisible();
  await expect.poll(async () => (await cartes(page, 'general'))[0].suivis).toBe(1);
  await expect.poll(() => lire(page, () => ({ xp: S.me.xp, suivies: S.me.followed }))).toEqual({ xp: 425, suivies: 1 });
  expect(await lire(page, () => S.me.notifs[0].text)).toBe('karim followed your bet');
  await page.locator('[data-a="share"]').first().click();                                         // la même position, une seconde fois
  await page.locator('[data-a="share-pick"][data-i="0"]').click();
  await expect(toast(page, 'You already shared this bet today.')).toBeVisible();
  expect((await cartes(page, 'general')).length).toBe(1);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();            // la carte et son compteur viennent du serveur
  await expect.poll(async () => (await cartes(page, 'general')).map(x => x.suivis)).toEqual([1]);
  expect(erreurs).toEqual([]);
});

test('suivre la mise d’un autre joueur : après le pari, le suivi part au serveur (+5 XP), une seule fois ; annonce automatique de son propre pari', async ({ page }) => {
  const carte = { id: 900, u: AMI, k: 'bet', text: '', at: Date.now() - 60000, bet: { m: 'btc150k', s: 'oui', amt: 120, price: 60 }, fc: 2 };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { marches: [M('btc150k', 60)], chat: { general: [carte] }, fiches: { [AMI]: LEA }, etat: { me: ARGENT } } });
  await expect.poll(async () => (await cartes(page, 'general')).map(x => [x.u, x.suivis])).toEqual([[AMI, 2]]);
  await page.locator('[data-a="follow-bet"]').first().click();                                    // ouvre le ticket, prérempli
  await page.locator('[data-a="buy"]').last().click();
  await expect.poll(() => appels(page, /^api_chat_follow/)).toEqual([['api_chat_follow', { p_msg: 900 }]]);
  await expect.poll(async () => (await cartes(page, 'general'))[0].suivis).toBe(3);
  const suite = await appels(page, /^api_(buy|chat_share|chat_follow)/);
  expect(suite.map(a => a[0])).toEqual(['api_buy', 'api_chat_follow', 'api_chat_share']);          // le pari, le suivi, puis l'annonce dans le salon du marché
  expect(suite[2][1]).toEqual({ p_room: 'm:btc150k', p_market: 'btc150k', p_side: 'oui' });
  await expect.poll(() => lire(page, () => S.me.xp)).toBe(900 + 10 + 5 + 5);                      // pari, suivi, annonce
  expect(erreurs).toEqual([]);
});
