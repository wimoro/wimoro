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
    (CFG.marches || []).forEach(function (x) { db.marches[x.market_id] = { p: +x.current_probability, d0: x.d0 == null ? null : +x.d0, vol: +(x.volume_total || 0), people: x.participants_count | 0, liq: x.liquidity_depth == null ? null : +x.liquidity_depth, st: x.status || 'open', hot: 0, ph: clone(x.price_history || []) }; });
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
    api_state: function () { var e0 = etat(); regler(e0, []); rgMaj(e0, []); var e = clone(e0); e.deps = e0.deps.map(depJson); e.eclair = eclairJson(e0); delete e.eclairMises; e.now = Date.now() + (CFG.decalage || 0); return e; },
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
    api_chat_seen: function () { return null; },
    api_leaderboard: function () { var ids = Object.keys(db.fiches).filter(function (id) { return id !== uid() && db.fiches[id].pub !== 0; }).sort(function (x, y) { return (db.fiches[y].profit || 0) - (db.fiches[x].profit || 0); }).slice(0, 50), users = {};
      ids.forEach(function (id) { users[id] = ficheDe(id); }); return { ids: ids, users: users }; },
    api_dm_history: function (a) { dmOk(a.p_user, false); var L = (db.chat['dm:' + [uid(), a.p_user].sort().join(':')] || []).slice(-60), users = {}; users[a.p_user] = ficheDe(a.p_user); return { u: a.p_user, msgs: clone(L), users: users }; },
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
      L.forEach(function (m) { users[m.u] = ficheDe(m.u); }); return { room: a.p_room, msgs: clone(L), users: users }; },
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
  var salonOk = function (r) { if (r === 'general' || (/^m:/.test(String(r)) && typeof MK !== 'undefined' && MK[String(r).slice(2)])) return; throw { message: 'salon_indisponible' }; };
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
      calls[calls.length - 1].args = { action: b.action, gid: b.gid, side: b.side, amt: b.amt };
      if (CFG.horsLigne) return Promise.reject(new TypeError('Failed to fetch'));
      var forcee = (CFG.fn || {}).eclair; if (forcee) return ko(forcee);
      if (!uid()) return ko('session');
      try { var rep = b.action === 'bet' ? eclairMiser(b) : b.action === 'settle' ? eclairRegler() : null; if (!rep) return ko('requete'); persist(); rep.ok = true; rep.now = Date.now() + (CFG.decalage || 0);
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
    /** diffuse l'état actuel de marchés, comme un tick du serveur */
    tick: function (ids, extra) { var d = { t: Date.now(), m: marchesDe(ids || Object.keys(db.marches)) }; for (var k in extra || {}) d[k] = extra[k]; return window.__fakeSB.emit('marches', 'tick', d); }
  };
  window.supabase = { createClient: function (url, cle, opts) { rec('createClient', url, { cle: String(cle).slice(0, 15), storageKey: opts && opts.auth && opts.auth.storageKey }); if (opts && opts.auth && opts.auth.storageKey) CLE = opts.auth.storageKey; ranger(); return client; } };
})();
