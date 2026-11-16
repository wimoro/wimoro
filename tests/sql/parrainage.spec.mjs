// Parrainage côté serveur : un code par joueur, 10 $ pour l'ami à la création de son compte, 10 $ pour le parrain au
// premier pari de son filleul. Le parrainage ne doit jamais empêcher de créer un compte ni de placer un pari.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, noa, ines;
test.beforeAll(async () => { db = await creerBase(); await semer(db); lea = await creerJoueur(db, 'lea.b', 100); });
test.afterAll(async () => { await db.close(); });

const etat = u => enTantQue(db, u, s => s('select public.api_state() as r')).then(r => r[0].r);
const inscrire = async (pseudo, ref, base = db) => (await base.query(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`,
  [pseudo + '@test.dev', JSON.stringify(ref === undefined ? { username: pseudo } : { username: pseudo, ref })])).rows[0].id;
const solde = async u => (await q(db, 'select balance::float8 as b from public.user_stats where user_id = $1', [u]))[0].b;
const crediter = (u, n) => q(db, 'update public.user_stats set balance = balance + $2 where user_id = $1', [u, n]);
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));
const parier = u => enTantQue(db, u, s => s(`select public.api_buy('btc150k', 'oui', 5, $1) as r`, [randomUUID()])).then(r => r[0].r);
let CODE;

test('chaque joueur a un code stable, de la forme PSEUDO-XXX ; les tables et les fonctions internes sont fermées', async () => {
  const e = await etat(lea);
  CODE = e.ref.code;
  expect(CODE).toMatch(/^LEAB-[A-Z0-9]{3}$/);
  expect(e.ref).toMatchObject({ bonus: 10, by: null, list: [] });
  expect((await etat(lea)).ref.code).toBe(CODE);
  await q(db, `update public.users set username = 'lea.renommee' where id = $1`, [lea]);       // le code ne change pas avec le pseudo
  expect((await etat(lea)).ref.code).toBe(CODE);
  await q(db, `update public.users set username = 'lea.b' where id = $1`, [lea]);
  const court = await creerJoueur(db, 'a..');                                                    // moins de deux lettres ou chiffres
  expect((await etat(court)).ref.code).toMatch(/^WIM-[A-Z0-9]{3}$/);
  const jumeau = await creerJoueur(db, 'lea..b');                                                // même base : un autre code
  const c2 = (await etat(jumeau)).ref.code;
  expect(c2).toMatch(/^LEAB-[A-Z0-9]{3}$/); expect(c2).not.toBe(CODE);
  expect(await refus(db, lea, 'select * from wm.parrainages')).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select * from wm.ref_codes')).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select wm.ref_appliquer($1, $2)', [lea, c2])).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select wm.ref_regler($1)', [lea])).toMatch(/permission denied/);
  expect(await refus(db, null, 'select public.api_state()')).toMatch(/permission denied/);
});

test('création du compte avec un code : 10 $ pour l’ami, le parrain est prévenu ; code inconnu, mal formé ou ajouté après coup : ignoré', async () => {
  const temoin = await inscrire('temoin');
  const depart = await solde(temoin);
  max = await inscrire('max', '  ' + CODE.toLowerCase() + ' ');                                  // saisi en minuscules, avec des espaces
  expect(await solde(max)).toBe(depart + 10);
  expect(await q(db, `select amount::float8 as a, balance_after::float8 as s, kind, ref_id from public.balance_ledger where user_id = $1`, [max])).toEqual([{ a: 10, s: depart + 10, kind: 'parrainage', ref_id: CODE }]);
  expect(await q(db, `select coin, network, usd_equivalent::float8 as usd, label, status from public.deposits where user_id = $1`, [max])).toEqual([{ coin: 'USDC', network: 'Wimoro', usd: 10, label: 'parrainage', status: 'completed' }]);
  expect(await notifs(max, 'parrain_bonus')).toEqual([{ gain: 10, code: CODE }]);
  expect(await notifs(lea, 'parrain_inscrit')).toEqual([{ n: 'max', gain: 10 }]);
  const eMax = await etat(max), eLea = await etat(lea);
  expect(eMax.ref.by).toBe(CODE);
  expect(eMax.me.deposits).toBe(0);                                                              // le bonus n'est pas compté comme un dépôt
  expect(eMax.deps).toMatchObject([{ label: 'parrainage', usd: 10 }]);
  expect(eLea.ref.list).toMatchObject([{ n: 'max', st: 'pending', paid: 0 }]);
  expect(eLea.me.balance).toBe(100);                                                             // rien pour le parrain avant le premier pari

  for (const [pseudo, code] of [['inconnu', 'ZZZZ-999'], ['malforme', 'abc'], ['vide', ''], ['injection', "x'; drop table wm.parrainages; --"]]) {
    const u = await inscrire(pseudo, code);
    expect(await solde(u), pseudo).toBe(depart);
    expect((await etat(u)).ref.by, pseudo).toBeNull();
  }
  ines = await inscrire('ines');                                                                 // inscrite sans code…
  await q(db, `update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1`, [ines, JSON.stringify({ ref: CODE })]);   // …qui l'ajoute après coup
  expect((await etat(ines)).ref.by).toBeNull();
  expect(await solde(ines)).toBe(depart);
  expect((await q(db, 'select count(*)::int as n from wm.parrainages'))[0].n).toBe(1);
});

test('premier pari du filleul, quel que soit le jeu : 10 $ pour le parrain, une seule fois', async () => {
  await crediter(max, 50);
  const r = await parier(max);
  expect(r.me.played).toBe(1);
  expect(await solde(lea)).toBe(110);
  expect(await notifs(lea, 'parrain_paye')).toEqual([{ n: 'max', gain: 10 }]);
  expect(await q(db, `select amount::float8 as a, balance_after::float8 as s, ref_id from public.balance_ledger where user_id = $1 and kind = 'parrainage'`, [lea])).toEqual([{ a: 10, s: 110, ref_id: max }]);
  await parier(max);                                                                             // deuxième pari : plus rien
  expect(await solde(lea)).toBe(110);
  expect((await etat(lea)).ref.list).toMatchObject([{ n: 'max', st: 'done', paid: 10 }]);

  noa = await inscrire('noa', CODE); await crediter(noa, 50);                                    // premier pari = un combiné
  await enTantQue(db, noa, s => s('select public.api_combo_place($1::jsonb)', [JSON.stringify({ legs: [{ m: 'btc150k', s: 'oui' }, { m: 'clasico', s: 'non' }], stake: 5, key: randomUUID() })]));
  expect(await solde(lea)).toBe(120);
  const l = (await etat(lea)).ref.list;
  expect(l.map(x => [x.n, x.st, x.paid])).toEqual([['noa', 'done', 10], ['max', 'done', 10]]);
  expect(l[0].doneAt).toBeGreaterThan(0);
});

test('un bonus manqué est rattrapé au chargement du parrain, et la réponse porte déjà le solde à jour', async () => {
  const tom = await inscrire('tom', CODE);
  await db.exec('alter table public.user_stats disable trigger ref_premier_pari');               // comme si le versement avait échoué au moment du pari
  await q(db, 'update public.user_stats set bets_placed = 1 where user_id = $1', [tom]);
  await db.exec('alter table public.user_stats enable trigger ref_premier_pari');
  expect(await solde(lea)).toBe(120);
  const e = await etat(lea);
  expect(e.me.balance).toBe(130);
  expect(e.ref.list.find(x => x.n === 'tom')).toMatchObject({ st: 'done', paid: 10 });
  expect(e.notifs.filter(n => n.code === 'parrain_paye')).toHaveLength(3);
  expect((await etat(lea)).me.balance).toBe(130);                                                // une seule fois
});

test('une panne du parrainage n’empêche ni de créer un compte ni de placer un pari', async () => {
  const eva = await inscrire('eva', CODE); await crediter(eva, 50);
  await db.exec(`
    create or replace function wm.ref_regler(p_parrain uuid) returns integer language plpgsql as $f$ begin raise exception 'panne'; end $f$;
    create or replace function wm.ref_appliquer(p_filleul uuid, p_code text) returns boolean language plpgsql as $f$ begin raise exception 'panne'; end $f$;`);
  const r = await parier(eva);                                                                   // le pari passe, le bonus attend
  expect(r.me.played).toBe(1);
  expect(await solde(lea)).toBe(130);
  const zoe = await inscrire('zoe', CODE);                                                       // le compte est créé, sans bonus
  expect((await q(db, 'select username from public.users where id = $1', [zoe]))[0].username).toBe('zoe');
  expect((await q(db, 'select count(*)::int as n from wm.parrainages where filleul = $1', [zoe]))[0].n).toBe(0);
});
