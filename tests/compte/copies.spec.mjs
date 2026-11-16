// Copy trading en mode Compte : la copie, ses paris, ses ventes et son arrêt sont tenus par le serveur.
// L'écran ne simule rien (les faux paris des joueurs copiés du mode Démo ne tournent pas) et affiche ce qui arrive en direct.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const M = (id, p) => ({ market_id: id, current_probability: p, anchor_probability: p, volume_total: 2e6, participants_count: 500, liquidity_depth: 30000 });
const OR = { xp: 1500, settled: 25, wins: 15, deposits: 1, balance: 1000 };                       // rang Or : peut copier
const LEA = { n: 'lea', t: 4, d: 0, tone: 0, bets: 120, acc: 61, profit: 900, fol: 30, bio: '', photo: '', color: '', bot: true, pub: 1 };
const copies = page => lire(page, () => (S.me.copies || []).map(c => ({ id: c.id, u: c.u, status: c.status, why: c.why, budget: c.budget, mode: c.mode, per: c.per, pct: c.pct, cap: c.cap, cats: c.cats, stop: c.stop, n: c.n, holds: c.holds.map(h => h.m + ':' + h.s), log: c.log.map(l => l.k) })));
const appels = (page, re) => lire(page, src => __fakeSB.journal().filter(c => c.kind === 'rpc' && new RegExp(src).test(c.name)).map(c => [c.name, c.args.p || c.args]), re.source);
const ouvrirCopie = page => ouvrir(page, { mode: 'compte', hash: '#copie', faux: { marches: [M('btc150k', 60), M('clasico', 54)], etat: { me: OR, users: { [AMI]: LEA } } } });

test('copier un joueur : créée par le serveur ; son pari est reproduit par le serveur et arrive en direct ; pause, réglages, arrêt avec vente', async ({ page }) => {
  const { erreurs } = await ouvrirCopie(page);
  await page.evaluate(u => copyOpenModal(u), AMI);
  await page.locator('[data-cp="budget"]').fill('200');
  await page.locator('[data-cp="per"]').fill('50');
  await page.locator('[data-cp-existing]').evaluate(el => { el.checked = false; });                // sans « copier aussi ses paris en cours » (cochée par défaut, comme en démo)
  await page.locator('[data-a="cp-start"]').click();
  await expect(toast(page, 'You are copying lea')).toBeVisible();
  const [c] = await copies(page);
  expect(c).toMatchObject({ u: AMI, status: 'active', budget: 200, mode: 'fixed', per: 50, stop: 30, cats: null, n: 0, holds: [] });
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp }))).toEqual({ solde: 1000, xp: 1515 });   // le budget n'est pas débité ; 15 XP donnés par le serveur
  expect(await appels(page, /^api_copy/)).toEqual([['api_copy_start', { u: AMI, budget: 200, mode: 'fixed', per: 50, pct: 10, cap: 0, cats: [], stop: 30 }]]);
  expect(await lire(page, () => PLAN.filter(x => /^copie/.test(x.nom)).map(x => x.quand))).toEqual(['local', 'local', 'local']);   // rien n'est simulé à l'écran

  // lea parie (côté serveur) : la copie suit, le joueur est prévenu en direct
  await page.evaluate(u => __fakeSB.copieSuivre(u, 'btc150k', 'oui', 300), AMI);
  await expect(toast(page, 'Copy of lea')).toBeVisible();
  await expect.poll(async () => (await copies(page))[0].n).toBe(1);
  expect((await copies(page))[0]).toMatchObject({ holds: ['btc150k:oui'], log: ['open'] });
  expect(await lire(page, () => ({ solde: S.me.balance, pos: S.me.positions.map(p => p.m + ':' + p.s), notif: S.me.notifs[0].text }))).toEqual({ solde: 950, pos: ['btc150k:oui'], notif: await lire(page, () => _t("Copie de {0} : {1} sur {2}, {3}.", ['lea', F.usd(50), _t("Oui"), MK.btc150k.short])) });
  await page.evaluate(() => copyFire('x', MK.btc150k, 'oui', 500));                               // le simulateur local est éteint
  expect((await copies(page))[0].n).toBe(1);

  // pause puis reprise, depuis la fenêtre de gestion
  await page.evaluate(id => copyManage(id), c.id);
  await page.locator('[data-a="cp-pause"]').click();
  await expect(toast(page, 'Copy of lea paused')).toBeVisible();
  expect((await copies(page))[0].status).toBe('paused');
  await page.evaluate(u => __fakeSB.copieSuivre(u, 'clasico', 'oui', 300), AMI);                  // en pause : rien n'est copié
  expect((await copies(page))[0].n).toBe(1);
  await page.locator('[data-a="cp-pause"]').click();
  await expect.poll(async () => (await copies(page))[0].status).toBe('active');
  // réglages : pourcentage de sa mise
  await page.locator('[data-a="cp-edit"]').click();
  await page.locator('[data-a="cp-mode"][data-v="prop"]').click();
  await page.locator('[data-a="cp-start"]').click();
  await expect(toast(page, 'Settings saved')).toBeVisible();
  expect((await copies(page))[0]).toMatchObject({ mode: 'prop', pct: 10, status: 'active' });
  // arrêt en vendant les positions
  await page.evaluate(id => copyManage(id), c.id);
  await page.locator('[data-a="cp-stop"]').click();
  await page.locator('[data-a="cp-stop-do"][data-close="1"]').click();
  await expect(toast(page, 'Copy of lea stopped')).toBeVisible();
  await expect.poll(() => lire(page, () => S.me.positions.length)).toBe(0);
  expect((await copies(page))[0]).toMatchObject({ status: 'stopped', why: 'manual', holds: [] });
  expect(await lire(page, () => ({ k: S.me.history[0].k, via: S.me.history[0].via, of: S.me.history[0].of }))).toEqual({ k: 'sell', via: 'copy', of: 'lea' });
  expect((await lire(page, () => S.me.balance))).toBeGreaterThan(990);                            // le produit de la vente est revenu
  expect((await appels(page, /^api_copy/)).map(a => a[0] + (a[1].p_action ? ':' + a[1].p_action : a[1].edit ? ':edit' : ''))).toEqual(['api_copy_start', 'api_copy_set:pause', 'api_copy_set:resume', 'api_copy_start:edit', 'api_copy_set:stop_close']);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();            // tout vient du serveur
  expect((await copies(page))[0]).toMatchObject({ status: 'stopped', n: 1 });
  expect(erreurs).toEqual([]);
});

