/* WIMORO — panneau d'administration (admin.html), le socle : appels au serveur, erreurs, navigation, recherche,
 * confirmation des actions sensibles, double authentification, démarrage.
 *
 * Tout passe par la porte unique du serveur, api_equipe(action, paramètres), qui vérifie à CHAQUE appel le rôle du compte
 * (administrateur ou modérateur), la double authentification et le motif. Cette page n'a aucun droit par elle-même : sans
 * rôle dans l'équipe, elle n'affiche rien. Trois fonctions de l'ancien panneau n'ont pas encore leur action dans la nouvelle
 * porte (l'XP, les marchés, la levée d'une ancienne suspension) : elles passent par l'ancienne, api_admin, comme avant.
 *
 * Les écrans sont dans js/admin-ecrans.js, les réglages (frais, limites, jeux) dans js/admin-reglages.js. Le panneau est en
 * français seulement : il ne sert qu'à l'équipe. */
'use strict';

/* ===================== Aides ===================== */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NB = ' ';                                                  // espace fine insécable : « 12 $ » ne se coupe jamais
const nf = (v, d = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(+v || 0);
const nfx = (v, max = 6) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max }).format(+v || 0);
const usd = v => nf(v) + NB + '$';
const usd0 = v => nfx(v, 2) + NB + '$';
const nb = v => new Intl.NumberFormat('fr-FR').format(+v || 0);
const signe = v => (+v > 0 ? '+' : +v < 0 ? '−' : '') + usd(Math.abs(+v));
const quand = ms => ms ? new Date(+ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const jour = ms => ms ? new Date(+ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const RANGS = ['Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Ascendant', 'Immortel', 'Radiant'], DIV = ['I', 'II', 'III'];
const rang = (t, d) => RANGS[t | 0] + ((t | 0) < 8 ? ' ' + DIV[d | 0] : '');
const court = id => String(id || '').slice(0, 8);
/* un nombre saisi à la française (« 12,5 », « 1 000 », « −3 ») */
const lire = s => { const t = String(s == null ? '' : s).replace(/[\s  ]/g, '').replace(/[−–]/g, '-').replace(/^\+/, '').replace(',', '.'); return t === '' || !/^-?\d*\.?\d+$/.test(t) ? NaN : +t; };
const champs = f => Object.fromEntries(new FormData(f).entries());
/* icônes : quelques tracés du jeu Lucide du site (js/core.js), à la couleur du texte */
const ICP = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  bolt: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  out: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  down: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'
};
const ic = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICP[k] || ''}</svg>`;

/* ===================== Erreurs, en français simple ===================== */
const ERR = {
  interdit: 'Action refusée : ton rôle dans l’équipe ne le permet pas, ou elle vise un membre de l’équipe ou ton propre compte.',
  action_inconnue: 'Le serveur ne connaît pas cette action. Recharge la page.',
  mfa_requise: 'Valide d’abord ton code de double authentification.',
  motif_requis: 'Indique un motif (3 caractères au moins) : il est écrit au journal.',
  trop_vite: 'Trop d’actions en une minute. Attends un peu, puis réessaie.',
  requete: 'Demande incomplète. Recharge la page et réessaie.',
  reglage_inconnu: 'Ce réglage n’existe plus. Recharge la page.',
  reglage_invalide: 'Valeur refusée : elle doit rester entre les bornes indiquées.',
  reglage_inchange: 'C’est déjà la valeur en vigueur : rien n’a changé.',
  reglage_incoherent: 'Valeur refusée : un minimum ne peut pas dépasser son maximum.',
  reglage_dedie: 'Ce réglage se change depuis son propre écran.',
  reglage_inactif: 'Ce réglage n’est pas encore appliqué par le serveur : il ne peut pas encore être changé.',
  role_invalide: 'Choisis un rôle : administrateur ou modérateur.',
  role_inchange: 'Ce membre a déjà ce rôle.',
  compte_refuse: 'Compte refusé : il faut un compte joueur personnel, avec un e-mail confirmé (ni bot, ni compte de test).',
  deja_membre: 'Ce compte fait déjà partie de l’équipe.',
  membre_inconnu: 'Ce compte ne fait pas partie de l’équipe.',
  dernier_administrateur: 'Impossible : il doit toujours rester au moins un administrateur.',
  entree_inconnue: 'Cette entrée du journal est introuvable.',
  non_annulable: 'Cette décision ne s’annule pas.',
  deja_annule: 'Cette décision a déjà été annulée.',
  deja_modifie: 'Impossible d’annuler : la valeur a changé depuis. Fais le changement à la main.',
  joueur_inconnu: 'Joueur introuvable.',
  montant_invalide: 'Montant invalide : saisis un nombre différent de zéro.',
  plafond_moderateur: 'Montant au-dessus du plafond d’un modérateur. Demande à un administrateur.',
  solde_negatif: 'Le solde ne peut pas devenir négatif.',
  kyc_inchange: 'Le KYC de ce joueur est déjà dans cet état.',
  acces_invalide: 'Choisis l’accès à bloquer.',
  salon_invalide: 'Salon inconnu. Exemples : general, vip, blitz, m:btc150k, clan:abc123.',
  duree_invalide: 'Choisis une durée.',
  blocage_echu: 'Ce blocage est déjà terminé.',
  blocage_inconnu: 'Blocage introuvable.',
  deja_leve: 'Ce blocage est déjà levé.',
  message_inconnu: 'Message introuvable.',
  deja_masque: 'Ce message est déjà masqué.',
  lent_invalide: 'Le mode lent va de 0 à 300 secondes.',
  mots_invalides: 'Liste refusée : chaque mot fait de 2 à 40 caractères, 500 mots au plus.',
  clan_inconnu: 'Clan introuvable.',
  clan_indisponible: 'Ce clan est dissous.',
  clan_nom_invalide: 'Le nom d’un clan fait de 3 à 28 caractères, sans chevrons ni guillemets droits.',
  deja_dissous: 'Ce clan est déjà dissous.',
  guerre_en_cours: 'Impossible pendant une guerre de clans : la mise est engagée. Réessaie après la guerre.',
  annonce_invalide: 'Annonce refusée : un texte en français de 3 caractères au moins, 280 au plus par langue.',
  annonce_absente: 'Il n’y a pas d’annonce en ligne.',
  date_invalide: 'Date invalide ou déjà passée.',
  rang_invalide: 'Rang invalide.',
  identifiant_invalide: 'Identifiant invalide : lettres minuscules, chiffres et tirets, 3 à 40 caractères.',
  question_invalide: 'La question doit faire entre 8 et 200 caractères.',
  categorie_invalide: 'Catégorie inconnue.',
  deja_resolu: 'Ce marché est déjà résolu.',
  marche_inconnu: 'Marché introuvable.',
  issue_invalide: 'Issue invalide.',
  etat_invalide: 'État invalide.',
  session: 'Session expirée : reconnecte-toi.',
  reseau: 'Connexion au serveur impossible. Vérifie ta connexion, puis réessaie.',
  delai: 'Le serveur met trop de temps à répondre. Réessaie.',
  serveur: 'Le serveur a refusé la demande. Réessaie dans un instant.',
  identifiants: 'Identifiant ou mot de passe incorrect.',
  trop_de_tentatives: 'Trop de tentatives. Réessaie dans quelques minutes.',
  code_invalide: 'Code incorrect ou expiré : saisis le code à six chiffres affiché en ce moment.',
  mfa_nom_pris: 'Un code est déjà enregistré sous ce nom. Réessaie.',
  suspendu: 'Ce compte est suspendu.',
  exclu: 'Ce compte est en auto-exclusion.'
};
const erreur = e => ERR[e && e.code] || 'Erreur inattendue (' + ((e && e.code) || 'inconnue') + '). Réessaie, ou note ce code pour l’équipe technique.';

/* ===================== État ===================== */
const E = {
  moi: null, route: 'accueil', arg: '',
  tableau: null, tete: [], aResoudre: null, site: null,
  reglages: null, bots: null, brouillons: {}, edition: null, exemple: { cat: 'Crypto', mise: 100, prix: 60, diamant: false },
  q: '', joueurs: [], fiche: null, activite: null, actTypes: [], actAvant: '', noms: {},
  chat: { msgs: [], salon: '', joueur: '', suite: null }, clans: null, clanQ: '', mots: null,
  equipe: null,
  journal: { entrees: [], suite: null, f: { admin: '', joueur: '', action: '', du: '', au: '' }, verif: null },
  marches: [], marcheEd: null, mfa: null
};
const peut = a => !!(E.moi && (E.moi.permissions || []).includes(a));
const admin = () => !!(E.moi && E.moi.role === 'administrateur');
const ancien = () => !!(E.moi && E.moi.ancien_panneau);

/* ===================== Appels au serveur ===================== */
/* la porte du nouveau panneau ; si le serveur demande le code de double authentification, on le demande puis on réessaie */
async function eq(action, p) {
  try { return await API.call('api_equipe', { p_action: action, p: p || {} }); }
  catch (e) {
    if (e && e.code === 'mfa_requise' && action !== 'moi' && await mfaDemander()) return API.call('api_equipe', { p_action: action, p: p || {} });
    throw e;
  }
}
/* l'ancienne porte : XP, marchés, levée d'une ancienne suspension (pas encore d'action dans la nouvelle) */
async function adm(action, p) {
  try { return await API.call('api_admin', { p_action: action, p: p || {} }); }
  catch (e) {
    if (e && e.code === 'mfa_requise' && await mfaDemander()) return API.call('api_admin', { p_action: action, p: p || {} });
    throw e;
  }
}

/* ===================== Retour d'une action ===================== */
function dire(texte, ok) {
  const m = $('#adm-msg'); m.innerHTML = `${ic(ok ? 'check' : 'info', 16)}<span>${esc(texte)}</span>`; m.className = ok ? 'ok' : 'ko'; m.hidden = false;
  clearTimeout(dire.t); dire.t = setTimeout(() => { m.hidden = true; }, ok ? 5000 : 8000);
}
let occupe = false;
/* une action : on attend le serveur ; en cas de refus, le message et AUCUN redessin (les champs saisis restent) */
async function agir(fn, cible) {
  if (occupe) return; occupe = true; document.body.classList.add('attente');
  let ok = false;
  try { await fn(cible); ok = true; }
  catch (e) { if (e && e.annule) ok = false; else dire(erreur(e), false); }
  finally { occupe = false; document.body.classList.remove('attente'); }
  if (ok && E.moi) rendre();
}
const annule = () => { const e = new Error('annule'); e.annule = true; return e; };

/* ===================== Confirmation : avant → après, motif, puis « Confirmer » =====================
   lignes : [[libellé, avant, après]] ; motif : 'requis' | 'facultatif' | null ; note : une phrase (journal, annulation)
   Rend le motif saisi (chaîne, éventuellement vide), ou lève « annule » si l'on renonce. */
function confirmer({ titre, intro = '', lignes = [], motif = 'requis', note = '', bouton = 'Confirmer', danger = false, motifInitial = '' }) {
  return new Promise((ok, ko) => {
    fermerFenetre();
    const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'adm-ov';
    ov.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="adm-ov-t" tabindex="-1"><form class="md" data-f="confirmer" novalidate>
      <div class="md-h"><div><h3 id="adm-ov-t">${esc(titre)}</h3>${intro ? `<p>${esc(intro)}</p>` : ''}</div><button type="button" class="x" data-a="fenetre-x" aria-label="Fermer">${ic('x', 16)}</button></div>
      ${lignes.length ? `<div class="diff" role="table" aria-label="Avant et après">${lignes.map(([k, a, b]) => diffLigne(k, a, b)).join('')}</div>` : ''}
      ${motif ? `<div class="field"><label for="adm-ov-m">Motif ${motif === 'requis' ? '(obligatoire, écrit au journal)' : '(facultatif, écrit au journal)'}</label>
        <textarea id="adm-ov-m" name="motif" maxlength="500" ${motif === 'requis' ? 'required minlength="3"' : ''} autofocus>${esc(motifInitial)}</textarea><p class="err" data-err></p></div>` : ''}
      ${note ? `<p class="adm-note">${esc(note)}</p>` : ''}
      <div class="md-acts adm-acts-l"><button class="btn ${danger ? 'b-no' : 'b-pri'} lg" type="submit">${esc(bouton)}</button><button type="button" class="btn b-white lg" data-a="fenetre-x">Annuler</button></div>
    </form></div>`;
    document.body.appendChild(ov);
    const f = ov.querySelector('form'), t = ov.querySelector('textarea');
    ov._fin = v => { ov.remove(); document.removeEventListener('keydown', esc_); if (v === null) ko(annule()); else ok(v); };
    const esc_ = e => { if (e.key === 'Escape') ov._fin(null); };
    document.addEventListener('keydown', esc_);
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov._fin(null); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const m = t ? t.value.trim() : '';
      if (motif === 'requis' && m.length < 3) { f.querySelector('[data-err]').textContent = ERR.motif_requis; t.focus(); return; }
      ov._fin(m);
    });
    setTimeout(() => { (t || f.querySelector('button[type=submit]')).focus(); }, 30);
  });
}
const diffLigne = (k, a, b) => `<div class="diff-l" role="row"><span class="diff-k" role="rowheader">${esc(k)}</span><span class="diff-a" role="cell">${esc(a)}</span><span class="diff-f" aria-hidden="true">→</span><span class="diff-b" role="cell">${esc(b)}</span></div>`;
function fermerFenetre() { const o = $('#adm-ov'); if (o) { if (o._fin) o._fin(null); else o.remove(); } }

