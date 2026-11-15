// Inventaire statique du front : toutes les actions (ACT), formulaires (FORMS) et écrans (VIEWS),
// avec les données qu'ils modifient (directement ou par les fonctions qu'ils appellent).
// Analyse le code avec acorn : rien n'est exécuté. Sortie : docs/audit/inventaire-front.md (+ .json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script[^>]* src="js\/([^"?]+)/g)].map(m => m[1]).filter(f => !/^i18n-\d/.test(f));
const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');

const G = {};            // nom global → [{file,line,node}] (toutes les définitions, enveloppes comprises)
const H = { ACT: {}, FORMS: {}, VIEWS: {} };   // gestionnaires : clé → [{file,line,node}]
const timers = [], lsKeys = {}, sbCalls = [], usersAccess = {};
const asts = {};
const keyName = k => (k.type === 'Identifier' ? k.name : String(k.value));
const addG = (name, file, node) => (G[name] ||= []).push({ file, line: node.loc.start.line, node });
const addH = (reg, key, file, node, line) => (H[reg][key] ||= []).push({ file, line: line || node.loc.start.line, node });

for (const f of order) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  const ast = asts[f] = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  usersAccess[f] = (src.match(/\bUSERS\[/g) || []).length;
  walk.ancestor(ast, {
    FunctionDeclaration(n) { addG(n.id.name, f, n); },
    VariableDeclarator(n, _s, anc) {
      if (n.id.type !== 'Identifier' || !n.init) return;
      const depth = anc.filter(a => isFn(a)).length;
      if (isFn(n.init) && depth === 0) addG(n.id.name, f, n.init);
      if (n.init.type === 'ObjectExpression' && H[n.id.name]) for (const p of n.init.properties) if (p.type === 'Property') addH(n.id.name, keyName(p.key), f, p.value, p.loc.start.line);
    },
    AssignmentExpression(n) {
      const L = n.left;
      // enveloppes : x = function…   /   window.x = function…
      if (isFn(n.right)) {
        if (L.type === 'Identifier') addG(L.name, f, n.right);
        else if (L.type === 'MemberExpression' && L.object.type === 'Identifier' && L.object.name === 'window' && !L.computed) addG(L.property.name, f, n.right);
      }
      // ACT.x = … / ACT['x'] = … / FORMS.x = …
      if (L.type === 'MemberExpression' && L.object.type === 'Identifier' && H[L.object.name]) addH(L.object.name, L.computed ? String(L.property.value) : L.property.name, f, n.right, n.loc.start.line);
    },
    CallExpression(n) {
      const c = n.callee;
      // Object.assign(ACT, {...})
      if (c.type === 'MemberExpression' && c.object.name === 'Object' && c.property.name === 'assign' && n.arguments[0] && n.arguments[0].type === 'Identifier' && H[n.arguments[0].name])
        for (const o of n.arguments.slice(1)) if (o.type === 'ObjectExpression') for (const p of o.properties) if (p.type === 'Property') addH(n.arguments[0].name, keyName(p.key), f, p.value, p.loc.start.line);
      if (c.type === 'Identifier' && (c.name === 'setInterval' || c.name === 'setTimeout')) {
        const d = n.arguments[1]; const what = src.slice(n.arguments[0].start, Math.min(n.arguments[0].end, n.arguments[0].start + 90)).replace(/\s+/g, ' ');
        timers.push({ kind: c.name, file: f, line: n.loc.start.line, ms: d ? src.slice(d.start, d.end) : '0', what });
      }
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'LS' && ['s', 'g', 'r'].includes(c.property.name) && n.arguments[0]) {
        const a = n.arguments[0]; const k = a.type === 'Literal' ? a.value : a.type === 'Identifier' ? '<' + a.name + '>' : src.slice(a.start, a.end); (lsKeys[k] ||= new Set()).add(f);
      }
      if (c.type === 'MemberExpression' && c.object.type === 'MemberExpression' && c.object.object.name === 'localStorage') { /* accès directs comptés à part */ }
      // appels Supabase : sb.rpc('x') / sb.from('t') / sb.auth.x() / sb.channel('c')
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'sb') sbCalls.push({ file: f, line: n.loc.start.line, call: c.property.name + '(' + (n.arguments[0] && n.arguments[0].type === 'Literal' ? "'" + n.arguments[0].value + "'" : '') + ')' });
      if (c.type === 'MemberExpression' && c.object.type === 'MemberExpression' && c.object.object.name === 'sb' && c.object.property.name === 'auth') sbCalls.push({ file: f, line: n.loc.start.line, call: 'auth.' + c.property.name + '()' });
    },
  });
}
const KNOWN = new Set(Object.keys(G));

