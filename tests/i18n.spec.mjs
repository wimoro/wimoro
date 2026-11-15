// Traductions : tout texte passé à _t() existe en anglais et en hébreu (le français est la langue source).
// Couvre B18 (textes en dur) : plus aucune chaîne française hors catalogue dans le code relié au serveur.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { ouvrir, lire } from './helpers/app.mjs';

const FICHIERS = fs.readdirSync('js').filter(f => f.endsWith('.js') && !/^i18n-\d/.test(f));
const norm = k => k.replace(/[  ]/g, ' ');

function cles() {
  const out = new Map();                                                    // clé → premier endroit où elle est utilisée
  for (const f of FICHIERS) {
    const ast = acorn.parse(fs.readFileSync('js/' + f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script', locations: true });
    walk.simple(ast, { CallExpression(n) {
      if (n.callee.type !== 'Identifier' || !/^_tc?$/.test(n.callee.name) || !n.arguments[0]) return;
      const a = n.arguments[0];
      const k = a.type === 'Literal' && typeof a.value === 'string' ? a.value : a.type === 'TemplateLiteral' && a.expressions.length === 0 ? a.quasis[0].value.cooked : null;
      if (k !== null && !out.has(norm(k))) out.set(norm(k), `${f}:${n.loc.start.line}`);
    } });
  }
  return out;
}

test('chaque texte du code a sa traduction anglaise et hébraïque', async ({ page }) => {
  await ouvrir(page, { mode: 'visiteur' });
  const cat = await lire(page, () => ({ en: Object.keys(I18N.en), he: Object.keys(I18N.he) }));
  const en = new Set(cat.en), he = new Set(cat.he), K = cles();
  expect(K.size).toBeGreaterThan(2500);
  const manque = lang => [...K].filter(([k]) => !(lang === 'en' ? en : he).has(k)).map(([k, ou]) => `${ou} « ${k.slice(0, 70)} »`);
  expect(manque('en'), 'textes sans traduction anglaise').toEqual([]);
  expect(manque('he'), 'textes sans traduction hébraïque').toEqual([]);
});

test('B18 · aucun texte français en dur dans le code relié au serveur', async () => {
  // dans api.js et serveur.js, toute chaîne contenant un mot français accentué ou une phrase passe par _t()
  for (const f of ['api.js', 'serveur.js', 'boot.js']) {
    const src = fs.readFileSync('js/' + f, 'utf8'), ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
    const fautes = [];
    walk.ancestor(ast, { Literal(n, _s, anc) {
      if (typeof n.value !== 'string' || !/[àâçéèêëîïôùûü’]| [a-zà-ü]{3,} [a-zà-ü]{3,} /i.test(n.value)) return;
      const parent = anc[anc.length - 2];
      const traduit = parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && /^(_tc?|planifier)$/.test(parent.callee.name);
      const journal = anc.some(a => a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && a.callee.object.name === 'console');
      const listeDeNoms = /^[a-z0-9 -]+$/.test(n.value) && /-/.test(n.value);              // « buy sell flash-bet … » : noms d'actions
      const technique = listeDeNoms || /^(js\/|https?:|[a-z_]+$|#[a-z-]+$)/.test(n.value) || /[<>=]|sb-|api_/.test(n.value);
      if (!traduit && !journal && !technique) fautes.push(`${f}:${n.loc.start.line} « ${n.value.slice(0, 60)} »`);
    } });
    expect(fautes, f).toEqual([]);
  }
});
