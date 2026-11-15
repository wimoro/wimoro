// Argent fictif et jeu responsable côté serveur : dépôts (crypto et moyens classiques), retraits, KYC, plafonds de
// dépôt, pause, auto-exclusion. Couvre B13, B14, K42 et les points 6, 7 et 10 de la recette (partie serveur).
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db;
test.beforeAll(async () => { db = await creerBase(); await semer(db); });
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select ${sql} as r`, params)))[0].r;
const depot = (uid, p, cle = randomUUID()) => api(uid, 'public.api_demo_deposit($1::jsonb, $2)', [JSON.stringify(p), cle]);
const retrait = (uid, p, cle = randomUUID()) => api(uid, 'public.api_demo_withdraw($1::jsonb, $2)', [JSON.stringify(p), cle]);
const refusDepot = (uid, p) => refus(db, uid, 'select public.api_demo_deposit($1::jsonb, $2)', [JSON.stringify(p), randomUUID()]);
const refusRetrait = (uid, p) => refus(db, uid, 'select public.api_demo_withdraw($1::jsonb, $2)', [JSON.stringify(p), randomUUID()]);
/** fait passer le temps : tout ce qui est en attente arrive à échéance */
const echeance = uid => q(db, `with a as (update public.deposits set due_at = now() - interval '1 second' where user_id = $1 and status = 'pending' returning 1),
  b as (update public.withdrawals set due_at = now() - interval '1 second' where user_id = $1 and status = 'pending' returning 1) select (select count(*) from a) + (select count(*) from b) as n`, [uid]);
const KYC = { fn: 'Ana', ln: 'Test', bd: '1990-05-01', co: 'France', doc: true };
const ADR = '0x' + 'a1'.repeat(20);

test('B13 · dépôt crypto : en attente, puis crédité à la fin des confirmations, avec tous ses effets', async () => {
  const u = await creerJoueur(db, 'depot1');
  await api(u, 'public.api_state()');                                                // comme le site : l'état est chargé avant toute action (missions de départ)
  const r = await depot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 });
  expect(r.dep).toMatchObject({ coin: 'USDC', net: 'Base', amt: 50, usd: 50, need: 12, conf: 0, st: 'pending' });
  expect(r.dep.due - r.dep.at).toBe(12 * 650);                                       // l'animation d'origine : 650 ms par confirmation
  expect(r.me.balance).toBe(0);                                                      // rien n'est crédité avant la fin
  // trop tôt : rien ne bouge
  const tot = await api(u, 'public.api_demo_settle()');
  expect(tot.me.balance).toBe(0); expect(tot.deps[0].st).toBe('pending'); expect(tot.ev).toEqual([]);
  await echeance(u);
  const s = await api(u, 'public.api_demo_settle()');
  expect(s.me).toMatchObject({ balance: 50, deposits: 1, xp: 100 });                  // 100 XP au premier dépôt de la journée
  expect(s.deps[0]).toMatchObject({ st: 'done', conf: 12, need: 12, usd: 50 });
  expect(s.ev.map(e => e.k)).toEqual(['dep', 'notif', 'mission', 'notif', 'xp', 'notif', 'badge', 'notif']);
  expect(s.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toEqual(['dep_credited', 'mission_done', 'rank_up', 'badge']);
  expect(s.ev.find(e => e.k === 'badge').id).toBe('dep');
  // régler deux fois ne crédite pas deux fois
  const encore = await api(u, 'public.api_demo_settle()');
  expect(encore.me.balance).toBe(50); expect(encore.ev).toEqual([]);
  // second dépôt le même jour : pas de nouveaux XP
  await depot(u, { method: 'crypto', coin: 'USDT', net: 'Tron', amt: 20 }); await echeance(u);
  const s2 = await api(u, 'public.api_demo_settle()');
  expect(s2.me).toMatchObject({ balance: 70, deposits: 2, xp: 100 });
  const journal = await q(db, `select kind, amount::float8 as a, balance_after::float8 as b from public.balance_ledger where user_id = $1 order by id`, [u]);
  expect(journal).toEqual([{ kind: 'demo_deposit', a: 50, b: 50 }, { kind: 'demo_deposit', a: 20, b: 70 }]);
});

test('un dépôt arrivé à échéance pendant l’absence du joueur est crédité au chargement suivant', async () => {
  const u = await creerJoueur(db, 'depot2');
  await depot(u, { method: 'crypto', coin: 'ETH', net: 'Base', amt: 0.02, usd: 81.37 });
  await echeance(u);                                                                 // onglet fermé avant la fin de l'animation
  const e = await api(u, 'public.api_state()');
  expect(e.me.balance).toBe(81.37);
  expect(e.deps[0]).toMatchObject({ coin: 'ETH', amt: 0.02, usd: 81.37, st: 'done' });
  expect(e.notifs.map(n => n.code)).toContain('dep_credited');
  expect(e.rg).toEqual({ lim: { day: 0, week: 0, month: 0 }, pend: {}, pause: 0, excl: 0 });
});

test('clé d’idempotence : un dépôt ou un retrait rejoué n’est appliqué qu’une fois', async () => {
  const u = await creerJoueur(db, 'rejeu', 300);
  const cle = randomUUID();
  const a = await depot(u, { method: 'crypto', coin: 'USDC', net: 'Solana', amt: 40 }, cle), b = await depot(u, { method: 'crypto', coin: 'USDC', net: 'Solana', amt: 40 }, cle);
  expect(b.dep.id).toBe(a.dep.id); expect(b.rejoue).toBe(true);
  expect((await q(db, 'select count(*)::int as n from public.deposits where user_id = $1', [u]))[0].n).toBe(1);
  const cle2 = randomUUID();
  await retrait(u, { method: 'crypto', net: 'Base', addr: ADR, amt: 100 }, cle2);
  const r2 = await retrait(u, { method: 'crypto', net: 'Base', addr: ADR, amt: 100 }, cle2);
  expect(r2.rejoue).toBe(true); expect(r2.me.balance).toBe(200);
  expect((await q(db, 'select balance::float8 as b from public.user_stats where user_id = $1', [u]))[0].b).toBe(200);
});

test('saisies refusées : monnaie, réseau, minimum, montant illisible, borne technique', async () => {
  const u = await creerJoueur(db, 'bornes');
  expect(await refusDepot(u, { method: 'crypto', coin: 'XRP', net: 'Base', amt: 50 })).toMatch(/monnaie_invalide/);
  expect(await refusDepot(u, { method: 'crypto', coin: 'BTC', net: 'Base', amt: 1, usd: 100000 })).toMatch(/reseau_invalide/);
  expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 4.99 })).toMatch(/depot_min/);
  for (const amt of ['abc', -5, 0, 'NaN', 'Infinity', null]) expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt }), String(amt)).toMatch(/montant_invalide/);
  expect(await refusDepot(u, { method: 'crypto', coin: 'ETH', net: 'Base', amt: 1 })).toMatch(/montant_invalide/);            // cours absent
  expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 1000001 })).toMatch(/depot_max/);
  expect(await refusDepot(u, { method: 'cheque', amt: 50 })).toMatch(/moyen_invalide/);
  expect(await refus(db, u, 'select public.api_demo_deposit($1::jsonb, null)', [JSON.stringify({ method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 })])).toMatch(/cle_absente/);
  expect((await q(db, 'select count(*)::int as n from public.deposits where user_id = $1', [u]))[0].n).toBe(0);
});

test('B14 · KYC fictif : contrôlé, validé une fois pour toutes, rien de personnel n’est conservé ; il débloque carte, virement et PayPal', async () => {
  const u = await creerJoueur(db, 'kyc1', 500);
  expect(await refusDepot(u, { method: 'card', amt: 100 })).toMatch(/kyc_requis/);
  expect(await refusRetrait(u, { method: 'paypal', amt: 50 })).toMatch(/kyc_requis/);
  const ko = p => refus(db, u, 'select public.api_demo_kyc($1::jsonb)', [JSON.stringify(p)]);
  expect(await ko({ ...KYC, fn: '  ' })).toMatch(/kyc_nom/);
  expect(await ko({ ...KYC, bd: new Date(Date.now() - 17 * 365.25 * 864e5).toISOString().slice(0, 10) })).toMatch(/kyc_age/);
  expect(await ko({ ...KYC, bd: 'hier' })).toMatch(/kyc_age/);
  expect(await ko({ ...KYC, doc: false })).toMatch(/kyc_piece/);
  const r = await api(u, 'public.api_demo_kyc($1::jsonb)', [JSON.stringify(KYC)]);
  expect(r.me.kyc).toBe(true); expect(r.me.kycAt).toBeGreaterThan(Date.now() - 60000);
  expect(r.ev.map(e => e.n && e.n.code)).toEqual(['kyc_ok']);
  expect((await api(u, 'public.api_demo_kyc($1::jsonb)', [JSON.stringify(KYC)])).ev).toEqual([]);     // déjà validé : pas de seconde notification
  const fiche = JSON.stringify(await q(db, `select to_jsonb(u) as j from public.users u where u.id = $1`, [u]));
  expect(fiche).not.toMatch(/Ana|1990-05-01/);                                         // ni prénom ni date de naissance en base
  expect((await api(u, 'public.api_state()')).me.kyc).toBe(true);                     // toujours validé au chargement suivant
  // carte : 2,5 % de frais, 3 étapes ; virement : sans frais, 8 étapes ; plafond de 5 000 $ par dépôt
  const carte = await depot(u, { method: 'card', amt: 100 });
  expect(carte.dep).toMatchObject({ method: 'card', coin: 'USD', amt: 100, fee: 2.5, usd: 97.5, need: 3, st: 'pending' });
  const virement = await depot(u, { method: 'bank', amt: 250 });
  expect(virement.dep).toMatchObject({ method: 'bank', fee: 0, usd: 250, need: 8 }); expect(virement.dep.due - virement.dep.at).toBe(8 * 700);
  expect(await refusDepot(u, { method: 'paypal', amt: 9 })).toMatch(/depot_min/);
  expect(await refusDepot(u, { method: 'paypal', amt: 5001 })).toMatch(/depot_max/);
  await echeance(u);
  expect((await api(u, 'public.api_demo_settle()')).me.balance).toBe(500 + 97.5 + 250);
});

test('retrait : débité tout de suite, « envoyé » ensuite ; adresse, minimum et solde contrôlés', async () => {
  const u = await creerJoueur(db, 'retrait1', 200);
  expect(await refusRetrait(u, { method: 'crypto', net: 'Base', addr: '0x123', amt: 50 })).toMatch(/adresse_invalide/);
  expect(await refusRetrait(u, { method: 'crypto', net: 'Solana', addr: ADR, amt: 50 })).toMatch(/adresse_invalide/);
  expect(await refusRetrait(u, { method: 'crypto', net: 'Bitcoin', addr: ADR, amt: 50 })).toMatch(/reseau_invalide/);
  expect(await refusRetrait(u, { method: 'crypto', net: 'Base', addr: ADR, amt: 4 })).toMatch(/retrait_min/);
  expect(await refusRetrait(u, { method: 'crypto', net: 'Base', addr: ADR, amt: 200.01 })).toMatch(/solde_insuffisant/);
  const r = await retrait(u, { method: 'crypto', net: 'Ethereum', addr: ADR, amt: 120 });
  expect(r.me.balance).toBe(80);
  expect(r.wd).toMatchObject({ net: 'Ethereum', addr: ADR, amt: 120, fee: 2, st: 'pending' });
  expect((await api(u, 'public.api_demo_settle()')).wds[0].st).toBe('pending');
  await echeance(u);
  const s = await api(u, 'public.api_demo_settle()');
  expect(s.wds[0].st).toBe('sent'); expect(s.me.balance).toBe(80);
  expect(s.ev.map(e => e.k)).toEqual(['wd', 'notif']);
  expect(s.ev[1].n).toMatchObject({ code: 'wd_sent', p: { recv: 118, net: 'Ethereum' } });
  // deux retraits en même temps qui dépassent le solde : un seul passe
  const res = await Promise.all([1, 2, 3].map(() => refusRetrait(u, { method: 'crypto', net: 'Base', addr: ADR, amt: 50 })));
  expect(res.filter(x => x === null).length).toBe(1);
  expect(res.filter(x => /solde_insuffisant/.test(x || '')).length).toBe(2);
  expect((await q(db, 'select balance::float8 as b from public.user_stats where user_id = $1', [u]))[0].b).toBe(30);
});

test('recette 10 · plafond de dépôt : appliqué par le serveur ; baisse immédiate, hausse après 48 heures', async () => {
  const u = await creerJoueur(db, 'plafond');
  const limite = (k, v) => api(u, 'public.api_rg_limit($1, $2)', [k, v]);
  expect((await limite('day', 100)).r).toBe('now');
  await depot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 60 });
  expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 })).toMatch(/limite_depot/);         // 60 + 50 > 100
  await depot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 40 });                                              // pile la limite
  const hausse = await limite('day', 500);
  expect(hausse.r).toBe('pending');
  expect(hausse.rg.lim.day).toBe(100); expect(hausse.rg.pend.day.v).toBe(500);
  expect(hausse.rg.pend.day.at - Date.now()).toBeGreaterThan(47.9 * 3600e3);
  expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 5 })).toMatch(/limite_depot/);          // la hausse n'est pas encore en vigueur
  expect((await limite('day', 100)).r).toBe('same');                                                                     // revenir à la valeur actuelle annule la demande
  expect((await api(u, 'public.api_state()')).rg.pend).toEqual({});
  await limite('day', 0);                                                                                                // suppression : en attente aussi
  expect((await api(u, 'public.api_rg_pend_cancel($1)', ['day'])).rg).toMatchObject({ lim: { day: 100 }, pend: {} });
  expect((await limite('week', 150)).r).toBe('now'); expect((await limite('week', 120)).r).toBe('now');                  // baisse : tout de suite
  // 48 heures plus tard, la hausse demandée s'applique d'elle-même
  await limite('day', 300);
  await q(db, `update wm.rg set pend = jsonb_set(pend, '{day,at}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 1000)) where user_id = $1`, [u]);
  const e = await api(u, 'public.api_state()');
  expect(e.rg).toMatchObject({ lim: { day: 300, week: 120 }, pend: {} });
  expect(e.notifs[0]).toMatchObject({ code: 'rg_limite', p: { k: 'day', v: 300 } });
  expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 })).toMatch(/limite_depot/);         // la limite par semaine (120) est déjà atteinte
  for (const [k, v] of [['annee', 100], ['day', 1e12]]) expect(await refus(db, u, 'select public.api_rg_limit($1, $2)', [k, v])).toMatch(/limite_invalide/);
});

