// Ordres limite, stop loss et take profit en mode Compte : le serveur réserve, exécute et règle ; l'écran affiche.
// Rien ne s'exécute dans le navigateur (en mode Démo, c'est lui qui exécute : voir tests/demo).
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const M = (id, p, liq) => ({ market_id: id, current_probability: p, anchor_probability: p, volume_total: 2e6, participants_count: 500, liquidity_depth: liq });
const ordres = page => lire(page, () => (S.me.orders || []).map(o => ({ id: o.id, k: o.k, s: o.s, lp: o.lp, init: o.init, cash: o.cash, sh: o.sh, status: o.status, why: o.why })));
const appels = (page, re) => lire(page, src => __fakeSB.journal().filter(c => c.kind === 'rpc' && new RegExp(src).test(c.name)).map(c => { const p = c.args.p ? { ...c.args.p } : { ...c.args }; delete p.key; return [c.name, p]; }), re.source);
const etat = page => lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, joues: S.me.played, parts: S.me.positions.reduce((n, p) => n + p.sh, 0) }));

test('achat limite : réservé et exécuté par le serveur, le reste attend ; l’écran n’exécute rien ; la suite arrive en direct ; annuler rend la réserve', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [M('btc150k', 60, 400)], etat: { me: { balance: 1000 } } } });
  await page.locator('[data-a="otype"][data-v="limit"][data-ctx="page"]').click();
  await page.locator('[data-tlp="page"]').fill('62');
  await page.locator('[data-tamt="page"]').fill('500');
  await page.locator('[data-a="limit-place"]').click();
  await expect(toast(page, 'Order partially filled')).toBeVisible();
  const [o] = await ordres(page);
  expect(o).toMatchObject({ k: 'buy', s: 'oui', lp: 62, init: 500, status: 'open' });
  expect(o.cash).toBeGreaterThan(150); expect(o.cash).toBeLessThan(250);                          // 500 parts jusqu'à 62 ¢ ; le reste attend
  const e1 = await etat(page);
  expect(e1).toMatchObject({ solde: 500, xp: 25, joues: 1 });                                     // tout le montant est réservé
  expect(e1.parts).toBeCloseTo(o.sh, 5); expect(o.sh).toBeGreaterThan(400);
  await expect(page.locator('[data-ordbox="btc150k"]')).toContainText('Reserved');
  expect(await appels(page, /^api_order/)).toEqual([['api_order_place', { m: 'btc150k', s: 'oui', k: 'buy', lp: 62, amt: 500 }]]);

  // le prix redescend (diffusion du serveur) : l'écran ne doit rien exécuter lui-même
  await page.evaluate(() => { __fakeSB.marche('btc150k').p = 58; __fakeSB.persist(); __fakeSB.tick(['btc150k']); });
  await expect.poll(() => lire(page, () => MK.btc150k.p)).toBe(58);
  await page.evaluate(() => ordersTick());
  expect((await ordres(page))[0]).toMatchObject({ status: 'open', cash: o.cash });
  expect((await etat(page)).parts).toBeCloseTo(o.sh, 5);
  // la tâche de fond du serveur exécute le reste : le joueur est prévenu en direct
  await page.evaluate(() => __fakeSB.tickOrdres());
  await expect(toast(page, 'Limit order filled')).toBeVisible();
  await expect.poll(async () => (await ordres(page))[0].status).toBe('filled');
  const e2 = await etat(page);
  expect(e2).toMatchObject({ solde: 500, xp: 25, joues: 1 });                                     // un seul pari compté
  expect(e2.parts).toBeGreaterThan(e1.parts + 200);
  expect(await lire(page, () => S.me.notifs[0].text)).toMatch(/^Limit order filled: /);

  // un ordre loin du marché attend ; l'annuler rend la réserve
  await page.locator('[data-tlp="page"]').fill('10');
  await page.locator('[data-tamt="page"]').fill('50');
  await page.locator('[data-a="limit-place"]').click();
  await expect(toast(page, 'Limit order placed')).toBeVisible();
  expect((await etat(page)).solde).toBe(450);
  const attente = (await ordres(page)).find(x => x.status === 'open');
  expect(attente).toMatchObject({ lp: 10, init: 50, cash: 50, sh: 0 });
  await page.locator(`[data-ordbox="btc150k"] [data-a="ord-cancel"][data-id="${attente.id}"]`).click();
  await expect(toast(page, 'Order cancelled')).toBeVisible();
  expect((await etat(page)).solde).toBe(500);
  expect((await ordres(page)).find(x => x.id === attente.id)).toMatchObject({ status: 'cancelled', why: 'user' });
  expect((await appels(page, /^api_order/)).map(a => a[0])).toEqual(['api_order_place', 'api_order_place', 'api_order_cancel']);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();            // tout vient du serveur
  expect((await ordres(page)).map(x => x.status).sort()).toEqual(['cancelled', 'filled']);
  expect(erreurs).toEqual([]);
});

