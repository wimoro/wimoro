// État du joueur en mode Compte : le serveur fait autorité, l'état survit à un rechargement, et le site
// n'envoie que ce qui a changé. Couvre B05 (état écrasé), B06 (positions perdues), B14 (KYC), B19 (sauvegarde).
import { test, expect } from '@playwright/test';
import { ouvrir, lire, aller } from '../helpers/app.mjs';

const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const ecritures = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && !/^(api_state|get_markets)$/.test(c.name)).map(c => c.name));

test('B06, B14 · positions, KYC et historique viennent des tables du serveur et survivent au rechargement', async ({ page }) => {
  const etat = { me: { kyc: true, kycAt: Date.now() - 864e5, balance: 450 }, positions: [{ m: 'btc150k', s: 'oui', sh: 81.3, avg: 61.5 }], history: [{ k: 'sell', m: 'eth6000', s: 'non', win: false, pnl: -4.2, at: Date.now() - 5e6 }] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', faux: { etat } });
  const lu = () => lire(page, () => ({ kyc: S.me.kyc, solde: S.me.balance, pos: S.me.positions, hist: S.me.history.length, cache: Object.keys(localStorage).filter(k => /^wimoro-(srv|acc|demo)/.test(k)) }));
  const a = await lu();
  expect(a).toEqual({ kyc: true, solde: 450, pos: [{ m: 'btc150k', s: 'oui', sh: 81.3, avg: 61.5 }], hist: 1, cache: [] });   // rien du compte n'est gardé dans le navigateur
  await page.reload(); await pret(page);
  expect(await lu()).toEqual(a);
  await aller(page, 'depot');
  await expect(page.locator('.kycok').first()).toBeVisible();                              // KYC vérifié : moyens de paiement débloqués
  expect(erreurs).toEqual([]);
});

test('B19 · un réglage modifié = un seul envoi, et seulement des réglages', async ({ page }) => {
  await ouvrir(page, { mode: 'compte' });
  await page.evaluate(() => { for (let i = 0; i < 5; i++) { S.me.tmode = ['all', 'imp', 'none'][i % 3]; save(); } });   // 5 sauvegardes rapprochées
  await page.waitForTimeout(1000);
  expect(await ecritures(page)).toEqual(['api_prefs_save']);
  const envoi = await lire(page, () => __fakeSB.journal().find(c => c.name === 'api_prefs_save').args.p_prefs);
  expect(Object.keys(envoi).sort()).toEqual(['blockedShown', 'ctype', 'falerts', 'fmode', 'prefs', 'tmode', 'v', 'watch']);
  await page.evaluate(() => { save(); save(); flushSave(); });                              // rien n'a changé : rien n'est envoyé
  await page.waitForTimeout(900);
  expect(await ecritures(page)).toEqual(['api_prefs_save']);
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.tmode)).toBe('imp');                                    // 5e valeur : ['all','imp','none'][4 % 3]
});

test('pseudo : validé par le serveur avant d’être appliqué ; déjà pris = refusé, rien ne change', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', lang: 'fr', hash: '#profil', faux: { comptes: {} } });
  const res = await page.evaluate(async () => {
    const o = {};
    try { await srvProfil({ n: 'admin' }); o.admin = 'accepté'; } catch (e) { o.admin = e.code; }
    o.apresRefus = S.me.n;
    await srvProfil({ n: 'Nouveau.Nom', bio: 'Salut' });
    o.apres = { n: S.me.n, bio: S.me.bio };
    return o;
  });
  expect(res).toEqual({ admin: 'pseudo_pris', apresRefus: 'realuser', apres: { n: 'Nouveau.Nom', bio: 'Salut' } });
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.n)).toBe('Nouveau.Nom');
  await expect(page.locator('#view')).toContainText('Nouveau.Nom');
});

test('notifications : lues, effacée, toutes effacées — côté serveur, donc encore vrai après rechargement', async ({ page }) => {
  const notifs = [1, 2, 3].map(i => ({ id: 'n' + i, ic: 'gift', code: 'mission_done', p: { id: 'dep1', xp: 100 }, href: '#rang', at: Date.now() - i * 6e4, read: false }));
  await ouvrir(page, { mode: 'compte', lang: 'fr', faux: { etat: { notifs } } });
  await expect(page.locator('[data-nbadge]').first()).toHaveText('3');
  await page.locator('[data-a="notifs"]').first().click();
  await expect(page.locator('#npanel .nitem').first()).toContainText('Mission terminée : Fais ton premier dépôt. Récupère tes 100 XP.');
  await expect(page.locator('[data-nbadge]').first()).toHaveText('');
  await page.locator('#npanel [data-a="np-del"]').first().click();
  await expect(page.locator('#npanel .nitem')).toHaveCount(2);
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.notifs.map(n => [n.id, n.read]))).toEqual([['n2', true], ['n3', true]]);
  await page.locator('[data-a="notifs"]').first().click();
  await page.locator('#npanel [data-a="np-clear"]').click();
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.notifs.length)).toBe(0);
  expect(await ecritures(page)).toEqual(['api_notifs_read', 'api_notif_hide', 'api_notif_hide']);
});

test('le popup « nouveau rang » ne s’affiche qu’une fois par rang et par compte', async ({ page }) => {
  // compte déjà Fer III (250 XP) qui se connecte : pas de popup pour un rang atteint avant cette session
  await ouvrir(page, { mode: 'compte', faux: { etat: { me: { xp: 250, obBonus: false, rankSeen: 0 } } } });
  await page.waitForTimeout(700);
  await expect(page.locator('.rankup')).toHaveCount(0);
  expect(await lire(page, () => __fakeSB.etat().me.rankSeen)).toBe(2);                         // Fer III = rang 0, division 2
});

test('retour sur l’onglet : l’état est relu (un autre appareil a pu jouer entre-temps)', async ({ page }) => {
  await ouvrir(page, { mode: 'compte' });
  expect(await lire(page, () => S.me.balance)).toBe(500);
  await page.evaluate(() => { __fakeSB.etat().me.balance = 1234.5; __fakeSB.etat().positions.push({ m: 'clasico', s: 'non', sh: 10, avg: 45 }); __fakeSB.persist(); });
  await page.evaluate(() => { srvVu = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => lire(page, () => S.me.balance)).toBe(1234.5);
  expect(await lire(page, () => S.me.positions.length)).toBe(1);
});
