// Partie D : les mises du nouveau front à cours réels, marquées « reel » et réglées sur les fixations, interrupteur global
// éteint (migration eclair_mises_reelles, Edge Function « eclair » v6). L'Edge Function elle-même (types retirés) est
// exécutée sous Node contre la base embarquée, comme dans eclair-edge.spec.mjs ; sa version d'avant (v5, celle qui était
// en ligne : tests/fixtures/eclair-direct/eclair-v5.ts) sert de référence pour prouver qu'une mise SANS marque (ancien
// front) se mise et se règle exactement comme avant. Aucun réseau.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, q, semer } from './base.mjs';

globalThis.fetch = async url => { throw new Error('appel réseau interdit dans les tests : ' + url); };
vm.runInThisContext(fs.readFileSync('supabase/functions/eclair/moteur-eclair.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('supabase/functions/eclair/moteur-reel.js', 'utf8'));
const ME = globalThis.MoteurEclair, MR = globalThis.MoteurReel;
test.describe.configure({ mode: 'serial' });

/** Une Edge Function (texte .ts, types et imports retirés) branchée sur une base : Deno.serve et le client sont des doublures. */
function edge(fichier, base, journal) {
  const src = stripTypeScriptTypes(fs.readFileSync(fichier, 'utf8')).replace(/^import .*$/gm, '');
  let handler = null;
  const Deno = { serve: h => { handler = h; }, env: { get: k => ({ SUPABASE_URL: 'http://base.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] } };
  const rpc = async (nom, args) => {
    journal.push(nom);
    const cles = Object.keys(args || {}), objet = v => v !== null && typeof v === 'object';
    const sql = `select public.${nom}(${cles.map((k, i) => `${k} => $${i + 1}${objet(args[k]) ? '::jsonb' : ''}`).join(', ')}) as r`;
    try { return { data: (await q(base(), sql, cles.map(k => (objet(args[k]) ? JSON.stringify(args[k]) : args[k]))))[0].r, error: null }; }
    catch (e) { return { data: null, error: { message: e.message } }; }
  };
  const createClient = () => ({ rpc, auth: { getUser: async jeton => (jeton ? { data: { user: { id: jeton } }, error: null } : { data: null, error: { message: 'session' } }) } });
  new Function('Deno', 'createClient', src)(Deno, createClient);
  return async (uid, corps) => {
    const rep = await handler(new Request('http://base.test/functions/v1/eclair', { method: 'POST', headers: { authorization: 'Bearer ' + uid, origin: 'https://wimoro.com' }, body: JSON.stringify(corps) }));
    return { statut: rep.status, ...(await rep.json()) };
  };
}

let db, avant, v6, v5, rpcs = [], rpcs5 = [];
test.beforeAll(async () => {
  [db, avant] = await Promise.all([creerBase(), creerBase()]);
  await Promise.all([semer(db), semer(avant)]);
  v6 = edge('supabase/functions/eclair/index.ts', () => db, rpcs);
  v5 = edge('tests/fixtures/eclair-direct/eclair-v5.ts', () => avant, rpcs5);
  const t = Date.now(), ecoule = t - ME.t0(ME.round(t));
  if (ecoule > 9000) await new Promise(ok => setTimeout(ok, 45000 - ecoule + 300));     // une manche dont les mises restent ouvertes 30 s
});
test.afterAll(async () => { await Promise.all([db.close(), avant.close()]); });

const S3 = p => ({ binance_eclair: p, okx_eclair: p * (1 + 2e-5), gate_eclair: p * (1 - 1e-5) });
const fixation = (base, actif, m, s, ecrit, etat = 'ok') => q(base, `insert into wm.eclair_fixations as f (actif, slot, manche, t, etat, prix, n, s, ecrit_at)
  values ($1, wm.eclair_slot($2), $2, wm.eclair_t0($2), $5, (select avg(value::float8) from jsonb_each_text($3::jsonb)), (select count(*) from jsonb_object_keys($3::jsonb)), $3::jsonb, to_timestamp($4 / 1000.0))
  on conflict (actif, slot) do update set manche = excluded.manche, t = excluded.t, etat = excluded.etat, prix = excluded.prix, n = excluded.n, s = excluded.s, ecrit_at = excluded.ecrit_at`,
  [actif, m, JSON.stringify(s), ecrit, etat]);
const vieillir = (base, uid, n) => q(base, `update wm.eclair_mises set manche = manche - $2 where user_id = $1 and etat = 'ouverte'`, [uid, n]);
const effacer = (base, actif, m) => q(base, `delete from wm.eclair_fixations where actif = $1 and slot = wm.eclair_slot($2)`, [actif, m]);
/** une manche dont les mises restent ouvertes assez longtemps pour le test (sinon la suivante) */
const ouverte = async () => { const t = Date.now(), e = t - ME.t0(ME.round(t)); if (e > 18000) await new Promise(ok => setTimeout(ok, 45000 - e + 300)); };
/** les deux versions appelées au même instant (l'heure de l'Edge Function fige la manche et le tick) */
async function ensemble(f) { const vrai = Date.now, fige = vrai(); Date.now = () => fige; try { return await f(); } finally { Date.now = vrai; } }
const solde = async (base, uid) => (await enTantQue(base, uid, s => s('select public.api_state() as r')))[0].r.me.balance;
/** le contexte que la base rend pour une manche (fixations comprises) et celui que le navigateur calcule avec */
const ctxBase = async (jeu, m) => (await q(db, `select wm.eclair_reel_un($1, $2) as r`, [jeu, m]))[0].r;
/** une réponse sans ce qui dépend de l'instant (heure, identifiants de notification, date de création du compte de test) */
const propre = x => JSON.parse(JSON.stringify(x, (k, v) => (['now', 'at', 'id', 't', 'since'].includes(k) ? undefined : v)));

test('la table des mises marquées et les fonctions de service : fermées aux clients, l’interrupteur reste éteint', async () => {
  const t = await q(db, `select c.relrowsecurity as rls, has_table_privilege('anon', c.oid, 'select') as anon, has_table_privilege('authenticated', c.oid, 'select') as auth
                         from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wm' and c.relname = 'eclair_mises_reelles'`);
  expect(t).toEqual([{ rls: true, anon: false, auth: false }]);
  for (const f of ['srv_eclair_reelles(uuid,jsonb)', 'srv_eclair_miser_reelle(uuid,jsonb)', 'srv_eclair_rembourser_reelles(uuid,jsonb)']) {
    const [x] = await q(db, `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
                                    has_function_privilege('service_role', $1, 'execute') as service`, ['public.' + f]);
    expect(x, f).toEqual({ anon: false, auth: false, service: true });
  }
  expect((await q(db, `select has_function_privilege('authenticated', 'wm.eclair_reel_un(text,bigint)', 'execute') as x`))[0].x).toBe(false);
  expect((await q(db, `select valeur from wm.reglages where cle = 'eclair.cours_reels'`))[0].valeur).toBe(false);
});

test('ancien front (sans marque) : la mise et le règlement de la v6 sont exactement ceux de la v5 en ligne', async () => {
  const [u6, u5] = [await creerJoueur(db, 'ancien', 300), await creerJoueur(avant, 'ancien', 300)];
  await Promise.all([solde(db, u6), solde(avant, u5)]);
  await ouverte();
  const r = ME.round(Date.now());
  // les mêmes fixations dans les deux bases : sans marque, elles ne doivent rien changer (interrupteur éteint)
  for (const b of [db, avant]) { await fixation(b, 'btc', r - 2, S3(62900), ME.t0(r - 2) + 4000); await fixation(b, 'btc', r - 1, S3(63000), ME.t0(r - 1) + 4000); }
  const cle = randomUUID(), cle2 = randomUUID();
  rpcs.length = 0; rpcs5.length = 0;
  const [a6, a5] = await ensemble(() => Promise.all([v6(u6, { action: 'bet', gid: 'btc', side: 'oui', amt: 25, key: cle }), v5(u5, { action: 'bet', gid: 'btc', side: 'oui', amt: 25, key: cle })]));
  const [b6, b5] = await ensemble(() => Promise.all([v6(u6, { action: 'bet', gid: 'eth', side: 'be', amt: 2, key: cle2 }), v5(u5, { action: 'bet', gid: 'eth', side: 'be', amt: 2, key: cle2 })]));
  expect(a6.ok).toBe(true); expect(b6.ok).toBe(true);
  expect(propre(a6)).toEqual(propre(a5)); expect(propre(b6)).toEqual(propre(b5));
  expect(rpcs).toEqual(rpcs5);                                                              // la mise : mêmes appels à la base
  expect(a6.mise.fee).toBeCloseTo(ME.frais(ME.JEUX.btc, ME.etat(ME.JEUX.btc, r, a6.mise.tk), 'oui', 25, false), 9);
  expect((await q(db, 'select count(*)::int as n from wm.eclair_mises_reelles'))[0].n).toBe(0);
  // la manche se termine : règlement par les deux versions
  await Promise.all([vieillir(db, u6, 1), vieillir(avant, u5, 1)]);
  rpcs.length = 0; rpcs5.length = 0;
  const [s6, s5] = await ensemble(() => Promise.all([v6(u6, { action: 'settle' }), v5(u5, { action: 'settle' })]));
  expect(s6.ok).toBe(true); expect(s6.regles).toHaveLength(2);
  expect(propre(s6)).toEqual(propre(s5));
  expect(rpcs5).toEqual(['srv_eclair_ouvertes', 'srv_eclair_contexte', 'srv_eclair_regler']);
  expect(rpcs).toEqual(['srv_eclair_ouvertes', 'srv_eclair_reelles', 'srv_eclair_contexte', 'srv_eclair_regler']);   // une lecture de plus, sans effet
  const ref = ME.regler(ME.JEUX.btc, r - 1, { s: 'oui', amt: 25, net: a6.mise.net, mult: 0, tk: a6.mise.tk });
  expect(s6.regles.find(x => x.g === 'btc')).toMatchObject({ win: ref.win, pay: Math.round(ref.pay * 100) / 100 });
  expect(await solde(db, u6)).toBe(await solde(avant, u5));
  expect((await q(db, 'select etat, gain::float8 as gain from wm.eclair_mises where user_id = $1 order by id', [u6])))
    .toEqual(await q(avant, 'select etat, gain::float8 as gain from wm.eclair_mises where user_id = $1 order by id', [u5]));
});

test('nouveau front (reel: true) : mise calculée sur les fixations, marquée, puis réglée par reglerReel', async () => {
  const u = await creerJoueur(db, 'nouveau', 400); await solde(db, u);
  await ouverte();
  const r = ME.round(Date.now());
  await fixation(db, 'btc', r - 2, S3(63000), ME.t0(r - 2) + 4000); await fixation(db, 'btc', r - 1, S3(63050), ME.t0(r - 1) + 4000);
  rpcs.length = 0;
  const a = await v6(u, { action: 'bet', gid: 'btc', side: 'non', amt: 40, key: randomUUID(), reel: true });
  expect(a).toMatchObject({ ok: true, reel: true, mise: { g: 'btc', s: 'non', amt: 40, r } });
  expect(rpcs).toEqual(['srv_eclair_reelles', 'srv_eclair_miser_reelle']);
  expect((await q(db, `select mode, raison from wm.eclair_manches where jeu = 'btc' and manche = $1`, [r]))[0]).toEqual({ mode: 'simule', raison: 'interrupteur' });
  expect((await q(db, 'select k.jeu, k.manche::int as m from wm.eclair_mises_reelles k join wm.eclair_mises e on e.id = k.mise_id where e.user_id = $1', [u]))).toEqual([{ jeu: 'btc', m: r }]);
  // la mise est celle que le navigateur calcule : même règle (moteur-reel.js), même cagnotte (foule penchée à la hausse)
  const c = await ctxBase('btc', r), cc = MR.contexteMise('btc', r, c);
  expect(cc).not.toBeNull(); expect(ME.penchant(r, cc.F)).toBe(1);
  const g = ME.etatReel(ME.JEUX.btc, r, a.mise.tk, null, cc);
  expect(a.mise.fee).toBeCloseTo(ME.frais(ME.JEUX.btc, g, 'non', 40, false), 9);
  expect(a.mise.price).toBe(ME.prixReel(ME.JEUX.btc, g, cc.P).n);
  expect(await solde(db, u)).toBe(360);
  // la manche devient p (passée, finie depuis moins que le délai de grâce) ; sa fin n'est pas encore fixée : la mise attend
  const p = r - 2; await vieillir(db, u, 2);
  await fixation(db, 'btc', p - 2, S3(63000), ME.t0(p - 2) + 4000); await fixation(db, 'btc', p - 1, S3(63050), ME.t0(p - 1) + 4000);
  await fixation(db, 'btc', p, S3(63100), ME.t0(p) + 3500); await effacer(db, 'btc', p + 1);
  const x0 = await v6(u, { action: 'settle' });
  expect(x0.ok).toBe(true);
  expect(x0.regles ?? []).toEqual([]); expect(x0.rembourses).toEqual([]);
  // la fin arrive : le Bitcoin a baissé de 0,1 % → « non » gagne
  await fixation(db, 'btc', p + 1, S3(63037), ME.t0(p + 1) + 3500);
  const x = await v6(u, { action: 'settle' });
  expect(x.regles).toEqual([expect.objectContaining({ g: 'btc', r: p, win: true })]);
  const cf = MR.ctx('btc', p, (await ctxBase('btc', p)).Fc), z = ME.reglerReel(ME.JEUX.btc, p, { s: 'non', amt: 40, net: a.mise.net, mult: 0, tk: a.mise.tk }, cf);
  expect(z).toMatchObject({ win: true, out: 0 });
  expect(x.regles[0].pay).toBeCloseTo(Math.round(z.pay * 100) / 100, 2);
  expect(x.me.balance).toBeCloseTo(360 + Math.round(z.pay * 100) / 100, 2);
  expect((await v6(u, { action: 'settle' })).regles).toEqual([]);                            // rien deux fois
});

test('nouveau front : jeu sans fixation récente (action) ou jeu simulé → « jeu_en_pause », rien n’est débité', async () => {
  const u = await creerJoueur(db, 'pause', 100); await solde(db, u);
  await ouverte();
  rpcs.length = 0;
  expect((await v6(u, { action: 'bet', gid: 'nvda', side: 'oui', amt: 5, key: randomUUID(), reel: true })).code).toBe('jeu_en_pause');
  expect((await v6(u, { action: 'bet', gid: 'cac', side: 'oui', amt: 5, key: randomUUID(), reel: true })).code).toBe('jeu_en_pause');
  // une fixation r − 2 écrite APRÈS le début de la manche ne rend pas la manche réelle (pas connue de tous à l'ouverture)
  const r = ME.round(Date.now());
  await fixation(db, 'sol', r - 2, S3(74), ME.t0(r) + 500);
  expect((await v6(u, { action: 'bet', gid: 'sol', side: 'oui', amt: 5, key: randomUUID(), reel: true })).code).toBe('jeu_en_pause');
  expect(rpcs.every(n => n === 'srv_eclair_reelles')).toBe(true);
  expect(await solde(db, u)).toBe(100);
  // la même mise sans marque passe comme avant (jeu simulé, moteur d'avant)
  expect((await v6(u, { action: 'bet', gid: 'cac', side: 'oui', amt: 5, key: randomUUID() })).ok).toBe(true);
});

test('manche annulée (fin absente) : la mise marquée attend le délai de grâce, puis elle est rendue', async () => {
  const u = await creerJoueur(db, 'annule', 200); await solde(db, u);
  await ouverte();
  const r = ME.round(Date.now());
  await fixation(db, 'eth', r - 2, S3(1780), ME.t0(r - 2) + 4000); await fixation(db, 'eth', r - 1, S3(1781), ME.t0(r - 1) + 4000);
  const a = await v6(u, { action: 'bet', gid: 'eth', side: 'oui', amt: 30, key: randomUUID(), reel: true });
  expect(a).toMatchObject({ ok: true, reel: true });
  expect(await solde(db, u)).toBe(170);
  // fin de la manche il y a moins de 120 s, sans fixation de fin : rien ne se passe
  const p = r - 2; await vieillir(db, u, 2);
  await fixation(db, 'eth', p, S3(1782), ME.t0(p) + 3500); await effacer(db, 'eth', p + 1);
  let x = await v6(u, { action: 'settle' });
  expect([x.regles ?? [], x.rembourses]).toEqual([[], []]);
  const avantGrace = (await q(db, `select public.srv_eclair_rembourser_reelles($1, $2::jsonb) as r`, [u, JSON.stringify([{ id: a.mise.id, motif: 'fixation_absente' }])]))[0].r;
  expect(avantGrace.rembourses).toEqual([]);                                                 // la base refuse aussi : le délai court encore
  // le délai de grâce est passé (la mise remonte de six manches) : la mise est rendue, une notification le dit
  await vieillir(db, u, 6);
  const q0 = p - 6; await fixation(db, 'eth', q0, S3(1782), ME.t0(q0) + 3500); await effacer(db, 'eth', q0 + 1);
  x = await v6(u, { action: 'settle' });
  expect(x.ok).toBe(true);
  expect(x.rembourses).toEqual([expect.objectContaining({ g: 'eth', r: q0, amt: 30, motif: 'fixation_absente' })]);
  expect(x.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toContain('flash_rembourse');
  expect(await solde(db, u)).toBe(200);
  const st = (await q(db, 'select bets_settled, flash_wins, flash_streak_current from public.user_stats where user_id = $1', [u]))[0];
  expect(st).toEqual({ bets_settled: 0, flash_wins: 0, flash_streak_current: 0 });          // rien n'est compté au joueur
  expect((await q(db, `select kind, amount::float8 as m from public.balance_ledger where user_id = $1 and kind = 'flash_rembourse'`, [u]))).toEqual([{ kind: 'flash_rembourse', m: 30 }]);
  expect((await v6(u, { action: 'settle' })).rembourses).toEqual([]);                       // rendue une seule fois
});

test('les fonctions de service se gardent seules : mise non marquée jamais rendue, clé rejouée sans seconde marque', async () => {
  const u = await creerJoueur(db, 'garde', 100); await solde(db, u);
  await ouverte();
  const r = ME.round(Date.now());
  const sans = await v6(u, { action: 'bet', gid: 'doge', side: 'oui', amt: 10, key: randomUUID() });
  expect(sans.ok).toBe(true);
  await vieillir(db, u, 9);
  const refus = (await q(db, `select public.srv_eclair_rembourser_reelles($1, $2::jsonb) as r`, [u, JSON.stringify([{ id: sans.mise.id, motif: 'fixation_absente' }])]))[0].r;
  expect(refus.rembourses).toEqual([]);                                                      // sans marque : la fonction ne rend rien
  expect((await q(db, 'select etat from wm.eclair_mises where id = $1', [sans.mise.id]))[0].etat).toBe('ouverte');
  // la même clé rejouée : la réponse d'origine, une seule marque
  await fixation(db, 'doge', r - 2, S3(0.059), ME.t0(r - 2) + 4000); await fixation(db, 'doge', r - 1, S3(0.0591), ME.t0(r - 1) + 4000);
  const cle = randomUUID();
  const a = await v6(u, { action: 'bet', gid: 'sol', side: 'non', amt: 5, key: cle, reel: true });
  expect(a.code).toBe('jeu_en_pause');                                                       // Solana : pas de fixation r − 2 utilisable ici
  const b1 = await v6(u, { action: 'bet', gid: 'doge', side: 'non', amt: 5, key: cle, reel: true });
  const b2 = await v6(u, { action: 'bet', gid: 'doge', side: 'non', amt: 5, key: cle, reel: true });
  expect(b1).toMatchObject({ ok: true, reel: true }); expect(b2).toMatchObject({ ok: true, rejoue: true });
  expect((await q(db, 'select count(*)::int as n from wm.eclair_mises_reelles where user_id = $1', [u]))[0].n).toBe(1);
  // un autre joueur ne peut ni voir ni rendre les mises marquées d'un joueur
  const autre = await creerJoueur(db, 'autre', 0);
  const vue = (await q(db, `select public.srv_eclair_reelles($1, $2::jsonb) as r`, [autre, JSON.stringify({ ids: [b1.mise.id] })]))[0].r;
  expect(vue.mises).toEqual([]);
});
