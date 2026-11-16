// Mode Pro, côté serveur : partager une analyse (un instantané du graphique) dans les chats. L'instantané est un contenu
// écrit par un joueur : le serveur le remet au propre avant de le garder, et ne le sert qu'aux lecteurs du salon.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, lea, max, zoe;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  lea = await creerJoueur(db, 'lea', 100); max = await creerJoueur(db, 'max', 100); zoe = await creerJoueur(db, 'zoe', 100);
  for (const u of [lea, max, zoe]) await enTantQue(db, u, s => s('select public.api_state()'));
  await q(db, `update public.user_stats set xp = 400, bets_settled = 3 where user_id in ($1, $2, $3)`, [lea, max, zoe]);   // rang Bronze : messages privés débloqués
  await q(db, `insert into public.users (username, email, is_demo) select 'bot' || i, 'bot' || i || '@nulle.part', true from generate_series(1, 20) i`);
});
test.afterAll(async () => { await db.close(); });
const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const non = (uid, sql, params) => refus(db, uid, `select public.${sql}`, params);
const partager = (uid, s, salons, texte = '') => api(uid, 'api_ana_share($1::jsonb, $2::text[], $3)', [typeof s === 'string' ? s : JSON.stringify(s), salons, texte]);
const refuse = (uid, s, salons = ['general'], texte = '') => non(uid, 'api_ana_share($1::jsonb, $2::text[], $3)', [typeof s === 'string' ? s : JSON.stringify(s), salons, texte]);
const lire = (uid, ids) => api(uid, 'api_ana($1::bigint[])', [ids]).then(r => r.snaps);
const plusTard = () => q(db, `update public.chat_messages set created_at = created_at - interval '2 minutes'`);
const T = 1794800000000, suite = (n, x) => Array.from({ length: n }, (_, i) => x + i);
/** un instantané tel que l'écran l'envoie (proSnap), avec en plus ce qu'un tricheur y glisserait */
const snap = (plus = {}) => {
  const n = 6;
  return { v: 1, id: 'aclient', m: 'btc150k', short: '<b>faux titre</b>', q: 'fausse question', iv: '1h', type: 'bougies', side: 'oui', at: 1, p: 12,
    ms: 3600000, T0: T, n, o: suite(n, 50), h: suite(n, 51), l: suite(n, 49), c: suite(n, 50.5), vol: suite(n, 1000), end: n + 2.123456789, vn: 8,
    inds: [{ id: 'i<x>', k: 'sma', p: { len: 20, pirate: '<script>' }, c: '#F59A0B', w: 2, vals: { a: [null, null, 50.123, 50.2, 50.3, 50.4] } },
           { id: 'ib', k: 'bb', p: { len: 20, k: 2 }, c: 'ink', w: 1, vals: { a: suite(n, 50), b: suite(n, 52), c: suite(n, 48) } }],
    dr: [{ id: 'd1', k: 'trend', a: [T, 50], b: [T + 3600000, 52.5], c: '#2448FF', w: 2, txt: '' },
         { id: '"><img>', k: 'text', a: [T + 1000000.5, 51.123456], b: [1, 2], c: 'ink', w: 2, txt: `Support <b>"fort"</b> d'ici \\ \`là\`` }],
    by: { u: 'me', n: 'usurpé', t: 8, d: 1 }, pirate: { x: 1 }, ...plus };
};
const ind = plus => ({ inds: [{ ...snap().inds[0], ...plus }] });
const trace = plus => ({ dr: [{ ...snap().dr[0], ...plus }] });
let MSG, MSG_M, ANA;

