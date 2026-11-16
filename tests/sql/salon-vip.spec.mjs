// Salon VIP côté serveur : ouvert au rang Ascendant et au-dessus, diffusé sur un sujet privé que seuls ces joueurs peuvent
// écouter. Et : suivre une mise partagée demande d'avoir accès au salon où elle a été publiée.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, zoe;
const ASCENDANT = `xp = 4600, bets_settled = 200, bets_won = 130, deposits_count = 1, flash_wins = 3, followed_bets_count = 100`;
const ARGENT = `xp = 900, bets_settled = 12, bets_won = 7, deposits_count = 1, flash_wins = 0, followed_bets_count = 0`;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 1000); max = await creerJoueur(db, 'max', 1000); zoe = await creerJoueur(db, 'zoe', 1000);
  for (const u of [lea, max, zoe]) await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, `update public.user_stats set ${ASCENDANT} where user_id = any ($1)`, [[lea, max]]);
  await q(db, `update public.user_stats set ${ARGENT} where user_id = $1`, [zoe]);                // Zoé : rang Argent seulement
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 20) i`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const plusTard = () => q(db, `update public.chat_messages set created_at = created_at - interval '2 minutes'`);
const diffusions = () => q(db, `select topic, event, private from realtime.messages where topic = 'vip' or topic like 'salon:%' order by inserted_at`);
/** ce qu'un joueur pourrait recevoir sur un sujet temps réel (la règle d'accès de realtime.messages décide) */
const recevable = (uid, sujet) => enTantQue(db, uid, async s => { await s(`select set_config('realtime.topic', $1, true)`, [sujet]); return s(`select event from realtime.messages where topic = $1 order by inserted_at`, [sujet]); }).then(l => l.map(x => x.event));
const rang = u => enTantQue(db, u, s => s('select wm.vip_ok() as v')).then(l => l[0].v);
let MSG;

test('le salon VIP n’est ouvert qu’au rang Ascendant : écrire, relire, réagir ; ses messages passent par un sujet privé que les autres ne peuvent pas écouter', async () => {
  expect([await rang(lea), await rang(max), await rang(zoe)]).toEqual([true, true, false]);
  expect(await refus(db, null, `select public.api_chat_history('vip')`)).toMatch(/permission denied/);
  for (const appel of [`api_chat_history('vip')`, `api_chat_send('vip', 'coucou')`, `api_chat_react('vip', '1', '🔥')`, `api_chat_share('vip', 'btc150k', 'oui')`])
    expect(await non(zoe, appel), appel).toMatch(/rang_insuffisant/);
  expect(await refus(db, zoe, `select wm.chat_salon_ok('vip')`)).toMatch(/permission denied/);
  await q(db, 'truncate realtime.messages');
  const r = await api(lea, `api_chat_send('vip', 'Bonsoir le salon')`);
  MSG = r.msg.id;
  expect(r.msg).toMatchObject({ u: lea, k: 'msg', text: 'Bonsoir le salon' });
  expect(await diffusions()).toEqual([{ topic: 'vip', event: 'msg', private: true }]);              // rien sur un sujet public
  expect(await recevable(max, 'vip')).toEqual(['msg']);
  expect(await recevable(zoe, 'vip'), 'un joueur sans le rang ne peut pas écouter le salon').toEqual([]);
  expect(await recevable(zoe, 'salon:vip')).toEqual([]);
  expect((await q(db, `select kind from public.chat_rooms where id = 'vip'`))[0].kind).toBe('vip');
  // un autre VIP relit et réagit : le compteur part sur le sujet privé
  const h = await api(max, `api_chat_history('vip')`);
  expect(h.msgs.map(m => [m.id, m.text])).toEqual([[MSG, 'Bonsoir le salon']]);                    // pas de message de bot : ici ne parlent que les joueurs
  expect(h.users[lea]).toMatchObject({ n: 'lea', t: 6 });
  await q(db, 'truncate realtime.messages');
  expect(await api(max, `api_chat_react('vip', $1, '🔥')`, [String(MSG)])).toEqual({ id: MSG, r: { '🔥': 1 }, my: ['🔥'] });
  expect(await diffusions()).toEqual([{ topic: 'vip', event: 're', private: true }]);
  expect(await non(zoe, `api_chat_react('vip', $1, '🔥')`, [String(MSG)])).toMatch(/rang_insuffisant/);
  expect(await non(max, `api_chat_react('general', $1, '🔥')`, [String(MSG)])).toMatch(/message_indisponible/);   // un message VIP ne se touche pas par un salon public
  // les bots : aucun message dans ce salon, même regardé longtemps
  await enTantQue(db, max, s => s('select public.api_present()'));
  await api(max, `api_chat_seen($1::text[])`, [['vip']]); await api(zoe, `api_chat_seen($1::text[])`, [['vip']]);
  for (let i = 0; i < 40; i++) await q(db, 'select wm.bots_chat()');
  expect((await q(db, `select jsonb_array_length(msgs) as n from wm.chat_bots where room = 'vip'`))[0].n).toBe(0);
  expect((await q(db, `select count(*)::int as n from realtime.messages where topic = 'salon:vip'`))[0].n).toBe(0);
  // le rang perdu, le salon se referme
  await q(db, `update public.user_stats set followed_bets_count = 99 where user_id = $1`, [max]);
  expect(await rang(max)).toBe(false);
  expect(await non(max, `api_chat_history('vip')`)).toMatch(/rang_insuffisant/);
  expect(await recevable(max, 'vip')).toEqual([]);
  await q(db, `update public.user_stats set followed_bets_count = 100 where user_id = $1`, [max]);
});

test('une analyse partagée dans le salon VIP ne se lit qu’avec le rang ; l’administration voit et masque les messages du salon', async () => {
  await plusTard();
  const n = 4, T = 1794800000000, s = x => Array.from({ length: n }, (_, i) => x + i);
  const snap = { m: 'btc150k', iv: '1h', type: 'bougies', side: 'oui', ms: 3600000, T0: T, n, o: s(50), h: s(51), l: s(49), c: s(50), vol: s(100), end: n, vn: 8, inds: [], dr: [] };
  expect(await non(zoe, 'api_ana_share($1::jsonb, $2::text[], $3)', [JSON.stringify(snap), ['vip'], ''])).toMatch(/rang_insuffisant/);
  await q(db, 'truncate realtime.messages');
  const ana = (await api(lea, 'api_ana_share($1::jsonb, $2::text[], $3)', [JSON.stringify(snap), ['vip'], 'Entre nous'])).msgs.vip.id;
  expect(await diffusions()).toEqual([{ topic: 'vip', event: 'msg', private: true }]);
  expect(Object.keys((await api(max, 'api_ana($1::bigint[])', [[ana]])).snaps)).toEqual([String(ana)]);
  expect((await api(zoe, 'api_ana($1::bigint[])', [[ana]])).snaps, 'sans le rang : rien').toEqual({});
  // administration
  const vus = (await q(db, 'select wm.adm_chat() as r'))[0].r.msgs.filter(m => m.room === 'vip').map(m => [m.id, m.k]);
  expect(vus).toEqual([[ana, 'ana'], [MSG, 'msg']]);
  await q(db, 'truncate realtime.messages');
  await q(db, `select wm.adm_chat_masquer($1, $2)`, [lea, MSG]);
  expect(await q(db, `select topic, event, private from realtime.messages`)).toEqual([{ topic: 'vip', event: 'del', private: true }]);
  expect((await api(max, `api_chat_history('vip')`)).msgs.map(m => m.id)).toEqual([ana]);
});

test('suivre une mise partagée : seulement si l’on a accès au salon où elle a été publiée (clan, salon VIP)', async () => {
  await plusTard();
  for (const u of [lea, max, zoe]) await api(u, `api_buy('btc150k', 'oui', 50, $1)`, [randomUUID()]);
  await api(lea, `api_clan_join('c1', null)`);
  const duClan = (await api(lea, `api_chat_share('clan:c1', 'btc150k', 'oui')`)).msg.id;
  expect(await non(zoe, 'api_chat_follow($1)', [duClan]), 'hors du clan : la mise n’existe pas pour lui').toMatch(/mise_indisponible/);
  await api(max, `api_buy('clasico', 'oui', 50, $1)`, [randomUUID()]);
  await plusTard();
  const duVip = (await api(max, `api_chat_share('vip', 'clasico', 'oui')`)).msg.id;
  await api(zoe, `api_buy('clasico', 'oui', 20, $1)`, [randomUUID()]);
  expect(await non(zoe, 'api_chat_follow($1)', [duVip]), 'sans le rang du salon VIP').toMatch(/mise_indisponible/);
  expect((await q(db, 'select count(*)::int as n from wm.chat_suivis where user_id = $1', [zoe]))[0].n).toBe(0);
  // avec l'accès, suivre marche comme avant
  await api(zoe, `api_clan_join('c1', null)`);
  expect((await api(zoe, 'api_chat_follow($1)', [duClan])).fc).toBeGreaterThanOrEqual(1);
  await api(lea, `api_buy('clasico', 'oui', 20, $1)`, [randomUUID()]);
  expect((await api(lea, 'api_chat_follow($1)', [duVip])).fc).toBeGreaterThanOrEqual(1);
  // dans un salon public, rien ne change
  await plusTard();
  const publique = (await api(lea, `api_chat_share('general', 'clasico', 'oui')`)).msg.id;
  expect((await api(zoe, 'api_chat_follow($1)', [publique])).fc).toBeGreaterThanOrEqual(1);
});
