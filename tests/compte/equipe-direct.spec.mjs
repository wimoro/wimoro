// Partie E, côté joueur : ce que l'équipe change s'applique sans rechargement. Réglages publics (api_site au démarrage,
// puis l'événement « cfg » du sujet « site »), annonce, maintenance ; et sur le sujet privé du joueur : blocage, déblocage,
// déconnexion forcée. Chaque refus du serveur est dit à l'endroit bloqué, dans la langue du joueur. Faux serveur seulement.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, UID } from '../helpers/app.mjs';

const BTC = { market_id: 'btc150k', current_probability: 60, anchor_probability: 60, volume_total: 5e6, participants_count: 1200, liquidity_depth: 30000 };
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const frais = page => page.locator('[data-tcalc="page"] [data-c="fee"]');
const fmt = v => '$' + v.toFixed(2);

test('frais : l’aperçu du ticket suit les réglages du serveur, au démarrage puis en direct, sans rechargement', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } }, site: { v: { 'frais.k': 1 } } } });
  await page.locator('[data-tamt="page"]').fill('100');
  expect(await lire(page, () => wmRate('Crypto', false))).toBeCloseTo(0.07, 10);                // réglage lu au démarrage : 7 % × 1
  const f1 = await lire(page, () => quoteBuy(MK.btc150k, 'oui', 100, false).fee);
  await expect(frais(page)).toHaveText(fmt(f1));
  await lire(page, () => { window.__marque = 'même page'; });
  expect(await lire(page, () => __fakeSB.reglage('frais.k', 1.4))).toBe(1);                   // l'équipe change le multiplicateur : un message « cfg »
  await expect(toast(page, 'Fees have changed')).toBeVisible();
  const f2 = await lire(page, () => quoteBuy(MK.btc150k, 'oui', 100, false).fee);
  expect(f2).toBeGreaterThan(f1 * 1.3);
  await expect(frais(page)).toHaveText(fmt(f2));                                                // l'aperçu est recalculé, sans rechargement
  await lire(page, () => __fakeSB.reglage('frais.taux.crypto', 0.05));
  await expect(frais(page)).toHaveText(fmt(await lire(page, () => quoteBuy(MK.btc150k, 'oui', 100, false).fee)));
  expect(await lire(page, () => [wmRate('Crypto', false), wmRate('Crypto', true), eclairRate('Crypto', false)])).toEqual([0.05 * 1.4, 0.05 * 1.4 * 0.9, 0.07 * 0.7]);   // l'éclair garde le barème de son moteur
  expect(await lire(page, () => window.__marque)).toBe('même page');
  expect(erreurs).toEqual([]);
});

test('mise maximum du serveur : le ticket l’indique et n’envoie rien au-dessus', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', lang: 'fr', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } }, site: { v: { 'paris.mise_max': 50 } } } });
  await page.locator('[data-tamt="page"]').fill('100');
  await expect(page.locator('[data-tcalc="page"] [data-c="notes"]')).toContainText('Mise maximum : 50 $ par pari.');
  await expect(page.locator('[data-ticket="page"] [data-a="buy"]')).toBeDisabled();
  await page.locator('[data-tamt="page"]').fill('40');
  await expect(page.locator('[data-ticket="page"] [data-a="buy"]')).toBeEnabled();
  expect(erreurs).toEqual([]);
});

test('blocage posé par l’équipe : le message apparaît dans le ticket dès l’action suivante, et disparaît quand il est levé', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } } } });
  const fin = Date.now() + 3 * 3600e3;
  const id = await lire(page, f => __fakeSB.bloquer('paris', null, f, false), fin);              // l'écran ne le sait pas encore : aucun message reçu
  await page.locator('[data-tamt="page"]').fill('20');
  await page.locator('[data-ticket="page"] [data-a="buy"]').click();
  await expect(toast(page, 'Access blocked by the Wimoro team')).toBeVisible();
  const note = page.locator('[data-tcalc="page"] .bloc-note');
  await expect(note).toContainText('Bets are blocked on your account until');
  await expect(page.locator('[data-ticket="page"] [data-a="buy"]')).toBeDisabled();
  expect(await lire(page, () => S.me.positions.length)).toBe(0);
  await lire(page, i => __fakeSB.debloquer(i), id);                                              // l'équipe lève le blocage : « debloc »
  await expect(toast(page, 'Access restored')).toBeVisible();
  await expect(note).toHaveCount(0);
  await expect(page.locator('[data-ticket="page"] [data-a="buy"]')).toBeEnabled();
  expect(erreurs).toEqual([]);
});

