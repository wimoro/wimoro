// Rédaction des propositions du jour : matchs (ouverts d'office, factuels), sujets d'actualité (à valider par l'équipe),
// rédigés par une IA (réponse JSON contrôlée strictement) ou, sans clé, par des gabarits. Module pur, testé sous Node.
export const CATEGORIES = ['crypto', 'bourse', 'economie', 'politique', 'sport', 'tech', 'culture'];
const INTERDITS = /[<`\\]/;

export const COMPETITIONS = {
  PL: { nom: 'Premier League', url: 'https://www.premierleague.com', moteur: 'Football' },
  PD: { nom: 'LaLiga', url: 'https://www.laliga.com', moteur: 'Football' }, LIGA: { nom: 'LaLiga', url: 'https://www.laliga.com', moteur: 'Football' },
  SA: { nom: 'Lega Serie A', url: 'https://www.legaseriea.it', moteur: 'Football' },
  BL: { nom: 'Bundesliga (et OpenLigaDB)', url: 'https://www.bundesliga.com', moteur: 'Football' }, BL1: { nom: 'Bundesliga', url: 'https://www.bundesliga.com', moteur: 'Football' },
  FL1: { nom: 'Ligue 1', url: 'https://ligue1.com', moteur: 'Football' }, L1: { nom: 'Ligue 1', url: 'https://ligue1.com', moteur: 'Football' },
  CL: { nom: 'UEFA', url: 'https://www.uefa.com/uefachampionsleague/', moteur: 'Football' }, UCL: { nom: 'UEFA', url: 'https://www.uefa.com/uefachampionsleague/', moteur: 'Football' },
  NBA: { nom: 'NBA', url: 'https://www.nba.com', moteur: 'Sport' },
};

export const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const court = (nom, n) => { const s = String(nom).replace(/^(FC|SV|AC|AS|SC|VfB|VfL|TSG|1\. FC|RB|Borussia|Real|Olympique|Stade)\s+/i, '').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '.' : s; };
const iso = t => new Date(t).toISOString().replace('.000Z', 'Z');
const hm = t => new Date(t).toISOString().slice(11, 16);

/** Critère d'un match dans les trois langues (le même que celui des matchs du catalogue initial). */
export function critereMatch(sport, dom, ext, debut) {
  const h = hm(debut);
  if (sport === 'nba') return {
    fr: `Vainqueur du match ${ext} – ${dom}, prolongations comprises. Match reporté de plus de 48 heures ou arrêté sans résultat officiel : marché annulé et mises remboursées. Les mises ferment au début du match (${h} UTC).`,
    en: `Winner of the ${ext} – ${dom} game, overtime included. If the game is postponed by more than 48 hours or abandoned without an official result, the market is cancelled and stakes are refunded. Betting closes at tip-off (${h} UTC).`,
    he: `המנצחת במשחק ${ext} – ${dom}, כולל הארכות. משחק שנדחה ביותר מ-48 שעות או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים. ההימורים נסגרים בתחילת המשחק (${h} UTC).` };
  return {
    fr: `Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de ${dom}, match nul ou victoire de ${ext}. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (${h} UTC).`,
    en: `Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): ${dom} win, draw or ${ext} win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (${h} UTC).`,
    he: `התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של ${dom}, תיקו או ניצחון של ${ext}. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (${h} UTC).` };
}

/** Un match → une proposition « auto » : elle s'ouvre d'elle-même 48 h avant le coup d'envoi (fait vérifiable, pas d'avis). */
export function brouillonMatch(m) {
  const comp = COMPETITIONS[m.competition] || { nom: m.competition || 'Sport', url: null, moteur: m.sport === 'nba' ? 'Sport' : 'Football' };
  const dom = m.dom.nom, ext = m.ext.nom, jour = iso(m.debut).slice(0, 10);
  const id = `${slug(m.competition || m.sport).slice(0, 4)}-${slug(court(dom, 12)).slice(0, 3)}-${slug(court(ext, 12)).slice(0, 3)}-${jour}`;
  const lib = `${court(dom, 10)} – ${court(ext, 10)}`.slice(0, 24);
  const nba = m.sport === 'nba';
  const options = nba
    ? [{ code: 'away', noms: { fr: ext, en: ext, he: ext }, p0: 50 }, { code: 'home', noms: { fr: dom, en: dom, he: dom }, p0: 50 }]
    : [{ code: 'home', noms: { fr: dom, en: dom, he: dom }, p0: 45 }, { code: 'draw', noms: { fr: 'Match nul', en: 'Draw', he: 'תיקו' }, p0: 27 },
       { code: 'away', noms: { fr: ext, en: ext, he: ext }, p0: 28 }];
  const crit = critereMatch(m.sport, dom, ext, m.debut);
  const ids = { [m.id.split(':')[0] === 'oldb' ? 'openligadb' : m.id.split(':')[0]]: Number(m.id.split(':')[1]) || m.id.split(':')[1] };
  const brouillon = {
    id, nature: 'options', categorie: 'sport', moteur_cat: comp.moteur, origine: 'sport',
    textes: {
      fr: { q: nba ? `Qui va gagner : ${ext} ou ${dom} ?` : `Qui va gagner : ${dom}, match nul ou ${ext} ?`, court: lib, critere: crit.fr },
      en: { q: nba ? `Who will win: ${ext} or ${dom}?` : `Who will win: ${dom}, draw, or ${ext}?`, court: lib, critere: crit.en },
      he: { q: nba ? `מי תנצח: ${ext} או ${dom}?` : `מי תנצח: ${dom}, תיקו או ${ext}?`, court: lib, critere: crit.he },
    },
    options, ferme_at: iso(m.debut), resolution_at: iso(m.debut + (nba ? 180 : 125) * 60000),
    source: comp.url ? { nom: comp.nom, url: comp.url } : null,
    regle: { type: 'match', sport: m.sport, competition: m.competition, debut: iso(m.debut), dom, ext, ...ids, ...(nba ? {} : { lh: 1.45, la: 1.15 }) },
    lien: { match: { sport: m.sport, competition: m.competition, debut: iso(m.debut), ...ids } },
    p0_justif: nba ? 'Gabarit : 50 / 50 faute de cote publiée.' : 'Gabarit : moyenne historique des championnats (45 / 27 / 28), à ajuster par l’équipe.',
  };
  return { origine: 'sport', etat: 'auto', cle: 'match:' + m.id, brouillon, sources: [{ source: m.source, id: m.id }], score: nba ? 1 : 2,
    ouvre_at: iso(m.debut - 48 * 3600e3), expire_at: iso(m.debut) };
}

/** Catégorie d'un sujet d'après ses mots (repli : politique). */
export function categorieDe(t) {
  const s = slug(t);
  const R = [['crypto', /bitcoin|crypto|ether|solana|stablecoin|binance|coinbase|blockchain/], ['bourse', /stock|nasdaq|s-p-500|dow|ipo|bourse|action|shares|earnings|cac-40/],
    ['economie', /inflation|fed|ecb|bce|taux|rate|gdp|pib|budget|tariff|chomage|unemployment|recession|oil|petrole/],
    ['sport', /match|league|ligue|cup|coupe|nba|nfl|tennis|football|soccer|olymp|championnat|grand-prix/],
    ['tech', /ai-|-ai|intelligence-artificielle|openai|google|apple|microsoft|nvidia|spacex|tesla|iphone|chip|robot|software/],
    ['culture', /film|movie|box-office|album|game|jeu|festival|oscar|grammy|series|serie|music|musique/],
    ['politique', /election|vote|president|minister|ministre|government|gouvernement|parliament|parlement|senate|congress/]];
  for (const [c, re] of R) if (re.test(s)) return c;
  return 'politique';
}

/** Les sujets du jour : titres d'actualité dédoublonnés, sans sujets exclus, classés par recoupement avec les tendances. */
export function choisirSujets(nouvelles, tendances, exclus, n) {
  const ex = (exclus || []).map(x => slug(x)).filter(Boolean);
  const vus = new Set(), out = [];
  const termes = (tendances || []).map(t => slug(t.terme)).filter(Boolean);
  for (const x of nouvelles || []) {
    const s = slug(x.titre);
    if (!s || ex.some(e => s.includes(e))) continue;
    const cle = s.split('-').filter(w => w.length > 3).slice(0, 6).join('-');
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    const mots = new Set(s.split('-').filter(w => w.length > 4));
    const recoupe = termes.filter(t => t.split('-').some(w => mots.has(w))).length;
    out.push({ ...x, cle: 'sujet:' + cle.slice(0, 80), categorie: categorieDe(x.titre), poids: 1 + recoupe + (x.source === 'currents' ? 1 : 0) });
  }
  return out.sort((a, b) => b.poids - a.poids).slice(0, n);
}

/** Sans IA : un brouillon « à rédiger » ; l'équipe écrit la question et le critère dans les trois langues. */
export function brouillonSujet(s) {
  return { origine: 'gabarit', etat: 'en_attente', cle: s.cle, score: s.poids,
    brouillon: { a_rediger: true, categorie: s.categorie, origine: 'actu', sujet: { titre: s.titre, url: s.url, langue: s.langue } },
    sources: [{ source: s.source, url: s.url, titre: s.titre }] };
}

/** La consigne envoyée à l'IA (un seul appel par jour, réponse en JSON). */
export function promptIA(sujets, jour) {
  return {
    system: 'Tu rédiges des marchés de prédiction pour Wimoro, un jeu sans argent réel. Chaque marché porte sur un fait futur, vérifiable par une '
      + 'source officielle, à une date précise. Questions neutres, sans opinion ; jamais de décès, de violence, d\'attentat, de santé d\'une '
      + 'personne, de mineur ni de sujet déjà tranché. Trois langues : français, anglais, hébreu moderne (sigles avec ״). Réponds par un objet '
      + 'JSON {"marches": [...]} ; chaque marché : {"sujet_url", "categorie" (crypto, bourse, economie, politique, sport, tech ou culture), '
      + '"textes": {"fr"|"en"|"he": {"q" (question, 200 caractères au plus, finit par ?), "court" (24 caractères au plus), "critere" '
      + '(règle de résolution précise : source, date et heure UTC, cas de report)}}, "ferme_at" (ISO 8601 UTC, fin des mises), "resolution_at", '
      + '"p0" (probabilité de oui, 1 à 99) ou "options" [{"code", "noms": {"fr","en","he"}, "p0"}] (2 à 8, total 100), '
      + '"source": {"nom", "url"}, "p0_justif" (une phrase)}. N\'utilise jamais les caractères < ` ou \\.',
    user: `Date du jour : ${jour}. Sujets d'actualité (titre, lien) :\n` + sujets.map((s, i) => `${i + 1}. ${s.titre} — ${s.url || 'sans lien'}`).join('\n')
      + '\nPropose au plus un marché par sujet ; ignore un sujet qui ne donne pas de marché vérifiable.',
  };
}

