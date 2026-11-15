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
  await page.locator('.rankup').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});   // ces XP font monter d'un rang : on ferme le popup
  await page.keyboard.press('Escape'); await expect(page.locator('.rankup')).toHaveCount(0);
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

test('recette 5 · chat : A écrit dans le salon général puis dans celui d’un marché, B le lit en direct avec le bon pseudo et le bon rang', async ({ browser }) => {
  test.setTimeout(120000);
  // B : un second compte de test
  const ctxB = await browser.newContext(), b = await ctxB.newPage();
  const erreursB = await ouvrirReel(b, '#inscription');
  const f = b.locator('form[data-form="signup"]');
  await f.locator('[name=pseudo]').fill(PSEUDO + 'b'); await f.locator('[name=email]').fill(`wimoro-e2e-${stamp}-b@example.com`); await f.locator('[name=pw]').fill(MDP);
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check(); await f.locator('[type=submit]').click();
  await expect(b).toHaveURL(/#bienvenue/, { timeout: 20000 }); await pret(b);
  await b.evaluate(() => API.call('api_onboarding', { p: { done: true } }));
  await b.evaluate(() => { location.hash = '#chat'; }); await b.reload(); await pret(b);
  await expect(b.locator('.feed[data-room="general"]')).toBeAttached();
  // A : le compte créé au début
  const ctxA = await browser.newContext(), a = await ctxA.newPage();
  const erreursA = await ouvrirReel(a, '#connexion');
  await a.locator('#le').fill(PSEUDO); await a.locator('#lp').fill(MDP); await a.locator('form[data-form="login"] [type=submit]').click();
  await expect(a).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(a);
  await a.evaluate(() => { location.hash = '#chat'; });
  const rangA = await lire(a, () => myRank());
  const ecrire = async (salon, texte) => { const champ = a.locator('.composer input[data-in="' + salon + '"]'); await champ.fill(texte); await champ.press('Enter'); };

  const general = 'Test automatique ' + stamp + ' : salon général';
  await ecrire('general', general);
  await expect(a.locator('.feed[data-room="general"] .msg.mine', { hasText: general })).toHaveCount(1, { timeout: 15000 });
  const chezB = b.locator('.feed[data-room="general"] .msg', { hasText: general });
  await expect(chezB).toHaveCount(1, { timeout: 15000 });                                   // sans recharger
  await expect(chezB.locator('.un')).toHaveText(PSEUDO);
  expect(await lire(b, n => { const id = Object.keys(USERS).find(k => USERS[k].n === n); return id ? { t: USERS[id].t, d: USERS[id].d } : null; }, PSEUDO)).toEqual(rangA);
  await expect(chezB).not.toHaveClass(/mine/);

  // salon d'un marché
  for (const p of [a, b]) await p.evaluate(() => { location.hash = '#marche-clasico'; });
  await expect(b.locator('.feed[data-room="m:clasico"]')).toBeAttached();
  await a.waitForTimeout(1500);                                                              // anti-spam : une seconde entre deux messages
  const marche = 'Test automatique ' + stamp + ' : salon du marché';
  await ecrire('m:clasico', marche);
  await expect(b.locator('.feed[data-room="m:clasico"] .msg', { hasText: marche })).toHaveCount(1, { timeout: 15000 });
  await expect(b.locator('.feed[data-room="m:clasico"] .msg', { hasText: marche }).locator('.un')).toHaveText(PSEUDO);

  // l'anti-spam du serveur : deux messages coup sur coup, le second est refusé
  const refus = await a.evaluate(async () => { try { await API.call('api_chat_send', { p_room: 'm:clasico', p_text: 'trop vite' }); await API.call('api_chat_send', { p_room: 'm:clasico', p_text: 'trop vite, encore' }); return 'accepté'; } catch (e) { return e.code; } });
  expect(['trop_vite', 'accepté']).toContain(refus); expect(refus).toBe('trop_vite');
  // rechargé, B retrouve le message dans l'historique
  await b.reload(); await pret(b);
  await expect(b.locator('.feed[data-room="m:clasico"] .msg', { hasText: marche })).toHaveCount(1, { timeout: 15000 });
  expect(erreursA).toEqual([]); expect(erreursB).toEqual([]);
  await ctxA.close(); await ctxB.close();
});

test('recette 2 · pari éclair : mise acceptée par le serveur, toujours là après rechargement, réglée à la fin de la manche comme l’écran l’avait calculé', async ({ page }) => {
  test.setTimeout(170000);
  const erreurs = await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(PSEUDO); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  await page.evaluate(() => { location.hash = '#eclair'; });
  // on attend le début d'une manche pour avoir le temps de miser puis de recharger (30 secondes de mises)
  await expect.poll(() => lire(page, () => { const p = flashPhase(); return p.open && p.openLeft > 22000; }), { timeout: 50000, intervals: [500] }).toBe(true);
  const avant = await lire(page, () => ({ solde: S.me.balance, regles: S.me.settled, xp: S.me.xp, manche: S.flash.round, jeu: S.ui.fgame, hist: S.me.history.length }));
  await page.locator('[data-a="flash-bet"]:not([disabled])').first().click();
  await expect.poll(() => lire(page, () => !!G(S.ui.fgame).my), { timeout: 15000 }).toBe(true);
  const pendant = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, my: G(S.ui.fgame).my, manche: S.flash.round, jeu: S.ui.fgame }));
  expect(pendant.manche).toBe(avant.manche);
  expect(pendant.solde).toBeCloseTo(avant.solde - 10, 2); expect(pendant.xp).toBe(avant.xp + 10);
  expect(pendant.my.amt).toBe(10); expect(pendant.my.net).toBeLessThan(10); expect(pendant.my.net).toBeGreaterThan(9.4);
  await expect(page.locator('#view')).toContainText('Your stake: $10.00');

  // rechargement en cours de manche : la mise est rendue par le serveur
  await page.reload(); await pret(page);
  const recharge = await lire(page, g => ({ solde: S.me.balance, my: G(g).my, manche: S.flash.round }), pendant.jeu);
  expect(recharge.manche).toBe(pendant.manche);
  expect(recharge.solde).toBeCloseTo(pendant.solde, 2);
  expect(recharge.my).toMatchObject({ amt: 10, s: pendant.my.s, tk: pendant.my.tk });
  expect(recharge.my.net).toBeCloseTo(pendant.my.net, 9);

  // fin de la manche : le serveur rejoue la manche avec le même moteur et règle
  const prevu = await lire(page, ([g, r]) => MoteurEclair.regler(GM[g], r, G(g).my), [pendant.jeu, pendant.manche]);
  await expect.poll(() => lire(page, () => S.me.settled), { timeout: 70000, intervals: [1000] }).toBe(avant.regles + 1);
  const gain = Math.round((prevu.win ? prevu.pay : 0) * 100) / 100;
  const apres = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, hist: S.me.history[0], n: S.me.history.length }));
  expect(apres.solde, 'le gain payé par le serveur est celui que l’écran avait calculé').toBeCloseTo(pendant.solde + gain, 2);
  expect(apres.xp).toBe(pendant.xp + (prevu.win ? (pendant.my.s === 'be' ? 120 : 40) : 0));
  expect(apres.n).toBe(avant.hist + 1);
  expect(apres.hist).toMatchObject({ k: 'flash', win: prevu.win });
  expect(apres.hist.pnl).toBeCloseTo(gain - 10, 2);
  // après rechargement : même solde, même historique, plus de mise en cours
  await page.reload(); await pret(page);
  const fin = await lire(page, g => ({ solde: S.me.balance, regles: S.me.settled, hist: S.me.history[0].k, my: G(g).my }), pendant.jeu);
  expect(fin.solde).toBeCloseTo(apres.solde, 2); expect(fin.regles).toBe(avant.regles + 1); expect(fin.hist).toBe('flash'); expect(fin.my).toBeNull();
  expect(erreurs).toEqual([]);
});

