// Duels entre amis sur un marché, en mode Compte : défier, accepter, refuser, annuler passent par le serveur ; le
// règlement arrive avec la résolution du marché. Le faux serveur applique les mêmes règles que la base.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, UID, AMI } from '../helpers/app.mjs';

const BOT = '33333333-3333-4333-8333-333333333333';
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const fiche = (n, plus = {}) => ({ n, t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1, ...plus });
const FICHES = { [AMI]: fiche('lea_reelle'), [BOT]: fiche('maxou_bot', { bot: true }) };
const MARCHES = [{ market_id: 'btc150k', current_probability: 63, anchor_probability: 63, volume_total: 4.2e6, participants_count: 1284, liquidity_depth: 25200 }];
const duel = (id, plus = {}) => ({ id, code: 'DAAAAAA' + id, m: 'btc150k', side: 'oui', by: AMI, opp: UID, stake: 63, fee: 1.2, st: 'open', at: Date.now() - 60000, expiresAt: Date.now() + 47 * 3600e3,
  price0: 63, price: null, oppStake: null, oppFee: null, pot: null, winSide: null, acceptAt: null, settleAt: null, ...plus });
const ouvrirDuels = (page, plus = {}, hash = '#duels') => ouvrir(page, { mode: 'compte', hash, faux: { marches: MARCHES, fiches: FICHES, etat: { me: { balance: 500 }, friends: [AMI, BOT], users: FICHES, ...plus } } });
const duels = page => lire(page, () => (S.me.duels || []).map(d => ({ id: d.id, by: d.by, opp: d.opp, status: d.status, stake: d.stake, pot: d.pot, oppStake: d.oppStake, side: d.side })));
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && /^api_duel/.test(c.name)).map(c => [c.name, c.args.p ? { ...c.args.p, key: undefined } : c.args]));
const clic = (page, a, data = {}) => page.evaluate(([a, data]) => { const b = document.createElement('button'); b.dataset.a = a; Object.assign(b.dataset, data); document.body.appendChild(b); b.click(); b.remove(); }, [a, data]);

test('défier un ami : la mise part sous séquestre côté serveur, le duel est toujours là après rechargement ; l’annuler rend la mise', async ({ page }) => {
  const { erreurs } = await ouvrirDuels(page);
  expect(await duels(page), 'aucun duel inventé par le navigateur').toEqual([]);
  await clic(page, 'duel-open', { m: 'btc150k', u: AMI });
  await expect(page.locator('[data-a="dl-create"]')).toBeVisible();
  const prevu = await lire(page, () => ({ side: S.ui.duel.side, stake: F.parse(S.ui.duel.stake), opp: S.ui.duel.opp }));
  expect(prevu.opp).toBe(AMI);
  await page.locator('[data-a="dl-create"]').click();
  await expect(toast(page, 'Challenge sent to lea_reelle')).toBeVisible();
  const [d] = await duels(page);
  expect(d).toMatchObject({ by: 'me', opp: AMI, status: 'open', stake: prevu.stake, side: prevu.side });
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - prevu.stake * 1.02, 2);
  expect((await appels(page))[0]).toEqual(['api_duel_create', { m: 'btc150k', side: prevu.side, stake: prevu.stake, opp: AMI }]);
  await page.reload(); await pret(page);
  expect((await duels(page))[0]).toMatchObject({ id: d.id, status: 'open', by: 'me' });
  await page.evaluate(id => { location.hash = '#duel-' + id; }, d.id);
  await page.locator('[data-a="dl-cancel"]').first().click();
  await expect(toast(page, 'Duel cancelled')).toBeVisible();
  expect((await duels(page))[0].status).toBe('expired');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - prevu.stake * .02, 2);     // la mise revient, pas les frais
  expect(erreurs).toEqual([]);
});