const texteOk = (t, max, min = 1) => typeof t === 'string' && t.trim().length >= min && t.trim().length <= max && !INTERDITS.test(t) && !/[\x00-\x1f]/.test(t);

/** Contrôle strict de la réponse de l'IA : schéma, longueurs, catégories, dates, probabilités, source. */
export function validerIA(obj, maintenant) {
  const ok = [], refus = [];
  for (const m of Array.isArray(obj?.marches) ? obj.marches.slice(0, 20) : []) {
    const r = raison => refus.push({ raison, sujet: m?.sujet_url ?? null });
    if (!CATEGORIES.includes(m?.categorie)) { r('categorie'); continue; }
    const t = m.textes || {};
    if (!['fr', 'en', 'he'].every(l => t[l] && texteOk(t[l].q, 200, 10) && texteOk(t[l].court, 24, 3) && texteOk(t[l].critere, 1500, 20))) { r('textes'); continue; }
    if (!/\p{Script=Hebrew}/u.test(t.he.q)) { r('hebreu'); continue; }
    const f = Date.parse(m.ferme_at), z = Date.parse(m.resolution_at || m.ferme_at);
    if (!(f > maintenant + 2 * 86400e3 && f < maintenant + 400 * 86400e3 && z >= f)) { r('dates'); continue; }
    if (!(m.source && typeof m.source.url === 'string' && /^https:\/\/[^\s<>"`\\]+$/.test(m.source.url) && texteOk(m.source.nom, 120))) { r('source'); continue; }
    let options = null, p0 = null;
    if (Array.isArray(m.options)) {
      const s = m.options.reduce((a, o) => a + Number(o.p0), 0);
      if (m.options.length < 2 || m.options.length > 8 || !(s >= 90 && s <= 110)
          || !m.options.every(o => /^[a-z0-9]{1,10}$/.test(o.code) && ['fr', 'en', 'he'].every(l => texteOk(o.noms?.[l], 40)) && Number(o.p0) > 0)) { r('options'); continue; }
      options = m.options.map(o => ({ code: o.code, noms: { fr: o.noms.fr.trim(), en: o.noms.en.trim(), he: o.noms.he.trim() }, p0: Number(o.p0) }));
    } else {
      p0 = Number(m.p0);
      if (!(p0 >= 1 && p0 <= 99)) { r('p0'); continue; }
    }
    const id = (slug(t.en.court).slice(0, 22) + '-' + new Date(f).toISOString().slice(0, 7)).replace(/^-+/, '');
    ok.push({ origine: 'ia', etat: 'en_attente', cle: 'sujet:' + slug(m.sujet_url || t.fr.q).slice(0, 80), score: 1,
      brouillon: { id, nature: options ? 'options' : 'binaire', categorie: m.categorie, origine: 'actu', textes: {
        fr: { q: t.fr.q.trim(), court: t.fr.court.trim(), critere: t.fr.critere.trim() }, en: { q: t.en.q.trim(), court: t.en.court.trim(), critere: t.en.critere.trim() },
        he: { q: t.he.q.trim(), court: t.he.court.trim(), critere: t.he.critere.trim() } },
        ferme_at: new Date(f).toISOString(), resolution_at: new Date(z).toISOString(), source: { nom: m.source.nom.trim(), url: m.source.url },
        ...(options ? { options } : { p0 }), p0_justif: texteOk(m.p0_justif, 600) ? m.p0_justif.trim() : 'Rédigé par l’IA, à vérifier.' },
      sources: [{ url: m.sujet_url || null }] });
  }
  return { ok, refus };
}
