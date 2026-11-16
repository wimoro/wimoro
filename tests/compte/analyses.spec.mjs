// Mode Pro en mode Compte : partager son analyse dans les chats (le serveur garde l'instantané), et afficher sans danger
// l'analyse d'un autre joueur. Le faux serveur applique les règles de supabase/migrations/…_analyses.sql ;
// tests/sql/analyses.spec.mjs les prouve côté base.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const FICHE = { n: 'lea_reelle', t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1 };
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const PREFS = { prefs: { v: 1, tmode: 'all' } };
async function ouvrirPartage(page, faux = {}) {
  const r = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { etat: PREFS, ...faux } });
  await page.locator('[data-a="pro-open"][data-m="btc150k"]').first().click();
  await expect(page.locator('#pro [data-a="pro-share"]')).toBeVisible();
  await page.locator('#pro [data-a="pro-share"]').click();
  await expect(page.locator('.pro-sh')).toBeVisible();
  return r;
}

test('partager son analyse : l’instantané part au serveur sans titre ni auteur, la carte s’affiche dans les deux chats, revient après rechargement et s’ouvre', async ({ page }) => {
  const { erreurs } = await ouvrirPartage(page);
  await expect(page.locator('.pro-sh .demo-h'), 'plus de mention « enregistrée sur cet appareil » : elle est fausse avec un compte').toHaveCount(0);
  const xp = await lire(page, () => S.me.xp);
  await page.locator('[data-psh-txt]').fill('Cassure en vue');
  await page.locator('[data-a="pro-sh-dst"][data-v="gen"]').click();                             // le chat du marché est déjà coché
  await page.locator('[data-a="pro-sh-send"]').click();
  await expect(toast(page, 'Analysis shared')).toBeVisible();
  await expect(toast(page, 'Analysis shared')).toContainText('General chat, Market chat');
  await expect(page.locator('.pro-sh')).toHaveCount(0);
  const [envoi] = await appels(page, 'api_ana_share');
  expect(envoi.p_rooms).toEqual(['general', 'm:btc150k']);
  expect(envoi.p_text).toBe('Cassure en vue');
  expect(Object.keys(envoi.p_snap).sort()).toEqual(['T0', 'c', 'dr', 'end', 'h', 'inds', 'iv', 'l', 'm', 'ms', 'n', 'o', 'side', 'type', 'vn', 'vol']);   // ni pseudo, ni titre, ni prix annoncé
  expect(envoi.p_snap.m).toBe('btc150k');
  expect(envoi.p_snap.o).toHaveLength(envoi.p_snap.n);
  expect(await lire(page, () => ({ xp: S.me.xp, gardeLocale: (S.me.pro && S.me.pro.sh || []).length }))).toEqual({ xp: xp + 2, gardeLocale: 0 });   // rien n'est gardé « sur cet appareil »
  await page.locator('#pro [data-a="pro-close"]').first().click();
  await page.evaluate(() => { location.hash = '#chat'; });
  const mienne = page.locator('.feed[data-room="general"] .msg.mine', { hasText: 'Cassure en vue' });
  await expect(mienne.locator('.anac svg.pro-svg')).toHaveCount(1);
  expect(await lire(page, () => ['general', 'm:btc150k'].map(r => S.rooms[r].msgs.filter(x => x.k === 'ana' && x.ana).length))).toEqual([1, 1]);
  // rechargement : le message revient de l'historique, son instantané est relu à part
  await page.reload(); await pret(page);
  await expect(page.locator('.feed[data-room="general"] .msg.mine .anac svg.pro-svg')).toHaveCount(1);
  const relus = await appels(page, 'api_ana');
  expect(relus.at(-1).p_msgs).toHaveLength(1);
  // ouvrir l'analyse : l'instantané, son auteur, son commentaire
  await page.locator('.feed[data-room="general"] .msg.mine .anac [data-a="pro-view"]').last().click();
  await expect(page.locator('#pro')).toContainText('Analysis by');
  await expect(page.locator('#pro .pro-cmt')).toHaveText('Cassure en vue');
  expect(await lire(page, () => ({ instantane: !!PV.snap, marche: PV.snap.m, auteur: PV.snap.by.u }))).toEqual({ instantane: true, marche: 'btc150k', auteur: 'me' });
  expect(erreurs).toEqual([]);
});