/* ===================== Double authentification =====================
   Le serveur exige une session validée par le code (aal2) dès qu'un membre a enrôlé un code, ou pour tous si le réglage
   equipe.mfa_obligatoire est vrai. Sans code enrôlé, on propose l'enrôlement ; sinon on demande le code. */
let mfaEnCours = null;
function mfaDemander() {
  if (mfaEnCours) return mfaEnCours;
  mfaEnCours = (async () => {
    let fac = null; try { fac = await API.mfaFacteurs(); } catch (e) { dire(erreur(e), false); return false; }
    const totp = (fac && fac.totp) || [];
    return totp.length ? mfaFenetreCode(totp[0].id) : mfaFenetreEnrolement();
  })().finally(() => { mfaEnCours = null; });
  return mfaEnCours;
}
/* fenêtre « ton code » ; rend vrai une fois la session validée */
function mfaFenetreCode(id) {
  return new Promise(ok => {
    fermerFenetre();
    const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'adm-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="adm-mfa-t" tabindex="-1"><form class="md" novalidate>
      <div class="md-h"><div><h3 id="adm-mfa-t">Code de double authentification</h3><p>Ouvre ton application d’authentification et saisis le code à six chiffres affiché pour Wimoro.</p></div><button type="button" class="x" data-x aria-label="Fermer">${ic('x', 16)}</button></div>
      <div class="field"><label for="adm-mfa-c">Code à six chiffres</label><input id="adm-mfa-c" class="adm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus><p class="err" data-err></p></div>
      <div class="md-acts adm-acts-l"><button class="btn b-pri lg" type="submit">Valider le code</button><button type="button" class="btn b-white lg" data-x>Annuler</button></div></form></div>`;
    document.body.appendChild(ov);
    const f = ov.querySelector('form'), c = ov.querySelector('input'), err = ov.querySelector('[data-err]');
    ov._fin = v => { ov.remove(); ok(!!v); };
    ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => ov._fin(false)));
    f.addEventListener('submit', async e => {
      e.preventDefault(); const code = c.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Le code fait six chiffres.'; c.focus(); return; }
      err.textContent = 'Vérification…'; f.querySelector('[type=submit]').disabled = true;
      try { await API.mfaVerifier(id, null, code); ov._fin(true); dire('Code validé : la session est protégée par la double authentification.', true); }
      catch (x) { err.textContent = erreur(x); f.querySelector('[type=submit]').disabled = false; c.select(); }
    });
    setTimeout(() => c.focus(), 30);
  });
}
/* enrôlement : un nouveau code (QR code à scanner, ou clé à saisir), puis le premier code pour le confirmer */
async function mfaPreparer() {
  let fac = null; try { fac = await API.mfaFacteurs(); } catch (e) { fac = null; }
  for (const x of (fac && fac.all) || []) if (x.status !== 'verified') await API.mfaRetirer(x.id).catch(() => {});   // un enrôlement abandonné gênerait le suivant
  try { return await API.mfaEnroler('Wimoro, équipe'); }
  catch (e) { if (e.code === 'mfa_nom_pris') return API.mfaEnroler('Wimoro, équipe ' + new Date().toISOString().slice(0, 16).replace('T', ' ')); throw e; }
}
function mfaFenetreEnrolement() {
  return new Promise(async ok => {
    let n; try { n = await mfaPreparer(); } catch (e) { dire(erreur(e), false); ok(false); return; }
    fermerFenetre();
    const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'adm-ov';
    ov.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="adm-mfa-t" tabindex="-1"><form class="md" novalidate>${mfaEnrolementH(n)}
      <div class="md-acts adm-acts-l"><button class="btn b-pri lg" type="submit">Activer la double authentification</button><button type="button" class="btn b-white lg" data-x>Plus tard</button></div></form></div>`;
    document.body.appendChild(ov);
    const f = ov.querySelector('form'), c = ov.querySelector('input'), err = ov.querySelector('[data-err]');
    ov._fin = v => { ov.remove(); ok(!!v); };
    ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => ov._fin(false)));
    f.addEventListener('submit', async e => {
      e.preventDefault(); const code = c.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Le code fait six chiffres.'; c.focus(); return; }
      err.textContent = 'Vérification…'; f.querySelector('[type=submit]').disabled = true;
      try { await API.mfaVerifier(n.id, null, code); ov._fin(true); dire('Double authentification activée. Elle sera demandée à chaque connexion au panneau.', true); }
      catch (x) { err.textContent = erreur(x); f.querySelector('[type=submit]').disabled = false; c.select(); }
    });
    setTimeout(() => c.focus(), 30);
  });
}
const mfaEnrolementH = n => `<div class="md-h"><div><h3 id="adm-mfa-t">Activer la double authentification</h3><p>Une application d’authentification sur ton téléphone affiche un code à six chiffres qui change toutes les 30 secondes. Le panneau le demandera à chaque connexion : un mot de passe volé ne suffit plus.</p></div><button type="button" class="x" data-x aria-label="Fermer">${ic('x', 16)}</button></div>
  <ol class="adm-etapes">
    <li><b>Ajoute Wimoro à ton application</b><span>Scanne ce QR code avec l’application (Google Authenticator, Microsoft Authenticator, 1Password…), ou saisis la clé à la main.</span>
      <span class="adm-qr">${n.qr ? `<img src="${esc(n.qr)}" alt="QR code à scanner avec l’application d’authentification" width="168" height="168">` : ''}<span><small>Clé à saisir à la main</small><code class="adm-cle">${esc(n.secret)}</code></span></span></li>
    <li><b>Saisis le code affiché</b><span>Le premier code confirme que l’application est bien reliée à ton compte.</span>
      <span class="field"><label for="adm-mfa-c">Code à six chiffres</label><input id="adm-mfa-c" class="adm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required><span class="err" data-err></span></span></li>
  </ol>`;

