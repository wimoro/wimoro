// Paris combinés côté serveur : prix bloqués à la validation, 5 % sur le gain brut, encaissement à la valeur du moment,
// règlement sélection par sélection à la résolution des marchés.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, alice, bob;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'admin')`, [chef]);
  await db.exec(`
    insert into public.market_groups (id, category, question) values ('g', 'Politique', 'Qui gagnera ?');
    insert into public.markets (id, category, question, status, group_parent_id) values ('g-a', 'Politique', 'A ?', 'open', 'g'), ('g-b', 'Politique', 'B ?', 'open', 'g'), ('pluie', 'Météo', 'Pleuvra-t-il ?', 'open', null), ('ferme', 'Sport', 'Fermé ?', 'closed', null);
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values
      ('g-a', 60, 60, 2000000, 10, 12000), ('g-b', 40, 40, 1500000, 10, 9000), ('pluie', 25, 25, 1000000, 10, 6000), ('ferme', 50, 50, 1000000, 10, 6000);`);
});
test.afterAll(async () => { await db.close(); });

const placer = (qui, legs, stake = 10, plus = {}) => enTantQue(db, qui, s => s('select public.api_combo_place($1::jsonb) as r', [JSON.stringify({ legs, stake, key: randomUUID(), ...plus })])).then(r => r[0].r);
const non = (qui, legs, stake = 10) => refus(db, qui, 'select public.api_combo_place($1::jsonb)', [JSON.stringify({ legs, stake, key: randomUUID() })]);
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, bets_settled as settled, bets_won as wins, profit_realized::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const resoudre = (id, issue) => enTantQue(db, chef, s => s(`select public.api_admin('resoudre', $1::jsonb)`, [JSON.stringify({ id, issue })]));
const BTC = { m: 'btc150k', s: 'oui' }, CLA = { m: 'clasico', s: 'non' }, PLU = { m: 'pluie', s: 'oui' };

test('valider : 2 à 6 sélections sur des marchés différents et ouverts ; prix bloqués, 5 % du gain brut, mise prise une fois', async () => {
  expect(await refus(db, null, `select public.api_combo_place('{}'::jsonb)`)).toMatch(/permission denied/);
  expect(await non(alice, [BTC])).toMatch(/combine_incomplet/);
  expect(await non(alice, [BTC, CLA], 1)).toMatch(/montant_invalide/);
  expect(await non(alice, [BTC, { m: 'btc150k', s: 'non' }])).toMatch(/selection_en_double/);
  expect(await non(alice, [{ m: 'g-a', s: 'oui' }, { m: 'g-b', s: 'oui' }])).toMatch(/selection_en_double/);   // deux issues du même marché à cotes multiples
  expect(await non(alice, [BTC, { m: 'ferme', s: 'oui' }])).toMatch(/marche_ferme/);
  expect(await non(alice, [BTC, { m: 'inconnu', s: 'oui' }])).toMatch(/marche_inconnu/);
  expect(await non(alice, [BTC, { m: 'clasico', s: 'peut-etre' }])).toMatch(/cote_invalide/);
  expect((await stats(alice)).balance).toBe(1000);
  const cle = randomUUID();
  const r = await placer(alice, [BTC, CLA], 10, { key: cle });
  // Oui à 63 ¢ (×1,5873) et Non à 46 ¢ (×2,1739) : ×3,4507
  expect(r.combo.legs).toMatchObject([{ m: 'btc150k', s: 'oui', price: 63, res: null }, { m: 'clasico', s: 'non', price: 46, res: null }]);
  expect(r.combo.mult).toBeCloseTo(100 / 63 * 100 / 46, 6);
  expect(r.combo).toMatchObject({ stake: 10, status: 'open', fee: 1.73, pay: 32.78 });       // brut 34,51 ; 5 % = 1,73
  expect(r.me.balance).toBe(990);
  expect((await enTantQue(db, alice, s => s('select public.api_combo_place($1::jsonb) as r', [JSON.stringify({ legs: [BTC, CLA], stake: 10, key: cle })])))[0].r.rejoue).toBe(true);
  expect(await stats(alice)).toMatchObject({ balance: 990, xp: 20 });                         // 10 + 5 par sélection
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.combos).toHaveLength(1);
  expect(await refus(db, alice, 'select * from wm.combos')).toMatch(/permission denied/);
  const gros = await placer(bob, [{ m: 'pluie', s: 'oui' }, { m: 'g-b', s: 'oui' }, { m: 'btc150k', s: 'non' }, { m: 'clasico', s: 'non' }], 1000);   // ×4 × 2,5 × 2,7 × 2,17 : plafonné
  expect(gros.combo.pay).toBe(50000);
});