test('l’analyse d’un autre joueur est redessinée sans danger, même si elle portait du code ; une analyse non servie reste un simple message', async ({ page }) => {
  const n = 30, T = Date.now() - n * 3600000, s = x => Array.from({ length: n }, (_, i) => Math.round((x + Math.sin(i / 3) * 2) * 100) / 100);
  const piege = k => `"><img src=x onerror="window.__xss=${k}">`;
  const HOSTILE = { v: 1, m: 'btc150k', iv: '1h', type: 'bougies' + piege(1), side: 'oui', p: 63, ms: 3600000, T0: T, n, o: s(50), h: s(52), l: s(48), c: s(51), vol: s(1000), end: n + 3, vn: n + 6,
    short: piege(2), q: piege(3), txt: piege(10), by: { u: AMI, n: piege(9), t: 9, d: 9 },
    inds: [{ id: 'i1' + piege(4), k: 'sma', p: { len: 20 }, c: 'red" onload="window.__xss=5', w: '2"/><image href="x" onerror="window.__xss=6"/>', vals: { a: s(50) } },
           { id: 'i2', k: 'constructor', p: {}, c: 'ink', w: 1, vals: { a: s(1) } }],
    dr: [{ id: 'd1', k: 'text', a: [T + 5 * 3600000, 51], c: '#2448FF" onmouseover="window.__xss=7', w: 2, txt: '<img src=x onerror="window.__xss=8">' },
         { id: 'd2', k: 'trend', a: [T, 50], b: ['x', 'y'], c: 'ink', w: 2 }] };
  const SAINE = { v: 1, m: 'btc150k', iv: '4h', type: 'courbe', side: 'non', p: 63, ms: 14400000, T0: T, n, o: s(50), h: s(52), l: s(48), c: s(51), vol: s(1000), end: n + 3, vn: n + 6, inds: [], dr: [] };
  const chat = { general: [{ id: 900, u: AMI, k: 'ana', text: 'Regarde <b>ça</b>', at: Date.now() - 60000, ana: { ana: 77, m: 'btc150k', iv: '1h', ni: 1, nd: 2 } }] };
  const analyses = { 77: { u: AMI, at: Date.now() - 60000, snap: HOSTILE }, 78: { u: AMI, at: Date.now(), snap: SAINE } };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { fiches: { [AMI]: FICHE }, chat, analyses, etat: PREFS } });
  const msg = page.locator('.feed[data-room="general"] .msg', { hasText: 'Regarde' });
  await expect(msg.locator('.anac svg.pro-svg')).toHaveCount(1);
  await expect(msg.locator('.tx')).toHaveText('Regarde <b>ça</b>');                              // le texte reste du texte
  const vu = await lire(page, () => { const x = S.rooms.general.msgs.find(y => y.sid === 900), a = x.ana, carte = document.querySelector('.msg[data-id="' + x.id + '"] .anac');
    return { type: a.type, court: a.short === MK.btc150k.short, inds: a.inds.map(d => [d.k, d.c, d.w]), dr: a.dr.map(d => [d.k, d.c, d.w, d.txt]), ids: a.inds.concat(a.dr).every(d => /^[\w-]{1,24}$/.test(d.id)),
      images: carte.querySelectorAll('img, image, script').length, attributs: Array.from(carte.querySelectorAll('*')).flatMap(e => Array.from(e.attributes).map(t => t.name)).filter(t => /^on/.test(t)), xss: window.__xss }; });
  expect(vu).toEqual({ type: 'bougies', court: true, inds: [['sma', '#F59A0B', 2]], dr: [['text', '#2448FF', 2, '<img src=x onerror="window.__xss=8">']], ids: true, images: 0, attributs: [], xss: undefined });
  await expect(msg.locator('.anac svg.pro-svg text', { hasText: '<img src=x' })).toHaveCount(1);   // le texte du tracé est écrit tel quel, jamais interprété
  // ouverte dans le Mode Pro : l'auteur est celui du message, pas celui que l'instantané prétendait
  await msg.locator('[data-a="pro-view"]').last().click();
  await expect(page.locator('#pro')).toContainText('Analysis by lea_reelle');
  expect(await lire(page, () => ({ xss: window.__xss, auteur: PV.snap.by.n, images: document.querySelectorAll('#pro img[src="x"], #pro image').length }))).toEqual({ xss: undefined, auteur: 'lea_reelle', images: 0 });
  await page.locator('#pro [data-a="pro-close"]').first().click();
  // en direct : une analyse saine arrive, sa carte se dessine dès que l'instantané est lu ; une analyse que le serveur ne sert pas reste un message sans carte
  await page.evaluate(([ami, fiche]) => {
    __fakeSB.db.chat.general.push({ id: 901, u: ami, k: 'ana', text: 'En direct', at: Date.now(), ana: { ana: 78, m: 'btc150k', iv: '4h', ni: 0, nd: 0 } }); __fakeSB.persist();
    __fakeSB.emit('salon:general', 'msg', { id: 901, u: ami, k: 'ana', text: 'En direct', at: Date.now(), ana: { ana: 78, m: 'btc150k', iv: '4h', ni: 0, nd: 0 }, f: fiche });
    __fakeSB.emit('salon:general', 'msg', { id: 902, u: ami, k: 'ana', text: 'Sans instantané', at: Date.now(), ana: { ana: 79, m: 'btc150k', iv: '1h', ni: 0, nd: 0 }, f: fiche });
    __fakeSB.emit('salon:general', 'msg', { id: 903, u: ami, k: 'ana', text: 'Marché inconnu', at: Date.now(), ana: { ana: 78, m: 'nexistepas', iv: '1h', ni: 0, nd: 0 }, f: fiche });
  }, [AMI, FICHE]);
  await expect(page.locator('.feed[data-room="general"] .msg', { hasText: 'En direct' }).locator('.anac svg.pro-svg')).toHaveCount(1);
  await expect(page.locator('.feed[data-room="general"] .msg', { hasText: 'Sans instantané' })).toHaveCount(1);
  await expect(page.locator('.feed[data-room="general"] .msg', { hasText: 'Sans instantané' }).locator('.anac')).toHaveCount(0);
  await expect(page.locator('.feed[data-room="general"] .msg', { hasText: 'Marché inconnu' })).toHaveCount(0);
  expect(await lire(page, () => window.__xss)).toBeUndefined();
  expect(erreurs).toEqual([]);
});

