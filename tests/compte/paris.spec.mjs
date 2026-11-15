// Paris en mode Compte : acheter et vendre passent par le serveur, qui fait l'écriture comptable ; l'écran affiche
// ce que le serveur a réellement exécuté ; les prix, volumes et signaux arrivent par ses diffusions.
// Couvre B07 (pari annulé au rechargement), B16 (issues multiples rééquilibrées deux fois), K20-K25 côté écran,
// et la recette 3 (parier) et 9 (bots) avec le faux serveur ; tests/e2e/paris.spec.mjs fait la même chose sur le vrai.
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

const BTC = { market_id: 'btc150k', current_probability: 60, anchor_probability: 60, volume_total: 5e6, participants_count: 1200, liquidity_depth: 30000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const photo = page => lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, joues: S.me.played, pos: S.me.positions.map(p => ({ ...p })), hist: S.me.history.length, prix: MK.btc150k.p, vol: MK.btc150k.vol }));
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const acheter = async (page, montant) => {
  if (montant != null) await page.locator('[data-tamt="page"]').fill(String(montant));
  await page.locator('[data-ticket="page"] [data-a="buy"]').click();
};

test('B07 · acheter : le serveur débite et crée la position, l’écran affiche ce qui a été exécuté, et tout survit au rechargement', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } } } });
  const a = await photo(page);
  expect(a).toMatchObject({ solde: 500, pos: [], prix: 60 });
  await acheter(page, 50);
  await expect(toast(page, 'Bet placed')).toBeVisible();
  const b = await photo(page);
  const srv = await lire(page, () => ({ etat: __fakeSB.etat(), marche: __fakeSB.marche('btc150k') }));

  // un seul appel, avec le montant, le côté et une clé d'idempotence
  const envois = await appels(page, 'api_buy');
  expect(envois).toHaveLength(1);
  expect(envois[0]).toMatchObject({ p_market: 'btc150k', p_side: 'oui', p_total: 50 });
  expect(envois[0].p_key).toMatch(UUID);

  // l'écran est le reflet du serveur : solde, position, XP, compteur, prix
  expect(b.solde).toBe(450); expect(srv.etat.me.balance).toBe(450);
  expect(b.pos).toHaveLength(1);
  expect(b.pos[0]).toMatchObject({ m: 'btc150k', s: 'oui' });
  expect(b.pos[0].sh).toBeCloseTo(srv.etat.positions[0].sh, 8);
  expect(b.pos[0].sh).toBeGreaterThan(70); expect(b.pos[0].sh).toBeLessThan(85);              // 50 $ à environ 61 ¢, frais compris
  expect(b.xp).toBe(a.xp + 10); expect(b.joues).toBe(a.joues + 1);
  expect(b.prix).toBe(srv.marche.p); expect(b.prix).toBeGreaterThan(60);
  await expect(page.locator('[data-bal-plain]').first()).toContainText('450');
  // la notification vient du serveur (un code), traduite à l'écran
  expect(await lire(page, () => S.me.notifs[0].text)).toMatch(/^Bet placed: \$50(\.00)? on Yes, /);
  expect(await lire(page, () => S.me.badges)).toContain('first');

  // rechargement : rien ne s'annule (avant, le pari disparaissait)
  await page.reload(); await pret(page);
  const c = await photo(page);
  expect(c.solde).toBe(450); expect(c.pos).toEqual(b.pos); expect(c.xp).toBe(b.xp); expect(c.prix).toBe(b.prix);
  expect(await appels(page, 'api_buy')).toHaveLength(1);
  expect(erreurs).toEqual([]);
});

test('le serveur décide : si le prix a bougé entre l’aperçu et l’ordre, c’est son résultat qui est affiché', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } } } });
  const apercu = await lire(page, () => quoteBuy(MK.btc150k, 'oui', 50, false).sh);
  await page.evaluate(() => { __fakeSB.marche('btc150k').p = 75; __fakeSB.persist(); });      // d'autres joueurs ont acheté entre-temps, le tick n'est pas encore arrivé
  await acheter(page, 50);
  await expect(toast(page, 'Bet placed')).toBeVisible();
  const b = await photo(page);
  expect(b.pos[0].sh).toBeLessThan(apercu * 0.85);                                           // moins de parts qu'annoncé : le prix était plus haut
  expect(b.pos[0].avg).toBeGreaterThan(75);
  expect(b.prix).toBeGreaterThan(75);                                                        // le prix affiché est celui du serveur
  await expect(toast(page, 'Bet placed')).toContainText(await lire(page, () => F.d2(S.me.positions[0].sh)));
  expect(erreurs).toEqual([]);
});

