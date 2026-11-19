// Marchés réels, lot 12 : la migration de mise en ligne (supabase/migrations/a_appliquer_a_la_mise_en_ligne_catalogue.sql),
// NON appliquée en production tant que le nouvel écran n'est pas en ligne. Testée ici dans une base embarquée chargée avec
// les 27 anciens marchés fictifs relevés en production (tests/fixtures/anciens-marches.json) et des joueurs qui y ont des
// positions, un duel en jeu et un combiné : remboursements exacts au prix d'achat, rien de supprimé, catalogue en ligne.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { creerBase, creerJoueur, enTantQue, q } from './base.mjs';

test.describe.configure({ mode: 'serial' });
const MEL = fs.readFileSync('supabase/migrations/a_appliquer_a_la_mise_en_ligne_catalogue.sql', 'utf8');
const F = JSON.parse(fs.readFileSync('tests/fixtures/anciens-marches.json', 'utf8'));
let db, alice, bob, carole, avant = {};
const compte = async t => Number((await q(db, `select count(*) from ${t}`))[0].count);
const solde = async u => Number((await q(db, 'select balance from public.user_stats where user_id = $1', [u]))[0].balance);
const achat = (u, m, s, x) => enTantQue(db, u, sq => sq(`select public.api_buy($1, $2, $3, gen_random_uuid()) as r`, [m, s, x]));

test.beforeAll(async () => {
  db = await creerBase();
  await db.exec(`insert into public.badges (id, name, icon) values ('first', 'Premier pari', 'check'), ('streak7', 'Série de 7 jours', 'flame'), ('contra', 'Contre la foule', 'down'),
    ('voice', 'Voix du live chat', 'chat'), ('dep', 'Premier dépôt', 'wallet'), ('flash3', 'Triplé éclair', 'bolt'), ('fol25', 'Suivi par 25', 'users'),
    ('clanfounder', 'Fondateur de clan', 'shield'), ('clanweek', 'Champion de clan', 'trophy'), ('whale', 'Grosse mise', 'target');
    insert into public.chat_rooms (id, name, kind, market_id) values ('general', 'Général', 'global', null), ('vip', 'VIP', 'vip', null);`);
  for (const [id, cat, question, court, jour] of F.groups)
    await q(db, `insert into public.market_groups (id, category, question, short_question, close_date, status) values ($1, $2, $3, $4, $5, 'open')`, [id, cat, question, court, jour]);
  for (const [id, cat, g, question, court, jour, p0, p, a, vol, people, liq] of F.markets) {
    await q(db, `insert into public.markets (id, category, question, short_question, close_date, status, group_parent_id, initial_probability, current_probability, anchor_probability)
                 values ($1, $2, $3, $4, $5, 'open', $6, $7, $7, $7)`, [id, cat, question, court, jour, g, p0]);
    await q(db, `insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth, d0)
                 values ($1, $2, $3, $4, $5, $6, $7)`, [id, p, a, vol, people, liq, p0]);
    if (g) await q(db, `insert into public.market_outcomes (id, group_id, market_id, label) values ($1, $2, $1, $3)`, [id, g, F.labels[id]]);
    await q(db, `insert into public.chat_rooms (id, name, kind, market_id) values ($1, $2, 'market', $3)`, ['m:' + id, '#' + id, id]);
  }
  alice = await creerJoueur(db, 'alice_mel', 1000); bob = await creerJoueur(db, 'bob_mel', 1000); carole = await creerJoueur(db, 'carole_mel', 500);
  await achat(alice, 'btc150k', 'oui', 120); await achat(alice, 'presid27-roux', 'oui', 60);
  await achat(bob, 'btc150k', 'non', 90); await achat(bob, 'clasico', 'non', 40); await achat(carole, 'ldc27-psg', 'oui', 25);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted')`, [alice, bob]);
  const d = await enTantQue(db, alice, s => s('select public.api_duel_create($1::jsonb) as r', [JSON.stringify({ m: 'eth6000', side: 'non', stake: 15, opp: bob, key: crypto.randomUUID() })]));
  await enTantQue(db, bob, s => s('select public.api_duel_accept($1::jsonb) as r', [JSON.stringify({ id: d[0].r.duel.id })]));
  await enTantQue(db, carole, s => s('select public.api_combo_place($1::jsonb) as r', [JSON.stringify({ stake: 10, key: crypto.randomUUID(), legs: [{ m: 'bce', s: 'oui' }, { m: 'neige-noel', s: 'non' }] })]));
  for (const t of ['public.positions', 'public.balance_ledger', 'public.markets', 'public.market_live_state', 'public.chat_rooms', 'public.position_history', 'wm.duels', 'wm.combos', 'public.users'])
    avant[t] = await compte(t);
});
test.afterAll(async () => { await db.close(); });

test('avant : ni l’ancien écran ni les joueurs ne voient de différence ; aperçu des remboursements', async () => {
  expect(await compte('public.markets')).toBe(27);
  expect((await q(db, `select count(*) from wm.fiches where moteur`))[0].count).toBe(0);
  const pos = await q(db, `select user_id, market_id, side, shares, average_price from public.positions where shares > 0 order by market_id, side`);
  expect(pos.length).toBe(5);
});

