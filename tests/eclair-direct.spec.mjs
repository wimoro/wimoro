// Partie D : le pari éclair du nouveau front, sur les vrais cours, PAR CLIENT (l'interrupteur global reste éteint).
// Les réponses d'api_live et d'api_fixations sont de vraies réponses de la production, enregistrées une fois
// (tools/eclair-direct-enregistrer.mjs → tests/fixtures/eclair-direct/enregistrement.json) et rejouées avec une horloge
// simulée : une fixation n'est servie qu'une fois son heure d'écriture passée. Aucun appel au vrai serveur.
// Couvre : copies conformes et parité navigateur / Edge Function du module de règle (js/moteur-reel.js) ; sans
// fixations, l'ancien fonctionnement ; le compte démo réglé sur les fixations (le même résultat qu'un visiteur voit) ;
// « Départ en cours de fixation » et « Résultat en cours de vérification » ; la rotation sans les jeux en pause ;
// « Marché fermé » et la dernière clôture ; la pastille « simulé » ; la manche annulée et la mise rendue ; un vrai compte
// qui envoie « reel: true », le refus « jeu_en_pause » et la notification « flash_rembourse ».
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { ouvrir, lire } from './helpers/app.mjs';

const ENR = JSON.parse(fs.readFileSync('tests/fixtures/eclair-direct/enregistrement.json', 'utf8'));
const charger = fichiers => { const bac = {}; bac.globalThis = bac; for (const f of fichiers) vm.runInNewContext(fs.readFileSync(f, 'utf8'), bac); return bac; };
const NAV = charger(['js/moteur-eclair.js', 'js/moteur-reel.js']), EDGE = charger(['supabase/functions/eclair/moteur-eclair.js', 'supabase/functions/eclair/moteur-reel.js']);
const ME = NAV.MoteurEclair, MR = NAV.MoteurReel;
const R0 = ENR.r - 12;                                      // une manche au milieu de l'enregistrement : ses fixations r − 2 … r + 1 existent
const H0 = ME.t0(R0) + 2000;                                // deux secondes après son début : la fixation de départ n'est pas encore écrite
const FBTC = ENR.fixations.btc.F;

/**
 * Le « serveur » des tests : à l'heure de la page, les fixations déjà écrites (a ≤ maintenant) et les cours de
 * l'enregistrement décalés dans le temps. opt.retenir : manches dont la fixation n'arrive jamais ; opt.ferme : place de
 * New York fermée (indicateur « o » des actions).
 */
function serveur(page, opt = {}) {
  const retenir = new Set(opt.retenir || []), tPage = () => page.evaluate(() => Date.now());
  const vue = async (jeu, corps) => {
    const T = await tPage(), r = ME.round(T), x = JSON.parse(JSON.stringify(ENR.fixations[jeu]));
    const a = Math.min(corps.p_a ?? r, r + 2), de = Math.max(corps.p_de ?? a - 11, a - 99);
    x.F = Object.fromEntries(Object.entries(x.F).filter(([k, f]) => +k >= de - 2 && +k <= a + 1 && f.a <= T && !retenir.has(+k)));
    x.manches = Object.fromEntries(Object.entries(x.manches).filter(([k]) => +k >= de && +k <= a));
    return Object.assign(x, { r, de, a });
  };
  const fixations = Object.fromEntries(Object.keys(ENR.fixations).map(j => [j, corps => vue(j, corps)]));
  const live = async corps => {
    const T = await tPage(), D = T - ENR.t, x = JSON.parse(JSON.stringify(ENR.live));
    for (const k in x.cours) { x.cours[k].t += D; if (opt.ferme && ['nvda', 'tsla', 'spy', 'qqq', 'ndx', 'spx'].includes(k)) x.cours[k].o = 0; }
    x.t = T; x.cours_at += D; x.eclair = { on: false, r: ME.round(T) };
    x.serie = corps.p_serie === 'btc' ? ENR.live.serie.map(([t, p]) => [t + D, p]).filter(q => q[0] <= T) : undefined;
    return x;
  };
  return { live, fixations };
}
/** avance l'horloge de la page jusqu'à l'instant t (ms), puis laisse arriver les réponses du « serveur » (le temps réel
    continue de couler pour le réseau) ; la fenêtre de bienvenue du compte démo, ouverte entre-temps, est refermée */
