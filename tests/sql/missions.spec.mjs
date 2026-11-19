// Missions : la récompense est donnée par le serveur, une seule fois ; et la règle des droits d'appel reste étanche.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db;
test.beforeAll(async () => { db = await creerBase(); await semer(db); });
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select ${sql} as r`, params)))[0].r;

test('recette 6 · mission réclamée : les XP sont donnés par le serveur, une seule fois', async () => {
  const u = await creerJoueur(db, 'missionnaire');
  await api(u, 'public.api_state()');
  expect(await refus(db, u, `select public.api_mission_claim('dep1')`)).toMatch(/mission_indisponible/);     // pas encore terminée
  await api(u, 'public.api_demo_deposit($1::jsonb, $2)', [JSON.stringify({ method: 'crypto', coin: 'USDC', net: 'Solana', amt: 30 }), randomUUID()]);
  await q(db, `update public.deposits set due_at = now() - interval '1 second' where user_id = $1`, [u]);
  const e = await api(u, 'public.api_state()');
  expect(e.missions.find(m => m.id === 'dep1')).toMatchObject({ have: 1, goal: 1, claimed: false, xp: 100 });
  expect(e.me.xp).toBe(100);                                                                                  // les 100 XP du premier dépôt du jour
  const r = await api(u, `public.api_mission_claim('dep1')`);
  expect(r.me.xp).toBe(200);
  expect(r.ev[0]).toEqual({ k: 'xp', n: 100, src: 'mission' });
  expect(r.missions.find(m => m.id === 'dep1').claimed).toBe(true);
  expect(await refus(db, u, `select public.api_mission_claim('dep1')`)).toMatch(/mission_indisponible/);     // déjà réclamée
  expect(await refus(db, u, `select public.api_mission_claim('inconnue')`)).toMatch(/mission_indisponible/);
  expect((await api(u, 'public.api_state()')).me.xp).toBe(200);
  // on ne réclame pas la mission d'un autre, ni par écriture directe
  const autre = await creerJoueur(db, 'jaloux'); await api(autre, 'public.api_state()');
  expect(await refus(db, autre, `select public.api_mission_claim('dep1')`)).toMatch(/mission_indisponible/);
  expect(await refus(db, autre, `update public.missions set is_claimed = true, current_progress = goal_value where user_id = auth.uid()`)).toMatch(/permission denied/);
});

test('droits d’appel : toute fonction api_ est réservée aux joueurs connectés sauf la liste « visiteur » ; le schéma wm reste fermé', async () => {
  const lignes = await q(db, `select n.nspname as s, p.proname as f, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as joueur
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wm' or (n.nspname = 'public' and p.proname like 'api\\_%') order by 1, 2`);
  const api_ = lignes.filter(l => l.s === 'public');
  expect(api_.length).toBeGreaterThanOrEqual(21);
  // api_site (19 nov. 2026, lot 1 du panneau) : lecture seule des réglages publics, de l'annonce et de la maintenance
  // api_live (19 nov. 2026, lot 6 des données réelles) : lecture seule de l'instantané des cours, sans signal de présence
  // api_fixations (lot 7) : lecture seule de l'historique des fixations d'un jeu éclair (48 h), pour le compte Démo et les visiteurs
  expect(api_.filter(l => l.anon).map(l => l.f)).toEqual(['api_fixations', 'api_live', 'api_markets', 'api_pseudo_libre', 'api_site']);
  expect(api_.filter(l => !l.joueur)).toEqual([]);
  // dans wm : seules les fonctions qui portent le nom d'une fonction api_ sont appelables, et par les mêmes personnes.
  // Seule exception, à tenir courte : une fonction appelée par une règle d'accès (RLS) au nom du joueur connecté. Elle ne
  // prend aucun paramètre et ne renvoie que ce qui le concerne (wm.clan_sujet : le sujet temps réel de son propre clan).
  const REGLES = ['clan_sujet', 'vip_ok'];
  const noms = new Set(api_.map(l => l.f.slice(4)));
  for (const l of lignes.filter(l => l.s === 'wm')) {
    expect(l.joueur, 'wm.' + l.f).toBe(noms.has(l.f) || REGLES.includes(l.f));
    expect(l.anon, 'wm.' + l.f).toBe(['fixations', 'live', 'markets', 'pseudo_libre', 'site'].includes(l.f));
  }
  for (const f of ['wm.demo_regler(auth.uid())', 'wm.xp_add(auth.uid(), 1000, $$x$$)', 'wm.bots_tick()', 'wm.droits()', 'wm.notify(auth.uid(), $$a$$, $$b$$)', 'wm.rank_refresh(auth.uid())'])
    expect(await refus(db, await creerJoueur(db, 'essai' + Math.random().toString(36).slice(2, 8)), 'select ' + f), f).toMatch(/permission denied/);
});
