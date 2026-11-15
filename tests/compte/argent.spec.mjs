// Argent fictif et jeu responsable en mode Compte : dépôt, retrait et KYC sont écrits par le serveur, les écrans et
// les animations d'origine sont conservés, et rien ne s'annule (ni au bout de 20 secondes, ni au rechargement).
// Couvre B13, B14 et la recette 3 (dépôt), 6 (retrait, dépôt par carte), 7 (KYC), 10 (plafond, pause, auto-exclusion).
import { test, expect } from '@playwright/test';
import { ouvrir, lire, aller, UID, debutManche } from '../helpers/app.mjs';

const H = debutManche() + 2000;
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const texte = (page, cle, params) => lire(page, ([cle, params]) => _t(cle, params), [cle, params || []]);
const deposerCrypto = async (page, montant) => {
  await page.locator('[data-a="sim-dep"]').first().click();
  await page.locator('form[data-form="simdep"] [name=amt]').fill(String(montant));
  await page.locator('form[data-form="simdep"] [type=submit]').click();
};

test('B13 · dépôt fictif : les confirmations défilent, le serveur crédite à la fin, et tout survit au rechargement', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#depot', horloge: H, faux: { etat: { me: { balance: 0 } } } });
  await deposerCrypto(page, 50);
  await expect(toast(page, await texte(page, 'Dépôt détecté'))).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, deps: S.me.deps.map(d => [d.usd, d.conf < d.need]) }))).toEqual({ solde: 0, deps: [[50, true]] });
  await page.clock.runFor(4000);
  const mi = await lire(page, () => ({ conf: S.me.deps[0].conf, need: S.me.deps[0].need, solde: S.me.balance }));
  expect(mi.need).toBe(12); expect(mi.conf).toBeGreaterThan(2); expect(mi.conf).toBeLessThan(12); expect(mi.solde).toBe(0);   // en cours : pas encore crédité
  await expect(page.locator('[data-deps] .st-wait').first()).toBeVisible();
  await page.clock.runFor(5000);
  await expect(toast(page, 'Deposit credited')).toBeVisible();
  const fin = await lire(page, () => ({ solde: S.me.balance, depots: S.me.deposits, xp: S.me.xp, credite: S.me.deps[0].conf >= S.me.deps[0].need, notifs: S.me.notifs.map(n => n.text), badges: S.me.badges, mission: S.me.missions.find(m => m.id === 'dep1').have }));
  expect(fin).toMatchObject({ solde: 50, depots: 1, xp: 100, credite: true, mission: 1 });              // 100 XP au premier dépôt du jour
  expect(fin.notifs.join(' | ').replace(/\s/g, ' ')).toMatch(/Deposit credited: \$50(\.00)? \(50(\.00)? USDC on Base\)/);   // espaces insécables normalisés
  expect(fin.badges).toContain('dep');
  await expect(page.locator('[data-deps] .st-ok').first()).toBeVisible();
  expect(await appels(page, 'api_demo_deposit')).toHaveLength(1);
  expect((await appels(page, 'api_demo_deposit'))[0].p).toMatchObject({ method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 });
  // 20 secondes plus tard puis rechargement : rien ne s'annule
  await page.clock.runFor(20000);
  expect(await lire(page, () => S.me.balance)).toBe(50);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, deps: S.me.deps.length, credite: S.me.deps[0].conf >= S.me.deps[0].need }))).toEqual({ solde: 50, xp: 100, deps: 1, credite: true });
  expect(erreurs).toEqual([]);
});

test('onglet rechargé pendant les confirmations : le dépôt n’est ni perdu ni crédité deux fois', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#depot', horloge: H });
  await deposerCrypto(page, 80);
  await expect(toast(page, await texte(page, 'Dépôt détecté'))).toBeVisible();
  await page.clock.runFor(2000);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, enAttente: S.me.deps[0].conf < S.me.deps[0].need, usd: S.me.deps[0].usd }))).toEqual({ solde: 500, enAttente: true, usd: 80 });
  await page.clock.runFor(8000);
  await expect.poll(() => lire(page, () => S.me.balance)).toBe(580);
  await page.clock.runFor(8000);
  expect(await lire(page, () => ({ solde: S.me.balance, deps: S.me.deps.length }))).toEqual({ solde: 580, deps: 1 });
  expect(await appels(page, 'api_demo_deposit')).toHaveLength(1);
});

