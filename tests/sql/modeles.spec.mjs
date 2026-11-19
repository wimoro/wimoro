// Marchés réels, lot 10 : les mathématiques du modèle (valeurs de référence), la cohérence de l'activité simulée avec les
// cours réels (wm-ancres, sans toucher wm.bots_tick), et les successeurs des 30 marchés permanents.
import { test, expect } from '@playwright/test';
import { creerBase, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db;
test.beforeAll(async () => { db = await creerBase(); await semer(db); });
test.afterAll(async () => { await db.close(); });
const v = async (sql, p) => Object.values((await q(db, sql, p))[0])[0];
const cours = (actif, prix, source = 'binance') => q(db, `insert into wm.px_dernier (actif, prix, source, source_t, t) values ($1, $2, $3, now(), now())
  on conflict (actif) do update set prix = excluded.prix, source = excluded.source, source_t = excluded.source_t, t = excluded.t`, [actif, prix, source]);
const fiche = async id => (await q(db, 'select * from wm.fiches where id = $1', [id]))[0];
const fermer = id => q(db, `update wm.fiches set ferme_at = now() - interval '1 minute', resolution_at = now() + interval '1 day' where id = $1`, [id]);

test('mathématiques : loi normale, lognormale, barrière, Poisson et NBA contre des valeurs de référence', async () => {
  expect(await v('select wm.phi(0)')).toBeCloseTo(0.5, 7);
  expect(await v('select wm.phi(1)')).toBeCloseTo(0.8413447, 6);
  expect(await v('select wm.phi(-1.96)')).toBeCloseTo(0.0249979, 6);
  expect(await v('select wm.phi_inv(0.975)')).toBeCloseTo(1.959964, 5);
  expect(await v('select wm.phi(wm.phi_inv(0.3))')).toBeCloseTo(0.3, 6);
  // les calculs de la recherche du 19 nov. 2026 : BTC > 65 000 $ au 31/12 (41,6 %), ETH touche 2 000 $ avant 2027 (56,2 %)
  expect(await v('select wm.mod_lognormal(63674, 65000, 0.45, 42.4 / 365)')).toBeCloseTo(0.416, 2);
  expect(await v('select wm.mod_barriere(1804, 2000, 0.52, 42.4 / 365)')).toBeCloseTo(0.562, 2);
  expect(await v('select wm.mod_barriere(2100, 2000, 0.52, 0.1)')).toBe(1);
  const p = await v('select wm.mod_poisson(1.4, 1.1, 0, 0, 1)');
  expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 5);
  expect(p[0]).toBeGreaterThan(p[2]);
  const fin = await v('select wm.mod_poisson(1.4, 1.1, 2, 0, 0.05)');           // 2-0 à la 89e minute
  expect(fin[0]).toBeGreaterThan(0.98);
  expect(await v('select wm.mod_nba(0.6, 0, 1)')).toBeCloseTo(0.6, 5);
  expect(await v('select wm.mod_nba(0.6, -15, 0.05)')).toBeLessThan(0.01);
});

