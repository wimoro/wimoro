/* Faux client Supabase pour les tests : il remplace js/vendor/supabase-*.js.
 * Il imite le contrat du vrai back (fonctions api_*, service de connexion, authentification), garde son état dans
 * localStorage pour survivre à un rechargement, enregistre tous les appels et permet de simuler le temps réel.
 *
 * Configuration (avant le chargement) : window.__FAKE_SB__ = {
 *   session   : { user: { id, email } } | null      session ouverte au départ
 *   etat      : { me: {…}, positions: […], … }      morceaux d'état fusionnés dans l'état par défaut du joueur connecté
 *   comptes   : { 'a@b.c': { id, password, pseudo } }  comptes existants (connexion)
 *   chat      : { general: [ { id, u, k, text, at } ] }, fiches : { <id du joueur> : { n, t, d, … } }   messages et auteurs déjà présents
 *   marches   : [ { market_id, current_probability, volume_total, liquidity_depth, participants_count, status, price_history } ]
 *               un marché absent de la liste est créé à la demande avec les valeurs de départ du site
 *   rpc       : { nom: valeur | { error: { message } } }   réponses forcées
 *   catalogue : { rev, en_ligne, cats, m, x, credits }   catalogue des marchés réels (api_catalogue) ; m au format de
 *               wm.fiche_vue, textes dans les trois langues (t: { fr: { q, s, r }, en, he }) ; absent → 3 fiches d'exemple
 *   operations: [ { id, k, montant, solde, ref, at } ]   relevé d'argent du joueur (api_operations)
 *   fn        : { eclair: 'mises_fermees' }                refus forcé d'une Edge Function (code)
 *   autoconfirm : false  → l'inscription demande une confirmation d'e-mail (pas de session)
 *   otp       : '123456'  code accepté par verifyOtp
 *   latence   : ms
 * }
 * Inspection : window.__fakeSB.calls, .db, .count(kind, name), .emit(sujet, événement, données), .marche(id), .tick(ids, extra)
 */
