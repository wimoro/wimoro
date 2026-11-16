// Duels de stack en mode Compte : le buy-in, les stacks et le règlement sont tenus par le serveur ; l'adversaire est un
// joueur simulé. Le faux serveur applique les règles de supabase/migrations/…_stacks.sql ; tests/sql/stacks.spec.mjs les
// prouve côté base.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const BOT = '33333333-3333-4333-8333-333333333333';
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const fiche = (n, plus = {}) => ({ n, t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1, ...plus });
const FICHES = { [AMI]: fiche('lea_reelle'), [BOT]: fiche('maxou_bot', { bot: true }) };
const ouvrirDuels = (page, plus = {}) => ouvrir(page, { mode: 'compte', hash: '#duels', faux: { fiches: FICHES, etat: { me: { balance: 500 }, friends: [AMI, BOT], users: FICHES, ...plus } } });
const stacks = page => lire(page, () => (S.me.stacks || []).map(s => ({ id: s.id, opp: s.opp, status: s.status, buyin: s.buyin, my: s.my, theirs: s.theirs })));
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && /^api_stack/.test(c.name)).map(c => [c.name, c.args.p ? { ...c.args.p, key: undefined } : c.args]));
const lancer = async (page, adversaire) => {
  await page.locator('[data-a="stack-open"]').first().click();
  await page.locator('[data-a="stk-opp"][data-v="' + adversaire + '"]').click();
  await page.locator('[data-a="stk-create"]').click();
};

test('lancer un duel de stack contre un joueur simulé : buy-in pris par le serveur, 1 000 jetons chacun, toujours là après rechargement ; contre un vrai joueur, c’est refusé et rien n’est pris', async ({ page }) => {
  const { erreurs } = await ouvrirDuels(page);
  expect(await stacks(page), 'aucun duel inventé par le navigateur').toEqual([]);
  await lancer(page, BOT);
  await expect(toast(page, 'Stack duel started')).toBeVisible();
  const [s] = await stacks(page);
  expect(s).toMatchObject({ opp: BOT, status: 'active', buyin: 25, my: 1000, theirs: 1000 });
  expect(await lire(page, () => S.me.balance)).toBe(475);
  expect((await appels(page))[0]).toEqual(['api_stack_create', { buyin: 25, opp: BOT }]);
  await expect(page.locator('.stk.active')).toContainText('maxou_bot');
  await expect(page.locator('.stk.active')).toContainText('$48');                                // la cagnotte : deux buy-in moins 4 %
  expect(await lire(page, () => S.me.notifs[0].text)).toContain('Stack duel started against maxou_bot');
  await page.reload(); await pret(page);
  expect(await stacks(page)).toEqual([s]);                                                      // tout vient du serveur
  // un vrai joueur devrait donner son accord et sa mise : le serveur refuse, c'est dit, rien n'est pris
  await lancer(page, AMI);
  await expect(toast(page, 'Stack duels against this player aren’t available yet')).toBeVisible();
  expect(await stacks(page)).toHaveLength(1);
  expect(await lire(page, () => S.me.balance)).toBe(475);
  expect(erreurs).toEqual([]);
});

test('le stack suit les résultats réels du joueur ; au bout de sept jours le serveur règle : cagnotte moins 4 %, 30 XP', async ({ page }) => {
  const { erreurs } = await ouvrirDuels(page);
  await lancer(page, BOT);
  await expect.poll(async () => (await stacks(page)).length).toBe(1);
  // le joueur gagne 80 $ dans la semaine : son stack monte à 1 080 (relu sur le serveur)
  await page.evaluate(() => { const e = __fakeSB.etat(); e.me.realized = (e.me.realized || 0) + 80; e.stacksL[0].fin = 1040; __fakeSB.persist(); });
  await page.reload(); await pret(page);
  expect((await stacks(page))[0]).toMatchObject({ status: 'active', my: 1080 });
  // sept jours ont passé : réglé au passage du joueur
  await page.evaluate(() => { const x = __fakeSB.etat().stacksL[0]; x.at -= 8 * 864e5; x.endAt -= 8 * 864e5; __fakeSB.persist(); });
  await page.reload(); await pret(page);
  expect((await stacks(page))[0]).toMatchObject({ status: 'won', my: 1080, theirs: 1040 });
  expect(await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp }))).toEqual({ solde: 475 + 48, xp: 30 });
  expect(await lire(page, () => S.me.notifs[0].text)).toBe('Stack duel won against maxou_bot: +$23.00.');
  await expect(page.locator('.stk.won')).toContainText('Won');
  expect(erreurs).toEqual([]);
});
