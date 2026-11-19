// Données réelles, lot 6 : le socle côté base. Sources (états, quotas, pauses), cours (dernier cours, anneau d'une heure),
// instantané api_live (direct, retardé, simulé), calendriers des places, jeton des tâches planifiées, sauvegarde.
// Le test joue le rôle de l'Edge Function « donnees » : il envoie à srv_cours_ingerer ce qu'elle aurait lu chez les sources.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, alice;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 100);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [chef]);
});
test.afterAll(async () => { await db.close(); });

const srv = async (sql, params) => (await q(db, `select ${sql} as r`, params))[0].r;
const ingerer = p => srv('public.srv_cours_ingerer($1::jsonb)', [JSON.stringify(p)]);
const live = async (qui = null, serie = null) => (await enTantQue(db, qui, s => s('select public.api_live($1) as r', [serie])))[0].r;
const source = async id => (await q(db, 'select * from wm.sources where id = $1', [id]))[0];
async function comme(uid, sql, params) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql, params)).rows;
  });
}
const eq = (qui, action, p = {}) => comme(qui, 'select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)]).then(r => r[0].r);
const eqNon = (qui, action, p = {}) => eq(qui, action, p).then(() => null, e => e.message);

test('sauvegarde : les tables où le lot écrit sont copiées avant, schéma et données ; une table déjà sauvée garde sa copie', async () => {
  const t = await q(db, `select nom, copie, lignes::int from backup_20261119.tables where nom in ('wm.reglages', 'wm.droits_liste', 'wm.equipe_actions', 'cron.job') order by nom`);
  expect(t.map(x => x.nom)).toEqual(['cron.job', 'wm.droits_liste', 'wm.equipe_actions', 'wm.reglages']);
  const n = Object.fromEntries(t.map(x => [x.nom, x.lignes]));
  expect(n['wm.reglages']).toBe(82); expect(n['wm.droits_liste']).toBe(1);                       // avant les lignes ajoutées par le lot
  expect((await q(db, 'select count(*)::int as n from backup_20261119.wm_reglages'))[0].n).toBe(82);
  expect((await q(db, `select count(*)::int as n from backup_20261119.wm_reglages where cle like 'donnees.%'`))[0].n).toBe(0);
  expect(await srv(`backup_20261119.sauver_table('wm.reglages')`)).toBeNull();                 // déjà sauvée : rien de plus
  expect((await q(db, `select colonnes from backup_20261119.tables where nom = 'wm.reglages'`))[0].colonnes.map(c => c.nom)).toContain('valeur');
  for (const qui of [null, alice]) expect(await refus(db, qui, 'select * from backup_20261119.fonctions_lots')).toMatch(/permission denied/);
});

test('jeton des tâches : créé une seule fois par la base (64 caractères), vérifié par empreinte, jamais accessible à un client', async () => {
  const s = await q(db, `select secret from vault.secrets where name = 'wm_cron_jeton'`);
  expect(s).toHaveLength(1); expect(s[0].secret).toMatch(/^[0-9a-f]{64}$/);
  const jeton = s[0].secret;
  expect(await srv('public.srv_jeton_ok($1)', [jeton])).toBe(true);
  for (const faux of ['0'.repeat(64), jeton.slice(0, 63) + (jeton.endsWith('0') ? '1' : '0'), 'court', '', null]) expect(await srv('public.srv_jeton_ok($1)', [faux]), String(faux)).toBe(false);
  for (const qui of [null, alice]) {
    expect(await refus(db, qui, `select public.srv_jeton_ok('x')`)).toMatch(/permission denied/);
    expect(await refus(db, qui, `select * from vault.secrets`)).toMatch(/permission denied/);
  }
});

test('réveil d’une Edge Function : adresse du projet, région de la base, jeton lu dans Vault ; collecte coupée : aucun appel', async () => {
  const jeton = (await q(db, `select secret from vault.secrets where name = 'wm_cron_jeton'`))[0].secret;
  const id = await srv(`wm.appeler('donnees', '{"tache":"boucle"}'::jsonb)`);
  const [r] = await q(db, 'select url, headers, convert_from(body, \'UTF8\') as corps, timeout_milliseconds as ms from net.http_request_queue where id = $1', [id]);
  expect(r.url).toBe('https://brmwvxncyeypefsgiepf.supabase.co/functions/v1/donnees');
  expect(r.headers).toMatchObject({ 'x-wm-jeton': jeton, 'x-region': 'ap-southeast-2', 'Content-Type': 'application/json' });
  expect(r.headers.apikey).toMatch(/^sb_publishable_/);                                       // clé publique du site, pas un secret
  expect(JSON.parse(r.corps)).toEqual({ tache: 'boucle' }); expect(r.ms).toBe(5000);
  expect(await q(db, `select wm.appeler('Pas bon!') as r`).catch(e => e.message)).toMatch(/requete/);
  await q(db, `update wm.reglages set valeur = 'false' where cle = 'donnees.actif'`);
  const avant = (await q(db, 'select count(*)::int as n from net.http_request_queue'))[0].n;
  expect(await srv(`wm.appeler('donnees')`)).toBeNull();
  expect((await q(db, 'select count(*)::int as n from net.http_request_queue'))[0].n).toBe(avant);
  await q(db, `update wm.reglages set valeur = 'true' where cle = 'donnees.actif'`);
  const [job] = await q(db, `select schedule, command from cron.job where jobname = 'wm-donnees'`);
  expect(job).toEqual({ schedule: '* * * * *', command: `select wm.appeler('donnees', '{"tache":"boucle"}'::jsonb)` });
  expect(job.command).not.toContain(jeton);                                                  // le jeton n'est jamais dans le texte de la tâche
  for (const qui of [null, alice]) expect(await refus(db, qui, `select wm.appeler('donnees')`)).toMatch(/permission denied/);
});

test('calendriers : heure locale, changements d’heure, jours fériés, fermetures anticipées, pause de midi, marchés de la semaine', async () => {
  const cas = [
    ['NYSE', '2026-11-19 14:29:59+00', false], ['NYSE', '2026-11-19 14:30:00+00', true], ['NYSE', '2026-11-19 20:59:59+00', true],
    ['NYSE', '2026-11-19 21:00:00+00', false], ['NYSE', '2026-11-21 16:00:00+00', false],                       // samedi
    ['NYSE', '2026-11-26 16:00:00+00', false],                                                                // Thanksgiving
    ['NYSE', '2026-11-27 17:59:00+00', true], ['NYSE', '2026-11-27 18:00:00+00', false],                       // fermeture à 13:00 ET
    ['NYSE', '2027-03-15 13:45:00+00', true], ['NYSE', '2027-03-12 13:45:00+00', false],                       // heure d'été dès le 14 mars 2027
    ['TSE', '2026-11-19 02:45:00+00', false], ['TSE', '2026-11-19 03:45:00+00', true], ['TSE', '2026-11-23 01:00:00+00', false],
    ['EURONEXT', '2026-12-24 12:59:00+00', true], ['EURONEXT', '2026-12-24 13:00:00+00', false], ['XETRA', '2026-12-24 10:00:00+00', false],
    ['EURONEXT', '2026-07-01 07:30:00+00', true],                                                             // 9:30 à Paris en été
    ['CME', '2026-11-22 22:30:00+00', false], ['CME', '2026-11-22 23:30:00+00', true],                         // dimanche, ouverture à 17:00 CT
    ['CME', '2026-11-25 22:30:00+00', false], ['CME', '2026-11-25 23:10:00+00', true],                         // pause quotidienne 16:00-17:00 CT
    ['CME', '2026-11-20 21:30:00+00', true], ['CME', '2026-11-20 22:30:00+00', false], ['CME', '2026-11-21 12:00:00+00', false],
    ['ICE', '2026-11-23 00:30:00+00', true], ['ICE', '2026-11-24 00:30:00+00', false], ['ICE', '2026-11-24 01:30:00+00', true],
    ['ICE', '2026-11-24 23:30:00+00', false], ['ICE', '2026-11-22 23:30:00+00', true],
    ['CRYPTO', '2026-11-21 03:00:00+00', true], ['INCONNU', '2026-11-19 15:00:00+00', false],
  ];
  for (const [m, t, attendu] of cas) expect(await srv('wm.marche_ouvert($1, $2::timestamptz)', [m, t]), `${m} ${t}`).toBe(attendu);
  const prochaine = async (m, t) => { const v = await srv('wm.marche_prochaine_ouverture($1, $2::timestamptz)', [m, t]); return v && new Date(v).toISOString(); };
  expect(await prochaine('NYSE', '2026-11-26 16:00:00+00')).toBe('2026-11-27T14:30:00.000Z');              // le lendemain de Thanksgiving
  expect(await prochaine('NYSE', '2026-11-20 22:00:00+00')).toBe('2026-11-23T14:30:00.000Z');              // vendredi soir → lundi
  expect(await prochaine('NYSE', '2026-11-19 15:00:00+00')).toBeNull();                                   // déjà ouverte
  expect(await prochaine('TSE', '2026-11-19 02:45:00+00')).toBe('2026-11-19T03:30:00.000Z');               // reprise après la pause de midi
  expect(await prochaine('CRYPTO', '2026-11-19 02:45:00+00')).toBeNull();
});

test('collecte : le dernier cours et l’anneau d’une heure ; une cotation plus ancienne ne remplace jamais une plus récente', async () => {
  const t = Date.now();
  const r = await ingerer({ cours: [
    { a: 'btc', p: 63194.07, src: 'binance' }, { a: 'eth', p: '1782.92', src: 'binance', st: t - 2000 },
    { a: 'zzz', p: 1, src: 'binance' }, { a: 'sol', p: -3, src: 'binance' }, { a: 'xrp', p: 'abc', src: 'binance' }] });
  expect(r).toMatchObject({ ok: true, cours: 2 });
  const d = await q(db, 'select actif, prix::float8 as p, source, source_t, t, n::int from wm.px_dernier order by actif');
  expect(d.map(x => [x.actif, x.p, x.source, x.n])).toEqual([['btc', 63194.07, 'binance', 1], ['eth', 1782.92, 'binance', 1]]);
  expect(d[0].source_t).toBeNull(); expect(Math.abs(new Date(d[1].source_t).getTime() - (t - 2000))).toBeLessThan(5);
  const e = await q(db, `select actif, slot, prix::float8 as p from wm.px_echantillons order by actif`);
  expect(e.map(x => x.actif)).toEqual(['btc', 'eth']);
  const slot = (await q(db, `select (floor(extract(epoch from t) / 3)::bigint % 1200)::int as s from wm.px_echantillons where actif = 'btc'`))[0].s;
  expect(e[0].slot).toBe(slot);
  // une cotation datée d'avant celle qu'on garde : ignorée ; une plus récente : gardée, même actif, même ligne
  await ingerer({ cours: [{ a: 'eth', p: 1700, src: 'kraken', st: t - 60000 }] });
  expect((await q(db, `select prix::float8 as p, n::int from wm.px_dernier where actif = 'eth'`))[0]).toEqual({ p: 1782.92, n: 1 });
  await ingerer({ cours: [{ a: 'eth', p: 1790, src: 'kraken', st: t + 1000 }] });
  expect((await q(db, `select prix::float8 as p, source, n::int from wm.px_dernier where actif = 'eth'`))[0]).toEqual({ p: 1790, source: 'kraken', n: 2 });
  expect((await q(db, `select count(*)::int as n from wm.px_dernier where actif = 'eth'`))[0].n).toBe(1);
  // l'anneau est réécrit en place : jamais plus de 1 200 emplacements par actif, aucune suppression
  await q(db, `update wm.px_echantillons set t = t - interval '1 hour' where actif = 'btc'`);
  await ingerer({ cours: [{ a: 'btc', p: 63200, src: 'binance' }] });
  const anneau = await q(db, `select count(*)::int as n, max(prix)::float8 as p from wm.px_echantillons where actif = 'btc'`);
  expect(anneau[0].n).toBeLessThanOrEqual(2); expect(anneau[0].p).toBe(63200);
});

test('sources : appels du jour, quota, erreurs, pause après un refus, clé absente : l’état est tenu par la base', async () => {
  const pause = Date.now() + 120000;
  await ingerer({ sources: [
    { id: 'binance', appels: 3, ok: 3, err: 0, code: 200, ms: 120, cle: true },
    { id: 'kraken', appels: 1, ok: 0, err: 1, code: 429, erreur: 'HTTP 429', ms: 80, pause_ms: pause },
    { id: 'finnhub', appels: 0, ok: 0, err: 0, cle: false },
    { id: 'source_inconnue', appels: 9 }] });
  const b = await source('binance'), k = await source('kraken'), f = await source('finnhub'), y = await source('yahoo');
  expect([b.etat, b.raison, b.appels_jour, b.dernier_code, b.erreurs_suite]).toEqual(['direct', 'ok', 3, 200, 0]);
  expect([k.etat, k.raison, k.appels_jour, k.erreurs_suite, k.dernier_code, k.derniere_erreur]).toEqual(['erreur', 'pause', 1, 1, 429, 'HTTP 429']);
  expect(Math.abs(new Date(k.pause_jusqua).getTime() - pause)).toBeLessThan(5);
  expect([f.etat, f.raison, f.cle_presente]).toEqual(['inactif', 'cle_absente', false]);      // clé absente : source simplement inactive
  expect([y.etat, y.raison]).toEqual(['inactif', 'en_reserve']);
  // les appels s'additionnent dans la journée, et repartent de zéro le lendemain (UTC)
  await ingerer({ sources: [{ id: 'binance', appels: 2, ok: 2 }] });
  expect((await source('binance')).appels_jour).toBe(5);
  await q(db, `update wm.sources set jour = jour - 1 where id = 'binance'`);
  await ingerer({ sources: [{ id: 'binance', appels: 1, ok: 1 }] });
  expect((await source('binance')).appels_jour).toBe(1);
  expect(Number((await source('binance')).appels_total)).toBe(6);
  // la pause se lève : la source repart, son compteur d'erreurs aussi
  await ingerer({ sources: [{ id: 'kraken', appels: 1, ok: 1, err: 0, code: 200, pause_ms: 0 }] });
  const k2 = await source('kraken');
  expect([k2.etat, k2.raison, k2.erreurs_suite, k2.pause_jusqua]).toEqual(['direct', 'ok', 0, null]);
  // une source par nature différée (taux du jour) est « differe » quand elle répond
  await ingerer({ sources: [{ id: 'frankfurter', appels: 1, ok: 1, code: 200 }] });
  expect((await source('frankfurter')).etat).toBe('differe');
  // la clé arrive : la source n'est plus inactive (elle attend son premier appel)
  await ingerer({ sources: [{ id: 'finnhub', appels: 0, cle: true }] });
  expect([(await source('finnhub')).etat, (await source('finnhub')).raison]).toEqual(['inactif', 'en_reserve']);
});

test('instantané : direct, retardé ou simulé (niveau de référence) ; marché ouvert ; état par famille', async () => {
  // eurusd vient d'une source par nature différée : toujours « retardé » ; xau vient de vieillir
  await ingerer({ cours: [{ a: 'eurusd', p: 1.0992, src: 'frankfurter', st: Date.now() - 3600000 }, { a: 'xau', p: 3690, src: 'goldapi', st: Date.now() - 1000 }] });
  await q(db, `update wm.px_dernier set source_t = now() - interval '10 minutes' where actif = 'xau'`);
  await ingerer({});
  const l = await live();
  expect(l.cours.btc).toMatchObject({ p: 63200, e: 'd', o: 1 });
  expect(l.cours.eurusd).toMatchObject({ p: 1.0992, e: 'r' });
  expect(l.cours.xau.e).toBe('r');
  expect(l.cours.xrp).toMatchObject({ p: 0.9761, e: 's' });                                   // jamais reçu : simulé, au niveau de référence
  expect(l.cours.xrp.t).toBeNull();
  expect(Object.keys(l.cours)).toHaveLength(37);
  expect(l.familles).toMatchObject({ crypto: 'simule', devises: 'simule', petrole: 'simule' });
  const ny = (await srv(`wm.marche_ouvert('NYSE', now())`)) ? 1 : 0;
  expect(l.cours.nvda.o).toBe(ny); expect(l.cours.btc.o).toBe(1);
  expect(JSON.stringify(l).length).toBeLessThan(5000);                                       // instantané léger
});

test('api_live : ouvert aux visiteurs et aux joueurs, ne réveille pas les bots, courbe des 90 dernières secondes', async () => {
  await q(db, `delete from wm.config where key = 'presence'`);
  const v = await live(null);
  expect(v).toMatchObject({ v: 1, next: 10000, eclair: null });
  expect(v.t).toBeGreaterThan(Date.now() - 60000);
  expect(await q(db, `select key from wm.config where key = 'presence'`)).toEqual([]);
  const j = await live(alice, 'btc');
  expect(j.serie.length).toBeGreaterThanOrEqual(1);
  expect(j.serie.at(-1)[1]).toBe(63200);
  expect(j.serie.every(([t, p]) => typeof t === 'number' && typeof p === 'number')).toBe(true);
  expect((await live(null, 'inconnu')).serie).toEqual([]);
  for (const qui of [null, alice]) {
    for (const t of ['wm.sources', 'wm.px_dernier', 'wm.px_echantillons', 'wm.live_cache', 'wm.px_actifs', 'wm.donnees_boucle'])
      expect(await refus(db, qui, `select * from ${t}`), t).toMatch(/permission denied/);
    for (const f of [`public.srv_cours_ingerer('{}'::jsonb)`, 'public.srv_donnees_config()', `public.srv_donnees_bail(gen_random_uuid(), 60)`,
                     `wm.live_cours_refaire()`, `wm.marche_ouvert('NYSE')`])
      expect(await refus(db, qui, 'select ' + f), f).toMatch(/permission denied/);
  }
});

test('bail : une seule boucle de collecte à la fois ; elle le rend en partant', async () => {
  const [{ a }] = await q(db, 'select gen_random_uuid() as a'); const [{ b }] = await q(db, 'select gen_random_uuid() as b');
  expect(await srv('public.srv_donnees_bail($1, 70)', [a])).toBe(true);
  expect(await srv('public.srv_donnees_bail($1, 70)', [b])).toBe(false);                     // une autre boucle tourne
  expect(await srv('public.srv_donnees_bail($1, 70)', [a])).toBe(true);                      // la même boucle renouvelle
  await ingerer({ porteur: a });
  expect((await q(db, 'select passes from wm.donnees_boucle'))[0].passes).toBe(1);
  expect(await srv('public.srv_donnees_bail($1, 0)', [a])).toBe(true);                       // rendu
  expect(await srv('public.srv_donnees_bail($1, 70)', [b])).toBe(true);
  expect(await srv('public.srv_donnees_bail(null, 70)')).toBe(false);
});

test('configuration d’une boucle : sources et compteurs du jour, actifs et symboles, places ouvertes', async () => {
  const c = await srv('public.srv_donnees_config()');
  expect(c.reglages).toEqual({ actif: true, cadence_s: 3, boucle_s: 55 });
  expect(c.sources.map(s => s.id)).toEqual(expect.arrayContaining(['binance', 'kraken', 'coinbase', 'coingecko', 'finnhub', 'yahoo', 'eodhd',
    'twelvedata', 'goldapi', 'goldprice', 'fawaz', 'exchangerate', 'frankfurter', 'eia', 'fred']));
  const fh = c.sources.find(s => s.id === 'finnhub');
  expect(fh).toMatchObject({ cle_requise: true, secret: 'FINNHUB_API_KEY', quota_min: 40, rangs: { actions_us: 1 } });
  expect(JSON.stringify(c)).not.toMatch(/[0-9a-f]{64}/);                                    // aucune valeur de secret
  expect(c.actifs.find(a => a.id === 'btc')).toMatchObject({ famille: 'crypto', marche: 'CRYPTO', ouvert: true, symboles: { binance: 'BTCUSDT', kraken: 'XBTUSD' } });
  expect(c.marches.CRYPTO).toBe(true);
  expect(c.actifs).toHaveLength(37);
});

test('panneau : l’équipe voit l’état des sources ; couper une source est journalisé et s’annule ; un joueur est refusé', async () => {
  const e = await eq(chef, 'sources_etat');
  expect(e.sources.find(s => s.id === 'finnhub')).toMatchObject({ etat: 'inactif', secret: 'FINNHUB_API_KEY', cle_requise: true });
  expect(e.sources.find(s => s.id === 'eodhd')).toMatchObject({ quota_jour: 20, plafond_jour: 10 });
  expect(e.marches.find(m => m.id === 'NYSE')).toHaveProperty('rouvre');
  expect(e.boucle).toHaveProperty('passes');
  expect(await eqNon(alice, 'sources_etat')).toMatch(/interdit/);
  expect(await eqNon(chef, 'source_activer', { id: 'kraken', actif: false })).toMatch(/motif_requis/);
  const x = await eq(chef, 'source_activer', { id: 'kraken', actif: false, motif: 'essai de coupure' });
  expect(x.sources.find(s => s.id === 'kraken')).toMatchObject({ actif: false, etat: 'inactif', raison: 'desactivee' });
  expect(await eqNon(chef, 'source_activer', { id: 'kraken', actif: false, motif: 'encore' })).toMatch(/reglage_inchange/);
  expect(await eqNon(chef, 'source_activer', { id: 'nulle', actif: true, motif: 'essai' })).toMatch(/source_inconnue/);
  expect(await eqNon(chef, 'source_activer', { id: 'kraken', actif: 'non', motif: 'essai' })).toMatch(/requete/);
  const [j] = await q(db, `select id, action, cible_type, cible, avant, apres from wm.journal where action = 'source_activer' order by id desc limit 1`);
  expect(j).toMatchObject({ cible_type: 'source', cible: 'kraken', avant: { actif: true }, apres: { actif: false } });
  await eq(chef, 'journal_annuler', { id: j.id, motif: 'fin de l’essai' });
  expect((await source('kraken')).actif).toBe(true);
  expect(await refus(db, alice, `select wm.eq_sources_etat($1::uuid, '{}'::jsonb)`, [alice])).toMatch(/permission denied/);
});
