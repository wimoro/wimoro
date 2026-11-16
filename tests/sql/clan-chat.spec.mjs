// Chat de clan côté serveur : un salon réservé aux membres, diffusé sur un sujet PRIVÉ que seuls ils peuvent recevoir.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, zoe;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 500); max = await creerJoueur(db, 'max', 500); zoe = await creerJoueur(db, 'zoe', 500);
  for (const u of [lea, max, zoe]) await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, `update public.user_stats set xp = 400, bets_settled = 3 where user_id = any ($1)`, [[lea, max, zoe]]);          // rang Bronze : partage de mise débloqué
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 120) i`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const plusTard = () => q(db, `update public.chat_messages set created_at = created_at - interval '5 seconds'`);
/** tout ce que le chat a diffusé (salons publics ou sujets de clan) */
const diffusions = () => q(db, `select topic, event, private from realtime.messages where topic like 'salon:%' or topic like 'clan:%' order by inserted_at`);
/** ce qu'un joueur pourrait recevoir sur un sujet temps réel (la règle d'accès de realtime.messages décide) */
const recevable = (uid, sujet) => enTantQue(db, uid, async s => { await s(`select set_config('realtime.topic', $1, true)`, [sujet]); return s(`select event from realtime.messages where topic = $1 order by inserted_at`, [sujet]); }).then(l => l.map(x => x.event));
let MSG, BOT;

test('le salon d’un clan n’est ouvert qu’à ses membres ; à sa première ouverture, les trois messages d’accueil de la démo', async () => {
  for (const appel of [`api_chat_history('clan:c1')`, `api_chat_send('clan:c1', 'coucou')`, `api_chat_react('clan:c1', '1', '🔥')`, `api_chat_share('clan:c1', 'btc150k', 'oui')`])
    expect(await non(lea, appel), appel).toMatch(/salon_indisponible/);                                               // pas encore membre
  expect(await enTantQue(db, lea, s => s('select wm.clan_sujet() as s'))).toEqual([{ s: null }]);
  await api(lea, `api_clan_join('c1', null)`); await api(max, `api_clan_join('c1', null)`); await api(zoe, `api_clan_join('c4', null)`);
  expect(await enTantQue(db, lea, s => s('select wm.clan_sujet() as s'))).toEqual([{ s: 'clan:c1' }]);
  expect(await refus(db, null, 'select wm.clan_sujet()')).toMatch(/permission denied/);

  const h = await api(lea, `api_chat_history('clan:c1')`);
  expect(h.msgs.map(m => [m.k, m.text, m.tpl])).toEqual([['msg', '', { g: 'C', i: 0 }], ['msg', '', { g: 'C', i: 1 }], ['msg', '', { g: 'C', i: 2 }]]);
  expect(h.msgs.map(m => m.at)).toEqual([...h.msgs.map(m => m.at)].sort((a, b) => a - b));
  for (const m of h.msgs) { expect(String(m.id)).toMatch(/^b\d+$/); expect(h.users[m.u]).toMatchObject({ bot: true, clan: null }); }   // des bots sans tag d'un autre clan
  expect(new Set(h.msgs.map(m => m.u)).size).toBeGreaterThan(1);
  BOT = h.msgs[2].id;
  expect((await api(max, `api_chat_history('clan:c1')`)).msgs.map(m => m.id)).toEqual(h.msgs.map(m => m.id));       // une seule fois, pour tous les membres
  // chacun son clan : Léa n'entre pas chez Zoé, Zoé n'entre pas chez Léa, un clan inconnu n'existe pas
  expect(await non(lea, `api_chat_history('clan:c4')`)).toMatch(/salon_indisponible/);
  expect(await non(zoe, `api_chat_history('clan:c1')`)).toMatch(/salon_indisponible/);
  expect(await non(zoe, `api_chat_send('clan:c1', 'je passe')`)).toMatch(/salon_indisponible/);
  expect(await non(lea, `api_chat_history('clan:zzz')`)).toMatch(/salon_indisponible/);
  expect(await refus(db, null, `select public.api_chat_history('clan:c1')`)).toMatch(/permission denied/);
});

test('écrire dans le salon : diffusé sur le sujet privé du clan, jamais sur un sujet public ; seuls les membres peuvent le recevoir', async () => {
  await q(db, 'truncate realtime.messages');
  const r = await api(lea, `api_chat_send('clan:c1', '  Bonsoir le clan  ')`);
  MSG = r.msg.id;
  expect(r.msg).toMatchObject({ u: lea, k: 'msg', text: 'Bonsoir le clan' });
  expect(await diffusions()).toEqual([{ topic: 'clan:c1', event: 'msg', private: true }]);
  expect((await q(db, `select payload from realtime.messages where topic = 'clan:c1'`))[0].payload).toMatchObject({ id: MSG, text: 'Bonsoir le clan', f: { n: 'lea', clan: 'c1' } });
  expect((await q(db, `select kind from public.chat_rooms where id = 'clan:c1'`))[0].kind).toBe('clan');
  expect(await recevable(max, 'clan:c1'), 'un autre membre le reçoit').toEqual(['msg']);
  expect(await recevable(lea, 'clan:c1')).toEqual(['msg']);
  expect(await recevable(zoe, 'clan:c1'), 'un joueur d’un autre clan ne reçoit rien').toEqual([]);
  expect(await recevable(lea, 'clan:c4')).toEqual([]);
  expect(await refus(db, null, `select event from realtime.messages where topic = 'clan:c1'`), 'un visiteur non plus').toMatch(/permission denied/);
  const h = await api(max, `api_chat_history('clan:c1')`);
  expect(h.msgs).toHaveLength(4);
  expect(h.msgs[3]).toMatchObject({ id: MSG, u: lea, text: 'Bonsoir le clan' });
  expect(h.users[lea]).toMatchObject({ n: 'lea', clan: 'c1' });
  // la progression est la même que dans les autres salons (2 XP par message)
  expect((await q(db, `select messages_total from public.user_stats where user_id = $1`, [lea]))[0].messages_total).toBe(1);
});

test('réagir et partager une mise dans le salon du clan : mêmes règles, tout reste sur le sujet privé', async () => {
  await q(db, 'truncate realtime.messages');
  expect(await api(max, `api_chat_react('clan:c1', $1, '🔥')`, [String(MSG)])).toEqual({ id: MSG, r: { '🔥': 1 }, my: ['🔥'] });
  expect(await api(max, `api_chat_react('clan:c1', $1, '👀')`, [BOT])).toEqual({ id: BOT, r: { '👀': 1 }, my: ['👀'] });
  expect(await non(zoe, `api_chat_react('clan:c1', $1, '🔥')`, [String(MSG)])).toMatch(/salon_indisponible/);
  expect(await non(max, `api_chat_react('general', $1, '🔥')`, [String(MSG)])).toMatch(/message_indisponible/);     // pas par un salon public
  await api(lea, `api_buy('btc150k', 'oui', 50, $1)`, [randomUUID()]);
  await plusTard();
  const carte = (await api(lea, `api_chat_share('clan:c1', 'btc150k', 'oui')`)).msg;
  expect(carte).toMatchObject({ k: 'bet', bet: { m: 'btc150k', s: 'oui' }, fc: 0 });
  await q(db, `update wm.chat_suivis set du_at = now() - interval '1 second' where message_id = $1`, [carte.id]);
  expect((await q(db, 'select wm.chat_suivis_tick() as n'))[0].n).toBeGreaterThanOrEqual(1);
  const d = await diffusions();
  expect(new Set(d.map(x => x.topic + ' ' + x.private))).toEqual(new Set(['clan:c1 true']));                         // rien sur un sujet public
  expect(d.map(x => x.event).filter((e, i, a) => a.indexOf(e) === i).sort()).toEqual(['fc', 'msg', 're']);
  expect((await api(max, `api_chat_history('clan:c1')`)).mes).toEqual({ [MSG]: ['🔥'], [BOT]: ['👀'] });
  expect(await non(zoe, `api_chat_follow($1)`, [carte.id])).toMatch(/rang_insuffisant|position_absente/);            // suivre garde ses propres règles
});

test('les bots ne parlent pas dans un salon de clan, mais ils y réagissent quand il est regardé ; api_chat_seen ne garde que son propre clan', async () => {
  await enTantQue(db, lea, s => s('select public.api_present()'));
  await q(db, `update wm.chat_bots set vu_at = now() - interval '10 minutes'`);
  await enTantQue(db, lea, s => s(`select public.api_chat_seen(array['clan:c1', 'clan:c4', 'clan:zzz'])`));
  expect((await q(db, `select room from wm.chat_bots where vu_at > now() - interval '1 minute' order by 1`)).map(x => x.room)).toEqual(['clan:c1']);
  await q(db, 'truncate realtime.messages');
  for (let i = 0; i < 120; i++) await q(db, 'select wm.bots_chat()');
  const parType = {}; for (const x of await q(db, `select topic, event, private from realtime.messages where event <> 'reac'`)) parType[x.topic + ' ' + x.event + ' ' + x.private] = (parType[x.topic + ' ' + x.event + ' ' + x.private] || 0) + 1;
  expect(Object.keys(parType)).toEqual(['clan:c1 re true']);
  expect(parType['clan:c1 re true']).toBeGreaterThan(10);
  expect((await api(lea, `api_chat_history('clan:c1')`)).msgs.filter(m => m.tpl).length, 'toujours les trois messages d’accueil, rien de plus').toBe(3);
});

test('quitter le clan : plus d’historique, plus d’écriture, plus de nouvel abonnement ; l’administration peut masquer un message du salon', async () => {
  await api(max, 'api_clan_leave()');
  expect(await non(max, `api_chat_history('clan:c1')`)).toMatch(/salon_indisponible/);
  expect(await non(max, `api_chat_send('clan:c1', 'encore là ?')`)).toMatch(/salon_indisponible/);
  expect(await non(max, `api_chat_react('clan:c1', $1, '🎯')`, [String(MSG)])).toMatch(/salon_indisponible/);
  await q(db, 'truncate realtime.messages');
  await plusTard();
  await api(lea, `api_chat_send('clan:c1', 'Entre nous')`);
  expect(await recevable(max, 'clan:c1'), 'un ancien membre ne peut plus s’abonner').toEqual([]);
  expect(await recevable(lea, 'clan:c1')).toEqual(['msg']);
  // administration : les salons de clan sont visibles et modérables ; les messages privés, non
  const adm = (await q(db, 'select wm.adm_chat() as r'))[0].r.msgs;
  expect(adm.filter(m => m.room === 'clan:c1').map(m => m.text)).toEqual(expect.arrayContaining(['Bonsoir le clan', 'Entre nous']));
  expect(adm.some(m => String(m.room).startsWith('dm:'))).toBe(false);
  await q(db, 'truncate realtime.messages');
  await q(db, `select wm.adm_chat_masquer($1, $2)`, [lea, MSG]);
  expect(await diffusions()).toEqual([{ topic: 'clan:c1', event: 'del', private: true }]);
  expect((await api(lea, `api_chat_history('clan:c1')`)).msgs.some(m => m.id === MSG)).toBe(false);
  for (const f of ['chat_diffuser($1, \'msg\', \'{}\'::jsonb)', 'chat_salon_creer($1)'])
    expect(await refus(db, lea, `select wm.${f}`, ['clan:c1'])).toMatch(/permission denied/);
});