test('recette 7 · KYC fictif : validé par le serveur, toujours validé après rechargement ; la carte se débloque et son dépôt est crédité, frais déduits', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#depot', horloge: H, faux: { etat: { me: { balance: 0, kyc: false } } } });
  await expect(page.locator('.pm.locked').first()).toBeVisible();                              // carte, virement, PayPal verrouillés
  await page.locator('.kycbar [data-a="kyc"]').click();
  const f = page.locator('form[data-form="kyc"]');
  await f.locator('[name=fn]').fill('Ana'); await f.locator('[name=ln]').fill('Test'); await f.locator('[name=bd]').fill('1990-05-01');
  await f.locator('[data-a="kycdoc"]').click();
  await f.locator('[data-ksub]').click();
  await page.clock.runFor(1700);
  await expect(toast(page, await texte(page, 'KYC validé'))).toBeVisible();
  expect(await lire(page, () => ({ kyc: S.me.kyc, notif: S.me.notifs[0].text }))).toEqual({ kyc: true, notif: await texte(page, 'Identité vérifiée : carte, virement et PayPal sont débloqués.') });
  const envoi = (await appels(page, 'api_demo_kyc'))[0].p;
  expect(envoi).toMatchObject({ fn: 'Ana', ln: 'Test', bd: '1990-05-01', doc: true });
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.kyc)).toBe(true);
  await expect(page.locator('.kycok').first()).toBeVisible();
  await expect(page.locator('.pm.locked')).toHaveCount(0);
  // dépôt par carte : 2,5 % de frais
  await page.locator('[data-a="dmethod"][data-v="card"]').click();
  await page.locator('[data-fiat="dep"]').fill('100');
  await page.locator('[data-a="fiat-dep"]').click();
  await expect(toast(page, await texte(page, 'Paiement en cours'))).toBeVisible();
  await page.clock.runFor(3000);
  await expect(toast(page, 'Deposit credited')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, d: { methode: S.me.deps[0].method, usd: S.me.deps[0].usd, frais: S.me.deps[0].fee } }))).toEqual({ solde: 97.5, d: { methode: 'card', usd: 97.5, frais: 2.5 } });
  await page.clock.runFor(20000);                                                               // recette 6 : rien ne s'annule après 20 secondes
  expect(await lire(page, () => S.me.balance)).toBe(97.5);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, methode: S.me.deps[0].method }))).toEqual({ solde: 97.5, methode: 'card' });
  expect(erreurs).toEqual([]);
});

test('recette 6 · retrait fictif : débité tout de suite par le serveur, « envoyé » ensuite, jamais annulé', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#retrait', horloge: H, faux: { etat: { me: { balance: 200 } } } });
  await page.locator('[data-a="wd-test"]').click();
  await page.locator('[data-wd="amt"]').fill('50');
  await page.locator('[data-a="withdraw"]').click();
  await expect(toast(page, await texte(page, 'Retrait en cours'))).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, etat: S.me.wds[0].st, champ: S.ui.wd.amt }))).toEqual({ solde: 150, etat: 'pending', champ: '' });
  await page.clock.runFor(5200);
  await expect(toast(page, await texte(page, 'Retrait envoyé'))).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, etat: S.me.wds[0].st, notif: S.me.notifs[0].text }))).toMatchObject({ solde: 150, etat: 'sent' });
  expect(await lire(page, () => S.me.notifs[0].text)).toMatch(/Withdrawal sent: 49\.95 USDC on Base/);
  await page.clock.runFor(20000);
  expect(await lire(page, () => S.me.balance)).toBe(150);
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, wds: S.me.wds.map(x => [x.amt, x.st]) }))).toEqual({ solde: 150, wds: [[50, 'sent']] });
  expect(await appels(page, 'api_demo_withdraw')).toHaveLength(1);
  expect(erreurs).toEqual([]);
});

