// Pari éclair à cours réels, lot 7 : modes figés, fixations immuables, contexte, mise, règlement, annulation et
// remboursement, preuves, calibrage, lecture par les visiteurs. Le test joue le rôle des Edge Functions : il calcule avec
// le moteur v2 (js/moteur-eclair.js) et la base écrit. Même résultat pour tous : la base ne garde que des fixations, et le
// moteur, identique partout, en tire l'issue.
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
  const t = Date.now(), ecoule = t - ME.t0(ME.round(t));
  if (ecoule > 20000) await new Promise(ok => setTimeout(ok, 45000 - ecoule + 300));     // une manche dont les mises sont ouvertes
});
test.afterAll(async () => { await db.close(); });

const srv = async (sql, params) => (await q(db, `select ${sql} as r`, params))[0].r;
const interrupteur = on => q(db, `update wm.reglages set valeur = $1::jsonb where cle = 'eclair.cours_reels'`, [JSON.stringify(on)]);
const fixation = (actif, m, s, ecrit, etat = 'ok') => q(db, `insert into wm.eclair_fixations as f (actif, slot, manche, t, etat, prix, n, s, ecrit_at)
  values ($1, wm.eclair_slot($2), $2, wm.eclair_t0($2), $5, (select avg(value::float8) from jsonb_each_text($3::jsonb)), (select count(*) from jsonb_object_keys($3::jsonb)), $3::jsonb, to_timestamp($4 / 1000.0))
  on conflict (actif, slot) do update set manche = excluded.manche, t = excluded.t, etat = excluded.etat, prix = excluded.prix, n = excluded.n, s = excluded.s, ecrit_at = excluded.ecrit_at`,
  [actif, m, JSON.stringify(s), ecrit, etat]);
const figer = (jeu, m, mode, P = {}) => q(db, `insert into wm.eclair_manches as e (jeu, slot, manche, mode, raison, pbe, smin, beoff) values ($1, wm.eclair_slot($2), $2, $3, $4, $5, $6, $7)
  on conflict (jeu, slot) do update set manche = excluded.manche, mode = excluded.mode, raison = excluded.raison, pbe = excluded.pbe, smin = excluded.smin, beoff = excluded.beoff`,
  [jeu, m, mode, P.raison ?? null, P.pbe ?? null, P.smin ?? null, !!P.beoff]);
