// Panel d'administration : chaque action est contrôlée par le serveur (liste public.admin_users), journalisée, et
// l'argent reste juste (résolution d'un marché : 1 $ par part gagnante, rien d'autre ne bouge).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, alice, bob;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'admin')`, [chef]);
  await q(db, `insert into public.users (username, email, is_demo) values ('bot_alpha', 'bot_alpha@nulle.part', true)`);
});
test.afterAll(async () => { await db.close(); });

const adm = (qui, action, p = {}) => enTantQue(db, qui, s => s('select public.api_admin($1, $2::jsonb) as r', [action, JSON.stringify(p)])).then(r => r[0].r);
const non = (qui, action, p = {}) => refus(db, qui, 'select public.api_admin($1, $2::jsonb)', [action, JSON.stringify(p)]);
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, rank_tier as t, rank_division as d, bets_settled as settled, bets_won as wins from public.user_stats where user_id = $1', [u]))[0];
const journal = async () => (await q(db, 'select action, cible, detail from wm.admin_journal order by id')).map(j => [j.action, j.cible]);
const ACTIONS = ['chiffres', 'joueurs', 'joueur', 'solde', 'xp', 'rang', 'kyc', 'suspendre', 'marches', 'marche', 'marche_etat', 'resoudre', 'chat', 'masquer', 'bots', 'journal'];

test('réservé aux administrateurs : un visiteur, un joueur et un appel direct des fonctions internes sont refusés', async () => {
  expect(await non(null, 'moi')).toMatch(/permission denied/);
  expect(await adm(alice, 'moi')).toEqual({ admin: false });
  expect(await adm(chef, 'moi')).toEqual({ admin: true });
  for (const a of ACTIONS) expect(await non(alice, a, { id: bob, delta: 500, motif: 'cadeau', t: 5, d: 0, ok: true, jours: 1, issue: 'oui', etat: 'closed' }), a).toMatch(/interdit/);
  expect(await non(chef, 'inconnue')).toMatch(/action_inconnue/);
  for (const f of [`wm.adm_solde('${alice}', '${alice}', 500, 'cadeau')`, `wm.adm_marche_resoudre('${alice}', 'btc150k', 'oui')`, `wm.marche_regler('btc150k', 'oui')`, 'wm.adm_chiffres()', 'wm.adm_journal()'])
    expect(await refus(db, alice, 'select ' + f), f).toMatch(/permission denied/);
  expect(await refus(db, alice, 'select * from wm.admin_journal')).toMatch(/permission denied/);
  expect((await stats(alice)).balance).toBe(1000);
  expect(await journal()).toEqual([]);
});