// ── Effets directs d'une fonction ────────────────────────────────────────────────────────────────
const chain = n => { const p = []; while (n && n.type === 'MemberExpression') { p.unshift(n.computed ? (n.property.type === 'Literal' ? String(n.property.value) : '[]') : n.property.name); n = n.object; } return n && n.type === 'Identifier' ? [n.name, ...p] : n && n.type === 'CallExpression' && n.callee.type === 'Identifier' ? [n.callee.name + '()', ...p] : null; };
const MUT = new Set(['push', 'unshift', 'splice', 'pop', 'shift', 'sort', 'reverse', 'fill']);
const MKT = new Set(['p', 'vol', 'anchor', 'liq', 'people']);
function facts(fnNode) {
  const r = { calls: new Set(), me: new Set(), market: false, users: false, rooms: false, flash: false, net: false };
  const alias = {}; // variable locale → chemin dans S.me ('' = S.me lui-même)
  const mePath = c => { if (!c) return null; if (c[0] === 'S' && c[1] === 'me') return c.slice(2); if (c[0] in alias) return [...(alias[c[0]] ? [alias[c[0]]] : []), ...c.slice(1)]; return null; };
  const write = target => {
    const c = chain(target); if (!c) return;
    const mp = mePath(c); if (mp) { r.me.add(mp[0] || '(objet entier)'); return; }
    if (c[0] === 'USERS' || c[0] === 'userOf()') r.users = true;
    if (c[0] === 'S' && c[1] === 'rooms') r.rooms = true;
    if (c[0] === 'G()' || (c[0] === 'S' && c[1] === 'flash')) r.flash = true;
    if (c.length === 2 && MKT.has(c[1]) && c[0] !== 'S' && c[0] !== 'st') r.market = true;
    if (c[0] === 'MK' && c.length >= 3 && MKT.has(c[c.length - 1])) r.market = true;
  };
  walk.simple(fnNode.type === 'FunctionDeclaration' || isFn(fnNode) ? fnNode.body : fnNode, {
    VariableDeclarator(n) { if (n.id.type === 'Identifier' && n.init) { const c = chain(n.init); if (c && c[0] === 'S' && c[1] === 'me') alias[n.id.name] = c[2] || ''; } },
    AssignmentExpression(n) { write(n.left); if (n.left.type === 'MemberExpression' && chain(n.left) && chain(n.left).join('.') === 'S.me') r.me.add('(objet entier)'); },
    UpdateExpression(n) { write(n.argument); },
    UnaryExpression(n) { if (n.operator === 'delete') write(n.argument); },
    CallExpression(n) {
      const c = n.callee;
      if (c.type === 'MemberExpression' && !c.computed && MUT.has(c.property.name)) write(c.object);
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'sb') r.net = true;
    },
    Identifier(n) { if (KNOWN.has(n.name)) r.calls.add(n.name); },
  });
  return r;
}
const FACTS = {};
for (const [name, defs] of Object.entries(G)) { const agg = { calls: new Set(), me: new Set(), market: false, users: false, rooms: false, flash: false, net: false }; for (const d of defs) { const x = facts(d.node); x.calls.forEach(c => agg.calls.add(c)); x.me.forEach(c => agg.me.add(c)); for (const k of ['market', 'users', 'rooms', 'flash', 'net']) agg[k] ||= x[k]; } agg.calls.delete(name); FACTS[name] = agg; }

// ── Fermeture transitive (on ne traverse pas le rendu générique) ─────────────────────────────────
const STOP = new Set(['render', 'route', 'updateHeader', 'updateBell', 'refreshLive', 'updateFlash', 'updateFlashStatic', 'rerenderTicket', 'updTicket', 'updNums', 'refreshRankBits', 'refreshCharts', 'fixText', 'mountTrails', 'openModal', 'closeModal', 'toast', 'floatXP', 'confetti', 'i18nStatic', 'postRender', 'flashTick', 'duelTick', 'bzTick', 'serieTick', 'ordersTick', 'rgTick', 'clanWarTick', 'voteTick', 'catchUpVotes', 'pushBig', 'refreshMine', 'refreshFriends', 'refreshDeps', 'copyRefresh', 'ordersRefresh', 'bzRefresh', 'serieRefresh', 'proRefresh', 'proDraw', 'logout', 'resetDemo', 'enterAccount', 'leaveAccount', 'bootAuth', 'welcome', 'rankUp', 'needLogin', 'lockModal']);
const isView = n => /^v[A-Z]/.test(n) || /H$/.test(n) || /Modal(H|Open|Refresh)?$/.test(n);
function closure(start) {
  const out = { me: new Set(start.me), market: start.market, users: start.users, rooms: start.rooms, flash: start.flash, net: start.net, via: {} };
  const seen = new Set(), todo = [...start.calls].map(c => [c, c]);
  while (todo.length) {
    const [n, root] = todo.pop(); if (seen.has(n) || STOP.has(n) || isView(n)) continue; seen.add(n);
    const f = FACTS[n]; if (!f) continue;
    f.me.forEach(p => { if (!out.me.has(p)) { out.me.add(p); out.via[p] = n; } });
    for (const k of ['market', 'users', 'rooms', 'flash', 'net']) if (f[k] && !out[k]) { out[k] = true; out.via[k] = n; }
    if (n === 'gainXP') out.me.add('xp');
    if (n === 'addMsg') out.rooms = true;
    f.calls.forEach(c => todo.push([c, root]));
  }
  out.reach = seen; return out;
}

