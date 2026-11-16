// Copy trading côté serveur : démarrer, régler, mettre en pause, arrêter ; paris et ventes reproduits par le même
// carnet que les paris ordinaires ; arrêt de perte ; part de frais reversée au joueur copié ; bots copiés.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

const ENGINE = vm.runInNewContext(fs.readFileSync('js/engine.js', 'utf8') + '\n;({ quoteBuy, quoteSell })', { module: undefined });

test.describe.configure({ mode: 'serial' });
let db, lea, max, noa, fer, bot;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 2000); max = await creerJoueur(db, 'max', 1000); noa = await creerJoueur(db, 'noa', 1000); fer = await creerJoueur(db, 'fer', 1000);
  await q(db, 'update public.user_stats set xp = 1500, bets_settled = 25, bets_won = 15, deposits_count = 1, bets_placed = 30 where user_id = any ($1)', [[lea, max, noa]]);   // rang Or
  await q(db, `update wm.user_prefs set prefs = '{"v":1,"prefs":{"copyok":true}}'::jsonb where user_id = $1`, [lea]).catch(() => {});
  await q(db, `insert into wm.user_prefs (user_id, prefs) values ($1, '{"v":1,"prefs":{"copyok":true}}'::jsonb) on conflict (user_id) do update set prefs = excluded.prefs`, [lea]);
  [{ id: bot }] = await q(db, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('bot@test.dev', '{"username":"bot.karim"}', now()) returning id`);
  await q(db, 'update public.users set is_demo = true where id = $1', [bot]);
  await q(db, 'update public.user_stats set bets_placed = 400, bets_settled = 380, bets_won = 240 where user_id = $1', [bot]);
});
test.afterAll(async () => { await db.close(); });

const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const copier = (qui, p) => api(qui, 'api_copy_start($1::jsonb)', [JSON.stringify(p)]);
const non = (qui, p) => refus(db, qui, 'select public.api_copy_start($1::jsonb)', [JSON.stringify(p)]);
const acheter = (qui, m, s, total) => api(qui, 'api_buy($1, $2, $3, $4)', [m, s, total, randomUUID()]);
const stats = async u => (await q(db, 'select balance::float8 as balance, xp, bets_placed as played from public.user_stats where user_id = $1', [u]))[0];
const copie = async id => (await q(db, 'select etat, why, realise::float8 as realise, n, donne::float8 as donne, fin_pnl::float8 as fin, gardes, sec_budget, sec_solde from wm.copies where id = $1', [id]))[0];
const lots = id => q(db, 'select market_id as m, side as s, sh::float8 as sh, cout::float8 as cout from wm.copies_lots where copie = $1 and sh > 0 order by market_id', [id]);
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));
const marche = async id => { const [l] = await q(db, 'select current_probability::float8 as p, volume_total::float8 as vol, liquidity_depth::float8 as liq from public.market_live_state where market_id = $1', [id]); return { ...l, cat: id === 'btc150k' ? 'Crypto' : 'Football' }; };
const BASE = () => ({ u: lea, budget: 200, mode: 'fixed', per: 50, pct: 10, cap: 0, cats: [], stop: 30 });
let ID;

test('démarrer une copie : rang Or, profil copiable, réglages vérifiés, une seule copie par joueur', async () => {
  expect(await refus(db, null, `select public.api_copy_start('{}'::jsonb)`)).toMatch(/permission denied/);
  expect(await non(fer, BASE())).toMatch(/rang_insuffisant/);
  expect(await non(max, { ...BASE(), u: max })).toMatch(/copie_indisponible/);                  // pas soi-même
  expect(await non(max, { ...BASE(), u: noa })).toMatch(/copie_indisponible/);                  // noa n'autorise pas la copie
  expect(await non(max, { ...BASE(), u: fer })).toMatch(/copie_indisponible/);                  // pas assez de paris
  expect(await non(max, { ...BASE(), budget: 40 })).toMatch(/budget_min/);
  expect(await non(max, { ...BASE(), budget: 5000 })).toMatch(/budget_solde/);
  expect(await non(max, { ...BASE(), per: 2 })).toMatch(/mise_copie_invalide/);
  expect(await non(max, { ...BASE(), per: 300 })).toMatch(/mise_copie_invalide/);               // plus que le budget
  expect(await non(max, { ...BASE(), mode: 'prop', pct: 0 })).toMatch(/mise_copie_invalide/);
  expect(await non(max, { ...BASE(), mode: 'prop', pct: 50, cap: 2 })).toMatch(/mise_copie_invalide/);
  const r = await copier(max, BASE());
  ID = r.copie;
  expect(r.copies.list).toMatchObject([{ id: ID, u: lea, status: 'active', budget: 200, mode: 'fixed', per: 50, stop: 30, cats: null, holds: [], n: 0, realized: 0 }]);
  expect(r.copies.users[lea]).toMatchObject({ n: 'lea' });
  expect(r.me).toMatchObject({ balance: 1000, xp: 1515 });                                      // le budget n'est pas débité ; 15 XP à la première copie
  expect(r.ev.filter(e => e.k === 'notif' && e.n.code === 'copie_debut').map(e => e.n.p)).toMatchObject([{ u: lea, budget: 200, mode: 'fixed', per: 50 }]);
  expect(await non(max, BASE())).toMatch(/copie_existe/);
  expect((await api(lea, 'api_state()')).copies).toMatchObject({ list: [], copiers: 1, earn: 0 });   // lea voit qu'elle est copiée
  expect((await api(max, 'api_state()')).copies.list).toHaveLength(1);
  for (const t of ['wm.copies', 'wm.copies_lots', 'wm.copies_journal']) expect(await refus(db, max, `select * from ${t}`), t).toMatch(/permission denied/);
  for (const f of [`wm.copies_suivre('${lea}', 'btc150k', 'oui', 100)`, `wm.copie_executer(${ID}, 'btc150k', 'oui', 100)`, `wm.copie_arreter(${ID}, 'manual', true)`, 'wm.copies_tick()', `wm.copies_etat('${lea}')`])
    expect(await refus(db, max, `select ${f}`), f).toMatch(/permission denied/);
});

test('le joueur copié parie : sa copie reproduit le pari par le même carnet ; il touche 20 % des frais ; une vente est reproduite aussi', async () => {
  const s0 = await stats(max), l0 = await stats(lea);
  const r = await acheter(lea, 'btc150k', 'oui', 300);                                           // le pari de lea
  const apresLea = { p: r.marches.btc150k[0] };
  const m1 = await marche('btc150k');                                                            // après le pari de lea ET sa copie
  expect(m1.p).toBeGreaterThan(apresLea.p);                                                      // la copie a été exécutée après, sans être écrasée
  const [lot] = await lots(ID);
  expect(lot).toMatchObject({ m: 'btc150k', s: 'oui' });
  const c = await copie(ID);
  expect(c).toMatchObject({ etat: 'active', n: 1 });
  const fee = Math.round(-c.realise * 100) / 100;                                                // les frais du pari copié
  expect(fee).toBeGreaterThan(0.5); expect(lot.cout).toBeCloseTo(50 - fee, 2);
  expect(c.donne).toBeCloseTo(fee * 0.2, 4);
  expect(await stats(max)).toMatchObject({ balance: s0.balance - 50, played: s0.played + 1 });
  expect((await q(db, `select kind, amount::float8 as a from public.balance_ledger where user_id = $1 order by id desc limit 1`, [max]))[0]).toEqual({ kind: 'copie', a: -50 });
  expect(await notifs(max, 'copie_ouverte')).toMatchObject([{ u: lea, amt: 50, s: 'oui', m: 'btc150k' }]);
  const part = Math.trunc(fee * 0.2 * 100) / 100;                                                // la part de lea, au centime
  expect((await stats(lea)).balance).toBeCloseTo(l0.balance - 300 + part, 2);
  expect(await notifs(lea, 'copie_revenu')).toMatchObject([{ gain: part, n: 1 }]);
  expect((await api(lea, 'api_state()')).copies).toMatchObject({ copiers: 1, earn: part });
  expect((await api(max, 'api_state()')).copies.list[0]).toMatchObject({ n: 1, holds: [{ m: 'btc150k', s: 'oui' }], log: [{ k: 'open', m: 'btc150k', s: 'oui', amt: 50 }] });

  // lea vend : la copie vend son lot
  const pLea = (await q(db, `select shares::float8 as sh from public.positions where user_id = $1 and market_id = 'btc150k' and side = 'oui'`, [lea]))[0].sh;
  const s1 = await stats(max);
  await api(lea, 'api_sell($1, $2, $3, $4)', ['btc150k', 'oui', pLea, randomUUID()]);
  expect(await lots(ID)).toEqual([]);
  const c2 = await copie(ID);
  expect((await stats(max)).balance).toBeGreaterThan(s1.balance + 40);                           // le produit de la vente est revenu
  expect(c2.realise).toBeLessThan(0);                                                            // aller-retour : frais et écart perdus
  expect((await q(db, `select kind, question, side from public.position_history where user_id = $1 order by settled_at desc limit 1`, [max]))[0]).toEqual({ kind: 'sell', question: 'via|copy|' + lea, side: 'oui' });
  expect((await notifs(max, 'copie_sortie')).pop()).toMatchObject({ u: lea, m: 'btc150k', s: 'oui' });
  expect((await api(max, 'api_state()')).copies.list[0].log.map(x => x.k)).toEqual(['exit', 'open']);
});

test('pas de chaîne : le pari copié de max ne déclenche pas les copies de ceux qui copient max', async () => {
  await q(db, `insert into wm.user_prefs (user_id, prefs) values ($1, '{"v":1,"prefs":{"copyok":true}}'::jsonb) on conflict (user_id) do update set prefs = excluded.prefs`, [max]);
  const r = await copier(noa, { ...BASE(), u: max });                                             // noa copie max, qui copie lea
  const n0 = (await stats(noa)).balance;
  await acheter(lea, 'clasico', 'non', 100);                                                     // max copie ce pari…
  expect((await copie(ID)).n).toBe(2);
  expect((await copie(r.copie)).n).toBe(0);                                                      // …mais noa ne copie pas la copie
  expect((await stats(noa)).balance).toBe(n0);
  await acheter(max, 'clasico', 'oui', 60);                                                      // un pari de max lui-même, lui, est copié
  expect((await copie(r.copie)).n).toBe(1);
  await api(noa, 'api_copy_set($1, $2)', [r.copie, 'stop_close']);
});

test('réglages : pourcentage et plafond, catégories, budget épuisé signalé une seule fois, pause', async () => {
  await copier(max, { ...BASE(), edit: ID, mode: 'prop', pct: 10, cap: 20, cats: ['Crypto'] });
  expect((await api(max, 'api_state()')).copies.list.find(c => c.id === ID)).toMatchObject({ mode: 'prop', pct: 10, cap: 20, cats: ['Crypto'] });
  const n0 = (await copie(ID)).n, b0 = (await stats(max)).balance;
  await acheter(lea, 'clasico', 'oui', 500);                                                     // Football : hors catégories
  expect((await copie(ID)).n).toBe(n0);
  await acheter(lea, 'btc150k', 'non', 500);                                                     // 10 % de 500 = 50, plafonné à 20
  expect((await copie(ID)).n).toBe(n0 + 1);
  expect((await stats(max)).balance).toBeCloseTo(b0 - 20, 2);
  await acheter(lea, 'btc150k', 'non', 30);                                                      // 10 % de 30 = 3 : sous la mise minimale
  expect(await copie(ID)).toMatchObject({ n: n0 + 1, sec_budget: true });
  await acheter(lea, 'btc150k', 'non', 30);
  expect(await notifs(max, 'copie_a_sec')).toMatchObject([{ u: lea, why: 'budget' }]);            // une seule fois
  await api(max, 'api_copy_set($1, $2)', [ID, 'pause']);
  await acheter(lea, 'btc150k', 'non', 500);
  expect(await copie(ID)).toMatchObject({ etat: 'paused', n: n0 + 1 });                          // en pause : plus rien n'est copié
  expect((await api(max, 'api_copy_set($1, $2)', [ID, 'resume'])).copies.list.find(c => c.id === ID).status).toBe('active');
  expect(await refus(db, noa, 'select public.api_copy_set($1, $2)', [ID, 'stop'])).toMatch(/copie_indisponible/);   // pas la sienne
  expect(await refus(db, max, 'select public.api_copy_set($1, $2)', [ID, 'efface'])).toMatch(/action_invalide/);
});

test('arrêt de perte : la copie s’arrête et vend ses positions ; arrêt à la main en gardant les positions', async () => {
  await copier(max, { ...BASE(), edit: ID, mode: 'fixed', per: 50, cats: [], stop: 10 });         // arrêt à 10 % du budget : 20 $
  await acheter(lea, 'btc150k', 'non', 200);                                                     // la copie mise 50 $ sur Non
  expect((await lots(ID)).find(l => l.m === 'btc150k')).toMatchObject({ s: 'non' });
  await q(db, `update public.market_live_state set current_probability = 95 where market_id = 'btc150k'`);   // le Non s'effondre à 5 ¢
  expect((await q(db, 'select wm.copies_tick() as r'))[0].r).toMatchObject({ arrets: 1 });        // la tâche de fond vérifie les arrêts de perte
  const c = await copie(ID);
  expect(c).toMatchObject({ etat: 'stopped', why: 'stop', gardes: 0 });
  expect(c.fin).toBeLessThan(-20);
  expect(await lots(ID)).toEqual([]);
  expect(await notifs(max, 'copie_stop')).toMatchObject([{ u: lea, pnl: c.fin }]);
  expect((await api(lea, 'api_state()')).copies.copiers).toBe(0);

  const r = await copier(max, { ...BASE(), stop: 0 });                                            // une nouvelle copie du même joueur est possible
  await acheter(lea, 'btc150k', 'oui', 100);
  const fin = await api(max, 'api_copy_set($1, $2)', [r.copie, 'stop']);                          // arrêt en gardant les positions
  expect(fin).toMatchObject({ kept: 1 });
  expect(await copie(r.copie)).toMatchObject({ etat: 'stopped', why: 'manual', gardes: 1 });
  expect((await q(db, `select shares::float8 as sh from public.positions where user_id = $1 and market_id = 'btc150k' and side = 'oui'`, [max]))[0].sh).toBeGreaterThan(1);   // la position reste au portefeuille
});

test('le joueur copié passe en profil privé : ses copies s’arrêtent à son pari suivant, les positions copiées restent au copieur', async () => {
  await q(db, 'update public.user_stats set balance = 5000 where user_id = any ($1)', [[lea, max]]);
  const r = await copier(max, { ...BASE(), stop: 0 });
  await acheter(lea, 'clasico', 'oui', 100);
  expect((await copie(r.copie)).n).toBe(1);
  await q(db, 'update public.users set is_public = false where id = $1', [lea]);
  const b0 = (await stats(max)).balance;
  await acheter(lea, 'clasico', 'oui', 100);
  expect(await copie(r.copie)).toMatchObject({ etat: 'stopped', why: 'private', n: 1, gardes: 1 });
  expect((await stats(max)).balance).toBe(b0);                                                   // rien de plus n'est copié
  expect(await notifs(max, 'copie_fin')).toMatchObject([{ u: lea }]);
  expect(await non(max, BASE())).toMatch(/copie_indisponible/);                                  // et on ne peut plus la copier
  await q(db, 'update public.users set is_public = true where id = $1', [lea]);
});

test('bot copié : la tâche de fond lui fait placer des paris, que la copie reproduit ; « copier aussi ses paris en cours »', async () => {
  const r = await copier(noa, { ...BASE(), u: bot, budget: 300, per: 20, withOpen: true, existing: [{ m: 'btc150k', s: 'oui', amt: 400 }, { m: 'clasico', s: 'non', amt: 900 }, { m: 'inconnu', s: 'oui', amt: 50 }] });
  expect(r.ouvertes).toBe(2);                                                                    // les deux marchés connus
  expect((await lots(r.copie)).map(l => l.m + ':' + l.s)).toEqual(['btc150k:oui', 'clasico:non']);
  expect(await copie(r.copie)).toMatchObject({ n: 2, donne: expect.any(Number) });
  const b0 = (await stats(bot)).balance;
  let total = { paris: 0, ventes: 0 };
  for (let i = 0; i < 40; i++) { const t = (await q(db, 'select wm.copies_tick() as r'))[0].r; total.paris += t.paris; total.ventes += t.ventes; }
  expect(total.paris).toBeGreaterThan(3);                                                        // le bot a parié, la copie a suivi
  expect(total.ventes).toBeGreaterThan(0);                                                       // et revendu
  expect((await copie(r.copie)).n).toBe(2 + total.paris);
  expect((await stats(bot)).balance).toBe(b0);                                                   // un bot ne touche rien
  expect(await q(db, `select schedule, command from cron.job where jobname = 'wm-copies'`)).toEqual([{ schedule: '20 seconds', command: 'select wm.copies_tick()' }]);
  await api(noa, 'api_copy_set($1, $2)', [r.copie, 'stop_close']);
  expect(await lots(r.copie)).toEqual([]);
});
