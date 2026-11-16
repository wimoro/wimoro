// Blitz Royale côté serveur : entrée, choix, rachat et clôture des vrais joueurs. Les faits déduits de l'heure (issues des
// manches, joueurs simulés, jackpot reporté) sont fournis par l'Edge Function ; ici on les donne à la main.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, alice, bob, carol;
test.beforeAll(async () => { db = await creerBase(); await semer(db); alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000); carol = await creerJoueur(db, 'carol', 5); });
test.afterAll(async () => { await db.close(); });

const srv = (fn, u, p) => q(db, `select public.srv_blitz_${fn}($1, $2::jsonb) as r`, [u, JSON.stringify(p)]).then(r => r[0].r);
const non = async (fn, u, p) => { try { await srv(fn, u, p); return null; } catch (e) { return e.message; } };
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, bets_placed as played, bets_settled as settled, bets_won as wins, profit_realized::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const ID = 1994300, ISSUES = [1, 0, 2, 1, 1, 0, 0, 1, 0, 1];                                 // Haut, Bas, break even…
const entrer = (u, plus = {}) => srv('join', u, { id: ID, buyin: 10, debut: Date.now() + 60000, key: randomUUID(), ...plus });
const choisir = (u, manche, choice, debut = Date.now() - 5000) => srv('choose', u, { id: ID, manche, debut, choice, issues: ISSUES.slice(0, manche - 1) });

test('réservé au serveur ; entrer : buy-in pris une fois, avant le départ seulement', async () => {
  for (const sql of [`select public.srv_blitz_join('${alice}', '{}')`, `select public.srv_blitz_choose('${alice}', '{}')`, `select public.srv_blitz_rebuy('${alice}', '{}')`,
    `select public.srv_blitz_clore('${alice}', '{}')`, `select public.srv_blitz_etat('${alice}', '{}')`, 'select * from wm.blitz_joueurs', 'select * from wm.blitz_clos'])
    for (const qui of [null, alice]) expect(await refus(db, qui, sql), sql).toMatch(/permission denied/);
  expect(await non('join', alice, { id: ID, buyin: 10, debut: Date.now() - 1000, key: randomUUID() })).toMatch(/inscriptions_closes/);
  expect(await non('join', alice, { id: ID, buyin: 12, debut: Date.now() + 60000, key: randomUUID() })).toMatch(/requete/);
  expect(await non('join', carol, { id: ID, buyin: 10, debut: Date.now() + 60000, key: randomUUID() })).toMatch(/solde_insuffisant/);
  const cle = randomUUID(), debut = Date.now() + 60000;
  const r = await srv('join', alice, { id: ID, buyin: 10, debut, key: cle });
  expect(r.me.balance).toBe(990);
  expect(r.blitz).toMatchObject({ id: ID, n: 1, pot: 10, moi: { paye: 10, rachat: false, choix: {}, regle: false, sortie: null } });
  expect((await srv('join', alice, { id: ID, buyin: 10, debut, key: cle })).rejoue).toBe(true);
  expect(await non('join', alice, { id: ID, buyin: 10, debut, key: randomUUID() })).toMatch(/deja_inscrit/);
  await entrer(bob);
  expect(await stats(alice)).toMatchObject({ balance: 990, played: 1, xp: 10 });
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.blitz).toEqual([ID]);
  expect((await srv('etat', alice, { id: ID, issues: [] })).blitz).toMatchObject({ n: 2, pot: 20, vivants: [] });
});

test('choisir : pendant les 30 premières secondes de la manche, tant qu’on est en vie ; un joueur tombé ne choisit plus', async () => {
  expect(await non('choose', carol, { id: ID, manche: 1, debut: Date.now(), choice: 1, issues: [] })).toMatch(/pas_inscrit/);
  expect(await non('choose', alice, { id: ID, manche: 1, debut: Date.now() - 40000, choice: 1, issues: [] })).toMatch(/choix_fermes/);
  expect(await non('choose', alice, { id: ID, manche: 1, debut: Date.now(), choice: 7, issues: [] })).toMatch(/cote_invalide/);
  expect(await non('choose', alice, { id: ID, manche: 2, debut: Date.now(), choice: 1, issues: [] })).toMatch(/requete/);   // les issues passées doivent être fournies
  await choisir(alice, 1, 0); await choisir(alice, 1, 1);                                     // on peut changer d'avis tant que les choix sont ouverts
  await choisir(bob, 1, 0);                                                                   // bob dit Bas : il tombera (issue : Haut)
  const vue = (await srv('etat', alice, { id: ID, issues: [1] })).blitz;
  expect(vue).toMatchObject({ n: 2, vivants: [1], moi: { choix: { 1: 1 }, sortie: null } });
  expect((await srv('etat', bob, { id: ID, issues: [1] })).blitz.moi.sortie).toBe(1);
  expect(await non('choose', bob, { id: ID, manche: 2, debut: Date.now(), choice: 0, issues: [1] })).toMatch(/elimine/);
});