const contexte = items => srv('public.srv_eclair_contexte($1::jsonb)', [JSON.stringify({ items })]);
const mode = async (jeu, m) => (await q(db, 'select (wm.eclair_mode_calcul($1, $2)).*', [jeu, m]))[0];
/** ce que fait l'Edge Function « eclair » pour une mise, dans le mode de la manche */
async function miser(uid, jeu, cote, amt, plus = {}) {
  const t = Date.now(), r = ME.round(t), tk = ME.tick(t), d = ME.JEUX[jeu];
  const cx = (await contexte([{ jeu, manche: r }])).items[0];
  let p;
  if (cx.mode === 'reel') {
    const g = ME.etatReel(d, r, tk, null, cx), px = ME.prixReel(d, g, cx.P);
    p = { manche: r, jeu, cote, amt, tk, mode: 'reel', fee: ME.frais(d, g, cote, amt, false), fee_remise: ME.frais(d, g, cote, amt, true), mult: ME.beMultReel(d, cx.P),
      prix: cote === 'oui' ? px.o : cote === 'non' ? px.n : px.e, be_max: ME.beMaxReel(g, d, cx.P), key: randomUUID(), ...plus };
  } else {
    const g = ME.etat(d, r, tk), px = ME.prix(d, g);
    p = { manche: r, jeu, cote, amt, tk, fee: ME.frais(d, g, cote, amt, false), fee_remise: ME.frais(d, g, cote, amt, true), mult: ME.beMult(d),
      prix: cote === 'oui' ? px.o : cote === 'non' ? px.n : px.e, be_max: ME.beMax(g, d), key: randomUUID(), ...plus };
  }
  return { cx, p, rep: await srv('public.srv_eclair_miser($1, $2::jsonb)', [uid, JSON.stringify(p)]) };
}
const refusMise = (...a) => miser(...a).then(() => null, e => e.message);
/** ce que fait l'Edge Function pour régler : mises ouvertes, contextes, moteur ; gains et pertes, puis annulations */
async function regler(uid) {
  const o = await srv('public.srv_eclair_ouvertes($1)', [uid]);
  const items = [...new Map(o.mises.map(m => [m.g + ':' + m.r, { jeu: m.g, manche: m.r }])).values()];
  const ctx = Object.fromEntries((items.length ? (await contexte(items)).items : []).map(c => [c.jeu + ':' + c.r, c]));
  const res = [], remb = [], attente = [];
  for (const m of o.mises) {
    const d = ME.JEUX[m.g], my = { s: m.s, amt: m.amt, net: m.net, mult: m.mult, tk: m.tk }, c = ctx[m.g + ':' + m.r];
    if (c && c.mode === 'reel') {
      if (c.attente) { attente.push(m.id); continue; }
      const x = ME.reglerReel(d, m.r, my, c);
      if (x.annule) remb.push({ id: m.id, motif: x.motif }); else res.push({ id: m.id, win: x.win, pay: x.pay, part: x.part });
    } else { const x = ME.regler(d, m.r, my); res.push({ id: m.id, win: x.win, pay: x.pay, part: x.part }); }
  }
  const a = await srv('public.srv_eclair_regler($1, $2::jsonb)', [uid, JSON.stringify(res)]);
  const b = remb.length ? await srv('public.srv_eclair_rembourser($1, $2::jsonb)', [uid, JSON.stringify(remb)]) : null;
  return { o, ctx, res, remb, attente, a, b };
}
const vieillir = (uid, n) => q(db, `update wm.eclair_mises set manche = manche - $2 where user_id = $1 and etat = 'ouverte'`, [uid, n]);
const S3 = (p, e = 1) => ({ binance_eclair: p, okx_eclair: p * (1 + 2e-5 * e), gate_eclair: p * (1 - 1e-5 * e) });

test('interrupteur éteint : tous les jeux sont simulés, comme avant ; une mise d’avant ce lot passe sans changement', async () => {
  const r = ME.round(Date.now());
  for (const jeu of ['btc', 'nvda', 'gold', 'tennis']) expect(await mode(jeu, r)).toMatchObject({ mode: 'simule', raison: 'interrupteur' });
  const u = await creerJoueur(db, 'avant', 100); await enTantQue(db, u, s => s('select public.api_state()'));
  const { rep, cx } = await miser(u, 'btc', 'oui', 10);
  expect(cx).toMatchObject({ mode: 'simule', raison: 'interrupteur', F: {} });
  expect(rep.me.balance).toBe(90);
  expect(await srv('wm.eclair_fixer()')).toMatchObject({ absentes: 0 });
  const e = await q(db, `select count(*)::int as n, count(*) filter (where mode = 'simule')::int as s from wm.eclair_manches where manche between $1 and $1 + 2`, [r]);
  expect(e[0]).toEqual({ n: 57, s: 57 });                                                  // 19 jeux × 3 manches, figés d'avance
  expect(await refusMise(u, 'eth', 'oui', 5, { mode: 'reel' })).toMatch(/mode_change/);      // calculé en réel alors que la manche est simulée
  // l'instantané d'api_live porte les modes (s : simulé) et l'interrupteur
  const l = (await enTantQue(db, null, s => s('select public.api_live() as r')))[0].r;
  expect(l.eclair).toEqual({ on: false, r });                                              // tout simulé : rien de plus dans api_live
});