test('joueurs : recherche par pseudo ou e-mail, solde avec motif journalisé (jamais négatif), XP, rang, KYC', async () => {
  const tous = (await adm(chef, 'joueurs', { q: '' })).joueurs;
  expect(tous.map(j => j.n).sort()).toEqual(['alice', 'bob', 'chef']);                       // sans recherche : les vrais comptes, pas les bots
  expect((await adm(chef, 'joueurs', { q: 'ALI' })).joueurs.map(j => j.n)).toEqual(['alice']);
  expect((await adm(chef, 'joueurs', { q: 'bob@test' })).joueurs.map(j => [j.n, j.email])).toEqual([['bob', 'bob@test.dev']]);
  expect((await adm(chef, 'joueurs', { q: 'bot_al' })).joueurs.map(j => [j.n, j.bot])).toEqual([['bot_alpha', true]]);
  expect((await adm(chef, 'joueurs', { q: '%' })).joueurs).toEqual([]);                      // le « % » n'est pas un joker

  expect(await non(chef, 'solde', { id: alice, delta: 250 })).toMatch(/motif_requis/);
  expect(await non(chef, 'solde', { id: alice, delta: 0, motif: 'rien' })).toMatch(/montant_invalide/);
  expect(await non(chef, 'solde', { id: alice, delta: -5000, motif: 'trop' })).toMatch(/solde_negatif/);
  const r = await adm(chef, 'solde', { id: alice, delta: 250.5, motif: 'geste commercial' });
  expect(r.j).toMatchObject({ n: 'alice', balance: 1250.5, admin: false });
  expect(r.ops[0]).toMatchObject({ k: 'admin', amt: 250.5, solde: 1250.5, ref: 'geste commercial' });
  expect(r.journal[0]).toMatchObject({ a: 'solde', d: { delta: 250.5, avant: 1000, apres: 1250.5, motif: 'geste commercial' } });
  await adm(chef, 'solde', { id: alice, delta: -250.5, motif: 'correction' });
  expect((await stats(alice)).balance).toBe(1000);
  expect((await q(db, `select code, params from public.notifications where user_id = $1 and code = 'admin_solde' order by created_at`, [alice])).map(n => n.params.delta)).toEqual([250.5, -250.5]);

  expect((await adm(chef, 'xp', { id: bob, delta: 450 })).j).toMatchObject({ xp: 450, t: 0, d: 2 });          // 450 XP mais aucun pari réglé : Fer III
  expect((await adm(chef, 'xp', { id: bob, delta: -9999 })).j.xp).toBe(0);
  expect(await non(chef, 'rang', { id: bob, t: 9, d: 0 })).toMatch(/rang_invalide/);
  const or = (await adm(chef, 'rang', { id: bob, t: 3, d: 1 })).j;                           // Or II
  expect(or).toMatchObject({ t: 3, d: 1, xp: 1700, settled: 25, deposits: 1 });
  expect(or.wins).toBeGreaterThanOrEqual(13);
  expect(await stats(bob)).toMatchObject({ t: 3, d: 1 });
  expect((await adm(chef, 'rang', { id: bob, t: 1, d: 0 })).j).toMatchObject({ t: 3, d: 1 });                 // ne fait jamais baisser

  expect((await adm(chef, 'kyc', { id: alice, ok: true })).j.kyc).toBe(true);
  expect((await enTantQue(db, alice, s => s('select public.api_state() as r')))[0].r.me.kyc).toBe(true);
  expect((await adm(chef, 'kyc', { id: alice, ok: false })).j.kyc).toBe(false);
  expect((await journal()).map(j => j[0])).toEqual(['solde', 'solde', 'xp', 'xp', 'rang', 'rang', 'kyc', 'kyc']);
});

test('suspension : le serveur refuse tout au joueur suspendu, jusqu’à la levée ; un administrateur ne peut pas l’être', async () => {
  expect(await non(chef, 'suspendre', { id: bob, jours: 7 })).toMatch(/motif_requis/);
  expect(await non(chef, 'suspendre', { id: chef, jours: 7, motif: 'essai' })).toMatch(/interdit/);
  const s = (await adm(chef, 'suspendre', { id: bob, jours: 7, motif: 'insultes dans le chat' })).j;
  expect(s.susp).toBeGreaterThan(Date.now() + 6 * 86400000); expect(s.suspMotif).toBe('insultes dans le chat');
  for (const sql of ['select public.api_state()', `select public.api_buy('btc150k', 'oui', 10, gen_random_uuid())`, `select public.api_chat_send('general', 'coucou')`])
    expect(await refus(db, bob, sql), sql).toMatch(/suspendu/);
  expect((await adm(chef, 'suspendre', { id: bob, jours: -1, motif: 'récidive' })).j.susp).toBe(-1);
  expect((await adm(chef, 'suspendre', { id: bob, jours: 0 })).j.susp).toBeNull();
  expect((await enTantQue(db, bob, s => s('select public.api_state() as r')))[0].r.me.n).toBe('bob');
});