test('partager dans le général et dans le chat du marché : l’instantané est remis au propre, le message ne porte qu’une référence, et compte comme un message', async () => {
  expect(await refus(db, null, `select public.api_ana_share('{}'::jsonb, array['general'], '')`)).toMatch(/permission denied/);
  await q(db, 'truncate realtime.messages');
  const avant = (await q(db, 'select coalesce(messages_total, 0) as n from public.user_stats where user_id = $1', [lea]))[0];
  const r = await partager(lea, snap(), ['general', 'm:btc150k'], '  Cassure en vue\u0007 ');
  MSG = r.msgs.general.id; MSG_M = r.msgs['m:btc150k'].id; ANA = r.msgs.general.ana.ana;
  expect(r.msgs.general).toMatchObject({ u: lea, k: 'ana', text: 'Cassure en vue', ana: { ana: ANA, m: 'btc150k', iv: '1h', ni: 2, nd: 2 } });
  expect(r.msgs['m:btc150k'].ana.ana).toBe(ANA);                                                 // une seule analyse, deux messages
  const s = r.snap;
  expect(Object.keys(s).sort()).toEqual(['T0', 'at', 'c', 'dr', 'end', 'h', 'id', 'inds', 'iv', 'l', 'm', 'ms', 'n', 'o', 'p', 'side', 'type', 'v', 'vn', 'vol']);   // ni titre, ni auteur, ni champ inconnu
  expect(s).toMatchObject({ v: 1, id: 'a' + ANA, m: 'btc150k', iv: '1h', type: 'bougies', side: 'oui', p: 63, ms: 3600000, T0: T, n: 6, end: 8.1235, vn: 8,
    o: suite(6, 50), c: suite(6, 50.5), vol: suite(6, 1000) });                                  // le prix est celui du serveur, pas celui annoncé
  expect(s.inds).toEqual([
    { id: 'i1', k: 'sma', p: { len: 20 }, c: '#F59A0B', w: 2, vals: { a: [null, null, 50.12, 50.2, 50.3, 50.4] } },
    { id: 'i2', k: 'bb', p: { len: 20, k: 2 }, c: 'ink', w: 1, vals: { a: suite(6, 50), b: suite(6, 52), c: suite(6, 48) } }]);
  expect(s.dr).toEqual([
    { id: 'd1', k: 'trend', a: [T, 50], b: [T + 3600000, 52.5], c: '#2448FF', w: 2, txt: '' },
    { id: 'd2', k: 'text', a: [T + 1000001, 51.1235], c: 'ink', w: 2, txt: 'Support ‹b›”fort”‹/b› d’ici / ’là’' }]);   // plus aucun caractère lisible comme du code
  expect(JSON.stringify(s), 'ni chevron, ni accent grave, ni guillemet droit ou barre inverse dans un texte').not.toMatch(/[<>`\\]|script|usurp|faux|pirate/);
  // diffusé aux deux salons, sans l'instantané (une référence seulement)
  const d = await q(db, `select topic, event, private, payload from realtime.messages order by topic`);
  expect(d.map(x => [x.topic, x.event, x.private, x.payload.k, x.payload.ana.ana, 'o' in x.payload])).toEqual([['salon:general', 'msg', false, 'ana', ANA, false], ['salon:m:btc150k', 'msg', false, 'ana', ANA, false]]);
  expect(d[0].payload.f).toMatchObject({ n: 'lea' });
  // progression : celle d'un seul message
  expect((await q(db, 'select chat_xp_today as xp, messages_total as n from public.user_stats where user_id = $1', [lea]))[0]).toEqual({ xp: 2, n: avant.n + 1 });
  expect(r.ev.map(e => e.k)).toContain('xp');
  // gardée une fois, hors de portée directe des joueurs
  expect(await q(db, 'select user_id, market_id, octets > 200 as pese from wm.analyses')).toEqual([{ user_id: lea, market_id: 'btc150k', pese: true }]);
  expect(await refus(db, lea, 'select * from wm.analyses')).toMatch(/permission denied/);
  expect(await refus(db, lea, `select wm.ana_propre('{}'::jsonb)`)).toMatch(/permission denied/);
  // l'historique du salon porte la référence
  const h = await api(max, `api_chat_history('general')`);
  expect(h.msgs.find(m => m.id === MSG)).toMatchObject({ k: 'ana', text: 'Cassure en vue', ana: { ana: ANA, m: 'btc150k' } });
});

test('tout ce qui sort du format est refusé, et rien n’est gardé : champs, bornes, couleurs, tailles, salons', async () => {
  await plusTard();
  const avant = (await q(db, 'select count(*)::int as n from wm.analyses'))[0].n;
  const mauvais = {
    'pas un objet': '[1,2]',
    'marché inconnu': snap({ m: 'nexistepas' }),
    'intervalle inconnu': snap({ iv: '2h' }),
    'type inconnu': snap({ type: 'camembert' }),
    'côté inconnu': snap({ side: 'peut-être' }),
    'durée de bougie inventée': snap({ ms: 12345 }),
    'nombre de bougies qui ne correspond pas': snap({ n: 7 }),
    'trop de bougies': snap({ n: 4001 }),
    'nombre de bougies non entier': snap({ n: 6.5 }),
    'prix hors bornes': snap({ h: [51, 52, 53, 54, 55, 101] }),
    'texte dans une suite de prix': snap({ c: [50, 51, '<svg onload=alert(1)>', 53, 54, 55] }),
    'objet dans une suite de prix': snap({ o: [50, 51, { x: 1 }, 53, 54, 55] }),
    'volume négatif': snap({ vol: [1, 2, 3, 4, 5, -1] }),
    'date de départ dans un futur lointain': snap({ T0: 99999999999999 }),
    'fenêtre incohérente': snap({ end: 99999 }),
    'indicateurs : pas une liste': snap({ inds: { 0: 1 } }),
    'indicateur inconnu': snap(ind({ k: 'ichimoku' })),
    'réglage hors bornes': snap(ind({ p: { len: 1 } })),
    'réglage non entier': snap(ind({ p: { len: 20.5 } })),
    'réglage absent': snap(ind({ p: {} })),
    'couleur qui porte du code': snap(ind({ c: '#fff" onload="alert(1)' })),
    'couleur nommée': snap(ind({ c: 'red' })),
    'épaisseur qui porte du code': snap(ind({ w: '2"/><script>alert(1)</script>' })),
    'épaisseur hors bornes': snap(ind({ w: 9 })),
    'valeurs : courbe en trop': snap(ind({ vals: { a: suite(6, 50), z: suite(6, 1) } })),
    'valeurs : courbe manquante': snap({ inds: [{ ...snap().inds[1], vals: { a: suite(6, 50), b: suite(6, 52) } }] }),
    'valeurs : mauvaise longueur': snap(ind({ vals: { a: [1, 2, 3] } })),
    'MACD : lente plus courte que rapide': snap(ind({ k: 'macd', p: { fast: 26, slow: 12, sig: 9 }, vals: { a: suite(6, 0), b: suite(6, 0), c: suite(6, 0) } })),
    'VWAP : ancrage inconnu': snap(ind({ k: 'vwap', p: { anc: 'jamais' } })),
    'trop d’indicateurs': snap({ inds: Array.from({ length: 25 }, () => snap().inds[0]) }),
    'tracés : pas une liste': snap({ dr: 'x' }),
    'tracé inconnu': snap(trace({ k: 'gribouillis' })),
    'point à trois coordonnées': snap(trace({ a: [T, 50, 1] })),
    'point non numérique': snap(trace({ a: [T, '50'] })),
    'second point manquant': snap(trace({ b: undefined })),
    'texte de tracé qui n’est pas un texte': snap(trace({ txt: { html: '<b>' } })),
    'trop de tracés': snap({ dr: Array.from({ length: 301 }, () => snap().dr[0]) }),
    'nombre démesuré': JSON.stringify(snap()).replace('"vn":8', '"vn":1e60'),
  };
  for (const [quoi, s] of Object.entries(mauvais)) expect(await refuse(lea, s), quoi).toMatch(quoi === 'marché inconnu' ? /marche_inconnu/ : /analyse_invalide/);
  // trop lourde : 24 indicateurs à trois courbes sur 4 000 bougies
  const n = 4000, lourd = snap({ n, o: suite(n, 0).map(i => 50 + i % 40 + .55), h: suite(n, 0).map(() => 99.55), l: suite(n, 0).map(() => 1.55), c: suite(n, 0).map(() => 50.55), vol: suite(n, 1000),
    end: n, vn: 100, inds: Array.from({ length: 24 }, () => ({ k: 'macd', p: { fast: 12, slow: 26, sig: 9 }, c: 'ink', w: 1, vals: { a: suite(n, 0).map(() => 12.55), b: suite(n, 0).map(() => 12.55), c: suite(n, 0).map(() => 12.55) } })), dr: [] });
  expect(await refuse(lea, lourd)).toMatch(/analyse_trop_lourde/);
  // salons : un à quatre, chacun une fois ; le marché analysé seulement ; son clan seulement ; un ami seulement
  expect(await refuse(lea, snap(), [])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['m:clasico'])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['general', 'general'])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['vip'])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['clan:c1'])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['dm:' + zoe])).toMatch(/pas_amis/);
  expect(await refuse(lea, snap(), ['dm:pas-un-identifiant'])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['general', 'm:btc150k', 'clan:c1', 'dm:' + max, 'vip'])).toMatch(/salon_indisponible/);
  expect(await refuse(lea, snap(), ['general'], 'x'.repeat(281))).toMatch(/message_trop_long/);
  expect((await q(db, 'select count(*)::int as n from wm.analyses'))[0].n, 'rien n’est gardé d’un partage refusé').toBe(avant);
  expect((await q(db, `select count(*)::int as n from public.chat_messages where message_type = 'ana'`))[0].n).toBe(2);
  // les réglages aux bornes, eux, passent
  const ok = await partager(lea, snap({ iv: 'max', ms: 604800000, type: 'courbe', side: 'non', inds: [{ k: 'macd', p: { fast: 2, slow: 3, sig: 100 }, c: '#abcdef', w: 3, vals: { a: suite(6, -5), b: suite(6, 0), c: suite(6, 5) } }, { k: 'vwap', p: { anc: 'week' }, c: 'ink', w: 1, vals: { a: [null, null, null, null, null, null] } }], dr: [] }), ['general']);
  expect(ok.snap.inds.map(i => [i.k, i.p])).toEqual([['macd', { fast: 2, slow: 3, sig: 100 }], ['vwap', { anc: 'week' }]]);
});

test('lire un instantané : avec les droits du salon de son message (public, clan, message privé), et plus du tout une fois masqué', async () => {
  const propre = (await q(db, 'select snap from wm.analyses where id = $1', [ANA]))[0].snap;
  const lu = await lire(max, [MSG, MSG_M]);
  expect(Object.keys(lu).sort()).toEqual([String(MSG), String(MSG_M)].sort());
  expect(lu[MSG]).toMatchObject({ ...propre, id: 'a' + ANA });
  expect(typeof lu[MSG].at).toBe('number');
  expect(await refus(db, null, 'select public.api_ana($1::bigint[])', [[MSG]])).toMatch(/permission denied/);
  expect(await non(max, 'api_ana($1::bigint[])', [[]])).toMatch(/analyse_inconnue/);
  expect(await non(max, 'api_ana($1::bigint[])', [[1, 2, 3, 4, 5, 6, 7]])).toMatch(/analyse_inconnue/);
  const texte = (await api(max, `api_chat_send('general', 'Bien vu')`)).msg.id;
  expect(await lire(max, [texte, 999999]), 'un message ordinaire ou inconnu ne sert rien').toEqual({});

  // message privé : Léa l'envoie à Max, son ami ; Zoé, amie de Léa seulement, n'y a pas accès
  await api(lea, `api_friend('add', $1)`, [max]); await api(max, `api_friend('accept', $1)`, [lea]);
  await api(zoe, `api_friend('add', $1)`, [lea]); await api(lea, `api_friend('accept', $1)`, [zoe]);
  await plusTard(); await q(db, 'truncate realtime.messages');
  const prive = await partager(lea, snap({ dr: [] }), ['dm:' + max], 'Pour toi');
  const dm = prive.msgs['dm:' + max].id;
  expect(await q(db, `select topic, event, private, payload ->> 'k' as k from realtime.messages where event in ('dm', 'msg')`)).toEqual([{ topic: 'joueur:' + max, event: 'dm', private: true, k: 'ana' }]);
  expect((await q(db, `select code from public.notifications where user_id = $1 and code = 'dm_recu'`, [max]))).toHaveLength(1);
  expect((await api(max, 'api_dm_history($1)', [lea])).msgs.find(m => m.id === dm)).toMatchObject({ k: 'ana', text: 'Pour toi' });
  expect(Object.keys(await lire(max, [dm]))).toEqual([String(dm)]);
  expect(Object.keys(await lire(lea, [dm]))).toEqual([String(dm)]);
  expect(await lire(zoe, [dm]), 'un tiers ne lit pas l’analyse d’une conversation privée').toEqual({});
  await api(max, `api_friend('remove', $1)`, [lea]);
  expect(await lire(max, [dm]), 'plus amis : la conversation est fermée, l’analyse aussi').toEqual({});

  // clan : diffusée sur le sujet privé du clan, lue par ses membres seulement
  await api(lea, `api_clan_join('c1', null)`);
  await plusTard(); await q(db, 'truncate realtime.messages');
  const clan = (await partager(lea, snap({ inds: [] }), ['clan:c1'])).msgs['clan:c1'].id;
  expect(await q(db, `select topic, event, private from realtime.messages where event in ('dm', 'msg')`)).toEqual([{ topic: 'clan:c1', event: 'msg', private: true }]);
  expect(await lire(zoe, [clan]), 'hors du clan : rien').toEqual({});
  await api(zoe, `api_clan_join('c1', null)`);
  expect(Object.keys(await lire(zoe, [clan]))).toEqual([String(clan)]);

  // masqué par l'administration : le message disparaît, son instantané n'est plus servi par lui
  await q(db, `select wm.adm_chat_masquer($1, $2)`, [lea, MSG]);
  expect(await lire(max, [MSG]), 'message masqué').toEqual({});
  expect(Object.keys(await lire(max, [MSG_M])), 'le même partage dans un autre salon se masque à part').toEqual([String(MSG_M)]);
});

test('limites : pas deux partages coup sur coup, 12 analyses par 24 heures', async () => {
  await plusTard();
  await partager(max, snap(), ['general']);
  expect(await refuse(max, snap(), ['general'])).toMatch(/trop_vite/);
  for (let i = 0; i < 11; i++) { await plusTard(); await partager(max, snap(), ['general']); }
  await plusTard();
  expect(await refuse(max, snap(), ['general'])).toMatch(/trop_d_analyses/);
  await q(db, `update wm.analyses set at = at - interval '25 hours' where user_id = $1`, [max]);
  expect((await partager(max, snap(), ['general'])).msgs.general.k).toBe('ana');                 // le lendemain, c'est reparti
});

test('dans un salon public regardé, un joueur simulé répond à l’analyse quelques secondes plus tard, une seule fois', async () => {
  await plusTard();
  await enTantQue(db, zoe, s => s('select public.api_present()'));                               // un joueur est à l'écran
  await api(zoe, `api_chat_history('m:btc150k')`);                                                // et regarde le chat du marché
  const id = (await partager(zoe, snap(), ['m:btc150k'], 'Ma lecture')).msgs['m:btc150k'].id;
  const reponses = async () => (await q(db, `select msgs from wm.chat_bots where room = 'm:btc150k'`))[0].msgs.filter(m => m.tpl && m.tpl.g === 'A');
  await q(db, 'truncate realtime.messages');
  await q(db, 'select wm.bots_chat()');
  expect(await reponses(), 'pas dans les trois premières secondes').toEqual([]);
  await q(db, `update public.chat_messages set created_at = created_at - interval '5 seconds' where id = $1`, [id]);
  await q(db, 'select wm.bots_chat()');
  const r = await reponses();
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({ k: 'msg', text: '', tpl: { g: 'A', n: 'zoe', a: id } });
  expect(String(r[0].id)).toMatch(/^b\d+$/);
  expect((await q(db, 'select is_demo from public.users where id = $1', [r[0].u]))[0].is_demo).toBe(true);
  const d = await q(db, `select payload from realtime.messages where topic = 'salon:m:btc150k' and event = 'msg' and payload -> 'tpl' ->> 'g' = 'A'`);
  expect(d).toHaveLength(1);
  expect(d[0].payload.f).toMatchObject({ bot: true });
  for (let i = 0; i < 12; i++) await q(db, 'select wm.bots_chat()');
  expect(await reponses(), 'une seule réponse par analyse').toHaveLength(1);
  const h = await api(zoe, `api_chat_history('m:btc150k')`);
  expect(h.msgs.find(m => m.id === id).ana.rep).toBe(1);
  expect(h.msgs.filter(m => m.tpl && m.tpl.g === 'A'), 'la réponse est dans l’historique du salon').toHaveLength(1);
  expect(h.msgs.filter(m => m.tpl && m.tpl.g === 'M').length, 'les autres messages de bots aussi').toBeGreaterThanOrEqual(6);
  // l'analyse masquée (ou partie avec le compte de son auteur) : la réponse qui cite son pseudo n'est plus servie
  await q(db, `select wm.adm_chat_masquer($1, $2)`, [lea, id]);
  const h2 = await api(max, `api_chat_history('m:btc150k')`);
  expect(h2.msgs.filter(m => m.tpl && m.tpl.g === 'A')).toEqual([]);
  expect(JSON.stringify(h2.msgs)).not.toContain('zoe');
  expect(h2.msgs.filter(m => m.tpl && m.tpl.g === 'M').length).toBeGreaterThanOrEqual(6);
});
