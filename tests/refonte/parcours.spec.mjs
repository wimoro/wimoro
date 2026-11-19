// Dans un vrai navigateur (Playwright), parcours de bout en bout de la refonte du design : navigation en 5 destinations,
// ticket de pari, Éclair, Portefeuille, dépôt, retrait, Communauté, langue, thème, déconnexion, et « trois gestes au plus ».
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ouvrir, lire, fermerRang, debutManche, routerSite } from '../helpers/app.mjs';

const DESTINATIONS = [['accueil', '#accueil'], ['eclair', '#eclair'], ['portefeuille', '#portefeuille'], ['communaute', '#communaute'], ['profil', '#profil']];
const url = h => new RegExp(h.replace('#', '#') + '(\\b|$)');

/** Ouvre le compte démo puis ferme la fenêtre « Bienvenue » (elle s'ouvre 700 ms après le démarrage, sauf horloge figée). */
async function demo(page, o) {
  const r = await ouvrir(page, { mode: 'demo', ...o });
  if (o.horloge == null) {
    await page.locator('#ov').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    if (await page.locator('#ov').count()) { await page.keyboard.press('Escape'); await expect(page.locator('#ov')).toHaveCount(0); }
  }
  return r;
}

test('1 · ordinateur : chaque lien de la navigation mène à sa destination et devient actif', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#accueil' });
  const liens = page.locator('nav.nav a[data-nav]');
  const n = await liens.count();
  expect(n).toBe(5);
  for (let i = 0; i < n; i++) {
    const lien = liens.nth(i);
    await expect(lien).toBeVisible();
    const href = await lien.getAttribute('href');
    await lien.click();
    await expect(page).toHaveURL(url(href));
    await expect(lien).toHaveClass(/\bon\b/);
    await expect(page.locator('nav.nav a.on')).toHaveCount(1);
  }
  expect(erreurs).toEqual([]);
});

test('1 · téléphone : les 5 onglets de la barre du bas @mobile', async ({ page }) => {
  test.skip(!test.info().project.use.isMobile, 'téléphone seulement');
  const { erreurs } = await demo(page, { hash: '#accueil' });
  await fermerRang(page);
  // le cinquième onglet existe en deux versions (profil, connexion) : une seule est affichée
  const liens = page.locator('nav.tabbar a[data-nav]').locator('visible=true');
  await expect(liens).toHaveCount(5);
  for (const [, href] of DESTINATIONS) {
    const lien = page.locator(`nav.tabbar a[href="${href}"]`);
    await expect(lien).toBeVisible();
    await lien.click();
    await expect(page).toHaveURL(url(href));
    await expect(lien).toHaveClass(/\bon\b/);
    await expect(page.locator('nav.tabbar a.on')).toHaveCount(1);
  }
  expect(erreurs).toEqual([]);
});

test('2 · trois gestes pour parier : deux clics, une position de plus', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#accueil' });
  const avant = await lire(page, () => ({ pos: S.me.positions.length, solde: S.me.balance }));
  // Un achat sur un marché déjà détenu agrandit la position existante au lieu d'en créer une : on vise un marché libre.
  const libre = await page.evaluate(() => [...document.querySelectorAll('.row [data-a="bet"][data-s="oui"]')].map(b => b.dataset.m).find(m => !S.me.positions.some(p => p.m === m && p.s === 'oui')));
  expect(libre, 'un marché sans position existe dans la liste').toBeTruthy();
  await page.locator(`.row [data-a="bet"][data-s="oui"][data-m="${libre}"]`).click();
  await page.locator('[data-ticket="sheet"] [data-a="buy"]').click();
  await expect.poll(() => lire(page, () => S.me.positions.length)).toBe(avant.pos + 1);
  expect(await lire(page, () => S.me.balance)).toBeLessThan(avant.solde);
  await fermerRang(page, 800);
  expect(erreurs).toEqual([]);
});