test('blocage reçu en direct : le champ du salon et la page bloquée le disent aussitôt, en français et en hébreu', async ({ page, browser }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', lang: 'fr', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } } } });
  await expect(page.locator('form.cin[data-form="m:btc150k"]')).toBeVisible();
  await lire(page, () => __fakeSB.bloquer('chat', 'm:btc150k', -1));
  await expect(toast(page, 'Accès bloqué par l’équipe Wimoro')).toBeVisible();
  await expect(page.locator('.composer .bloc-note')).toContainText('Tu ne peux plus écrire dans ce salon.');
  await expect(page.locator('form.cin[data-form="m:btc150k"]')).toHaveCount(0);
  await lire(page, () => __fakeSB.bloquer('depots', null, Date.now() + 864e5));
  await page.evaluate(() => { location.hash = '#depot'; });
  await expect(page.locator('#view .wrap > .bloc-note')).toContainText('Les dépôts sont bloqués sur ton compte jusqu’au');

  const he = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const p2 = await he.newPage();
  const r2 = await ouvrir(p2, { mode: 'compte', lang: 'he', hash: '#retrait', faux: { blocages: [{ id: 9, acces: 'retraits', salon: null, fin: -1 }] } });
  await expect(p2.locator('#view .wrap > .bloc-note')).toHaveText('המשיכות בחשבון חסומות.');   // api_mes_blocages au démarrage
  expect(erreurs).toEqual([]); expect(r2.erreurs).toEqual([]);
});

test('chat : mot interdit, mode lent et salon fermé, dits sous le champ du salon', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { site: { mots: ['arnaque'] } } });
  const champ = page.locator('[data-in="general"]'), note = page.locator('[data-cnote="general"]');
  await champ.fill('c’est une arnaque'); await champ.press('Enter');
  await expect(note).toHaveText('Your message contains a word that isn’t allowed in the chat. Rephrase it.');
  await lire(page, () => __fakeSB.reglage('chat.salons', { general: { lent: 30, ferme: false } }));
  await expect(page.locator('.composer .cnote').first()).toContainText('Slow mode: one message every 30 seconds in this room.');
  await champ.fill('premier message'); await champ.press('Enter');
  await expect(champ).toHaveValue('');
  await champ.fill('deuxième message'); await champ.press('Enter');
  await expect(note).toContainText(/Slow mode in this room: wait \d+ more seconds before writing\./);
  await lire(page, () => __fakeSB.reglage('chat.salons', { general: { lent: 0, ferme: true } }));
  await expect(page.locator('.composer .bloc-note')).toHaveText('This room is closed for now.');
  expect(await lire(page, () => __fakeSB.journal().filter(c => c.name === 'api_chat_send').length)).toBe(3);
  expect(erreurs).toEqual([]);
});

test('déconnexion forcée : l’écran se ferme et explique pourquoi', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#accueil' });
  expect(await lire(page, () => SRV())).toBe(true);
  await lire(page, () => __fakeSB.deconnecter());
  await expect(page).toHaveURL(/#connexion/);
  await expect(page.locator('#view')).toContainText('The Wimoro team closed your session on all your devices. Log in again to continue.');
  await expect(toast(page, 'You have been logged out')).toBeVisible();
  expect(await lire(page, () => SRV())).toBe(false);
  expect(erreurs).toEqual([]);
});

test('annonce : bandeau au démarrage pour un visiteur, dans sa langue, fermable ; en direct pour un compte', async ({ page, browser }) => {
  const annonce = { id: 5, t: { fr: 'Les duels de stack ouvrent ce soir.', en: 'Stack duels open tonight.', he: 'דו־קרבות סטאק נפתחים הערב.' }, ton: 'alerte', fin: null };
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', lang: 'he', faux: { site: { annonce } } });
  const b = page.locator('#annonce');
  await expect(b).toHaveText('דו־קרבות סטאק נפתחים הערב.');
  await expect(b).toHaveClass(/alerte/);
  expect(await lire(page, () => typeof window.supabase)).toBe('undefined');                     // lecture REST : un visiteur ne charge pas la bibliothèque
  await b.locator('[data-a="annonce-x"]').click();
  await expect(b).toHaveCount(0);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  await page.waitForTimeout(400);
  await expect(page.locator('#annonce')).toHaveCount(0);                                         // fermée : elle ne revient pas, sauf nouvelle annonce

  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const p2 = await ctx.newPage();
  const r2 = await ouvrir(p2, { mode: 'compte' });
  await expect(p2.locator('#annonce')).toHaveCount(0);
  await lire(p2, () => __fakeSB.annonce({ t: { fr: 'Maintenance ce soir à 22 h.', en: 'Maintenance tonight at 10 pm.' }, ton: 'info' }));
  await expect(p2.locator('#annonce')).toHaveText('Maintenance tonight at 10 pm.');
  await lire(p2, () => __fakeSB.annonce(null));
  await expect(p2.locator('#annonce')).toHaveCount(0);
  expect(erreurs).toEqual([]); expect(r2.erreurs).toEqual([]);
});