test('modes allumés : crypto réelle avec des données fraîches, bourse en pause fermée ou sans clé, jeux sans source simulés, secours, retrait', async () => {
  await interrupteur(true);
  const r = ME.round(Date.now());
  expect(await mode('btc', r)).toMatchObject({ mode: 'pause', raison: 'donnees' });          // aucune fixation depuis 10 min
  await fixation('btc', r - 1, S3(63000), Date.now() - 40000);
  expect(await mode('btc', r)).toMatchObject({ mode: 'reel', raison: null, smin: 2, beoff: false });
  expect((await mode('btc', r)).pbe).toBeCloseTo(0.04015568527674884, 15);
  expect(await mode('vol', r)).toMatchObject({ mode: 'reel' });                              // la Secousse suit les fixations du Bitcoin
  expect(await mode('gold', r)).toMatchObject({ mode: 'simule', raison: 'pas_de_source' });
  expect(await mode('tennis', r)).toMatchObject({ mode: 'simule', raison: 'pas_de_source' });
  // Bourse : une manche un jour de Thanksgiving (NYSE fermé), puis en séance sans clé Finnhub, puis avec la clé
  const thanks = ME.round(Date.UTC(2026, 10, 26, 16, 0)), seance = ME.round(Date.UTC(2026, 10, 30, 16, 0));
  expect(await mode('nvda', thanks)).toMatchObject({ mode: 'pause', raison: 'ferme' });
  expect(await mode('nvda', seance)).toMatchObject({ mode: 'pause', raison: 'cle' });
  await q(db, `update wm.sources set cle_presente = true where id = 'finnhub_eclair'`);
  expect(await mode('nvda', seance)).toMatchObject({ mode: 'pause', raison: 'donnees' });
  await fixation('nvda', ME.round(Date.now()) - 1, { finnhub_eclair: 150 }, Date.now() - 30000);
  expect(await mode('nvda', seance)).toMatchObject({ mode: 'reel', smin: 1 });
  expect(await mode('nvda', ME.round(Date.UTC(2026, 10, 30, 14, 30, 30)))).toMatchObject({ mode: 'pause', raison: 'ferme' });   // la première minute
  expect(await mode('nvda', ME.round(Date.UTC(2026, 10, 30, 20, 57)))).toMatchObject({ mode: 'pause', raison: 'ferme' });       // les 5 dernières minutes
  await q(db, `update wm.sources set cle_presente = false where id = 'finnhub_eclair'`);
  // simulation de secours : un jeu réel sans données passe en simulé (marqué « secours ») au lieu d'être en pause
  await q(db, `update wm.reglages set valeur = 'true' where cle = 'eclair.secours_simule'`);
  expect(await mode('eth', r)).toMatchObject({ mode: 'simule', raison: 'secours' });
  await q(db, `update wm.reglages set valeur = 'false' where cle = 'eclair.secours_simule'`);
  // une source coupée par l'équipe : il en reste deux, assez pour la crypto (2 exigées) ; deux coupées : pause
  await q(db, `update wm.sources set actif = false where id in ('binance_eclair', 'okx_eclair')`);
  expect(await mode('btc', r)).toMatchObject({ mode: 'reel' });                              // Gate et Coinbase (secours) restent
  await q(db, `update wm.sources set actif = false where id = 'gate_eclair'`);
  expect(await mode('btc', r)).toMatchObject({ mode: 'pause', raison: 'source' });
  await q(db, `update wm.sources set actif = true where id like '%_eclair'`);
  await q(db, `update wm.eclair_jeux set config = 'retire' where jeu = 'doge'`);
  expect(await mode('doge', r)).toMatchObject({ mode: 'retire' });
  await q(db, `update wm.eclair_jeux set config = 'reel' where jeu = 'doge'`);
});

