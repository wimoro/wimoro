// Pari éclair côté base : les fonctions srv_eclair_… que seule l'Edge Function « eclair » peut appeler (clé de service).
// Le test joue le rôle de l'Edge Function : il calcule avec le moteur (js/moteur-eclair.js), la base écrit.
// Couvre la recette 2 (côté serveur) : mise acceptée, une seule par pari et par manche, réglée à la fin, solde et
// historique à jour, toujours là au chargement suivant.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

const bac = {}; bac.globalThis = bac; vm.runInNewContext(fs.readFileSync('js/moteur-eclair.js', 'utf8'), bac);
const ME = bac.MoteurEclair;
test.describe.configure({ mode: 'serial' });

let db;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  // les mises ne sont acceptées que pendant les 30 premières secondes d'une manche : on attend, au besoin, la suivante
  const t = Date.now(), ecoule = t - ME.t0(ME.round(t));
  if (ecoule > 22000) await new Promise(ok => setTimeout(ok, 45000 - ecoule + 300));
});
test.afterAll(async () => { await db.close(); });
const srv = async (sql, params) => (await q(db, `select ${sql} as r`, params))[0].r;
const etat = async uid => (await enTantQue(db, uid, s => s('select public.api_state() as r')))[0].r;
/** ce que fait l'Edge Function pour une mise */
const miser = (uid, jeu, cote, amt, plus = {}) => {
  const t = Date.now(), r = ME.round(t), k = ME.tick(t), d = ME.JEUX[jeu], g = ME.etat(d, r, k), px = ME.prix(d, g);
  const p = { manche: r, jeu, cote, amt, fee: ME.frais(d, g, cote, amt, false), fee_remise: ME.frais(d, g, cote, amt, true), mult: ME.beMult(d), prix: cote === 'oui' ? px.o : cote === 'non' ? px.n : px.e, tk: k, be_max: ME.beMax(g, d), key: randomUUID(), ...plus };
  return srv('public.srv_eclair_miser($1, $2::jsonb)', [uid, JSON.stringify(p)]).then(rep => ({ rep, p }));
};
const refusMise = async (uid, jeu, cote, amt, plus) => { try { await miser(uid, jeu, cote, amt, plus); return null; } catch (e) { return e.message; } };
/** ce que fait l'Edge Function pour régler */
const regler = async uid => {
  const o = await srv('public.srv_eclair_ouvertes($1)', [uid]);
  const res = o.mises.map(m => { const x = ME.regler(ME.JEUX[m.g], m.r, { s: m.s, amt: m.amt, net: m.net, mult: m.mult, tk: m.tk }); return { id: m.id, win: x.win, pay: x.pay, part: x.part }; });
  return { o, res, rep: await srv('public.srv_eclair_regler($1, $2::jsonb)', [uid, JSON.stringify(res)]) };
};
/** fait passer le temps : les mises ouvertes du joueur appartiennent à une manche terminée (n manches plus tôt) */
const vieillir = (uid, n = 1) => q(db, `update wm.eclair_mises set manche = manche - $2 where user_id = $1 and etat = 'ouverte'`, [uid, n]);

