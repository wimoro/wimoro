// Panneau d'administration, lot 1 : réglages, équipe (administrateur, modérateur), journal en ajout seul, porte unique.
// Tout est décidé par le serveur : un joueur ordinaire qui appelle la porte directement est refusé, un visiteur n'y a pas
// accès, et le journal ne se modifie ni ne s'efface, même par le propriétaire de la base.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, refus, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, admin2, modo, alice, bob, bot;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0); admin2 = await creerJoueur(db, 'admin2', 0); modo = await creerJoueur(db, 'modo', 0);
  alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [chef]);   // comme WimoroAdmin
  [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_alpha', 'bot_alpha@nulle.part', true) returning id`);
});
test.afterAll(async () => { await db.close(); });

// Appel « en tant que » avec des revendications de jeton choisies (niveau de double authentification, session…).
async function comme(uid, claims, sql, params) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated', ...claims })]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql, params)).rows;
  });
}
const eq = (qui, action, p = {}, claims = {}) => comme(qui, claims, 'select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)]).then(r => r[0].r);
const eqNon = (qui, action, p = {}, claims = {}) => eq(qui, action, p, claims).then(() => null, e => e.message);
const adm = (qui, action, p = {}, claims = {}) => comme(qui, claims, 'select public.api_admin($1, $2::jsonb) as r', [action, JSON.stringify(p)]).then(r => r[0].r);
const admNon = (qui, action, p = {}, claims = {}) => adm(qui, action, p, claims).then(() => null, e => e.message);
const reglage = async cle => (await q(db, 'select valeur from wm.reglages where cle = $1', [cle]))[0]?.valeur;
const site = async () => (await enTantQue(db, null, s => s('select public.api_site() as r')))[0].r;

test('réglages : chaque valeur par défaut est la constante en vigueur aujourd’hui ; les aides de lecture ne lèvent jamais', async () => {
  const ATTENDU = {
    'frais.k': 0.7, 'frais.remise_rang': 0.9, 'frais.taux.crypto': 0.07, 'frais.taux.tech_ia': 0.04, 'frais.taux.bourse': 0.04,
    'frais.taux.matieres': 0.04, 'frais.taux.devises': 0.04, 'frais.taux.football': 0.05, 'frais.taux.politique': 0.05,
    'frais.taux.economie': 0.05, 'frais.taux.culture': 0.05, 'frais.taux.meteo': 0.05, 'frais.taux.sport': 0.05, 'frais.taux.sport_live': 0.05,
    'frais.taux.defaut': 0.05, 'frais.eclair.k': 0.7, 'frais.serie.facteur': 0.5, 'frais.blitz.commission': 0.05,
    'frais.combines.commission': 0.05, 'frais.stacks.commission': 0.04, 'frais.guerres.commission': 0.04, 'frais.copies.part_copie': 0.2,
    'frais.retraits.base': 0.05, 'frais.retraits.ethereum': 2, 'frais.retraits.arbitrum': 0.1, 'frais.retraits.polygon': 0.05, 'frais.retraits.solana': 0.01,
    'frais.depots_fiat.card': 0.025, 'frais.depots_fiat.bank': 0, 'frais.depots_fiat.paypal': 0.019,
    'frais.retraits_fiat.card': 0.015, 'frais.retraits_fiat.bank': 0, 'frais.retraits_fiat.paypal': 0.01,
    'paris.mise_min': 1, 'paris.mise_max': null, 'eclair.mise_min': 1, 'eclair.mise_max': 10000,
    'eclair.be_marge': 0.05, 'eclair.be_min': 5, 'eclair.be_max': 40, 'eclair.be_plafond': 50,
    'serie.mises': [5, 10, 25, 50, 100], 'blitz.buyin': 10, 'blitz.buyin_prime': 25, 'blitz.rachat': 50,
    'duels.mise_min': 5, 'duels.mise_max': 5000, 'duels.expiration_h': 48, 'duels.max_ouverts': 10,
    'stacks.buyin_min': 5, 'stacks.buyin_max': 1000, 'stacks.max_actifs': 5,
    'combines.mise_min': 2, 'combines.mise_max': 1000, 'combines.gain_max': 50000, 'combines.encaisse_decote': 0.95, 'combines.selections_max': 6,
    'copies.budget_min': 50, 'copies.mise_min': 5, 'copies.max_actives': 10, 'clans.frais_creation': 50, 'clans.guerre_buyin': 20,
    'depots.fiat_min': 10, 'depots.fiat_max': 5000, 'depots.max': 1000000, 'depots.max_jour': null,
    'depots.min.usdc': 5, 'depots.min.usdt': 5, 'depots.min.eth': 0.002, 'depots.min.btc': 0.0001, 'depots.min.sol': 0.03,
    'retraits.min': 5, 'retraits.max': null, 'parrainage.bonus': 10,
    'chat.salons': {}, 'chat.mots_interdits': [], 'chat.mots_prives': false,
    'site.maintenance': false, 'site.maintenance_message': null, 'site.annonce': null,
    'equipe.mfa_obligatoire': false, 'equipe.moderateur_solde_max': 1000,
  };
  const lignes = await q(db, 'select cle, categorie, libelle, explication, valeur, defaut, min, max, maj_at from wm.reglages order by cle');
  expect(Object.fromEntries(lignes.map(l => [l.cle, l.valeur]))).toEqual(ATTENDU);
  for (const l of lignes) {
    expect(l.defaut, l.cle).toEqual(l.valeur);                                           // aucun réglage n'est encore modifié
    expect(l.libelle.length, l.cle).toBeGreaterThan(3); expect(l.explication, l.cle).toMatch(/\.$/);   // libellé et une phrase d'explication
    expect(l.categorie, l.cle).toBeTruthy();
  }
  // les aides de lecture rendent la constante si la clé manque ou si la valeur n'a pas le bon type, sans jamais lever
  expect(Number((await q(db, `select wm.reglage_num('frais.k', 99) as v`))[0].v)).toBe(0.7);
  expect(Number((await q(db, `select wm.reglage_num('cle.inconnue', 0.42) as v`))[0].v)).toBe(0.42);
  expect(Number((await q(db, `select wm.reglage_num('site.maintenance', 7) as v`))[0].v)).toBe(7);
  expect((await q(db, `select wm.reglage_num('paris.mise_max', null) as v`))[0].v).toBeNull();
  expect((await q(db, `select wm.reglage_bool('site.maintenance', true) as v`))[0].v).toBe(false);
  expect((await q(db, `select wm.reglage_bool('frais.k', true) as v`))[0].v).toBe(true);
  // ni un visiteur ni un joueur ne lisent ou n'écrivent la table directement
  for (const qui of [null, alice]) {
    expect(await refus(db, qui, 'select * from wm.reglages')).toMatch(/permission denied/);
    expect(await refus(db, qui, `update wm.reglages set valeur = '0' where cle = 'frais.k'`)).toMatch(/permission denied/);
    expect(await refus(db, qui, `select wm.reglage_num('frais.k', 0)`)).toMatch(/permission denied/);
  }
});

test('api_site : ouverte aux visiteurs, ne donne que les réglages publics, ne réveille pas les bots', async () => {
  await q(db, `delete from wm.config where key = 'presence'`);
  const s = await site();
  expect(s.rev).toBeGreaterThanOrEqual(1);
  expect(s.v['frais.k']).toBe(0.7); expect(s.v['frais.taux.crypto']).toBe(0.07); expect(s.v['parrainage.bonus']).toBe(10);
  expect(s.v).not.toHaveProperty('chat.mots_interdits'); expect(s.v).not.toHaveProperty('equipe.mfa_obligatoire');
  expect(s.maintenance).toEqual({ actif: false, message: null }); expect(s.annonce).toBeNull();
  expect(await q(db, `select key from wm.config where key = 'presence'`)).toEqual([]);   // aucun signal de présence
  expect((await enTantQue(db, alice, x => x('select public.api_site() as r')))[0].r.v['frais.k']).toBe(0.7);
});

test('porte unique : un visiteur n’y a pas accès, un joueur est refusé pour chaque action, « moi » dit le rôle de chacun', async () => {
  expect(await refus(db, null, `select public.api_equipe('moi', '{}'::jsonb)`)).toMatch(/permission denied/);
  expect(await eq(alice, 'moi')).toMatchObject({ role: null, permissions: [], ancien_panneau: false });
  const m = await eq(chef, 'moi');
  expect(m).toMatchObject({ role: 'administrateur', aal: 'aal1', facteurs: 0, mfa_requise: false, ancien_panneau: true });
  expect(m.permissions).toEqual(expect.arrayContaining(['reglage_modifier', 'equipe_ajouter', 'journal_lire', 'journal_csv', 'journal_annuler']));
  const actions = (await q(db, 'select action, fonction, roles from wm.equipe_actions order by action'));
  expect(actions.length).toBeGreaterThanOrEqual(10);
  for (const a of actions) {
    expect(await eqNon(alice, a.action, { id: bob, cle: 'frais.k', valeur: 0, motif: 'essai', role: 'administrateur', email: 'alice@test.dev' }), a.action).toMatch(/interdit/);
    expect(await refus(db, alice, `select ${a.fonction}($1::uuid, '{}'::jsonb)`, [alice]), a.fonction).toMatch(/permission denied/);
  }
  expect(await eqNon(alice, 'action_qui_n_existe_pas')).toMatch(/interdit/);           // un joueur n'apprend même pas qu'elle n'existe pas
  expect(await eqNon(chef, 'action_qui_n_existe_pas')).toMatch(/action_inconnue/);
  expect(await q(db, 'select count(*)::int as n from wm.journal')).toEqual([{ n: 0 }]);
});

test('équipe : un joueur ne se donne pas de rôle ; l’administrateur ajoute, change et retire ; jamais le dernier administrateur', async () => {
  expect(await eqNon(alice, 'equipe_ajouter', { id: alice, role: 'administrateur', motif: 'je me promeus' })).toMatch(/interdit/);
  expect(await refus(db, alice, `insert into wm.equipe_membres (user_id, role) values (auth.uid(), 'administrateur')`)).toMatch(/permission denied/);
  expect(await refus(db, alice, `insert into public.admin_users (user_id, role) values (auth.uid(), 'admin')`)).toMatch(/permission denied/);
  expect((await eq(alice, 'moi')).role).toBeNull();

  expect(await eqNon(chef, 'equipe_ajouter', { email: 'modo@test.dev', role: 'moderateur' })).toMatch(/motif_requis/);
  expect(await eqNon(chef, 'equipe_ajouter', { email: 'modo@test.dev', role: 'chef', motif: 'renfort' })).toMatch(/role_invalide/);
  expect(await eqNon(chef, 'equipe_ajouter', { email: 'personne@test.dev', role: 'moderateur', motif: 'renfort' })).toMatch(/joueur_inconnu/);
  expect(await eqNon(chef, 'equipe_ajouter', { id: bot, role: 'moderateur', motif: 'renfort' })).toMatch(/compte_refuse/);   // un bot
  const l = (await eq(chef, 'equipe_ajouter', { email: 'MODO@test.dev', role: 'moderateur', motif: 'renfort pour le chat' })).membres;
  expect(l.find(x => x.id === modo)).toMatchObject({ n: 'modo', role: 'moderateur', retire_at: null });
  expect(l.find(x => x.id === chef)).toMatchObject({ role: 'administrateur', origine: 'ancien' });
  expect(await eqNon(chef, 'equipe_ajouter', { id: modo, role: 'moderateur', motif: 'encore' })).toMatch(/deja_membre/);
  expect((await eq(modo, 'moi'))).toMatchObject({ role: 'moderateur', ancien_panneau: false });
  // un modérateur n'administre ni l'équipe, ni les réglages, ni l'ancienne porte
  expect(await eqNon(modo, 'equipe_ajouter', { id: bob, role: 'moderateur', motif: 'copain' })).toMatch(/interdit/);
  expect(await eqNon(modo, 'reglage_modifier', { cle: 'frais.k', valeur: 0.5, motif: 'cadeau' })).toMatch(/interdit/);
  expect(await eqNon(modo, 'reglages_lire')).toMatch(/interdit/);
  expect(await admNon(modo, 'chiffres')).toMatch(/interdit/);

  await eq(chef, 'equipe_ajouter', { id: admin2, role: 'administrateur', motif: 'deuxième administrateur' });
  await eq(admin2, 'equipe_role', { id: modo, role: 'administrateur', motif: 'promotion' });
  expect((await eq(modo, 'moi')).role).toBe('administrateur');
  await eq(admin2, 'equipe_role', { id: modo, role: 'moderateur', motif: 'retour au chat' });
  // on retire l'ancien compte : il perd aussi l'ancienne porte (sa ligne de public.admin_users reste, intacte)
  await eq(admin2, 'equipe_retirer', { id: chef, motif: 'compte partagé remplacé' });
  expect((await eq(chef, 'moi')).role).toBeNull();
  expect(await adm(chef, 'moi')).toEqual({ admin: false });
  expect(await admNon(chef, 'chiffres')).toMatch(/interdit/);
  expect(await q(db, 'select role from public.admin_users where user_id = $1', [chef])).toEqual([{ role: 'super_admin' }]);
  expect(await eqNon(admin2, 'equipe_retirer', { id: admin2, motif: 'je pars' })).toMatch(/dernier_administrateur/);
  expect(await eqNon(admin2, 'equipe_role', { id: admin2, role: 'moderateur', motif: 'je descends' })).toMatch(/dernier_administrateur/);
  // et il revient
  await eq(admin2, 'equipe_ajouter', { id: chef, role: 'administrateur', motif: 'retour du compte' });
  expect((await eq(chef, 'moi')).role).toBe('administrateur');
  expect(await adm(chef, 'moi')).toEqual({ admin: true });
  const j = await q(db, `select action, cible_type, cible, avant, apres, motif, inverse from wm.journal where action like 'equipe%' order by id`);
  expect(j.map(x => [x.action, x.apres.role])).toEqual([['equipe_ajouter', 'moderateur'], ['equipe_ajouter', 'administrateur'], ['equipe_role', 'administrateur'],
    ['equipe_role', 'moderateur'], ['equipe_retirer', null], ['equipe_ajouter', 'administrateur']]);
  expect(j[4]).toMatchObject({ cible_type: 'membre', cible: chef, avant: { role: 'administrateur' }, motif: 'compte partagé remplacé',
    inverse: { action: 'equipe_ajouter', p: { id: chef, role: 'administrateur' } } });
});

test('double authentification : exigée dès qu’un code est enrôlé, sur la nouvelle et sur l’ancienne porte', async () => {
  expect((await eq(chef, 'reglages_lire')).reglages.length).toBeGreaterThan(50);
  await q(db, `insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')`, [chef]);    // enrôlement commencé, pas terminé
  expect((await eq(chef, 'reglages_lire')).reglages.length).toBeGreaterThan(50);
  await q(db, `insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [chef]);
  expect(await eq(chef, 'moi')).toMatchObject({ role: 'administrateur', facteurs: 1, mfa_requise: true });   // « moi » répond toujours
  expect(await eqNon(chef, 'reglages_lire')).toMatch(/mfa_requise/);
  expect(await eqNon(chef, 'reglages_lire', {}, { aal: 'aal1' })).toMatch(/mfa_requise/);
  expect(await admNon(chef, 'chiffres')).toMatch(/mfa_requise/);
  expect((await eq(chef, 'reglages_lire', {}, { aal: 'aal2' })).reglages.length).toBeGreaterThan(50);
  expect(await adm(chef, 'chiffres', {}, { aal: 'aal2' })).toHaveProperty('inscrits');
  expect(await eq(chef, 'moi', {}, { aal: 'aal2' })).toMatchObject({ aal: 'aal2', mfa_requise: false });
  // l'obligation pour tous (réglage privé) : un membre sans code est refusé tant qu'il ne l'a pas enrôlé
  await eq(chef, 'reglage_modifier', { cle: 'equipe.mfa_obligatoire', valeur: true, motif: 'tous les partenaires sont enrôlés' }, { aal: 'aal2' });
  expect(await eqNon(admin2, 'equipe_liste')).toMatch(/mfa_requise/);
  expect(await eqNon(modo, 'journal_lire')).toMatch(/mfa_requise/);
  await eq(chef, 'reglage_modifier', { cle: 'equipe.mfa_obligatoire', valeur: false, motif: 'retour à la normale' }, { aal: 'aal2' });
  expect((await eq(admin2, 'equipe_liste')).membres.length).toBeGreaterThanOrEqual(3);
  await q(db, `update auth.mfa_factors set status = 'unverified' where user_id = $1`, [chef]);        // pour la suite du fichier
});

test('réglage modifié : contrôlé (type, bornes, motif), journalisé avant / après, visible aussitôt par api_site', async () => {
  const rev0 = (await site()).rev;
  expect(await eqNon(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.65 })).toMatch(/motif_requis/);
  expect(await eqNon(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.65, motif: 'ok' })).toMatch(/motif_requis/);   // 3 caractères au moins
  for (const [p, code] of [[{ cle: 'frais.inconnu', valeur: 1 }, /reglage_inconnu/], [{ cle: 'frais.k', valeur: 2 }, /reglage_invalide/],
    [{ cle: 'frais.k', valeur: -0.1 }, /reglage_invalide/], [{ cle: 'frais.k', valeur: '0.5' }, /reglage_invalide/], [{ cle: 'frais.k' }, /reglage_invalide/],
    [{ cle: 'duels.expiration_h', valeur: 12.5 }, /reglage_invalide/], [{ cle: 'paris.mise_min', valeur: null }, /reglage_invalide/],
    [{ cle: 'serie.mises', valeur: [5, 'x'] }, /reglage_invalide/], [{ cle: 'serie.mises', valeur: [] }, /reglage_invalide/],
    [{ cle: 'frais.eclair.k', valeur: 0.6 }, /reglage_inactif/], [{ cle: 'chat.salons', valeur: {} }, /reglage_dedie/],
    [{ cle: 'site.maintenance', valeur: true }, /reglage_dedie/], [{ cle: 'frais.k', valeur: 0.7 }, /reglage_inchange/],
    [{ cle: 'paris.mise_max', valeur: 0.5 }, /reglage_invalide/], [{ cle: 'eclair.mise_min', valeur: 20000 }, /reglage_invalide/]])
    expect(await eqNon(chef, 'reglage_modifier', { motif: 'essai de bornes', ...p }), JSON.stringify(p)).toMatch(code);
  // deux réglages qui se tiennent : le minimum ne passe pas au-dessus du maximum
  await eq(chef, 'reglage_modifier', { cle: 'paris.mise_max', valeur: 500, motif: 'plafond des paris' });
  expect(await eqNon(chef, 'reglage_modifier', { cle: 'paris.mise_min', valeur: 600, motif: 'trop haut' })).toMatch(/reglage_incoherent/);
  expect(await reglage('paris.mise_min')).toBe(1);
  await eq(chef, 'reglage_modifier', { cle: 'paris.mise_max', valeur: null, motif: 'plus de plafond' });

  const r = await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.65, motif: 'promotion de lancement' });
  expect(r.reglage).toMatchObject({ cle: 'frais.k', valeur: 0.65, defaut: 0.7, maj_par: chef });
  expect(await reglage('frais.k')).toBe(0.65);
  const s = await site();
  expect(s.v['frais.k']).toBe(0.65); expect(s.rev).toBe(rev0 + 3);
  const [e] = await q(db, `select * from wm.journal where action = 'reglage_modifier' and cible = 'frais.k' order by id desc limit 1`);
  expect(e).toMatchObject({ admin_id: chef, role: 'administrateur', origine: 'panneau', cible_type: 'reglage', avant: { valeur: 0.7 }, apres: { valeur: 0.65 },
    motif: 'promotion de lancement', inverse: { action: 'reglage_modifier', p: { cle: 'frais.k', valeur: 0.7 } }, annule_id: null });
  const series = await eq(chef, 'reglage_modifier', { cle: 'serie.mises', valeur: [5, 10, 20], motif: 'mises de la Série' });
  expect(series.reglage.valeur).toEqual([5, 10, 20]);
  await eq(chef, 'reglage_modifier', { cle: 'serie.mises', valeur: [5, 10, 25, 50, 100], motif: 'retour' });
});

test('annuler : l’inverse passe par la porte et se journalise ; jamais deux fois ; refusé si la valeur a changé depuis', async () => {
  const [{ id }] = await q(db, `select id from wm.journal where action = 'reglage_modifier' and cible = 'frais.k' order by id desc limit 1`);
  expect(await eqNon(chef, 'journal_annuler', { id })).toMatch(/motif_requis/);
  const r = await eq(chef, 'journal_annuler', { id, motif: 'promotion terminée' });
  expect(r.annule).toBe(Number(id));
  expect(await reglage('frais.k')).toBe(0.7);
  const [inv] = await q(db, 'select * from wm.journal where annule_id = $1', [id]);
  expect(inv).toMatchObject({ action: 'reglage_modifier', cible: 'frais.k', avant: { valeur: 0.65 }, apres: { valeur: 0.7 } });
  expect(inv.motif).toMatch(/promotion terminée/);
  expect(await eqNon(chef, 'journal_annuler', { id, motif: 'encore' })).toMatch(/deja_annule/);
  // la valeur a encore changé depuis l'entrée : l'annulation refuse d'écraser le nouveau choix
  await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.6, motif: 'essai A' });
  const [{ id: a }] = await q(db, `select id from wm.journal where action = 'reglage_modifier' and motif = 'essai A'`);
  await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.62, motif: 'essai B' });
  expect(await eqNon(chef, 'journal_annuler', { id: a, motif: 'revenir' })).toMatch(/deja_modifie/);
  expect(await eqNon(chef, 'journal_annuler', { id: 999999, motif: 'revenir' })).toMatch(/entree_inconnue/);
  await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.7, motif: 'retour à 70 %' });
  // une entrée sans inverse ne s'annule pas ; un modérateur n'annule pas une action d'administrateur
  const [{ id: aj }] = await q(db, `select id from wm.journal where action = 'equipe_ajouter' order by id limit 1`);
  expect(await eqNon(modo, 'journal_annuler', { id: aj, motif: 'je retire le modérateur' })).toMatch(/interdit/);
  expect(await eqNon(modo, 'journal_annuler', { id: a, motif: 'je reviens' })).toMatch(/interdit/);
});

test('journal : lecture filtrée, export CSV côté serveur, ancien panneau recopié', async () => {
  await adm(chef, 'solde', { id: alice, delta: 12.5, motif: 'geste, "client" fidèle' });     // par l'ancienne porte
  const [ancien] = await q(db, `select * from wm.journal where origine = 'ancien_panneau' order by id desc limit 1`);
  expect(ancien).toMatchObject({ admin_id: chef, action: 'solde', cible_type: 'joueur', cible: alice, motif: 'geste, "client" fidèle', inverse: null });
  expect(ancien.apres).toMatchObject({ delta: 12.5, avant: 1000, apres: 1012.5 });

  const tout = (await eq(chef, 'journal_lire')).entrees;
  expect(tout.length).toBeGreaterThan(10);
  expect(tout[0].id).toBeGreaterThan(tout[1].id);                                            // le plus récent d'abord
  expect(tout.find(x => x.origine === 'ancien_panneau')).toMatchObject({ par: 'chef', action: 'solde' });
  expect((await eq(chef, 'journal_lire', { action: 'equipe_role' })).entrees.map(x => x.action)).toEqual(['equipe_role', 'equipe_role']);
  expect((await eq(chef, 'journal_lire', { joueur: alice })).entrees.map(x => x.action)).toEqual(['solde']);
  expect((await eq(chef, 'journal_lire', { admin: admin2 })).entrees.every(x => x.admin === admin2)).toBe(true);
  expect((await eq(chef, 'journal_lire', { du: Date.now() + 3600000 })).entrees).toEqual([]);
  const page = await eq(chef, 'journal_lire', { n: 3 });
  expect(page.entrees.length).toBe(3);
  const suite = await eq(chef, 'journal_lire', { n: 3, avant: page.suite });
  expect(suite.entrees[0].id).toBeLessThan(page.entrees[2].id);
  // un modérateur ne lit que ses entrées, ou celles d'un joueur qu'il ouvre
  expect((await eq(modo, 'journal_lire')).entrees).toEqual([]);
  expect((await eq(modo, 'journal_lire', { joueur: alice })).entrees.map(x => x.action)).toEqual(['solde']);
  expect(await eqNon(modo, 'journal_csv')).toMatch(/interdit/);

  const c = await eq(chef, 'journal_csv', { action: 'solde' });
  expect(c.nom).toMatch(/^wimoro-journal-\d{8}\.csv$/);
  expect(c.lignes).toBe(1); expect(c.tronque).toBe(false);
  expect(c.csv.charCodeAt(0)).toBe(0xFEFF);                                                  // marque d'octets UTF-8
  const lignes = c.csv.slice(1).split('\r\n');
  expect(lignes[0]).toBe('"id","date_utc","date_paris","qui","role","action","cible_type","cible","motif","avant","apres","annule_id","origine","empreinte"');
  expect(lignes[1]).toContain('"geste, ""client"" fidèle"');                                  // guillemets doublés (RFC 4180)
  expect(lignes[1]).toMatch(/"[0-9a-f]{64}"$/);
  expect(lignes.length).toBe(3); expect(lignes[2]).toBe('');
  // une cellule qui commencerait par « = » n'est pas une formule dans le tableur
  await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.69, motif: '=HYPERLINK("x")' });
  expect((await eq(chef, 'journal_csv', { action: 'reglage_modifier' })).csv).toContain(`"'=HYPERLINK(""x"")"`);
  await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.7, motif: 'retour à 70 %' });
});

test('journal en ajout seul : ni modification, ni suppression, ni vidage, même par le propriétaire ; toute altération se voit', async () => {
  const v = await eq(chef, 'journal_verifier');
  expect(v).toMatchObject({ ok: true, rompue: null });
  expect(v.n).toBeGreaterThan(10); expect(v.tete).toMatch(/^[0-9a-f]{64}$/);
  for (const sql of [`update wm.journal set motif = 'effacé' where id = 1`, 'delete from wm.journal where id = 1', 'truncate wm.journal',
    `update wm.admin_journal set action = 'x'`, 'delete from wm.admin_journal', 'truncate wm.admin_journal'])
    expect(await q(db, sql).then(() => null, e => e.message), sql).toMatch(/journal_immuable/);            // en tant que postgres
  await q(db, `set session_replication_role = replica`);                                              // même les déclencheurs « réplique » ne passent pas
  expect(await q(db, 'delete from wm.journal').then(() => null, e => e.message)).toMatch(/journal_immuable/);
  await q(db, `set session_replication_role = origin`);
  for (const qui of [alice, chef]) {
    expect(await refus(db, qui, 'select * from wm.journal')).toMatch(/permission denied/);
    expect(await refus(db, qui, `insert into wm.journal (action, empreinte) values ('faux', '\\x00')`)).toMatch(/permission denied/);
  }
  // une entrée ajoutée à la main (propriétaire) reçoit quand même son rang et son empreinte : la chaîne tient
  await q(db, `insert into wm.journal (id, action, origine, empreinte) values (424242, 'migration_test', 'migration', '\\x00')`);
  const [der] = await q(db, `select id, encode(empreinte, 'hex') as h from wm.journal order by id desc limit 1`);
  expect(Number(der.id)).toBe(v.n + 1); expect(der.h).not.toBe('00');
  expect((await eq(chef, 'journal_verifier')).ok).toBe(true);
  // altération : seule une migration qui coupe le déclencheur le peut, et la chaîne la signale aussitôt
  await q(db, `alter table wm.journal disable trigger journal_ajout_seul`);
  await q(db, `update wm.journal set motif = 'trafiqué' where id = 2`);
  await q(db, `alter table wm.journal enable always trigger journal_ajout_seul`);
  expect(await eq(chef, 'journal_verifier')).toMatchObject({ ok: false, rompue: 2 });
});

// La marche à suivre de docs/EXPLOITATION.md (§ 8), tant que l'écran du panneau n'existe pas : une migration de deux lignes.
test('par une migration (sans session) : ajouter puis retirer un modérateur, journalisé « migration »', async () => {
  const carol = await creerJoueur(db, 'carol', 0);
  const migration = sql => db.transaction(async tx => { await tx.query(`select set_config('wm.journal_origine', 'migration', true)`); await tx.query(sql); });
  await migration(`select wm.eq_equipe_ajouter(null, '{"email": "carol@test.dev", "role": "moderateur", "motif": "premier modérateur"}'::jsonb)`);
  expect((await eq(carol, 'moi')).role).toBe('moderateur');
  expect((await eq(carol, 'joueurs_chercher', { q: 'alice' })).joueurs.map(j => j.n)).toEqual(['alice']);
  await migration(`select wm.eq_equipe_retirer(null, jsonb_build_object('id', (select id from public.users where username = 'carol'), 'motif', 'fin de la mission'))`);
  expect((await eq(carol, 'moi')).role).toBeNull();
  const j = await q(db, `select admin_id, role, origine, action, cible, motif from wm.journal where cible = $1 order by id`, [carol]);
  expect(j).toEqual([
    { admin_id: null, role: null, origine: 'migration', action: 'equipe_ajouter', cible: carol, motif: 'premier modérateur' },
    { admin_id: null, role: null, origine: 'migration', action: 'equipe_retirer', cible: carol, motif: 'fin de la mission' }]);
});
