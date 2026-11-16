// Bout en bout contre le VRAI back (aucun faux serveur) : le site servi en local parle au projet Supabase.
// Recette 3 (partie comptes) : inscription → onboarding → rechargement → déconnexion → reconnexion par pseudo →
// même état ; même vérification depuis un second navigateur.
//
// Lancer : E2E=1 CHROME=1 npx playwright test --project=e2e
// Les comptes créés sont des comptes de test jetables (e-mail wimoro-e2e-…@example.com). À la fin de la suite, chacun se
// supprime lui-même par api_test_end (réservée à ces adresses) : rien ne reste dans la vraie base.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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

test.afterAll(async () => {
  const src = fs.readFileSync('js/api.js', 'utf8');
  const back = 'https://' + /REF='([a-z0-9]+)'/.exec(src)[1] + '.supabase.co', cle = /CLE='([^']+)'/.exec(src)[1];
  for (const suffixe of ['', '-b', '-c', '-d']) {
    const email = `wimoro-e2e-${stamp}${suffixe}@example.com`;
    const r = await fetch(back + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: cle, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: MDP }) });
    if (!r.ok) continue;                                                                    // compte jamais créé (suite interrompue avant)
    const { access_token: jeton } = await r.json();
    const d = await fetch(back + '/rest/v1/rpc/api_test_end', { method: 'POST', headers: { apikey: cle, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' }, body: '{}' });
    if (!d.ok) console.warn(`compte de test non supprimé : ${email} (HTTP ${d.status})`);
  }
});

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
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'cp-start'; document.body.appendChild(b); b.click(); b.remove(); });   // copy trading : pas encore relié
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

  // K26 : les bots parlent dans le salon regardé — six messages d'amorce au moins, en vraies phrases, puis un nouveau en direct
  const bots = () => lire(b, () => room('m:clasico').msgs.filter(x => x.u !== 'me' && (USERS[x.u] || {}).bot).map(x => x.text));
  await expect.poll(async () => (await bots()).length, { timeout: 15000 }).toBeGreaterThanOrEqual(6);
  const dejaLa = await bots();
  for (const t of dejaLa) { expect(t.length).toBeGreaterThan(3); expect(t).not.toMatch(/[{}]/); }
  await expect.poll(async () => (await bots()).length, { timeout: 90000 }).toBeGreaterThan(dejaLa.length);   // un message toutes les 15 s environ, par salon regardé

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

test('panel d’administration : un compte ordinaire est refusé par le vrai serveur, et la page ne lui montre rien', async ({ page }) => {
  const erreurs = await ouvrirReel(page, '#connexion');
  // par e-mail : la connexion par pseudo est limitée en fréquence, et la suite s'en est déjà servie plusieurs fois
  await page.locator('#le').fill(EMAIL); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  await page.goto('/admin.html');
  await expect(page.locator('#adm-refus')).toContainText('Accès réservé', { timeout: 20000 });
  await expect(page.locator('#adm-nav')).toBeHidden();
  for (const action of ['chiffres', 'joueurs', 'solde', 'rang', 'suspendre', 'marche', 'resoudre', 'masquer', 'bots', 'journal'])
    expect(await page.evaluate(async a => { try { await API.call('api_admin', { p_action: a, p: { id: 'btc150k', issue: 'oui', delta: 1000, motif: 'essai', jours: 1, t: 8, d: 0, actif: false } }); return 'ouvert'; } catch (e) { return e.code; } }, action), action).toBe('interdit');
  expect(await page.evaluate(async () => (await API.call('api_markets')).m.btc150k.st)).toBe('open');   // rien n'a bougé
  expect(erreurs).toEqual([]);
});