test('recette 2 · miser : débit, frais calculés par le moteur, 10 XP, mission ; la mise est rendue au chargement suivant', async () => {
  const u = await creerJoueur(db, 'flasheur', 200); await etat(u);
  const { rep, p } = await miser(u, 'btc', 'oui', 25);
  expect(rep.me).toMatchObject({ balance: 175, played: 1, xp: 10 });
  expect(rep.mise).toMatchObject({ g: 'btc', s: 'oui', amt: 25, r: p.manche, tk: p.tk, mult: 0 });
  expect(rep.mise.fee).toBeCloseTo(p.fee, 9); expect(rep.mise.net).toBeCloseTo(25 - p.fee, 9);
  expect(rep.mise.fee).toBeGreaterThan(0); expect(rep.mise.fee).toBeLessThan(25 * 0.05);            // 4,9 % au plus en crypto
  expect(rep.ev.map(e => e.k)).toEqual(['xp', 'mission', 'notif', 'badge', 'notif']);              // +10 XP, mission « première manche », badge « premier pari »
  // un autre pari de la même manche : accepté ; le même : refusé
  expect((await miser(u, 'tennis', 'non', 10)).rep.me.balance).toBe(165);
  expect(await refusMise(u, 'btc', 'non', 5)).toMatch(/deja_mise/);
  const e = await etat(u);
  expect(e.eclair.r).toBe(p.manche); expect(e.eclair.du).toBe(0);
  expect(Object.keys(e.eclair.b).sort()).toEqual(['btc', 'tennis']);
  expect(e.eclair.b.btc).toMatchObject({ s: 'oui', amt: 25, tk: p.tk });
  expect(e.me.balance).toBe(165);
  const journal = await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id`, [u]);
  expect(journal).toEqual([{ kind: 'flash', a: -25 }, { kind: 'flash', a: -10 }]);
});

test('refus : manche passée ou future, solde, montant, côté, break even trop gros, clé rejouée', async () => {
  const u = await creerJoueur(db, 'refuse', 50); await etat(u);
  const r = ME.round(Date.now());
  expect(await refusMise(u, 'eth', 'oui', 5, { manche: r - 1 })).toMatch(/mises_fermees/);
  expect(await refusMise(u, 'eth', 'oui', 5, { manche: r + 1 })).toMatch(/mises_fermees/);
  expect(await refusMise(u, 'eth', 'oui', 51)).toMatch(/solde_insuffisant/);
  for (const amt of [0, 0.5, -3, 'abc', 10001]) expect(await refusMise(u, 'eth', 'oui', amt), String(amt)).toMatch(/montant_invalide/);
  expect(await refusMise(u, 'eth', 'peut-etre', 5)).toMatch(/cote_invalide/);
  expect(await refusMise(u, 'eth', 'be', 20, { be_max: 12 })).toMatch(/be_plein/);
  expect(await refusMise(u, 'eth', 'oui', 5, { fee: 5 })).toMatch(/montant_invalide/);              // des frais qui mangeraient toute la mise
  expect(await refusMise(u, 'eth', 'oui', 5, { key: null })).toMatch(/cle_absente/);
  const cle = randomUUID();
  const a = await miser(u, 'eth', 'be', 5, { key: cle }), b = await miser(u, 'eth', 'be', 5, { key: cle });
  expect(b.rep.rejoue).toBe(true); expect(b.rep.mise.id).toBe(a.rep.mise.id);
  expect(a.rep.mise.mult).toBeCloseTo(ME.beMult(ME.JEUX.eth), 9);                                   // la cote du break even est bloquée à la mise
  expect((await etat(u)).me.balance).toBe(45);
  expect(await refusMise('00000000-0000-4000-8000-00000000dead', 'eth', 'oui', 5)).toMatch(/session/);
});

test('recette 2 · régler : le moteur rejoue la manche, la base crédite, tient les statistiques, l’historique et les XP — une seule fois', async () => {
  const u = await creerJoueur(db, 'regleur', 500); await etat(u);
  const jeux = ['btc', 'eth', 'sol', 'doge', 'vol', 'ndx', 'spx', 'tennis', 'basket', 'foot'];
  for (const [i, jeu] of jeux.entries()) await miser(u, jeu, i % 2 ? 'non' : 'oui', 10);
  expect((await etat(u)).me.balance).toBe(400);
  // la manche n'est pas finie : rien à régler
  const tot = await regler(u);
  expect(tot.o.mises).toEqual([]); expect(tot.rep.regles).toEqual([]); expect(tot.rep.me.balance).toBe(400);
  await vieillir(u, 1);
  expect((await etat(u)).eclair).toMatchObject({ du: 10, b: {} });
  const { o, res, rep } = await regler(u);
  expect(o.mises).toHaveLength(10); expect(rep.regles).toHaveLength(10);
  const gagnes = res.filter(x => x.win), paye = gagnes.reduce((n, x) => n + Math.round(x.pay * 100) / 100, 0);
  expect(rep.me.balance).toBeCloseTo(400 + paye, 2);
  expect(rep.me).toMatchObject({ settled: 10, wins: gagnes.length, flashWins: gagnes.length });
  expect(rep.me.xp).toBe(10 * 10 + 40 * gagnes.length);                                           // 10 XP par mise, 40 par manche gagnée
  expect(rep.me.flashProfit).toBeCloseTo(paye - 100, 2);
  expect(rep.hist).toHaveLength(10);
  expect(rep.hist[0]).toMatchObject({ k: 'flash', q: `eclair|btc|${o.mises[0].r}`, s: 'oui' });
  expect(rep.hist[0].at).toBe(ME.t0(o.mises[0].r + 1));
  for (const x of rep.regles) { const m = res.find(y => y.id === x.id); expect(x.win).toBe(m.win); expect(x.pay).toBeCloseTo(m.win ? m.pay : 0, 2); expect(x.pnl).toBeCloseTo(x.pay - 10, 6); expect(x.tard).toBe(false); }
  expect(rep.ev.filter(e => e.k === 'notif' && /^flash_/.test(e.n.code))).toEqual([]);              // manche tout juste finie : pas de notification
  expect(rep.eclair.du).toBe(0);
  // rejouer le règlement ne crédite rien de plus
  const encore = await srv('public.srv_eclair_regler($1, $2::jsonb)', [u, JSON.stringify(res.map(x => ({ ...x, win: true, pay: 9999 })))]);
  expect(encore.regles).toEqual([]); expect(encore.me.balance).toBeCloseTo(400 + paye, 2);
  const e = await etat(u);
  expect(e.history.filter(h => h.k === 'flash')).toHaveLength(10);
  expect(e.me.balance).toBeCloseTo(400 + paye, 2);
  const gains = await q(db, `select coalesce(sum(amount), 0)::float8 as t, count(*)::int as n from public.balance_ledger where user_id = $1 and kind = 'flash_gain'`, [u]);
  expect(gains[0].n).toBe(gagnes.length); expect(gains[0].t).toBeCloseTo(paye, 2);
});

test('série de victoires, break even, et règlement après coup (notification)', async () => {
  const u = await creerJoueur(db, 'serie', 1000); await etat(u);
  // on choisit, pour quatre manches passées, le côté gagnant : la base doit compter la série
  const r0 = ME.round(Date.now()) - 20;
  for (let i = 0; i < 4; i++) {
    const out = ME.issue(ME.JEUX.gold, r0 + i), cote = i === 3 ? (out === 1 ? 'non' : 'oui') : (out === 2 ? 'be' : out === 1 ? 'oui' : 'non');   // la 4e est perdue exprès
    await miser(u, 'gold', cote, 20);
    await q(db, `update wm.eclair_mises set manche = $2 where user_id = $1 and etat = 'ouverte' and manche > $2`, [u, r0 + i]);
    const { rep } = await regler(u);
    expect(rep.regles[0]).toMatchObject({ r: r0 + i, win: i < 3, tard: true });
    expect(rep.me.flashStreak).toBe(i < 3 ? i + 1 : 0);
    expect(rep.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toContain(i < 3 ? 'flash_gagne' : 'flash_perdu');
  }
  const e = await etat(u);
  expect(e.me).toMatchObject({ flashWins: 3, flashBest: 3, flashStreak: 0, settled: 4 });
  expect(e.badges).toContain('flash3');                                                            // badge « Triplé éclair »
});

test('jeu responsable et sécurité : pause et auto-exclusion refusent la mise ; aucun client n’appelle ces fonctions', async () => {
  const u = await creerJoueur(db, 'prudent', 100); await etat(u);
  await enTantQue(db, u, s => s('select public.api_rg_pause(24)'));
  expect(await refusMise(u, 'btc', 'oui', 5)).toMatch(/pause/);
  const x = await creerJoueur(db, 'exclu9', 100); await etat(x);
  await enTantQue(db, x, s => s('select public.api_rg_exclude(6)'));
  expect(await refusMise(x, 'btc', 'oui', 5)).toMatch(/exclu/);
  const j = await creerJoueur(db, 'malin', 100); await etat(j);
  for (const qui of [null, j]) for (const f of [`public.srv_eclair_miser(auth.uid(), '{}'::jsonb)`, `public.srv_eclair_regler(auth.uid(), '[]'::jsonb)`, 'public.srv_eclair_ouvertes(auth.uid())', 'wm.agir_pour(auth.uid())', 'wm.eclair_json(auth.uid())'])
    expect(await refus(db, qui, 'select ' + f), (qui ? 'joueur' : 'visiteur') + ' → ' + f).toMatch(/permission denied/);
  expect(await refus(db, j, 'select * from wm.eclair_mises')).toMatch(/permission denied/);
  expect(await refus(db, j, `insert into wm.eclair_mises (user_id, manche, jeu, cote, amt, fee, net, tk) values (auth.uid(), 1, 'btc', 'oui', 1, 0, 1, 0)`)).toMatch(/permission denied/);
  // l'identité installée pour une fonction srv_ ne déborde pas sur l'appel suivant
  await miser(j, 'btc', 'oui', 5);
  expect(await refus(db, null, 'select public.api_state()')).toMatch(/permission denied/);
  expect((await q(db, `select current_setting('request.jwt.claims', true) as c`))[0].c || '').toBe('');
});
