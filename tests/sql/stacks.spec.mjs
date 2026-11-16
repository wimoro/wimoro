// Duels de stack côté serveur : buy-in pris, stack du joueur lu sur ses résultats réels, adversaire simulé, règlement au
// bout de sept jours (cagnotte moins 4 %, 30 XP), égalité, refus.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, bot;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 1000); max = await creerJoueur(db, 'max', 1000);
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_stack', 'bot_stack@nulle.part', true) returning id`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, coalesce(profit_realized, 0)::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const corps = (plus = {}) => JSON.stringify({ buyin: 25, opp: bot, key: randomUUID(), ...plus });
const adverse = async (id, h) => (await q(db, 'select wm.stack_adverse($1, $2) as n', [id, h]))[0].n;
/** fait passer le temps : le duel a commencé il y a `jours` jours */
const vieillir = (id, jours) => q(db, `update wm.stacks set cree_at = cree_at - make_interval(secs => $2::float8 * 86400), fin_at = fin_at - make_interval(secs => $2::float8 * 86400) where id = $1`, [id, jours]);

test('lancer un duel de stack contre un joueur simulé : buy-in pris, 1 000 jetons chacun, sept jours ; ce que le serveur refuse', async () => {
  expect(await refus(db, null, 'select public.api_stack_create($1::jsonb)', [corps()])).toMatch(/permission denied/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ buyin: 2 })])).toMatch(/montant_invalide/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ buyin: 5000 })])).toMatch(/montant_invalide/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ key: null })])).toMatch(/cle_absente/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ opp: 'lea' })])).toMatch(/joueur_inconnu/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ opp: randomUUID() })])).toMatch(/joueur_inconnu/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ opp: lea })])).toMatch(/joueur_inconnu/);
  expect(await non(lea, 'api_stack_create($1::jsonb)', [corps({ opp: max })])).toMatch(/stack_joueur_reel/);       // un vrai joueur devrait donner son accord
  const cle = randomUUID();
  const r = await api(lea, 'api_stack_create($1::jsonb)', [corps({ key: cle })]);
  expect(r.me.balance).toBe(975);
  expect(r.stacks.liste).toHaveLength(1);
  const s = r.stacks.liste[0];
  expect(s).toMatchObject({ id: r.stack, opp: bot, buyin: 25, st: 'active', my: 1000, theirs: 1000 });
  expect(s.endAt - s.at).toBe(7 * 86400e3);
  expect(r.stacks.users[bot]).toMatchObject({ n: 'bot_stack', bot: true });
  expect((await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id desc limit 1`, [lea]))[0]).toEqual({ kind: 'stack', a: -25 });
  expect((await q(db, `select code, params ->> 'u' as u from public.notifications where user_id = $1 order by created_at desc limit 1`, [lea]))[0]).toEqual({ code: 'stack_lance', u: bot });
  // la même clé rejouée : une seule mise
  expect(await api(lea, 'api_stack_create($1::jsonb)', [corps({ key: cle })])).toMatchObject({ rejoue: true, stack: r.stack });
  expect((await stats(lea)).balance).toBe(975);
  // l'état du joueur porte ses duels de stack
  expect((await api(lea, 'api_state()')).stacks.liste.map(x => x.id)).toEqual([r.stack]);
  expect((await api(max, 'api_state()')).stacks.liste).toEqual([]);
  expect(await refus(db, lea, 'select * from wm.stacks')).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select wm.stacks_avant($1)', [lea])).toMatch(/permission denied/);
});

test('le stack du joueur suit ses résultats réels (réalisés et positions) ; celui de l’adversaire, sa trajectoire semée', async () => {
  const id = (await api(lea, 'api_stacks()')).stacks.liste[0].id;
  // résultat réalisé : +40 $ → 1 040 jetons
  await q(db, 'update public.user_stats set profit_realized = coalesce(profit_realized, 0) + 40 where user_id = $1', [lea]);
  expect((await api(lea, 'api_stacks()')).stacks.liste[0].my).toBe(1040);
  // une position qui prend de la valeur : 100 parts achetées 50 ¢, le marché passe à 62 ¢ → +12 $
  await q(db, `insert into public.positions (user_id, market_id, side, shares, average_price) values ($1, 'clasico', 'oui', 100, 50)`, [lea]);
  await q(db, `update public.market_live_state set current_probability = 62 where market_id = 'clasico'`);
  expect((await api(lea, 'api_stacks()')).stacks.liste[0].my).toBe(1052);
  await q(db, `update public.market_live_state set current_probability = 20 where market_id = 'clasico'`);          // puis s'effondre : −30 $
  expect((await api(lea, 'api_stacks()')).stacks.liste[0].my).toBe(1010);
  // l'adversaire : même trajectoire à chaque lecture, heure par heure, bornée à sept jours
  expect(await adverse(id, 0)).toBe(1000);
  const h24 = await adverse(id, 24), h168 = await adverse(id, 168);
  expect(await adverse(id, 24)).toBe(h24); expect(await adverse(id, 500)).toBe(h168);
  expect(h168).toBeGreaterThan(400); expect(h168).toBeLessThan(2500);
  await vieillir(id, 1);
  expect((await api(lea, 'api_stacks()')).stacks.liste[0].theirs).toBe(h24);
  // sur beaucoup de duels, l'adversaire finit le plus souvent entre 800 et 1 300 jetons
  const fins = (await q(db, 'select wm.stack_adverse(i, 168) as n from generate_series(1000, 1399) i')).map(x => x.n);
  const milieu = fins.filter(n => n >= 800 && n <= 1300).length / fins.length;
  expect(milieu).toBeGreaterThan(0.7);
  expect(Math.min(...fins)).toBeGreaterThan(500); expect(Math.max(...fins)).toBeLessThan(2000);
});

test('au bout de sept jours : le plus gros stack remporte la cagnotte moins 4 % et 30 XP ; perdu : rien ; égalité : buy-in rendu', async () => {
  const id = (await api(lea, 'api_stacks()')).stacks.liste[0].id, lui = await adverse(id, 168);
  // avant la fin : rien n'est réglé
  await vieillir(id, 5);
  expect((await api(lea, 'api_stacks()')).stacks.liste[0].st).toBe('active');
  // Léa finit devant : on règle au premier passage après la fin
  await q(db, `update public.market_live_state set current_probability = 50 where market_id = 'clasico'`);
  await q(db, 'update public.user_stats set profit_realized = $2 where user_id = $1', [lea, lui - 1000 + 60]);     // 20 $ d'avance (40 étaient déjà comptés au départ ? non : ref = 0)
  const s0 = await stats(lea);
  await vieillir(id, 1.01);
  const r = await api(lea, 'api_state()');
  const fini = r.stacks.liste.find(x => x.id === id);
  expect(fini).toMatchObject({ st: 'won', theirs: lui });
  expect(fini.my).toBeGreaterThan(lui);
  const s1 = await stats(lea);
  expect(s1.balance).toBeCloseTo(s0.balance + 48, 2);                                                               // 2 × 25 $ moins 4 %
  expect(s1.xp).toBe(s0.xp + 30);
  expect(s1.realise).toBeCloseTo(s0.realise + 23, 2);
  expect((await q(db, `select code, (params ->> 'gain')::float8 as gain from public.notifications where user_id = $1 order by created_at desc limit 1`, [lea]))[0]).toEqual({ code: 'stack_gagne', gain: 23 });
  expect((await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id desc limit 1`, [lea]))[0]).toEqual({ kind: 'stack_gain', a: 48 });
  expect((await api(lea, 'api_stacks()')).stacks.liste.find(x => x.id === id).st, 'une seule fois').toBe('won');
  expect((await stats(lea)).balance).toBeCloseTo(s1.balance, 2);

  // perdu : Max ne fait rien de la semaine, son adversaire finit au-dessus de 1 000 (on choisit un duel où c'est le cas)
  let perdu; for (let i = 0; i < 40 && !perdu; i++) { const x = await api(max, 'api_stack_create($1::jsonb)', [corps({ buyin: 10 })]); if (await adverse(x.stack, 168) > 1000) perdu = x.stack; else await q(db, `update wm.stacks set etat = 'void', regle_at = now() where id = $1`, [x.stack]); }
  expect(perdu, 'un duel où l’adversaire simulé finit devant').toBeTruthy();
  const m0 = await stats(max);
  await vieillir(perdu, 7.01);
  expect((await api(max, 'api_stacks()')).stacks.liste.find(x => x.id === perdu)).toMatchObject({ st: 'lost', my: 1000 });
  expect(await stats(max)).toMatchObject({ balance: m0.balance, xp: m0.xp });
  expect((await stats(max)).realise).toBeCloseTo(m0.realise - 10, 2);
  expect((await q(db, `select code from public.notifications where user_id = $1 order by created_at desc limit 1`, [max]))[0].code).toBe('stack_perdu');

  // égalité : le buy-in est rendu
  const egal = (await api(max, 'api_stack_create($1::jsonb)', [corps({ buyin: 10 })])).stack;
  await q(db, 'update wm.stacks set ref = $2 where id = $1', [egal, (await stats(max)).realise - ((await adverse(egal, 168)) - 1000)]);   // de quoi finir pile au même stack
  const m1 = await stats(max);
  await vieillir(egal, 7.01);
  expect((await api(max, 'api_stacks()')).stacks.liste.find(x => x.id === egal).st).toBe('void');
  expect((await stats(max)).balance).toBeCloseTo(m1.balance + 10, 2);
});

test('cinq duels de stack en cours au plus ; pas de mise pendant une pause de jeu responsable', async () => {
  const noa = await creerJoueur(db, 'noa', 500);
  for (let i = 0; i < 5; i++) await api(noa, 'api_stack_create($1::jsonb)', [corps({ buyin: 5 })]);
  expect(await non(noa, 'api_stack_create($1::jsonb)', [corps({ buyin: 5 })])).toMatch(/trop_de_duels/);
  expect((await stats(noa)).balance).toBe(475);
  const fauche = await creerJoueur(db, 'fauche', 3);
  expect(await non(fauche, 'api_stack_create($1::jsonb)', [corps({ buyin: 5 })])).toMatch(/solde_insuffisant/);
});