/* ===================== Navigation ===================== */
/* Chaque écran : titre, groupe du menu, icône, condition d'accès (permissions du rôle), chargement, rendu.
   Les écrans s'inscrivent dans ECRANS depuis js/admin-ecrans.js et js/admin-reglages.js. */
const ECRANS = {};
const GROUPES_MENU = [['pilotage', 'Pilotage'], ['joueurs', 'Joueurs et communauté'], ['reglages', 'Réglages'], ['marches', 'Marchés'], ['equipe', 'Équipe']];
const ORDRE = ['accueil', 'journal', 'joueurs', 'chat', 'frais', 'jeux', 'site', 'marches', 'marches-du-jour', 'sources', 'equipe', 'compte'];
const visibles = () => ORDRE.filter(k => ECRANS[k] && ECRANS[k].acces());
/* l'écran d'arrivée : l'accueil pour un administrateur, les joueurs pour un modérateur */
const accueilDe = () => { const v = visibles(); return v.includes('accueil') ? 'accueil' : v.includes('joueurs') ? 'joueurs' : v[0] || 'compte'; };
function lireHash() {
  const h = decodeURIComponent((location.hash || '').slice(1)), i = h.indexOf('/');
  const r = i < 0 ? h : h.slice(0, i), arg = i < 0 ? '' : h.slice(i + 1);
  if (r === 'joueur' && arg) return { route: 'joueur', arg };
  return { route: ECRANS[r] && ECRANS[r].acces() ? r : accueilDe(), arg };
}
function menu() {
  const v = visibles(), cur = E.route === 'joueur' ? 'joueurs' : E.route;
  $('#adm-nav-l').innerHTML = GROUPES_MENU.map(([g, t]) => {
    const L = v.filter(k => ECRANS[k].groupe === g);
    return L.length ? `<div class="adm-nav-g"><p>${t}</p>${L.map(k => `<a href="#${k}" class="adm-nav-a"${k === cur ? ' aria-current="page"' : ''}>${ic(ECRANS[k].icone)}<span>${esc(ECRANS[k].titre)}</span>${ECRANS[k].bientot ? '<small class="puce att">bientôt</small>' : ''}</a>`).join('')}</div>` : '';
  }).join('');
}
async function ouvrir() {
  const { route, arg } = lireHash();
  E.route = route; E.arg = arg; menu(); fermerMenu(); fermerRecherche();
  const ec = route === 'joueur' ? ECRANS.joueurs : ECRANS[route];
  const titre = route === 'joueur' ? 'Fiche d’un joueur' : ec.titre;
  document.title = titre + ' · Wimoro, équipe';
  $('#adm-main').innerHTML = `<p class="vide" aria-busy="true">Chargement…</p>`;
  try { if (route === 'joueur') await chargerFiche(arg); else if (ec.charger) await ec.charger(arg); }
  catch (e) { if (E.route === route && E.arg === arg) $('#adm-main').innerHTML = `<div class="pn pad adm-erreur" role="alert"><h2 class="h2">Écran indisponible</h2><p>${esc(erreur(e))}</p><button class="btn b-white" data-a="recharger">Réessayer</button></div>`; return; }
  if (E.route === route && E.arg === arg) { rendre(); window.scrollTo(0, 0); viser(); }
}
/* le rendu de l'écran courant, à partir de E (aucun appel) */
function rendre() {
  const ec = E.route === 'joueur' ? null : ECRANS[E.route];
  $('#adm-main').innerHTML = E.route === 'joueur' ? vFiche() : ec.rendre(E.arg);
  menu();
  if (typeof apresRendu === 'function') apresRendu();
}
/* un lien vers un réglage précis (#frais/frais.k) : on l'amène à l'écran et on le signale */
function viser() {
  if (!E.arg || E.route === 'joueur') return;
  const el = document.getElementById('r-' + E.arg) || document.getElementById(E.arg);
  if (!el) return;
  el.scrollIntoView({ block: 'center' }); el.classList.add('vise'); setTimeout(() => el.classList.remove('vise'), 2400);
  const b = el.querySelector('[data-a="reg-modifier"],input,select,textarea,button'); if (b) b.focus({ preventScroll: true });
}
const ouvrirMenu = () => { document.body.classList.add('menu-ouvert'); $('#adm-nav').setAttribute('aria-hidden', 'false'); const a = $('#adm-nav a'); if (a) a.focus(); };
const fermerMenu = () => { document.body.classList.remove('menu-ouvert'); };

