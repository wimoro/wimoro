// Marchés réels, lot 8 : le catalogue des marchés vit sur le serveur (wm.fiches), lu par api_catalogue, même par un
// visiteur ; les 60 marchés ouverts du 19 nov. 2026 ; et la garantie que rien ne change pour l'ancien écran du site en
// ligne tant que le catalogue n'est pas mis en ligne (aucune ligne du moteur, api_markets identique).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, avant;
test.beforeAll(async () => {
  [db, avant] = await Promise.all([creerBase(), creerBase({ until: '_catalogue' })]);
  await semer(db); await semer(avant);
});
test.afterAll(async () => { await db.close(); await avant.close(); });

const visiteur = (sql, p) => enTantQue(db, null, s => s(sql, p));
const catalogue = async (depuis = 0, langue = null) => (await visiteur('select public.api_catalogue($1, $2) as r', [depuis, langue]))[0].r;

test('les 60 marchés : 30 permanents et 30 d’actualité, sur les 7 catégories, textes complets dans les trois langues', async () => {
  const f = await q(db, `select id, nature, categorie, origine, modele_id, periode, textes, ferme_at, resolution_at, p0, cycle, moteur, image_id from wm.fiches order by id`);
  expect(f.length).toBe(60);
  expect(f.filter(x => x.origine === 'modele').length).toBe(30);
  expect(f.filter(x => x.origine !== 'modele').length).toBe(30);
  expect(new Set(f.map(x => x.categorie))).toEqual(new Set(['crypto', 'bourse', 'economie', 'politique', 'sport', 'tech', 'culture']));
  for (const x of f) {
    for (const l of ['fr', 'en', 'he']) {
      expect(x.textes[l].q.length, `${x.id} ${l}`).toBeGreaterThan(8);
      expect(x.textes[l].court.length, `${x.id} ${l} court`).toBeLessThanOrEqual(24);
      expect(x.textes[l].critere.length, `${x.id} ${l} critère`).toBeGreaterThan(20);
    }
    expect(/[֐-׿]/.test(x.textes.he.q), `${x.id} : question hébraïque`).toBe(true);
    expect(new Date(x.ferme_at) > new Date(), `${x.id} : fin des mises future`).toBe(true);
    expect(x.cycle).toBe('ouvert');
    expect(x.moteur).toBe(false);
    if (x.origine === 'modele') expect(x.modele_id && x.periode, x.id).toBeTruthy();
    if (x.nature === 'binaire') expect(Number(x.p0)).toBeGreaterThanOrEqual(1);
  }
  // options : probabilités de départ et prix ramenés à 100 % exactement
  const sommes = await q(db, `select o.fiche_id, sum(o.p0) as p0, sum(c.prix) as prix, count(*) as n from wm.fiches_options o join wm.cat_cotes c on c.market_id = o.market_id group by o.fiche_id`);
  expect(sommes.length).toBe(f.filter(x => x.nature === 'options').length);
  for (const s of sommes) { expect(Number(s.p0), s.fiche_id).toBe(100); expect(Number(s.prix), s.fiche_id).toBeCloseTo(100, 6); }
  // images : à copier (lot 11), jamais un fichier « non libre » de en.wikipedia
  const img = await q(db, `select fichier, etat, page_url from wm.images order by id`);
  expect(img.length).toBeGreaterThan(40);
  for (const i of img) { expect(i.etat).toBe('a_copier'); expect(i.page_url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/); }
});

test('rien ne change pour l’ancien écran : aucune ligne du moteur, api_markets identique, bots et chat inchangés', async () => {
  const compte = async b => (await q(b, `select (select count(*) from public.markets) m, (select count(*) from public.market_live_state) l,
    (select count(*) from public.market_groups) g, (select count(*) from public.market_outcomes) o, (select count(*) from public.chat_rooms) c`))[0];
  expect(await compte(db)).toEqual(await compte(avant));
  const marches = async b => { const r = (await enTantQue(b, null, s => s('select public.api_markets() as r')))[0].r; delete r.now; return r; };
  expect(await marches(db)).toEqual(await marches(avant));
  // une heure de bots : ils ne voient que les marchés d'avant (les fiches n'ont pas de ligne dans le moteur)
  await q(db, `insert into wm.config (key, value, updated_at) values ('presence', '{}', now()) on conflict (key) do update set updated_at = now()`);
  for (let i = 0; i < 40; i++) await q(db, 'select wm.bots_tick()');
  const ids = (await q(db, 'select market_id from public.market_live_state order by 1')).map(r => r.market_id);
  expect(ids).toEqual(['btc150k', 'clasico']);
  const diffuses = await q(db, `select distinct jsonb_object_keys(payload -> 'm') as id from realtime.messages where topic = 'marches' and event = 'tick'`);
  for (const d of diffuses) expect(['btc150k', 'clasico']).toContain(d.id);
});

