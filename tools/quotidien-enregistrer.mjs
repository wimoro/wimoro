// Enregistre de vraies réponses des sources sans clé de la tâche quotidienne, pour les tests (tests/quotidien.spec.mjs).
//
// Les tests n'appellent JAMAIS une vraie API : ils lisent ces réponses enregistrées. Cet outil ne sert qu'à les renouveler,
// à la main, si une source change de format :   node tools/quotidien-enregistrer.mjs tests/fixtures/quotidien
// Il n'appelle que des adresses publiques sans clé, avec l'identifiant honnête de Wimoro. Une quinzaine d'appels. Les
// sources à clé (Currents, football-data.org, API-Sports, balldontlie, Groq) ont leurs réponses écrites d'après leur
// documentation, dans le même dossier (fichiers *_doc.json).
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) { console.error('usage : node tools/quotidien-enregistrer.mjs <dossier de sortie>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const UA = 'WimoroBot/1.0 (https://wimoro.com)';
const j = new Date().toISOString().slice(0, 10).split('-');
const enc = encodeURIComponent;
const commons = f => 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=1&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=250&titles=' + enc(f);
const cibles = [
  ['wikipedia_en.json', `https://en.wikipedia.org/api/rest_v1/feed/featured/${j[0]}/${j[1]}/${j[2]}`],
  ['wikipedia_fr.json', `https://fr.wikipedia.org/api/rest_v1/feed/featured/${j[0]}/${j[1]}/${j[2]}`],
  ['wikipedia_he.json', `https://he.wikipedia.org/api/rest_v1/feed/featured/${j[0]}/${j[1]}/${j[2]}`],
  ['hackernews.json', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30'],
  ['tendances_a.json', 'https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=20'],
  ['tendances_b.json', 'https://api.manifold.markets/v0/search-markets?sort=24-hour-vol&filter=open&limit=20'],
  ['openligadb_groupe.json', 'https://api.openligadb.de/getcurrentgroup/bl1'],
  ['openligadb_journee.json', 'https://api.openligadb.de/getmatchdata/bl1/2026/10'],
  ['openligadb_match.json', 'https://api.openligadb.de/getmatchdata/83242'],
  ['commons_bitcoin.json', commons('File:Bitcoin.svg')],
  ['commons_nyse.json', commons('File:NYSE127.jpg')],
  ['commons_atalanta.json', commons('File:Atalanta BC.png')],
  ['commons_absent.json', commons('File:Atalanta BC logo.svg')],
];
const journal = { enregistre_le: new Date().toISOString(), ua: UA, appels: [] };
for (const [nom, url] of cibles) {
  const t0 = Date.now();
  try {
    const rep = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    let texte = await rep.text();
    // le flux de Wikipédia est gros : on ne garde que ce que lisent les lecteurs (actualités, articles les plus lus)
    const lien = a => ({ title: a.title, normalizedtitle: a.normalizedtitle, views: a.views, content_urls: { desktop: { page: a.content_urls?.desktop?.page } } });
    if (nom.startsWith('wikipedia_') && rep.ok) {
      const x = JSON.parse(texte);
      texte = JSON.stringify({ news: (x.news || []).map(n => ({ story: n.story, links: (n.links || []).slice(0, 3).map(lien) })),
        mostread: x.mostread ? { date: x.mostread.date, articles: (x.mostread.articles || []).slice(0, 30).map(lien) } : undefined });
    }
    // les événements des marchés publics sont très gros : seulement les champs lus
    if (nom === 'tendances_a.json' && rep.ok) texte = JSON.stringify(JSON.parse(texte).map(e => ({ id: e.id, slug: e.slug, title: e.title, endDate: e.endDate, volume24hr: e.volume24hr })));
    if (nom === 'tendances_b.json' && rep.ok) texte = JSON.stringify(JSON.parse(texte).map(m => ({ id: m.id, question: m.question, closeTime: m.closeTime, volume24Hours: m.volume24Hours })));
    fs.writeFileSync(path.join(OUT, nom), texte);
    journal.appels.push({ nom, url, statut: rep.status, octets: texte.length, ms: Date.now() - t0 });
    console.log(rep.status, nom, texte.length);
  } catch (e) {
    journal.appels.push({ nom, url, erreur: String(e && e.message || e), ms: Date.now() - t0 });
    console.log('ERREUR', nom, e && e.message);
  }
  await new Promise(ok => setTimeout(ok, 400));
}
fs.writeFileSync(path.join(OUT, '_journal.json'), JSON.stringify(journal, null, 2) + '\n');
