// Guerres de clans en mode Compte : déclarées par le chef, buy-in pris par le serveur, points et règlement tenus par le
// serveur. Le faux serveur applique les règles de supabase/migrations/…_clans_guerres.sql ;
// tests/sql/clans-guerres.spec.mjs les prouve côté base.
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

const BOT = '33333333-3333-4333-8333-333333333333';
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const ARGENT = { xp: 900, settled: 12, wins: 7, deposits: 1, balance: 500 };                      // rang Argent, compte de 30 jours
const FICHES = { [BOT]: { n: 'maxou_bot', t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: true, pub: 1, clan: null } };
const guerre = page => lire(page, () => { const c = myClan(), w = c && c.war; return w ? { foe: w.foe, pot: w.pot, buyin: w.buyin, mine: w.mine.map(x => [x.u, x.pts]), eux: w.theirs.length, heures: Math.round((w.endAt - w.at) / 3600e3) } : null; });
const onglet = (page, v) => page.locator('[data-a="cl-ctab"][data-v="' + v + '"]').click();
async function fonder(page, plus = {}) {
  const r = await ouvrir(page, { mode: 'compte', hash: '#clans', faux: { fiches: FICHES, etat: { me: ARGENT, friends: [BOT], users: FICHES }, ennemi: 'c7', ...plus } });
  await page.locator('[data-a="cl-create-open"]').first().click();
  const f = page.locator('form[data-form="clan"]');
  await f.locator('[name=name]').fill('Les Loups'); await f.locator('[name=tag]').fill('lou'); await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#clan-u1/);
  await onglet(page, 'membres');
  await page.locator('[data-a="cl-invite"]').click();                                            // un bot ami rejoint : il participera d'office
  await expect(toast(page, 'maxou_bot joined the clan')).toBeVisible();
  return r;
}

test('le chef déclare la guerre, puis y participe : adversaire, cagnotte et points viennent du serveur ; le buy-in est pris une fois', async ({ page }) => {
  const { erreurs } = await fonder(page);
  await onglet(page, 'guerre');
  await page.locator('[data-a="cl-war"]').click();
  const adversaire = await lire(page, () => CK.c7.name);
  await expect(toast(page, 'War declared on ' + adversaire)).toBeVisible();
  expect(await guerre(page)).toEqual({ foe: 'c7', pot: 220, buyin: 20, mine: [[BOT, 500]], eux: 10, heures: 48 });   // dix adversaires et notre bot
  await expect(page.locator('.clwar')).toContainText(adversaire);
  expect(await lire(page, () => myClan().feed[0].txt)).toContain('War declared on ' + adversaire);
  await onglet(page, 'chat');
  await expect(page.locator('.feed[data-room="clan:u1"]')).toContainText('Clan war against ' + adversaire);
  await onglet(page, 'guerre');
  await page.locator('[data-a="cl-war-join"]').click();
  await expect(toast(page, 'You’re in the war')).toBeVisible();
  expect(await lire(page, () => S.me.balance)).toBe(500 - 50 - 20);                              // 50 $ de création, 20 $ de buy-in
  expect((await guerre(page)).pot).toBe(240);
  expect((await guerre(page)).mine.map(x => x[0]).sort()).toEqual([BOT, 'me'].sort());
  await expect(page.locator('[data-a="cl-war-join"]')).toHaveCount(0);                            // déjà dedans
  expect(await lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && /^api_clan_war/.test(c.name)).map(c => c.name))).toEqual(['api_clan_war', 'api_clan_war_join']);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  expect((await guerre(page)).pot, 'tout revient du serveur').toBe(240);
  expect(erreurs).toEqual([]);
});

test('au bout de 48 heures le serveur règle : guerre gagnée, la cagnotte moins 4 % est partagée et rapporte 50 XP ; elle passe dans les guerres terminées', async ({ page }) => {
  const { erreurs } = await fonder(page, { pointsEux: 10 });                                     // des adversaires très faibles : nous gagnerons
  await onglet(page, 'guerre');
  await page.locator('[data-a="cl-war"]').click();
  await page.locator('[data-a="cl-war-join"]').click();
  await expect(toast(page, 'You’re in the war')).toBeVisible();
  const avant = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp }));
  await page.evaluate(() => { const g = __fakeSB.db.guerres.u1[0]; g.at -= 49 * 3600e3; g.endAt -= 49 * 3600e3; __fakeSB.persist(); });   // 49 heures plus tard
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  const part = Math.round(240 * 0.96 / 2 * 100) / 100;                                           // deux participants de notre côté
  expect(await guerre(page)).toBeNull();
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, passees: myClan().wars.map(w => [w.foe, w.status, w.pot]) }))).toEqual({ solde: avant.solde + part, xp: avant.xp + 50, passees: [['c7', 'won', 240]] });
  expect(await lire(page, () => S.me.notifs[0].text)).toContain('War won against ' + await lire(page, () => CK.c7.name));
  await onglet(page, 'guerre');
  await expect(page.locator('#view')).toContainText('Won');
  expect(erreurs).toEqual([]);
});
