// Bots teneurs de marché : ils animent les prix en les ramenant vers l'ancre, gardent les issues multiples à 100 %,
// n'écrivent aucune ligne par action, diffusent un seul message par tick, et se coupent d'un réglage.
// Couvre K20 à K25 et la recette 9 (côté serveur).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, refus, q, semer } from './base.mjs';

let db;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  await db.exec(`
    insert into public.market_groups (id, category, question) values ('g', 'Politique', 'Qui gagnera ?');
    insert into public.markets (id, category, question, status, group_parent_id, heat_level) values
      ('g-a', 'Politique', 'A ?', 'open', 'g', 2), ('g-b', 'Politique', 'B ?', 'open', 'g', 1.5), ('g-c', 'Politique', 'C ?', 'open', 'g', 1), ('ferme', 'Sport', 'Fermé ?', 'resolved', null, 3);
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values
      ('g-a', 50, 50, 2000000, 10, 12000), ('g-b', 30, 30, 1500000, 10, 9000), ('g-c', 20, 20, 1000000, 10, 6000), ('ferme', 40, 40, 100000, 1, 600);
    update public.markets set heat_level = 3, current_probability = 63 where id = 'btc150k';        -- valeur de référence du marché
    update public.markets set current_probability = 54 where id = 'clasico';
    update public.markets set current_probability = 50 where id = 'g-a'; update public.markets set current_probability = 30 where id = 'g-b'; update public.markets set current_probability = 20 where id = 'g-c';
    select wm.present();`);                                                           // un joueur est là : rythme normal et diffusions
});
test.afterAll(async () => { await db.close(); });
const etat = async () => Object.fromEntries((await q(db, `select market_id, current_probability::float8 as p, anchor_probability::float8 as anchor, volume_total::float8 as vol, liquidity_depth::float8 as liq, jsonb_array_length(coalesce(price_history, '[]'::jsonb)) as ph from public.market_live_state`)).map(r => [r.market_id, r]));
const ticks = async n => { for (let i = 0; i < n; i++) await q(db, 'select wm.bots_tick()'); };

test('planification : un tick toutes les 3 secondes ; les anciennes tâches (bots, pari éclair) sont arrêtées', async () => {
  const jobs = await q(db, 'select jobname, schedule, command from cron.job order by jobname');
  expect(jobs.map(j => j.jobname)).toEqual(['wm-bots', 'wm-bots-chat', 'wm-copies', 'wm-ordres', 'wm-purge-cron', 'wm-suivis']);
  expect(jobs[0]).toMatchObject({ schedule: '3 seconds', command: 'select wm.bots_tick()' });
  expect(jobs[1]).toMatchObject({ schedule: '5 seconds', command: 'select wm.bots_chat()' });
  expect(jobs[2]).toMatchObject({ schedule: '20 seconds', command: 'select wm.copies_tick()' });   // copy trading : arrêts de perte, paris des bots copiés
  expect(jobs[3]).toMatchObject({ schedule: '3 seconds', command: 'select wm.ordres_tick()' });   // ordres limite, stop loss, take profit
  expect(jobs[4].command, 'le journal de pg_cron est purgé').toMatch(/cron.job_run_details/);
  expect(jobs[5]).toMatchObject({ schedule: '5 seconds', command: 'select wm.chat_suivis_tick()' });   // suivis des mises partagées dans le chat
});

test('K20 · les prix restent autour de l’ancre au lieu de filer vers 2 % ou 98 %', async () => {
  // on part d'un marché déréglé, comme en production au moment de l'audit : prix 2 %, ancre 63 %
  await q(db, `update public.market_live_state set current_probability = 2, anchor_probability = 63 where market_id = 'btc150k'`);
  await ticks(700);                                                                // environ 35 minutes d'activité
  const e = await etat();
  expect(Math.abs(e.btc150k.p - e.btc150k.anchor), `prix ${e.btc150k.p}, ancre ${e.btc150k.anchor}`).toBeLessThan(12);   // le prix a rejoint son ancre
  expect(Math.abs(e.btc150k.anchor - 63), `ancre ${e.btc150k.anchor}`).toBeLessThan(25);                                   // qui reste autour de la valeur de référence
  expect(e.clasico.p).toBeGreaterThan(20); expect(e.clasico.p).toBeLessThan(90);
  for (const id in e) { expect(e[id].p).toBeGreaterThanOrEqual(1); expect(e[id].p).toBeLessThanOrEqual(99); }
  expect(e.ferme.p, 'un marché résolu ne bouge plus').toBe(40);
});

