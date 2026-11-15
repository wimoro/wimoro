// La Série côté serveur : l'argent et l'état sont tenus par des fonctions réservées à la clé de service ; le joueur ne
// peut ni les appeler, ni choisir sa cote, ni rejouer une manche, ni gagner d'XP ou de « paris réglés » sans risquer sa mise.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, alice, bob;
test.beforeAll(async () => { db = await creerBase(); await semer(db); alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 20); });
test.afterAll(async () => { await db.close(); });

const srv = (fn, u, p) => q(db, `select public.srv_serie_${fn}($1${p === undefined ? '' : ', $2::jsonb'}) as r`, p === undefined ? [u] : [u, JSON.stringify(p)]).then(r => r[0].r);
const non = async (fn, u, p) => { try { await srv(fn, u, p); return null; } catch (e) { return e.message; } };
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, bets_placed as played, bets_settled as settled, bets_won as wins, profit_realized::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const vieillir = (u, ms) => q(db, `update wm.series set r_start = r_start - $2 where user_id = $1 and state = 'running'`, [u, ms]);
const lancer = (u, stake = 10, plus = {}) => srv('start', u, { gid: 'btc', stake, t: Date.now(), p0: 97000, key: randomUUID(), ...plus });
const choisir = (u, choice, mult = 1.9, plus = {}) => srv('play', u, { gid: 'btc', choice, mult, taux: 0.0175, taux_remise: 0.014, ...plus });
const regler = async (u, out, p1 = 97100) => { const l = await srv('lire', u); return srv('regler', u, { id: l.serie.id, step: l.serie.step, out, p1 }); };

test('réservé au serveur : ni un visiteur ni un joueur ne peuvent appeler ces fonctions ni lire la table', async () => {
  for (const sql of [`select public.srv_serie_start('${alice}', '{}')`, `select public.srv_serie_play('${alice}', '{}')`, `select public.srv_serie_regler('${alice}', '{}')`,
    `select public.srv_serie_cash('${alice}')`, `select public.srv_serie_lire('${alice}')`, 'select * from wm.series', 'select wm.state_socle()'])
    for (const qui of [null, alice]) expect(await refus(db, qui, sql), sql).toMatch(/permission denied/);
});

test('lancer : la mise est prise une fois (clé rejouée comprise), une seule série à la fois, horloge et pause vérifiées', async () => {
  expect(await non('start', alice, { gid: 'btc', stake: 7, t: Date.now(), p0: 97000, key: randomUUID() })).toMatch(/montant_invalide/);
  expect(await non('start', alice, { gid: 'btc', stake: 10, t: Date.now() - 60000, p0: 97000, key: randomUUID() })).toMatch(/horloge/);
  expect(await non('start', bob, { gid: 'btc', stake: 25, t: Date.now(), p0: 97000, key: randomUUID() })).toMatch(/solde_insuffisant/);
  const cle = randomUUID(), t = Date.now();
  const r = await srv('start', alice, { gid: 'btc', stake: 10, t, p0: 97000, key: cle });
  expect(r.serie).toMatchObject({ gid: 'btc', stake: 10, stack: 10, step: 1, state: 'running', rStart: t, p0: 97000, choice: null, won: 0, hist: [] });
  expect(r.me.balance).toBe(990);
  expect((await srv('start', alice, { gid: 'btc', stake: 10, t, p0: 97000, key: cle })).rejoue).toBe(true);    // même clé : rien de plus
  expect(await non('start', alice, { gid: 'eth', stake: 10, t: Date.now(), p0: 3000, key: randomUUID() })).toMatch(/serie_en_cours/);
  expect(await stats(alice)).toMatchObject({ balance: 990, played: 1, xp: 0 });               // pas d'XP au lancement
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.serie).toMatchObject({ gid: 'btc', state: 'running', step: 1 });
  await q(db, `insert into wm.rg (user_id, pause_until) values ($1, now() + interval '1 hour')`, [bob]);
  expect(await non('start', bob, { gid: 'btc', stake: 10, t: Date.now(), p0: 97000, key: randomUUID() })).toMatch(/pause/);
});

test('choisir : dans les 30 secondes, une seule fois, à la cote et au taux fournis par le moteur ; 10 XP au premier choix', async () => {
  expect(await non('play', alice, { gid: 'eth', choice: 'oui', mult: 1.9, taux: 0.0175, taux_remise: 0.014 })).toMatch(/serie_absente/);
  expect(await non('play', alice, { gid: 'btc', choice: 'peut-etre', mult: 1.9, taux: 0.0175, taux_remise: 0.014 })).toMatch(/cote_invalide/);
  expect(await non('play', alice, { gid: 'btc', choice: 'oui', mult: 500, taux: 0.0175, taux_remise: 0.014 })).toMatch(/montant_invalide/);
  const r = await choisir(alice, 'oui', 1.9);
  expect(r.serie).toMatchObject({ choice: 'oui', mult: 1.9, fee: 0.18 });                       // 10 × 0,0175, arrondi au centime
  expect(await non('play', alice, { gid: 'btc', choice: 'non', mult: 3, taux: 0, taux_remise: 0 })).toMatch(/deja_choisi/);
  expect(await non('cash', alice)).toMatch(/deja_choisi/);                                     // une fois le choix fait, on va au bout de la manche
  expect((await stats(alice)).xp).toBe(10);
});

