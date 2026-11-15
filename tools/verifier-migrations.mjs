// Vérifie que les fichiers de supabase/migrations/ sont exactement ce qui a été appliqué en base.
//
// 1. Lancer cette requête sur la base (lecture seule) :
//      select version, name, md5(array_to_string(statements, '')) as md5
//      from supabase_migrations.schema_migrations order by version;
// 2. Coller son résultat JSON dans un fichier, puis :  node tools/verifier-migrations.mjs resultat.json
//    Sans argument, le script affiche seulement l'empreinte de chaque fichier local.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const local = {};
for (const f of fs.readdirSync(DIR).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort()) {
  // L'outil d'application garde ou non le saut de ligne final selon le cas : les deux empreintes sont acceptées.
  const brut = fs.readFileSync(path.join(DIR, f), 'utf8'), s = brut.replace(/\n+$/, '');
  const h = x => crypto.createHash('md5').update(x).digest('hex');
  local[f.slice(0, 14)] = { fichier: f, md5: h(s), brut: h(brut) };
}
if (!process.argv[2]) { for (const [v, x] of Object.entries(local)) console.log(v, x.md5, x.fichier); process.exit(0); }
const distant = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let ecarts = 0;
for (const m of distant.filter(m => m.version >= '20261114234523')) {
  const l = local[m.version];
  const ok = l && (l.md5 === m.md5 || l.brut === m.md5);
  if (!ok) ecarts++;
  console.log(`${ok ? 'OK   ' : 'ÉCART'} ${m.version}_${m.name}${l ? '' : ' (fichier absent du dépôt)'}`);
}
for (const [v, x] of Object.entries(local)) if (!distant.some(m => m.version === v)) console.log(`À APPLIQUER ${x.fichier} (pas encore en base)`);
process.exit(ecarts ? 1 : 0);
