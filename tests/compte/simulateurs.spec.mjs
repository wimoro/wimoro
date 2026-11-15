// B04 : en mode Compte, aucun simulateur du navigateur ne tourne. Sans message du serveur, rien ne bouge :
// ni prix, ni volume, ni chat, ni fausses demandes d'amis. En mode Démo, tout continue de vivre.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, debutManche } from '../helpers/app.mjs';

const MARCHES = ['btc150k', 'clasico', 'eth6000', 'presid27-roux', 'presid27-lefevre'].map((id, i) => ({ market_id: id, current_probability: 20 + i * 12, anchor_probability: 30 + i * 10, volume_total: 5e6 + i, participants_count: 1000 + i, liquidity_depth: 30000 }));
const photo = page => lire(page, () => ({
  prix: MARKETS.map(m => m.p), vol: MARKETS.map(m => m.vol), gens: MARKETS.map(m => m.people), ancres: MARKETS.map(m => m.anchor), liq: MARKETS.map(m => m.liq),
  // messages : hors annonces de fin de manche éclair (calculées à partir de l'heure, donc identiques chez tous les joueurs)
  messages: Object.values(S.rooms).reduce((n, r) => n + r.msgs.filter(x => x.k !== 'evt').length, 0), grosses: (S.bigs || []).length,
  amis: (S.me.freqIn || []).length, notifs: S.me.notifs.length, xp: S.me.xp, solde: S.me.balance, duels: (S.me.duels || []).length,
  local: localStorage.getItem('wimoro-markets'),
}));

test('B04 · mode Compte : 3 minutes sans message du serveur, rien ne change', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', faux: { marches: MARCHES }, horloge: debutManche() + 2000 });
  const avant = await photo(page);
  expect(avant.prix.slice(0, 2)).toEqual([20, 32]);                         // prix du serveur
  expect(avant.messages).toBe(0);                                           // aucun message inventé par le navigateur
  await page.clock.runFor(180000);
  const apres = await photo(page);
  expect(apres).toEqual(avant);
  expect(apres.local, 'les prix ne sont pas mémorisés localement').toBeNull();
  const plan = await lire(page, () => ({ lances: PLAN.filter(t => t.quand === 'tous').map(t => t.nom), eteints: PLAN.filter(t => (t.quand || 'local') === 'local').length, serveur: PLAN.filter(t => t.quand === 'serveur').map(t => t.nom) }));
  expect(plan.serveur).toEqual(['serveur : série', 'serveur : présence']);                 // l'horloge de la Série (affichage et demande de règlement), le signal de présence
  expect(plan.lances.length).toBeGreaterThanOrEqual(4);
  expect(plan.eteints).toBeGreaterThanOrEqual(15);
  expect(erreurs).toEqual([]);
});

test('B04 · le pari éclair, lui, continue d’avancer (moteur déterministe, affichage seulement)', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', faux: { marches: MARCHES }, hash: '#eclair', horloge: debutManche() + 2000 });
  const m0 = await lire(page, () => S.flash.round);
  await page.clock.runFor(46000);
  expect(await lire(page, () => S.flash.round)).toBe(m0 + 1);
});

test('mode Démo : les simulateurs tournent toujours (prix, chat, grosses mises)', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', horloge: debutManche() + 2000 });
  const avant = await photo(page);
  await page.clock.runFor(60000);
  const apres = await photo(page);
  expect(apres.prix).not.toEqual(avant.prix);
  expect(apres.messages).toBeGreaterThan(avant.messages);
  expect(apres.local).not.toBeNull();
});

test('en mode Compte, le site ne lit ni n’écrit plus rien tout seul : seulement un signal de présence toutes les 4 minutes', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', faux: { marches: MARCHES }, horloge: debutManche() + 2000 });
  await page.clock.runFor(1000);                                            // le temps de lire l'historique du salon affiché sur l'accueil
  const n0 = await lire(page, () => __fakeSB.calls.length);
  await page.clock.runFor(120000);                                          // B05, B19 : avant, 16 lectures et 14 écritures en 2 minutes
  const appels = await lire(page, n => __fakeSB.calls.slice(n).map(c => c.kind + ':' + c.name), n0);
  expect(appels).toEqual([]);
  await page.clock.runFor(8 * 60000);                                       // 10 minutes en tout : deux signaux de présence (avec le salon regardé), rien d'autre
  expect(await lire(page, n => __fakeSB.calls.slice(n).map(c => c.kind + ':' + c.name), n0)).toEqual(['rpc:api_present', 'rpc:api_chat_seen', 'rpc:api_present', 'rpc:api_chat_seen']);
  expect(await lire(page, () => __fakeSB.calls.filter(c => c.name === 'api_chat_seen').map(c => c.args.p_rooms))).toEqual([['general'], ['general']]);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); });
  await page.clock.runFor(10 * 60000);                                      // onglet caché : plus aucun signal
  expect(await lire(page, n => __fakeSB.calls.slice(n).length, n0)).toBe(4);
  const demarrage = await lire(page, n => __fakeSB.calls.slice(0, n).map(c => c.kind + ':' + c.name), n0);
  expect(demarrage.filter(c => c.startsWith('rpc:')).sort()).toEqual(['rpc:api_chat_history', 'rpc:api_markets', 'rpc:api_markets', 'rpc:api_state']);   // au démarrage : état, marchés, salon affiché, puis les marchés relus une fois l'abonnement au direct établi ; ensuite plus rien
  expect(demarrage.filter(c => c.startsWith('from:'))).toEqual([]);          // plus aucun accès direct aux tables
});
