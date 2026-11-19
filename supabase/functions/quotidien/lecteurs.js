// Lecteurs de la tâche quotidienne : réponse d'une source → données simples. Module pur (aucun appel réseau), testé sous
// Node sur des réponses enregistrées (tests/fixtures/quotidien/, outil tools/quotidien-enregistrer.mjs). Jamais d'exception :
// une réponse illisible donne une liste vide.

const sansBalises = s => String(s ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '‹').replace(/&gt;/g, '›').replace(/\s+/g, ' ').trim();
export const nettoyer = sansBalises;
const liste = x => (Array.isArray(x) ? x : []);
const date = s => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };

/** Wikipédia, flux « featured » (en, fr, he) : les actualités (« In the news ») et les articles les plus lus. */
export function wikipediaUne(json, langue) {
  const nouvelles = liste(json?.news).map(n => {
    const lien = liste(n.links)[0] || {};
    return { titre: sansBalises(n.story), sujet: lien.normalizedtitle || lien.title || null, url: lien.content_urls?.desktop?.page || null, langue, source: 'wikipedia' };
  }).filter(n => n.titre.length > 10);
  const lus = liste(json?.mostread?.articles).slice(0, 25).map(a => ({ terme: a.normalizedtitle || a.title, vues: a.views | 0, url: a.content_urls?.desktop?.page || null, langue, source: 'wikipedia' }))
    .filter(a => a.terme && !/^(Main_Page|Accueil|Special:|Spécial:|עמוד_ראשי)/.test(a.terme));
  return { nouvelles, lus };
}

/** Hacker News (Algolia, page d'accueil) : titres de la tech. */
export function hackerNews(json) {
  return liste(json?.hits).map(h => ({ titre: sansBalises(h.title), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points | 0, langue: 'en', source: 'hackernews' }))
    .filter(h => h.titre.length > 5);
}

/** Currents (clé CURRENTS_API_KEY) : gros titres avec lien. */
export function currents(json) {
  if (json?.status && json.status !== 'ok') return [];
  return liste(json?.news).map(n => ({ titre: sansBalises(n.title), url: n.url || null, langue: n.language || null, publie: date(String(n.published || '').replace(' +0000', 'Z').replace(' ', 'T')),
    categories: liste(n.category), source: 'currents' })).filter(n => n.titre.length > 10);
}

/** Polymarket Gamma (événements ouverts les plus échangés) : sujets tendance, jamais nommés dans le produit. */
export function polymarketEvenements(json) {
  return liste(json).map(e => ({ terme: sansBalises(e.title), fin: date(e.endDate), volume: Number(e.volume24hr) || 0, source: 'polymarket' }))
    .filter(e => e.terme.length > 5);
}

/** Manifold (marchés ouverts les plus échangés) : sujets tendance, usage interne seulement. */
export function manifoldMarches(json) {
  return liste(json).map(m => ({ terme: sansBalises(m.question), fin: Number(m.closeTime) || null, volume: Number(m.volume24Hours) || 0, source: 'manifold' }))
    .filter(m => m.terme.length > 5);
}

const statutFd = s => ({ SCHEDULED: 'prevu', TIMED: 'prevu', IN_PLAY: 'en_cours', PAUSED: 'en_cours', LIVE: 'en_cours', FINISHED: 'termine', AWARDED: 'termine',
  POSTPONED: 'reporte', SUSPENDED: 'reporte', CANCELLED: 'annule' }[s] || 'prevu');

/** football-data.org v4 (clé FOOTBALL_DATA_API_KEY) : matchs, statut, score à la fin du temps réglementaire. */
export function footballData(json) {
  return liste(json?.matches).map(m => {
    const fin = m.score?.regularTime ?? m.score?.fullTime ?? {};
    return { id: 'fd:' + m.id, sport: 'foot', competition: m.competition?.code || null, debut: date(m.utcDate), dom: { nom: m.homeTeam?.name, id: m.homeTeam?.id },
      ext: { nom: m.awayTeam?.name, id: m.awayTeam?.id }, statut: statutFd(m.status), score_dom: fin.home ?? null, score_ext: fin.away ?? null, minute: m.minute ?? null, source: 'football-data.org' };
  }).filter(m => m.debut && m.dom.nom && m.ext.nom);
}

const statutAs = s => (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(s) ? 'termine' : ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(s) ? 'en_cours'
  : ['PST', 'SUSP'].includes(s) ? 'reporte' : ['CANC', 'ABD'].includes(s) ? 'annule' : 'prevu');