/* ===================== Recherche : un joueur, un marché, un écran, un réglage ===================== */
let rechT = 0, rechN = 0;
function indexLocal() {
  const L = visibles().map(k => ({ g: 'Écrans', t: ECRANS[k].titre, s: ECRANS[k].phrase || '', h: '#' + k }));
  if (typeof reglagesIndex === 'function') L.push(...reglagesIndex());
  return L;
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
async function chercher(q) {
  const n = ++rechN, t = norm(q.trim()), box = $('#adm-sres');
  if (!t) { fermerRecherche(); return; }
  const rang_ = x => norm(x.t).includes(t) ? 0 : norm(x.s).includes(t) ? 1 : 2;                  // le nom d'abord, puis l'explication, puis la clé
  const locaux = indexLocal().filter(x => norm(x.t + ' ' + x.s + ' ' + (x.cle || '')).includes(t)).sort((a, b) => rang_(a) - rang_(b)).slice(0, 8);
  const marches = (E.marches || []).filter(m => norm(m.id + ' ' + m.q + ' ' + m.short).includes(t)).slice(0, 5).map(m => ({ g: 'Marchés', t: m.short || m.q, s: m.id, h: '#marches/m-' + m.id }));
  const dessiner = joueurs => {
    if (n !== rechN) return;
    const tout = [...(joueurs || []), ...marches, ...locaux];
    let g = '';
    box.innerHTML = tout.length ? tout.map((x, i) => (x.g !== g ? `<p class="adm-sres-g">${esc(g = x.g)}</p>` : '') + `<a href="${esc(x.h)}" role="option" id="adm-sr-${i}"><span>${esc(x.t)}</span>${x.s ? `<small>${esc(x.s)}</small>` : ''}</a>`).join('')
      : `<p class="adm-sres-0">Rien trouvé pour « ${esc(q.trim())} ».</p>`;
    box.hidden = false; $('#adm-q').setAttribute('aria-expanded', 'true');
  };
  dessiner(null);
  if (t.length >= 2 && peut('joueurs_chercher')) {
    clearTimeout(rechT);
    rechT = setTimeout(async () => {
      try { const r = await eq('joueurs_chercher', { q: q.trim() }); (r.joueurs || []).forEach(j => { E.noms[j.id] = j.n; }); dessiner((r.joueurs || []).slice(0, 6).map(j => ({ g: 'Joueurs', t: j.n, s: j.email || 'sans e-mail', h: '#joueur/' + j.id }))); }
      catch (e) { /* la recherche des joueurs reste muette : les autres résultats suffisent */ }
    }, 250);
  }
}
function fermerRecherche() { const b = $('#adm-sres'); if (b) { b.hidden = true; b.innerHTML = ''; } const q = $('#adm-q'); if (q) q.setAttribute('aria-expanded', 'false'); }

/* ===================== Délégation des événements ===================== */
const CLICS = {}, FORMS = {}, SAISIES = {};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (a && a.dataset.a === 'fenetre-x') { fermerFenetre(); return; }
  if (!a) { if (!e.target.closest('#adm-search')) fermerRecherche(); if (document.body.classList.contains('menu-ouvert') && !e.target.closest('#adm-nav')) fermerMenu(); return; }
  const f = CLICS[a.dataset.a]; if (!f) return;
  e.preventDefault();
  agir(f, a);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-f]'); if (!f || f.dataset.f === 'confirmer') return;
  e.preventDefault();
  if (f.dataset.f === 'connexion') { connecter(f); return; }
  if (FORMS[f.dataset.f]) agir(FORMS[f.dataset.f], f);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'adm-q') { chercher(t.value); return; }
  const k = t.closest('[data-saisie]'); if (k && SAISIES[k.dataset.saisie]) SAISIES[k.dataset.saisie](t, k);
});
document.addEventListener('change', e => { const k = e.target.closest('[data-change]'); if (k && SAISIES[k.dataset.change]) SAISIES[k.dataset.change](e.target, k); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#adm-ov')) return; fermerRecherche(); fermerMenu(); }
  if (e.key === 'Enter' && e.target.id === 'adm-q') { const a = $('#adm-sres a'); if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); $('#adm-q').value = ''; } }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && $('#adm-q') && !$('#adm-search').hidden) { e.preventDefault(); $('#adm-q').focus(); }
});
addEventListener('hashchange', () => { if (E.moi && !E.moi.mfa_requise) ouvrir(); });
CLICS.menu = async () => { if (document.body.classList.contains('menu-ouvert')) fermerMenu(); else ouvrirMenu(); throw annule(); };
CLICS.recharger = async () => { ouvrir(); throw annule(); };
CLICS.saut = async () => { $('#adm-main').focus(); throw annule(); };                         // « Aller au contenu » sans changer l'adresse (elle porte l'écran)
CLICS.deconnexion = async () => { await API.signOut().catch(() => {}); location.hash = ''; location.reload(); throw annule(); };
CLICS.copier = async b => { try { await navigator.clipboard.writeText(b.dataset.v); dire('Copié : ' + b.dataset.v, true); } catch (e) { dire('Copie impossible : sélectionne le texte à la main.', false); } throw annule(); };

