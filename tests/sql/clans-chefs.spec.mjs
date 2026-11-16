// Clans côté serveur, suite : fil d'activité, outils du chef et des officiers (nommer, exclure, inviter), appels de clan.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, noa, zoe, bot, CLAN, CODE;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 500); max = await creerJoueur(db, 'max', 500); noa = await creerJoueur(db, 'noa', 500); zoe = await creerJoueur(db, 'zoe', 500);
  await q(db, 'update public.user_stats set xp = 900, bets_settled = 12, bets_won = 7, deposits_count = 1 where user_id = $1', [lea]);   // rang Argent
  await q(db, `update public.users set created_at = now() - interval '20 days' where id = $1`, [lea]);
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_ami', 'bot_ami@nulle.part', true) returning id`);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted'), ($1, $3, 'accepted'), ($4, $3, 'accepted')`, [lea, bot, noa, max]);   // Léa : amie du bot et de Noa ; Max : ami de Noa
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const clan = async u => (await api(u, 'api_clan()')).clan;
const fil = async u => (await clan(u)).feed.map(f => [f.code, f.u, f.p]);
const membres = async () => (await q(db, 'select user_id as u, role from wm.clan_membres where clan_id = $1 and parti_at is null order by depuis, id', [CLAN])).map(m => [m.u, m.role]);
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));

test('le fil d’activité se remplit tout seul : fondation, arrivée, mise d’un membre (s’il l’accepte), départ ; il ne se lit que de l’intérieur', async () => {
  const r = await api(lea, 'api_clan_create($1::jsonb)', [JSON.stringify({ name: 'Les Loups', tag: 'lou', desc: '', ic: 'flame', col: '#12A150', lang: ['fr'], cats: ['Football'], access: 'open', minRank: 0 })]);
  CLAN = r.id; CODE = r.clan.clans.find(c => c.id === CLAN).code;
  expect(await fil(lea)).toEqual([['fonde', lea, {}]]);
  await api(max, 'api_clan_join($1, null)', [CLAN]);
  expect(await fil(lea)).toEqual([['rejoint', max, {}], ['fonde', lea, {}]]);
  expect((await clan(lea)).users[max]).toMatchObject({ n: 'max', clan: CLAN });
  // une mise de Max sur un marché : dans le fil (réglage coché par défaut)
  await api(max, `api_buy('clasico', 'oui', 20, $1)`, [randomUUID()]);
  expect((await fil(lea))[0]).toEqual(['mise', max, { amt: 20, m: 'clasico' }]);
  // Max ne veut plus partager ses mises : la suivante n'y est pas
  await q(db, `insert into wm.user_prefs (user_id, prefs) values ($1, '{"prefs": {"clanFeed": false}}'::jsonb) on conflict (user_id) do update set prefs = excluded.prefs`, [max]);
  await api(max, `api_buy('btc150k', 'oui', 30, $1)`, [randomUUID()]);
  expect((await fil(lea)).filter(f => f[0] === 'mise')).toHaveLength(1);
  // un joueur hors du clan ne reçoit ni le fil ni les appels ; un membre d'un clan de démonstration a le sien
  expect((await clan(noa))).toMatchObject({ mine: null, feed: [], calls: [] });
  await api(zoe, `api_clan_join('c1', null)`);
  expect(await fil(zoe)).toEqual([['rejoint', zoe, {}]]);
  await api(zoe, 'api_clan_leave()');
  expect((await q(db, `select code from wm.clan_fil where clan_id = 'c1' order by id`)).map(x => x.code)).toEqual(['rejoint', 'quitte']);
  expect(await refus(db, lea, 'select * from wm.clan_fil')).toMatch(/permission denied/);
  expect(await refus(db, lea, `select wm.clan_fil_poser($1, $2, 'mise')`, [CLAN, lea])).toMatch(/permission denied/);
});

test('inviter un ami : un bot rejoint aussitôt, un vrai joueur reçoit le code et décide ; réservé au chef et aux officiers', async () => {
  expect(await non(max, 'api_clan_invite($1)', [noa])).toMatch(/role_insuffisant/);               // simple membre
  expect(await non(lea, 'api_clan_invite($1)', [zoe])).toMatch(/pas_amis/);
  expect(await non(lea, 'api_clan_invite($1)', [lea])).toMatch(/joueur_inconnu/);
  expect(await non(lea, 'api_clan_invite($1)', [randomUUID()])).toMatch(/joueur_inconnu/);
  const r = await api(lea, 'api_clan_invite($1)', [bot]);
  expect(r.r).toBe('rejoint');
  expect(await membres()).toEqual([[lea, 'chef'], [max, 'membre'], [bot, 'membre']]);
  expect(r.clan.feed[0]).toMatchObject({ code: 'invite', u: bot, p: { par: lea } });
  expect(r.clan.users[bot]).toMatchObject({ n: 'bot_ami', bot: true, clan: CLAN });                // le tag du bot est celui de ce clan
  expect(await non(lea, 'api_clan_invite($1)', [bot])).toMatch(/clan_deja/);
  // un vrai joueur : jamais ajouté d'office
  expect((await api(lea, 'api_clan_invite($1)', [noa])).r).toBe('invite');
  expect(await membres()).toHaveLength(3);
  expect(await notifs(noa, 'clan_invite')).toEqual([{ id: CLAN, u: lea, code: CODE }]);
  expect(await non(lea, 'api_clan_invite($1)', [noa])).toMatch(/deja_invite/);
  await api(noa, 'api_clan_join(null, $1)', [CODE]);                                              // il rejoint de lui-même, avec le code
  expect((await membres()).map(m => m[0])).toEqual([lea, max, bot, noa]);
  expect(await refus(db, null, 'select public.api_clan_invite($1)', [noa])).toMatch(/permission denied/);
});

test('nommer un officier (le chef, cinq au plus) ; exclure (un officier n’exclut qu’un simple membre) ; l’exclu est prévenu et attend 7 jours', async () => {
  expect(await non(max, 'api_clan_promote($1)', [noa])).toMatch(/role_insuffisant/);
  expect(await non(lea, 'api_clan_promote($1)', [zoe])).toMatch(/membre_inconnu/);
  expect(await non(lea, 'api_clan_promote($1)', [lea])).toMatch(/membre_inconnu/);
  const r = await api(lea, 'api_clan_promote($1)', [max]);
  expect(await membres()).toEqual([[lea, 'chef'], [max, 'officier'], [bot, 'membre'], [noa, 'membre']]);
  expect(r.clan.feed[0]).toMatchObject({ code: 'officier', u: lea, p: { u: max } });
  expect(r.clan.clans.find(c => c.id === CLAN).members.find(m => m.u === max).role).toBe('officier');
  expect(await notifs(max, 'clan_officier')).toEqual([{ id: CLAN }]);
  expect(await non(lea, 'api_clan_promote($1)', [max])).toMatch(/deja_officier/);
  // cinq officiers au plus
  await q(db, `insert into public.users (username, email, is_demo) select 'off' || i, 'off' || i || '@nulle.part', true from generate_series(1, 4) i`);
  await q(db, `insert into wm.clan_membres (user_id, clan_id, role, jour) select u.id, $1, 'officier', current_date from public.users u where u.username like 'off%'`, [CLAN]);
  expect(await non(lea, 'api_clan_promote($1)', [noa])).toMatch(/trop_d_officiers/);
  // exclure
  expect(await non(noa, 'api_clan_kick($1)', [bot])).toMatch(/role_insuffisant/);                 // simple membre
  expect(await non(max, 'api_clan_kick($1)', [lea])).toMatch(/role_insuffisant/);                 // pas le chef
  expect(await non(max, 'api_clan_kick($1)', [(await q(db, `select id from public.users where username = 'off1'`))[0].id])).toMatch(/role_insuffisant/);   // un officier n'exclut pas un officier
  expect(await non(max, 'api_clan_kick($1)', [max])).toMatch(/membre_inconnu/);
  expect(await non(max, 'api_clan_kick($1)', [zoe])).toMatch(/membre_inconnu/);
  const k = await api(max, 'api_clan_kick($1)', [noa]);
  expect(k.clan.feed[0]).toMatchObject({ code: 'exclu', u: max, p: { u: noa } });
  expect((await membres()).some(m => m[0] === noa)).toBe(false);
  expect(await notifs(noa, 'clan_exclu')).toEqual([{ id: CLAN }]);
  expect((await clan(noa)).mine).toBeNull();
  expect(await non(noa, `api_clan_join('c1', null)`)).toMatch(/clan_attente/);
  expect((await q(db, 'select count(*)::int as n from wm.clan_membres where user_id = $1', [noa]))[0].n, 'rien n’est supprimé').toBe(1);
  await api(lea, 'api_clan_kick($1)', [max]);                                                     // le chef exclut un officier
  expect((await membres()).some(m => m[0] === max)).toBe(false);
  // un membre d'un clan de démonstration n'a aucun de ces pouvoirs
  await q(db, `update wm.clan_membres set parti_at = now() - interval '8 days' where user_id = $1`, [zoe]);
  await api(zoe, `api_clan_join('c1', null)`);
  for (const f of ['api_clan_promote($1)', 'api_clan_kick($1)', 'api_clan_invite($1)']) expect(await non(zoe, f, [lea]), f).toMatch(/role_insuffisant/);
  expect(await non(zoe, `api_clan_call('clasico', 'oui')`)).toMatch(/role_insuffisant/);
  expect(await non(max, 'api_clan_promote($1)', [lea])).toMatch(/clan_absent/);
});

test('appel de clan : épinglé en tête, annoncé dans le chat du clan (sujet privé), suivi par quelques membres ; l’auteur en est prévenu, une fois', async () => {
  expect(await non(lea, `api_clan_call('clasico', 'peut-etre')`)).toMatch(/cote_invalide/);
  expect(await non(lea, `api_clan_call('pas-un-marche', 'oui')`)).toMatch(/marche_inconnu/);
  await q(db, 'truncate realtime.messages');
  const r = await api(lea, `api_clan_call('clasico', 'non')`);
  expect(r.clan.calls).toHaveLength(1);
  expect(r.clan.calls[0]).toMatchObject({ m: 'clasico', s: 'non', by: lea, n: 0 });
  expect(r.clan.feed[0]).toMatchObject({ code: 'appel', u: lea, p: { m: 'clasico', s: 'non' } });
  // dans le chat du clan : une ligne d'événement, sur le sujet privé du clan
  expect(await q(db, `select topic, event, private, payload ->> 'k' as k, payload -> 'ev' as ev from realtime.messages where topic like 'clan:%' or topic like 'salon:%'`))
    .toEqual([{ topic: 'clan:' + CLAN, event: 'msg', private: true, k: 'evt', ev: { code: 'appel', m: 'clasico', s: 'non' } }]);
  const h = await api(lea, 'api_chat_history($1)', ['clan:' + CLAN]);
  const evt = h.msgs.find(m => m.k === 'evt');
  expect(evt).toMatchObject({ u: lea, text: '', ev: { code: 'appel', m: 'clasico', s: 'non' } });
  // les bots ne réagissent pas à une ligne d'événement
  for (let i = 0; i < 60; i++) await q(db, 'select wm.chat_bot_reagir($1)', ['clan:' + CLAN]);
  expect((await q(db, 'select reactions from public.chat_messages where id = $1', [evt.id]))[0].reactions).toEqual({});
  // avant le délai : personne ne l'a encore suivi ; après : de 2 à 5 membres (au plus les autres membres), l'auteur est prévenu
  expect((await clan(lea)).calls[0].n).toBe(0);
  expect(await notifs(lea, 'clan_appel_suivi')).toEqual([]);
  await q(db, `update wm.clan_appels set suivis_at = now() - interval '1 second' where clan_id = $1`, [CLAN]);
  const autres = (await membres()).length - 1;
  const n = (await clan(lea)).calls[0].n;
  expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(Math.min(5, autres));
  expect(await notifs(lea, 'clan_appel_suivi')).toEqual([{ n, m: 'clasico', id: CLAN }]);
  expect((await clan(lea)).calls[0].n).toBe(n);
  expect(await notifs(lea, 'clan_appel_suivi'), 'une seule fois').toHaveLength(1);
  // six appels par heure au plus
  for (let i = 0; i < 5; i++) await api(lea, `api_clan_call('btc150k', 'oui')`);
  expect(await non(lea, `api_clan_call('btc150k', 'oui')`)).toMatch(/trop_d_appels/);
  expect((await clan(lea)).calls).toHaveLength(6);
  expect(await refus(db, lea, 'select wm.clan_appels_avancer($1)', [lea])).toMatch(/permission denied/);
});

test('le chef s’en va : un vrai membre lui succède plutôt qu’un bot', async () => {
  await q(db, `update wm.clan_membres set parti_at = now() - interval '8 days' where user_id = $1 and parti_at is not null`, [noa]);
  await api(noa, 'api_clan_join($1, null)', [CLAN]);
  await api(lea, 'api_clan_leave()');
  expect((await q(db, 'select chef from wm.clans_joueurs where id = $1', [CLAN]))[0].chef).toBe(noa);
  expect((await membres()).find(m => m[0] === noa)[1]).toBe('chef');
  expect((await fil(noa))[0]).toEqual(['quitte', lea, {}]);
});