test('marchés : création, modification, fermeture des mises, réouverture ; le site reçoit l’état et la description', async () => {
  await q(db, 'truncate realtime.messages');
  const def = { id: 'pluie-paris', q: 'Pleuvra-t-il à Paris dimanche ?', short: 'Pluie à Paris', cat: 'Météo', date: '2027-03-07', time: '18:00', p: 40, heat: 2, rules: 'Oui si Météo-France relève au moins 1 mm.' };
  for (const [faux, code] of [[{ id: 'A b' }, /identifiant_invalide/], [{ q: 'court' }, /question_invalide/], [{ cat: 'Cuisine' }, /categorie_invalide/], [{ date: 'demain' }, /date_invalide/], [{ date: '2020-01-01' }, /date_invalide/], [{ p: 99 }, /montant_invalide/]])
    expect(await non(chef, 'marche', { ...def, ...faux }), JSON.stringify(faux)).toMatch(code);
  const liste = (await adm(chef, 'marche', def)).marches;
  expect(liste.find(m => m.id === 'pluie-paris')).toMatchObject({ q: def.q, cat: 'Météo', st: 'open', p: 40, ref: 40, time: '18:00', cree: true, positions: 0 });
  const vu = (await enTantQue(db, null, s => s('select public.api_markets() as r')))[0].r.m;
  expect(vu['pluie-paris']).toMatchObject({ p: 40, st: 'open', def: { q: def.q, short: 'Pluie à Paris', cat: 'Météo', date: '2027-03-07', time: '18:00', rules: def.rules, heat: 2 } });
  expect(vu.btc150k.st).toBe('open'); expect(vu.btc150k).not.toHaveProperty('def');         // un marché du catalogue : pas de description
  await enTantQue(db, alice, s => s(`select public.api_buy('pluie-paris', 'oui', 20, gen_random_uuid())`));   // on peut y parier tout de suite
  expect((await enTantQue(db, alice, s => s(`select public.api_chat_history('m:pluie-paris') as r`)))[0].r.room).toBe('m:pluie-paris');

  await adm(chef, 'marche', { ...def, q: 'Pleuvra-t-il à Paris dimanche après-midi ?', p: 55 });
  const apres = (await adm(chef, 'marches')).marches.find(m => m.id === 'pluie-paris');
  expect(apres).toMatchObject({ q: 'Pleuvra-t-il à Paris dimanche après-midi ?', ref: 55, positions: 1 });
  expect(apres.p).not.toBe(55);                                                              // le prix en cours n'est pas écrasé : seule la valeur de référence change

  await adm(chef, 'marche_etat', { id: 'pluie-paris', etat: 'closed' });
  expect(await refus(db, alice, `select public.api_buy('pluie-paris', 'oui', 20, gen_random_uuid())`)).toMatch(/marche_ferme/);
  expect(await refus(db, alice, `select public.api_sell('pluie-paris', 'oui', 1, gen_random_uuid())`)).toMatch(/marche_ferme/);
  expect((await enTantQue(db, null, s => s('select public.api_markets() as r')))[0].r.m['pluie-paris'].st).toBe('closed');
  await adm(chef, 'marche_etat', { id: 'pluie-paris', etat: 'open' });
  await enTantQue(db, alice, s => s(`select public.api_buy('pluie-paris', 'oui', 5, gen_random_uuid())`));
  const etats = (await q(db, `select event, payload from realtime.messages where topic = 'marches' and event = 'etat' order by inserted_at`)).map(x => [x.payload.id, x.payload.st]);
  expect(etats).toEqual([['pluie-paris', 'open'], ['pluie-paris', 'open'], ['pluie-paris', 'closed'], ['pluie-paris', 'open']]);
});

