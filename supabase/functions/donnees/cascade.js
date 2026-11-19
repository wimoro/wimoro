// Cascade de la collecte : quelle source appeler, quand, et ce qu'on fait de sa réponse.
//
// Module pur : le réseau (fonction `chercher`) et l'horloge (`now`) sont passés en paramètres. L'Edge Function « donnees »
// l'utilise tel quel ; tests/donnees-cascade.spec.mjs le teste sous Node avec des réponses enregistrées (jamais le réseau).
//
// Règles :
//   * chaque famille (crypto, actions US, indices, actions européennes, métaux, devises, pétrole) a ses sources, rangées par
//     rang (wm.sources.rangs) : on appelle la première UTILISABLE (active, clé présente si elle en demande une, pas en pause,
//     quota du jour et de la minute respectés) ; si elle échoue ou n'a pas tout donné, la suivante, dans le même passage ;
//   * un actif n'est rafraîchi qu'au rythme de la meilleure source utilisable de sa famille (15 minutes au plus quand sa
//     place est fermée) ; une source n'est jamais appelée plus souvent que sa cadence ni que ses quotas (minute et jour,
//     multipliés par la marge) ne le permettent ;
//   * un refus (429, 418, 403, 401, 5xx), un délai dépassé ou une réponse illisible mettent la source en pause : 30 s, puis
//     le double à chaque nouvel échec, 30 minutes au plus (en-tête Retry-After respecté ; 401 et 403 : 30 minutes d'emblée) ;
//   * ce que la cascade ne trouve pas garde sa dernière valeur connue : la base la marque « retardée » quand elle vieillit,
//     et « simulée » (niveau de référence) si aucune source n'a jamais répondu.
import * as L from './lecteurs.js';

export const UA = 'WimoroBot/1.0 (https://wimoro.com)';
export const FAMILLES = ['crypto', 'actions_us', 'indices', 'actions_eu', 'metaux', 'devises', 'petrole'];
export const PAUSE_BASE_MS = 30000, PAUSE_MAX_MS = 1800000, FERME_MS = 900000;

