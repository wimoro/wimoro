/* Faux client Supabase pour les tests : il remplace js/vendor/supabase-*.js.
 * Il imite le contrat du vrai back (fonctions api_*, service de connexion, authentification), garde son état dans
 * localStorage pour survivre à un rechargement, enregistre tous les appels et permet de simuler le temps réel.
 *
 * Configuration (avant le chargement) : window.__FAKE_SB__ = {
 *   session   : { user: { id, email } } | null      session ouverte au départ
 *   etat      : { me: {…}, positions: […], … }      morceaux d'état fusionnés dans l'état par défaut du joueur connecté
 *   comptes   : { 'a@b.c': { id, password, pseudo } }  comptes existants (connexion)
 *   marches   : [ { market_id, current_probability, volume_total, liquidity_depth, participants_count, status, price_history } ]
 *               un marché absent de la liste est créé à la demande avec les valeurs de départ du site
 *   rpc       : { nom: valeur | { error: { message } } }   réponses forcées
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
      badges: [], friends: [], freqIn: [], freqOut: [], following: [], watch: [], prefs: {}, users: {}
    };
  }

  var db;
  try { db = JSON.parse(localStorage.getItem(DBKEY) || 'null'); } catch (e) { db = null; }
  if (!db) {
    db = { session: clone(CFG.session || null), comptes: clone(CFG.comptes || {}), etats: {}, marches: {}, ops: {}, seq: 1 };
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
    api_state: function () { var e = clone(etat()); e.now = Date.now() + (CFG.decalage || 0); return e; },
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
    api_markets: function () { return { now: Date.now() + (CFG.decalage || 0), m: clone(db.marches) }; },
    api_buy: function (a) {
      var e = etat(), me = e.me, total = r2(+a.p_total), cle = uid() + ':' + a.p_key;
      if (a.p_side !== 'oui' && a.p_side !== 'non') throw { message: 'cote_invalide' };
      if (!(total >= 1)) throw { message: 'montant_min' };
      if (!a.p_key) throw { message: 'cle_absente' };
      if (db.ops[cle]) { var deja = clone(db.ops[cle]); deja.rejoue = true; return deja; }      // même clé : appliqué une seule fois
      var m = marche(a.p_market); if (!m) throw { message: 'marche_inconnu' };
      if (m.st !== 'open') throw { message: 'marche_ferme' };
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
        try { var d = RPC[name](args || {}); persist(); resolve({ data: d === undefined ? null : d, error: null }); }
        catch (e) { resolve({ data: null, error: { message: e.message || String(e), code: 'P0001' } }); }
      }, CFG.latence || 3);
    });
  }

  /* ----- Service de connexion par pseudo (Edge Function « connexion ») ----- */
  var functions = { invoke: function (name, opt) {
    var b = (opt && opt.body) || {}; rec('fn', name, { pseudo: b.pseudo });
    var ko = function (code) { return Promise.resolve({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: function () { return Promise.resolve({ ok: false, code: code }); } } } }); };
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