(function () {
  'use strict';
  var CFG = window.__FAKE_SB__ || {};
  var DBKEY = '__fakedb__';
  var clone = function (x) { return x === undefined ? x : JSON.parse(JSON.stringify(x)); };
  var fusion = function (a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) fusion(a[k], b[k]); else a[k] = clone(b[k]); } return a; };

  function etatNeuf(uid, email, pseudo, nouveau) {
    return {
      v: 1, uid: uid,
      me: { n: pseudo, email: email, photo: '', color: '#2448FF', bio: '', wallet: '', interests: [], kyc: false, kycAt: null,
        onboarded: !nouveau, welcomed: !nouveau, obBonus: !nouveau, pub: true, since: Date.now() - (nouveau ? 0 : 30 * 864e5), rankSeen: 0,
        balance: nouveau ? 0 : 500, xp: 0, settled: 0, wins: 0, played: 0, flashWins: 0, flashStreak: 0, flashBest: 0, flashProfit: 0,
        followed: 0, deposits: 0, depDay: '', streak: 1, bestStreak: 1, pos: 38901, msgsTotal: 0, chatXP: 0, chatDay: '', maxBet: 0,
        realized: 0, contraWins: 0, followers: 0, copiers: 0 },
      positions: [], history: [], deps: [], wds: [], notifs: [],
      missions: [{ id: 'chat1', type: 'chat', goal: 1, have: 0, xp: 20, go: '#chat', claimed: false }, { id: 'dep1', type: 'dep', goal: 1, have: 0, xp: 100, go: '#depot', claimed: false }, { id: 'fb1', type: 'flashbet', goal: 1, have: 0, xp: 50, go: '#eclair', claimed: false }],
      badges: [], friends: [], freqIn: [], freqOut: [], following: [], watch: [], prefs: {}, users: {},
      rg: { lim: { day: 0, week: 0, month: 0 }, pend: {}, pause: 0, excl: 0 }
    };
  }

  var db;
  try { db = JSON.parse(localStorage.getItem(DBKEY) || 'null'); } catch (e) { db = null; }
  if (!db) {
    db = { session: clone(CFG.session || null), comptes: clone(CFG.comptes || {}), etats: {}, marches: {}, ops: {}, chat: clone(CFG.chat || {}), fiches: clone(CFG.fiches || {}), analyses: clone(CFG.analyses || {}), seq: 1 };
    if (CFG.clans) db.clans = clone(CFG.clans);                                     /* clans de joueurs déjà créés (panneau d'administration) */
    if (CFG.aal) db.aal = CFG.aal;
    (CFG.marches || []).forEach(function (x) { db.marches[x.market_id] = { def: x.def ? clone(x.def) : undefined, p: +x.current_probability, d0: x.d0 == null ? null : +x.d0, vol: +(x.volume_total || 0), people: x.participants_count | 0, liq: x.liquidity_depth == null ? null : +x.liquidity_depth, st: x.status || 'open', hot: 0, ph: clone(x.price_history || []) }; });
    if (db.session) { var u0 = db.session.user; db.etats[u0.id] = fusion(etatNeuf(u0.id, u0.email || '', 'realuser', false), CFG.etat || {}); }
  }
  var persist = function () { try { localStorage.setItem(DBKEY, JSON.stringify(db)); } catch (e) {} };
  persist();

  var calls = [], authCbs = [], canaux = [], CLE = 'wimoro-auth';
  var ranger = function () { try { if (db.session) localStorage.setItem(CLE, JSON.stringify({ faux: true, user: db.session.user })); else localStorage.removeItem(CLE); } catch (e) {} };
  var rec = function (kind, name, args) { var c = { kind: kind, name: name, args: clone(args === undefined ? null : args), at: Date.now() }; calls.push(c); (db.journal = db.journal || []).push(c); if (db.journal.length > 300) db.journal.shift(); try { localStorage.setItem(DBKEY, JSON.stringify(db)); } catch (e) {} };
  var uid = function () { return db.session && db.session.user ? db.session.user.id : null; };
  var etat = function () { var id = uid(); if (!id) throw { message: 'session' }; return db.etats[id]; };
  var fireAuth = function (ev) { ranger(); authCbs.slice().forEach(function (cb) { try { cb(ev, clone(db.session)); } catch (e) { console.error(e); } }); };
  var reponse = function (ev) { return { me: clone(etat().me), ev: ev || [] }; };
  var notif = function (ic, code, p, href) { var n = { id: 'n' + (db.seq++), ic: ic, code: code, p: p || {}, href: href || '', at: Date.now(), read: false }; etat().notifs.unshift(n); return { k: 'notif', n: clone(n) }; };
  var pseudoPris = function (p, sauf) { p = String(p).toLowerCase(); for (var id in db.etats) if (id !== sauf && String(db.etats[id].me.n).toLowerCase() === p) return true; return ['admin', 'wimoro', 'user26'].indexOf(p) >= 0; };

  /* ----- Les fonctions du contrat ----- */
  var RPC = {
    api_state: function () { var e0 = etat(); regler(e0, []); rgMaj(e0, []); stacksAvancer(e0, []); guerresAvancer(e0, []); var e = clone(e0); e.stacks = stacksJson(e0); delete e.stacksL; e.deps = e0.deps.map(depJson); e.eclair = eclairJson(e0); delete e.eclairMises; e.serie = serieJson(e0); e.duels = duelsJson(e0); delete e.duelsL; e.combos = clone(e0.combosL || []); delete e.combosL; clanAvancer(e0, []); e.clan = clanEtat(e0); delete e.clanM; delete e.clanApps; delete e.clanParti; e.copies = copiesEtat(e0); delete e.copiesL; propsAvancer([]); e.props = propsEtat(); if (!e.ref) e.ref = { code: 'TESTEUR-7K3', bonus: 10, by: null, list: [] }; e.blitz = Object.keys(e0.blitzJ || {}).filter(function (i) { return !e0.blitzJ[i].regle; }).map(Number); delete e.blitzJ; e.now = Date.now() + (CFG.decalage || 0); return e; },
    api_pseudo_libre: function (a) { return /^[A-Za-z0-9._]{3,20}$/.test(a.p_pseudo || '') && !pseudoPris(a.p_pseudo); },
    api_profile_update: function (a) { var p = a.p || {}, me = etat().me;
      if ('n' in p) { if (!/^[A-Za-z0-9._]{3,20}$/.test(p.n || '')) throw { message: 'pseudo_invalide' }; if (pseudoPris(p.n, uid())) throw { message: 'pseudo_pris' }; me.n = p.n; }
      if ('bio' in p) { if ((p.bio || '').length > 160) throw { message: 'bio_trop_longue' }; me.bio = p.bio || ''; }
      if ('color' in p) me.color = p.color; if ('photo' in p) { if (!/^(g:[a-z0-9-]{1,24})?$/.test(p.photo || '')) throw { message: 'photo_invalide' }; me.photo = p.photo || ''; }
      if ('interests' in p) me.interests = clone(p.interests || []); if ('pub' in p) me.pub = !!p.pub; if ('welcomed' in p) me.welcomed = true;
      return reponse(); },
    api_onboarding: function (a) { var p = a.p || {}, me = etat().me, ev = [];
      if (p.bonus && !me.obBonus) { me.obBonus = true; me.xp += 100; ev.push({ k: 'xp', n: 100, src: 'bienvenue' }); ev.push(notif('trophy', 'rank_up', { t: 0, d: 1 }, '#rang')); }
      if (p.done) me.onboarded = true;
      return reponse(ev); },
    api_rank_seen: function (a) { var me = etat().me; me.rankSeen = Math.max(me.rankSeen || 0, a.p_rang | 0); return null; },
    api_prefs_save: function (a) { etat().prefs = clone(a.p_prefs); return null; },
    api_notifs_read: function () { etat().notifs.forEach(function (n) { n.read = true; }); return null; },
    api_notif_hide: function (a) { var e = etat(); e.notifs = a.p_id ? e.notifs.filter(function (n) { return n.id !== a.p_id; }) : []; return null; },
    api_present: function () { return null; },
    /* Panel d'administration : même contrat que wm.admin (une action, des paramètres), sur un petit modèle en mémoire. */
    api_admin: function (a) { var act = a.p_action, p = a.p || {}; if (act === 'moi') return { admin: !!CFG.admin }; if (!CFG.admin) throw { message: 'interdit' };
      if (CFG.equipe && !aalOk()) throw { message: 'mfa_requise' };                       /* comme wm.admin : la double authentification, dès qu'un code est enrôlé */
      var A = db.admin = db.admin || fusion({ joueurs: [], marches: [], msgs: [], bots: { actif: true, intensite: 1, chat: 1 }, journal: [] }, CFG.adminData || {});
      var J = function (id) { var j = A.joueurs.filter(function (x) { return x.id === id; })[0]; if (!j) throw { message: 'joueur_inconnu' }; return j; };
      var M = function (id) { var m = A.marches.filter(function (x) { return x.id === id; })[0]; if (!m) throw { message: 'marche_inconnu' }; if (m.st === 'resolved') throw { message: 'deja_resolu' }; return m; };
      var note = function (action, cible, d) { A.journal.unshift({ a: action, cible: cible, d: d || {}, par: 'chef', at: Date.now() }); };
      var fiche = function (id) { return { j: clone(J(id)), ops: [], journal: clone(A.journal.filter(function (x) { return x.cible === id; }).slice(0, 10)) }; };
      var chiffres = function () { return { inscrits: A.joueurs.filter(function (j) { return !j.bot; }).length, inscrits_7j: 1, actifs_24h: 1, actifs_7j: 2, bots: 10000, marches_ouverts: A.marches.filter(function (m) { return m.st !== 'resolved'; }).length,
        volume_total: 1234567, mises_24h: 50, positions: 3, messages_24h: A.msgs.length, soldes: A.joueurs.reduce(function (s, j) { return s + (j.bot ? 0 : j.balance); }, 0), base_mo: 80, bots_cfg: clone(A.bots), present: true }; };
      var motif = function () { if (String(p.motif || '').trim().length < 3) throw { message: 'motif_requis' }; };
      var r, j, m, q;
      switch (act) {
        case 'chiffres': r = chiffres(); break;
        case 'joueurs': q = String(p.q || '').toLowerCase(); r = { joueurs: clone(A.joueurs.filter(function (x) { return q ? (x.n.toLowerCase().indexOf(q) >= 0 || String(x.email).toLowerCase().indexOf(q) >= 0) : !x.bot; })) }; break;
        case 'joueur': r = fiche(p.id); break;
        case 'solde': motif(); j = J(p.id); if (!(+p.delta)) throw { message: 'montant_invalide' }; if (j.balance + +p.delta < 0) throw { message: 'solde_negatif' }; j.balance = Math.round((j.balance + +p.delta) * 100) / 100; note('solde', p.id, { delta: +p.delta, motif: p.motif }); r = fiche(p.id); break;
        case 'xp': j = J(p.id); j.xp = Math.max(0, j.xp + (+p.delta | 0)); note('xp', p.id, { delta: +p.delta }); r = fiche(p.id); break;
        case 'rang': j = J(p.id); j.t = +p.t; j.d = +p.d; note('rang', p.id, { t: +p.t, d: +p.d }); r = fiche(p.id); break;
        case 'kyc': j = J(p.id); j.kyc = !!p.ok; note('kyc', p.id, { ok: !!p.ok }); r = fiche(p.id); break;
        case 'suspendre': j = J(p.id); if (+p.jours) { motif(); j.susp = +p.jours === -1 ? -1 : Date.now() + p.jours * 864e5; j.suspMotif = p.motif; note('suspension', p.id, { motif: p.motif }); } else { j.susp = null; j.suspMotif = null; note('suspension_levee', p.id); } r = fiche(p.id); break;
        case 'marches': r = { marches: clone(A.marches) }; break;
        case 'marche': if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(p.id || '')) throw { message: 'identifiant_invalide' }; if (String(p.q || '').length < 8) throw { message: 'question_invalide' };
          m = A.marches.filter(function (x) { return x.id === p.id; })[0];
          if (m) { m.q = p.q; m.short = p.short || m.short; m.cat = p.cat; m.date = p.date; m.time = p.time; m.ref = +p.p; m.heat = +p.heat; m.rules = p.rules; note('marche_modifie', p.id); }
          else { A.marches.push({ id: p.id, q: p.q, short: p.short || p.q.slice(0, 40), cat: p.cat, st: 'open', issue: null, p: +p.p, ref: +p.p, vol: 0, date: p.date, time: p.time, heat: +p.heat, rules: p.rules, parent: null, cree: true, positions: 0 }); note('marche_cree', p.id); }
          r = { marches: clone(A.marches) }; break;
        case 'marche_etat': m = M(p.id); m.st = p.etat; note(p.etat === 'closed' ? 'marche_ferme' : 'marche_rouvert', p.id); r = { marches: clone(A.marches) }; break;
        case 'resoudre': m = M(p.id); m.st = 'resolved'; m.issue = p.issue; q = { joueurs: m.positions, verse: 120.5 }; m.positions = 0; note('marche_resolu', p.id, { issue: p.issue, joueurs: q.joueurs, verse: q.verse }); r = { marches: clone(A.marches), reglement: q, autres: {} }; break;
        case 'chat': r = { msgs: clone(A.msgs) }; break;
        case 'masquer': q = A.msgs.length; A.msgs = A.msgs.filter(function (x) { return String(x.id) !== String(p.id); }); if (A.msgs.length === q) throw { message: 'message_inconnu' }; note('message_masque', null, {}); r = { msgs: clone(A.msgs) }; break;
        case 'bots': ['intensite', 'chat'].forEach(function (k) { if (k in p) { if (!(+p[k] >= 0 && +p[k] <= 3)) throw { message: 'montant_invalide' }; A.bots[k] = +p[k]; } }); if ('actif' in p) A.bots.actif = !!p.actif; note('bots', null, clone(A.bots)); r = chiffres(); break;
        case 'journal': r = { journal: clone(A.journal) }; break;
        default: throw { message: 'action_inconnue' };
      }
      persist(); return r; },
    api_chat_seen: function () { return null; },
    api_leaderboard: function () { var ids = Object.keys(db.fiches).filter(function (id) { return id !== uid() && db.fiches[id].pub !== 0; }).sort(function (x, y) { return (db.fiches[y].profit || 0) - (db.fiches[x].profit || 0); }).slice(0, 50), users = {};
      ids.forEach(function (id) { users[id] = ficheDe(id); }); return { ids: ids, users: users }; },
    api_dm_history: function (a) { dmOk(a.p_user, false); var L = (db.chat['dm:' + [uid(), a.p_user].sort().join(':')] || []).slice(-60), users = {}; users[a.p_user] = ficheDe(a.p_user); return { u: a.p_user, msgs: L.map(msgPropre), users: users, mes: mesDe(L) }; },
    /* Duels de stack : mêmes règles que supabase/migrations/…_stacks.sql (adversaire simulé : un bot ; trajectoire simplifiée) */
    api_stacks: function () { var e = etat(), ev = [], n = stacksAvancer(e, ev); if (n) { var rep = reponse(ev); rep.stacks = stacksJson(e); return rep; } return { stacks: stacksJson(e) }; },
    api_stack_create: function (a) { var p = a.p || {}, e = etat(), me = e.me, cle = uid() + ':' + p.key, buyin = Math.round(Number(p.buyin) * 100) / 100, rep;
      if (!(buyin >= 5 && buyin <= 1000)) throw { message: 'montant_invalide' }; if (!p.key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { rep = clone(db.ops[cle]); rep.rejoue = true; return rep; }
      if (e.rg && e.rg.pause > Date.now()) throw { message: 'pause' }; var f = db.fiches[p.opp]; if (!f || p.opp === uid()) throw { message: 'joueur_inconnu' }; if (!f.bot) throw { message: 'stack_joueur_reel' };
      var L = e.stacksL = e.stacksL || []; if (L.filter(function (x) { return x.st === 'active'; }).length >= 5) throw { message: 'trop_de_duels' }; if (me.balance < buyin) throw { message: 'solde_insuffisant' };
      me.balance = Math.round((me.balance - buyin) * 100) / 100;
      var x = { id: db.seq++, opp: p.opp, buyin: buyin, st: 'active', at: Date.now(), endAt: Date.now() + 7 * 86400e3, settleAt: null, ref: resultatDe(e), fin: 1000 + ((db.seq * 37) % 300) - 100 };
      L.unshift(x); rep = reponse([notif('swords', 'stack_lance', { id: x.id, u: p.opp, k: buyin }, '#duels')]); rep.stack = x.id; rep.stacks = stacksJson(e); db.ops[cle] = clone(rep); return rep; },
    /* Duels entre amis sur un marché : mêmes règles que supabase/migrations/…_duels.sql (frais simplifiés : 2 %) */
    api_duels: function () { return duelsJson(etat()); },
    api_duel_create: function (a) { var p = a.p || {}, e = etat(), me = e.me, cle = uid() + ':' + p.key, r2 = function (x) { return Math.round(x * 100) / 100; }, rep;
      if (['oui', 'non'].indexOf(p.side) < 0) throw { message: 'cote_invalide' }; if (!(p.stake >= 5 && p.stake <= 5000)) throw { message: 'montant_invalide' }; if (!p.key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { rep = clone(db.ops[cle]); rep.rejoue = true; return rep; }
      if (e.rg && e.rg.pause > Date.now()) throw { message: 'pause' }; var m = marche(p.m); if (!m) throw { message: 'marche_inconnu' }; if (m.st !== 'open') throw { message: 'marche_ferme' };
      if (p.opp && e.friends.indexOf(p.opp) < 0) throw { message: 'pas_amis' };
      var fee = r2(p.stake * .02), prix = Math.round(p.side === 'oui' ? m.p : 100 - m.p); if (me.balance < p.stake + fee) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - p.stake - fee); me.played++;
      var d = { id: db.seq++, code: 'D' + ('000000' + db.seq.toString(16).toUpperCase()).slice(-7), m: p.m, side: p.side, by: uid(), opp: p.opp || null, stake: +p.stake, fee: fee, st: 'open', at: Date.now(), expiresAt: Date.now() + 48 * 3600e3,
        price0: prix, price: null, oppStake: null, oppFee: null, pot: null, winSide: null, acceptAt: null, settleAt: null };
      if (p.opp && (db.fiches[p.opp] || {}).bot) { d.st = 'active'; d.price = prix; d.pot = r2(d.stake * 100 / prix); d.oppStake = r2(d.pot * (100 - prix) / 100); d.oppFee = 0; d.acceptAt = Date.now(); }
      (e.duelsL = e.duelsL || []).unshift(d); rep = reponse([]); rep.duel = clone(d); rep.duels = duelsJson(e); db.ops[cle] = clone(rep); return rep; },
    api_duel_accept: function (a) { var p = a.p || {}, e = etat(), me = e.me, L = e.duelsL = e.duelsL || [], code = String(p.code || '').toUpperCase(), r2 = function (x) { return Math.round(x * 100) / 100; };
      var d = L.filter(function (x) { return (p.id && x.id === +p.id) || (code && x.code === code); })[0];
      if (!d && code && (CFG.liens || {})[code]) { d = clone(CFG.liens[code]); L.unshift(d); }
      if (!d || d.st !== 'open' || d.by === uid() || (d.opp && d.opp !== uid())) throw { message: 'duel_indisponible' };
      var m = marche(d.m); if (!m || m.st !== 'open') throw { message: 'marche_ferme' };
      var prix = Math.round(d.side === 'oui' ? m.p : 100 - m.p), pot = r2(d.stake * 100 / prix), autre = r2(pot * (100 - prix) / 100), fee = r2(autre * .02);
      if (me.balance < autre + fee) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - autre - fee); me.played++; d.opp = uid(); d.st = 'active'; d.price = prix; d.pot = pot; d.oppStake = autre; d.oppFee = fee; d.acceptAt = Date.now();
      var rep = reponse([]); rep.duel = clone(d); rep.duels = duelsJson(e); return rep; },
    api_duel_close: function (a) { var e = etat(), d = (e.duelsL || []).filter(function (x) { return x.id === +a.p_id; })[0]; if (!d || d.st !== 'open') throw { message: 'duel_indisponible' };
      if (a.p_action === 'cancel' && d.by === uid()) { e.me.balance = Math.round((e.me.balance + d.stake) * 100) / 100; d.st = 'expired'; } else if (a.p_action === 'decline' && d.opp === uid()) d.st = 'declined'; else throw { message: 'duel_indisponible' };
      d.settleAt = Date.now(); var rep = reponse([]); rep.duels = duelsJson(e); return rep; },
    api_duel_code: function (a) { var code = String(a.p_code || '').toUpperCase(), d = (CFG.liens || {})[code], u = {}; if (!d) throw { message: 'duel_indisponible' }; u[d.by] = ficheDe(d.by); return { duel: clone(d), users: u }; },
    /* Paris combinés : mêmes règles que supabase/migrations/…_combines.sql */
    api_combos: function () { return clone(etat().combosL || []); },
    api_combo_place: function (a) { var p = a.p || {}, e = etat(), me = e.me, cle = uid() + ':' + p.key, r2 = function (x) { return Math.round(x * 100) / 100; }, legs = [], vus = {}, mult = 1, rep;
      if (!(p.stake >= 2 && p.stake <= 1000)) throw { message: 'montant_invalide' }; if (!p.key) throw { message: 'cle_absente' }; if (!Array.isArray(p.legs) || p.legs.length < 2 || p.legs.length > 6) throw { message: 'combine_incomplet' };
      if (db.ops[cle]) { rep = clone(db.ops[cle]); rep.rejoue = true; return rep; }
      if (e.rg && e.rg.pause > Date.now()) throw { message: 'pause' };
      p.legs.forEach(function (l) { var m = marche(l.m); if (!m) throw { message: 'marche_inconnu' }; if (m.st !== 'open') throw { message: 'marche_ferme' }; if (['oui', 'non'].indexOf(l.s) < 0) throw { message: 'cote_invalide' };
        if (vus[l.m]) throw { message: 'selection_en_double' }; vus[l.m] = 1; var prix = l.s === 'oui' ? m.p : 100 - m.p, mu = 100 / Math.max(1, prix); mult *= mu; legs.push({ m: l.m, s: l.s, price: prix, mult: mu, res: null }); });
      if (me.balance < p.stake) throw { message: 'solde_insuffisant' };
      var brut = r2(p.stake * mult), frais = r2(brut * .05), c = { id: db.seq++, at: Date.now(), stake: +p.stake, mult: mult, fee: frais, pay: Math.min(r2(brut - frais), 50000), status: 'open', legs: legs, cash: null, endAt: null };
      me.balance = r2(me.balance - p.stake); me.played++; (e.combosL = e.combosL || []).unshift(c);
      var ev = [], av = rangDe(me), n = 10 + 5 * legs.length; me.xp += n; ev.push({ k: 'xp', n: n, src: 'combo' }); rangMonte(me, av, ev);
      rep = reponse(ev); rep.combo = clone(c); rep.combos = clone(e.combosL); db.ops[cle] = clone(rep); return rep; },
    api_combo_cash: function (a) { var e = etat(), me = e.me, c = (e.combosL || []).filter(function (x) { return x.id === +a.p_id; })[0], pr = 1; if (!c || c.status !== 'open') throw { message: 'combine_indisponible' };
      c.legs.forEach(function (l) { if (l.res === 'lost') pr = 0; else if (l.res !== 'won') { var m = marche(l.m); pr *= (l.s === 'oui' ? m.p : 100 - m.p) / 100; } });
      var v = Math.floor(c.pay * pr * .95 * 100) / 100; if (v <= 0) throw { message: 'combine_indisponible' };
      var pnl = Math.round((v - c.stake) * 100) / 100, h = { k: 'res', q: 'combo|c|' + c.legs.length + '|' + v, s: 'oui', win: pnl >= 0, pnl: pnl, at: Date.now() };
      c.status = 'cashed'; c.cash = v; c.endAt = Date.now(); me.balance = Math.round((me.balance + v) * 100) / 100; me.settled++; if (pnl >= 0) me.wins++; me.realized = Math.round(((me.realized || 0) + pnl) * 100) / 100; e.history.unshift(clone(h));
      var rep = reponse([]); rep.combo = clone(c); rep.combos = clone(e.combosL); rep.hist = [h]; return rep; },
    api_dm_list: function () { var ids = [], users = {}; for (var r in db.chat) { var p = r.split(':'); if (p[0] === 'dm' && (p[1] === uid() || p[2] === uid()) && db.chat[r].length) { var o = p[1] === uid() ? p[2] : p[1]; ids.push(o); users[o] = ficheDe(o); } } return { ids: ids, users: users }; },
    api_dm_send: function (a) { dmOk(a.p_user, true); var e = etat(), t = String(a.p_text || '').trim(), ev = [];
      if (!t) throw { message: 'message_vide' }; if (t.length > 280) throw { message: 'message_trop_long' };
      var m = { id: db.seq++, u: uid(), k: 'msg', text: t, at: Date.now() }, r = 'dm:' + [uid(), a.p_user].sort().join(':'); (db.chat[r] = db.chat[r] || []).push(m);
      e.me.msgsTotal = (e.me.msgsTotal | 0) + 1; var rep = reponse(ev); rep.msg = clone(m); return rep; },
    api_friend: function (a) { var e = etat(), me = e.me, u = a.p_user, ev = [], res = 'rien', f = db.fiches[u];
      if (['add', 'accept', 'cancel', 'decline', 'remove'].indexOf(a.p_action) < 0) throw { message: 'action_invalide' };
      if (!u || u === uid() || !f) throw { message: 'joueur_inconnu' };
      var oter = function (L) { var i = L.indexOf(u); if (i >= 0) L.splice(i, 1); }, action = a.p_action;
      var lier = function () { oter(e.freqIn); oter(e.freqOut); if (e.friends.indexOf(u) < 0) e.friends.push(u); e.amisXp = e.amisXp || {}; if (!e.amisXp[u]) { e.amisXp[u] = 1; var av = rangDe(me); me.xp += 15; ev.push({ k: 'xp', n: 15, src: 'ami' }); rangMonte(me, av, ev); } res = 'amis'; };
      if (action === 'add') { if (e.friends.indexOf(u) >= 0) res = 'amis'; else if (e.freqIn.indexOf(u) >= 0) action = 'accept'; else if (f.bot) lier(); else { if (e.freqOut.indexOf(u) < 0) e.freqOut.push(u); res = 'envoyee'; } }
      if (action === 'accept') { if (e.freqIn.indexOf(u) < 0) throw { message: 'demande_absente' }; lier(); }
      else if (action === 'decline') { oter(e.freqIn); res = 'refusee'; }
      else if (action === 'cancel') { oter(e.freqOut); res = 'annulee'; }
      else if (action === 'remove') { oter(e.friends); res = 'retire'; }
      var rep = reponse(ev), users = {}; e.friends.concat(e.freqIn, e.freqOut, [u]).forEach(function (x) { users[x] = ficheDe(x); }); e.users = users;
      rep.friends = clone(e.friends); rep.freqIn = clone(e.freqIn); rep.freqOut = clone(e.freqOut); rep.users = users; rep.r = res; return rep; },
    api_users_search: function (a) { var q = String(a.p_q || '').trim().toLowerCase(), ids = [], users = {};
      if (q.length >= 2 && /^[a-z0-9._]+$/.test(q)) for (var id in db.fiches) if (id !== uid() && String(db.fiches[id].n).toLowerCase().indexOf(q) >= 0 && ids.length < 10) { ids.push(id); users[id] = ficheDe(id); }
      return { ids: ids, users: users }; },
    /* Analyses du Mode Pro : mêmes règles que supabase/migrations/…_analyses.sql (remise au propre simplifiée : champs connus, types, couleurs, textes) */
    api_ana_share: function (a) { var e = etat(), me = e.me, ev = [], t = String(a.p_text || '').trim(), salons = a.p_rooms || [], vus = {}, ami = null;
      if (t.length > 280) throw { message: 'message_trop_long' }; if (!salons.length || salons.length > 4) throw { message: 'salon_indisponible' };
      var propre = anaPropre(a.p_snap);
      salons.forEach(function (r) { if (vus[r]) throw { message: 'salon_indisponible' }; vus[r] = 1;
        if (/^dm:/.test(r)) { if (ami) throw { message: 'salon_indisponible' }; ami = r.slice(3); dmOk(ami, true); } else if (/^m:/.test(r)) { if (r !== 'm:' + propre.m) throw { message: 'salon_indisponible' }; } else salonOk(r); });
      db.analyses = db.analyses || {}; if (Object.keys(db.analyses).filter(function (k) { return db.analyses[k].u === uid() && db.analyses[k].at > Date.now() - 864e5; }).length >= 12) throw { message: 'trop_d_analyses' };
      var id = db.seq++, at = Date.now(), msgs = {}, ref = { ana: id, m: propre.m, iv: propre.iv, ni: propre.inds.length, nd: propre.dr.length }; db.analyses[id] = { u: uid(), at: at, snap: propre };
      salons.forEach(function (r) { var m = { id: db.seq++, u: uid(), k: 'ana', text: t, at: at, ana: clone(ref) }, salon = /^dm:/.test(r) ? 'dm:' + [uid(), ami].sort().join(':') : r;
        (db.chat[salon] = db.chat[salon] || []).push(m); msgs[r] = clone(m);
        if (!/^dm:/.test(r)) { var d = clone(m); d.f = ficheDe(uid()); setTimeout(function () { window.__fakeSB.emit(/^clan:/.test(r) ? r : 'salon:' + r, 'msg', d); }, 5); } });
      var avant = rangDe(me), jr = jour(); if (me.chatDay !== jr) { me.chatDay = jr; me.chatXP = 0; }
      var gain = Math.max(0, Math.min(2, 20 - me.chatXP)); me.chatXP += gain; me.msgsTotal = (me.msgsTotal | 0) + 1;
      if (gain) { me.xp += gain; ev.push({ k: 'xp', n: gain, src: 'chat' }); rangMonte(me, avant, ev); }
      missionAvance(e, 'chat', ev); if (salons.some(function (r) { return /^m:/.test(r); })) missionAvance(e, 'chatm', ev);
      persist(); var rep = reponse(ev); rep.msgs = msgs; rep.snap = Object.assign(clone(propre), { id: 'a' + id, at: at }); return rep; },
    api_ana: function (a) { var ids = (a.p_msgs || []).map(Number), snaps = {}, k = etat().clanM; if (!ids.length || ids.length > 6) throw { message: 'analyse_inconnue' };
      for (var r in db.chat) { if (!(r === 'general' || /^m:/.test(r) || (k && r === 'clan:' + k.id) || (/^dm:/.test(r) && r.split(':').indexOf(uid()) > 0))) continue;
        db.chat[r].forEach(function (m) { var x = m.k === 'ana' && m.ana && (db.analyses || {})[m.ana.ana]; if (x && ids.indexOf(m.id) >= 0) snaps[m.id] = Object.assign(clone(x.snap), { id: 'a' + m.ana.ana, at: x.at }); }); }
      return { snaps: snaps }; },
    api_chat_history: function (a) { salonOk(a.p_room); var L = (db.chat[a.p_room] || []).slice(-60), users = {};
      L.forEach(function (m) { users[m.u] = ficheDe(m.u); }); return { room: a.p_room, msgs: L.map(msgPropre), users: users, mes: mesDe(L) }; },
    /* Réactions : mêmes règles que supabase/migrations/…_reactions.sql (un clic pose, un second retire) */
    api_chat_react: function (a) { if (['🔥', '👀', '💸', '🎯'].indexOf(a.p_emoji) < 0) throw { message: 'reaction_invalide' };
      var salon = String(a.p_room || ''); if (/^dm:/.test(salon)) { dmOk(salon.slice(3), false); salon = 'dm:' + [uid(), salon.slice(3)].sort().join(':'); } else salonOk(salon);
      var m = (db.chat[salon] || []).filter(function (x) { return String(x.id) === String(a.p_msg); })[0]; if (!m) throw { message: 'message_indisponible' };
      m.r = m.r || {}; m.qui = m.qui || {}; var miennes = m.qui[uid()] = m.qui[uid()] || [], i = miennes.indexOf(a.p_emoji);
      if (i >= 0) { miennes.splice(i, 1); m.r[a.p_emoji] = Math.max(0, (m.r[a.p_emoji] | 0) - 1); if (!m.r[a.p_emoji]) delete m.r[a.p_emoji]; } else { miennes.push(a.p_emoji); m.r[a.p_emoji] = (m.r[a.p_emoji] | 0) + 1; }
      persist(); return { id: m.id, r: clone(m.r), my: clone(miennes) }; },
    api_chat_send: function (a) { salonOk(a.p_room); var e = etat(), me = e.me, ev = [], t = String(a.p_text || '').trim();
      if (!t) throw { message: 'message_vide' }; if (t.length > 280) throw { message: 'message_trop_long' };
      var miens = []; for (var r in db.chat) db.chat[r].forEach(function (m) { if (m.u === uid()) miens.push(m); });
      miens.sort(function (x, y) { return x.at - y.at; }); var d = miens[miens.length - 1];
      if (d && d.at > Date.now() - 1000) throw { message: 'trop_vite' };
      if (d && d.text === t && d.at > Date.now() - 30000) throw { message: 'message_repete' };
      if (miens.filter(function (m) { return m.at > Date.now() - 60000; }).length >= 12) throw { message: 'trop_de_messages' };
      var m = { id: db.seq++, u: uid(), k: 'msg', text: t, at: Date.now() }; (db.chat[a.p_room] = db.chat[a.p_room] || []).push(m);
      var avant = rangDe(me), jr = jour(); if (me.chatDay !== jr) { me.chatDay = jr; me.chatXP = 0; }
      var gain = Math.max(0, Math.min(2, 20 - me.chatXP)); me.chatXP += gain; me.msgsTotal = (me.msgsTotal | 0) + 1;
      if (gain) { me.xp += gain; ev.push({ k: 'xp', n: gain, src: 'chat' }); rangMonte(me, avant, ev); }
      missionAvance(e, 'chat', ev);
      var diffuse = clone(m); diffuse.f = ficheDe(uid()); persist();
      setTimeout(function () { window.__fakeSB.emit(/^clan:/.test(a.p_room) || a.p_room === 'vip' ? a.p_room : 'salon:' + a.p_room, 'msg', diffuse); }, 5);
      var rep = reponse(ev); rep.msg = clone(m); return rep; },
    api_mission_claim: function (a) { var e = etat(), me = e.me, m = e.missions.filter(function (x) { return x.id === a.p_id; })[0], ev = [];
      if (!m || m.claimed || m.have < m.goal) throw { message: 'mission_indisponible' };
      var avant = rangDe(me); m.claimed = true; me.xp += m.xp; ev.push({ k: 'xp', n: m.xp, src: 'mission' }); rangMonte(me, avant, ev);
      var rep = reponse(ev); rep.missions = clone(e.missions); return rep; },
    api_demo_deposit: function (a) {
      var e = etat(), me = e.me, p = a.p || {}, cle = uid() + ':' + a.p_key, amt = Number(p.amt), d;
      if (!a.p_key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { var deja = clone(db.ops[cle]); deja.rejoue = true; return deja; }
      if (!(amt > 0) || !isFinite(amt)) throw { message: 'montant_invalide' };
      if ((p.method || 'crypto') === 'crypto') {
        var C = ARGENT.coins[p.coin]; if (!C) throw { message: 'monnaie_invalide' };
        if (C.nets.indexOf(p.net) < 0) throw { message: 'reseau_invalide' };
        if (amt < C.min) throw { message: 'depot_min' };
        var usd = C.fixe ? r2(amt) : r2(Number(p.usd)); if (!(usd > 0)) throw { message: 'montant_invalide' };
        d = { coin: p.coin, net: p.net, amt: amt, usd: usd, need: Math.min(ARGENT.nets[p.net].conf, 12), pas: 650, method: null, fee: 0 };
      } else if (ARGENT.fiat[p.method]) {
        var X = ARGENT.fiat[p.method]; if (!me.kyc) throw { message: 'kyc_requis' };
        amt = r2(amt); if (amt < 10) throw { message: 'depot_min' }; if (amt > 5000) throw { message: 'depot_max' };
        var fee = r2(amt * X.df); d = { coin: 'USD', net: p.method, amt: amt, usd: r2(amt - fee), need: X.need, pas: X.pas, method: p.method, fee: fee };
      } else throw { message: 'moyen_invalide' };
      if (d.usd > 1e6) throw { message: 'depot_max' };
      rgMaj(e, []); if (e.rg.pause > Date.now()) throw { message: 'pause' };
      [['day', 864e5], ['week', 7 * 864e5], ['month', 30 * 864e5]].forEach(function (w) {
        var lim = +e.rg.lim[w[0]] || 0; if (!lim) return;
        var deja2 = e.deps.filter(function (x) { return !x.label && x.at >= Date.now() - w[1]; }).reduce(function (n, x) { return n + x.usd; }, 0);
        if (deja2 + d.usd > lim) throw { message: 'limite_depot' }; });
      d.id = 'dep-' + (db.seq++); d.at = Date.now(); d.due = d.at + d.need * d.pas; d.st = 'pending'; d.label = null; delete d.pas; e.deps.unshift(d);
      var rep = reponse([]); rep.dep = depJson(d); db.ops[cle] = clone(rep); return rep; },
    api_demo_withdraw: function (a) {
      var e = etat(), me = e.me, p = a.p || {}, cle = uid() + ':' + a.p_key, amt = r2(Number(p.amt)), w;
      if (!a.p_key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { var deja = clone(db.ops[cle]); deja.rejoue = true; return deja; }
      if (!(amt > 0) || !isFinite(amt)) throw { message: 'montant_invalide' };
      if ((p.method || 'crypto') === 'crypto') {
        var N = ARGENT.nets[p.net]; if (!N || N.wfee == null) throw { message: 'reseau_invalide' };
        var adr = String(p.addr || '').trim(); if (!(N.fmt === 'evm' ? /^0x[0-9a-fA-F]{40}$/ : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/).test(adr)) throw { message: 'adresse_invalide' };
        if (amt < 5) throw { message: 'retrait_min' };
        w = { net: p.net, addr: adr, amt: amt, fee: N.wfee, method: null, ms: 4500 };
      } else if (ARGENT.fiat[p.method]) {
        if (!me.kyc) throw { message: 'kyc_requis' }; if (amt < 10) throw { message: 'retrait_min' };
        w = { net: p.method, addr: p.method, amt: amt, fee: r2(amt * ARGENT.fiat[p.method].wf), method: p.method, ms: ARGENT.fiat[p.method].wd_ms };
      } else throw { message: 'moyen_invalide' };
      if (me.balance < amt) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - amt);
      w.id = 'wd-' + (db.seq++); w.at = Date.now(); w.due = w.at + w.ms; w.st = 'pending'; delete w.ms; e.wds.unshift(w);
      var rep = reponse([]); rep.wd = clone(w); db.ops[cle] = clone(rep); return rep; },
    api_demo_settle: function () { var e = etat(), ev = []; regler(e, ev); var rep = reponse(ev); rep.deps = e.deps.map(depJson); rep.wds = clone(e.wds); return rep; },
    api_demo_kyc: function (a) { var e = etat(), p = a.p || {}, ev = [], bd = new Date(p.bd), lim = new Date(); lim.setFullYear(lim.getFullYear() - 18);
      if (!String(p.fn || '').trim() || !String(p.ln || '').trim()) throw { message: 'kyc_nom' };
      if (!p.bd || isNaN(bd) || bd > lim) throw { message: 'kyc_age' };
      if (!p.doc) throw { message: 'kyc_piece' };
      if (!e.me.kyc) { e.me.kyc = true; e.me.kycAt = Date.now(); ev.push(notif('shield', 'kyc_ok', {}, '#depot')); }
      return reponse(ev); },
    api_rg_limit: function (a) { var e = etat(), ev = [], v = Math.max(0, Math.round(+a.p_v || 0)), res;
      if (['day', 'week', 'month'].indexOf(a.p_k) < 0) throw { message: 'limite_invalide' };
      rgMaj(e, ev); var cur = +e.rg.lim[a.p_k] || 0;
      if (v === cur) { delete e.rg.pend[a.p_k]; res = 'same'; }
      else if (cur && (v === 0 || v > cur)) { e.rg.pend[a.p_k] = { v: v, at: Date.now() + 48 * 3600e3 }; res = 'pending'; }
      else { e.rg.lim[a.p_k] = v; delete e.rg.pend[a.p_k]; res = 'now'; }
      var rep = reponse(ev); rep.rg = clone(e.rg); rep.r = res; return rep; },
    api_rg_pend_cancel: function (a) { var e = etat(); delete e.rg.pend[a.p_k]; var rep = reponse([]); rep.rg = clone(e.rg); return rep; },
    api_rg_pause: function (a) { var e = etat(), ev = [];
      if ([24, 72, 168, 720].indexOf(a.p_hours) < 0) throw { message: 'duree_invalide' };
      e.rg.pause = Math.max(e.rg.pause || 0, Date.now() + a.p_hours * 3600e3); ev.push(notif('shield', 'rg_pause', { at: e.rg.pause }, '#responsable'));
      var rep = reponse(ev); rep.rg = clone(e.rg); return rep; },
    api_rg_exclude: function (a) { var e = etat();
      if ([0, 6, 12, 36].indexOf(a.p_months) < 0) throw { message: 'duree_invalide' };
      e.rg.pause = 0; e.rg.excl = a.p_months === 0 ? -1 : Math.max(e.rg.excl || 0, Date.now() + a.p_months * 30 * 864e5);
      return { excl: e.rg.excl }; },
    api_markets: function () { return { now: Date.now() + (CFG.decalage || 0), m: clone(db.marches) }; },
    /* Catalogue des marchés réels : mêmes formes que wm.catalogue / wm.fiche_vue (…_catalogue.sql). p_depuis = révision déjà
     * lue → seulement les fiches changées depuis (et x, les fiches retirées) ; p_langue fr|en|he → textes dans cette langue. */
    api_catalogue: function (a) { var c = catalogueFaux(), d = +a.p_depuis || 0, L = ['fr', 'en', 'he'].indexOf(a.p_langue) >= 0 ? a.p_langue : null;
      return { v: 1, rev: c.rev, t: Date.now() + (CFG.decalage || 0), en_ligne: c.en_ligne, img: IMG_MARCHES,
        cats: d > 0 ? null : c.cats.map(function (x) { return { id: x.id, n: L ? (x.n[L] || x.n.fr) : clone(x.n), ic: x.ic }; }),
        m: c.m.filter(function (x) { return (x.rev || 1) > d; }).map(function (x) { return vueFiche(x, L); }), x: d > 0 ? clone(c.x) : [] }; },
    api_credits: function () { return { img: IMG_MARCHES, images: clone(catalogueFaux().credits) }; },
    /* Présence (…_cycle_vie.sql) : le nouvel écran l'appelle toutes les 60 s, onglet visible ; relevé d'argent par pages. */
    api_presence: function () { etat(); return { ok: true }; },
    api_operations: function (a) { var n = Math.min(Math.max(+a.p_n || 50, 1), 200), av = a.p_avant == null ? Infinity : +a.p_avant;
      var L = clone(etat().operations || CFG.operations || []).filter(function (o) { return o.id < av; }).sort(function (x, y) { return y.id - x.id; }).slice(0, n);
      return { operations: L, suite: L.length === n ? L[L.length - 1].id : null }; },
    /* Propositions de marché : mêmes règles que supabase/migrations/…_propositions.sql */
    api_proposals: function () { var ev = []; propsAvancer(ev); var rep = reponse(ev); rep.props = propsEtat(); return rep; },
    api_proposal_create: function (a) { var p = a.p || {}, e = etat(), me = e.me, ev = [], propre = function (t) { return String(t || '').replace(/'/g, '’').replace(/\s+/g, ' ').trim(); };
      if (rangDe(me).t < 3) throw { message: 'rang_insuffisant' };
      var q = propre(p.q), src = propre(p.src), regles = propre(p.rules);
      if ([q, src, regles].some(function (t) { return /[<>"`\\]/.test(t); })) throw { message: 'texte_refuse' };
      if (q.length < 15 || q.length > 120 || !/\?$/.test(q)) throw { message: 'question_invalide' };
      if (!(String(p.date) >= new Date().toISOString().slice(0, 10))) throw { message: 'date_invalide' };
      if (src.length < 3) throw { message: 'source_invalide' }; if (regles.length < 30) throw { message: 'regles_invalides' };
      if (!(+p.p0 >= 5 && +p.p0 <= 95)) throw { message: 'montant_invalide' };
      var L = propsListe();
      if (L.some(function (x) { return x.by === uid() && x.status === 'vote' && x.q.toLowerCase() === q.toLowerCase(); })) throw { message: 'proposition_en_double' };
      if (L.filter(function (x) { return x.by === uid() && x.at > Date.now() - 864e5; }).length >= 5) throw { message: 'trop_de_propositions' };
      var avant = rangDe(me), x = { id: db.seq++, code: null, q: q, cat: p.cat, date: p.date, time: p.time || '21:00', src: src, rules: regles, p0: +p.p0, status: 'vote', pour: 0, contre: 0, base: 1, baseContre: 0, need: 25, at: Date.now(), mid: null, by: uid(), votes: {} };
      L.unshift(x); me.xp += 10; ev.push({ k: 'xp', n: 10, src: 'proposition' }); rangMonte(me, avant, ev);
      ev.push(notif('plus', 'prop_vote', { id: x.id, q: shortOf(q) }, '#creer'));
      var rep = reponse(ev); rep.prop = propJson(x); rep.props = propsEtat(); return rep; },
    api_proposal_vote: function (a) { var e = etat(), me = e.me, ev = [], x = propsListe().filter(function (y) { return y.id === +a.p_id && y.status === 'vote'; })[0];
      if (a.p_vote !== 'for' && a.p_vote !== 'against') throw { message: 'vote_invalide' };
      if (!x || x.by === uid()) throw { message: 'proposition_indisponible' }; if (x.votes[uid()]) throw { message: 'deja_vote' };
      x.votes[uid()] = a.p_vote; if (a.p_vote === 'for') x.pour++; else x.contre++;
      var avant = rangDe(me); me.xp += 2; ev.push({ k: 'xp', n: 2, src: 'vote' }); rangMonte(me, avant, ev); propsAvancer(ev);
      var rep = reponse(ev); rep.props = propsEtat(); return rep; },
    /* Copy trading : mêmes règles que supabase/migrations/…_copies.sql */
    api_copy_start: function (a) { var p = a.p || {}, e = etat(), me = e.me, ev = [], L = (e.copiesL = e.copiesL || []), c;
      if (rangDe(me).t < 3) throw { message: 'rang_insuffisant' };
      var budget = r2(+p.budget), mode = p.mode === 'prop' ? 'prop' : 'fixed', per = r2(+p.per || 0), pct = Math.round(+p.pct || 0), cap = r2(+p.cap || 0), stop = +p.stop || 0, cats = (p.cats || []).length ? p.cats.slice() : null;
      if (!(budget >= 50)) throw { message: 'budget_min' };
      if (mode === 'fixed' && (per < 5 || per > budget)) throw { message: 'mise_copie_invalide' };
      if (mode === 'prop' && (pct < 1 || pct > 100 || (cap > 0 && cap < 5))) throw { message: 'mise_copie_invalide' };
      if (p.edit) { c = L.filter(function (x) { return x.id === +p.edit && x.status !== 'stopped'; })[0]; if (!c) throw { message: 'copie_indisponible' };
        c.budget = budget; c.mode = mode; c.per = per; c.pct = pct; c.cap = mode === 'prop' ? cap : 0; c.cats = cats; c.stop = stop; var rep0 = reponse([]); rep0.copies = copiesEtat(e); rep0.copie = c.id; return rep0; }
      if (!p.u || p.u === uid() || (CFG.nonCopiables || []).indexOf(p.u) >= 0) throw { message: 'copie_indisponible' };
      if (budget > me.balance) throw { message: 'budget_solde' };
      if (L.some(function (x) { return x.u === p.u && x.status !== 'stopped'; })) throw { message: 'copie_existe' };
      if (L.filter(function (x) { return x.status !== 'stopped'; }).length >= 10) throw { message: 'trop_de_copies' };
      var premier = !L.length, avant = rangDe(me);
      c = { id: db.seq++, u: p.u, at: Date.now(), status: 'active', why: null, budget: budget, mode: mode, per: per, pct: pct, cap: mode === 'prop' ? cap : 0, cats: cats, stop: stop, realized: 0, n: 0, given: 0, endPnl: 0, kept: 0, end: null, holds: [], log: [] };
      L.unshift(c);
      if (premier) { me.xp += 15; ev.push({ k: 'xp', n: 15, src: 'copie' }); rangMonte(me, avant, ev); }
      ev.push(notif('copy', 'copie_debut', { u: p.u, budget: budget, mode: mode, per: per, pct: pct, cap: c.cap }, '#copie'));
      var n = 0; if (p.withOpen) (p.existing || []).slice(0, 3).forEach(function (b) { if (copieExecuter(e, c, b.m, b.s, +b.amt).r === 'ok') n++; });
      var rep = reponse(ev); rep.copies = copiesEtat(e); rep.copie = c.id; rep.ouvertes = n; return rep; },
    api_copy_set: function (a) { var e = etat(), c = (e.copiesL || []).filter(function (x) { return x.id === +a.p_id && x.status !== 'stopped'; })[0]; if (!c) throw { message: 'copie_indisponible' };
      if (a.p_action === 'pause') c.status = 'paused'; else if (a.p_action === 'resume') c.status = 'active'; else if (a.p_action === 'stop' || a.p_action === 'stop_close') copieArreter(e, c, 'manual', a.p_action === 'stop_close'); else throw { message: 'action_invalide' };
      var rep = reponse([]); rep.copies = copiesEtat(e); rep.copie = c.id; rep.endPnl = c.endPnl; rep.kept = c.kept; return rep; },
    /* Clans : mêmes règles que supabase/migrations/…_clans.sql (annuaire de démonstration : celui de l'écran) */
    api_clan: function () { var e = etat(), ev = []; clanAvancer(e, ev); var rep = reponse(ev); rep.clan = clanEtat(e); return rep; },
    api_clan_join: function (a) { var e = etat(), ev = [], id = a.p_clan, code = String(a.p_code || '').trim().toUpperCase();
      if (!id) { var parCode = clansTous().filter(function (c) { return c.code === code; })[0]; if (!parCode) throw { message: 'clan_inconnu' }; id = parCode.id; }
      var c = clanVerifier(e, id); if (c.access !== 'open' && code !== c.code) throw { message: 'clan_ferme' };
      clanEntrer(e, id, 'membre'); ev.push(notif('shield', 'clan_rejoint', { id: id }, '#clan-' + id)); var rep = reponse(ev); rep.clan = clanEtat(e); return rep; },
    api_clan_apply: function (a) { var e = etat(), c = clanVerifier(e, a.p_clan); if (c.access !== 'apply') throw { message: 'clan_ferme' };
      e.clanApps = e.clanApps || {}; if (!e.clanApps[a.p_clan]) e.clanApps[a.p_clan] = Date.now(); var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    api_clan_leave: function () { var e = etat(); if (!e.clanM) throw { message: 'clan_absent' }; var id = e.clanM.id, j = (db.clans || []).filter(function (x) { return x.id === id; })[0];
      if (j) { j.members = j.members.filter(function (m) { return m.u !== uid(); }); if (j.chief === uid()) { j.chief = j.members.length ? j.members[0].u : null; if (j.members.length) j.members[0].role = 'chef'; } }
      filPoser(id, uid(), 'quitte', {}); e.clanM = null; e.clanParti = Date.now(); var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    /* Chef et officiers : mêmes règles que supabase/migrations/…_clans_chefs.sql */
    api_clan_promote: function (a) { var e = etat(), x = clanMoi(e), c = clanMembre(x.j, a.p_user); if (x.role !== 'chef') throw { message: 'role_insuffisant' }; if (!c) throw { message: 'membre_inconnu' };
      if (c.role !== 'membre') throw { message: 'deja_officier' }; if (x.j.members.filter(function (m) { return m.role === 'officier'; }).length >= 5) throw { message: 'trop_d_officiers' };
      c.role = 'officier'; filPoser(x.j.id, uid(), 'officier', { u: a.p_user }); var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    api_clan_kick: function (a) { var e = etat(), x = clanMoi(e), c = clanMembre(x.j, a.p_user); if (x.role !== 'chef' && x.role !== 'officier') throw { message: 'role_insuffisant' }; if (!c) throw { message: 'membre_inconnu' };
      if (c.role === 'chef' || (x.role === 'officier' && c.role !== 'membre')) throw { message: 'role_insuffisant' };
      x.j.members = x.j.members.filter(function (m) { return m.u !== a.p_user; }); if (db.fiches[a.p_user]) db.fiches[a.p_user].clan = null; filPoser(x.j.id, uid(), 'exclu', { u: a.p_user });
      var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    api_clan_invite: function (a) { var e = etat(), x = clanMoi(e), f = db.fiches[a.p_user]; if (x.role !== 'chef' && x.role !== 'officier') throw { message: 'role_insuffisant' };
      if (!f || a.p_user === uid()) throw { message: 'joueur_inconnu' }; if (e.friends.indexOf(a.p_user) < 0) throw { message: 'pas_amis' }; if (f.clan) throw { message: 'clan_deja' };
      if (x.j.members.length >= 50) throw { message: 'clan_complet' }; var fait = 'invite';
      if (f.bot) { x.j.members.push({ u: a.p_user, role: 'membre', since: Date.now(), pts: 0 }); f.clan = x.j.id; filPoser(x.j.id, a.p_user, 'invite', { par: uid() }); fait = 'rejoint'; }
      else { db.invites = db.invites || {}; if (db.invites[x.j.id + ':' + a.p_user]) throw { message: 'deja_invite' }; db.invites[x.j.id + ':' + a.p_user] = Date.now(); }
      var rep = reponse([]); rep.clan = clanEtat(e); rep.r = fait; return rep; },
    /* Guerres de clans : mêmes règles que supabase/migrations/…_clans_guerres.sql (points simulés simplifiés) */
    api_clan_war: function () { var e = etat(), x = clanMoi(e); if (x.role !== 'chef' || !x.j.name) throw { message: 'role_insuffisant' }; guerresAvancer(e, []);
      db.guerres = db.guerres || {}; var L = db.guerres[x.j.id] = db.guerres[x.j.id] || []; if (L.some(function (g) { return g.status === 'live'; })) throw { message: 'guerre_en_cours' };
      var bots = x.j.members.filter(function (m) { return (db.fiches[m.u] || {}).bot; }).map(function (m) { return m.u; }).slice(0, 7), id = db.seq++;
      L.unshift({ id: id, foe: CFG.ennemi || 'c7', at: Date.now(), endAt: Date.now() + 48 * 3600e3, status: 'live', buyin: 20, bots: bots, eux: CFG.pointsEux === undefined ? 650 : CFG.pointsEux, joueurs: {} });
      filPoser(x.j.id, uid(), 'guerre', { foe: L[0].foe, k: 20 }); var r = 'clan:' + x.j.id; (db.chat[r] = db.chat[r] || []).push({ id: db.seq++, u: uid(), k: 'evt', text: '', at: Date.now(), ev: { code: 'guerre', foe: L[0].foe, k: 20 } });
      var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    api_clan_war_join: function () { var e = etat(), me = e.me, x = clanMoi(e), g = ((db.guerres || {})[x.j.id] || []).filter(function (y) { return y.status === 'live' && y.endAt > Date.now(); })[0];
      if (!g) throw { message: 'guerre_absente' }; if (g.joueurs[uid()]) throw { message: 'guerre_deja' }; if (e.rg && e.rg.pause > Date.now()) throw { message: 'pause' }; if (me.balance < g.buyin) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - g.buyin); g.joueurs[uid()] = { paye: g.buyin }; var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    api_clan_call: function (a) { var e = etat(), x = clanMoi(e); if (x.role !== 'chef' && x.role !== 'officier') throw { message: 'role_insuffisant' };
      if (a.p_side !== 'oui' && a.p_side !== 'non') throw { message: 'cote_invalide' }; var m = marche(a.p_market); if (!m || m.st !== 'open') throw { message: 'marche_inconnu' };
      db.appels = db.appels || {}; var L = db.appels[x.j.id] = db.appels[x.j.id] || []; if (L.filter(function (k) { return k.at > Date.now() - 3600e3; }).length >= 6) throw { message: 'trop_d_appels' };
      L.unshift({ id: db.seq++, m: a.p_market, s: a.p_side, by: uid(), at: Date.now(), du: Date.now() + (CFG.appelDelai === undefined ? 6000 : CFG.appelDelai), n: null });
      filPoser(x.j.id, uid(), 'appel', { m: a.p_market, s: a.p_side });
      var r = 'clan:' + x.j.id; (db.chat[r] = db.chat[r] || []).push({ id: db.seq++, u: uid(), k: 'evt', text: '', at: Date.now(), ev: { code: 'appel', m: a.p_market, s: a.p_side } });
      var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
    api_clan_create: function (a) { var p = a.p || {}, e = etat(), me = e.me, ev = [], propre = function (t) { return String(t || '').replace(/'/g, '’').replace(/\s+/g, ' ').trim(); };
      if (e.clanM) throw { message: 'clan_deja' }; if (e.clanParti && e.clanParti > Date.now() - 7 * 864e5) throw { message: 'clan_attente' };
      if (rangDe(me).t < 2) throw { message: 'rang_insuffisant' }; if (me.since > Date.now() - 14 * 864e5) throw { message: 'compte_trop_recent' };
      var nom = propre(p.name), tag = String(p.tag || '').trim().toUpperCase(), desc = propre(p.desc);
      if (/[<>"`\\]/.test(nom + desc)) throw { message: 'texte_refuse' }; if (nom.length < 3 || nom.length > 28) throw { message: 'clan_nom_invalide' };
      if (!/^[A-Z0-9]{3,4}$/.test(tag)) throw { message: 'clan_tag_invalide' }; if (clansTous().some(function (c) { return c.tag === tag; })) throw { message: 'clan_tag_pris' };
      if (me.balance < 50) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - 50); me.realized = r2((me.realized || 0) - 50); db.clans = db.clans || [];
      var id = 'u' + (db.clans.length + 1), j = { id: id, name: nom, tag: tag, emblem: { ic: p.ic || 'shield', col: p.col || '#2448FF' }, lang: (p.lang || []).length ? p.lang : ['fr'], cats: (p.cats || []).slice(0, 3), desc: desc, access: p.access || 'open', minRank: +p.minRank || 0, chief: uid(), createdAt: Date.now(), code: 'WMR-U' + String(100 + db.clans.length), members: [] };
      db.clans.push(j); clanEntrer(e, id, 'chef'); ev.push(notif('shield', 'clan_cree', { id: id, name: nom, tag: tag }, '#clan-' + id));
      var rep = reponse(ev); rep.clan = clanEtat(e); rep.id = id; return rep; },
    /* Suivre un joueur : mêmes règles que supabase/migrations/…_suivre.sql */
    api_follow: function (a) { var e = etat(), L = (e.following = e.following || []), i = L.indexOf(a.p_user), f = (e.users || {})[a.p_user];
      if (!a.p_user || a.p_user === uid() || !f) throw { message: 'joueur_inconnu' };
      if (a.p_on && i < 0) { if (L.length >= 500) throw { message: 'trop_de_suivis' }; L.push(a.p_user); f.fol = (f.fol | 0) + 1; } else if (!a.p_on && i >= 0) { L.splice(i, 1); f.fol = Math.max(0, (f.fol | 0) - 1); }
      var rep = reponse([]), users = {}; users[a.p_user] = clone(f); rep.following = clone(L); rep.users = users; return rep; },
    /* Mises partagées : mêmes règles que supabase/migrations/…_chat_mises.sql */
    api_chat_share: function (a) { var prive = /^dm:/.test(String(a.p_room)), salon = a.p_room;                 /* en privé : à un ami, comme un message (…_mise_privee.sql) */
      if (prive) { dmOk(a.p_room.slice(3), true); salon = 'dm:' + [uid(), a.p_room.slice(3)].sort().join(':'); } else salonOk(a.p_room);
      var e = etat(), me = e.me, ev = [];
      if (a.p_side !== 'oui' && a.p_side !== 'non') throw { message: 'cote_invalide' }; if (rangDe(me).t < 1) throw { message: 'rang_insuffisant' };
      var pos = e.positions.filter(function (p) { return p.m === a.p_market && p.s === a.p_side && p.sh > 0.05; })[0]; if (!pos) throw { message: 'position_absente' };
      var deja = false; for (var r in db.chat) db.chat[r].forEach(function (x) { if (x.u === uid() && x.k === 'bet' && x.bet.m === a.p_market && x.bet.s === a.p_side && x.at > Date.now() - 864e5) deja = true; });
      if (deja) throw { message: 'deja_partage' };
      var m = { id: db.seq++, u: uid(), k: 'bet', text: '', at: Date.now(), bet: { m: a.p_market, s: a.p_side, amt: Math.round(pos.sh * pos.avg / 100), price: Math.round(pos.avg) }, fc: 0, suivis: {} };
      (db.chat[salon] = db.chat[salon] || []).push(m); var avant = rangDe(me); me.xp += 5; ev.push({ k: 'xp', n: 5, src: 'partage' }); rangMonte(me, avant, ev);
      var rep = reponse(ev); rep.msg = clone(m); delete rep.msg.suivis; return rep; },
    api_chat_follow: function (a) { var e = etat(), me = e.me, ev = [], m = null, salon = null; for (var r in db.chat) db.chat[r].forEach(function (x) { if (x.id === +a.p_msg && x.k === 'bet') { m = x; salon = r; } });
      if (rangDe(me).t < 2) throw { message: 'rang_insuffisant' }; if (!m || m.u === uid()) throw { message: 'mise_indisponible' };
      if (/^dm:/.test(salon) && (salon.split(':').indexOf(uid()) < 1 || e.friends.indexOf(m.u) < 0)) throw { message: 'mise_indisponible' };   /* en privé : l'autre participant, s'il est toujours ami */
      if (!e.positions.some(function (p) { return p.m === m.bet.m && p.s === m.bet.s && p.sh > 0.05; })) throw { message: 'position_absente' };
      m.suivis = m.suivis || {}; if (m.suivis[uid()]) throw { message: 'deja_suivi' }; m.suivis[uid()] = 1; m.fc = (m.fc | 0) + 1;
      var auteur = db.etats[m.u]; if (auteur) { auteur.me.xp += 20; auteur.me.followed = (auteur.me.followed | 0) + 1; }
      var avant = rangDe(me); me.xp += 5; ev.push({ k: 'xp', n: 5, src: 'suivre' }); rangMonte(me, avant, ev);
      var rep = reponse(ev); rep.id = m.id; rep.fc = m.fc; return rep; },
    api_buy: function (a) {
      var e = etat(), me = e.me, total = r2(+a.p_total), cle = uid() + ':' + a.p_key;
      if (a.p_side !== 'oui' && a.p_side !== 'non') throw { message: 'cote_invalide' };
      if (!(total >= 1)) throw { message: 'montant_min' };
      if (!a.p_key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { var deja = clone(db.ops[cle]); deja.rejoue = true; return deja; }      // même clé : appliqué une seule fois
      var m = marche(a.p_market); if (!m) throw { message: 'marche_inconnu' };
      if (m.st !== 'open') throw { message: 'marche_ferme' };
      if (e.rg && e.rg.pause > Date.now()) throw { message: 'pause' };
      if (me.balance < total) throw { message: 'solde_insuffisant' };
      var q = quoteBuy(carnet(a.p_market), a.p_side, total, rangDe(me).t >= 5);
      if (!q.full || !(q.sh > 0)) throw { message: 'liquidite' };
      var avant = rangDe(me), fee = r2(q.fee), cout = r2(total - fee), ev = [];
      me.balance = r2(me.balance - total); me.played = (me.played | 0) + 1; me.maxBet = Math.max(me.maxBet || 0, total); me.realized = r2((me.realized || 0) - fee);
      if (e.clanM && ((e.prefs || {}).prefs || {}).clanFeed !== false) filPoser(e.clanM.id, uid(), 'mise', { amt: Math.round(total), m: a.p_market });
      var pos = e.positions.filter(function (p) { return p.m === a.p_market && p.s === a.p_side; })[0];
      if (pos) { pos.avg = r6((pos.avg * pos.sh + q.avg * q.sh) / (pos.sh + q.sh)); pos.sh = r8(pos.sh + q.sh); }
      else { pos = { m: a.p_market, s: a.p_side, sh: r8(q.sh), avg: r6(q.avg) }; e.positions.push(pos); }
      var p0 = m.p; m.p = r6(borne(m.p + q.impact * (a.p_side === 'oui' ? 1 : -1), 1, 99)); m.vol = r2(m.vol + cout); m.people = (m.people | 0) + 1; pousser(m);
      reequilibrer(a.p_market, m.p - p0);
      me.xp += 10; ev.push({ k: 'xp', n: 10, src: 'pari' }); rangMonte(me, avant, ev);
      missionAvance(e, 'bet', ev); badges(e, ev);
      ev.push(notif('check', 'bet_placed', { amt: total, s: a.p_side, m: a.p_market }, '#profil'));
      var rep = reponse(ev);
      rep.pos = { m: a.p_market, s: a.p_side, sh: pos.sh, avg: pos.avg };
      rep.q = { sh: q.sh, avg: q.avg, fee: fee, total: total, cost: cout, impact: q.impact };
      rep.marches = marchesDe(fratrie(a.p_market));
      db.ops[cle] = clone(rep); return rep; },
    api_sell: function (a) {
      var e = etat(), me = e.me, cle = uid() + ':' + a.p_key;
      if (a.p_side !== 'oui' && a.p_side !== 'non') throw { message: 'cote_invalide' };
      if (!(+a.p_shares > 0)) throw { message: 'quantite_invalide' };
      if (!a.p_key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { var deja = clone(db.ops[cle]); deja.rejoue = true; return deja; }
      var m = marche(a.p_market); if (!m) throw { message: 'marche_inconnu' };
      if (m.st !== 'open') throw { message: 'marche_ferme' };
      var pos = e.positions.filter(function (p) { return p.m === a.p_market && p.s === a.p_side; })[0];
      if (!pos || !(pos.sh > 0)) throw { message: 'position_absente' };
      var sh = Math.min(+a.p_shares, pos.sh), q = quoteSell(carnet(a.p_market), a.p_side, sh);
      if (!q.full || !(q.sh > 0)) throw { message: 'liquidite' };
      var pro = Math.floor(q.pro * 100 + 1e-9) / 100, pnl = r2(pro - r2(sh * pos.avg / 100)), reste = r8(pos.sh - sh);
      if (reste < 0.05) reste = 0;
      pos.sh = reste; if (!reste) e.positions = e.positions.filter(function (p) { return p !== pos; });
      me.balance = r2(me.balance + pro); me.realized = r2((me.realized || 0) + pnl);
      var hist = { k: 'sell', m: a.p_market, s: a.p_side, win: pnl >= 0, pnl: pnl, at: Date.now() }; e.history.unshift(clone(hist));
      var p0 = m.p; m.p = r6(borne(m.p + q.impact * (a.p_side === 'oui' ? -1 : 1), 1, 99)); m.vol = r2(m.vol + pro); pousser(m);
      reequilibrer(a.p_market, m.p - p0);
      var rep = reponse([]);
      rep.pos = { m: a.p_market, s: a.p_side, sh: reste, avg: pos.avg };
      rep.q = { sh: sh, pro: pro, pnl: pnl, avg: q.avg, impact: q.impact };
      rep.hist = hist; rep.marches = marchesDe(fratrie(a.p_market));
      db.ops[cle] = clone(rep); return rep; }
  };
  var SANS_SESSION = { api_markets: 1, api_pseudo_libre: 1, api_site: 1, api_catalogue: 1, api_credits: 1 };

  /* ===== Partie E : réglages publics du site, blocages du joueur connecté, et la porte du panneau d'administration =====
     Configuration : CFG.site = { rev, v: {clé: valeur}, annonce, maintenance: {actif, message}, mots: [mots interdits] } ;
     CFG.blocages = [{ id, acces, salon, fin }] (blocages en cours du joueur connecté) ; CFG.equipeJoueur = rôle d'équipe du
     joueur connecté sur le site (l'équipe passe la maintenance et les règles du chat). */
  function siteEtat() {
    if (!db.site) {
      db.site = fusion({ rev: 1, v: {}, annonce: null, maintenance: { actif: false, message: null }, mots: [] }, CFG.site || {});
      if (db.eq && db.eq.reglages) db.eq.reglages.forEach(function (r) { if (r.public && !(r.cle in db.site.v)) db.site.v[r.cle] = clone(r.valeur); });
    }
    return db.site;
  }
  var blocsJoueur = function () { var t = Date.now(); db.blocsJoueur = db.blocsJoueur || clone(CFG.blocages || []); return db.blocsJoueur.filter(function (b) { return +b.fin === -1 || +b.fin > t; }); };
  RPC.api_site = function () { var S = siteEtat(), a = S.annonce && (!S.annonce.fin || S.annonce.fin > Date.now()) ? clone(S.annonce) : null;
    return { rev: S.rev, v: clone(S.v), annonce: a, maintenance: clone(S.maintenance) }; };
  RPC.api_mes_blocages = function () { etat(); return { blocages: blocsJoueur().map(function (b) { return { id: b.id, acces: b.acces, salon: b.salon || null, fin: +b.fin }; }) }; };
  /* ce que wm.uid(), wm.garde() et wm.chat_regles() refusent au joueur connecté (sans effet pour un joueur non concerné) */
  var ACCES_RPC = { api_buy: 'paris', api_duel_create: 'paris', api_duel_accept: 'paris', api_combo_place: 'paris', api_stack_create: 'paris', api_copy_start: 'paris',
    api_demo_deposit: 'depots', api_demo_withdraw: 'retraits', api_proposal_create: 'creation',
    api_clan_join: 'clans', api_clan_apply: 'clans', api_clan_create: 'clans', api_clan_invite: 'clans', api_clan_call: 'clans', api_clan_war: 'clans', api_clan_war_join: 'clans',
    api_chat_send: 'chat', api_chat_share: 'chat', api_dm_send: 'chat' };
  function gardeJoueur(name, a) {
    if (!uid() || name === 'api_site' || name === 'api_equipe' || name === 'api_admin' || name === 'api_present') return null;
    if (db.decoAt) return { message: 'session', code: 'P0001' };
    var bs = blocsJoueur(), S = siteEtat(), equipe = CFG.equipeJoueur;
    var site = bs.filter(function (b) { return b.acces === 'site'; })[0];
    if (site) return { message: 'suspendu', code: 'P0001', details: String(site.fin) };
    if (S.maintenance && S.maintenance.actif && !equipe) return { message: 'maintenance', code: 'P0001' };
    var acces = ACCES_RPC[name];
    if (acces) { var salon = acces === 'chat' ? (name === 'api_dm_send' ? 'dm' : a.p_room) : null;
      var b = bs.filter(function (x) { return x.acces === acces && (acces !== 'chat' || !x.salon || x.salon === salon); })[0];
      if (b) return { message: 'bloque', code: 'P0001', details: JSON.stringify({ acces: b.acces, salon: b.salon || null, fin: +b.fin }) }; }
    if (name === 'api_chat_send' && !equipe) {
      var r = ((S.v || {})['chat.salons'] || {})[a.p_room], der = (db.dernierMsg || {})[a.p_room];
      if (r && r.ferme) return { message: 'salon_ferme', code: 'P0001' };
      if (r && +r.lent > 0 && der && Date.now() - der < r.lent * 1000) return { message: 'mode_lent', code: 'P0001', details: String(Math.ceil((r.lent * 1000 - (Date.now() - der)) / 1000)) };
      var t = String(a.p_text || '').toLowerCase(); if ((S.mots || []).some(function (m) { return m && t.indexOf(m) >= 0; })) return { message: 'mot_interdit', code: 'P0001' };
    }
    if (name === 'api_buy') { var mx = (S.v || {})['paris.mise_max']; if (typeof mx === 'number' && +a.p_total > mx) return { message: 'montant_max', code: 'P0001' }; }
    return null;
  }

  /* ----- La porte du panneau : api_equipe(action, p), même contrat que wm.equipe (registre, rôle à chaque appel, double
     authentification, motif, journal). Configuration : CFG.equipe = { role : 'administrateur' | 'moderateur' | null,
     facteurs : codes de double authentification déjà vérifiés, mfaObligatoire, ancien : accès à l'ancien panneau
     (vrai par défaut pour un administrateur), modMax, joueurs : [{ id, n, email, bot, test, confirme, since, vu, balance,
     xp, t, d, settled, wins, deposits, kyc }], membres, msgs : [{ id, room, u, n, text, k, source, at }], reglages (comme
     wm.reglage_vue, voir tests/fixtures/reglages.json), bots, journal, sessions : { id : [...] }, ledger : [...] } ----- */
  var EQ_REG = {                                                     /* action : [rôles (A, M), écrit, motif obligatoire, annulable] */
    tableau: ['A', 0, 0, 0], reglages_lire: ['A', 0, 0, 0], reglage_modifier: ['A', 1, 1, 1],
    equipe_liste: ['A', 0, 0, 0], equipe_ajouter: ['A', 1, 1, 1], equipe_retirer: ['A', 1, 1, 1], equipe_role: ['A', 1, 1, 1],
    journal_lire: ['AM', 0, 0, 0], journal_csv: ['A', 0, 0, 0], journal_verifier: ['A', 0, 0, 0], journal_annuler: ['AM', 1, 1, 0],
    joueurs_chercher: ['AM', 0, 0, 0], joueur_fiche: ['AM', 0, 0, 0], joueur_activite: ['AM', 0, 0, 0], joueur_solde: ['AM', 1, 1, 1], joueur_rang: ['AM', 1, 1, 0],
    joueur_kyc: ['AM', 1, 0, 1], joueur_bloquer: ['AM', 1, 1, 1], joueur_debloquer: ['AM', 1, 1, 1], joueur_deconnecter: ['AM', 1, 0, 0],
    chat_messages: ['AM', 0, 0, 0], chat_supprimer: ['AM', 1, 0, 1], chat_restaurer: ['AM', 1, 0, 1], salon_regler: ['AM', 1, 0, 1], mots_interdits: ['AM', 1, 0, 1],
    clan_renommer: ['AM', 1, 0, 1], clan_dissoudre: ['AM', 1, 1, 0],
    annonce_publier: ['A', 1, 0, 1], annonce_retirer: ['A', 1, 0, 1], maintenance: ['A', 1, 0, 1], activite_simulee: ['A', 1, 0, 1]
  };
  function EQ() {
    if (!db.eq) {
      db.eq = fusion({ role: CFG.equipe ? 'administrateur' : null, facteurs: 0, mfaObligatoire: false, modMax: 1000,   /* sans CFG.equipe : un joueur ordinaire */ joueurs: [], msgs: [], reglages: [], bots: { actif: true, intensite: 1, chat: 1 },
        journal: [], blocages: [], deconnexions: [], ledger: [], sessions: {}, dissous: {}, seq: 1000 }, CFG.equipe || {});
      var M = db.eq, moi = db.session && db.session.user;
      if (!M.membres) M.membres = M.role && moi ? [{ id: moi.id, n: 'chef', email: moi.email || '', role: M.role, actif: true, origine: 'ancien', ajoute_at: Date.now() - 30 * 864e5, retire_at: null }] : [];
      db.mfa = db.mfa || []; for (var i = db.mfa.length; i < (M.facteurs | 0); i++) db.mfa.push({ id: 'f' + (i + 1), factor_type: 'totp', status: 'verified', friendly_name: 'Wimoro, équipe' });
      persist();
    }
    return db.eq;
  }
  var verifies = function () { return (db.mfa || []).filter(function (f) { return f.status === 'verified'; }).length; };
  var aalOk = function () { return db.aal === 'aal2' || (verifies() === 0 && !EQ().mfaObligatoire); };
  var eqRole = function (id) { var m = EQ().membres.filter(function (x) { return x.id === id && x.actif; })[0]; return m ? m.role : null; };
  var monNom = function () { var m = EQ().membres.filter(function (x) { return x.id === uid(); })[0]; return m ? m.n : 'chef'; };
  RPC.api_equipe = function (a) {
    var act = a.p_action, p = a.p || {}, M = EQ(), role = M.role;
    if (act === 'moi') return { role: role, aal: db.aal || 'aal1', facteurs: verifies(), mfa_requise: !!role && !aalOk(),
      permissions: role ? Object.keys(EQ_REG).filter(function (k) { return EQ_REG[k][0].indexOf(role === 'administrateur' ? 'A' : 'M') >= 0; }).sort() : [], ancien_panneau: role === 'administrateur' && M.ancien !== false };
    return eqPorte(act, p);
  };
  function eqPorte(act, p) {
    var M = EQ(), role = M.role;
    if (!role) throw { message: 'interdit' };
    var R = EQ_REG[act]; if (!R) throw { message: 'action_inconnue' };
    if (R[0].indexOf(role === 'administrateur' ? 'A' : 'M') < 0) throw { message: 'interdit' };
    if (!aalOk()) throw { message: 'mfa_requise' };
    if (R[1] && R[2] && String(p.motif || '').trim().length < 3) throw { message: 'motif_requis' };
    var r = EQ_FN[act](p || {}, M); persist(); return r;
  }
  function eqNoter(action, type, cible, avant, apres, motif, inverse) {
    var M = EQ(), id = M.journal.reduce(function (x, e) { return Math.max(x, e.id); }, 0) + 1;
    M.journal.unshift({ id: id, at: Date.now(), admin: uid(), par: monNom(), role: M.role, origine: 'panneau', action: action, cible_type: type, cible: cible == null ? null : String(cible),
      avant: clone(avant === undefined ? null : avant), apres: clone(apres === undefined ? null : apres), motif: String(motif || '').trim() || null, annule_id: db.eqAnnule || null, inverse: inverse || null });
    return id;
  }
  var eqVueJ = function (e) { var x = clone(e), par = EQ().journal.filter(function (y) { return y.annule_id === e.id; })[0]; x.annulee_par = par ? par.id : null; x.annulable = !!e.inverse && !par; delete x.inverse; return x; };
  var eqJ = function (id) { var j = EQ().joueurs.filter(function (x) { return x.id === id; })[0]; if (!j) throw { message: 'joueur_inconnu' }; return j; };
  var eqBlocActif = function (b) { return !b.leve_at && (+b.fin === -1 || +b.fin > Date.now()); };
  var eqBlocVue = function (b) { return { id: b.id, actif: eqBlocActif(b), acces: b.acces, salon: b.salon || null, fin: +b.fin }; };
  function eqVue(j) { var M = EQ(), x = clone(j); x.blocages = M.blocages.filter(function (b) { return b.user === j.id && eqBlocActif(b); }).map(function (b) { return { id: b.id, acces: b.acces, salon: b.salon || null, fin: +b.fin }; });
    x.role = eqRole(j.id); x.deconnecte_at = (M.deconnexions.filter(function (d) { return d.user === j.id; })[0] || {}).at || null; x.susp = j.susp || null; x.excl = j.excl || null; x.bot = !!j.bot; x.test = !!j.test; return x; }
  function eqFiche(id) { var M = EQ(), j = eqJ(id);
    return { j: eqVue(j), blocages: M.blocages.filter(function (b) { return b.user === id; }).slice().reverse().map(function (b) { return { id: b.id, acces: b.acces, salon: b.salon || null, debut: b.debut, fin: +b.fin, motif: b.motif, par: b.par, leve_at: b.leve_at || null, leve_par: b.leve_par || null, leve_motif: b.leve_motif || null, actif: eqBlocActif(b) }; }),
      deconnexions: M.deconnexions.filter(function (d) { return d.user === id; }).map(function (d) { return { id: d.id, at: d.at, motif: d.motif, par: d.par }; }),
      sessions: clone((M.sessions || {})[id] || []), journal: M.journal.filter(function (e) { return e.cible_type === 'joueur' && e.cible === id; }).slice(0, 20).map(eqVueJ) }; }
  function eqCible(id, sensible) { var M = EQ(); eqJ(id); if (id === uid()) throw { message: 'interdit' }; var r = eqRole(id);
    if (r && M.role !== 'administrateur') throw { message: 'interdit' }; if (sensible && r === 'administrateur') throw { message: 'interdit' }; }
  var eqReg = function (cle) { var r = EQ().reglages.filter(function (x) { return x.cle === cle; })[0]; if (!r) throw { message: 'reglage_inconnu' }; return r; };
  function eqEcrire(cle, v) { var M = EQ(), r = eqReg(cle), S = siteEtat(); r.valeur = clone(v); r.maj_at = Date.now(); r.maj_par = uid(); S.rev++;
    if (r.public) { S.v[cle] = clone(v); if (cle !== 'site.annonce' && cle !== 'site.maintenance' && cle !== 'site.maintenance_message') window.__fakeSB.emit('site', 'cfg', { cle: cle, v: clone(v), rev: S.rev }); }
    return S.rev; }
  var DUREES_MS = { '1h': 3600e3, '24h': 864e5, '7j': 7 * 864e5, '30j': 30 * 864e5, permanent: -1 };
  var SALON_RE = /^(general|vip|blitz|dm|m:[a-z0-9-]{1,40}|clan:[a-z0-9]{1,20})$/;
  var EQ_FN = {
    tableau: function (p, M) { var vrais = M.joueurs.filter(function (j) { return !j.bot; }), S = siteEtat();
      return { inscrits: vrais.length, inscrits_7j: 1, actifs_24h: vrais.length, actifs_7j: vrais.length, bots: 10000, marches_ouverts: 27, volume_total: 1234567, mises_24h: 340.5, positions: 3,
        messages_24h: M.msgs.length, soldes: vrais.reduce(function (s, j) { return s + (+j.balance || 0); }, 0), base_mo: 80, bots_cfg: clone(M.bots), present: true,
        equipe: M.membres.filter(function (m) { return m.actif; }).length, blocages_actifs: M.blocages.filter(eqBlocActif).length, maintenance: !!S.maintenance.actif, annonce: clone(S.annonce),
        journal: { n: M.journal.length, tete: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' } }; },
    reglages_lire: function (p, M) { return { reglages: clone(M.reglages.filter(function (r) { return !p.categorie || r.categorie === p.categorie; })), bots: clone(M.bots), rev: siteEtat().rev }; },
    reglage_modifier: function (p, M) { var r = eqReg(p.cle), v = p.valeur;
      if (r.dedie || r.type === 'json') throw { message: 'reglage_dedie' }; if (!r.applique) throw { message: 'reglage_inactif' }; if (!('valeur' in p)) throw { message: 'reglage_invalide' };
      var hors = function (n) { return (r.min != null && n < r.min) || (r.max != null && n > r.max); };
      if (r.type === 'nombre' || r.type === 'entier') { if (v === null) { if (!r.facultatif) throw { message: 'reglage_invalide' }; } else if (typeof v !== 'number' || hors(v) || (r.type === 'entier' && v !== Math.trunc(v))) throw { message: 'reglage_invalide' }; }
      else if (r.type === 'booleen') { if (typeof v !== 'boolean') throw { message: 'reglage_invalide' }; }
      else if (r.type === 'liste') { if (!Array.isArray(v) || !v.length || v.length > 10 || v.some(function (x) { return typeof x !== 'number' || hors(x); }) || new Set(v).size !== v.length) throw { message: 'reglage_invalide' }; }
      if (JSON.stringify(v) === JSON.stringify(r.valeur)) throw { message: 'reglage_inchange' };
      var avant = clone(r.valeur), num = function (k) { var x = M.reglages.filter(function (y) { return y.cle === k; })[0]; return x ? (k === r.cle ? v : x.valeur) : null; };
      var paires = [['paris.mise_min', 'paris.mise_max'], ['eclair.mise_min', 'eclair.mise_max'], ['duels.mise_min', 'duels.mise_max'], ['stacks.buyin_min', 'stacks.buyin_max'], ['combines.mise_min', 'combines.mise_max'], ['depots.fiat_min', 'depots.fiat_max'], ['depots.fiat_max', 'depots.max']];
      if (paires.some(function (q) { var a = num(q[0]), b = num(q[1]); return typeof a === 'number' && typeof b === 'number' && a > b; })) throw { message: 'reglage_incoherent' };
      var rev = eqEcrire(r.cle, v), j = eqNoter('reglage_modifier', 'reglage', r.cle, { valeur: avant }, { valeur: clone(v) }, p.motif, { action: 'reglage_modifier', p: { cle: r.cle, valeur: avant } });
      return { reglage: clone(r), rev: rev, journal: j }; },
    equipe_liste: function (p, M) { return { membres: clone(M.membres) }; },
    equipe_ajouter: function (p, M) { if (['administrateur', 'moderateur'].indexOf(p.role) < 0) throw { message: 'role_invalide' };
      var j = p.id ? M.joueurs.filter(function (x) { return x.id === p.id; })[0] : M.joueurs.filter(function (x) { return String(x.email).toLowerCase() === String(p.email || '').trim().toLowerCase(); })[0];
      if (!j) throw { message: 'joueur_inconnu' }; if (j.bot || j.test || j.confirme === false || !j.email) throw { message: 'compte_refuse' }; if (eqRole(j.id)) throw { message: 'deja_membre' };
      M.membres = M.membres.filter(function (m) { return m.id !== j.id; }); M.membres.push({ id: j.id, n: j.n, email: j.email, role: p.role, actif: true, origine: 'equipe', ajoute_at: Date.now(), retire_at: null, facteurs: 0 });
      eqNoter('equipe_ajouter', 'membre', j.id, { role: null }, { role: p.role }, p.motif, { action: 'equipe_retirer', p: { id: j.id } }); return { membres: clone(M.membres) }; },
    equipe_retirer: function (p, M) { var m = M.membres.filter(function (x) { return x.id === p.id && x.actif; })[0]; if (!m) throw { message: 'membre_inconnu' };
      if (m.role === 'administrateur' && M.membres.filter(function (x) { return x.actif && x.role === 'administrateur'; }).length <= 1) throw { message: 'dernier_administrateur' };
      m.actif = false; m.retire_at = Date.now(); eqNoter('equipe_retirer', 'membre', m.id, { role: m.role }, { role: null }, p.motif, { action: 'equipe_ajouter', p: { id: m.id, role: m.role } }); return { membres: clone(M.membres) }; },
    equipe_role: function (p, M) { var m = M.membres.filter(function (x) { return x.id === p.id && x.actif; })[0]; if (!m) throw { message: 'membre_inconnu' };
      if (['administrateur', 'moderateur'].indexOf(p.role) < 0) throw { message: 'role_invalide' }; if (p.role === m.role) throw { message: 'role_inchange' };
      if (m.role === 'administrateur' && M.membres.filter(function (x) { return x.actif && x.role === 'administrateur'; }).length <= 1) throw { message: 'dernier_administrateur' };
      var avant = m.role; m.role = p.role; eqNoter('equipe_role', 'membre', m.id, { role: avant }, { role: p.role }, p.motif, { action: 'equipe_role', p: { id: m.id, role: avant } }); return { membres: clone(M.membres) }; },
    journal_lire: function (p, M) { var n = Math.min(200, Math.max(1, +p.n || 50)), adm = p.admin || null;
      if (M.role !== 'administrateur' && !p.joueur) adm = uid();
      var L = M.journal.filter(function (e) { return (!adm || e.admin === adm) && (!p.joueur || (e.cible_type === 'joueur' && e.cible === p.joueur)) && (!p.action || e.action === p.action)
        && (!p.du || e.at >= +p.du) && (!p.au || e.at < +p.au) && (!p.avant || e.id < +p.avant); });
      var page = L.slice(0, n); return { entrees: page.map(eqVueJ), suite: page.length === n ? page[page.length - 1].id : null }; },
    journal_csv: function (p, M) { var L = M.journal.slice().reverse(), q = function (t) { return '"' + String(t == null ? '' : t).replace(/"/g, '""') + '"'; };
      var corps = L.map(function (e) { return [e.id, new Date(e.at).toISOString(), '', e.par, e.role, e.action, e.cible_type, e.cible, e.motif, JSON.stringify(e.avant), JSON.stringify(e.apres), e.annule_id, e.origine, 'ab12'].map(q).join(','); }).join('\r\n');
      return { csv: '﻿"id","date_utc","date_paris","qui","role","action","cible_type","cible","motif","avant","apres","annule_id","origine","empreinte"\r\n' + (corps ? corps + '\r\n' : ''), lignes: L.length, tronque: false, nom: 'wimoro-journal-20261119.csv' }; },
    journal_verifier: function (p, M) { return { ok: true, n: M.journal.length, tete: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', rompue: null }; },
    journal_annuler: function (p, M) { var e = M.journal.filter(function (x) { return x.id === +p.id; })[0]; if (!e) throw { message: 'entree_inconnue' };
      if (!e.inverse) throw { message: 'non_annulable' }; if (M.journal.some(function (x) { return x.annule_id === e.id; })) throw { message: 'deja_annule' };
      if (M.role !== 'administrateur' && e.admin !== uid()) throw { message: 'interdit' };
      if (e.cible_type === 'reglage' && e.action === 'reglage_modifier' && JSON.stringify(eqReg(e.cible).valeur) !== JSON.stringify(e.apres.valeur)) throw { message: 'deja_modifie' };
      db.eqAnnule = e.id; try { var p2 = clone(e.inverse.p || {}); p2.motif = 'Annulation de l’entrée n° ' + e.id + ' : ' + String(p.motif || '').trim(); var r = eqPorte(e.inverse.action, p2); } finally { db.eqAnnule = null; }
      r = r || {}; r.annule = e.id; return r; },
    joueurs_chercher: function (p, M) { var q = String(p.q || '').trim().toLowerCase();
      var L = M.joueurs.filter(function (j) { return q ? (j.id === q || String(j.n).toLowerCase().indexOf(q) >= 0 || String(j.email || '').toLowerCase().indexOf(q) >= 0) : !j.bot; });
      return { joueurs: L.slice(0, 30).map(eqVue) }; },
    joueur_fiche: function (p) { return eqFiche(p.id); },
    joueur_activite: function (p, M) { var id = p.id; eqJ(id); var n = Math.min(200, Math.max(1, +p.n || 50)), av = +p.avant || Infinity, T = Array.isArray(p.types) ? p.types : null;
      var L = [].concat((M.sessions[id] || []).map(function (s) { return { t: 'connexion', at: s.cree, d: { appareil: s.appareil } }; }),
        M.ledger.filter(function (x) { return x.user === id; }).map(function (x) { return { t: 'argent', at: x.at, d: { k: x.k, montant: x.montant, solde: x.solde, ref: x.ref || null } }; }),
        M.msgs.filter(function (m) { return m.u === id && !/^dm:/.test(m.room); }).map(function (m) { return { t: 'message', at: m.at, d: { id: m.id, salon: m.room, k: m.k || 'msg', texte: m.text, source: m.source || 'joueur' } }; }),
        M.journal.filter(function (e) { return e.cible_type === 'joueur' && e.cible === id; }).map(function (e) { return { t: 'equipe', at: e.at, d: eqVueJ(e) }; }));
      L = L.filter(function (x) { return x.at < av && (!T || T.indexOf(x.t) >= 0); }).sort(function (a, b) { return b.at - a.at; });
      var page = L.slice(0, n); return { evenements: page, suite: page.length === n ? page[page.length - 1].at : null }; },
    joueur_solde: function (p, M) { eqCible(p.id, false); var j = eqJ(p.id), d = Math.round((+p.delta || 0) * 100) / 100;
      if (!d || Math.abs(d) > 1e7) throw { message: 'montant_invalide' }; if (M.role === 'moderateur' && Math.abs(d) > M.modMax) throw { message: 'plafond_moderateur' };
      var avant = +j.balance; if (avant + d < 0) throw { message: 'solde_negatif' }; j.balance = Math.round((avant + d) * 100) / 100;
      M.ledger.push({ user: j.id, at: Date.now(), k: 'ajustement_admin', montant: d, solde: j.balance, ref: String(p.motif || '').slice(0, 120) });
      window.__fakeSB.emit('joueur:' + j.id, 'etat', {});
      eqNoter('joueur_solde', 'joueur', j.id, { solde: avant }, { solde: j.balance, delta: d }, p.motif, { action: 'joueur_solde', p: { id: j.id, delta: -d } }); return eqFiche(j.id); },
    joueur_rang: function (p, M) { eqCible(p.id, false); var j = eqJ(p.id), t = +p.t, d = +p.d; if (!(t >= 0 && t <= 8 && d >= 0 && d <= 2)) throw { message: 'rang_invalide' };
      var avant = { t: j.t, d: j.d, xp: j.xp }; j.t = t; j.d = t === 8 ? 0 : d; j.xp = Math.max(j.xp || 0, [0, 600, 2000, 5000, 11000, 22000, 40000, 70000, 120000][t] + d * 200);
      eqNoter('joueur_rang', 'joueur', j.id, avant, { t: j.t, d: j.d, xp: j.xp }, p.motif, null); return eqFiche(j.id); },
    joueur_kyc: function (p, M) { eqCible(p.id, false); var j = eqJ(p.id); if (typeof p.ok !== 'boolean') throw { message: 'requete' }; if (!!j.kyc === p.ok) throw { message: 'kyc_inchange' };
      var avant = !!j.kyc; j.kyc = p.ok; j.kyc_at = p.ok ? Date.now() : null; eqNoter('joueur_kyc', 'joueur', j.id, { kyc: avant }, { kyc: p.ok }, p.motif, { action: 'joueur_kyc', p: { id: j.id, ok: avant } }); return eqFiche(j.id); },
    joueur_bloquer: function (p, M) { eqCible(p.id, true); var j = eqJ(p.id);
      if (['site', 'chat', 'paris', 'depots', 'retraits', 'creation', 'clans'].indexOf(p.acces) < 0) throw { message: 'acces_invalide' };
      var salon = String(p.salon || '').trim() || null; if (salon && (p.acces !== 'chat' || !SALON_RE.test(salon))) throw { message: 'salon_invalide' };
      var fin; if (db.eqAnnule && p.fin != null) fin = +p.fin; else { if (!(p.duree in DUREES_MS)) throw { message: 'duree_invalide' }; fin = DUREES_MS[p.duree] === -1 ? -1 : Date.now() + DUREES_MS[p.duree]; }
      var b = { id: ++M.seq, user: j.id, acces: p.acces, salon: salon, debut: Date.now(), fin: fin, motif: String(p.motif || ''), par: monNom() }; M.blocages.push(b);
      window.__fakeSB.emit('joueur:' + j.id, 'bloc', { id: b.id, acces: b.acces, salon: b.salon, fin: b.fin });
      eqNoter('joueur_bloquer', 'joueur', j.id, { id: b.id, actif: false }, eqBlocVue(b), p.motif, { action: 'joueur_debloquer', p: { id: b.id } });
      var r = eqFiche(j.id); r.blocage = b.id; return r; },
    joueur_debloquer: function (p, M) { var b = M.blocages.filter(function (x) { return x.id === +p.id; })[0]; if (!b) throw { message: 'blocage_inconnu' }; if (b.leve_at) throw { message: 'deja_leve' };
      eqCible(b.user, false); var avant = eqBlocVue(b); b.leve_at = Date.now(); b.leve_par = monNom(); b.leve_motif = String(p.motif || '');
      window.__fakeSB.emit('joueur:' + b.user, 'debloc', { id: b.id, acces: b.acces, salon: b.salon });
      eqNoter('joueur_debloquer', 'joueur', b.user, avant, eqBlocVue(b), p.motif, +b.fin === -1 || +b.fin > Date.now() ? { action: 'joueur_bloquer', p: { id: b.user, acces: b.acces, salon: b.salon, fin: +b.fin } } : null);
      var r = eqFiche(b.user); r.blocage = b.id; return r; },
    joueur_deconnecter: function (p, M) { eqCible(p.id, true); var j = eqJ(p.id), d = { id: ++M.seq, user: j.id, at: Date.now(), par: monNom(), motif: String(p.motif || '').trim() || null };
      M.deconnexions.unshift(d); window.__fakeSB.emit('joueur:' + j.id, 'deco', { at: d.at });
      eqNoter('joueur_deconnecter', 'joueur', j.id, null, { deconnexion: d.id, at: d.at }, p.motif, null); return eqFiche(j.id); },
    chat_messages: function (p, M) { var n = Math.min(200, Math.max(1, +p.n || 80));
      var L = M.msgs.filter(function (m) { return !/^dm:/.test(m.room) && (!p.salon || m.room === p.salon) && (!p.joueur || m.u === p.joueur) && (!p.avant || m.id < +p.avant); }).sort(function (a, b) { return b.id - a.id; });
      return { msgs: clone(L.slice(0, n)).map(function (m) { m.source = m.source || 'joueur'; return m; }) }; },
    chat_supprimer: function (p, M) { var m = M.msgs.filter(function (x) { return x.id === +p.id; })[0]; if (!m || /^dm:/.test(m.room)) throw { message: 'message_inconnu' }; if (m.source === 'masque') throw { message: 'deja_masque' };
      m.source = 'masque'; eqNoter('chat_supprimer', 'joueur', m.u, { id: m.id, source: 'joueur' }, { id: m.id, source: 'masque', salon: m.room, texte: m.text }, p.motif, { action: 'chat_restaurer', p: { id: m.id } });
      return { message: { id: m.id, room: m.room, source: 'masque' } }; },
    chat_restaurer: function (p, M) { var m = M.msgs.filter(function (x) { return x.id === +p.id; })[0]; if (!m || m.source !== 'masque') throw { message: 'message_inconnu' };
      m.source = 'joueur'; eqNoter('chat_restaurer', 'joueur', m.u, { id: m.id, source: 'masque' }, { id: m.id, source: 'joueur', salon: m.room }, p.motif, { action: 'chat_supprimer', p: { id: m.id } });
      return { message: { id: m.id, room: m.room, source: 'joueur' } }; },
    salon_regler: function (p, M) { var s = String(p.salon || '').trim(), lent = +p.lent || 0, ferme = p.ferme === true;
      if (!/^(general|vip|blitz|m:[a-z0-9-]{1,40}|clan:[a-z0-9]{1,20})$/.test(s)) throw { message: 'salon_invalide' }; if (lent !== Math.trunc(lent) || lent < 0 || lent > 300) throw { message: 'lent_invalide' };
      var r = eqReg('chat.salons'), avant = clone(r.valeur || {}), apres = clone(avant), old = avant[s] || { lent: 0, ferme: false };
      if (!lent && !ferme) delete apres[s]; else apres[s] = { lent: lent, ferme: ferme };
      if (JSON.stringify(apres) === JSON.stringify(avant)) throw { message: 'reglage_inchange' };
      eqEcrire('chat.salons', apres); eqNoter('salon_regler', 'reglage', 'chat.salons', { valeur: avant }, { valeur: apres }, p.motif, { action: 'salon_regler', p: { salon: s, lent: +old.lent || 0, ferme: !!old.ferme } });
      return { salons: apres }; },
    mots_interdits: function (p, M) { if (!Array.isArray(p.mots) || p.mots.length > 500 || p.mots.some(function (x) { return typeof x !== 'string'; })) throw { message: 'mots_invalides' };
      var mots = Array.from(new Set(p.mots.map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean))).sort(); if (mots.some(function (x) { return x.length < 2 || x.length > 40; })) throw { message: 'mots_invalides' };
      var r = eqReg('chat.mots_interdits'), rp = eqReg('chat.mots_prives'), prives = typeof p.prives === 'boolean' ? p.prives : !!rp.valeur, avant = { valeur: clone(r.valeur), prives: !!rp.valeur };
      if (JSON.stringify(mots) === JSON.stringify(r.valeur) && prives === !!rp.valeur) throw { message: 'reglage_inchange' };
      eqEcrire('chat.mots_interdits', mots); eqEcrire('chat.mots_prives', prives); siteEtat().mots = mots.slice();
      eqNoter('mots_interdits', 'reglage', 'chat.mots_interdits', avant, { valeur: mots, prives: prives }, p.motif, { action: 'mots_interdits', p: { mots: avant.valeur, prives: avant.prives } });
      return { mots: mots, prives: prives }; },
    clan_renommer: function (p, M) { var c = (db.clans || []).filter(function (x) { return x.id === p.id; })[0]; if (!c) throw { message: 'clan_inconnu' }; if (M.dissous[c.id]) throw { message: 'clan_indisponible' };
      var nom = String(p.nom || '').trim(); if (nom.length < 3 || nom.length > 28 || /[<>"`\\]/.test(nom)) throw { message: 'clan_nom_invalide' }; if (nom === c.name) throw { message: 'reglage_inchange' };
      var avant = c.name; c.name = nom; eqNoter('clan_renommer', 'clan', c.id, { nom: avant }, { nom: nom }, p.motif, { action: 'clan_renommer', p: { id: c.id, nom: avant } });
      return { clan: { id: c.id, nom: nom, tag: c.tag } }; },
    clan_dissoudre: function (p, M) { var c = (db.clans || []).filter(function (x) { return x.id === p.id; })[0]; if (!c) throw { message: 'clan_inconnu' }; if (M.dissous[c.id]) throw { message: 'deja_dissous' };
      var n = (c.members || []).length; M.dissous[c.id] = true; c.members = [];
      eqNoter('clan_dissoudre', 'clan', c.id, { dissous: false, membres: n }, { dissous: true, membres_sortis: n }, p.motif, null);
      return { clan: { id: c.id, nom: c.name, tag: c.tag, dissous: true, membres_sortis: n } }; },
    annonce_publier: function (p, M) { var t = p.textes || {}; if (typeof t !== 'object' || String(t.fr || '').trim().length < 3 || ['fr', 'en', 'he'].some(function (k) { return t[k] != null && String(t[k]).length > 280; })) throw { message: 'annonce_invalide' };
      var ton = p.ton || 'info'; if (['info', 'alerte', 'succes'].indexOf(ton) < 0) throw { message: 'annonce_invalide' }; if (p.fin != null && +p.fin <= Date.now()) throw { message: 'date_invalide' };
      var S = siteEtat(), avant = clone(S.annonce), a = { id: S.rev + 1, t: clone(t), ton: ton, fin: p.fin == null ? null : +p.fin, at: Date.now() };
      eqEcrire('site.annonce', a); S.annonce = a; window.__fakeSB.emit('site', 'annonce', { annonce: clone(a), rev: S.rev });
      eqNoter('annonce_publier', 'reglage', 'site.annonce', { valeur: avant }, { valeur: a }, p.motif, avant ? { action: 'annonce_publier', p: { textes: avant.t, ton: avant.ton, fin: avant.fin } } : { action: 'annonce_retirer', p: {} });
      return { annonce: a }; },
    annonce_retirer: function (p, M) { var S = siteEtat(), avant = clone(S.annonce); if (!avant) throw { message: 'annonce_absente' };
      eqEcrire('site.annonce', null); S.annonce = null; window.__fakeSB.emit('site', 'annonce', { annonce: null, rev: S.rev });
      eqNoter('annonce_retirer', 'reglage', 'site.annonce', { valeur: avant }, { valeur: null }, p.motif, { action: 'annonce_publier', p: { textes: avant.t, ton: avant.ton, fin: avant.fin } }); return { annonce: null }; },
    maintenance: function (p, M) { if (typeof p.actif !== 'boolean') throw { message: 'requete' }; var S = siteEtat(), avant = clone(S.maintenance), msg = 'message' in p ? (p.message || null) : avant.message;
      if (p.actif === !!avant.actif && JSON.stringify(msg) === JSON.stringify(avant.message)) throw { message: 'reglage_inchange' };
      S.maintenance = { actif: p.actif, message: msg }; eqEcrire('site.maintenance', p.actif); eqEcrire('site.maintenance_message', msg);
      window.__fakeSB.emit('site', 'maint', { actif: p.actif, message: clone(msg), rev: S.rev });
      eqNoter('maintenance', 'reglage', 'site.maintenance', { valeur: !!avant.actif, message: avant.message }, { valeur: p.actif, message: msg }, p.motif, { action: 'maintenance', p: { actif: !!avant.actif, message: avant.message } });
      return { maintenance: clone(S.maintenance) }; },
    activite_simulee: function (p, M) { var avant = clone(M.bots), v = clone(M.bots);
      if (db.eqAnnule && p.remplacer) v = clone(p.remplacer); else {
        if ('actif' in p) v.actif = p.actif !== false;
        [['intensite', 3], ['chat', 3], ['rappel', 0.2]].forEach(function (k) { if (k[0] in p) { var n = +p[k[0]]; if (!(n >= 0 && n <= k[1])) throw { message: 'montant_invalide' }; v[k[0]] = n; } }); }
      if (JSON.stringify(v) === JSON.stringify(avant)) throw { message: 'reglage_inchange' };
      M.bots = v; eqNoter('activite_simulee', 'bots', 'bots', { bots: avant }, { bots: v }, p.motif, { action: 'activite_simulee', p: { remplacer: avant } }); return { bots: clone(v) }; }
  };

  /* ----- Catalogue des marchés réels : 7 catégories et 3 fiches d'exemple (CFG.catalogue les remplace) ----- */
  var IMG_MARCHES = 'https://brmwvxncyeypefsgiepf.supabase.co/storage/v1/object/public/marches/';
  var CATS_MARCHES = [
    { id: 'crypto', n: { fr: 'Crypto', en: 'Crypto', he: 'קריפטו' }, ic: 'bitcoin' }, { id: 'bourse', n: { fr: 'Bourse', en: 'Stocks', he: 'בורסה' }, ic: 'candlestick-chart' },
    { id: 'economie', n: { fr: 'Économie', en: 'Economy', he: 'כלכלה' }, ic: 'landmark' }, { id: 'politique', n: { fr: 'Politique', en: 'Politics', he: 'פוליטיקה' }, ic: 'vote' },
    { id: 'sport', n: { fr: 'Sport', en: 'Sports', he: 'ספורט' }, ic: 'trophy' }, { id: 'tech', n: { fr: 'Tech', en: 'Tech', he: 'טכנולוגיה' }, ic: 'cpu' },
    { id: 'culture', n: { fr: 'Jeux vidéo et culture', en: 'Games and culture', he: 'גיימינג ותרבות' }, ic: 'gamepad-2' }];
  var FICHES_EXEMPLE = [
    { id: 'btc-fin-decembre-2026', k: 'b', c: 'crypto', st: 'ouvert', g: 'modele', p: 42, f: Date.parse('2026-12-30T23:59:00Z'), z: Date.parse('2027-01-01T00:05:00Z'),
      i: 'img/0000000000000000000000000000000000000000000000000000000000000001.png', l: { actif: 'btc' }, per: { m: 'btc-mensuel', p: '2026-12' },
      src: { n: 'Coinbase Exchange, bougie journalière BTC-USD', u: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400' },
      t: { fr: { q: 'Le Bitcoin sera-t-il au-dessus de 65 000 $ le 31 décembre 2026 à 23h59 UTC ?', s: 'BTC > 65 000 $ au 31/12', r: 'OUI si la clôture journalière BTC-USD de Coinbase du 31/12/2026 est strictement supérieure à 65 000 $ ; sinon NON.' },
           en: { q: 'Will Bitcoin be above $65,000 on December 31, 2026 at 23:59 UTC?', s: 'BTC > $65K on Dec 31', r: 'YES if the Coinbase BTC-USD daily close of 12/31/2026 is strictly above $65,000; otherwise NO.' },
           he: { q: 'האם הביטקוין ייסחר מעל 65,000 דולר ב-31 בדצמבר 2026 בשעה 23:59 UTC?', s: 'ביטקוין מעל 65K$ ב-31.12', r: 'כן אם סגירת הנר היומי של BTC-USD ב-Coinbase ב-31.12.2026 גבוהה ממש מ-65,000 דולר; אחרת לא.' } }, rev: 1 },
    { id: 'pl-new-ars-2026-11-21', k: 'o', c: 'sport', st: 'ouvert', g: 'sport', f: Date.parse('2026-11-21T17:30:00Z'), z: Date.parse('2026-11-21T19:35:00Z'),
      l: { match: { sport: 'foot', competition: 'PL', debut: '2026-11-21T17:30:00Z' } }, src: { n: 'Premier League', u: 'https://www.premierleague.com' },
      t: { fr: { q: 'Qui va gagner : Newcastle, match nul ou Arsenal ?', s: 'Newcastle – Arsenal', r: 'Résultat à la fin du temps réglementaire.' },
           en: { q: 'Who will win: Newcastle, draw, or Arsenal?', s: 'Newcastle – Arsenal', r: 'Result at the end of regulation time.' },
           he: { q: 'מי תנצח: ניוקאסל, תיקו או ארסנל?', s: 'ניוקאסל – ארסנל', r: 'התוצאה בסיום הזמן החוקי.' } },
      opt: [{ id: 'pl-new-ars-2026-11-21-home', c: 'home', t: { fr: 'Newcastle', en: 'Newcastle United', he: 'ניוקאסל' }, p: 17 },
            { id: 'pl-new-ars-2026-11-21-draw', c: 'draw', t: { fr: 'Match nul', en: 'Draw', he: 'תיקו' }, p: 22 },
            { id: 'pl-new-ars-2026-11-21-away', c: 'away', t: { fr: 'Arsenal', en: 'Arsenal', he: 'ארסנל' }, p: 61 }], rev: 2 },
    { id: 'shutdown-usa-decembre-2026', k: 'b', c: 'economie', st: 'suspendu', g: 'actu', p: 30, f: Date.parse('2026-12-31T22:00:00Z'), sus: { m: 'vérification de la source' },
      t: { fr: { q: 'Le gouvernement fédéral américain sera-t-il en shutdown en décembre 2026 ?', s: 'Shutdown USA en décembre', r: 'OUI si un shutdown fédéral débute ou est en cours en décembre 2026.' },
           en: { q: 'Will the US federal government be shut down in December 2026?', s: 'US shutdown in December', r: 'YES if a federal shutdown starts or is ongoing in December 2026.' },
           he: { q: 'האם הממשל הפדרלי בארה"ב יושבת בדצמבר 2026?', s: 'השבתה בארה"ב בדצמבר', r: 'כן אם השבתה פדרלית מתחילה או נמשכת בדצמבר 2026.' } }, rev: 3 }];
  var CREDITS_EXEMPLE = [{ i: 'img/0000000000000000000000000000000000000000000000000000000000000001.png',
    credit: { titre: 'File:Bitcoin.svg', auteur: 'Bitboy', licence: 'Domaine public', licence_url: null, source: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Bitcoin.svg' } }];
  function catalogueFaux() { var c = CFG.catalogue || {};
    return { rev: c.rev || 3, en_ligne: !!c.en_ligne, cats: c.cats || CATS_MARCHES, m: c.m || FICHES_EXEMPLE, x: c.x || [], credits: c.credits || CREDITS_EXEMPLE }; }
  function vueFiche(x, L) { var f = clone(x); if (!L) return f;
    if (f.t && f.t.fr) f.t = f.t[L] || f.t.fr;
    (f.opt || []).forEach(function (o) { if (o.t && typeof o.t === 'object') o.t = o.t[L] || o.t.fr; });
    return f; }

  /* ----- Marchés : le moteur est celui de js/engine.js, dont le serveur est le portage (parité vérifiée par tests/sql/moteur.spec.mjs) ----- */
  var r2 = function (x) { return Math.round(x * 100) / 100; }, r6 = function (x) { return Math.round(x * 1e6) / 1e6; }, r8 = function (x) { return Math.round(x * 1e8) / 1e8; };
  var borne = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function marche(id) {                                    // marché du faux serveur ; créé à la demande à partir du catalogue du site
    var m = db.marches[id];
    if (!m && typeof MK !== 'undefined' && MK[id]) { var k = MK[id]; m = db.marches[id] = { p: r6(k.p), d0: k.d0, vol: Math.round(k.vol), people: k.people | 0, liq: r2(bookDepth({ vol: k.vol, liq: k.liq })), st: 'open', hot: 0, ph: [] }; }
    return m;
  }
  var carnet = function (id) { var m = marche(id); return { p: m.p, vol: m.vol, liq: m.liq == null ? undefined : m.liq, cat: MK[id].cat }; };
  var fratrie = function (id) { var k = MK[id]; return k && k.parent && GK[k.parent] ? GK[k.parent].outcomes.map(function (o) { return o.id; }).sort() : [id]; };
  var pousser = function (m) { m.ph = m.ph || []; m.ph.push(r2(m.p)); if (m.ph.length > 160) m.ph.shift(); };
  var marchesDe = function (ids) { var o = {}; ids.forEach(function (id) { var m = marche(id); if (m) o[id] = [m.p, Math.round(m.vol), m.people | 0, m.liq == null ? Math.max(400, r2(m.vol * 0.006)) : m.liq]; }); return o; };
  function reequilibrer(id, delta) {                       // les issues d'un même marché totalisent 100 % (wm.group_rebalance)
    var ids = fratrie(id); if (ids.length < 2) return;
    var autres = ids.filter(function (x) { return x !== id; }).map(marche), tot = autres.reduce(function (n, x) { return n + x.p; }, 0);
    if (delta && tot > 0) autres.forEach(function (x) { x.p = r6(borne(x.p - delta * x.p / tot, 1, 97)); });
    var ecart = r6(100 - ids.map(marche).reduce(function (n, x) { return n + x.p; }, 0));
    if (ecart) { var gros = autres.filter(function (x) { return x.p + ecart >= 1 && x.p + ecart <= 98; }).sort(function (x, y) { return y.p - x.p; })[0]; if (gros) gros.p = r6(gros.p + ecart); }
  }
  /* ----- Propositions de marché : une liste commune à tous les joueurs du faux serveur ----- */
  function propsListe() { if (!db.props) db.props = [['pp-psg', 'Le PSG sera-t-il champion de France 2027 ?', 'Football', 38, 9], ['pp-jeu', 'Un jeu vidéo dépassera-t-il 50 millions de ventes en 2027 ?', 'Culture', 21, 6], ['pp-sol', 'Le Solana dépassera-t-il 300 $ avant juin 2027 ?', 'Crypto', 44, 12]]
      .map(function (s) { return { id: db.seq++, code: s[0], q: s[1], cat: s[2], date: null, time: null, src: '', rules: '', p0: 50, status: 'vote', pour: 0, contre: 0, base: s[3], baseContre: s[4], need: 50, at: Date.now(), mid: null, by: null, votes: {} }; });
    return db.props; }
  function propVotes(x) { if (x.status === 'live') return { pour: x.need, contre: x.baseContre + x.contre };
    if (x.code) return { pour: Math.min(x.need - 1, x.base + x.pour), contre: x.baseContre + x.contre };
    var ticks = Math.min(Math.max(0, Math.floor((Date.now() - x.at) / 1500)), Math.max(0, x.need - x.base - x.pour));
    return { pour: Math.min(x.need, x.base + x.pour + ticks), contre: x.baseContre + x.contre + Math.floor(ticks * 0.18) }; }
  function propJson(x) { var v = propVotes(x); return { id: x.id, code: x.code, q: x.q, cat: x.cat, date: x.date, time: x.time, src: x.src, rules: x.rules, p0: x.p0, status: x.status, 'for': v.pour, against: v.contre, need: x.need, at: x.at, mid: x.mid, by: x.by, voted: x.votes[uid()] || null }; }
  function propsEtat() { var moi = uid(), L = propsListe(), users = {};
    L.forEach(function (x) { if (x.by && x.by !== moi && db.etats[x.by]) users[x.by] = { n: db.etats[x.by].me.n, t: 0, d: 0, tone: 0, bot: false, pub: 1 }; });
    return { mine: L.filter(function (x) { return x.by === moi && !x.code; }).slice(0, 20).map(propJson), vote: L.filter(function (x) { return x.status === 'vote' && x.by !== moi; }).map(propJson), users: users }; }
  function propsAvancer(ev) { propsListe().forEach(function (x) { if (x.status !== 'vote' || x.code || propVotes(x).pour < x.need) return;
      var v = propVotes(x), mid = 'perso-' + (slugify(x.q).slice(0, 24).replace(/-$/, '') || 'pari') + '-' + x.id, court = shortOf(x.q);
      db.marches[mid] = { def: { q: x.q, short: court, cat: x.cat, date: x.date, time: x.time, rules: x.rules + ' Source : ' + x.src + '.', heat: 1.6 }, p: x.p0, d0: x.p0, vol: 250, people: 12, liq: 400, st: 'open', hot: 0, ph: [] };
      x.baseContre = v.contre - x.contre; x.status = 'live'; x.mid = mid;
      var auteur = db.etats[x.by], n = { id: 'n' + (db.seq++), ic: 'check', code: 'prop_live', p: { id: x.id, q: court, m: mid }, href: '#marche-' + mid, at: Date.now(), read: false };
      if (auteur) { auteur.me.xp += 50; auteur.notifs.unshift(n); if (x.by === uid()) { ev.push({ k: 'xp', n: 50, src: 'proposition' }); ev.push({ k: 'notif', n: clone(n) }); } }
      window.__fakeSB.emit('marches', 'etat', { id: mid, st: 'open' }); }); }
  /* ----- Copy trading : exécution d'un pari copié (wm.copie_executer), vente d'un lot (wm.copie_vendre), arrêt ----- */
  function copiesEtat(e) { var L = e.copiesL || [], users = {}; L.forEach(function (c) { users[c.u] = (e.users || {})[c.u] || { n: 'joueur.copie', t: 4, d: 0, tone: 0, bets: 120, acc: 61, profit: 900, pub: 1, bot: true }; });
    return { list: clone(L), users: clone(users), copiers: e.copieurs | 0, earn: e.copieGains || 0 }; }
  function copieLatent(c) { return c.holds.reduce(function (n, h) { var m = marche(h.m); return n + h.sh * (h.s === 'oui' ? m.p : 100 - m.p) / 100 - h.cost; }, 0); }
  function copieExecuter(e, c, mid, s, mise) { var me = e.me, m = marche(mid); if (c.status !== 'active' || !m || m.st !== 'open') return { r: 'ferme' };
    if (c.cats && c.cats.length && c.cats.indexOf(MK[mid].cat) < 0) return { r: 'cat' };
    var libre = Math.max(0, c.budget + c.realized - c.holds.reduce(function (n, h) { return n + h.cost; }, 0)), amt = c.per;
    if (c.mode === 'prop') { amt = mise * c.pct / 100; if (c.cap > 0) amt = Math.min(amt, c.cap); amt = Math.min(amt, libre); }
    amt = Math.floor(amt * 100 + 1e-9) / 100; if (amt < 5 || libre < amt) return { r: 'budget' }; if (me.balance < amt) return { r: 'balance' };
    var q = quoteBuy(carnet(mid), s, amt, rangDe(me).t >= 5); if (!q.full || !(q.sh > 0)) return { r: 'liq' };
    var fee = r2(q.fee), cout = r2(amt - fee);
    me.balance = r2(me.balance - amt); me.played = (me.played | 0) + 1; me.maxBet = Math.max(me.maxBet || 0, amt); me.realized = r2((me.realized || 0) - fee);
    var pos = e.positions.filter(function (p) { return p.m === mid && p.s === s; })[0];
    if (pos) { pos.avg = r6((pos.avg * pos.sh + q.avg * q.sh) / (pos.sh + q.sh)); pos.sh = r8(pos.sh + q.sh); } else e.positions.push({ m: mid, s: s, sh: r8(q.sh), avg: r6(q.avg) });
    var h = c.holds.filter(function (x) { return x.m === mid && x.s === s; })[0]; if (h) { h.sh = r8(h.sh + q.sh); h.cost = r2(h.cost + cout); } else c.holds.push({ m: mid, s: s, sh: r8(q.sh), cost: cout });
    c.realized = r2(c.realized - fee); c.n++; c.given = Math.round((c.given + fee * 0.2) * 1e4) / 1e4; c.log.unshift({ k: 'open', m: mid, s: s, amt: amt, at: Date.now() });
    var p0 = m.p; m.p = r6(borne(m.p + q.impact * (s === 'oui' ? 1 : -1), 1, 99)); m.vol = r2(m.vol + cout); m.people = (m.people | 0) + 1; pousser(m); reequilibrer(mid, m.p - p0);
    return { r: 'ok', amt: amt }; }
  function copieVendre(e, c, h) { var me = e.me, m = marche(h.m), pos = e.positions.filter(function (p) { return p.m === h.m && p.s === h.s; })[0], sh = Math.min(h.sh, pos ? pos.sh : 0), pnl;
    if (sh > 1e-6) { var q = quoteSell(carnet(h.m), h.s, sh), vendu = Math.min(sh, q.sh); if (!(vendu > 1e-9)) return 0;
      var pro = Math.floor(q.pro * 100 + 1e-9) / 100, cout = h.cost * (vendu / h.sh); pnl = r2(pro - cout);
      var reste = r8(pos.sh - vendu); if (reste < 0.05) reste = 0; me.realized = r2((me.realized || 0) + pro - r2(vendu * pos.avg / 100)); pos.sh = reste; if (!reste) e.positions = e.positions.filter(function (p) { return p !== pos; });
      me.balance = r2(me.balance + pro); e.history.unshift({ k: 'sell', m: h.m, q: 'via|copy|' + c.u, s: h.s, win: pnl >= 0, pnl: pnl, at: Date.now() });
      var p0 = m.p; m.p = r6(borne(m.p + q.impact * (h.s === 'oui' ? -1 : 1), 1, 99)); m.vol = r2(m.vol + pro); pousser(m); reequilibrer(h.m, m.p - p0);
      h.sh = r8(h.sh - vendu); h.cost = r2(h.cost - cout); if (h.sh < 0.05) c.holds = c.holds.filter(function (x) { return x !== h; }); }
    else { pnl = r2(h.sh * (h.s === 'oui' ? m.p : 100 - m.p) / 100 - h.cost); c.holds = c.holds.filter(function (x) { return x !== h; }); }
    c.realized = r2(c.realized + pnl); return pnl; }
  function copieArreter(e, c, why, vendre) { if (vendre) c.holds.slice().forEach(function (h) { copieVendre(e, c, h); });
    c.endPnl = r2(c.realized + copieLatent(c)); c.kept = c.holds.length; c.holds = []; c.status = 'stopped'; c.why = why; c.end = Date.now(); }
  /* le joueur copié parie ou vend, côté serveur : ses copies suivent, le copieur est prévenu sur son sujet privé */
  function copieSuivre(u, mid, s, mise) { var e = etat(), sujet = 'joueur:' + uid(), envois = [];
    (e.copiesL || []).filter(function (c) { return c.u === u && c.status === 'active'; }).forEach(function (c) { var r = copieExecuter(e, c, mid, s, mise);
      if (r.r === 'ok') { envois.push(notif('copy', 'copie_ouverte', { u: u, amt: r.amt, s: s, m: mid }, '#copie').n);
        if (c.stop > 0 && c.realized + copieLatent(c) <= -c.budget * c.stop / 100) { copieArreter(e, c, 'stop', true); envois.push(notif('copy', 'copie_stop', { u: u, pnl: c.endPnl }, '#copie').n); } }
      else if (r.r === 'budget' || r.r === 'balance') { c.log.unshift({ k: 'skip', m: mid, s: s, why: r.r, at: Date.now() }); envois.push(notif('copy', 'copie_a_sec', { u: u, why: r.r }, '#copie').n); } });
    persist(); envois.forEach(function (n) { window.__fakeSB.emit(sujet, 'notif', { n: n }); }); return envois.length; }
  function copieSortir(u, mid, s) { var e = etat(), sujet = 'joueur:' + uid(), envois = [];
    (e.copiesL || []).filter(function (c) { return c.u === u && c.status === 'active'; }).forEach(function (c) { var h = c.holds.filter(function (x) { return x.m === mid && x.s === s; })[0]; if (!h) return;
      var pnl = copieVendre(e, c, h); c.log.unshift({ k: 'exit', m: mid, s: s, pnl: pnl, at: Date.now() }); envois.push(notif('copy', 'copie_sortie', { u: u, m: mid, s: s, pnl: pnl }, '#copie').n); });
    persist(); envois.forEach(function (n) { window.__fakeSB.emit(sujet, 'notif', { n: n }); }); return envois.length; }
  /* ----- Clans : l'annuaire de démonstration est lu sur l'écran (CLANS), les clans de joueurs sont dans db.clans ----- */
  function clansTous() { var demo = (typeof CLANS !== 'undefined' ? CLANS : []).filter(function (c) { return /^c\d+$/.test(c.id); }).map(function (c) { return { id: c.id, tag: c.tag, access: c.access, minRank: c.minRank, code: clanCode({ id: c.id }), n: c.n }; });
    return demo.concat((db.clans || []).map(function (j) { return { id: j.id, tag: j.tag, access: j.access, minRank: j.minRank, code: j.code, n: j.members.length }; })); }
  function clanVerifier(e, id) { var c = clansTous().filter(function (x) { return x.id === id; })[0]; if (!c) throw { message: 'clan_inconnu' }; if (e.clanM) throw { message: 'clan_deja' };
    if (e.clanParti && e.clanParti > Date.now() - 7 * 864e5) throw { message: 'clan_attente' }; if (c.n >= 50) throw { message: 'clan_complet' }; if (rangDe(e.me).t < c.minRank) throw { message: 'rang_insuffisant' }; return c; }
  /* fil d'activité d'un clan, rôle de l'appelant dans un clan de joueurs, membre d'un clan */
  function filPoser(clan, u, code, p) { db.fils = db.fils || {}; (db.fils[clan] = db.fils[clan] || []).unshift({ u: u, code: code, p: p || {}, at: Date.now() }); }
  function clanMoi(e) { if (!e.clanM) throw { message: 'clan_absent' }; var j = (db.clans || []).filter(function (x) { return x.id === e.clanM.id; })[0]; return { j: j || { id: e.clanM.id, members: [] }, role: e.clanM.role }; }
  function clanMembre(j, u) { return u === uid() ? null : j.members.filter(function (m) { return m.u === u; })[0]; }
  function clanEntrer(e, id, role) { e.clanM = { id: id, role: role, since: Date.now(), xp: 0, jour: 0, ecartes: 0 }; e.clanApps = {}; filPoser(id, uid(), role === 'chef' ? 'fonde' : 'rejoint', {});
    var j = (db.clans || []).filter(function (x) { return x.id === id; })[0]; if (j) j.members.push({ u: uid(), role: role, since: Date.now(), pts: 0 }); }
  /* guerre d'un clan : points (les nôtres : bots à 500, joueurs = contribution / 10 ; les leurs : CFG.pointsEux chacun), règlement après 48 heures */
  function guerreVue(e, g) { var mine = g.bots.map(function (u) { return { u: u, pts: 500 }; }); Object.keys(g.joueurs).forEach(function (u) { mine.push({ u: u, pts: g.joueurs[u].pts !== undefined ? g.joueurs[u].pts : Math.round(((db.etats[u] || e).clanM || { xp: 0 }).xp / 10) }); });
    var theirs = []; for (var i = 1; i <= 10; i++) theirs.push({ i: i, pts: g.eux }); return { id: g.id, foe: g.foe, at: g.at, endAt: g.endAt, status: g.status, buyin: g.buyin, pot: g.buyin * (10 + mine.length), mine: mine, theirs: theirs, a: g.a, b: g.b }; }
  function guerresAvancer(e, ev) { var n = 0; Object.keys(db.guerres || {}).forEach(function (cid) { db.guerres[cid].forEach(function (g) { if (g.status !== 'live' || g.endAt > Date.now()) return;
      if (!(e.clanM && e.clanM.id === cid) && !g.joueurs[uid()]) return;                         // un membre du clan, ou un participant qui l'a quitté
      var v = guerreVue(e, g), top = function (L) { return L.map(function (x) { return x.pts; }).sort(function (p, q) { return q - p; }).slice(0, 10).reduce(function (t, x) { return t + x; }, 0); }, a = top(v.mine), b = top(v.theirs);
      g.status = a > b ? 'won' : a < b ? 'lost' : 'draw'; g.a = a; g.b = b; g.pot = v.pot; g.regle = Date.now(); n++; var part = g.status === 'won' && v.mine.length ? r2(v.pot * .96 / v.mine.length) : 0, moi = g.joueurs[uid()];
      if (moi) { var me = e.me; if (g.status === 'won') { me.balance = r2(me.balance + part); me.xp += 50; ev.push({ k: 'xp', n: 50, src: 'guerre' }); } else if (g.status === 'draw') me.balance = r2(me.balance + moi.paye);
        ev.push(notif('shield', 'guerre_' + g.status, { id: cid, foe: g.foe, gain: r2(part - moi.paye), pot: v.pot, a: a, b: b }, '#clan-' + cid)); } }); });
    return n; }
  function clanAvancer(e, ev) { guerresAvancer(e, ev || []); if (e.clanM) ((db.appels || {})[e.clanM.id] || []).forEach(function (k) { if (k.n !== null || k.by !== uid() || k.du > Date.now()) return;
      var j = (db.clans || []).filter(function (x) { return x.id === e.clanM.id; })[0], autres = j ? j.members.length - 1 : 0; k.n = Math.min(2 + (k.id % 4), Math.max(0, autres));
      if (k.n > 0) { var n = notif('users', 'clan_appel_suivi', { n: k.n, m: k.m, id: e.clanM.id }, '#clan-' + e.clanM.id); if (ev) ev.push(n); } });
    var apps = e.clanApps || {}; Object.keys(apps).forEach(function (id) { if (apps[id] > Date.now() - 6000) return; delete apps[id];
      var ok = (CFG.clanRefus || []).indexOf(id) < 0; if (ok) { try { clanVerifier(e, id); clanEntrer(e, id, 'membre'); } catch (x) { ok = false; } }
      var n = notif('shield', ok ? 'clan_accepte' : 'clan_refuse', { id: id }, '#clan-' + id); if (ev) ev.push(n); }); }
  function clanEtat(e) { var moi = uid(), users = {}; (db.clans || []).forEach(function (j) { j.members.forEach(function (m) { if (m.u !== moi && db.etats[m.u]) users[m.u] = { n: db.etats[m.u].me.n, t: 0, d: 0, tone: 0, bot: false, pub: 1, clan: j.id }; else if (m.u !== moi && db.fiches[m.u]) users[m.u] = ficheDe(m.u); }); });
    var feed = e.clanM ? ((db.fils || {})[e.clanM.id] || []).slice(0, 30) : [], calls = e.clanM ? ((db.appels || {})[e.clanM.id] || []).slice(0, 6) : [];
    feed.forEach(function (f) { [f.u, f.p.u, f.p.par].forEach(function (u) { if (u && u !== moi && !users[u] && db.fiches[u]) users[u] = ficheDe(u); }); });
    return { mine: e.clanM ? clone(e.clanM) : null, leftAt: e.clanParti || null, apps: clone(e.clanApps || {}), feed: clone(feed), calls: calls.map(function (k) { return { id: k.id, m: k.m, s: k.s, by: k.by, at: k.at, n: k.n || 0 }; }),
      war: e.clanM ? (((db.guerres || {})[e.clanM.id] || []).filter(function (g) { return g.status === 'live'; }).map(function (g) { return guerreVue(e, g); })[0] || null) : null,
      wars: e.clanM ? ((db.guerres || {})[e.clanM.id] || []).filter(function (g) { return g.status !== 'live'; }).slice(0, 10).map(function (g) { return { foe: g.foe, at: g.regle, status: g.status, a: g.a, b: g.b, pot: g.pot }; }) : [],
      clans: (db.clans || []).map(function (j) { var x = clone(j); if (!j.members.some(function (m) { return m.u === moi; })) x.code = null; return x; }), users: users }; }
  /* ----- Argent fictif : mêmes barèmes que wm.argent() ----- */
  var ARGENT = { coins: { USDC: { min: 5, fixe: true, nets: ['Base', 'Ethereum', 'Arbitrum', 'Solana', 'Polygon'] }, USDT: { min: 5, fixe: true, nets: ['Ethereum', 'Tron', 'Arbitrum', 'Solana'] }, ETH: { min: 0.002, nets: ['Ethereum', 'Base', 'Arbitrum'] }, BTC: { min: 0.0001, nets: ['Bitcoin', 'Lightning'] }, SOL: { min: 0.03, nets: ['Solana'] } },
    nets: { Base: { conf: 12, fmt: 'evm', wfee: 0.05 }, Ethereum: { conf: 12, fmt: 'evm', wfee: 2 }, Arbitrum: { conf: 12, fmt: 'evm', wfee: 0.1 }, Polygon: { conf: 30, fmt: 'evm', wfee: 0.05 }, Solana: { conf: 1, fmt: 'sol', wfee: 0.01 }, Tron: { conf: 20 }, Bitcoin: { conf: 2 }, Lightning: { conf: 1 } },
    fiat: { card: { df: 0.025, wf: 0.015, need: 3, pas: 650, wd_ms: 3500 }, bank: { df: 0, wf: 0, need: 8, pas: 700, wd_ms: 6000 }, paypal: { df: 0.019, wf: 0.01, need: 3, pas: 650, wd_ms: 3500 } } };
  var depJson = function (d) { var o = clone(d); if (d.st === 'pending' && d.due) o.conf = Math.max(0, Math.min(d.need - 1, Math.floor(d.need * (Date.now() - d.at) / Math.max(1, d.due - d.at)))); else if (d.st !== 'pending') o.conf = d.need; return o; };
  var jour = function () { return new Date().toISOString().slice(0, 10); };
  function regler(e, ev) {                                   // wm.demo_regler : crédite les dépôts échus, envoie les retraits échus
    var me = e.me, avant = rangDe(me), depot = false, t = Date.now();
    e.deps.slice().reverse().forEach(function (d) { if (d.st !== 'pending' || !d.due || d.due > t) return;
      d.st = 'done'; d.conf = d.need; me.balance = r2(me.balance + d.usd); me.deposits = (me.deposits | 0) + 1; depot = true;
      ev.push({ k: 'dep', id: d.id, usd: d.usd }); ev.push(notif('wallet', 'dep_credited', { usd: d.usd, amt: d.amt, coin: d.coin, net: d.net, method: d.method }, '#depot'));
      missionAvance(e, 'dep', ev);
      if (me.depDay !== jour()) { me.depDay = jour(); me.xp += 100; ev.push({ k: 'xp', n: 100, src: 'depot' }); } });
    e.wds.slice().reverse().forEach(function (w) { if (w.st !== 'pending' || !w.due || w.due > t) return;
      w.st = 'sent'; ev.push({ k: 'wd', id: w.id }); ev.push(notif('out', 'wd_sent', { recv: r2(w.amt - w.fee), net: w.net, method: w.method }, '#retrait')); });
    if (depot) { rangMonte(me, avant, ev); badges(e, ev); }
  }
  function rgMaj(e, ev) {                                    // plafonds en attente arrivés à échéance
    e.rg = e.rg || { lim: { day: 0, week: 0, month: 0 }, pend: {}, pause: 0, excl: 0 };
    Object.keys(e.rg.pend).forEach(function (k) { var p = e.rg.pend[k]; if (p.at > Date.now()) return; e.rg.lim[k] = p.v; delete e.rg.pend[k]; ev.push(notif('shield', 'rg_limite', { k: k, v: p.v }, '#responsable')); });
    if (e.rg.pause && e.rg.pause <= Date.now()) e.rg.pause = 0;
  }
  /* ----- Pari éclair ----- */
  var eclairJson = function (e) { var ME = MoteurEclair, r = ME.round(Date.now()), L = e.eclairMises || [], b = {};
    L.forEach(function (m) { if (m.etat === 'ouverte' && m.r === r) b[m.g] = clone(m); });
    return { r: r, du: L.filter(function (m) { return m.etat === 'ouverte' && m.r < r; }).length, b: b }; };
  /* La Série : mêmes règles que supabase/migrations/…_serie.sql, avec le moteur chargé par la page */
  var serieJson = function (e) { return e.serie ? clone(e.serie) : null; };
  var serieFin = function (e, s, mode, ev, hist) { var me = e.me, avant = rangDe(me), h;
    if (mode === 'rendue') { me.balance = Math.round((me.balance + s.stake) * 100) / 100; s.state = 'cashed'; s.stack = s.stake; s.step = 0; }
    else { me.balance = Math.round((me.balance + s.stack) * 100) / 100; me.settled++; me.wins++; me.realized = Math.round(((me.realized || 0) + s.stack - s.stake) * 100) / 100; s.state = 'cashed'; s.step = s.won;
      h = { k: 'flash', q: 'serie|' + s.gid + '|' + s.won + '|' + s.won + '|' + (Math.round(s.stack / s.stake * 10) / 10), s: 'oui', win: true, pnl: Math.round((s.stack - s.stake) * 100) / 100, at: Date.now() };
      e.history.unshift(clone(h)); hist.push(h); var n = 20 + s.won * 10; me.xp += n; ev.push({ k: 'xp', n: n, src: 'serie' }); rangMonte(me, avant, ev); }
    s.choice = null; s.endAt = Date.now(); };
  function serieAction(b) { var ME = MoteurEclair, e = etat(), me = e.me, t = Date.now(), s = e.serie, ev = [], hist = [], regles = [], d, rep, x, cle;
    var enCours = function () { if (!s || s.state !== 'running') throw { message: 'serie_absente' }; };
    if (b.action === 'serie_start') { d = ME.JEUX[b.gid]; cle = uid() + ':' + b.key;
      if (!d || d.kind !== 'dir') throw { message: 'jeu_inconnu' }; if ([5, 10, 25, 50, 100].indexOf(+b.stake) < 0) throw { message: 'montant_invalide' }; if (!b.key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { rep = clone(db.ops[cle]); rep.rejoue = true; return rep; }
      if (e.rg && e.rg.pause > t) throw { message: 'pause' }; if (s && s.state === 'running') throw { message: 'serie_en_cours' }; if (me.balance < +b.stake) throw { message: 'solde_insuffisant' };
      me.balance = Math.round((me.balance - b.stake) * 100) / 100; me.played++;
      e.serie = { id: db.seq++, gid: d.id, stake: +b.stake, stack: +b.stake, step: 1, state: 'running', rStart: t, p0: ME.prixAu(d, t), choice: null, mult: null, fee: 0, won: 0, hist: [], at: t, endAt: null };
      rep = reponse(ev); rep.serie = serieJson(e); db.ops[cle] = clone(rep); return rep; }
    if (b.action === 'serie_play') { enCours(); d = ME.JEUX[b.gid]; if (!d || s.gid !== b.gid) throw { message: 'serie_absente' };
      if (['oui', 'non', 'be'].indexOf(b.choice) < 0) throw { message: 'cote_invalide' }; if (s.choice) throw { message: 'deja_choisi' }; if (t >= s.rStart + 31500) throw { message: 'choix_fermes' };
      s.choice = b.choice; s.mult = ME.serieCotes(d, t)[b.choice]; s.fee = Math.round(s.stack * ME.taux(d.cat, rangDe(me).t >= 5) * .5 * 100) / 100;
      if (s.step === 1) { var av = rangDe(me); me.xp += 10; ev.push({ k: 'xp', n: 10, src: 'serie' }); rangMonte(me, av, ev); }
      rep = reponse(ev); rep.serie = serieJson(e); return rep; }
    if (b.action === 'serie_cash') { enCours(); if (s.choice) throw { message: 'deja_choisi' }; if (t >= s.rStart + 60000) throw { message: 'choix_fermes' };
      x = { r: s.won ? 'encaissee' : 'rendue', step: s.step }; serieFin(e, s, s.won ? 'encaissee' : 'rendue', ev, hist);
      x.stack = s.stack; x.stake = s.stake; x.gid = s.gid; x.won = s.won; rep = reponse(ev); rep.serie = serieJson(e); rep.hist = hist; rep.regle = x; return rep; }
    if (b.action === 'serie_settle') {
      for (var i = 0; i < 14 && s && s.state === 'running' && t >= s.rStart + 60000; i++) { d = ME.JEUX[s.gid]; var iss = ME.serieIssue(d, s.rStart), pas = s.step, r;
        if (!s.choice) { r = s.won ? 'auto' : 'rendue'; serieFin(e, s, r, ev, hist); }
        else if (s.choice === iss.out) { s.hist.push({ step: s.step, choice: s.choice, out: iss.out, mult: s.mult, p0: s.p0, p1: iss.p1, win: true }); s.won++;
          var st = Math.round((s.stack - s.fee) * s.mult * 100) / 100;
          if (s.step >= 12) { s.stack = st; r = 'max'; serieFin(e, s, r, ev, hist); } else { s.stack = st; s.step++; s.rStart += 60000; s.p0 = iss.p1; s.choice = null; s.mult = null; s.fee = 0; r = 'gagnee'; } }
        else { s.hist.push({ step: s.step, choice: s.choice, out: iss.out, mult: s.mult, p0: s.p0, p1: iss.p1, win: false }); s.state = 'lost'; s.stack = 0; s.endAt = t; me.settled++; me.realized = Math.round(((me.realized || 0) - s.stake) * 100) / 100;
          var hp = { k: 'flash', q: 'serie|' + s.gid + '|' + s.won + '|' + s.step + '|0', s: 'non', win: false, pnl: -s.stake, at: t }; e.history.unshift(clone(hp)); hist.push(hp); r = 'perdue'; }
        regles.push({ r: r, step: pas, out: iss.out, p1: iss.p1, stack: s.stack, stake: s.stake, gid: s.gid, won: s.won }); }
      rep = reponse(ev); rep.serie = serieJson(e); rep.hist = hist; rep.regles = regles; return rep; }
    return null; }
  /* Blitz Royale : un seul vrai joueur (le compte du test) ; mêmes règles que supabase/migrations/…_blitz.sql */
  function blitzAction(b) { var ME = MoteurEclair, B = ME.BZ, e = etat(), me = e.me, t = Date.now(), k = ME.bzId(t), id = +b.id, ev = [], rep, r2 = function (x) { return Math.round(x * 100) / 100; };
    var J = e.blitzJ = e.blitzJ || {}, j = J[id]; db.blitzClos = db.blitzClos || {};
    var issues = function (n) { var L = []; for (var i = 1; i <= n; i++) L.push(ME.bzIssue(id, i).out); return L; };
    var finies = function () { var n = 0; for (var i = 1; i <= B.ROUNDS; i++) if (t >= ME.bzManche(id, i).fin) n = i; return n; };
    var chute = function (jj, iss, n) { for (var i = 1; i <= n; i++) { var c = jj.choix[i]; if (c === undefined || c !== iss[i - 1]) { if (i === 1 && jj.rachat) continue; return i; } } return 0; };
    var vue = function (iss) { var jj = J[id]; return { id: id, n: jj ? 1 : 0, pot: jj ? jj.paye : 0, vivants: iss.map(function (_, i) { return jj && chute(jj, iss, i + 1) === 0 ? 1 : 0; }),
      moi: jj ? { paye: jj.paye, rachat: jj.rachat, choix: clone(jj.choix), regle: jj.regle, gagne: jj.gagne, gain: jj.gain, sortie: chute(jj, iss, iss.length) || null } : null, clos: db.blitzClos[id] || null }; };
    if (!(id >= k - 200 && id <= k + 1)) throw { message: 'blitz_inconnu' };
    if (b.action === 'blitz_state') return { blitz: vue(issues(finies())) };
    if (b.action === 'blitz_join') { var cle = uid() + ':' + b.key, bb = ME.bzBots(id); if (!b.key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { rep = clone(db.ops[cle]); rep.rejoue = true; return rep; }
      if (e.rg && e.rg.pause > t) throw { message: 'pause' }; if (t >= ME.bzDebut(id)) throw { message: 'inscriptions_closes' }; if (j) throw { message: 'deja_inscrit' }; if (me.balance < bb.buyin) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - bb.buyin); me.played++; J[id] = { paye: bb.buyin, rachat: false, choix: {}, regle: false, gagne: null, gain: 0 };
      var av = rangDe(me); me.xp += 10; ev.push({ k: 'xp', n: 10, src: 'blitz' }); rangMonte(me, av, ev);
      rep = reponse(ev); rep.blitz = vue([]); db.ops[cle] = clone(rep); return rep; }
    if (b.action === 'blitz_choose') { var c = { oui: 1, non: 0, be: 2 }[b.choice], m = 0; if (c === undefined) throw { message: 'cote_invalide' };
      for (var i = 1; i <= B.ROUNDS; i++) { var mm = ME.bzManche(id, i); if (t >= mm.debut && t < mm.debut + B.CHOICE_MS) m = i; }
      if (!m) throw { message: 'choix_fermes' }; if (!j) throw { message: 'pas_inscrit' }; if (chute(j, issues(m - 1), m - 1)) throw { message: 'elimine' };
      j.choix[m] = c; rep = reponse(ev); rep.blitz = vue(issues(m - 1)); return rep; }
    if (b.action === 'blitz_rebuy') { if (!j) throw { message: 'pas_inscrit' }; if (j.rachat) throw { message: 'rachat_fait' }; var i1 = ME.bzIssue(id, 1).out;
      if (chute({ choix: j.choix, rachat: false }, [i1], 1) !== 1 || t < ME.bzManche(id, 1).fin || t >= ME.bzManche(id, 2).debut) throw { message: 'rachat_indisponible' };
      if (me.balance < B.REBUY) throw { message: 'solde_insuffisant' }; me.balance = r2(me.balance - B.REBUY); j.rachat = true; j.paye += B.REBUY;
      rep = reponse(ev); rep.blitz = vue([i1]); return rep; }
    if (b.action === 'blitz_settle') { var bots = ME.bzBots(id), iss = issues(B.ROUNDS), L = B.ROUNDS, hist = [];
      if (!db.blitzClos[id]) {
        for (var r = 1; r <= B.ROUNDS; r++) { var bv = bots.manches[r - 1] ? bots.manches[r - 1].vivants : 0, rv = j && chute(j, iss, r) === 0 ? 1 : 0; if (bv + rv === 0) { L = r; break; } }
        if (t < ME.bzManche(id, L).fin) throw { message: 'blitz_en_cours' };
        var surv = (bots.manches[L - 1] ? bots.manches[L - 1].vivants : 0) + (j && chute(j, iss, L) === 0 ? 1 : 0), pot = ME.bzReport(id) + bots.n * bots.buyin + (j ? j.paye : 0), chacun = surv ? Math.floor(pot * .95 / surv * 100) / 100 : 0;
        db.blitzClos[id] = { joueurs: bots.n + (j ? 1 : 0), survivants: surv, cagnotte: pot, chacun: chacun, manches: L };
        if (j && !j.regle) { var avant = rangDe(me), ch = chute(j, iss, L), h; j.regle = true; me.settled++;
          if (!ch) { j.gagne = true; j.gain = chacun; me.balance = r2(me.balance + chacun); me.wins++; me.realized = r2((me.realized || 0) + chacun - j.paye); me.xp += 80; ev.push({ k: 'xp', n: 80, src: 'blitz' });
            h = { k: 'flash', q: 'blitz|g|' + (bots.n + 1), s: 'oui', win: true, pnl: r2(chacun - j.paye), at: t }; }
          else { j.gagne = false; me.realized = r2((me.realized || 0) - j.paye); h = { k: 'flash', q: 'blitz|p|' + (bots.n + 1), s: 'non', win: false, pnl: -j.paye, at: t }; }
          e.history.unshift(clone(h)); hist.push(h); rangMonte(me, avant, ev); } }
      rep = reponse(ev); rep.blitz = vue(iss); rep.hist = hist; return rep; }
    return null; }
  var duelsJson = function (e) { var L = e.duelsL || [], users = {}; L.forEach(function (d) { var o = d.by === uid() ? d.opp : d.by; if (o) users[o] = ficheDe(o); }); return { liste: clone(L), users: users }; };
  function eclairMiser(b) { var ME = MoteurEclair, e = etat(), me = e.me, t = Date.now(), d = ME.JEUX[b.gid], amt = Math.round(Number(b.amt) * 100) / 100, cle = uid() + ':' + b.key;
    if (!d) throw { message: 'jeu_inconnu' }; if (['oui', 'non', 'be'].indexOf(b.side) < 0) throw { message: 'cote_invalide' };
    if (!(amt >= 1) || !(amt <= 10000)) throw { message: 'montant_invalide' }; if (!b.key) throw { message: 'cle_absente' };
    if (!ME.ouvert(t)) throw { message: 'mises_fermees' };
    if (db.ops[cle]) { var deja = clone(db.ops[cle]); deja.rejoue = true; return deja; }
    if (e.rg && e.rg.pause > t) throw { message: 'pause' };
    var r = ME.round(t), tk = ME.tick(t), g = ME.etat(d, r, tk), px = ME.prix(d, g), L = e.eclairMises = e.eclairMises || [];
    if (L.some(function (m) { return m.r === r && m.g === d.id; })) throw { message: 'deja_mise' };
    if (me.balance < amt) throw { message: 'solde_insuffisant' };
    if (b.side === 'be' && amt > ME.beMax(g, d)) throw { message: 'be_plein' };
    var fee = ME.frais(d, g, b.side, amt, rangDe(me).t >= 5), avant = rangDe(me), ev = [];
    var m = { id: db.seq++, r: r, g: d.id, s: b.side, amt: amt, fee: fee, net: amt - fee, price: b.side === 'oui' ? px.o : b.side === 'non' ? px.n : px.e, mult: b.side === 'be' ? ME.beMult(d) : 0, tk: tk, etat: 'ouverte' };
    L.push(m); me.balance = r2(me.balance - amt); me.played = (me.played | 0) + 1;
    me.xp += 10; ev.push({ k: 'xp', n: 10, src: 'eclair' }); rangMonte(me, avant, ev); missionAvance(e, 'flashbet', ev); badges(e, ev);
    var rep = reponse(ev); rep.mise = clone(m); delete rep.mise.etat; db.ops[cle] = clone(rep); return rep; }
  /* Duels sur une manche éclair : mêmes règles que supabase/migrations/…_duels_eclair.sql (prix, frais et issue : moteur partagé) */
  function duelEclairAction(b) { var ME = MoteurEclair, e = etat(), me = e.me, t = Date.now() + (CFG.decalage || 0), L = e.duelsL = e.duelsL || [], ev = [], rep;
    var cote = function (d) { var g = ME.etat(d, ME.round(t), ME.tick(t)); return { g: g, px: ME.prix(d, g) }; }, flash = function (z) { return String(z.m).indexOf('flash:') === 0; };
    if (b.action === 'duel_create') { var d = ME.JEUX[b.gid], cle = uid() + ':' + b.key, mise = r2(Number(b.stake));
      if (!d) throw { message: 'jeu_inconnu' }; if (['oui', 'non'].indexOf(b.side) < 0) throw { message: 'cote_invalide' }; if (!(mise >= 5 && mise <= 5000)) throw { message: 'montant_invalide' }; if (!b.key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { rep = clone(db.ops[cle]); rep.rejoue = true; return rep; }
      if (e.rg && e.rg.pause > Date.now()) throw { message: 'pause' }; if (b.opp && e.friends.indexOf(b.opp) < 0) throw { message: 'pas_amis' };
      var q = cote(d), prix = b.side === 'oui' ? q.px.o : q.px.n, fee = r2(ME.frais(d, q.g, b.side, mise, rangDe(me).t >= 5)); if (me.balance < mise + fee) throw { message: 'solde_insuffisant' };
      var manche = ME.round(t) + (t - ME.t0(ME.round(t)) >= 20000 ? 1 : 0), ferme = ME.t0(manche) + ME.FOPEN - (CFG.decalage || 0);       /* la suivante s'il reste moins de dix secondes de mises */
      me.balance = r2(me.balance - mise - fee); me.played++;
      var x = { id: db.seq++, code: 'D' + ('000000' + db.seq.toString(16).toUpperCase()).slice(-7), m: 'flash:' + d.id, round: manche, side: b.side, by: uid(), opp: b.opp || null, stake: mise, fee: fee, st: 'open', at: Date.now(),
        expiresAt: Math.min(Date.now() + 120000, ferme), price0: prix, price: null, oppStake: null, oppFee: null, pot: null, winSide: null, acceptAt: null, settleAt: null };
      if (b.opp && (db.fiches[b.opp] || {}).bot) { x.st = 'active'; x.price = prix; x.pot = r2(mise * 100 / prix); x.oppStake = r2(x.pot * (100 - prix) / 100); x.oppFee = 0; x.acceptAt = Date.now(); }
      L.unshift(x); rep = reponse([]); rep.duel = clone(x); rep.duels = duelsJson(e); db.ops[cle] = clone(rep); return rep; }
    if (b.action === 'duel_accept') { var code = String(b.code || '').toUpperCase(), y = L.filter(function (z) { return (b.id && z.id === +b.id) || (code && z.code === code); })[0];
      if (!y && code && (CFG.liens || {})[code]) { y = clone(CFG.liens[code]); L.unshift(y); }
      if (!y || y.st !== 'open' || !flash(y) || y.by === uid() || (y.opp && y.opp !== uid())) throw { message: 'duel_indisponible' };
      if (t - ME.t0(y.round) >= ME.FOPEN) throw { message: 'mises_fermees' };
      var dj = ME.JEUX[y.m.slice(6)], qa = cote(dj), pa = y.side === 'oui' ? qa.px.o : qa.px.n, pot = r2(y.stake * 100 / pa), autre = r2(pot * (100 - pa) / 100), fa = r2(ME.frais(dj, qa.g, y.side === 'oui' ? 'non' : 'oui', autre, rangDe(me).t >= 5));
      if (me.balance < autre + fa) throw { message: 'solde_insuffisant' };
      me.balance = r2(me.balance - autre - fa); me.played++; y.opp = uid(); y.st = 'active'; y.price = pa; y.pot = pot; y.oppStake = autre; y.oppFee = fa; y.acceptAt = Date.now();
      rep = reponse([]); rep.duel = clone(y); rep.duels = duelsJson(e); return rep; }
    if (b.action === 'duel_settle') { var n = 0, avant = rangDe(me);
      L.forEach(function (z) { if (!flash(z) || ['open', 'active'].indexOf(z.st) < 0 || t < ME.t0(z.round) + ME.FDUR) return;
        var defieur = z.by === uid(), mien = defieur ? z.side : (z.side === 'oui' ? 'non' : 'oui'), maMise = defieur ? z.stake : z.oppStake, autre = defieur ? z.opp : z.by, out = ME.issue(ME.JEUX[z.m.slice(6)], z.round); n++; z.settleAt = Date.now();
        if (z.st === 'open') { z.st = 'expired'; if (defieur) { me.balance = r2(me.balance + z.stake); ev.push(notif('swords', 'duel_expire', { m: z.m, r: z.round, id: z.id }, '#duels')); } return; }
        if (out === 2) { z.st = 'void'; me.balance = r2(me.balance + maMise); ev.push(notif('swords', 'duel_nul', { m: z.m, r: z.round, id: z.id }, '#duel-' + z.id)); return; }
        z.st = 'regle'; z.winSide = out === 1 ? 'oui' : 'non'; var gagne = z.winSide === mien, pnl = gagne ? r2(z.pot - maMise) : -maMise; me.settled = (me.settled | 0) + 1; me.realized = r2((me.realized || 0) + pnl);
        if (gagne) { me.balance = r2(me.balance + z.pot); me.wins = (me.wins | 0) + 1; me.xp += 20; ev.push({ k: 'xp', n: 20, src: 'duel' }); }
        e.history.unshift({ k: 'res', q: 'duel|' + autre + '|' + z.m + '|' + z.round, s: mien, win: gagne, pnl: pnl, at: Date.now() });
        ev.push(notif('swords', gagne ? 'duel_gagne' : 'duel_perdu', { id: z.id, m: z.m, r: z.round, u: autre, pnl: pnl }, '#duel-' + z.id)); });
      if (n) rangMonte(me, avant, ev); rep = reponse(ev); rep.duels = duelsJson(e); rep.regles = n; return rep; }
    return null; }
  function eclairRegler() { var ME = MoteurEclair, e = etat(), me = e.me, r = ME.round(Date.now()), ev = [], regles = [], hist = [], avant = rangDe(me);
    (e.eclairMises || []).forEach(function (m) { if (m.etat !== 'ouverte' || m.r >= r) return;
      var x = ME.regler(ME.JEUX[m.g], m.r, m), pay = x.win ? r2(x.pay) : 0, pnl = r2(pay - m.amt), at = ME.t0(m.r + 1), tard = m.r < r - 1;
      m.etat = x.win ? 'gagnee' : 'perdue'; me.balance = r2(me.balance + pay); me.settled = (me.settled | 0) + 1; me.flashProfit = r2((me.flashProfit || 0) + pnl); me.realized = r2((me.realized || 0) + pnl);
      if (x.win) { me.wins = (me.wins | 0) + 1; me.flashWins = (me.flashWins | 0) + 1; me.flashStreak = (me.flashStreak | 0) + 1; me.flashBest = Math.max(me.flashBest | 0, me.flashStreak); if (x.part <= 30) me.contraWins = (me.contraWins | 0) + 1; } else me.flashStreak = 0;
      var h = { k: 'flash', q: 'eclair|' + m.g + '|' + m.r, s: m.s, win: x.win, pnl: pnl, at: at }; e.history.unshift(clone(h)); hist.push(h);
      regles.push({ id: m.id, g: m.g, r: m.r, s: m.s, amt: m.amt, win: x.win, pay: pay, pnl: pnl, tard: tard });
      if (x.win) { var n = m.s === 'be' ? 120 : 40; me.xp += n; ev.push({ k: 'xp', n: n, src: 'eclair' }); missionAvance(e, 'flashwin', ev); }
      if (tard) ev.push(notif('bolt', x.win ? 'flash_gagne' : 'flash_perdu', { g: m.g, r: m.r, pay: pay, amt: m.amt }, '#eclair')); });
    if (regles.length) { rangMonte(me, avant, ev); badges(e, ev); }
    var rep = reponse(ev); rep.regles = regles; rep.hist = hist; rep.eclair = eclairJson(e); return rep; }

  /* remise au propre d'un instantané : seuls les champs connus sont repris ; tout ce qui sort du format est refusé */
  var anaPropre = function (s) { var mauvais = function () { throw { message: 'analyse_invalide' }; };
    if (!s || typeof s !== 'object' || Array.isArray(s)) mauvais(); if (JSON.stringify(s).length > 400000) throw { message: 'analyse_trop_lourde' };
    if (typeof MK === 'undefined' || !MK[s.m]) throw { message: 'marche_inconnu' }; var n = s.n;
    if (['1m', '5m', '15m', '1h', '4h', '1d', '1w', 'max'].indexOf(s.iv) < 0 || ['courbe', 'bougies'].indexOf(s.type) < 0 || ['oui', 'non'].indexOf(s.side) < 0 || typeof n !== 'number' || n !== Math.floor(n) || n < 1 || n > 4000) mauvais();
    var nombre = function (v) { if (typeof v !== 'number' || !isFinite(v)) mauvais(); return v; };
    var serie = function (L) { if (!Array.isArray(L) || L.length !== n) mauvais(); return L.map(function (v) { return v === null ? null : Math.round(nombre(v) * 100) / 100; }); };
    var couleur = function (c) { if (typeof c !== 'string' || !/^(ink|#[0-9a-fA-F]{6})$/.test(c)) mauvais(); return c; }, ep = function (w) { if ([1, 2, 3].indexOf(w) < 0) mauvais(); return w; };
    var point = function (p) { if (!Array.isArray(p) || p.length !== 2) mauvais(); return [Math.round(nombre(p[0])), Math.round(nombre(p[1]) * 1e4) / 1e4]; };
    var texte = function (t) { if (t !== undefined && t !== null && typeof t !== 'string') mauvais(); return String(t || '').replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '”').replace(/[`']/g, '’').replace(/\\/g, '/').replace(/\s+/g, ' ').trim().slice(0, 60); };
    if (!Array.isArray(s.inds) || s.inds.length > 24 || !Array.isArray(s.dr) || s.dr.length > 300) mauvais();
    var inds = s.inds.map(function (d, i) { if (!d || ['sma', 'ema', 'bb', 'vwap', 'rsi', 'macd'].indexOf(d.k) < 0 || !d.p || typeof d.p !== 'object') mauvais();
      var cles = d.k === 'bb' || d.k === 'macd' ? ['a', 'b', 'c'] : ['a'], vals = {}, p = {}; if (!d.vals || Object.keys(d.vals).length !== cles.length) mauvais(); cles.forEach(function (c) { vals[c] = serie(d.vals[c]); });
      (d.k === 'bb' ? ['len', 'k'] : d.k === 'macd' ? ['fast', 'slow', 'sig'] : d.k === 'vwap' ? ['anc'] : ['len']).forEach(function (c) { if (d.k === 'vwap') { if (['auto', 'day', 'week', 'all'].indexOf(d.p[c]) < 0) mauvais(); p[c] = d.p[c]; } else p[c] = nombre(d.p[c]); });
      return { id: 'i' + (i + 1), k: d.k, p: p, c: couleur(d.c), w: ep(d.w), vals: vals }; });
    var dr = s.dr.map(function (d, i) { if (!d || ['trend', 'hline', 'vline', 'rect', 'arrow', 'text', 'level'].indexOf(d.k) < 0) mauvais();
      var t = { id: 'd' + (i + 1), k: d.k, a: point(d.a), c: couleur(d.c), w: ep(d.w), txt: texte(d.txt) }; if (['trend', 'arrow', 'rect'].indexOf(d.k) >= 0) t.b = point(d.b); return t; });
    return { v: 1, m: s.m, iv: s.iv, type: s.type, side: s.side, p: Math.round(MK[s.m].p * 100) / 100, ms: nombre(s.ms), T0: nombre(s.T0), n: n, o: serie(s.o), h: serie(s.h), l: serie(s.l), c: serie(s.c), vol: serie(s.vol),
      end: nombre(s.end), vn: nombre(s.vn), inds: inds, dr: dr }; };
  var dmOk = function (u, ecrire) { var e = etat(); if (!u || u === uid() || !db.fiches[u]) throw { message: 'joueur_inconnu' }; if (e.friends.indexOf(u) < 0) throw { message: 'pas_amis' }; if (ecrire && rangDe(e.me).t < 1) throw { message: 'rang_insuffisant' }; };
  /* ----- Chat : salons publics ----- */
  /* un message tel que le serveur l'envoie : sans ses données internes (qui a suivi, qui a réagi) */
  var msgPropre = function (m) { var c = clone(m); delete c.suivis; delete c.qui; if (c.r && !Object.keys(c.r).length) delete c.r; return c; };
  var mesDe = function (L) { var o = {}; L.forEach(function (m) { var q = m.qui && m.qui[uid()]; if (q && q.length) o[m.id] = clone(q); }); return o; };
  /* duels de stack : résultat du joueur (réalisé + positions), stacks lus à l'instant, règlement à l'échéance */
  function resultatDe(e) { var v = e.me.realized || 0; (e.positions || []).forEach(function (p) { var m = marche(p.m); if (m) v += p.sh * ((p.s === 'oui' ? m.p : 100 - m.p) - p.avg) / 100; }); return v; }
  function stackVu(e, x) { var actif = x.st === 'active', t = Math.min(1, (Date.now() - x.at) / (x.endAt - x.at));
    return { id: x.id, opp: x.opp, buyin: x.buyin, st: x.st, at: x.at, endAt: x.endAt, settleAt: x.settleAt, my: actif ? Math.max(0, Math.round(1000 + resultatDe(e) - x.ref)) : x.my, theirs: actif ? Math.round(1000 + (x.fin - 1000) * t) : x.theirs }; }
  function stacksJson(e) { var users = {}, L = (e.stacksL || []).slice(0, 20); L.forEach(function (x) { users[x.opp] = ficheDe(x.opp); }); return { liste: L.map(function (x) { return stackVu(e, x); }), users: users }; }
  function stacksAvancer(e, ev) { var n = 0, me = e.me; (e.stacksL || []).forEach(function (x) { if (x.st !== 'active' || x.endAt > Date.now()) return;
      var moi = Math.max(0, Math.round(1000 + resultatDe(e) - x.ref)), lui = x.fin, pot = Math.round(x.buyin * 2 * .96 * 100) / 100; x.my = moi; x.theirs = lui; x.settleAt = Date.now(); n++;
      if (moi > lui) { x.st = 'won'; me.balance = Math.round((me.balance + pot) * 100) / 100; me.realized = (me.realized || 0) + pot - x.buyin; me.xp += 30; ev.push({ k: 'xp', n: 30, src: 'stack' }); }
      else if (moi === lui) { x.st = 'void'; me.balance = Math.round((me.balance + x.buyin) * 100) / 100; } else { x.st = 'lost'; me.realized = (me.realized || 0) - x.buyin; }
      ev.push(notif('swords', x.st === 'won' ? 'stack_gagne' : x.st === 'lost' ? 'stack_perdu' : 'stack_nul', { id: x.id, u: x.opp, gain: pot - x.buyin, moi: moi, lui: lui }, '#duels')); });
    return n; }
  var salonOk = function (r) { if (r === 'general' || r === 'blitz' || (/^m:/.test(String(r)) && typeof MK !== 'undefined' && MK[String(r).slice(2)])) return;
    var k = etat().clanM; if (k && r === 'clan:' + k.id) return;                                  /* le salon de son clan, et lui seul */
    if (r === 'vip') { if (rangDe(etat().me).t >= 6) return; throw { message: 'rang_insuffisant' }; }   /* le salon VIP : rang Ascendant */
    throw { message: 'salon_indisponible' }; };
  var ficheDe = function (id) { if (db.fiches[id]) return clone(db.fiches[id]); var e = db.etats[id]; if (!e) return { n: 'joueur', t: 0, d: 0, tone: 0, color: '#2448FF', photo: '', bio: '', profit: 0, acc: 0, bets: 0, fol: 0, bot: false, pub: 1 };
    var r = rangDe(e.me); return { n: e.me.n, t: r.t, d: r.d, tone: 1, color: e.me.color, photo: e.me.photo || '', bio: e.me.bio || '', profit: 0, acc: 0, bets: e.me.played | 0, fol: 0, bot: false, pub: 1 }; };
  var rangDe = function (me) { return rankFrom({ xp: me.xp, settled: me.settled, acc: Math.round(me.wins / Math.max(1, me.settled) * 100), deposits: me.deposits, flashWins: me.flashWins, followed: me.followed, pos: me.pos }); };
  var rangMonte = function (me, avant, ev) { var r = rangDe(me); if (r.t * 3 + r.d > avant.t * 3 + avant.d) ev.push(notif('trophy', 'rank_up', { t: r.t, d: r.d }, '#rang')); };
  var missionAvance = function (e, type, ev) { e.missions.forEach(function (x) { if (x.type !== type || x.claimed || x.have >= x.goal) return; x.have = Math.min(x.goal, x.have + 1); ev.push({ k: 'mission', id: x.id, have: x.have, goal: x.goal, xp: x.xp }); if (x.have >= x.goal) ev.push(notif('gift', 'mission_done', { id: x.id, xp: x.xp }, '#rang')); }); };
  var badges = function (e, ev) { [['first', e.me.played >= 1], ['whale', e.me.maxBet >= 500], ['dep', e.me.deposits >= 1]].forEach(function (b) { if (!b[1] || e.badges.indexOf(b[0]) >= 0) return; e.badges.push(b[0]); ev.push({ k: 'badge', id: b[0] }); ev.push(notif('star', 'badge', { id: b[0] }, '#profil')); }); };
  function rpc(name, args) {
    rec('rpc', name, args || {});
    var force = (CFG.rpc || {})[name];
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (CFG.horsLigne) { resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } }); return; }
        if (force !== undefined) { resolve(force && force.error ? { data: null, error: force.error } : { data: clone(force), error: null }); return; }
        if (!RPC[name]) { resolve({ data: null, error: { message: 'Could not find the function public.' + name, code: 'PGRST202' } }); return; }
        if (!uid() && !SANS_SESSION[name]) { resolve({ data: null, error: { message: 'permission denied for function ' + name, code: '42501' } }); return; }
        if (uid() && !SANS_SESSION[name] && name !== 'api_present') { var x = (db.etats[uid()] && db.etats[uid()].rg || {}).excl; if (x === -1 || x > Date.now()) { resolve({ data: null, error: { message: 'exclu', code: 'P0001', details: String(x) } }); return; } }
        var refus = gardeJoueur(name, args || {}); if (refus) { resolve({ data: null, error: refus }); return; }       /* Partie E : blocages, maintenance, règles du chat */
        try { var d = RPC[name](args || {}); if (name === 'api_chat_send') { db.dernierMsg = db.dernierMsg || {}; db.dernierMsg[(args || {}).p_room] = Date.now(); } persist(); resolve({ data: d === undefined ? null : d, error: null }); }
        catch (e) { resolve({ data: null, error: { message: e.message || String(e), code: 'P0001', details: e.details } }); }
      }, CFG.latence || 3);
    });
  }

  /* ----- Service de connexion par pseudo (Edge Function « connexion ») ----- */
  var functions = { invoke: function (name, opt) {
    var b = (opt && opt.body) || {}; rec('fn', name, { pseudo: b.pseudo });
    var ko = function (code) { return Promise.resolve({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: function () { return Promise.resolve({ ok: false, code: code }); } } } }); };
    if (name === 'eclair') {
      calls[calls.length - 1].args = { action: b.action, gid: b.gid, side: b.side, amt: b.amt, stake: b.stake, choice: b.choice, id: b.id, opp: b.opp, code: b.code, reel: b.reel };   /* reel : partie D, mise du nouveau front à cours réels */
      if (CFG.horsLigne) return Promise.reject(new TypeError('Failed to fetch'));
      var forcee = (CFG.fn || {}).eclair; if (forcee) return ko(forcee);
      if (!uid()) return ko('session');
      try { var rep = b.action === 'bet' ? eclairMiser(b) : b.action === 'settle' ? eclairRegler() : /^serie_/.test(b.action || '') ? serieAction(b) : /^blitz_/.test(b.action || '') ? blitzAction(b) : /^duel_/.test(b.action || '') ? duelEclairAction(b) : null; if (!rep) return ko('requete'); persist(); rep.ok = true; rep.now = Date.now() + (CFG.decalage || 0);
        return new Promise(function (ok) { setTimeout(function () { ok({ data: clone(rep), error: null }); }, CFG.latence || 3); }); }
      catch (e) { return ko(e.message || 'serveur'); }
    }
    if (name !== 'connexion') return ko('serveur');
    for (var em in db.comptes) { var c = db.comptes[em]; if (String(c.pseudo || '').toLowerCase() === String(b.pseudo || '').toLowerCase()) return c.password === b.mot_de_passe ? Promise.resolve({ data: { ok: true, access_token: 'jeton:' + c.id + ':' + em, refresh_token: 'r' }, error: null }) : ko('identifiants'); }
    return ko('identifiants');
  } };

  /* ----- Authentification ----- */
  var ouvrir = function (id, em, pseudo) { db.session = { user: { id: id, email: em } }; db.decoAt = null; db.aal = 'aal1';   /* une session ouverte après une déconnexion forcée est acceptée */ if (!db.etats[id]) db.etats[id] = etatNeuf(id, em, pseudo || em.split('@')[0], false); persist(); fireAuth('SIGNED_IN'); };
  var auth = {
    getSession: function () { rec('auth', 'getSession'); return Promise.resolve({ data: { session: clone(db.session) }, error: null }); },
    onAuthStateChange: function (cb) { authCbs.push(cb); return { data: { subscription: { unsubscribe: function () { authCbs = authCbs.filter(function (x) { return x !== cb; }); } } } }; },
    signInWithPassword: function (c) { rec('auth', 'signInWithPassword', { email: c.email });
      var a = db.comptes[String(c.email).toLowerCase()];
      if (!a || a.password !== c.password) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } });
      ouvrir(a.id, String(c.email).toLowerCase(), a.pseudo);
      return Promise.resolve({ data: { user: clone(db.session.user), session: clone(db.session) }, error: null }); },
    setSession: function (t) { rec('auth', 'setSession'); var m = /^jeton:([^:]+):(.+)$/.exec(t.access_token || ''); if (!m) return Promise.resolve({ data: {}, error: { message: 'invalid token' } }); var a = db.comptes[m[2]] || {}; ouvrir(m[1], m[2], a.pseudo); return Promise.resolve({ data: { session: clone(db.session) }, error: null }); },
    signUp: function (c) { rec('auth', 'signUp', { email: c.email, options: c.options || null });
      var em = String(c.email).toLowerCase();
      if (db.comptes[em]) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'User already registered', code: 'user_already_exists' } });
      var id = '00000000-0000-4000-8000-' + String(100000 + db.seq++).padStart(12, '0'), meta = (c.options && c.options.data) || {};
      var pseudo = /^[A-Za-z0-9._]{3,20}$/.test(meta.username || '') && !pseudoPris(meta.username) ? meta.username : 'joueur' + id.slice(-6);
      db.comptes[em] = { id: id, password: c.password, pseudo: pseudo };
      db.etats[id] = etatNeuf(id, em, pseudo, true);
      var code = String(meta.ref || '').trim().toUpperCase();                                  /* parrainage : mêmes règles que …_parrainage.sql */
      if (/^[A-Z0-9]{2,10}-[A-Z0-9]{3}$/.test(code) && (CFG.codes || []).indexOf(code) >= 0) { var en = db.etats[id]; en.me.balance += 10; en.ref = { code: 'NOUVEAU-A1B', bonus: 10, by: code, list: [] };
        en.deps.unshift({ id: 'dep-ref', coin: 'USDC', net: 'Wimoro', amt: 10, usd: 10, conf: 12, need: 12, label: 'parrainage', st: 'completed', fee: 0, at: Date.now() });
        en.notifs.unshift({ id: 'n-ref', ic: 'gift', code: 'parrain_bonus', p: { gain: 10, code: code }, href: '#parrainage', at: Date.now(), read: false }); }
      if (CFG.autoconfirm === false) { persist(); return Promise.resolve({ data: { user: { id: id, email: em, identities: [{}] }, session: null }, error: null }); }
      db.session = { user: { id: id, email: em } }; persist(); fireAuth('SIGNED_IN');
      return Promise.resolve({ data: { user: clone(db.session.user), session: clone(db.session) }, error: null }); },
    resend: function (p) { rec('auth', 'resend', { email: p.email, type: p.type }); return Promise.resolve({ data: {}, error: null }); },
    signOut: function () { rec('auth', 'signOut'); db.session = null; persist(); fireAuth('SIGNED_OUT'); return Promise.resolve({ error: null }); },
    resetPasswordForEmail: function (email, opt) { rec('auth', 'resetPasswordForEmail', { email: email, options: opt || null }); return Promise.resolve({ data: {}, error: null }); },
    verifyOtp: function (p) { rec('auth', 'verifyOtp', { email: p.email, type: p.type });
      var a = db.comptes[String(p.email).toLowerCase()];
      if (!a || p.token !== (CFG.otp || '123456')) return Promise.resolve({ data: {}, error: { message: 'Token has expired or is invalid', code: 'otp_expired' } });
      ouvrir(a.id, String(p.email).toLowerCase(), a.pseudo); return Promise.resolve({ data: { session: clone(db.session) }, error: null }); },
    /* double authentification (facteur TOTP de Supabase Auth) : le code accepté est CFG.totp (123456 par défaut) */
    mfa: {
      listFactors: function () { rec('auth', 'mfa.listFactors'); if (!db.session) return Promise.resolve({ data: null, error: { message: 'not authenticated' } }); if (CFG.equipe) EQ();
        var f = clone(db.mfa || []); return Promise.resolve({ data: { all: f, totp: f.filter(function (x) { return x.status === 'verified'; }), phone: [], webauthn: [] }, error: null }); },
      getAuthenticatorAssuranceLevel: function () { rec('auth', 'mfa.aal'); if (CFG.equipe) EQ();
        return Promise.resolve({ data: { currentLevel: db.aal || 'aal1', nextLevel: verifies() ? 'aal2' : (db.aal || 'aal1'), currentAuthenticationMethods: [] }, error: null }); },
      enroll: function (o) { rec('auth', 'mfa.enroll', { factorType: o && o.factorType, friendlyName: o && o.friendlyName }); db.mfa = db.mfa || [];
        if ((db.mfa || []).some(function (x) { return x.friendly_name === o.friendlyName; })) return Promise.resolve({ data: null, error: { message: 'A factor with the friendly name already exists', code: 'mfa_factor_name_conflict' } });
        var id = 'f' + (db.seq++); db.mfa.push({ id: id, factor_type: 'totp', status: 'unverified', friendly_name: o.friendlyName }); persist();
        return Promise.resolve({ data: { id: id, type: 'totp', friendly_name: o.friendlyName, totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21"><rect width="7" height="7"/><rect x="14" width="7" height="7"/><rect y="14" width="7" height="7"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Wimoro?secret=JBSWY3DPEHPK3PXP' } }, error: null }); },
      challenge: function (o) { rec('auth', 'mfa.challenge', { factorId: o.factorId }); return Promise.resolve({ data: { id: 'c' + (db.seq++), type: 'totp', expires_at: Math.round(Date.now() / 1000) + 300 }, error: null }); },
      verify: function (o) { rec('auth', 'mfa.verify', { factorId: o.factorId, code: o.code });
        if (String(o.code) !== String(CFG.totp || '123456')) return Promise.resolve({ data: null, error: { message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' } });
        var f = (db.mfa || []).filter(function (x) { return x.id === o.factorId; })[0]; if (!f) return Promise.resolve({ data: null, error: { message: 'Factor not found', code: 'mfa_factor_not_found' } });
        f.status = 'verified'; db.aal = 'aal2'; persist(); fireAuth('MFA_CHALLENGE_VERIFIED'); return Promise.resolve({ data: { access_token: 'aal2', expires_in: 3600 }, error: null }); },
      unenroll: function (o) { rec('auth', 'mfa.unenroll', { factorId: o.factorId }); db.mfa = (db.mfa || []).filter(function (x) { return x.id !== o.factorId; }); persist(); return Promise.resolve({ data: { id: o.factorId }, error: null }); }
    },
    updateUser: function (p) { rec('auth', 'updateUser', Object.keys(p || {}));
      if (!db.session) return Promise.resolve({ data: {}, error: { message: 'not authenticated' } });
      if (p.password) { var c = db.comptes[db.session.user.email]; if (c) c.password = p.password; persist(); }
      return Promise.resolve({ data: { user: clone(db.session.user) }, error: null }); }
  };

  /* ----- Temps réel : diffusion par sujet ----- */
  function channel(sujet, opt) {
    var ch = { sujet: sujet, prive: !!(opt && opt.config && opt.config.private), handlers: [],
      on: function (type, filtre, cb) { ch.handlers.push({ type: type, filtre: filtre, cb: cb }); rec('channel', sujet, { type: type, filtre: filtre }); return ch; },
      subscribe: function (cb) { if (cb) setTimeout(function () { cb('SUBSCRIBED'); }, 0); return ch; },
      unsubscribe: function () { return Promise.resolve('ok'); }, send: function () { return Promise.resolve('ok'); } };
    canaux.push(ch); return ch;
  }
  var client = { rpc: rpc, auth: auth, functions: functions, channel: channel,
    removeChannel: function (c) { canaux = canaux.filter(function (x) { return x !== c; }); return Promise.resolve('ok'); },
    from: function (t) { rec('from', t); throw new Error('faux serveur : accès direct à la table « ' + t + ' » (le front ne doit passer que par les fonctions api_*)'); } };

  window.__fakeSB = {
    calls: calls, db: db, persist: persist,
    /** tous les appels depuis le début du test, rechargements compris */
    journal: function () { return db.journal || []; },
    count: function (kind, name) { return calls.filter(function (c) { return c.kind === kind && (!name || c.name === name); }).length; },
    sujets: function () { return canaux.map(function (c) { return c.sujet; }); },
    /** sujets suivis en mode privé (réservés au joueur) */
    prives: function () { return canaux.filter(function (c) { return c.prive; }).map(function (c) { return c.sujet; }); },
    /** Simule un message diffusé par le serveur sur un sujet. */
    emit: function (sujet, evenement, donnees) { var n = 0; canaux.forEach(function (ch) { if (ch.sujet !== sujet) return; ch.handlers.forEach(function (h) { if (h.type === 'broadcast') { n++; h.cb({ event: evenement, payload: clone(donnees) }); } }); }); return n; },
    etat: function () { return db.etats[uid()]; },
    /** marché du faux serveur (modifiable par un test pour simuler l'activité d'autres joueurs) */
    marche: function (id) { var m = marche(id); persist(); return m; },
    /** le joueur copié parie / vend, côté serveur (voir copieSuivre, copieSortir) */
    copieSuivre: function (u, mid, s, mise) { return copieSuivre(u, mid, s, mise); },
    copieSortir: function (u, mid, s) { return copieSortir(u, mid, s); },
    /** un bot réagit à un message (tâche des bots du serveur) : compteur diffusé au salon ; si le message est celui du joueur et que annonce est vrai, 1 XP et une bulle */
    reactionBot: function (idMsg, emoji, nom, annonce) { var e = etat(), m = null, salon = null; for (var r in db.chat) db.chat[r].forEach(function (x) { if (String(x.id) === String(idMsg)) { m = x; salon = r; } }); if (!m) return null;
      m.r = m.r || {}; m.r[emoji] = (m.r[emoji] | 0) + 1; if (annonce && m.u === uid()) e.me.xp += 1; persist();
      window.__fakeSB.emit('salon:' + salon, 're', { id: m.id, r: clone(m.r) });
      if (annonce && m.u === uid()) window.__fakeSB.emit('joueur:' + uid(), 'reac', { u: 'bot-reaction', n: nom || 'karim', e: emoji, id: m.id, room: salon }); return clone(m.r); },
    /** un bot suit la mise partagée du joueur (tâche wm-suivis du serveur) : compteur, 20 XP, notification en direct */
    suiviBot: function (idMsg, nom) { var e = etat(), m = null, salon = null; for (var r in db.chat) db.chat[r].forEach(function (x) { if (x.id === +idMsg && x.k === 'bet') { m = x; salon = r; } }); if (!m) return 0;
      m.fc = (m.fc | 0) + 1; e.me.xp += 20; e.me.followed = (e.me.followed | 0) + 1;
      var n = notif('users', 'mise_suivie', { u: 'bot-suiveur', n: nom || 'karim', m: m.bet.m, id: m.id, room: salon }, salon.indexOf('m:') === 0 ? '#marche-' + salon.slice(2) : '#chat').n; persist();
      window.__fakeSB.emit('salon:' + salon, 'fc', { id: m.id, fc: m.fc }); window.__fakeSB.emit('joueur:' + uid(), 'notif', { n: n }); return m.fc; },
    /** Partie E — l'équipe bloque un accès du joueur connecté (diffusé sur son sujet privé si `diffuser`) */
    bloquer: function (acces, salon, fin, diffuser) { blocsJoueur(); var b = { id: 500 + (db.seq++), acces: acces, salon: salon || null, fin: fin == null ? -1 : +fin }; db.blocsJoueur.push(b); persist();
      if (diffuser !== false) window.__fakeSB.emit('joueur:' + uid(), 'bloc', clone(b)); return b.id; },
    debloquer: function (id) { var b = (db.blocsJoueur || []).filter(function (x) { return x.id === id; })[0]; if (!b) return 0; db.blocsJoueur = db.blocsJoueur.filter(function (x) { return x.id !== id; }); persist();
      return window.__fakeSB.emit('joueur:' + uid(), 'debloc', { id: b.id, acces: b.acces, salon: b.salon }); },
    /** un réglage public change (comme reglage_modifier) : api_site le rend, et « cfg » part sur le sujet « site » */
    reglage: function (cle, v) { var S = siteEtat(); S.v[cle] = clone(v); S.rev++; persist(); return window.__fakeSB.emit('site', 'cfg', { cle: cle, v: clone(v), rev: S.rev }); },
    annonce: function (a) { var S = siteEtat(); S.rev++; S.annonce = a ? Object.assign({ id: S.rev, ton: 'info', fin: null, at: Date.now() }, clone(a)) : null; persist(); return window.__fakeSB.emit('site', 'annonce', { annonce: clone(S.annonce), rev: S.rev }); },
    maintenance: function (actif, message) { var S = siteEtat(); S.rev++; S.maintenance = { actif: !!actif, message: message || null }; persist(); return window.__fakeSB.emit('site', 'maint', { actif: !!actif, message: message || null, rev: S.rev }); },
    /** déconnexion forcée : les appels suivants sont refusés (« session ») et « deco » part sur le sujet privé du joueur */
    deconnecter: function () { db.decoAt = Date.now(); persist(); return window.__fakeSB.emit('joueur:' + uid(), 'deco', { at: db.decoAt }); },
    equipe: function () { return EQ(); },
    /** diffuse l'état actuel de marchés, comme un tick du serveur */
    tick: function (ids, extra) { var d = { t: Date.now(), m: marchesDe(ids || Object.keys(db.marches)) }; for (var k in extra || {}) d[k] = extra[k]; return window.__fakeSB.emit('marches', 'tick', d); }
  };
  window.supabase = { createClient: function (url, cle, opts) { rec('createClient', url, { cle: String(cle).slice(0, 15), storageKey: opts && opts.auth && opts.auth.storageKey }); if (opts && opts.auth && opts.auth.storageKey) CLE = opts.auth.storageKey; ranger(); return client; } };
})();