test('protection d’une position et vente limite : posées sur le serveur, déclenchées par lui, affichées en direct', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [M('btc150k', 60, 30000)], etat: { me: { balance: 100 }, positions: [{ m: 'btc150k', s: 'oui', sh: 200, avg: 50 }], prefs: { v: 1, tmode: 'all' } } } });
  // prefs.tmode « all » : comme en mode Démo, les pop-up à icône bouclier ne s'affichent que si le joueur a choisi « toutes les notifications »
  const gardes = () => lire(page, () => (S.me.guards || []).map(g => ({ m: g.m, s: g.s, stop: g.stop, tp: g.tp })));
  await page.locator('[data-a="guard"]').first().click();
  await page.locator('[data-gd="stop"]').fill('55'); await page.locator('[data-gd="tp"]').fill('70');
  await page.locator('[data-a="guard-save"]').click();
  await expect(toast(page, 'Protection enabled')).toBeVisible();
  expect(await gardes()).toEqual([{ m: 'btc150k', s: 'oui', stop: 55, tp: 70 }]);
  expect(await appels(page, /^api_guard/)).toEqual([['api_guard_set', { m: 'btc150k', s: 'oui', stop: 55, tp: 70 }]]);
  await expect(page.locator('.gtag').first()).toContainText('SL');
  // retirer
  await page.locator('[data-a="guard"]').first().click();
  await page.locator('[data-a="guard-del"]').click();
  await expect(toast(page, 'Protection removed')).toBeVisible();
  expect(await gardes()).toEqual([]);
  // refus du serveur (le prix a bougé entre-temps) : affiché, rien ne change
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_guard_set: { error: { message: 'stop_invalide', code: 'P0001' } } }; });
  await page.locator('[data-a="guard"]').first().click();
  await page.locator('[data-gd="stop"]').fill('55');
  await page.locator('[data-a="guard-save"]').click();
  await expect(toast(page, 'The stop loss must be below the current price.')).toBeVisible();
  expect(await gardes()).toEqual([]);
  await page.evaluate(() => { window.__FAKE_SB__.rpc = {}; });
  await page.locator('[data-a="guard-save"]').click();
  await expect.poll(gardes).toEqual([{ m: 'btc150k', s: 'oui', stop: 55, tp: 0 }]);

  // vente limite de 50 parts à 65 ¢ minimum : attend
  await page.evaluate(() => { const st = tState('page'); st.mode = 'sell'; st.side = 'oui'; st.otype = 'limit'; st.lp = '65'; st.amt = '50'; rerenderTicket(); });
  await page.locator('[data-a="limit-place"]').click();
  await expect(toast(page, 'Sell order placed')).toBeVisible();
  expect((await ordres(page))[0]).toMatchObject({ k: 'sell', lp: 65, init: 50, sh: 50, status: 'open' });
  expect((await etat(page))).toMatchObject({ solde: 100, parts: 200 });                           // les parts ne sont pas bloquées
  // le marché monte : le serveur vend au-dessus de 65 ¢
  await page.evaluate(() => { __fakeSB.marche('btc150k').p = 66; __fakeSB.persist(); __fakeSB.tickOrdres(); });
  await expect(toast(page, 'Limit sale executed')).toBeVisible();
  await expect.poll(async () => (await ordres(page))[0].status).toBe('filled');
  const e1 = await etat(page);
  expect(e1.parts).toBeCloseTo(150, 5); expect(e1.solde).toBeGreaterThan(100 + 50 * 0.65);
  expect(await lire(page, () => ({ k: S.me.history[0].k, via: S.me.history[0].via, q: S.me.history[0].q }))).toEqual({ k: 'sell', via: 'limit', q: await lire(page, () => MK.btc150k.q) });
  // le marché chute sous le stop : le serveur vend toute la position
  await page.evaluate(() => { __fakeSB.marche('btc150k').p = 54; __fakeSB.persist(); __fakeSB.tickOrdres(); });
  await expect(toast(page, 'Stop loss triggered')).toBeVisible();
  await expect.poll(async () => (await etat(page)).parts).toBe(0);
  expect(await gardes()).toEqual([]);
  expect(await lire(page, () => S.me.history[0].via)).toBe('stop');
  expect(await lire(page, () => S.me.notifs[0].text)).toMatch(/^Stop loss triggered on /);
  expect(erreurs).toEqual([]);
});