/** API-Sports, API-Football (clé APISPORTS_API_KEY) : score à la fin du temps réglementaire (fulltime), minute en direct. */
export function apiSports(json) {
  return liste(json?.response).map(r => ({ id: 'as:' + r.fixture?.id, sport: 'foot', competition: r.league?.name || null, debut: date(r.fixture?.date),
    dom: { nom: r.teams?.home?.name, id: r.teams?.home?.id }, ext: { nom: r.teams?.away?.name, id: r.teams?.away?.id }, statut: statutAs(r.fixture?.status?.short),
    score_dom: r.score?.fulltime?.home ?? (statutAs(r.fixture?.status?.short) === 'en_cours' ? r.goals?.home ?? null : null),
    score_ext: r.score?.fulltime?.away ?? (statutAs(r.fixture?.status?.short) === 'en_cours' ? r.goals?.away ?? null : null),
    minute: r.fixture?.status?.elapsed ?? null, source: 'api-sports' })).filter(m => m.debut && m.dom.nom);
}

/** balldontlie (clé BALLDONTLIE_API_KEY) : matchs NBA ; « Final » = terminé (prolongations comprises). */
export function balldontlie(json) {
  return liste(json?.data).map(g => {
    const st = String(g.status || '');
    const statut = /^final/i.test(st) ? 'termine' : g.period > 0 ? 'en_cours' : 'prevu';
    return { id: 'bdl:' + g.id, sport: 'nba', competition: 'NBA', debut: date(g.datetime || g.date), dom: { nom: g.home_team?.full_name, id: g.home_team?.id },
      ext: { nom: g.visitor_team?.full_name, id: g.visitor_team?.id }, statut, score_dom: statut === 'prevu' ? null : g.home_team_score ?? null,
      score_ext: statut === 'prevu' ? null : g.visitor_team_score ?? null, minute: g.period ? Math.min(48, (g.period - 1) * 12 + 6) : null, source: 'balldontlie' };
  }).filter(m => m.debut && m.dom.nom);
}

/** OpenLigaDB (Bundesliga, sans clé, données sous licence ODbL) : résultat final = résultat de type 2 (« Endergebnis »). */
export function openLigaDb(json) {
  return liste(Array.isArray(json) ? json : json ? [json] : []).map(m => {
    const fin = liste(m.matchResults).find(r => r.resultTypeID === 2) || null;
    const buts = liste(m.goals).sort((a, b) => (a.matchMinute ?? 0) - (b.matchMinute ?? 0)).at(-1);
    const debut = date(m.matchDateTimeUTC);
    const enCours = !m.matchIsFinished && debut && Date.now() > debut && Date.now() < debut + 2.5 * 3600e3;
    return { id: 'oldb:' + m.matchID, sport: 'foot', competition: 'BL', debut, dom: { nom: m.team1?.teamName, id: m.team1?.teamId }, ext: { nom: m.team2?.teamName, id: m.team2?.teamId },
      statut: m.matchIsFinished ? (fin ? 'termine' : 'prevu') : enCours ? 'en_cours' : 'prevu',
      score_dom: fin ? fin.pointsTeam1 : buts ? buts.scoreTeam1 : enCours ? 0 : null, score_ext: fin ? fin.pointsTeam2 : buts ? buts.scoreTeam2 : enCours ? 0 : null,
      minute: enCours && buts ? buts.matchMinute ?? null : null, source: 'openligadb' };
  }).filter(m => m.debut && m.dom.nom);
}

/** Groq ou tout service compatible OpenAI (réponse JSON) : le contenu du message, lu comme JSON. */
export function reponseIA(json) {
  const t = json?.choices?.[0]?.message?.content ?? json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  if (typeof t !== 'string') return null;
  try { return JSON.parse(t.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')); } catch (_) { return null; }
}

/** Wikimedia Commons, imageinfo : adresse de la vignette et crédit (titre, auteur, licence, adresse). */
export function commonsImage(json) {
  const page = Object.values(json?.query?.pages || {})[0];
  const ii = page?.imageinfo?.[0];
  if (!page || page.missing !== undefined || !ii) return null;
  const m = ii.extmetadata || {};
  const v = k => (m[k]?.value != null ? sansBalises(m[k].value) : null);
  return { titre: page.title, vignette: ii.thumburl || null, largeur: ii.thumbwidth || ii.width || null, hauteur: ii.thumbheight || ii.height || null, mime: ii.thumbmime || ii.mime,
    credit: { titre: (v('ObjectName') || page.title.replace(/^File:/, '')).slice(0, 200), auteur: (v('Artist') || 'Inconnu').slice(0, 200), licence: v('LicenseShortName'),
      licence_url: v('LicenseUrl'), source: 'Wikimedia Commons', url: ii.descriptionurl || null, restrictions: v('Restrictions') || null } };
}
