// Dans un vrai navigateur (Playwright), parcours de bout en bout de la refonte du design : navigation en 5 destinations,
// ticket de pari, Éclair, Portefeuille, dépôt, retrait, Communauté, langue, thème, déconnexion, et « trois gestes au plus ».
import { test, expect } from '@playwright/test';
import { ouvrir, lire, fermerRang, debutManche } from '../helpers/app.mjs';

const DESTINATIONS = [['accueil', '#accueil'], ['eclair', '#eclair'], ['portefeuille', '#portefeuille'], ['chat', '#chat'], ['profil', '#profil']];
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
  const liens = page.locator('nav.tabbar a[data-nav]');
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
  ['amis', [NAV('#chat'), SOUS('#amis')]],
  ['copie', [NAV('#chat'), SOUS('#copie')]],
  ['clans', [NAV('#chat'), SOUS('#clans')]],
  ['classement', [NAV('#chat'), SOUS('#classement')]],
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
