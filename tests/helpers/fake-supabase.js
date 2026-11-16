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
    db = { session: clone(CFG.session || null), comptes: clone(CFG.comptes || {}), etats: {}, marches: {}, ops: {}, chat: clone(CFG.chat || {}), fiches: clone(CFG.fiches || {}), seq: 1 };
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
    api_state: function () { var e0 = etat(); regler(e0, []); rgMaj(e0, []); var e = clone(e0); e.deps = e0.deps.map(depJson); e.eclair = eclairJson(e0); delete e.eclairMises; e.serie = serieJson(e0); e.duels = duelsJson(e0); delete e.duelsL; e.combos = clone(e0.combosL || []); delete e.combosL; clanAvancer(e0, []); e.clan = clanEtat(e0); delete e.clanM; delete e.clanApps; delete e.clanParti; e.copies = copiesEtat(e0); delete e.copiesL; propsAvancer([]); e.props = propsEtat(); if (!e.ref) e.ref = { code: 'TESTEUR-7K3', bonus: 10, by: null, list: [] }; e.blitz = Object.keys(e0.blitzJ || {}).filter(function (i) { return !e0.blitzJ[i].regle; }).map(Number); delete e.blitzJ; e.now = Date.now() + (CFG.decalage || 0); return e; },
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
      setTimeout(function () { window.__fakeSB.emit('salon:' + a.p_room, 'msg', diffuse); }, 5);
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
      e.clanM = null; e.clanParti = Date.now(); var rep = reponse([]); rep.clan = clanEtat(e); return rep; },
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
    api_chat_share: function (a) { salonOk(a.p_room); var e = etat(), me = e.me, ev = [];
      if (a.p_side !== 'oui' && a.p_side !== 'non') throw { message: 'cote_invalide' }; if (rangDe(me).t < 1) throw { message: 'rang_insuffisant' };
      var pos = e.positions.filter(function (p) { return p.m === a.p_market && p.s === a.p_side && p.sh > 0.05; })[0]; if (!pos) throw { message: 'position_absente' };
      var deja = false; for (var r in db.chat) db.chat[r].forEach(function (x) { if (x.u === uid() && x.k === 'bet' && x.bet.m === a.p_market && x.bet.s === a.p_side && x.at > Date.now() - 864e5) deja = true; });
      if (deja) throw { message: 'deja_partage' };
      var m = { id: db.seq++, u: uid(), k: 'bet', text: '', at: Date.now(), bet: { m: a.p_market, s: a.p_side, amt: Math.round(pos.sh * pos.avg / 100), price: Math.round(pos.avg) }, fc: 0, suivis: {} };
      (db.chat[a.p_room] = db.chat[a.p_room] || []).push(m); var avant = rangDe(me); me.xp += 5; ev.push({ k: 'xp', n: 5, src: 'partage' }); rangMonte(me, avant, ev);
      var rep = reponse(ev); rep.msg = clone(m); delete rep.msg.suivis; return rep; },
    api_chat_follow: function (a) { var e = etat(), me = e.me, ev = [], m = null, salon = null; for (var r in db.chat) db.chat[r].forEach(function (x) { if (x.id === +a.p_msg && x.k === 'bet') { m = x; salon = r; } });
      if (rangDe(me).t < 2) throw { message: 'rang_insuffisant' }; if (!m || m.u === uid()) throw { message: 'mise_indisponible' };
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
  var SANS_SESSION = { api_markets: 1, api_pseudo_libre: 1 };

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
  function clanEntrer(e, id, role) { e.clanM = { id: id, role: role, since: Date.now(), xp: 0, jour: 0, ecartes: 0 }; e.clanApps = {};
    var j = (db.clans || []).filter(function (x) { return x.id === id; })[0]; if (j) j.members.push({ u: uid(), role: role, since: Date.now(), pts: 0 }); }
  function clanAvancer(e, ev) { var apps = e.clanApps || {}; Object.keys(apps).forEach(function (id) { if (apps[id] > Date.now() - 6000) return; delete apps[id];
      var ok = (CFG.clanRefus || []).indexOf(id) < 0; if (ok) { try { clanVerifier(e, id); clanEntrer(e, id, 'membre'); } catch (x) { ok = false; } }
      var n = notif('shield', ok ? 'clan_accepte' : 'clan_refuse', { id: id }, '#clan-' + id); if (ev) ev.push(n); }); }
  function clanEtat(e) { var moi = uid(), users = {}; (db.clans || []).forEach(function (j) { j.members.forEach(function (m) { if (m.u !== moi && db.etats[m.u]) users[m.u] = { n: db.etats[m.u].me.n, t: 0, d: 0, tone: 0, bot: false, pub: 1, clan: j.id }; }); });
    return { mine: e.clanM ? clone(e.clanM) : null, leftAt: e.clanParti || null, apps: clone(e.clanApps || {}),
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

  var dmOk = function (u, ecrire) { var e = etat(); if (!u || u === uid() || !db.fiches[u]) throw { message: 'joueur_inconnu' }; if (e.friends.indexOf(u) < 0) throw { message: 'pas_amis' }; if (ecrire && rangDe(e.me).t < 1) throw { message: 'rang_insuffisant' }; };
  /* ----- Chat : salons publics ----- */
  /* un message tel que le serveur l'envoie : sans ses données internes (qui a suivi, qui a réagi) */
  var msgPropre = function (m) { var c = clone(m); delete c.suivis; delete c.qui; if (c.r && !Object.keys(c.r).length) delete c.r; return c; };
  var mesDe = function (L) { var o = {}; L.forEach(function (m) { var q = m.qui && m.qui[uid()]; if (q && q.length) o[m.id] = clone(q); }); return o; };
  var salonOk = function (r) { if (r === 'general' || (/^m:/.test(String(r)) && typeof MK !== 'undefined' && MK[String(r).slice(2)])) return;
    var k = etat().clanM; if (k && r === 'clan:' + k.id) return;                                  /* le salon de son clan, et lui seul */
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
        if (uid() && !SANS_SESSION[name] && name !== 'api_present') { var x = (db.etats[uid()].rg || {}).excl; if (x === -1 || x > Date.now()) { resolve({ data: null, error: { message: 'exclu', code: 'P0001', details: String(x) } }); return; } }
        try { var d = RPC[name](args || {}); persist(); resolve({ data: d === undefined ? null : d, error: null }); }
        catch (e) { resolve({ data: null, error: { message: e.message || String(e), code: 'P0001' } }); }
      }, CFG.latence || 3);
    });
  }

  /* ----- Service de connexion par pseudo (Edge Function « connexion ») ----- */
  var functions = { invoke: function (name, opt) {
    var b = (opt && opt.body) || {}; rec('fn', name, { pseudo: b.pseudo });
    var ko = function (code) { return Promise.resolve({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: function () { return Promise.resolve({ ok: false, code: code }); } } } }); };
    if (name === 'eclair') {
      calls[calls.length - 1].args = { action: b.action, gid: b.gid, side: b.side, amt: b.amt, stake: b.stake, choice: b.choice, id: b.id };
      if (CFG.horsLigne) return Promise.reject(new TypeError('Failed to fetch'));
      var forcee = (CFG.fn || {}).eclair; if (forcee) return ko(forcee);
      if (!uid()) return ko('session');
      try { var rep = b.action === 'bet' ? eclairMiser(b) : b.action === 'settle' ? eclairRegler() : /^serie_/.test(b.action || '') ? serieAction(b) : /^blitz_/.test(b.action || '') ? blitzAction(b) : null; if (!rep) return ko('requete'); persist(); rep.ok = true; rep.now = Date.now() + (CFG.decalage || 0);
        return new Promise(function (ok) { setTimeout(function () { ok({ data: clone(rep), error: null }); }, CFG.latence || 3); }); }
      catch (e) { return ko(e.message || 'serveur'); }
    }
    if (name !== 'connexion') return ko('serveur');
    for (var em in db.comptes) { var c = db.comptes[em]; if (String(c.pseudo || '').toLowerCase() === String(b.pseudo || '').toLowerCase()) return c.password === b.mot_de_passe ? Promise.resolve({ data: { ok: true, access_token: 'jeton:' + c.id + ':' + em, refresh_token: 'r' }, error: null }) : ko('identifiants'); }
    return ko('identifiants');
  } };

  /* ----- Authentification ----- */
  var ouvrir = function (id, em, pseudo) { db.session = { user: { id: id, email: em } }; if (!db.etats[id]) db.etats[id] = etatNeuf(id, em, pseudo || em.split('@')[0], false); persist(); fireAuth('SIGNED_IN'); };
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
    /** diffuse l'état actuel de marchés, comme un tick du serveur */
    tick: function (ids, extra) { var d = { t: Date.now(), m: marchesDe(ids || Object.keys(db.marches)) }; for (var k in extra || {}) d[k] = extra[k]; return window.__fakeSB.emit('marches', 'tick', d); }
  };
  window.supabase = { createClient: function (url, cle, opts) { rec('createClient', url, { cle: String(cle).slice(0, 15), storageKey: opts && opts.auth && opts.auth.storageKey }); if (opts && opts.auth && opts.auth.storageKey) CLE = opts.auth.storageKey; ranger(); return client; } };
})();
