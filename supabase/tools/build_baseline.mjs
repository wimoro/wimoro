// Transforme l'export du catalogue Postgres (voir export_catalogue.sql) en fichiers SQL versionnés.
//
// Usage :
//   node supabase/tools/build_baseline.mjs --catalogue <fichier> [--historique <fichier>] [--json <sortie.json>]
//
// <fichier> = résultat brut de la requête (JSON pur, ou enveloppe renvoyée par l'outil SQL de Supabase).
// Sorties : supabase/migrations/0000_baseline.sql, supabase/historique/*.sql
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));

/** Lit un résultat d'outil : accepte du JSON pur ou l'enveloppe {"result":"...<untrusted-data-…>[…]</untrusted-data-…>"}. */
function readDoc(file) {
  let s = fs.readFileSync(file, 'utf8').trim();
  if (s.startsWith('{"result"')) s = JSON.parse(s).result;
  // La balise ouvrante utile est celle suivie d'un saut de ligne (la phrase d'introduction la cite aussi).
  const open = s.match(/<untrusted-data-[0-9a-f-]+>\n/);
  const close = s.lastIndexOf('\n</untrusted-data-');
  if (open && close > open.index) s = s.slice(open.index + open[0].length, close);
  let v = JSON.parse(s);
  if (Array.isArray(v) && v.length === 1 && v[0] && 'doc' in v[0]) v = v[0].doc;
  return v;
}

