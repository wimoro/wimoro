// Lot 0 du panneau d'administration et des réglages : la sauvegarde prise AVANT toute autre modification.
// Elle copie le schéma et les données des tables que les lots suivants touchent, et la définition de toutes les fonctions
// des schémas wm et public ; elle ne change rien d'autre (droits identiques) et reste invisible des visiteurs et des joueurs.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer, migrations } from './base.mjs';

const LOT0 = 'sauvegarde_20261119';
// tables touchées par les lots suivants : déclencheurs ajoutés, ou lignes écrites par les nouvelles actions de l'équipe
const TABLES = ['public.admin_users', 'public.markets', 'public.users', 'public.user_stats', 'public.balance_ledger', 'public.notifications',
  'public.chat_messages', 'wm.admin_journal', 'wm.config', 'wm.clans_joueurs', 'wm.clan_membres', 'wm.rg'];
// fonctions existantes qui recevront un contrôle ajouté (plan d'architecture, § 2.3) : leur définition doit être sauvée
const MODIFIEES = ['wm.uid()', 'wm.is_admin()', 'wm.admin(text,jsonb)', 'wm.droits()', 'wm.buy(text,text,numeric,uuid,jsonb)',
  'srv_eclair_miser(uuid,jsonb)', 'srv_serie_start(uuid,jsonb)', 'srv_blitz_join(uuid,jsonb)', 'srv_blitz_rebuy(uuid,jsonb)',
  'wm.duel_create(jsonb)', 'wm.duel_accepter(bigint,uuid,integer,numeric)', 'srv_duel_eclair_creer(uuid,jsonb)', 'wm.combo_place(jsonb)',
  'wm.combo_valeur(wm.combos)', 'wm.stack_create(jsonb)', 'wm.stacks_avant(uuid)', 'wm.copy_start(jsonb)',
  'wm.copie_executer(bigint,text,text,numeric,boolean)', 'wm.demo_deposit(jsonb,uuid)', 'wm.demo_withdraw(jsonb,uuid)', 'wm.argent()',
  'wm.fee_rate(text,boolean)', 'wm.ref_bonus()', 'wm.proposal_create(jsonb)', 'wm.clan_join(text,text)', 'wm.clan_apply(text)',
  'wm.clan_create(jsonb)', 'wm.clan_promote(uuid)', 'wm.clan_kick(uuid)', 'wm.clan_invite(uuid)', 'wm.clan_call(text,text)', 'wm.clan_war()',
  'wm.clan_war_join()', 'wm.clan_guerres_avancer(uuid)', 'wm.chat_send(text,text)', 'wm.chat_share(text,text,text)',
  'wm.chat_react(text,text,text)', 'wm.ana_share(jsonb,text[],text)', 'wm.dm_send(uuid,text)'];

const FONCTIONS = `select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('wm', 'public') and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`;
const DROITS = `select p.oid::regprocedure::text as f, coalesce(p.proacl::text, '') as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('wm', 'public') order by 1`;
const enTable = rows => Object.fromEntries(rows.map(r => [r.sig, r.def]));

