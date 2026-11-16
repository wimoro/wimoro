// Duels entre amis sur un marché : mises sous séquestre, cote du marché à l'acceptation, règlement à la résolution.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, alice, bob, carol, bot;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000); carol = await creerJoueur(db, 'carol', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'admin')`, [chef]);
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_duel', 'bot_duel@nulle.part', true) returning id`);
  await q(db, `insert into public.user_stats (user_id, balance) values ($1, 0) on conflict (user_id) do nothing`, [bot]);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted'), ($1, $3, 'accepted')`, [alice, bob, bot]);
});
test.afterAll(async () => { await db.close(); });

const api = (qui, fn, ...args) => enTantQue(db, qui, s => s(`select public.${fn}(${args.map((_, i) => '$' + (i + 1) + (typeof args[i] === 'object' ? '::jsonb' : '')).join(', ')}) as r`, args.map(a => typeof a === 'object' ? JSON.stringify(a) : a))).then(r => r[0].r);
const non = (qui, fn, ...args) => refus(db, qui, `select public.${fn}(${args.map((_, i) => '$' + (i + 1) + (typeof args[i] === 'object' ? '::jsonb' : '')).join(', ')})`, args.map(a => typeof a === 'object' ? JSON.stringify(a) : a));
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, bets_settled as settled, bets_won as wins, profit_realized::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const defi = (plus = {}) => ({ m: 'clasico', side: 'oui', stake: 54, opp: bob, key: randomUUID(), ...plus });

test('défier un ami : mise et frais pris tout de suite, l’ami est prévenu ; refus des cas interdits', async () => {
  expect(await non(null, 'api_duel_create', defi())).toMatch(/permission denied/);
  expect(await non(alice, 'api_duel_create', defi({ stake: 2 }))).toMatch(/montant_invalide/);
  expect(await non(alice, 'api_duel_create', defi({ side: 'peut-etre' }))).toMatch(/cote_invalide/);
  expect(await non(alice, 'api_duel_create', defi({ m: 'inconnu' }))).toMatch(/marche_inconnu/);
  expect(await non(alice, 'api_duel_create', defi({ opp: carol }))).toMatch(/pas_amis/);         // carol n'est pas son amie
  expect(await non(alice, 'api_duel_create', defi({ opp: alice }))).toMatch(/duel_indisponible/);
  const cle = randomUUID();
  const r = await api(alice, 'api_duel_create', defi({ key: cle }));
  expect(r.duel).toMatchObject({ m: 'clasico', side: 'oui', by: alice, opp: bob, stake: 54, st: 'open', price0: 54, price: null });
  expect(r.duel.code).toMatch(/^D[0-9A-F]{7}$/); expect(r.duel.fee).toBeGreaterThan(0);
  expect(r.me.balance).toBeCloseTo(1000 - 54 - r.duel.fee, 2);
  expect((await api(alice, 'api_duel_create', defi({ key: cle }))).rejoue).toBe(true);          // même clé : un seul duel
  expect(r.duels.liste).toHaveLength(1); expect(r.duels.users[bob]).toMatchObject({ n: 'bob' });
  expect((await q(db, `select params from public.notifications where user_id = $1 and code = 'duel_recu'`, [bob]))[0].params).toMatchObject({ u: alice, m: 'clasico', s: 'oui', k: 54 });
  expect((await api(bob, 'api_duels')).liste[0]).toMatchObject({ by: alice, opp: bob, st: 'open' });   // bob le voit dans ses défis reçus
  expect((await api(carol, 'api_duels')).liste).toEqual([]);
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.duels.liste).toHaveLength(1);
  expect(await refus(db, alice, 'select * from wm.duels')).toMatch(/permission denied/);
});