test('double clic ou réseau lent : un seul pari part, et le bouton est grisé en attendant', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } }, latence: 250 } });
  await page.locator('[data-tamt="page"]').fill('20');
  const bouton = page.locator('[data-ticket="page"] [data-a="buy"]');
  await page.evaluate(() => { const b = document.querySelector('[data-ticket="page"] [data-a="buy"]'); b.click(); b.click(); b.click(); });
  await expect(bouton).toBeDisabled();
  await expect(toast(page, 'Bet placed')).toBeVisible();
  await expect(bouton).toBeEnabled();
  expect(await appels(page, 'api_buy')).toHaveLength(1);
  expect((await photo(page)).solde).toBe(480);
  // deux paris successifs : deux clés différentes
  await acheter(page, 20);
  await expect.poll(async () => (await appels(page, 'api_buy')).length).toBe(2);
  const cles = (await appels(page, 'api_buy')).map(a => a.p_key);
  expect(new Set(cles).size).toBe(2);
  await expect.poll(async () => (await photo(page)).solde).toBe(460);
});

test('une requête rejouée avec la même clé n’est appliquée qu’une fois', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', faux: { marches: [BTC], etat: { me: { balance: 500 } } } });
  const r = await page.evaluate(async () => {
    const args = { p_market: 'btc150k', p_side: 'non', p_total: 30, p_key: '6f1c2a34-0000-4000-8000-000000000001', p_opts: {} };
    const a = await API.call('api_buy', args), b = await API.call('api_buy', args);
    return { a: a.me.balance, b: b.me.balance, rejoue: [!!a.rejoue, !!b.rejoue], parts: [a.pos.sh, b.pos.sh], solde: __fakeSB.etat().me.balance };
  });
  expect(r).toMatchObject({ a: 470, b: 470, rejoue: [false, true], solde: 470 });
  expect(r.parts[0]).toBe(r.parts[1]);
});

for (const [code, texte] of [['solde_insuffisant', 'Insufficient balance'], ['liquidite', 'Not enough liquidity'], ['marche_ferme', 'This market is closed']]) {
  test(`refus du serveur (${code}) : message clair, rien ne change, on peut réessayer`, async ({ page }) => {
    const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } }, rpc: { api_buy: { error: { message: code, code: 'P0001' } } } } });
    const a = await photo(page);
    await acheter(page, 50);
    await expect(page.locator('.toast').first()).toContainText('Action failed');
    await expect(page.locator('.toast').first()).toContainText(texte);
    expect(await photo(page)).toEqual(a);
    await expect(page.locator('[data-ticket="page"] [data-a="buy"]')).toBeEnabled();
    expect(erreurs).toEqual([]);
  });
}

test('panne de réseau pendant un pari : message clair, aucun débit affiché', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { me: { balance: 500 } } } });
  const a = await photo(page);
  await page.evaluate(() => { window.__FAKE_SB__.horsLigne = true; });
  await acheter(page, 50);
  await expect(page.locator('.toast').first()).toContainText('Can\'t reach the server');
  expect(await photo(page)).toEqual(a);
});

