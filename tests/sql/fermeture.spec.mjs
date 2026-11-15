// Fermeture de l'ancienne API : après la mise en ligne du nouveau site, plus rien ne passe hors des fonctions api_….
// Avant → après sur la même base, puis le nettoyage (policies sans objet, publication temps réel), puis le fichier de
// retour arrière, qui doit rétablir l'ancien fonctionnement.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { creerBase, creerJoueur, enTantQue, refus, q, semer, migrations } from './base.mjs';

const LECTURES = ['select * from public.markets', 'select username from public.users', 'select * from public.user_stats',
  'select * from public.chat_messages', 'select * from public.positions', 'select * from public.market_live_state',
  'select * from public.friendships', 'select * from public.user_full_state', 'select * from public.notifications'];
const ANCIENNES = ['select * from public.get_markets()', `select public.place_bet('btc150k', 'oui', 5)`, `select public.sell_position('btc150k', 'oui', 1)`,
  `select public.demo_deposit('USDC', 'Base', 100)`, `select public.send_chat_message('general', 'x')`, 'select * from public.get_leaderboard()',
  'select * from public.get_friends()', `select public.send_friend_request('alice')`];
const ouvertes = (db, role) => q(db, `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege($1, p.oid, 'execute') and p.proname not like 'api\\_%' order by 1`, [role]).then(r => r.map(x => x.proname));
const publication = db => q(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`).then(r => r.map(x => x.tablename));
const ecritures = db => q(db, `select count(*)::int as n from pg_policy pol join pg_class c on c.oid = pol.polrelid where c.relnamespace = 'public'::regnamespace and pol.polcmd in ('a', 'w', 'd')`).then(r => r[0].n);

test('avant : l’ancien site lit les tables et appelle les anciennes fonctions ; après : tout est refusé, la nouvelle API marche ; le retour arrière rétablit', async () => {
  const db = await creerBase({ until: 'fermeture_ancienne_api' }); await semer(db);
  const alice = await creerJoueur(db, 'alice', 500), bob = await creerJoueur(db, 'bob', 500);
  await q(db, `select cron.schedule('flash-tick-server', '* * * * *', 'SELECT public.flash_tick_server()')`);

  // ── avant ──
  expect((await enTantQue(db, null, s => s('select id from public.markets'))).length).toBe(2);
  expect((await enTantQue(db, null, s => s('select market_id from public.get_markets()'))).length).toBe(2);
  expect((await enTantQue(db, bob, s => s(`select public.place_bet('btc150k', 'oui', 5) as r`)))[0].r).toBeTruthy();
  expect((await ouvertes(db, 'authenticated')).length).toBe(43);
  const TOUTES = ['chat_messages', 'flash_rounds', 'market_live_state', 'notifications', 'user_stats', 'users'];
  expect(await publication(db)).toEqual(TOUTES);
  expect(await ecritures(db)).toBeGreaterThan(40);

  // ── la migration ──
  const f = migrations().find(x => x.includes('fermeture_ancienne_api'));
  await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));

  // ── après ──
  for (const who of [null, bob]) for (const sql of [...LECTURES, ...ANCIENNES]) expect(await refus(db, who, sql), (who ? 'joueur : ' : 'visiteur : ') + sql).toMatch(/permission denied/);
  for (const sql of [`update public.users set bio = 'x' where id = auth.uid()`, `insert into public.user_full_state (user_id, state) values (auth.uid(), '{}')`,
    `insert into public.user_watchlist (user_id, market_id) values (auth.uid(), 'btc150k')`, `insert into public.user_preferences (user_id) values (auth.uid())`])
    expect(await refus(db, bob, sql), sql).toMatch(/permission denied/);
  expect(await q(db, `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema in ('public', 'wm') and grantee in ('anon', 'authenticated', 'PUBLIC')`)).toEqual([]);
  expect(await q(db, `select table_name, column_name, grantee from information_schema.column_privileges where table_schema in ('public', 'wm') and grantee in ('anon', 'authenticated', 'PUBLIC')`)).toEqual([]);
  expect(await ouvertes(db, 'authenticated')).toEqual([]);
  expect(await ouvertes(db, 'anon')).toEqual([]);
  expect((await q(db, `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map(x => x.proname)).toEqual(['api_markets', 'api_pseudo_libre']);
  expect(await q(db, `select jobname from cron.job where jobname = 'flash-tick-server'`)).toEqual([]);
  // la nouvelle API, elle, répond
  expect(Object.keys((await enTantQue(db, null, s => s('select public.api_markets() as r')))[0].r).length).toBeGreaterThan(0);
  expect((await enTantQue(db, bob, s => s('select public.api_state() as r')))[0].r).toBeTruthy();
  expect((await enTantQue(db, bob, s => s('select public.api_leaderboard() as r')))[0].r.ids).toContain(alice);

  // ── le nettoyage (K11) : plus aucune policy d'écriture, plus aucune table diffusée ; l'API répond toujours ──
  expect(await publication(db)).toEqual(TOUTES); expect(await ecritures(db)).toBeGreaterThan(40);   // la fermeture seule n'a rien supprimé
  const n = migrations().find(x => x.includes('securite_urgence_nettoyage'));
  await db.exec(fs.readFileSync('supabase/migrations/' + n, 'utf8'));
  expect(await publication(db)).toEqual([]);
  expect(await ecritures(db)).toBe(0);
  expect((await enTantQue(db, bob, s => s('select public.api_state() as r')))[0].r).toBeTruthy();
  expect((await enTantQue(db, bob, s => s(`select public.api_buy('btc150k', 'oui', 5, gen_random_uuid()) as r`)))[0].r).toBeTruthy();

  // ── retour arrière ──
  await db.exec(fs.readFileSync('supabase/livraison/retour_ancienne_api.sql', 'utf8'));
  expect((await enTantQue(db, null, s => s('select id from public.markets'))).length).toBe(2);
  expect((await enTantQue(db, null, s => s('select market_id from public.get_markets()'))).length).toBe(2);
  expect((await enTantQue(db, bob, s => s(`select public.place_bet('btc150k', 'oui', 5) as r`)))[0].r).toBeTruthy();
  await enTantQue(db, bob, s => s(`update public.users set bio = 'revenu' where id = auth.uid()`));
  expect((await q(db, 'select bio from public.users where id = $1', [bob]))[0].bio).toBe('revenu');
  expect((await ouvertes(db, 'authenticated')).length).toBe(43);
  expect((await ouvertes(db, 'anon')).length).toBe(7);
  expect(await publication(db)).toEqual(TOUTES);
  expect(await ecritures(db)).toBeGreaterThan(40);
  expect(await q(db, `select jobname from cron.job where jobname = 'flash-tick-server'`)).toEqual([{ jobname: 'flash-tick-server' }]);
  // ce que la migration d'urgence avait fermé reste fermé
  expect(await refus(db, bob, 'select email from public.users')).toMatch(/permission denied/);
  expect(await refus(db, bob, `select * from public.admin_set_balance('alice', 1)`)).toMatch(/permission denied/);
  expect(await refus(db, bob, 'update public.user_stats set balance = 999999 where user_id = auth.uid()')).toMatch(/permission denied/);
  await db.close();
});
