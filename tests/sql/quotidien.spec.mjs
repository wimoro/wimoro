// Marchés réels, lot 11 : la file des propositions du jour (matchs ouverts d'office 48 h avant, sujets validés par l'équipe),
// les scores des matchs, la copie des images, les sources de la tâche quotidienne, et ses actions dans le panneau.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { creerBase, creerJoueur, q, refus, semer } from './base.mjs';
import * as L from '../../supabase/functions/quotidien/lecteurs.js';
import * as R from '../../supabase/functions/quotidien/redaction.js';

test.describe.configure({ mode: 'serial' });
let db, admin, alice;
const json = n => JSON.parse(fs.readFileSync('tests/fixtures/quotidien/' + n, 'utf8'));
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  admin = await creerJoueur(db, 'chef_jour', 0); alice = await creerJoueur(db, 'alice_jour', 100);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [admin]);
});
test.afterAll(async () => { await db.close(); });
async function comme(uid, sql, params) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql, params)).rows;
  });
}
const eq = (qui, action, p = {}) => comme(qui, 'select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)]).then(r => r[0].r);
const eqNon = (qui, action, p = {}) => eq(qui, action, p).then(() => null, e => e.message);

test('les sources de la tâche sont là, inactives sans clé ; les fonctions srv_ sont fermées aux joueurs', async () => {
  const s = await q(db, `select id, cle_requise, secret from wm.sources where id in ('currents', 'groq', 'gemini', 'football_data', 'apisports', 'balldontlie', 'openligadb', 'wikipedia', 'hackernews', 'commons') order by id`);
  expect(s.length).toBe(10);
  expect(s.filter(x => x.cle_requise).map(x => x.secret).sort()).toEqual(['APISPORTS_API_KEY', 'BALLDONTLIE_API_KEY', 'CURRENTS_API_KEY', 'FOOTBALL_DATA_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY']);
  for (const f of ['srv_quotidien_config()', `srv_quotidien_enregistrer('{}'::jsonb)`, `srv_sport_maj('{}'::jsonb)`, 'srv_images_a_copier(8)', `srv_image_enregistrer('{}'::jsonb)`])
    expect(await refus(db, alice, 'select public.' + f), f).toMatch(/permission denied/);
  const cfg = (await q(db, 'select public.srv_quotidien_config() as c'))[0].c;
  expect(cfg).toMatchObject({ actif: true, ia: true, actus_max: 30, actus_ouvertes: 30, saison_bl: 2026 });
  expect(cfg.exclus).toContain('attentat');
  // [ajout] la collecte des cours (srv_donnees_config) ne voit pas ces sources ; les siennes, toutes, comme avant
  const d = (await q(db, 'select public.srv_donnees_config() as c'))[0].c.sources.map(x => x.id);
  const siennes = (await q(db, `select id from wm.sources where coalesce(config ->> 'tache', '') <> 'quotidien' order by id`)).map(x => x.id);
  expect(d).toEqual(siennes);
  expect(d.length).toBeGreaterThanOrEqual(20);
  expect(d.some(id => ['currents', 'groq', 'gemini', 'commons', 'wikipedia', 'openligadb'].includes(id))).toBe(false);
  expect((await q(db, `select count(*)::int as n from wm.sources where config ->> 'tache' = 'quotidien'`))[0].n).toBe(12);
});

test('matchs du calendrier : une proposition « auto » s’ouvre seule 48 h avant, s’il reste une place parmi les 30', async () => {
  const matchs = L.openLigaDb(json('openligadb_journee.json'));
  const props = matchs.filter(m => !['oldb:83242', 'oldb:83243'].includes(m.id)).map(R.brouillonMatch);   // les deux derbys sont déjà au catalogue
  const r = (await q(db, `select public.srv_quotidien_enregistrer($1::jsonb) as r`, [JSON.stringify({ propositions: props, matchs, sources: [{ id: 'openligadb', appels: 2, ok: true, code: 200, ms: 120 }] })]))[0].r;
  expect(r.propositions).toBe(7);
  expect((await q(db, `select public.srv_quotidien_enregistrer($1::jsonb) as r`, [JSON.stringify({ propositions: props })]))[0].r.propositions).toBe(0);   // une fois
  expect(Number((await q(db, `select count(*) from wm.sport_matchs where source = 'openligadb'`))[0].count)).toBe(9);
  expect((await q(db, `select etat, raison, appels_jour from wm.sources where id = 'openligadb'`))[0]).toMatchObject({ etat: 'direct', raison: 'ok', appels_jour: 2 });
  // le catalogue est plein (30 marchés d'actualité ouverts) : rien ne s'ouvre ; une place se libère : le plus proche s'ouvre
  await q(db, `update wm.propositions_jour set ouvre_at = now() - interval '1 minute' where etat = 'auto'`);
  await q(db, 'select wm.cycle_tick()');
  expect(Number((await q(db, `select count(*) from wm.propositions_jour where etat = 'ouverte'`))[0].count)).toBe(0);
  await q(db, `update wm.fiches set masque = true where id = 'news-sinner-ao-2027'`);
  await q(db, 'select wm.cycle_tick()');
  const o = await q(db, `select p.fiche_id, f.origine, f.cycle, f.regle from wm.propositions_jour p join wm.fiches f on f.id = p.fiche_id where p.etat = 'ouverte'`);
  expect(o.length).toBe(1);
  expect(o[0]).toMatchObject({ origine: 'sport', cycle: 'ouvert' });
  expect(o[0].regle.openligadb).toBeGreaterThan(83000);
  const j = (await q(db, `select origine, action from wm.journal where action = 'proposition_ouvrir'`))[0];
  expect(j).toEqual({ origine: 'automate', action: 'proposition_ouvrir' });
});

test('scores : un résultat final (OpenLigaDB) résout le match du catalogue avec sa valeur et sa source', async () => {
  await q(db, `update wm.fiches set ferme_at = now() - interval '3 hours', resolution_at = now() - interval '1 hour' where id = 'bl-bmg-bvb-2026-11-21'`);
  await q(db, `select public.srv_sport_maj($1::jsonb)`, [JSON.stringify({ matchs: L.openLigaDb(json('openligadb_fini_doc.json')) })]);
  await q(db, 'select wm.cycle_tick()');
  const f = (await q(db, `select cycle, resolu_issue, resolu_source, resolu_valeur from wm.fiches where id = 'bl-bmg-bvb-2026-11-21'`))[0];
  expect(f).toMatchObject({ cycle: 'resolu', resolu_issue: 'bl-bmg-bvb-2026-11-21-away', resolu_source: 'openligadb', resolu_valeur: { score: [1, 3], match: 'oldb:83242' } });
});

test('panneau : lister, rédiger un sujet, valider (le marché s’ouvre), refuser puis remettre depuis le journal', async () => {
  const nouvelles = L.currents(json('currents_doc.json'));
  const sujets = R.choisirSujets(nouvelles, [], ['otage'], 5).map(R.brouillonSujet);
  const ia = R.validerIA(L.reponseIA(json('groq_doc.json')), Date.now()).ok;
  await q(db, `select public.srv_quotidien_enregistrer($1::jsonb)`, [JSON.stringify({ propositions: [...sujets, ...ia] })]);
  const l = await eq(admin, 'propositions_liste', { etat: 'en_attente' });
  const sj = l.propositions.find(p => p.brouillon.a_rediger), pia = l.propositions.find(p => p.origine === 'ia');
  expect(sj && pia).toBeTruthy();
  expect(await eqNon(alice, 'propositions_liste')).toBe('interdit');
  // valider un sujet « à rédiger » sans textes : refusé par les contrôles de wm.fiche_creer
  expect(await eqNon(admin, 'proposition_valider', { id: sj.id, motif: 'sujet du jour' })).toBe('textes_incomplets');
  const TX = { fr: { q: 'Le Sénat votera-t-il le budget 2027 avant le 15 décembre ?', court: 'Budget voté au Sénat ?', critere: 'OUI si le Sénat adopte le texte avant le 15/12/2026 ; sinon NON.' },
    en: { q: 'Will the Senate pass the 2027 budget before December 15?', court: 'Senate passes budget?', critere: 'YES if the Senate adopts the bill before 12/15/2026; otherwise NO.' },
    he: { q: 'האם הסנאט יאשר את תקציב 2027 לפני 15 בדצמבר?', court: 'הסנאט יאשר תקציב?', critere: 'כן אם הסנאט יאשר את החוק לפני 15.12.2026; אחרת לא.' } };
  await eq(admin, 'proposition_modifier', { id: sj.id, brouillon: { id: 'senat-budget-2027', nature: 'binaire', categorie: 'politique', textes: TX, p0: 60,
    ferme_at: '2026-12-14T23:00:00Z', source: { nom: 'Sénat', url: 'https://www.senat.fr' } } });
  const v = await eq(admin, 'proposition_valider', { id: sj.id, motif: 'sujet vérifié' });
  expect(v.fiche).toMatchObject({ id: 'senat-budget-2027', st: 'ouvert', g: 'actu', c: 'politique' });
  expect((await q(db, `select etat, fiche_id, decide_par from wm.propositions_jour where id = $1`, [sj.id]))[0]).toEqual({ etat: 'ouverte', fiche_id: 'senat-budget-2027', decide_par: admin });
  await eq(admin, 'proposition_refuser', { id: pia.id, motif: 'déjà couvert' });
  expect((await q(db, `select etat from wm.propositions_jour where id = $1`, [pia.id]))[0].etat).toBe('refusee');
  const e = (await q(db, `select id from wm.journal where action = 'proposition_refuser' order by id desc limit 1`))[0].id;
  await eq(admin, 'journal_annuler', { id: e, motif: 'finalement intéressant' });
  expect((await q(db, `select etat from wm.propositions_jour where id = $1`, [pia.id]))[0].etat).toBe('en_attente');
});

test('images : lot à copier, copie enregistrée avec son crédit (api_credits), révision du catalogue ; réveil de la fonction seulement s’il y a du travail', async () => {
  await q(db, `delete from net.http_request_queue`);
  expect((await q(db, 'select wm.quotidien_reveil() as r'))[0].r.taches).toEqual(['images']);
  const req = (await q(db, `select url, convert_from(body, 'UTF8')::jsonb as b from net.http_request_queue`))[0];
  expect(req.url).toMatch(/\/functions\/v1\/quotidien$/);
  expect(req.b).toEqual({ taches: ['images'] });
  const lot = (await q(db, 'select public.srv_images_a_copier(8) as r'))[0].r;
  expect(lot.length).toBe(8);
  const btc = (await q(db, `select id from wm.images where fichier = 'File:Bitcoin.svg'`))[0].id;
  const rev0 = Number((await q(db, `select rev from wm.revisions where nom = 'catalogue'`))[0].rev);
  const credit = { titre: 'Bitcoin', auteur: 'Grayliptrot', licence: 'Public domain', source: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Bitcoin.svg' };
  await q(db, `select public.srv_image_enregistrer($1::jsonb)`, [JSON.stringify({ id: btc, etat: 'copiee', chemin: 'img/' + 'b'.repeat(64) + '.png', mime: 'image/png', largeur: 128, hauteur: 128, octets: 6012, sha256: 'b'.repeat(64), credit })]);
  expect(Number((await q(db, `select rev from wm.revisions where nom = 'catalogue'`))[0].rev)).toBe(rev0 + 1);
  const cr = (await comme(alice, 'select public.api_credits() as r'))[0].r;
  expect(cr.images).toEqual([{ i: 'img/' + 'b'.repeat(64) + '.png', credit }]);
  const cat = (await comme(alice, `select public.api_catalogue(0, 'fr') as r`))[0].r;
  expect(cat.m.find(m => m.id === 'btc-fin-decembre-2026').i).toBe('img/' + 'b'.repeat(64) + '.png');
  expect(await refus(db, alice, `select public.srv_image_enregistrer('{"id": 1, "etat": "copiee", "chemin": "../x"}'::jsonb)`)).toMatch(/permission denied/);
  let err = null; try { await q(db, `select public.srv_image_enregistrer('{"id": 1, "etat": "copiee", "chemin": "../x.png"}'::jsonb)`); } catch (e) { err = e.message; }
  expect(err).toBe('requete');
  await q(db, `update wm.images set etat = 'refusee' where etat = 'a_copier'`);
  expect((await q(db, 'select wm.quotidien_reveil() as r'))[0].r.taches).toEqual([]);
});