test('recette 10 · plafond de dépôt : fixé sur le serveur, il bloque à l’écran et côté serveur', async ({ page }) => {
  // réglage « toutes les notifications » : par défaut, les bandeaux à icône « bouclier » ne s'affichent pas (comme en mode Démo)
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#responsable', horloge: H, faux: { etat: { prefs: { tmode: 'all' } } } });
  const f = page.locator('form[data-form="rglim"][data-k="day"]');
  await f.locator('[name=v]').fill('100'); await f.locator('[type=submit]').click();
  await expect.poll(() => lire(page, () => S.me.rg.lim.day)).toBe(100);
  expect((await appels(page, 'api_rg_limit'))[0]).toEqual({ p_k: 'day', p_v: 100 });
  await aller(page, 'depot');
  await deposerCrypto(page, 150);                                                               // au-dessus du plafond
  await expect(toast(page, await texte(page, 'Limite de dépôt atteinte'))).toBeVisible();
  expect(await appels(page, 'api_demo_deposit')).toHaveLength(0);
  // même en contournant l'écran, le serveur refuse
  const refus = await page.evaluate(async () => { try { await API.call('api_demo_deposit', { p: { method: 'crypto', coin: 'USDC', net: 'Base', amt: 150 }, p_key: crypto.randomUUID() }); return 'accepté'; } catch (e) { return e.code; } });
  expect(refus).toBe('limite_depot');
  // une hausse n'est pas immédiate : 48 heures de réflexion
  await aller(page, 'responsable');
  await f.locator('[name=v]').fill('500'); await f.locator('[type=submit]').click();
  await expect.poll(() => lire(page, () => (S.me.rg.pend.day || {}).v)).toBe(500);
  expect(await lire(page, () => S.me.rg.lim.day)).toBe(100);
  await expect(page.locator('.rg-pend')).toBeVisible();
  await page.locator('[data-a="rg-pend-cancel"]').click();
  await expect.poll(() => lire(page, () => Object.keys(S.me.rg.pend).length)).toBe(0);
  await page.reload(); await pret(page);
  expect(await lire(page, () => S.me.rg.lim)).toEqual({ day: 100, week: 0, month: 0 });      // le plafond vient du serveur
  expect(erreurs).toEqual([]);
});

test('recette 10 · pause : paris et dépôts bloqués à l’écran et côté serveur, retrait possible, toujours là après rechargement', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#responsable', horloge: H, faux: { etat: { prefs: { tmode: 'all' } }, marches: [{ market_id: 'btc150k', current_probability: 60, volume_total: 5e6, liquidity_depth: 30000 }] } });
  await page.locator('[data-a="rg-pause"][data-h="24"]').click();
  await page.locator('[data-a="rg-pause-do"]').click();
  await expect(page.locator('#rgbar')).toBeVisible();
  expect(await lire(page, () => S.me.rg.pause - Date.now())).toBeGreaterThan(23.9 * 3600e3);
  await page.reload(); await pret(page);
  await expect(page.locator('#rgbar')).toBeVisible();                                           // la pause vient du serveur
  await aller(page, 'marche-btc150k');
  await page.locator('[data-ticket="page"] [data-a="buy"]').click();
  await expect(toast(page, await texte(page, 'Tu es en pause'))).toBeVisible();
  expect(await appels(page, 'api_buy')).toHaveLength(0);
  const refus = await page.evaluate(async () => {
    const essai = async (nom, args) => { try { await API.call(nom, args); return 'accepté'; } catch (e) { return e.code; } };
    return [await essai('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 10, p_key: crypto.randomUUID(), p_opts: {} }),
      await essai('api_demo_deposit', { p: { method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 }, p_key: crypto.randomUUID() }),
      await essai('api_demo_withdraw', { p: { method: 'crypto', net: 'Base', addr: '0x' + 'ab'.repeat(20), amt: 20 }, p_key: crypto.randomUUID() })];
  });
  expect(refus).toEqual(['pause', 'pause', 'accepté']);
  expect(erreurs).toEqual([]);
});

