// Partager une mise dans le chat et la suivre, côté serveur : carte dans le salon, suivis des bots crédités par la
// tâche de fond, suivi d'un vrai joueur, bornes (une fois par 24 heures, un suivi par joueur).
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, fer;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 1000); max = await creerJoueur(db, 'max', 1000); fer = await creerJoueur(db, 'fer', 1000);
  await q(db, 'update public.user_stats set xp = 900, bets_settled = 12, bets_won = 7, deposits_count = 1 where user_id = any ($1)', [[lea, max]]);   // rang Argent
  for (let i = 0; i < 6; i++) { const [{ id }] = await q(db, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [`bot${i}@test.dev`, JSON.stringify({ username: 'bot' + i })]); await q(db, 'update public.users set is_demo = true where id = $1', [id]); }
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const stats = async u => (await q(db, 'select xp, coalesce(followed_bets_count, 0) as suivies from public.user_stats where user_id = $1', [u]))[0];
let MSG;

test('partager une position : carte dans le salon, +5 XP, une fois par 24 heures ; rang Bronze et position demandés', async () => {
  expect(await refus(db, null, `select public.api_chat_share('general', 'btc150k', 'oui')`)).toMatch(/permission denied/);
  expect(await non(lea, `api_chat_share('general', 'btc150k', 'oui')`)).toMatch(/position_absente/);
  await api(lea, `api_buy('btc150k', 'oui', 200, $1)`, [randomUUID()]);
  await api(fer, `api_buy('btc150k', 'oui', 20, $1)`, [randomUUID()]);
  expect(await non(fer, `api_chat_share('general', 'btc150k', 'oui')`)).toMatch(/rang_insuffisant/);
  expect(await non(lea, `api_chat_share('secret', 'btc150k', 'oui')`)).toMatch(/salon_indisponible/);
  expect(await non(lea, `api_chat_share('general', 'btc150k', 'peut-etre')`)).toMatch(/cote_invalide/);
  const x0 = (await stats(lea)).xp;
  const r = await api(lea, `api_chat_share('m:btc150k', 'btc150k', 'oui')`);
  MSG = r.msg.id;
  expect(r.msg).toMatchObject({ u: lea, k: 'bet', text: '', fc: 0, bet: { m: 'btc150k', s: 'oui', amt: 196 } });   // 200 $ moins les frais d'entrée
  expect(r.msg.bet.price).toBeGreaterThan(60);
  expect(r.me.xp).toBe(x0 + 5);
  // un à trois suivis de bots sont programmés, entre 4 et 18 secondes après le partage (jamais tout de suite)
  const [plan] = await q(db, `select count(*)::int as n, min(extract(epoch from s.du_at - c.created_at))::float8 as premier, max(extract(epoch from s.du_at - c.created_at))::float8 as dernier,
    count(distinct s.user_id)::int as bots from wm.chat_suivis s join public.chat_messages c on c.id = s.message_id where c.id = $1`, [MSG]);
  expect(plan.n).toBeGreaterThanOrEqual(1); expect(plan.n).toBeLessThanOrEqual(3); expect(plan.bots).toBe(plan.n);
  expect(plan.premier).toBeGreaterThanOrEqual(4); expect(plan.dernier).toBeLessThan(18);
  expect((await q(db, `select payload ->> 'k' as k, payload -> 'f' ->> 'n' as auteur from realtime.messages where topic = 'salon:m:btc150k' and event = 'msg' order by inserted_at desc limit 1`))[0]).toEqual({ k: 'bet', auteur: 'lea' });
  await q(db, `update public.chat_messages set created_at = created_at - interval '5 seconds' where id = $1`, [MSG]);
  expect(await non(lea, `api_chat_share('general', 'btc150k', 'oui')`)).toMatch(/deja_partage/);        // la même position, même dans un autre salon
  const h = await api(max, `api_chat_history('m:btc150k')`);
  expect(h.msgs.find(m => m.id === MSG)).toMatchObject({ k: 'bet', bet: { m: 'btc150k', s: 'oui' }, fc: 0 });
  expect(await refus(db, lea, 'select * from wm.chat_suivis')).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select wm.chat_suivis_tick()')).toMatch(/permission denied/);
  expect(await refus(db, lea, 'select wm.chat_suivi_crediter(1)')).toMatch(/permission denied/);
});

