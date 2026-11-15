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

test('une action pas encore reliée au serveur est annoncée comme telle, et le solde ne bouge pas', async ({ page }) => {
  await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(PSEUDO); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  await page.evaluate(() => { location.hash = '#depot'; });
  await page.locator('[data-a="sim-dep"]').first().click();                              // dépôt fictif : pas encore relié au serveur
  await expect(page.locator('.toast', { hasText: 'Coming soon for accounts' })).toBeVisible();
  await page.waitForTimeout(20000);                                                          // B05 : avant, tout était écrasé au bout de 15 s
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.length }))).toEqual({ solde: 0, xp: 100, pos: 0 });
});

test('marchés en direct : les prix viennent des diffusions du serveur, identiques dans deux navigateurs, sans aucune requête', async ({ browser }) => {
  const ouvrirConnecte = async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const erreurs = await ouvrirReel(page, '#connexion');
    await page.locator('#le').fill(PSEUDO); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
    await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
    const requetes = []; page.on('request', r => { const u = new URL(r.url()); if (u.hostname.endsWith('.supabase.co') && ['rest', 'functions', 'auth'].includes(u.pathname.split('/')[1])) requetes.push(u.pathname); });
    await page.evaluate(() => { window.__n = 0; const t0 = srvTick; srvTick = d => { window.__n++; window.__dernier = d; t0(d); }; });
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
  // le serveur refuse un pari sans solde (le ticket, lui, propose de déposer)
  const refus = await a.page.evaluate(async () => { try { await API.call('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 5, p_key: crypto.randomUUID(), p_opts: {} }); return 'accepté'; } catch (e) { return e.code; } });
  expect(refus).toBe('solde_insuffisant');
  expect(await lire(a.page, () => ({ solde: S.me.balance, pos: S.me.positions.length }))).toEqual({ solde: 0, pos: 0 });
  expect(a.erreurs).toEqual([]); expect(b.erreurs).toEqual([]);
  await a.ctx.close(); await b.ctx.close();
});
