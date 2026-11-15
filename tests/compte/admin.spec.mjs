// Page d'administration (admin.html), avec le faux serveur : elle ne montre rien sans compte administrateur, et chaque
// action part vers le serveur par api_admin. Le contrôle lui-même est prouvé côté base (tests/sql/admin.spec.mjs).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { UID, lire } from '../helpers/app.mjs';

const FAUX = fs.readFileSync('tests/helpers/fake-supabase.js', 'utf8');
const LEA = '22222222-2222-4222-8222-222222222222', BOT = '33333333-3333-4333-8333-333333333333';
const joueur = (id, n, plus = {}) => ({ id, n, email: n + '@test.dev', bot: false, since: Date.UTC(2026, 9, 1), vu: Date.UTC(2026, 10, 14), balance: 500, xp: 320, t: 1, d: 0, settled: 4, wins: 2, deposits: 1, kyc: false, susp: null, suspMotif: null, excl: null, admin: false, ...plus });
const DONNEES = {
  joueurs: [joueur(UID, 'chef', { admin: true }), joueur(LEA, 'lea_reelle'), joueur(BOT, 'maxou_bot', { bot: true, email: '' })],
  marches: [{ id: 'btc150k', q: 'Le Bitcoin dépassera-t-il 150 000 $ ?', short: 'Bitcoin à 150 000 $', cat: 'Crypto', st: 'open', issue: null, p: 63, ref: 63, vol: 4200000, date: '2026-12-31', time: '23:59', heat: 3.2, rules: '', parent: null, cree: false, positions: 2 }],
  msgs: [{ id: 41, room: 'general', u: LEA, n: 'lea_reelle', text: 'message déplacé', at: Date.UTC(2026, 10, 15, 10) }, { id: 40, room: 'm:btc150k', u: LEA, n: 'lea_reelle', text: 'message correct', at: Date.UTC(2026, 10, 15, 9) }]
};

