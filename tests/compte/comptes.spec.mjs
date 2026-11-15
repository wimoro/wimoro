// Comptes : inscription, connexion par e-mail ou pseudo, déconnexion, mot de passe oublié, passage d'un mode à l'autre.
// Couvre B07 (mélange d'états), B08 (inscription), B09 (mot de passe oublié), B10 (connexion par pseudo), recette 8.
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

const COMPTES = { 'alice@test.dev': { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', password: 'motdepasse1', pseudo: 'alice' } };
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const appels = (page, kind) => lire(page, k => __fakeSB.calls.filter(c => c.kind === k).map(c => c.name), kind);

test('B08 · inscription : compte créé sur le serveur avec le pseudo choisi, puis onboarding réel', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#inscription', faux: { comptes: COMPTES } });
  expect(await lire(page, () => typeof window.supabase), 'un visiteur ne charge même pas la bibliothèque du serveur').toBe('undefined');
  const f = page.locator('form[data-form="signup"]');
  await f.locator('[name=pseudo]').fill('nouveau.joueur');
  await f.locator('[name=email]').fill('nouveau@test.dev');
  await f.locator('[name=pw]').fill('motdepasse1');
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check();
  await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#bienvenue/);
  await pret(page);
  const s = await lire(page, () => ({ srv: SRV(), n: S.me.n, solde: S.me.balance, onboarded: S.me.onboarded, deps: S.me.deps.length, local: localStorage.getItem('wimoro-accounts'), session: localStorage.getItem('wimoro-session') }));
  expect(s).toEqual({ srv: true, n: 'nouveau.joueur', solde: 0, onboarded: false, deps: 0, local: null, session: null });   // ni compte local fantôme, ni faux « Crédit démo »
  const inscription = await lire(page, () => __fakeSB.journal().find(c => c.name === 'signUp').args);
  expect(inscription.options.data).toMatchObject({ username: 'nouveau.joueur', lang: 'en' });
  expect(inscription.options.emailRedirectTo).toContain('127.0.0.1');

  // onboarding : couleur → centres d'intérêt → sans KYC → rangs → 100 XP de bienvenue (donnés par le serveur) → fin
  const suivant = page.locator('[data-a="ob-next"]');
  await page.locator('[data-a="ob-color"]').nth(1).click();
  await suivant.click();
  await page.locator('[data-a="ob-int"]').first().click();
  await suivant.click();
  await page.locator('[data-a="ob-kpick"][data-v="crypto"]').click();
  await suivant.click(); await suivant.click(); await suivant.click();
  await expect.poll(() => lire(page, () => S.me.xp)).toBe(100);
  await expect(page.locator('.rankup')).toBeVisible();                                // 100 XP : passage Fer II, annoncé une fois
  await page.keyboard.press('Escape');
  await expect(page.locator('.rankup')).toHaveCount(0);
  await page.locator('[data-a="ob-next"]').click({ timeout: 4000 });
  await expect(page).toHaveURL(/#accueil/);
  await page.waitForTimeout(900);                                            // envoi différé des réglages
  const serveur = await lire(page, () => __fakeSB.etat().me);
  expect(serveur).toMatchObject({ xp: 100, obBonus: true, onboarded: true, color: '#F59A0B' });
  expect(serveur.interests.length).toBe(1);
  // après rechargement : même état, pas de retour à l'onboarding
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ xp: S.me.xp, onboarded: S.me.onboarded, color: S.me.color, route: location.hash }))).toEqual({ xp: 100, onboarded: true, color: '#F59A0B', route: '#accueil' });
  expect(erreurs).toEqual([]);
});

test('B08 · pseudo déjà pris, e-mail déjà inscrit : message clair, aucun compte local', async ({ page }) => {
  await ouvrir(page, { mode: 'visiteur', hash: '#inscription', faux: { comptes: COMPTES, session: null, etat: {} } });
  const f = page.locator('form[data-form="signup"]'), err = f.locator('[data-signerr]');
  const remplir = async (pseudo, email) => { await f.locator('[name=pseudo]').fill(pseudo); await f.locator('[name=email]').fill(email); await f.locator('[name=pw]').fill('motdepasse1'); await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check(); await f.locator('[type=submit]').click(); };
  await remplir('admin', 'x@test.dev');
  await expect(err).toHaveText('This username is already taken.');
  await remplir('libre.123', 'alice@test.dev');
  await expect(err).toHaveText('An account already exists with this email. Log in.');
  expect(await lire(page, () => ({ logged: S.me.logged, local: localStorage.getItem('wimoro-accounts') }))).toEqual({ logged: false, local: null });
});