test('figer : un mode figé ne change plus (l’interrupteur vaut à partir de la manche figée ensuite) ; l’anneau ne remplace qu’une manche plus ancienne', async () => {
  const r = ME.round(Date.now()) + 50;                                                        // des manches futures, encore libres
  await interrupteur(false); await srv('wm.eclair_figer($1, $1)', [r]);
  await interrupteur(true); await srv('wm.eclair_figer($1::bigint, $1::bigint + 1)', [r]);
  const lus = await q(db, `select manche, mode from wm.eclair_manches where jeu = 'btc' and manche in ($1::bigint, $1::bigint + 1) order by manche`, [r]);
  expect(lus).toEqual([{ manche: r, mode: 'simule' }, { manche: r + 1, mode: 'reel' }]);
  await srv('wm.eclair_figer($1, $1)', [r - 3840]);                                                   // même emplacement, manche plus ancienne : ignorée
  expect((await q(db, `select manche from wm.eclair_manches where jeu = 'btc' and slot = wm.eclair_slot($1)`, [r]))[0].manche).toBe(r);
  await srv('wm.eclair_figer($1, $1)', [r + 3840]);                                           // 48 heures plus tard, le même emplacement est réécrit
  expect((await q(db, `select manche from wm.eclair_manches where jeu = 'btc' and slot = wm.eclair_slot($1)`, [r]))[0].manche).toBe(r + 3840);
  expect((await q(db, `select count(*)::int as n from wm.eclair_manches where jeu = 'btc' and slot = wm.eclair_slot($1)`, [r]))[0].n).toBe(1);
});

test('fixations : une frontière passée et encore dans son délai ; écrite une seule fois ; « absente » seulement quand la collecte a fini d’essayer', async () => {
  const r = ME.round(Date.now());
  const ecrire = (m, actifs) => srv('public.srv_eclair_fixer($1::jsonb)', [JSON.stringify({ manche: m, actifs })]);
  expect(await ecrire(r, { eth: { s: { binance_eclair: 1780.1, okx_eclair: 1780.3, gate_eclair: 1780.2, inconnue: 9 }, x: [] } })).toMatchObject({ ecrits: ['eth'] });
  const f = await srv('wm.eclair_fixation($1, $2)', ['eth', r]);
  expect(f).toMatchObject({ e: 'ok', n: 3, s: { binance_eclair: 1780.1, okx_eclair: 1780.3, gate_eclair: 1780.2 } });
  expect(f.p).toBeCloseTo(1780.2, 9);
  expect(await ecrire(r, { eth: { s: { binance_eclair: 1700, okx_eclair: 1700, gate_eclair: 1700 } } })).toMatchObject({ ecrits: [] });   // jamais réécrite
  expect((await srv('wm.eclair_fixation($1, $2)', ['eth', r])).s.binance_eclair).toBe(1780.1);
  expect(await ecrire(r, { sol: { s: { gate_eclair: 73.8 } } })).toMatchObject({ ecrits: [] });   // une seule source sur deux : on attend
  expect(await srv('wm.eclair_fixation($1, $2)', ['sol', r])).toBeNull();
  expect(await ecrire(r, { sol: { s: { gate_eclair: 73.8 }, final: true } })).toMatchObject({ ecrits: ['sol'] });
  expect(await srv('wm.eclair_fixation($1, $2)', ['sol', r])).toMatchObject({ e: 'absent', n: 1 });
  expect(await q(db, `select public.srv_eclair_fixer($1::jsonb)`, [JSON.stringify({ manche: r + 1, actifs: {} })]).catch(e => e.message)).toMatch(/trop_tot/);
  expect(await q(db, `select public.srv_eclair_fixer($1::jsonb)`, [JSON.stringify({ manche: r - 5, actifs: {} })]).catch(e => e.message)).toMatch(/trop_tard/);
  for (const qui of [null, await creerJoueur(db, 'curieux')]) {
    for (const f2 of [`public.srv_eclair_fixer('{}'::jsonb)`, `public.srv_eclair_contexte('{}'::jsonb)`, 'public.srv_eclair_config()',
                      `public.srv_eclair_rembourser(auth.uid(), '[]'::jsonb)`, 'wm.eclair_fixer()', 'wm.eclair_calibrer()', `wm.eclair_garde('btc', 1, null)`])
      expect(await refus(db, qui, 'select ' + f2), f2).toMatch(/permission denied/);
    for (const t of ['wm.eclair_fixations', 'wm.eclair_manches', 'wm.eclair_preuves', 'wm.eclair_remboursements', 'wm.eclair_jeux', 'wm.eclair_calibrage'])
      expect(await refus(db, qui, `select * from ${t}`), t).toMatch(/permission denied/);
  }
});

