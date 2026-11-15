// Messages des bots dans le chat (K26) : un gabarit et ses paramètres, jamais un texte figé ; seulement dans les salons
// qu'un joueur regarde ; aucune ligne créée (anneau de 30 messages par salon).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, alice;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  alice = await creerJoueur(db, 'alice', 100);
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 40) i`);
});
test.afterAll(async () => { await db.close(); });

const parler = async n => { for (let i = 0; i < n; i++) await q(db, 'select wm.bots_chat()'); };
const anneau = async room => ((await q(db, 'select msgs from wm.chat_bots where room = $1', [room]))[0] || { msgs: [] }).msgs;
const historique = (qui, room) => enTantQue(db, qui, s => s('select public.api_chat_history($1) as r', [room])).then(r => r[0].r);
const diffusions = () => q(db, `select topic, event, private, payload from realtime.messages where topic like 'salon:%' order by inserted_at`);

test('personne à l’écran : les bots se taisent ; un salon ouvert s’amorce avec six messages datés des dernières minutes', async () => {
  await q(db, 'truncate realtime.messages');
  await parler(40);
  expect(await q(db, 'select room from wm.chat_bots')).toEqual([]);
  expect(await diffusions()).toEqual([]);

  const h = await historique(alice, 'm:btc150k');
  expect(h.msgs).toHaveLength(6);
  const maintenant = Date.now();
  for (const m of h.msgs) {
    expect(m).toMatchObject({ k: 'msg', text: '' });
    expect(String(m.id)).toMatch(/^b\d+$/);
    expect(m.tpl).toMatchObject({ g: 'M', m: 'btc150k' });
    expect(Number.isInteger(m.tpl.i) && m.tpl.i >= 0 && m.tpl.i < 10000).toBe(true);
    expect([0, 1]).toContain(m.tpl.s);
    expect(m.tpl.p).toBeGreaterThan(0); expect(m.tpl.p).toBeLessThan(100);
    expect(maintenant - m.at).toBeGreaterThan(60000); expect(maintenant - m.at).toBeLessThan(16 * 60000);
    expect(h.users[m.u]).toMatchObject({ bot: true });
    expect(h.users[m.u].n).toMatch(/^bot\d+$/);
  }
  expect(h.msgs.map(m => m.at)).toEqual([...h.msgs.map(m => m.at)].sort((a, b) => a - b));
  for (let i = 1; i < h.msgs.length; i++) expect(h.msgs[i].u, 'jamais deux fois de suite le même bot').not.toBe(h.msgs[i - 1].u);
  expect(JSON.stringify(h)).not.toMatch(/@nulle\.part|@test\.dev/);
  expect((await historique(alice, 'm:btc150k')).msgs.map(m => m.id)).toEqual(h.msgs.map(m => m.id));   // rouvrir n'amorce pas deux fois
});

test('un joueur présent et un salon regardé : les bots y parlent, le message est diffusé avec la fiche de son auteur, l’anneau reste à 30', async () => {
  await q(db, 'truncate realtime.messages');
  const avant = (await q(db, 'select count(*)::int as n from public.chat_messages'))[0].n;
  await parler(30);                                                                          // salon regardé, mais aucun signal de présence
  expect(await diffusions()).toEqual([]);
  await enTantQue(db, alice, s => s('select public.api_present()'));
  await parler(200);
  const d = await diffusions();
  expect(d.length).toBeGreaterThan(45); expect(d.length).toBeLessThan(95);                  // environ un passage sur trois, par salon regardé
  expect(new Set(d.map(x => x.topic))).toEqual(new Set(['salon:m:btc150k']));               // nulle part ailleurs
  expect(d[0]).toMatchObject({ event: 'msg', private: false });
  expect(d[0].payload).toMatchObject({ k: 'msg', text: '', tpl: { g: 'M', m: 'btc150k' }, f: { bot: true } });
  expect(d[0].payload.f).not.toHaveProperty('email');
  const a = await anneau('m:btc150k');
  expect(a).toHaveLength(30);
  expect(a[29].id).toBe(d[d.length - 1].payload.id);                                         // le plus récent est au bout
  expect(new Set(a.map(m => m.id)).size).toBe(30);
  expect((await q(db, 'select count(*)::int as n from public.chat_messages'))[0].n, 'aucune ligne créée dans les messages').toBe(avant);

  // l'historique mêle le message d'un joueur et ceux des bots, dans l'ordre du temps
  await enTantQue(db, alice, s => s(`select public.api_chat_send('m:btc150k', 'un vrai message')`));
  const h = await historique(alice, 'm:btc150k');
  expect(h.msgs).toHaveLength(31);
  expect(h.msgs[30]).toMatchObject({ u: alice, text: 'un vrai message' });
  expect(h.msgs[30]).not.toHaveProperty('tpl');
  expect(h.users[alice]).toMatchObject({ n: 'alice', bot: false });
});

test('salon général : le gabarit cite un marché ouvert ; api_chat_seen garde un salon vivant, refuse les salons inconnus', async () => {
  await q(db, 'truncate realtime.messages');
  await q(db, `update wm.chat_bots set vu_at = now() - interval '10 minutes'`);              // plus personne ne regarde le marché
  await parler(40);
  expect(await diffusions()).toEqual([]);
  await enTantQue(db, alice, s => s(`select public.api_chat_seen(array['general', 'm:inconnu', 'dm:x', 'vip'])`));
  expect((await q(db, 'select room from wm.chat_bots order by 1')).map(x => x.room)).toEqual(['general', 'm:btc150k']);
  await parler(60);
  const d = await diffusions();
  expect(d.length).toBeGreaterThan(8);
  expect(new Set(d.map(x => x.topic))).toEqual(new Set(['salon:general']));
  for (const x of d) { expect(x.payload.tpl.g).toBe('G'); expect(['btc150k', 'clasico']).toContain(x.payload.tpl.m); }
  // deux salons regardés : chacun garde son rythme (l'un ne prive pas l'autre)
  await q(db, 'truncate realtime.messages');
  await enTantQue(db, alice, s => s(`select public.api_chat_seen(array['m:clasico'])`));
  await parler(80);
  const parSalon = {}; for (const x of await diffusions()) parSalon[x.topic] = (parSalon[x.topic] || 0) + 1;
  expect(Object.keys(parSalon).sort()).toEqual(['salon:general', 'salon:m:clasico']);
  expect(parSalon['salon:general']).toBeGreaterThan(12); expect(parSalon['salon:m:clasico']).toBeGreaterThan(12);
  expect(await refus(db, null, `select public.api_chat_seen(array['general'])`)).toMatch(/permission denied/);
  expect(await refus(db, alice, 'select wm.bots_chat()')).toMatch(/permission denied/);
  expect(await refus(db, alice, 'select * from wm.chat_bots')).toMatch(/permission denied/);
});

test('réglage : « chat » à 0 ou bots coupés → silence, et pas d’amorce ; tâche planifiée toutes les 5 secondes', async () => {
  await q(db, 'truncate realtime.messages');
  await q(db, `update wm.config set value = value || '{"chat": 0}' where key = 'bots'`);
  await enTantQue(db, alice, s => s(`select public.api_chat_seen(array['general'])`));
  await parler(40);
  expect(await diffusions()).toEqual([]);
  await db.exec(`insert into public.markets (id, category, question, status) values ('neuf', 'Sport', 'Un marché jamais ouvert ?', 'open');
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values ('neuf', 50, 50, 1000000, 10, 6000);`);
  expect((await historique(alice, 'm:neuf')).msgs).toEqual([]);                              // un salon jamais ouvert ne s'amorce pas non plus
  await q(db, `update wm.config set value = (value - 'chat') || '{"actif": false}' where key = 'bots'`);
  await parler(40);
  expect(await diffusions()).toEqual([]);
  await q(db, `update wm.config set value = value || '{"actif": true}' where key = 'bots'`);
  expect(await q(db, `select schedule, command from cron.job where jobname = 'wm-bots-chat'`)).toEqual([{ schedule: '5 seconds', command: 'select wm.bots_chat()' }]);
});
