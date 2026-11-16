// Clans en mode Compte, suite : fil d'activité, outils du chef et des officiers (inviter, nommer, exclure), appels de clan.
// Le faux serveur applique les règles de supabase/migrations/…_clans_chefs.sql ; tests/sql/clans-chefs.spec.mjs les prouve.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, AMI } from '../helpers/app.mjs';

const BOT = '33333333-3333-4333-8333-333333333333';
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const ARGENT = { xp: 900, settled: 12, wins: 7, deposits: 1, balance: 500 };                      // rang Argent, compte de 30 jours
const fiche = (n, plus = {}) => ({ n, t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1, clan: null, ...plus });
const FICHES = { [BOT]: fiche('maxou_bot', { bot: true }), [AMI]: fiche('lea_reelle') };
const M = (id, p) => ({ market_id: id, current_probability: p, anchor_probability: p, volume_total: 2e6, participants_count: 500, liquidity_depth: 30000 });
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && /^api_clan_(promote|kick|invite|call)/.test(c.name)).map(c => [c.name, c.args]));
const clan = page => lire(page, () => { const c = myClan(); return c && { id: c.id, role: clanRole(), membres: c.members.map(m => m.u), officiers: c.officers.slice(), fil: c.feed.map(f => f.txt), appels: c.calls.map(k => [k.m, k.s, k.by, k.followers.length]) }; });
const onglet = (page, v) => page.locator('[data-a="cl-ctab"][data-v="' + v + '"]').click();
async function fonder(page, plus = {}) {
  const r = await ouvrir(page, { mode: 'compte', hash: '#clans', faux: { marches: [M('btc150k', 63)], fiches: FICHES, etat: { me: ARGENT, friends: [BOT, AMI], users: FICHES }, ...plus } });
  await page.locator('[data-a="cl-create-open"]').first().click();
  const f = page.locator('form[data-form="clan"]');
  await f.locator('[name=name]').fill('Les Loups'); await f.locator('[name=tag]').fill('lou'); await f.locator('[type=submit]').click();
  await expect(page).toHaveURL(/#clan-u1/);
  return r;
}

test('chef d’un clan : inviter un ami (un bot rejoint aussitôt, un vrai joueur reçoit le code), nommer un officier, exclure ; le fil d’activité vient du serveur', async ({ page }) => {
  const { erreurs } = await fonder(page);
  expect(await clan(page)).toMatchObject({ id: 'u1', role: 'chef', membres: [], fil: [await lire(page, () => _t('{0} a fondé le clan.', [S.me.n]))] });
  await onglet(page, 'membres');
  await page.locator('[data-a="cl-invite"]').click();
  await expect(toast(page, 'maxou_bot joined the clan')).toBeVisible();
  expect((await clan(page)).membres).toEqual([BOT]);
  await page.locator('[data-a="cl-invite"]').click();                                            // l'ami suivant : un vrai joueur
  await expect(toast(page, 'Invitation sent to lea_reelle')).toBeVisible();
  expect((await clan(page)).membres, 'un vrai joueur n’est jamais ajouté d’office').toEqual([BOT]);
  await page.locator('[data-a="cl-invite"]').click();
  await expect(toast(page, 'You already invited this player today.')).toBeVisible();
  await page.locator('[data-a="cl-promote"][data-u="' + BOT + '"]').click();
  await expect(toast(page, 'maxou_bot is an officer')).toBeVisible();
  expect((await clan(page)).officiers).toEqual([BOT]);
  await expect(page.locator('[data-a="cl-promote"][data-u="' + BOT + '"]')).toHaveCount(0);       // déjà officier
  await page.locator('[data-a="cl-kick"][data-u="' + BOT + '"]').click();
  await expect(toast(page, 'maxou_bot kicked')).toBeVisible();
  expect(await clan(page)).toMatchObject({ membres: [], officiers: [] });
  expect((await appels(page)).map(a => a[0] + ':' + a[1].p_user)).toEqual(['api_clan_invite:' + BOT, 'api_clan_invite:' + AMI, 'api_clan_invite:' + AMI, 'api_clan_promote:' + BOT, 'api_clan_kick:' + BOT]);
  // le fil d'activité : composé à l'écran, dans la langue du lecteur, à partir des codes du serveur
  await onglet(page, 'activite');
  const moi = await lire(page, () => S.me.n);
  expect((await clan(page)).fil).toEqual(['maxou_bot was kicked from the clan.', 'maxou_bot is appointed officer.', 'maxou_bot joins the clan at ' + moi + '’s invitation.', moi + ' founded the clan.']);
  await expect(page.locator('.clfeed')).toContainText('maxou_bot was kicked from the clan.');
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  expect((await clan(page)).fil).toHaveLength(4);                                                // tout revient du serveur
  expect(erreurs).toEqual([]);
});

test('appel de clan : épinglé en tête du fil, annoncé dans le chat du clan, puis suivi par des membres (le serveur prévient son auteur)', async ({ page }) => {
  const { erreurs } = await fonder(page, { appelDelai: 0 });
  await onglet(page, 'membres');
  await page.locator('[data-a="cl-invite"]').click();
  await expect(toast(page, 'maxou_bot joined the clan')).toBeVisible();
  await onglet(page, 'activite');
  await page.locator('[data-a="cl-call-open"]').click();
  await page.locator('#clcm').selectOption('btc150k');
  await page.locator('#ov [data-clcs="non"]').click();
  await page.locator('[data-a="cl-call-do"]').click();
  await expect(toast(page, 'Clan call launched')).toBeVisible();
  const moi = await lire(page, () => S.me.n), court = await lire(page, () => MK.btc150k.short);
  expect((await clan(page)).appels).toEqual([['btc150k', 'non', 'me', 0]]);
  expect((await clan(page)).fil[0]).toBe('Clan call: ' + moi + ' pins ' + court + ' on the No side.');
  await expect(page.locator('.clcall')).toContainText(court);
  expect((await appels(page)).pop()).toEqual(['api_clan_call', { p_market: 'btc150k', p_side: 'non' }]);
  // dans le chat du clan : une ligne d'événement, donnée par le serveur
  await onglet(page, 'chat');
  await expect(page.locator('.feed[data-room="clan:u1"]')).toContainText('Clan call: ' + court + ', No side.');
  // quelques secondes plus tard, des membres l'ont suivi : le serveur le dit et prévient l'auteur
  await page.evaluate(() => srvClanRelire());
  await expect.poll(async () => (await clan(page)).appels[0][3]).toBe(1);                         // un seul autre membre dans ce clan
  expect(await lire(page, () => S.me.notifs[0].text)).toBe('1 members followed your clan call on ' + court + '.');
  expect(erreurs).toEqual([]);
});

test('membre d’un clan de démonstration : son fil d’activité vient du serveur (arrivée, mise), et il n’a aucun pouvoir de chef', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#clan-c1', faux: { marches: [M('btc150k', 63)], fiches: FICHES, etat: { me: ARGENT, friends: [BOT] } } });
  await page.locator('[data-a="cl-join"]').first().click();
  await expect(toast(page, 'Welcome to')).toBeVisible();
  const moi = await lire(page, () => S.me.n);
  expect((await clan(page)).fil).toEqual([moi + ' joined the clan.']);
  await page.evaluate(() => API.call('api_buy', { p_market: 'btc150k', p_side: 'oui', p_total: 20, p_key: crypto.randomUUID(), p_opts: {} }));
  await page.evaluate(() => srvClanRelire());
  await expect.poll(async () => (await clan(page)).fil[0]).toBe(moi + ' just bet $20 on ' + await lire(page, () => MK.btc150k.short) + '.');
  await onglet(page, 'membres');
  await expect(page.locator('[data-a="cl-invite"], [data-a="cl-promote"], [data-a="cl-kick"]')).toHaveCount(0);
  expect(await page.evaluate(async u => { try { await API.call('api_clan_invite', { p_user: u }); return 'accepté'; } catch (e) { return e.code; } }, BOT)).toBe('role_insuffisant');
  expect(erreurs).toEqual([]);
});