test('mise réelle : contexte (rien d’écrit par mise), frais de la cagnotte réelle ; refus en pause, départ absent, mode différent', async () => {
  const r = ME.round(Date.now());
  await fixation('btc', r - 2, S3(62900), ME.t0(r - 2) + 4000); await fixation('btc', r - 1, S3(63000), ME.t0(r - 1) + 4000);
  await interrupteur(true);
  const u = await creerJoueur(db, 'reel', 500); await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, `delete from wm.eclair_manches where manche between $1 and $1 + 2`, [r]);         // (base de test) les manches se figent à nouveau, allumées
  const { cx, p, rep } = await miser(u, 'btc', 'oui', 40);
  expect(cx).toMatchObject({ mode: 'reel', actif: 'btc', P: { smin: 2, beoff: false } });
  expect(Object.keys(cx.F).sort()).toEqual([String(r - 2), String(r - 1)]);
  expect(ME.penchant(r, cx.F)).toBe(1);                                                       // la manche r − 2 a monté
  expect(rep.me.balance).toBe(460); expect(rep.mise.fee).toBeCloseTo(p.fee, 9);
  expect(await q(db, 'select count(*)::int as n from wm.eclair_preuves')).toEqual([{ n: 0 }]);   // une preuve n'est écrite que pour une mise oubliée
  expect(await refusMise(u, 'eth', 'oui', 5, { mode: 'simule' })).toMatch(/mode_change/);      // eth est réel aussi (fixation fraîche au test 4)
  await figer('nvda', r, 'pause', { raison: 'ferme' });
  expect(await refusMise(u, 'nvda', 'oui', 5)).toMatch(/jeu_en_pause/);
  await q(db, `select public.srv_eclair_fixer($1::jsonb)`, [JSON.stringify({ manche: r, actifs: { doge: { s: { gate_eclair: 0.06 }, final: true } } })]);
  await fixation('doge', r - 1, S3(0.06), Date.now() - 20000);
  await q(db, `delete from wm.eclair_manches where jeu = 'doge' and manche = $1`, [r]);
  expect(await refusMise(u, 'doge', 'non', 5)).toMatch(/jeu_en_pause/);                     // départ fixé « absent »
  expect((await enTantQue(db, u, s => s('select public.api_state() as r')))[0].r.me.balance).toBe(460);
});

