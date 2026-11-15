// Bout en bout contre le VRAI back (aucun faux serveur) : le site servi en local parle au projet Supabase.
// Recette 3 (partie comptes) : inscription → onboarding → rechargement → déconnexion → reconnexion par pseudo →
// même état ; même vérification depuis un second navigateur.
//
// Lancer : E2E=1 CHROME=1 npx playwright test --project=e2e
// Les comptes créés sont des comptes de test jetables (marqués is_test, e-mail wimoro-e2e-…@example.com).
import { test, expect } from '@playwright/test';

const stamp = Date.now().toString(36);
const PSEUDO = 'e2e_' + stamp, EMAIL = `wimoro-e2e-${stamp}@example.com`, MDP = 'E2e-' + stamp + '-Xy9!';
const pret = page => expect(page.locator('#view > *').first()).toBeAttached({ timeout: 20000 });
const lire = (page, fn, arg) => page.evaluate(fn, arg);

async function ouvrirReel(page, hash) {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(`${e.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console.error: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/index.html' + hash);
  await pret(page);
  return erreurs;
}

test.describe.configure({ mode: 'serial' });

test('inscription réelle, onboarding, rechargement : le serveur garde tout', async ({ page }) => {
  const erreurs = await ouvrirReel(page, '#inscription');
  const f = page.locator('form[data-form="signup"]');
  await f.locator('[name=pseudo]').fill(PSEUDO);
  await f.locator('[name=email]').fill(EMAIL);
  await f.locator('[name=pw]').fill(MDP);
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check();
  await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#bienvenue/, { timeout: 20000 }); await pret(page);
  expect(await lire(page, () => ({ srv: SRV(), n: S.me.n, solde: S.me.balance, xp: S.me.xp, onboarded: S.me.onboarded, missions: S.me.missions.map(m => m.id) })))
    .toEqual({ srv: true, n: PSEUDO, solde: 0, xp: 0, onboarded: false, missions: ['chat1', 'dep1', 'fb1'] });

  const suivant = page.locator('[data-a="ob-next"]');
  await page.locator('[data-a="ob-color"]').nth(3).click();
  await suivant.click();
  await page.locator('[data-a="ob-int"]').first().click();
  await suivant.click();
  await page.locator('[data-a="ob-kpick"][data-v="crypto"]').click();
  await suivant.click(); await suivant.click(); await suivant.click();                       // « Récupérer mes 100 XP »
  await expect.poll(() => lire(page, () => S.me.xp), { timeout: 15000 }).toBe(100);
  await expect(page.locator('.rankup')).toBeVisible(); await page.keyboard.press('Escape');
  await page.locator('[data-a="ob-next"]').click();
  await expect(page).toHaveURL(/#accueil/);
  await page.waitForTimeout(1500);                                                           // envoi différé des réglages

  await page.reload(); await pret(page);
  const s = await lire(page, () => ({ srv: SRV(), n: S.me.n, xp: S.me.xp, onboarded: S.me.onboarded, color: S.me.color, interets: S.me.interests.length, notifs: S.me.notifs.map(n => n.text), rang: myRank(), marches: MARKETS.filter(m => m.liq > 0).length }));
  expect(s).toMatchObject({ srv: true, n: PSEUDO, xp: 100, onboarded: true, color: '#13804F', interets: 1, rang: { t: 0, d: 1 } });
  expect(s.notifs).toEqual(['You reached Iron II.']);                                        // notification créée par le serveur, traduite ici
  expect(s.marches, 'les marchés viennent du serveur').toBe(27);
  expect(erreurs).toEqual([]);
});

test('connexion par pseudo puis par e-mail, depuis un autre navigateur : même état', async ({ browser }) => {
  for (const identifiant of [PSEUDO, EMAIL.toUpperCase()]) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const erreurs = await ouvrirReel(page, '#connexion');
    await page.locator('#le').fill(identifiant); await page.locator('#lp').fill('mauvais-mot-de-passe');
    await page.locator('form[data-form="login"] [type=submit]').click();
    await expect(page.locator('[data-autherr]')).toHaveText('Incorrect username, email or password.', { timeout: 15000 });
    await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
    await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
    expect(await lire(page, () => ({ srv: SRV(), n: S.me.n, xp: S.me.xp, onboarded: S.me.onboarded, color: S.me.color }))).toEqual({ srv: true, n: PSEUDO, xp: 100, onboarded: true, color: '#13804F' });
    // déconnexion : retour à un visiteur propre, plus aucune trace de session
    await page.evaluate(() => logout());
    await expect(page).toHaveURL(/#connexion/, { timeout: 15000 }); await pret(page);
    expect(await lire(page, () => ({ srv: SRV(), logged: S.me.logged, jeton: localStorage.getItem('wimoro-auth') }))).toEqual({ srv: false, logged: false, jeton: null });
    expect(erreurs).toEqual([]);
    await ctx.close();
  }
});

test('recette 3 · dépôt fictif → achat → rechargement → vente → reconnexion : tout est écrit par le serveur et s’y retrouve', async ({ page, browser }) => {
  test.setTimeout(150000);
  const erreurs = await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(PSEUDO); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  const toast = t => page.locator('.toast', { hasText: t }).first();

  // dépôt fictif de 200 USDC : 12 confirmations, puis le serveur crédite
  await page.evaluate(() => { location.hash = '#depot'; });
  await page.locator('[data-a="sim-dep"]').first().click();
  await page.locator('form[data-form="simdep"] [name=amt]').fill('200');
  await page.locator('form[data-form="simdep"] [type=submit]').click();
  await expect(toast('Deposit detected')).toBeVisible({ timeout: 15000 });
  expect(await lire(page, () => S.me.balance)).toBe(0);                                      // pas crédité avant la fin des confirmations
  await expect(toast('Deposit credited')).toBeVisible({ timeout: 30000 });
  expect(await lire(page, () => ({ solde: S.me.balance, depots: S.me.deposits, xp: S.me.xp, badge: S.me.badges.includes('dep'), mission: S.me.missions.find(m => m.id === 'dep1').have })))
    .toEqual({ solde: 200, depots: 1, xp: 200, badge: true, mission: 1 });                   // 100 XP de bienvenue + 100 XP du premier dépôt

  // achat de 50 $
  await page.evaluate(() => { location.hash = '#marche-btc150k'; });
  await page.locator('[data-tamt="page"]').fill('50');
  await page.locator('[data-ticket="page"] [data-a="buy"]').click();
  await expect(toast('Bet placed')).toBeVisible({ timeout: 15000 });
  const apresAchat = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.map(p => ({ m: p.m, s: p.s, sh: p.sh })), notif: S.me.notifs[0].text }));
  expect(apresAchat).toMatchObject({ solde: 150, xp: 210 });
  expect(apresAchat.pos).toHaveLength(1); expect(apresAchat.pos[0]).toMatchObject({ m: 'btc150k', s: 'oui' });
  expect(apresAchat.notif).toMatch(/^Bet placed: /);

  // rechargement : la position, le solde, l'XP et la notification sont là
  await page.reload(); await pret(page);
  const recharge = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.map(p => ({ m: p.m, s: p.s, sh: p.sh })), notifs: S.me.notifs.map(n => n.text).join(' | '), deps: S.me.deps.length }));
  expect(recharge.solde).toBe(150); expect(recharge.xp).toBe(210); expect(recharge.deps).toBe(1);
  expect(recharge.pos[0].sh).toBeCloseTo(apresAchat.pos[0].sh, 6);
  expect(recharge.notifs).toMatch(/Bet placed: /); expect(recharge.notifs).toMatch(/Deposit credited: /);

  // vente de toute la position
  await page.locator('[data-ticket="page"] [data-a="tmode"][data-v="sell"]').click();
  await page.locator('[data-ticket="page"] [data-a="sell"]').click();
  await expect(toast('Sold with')).toBeVisible({ timeout: 15000 });
  const apresVente = await lire(page, () => ({ solde: S.me.balance, pos: S.me.positions.length, reste: S.me.positions.reduce((n, p) => n + p.sh, 0), hist: S.me.history.map(h => h.k) }));
  expect(apresVente.reste).toBeLessThan(0.1); expect(apresVente.hist).toEqual(['sell']);   // le ticket vend au dixième de part près, comme en mode Démo
  expect(apresVente.solde).toBeGreaterThan(195); expect(apresVente.solde).toBeLessThan(200); // acheter puis revendre coûte l'écart et les frais

  // une fonction pas encore reliée est annoncée comme telle, et rien ne s'annule après 20 secondes (B05)
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'cb-place'; document.body.appendChild(b); b.click(); b.remove(); });   // combiné : pas encore relié
  await expect(toast('Coming soon for accounts')).toBeVisible();
  await page.waitForTimeout(20000);
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.length }))).toEqual({ solde: apresVente.solde, xp: 210, pos: apresVente.pos });
  expect(erreurs).toEqual([]);

  // déconnexion, puis reconnexion par pseudo depuis un autre navigateur : même état
  await page.evaluate(() => logout());
  await expect(page).toHaveURL(/#connexion/, { timeout: 15000 });
  const ctx = await browser.newContext(), autre = await ctx.newPage();
  await ouvrirReel(autre, '#connexion');
  await autre.locator('#le').fill(PSEUDO); await autre.locator('#lp').fill(MDP); await autre.locator('form[data-form="login"] [type=submit]').click();
  await expect(autre).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(autre);
  expect(await lire(autre, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.length, hist: S.me.history.length, depots: S.me.deposits })))
    .toEqual({ solde: apresVente.solde, xp: 210, pos: apresVente.pos, hist: 1, depots: 1 });
  await ctx.close();
});

test('marchés en direct : les prix viennent des diffusions du serveur, identiques dans deux navigateurs, sans aucune requête', async ({ browser }) => {
  const ouvrirConnecte = async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const erreurs = await ouvrirReel(page, '#connexion');
    await page.locator('#le').fill(PSEUDO); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
    await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
    const requetes = []; page.on('request', r => { const u = new URL(r.url()); if (u.hostname.endsWith('.supabase.co') && ['rest', 'functions', 'auth'].includes(u.pathname.split('/')[1])) requetes.push(u.pathname); });
    await page.evaluate(() => { window.__n = 0; window.__btc = []; const t0 = srvTick; srvTick = d => { window.__n++; window.__dernier = d; if (d.m && d.m.btc150k) window.__btc.push(d.m.btc150k[0]); t0(d); }; });
    return { ctx, page, erreurs, requetes };
  };
  const a = await ouvrirConnecte(), b = await ouvrirConnecte();
  const prix0 = await lire(a.page, () => MARKETS.map(m => m.p));
  await expect.poll(() => lire(a.page, () => window.__n), { timeout: 30000 }).toBeGreaterThanOrEqual(4);   // un tick toutes les 3 secondes
  await expect.poll(() => lire(b.page, () => window.__n), { timeout: 30000 }).toBeGreaterThanOrEqual(3);
  // même tick reçu des deux côtés → mêmes prix à l'écran
  let pareil = false;
  for (let i = 0; i < 8 && !pareil; i++) {
    const [x, y] = await Promise.all([a, b].map(o => lire(o.page, () => ({ t: window.__dernier.t, p: MARKETS.map(m => m.p), vol: MARKETS.map(m => m.vol) }))));
    pareil = x.t === y.t && JSON.stringify(x) === JSON.stringify(y);
    if (!pareil) await a.page.waitForTimeout(700);
  }
  expect(pareil, 'les deux navigateurs affichent les mêmes prix').toBe(true);
  const prix1 = await lire(a.page, () => MARKETS.map(m => m.p));
  expect(prix1).not.toEqual(prix0);                                                          // les bots du serveur animent les marchés
  for (const p of prix1) { expect(p).toBeGreaterThanOrEqual(1); expect(p).toBeLessThanOrEqual(99); }
  const groupes = await lire(a.page, () => GROUPS.map(g => g.outcomes.reduce((n, o) => n + o.p, 0)));
  for (const t of groupes) expect(t).toBeCloseTo(100, 4);                                    // issues multiples : 100 %
  expect(a.requetes, 'aucune requête périodique : tout arrive par la diffusion').toEqual([]);
  a.requetes.length = 0;
  // recette 5 : A achète → B voit le prix bouger sans recharger (le prix exact renvoyé à A arrive chez B par la diffusion)
  const achat = await a.page.evaluate(() => API.call('api_buy', { p_market: 'btc150k', p_side: 'non', p_total: 20, p_key: crypto.randomUUID(), p_opts: {} }));
  await expect.poll(() => lire(b.page, p => window.__btc.includes(p), achat.marches.btc150k[0]), { timeout: 15000 }).toBe(true);
  // le serveur refuse un pari au-dessus du solde
  const avant = await lire(a.page, () => API.call('api_state').then(e => e.me.balance));
  const refus = await a.page.evaluate(async () => { try { await API.call('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 100000, p_key: crypto.randomUUID(), p_opts: {} }); return 'accepté'; } catch (e) { return e.code; } });
  expect(refus).toBe('solde_insuffisant');
  expect(await lire(a.page, () => API.call('api_state').then(e => e.me.balance))).toBe(avant);
  expect(a.erreurs).toEqual([]); expect(b.erreurs).toEqual([]);
  await a.ctx.close(); await b.ctx.close();
});
