// Inventaire du back à partir du catalogue exporté (voir supabase/tools/export_catalogue.sql).
// Usage : node tools/audit/inventaire-back.mjs <catalogue.json>   → docs/audit/inventaire-back.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.round(n / 1024) + ' Ko');
const C = { r: 'lecture', a: 'ajout', w: 'modification', d: 'suppression', '*': 'tout' };
const md = [];
md.push('# Inventaire du back Supabase', '', `Généré par \`tools/audit/inventaire-back.mjs\` à partir du catalogue Postgres exporté le ${String(d.generated_at).slice(0, 16).replace('T', ' ')} UTC (Postgres ${d.server_version}, base de ${kb(d.db_bytes)}).`, '');
md.push(`- ${d.tables.length} tables, ${d.tables.reduce((n, t) => n + (t.policies || []).length, 0)} policies RLS, ${d.functions.length} fonctions, ${(d.views || []).length} vue, ${(d.cron_jobs || []).length} tâches cron.`,
  `- Comptes d'authentification : ${d.auth_counts.users} (tous confirmés). Stockage de fichiers : ${d.storage_objects} objet. Extensions : ${d.extensions.map(e => e.name).join(', ')}.`, '');
md.push('## Tables', '', '| Table | Lignes (estim.) | Taille | RLS | Qui peut faire quoi (policies) | Triggers |', '|---|---:|---:|---|---|---|');
for (const t of [...d.tables].sort((a, b) => b.total_bytes - a.total_bytes)) {
  const pol = (t.policies || []).map(p => `**${C[p.cmd]}** : ${p.using != null ? '`' + p.using.replace(/\s+/g, ' ').replace(/\|/g, '\|') + '`' : ''}${p.check != null ? ' (contrôle `' + p.check.replace(/\s+/g, ' ').replace(/\|/g, '\|') + '`)' : ''}`).join('<br>') || '_aucune : accès par fonctions uniquement_';
  md.push(`| \`${t.name}\` | ${t.est_rows ?? '?'} | ${kb(t.total_bytes)} | ${t.rls ? 'oui' : '**NON**'} | ${pol} | ${(t.triggers || []).map(g => g.name).join(', ') || '—'} |`);
}
md.push('', 'Toutes les tables accordent tous les droits SQL aux rôles `anon` et `authenticated` (réglage par défaut de Supabase) : seule la RLS filtre.', '');
md.push('## Fonctions', '', '| Fonction | Renvoie | Mode | search_path | Exécutable par | Contrôle `auth.uid()` | Taille |', '|---|---|---|---|---|---|---:|');
for (const f of d.functions) {
  const sp = (f.config || []).find(c => c.startsWith('search_path'));
  const who = f.acl_null ? 'tout le monde (défaut)' : (f.grants || []).filter(g => g !== 'postgres' && g !== 'service_role').map(g => (g === 'PUBLIC' ? 'public' : g)).join(', ') || 'personne';
  const body = f.def || '';
  const chk = /auth\.uid\(\)\s+IS\s+NULL|v_uid\s+IS\s+NULL|v_user_id\s+IS\s+NULL/i.test(body) ? 'oui (refuse l\'anonyme)' : /auth\.uid\(\)/.test(body) ? 'utilise auth.uid() sans refuser l\'anonyme' : '**aucun**';
  md.push(`| \`${f.name}(${f.identity_args.replace(/\s+/g, ' ')})\` | ${f.result.replace(/\s+/g, ' ').replace(/\|/g, '\|').slice(0, 60)}${f.result.length > 60 ? '…' : ''} | ${f.secdef ? 'SECURITY DEFINER' : 'invoker'} | ${sp ? sp.replace('search_path=', '') : '**non fixé**'} | ${who} | ${f.result === 'trigger' ? '(trigger)' : chk} | ${body.length} |`);
}
md.push('', '## Tâches planifiées (pg_cron)', '', '| N° | Nom | Fréquence | Commande | Exécutions | Échecs | Durée moy. | Durée max |', '|---|---|---|---|---:|---:|---:|---:|');
for (const j of d.cron_jobs || []) { const s = (d.cron_stats || []).find(x => x.jobid === j.jobid) || {}; md.push(`| ${j.jobid} | ${j.jobname} | \`${j.schedule}\` | \`${j.command.replace(/\s+/g, ' ').trim()}\` | ${s.runs ?? 0} | ${s.not_succeeded ?? 0} | ${s.avg_s ?? '?'} s | ${s.max_s ?? '?'} s |`); }
md.push('', `Journal \`cron.job_run_details\` : ${kb(d.cron_details_bytes)}, jamais purgé.`, '');
md.push('## Temps réel', '');
for (const p of d.publications || []) md.push(`- Publication \`${p.name}\` : ${(p.tables || []).join(', ')}`);
md.push('', '## Triggers hors schéma public', '');
for (const g of d.foreign_triggers || []) md.push(`- \`${g.name}\` sur \`${g.table}\` : \`${g.def}\``);
fs.mkdirSync(path.join(ROOT, 'docs/audit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/audit/inventaire-back.md'), md.join('\n') + '\n');
console.log('écrit : docs/audit/inventaire-back.md (' + md.length + ' lignes)');
const noCheck = d.functions.filter(f => f.secdef && f.result !== 'trigger' && !/auth\.uid\(\)/.test(f.def || ''));
console.log('SECURITY DEFINER sans aucun auth.uid() : ' + noCheck.length + ' → ' + noCheck.map(f => f.name).join(', '));