test('K20 · sur la durée (plusieurs heures d’activité), les ancres ne se polarisent pas : elles restent autour de la valeur de référence', async () => {
  test.setTimeout(120000);
  const ecarts = [];
  for (let i = 0; i < 8; i++) {                                                    // 8 × 600 ticks : environ 4 heures d'activité
    await ticks(600);
    const e = await etat();
    ecarts.push(Math.abs(e.btc150k.anchor - 63), Math.abs(e.clasico.anchor - 54));
    expect(e.btc150k.anchor, 'ancre de btc150k').toBeGreaterThan(63 - 22); expect(e.btc150k.anchor).toBeLessThan(63 + 22);
    expect(e.clasico.anchor, 'ancre de clasico').toBeGreaterThan(54 - 22); expect(e.clasico.anchor).toBeLessThan(54 + 22);
    expect(e.btc150k.p).toBeGreaterThan(15); expect(e.btc150k.p).toBeLessThan(97);
  }
  const moyen = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
  expect(moyen, 'écart moyen à la référence ' + moyen.toFixed(1)).toBeLessThan(9);
  expect(moyen, 'les marchés vivent : l’ancre bouge').toBeGreaterThan(0.5);
});

test('K21 · les issues d’un même marché totalisent 100 % à chaque instant', async () => {
  for (let i = 0; i < 60; i++) {
    await ticks(5);
    const [{ t }] = await q(db, `select sum(current_probability)::float8 as t from public.market_live_state where market_id like 'g-%'`);
    expect(t).toBeCloseTo(100, 6);
  }
});

test('K24 · aucune ligne créée par action de bot : la base ne grossit pas', async () => {
  const compter = async () => (await q(db, `select (select count(*) from public.market_bets)::int as bets, (select count(*) from public.chat_messages)::int as chat, (select count(*) from public.market_price_history)::int as hist, (select count(*) from public.balance_ledger)::int as ledger, (select count(*) from public.market_live_state)::int as marches, (select count(*) from public.flash_bets)::int as flash, (select count(*) from realtime.messages)::int as diffusions`))[0];
  const a = await compter();
  await ticks(200);
  const b = await compter();
  expect({ ...b, diffusions: 0 }).toEqual({ ...a, diffusions: 0 });               // seules les diffusions (purgées par Supabase au bout de 3 jours) s'ajoutent
  expect(b.diffusions - a.diffusions).toBeLessThanOrEqual(200);                    // un message par tick au plus
  const e = await etat();
  for (const id in e) expect(e[id].ph, id + ' : historique court borné').toBeLessThanOrEqual(160);
});

test('un tick = un message diffusé, avec tous les marchés modifiés et la traînée des mises', async () => {
  await q(db, 'truncate realtime.messages');
  let vus = 0, signaux = 0;
  for (let i = 0; i < 150; i++) {
    await ticks(1);
    const msgs = await q(db, 'select topic, event, private, payload from realtime.messages');
    expect(msgs.length).toBeLessThanOrEqual(1);
    if (msgs.length) {
      vus++;
      const m = msgs[0];
      expect(m).toMatchObject({ topic: 'marches', event: 'tick', private: false });
      for (const id in m.payload.m) { const [p, vol, gens, liq] = m.payload.m[id]; expect(p).toBeGreaterThanOrEqual(1); expect(p).toBeLessThanOrEqual(99); expect(vol).toBeGreaterThan(0); expect(gens).toBeGreaterThan(0); expect(liq).toBeGreaterThanOrEqual(400); }
      for (const b of m.payload.b) { expect(Object.keys(m.payload.m)).toContain(b[0]); expect([1, -1]).toContain(b[1]); }
      if (m.payload.sig) { signaux++; expect(m.payload.sig).toMatchObject({ mins: 5 }); expect(['oui', 'non']).toContain(m.payload.sig.s); }
      expect(JSON.stringify(m.payload).length, 'message compact').toBeLessThan(3000);
    }
    await q(db, 'truncate realtime.messages');
  }
  expect(vus).toBeGreaterThan(130);
  expect(signaux, 'des signaux de foule de temps en temps').toBeGreaterThanOrEqual(2);
});