test('B08 · confirmation d’e-mail active : écran « vérifie ta boîte mail », personne n’est connecté', async ({ page }) => {
  await ouvrir(page, { mode: 'visiteur', hash: '#inscription', lang: 'fr', faux: { autoconfirm: false } });
  const f = page.locator('form[data-form="signup"]');
  await f.locator('[name=pseudo]').fill('attente'); await f.locator('[name=email]').fill('attente@test.dev'); await f.locator('[name=pw]').fill('motdepasse1');
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check(); await f.locator('[type=submit]').click();
  await expect(page.locator('#view h1')).toHaveText('Vérifie ta boîte mail');
  await expect(page.locator('#view')).toContainText('attente@test.dev');
  expect(await lire(page, () => ({ logged: S.me.logged, srv: SRV() }))).toEqual({ logged: false, srv: false });
  await page.locator('[data-a="auth-resend"]').click();
  await expect.poll(() => appels(page, 'auth')).toContain('resend');
  await page.locator('[data-a="auth-wait-done"]').click();
  await expect(page.locator('#le')).toHaveValue('attente@test.dev');
});

test('B10 · connexion par e-mail puis par pseudo ; mauvais mot de passe refusé', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#connexion', faux: { comptes: COMPTES } });
  const f = page.locator('form[data-form="login"]'), err = f.locator('[data-autherr]');
  await expect(f.locator('label[for=le]')).toHaveText('Email or username');
  await f.locator('#le').fill('alice'); await f.locator('#lp').fill('mauvais-mdp'); await f.locator('[type=submit]').click();
  await expect(err).toHaveText('Incorrect username, email or password.');
  expect(await lire(page, () => S.me.logged)).toBe(false);
  await f.locator('#lp').fill('motdepasse1'); await f.locator('[type=submit]').click();        // par pseudo
  await expect(page).toHaveURL(/#accueil/); await pret(page);
  expect(await lire(page, () => ({ srv: SRV(), n: S.me.n, solde: S.me.balance }))).toEqual({ srv: true, n: 'alice', solde: 500 });
  expect(await appels(page, 'fn')).toEqual([]);                                                 // après rechargement : session reprise, pas de nouvelle connexion
  expect(await lire(page, () => __fakeSB.journal().filter(c => c.kind === 'fn').map(c => c.name))).toEqual(['connexion', 'connexion']);   // 2 essais par pseudo, via le service de connexion
  await expect(page.locator('.toast').first()).toContainText('alice');
  // déconnexion → visiteur propre → reconnexion par e-mail
  await page.evaluate(() => logout());
  await expect(page).toHaveURL(/#connexion/); await pret(page);
  expect(await lire(page, () => ({ srv: SRV(), logged: S.me.logged, session: localStorage.getItem('wimoro-auth'), solde: S.me.balance }))).toEqual({ srv: false, logged: false, session: null, solde: 1e6 });
  await page.locator('#le').fill('Alice@Test.dev'); await page.locator('#lp').fill('motdepasse1'); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/); await pret(page);
  expect(await lire(page, () => ({ srv: SRV(), n: S.me.n }))).toEqual({ srv: true, n: 'alice' });
  expect(erreurs).toEqual([]);
});

test('B09 · mot de passe oublié : code à 6 chiffres, nouveau mot de passe, connecté', async ({ page }) => {
  await ouvrir(page, { mode: 'visiteur', hash: '#connexion', lang: 'fr', faux: { comptes: COMPTES, otp: '482913' } });
  await page.locator('[data-a="forgot"]').click();
  let f = page.locator('form[data-form="forgot"]');
  await f.locator('[name=email]').fill('alice@test.dev'); await f.locator('[type=submit]').click();
  f = page.locator('form[data-form="forgot"][data-step="2"]');
  await expect(f).toBeVisible();
  await expect(page.locator('.md .demo-b')).toHaveCount(0);                                     // plus de « tape 6 chiffres au hasard »
  await f.locator('[name=code]').fill('000000'); await f.locator('[name=pw]').fill('nouveau-mdp-9'); await f.locator('[type=submit]').click();
  await expect(f.locator('[data-ferr]')).toHaveText('Code incorrect ou expiré.');
  await f.locator('[name=code]').fill('482913'); await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#accueil/); await pret(page);
  expect(await lire(page, () => ({ srv: SRV(), n: S.me.n, mdp: __fakeSB.db.comptes['alice@test.dev'].password }))).toEqual({ srv: true, n: 'alice', mdp: 'nouveau-mdp-9' });
  expect(await lire(page, () => __fakeSB.calls.filter(c => c.kind === 'auth').map(c => c.name))).toEqual(expect.arrayContaining(['getSession']));
  // la nouvelle connexion marche avec le nouveau mot de passe, plus avec l'ancien
  await page.evaluate(() => logout()); await expect(page).toHaveURL(/#connexion/); await pret(page);
  await page.locator('#le').fill('alice@test.dev'); await page.locator('#lp').fill('motdepasse1'); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page.locator('[data-autherr]')).toHaveText('Identifiant ou mot de passe incorrect.');
  await page.locator('#lp').fill('nouveau-mdp-9'); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/);
});

