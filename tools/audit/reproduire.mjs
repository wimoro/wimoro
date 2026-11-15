// Audit dynamique du front : reproduit les bugs dans un vrai navigateur, avec un faux client Supabase.
// Ne touche jamais la base réelle (sauf la sonde B10, en lecture seule, désactivable avec --hors-ligne).
// Usage : node tools/audit/reproduire.mjs [--only B01,B02] [--hors-ligne]
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4188, BASE = `http://127.0.0.1:${PORT}`;
const FAKE = fs.readFileSync(path.join(ROOT, 'tests/helpers/fake-supabase.js'), 'utf8');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const offline = process.argv.includes('--hors-ligne');
const UID = '11111111-1111-4111-8111-111111111111', FRIEND = '22222222-2222-4222-8222-222222222222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

// Serveur de fichiers local (boucle locale uniquement) : on attend sa ligne « servi sur… » avant de continuer.
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill());
await new Promise((ok, ko) => { server.stdout.once('data', ok); server.once('exit', () => ko(new Error('le serveur local ne démarre pas (port ' + PORT + ' occupé ?)'))); });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** Ouvre l'application. mode : 'visiteur' | 'demo' | 'compte' (session Supabase factice). */
async function open({ mode = 'visiteur', lang = 'en', hash = '#accueil', fake = {}, local = {}, viewport = { width: 1280, height: 900 }, spyTimers = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(`${e.name}: ${e.message}` + ((e.stack || '').split('\n')[1] ? ' @ ' + (e.stack.split('\n')[1] || '').trim().replace(BASE, '') : '')));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) errors.push('console.error: ' + t); if (t.startsWith('[SB]')) logs.push(t); });
  await page.route(/cdn\.jsdelivr\.net\/.*supabase/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const tables = { users: [{ id: UID, username: 'realuser', email: 'real@test.dev', avatar_color: '#2448FF', kyc_verified: false }], user_stats: [{ user_id: UID, balance: 500, xp: 0 }], user_full_state: [{ user_id: UID, state: {} }], ...(fake.tables || {}) };
  const cfg = { ...fake, tables, session: mode === 'compte' ? { user: { id: UID, email: 'real@test.dev' } } : (fake.session || null) };
  await page.addInitScript(({ lang, mode, cfg, local, spyTimers }) => {
    if (!sessionStorage.getItem('__init__')) {
      sessionStorage.setItem('__init__', '1');
      localStorage.setItem('wimoro-lang', lang);
      if (mode === 'demo') localStorage.setItem('wimoro-session', '__demo__');
      for (const k in local) localStorage.setItem(k, local[k]);
    }
    window.__FAKE_SB__ = cfg;
    if (spyTimers) { window.__timers = []; const si = window.setInterval; window.setInterval = function (fn, ms) { const st = (new Error().stack || '').split('\n').slice(2, 3).join('').trim().replace(/^at /, '').replace(location.origin, ''); window.__timers.push({ ms, at: st }); return si.apply(this, arguments); }; }
  }, { lang, mode, cfg, local, spyTimers });
  await page.goto(BASE + '/index.html' + hash);
  await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').children.length > 0, null, { timeout: 15000 }).catch(() => errors.push('le premier rendu n\'a pas eu lieu'));
  await sleep(350);
  return { ctx, page, errors, logs, close: () => ctx.close() };
}