test('défi reçu : accepter prend le camp inverse à la cote du marché ; refuser ne coûte rien', async ({ page }) => {
  const { erreurs } = await ouvrirDuels(page, { duelsL: [duel(71), duel(72, { stake: 20 })] }, '#duel-71');
  expect((await duels(page)).map(d => [d.id, d.by, d.opp, d.status])).toEqual([['71', AMI, 'me', 'open'], ['72', AMI, 'me', 'open']]);
  await expect(page.locator('#view')).toContainText('lea_reelle');
  await page.locator('[data-a="dl-accept"][data-id="71"]').click();
  await expect(toast(page, 'Duel accepted')).toBeVisible();
  // Oui vaut 63 ¢ : cagnotte 100, j'engage 37 (camp Non), plus 2 % de frais
  expect((await duels(page)).find(d => d.id === '71')).toMatchObject({ status: 'active', pot: 100, oppStake: 37, opp: 'me' });
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - 37 * 1.02, 2);
  await page.evaluate(() => { location.hash = '#duel-72'; });
  await page.locator('[data-a="dl-decline"][data-id="72"]').click();
  await expect(toast(page, 'Duel declined')).toBeVisible();
  await expect(page).toHaveURL(/#duels/);
  expect((await duels(page)).find(d => d.id === '72').status).toBe('declined');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - 37 * 1.02, 2);
  expect((await appels(page)).map(a => a[0] + ':' + JSON.stringify(a[1]))).toEqual(['api_duel_accept:{"id":71}', 'api_duel_close:{"p_id":72,"p_action":"decline"}']);
  expect(erreurs).toEqual([]);
});

test('résolution du marché : le duel gagné arrive par la notification du serveur ; contre un bot, accepté aussitôt', async ({ page }) => {
  const { erreurs } = await ouvrirDuels(page, { duelsL: [duel(81, { by: UID, opp: AMI, st: 'active', price: 63, pot: 100, oppStake: 37, oppFee: .7, acceptAt: Date.now() - 30000 })] });
  expect((await duels(page))[0]).toMatchObject({ id: '81', by: 'me', status: 'active' });
  await page.evaluate(([uid, ami]) => {
    const e = __fakeSB.etat(), d = e.duelsL[0]; d.st = 'regle'; d.winSide = 'oui'; d.settleAt = Date.now(); e.me.balance += 100;
    const n = { id: 'n-duel', ic: 'swords', code: 'duel_gagne', p: { id: 81, m: 'btc150k', u: ami, pnl: 37 }, href: '#duel-81', at: Date.now(), read: false };
    e.notifs.unshift(n); e.history.unshift({ k: 'res', m: 'btc150k', q: 'duel|' + ami + '|btc150k', s: 'oui', win: true, pnl: 37, at: Date.now() }); __fakeSB.persist();
    __fakeSB.emit('joueur:' + uid, 'notif', { n });
  }, [UID, AMI]);
  await expect.poll(async () => (await duels(page))[0].status).toBe('won');
  expect(await lire(page, () => ({ solde: S.me.balance, k: S.me.history[0].k, q: S.me.history[0].q, notif: JSON.stringify(S.me.notifs[0]) }))).toMatchObject({ solde: 600, k: 'duel', q: 'Duel vs lea_reelle: Bitcoin at $150,000' });
  expect(await lire(page, () => JSON.stringify(S.me.notifs[0]))).toMatch(/Duel won.*lea_reelle/);
  await page.evaluate(() => { location.hash = '#duel-81'; });
  await expect(page.locator('#view')).toContainText('Official market result: Yes.');
  // contre un bot : accepté aussitôt par le serveur
  await clic(page, 'duel-open', { m: 'btc150k', u: BOT });
  await page.locator('[data-a="dl-create"]').click();
  await expect.poll(async () => (await duels(page))[0].status).toBe('active');
  expect((await duels(page))[0]).toMatchObject({ by: 'me', opp: BOT });
  expect(erreurs).toEqual([]);
});
