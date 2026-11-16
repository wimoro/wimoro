// Clans côté serveur : même annuaire que l'écran, rejoindre / candidater / quitter / créer, contribution, tag public.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

const ANNUAIRE = JSON.parse(fs.readFileSync('tests/fixtures/clans-demo.json', 'utf8'));

test.describe.configure({ mode: 'serial' });
let db, lea, max, noa, fer;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 500); max = await creerJoueur(db, 'max', 500); noa = await creerJoueur(db, 'noa', 500); fer = await creerJoueur(db, 'fer', 500);
  await q(db, 'update public.user_stats set xp = 900, bets_settled = 12, bets_won = 7, deposits_count = 1 where user_id = any ($1)', [[lea, max, noa]]);   // rang Argent
  await q(db, `update public.users set created_at = now() - interval '20 days' where id = any ($1)`, [[lea, max]]);
});
test.afterAll(async () => { await db.close(); });

const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const etat = async u => (await api(u, 'api_state()')).clan;
const stats = async u => (await q(db, 'select balance::float8 as balance from public.user_stats where user_id = $1', [u]))[0];
const membre = async u => (await q(db, 'select clan_id, role, xp::float8 as xp, vol_jour::float8 as jour, ecartes from wm.clan_membres where user_id = $1 and parti_at is null', [u]))[0];
const notifs = (u, code) => q(db, 'select params from public.notifications where user_id = $1 and code = $2 order by created_at', [u, code]).then(l => l.map(x => x.params));
const clan = id => ANNUAIRE.find(c => c.id === id);

test('l’annuaire du serveur est celui de l’écran : 100 clans, mêmes tags, accès, rangs, codes', async () => {
  const lignes = await q(db, `select id, tag, acces as access, rang_min as "minRank", division as div, n, code from wm.clans_demo order by substr(id, 2)::int`);
  expect(lignes).toEqual(ANNUAIRE);
  expect(clan('c1')).toMatchObject({ access: 'open', minRank: 0 }); expect(clan('c2')).toMatchObject({ access: 'apply', minRank: 1 }); expect(clan('c3')).toMatchObject({ access: 'invite', minRank: 0 });
  for (const t of ['wm.clans_demo', 'wm.clans_joueurs', 'wm.clan_membres', 'wm.clan_candidatures']) expect(await refus(db, lea, `select * from ${t}`), t).toMatch(/permission denied/);
  for (const f of [`wm.clan_entrer('${lea}', 'c1')`, `wm.clan_etat('${max}')`, `wm.clan_candidatures_avancer('${max}')`, `wm.clan_regles('c1')`]) expect(await refus(db, lea, `select ${f}`), f).toMatch(/permission denied/);
  expect(await refus(db, null, `select public.api_clan_join('c1')`)).toMatch(/permission denied/);
});

test('rejoindre : clan ouvert, ou tout clan avec son code ; un seul clan ; rang minimum ; le tag devient public', async () => {
  expect(await etat(fer)).toMatchObject({ mine: null, leftAt: null, apps: {}, clans: [] });
  expect(await non(fer, `api_clan_join('c999')`)).toMatch(/clan_inconnu/);
  expect(await non(fer, `api_clan_join('c2')`)).toMatch(/rang_insuffisant/);                     // rang Bronze demandé
  expect(await non(fer, `api_clan_join('c3')`)).toMatch(/clan_ferme/);                           // sur invitation
  expect(await non(fer, `api_clan_join('c3', 'WMR-0000')`)).toMatch(/clan_ferme/);
  const r = await api(fer, `api_clan_join('c1')`);
  expect(r.clan.mine).toMatchObject({ id: 'c1', role: 'membre', xp: 0 });
  expect(r.ev.filter(e => e.k === 'notif').map(e => [e.n.code, e.n.p.id])).toEqual([['clan_rejoint', 'c1']]);
  expect(await non(fer, `api_clan_join('c4')`)).toMatch(/clan_deja/);
  expect((await api(lea, 'api_state()')).users[fer]).toBeUndefined();
  expect((await q(db, 'select wm.fiche($1) as f', [fer]))[0].f).toMatchObject({ n: 'fer', clan: 'c1', cp: 0 });   // ce que les autres voient
  expect((await api(max, `api_clan_join('c3', $1)`, [' ' + clan('c3').code.toLowerCase() + ' '])).clan.mine.id).toBe('c3');   // sur invitation : avec le code
});

