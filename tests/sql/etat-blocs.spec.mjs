// L'état du joueur et les suites d'une résolution s'assemblent à partir de blocs enregistrés : un lot ajoute le sien
// sans réécrire wm.state() ni wm.marche_suites(), donc sans effacer ceux des autres.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, alice;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 100);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'admin')`, [chef]);
});
test.afterAll(async () => { await db.close(); });
const etat = u => enTantQue(db, u, s => s('select public.api_state() as r')).then(r => r[0].r);

test('l’état garde les mêmes champs qu’avant, dans les blocs enregistrés', async () => {
  const e = await etat(alice);
  expect(e).toMatchObject({ v: 1, uid: alice, serie: null, blitz: [], combos: [] });
  expect(e.me.balance).toBe(100);
  expect(e.duels).toMatchObject({ liste: [] });
  expect(e.ref).toMatchObject({ bonus: 10, by: null, list: [] });
  expect(await q(db, 'select cle, fonction, avant from wm.etat_blocs order by avant desc, ordre')).toEqual([
    { cle: 'duels_expirer', fonction: 'wm.duels_expirer', avant: true }, { cle: 'ref_regler', fonction: 'wm.ref_regler', avant: true },
    { cle: 'serie', fonction: 'wm.serie_etat', avant: false }, { cle: 'blitz', fonction: 'wm.blitz_etat', avant: false }, { cle: 'duels', fonction: 'wm.duels_etat', avant: false },
    { cle: 'combos', fonction: 'wm.combos_etat', avant: false }, { cle: 'ref', fonction: 'wm.ref_etat', avant: false }]);
  expect(await refus(db, alice, 'select * from wm.etat_blocs')).toMatch(/permission denied/);
  expect(await refus(db, alice, 'select * from wm.suites_blocs')).toMatch(/permission denied/);
  expect(await refus(db, alice, `insert into wm.etat_blocs (cle, fonction) values ('x', 'wm.me')`)).toMatch(/permission denied/);
});

test('un lot enregistre son bloc et son étape « avant » sans toucher à wm.state() ; un bloc retiré disparaît', async () => {
  const avant = (await q(db, `select md5(prosrc) as m from pg_proc where oid = 'wm.state'::regproc`))[0].m;
  await db.exec(`
    create table wm.essai (user_id uuid primary key, n integer not null default 0);
    create function wm.essai_avant(p_user uuid) returns void language sql security definer set search_path = '' as $f$
      insert into wm.essai (user_id, n) values (p_user, 1) on conflict (user_id) do update set n = wm.essai.n + 1 $f$;
    create function wm.essai_etat(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $f$
      select jsonb_build_object('n', (select e.n from wm.essai e where e.user_id = p_user)) $f$;
    insert into wm.etat_blocs (cle, fonction, ordre, avant) values ('essai_avant', 'wm.essai_avant', 90, true), ('essai', 'wm.essai_etat', 90, false);`);
  expect((await etat(alice)).essai).toEqual({ n: 1 });                                           // l'étape « avant » est passée avant la lecture
  expect((await etat(alice)).essai).toEqual({ n: 2 });
  expect((await q(db, `select md5(prosrc) as m from pg_proc where oid = 'wm.state'::regproc`))[0].m).toBe(avant);
  await q(db, `update wm.etat_blocs set fonction = 'wm.nexiste_pas' where cle = 'essai'`);        // une fonction inconnue est refusée, elle n'est pas exécutée à l'aveugle
  expect(await refus(db, alice, 'select public.api_state()')).toMatch(/does not exist/);
  await db.exec(`update wm.etat_blocs set fonction = 'wm.essai_etat' where cle = 'essai'`);
  await db.exec(`create function wm.essai_fin() returns void language sql as $f$ select 1 $f$`);
  await q(db, `update wm.etat_blocs set cle = 'essai2' where cle = 'essai'`);
  const e = await etat(alice);
  expect(e.essai).toBeUndefined(); expect(e.essai2).toEqual({ n: 3 });
});

test('résolution d’un marché : chaque bloc enregistré est appelé, son résultat est noté au journal', async () => {
  await db.exec(`
    create function wm.essai_suite(p_market text, p_issue text) returns integer language sql security definer set search_path = '' as $f$
      insert into wm.essai (user_id, n) select u.id, 100 from public.users u where u.username = 'chef' on conflict (user_id) do update set n = 100 returning 7 $f$;
    insert into wm.suites_blocs (cle, fonction, ordre) values ('essai', 'wm.essai_suite', 90);`);
  await enTantQue(db, chef, s => s(`select public.api_admin('resoudre', $1::jsonb)`, [JSON.stringify({ id: 'clasico', issue: 'oui' })]));
  expect((await q(db, 'select n from wm.essai where user_id = $1', [chef]))[0].n).toBe(100);
  const [j] = await q(db, `select detail from wm.admin_journal where action = 'marche_resolu' order by id desc limit 1`);
  expect(j.detail.suites.clasico).toEqual({ duels: 0, combines: 0, essai: 7 });
});
