// Réactions sous les messages du chat, côté serveur : poser et retirer la sienne, compteur vu en direct ; messages de
// joueurs, de bots et messages privés ; réactions des bots ; bornes (réactions connues seulement, 40 par minute).
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, zoe;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 100); max = await creerJoueur(db, 'max', 100); zoe = await creerJoueur(db, 'zoe', 100);
  for (const u of [lea, max, zoe]) await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, `update public.user_stats set xp = 400, bets_settled = 3 where user_id in ($1, $2, $3)`, [lea, max, zoe]);   // rang Bronze : messages privés et partage de mise débloqués
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 20) i`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const diffusions = sujet => q(db, `select event, private, payload from realtime.messages where topic = $1 and event in ('re', 'reac') order by inserted_at`, [sujet]);
const total = r => Object.values(r || {}).reduce((a, b) => a + b, 0);
const plusTard = () => q(db, `update public.chat_messages set created_at = created_at - interval '5 seconds'`);
let MSG, BOT;

test('poser puis retirer sa réaction sur le message d’un joueur : compteur tenu par le serveur, vu en direct, relu dans l’historique', async () => {
  MSG = (await api(lea, `api_chat_send('general', 'Qui suit le clasico ?')`)).msg.id;
  const id = String(MSG);
  expect(await refus(db, null, `select public.api_chat_react('general', $1, '🔥')`, [id])).toMatch(/permission denied/);
  expect(await non(max, `api_chat_react('general', $1, '❤️')`, [id])).toMatch(/reaction_invalide/);
  expect(await non(max, `api_chat_react('secret', $1, '🔥')`, [id])).toMatch(/salon_indisponible/);
  expect(await non(max, `api_chat_react('general', '999999', '🔥')`)).toMatch(/message_indisponible/);
  expect(await non(max, `api_chat_react('m:btc150k', $1, '🔥')`, [id])).toMatch(/message_indisponible/);            // pas dans ce salon
  expect(await non(max, `api_chat_react('general', $1, '🔥')`, ['1; select 1'])).toMatch(/message_indisponible/);
  await q(db, 'truncate realtime.messages');
  expect(await api(max, `api_chat_react('general', $1, '🔥')`, [id])).toEqual({ id: MSG, r: { '🔥': 1 }, my: ['🔥'] });
  expect(await api(zoe, `api_chat_react('general', $1, '🔥')`, [id])).toEqual({ id: MSG, r: { '🔥': 2 }, my: ['🔥'] });
  expect(await api(max, `api_chat_react('general', $1, '🎯')`, [id])).toEqual({ id: MSG, r: { '🔥': 2, '🎯': 1 }, my: ['🔥', '🎯'] });
  expect(await api(lea, `api_chat_react('general', $1, '🎯')`, [id])).toEqual({ id: MSG, r: { '🔥': 2, '🎯': 2 }, my: ['🎯'] });   // son propre message aussi, comme dans la démo
  const d = await diffusions('salon:general');
  expect(d.map(x => [x.event, x.private])).toEqual([['re', false], ['re', false], ['re', false], ['re', false]]);
  expect(d[3].payload).toEqual({ id: MSG, r: { '🔥': 2, '🎯': 2 } });                                               // les compteurs, jamais qui a réagi
  // second clic : la réaction est retirée ; à zéro, elle disparaît
  expect(await api(max, `api_chat_react('general', $1, '🔥')`, [id])).toEqual({ id: MSG, r: { '🔥': 1, '🎯': 2 }, my: ['🎯'] });
  expect(await api(zoe, `api_chat_react('general', $1, '🔥')`, [id])).toEqual({ id: MSG, r: { '🎯': 2 }, my: [] });
  // l'historique : les compteurs pour tous, « les miennes » pour le lecteur seulement
  const h = await api(max, `api_chat_history('general')`);
  expect(h.msgs.find(m => m.id === MSG)).toMatchObject({ text: 'Qui suit le clasico ?', r: { '🎯': 2 } });
  expect(h.mes).toEqual({ [MSG]: ['🎯'] });
  expect((await api(zoe, `api_chat_history('general')`)).mes).toEqual({});
  expect(JSON.stringify(h)).not.toContain(zoe);                                                                     // qui a réagi ne sort jamais
  // reposer une réaction retirée : même ligne, pas de doublon
  expect(await api(zoe, `api_chat_react('general', $1, '🔥')`, [id])).toEqual({ id: MSG, r: { '🔥': 1, '🎯': 2 }, my: ['🔥'] });
  expect((await q(db, `select count(*)::int as n from wm.chat_reactions where user_id = $1`, [zoe]))[0].n).toBe(1);
  expect(await refus(db, max, 'select * from wm.chat_reactions')).toMatch(/permission denied/);
  expect(await refus(db, max, `select wm.debit($1, 'reaction', 1)`, [max])).toMatch(/permission denied/);
  expect(await refus(db, max, `select wm.chat_bot_reagir('general')`)).toMatch(/permission denied/);
  expect(await refus(db, max, `select wm.chat_mes($1, 'general')`, [zoe])).toMatch(/permission denied/);
});

test('réagir au message d’un bot : compteur gardé dans l’anneau du salon, qui tourne ; un message sorti de l’anneau n’est plus disponible', async () => {
  const h = await api(lea, `api_chat_history('m:btc150k')`);                                                        // amorce : six messages de bots
  BOT = h.msgs[5].id; expect(String(BOT)).toMatch(/^b\d+$/);
  const lignes = (await q(db, 'select count(*)::int as n from public.chat_messages'))[0].n;
  await q(db, 'truncate realtime.messages');
  expect(await api(lea, `api_chat_react('m:btc150k', $1, '👀')`, [BOT])).toEqual({ id: BOT, r: { '👀': 1 }, my: ['👀'] });
  expect(await api(max, `api_chat_react('m:btc150k', $1, '👀')`, [BOT])).toEqual({ id: BOT, r: { '👀': 2 }, my: ['👀'] });
  expect((await diffusions('salon:m:btc150k')).map(x => x.payload)).toEqual([{ id: BOT, r: { '👀': 1 } }, { id: BOT, r: { '👀': 2 } }]);
  expect(await non(lea, `api_chat_react('general', $1, '👀')`, [BOT])).toMatch(/message_indisponible/);             // ce message n'est pas dans ce salon
  expect(await non(lea, `api_chat_react('m:btc150k', 'b999999', '👀')`)).toMatch(/message_indisponible/);
  for (let i = 0; i < 5; i++) await q(db, `select wm.chat_bot_poser('m:btc150k', wm.chat_bot_msg('m:btc150k', now(), null))`);
  const h2 = await api(max, `api_chat_history('m:btc150k')`);
  expect(h2.msgs).toHaveLength(11);
  expect(h2.msgs.find(m => m.id === BOT)).toMatchObject({ r: { '👀': 2 }, tpl: { g: 'M' } });
  expect(h2.mes).toEqual({ [BOT]: ['👀'] });
  expect((await q(db, 'select count(*)::int as n from public.chat_messages'))[0].n, 'aucune ligne créée dans les messages').toBe(lignes);
  for (let i = 0; i < 30; i++) await q(db, `select wm.chat_bot_poser('m:btc150k', wm.chat_bot_msg('m:btc150k', now(), null))`);
  expect(await non(lea, `api_chat_react('m:btc150k', $1, '👀')`, [BOT])).toMatch(/message_indisponible/);
});

test('messages privés : la réaction n’est poussée qu’à l’autre participant ; un tiers ne peut ni réagir ni rien recevoir', async () => {
  await api(lea, `api_friend('add', $1)`, [max]); await api(max, `api_friend('accept', $1)`, [lea]);
  await api(zoe, `api_friend('add', $1)`, [lea]); await api(lea, `api_friend('accept', $1)`, [zoe]);                // Zoé est amie de Léa, pas de Max
  await plusTard();
  const dm = (await api(lea, `api_dm_send($1, 'En privé')`, [max])).msg.id, id = String(dm);
  await q(db, 'truncate realtime.messages');
  expect(await api(max, `api_chat_react($1, $2, '💸')`, ['dm:' + lea, id])).toEqual({ id: dm, r: { '💸': 1 }, my: ['💸'] });
  expect(await q(db, `select topic, event, private, payload from realtime.messages order by inserted_at`))
    .toEqual([{ topic: 'joueur:' + lea, event: 're', private: true, payload: { id: dm, r: { '💸': 1 }, u: max } }]);
  expect(await non(zoe, `api_chat_react($1, $2, '💸')`, ['dm:' + max, id])).toMatch(/pas_amis/);
  expect(await non(zoe, `api_chat_react($1, $2, '💸')`, ['dm:' + lea, id])).toMatch(/message_indisponible/);        // amie de Léa : sa conversation avec Léa, pas celle de Max
  expect(await non(max, `api_chat_react('general', $1, '💸')`, [id])).toMatch(/message_indisponible/);              // un message privé ne se touche pas par un salon public
  expect(await non(max, `api_chat_react('dm:pas-un-identifiant', $1, '💸')`, [id])).toMatch(/salon_indisponible/);
  expect(await non(max, `api_chat_react($1, 'b12', '💸')`, ['dm:' + lea])).toMatch(/message_indisponible/);
  const h = await api(lea, `api_dm_history($1)`, [max]);
  expect(h.msgs.find(m => m.id === dm)).toMatchObject({ text: 'En privé', r: { '💸': 1 } });
  expect(h.mes).toEqual({});
  expect((await api(max, `api_dm_history($1)`, [lea])).mes).toEqual({ [dm]: ['💸'] });
});

test('quarante réactions par minute au plus, par joueur', async () => {
  const minute = async () => (await q(db, `select date_trunc('minute', now())::text as m`))[0].m;
  let avant, apres, ok, refuse;
  do {                                                                                                              // rejoué si la minute change en cours de route
    avant = await minute();
    await q(db, `update wm.debits set n = 39, minute = date_trunc('minute', now()) where user_id = $1 and cle = 'reaction'`, [zoe]);
    ok = await api(zoe, `api_chat_react('general', $1, '👀')`, [String(MSG)]);
    refuse = await non(zoe, `api_chat_react('general', $1, '👀')`, [String(MSG)]);
    apres = await minute();
  } while (avant !== apres);
  expect(ok.my).toContain('👀');
  expect(refuse).toMatch(/trop_de_reactions/);
  expect((await q(db, `select n from wm.debits where user_id = $1 and cle = 'reaction'`, [zoe]))[0].n).toBe(40);   // le refus ne compte pas
  await q(db, `update wm.debits set minute = minute - interval '1 minute' where user_id = $1`, [zoe]);              // une minute plus tard
  expect((await api(zoe, `api_chat_react('general', $1, '👀')`, [String(MSG)])).my).not.toContain('👀');
  expect(await api(max, `api_chat_react('general', $1, '💸')`, [String(MSG)])).toBeTruthy();                        // chacun son compteur
});

test('les bots réagissent aux derniers messages du salon ; au message d’un joueur, une fois sur deux il est prévenu en direct (+1 XP)', async () => {
  await q(db, `update public.chat_messages set created_at = now() where id = $1`, [MSG]);
  await api(lea, `api_chat_history('general')`);                                                                    // le salon s'amorce : six messages de bots, plus celui de Léa
  const avant = (await q(db, `select c.reactions as r, s.xp, (select count(*)::int from wm.chat_reactions) as lignes, (select count(*)::int from public.chat_messages) as msgs
    from public.chat_messages c join public.user_stats s on s.user_id = c.user_id where c.id = $1`, [MSG]))[0];
  await q(db, 'truncate realtime.messages');
  for (let i = 0; i < 300; i++) await q(db, `select wm.chat_bot_reagir('general')`);
  const re = await diffusions('salon:general');
  expect(re).toHaveLength(300);
  expect(re.every(x => x.event === 're' && x.private === false)).toBe(true);
  const surLea = re.filter(x => x.payload.id === MSG).length;
  expect(surLea).toBeGreaterThan(90); expect(surLea).toBeLessThan(180);                                             // une fois sur trois d'office, plus sa part du tirage : 44 % environ
  const apres = (await q(db, `select c.reactions as r, s.xp, (select count(*)::int from wm.chat_reactions) as lignes, (select count(*)::int from public.chat_messages) as msgs,
    (select coalesce(sum((e.value)::int), 0)::int from wm.chat_bots b, jsonb_array_elements(b.msgs) t(v), jsonb_each_text(coalesce(t.v -> 'r', '{}'::jsonb)) e where b.room = 'general') as anneau
    from public.chat_messages c join public.user_stats s on s.user_id = c.user_id where c.id = $1`, [MSG]))[0];
  expect(total(apres.r)).toBe(total(avant.r) + surLea);
  expect(apres.anneau).toBe(300 - surLea);
  expect(Object.keys(apres.r).every(e => ['🔥', '👀', '💸', '🎯'].includes(e))).toBe(true);
  expect([apres.lignes, apres.msgs], 'les bots ne créent aucune ligne').toEqual([avant.lignes, avant.msgs]);
  // prévenue une fois sur deux, sur son sujet privé, avec 1 XP à chaque fois
  const reac = await q(db, `select private, payload from realtime.messages where topic = $1 and event = 'reac'`, ['joueur:' + lea]);
  expect(reac.length).toBeGreaterThan(surLea * 0.3); expect(reac.length).toBeLessThan(surLea * 0.7);
  expect(apres.xp - avant.xp).toBe(reac.length);
  expect(reac[0].private).toBe(true);
  expect(reac[0].payload).toMatchObject({ id: MSG, room: 'general' });
  expect(reac[0].payload.n).toMatch(/^bot\d+$/); expect(['🔥', '👀', '💸', '🎯']).toContain(reac[0].payload.e);
  expect((await q(db, `select count(*)::int as n from realtime.messages where event = 'reac' and topic <> $1`, ['joueur:' + lea]))[0].n).toBe(0);
  expect((await q(db, `select count(*)::int as n from public.notifications where user_id = $1 and code = 'reaction'`, [lea]))[0].n, 'une bulle, pas une notification de plus dans la liste').toBe(0);

  // sur une mise partagée : 🔥 ou 💸 seulement
  await api(lea, `api_buy('clasico', 'oui', 20, $1)`, [randomUUID()]);
  await plusTard();
  const carte = (await api(lea, `api_chat_share('m:clasico', 'clasico', 'oui')`)).msg.id;
  await q(db, `update wm.chat_bots set msgs = '[]'::jsonb where room = 'm:clasico'`);                               // la carte est le seul message du salon
  await q(db, `insert into wm.chat_bots (room) values ('m:clasico') on conflict (room) do nothing`);
  for (let i = 0; i < 40; i++) await q(db, `select wm.chat_bot_reagir('m:clasico')`);
  const r = (await q(db, 'select reactions as r from public.chat_messages where id = $1', [carte]))[0].r;
  expect(total(r)).toBe(40);
  expect(Object.keys(r).sort()).toEqual(['🔥', '💸'].sort());
});

test('rythme : dans un salon regardé, une réaction toutes les 20 secondes environ ; aucune si le chat des bots est coupé ; le panel d’administration nomme les mises partagées', async () => {
  await enTantQue(db, lea, s => s('select public.api_present()'));
  await enTantQue(db, lea, s => s(`select public.api_chat_seen(array['general'])`));
  await q(db, `update wm.chat_bots set vu_at = now() - interval '10 minutes' where room <> 'general'`);
  await q(db, 'truncate realtime.messages');
  for (let i = 0; i < 200; i++) await q(db, 'select wm.bots_chat()');
  const parType = {}; for (const x of await q(db, `select event from realtime.messages where topic = 'salon:general'`)) parType[x.event] = (parType[x.event] || 0) + 1;
  expect(parType.re).toBeGreaterThan(25); expect(parType.re).toBeLessThan(80);                                      // un passage sur quatre
  expect(parType.msg).toBeGreaterThan(45); expect(parType.msg).toBeLessThan(95);                                    // les messages gardent leur rythme
  await q(db, `update wm.config set value = value || '{"chat": 0}' where key = 'bots'`);
  await q(db, 'truncate realtime.messages');
  for (let i = 0; i < 40; i++) await q(db, 'select wm.bots_chat()');
  expect(await q(db, 'select event from realtime.messages')).toEqual([]);
  await q(db, `update wm.config set value = value - 'chat' where key = 'bots'`);
  const adm = (await q(db, 'select wm.adm_chat() as r'))[0].r.msgs;
  expect(adm.find(m => m.k === 'bet')).toMatchObject({ text: '', room: 'm:clasico', n: 'lea', bet: { m: 'clasico', s: 'oui' } });
  expect(adm.find(m => m.id === MSG)).toMatchObject({ k: 'msg', text: 'Qui suit le clasico ?' });
});
