/* WIMORO — panneau d'administration : les écrans (accueil, joueurs, chat et communauté, site, marchés, équipe, journal,
 * mon compte). Chaque écran charge ce qu'il montre, puis se dessine à partir de l'état E (js/admin.js). Les actions
 * sensibles passent par confirmer() : avant → après, motif, puis « Confirmer » ; le serveur refait tous les contrôles. */
'use strict';

/* ===================== Libellés ===================== */
const ACTIONS = {
  reglage_modifier: 'Réglage modifié', equipe_ajouter: 'Membre ajouté', equipe_retirer: 'Membre retiré', equipe_role: 'Rôle changé',
  joueur_solde: 'Solde ajusté', joueur_rang: 'Rang donné', joueur_kyc: 'KYC', joueur_bloquer: 'Blocage posé', joueur_debloquer: 'Blocage levé',
  joueur_deconnecter: 'Déconnexion forcée', chat_supprimer: 'Message masqué', chat_restaurer: 'Message rendu', salon_regler: 'Règles d’un salon',
  mots_interdits: 'Mots interdits', clan_renommer: 'Clan renommé', clan_dissoudre: 'Clan dissous', annonce_publier: 'Annonce publiée',
  annonce_retirer: 'Annonce retirée', maintenance: 'Maintenance', activite_simulee: 'Activité simulée',
  solde: 'Solde ajusté (ancien panneau)', xp: 'XP ajusté', rang: 'Rang donné (ancien panneau)', kyc: 'KYC (ancien panneau)', suspension: 'Suspension (ancien panneau)',
  suspension_levee: 'Suspension levée (ancien panneau)', marche_cree: 'Marché créé', marche_modifie: 'Marché modifié', marche_ferme: 'Mises fermées',
  marche_rouvert: 'Mises rouvertes', marche_resolu: 'Marché résolu', message_masque: 'Message masqué (ancien panneau)', bots: 'Réglage des bots (ancien panneau)'
};
const ACCES = { site: 'Tout le site', chat: 'Chat', paris: 'Paris', depots: 'Dépôts', retraits: 'Retraits', creation: 'Création de marchés', clans: 'Clans' };
const ACCES_PHRASE = { site: 'ne peut plus utiliser le site (déconnecté à la prochaine action)', chat: 'ne peut plus écrire dans le chat', paris: 'ne peut plus parier', depots: 'ne peut plus déposer',
  retraits: 'ne peut plus retirer', creation: 'ne peut plus proposer de marché', clans: 'ne peut plus rejoindre, créer ni gérer un clan (il peut toujours en sortir)' };
const DUREES = [['1h', '1 heure', 3600e3], ['24h', '24 heures', 864e5], ['7j', '7 jours', 7 * 864e5], ['30j', '30 jours', 30 * 864e5], ['permanent', 'Sans fin', 0]];
const SALONS = [['', 'Tous les salons'], ['general', 'Général'], ['vip', 'VIP'], ['blitz', 'Blitz'], ['dm', 'Messages privés']];
const salonNom = s => !s ? 'tous les salons' : s === 'general' ? 'Général' : s === 'vip' ? 'VIP' : s === 'blitz' ? 'Blitz' : s === 'dm' ? 'messages privés' : s.startsWith('m:') ? 'marché ' + s.slice(2) : s.startsWith('clan:') ? 'clan ' + s.slice(5) : s;
const OPS = { bet: 'Pari', sell: 'Vente', res: 'Gain d’un marché résolu', flash: 'Mise éclair', flash_gain: 'Gain éclair', serie: 'La Série', serie_gain: 'Gain de La Série', serie_rendue: 'Série remboursée',
  blitz: 'Entrée au Blitz', blitz_rachat: 'Rachat au Blitz', blitz_gain: 'Gain du Blitz', duel: 'Duel', duel_gain: 'Gain de duel', duel_rendu: 'Duel remboursé', stack: 'Duel de stack', stack_gain: 'Gain de stack',
  stack_rendu: 'Stack remboursé', combo: 'Combiné', combo_gain: 'Gain de combiné', combo_encaisse: 'Combiné encaissé', copie: 'Pari copié', copie_vente: 'Vente copiée', copie_revenu: 'Revenu de copie',
  clan: 'Création de clan', guerre: 'Entrée en guerre de clans', guerre_gain: 'Gain de guerre', guerre_rendu: 'Guerre remboursée', parrainage: 'Bonus de parrainage', demo_deposit: 'Dépôt', demo_withdraw: 'Retrait',
  admin: 'Ajustement (ancien panneau)', ajustement_admin: 'Ajustement admin' };
const TYPES_ACT = [['connexion', 'Connexions'], ['argent', 'Argent'], ['depot', 'Dépôts'], ['retrait', 'Retraits'], ['message', 'Messages'], ['rang', 'Rangs'], ['kyc', 'KYC'], ['equipe', 'Décisions de l’équipe']];
const finBloc = f => +f === -1 || f == null ? 'sans fin' : 'jusqu’au ' + quand(f);
const ROLE = r => r === 'administrateur' ? 'administrateur' : r === 'moderateur' ? 'modérateur' : r || '';
const puceRole = r => r ? `<span class="puce ok">${ROLE(r)}</span>` : '';
/* un joueur dont on ne connaît que l'identifiant : son pseudo est cherché après le rendu (nommer) */
const lienJoueur = (id, n) => id ? `<a class="link" href="#joueur/${esc(id)}"${n || E.noms[id] ? '' : ` data-nom="${esc(id)}"`}>${esc(n || E.noms[id] || 'joueur ' + court(id))}</a>` : '—';
let nommerEnCours = false;
async function nommer() {
  if (nommerEnCours || !peut('joueurs_chercher')) return;
  const ids = Array.from(new Set($$('a[data-nom]').map(a => a.dataset.nom))).filter(id => !(id in E.noms)).slice(0, 8);
  if (!ids.length) return;
  nommerEnCours = true;
  try { for (const id of ids) { try { const r = await eq('joueurs_chercher', { q: id }); const j = (r.joueurs || []).find(x => x.id === id); E.noms[id] = j ? j.n : null; } catch (e) { E.noms[id] = null; } } }
  finally { nommerEnCours = false; }
  $$('a[data-nom]').forEach(a => { const n = E.noms[a.dataset.nom]; if (n) { a.textContent = n; a.removeAttribute('data-nom'); } });
}
/* après chaque rendu (js/admin.js) */
function apresRendu() { nommer(); }
/* ce que montre un message qui n'est pas du texte (mise, analyse, événement de clan) */
const texteMsg = m => m.k === 'evt' && m.bet ? (m.bet.code === 'guerre' ? `Guerre de clans déclarée contre le clan ${m.bet.foe} (buy-in ${Number(m.bet.k) || 0} $)` : `Appel de clan : marché ${m.bet.m}, côté ${m.bet.s === 'oui' ? 'Oui' : 'Non'}`)
  : m.k === 'ana' && m.bet ? `Analyse partagée (marché ${m.bet.m}, ${Number(m.bet.ni) || 0} indicateur(s), ${Number(m.bet.nd) || 0} tracé(s))${m.text ? ' : ' + m.text : ''}` : m.k === 'bet' && m.bet ? `Mise partagée : ${Number(m.bet.amt) || 0} $ sur ${m.bet.s === 'oui' ? 'Oui' : 'Non'} (marché ${m.bet.m})` : m.text;
const vide = t => `<p class="vide">${esc(t)}</p>`;
const tete = (t, p, actions = '') => `<header class="adm-tete"><div><h1 class="ptitle">${esc(t)}</h1>${p ? `<p class="plead">${esc(p)}</p>` : ''}</div>${actions}</header>`;