test('3 · ticket : détail replié par défaut, ouvert à la demande, gardé ouvert quand on tape un montant', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#marche-btc150k' });
  const ticket = page.locator('[data-ticket="page"]');
  const detail = ticket.locator('details.tdet');
  await expect(detail).toBeVisible();
  expect(await detail.evaluate(d => d.open)).toBe(false);
  await expect(ticket.locator('[data-a="buy"]')).toBeVisible();
  await detail.locator('summary').click();
  expect(await detail.evaluate(d => d.open)).toBe(true);
  await expect(ticket.locator('[data-c="price"]')).toBeVisible();
  await ticket.locator('[data-tamt="page"]').fill('25');
  await ticket.locator('[data-tamt="page"]').press('Digit1');
  expect(await detail.evaluate(d => d.open)).toBe(true);
  await expect(ticket.locator('[data-c="price"]')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('4 · pari Éclair depuis #eclair : la mise est enregistrée', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#eclair', horloge: debutManche() + 2000 });
  const avant = await lire(page, () => ({ solde: S.me.balance, joues: S.me.played }));
  await page.locator('[data-a="flash-bet"]:not([disabled])').first().click();
  await expect(page.locator('#view')).toContainText('Your stake: $10.00');
  const apres = await lire(page, () => ({ solde: S.me.balance, joues: S.me.played, mise: G(S.ui.fgame).my }));
  expect(apres.mise).toMatchObject({ amt: 10 });
  expect(apres.solde).toBeCloseTo(avant.solde - 10, 2);
  expect(apres.joues).toBe(avant.joues + 1);
  expect(erreurs).toEqual([]);
});

test('5 · portefeuille : solde, Déposer, Retirer, onglet Historique', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#portefeuille' });
  await expect(page.locator('[data-bal-plain]')).toBeVisible();
  await expect(page.locator('[data-bal-plain]')).toContainText(/\d/);
  await page.locator('.wal-a a[href="#depot"]').click();
  await expect(page).toHaveURL(/#depot/);
  await page.goBack();
  await expect(page).toHaveURL(/#portefeuille/);
  await page.locator('.wal-a a[href="#retrait"]').click();
  await expect(page).toHaveURL(/#retrait/);
  await page.goBack();
  await expect(page).toHaveURL(/#portefeuille/);
  await page.locator('[data-a="ptab"][data-v="history"]').click();
  await expect(page).toHaveURL(/#portefeuille/);
  await expect(page.locator('[data-a="ptab"][data-v="history"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-ptab-body]')).toBeVisible();
  expect(await lire(page, () => S.ui.ptab)).toBe('history');
  expect(erreurs).toEqual([]);
});

test('6 · dépôt simulé : un dépôt de plus', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#depot' });
  const avant = await lire(page, () => S.me.deps.length);
  await page.locator('[data-a="sim-dep"]').click();
  const form = page.locator('[data-form="simdep"]');
  await expect(form).toBeVisible();
  await form.locator('input[name="amt"]').fill('100');
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => lire(page, () => S.me.deps.length)).toBe(avant + 1);
  expect(erreurs).toEqual([]);
});

test('7 · retrait : un retrait enregistré, solde diminué', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#retrait' });
  const avant = await lire(page, () => ({ wds: S.me.wds.length, solde: S.me.balance }));
  await page.locator('[data-a="wd-test"]').click();
  await page.locator('[data-wd="amt"]').fill('20');
  await expect(page.locator('[data-a="withdraw"]')).toBeEnabled();
  await page.locator('[data-a="withdraw"]').click();
  await expect.poll(() => lire(page, () => S.me.wds.length)).toBe(avant.wds + 1);
  expect(await lire(page, () => S.me.balance)).toBeLessThan(avant.solde);
  expect(erreurs).toEqual([]);
});

test('8 · chat : 5 entrées de sous-navigation, un message écrit apparaît dans le fil', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#chat' });
  await expect(page.locator('nav.subnav a')).toHaveCount(5);
  const msg = 'Bonjour refonte ' + Date.now();
  const champ = page.locator('[data-in="general"]').first();
  await champ.fill(msg);
  await champ.press('Enter');
  await expect(page.locator('.feed').filter({ hasText: msg }).first()).toBeVisible();
  expect(erreurs).toEqual([]);
});

const COM = [['clans', '#clans'], ['classement', '#classement'], ['amis', '#amis'], ['copie', '#copie']];
const JEUX = [['blitz', '#blitz'], ['serie', '#serie'], ['duels', '#duels']];
test('9 · sous-navigations : Communauté et modes de jeu avec la bonne entrée active', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#accueil' });
  for (const [ecran, href] of COM) {
    await page.evaluate(h => { location.hash = h; }, href);
    const sub = page.locator('nav.subnav[aria-label="Community"], nav.subnav').filter({ has: page.locator('a[href="#chat"]') });
    await expect(sub, ecran).toHaveCount(1);
    await expect(sub.locator('a.on')).toHaveCount(1);
    await expect(sub.locator(`a.on[href="${href}"]`), ecran).toBeVisible();
  }
  for (const [ecran, href] of JEUX) {
    await page.evaluate(h => { location.hash = h; }, href);
    const sub = page.locator('nav.subnav').filter({ has: page.locator('a[href="#blitz"]') });
    await expect(sub, ecran).toHaveCount(1);
    await expect(sub.locator('a.on')).toHaveCount(1);
    await expect(sub.locator(`a.on[href="${href}"]`), ecran).toBeVisible();
  }
  expect(erreurs).toEqual([]);
});

