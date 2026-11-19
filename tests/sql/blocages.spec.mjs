// Panneau d'administration, lot 2 : blocages par accès, déconnexion forcée, maintenance, et les actions de l'équipe sur
// les joueurs, le chat, les clans et le site. Tout est appliqué par le serveur : un blocage vaut dès l'appel suivant,
// quelle que soit l'interface ; un joueur ordinaire qui appelle la porte est refusé.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, modo, alice, bob, carol, dave, bot;
const uuid = () => crypto.randomUUID();
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); modo = await creerJoueur(db, 'modo', 0);
  alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000); carol = await creerJoueur(db, 'carol', 1000); dave = await creerJoueur(db, 'dave', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [chef]);
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_alpha', 'bot_alpha@nulle.part', true) returning id`);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted'), ($1, $3, 'accepted')`, [alice, bob, carol]);
  await eq(chef, 'equipe_ajouter', { id: modo, role: 'moderateur', motif: 'modération du chat' });
  for (const u of [alice, bob, carol, dave]) await eq(chef, 'joueur_rang', { id: u, t: 1, d: 0, motif: 'rang Bronze pour les essais' });
});
test.afterAll(async () => { await db.close(); });

async function comme(uid, claims, sql, params) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated', ...claims })]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql, params)).rows;
  });
}
async function eq(qui, action, p = {}, claims = {}) { return (await comme(qui, claims, 'select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)]))[0].r; }
const eqNon = (qui, action, p = {}) => eq(qui, action, p).then(() => null, e => e.message);
const api = async (qui, sql, params) => (await enTantQue(db, qui, s => s(sql, params)))[0]?.r;
// l'erreur complète (code et détail), ou null si l'appel passe
const erreur = (qui, sql, params, claims) => (claims ? comme(qui, claims, sql, params) : enTantQue(db, qui, s => s(sql, params))).then(() => null, e => ({ code: e.message, detail: e.detail }));
const srv = (f, u, p) => q(db, `select public.${f}($1, $2::jsonb) as r`, [u, JSON.stringify(p)]).then(() => null, e => ({ code: e.message, detail: e.detail }));
const bloquer = (qui, acces, extra = {}) => eq(chef, 'joueur_bloquer', { id: qui, acces, duree: '1h', motif: 'essai de blocage', ...extra });
const lever = async (blocage) => eq(chef, 'joueur_debloquer', { id: blocage, motif: 'fin de l’essai' });

const ACHAT = `select public.api_buy('btc150k', 'oui', 10, gen_random_uuid()) as r`;
const DEPOT = `select public.api_demo_deposit('{"method":"crypto","coin":"USDC","net":"Base","amt":50}'::jsonb, gen_random_uuid()) as r`;
const RETRAIT = `select public.api_demo_withdraw('{"method":"crypto","net":"Base","addr":"0x1111111111111111111111111111111111111111","amt":10}'::jsonb, gen_random_uuid()) as r`;

test('paris bloqués : achat, combiné, duels, stack, copie, éclair, Série, Blitz refusés dès l’appel suivant ; la vente reste possible ; les autres joueurs ne voient rien', async () => {
  await api(alice, ACHAT);                                                                   // une position, avant le blocage
  const r = await bloquer(alice, 'paris');
  expect(r.j.blocages).toEqual([{ id: r.blocage, acces: 'paris', salon: null, fin: expect.any(Number) }]);
  const b = await erreur(alice, ACHAT);
  expect(b.code).toBe('bloque');
  expect(JSON.parse(b.detail)).toMatchObject({ acces: 'paris', salon: null });
  expect(JSON.parse(b.detail).fin).toBeGreaterThan(Date.now() + 3500000);
  for (const sql of [
    `select public.api_combo_place('{"stake":5,"key":"${uuid()}","legs":[{"m":"btc150k","s":"oui"},{"m":"clasico","s":"non"}]}'::jsonb) as r`,
    `select public.api_duel_create('{"m":"btc150k","side":"oui","stake":10,"key":"${uuid()}"}'::jsonb) as r`,
    `select public.api_stack_create('{"buyin":10,"key":"${uuid()}","opp":"${bot}"}'::jsonb) as r`,
    `select public.api_copy_start('{"u":"${bob}","budget":100,"per":10}'::jsonb) as r`])
    expect((await erreur(alice, sql))?.code, sql).toBe('bloque');
  // chemin des Edge Functions (clé de service) : même refus
  expect((await srv('srv_eclair_miser', alice, { manche: 1, jeu: 'btc', cote: 'oui', amt: 10, key: uuid() }))?.code).toBe('bloque');
  expect((await srv('srv_serie_start', alice, { gid: 'btc', t: Date.now(), p0: 100, stake: 10, key: uuid() }))?.code).toBe('bloque');
  expect((await srv('srv_blitz_join', alice, { id: 1, debut: Date.now() + 60000, buyin: 10, key: uuid() }))?.code).toBe('bloque');
  expect((await srv('srv_duel_eclair_creer', alice, { gid: 'btc', side: 'oui', stake: 10, key: uuid(), prix: 50 }))?.code).toBe('bloque');
  // accepter un duel, c'est parier aussi
  const d = await api(bob, `select public.api_duel_create('{"m":"btc150k","side":"oui","stake":10,"opp":"${alice}","key":"${uuid()}"}'::jsonb) as r`);
  expect((await erreur(alice, `select public.api_duel_accept('{"id":${d.duel.id}}'::jsonb) as r`))?.code).toBe('bloque');
  // vendre reste possible ; bob, lui, parie normalement
  const pos = (await q(db, `select shares::float8 as sh from public.positions where user_id = $1 and market_id = 'btc150k'`, [alice]))[0].sh;
  expect((await api(alice, `select public.api_sell('btc150k', 'oui', $1, gen_random_uuid()) as r`, [pos / 2])).q.sh).toBeGreaterThan(0);
  expect((await api(bob, ACHAT)).pos.m).toBe('btc150k');
  await lever(r.blocage);
  expect((await api(alice, ACHAT)).pos.m).toBe('btc150k');                                   // levé : l'appel suivant passe
});

test('dépôts, retraits, création de marchés, clans : chacun son blocage', async () => {
  let r = await bloquer(alice, 'depots');
  expect((await erreur(alice, DEPOT))?.code).toBe('bloque');
  expect((await api(alice, RETRAIT)).wd).toBeTruthy();                                       // le retrait n'est pas concerné
  await lever(r.blocage);
  expect((await api(alice, DEPOT)).dep).toBeTruthy();
  r = await bloquer(alice, 'retraits');
  expect((await erreur(alice, RETRAIT))?.code).toBe('bloque');
  expect((await api(alice, DEPOT)).dep).toBeTruthy();
  await lever(r.blocage);
  r = await bloquer(alice, 'creation');
  expect((await erreur(alice, `select public.api_proposal_create('{"q":"Le Bitcoin passera-t-il 200 000 $ cette année ?"}'::jsonb) as r`))?.code).toBe('bloque');
  await lever(r.blocage);
  r = await bloquer(alice, 'clans');
  expect((await erreur(alice, `select public.api_clan_create('{"name":"Les Essais","tag":"ESS"}'::jsonb) as r`))?.code).toBe('bloque');
  expect((await erreur(alice, `select public.api_clan_join('c61', null) as r`))?.code).toBe('bloque');
  expect((await erreur(alice, `select public.api_clan_apply('c62') as r`))?.code).toBe('bloque');
  await lever(r.blocage);
  expect((await erreur(alice, `select public.api_clan_create('{"name":"Les Essais","tag":"ESS"}'::jsonb) as r`))?.code).not.toBe('bloque');
});

test('chat : tout le chat (messages privés compris) ou un seul salon', async () => {
  let r = await bloquer(alice, 'chat');
  for (const sql of [`select public.api_chat_send('general', 'bonjour') as r`, `select public.api_chat_send('m:btc150k', 'bonjour') as r`,
    `select public.api_dm_send('${bob}', 'coucou') as r`, `select public.api_chat_react('general', '1', '🔥') as r`])
    expect((await erreur(alice, sql))?.code, sql).toBe('bloque');
  await lever(r.blocage);
  r = await bloquer(alice, 'chat', { salon: 'm:btc150k' });
  expect((await erreur(alice, `select public.api_chat_send('m:btc150k', 'bonjour') as r`))?.code).toBe('bloque');
  expect((await api(alice, `select public.api_chat_send('general', 'je parle ici') as r`)).msg.text).toBe('je parle ici');
  await lever(r.blocage);
  r = await bloquer(alice, 'chat', { salon: 'dm' });
  expect((await erreur(alice, `select public.api_dm_send('${bob}', 'coucou') as r`))?.code).toBe('bloque');
  await q(db, `select pg_sleep(1.1)`);                                                       // anti-spam du chat : une seconde entre deux messages
  expect((await api(alice, `select public.api_chat_send('general', 'toujours là') as r`)).msg.text).toBe('toujours là');
  await lever(r.blocage);
  expect(await eqNon(chef, 'joueur_bloquer', { id: alice, acces: 'paris', salon: 'general', duree: '1h', motif: 'essai' })).toMatch(/salon_invalide/);
});

test('site bloqué : le joueur est refusé partout (comme une suspension) ; un blocage échu ou levé ne compte plus ; permanent', async () => {
  const r = await eq(chef, 'joueur_bloquer', { id: carol, acces: 'site', duree: '7j', motif: 'fraude' });
  const e = await erreur(carol, 'select public.api_state() as r');
  expect(e.code).toBe('suspendu');
  expect(Number(e.detail)).toBeGreaterThan(Date.now() + 6.9 * 86400000);
  expect((await srv('srv_serie_start', carol, { gid: 'btc', t: Date.now(), p0: 100, stake: 10, key: uuid() }))?.code).toBe('suspendu');
  expect((await enTantQue(db, null, s => s('select public.api_markets() as r')))[0].r.m.btc150k).toBeTruthy();   // un visiteur, lui, lit toujours
  await lever(r.blocage);
  expect((await api(carol, 'select public.api_state() as r')).me.n).toBe('carol');
  // un blocage dont la fin est passée ne compte plus
  await q(db, `insert into wm.blocages (user_id, acces, debut_at, fin_at, motif, par) values ($1, 'paris', now() - interval '2 hours', now() - interval '1 hour', 'échu', $2)`, [carol, chef]);
  expect((await api(carol, ACHAT)).pos.m).toBe('btc150k');
  const p = await eq(chef, 'joueur_bloquer', { id: carol, acces: 'paris', duree: 'permanent', motif: 'définitif' });
  expect(JSON.parse((await erreur(carol, ACHAT)).detail).fin).toBe(-1);
  expect(p.j.blocages.find(x => x.id === p.blocage).fin).toBe(-1);
  expect(await eqNon(chef, 'joueur_bloquer', { id: carol, acces: 'paris', duree: '2j', motif: 'essai' })).toMatch(/duree_invalide/);
  expect(await eqNon(chef, 'joueur_bloquer', { id: carol, acces: 'tout', duree: '1h', motif: 'essai' })).toMatch(/acces_invalide/);
  expect(await eqNon(chef, 'joueur_bloquer', { id: carol, acces: 'paris', duree: '1h' })).toMatch(/motif_requis/);
  await lever(p.blocage);
  expect(await eqNon(chef, 'joueur_debloquer', { id: p.blocage, motif: 'encore' })).toMatch(/deja_leve/);
});

test('déconnexion forcée : la session d’avant est refusée, même rafraîchie ; une nouvelle connexion passe ; rien n’est effacé', async () => {
  const s1 = uuid(), s2 = uuid();
  await q(db, `insert into auth.sessions (id, user_id, created_at) values ($1, $2, now() - interval '1 hour')`, [s1, dave]);
  const avant = Math.floor(Date.now() / 1000) - 600;
  expect((await comme(dave, { session_id: s1, iat: avant }, 'select public.api_state() as r'))[0].r.me.n).toBe('dave');
  const f = await eq(chef, 'joueur_deconnecter', { id: dave, motif: 'compte partagé' });
  expect(f.j.deconnecte_at).toBeGreaterThan(Date.now() - 60000);
  expect((await erreur(dave, 'select public.api_state() as r', [], { session_id: s1, iat: Math.floor(Date.now() / 1000) + 5 }))?.code).toBe('session');   // jeton rafraîchi, même session
  expect((await erreur(dave, 'select public.api_state() as r', [], { session_id: uuid() }))?.code).toBe('session');      // session inconnue
  expect((await erreur(dave, 'select public.api_state() as r', [], { iat: avant }))?.code).toBe('session');              // jeton émis avant
  expect((await srv('srv_serie_start', dave, { gid: 'btc', t: Date.now(), p0: 100, stake: 10, key: uuid() }))?.code).toBe('session');   // Edge Functions
  await q(db, `insert into auth.sessions (id, user_id, created_at) values ($1, $2, now() + interval '1 second')`, [s2, dave]);   // il se reconnecte
  expect((await comme(dave, { session_id: s2 }, 'select public.api_state() as r'))[0].r.me.n).toBe('dave');
  expect((await erreur(dave, 'select public.api_state() as r', [], { session_id: s1 }))?.code).toBe('session');          // l'ancienne reste refusée
  expect((await comme(dave, { iat: Math.floor(Date.now() / 1000) + 5 }, 'select public.api_state() as r'))[0].r.me.n).toBe('dave');
  expect((await srv('srv_serie_start', dave, { gid: 'btc', t: Date.now(), p0: 100, stake: 10, key: uuid() }))?.code).not.toBe('session');
  expect(await q(db, 'select count(*)::int as n from auth.sessions where user_id = $1', [dave])).toEqual([{ n: 2 }]);    // rien n'a été supprimé
  expect((await api(bob, 'select public.api_state() as r')).me.n).toBe('bob');               // un joueur non concerné ne voit rien
});

test('maintenance : tout joueur est refusé, l’équipe passe, un visiteur lit le message ; l’arrêt rend tout', async () => {
  expect(await eqNon(modo, 'maintenance', { actif: true })).toMatch(/interdit/);
  await eq(chef, 'maintenance', { actif: true, message: { fr: 'Retour vers 15 h', en: 'Back around 3 pm' } });
  expect((await erreur(alice, 'select public.api_state() as r'))?.code).toBe('maintenance');
  expect((await srv('srv_serie_start', alice, { gid: 'btc', t: Date.now(), p0: 100, stake: 10, key: uuid() }))?.code).toBe('maintenance');
  expect((await eq(modo, 'joueurs_chercher', { q: 'ali' })).joueurs.map(j => j.n)).toEqual(['alice']);
  expect((await comme(chef, {}, `select public.api_admin('chiffres', '{}'::jsonb) as r`))[0].r).toHaveProperty('inscrits');
  const s = (await enTantQue(db, null, x => x('select public.api_site() as r')))[0].r;
  expect(s.maintenance).toEqual({ actif: true, message: { fr: 'Retour vers 15 h', en: 'Back around 3 pm' } });
  expect((await enTantQue(db, null, x => x('select public.api_markets() as r')))[0].r.m.btc150k).toBeTruthy();
  expect(await eqNon(chef, 'maintenance', { actif: true })).toMatch(/reglage_inchange/);
  await eq(chef, 'maintenance', { actif: false });
  expect((await api(alice, 'select public.api_state() as r')).me.n).toBe('alice');
});

test('joueurs : recherche (pseudo, e-mail, identifiant), fiche, activité complète', async () => {
  expect((await eq(modo, 'joueurs_chercher', { q: 'ALI' })).joueurs.map(j => j.n)).toEqual(['alice']);
  expect((await eq(modo, 'joueurs_chercher', { q: 'bob@test' })).joueurs.map(j => [j.n, j.email])).toEqual([['bob', 'bob@test.dev']]);
  expect((await eq(modo, 'joueurs_chercher', { q: dave })).joueurs.map(j => j.n)).toEqual(['dave']);
  expect((await eq(modo, 'joueurs_chercher', { q: '%' })).joueurs).toEqual([]);
  const f = await eq(modo, 'joueur_fiche', { id: alice });
  expect(f.j).toMatchObject({ n: 'alice', email: 'alice@test.dev', bot: false, kyc: false, role: null, blocages: [], t: 1 });
  expect(f.j.since).toBeGreaterThan(Date.now() - 600000);
  expect(f.blocages.length).toBeGreaterThanOrEqual(6);                                       // tout l'historique des blocages, levés compris
  expect(f.blocages.every(b => b.actif === false && b.leve_par === 'chef')).toBe(true);
  expect(f.journal.map(e => e.action)).toEqual(expect.arrayContaining(['joueur_bloquer', 'joueur_debloquer', 'joueur_rang']));
  expect((await eq(modo, 'joueur_fiche', { id: dave })).deconnexions).toMatchObject([{ motif: 'compte partagé', par: 'chef' }]);
  expect(await eqNon(modo, 'joueur_fiche', { id: uuid() })).toMatch(/joueur_inconnu/);
  const a = (await eq(modo, 'joueur_activite', { id: alice, n: 200 })).evenements;
  const types = new Set(a.map(e => e.t));
  for (const t of ['argent', 'depot', 'retrait', 'message', 'rang', 'equipe']) expect(types.has(t), t).toBe(true);
  expect(a.find(e => e.t === 'argent' && e.d.k === 'bet')).toBeTruthy();
  expect(a.every((e, i) => i === 0 || e.at <= a[i - 1].at)).toBe(true);                       // le plus récent d'abord
  const d = (await eq(modo, 'joueur_activite', { id: dave })).evenements;
  expect(d.filter(e => e.t === 'connexion').length).toBe(2);
  const page = await eq(modo, 'joueur_activite', { id: alice, n: 5 });
  expect(page.evenements.length).toBe(5);
  expect((await eq(modo, 'joueur_activite', { id: alice, n: 5, avant: page.suite })).evenements[0].at).toBeLessThanOrEqual(page.suite);
  expect((await eq(modo, 'joueur_activite', { id: alice, types: ['message'] })).evenements.every(e => e.t === 'message')).toBe(true);
});

test('solde : une opération « ajustement_admin » (jamais un chiffre écrasé), motif obligatoire, jamais négatif, plafond du modérateur, annulable', async () => {
  const s0 = Number((await q(db, 'select balance from public.user_stats where user_id = $1', [bob]))[0].balance);
  expect(await eqNon(chef, 'joueur_solde', { id: bob, delta: 50 })).toMatch(/motif_requis/);
  expect(await eqNon(chef, 'joueur_solde', { id: bob, delta: 0, motif: 'rien' })).toMatch(/montant_invalide/);
  expect(await eqNon(chef, 'joueur_solde', { id: bob, delta: -1e6, motif: 'trop' })).toMatch(/solde_negatif/);
  expect(await eqNon(chef, 'joueur_solde', { id: chef, delta: 50, motif: 'pour moi' })).toMatch(/interdit/);
  expect(await eqNon(modo, 'joueur_solde', { id: bob, delta: 1500, motif: 'geste' })).toMatch(/plafond_moderateur/);
  const r = await eq(modo, 'joueur_solde', { id: bob, delta: 25.5, motif: 'geste commercial' });
  expect(r.j.balance).toBeCloseTo(s0 + 25.5, 2);
  const [op] = await q(db, `select kind, amount::float8 as a, balance_after::float8 as apres, ref_id from public.balance_ledger where user_id = $1 order by id desc limit 1`, [bob]);
  expect(op).toEqual({ kind: 'ajustement_admin', a: 25.5, apres: s0 + 25.5, ref_id: 'geste commercial' });
  expect((await q(db, `select params from public.notifications where user_id = $1 and code = 'admin_solde' order by created_at desc limit 1`, [bob]))[0].params).toEqual({ delta: 25.5 });
  expect((await q(db, `select topic, event from realtime.messages where topic = $1 and event = 'etat'`, ['joueur:' + bob])).length).toBeGreaterThan(0);
  const [{ id }] = await q(db, `select id from wm.journal where action = 'joueur_solde' order by id desc limit 1`);
  await eq(modo, 'journal_annuler', { id, motif: 'erreur de joueur' });                        // un modérateur annule sa propre décision
  expect(Number((await q(db, 'select balance from public.user_stats where user_id = $1', [bob]))[0].balance)).toBeCloseTo(s0, 2);
  expect((await q(db, `select count(*)::int as n from public.balance_ledger where user_id = $1 and kind = 'ajustement_admin'`, [bob]))[0].n).toBe(2);   // deux opérations, rien d'effacé
});

test('rang, KYC : par la porte, journalisés ; le KYC s’annule, le rang non', async () => {
  expect(await eqNon(chef, 'joueur_rang', { id: bob, t: 3, d: 1 })).toMatch(/motif_requis/);
  expect((await eq(chef, 'joueur_rang', { id: bob, t: 3, d: 1, motif: 'rang Or II' })).j).toMatchObject({ t: 3, d: 1 });
  expect(await q(db, `select count(*)::int as n from wm.journal where action = 'joueur_rang' and cible = $1`, [bob])).toEqual([{ n: 2 }]);
  expect(await q(db, `select inverse from wm.journal where action = 'joueur_rang' order by id desc limit 1`)).toEqual([{ inverse: null }]);
  expect((await eq(modo, 'joueur_kyc', { id: bob, ok: true })).j.kyc).toBe(true);
  expect((await api(bob, 'select public.api_state() as r')).me.kyc).toBe(true);
  expect(await eqNon(modo, 'joueur_kyc', { id: bob, ok: true })).toMatch(/kyc_inchange/);
  const [{ id }] = await q(db, `select id from wm.journal where action = 'joueur_kyc' order by id desc limit 1`);
  await eq(modo, 'journal_annuler', { id, motif: 'document illisible' });
  expect((await api(bob, 'select public.api_state() as r')).me.kyc).toBe(false);
});

test('rôles : un modérateur s’occupe des joueurs et du chat, jamais de l’équipe ni du site ; personne ne bloque un administrateur', async () => {
  const actions = await q(db, 'select action, roles from wm.equipe_actions order by action');
  const modoActions = actions.filter(a => a.roles.includes('moderateur')).map(a => a.action);
  expect(modoActions).toEqual(expect.arrayContaining(['joueurs_chercher', 'joueur_fiche', 'joueur_activite', 'joueur_solde', 'joueur_rang', 'joueur_kyc', 'joueur_bloquer',
    'joueur_debloquer', 'joueur_deconnecter', 'chat_messages', 'chat_supprimer', 'chat_restaurer', 'salon_regler', 'mots_interdits', 'clan_renommer', 'clan_dissoudre',
    'journal_lire', 'journal_annuler']));
  for (const a of actions.filter(a => !a.roles.includes('moderateur')))
    expect(await eqNon(modo, a.action, { motif: 'essai de modérateur' }), a.action).toMatch(/interdit/);
  for (const a of actions)                                                                   // un joueur ordinaire : rien, pour aucune action
    expect(await eqNon(alice, a.action, { id: bob, motif: 'essai', acces: 'site', duree: '1h' }), a.action).toMatch(/interdit/);
  expect(await eqNon(modo, 'joueur_bloquer', { id: chef, acces: 'chat', duree: '1h', motif: 'essai' })).toMatch(/interdit/);
  expect(await eqNon(chef, 'joueur_bloquer', { id: modo, acces: 'chat', duree: '1h', motif: 'essai' })).toBeNull();   // un administrateur peut bloquer un modérateur
  expect(await eqNon(modo, 'joueur_bloquer', { id: modo, acces: 'chat', duree: '1h', motif: 'essai' })).toMatch(/bloque|interdit/);
  const [{ id: b }] = await q(db, `select id from wm.blocages where user_id = $1 and leve_at is null`, [modo]);
  await lever(b);
  expect(await eqNon(chef, 'joueur_deconnecter', { id: chef, motif: 'moi' })).toMatch(/interdit/);
  const admin2 = await creerJoueur(db, 'admin2', 0);
  await eq(chef, 'equipe_ajouter', { id: admin2, role: 'administrateur', motif: 'renfort' });
  expect(await eqNon(chef, 'joueur_bloquer', { id: admin2, acces: 'site', duree: '1h', motif: 'essai' })).toMatch(/interdit/);
  expect(await eqNon(modo, 'joueur_solde', { id: admin2, delta: 5, motif: 'essai' })).toMatch(/interdit/);
  expect(await refus(db, null, `select public.api_equipe('joueurs_chercher', '{}'::jsonb)`)).toMatch(/permission denied/);
  expect(await refus(db, alice, `insert into wm.blocages (user_id, acces, motif) values (auth.uid(), 'chat', 'x')`)).toMatch(/permission denied/);
  expect(await refus(db, alice, `select wm.garde(auth.uid(), 'paris')`)).toMatch(/permission denied/);
  expect((await api(alice, 'select public.api_mes_blocages() as r')).blocages).toEqual([]);
});

test('chat et communauté : masquer et rendre un message, mode lent, salon fermé, mots interdits ; l’équipe passe', async () => {
  await q(db, `select pg_sleep(1.1)`);
  const m = (await api(bob, `select public.api_chat_send('general', 'message limite') as r`)).msg;
  expect((await eq(modo, 'chat_messages', { salon: 'general' })).msgs[0]).toMatchObject({ id: m.id, n: 'bob', text: 'message limite', source: 'joueur' });
  await q(db, 'truncate realtime.messages');
  expect((await eq(modo, 'chat_supprimer', { id: m.id, motif: 'insulte' })).message).toMatchObject({ id: m.id, source: 'masque' });
  expect((await q(db, `select topic, event, payload from realtime.messages where event = 'del'`))).toEqual([{ topic: 'salon:general', event: 'del', payload: { id: m.id } }]);
  expect((await api(carol, `select public.api_chat_history('general') as r`)).msgs.some(x => x.id === m.id)).toBe(false);
  expect(await eqNon(modo, 'chat_supprimer', { id: m.id })).toMatch(/deja_masque/);
  const [{ id: j }] = await q(db, `select id from wm.journal where action = 'chat_supprimer' order by id desc limit 1`);
  await eq(modo, 'journal_annuler', { id: j, motif: 'masqué par erreur' });
  expect((await q(db, 'select source from public.chat_messages where id = $1', [m.id]))[0].source).toBe('joueur');
  expect((await api(carol, `select public.api_chat_history('general') as r`)).msgs.some(x => x.id === m.id)).toBe(true);

  // mode lent : un message toutes les 30 secondes dans ce salon ; l'équipe n'y est pas soumise
  await eq(modo, 'salon_regler', { salon: 'm:clasico', lent: 30 });
  await q(db, `select pg_sleep(1.1)`);
  await api(carol, `select public.api_chat_send('m:clasico', 'premier') as r`);
  await q(db, `select pg_sleep(1.1)`);
  const lent = await erreur(carol, `select public.api_chat_send('m:clasico', 'second') as r`);
  expect(lent.code).toBe('mode_lent'); expect(Number(lent.detail)).toBeGreaterThan(25);
  expect((await api(carol, `select public.api_chat_send('general', 'ailleurs ça passe') as r`)).msg).toBeTruthy();
  await api(modo, `select public.api_chat_send('m:clasico', 'message de l’équipe') as r`);
  await q(db, `select pg_sleep(1.1)`);
  expect((await api(modo, `select public.api_chat_send('m:clasico', 'et un autre') as r`)).msg).toBeTruthy();
  // salon fermé
  await eq(modo, 'salon_regler', { salon: 'm:clasico', ferme: true });
  await q(db, `select pg_sleep(1.1)`);
  expect((await erreur(bob, `select public.api_chat_send('m:clasico', 'fermé ?') as r`))?.code).toBe('salon_ferme');
  expect((await eq(modo, 'salon_regler', { salon: 'm:clasico', lent: 0, ferme: false })).salons).toEqual({});
  expect(await eqNon(modo, 'salon_regler', { salon: 'n:importe', lent: 5 })).toMatch(/salon_invalide/);
  expect(await eqNon(modo, 'salon_regler', { salon: 'general', lent: 900 })).toMatch(/lent_invalide/);

  // mots interdits : refusés dans les salons ; en privé seulement si le réglage le dit
  await eq(modo, 'mots_interdits', { mots: ['Arnaque', 'pigeon'] });
  await q(db, `select pg_sleep(1.1)`);
  expect((await erreur(bob, `select public.api_chat_send('general', 'Quelle ARNAQUE ce marché') as r`))?.code).toBe('mot_interdit');
  expect((await api(alice, `select public.api_dm_send('${bob}', 'quelle arnaque') as r`)).msg).toBeTruthy();
  await eq(modo, 'mots_interdits', { mots: ['arnaque', 'pigeon'], prives: true });
  await q(db, `select pg_sleep(1.1)`);
  expect((await erreur(alice, `select public.api_dm_send('${bob}', 'quelle arnaque') as r`))?.code).toBe('mot_interdit');
  expect((await q(db, `select valeur from wm.reglages where cle = 'chat.mots_interdits'`))[0].valeur).toEqual(['arnaque', 'pigeon']);
  expect((await enTantQue(db, null, x => x('select public.api_site() as r')))[0].r.v).not.toHaveProperty('chat.mots_interdits');   // la liste reste privée
  await eq(modo, 'mots_interdits', { mots: [], prives: false });
});

test('clans : renommer (annulable), dissoudre (membres sortis, salon fermé, plus personne n’y entre)', async () => {
  await q(db, `update public.users set created_at = now() - interval '30 days' where id = $1`, [carol]);
  await eq(chef, 'joueur_rang', { id: carol, t: 2, d: 0, motif: 'rang Argent pour créer un clan' });
  const c = await api(carol, `select public.api_clan_create('{"name":"Les Pionniers","tag":"PION","access":"open"}'::jsonb) as r`);
  await api(dave, `select public.api_clan_join($1, null) as r`, [c.id]);
  expect(await eqNon(modo, 'clan_renommer', { id: c.id, nom: '<b>' })).toMatch(/clan_nom_invalide/);
  expect((await eq(modo, 'clan_renommer', { id: c.id, nom: 'Les Défricheurs' })).clan).toMatchObject({ id: c.id, nom: 'Les Défricheurs', tag: 'PION' });
  const [{ id: j }] = await q(db, `select id from wm.journal where action = 'clan_renommer' order by id desc limit 1`);
  await eq(modo, 'journal_annuler', { id: j, motif: 'nom choisi par le chef' });
  expect((await q(db, 'select nom from wm.clans_joueurs where id = $1', [c.id]))[0].nom).toBe('Les Pionniers');

  expect(await eqNon(modo, 'clan_dissoudre', { id: c.id })).toMatch(/motif_requis/);
  const d = await eq(modo, 'clan_dissoudre', { id: c.id, motif: 'clan de triche' });
  expect(d.clan).toMatchObject({ id: c.id, dissous: true, membres_sortis: 2 });
  expect(await q(db, 'select count(*)::int as n from wm.clan_membres where clan_id = $1 and parti_at is null', [c.id])).toEqual([{ n: 0 }]);
  expect(await q(db, 'select count(*)::int as n from wm.clan_membres where clan_id = $1', [c.id])).toEqual([{ n: 2 }]);   // les lignes restent
  expect((await q(db, `select valeur from wm.reglages where cle = 'chat.salons'`))[0].valeur['clan:' + c.id]).toMatchObject({ ferme: true });
  expect((await erreur(bob, `select public.api_clan_join($1, null) as r`, [c.id]))?.code).toBe('clan_indisponible');
  expect(await eqNon(modo, 'clan_dissoudre', { id: c.id, motif: 'encore' })).toMatch(/deja_dissous/);
  expect(await eqNon(modo, 'clan_dissoudre', { id: 'c61', motif: 'clan de démonstration' })).toMatch(/clan_inconnu/);
});

test('site : annonce (publier, retirer, annuler), activité simulée ; tableau de bord', async () => {
  expect(await eqNon(chef, 'annonce_publier', { textes: { fr: '<script>' } })).toMatch(/annonce_invalide/);
  expect(await eqNon(chef, 'annonce_publier', { textes: { fr: 'Bonjour' }, fin: Date.now() - 1000 })).toMatch(/date_invalide/);
  const a = (await eq(chef, 'annonce_publier', { textes: { fr: 'Nouveaux marchés ce soir', en: 'New markets tonight' }, ton: 'info', fin: Date.now() + 3600000 })).annonce;
  expect(a).toMatchObject({ t: { fr: 'Nouveaux marchés ce soir', en: 'New markets tonight' }, ton: 'info' });
  expect((await enTantQue(db, null, x => x('select public.api_site() as r')))[0].r.annonce).toMatchObject({ id: a.id, t: a.t });
  await eq(chef, 'annonce_retirer', {});
  expect((await enTantQue(db, null, x => x('select public.api_site() as r')))[0].r.annonce).toBeNull();
  expect(await eqNon(chef, 'annonce_retirer', {})).toMatch(/annonce_absente/);
  const [{ id }] = await q(db, `select id from wm.journal where action = 'annonce_retirer' order by id desc limit 1`);
  await eq(chef, 'journal_annuler', { id, motif: 'retirée trop tôt' });
  expect((await enTantQue(db, null, x => x('select public.api_site() as r')))[0].r.annonce).toMatchObject({ t: a.t });

  expect(await eqNon(chef, 'activite_simulee', { intensite: 9 })).toMatch(/montant_invalide/);
  expect(await eqNon(chef, 'activite_simulee', { rappel: 0.5 })).toMatch(/montant_invalide/);
  const b = (await eq(chef, 'activite_simulee', { actif: false, intensite: 2, rappel: 0.05 })).bots;
  expect(b).toMatchObject({ actif: false, intensite: 2, rappel: 0.05 });
  expect((await q(db, `select value from wm.config where key = 'bots'`))[0].value).toMatchObject({ actif: false, intensite: 2, rappel: 0.05 });
  const [{ id: k }] = await q(db, `select id from wm.journal where action = 'activite_simulee' order by id desc limit 1`);
  await eq(chef, 'journal_annuler', { id: k, motif: 'on remet les bots' });
  expect((await q(db, `select value from wm.config where key = 'bots'`))[0].value).toEqual({ actif: true, intensite: 1 });

  await bloquer(bob, 'chat', { duree: '24h' });
  const t = await eq(chef, 'tableau');
  expect(t).toMatchObject({ inscrits: expect.any(Number), maintenance: false });
  expect(t.equipe).toBeGreaterThanOrEqual(2); expect(t.blocages_actifs).toBeGreaterThanOrEqual(1);
  expect(t.journal.tete).toMatch(/^[0-9a-f]{64}$/);
  expect((await eq(chef, 'journal_verifier')).ok).toBe(true);
});