/* ===================== Accueil ===================== */
const clotureMs = m => { const t = Date.parse((m.date || '') + 'T' + (m.time || '23:59') + ':00'); return isNaN(t) ? Infinity : t; };
const aResoudre = () => (E.marches || []).filter(m => m.st !== 'resolved' && clotureMs(m) < Date.now());
ECRANS.accueil = {
  titre: 'Accueil', groupe: 'pilotage', icone: 'home', phrase: 'les chiffres du jour et les dernières décisions', acces: () => peut('tableau'),
  charger: async () => {
    const [t, j, m] = await Promise.all([eq('tableau'), eq('journal_lire', { n: 6 }).catch(() => ({ entrees: [] })), ancien() ? adm('marches').catch(() => null) : null]);
    E.tableau = t; E.tete = j.entrees || []; if (m) E.marches = m.marches || [];
  },
  rendre: () => {
    const c = E.tableau || {}, ar = ancien() ? aResoudre().length : null, b = c.bots_cfg || {};
    const fig = (h, l, v, s, cls = '') => `<a class="chiffre${cls}" href="${h}"><span>${esc(l)}</span><b class="num">${esc(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</a>`;
    return tete('Accueil', 'Ce qui se passe sur Wimoro en ce moment. Chaque chiffre mène à son écran.') + `
    <section class="adm-chiffres" aria-label="Chiffres du jour">
      ${fig('#joueurs', 'Joueurs actifs sur 24 h', nb(c.actifs_24h), c.present ? 'Au moins un joueur en ligne maintenant' : 'Personne en ligne maintenant')}
      ${fig('#marches', 'Mises des joueurs sur 24 h', usd(c.mises_24h), nb(c.positions) + ' positions ouvertes')}
      ${ar === null ? fig('#marches', 'Marchés à résoudre', 'bientôt', 'Avec la partie D', ' bientot') : fig('#marches', 'Marchés à résoudre', nb(ar), ar ? 'Clôture passée, pas encore résolus' : 'Aucun marché en retard')}
      ${fig('#journal/action=joueur_bloquer', 'Blocages en cours', nb(c.blocages_actifs), 'Accès de joueurs bloqués par l’équipe')}
      ${fig('#marches-du-jour', 'Propositions à valider', 'bientôt', 'Avec les marchés du jour', ' bientot')}
      ${fig('#sources', 'Sources en erreur', 'bientôt', 'Avec les sources de données', ' bientot')}
    </section>
    <div class="adm-2col">
      <section class="pn pad"><div class="adm-ph"><h2 class="h2">Dernières décisions</h2><a class="link" href="#journal">Tout le journal</a></div>
        ${E.tete.length ? `<div class="jl">${E.tete.map(entreeH).join('')}</div>` : vide('Aucune décision pour l’instant.')}</section>
      <section class="pn pad"><h2 class="h2">État du site</h2><div class="etat">
        ${etatL('#site', 'Maintenance', c.maintenance ? 'en cours : les joueurs voient l’écran de maintenance' : 'non', c.maintenance ? 'ko' : '')}
        ${etatL('#site', 'Annonce', c.annonce && c.annonce.t ? '« ' + c.annonce.t.fr + ' »' : 'aucune')}
        ${etatL('#site', 'Activité simulée', b.actif === false ? 'coupée' : 'en marche, intensité ' + nfx(b.intensite == null ? 1 : b.intensite, 2) + ', bavardage ' + nfx(b.chat == null ? 1 : b.chat, 2))}
        ${etatL('#equipe', 'Équipe', nb(c.equipe) + ' membre(s)')}
        ${etatL('#journal', 'Journal', nb(c.journal && c.journal.n) + ' entrées, empreinte de tête ' + ((c.journal && c.journal.tete) || '—').slice(0, 12))}
        ${etatL('#joueurs', 'Inscrits', nb(c.inscrits) + ', dont ' + nb(c.inscrits_7j) + ' cette semaine ; ' + nb(c.actifs_7j) + ' actifs sur 7 jours')}
        ${etatL('#joueurs', 'Soldes des joueurs', usd0(c.soldes))}
        ${etatL('#marches', 'Marchés ouverts', nb(c.marches_ouverts) + ', volume total ' + usd0(c.volume_total))}
        ${etatL('#chat', 'Messages de joueurs sur 24 h', nb(c.messages_24h))}
        ${etatL('', 'Base de données', nb(c.base_mo) + ' Mo sur 500, ' + nb(c.bots) + ' bots')}
      </div></section>
    </div>`;
  }
};
const etatL = (h, k, v, cls = '') => h ? `<a class="etat-l" href="${h}"><span>${esc(k)}</span><b class="${cls}">${esc(v)}</b></a>` : `<div class="etat-l"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;

/* ===================== Joueurs ===================== */
ECRANS.joueurs = {
  titre: 'Joueurs', groupe: 'joueurs', icone: 'users', phrase: 'chercher un joueur par pseudo, e-mail ou identifiant', acces: () => peut('joueurs_chercher'),
  charger: async () => { const r = await eq('joueurs_chercher', { q: E.q }); E.joueurs = r.joueurs || []; E.joueurs.forEach(j => { E.noms[j.id] = j.n; }); },
  rendre: () => tete('Joueurs', 'Cherche un joueur, ouvre sa fiche : solde, rang, KYC, blocages, déconnexion, et tout ce qu’il a fait.') + `
    <form data-f="chercher" class="pn pad adm-cherche" role="search"><div class="field"><label for="aj-q">Pseudo, e-mail ou identifiant</label><input id="aj-q" name="q" value="${esc(E.q)}" autocomplete="off" enterkeyhint="search"></div><button class="btn b-pri">Chercher</button></form>
    <section class="pn adm-liste" id="adm-joueurs" aria-label="Résultats">${E.joueurs.length ? E.joueurs.map(ligneJoueur).join('') : vide(E.q ? 'Aucun joueur ne correspond à « ' + E.q + ' ».' : 'Aucun joueur.')}</section>
    <p class="adm-note">Sans recherche : les 30 derniers inscrits (les bots n’apparaissent que si on les cherche).</p>`
};
const pucesJoueur = j => [j.bot ? '<span class="puce">bot</span>' : '', j.test ? '<span class="puce">compte de test</span>' : '', puceRole(j.role), (j.blocages || []).length ? `<span class="puce ko">${(j.blocages || []).length} blocage(s)</span>` : '',
  j.kyc ? '<span class="puce ok">KYC validé</span>' : '', j.susp ? '<span class="puce ko">suspendu</span>' : '', j.excl ? '<span class="puce att">auto-exclu</span>' : ''].join(' ');
const ligneJoueur = j => `<div class="rang-l"><span class="rl-t"><span class="je-l1"><b>${esc(j.n)}</b>${pucesJoueur(j)}</span><small>${esc(j.email || 'sans e-mail')}</small><small>${esc(rang(j.t, j.d))}, solde ${esc(usd(j.balance))}, inscrit le ${esc(jour(j.since))}</small></span>
  <a class="btn b-white sm" href="#joueur/${esc(j.id)}" data-joueur="${esc(j.id)}">Ouvrir la fiche</a></div>`;
FORMS.chercher = async f => { E.q = champs(f).q.trim(); await ECRANS.joueurs.charger(); };

/* ----- Fiche d'un joueur ----- */
/* une réponse arrivée après l'ouverture d'une autre fiche est ignorée : les actions visent toujours le joueur affiché */
const ficheOuverte = id => E.route === 'joueur' && E.arg === id;
async function chargerFiche(id) {
  const f = await eq('joueur_fiche', { id });
  if (!ficheOuverte(id)) return;
  E.fiche = f; E.noms[id] = f.j.n; E.actTypes = []; E.actAvant = ''; E.activite = null;
  await chargerActivite(false);
}
async function chargerActivite(suite) {
  const id = E.fiche.j.id, p = { id, n: 30 };
  if (E.actTypes.length) p.types = E.actTypes;
  if (suite && E.activite && E.activite.suite) p.avant = E.activite.suite; else if (E.actAvant) p.avant = E.actAvant;
  let a;
  try { const r = await eq('joueur_activite', p); a = suite && E.activite ? { evenements: E.activite.evenements.concat(r.evenements || []), suite: r.suite } : { evenements: r.evenements || [], suite: r.suite }; }
  catch (e) { a = { evenements: [], suite: null, erreur: erreur(e) }; }
  if (E.fiche && E.fiche.j.id === id) E.activite = a;
}
const opt = (v, t, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`;
function vFiche() {
  const F = E.fiche; if (!F) return vide('Joueur introuvable.');
  const j = F.j, id = esc(j.id), actifs = (F.blocages || []).filter(b => b.actif), equipeCible = !!j.role, moiMod = E.moi.role !== 'administrateur';
  const verrou = equipeCible && moiMod ? `<p class="limit">Ce compte fait partie de l’équipe : seul un administrateur peut agir sur lui.</p>` : '';
  return `<nav class="crumbs adm-fil"><a href="#joueurs">Joueurs</a><span>/</span><span>${esc(j.n)}</span></nav>
  <header class="adm-tete adm-fiche-t" id="adm-fiche"><div><h1 class="ptitle">${esc(j.n)}</h1><p class="adm-puces">${pucesJoueur(j)}</p>
   <p class="plead">${esc(j.email || 'sans e-mail')}</p><p class="adm-id"><small>Identifiant</small><code>${id}</code><button class="btn b-ghost sm" data-a="copier" data-v="${id}">${ic('copy', 14)} Copier</button></p></div></header>
  <section class="adm-chiffres fiche" aria-label="Le joueur en chiffres">
   <div class="chiffre"><span>Solde</span><b class="num" data-v="solde">${esc(usd(j.balance))}</b></div>
   <div class="chiffre"><span>Rang</span><b data-v="rang">${esc(rang(j.t, j.d))}</b><small data-v="xp">${esc(nb(j.xp))} XP</small></div>
   <div class="chiffre"><span>Paris réglés</span><b class="num">${esc(nb(j.settled))}</b><small>${esc(nb(j.wins))} gagnés, ${esc(nb(j.deposits))} dépôt(s)</small></div>
   <div class="chiffre"><span>KYC</span><b data-v="kyc">${j.kyc ? 'validé' : 'non fait'}</b><small>${j.kyc && j.kyc_at ? 'le ' + esc(jour(j.kyc_at)) : ''}</small></div>
   <div class="chiffre"><span>Inscription</span><b>${esc(jour(j.since))}</b><small>Dernière connexion : ${esc(quand(j.vu))}</small></div>
  </section>
  ${verrou}
  ${j.susp ? `<p class="limit over" data-v="susp">Suspendu par l’ancien panneau ${j.susp === -1 ? 'sans limite' : 'jusqu’au ' + esc(quand(j.susp))}${ancien() ? ` <button class="btn b-white sm" data-a="lever-ancienne" data-id="${id}">Lever cette suspension</button>` : ''}</p>` : ''}
  ${j.excl ? `<p class="limit">Auto-exclusion demandée par le joueur ${j.excl === -1 ? 'sans fin' : 'jusqu’au ' + esc(quand(j.excl))} : le serveur refuse ses actions, l’équipe ne peut pas la lever.</p>` : ''}
  <div class="adm-cartes">
   <section class="pn pad"><h2 class="h2">Ajuster le solde</h2><p class="sub">Ajoute ou retire de l’argent : une opération « ajustement admin » s’ajoute au relevé du joueur, qui est prévenu. Le solde ne devient jamais négatif.</p>
    <form data-f="solde" data-id="${id}" class="adm-form-l"><div class="field"><label for="as-d">Montant en dollars (+ pour créditer, − pour débiter)</label><input id="as-d" name="delta" inputmode="decimal" placeholder="+50 ou −20" required autocomplete="off"></div><button class="btn b-white">Ajuster le solde</button></form></section>
   <section class="pn pad"><h2 class="h2">Donner un rang</h2><p class="sub">Les compteurs du joueur (XP, paris réglés et gagnés) montent au niveau du rang choisi ; ils ne baissent jamais.</p>
    <form data-f="rang" data-id="${id}" class="adm-form-l"><div class="field"><label for="ar-t">Rang</label><select id="ar-t" name="rang">${RANGS.map((r, t) => (t < 8 ? DIV.map((x, d) => [t, d]) : [[8, 0]]).map(([a, b]) => opt(a + '-' + b, rang(a, b), j.t + '-' + j.d)).join('')).join('')}</select></div><button class="btn b-white">Donner ce rang</button></form></section>
   <section class="pn pad"><h2 class="h2">KYC</h2><p class="sub">${j.kyc ? 'La vérification d’identité est validée : le joueur peut payer par carte, virement et PayPal.' : 'La vérification d’identité n’est pas faite : carte, virement et PayPal restent fermés au joueur.'}</p>
    <div class="hbtns">${j.kyc ? `<button class="btn b-white" data-a="kyc" data-id="${id}" data-ok="0">Refuser le KYC</button>` : `<button class="btn b-white" data-a="kyc" data-id="${id}" data-ok="1">Valider le KYC</button>`}</div></section>
   <section class="pn pad"><h2 class="h2">Déconnecter de partout</h2><p class="sub">Ferme toutes les sessions du joueur, sur tous ses appareils ; rien n’est effacé. Il pourra se reconnecter.</p>
    <div class="hbtns"><button class="btn b-white" data-a="deconnecter" data-id="${id}">Déconnecter ${esc(j.n)}</button></div></section>
   ${ancien() ? `<section class="pn pad"><h2 class="h2">Ajuster l’XP</h2><p class="sub">Fonction de l’ancien panneau : ajoute ou retire de l’XP.</p>
    <form data-f="xp" data-id="${id}" class="adm-form-l"><div class="field"><label for="ax-d">XP (+ ou −)</label><input id="ax-d" name="delta" inputmode="numeric" required autocomplete="off"></div><button class="btn b-white">Ajuster l’XP</button></form></section>` : ''}
  </div>
  <section class="pn pad" id="adm-blocages"><h2 class="h2">Bloquer un accès</h2><p class="sub">Un blocage vise un seul accès, pour une durée. Le serveur refuse l’accès dès l’action suivante du joueur, et son écran le lui dit à l’endroit bloqué.</p>
   ${actifs.length ? `<div class="blocs">${actifs.map(b => `<div class="bloc-l"><span><b>${esc(ACCES[b.acces] || b.acces)}${b.acces === 'chat' ? ' : ' + esc(salonNom(b.salon)) : ''}</b><small>${esc(finBloc(b.fin))}, posé le ${esc(quand(b.debut))}${b.par ? ' par ' + esc(b.par) : ''}${b.motif ? ' : « ' + esc(b.motif) + ' »' : ''}</small></span><button class="btn b-white sm" data-a="debloquer" data-id="${esc(b.id)}">Lever le blocage</button></div>`).join('')}</div>` : '<p class="vide">Aucun blocage en cours.</p>'}
   <form data-f="bloquer" data-id="${id}" class="adm-bloquer" data-change="bloc-acces">
    <div class="field"><label for="ab-a">Accès</label><select id="ab-a" name="acces">${Object.entries(ACCES).map(([k, v]) => opt(k, v, 'paris')).join('')}</select></div>
    <div class="field" data-salon hidden><label for="ab-s">Salon</label><select id="ab-s" name="salon">${SALONS.map(([k, v]) => opt(k, v, '')).join('')}<option value="autre">Un autre salon…</option></select><input name="salon_autre" placeholder="m:btc150k ou clan:abc123" aria-label="Autre salon" hidden></div>
    <fieldset class="field"><legend>Durée</legend><div class="chips">${DUREES.map(([k, l], i) => `<label class="chip"><input type="radio" name="duree" value="${k}"${i === 1 ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div></fieldset>
    <button class="btn b-no">Bloquer cet accès</button></form></section>
  <section class="pn pad" id="adm-activite"><div class="adm-ph"><h2 class="h2">Activité</h2></div><p class="sub">Tout ce que le joueur a fait, le plus récent d’abord : connexions, argent, dépôts, retraits, messages publics, rangs, KYC, décisions de l’équipe. Jamais ses messages privés.</p>
   <form data-f="act-filtre" class="adm-filtres"><div class="chips" role="group" aria-label="Types">${TYPES_ACT.map(([k, l]) => `<label class="chip"><input type="checkbox" name="t" value="${k}"${E.actTypes.includes(k) ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div>
    <div class="field court"><label for="act-au">Jusqu’au</label><input id="act-au" name="au" type="date" value="${esc(E.actAvant ? new Date(+E.actAvant - 1).toISOString().slice(0, 10) : '')}"></div><button class="btn b-white sm">Filtrer</button></form>
   ${activiteH()}</section>
  <div class="adm-2col">
   <section class="pn pad"><h2 class="h2">Sessions</h2>${(F.sessions || []).length ? `<div class="jl">${F.sessions.map(s => `<div class="je"><span><b>Ouverte le ${esc(quand(s.cree))}</b><small>${esc(s.appareil || 'appareil inconnu')}</small></span><small>active le ${esc(quand(s.maj))}</small></div>`).join('')}</div>` : vide('Aucune session.')}
    ${(F.deconnexions || []).length ? `<h3 class="adm-h3">Déconnexions forcées</h3><div class="jl">${F.deconnexions.map(d => `<div class="je"><span><b>${esc(quand(d.at))}</b><small>${d.par ? 'par ' + esc(d.par) : ''}${d.motif ? ' : « ' + esc(d.motif) + ' »' : ''}</small></span></div>`).join('')}</div>` : ''}</section>
   <section class="pn pad"><h2 class="h2">Historique des blocages</h2>${(F.blocages || []).length ? `<div class="jl">${F.blocages.map(b => `<div class="je"><span><b>${esc(ACCES[b.acces] || b.acces)}${b.acces === 'chat' ? ' : ' + esc(salonNom(b.salon)) : ''}</b><small>Posé le ${esc(quand(b.debut))}${b.par ? ' par ' + esc(b.par) : ''}, ${esc(finBloc(b.fin))}${b.motif ? ' : « ' + esc(b.motif) + ' »' : ''}</small>${b.leve_at ? `<small>Levé le ${esc(quand(b.leve_at))}${b.leve_par ? ' par ' + esc(b.leve_par) : ''}${b.leve_motif ? ' : « ' + esc(b.leve_motif) + ' »' : ''}</small>` : ''}</span>${b.actif ? '<span class="puce ko">en cours</span>' : '<span class="puce">terminé</span>'}</div>`).join('')}</div>` : vide('Jamais bloqué.')}</section>
  </div>
  <section class="pn pad"><div class="adm-ph"><h2 class="h2">Décisions de l’équipe</h2><a class="link" href="#journal/joueur=${id}">Dans le journal</a></div>${(F.journal || []).length ? `<div class="jl">${F.journal.map(entreeH).join('')}</div>` : vide('Aucune décision sur ce joueur.')}</section>`;
}
function activiteH() {
  const A = E.activite; if (!A) return '';
  if (A.erreur) return `<p class="limit over">${esc(A.erreur)}</p>`;
  if (!A.evenements.length) return vide('Rien pour ces filtres.');
  return `<div class="jl" id="adm-act">${A.evenements.map(evenementH).join('')}</div>${A.suite ? '<button class="btn b-white sm adm-suite" data-a="act-suite">Voir plus ancien</button>' : ''}`;
}
function evenementH(x) {
  const d = x.d || {}; let t = '', s = '';
  switch (x.t) {
    case 'connexion': t = 'Connexion'; s = d.appareil || ''; break;
    case 'derniere_connexion': t = 'Dernière connexion'; break;
    case 'argent': t = (OPS[d.k] || d.k || 'Opération') + ' ' + signe(d.montant); s = 'Solde après : ' + usd(d.solde) + (d.k === 'ajustement_admin' && d.ref ? ' ; motif : « ' + d.ref + ' »' : ''); break;
    case 'depot': t = 'Dépôt de ' + (d.usd != null ? usd(d.usd) : nfx(d.montant) + ' ' + (d.monnaie || '')); s = [d.moyen || d.reseau || d.monnaie, d.etat === 'completed' ? 'crédité' : d.etat === 'pending' ? 'en attente' : d.etat, d.etiquette].filter(Boolean).join(', '); break;
    case 'retrait': t = 'Retrait de ' + usd(d.usd); s = [d.moyen || d.reseau, d.etat === 'sent' || d.etat === 'completed' ? 'envoyé' : d.etat].filter(Boolean).join(', '); break;
    case 'message': t = 'Message dans ' + salonNom(d.salon) + (d.source === 'masque' ? ' (masqué par l’équipe)' : ''); s = texteMsg({ k: d.k, text: d.texte, bet: null }) || ''; break;
    case 'rang': t = 'Nouveau rang : ' + rang(d.t, d.d); break;
    case 'kyc': t = d.ok ? 'KYC validé' : 'KYC retiré'; break;
    case 'equipe': t = 'Décision de l’équipe : ' + (ACTIONS[d.action] || d.action); s = (d.par ? 'par ' + d.par : '') + (d.motif ? ' : « ' + d.motif + ' »' : ''); break;
    default: t = x.t;
  }
  return `<div class="je" data-t="${esc(x.t)}"><span><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span><small>${esc(quand(x.at))}</small></div>`;
}

/* ----- Actions sur un joueur ----- */
const majFiche = async r => { if (r && r.j) { E.fiche = r; E.noms[r.j.id] = r.j.n; } await chargerActivite(false); };
FORMS.solde = async f => {
  const j = E.fiche.j, delta = Math.round(lire(f.elements.delta.value) * 100) / 100;
  if (!delta || isNaN(delta)) { dire(ERR.montant_invalide, false); f.elements.delta.focus(); throw annule(); }
  if (+j.balance + delta < 0) { dire(ERR.solde_negatif, false); throw annule(); }
  const motif = await confirmer({ titre: 'Ajuster le solde de ' + j.n, lignes: [['Solde', usd(j.balance), usd(+j.balance + delta)], ['Opération', '—', 'ajustement admin de ' + signe(delta)]],
    note: 'Le joueur reçoit une notification et son écran se met à jour. S’annule depuis le journal (un ajustement inverse).', bouton: 'Ajuster le solde' });
  await majFiche(await eq('joueur_solde', { id: j.id, delta, motif }));
  dire('Solde ajusté : ' + usd(E.fiche.j.balance) + '.', true);
};
FORMS.rang = async f => {
  const j = E.fiche.j, [t, d] = f.elements.rang.value.split('-').map(Number);
  if (t === j.t && d === j.d) { dire('Le joueur a déjà ce rang.', false); throw annule(); }
  const motif = await confirmer({ titre: 'Donner un rang à ' + j.n, lignes: [['Rang', rang(j.t, j.d), rang(t, d)]],
    note: 'Ses compteurs montent au niveau du rang, jamais ils ne baissent. Un rang donné ne s’annule pas.', bouton: 'Donner ce rang' });
  await majFiche(await eq('joueur_rang', { id: j.id, t, d, motif }));
  dire('Rang donné : ' + rang(E.fiche.j.t, E.fiche.j.d) + '.', true);
};
CLICS.kyc = async b => {
  const j = E.fiche.j, ok = b.dataset.ok === '1';
  const motif = await confirmer({ titre: ok ? 'Valider le KYC de ' + j.n : 'Refuser le KYC de ' + j.n, lignes: [['KYC', j.kyc ? 'validé' : 'non fait', ok ? 'validé' : 'refusé']], motif: 'facultatif',
    note: ok ? 'Le joueur est prévenu ; carte, virement et PayPal s’ouvrent pour lui. S’annule depuis le journal.' : 'Carte, virement et PayPal se ferment pour lui. S’annule depuis le journal.', bouton: ok ? 'Valider le KYC' : 'Refuser le KYC', danger: !ok });
  await majFiche(await eq('joueur_kyc', { id: j.id, ok, motif }));
  dire(ok ? 'KYC validé.' : 'KYC refusé.', true);
};
SAISIES['bloc-acces'] = (t, f) => {
  const chat = f.elements.acces.value === 'chat', s = f.querySelector('[data-salon]'); s.hidden = !chat;
  f.elements.salon_autre.hidden = !(chat && f.elements.salon.value === 'autre');
};
FORMS.bloquer = async f => {
  const j = E.fiche.j, c = champs(f), acces = c.acces, D = DUREES.find(x => x[0] === c.duree) || DUREES[1];
  let salon = acces === 'chat' ? (c.salon === 'autre' ? String(c.salon_autre || '').trim() : c.salon) : '';
  if (acces === 'chat' && c.salon === 'autre' && !/^(m:[a-z0-9-]{1,40}|clan:[a-z0-9]{1,20})$/.test(salon)) { dire(ERR.salon_invalide, false); throw annule(); }
  const fin = D[2] ? quand(Date.now() + D[2]) : 'sans fin';
  const motif = await confirmer({ titre: 'Bloquer ' + (ACCES[acces] || acces).toLowerCase() + ' pour ' + j.n,
    intro: j.n + ' ' + (ACCES_PHRASE[acces] || '') + (acces === 'chat' ? ' (' + salonNom(salon) + ')' : '') + '.',
    lignes: [[(ACCES[acces] || acces) + (acces === 'chat' ? ', ' + salonNom(salon) : ''), 'ouvert', 'bloqué ' + (D[2] ? 'jusqu’au ' + fin : 'sans fin')], ['Durée', '—', D[1]]],
    note: 'Le joueur le voit aussitôt. Le blocage se lève ici, ou s’annule depuis le journal.', bouton: 'Bloquer', danger: true });
  await majFiche(await eq('joueur_bloquer', { id: j.id, acces, salon: salon || null, duree: D[0], motif }));
  dire('Accès bloqué : ' + (ACCES[acces] || acces) + ', ' + D[1].toLowerCase() + '.', true);
};
CLICS.debloquer = async b => {
  const j = E.fiche.j, bl = (E.fiche.blocages || []).find(x => String(x.id) === b.dataset.id); if (!bl) return;
  const motif = await confirmer({ titre: 'Lever un blocage de ' + j.n, lignes: [[(ACCES[bl.acces] || bl.acces) + (bl.acces === 'chat' ? ', ' + salonNom(bl.salon) : ''), 'bloqué ' + finBloc(bl.fin), 'ouvert']],
    note: 'Le joueur retrouve l’accès tout de suite. S’annule depuis le journal (le blocage reprend avec sa fin d’origine).', bouton: 'Lever le blocage' });
  await majFiche(await eq('joueur_debloquer', { id: bl.id, motif }));
  dire('Blocage levé.', true);
};
CLICS.deconnecter = async () => {
  const j = E.fiche.j, n = (E.fiche.sessions || []).length;
  const motif = await confirmer({ titre: 'Déconnecter ' + j.n + ' de partout', lignes: [['Sessions ouvertes', nb(n), '0']], motif: 'facultatif',
    note: 'Son écran se ferme aussitôt et lui demande de se reconnecter. Ne s’annule pas, mais le joueur peut se reconnecter.', bouton: 'Déconnecter', danger: true });
  await majFiche(await eq('joueur_deconnecter', { id: j.id, motif }));
  dire(j.n + ' est déconnecté de tous ses appareils.', true);
};
FORMS.xp = async f => {
  const j = E.fiche.j, delta = Math.trunc(lire(f.elements.delta.value));
  if (!delta) { dire(ERR.montant_invalide, false); throw annule(); }
  await adm('xp', { id: j.id, delta: String(delta) });
  await majFiche(await eq('joueur_fiche', { id: j.id }));
  dire('XP ajusté : ' + nb(E.fiche.j.xp) + ' XP.', true);
};
CLICS['lever-ancienne'] = async () => {
  const j = E.fiche.j;
  await confirmer({ titre: 'Lever la suspension de ' + j.n, lignes: [['Compte', 'suspendu', 'ouvert']], motif: null, note: 'Suspension posée par l’ancien panneau ; la levée est écrite au journal.', bouton: 'Lever la suspension' });
  await adm('suspendre', { id: j.id, jours: 0 });
  await majFiche(await eq('joueur_fiche', { id: j.id }));
  dire('Suspension levée.', true);
};
FORMS['act-filtre'] = async f => {
  E.actTypes = Array.from(f.querySelectorAll('input[name="t"]:checked')).map(i => i.value);
  const au = f.elements.au.value; E.actAvant = au ? String(Date.parse(au + 'T23:59:59') + 1000) : '';
  await chargerActivite(false);
};
CLICS['act-suite'] = async () => { await chargerActivite(true); };

/* ===================== Chat et communauté ===================== */
ECRANS.chat = {
  titre: 'Chat et communauté', groupe: 'joueurs', icone: 'chat', phrase: 'messages, mode lent, salons fermés, mots interdits, clans', acces: () => peut('chat_messages'),
  charger: async () => {
    const [m, s, c] = await Promise.all([eq('chat_messages', chatFiltre()), API.site().catch(() => null), API.call('api_clan').catch(() => null)]);
    E.chat.msgs = m.msgs || []; E.chat.suite = E.chat.msgs.length >= 60 ? E.chat.msgs[E.chat.msgs.length - 1].id : null; E.site = s;
    E.clans = c && c.clan ? c.clan.clans || [] : null;
    if (c && c.clan && c.clan.users) for (const id in c.clan.users) if (c.clan.users[id] && c.clan.users[id].n) E.noms[id] = c.clan.users[id].n;   // pseudos des membres des clans
    if (admin()) await chargerReglages().catch(() => {});
  },
  rendre: vChat
};
const chatFiltre = avant => { const p = { n: 60 }; if (E.chat.salon) p.salon = E.chat.salon; if (E.chat.joueur) p.joueur = E.chat.joueur; if (avant) p.avant = avant; return p; };
const salonsReg = () => (E.site && E.site.v && E.site.v['chat.salons']) || {};
function vChat() {
  const S = salonsReg(), noms = Array.from(new Set(['general', 'vip', 'blitz', ...Object.keys(S)]));
  const mots = regDe('chat.mots_interdits'), prives = regDe('chat.mots_prives');
  const clans = (E.clans || []).filter(c => !E.clanQ || norm(c.name + ' ' + c.tag + ' ' + c.id).includes(norm(E.clanQ)));
  return tete('Chat et communauté', 'Les messages des salons publics (jamais les messages privés), les règles de chaque salon, les mots interdits et les clans.') + `
  <nav class="chips adm-ancres" aria-label="Aller à"><a class="chip" href="#chat/c-messages">Messages</a><a class="chip" href="#chat/c-salons">Salons</a><a class="chip" href="#chat/c-mots">Mots interdits</a><a class="chip" href="#chat/c-clans">Clans</a></nav>
  <section class="pn pad" id="c-messages"><h2 class="h2">Messages</h2><p class="sub">Masquer un message le retire de tous les écrans ; il n’est pas effacé et peut être rendu.</p>
   <form data-f="chat-filtre" class="adm-filtres"><div class="field"><label for="cf-s">Salon</label><input id="cf-s" name="salon" value="${esc(E.chat.salon)}" placeholder="tous, general, vip, blitz, m:btc150k, clan:…" list="cf-salons" autocomplete="off"><datalist id="cf-salons">${noms.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="field"><label for="cf-j">Joueur (identifiant)</label><input id="cf-j" name="joueur" value="${esc(E.chat.joueur)}" autocomplete="off"></div><button class="btn b-white sm">Filtrer</button></form>
   <div class="jl" id="adm-chat">${E.chat.msgs.length ? E.chat.msgs.map(messageH).join('') : vide('Aucun message de joueur pour ces filtres.')}</div>
   ${E.chat.suite ? '<button class="btn b-white sm adm-suite" data-a="chat-suite">Messages plus anciens</button>' : ''}</section>
  <section class="pn pad" id="c-salons"><h2 class="h2">Salons</h2><p class="sub">Mode lent : délai minimum entre deux messages d’un même joueur. Un salon fermé refuse tous les messages des joueurs. L’équipe n’y est pas soumise ; le changement s’applique aussitôt.</p>
   <div class="regs">${noms.map(n => salonH(n, S[n])).join('')}</div>
   <form data-f="salon-ajout" class="adm-filtres"><div class="field"><label for="sa-s">Un autre salon</label><input id="sa-s" name="salon" placeholder="m:btc150k ou clan:abc123" autocomplete="off"></div><button class="btn b-white sm">Régler ce salon</button></form></section>
  <section class="pn pad" id="c-mots"><h2 class="h2">Mots interdits</h2><p class="sub">Un message qui contient l’un de ces mots est refusé, et le joueur voit pourquoi sous son champ de saisie.</p>
   ${mots ? `<form data-f="mots" class="col adm-form"><div class="field"><label for="mi-l">Un mot ou une expression par ligne (${nb((mots.valeur || []).length)} aujourd’hui)</label><textarea id="mi-l" name="mots" rows="6">${esc((mots.valeur || []).join('\n'))}</textarea></div>
    <label class="chk"><input type="checkbox" name="prives"${prives && prives.valeur ? ' checked' : ''}> Aussi dans les messages privés</label><div class="hbtns"><button class="btn b-white">Enregistrer la liste</button></div></form>`
    : `<p class="limit">La liste actuelle ne se lit qu’avec le rôle administrateur : demande à un administrateur de la modifier.</p>`}</section>
  <section class="pn pad" id="c-clans"><h2 class="h2">Clans</h2><p class="sub">Renommer un clan, ou le dissoudre : ses membres en sortent, ses candidatures sont annulées, son salon est fermé ; le clan reste en base.</p>
   ${E.clans === null ? '<p class="limit">La liste des clans est indisponible pour le moment.</p>' : `<div class="field adm-filtre-clans" data-saisie="clans-q"><label for="cl-q">Chercher un clan</label><input id="cl-q" value="${esc(E.clanQ)}" placeholder="nom, tag ou identifiant" autocomplete="off"></div>
   <div class="jl" id="adm-clans">${clans.length ? clans.slice(0, 60).map(clanH).join('') : vide('Aucun clan.')}</div>`}</section>`;
}
const messageH = m => `<div class="je msg${m.source === 'masque' ? ' masque' : ''}"><span><span class="je-l1"><b>${lienJoueur(m.u, m.n)}</b><span class="puce">${esc(salonNom(m.room))}</span>${m.source === 'masque' ? '<span class="puce ko">masqué</span>' : ''}</span><span class="msg-t">${esc(texteMsg(m))}</span><small>${esc(quand(m.at))}</small></span>
  ${m.source === 'masque' ? `<button class="btn b-white sm" data-a="restaurer" data-id="${esc(m.id)}">Rendre</button>` : `<button class="btn b-white sm" data-a="masquer" data-id="${esc(m.id)}">Masquer</button>`}</div>`;
const salonH = (n, r) => { r = r || { lent: 0, ferme: false }; return `<form class="reg salon" data-f="salon" data-salon="${esc(n)}" id="s-${esc(n)}"><div class="reg-t"><b>${esc(salonNom(n))}</b><p>${r.ferme ? 'Fermé : les joueurs ne peuvent plus y écrire.' : r.lent ? 'Mode lent : un message toutes les ' + nb(r.lent) + ' secondes par joueur.' : 'Ouvert, sans mode lent.'}</p></div>
  <div class="reg-a salon-a"><label class="salon-l"><span>Mode lent</span><select name="lent">${[0, 5, 10, 30, 60, 120, 300].map(s => opt(s, s ? (s < 60 ? s + ' s' : s / 60 + ' min') : 'aucun', +r.lent || 0)).join('')}${[0, 5, 10, 30, 60, 120, 300].includes(+r.lent || 0) ? '' : opt(r.lent, r.lent + ' s', r.lent)}</select></label>
  <label class="chk"><input type="checkbox" name="ferme"${r.ferme ? ' checked' : ''}> Fermé</label><button class="btn b-white sm">Appliquer</button></div></form>`; };
const clanH = c => `<div class="je clan" id="cl-${esc(c.id)}"><span><span class="je-l1"><b>${esc(c.name)} [${esc(c.tag)}]</b>${c.dissous ? '<span class="puce ko">dissous</span>' : ''}</span><small>${nb((c.members || []).length)} membre(s), créé le ${esc(jour(c.createdAt))}${c.chief ? ', chef ' + esc(E.noms[c.chief] || court(c.chief)) : ''}</small></span>
  ${c.dissous ? '' : `<span class="hbtns"><form data-f="clan-renommer" data-id="${esc(c.id)}" class="clan-r"><input name="nom" value="${esc(c.name)}" aria-label="Nouveau nom de ${esc(c.name)}" maxlength="28"><button class="btn b-white sm">Renommer</button></form>
  <button class="btn b-white sm" data-a="clan-dissoudre" data-id="${esc(c.id)}">Dissoudre</button></span>`}</div>`;
FORMS['chat-filtre'] = async f => { const c = champs(f); E.chat.salon = c.salon.trim() === 'tous' ? '' : c.salon.trim(); E.chat.joueur = c.joueur.trim(); const r = await eq('chat_messages', chatFiltre()); E.chat.msgs = r.msgs || []; E.chat.suite = E.chat.msgs.length >= 60 ? E.chat.msgs[E.chat.msgs.length - 1].id : null; };
CLICS['chat-suite'] = async () => { const r = await eq('chat_messages', chatFiltre(E.chat.suite)); const L = r.msgs || []; E.chat.msgs = E.chat.msgs.concat(L); E.chat.suite = L.length >= 60 ? L[L.length - 1].id : null; };
CLICS.masquer = async b => {
  const m = E.chat.msgs.find(x => String(x.id) === b.dataset.id); if (!m) return;
  const motif = await confirmer({ titre: 'Masquer ce message', intro: '« ' + texteMsg(m) + ' », de ' + m.n + ' dans ' + salonNom(m.room) + '.', lignes: [['Message', 'visible', 'masqué']], motif: 'facultatif',
    note: 'Il disparaît aussitôt de tous les écrans ; il n’est pas effacé et peut être rendu.', bouton: 'Masquer' });
  await eq('chat_supprimer', { id: m.id, motif }); m.source = 'masque'; dire('Message masqué.', true);
};
CLICS.restaurer = async b => {
  const m = E.chat.msgs.find(x => String(x.id) === b.dataset.id); if (!m) return;
  await eq('chat_restaurer', { id: m.id }); m.source = 'joueur'; dire('Message rendu : il réapparaît dans le salon.', true);
};
FORMS.salon = async f => {
  const n = f.dataset.salon, avant = salonsReg()[n] || { lent: 0, ferme: false }, lent = +f.elements.lent.value, ferme = f.elements.ferme.checked;
  if (lent === (+avant.lent || 0) && ferme === !!avant.ferme) { dire(ERR.reglage_inchange, false); throw annule(); }
  const motif = await confirmer({ titre: 'Règles du salon ' + salonNom(n), lignes: [['Mode lent', avant.lent ? avant.lent + ' s' : 'aucun', lent ? lent + ' s' : 'aucun'], ['Salon', avant.ferme ? 'fermé' : 'ouvert', ferme ? 'fermé' : 'ouvert']], motif: 'facultatif',
    note: 'Le champ de saisie des joueurs connectés le dit aussitôt. S’annule depuis le journal.', bouton: 'Appliquer', danger: ferme && !avant.ferme });
  const r = await eq('salon_regler', { salon: n, lent, ferme, motif });
  E.site = E.site || { v: {} }; E.site.v = Object.assign({}, E.site.v, { 'chat.salons': r.salons || {} });
  dire('Salon ' + salonNom(n) + ' : ' + (ferme ? 'fermé' : lent ? 'mode lent de ' + lent + ' s' : 'ouvert') + '.', true);
};
FORMS['salon-ajout'] = async f => {
  const n = f.elements.salon.value.trim();
  if (!/^(m:[a-z0-9-]{1,40}|clan:[a-z0-9]{1,20})$/.test(n)) { dire(ERR.salon_invalide, false); throw annule(); }
  E.site = E.site || { v: {} }; const S = Object.assign({}, salonsReg()); if (!S[n]) S[n] = { lent: 0, ferme: false }; E.site.v = Object.assign({}, E.site.v, { 'chat.salons': S });
};
FORMS.mots = async f => {
  const r = regDe('chat.mots_interdits'), p = regDe('chat.mots_prives');
  const mots = Array.from(new Set(f.elements.mots.value.split(/[\n,;]/).map(x => x.trim().toLowerCase()).filter(Boolean))).sort();
  const prives = f.elements.prives.checked, avant = (r && r.valeur) || [];
  if (mots.some(m => m.length < 2 || m.length > 40)) { dire(ERR.mots_invalides, false); throw annule(); }
  const plus = mots.filter(m => !avant.includes(m)), moins = avant.filter(m => !mots.includes(m));
  const motif = await confirmer({ titre: 'Mots interdits', lignes: [['Mots', nb(avant.length), nb(mots.length)], ['Ajoutés', '—', plus.join(', ') || 'aucun'], ['Retirés', '—', moins.join(', ') || 'aucun'], ['Messages privés', p && p.valeur ? 'aussi' : 'non', prives ? 'aussi' : 'non']],
    motif: 'facultatif', note: 'Vaut dès le message suivant. S’annule depuis le journal.', bouton: 'Enregistrer la liste' });
  const rep = await eq('mots_interdits', { mots, prives, motif });
  if (r) r.valeur = rep.mots; if (p) p.valeur = rep.prives;
  dire('Liste des mots interdits enregistrée : ' + nb(rep.mots.length) + ' mot(s).', true);
};
SAISIES['clans-q'] = t => { E.clanQ = t.value; const L = $('#adm-clans'); if (L) { const c = (E.clans || []).filter(x => !E.clanQ || norm(x.name + ' ' + x.tag + ' ' + x.id).includes(norm(E.clanQ))); L.innerHTML = c.length ? c.slice(0, 60).map(clanH).join('') : vide('Aucun clan.'); } };
FORMS['clan-renommer'] = async f => {
  const c = (E.clans || []).find(x => x.id === f.dataset.id), nom = f.elements.nom.value.trim(); if (!c) return;
  if (nom.length < 3 || nom.length > 28) { dire(ERR.clan_nom_invalide, false); throw annule(); }
  if (nom === c.name) { dire(ERR.reglage_inchange, false); throw annule(); }
  const motif = await confirmer({ titre: 'Renommer un clan', lignes: [['Nom', c.name, nom]], motif: 'facultatif', note: 'S’annule depuis le journal.', bouton: 'Renommer' });
  const r = await eq('clan_renommer', { id: c.id, nom, motif }); c.name = (r.clan && r.clan.nom) || nom; dire('Clan renommé : ' + c.name + '.', true);
};
CLICS['clan-dissoudre'] = async b => {
  const c = (E.clans || []).find(x => x.id === b.dataset.id); if (!c) return;
  const motif = await confirmer({ titre: 'Dissoudre ' + c.name + ' [' + c.tag + ']', lignes: [['Membres', nb((c.members || []).length), '0'], ['Salon du clan', 'ouvert', 'fermé']],
    note: 'Ses membres en sortent, ses candidatures sont annulées, plus personne n’y entre. Ne s’annule pas. Refusé pendant une guerre de clans.', bouton: 'Dissoudre le clan', danger: true });
  await eq('clan_dissoudre', { id: c.id, motif }); c.members = []; c.dissous = true; dire('Clan dissous.', true);
};

/* ===================== Site : annonce, maintenance, activité simulée ===================== */
ECRANS.site = {
  titre: 'Site', groupe: 'reglages', icone: 'globe', phrase: 'annonce à tous, maintenance, activité simulée (bots)', acces: () => peut('annonce_publier'),
  charger: async () => { const [s] = await Promise.all([API.site(), chargerReglages()]); E.site = s; },
  rendre: vSite
};
const LANGUES = [['fr', 'Français (obligatoire)'], ['en', 'Anglais'], ['he', 'Hébreu']];
function vSite() {
  const s = E.site || {}, a = s.annonce, m = s.maintenance || {}, b = E.bots || {}, msg = m.message || {};
  return tete('Site', 'Ce que tout le monde voit : l’annonce, la maintenance, et l’activité des bots sur les marchés et dans le chat. Chaque changement est poussé aussitôt aux joueurs connectés.') + `
  <section class="pn pad" id="site-annonce"><h2 class="h2">Annonce à tous</h2><p class="sub">Un bandeau en haut du site, pour les visiteurs comme pour les joueurs, dans leur langue (à défaut, en anglais puis en français). Chacun peut le fermer.</p>
   ${a ? `<div class="apercu annonce ${esc(a.ton || 'info')}"><div class="annonce-in">${ic(a.ton === 'alerte' ? 'info' : a.ton === 'succes' ? 'check' : 'globe', 16)}<p>${esc((a.t && a.t.fr) || '')}</p></div></div><p class="adm-note">En ligne depuis le ${esc(quand(a.at))}${a.fin ? ', jusqu’au ' + esc(quand(a.fin)) : ', sans date de fin'}.</p><div class="hbtns"><button class="btn b-white" data-a="annonce-retirer">Retirer l’annonce</button></div>` : '<p class="vide">Aucune annonce en ligne.</p>'}
   <h3 class="adm-h3">${a ? 'Remplacer l’annonce' : 'Nouvelle annonce'}</h3>
   <form data-f="annonce" class="col adm-form" data-saisie="annonce">
    ${LANGUES.map(([k, l]) => `<div class="field"><label for="an-${k}">${l}</label><textarea id="an-${k}" name="${k}" maxlength="280" rows="2" dir="${k === 'he' ? 'rtl' : 'ltr'}" lang="${k}">${esc(a && a.t ? a.t[k] || '' : '')}</textarea></div>`).join('')}
    <fieldset class="field"><legend>Ton</legend><div class="chips">${[['info', 'Information'], ['alerte', 'Alerte'], ['succes', 'Bonne nouvelle']].map(([k, l]) => `<label class="chip"><input type="radio" name="ton" value="${k}"${(a ? a.ton : 'info') === k ? ' checked' : ''}>${l}</label>`).join('')}</div></fieldset>
    <div class="adm-ligne"><div class="field court"><label for="an-d">Fin (facultatif)</label><input id="an-d" name="fin_d" type="date"></div><div class="field court"><label for="an-h">Heure</label><input id="an-h" name="fin_h" type="time" value="23:59"></div></div>
    <div class="hbtns"><button class="btn b-pri">${a ? 'Remplacer l’annonce' : 'Publier l’annonce'}</button></div></form></section>
  <section class="pn pad" id="site-maintenance"><h2 class="h2">Maintenance</h2><p class="sub">Pendant la maintenance, le serveur refuse toute action d’un joueur et les joueurs voient un écran d’attente ; l’équipe continue de passer. À la fin, leur écran se recharge seul.</p>
   <p class="etat-maint ${m.actif ? 'ko' : ''}" data-v="maintenance">${m.actif ? 'Le site est en maintenance.' : 'Le site est ouvert.'}</p>
   <form data-f="maintenance" class="col adm-form">${[['fr', 'Message en français (facultatif)'], ['en', 'Message en anglais'], ['he', 'Message en hébreu']].map(([k, l]) => `<div class="field"><label for="mt-${k}">${l}</label><textarea id="mt-${k}" name="${k}" maxlength="280" rows="2" dir="${k === 'he' ? 'rtl' : 'ltr'}" lang="${k}" placeholder="${k === 'fr' ? 'Vide : « Le site revient dans quelques minutes. »' : ''}">${esc(msg[k] || '')}</textarea></div>`).join('')}
    <input type="hidden" name="actif" value="${m.actif ? 'false' : 'true'}"><div class="hbtns"><button class="btn ${m.actif ? 'b-pri' : 'b-no'}">${m.actif ? 'Sortir de la maintenance' : 'Mettre le site en maintenance'}</button>${m.actif ? '<button type="button" class="btn b-white" data-a="maint-message">Changer seulement le message</button>' : ''}</div></form></section>
  <section class="pn pad" id="site-bots"><h2 class="h2">Activité simulée</h2><p class="sub">Les bots animent les marchés et le chat. Ils se mettent d’eux-mêmes en veille quand aucun joueur n’est en ligne.</p>
   <form data-f="bots" class="col adm-form">
    <label class="tgl"><span class="tgl-t"><b>Bots en marche</b><small>Coupés, plus aucune mise ni aucun message de bot.</small></span><input type="checkbox" name="actif"${b.actif === false ? '' : ' checked'}><span class="sl"></span></label>
    <div class="adm-ligne"><div class="field court"><label for="bo-i">Intensité sur les marchés (0 à 3)</label><input id="bo-i" name="intensite" inputmode="decimal" value="${esc(nfx(b.intensite == null ? 1 : b.intensite, 2))}"></div>
    <div class="field court"><label for="bo-c">Bavardage dans le chat (0 à 3)</label><input id="bo-c" name="chat" inputmode="decimal" value="${esc(nfx(b.chat == null ? 1 : b.chat, 2))}"></div>
    <div class="field court"><label for="bo-r">Rappel des prix (0 à 0,2)</label><input id="bo-r" name="rappel" inputmode="decimal" value="${esc(nfx(b.rappel == null ? 0.05 : b.rappel, 3))}"></div></div>
    <p class="adm-note">Valeurs par défaut : en marche, intensité 1, bavardage 1.</p><div class="hbtns"><button class="btn b-white">Enregistrer</button></div></form></section>`;
}
const textes = (f, oblig) => { const t = {}; for (const [k] of LANGUES) { const v = (f.elements[k].value || '').trim(); if (v) t[k] = v; } return Object.keys(t).length || oblig ? t : null; };
SAISIES.annonce = () => {};
FORMS.annonce = async f => {
  const t = textes(f, true), ton = (f.querySelector('input[name="ton"]:checked') || {}).value || 'info', d = f.elements.fin_d.value;
  if (!t.fr || t.fr.length < 3) { dire(ERR.annonce_invalide, false); f.elements.fr.focus(); throw annule(); }
  const fin = d ? Date.parse(d + 'T' + (f.elements.fin_h.value || '23:59') + ':00') : null;
  if (fin && fin <= Date.now()) { dire(ERR.date_invalide, false); throw annule(); }
  const a = E.site && E.site.annonce;
  const motif = await confirmer({ titre: a ? 'Remplacer l’annonce' : 'Publier l’annonce', lignes: [['Annonce', a ? '« ' + (a.t || {}).fr + ' »' : 'aucune', '« ' + t.fr + ' »'], ['Langues', '—', Object.keys(t).join(', ')], ['Fin', '—', fin ? quand(fin) : 'sans date de fin']], motif: 'facultatif',
    note: 'Elle apparaît aussitôt chez les joueurs connectés, et chez les visiteurs à leur prochaine lecture (3 minutes au plus). S’annule depuis le journal.', bouton: a ? 'Remplacer' : 'Publier' });
  const r = await eq('annonce_publier', { textes: t, ton, fin, motif }); E.site = Object.assign({}, E.site, { annonce: r.annonce });
  dire('Annonce publiée.', true);
};
CLICS['annonce-retirer'] = async () => {
  const a = E.site && E.site.annonce;
  const motif = await confirmer({ titre: 'Retirer l’annonce', lignes: [['Annonce', a ? '« ' + (a.t || {}).fr + ' »' : '—', 'aucune']], motif: 'facultatif', note: 'Le bandeau disparaît aussitôt. S’annule depuis le journal.', bouton: 'Retirer' });
  await eq('annonce_retirer', { motif }); E.site = Object.assign({}, E.site, { annonce: null }); dire('Annonce retirée.', true);
};
async function maintenance(f, actif) {
  const avant = (E.site && E.site.maintenance) || {}, message = textes(f, false);
  const motif = await confirmer({ titre: actif && avant.actif ? 'Changer le message de maintenance' : actif ? 'Mettre le site en maintenance' : 'Sortir de la maintenance',
    lignes: [['Maintenance', avant.actif ? 'en cours' : 'non', actif ? 'en cours' : 'non'], ['Message', avant.message && avant.message.fr ? '« ' + avant.message.fr + ' »' : 'message par défaut', message && message.fr ? '« ' + message.fr + ' »' : 'message par défaut']],
    motif: 'facultatif', note: actif ? 'Tous les joueurs connectés voient aussitôt l’écran de maintenance ; le serveur refuse leurs actions. L’équipe passe.' : 'Les joueurs retrouvent le site : leur écran se recharge seul.',
    bouton: actif ? (avant.actif ? 'Changer le message' : 'Mettre en maintenance') : 'Sortir de la maintenance', danger: actif && !avant.actif });
  const r = await eq('maintenance', { actif, message, motif }); E.site = Object.assign({}, E.site, { maintenance: r.maintenance });
  dire(actif ? 'Maintenance en cours.' : 'Le site est ouvert.', true);
}
FORMS.maintenance = async f => maintenance(f, f.elements.actif.value === 'true');
CLICS['maint-message'] = async b => maintenance(b.closest('form'), true);
FORMS.bots = async f => {
  const b = E.bots || {}, p = {}, lignes = [], actif = f.elements.actif.checked;
  if (actif !== (b.actif !== false)) { p.actif = actif; lignes.push(['Bots', b.actif === false ? 'coupés' : 'en marche', actif ? 'en marche' : 'coupés']); }
  for (const [k, l, max, d] of [['intensite', 'Intensité', 3, 1], ['chat', 'Bavardage', 3, 1], ['rappel', 'Rappel des prix', 0.2, 0.05]]) {
    const v = lire(f.elements[k].value), cur = b[k] == null ? d : +b[k];
    if (isNaN(v) || v < 0 || v > max) { dire(l + ' : saisis un nombre entre 0 et ' + nfx(max, 2) + '.', false); f.elements[k].focus(); throw annule(); }
    if (Math.abs(v - cur) > 1e-9) { p[k] = v; lignes.push([l, nfx(cur, 3), nfx(v, 3)]); }
  }
  if (!lignes.length) { dire(ERR.reglage_inchange, false); throw annule(); }
  const motif = await confirmer({ titre: 'Activité simulée', lignes, motif: 'facultatif', note: 'Vaut dès le prochain passage des bots (quelques secondes). S’annule depuis le journal.', bouton: 'Enregistrer', danger: p.actif === false });
  const r = await eq('activite_simulee', Object.assign(p, { motif })); E.bots = r.bots || E.bots;
  dire('Activité simulée enregistrée.', true);
};

/* ===================== Marchés (fonctions de l'ancien panneau) et écrans de la partie D ===================== */
const CATS = ['Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport', 'Sport live', 'Bourse', 'Matières', 'Devises'];
const puceEtat = m => m.st === 'resolved' ? `<span class="puce">résolu${m.issue ? ' : ' + (m.issue === 'oui' ? 'Oui' : m.issue === 'non' ? 'Non' : esc(m.issue)) : ''}</span>`
  : (m.st === 'closed' ? '<span class="puce att">mises fermées</span>' : clotureMs(m) < Date.now() ? '' : '<span class="puce ok">ouvert</span>') + (clotureMs(m) < Date.now() ? '<span class="puce ko">à résoudre</span>' : '');
const bientotH = (t, L) => `<section class="pn pad bientot-c"><h2 class="h2">${esc(t)} <span class="puce att">bientôt</span></h2><ul class="adm-liste-p">${L.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
ECRANS.marches = {
  titre: 'Marchés', groupe: 'marches', icone: 'chart', phrase: 'créer, modifier, fermer les mises, résoudre', acces: () => admin(),
  charger: async () => { if (ancien()) E.marches = (await adm('marches')).marches || []; },
  rendre: () => {
    const ed = E.marcheEd || {}, neuf = !E.marcheEd;
    const suite = bientotH('Avec la partie D', ['Le cycle de vie complet d’un marché : suspendre, annuler avec remboursement au prix d’achat.', 'Les textes en trois langues, les images et les options d’un marché à plusieurs issues.', 'La résolution automatique à partir des sources de données, avec sa preuve.']);
    if (!ancien()) return tete('Marchés', 'La gestion des marchés arrive avec la partie D.') + suite;
    return tete('Marchés', 'Créer un marché, le modifier, fermer ou rouvrir ses mises, le résoudre. À la résolution, chaque part gagnante vaut 1 $ et chaque joueur est prévenu.') + `
    <section class="pn adm-liste" id="adm-marches">${E.marches.length ? E.marches.map(m => `<div class="rang-l" id="m-${esc(m.id)}"><span class="rl-t"><span class="je-l1"><b>${esc(m.short || m.id)}</b>${puceEtat(m)}</span>
      <small>${esc(m.id)}, ${esc(m.cat)}, ${m.p == null ? '—' : esc(nfx(m.p, 1)) + NB + '%'}, ${esc(nb(m.positions))} position(s) de joueurs, clôture ${esc(m.date || '—')} ${esc(m.time || '')}</small></span>
      <span class="hbtns">${m.st === 'resolved' ? '' : `<button class="btn b-white sm" data-a="editer" data-id="${esc(m.id)}">Modifier</button>
       <button class="btn b-white sm" data-a="etat" data-id="${esc(m.id)}" data-etat="${m.st === 'closed' ? 'open' : 'closed'}">${m.st === 'closed' ? 'Rouvrir les mises' : 'Fermer les mises'}</button>
       <button class="btn b-white sm" data-a="resoudre" data-id="${esc(m.id)}" data-issue="oui">Résoudre : Oui</button><button class="btn b-white sm" data-a="resoudre" data-id="${esc(m.id)}" data-issue="non">Résoudre : Non</button>`}</span></div>`).join('') : vide('Aucun marché.')}</section>
    <section class="pn pad" id="adm-marche-f"><h2 class="h2">${neuf ? 'Créer un marché' : 'Modifier ' + esc(ed.id)}</h2><form data-f="marche" class="col adm-form">
     <div class="adm-ligne"><div class="field"><label for="am-id">Identifiant (dans l’adresse)</label><input id="am-id" name="id" value="${esc(ed.id || '')}" ${neuf ? '' : 'readonly'} pattern="[a-z0-9][a-z0-9\\-]{2,39}" required></div>
      <div class="field"><label for="am-cat">Catégorie</label><select id="am-cat" name="cat">${CATS.map(c => opt(c, c, ed.cat || 'Crypto')).join('')}</select></div></div>
     <div class="field"><label for="am-q">Question</label><input id="am-q" name="q" value="${esc(ed.q || '')}" minlength="8" maxlength="200" required></div>
     <div class="adm-ligne"><div class="field"><label for="am-s">Titre court</label><input id="am-s" name="short" value="${esc(ed.short || '')}" maxlength="60"></div>
      <div class="field court"><label for="am-d">Clôture</label><input id="am-d" name="date" type="date" value="${esc(ed.date || '')}" required></div><div class="field court"><label for="am-t">Heure</label><input id="am-t" name="time" type="time" value="${esc(ed.time || '23:59')}"></div></div>
     <div class="adm-ligne"><div class="field court"><label for="am-p">Valeur de référence (%)</label><input id="am-p" name="p" inputmode="decimal" value="${esc(ed.ref == null ? 50 : ed.ref)}" required></div>
      <div class="field court"><label for="am-h">Activité des bots (0,5 à 4)</label><input id="am-h" name="heat" inputmode="decimal" value="${esc(ed.heat == null ? 1.5 : ed.heat)}" required></div></div>
     <div class="field"><label for="am-r">Règles de résolution</label><textarea id="am-r" name="rules" maxlength="600">${esc(ed.rules || '')}</textarea></div>
     <div class="hbtns"><button class="btn b-pri">${neuf ? 'Créer le marché' : 'Enregistrer'}</button>${neuf ? '' : '<button type="button" class="btn b-white" data-a="annuler-edition">Annuler</button>'}</div></form></section>${suite}`;
  }
};
FORMS.marche = async f => {
  const c = champs(f); c.p = String(c.p).replace(',', '.'); c.heat = String(c.heat).replace(',', '.');
  E.marches = (await adm('marche', c)).marches || []; E.marcheEd = null; dire('Marché enregistré.', true);
};
CLICS.editer = async b => { E.marcheEd = E.marches.find(m => m.id === b.dataset.id) || null; setTimeout(() => { const s = $('#adm-marche-f'); if (s) s.scrollIntoView({ block: 'start' }); }, 0); };
CLICS['annuler-edition'] = async () => { E.marcheEd = null; };
CLICS.etat = async b => {
  const m = E.marches.find(x => x.id === b.dataset.id), ferme = b.dataset.etat === 'closed';
  await confirmer({ titre: (ferme ? 'Fermer les mises de ' : 'Rouvrir les mises de ') + (m ? m.short || m.id : b.dataset.id), lignes: [['Mises', ferme ? 'ouvertes' : 'fermées', ferme ? 'fermées' : 'ouvertes']], motif: null, note: 'Écrit au journal.', bouton: ferme ? 'Fermer les mises' : 'Rouvrir les mises' });
  E.marches = (await adm('marche_etat', { id: b.dataset.id, etat: b.dataset.etat })).marches || []; dire(ferme ? 'Mises fermées.' : 'Mises rouvertes.', true);
};
CLICS.resoudre = async b => {
  const m = E.marches.find(x => x.id === b.dataset.id); if (!m) return;
  const oui = b.dataset.issue === 'oui';
  const motif = await confirmer({ titre: 'Résoudre « ' + (m.short || m.id) + ' »', intro: m.q,
    lignes: [['Marché', 'ouvert', 'résolu'], ['Issue gagnante', '—', oui ? 'Oui' : 'Non'], ['Positions de joueurs', nb(m.positions), 'réglées : 1 $ par part gagnante']],
    note: 'Une résolution ne s’annule pas. Dans un marché à plusieurs issues, résoudre une issue par Oui résout les autres par Non. L’ancien serveur note l’issue et les montants versés ; il ne garde pas encore ce motif (il le gardera avec la partie D).',
    bouton: 'Résoudre : ' + (oui ? 'Oui' : 'Non'), danger: true });
  const r = await adm('resoudre', { id: m.id, issue: b.dataset.issue, motif }); E.marches = r.marches || [];
  dire('Marché résolu : ' + usd(r.reglement.verse) + ' versés à ' + r.reglement.joueurs + ' position(s).', true);
};
ECRANS['marches-du-jour'] = { titre: 'Marchés du jour', groupe: 'marches', icone: 'sun', bientot: true, phrase: 'brouillons du jour à valider (bientôt)', acces: () => admin(),
  rendre: () => tete('Marchés du jour', 'Cet écran arrive avec la partie D. Rien n’y est encore relié au serveur.') + bientotH('Ce qu’on y fera', ['Relire chaque matin les marchés proposés à partir de l’actualité, du sport et des cours.', 'Corriger un titre, une image ou une règle de résolution, puis valider ou refuser.', 'Valider ou refuser les propositions des joueurs.']) };
ECRANS.sources = { titre: 'Sources de données', groupe: 'marches', icone: 'cloud', bientot: true, phrase: 'état des sources de cours et de scores (bientôt)', acces: () => admin(),
  rendre: () => tete('Sources de données', 'Cet écran arrive avec la partie D. Rien n’y est encore relié au serveur.') + bientotH('Ce qu’on y verra', ['Chaque source de cours, de scores et d’actualité : en direct, en différé, simulée ou en erreur, et sa dernière mise à jour.', 'La part du quota gratuit déjà utilisée.', 'Activer ou couper une source, et la tester.']) };

/* ===================== Administrateurs ===================== */
ECRANS.equipe = {
  titre: 'Administrateurs', groupe: 'equipe', icone: 'shield', phrase: 'membres de l’équipe, rôles, double authentification', acces: () => peut('equipe_liste'),
  charger: async () => { const [l] = await Promise.all([eq('equipe_liste'), chargerReglages().catch(() => {})]); E.equipe = l.membres || []; E.equipe.forEach(m => { E.noms[m.id] = m.n; }); },
  rendre: () => {
    const L = E.equipe || [], actifs = L.filter(m => m.actif), anciens = L.filter(m => !m.actif);
    return tete('Administrateurs', 'Un compte personnel par personne, jamais de compte partagé. Administrateur : tout. Modérateur : les joueurs et le chat seulement, ajustements de solde plafonnés.') + `
    <section class="pn adm-liste" id="adm-equipe">${actifs.map(m => `<div class="rang-l"><span class="rl-t"><span class="je-l1"><b>${esc(m.n)}</b>${puceRole(m.role)}${m.facteurs > 0 ? '<span class="puce ok">double authentification</span>' : '<span class="puce att">sans double authentification</span>'}${m.origine === 'ancien' ? '<span class="puce">compte de l’ancien panneau</span>' : ''}</span>
      <small>${esc(m.email || 'sans e-mail')}</small><small>Membre depuis le ${esc(jour(m.ajoute_at))}</small></span>
      <span class="hbtns"><form data-f="membre-role" data-id="${esc(m.id)}" class="clan-r"><select name="role" aria-label="Rôle de ${esc(m.n)}">${opt('administrateur', 'Administrateur', m.role)}${opt('moderateur', 'Modérateur', m.role)}</select><button class="btn b-white sm">Changer le rôle</button></form>
      <button class="btn b-white sm" data-a="membre-retirer" data-id="${esc(m.id)}">Retirer de l’équipe</button></span></div>`).join('') || vide('Aucun membre.')}</section>
    <section class="pn pad"><h2 class="h2">Ajouter un membre</h2><p class="sub">La personne crée d’abord son compte joueur sur Wimoro et confirme son e-mail. Ni bot, ni compte de test, ni compte partagé.</p>
     <form data-f="membre-ajouter" class="adm-ligne"><div class="field"><label for="me-e">E-mail de son compte</label><input id="me-e" name="email" type="email" required autocomplete="off"></div>
      <div class="field court"><label for="me-r">Rôle</label><select id="me-r" name="role">${opt('moderateur', 'Modérateur', 'moderateur')}${opt('administrateur', 'Administrateur', '')}</select></div><button class="btn b-pri">Ajouter</button></form></section>
    <section class="pn pad"><h2 class="h2">Réglages de l’équipe</h2><p class="sub">Activer la double authentification pour tous seulement quand chaque membre a enrôlé son code : sinon un membre sans code ne peut plus entrer.</p><div class="regs">${CLES_ECRAN.equipe.map(regDe).filter(Boolean).map(regLigneH).join('')}</div></section>
    ${anciens.length ? `<section class="pn pad"><h2 class="h2">Anciens membres</h2><div class="jl">${anciens.map(m => `<div class="je"><span><b>${esc(m.n)}</b><small>${esc(m.email || '')}, retiré le ${esc(jour(m.retire_at))}</small></span></div>`).join('')}</div></section>` : ''}`;
  }
};
FORMS['membre-ajouter'] = async f => {
  const c = champs(f), email = c.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { dire('Saisis l’e-mail du compte de la personne.', false); throw annule(); }
  const motif = await confirmer({ titre: 'Ajouter un membre', lignes: [['Équipe', nb((E.equipe || []).filter(m => m.actif).length) + ' membre(s)', nb((E.equipe || []).filter(m => m.actif).length + 1) + ' membre(s)'], [email, 'joueur', c.role === 'administrateur' ? 'administrateur' : 'modérateur']],
    note: 'La personne trouve le panneau à sa prochaine connexion. S’annule depuis le journal.', bouton: 'Ajouter' });
  E.equipe = (await eq('equipe_ajouter', { email, role: c.role, motif })).membres || []; dire(email + ' fait partie de l’équipe.', true);
};
FORMS['membre-role'] = async f => {
  const m = (E.equipe || []).find(x => x.id === f.dataset.id), role = f.elements.role.value; if (!m) return;
  if (role === m.role) { dire(ERR.role_inchange, false); throw annule(); }
  const motif = await confirmer({ titre: 'Changer le rôle de ' + m.n, lignes: [['Rôle', ROLE(m.role), ROLE(role)]], note: 'Vaut dès sa prochaine action. S’annule depuis le journal.', bouton: 'Changer le rôle' });
  E.equipe = (await eq('equipe_role', { id: m.id, role, motif })).membres || []; dire('Rôle changé : ' + m.n + ' est ' + ROLE(role) + '.', true);
};
CLICS['membre-retirer'] = async b => {
  const m = (E.equipe || []).find(x => x.id === b.dataset.id); if (!m) return;
  const motif = await confirmer({ titre: 'Retirer ' + m.n + ' de l’équipe', lignes: [['Rôle', ROLE(m.role), 'aucun (joueur)']], note: 'Rien n’est supprimé : son compte joueur reste. Il perd le panneau dès sa prochaine action. S’annule depuis le journal.', bouton: 'Retirer', danger: true });
  E.equipe = (await eq('equipe_retirer', { id: m.id, motif })).membres || []; dire(m.n + ' ne fait plus partie de l’équipe.', true);
};

/* ===================== Journal ===================== */
ECRANS.journal = {
  titre: 'Journal', groupe: 'pilotage', icone: 'layers', phrase: 'toutes les décisions : qui, quand, quoi, avant, après, motif', acces: () => peut('journal_lire'),
  charger: async arg => {
    if (arg) { E.journal.f = { admin: '', joueur: '', action: '', du: '', au: '' }; for (const kv of String(arg).split('&')) { const [k, v] = kv.split('='); if (k in E.journal.f) E.journal.f[k] = v || ''; } }   // un lien porte tous ses filtres
    const [r, l] = await Promise.all([eq('journal_lire', journalP()), admin() && !E.equipe ? eq('equipe_liste').catch(() => null) : null]);
    E.journal.entrees = r.entrees || []; E.journal.suite = r.suite || null; if (l) E.equipe = l.membres || [];
  },
  rendre: () => {
    const J = E.journal, f = J.f, membres = E.equipe || [];
    return tete('Journal', admin() ? 'Chaque décision de l’équipe, de l’ancien comme du nouveau panneau : qui, quand, quoi, sur qui, avant, après, motif. Personne ne peut le modifier ni l’effacer.' : 'Tes décisions, et celles qui visent un joueur que tu ouvres.',
      `<div class="hbtns">${peut('journal_csv') ? '<button class="btn b-white" data-a="journal-csv">' + ic('down', 16) + ' Exporter en CSV</button>' : ''}${peut('journal_verifier') ? '<button class="btn b-white" data-a="journal-verifier">Vérifier le journal</button>' : ''}</div>`) + `
    ${J.verif ? `<p class="limit${J.verif.ok ? '' : ' over'}" data-v="verif">${J.verif.ok ? 'Journal intact : ' + nb(J.verif.n) + ' entrées, empreinte de tête ' + esc(String(J.verif.tete || '').slice(0, 16)) + '.' : 'Journal altéré à partir de l’entrée n° ' + esc(J.verif.rompue) + ' : préviens l’équipe technique.'}</p>` : ''}
    <form data-f="journal-filtre" class="pn pad adm-filtres">
     ${admin() ? `<div class="field"><label for="jf-a">Qui</label><select id="jf-a" name="admin">${opt('', 'Tout le monde', f.admin)}${membres.map(m => opt(m.id, m.n, f.admin)).join('')}</select></div>` : ''}
     <div class="field"><label for="jf-t">Type</label><select id="jf-t" name="action">${opt('', 'Toutes les décisions', f.action)}${Object.entries(ACTIONS).map(([k, v]) => opt(k, v, f.action)).join('')}</select></div>
     <div class="field"><label for="jf-j">Joueur visé (identifiant)</label><input id="jf-j" name="joueur" value="${esc(f.joueur)}" autocomplete="off"></div>
     <div class="field court"><label for="jf-du">Du</label><input id="jf-du" name="du" type="date" value="${esc(f.du)}"></div><div class="field court"><label for="jf-au">Au</label><input id="jf-au" name="au" type="date" value="${esc(f.au)}"></div>
     <div class="hbtns"><button class="btn b-white sm">Filtrer</button>${Object.values(f).some(Boolean) ? '<button type="button" class="btn b-ghost sm" data-a="journal-tout">Tout afficher</button>' : ''}</div></form>
    <section class="pn pad"><div class="jl" id="adm-journal">${J.entrees.length ? J.entrees.map(entreeH).join('') : vide('Aucune décision pour ces filtres.')}</div>${J.suite ? '<button class="btn b-white sm adm-suite" data-a="journal-suite">Plus ancien</button>' : ''}</section>`;
  }
};
function journalP(avant) {
  const f = E.journal.f, p = { n: 50 };
  if (f.admin) p.admin = f.admin; if (f.joueur) p.joueur = f.joueur; if (f.action) p.action = f.action;
  if (f.du) p.du = Date.parse(f.du + 'T00:00:00'); if (f.au) p.au = Date.parse(f.au + 'T23:59:59') + 1000; if (avant) p.avant = avant;
  return p;
}
/* une valeur d'un « avant » ou d'un « après » du journal, lisible */
function valeurJ(e, x) {
  if (x == null) return '—';
  const a = e.action, r = e.cible_type === 'reglage' && E.reglages ? regDe(e.cible) : null;
  if (a === 'reglage_modifier') return fmtVal(r || { cle: e.cible }, x.valeur);
  if (a === 'joueur_solde') return x.solde != null ? usd(x.solde) : '—';
  if (a === 'joueur_rang') return rang(x.t, x.d) + (x.xp != null ? ', ' + nb(x.xp) + ' XP' : '');
  if (a === 'joueur_kyc') return x.kyc ? 'validé' : 'non validé';
  if (a === 'joueur_bloquer' || a === 'joueur_debloquer') return x.actif ? (ACCES[x.acces] || x.acces || '') + (x.salon ? ' (' + salonNom(x.salon) + ')' : '') + ' bloqué ' + finBloc(x.fin) : 'ouvert';
  if (a === 'joueur_deconnecter') return 'déconnecté de partout';
  if (a === 'chat_supprimer' || a === 'chat_restaurer') return (x.source === 'masque' ? 'masqué' : 'visible') + (x.texte ? ' : « ' + x.texte + ' »' : '');
  if (a === 'salon_regler') { const v = x.valeur || {}, k = Object.keys(v); return k.length ? k.map(s => salonNom(s) + ' : ' + (v[s].ferme ? 'fermé' : 'lent ' + v[s].lent + ' s')).join(' ; ') : 'aucune règle'; }
  if (a === 'mots_interdits') return nb((x.valeur || []).length) + ' mot(s)' + (x.prives ? ', aussi en privé' : '');
  if (a === 'clan_renommer') return x.nom || '—';
  if (a === 'clan_dissoudre') return x.dissous ? 'dissous' : nb(x.membres) + ' membre(s)';
  if (a === 'annonce_publier' || a === 'annonce_retirer') return x.valeur && x.valeur.t ? '« ' + x.valeur.t.fr + ' »' : 'aucune';
  if (a === 'maintenance') return x.valeur ? 'en cours' : 'non';
  if (a === 'activite_simulee') { const b = x.bots || {}; return (b.actif === false ? 'coupés' : 'en marche') + ', intensité ' + nfx(b.intensite == null ? 1 : b.intensite, 2) + ', bavardage ' + nfx(b.chat == null ? 1 : b.chat, 2); }
  if (/^equipe_/.test(a)) return x.role ? ROLE(x.role) : 'aucun rôle';
  return ancienDetail(x) || JSON.stringify(x).slice(0, 120);
}
/* le détail d'une décision de l'ancien panneau (recopiée dans le journal) */
const ancienDetail = d => { if (!d || typeof d !== 'object') return ''; const m = []; if (d.delta != null) m.push((+d.delta >= 0 ? '+' : '') + d.delta); if (d.motif) m.push('« ' + d.motif + ' »'); if (d.issue) m.push('issue : ' + (d.issue === 'oui' ? 'Oui' : d.issue === 'non' ? 'Non' : d.issue)); if (d.verse != null) m.push(usd(d.verse) + ' versés à ' + (d.joueurs | 0) + ' position(s)'); if (d.t != null) m.push(rang(d.t, d.d)); if (d.ok != null) m.push(d.ok ? 'validé' : 'retiré'); if (d.text) m.push('« ' + d.text + ' »'); if (d.actif != null) m.push((d.actif ? 'actifs' : 'coupés') + ', intensité ' + (d.intensite == null ? 1 : d.intensite) + ', chat ' + (d.chat == null ? 1 : d.chat)); if (d.jours != null) m.push(+d.jours ? d.jours + ' jour(s)' : 'levée'); return m.join(', '); };
function cibleJ(e) {
  if (!e.cible) return '';
  if (e.cible_type === 'joueur' || e.cible_type === 'membre') return lienJoueur(e.cible, null);
  if (e.cible_type === 'reglage') { const r = E.reglages ? regDe(e.cible) : null; return esc(r ? r.libelle : e.cible); }
  if (e.cible_type === 'clan') return 'clan ' + esc(e.cible);
  if (e.cible_type === 'marche') return 'marché ' + esc(e.cible);
  return esc(e.cible);
}
function entreeH(e) {
  const ancienne = e.origine === 'ancien_panneau', avant = ancienne ? null : e.avant, apres = e.apres;
  const diff = ancienne ? `<span class="je-d">${esc(ancienDetail(apres))}</span>` : `<span class="je-d diff-i"><span class="diff-a">${esc(valeurJ(e, avant))}</span><span class="diff-f" aria-hidden="true">→</span><span class="diff-b">${esc(valeurJ(e, apres))}</span></span>`;
  return `<article class="je entree" data-id="${esc(e.id)}"><span class="je-c"><b>${esc(ACTIONS[e.action] || e.action)}</b>${e.cible ? ' <span class="je-cible">' + cibleJ(e) + '</span>' : ''}
   ${diff}${e.motif && !ancienne ? `<small>Motif : « ${esc(e.motif)} »</small>` : ''}
   <small>${esc(quand(e.at))}, par ${esc(e.par || 'automate')}${e.role ? ' (' + esc(ROLE(e.role)) + ')' : ''}${ancienne ? ', ancien panneau' : e.origine === 'migration' ? ', par une migration' : ''}${e.annule_id ? ', annule l’entrée n° ' + esc(e.annule_id) : ''}${e.annulee_par ? ', annulée par l’entrée n° ' + esc(e.annulee_par) : ''}</small></span>
   <span class="je-n"><small class="num">n° ${esc(e.id)}</small>${e.annulable && peut('journal_annuler') ? `<button class="btn b-white sm" data-a="journal-annuler" data-id="${esc(e.id)}">${ic('undo', 14)} Annuler</button>` : ''}</span></article>`;
}
FORMS['journal-filtre'] = async f => { const c = champs(f); Object.assign(E.journal.f, { admin: c.admin || '', action: c.action || '', joueur: (c.joueur || '').trim(), du: c.du || '', au: c.au || '' }); const r = await eq('journal_lire', journalP()); E.journal.entrees = r.entrees || []; E.journal.suite = r.suite || null; };
CLICS['journal-tout'] = async () => { E.journal.f = { admin: '', joueur: '', action: '', du: '', au: '' }; const r = await eq('journal_lire', journalP()); E.journal.entrees = r.entrees || []; E.journal.suite = r.suite || null; };
CLICS['journal-suite'] = async () => { const r = await eq('journal_lire', journalP(E.journal.suite)); E.journal.entrees = E.journal.entrees.concat(r.entrees || []); E.journal.suite = r.suite || null; };
CLICS['journal-annuler'] = async b => {
  const e = E.journal.entrees.concat(E.tete || [], (E.fiche && E.fiche.journal) || []).find(x => String(x.id) === b.dataset.id); if (!e) return;
  const motif = await confirmer({ titre: 'Annuler la décision n° ' + e.id, intro: (ACTIONS[e.action] || e.action) + ', le ' + quand(e.at) + ' par ' + (e.par || 'automate') + '.',
    lignes: [[ACTIONS[e.action] || e.action, valeurJ(e, e.apres), valeurJ(e, e.avant)]], note: 'L’annulation applique l’inverse, avec les mêmes contrôles, et s’écrit à son tour au journal. L’entrée d’origine ne change pas.', bouton: 'Annuler cette décision', danger: true });
  await eq('journal_annuler', { id: e.id, motif });
  if (E.route === 'journal') { const r = await eq('journal_lire', journalP()); E.journal.entrees = r.entrees || []; E.journal.suite = r.suite || null; }
  else if (E.route === 'joueur' && E.fiche) await majFiche(await eq('joueur_fiche', { id: E.fiche.j.id }));
  else if (E.route === 'accueil') await ECRANS.accueil.charger();
  dire('Décision n° ' + e.id + ' annulée.', true);
};
CLICS['journal-csv'] = async () => {
  const r = await eq('journal_csv', journalP());
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' })); a.download = r.nom || 'wimoro-journal.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  dire('Export prêt : ' + nb(r.lignes) + ' ligne(s)' + (r.tronque ? ', limité à 10 000 : resserre les dates pour la suite' : '') + '.', true); throw annule();
};
CLICS['journal-verifier'] = async () => { E.journal.verif = await eq('journal_verifier'); dire(E.journal.verif.ok ? 'Journal intact.' : 'Journal altéré : préviens l’équipe technique.', !!E.journal.verif.ok); };

/* ===================== Mon compte : double authentification ===================== */
ECRANS.compte = {
  titre: 'Mon compte', groupe: 'equipe', icone: 'user', phrase: 'mon rôle, ma double authentification, me déconnecter', acces: () => true,
  charger: async () => { try { const [fac, niv] = await Promise.all([API.mfaFacteurs(), API.mfaNiveau()]); E.mfa = { fac, niv }; } catch (e) { E.mfa = { erreur: erreur(e) }; } },
  rendre: () => {
    const m = E.moi, f = E.mfa || {}, totp = (f.fac && f.fac.totp) || [], aal2 = f.niv && f.niv.currentLevel === 'aal2';
    const ecrans = visibles().filter(k => k !== 'compte').map(k => ECRANS[k].titre);
    return tete('Mon compte', 'Ton accès au panneau.') + `
    <section class="pn pad"><h2 class="h2">${esc(API.email || '')}</h2><p class="sub">Rôle : <b>${m.role === 'administrateur' ? 'administrateur' : 'modérateur'}</b>. Tu as accès à : ${esc(ecrans.join(', '))}.</p></section>
    <section class="pn pad" id="adm-mfa"><h2 class="h2">Double authentification</h2>
     ${f.erreur ? `<p class="limit over">${esc(f.erreur)}</p>` : totp.length ? `<p class="limit" data-v="mfa">Active : un code de ton application est demandé à chaque connexion au panneau.${aal2 ? ' Cette session est validée par le code.' : ''}</p>${aal2 ? '' : '<div class="hbtns"><button class="btn b-pri" data-a="mfa-valider">Saisir mon code</button></div>'}`
       : `<p class="limit over" data-v="mfa">Pas encore activée : ton compte n’est protégé que par son mot de passe.</p><p class="sub">Il te faut une application d’authentification sur ton téléphone. Une fois activée, le panneau la demande à chaque connexion, et le serveur refuse toute action sans elle.</p><div class="hbtns"><button class="btn b-pri" data-a="mfa-activer">Activer la double authentification</button></div>`}
     <p class="adm-note">Code perdu (téléphone changé) : le propriétaire du projet retire l’ancien code depuis le tableau de bord Supabase (docs/EXPLOITATION.md, § 8), puis tu en actives un nouveau ici.</p></section>
    <section class="pn pad adm-session"><h2 class="h2">Session</h2><div class="hbtns"><button class="btn b-white" data-a="deconnexion">${ic('out', 16)} Se déconnecter</button><a class="btn b-ghost" href="index.html">Retour au site</a></div></section>`;
  }
};
CLICS['mfa-activer'] = async () => { if (await mfaFenetreEnrolement()) { await lireMoi(); await ECRANS.compte.charger(); demarrerPanneau(); } throw annule(); };
CLICS['mfa-valider'] = async () => { if (await mfaDemander()) { await lireMoi(); await ECRANS.compte.charger(); } };
