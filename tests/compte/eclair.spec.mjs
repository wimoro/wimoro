// Pari éclair en mode Compte : la mise et le règlement passent par le serveur (Edge Function « eclair », même moteur que
// l'écran). Couvre la recette 2 : mise acceptée, affichée, réglée à la fin de la manche, solde et historique à jour ;
// après rechargement en cours de manche, la mise est toujours là.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, debutManche } from '../helpers/app.mjs';

const H = debutManche() + 2000;
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const etat = page => lire(page, () => ({ solde: S.me.balance, joues: S.me.played, regles: S.me.settled, xp: S.me.xp, mise: G(S.ui.fgame).my, jeu: S.ui.fgame, manche: S.flash.round, hist: S.me.history.length }));
const appelsEclair = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'fn' && c.name === 'eclair').map(c => c.args));
const miser = page => page.locator('[data-a="flash-bet"]:not([disabled])').first().click();

test('recette 2 · miser, voir sa mise, la retrouver après rechargement, être réglé par le serveur à la fin de la manche', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#eclair', horloge: H, faux: { etat: { me: { balance: 200 } } } });
  const avant = await etat(page);
  expect(avant).toMatchObject({ solde: 200, mise: null });
  await miser(page);
  await expect.poll(() => lire(page, () => !!G(S.ui.fgame).my)).toBe(true);
  const pendant = await etat(page);
  const srv = await lire(page, () => __fakeSB.etat());
  expect(pendant).toMatchObject({ solde: 190, joues: avant.joues + 1, xp: avant.xp + 10 });
  expect(pendant.mise).toMatchObject({ amt: 10, s: srv.eclairMises[0].s, tk: srv.eclairMises[0].tk });
  expect(pendant.mise.net).toBeCloseTo(srv.eclairMises[0].net, 9);                           // les frais sont ceux du serveur
  expect(pendant.mise.net).toBeLessThan(10); expect(pendant.mise.net).toBeGreaterThan(9.5);
  await expect(page.locator('#view')).toContainText('Your stake: $10.00');
  expect(await appelsEclair(page)).toEqual([{ action: 'bet', gid: pendant.jeu, side: pendant.mise.s, amt: 10 }]);

  // rechargement en cours de manche : la mise est toujours là, rendue par le serveur
  await page.reload(); await pret(page);
  const recharge = await etat(page);
  expect(recharge.solde).toBe(190); expect(recharge.manche).toBe(pendant.manche);
  expect(await lire(page, g => G(g).my, pendant.jeu)).toMatchObject({ amt: 10, s: pendant.mise.s });
  await expect(page.locator('#view')).toContainText('Your stake: $10.00');

  // fin de la manche : le serveur rejoue la manche et règle
  const prevu = await lire(page, g => { const d = GM[g], x = G(g); return MoteurEclair.regler(d, S.flash.round, x.my); }, pendant.jeu);
  await page.clock.runFor(46000);
  await expect.poll(() => lire(page, () => S.me.settled), { timeout: 10000 }).toBe(avant.regles + 1);
  const apres = await etat(page);
  expect(apres.manche).toBe(pendant.manche + 1);
  expect(await lire(page, g => G(g).my, pendant.jeu), 'la mise de la manche terminée est soldée').toBeNull();
  const gain = Math.round((prevu.win ? prevu.pay : 0) * 100) / 100;
  expect(apres.solde).toBeCloseTo(190 + gain, 2);                                            // ce que l'écran avait calculé = ce que le serveur a payé
  expect(apres.solde).toBe(await lire(page, () => __fakeSB.etat().me.balance));
  expect(apres.xp).toBe(avant.xp + 10 + (prevu.win ? 40 : 0));
  const h = await lire(page, () => S.me.history[0]);
  expect(h).toMatchObject({ k: 'flash', win: prevu.win });
  expect(h.q).toMatch(/^Flash .*, round /);                                                  // libellé composé à l'écran, dans la langue du lecteur
  expect(h.pnl).toBeCloseTo(gain - 10, 2);
  await expect(toast(page, prevu.win ? 'Won' : 'Lost')).toBeVisible();
  expect((await appelsEclair(page)).filter(a => a.action === 'settle').length).toBeGreaterThanOrEqual(1);
  // rechargement : tout est encore là
  await page.reload(); await pret(page);
  expect(await lire(page, () => ({ solde: S.me.balance, regles: S.me.settled, hist: S.me.history[0].k }))).toEqual({ solde: apres.solde, regles: avant.regles + 1, hist: 'flash' });
  expect(erreurs).toEqual([]);
});