test('vendre : le serveur crédite, la position disparaît, l’historique s’allonge, et tout survit au rechargement', async ({ page }) => {
  const etat = { me: { balance: 100 }, positions: [{ m: 'btc150k', s: 'oui', sh: 80, avg: 50 }] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat } });
  await page.locator('[data-ticket="page"] [data-a="tmode"][data-v="sell"]').click();
  await expect(page.locator('[data-tamt="page"]')).toHaveValue('80');
  await page.locator('[data-ticket="page"] [data-a="sell"]').click();
  await expect(toast(page, 'Sold with')).toBeVisible();
  const b = await photo(page);
  const envois = await appels(page, 'api_sell');
  expect(envois).toHaveLength(1);
  expect(envois[0]).toMatchObject({ p_market: 'btc150k', p_side: 'oui', p_shares: 80 });
  expect(envois[0].p_key).toMatch(UUID);
  const srv = await lire(page, () => __fakeSB.etat());
  expect(b.pos).toEqual([]); expect(srv.positions).toEqual([]);
  expect(b.solde).toBe(srv.me.balance);
  expect(b.solde).toBeGreaterThan(100 + 80 * 0.58); expect(b.solde).toBeLessThan(100 + 80 * 0.60);   // vendu un peu sous 60 ¢ (écart et impact)
  expect(b.hist).toBe(1);
  expect(await lire(page, () => S.me.history[0])).toMatchObject({ k: 'sell', m: 'btc150k', s: 'oui', win: true });
  expect(b.prix).toBeLessThan(60); expect(b.prix).toBe(await lire(page, () => __fakeSB.marche('btc150k').p));
  await page.reload(); await pret(page);
  const c = await photo(page);
  expect(c.solde).toBe(b.solde); expect(c.pos).toEqual([]); expect(c.hist).toBe(1);
  expect(erreurs).toEqual([]);
});

test('vendre une partie : le reste de la position est celui du serveur', async ({ page }) => {
  const etat = { me: { balance: 100 }, positions: [{ m: 'btc150k', s: 'non', sh: 60, avg: 45 }] };
  await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat } });
  await page.locator('[data-ticket="page"] [data-a="tmode"][data-v="sell"]').click();
  await page.locator('[data-ticket="page"] [data-a="preset"][data-v="0.25"]').click();
  await page.locator('[data-ticket="page"] [data-a="sell"]').click();
  await expect(toast(page, 'Sold with')).toBeVisible();
  const b = await photo(page);
  expect(b.pos).toEqual([{ m: 'btc150k', s: 'non', sh: 45, avg: 45 }]);
  expect(b.prix).toBeGreaterThan(60);                                                        // vendre du Non fait monter le Oui
});

test('B16 · marché à plusieurs issues : les issues sœurs viennent du serveur et totalisent 100 %, sans second calcul dans le navigateur', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-presid27', faux: { etat: { me: { balance: 5000 } } } });
  const groupe = () => lire(page, () => Object.fromEntries(GK.presid27.outcomes.map(o => [o.id, o.p])));
  const somme = g => Object.values(g).reduce((n, x) => n + x, 0);
  const g0 = await groupe();
  expect(somme(g0)).toBeCloseTo(100, 6);
  const r = await page.evaluate(async () => {
    S.ui.ticket.m = 'presid27-roux'; S.ui.ticket.side = 'oui'; S.ui.ticket.mode = 'buy'; S.ui.ticket.amt = '2000';
    placeBet('page', null);
    await new Promise(ok => { const t = setInterval(() => { if (S.me.positions.length) { clearInterval(t); ok(); } }, 20); });
    return { serveur: Object.fromEntries(GK.presid27.outcomes.map(o => [o.id, __fakeSB.marche(o.id).p])) };
  });
  const g1 = await groupe();
  expect(g1).toEqual(r.serveur);                                                            // exactement les valeurs du serveur
  expect(somme(g1)).toBeCloseTo(100, 6);
  expect(g1['presid27-roux']).toBeGreaterThan(g0['presid27-roux'] + 0.01);
  for (const id in g1) if (id !== 'presid27-roux') expect(g1[id], id).toBeLessThanOrEqual(g0[id]);
  // l'écran du groupe affiche bien 100 %
  await expect(page.locator('[data-gsum="presid27"]').first()).toHaveText(/100/);
  expect(erreurs).toEqual([]);
});

