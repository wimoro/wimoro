// Sécurité du back : chaque trou relevé par l'audit (K01 à K13) est ouvert AVANT la migration « securite_urgence »
// et fermé APRÈS, et les actions légitimes continuent de marcher.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

const solde = async (db, id) => Number((await q(db, 'select balance from public.user_stats where user_id = $1', [id]))[0].balance);
const xp = async (db, id) => (await q(db, 'select xp from public.user_stats where user_id = $1', [id]))[0].xp;

test.describe('avant la migration (état de la production au moment de l’audit)', () => {
  let db, alice;
  test.beforeAll(async () => { db = await creerBase({ until: 'securite_urgence' }); await semer(db); alice = await creerJoueur(db, 'alice', 500); });
  test.afterAll(async () => { await db.close(); });

  test('K01 : un visiteur lit les e-mails', async () => {
    const r = await enTantQue(db, null, s => s('select email from public.users'));
    expect(r.map(x => x.email)).toContain('alice@test.dev');
  });
  test('K02 : un visiteur change le solde de n’importe qui', async () => {
    await enTantQue(db, null, s => s(`select * from public.admin_set_balance('alice', 123456)`));
    expect(await solde(db, alice)).toBe(123456);
  });
  test('K04 : un joueur modifie son propre solde', async () => {
    await enTantQue(db, alice, s => s('update public.user_stats set balance = 999999 where user_id = auth.uid()'));
    expect(await solde(db, alice)).toBe(999999);
  });
  test('K08 : XP d’amitié sans aucune demande, même sans être connecté', async () => {
    const before = await xp(db, alice);
    await enTantQue(db, null, s => s('select public.accept_friend_request($1)', [alice]));
    expect(await xp(db, alice)).toBe(before + 15);
  });
});