test('api_catalogue : lisible par un visiteur, dans la langue demandée, léger, sans réveiller les bots', async () => {
  const presence0 = (await q(db, `select updated_at from wm.config where key = 'presence'`))[0]?.updated_at;
  const tout = await catalogue();
  expect(tout.m.length).toBe(60);
  expect(tout.en_ligne).toBe(false);
  expect(tout.cats.length).toBe(7);
  const btc = tout.m.find(m => m.id === 'btc-fin-decembre-2026');
  expect(Object.keys(btc.t).sort()).toEqual(['en', 'fr', 'he']);
  expect(btc.p).toBe(42);
  expect(btc.l).toEqual({ actif: 'btc' });
  expect(btc.per).toEqual({ m: 'btc-mensuel', p: '2026-12' });
  expect(btc.p0_justif).toBeUndefined();                     // la justification reste interne
  const he = await catalogue(0, 'he');
  const ucl = he.m.find(m => m.id === 'ucl-winner-2026-27');
  expect(ucl.k).toBe('o');
  expect(ucl.t.q).toMatch(/[֐-׿]/);
  expect(ucl.opt.reduce((a, o) => a + o.p, 0)).toBeCloseTo(100, 6);
  expect(typeof ucl.opt[0].t).toBe('string');
  expect(JSON.stringify(he).length).toBeLessThan(80000);
  expect((await q(db, `select updated_at from wm.config where key = 'presence'`))[0]?.updated_at).toEqual(presence0);
  // depuis une révision : seulement ce qui a changé, et les fiches retirées
  expect((await catalogue(tout.rev)).m).toEqual([]);
  await q(db, `update wm.fiches set masque = true where id = 'btc-vs-or-2026'`);
  const suite = await catalogue(tout.rev, 'fr');
  expect(suite.m).toEqual([]);
  expect(suite.x).toEqual(['btc-vs-or-2026']);
  expect((await catalogue()).m.some(m => m.id === 'btc-vs-or-2026')).toBe(false);
  await q(db, `update wm.fiches set masque = false where id = 'btc-vs-or-2026'`);
});

test('événement « cat » : un seul message par transaction qui change le catalogue, pas pour un prix', async () => {
  const n0 = Number((await q(db, `select count(*) from realtime.messages where topic = 'site' and event = 'cat'`))[0].count);
  await db.transaction(async tx => {
    await tx.query(`update wm.fiches set source_nom = 'Coinbase Exchange' where id = 'btc-fin-decembre-2026'`);
    await tx.query(`update wm.fiches_options set noms = noms || '{"fr": "FC Barcelone"}' where market_id = 'ucl-winner-2026-27-bar'`);
  });
  const msgs = await q(db, `select payload from realtime.messages where topic = 'site' and event = 'cat' order by inserted_at`);
  expect(msgs.length).toBe(n0 + 1);
  expect(msgs.at(-1).payload.ids).toEqual(['btc-fin-decembre-2026', 'ucl-winner-2026-27']);
  await q(db, `update wm.cat_cotes set prix = 41 where market_id = 'btc-fin-decembre-2026'`);
  expect(Number((await q(db, `select count(*) from realtime.messages where topic = 'site' and event = 'cat'`))[0].count)).toBe(n0 + 1);
});

test('wm.fiche_creer refuse un texte avec balise, un libellé trop long, des options qui ne font pas 100 %, une date passée, un identifiant pris', async () => {
  const base = { id: 'essai-refus', nature: 'binaire', categorie: 'tech', origine: 'admin', p0: 40, ferme_at: '2030-01-01T00:00:00Z',
    textes: { fr: { q: 'Une question assez longue ?', court: 'Court', critere: 'Un critère de résolution précis.' },
              en: { q: 'A long enough question?', court: 'Short', critere: 'A precise resolution criterion.' },
              he: { q: 'שאלה ארוכה מספיק?', court: 'קצר', critere: 'קריטריון הכרעה מדויק.' } } };
  const essai = async p => { try { await q(db, 'select wm.fiche_creer($1::jsonb)', [JSON.stringify(p)]); return null; } catch (e) { return e.message; } };
  expect(await essai({ ...base, textes: { ...base.textes, fr: { ...base.textes.fr, q: '<script>Une question ?' } } })).toBe('texte_invalide');
  expect(await essai({ ...base, textes: { ...base.textes, en: { ...base.textes.en, court: 'x'.repeat(25) } } })).toBe('texte_invalide');
  expect(await essai({ ...base, textes: { fr: base.textes.fr, en: base.textes.en } })).toBe('textes_incomplets');
  expect(await essai({ ...base, ferme_at: '2020-01-01T00:00:00Z' })).toBe('date_invalide');
  expect(await essai({ ...base, id: 'btc-fin-decembre-2026' })).toBe('identifiant_pris');
  expect(await essai({ ...base, id: 'btc150k' })).toBe('identifiant_pris');
  expect(await essai({ ...base, nature: 'options', options: [{ code: 'a', p0: 30, noms: { fr: 'A', en: 'A', he: 'א' } }, { code: 'b', p0: 30, noms: { fr: 'B', en: 'B', he: 'ב' } }] })).toBe('probabilite_invalide');
  expect(await essai({ ...base, image: { fichier: 'https://example.org/x.png' } })).toBe('image_invalide');
  expect(await essai({ ...base, regle: { type: 'inconnu' } })).toBe('regle_invalide');
  expect(await essai(base)).toBeNull();
});