test('candidater : la réponse d’un officier arrive au bout de quelques secondes ; acceptée, le joueur entre', async () => {
  expect(await non(noa, `api_clan_apply('c1')`)).toMatch(/clan_ferme/);                          // c1 est ouvert : on le rejoint, on n'y candidate pas
  const r = await api(noa, `api_clan_apply('c2')`);
  expect(Object.keys(r.clan.apps)).toEqual(['c2']);
  expect((await api(noa, 'api_clan()')).clan).toMatchObject({ mine: null });                     // trop tôt : toujours en attente
  const [{ id, ok }] = await q(db, `select id, abs(hashtext(id::text || ':' || user_id::text)) % 10 < 8 as ok from wm.clan_candidatures where user_id = $1`, [noa]);
  await q(db, `update wm.clan_candidatures set at = now() - interval '10 seconds' where id = $1`, [id]);
  const apres = (await api(noa, 'api_state()')).clan;                                            // au chargement suivant : la réponse est là
  expect(apres.apps).toEqual({});
  expect(apres.mine ? apres.mine.id : null).toBe(ok ? 'c2' : null);
  expect((await notifs(noa, ok ? 'clan_accepte' : 'clan_refuse'))).toEqual([{ id: 'c2' }]);
  expect((await q(db, 'select etat from wm.clan_candidatures where id = $1', [id]))[0].etat).toBe(ok ? 'acceptee' : 'refusee');
  if (ok) await api(noa, 'api_clan_leave()');
  await q(db, `update wm.clan_membres set parti_at = now() - interval '9 days' where user_id = $1`, [noa]);   // pour la suite : plus d'attente
});

test('quitter : 7 jours d’attente avant un autre clan', async () => {
  const r = await api(fer, 'api_clan_leave()');
  expect(r.clan.mine).toBeNull(); expect(r.clan.leftAt).toBeGreaterThan(Date.now() - 60000);
  expect(await non(fer, 'api_clan_leave()')).toMatch(/clan_absent/);
  expect(await non(fer, `api_clan_join('c4')`)).toMatch(/clan_attente/);
  expect(await non(fer, `api_clan_apply('c5')`)).toMatch(/clan_attente|rang_insuffisant/);
  await q(db, `update wm.clan_membres set parti_at = now() - interval '8 days' where user_id = $1`, [fer]);
  expect((await api(fer, `api_clan_join('c4')`)).clan.mine.id).toBe('c4');
  expect((await q(db, 'select count(*)::int as n from wm.clan_membres where user_id = $1', [fer]))[0].n).toBe(2);   // l'ancienne appartenance reste en base, fermée
});

let CLAN;
test('créer un clan : rang Argent, compte de 14 jours, 50 $ de frais, nom et tag vérifiés ; rejoint par son code ; succession du chef', async () => {
  const p = { name: "Les Loups d'Azur", tag: 'lda', desc: 'On joue le foot surtout.', ic: 'flame', col: '#12A150', lang: ['fr', 'xx'], cats: ['Football', 'Crypto', 'Sport', 'Météo'], access: 'invite', minRank: 0 };
  const creer = (qui, x = {}) => api(qui, 'api_clan_create($1::jsonb)', [JSON.stringify({ ...p, ...x })]);
  const refuse = (qui, x = {}) => non(qui, 'api_clan_create($1::jsonb)', [JSON.stringify({ ...p, ...x })]);
  expect(await refuse(max)).toMatch(/clan_deja/);                                                // max est dans c3
  await api(max, 'api_clan_leave()'); await q(db, `update wm.clan_membres set parti_at = now() - interval '8 days' where user_id = $1`, [max]);
  expect(await refuse(fer)).toMatch(/clan_deja/);
  expect(await refuse(noa)).toMatch(/compte_trop_recent/);                                       // noa : compte du jour
  await q(db, 'update public.user_stats set xp = 100, bets_settled = 0 where user_id = $1', [max]);
  expect(await refuse(max)).toMatch(/rang_insuffisant/);
  await q(db, 'update public.user_stats set xp = 900, bets_settled = 12 where user_id = $1', [max]);
  expect(await refuse(lea, { name: 'ab' })).toMatch(/clan_nom_invalide/);
  expect(await refuse(lea, { name: 'Les <b>Loups</b>' })).toMatch(/texte_refuse/);
  expect(await refuse(lea, { tag: 'trop5' })).toMatch(/clan_tag_invalide/);
  expect(await refuse(lea, { tag: clan('c1').tag })).toMatch(/clan_tag_pris/);                   // tag d'un clan de démonstration
  expect(await refuse(lea, { access: 'secret' })).toMatch(/clan_invalide/);
  await q(db, 'update public.user_stats set balance = 40 where user_id = $1', [lea]);
  expect(await refuse(lea)).toMatch(/solde_insuffisant/);
  await q(db, 'update public.user_stats set balance = 500 where user_id = $1', [lea]);
  const r = await creer(lea);
  CLAN = r.id;
  expect(CLAN).toMatch(/^u\d+$/);
  expect(r.me.balance).toBe(450);                                                                // 50 $ de frais
  expect((await q(db, `select amount::float8 as a, kind, ref_id from public.balance_ledger where user_id = $1 order by id desc limit 1`, [lea]))[0]).toEqual({ a: -50, kind: 'clan', ref_id: CLAN });
  expect(r.clan.mine).toMatchObject({ id: CLAN, role: 'chef' });
  const [vu] = r.clan.clans;
  expect(vu).toMatchObject({ id: CLAN, name: 'Les Loups d’Azur', tag: 'LDA', emblem: { ic: 'flame', col: '#12A150' }, lang: ['fr'], cats: ['Football', 'Crypto', 'Sport'], access: 'invite', minRank: 0, chief: lea });
  expect(vu.code).toMatch(/^WMR-[A-Z0-9]{4}$/); expect(vu.members).toMatchObject([{ u: lea, role: 'chef' }]);
  expect(await refuse(max, { tag: 'LDA', name: 'Autre nom' })).toMatch(/clan_tag_pris/);
  const vuParMax = (await etat(max)).clans[0];
  expect(vuParMax).toMatchObject({ id: CLAN, name: 'Les Loups d’Azur' }); expect(vuParMax.code, 'le code ne se lit que de l’intérieur').toBeNull();
  expect(await non(max, 'api_clan_join($1)', [CLAN])).toMatch(/clan_ferme/);
  const j = await api(max, 'api_clan_join($1, $2)', [CLAN, vu.code]);
  expect(j.clan.mine).toMatchObject({ id: CLAN, role: 'membre' });
  expect(j.clan.clans[0].members.map(m => m.u)).toEqual([lea, max]); expect(j.clan.clans[0].code).toBe(vu.code);
  expect(j.clan.users[lea]).toMatchObject({ n: 'lea', clan: CLAN });
  await api(lea, 'api_clan_leave()');                                                            // le chef part : max lui succède
  expect((await q(db, 'select chef from wm.clans_joueurs where id = $1', [CLAN]))[0].chef).toBe(max);
  expect(await membre(max)).toMatchObject({ clan_id: CLAN, role: 'chef' });
  expect(await notifs(max, 'clan_chef')).toEqual([{ id: CLAN }]);
});