/* ===================== Démarrage : session, rôle, double authentification ===================== */
function vConnexion(note) {
  $('#adm-main').innerHTML = `<section class="pn pad adm-porte"><h1 class="h2">Connexion de l’équipe</h1><p class="sub">${esc(note || 'Connecte-toi avec ton compte personnel. Seuls les membres de l’équipe voient le panneau.')}</p>
  <form data-f="connexion" class="col adm-form"><div class="field"><label for="ac-i">Pseudo ou e-mail</label><input id="ac-i" name="i" autocomplete="username" required></div>
  <div class="field"><label for="ac-p">Mot de passe</label><input id="ac-p" name="p" type="password" autocomplete="current-password" required></div>
  <p class="err" data-err></p><button class="btn b-pri lg">Se connecter</button></form></section>`;
}
async function connecter(f) {
  const c = champs(f), err = f.querySelector('[data-err]'); err.textContent = 'Connexion…';
  try { await API.signIn(c.i.trim(), c.p); location.reload(); }
  catch (e) { err.textContent = erreur(e); }
}
/* le code demandé avant d'ouvrir le panneau (membre qui a enrôlé un code, ou double authentification obligatoire) */
function vPorteMfa() {
  const sans = !(E.moi.facteurs > 0);
  $('#adm-main').innerHTML = `<section class="pn pad adm-porte"><span class="adm-porte-ic">${ic('shield', 22)}</span><h1 class="h2">Double authentification</h1>
  <p class="sub">${sans ? 'La double authentification est obligatoire pour l’équipe. Active-la pour ouvrir le panneau : il te faut une application d’authentification sur ton téléphone.' : 'Ton compte est protégé par un code à six chiffres. Saisis le code de ton application pour ouvrir le panneau.'}</p>
  <div class="hbtns"><button class="btn b-pri lg" data-a="porte-mfa">${sans ? 'Activer la double authentification' : 'Saisir mon code'}</button><button class="btn b-white lg" data-a="deconnexion">Changer de compte</button></div></section>`;
}
CLICS['porte-mfa'] = async () => { if (await mfaDemander()) { await lireMoi(); demarrerPanneau(); } throw annule(); };
async function lireMoi() { E.moi = await API.call('api_equipe', { p_action: 'moi', p: {} }); return E.moi; }
function demarrerPanneau() {
  if (E.moi.mfa_requise) { vPorteMfa(); return; }
  const r = E.moi.role === 'administrateur' ? 'Administrateur' : 'Modérateur';
  $('#adm-qui').innerHTML = `<a href="#compte" class="adm-qui"><span>${esc(API.email || '')}</span><small>${r}${E.moi.facteurs > 0 ? '' : ', sans double authentification'}</small></a>`;
  $('#adm-nav').hidden = false; $('#adm-search').hidden = false; $('#adm-menu').hidden = false;
  document.body.classList.add('adm-ok');
  if (admin() && typeof prechargerReglages === 'function') prechargerReglages();   // pour la recherche des réglages
  if (ancien()) adm('marches').then(r => { E.marches = r.marches || []; }).catch(() => {});
  ouvrir();
}
async function demarrer() {
  const mode = await API.pret;
  if (mode !== 'serveur') { vConnexion(); return; }
  try { await lireMoi(); }
  catch (e) {
    if (e.code === 'session') { await API.signOut().catch(() => {}); vConnexion('Session expirée : reconnecte-toi.'); }
    else $('#adm-main').innerHTML = `<section class="pn pad adm-porte" role="alert"><h1 class="h2">Panneau indisponible</h1><p class="sub">${esc(erreur(e))}</p><button class="btn b-white" data-a="recharger-page">Réessayer</button></section>`;
    return;
  }
  if (!E.moi.role) {
    $('#adm-qui').textContent = API.email || '';
    $('#adm-main').innerHTML = `<section class="pn pad adm-porte" id="adm-refus"><h1 class="h2">Accès réservé</h1><p class="sub">Ce compte ne fait pas partie de l’équipe : le panneau ne lui montre rien et le serveur lui refuse chaque action. Un administrateur peut l’ajouter depuis l’écran Administrateurs.</p>
    <div class="hbtns"><button class="btn b-white lg" data-a="deconnexion">Changer de compte</button><a class="btn b-ghost lg" href="index.html">Retour au site</a></div></section>`;
    return;
  }
  demarrerPanneau();
}
CLICS['recharger-page'] = async () => { location.reload(); throw annule(); };
addEventListener('DOMContentLoaded', demarrer);
