// Paris combinés en mode Compte : la sélection (le « slip ») reste locale ; valider et encaisser passent par le serveur,
// qui bloque les prix et tient la mise ; le résultat arrive avec la résolution des marchés.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, UID } from '../helpers/app.mjs';

const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const M = (id, p) => ({ market_id: id, current_probability: p, anchor_probability: p, volume_total: 2e6, participants_count: 500, liquidity_depth: 20000 });
const clic = (page, a, data = {}) => page.evaluate(([a, data]) => { const b = document.createElement('button'); b.dataset.a = a; Object.assign(b.dataset, data); document.body.appendChild(b); b.click(); b.remove(); }, [a, data]);
const combos = page => lire(page, () => (S.me.combos || []).map(c => ({ id: c.id, status: c.status, stake: c.stake, pay: c.pay, legs: c.legs.map(l => [l.m, l.s, l.price, l.res]), cash: c.cash })));
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && /^api_combo/.test(c.name)).map(c => [c.name, c.args.p ? { legs: c.args.p.legs, stake: c.args.p.stake } : c.args]));
const ouvrirCombines = page => ouvrir(page, { mode: 'compte', hash: '#accueil', faux: { marches: [M('btc150k', 63), M('clasico', 54)], etat: { me: { balance: 500 } } } });

test('composer, valider, retrouver après rechargement, encaisser : la mise et les prix sont tenus par le serveur', async ({ page }) => {
  const { erreurs } = await ouvrirCombines(page);
  await clic(page, 'cb-add', { m: 'btc150k', s: 'oui' });
  await expect(toast(page, 'Added to the parlay')).toBeVisible();
  await clic(page, 'cb-add', { m: 'clasico', s: 'non' });
  expect(await lire(page, () => slip().legs.map(l => l.m + ':' + l.s))).toEqual(['btc150k:oui', 'clasico:non']);
  expect(await appels(page), 'composer un combiné n’écrit rien').toEqual([]);
  expect(await lire(page, () => S.me.balance)).toBe(500);
  await clic(page, 'cb-open');
  await page.locator('[data-a="cb-place"]').click();
  await expect(toast(page, 'Parlay placed')).toBeVisible();
  const [c] = await combos(page);
  expect(c).toMatchObject({ status: 'open', stake: 10, legs: [['btc150k', 'oui', 63, null], ['clasico', 'non', 46, null]] });
  expect(c.pay).toBeCloseTo(Math.round((Math.round(10 * (100 / 63) * (100 / 46) * 100) / 100) * 0.95 * 100) / 100, 1);
  expect(await lire(page, () => ({ solde: S.me.balance, slip: slip().legs.length, xp: S.me.xp }))).toEqual({ solde: 490, slip: 0, xp: 20 });
  expect(await appels(page)).toEqual([['api_combo_place', { legs: [{ m: 'btc150k', s: 'oui' }, { m: 'clasico', s: 'non' }], stake: 10 }]]);
  await page.reload(); await pret(page);
  expect((await combos(page))[0]).toMatchObject({ id: c.id, status: 'open' });

  await page.evaluate(() => { location.hash = '#combines'; });
  await page.locator(`[data-a="cb-cash"][data-id="${c.id}"]`).click();
  await expect(toast(page, 'Cashed out')).toBeVisible();
  const valeur = Math.floor(c.pay * 0.63 * 0.46 * 0.95 * 100) / 100;
  expect((await combos(page))[0]).toMatchObject({ status: 'cashed', cash: valeur });
  expect(await lire(page, () => ({ solde: S.me.balance, k: S.me.history[0].k, regles: S.me.settled }))).toEqual({ solde: Math.round((490 + valeur) * 100) / 100, k: 'combo', regles: 1 });
  expect(await lire(page, () => S.me.history[0].q)).toMatch(/2 .*cashed out|cashed out/i);
  expect((await appels(page))[1]).toEqual(['api_combo_cash', { p_id: +c.id }]);
  expect(erreurs).toEqual([]);
});

test('résolution des marchés : le combiné gagné arrive par la notification du serveur ; un refus du serveur est affiché', async ({ page }) => {
  const { erreurs } = await ouvrirCombines(page);
  await clic(page, 'cb-add', { m: 'btc150k', s: 'oui' }); await clic(page, 'cb-add', { m: 'clasico', s: 'oui' });
  await clic(page, 'cb-open'); await page.locator('[data-a="cb-place"]').click();
  await expect.poll(async () => (await combos(page)).length).toBe(1);
  const [c] = await combos(page);
  await page.evaluate(([uid, gain]) => {                                                       // le serveur a résolu les deux marchés par Oui
    const e = __fakeSB.etat(), x = e.combosL[0]; x.status = 'won'; x.legs.forEach(l => { l.res = 'won'; }); x.endAt = Date.now(); e.me.balance += x.pay;
    const n = { id: 'n-combo', ic: 'trophy', code: 'combo_gagne', p: { id: x.id, n: 2, mult: 2.94, gain: gain }, href: '#combines', at: Date.now(), read: false };
    e.notifs.unshift(n); e.history.unshift({ k: 'res', m: 'clasico', q: 'combo|g|2|2.94', s: 'oui', win: true, pnl: gain, at: Date.now() }); __fakeSB.persist();
    __fakeSB.emit('joueur:' + uid, 'notif', { n });
  }, [UID, Math.round((c.pay - 10) * 100) / 100]);
  await expect.poll(async () => (await combos(page))[0].status).toBe('won');
  expect(await lire(page, () => ({ solde: S.me.balance, k: S.me.history[0].k, q: S.me.history[0].q }))).toMatchObject({ solde: Math.round((490 + c.pay) * 100) / 100, k: 'combo' });
  expect(await lire(page, () => JSON.stringify(S.me.notifs[0]))).toMatch(/Parlay won: \+/);
  // refus du serveur : affiché, rien ne change
  await clic(page, 'cb-add', { m: 'btc150k', s: 'non' }); await clic(page, 'cb-add', { m: 'clasico', s: 'non' });
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_combo_place: { error: { message: 'marche_ferme', code: 'P0001' } } }; });
  const solde = await lire(page, () => S.me.balance);
  await clic(page, 'cb-open'); await page.locator('[data-a="cb-place"]').click();
  await expect(toast(page, 'This market is closed')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, n: S.me.combos.length, slip: slip().legs.length }))).toEqual({ solde, n: 1, slip: 2 });
  expect(erreurs).toEqual([]);
});
