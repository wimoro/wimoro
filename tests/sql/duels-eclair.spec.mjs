// Duels sur une manche éclair côté base : les fonctions srv_duel_eclair_… que seule l'Edge Function « eclair » peut
// appeler (clé de service). Le test joue le rôle de l'Edge Function : il calcule prix, frais et issue avec le moteur
// (js/moteur-eclair.js), la base fixe la manche, garde les mises sous séquestre et règle.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

const bac = {}; bac.globalThis = bac; vm.runInNewContext(fs.readFileSync('js/moteur-eclair.js', 'utf8'), bac);
const ME = bac.MoteurEclair;
test.describe.configure({ mode: 'serial' });

let db, lea, max, zoe, bot;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 1000); max = await creerJoueur(db, 'max', 1000); zoe = await creerJoueur(db, 'zoe', 1000);
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_duel', 'bot_duel@nulle.part', true) returning id`);
  await q(db, `insert into public.user_stats (user_id, balance) values ($1, 0) on conflict (user_id) do nothing`, [bot]);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted'), ($1, $3, 'accepted')`, [lea, max, bot]);
});
test.afterAll(async () => { await db.close(); });
const srv = async (sql, params) => (await q(db, `select ${sql} as r`, params))[0].r;
const srvNon = async (sql, params) => { try { await srv(sql, params); return null; } catch (e) { return e.message; } };
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, coalesce(bets_settled, 0) as settled, coalesce(bets_won, 0) as wins, coalesce(profit_realized, 0)::float8 as realise from public.user_stats where user_id = $1', [u]))[0];
const duel = async id => (await q(db, 'select etat, manche, prix, mise::float8 as mise, frais::float8 as frais, mise_adv::float8 as mise_adv, cagnotte::float8 as cagnotte, gagnant, adv from wm.duels where id = $1', [id]))[0];
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));
/** ce que fait l'Edge Function pour créer : le prix du camp et les frais, à l'état du jeu au moment de l'appel */
const corps = (gid, side, stake, opp, plus = {}) => { const t = Date.now(), d = ME.JEUX[gid], g = ME.etat(d, ME.round(t), ME.tick(t)), px = ME.prix(d, g);
  return { gid, side, stake, opp: opp || null, key: randomUUID(), prix: side === 'oui' ? px.o : px.n, frais: ME.frais(d, g, side, stake, false), frais_remise: ME.frais(d, g, side, stake, true), ...plus }; };
const creer = async (uid, gid, side, stake, opp, plus) => { const p = corps(gid, side, stake, opp, plus); return { p, rep: await srv('public.srv_duel_eclair_creer($1, $2::jsonb)', [uid, JSON.stringify(p)]) }; };
const creerNon = (uid, gid, side, stake, opp, plus) => srvNon('public.srv_duel_eclair_creer($1, $2::jsonb)', [uid, JSON.stringify(corps(gid, side, stake, opp, plus))]);
/** … pour accepter : lire le duel, puis le prix du moment pour le camp du défieur */
const accepter = async (uid, id) => { const l = await srv('public.srv_duel_eclair_lire($1, $2::jsonb)', [uid, JSON.stringify({ id })]);
  const t = Date.now(), d = ME.JEUX[l.gid], g = ME.etat(d, ME.round(t), ME.tick(t)), px = ME.prix(d, g), prix = l.side === 'oui' ? px.o : px.n;
  const autre = Math.round(l.stake * 100 / prix * (100 - prix)) / 100, camp = l.side === 'oui' ? 'non' : 'oui', frais = ME.frais(d, g, camp, autre, false);
  return { prix, frais, rep: await srv('public.srv_duel_eclair_accepter($1, $2::jsonb)', [uid, JSON.stringify({ id: l.id, prix, frais, frais_remise: ME.frais(d, g, camp, autre, true) })]) }; };
/** … pour régler : l'issue de chaque manche terminée (ou une issue imposée, pour couvrir les trois cas) */
const regler = async (uid, issue) => { const o = await srv('public.srv_duel_eclair_ouverts($1)', [uid]);
  const res = o.duels.map(x => ({ id: x.id, out: issue === undefined ? ME.issue(ME.JEUX[x.gid], x.round) : issue }));
  return { o, res, rep: await srv('public.srv_duel_eclair_regler($1, $2::jsonb)', [uid, JSON.stringify(res)]) }; };
/** fait passer le temps : la manche du duel est terminée (n manches plus tôt) */
const vieillir = (id, n = 2) => q(db, 'update wm.duels set manche = manche - $2 where id = $1', [id, n]);
const r2 = x => Math.round(x * 100) / 100;

