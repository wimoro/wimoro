// Propositions de marché côté serveur : rang Or pour proposer, votes de la communauté déduits du temps écoulé,
// mise en ligne à 25 votes (marché, carnet, chat), votes des autres joueurs, texte des joueurs filtré.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, alice, bob, carol;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  alice = await creerJoueur(db, 'alice', 100); bob = await creerJoueur(db, 'bob', 100); carol = await creerJoueur(db, 'carol', 100);
  await q(db, 'update public.user_stats set xp = 1500, bets_settled = 25, bets_won = 15, deposits_count = 1 where user_id = any ($1)', [[alice, bob]]);   // rang Or
});
test.afterAll(async () => { await db.close(); });

const api = async (uid, sql, params) => (await enTantQue(db, uid, s => s(`select public.${sql} as r`, params)))[0].r;
const demain = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const BASE = () => ({ q: 'Le PSG gagnera-t-il la Ligue des champions 2027 ?', cat: 'Football', date: demain(), time: '21:00', src: 'Site officiel de l’UEFA', rules: 'Ce marché se résout par Oui si le PSG remporte la finale 2027.', p0: 35 });
const proposer = (qui, p = {}) => api(qui, 'api_proposal_create($1::jsonb)', [JSON.stringify({ ...BASE(), ...p })]);
const non = (qui, p = {}) => refus(db, qui, 'select public.api_proposal_create($1::jsonb)', [JSON.stringify({ ...BASE(), ...p })]);
const vieillir = (id, secondes) => q(db, `update wm.propositions set cree_at = now() - make_interval(secs => $2) where id = $1`, [id, secondes]);
const xp = async u => (await q(db, 'select xp from public.user_stats where user_id = $1', [u]))[0].xp;

test('proposer : rang Or, mêmes contrôles que l’écran, texte des joueurs filtré, bornes', async () => {
  expect(await refus(db, null, `select public.api_proposal_create('{}'::jsonb)`)).toMatch(/permission denied/);
  expect(await non(carol)).toMatch(/rang_insuffisant/);
  expect(await non(alice, { q: 'Trop court ?' })).toMatch(/question_invalide/);
  expect(await non(alice, { q: 'Une question sans point d’interrogation' })).toMatch(/question_invalide/);
  expect(await non(alice, { cat: 'Jardinage' })).toMatch(/categorie_invalide/);
  expect(await non(alice, { date: '2020-01-01' })).toMatch(/date_invalide/);
  expect(await non(alice, { time: 'midi' })).toMatch(/date_invalide/);
  expect(await non(alice, { src: 'x' })).toMatch(/source_invalide/);
  expect(await non(alice, { rules: 'Trop court.' })).toMatch(/regles_invalides/);
  for (const p0 of [4, 96, 50.5]) expect(await non(alice, { p0 }), 'p0 ' + p0).toMatch(/montant_invalide/);
  for (const mauvais of ['Le PSG <script>alert(1)</script> gagnera-t-il ?', 'Le PSG "gagnera"-t-il la coupe 2027 ?', 'Le PSG `gagnera`-t-il la coupe 2027 ?', 'Le PSG \\ gagnera-t-il la coupe 2027 ?'])
    expect(await non(alice, { q: mauvais }), mauvais).toMatch(/texte_refuse/);
  expect(await non(alice, { rules: 'Ce marché se résout par Oui si <img src=x onerror=alert(1)> gagne.' })).toMatch(/texte_refuse/);
  expect(await xp(alice)).toBe(1500);

  const r = await proposer(alice, { q: "  L'OM  gagnera-t-il\nla Ligue 1 en 2027 ? ", rules: "Ce marché se résout par Oui si l'OM est\nchampion de France 2027." });
  expect(r.prop).toMatchObject({ q: 'L’OM gagnera-t-il la Ligue 1 en 2027 ?', cat: 'Football', time: '21:00', p0: 35, status: 'vote', for: 1, against: 0, need: 25, mid: null });   // une ligne, apostrophes typographiques
  expect(r.prop.rules).toBe('Ce marché se résout par Oui si l’OM est champion de France 2027.');
  expect(r.me.xp).toBe(1510);                                                                    // +10 XP à l'envoi
  expect(r.ev.filter(e => e.k === 'notif' && e.n.code === 'prop_vote').map(e => e.n.p.q)).toEqual(['L’OM gagnera-t-il la Ligue 1 en…']);   // titre court, comme à l'écran
  expect(r.props.mine).toHaveLength(1);
  expect(await non(alice, { q: "l'om gagnera-t-il la ligue 1 en 2027 ?" })).toMatch(/proposition_en_double/);
  for (let i = 0; i < 4; i++) await proposer(alice, { q: `Le marché numéro ${i} montera-t-il en 2027 ?` });
  expect(await non(alice, { q: 'Un sixième marché le même jour sera-t-il accepté ?' })).toMatch(/trop_de_propositions/);
  expect(await refus(db, alice, 'select * from wm.propositions')).toMatch(/permission denied/);
  expect(await refus(db, alice, `select wm.props_etat('${bob}')`)).toMatch(/permission denied/);
  expect(await refus(db, alice, 'select wm.prop_promouvoir(1)')).toMatch(/permission denied/);
});