test('krach : « Bitcoin au-dessus de 150 000 $ » ne reste pas à 67 % quand le Bitcoin vaut 63 000 $ (avant puis après la mise en ligne)', async () => {
  const TX = { fr: { q: 'Le Bitcoin dépassera-t-il 150 000 $ ?', court: 'BTC > 150 k$', critere: 'Clôture Coinbase du jour.' },
    en: { q: 'Will Bitcoin top $150,000?', court: 'BTC > $150K', critere: 'Coinbase daily close.' }, he: { q: 'האם הביטקוין יעבור 150,000 דולר?', court: 'ביטקוין מעל 150K$', critere: 'סגירת Coinbase.' } };
  const au = new Date(Date.now() + 40 * 86400000).toISOString();
  await q(db, 'select wm.fiche_creer($1::jsonb)', [JSON.stringify({ id: 'krach-btc', categorie: 'crypto', origine: 'admin', p0: 67, textes: TX, ferme_at: au,
    regle: { type: 'prix', actif: 'btc', op: '>', seuil: 150000, au, sigma: 0.45 } })]);
  await cours('btc', 63000);
  const actu = await q(db, `select market_id, modele from wm.cat_cotes where market_id = 'btc-vs-or-2026'`);
  await q(db, 'select wm.ancres_tick()');
  const c = (await q(db, `select prix, modele, detail from wm.cat_cotes where market_id = 'krach-btc'`))[0];
  expect(Number(c.modele)).toBe(3);                               // borné à 3 %
  expect(Number(c.prix)).toBe(3);                                 // avant la mise en ligne, le prix servi suit le modèle
  expect(c.detail.m).toMatchObject({ modele: 'lognormal', cours: 63000, seuil: 150000, sigma: 0.45 });
  // un marché sans modèle (actualité) n'est pas touché
  expect(await q(db, `select market_id, modele from wm.cat_cotes where market_id = 'btc-vs-or-2026'`)).toEqual(actu);
  // après la mise en ligne : la valeur de référence suit le modèle, l'ancre fait la moitié du chemin, le prix 30 % à chaque passage
  await q(db, `update wm.reglages set valeur = 'true' where cle = 'catalogue.serveur'`);
  await q(db, `update wm.cat_cotes set prix = 67 where market_id = 'krach-btc'`);
  await q(db, `select wm.fiche_moteur('krach-btc')`);
  await q(db, 'select wm.ancres_tick()');
  let l = (await q(db, `select l.current_probability p, l.anchor_probability a, m.current_probability r from public.market_live_state l join public.markets m on m.id = l.market_id where l.market_id = 'krach-btc'`))[0];
  expect(Number(l.r)).toBe(3);
  expect(Number(l.a)).toBeCloseTo(35, 4);
  expect(Number(l.p)).toBeCloseTo(67 - 0.3 * 64, 4);
  for (let i = 0; i < 8; i++) await q(db, 'select wm.ancres_tick()');
  l = (await q(db, `select current_probability p from public.market_live_state where market_id = 'krach-btc'`))[0];
  expect(Number(l.p)).toBeLessThan(18);                          // ≈ 4 minutes, même bots en veille
  await q(db, `update wm.reglages set valeur = 'false' where cle = 'catalogue.serveur'`);
});

test('successeur d’un marché de prix : à la fermeture, le mois suivant s’ouvre avec un seuil rond calculé sur le cours', async () => {
  await cours('btc', 71234);
  await fermer('btc-fin-decembre-2026');
  await q(db, 'select wm.cycle_tick()');
  const s = await fiche('btc-mensuel-2027-01');
  expect(s).toBeTruthy();
  expect(s).toMatchObject({ cycle: 'ouvert', origine: 'modele', modele_id: 'btc-mensuel', periode: '2027-01', categorie: 'crypto' });
  expect(s.regle).toMatchObject({ type: 'prix', actif: 'btc', op: '>', seuil: 70000 });
  expect(new Date(s.regle.au).toISOString()).toBe('2027-02-01T00:00:00.000Z');
  expect(new Date(s.ferme_at).toISOString()).toBe('2027-01-30T23:59:00.000Z');
  expect(s.textes.fr.q).toBe('Le Bitcoin sera-t-il au-dessus de 70 000 $ le 31 janvier 2027 à 23h59 UTC ?');
  expect(s.textes.en.q).toBe('Will Bitcoin be above $70,000 on January 31, 2027 at 23:59 UTC?');
  expect(s.textes.he.court).toBe('ביטקוין מעל 70K$ ב-31.1');
  expect(s.textes.fr.critere).toContain('1er février 2027 00:00:00 UTC');
  expect(Number(s.p0)).toBeGreaterThan(40);
  expect(Number(s.p0)).toBeLessThan(70);
  expect(s.image_id).toBe((await fiche('btc-fin-decembre-2026')).image_id);
  await q(db, 'select wm.cycle_tick()');
  expect(Number(await v(`select count(*) from wm.fiches where modele_id = 'btc-mensuel'`))).toBe(2);   // idempotent
});