test('la mise en ligne : positions remboursées au prix d’achat, duel et combiné rendus, rien supprimé, catalogue en ligne', async () => {
  const pos = await q(db, `select user_id, market_id, side, shares, average_price from public.positions where shares > 0`);
  const attendu = {};
  for (const p of pos) attendu[p.user_id] = (attendu[p.user_id] || 0) + Math.round(Number(p.shares) * Number(p.average_price)) / 100;
  const s0 = { alice: await solde(alice), bob: await solde(bob), carole: await solde(carole) };
  const duel = (await q(db, `select mise, mise_adv from wm.duels where m = 'eth6000'`))[0];
  await db.exec(MEL);
  // remboursements exacts : parts × prix moyen ; plus les mises du duel (celle de chacun) et la mise du combiné (10, toutes ses sélections annulées)
  expect(await solde(alice)).toBeCloseTo(s0.alice + attendu[alice] + Number(duel.mise), 2);
  expect(await solde(bob)).toBeCloseTo(s0.bob + attendu[bob] + Number(duel.mise_adv), 2);
  expect(await solde(carole)).toBeCloseTo(s0.carole + attendu[carole] + 10, 2);
  const led = await q(db, `select kind, count(*)::int as n, sum(amount) as s from public.balance_ledger where kind in ('annulation', 'duel_rendu', 'combo_rembourse') group by kind order by kind`);
  expect(led.map(l => [l.kind, l.n])).toEqual([['annulation', 5], ['combo_rembourse', 1], ['duel_rendu', 2]]);
  expect(Number(led.find(l => l.kind === 'annulation').s)).toBeCloseTo(Object.values(attendu).reduce((a, b) => a + b, 0), 2);
  // rien n'est supprimé
  for (const t of Object.keys(avant)) expect(await compte(t), t).toBeGreaterThanOrEqual(avant[t]);
  expect(await compte('public.positions')).toBe(avant['public.positions']);
  expect(Number((await q(db, `select count(*) from public.positions where shares > 0 and market_id in (select id from wm.fiches where origine = 'ancien' union select market_id from wm.fiches_options o join wm.fiches f on f.id = o.fiche_id where f.origine = 'ancien')`))[0].count)).toBe(0);
  // les 27 anciens marchés : annulés (resolved / voided), leurs groupes aussi, leurs fiches masquées
  const m = await q(db, `select status, resolution_outcome, count(*)::int as n from public.markets where id = any ($1) group by 1, 2`, [F.markets.map(x => x[0])]);
  expect(m).toEqual([{ status: 'resolved', resolution_outcome: 'voided', n: 27 }]);
  expect((await q(db, `select count(*)::int as n from public.market_groups where status = 'resolved' and resolution_outcome = 'voided'`))[0].n).toBe(3);
  const anciens = await q(db, `select cycle, masque, count(*)::int as n from wm.fiches where origine = 'ancien' group by 1, 2`);
  expect(anciens).toEqual([{ cycle: 'annule', masque: true, n: 13 }]);
  expect((await q(db, `select count(*)::int as n from public.notifications where code = 'marche_annule'`))[0].n).toBe(5);
  // le catalogue en ligne : l'interrupteur, les 60 marchés et leurs lignes du moteur
  const cat = (await enTantQue(db, null, s => s(`select public.api_catalogue(0, 'fr') as r`)))[0].r;
  expect(cat.en_ligne).toBe(true);
  expect(cat.m.length).toBe(60);
  expect(cat.m.some(x => F.markets.some(a => a[0] === x.id))).toBe(false);
  expect((await q(db, `select count(*)::int as n from wm.fiches where origine <> 'ancien' and not moteur`))[0].n).toBe(0);
  const mk = (await enTantQue(db, null, s => s('select public.api_markets() as r')))[0].r.m;
  expect(mk['btc-fin-decembre-2026'].st).toBe('open');
  expect(mk['btc150k'].st).toBe('resolved');
  // on parie sur un nouveau marché ; les bots l'animent
  const r = await achat(carole, 'btc-fin-decembre-2026', 'oui', 20);
  expect(r[0].r.pos.sh).toBeGreaterThan(0);
  await q(db, `insert into wm.config (key, value, updated_at) values ('presence', '{}', now()) on conflict (key) do update set updated_at = now()`);
  for (let i = 0; i < 30; i++) await q(db, 'select wm.bots_tick()');
  expect(Number((await q(db, `select count(*) from public.market_live_state l join wm.fiches f on f.id = l.market_id where f.origine <> 'ancien' and jsonb_array_length(l.price_history) > 0`))[0].count)).toBeGreaterThan(0);
  // journal : une entrée par annulation, plus la mise en ligne, d'origine « migration »
  const j = await q(db, `select action, origine from wm.journal where action in ('marche_annuler', 'mise_en_ligne_catalogue') order by id`);
  expect(j.filter(x => x.action === 'marche_annuler').length).toBe(13);
  expect(j.every(x => x.origine === 'migration')).toBe(true);
});

test('rejouer la mise en ligne ne rembourse pas deux fois ; l’ancien panneau reste cohérent avec les fiches', async () => {
  const s = await solde(alice), n = await compte('public.balance_ledger');
  await db.exec(MEL);
  expect(await solde(alice)).toBe(s);
  expect(await compte('public.balance_ledger')).toBe(n);
  // un marché de joueur créé par l'ancien chemin reçoit sa fiche ; résolu par l'ancien panneau, sa fiche suit
  await q(db, `insert into public.markets (id, category, question, short_question, creator_user_id, status, close_date) values ('perso-essai-1', 'Crypto', 'Une question de joueur ?', 'Question joueur', $1, 'open', '2027-01-01')`, [bob]);
  expect((await q(db, `select origine, masque from wm.fiches where id = 'perso-essai-1'`))[0]).toEqual({ origine: 'joueur', masque: false });
  await q(db, `select wm.marche_regler('perso-essai-1', 'oui')`);
  expect((await q(db, `select cycle, resolu_issue, resolu_source from wm.fiches where id = 'perso-essai-1'`))[0]).toEqual({ cycle: 'resolu', resolu_issue: 'oui', resolu_source: 'ancien panneau' });
});
