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

  /* ----- La Série : manches de 60 secondes sur un actif à trajectoire, adossées à la cagnotte éclair du moment ----- */
  const SERIE_MS = 60000, SERIE_CHOIX = 30000, SERIE_MAX = 12;
  /* prix d'un actif à l'instant t */
  const prixAu = (d, t) => plan(d, round(t))[tick(t)];
  /* cotes offertes à l'instant t : Haut et Bas selon la cagnotte éclair en cours, break even à sa cote juste (marge 5 %) */
  function serieCotes(d, t) { const pr = prix(d, etat(d, round(t), tick(t))); return { oui: 100 / pr.o, non: 100 / pr.n, be: beMultFair(beProb(d.be, d.k, SERIE_MS / FTICK)) }; }
  /* manche commencée à l'instant `debut` : prix de départ, prix d'arrivée, issue */
  function serieIssue(d, debut) { const p0 = prixAu(d, debut), p1 = prixAu(d, debut + SERIE_MS), m = Math.abs(p1 / p0 - 1); return { p0, p1, out: m <= d.be ? 'be' : p1 > p0 ? 'oui' : 'non' }; }

  /* ----- Blitz Royale : tournoi à élimination. Tout se déduit de l'heure, sauf les vrais joueurs, tenus par le serveur -----
     Un Blitz par créneau de 15 minutes : inscriptions jusqu'au départ (2 minutes après le début du créneau), puis au plus
     10 manches de 60 secondes séparées par 10 secondes de pause. Les joueurs simulés et leurs choix sont semés par Blitz et
     par manche : deux machines calculent la même salle. */
  const BZ = { ROUNDS: 10, ROUND_MS: 60000, CHOICE_MS: 30000, PAUSE_MS: 10000, BUYIN: 10, PRIME_BUYIN: 25, REBUY: 50, PRIME_H_UTC: 20, RAKE: .05,
    PERIODE: 900000, ATTENTE: 120000, GID: 'btc', BOTS: [1900, 3100] };
  const bzId = t => Math.floor(t / BZ.PERIODE);
  const bzDebut = id => id * BZ.PERIODE + BZ.ATTENTE;
  const bzManche = (id, i) => { const a = bzDebut(id) + (i - 1) * (BZ.ROUND_MS + BZ.PAUSE_MS); return { debut: a, fin: a + BZ.ROUND_MS }; };
  const bzPrime = id => new Date(bzDebut(id)).getUTCHours() === BZ.PRIME_H_UTC;          // 21 h, heure de Paris en hiver
  /* issue de la manche i : 1 = Haut, 0 = Bas, 2 = break even ; `haut` : sens du prix à la clôture des choix (il oriente les joueurs simulés) */
  function bzIssue(id, i) { const d = JEUX[BZ.GID], m = bzManche(id, i), p0 = prixAu(d, m.debut), p1 = prixAu(d, m.fin), e = Math.abs(p1 / p0 - 1);
    return { p0, p1, out: e <= d.be ? 2 : p1 > p0 ? 1 : 0, haut: prixAu(d, m.debut + BZ.CHOICE_MS) > p0 }; }
  /* les joueurs simulés du Blitz `id` : effectif, puis manche par manche leurs choix et les survivants */
  const BZC = {};
  function bzBots(id) { if (BZC[id]) return BZC[id];
    const prime = bzPrime(id), A = rng(hash('blitz' + id)), n = (BZ.BOTS[0] + Math.floor(A() * (BZ.BOTS[1] - BZ.BOTS[0]))) * (prime ? 2 : 1), manches = []; let vivants = n;
    for (let i = 1; i <= BZ.ROUNDS && vivants > 0; i++) { const x = bzIssue(id, i), rr = rng(hash('blitz' + id + ':' + i)); let o = 0, e = 0, b = 0, u = 0;
      for (let k = 0; k < vivants; k++) { if (rr() < .01) { u++; continue; } const y = rr(); if (y < .04) e++; else if (y < .5 + (x.haut ? .08 : -.08)) o++; else b++; }
      const reste = x.out === 2 ? e : x.out === 1 ? o : b;
      manches.push({ i, out: x.out, p0: x.p0, p1: x.p1, avant: vivants, haut: o, be: e, bas: b, sans: u, vivants: reste }); vivants = reste; }
    const anciens = Object.keys(BZC); if (anciens.length > 8) delete BZC[anciens[0]];
    return (BZC[id] = { id, n, prime, buyin: prime ? BZ.PRIME_BUYIN : BZ.BUYIN, manches, survivants: vivants }); }
  /* jackpot reporté sur le Blitz `id` : les entrées des Blitz précédents où aucun joueur simulé n'a survécu (5 au plus) */
  function bzReport(id, prof) { prof = prof || 0; if (prof >= 5) return 0; const p = bzBots(id - 1); return p.survivants > 0 ? 0 : p.n * p.buyin + bzReport(id - 1, prof + 1); }

  /* =====================================================================================
   *  Moteur v2 : les manches à cours réels (19 nov. 2026)
   *  ------------------------------------------------------------------------------------
   *  Le serveur fixe le cours de chaque jeu réel à chaque frontière de manche : une « fixation », moyenne de plusieurs
   *  sources (valeurs aberrantes écartées), écrite une fois en base et jamais changée. La manche r va de la fixation r (son
   *  départ, à t0(r)) à la fixation r + 1 (sa fin). Issue, cagnotte et gains ne dépendent que de ces fixations, servies à
   *  tous : le navigateur (visiteur, compte Démo) et l'Edge Function calculent donc exactement le même résultat.
   *    fixation : { e: 'ok' | 'absent', p: cours moyen, n: nombre de sources, s: { source: cours }, a: heure d'écriture (ms) }
   *    contexte d'une manche (ctx) : { mode, P: { pbe, smin, beoff }, F: { <manche>: fixation } }
   *      pbe : fréquence du break even retenue pour la manche (figée d'avance par le serveur) ; smin : sources communes
   *      exigées aux deux bouts ; beoff : pas de mise break even (une égalité annule alors la manche).
   *  Les fonctions d'avant (plan, issue, etat, regler…) ne changent pas : elles servent aux jeux simulés.
   * ===================================================================================== */
  const ECART_MAX = .003;                   // une source à plus de 0,3 % des autres est écartée
  /* moyenne de cotations [[source, cours], …] rangées par priorité, valeurs aberrantes écartées : avec trois sources ou
     plus, celles à plus de `ecart` de la médiane ; avec deux qui s'écartent, la première seule. Somme dans l'ordre des
     noms de source : le même calcul partout. Rend { s: { source: cours } gardées, x: [écartées], p: moyenne, n }. */
  function composite(liste, ecart) {
    const ok = (liste || []).filter(c => Array.isArray(c) && typeof c[1] === 'number' && isFinite(c[1]) && c[1] > 0);
    const lim = ecart > 0 ? ecart : ECART_MAX, s = {}, x = [];
    if (ok.length >= 3) {
      const tri = ok.map(c => c[1]).sort((a, b) => a - b), h = tri.length >> 1, med = tri.length % 2 ? tri[h] : (tri[h - 1] + tri[h]) / 2;
      for (const [k, v] of ok) { if (Math.abs(v / med - 1) <= lim) s[k] = v; else x.push(k); }
    } else if (ok.length === 2) {
      s[ok[0][0]] = ok[0][1];
      if (Math.abs(ok[1][1] / ok[0][1] - 1) <= lim) s[ok[1][0]] = ok[1][1]; else x.push(ok[1][0]);
    } else if (ok.length === 1) s[ok[0][0]] = ok[0][1];
    const k = Object.keys(s).sort(); let t = 0;
    for (const c of k) t += s[c];
    return { s, x, p: k.length ? t / k.length : null, n: k.length };
  }
  /* sources présentes aux deux bouts d'une manche (une source absente à un bout est retirée des deux) */
  function communes(F0, F1) { const a = F0 && F0.s || {}, b = F1 && F1.s || {}; return Object.keys(a).filter(k => typeof b[k] === 'number').sort(); }
  /* issue d'une manche réelle : 1 premier côté, 0 second, 2 break even ; null : manche annulée (fixation absente, sources
     communes insuffisantes, ou égalité alors que le break even est fermé). Écart de deux sources constant (USD contre
     USDT) : il s'annule, puisque le départ et la fin sont pris aux mêmes sources. */
  function issueReelle(d, F0, F1, P) {
    if (!d || d.kind === 'event' || !F0 || !F1 || F0.e !== 'ok' || F1.e !== 'ok') return null;
    const c = communes(F0, F1);
    if (c.length < Math.max(1, (P && P.smin) | 0)) return null;
    let a = 0, b = 0;
    for (const k of c) { a += F0.s[k]; b += F1.s[k]; }
    a /= c.length; b /= c.length;
    const m = Math.abs(b / a - 1);
    if (m <= d.be) return P && P.beoff ? null : 2;
    return d.kind === 'vol' ? (m > FVOL ? 1 : 0) : (b > a ? 1 : 0);
  }
  /* pourquoi une manche réelle est annulée (null : elle ne l'est pas) — le motif écrit avec la mise rendue */
  function motifAnnule(d, F0, F1, P) {
    if (issueReelle(d, F0, F1, P) !== null) return null;
    if (!d || d.kind === 'event') return 'manche_annulee';
    if (!F0 || !F1 || F0.e !== 'ok' || F1.e !== 'ok') return 'fixation_absente';
    return communes(F0, F1).length < Math.max(1, (P && P.smin) | 0) ? 'sources_insuffisantes' : 'egalite_sans_break_even';
  }
  /* penchant de la foule simulée sur la manche r : la tendance de la manche r − 2 (fixation r − 1 contre r − 2), si les
     deux fixations étaient écrites avant l'ouverture de la manche r (connues de tous) ; sinon neutre. */
  function penchant(r, F) {
    const a = F && F[r - 2], b = F && F[r - 1], t = t0(r);
    if (!a || !b || a.e !== 'ok' || b.e !== 'ok' || !(a.a <= t) || !(b.a <= t)) return 0;
    return b.p > a.p ? 1 : b.p < a.p ? -1 : 0;
  }
  /* break even d'une manche réelle : cote juste moins la marge, sur la fréquence figée pour la manche (calibrée sur les
     vraies fixations), sinon celle du modèle */
  const beMultReel = (d, P) => beMultFair(P && P.pbe > 0 ? P.pbe : beP(d));
  const beMaxReel = (g, d, P) => (P && P.beoff ? 0 : Math.floor(beRoom(g) / beMultReel(d, P)));
  function prixReel(d, g, P) { const e = Math.max(2, Math.min(20, Math.round(100 / beMultReel(d, P)))), so = g.pool.o / (g.pool.o + g.pool.n); let o = Math.round((100 - e) * so); o = Math.max(2, Math.min(98 - e, o)); return { o, e, n: 100 - e - o }; }
  /* tick i d'une manche réelle : au plus une mise d'un autre joueur (simulé), qui penche du côté de `pen` (±7 %) */
  function misesReel(d, g, r, i, pen, P) {
    if (i * FTICK >= FOPEN) return null;
    const rr = rng((graine(d, r, 'b') + i * 7919) >>> 0);
    if (!(rr() < .5)) return null;
    let s;
    if (rr() < .05) s = 2; else s = rr() < .5 + pen * .07 ? 1 : 0;
    const a = s === 2 ? .1 + rr() * .3 : Math.pow(rr(), 2);
    if (s === 2) { const st = Math.round(2 + rr() * 10), M = beMultReel(d, P); if (st * M > beRoom(g)) s = rr() < .5 ? 1 : 0; else { g.pool.e += st; g.pool.eProm = (g.pool.eProm || 0) + st * M; } }
    if (s !== 2) g.pool[s ? 'o' : 'n'] += Math.round(5 + a * 260);
    if (rr() < .55) g.players++;
    return { s, a, me: 0 };
  }
  /* cagnotte d'une manche réelle au tick k ; `my` (facultatif) : mise du joueur, posée à son tick */
  function etatReel(d, r, k, my, ctx) {
    const dep = depart(d, r), g = { pool: dep.pool, players: dep.players }, P = ctx && ctx.P || {}, pen = d.kind === 'vol' ? 0 : penchant(r, ctx && ctx.F);
    const pose = my ? Math.max(0, Math.min(k, my.tk | 0)) : -1;
    for (let i = 1; i <= k; i++) { if (i - 1 === pose) poser(g, my); misesReel(d, g, r, i, pen, P); }
    if (pose === k) poser(g, my);
    return g;
  }
  /* règlement d'une mise { s, net, mult, tk, amt } sur une manche réelle ; { annule: true, motif } si la manche est annulée
     (la mise est alors rendue) */
  function reglerReel(d, r, my, ctx) {
    const F = ctx && ctx.F || {}, out = issueReelle(d, F[r], F[r + 1], ctx && ctx.P);
    if (out === null) return { annule: true, motif: motifAnnule(d, F[r], F[r + 1], ctx && ctx.P), out: null, win: false, pay: 0, pnl: 0, part: 0 };
    const g = etatReel(d, r, FK, my, ctx), k = out === 2 ? 'e' : out === 1 ? 'o' : 'n';
    const win = (my.s === 'oui' ? 1 : my.s === 'non' ? 0 : 2) === out, pay = win ? gain(g, my) : 0;
    return { out, win, pay, pnl: pay - my.amt, part: Math.round(g.pool[k] / total(g) * 100) };
  }

  racine.MoteurEclair = { FCAL, FDUR, FOPEN, FVOL, FEPOCH, FTICK, FK, CAP_BE, JEUX, LISTE, hash, rng, round, t0, tick, ouvert, graine, niveau, plan, issue,
    depart, mises, poser, etat, regler, beP, beMult, beRoom, beMax, frais, prix, gain, cle, total, taux,
    SERIE_MS, SERIE_CHOIX, SERIE_MAX, prixAu, serieCotes, serieIssue, beProb, beMultFair,
    BZ, bzId, bzDebut, bzManche, bzPrime, bzIssue, bzBots, bzReport,
    ECART_MAX, composite, communes, issueReelle, motifAnnule, penchant, beMultReel, beMaxReel, prixReel, misesReel, etatReel, reglerReel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