test('régler : pas avant la fin ; gagnée → stack × cote après frais et manche suivante ; rejouer le règlement ne change rien', async () => {
  expect(await non('regler', alice, { id: (await srv('lire', alice)).serie.id, step: 1, out: 'oui', p1: 97100 })).toMatch(/manche_en_cours/);
  await vieillir(alice, 60001);
  const avant = await srv('lire', alice);
  const r = await regler(alice, 'oui', 97100);
  expect(r.regle).toMatchObject({ r: 'gagnee', step: 1, out: 'oui', stack: 18.66, won: 1 });   // (10 − 0,18) × 1,9
  expect(r.serie).toMatchObject({ state: 'running', step: 2, stack: 18.66, choice: null, mult: null, fee: 0, p0: 97100, rStart: avant.serie.rStart + 60000, won: 1 });
  expect(r.serie.hist).toEqual([{ step: 1, choice: 'oui', out: 'oui', mult: 1.9, p0: 97000, p1: 97100, win: true }]);
  const rejoue = await srv('regler', alice, { id: avant.serie.id, step: 1, out: 'non', p1: 1 });   // la manche 1 est déjà réglée
  expect(rejoue.regle).toBeNull(); expect(rejoue.serie).toMatchObject({ step: 2, stack: 18.66, state: 'running' });
  expect(await stats(alice)).toMatchObject({ balance: 990, settled: 0, wins: 0 });             // rien n'est versé tant que la série continue
});

test('encaisser après une manche gagnée : le stack est versé, la série compte comme un pari gagné, l’historique le dit', async () => {
  const r = await srv('cash', alice);
  expect(r.regle).toMatchObject({ r: 'encaissee', stack: 18.66, stake: 10, won: 1 });
  expect(r.serie).toMatchObject({ state: 'cashed', stack: 18.66, step: 1 });
  expect(r.hist).toMatchObject([{ k: 'flash', q: 'serie|btc|1|1|1.9', s: 'oui', win: true, pnl: 8.66 }]);
  expect(await stats(alice)).toMatchObject({ balance: 1008.66, settled: 1, wins: 1, realise: 8.66, xp: 40 });   // 10 + 20 + 10 × 1 manche
  expect(await non('cash', alice)).toMatch(/serie_absente/);
  const grand = await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 and kind like 'serie%' order by id`, [alice]);
  expect(grand).toEqual([{ kind: 'serie', a: -10 }, { kind: 'serie_gain', a: 18.66 }]);
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.history[0]).toMatchObject({ k: 'flash', q: 'serie|btc|1|1|1.9', win: true });
});

test('perdre : le stack est perdu, la mise seulement ; lancer puis reprendre sa mise ne rapporte ni XP ni pari réglé', async () => {
  const s0 = await stats(alice);
  await lancer(alice, 25); await choisir(alice, 'be', 27.3); await vieillir(alice, 60001);
  const r = await regler(alice, 'non', 96900);
  expect(r.regle).toMatchObject({ r: 'perdue', step: 1, out: 'non', stack: 0 });
  expect(r.serie).toMatchObject({ state: 'lost', stack: 0 }); expect(r.hist).toMatchObject([{ q: 'serie|btc|0|1|0', win: false, pnl: -25 }]);
  expect(await stats(alice)).toMatchObject({ balance: s0.balance - 25, settled: s0.settled + 1, wins: s0.wins, realise: Math.round((s0.realise - 25) * 100) / 100 });
  // dix lancements aussitôt repris : rien de gagné
  const s1 = await stats(alice);
  for (let i = 0; i < 10; i++) { await lancer(alice, 5); expect((await srv('cash', alice)).regle.r).toBe('rendue'); }
  expect(await stats(alice)).toMatchObject({ balance: s1.balance, settled: s1.settled, wins: s1.wins, xp: s1.xp });
});

test('sans choix : mise rendue si rien n’est gagné, encaissement automatique sinon ; 12 manches au plus', async () => {
  const s0 = await stats(alice);
  await lancer(alice, 10); await vieillir(alice, 60001);
  expect((await regler(alice, 'oui')).regle.r).toBe('rendue');
  expect((await stats(alice)).balance).toBe(s0.balance);
  await lancer(alice, 10); await choisir(alice, 'non', 2); await vieillir(alice, 60001);
  expect((await regler(alice, 'non')).regle.r).toBe('gagnee');                                // stack 19,64
  await vieillir(alice, 31600);
  expect(await non('play', alice, { gid: 'btc', choice: 'oui', mult: 2, taux: 0.0175, taux_remise: 0.014 })).toMatch(/choix_fermes/);   // la fenêtre de 30 secondes est passée
  await vieillir(alice, 28500);
  const auto = await regler(alice, 'oui');
  expect(auto.regle).toMatchObject({ r: 'auto', stack: 19.64 });
  expect((await stats(alice)).balance).toBeCloseTo(s0.balance + 9.64, 2);
  // douzième manche gagnée : encaissement d'office
  await lancer(alice, 5);
  await q(db, `update wm.series set step = 12, won = 11, stack = 100 where user_id = $1 and state = 'running'`, [alice]);
  await choisir(alice, 'oui', 2, { taux: 0, taux_remise: 0 }); await vieillir(alice, 60001);
  const max = await regler(alice, 'oui');
  expect(max.regle).toMatchObject({ r: 'max', stack: 200, won: 12 }); expect(max.serie).toMatchObject({ state: 'cashed', step: 12 });
  expect((await q(db, `select count(*)::int as n from wm.series where user_id = $1 and state = 'running'`, [alice]))[0].n).toBe(0);
});
