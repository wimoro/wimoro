// Suivre un joueur côté serveur : liste tenue par le serveur, compteur d'abonnés sur la fiche du joueur suivi.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db, lea, max;
test.beforeAll(async () => { db = await creerBase(); await semer(db); lea = await creerJoueur(db, 'lea', 0); max = await creerJoueur(db, 'max', 0); });
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const compteurs = async u => (await q(db, 'select coalesce(followers_count, 0) as abonnes, coalesce(following_count, 0) as suivis from public.user_stats where user_id = $1', [u]))[0];

test('suivre puis ne plus suivre : une fois chacun, compteurs à jour, visible dans l’état et sur la fiche', async () => {
  expect(await refus(db, null, 'select public.api_follow($1, true)', [lea])).toMatch(/permission denied/);
  expect(await refus(db, max, 'select public.api_follow($1, true)', [max])).toMatch(/joueur_inconnu/);            // pas soi-même
  expect(await refus(db, max, `select public.api_follow('00000000-0000-4000-8000-000000000000', true)`)).toMatch(/joueur_inconnu/);
  const r = await api(max, 'api_follow($1, true)', [lea]);
  expect(r.following).toEqual([lea]);
  expect(r.users[lea]).toMatchObject({ n: 'lea', fol: 1 });
  await api(max, 'api_follow($1, true)', [lea]);                                                 // deux fois : compté une fois
  expect(await compteurs(lea)).toEqual({ abonnes: 1, suivis: 0 }); expect(await compteurs(max)).toEqual({ abonnes: 0, suivis: 1 });
  const e = await api(max, 'api_state()');
  expect(e.following).toEqual([lea]); expect(e.users[lea]).toMatchObject({ n: 'lea', fol: 1 });
  expect((await api(lea, 'api_state()')).following).toEqual([]);                                 // suivre n'est pas réciproque
  const fin = await api(max, 'api_follow($1, false)', [lea]);
  expect(fin.following).toEqual([]); expect(fin.users[lea].fol).toBe(0);
  await api(max, 'api_follow($1, false)', [lea]);
  expect(await compteurs(lea)).toEqual({ abonnes: 0, suivis: 0 }); expect(await compteurs(max)).toEqual({ abonnes: 0, suivis: 0 });
  expect(await refus(db, max, `insert into public.user_following (follower_id, followed_id) values ('${max}', '${lea}')`)).toMatch(/permission denied/);   // jamais en direct
});