test('10 · langue : hébreu en RTL après rechargement, onglets traduits, pas de débordement à 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { erreurs } = await demo(page, { hash: '#accueil' });
  const debord = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await debord()).toBeLessThanOrEqual(0);
  await page.evaluate(() => { location.hash = '#profil'; });
  await page.locator('.acct [data-a="lang-pick"]').click();
  await page.locator('[data-a="lang-set"][data-v="he"]').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expect(page.locator('#view > *').first()).toBeAttached();
  await expect(page.locator('nav.tabbar a').first()).toHaveText(/[֐-׿]/);
  await page.evaluate(() => { location.hash = '#accueil'; });
  await expect(page).toHaveURL(/#accueil/);
  await expect(page.locator('.row').first()).toBeVisible();
  expect(await debord()).toBeLessThanOrEqual(0);
  expect(erreurs).toEqual([]);
});

test('11 · thème : clair par défaut même si le système est sombre, sombre à la demande et conservé', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const { erreurs } = await demo(page, { hash: '#profil' });
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(await theme()).not.toBe('dark');
  await page.locator('[data-a="ptab"][data-v="settings"]').click();
  await page.locator('[data-a="theme"]').first().click();
  expect(await theme()).toBe('dark');
  await page.reload();
  await expect(page.locator('#view > *').first()).toBeAttached();
  expect(await theme()).toBe('dark');
  expect(erreurs).toEqual([]);
});

test('12 · déconnexion : retour à #connexion, body.out', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#profil' });
  await page.locator('[data-a="ptab"][data-v="settings"]').click();
  await page.locator('[data-ptab-body] [data-a="logout"]').click();
  await expect(page).toHaveURL(/#connexion/);
  await expect(page.locator('body')).toHaveClass(/\bout\b/);
  expect(erreurs).toEqual([]);
});

/* 13 · chemins de clics depuis #accueil (ordinateur) : chaque élément est un sélecteur de lien ou bouton visible. */
const NAV = h => `nav.nav a[href="${h}"]`;
const SOUS = h => `nav.subnav a[href="${h}"]`;
const CHEMINS = [
  ['rang', [NAV('#profil'), 'a[href="#rang"]']],
  ['parrainage', ['a[data-a="umenu"]', '#umenu a[href="#parrainage"]']],
  ['responsable', [NAV('#portefeuille'), '.menu-l a[href="#responsable"]']],
  ['modifier', [NAV('#profil'), 'a[href="#modifier"]']],
  ['duels', [NAV('#eclair'), SOUS('#duels')]],
  ['combines', [NAV('#portefeuille'), '.menu-l a[href="#combines"]']],
  ['creer', [NAV('#profil'), '[data-a="ptab"][data-v="mine"]', 'a[href="#creer"]']],
  ['depot', [NAV('#portefeuille'), '.wal-a a[href="#depot"]']],
  ['retrait', [NAV('#portefeuille'), '.wal-a a[href="#retrait"]']],
  ['chat', [NAV('#communaute'), '.hub a[href="#chat"]']],
  ['amis', [NAV('#communaute'), '.hub a[href="#amis"]']],
  ['copie', [NAV('#communaute'), '.hub a[href="#copie"]']],
  ['clans', [NAV('#communaute'), '.hub a[href="#clans"]']],
  ['classement', [NAV('#communaute'), '.hub a[href="#classement"]']],
  ['blitz', [NAV('#eclair'), SOUS('#blitz')]],
  ['serie', [NAV('#eclair'), SOUS('#serie')]],
];
for (const [ecran, chemin] of CHEMINS) {
  test(`13 · « ${ecran} » s’atteint en ${chemin.length} gestes depuis l’accueil`, async ({ page }) => {
    expect(chemin.length).toBeLessThanOrEqual(3);
    const { erreurs } = await demo(page, { hash: '#accueil' });
    for (const sel of chemin) {
      const cible = page.locator(sel).locator('visible=true').first();
      await expect(cible, sel).toBeVisible();
      await cible.click();
    }
    await expect(page).toHaveURL(new RegExp('#' + ecran + '(\\b|$)'));
    await expect(page.locator('#view > *').first()).toBeAttached();
    expect(erreurs).toEqual([]);
  });
}

