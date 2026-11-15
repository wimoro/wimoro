// Messages privés et sujet personnel : un message de A à B n'est lisible ni recevable par un troisième joueur (K09),
// et les notifications destinées à un autre joueur lui sont poussées en direct. Recette 5 (dernière partie).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, a, b, c;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  a = await creerJoueur(db, 'alice'); b = await creerJoueur(db, 'bob'); c = await creerJoueur(db, 'carole');
  for (const u of [a, b, c]) await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, `update public.user_stats set xp = 400, bets_settled = 3 where user_id in ($1, $2, $3)`, [a, b, c]);   // rang Bronze (300 XP, 3 paris réglés) : messages privés débloqués
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select ${sql} as r`, params)))[0].r;
const plusTard = uid => q(db, `update public.chat_messages set created_at = created_at - interval '5 seconds' where user_id = $1`, [uid]);
/** ce qu'un joueur pourrait lire sur un sujet temps réel (la règle d'accès de realtime.messages décide) */
const recevable = (uid, sujet) => enTantQue(db, uid, async s => { await s(`select set_config('realtime.topic', $1, true)`, [sujet]); return s(`select event, payload from realtime.messages where topic = $1 order by inserted_at`, [sujet]); });

test('il faut être amis pour s’écrire', async () => {
  expect(await refus(db, a, 'select public.api_dm_send($1, $2)', [b, 'coucou'])).toMatch(/pas_amis/);
  expect(await refus(db, a, 'select public.api_dm_history($1)', [b])).toMatch(/pas_amis/);
  expect(await refus(db, a, 'select public.api_dm_send($1, $2)', [a, 'à moi-même'])).toMatch(/joueur_inconnu/);
});

test('recette 5 · A écrit à B : B le reçoit sur son sujet privé et le relit ; C ne peut ni le recevoir ni le lire', async () => {
  await api(a, 'public.api_friend($1, $2)', ['add', b]); await api(b, 'public.api_friend($1, $2)', ['accept', a]);
  await q(db, 'truncate realtime.messages');
  const r = await api(a, 'public.api_dm_send($1, $2)', [b, '  Tu joues ce soir ?  ']);
  expect(r.msg).toMatchObject({ u: a, text: 'Tu joues ce soir ?' });
  // diffusion : privée, sur le sujet de B seulement
  const diff = await q(db, `select topic, event, private from realtime.messages order by inserted_at`);
  expect(diff).toEqual([{ topic: 'joueur:' + b, event: 'dm', private: true }, { topic: 'joueur:' + b, event: 'notif', private: true }]);
  // B peut recevoir ce qui passe sur son sujet ; A et C ne le peuvent pas ; un visiteur non plus
  const chezB = await recevable(b, 'joueur:' + b);
  expect(chezB.map(x => x.event)).toEqual(['dm', 'notif']);
  expect(chezB[0].payload).toMatchObject({ u: a, text: 'Tu joues ce soir ?', f: { n: 'alice' } });
  expect(chezB[1].payload.n).toMatchObject({ code: 'dm_recu', p: { u: a, n: 'alice' } });
  expect(await recevable(c, 'joueur:' + b), 'C s’abonne au sujet de B').toEqual([]);
  expect(await recevable(a, 'joueur:' + b), 'A non plus').toEqual([]);
  expect(await recevable(c, 'joueur:' + c)).toEqual([]);
  expect(await refus(db, null, `select * from realtime.messages`)).toMatch(/permission denied/);
  // lecture de la conversation : ses deux participants seulement
  expect((await api(b, 'public.api_dm_history($1)', [a])).msgs.map(m => [m.u, m.text])).toEqual([[a, 'Tu joues ce soir ?']]);
  expect((await api(a, 'public.api_dm_history($1)', [b])).msgs).toHaveLength(1);
  expect(await refus(db, c, 'select public.api_dm_history($1)', [a])).toMatch(/pas_amis/);
  expect(await refus(db, c, 'select public.api_dm_history($1)', [b])).toMatch(/pas_amis/);
  // même en devenant ami de B, C ne lit que SA conversation avec B, pas celle de A
  await api(c, 'public.api_friend($1, $2)', ['add', b]); await api(b, 'public.api_friend($1, $2)', ['accept', c]);
  expect((await api(c, 'public.api_dm_history($1)', [b])).msgs).toEqual([]);
  expect((await api(c, 'public.api_dm_list()')).ids).toEqual([]);
  expect((await api(b, 'public.api_dm_list()')).ids).toEqual([a]);
  // le chat public ne sert jamais un message privé
  expect((await api(c, `public.api_chat_history('general')`)).msgs).toEqual([]);
  expect(await refus(db, c, `select public.api_chat_history($1)`, ['dm:' + [a, b].sort().join(':')])).toMatch(/salon_indisponible/);
  // lecture directe des tables : fermée à tout le monde depuis la fermeture de l'ancienne API (même A et B passent par l'API)
  for (const qui of [a, b, c, null]) for (const table of ['chat_messages', 'chat_rooms', 'chat_room_members'])
    expect(await refus(db, qui, `select count(*) from public.${table}`), table).toMatch(/permission denied/);
  expect((await q(db, `select count(*)::int as n from public.chat_messages where room_id like 'dm:%'`))[0].n).toBe(1);   // il existe bien, mais C ne le voit pas
});

test('une seule notification non lue par expéditeur ; réponse de B ; anti-spam ; rang requis', async () => {
  await plusTard(a);
  await api(a, 'public.api_dm_send($1, $2)', [b, 'Encore moi']);
  const notifs = (await api(b, 'public.api_state()')).notifs.filter(n => n.code === 'dm_recu');
  expect(notifs).toHaveLength(1);                                                            // pas une notification par message
  const rep = await api(b, 'public.api_dm_send($1, $2)', [a, 'Oui, à 21 h']);
  expect(rep.me.msgsTotal).toBe(1); expect(rep.me.chatXP).toBe(2);
  expect((await api(a, 'public.api_dm_history($1)', [b])).msgs.map(m => m.text)).toEqual(['Tu joues ce soir ?', 'Encore moi', 'Oui, à 21 h']);
  expect(await refus(db, b, 'select public.api_dm_send($1, $2)', [a, 'trop vite'])).toMatch(/trop_vite/);
  expect(await refus(db, b, 'select public.api_dm_send($1, $2)', [a, '  '])).toMatch(/message_vide/);
  const novice = await creerJoueur(db, 'novice'); await api(novice, 'public.api_state()');
  await api(novice, 'public.api_friend($1, $2)', ['add', a]); await api(a, 'public.api_friend($1, $2)', ['accept', novice]);
  expect(await refus(db, novice, 'select public.api_dm_send($1, $2)', [a, 'bonjour'])).toMatch(/rang_insuffisant/);
});

test('une demande d’ami est poussée en direct au joueur concerné, et à lui seul', async () => {
  const d = await creerJoueur(db, 'denis'); await api(d, 'public.api_state()');
  await q(db, 'truncate realtime.messages');
  await api(d, 'public.api_friend($1, $2)', ['add', c]);
  const diff = await q(db, `select topic, event, private, payload from realtime.messages`);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toMatchObject({ topic: 'joueur:' + c, event: 'notif', private: true });
  expect(diff[0].payload.n).toMatchObject({ code: 'fr_demande', p: { u: d, n: 'denis' } });
  expect((await recevable(c, 'joueur:' + c)).length).toBe(1);
  expect(await recevable(d, 'joueur:' + c)).toEqual([]);
});