test('accepter : la cote du marché fixe les deux mises ; un tiers ne peut pas prendre un duel adressé à un autre', async () => {
  const [{ id }] = await q(db, 'select id from wm.duels order by id desc limit 1');
  expect(await non(carol, 'api_duel_accept', { id })).toMatch(/duel_indisponible/);
  expect(await non(alice, 'api_duel_accept', { id })).toMatch(/duel_indisponible/);             // pas son propre duel
  const b0 = await stats(bob);
  const r = await api(bob, 'api_duel_accept', { id });
  // Oui vaut 54 ¢ : cagnotte 100, bob engage 46
  expect(r.duel).toMatchObject({ st: 'active', price: 54, pot: 100, oppStake: 46, opp: bob });
  expect(r.me.balance).toBeCloseTo(b0.balance - 46 - r.duel.oppFee, 2);
  expect(await non(bob, 'api_duel_accept', { id })).toMatch(/duel_indisponible/);
  expect(await non(alice, 'api_duel_close', id, 'cancel')).toMatch(/duel_indisponible/);        // en cours : plus d'annulation
  expect((await q(db, `select params from public.notifications where user_id = $1 and code = 'duel_accepte'`, [alice]))[0].params).toMatchObject({ u: bob, pot: 100 });
});

test('refuser, annuler, laisser expirer : la mise revient (pas les frais d’ouverture)', async () => {
  const a0 = await stats(alice);
  const d1 = (await api(alice, 'api_duel_create', defi({ stake: 20 }))).duel;
  expect(await non(carol, 'api_duel_close', d1.id, 'decline')).toMatch(/duel_indisponible/);
  await api(bob, 'api_duel_close', d1.id, 'decline');
  expect((await q(db, 'select etat from wm.duels where id = $1', [d1.id]))[0].etat).toBe('declined');
  expect((await stats(alice)).balance).toBeCloseTo(a0.balance - d1.fee, 2);
  expect((await q(db, `select count(*)::int as n from public.notifications where user_id = $1 and code = 'duel_decline'`, [alice]))[0].n).toBe(1);
  const d2 = (await api(alice, 'api_duel_create', defi({ stake: 20 }))).duel;
  expect(await non(bob, 'api_duel_close', d2.id, 'cancel')).toMatch(/duel_indisponible/);       // seul le défieur annule
  await api(alice, 'api_duel_close', d2.id, 'cancel');
  const d3 = (await api(alice, 'api_duel_create', defi({ stake: 20 }))).duel;
  await q(db, `update wm.duels set expire_at = now() - interval '1 minute' where id = $1`, [d3.id]);
  expect(await non(bob, 'api_duel_accept', { id: d3.id })).toMatch(/duel_indisponible/);        // trop tard
  const etat = (await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r;       // au chargement suivant : expiré, mise rendue
  expect(etat.duels.liste.find(d => d.id === d3.id).st).toBe('expired');
  expect(etat.me.balance, 'la réponse elle-même porte la mise rendue').toBeCloseTo(a0.balance - d1.fee - d2.fee - d3.fee, 2);
  expect(etat.notifs.some(n => n.code === 'duel_expire')).toBe(true);
  expect((await stats(alice)).balance).toBeCloseTo(a0.balance - d1.fee - d2.fee - d3.fee, 2);
  expect((await q(db, `select count(*)::int as n from public.notifications where user_id = $1 and code = 'duel_expire'`, [alice]))[0].n).toBe(1);
});

test('lien d’invitation : un duel sans adversaire désigné se prend par son code ; un bot défié accepte aussitôt', async () => {
  const d = (await api(alice, 'api_duel_create', defi({ opp: null, stake: 10, side: 'non' }))).duel;
  expect(d).toMatchObject({ opp: null, st: 'open', price0: 46 });
  const vu = await api(carol, 'api_duel_code', d.code.toLowerCase());
  expect(vu.duel).toMatchObject({ id: d.id, by: alice, stake: 10, side: 'non' }); expect(vu.users[alice]).toMatchObject({ n: 'alice' });
  expect(JSON.stringify(vu)).not.toMatch(/@test\.dev/);
  expect(await non(carol, 'api_duel_code', 'DXXXXXXX')).toMatch(/duel_indisponible/);
  const r = await api(carol, 'api_duel_accept', { code: d.code });
  expect(r.duel).toMatchObject({ st: 'active', opp: carol, price: 46 });                       // Non vaut 46 ¢ : carol (Oui) engage 54 % de la cagnotte
  expect(r.duel.pot).toBeCloseTo(10 * 100 / 46, 2); expect(r.duel.oppStake).toBeCloseTo(r.duel.pot * 0.54, 2);
  const b = (await api(alice, 'api_duel_create', defi({ opp: bot, stake: 27 }))).duel;         // contre un bot : accepté tout de suite, sans mouvement d'argent côté bot
  expect(b).toMatchObject({ st: 'active', opp: bot, price: 54, pot: 50, oppStake: 23 });
  expect((await stats(bot)).balance).toBe(0);
});

test('résolution du marché : le gagnant prend la cagnotte, chacun est prévenu, statistiques et historique à jour', async () => {
  const a0 = await stats(alice), b0 = await stats(bob), c0 = await stats(carol);
  const duels = await q(db, `select id, par, adv, cote, mise::float8 as mise, mise_adv::float8 as autre, cagnotte::float8 as pot from wm.duels where m = 'clasico' and etat = 'active' order by id`);
  expect(duels).toHaveLength(3);                                                              // alice-bob (oui), alice-carol (non), alice-bot (oui)
  const ouvert = (await api(bob, 'api_duel_create', defi({ opp: alice, stake: 15 }))).duel;     // un duel encore sans réponse au moment de la résolution
  const bAvant = await stats(bob);
  await enTantQue(db, chef, s => s(`select public.api_admin('resoudre', '{"id": "clasico", "issue": "oui"}'::jsonb)`));
  expect((await q(db, `select etat, gagnant from wm.duels where m = 'clasico' and id = any($1) order by id`, [duels.map(d => d.id)]))).toEqual([{ etat: 'regle', gagnant: 'oui' }, { etat: 'regle', gagnant: 'oui' }, { etat: 'regle', gagnant: 'oui' }]);
  // alice gagne contre bob (cagnotte 100) et contre le bot (cagnotte 50), perd contre carol (elle disait Non)
  expect((await stats(alice)).balance).toBeCloseTo(a0.balance + 100 + 50, 2);
  expect((await stats(carol)).balance).toBeCloseTo(c0.balance + duels[1].pot, 2);
  expect((await stats(bob)).balance).toBeCloseTo(bAvant.balance + 15, 2);                      // son duel sans réponse lui est rendu ; l'autre est perdu
  const a1 = await stats(alice);
  expect([a1.settled - a0.settled, a1.wins - a0.wins]).toEqual([3, 2]);
  expect(a1.realise).toBeCloseTo(a0.realise + (100 - 54) + (50 - 27) - 10, 2);
  expect((await stats(bob)).settled - b0.settled).toBe(1);
  expect((await q(db, 'select etat from wm.duels where id = $1', [ouvert.id]))[0].etat).toBe('expired');
  const hist = await q(db, `select user_id, question, side, was_winner, pnl::float8 as pnl from public.position_history where question like 'duel|%' and user_id = $1 order by pnl desc`, [alice]);
  expect(hist.map(h => [h.question, h.side, h.was_winner])).toEqual([['duel|' + bob + '|clasico', 'oui', true], ['duel|' + bot + '|clasico', 'oui', true], ['duel|' + carol + '|clasico', 'non', false]]);
  const notifs = await q(db, `select user_id, code from public.notifications where code in ('duel_gagne', 'duel_perdu') order by user_id, code`);
  expect(notifs.filter(n => n.user_id === alice).map(n => n.code)).toEqual(['duel_gagne', 'duel_gagne', 'duel_perdu']);
  expect(notifs.filter(n => n.user_id === bob).map(n => n.code)).toEqual(['duel_perdu']);
  expect(notifs.filter(n => n.user_id === bot)).toEqual([]);                                   // les bots ne reçoivent rien
  expect(await non(alice, 'api_duel_create', defi())).toMatch(/marche_ferme/);
});