test('résolution : 1 $ par part gagnante, positions réglées, statistiques et historique à jour, chacun prévenu ; rejouer est refusé', async () => {
  await enTantQue(db, alice, s => s(`select public.api_buy('clasico', 'oui', 200, gen_random_uuid())`));
  await enTantQue(db, bob, s => s(`select public.api_buy('clasico', 'non', 150, gen_random_uuid())`));
  const pos = async u => (await q(db, `select side, shares::float8 as sh, average_price::float8 as avg from public.positions where user_id = $1 and market_id = 'clasico'`, [u]))[0];
  const pa = await pos(alice), pb = await pos(bob), a0 = await stats(alice), b0 = await stats(bob);
  const total0 = (await q(db, 'select sum(balance)::float8 as t from public.user_stats'))[0].t;
  expect(await non(chef, 'resoudre', { id: 'clasico', issue: 'peut-etre' })).toMatch(/issue_invalide/);
  await q(db, 'truncate realtime.messages');

  const r = await adm(chef, 'resoudre', { id: 'clasico', issue: 'oui' });
  const gain = Math.trunc(pa.sh * 100) / 100;
  expect(r.reglement).toEqual({ joueurs: 2, verse: gain });
  expect(r.marches.find(m => m.id === 'clasico')).toMatchObject({ st: 'resolved', issue: 'oui', positions: 0 });
  const a1 = await stats(alice), b1 = await stats(bob);
  expect(a1.balance).toBeCloseTo(a0.balance + gain, 2); expect(b1.balance).toBe(b0.balance);  // le perdant ne reçoit rien, ne perd rien de plus
  expect([a1.settled - a0.settled, a1.wins - a0.wins, b1.settled - b0.settled, b1.wins - b0.wins]).toEqual([1, 1, 1, 0]);
  expect((await q(db, 'select sum(balance)::float8 as t from public.user_stats'))[0].t).toBeCloseTo(total0 + gain, 2);   // rien d'autre n'a bougé
  expect((await pos(alice)).sh).toBe(0); expect((await pos(bob)).sh).toBe(0);
  const hist = await q(db, `select user_id, kind, side, was_winner, pnl::float8 as pnl from public.position_history where market_id = 'clasico' and kind = 'res' order by was_winner desc`);
  expect(hist.map(h => [h.user_id, h.side, h.was_winner])).toEqual([[alice, 'oui', true], [bob, 'non', false]]);
  expect(hist[0].pnl).toBeCloseTo(gain - pa.sh * pa.avg / 100, 1); expect(hist[1].pnl).toBeCloseTo(-pb.sh * pb.avg / 100, 1);   // comme à la vente : par rapport au prix d'achat des parts
  const notifs = await q(db, `select user_id, params from public.notifications where code = 'marche_resolu' order by (params ->> 'pay')::numeric desc`);
  expect(notifs.map(n => [n.user_id, n.params.m, n.params.s, n.params.o, n.params.pay])).toEqual([[alice, 'clasico', 'oui', 'oui', gain], [bob, 'clasico', 'non', 'oui', 0]]);
  expect((await q(db, `select payload from realtime.messages where topic = 'marches' and event = 'etat'`)).map(x => x.payload)).toEqual([{ id: 'clasico', st: 'resolved', o: 'oui' }]);
  expect((await q(db, `select topic from realtime.messages where event = 'notif' order by topic`)).map(x => x.topic).sort()).toEqual(['joueur:' + alice, 'joueur:' + bob].sort());   // prévenus en direct, chacun sur son sujet privé

  expect(await non(chef, 'resoudre', { id: 'clasico', issue: 'non' })).toMatch(/deja_resolu/);
  expect(await non(chef, 'marche_etat', { id: 'clasico', etat: 'open' })).toMatch(/deja_resolu/);
  expect(await refus(db, alice, `select public.api_buy('clasico', 'oui', 10, gen_random_uuid())`)).toMatch(/marche_ferme/);
  expect((await stats(alice)).balance).toBeCloseTo(a0.balance + gain, 2);
  const vu = (await enTantQue(db, null, s => s('select public.api_markets() as r')))[0].r.m.clasico;
  expect(vu.st).toBe('resolved'); expect(vu).not.toHaveProperty('ph');
  await q(db, 'select wm.present()'); for (let i = 0; i < 30; i++) await q(db, 'select wm.bots_tick()');
  expect((await q(db, `select current_probability::float8 as p from public.market_live_state where market_id = 'clasico'`))[0].p).toBe(99);   // les bots n'y touchent plus
});

