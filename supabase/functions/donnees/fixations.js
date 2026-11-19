// Fixations du pari éclair : le cours de chaque actif réel à chaque frontière de manche (toutes les 45 s).
//
// Module pur, comme cascade.js : le réseau (`chercher`) et l'horloge (`now`) sont passés en paramètres. L'Edge Function
// « donnees » l'exécute dans sa boucle (aucune invocation de plus) ; tests/donnees-fixations.spec.mjs le teste sous Node
// avec des réponses enregistrées (jamais le réseau).
//
// Règles :
//   * crypto (Bitcoin, Ether, Solana, Dogecoin) : la seconde T de la frontière lue chez Binance (bougie d'une seconde), OKX
//     (bougie d'une seconde) et Gate (transactions) ; Coinbase (transactions, en USD) en secours si une principale manque.
//     Ces sources donnent l'historique à la seconde : une frontière manquée se rattrape tant que son délai de grâce court.
//     Premier essai à T + 3 s, puis T + 8 s et T + 15 s (le dernier est « final ») ;
//   * actions US (fonds SPY et QQQ, Nvidia, Tesla) : la cotation Finnhub lue juste après T (T + 0,3 s, puis 1,5 s et 4 s),
//     gardée si sa dernière transaction a moins de 15 s ; seulement place ouverte, et seulement avec la clé FINNHUB_API_KEY ;
//   * la moyenne et l'écart des valeurs aberrantes sont ceux du moteur (MoteurEclair.composite, copie conforme du site) ;
//   * une source n'est jamais appelée au-delà de ses quotas (minute, jour, marge) ; un refus ou une réponse illisible la met
//     en pause (mêmes règles que la collecte des cours) ; on écrit dès qu'assez de sources concordent, et « final » au
//     dernier essai : la base écrit alors la fixation « absente » s'il en manque (la manche sera annulée, mises rendues).
import * as L from './lecteurs.js';
import { echec, pause, utilisable } from './cascade.js';
import './moteur-eclair.js';

const ME = globalThis.MoteurEclair;

/** Les essais, en ms après la frontière (le dernier est « final »). */
export const ESSAIS = { crypto: [3000, 8000, 15000], bourse: [300, 1500, 4000] };
export const groupeDe = marche => (marche === 'CRYPTO' ? 'crypto' : 'bourse');

