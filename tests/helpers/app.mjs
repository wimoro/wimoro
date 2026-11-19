// Aide commune aux tests du front : ouvre le site dans un mode et une langue donnés et collecte les erreurs.
//   mode 'visiteur' : personne n'est connecté
//   mode 'demo'     : compte démo User26 (local)
//   mode 'compte'   : session Supabase (faux serveur, voir fake-supabase.js)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FAUX = fs.readFileSync(path.join(ICI, 'fake-supabase.js'), 'utf8');
export const UID = '11111111-1111-4111-8111-111111111111';
export const AMI = '22222222-2222-4222-8222-222222222222';
export const ECRANS = ['accueil', 'marche-btc150k', 'marche-presid27', 'marche-presid27-roux', 'eclair', 'blitz', 'serie', 'chat', 'clans', 'classement', 'rang', 'profil', 'joueur-lea', 'depot', 'retrait', 'creer', 'modifier', 'amis', 'copie', 'parrainage', 'responsable', 'duels', 'combines', 'bienvenue', 'connexion', 'inscription'];

/**
 * Réglages publics du site (api_site) lus par un visiteur ou le compte démo : une lecture REST directe, sans la bibliothèque
 * Supabase. Le test la sert lui-même (jamais le vrai serveur) ; `site` reste modifiable pendant le test.
 */
export const siteNeuf = (plus = {}) => ({ rev: 1, v: {}, annonce: null, maintenance: { actif: false, message: null }, ...plus });
export async function routerSite(page, site = siteNeuf()) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, content-type, authorization, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route(/\/rest\/v1\/rpc\/api_site/, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(site) }));
  return site;
}

/**
 * Données vivantes (partie D : api_live et api_fixations), lues en REST par un visiteur ou le compte démo. Jamais le vrai
 * serveur : sans `direct`, la lecture échoue (le pari éclair reste simulé, exactement comme avant) ; avec `direct`
 * = { live, fixations: { <jeu>: réponse } }, le test sert des réponses enregistrées (tests/fixtures/eclair-direct/),
 * modifiables pendant le test (l'objet est relu à chaque appel). Les appels sont notés dans direct.appels.
 */
export async function routerDirect(page, direct = null) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, content-type, authorization, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route(/\/rest\/v1\/rpc\/api_(live|fixations)/, async r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (!direct) return r.abort('failed');
    const nom = /api_live/.test(r.request().url()) ? 'live' : 'fixations', corps = JSON.parse(r.request().postData() || '{}');
    (direct.appels = direct.appels || []).push({ nom, corps });
    const rep = nom === 'live' ? direct.live : (direct.fixations || {})[corps.p_jeu];
    const x = typeof rep === 'function' ? await rep(corps) : rep;                 // une fonction (éventuellement asynchrone) : réponse à la demande
    if (!x) return r.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"message":"absent"}' });
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(x) });
  });
  return direct;
}

/** Début (en ms) d'une manche éclair : les manches durent 45 s à partir du 1er nov. 2026 UTC. */
export const debutManche = (n = 1000) => Date.UTC(2026, 10, 1) + n * 45000;

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ mode?: 'visiteur'|'demo'|'compte', lang?: 'en'|'fr'|'he', hash?: string, faux?: object (voir fake-supabase.js : etat, comptes, marches…), local?: Record<string,string>, horloge?: number|Date, requete?: string }} [o]
 *        horloge : fige l'heure au départ (les minuteurs n'avancent qu'avec page.clock.runFor / fastForward).
 */
export async function ouvrir(page, o = {}) {
  const { mode = 'visiteur', lang = 'en', hash = '#accueil', faux = {}, local = {}, horloge = null, requete = '' } = o;
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(`${e.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console.error: ' + m.text()); });
  // Le client Supabase (fichier local ou CDN) est toujours remplacé par le faux serveur ; les polices ne sont pas chargées.
  await page.route(/(js\/vendor\/supabase[^/]*\.js|cdn\.jsdelivr\.net\/.*supabase)/, r => r.fulfill({ contentType: 'text/javascript', body: FAUX }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  /* faux.siteKo : la lecture des réglages du site échoue (serveur injoignable) */
  const site = faux.siteKo ? (await page.route(/\/rest\/v1\/rpc\/api_site/, r => r.abort('failed')), null) : await routerSite(page, siteNeuf(faux.site || {}));
  /* partie D : données vivantes servies par le test (o.direct), jamais par le vrai serveur (lecture REST dans tous les modes) */
  const direct = await routerDirect(page, o.direct || null);
  const cfg = { ...faux, session: mode === 'compte' ? (faux.session || { user: { id: UID, email: 'real@test.dev' } }) : null };
  if (horloge != null) await page.clock.install({ time: horloge });
  await page.addInitScript(({ lang, mode, cfg, local }) => {
    if (!sessionStorage.getItem('__init__')) {          // seulement au premier chargement, pas aux rechargements
      sessionStorage.setItem('__init__', '1');
      localStorage.setItem('wimoro-lang', lang);
      if (mode === 'demo') localStorage.setItem('wimoro-session', '__demo__');
      if (mode === 'compte') localStorage.setItem('wimoro-auth', JSON.stringify({ faux: true }));
      for (const k in local) localStorage.setItem(k, local[k]);
    }
    window.__FAKE_SB__ = cfg;
  }, { lang, mode, cfg, local });
  await page.goto('/index.html' + requete + hash);                    // requete : ex. '?r=CODE' (lien d'invitation)
  await expect(page.locator('#view > *').first()).toBeAttached({ timeout: 15000 });
  return { erreurs, site, direct };
}

/** Change d'écran par le hash et attend le rendu. */
export async function aller(page, ecran) {
  await page.evaluate(h => { location.hash = '#' + h; }, ecran);
  await page.waitForTimeout(130);      // certains écrans redirigent (ex. connexion → accueil quand on est connecté) : on attend juste le rendu
}

/** Lit une valeur de l'application (S, MK, G… sont des variables globales du site). */
export const lire = (page, fn, arg) => page.evaluate(fn, arg);

/**
 * Ferme le popup « nouveau rang » s'il s'affiche. Il arrive 450 ms après un gain d'XP et recouvre la page : sur une
 * machine lente, il peut tomber juste avant un clic du test.
 */
export async function fermerRang(page, attente = 1500) {
  await page.locator('.rankup').waitFor({ state: 'visible', timeout: attente }).catch(() => {});
  if (await page.locator('.rankup').count()) { await page.keyboard.press('Escape'); await expect(page.locator('.rankup')).toHaveCount(0); }
}