test('marché à plusieurs issues : résoudre une issue par « oui » résout les autres par « non »', async () => {
  await db.exec(`
    insert into public.market_groups (id, category, question) values ('g', 'Politique', 'Qui gagnera ?');
    insert into public.markets (id, category, question, status, group_parent_id) values ('g-a', 'Politique', 'A ?', 'open', 'g'), ('g-b', 'Politique', 'B ?', 'open', 'g'), ('g-c', 'Politique', 'C ?', 'open', 'g');
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values ('g-a', 50, 50, 2000000, 10, 12000), ('g-b', 30, 30, 1500000, 10, 9000), ('g-c', 20, 20, 1000000, 10, 6000);`);
  await enTantQue(db, alice, s => s(`select public.api_buy('g-b', 'oui', 50, gen_random_uuid())`));
  await enTantQue(db, bob, s => s(`select public.api_buy('g-c', 'non', 40, gen_random_uuid())`));
  const sb = (await q(db, `select shares::float8 as sh from public.positions where user_id = $1 and market_id = 'g-c'`, [bob]))[0].sh, b0 = await stats(bob), a0 = await stats(alice);
  const r = await adm(chef, 'resoudre', { id: 'g-a', issue: 'oui' });
  expect(Object.keys(r.autres).sort()).toEqual(['g-b', 'g-c']);
  expect((await q(db, `select id, status, resolution_outcome as o from public.markets where group_parent_id = 'g' order by id`))).toEqual([{ id: 'g-a', status: 'resolved', o: 'yes' }, { id: 'g-b', status: 'resolved', o: 'no' }, { id: 'g-c', status: 'resolved', o: 'no' }]);
  expect((await stats(bob)).balance).toBeCloseTo(b0.balance + Math.trunc(sb * 100) / 100, 2);                 // « non » sur C : gagné
  expect((await stats(alice)).balance).toBe(a0.balance);                                                       // « oui » sur B : perdu
});

test('chat : masquer un message le retire de l’historique et des écrans, sans le supprimer ; bots et chiffres', async () => {
  await enTantQue(db, alice, s => s(`select public.api_chat_send('general', 'message déplacé')`));
  const [{ id }] = await q(db, `select id from public.chat_messages where text_content = 'message déplacé'`);
  expect((await adm(chef, 'chat')).msgs[0]).toMatchObject({ id: Number(id), room: 'general', n: 'alice', text: 'message déplacé' });
  await q(db, 'truncate realtime.messages');
  expect((await adm(chef, 'masquer', { id })).msgs.find(m => m.text === 'message déplacé')).toBeUndefined();
  expect((await q(db, `select source from public.chat_messages where id = $1`, [id]))[0].source).toBe('masque');
  expect((await enTantQue(db, bob, s => s(`select public.api_chat_history('general') as r`)))[0].r.msgs.filter(m => m.text === 'message déplacé')).toEqual([]);
  expect((await q(db, `select topic, event, payload from realtime.messages where event = 'del'`))).toEqual([{ topic: 'salon:general', event: 'del', payload: { id: Number(id) } }]);
  expect(await non(chef, 'masquer', { id })).toMatch(/message_inconnu/);

  expect(await non(chef, 'bots', { intensite: 9 })).toMatch(/montant_invalide/);
  const c = await adm(chef, 'bots', { actif: false, intensite: 2, chat: 0.5 });
  expect(c.bots_cfg).toMatchObject({ actif: false, intensite: 2, chat: 0.5 });
  const avant = (await q(db, `select current_probability::float8 as p from public.market_live_state where market_id = 'btc150k'`))[0].p;
  await q(db, 'select wm.present()'); for (let i = 0; i < 20; i++) await q(db, 'select wm.bots_tick()');
  expect((await q(db, `select current_probability::float8 as p from public.market_live_state where market_id = 'btc150k'`))[0].p).toBe(avant);   // coupés
  expect((await adm(chef, 'bots', { actif: true })).bots_cfg).toMatchObject({ actif: true, intensite: 2, chat: 0.5 });
  expect(c).toMatchObject({ inscrits: 3, bots: 1 });
  expect(c.marches_ouverts).toBeGreaterThan(0); expect(c.base_mo).toBeGreaterThanOrEqual(0); expect(c.volume_total).toBeGreaterThan(0);
  const j = (await adm(chef, 'journal')).journal;
  expect(j[0]).toMatchObject({ a: 'bots', par: 'chef' });
  expect(j.map(x => x.a)).toEqual(expect.arrayContaining(['marche_resolu', 'marche_cree', 'marche_modifie', 'marche_ferme', 'marche_rouvert', 'message_masque', 'suspension', 'suspension_levee', 'solde']));
});