test('rachat : une fois, seulement après une chute à la manche 1 et avant la manche 2', async () => {
  const fenetre = { id: ID, issue1: 1, fin1: Date.now() - 2000, debut2: Date.now() + 8000, prix: 50 };
  expect(await non('rebuy', alice, fenetre)).toMatch(/rachat_indisponible/);                  // alice n'est pas tombée
  expect(await non('rebuy', bob, { ...fenetre, debut2: Date.now() - 1 })).toMatch(/rachat_indisponible/);   // trop tard
  expect(await non('rebuy', bob, { ...fenetre, prix: 1 })).toMatch(/requete/);
  const r = await srv('rebuy', bob, fenetre);
  expect(r.me.balance).toBe(940);
  expect(r.blitz).toMatchObject({ pot: 70, moi: { paye: 60, rachat: true, sortie: null } });   // de nouveau en vie
  expect(await non('rebuy', bob, fenetre)).toMatch(/rachat_fait/);
  await choisir(bob, 2, 0); await choisir(alice, 2, 0);                                       // manche 2 : Bas, les deux survivent
  await choisir(alice, 3, 2);                                                                 // manche 3 : break even ; bob ne choisit pas → il tombe
  expect((await srv('etat', bob, { id: ID, issues: [1, 0, 2] })).blitz).toMatchObject({ vivants: [2, 2, 1], moi: { sortie: 3 } });
});

test('clôture : pas avant la fin ; les survivants (simulés et vrais) se partagent la cagnotte moins 5 % ; rejouer ne change rien', async () => {
  for (let i = 4; i <= 10; i++) await choisir(alice, i, ISSUES[i - 1]);                       // alice dit juste jusqu'au bout
  const faits = { id: ID, debut: Date.now() - 800000, issues: ISSUES, bots: { n: 2000, buyin: 10, vivants: [1000, 500, 20, 10, 5, 3, 2, 2, 1, 1] }, report: 500 };
  expect(await non('clore', alice, { ...faits, debut: Date.now() - 60000 })).toMatch(/blitz_en_cours/);
  const a0 = await stats(alice), b0 = await stats(bob);
  const r = await srv('clore', bob, faits);                                                   // c'est le perdant qui déclenche : tout le monde est réglé
  const cagnotte = 500 + 20000 + 70, chacun = Math.trunc(cagnotte * 0.95 / 2 * 100) / 100;    // un simulé et alice
  expect(r.blitz.clos).toEqual({ joueurs: 2002, survivants: 2, cagnotte, chacun, manches: 10 });
  expect(r.blitz.moi).toMatchObject({ regle: true, gagne: false, gain: 0, sortie: 3 });
  expect(r.hist).toMatchObject([{ k: 'flash', q: 'blitz|p|2002', win: false, pnl: -60 }]);
  expect(await stats(bob)).toMatchObject({ balance: b0.balance, settled: b0.settled + 1, wins: b0.wins, realise: b0.realise - 60 });
  expect(await stats(alice)).toMatchObject({ balance: a0.balance + chacun, settled: a0.settled + 1, wins: a0.wins + 1, xp: a0.xp + 80 });
  expect((await q(db, `select code, params from public.notifications where user_id = $1 and code = 'blitz_gagne'`, [alice]))[0].params).toMatchObject({ gain: chacun, paye: 10 });
  const encore = await srv('clore', alice, faits);                                            // rejouée : rien ne bouge, pas de seconde ligne d'historique
  expect(encore.hist).toEqual([]); expect(encore.blitz.moi).toMatchObject({ regle: true, gagne: true, gain: chacun });
  expect(await stats(alice)).toMatchObject({ balance: a0.balance + chacun, settled: a0.settled + 1 });
  expect((await q(db, `select count(*)::int as n from public.position_history where question like 'blitz|%'`))[0].n).toBe(2);
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.blitz).toEqual([]);
});

test('personne ne survit : le Blitz s’arrête à cette manche, rien n’est versé', async () => {
  const id2 = ID + 1;
  await srv('join', alice, { id: id2, buyin: 25, debut: Date.now() + 60000, key: randomUUID() });
  await srv('choose', alice, { id: id2, manche: 1, debut: Date.now() - 1000, choice: 1, issues: [] });
  await srv('choose', alice, { id: id2, manche: 2, debut: Date.now() - 1000, choice: 1, issues: [1] });     // faux à la manche 2
  const faits = { id: id2, debut: Date.now() - 135000, issues: [1, 0, 1, 1, 1, 1, 1, 1, 1, 1], bots: { n: 4000, buyin: 25, vivants: [1900, 0] }, report: 0 };
  expect(await non('clore', alice, { ...faits, debut: Date.now() - 100000 })).toMatch(/blitz_en_cours/);   // la manche 2 n'est pas finie
  const a0 = await stats(alice);
  const r = await srv('clore', alice, faits);
  expect(r.blitz.clos).toMatchObject({ survivants: 0, chacun: 0, manches: 2, joueurs: 4001 });
  expect(r.blitz.moi).toMatchObject({ regle: true, gagne: false, sortie: 2 });
  expect((await stats(alice)).balance).toBe(a0.balance);
});
