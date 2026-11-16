// Duels sur une manche éclair en mode Compte : créer, accepter et régler passent par le serveur (Edge Function « eclair »,
// même moteur que l'écran). Le faux serveur applique les règles de supabase/migrations/…_duels_eclair.sql ;
// tests/sql/duels-eclair.spec.mjs les prouve côté base.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { ouvrir, lire, debutManche, UID, AMI } from '../helpers/app.mjs';

const bac = {}; bac.globalThis = bac; vm.runInNewContext(fs.readFileSync('js/moteur-eclair.js', 'utf8'), bac);
const ME = bac.MoteurEclair;
/** une manche du jeu `gid` dont l'issue est `out` (1 : premier camp, 0 : second, 2 : break even) : le moteur est déterministe */
const mancheOu = (gid, out) => { for (let r = 1001; r < 3000; r++) if (ME.issue(ME.JEUX[gid], r) === out) return r; throw new Error('aucune manche'); };
const BOT = '33333333-3333-4333-8333-333333333333';
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const fiche = (n, plus = {}) => ({ n, t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1, ...plus });
const FICHES = { [AMI]: fiche('lea_reelle'), [BOT]: fiche('maxou_bot', { bot: true }) };
const ouvrirDuels = (page, horloge, plus = {}, hash = '#duels') => ouvrir(page, { mode: 'compte', hash, horloge, faux: { fiches: FICHES, etat: { me: { balance: 500 }, friends: [AMI, BOT], users: FICHES, ...plus } } });
const duels = page => lire(page, () => (S.me.duels || []).map(d => ({ id: d.id, m: d.m, round: d.round, by: d.by, opp: d.opp, status: d.status, stake: d.stake, pot: d.pot, oppStake: d.oppStake, side: d.side, price: d.price, preuve: d.proof && d.proof.txt })));
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'fn' && c.name === 'eclair').map(c => { const a = {}; for (const k in c.args) if (c.args[k] !== undefined && c.args[k] !== null) a[k] = c.args[k]; return a; }));
const clic = (page, a, data = {}) => page.evaluate(([a, data]) => { const b = document.createElement('button'); b.dataset.a = a; Object.assign(b.dataset, data); document.body.appendChild(b); b.click(); b.remove(); }, [a, data]);
/** défie le bot ami sur le Bitcoin, au début de la manche `r`, puis laisse la manche se terminer */
async function jouer(page, r) {
  const { erreurs } = await ouvrirDuels(page, debutManche(r - 1) + 2000);
  await clic(page, 'duel-open', { m: 'flash:btc', u: BOT });
  await expect(page.locator('#ov')).toContainText('Flash round: your friend must accept before betting closes');
  await page.locator('[data-a="dl-create"]').click();
  await expect(toast(page, 'Challenge sent to maxou_bot')).toBeVisible();
  const [d] = await duels(page), srv = await lire(page, () => __fakeSB.etat().duelsL[0]);
  expect(d).toMatchObject({ m: 'flash:btc', round: r, by: 'me', opp: BOT, status: 'active', stake: 25, side: 'oui', price: srv.price, pot: srv.pot });   // le bot accepte aussitôt, au prix du serveur
  expect(srv.fee).toBeGreaterThan(0);
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - 25 - srv.fee, 2);
  expect(await appels(page)).toEqual([{ action: 'duel_create', gid: 'btc', side: 'oui', stake: 25, opp: BOT }]);
  return { erreurs, d, srv };
}
const finDeManche = async page => { await page.clock.runFor(44000); await page.clock.runFor(3000); };   // la manche se termine, puis l'écran demande le règlement

test('défier un bot ami sur une manche éclair gagnante : mise prise par le serveur, accepté aussitôt, cagnotte payée à la fin de la manche, toujours là après rechargement', async ({ page }) => {
  const r = mancheOu('btc', 1), { erreurs, d, srv } = await jouer(page, r);
  await page.reload(); await pret(page);                                                       // en cours de manche : le duel vient du serveur
  expect((await duels(page))[0]).toMatchObject({ id: d.id, status: 'active', round: r });
  await finDeManche(page);
  await expect.poll(async () => (await duels(page))[0].status).toBe('won');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - 25 - srv.fee + srv.pot, 2);
  await expect.poll(() => lire(page, () => S.me.history.length)).toBe(1);                       // l'historique est relu sur le serveur
  expect(await lire(page, () => ({ k: S.me.history[0].k, q: S.me.history[0].q, win: S.me.history[0].win, xp: S.me.xp, notif: S.me.notifs[0].text })))
    .toMatchObject({ k: 'duel', q: 'Duel vs maxou_bot: Flash Bitcoin, round ' + r.toLocaleString('en-US'), win: true, xp: 20, notif: 'Duel won vs maxou_bot: Flash Bitcoin, round ' + r.toLocaleString('en-US') + '.' });
  expect((await appels(page)).map(a => a.action)).toEqual(['duel_create', 'duel_settle']);
  await page.evaluate(id => { location.hash = '#duel-' + id; }, d.id);
  expect((await duels(page))[0].preuve.length).toBeGreaterThan(5);                             // la phrase de résultat du jeu, composée à l'écran
  await page.reload(); await pret(page);
  expect((await duels(page))[0]).toMatchObject({ id: d.id, status: 'won' });
  expect(erreurs).toEqual([]);
});