test('le joueur copié vend : la copie vend aussi, en direct ; un refus du serveur est affiché et rien ne change', async ({ page }) => {
  const { erreurs } = await ouvrirCopie(page);
  await page.evaluate(u => copyOpenModal(u), AMI);
  await page.locator('[data-cp="budget"]').fill('100');
  await page.locator('[data-cp="per"]').fill('20');
  const affiches = await lire(page, u => playerBets(u).map(b => b.m.id + ':' + b.s), AMI);         // ses paris en cours, tels que l'écran les montre
  await page.locator('[data-a="cp-start"]').click();                                            // case « copier aussi ses paris en cours » laissée cochée
  await expect.poll(async () => (await copies(page)).length).toBe(1);
  await expect.poll(async () => (await copies(page))[0].holds.slice().sort()).toEqual(affiches.slice().sort());
  expect((await appels(page, /^api_copy/))[0][1]).toMatchObject({ withOpen: true, existing: [{}, {}, {}] });
  expect(await lire(page, () => ({ solde: S.me.balance, positions: S.me.positions.length }))).toEqual({ solde: 940, positions: 3 });   // 3 paris de 20 $ copiés tout de suite
  await page.evaluate(u => __fakeSB.copieSuivre(u, 'clasico', 'non', 200), AMI);
  await expect.poll(async () => (await copies(page))[0].n).toBe(4);
  expect((await copies(page))[0].holds).toContain('clasico:non');
  await page.evaluate(u => __fakeSB.copieSortir(u, 'clasico', 'non'), AMI);
  await expect(toast(page, await lire(page, () => _t("{0} a vendu, ta copie aussi", ['lea'])))).toBeVisible();
  await expect.poll(async () => (await copies(page))[0].holds.includes('clasico:non')).toBe(false);
  expect((await copies(page))[0].log[0]).toBe('exit');
  expect(await lire(page, () => S.me.positions.some(p => p.m === 'clasico' && p.s === 'non'))).toBe(false);
  // refus du serveur : le joueur n'est plus copiable
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_copy_set: { error: { message: 'copie_indisponible', code: 'P0001' } } }; });
  await page.evaluate(id => copyManage(id), (await copies(page))[0].id);
  await page.locator('[data-a="cp-pause"]').click();
  await expect(toast(page, 'This player cannot be copied right now.')).toBeVisible();
  expect((await copies(page))[0].status).toBe('active');
  expect(erreurs).toEqual([]);
});