test('B09 · arrivée par le lien de l’e-mail : la fenêtre « nouveau mot de passe » s’ouvre', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', lang: 'fr', faux: { comptes: { 'real@test.dev': { id: '11111111-1111-4111-8111-111111111111', password: 'ancien-mdp-1', pseudo: 'realuser' } } } });
  await page.evaluate(() => API.emit('recuperation', {}));
  const f = page.locator('form[data-form="recup"]');
  await expect(f).toBeVisible();
  await f.locator('[name=pw]').fill('court'); await f.locator('[type=submit]').click();
  await expect(f.locator('[data-ferr]')).toHaveText('8 caractères minimum.');
  await f.locator('[name=pw]').fill('tout-nouveau-9'); await f.locator('[type=submit]').click();
  await expect(page.locator('.toast').first()).toContainText('Mot de passe mis à jour');          // après le rechargement
  expect(await lire(page, () => __fakeSB.db.comptes['real@test.dev'].password)).toBe('tout-nouveau-9');
});

test('B07 · recette 8 · Démo → Compte → Démo : aucun mélange d’états', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', faux: { comptes: COMPTES } });
  const demo0 = await lire(page, () => ({ n: S.me.n, pos: S.me.positions.map(p => p.m), solde: S.me.balance, suivis: S.me.following }));
  expect(demo0.n).toBe('User26'); expect(demo0.pos).toHaveLength(5);
  // Démo → Compte
  await page.evaluate(() => logout()); await expect(page).toHaveURL(/#connexion/);
  await page.locator('#le').fill('alice@test.dev'); await page.locator('#lp').fill('motdepasse1'); await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page).toHaveURL(/#accueil/); await pret(page);
  const compte = await lire(page, () => ({ srv: SRV(), n: S.me.n, pos: S.me.positions.length, hist: S.me.history.length, suivis: S.me.following, amis: S.me.friends, solde: S.me.balance, demo: S.auth.demo, sessionLocale: localStorage.getItem('wimoro-session') }));
  expect(compte).toEqual({ srv: true, n: 'alice', pos: 0, hist: 0, suivis: [], amis: [], solde: 500, demo: false, sessionLocale: null });   // rien hérité de User26
  await page.evaluate(() => { S.me.tmode = 'all'; save(); }); await page.waitForTimeout(900);
  const envoye = await lire(page, () => __fakeSB.etat());
  expect(envoye.prefs).toEqual({ v: 1, fmode: 'free', falerts: [], ctype: 'courbe', tmode: 'all', watch: [], prefs: {}, blockedShown: '' });  // seulement des réglages : ni positions, ni solde
  expect(envoye.positions).toEqual([]);
  // Compte → Démo
  await page.evaluate(() => logout()); await expect(page).toHaveURL(/#connexion/); await pret(page);
  await page.locator('[data-a="demo-login"]').click(); await expect(page).toHaveURL(/#accueil/);
  const demo1 = await lire(page, () => ({ srv: SRV(), n: S.me.n, pos: S.me.positions.map(p => p.m), solde: S.me.balance, suivis: S.me.following, tmode: S.me.tmode || null }));
  expect(demo1).toEqual({ srv: false, ...demo0, tmode: null });               // le compte démo retrouve ses données d'origine
  expect(erreurs).toEqual([]);
});

test('B07 · une session serveur l’emporte sur une session locale : jamais deux comptes à la fois', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', local: { 'wimoro-session': '__demo__' } });
  const s = await lire(page, () => ({ srv: SRV(), n: S.me.n, pos: S.me.positions.length, demo: S.auth.demo, sessionLocale: localStorage.getItem('wimoro-session'), cache: localStorage.getItem('wimoro-srv') }));
  expect(s).toEqual({ srv: true, n: 'realuser', pos: 0, demo: false, sessionLocale: null, cache: null });
});

test('serveur injoignable au démarrage : écran clair, rien n’est mélangé, on peut réessayer ou passer en démo', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', lang: 'fr', faux: { horsLigne: true } });
  await expect(page.locator('#view')).toContainText('Connexion au serveur impossible');
  expect(await lire(page, () => ({ logged: S.me.logged, pos: S.me.positions.length }))).toEqual({ logged: false, pos: 0 });
  await page.locator('[data-a="srv-demo"]').click();
  await pret(page);
  await expect.poll(() => lire(page, () => typeof S !== 'undefined' && S.me.n)).toBe('User26');
  expect(await lire(page, () => SRV())).toBe(false);
});
