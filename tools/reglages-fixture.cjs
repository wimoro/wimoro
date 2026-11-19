// Recopie les réglages du serveur (wm.reglages), tels que les migrations les créent, dans tests/fixtures/reglages.json :
// le faux serveur des tests du panneau d'administration les sert à l'identique (nom, phrase, type, valeur, défaut, bornes,
// public, appliqué, action dédiée). À relancer après une migration qui ajoute ou change un réglage :
//   node tools/reglages-fixture.cjs
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const MIG = path.join(RACINE, 'supabase', 'migrations');
const lire = f => fs.readFileSync(path.join(MIG, f), 'utf8');
const fichier = motif => { const f = fs.readdirSync(MIG).find(x => x.includes(motif)); if (!f) throw new Error('migration introuvable : ' + motif); return f; };

/* un n-uplet SQL : chaînes entre apostrophes (apostrophe doublée), nombres, null, true, false */
function nuplets(sql) {
  const L = []; let i = 0;
  while ((i = sql.indexOf('(\'', i)) >= 0) {
    const v = []; let j = i + 1, cur = '', dansChaine = false, chaine = false;
    for (; j < sql.length; j++) {
      const c = sql[j];
      if (dansChaine) { if (c === "'" && sql[j + 1] === "'") { cur += "'"; j++; } else if (c === "'") { dansChaine = false; } else cur += c; continue; }
      if (c === "'") { dansChaine = true; chaine = true; cur = ''; continue; }
      if (c === ',' || c === ')') { const t = cur.trim(); v.push(chaine ? cur : t === 'null' ? null : t === 'true' ? true : t === 'false' ? false : Number(t)); cur = ''; chaine = false; if (c === ')') break; continue; }
      cur += c;
    }
    L.push(v); i = j;
  }
  return L;
}

const sql = lire(fichier('_equipe_reglages_journal.sql'));
const debut = sql.indexOf('from (values'), fin = sql.indexOf(') as x(cle, categorie');
const reglages = nuplets(sql.slice(debut, fin)).map(([cle, categorie, libelle, explication, type, v, min, max, facultatif, pub, applique, dedie, ordre]) => {
  const valeur = JSON.parse(v);
  return { cle, categorie, libelle, explication, type, valeur, defaut: valeur, min, max, facultatif, public: pub, applique, dedie, ordre, maj_at: null, maj_par: null };
});
/* lot 3 : les prix du Blitz restent « pas encore appliqués » (l'Edge Function « eclair » envoie ses propres montants) */
const base = lire(fichier('_reglages_frais_base.sql'));
const m = base.match(/update wm\.reglages\s+set applique = false,\s+explication = explication \|\| '((?:[^']|'')*)'\s+where cle in \(([^)]*)\)/);
if (!m) throw new Error('mise à jour des réglages du Blitz introuvable');
const ajout = m[1].replace(/''/g, "'"), cles = m[2].match(/'[^']+'/g).map(s => s.slice(1, -1));
for (const r of reglages) if (cles.includes(r.cle)) { r.applique = false; r.explication += ajout; }

reglages.sort((a, b) => a.categorie.localeCompare(b.categorie) || a.ordre - b.ordre || a.cle.localeCompare(b.cle));
const sortie = path.join(RACINE, 'tests', 'fixtures', 'reglages.json');
fs.writeFileSync(sortie, JSON.stringify(reglages, null, 1) + '\n');
console.log(`${reglages.length} réglages écrits dans ${path.relative(RACINE, sortie)} (${reglages.filter(r => r.applique).length} appliqués).`);