test('règlement réel : la base ne garde que des fixations ; le moteur en tire la même issue pour tous ; gains, pertes, stats ; rien deux fois', async () => {
  const u = await creerJoueur(db, 'regle', 1000); await enTantQue(db, u, s => s('select public.api_state()'));
  await interrupteur(true);
  const r = ME.round(Date.now());
  await q(db, `delete from wm.eclair_manches where manche between $1 and $1 + 2`, [r]);
  await fixation('btc', r - 1, S3(63000), Date.now() - 30000); await fixation('eth', r - 1, S3(1780), Date.now() - 30000);
  await miser(u, 'btc', 'oui', 50); await miser(u, 'eth', 'non', 30); await miser(u, 'vol', 'oui', 20);
  // la manche devient la manche passée p : modes réels, fixations de départ et de fin (Bitcoin en hausse de 0,2 %, Ether en baisse)
  const p = r - 30; await vieillir(u, 30);
  for (const jeu of ['btc', 'eth', 'vol']) await figer(jeu, p, 'reel', { pbe: 0.04015568527674884, smin: 2 });
  await fixation('btc', p, S3(63000), ME.t0(p) + 3000); await fixation('btc', p + 1, S3(63126), ME.t0(p + 1) + 3000);
  await fixation('eth', p, S3(1780), ME.t0(p) + 3000); await fixation('eth', p + 1, S3(1776.4), ME.t0(p + 1) + 3000);
  const x = await regler(u);
  expect(x.remb).toEqual([]); expect(x.attente).toEqual([]); expect(x.a.regles).toHaveLength(3);
  const gagnes = x.res.filter(z => z.win);
  expect(x.res.map(z => z.win)).toEqual([true, true, true]);                                 // hausse du BTC (oui), baisse d'ETH (non), forte secousse (oui)
  const paye = gagnes.reduce((n, z) => n + Math.round(z.pay * 100) / 100, 0);
  expect(x.a.me.balance).toBeCloseTo(900 + paye, 2);
  expect(x.a.me).toMatchObject({ settled: 3, wins: 3, flashStreak: 3 });
  // le moteur seul (navigateur, compte Démo) refait le même calcul à partir des mêmes fixations
  for (const m of x.o.mises) { const z = ME.reglerReel(ME.JEUX[m.g], m.r, { s: m.s, amt: m.amt, net: m.net, mult: m.mult, tk: m.tk }, x.ctx[m.g + ':' + m.r]); expect(z.pay).toBeCloseTo(x.res.find(y => y.id === m.id).pay, 12); }
  // rejouer ne crédite rien de plus, et une mise réglée ne se rembourse pas
  expect((await regler(u)).o.mises).toEqual([]);
  expect((await srv('public.srv_eclair_rembourser($1, $2::jsonb)', [u, JSON.stringify(x.o.mises.map(m => ({ id: m.id })))])).rembourses).toEqual([]);
});