test('recette 10 · pause : ni pari ni dépôt, retrait possible, impossible à écourter', async () => {
  const u = await creerJoueur(db, 'pause1', 300);
  const p = await api(u, 'public.api_rg_pause(72)');
  expect(p.rg.pause - Date.now()).toBeGreaterThan(71.9 * 3600e3);
  expect(p.ev[0].n).toMatchObject({ code: 'rg_pause' });
  expect(await refusDepot(u, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 50 })).toMatch(/pause/);
  expect(await refus(db, u, `select public.api_buy('btc150k', 'oui', 20, $1)`, [randomUUID()])).toMatch(/pause/);
  expect((await retrait(u, { method: 'crypto', net: 'Base', addr: ADR, amt: 100 })).me.balance).toBe(200);              // retirer reste possible
  const p2 = await api(u, 'public.api_rg_pause(24)');
  expect(p2.rg.pause).toBe(p.rg.pause);                                                                                  // une pause plus courte ne remplace pas la plus longue
  expect(await refus(db, u, 'select public.api_rg_pause(1)')).toMatch(/duree_invalide/);
  // la pause terminée, tout redevient possible
  await q(db, `update wm.rg set pause_until = now() - interval '1 minute' where user_id = $1`, [u]);
  expect((await api(u, `public.api_buy('btc150k', 'oui', 20, $1)`, [randomUUID()])).me.balance).toBe(180);
  expect((await api(u, 'public.api_state()')).rg.pause).toBe(0);
});

