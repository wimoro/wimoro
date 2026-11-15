// La partie 1 de la migration de sécurité (droits et fonctions, sans aucune suppression) doit suffire à fermer
// les trous critiques, même si le nettoyage (partie 2) n'est pas encore appliqué.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test('partie 1 seule : e-mails, fonctions internes, écritures directes et chat privé sont déjà fermés', async () => {
  const db = await creerBase({ until: 'fermeture_ancienne_api' });         // avant la fermeture de l'ancienne API et le nettoyage qui la suit
  await semer(db);
  const alice = await creerJoueur(db, 'alice', 500), bob = await creerJoueur(db, 'bob', 500);
  const [{ id: clan }] = await q(db, `insert into public.clans (name, founder_user_id) values ('Les Aigles', $1) returning id`, [alice]);
  await q(db, `insert into public.clan_members (clan_id, user_id, role) values ($1, $2, 'founder')`, [clan, alice]);
  await q(db, `insert into public.chat_rooms (id, name, kind, clan_id) values ($1, 'Les Aigles', 'clan', $2)`, ['clan:' + clan, clan]);
  await q(db, `insert into public.chat_messages (room_id, user_id, text_content) values ($1, $2, 'secret du clan')`, ['clan:' + clan, alice]);

  expect(await refus(db, null, 'select email from public.users')).toMatch(/permission denied/);
  expect(await refus(db, bob, 'select email from public.users')).toMatch(/permission denied/);
  expect(await refus(db, null, `select * from public.admin_set_balance('alice', 1)`)).toMatch(/permission denied/);
  expect(await refus(db, bob, `select * from public.admin_get_player('a')`)).toMatch(/permission denied/);
  expect(await refus(db, bob, `select public.settle_market('btc150k', 'yes')`)).toMatch(/permission denied/);
  expect(await refus(db, bob, 'update public.user_stats set balance = 999999 where user_id = auth.uid()')).toMatch(/permission denied/);
  expect(await refus(db, bob, `insert into public.positions (user_id, market_id, side, shares, average_price) values (auth.uid(), 'btc150k', 'oui', 1000, 1)`)).toMatch(/permission denied/);
  expect(await refus(db, bob, `update public.market_live_state set current_probability = 99`)).toMatch(/permission denied/);
  expect(await enTantQue(db, bob, s => s('select text_content from public.chat_messages'))).toEqual([]);
  expect((await enTantQue(db, alice, s => s('select text_content from public.chat_messages'))).length).toBe(1);
  // et le jeu continue de marcher
  const bet = (await enTantQue(db, bob, s => s(`select public.place_bet('btc150k', 'oui', 50) as r`)))[0].r;
  expect(Number(bet.new_balance)).toBeCloseTo(450, 1);
  await db.close();
});