test('défier un bot ami : mise et frais pris, manche fixée par la base, accepté aussitôt au prix du moment ; le gagnant prend la cagnotte', async () => {
  const s0 = await stats(lea), t = Date.now();
  const { p, rep } = await creer(lea, 'btc', 'oui', 20, bot);
  const d = rep.duel, frais = r2(p.frais), pot = r2(20 * 100 / p.prix);
  expect(d).toMatchObject({ m: 'flash:btc', side: 'oui', by: lea, opp: bot, stake: 20, st: 'active', price0: p.prix, price: p.prix, pot, oppFee: 0 });
  expect(d.fee).toBeCloseTo(frais, 2); expect(frais).toBeGreaterThan(0); expect(frais).toBeLessThan(20 * 0.05);
  expect(d.oppStake).toBeCloseTo(r2(pot * (100 - p.prix) / 100), 2);
  expect([ME.round(t), ME.round(t) + 1], 'la manche en cours, ou la suivante s’il reste moins de dix secondes de mises').toContain(d.round);
  expect((await stats(lea)).balance).toBeCloseTo(s0.balance - 20 - frais, 2);
  expect(rep.duels.liste[0]).toMatchObject({ id: d.id, round: d.round });
  expect(rep.duels.users[bot]).toMatchObject({ n: 'bot_duel', bot: true });
  expect((await q(db, `select kind, amount::float8 as a, ref_id from public.balance_ledger where user_id = $1 order by id desc limit 1`, [lea]))[0]).toEqual({ kind: 'duel', a: r2(-(20 + frais)), ref_id: 'flash:btc:' + d.round });
  // la manche n'est pas finie : rien à régler
  const avant = await regler(lea, 1);
  expect(avant.o.duels).toEqual([]); expect(avant.rep.regles).toBe(0);
  expect((await duel(d.id)).etat).toBe('active');
  // fin de la manche, le camp de Léa l'emporte : elle prend la cagnotte, 20 XP, un pari réglé et gagné, une ligne d'historique
  await vieillir(d.id);
  const s1 = await stats(lea);
  const fin = await regler(lea, 1);
  expect(fin.o.duels).toEqual([{ id: d.id, gid: 'btc', round: d.round - 2 }]);
  expect(fin.rep.regles).toBe(1);
  expect(await duel(d.id)).toMatchObject({ etat: 'regle', gagnant: 'oui' });
  expect(await stats(lea)).toMatchObject({ balance: r2(s1.balance + pot), xp: s1.xp + 20, settled: s1.settled + 1, wins: s1.wins + 1 });
  expect((await stats(lea)).realise).toBeCloseTo(s1.realise + pot - 20, 2);
  expect(await q(db, `select kind, market_id, question, side, was_winner, pnl::float8 as pnl from public.position_history where user_id = $1 and question like 'duel|%'`, [lea]))
    .toEqual([{ kind: 'res', market_id: null, question: `duel|${bot}|flash:btc|${d.round - 2}`, side: 'oui', was_winner: true, pnl: r2(pot - 20) }]);
  expect((await notifs(lea, 'duel_gagne')).at(-1)).toMatchObject({ id: d.id, m: 'flash:btc', r: d.round - 2, u: bot });
  expect((await stats(bot)).balance, 'le bot ne touche ni ne paie rien').toBe(0);
  expect((await regler(lea, 1)).rep.regles, 'une seule fois').toBe(0);
});

test('camp perdant : la mise est perdue ; break even : le duel est annulé, la mise rendue (les frais restent acquis)', async () => {
  const s0 = await stats(lea);
  const a = await creer(lea, 'eth', 'non', 10, bot);
  await vieillir(a.rep.duel.id);
  await regler(lea, 1);                                                                       // le premier camp gagne : Léa (« non ») perd
  expect(await duel(a.rep.duel.id)).toMatchObject({ etat: 'regle', gagnant: 'oui' });
  const s1 = await stats(lea);
  expect(s1).toMatchObject({ xp: s0.xp, settled: s0.settled + 1, wins: s0.wins });
  expect(s1.balance).toBeCloseTo(s0.balance - 10 - r2(a.p.frais), 2);
  expect((await notifs(lea, 'duel_perdu')).at(-1)).toMatchObject({ id: a.rep.duel.id, m: 'flash:eth' });
  const b = await creer(lea, 'btc', 'oui', 30, bot);
  await vieillir(b.rep.duel.id);
  await regler(lea, 2);                                                                       // break even
  expect(await duel(b.rep.duel.id)).toMatchObject({ etat: 'void', gagnant: null });
  const s2 = await stats(lea);
  expect(s2).toMatchObject({ settled: s1.settled, wins: s1.wins, xp: s1.xp });
  expect(s2.balance).toBeCloseTo(s1.balance - r2(b.p.frais), 2);
  expect((await notifs(lea, 'duel_nul')).at(-1)).toMatchObject({ id: b.rep.duel.id, m: 'flash:btc', r: b.rep.duel.round - 2 });
  // l'issue vient du moteur : sans rien imposer, le règlement suit ME.issue pour la manche du duel
  const c = await creer(lea, 'btc', 'oui', 5, bot);
  await vieillir(c.rep.duel.id);
  const fin = await regler(lea);
  const out = ME.issue(ME.JEUX.btc, c.rep.duel.round - 2);
  expect(fin.res).toEqual([{ id: c.rep.duel.id, out }]);
  expect((await duel(c.rep.duel.id)).etat).toBe(out === 2 ? 'void' : 'regle');
  if (out !== 2) expect((await duel(c.rep.duel.id)).gagnant).toBe(out === 1 ? 'oui' : 'non');
});