test('La Série : lancée, jouée et réglée par le vrai serveur ; la manche gagnée paie ce que l’écran annonce, l’encaissement arrive sur le solde', async ({ page }) => {
  test.setTimeout(180000);
  const erreurs = await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(EMAIL); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  await page.evaluate(() => { location.hash = '#serie'; });
  const solde0 = await lire(page, () => S.me.balance);
  expect(solde0, 'le compte de test a encore de quoi miser').toBeGreaterThan(10);
  await page.locator('[data-a="sr-stake"][data-v="5"]').click();
  await page.locator('[data-a="sr-start"]').click();
  await expect.poll(() => lire(page, () => S.me.serie && S.me.serie.state), { timeout: 20000 }).toBe('running');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(solde0 - 5, 2);
  // Le moteur est déterministe : l'écran peut calculer l'issue de la manche à partir de l'heure de début donnée par le serveur.
  const prevu = await lire(page, () => { const s = S.me.serie, d = MoteurEclair.JEUX[s.gid]; return MoteurEclair.serieIssue(d, s.rStart + FSKEW); });
  expect(prevu.p0, 'même prix de départ sur l’écran et sur le serveur').toBeCloseTo(await lire(page, () => S.me.serie.p0), 6);
  await page.locator('[data-a="sr-play"][data-v="' + prevu.out + '"]').click();
  await expect.poll(() => lire(page, () => S.me.serie.choice), { timeout: 20000 }).toBe(prevu.out);
  const { mult, fee } = await lire(page, () => ({ mult: S.me.serie.mult, fee: S.me.serie.fee }));
  expect(mult).toBeGreaterThan(1);
  await page.reload(); await pret(page);                                                     // la série en cours survit au rechargement
  expect(await lire(page, () => ({ etat: S.me.serie.state, choix: S.me.serie.choice }))).toEqual({ etat: 'running', choix: prevu.out });
  await expect.poll(() => lire(page, () => S.me.serie.step), { timeout: 90000, intervals: [2000] }).toBe(2);   // fin de la manche : réglée par le serveur
  const stack = await lire(page, () => S.me.serie.stack);
  expect(stack).toBeCloseTo(Math.round((5 - fee) * mult * 100) / 100, 2);
  expect(await lire(page, () => S.me.balance), 'rien n’est versé tant que la série continue').toBeCloseTo(solde0 - 5, 2);
  await page.locator('[data-a="sr-cash"]').click();
  await expect.poll(() => lire(page, () => S.me.serie.state), { timeout: 20000 }).toBe('cashed');
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(solde0 - 5 + stack, 2);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, k: S.me.history[0].k, win: S.me.history[0].win }))).toMatchObject({ k: 'serie', win: true });
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(solde0 - 5 + stack, 2);
  expect(erreurs).toEqual([]);
});

test('Blitz Royale : la salle affichée est celle du moteur ; l’inscription au prochain Blitz est prise par le vrai serveur, une seule fois', async ({ page }) => {
  test.setTimeout(120000);
  const erreurs = await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(EMAIL); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  await page.evaluate(() => { location.hash = '#blitz'; });
  await expect.poll(() => lire(page, () => !!(S.bz.royale && S.bz.royale.sid)), { timeout: 20000 }).toBe(true);
  const vu = await lire(page, () => { const r = S.bz.royale, b = MoteurEclair.bzBots(r.sid); return { etat: r.state, cible: r.target, moteur: b.n, buyin: r.buyin, attendu: b.buyin, inscrits: r.bots.length }; });
  expect(['lobby', 'live', 'done']).toContain(vu.etat);
  expect(vu.cible).toBe(vu.moteur); expect(vu.buyin).toBe(vu.attendu); expect(vu.inscrits).toBeGreaterThan(100);
  await expect(page.locator('[data-bzcard] .bzcard')).toBeVisible();

  const appel = (action, corps) => page.evaluate(async ([action, corps]) => { try { const r = await API.fn('eclair', Object.assign({ action }, corps)); return { ok: true, r }; } catch (e) { return { ok: false, code: e.code }; } }, [action, corps]);
  const etat = await appel('blitz_state', { id: await lire(page, () => MoteurEclair.bzId(Date.now() + FSKEW)) });
  expect(etat.ok).toBe(true); expect(etat.r.blitz).toMatchObject({ moi: null }); expect(Array.isArray(etat.r.blitz.vivants)).toBe(true);
  const prochain = await lire(page, () => MoteurEclair.bzId(Date.now() + FSKEW) + 1);          // toujours ouvert aux inscriptions
  const solde0 = await lire(page, () => S.me.balance), buyin = await lire(page, id => MoteurEclair.bzBots(id).buyin, prochain);
  const cle = await lire(page, () => crypto.randomUUID());
  const entree = await appel('blitz_join', { id: prochain, key: cle });
  expect(entree.ok).toBe(true);
  expect(entree.r.blitz).toMatchObject({ id: prochain, moi: { paye: buyin, rachat: false, regle: false } }); expect(entree.r.blitz.n).toBeGreaterThanOrEqual(1);
  expect(entree.r.me.balance).toBeCloseTo(solde0 - buyin, 2);
  expect((await appel('blitz_join', { id: prochain, key: cle })).r.rejoue, 'même clé : rien de plus').toBe(true);
  expect(await appel('blitz_join', { id: prochain, key: await lire(page, () => crypto.randomUUID()) })).toEqual({ ok: false, code: 'deja_inscrit' });
  expect(await appel('blitz_choose', { id: prochain, choice: 'oui' })).toEqual({ ok: false, code: 'blitz_inconnu' });   // ce Blitz n'a pas commencé
  expect(await appel('blitz_settle', { id: prochain })).toEqual({ ok: false, code: 'blitz_inconnu' });
  expect(await appel('blitz_join', { id: prochain + 5, key: cle })).toEqual({ ok: false, code: 'blitz_inconnu' });
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(solde0 - buyin, 2);                // l'entrée est bien en base
  expect(await lire(page, () => SRV_BZ.aRegler)).toContain(prochain);
  expect(erreurs).toEqual([]);
});