test('auto-exclusion : plus aucune fonction du compte ne répond, les autres joueurs ne sont pas touchés', async () => {
  const u = await creerJoueur(db, 'exclu1', 100), autre = await creerJoueur(db, 'pasexclu', 100);
  const r = await api(u, 'public.api_rg_exclude(6)');
  expect(r.excl - Date.now()).toBeGreaterThan(179 * 864e5);
  for (const appel of ['public.api_state()', 'public.api_demo_settle()', `public.api_buy('btc150k', 'oui', 5, gen_random_uuid())`, 'public.api_rg_exclude(0)', `public.api_demo_deposit('{}'::jsonb, gen_random_uuid())`, `public.api_profile_update('{}'::jsonb)`])
    expect(await refus(db, u, 'select ' + appel), appel).toMatch(/^exclu$/);
  expect((await api(autre, 'public.api_state()')).me.balance).toBe(100);
  expect(await refus(db, autre, 'select public.api_rg_exclude(1)')).toMatch(/duree_invalide/);
  const def = await creerJoueur(db, 'exclu2');
  expect((await api(def, 'public.api_rg_exclude(0)')).excl).toBe(-1);                                                    // définitive
  expect(await refus(db, def, 'select public.api_state()')).toMatch(/^exclu$/);
});

test('sécurité : rien de tout cela n’est accessible à un visiteur ni par écriture directe dans les tables', async () => {
  const u = await creerJoueur(db, 'curieux2', 50);
  for (const f of ['api_demo_settle()', 'api_rg_pause(24)', `api_demo_kyc('{}'::jsonb)`, `api_demo_deposit('{}'::jsonb, gen_random_uuid())`, `api_demo_withdraw('{}'::jsonb, gen_random_uuid())`, `api_rg_limit('day', 5)`, 'api_rg_exclude(6)', `api_rg_pend_cancel('day')`])
    expect(await refus(db, null, 'select public.' + f), f).toMatch(/permission denied/);
  for (const sql of [
    `insert into public.deposits (user_id, coin, network, coin_amount, usd_equivalent, status) values (auth.uid(), 'USDC', 'Base', 1000, 1000, 'completed')`,
    `update public.deposits set status = 'completed' where user_id = auth.uid()`,
    `insert into public.withdrawals (user_id, network, destination_address, amount_usd) values (auth.uid(), 'Base', 'x', 1)`,
    `update public.users set kyc_verified = true where id = auth.uid()`,
    `select * from wm.rg`, `select wm.demo_regler(auth.uid())`, `select wm.rg_json(auth.uid())`, `select wm.argent()`,
  ]) expect(await refus(db, u, sql), sql).toMatch(/permission denied/);
  // un joueur ne règle que ses propres dépôts
  const autre = await creerJoueur(db, 'voisin');
  await depot(autre, { method: 'crypto', coin: 'USDC', net: 'Base', amt: 500 }); await echeance(autre);
  expect((await api(u, 'public.api_demo_settle()')).me.balance).toBe(50);
  expect((await q(db, `select status from public.deposits where user_id = $1`, [autre]))[0].status).toBe('pending');
});