test('la communauté vote au rythme de la démo ; à 25 votes le pari passe en ligne : marché, carnet, chat, +50 XP, annonce à tous', async () => {
  const [{ id }] = await q(db, `select id from wm.propositions where user_id = $1 and q like 'L’OM%'`, [alice]);
  await vieillir(id, 15);                                                                        // 15 s : 10 votes de la communauté
  let e = await api(alice, 'api_state()');
  expect(e.props.mine.find(p => p.id === id)).toMatchObject({ status: 'vote', for: 11, against: 1 });
  expect(await q(db, `select count(*)::int as n from public.markets where id like 'perso-%'`)).toEqual([{ n: 0 }]);
  await vieillir(id, 40);                                                                        // 40 s : le compte y est
  const xp0 = await xp(alice), envois0 = (await q(db, `select count(*)::int as n from realtime.messages where topic = 'marches' and event = 'etat'`))[0].n;
  const r = await api(alice, 'api_proposals()');
  const p = r.props.mine.find(x => x.id === id), mid = 'perso-l-om-gagnera-t-il-la-lig-' + id;
  expect(p).toMatchObject({ status: 'live', for: 25, against: 4, mid });
  expect(r.me.xp).toBe(xp0 + 50);
  expect(r.ev.filter(x => x.k === 'notif' && x.n.code === 'prop_live').map(x => x.n.p.m)).toEqual([mid]);
  expect((await q(db, `select category, question, short_question, creator_user_id, status, resolution_rules from public.markets where id = $1`, [mid]))[0])
    .toEqual({ category: 'Football', question: 'L’OM gagnera-t-il la Ligue 1 en 2027 ?', short_question: 'L’OM gagnera-t-il la Ligue 1 en…', creator_user_id: alice, status: 'open',
      resolution_rules: 'Ce marché se résout par Oui si l’OM est champion de France 2027. Source : Site officiel de l’UEFA.' });
  expect((await q(db, `select current_probability::float8 as p, volume_total::float8 as vol, participants_count as n, liquidity_depth::float8 as liq from public.market_live_state where market_id = $1`, [mid]))[0]).toEqual({ p: 35, vol: 250, n: 12, liq: 400 });
  expect((await q(db, `select kind, market_id from public.chat_rooms where id = $1`, ['m:' + mid]))[0]).toEqual({ kind: 'market', market_id: mid });
  expect((await q(db, `select count(*)::int as n from realtime.messages where topic = 'marches' and event = 'etat'`))[0].n).toBe(envois0 + 1);
  const marches = await api(carol, 'api_markets()');                                             // tout le monde le voit, avec sa fiche
  expect(marches.m[mid]).toMatchObject({ st: 'open', def: { q: 'L’OM gagnera-t-il la Ligue 1 en 2027 ?', cat: 'Football', time: '21:00' } });
  expect((await api(alice, 'api_proposals()')).props.mine.find(x => x.id === id)).toMatchObject({ status: 'live', for: 25, against: 4 });   // stable ensuite
  await api(bob, `api_buy($1, 'oui', 10, gen_random_uuid())`, [mid]);                            // on peut y parier
  expect((await api(bob, 'api_state()')).positions).toMatchObject([{ m: mid, s: 'oui' }]);
});