test.describe('après la migration', () => {
  let db, alice, bob, carol, clan;
  test.beforeAll(async () => {
    db = await creerBase(); await semer(db);
    alice = await creerJoueur(db, 'alice', 500); bob = await creerJoueur(db, 'bob', 500); carol = await creerJoueur(db, 'carol', 500);
    [{ id: clan }] = await q(db, `insert into public.clans (name, founder_user_id) values ('Les Aigles', $1) returning id`, [alice]);
    await q(db, `insert into public.clan_members (clan_id, user_id, role) values ($1, $2, 'founder')`, [clan, alice]);
    await q(db, `insert into public.chat_rooms (id, name, kind, clan_id) values ($1, 'Les Aigles', 'clan', $2)`, ['clan:' + clan, clan]);
    await q(db, `insert into public.chat_messages (room_id, user_id, text_content) values ($1, $2, 'secret du clan'), ('general', $2, 'bonjour à tous')`, ['clan:' + clan, alice]);
  });
  test.afterAll(async () => { await db.close(); });

  test('K01 : les e-mails ne sont plus lisibles, les profils publics le restent', async () => {
    expect(await refus(db, null, 'select email from public.users')).toMatch(/permission denied/);
    expect(await refus(db, bob, 'select email from public.users')).toMatch(/permission denied/);
    expect(await refus(db, bob, 'select * from public.users')).toMatch(/permission denied/);
    const r = await enTantQue(db, null, s => s('select username from public.users order by 1'));
    expect(r.map(x => x.username)).toEqual(['alice', 'bob', 'carol']);
  });

  test('K02, K05, K07 : les fonctions internes sont fermées aux visiteurs et aux joueurs', async () => {
    const appels = [
      `select * from public.admin_get_player('a')`, `select * from public.admin_top_players(3)`,
      `select * from public.admin_set_balance('alice', 1)`, `select * from public.admin_adjust_balance('alice', 1)`,
      `select * from public.admin_set_player('alice', 1)`, `select * from public.admin_set_rank('alice', 'Or')`,
      `select public.admin_ban_user('alice')`, `select * from public.admin_balance_history()`,
      `select public.settle_market('btc150k', 'yes')`, `select public.grant_xp('${alice}', 1000, 'x')`,
      `select public.progress_mission('${alice}', 'bet', 1)`, `select public.create_notification('${alice}', 'gift', 'x')`,
      `select public.bot_tick()`, `select public.bot_market_make()`, `select public.flash_tick_server()`,
      `select public._post_bet_hook('${alice}')`, `select * from public.admin_players_view`,
    ];
    for (const sql of appels) for (const who of [null, bob]) expect(await refus(db, who, sql), sql).toMatch(/permission denied/);
  });

  test('K04, K06, K10 : plus aucune écriture directe sur l’argent, le jeu et le social', async () => {
    const ecritures = [
      `update public.user_stats set balance = 999999 where user_id = auth.uid()`,
      `insert into public.user_stats (user_id, balance) values (gen_random_uuid(), 5)`,
      `insert into public.positions (user_id, market_id, side, shares, average_price) values (auth.uid(), 'btc150k', 'oui', 1000, 1)`,
      `update public.market_live_state set current_probability = 99 where market_id = 'btc150k'`,
      `insert into public.market_price_history (market_id) values ('btc150k')`,
      `insert into public.chat_messages (room_id, user_id, text_content) values ('general', auth.uid(), 'x')`,
      `insert into public.friendships (user_id, friend_id, status) values (auth.uid(), '${alice}', 'accepted')`,
      `insert into public.user_badges (user_id, badge_id) values (auth.uid(), 'whale')`,
      `update public.missions set current_progress = 99 where user_id = auth.uid()`,
      `insert into public.notifications (user_id, icon, text) values (auth.uid(), 'gift', 'x')`,
      `insert into public.deposits (user_id, coin, network, coin_amount, usd_equivalent) values (auth.uid(), 'USDC', 'Base', 1, 1)`,
      `insert into public.clan_members (clan_id, user_id, role) values ('${clan}', auth.uid(), 'founder')`,
      `delete from public.positions where user_id = auth.uid()`,
      `update public.users set email = 'pirate@test.dev' where id = auth.uid()`,
      `update public.users set is_demo = true where id = auth.uid()`,
    ];
    for (const sql of ecritures) expect(await refus(db, bob, sql), sql).toMatch(/permission denied/);
    expect(await solde(db, bob)).toBe(500);
  });

  test('K09 : le salon d’un clan n’est lisible que par ses membres', async () => {
    const lire = who => enTantQue(db, who, s => s('select text_content from public.chat_messages order by id'));
    expect((await lire(alice)).map(x => x.text_content)).toEqual(['secret du clan', 'bonjour à tous']);
    expect((await lire(bob)).map(x => x.text_content)).toEqual(['bonjour à tous']);
    expect((await lire(null)).map(x => x.text_content)).toEqual(['bonjour à tous']);
    const hist = (who, room) => enTantQue(db, who, s => s('select text_content from public.get_chat_history($1)', [room]));
    expect(await hist(bob, 'clan:' + clan)).toEqual([]);
    expect((await hist(alice, 'clan:' + clan)).length).toBe(1);
    expect((await hist(null, 'general')).length).toBe(1);
    expect(await refus(db, bob, 'select public.send_chat_message($1, $2)', ['clan:' + clan, 'coucou'])).toMatch(/Room not allowed/);
  });

  test('K08 : l’XP d’amitié demande une vraie demande acceptée', async () => {
    const a0 = await xp(db, alice), b0 = await xp(db, bob);
    expect(await refus(db, null, 'select public.accept_friend_request($1)', [alice])).toMatch(/permission denied|Not authenticated/);
    await enTantQue(db, bob, s => s('select public.accept_friend_request($1)', [alice]));      // aucune demande en attente
    expect([await xp(db, alice), await xp(db, bob)]).toEqual([a0, b0]);
    await enTantQue(db, alice, s => s(`select public.send_friend_request('bob')`));
    const r = await enTantQue(db, bob, s => s('select public.accept_friend_request($1) as r', [alice]));
    expect(r[0].r.status).toBe('accepted');
    expect([await xp(db, alice), await xp(db, bob)]).toEqual([a0 + 15, b0 + 15]);
    await enTantQue(db, bob, s => s('select public.accept_friend_request($1)', [alice]));      // rejouer ne rapporte rien
    expect([await xp(db, alice), await xp(db, bob)]).toEqual([a0 + 15, b0 + 15]);
  });

  test('K13 : chat borné (longueur, salon, fréquence, 20 XP par jour au plus)', async () => {
    const envoyer = (room, txt) => enTantQue(db, carol, s => s('select public.send_chat_message($1, $2)', [room, txt]));
    const vieillir = () => q(db, `update public.chat_messages set created_at = now() - interval '1 hour' where user_id = $1`, [carol]);
    expect(await refus(db, carol, 'select public.send_chat_message($1, $2)', ['general', 'x'.repeat(281)])).toMatch(/too long/);
    expect(await refus(db, carol, 'select public.send_chat_message($1, $2)', ['general', '   '])).toMatch(/Empty/);
    expect(await refus(db, carol, 'select public.send_chat_message($1, $2)', ['dm:alice', 'salut'])).toMatch(/Room not allowed/);
    for (let i = 0; i < 5; i++) await envoyer('general', 'message ' + i);
    expect(await refus(db, carol, 'select public.send_chat_message($1, $2)', ['general', 'un de trop'])).toMatch(/Too many/);
    await vieillir();
    for (let i = 0; i < 7; i++) { await envoyer('m:btc150k', 'suite ' + i); await vieillir(); }   // 12 messages étalés : 20 XP au plus
    const st = (await q(db, 'select xp, messages_total, chat_xp_today from public.user_stats where user_id = $1', [carol]))[0];
    expect(st).toEqual({ xp: 20, messages_total: 12, chat_xp_today: 20 });
  });

  test('les actions légitimes marchent toujours : parier, vendre, déposer, profil, préférences', async () => {
    const bet = (await enTantQue(db, bob, s => s(`select public.place_bet('btc150k', 'oui', 50) as r`)))[0].r;
    expect(Number(bet.new_balance)).toBeCloseTo(450, 1);
    expect(Number(bet.shares)).toBeGreaterThan(70);
    expect(await enTantQue(db, bob, s => s('select market_id, side from public.positions'))).toEqual([{ market_id: 'btc150k', side: 'oui' }]);
    expect(await enTantQue(db, alice, s => s('select market_id from public.positions'))).toEqual([]);          // chacun ne voit que les siennes
    const sell = (await enTantQue(db, bob, s => s(`select public.sell_position('btc150k', 'oui', 10) as r`)))[0].r;
    expect(Number(sell.new_balance)).toBeGreaterThan(450);
    const dep = (await enTantQue(db, bob, s => s(`select public.demo_deposit('USDC', 'Base', 100) as r`)))[0].r;
    expect(Number(dep.new_balance)).toBeGreaterThan(550);
    await enTantQue(db, bob, s => s(`update public.users set username = 'bobby', bio = 'salut' where id = auth.uid()`));
    await enTantQue(db, bob, s => s(`update public.users set bio = 'piraté' where id = '${alice}'`));              // ne touche aucune ligne
    expect(await q(db, 'select username, bio from public.users where id = any($1) order by 1', [[alice, bob]])).toEqual([{ username: 'alice', bio: '' }, { username: 'bobby', bio: 'salut' }]);
    await enTantQue(db, bob, s => s(`insert into public.user_full_state (user_id, state) values (auth.uid(), '{"v":5}') on conflict (user_id) do update set state = excluded.state`));
    expect(await refus(db, bob, `insert into public.user_full_state (user_id, state) values ('${alice}', '{}') on conflict (user_id) do update set state = excluded.state`)).toMatch(/row-level security/);
    expect((await enTantQue(db, null, s => s('select market_id from public.get_markets() order by 1'))).length).toBe(2);
    await enTantQue(db, bob, s => s(`select public.send_friend_request('carol')`));
    expect((await enTantQue(db, carol, s => s('select username, status, direction from public.get_friends()')))).toEqual([{ username: 'bobby', status: 'pending', direction: 'in' }]);
  });

  test('K11, K12 : publication temps réel, search_path et droits d’exécution', async () => {
    const pub = (await q(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).map(x => x.tablename);
    expect(pub).not.toContain('users'); expect(pub).not.toContain('user_stats');
    const sans = await q(db, `select proname from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%')`);
    expect(sans).toEqual([]);
    const anon = (await q(db, `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map(x => x.proname);
    expect(anon).toEqual(['api_pseudo_libre', 'get_chat_history', 'get_clan_members', 'get_clans', 'get_leaderboard', 'get_markets', 'newsletter_subscribe', 'newsletter_unsubscribe']);
  });
});