/* ===================== Seconde passe : en-tête de départ, libellés, langue, montants, Communauté, barre d'onglets, ticket ===================== */
const norm = s => s.replace(/[  ⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
const FAUX_SB = fs.readFileSync(new URL('../helpers/fake-supabase.js', import.meta.url), 'utf8');

/** Ouvre le site SANS écrire de langue (comme un premier visiteur) ; `local` est posé avant le premier script. */
async function ouvrirNu(page, local = {}, hash = '#accueil') {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(`${e.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console.error: ' + m.text()); });
  await page.route(/(js\/vendor\/supabase[^/]*\.js|cdn\.jsdelivr\.net\/.*supabase)/, r => r.fulfill({ contentType: 'text/javascript', body: FAUX_SB }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await routerSite(page);                                                    // réglages du site : servis par le test, jamais par le vrai serveur
  await page.addInitScript(l => { window.__FAKE_SB__ = { session: null }; if (!sessionStorage.getItem('__nu__')) { sessionStorage.setItem('__nu__', '1'); for (const k in l) localStorage.setItem(k, l[k]); } }, local);
  await page.goto('/index.html' + hash);
  await expect(page.locator('#view > *').first()).toBeAttached({ timeout: 15000 });
  return { erreurs };
}
const textes = (page, sel) => page.locator(sel).locator('visible=true').allInnerTexts().then(a => a.map(norm));

test('14 · connexion : visiteur → formulaire → compte démo (bouton « compte démo »)', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', lang: 'fr', hash: '#accueil' });
  await expect(page.locator('body')).toHaveClass(/\bout\b/);
  await page.locator('.top .login').click();
  await expect(page).toHaveURL(/#connexion/);
  await expect(page.locator('[data-form="login"]')).toBeVisible();
  await expect(page.locator('#view h1')).toHaveText('Se connecter');
  await page.locator('[data-a="demo-login"]').click();
  await expect(page.locator('body')).toHaveClass(/\bin\b/);
  await expect(page.locator('body')).not.toHaveClass(/\bout\b/);
  expect(await lire(page, () => S.me.logged)).toBeTruthy();
  await expect(page.locator('.top .me-av')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('15 · départ : état neutre (.sk) tant que boot.js n’a pas tourné, puis in OU out', async ({ page }) => {
  let ouvrirVanne; const vanne = new Promise(r => { ouvrirVanne = r; });
  await page.route(/js\/boot\.js/, async r => { await vanne; await r.continue(); });
  const p = ouvrir(page, { mode: 'visiteur' });
  await expect(page.locator('.top .sk')).toBeVisible();
  const classes = await page.locator('body').getAttribute('class');
  expect(classes || '').not.toMatch(/\b(in|out)\b/);
  for (const s of ['.top .bal', '.top .bell', '.top .me-av', '.top .login', '.top .signup']) await expect(page.locator(s), s).toBeHidden();
  ouvrirVanne();
  const { erreurs } = await p;
  await expect(page.locator('body')).toHaveClass(/\bout\b/);
  await expect(page.locator('body')).not.toHaveClass(/\bin\b/);
  await expect(page.locator('.top .sk')).toBeHidden();
  await expect(page.locator('.top .login')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('15b · départ : connecté, body.in seulement', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#accueil' });
  await expect(page.locator('body')).toHaveClass(/\bin\b/);
  await expect(page.locator('body')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.top .bal')).toBeVisible();
  await expect(page.locator('.top .login')).toBeHidden();
  expect(erreurs).toEqual([]);
});

for (const [lang, connexion, inscription] of [['fr', 'Se connecter', 'S’inscrire'], ['en', 'Log in', 'Sign up']]) {
  for (const w of [390, 1280]) {
    test(`16 · libellés uniques (${lang}, ${w} px) : en-tête, onglets, titres, boutons`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 });
      const { erreurs } = await ouvrir(page, { mode: 'visiteur', lang, hash: '#accueil' });
      const interdits = /Connexion|Créer un compte|Créer mon compte|Inscription/;
      expect((await textes(page, '.top .right, .top .nav, nav.tabbar')).join(' | ')).not.toMatch(interdits);
      await expect(page.locator('.top .signup')).toHaveText(inscription);
      if (w < 880) await expect(page.locator('nav.tabbar .tab5 a.only-out span').first()).toHaveText(connexion);
      else await expect(page.locator('.top .login')).toHaveText(connexion);
      if (lang === 'fr') {
        await page.evaluate(() => { location.hash = '#connexion'; });
        await expect(page.locator('#view h1')).toHaveText('Se connecter');
        await expect(page.locator('[data-form="login"] button[type="submit"]')).toHaveText('Se connecter');
        await page.evaluate(() => { location.hash = '#inscription'; });
        await expect(page.locator('#view h1').first()).toHaveText('S’inscrire');
        await expect(page.locator('[data-form="signup"] button[type="submit"]')).toHaveText('S’inscrire');
        const tout = norm(await page.locator('#view').innerText()) + ' ' + (await textes(page, '.top .right, .top .nav, nav.tabbar')).join(' ');
        expect(tout).not.toMatch(interdits);
      }
      expect(erreurs).toEqual([]);
    });
  }
}

// Les libellés de l'en-tête sont lus hors de l'accueil : sur l'accueil d'un visiteur, la présentation porte son propre
// « S'inscrire » et l'en-tête ne le répète pas (seconde passe, lot 2 ; vérifié par le test 22b).
test('17 · langue par défaut : anglais', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { erreurs } = await ouvrirNu(page, {}, '#classement');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await textes(page, 'nav.nav a')).toEqual(['Markets', 'Flash', 'Wallet', 'Community', 'Profile']);
  expect(await textes(page, '.top .login, .top .signup')).toEqual(['Log in', 'Sign up']);
  const desc = await page.locator('meta[name="description"]').getAttribute('content');
  expect(desc).not.toMatch(/demo/i);
  expect(desc).toMatch(/prediction markets/i);
  expect(erreurs).toEqual([]);
});

test('17b · langue enregistrée « fr »', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { erreurs } = await ouvrirNu(page, { 'wimoro-lang': 'fr' }, '#classement');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(await textes(page, 'nav.nav a')).toEqual(['Marchés', 'Éclair', 'Portefeuille', 'Communauté', 'Profil']);
  expect(await textes(page, '.top .login, .top .signup')).toEqual(['Se connecter', 'S’inscrire']);
  expect(erreurs).toEqual([]);
});

test('17c · langue enregistrée « he » : RTL et libellés hébreu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { erreurs } = await ouvrirNu(page, { 'wimoro-lang': 'he' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  for (const t of await textes(page, 'nav.nav a, .top .login, .top .signup')) expect(t).toMatch(/[֐-׿]/);
  expect(erreurs).toEqual([]);
});

test('18 · fichier statique : ni « 248 », ni « Démo », ni « démo » dans l’en-tête et les métadonnées', async () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const tete = html.slice(0, html.indexOf('</header>'));
  expect(tete).not.toMatch(/248|Démo|démo/);
  expect(tete).not.toMatch(/\bdemo\b/i);
});

test('19 · sans JavaScript : message en trois langues et rien d’autre que le logo', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/index.html');
  const corps = norm(await page.locator('body').innerText());
  const phrases = ['Turn on JavaScript to use Wimoro.', 'Active JavaScript pour utiliser Wimoro.', 'יש להפעיל JavaScript כדי להשתמש ב-Wimoro.'];
  for (const p of phrases) expect(corps).toContain(p);
  expect(norm(await page.locator('.top').innerText())).toBe('wimoro');
  await expect(page.locator('.top .right')).toBeHidden();
  await expect(page.locator('nav.tabbar')).toBeHidden();
  await expect(page.locator('.top .sk')).toBeHidden();
  let reste = corps.replace('wimoro', '');
  for (const p of phrases) reste = reste.replace(p, '');
  expect(reste.trim()).toBe('');
  await ctx.close();
});

for (const w of [320, 390, 1280]) {
  test(`20 · solde de l’en-tête avec ses centimes à ${w} px (fr et en)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    const { erreurs } = await demo(page, { hash: '#accueil', lang: 'fr' });
    await expect(page.locator('.top .bal b[data-bal]')).toBeVisible();
    expect(norm(await page.locator('.top .bal b[data-bal]').innerText())).toBe('1 000 248,50 $');
    await page.evaluate(() => setLang('en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.top .bal b[data-bal]')).toBeVisible();
    expect(norm(await page.locator('.top .bal b[data-bal]').innerText())).toBe('$1,000,248.50');
    expect(erreurs).toEqual([]);
  });
}

test('21 · Communauté : page d’entrée, cinq lignes, chaque section en un geste avec sa sous-navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { erreurs } = await demo(page, { hash: '#accueil', lang: 'fr' });
  await page.locator('nav.tabbar a[href="#communaute"]').click();
  await expect(page).toHaveURL(/#communaute/);
  const lignes = page.locator('.wrap.hub a.mrow');
  await expect(lignes).toHaveCount(5);
  const cibles = ['#chat', '#clans', '#amis', '#classement', '#copie'];
  for (let i = 0; i < 5; i++) {
    expect(await lignes.nth(i).getAttribute('href')).toBe(cibles[i]);
    expect((await lignes.nth(i).locator('b').first().innerText()).trim().length).toBeGreaterThan(0);
    expect((await lignes.nth(i).locator('small').first().innerText()).trim().length).toBeGreaterThan(0);
  }
  for (const h of cibles) {
    await page.evaluate(() => { location.hash = '#communaute'; });
    await expect(page.locator('.wrap.hub')).toBeVisible();
    await page.locator(`.wrap.hub a.mrow[href="${h}"]`).click();
    await expect(page).toHaveURL(new RegExp(h + '(\\b|$)'));
    const sub = page.locator('nav.subnav').filter({ has: page.locator('a[href="#chat"]') });
    await expect(sub.locator(`a.on[href="${h}"]`), h).toBeVisible();
    await expect(sub.locator('a.on')).toHaveCount(1);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { location.hash = '#accueil'; });
  await page.locator('nav.nav a[href="#communaute"]').click();
  await expect(page).toHaveURL(/#communaute/);
  await expect(page.locator('.wrap.hub')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('22 · barre d’onglets : affichée jusqu’à 879 px, masquée dès 880 px (nav de l’en-tête prend le relais)', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#accueil' });
  for (const [w, bas] of [[320, true], [879, true], [880, false], [1280, false]]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.evaluate(() => render(true));
    if (bas) { await expect(page.locator('nav.tabbar'), String(w)).toBeVisible(); await expect(page.locator('nav.nav')).toBeHidden(); }
    else { await expect(page.locator('nav.tabbar'), String(w)).toBeHidden(); await expect(page.locator('nav.nav')).toBeVisible(); }
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.tab5 a.only-in[href="#profil"]')).toBeVisible();
  await expect(page.locator('.tab5 a.only-out[href="#connexion"]')).toBeHidden();
  expect(erreurs).toEqual([]);
});

test('22b · visiteur sur téléphone : en-tête recherche + langue + thème + « S’inscrire », « Se connecter » en cinquième onglet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', lang: 'fr', hash: '#classement' });
  await expect(page.locator('.top .hs-btn')).toBeVisible();
  await expect(page.locator('.top .lgb')).toBeVisible();
  await expect(page.locator('.top .thm')).toBeVisible();
  await expect(page.locator('.top .signup')).toBeVisible();
  await expect(page.locator('.top .signup')).toHaveText('S’inscrire');
  await expect(page.locator('.top .login')).toBeHidden();
  for (const s of ['.top .bal', '.top .bell', '.top .me-av']) await expect(page.locator(s)).toBeHidden();
  await expect(page.locator('.tab5 a.only-out[href="#connexion"]')).toBeVisible();
  await expect(page.locator('.tab5 a.only-out[href="#connexion"] span').first()).toHaveText('Se connecter');
  await expect(page.locator('.tab5 a.only-in[href="#profil"]')).toBeHidden();
  await expect(page.locator('nav.tabbar a').locator('visible=true')).toHaveCount(5);
  // accueil d'un visiteur : un seul « S’inscrire » à l’écran, celui de la présentation (seconde passe, lot 2)
  await page.evaluate(() => { location.hash = '#accueil'; });
  await expect(page.locator('.intro a[href="#inscription"]')).toBeVisible();
  await expect(page.locator('.top .signup')).toBeHidden();
  expect(erreurs).toEqual([]);
});

test('23 · ticket de la feuille : les deux boutons Oui / Non sont pleinement opaques', async ({ page }) => {
  const { erreurs } = await demo(page, { hash: '#accueil' });
  await page.locator('.row [data-a="bet"]').first().click();
  const sides = page.locator('[data-ticket="sheet"] .sides .sd');
  await expect(sides).toHaveCount(2);
  await expect.poll(() => sides.evaluateAll(els => els.map(e => getComputedStyle(e).opacity))).toEqual(['1', '1']);
  expect(erreurs).toEqual([]);
});