test('annulation : fin non fixée après le délai de grâce → mise rendue, rien compté au joueur ; une manche simulée ne s’annule jamais', async () => {
  const u = await creerJoueur(db, 'annule', 300); await enTantQue(db, u, s => s('select public.api_state()'));
  await interrupteur(true);
  const r = ME.round(Date.now());
  await q(db, `delete from wm.eclair_manches where manche between $1 and $1 + 2`, [r]);
  await fixation('eth', r - 1, S3(1780), Date.now() - 30000);          // (le départ de Solana, fixé « absent » plus haut, refuserait la mise)
  const { rep } = await miser(u, 'eth', 'oui', 25);
  expect(rep.me.balance).toBe(275);
  const avant = (await enTantQue(db, u, s => s('select public.api_state() as r')))[0].r.me;
  const p = r - 6; await vieillir(u, 6);                                // dans la fenêtre de la tâche (12 manches), délai de grâce écoulé
  await figer('eth', p, 'reel', { pbe: 0.04, smin: 2 });
  await fixation('eth', p, S3(1780), ME.t0(p) + 3000);
  // la fin n'arrive pas ; le délai de grâce est passé depuis longtemps : la tâche la déclare absente
  expect(await srv('wm.eclair_fixer()')).toMatchObject({ absentes: expect.any(Number) });
  expect(await srv('wm.eclair_fixation($1, $2)', ['eth', p + 1])).toMatchObject({ e: 'absent' });
  const x = await regler(u);
  expect(x.res).toEqual([]); expect(x.remb).toHaveLength(1);
  expect(x.b.rembourses).toEqual([expect.objectContaining({ g: 'eth', r: p, amt: 25, motif: 'fixation_absente' })]);
  expect(x.b.me.balance).toBe(300);
  expect(x.b.me).toMatchObject({ settled: avant.settled, wins: avant.wins, xp: avant.xp, flashStreak: avant.flashStreak });   // ni pari réglé, ni XP, ni série
  expect(x.b.ev.filter(e => e.k === 'notif').map(e => e.n.code)).toEqual(['flash_rembourse']);
  expect(x.b.eclair.du).toBe(0);
  expect(await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id`, [u])).toEqual([{ kind: 'flash', a: -25 }, { kind: 'flash_rembourse', a: 25 }]);
  expect(await q(db, `select etat, gain::float8 as g from wm.eclair_mises where user_id = $1`, [u])).toEqual([{ etat: 'perdue', g: 25 }]);
  expect(await q(db, `select montant::float8 as m, motif from wm.eclair_remboursements where user_id = $1`, [u])).toEqual([{ m: 25, motif: 'fixation_absente' }]);
  // une seule fois ; et srv_eclair_regler ne la paie pas non plus
  expect((await srv('public.srv_eclair_rembourser($1, $2::jsonb)', [u, JSON.stringify(x.remb)])).rembourses).toEqual([]);
  expect((await srv('public.srv_eclair_regler($1, $2::jsonb)', [u, JSON.stringify([{ id: x.remb[0].id, win: true, pay: 999 }])])).regles).toEqual([]);
  // une manche simulée (interrupteur éteint) ne peut pas être « rendue »
  await interrupteur(false);
  const v = await creerJoueur(db, 'simule', 100); await enTantQue(db, v, s => s('select public.api_state()'));
  await q(db, `delete from wm.eclair_manches where manche between $1 and $1 + 2`, [ME.round(Date.now())]);
  await miser(v, 'gold', 'oui', 10); await vieillir(v, 3);
  const [{ id }] = await q(db, `select id from wm.eclair_mises where user_id = $1`, [v]);
  expect((await srv('public.srv_eclair_rembourser($1, $2::jsonb)', [v, JSON.stringify([{ id }])])).rembourses).toEqual([]);
  expect((await enTantQue(db, v, s => s('select public.api_state() as r')))[0].r.me.balance).toBe(90);
  await interrupteur(true);
});

test('fin pas encore fixée : la mise attend (délai de grâce) ; une mise oubliée 40 heures garde sa preuve au-delà des anneaux de 48 heures', async () => {
  const u = await creerJoueur(db, 'patient', 200); await enTantQue(db, u, s => s('select public.api_state()'));
  const r = ME.round(Date.now());
  await q(db, `delete from wm.eclair_manches where manche between $1 and $1 + 2`, [r]);
  await fixation('btc', r - 1, S3(63000), Date.now() - 30000);          // (l'Ether a déjà sa fin fixée plus haut ; le Bitcoin, pas encore)
  await miser(u, 'btc', 'oui', 10);
  await q(db, `update wm.eclair_mises set manche = manche - 1 where user_id = $1`, [u]);      // la manche vient de finir
  await figer('btc', r - 1, 'reel', { pbe: 0.04, smin: 2 });
  const x = await regler(u);
  expect(x.attente).toHaveLength(1); expect(x.res).toEqual([]); expect(x.remb).toEqual([]);
  // le joueur ne revient pas : 40 heures plus tard (sa manche est p), la tâche recopie le mode et les quatre fixations
  const p = r - 3300;
  await q(db, `update wm.eclair_mises set manche = $2 where user_id = $1`, [u, p]);
  await figer('btc', p, 'reel', { pbe: 0.04, smin: 2 });
  for (const [k, prix] of [[p - 2, 62950], [p - 1, 63000], [p, 63000], [p + 1, 63200]]) await fixation('btc', k, S3(prix), ME.t0(k) + 3000);
  expect((await srv('wm.eclair_fixer()')).preuves).toBeGreaterThanOrEqual(1);
  const [pr] = await q(db, `select mode, pbe, smin, actif, f, complete_at from wm.eclair_preuves where jeu = 'btc' and manche = $1`, [p]);
  expect(pr).toMatchObject({ mode: 'reel', pbe: 0.04, smin: 2, actif: 'btc' }); expect(pr.complete_at).not.toBeNull();
  expect(Object.keys(pr.f).sort()).toEqual([p - 2, p - 1, p, p + 1].map(String).sort());
  expect((await srv('wm.eclair_fixer()')).preuves).toBe(0);                                  // une seule fois
  // les anneaux sont réécrits (48 heures) : le contexte vient de la preuve, et la mise se règle comme elle l'aurait été
  await q(db, `update wm.eclair_fixations set manche = manche + 3840 where actif = 'btc' and manche between $1 and $2`, [p - 2, p + 1]);
  await q(db, `update wm.eclair_manches set manche = manche + 3840 where jeu = 'btc' and manche = $1`, [p]);
  expect(await srv('wm.eclair_fixation($1, $2)', ['btc', p + 1])).toBeNull();
  const c = (await contexte([{ jeu: 'btc', manche: p }])).items[0];
  expect(c).toMatchObject({ mode: 'reel', attente: false }); expect(c.F[String(p + 1)].s.binance_eclair).toBe(63200);
  const y = await regler(u);
  expect(y.res).toHaveLength(1); expect(y.res[0].win).toBe(true);
});

test('calibrage : la fréquence observée de l’égalité (200 manches au moins) ; au-delà de 8 %, le break even est fermé', async () => {
  const base = ME.round(Date.now()) - 600;
  for (let i = 0; i < 260; i++) await fixation('doge', base + i, S3(0.06 * (1 + 0.001 * (Math.floor(i / 2) % 7))), Date.now() - 1000);   // une manche sur deux finit à l'égalité
  expect(await srv('wm.eclair_calibrer()')).toBeGreaterThanOrEqual(9);
  const [c] = await q(db, `select pbe, n, n_be from wm.eclair_calibrage where jeu = 'doge'`);
  expect(c.n).toBeGreaterThanOrEqual(200); expect(c.pbe).toBeCloseTo(c.n_be / c.n, 12); expect(c.pbe).toBeGreaterThan(0.08);
  await interrupteur(true);
  expect(await mode('doge', ME.round(Date.now()) + 5)).toMatchObject({ mode: 'reel', beoff: true });
  const [s] = await q(db, `select pbe from wm.eclair_calibrage where jeu = 'nvda'`);
  expect(s.pbe).toBeNull();                                                                   // trop peu de manches : la valeur du modèle sert
});

test('lecture : api_fixations ouverte aux visiteurs (100 manches au plus, les fixations du serveur), api_live porte les modes et les dernières fixations', async () => {
  const r = ME.round(Date.now());
  const f = (await enTantQue(db, null, s => s('select public.api_fixations($1, $2, $3) as r', ['btc', r - 5, r])))[0].r;
  expect(f).toMatchObject({ jeu: 'btc', actif: 'btc', config: 'reel', de: r - 5, a: r });
  for (const [k, v] of Object.entries(f.F)) expect(v).toEqual(await srv('wm.eclair_fixation($1, $2)', ['btc', Number(k)]));
  expect((await enTantQue(db, null, s => s('select public.api_fixations($1, $2, $3) as r', ['btc', r - 5000, r])))[0].r.de).toBe(r - 99);
  expect(await refus(db, null, `select public.api_fixations('inconnu')`)).toMatch(/jeu_inconnu/);
  await srv('wm.eclair_fixer()');
  const l = (await enTantQue(db, null, s => s('select public.api_live() as r')))[0].r;
  expect(l.eclair.on).toBe(true); expect(l.eclair.jeux.gold).toMatchObject({ m: 'sss', raison: 'pas_de_source' });
  expect(l.eclair.jeux.btc.m).toMatch(/^[rps]{3}$/);
  expect(Array.isArray(l.eclair.f.btc)).toBe(true);
  expect(JSON.stringify(l.eclair).length).toBeLessThan(4000);
});