const jusqua = async (page, t) => { const d = t - await page.evaluate(() => Date.now()); if (d > 0) await page.clock.runFor(d); await page.waitForTimeout(400); await page.evaluate(() => { S.me.welcomed = true; if ($('#ov')) closeModal(); }); };
const texte = (page, fx) => page.locator(`[data-fx="${fx}"]`).first().innerText();

test('module de règle : copies conformes, et le navigateur et l’Edge Function décident et règlent pareil sur les fixations enregistrées', async () => {
  expect(fs.readFileSync('supabase/functions/eclair/moteur-reel.js', 'utf8')).toBe(fs.readFileSync('js/moteur-reel.js', 'utf8'));
  const ks = Object.keys(FBTC).map(Number).sort((a, b) => a - b);
  let reels = 0;
  for (const r of ks.slice(2, -1)) for (const jeu of ['btc', 'vol']) {
    const n = NAV.MoteurReel, e = EDGE.MoteurReel;
    expect(e.reelle(jeu, r, FBTC)).toBe(n.reelle(jeu, r, FBTC));
    if (!n.reelle(jeu, r, FBTC)) continue;
    reels++;
    for (const my of [{ s: 'oui', amt: 10, net: 9.8, mult: 0, tk: 7 }, { s: 'non', amt: 25, net: 24.4, mult: 0, tk: 90 }, { s: 'be', amt: 2, net: 1.95, mult: 24, tk: 30 }]) {
      const a = NAV.MoteurEclair.reglerReel(NAV.MoteurEclair.JEUX[jeu], r, my, n.ctx(jeu, r, FBTC));
      expect(EDGE.MoteurEclair.reglerReel(EDGE.MoteurEclair.JEUX[jeu], r, my, e.ctx(jeu, r, FBTC))).toEqual(a);
    }
    // le contexte d'une mise, tel que l'Edge Function le reçoit de la base (interrupteur éteint : manche figée « simulée »)
    const c = { mode: 'simule', raison: 'interrupteur', config: 'reel', Fc: n.fenetre(FBTC, r) };
    expect(e.contexteMise(jeu, r, c)).toEqual(n.ctx(jeu, r, FBTC));
  }
  expect(reels).toBeGreaterThan(40);
  // une fixation r − 2 écrite après le début de la manche ne la rend pas réelle ; un jeu sans vraie source jamais
  const r = ks[10], tard = { ...FBTC, [r - 2]: { ...FBTC[r - 2], a: ME.t0(r) + 1 } };
  expect(MR.reelle('btc', r, tard)).toBe(false);
  expect(MR.contexteMise('cac', r, { mode: 'simule', raison: 'interrupteur', config: 'simule', Fc: FBTC })).toBeNull();
  expect(MR.contexteMise('btc', r, { mode: 'simule', raison: 'pas_de_source', config: 'reel', Fc: FBTC })).toBeNull();
});

test('sans fixations lisibles : l’ancien fonctionnement, simulé et réglé par le moteur d’avant', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: H0 });
  expect(await lire(page, () => ({ mode: S.reel.btc.mode, meme: GA('btc') === G('btc'), raison: modeJeu('btc', S.flash.round).raison }))).toEqual({ mode: 's', meme: true, raison: 'hors_ligne' });
  await page.evaluate(() => { S.me.fmode = 'free'; S.ui.fgame = 'btc'; render(false); });
  const avant = await lire(page, () => S.me.balance);
  await page.locator('[data-a="flash-bet"][data-v="oui"]:not([disabled])').first().click();
  const my = await lire(page, () => G('btc').my);
  expect(my).toMatchObject({ s: 'oui', amt: 10 }); expect(my.reel).toBeUndefined();
  const prevu = ME.regler(ME.JEUX.btc, R0, my);
  await jusqua(page, ME.t0(R0 + 1) + 1500);
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(avant - 10 + (prevu.win ? prevu.pay : 0), 6);
  expect(erreurs).toEqual([]);
});

