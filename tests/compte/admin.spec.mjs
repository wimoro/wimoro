// Panneau d'administration (admin.html), avec le faux serveur : un compte hors équipe ne voit rien ; chaque action part
// vers la porte unique api_equipe avec ses paramètres exacts, après le résumé avant → après, le motif et la confirmation ;
// les fonctions de l'ancien panneau (XP, marchés, ancienne suspension) restent servies par api_admin. Le contrôle des droits
// lui-même est prouvé côté base (tests/sql/equipe.spec.mjs, blocages.spec.mjs).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { UID, lire } from '../helpers/app.mjs';

const FAUX = fs.readFileSync('tests/helpers/fake-supabase.js', 'utf8');
const REG = JSON.parse(fs.readFileSync('tests/fixtures/reglages.json', 'utf8'));
const LEA = '22222222-2222-4222-8222-222222222222', BOT = '33333333-3333-4333-8333-333333333333', TEST = '44444444-4444-4444-8444-444444444444', NOUVEAU = '55555555-5555-4555-8555-555555555555';
const H = 3600e3, J = 864e5;
const joueur = (id, n, plus = {}) => ({ id, n, email: n + '@test.dev', since: Date.UTC(2026, 9, 1), vu: Date.UTC(2026, 10, 18), balance: 500, xp: 320, t: 1, d: 0, settled: 4, wins: 2, deposits: 1, kyc: false, ...plus });
const JOUEURS = [joueur(UID, 'chef'), joueur(LEA, 'lea_reelle'), joueur(BOT, 'maxou_bot', { bot: true, email: '' }), joueur(TEST, 'essai', { test: true }), joueur(NOUVEAU, 'sofia', { email: 'sofia@test.dev' })];
const MSGS = [{ id: 41, room: 'general', u: LEA, n: 'lea_reelle', text: 'message déplacé', at: Date.UTC(2026, 10, 15, 10) }, { id: 40, room: 'm:btc150k', u: LEA, n: 'lea_reelle', text: 'message correct', at: Date.UTC(2026, 10, 15, 9) }];
const MARCHES = [{ id: 'btc150k', q: 'Le Bitcoin dépassera-t-il 150 000 $ ?', short: 'Bitcoin à 150 000 $', cat: 'Crypto', st: 'open', issue: null, p: 63, ref: 63, vol: 4200000, date: '2026-12-31', time: '23:59', heat: 3.2, rules: '', parent: null, cree: false, positions: 2 }];
const CLANS = [{ id: 'u1', name: 'Les Visionnaires', tag: 'VIS', chief: LEA, createdAt: Date.UTC(2026, 10, 1), access: 'open', members: [{ u: LEA, role: 'chef', since: Date.UTC(2026, 10, 1), pts: 0 }] }];

