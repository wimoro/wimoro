// Clans en mode Compte : rejoindre, candidater, quitter, entrer par code, créer — tenus par le serveur.
// L'annuaire des clans de démonstration est celui de l'écran ; le serveur a le même (tests/fixtures/clans-demo.json).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ouvrir, lire } from '../helpers/app.mjs';

const ANNUAIRE = JSON.parse(fs.readFileSync('tests/fixtures/clans-demo.json', 'utf8'));
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const ARGENT = { xp: 900, settled: 12, wins: 7, deposits: 1, balance: 500 };                      // rang Argent, compte de 30 jours
const appels = (page, re) => lire(page, src => __fakeSB.journal().filter(c => c.kind === 'rpc' && new RegExp(src).test(c.name)).map(c => [c.name, c.args.p || c.args]), re.source);
const monClan = page => lire(page, () => S.me.clan && { id: S.me.clan.id, role: S.me.clan.role });
const aller = async (page, h) => { await page.evaluate(x => { location.hash = x; }, h); await expect(page.locator('#view > *').first()).toBeAttached(); };
const libre = page => page.evaluate(() => { __fakeSB.etat().clanParti = Date.now() - 8 * 864e5; __fakeSB.persist(); S.me.clanLeftAt = Date.now() - 8 * 864e5; });   // les 7 jours d'attente sont passés

test('l’annuaire de l’écran est celui que le serveur a reçu : mêmes clans, tags, accès, rangs, codes', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#clans', faux: { etat: { me: ARGENT } } });
  expect(await lire(page, () => CLANS.filter(c => /^c\d+$/.test(c.id)).map(c => ({ id: c.id, tag: c.tag, access: c.access, minRank: c.minRank, div: c.div, n: c.n, code: clanCode(c) })))).toEqual(ANNUAIRE);
});

test('rejoindre un clan ouvert puis le quitter : appartenance tenue par le serveur, tag à côté du pseudo, attente de 7 jours ; guerres annoncées indisponibles', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#clan-c1', faux: { etat: { me: ARGENT } } });
  expect(await monClan(page)).toBeNull();
  await page.locator('[data-a="cl-join"]').first().click();
  await expect(toast(page, 'Welcome to')).toBeVisible();
  expect(await monClan(page)).toEqual({ id: 'c1', role: 'membre' });
  expect(await appels(page, /^api_clan/)).toEqual([['api_clan_join', { p_clan: 'c1', p_code: null }]]);
  expect(await lire(page, () => tagH('me'))).toContain(ANNUAIRE[0].tag);                          // le tag suit le joueur
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  expect(await monClan(page)).toEqual({ id: 'c1', role: 'membre' });                              // tout vient du serveur
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'cl-war'; document.body.appendChild(b); b.click(); b.remove(); });
  await expect(toast(page, 'Coming soon for accounts')).toBeVisible();                            // guerres de clans : pas encore pour les comptes
  await page.locator('[data-a="cl-leave"]').first().click();
  await page.locator('[data-a="cl-leave-do"]').click();
  await expect(toast(page, 'You left')).toBeVisible();
  expect(await monClan(page)).toBeNull();
  expect(await lire(page, () => clanLeaveWait() > 6 * 864e5)).toBe(true);                         // 7 jours d'attente, donnés par le serveur
  await aller(page, '#clan-c4');
  const n = (await appels(page, /^api_clan/)).length;
  await page.evaluate(() => clanJoin(CK.c4));                                                     // refusé à l'écran, sans appel inutile
  expect((await appels(page, /^api_clan/)).length).toBe(n);
  expect(await monClan(page)).toBeNull();
  expect(erreurs).toEqual([]);
});

