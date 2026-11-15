// Anti-cache : chaque fichier CSS ou JS référencé par une page (index.html, admin.html) porte l'empreinte de son contenu
// (?v=xxxxxxxx). Un fichier modifié change d'adresse : le navigateur ne peut plus servir une ancienne version depuis son
// cache, et tous les visiteurs reçoivent un jeu de fichiers cohérent après une mise en ligne (GitHub Pages garde 10 minutes).
//
//   node tools/version.mjs             met les pages à jour
//   node tools/version.mjs --verifier  échoue si une page n'est pas à jour (utilisé par l'intégration continue)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifier = process.argv.includes('--verifier');
const empreinte = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 8);
const PAGES = [['index.html', 20], ['admin.html', 2]];        // page, nombre minimal de fichiers attendus

let aJour = true;
for (const [page, minimum] of PAGES) {
  const avant = fs.readFileSync(path.join(ROOT, page), 'utf8');
  let n = 0;
  const apres = avant.replace(/(<(?:script src|link rel="stylesheet" href)=")((?:js|css)\/[A-Za-z0-9._\/-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")/g, (tout, debut, fichier, fin) => {
    if (!fs.existsSync(path.join(ROOT, fichier))) throw new Error('fichier référencé introuvable : ' + fichier);
    n++; return `${debut}${fichier}?v=${empreinte(fichier)}${fin}`;
  });
  if (n < minimum) throw new Error(`seulement ${n} fichiers trouvés dans ${page} : le motif ne correspond plus`);
  if (apres === avant) { console.log(`${page} est à jour (${n} fichiers versionnés).`); continue; }
  aJour = false;
  if (verifier) { console.error(`${page} n’est pas à jour : lance « node tools/version.mjs » puis enregistre le résultat.`); continue; }
  fs.writeFileSync(path.join(ROOT, page), apres);
  console.log(`${page} mis à jour (${n} fichiers versionnés).`);
}
if (verifier && !aJour) process.exit(1);
