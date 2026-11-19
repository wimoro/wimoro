// Parrainage en mode Compte : le code, le lien, le parrain et les filleuls viennent du serveur ; rien n'est simulé à l'écran.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, UID } from '../helpers/app.mjs';

const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const H = 3600e3;
const REF = { code: 'LEAB-7K3', bonus: 10, by: 'MAXB-A1B', list: [{ n: 'noa', at: Date.now() - H, st: 'pending', paid: 0, doneAt: null }, { n: 'max', at: Date.now() - 5 * H, st: 'done', paid: 10, doneAt: Date.now() - 2 * H }] };

test('la page Parrainage montre le code, le lien et les filleuls du serveur ; copier marche et rien n’est inventé à l’écran', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#parrainage', faux: { etat: { me: { balance: 100 }, ref: REF } } });
  await expect(page.locator('.refcode')).toHaveText('LEAB-7K3');
  await expect(page.locator('.reflink')).toContainText('?r=LEAB-7K3');
  const kpis = await page.locator('.cp-kpis b').allTextContents();
  expect(kpis.map(x => x.replace(/\s/g, ''))).toEqual(['2', '1', '$10.00']);                     // un gain s'écrit au centime (règle 17 du système de design)
  await expect(page.locator('#view')).toContainText('noa');
  await expect(page.locator('#view')).toContainText('max');
  await expect(page.locator('#view')).toContainText('You were referred with the code MAXB-A1B');
  expect(await lire(page, () => ({ code: refCode(), lien: refLink().endsWith('/?r=LEAB-7K3'), n: refsAll().length, gagne: refEarned() }))).toEqual({ code: 'LEAB-7K3', lien: true, n: 2, gagne: 10 });

  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.resolve(); });
  await page.locator('[data-a="ref-copy"]').last().click();                                       // « Copier le code »
  await expect(toast(page, 'Copied')).toBeVisible();
  await expect(toast(page, 'Coming soon for accounts')).toHaveCount(0);
  await expect.poll(() => lire(page, () => __fakeSB.journal().filter(c => c.name === 'api_prefs_save').map(c => c.args.p_prefs && c.args.p_prefs.refShared).pop())).toBe(true);
  // le simulateur de faux filleuls du mode Démo ne tourne pas : la liste reste celle du serveur
  expect(await lire(page, () => PLAN.filter(p => /parrainage/.test(p.nom)).map(p => p.quand))).toEqual(['local']);
  expect(await lire(page, () => refsAll().map(r => r.n))).toEqual(['noa', 'max']);
  expect(erreurs).toEqual([]);
});

test('le premier pari d’un filleul arrive par la notification du serveur : solde et liste à jour, sans recharger', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#parrainage', faux: { etat: { me: { balance: 100 }, ref: { ...REF, list: [REF.list[0]] } } } });
  await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, st: refsAll()[0].st }))).toEqual({ solde: 100, st: 'pending' });
  await page.evaluate(uid => {                                                                    // le serveur a vu le premier pari de noa
    const e = __fakeSB.etat(); e.me.balance += 10; e.ref.list[0] = Object.assign({}, e.ref.list[0], { st: 'done', paid: 10, doneAt: Date.now() });
    const n = { id: 'n-ref-1', ic: 'gift', code: 'parrain_paye', p: { n: 'noa', gain: 10 }, href: '#parrainage', at: Date.now(), read: false };
    e.notifs.unshift(n); __fakeSB.persist(); __fakeSB.emit('joueur:' + uid, 'notif', { n });
  }, UID);
  await expect.poll(() => lire(page, () => refsAll()[0].st)).toBe('done');
  expect(await lire(page, () => ({ solde: S.me.balance, gagne: refEarned(), notif: S.me.notifs[0].text }))).toEqual({ solde: 110, gagne: 10, notif: 'Referral: noa placed their first bet, $10 for you.' });
  expect(erreurs).toEqual([]);
});

test('inscription avec un lien d’invitation : le code part au serveur, qui crédite le bonus ; le code local est oublié', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#inscription', requete: '?r=leab-7k3', faux: { codes: ['LEAB-7K3'] } });
  const f = page.locator('form[data-form="signup"]');
  await expect(f.locator('[name=ref]')).toHaveValue('LEAB-7K3');
  await expect(f).toContainText('Code detected');
  expect(await page.evaluate(() => location.search)).toBe('');                                    // l'adresse est nettoyée
  await f.locator('[name=pseudo]').fill('filleul.un');
  await f.locator('[name=email]').fill('filleul@test.dev');
  await f.locator('[name=pw]').fill('motdepasse1');
  await f.locator('[name=age]').check(); await f.locator('[name=cgu]').check();
  await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#bienvenue/);
  await pret(page);
  expect((await lire(page, () => __fakeSB.journal().find(c => c.name === 'signUp').args)).options.data).toMatchObject({ username: 'filleul.un', ref: 'LEAB-7K3' });
  expect(await lire(page, () => ({ solde: S.me.balance, par: S.me.refBy, dep: S.me.deps.map(d => depLabel(d.label)), notif: S.me.notifs[0].text, local: localStorage.getItem('wimoro-ref') })))
    .toEqual({ solde: 10, par: 'LEAB-7K3', dep: ['Referral bonus'], notif: 'Referral bonus: $10 free thanks to code LEAB-7K3.', local: null });
  expect(erreurs).toEqual([]);
});