const RESERVED = new Set('all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else end except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime localtimestamp not null offset on only or order placing primary references returning select session_user some symmetric table then to trailing true union unique user using variadic when where window with'.split(' '));
const qi = (n) => (/^[a-z_][a-z0-9_]*$/.test(n) && !RESERVED.has(n) ? n : '"' + n.replace(/"/g, '""') + '"');
const qs = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const CMD = { r: 'select', a: 'insert', w: 'update', d: 'delete', '*': 'all' };

// ── Détection de secrets et de données personnelles : rien de tel ne doit entrer dans le dépôt (il est public).
const SECRET_PATTERNS = [
  ['jwt', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g],
  ['cle_secrete_supabase', /sb_secret_[A-Za-z0-9_-]{8,}/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
];
const findings = [];
function scrub(text, where) {
  let out = text;
  for (const [kind, re] of SECRET_PATTERNS) {
    out = out.replace(re, (m) => {
      // Les adresses génériques de bots/démo ne sont pas des données personnelles.
      if (kind === 'email' && /@(wimoro\.(bot|local|test|invalid)|bots?\.wimoro\.com|example\.(com|org)|bot\.local)$/i.test(m)) return m;
      findings.push({ kind, where, sample: m.slice(0, 4) + '…' + m.slice(-6) });
      return kind === 'email' ? '<email-masque>' : '<secret-masque>';
    });
  }
  return out;
}

function buildBaseline(d) {
  const L = [];
  const p = (...x) => L.push(...x);
  const T = d.tables || [];
  p(
    '-- ═══════════════════════════════════════════════════════════════════════════',
    '-- Wimoro — état du back Supabase AVANT réparation (schéma public et objets liés)',
    `-- Photo prise le ${String(d.generated_at).slice(0, 19).replace('T', ' ')} UTC — Postgres ${d.server_version}`,
    '-- Généré par supabase/tools/build_baseline.mjs à partir de supabase/tools/export_catalogue.sql.',
    '--',
    '-- Ce fichier est une PHOTO du schéma, reconstituée depuis le catalogue Postgres. Il sert de',
    "-- référence et de point de départ pour reconstruire un projet vide. Il n'a PAS été rejoué tel",
    '-- quel sur la base de production (elle est déjà dans cet état) : ne pas le lancer dessus.',
    '-- Les 22 migrations d\'origine sont conservées, pour mémoire, dans supabase/historique/.',
    '-- ═══════════════════════════════════════════════════════════════════════════',
    '',
    'set check_function_bodies = false;',
    '',
    '-- ── 1. Extensions ──────────────────────────────────────────────────────────'
  );
  for (const e of d.extensions || []) {
    if (e.name === 'plpgsql') continue;
    p(`create extension if not exists ${qi(e.name)} with schema ${qi(e.schema)};  -- version ${e.version}`);
  }

  if ((d.enums || []).length || (d.domains || []).length || (d.composites || []).length) {
    p('', '-- ── 2. Types ───────────────────────────────────────────────────────────────');
    for (const e of d.enums || []) p(`create type public.${qi(e.name)} as enum (${e.labels.map(qs).join(', ')});`);
    for (const e of d.domains || []) p(`create domain public.${qi(e.name)} as ${e.base}${e.default ? ' default ' + e.default : ''}${e.notnull ? ' not null' : ''};`);
    for (const e of d.composites || []) p(`create type public.${qi(e.name)} as (${e.attrs.map((a) => `${qi(a.name)} ${a.type}`).join(', ')});`);
  }

  // Séquences : seules celles citées par un DEFAULT nextval(...) sont créées explicitement
  // (celles des colonnes "identity" sont créées avec la table).
  const defaults = T.flatMap((t) => (t.columns || []).map((c) => c.default || '')).join('\n');
  const seqs = (d.sequences || []).filter((s) => defaults.includes(`nextval('${s.name}'`) || defaults.includes(`nextval('public.${s.name}'`));
  if (seqs.length) {
    p('', '-- ── 3. Séquences ───────────────────────────────────────────────────────────');
    for (const s of seqs) p(`create sequence if not exists public.${qi(s.name)} as ${s.type} increment by ${s.inc} minvalue ${s.min} maxvalue ${s.max} start with ${s.start}${s.cycle ? ' cycle' : ''};`);
  }

  p('', '-- ── 4. Tables ──────────────────────────────────────────────────────────────');
  for (const t of T) {
    const cols = (t.columns || []).map((c) => {
      let s = `  ${qi(c.name)} ${c.type}`;
      if (c.generated === 's') s += ` generated always as (${c.default}) stored`;
      else if (c.identity === 'a') s += ' generated always as identity';
      else if (c.identity === 'd') s += ' generated by default as identity';
      else if (c.default != null) s += ` default ${c.default}`;
      if (c.notnull) s += ' not null';
      return s;
    });
    p('', `-- ${t.name} : ~${t.est_rows ?? '?'} lignes, ${Math.round((t.total_bytes || 0) / 1024)} Ko`, `create table public.${qi(t.name)} (`, cols.join(',\n'), ');');
    for (const k of (t.constraints || []).filter((k) => k.type !== 'f')) p(`alter table public.${qi(t.name)} add constraint ${qi(k.name)} ${k.def};`);
    if (t.comment) p(`comment on table public.${qi(t.name)} is ${qs(t.comment)};`);
    if (t.replica_identity === 'f') p(`alter table public.${qi(t.name)} replica identity full;`);
  }

  p('', '-- ── 5. Clés étrangères ─────────────────────────────────────────────────────');
  for (const t of T) for (const k of (t.constraints || []).filter((k) => k.type === 'f')) p(`alter table public.${qi(t.name)} add constraint ${qi(k.name)} ${k.def};`);

  p('', '-- ── 6. Index (hors index créés par une contrainte) ─────────────────────────');
  for (const t of T) for (const i of (t.indexes || []).filter((i) => !i.constraint)) p(`${i.def};`);

  p('', '-- ── 7. Fonctions ───────────────────────────────────────────────────────────');
  for (const f of d.functions || []) {
    if (!f.def) { p(`-- (agrégat ou fonction fenêtre non exportée : ${f.sig})`); continue; }
    p('', `-- ${f.sig} — ${f.secdef ? 'SECURITY DEFINER' : 'security invoker'}${f.config ? ', ' + f.config.join(', ') : ', search_path NON fixé'}`, scrub(f.def.trimEnd(), `fonction ${f.sig}`) + ';');
    if (f.comment) p(`comment on function public.${f.sig} is ${qs(f.comment)};`);
  }

  if ((d.views || []).length) {
    p('', '-- ── 8. Vues ────────────────────────────────────────────────────────────────');
    for (const v of d.views) {
      const opt = v.options && v.options.length ? ` with (${v.options.join(', ')})` : '';
      p(`create ${v.kind === 'm' ? 'materialized view' : 'or replace view'} public.${qi(v.name)}${opt} as`, scrub(v.def.trimEnd(), `vue ${v.name}`).replace(/;$/, '') + ';');
    }
  }

  p('', '-- ── 9. Triggers ────────────────────────────────────────────────────────────');
  for (const t of T) for (const g of t.triggers || []) {
    p(`${g.def};`);
    if (g.enabled === 'D') p(`alter table public.${qi(t.name)} disable trigger ${qi(g.name)};`);
  }
  for (const g of d.foreign_triggers || []) p(`${g.def};  -- sur ${g.table}`);

  p('', '-- ── 10. Sécurité au niveau des lignes (RLS) ────────────────────────────────');
  for (const t of T) {
    p('', t.rls ? `alter table public.${qi(t.name)} enable row level security;` : `-- ATTENTION : RLS désactivée sur public.${t.name}`);
    if (t.force_rls) p(`alter table public.${qi(t.name)} force row level security;`);
    for (const po of t.policies || []) {
      let s = `create policy ${qi(po.name)} on public.${qi(t.name)}${po.permissive ? '' : ' as restrictive'} for ${CMD[po.cmd] || po.cmd} to ${(po.roles || ['public']).join(', ')}`;
      if (po.using != null) s += `\n  using (${po.using})`;
      if (po.check != null) s += `\n  with check (${po.check})`;
      p(s + ';');
    }
    if (t.rls && !(t.policies || []).length) p(`-- (aucune policy : table inaccessible via l'API, sauf par les fonctions SECURITY DEFINER)`);
  }
  for (const po of d.foreign_policies || []) {
    let s = `create policy ${qi(po.name)} on ${po.table}${po.permissive === 'RESTRICTIVE' ? ' as restrictive' : ''} for ${String(po.cmd).toLowerCase()} to ${(po.roles || ['public']).join(', ')}`;
    if (po.using != null) s += `\n  using (${po.using})`;
    if (po.check != null) s += `\n  with check (${po.check})`;
    p(s + ';');
  }

  p('', '-- ── 11. Droits (GRANT) ─────────────────────────────────────────────────────', '-- Tables');
  const tableGrants = (rel, grants) => {
    const by = {};
    for (const g of grants || []) if (g.grantee !== 'postgres') (by[g.grantee] ||= []).push(g.priv.toLowerCase());
    for (const [who, privs] of Object.entries(by)) p(`grant ${privs.join(', ')} on public.${qi(rel)} to ${who === 'PUBLIC' ? 'public' : who};`);
  };
  for (const t of T) tableGrants(t.name, t.grants);
  for (const v of d.views || []) tableGrants(v.name, v.grants);
  p('', '-- Fonctions (qui a le droit de les exécuter)');
  for (const f of d.functions || []) {
    if (!f.def) continue;
    const kw = f.kind === 'p' ? 'procedure' : 'function';
    if (f.acl_null) { p(`-- public.${f.sig} : droits par défaut (exécutable par tout le monde)`); continue; }
    const who = (f.grants || []).filter((g) => g !== 'postgres').map((g) => (g === 'PUBLIC' ? 'public' : g));
    p(`revoke all on ${kw} public.${f.sig} from public, anon, authenticated;`);
    if (who.length) p(`grant execute on ${kw} public.${f.sig} to ${who.join(', ')};`);
  }

  p('', '-- ── 12. Temps réel (publications) ──────────────────────────────────────────');
  for (const pub of d.publications || []) {
    p(`-- publication ${pub.name} : ${pub.all_tables ? 'TOUTES les tables' : (pub.tables || []).length + ' table(s)'} (insert=${pub.insert}, update=${pub.update}, delete=${pub.delete})`);
    if (!pub.all_tables) for (const t of pub.tables || []) p(`alter publication ${qi(pub.name)} add table ${t};`);
  }

  p('', '-- ── 13. Tâches planifiées (pg_cron) ────────────────────────────────────────');
  for (const j of d.cron_jobs || []) {
    const st = (d.cron_stats || []).find((s) => s.jobid === j.jobid);
    p(`-- tâche n°${j.jobid}${j.active ? '' : ' (INACTIVE)'}${st ? ` — ${st.runs} exécutions, ${st.not_succeeded} en échec, durée moyenne ${st.avg_s}s, max ${st.max_s}s` : ''}`);
    p(`select cron.schedule(${qs(j.jobname ?? 'job_' + j.jobid)}, ${qs(j.schedule)}, $cron$${scrub(j.command, 'cron ' + j.jobname)}$cron$);`);
  }
  if (!(d.cron_jobs || []).length) p('-- (aucune)');

  p('', '-- ── 14. Stockage de fichiers ───────────────────────────────────────────────');
  for (const b of d.storage_buckets || []) p(`insert into storage.buckets (id, name, public) values (${qs(b.id)}, ${qs(b.name)}, ${b.public}) on conflict (id) do nothing;`);
  if (!(d.storage_buckets || []).length) p('-- (aucun bucket)');
  p('');
  return L.join('\n');
}

function main() {
  if (!args.catalogue) { console.error('--catalogue <fichier> requis'); process.exit(1); }
  const d = readDoc(args.catalogue);
  const out = path.join(ROOT, 'supabase', 'migrations', '0000_baseline.sql');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildBaseline(d));
  console.log(`baseline : ${path.relative(ROOT, out)} — ${(d.tables || []).length} tables, ${(d.functions || []).length} fonctions, ${(d.tables || []).reduce((n, t) => n + (t.policies || []).length, 0)} policies, ${(d.cron_jobs || []).length} tâches cron`);
  if (args.json) { fs.mkdirSync(path.dirname(args.json), { recursive: true }); fs.writeFileSync(args.json, JSON.stringify(d, null, 1)); console.log('catalogue JSON : ' + args.json); }

  if (args.historique) {
    const h = readDoc(args.historique);
    const dir = path.join(ROOT, 'supabase', 'historique');
    fs.mkdirSync(dir, { recursive: true });
    for (const m of h) {
      const body = (m.statements || []).map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith(';') ? s : s + ';')).join('\n\n');
      const head = `-- Migration d'origine ${m.version}_${m.name} — telle qu'enregistrée dans supabase_migrations.schema_migrations.\n-- Conservée pour mémoire uniquement : NE PAS rejouer. L'état réel du back est dans supabase/migrations/.\n\n`;
      fs.writeFileSync(path.join(dir, `${m.version}_${m.name}.sql`), head + scrub(body, `historique ${m.version}_${m.name}`) + '\n');
    }
    console.log(`historique : ${h.length} migrations écrites dans supabase/historique/`);
  }

  if (findings.length) {
    console.log(`\n⚠ ${findings.length} valeur(s) sensible(s) masquée(s) :`);
    const agg = {};
    for (const f of findings) agg[`${f.kind} | ${f.where} | ${f.sample}`] = (agg[`${f.kind} | ${f.where} | ${f.sample}`] || 0) + 1;
    for (const [k, n] of Object.entries(agg)) console.log(`  - ${k} ×${n}`);
  } else console.log('\nAucun secret ni e-mail détecté.');
}
main();