test('recette 5 · amis : A cherche B et lui envoie une demande, B l’accepte, les deux listes sont à jour', async ({ browser }) => {
  test.setTimeout(120000);
  const connecter = async pseudo => {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const erreurs = await ouvrirReel(page, '#connexion');
    await page.locator('#le').fill(pseudo); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
    await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
    await page.evaluate(() => { location.hash = '#amis'; });
    return { ctx, page, erreurs };
  };
  const listes = page => lire(page, () => ({ amis: S.me.friends.map(u => userOf(u).n), recues: S.me.freqIn.map(u => userOf(u).n), envoyees: S.me.freqOut.map(u => userOf(u).n) }));
  const a = await connecter(PSEUDO);
  // A cherche B par son pseudo (le serveur répond) et lui envoie une demande
  await a.page.locator('[data-fq]').fill(PSEUDO + 'b');
  const resultat = a.page.locator('[data-fres] .frow', { hasText: PSEUDO + 'b' });
  await expect(resultat).toHaveCount(1, { timeout: 15000 });
  await resultat.locator('[data-a="fr-add"]').click();
  await expect(a.page.locator('.toast', { hasText: 'Friend request sent' }).first()).toBeVisible({ timeout: 15000 });
  expect(await listes(a.page)).toEqual({ amis: [], recues: [], envoyees: [PSEUDO + 'b'] });
  // B ouvre le site : la demande est là, avec le pseudo de A ; il l'accepte
  const b = await connecter(PSEUDO + 'b');
  expect(await listes(b.page)).toEqual({ amis: [], recues: [PSEUDO], envoyees: [] });
  expect(await lire(b.page, () => S.me.notifs.map(n => n.text).join(' | '))).toContain(PSEUDO + ' wants to add you');
  const xpB = await lire(b.page, () => S.me.xp);
  await b.page.locator('.frow', { hasText: PSEUDO }).locator('[data-a="fr-accept"]').click();
  await expect.poll(() => listes(b.page), { timeout: 15000 }).toEqual({ amis: [PSEUDO], recues: [], envoyees: [] });
  expect(await lire(b.page, () => S.me.xp)).toBe(xpB + 15);
  // A recharge : B est dans ses amis, et il en est prévenu
  await a.page.reload(); await pret(a.page);
  expect(await listes(a.page)).toEqual({ amis: [PSEUDO + 'b'], recues: [], envoyees: [] });
  expect(await lire(a.page, () => S.me.notifs.map(n => n.text).join(' | '))).toContain(PSEUDO + 'b accepted your friend request');
  // B recharge aussi : même chose de son côté
  await b.page.reload(); await pret(b.page);
  expect(await listes(b.page)).toEqual({ amis: [PSEUDO], recues: [], envoyees: [] });
  expect(a.erreurs).toEqual([]); expect(b.erreurs).toEqual([]);
  await a.ctx.close(); await b.ctx.close();
});

