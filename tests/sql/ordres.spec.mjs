// Ordres à cours limité, stop loss et take profit côté serveur : mêmes devis que js/engine.js, montant réservé,
// exécutions partielles, annulation, protection d'une position, et sort des ordres quand le marché est résolu.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

// le moteur du front, chargé tel quel
const ENGINE = vm.runInNewContext(fs.readFileSync('js/engine.js', 'utf8') + '\n;({ quoteBuy, quoteSell, quoteBuyCap, quoteSellCap, bestAsk, bestBid })', { module: undefined });

test.describe.configure({ mode: 'serial' });
let db, chef, alice, bob, carol;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000); carol = await creerJoueur(db, 'carol', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'admin')`, [chef]);
  await db.exec(`
    insert into public.markets (id, category, question, status) values ('petit', 'Sport', 'Petit marché ?', 'open'), ('petit2', 'Sport', 'Autre petit marché ?', 'open'), ('pluie', 'Météo', 'Pleuvra-t-il ?', 'open'), ('ferme', 'Sport', 'Fermé ?', 'closed');
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values
      ('petit', 50, 50, 10000, 10, 400), ('petit2', 50, 50, 10000, 10, 400), ('pluie', 25, 25, 1000000, 10, 6000), ('ferme', 50, 50, 1000000, 10, 6000);`);
});
test.afterAll(async () => { await db.close(); });

const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const placer = (qui, p) => api(qui, 'api_order_place($1::jsonb)', [JSON.stringify({ key: randomUUID(), ...p })]);
const non = (qui, p) => refus(db, qui, 'select public.api_order_place($1::jsonb)', [JSON.stringify({ key: randomUUID(), ...p })]);
const tick = async () => (await q(db, 'select wm.ordres_tick() as r'))[0].r;
const prix = (m, p) => q(db, 'update public.market_live_state set current_probability = $2 where market_id = $1', [m, p]);
const marche = async id => { const [l] = await q(db, 'select current_probability::float8 as p, volume_total::float8 as vol, liquidity_depth::float8 as liq from public.market_live_state where market_id = $1', [id]); return { ...l, cat: id === 'btc150k' ? 'Crypto' : id === 'pluie' ? 'Météo' : 'Sport' }; };
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, bets_placed as played, profit_realized::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const position = async (u, m, s) => (await q(db, 'select shares::float8 as sh, average_price::float8 as avg from public.positions where user_id = $1 and market_id = $2 and side = $3', [u, m, s]))[0] || { sh: 0, avg: 0 };
const ordre = async id => (await q(db, 'select etat, why, cash::float8 as cash, sh::float8 as sh, spent::float8 as spent, fee::float8 as fee, pro::float8 as pro, pnl::float8 as pnl, init::float8 as init from wm.ordres where id = $1', [id]))[0];
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));
const r2 = x => Math.round(x * 100) / 100, tronque = x => Math.trunc(x * 100 + 1e-9) / 100;

test('devis plafonnés, meilleure offre et meilleure demande : identiques au moteur du front sur 600 cas tirés au hasard', async () => {
  const cats = ['Crypto', 'Football', 'Tech et IA', 'Politique', 'Économie', 'Bourse'];
  const R = (() => { let a = 24680; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  let pire = 0, partiels = 0, rien = 0;
  const ecart = (a, b) => { pire = Math.max(pire, Math.abs(a - b) / Math.max(1, Math.abs(a))); };
  for (let i = 0; i < 300; i++) {
    const p = Math.round((1 + R() * 98) * 100) / 100, vol = Math.round(1e4 + R() * 6e6), liq = R() < 0.2 ? null : Math.round((400 + R() * 40000) * 100) / 100;
    const cat = cats[i % cats.length], disc = R() < 0.3, side = R() < 0.5 ? 'oui' : 'non', total = Math.round((1 + Math.pow(R(), 3) * 60000) * 100) / 100;
    const m = { p, vol, cat, liq: liq === null ? undefined : liq }, px = side === 'oui' ? p : 100 - p;
    const lp = Math.max(1, Math.min(99, Math.round(px + (R() - 0.4) * 12)));
    const js = ENGINE.quoteBuyCap(m, side, total, disc, lp / 100);
    const [sq] = await q(db, 'select * from wm.quote_buy_cap($1, wm.depth($2, $3), $4, $5, $6, $7, $8)', [p, vol, liq, cat, disc, side, total, lp / 100]);
    for (const [a, b] of [[js.sh, sq.sh], [js.a, sq.cost], [js.fee, sq.fee], [js.rest, sq.reste], [js.impact, sq.impact]]) ecart(a, b);
    if (js.sh > 0) ecart(js.avg, sq.avg * 100);
    if (js.partial) partiels++; if (!js.marketable) rien++;
    const sh = Math.round((0.5 + Math.pow(R(), 2) * 80000) * 100) / 100, lpv = Math.max(1, Math.min(99, Math.round(px + (R() - 0.6) * 12)));
    const jv = ENGINE.quoteSellCap(m, side, sh, lpv / 100);
    const [sv] = await q(db, 'select * from wm.quote_sell_cap($1, wm.depth($2, $3), $4, $5, $6)', [p, vol, liq, side, sh, lpv / 100]);
    for (const [a, b] of [[jv.sh, sv.sh], [jv.pro, sv.pro], [jv.rest, sv.reste], [jv.impact, sv.impact]]) ecart(a, b);
    const [bb] = await q(db, 'select wm.meilleure_offre($1, wm.depth($2, $3), $4) * 100 as ask, wm.meilleure_demande($1, wm.depth($2, $3), $4) * 100 as bid', [p, vol, liq, side]);
    ecart(ENGINE.bestAsk(m, side), bb.ask); ecart(ENGINE.bestBid(m, side), bb.bid);
  }
  expect(pire, 'écart relatif maximal entre le front et le serveur').toBeLessThan(1e-9);
  expect(partiels, 'des exécutions partielles ont bien été tirées').toBeGreaterThan(20);
  expect(rien, 'des ordres hors marché ont bien été tirés').toBeGreaterThan(20);
});

let ID_ACHAT;
test('achat limite : montant réservé, exécution immédiate sous le plafond, le reste attend ; la tâche de fond finit quand le prix revient', async () => {
  expect(await refus(db, null, `select public.api_order_place('{}'::jsonb)`)).toMatch(/permission denied/);
  const base = { m: 'petit', s: 'oui', k: 'buy', lp: 52, amt: 500 };
  expect(await non(alice, { ...base, s: 'peut-etre' })).toMatch(/cote_invalide/);
  expect(await non(alice, { ...base, k: 'stop' })).toMatch(/ordre_invalide/);
  for (const lp of [0, 100, 50.5, 'abc']) expect(await non(alice, { ...base, lp }), 'lp ' + lp).toMatch(/prix_invalide/);
  expect(await non(alice, { ...base, amt: 0.5 })).toMatch(/montant_min/);
  expect(await non(alice, { ...base, amt: 5000 })).toMatch(/solde_insuffisant/);
  expect(await non(alice, { ...base, m: 'inconnu' })).toMatch(/marche_inconnu/);
  expect(await non(alice, { ...base, m: 'ferme' })).toMatch(/marche_ferme/);
  expect(await non(alice, { ...base, key: '' })).toMatch(/cle_absente/);
  expect(await stats(alice)).toMatchObject({ balance: 1000, xp: 0, played: 0 });

  const m0 = await marche('petit');
  const att = ENGINE.quoteBuyCap(m0, 'oui', 500, false, 0.52);                                  // 500 parts jusqu'à 52 ¢, le reste attend
  expect(att.partial).toBe(true);
  const cle = randomUUID();
  const r = await placer(alice, { ...base, key: cle });
  ID_ACHAT = r.ordre.id;
  const depense = r2(att.a + att.fee);
  expect(r.ordre).toMatchObject({ m: 'petit', s: 'oui', k: 'buy', lp: 52, init: 500, status: 'open', spent: depense, cash: r2(500 - depense), fee: r2(att.fee) });
  expect(r.ordre.sh).toBeCloseTo(att.sh, 6);
  expect(r.fill).toMatchObject({ k: 'buy', done: false, total: depense });
  expect(r.fill.avg).toBeCloseTo(att.avg, 6);
  expect(r.me).toMatchObject({ balance: 500, played: 1, maxBet: 500, xp: 25 });                 // tout le montant est réservé ; 10 XP du pari + 15 du premier ordre limite
  expect(r.positions).toHaveLength(1); expect(r.positions[0].sh).toBeCloseTo(att.sh, 6); expect(r.positions[0].avg).toBeCloseTo(att.avg, 4);
  expect(r.orders.map(o => o.status)).toEqual(['open']);
  expect(r.marches.petit[0]).toBeCloseTo(m0.p + att.impact, 4);                                     // le prix a monté jusqu'au plafond
  expect(r.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toContain('ordre_place');
  expect((await placer(alice, { ...base, key: cle })).rejoue).toBe(true);                       // même clé : rien de plus
  expect(await stats(alice)).toMatchObject({ balance: 500, played: 1 });
  expect((await api(alice, 'api_state()')).orders).toMatchObject([{ id: ID_ACHAT, status: 'open' }]);
  expect(await q(db, `select amount::float8 as a, kind from public.balance_ledger where user_id = $1 order by id`, [alice])).toEqual([{ a: -500, kind: 'ordre' }]);

  expect(await tick()).toEqual({ ordres: 0, protections: 0 });                                  // au plafond : rien à exécuter
  await prix('petit', 48);                                                                      // le marché redescend
  const m1 = await marche('petit'), reste = r2(500 - depense);
  const att2 = ENGINE.quoteBuyCap(m1, 'oui', reste, false, 0.52);
  expect(att2.rest).toBe(0);
  expect(await tick()).toEqual({ ordres: 1, protections: 0 });
  const o = await ordre(ID_ACHAT);
  expect(o).toMatchObject({ etat: 'filled', cash: 0, spent: 500 });
  expect(o.sh).toBeCloseTo(att.sh + att2.sh, 5);
  expect((await position(alice, 'petit', 'oui')).sh).toBeCloseTo(att.sh + att2.sh, 5);
  expect(await stats(alice)).toMatchObject({ balance: 500, played: 1, xp: 25 });                // un seul pari compté, pas d'XP en double
  expect(await notifs(alice, 'ordre_execute')).toMatchObject([{ k: 'buy', done: true, m: 'petit', s: 'oui' }]);
  expect(await tick()).toEqual({ ordres: 0, protections: 0 });
});

test('un ordre loin du marché attend sans rien donner ; l’annuler rend la réserve ; moins de 0,50 $ restant : rendu', async () => {
  const r = await placer(bob, { m: 'btc150k', s: 'oui', k: 'buy', lp: 10, amt: 50 });
  expect(r.ordre).toMatchObject({ status: 'open', cash: 50, sh: 0, spent: 0 });
  expect(r.fill).toBeNull();
  expect(r.me).toMatchObject({ balance: 950, played: 0, xp: 15 });                              // seulement le bonus du premier ordre limite
  expect(await refus(db, alice, 'select public.api_order_cancel($1)', [r.ordre.id])).toMatch(/ordre_indisponible/);   // pas le sien
  const a = await api(bob, 'api_order_cancel($1)', [r.ordre.id]);
  expect(a.ordre).toMatchObject({ status: 'cancelled', why: 'user', cash: 0 });
  expect(a.me.balance).toBe(1000);
  expect(await refus(db, bob, 'select public.api_order_cancel($1)', [r.ordre.id])).toMatch(/ordre_indisponible/);     // une seule fois
  for (let i = 0; i < 3; i++) { const x = await placer(bob, { m: 'btc150k', s: 'oui', k: 'buy', lp: 10, amt: 50 }); await api(bob, 'api_order_cancel($1)', [x.ordre.id]); }
  expect(await stats(bob)).toMatchObject({ balance: 1000, xp: 15, played: 0 });                 // placer puis annuler ne rapporte rien

  const m0 = await marche('petit2'), cap = ENGINE.quoteBuyCap(m0, 'oui', 99999, false, 0.52);
  const depense = r2(cap.a + cap.fee);
  const d = await placer(bob, { m: 'petit2', s: 'oui', k: 'buy', lp: 52, amt: r2(depense + 0.3) });
  expect(d.ordre).toMatchObject({ status: 'filled', cash: 0, spent: depense });
  expect(d.me.balance).toBeCloseTo(1000 - depense, 2);                                          // les 0,30 $ sont revenus
  expect((await q(db, `select amount::float8 as a from public.balance_ledger where user_id = $1 and kind = 'ordre_rendu' order by id desc limit 1`, [bob]))[0].a).toBeCloseTo(0.3, 2);
});

test('vente limite : exécutée au-dessus du prix minimum, par morceaux ; annulée si les parts ont été vendues entre-temps', async () => {
  expect(await non(carol, { m: 'petit', s: 'oui', k: 'sell', lp: 60, sh: 10 })).toMatch(/position_absente/);
  expect(await non(alice, { m: 'petit', s: 'oui', k: 'sell', lp: 60, sh: 0.01 })).toMatch(/quantite_invalide/);
  const p0 = await position(alice, 'petit', 'oui'), s0 = await stats(alice);
  const r = await placer(alice, { m: 'petit', s: 'oui', k: 'sell', lp: 60, sh: 100 });
  expect(r.ordre).toMatchObject({ k: 'sell', status: 'open', init: 100, sh: 100, pro: 0 });
  expect(r.fill).toBeNull();
  expect(r.me.balance).toBe(s0.balance);
  await prix('petit', 62);
  const att = ENGINE.quoteSellCap(await marche('petit'), 'oui', 100, 0.60);
  expect(att.rest).toBe(0);
  expect(await tick()).toEqual({ ordres: 1, protections: 0 });
  const pro = tronque(att.pro), pnl = r2(pro - r2(100 * p0.avg / 100));
  expect(await ordre(r.ordre.id)).toMatchObject({ etat: 'filled', sh: 0, pro, pnl });
  expect((await stats(alice)).balance).toBeCloseTo(s0.balance + pro, 2);
  expect((await position(alice, 'petit', 'oui')).sh).toBeCloseTo(p0.sh - 100, 5);
  expect((await q(db, `select kind, question, side, pnl::float8 as pnl from public.position_history where user_id = $1 order by settled_at desc limit 1`, [alice]))[0]).toEqual({ kind: 'sell', question: 'via|limit', side: 'oui', pnl });
  expect((await notifs(alice, 'ordre_execute')).pop()).toMatchObject({ k: 'sell', done: true, pnl });

  // tout le reste à 60 ¢ minimum : le carnet n'en prend qu'une partie tout de suite, puis une partie à chaque passage
  const p1 = await position(alice, 'petit', 'oui');
  const att0 = ENGINE.quoteSellCap(await marche('petit'), 'oui', p1.sh, 0.60);
  expect(att0.partial).toBe(true);
  const g = await placer(alice, { m: 'petit', s: 'oui', k: 'sell', lp: 60, sh: 99999 });        // plafonné à ce qu'elle détient
  expect(g.ordre.init).toBeCloseTo(p1.sh, 5);
  expect(g.fill).toMatchObject({ k: 'sell', done: false }); expect(g.fill.sh).toBeCloseTo(att0.sh, 5);
  expect(g.fill.hist).toMatchObject({ k: 'sell', m: 'petit', q: 'via|limit', s: 'oui' });
  expect(g.ordre).toMatchObject({ status: 'open', pro: tronque(att0.pro) }); expect(g.ordre.sh).toBeCloseTo(p1.sh - att0.sh, 5);
  const avant = (await notifs(alice, 'ordre_execute')).length, envois = async () => (await q(db, `select count(*)::int as n from realtime.messages where event = 'maj' and topic = $1`, ['joueur:' + alice]))[0].n;
  expect(await envois()).toBe(0);
  await prix('petit', 61);
  const att1 = ENGINE.quoteSellCap(await marche('petit'), 'oui', p1.sh - att0.sh, 0.60);
  expect(att1.partial).toBe(true);
  expect(await tick()).toEqual({ ordres: 1, protections: 0 });
  expect((await ordre(g.ordre.id)).etat).toBe('open');
  expect((await ordre(g.ordre.id)).sh).toBeCloseTo(p1.sh - att0.sh - att1.sh, 5);
  await prix('petit', 61);
  expect(await tick()).toEqual({ ordres: 1, protections: 0 });
  expect((await ordre(g.ordre.id)).sh).toBeCloseTo(p1.sh - att0.sh - 2 * att1.sh, 4);
  expect((await notifs(alice, 'ordre_execute')).length, 'pas de notification à chaque morceau').toBe(avant);
  expect(await envois(), 'mais l’écran du joueur est prévenu à chaque morceau').toBe(2);

  const p2 = await position(alice, 'petit', 'oui');                                             // elle vend tout au marché : l'ordre n'a plus d'objet
  await api(alice, 'api_sell($1, $2, $3, $4)', ['petit', 'oui', p2.sh, randomUUID()]);
  expect(await tick()).toEqual({ ordres: 1, protections: 0 });
  expect(await ordre(g.ordre.id)).toMatchObject({ etat: 'cancelled', why: 'noshares' });
  expect((await notifs(alice, 'ordre_annule')).pop()).toMatchObject({ k: 'sell', why: 'noshares', m: 'petit' });
});

test('stop loss et take profit : seuils vérifiés, vente de toute la position au marché quand la meilleure demande passe le seuil', async () => {
  const garde = (qui, p) => api(qui, 'api_guard_set($1::jsonb)', [JSON.stringify(p)]);
  const gnon = (qui, p) => refus(db, qui, 'select public.api_guard_set($1::jsonb)', [JSON.stringify(p)]);
  expect(await gnon(carol, { m: 'btc150k', s: 'oui', stop: 60 })).toMatch(/position_absente/);
  await api(carol, 'api_buy($1, $2, $3, $4)', ['btc150k', 'oui', 100, randomUUID()]);            // prix : un peu au-dessus de 63 ¢
  expect(await gnon(carol, { m: 'btc150k', s: 'oui' })).toMatch(/seuil_absent/);
  expect(await gnon(carol, { m: 'btc150k', s: 'oui', stop: 64 })).toMatch(/stop_invalide/);       // doit être sous le prix
  expect(await gnon(carol, { m: 'btc150k', s: 'oui', tp: 63 })).toMatch(/tp_invalide/);           // doit être au-dessus du prix
  expect(await gnon(carol, { m: 'btc150k', s: 'oui', stop: 12.5 })).toMatch(/prix_invalide/);
  expect(await gnon(carol, { m: 'btc150k', s: 'non', stop: 20 })).toMatch(/position_absente/);
  const r = await garde(carol, { m: 'btc150k', s: 'oui', stop: 60, tp: 70 });
  expect(r.guards).toMatchObject([{ m: 'btc150k', s: 'oui', stop: 60, tp: 70 }]);
  expect((await garde(carol, { m: 'btc150k', s: 'oui', stop: 61, tp: 0 })).guards).toMatchObject([{ stop: 61, tp: 0 }]);   // modifier remplace
  expect((await api(carol, 'api_state()')).guards).toMatchObject([{ m: 'btc150k', s: 'oui', stop: 61, tp: 0 }]);
  expect(await tick()).toEqual({ ordres: 0, protections: 0 });

  const p0 = await position(carol, 'btc150k', 'oui'), s0 = await stats(carol);
  await prix('btc150k', 61.05);                                                                  // meilleure demande : 60,95 ¢, sous le stop
  const att = ENGINE.quoteSell(await marche('btc150k'), 'oui', p0.sh);
  expect(await tick()).toEqual({ ordres: 0, protections: 1 });
  const pro = tronque(att.pro), pnl = r2(pro - r2(p0.sh * p0.avg / 100));
  expect((await position(carol, 'btc150k', 'oui')).sh).toBe(0);
  expect((await stats(carol)).balance).toBeCloseTo(s0.balance + pro, 2);
  expect((await q(db, 'select count(*)::int as n from wm.protections where user_id = $1', [carol]))[0].n).toBe(0);
  expect((await q(db, `select question, was_winner as win, pnl::float8 as pnl from public.position_history where user_id = $1 order by settled_at desc limit 1`, [carol]))[0]).toEqual({ question: 'via|stop', win: false, pnl });
  expect(await notifs(carol, 'protection')).toMatchObject([{ k: 'stop', m: 'btc150k', s: 'oui', pnl }]);

  await api(carol, 'api_buy($1, $2, $3, $4)', ['btc150k', 'oui', 100, randomUUID()]);            // nouveau pari, take profit seul
  await garde(carol, { m: 'btc150k', s: 'oui', tp: 63 });
  await prix('btc150k', 62.9); expect(await tick()).toEqual({ ordres: 0, protections: 0 });       // demande à 62,8 ¢ : pas encore
  await prix('btc150k', 63.2); expect(await tick()).toEqual({ ordres: 0, protections: 1 });       // demande à 63,1 ¢ : vendu
  expect((await notifs(carol, 'protection')).pop()).toMatchObject({ k: 'tp' });
  expect((await q(db, `select question, was_winner as win from public.position_history where user_id = $1 order by settled_at desc limit 1`, [carol]))[0]).toEqual({ question: 'via|tp', win: true });

  await api(carol, 'api_buy($1, $2, $3, $4)', ['btc150k', 'oui', 100, randomUUID()]);            // retirer une protection ; protection orpheline après une vente au marché
  await garde(carol, { m: 'btc150k', s: 'oui', stop: 40 });
  expect((await api(carol, 'api_guard_del($1, $2)', ['btc150k', 'oui'])).guards).toEqual([]);
  await garde(carol, { m: 'btc150k', s: 'oui', stop: 40 });
  await api(carol, 'api_sell($1, $2, $3, $4)', ['btc150k', 'oui', (await position(carol, 'btc150k', 'oui')).sh, randomUUID()]);
  expect(await tick()).toEqual({ ordres: 0, protections: 1 });
  expect((await api(carol, 'api_state()')).guards).toEqual([]);
});

test('marché résolu : les ordres en attente sont annulés, les réserves rendues, les protections retirées', async () => {
  const s0 = await stats(bob);
  const o = await placer(bob, { m: 'pluie', s: 'oui', k: 'buy', lp: 5, amt: 40 });               // loin du marché : attend
  await api(bob, 'api_buy($1, $2, $3, $4)', ['pluie', 'non', 20, randomUUID()]);
  await api(bob, 'api_guard_set($1::jsonb)', [JSON.stringify({ m: 'pluie', s: 'non', stop: 50 })]);
  expect((await stats(bob)).balance).toBeCloseTo(s0.balance - 60, 2);
  await enTantQue(db, chef, s => s(`select public.api_admin('resoudre', $1::jsonb)`, [JSON.stringify({ id: 'pluie', issue: 'oui' })]));
  expect(await ordre(o.ordre.id)).toMatchObject({ etat: 'cancelled', why: 'closed', cash: 0 });
  expect((await stats(bob)).balance).toBeCloseTo(s0.balance - 20, 2);                            // réserve rendue ; le pari Non est perdu
  expect((await q(db, `select count(*)::int as n from wm.protections where market_id = 'pluie'`))[0].n).toBe(0);
  expect((await notifs(bob, 'ordre_annule')).pop()).toMatchObject({ k: 'buy', why: 'closed', m: 'pluie', rendu: 40 });
  expect(await non(bob, { m: 'pluie', s: 'oui', k: 'buy', lp: 5, amt: 40 })).toMatch(/marche_ferme/);
  expect(await tick()).toEqual({ ordres: 0, protections: 0 });
});

test('fermeture : tables et fonctions internes inaccessibles aux joueurs ; 50 ordres en attente au plus ; tâche planifiée', async () => {
  for (const t of ['wm.ordres', 'wm.protections']) expect(await refus(db, alice, `select * from ${t}`), t).toMatch(/permission denied/);
  for (const f of ['wm.ordres_tick()', 'wm.ordre_remplir(1)', `wm.ordre_clore(1, 'user')`, `wm.ordres_marche('petit')`, `wm.protection_verifier('${alice}', 'petit', 'oui')`,
    `wm.vente_ecrire('${alice}', 'petit', 'oui', 1, 1, 1, 'limit')`]) expect(await refus(db, alice, `select ${f}`), f).toMatch(/permission denied/);
  for (const f of [`public.api_order_cancel(1)`, `public.api_guard_set('{}'::jsonb)`, `public.api_guard_del('petit', 'oui')`]) expect(await refus(db, null, `select ${f}`), f).toMatch(/permission denied/);
  expect(await q(db, `select schedule, command from cron.job where jobname = 'wm-ordres'`)).toEqual([{ schedule: '3 seconds', command: 'select wm.ordres_tick()' }]);
  for (let i = 0; i < 50; i++) await placer(carol, { m: 'btc150k', s: 'oui', k: 'buy', lp: 1, amt: 1 });
  expect(await non(carol, { m: 'btc150k', s: 'oui', k: 'buy', lp: 1, amt: 1 })).toMatch(/trop_ordres/);
  expect((await api(carol, 'api_state()')).orders.filter(o => o.status === 'open')).toHaveLength(50);
});