test('maintenance : écran pour les joueurs, bandeau pour l’équipe ; la fin rend le site sans geste du joueur', async ({ page, browser }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#accueil' });
  await lire(page, () => __fakeSB.maintenance(true, { fr: 'Retour vers 22 h.', en: 'Back around 10 pm.' }));
  const m = page.locator('#maint');
  await expect(m).toContainText('Wimoro is under maintenance');
  await expect(m).toContainText('Back around 10 pm.');
  await m.locator('[data-a="maint-retry"]').click();
  await expect(toast(page, 'Still under maintenance')).toBeVisible();
  await lire(page, () => { window.__avant = 1; __fakeSB.maintenance(false); });
  await expect(page.locator('#maint')).toHaveCount(0);
  await expect.poll(() => lire(page, () => window.__avant)).toBeUndefined();                   // la page s'est rechargée d'elle-même
  await expect(page.locator('#view > *').first()).toBeAttached();

  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const eq = await ctx.newPage();
  const r2 = await ouvrir(eq, { mode: 'compte', faux: { equipeJoueur: 'moderateur', equipe: { role: 'moderateur' } } });
  await lire(eq, () => __fakeSB.maintenance(true, null));
  await expect(eq.locator('#maint-eq')).toHaveText('Maintenance in progress: only team members can play.');
  await expect(eq.locator('#maint')).toHaveCount(0);

  const ctx3 = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const vis = await ctx3.newPage();
  const r3 = await ouvrir(vis, { mode: 'visiteur', lang: 'fr', faux: { site: { maintenance: { actif: true, message: null } } } });
  await expect(vis.locator('#maint')).toContainText('Le site revient dans quelques minutes.');
  const ctx4 = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const j = await ctx4.newPage();
  const r4 = await ouvrir(j, { mode: 'compte', faux: { site: { maintenance: { actif: true, message: null } } } });   // déjà en maintenance : le serveur refuse le joueur dès son état
  await expect(j.locator('#maint')).toContainText('Wimoro is under maintenance');
  expect(erreurs).toEqual([]); expect(r2.erreurs).toEqual([]); expect(r3.erreurs).toEqual([]); expect(r4.erreurs).toEqual([]);
});

test('ajustement de l’équipe : il apparaît dans l’historique du joueur, et l’écran relit son état quand l’équipe le change', async ({ page }) => {
  const at = Date.now() - 3600e3;
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#portefeuille', faux: { etat: { notifs: [{ id: 'n9', ic: 'wallet', code: 'admin_solde', p: { delta: 25 }, href: '#profil', at, read: true }] } } });
  await page.locator('[data-a="ptab"][data-v="history"]').click();
  const ligne = page.locator('.act', { hasText: 'Admin adjustment' });
  await expect(ligne).toContainText('Adjustment by the Wimoro team');
  await expect(ligne).toContainText('+$25.00');
  await expect(ligne.locator('.sidechip')).toHaveCount(0);
  const n0 = await lire(page, () => __fakeSB.journal().filter(c => c.name === 'api_state').length);
  await lire(page, u => { __fakeSB.etat().me.balance = 742; __fakeSB.persist(); __fakeSB.emit('joueur:' + u, 'etat', {}); }, UID);
  await expect.poll(() => lire(page, () => S.me.balance)).toBe(742);
  expect(await lire(page, () => __fakeSB.journal().filter(c => c.name === 'api_state').length)).toBe(n0 + 1);
  expect(erreurs).toEqual([]);
});

test('visiteur et compte démo : les réglages se lisent sans bibliothèque, et une lecture impossible ne casse rien', async ({ page, browser }) => {
  const { erreurs, site } = await ouvrir(page, { mode: 'demo', hash: '#marche-btc150k' });
  expect(site.rev).toBe(1);
  expect(await lire(page, () => typeof window.supabase)).toBe('undefined');
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const p2 = await ctx.newPage();
  const r2 = await ouvrir(p2, { mode: 'visiteur', hash: '#marche-btc150k', faux: { siteKo: true } });   // serveur injoignable
  await expect(p2.locator('[data-tcalc="page"]')).toBeAttached();
  expect(await lire(p2, () => wmRate('Crypto', false))).toBeCloseTo(0.049, 10);                  // les valeurs d'avant restent
  expect(erreurs).toEqual([]); expect(r2.erreurs).toEqual([]);
});
