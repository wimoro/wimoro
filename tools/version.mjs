// Anti-cache : chaque fichier CSS ou JS référencé par index.html porte l'empreinte de son contenu (?v=xxxxxxxx).
// Un fichier modifié change d'adresse : le navigateur ne peut plus servir une ancienne version depuis son cache,
// et tous les visiteurs reçoivent un jeu de fichiers cohérent après une mise en ligne (GitHub Pages garde 10 minutes).
//
//   node tools/version.mjs             met index.html à jour
//   node tools/version.mjs --verifier  échoue si index.html n'est pas à jour (utilisé par l'intégration continue)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifier = process.argv.includes('--verifier');
const empreinte = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 8);

const avant = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let n = 0;
const apres = avant.replace(/(<(?:script src|link rel="stylesheet" href)=")((?:js|css)\/[A-Za-z0-9._\/-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")/g, (tout, debut, fichier, fin) => {
  if (!fs.existsSync(path.join(ROOT, fichier))) throw new Error('fichier référencé introuvable : ' + fichier);
  n++; return `${debut}${fichier}?v=${empreinte(fichier)}${fin}`;
});
if (n < 20) throw new Error(`seulement ${n} fichiers trouvés dans index.html : le motif ne correspond plus`);
if (apres === avant) { console.log(`index.html est à jour (${n} fichiers versionnés).`); process.exit(0); }
if (verifier) { console.error('index.html n’est pas à jour : lance « node tools/version.mjs » puis enregistre le résultat.'); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'index.html'), apres);
console.log(`index.html mis à jour (${n} fichiers versionnés).`);