test('K20-K25 · diffusions du serveur : prix, volume, profondeur, traînée et signal de foule arrivent sans aucun appel', async ({ page }) => {
  // réglage « toutes les notifications » : par défaut (« importantes seulement »), un signal de foule n'affiche pas de bandeau, comme en mode Démo
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [BTC], etat: { prefs: { tmode: 'all' } } } });
  expect(await lire(page, () => __fakeSB.sujets())).toEqual(['marches']);                   // un seul abonnement, public
  const n0 = await lire(page, () => __fakeSB.calls.length);
  const a = await lire(page, () => ({ mises: MK.btc150k.bets.length, points: MK.btc150k.ph.length, messages: room('general').msgs.length }));
  const recus = await page.evaluate(() => __fakeSB.emit('marches', 'tick', {
    t: Date.now(), m: { btc150k: [64.25, 5012345, 1207, 30010], 'marche-inconnu': [50, 1, 1, 400] }, b: [['btc150k', 1, 0.4], ['btc150k', -1, 0.1], ['marche-inconnu', 1, 0.2]],
    sig: { m: 'btc150k', s: 'oui', n: 57, mins: 5, from: 60, to: 64 } }));
  expect(recus).toBe(1);
  const b = await lire(page, () => ({ p: MK.btc150k.p, vol: MK.btc150k.vol, gens: MK.btc150k.people, liq: MK.btc150k.liq, mises: MK.btc150k.bets.length, points: MK.btc150k.ph.length, chaud: MK.btc150k.hotUntil > Date.now(),
    signal: room('general').msgs.filter(x => x.k === 'sig').map(x => x.sig), signalMarche: room('m:btc150k').msgs.filter(x => x.k === 'sig').length }));
  expect(b).toMatchObject({ p: 64.25, vol: 5012345, gens: 1207, liq: 30010, chaud: true, signalMarche: 1 });
  expect(b.signal).toEqual([{ m: 'btc150k', s: 'oui', n: 57, mins: 5, from: 60, to: 64 }]);
  expect(b.mises).toBe(a.mises + 2 + 12);                                                    // 2 mises de bots + la traînée de la rafale
  expect(b.points).toBe(Math.min(160, a.points + 1));
  await expect(page.locator('[data-mc="btc150k"]').first()).toContainText('64');
  await expect(toast(page, 'Crowd signal')).toBeVisible();
  // un tick qui ne change que la profondeur n'ajoute pas de point à la courbe
  await page.evaluate(() => __fakeSB.emit('marches', 'tick', { t: Date.now(), m: { btc150k: [64.25, 5012345, 1207, 30500] }, b: [] }));
  expect(await lire(page, () => ({ liq: MK.btc150k.liq, points: MK.btc150k.ph.length }))).toEqual({ liq: 30500, points: b.points });
  expect(await lire(page, n => __fakeSB.calls.slice(n).map(c => c.name), n0), 'aucun appel au serveur').toEqual([]);
  expect(erreurs).toEqual([]);
});

test('K21 · un tick sur un marché à plusieurs issues est appliqué tel quel (pas de rééquilibrage local)', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#marche-presid27' });
  const ids = await lire(page, () => GK.presid27.outcomes.map(o => o.id));
  const cible = Object.fromEntries(ids.map((id, i) => [id, [i === 0 ? 100 - (ids.length - 1) * 7.5 : 7.5, 1e6 + i, 100 + i, 6000]]));
  await page.evaluate(m => __fakeSB.emit('marches', 'tick', { t: Date.now(), m, b: [] }), cible);
  const lu = await lire(page, () => Object.fromEntries(GK.presid27.outcomes.map(o => [o.id, o.p])));
  expect(lu).toEqual(Object.fromEntries(ids.map(id => [id, cible[id][0]])));
});

test('mode Démo : parier reste local et immédiat (aucun appel au serveur)', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#marche-btc150k' });
  const s0 = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.length }));
  await page.locator('[data-tamt="page"]').fill('50');
  await page.locator('[data-ticket="page"] [data-a="buy"]').click();
  const s1 = await lire(page, () => ({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions.length, appels: typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'rpc').length }));
  expect(s1.solde).toBeCloseTo(s0.solde - 50, 6); expect(s1.xp).toBe(s0.xp + 10); expect(s1.appels).toBe(0);
  await page.locator('[data-ticket="page"] [data-a="tmode"][data-v="sell"]').click();
  await page.locator('[data-ticket="page"] [data-a="sell"]').click();
  expect(await lire(page, () => S.me.balance)).toBeGreaterThan(s1.solde);
  expect(erreurs).toEqual([]);
});