test('manche perdante : la mise est perdue, le duel est dans l’historique', async ({ page }) => {
  const perdu = await jouer(page, mancheOu('btc', 0));
  await finDeManche(page);
  await expect.poll(async () => (await duels(page))[0].status).toBe('lost');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - 25 - perdu.srv.fee, 2);
  expect(await lire(page, () => S.me.notifs[0].text)).toMatch(/^Duel lost vs maxou_bot/);
  await expect.poll(() => lire(page, () => S.me.history.map(h => [h.k, h.win]))).toEqual([['duel', false]]);
  expect(perdu.erreurs).toEqual([]);
});

test('break even : le duel est annulé, la mise rendue, rien dans l’historique', async ({ page }) => {
  const nul = await jouer(page, mancheOu('btc', 2));
  await finDeManche(page);
  await expect.poll(async () => (await duels(page))[0].status).toBe('void');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - nul.srv.fee, 2);               // mise rendue, frais acquis
  expect(await lire(page, () => S.me.notifs[0].text)).toBe('Duel voided: break even on Bitcoin, both stakes returned.');
  expect(await lire(page, () => S.me.history.length), 'un duel annulé ne compte pas dans l’historique').toBe(0);
  expect(nul.erreurs).toEqual([]);
});

test('défi éclair reçu : accepter prend l’autre camp au prix du serveur ; une fois les mises fermées, c’est trop tard et rien n’est pris', async ({ page }) => {
  const r = mancheOu('eth', 1), debut = debutManche(r - 1);
  const recu = (id, plus = {}) => ({ id, code: 'DFLASH' + id, m: 'flash:eth', round: r, side: 'oui', by: AMI, opp: UID, stake: 20, fee: .4, st: 'open', at: debut, expiresAt: debut + 30000,
    price0: 46, price: null, oppStake: null, oppFee: null, pot: null, winSide: null, acceptAt: null, settleAt: null, ...plus });
  const { erreurs } = await ouvrirDuels(page, debut + 3000, { duelsL: [recu(91), recu(92, { stake: 10 })] }, '#duel-91');
  expect((await duels(page)).map(d => [d.id, d.by, d.opp, d.status, d.round])).toEqual([['91', AMI, 'me', 'open', r], ['92', AMI, 'me', 'open', r]]);
  await page.locator('[data-a="dl-accept"][data-id="91"]').click();
  await expect(toast(page, 'Duel accepted')).toBeVisible();
  const srv = await lire(page, () => __fakeSB.etat().duelsL.find(x => x.id === 91));
  expect((await duels(page)).find(d => d.id === '91')).toMatchObject({ status: 'active', opp: 'me', price: srv.price, pot: srv.pot, oppStake: srv.oppStake });
  expect(srv.pot).toBeCloseTo(20 * 100 / srv.price, 2);
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(500 - srv.oppStake - srv.oppFee, 2);
  // 32 secondes après le début de la manche : les mises sont fermées
  await page.clock.runFor(29000);
  await page.evaluate(() => { location.hash = '#duel-92'; });
  const solde = await lire(page, () => S.me.balance);
  await clic(page, 'dl-accept', { id: '92' });
  await expect(toast(page, 'Betting closed')).toBeVisible();
  expect((await duels(page)).find(d => d.id === '92').status).toBe('open');
  expect(await lire(page, () => S.me.balance)).toBe(solde);
  // fin de la manche : le premier duel est réglé (le camp de l'ami gagne : perdu pour moi), le second, resté sans réponse, est fermé
  await page.clock.runFor(15000); await page.clock.runFor(3000);
  await expect.poll(async () => (await duels(page)).map(d => [d.id, d.status])).toEqual([['91', 'lost'], ['92', 'expired']]);
  expect((await appels(page)).map(a => a.action + (a.id ? ':' + a.id : ''))).toEqual(['duel_accept:91', 'duel_accept:92', 'duel_settle']);
  expect(erreurs).toEqual([]);
});