test('mise en ligne : les lignes du moteur naissent comme celles de wm.prop_promouvoir, et l’on peut parier', async () => {
  await q(db, `update wm.reglages set valeur = 'true' where cle = 'catalogue.serveur'`);
  await q(db, `select wm.fiche_moteur('btc-fin-decembre-2026'), wm.fiche_moteur('pl-new-ars-2026-11-21')`);
  const m = await q(db, `select id, category, status, group_parent_id, question, current_probability from public.markets where id like 'pl-new-ars%' or id = 'btc-fin-decembre-2026' order by id`);
  expect(m.map(x => x.id)).toEqual(['btc-fin-decembre-2026', 'pl-new-ars-2026-11-21-away', 'pl-new-ars-2026-11-21-draw', 'pl-new-ars-2026-11-21-home']);
  expect(m[0]).toMatchObject({ category: 'Crypto', status: 'open', group_parent_id: null });
  expect(m[1]).toMatchObject({ category: 'Football', group_parent_id: 'pl-new-ars-2026-11-21' });
  const g = await q(db, `select status from public.market_groups where id = 'pl-new-ars-2026-11-21'`);
  expect(g[0].status).toBe('open');
  const l = await q(db, `select sum(current_probability) as s from public.market_live_state where market_id like 'pl-new-ars-2026-11-21-%'`);
  expect(Number(l[0].s)).toBeCloseTo(100, 6);
  const salons = await q(db, `select id from public.chat_rooms where id in ('m:btc-fin-decembre-2026', 'm:pl-new-ars-2026-11-21-home')`);
  expect(salons.length).toBe(2);
  expect((await q(db, `select count(*) from public.market_outcomes where group_id = 'pl-new-ars-2026-11-21'`))[0].count).toBe(3);
  // un joueur parie sur le nouveau marché ; le prix servi par api_catalogue est désormais celui du moteur
  const alice = await creerJoueur(db, 'alice_cat', 100);
  const p0 = (await catalogue(0, 'fr')).m.find(x => x.id === 'btc-fin-decembre-2026').p;
  expect(p0).toBe(Number((await q(db, `select current_probability from public.market_live_state where market_id = 'btc-fin-decembre-2026'`))[0].current_probability));
  const r = await enTantQue(db, alice, s => s(`select public.api_buy('btc-fin-decembre-2026', 'oui', 20, gen_random_uuid()) as r`));
  expect(r[0].r.pos.sh).toBeGreaterThan(0);
  const p = (await catalogue(0, 'fr')).m.find(x => x.id === 'btc-fin-decembre-2026').p;
  expect(p).toBeGreaterThan(p0);
  // une fiche créée une fois le catalogue en ligne reçoit ses lignes du moteur tout de suite
  await q(db, `select wm.fiche_creer($1::jsonb)`, [JSON.stringify({ id: 'essai-en-ligne', categorie: 'crypto', origine: 'admin', p0: 30, ferme_at: '2030-01-01T00:00:00Z',
    textes: { fr: { q: 'Question en ligne ?', court: 'En ligne', critere: 'Critère précis.' }, en: { q: 'Online question?', court: 'Online', critere: 'Precise criterion.' },
              he: { q: 'שאלה מקוונת?', court: 'מקוון', critere: 'קריטריון מדויק.' } } })]);
  expect((await q(db, `select moteur from wm.fiches where id = 'essai-en-ligne'`))[0].moteur).toBe(true);
  await q(db, `update wm.reglages set valeur = 'false' where cle = 'catalogue.serveur'`);
});