test('auto-exclusion : déconnexion immédiate, et le serveur refuse ensuite la connexion', async ({ page }) => {
  const comptes = { 'real@test.dev': { id: UID, password: 'Secret-123', pseudo: 'realuser' } };
  await ouvrir(page, { mode: 'compte', hash: '#responsable', faux: { comptes } });
  await page.locator('[data-a="rg-excl"][data-m="6"]').click();
  await page.locator('[data-rgx]').fill('exclusion');
  await page.locator('[data-a="rg-excl-do"]').click();
  await expect(page).toHaveURL(/#connexion/); await pret(page);
  await expect(page.locator('.limit.over').first()).toContainText('Self-exclusion');
  expect(await lire(page, () => ({ srv: SRV(), connecte: S.me.logged, jeton: localStorage.getItem('wimoro-auth') }))).toEqual({ srv: false, connecte: false, jeton: null });
  // nouvelle tentative de connexion : l'authentification passe, mais le serveur refuse le compte
  await page.locator('#le').fill('real@test.dev'); await page.locator('#lp').fill('Secret-123');
  await page.locator('form[data-form="login"] [type=submit]').click();
  await expect(page.locator('.limit.over').first()).toContainText('self-excluded', { timeout: 15000 });
  await expect(page).toHaveURL(/#connexion/);
  expect(await lire(page, () => ({ srv: SRV(), connecte: S.me.logged }))).toEqual({ srv: false, connecte: false });
});

test('mode Démo : dépôt, KYC et retrait restent locaux, avec les mêmes écrans (aucun appel au serveur)', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#depot', horloge: H });
  await page.clock.runFor(1500); await page.keyboard.press('Escape');                          // fenêtre de bienvenue de la démo
  await expect(page.locator('#ov .md')).toHaveCount(0);
  const s0 = await lire(page, () => ({ solde: S.me.balance, depots: S.me.deposits, kyc: S.me.kyc }));
  await deposerCrypto(page, 50);
  await expect(toast(page, await texte(page, 'Dépôt détecté'))).toBeVisible();
  await page.clock.runFor(9000);
  await expect(toast(page, 'Deposit credited')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, depots: S.me.deposits }))).toEqual({ solde: s0.solde + 50, depots: s0.depots + 1 });
  if (!s0.kyc) {
    await page.locator('.kycbar [data-a="kyc"]').click();
    const f = page.locator('form[data-form="kyc"]');
    await f.locator('[name=fn]').fill('Ana'); await f.locator('[name=ln]').fill('Test'); await f.locator('[name=bd]').fill('1990-05-01');
    await f.locator('[data-a="kycdoc"]').click(); await f.locator('[data-ksub]').click();
    await page.clock.runFor(1700);
    expect(await lire(page, () => S.me.kyc)).toBe(true);
  }
  await aller(page, 'retrait');
  await page.locator('[data-a="wmethod"][data-v="crypto"]').click().catch(() => {});
  await page.locator('[data-a="wd-test"]').click();
  await page.locator('[data-wd="amt"]').fill('40');
  await page.locator('[data-a="withdraw"]').click();
  expect(await lire(page, () => ({ solde: S.me.balance, etat: S.me.wds[0].st }))).toEqual({ solde: s0.solde + 10, etat: 'pending' });
  await page.clock.runFor(5000);
  expect(await lire(page, () => S.me.wds[0].st)).toBe('sent');
  expect(await lire(page, () => typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'rpc').length), 'aucun appel au serveur en mode Démo').toBe(0);
  expect(erreurs).toEqual([]);
});