test('contribution : le volume misé devient l’XP de clan, plafonné à 2 000 $ par jour ; pas de points sur un marché déjà tenu par un autre membre', async () => {
  await q(db, 'update public.user_stats set balance = 9000 where user_id = any ($1)', [[max, noa]]);
  await api(max, `api_buy('btc150k', 'oui', 300, $1)`, [randomUUID()]);
  expect(await membre(max)).toMatchObject({ xp: 300, jour: 300, ecartes: 0 });
  await api(max, `api_buy('btc150k', 'oui', 3000, $1)`, [randomUUID()]);                          // plafond du jour
  expect(await membre(max)).toMatchObject({ xp: 2000, jour: 2000 });
  await q(db, `update wm.clan_membres set jour = current_date - 1 where user_id = $1`, [max]);   // le lendemain
  await api(max, `api_buy('clasico', 'oui', 100, $1)`, [randomUUID()]);
  expect(await membre(max)).toMatchObject({ xp: 2100, jour: 100 });
  const code = (await q(db, 'select code from wm.clans_joueurs where id = $1', [CLAN]))[0].code;
  await api(noa, 'api_clan_join($1, $2)', [CLAN, code]);
  await api(noa, `api_buy('clasico', 'non', 200, $1)`, [randomUUID()]);                           // max est déjà sur ce marché
  expect(await membre(noa)).toMatchObject({ xp: 0, ecartes: 1 });
  await api(noa, `api_sell('clasico', 'non', 99999, $1)`, [randomUUID()]);                        // une vente ne compte pas
  expect(await membre(noa)).toMatchObject({ xp: 0 });
  expect((await etat(noa)).mine).toMatchObject({ id: CLAN, xp: 0, ecartes: 1 });
  await api(noa, 'api_combo_place($1::jsonb)', [JSON.stringify({ legs: [{ m: 'btc150k', s: 'oui' }, { m: 'clasico', s: 'non' }], stake: 40, key: randomUUID() })]);   // un combiné compte, sans règle de marché
  expect(await membre(noa)).toMatchObject({ xp: 40, ecartes: 1 });
  await api(noa, 'api_clan_leave()');
  await q(db, `update wm.clan_membres set parti_at = now() - interval '8 days' where user_id = $1 and parti_at is not null`, [noa]);
  expect(await non(noa, `api_clan_join(null, 'WMR-0000')`)).toMatch(/clan_inconnu/);
  expect((await api(noa, 'api_clan_join(null, $1)', [code.toLowerCase()])).clan.mine.id).toBe(CLAN);   // par le code seul
  expect((await etat(max)).clans[0].members.find(m => m.u === max).pts).toBe(2100);
});

test('les bots portent le tag d’un clan de démonstration, comme dans la démo (4 sur 5)', async () => {
  const ids = [];
  for (let i = 0; i < 40; i++) { const [{ id }] = await q(db, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [`bot${i}@test.dev`, JSON.stringify({ username: 'bot' + i })]); ids.push(id); }
  await q(db, 'update public.users set is_demo = true where id = any ($1)', [ids]);
  const clans = (await q(db, 'select wm.fiche(id) -> \'clan\' as c from public.users where id = any ($1)', [ids])).map(x => x.c);
  const avec = clans.filter(Boolean);
  expect(avec.length).toBeGreaterThan(24); expect(avec.length).toBeLessThan(40);
  for (const c of avec) { expect(c).toMatch(/^c\d+$/); const n = +c.slice(1); expect(n).toBeGreaterThanOrEqual(61); expect(n).toBeLessThanOrEqual(100); }
});
