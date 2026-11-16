// Guerres de clans côté serveur : déclaration par le chef, buy-in des participants, points, règlement au bout de 48 heures.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, zoe, CLAN, bots;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 500); max = await creerJoueur(db, 'max', 500); zoe = await creerJoueur(db, 'zoe', 500);
  await q(db, 'update public.user_stats set xp = 900, bets_settled = 12, bets_won = 7, deposits_count = 1 where user_id = $1', [lea]);   // rang Argent
  await q(db, `update public.users set created_at = now() - interval '20 days' where id = $1`, [lea]);
  bots = (await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 9) i returning id`)).map(x => x.id);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const clan = async u => (await api(u, 'api_clan()')).clan;
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, coalesce(profit_realized, 0)::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const top10 = L => L.map(x => x.pts).sort((a, b) => b - a).slice(0, 10).reduce((t, x) => t + x, 0);
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));
/** fait passer le temps : la guerre a commencé il y a `heures` heures */
const vieillir = heures => q(db, `update wm.clan_guerres set debut = debut - make_interval(secs => $2::float8 * 3600), fin = fin - make_interval(secs => $2::float8 * 3600) where clan_id = $1 and etat = 'live'`, [CLAN, heures]);

test('déclarer la guerre : le chef seulement, un clan adverse de la division, 48 heures, dix adversaires déjà dans la cagnotte ; une seule guerre à la fois', async () => {
  CLAN = (await api(lea, 'api_clan_create($1::jsonb)', [JSON.stringify({ name: 'Les Loups', tag: 'lou', desc: '', ic: 'flame', col: '#12A150', lang: ['fr'], cats: [], access: 'open', minRank: 0 })])).id;
  await api(max, 'api_clan_join($1, null)', [CLAN]);
  await q(db, `insert into wm.clan_membres (user_id, clan_id, role, jour, depuis) select u, $1, 'membre', current_date, now() - interval '1 minute' from unnest($2::uuid[]) u`, [CLAN, bots.slice(0, 3)]);   // trois bots invités
  expect(await non(max, 'api_clan_war()')).toMatch(/role_insuffisant/);
  expect(await non(zoe, 'api_clan_war()')).toMatch(/clan_absent/);
  expect(await non(max, 'api_clan_war_join()')).toMatch(/guerre_absente/);
  await q(db, 'truncate realtime.messages');
  const r = await api(lea, 'api_clan_war()');
  const w = r.clan.war;
  expect(w).toMatchObject({ status: 'live', buyin: 20, pot: 20 * 13 });                          // dix adversaires et nos trois bots
  expect(w.endAt - w.at).toBe(48 * 3600e3);
  expect((await q(db, 'select division from wm.clans_demo where id = $1', [w.foe]))[0].division).toBe('bronze');
  expect(w.theirs).toHaveLength(10);
  for (const x of w.theirs) { expect(x.pts).toBeGreaterThanOrEqual(200); expect(x.pts).toBeLessThanOrEqual(1100); }
  expect(w.mine.map(x => x.u).sort()).toEqual(bots.slice(0, 3).slice().sort());                 // nos membres simulés participent d'office
  for (const x of w.mine) { expect(x.pts).toBeGreaterThanOrEqual(150); expect(x.pts).toBeLessThanOrEqual(950); }
  expect(r.clan.feed[0]).toMatchObject({ code: 'guerre', u: lea, p: { foe: w.foe, k: 20 } });
  expect(await q(db, `select topic, private, payload ->> 'k' as k, payload -> 'ev' ->> 'code' as code from realtime.messages where topic like 'clan:%' or topic like 'salon:%'`))
    .toEqual([{ topic: 'clan:' + CLAN, private: true, k: 'evt', code: 'guerre' }]);
  expect(await non(lea, 'api_clan_war()')).toMatch(/guerre_en_cours/);
  expect((await clan(max)).war.id, 'les membres voient la guerre').toBe(w.id);
  expect((await clan(zoe)).war).toBeNull();
  // un membre d'un clan de démonstration ne déclare rien
  await api(zoe, `api_clan_join('c1', null)`);
  expect(await non(zoe, 'api_clan_war()')).toMatch(/role_insuffisant/);
  expect(await refus(db, lea, 'select * from wm.clan_guerres')).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select wm.clan_guerres_avancer($1)', [lea])).toMatch(/permission denied/);
});

test('participer : le buy-in entre dans la cagnotte, une seule fois ; les points suivent la contribution au clan ; ceux des joueurs simulés montent avec le temps', async () => {
  const s0 = await stats(max);
  const r = await api(max, 'api_clan_war_join()');
  expect((await stats(max)).balance).toBe(s0.balance - 20);
  expect(r.clan.war.pot).toBe(20 * 14);
  expect(r.clan.war.mine.find(x => x.u === max)).toEqual({ u: max, pts: 0 });
  expect(await non(max, 'api_clan_war_join()')).toMatch(/guerre_deja/);
  expect((await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id desc limit 1`, [max]))[0]).toEqual({ kind: 'guerre', a: -20 });
  // la contribution de Max au clan : 800 $ de volume → 80 points
  await q(db, 'update wm.clan_membres set xp = 800 where user_id = $1 and parti_at is null', [max]);
  expect((await clan(max)).war.mine.find(x => x.u === max).pts).toBe(80);
  // les joueurs simulés : mêmes points à chaque lecture, plus hauts après une journée, bornés à +50 % à la fin
  const t0 = (await clan(lea)).war;
  expect((await clan(lea)).war.theirs).toEqual(t0.theirs);
  await vieillir(24);
  const t24 = (await clan(lea)).war;
  expect(top10(t24.theirs)).toBeGreaterThan(top10(t0.theirs));
  const depart = Object.fromEntries(t0.theirs.map(x => [x.i, x.pts]));
  for (const x of t24.theirs) expect(x.pts).toBeLessThanOrEqual(Math.floor(depart[x.i] * 1.26) + 1);
  const fauche = await creerJoueur(db, 'fauche', 5);
  await api(fauche, 'api_clan_join($1, null)', [CLAN]);
  expect(await non(fauche, 'api_clan_war_join()')).toMatch(/solde_insuffisant/);
});