const jourIso = t => new Date(t).toISOString().slice(0, 10);
const sansInverse = syms => [...new Set(syms.map(s => s.replace(/^1\//, '')))];

/** Comment appeler chaque source : `lot` « tous » (un appel pour tous les symboles) ou « un » (un appel par symbole). */
export const SOURCES = {
  binance: { lot: 'tous', url: s => `https://data-api.binance.vision/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(s))}`, lire: L.binanceTicker },
  kraken: { lot: 'tous', url: s => `https://api.kraken.com/0/public/Ticker?pair=${s.join(',')}`, lire: L.krakenTicker },
  coinbase: { lot: 'tous', url: () => 'https://api.coinbase.com/v2/exchange-rates?currency=USD', lire: L.coinbaseRates },
  coingecko: { lot: 'tous', url: s => `https://api.coingecko.com/api/v3/simple/price?ids=${s.join(',')}&vs_currencies=usd&include_last_updated_at=true`,
    entetes: cle => ({ 'x-cg-demo-api-key': cle }), lire: L.coingeckoSimple },
  finnhub: { lot: 'un', url: s => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}`, entetes: cle => ({ 'X-Finnhub-Token': cle }), lire: L.finnhubQuote },
  yahoo: { lot: 'tous', url: s => `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${s.map(encodeURIComponent).join(',')}&range=1d&interval=5m`, lire: L.yahooSpark },
  eodhd: { lot: 'tous', url: (s, cle) => `https://eodhd.com/api/real-time/${encodeURIComponent(s[0])}?${s.length > 1 ? 's=' + s.slice(1).map(encodeURIComponent).join(',') + '&' : ''}api_token=${encodeURIComponent(cle)}&fmt=json`,
    lire: L.eodhdRealtime },
  goldapi: { lot: 'un', url: s => `https://api.gold-api.com/price/${encodeURIComponent(s)}`, lire: L.goldApi },
  goldprice: { lot: 'un', url: s => `https://api.goldprice.dev/v1/prices?symbol=${encodeURIComponent(s)}-USD-SPOT`, entetes: cle => (cle ? { 'X-API-Key': cle } : {}), lire: L.goldpriceDev },
  fawaz: { lot: 'tous', url: () => 'https://latest.currency-api.pages.dev/v1/currencies/usd.json', lire: L.fawazRates },
  exchangerate: { lot: 'tous', url: s => `https://api.exchangerate.dev/v1/latest/USD?symbols=${sansInverse(s).join(',')}`, entetes: cle => ({ Authorization: 'Bearer ' + cle }), lire: L.exchangerateDev },
  frankfurter: { lot: 'tous', url: s => `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${sansInverse(s).join(',')}`, lire: L.frankfurter },
  eia: { lot: 'tous', url: (s, cle) => `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${encodeURIComponent(cle)}&frequency=daily&data[0]=value&${s.map(x => 'facets[series][]=' + encodeURIComponent(x)).join('&')}&sort[0][column]=period&sort[0][direction]=desc&length=10`,
    lire: L.eiaSpot },
  fred: { lot: 'un', texte: true, delai: 8000, url: (s, cle, now) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(s)}&cosd=${jourIso(now - 30 * 86400000)}`, lire: L.fredCsv },
};
/** Contrôle de l'état des places (pas un cours) */
export const CONTROLE = { id: 'twelvedata', url: cle => `https://api.twelvedata.com/market_state?apikey=${encodeURIComponent(cle)}`, lire: L.twelvedataMarketState };

/** Une adresse sans ses paramètres secrets, pour un journal. */
export const sansSecret = url => String(url).replace(/([?&](?:api_?key|api_token|apikey|token)=)[^&]*/gi, '$1…');

/** État en mémoire d'une boucle, à partir de la configuration lue en base (srv_donnees_config) et des secrets présents. */
export function etatInitial(cfg, cles, now) {
  const sources = {};
  for (const s of cfg.sources || []) {
    // l'heure du dernier appel vient de la base : une boucle qui redémarre (chaque minute) ne rappelle pas trop tôt une source lente
    sources[s.id] = { ...s, cle: s.secret ? (cles[s.secret] || '') : '', appelsJour: s.appels_jour | 0, erreursSuite: s.erreurs_suite | 0,
      pauseJusqua: s.pause_jusqua || 0, dernierAppel: Math.min(s.dernier_appel || 0, now), minute: [] };
  }
  const actifs = {}, dernierOk = {};
  for (const a of cfg.actifs || []) { actifs[a.id] = a; dernierOk[a.id] = Math.min(a.dernier || 0, now); }
  return { sources, actifs, dernierOk, jour: jourIso(now), controleAt: 0 };
}

/** Plafonds réellement utilisés : quota × marge (au moins 1). */
export const plafondMinute = s => (s.quota_min ? Math.max(1, Math.floor(s.quota_min * s.marge)) : Infinity);
export const plafondJour = s => (s.quota_jour ? Math.max(1, Math.floor(s.quota_jour * s.marge)) : Infinity);
/** Intervalle minimal entre deux lots de n appels d'une source (en ms) : sa cadence, et ce que ses quotas permettent. */
export function intervalle(s, n = 1) {
  let sec = s.cadence_s;
  if (s.quota_min) sec = Math.max(sec, (n * 60) / (s.quota_min * s.marge));
  if (s.quota_jour) sec = Math.max(sec, (n * 86400) / (s.quota_jour * s.marge));
  return sec * 1000;
}
/** La source peut-elle faire n appels maintenant ? (clé, pause, quotas ; pas la cadence) */
export function utilisable(s, now, n = 1) {
  if (!s || !s.actif) return false;
  if (s.cle_requise && !s.cle) return false;
  if (now < s.pauseJusqua) return false;
  s.minute = s.minute.filter(t => now - t < 60000);
  if (s.minute.length + n > plafondMinute(s)) return false;
  if (s.appelsJour + n > plafondJour(s)) return false;
  return true;
}
export const due = (s, now, n = 1) => now - s.dernierAppel >= intervalle(s, n);

/** Pause après un échec : 30 s puis le double à chaque nouvel échec (30 min au plus) ; 401 et 403 : 30 min ; Retry-After respecté. */
export function pause(erreursSuite, statut, retryAfterS) {
  let ms = Math.min(PAUSE_MAX_MS, PAUSE_BASE_MS * 2 ** Math.max(0, erreursSuite - 1));
  if (statut === 401 || statut === 403) ms = PAUSE_MAX_MS;
  if (retryAfterS > 0) ms = Math.max(ms, Math.min(PAUSE_MAX_MS, retryAfterS * 1000));
  return ms;
}
export const echec = statut => statut === 0 || statut === 401 || statut === 403 || statut === 418 || statut === 429 || statut >= 500 || (statut >= 400 && statut !== 404);

/** Sources d'une famille, dans l'ordre de la cascade. */
export function sourcesDe(etat, famille) {
  return Object.values(etat.sources).filter(s => s.rangs && s.rangs[famille] && SOURCES[s.id]).sort((a, b) => a.rangs[famille] - b.rangs[famille] || (a.id < b.id ? -1 : 1));
}

/** Actifs à rafraîchir maintenant : au rythme de la meilleure source utilisable de leur famille (15 min si la place est fermée). */
export function aRafraichir(etat, now) {
  const out = [];
  for (const a of Object.values(etat.actifs)) {
    const premiere = sourcesDe(etat, a.famille).find(s => a.symboles && a.symboles[s.id] && utilisable(s, now, 1));
    if (!premiere) continue;
    let rythme = intervalle(premiere, 1);
    if (!a.ouvert && a.famille !== 'crypto') rythme = Math.max(rythme, FERME_MS);
    if (now - (etat.dernierOk[a.id] || 0) >= rythme) out.push(a.id);
  }
  return out;
}

/** Un tour de la cascade : pour chaque actif restant, la première source utilisable et « due » qui n'a pas encore été essayée. */
export function planifier(etat, restants, now, essayees) {
  const plan = new Map();
  for (const id of restants) {
    const a = etat.actifs[id];
    for (const s of sourcesDe(etat, a.famille)) {
      if (essayees.has(s.id) || !a.symboles || !a.symboles[s.id]) continue;
      const nAppels = SOURCES[s.id].lot === 'un' ? restants.filter(x => etat.actifs[x].symboles && etat.actifs[x].symboles[s.id]).length : 1;
      if (!utilisable(s, now, Math.max(1, nAppels)) || !due(s, now, Math.max(1, nAppels))) continue;
      if (!plan.has(s.id)) plan.set(s.id, []);
      plan.get(s.id).push(id);
      break;
    }
  }
  return plan;
}

function noter(bilan, s, statut, ms, ok, erreur) {
  const b = bilan[s.id] || (bilan[s.id] = { id: s.id, appels: 0, ok: 0, err: 0, code: null, erreur: null, ms: 0, cle: s.cle_requise || s.secret ? !!s.cle : undefined });
  b.appels++; b.code = statut; b.ms = Math.max(b.ms, ms | 0);
  if (ok) b.ok++; else { b.err++; b.erreur = erreur; }
}

/** Appelle une source pour une liste d'actifs ; range les cotations trouvées ; tient ses compteurs et sa pause. */
export async function appelerSource(etat, id, actifs, now, chercher, cours, bilan) {
  const s = etat.sources[id], def = SOURCES[id];
  const symboles = Object.fromEntries(actifs.map(a => [a, etat.actifs[a].symboles[id]]));
  const lots = def.lot === 'un' ? Object.entries(symboles).map(([a, sym]) => [{ [a]: sym }, sym]) : [[symboles, Object.values(symboles)]];
  s.dernierAppel = now;
  for (const [syms, arg] of lots) {
    s.minute.push(now); s.appelsJour++;
    const r = await chercher(def.url(arg, s.cle, now), { entetes: def.entetes ? def.entetes(s.cle) : {}, texte: !!def.texte, delai: def.delai || 5000 });
    let ok = false, erreur = null, lu = null, enPause = false;
    if (r.statut >= 200 && r.statut < 300) {
      try {
        if (!def.texte && (r.corps === undefined || r.corps === null)) throw L.erreurFormat(id, 'JSON illisible');
        lu = def.lire(def.texte ? r.texte : r.corps, syms); ok = true;
      } catch (e) { erreur = String(e && e.message || e).slice(0, 200); enPause = true; }        // réponse illisible : la source a changé
    } else { erreur = r.erreur ? r.erreur : 'HTTP ' + r.statut; enPause = echec(r.statut); }   // un 404 (symbole inconnu) n'est pas une panne
    if (ok) {
      s.erreursSuite = 0; s.pauseJusqua = 0;
      for (const [a, c] of Object.entries(lu || {})) if (!cours[a]) { cours[a] = { p: c.p, src: id, st: c.st ?? null }; etat.dernierOk[a] = now; }
    } else if (enPause) {
      s.erreursSuite++; s.pauseJusqua = now + pause(s.erreursSuite, r.statut, r.retryAfter | 0);
    }
    noter(bilan, s, r.statut, r.ms, ok, erreur);
    if (!ok && s.pauseJusqua > now) break;                                       // la source vient de refuser : on n'insiste pas
  }
}

/** Un passage complet : jusqu'à trois tours de cascade. Rend ce qu'il faut envoyer à srv_cours_ingerer. */
export async function passe(etat, now, chercher) {
  const cours = {}, bilan = {}, essayees = new Set();
  let restants = aRafraichir(etat, now);
  for (let tour = 0; tour < 3 && restants.length; tour++) {
    const plan = planifier(etat, restants, now, essayees);
    if (!plan.size) break;
    await Promise.all([...plan].map(([id, actifs]) => { essayees.add(id); return appelerSource(etat, id, actifs, now, chercher, cours, bilan); }));
    restants = restants.filter(a => !cours[a]);
  }
  const sources = Object.values(bilan).map(b => ({ ...b, pause_ms: etat.sources[b.id].pauseJusqua || 0 }));
  return { cours: Object.entries(cours).map(([a, c]) => ({ a, p: c.p, src: c.src, st: c.st })), sources, manquants: restants };
}

/** Le contrôle des places (Twelve Data, si sa clé existe), au plus toutes les 15 minutes. */
export async function controler(etat, now, chercher) {
  const s = etat.sources[CONTROLE.id];
  if (!s || !utilisable(s, now, 1) || !due(s, now, 1) || now - etat.controleAt < FERME_MS) return null;
  etat.controleAt = now; s.dernierAppel = now; s.minute.push(now); s.appelsJour++;
  const r = await chercher(CONTROLE.url(s.cle), { delai: 5000 });
  let lu = null, erreur = null;
  if (r.statut >= 200 && r.statut < 300) { try { lu = CONTROLE.lire(r.corps); } catch (e) { erreur = String(e.message || e).slice(0, 200); } }
  else erreur = r.erreur || 'HTTP ' + r.statut;
  if (erreur) { s.erreursSuite++; s.pauseJusqua = now + pause(s.erreursSuite, r.statut, r.retryAfter | 0); } else { s.erreursSuite = 0; s.pauseJusqua = 0; }
  return { controle: lu, source: { id: s.id, appels: 1, ok: erreur ? 0 : 1, err: erreur ? 1 : 0, code: r.statut, erreur, ms: r.ms | 0, cle: true, pause_ms: s.pauseJusqua || 0 } };
}

/** Présence des clés, à signaler à la base au premier passage (sans jamais transmettre leur valeur). */
export function presenceDesCles(etat) {
  return Object.values(etat.sources).filter(s => s.secret).map(s => ({ id: s.id, appels: 0, ok: 0, err: 0, cle: !!s.cle }));
}