/** Comment interroger chaque source à la seconde T (en ms) d'une frontière. */
export const SOURCES_FIX = {
  binance_eclair: { url: (sym, T) => `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=1s&startTime=${T - 9000}&limit=10`, lire: L.binanceKlines1s },
  okx_eclair: { url: (sym, T) => `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(sym)}&bar=1s&after=${T + 1000}&limit=10`, lire: L.okxCandles1s },
  gate_eclair: { url: (sym, T) => `https://api.gateio.ws/api/v4/spot/trades?currency_pair=${encodeURIComponent(sym)}&from=${T / 1000 - 10}&to=${T / 1000 + 1}&limit=100`, lire: L.gateTrades },
  coinbase_eclair: { url: (sym, T) => `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(sym)}/ticker?limit=100&start=${T / 1000 - 10}&end=${T / 1000 + 1}`, lire: L.coinbaseTrades },
  finnhub_eclair: { url: sym => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}`, entetes: cle => ({ 'X-Finnhub-Token': cle }), lire: L.finnhubAu },
};

/**
 * Les essais de la boucle qui tourne de `now` à `fin` (ms), triés par heure : [{ m, T, groupe, actifs, at, rang, final }].
 * cfgE : réponse de srv_eclair_config ({ grace_s, actifs: [{ id, marche, smin, sources, ouvert, fixees }] }).
 * Une frontière déjà passée et pas encore fixée est rattrapée (crypto : historique à la seconde ; bourse : cotation encore
 * à moins de 15 s) par les essais qui restent, ou par un seul essai « final » tout de suite s'ils sont tous passés. Les
 * essais qui tomberaient après `fin` sont laissés à la boucle suivante (elle les rattrapera).
 */
export function calendrier(cfgE, now, fin) {
  const grace = Math.max(30, Number(cfgE && cfgE.grace_s) || 120) * 1000, actifs = (cfgE && cfgE.actifs) || [], out = [];
  for (let m = ME.round(now) - 3; ME.t0(m) <= fin; m++) {
    const T = ME.t0(m);
    if (now > T + grace - 5000) continue;                                // trop tard : la base la déclare absente s'il le faut
    for (const groupe of ['bourse', 'crypto']) {
      if (groupe === 'bourse' && now > T + 12000) continue;                // une cotation lue plus tard ne dit plus le cours de T
      const ids = actifs.filter(a => groupeDe(a.marche) === groupe && (groupe === 'crypto' || a.ouvert) && !(a.fixees || []).includes(m)).map(a => a.id);
      if (!ids.length) continue;
      const d = ESSAIS[groupe], tous = d.map((x, i) => ({ at: T + x, rang: i, final: i === d.length - 1 }));
      let essais = tous.filter(e => e.at >= now - 250);
      if (!essais.length) essais = [{ at: now, rang: d.length - 1, final: true }];
      for (const e of essais) if (e.at <= fin) out.push({ m, T, groupe, actifs: ids, ...e });
    }
  }
  return out.sort((a, b) => a.at - b.at || (a.groupe < b.groupe ? -1 : 1));
}

function noter(bilan, s, statut, ms, ok, erreur) {
  const b = bilan[s.id] || (bilan[s.id] = { id: s.id, appels: 0, ok: 0, err: 0, code: null, erreur: null, ms: 0, ...(s.secret ? { cle: !!s.cle } : {}) });
  b.appels++; b.code = statut; b.ms = Math.max(b.ms, ms | 0);
  if (ok) b.ok++; else { b.err++; b.erreur = erreur; }
}

/**
 * Un essai de fixation de la frontière t.T pour les actifs `actifsCfg` (ceux de srv_eclair_config, pas encore fixés).
 * `acquis` garde d'un essai à l'autre ce que chaque source a déjà rendu : { 'manche:actif': { source: cours | null } }.
 * Rend { ecrire: { actif: { s, x, final } } à envoyer à srv_eclair_fixer, sources: bilans pour srv_cours_ingerer }.
 */
export async function essayer(etat, t, actifsCfg, acquis, now, chercher) {
  const bilan = {}, appels = [], ecrire = {}, echecs = {};
  for (const a of actifsCfg) {
    const deja = acquis[t.m + ':' + a.id] || (acquis[t.m + ':' + a.id] = {});
    const manque = x => typeof deja[x.src] !== 'number';
    const prete = x => { const s = etat.sources[x.src]; return !!(s && SOURCES_FIX[x.src] && utilisable(s, now, 1)); };
    const prim = (a.sources || []).filter(x => !x.secours), sec = (a.sources || []).filter(x => x.secours);
    const nPrix = Object.values(deja).filter(v => typeof v === 'number').length;
    const cibles = prim.filter(x => manque(x) && prete(x));
    // le secours quand une principale manque et ne reviendra pas dans cet essai (en pause, sans clé, coupée), ou au dernier essai
    if (t.final ? prim.some(manque) : nPrix + cibles.length < prim.length) cibles.push(...sec.filter(x => manque(x) && prete(x)));
    for (const x of cibles) {
      const s = etat.sources[x.src];
      if (!utilisable(s, now, 1)) continue;                                  // quota de la minute ou du jour atteint par un appel précédent
      s.minute.push(now); s.appelsJour++; s.dernierAppel = now;              // compté tout de suite : les appels suivants le voient
      appels.push([a, x, s]);
    }
  }
  await Promise.all(appels.map(async ([a, x, s]) => {
    const def = SOURCES_FIX[x.src];
    const r = await chercher(def.url(x.sym, t.T), { entetes: def.entetes ? def.entetes(s.cle) : {}, delai: 4000 });
    let prix = null, ok = false, erreur = null, enPause = false;
    if (r.statut >= 200 && r.statut < 300) {
      try {
        if (r.corps === undefined || r.corps === null) throw L.erreurFormat(x.src, 'JSON illisible');
        const v = def.lire(r.corps, t.T); prix = v ? v.p : null; ok = true;
      } catch (e) { erreur = String(e && e.message || e).slice(0, 200); enPause = true; }
    } else { erreur = r.erreur ? r.erreur : 'HTTP ' + r.statut; enPause = echec(r.statut); }
    if (ok) { s.erreursSuite = 0; s.pauseJusqua = 0; }
    else if (enPause) { s.erreursSuite++; s.pauseJusqua = now + pause(s.erreursSuite, r.statut, r.retryAfter | 0); }
    noter(bilan, s, r.statut, r.ms, ok, erreur);
    acquis[t.m + ':' + a.id][x.src] = prix;                                  // null : rien à cette seconde (ou erreur) — on retentera
    if (prix === null) echecs[a.id] = true;
  }));
  for (const a of actifsCfg) {
    const deja = acquis[t.m + ':' + a.id];
    const c = ME.composite((a.sources || []).map(x => [x.src, deja[x.src]]));
    // « absente » seulement si une source a été interrogée : sans clé (ou toutes en pause), rien n'est écrit — une manche
    // réelle qui en dépendrait serait déclarée par la tâche wm-eclair-fix après le délai de grâce
    const tentee = Object.keys(deja).length > 0;
    if ((c.n >= a.smin && (t.rang > 0 || !echecs[a.id])) || (t.final && tentee)) ecrire[a.id] = { s: c.s, x: c.x, final: !!t.final };
  }
  return { ecrire, sources: Object.values(bilan).map(b => ({ ...b, pause_ms: etat.sources[b.id].pauseJusqua || 0 })) };
}