test('au bout de 48 heures : les dix meilleurs de chaque camp ; perdue, la cagnotte va aux vainqueurs ; gagnée, elle est partagée (moins 4 %) et rapporte 50 XP', async () => {
  // perdue : trois bots et Max (80 points) contre dix adversaires
  await vieillir(24.01);
  const s0 = await stats(max);
  const r = await api(max, 'api_state()');
  expect(r.clan.war).toBeNull();
  const g1 = r.clan.wars[0];
  expect(g1).toMatchObject({ status: 'lost', pot: 280 });
  expect(g1.b).toBeGreaterThan(g1.a);
  expect(await stats(max)).toMatchObject({ balance: s0.balance, xp: s0.xp });
  expect((await stats(max)).realise).toBeCloseTo(s0.realise - 20, 2);
  expect((await notifs(max, 'guerre_lost')).at(-1)).toMatchObject({ id: CLAN, a: g1.a, b: g1.b, pot: 280 });
  expect((await api(max, 'api_clan()')).clan.wars, 'réglée une seule fois').toHaveLength(1);
  // gagnée : Léa et Max participent, Max a une énorme contribution (les dix meilleurs comptent)
  const r2 = await api(lea, 'api_clan_war()');
  await api(lea, 'api_clan_war_join()'); await api(max, 'api_clan_war_join()');
  await q(db, 'update wm.clan_membres set xp = 300000 where user_id = $1 and parti_at is null', [max]);
  await vieillir(48.01);
  const l0 = await stats(lea), m0 = await stats(max);
  const fin = (await api(lea, 'api_clan()')).clan;                                               // c'est Léa qui passe : Max est réglé et prévenu aussi
  const g2 = fin.wars[0];
  const participants = 3 + 2, pot = 20 * (10 + participants), part = Math.round(pot * 0.96 / participants * 100) / 100;
  expect(g2).toMatchObject({ foe: r2.clan.war.foe, status: 'won', pot });
  expect(g2.a).toBeGreaterThan(g2.b);
  expect(await stats(lea)).toMatchObject({ balance: l0.balance + part, xp: l0.xp + 50 });
  expect(await stats(max)).toMatchObject({ balance: m0.balance + part, xp: m0.xp + 50 });
  expect((await notifs(max, 'guerre_won')).at(-1)).toMatchObject({ id: CLAN, pot, gain: Math.round((part - 20) * 100) / 100 });
  expect((await q(db, `select points, gain::float8 as gain from wm.clan_guerre_joueurs j join wm.clan_guerres g on g.id = j.guerre_id where j.user_id = $1 order by g.id desc limit 1`, [max]))[0]).toEqual({ points: 30000, gain: part });
  expect((await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id desc limit 1`, [lea]))[0]).toEqual({ kind: 'guerre_gain', a: part });
  expect(fin.wars).toHaveLength(2);
  expect(fin.war).toBeNull();
});

test('un participant qui a quitté le clan n’est pas oublié : son seul passage règle la guerre pour tous, et sa part lui revient', async () => {
  await api(lea, 'api_clan_war()');
  await api(lea, 'api_clan_war_join()'); await api(max, 'api_clan_war_join()');
  await q(db, 'update wm.clan_membres set xp = 300000 where user_id = $1 and parti_at is null', [lea]);   // Léa porte le clan : la guerre sera gagnée
  await api(max, 'api_clan_leave()');                                                            // Max a payé son buy-in, puis s'en va
  await vieillir(48.01);
  const l0 = await stats(lea), m0 = await stats(max);
  const r = await api(max, 'api_state()');                                                       // seul Max repasse : aucun membre du clan n'est venu
  expect(r.clan.mine).toBeNull();
  const participants = 3 + 2, pot = 20 * (10 + participants), part = Math.round(pot * 0.96 / participants * 100) / 100;
  const g = (await q(db, 'select etat, cagnotte::float8 as pot, score_nous as a, score_eux as b from wm.clan_guerres where clan_id = $1 order by id desc limit 1', [CLAN]))[0];
  expect(g).toMatchObject({ etat: 'won', pot });
  const m1 = await stats(max), l1 = await stats(lea);
  expect(m1.balance).toBeCloseTo(m0.balance + part, 2); expect(m1.xp).toBe(m0.xp + 50);
  expect(l1.balance, 'réglée pour tous les participants en une fois').toBeCloseTo(l0.balance + part, 2); expect(l1.xp).toBe(l0.xp + 50);
  expect((await notifs(max, 'guerre_won')).at(-1)).toMatchObject({ id: CLAN, pot, a: g.a, b: g.b });
  expect((await notifs(lea, 'guerre_won')).at(-1)).toMatchObject({ id: CLAN, pot });
  expect(await q(db, `select j.user_id as u, j.points, j.gain::float8 as gain from wm.clan_guerre_joueurs j join wm.clan_guerres x on x.id = j.guerre_id where x.clan_id = $1 and x.id = (select max(id) from wm.clan_guerres) order by j.points`, [CLAN]))
    .toEqual([{ u: max, points: 0, gain: part }, { u: lea, points: 30000, gain: part }]);     // sorti du clan, Max ne marque plus de points, mais sa part lui revient
  // rien n'est réglé deux fois, ni par lui ni par un membre
  await api(max, 'api_state()');
  const fin = await clan(lea);
  expect(fin.war).toBeNull(); expect(fin.wars).toHaveLength(3);
  expect(await stats(max)).toEqual(m1); expect(await stats(lea)).toEqual(l1);
});