test('compte démo : manche du Bitcoin sur les vrais cours, départ puis fin fixés, réglée sur les fixations comme le serveur', async ({ page }) => {
  const direct = serveur(page);
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: H0, direct });
  await page.evaluate(() => { S.me.fmode = 'free'; S.ui.fgame = 'btc'; render(false); });
  expect(await lire(page, () => ({ r: S.flash.round, mode: modeJeu('btc', S.flash.round).m, etat: S.reel.btc.mode, meme: GA('btc') === S.reel.btc }))).toEqual({ r: R0, mode: 'r', etat: 'r', meme: true });
  await expect(page.locator('[data-fx="chg"]').first()).toHaveText('Start price being fixed');
  await jusqua(page, ME.t0(R0) + 9000);                                                   // la fixation de départ est arrivée
  await expect.poll(() => lire(page, () => ({ ok: S.reel.btc.startOk, p0: S.reel.btc.start }))).toEqual({ ok: true, p0: FBTC[R0].p });
  await expect(page.locator('[data-fx="chg"]').first()).not.toHaveText('Start price being fixed');
  expect(await page.locator('[data-fx="src"] .fl-src').count()).toBe(0);                    // un cours réel : pas de pastille « simulé »
  // la mise : cagnotte du moteur v2, marquée « reel »
  const avant = await lire(page, () => S.me.balance);
  await page.locator('[data-a="flash-bet"][data-v="non"]:not([disabled])').first().click();
  const my = await lire(page, () => GA('btc').my);
  expect(my).toMatchObject({ s: 'non', amt: 10, reel: 1 });
  const g = ME.etatReel(ME.JEUX.btc, R0, my.tk, null, MR.ctx('btc', R0, FBTC));
  expect(my.fee).toBeCloseTo(ME.frais(ME.JEUX.btc, g, 'non', 10, false), 9);
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(avant - 10, 6);
  // fin de la manche : le résultat attend la fixation de fin
  await jusqua(page, ME.t0(R0 + 1) + 1000);
  expect(await lire(page, () => S.reel.btc.result)).toMatchObject({ round: R0, attente: true });
  await expect(page.locator('[data-fx="my"]').first()).toContainText('Result being verified');
  // la fixation de fin arrive : réglé sur les fixations, exactement comme reglerReel (le calcul du serveur)
  await jusqua(page, ME.t0(R0 + 1) + 9000);
  const x = ME.reglerReel(ME.JEUX.btc, R0, my, MR.ctx('btc', R0, FBTC)), out = ME.issueReelle(ME.JEUX.btc, FBTC[R0], FBTC[R0 + 1], MR.parametres('btc'));
  expect(x.annule).toBeFalsy();
  await expect.poll(() => lire(page, () => !S.reel.btc.result.attente)).toBe(true);
  const res = await lire(page, () => S.reel.btc.result);
  expect(res).toMatchObject({ round: R0, out, p0: FBTC[R0].p, p1: FBTC[R0 + 1].p });
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(avant - 10 + x.pay, 6);
  expect(await lire(page, () => S.me.history[0])).toMatchObject({ k: 'flash', win: x.win, s: 'non' });
  await expect(page.locator('[data-fx="my"]').first()).toContainText(`round ${R0.toLocaleString('en-US')}`);
  expect(await lire(page, () => ({ freel: (S.me.freel || []).length, attente: Object.keys(DIR.attente).length }))).toEqual({ freel: 0, attente: 0 });
  expect(direct.appels.some(a => a.nom === 'fixations' && a.corps.p_jeu === 'btc')).toBe(true);
  expect(erreurs).toEqual([]);
});

test('visiteur : la même manche, le même résultat (départ, fin, issue), aucun bouton de mise actif', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#eclair', horloge: H0, direct: serveur(page) });
  await page.evaluate(() => { S.ui.fgame = 'btc'; S.me.fmode = 'free'; render(false); });
  await jusqua(page, ME.t0(R0 + 1) + 9000);
  const out = ME.issueReelle(ME.JEUX.btc, FBTC[R0], FBTC[R0 + 1], MR.parametres('btc'));
  await expect.poll(() => lire(page, () => S.reel.btc.result)).toMatchObject({ round: R0, out, p0: FBTC[R0].p, p1: FBTC[R0 + 1].p, res: null });
  expect(await page.locator('[data-a="flash-bet"]').count()).toBe(0);                      // un visiteur : les boutons mènent à l'inscription
  expect(erreurs).toEqual([]);
});