test('une mise par pari et par manche ; mises fermées en fin de manche ; les refus du serveur sont affichés', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#eclair', horloge: H, faux: { etat: { me: { balance: 200 }, prefs: { tmode: 'all' } } } });
  await miser(page);
  await expect.poll(() => lire(page, () => S.me.balance)).toBe(190);
  // seconde mise sur le même pari : refusée à l'écran, et par le serveur si on le contourne
  await page.evaluate(() => flashBet('non', null, S.ui.fgame));
  await expect(toast(page, 'already bet')).toBeVisible();
  const direct = await page.evaluate(async () => { try { await API.fn('eclair', { action: 'bet', gid: S.ui.fgame, side: 'non', amt: 5, key: crypto.randomUUID() }); return 'accepté'; } catch (e) { return e.code; } });
  expect(direct).toBe('deja_mise');
  // un autre pari de la même manche reste jouable
  const autre = await page.evaluate(async () => { const g = GAMES.find(d => d.id !== S.ui.fgame).id; const r = await API.fn('eclair', { action: 'bet', gid: g, side: 'oui', amt: 5, key: crypto.randomUUID() }); return r.me.balance; });
  expect(autre).toBe(185);
  // après 30 secondes, les mises sont fermées : refus du serveur
  await page.clock.runFor(30000);
  const ferme = await page.evaluate(async () => { try { await API.fn('eclair', { action: 'bet', gid: 'gold', side: 'oui', amt: 5, key: crypto.randomUUID() }); return 'accepté'; } catch (e) { return e.code; } });
  expect(ferme).toBe('mises_fermees');
  expect(await lire(page, () => __fakeSB.etat().me.balance)).toBe(185);
});

test('manche terminée pendant l’absence : réglée par le serveur au chargement suivant, avec une notification', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#eclair', horloge: H, faux: { etat: { me: { balance: 100 } } } });
  await miser(page);
  await expect.poll(() => lire(page, () => S.me.balance)).toBe(90);
  const mise = await lire(page, () => ({ g: S.ui.fgame, r: S.flash.round, my: G(S.ui.fgame).my }));
  const prevu = await lire(page, m => MoteurEclair.regler(GM[m.g], m.r, m.my), mise);
  // l'onglet est fermé ; il est rouvert trois manches plus tard
  await page.goto('/css/tokens.css');                                                          // une autre page : le site n'est plus ouvert
  await page.clock.runFor(3 * 45000);
  await page.goto('/index.html#eclair'); await pret(page);
  await page.clock.runFor(3000);
  await expect.poll(() => lire(page, () => S.me.settled), { timeout: 10000 }).toBe(1);
  const gain = Math.round((prevu.win ? prevu.pay : 0) * 100) / 100;
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(90 + gain, 2);
  expect(await lire(page, () => S.me.notifs[0].text)).toMatch(prevu.win ? /^Flash .* won, \+\$/ : /^Flash .* lost, /);
  expect(await lire(page, () => S.me.history.filter(h => h.k === 'flash').length)).toBe(1);
  expect(erreurs).toEqual([]);
});

test('refus du serveur pendant une pause ; panne de réseau : aucun débit affiché', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#eclair', horloge: H, faux: { etat: { me: { balance: 100 } }, fn: { eclair: 'pause' } } });
  await miser(page);
  await expect(toast(page, 'Action failed')).toBeVisible();
  await expect(toast(page, 'on a break')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, mise: G(S.ui.fgame).my }))).toEqual({ solde: 100, mise: null });
  await page.evaluate(() => { window.__FAKE_SB__.fn = null; window.__FAKE_SB__.horsLigne = true; });
  await miser(page);
  await expect(toast(page, 'reach the server')).toBeVisible();
  expect(await lire(page, () => ({ solde: S.me.balance, mise: G(S.ui.fgame).my }))).toEqual({ solde: 100, mise: null });
});