async function ouvrirAdmin(page, { session = true, admin = true } = {}) {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(`${e.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console.error: ' + m.text()); });
  await page.route(/js\/vendor\/supabase[^/]*\.js/, r => r.fulfill({ contentType: 'text/javascript', body: FAUX }));
  const cfg = { session: session ? { user: { id: UID, email: 'chef@test.dev' } } : null, admin, adminData: DONNEES, comptes: { 'chef@test.dev': { id: UID, mdp: 'Motdepasse-9!' } } };
  await page.addInitScript(({ cfg, session }) => {
    if (!sessionStorage.getItem('__init__')) { sessionStorage.setItem('__init__', '1'); if (session) localStorage.setItem('wimoro-auth', JSON.stringify({ faux: true })); }
    window.__FAKE_SB__ = cfg;
  }, { cfg, session });
  await page.goto('/admin.html');
  return erreurs;
}
const appels = page => lire(page, () => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === 'api_admin').map(c => [c.args.p_action, c.args.p]));
const message = page => page.locator('#adm-msg');
const onglet = (page, nom) => page.locator(`#adm-nav [data-onglet="${nom}"]`).click();

test('sans session : formulaire de connexion ; avec un compte non administrateur : accès réservé, aucun onglet, aucune donnée', async ({ page }) => {
  let erreurs = await ouvrirAdmin(page, { session: false });
  await expect(page.locator('form[data-f="connexion"]')).toBeVisible();
  await expect(page.locator('#adm-nav')).toBeHidden();
  expect(await lire(page, () => typeof __fakeSB === 'undefined' ? 0 : __fakeSB.calls.filter(c => c.kind === 'rpc').length), 'aucun appel sans session').toBe(0);
  expect(erreurs).toEqual([]);

  const autre = await page.context().newPage();
  erreurs = await ouvrirAdmin(autre, { admin: false });
  await expect(autre.locator('#adm-refus')).toContainText('Accès réservé');
  await expect(autre.locator('#adm-nav')).toBeHidden();
  expect(await appels(autre)).toEqual([['moi', {}]]);                                         // une seule question posée au serveur : « suis-je administrateur ? »
  expect(await lire(autre, async () => { try { await API.call('api_admin', { p_action: 'joueurs', p: {} }); return 'ouvert'; } catch (e) { return e.code; } })).toBe('interdit');
  expect(erreurs).toEqual([]);
});

test('chiffres, puis joueurs : recherche, solde avec motif, XP, rang, KYC, suspension et levée', async ({ page }) => {
  const erreurs = await ouvrirAdmin(page);
  await expect(page.locator('.chiffre').first()).toBeVisible();
  await expect(page.locator('#adm-main')).toContainText('Inscrits'); await expect(page.locator('#adm-main')).toContainText('80 Mo sur 500');
  await onglet(page, 'joueurs');
  await expect(page.locator('#adm-joueurs .rang')).toHaveCount(2);                            // les vrais comptes ; les bots seulement sur recherche
  await page.locator('#aj-q').fill('lea'); await page.locator('form[data-f="chercher"] button').click();
  await expect(page.locator('#adm-joueurs .rang')).toHaveCount(1);
  await page.locator('#adm-joueurs [data-a="fiche"]').click();
  const fiche = page.locator('#adm-fiche');
  await expect(fiche).toContainText('lea_reelle@test.dev');
  await expect(fiche.locator('[data-v="solde"]')).toContainText('500,00');

  await page.locator('#as-d').fill('-9999'); await page.locator('#as-m').fill('trop'); await page.locator('form[data-f="solde"] button').click();
  await expect(message(page)).toContainText('Le solde ne peut pas devenir négatif.');
  await expect(fiche.locator('[data-v="solde"]')).toContainText('500,00');
  await page.locator('#as-d').fill('250,5'); await page.locator('#as-m').fill('geste commercial'); await page.locator('form[data-f="solde"] button').click();
  await expect(fiche.locator('[data-v="solde"]')).toContainText('750,50');
  await expect(fiche).toContainText('Solde ajusté'); await expect(fiche).toContainText('geste commercial');

  await page.locator('#ax-d').fill('100'); await page.locator('form[data-f="xp"] button').first().click();
  await expect(fiche.locator('[data-v="xp"]')).toContainText('420');
  await page.locator('#ar-t').selectOption('3-1'); await page.locator('[data-a="rang"]').click();
  await expect(fiche.locator('[data-v="rang"]')).toHaveText('Or II');
  await page.locator('[data-a="kyc"]').click();
  await expect(fiche.locator('[data-v="kyc"]')).toHaveText('validé');
  await page.locator('#au-j').selectOption('7'); await page.locator('#au-m').fill('insultes'); await page.locator('form[data-f="suspendre"] button').click();
  await expect(fiche.locator('[data-v="susp"]')).toContainText('insultes');
  await page.locator('[data-a="lever"]').click();
  await expect(fiche.locator('[data-v="susp"]')).toHaveCount(0);

  const faits = (await appels(page)).filter(a => !['moi', 'chiffres', 'joueurs', 'joueur'].includes(a[0]));
  expect(faits).toEqual([
    ['solde', { id: LEA, delta: '-9999', motif: 'trop' }], ['solde', { id: LEA, delta: '250.5', motif: 'geste commercial' }], ['xp', { id: LEA, delta: '100' }],
    ['rang', { id: LEA, t: '3', d: '1' }], ['kyc', { id: LEA, ok: true }], ['suspendre', { id: LEA, jours: '7', motif: 'insultes' }], ['suspendre', { id: LEA, jours: 0 }]]);
  expect(erreurs).toEqual([]);
});

test('marchés : créer, modifier, fermer les mises ; résoudre demande un second clic', async ({ page }) => {
  const erreurs = await ouvrirAdmin(page);
  await onglet(page, 'marches');
  await expect(page.locator('#adm-marches .rang')).toHaveCount(1);
  await page.locator('#am-id').fill('pluie-paris'); await page.locator('#am-cat').selectOption('Météo'); await page.locator('#am-q').fill('Pleuvra-t-il à Paris dimanche ?');
  await page.locator('#am-s').fill('Pluie à Paris'); await page.locator('#am-d').fill('2027-03-07'); await page.locator('#am-t').fill('18:00'); await page.locator('#am-p').fill('40');
  await page.locator('#am-r').fill('Oui si Météo-France relève au moins 1 mm.');
  await page.locator('form[data-f="marche"] button.pr').click();
  await expect(page.locator('#adm-marches .rang')).toHaveCount(2);
  await expect(message(page)).toContainText('Marché enregistré.');

  const ligne = page.locator('#adm-marches .rang', { hasText: 'pluie-paris' });
  await ligne.locator('[data-a="editer"]').click();
  await expect(page.locator('#am-id')).toHaveValue('pluie-paris'); await expect(page.locator('#am-id')).toHaveAttribute('readonly', '');
  await page.locator('#am-q').fill('Pleuvra-t-il à Paris dimanche après-midi ?'); await page.locator('form[data-f="marche"] button.pr').click();
  await ligne.locator('[data-a="etat"]').click();
  await expect(ligne).toContainText('mises fermées');
  await expect(ligne.locator('[data-a="etat"]')).toHaveText('Rouvrir les mises');

  const btc = page.locator('#adm-marches .rang', { hasText: 'btc150k' });
  await btc.locator('[data-a="resoudre"][data-issue="oui"]').click();
  await expect(btc.locator('[data-a="resoudre"][data-issue="oui"]')).toHaveText('Confirmer : Oui gagne');
  expect((await appels(page)).filter(a => a[0] === 'resoudre'), 'un seul clic ne résout rien').toEqual([]);
  await btc.locator('[data-a="resoudre"][data-issue="oui"]').click();
  await expect(btc).toContainText('résolu'); await expect(btc.locator('[data-a]')).toHaveCount(0);   // plus aucune action sur un marché résolu
  await expect(message(page)).toContainText('versés à 2 position(s)');

  const faits = (await appels(page)).filter(a => ['marche', 'marche_etat', 'resoudre'].includes(a[0]));
  expect(faits.map(a => a[0])).toEqual(['marche', 'marche', 'marche_etat', 'resoudre']);
  expect(faits[0][1]).toEqual({ id: 'pluie-paris', cat: 'Météo', q: 'Pleuvra-t-il à Paris dimanche ?', short: 'Pluie à Paris', date: '2027-03-07', time: '18:00', p: '40', heat: '1.5', rules: 'Oui si Météo-France relève au moins 1 mm.' });
  expect(faits[2][1]).toEqual({ id: 'pluie-paris', etat: 'closed' }); expect(faits[3][1]).toEqual({ id: 'btc150k', issue: 'oui' });
  expect(erreurs).toEqual([]);
});

test('chat, bots, journal : masquer un message (second clic), couper et régler les bots, tout est journalisé', async ({ page }) => {
  const erreurs = await ouvrirAdmin(page);
  await onglet(page, 'chat');
  await expect(page.locator('#adm-chat .rang')).toHaveCount(2);
  const deplace = page.locator('#adm-chat .rang', { hasText: 'message déplacé' });
  await deplace.locator('[data-a="masquer"]').click(); await deplace.locator('[data-a="masquer"]').click();
  await expect(page.locator('#adm-chat .rang')).toHaveCount(1);
  await expect(page.locator('#adm-chat')).not.toContainText('message déplacé');

  await onglet(page, 'bots');
  await expect(page.locator('[data-v="bots"]')).toHaveText('en marche');
  await page.locator('#ab-i').fill('9'); await page.locator('form[data-f="bots"] button').click();
  await expect(message(page)).toContainText('Valeur invalide.');
  await page.locator('#ab-i').fill('2'); await page.locator('#ab-c').fill('0,5'); await page.locator('form[data-f="bots"] button').click();
  await expect(message(page)).toContainText('Réglage des bots enregistré.');
  await page.locator('[data-a="bots-actif"]').click();
  await expect(page.locator('[data-v="bots"]')).toHaveText('coupés');
  await expect(page.locator('[data-a="bots-actif"]')).toHaveText('Remettre les bots en marche');

  await onglet(page, 'journal');
  await expect(page.locator('#adm-journal .rang')).toHaveCount(3);
  await expect(page.locator('#adm-journal .rang').first()).toContainText('Réglage des bots'); await expect(page.locator('#adm-journal .rang').first()).toContainText('coupés');
  const faits = (await appels(page)).filter(a => ['masquer', 'bots'].includes(a[0]));
  expect(faits).toEqual([['masquer', { id: '41' }], ['bots', { intensite: '9', chat: '1' }], ['bots', { intensite: '2', chat: '0.5' }], ['bots', { actif: false }]]);
  expect(erreurs).toEqual([]);
});
