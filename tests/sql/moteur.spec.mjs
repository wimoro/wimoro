// Moteur de marché côté serveur : même résultat que js/engine.js, achat et vente atomiques, clé d'idempotence,
// invariants d'argent, issues multiples à 100 %. Couvre B15, B16, K21, K40, K41, K49.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

// le moteur du front, chargé tel quel
const ENGINE = vm.runInNewContext(fs.readFileSync('js/engine.js', 'utf8') + '\n;({ quoteBuy, quoteSell, bookDepth, wmRate, ENG })', { module: undefined });

let db, alice, bob;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  await db.exec(`
    insert into public.market_groups (id, category, question) values ('g', 'Politique', 'Qui gagnera ?');
    insert into public.markets (id, category, question, status, group_parent_id) values
      ('g-a', 'Politique', 'A ?', 'open', 'g'), ('g-b', 'Politique', 'B ?', 'open', 'g'), ('g-c', 'Politique', 'C ?', 'open', 'g'), ('ferme', 'Sport', 'Fermé ?', 'resolved', null);
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values
      ('g-a', 50, 50, 2000000, 10, 12000), ('g-b', 30, 30, 1500000, 10, 9000), ('g-c', 20, 20, 1000000, 10, 6000), ('ferme', 40, 40, 100000, 1, 600);`);
  alice = await creerJoueur(db, 'alice', 10000); bob = await creerJoueur(db, 'bob', 10000);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select ${sql} as r`, params)))[0].r;
const marche = async id => (await q(db, 'select current_probability::float8 as p, volume_total::float8 as vol, liquidity_depth::float8 as liq, anchor_probability::float8 as anchor, participants_count as people, open_yes::float8 as oy, open_no::float8 as onn, mm_cash::float8 as cash, fees::float8 as fees from public.market_live_state where market_id = $1', [id]))[0];
const solde = async id => Number((await q(db, 'select balance from public.user_stats where user_id = $1', [id]))[0].balance);

test('devis d’achat et de vente : identiques au moteur du front sur 600 cas tirés au hasard', async () => {
  const cats = ['Crypto', 'Football', 'Tech et IA', 'Politique', 'Économie', 'Bourse'];
  const R = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  let pire = 0;
  for (let i = 0; i < 300; i++) {
    const p = Math.round((1 + R() * 98) * 100) / 100, vol = Math.round(1e4 + R() * 6e6), liq = R() < 0.2 ? null : Math.round((400 + R() * 40000) * 100) / 100;
    const cat = cats[i % cats.length], disc = R() < 0.3, side = R() < 0.5 ? 'oui' : 'non', total = Math.round((1 + Math.pow(R(), 3) * 60000) * 100) / 100;
    const m = { p, vol, cat, liq: liq === null ? undefined : liq };
    const js = ENGINE.quoteBuy(m, side, total, disc);
    const [sq] = await q(db, 'select * from wm.quote_buy($1, wm.depth($2, $3), $4, $5, $6, $7)', [p, vol, liq, cat, disc, side, total]);
    for (const [a, b] of [[js.sh, sq.sh], [js.a, sq.cost], [js.fee, sq.fee], [js.avg, sq.avg * 100], [js.impact, sq.impact], [js.maxTotal, sq.max_total]]) pire = Math.max(pire, Math.abs(a - b) / Math.max(1, Math.abs(a)));
    expect(sq.complet, `achat complet ? p=${p} total=${total}`).toBe(js.full);
    const sh = Math.round((0.5 + Math.pow(R(), 2) * 80000) * 100) / 100;
    const jv = ENGINE.quoteSell(m, side, sh);
    const [sv] = await q(db, 'select * from wm.quote_sell($1, wm.depth($2, $3), $4, $5)', [p, vol, liq, side, sh]);
    for (const [a, b] of [[jv.sh, sv.sh], [jv.pro, sv.pro], [jv.avg, sv.avg * 100], [jv.impact, sv.impact]]) pire = Math.max(pire, Math.abs(a - b) / Math.max(1, Math.abs(a)));
    expect(sv.complet).toBe(jv.full);
  }
  expect(pire, 'écart relatif maximal entre le front et le serveur').toBeLessThan(1e-9);
});

test('B15 · achat : débit exact, position, prix, effets (XP, notification, badge) dans une seule réponse', async () => {
  const m0 = await marche('btc150k');
  const attendu = ENGINE.quoteBuy({ p: m0.p, vol: m0.vol, liq: m0.liq, cat: 'Crypto' }, 'oui', 600, false);
  const r = await api(alice, `public.api_buy('btc150k', 'oui', 600, $1)`, [randomUUID()]);
  expect(r.me.balance).toBe(9400);
  expect(r.q.sh).toBeCloseTo(attendu.sh, 6);                                       // aperçu du front = exécution du serveur
  expect(r.q.avg).toBeCloseTo(attendu.avg, 6);
  expect(r.q.fee).toBeCloseTo(attendu.fee, 2);
  expect(r.pos).toMatchObject({ m: 'btc150k', s: 'oui' });
  expect(r.pos.sh).toBeCloseTo(attendu.sh, 6);
  expect(r.me).toMatchObject({ played: 1, maxBet: 600, xp: 10 });
  expect(r.ev.map(e => e.k)).toEqual(['xp', 'badge', 'notif', 'badge', 'notif', 'notif']);   // +10 XP, badges « Premier pari » et « Grosse mise », pari placé
  expect(r.ev.filter(e => e.k === 'badge').map(e => e.id)).toEqual(['first', 'whale']);
  expect(r.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toEqual(['badge', 'badge', 'bet_placed']);
  const m1 = await marche('btc150k');
  expect(m1.p).toBeCloseTo(Math.round((m0.p + attendu.impact) * 100) / 100, 2);     // le prix monte de l'impact de l'ordre
  expect(m1.vol).toBeCloseTo(m0.vol + attendu.a, 1);
  expect(m1.anchor).toBeCloseTo(m0.anchor + attendu.impact * 0.7, 1);
  expect(m1.people).toBe(m0.people + 1);
  expect(r.marches.btc150k[0]).toBe(m1.p);
  expect(m1.oy).toBeCloseTo(attendu.sh, 6);                                        // contrepartie : parts en circulation
  // diffusé à tous sur le sujet public « marches »
  const diff = await q(db, `select topic, event, private, payload from realtime.messages order by inserted_at desc limit 1`);
  expect(diff[0]).toMatchObject({ topic: 'marches', event: 'tick', private: false });
  expect(diff[0].payload.m.btc150k[0]).toBe(m1.p);
});

test('K49 · acheter puis revendre tout de suite ne rapporte jamais d’argent', async () => {
  for (const [id, cote, mise] of [['clasico', 'oui', 50], ['clasico', 'non', 2000], ['btc150k', 'non', 300]]) {
    const avant = await solde(bob);
    const a = await api(bob, `public.api_buy($1, $2, $3, $4)`, [id, cote, mise, randomUUID()]);
    const v = await api(bob, `public.api_sell($1, $2, $3, $4)`, [id, cote, a.pos.sh, randomUUID()]);
    expect(v.me.balance, `${id} ${cote} ${mise}`).toBeLessThan(avant);
    expect(v.pos.sh).toBe(0);
    expect(v.q.pnl).toBeLessThan(0);
    expect(v.hist).toMatchObject({ k: 'sell', m: id, s: cote, win: false });
  }
  const e = await api(bob, 'public.api_state()');
  expect(e.positions).toEqual([]);                                                  // positions soldées : plus affichées
  expect(e.history.length).toBe(3);
});

test('refus clairs : solde, liquidité, marché fermé ou inconnu, montant, position absente', async () => {
  const cas = [
    [`public.api_buy('btc150k', 'oui', 99999999, $1)`, /solde_insuffisant/],
    [`public.api_buy('btc150k', 'oui', 0.5, $1)`, /montant_min/],
    [`public.api_buy('btc150k', 'peut-etre', 10, $1)`, /cote_invalide/],
    [`public.api_buy('ferme', 'oui', 10, $1)`, /marche_ferme/],
    [`public.api_buy('nexiste-pas', 'oui', 10, $1)`, /marche_inconnu/],
    [`public.api_sell('clasico', 'oui', 5, $1)`, /position_absente/],
    [`public.api_sell('btc150k', 'oui', -1, $1)`, /quantite_invalide/],
  ];
  for (const [sql, attendu] of cas) expect(await refus(db, alice, `select ${sql}`, [randomUUID()]), sql).toMatch(attendu);
  expect(await refus(db, alice, `select public.api_buy('btc150k', 'oui', 10, null)`)).toMatch(/cle_absente/);
  // liquidité : un riche ne peut pas acheter plus que ce que le carnet contient jusqu'à 99 ¢
  await q(db, 'update public.user_stats set balance = 50000000 where user_id = $1', [bob]);
  expect(await refus(db, bob, `select public.api_buy('g-c', 'oui', 40000000, $1)`, [randomUUID()])).toMatch(/liquidite/);
  await q(db, 'update public.user_stats set balance = 10000 where user_id = $1', [bob]);
  expect(await refus(db, null, `select public.api_buy('btc150k', 'oui', 10, $1)`, [randomUUID()])).toMatch(/permission denied/);
  expect((await api(null, 'public.api_markets()')).m.btc150k.p).toBeGreaterThan(1);          // les marchés, eux, sont publics
});

test('clé d’idempotence : la même opération envoyée deux fois n’est appliquée qu’une fois', async () => {
  const carol = await creerJoueur(db, 'carol', 1000), cle = randomUUID();
  const r1 = await api(carol, `public.api_buy('clasico', 'oui', 100, $1)`, [cle]);
  const r2 = await api(carol, `public.api_buy('clasico', 'oui', 100, $1)`, [cle]);
  expect(r2.rejoue).toBe(true);
  expect(r2.me.balance).toBe(900); expect(r2.pos).toEqual(r1.pos);
  expect(await solde(carol)).toBe(900);
  expect((await q(db, `select count(*)::int as n from public.balance_ledger where user_id = $1`, [carol]))[0].n).toBe(1);
  // une autre clé = une autre opération ; la clé d'un autre joueur n'interfère pas
  await api(carol, `public.api_buy('clasico', 'oui', 100, $1)`, [randomUUID()]);
  expect(await solde(carol)).toBe(800);
  const dan = await creerJoueur(db, 'dan', 1000);
  expect((await api(dan, `public.api_buy('clasico', 'oui', 100, $1)`, [cle])).rejoue).toBeUndefined();
});

test('invariants : le solde ne devient jamais négatif, et chaque mouvement est au journal', async () => {
  const erin = await creerJoueur(db, 'erin', 250);
  const essais = [];
  for (let i = 0; i < 6; i++) essais.push(refus(db, erin, `select public.api_buy('btc150k', 'non', 100, $1)`, [randomUUID()]));
  const res = await Promise.all(essais);
  expect(res.filter(x => x === null).length).toBe(2);                              // 250 $ : deux paris de 100 $ passent, pas plus
  expect(res.filter(x => /solde_insuffisant/.test(x || '')).length).toBe(4);
  expect(await solde(erin)).toBe(50);
  const j = await q(db, `select sum(amount)::float8 as total, min(balance_after)::float8 as plus_bas, count(*)::int as n from public.balance_ledger where user_id = $1`, [erin]);
  expect(j[0]).toEqual({ total: -200, plus_bas: 50, n: 2 });
  expect(await refus(db, erin, 'update public.user_stats set balance = -1 where user_id = auth.uid()')).toMatch(/permission denied/);
});

test('B16, K21 · issues multiples : le total reste à 100 % après chaque achat et chaque vente', async () => {
  const total = async () => Number((await q(db, `select sum(current_probability)::float8 as t from public.market_live_state where market_id like 'g-%'`))[0].t);
  expect(await total()).toBe(100);
  const a = await api(alice, `public.api_buy('g-c', 'oui', 3000, $1)`, [randomUUID()]);
  expect(Object.keys(a.marches).sort()).toEqual(['g-a', 'g-b', 'g-c']);              // les issues sœurs bougent dans la même réponse
  expect(a.marches['g-c'][0]).toBeGreaterThan(20);
  expect(a.marches['g-a'][0]).toBeLessThan(50); expect(a.marches['g-b'][0]).toBeLessThan(30);
  expect(await total()).toBeCloseTo(100, 6);
  await api(alice, `public.api_sell('g-c', 'oui', $1, $2)`, [a.pos.sh / 2, randomUUID()]);
  expect(await total()).toBeCloseTo(100, 6);
  await api(bob, `public.api_buy('g-a', 'non', 1500, $1)`, [randomUUID()]);
  expect(await total()).toBeCloseTo(100, 6);
});

test('la plateforme n’est jamais exposée : ce qui est dû aux joueurs est couvert par ce qu’ils ont versé', async () => {
  // pour chaque marché : parts en circulation (ce qui serait payé si ce côté gagne) et argent reçu des joueurs
  const rows = await q(db, `select l.market_id, l.open_yes::float8 as oy, l.open_no::float8 as onn, l.mm_cash::float8 as cash, l.fees::float8 as fees,
      coalesce((select sum(p.shares) from public.positions p where p.market_id = l.market_id and p.side = 'oui'), 0)::float8 as pos_oui,
      coalesce((select sum(p.shares) from public.positions p where p.market_id = l.market_id and p.side = 'non'), 0)::float8 as pos_non
    from public.market_live_state l where l.open_yes > 0 or l.open_no > 0 or l.mm_cash <> 0`);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.oy, r.market_id + ' : parts Oui').toBeCloseTo(r.pos_oui, 4);            // la contrepartie suit exactement les positions des joueurs
    expect(r.onn, r.market_id + ' : parts Non').toBeCloseTo(r.pos_non, 4);
    expect(r.fees).toBeGreaterThanOrEqual(0);
  }
  // l'argent ne se crée pas : ce que les joueurs ont en moins = ce que le teneur de marché et les frais ont reçu
  const [j] = await q(db, `select (select -sum(amount) from public.balance_ledger where kind in ('bet', 'sell'))::float8 as joueurs, (select sum(mm_cash + fees) from public.market_live_state)::float8 as recu`);
  expect(Math.abs(j.joueurs - j.recu)).toBeLessThan(0.5);                            // au centime près par opération
});