// ── Classement de chaque gestionnaire ────────────────────────────────────────────────────────────
const SERVER = { 'ACT.buy': 'place_bet', 'ACT.sell': 'sell_position', 'ACT.flash-bet': 'flash_bet', 'FORMS.simdep': 'demo_deposit' }; // seuls chemins branchés au back dans 719cf76
const STATS = new Set(['balance', 'xp', 'played', 'wins', 'settled', 'deposits', 'flashWins', 'followed', 'realized', 'streak', 'bestStreak', 'copiers', 'msgsTotal']); // champs écrasés toutes les 15 s par sbRefresh
const rows = [];
for (const reg of ['ACT', 'FORMS', 'VIEWS']) for (const [key, defs] of Object.entries(H[reg])) {
  const last = defs[defs.length - 1];
  const f0 = facts(last.node.type === 'Identifier' ? { type: 'ExpressionStatement', expression: last.node } : last.node);
  if (last.node.type === 'Identifier' && KNOWN.has(last.node.name)) f0.calls.add(last.node.name);
  const c = closure(f0);
  const me = [...c.me].sort();
  const money = me.includes('balance'), xp = me.includes('xp'), over = me.filter(p => STATS.has(p)), blob = me.filter(p => !STATS.has(p));
  const shared = [c.market && 'prix/volume des marchés', c.rooms && 'messages de chat', c.users && 'fiches joueurs', c.flash && 'état éclair'].filter(Boolean);
  let compte;
  const id = reg + '.' + key;
  if (reg === 'VIEWS') compte = 'affichage';
  else if (SERVER[id]) compte = `RPC ${SERVER[id]} (partiel)`;
  else if (money || xp) compte = 'ANNULÉ en 15 s max (B05)';
  else if (over.length) compte = 'ANNULÉ en 15 s max (B05)';
  else if (blob.length) compte = 'blob JSON toutes les 17 s (fragile : B06, B07)';
  else if (shared.length) compte = 'local à ce navigateur, non partagé';
  else compte = 'interface seule';
  rows.push({ reg, key, file: last.file, line: last.line, redef: defs.length > 1 ? defs.slice(0, -1).map(d => d.file + ':' + d.line) : [], me, money, xp, shared, compte, net: c.net });
}

// ── Sorties ──────────────────────────────────────────────────────────────────────────────────────
const md = [];
const count = (reg, pred) => rows.filter(r => r.reg === reg && (!pred || pred(r))).length;
md.push('# Inventaire statique du front', '', `Généré par \`tools/audit/inventaire.mjs\` (analyse du code avec acorn, rien n'est exécuté) — code applicatif du commit 719cf76.`, '',
  `- **${Object.keys(G).length}** fonctions globales dans ${order.length} fichiers (hors catalogues de traduction) ; **${Object.values(G).filter(d => d.length > 1).length}** sont définies plusieurs fois (enveloppes).`,
  `- **${count('ACT')}** actions \`ACT\`, **${count('FORMS')}** formulaires \`FORMS\`, **${count('VIEWS')}** écrans \`VIEWS\`.`,
  `- Actions/formulaires qui touchent au **solde** : ${rows.filter(r => r.reg !== 'VIEWS' && r.money).length} ; à l'**XP** : ${rows.filter(r => r.reg !== 'VIEWS' && r.xp).length}.`,
  `- Branchés au back : ${Object.keys(SERVER).length}. Annulés par la relecture périodique (B05) : ${rows.filter(r => r.compte.startsWith('ANNULÉ')).length}. Dépendants du blob : ${rows.filter(r => r.compte.startsWith('blob')).length}. Purement locaux : ${rows.filter(r => r.compte.startsWith('local')).length}. Interface seule : ${rows.filter(r => r.compte === 'interface seule').length}.`, '');