test('refus du serveur : le message est clair, la fenêtre reste ouverte, rien n’est publié ni gardé sur l’appareil ; une analyse trop lourde n’est même pas envoyée', async ({ page }) => {
  const { erreurs } = await ouvrirPartage(page, { rpc: { api_ana_share: { error: { message: 'trop_d_analyses' } } } });
  await page.locator('[data-a="pro-sh-send"]').click();
  await expect(toast(page, 'You’ve already shared 12 analyses in 24 hours.')).toBeVisible();
  await expect(page.locator('.pro-sh')).toBeVisible();
  await expect(page.locator('[data-a="pro-sh-send"]')).toBeEnabled();
  expect(await lire(page, () => ({ messages: Object.values(S.rooms).reduce((t, r) => t + r.msgs.filter(x => x.k === 'ana' && x.u === 'me').length, 0), gardeLocale: (S.me.pro && S.me.pro.sh || []).length }))).toEqual({ messages: 0, gardeLocale: 0 });
  expect(await appels(page, 'api_ana_share')).toHaveLength(1);
  // trop lourde : refusée à l'écran, sans appel au serveur
  await page.evaluate(() => { const lourd = Array.from({ length: 4000 }, () => 12.55); PV.share.snap.inds = Array.from({ length: 24 }, () => ({ k: 'macd', p: { fast: 12, slow: 26, sig: 9 }, c: 'ink', w: 1, vals: { a: lourd, b: lourd, c: lourd } })); });
  await page.locator('[data-a="pro-sh-send"]').click();
  await expect(toast(page, 'This analysis is too heavy to share')).toBeVisible();
  expect(await appels(page, 'api_ana_share')).toHaveLength(1);
  expect(erreurs).toEqual([]);
});