/** Ouvre le panneau. role : 'administrateur' | 'moderateur' | null ; equipe : morceaux du modèle du faux serveur. */
async function ouvrirPanneau(page, { session = true, role = 'administrateur', equipe = {}, admin, aal, totp, hash = '', ancien } = {}) {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(`${e.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console.error: ' + m.text()); });
  await page.route(/js\/vendor\/supabase[^/]*\.js/, r => r.fulfill({ contentType: 'text/javascript', body: FAUX }));
  const eqc = { role, reglages: REG, joueurs: JOUEURS, msgs: MSGS, ...equipe };
  if (ancien === false) eqc.ancien = false;
  const cfg = { session: session ? { user: { id: UID, email: 'chef@test.dev' } } : null, admin: admin ?? role === 'administrateur', equipe: eqc, clans: CLANS,
    adminData: { joueurs: JOUEURS.map(j => ({ ...j, admin: j.id === UID, susp: j.susp || null })), marches: MARCHES, msgs: MSGS }, comptes: { 'chef@test.dev': { id: UID, password: 'Motdepasse-9!', pseudo: 'chef' } },
    ...(aal ? { aal } : {}), ...(totp ? { totp } : {}) };
  await page.addInitScript(({ cfg, session }) => {
    if (!sessionStorage.getItem('__init__')) { sessionStorage.setItem('__init__', '1'); if (session) localStorage.setItem('wimoro-auth', JSON.stringify({ faux: true })); }
    window.__FAKE_SB__ = cfg;
  }, { cfg, session });
  await page.goto('/admin.html' + hash);
  return erreurs;
}
/** les appels à la nouvelle porte : [action, paramètres], sans les lectures de pseudos faites après un rendu */
const appels = (page, sauf = ['moi']) => lire(page, s => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === 'api_equipe').map(c => [c.args.p_action, c.args.p]).filter(a => !s.includes(a[0]) && !(a[0] === 'joueurs_chercher' && /^[0-9a-f-]{36}$/.test(a[1].q || ''))), sauf);
const ecritures = async page => (await appels(page)).filter(a => !/^(tableau|reglages_lire|equipe_liste|journal_lire|joueurs_chercher|joueur_fiche|joueur_activite|chat_messages)$/.test(a[0]));
const anciens = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === 'api_admin').map(c => [c.args.p_action, c.args.p]).filter(a => a[0] !== 'moi' && a[0] !== 'marches'));
const message = page => page.locator('#adm-msg');
const fenetre = page => page.locator('#adm-ov');
const aller = async (page, h) => { await page.evaluate(x => { location.hash = '#' + x; }, h); };
/** la confirmation : vérifie le résumé avant → après, saisit le motif, confirme */
async function confirmer(page, { lignes = [], motif = null } = {}) {
  const ov = fenetre(page);
  await expect(ov).toBeVisible();
  for (const [k, a, b] of lignes) { const l = ov.locator('.diff-l', { hasText: k }); await expect(l.locator('.diff-a')).toContainText(a); await expect(l.locator('.diff-b')).toContainText(b); }
  if (motif !== null) await ov.locator('textarea[name="motif"]').fill(motif);
  await ov.locator('button[type="submit"]').click();
  await expect(ov).toHaveCount(0);
}

test('sans session : connexion ; compte hors équipe : « Accès réservé », aucun écran, et le serveur refuse chaque action', async ({ page }) => {
  let erreurs = await ouvrirPanneau(page, { session: false });
  await expect(page.locator('form[data-f="connexion"]')).toBeVisible();
  await expect(page.locator('#adm-nav')).toBeHidden();
  expect(await lire(page, () => typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'rpc').length), 'aucun appel sans session').toBe(0);
  expect(erreurs).toEqual([]);

  const autre = await page.context().newPage();
  erreurs = await ouvrirPanneau(autre, { role: null, admin: false });
  await expect(autre.locator('#adm-refus')).toContainText('Accès réservé');
  await expect(autre.locator('#adm-nav')).toBeHidden();
  await expect(autre.locator('#adm-search')).toBeHidden();
  expect(await appels(autre, [])).toEqual([['moi', {}]]);                                   // une seule question posée au serveur : « quel est mon rôle ? »
  for (const action of ['joueurs_chercher', 'tableau', 'reglage_modifier', 'joueur_solde', 'journal_lire'])
    expect(await lire(autre, async a => { try { await API.call('api_equipe', { p_action: a, p: { motif: 'essai' } }); return 'ouvert'; } catch (e) { return e.code; } }, action), action).toBe('interdit');
  expect(await lire(autre, async () => { try { await API.call('api_admin', { p_action: 'joueurs', p: {} }); return 'ouvert'; } catch (e) { return e.code; } })).toBe('interdit');
  expect(erreurs).toEqual([]);
});

test('modérateur : seulement les joueurs, le chat, le journal et son compte ; le serveur refuse le reste', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { role: 'moderateur', admin: false, hash: '#frais' });
  await expect(page.locator('#adm-nav')).toBeVisible();
  await expect(page.locator('.adm-tete h1')).toHaveText('Joueurs');                         // l'écran demandé lui est fermé : il arrive sur le sien
  expect(await page.locator('#adm-nav-l a span').allInnerTexts()).toEqual(['Journal', 'Joueurs', 'Chat et communauté', 'Mon compte']);
  for (const action of ['tableau', 'reglages_lire', 'reglage_modifier', 'equipe_liste', 'equipe_ajouter', 'annonce_publier', 'maintenance', 'activite_simulee', 'journal_csv'])
    expect(await lire(page, async a => { try { await API.call('api_equipe', { p_action: a, p: { motif: 'essai' } }); return 'ouvert'; } catch (e) { return e.code; } }, action), action).toBe('interdit');
  await page.locator('#adm-joueurs [data-joueur]').first().click();
  await expect(page.locator('#adm-fiche')).toBeVisible();
  await expect(page.locator('form[data-f="xp"]')).toHaveCount(0);                             // l'ancien panneau est réservé aux administrateurs
  await aller(page, 'chat');
  await expect(page.locator('#c-mots')).toContainText('ne se lit qu’avec le rôle administrateur');
  expect(erreurs).toEqual([]);
});

test('accueil : les chiffres du jour mènent à leur écran ; les dernières décisions ; « bientôt » pour la partie D', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { equipe: { journal: [{ id: 1, at: Date.now() - H, admin: UID, par: 'chef', role: 'administrateur', origine: 'panneau', action: 'joueur_solde', cible_type: 'joueur', cible: LEA, avant: { solde: 400 }, apres: { solde: 500, delta: 100 }, motif: 'geste commercial', inverse: { action: 'joueur_solde', p: { id: LEA, delta: -100 } } }] } });
  const fig = page.locator('.adm-chiffres .chiffre');
  await expect(fig).toHaveCount(6);
  await expect(fig.filter({ hasText: 'Joueurs actifs sur 24' })).toHaveAttribute('href', '#joueurs');
  await expect(fig.filter({ hasText: 'Mises des joueurs' })).toContainText('340,50');
  await expect(fig.filter({ hasText: 'Propositions à valider' })).toContainText('bientôt');
  await expect(fig.filter({ hasText: 'Sources en erreur' })).toContainText('bientôt');
  await expect(page.locator('.jl .entree').first()).toContainText('Solde ajusté');
  await expect(page.locator('.jl .entree').first()).toContainText('lea_reelle');                 // le pseudo du joueur visé, retrouvé après le rendu
  await expect(page.locator('.jl .entree').first().locator('.diff-b')).toContainText('500,00');
  await page.locator('.etat-l', { hasText: 'Maintenance' }).click();
  await expect(page.locator('.adm-tete h1')).toHaveText('Site');
  for (const h of ['marches-du-jour', 'sources']) { await aller(page, h); await expect(page.locator('.bientot-c')).toContainText('bientôt'); }
  expect((await appels(page)).map(a => a[0]).filter(a => !/^(tableau|journal_lire|reglages_lire)$/.test(a))).toEqual([]);   // ces écrans n'appellent aucune action
  expect(erreurs).toEqual([]);
});

test('joueurs : recherche, fiche, solde (avant → après, motif obligatoire), rang, KYC', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#joueurs' });
  await expect(page.locator('#adm-joueurs .rang-l')).toHaveCount(4);                          // les vrais comptes ; les bots seulement sur recherche
  await page.locator('#aj-q').fill('lea'); await page.locator('form[data-f="chercher"] button').click();
  await expect(page.locator('#adm-joueurs .rang-l')).toHaveCount(1);
  await page.locator('#adm-joueurs [data-joueur]').click();
  const fiche = page.locator('#adm-main');
  await expect(fiche).toContainText('lea_reelle@test.dev');
  await expect(page.locator('[data-v="solde"]')).toContainText('500,00');

  await page.locator('#as-d').fill('-9999'); await page.locator('form[data-f="solde"] button').click();
  await expect(message(page)).toContainText('Le solde ne peut pas devenir négatif.');               // refusé à l'écran, sans appel
  await page.locator('#as-d').fill('+250,5'); await page.locator('form[data-f="solde"] button').click();
  await page.locator('#adm-ov button[type="submit"]').click();                                      // sans motif : refus clair, la fenêtre reste
  await expect(fenetre(page).locator('[data-err]')).toContainText('Indique un motif');
  await confirmer(page, { lignes: [['Solde', '500,00', '750,50'], ['Opération', '—', 'ajustement admin de +250,50']], motif: 'geste commercial' });
  await expect(page.locator('[data-v="solde"]')).toContainText('750,50');
  await expect(message(page)).toContainText('Solde ajusté');
  await expect(page.locator('#adm-act')).toContainText('Ajustement admin +250,50');            // l'opération du relevé, dans l'activité du joueur

  await page.locator('#ar-t').selectOption('3-1'); await page.locator('form[data-f="rang"] button').click();
  await confirmer(page, { lignes: [['Rang', 'Bronze I', 'Or II']], motif: 'fidélité' });
  await expect(page.locator('[data-v="rang"]')).toHaveText('Or II');
  await page.locator('[data-a="kyc"]').click();
  await confirmer(page, { lignes: [['KYC', 'non fait', 'validé']] });                            // motif facultatif
  await expect(page.locator('[data-v="kyc"]')).toHaveText('validé');
  await page.locator('[data-a="kyc"]').click();
  await confirmer(page, { lignes: [['KYC', 'validé', 'refusé']], motif: 'pièce illisible' });
  await expect(page.locator('[data-v="kyc"]')).toHaveText('non fait');

  expect(await ecritures(page)).toEqual([
    ['joueur_solde', { id: LEA, delta: 250.5, motif: 'geste commercial' }], ['joueur_rang', { id: LEA, t: 3, d: 1, motif: 'fidélité' }],
    ['joueur_kyc', { id: LEA, ok: true, motif: '' }], ['joueur_kyc', { id: LEA, ok: false, motif: 'pièce illisible' }]]);
  expect(await lire(page, () => __fakeSB.equipe().ledger.map(x => x.k))).toEqual(['ajustement_admin']);
  expect(erreurs).toEqual([]);
});

test('blocages : un accès par blocage, une durée, le salon du chat ; lever ; déconnecter de partout', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#joueur/' + LEA });
  const f = page.locator('form[data-f="bloquer"]');
  await expect(f.locator('[data-salon]')).toBeHidden();
  await f.locator('[name="acces"]').selectOption('chat');
  await expect(f.locator('[data-salon]')).toBeVisible();
  await f.locator('[name="salon"]').selectOption('general');
  await f.locator('label.chip', { hasText: '1 heure' }).click();
  await f.locator('button.b-no').click();
  await confirmer(page, { lignes: [['Chat, Général', 'ouvert', 'bloqué jusqu’au'], ['Durée', '—', '1 heure']], motif: 'insultes' });
  await expect(page.locator('.bloc-l')).toHaveCount(1);
  await expect(page.locator('.bloc-l')).toContainText('Chat : Général');
  for (const [acces, duree, libelle] of [['paris', '24h', '24 heures'], ['depots', '7j', '7 jours'], ['retraits', '30j', '30 jours'], ['creation', 'permanent', 'Sans fin'], ['clans', '24h', '24 heures'], ['site', '1h', '1 heure']]) {
    await f.locator('[name="acces"]').selectOption(acces); await f.locator('label.chip', { hasText: libelle }).click(); await f.locator('button.b-no').click();
    await confirmer(page, { lignes: [['Durée', '—', libelle]], motif: 'contrôle ' + acces });
  }
  await expect(page.locator('.bloc-l')).toHaveCount(7);
  await page.locator('.bloc-l', { hasText: 'Paris' }).locator('[data-a="debloquer"]').click();
  await confirmer(page, { lignes: [['Paris', 'bloqué', 'ouvert']], motif: 'erreur de ma part' });
  await expect(page.locator('.bloc-l')).toHaveCount(6);
  await page.locator('[data-a="deconnecter"]').click();
  await confirmer(page, { lignes: [['Sessions ouvertes', '0', '0']] });
  await expect(message(page)).toContainText('déconnecté de tous ses appareils');
  const faits = await ecritures(page);
  expect(faits[0]).toEqual(['joueur_bloquer', { id: LEA, acces: 'chat', salon: 'general', duree: '1h', motif: 'insultes' }]);
  expect(faits.slice(1, 7).map(a => [a[1].acces, a[1].duree, a[1].salon])).toEqual([['paris', '24h', null], ['depots', '7j', null], ['retraits', '30j', null], ['creation', 'permanent', null], ['clans', '24h', null], ['site', '1h', null]]);
  expect(faits[7][0]).toBe('joueur_debloquer'); expect(faits[7][1].motif).toBe('erreur de ma part');
  expect(faits[8]).toEqual(['joueur_deconnecter', { id: LEA, motif: '' }]);
  expect(erreurs).toEqual([]);
});

test('activité d’un joueur : filtrée par type et par date ; un administrateur ne peut pas être bloqué ; ses propres comptes non plus', async ({ page }) => {
  const now = Date.now();
  const erreurs = await ouvrirPanneau(page, { hash: '#joueur/' + LEA, equipe: {
    ledger: [{ user: LEA, at: now - 2 * J, k: 'bet', montant: -20, solde: 480 }, { user: LEA, at: now - 10 * J, k: 'demo_deposit', montant: 100, solde: 500 }],
    sessions: { [LEA]: [{ cree: now - 3 * H, maj: now - H, appareil: 'iPhone Safari' }] },
    membres: [{ id: UID, n: 'chef', email: 'chef@test.dev', role: 'administrateur', actif: true, origine: 'ancien' }, { id: NOUVEAU, n: 'sofia', email: 'sofia@test.dev', role: 'administrateur', actif: true, origine: 'equipe' }] } });
  await expect(page.locator('#adm-act .je')).toHaveCount(5);                                    // 1 connexion, 2 opérations d'argent, 2 messages publics
  await expect(page.locator('#adm-act')).toContainText('Message dans Général');
  await page.locator('form[data-f="act-filtre"] label.chip', { hasText: 'Argent' }).click();
  await page.locator('form[data-f="act-filtre"] button').click();
  await expect(page.locator('#adm-act .je')).toHaveCount(2);
  await expect(page.locator('#adm-act')).toContainText('Pari −20,00');
  await page.locator('#act-au').fill(new Date(now - 5 * J).toISOString().slice(0, 10)); await page.locator('form[data-f="act-filtre"] button').click();
  await expect(page.locator('#adm-act .je')).toHaveCount(1);
  await expect(page.locator('#adm-act')).toContainText('Dépôt +100,00');
  const filtres = (await appels(page)).filter(a => a[0] === 'joueur_activite').map(a => a[1]);
  expect(filtres[1]).toEqual({ id: LEA, n: 30, types: ['argent'] });
  expect(filtres[2].types).toEqual(['argent']); expect(filtres[2].avant).toBeTruthy();
  // un autre administrateur : le serveur refuse de le bloquer (« interdit »), le message le dit en clair
  await aller(page, 'joueur/' + NOUVEAU); await expect(page.locator('#adm-fiche')).toContainText('sofia');
  await page.locator('form[data-f="bloquer"] button.b-no').click();
  await confirmer(page, { motif: 'essai' });
  await expect(message(page)).toContainText('Action refusée');
  expect(erreurs).toEqual([]);
});

test('ancien panneau, gardé : XP, levée d’une ancienne suspension, marchés (créer, modifier, fermer, résoudre avec confirmation)', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#joueur/' + LEA, equipe: { joueurs: JOUEURS.map(j => j.id === LEA ? { ...j, susp: Date.now() + 7 * J } : j) } });
  await page.locator('#ax-d').fill('100'); await page.locator('form[data-f="xp"] button').click();
  await expect(message(page)).toContainText('XP ajusté');
  await page.locator('[data-a="lever-ancienne"]').click();
  await confirmer(page, { lignes: [['Compte', 'suspendu', 'ouvert']] });
  await aller(page, 'marches');
  await expect(page.locator('#adm-marches .rang-l')).toHaveCount(1);
  await page.locator('#am-id').fill('pluie-paris'); await page.locator('#am-cat').selectOption('Météo'); await page.locator('#am-q').fill('Pleuvra-t-il à Paris dimanche ?');
  await page.locator('#am-s').fill('Pluie à Paris'); await page.locator('#am-d').fill('2027-03-07'); await page.locator('#am-t').fill('18:00'); await page.locator('#am-p').fill('40');
  await page.locator('form[data-f="marche"] button.b-pri').click();
  await expect(page.locator('#adm-marches .rang-l')).toHaveCount(2);
  await expect(message(page)).toContainText('Marché enregistré.');
  const ligne = page.locator('#adm-marches .rang-l', { hasText: 'pluie-paris' });
  await ligne.locator('[data-a="editer"]').click();
  await expect(page.locator('#am-id')).toHaveValue('pluie-paris'); await expect(page.locator('#am-id')).toHaveAttribute('readonly', '');
  await page.locator('#am-q').fill('Pleuvra-t-il à Paris dimanche après-midi ?'); await page.locator('form[data-f="marche"] button.b-pri').click();
  await ligne.locator('[data-a="etat"]').click();
  await confirmer(page, { lignes: [['Mises', 'ouvertes', 'fermées']] });
  await expect(ligne).toContainText('mises fermées');
  const btc = page.locator('#adm-marches .rang-l', { hasText: 'btc150k' });
  await btc.locator('[data-a="resoudre"][data-issue="oui"]').click();
  await expect(fenetre(page)).toContainText('Une résolution ne s’annule pas');
  await fenetre(page).locator('[data-a="fenetre-x"]').first().click();                            // on renonce : rien ne part
  expect((await anciens(page)).filter(a => a[0] === 'resoudre')).toEqual([]);
  await btc.locator('[data-a="resoudre"][data-issue="oui"]').click();
  await confirmer(page, { lignes: [['Issue gagnante', '—', 'Oui'], ['Positions de joueurs', '2', '1 $ par part gagnante']], motif: 'résultat officiel' });
  await expect(btc).toContainText('résolu'); await expect(btc.locator('[data-a]')).toHaveCount(0);
  await expect(message(page)).toContainText('versés à 2 position(s)');
  expect((await anciens(page)).map(a => a[0])).toEqual(['xp', 'suspendre', 'marche', 'marche', 'marche_etat', 'resoudre']);
  expect((await anciens(page))[5][1]).toEqual({ id: 'btc150k', issue: 'oui', motif: 'résultat officiel' });
  expect(erreurs).toEqual([]);
});

test('chat et communauté : masquer (confirmation) et rendre, mode lent, salon fermé, mots interdits, renommer et dissoudre un clan', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#chat' });
  await expect(page.locator('#adm-chat .je')).toHaveCount(2);
  const deplace = page.locator('#adm-chat .je', { hasText: 'message déplacé' });
  await deplace.locator('[data-a="masquer"]').click();
  await confirmer(page, { lignes: [['Message', 'visible', 'masqué']], motif: 'hors sujet' });
  await expect(deplace).toContainText('masqué');
  await deplace.locator('[data-a="restaurer"]').click();
  await expect(deplace.locator('[data-a="masquer"]')).toBeVisible();
  const general = page.locator('form[data-f="salon"][data-salon="general"]');
  await general.locator('[name="lent"]').selectOption('30'); await general.locator('button').click();
  await confirmer(page, { lignes: [['Mode lent', 'aucun', '30 s'], ['Salon', 'ouvert', 'ouvert']] });
  await expect(page.locator('form[data-f="salon"][data-salon="general"]')).toContainText('un message toutes les 30 secondes');
  const vip = page.locator('form[data-f="salon"][data-salon="vip"]');
  await vip.locator('[name="ferme"]').check(); await vip.locator('button').click();
  await confirmer(page, { lignes: [['Salon', 'ouvert', 'fermé']], motif: 'raid de spam' });
  await expect(page.locator('form[data-f="salon"][data-salon="vip"]')).toContainText('Fermé');
  await page.locator('#mi-l').fill('arnaque\nInsulte'); await page.locator('form[data-f="mots"] [name="prives"]').check(); await page.locator('form[data-f="mots"] button').click();
  await confirmer(page, { lignes: [['Mots', '0', '2'], ['Ajoutés', '—', 'arnaque, insulte'], ['Messages privés', 'non', 'aussi']] });
  await expect(message(page)).toContainText('2 mot(s)');
  const clan = page.locator('#adm-clans .je', { hasText: 'VIS' });
  await clan.locator('[name="nom"]').fill('Les Prévoyants'); await clan.locator('form[data-f="clan-renommer"] button').click();
  await confirmer(page, { lignes: [['Nom', 'Les Visionnaires', 'Les Prévoyants']] });
  await expect(page.locator('#adm-clans')).toContainText('Les Prévoyants [VIS]');
  await page.locator('#adm-clans [data-a="clan-dissoudre"]').click();
  await confirmer(page, { lignes: [['Membres', '1', '0'], ['Salon du clan', 'ouvert', 'fermé']], motif: 'clan de triche' });
  await expect(message(page)).toContainText('Clan dissous.');
  expect(await ecritures(page)).toEqual([
    ['chat_supprimer', { id: 41, motif: 'hors sujet' }], ['chat_restaurer', { id: 41 }],
    ['salon_regler', { salon: 'general', lent: 30, ferme: false, motif: '' }], ['salon_regler', { salon: 'vip', lent: 0, ferme: true, motif: 'raid de spam' }],
    ['mots_interdits', { mots: ['arnaque', 'insulte'], prives: true, motif: '' }],
    ['clan_renommer', { id: 'u1', nom: 'Les Prévoyants', motif: '' }], ['clan_dissoudre', { id: 'u1', motif: 'clan de triche' }]]);
  expect(erreurs).toEqual([]);
});

test('site : annonce publiée puis retirée, maintenance et sa sortie, activité simulée (bornes contrôlées)', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#site' });
  const an = page.locator('form[data-f="annonce"]');
  await an.locator('[name="fr"]').fill('Nouveau : les duels de stack ouvrent ce soir.'); await an.locator('[name="en"]').fill('New: stack duels open tonight.');
  await an.locator('label.chip', { hasText: 'Bonne nouvelle' }).click();
  await an.locator('button.b-pri').click();
  await confirmer(page, { lignes: [['Annonce', 'aucune', 'Nouveau : les duels'], ['Langues', '—', 'fr, en'], ['Fin', '—', 'sans date de fin']] });
  await expect(page.locator('.apercu.annonce.succes')).toContainText('Nouveau : les duels de stack');
  await page.locator('[data-a="annonce-retirer"]').click();
  await confirmer(page, { lignes: [['Annonce', 'Nouveau', 'aucune']] });
  await expect(page.locator('.apercu')).toHaveCount(0);
  const mt = page.locator('form[data-f="maintenance"]');
  await mt.locator('[name="fr"]').fill('Mise à jour du serveur, retour vers 22 h.');
  await mt.locator('button.b-no').click();
  await confirmer(page, { lignes: [['Maintenance', 'non', 'en cours']], motif: 'mise à jour' });
  await expect(page.locator('[data-v="maintenance"]')).toHaveText('Le site est en maintenance.');
  await page.locator('form[data-f="maintenance"] button.b-pri').click();
  await confirmer(page, { lignes: [['Maintenance', 'en cours', 'non']] });
  await expect(page.locator('[data-v="maintenance"]')).toHaveText('Le site est ouvert.');
  const bo = page.locator('form[data-f="bots"]');
  await bo.locator('[name="intensite"]').fill('9'); await bo.locator('button').click();
  await expect(message(page)).toContainText('Intensité : saisis un nombre entre 0 et 3');
  await bo.locator('[name="intensite"]').fill('2'); await bo.locator('[name="chat"]').fill('0,5'); await bo.locator('.tgl').click(); await bo.locator('button').click();
  await confirmer(page, { lignes: [['Bots', 'en marche', 'coupés'], ['Intensité', '1', '2'], ['Bavardage', '1', '0,5']] });
  await expect(message(page)).toContainText('Activité simulée enregistrée.');
  const faits = await ecritures(page);
  expect(faits.map(a => a[0])).toEqual(['annonce_publier', 'annonce_retirer', 'maintenance', 'maintenance', 'activite_simulee']);
  expect(faits[0][1]).toEqual({ textes: { fr: 'Nouveau : les duels de stack ouvrent ce soir.', en: 'New: stack duels open tonight.' }, ton: 'succes', fin: null, motif: '' });
  expect(faits[2][1]).toEqual({ actif: true, message: { fr: 'Mise à jour du serveur, retour vers 22 h.' }, motif: 'mise à jour' });
  expect(faits[4][1]).toEqual({ actif: false, intensite: 2, chat: 0.5, motif: '' });
  expect(erreurs).toEqual([]);
});

test('frais et argent : nom, phrase, valeur, défaut, « Revenir au défaut » ; l’exemple chiffré suit la nouvelle valeur ; bornes ; jeux « pas encore appliqués »', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#frais' });
  const k = page.locator('#r-frais\\.k');
  await expect(k).toContainText('Multiplicateur des frais des paris'); await expect(k).toContainText('barème de sa catégorie');
  await expect(k.locator('.reg-vals')).toContainText('Valeur'); await expect(k.locator('.reg-vals')).toContainText('Par défaut');
  await expect(k.locator('[data-a="reg-defaut"]')).toBeDisabled();                               // déjà la valeur par défaut
  const exemple = () => page.locator('[data-v="exemple"]').innerText();
  const avant = await exemple();
  expect(avant).toMatch(/Sur une mise de 100\s?\$ sur Oui à 60\s?% \(Crypto\), le joueur paie [\d,]+\s?\$ de frais/);
  const crypto = page.locator('#r-frais\\.taux\\.crypto');
  await crypto.locator('[data-a="reg-modifier"]').click();
  await crypto.locator('input[name="valeur"]').fill('20');
  await expect(crypto.locator('[data-err]')).toContainText('Valeur hors des bornes : Entre 0 % et 15 %');
  await crypto.locator('input[name="valeur"]').fill('9,5');
  await expect(page.locator('[data-v="exemple-brouillon"]')).toContainText('Avec la nouvelle valeur');
  // le même calcul que le site (js/engine.js) : 9,5 % au lieu de 7 % → des frais plus élevés
  const [f0, f1] = await lire(page, () => { const m = () => ({ id: 'x', cat: 'Crypto', p: 60, vol: 250000 }); return [quoteBuy(m(), 'oui', 100, false, .07 * .7).fee, quoteBuy(m(), 'oui', 100, false, .095 * .7).fee]; });
  await expect(page.locator('[data-v="exemple-brouillon"]')).toContainText(f1.toFixed(2).replace('.', ','));
  expect(avant).toContain(f0.toFixed(2).replace('.', ','));
  await crypto.locator('form[data-f="reglage"] button.b-pri').click();
  await confirmer(page, { lignes: [['Barème Crypto', '7', '9,5'], ['Frais sur 100', f0.toFixed(2).replace('.', ','), f1.toFixed(2).replace('.', ',')]], motif: 'volatilité' });
  await expect(page.locator('#r-frais\\.taux\\.crypto [data-v="valeur"]')).toHaveText('9,5 %');
  await page.locator('#r-frais\\.taux\\.crypto [data-a="reg-defaut"]').click();
  await confirmer(page, { lignes: [['Barème Crypto', '9,5', '7']], motif: 'retour à la normale' });
  await expect(page.locator('#r-frais\\.taux\\.crypto [data-v="valeur"]')).toHaveText('7 %');
  const max = page.locator('#r-paris\\.mise_max');
  await expect(max.locator('[data-v="valeur"]')).toHaveText('aucun plafond');
  await max.locator('[data-a="reg-modifier"]').click(); await max.locator('input[name="valeur"]').fill('50'); await max.locator('button.b-pri').click();
  await confirmer(page, { lignes: [['Mise maximum', 'aucun plafond', '50']], motif: 'lancement' });
  await page.locator('#r-paris\\.mise_min [data-a="reg-modifier"]').click(); await page.locator('#r-paris\\.mise_min input[name="valeur"]').fill('60'); await page.locator('#r-paris\\.mise_min button.b-pri').click();
  await confirmer(page, { motif: 'essai' });
  await expect(message(page)).toContainText('un minimum ne peut pas dépasser son maximum');      // refus du serveur, en clair
  await aller(page, 'jeux');
  const blitz = page.locator('#r-blitz\\.buyin');
  await expect(blitz).toContainText('pas encore appliqué'); await expect(blitz.locator('[data-a="reg-modifier"]')).toHaveCount(0);
  const serie = page.locator('#r-serie\\.mises');
  await serie.locator('[data-a="reg-modifier"]').click(); await serie.locator('input[name="valeur"]').fill('5 ; 10 ; 20 ; 50'); await serie.locator('button.b-pri').click();
  await confirmer(page, { motif: 'moins de paliers' });
  await expect(page.locator('#r-serie\\.mises [data-v="valeur"]')).toContainText('20');
  const faits = (await ecritures(page)).filter(a => a[0] === 'reglage_modifier').map(a => a[1]);
  expect(faits).toEqual([{ cle: 'frais.taux.crypto', valeur: 0.095, motif: 'volatilité' }, { cle: 'frais.taux.crypto', valeur: 0.07, motif: 'retour à la normale' },
    { cle: 'paris.mise_max', valeur: 50, motif: 'lancement' }, { cle: 'paris.mise_min', valeur: 60, motif: 'essai' }, { cle: 'serie.mises', valeur: [5, 10, 20, 50], motif: 'moins de paliers' }]);
  expect(erreurs).toEqual([]);
});

test('administrateurs : ajouter un compte personnel par e-mail, changer de rôle, retirer ; refus en clair', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#equipe' });
  await expect(page.locator('#adm-equipe .rang-l')).toHaveCount(1);
  await page.locator('#me-e').fill('essai@test.dev'); await page.locator('form[data-f="membre-ajouter"] button').click();
  await confirmer(page, { motif: 'nouveau partenaire' });
  await expect(message(page)).toContainText('compte joueur personnel');                         // compte de test refusé par le serveur
  await page.locator('#me-e').fill('sofia@test.dev'); await page.locator('#me-r').selectOption('moderateur'); await page.locator('form[data-f="membre-ajouter"] button').click();
  await confirmer(page, { lignes: [['Équipe', '1 membre(s)', '2 membre(s)'], ['sofia@test.dev', 'joueur', 'modérateur']], motif: 'nouvelle modératrice' });
  await expect(page.locator('#adm-equipe .rang-l')).toHaveCount(2);
  const sofia = page.locator('#adm-equipe .rang-l', { hasText: 'sofia' });
  await sofia.locator('[name="role"]').selectOption('administrateur'); await sofia.locator('form[data-f="membre-role"] button').click();
  await confirmer(page, { lignes: [['Rôle', 'modérateur', 'administrateur']], motif: 'associée' });
  await page.locator('#adm-equipe .rang-l', { hasText: 'sofia' }).locator('[data-a="membre-retirer"]').click();
  await confirmer(page, { lignes: [['Rôle', 'administrateur', 'aucun']], motif: 'départ' });
  await expect(page.locator('#adm-equipe .rang-l')).toHaveCount(1);
  await page.locator('#adm-equipe [data-a="membre-retirer"]').click();
  await confirmer(page, { motif: 'essai' });
  await expect(message(page)).toContainText('au moins un administrateur');
  await expect(page.locator('#r-equipe\\.mfa_obligatoire')).toContainText('Double authentification pour tous');
  expect((await ecritures(page)).map(a => [a[0], a[1].email || a[1].id, a[1].role])).toEqual([
    ['equipe_ajouter', 'essai@test.dev', 'moderateur'], ['equipe_ajouter', 'sofia@test.dev', 'moderateur'], ['equipe_role', NOUVEAU, 'administrateur'], ['equipe_retirer', NOUVEAU, undefined], ['equipe_retirer', UID, undefined]]);
  expect(erreurs).toEqual([]);
});

test('journal : filtres (qui, type, joueur, dates), export CSV, vérification, « Annuler » une décision', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page, { hash: '#joueur/' + LEA });
  await page.locator('#as-d').fill('40'); await page.locator('form[data-f="solde"] button').click(); await confirmer(page, { motif: 'premier geste' });
  await page.locator('[data-a="kyc"]').click(); await confirmer(page, {});
  await aller(page, 'journal');
  await expect(page.locator('#adm-journal .entree')).toHaveCount(2);
  await page.locator('#jf-t').selectOption('joueur_solde'); await page.locator('form[data-f="journal-filtre"] button.b-white').click();
  await expect(page.locator('#adm-journal .entree')).toHaveCount(1);
  await expect(page.locator('#adm-journal .entree')).toContainText('premier geste');
  const dl = page.waitForEvent('download');
  await page.locator('[data-a="journal-csv"]').click();
  const fichier = await dl; expect(fichier.suggestedFilename()).toMatch(/^wimoro-journal-\d{8}\.csv$/);
  const csv = fs.readFileSync(await fichier.path(), 'utf8'); expect(csv.charCodeAt(0)).toBe(0xfeff); expect(csv).toContain('"joueur_solde"');
  await page.locator('[data-a="journal-verifier"]').click();
  await expect(page.locator('[data-v="verif"]')).toContainText('Journal intact');
  await page.locator('#adm-journal [data-a="journal-annuler"]').click();
  await confirmer(page, { lignes: [['Solde ajusté', '540,00', '500,00']], motif: 'erreur de joueur' });
  await expect(message(page)).toContainText('annulée');
  await page.locator('[data-a="journal-tout"]').click();
  await expect(page.locator('#adm-journal .entree')).toHaveCount(3);
  await expect(page.locator('#adm-journal .entree').first()).toContainText('annule l’entrée n° 1');
  await expect(page.locator('#adm-journal .entree', { hasText: 'premier geste' }).locator('[data-a="journal-annuler"]')).toHaveCount(0);   // une seule fois
  const faits = (await appels(page)).filter(a => /^journal_/.test(a[0]));
  expect(faits.find(a => a[0] === 'journal_annuler')).toEqual(['journal_annuler', { id: 1, motif: 'erreur de joueur' }]);
  expect(faits.find(a => a[0] === 'journal_lire' && a[1].action)).toEqual(['journal_lire', { n: 50, action: 'joueur_solde' }]);
  expect(await lire(page, () => __fakeSB.equipe().joueurs.find(j => j.n === 'lea_reelle').balance)).toBe(500);
  expect(erreurs).toEqual([]);
});

test('double authentification : le serveur la demande, le mauvais code est refusé, le bon rouvre l’action ; enrôlement depuis Mon compte', async ({ page, browser }) => {
  const erreurs = await ouvrirPanneau(page, { equipe: { facteurs: 1 }, hash: '#joueurs' });
  await expect(page.locator('.adm-porte')).toContainText('Double authentification');           // un code enrôlé et une session aal1 : la porte demande le code
  await page.locator('[data-a="porte-mfa"]').click();
  await page.locator('#adm-mfa-c').fill('000000'); await page.locator('#adm-ov button[type="submit"]').click();
  await expect(page.locator('#adm-ov [data-err]')).toContainText('Code incorrect');
  await page.locator('#adm-mfa-c').fill('123456'); await page.locator('#adm-ov button[type="submit"]').click();
  await expect(page.locator('.adm-tete h1')).toHaveText('Joueurs');
  expect(await lire(page, () => __fakeSB.journal().filter(c => c.kind === 'auth' && c.name === 'mfa.verify').map(c => c.args.code))).toEqual(['000000', '123456']);

  // en cours de session : le serveur répond « mfa_requise » ; le panneau demande le code puis rejoue l'action
  await lire(page, () => { __fakeSB.db.aal = 'aal1'; __fakeSB.persist(); });
  await page.locator('#aj-q').fill('lea'); await page.locator('form[data-f="chercher"] button').click();
  await page.locator('#adm-mfa-c').fill('123456'); await page.locator('#adm-ov button[type="submit"]').click();
  await expect(page.locator('#adm-joueurs .rang-l')).toHaveCount(1);

  const ctx2 = await browser.newContext({ baseURL: test.info().project.use.baseURL });         // un autre navigateur : un autre membre, sans code
  const autre = await ctx2.newPage();
  const e2 = await ouvrirPanneau(autre, { hash: '#compte' });
  await expect(autre.locator('[data-v="mfa"]')).toContainText('Pas encore activée');
  await autre.locator('[data-a="mfa-activer"]').click();
  await expect(autre.locator('#adm-ov')).toContainText('Clé à saisir à la main');
  await expect(autre.locator('#adm-ov .adm-cle')).toHaveText('JBSWY3DPEHPK3PXP');
  await expect(autre.locator('#adm-ov img')).toHaveAttribute('src', /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  await autre.locator('#adm-mfa-c').fill('123456'); await autre.locator('#adm-ov button[type="submit"]').click();
  await expect(autre.locator('[data-v="mfa"]')).toContainText('Active');
  expect(await lire(autre, () => __fakeSB.journal().filter(c => c.kind === 'auth' && /^mfa\.(enroll|verify)$/.test(c.name)).map(c => c.name))).toEqual(['mfa.enroll', 'mfa.verify']);
  expect(erreurs).toEqual([]); expect(e2).toEqual([]);
});

test('recherche du bandeau : un joueur, un réglage, un écran, en trois clics au plus', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page);
  await page.locator('#adm-q').fill('lea');
  await expect(page.locator('#adm-sres')).toContainText('lea_reelle');
  await page.locator('#adm-sres a', { hasText: 'lea_reelle' }).click();
  await expect(page.locator('#adm-fiche')).toContainText('lea_reelle');
  await page.locator('#adm-q').fill('parrainage');
  await page.locator('#adm-sres a', { hasText: 'Bonus de parrainage' }).click();
  await expect(page.locator('#r-parrainage\\.bonus')).toBeInViewport();
  await page.locator('#adm-q').fill('journal');
  await expect(page.locator('#adm-sres .adm-sres-g').first()).toHaveText('Écrans');
  await page.locator('#adm-q').press('Enter');
  await expect(page.locator('.adm-tete h1')).toHaveText('Journal');
  expect(erreurs).toEqual([]);
});

test('téléphone : le menu s’ouvre et se ferme, aucun écran ne déborde en largeur @mobile', async ({ page }) => {
  const erreurs = await ouvrirPanneau(page);
  if (page.viewportSize().width < 880) {                                                        // téléphone : le menu est un tiroir
    await expect(page.locator('#adm-menu')).toBeVisible();
    await page.locator('#adm-menu').click();
    await expect(page.locator('#adm-nav')).toBeInViewport();
    await page.locator('#adm-nav a', { hasText: 'Frais et argent' }).click();
    await expect(page.locator('.adm-tete h1')).toHaveText('Frais et argent');
    await expect(page.locator('#adm-nav')).not.toBeInViewport();
  } else {                                                                                        // ordinateur : le menu reste à gauche
    await expect(page.locator('#adm-menu')).toBeHidden();
    await expect(page.locator('#adm-nav')).toBeInViewport();
  }
  const deborde = [];
  for (const h of ['accueil', 'joueurs', 'joueur/' + LEA, 'chat', 'frais', 'jeux', 'site', 'marches', 'marches-du-jour', 'sources', 'equipe', 'journal', 'compte']) {
    await aller(page, h); await page.waitForTimeout(250);
    const d = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (d > 2) deborde.push(`${h} (+${d}px)`);
  }
  expect(deborde).toEqual([]);
  expect(erreurs).toEqual([]);
});