test('successeurs : semaine (crypto et S&P 500, jours fériés compris), réunion de la Fed, classement, touche', async () => {
  for (const [a, p, src] of [['spx', 7300, 'yahoo'], ['eth', 1800, 'binance']]) await cours(a, p, src);
  for (const id of ['btc-semaine-2026-11-23', 'sp500-semaine-2026-11-23', 'fed-decembre-2026', 'top-capitalisation-fin-2026', 'eth-2000-avant-2027']) await fermer(id);
  await q(db, 'select wm.cycle_tick()');
  const h = await fiche('btc-hebdo-2026-w49');
  expect(new Date(h.regle.debut).toISOString()).toBe('2026-11-30T00:00:00.000Z');
  expect(new Date(h.ferme_at).toISOString()).toBe('2026-11-30T00:00:00.000Z');
  expect(h.textes.fr.q).toBe('Le Bitcoin finira-t-il la semaine du 30 novembre au 6 décembre 2026 en hausse ?');
  const s = await fiche('sp500-hebdo-2026-w49');
  expect(new Date(s.ferme_at).toISOString()).toBe('2026-11-30T14:30:00.000Z');            // ouverture de New York
  expect(new Date(s.regle.ref_cloture_at).toISOString()).toBe('2026-11-27T18:00:00.000Z');  // lendemain de Thanksgiving : clôture à 13:00
  expect(new Date(s.regle.cloture_at).toISOString()).toBe('2026-12-04T21:00:00.000Z');
  const f = await fiche('fed-reunion-2027-01');
  expect(f.nature).toBe('options');
  expect(new Date(f.ferme_at).toISOString()).toBe('2027-01-27T18:00:00.000Z');
  expect(f.textes.fr.court).toBe('Décision Fed 27/01');
  expect(Number(await v(`select sum(p0) from wm.fiches_options where fiche_id = 'fed-reunion-2027-01'`))).toBe(100);
  const t = await fiche('top-cap-mensuel-2027-01');
  expect(new Date(t.ferme_at).toISOString()).toBe('2027-01-28T23:59:00.000Z');              // veille du dernier jour de séance (29 janvier)
  const opts = await q(db, `select code, p0 from wm.fiches_options where fiche_id = 'top-cap-mensuel-2027-01' order by ordre`);
  expect(opts.map(o => o.code)).toEqual(['aapl', 'nvda', 'googl', 'msft', 'autre']);
  expect(opts.reduce((a, o) => a + Number(o.p0), 0)).toBe(100);
  const e = await fiche('eth-touche-2027-01');
  expect(e.regle).toMatchObject({ type: 'touche', seuil: 2000 });                             // 1 800 × 1,10 arrondi à la centaine
  expect(new Date(e.regle.de).toISOString()).toBe('2027-01-01T00:00:00.000Z');
});

test('successeurs à la résolution (valeur de l’instance) et brouillons des éditions à valider', async () => {
  // IPC : le seuil suivant est la valeur publiée ; sans valeur, un brouillon pour l'équipe
  await fermer('cpi-usa-novembre-2026');
  await q(db, `select wm.resoudre('cpi-usa-novembre-2026', 'oui', null, '{"v": 3.8}'::jsonb, 'BLS', 'https://www.bls.gov/news.release/cpi.nr0.htm')`);
  const c = await fiche('cpi-usa-2026-12');
  expect(c.regle).toMatchObject({ type: 'manuel', seuil: 3.8 });
  expect(c.textes.fr.q).toBe('L\'inflation américaine sur un an (indice des prix de décembre 2026) dépassera-t-elle 3,8 % ?');
  expect(new Date(c.ferme_at).toISOString()).toBe('2027-01-13T12:30:00.000Z');
  await fermer('approbation-trump-31-12-2026');
  await q(db, `select wm.resoudre('approbation-trump-31-12-2026', 'non', null, null, 'Silver Bulletin', 'https://www.natesilver.net/')`);
  expect(await fiche('trump-approbation-2027-01')).toBeUndefined();
  expect((await q(db, `select etat, motif from wm.propositions_jour where cle = 'modele:trump-approbation:2027-01'`))[0]).toEqual({ etat: 'en_attente', motif: 'valeur_absente' });
  // saison : ouverte tout de suite avec les mêmes options ; édition (Game Awards) : brouillon
  await fermer('pl-winner-2026-27');
  await q(db, `select wm.resoudre('pl-winner-2026-27', 'pl-winner-2026-27-ars', null, null, 'Premier League', 'https://www.premierleague.com')`);
  const pl = await fiche('pl-2027-28');
  expect(pl).toMatchObject({ cycle: 'ouvert', periode: '2027-28' });
  expect(pl.textes.fr.q).toBe('Qui sera champion de Premier League 2027-2028 ?');
  expect(Number(await v(`select count(*) from wm.fiches_options where fiche_id = 'pl-2027-28'`))).toBe(6);
  await fermer('game-awards-2026');
  await q(db, `select wm.resoudre('game-awards-2026', 'game-awards-2026-gta6', null, null, 'The Game Awards', 'https://thegameawards.com')`);
  const b = (await q(db, `select etat, origine, brouillon from wm.propositions_jour where cle = 'modele:game-awards:2027'`))[0];
  expect(b).toMatchObject({ etat: 'en_attente', origine: 'successeur' });
  expect(b.brouillon.textes.fr.q).toContain('2027');
  expect(await fiche('game-awards-2027')).toBeUndefined();
});