test('défier un vrai ami : il est prévenu, accepte au prix du moment (sa mise est prise), et le règlement vaut pour les deux ; trop tard une fois les mises fermées', async () => {
  const l0 = await stats(lea), m0 = await stats(max);
  const { p, rep } = await creer(lea, 'btc', 'non', 40, max);
  const id = rep.duel.id;
  expect(rep.duel).toMatchObject({ st: 'open', opp: max, price0: p.prix });
  expect(rep.duel.expiresAt - Date.now()).toBeLessThanOrEqual(120000);                        // deux minutes au plus, ou la fermeture des mises
  expect((await notifs(max, 'duel_recu')).at(-1)).toMatchObject({ id, u: lea, m: 'flash:btc', r: rep.duel.round, s: 'non', k: 40 });
  // un tiers ne peut ni le lire ni l'accepter ; le défieur ne s'accepte pas lui-même ; les fonctions des marchés ne le connaissent pas
  expect(await srvNon('public.srv_duel_eclair_lire($1, $2::jsonb)', [zoe, JSON.stringify({ id })])).toMatch(/duel_indisponible/);
  expect(await srvNon('public.srv_duel_eclair_lire($1, $2::jsonb)', [lea, JSON.stringify({ id })])).toMatch(/duel_indisponible/);
  expect(await refus(db, max, `select public.api_duel_accept($1::jsonb)`, [JSON.stringify({ id })])).toMatch(/duel_indisponible/);
  expect(await refus(db, lea, `select public.api_duel_create($1::jsonb)`, [JSON.stringify({ m: 'flash:btc', side: 'oui', stake: 10, opp: null, key: randomUUID() })])).toMatch(/marche_inconnu/);
  const acc = await accepter(max, id);
  const pot = r2(40 * 100 / acc.prix), autre = r2(pot * (100 - acc.prix) / 100);
  expect(acc.rep.duel).toMatchObject({ st: 'active', price: acc.prix, pot, oppStake: autre });
  expect((await stats(max)).balance).toBeCloseTo(m0.balance - autre - r2(acc.frais), 2);
  expect((await notifs(lea, 'duel_accepte')).at(-1)).toMatchObject({ id, u: max, m: 'flash:btc', pot });
  expect(await srvNon('public.srv_duel_eclair_lire($1, $2::jsonb)', [max, JSON.stringify({ id })]), 'déjà accepté').toMatch(/duel_indisponible/);
  // fin de la manche, « non » l'emporte : Léa gagne, Max perd ; c'est Max qui déclenche le règlement, Léa est prévenue
  await vieillir(id);
  const l1 = await stats(lea), m1 = await stats(max);
  expect((await regler(max, 0)).rep.regles).toBe(1);
  expect(await duel(id)).toMatchObject({ etat: 'regle', gagnant: 'non' });
  expect(await stats(lea)).toMatchObject({ balance: r2(l1.balance + pot), xp: l1.xp + 20, wins: l1.wins + 1 });
  expect(await stats(max)).toMatchObject({ balance: m1.balance, xp: m1.xp, settled: m1.settled + 1, wins: m1.wins });
  expect((await notifs(lea, 'duel_gagne')).at(-1)).toMatchObject({ id, u: max });
  expect((await notifs(max, 'duel_perdu')).at(-1)).toMatchObject({ id, u: lea });
  expect((await regler(lea, 0)).rep.regles).toBe(0);
  // les mises de la manche sont fermées : on ne peut plus accepter (la trajectoire du prix est en partie connue)
  const tard = await creer(lea, 'eth', 'oui', 15, max);
  await q(db, 'update wm.duels set manche = wm.eclair_manche() - 1 where id = $1', [tard.rep.duel.id]);
  const l = await srv('public.srv_duel_eclair_lire($1, $2::jsonb)', [max, JSON.stringify({ id: tard.rep.duel.id })]);
  expect(await srvNon('public.srv_duel_eclair_accepter($1, $2::jsonb)', [max, JSON.stringify({ id: l.id, prix: 50, frais: 0.3, frais_remise: 0.2 })])).toMatch(/mises_fermees/);
  await vieillir(tard.rep.duel.id);                                                           // resté sans réponse : rendu à la fin de sa manche
  expect((await regler(max)).rep.regles).toBe(1);
  expect((await duel(tard.rep.duel.id)).etat).toBe('expired');
  expect(l0.balance).toBeGreaterThan(0);
});