test('encaisser avant la fin : gain promis × probabilité du moment, moins 5 % ; une seule fois, et seulement le sien', async () => {
  const [{ id }] = await q(db, 'select id from wm.combos where user_id = $1 order by id limit 1', [alice]);
  expect(await refus(db, bob, 'select public.api_combo_cash($1)', [id])).toMatch(/combine_indisponible/);
  await q(db, `update public.market_live_state set current_probability = 80 where market_id = 'btc150k'`);   // le marché bouge en sa faveur
  const a0 = await stats(alice);
  const r = (await enTantQue(db, alice, s => s('select public.api_combo_cash($1) as r', [id])))[0].r;
  const valeur = Math.trunc(32.78 * 0.80 * 0.46 * 0.95 * 100) / 100;                          // 11,46
  expect(r.combo).toMatchObject({ status: 'cashed', cash: valeur });
  expect(r.hist).toMatchObject([{ k: 'res', q: 'combo|c|2|' + valeur, win: true }]);
  expect(await stats(alice)).toMatchObject({ balance: Math.round((a0.balance + valeur) * 100) / 100, settled: a0.settled + 1, wins: a0.wins + 1, xp: a0.xp + 10 });
  expect(await refus(db, alice, 'select public.api_combo_cash($1)', [id])).toMatch(/combine_indisponible/);
  await q(db, `update public.market_live_state set current_probability = 63 where market_id = 'btc150k'`);
});

test('résolution : une sélection gagnée laisse le combiné en vie, une perdue le fait tomber, toutes gagnées il est payé', async () => {
  const gagnant = (await placer(alice, [CLA, PLU], 20)).combo;                                // Non clasico (46 ¢) et Oui pluie (25 ¢)
  const perdant = (await placer(alice, [{ m: 'clasico', s: 'oui' }, PLU], 20)).combo;         // Oui clasico : tombera
  const a0 = await stats(alice);
  await resoudre('pluie', 'oui');
  const apres = async id => (await q(db, 'select etat, legs from wm.combos where id = $1', [id]))[0];
  expect((await apres(gagnant.id)).etat).toBe('open');
  expect((await apres(gagnant.id)).legs.map(l => l.res)).toEqual([null, 'won']);
  expect((await stats(alice)).balance).toBe(a0.balance);                                      // rien n'est versé tant qu'une sélection reste ouverte
  expect(await refus(db, alice, 'select wm.combo_valeur(c) from wm.combos c where c.id = $1', [gagnant.id])).toMatch(/permission denied/);   // fonction interne
  expect((await q(db, 'select wm.combo_valeur(c)::float8 as v from wm.combos c where c.id = $1', [gagnant.id]))[0].v).toBeCloseTo(Math.trunc(gagnant.pay * 0.46 * 0.95 * 100) / 100, 2);
  await resoudre('clasico', 'non');
  expect(await apres(gagnant.id)).toMatchObject({ etat: 'won' });
  expect((await apres(perdant.id)).etat).toBe('lost'); expect((await apres(perdant.id)).legs.map(l => l.res)).toEqual(['lost', 'won']);
  const a1 = await stats(alice);
  expect(a1.balance).toBeCloseTo(a0.balance + gagnant.pay, 2);
  expect([a1.settled - a0.settled, a1.wins - a0.wins]).toEqual([2, 1]);
  expect(a1.realise).toBeCloseTo(a0.realise + gagnant.pay - 20 - 20, 2);
  const hist = await q(db, `select question, was_winner, pnl::float8 as pnl from public.position_history where user_id = $1 and question like 'combo|%' and question not like 'combo|c|%' order by pnl desc`, [alice]);
  expect(hist.map(h => [h.question.split('|').slice(0, 3).join('|'), h.was_winner])).toEqual([['combo|g|2', true], ['combo|p|2', false]]);
  const notifs = (await q(db, `select code from public.notifications where user_id = $1 and code like 'combo_%' order by code`, [alice])).map(n => n.code);
  expect(notifs).toEqual(['combo_gagne', 'combo_perdu']);
  expect(await refus(db, alice, 'select public.api_combo_cash($1)', [gagnant.id])).toMatch(/combine_indisponible/);
  // le gros combiné de bob contenait « Non clasico » (gagné) et « Oui pluie » (gagné) : toujours ouvert, deux sélections restent
  expect((await q(db, 'select etat, legs from wm.combos where user_id = $1', [bob]))[0]).toMatchObject({ etat: 'open' });
});
