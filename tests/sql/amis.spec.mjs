// Amis côté serveur : recherche, demande, annulation, acceptation, refus, retrait. Couvre B11, K10, K44 et la recette 5
// (« A envoie une demande d'ami → B l'accepte → les deux listes sont à jour »).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, a, b, c, bot;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  a = await creerJoueur(db, 'alice'); b = await creerJoueur(db, 'bob'); c = await creerJoueur(db, 'carole');
  for (const u of [a, b, c]) await enTantQue(db, u, s => s('select public.api_state()'));
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('lea_bot', 'bot@nulle.part', true) returning id`);
  await q(db, `insert into public.user_stats (user_id) values ($1) on conflict do nothing`, [bot]);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select ${sql} as r`, params)))[0].r;
const ami = (moi, action, autre) => api(moi, 'public.api_friend($1, $2)', [action, autre]);
const listes = async uid => { const e = await api(uid, 'public.api_state()'); return { amis: e.friends, recues: e.freqIn, envoyees: e.freqOut, xp: e.me.xp, notifs: e.notifs.map(n => n.code) }; };

test('recette 5 · A demande B en ami, B accepte : les deux listes sont à jour, 15 XP chacun, une notification chacun', async () => {
  const r = await ami(a, 'add', b);
  expect(r).toMatchObject({ r: 'envoyee', friends: [], freqIn: [], freqOut: [b] });
  expect(r.users[b]).toMatchObject({ n: 'bob' });
  expect(JSON.stringify(r)).not.toMatch(/bob@test\.dev/);                               // la fiche de B, jamais son e-mail
  expect(await listes(b)).toMatchObject({ amis: [], recues: [a], envoyees: [], notifs: ['fr_demande'] });
  expect((await ami(a, 'add', b)).freqOut, 'demander deux fois ne crée pas deux demandes').toEqual([b]);
  const acc = await ami(b, 'accept', a);
  expect(acc).toMatchObject({ r: 'amis', friends: [a], freqIn: [], freqOut: [] });
  expect(acc.me.xp).toBe(15); expect(acc.ev[0]).toEqual({ k: 'xp', n: 15, src: 'ami' });
  expect(await listes(a)).toMatchObject({ amis: [b], recues: [], envoyees: [], xp: 15 });
  expect((await listes(a)).notifs).toContain('fr_acceptee');
  // un tiers ne voit rien de cette amitié dans son état
  expect(await listes(c)).toMatchObject({ amis: [], recues: [], envoyees: [] });
});

test('retirer, redemander, refuser, annuler : rien n’est supprimé, et les XP d’amitié ne sont donnés qu’une fois par paire', async () => {
  expect((await ami(a, 'remove', b)).friends).toEqual([]);
  expect((await listes(b)).amis).toEqual([]);
  expect((await ami(b, 'add', a)).freqOut).toEqual([a]);                                     // B redemande
  expect((await ami(a, 'add', b)).r, 'demandes croisées : amis tout de suite').toBe('amis');
  expect((await listes(a)).xp).toBe(15); expect((await listes(b)).xp).toBe(15);              // pas de second gain
  // refus
  await ami(c, 'add', a);
  expect((await listes(a)).recues).toEqual([c]);
  expect(await ami(a, 'decline', c)).toMatchObject({ r: 'refusee', freqIn: [] });
  expect((await listes(c)).envoyees).toEqual([]);
  // annulation
  await ami(c, 'add', b);
  expect(await ami(c, 'cancel', b)).toMatchObject({ r: 'annulee', freqOut: [] });
  expect((await listes(b)).recues).toEqual([]);
  expect((await q(db, 'select count(*)::int as n from public.friendships'))[0].n).toBeGreaterThanOrEqual(3);   // les lignes restent, à l'état « declined »
});

test('un bot accepte tout de suite ; soi-même, un inconnu ou une demande absente sont refusés', async () => {
  const r = await ami(c, 'add', bot);
  expect(r).toMatchObject({ r: 'amis', friends: [bot] });
  expect(r.users[bot]).toMatchObject({ n: 'lea_bot', bot: true });
  expect(r.me.xp).toBe(15);
  expect(await refus(db, c, 'select public.api_friend($1, $2)', ['add', c])).toMatch(/joueur_inconnu/);
  expect(await refus(db, c, 'select public.api_friend($1, $2)', ['add', '00000000-0000-4000-8000-00000000dead'])).toMatch(/joueur_inconnu/);
  expect(await refus(db, c, 'select public.api_friend($1, $2)', ['accept', a])).toMatch(/demande_absente/);
  expect(await refus(db, c, 'select public.api_friend($1, $2)', ['epouser', a])).toMatch(/action_invalide/);
});

test('recherche : par pseudo, dix résultats au plus, sans soi-même ni e-mail ; anti-abus et sécurité', async () => {
  for (let i = 0; i < 12; i++) await creerJoueur(db, 'zebre' + String(i).padStart(2, '0'));
  const r = await api(a, 'public.api_users_search($1)', ['zebre']);
  expect(r.ids).toHaveLength(10);
  expect(r.users[r.ids[0]]).toMatchObject({ n: 'zebre00' });
  expect(JSON.stringify(r)).not.toMatch(/@test\.dev|nulle\.part/);
  expect((await api(a, 'public.api_users_search($1)', ['ALIC'])).ids, 'on ne se trouve pas soi-même').toEqual([]);
  expect((await api(a, 'public.api_users_search($1)', ['bob'])).ids).toEqual([b]);
  expect((await api(a, 'public.api_users_search($1)', ['lea'])).ids).toEqual([bot]);
  for (const saisie of ['', 'a', '%', "o'; drop table users; --", 'x'.repeat(30)]) expect((await api(a, 'public.api_users_search($1)', [saisie])).ids, saisie).toEqual([]);
  // 30 demandes par heure au plus
  const d = await creerJoueur(db, 'collectionneur'); await api(d, 'public.api_state()');
  const cibles = (await q(db, `select id from public.users where username like 'zebre%' order by username`)).map(x => x.id);
  await q(db, `with nouveaux as (insert into public.users (username, email, is_demo) select 'cible' || i, 'cible' || i || '@nulle.part', true from generate_series(1, 30) i returning id)
    insert into public.friendships (user_id, friend_id, status, updated_at) select $1, id, 'declined', now() from nouveaux`, [d]);
  expect(await refus(db, d, 'select public.api_friend($1, $2)', ['add', cibles[0]])).toMatch(/trop_de_demandes/);
  // visiteurs et écritures directes
  expect(await refus(db, null, `select public.api_users_search('bob')`)).toMatch(/permission denied/);
  expect(await refus(db, null, 'select public.api_friend($1, $2)', ['add', a])).toMatch(/permission denied/);
  expect(await refus(db, c, `insert into public.friendships (user_id, friend_id, status) values (auth.uid(), '${a}', 'accepted')`)).toMatch(/permission denied/);
  expect(await refus(db, c, `update public.friendships set status = 'accepted'`)).toMatch(/permission denied/);
});
