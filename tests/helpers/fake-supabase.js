/* Faux client Supabase pour les tests : remplace le script du CDN supabase-js.
 * Il garde une petite « base » en mémoire (persistée dans localStorage pour survivre à un rechargement),
 * enregistre tous les appels et permet de simuler le temps réel.
 * Configuration : window.__FAKE_SB__ = { session, tables, rpc, accounts, autoconfirm, failWrites } avant le chargement.
 * Inspection    : window.__fakeSB.calls, .db, .emit(table, event, row), .setSession(s)
 */
(function () {
  'use strict';
  var CFG = window.__FAKE_SB__ || {};
  var DBKEY = '__fakedb__';
  var clone = function (x) { return x === undefined ? x : JSON.parse(JSON.stringify(x)); };
  var db;
  try { db = JSON.parse(localStorage.getItem(DBKEY) || 'null'); } catch (e) { db = null; }
  if (!db) db = { tables: clone(CFG.tables || {}), session: clone(CFG.session || null), accounts: clone(CFG.accounts || {}), seq: 1 };
  var persist = function () { try { localStorage.setItem(DBKEY, JSON.stringify(db)); } catch (e) {} };
  persist();
  var calls = [], authCbs = [], channels = [];
  var T = function (name) { return db.tables[name] || (db.tables[name] = []); };
  var rec = function (kind, name, args) { calls.push({ kind: kind, name: name, args: clone(args), at: Date.now() }); };
  var uid = function () { return db.session && db.session.user ? db.session.user.id : null; };
  var like = function (pattern, value) {
    var re = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
    return re.test(String(value == null ? '' : value));
  };
  var keyOf = { users: 'id', user_stats: 'user_id', user_full_state: 'user_id', user_preferences: 'user_id', market_live_state: 'market_id' };
  var fireAuth = function (ev) { authCbs.slice().forEach(function (cb) { try { cb(ev, clone(db.session)); } catch (e) { console.error(e); } }); };

  function exec(q) {
    rec('from', q.table + '.' + q.op, { filters: q.filters, payload: q.payload });
    if (CFG.failWrites && q.op !== 'select') return Promise.resolve({ data: null, error: { message: 'fake: write failed' } });
    var rows = T(q.table);
    var match = function (r) { return q.filters.every(function (f) { return f[0] === 'eq' ? String(r[f[1]]) === String(f[2]) : like(f[2], r[f[1]]); }); };
    if (q.op === 'select') {
      var out = rows.filter(match).map(clone);
      if (q.single) return Promise.resolve(out.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: out[0] || null, error: null });
      return Promise.resolve({ data: out, error: null });
    }
    if (q.op === 'insert' || q.op === 'upsert') {
      var list = Array.isArray(q.payload) ? q.payload : [q.payload], k = keyOf[q.table];
      for (var i = 0; i < list.length; i++) {
        var row = clone(list[i]), ex = k ? rows.find(function (r) { return String(r[k]) === String(row[k]); }) : null;
        if (ex && q.op === 'insert') return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } });
        if (ex) Object.assign(ex, row); else rows.push(row);
      }
      persist(); return Promise.resolve({ data: null, error: null });
    }
    if (q.op === 'update') { rows.filter(match).forEach(function (r) { Object.assign(r, clone(q.payload)); }); persist(); return Promise.resolve({ data: null, error: null }); }
    if (q.op === 'delete') { db.tables[q.table] = rows.filter(function (r) { return !match(r); }); persist(); return Promise.resolve({ data: null, error: null }); }
    return Promise.resolve({ data: null, error: { message: 'fake: op ' + q.op } });
  }
  function from(table) {
    var q = { table: table, op: 'select', filters: [], payload: null, single: false };
    var api = {
      select: function () { return api; }, order: function () { return api; }, limit: function () { return api; }, range: function () { return api; },
      eq: function (c, v) { q.filters.push(['eq', c, v]); return api; },
      ilike: function (c, v) { q.filters.push(['ilike', c, v]); return api; },
      maybeSingle: function () { q.single = true; return api; }, single: function () { q.single = true; return api; },
      insert: function (p) { q.op = 'insert'; q.payload = p; return api; },
      upsert: function (p) { q.op = 'upsert'; q.payload = p; return api; },
      update: function (p) { q.op = 'update'; q.payload = p; return api; },
      delete: function () { q.op = 'delete'; return api; },
      then: function (ok, ko) { return exec(q).then(ok, ko); } // « thenable » sans .catch, comme supabase-js
    };
    return api;
  }

  // Comportement par défaut des RPC : imite le serveur actuel de façon minimale.
  var stats = function () { var id = uid(); var s = T('user_stats').find(function (r) { return r.user_id === id; }); if (!s) { s = { user_id: id, balance: 0, xp: 0 }; T('user_stats').push(s); } return s; };
  var RPC = {
    get_markets: function () { return clone(T('market_live_state')); },
    get_friends: function () { return clone(T('__friends')); },
    place_bet: function (a) { var s = stats(), m = T('market_live_state').find(function (r) { return r.market_id === a.p_market_id; }) || { current_probability: 50 };
      if (a.p_amount > s.balance) throw { message: 'Insufficient balance' };
      var price = a.p_side === 'oui' ? Number(m.current_probability) : 100 - Number(m.current_probability), sh = Math.round(a.p_amount / (price / 100) * 100) / 100;
      s.balance = Math.round((s.balance - a.p_amount) * 100) / 100; s.xp = (s.xp || 0) + 10; s.bets_placed = (s.bets_placed || 0) + 1;
      T('positions').push({ user_id: uid(), market_id: a.p_market_id, side: a.p_side, shares: sh, average_price: price });
      return { new_balance: s.balance, shares: sh, avg_price: price, new_market_price: Number(m.current_probability) + (a.p_side === 'oui' ? 0.2 : -0.2) }; },
    sell_position: function (a) { var s = stats(); var pro = Math.round(a.p_shares * 0.5 * 100) / 100; s.balance += pro; return { new_balance: s.balance, shares_sold: a.p_shares, proceeds: pro, new_market_price: 50 }; },
    flash_bet: function (a) { var s = stats(); if (a.p_amount > s.balance) throw { message: 'Insufficient balance' }; s.balance = Math.round((s.balance - a.p_amount) * 100) / 100; T('flash_bets').push({ user_id: uid(), game_id: a.p_game_id, side: a.p_side, amount: a.p_amount }); return { new_balance: s.balance }; },
    demo_deposit: function (a) { var s = stats(); s.balance = Math.round((s.balance + a.p_amount) * 100) / 100; s.deposits_count = (s.deposits_count || 0) + 1; T('deposits').push({ user_id: uid(), coin: a.p_coin, usd: a.p_amount }); return { new_balance: s.balance }; },
    send_chat_message: function (a) { T('chat_messages').push({ id: db.seq++, room_id: a.p_room_id, user_id: uid(), text_content: a.p_text, message_type: 'msg' }); return { id: db.seq }; }
  };
  function rpc(name, args) {
    rec('rpc', name, args || {});
    var over = (CFG.rpc || {})[name];
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (over !== undefined) { resolve(over && over.error ? { data: null, error: over.error } : { data: clone(over && over.data !== undefined ? over.data : over), error: null }); return; }
        if (!RPC[name]) { resolve({ data: null, error: { message: 'fake: function ' + name + ' not found', code: 'PGRST202' } }); return; }
        if (!uid() && name !== 'get_markets') { resolve({ data: null, error: { message: 'Not authenticated' } }); return; }
        try { var d = RPC[name](args || {}); persist(); resolve({ data: d, error: null }); } catch (e) { resolve({ data: null, error: { message: e.message || String(e) } }); }
      }, CFG.latency || 5);
    });
  }

  var auth = {
    getSession: function () { rec('auth', 'getSession'); return Promise.resolve({ data: { session: clone(db.session) }, error: null }); },
    getUser: function () { return Promise.resolve({ data: { user: db.session ? clone(db.session.user) : null }, error: null }); },
    onAuthStateChange: function (cb) { authCbs.push(cb); return { data: { subscription: { unsubscribe: function () { authCbs = authCbs.filter(function (x) { return x !== cb; }); } } } }; },
    signInWithPassword: function (c) { rec('auth', 'signInWithPassword', { email: c.email });
      var a = db.accounts[String(c.email).toLowerCase()];
      if (!a || a.password !== c.password) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
      db.session = { user: { id: a.id, email: c.email.toLowerCase() } }; persist(); fireAuth('SIGNED_IN');
      return Promise.resolve({ data: { user: clone(db.session.user), session: clone(db.session) }, error: null }); },
    signUp: function (c) { rec('auth', 'signUp', { email: c.email, options: c.options || null });
      var em = String(c.email).toLowerCase();
      if (db.accounts[em]) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'User already registered' } });
      var id = '00000000-0000-4000-8000-' + String(1000 + db.seq++).padStart(12, '0');
      db.accounts[em] = { id: id, password: c.password };
      var meta = (c.options && c.options.data) || {};
      T('users').push({ id: id, username: meta.username || em.split('@')[0] + '_' + id.slice(-4), email: em, onboarded: true, welcomed: true, is_demo: false });
      T('user_stats').push({ user_id: id, balance: 0, xp: 0 });
      if (CFG.autoconfirm === false) { persist(); return Promise.resolve({ data: { user: { id: id, email: em }, session: null }, error: null }); }
      db.session = { user: { id: id, email: em } }; persist(); fireAuth('SIGNED_IN');
      return Promise.resolve({ data: { user: clone(db.session.user), session: clone(db.session) }, error: null }); },
    signOut: function () { rec('auth', 'signOut'); db.session = null; persist(); fireAuth('SIGNED_OUT'); return Promise.resolve({ error: null }); },
    resetPasswordForEmail: function (email, opt) { rec('auth', 'resetPasswordForEmail', { email: email, options: opt || null }); return Promise.resolve({ data: {}, error: null }); },
    verifyOtp: function (p) { rec('auth', 'verifyOtp', { email: p.email, type: p.type }); return Promise.resolve({ data: {}, error: { message: 'fake: verifyOtp not configured' } }); },
    updateUser: function (p) { rec('auth', 'updateUser', Object.keys(p || {})); return Promise.resolve({ data: {}, error: null }); }
  };
  function channel(name) {
    var ch = { name: name, handlers: [], subscribed: false,
      on: function (type, filter, cb) { ch.handlers.push({ type: type, filter: filter, cb: cb }); rec('channel', name + '.on', { type: type, filter: filter }); return ch; },
      subscribe: function (cb) { ch.subscribed = true; if (cb) setTimeout(function () { cb('SUBSCRIBED'); }, 0); return ch; },
      unsubscribe: function () { ch.subscribed = false; return Promise.resolve('ok'); }, send: function () { return Promise.resolve('ok'); } };
    channels.push(ch); return ch;
  }
  var client = { from: from, rpc: rpc, auth: auth, channel: channel, removeChannel: function (c) { channels = channels.filter(function (x) { return x !== c; }); return Promise.resolve('ok'); }, removeAllChannels: function () { channels = []; return Promise.resolve([]); } };

  window.__fakeSB = {
    calls: calls, db: db, channels: channels, persist: persist,
    count: function (kind, name) { return calls.filter(function (c) { return c.kind === kind && (!name || c.name === name); }).length; },
    setSession: function (s) { db.session = s; persist(); },
    /** Simule un événement temps réel « postgres_changes » */
    emit: function (table, event, row, old) { var n = 0; channels.forEach(function (ch) { ch.handlers.forEach(function (h) {
      if (h.type === 'postgres_changes' && h.filter && h.filter.table === table && (h.filter.event === '*' || h.filter.event === event)) { n++; h.cb({ eventType: event, schema: 'public', table: table, new: clone(row), old: clone(old || {}) }); } }); }); return n; },
    reset: function () { try { localStorage.removeItem(DBKEY); } catch (e) {} }
  };
  window.supabase = { createClient: function (url, key, opts) { rec('createClient', url, { opts: opts || null }); return client; } };
})();
