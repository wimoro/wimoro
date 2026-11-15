/* WIMORO — moteur du pari éclair (module pur) */

/* =====================================================================================
 *  Moteur déterministe du pari éclair
 *  ------------------------------------------------------------------------------------
 *  Tout se déduit de l'heure : le numéro de la manche, la trajectoire des prix, l'issue, la cagnotte de départ et les
 *  mises des autres joueurs (simulées, semées par manche et par tick). Deux machines qui ont la même heure calculent
 *  donc exactement la même chose.
 *
 *  Ce fichier ne touche ni à la page, ni à l'état du joueur, ni aux traductions. Il est utilisé À L'IDENTIQUE :
 *    - par le navigateur (js/flash.js lui délègue le calcul) ;
 *    - par le serveur (Edge Function « eclair », qui en embarque une copie conforme : supabase/functions/eclair/).
 *  Le test tests/eclair-moteur.spec.mjs vérifie que les deux copies sont identiques, et que le moteur donne les mêmes
 *  issues, prix et cagnottes que le code d'origine sur 500 manches (tests/fixtures/eclair-reference.json).
 * ===================================================================================== */
(function (racine) {
  'use strict';
  const FCAL = 1 / 7;                       // calibrage des amplitudes pour 45 secondes
  const FDUR = 45000, FOPEN = 30000;        // une manche : 45 s, dont 30 s de mises
  const FVOL = .0035 * FCAL;                // seuil du pari « Secousse »
  const FEPOCH = Date.UTC(2026, 10, 1), FTICK = 250, FK = FDUR / FTICK, FPHI = .985, FJ = 1200;
  const CAP_BE = 50, BE_EDGE = .05, BE_MIN = 5, BE_MAX = 40;          // break even (mêmes valeurs que js/engine.js)
  const PM_K = .70, RANK_DISC = .90;                                   // frais (mêmes valeurs que js/engine.js)
  const PM_RATE = { 'Crypto': .07, 'Football': .05, 'Sport': .05, 'Sport live': .05, 'Tech et IA': .04, 'Économie': .05, 'Culture': .05, 'Météo': .05, 'Bourse': .04, 'Matières': .04, 'Devises': .04 };

  /* ----- Aléa semé (identique à js/core.js) ----- */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ----- Les jeux : seulement leurs nombres (les libellés sont dans js/flash.js) ----- */
  const dir = (id, cat, k0, p0) => { const k = k0 * FCAL; return { id, cat, kind: 'dir', k, p0, be: k * .195 }; };
  const LISTE = [
    dir('btc', 'Crypto', .0011, 97412.35), dir('eth', 'Crypto', .0014, 3482.6), dir('sol', 'Crypto', .0019, 188.42), dir('doge', 'Crypto', .0024, .18425),
    { id: 'vol', cat: 'Crypto', kind: 'vol', be: .00022 * FCAL },
    dir('ndx', 'Bourse', .0004, 25841.2), dir('spx', 'Bourse', .0006, 6812.4), dir('cac', 'Bourse', .0007, 8124.6), dir('nvda', 'Bourse', .0009, 142.35), dir('tsla', 'Bourse', .0011, 248.7),
    dir('gold', 'Matières', .0005, 4126.8), dir('silver', 'Matières', .0009, 48.62), dir('oil', 'Matières', .0009, 64.2),
    dir('eurusd', 'Devises', .00022, 1.1642), dir('gbpusd', 'Devises', .00025, 1.3125), dir('usdjpy', 'Devises', .0003, 152.84),
    { id: 'tennis', cat: 'Sport live', kind: 'event', p: .58, bep: .04 },
    { id: 'basket', cat: 'Sport live', kind: 'event', p: .38, bep: .04 },
    { id: 'foot', cat: 'Sport live', kind: 'event', p: .18, bep: .03 }
  ];
  const JEUX = {}; LISTE.forEach(d => { JEUX[d.id] = d; });

  /* ----- Horloge ----- */
  const round = t => Math.floor((t - FEPOCH) / FDUR) + 1, t0 = r => FEPOCH + (r - 1) * FDUR;
  const tick = t => Math.min(FK, Math.max(0, Math.floor((t - t0(round(t))) / FTICK)));
  const ouvert = t => t - t0(round(t)) < FOPEN;

  /* ----- Break even et frais (mêmes formules que js/engine.js) ----- */
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + .3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return s * y; }
  function beProb(band, k, ticks) { const sig = k * Math.sqrt(ticks / 12); return Math.max(.002, Math.min(.5, erf(band / (sig * Math.SQRT2)))); }
  const beMultFair = p => Math.max(BE_MIN, Math.min(BE_MAX, (1 - BE_EDGE) / p));
  const beP = d => d.kind === 'event' ? d.bep : beProb(d.be, d.kind === 'vol' ? JEUX.btc.k : d.k, FDUR / 250);
  const beMult = d => beMultFair(beP(d));
  const beRoom = g => Math.max(0, g.pool.o + g.pool.n - (g.pool.eProm || 0));
  const beMax = (g, d) => Math.floor(beRoom(g) / beMult(d));
  const cle = cote => cote === 'oui' ? 'o' : cote === 'non' ? 'n' : 'e';
  const total = g => g.pool.o + g.pool.n + g.pool.e;
  const taux = (cat, remise) => (PM_RATE[cat] !== undefined ? PM_RATE[cat] : .05) * PM_K * (remise ? RANK_DISC : 1);
  /* frais prélevés à la mise : taux × (1 − part de la cagnotte déjà sur ce côté) */
  function frais(d, g, cote, amt, remise) { const T = total(g), part = T > 0 ? g.pool[cle(cote)] / T : .5; return amt * taux(d.cat, remise) * (1 - part); }
  /* prix affichés (en cents) : break even selon sa cote, le reste au prorata des cagnottes */
  function prix(d, g) { const e = Math.max(2, Math.min(20, Math.round(100 / beMult(d)))), so = g.pool.o / (g.pool.o + g.pool.n); let o = Math.round((100 - e) * so); o = Math.max(2, Math.min(98 - e, o)); return { o, e, n: 100 - e - o }; }
  /* gain si le côté gagne : mise nette × (cagnotte / mises du côté) ; break even plafonné à la cote bloquée à la mise */
  function gain(g, my) { const k = cle(my.s), T = total(g), W = g.pool[k]; if (W <= 0) return my.net; let m = T / W; if (my.s === 'be') m = Math.min(m, my.mult || CAP_BE, CAP_BE); return my.net * m; }

  /* ----- Trajectoire et issue d'une manche ----- */
  const HS = {}, LV = {};
  const graine = (d, r, sel) => ((HS[d.id + sel] || (HS[d.id + sel] = hash(d.id + sel))) ^ Math.imul(r | 0, 0x9E3779B1)) >>> 0;
  const fZ = (d, r) => { const g = rng(graine(d, r, 'z')); return (g() + g() + g() + g() - 2) * 1.7320508; };
  /* niveau d'un actif au début de la manche r : somme amortie des aléas des manches précédentes */
  function niveau(d, r) { const c = LV[d.id] || (LV[d.id] = {}); if (c[r] !== undefined) return c[r]; const sd = d.k * Math.sqrt(FK / 12); let L;
    if (c[r - 1] !== undefined) L = FPHI * c[r - 1] + sd * fZ(d, r); else { L = 0; let w = 1; for (let j = 0; j < FJ; j++) { L += w * fZ(d, r - j); w *= FPHI; } L *= sd; }
    c[r] = L; return L; }
  /* un prix par tick de 250 ms : marche aléatoire semée, recalée pour finir au niveau de la manche suivante */
  function plan(d, r) { const g = rng(graine(d, r, 'w')), W = new Float64Array(FK + 1); for (let k = 1; k <= FK; k++) W[k] = W[k - 1] + (g() - .5) * d.k;
    const a = niveau(d, r), b = niveau(d, r + 1), P = new Float64Array(FK + 1); for (let k = 0; k <= FK; k++) P[k] = d.p0 * Math.exp(a + (b - a) * k / FK + W[k] - W[FK] * k / FK); return P; }
  /* issue : 1 = premier côté, 0 = second, 2 = break even */
  function issue(d, r) { if (d.kind === 'event') { const g = rng(graine(d, r, 'o')); return g() < d.bep ? 2 : (g() < d.p ? 1 : 0); }
    const s = d.kind === 'vol' ? JEUX.btc : d, a = niveau(s, r), b = niveau(s, r + 1), m = Math.abs(Math.exp(b - a) - 1); if (m <= d.be) return 2; return d.kind === 'vol' ? (m > FVOL ? 1 : 0) : (b > a ? 1 : 0); }

  /* ----- Cagnotte : départ, puis mises simulées des autres joueurs ----- */
  /* départ de la manche r. `alea` est la suite du même tirage : le navigateur s'en sert pour le décor (tableau de score). */
  function depart(d, r) { const A = rng(graine(d, r, 'p')), ev = d.kind === 'event', tot = 300 + Math.round(A() * 200); let o, n;
    if (ev) { o = Math.round(tot * d.p); n = tot - o; } else { o = 140 + Math.round(A() * 220); n = 140 + Math.round(A() * 220); }
    const e = Math.max(8, Math.round((o + n) * (ev ? d.bep : .035) * (.7 + A() * .6)));
    return { pool: { o, n, e }, players: 60 + Math.floor(A() * 70), alea: A }; }
  /* tick i de la manche r : au plus une mise d'un autre joueur, ajoutée à la cagnotte. Renvoie la mise { s, a, me: 0 } ou null.
     `P` : trajectoire de l'actif suivi (celle du Bitcoin pour « Secousse ») ; inutile pour un événement sportif. */
  function mises(d, g, r, i, P) {
    if (i * FTICK >= FOPEN) return null;
    const rr = rng((graine(d, r, 'b') + i * 7919) >>> 0);
    if (!(rr() < .5)) return null;
    let s;
    if (rr() < .05) s = 2; else if (d.kind === 'event') s = rr() < d.p ? 1 : 0;
    else { const m = Math.abs(P[i] / P[0] - 1), o = m <= d.be ? 2 : d.kind === 'vol' ? (m > FVOL ? 1 : 0) : (P[i] > P[0] ? 1 : 0); s = rr() < .5 + (o === 1 ? .07 : o === 0 ? -.07 : 0) ? 1 : 0; }
    const a = s === 2 ? .1 + rr() * .3 : Math.pow(rr(), 2);
    if (s === 2) { const st = Math.round(2 + rr() * 10), M = beMult(d); if (st * M > beRoom(g)) s = rr() < .5 ? 1 : 0; else { g.pool.e += st; g.pool.eProm = (g.pool.eProm || 0) + st * M; } }
    if (s !== 2) g.pool[s ? 'o' : 'n'] += Math.round(5 + a * 260);
    if (rr() < .55) g.players++;
    return { s, a, me: 0 };
  }
  /* la mise du joueur entre dans la cagnotte */
  function poser(g, my) { g.pool[cle(my.s)] += my.net; if (my.s === 'be') g.pool.eProm = (g.pool.eProm || 0) + my.net * my.mult; }
  /* état de la cagnotte au tick k de la manche r ; `my` (facultatif) : mise du joueur, posée à son tick my.tk */
  function etat(d, r, k, my) { const dep = depart(d, r), g = { pool: dep.pool, players: dep.players }, P = d.kind === 'event' ? null : plan(d.kind === 'vol' ? JEUX.btc : d, r);
    const pose = my ? Math.max(0, Math.min(k, my.tk | 0)) : -1;
    for (let i = 1; i <= k; i++) { if (i - 1 === pose) poser(g, my); mises(d, g, r, i, P); }
    if (pose === k) poser(g, my);
    return g; }
  /* règlement complet d'une mise { s, net, mult, tk, amt } sur la manche r */
  function regler(d, r, my) { const g = etat(d, r, FK, my), out = issue(d, r), k = out === 2 ? 'e' : out === 1 ? 'o' : 'n';
    const win = (my.s === 'oui' ? 1 : my.s === 'non' ? 0 : 2) === out, pay = win ? gain(g, my) : 0;
    return { out, win, pay, pnl: pay - my.amt, part: Math.round(g.pool[k] / total(g) * 100) }; }

  racine.MoteurEclair = { FCAL, FDUR, FOPEN, FVOL, FEPOCH, FTICK, FK, CAP_BE, JEUX, LISTE, hash, rng, round, t0, tick, ouvert, graine, niveau, plan, issue,
    depart, mises, poser, etat, regler, beP, beMult, beRoom, beMax, frais, prix, gain, cle, total, taux };
})(typeof globalThis !== 'undefined' ? globalThis : this);
