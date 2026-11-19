/* WIMORO — pari éclair à cours réels, par client (module pur) */

/* =====================================================================================
 *  Le pari éclair à cours réels, PAR CLIENT (partie D, 19 nov. 2026)
 *  ------------------------------------------------------------------------------------
 *  L'interrupteur global eclair.cours_reels reste éteint : la base fige toutes les manches « simulées » et le site en
 *  ligne (l'ancien front) joue exactement comme avant. Le nouveau front joue pourtant les jeux à vraie source sur les
 *  fixations du serveur (écrites une fois à chaque frontière de manche, jamais changées). Ce module dit, à partir de ces
 *  seules fixations, si une manche est réelle pour lui et avec quels paramètres. Il est utilisé À L'IDENTIQUE :
 *    - par le navigateur (js/direct.js : visiteur, compte démo, vrai compte) ;
 *    - par l'Edge Function « eclair » (copie conforme : supabase/functions/eclair/moteur-reel.js), qui règle les mises
 *      marquées « reel » d'un vrai compte. Le test tests/eclair-direct-moteur.spec.mjs vérifie que les deux copies sont
 *      identiques.
 *  Il s'appuie sur le moteur (MoteurEclair, js/moteur-eclair.js), chargé avant lui.
 *
 *  La règle :
 *    - une manche r d'un jeu à vraie source est RÉELLE quand la fixation r − 2 de son actif est « ok » et était écrite
 *      au début de la manche r (donc connue de tous avant l'ouverture des mises) ; sinon le jeu est EN PAUSE pour cette
 *      manche (place fermée, clé absente, données muettes) ;
 *    - ses paramètres : la fréquence du break even du modèle (pbe vide : celle de beP), les sources communes exigées de
 *      son actif aux deux bouts (2 pour la crypto, 1 pour une action), le break even ouvert ;
 *    - son résultat : celui du moteur v2 (reglerReel) sur les fixations r et r + 1 ; tant que l'une manque et que le
 *      délai de grâce court, la manche attend ; passé ce délai sans elle, elle est annulée (mise rendue).
 * ===================================================================================== */
(function (racine) {
  'use strict';
  /* les jeux à vraie source et l'actif de leurs fixations (comme wm.eclair_jeux) */
  const ACTIF = { btc: 'btc', eth: 'eth', sol: 'sol', doge: 'doge', vol: 'btc', ndx: 'qqq', spx: 'spy', nvda: 'nvda', tsla: 'tsla' };
  /* sources concordantes exigées aux deux bouts d'une manche (comme wm.eclair_actifs.smin) */
  const SMIN = { btc: 2, eth: 2, sol: 2, doge: 2, nvda: 1, tsla: 1, spy: 1, qqq: 1 };
  /* les jeux ouverts 24 h sur 24 : proposés quand un jeu de bourse est en pause */
  const H24 = ['btc', 'eth', 'sol', 'doge', 'vol'];
  /* délai de grâce de la fixation de fin, en secondes (réglage eclair.grace_s, 120 par défaut) */
  const GRACE_S = 120;
  const t0 = r => racine.MoteurEclair.t0(r);

  /* paramètres d'une manche réelle du client */
  const parametres = jeu => ({ pbe: null, smin: SMIN[ACTIF[jeu]] || 1, beoff: false });
  /* la manche r du jeu est-elle réelle ? F : { <manche>: fixation } de l'actif du jeu */
  function reelle(jeu, r, F) {
    const a = ACTIF[jeu] && F ? F[r - 2] : null;
    return !!a && a.e === 'ok' && typeof a.a === 'number' && a.a <= t0(r);
  }
  /* les fixations utiles à la manche r : r − 2 et r − 1 (penchant de la foule), r et r + 1 (départ et fin) */
  function fenetre(F, r) { const o = {}; for (let k = r - 2; k <= r + 1; k++) if (F && F[k]) o[k] = F[k]; return o; }
  /* le contexte du moteur v2 pour la manche r du client */
  const ctx = (jeu, r, F) => ({ mode: 'reel', P: parametres(jeu), F: fenetre(F, r) });
  /* le contexte d'une mise, d'après ce que rend la base (srv_eclair_reelles : mode figé, raison, configuration du jeu,
     fixations Fc) ; null si la manche n'est pas réelle pour le client (jeu en pause, jeu simulé, ou interrupteur allumé :
     la base s'en charge alors elle-même) */
  function contexteMise(jeu, r, c) {
    if (!c || c.mode !== 'simule' || c.raison !== 'interrupteur' || c.config !== 'reel' || !ACTIF[jeu]) return null;
    return reelle(jeu, r, c.Fc) ? ctx(jeu, r, c.Fc) : null;
  }
  /* une manche attend son résultat : départ ou fin pas encore fixé, et délai de grâce pas écoulé (t en ms, grace en s) */
  const attente = (r, F, t, grace) => (!(F && F[r]) || !(F && F[r + 1])) && t < t0(r + 1) + (grace > 0 ? grace : GRACE_S) * 1000;

  racine.MoteurReel = { ACTIF, SMIN, H24, GRACE_S, parametres, reelle, fenetre, ctx, contexteMise, attente };
})(typeof globalThis !== 'undefined' ? globalThis : this);