test('candidater : la réponse de l’officier vient du serveur (acceptée, puis refusée) ; entrer par code d’invitation', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#clan-c2', faux: { clanRefus: ['c5'], etat: { me: ARGENT, prefs: { v: 1, tmode: 'all' } } } });   // tmode « all » : comme en démo, ces bulles ne s'affichent que si le joueur veut toutes les notifications
  await page.locator('[data-a="cl-apply"]').first().click();
  await expect(toast(page, 'Application sent')).toBeVisible();
  expect(await lire(page, () => Object.keys(S.me.clanApps))).toEqual(['c2']);
  await page.evaluate(() => srvClanTick());                                                       // trop tôt : toujours en attente
  expect(await monClan(page)).toBeNull();
  await page.evaluate(() => { __fakeSB.etat().clanApps.c2 -= 10000; __fakeSB.persist(); return srvClanTick(); });
  await expect(toast(page, 'Welcome to')).toBeVisible();
  expect(await monClan(page)).toEqual({ id: 'c2', role: 'membre' });
  expect(await lire(page, () => S.me.notifs[0].text)).toBe(await lire(page, () => _t("Tu as rejoint le clan {0} [{1}].", [CK.c2.name, CK.c2.tag])));
  await page.evaluate(() => clanLeave()); await expect.poll(() => monClan(page)).toBeNull(); await libre(page);

  await aller(page, '#clan-c5');                                                                  // candidature refusée par l'officier
  await page.locator('[data-a="cl-apply"]').first().click();
  await expect.poll(() => lire(page, () => Object.keys(S.me.clanApps))).toEqual(['c5']);
  await page.evaluate(() => { __fakeSB.etat().clanApps.c5 -= 10000; __fakeSB.persist(); return srvClanTick(); });
  await expect(toast(page, 'Application declined')).toBeVisible();
  expect(await monClan(page)).toBeNull(); expect(await lire(page, () => Object.keys(S.me.clanApps))).toEqual([]);

  await aller(page, '#clans');                                                                    // c3 est sur invitation : on y entre avec son code
  const f = page.locator('form[data-form="clcode"]');
  await f.locator('[name=code]').fill('WMR-0000'); await f.locator('[type=submit]').click();
  await expect(f.locator('[data-clerr]')).not.toHaveText('');                                     // code inconnu : dit par le serveur, affiché dans le formulaire
  expect(await monClan(page)).toBeNull();
  await f.locator('[name=code]').fill(ANNUAIRE[2].code.toLowerCase()); await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#clan-c3/);
  expect(await monClan(page)).toEqual({ id: 'c3', role: 'membre' });
  expect((await appels(page, /^api_clan_join/)).pop()).toEqual(['api_clan_join', { p_clan: 'c3', p_code: ANNUAIRE[2].code }]);
  expect(erreurs).toEqual([]);
});

test('créer un clan : frais pris par le serveur, le joueur devient chef, son code d’invitation vient du serveur ; un refus est affiché', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#clans', faux: { etat: { me: ARGENT } } });
  await page.locator('[data-a="cl-create-open"]').first().click();
  const f = page.locator('form[data-form="clan"]');
  await f.locator('[name=name]').fill("Les Loups d'Azur"); await f.locator('[name=tag]').fill(ANNUAIRE[0].tag);   // tag d'un clan existant
  await f.locator('[name=desc]').fill('On joue le foot surtout.');
  await f.locator('[type=submit]').click();
  await expect(toast(page, await lire(page, () => _t("Tag déjà pris")))).toBeVisible();          // refusé à l'écran (annuaire connu)
  await f.locator('[name=tag]').fill('lda');
  await page.evaluate(() => { window.__FAKE_SB__.rpc = { api_clan_create: { error: { message: 'clan_tag_pris', code: 'P0001' } } }; });   // pris entre-temps par un autre joueur
  await f.locator('[type=submit]').click();
  await expect.poll(() => appels(page, /^api_clan_create/).then(a => a.length)).toBe(1);
  expect(await monClan(page)).toBeNull(); expect(await lire(page, () => S.me.balance)).toBe(500);
  await page.evaluate(() => { window.__FAKE_SB__.rpc = {}; });
  await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#clan-u1/);
  expect(await monClan(page)).toEqual({ id: 'u1', role: 'chef' });
  expect(await lire(page, () => ({ solde: S.me.balance, nom: CK.u1.name, tag: CK.u1.tag, chef: CK.u1.chief, code: clanCode(CK.u1), notif: S.me.notifs[0].text })))
    .toEqual({ solde: 450, nom: 'Les Loups d’Azur', tag: 'LDA', chef: 'me', code: 'WMR-U100', notif: await lire(page, () => _t("Clan {0} [{1}] créé. {2} de frais, non remboursables.", ['Les Loups d’Azur', 'LDA', F.usd0(50)])) });
  expect((await appels(page, /^api_clan_create/)).pop()[1]).toMatchObject({ name: "Les Loups d'Azur", tag: 'LDA', desc: 'On joue le foot surtout.', access: 'open', minRank: 0 });
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  expect(await monClan(page)).toEqual({ id: 'u1', role: 'chef' });
  expect(await lire(page, () => ({ dansAnnuaire: !!CK.u1, mien: CK.u1.mine, local: localStorage.getItem('wimoro-accounts') }))).toEqual({ dansAnnuaire: true, mien: true, local: null });
  expect(erreurs).toEqual([]);
});