test('lot 0 : tables touchées et définitions de toutes les fonctions copiées, droits inchangés, copie invisible des clients', async () => {
  const db = await creerBase({ until: LOT0 }); await semer(db);
  const chef = await creerJoueur(db, 'chef', 0), alice = await creerJoueur(db, 'alice', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [chef]);
  await enTantQue(db, alice, s => s(`select public.api_buy('btc150k', 'oui', 20, gen_random_uuid())`));
  await enTantQue(db, alice, s => s(`select public.api_chat_send('general', 'bonjour')`));
  await enTantQue(db, chef, s => s(`select public.api_admin('solde', $1::jsonb)`, [JSON.stringify({ id: alice, delta: 5, motif: 'essai' })]));
  const droits = await q(db, DROITS), defs = enTable(await q(db, FONCTIONS));
  const lignes = {};
  for (const t of TABLES) lignes[t] = Number((await q(db, `select count(*) as n from ${t}`))[0].n);
  expect(lignes['public.balance_ledger']).toBeGreaterThan(0); expect(lignes['wm.admin_journal']).toBe(1); expect(lignes['public.chat_messages']).toBe(1);

  const f = migrations().find(x => x.includes(LOT0));
  expect(f, 'la migration du lot 0 existe').toBeTruthy();
  await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));

  // les données : autant de lignes, et les mêmes
  for (const t of TABLES) {
    const copie = 'backup_20261119.' + t.replace('.', '_');
    expect(Number((await q(db, `select count(*) as n from ${copie}`))[0].n), copie).toBe(lignes[t]);
    expect(Number((await q(db, `select count(*) as n from (select * from ${t} except select * from ${copie}) x`))[0].n), copie).toBe(0);
  }
  // le schéma de chaque table : colonnes, contraintes, index, déclencheurs, règles d'accès, droits
  const schema = await q(db, 'select nom, lignes, colonnes, contraintes, index, declencheurs, regles, rls from backup_20261119.tables order by nom');
  expect(schema.map(s => s.nom)).toEqual([...TABLES].sort());
  const users = schema.find(s => s.nom === 'public.users');
  expect(users.colonnes.map(c => c.nom)).toEqual(expect.arrayContaining(['id', 'username', 'email', 'kyc_verified']));
  expect(users.contraintes.map(c => c.def).join(' ')).toMatch(/PRIMARY KEY/);
  expect(users.rls).toBe(true);
  expect(schema.find(s => s.nom === 'public.markets').declencheurs.join(' ')).toMatch(/set_updated_at/);
  expect(schema.find(s => s.nom === 'public.balance_ledger').index.join(' ')).toMatch(/idx_ledger_user/);
  expect(Number(schema.find(s => s.nom === 'public.balance_ledger').lignes)).toBe(lignes['public.balance_ledger']);

  // les fonctions : toutes, avec exactement la définition en vigueur ; celles que les lots suivants modifient en font partie
  const sauve = await q(db, 'select signature as sig, nom, definition as def, droits from backup_20261119.fonctions');
  expect(enTable(sauve)).toEqual(defs);
  for (const m of MODIFIEES) expect(sauve.some(s => s.sig === m), m).toBe(true);
  expect(sauve.find(s => s.sig === 'wm.buy(text,text,numeric,uuid,jsonb)').nom).toBe('wm.buy');

  // rien d'autre n'a changé : mêmes droits d'appel sur toutes les fonctions
  expect(await q(db, DROITS)).toEqual(droits);
  // invisible des clients : ni un visiteur ni un joueur ne lisent la copie ou ne restaurent une fonction
  for (const qui of [null, alice]) {
    expect(await refus(db, qui, 'select count(*) from backup_20261119.fonctions')).toMatch(/permission denied/);
    expect(await refus(db, qui, 'select email from backup_20261119.public_users')).toMatch(/permission denied/);
    expect(await refus(db, qui, `select backup_20261119.restaurer('wm.uid()')`)).toMatch(/permission denied/);
  }
  await db.close();
});

test('retour arrière : une définition sauvegardée se remet en place par une seule ligne', async () => {
  const db = await creerBase();                                       // toutes les migrations : les lots suivants ont pu modifier des fonctions
  const avant = (await q(db, `select definition from backup_20261119.fonctions where signature = 'wm.ref_bonus()'`))[0].definition;
  expect(avant).toMatch(/10::numeric/);
  await q(db, `create or replace function wm.ref_bonus() returns numeric language sql stable set search_path = '' as $$ select 99::numeric $$`);
  expect(Number((await q(db, 'select wm.ref_bonus() as b'))[0].b)).toBe(99);
  expect((await q(db, `select backup_20261119.restaurer('wm.ref_bonus()') as r`))[0].r).toBe('wm.ref_bonus()');
  expect((await q(db, `select pg_get_functiondef('wm.ref_bonus()'::regprocedure) as d`))[0].d).toBe(avant);
  expect(Number((await q(db, 'select wm.ref_bonus() as b'))[0].b)).toBe(10);
  expect(await q(db, `select backup_20261119.restaurer('wm.inconnue()') as r`).catch(e => e.message)).toMatch(/fonction_absente/);
  await db.close();
});
