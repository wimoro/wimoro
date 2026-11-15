// Base Postgres embarquée (PGlite) pour tester les migrations et les fonctions SQL sans toucher la production.
// Elle est chargée avec : les bouchons Supabase → la photo du schéma (0000_baseline.sql) → les migrations du dépôt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(ROOT, 'supabase', 'migrations');

/** Liste ordonnée des migrations du dépôt (après la baseline). */
export function migrations() {
  return fs.readdirSync(MIG).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort();
}

/**
 * Crée une base neuve.
 * @param {{ until?: string, skip?: (name: string) => boolean, log?: boolean }} [opt]
 *        until : s'arrêter avant la migration dont le nom contient ce texte (pour tester « avant / après »).
 */
export async function creerBase(opt = {}) {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(fs.readFileSync(path.join(ROOT, 'tests/sql/supabase-stubs.sql'), 'utf8'));
  // La baseline est une photo de la production : on retire ce que la base embarquée n'a pas (pg_cron, vault…).
  const base = fs.readFileSync(path.join(MIG, '0000_baseline.sql'), 'utf8')
    .replace(/^create extension if not exists (pg_cron|supabase_vault|pg_stat_statements)\b.*$/gm, '-- (extension fournie par Supabase)');
  await run(db, base, '0000_baseline.sql');
  const applied = [];
  for (const f of migrations()) {
    if (opt.until && f.includes(opt.until)) break;
    if (opt.skip && opt.skip(f)) continue;
    await run(db, fs.readFileSync(path.join(MIG, f), 'utf8'), f);
    applied.push(f);
  }
  if (opt.log) console.log('migrations appliquées : ' + applied.length);
  return db;
}

async function run(db, sql, name) {
  try { await db.exec(sql); }
  catch (e) {
    const pos = Number(e.position || 0);
    const ctx = pos ? '\n… ' + sql.slice(Math.max(0, pos - 220), pos + 160).replace(/\n/g, '\n    ') + ' …' : '';
    throw new Error(`[${name}] ${e.message}${ctx}`);
  }
}

/** Exécute une requête et renvoie les lignes. */
export async function q(db, sql, params) { return (await db.query(sql, params)).rows; }

/**
 * Exécute fn « en tant que » un utilisateur connecté (ou anonyme si uid est null), dans une transaction.
 * fn reçoit une fonction sql(texte, params) → lignes. La transaction est validée sauf si fn lève une erreur.
 */
export async function enTantQue(db, uid, fn) {
  return db.transaction(async tx => {
    const role = uid ? 'authenticated' : 'anon';
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]);
    await tx.exec(`set local role ${role}`);
    return fn(async (sql, params) => (await tx.query(sql, params)).rows);
  });
}

/** Comme enTantQue, mais renvoie l'erreur au lieu de la lever (pour vérifier qu'une action est refusée). */
export async function refus(db, uid, sql, params) {
  try { await enTantQue(db, uid, s => s(sql, params)); return null; }
  catch (e) { return e.message; }
}

/** Données minimales pour les tests : deux marchés, leurs salons, le salon général. */
export async function semer(db) {
  await db.exec(`
    insert into public.markets (id, category, question, status) values
      ('btc150k', 'Crypto', 'Le Bitcoin dépassera-t-il 150 000 $ ?', 'open'),
      ('clasico', 'Football', 'Le Barça gagnera-t-il le Clásico ?', 'open');
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth) values
      ('btc150k', 63, 63, 4200000, 1284, 25200),
      ('clasico', 54, 54, 860000, 1204, 5160);
    insert into public.chat_rooms (id, name, kind, market_id) values
      ('general', 'Général', 'global', null), ('vip', 'VIP', 'vip', null),
      ('m:btc150k', '#btc150k', 'market', 'btc150k'), ('m:clasico', '#clasico', 'market', 'clasico');
  `);
}

/** Crée un vrai joueur (auth.users → trigger → profil) et renvoie son identifiant. */
export async function creerJoueur(db, pseudo, solde = 0) {
  const [{ id }] = await q(db, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [pseudo + '@test.dev', JSON.stringify({ username: pseudo })]);
  if (solde) await q(db, `update public.user_stats set balance = $2 where user_id = $1`, [id, solde]);
  return id;
}
