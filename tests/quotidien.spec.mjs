// Tâche quotidienne (supabase/functions/quotidien/) : lecteurs, rédaction et images, testés sur de VRAIES réponses
// enregistrées le 19 nov. 2026 (tests/fixtures/quotidien/, outil tools/quotidien-enregistrer.mjs) ; les sources à clé
// (Currents, football-data.org, API-Sports, balldontlie, Groq) sur la forme de leur documentation (fichiers *_doc.json).
// Aucun test n'appelle le réseau : fetch est remplacé par une garde.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const appels = [];
globalThis.fetch = async url => { appels.push(String(url)); throw new Error('appel réseau interdit dans les tests : ' + url); };
const L = await import('../supabase/functions/quotidien/lecteurs.js');
const R = await import('../supabase/functions/quotidien/redaction.js');
const I = await import('../supabase/functions/quotidien/images.js');
const F = 'tests/fixtures/quotidien/';
const json = n => JSON.parse(fs.readFileSync(F + n, 'utf8'));
const NOW = Date.UTC(2026, 10, 19, 19, 0);

test('garde : aucun appel réseau ; les modules purs n’appellent jamais fetch, et la fonction ne nomme jamais une plateforme dans un texte servi', async () => {
  await expect(fetch('https://exemple.invalid/')).rejects.toThrow(/interdit/);
  for (const f of ['lecteurs.js', 'redaction.js', 'images.js']) expect(fs.readFileSync('supabase/functions/quotidien/' + f, 'utf8'), f).not.toMatch(/\bfetch\s*\(/);
  const red = fs.readFileSync('supabase/functions/quotidien/redaction.js', 'utf8');
  expect(red).not.toMatch(/polymarket|manifold|kalshi/i);                 // les sites de tendances restent internes
  expect(fs.readFileSync('supabase/functions/quotidien/index.ts', 'utf8')).toMatch(/imagescript@1\.3\.0/);
});

test('actualité et tendances : Wikipédia (en, fr, he), Hacker News, Currents, sites de marchés publics', () => {
  const en = L.wikipediaUne(json('wikipedia_en.json'), 'en');
  expect(en.nouvelles.length).toBeGreaterThan(0);
  expect(en.nouvelles[0]).toMatchObject({ langue: 'en', source: 'wikipedia' });
  expect(en.nouvelles.every(n => !/[<>]/.test(n.titre))).toBe(true);    // balises retirées
  expect(en.lus.length).toBe(25);
  expect(L.wikipediaUne(json('wikipedia_he.json'), 'he').lus.length).toBeGreaterThan(10);
  const hn = L.hackerNews(json('hackernews.json'));
  expect(hn.length).toBe(30);
  expect(hn[0].url).toMatch(/^https?:\/\//);
  const c = L.currents(json('currents_doc.json'));
  expect(c[0]).toMatchObject({ titre: 'Le Sénat adopte le budget 2027 en première lecture', langue: 'fr', publie: Date.UTC(2026, 10, 19, 9, 12) });
  expect(L.polymarketEvenements(json('tendances_a.json')).length).toBe(20);
  expect(L.manifoldMarches(json('tendances_b.json')).length).toBe(20);
  expect(L.wikipediaUne(null, 'fr')).toEqual({ nouvelles: [], lus: [] });   // jamais d'exception
  expect(L.hackerNews({ erreur: 1 })).toEqual([]);
});

test('sport : OpenLigaDB (journée en cours, match terminé), football-data.org, API-Sports, balldontlie', () => {
  const j = L.openLigaDb(json('openligadb_journee.json'));
  expect(j.length).toBe(9);
  const bmg = j.find(m => m.id === 'oldb:83242');
  expect(bmg).toMatchObject({ sport: 'foot', competition: 'BL', debut: Date.UTC(2026, 10, 21, 14, 30), statut: 'prevu', dom: { nom: 'Borussia Mönchengladbach', id: 87 }, ext: { nom: 'Borussia Dortmund', id: 7 } });
  expect(L.openLigaDb(json('openligadb_match.json'))[0].id).toBe('oldb:83242');
  expect(L.openLigaDb(json('openligadb_fini_doc.json'))[0]).toMatchObject({ statut: 'termine', score_dom: 1, score_ext: 3 });   // résultat de type 2 (final)
  const fd = L.footballData(json('footballdata_doc.json'));
  expect(fd.map(m => [m.id, m.statut, m.score_dom, m.score_ext])).toEqual([['fd:537001', 'prevu', null, null], ['fd:537002', 'termine', 1, 1]]);
  expect(L.apiSports(json('apisports_doc.json'))[0]).toMatchObject({ id: 'as:1208001', statut: 'termine', score_dom: 1, score_ext: 3 });
  expect(L.balldontlie(json('balldontlie_doc.json'))[0]).toMatchObject({ id: 'bdl:18447001', sport: 'nba', statut: 'termine', score_dom: 104, score_ext: 117 });
});

test('rédaction : un match devient une proposition « auto » complète (3 langues, options, règle) ; un sujet attend l’équipe', () => {
  const m = L.openLigaDb(json('openligadb_journee.json')).find(x => x.id === 'oldb:83242');
  const p = R.brouillonMatch(m);
  expect(p).toMatchObject({ origine: 'sport', etat: 'auto', cle: 'match:oldb:83242', ouvre_at: '2026-11-19T14:30:00Z', expire_at: '2026-11-21T14:30:00Z' });
  const b = p.brouillon;
  expect(b.id).toMatch(/^[a-z0-9][a-z0-9-]{2,29}$/);
  for (const l of ['fr', 'en', 'he']) { expect(b.textes[l].court.length).toBeLessThanOrEqual(24); expect(b.textes[l].critere).toContain('14:30 UTC'); }
  expect(b.textes.he.q).toMatch(/[֐-׿]/);
  expect(b.options.map(o => [o.code, o.p0])).toEqual([['home', 45], ['draw', 27], ['away', 28]]);
  expect(b.regle).toMatchObject({ type: 'match', sport: 'foot', openligadb: 83242 });
  // sujets : sans les sujets exclus (décès, violence…), dédoublonnés, classés
  const nouvelles = [...L.currents(json('currents_doc.json')), ...L.wikipediaUne(json('wikipedia_en.json'), 'en').nouvelles];
  const s = R.choisirSujets(nouvelles, L.polymarketEvenements(json('tendances_a.json')), ['otage', 'killed', 'dies'], 6);
  expect(s.length).toBeGreaterThan(0);
  expect(s.some(x => /otage/i.test(x.titre))).toBe(false);
  expect(new Set(s.map(x => x.cle)).size).toBe(s.length);
  expect(R.CATEGORIES).toContain(s[0].categorie);
  const sj = R.brouillonSujet(s[0]);
  expect(sj).toMatchObject({ origine: 'gabarit', etat: 'en_attente', brouillon: { a_rediger: true, origine: 'actu' } });
});

test('IA : la réponse JSON est contrôlée strictement (catégorie, textes, balises, dates) ; une réponse illisible ne donne rien', () => {
  const v = R.validerIA(L.reponseIA(json('groq_doc.json')), NOW);
  expect(v.ok.length).toBe(1);
  expect(v.refus.map(r => r.raison).sort()).toEqual(['categorie', 'textes']);
  const b = v.ok[0].brouillon;
  expect(b).toMatchObject({ nature: 'binaire', categorie: 'economie', p0: 40, origine: 'actu', source: { url: 'https://www.legifrance.gouv.fr' } });
  expect(v.ok[0].etat).toBe('en_attente');                                   // un sujet d'actualité attend toujours la validation
  expect(L.reponseIA(json('groq_illisible_doc.json'))).toBeNull();
  expect(R.validerIA(null, NOW)).toEqual({ ok: [], refus: [] });
  const pr = R.promptIA([{ titre: 'Un sujet', url: 'https://example.org' }], '2026-11-19');
  expect(pr.system).toMatch(/JSON/);
  expect(pr.user).toContain('https://example.org');
});

test('images : vignette Commons, licence libre, crédit ; recadrage d’une photo et logo posé au centre, en 128 × 128', () => {
  const n0 = appels.length;   // (les tests tournent en parallèle : seuls comptent les appels de celui-ci)
  const nyse = L.commonsImage(json('commons_nyse.json'));
  expect(nyse).toMatchObject({ largeur: 250, mime: 'image/jpeg', credit: { auteur: 'Ryan Lawler', licence: 'Public domain', source: 'Wikimedia Commons' } });
  expect(nyse.vignette).toMatch(/^https:\/\/thumb\.wikimedia\.org\/.*\/250px-NYSE127\.jpg/);
  expect(L.commonsImage(json('commons_absent.json'))).toBeNull();
  expect(I.licenceLibre({ licence: 'CC BY-SA 4.0' })).toBe(true);
  expect(I.licenceLibre({ licence: 'Public domain' })).toBe(true);
  expect(I.licenceLibre({ licence: 'CC BY-NC 4.0' })).toBe(false);
  expect(I.licenceLibre({ licence: 'Fair use' })).toBe(false);
  expect(I.LARGEURS).toContain(I.largeurPour('logo'));
  expect(I.LARGEURS).toContain(I.largeurPour('photo'));
  expect(I.urlImageinfo('File:Bitcoin.svg', 250)).toContain('iiurlwidth=250&titles=File%3ABitcoin.svg');
  // photo 250 × 188 rouge : recadrée en carré au centre, entièrement couverte
  const ph = new Uint8ClampedArray(250 * 188 * 4); for (let i = 0; i < ph.length; i += 4) { ph[i] = 200; ph[i + 3] = 255; }
  const v1 = I.vignette(ph, 250, 188, 'photo');
  expect(v1.length).toBe(128 * 128 * 4);
  expect([v1[0], v1[3], v1[v1.length - 4], v1[v1.length - 1]]).toEqual([200, 255, 200, 255]);
  // logo 250 × 125 opaque : réduit à 120 × 60, posé au centre d'un carré transparent
  const lg = new Uint8ClampedArray(250 * 125 * 4).fill(255);
  const v2 = I.vignette(lg, 250, 125, 'logo');
  expect(v2[3]).toBe(0);                                                    // coin transparent
  expect(v2[(64 * 128 + 64) * 4 + 3]).toBe(255);                            // centre opaque
  expect(I.aplatir(v2)[3]).toBe(255);
  expect(I.nomFichier('a'.repeat(64), 'image/png')).toBe('img/' + 'a'.repeat(64) + '.png');
  expect(appels.slice(n0)).toEqual([]);
});
