// Réactions sous les messages, en mode Compte : les compteurs sont tenus par le serveur et vus en direct.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, UID, AMI } from '../helpers/app.mjs';

const FICHE = { n: 'lea_reelle', t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1 };
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const etatMsg = (page, salon, sid) => lire(page, ([s, id]) => { const x = (S.rooms[s] ? S.rooms[s].msgs : []).find(y => y.sid === id); return x ? { r: x.r, my: x.my } : null; }, [salon, sid]);

test('réagir à un message : compteur donné par le serveur, second clic pour retirer, réaction d’un autre joueur reçue en direct, tout revient après rechargement', async ({ page }) => {
  const chat = { general: [{ id: 800, u: AMI, k: 'msg', text: 'Le clasico va être serré', at: Date.now() - 60000, r: { '🔥': 3 } }] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { fiches: { [AMI]: FICHE }, chat, etat: { prefs: { v: 1, tmode: 'all' } } } });
  const msg = page.locator('.feed[data-room="general"] .msg', { hasText: 'Le clasico va être serré' });
  await expect(msg).toHaveCount(1);
  const feu = msg.locator('[data-a="react"][data-e="🔥"]');
  await expect(feu).toHaveText('🔥 3');                                                        // le compteur vient de l'historique du serveur
  await expect(feu).not.toHaveClass(/on/);
  await feu.click();
  await expect(feu).toHaveText('🔥 4'); await expect(feu).toHaveClass(/on/);
  expect(await appels(page, 'api_chat_react')).toEqual([{ p_room: 'general', p_msg: '800', p_emoji: '🔥' }]);
  await msg.locator('[data-a="react-pal"]').click();                                           // une autre réaction, par la palette
  await msg.locator('.pal [data-a="react"][data-e="🎯"]').click();
  await expect(msg.locator('[data-a="react"][data-e="🎯"]')).toHaveText('🎯 1');
  expect(await etatMsg(page, 'general', 800)).toEqual({ r: { '🔥': 4, '🎯': 1 }, my: ['🔥', '🎯'] });
  await feu.click();                                                                           // second clic : retirée
  await expect(feu).toHaveText('🔥 3'); await expect(feu).not.toHaveClass(/on/);
  expect(await etatMsg(page, 'general', 800)).toEqual({ r: { '🔥': 3, '🎯': 1 }, my: ['🎯'] });
  // un autre joueur réagit : le serveur diffuse le nouveau compteur, sans dire qui
  await page.evaluate(() => __fakeSB.reactionBot(800, '🔥', 'karim', false));
  await expect(feu).toHaveText('🔥 4'); await expect(feu).not.toHaveClass(/on/);
  // on réagit à mon message : une bulle et 1 XP, donnés par le serveur
  const champ = page.locator('.composer input[data-in="general"]');
  await champ.fill('Je dis 2-1'); await champ.press('Enter');
  const mien = page.locator('.feed[data-room="general"] .msg.mine', { hasText: 'Je dis 2-1' });
  await expect(mien).toHaveCount(1);
  const sid = await lire(page, () => S.rooms.general.msgs.find(x => x.u === 'me' && x.text === 'Je dis 2-1').sid);
  const xp = await lire(page, () => S.me.xp);
  await page.evaluate(id => __fakeSB.reactionBot(id, '💸', 'karim', true), sid);
  await expect(toast(page, 'karim reacted 💸 to your message')).toBeVisible();
  await expect(mien.locator('[data-a="react"][data-e="💸"]')).toHaveText('💸 1');
  await expect.poll(() => lire(page, () => S.me.xp)).toBe(xp + 1);
  // rechargé : compteurs et « mes réactions » reviennent du serveur
  await page.reload(); await pret(page);
  await expect(msg.locator('[data-a="react"][data-e="🔥"]')).toHaveText('🔥 4');
  await expect(msg.locator('[data-a="react"][data-e="🎯"]')).toHaveClass(/on/);
  expect(await etatMsg(page, 'general', 800)).toEqual({ r: { '🔥': 4, '🎯': 1 }, my: ['🎯'] });
  expect(await etatMsg(page, 'general', sid)).toEqual({ r: { '💸': 1 }, my: [] });
  expect(erreurs).toEqual([]);
});

test('conversation privée : la réaction passe par le serveur ; celle de l’autre arrive par le sujet privé ; un refus du serveur est dit, rien ne bouge', async ({ page }) => {
  const SALON = 'dm:' + [UID, AMI].sort().join(':');
  const chat = { [SALON]: [{ id: 801, u: AMI, k: 'msg', text: 'Tu joues ce soir ?', at: Date.now() - 60000 }] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#amis', faux: { fiches: { [AMI]: FICHE }, etat: { me: { xp: 400, settled: 3 }, friends: [AMI], users: { [AMI]: FICHE } }, chat } });
  await page.locator('.frow', { hasText: 'lea_reelle' }).locator('[data-a="dm"]').click();
  const msg = page.locator(`.feed[data-room="dm:${AMI}"] .msg`, { hasText: 'Tu joues ce soir ?' });
  await expect(msg).toHaveCount(1);
  await msg.locator('[data-a="react-pal"]').click();
  await msg.locator('.pal [data-a="react"][data-e="👀"]').click();
  await expect(msg.locator('[data-a="react"][data-e="👀"]')).toHaveText('👀 1');
  expect(await appels(page, 'api_chat_react')).toEqual([{ p_room: 'dm:' + AMI, p_msg: '801', p_emoji: '👀' }]);
  // l'autre participant réagit : poussé sur mon sujet privé
  await page.evaluate(([u, moi]) => __fakeSB.emit('joueur:' + moi, 're', { id: 801, r: { '👀': 2 }, u }), [AMI, UID]);
  await expect(msg.locator('[data-a="react"][data-e="👀"]')).toHaveText('👀 2');
  await expect(msg.locator('[data-a="react"][data-e="👀"]')).toHaveClass(/on/);                // la mienne reste la mienne
  // le serveur refuse (message retiré entre-temps) : c'est dit, et l'écran ne change pas
  await page.evaluate(s => { __fakeSB.db.chat[s].length = 0; __fakeSB.persist(); }, SALON);
  await msg.locator('[data-a="react"][data-e="👀"]').click();
  await expect(toast(page, 'This message is no longer available.')).toBeVisible();
  await expect(msg.locator('[data-a="react"][data-e="👀"]')).toHaveText('👀 2');
  expect(erreurs).toEqual([]);
});