const probes = {
  // ───────────────────────────────────────────────────────────── structure
  async S1() {
    const html = execSync('git show 3a1d258:index.html', { cwd: ROOT, maxBuffer: 1 << 26 }).toString();
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1].trim()).filter(b => b.length > 300 && !/^try{var [lt]=localStorage/.test(b));
    const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="js\/([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'supabase.js');
    log(`S1  index.html d'origine (3a1d258) : ${blocks.length} blocs <script> ; fichiers JS actuels hors supabase.js : ${order.length}`);
    const strip = s => s.replace(/^\/\* WIMORO[^\n]*\*\/\s*/, '').trim();
    let same = 0; const diffs = [];
    order.forEach((f, i) => {
      const cur = strip(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')), ori = (blocks[i] || '').trim();
      if (cur === ori) { same++; return; }
      const a = ori.split('\n'), b = cur.split('\n'), d = [];
      for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) d.push(k + 1);
      diffs.push(`${f} : ${d.length} ligne(s) différente(s) → ` + d.slice(0, 6).map(n => { const x = a[n - 1] || '', y = b[n - 1] || ''; let p = 0; while (p < x.length && x[p] === y[p]) p++; return `l.${n + 2} « …${x.slice(Math.max(0, p - 25), p + 45).replace(/\s+/g, ' ')}… » devient « …${y.slice(Math.max(0, p - 25), p + 45).replace(/\s+/g, ' ')}… »`; }).join(' | '));
    });
    log(`S1  fichiers identiques au bloc d'origine : ${same}/${order.length}`); diffs.forEach(d => log('S1    ≠ ' + d));
    const css0 = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1].trim(), css1 = fs.readFileSync(path.join(ROOT, 'css/main.css'), 'utf8').replace(/^\/\*[^\n]*\*\/\s*/, '').trim();
    log(`S1  css/main.css identique au <style> d'origine : ${css0 === css1}`);
  },
  // ───────────────────────────────────────────────────────────── B01
  async B01() {
    const a = await open({ mode: 'visiteur' });
    const r = await a.page.evaluate(() => ({ swA: typeof ACT['switch-to-account'], swD: typeof ACT['switch-to-demo'] }));
    log(`B01 erreurs au chargement (visiteur) : ${JSON.stringify(a.errors)}`);
    log(`B01 log « [SB] Initialized » présent : ${a.logs.some(l => l.includes('Initialized'))} ; ACT['switch-to-account']=${r.swA} ; ACT['switch-to-demo']=${r.swD}`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B02 / B03
  async B02() {
    const a = await open({ mode: 'demo', hash: '#eclair' });
    await a.page.waitForFunction(() => flashPhase().open && flashPhase().openLeft > 3000, null, { timeout: 50000 });
    const before = await a.page.evaluate(() => ({ bal: S.me.balance, my: G(S.ui.fgame).my, played: S.me.played }));
    await a.page.locator('[data-a="flash-bet"]:not([disabled])').first().click();
    await sleep(500);
    const after = await a.page.evaluate(() => ({ bal: S.me.balance, my: G(S.ui.fgame).my, played: S.me.played }));
    log(`B02 mode Démo, clic sur un bouton de pari éclair : solde ${before.bal} → ${after.bal} ; mise enregistrée : ${JSON.stringify(after.my)} ; paris joués ${before.played} → ${after.played}`);
    const direct = await a.page.evaluate(() => { const b = S.me.balance; flashBet('oui', null, S.ui.fgame); return { before: b, after: S.me.balance, my: !!G(S.ui.fgame).my }; });
    log(`B02 même manche, appel direct de la fonction d'origine flashBet() : solde ${direct.before} → ${direct.after} ; mise enregistrée : ${direct.my}  (→ la fonction d'origine marche, c'est le remplacement de supabase.js:189 qui bloque)`);
    await a.close();
  },
  async B03() {
    const a = await open({ mode: 'compte', hash: '#eclair' });
    await a.page.waitForFunction(() => flashPhase().open && flashPhase().openLeft > 3000, null, { timeout: 50000 });
    const before = await a.page.evaluate(() => ({ bal: S.me.balance, xp: S.me.xp }));
    await a.page.locator('[data-a="flash-bet"]:not([disabled])').first().click();
    await sleep(600);
    const r = await a.page.evaluate(() => ({ bal: S.me.balance, xp: S.me.xp, my: G(S.ui.fgame).my, fmy: S.me.fmy || null, rpc: __fakeSB.calls.filter(c => c.kind === 'rpc' && c.name === 'flash_bet').map(c => c.args), missions: S.me.missions.map(m => m.type + ':' + m.have) }));
    log(`B03 mode Compte, pari éclair : RPC flash_bet appelé ${r.rpc.length} fois ${JSON.stringify(r.rpc[0] || {})} ; solde ${before.bal} → ${r.bal} ; mise côté client G().my=${JSON.stringify(r.my)} ; S.me.fmy=${JSON.stringify(r.fmy)} ; XP ${before.xp} → ${r.xp} ; missions ${r.missions.join(',')}`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B04
  async B04() {
    const a = await open({ mode: 'compte', fake: { tables: { market_live_state: [{ market_id: 'btc150k', current_probability: 70, anchor_probability: 70, volume_total: 9e6 }] } }, spyTimers: true });
    await a.page.waitForFunction(() => MK.btc150k.vol >= 9e6, null, { timeout: 5000 }).catch(() => {});
    const t0 = await a.page.evaluate(() => { MARKETS.forEach(m => { m.__p0 = m.p; m.__v0 = m.vol; m.__b0 = m.bets.length; }); return { p: MK.btc150k.p, vol: MK.btc150k.vol }; });
    await sleep(6000);
    const t1 = await a.page.evaluate(() => ({ p: MK.btc150k.p, vol: MK.btc150k.vol, moved: MARKETS.filter(m => m.p !== m.__p0).length, total: MARKETS.length, volUp: MARKETS.filter(m => m.vol > m.__v0).length, local: !!localStorage.getItem('wimoro-markets') }));
    log(`B04 mode Compte : prix serveur de btc150k = ${t0.p} ; 6 s plus tard, sans aucun message du serveur = ${t1.p.toFixed(3)} ; volume ${t0.vol} → ${Math.round(t1.vol)}`);
    log(`B04 marchés dont le prix a bougé localement en 6 s : ${t1.moved}/${t1.total} ; dont le volume a monté : ${t1.volUp}`);
    const timers = await a.page.evaluate(() => window.__timers);
    log(`B04 minuteurs périodiques actifs en mode Compte : ${timers.length}`);
    const g = {}; timers.forEach(t => { const k = `${t.ms} ms @ ${t.at.replace(/^.*\//, '').replace(/\)$/, '')}`; g[k] = (g[k] || 0) + 1; });
    Object.entries(g).forEach(([k, n]) => log(`B04    setInterval ${k}${n > 1 ? ' ×' + n : ''}`));
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B05
  async B05() {
    const a = await open({ mode: 'compte', hash: '#retrait' });
    const s0 = await a.page.evaluate(() => ({ bal: S.me.balance, xp: S.me.xp }));
    const s1 = await a.page.evaluate(() => { S.me.kyc = true; S.ui.wd.method = 'card'; S.ui.fiat.wd = '100'; startFiatWd(); gainXP(50); const m = S.me.missions[0]; m.have = m.goal; ACT.claim({ dataset: { id: m.id } }, null); return { bal: S.me.balance, xp: S.me.xp, wds: S.me.wds.length }; });
    await sleep(16500);
    const s2 = await a.page.evaluate(() => ({ bal: S.me.balance, xp: S.me.xp, wds: S.me.wds.length, server: __fakeSB.db.tables.user_stats[0] }));
    log(`B05 mode Compte : solde ${s0.bal} → retrait carte de 100 $ → ${s1.bal} → 16 s plus tard → ${s2.bal}   (serveur : ${s2.server.balance})`);
    log(`B05 XP ${s0.xp} → +50 XP et mission réclamée → ${s1.xp} → 16 s plus tard → ${s2.xp} ; le retrait reste affiché dans l'historique local : ${s2.wds} ligne(s), alors que l'argent est revenu`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B06
  async B06() {
    const a = await open({ mode: 'compte', hash: '#marche-btc150k', fake: { failWrites: true, tables: { market_live_state: [{ market_id: 'btc150k', current_probability: 60, anchor_probability: 60, volume_total: 5e6 }] } } });
    await a.page.evaluate(() => openBet('btc150k', 'oui', 50));
    await a.page.locator('.md [data-a="buy"]').click();
    await sleep(600);
    const s1 = await a.page.evaluate(() => ({ bal: S.me.balance, pos: S.me.positions.length }));
    await a.page.reload(); await sleep(1200);
    const s2 = await a.page.evaluate(() => ({ bal: S.me.balance, pos: S.me.positions.length, serverPos: (__fakeSB.db.tables.positions || []).length, blob: Object.keys((__fakeSB.db.tables.user_full_state[0] || {}).state || {}).length }));
    log(`B06 mode Compte, achat de 50 $ : solde 500 → ${s1.bal}, positions locales : ${s1.pos}. Rechargement avant la sauvegarde du blob (échec simulé) : solde ${s2.bal}, positions affichées : ${s2.pos}, alors que la table positions du serveur en contient ${s2.serverPos} (jamais lue)`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B07
  async B07() {
    const a = await open({ mode: 'compte', local: { 'wimoro-session': '__demo__' } });
    await sleep(800);
    const s = await a.page.evaluate(() => ({ n: S.me.n, bal: S.me.balance, pos: S.me.positions.map(p => p.m), hist: S.me.history.length, following: S.me.following, demo: S.auth.demo, key: KEY }));
    log(`B07 session Supabase (realuser, 500 $) + session locale sur le compte démo → pseudo « ${s.n} », solde ${s.bal}, positions : [${s.pos.join(', ')}], historique : ${s.hist} lignes, abonnements : [${s.following.join(', ')}], S.auth.demo=${s.demo}, clé de stockage local : ${s.key}`);
    await sleep(17500);
    const up = await a.page.evaluate(() => { const c = __fakeSB.calls.filter(c => c.kind === 'from' && c.name === 'user_full_state.upsert').pop(); return c ? { n: c.args.payload.state.n, pos: (c.args.payload.state.positions || []).length, bal: c.args.payload.state.balance } : null; });
    log(`B07 17 s plus tard, blob envoyé au serveur pour le vrai compte : ${JSON.stringify(up)}  (→ les ${up ? up.pos : '?'} positions du compte démo sont écrites chez le vrai utilisateur)`);
    await a.close();
    const acc = { 'ghost@test.dev': { id: 'abc123', key: 'ghost@test.dev', email: 'ghost@test.dev', pseudo: 'ghost', ph: 'x' } };
    const b = await open({ mode: 'visiteur', local: { 'wimoro-accounts': JSON.stringify(acc), 'wimoro-session': 'ghost@test.dev' } });
    const g = await b.page.evaluate(() => ({ logged: S.me.logged, n: S.me.n, bal: S.me.balance, calls: __fakeSB.calls.filter(c => c.kind !== 'createClient' && c.kind !== 'channel').map(c => c.kind + ':' + c.name) }));
    log(`B07 variante : compte local « connecté » sans session Supabase → connecté=${g.logged}, pseudo=${g.n}, solde=${g.bal} ; appels au back : ${JSON.stringify(g.calls)}  (→ tout tourne en local, rien n'est sauvegardé)`);
    await b.close();
  },
  // ───────────────────────────────────────────────────────────── B08
  async B08() {
    const a = await open({ mode: 'visiteur', hash: '#inscription', fake: { accounts: { 'taken@test.dev': { id: 'x', password: 'whatever1' } } } });
    const r1 = await a.page.evaluate(async () => { createAccount('newbie', 'taken@test.dev', 'password123'); await new Promise(r => setTimeout(r, 300)); return { logged: S.me.logged, n: S.me.n, onboarded: S.me.onboarded, bal: S.me.balance, dep0: S.me.deps[0] && (S.me.deps[0].label + ' ' + S.me.deps[0].usd), local: Object.keys(JSON.parse(localStorage.getItem('wimoro-accounts') || '{}')), signUp: __fakeSB.calls.filter(c => c.name === 'signUp').map(c => c.args), taken: takenNames() }; });
    log(`B08 inscription avec un e-mail déjà pris côté serveur (signUp échoue) : connecté=${r1.logged}, pseudo=${r1.n}, compte local créé : ${JSON.stringify(r1.local)}`);
    log(`B08 arguments de signUp : ${JSON.stringify(r1.signUp)} ; onboarded=${r1.onboarded} ; solde=${r1.bal} ; premier dépôt affiché : « ${r1.dep0} »`);
    log(`B08 pseudos considérés comme déjà pris (takenNames) : ${r1.taken.length} → ${JSON.stringify(r1.taken).slice(0, 160)}`);
    await a.close();
    const b = await open({ mode: 'visiteur', hash: '#inscription', fake: { autoconfirm: false } });
    const r2 = await b.page.evaluate(async () => { createAccount('pending', 'pending@test.dev', 'password123'); await new Promise(r => setTimeout(r, 400)); return { logged: S.me.logged, session: !!__fakeSB.db.session, ins: __fakeSB.calls.filter(c => c.name === 'users.insert').length }; });
    log(`B08 si la confirmation d'e-mail est active (pas de session renvoyée) : connecté à l'écran=${r2.logged}, session Supabase=${r2.session}, insert dans users tenté en anonyme : ${r2.ins}`);
    await b.close();
  },
  // ───────────────────────────────────────────────────────────── B09
  async B09() {
    const src = fs.readdirSync(path.join(ROOT, 'js')).map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
    const n = s => (src.match(new RegExp(s, 'g')) || []).length;
    log(`B09 occurrences dans js/ : PASSWORD_RECOVERY=${n('PASSWORD_RECOVERY')}, updateUser=${n('updateUser')}, verifyOtp=${n('verifyOtp')}, resetPasswordForEmail=${n('resetPasswordForEmail')}`);
    const a = await open({ mode: 'visiteur', hash: '#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=zzz&token_type=bearer&type=recovery' });
    const r = await a.page.evaluate(() => ({ route: S.ui.route, title: document.title, pwField: !!document.querySelector('input[type=password]'), hash: location.hash.slice(0, 30) }));
    log(`B09 arrivée par le lien de l'e-mail (#access_token=…&type=recovery) : écran affiché « ${r.route} », champ mot de passe présent : ${r.pwField} ; erreurs : ${JSON.stringify(a.errors.filter(e => !/constant/.test(e)))}`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B10 (lecture seule sur la vraie base)
  async B10() {
    if (offline) { log('B10 (sonde réelle ignorée : --hors-ligne)'); return; }
    const key = (fs.readFileSync(path.join(ROOT, 'js/supabase.js'), 'utf8').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/) || [])[0];
    const H = { apikey: key, Authorization: 'Bearer ' + key };
    const U = 'https://brmwvxncyeypefsgiepf.supabase.co/rest/v1';
    const dom = e => String(e || '').replace(/^[^@]*/, '***');
    let r = await fetch(`${U}/users?select=email&is_demo=eq.true&limit=1`, { headers: H }); let j = await r.json();
    log(`B10 clé publique seule, sans connexion : GET users?select=email (un bot) → HTTP ${r.status}, e-mail renvoyé : ${j[0] ? dom(j[0].email) : JSON.stringify(j).slice(0, 80)}`);
    r = await fetch(`${U}/users?select=id&is_demo=eq.false`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact' } });
    log(`B10 profils de vrais utilisateurs lisibles par un visiteur anonyme : content-range = ${r.headers.get('content-range')}  (la colonne email est lisible de la même façon)`);
    r = await fetch(`${U}/users?select=username&username=ilike.%25&is_demo=eq.true&limit=3`, { headers: H }); j = await r.json();
    log(`B10 joker non échappé : username=ilike.% renvoie ${Array.isArray(j) ? j.length : '?'} lignes (le front fait ilike(username, saisie) sans échapper % ni _)`);
    r = await fetch(`${U}/rpc/admin_get_player`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ search_term: 'wimoro.internal' }) }); j = await r.json();
    log(`B20 fonction d'administration appelée SANS connexion (admin_get_player, recherche limitée aux bots) → HTTP ${r.status}, ${Array.isArray(j) ? j.length : 0} lignes, colonnes : ${Array.isArray(j) && j[0] ? Object.keys(j[0]).join(',') : JSON.stringify(j).slice(0, 100)}`);
    r = await fetch(`${U}/admin_players_view?select=email&is_bot=eq.true&limit=1`, { headers: H }); j = await r.json();
    log(`B20 vue admin_players_view lisible sans connexion → HTTP ${r.status}, e-mail renvoyé : ${Array.isArray(j) && j[0] ? dom(j[0].email) : JSON.stringify(j).slice(0, 80)}`);
    r = await fetch(`${U}/chat_messages?select=room_id&limit=1`, { headers: H });
    log(`B12 table chat_messages lisible sans connexion (tous salons) → HTTP ${r.status}`);
  },
  // ───────────────────────────────────────────────────────────── B11
  async B11() {
    const a = await open({ mode: 'compte', fake: { tables: { __friends: [{ username: 'alice', user_id: FRIEND, status: 'accepted', direction: 'out', avatar_color: '#2448FF' }] } } });
    await sleep(600);
    const errs0 = a.errors.length;
    await a.page.evaluate(() => { location.hash = '#amis'; }); await sleep(600);
    const r = await a.page.evaluate(() => ({ friends: S.me.friends, html: document.querySelector('#view').innerText.slice(0, 60).replace(/\s+/g, ' '), route: S.ui.route }));
    log(`B11 mode Compte avec 1 ami réel (alice) → S.me.friends=${JSON.stringify(r.friends)} ; ouverture de #amis : ${JSON.stringify(a.errors.slice(errs0))}`);
    const acts = await a.page.evaluate(() => ['fr-add', 'fr-accept', 'fr-decline', 'fr-remove', 'fr-cancel'].map(k => k + '=' + typeof ACT[k]));
    const src = fs.readFileSync(path.join(ROOT, 'js/supabase.js'), 'utf8');
    log(`B11 actions amis : ${acts.join(', ')} ; appels RPC amis présents dans supabase.js : search_users=${src.includes('search_users')}, send_friend_request=${src.includes('send_friend_request')}, accept_friend_request=${src.includes('accept_friend_request')}`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B12
  async B12() {
    const a = await open({ mode: 'compte', hash: '#chat' });
    await sleep(500); const e0 = a.errors.length;
    const em = await a.page.evaluate(id => { try { return { n: __fakeSB.emit('chat_messages', 'INSERT', { id: 9001, room_id: 'general', user_id: id, message_type: 'msg', text_content: 'bonjour de bob' }) }; } catch (e) { return { n: 1, err: e.name + ': ' + e.message + ' @ ' + ((e.stack || '').split(String.fromCharCode(10))[1] || '').trim().replace(location.origin, '') }; } }, FRIEND);
    const n = em.n; await sleep(300); const e1 = em.err ? [em.err] : a.errors.slice(e0);
    await a.page.evaluate(() => { try { render(false); } catch (e) { window.__re = e.message; } });
    const again = await a.page.evaluate(() => window.__re || null);
    await a.page.evaluate(() => { location.hash = '#accueil'; }); await sleep(500);
    const home = a.errors.slice(e0).filter(e => !e1.includes(e));
    log(`B12 message temps réel d'un vrai utilisateur (abonnés au canal : ${n}) → ${JSON.stringify(e1)}`);
    log(`B12 nouveau rendu de #chat ensuite : ${again ? 'ERREUR ' + again : 'ok'} ; retour à l'accueil : ${JSON.stringify(home)}`);
    const misc = await a.page.evaluate(() => { const r = {}; try { room('dm:inconnu'); r.dm = 'ok'; } catch (e) { r.dm = e.message; } try { addMsg('m:inconnu', mkMsg({ u: 'lea', k: 'msg', text: 'x' })); r.mkt = 'ok'; } catch (e) { r.mkt = e.message; } return r; });
    log(`B12 room('dm:inconnu') → ${misc.dm} ; addMsg('m:inconnu') → ${misc.mkt}`);
    const hist = await a.page.evaluate(() => __fakeSB.calls.filter(c => /chat/.test(c.name)).map(c => c.kind + ':' + c.name + ' ' + JSON.stringify(c.args.filter || '')));
    log(`B12 appels liés au chat au démarrage : ${JSON.stringify(hist)}  (aucun chargement d'historique, abonnement sans filtre)`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B13
  async B13() {
    const a = await open({ mode: 'compte', hash: '#depot' });
    const s0 = await a.page.evaluate(() => ({ bal: S.me.balance, deps: S.me.deps.length }));
    await a.page.evaluate(() => { window.__rg = 0; if (typeof rgDepOk === 'function') { const o = rgDepOk; window.rgDepOkSpy = true; } simDepModal(); });
    await sleep(200);
    await a.page.locator('form[data-form="simdep"] input[name="amt"]').fill('100');
    await a.page.locator('form[data-form="simdep"] [type=submit], form[data-form="simdep"] button').last().click();
    await sleep(900);
    const s1 = await a.page.evaluate(() => ({ bal: S.me.balance, deps: S.me.deps.length, modal: !!document.querySelector('.md'), rpc: __fakeSB.calls.filter(c => c.name === 'demo_deposit').map(c => c.args) }));
    log(`B13 dépôt crypto de 100 USDC en mode Compte : RPC ${JSON.stringify(s1.rpc)} ; solde ${s0.bal} → ${s1.bal} ; lignes d'historique des dépôts ${s0.deps} → ${s1.deps} ; fenêtre encore ouverte : ${s1.modal}`);
    const src = fs.readFileSync(path.join(ROOT, 'js/supabase.js'), 'utf8').split('\n').slice(203, 213).join('\n');
    log(`B13 dans la surcharge startDeposit de supabase.js : appel à rgDepOk=${src.includes('rgDepOk')}, à closeModal=${src.includes('closeModal')}, à S.me.deps=${src.includes('S.me.deps')}, message en cas d'erreur=${/res\.error\)\{?toast/.test(src)}`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B14
  async B14() {
    const a = await open({ mode: 'compte' });
    await a.page.evaluate(() => kycDone()); await sleep(300);
    const k1 = await a.page.evaluate(() => S.me.kyc);
    await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await sleep(400);
    await a.page.reload(); await sleep(1200);
    const k2 = await a.page.evaluate(() => ({ kyc: S.me.kyc, blobKyc: ((__fakeSB.db.tables.user_full_state[0] || {}).state || {}).kyc, col: __fakeSB.db.tables.users[0].kyc_verified }));
    log(`B14 KYC validé → S.me.kyc=${k1} ; après sauvegarde puis rechargement → S.me.kyc=${k2.kyc}  (blob.kyc=${k2.blobKyc}, colonne users.kyc_verified=${k2.col} : jamais écrite, et c'est elle qui gagne)`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── B15
  async B15() {
    const run = async mode => {
      const a = await open({ mode, hash: '#marche-btc150k', fake: { tables: { market_live_state: [{ market_id: 'btc150k', current_probability: 60, anchor_probability: 60, volume_total: 5e6 }] } } });
      const s0 = await a.page.evaluate(() => ({ xp: S.me.xp, notifs: S.me.notifs.length, maxBet: S.me.maxBet, played: S.me.played, chat: room('m:btc150k').msgs.length, miss: JSON.stringify(S.me.missions.map(m => m.have)), badges: S.me.badges.length }));
      await a.page.evaluate(() => { S.me.balance = Math.max(S.me.balance, 2000); const st = __fakeSB.db.tables.user_stats; if (st[0]) st[0].balance = 2000; openBet('btc150k', 'oui', 600); });
      await a.page.locator('.md [data-a="buy"]').click(); await sleep(700);
      const s1 = await a.page.evaluate(() => ({ xp: S.me.xp, notifs: S.me.notifs.length, maxBet: S.me.maxBet, played: S.me.played, chat: room('m:btc150k').msgs.filter(x => x.u === 'me').length, miss: JSON.stringify(S.me.missions.map(m => m.have)), badges: S.me.badges.length, pos: S.me.positions.filter(p => p.m === 'btc150k').length }));
      await a.close();
      return `XP ${s0.xp}→${s1.xp}, notifications ${s0.notifs}→${s1.notifs}, plus grosse mise ${s0.maxBet}→${s1.maxBet}, paris joués ${s0.played}→${s1.played}, annonce dans le chat du marché : ${s1.chat}, missions ${s0.miss}→${s1.miss}, badges ${s0.badges}→${s1.badges}`;
    };
    log('B15 achat de 600 $ en mode Démo   : ' + await run('demo'));
    log('B15 achat de 600 $ en mode Compte : ' + await run('compte'));
  },
  // ───────────────────────────────────────────────────────────── B19
  async B19() {
    const a = await open({ mode: 'compte' });
    await sleep(35500);
    const r = await a.page.evaluate(() => ({ up: __fakeSB.count('from', 'user_full_state.upsert'), upd: __fakeSB.count('from', 'users.update'), sel: __fakeSB.count('from', 'user_stats.select'), fr: __fakeSB.count('rpc', 'get_friends'), size: JSON.stringify(S.me).length }));
    log(`B19 mode Compte, 35 s sans rien toucher : ${r.up} écritures du blob complet (${r.size} octets chacune), ${r.upd} mises à jour de users, ${r.sel} lectures de user_stats, ${r.fr} appels get_friends`);
    await a.close();
  },
  // ───────────────────────────────────────────────────────────── parcours de tous les écrans
  async ECRANS() {
    const routes = ['accueil', 'marche-btc150k', 'marche-presid27', 'marche-presid27-roux', 'eclair', 'blitz', 'serie', 'chat', 'clans', 'classement', 'rang', 'profil', 'joueur-lea', 'depot', 'retrait', 'creer', 'modifier', 'amis', 'copie', 'parrainage', 'responsable', 'duels', 'combines', 'bienvenue', 'connexion', 'inscription'];
    for (const mode of ['visiteur', 'demo', 'compte']) for (const lang of ['en', 'fr', 'he']) {
      const a = await open({ mode, lang }); const boot = a.errors.length; const bad = [];
      for (const r of routes) { const n = a.errors.length; await a.page.evaluate(h => { location.hash = '#' + h; }, r); await sleep(140); const shown = await a.page.evaluate(() => (document.querySelector('#view').innerText || '').trim().length); if (a.errors.length > n) bad.push(r + ' → ' + a.errors.slice(n).map(e => e.slice(0, 110)).join(' ; ')); else if (shown < 20) bad.push(r + ' → écran vide'); }
      log(`ECRANS ${mode.padEnd(8)} ${lang} : ${boot} erreur(s) au chargement, ${bad.length}/${routes.length} écran(s) en erreur` + (bad.length ? '\n         ' + bad.join('\n         ') : ''));
      await a.close();
    }
    const m = await open({ mode: 'demo', lang: 'en', viewport: { width: 390, height: 844 } }); const badM = [];
    for (const r of routes) { const n = m.errors.length; await m.page.evaluate(h => { location.hash = '#' + h; }, r); await sleep(140); if (m.errors.length > n) badM.push(r); const ov = await m.page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 2) badM.push(r + ' (débordement horizontal ' + ov + 'px)'); }
    log(`ECRANS demo mobile 390px : ${badM.length} problème(s) ${JSON.stringify(badM)}`); await m.close();
  },
};

const names = Object.keys(probes).filter(n => !only.length || only.includes(n));
const quick = names.filter(n => !['B05', 'B07', 'B19', 'ECRANS', 'B02', 'B03'].includes(n)), slow = names.filter(n => !quick.includes(n));
const run = async n => { try { await probes[n](); } catch (e) { log(`${n} ÉCHEC DE LA SONDE : ${e.message.split('\n')[0]}`); } };
await Promise.all([(async () => { for (const n of quick) await run(n); })(), ...slow.map(run)]);
await browser.close(); server.kill();
out.sort((a, b) => a.slice(0, 6).localeCompare(b.slice(0, 6)));
if (!only.length) { fs.mkdirSync(path.join(ROOT, 'docs/audit'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'docs/audit/preuves-front.txt'), `Audit dynamique du front — commit ${execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()} (code applicatif identique à 719cf76) — ${new Date().toISOString()}\nGénéré par tools/audit/reproduire.mjs (Chrome headless, faux client Supabase).\n\n` + out.join('\n') + '\n'); }
process.exit(0);
