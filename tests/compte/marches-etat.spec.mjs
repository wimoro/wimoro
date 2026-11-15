// Ce que l'écran fait des décisions prises dans le panel d'administration : marché fermé, résolu, créé ; message masqué ;
// compte suspendu ; solde ajusté. Tout arrive par le serveur (annonce « etat », notification privée, refus).
import { test, expect } from '@playwright/test';
import { ouvrir, lire, UID, AMI } from '../helpers/app.mjs';

const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const M = (id, p, plus = {}) => ({ market_id: id, current_probability: p, anchor_probability: p, volume_total: 1e6, participants_count: 100, liquidity_depth: 20000, ...plus });
const dansLesListes = page => lire(page, () => ['btc150k', 'clasico', 'pluie-paris'].map(id => MARKETS.some(m => m.id === id)));
const FICHE = { n: 'lea_reelle', t: 3, d: 1, tone: 2, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 12, fol: 3, bot: false, pub: 1 };

test('un marché résolu quitte les listes, un marché créé depuis le panel y entre, un marché fermé refuse les mises', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#accueil', faux: { marches: [M('btc150k', 63), M('clasico', 54)] } });
  expect(await dansLesListes(page)).toEqual([true, true, false]);
  const lectures = () => lire(page, () => __fakeSB.calls.filter(c => c.name === 'api_markets').length);
  const avant = await lectures();
  await page.evaluate(() => {
    const d = __fakeSB.db.marches; d.clasico.st = 'resolved'; d.btc150k.st = 'closed';
    d['pluie-paris'] = { p: 40, d0: 40, vol: 0, people: 0, liq: 6000, st: 'open', hot: 0, ph: [], def: { q: 'Pleuvra-t-il à Paris dimanche ?', short: 'Pluie à Paris', cat: 'Météo', date: '2027-03-07', time: '18:00', rules: 'Oui si Météo-France relève au moins 1 mm.', heat: 2 } };
    __fakeSB.persist();
    __fakeSB.emit('marches', 'etat', { id: 'clasico', st: 'resolved', o: 'oui' }); __fakeSB.emit('marches', 'etat', { id: 'pluie-paris', st: 'open' });
  });
  await expect.poll(() => dansLesListes(page)).toEqual([true, false, true]);
  expect(await lectures() - avant, 'deux annonces, une seule relecture').toBe(1);
  expect(await lire(page, () => ({ ferme: MK.btc150k.st, resolu: MK.clasico.st, q: MK['pluie-paris'].q, cat: MK['pluie-paris'].cat, p: MK['pluie-paris'].p, regles: MK['pluie-paris'].rules })))
    .toEqual({ ferme: 'closed', resolu: 'resolved', q: 'Pleuvra-t-il à Paris dimanche ?', cat: 'Météo', p: 40, regles: 'Oui si Météo-France relève au moins 1 mm.' });
  await page.evaluate(() => { location.hash = '#marche-pluie-paris'; });
  await expect(page.locator('#view')).toContainText('Pleuvra-t-il à Paris dimanche ?');
  await expect(page.locator('#view')).toContainText('Oui si Météo-France relève au moins 1 mm.');
  // marché fermé : le serveur refuse, l'écran le dit
  expect(await lire(page, async () => { try { await API.call('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 10, p_key: crypto.randomUUID() }); return 'accepté'; } catch (e) { return errTxt(e); } })).toBe('This market is closed.');
  // après rechargement : même catalogue
  await page.reload(); await pret(page);
  expect(await dansLesListes(page)).toEqual([true, false, true]);
  await expect(page.locator('#view')).toContainText('Pleuvra-t-il à Paris dimanche ?');
  expect(erreurs).toEqual([]);
});

test('marché résolu ou solde ajusté : la notification arrive en direct et l’état est relu sur le serveur', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#accueil', faux: { marches: [M('btc150k', 63), M('clasico', 54)], etat: { me: { balance: 500 } } } });
  const etats = () => lire(page, () => __fakeSB.calls.filter(c => c.name === 'api_state').length);
  const n0 = await etats();
  await page.evaluate(uid => {
    const n = { id: 'n-res', ic: 'trophy', code: 'marche_resolu', p: { m: 'btc150k', s: 'oui', o: 'oui', pay: 120.5, pnl: 20.5 }, href: '#profil', at: Date.now(), read: false };
    __fakeSB.etat().me.balance = 620.5; __fakeSB.etat().notifs.unshift(n); __fakeSB.persist();  // ce que le serveur a fait : payer la position gagnante et l'écrire
    __fakeSB.emit('joueur:' + uid, 'notif', { n });
  }, UID);
  await expect.poll(() => lire(page, () => S.me.balance)).toBe(620.5);
  expect(await etats()).toBe(n0 + 1);
  expect(await lire(page, () => JSON.stringify(S.me.notifs[0]))).toMatch(/Market resolved: .*You win \$?120[.,]50?/);
  await page.evaluate(uid => {
    const perdu = { id: 'n-perdu', ic: 'info', code: 'marche_resolu', p: { m: 'clasico', s: 'non', o: 'oui', pay: 0, pnl: -50 }, href: '#profil', at: Date.now(), read: false };
    const ajuste = { id: 'n-adm', ic: 'wallet', code: 'admin_solde', p: { delta: -25 }, href: '#profil', at: Date.now() + 1, read: false };
    __fakeSB.etat().notifs.unshift(perdu); __fakeSB.etat().notifs.unshift(ajuste); __fakeSB.persist();
    __fakeSB.emit('joueur:' + uid, 'notif', { n: perdu }); __fakeSB.emit('joueur:' + uid, 'notif', { n: ajuste });
  }, UID);
  await expect.poll(() => lire(page, () => S.me.notifs.length)).toBe(3);
  const textes = await lire(page, () => S.me.notifs.map(n => JSON.stringify(n)));
  expect(textes[0]).toMatch(/The Wimoro team debited \$?25/);
  expect(textes[1]).toMatch(/Market resolved: .*Your No position lost\./);
  expect(erreurs).toEqual([]);
});

test('modération : un message masqué disparaît de l’écran sans rechargement', async ({ page }) => {
  const histo = [{ id: 7, u: AMI, k: 'msg', text: 'message déplacé', at: Date.now() - 60000 }, { id: 8, u: AMI, k: 'msg', text: 'message correct', at: Date.now() - 30000 }];
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { chat: { general: histo }, fiches: { [AMI]: FICHE } } });
  const feed = page.locator('.feed[data-room="general"]');
  await expect(feed).toContainText('message déplacé');
  await page.evaluate(() => { __fakeSB.emit('salon:general', 'del', { id: 7 }); });
  await expect(feed).not.toContainText('message déplacé');
  await expect(feed).toContainText('message correct');
  expect(await lire(page, () => room('general').msgs.map(x => x.text))).toEqual(['message correct']);
  expect(erreurs).toEqual([]);
});

test('compte suspendu : le serveur refuse, l’écran déconnecte et l’explique', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#chat' });
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_chat_send: { error: { message: 'suspendu', code: 'P0001', details: '-1' } } }; });
  const champ = page.locator('.composer input[data-in="general"]');
  await champ.fill('bonjour'); await champ.press('Enter');
  await expect(page).toHaveURL(/#connexion/, { timeout: 15000 }); await pret(page);
  await expect(page.locator('.limit.over').first()).toContainText('This account is suspended.');
  expect(await lire(page, () => ({ srv: SRV(), connecte: S.me.logged, jeton: localStorage.getItem('wimoro-auth') }))).toEqual({ srv: false, connecte: false, jeton: null });
});