test('réglage : les bots se coupent et se règlent sans toucher au code', async () => {
  await q(db, `update wm.config set value = '{"actif": false, "intensite": 1}' where key = 'bots'`);
  const a = await etat(); await ticks(40);
  expect(await etat()).toEqual(a);
  await q(db, `update wm.config set value = '{"actif": true, "intensite": 0}' where key = 'bots'`);
  const v0 = (await etat()).clasico.vol; await ticks(60);
  const calme = (await etat()).clasico.vol - v0;
  await q(db, `update wm.config set value = '{"actif": true, "intensite": 3}' where key = 'bots'`);
  const v1 = (await etat()).clasico.vol; await ticks(60);
  const fort = (await etat()).clasico.vol - v1;
  expect(fort).toBeGreaterThan(calme * 2);
  await q(db, `update wm.config set value = '{"actif": true, "intensite": 1}' where key = 'bots'`);
});

test('K24, K25 · veille : sans joueur présent, aucune diffusion et dix fois moins de mouvements ; le retour d’un joueur réveille les bots', async () => {
  const volume = async () => (await q(db, 'select sum(volume_total)::float8 as v from public.market_live_state'))[0].v;
  const diffusions = async () => (await q(db, 'select count(*)::int as n from realtime.messages'))[0].n;
  await q(db, 'truncate realtime.messages');
  const v0 = await volume(); await ticks(300);
  const actif = await volume() - v0;
  expect(await diffusions()).toBeGreaterThan(280);                                  // un joueur est là : presque un message par tick
  // plus personne depuis 7 minutes
  await q(db, `update wm.config set updated_at = now() - interval '7 minutes' where key = 'presence'`);
  await q(db, 'truncate realtime.messages');
  const v1 = await volume(); await ticks(300);
  const veille = await volume() - v1;
  expect(await diffusions(), 'aucune diffusion en veille').toBe(0);
  expect(veille).toBeGreaterThan(0);                                               // les prix continuent de vivre…
  expect(veille).toBeLessThan(actif * 0.25);                                       // … mais au ralenti (un tick sur dix)
  // un joueur ouvre le site : lire les marchés suffit à réveiller les bots
  await q(db, 'select public.api_markets()');
  await ticks(20);
  expect(await diffusions()).toBeGreaterThan(15);
  // le signal de présence périodique n'écrit qu'une fois toutes les 30 secondes
  const joueur = await creerJoueur(db, 'veilleur');
  const avant = (await q(db, `select updated_at from wm.config where key = 'presence'`))[0].updated_at;
  for (let i = 0; i < 5; i++) expect(await refus(db, joueur, 'select public.api_present()')).toBeNull();
  expect((await q(db, `select updated_at from wm.config where key = 'presence'`))[0].updated_at).toEqual(avant);
  expect(await refus(db, null, 'select public.api_present()'), 'réservé aux joueurs connectés').toMatch(/permission denied/);
});

test('durée d’un tick : très en dessous de sa période de 3 secondes', async () => {
  const t0 = Date.now(); await ticks(100);
  const ms = (Date.now() - t0) / 100;
  expect(ms, `durée moyenne ${ms.toFixed(1)} ms`).toBeLessThan(300);
});

test('les bots ne sont appelables par aucun client', async () => {
  const joueur = await creerJoueur(db, 'curieux');
  for (const qui of [null, joueur]) for (const f of ['wm.bots_tick()', 'wm.bots_burst()', 'wm.droits()', 'wm.tick_emit(array[]::text[])'])
    expect(await refus(db, qui, 'select ' + f), (qui ? 'joueur' : 'visiteur') + ' → ' + f).toMatch(/permission denied/);
});
