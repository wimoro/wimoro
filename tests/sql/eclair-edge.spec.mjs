// L'Edge Function « eclair » elle-même (supabase/functions/eclair/index.ts, types retirés), exécutée sous Node contre la
// base embarquée : Deno.serve et le client Supabase sont remplacés par des doublures qui appellent les vraies fonctions
// srv_… de PGlite. Couvre le lot 7 côté serveur : interrupteur éteint (comme avant), mise à cours réels (avec la reprise
// « mode_change » quand l'interrupteur vient de changer), règlement sur les fixations, manche annulée et mise rendue, jeu
// en pause, duel réglé sur les fixations. Aucun réseau.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, q, semer } from './base.mjs';

globalThis.fetch = async url => { throw new Error('appel réseau interdit dans les tests : ' + url); };
vm.runInThisContext(fs.readFileSync('supabase/functions/eclair/moteur-eclair.js', 'utf8'));
const ME = globalThis.MoteurEclair;
test.describe.configure({ mode: 'serial' });

let db, appeler, rpcs = [];
/** La fonction telle qu'elle sera déployée : son texte, sans les types ni les imports, avec des doublures pour Deno et le client. */
function edge() {
  const src = stripTypeScriptTypes(fs.readFileSync('supabase/functions/eclair/index.ts', 'utf8')).replace(/^import .*$/gm, '');
  let handler = null;
  const Deno = { serve: h => { handler = h; }, env: { get: k => ({ SUPABASE_URL: 'http://base.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] } };
  const rpc = async (nom, args) => {
    rpcs.push(nom);
    const cles = Object.keys(args || {}), objet = v => v !== null && typeof v === 'object';
    const sql = `select public.${nom}(${cles.map((k, i) => `${k} => $${i + 1}${objet(args[k]) ? '::jsonb' : ''}`).join(', ')}) as r`;
    try { return { data: (await q(db, sql, cles.map(k => (objet(args[k]) ? JSON.stringify(args[k]) : args[k]))))[0].r, error: null }; }
    catch (e) { return { data: null, error: { message: e.message } }; }
  };
  const createClient = () => ({ rpc, auth: { getUser: async jeton => (jeton ? { data: { user: { id: jeton } }, error: null } : { data: null, error: { message: 'session' } }) } });
  new Function('Deno', 'createClient', src)(Deno, createClient);
  return async (uid, corps) => {
    const rep = await handler(new Request('http://base.test/functions/v1/eclair', { method: 'POST', headers: { authorization: 'Bearer ' + uid, origin: 'https://wimoro.com' }, body: JSON.stringify(corps) }));
    return { statut: rep.status, ...(await rep.json()) };
  };
}
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  appeler = edge();
  const t = Date.now(), ecoule = t - ME.t0(ME.round(t));
  if (ecoule > 12000) await new Promise(ok => setTimeout(ok, 45000 - ecoule + 300));     // une manche dont les mises restent ouvertes 30 s
});
test.afterAll(async () => { await db.close(); });

const interrupteur = on => q(db, `update wm.reglages set valeur = $1::jsonb where cle = 'eclair.cours_reels'`, [JSON.stringify(on)]);
const S3 = p => ({ binance_eclair: p, okx_eclair: p * (1 + 2e-5), gate_eclair: p * (1 - 1e-5) });
const fixation = (actif, m, s, ecrit, etat = 'ok') => q(db, `insert into wm.eclair_fixations as f (actif, slot, manche, t, etat, prix, n, s, ecrit_at)
  values ($1, wm.eclair_slot($2), $2, wm.eclair_t0($2), $5, (select avg(value::float8) from jsonb_each_text($3::jsonb)), (select count(*) from jsonb_object_keys($3::jsonb)), $3::jsonb, to_timestamp($4 / 1000.0))
  on conflict (actif, slot) do update set manche = excluded.manche, t = excluded.t, etat = excluded.etat, prix = excluded.prix, n = excluded.n, s = excluded.s, ecrit_at = excluded.ecrit_at`,
  [actif, m, JSON.stringify(s), ecrit, etat]);
const figer = (jeu, m, mode, P = {}) => q(db, `insert into wm.eclair_manches as e (jeu, slot, manche, mode, raison, pbe, smin, beoff) values ($1, wm.eclair_slot($2), $2, $3, $4, $5, $6, $7)
  on conflict (jeu, slot) do update set manche = excluded.manche, mode = excluded.mode, raison = excluded.raison, pbe = excluded.pbe, smin = excluded.smin, beoff = excluded.beoff`,
  [jeu, m, mode, P.raison ?? null, P.pbe ?? null, P.smin ?? null, !!P.beoff]);
const vieillir = (uid, n) => q(db, `update wm.eclair_mises set manche = manche - $2 where user_id = $1 and etat = 'ouverte'`, [uid, n]);
const solde = async uid => (await enTantQue(db, uid, s => s('select public.api_state() as r')))[0].r.me.balance;

test('interrupteur éteint : la mise et le règlement passent comme avant (moteur d’avant, mêmes frais), réponse inchangée', async () => {
  const u = await creerJoueur(db, 'avant', 200); await solde(u);
  const t = Date.now(), r = ME.round(t);
  const rep = await appeler(u, { action: 'bet', gid: 'btc', side: 'oui', amt: 25, key: randomUUID() });
  expect(rep).toMatchObject({ ok: true, mise: { g: 'btc', s: 'oui', amt: 25, r } });
  const d = ME.JEUX.btc, g = ME.etat(d, r, rep.mise.tk);
  expect(rep.mise.fee).toBeCloseTo(ME.frais(d, g, 'oui', 25, false), 9);
  expect(rep.me.balance).toBe(175);
  await vieillir(u, 1);
  const x = await appeler(u, { action: 'settle' });
  const attendu = ME.regler(d, r - 1, { s: 'oui', amt: 25, net: rep.mise.net, mult: 0, tk: rep.mise.tk });
  expect(x).toMatchObject({ ok: true, rembourses: [] }); expect(x.regles).toHaveLength(1);
  expect(x.regles[0]).toMatchObject({ win: attendu.win, pay: Math.round(attendu.pay * 100) / 100 });
  expect((await q(db, `select mode, raison from wm.eclair_manches where jeu = 'btc' and manche = $1`, [r]))[0]).toEqual({ mode: 'simule', raison: 'interrupteur' });
});

test('cours réels allumés : la première mise, calculée avec l’ancien interrupteur, est refusée « mode_change » et recalculée aussitôt sur la cagnotte réelle', async () => {
  const u = await creerJoueur(db, 'reel', 500); await solde(u);
  const r = ME.round(Date.now());
  await interrupteur(true);
  await fixation('btc', r - 2, S3(62900), ME.t0(r - 2) + 4000); await fixation('btc', r - 1, S3(63000), ME.t0(r - 1) + 4000);
  await q(db, `delete from wm.eclair_manches where manche between $1 and $1 + 2`, [r]);      // (base de test) la manche se fige à nouveau, allumée
  rpcs = [];
  const rep = await appeler(u, { action: 'bet', gid: 'btc', side: 'non', amt: 40, key: randomUUID() });
  expect(rep).toMatchObject({ ok: true, mise: { g: 'btc', s: 'non', amt: 40, r } });
  expect(rpcs).toEqual(['srv_eclair_miser', 'srv_eclair_contexte', 'srv_eclair_miser']);  // interrupteur vu éteint il y a moins de 30 s
  expect((await q(db, `select mode from wm.eclair_manches where jeu = 'btc' and manche = $1`, [r]))[0].mode).toBe('reel');
  const cx = (await q(db, 'select public.srv_eclair_contexte($1::jsonb) as r', [JSON.stringify({ items: [{ jeu: 'btc', manche: r }] })]))[0].r.items[0];
  const d = ME.JEUX.btc, g = ME.etatReel(d, r, rep.mise.tk, null, cx);
  expect(rep.mise.fee).toBeCloseTo(ME.frais(d, g, 'non', 40, false), 9);                    // la cagnotte réelle (foule penchée vers la hausse)
  expect(ME.penchant(r, cx.F)).toBe(1);
  // la suivante, l'interrupteur vu allumé : un contexte puis la mise, sans reprise
  rpcs = [];
  expect((await appeler(u, { action: 'bet', gid: 'eth', side: 'oui', amt: 5, key: randomUUID() })).code).toBe('jeu_en_pause');   // Ether : pas de données fraîches
  expect(rpcs).toEqual(['srv_eclair_contexte']);
  expect(await solde(u)).toBe(460);
});

test('règlement réel par la fonction : gain sur les fixations ; fin absente → mise rendue (« rembourses ») ; rien deux fois', async () => {
  const u = await creerJoueur(db, 'regle', 300); await solde(u);
  const r = ME.round(Date.now());
  await interrupteur(true);
  await fixation('btc', r - 1, S3(63000), Date.now() - 30000); await fixation('sol', r - 1, S3(73.8), Date.now() - 30000);
  await q(db, `delete from wm.eclair_manches where jeu in ('btc', 'sol') and manche between $1 and $1 + 2`, [r]);
  const a = await appeler(u, { action: 'bet', gid: 'btc', side: 'oui', amt: 50, key: randomUUID() });
  const b = await appeler(u, { action: 'bet', gid: 'sol', side: 'non', amt: 20, key: randomUUID() });
  expect([a.ok, b.ok]).toEqual([true, true]); expect(await solde(u)).toBe(230);
  // la manche devient p (passée) : Bitcoin en hausse de 0,2 % ; Solana sans fin, délai de grâce écoulé → absente
  const p = r - 6; await vieillir(u, 6);
  for (const j of ['btc', 'sol']) await figer(j, p, 'reel', { pbe: 0.04015568527674884, smin: 2 });
  await fixation('btc', p, S3(63000), ME.t0(p) + 3000); await fixation('btc', p + 1, S3(63126), ME.t0(p + 1) + 3000);
  await fixation('sol', p, S3(73.8), ME.t0(p) + 3000);
  await q(db, 'select wm.eclair_fixer()');
  const x = await appeler(u, { action: 'settle' });
  expect(x.ok).toBe(true);
  expect(x.regles).toEqual([expect.objectContaining({ g: 'btc', r: p, win: true })]);
  expect(x.rembourses).toEqual([expect.objectContaining({ g: 'sol', r: p, amt: 20, motif: 'fixation_absente' })]);
  expect(x.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toContain('flash_rembourse');
  const cx = (await q(db, 'select public.srv_eclair_contexte($1::jsonb) as r', [JSON.stringify({ items: [{ jeu: 'btc', manche: p }] })]))[0].r.items[0];
  const z = ME.reglerReel(ME.JEUX.btc, p, { s: 'oui', amt: 50, net: a.mise.net, mult: 0, tk: a.mise.tk }, cx);
  expect(x.regles[0].pay).toBeCloseTo(Math.round(z.pay * 100) / 100, 2);
  expect(x.me.balance).toBeCloseTo(230 + 20 + Math.round(z.pay * 100) / 100, 2);
  const y = await appeler(u, { action: 'settle' });
  expect([y.regles, y.rembourses]).toEqual([[], []]);
});

test('duel à cours réels : créé dans le mode de sa manche, réglé sur les fixations ; manche annulée → les deux mises rendues', async () => {
  const u = await creerJoueur(db, 'dueliste', 1000);
  const [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_reel', 'bot_reel@nulle.part', true) returning id`);
  await q(db, `insert into public.user_stats (user_id, balance) values ($1, 0) on conflict (user_id) do nothing`, [bot]);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted')`, [u, bot]);
  await interrupteur(true);
  const r = ME.round(Date.now());
  for (const k of [r - 1, r, r + 1]) await fixation('btc', k - 1, S3(63000), Date.now() - 30000);
  await q(db, `delete from wm.eclair_manches where jeu = 'btc' and manche between $1 and $1 + 2`, [r]);
  const c1 = await appeler(u, { action: 'duel_create', gid: 'btc', side: 'oui', stake: 20, opp: bot, key: randomUUID() });
  expect(c1).toMatchObject({ ok: true, duel: { st: 'active', m: 'flash:btc' } });
  const c2 = await appeler(u, { action: 'duel_create', gid: 'btc', side: 'non', stake: 10, opp: bot, key: randomUUID() });
  expect(c2.ok).toBe(true);
  const s0 = (await q(db, 'select balance::float8 as b from public.user_stats where user_id = $1', [u]))[0].b;
  // deux manches passées : la première monte (« oui » gagne), la seconde n'a pas de fin (les deux mises rendues)
  const p = r - 8;
  await q(db, 'update wm.duels set manche = $2 where id = $1', [c1.duel.id, p]); await q(db, 'update wm.duels set manche = $2 where id = $1', [c2.duel.id, p - 2]);
  await figer('btc', p, 'reel', { pbe: 0.04, smin: 2 }); await figer('btc', p - 2, 'reel', { pbe: 0.04, smin: 2 });
  await fixation('btc', p, S3(63000), ME.t0(p) + 3000); await fixation('btc', p + 1, S3(63200), ME.t0(p + 1) + 3000);
  await fixation('btc', p - 2, S3(63000), ME.t0(p - 2) + 3000); await fixation('btc', p - 1, {}, ME.t0(p - 1) + 120000, 'absent');
  const x = await appeler(u, { action: 'duel_settle' });
  expect(x).toMatchObject({ ok: true, regles: 2 });
  const etats = await q(db, 'select id, etat, gagnant from wm.duels where id in ($1, $2) order by id', [c1.duel.id, c2.duel.id]);
  expect(etats[0]).toMatchObject({ etat: 'regle', gagnant: 'oui' });                       // le Bitcoin a monté : « oui » gagne
  expect(etats[1].etat).toBe('void');
  expect((await q(db, 'select balance::float8 as b from public.user_stats where user_id = $1', [u]))[0].b).toBeGreaterThan(s0 + 10);
});