test('duels : A défie B (mise prise par le vrai serveur), B sans solde ne peut pas accepter et refuse, A est remboursé ; contre un bot ami, le duel part aussitôt', async ({ browser }) => {
  test.setTimeout(180000);
  const entrer = async email => {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const erreurs = await ouvrirReel(page, '#connexion');
    await page.locator('#le').fill(email); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
    await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
    return { ctx, page, erreurs };
  };
  const a = await entrer(EMAIL), b = await entrer(`wimoro-e2e-${stamp}-b@example.com`);
  const idB = await lire(b.page, () => srvMoi());
  expect(await lire(a.page, id => S.me.friends.includes(id), idB), 'A et B sont amis depuis le scénario précédent').toBe(true);
  const solde0 = await lire(a.page, () => S.me.balance);
  // A ouvre la fenêtre de défi vers B et l'envoie
  await a.page.evaluate(id => { const x = document.createElement('button'); x.dataset.a = 'duel-open'; x.dataset.m = 'clasico'; x.dataset.u = id; document.body.appendChild(x); x.click(); x.remove(); }, idB);
  await a.page.locator('[data-a="dl-create"]').click();
  await expect.poll(() => lire(a.page, () => (S.me.duels || []).length), { timeout: 20000 }).toBe(1);
  const d = await lire(a.page, () => { const x = S.me.duels[0]; return { id: x.id, stake: x.stake, fee: x.fee, status: x.status, by: x.by }; });
  expect(d).toMatchObject({ status: 'open', by: 'me' });
  expect(await lire(a.page, () => S.me.balance)).toBeCloseTo(solde0 - d.stake - d.fee, 2);
  // B le reçoit en direct (notification sur son sujet privé), ne peut pas l'accepter sans solde, puis le refuse
  await expect.poll(() => lire(b.page, () => (S.me.duels || []).map(x => x.id)), { timeout: 30000 }).toEqual([d.id]);
  expect(await lire(b.page, () => ({ by: S.me.duels[0].by === 'me', opp: S.me.duels[0].opp, st: S.me.duels[0].status }))).toEqual({ by: false, opp: 'me', st: 'open' });
  expect(await b.page.evaluate(async id => { try { await API.call('api_duel_accept', { p: { id: +id } }); return 'accepté'; } catch (e) { return e.code; } }, d.id)).toBe('solde_insuffisant');
  await b.page.evaluate(id => { location.hash = '#duel-' + id; }, d.id);
  await b.page.locator('[data-a="dl-decline"][data-id="' + d.id + '"]').click();
  await expect(b.page).toHaveURL(/#duels/, { timeout: 20000 });
  await expect.poll(() => lire(a.page, () => S.me.duels[0].status), { timeout: 30000 }).toBe('declined');   // A l'apprend en direct
  expect(await lire(a.page, () => S.me.balance)).toBeCloseTo(solde0 - d.fee, 2);               // la mise revient, pas les frais d'ouverture
  expect(await a.page.evaluate(async id => { try { await API.call('api_duel_close', { p_id: +id, p_action: 'cancel' }); return 'annulé'; } catch (e) { return e.code; } }, d.id)).toBe('duel_indisponible');

  // contre un bot devenu ami : accepté aussitôt par le serveur, à la cote du marché
  const bot = await a.page.evaluate(async () => { const r = await API.call('api_users_search', { p_q: 'ma' }); const id = (r.ids || []).find(i => r.users[i].bot); if (!id) return null; await API.call('api_friend', { p_action: 'add', p_user: id }); return id; });
  expect(bot, 'un bot trouvé par la recherche').toBeTruthy();
  const duel = await a.page.evaluate(async id => (await API.call('api_duel_create', { p: { m: 'clasico', side: 'non', stake: 5, opp: id, key: crypto.randomUUID() } })).duel, bot);
  expect(duel).toMatchObject({ st: 'active', opp: bot, stake: 5 });
  expect(duel.pot).toBeCloseTo(5 * 100 / duel.price, 1); expect(duel.oppStake).toBeCloseTo(duel.pot - 5, 1);
  await a.page.reload(); await pret(a.page);
  expect(await lire(a.page, () => S.me.duels.map(x => x.status))).toEqual(['active', 'declined']);
  expect(a.erreurs).toEqual([]); expect(b.erreurs).toEqual([]);
  await a.ctx.close(); await b.ctx.close();
});

test('combiné : composé à l’écran, validé par le vrai serveur (prix bloqués, mise prise), retrouvé après rechargement, puis encaissé', async ({ page }) => {
  test.setTimeout(120000);
  const erreurs = await ouvrirReel(page, '#connexion');
  await page.locator('#le').fill(EMAIL); await page.locator('#lp').fill(MDP); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(page);
  const clic = (a, data = {}) => page.evaluate(([a, data]) => { const b = document.createElement('button'); b.dataset.a = a; Object.assign(b.dataset, data); document.body.appendChild(b); b.click(); b.remove(); }, [a, data]);
  const solde0 = await lire(page, () => S.me.balance), avant = await lire(page, () => (S.me.combos || []).length);
  await clic('cb-add', { m: 'btc150k', s: 'oui' }); await clic('cb-add', { m: 'clasico', s: 'non' });
  expect(await lire(page, () => slip().legs.length)).toBe(2);
  await clic('cb-open');
  await page.locator('[data-a="cb-place"]').click();
  await expect.poll(() => lire(page, () => (S.me.combos || []).length), { timeout: 20000 }).toBe(avant + 1);
  const c = await lire(page, () => { const x = S.me.combos[0]; return { id: x.id, stake: x.stake, mult: x.mult, pay: x.pay, status: x.status, legs: x.legs.map(l => ({ m: l.m, s: l.s, price: l.price, mult: l.mult })) }; });
  expect(c.status).toBe('open'); expect(c.legs.map(l => l.m + ':' + l.s)).toEqual(['btc150k:oui', 'clasico:non']);
  expect(c.mult).toBeCloseTo(c.legs[0].mult * c.legs[1].mult, 6);                             // cote = produit des cotes bloquées par le serveur
  expect(c.pay).toBeCloseTo(Math.round(c.stake * c.mult * 100) / 100 * 0.95, 1);
  for (const l of c.legs) expect(l.mult).toBeCloseTo(100 / l.price, 6);
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(solde0 - c.stake, 2);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ id: S.me.combos[0].id, st: S.me.combos[0].status }))).toEqual({ id: c.id, st: 'open' });
  await page.evaluate(() => { location.hash = '#combines'; });
  await page.locator('[data-a="cb-cash"][data-id="' + c.id + '"]').click();
  await expect.poll(() => lire(page, () => S.me.combos[0].status), { timeout: 20000 }).toBe('cashed');
  const cash = await lire(page, () => S.me.combos[0].cash);
  expect(cash).toBeGreaterThan(0); expect(cash).toBeLessThan(c.stake);                        // encaissé aussitôt : la valeur du moment, moins les 5 %
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(solde0 - c.stake + cash, 2);
  expect(await page.evaluate(async id => { try { await API.call('api_combo_cash', { p_id: +id }); return 'encaissé deux fois'; } catch (e) { return e.code; } }, c.id)).toBe('combine_indisponible');
  expect(erreurs).toEqual([]);
});

