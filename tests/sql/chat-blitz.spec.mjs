// Chat du Blitz côté serveur : un salon public pour les joueurs et les spectateurs ; les bots y parlent avec les phrases
// du Blitz (gabarit « Z ») quand quelqu'un regarde.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 100); max = await creerJoueur(db, 'max', 100);
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 30) i`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const anneau = async () => ((await q(db, `select msgs from wm.chat_bots where room = 'blitz'`))[0] || { msgs: [] }).msgs;
let MSG;

test('le chat du Blitz est ouvert à tout joueur connecté : il s’ouvre avec six messages de bots (phrases du Blitz), on y écrit, c’est diffusé sur son sujet public', async () => {
  expect(await refus(db, null, `select public.api_chat_history('blitz')`)).toMatch(/permission denied/);
  const h = await api(lea, `api_chat_history('blitz')`);
  expect(h.room).toBe('blitz');
  expect(h.msgs).toHaveLength(6);
  for (const m of h.msgs) {
    expect(m).toMatchObject({ k: 'msg', text: '', tpl: { g: 'Z' } });
    expect(Object.keys(m.tpl).sort()).toEqual(['g', 'i']);                                         // une phrase du Blitz : ni marché ni prix
    expect(h.users[m.u]).toMatchObject({ bot: true });
  }
  await q(db, 'truncate realtime.messages');
  const r = await api(lea, `api_chat_send('blitz', 'Qui joue le Blitz de 21 h ?')`);
  MSG = r.msg.id;
  expect(r.msg).toMatchObject({ u: lea, k: 'msg', text: 'Qui joue le Blitz de 21 h ?' });
  expect(await q(db, `select topic, event, private from realtime.messages`)).toEqual([{ topic: 'salon:blitz', event: 'msg', private: false }]);
  expect((await q(db, `select name, kind, market_id from public.chat_rooms where id = 'blitz'`))[0]).toEqual({ name: 'Blitz Royale', kind: 'global', market_id: null });
  expect((await api(max, `api_chat_history('blitz')`)).msgs.find(m => m.id === MSG)).toMatchObject({ text: 'Qui joue le Blitz de 21 h ?' });
  expect(await api(max, `api_chat_react('blitz', $1, '🔥')`, [String(MSG)])).toEqual({ id: MSG, r: { '🔥': 1 }, my: ['🔥'] });
  expect(r.ev.map(e => e.k)).toContain('xp');                                                     // un message comme un autre : 2 XP
});

test('les bots y parlent quand quelqu’un regarde, jamais sinon ; le panel d’administration voit et masque ses messages', async () => {
  await enTantQue(db, lea, s => s('select public.api_present()'));
  await api(lea, `api_chat_seen($1::text[])`, [['blitz']]);
  const avant = (await anneau()).length;
  await q(db, 'truncate realtime.messages');
  for (let i = 0; i < 40; i++) await q(db, 'select wm.bots_chat()');
  const apres = await anneau();
  expect(apres.length).toBeGreaterThan(avant);
  expect(apres.every(m => m.tpl.g === 'Z')).toBe(true);
  const d = await q(db, `select topic, private, payload from realtime.messages where event = 'msg'`);
  expect(d.length).toBeGreaterThan(0);
  expect(d.every(x => x.topic === 'salon:blitz' && x.private === false && x.payload.tpl.g === 'Z' && x.payload.f.bot === true)).toBe(true);
  // plus personne ne regarde : silence
  await q(db, `update wm.chat_bots set vu_at = now() - interval '10 minutes'`);
  const n = (await anneau()).length;
  for (let i = 0; i < 20; i++) await q(db, 'select wm.bots_chat()');
  expect((await anneau()).length).toBe(n);
  // administration
  expect((await q(db, 'select wm.adm_chat() as r'))[0].r.msgs.filter(m => m.room === 'blitz').map(m => m.id)).toEqual([MSG]);
  await q(db, 'truncate realtime.messages');
  await q(db, `select wm.adm_chat_masquer($1, $2)`, [lea, MSG]);
  expect(await q(db, `select topic, event, private from realtime.messages`)).toEqual([{ topic: 'salon:blitz', event: 'del', private: false }]);
  expect((await api(max, `api_chat_history('blitz')`)).msgs.some(m => m.id === MSG)).toBe(false);
});