test('rotation : les jeux en pause n’y sont jamais, les jeux ouverts 24 h sur 24 sont proposés ; « Marché fermé », dernière clôture, réouverture', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: H0, direct: serveur(page, { ferme: true }) });
  await jusqua(page, ME.t0(R0) + 9000);
  const rot = await lire(page, r0 => { const L = []; for (let r = r0; r < r0 + 40; r++) L.push(GAMES[fSpot(r)].id); return L; }, R0);
  for (const id of ['ndx', 'spx', 'nvda', 'tsla']) expect(rot).not.toContain(id);
  expect(rot).toContain('btc');
  const bourse = await lire(page, r0 => { S.me.fcat = 'Bourse'; const L = new Set(); for (let r = r0; r < r0 + 30; r++) L.add(GAMES[fSpot(r)].id); S.me.fcat = 'Tout'; return [...L].sort(); }, R0);
  expect(bourse).toEqual(['btc', 'cac', 'doge', 'eth', 'sol', 'vol']);                       // la bourse en pause : à la place, les jeux ouverts 24 h sur 24
  // Nvidia choisi en mode Libre : place fermée, dernière clôture, réouverture, mises impossibles
  await page.evaluate(() => { S.me.fmode = 'free'; S.ui.fgame = 'nvda'; render(false); });
  expect(await lire(page, () => ({ m: S.reel.nvda.mode, raison: S.reel.nvda.raison }))).toEqual({ m: 'p', raison: 'ferme' });
  await expect(page.locator('[data-fx="phase"]').first()).toContainText('Market closed');
  await expect(page.locator('[data-fx="phase"]').first()).toContainText('Reopens');
  await expect(page.locator('[data-fx="chg"]').first()).toHaveText('Last close');
  await expect(page.locator('[data-fx="price"]').first()).toContainText(String(ENR.live.cours.nvda.p).split('.')[0]);
  await expect(page.locator('.fl-pause')).toContainText('Last close:');
  await expect(page.locator('.fl-pause [data-a="fl-jeu"]')).toHaveCount(5);
  for (const b of await page.locator('[data-a="flash-bet"]').all()) await expect(b).toBeDisabled();
  const solde = await lire(page, () => S.me.balance);
  await page.evaluate(() => flashBet('oui', null, 'nvda'));
  expect(await lire(page, () => ({ solde: S.me.balance, my: S.reel.nvda.my }))).toEqual({ solde, my: null });
  // « jouer un jeu ouvert 24 h sur 24 » : le Bitcoin, sur les vrais cours
  await page.locator('.fl-pause [data-a="fl-jeu"][data-v="btc"]').click();
  expect(await lire(page, () => ({ jeu: S.ui.fgame, m: GA('btc').mode }))).toEqual({ jeu: 'btc', m: 'r' });
  expect(erreurs).toEqual([]);
});

test('jeux simulés : la pastille « simulé » et son explication (un flux à la seconde est payant) ; rien pour un cours réel', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: H0, direct: serveur(page) });
  await page.evaluate(() => { S.me.fmode = 'free'; S.ui.fgame = 'gold'; render(false); });
  const pastille = page.locator('[data-fx="src"] button.fl-src.sim').first();
  await expect(pastille).toHaveText('simulated');
  await expect(pastille).toHaveAttribute('title', /paid data feed/);
  await pastille.click();
  await expect(page.locator('.toast', { hasText: 'Simulated price' }).first()).toBeVisible();
  await page.evaluate(() => { S.ui.fgame = 'tennis'; render(false); });
  await expect(page.locator('[data-fx="src"] button.fl-src.sim').first()).toHaveAttribute('title', /Simulated match/);
  await page.evaluate(() => { S.ui.fgame = 'btc'; render(false); });
  await jusqua(page, ME.t0(R0) + 9000);
  await expect(page.locator('[data-fx="src"] .fl-src.sim')).toHaveCount(0);
  expect(erreurs).toEqual([]);
});