test('voter pour la proposition d’un autre : une fois, +2 XP ; pas la sienne ; le vote d’un joueur peut faire passer le pari en ligne', async () => {
  const p = (await proposer(bob, { q: 'Le Bitcoin dépassera-t-il 200 000 $ en 2027 ?', cat: 'Crypto' })).prop;
  const vus = (await api(carol, 'api_state()')).props;
  expect(vus.vote.map(x => x.code || x.id)).toEqual(expect.arrayContaining([p.id, 'pp-psg', 'pp-jeu', 'pp-sol']));
  expect(vus.vote.find(x => x.id === p.id)).toMatchObject({ by: bob, voted: null });
  expect(vus.users[bob]).toMatchObject({ n: 'bob' });
  expect(await refus(db, bob, 'select public.api_proposal_vote($1, $2)', [p.id, 'for'])).toMatch(/proposition_indisponible/);   // pas la sienne
  expect(await refus(db, carol, 'select public.api_proposal_vote($1, $2)', [p.id, 'peut-etre'])).toMatch(/vote_invalide/);
  const x0 = await xp(carol);
  const r = await api(carol, 'api_proposal_vote($1, $2)', [p.id, 'against']);
  expect(r.me.xp).toBe(x0 + 2);
  expect(r.props.vote.find(x => x.id === p.id)).toMatchObject({ voted: 'against' });
  expect(await refus(db, carol, 'select public.api_proposal_vote($1, $2)', [p.id, 'for'])).toMatch(/deja_vote/);
  expect(await xp(carol)).toBe(x0 + 2);
  // contenu de démonstration : on peut voter, il ne passe jamais en ligne
  const psg = vus.vote.find(x => x.code === 'pp-psg');
  expect(psg).toMatchObject({ for: 38, against: 9, need: 50, status: 'vote' });
  expect((await api(carol, 'api_proposal_vote($1, $2)', [psg.id, 'for'])).props.vote.find(x => x.code === 'pp-psg')).toMatchObject({ for: 39, voted: 'for' });
  await q(db, `update wm.propositions set base_pour = 500 where code = 'pp-psg'`);
  expect((await api(carol, 'api_proposals()')).props.vote.find(x => x.code === 'pp-psg')).toMatchObject({ for: 49, status: 'vote' });
  await q(db, `update wm.propositions set base_pour = 38 where code = 'pp-psg'`);
  // le vote d'un compte supprimé disparaît avec lui : les compteurs ne dérivent pas
  const dave = await creerJoueur(db, 'dave', 0);
  expect((await api(dave, 'api_proposal_vote($1, $2)', [psg.id, 'for'])).props.vote.find(x => x.code === 'pp-psg')).toMatchObject({ for: 40 });
  await q(db, 'delete from public.users where id = $1', [dave]);
  expect((await api(carol, 'api_proposals()')).props.vote.find(x => x.code === 'pp-psg')).toMatchObject({ for: 39, against: 9 });
  // 24 votes déjà là : celui d'alice fait passer le pari de bob en ligne
  await q(db, `update wm.propositions set cree_at = now(), base_pour = 24 where id = $1`, [p.id]);
  const v = await api(alice, 'api_proposal_vote($1, $2)', [p.id, 'for']);
  expect(v.props.vote.find(x => x.id === p.id)).toBeUndefined();
  expect((await q(db, 'select etat, market_id from wm.propositions where id = $1', [p.id]))[0]).toMatchObject({ etat: 'live' });
  expect((await q(db, `select params from public.notifications where user_id = $1 and code = 'prop_live'`, [bob])).length).toBe(1);
});

test('outils de texte : identifiant et titre court comme à l’écran', async () => {
  const [r] = await q(db, `select wm.slug('Élections : qui gagnera en 2027 ?') as a, wm.slug('???') as b, wm.titre_court('Court ?') as c, wm.titre_court('Le PSG sera-t-il champion de France 2027 ?') as d, wm.titre_court('Motsanslemoindreespacequidepasselargementlalimite ?') as e`);
  expect(r).toEqual({ a: 'elections-qui-gagnera-en', b: '', c: 'Court', d: 'Le PSG sera-t-il champion de…', e: 'Motsanslemoindreespacequidepassela…' });
});
