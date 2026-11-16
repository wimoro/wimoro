// Chat côté serveur : salons publics (général, marchés), historique, envoi contrôlé, progression, anti-spam, diffusion.
// Couvre K13 (anti-spam), K26 (plus de texte figé servi) et la recette 5 (partie chat, côté serveur).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

let db, alice, bob;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  alice = await creerJoueur(db, 'alice'); bob = await creerJoueur(db, 'bob');
  for (const u of [alice, bob]) await enTantQue(db, u, s => s('select public.api_state()'));
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select ${sql} as r`, params)))[0].r;
const envoyer = (uid, salon, texte) => api(uid, 'public.api_chat_send($1, $2)', [salon, texte]);
const refusEnvoi = (uid, salon, texte) => refus(db, uid, 'select public.api_chat_send($1, $2)', [salon, texte]);
/** fait passer le temps pour l'anti-spam */
const plusTard = (uid, sec = 5) => q(db, `update public.chat_messages set created_at = created_at - make_interval(secs => $2) where user_id = $1`, [uid, sec]);

test('recette 5 · A écrit dans le salon général et dans celui d’un marché : enregistré, diffusé avec son pseudo et son rang, lu par B', async () => {
  await q(db, 'truncate realtime.messages');
  const r = await envoyer(alice, 'general', '  Bonjour à tous  ');
  expect(r.msg).toMatchObject({ u: alice, k: 'msg', text: 'Bonjour à tous' });
  expect(r.me).toMatchObject({ msgsTotal: 1, chatXP: 2, xp: 2 });
  expect(r.ev.map(e => e.k)).toEqual(['xp', 'mission', 'notif']);                      // +2 XP, mission « premier message » terminée
  await plusTard(alice);
  const r2 = await envoyer(alice, 'm:btc150k', 'Je vois le #btc150k à 70 %');
  expect(r2.msg.text).toBe('Je vois le #btc150k à 70 %');
  // diffusion : un message par salon, sur un sujet public, avec la fiche de l'auteur et sans e-mail
  const diff = await q(db, `select topic, event, private, payload from realtime.messages order by inserted_at`);
  expect(diff.map(d => [d.topic, d.event, d.private])).toEqual([['salon:general', 'msg', false], ['salon:m:btc150k', 'msg', false]]);
  expect(diff[0].payload).toMatchObject({ u: alice, text: 'Bonjour à tous', f: { n: 'alice', t: 0, d: 0, bot: false } });
  expect(JSON.stringify(diff)).not.toMatch(/@test\.dev/);
  // B lit l'historique : le message, et la fiche de A
  const h = await api(bob, `public.api_chat_history('general')`);
  expect(h.msgs.map(m => [m.u, m.text])).toEqual([[alice, 'Bonjour à tous']]);
  expect(h.users[alice]).toMatchObject({ n: 'alice' });
  expect(JSON.stringify(h)).not.toMatch(/@test\.dev/);
  expect((await api(bob, `public.api_chat_history('m:btc150k')`)).msgs).toHaveLength(1);
  expect((await api(bob, `public.api_chat_history('m:clasico')`)).msgs).toEqual([]);
});

test('progression : 2 XP par message, 20 XP par jour au plus', async () => {
  const u = await creerJoueur(db, 'bavard'); await api(u, 'public.api_state()');
  let dernier;
  for (let i = 0; i < 12; i++) { dernier = await envoyer(u, 'general', 'message numéro ' + i); await plusTard(u, 70); }
  expect(dernier.me).toMatchObject({ msgsTotal: 12, chatXP: 20, xp: 20 });
  expect(dernier.ev.filter(e => e.k === 'xp')).toEqual([]);                             // le plafond du jour est atteint
});

test('K13 · anti-spam : trop vite, message répété, plus de 12 par minute, vide, trop long', async () => {
  const u = await creerJoueur(db, 'pressé'.replace('é', 'e')); await api(u, 'public.api_state()');
  await envoyer(u, 'general', 'premier');
  expect(await refusEnvoi(u, 'general', 'deuxième tout de suite')).toMatch(/trop_vite/);
  await plusTard(u, 3);
  expect(await refusEnvoi(u, 'general', 'premier')).toMatch(/message_repete/);
  expect(await refusEnvoi(u, 'general', '   ')).toMatch(/message_vide/);
  expect(await refusEnvoi(u, 'general', 'x'.repeat(281))).toMatch(/message_trop_long/);
  expect((await envoyer(u, 'general', 'x'.repeat(280))).msg.text).toHaveLength(280);
  for (let i = 0; i < 10; i++) { await plusTard(u, 2); await envoyer(u, 'general', 'rafale ' + i); }
  await plusTard(u, 2);
  expect(await refusEnvoi(u, 'general', 'un de trop')).toMatch(/trop_de_messages/);   // 12 messages dans la minute
  await plusTard(u, 70);
  expect((await envoyer(u, 'general', 'après une minute')).msg.text).toBe('après une minute');
  // les caractères de contrôle sont retirés, le reste est gardé tel quel (l'écran échappe le HTML à l'affichage)
  await plusTard(u, 5);
  expect((await envoyer(u, 'general', 'a\u0007b\u001b <script>alert(1)</script>')).msg.text).toBe('a b  <script>alert(1)</script>');
});

test('salons : seuls le général et les marchés existants sont ouverts à tous ; privé et clan d’un autre restent fermés ; le salon VIP demande son rang', async () => {
  for (const salon of ['dm:' + bob, 'clan:abc', 'm:marche-inconnu', 'serie', '', null]) {
    expect(await refusEnvoi(alice, salon, 'coucou'), String(salon)).toMatch(/salon_indisponible/);
    expect(await refus(db, alice, 'select public.api_chat_history($1)', [salon]), String(salon)).toMatch(/salon_indisponible/);
  }
  expect(await refusEnvoi(alice, 'vip', 'coucou')).toMatch(/rang_insuffisant/);                   // rang Ascendant : tests/sql/salon-vip.spec.mjs
  expect(await refus(db, alice, 'select public.api_chat_history($1)', ['vip'])).toMatch(/rang_insuffisant/);
});

test('les anciens messages figés ne sont plus servis ; visiteurs et écritures directes refusés', async () => {
  await q(db, `insert into public.chat_messages (room_id, user_id, message_type, text_content) values ('m:clasico', $1, 'msg', 'Vieux message en français figé')`, [bob]);
  expect((await api(alice, `public.api_chat_history('m:clasico')`)).msgs).toEqual([]);
  expect(await refus(db, null, `select public.api_chat_history('general')`)).toMatch(/permission denied/);
  expect(await refus(db, null, `select public.api_chat_send('general', 'spam')`)).toMatch(/permission denied/);
  expect(await refus(db, alice, `insert into public.chat_messages (room_id, user_id, text_content, source) values ('general', auth.uid(), 'triche', 'joueur')`)).toMatch(/permission denied/);
  expect(await refus(db, alice, `update public.chat_messages set text_content = 'modifié'`)).toMatch(/permission denied/);
  expect(await refus(db, alice, `select wm.chat_salon('general')`)).toMatch(/permission denied/);
});
