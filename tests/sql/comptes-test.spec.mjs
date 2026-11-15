// Comptes de test de la suite de bout en bout : ils se suppriment eux-mêmes, avec ce qui leur appartient ; un vrai
// compte ne peut ni se supprimer ni être supprimé par ce chemin.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db;
test.beforeAll(async () => { db = await creerBase(); await semer(db); });
test.afterAll(async () => { await db.close(); });

const creerTest = async (db, suffixe) => (await q(db, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`,
  [`wimoro-e2e-${suffixe}@example.com`, JSON.stringify({ username: 'e2e_' + suffixe.replace(/-/g, '') })]))[0].id;
const compter = async () => (await q(db, `select (select count(*)::int from auth.users) as comptes, (select count(*)::int from public.users) as profils,
  (select count(*)::int from public.chat_messages) as messages, (select count(*)::int from public.friendships) as amities, (select count(*)::int from public.notifications) as notifs`))[0];

test('un compte de test se supprime lui-même avec ses messages et ses amitiés ; un vrai compte est refusé', async () => {
  const vrai = await creerJoueur(db, 'vrai', 100);
  const t1 = await creerTest(db, 'abc123'), t2 = await creerTest(db, 'abc123-b');
  await q(db, `insert into public.chat_messages (room_id, user_id, text_content) values ('general', $1, 'message de test'), ('general', $2, 'message d’un vrai joueur')`, [t1, vrai]);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted'), ($2, $1, 'accepted')`, [t1, vrai]);
  await q(db, `insert into public.notifications (user_id, icon, text) values ($1, 'gift', 'pour le test'), ($2, 'gift', 'pour le vrai')`, [t1, vrai]);
  const avant = await compter();

  expect(await refus(db, null, 'select public.api_test_end()')).toMatch(/permission denied/);
  expect(await refus(db, vrai, 'select public.api_test_end()')).toMatch(/reserve_aux_tests/);
  expect(await refus(db, vrai, 'select wm.test_purge()')).toMatch(/permission denied/);
  expect(await refus(db, vrai, 'select wm.test_supprimer(array[$1::uuid])', [t1])).toMatch(/permission denied/);
  expect(await compter()).toEqual(avant);                                                    // les refus n'ont rien touché

  expect((await enTantQue(db, t1, s => s('select public.api_test_end() as r')))[0].r).toEqual({ ok: true });
  expect(await compter()).toEqual({ comptes: avant.comptes - 1, profils: avant.profils - 1, messages: avant.messages - 1, amities: avant.amities - 2, notifs: avant.notifs - 1 });
  expect(await q(db, 'select text_content from public.chat_messages where user_id = $1', [vrai])).toEqual([{ text_content: 'message d’un vrai joueur' }]);
  expect(await refus(db, t1, 'select public.api_test_end()')).toMatch(/reserve_aux_tests/); // déjà parti : rien à supprimer

  expect((await q(db, 'select wm.test_purge() as n'))[0].n).toBe(1);                         // le serveur retire celui qui restait
  expect((await q(db, 'select wm.test_purge() as n'))[0].n).toBe(0);
  expect((await q(db, 'select count(*)::int as n from auth.users where id = any($1)', [[t1, t2]]))[0].n).toBe(0);
  expect((await q(db, 'select username from public.users where id = $1', [vrai]))).toEqual([{ username: 'vrai' }]);
});

test('seules les adresses wimoro-e2e-…@example.com comptent comme comptes de test ; un identifiant de bot ou de vrai joueur est ignoré', async () => {
  const oui = ['wimoro-e2e-mwicgfwn@example.com', 'wimoro-e2e-mwicgfwn-b@example.com', 'wimoro-e2e-1@example.com'];
  const non = ['wimoro-e2e-x@example.com.pirate.io', 'xwimoro-e2e-a@example.com', 'wimoro-e2e-@example.com', 'wimoro-e2e-a@example.org',
    'quelquun@example.com', 'wimoro-e2e-a@exampleXcom', 'WIMORO-E2E-A@EXAMPLE.COM', 'wimoro-e2e-a b@example.com', ''];
  for (const e of oui) expect((await q(db, 'select wm.est_compte_test($1) as r', [e]))[0].r, e).toBe(true);
  for (const e of non) expect((await q(db, 'select wm.est_compte_test($1) as r', [e]))[0].r, e).toBe(false);
  expect((await q(db, 'select wm.est_compte_test(null) as r'))[0].r).toBe(false);
  const vrai = await creerJoueur(db, 'intouchable', 50);
  const [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_intouchable', 'bot_i@nulle.part', true) returning id`);
  expect((await q(db, 'select wm.test_supprimer($1) as n', [[vrai, bot]]))[0].n).toBe(0);
  expect((await q(db, 'select count(*)::int as n from public.users where id = any($1)', [[vrai, bot]]))[0].n).toBe(2);
});