test('parrainage : le code vient du vrai serveur ; un ami inscrit avec le lien reçoit 10 $, et son premier pari en verse 10 au parrain, en direct', async ({ browser }) => {
  test.setTimeout(180000);
  const ca = await browser.newContext(), pa = await ca.newPage();
  const erreursA = await ouvrirReel(pa, '#connexion');
  await pa.locator('#le').fill(EMAIL); await pa.locator('#lp').fill(MDP); await pa.locator('form[data-form="login"] [type=submit]').click();
  await expect(pa).toHaveURL(/#accueil/, { timeout: 20000 }); await pret(pa);
  await pa.evaluate(() => { location.hash = '#parrainage'; });
  const code = await lire(pa, () => refCode());
  expect(code).toMatch(/^[A-Z0-9]{2,10}-[A-Z0-9]{3}$/);
  await expect(pa.locator('.refcode')).toHaveText(code);
  const a0 = await lire(pa, () => ({ solde: S.me.balance, filleuls: refsAll().length }));

  // l'ami ouvre le lien d'invitation dans un autre navigateur et crée son compte
  const cd = await browser.newContext(), pd = await cd.newPage();
  const erreursD = await ouvrirReel(pd, '?r=' + code.toLowerCase() + '#inscription');
  const f = pd.locator('form[data-form="signup"]');
  await expect(f.locator('[name=ref]')).toHaveValue(code);
  await f.locator('[name=pseudo]').fill(PSEUDO + 'd'); await f.locator('[name=email]').fill(`wimoro-e2e-${stamp}-d@example.com`); await f.locator('[name=pw]').fill(MDP);
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check();
  await f.locator('[type=submit]').click();
  await expect(pd).toHaveURL(/#bienvenue/, { timeout: 20000 }); await pret(pd);
  expect(await lire(pd, () => ({ solde: S.me.balance, par: S.me.refBy, depots: S.me.deposits, lignes: S.me.deps.map(d => d.label), notif: S.me.notifs.map(n => n.text) })))
    .toEqual({ solde: 10, par: code, depots: 0, lignes: ['parrainage'], notif: ['Referral bonus: $10 free thanks to code ' + code + '.'] });
  expect(await lire(pd, () => refCode())).toMatch(/^[A-Z0-9]{2,10}-[A-Z0-9]{3}$/);
  expect(await lire(pd, () => refCode())).not.toBe(code);

  // le parrain est prévenu en direct : un filleul en attente, rien de versé
  await expect.poll(() => lire(pa, () => refsAll().map(r => r.n + ':' + r.st)), { timeout: 20000 }).toContain(PSEUDO + 'd:pending');
  expect(await lire(pa, () => ({ solde: S.me.balance, filleuls: refsAll().length }))).toEqual({ solde: a0.solde, filleuls: a0.filleuls + 1 });

  // premier pari du filleul (5 $ pris sur son bonus) : 10 $ pour le parrain, une seule fois
  expect(await pd.evaluate(async () => (await API.call('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 5, p_key: crypto.randomUUID(), p_opts: {} })).me.played)).toBe(1);
  await expect.poll(() => lire(pa, () => refsAll().map(r => r.n + ':' + r.st + ':' + r.paid)), { timeout: 20000 }).toContain(PSEUDO + 'd:done:10');
  await expect.poll(() => lire(pa, () => S.me.balance), { timeout: 20000 }).toBeCloseTo(a0.solde + 10, 2);
  expect(await pd.evaluate(async () => (await API.call('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 2, p_key: crypto.randomUUID(), p_opts: {} })).me.played)).toBe(2);
  await pa.reload(); await pret(pa);
  expect(await lire(pa, () => S.me.balance)).toBeCloseTo(a0.solde + 10, 2);
  expect(await lire(pa, () => S.me.notifs.some(n => /placed their first bet, \$10 for you/.test(n.text)))).toBe(true);
  expect(erreursA).toEqual([]); expect(erreursD).toEqual([]);
  await ca.close(); await cd.close();
});