test('recette 5 · sujet privé : une demande d’ami arrive en direct chez son destinataire, et un tiers abonné à ce sujet ne reçoit rien', async ({ browser }) => {
  test.setTimeout(120000);
  // B, déjà inscrit, est sur sa page Amis
  const ctxB = await browser.newContext(), b = await ctxB.newPage();
  const erreursB = await ouvrirReel(b, '#connexion');
  await b.locator('#le').fill(PSEUDO + 'b'); await b.locator('#lp').fill(MDP); await b.locator('form[data-form="login"] [type=submit]').click();
  await expect(b).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(b);
  await b.evaluate(() => { location.hash = '#amis'; });
  const idB = await lire(b, () => S.auth.key.slice(4));
  // C : un troisième compte
  const ctxC = await browser.newContext(), c = await ctxC.newPage();
  await ouvrirReel(c, '#inscription');
  const f = c.locator('form[data-form="signup"]');
  await f.locator('[name=pseudo]').fill(PSEUDO + 'c'); await f.locator('[name=email]').fill(`wimoro-e2e-${stamp}-c@example.com`); await f.locator('[name=pw]').fill(MDP);
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check(); await f.locator('[type=submit]').click();
  await expect(c).toHaveURL(/#bienvenue/, { timeout: 20000 }); await pret(c);
  // C tente d'écouter le sujet privé de B
  await c.evaluate(id => { window.__vole = []; return API.subscribe('joueur:' + id, (evt, d) => window.__vole.push([evt, d]), true); }, idB);
  await c.waitForTimeout(2500);
  // C envoie une demande d'ami à B : le serveur pousse la notification sur le sujet privé de B
  const rep = await c.evaluate(id => API.call('api_friend', { p_action: 'add', p_user: id }), idB);
  expect(rep.r).toBe('envoyee');
  // B la voit arriver sans recharger : la cloche, puis la liste des demandes reçues
  await expect.poll(() => lire(b, () => S.me.notifs.map(n => n.text).join(' | ')), { timeout: 20000 }).toContain(PSEUDO + 'c wants to add you');
  await expect.poll(() => lire(b, () => S.me.freqIn.map(u => userOf(u).n)), { timeout: 20000 }).toEqual([PSEUDO + 'c']);
  await expect(b.locator('.frow', { hasText: PSEUDO + 'c' }).locator('[data-a="fr-accept"]')).toBeVisible({ timeout: 10000 });
  // C, lui, n'a rien reçu du sujet de B
  await c.waitForTimeout(3000);
  expect(await lire(c, () => window.__vole), 'un tiers ne reçoit rien du sujet privé d’un autre joueur').toEqual([]);
  // et il ne peut pas lire une conversation qui n'est pas la sienne
  expect(await c.evaluate(async id => { try { await API.call('api_dm_history', { p_user: id }); return 'lu'; } catch (e) { return e.code; } }, idB)).toBe('pas_amis');
  expect(erreursB).toEqual([]);
  await ctxB.close(); await ctxC.close();
});

test('recette 1 · mode Compte, trois langues : chaque écran s’ouvre sans erreur avec un vrai compte', async ({ page }) => {
  test.setTimeout(200000);
  const erreurs = await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(PSEUDO); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  const ECRANS = ['accueil', 'marche-btc150k', 'marche-presid27', 'marche-presid27-roux', 'eclair', 'blitz', 'serie', 'chat', 'clans', 'classement', 'rang', 'profil', 'depot', 'retrait', 'creer', 'modifier', 'amis', 'copie', 'parrainage', 'responsable', 'duels', 'combines'];
  for (const lang of ['fr', 'he', 'en']) {
    await page.evaluate(l => { localStorage.setItem('wimoro-lang', l); }, lang);
    await page.reload(); await pret(page);
    const vu = await lire(page, () => ({ lang: document.documentElement.lang, rtl: document.documentElement.dir === 'rtl', srv: SRV(), connecte: S.me.logged }));
    expect(vu).toEqual({ lang, rtl: lang === 'he', srv: true, connecte: true });
    for (const ecran of ECRANS) {
      await page.evaluate(h => { location.hash = '#' + h; }, ecran);
      await page.waitForTimeout(150);
      await expect(page.locator('#view > *').first(), lang + ' ' + ecran).toBeAttached();
    }
  }
  expect(erreurs, 'zéro erreur console').toEqual([]);
});