test('manche annulée (fixation de fin absente) : « Résultat en cours de vérification », puis la mise est rendue après le délai de grâce', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#eclair', horloge: H0, direct: serveur(page, { retenir: [R0 + 1] }) });
  await page.evaluate(() => { S.me.fmode = 'free'; S.ui.fgame = 'btc'; render(false); });
  await jusqua(page, ME.t0(R0) + 9000);
  const avant = await lire(page, () => S.me.balance);
  await page.locator('[data-a="flash-bet"][data-v="oui"]:not([disabled])').first().click();
  expect(await lire(page, () => S.me.balance)).toBeCloseTo(avant - 10, 6);
  await jusqua(page, ME.t0(R0 + 1) + 30000);
  expect(await lire(page, () => ({ attente: S.reel.btc.result.attente, freel: S.me.freel.length }))).toEqual({ attente: true, freel: 1 });
  await expect(page.locator('[data-fx="my"]').first()).toContainText('Result being verified');
  // le délai de grâce (120 s) passe sans fixation : la manche est annulée, la mise rendue, rien n'est compté
  const regles = await lire(page, () => { window.__toasts = []; const t0 = toast; toast = o => { __toasts.push(o.title); return t0(o); }; return S.me.settled; });
  await jusqua(page, ME.t0(R0 + 1) + 150000);
  await expect.poll(() => lire(page, () => Math.round(S.me.balance * 100) / 100)).toBe(Math.round(avant * 100) / 100);
  expect(await lire(page, () => ({ settled: S.me.settled, freel: S.me.freel.length, notif: S.me.notifs[0].text }))).toEqual({ settled: regles, freel: 0, notif: `Flash Bitcoin, round ${R0.toLocaleString('en-US')}: cancelled, your $10.00 stake is refunded.` });
  expect(await lire(page, () => __toasts)).toContain('Round cancelled: stake refunded');
  expect(erreurs).toEqual([]);
});

test('vrai compte : la mise d’une manche réelle part avec « reel: true », celle d’un jeu simulé sans ; « jeu_en_pause » et « flash_rembourse » sont dits', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#eclair', horloge: H0 + 7000, direct: serveur(page), faux: { etat: { me: { balance: 200 } } } });
  await page.evaluate(() => { S.me.fmode = 'free'; S.ui.fgame = 'btc'; render(false); });
  expect(await lire(page, () => GA('btc').mode)).toBe('r');
  await page.locator('[data-a="flash-bet"][data-v="oui"]:not([disabled])').first().click();
  await expect.poll(() => lire(page, () => !!GA('btc').my)).toBe(true);
  await page.evaluate(() => { S.ui.fgame = 'gold'; render(false); });
  await page.locator('[data-a="flash-bet"][data-v="non"]:not([disabled])').first().click();
  await expect.poll(() => lire(page, () => !!G('gold').my)).toBe(true);
  const appels = await lire(page, () => __fakeSB.journal().filter(c => c.kind === 'fn' && c.name === 'eclair' && c.args.action === 'bet').map(c => ({ gid: c.args.gid, reel: c.args.reel })));
  expect(appels).toEqual([{ gid: 'btc', reel: true }, { gid: 'gold' }]);
  expect(await lire(page, () => ({ reel: GA('btc').my.reel, solde: S.me.balance }))).toEqual({ reel: 1, solde: 180 });
  // le serveur refuse : jeu en pause pour cette manche
  await page.evaluate(() => { window.__FAKE_SB__.fn = { eclair: 'jeu_en_pause' }; S.ui.fgame = 'eth'; render(false); });
  await page.locator('[data-a="flash-bet"][data-v="oui"]:not([disabled])').first().click();
  await expect(page.locator('.toast', { hasText: 'This game is paused for this round' }).first()).toBeVisible();
  expect(await lire(page, () => ({ my: GA('eth').my, solde: S.me.balance }))).toEqual({ my: null, solde: 180 });
  // une mise rendue par le serveur (manche annulée) : la notification et le message
  const n = await lire(page, () => notifDe({ id: 'x', ic: 'bolt', code: 'flash_rembourse', p: { g: 'btc', r: 36000, amt: 10, motif: 'fixation_absente' }, at: Date.now() }).text);
  expect(n).toBe('Flash Bitcoin, round 36,000: cancelled, your $10.00 stake is refunded.');
  expect(await lire(page, () => errTxt({ code: 'jeu_en_pause' }))).toMatch(/No live price for this game/);
  expect(erreurs).toEqual([]);
});
