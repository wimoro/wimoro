// Classement servi par le serveur : 50 fiches publiques au plus, triées par gain, sans e-mail ni profil privé (B17, K46).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db;
test.beforeAll(async () => { db = await creerBase(); await semer(db); });
test.afterAll(async () => { await db.close(); });

test('les 50 meilleurs gains, vrais joueurs et bots mêlés, sans soi-même, sans profil privé, sans e-mail', async () => {
  const moi = await creerJoueur(db, 'moi');
  await q(db, `with b as (insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 70) i returning id, username)
    insert into public.user_stats (user_id, profit_realized, bets_placed) select id, substr(username, 4)::int * 10, 5 from b`);
  const riche = await creerJoueur(db, 'riche'), cache = await creerJoueur(db, 'discret');
  await q(db, `update public.user_stats set profit_realized = 5000 where user_id in ($1, $2)`, [riche, cache]);
  await q(db, `update public.users set is_public = false where id = $1`, [cache]);
  await q(db, `update public.user_stats set profit_realized = 9999 where user_id = $1`, [moi]);
  const r = (await enTantQue(db, moi, s => s('select public.api_leaderboard() as r')))[0].r;
  expect(r.ids).toHaveLength(50);
  expect(r.ids[0]).toBe(riche);                                                              // un vrai joueur en tête, devant les bots
  expect(r.users[riche]).toMatchObject({ n: 'riche', profit: 5000, bot: false });
  expect(r.users[r.ids[1]]).toMatchObject({ n: 'bot70', profit: 700, bot: true });
  expect(r.ids).not.toContain(moi); expect(r.ids).not.toContain(cache);
  const profits = r.ids.map(id => r.users[id].profit);
  expect(profits).toEqual([...profits].sort((a, b) => b - a));
  expect(JSON.stringify(r)).not.toMatch(/@test\.dev|@nulle\.part/);
  expect(await refus(db, null, 'select public.api_leaderboard()')).toMatch(/permission denied/);
});