test('sans réponse : la mise du défieur lui est rendue à la fin de la manche, ou dès que son délai est passé ; les frais restent acquis', async () => {
  const s0 = await stats(lea);
  const a = await creer(lea, 'btc', 'oui', 25, max);
  await vieillir(a.rep.duel.id);
  expect((await regler(lea, 1)).rep.regles).toBe(1);
  expect((await duel(a.rep.duel.id)).etat).toBe('expired');
  expect((await stats(lea)).balance).toBeCloseTo(s0.balance - r2(a.p.frais), 2);
  expect((await notifs(lea, 'duel_expire')).at(-1)).toMatchObject({ id: a.rep.duel.id, m: 'flash:btc' });
  const s1 = await stats(lea);
  const b = await creer(lea, 'btc', 'oui', 25, null);                                         // duel ouvert à qui reçoit le lien
  expect(b.rep.duel).toMatchObject({ st: 'open', opp: null });
  await q(db, `update wm.duels set expire_at = now() - interval '1 second' where id = $1`, [b.rep.duel.id]);
  const liste = (await enTantQue(db, lea, s => s('select public.api_duels() as r')))[0].r;      // au passage du joueur
  expect(liste.liste.find(x => x.id === b.rep.duel.id)).toMatchObject({ st: 'expired', round: b.rep.duel.round });
  expect((await stats(lea)).balance).toBeCloseTo(s1.balance - r2(b.p.frais), 2);
});

test('ce que la base refuse : montants, camps, prix, clé rejouée, non-amis, solde ; rien de tout cela n’est appelable par un joueur', async () => {
  expect(await creerNon(lea, 'btc', 'be', 20, bot)).toMatch(/cote_invalide/);
  expect(await creerNon(lea, 'btc', 'oui', 4, bot)).toMatch(/montant_invalide/);
  expect(await creerNon(lea, 'btc', 'oui', 6000, bot)).toMatch(/montant_invalide/);
  expect(await creerNon(lea, 'btc', 'oui', 20, bot, { gid: 'BTC!' })).toMatch(/jeu_inconnu/);
  expect(await creerNon(lea, 'btc', 'oui', 20, bot, { prix: 1 })).toMatch(/cote_indisponible/);
  expect(await creerNon(lea, 'btc', 'oui', 20, bot, { frais: 25, frais_remise: 25 })).toMatch(/montant_invalide/);
  expect(await creerNon(lea, 'btc', 'oui', 20, bot, { key: null })).toMatch(/cle_absente/);
  expect(await creerNon(lea, 'btc', 'oui', 20, zoe)).toMatch(/pas_amis/);
  expect(await creerNon(lea, 'btc', 'oui', 20, lea)).toMatch(/duel_indisponible/);
  expect(await creerNon(zoe, 'btc', 'oui', 2000, null)).toMatch(/solde_insuffisant/);
  expect(await srvNon('public.srv_duel_eclair_creer($1, $2::jsonb)', [randomUUID(), JSON.stringify(corps('btc', 'oui', 20, null))])).toMatch(/session/);
  const s0 = await stats(lea), cle = randomUUID();
  const un = await creer(lea, 'btc', 'oui', 20, bot, { key: cle }), deux = await creer(lea, 'btc', 'oui', 20, bot, { key: cle });
  expect(deux.rep).toMatchObject({ rejoue: true, duel: { id: un.rep.duel.id } });
  expect((await stats(lea)).balance, 'une seule mise prise').toBeCloseTo(s0.balance - 20 - r2(un.p.frais), 2);
  for (const f of [`srv_duel_eclair_creer($1, '{}'::jsonb)`, `srv_duel_eclair_lire($1, '{}'::jsonb)`, `srv_duel_eclair_accepter($1, '{}'::jsonb)`, `srv_duel_eclair_ouverts($1)`, `srv_duel_eclair_regler($1, '[]'::jsonb)`]) {
    expect(await refus(db, lea, `select public.${f}`, [lea]), f).toMatch(/permission denied/);
    expect(await refus(db, null, `select public.${f}`, [lea]), f).toMatch(/permission denied/);
  }
  // l'issue d'un duel ne peut pas être réglée avant la fin de sa manche, même par l'Edge Function
  const tot = await creer(lea, 'btc', 'oui', 5, bot);
  await srv('public.srv_duel_eclair_regler($1, $2::jsonb)', [lea, JSON.stringify([{ id: tot.rep.duel.id, out: 1 }])]);
  expect((await duel(tot.rep.duel.id)).etat).toBe('active');
});
