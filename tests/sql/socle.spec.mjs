// Socle de la nouvelle API : inscription, état du joueur, profil, onboarding, préférences, notifications, rang.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db, alice, bob;
test.beforeAll(async () => { db = await creerBase(); await semer(db); alice = await creerJoueur(db, 'alice', 500); bob = await creerJoueur(db, 'bob', 0); });
test.afterAll(async () => { await db.close(); });
const api = async (uid, fn, ...args) => (await enTantQue(db, uid, s => s(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args)))[0].r;

test('inscription : le pseudo choisi est respecté, sinon un pseudo valide est fabriqué ; l’onboarding reste à faire', async () => {
  const profil = async id => (await q(db, 'select username, onboarded, welcomed, is_test from public.users where id = $1', [id]))[0];
  expect(await profil(alice)).toEqual({ username: 'alice', onboarded: false, welcomed: false, is_test: false });
  const cree = async meta => (await q(db, `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [Math.random().toString(36).slice(2) + '@test.dev', JSON.stringify(meta)]))[0].id;
  expect((await profil(await cree({ username: 'ALICE' }))).username).toMatch(/^ALICE[0-9a-f]{4}$/);        // déjà pris, sans tenir compte de la casse
  expect((await profil(await cree({ username: 'a b' }))).username).toMatch(/^joueur[0-9a-f]{6}$/);         // format invalide
  expect((await profil(await cree({ username: 'admin' }))).username).toMatch(/^joueur[0-9a-f]{6}$/);       // réservé
  expect((await profil(await cree({}))).username).toMatch(/^joueur[0-9a-f]{6}$/);                          // rien de transmis
  expect((await profil(await cree({ username: 'testeur', test: true })))).toMatchObject({ username: 'testeur', is_test: true });
  const st = (await q(db, 'select balance, xp from public.user_stats where user_id = $1', [bob]))[0];
  expect([Number(st.balance), st.xp]).toEqual([0, 0]);
});

test('api_pseudo_libre : pris, réservé, invalide, libre — ouvert aux visiteurs', async () => {
  const libre = async p => (await enTantQue(db, null, s => s('select public.api_pseudo_libre($1) as r', [p])))[0].r;
  expect(await libre('alice')).toBe(false);
  expect(await libre('Alice')).toBe(false);
  expect(await libre('admin')).toBe(false);
  expect(await libre('ab')).toBe(false);
  expect(await libre('nom avec espace')).toBe(false);
  expect(await libre('nouveau.joueur_1')).toBe(true);
});

test('api_state : tout l’état du joueur, dans la forme attendue par l’interface', async () => {
  const s = await api(alice, 'api_state');
  expect(s.v).toBe(1);
  expect(s.uid).toBe(alice);
  expect(Math.abs(s.now - Date.now())).toBeLessThan(60000);
  expect(s.me).toMatchObject({ n: 'alice', email: 'alice@test.dev', balance: 500, xp: 0, onboarded: false, kyc: false, played: 0, streak: 1, pos: 38901, color: '#2448FF' });
  expect(s.missions.map(m => [m.id, m.type, m.goal, m.have, m.xp, m.claimed])).toEqual([['chat1', 'chat', 1, 0, 20, false], ['dep1', 'dep', 1, 0, 100, false], ['fb1', 'flashbet', 1, 0, 50, false]]);
  for (const k of ['positions', 'history', 'deps', 'wds', 'notifs', 'badges', 'friends', 'freqIn', 'freqOut', 'following', 'watch']) expect(s[k], k).toEqual([]);
  expect(s.prefs).toEqual({});
  // un visiteur n'a pas accès, et un joueur ne voit jamais l'état d'un autre
  expect(await refus(db, null, 'select public.api_state()')).toMatch(/permission denied/);
  expect((await api(bob, 'api_state')).me.n).toBe('bob');
});

test('api_state : positions, amis et fiches des joueurs cités', async () => {
  await enTantQue(db, alice, s => s(`select public.api_buy('btc150k', 'oui', 50, gen_random_uuid())`));
  await enTantQue(db, bob, s => s(`select public.api_friend('add', $1)`, [alice]));
  const s = await api(alice, 'api_state');
  expect(s.positions).toHaveLength(1);
  expect(s.positions[0]).toMatchObject({ m: 'btc150k', s: 'oui' });
  expect(s.positions[0].sh).toBeGreaterThan(70);
  expect(s.me.balance).toBeCloseTo(450, 1);
  expect(s.freqIn).toEqual([bob]);
  expect(s.users[bob]).toMatchObject({ n: 'bob', t: 0, d: 0, bot: false });
  expect(s.users[bob]).not.toHaveProperty('email');
  expect((await api(bob, 'api_state')).freqOut).toEqual([alice]);
});

test('api_profile_update : pseudo unique et valide, bio, couleur, avatar de la galerie', async () => {
  const carol = await creerJoueur(db, 'carol');
  const r = await api(carol, 'api_profile_update', { n: 'Carol.B', bio: 'Salut', color: '#13804F', photo: 'g:renard', pub: false });
  expect(r.me).toMatchObject({ n: 'Carol.B', bio: 'Salut', color: '#13804F', photo: 'g:renard', pub: false });
  expect(await refus(db, carol, `select public.api_profile_update('{"n":"ALICE"}')`)).toMatch(/pseudo_pris/);
  expect(await refus(db, carol, `select public.api_profile_update('{"n":"x"}')`)).toMatch(/pseudo_invalide/);
  expect(await refus(db, carol, `select public.api_profile_update('{"n":"admin"}')`)).toMatch(/pseudo_invalide/);
  expect(await refus(db, carol, `select public.api_profile_update($1)`, [{ bio: 'x'.repeat(161) }])).toMatch(/bio_trop_longue/);
  expect(await refus(db, carol, `select public.api_profile_update('{"color":"rouge"}')`)).toMatch(/couleur_invalide/);
  expect(await refus(db, carol, `select public.api_profile_update('{"photo":"data:image/png;base64,AAAA"}')`)).toMatch(/photo_invalide/);
  expect((await api(carol, 'api_profile_update', { n: 'Carol.B' })).me.n).toBe('Carol.B');                  // garder son propre pseudo est permis
  expect((await api(alice, 'api_state')).me.n).toBe('alice');                                               // personne d'autre n'est touché
  // profil privé : la fiche publique ne montre plus la bio ni les chiffres
  expect((await q(db, 'select wm.fiche($1) as f', [carol]))[0].f).toMatchObject({ n: 'Carol.B', bio: '', pub: 0 });
});

test('api_onboarding : 100 XP de bienvenue une seule fois, passage Fer II annoncé, fin de l’onboarding', async () => {
  const dave = await creerJoueur(db, 'dave');
  const r1 = await api(dave, 'api_onboarding', { bonus: true });
  expect(r1.me).toMatchObject({ xp: 100, obBonus: true, onboarded: false });
  expect(r1.ev.filter(e => e.k === 'xp')).toEqual([{ k: 'xp', n: 100, src: 'bienvenue' }]);
  const notif = r1.ev.find(e => e.k === 'notif');
  expect(notif.n).toMatchObject({ ic: 'trophy', code: 'rank_up', p: { t: 0, d: 1 }, href: '#rang', read: false });
  const r2 = await api(dave, 'api_onboarding', { bonus: true, done: true });                                 // rejouer ne redonne rien
  expect(r2.me).toMatchObject({ xp: 100, onboarded: true });
  expect(r2.ev).toEqual([]);
  expect((await q(db, 'select rank_tier, rank_division from public.user_stats where user_id = $1', [dave]))[0]).toEqual({ rank_tier: 0, rank_division: 1 });
  const s = await api(dave, 'api_state');
  expect(s.notifs).toHaveLength(1);
  expect(s.notifs[0]).toMatchObject({ code: 'rank_up', read: false });
});

test('préférences : aller-retour, taille bornée', async () => {
  await api(alice, 'api_prefs_save', { v: 1, tmode: 'all', ctype: 'bougies', falerts: ['btc'], pro: { mk: {} } });
  expect((await api(alice, 'api_state')).prefs).toEqual({ v: 1, tmode: 'all', ctype: 'bougies', falerts: ['btc'], pro: { mk: {} } });
  expect((await api(bob, 'api_state')).prefs).toEqual({});
  expect(await refus(db, alice, 'select public.api_prefs_save($1)', [{ gros: Array.from({ length: 30000 }, (_, i) => 'valeur-' + i + '-' + Math.random()) }])).toMatch(/prefs_trop_grandes/);
  expect(await refus(db, alice, `select public.api_prefs_save('[1,2]')`)).toMatch(/prefs_invalides/);
});

test('notifications : lues, masquée une à une, toutes masquées — rien n’est supprimé', async () => {
  const erin = await creerJoueur(db, 'erin');
  await q(db, `select wm.notify($1, 'gift', 'mission_done', '{"id":"dep1","xp":100}', '#rang'), wm.notify($1, 'star', 'badge', '{"id":"first"}', '#profil'), wm.notify($1, 'check', 'bet_placed', '{}', '#profil')`, [erin]);
  let n = (await api(erin, 'api_state')).notifs;
  expect(n.map(x => x.read)).toEqual([false, false, false]);
  await api(erin, 'api_notifs_read');
  n = (await api(erin, 'api_state')).notifs;
  expect(n.map(x => x.read)).toEqual([true, true, true]);
  await api(erin, 'api_notif_hide', n[0].id);
  expect((await api(erin, 'api_state')).notifs).toHaveLength(2);
  await enTantQue(db, erin, s => s('select public.api_notif_hide()'));
  expect((await api(erin, 'api_state')).notifs).toHaveLength(0);
  expect((await q(db, 'select count(*)::int as n from public.notifications where user_id = $1', [erin]))[0].n).toBe(3);
  // on ne peut pas masquer la notification d'un autre
  await q(db, `select wm.notify($1, 'gift', 'x')`, [alice]);
  const autre = (await api(alice, 'api_state')).notifs[0].id;
  await api(erin, 'api_notif_hide', autre);
  expect((await api(alice, 'api_state')).notifs.map(x => x.id)).toContain(autre);
});

test('missions et badges : progression, notification à la fin, badge attribué une fois', async () => {
  const fred = await creerJoueur(db, 'fred', 100);
  await api(fred, 'api_state');
  // les aides internes ne sont pas appelables par un client
  expect(await refus(db, fred, `select wm.mission_progress(auth.uid(), 'chat', 1)`)).toMatch(/permission denied/);
  expect(await refus(db, fred, `select wm.xp_add(auth.uid(), 1000, 'x')`)).toMatch(/permission denied/);
  expect(await refus(db, fred, `select wm.notify(auth.uid(), 'gift', 'x')`)).toMatch(/permission denied/);
  expect(await refus(db, fred, `select wm.login_lookup('alice')`)).toMatch(/permission denied/);
  await q(db, `select wm.mission_progress($1, 'chat', 1)`, [fred]);
  await q(db, `update public.user_stats set bets_placed = 1 where user_id = $1`, [fred]);
  await q(db, `select wm.badges_check($1), wm.badges_check($1)`, [fred]);
  const s = await api(fred, 'api_state');
  expect(s.missions.find(m => m.id === 'chat1')).toMatchObject({ have: 1, goal: 1, claimed: false });
  expect(s.badges).toEqual(['first']);
  expect(s.notifs.map(n => n.code).sort()).toEqual(['badge', 'mission_done']);
});

test('rang : mêmes seuils que le front', async () => {
  const rang = async (xp, settled, wins, deps, fw, fol, pos) => { const r = (await q(db, 'select t, d from wm.rank_of($1,$2,$3,$4,$5,$6,$7)', [xp, settled, wins, deps, fw, fol, pos]))[0]; return [r.t, r.d]; };
  expect(await rang(0, 0, 0, 0, 0, 0, 38901)).toEqual([0, 0]);
  expect(await rang(100, 0, 0, 0, 0, 0, 38901)).toEqual([0, 1]);
  expect(await rang(5000, 0, 0, 0, 0, 0, 38901)).toEqual([0, 2]);              // beaucoup d'XP mais aucun pari réglé : reste Fer III
  expect(await rang(300, 3, 1, 0, 0, 0, 38901)).toEqual([1, 0]);
  expect(await rang(900, 10, 5, 0, 0, 0, 38901)).toEqual([1, 2]);              // pas de dépôt : bloqué en Bronze III
  expect(await rang(900, 10, 5, 1, 0, 0, 38901)).toEqual([2, 0]);
  expect(await rang(1840, 186, 119, 1, 0, 18, 1284)).toEqual([3, 1]);          // le compte démo User26 : Or II
  expect(await rang(9000, 400, 300, 1, 5, 400, 150)).toEqual([7, 2]);          // pas dans le top 100 : Immortel III
  expect(await rang(9000, 400, 300, 1, 5, 400, 100)).toEqual([8, 0]);
});

test('connexion par pseudo : la recherche d’e-mail est réservée au service, et limitée à 10 essais', async () => {
  const chercher = p => db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query('select wm.login_lookup($1) as e', [p])).rows[0].e; });
  expect(await chercher('ALICE')).toBe('alice@test.dev');
  expect(await chercher('inconnu')).toBeNull();
  expect(await chercher('pas valide !')).toBeNull();
  for (let i = 0; i < 9; i++) await chercher('alice');
  await expect(chercher('alice')).rejects.toThrow(/trop_de_tentatives/);
});