test('un à trois joueurs suivent la mise dans les secondes qui viennent : 20 XP et une « mise suivie » par suivi, annoncés en direct', async () => {
  const prevus = await q(db, 'select id from wm.chat_suivis where message_id = $1 order by du_at', [MSG]);
  expect(prevus.length).toBeGreaterThanOrEqual(1); expect(prevus.length).toBeLessThanOrEqual(3);
  await q(db, `update wm.chat_suivis set du_at = now() + interval '1 hour' where message_id = $1`, [MSG]);
  expect((await q(db, 'select wm.chat_suivis_tick() as n'))[0].n).toBe(0);                        // pas avant l'heure prévue
  const a0 = await stats(lea);
  await q(db, `update wm.chat_suivis set du_at = now() - interval '1 second' where message_id = $1`, [MSG]);
  expect((await q(db, 'select wm.chat_suivis_tick() as n'))[0].n).toBe(prevus.length);
  expect(await stats(lea)).toEqual({ xp: a0.xp + 20 * prevus.length, suivies: a0.suivies + prevus.length });
  expect((await q(db, 'select followers_count as fc from public.chat_messages where id = $1', [MSG]))[0].fc).toBe(prevus.length);
  expect((await q(db, `select count(*)::int as n from public.notifications where user_id = $1 and code = 'mise_suivie'`, [lea]))[0].n).toBe(prevus.length);
  expect((await q(db, `select (payload ->> 'fc')::int as fc from realtime.messages where topic = 'salon:m:btc150k' and event = 'fc' order by inserted_at desc, (payload ->> 'fc')::int desc limit 1`))[0].fc).toBe(prevus.length);
  expect((await q(db, 'select wm.chat_suivis_tick() as n'))[0].n).toBe(0);                        // une seule fois
  expect(await q(db, `select schedule, command from cron.job where jobname = 'wm-suivis'`)).toEqual([{ schedule: '5 seconds', command: 'select wm.chat_suivis_tick()' }]);
});

test('un vrai joueur suit la mise : rang Argent, même pari que l’auteur, une seule fois ; +5 XP pour lui, +20 XP pour l’auteur', async () => {
  expect(await non(lea, 'api_chat_follow($1)', [MSG])).toMatch(/mise_indisponible/);             // pas la sienne
  expect(await non(fer, 'api_chat_follow($1)', [MSG])).toMatch(/rang_insuffisant/);
  expect(await non(max, 'api_chat_follow($1)', [MSG])).toMatch(/position_absente/);              // il faut avoir parié comme lui
  expect(await non(max, 'api_chat_follow(999999)')).toMatch(/mise_indisponible/);
  await api(max, `api_buy('btc150k', 'oui', 30, $1)`, [randomUUID()]);
  const a0 = await stats(lea), m0 = await stats(max), fc0 = (await q(db, 'select followers_count as fc from public.chat_messages where id = $1', [MSG]))[0].fc;
  const r = await api(max, 'api_chat_follow($1)', [MSG]);
  expect(r).toMatchObject({ id: MSG, fc: fc0 + 1 });
  expect(r.me.xp).toBe(m0.xp + 5);
  expect(await stats(lea)).toEqual({ xp: a0.xp + 20, suivies: a0.suivies + 1 });
  expect((await q(db, `select params ->> 'u' as u from public.notifications where user_id = $1 and code = 'mise_suivie' order by created_at desc limit 1`, [lea]))[0].u).toBe(max);
  expect(await non(max, 'api_chat_follow($1)', [MSG])).toMatch(/deja_suivi/);
  expect(await stats(lea)).toEqual({ xp: a0.xp + 20, suivies: a0.suivies + 1 });
});