test('rattrapage : un changement de prix manqué entre la première lecture et l’abonnement est repris, sans écraser un tick plus récent', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#accueil', faux: { marches: [M('btc150k', 63), M('clasico', 54)] } });
  expect(await lire(page, () => __fakeSB.journal().filter(c => c.name === 'api_markets').length), 'une lecture, puis une relecture une fois abonné').toBe(2);
  expect(await lire(page, () => [MK.btc150k.p, MK.clasico.p])).toEqual([63, 54]);
  // le serveur a bougé sans que l'écran reçoive le tick (c'est ce qui arrive pendant l'établissement de l'abonnement)
  await page.evaluate(() => { __fakeSB.db.marches.btc150k.p = 70; __fakeSB.db.marches.btc150k.vol = 1000500; __fakeSB.persist(); });
  await page.evaluate(() => srvMarchesRattraper());
  expect(await lire(page, () => [MK.btc150k.p, MK.btc150k.vol])).toEqual([70, 1000500]);
  // un tick plus récent que la relecture l'emporte : la relecture, plus ancienne, ne l'écrase pas
  await page.evaluate(() => {
    __fakeSB.emit('marches', 'tick', { t: Date.now() + 60000, m: { clasico: [40, 1000900, 100, 20000] } });
    __fakeSB.db.marches.clasico.p = 55; __fakeSB.persist();                                 // ce que renverrait une lecture partie avant ce tick
  });
  await page.evaluate(() => srvMarchesRattraper());
  expect(await lire(page, () => [MK.clasico.p, MK.btc150k.p])).toEqual([40, 70]);
  expect(erreurs).toEqual([]);
});
