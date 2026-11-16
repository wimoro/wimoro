// Partager une mise dans une conversation privée, côté serveur : la carte ne va qu'à l'ami, lui seul peut la suivre, et
// le compteur de suivis n'est envoyé qu'aux deux participants.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, zoe;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 1000); max = await creerJoueur(db, 'max', 1000); zoe = await creerJoueur(db, 'zoe', 1000);
  for (const u of [lea, max, zoe]) await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, 'update public.user_stats set xp = 900, bets_settled = 12, bets_won = 7, deposits_count = 1 where user_id = any ($1)', [[lea, max, zoe]]);   // rang Argent
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 10) i`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const stats = async u => (await q(db, 'select xp, coalesce(followed_bets_count, 0) as suivies from public.user_stats where user_id = $1', [u]))[0];
const plusTard = () => q(db, `update public.chat_messages set created_at = created_at - interval '5 seconds'`);
const pousses = () => q(db, `select topic, event, private, payload from realtime.messages where event in ('dm', 'msg', 'fc') order by event, topic`);
let MSG;

test('partager une mise à un ami en privé : la carte est dans la conversation, poussée à lui seul ; 5 XP ; aucun joueur simulé ne la suit', async () => {
  await api(lea, `api_friend('add', $1)`, [max]); await api(max, `api_friend('accept', $1)`, [lea]);
  await api(lea, `api_friend('add', $1)`, [zoe]); await api(zoe, `api_friend('accept', $1)`, [lea]);              // Zoé est amie de Léa, pas de Max
  for (const u of [lea, max, zoe]) await api(u, `api_buy('btc150k', 'oui', 100, $1)`, [randomUUID()]);
  expect(await non(max, `api_chat_share($1, 'btc150k', 'oui')`, ['dm:' + zoe])).toMatch(/pas_amis/);
  expect(await non(lea, `api_chat_share('dm:pas-un-identifiant', 'btc150k', 'oui')`)).toMatch(/salon_indisponible/);
  expect(await non(lea, `api_chat_share($1, 'btc150k', 'oui')`, ['dm:' + lea])).toMatch(/joueur_inconnu/);
  expect(await non(lea, `api_chat_share($1, 'clasico', 'oui')`, ['dm:' + max])).toMatch(/position_absente/);
  await q(db, 'truncate realtime.messages');
  const x0 = (await stats(lea)).xp;
  const r = await api(lea, `api_chat_share($1, 'btc150k', 'oui')`, ['dm:' + max]);
  MSG = r.msg.id;
  expect(r.msg).toMatchObject({ u: lea, k: 'bet', text: '', fc: 0, bet: { m: 'btc150k', s: 'oui' } });
  expect((await stats(lea)).xp).toBe(x0 + 5);
  const p = await pousses();
  expect(p.map(e => [e.topic, e.event, e.private])).toEqual([['joueur:' + max, 'dm', true]]);                   // rien sur un salon, rien à un tiers
  expect(p[0].payload).toMatchObject({ id: MSG, k: 'bet', bet: { m: 'btc150k', s: 'oui' }, f: { n: 'lea' } });
  expect((await q(db, `select room_id from public.chat_messages where id = $1`, [MSG]))[0].room_id).toMatch(/^dm:/);
  expect((await q(db, 'select count(*)::int as n from wm.chat_suivis where message_id = $1', [MSG]))[0].n, 'pas de suivi de bot en privé').toBe(0);
  expect(await q(db, `select code from public.notifications where user_id = $1 and code = 'dm_recu'`, [max])).toHaveLength(1);
  expect((await api(max, 'api_dm_history($1)', [lea])).msgs.find(m => m.id === MSG)).toMatchObject({ k: 'bet', fc: 0, bet: { m: 'btc150k', s: 'oui' } });
  expect(await refus(db, zoe, 'select public.api_dm_history($1)', [max])).toMatch(/pas_amis/);
  // une fois par 24 heures et par position, tous salons confondus
  await plusTard();
  expect(await non(lea, `api_chat_share('general', 'btc150k', 'oui')`)).toMatch(/deja_partage/);
  expect(await non(lea, `api_chat_share($1, 'btc150k', 'oui')`, ['dm:' + zoe])).toMatch(/deja_partage/);
});

test('seul l’ami de la conversation peut la suivre : compteur envoyé aux deux participants seulement, 20 XP pour l’auteur ; un tiers ou un ancien ami ne peut pas', async () => {
  expect(await non(zoe, 'api_chat_follow($1)', [MSG]), 'amie de Léa, mais hors de cette conversation').toMatch(/mise_indisponible/);
  await q(db, 'truncate realtime.messages');
  const l0 = await stats(lea), m0 = await stats(max);
  expect(await api(max, 'api_chat_follow($1)', [MSG])).toMatchObject({ id: MSG, fc: 1 });
  expect(await stats(lea)).toEqual({ xp: l0.xp + 20, suivies: l0.suivies + 1 });
  expect((await stats(max)).xp).toBe(m0.xp + 5);
  const p = await pousses();
  expect(p.map(e => [e.topic, e.event, e.private, e.payload])).toEqual([
    ['joueur:' + lea, 'fc', true, { id: MSG, fc: 1, u: max }],
    ['joueur:' + max, 'fc', true, { id: MSG, fc: 1, u: lea }]].sort((a, b) => a[0] < b[0] ? -1 : 1));
  expect((await q(db, `select params from public.notifications where user_id = $1 and code = 'mise_suivie'`, [lea]))[0].params).toMatchObject({ u: max, n: 'max', id: MSG, room: 'dm:' + max });
  expect(await non(max, 'api_chat_follow($1)', [MSG])).toMatch(/deja_suivi/);
  expect((await api(lea, 'api_dm_history($1)', [max])).msgs.find(m => m.id === MSG).fc).toBe(1);
  // plus amis : la mise partagée en privé ne se suit plus
  for (const u of [lea, max]) await api(u, `api_buy('clasico', 'non', 50, $1)`, [randomUUID()]);
  await plusTard();
  const autre = (await api(lea, `api_chat_share($1, 'clasico', 'non')`, ['dm:' + max])).msg.id;
  await api(max, `api_friend('remove', $1)`, [lea]);
  expect(await non(max, 'api_chat_follow($1)', [autre])).toMatch(/mise_indisponible/);
  expect(await non(lea, `api_chat_share($1, 'clasico', 'oui')`, ['dm:' + max])).toMatch(/pas_amis/);
});