md.push('## Fonctions redéfinies (couches empilées dans l\'ordre de chargement)', '', '| Fonction | Définitions successives |', '|---|---|');
for (const [n, d] of Object.entries(G).filter(([, d]) => d.length > 1).sort()) md.push(`| \`${n}\` | ${d.map(x => `${x.file}:${x.line}`).join(' → ')} |`);
md.push('', '## Écritures directes du solde et appels à gainXP, par fichier', '', '| Fichier | `S.me.balance` modifié dans | `gainXP()` appelé dans | accès `USERS[…]` |', '|---|---|---|---|');
let tb = 0, tx = 0, tu = 0;
for (const f of order) {
  const bal = [], xp = [];
  for (const [n, defs] of Object.entries(G)) for (const d of defs) if (d.file === f) { const x = facts(d.node); if (x.me.has('balance')) bal.push(n); if (x.calls.has('gainXP')) xp.push(n); }
  for (const reg of ['ACT', 'FORMS']) for (const [k, defs] of Object.entries(H[reg])) for (const d of defs) if (d.file === f && isFn(d.node)) { const x = facts(d.node); if (x.me.has('balance')) bal.push(reg + '.' + k); if (x.calls.has('gainXP')) xp.push(reg + '.' + k); }
  tb += bal.length; tx += xp.length; tu += usersAccess[f];
  if (bal.length || xp.length || usersAccess[f]) md.push(`| ${f} | ${bal.length ? bal.length + ' : ' + bal.join(', ') : '—'} | ${xp.length ? xp.length + ' : ' + xp.join(', ') : '—'} | ${usersAccess[f] || '—'} |`);
}
md.push(`| **Total** | **${tb}** fonctions | **${tx}** fonctions | **${tu}** |`);
const tbl = (reg, title, cols) => {
  md.push('', `## ${title}`, '', '| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|');
  for (const r of rows.filter(r => r.reg === reg).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line))
    md.push(`| \`${r.key}\` | ${r.file}:${r.line}${r.redef.length ? ' (remplace ' + r.redef.join(', ') + ')' : ''} | ${r.me.length ? r.me.join(', ') : '—'} | ${r.shared.join(', ') || '—'} | ${reg === 'VIEWS' ? '—' : 'localStorage (compte du navigateur)'} | ${r.compte} |`);
};
tbl('ACT', `Actions (${count('ACT')})`, ['Action', 'Où', 'Champs de `S.me` modifiés', 'État partagé modifié', 'Persistance en mode Démo', 'Persistance en mode Compte (état actuel)']);
tbl('FORMS', `Formulaires (${count('FORMS')})`, ['Formulaire', 'Où', 'Champs de `S.me` modifiés', 'État partagé modifié', 'Persistance en mode Démo', 'Persistance en mode Compte (état actuel)']);
tbl('VIEWS', `Écrans (${count('VIEWS')})`, ['Écran', 'Où', 'Champs de `S.me` modifiés au rendu', 'État partagé modifié', '—', '—']);
md.push('', `## Minuteurs (${timers.filter(t => t.kind === 'setInterval').length} setInterval, ${timers.filter(t => t.kind === 'setTimeout').length} setTimeout)`, '', '| Type | Où | Délai | Ce qui est lancé |', '|---|---|---|---|');
for (const t of timers.filter(t => t.kind === 'setInterval')) md.push(`| ${t.kind} | ${t.file}:${t.line} | ${t.ms} | \`${t.what.replace(/\|/g, '\\|')}\` |`);
md.push('', '## Clés localStorage (via `LS`)', '', '| Clé | Fichiers |', '|---|---|');
for (const [k, s] of Object.entries(lsKeys).sort()) md.push(`| \`${k}\` | ${[...s].join(', ')} |`);
md.push('', '## Appels au client Supabase', '', '| Où | Appel |', '|---|---|');
for (const c of sbCalls) md.push(`| ${c.file}:${c.line} | \`sb.${c.call}\` |`);
fs.mkdirSync(path.join(ROOT, 'docs/audit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/audit/inventaire-front.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'docs/audit/inventaire-front.json'), JSON.stringify({ rows, timers, sbCalls, wrappers: Object.fromEntries(Object.entries(G).filter(([, d]) => d.length > 1).map(([n, d]) => [n, d.map(x => x.file + ':' + x.line)])) }, null, 1));
console.log(md.slice(2, 8).join('\n'));
console.log('\nFonctions redéfinies : ' + Object.entries(G).filter(([, d]) => d.length > 1).map(([n, d]) => `${n} (${d.map(x => x.file.replace('.js', '')).join('→')})`).join(', '));
console.log(`\nÉcritures directes du solde : ${tb} fonctions ; gainXP : ${tx} fonctions ; accès USERS[ : ${tu}`);
const by = {}; rows.filter(r => r.reg !== 'VIEWS').forEach(r => (by[r.compte] ||= []).push(r.key)); for (const [k, v] of Object.entries(by)) console.log(`\n[${k}] ${v.length} : ${v.join(' ')}`);
