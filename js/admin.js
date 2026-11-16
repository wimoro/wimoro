/* WIMORO — page d'administration (admin.html).
 * Tout passe par une seule fonction du serveur, api_admin(action, paramètres), qui vérifie à chaque appel que le compte
 * connecté est administrateur. Cette page n'a aucun droit par elle-même : sans compte administrateur, elle n'affiche rien.
 * Les actions sensibles (résoudre un marché, suspendre, masquer) demandent un second clic de confirmation. */
'use strict';
(() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(+n || 0);
const nb = n => new Intl.NumberFormat('fr-FR').format(+n || 0);
const quand = ms => ms ? new Date(+ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const RANGS = ['Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Ascendant', 'Immortel', 'Radiant'], DIV = ['I', 'II', 'III'];
const rang = (t, d) => RANGS[t | 0] + ((t | 0) < 8 ? ' ' + DIV[d | 0] : '');
const CATS = ['Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport'];
const ERR = {
  interdit: 'Action réservée aux administrateurs.', motif_requis: 'Indique un motif (3 caractères au moins).', solde_negatif: 'Le solde ne peut pas devenir négatif.',
  montant_invalide: 'Valeur invalide.', joueur_inconnu: 'Joueur introuvable.', rang_invalide: 'Rang invalide.',
  identifiant_invalide: 'Identifiant invalide : lettres minuscules, chiffres et tirets, 3 à 40 caractères.', question_invalide: 'La question doit faire entre 8 et 200 caractères.',
  categorie_invalide: 'Catégorie inconnue.', date_invalide: 'Date de clôture invalide ou passée.', deja_resolu: 'Ce marché est déjà résolu.', marche_inconnu: 'Marché introuvable.',
  issue_invalide: 'Issue invalide.', etat_invalide: 'État invalide.', message_inconnu: 'Message introuvable ou déjà masqué.', session: 'Session expirée : reconnecte-toi.',
  reseau: 'Connexion au serveur impossible.', delai: 'Connexion au serveur impossible.', identifiants: 'Identifiant ou mot de passe incorrect.',
  trop_de_tentatives: 'Trop de tentatives. Réessaie dans quelques minutes.', suspendu: 'Ce compte est suspendu.', exclu: 'Ce compte est en auto-exclusion.'
};
const ACTIONS_L = { solde: 'Solde ajusté', xp: 'XP ajusté', rang: 'Rang donné', kyc: 'KYC', suspension: 'Suspension', suspension_levee: 'Suspension levée', marche_cree: 'Marché créé',
  marche_modifie: 'Marché modifié', marche_ferme: 'Mises fermées', marche_rouvert: 'Mises rouvertes', marche_resolu: 'Marché résolu', message_masque: 'Message masqué', bots: 'Réglage des bots' };
const ONGLETS = [['chiffres', 'Chiffres'], ['joueurs', 'Joueurs'], ['marches', 'Marchés'], ['chat', 'Chat'], ['bots', 'Bots'], ['journal', 'Journal']];
const E = { onglet: 'chiffres', q: '', joueurs: [], fiche: null, marches: [], edition: null, msgs: [], chiffres: null, journal: [] };

const dire = (texte, ok) => { const m = $('#adm-msg'); m.textContent = texte; m.className = ok ? 'ok' : 'ko'; m.hidden = false; clearTimeout(dire.t); dire.t = setTimeout(() => { m.hidden = true; }, 6000); };
const adm = (action, p) => API.call('api_admin', { p_action: action, p: p || {} });
const essayer = async fn => { try { return await fn(); } catch (e) { dire(ERR[e && e.code] || 'Erreur : ' + ((e && e.code) || 'inconnue'), false); return null; } };
const main = () => $('#adm-main');

/* ----- Rendus ----- */
const puceEtat = st => st === 'resolved' ? '<span class="puce">résolu</span>' : st === 'closed' ? '<span class="puce att">mises fermées</span>' : '<span class="puce ok">ouvert</span>';
function vChiffres() {
  const c = E.chiffres; if (!c) return '<p class="vide">Chargement…</p>';
  const cases = [['Inscrits', nb(c.inscrits)], ['Inscrits sur 7 jours', nb(c.inscrits_7j)], ['Actifs sur 24 h', nb(c.actifs_24h)], ['Actifs sur 7 jours', nb(c.actifs_7j)],
    ['Marchés ouverts', nb(c.marches_ouverts)], ['Volume total', usd(c.volume_total)], ['Mises des joueurs, 24 h', usd(c.mises_24h)], ['Positions ouvertes', nb(c.positions)],
    ['Messages de joueurs, 24 h', nb(c.messages_24h)], ['Soldes des joueurs', usd(c.soldes)], ['Bots', nb(c.bots)], ['Base de données', nb(c.base_mo) + ' Mo sur 500']];
  return `<h2>Chiffres</h2><div class="grille">${cases.map(([l, v]) => `<div class="chiffre"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
  <p class="vide">${c.present ? 'Un joueur au moins est en ligne : les bots tournent à plein régime.' : 'Aucun joueur en ligne : les bots sont en veille.'}</p>`;
}
function ligneJoueur(j) {
  return `<div class="rang"><span><b>${esc(j.n)}</b> ${j.bot ? '<span class="puce">bot</span>' : ''} ${j.admin ? '<span class="puce ok">admin</span>' : ''} ${j.susp ? '<span class="puce ko">suspendu</span>' : ''} ${j.excl ? '<span class="puce att">auto-exclu</span>' : ''}
  <small>${esc(j.email || 'sans e-mail')} · ${esc(rang(j.t, j.d))} · ${usd(j.balance)}</small></span><button data-a="fiche" data-id="${esc(j.id)}">Ouvrir</button></div>`;
}
function vFiche() {
  const f = E.fiche; if (!f) return '';
  const j = f.j, id = esc(j.id);
  return `<div class="carte" id="adm-fiche"><h2>${esc(j.n)}</h2>
  <p>${esc(j.email || 'sans e-mail')} · inscrit le ${quand(j.since)} · dernière connexion ${quand(j.vu)}</p>
  <p><b data-v="solde">${usd(j.balance)}</b> · <span data-v="xp">${nb(j.xp)} XP</span> · <span data-v="rang">${esc(rang(j.t, j.d))}</span> · ${nb(j.settled)} paris réglés, ${nb(j.wins)} gagnés ·
   KYC ${j.kyc ? '<span class="puce ok" data-v="kyc">validé</span>' : '<span class="puce" data-v="kyc">non fait</span>'}
   ${j.susp ? `<span class="puce ko" data-v="susp">suspendu ${j.susp === -1 ? 'sans limite' : 'jusqu’au ' + quand(j.susp)}${j.suspMotif ? ' — ' + esc(j.suspMotif) : ''}</span>` : ''}</p>
  <form data-f="solde" data-id="${id}"><div class="ligne"><div class="court"><label for="as-d">Montant (+ ou −)</label><input id="as-d" name="delta" inputmode="decimal" required></div>
   <div><label for="as-m">Motif (obligatoire, journalisé)</label><input id="as-m" name="motif" maxlength="120" required style="width:100%"></div><button class="pr">Ajuster le solde</button></div></form>
  <form data-f="xp" data-id="${id}"><div class="ligne"><div class="court"><label for="ax-d">XP (+ ou −)</label><input id="ax-d" name="delta" inputmode="numeric" required></div><button>Ajuster l’XP</button>
   <div class="court"><label for="ar-t">Rang</label><select id="ar-t" name="rang">${RANGS.map((r, t) => (t < 8 ? DIV.map((x, d) => [t, d]) : [[8, 0]]).map(([a, b]) => `<option value="${a}-${b}"${a === j.t && b === j.d ? ' selected' : ''}>${esc(rang(a, b))}</option>`).join('')).join('')}</select></div>
   <button type="button" data-a="rang" data-id="${id}">Donner ce rang</button></div></form>
  <div class="actions"><button data-a="kyc" data-id="${id}" data-ok="${j.kyc ? 0 : 1}">${j.kyc ? 'Retirer le KYC' : 'Valider le KYC'}</button>
   ${j.susp ? `<button data-a="lever" data-id="${id}">Lever la suspension</button>` : ''}</div>
  ${j.admin || j.bot ? '' : `<form data-f="suspendre" data-id="${id}"><div class="ligne"><div class="court"><label for="au-j">Suspendre</label><select id="au-j" name="jours"><option value="1">1 jour</option><option value="7">7 jours</option><option value="30">30 jours</option><option value="-1">sans limite</option></select></div>
   <div><label for="au-m">Motif</label><input id="au-m" name="motif" maxlength="200" required style="width:100%"></div><button class="danger">Suspendre</button></div></form>`}
  <h2>Dernières opérations</h2>${f.ops.length ? `<table><tr><th>Date</th><th>Type</th><th>Montant</th><th>Solde après</th></tr>${f.ops.map(o => `<tr><td>${quand(o.at)}</td><td>${esc(o.k)}${o.ref ? ' · ' + esc(o.ref) : ''}</td><td class="${+o.amt >= 0 ? 'plus' : 'moins'}">${usd(o.amt)}</td><td>${usd(o.solde)}</td></tr>`).join('')}</table>` : '<p class="vide">Aucune opération.</p>'}
  <h2>Décisions d’administration</h2>${f.journal.length ? f.journal.map(x => `<div class="rang"><span>${esc(ACTIONS_L[x.a] || x.a)}<small>${quand(x.at)} · ${esc(detail(x.d))}</small></span></div>`).join('') : '<p class="vide">Aucune.</p>'}
  </div>`;
}
const detail = d => { if (!d) return ''; const m = []; if (d.delta != null) m.push((+d.delta >= 0 ? '+' : '') + d.delta); if (d.motif) m.push(d.motif); if (d.issue) m.push('issue : ' + d.issue); if (d.verse != null) m.push(usd(d.verse) + ' versés à ' + (d.joueurs | 0) + ' position(s)'); if (d.t != null) m.push(rang(d.t, d.d)); if (d.ok != null) m.push(d.ok ? 'validé' : 'retiré'); if (d.text) m.push('« ' + d.text + ' »'); if (d.actif != null) m.push((d.actif ? 'actifs' : 'coupés') + ', intensité ' + (d.intensite == null ? 1 : d.intensite) + ', chat ' + (d.chat == null ? 1 : d.chat)); return m.join(' · '); };
function vJoueurs() {
  return `<h2>Joueurs</h2><form data-f="chercher"><div class="ligne"><div><label for="aj-q">Pseudo ou e-mail</label><input id="aj-q" name="q" value="${esc(E.q)}" style="width:100%" autocomplete="off"></div><button class="pr">Chercher</button></div></form>
  ${vFiche()}<div class="carte" id="adm-joueurs">${E.joueurs.length ? E.joueurs.map(ligneJoueur).join('') : '<p class="vide">Aucun joueur trouvé.</p>'}</div>`;
}
function vMarches() {
  const m0 = E.edition || {}, neuf = !E.edition;
  return `<h2>Marchés</h2><div class="carte" id="adm-marches">${E.marches.length ? E.marches.map(m => `<div class="rang"><span><b>${esc(m.short || m.id)}</b> ${puceEtat(m.st)}${m.st === 'resolved' ? ` <span class="puce">${m.issue === 'oui' ? 'Oui' : m.issue === 'non' ? 'Non' : esc(m.issue || '')}</span>` : ''}
   <small>${esc(m.id)} · ${esc(m.cat)} · ${m.p == null ? '—' : esc(m.p) + ' %'} · ${nb(m.positions)} position(s) de joueurs</small></span>
   <span class="actions">${m.st === 'resolved' ? '' : `<button data-a="editer" data-id="${esc(m.id)}">Modifier</button>
    <button data-a="etat" data-id="${esc(m.id)}" data-etat="${m.st === 'closed' ? 'open' : 'closed'}">${m.st === 'closed' ? 'Rouvrir les mises' : 'Fermer les mises'}</button>
    <button class="danger" data-a="resoudre" data-id="${esc(m.id)}" data-issue="oui" data-confirme="Confirmer : Oui gagne">Résoudre : Oui</button>
    <button class="danger" data-a="resoudre" data-id="${esc(m.id)}" data-issue="non" data-confirme="Confirmer : Non gagne">Résoudre : Non</button>`}</span></div>`).join('') : '<p class="vide">Aucun marché.</p>'}</div>
  <div class="carte"><h2>${neuf ? 'Créer un marché' : 'Modifier ' + esc(m0.id)}</h2><form data-f="marche">
   <div class="ligne"><div><label for="am-id">Identifiant (dans l’adresse)</label><input id="am-id" name="id" value="${esc(m0.id || '')}" ${neuf ? '' : 'readonly'} pattern="[a-z0-9][a-z0-9\\-]{2,39}" required style="width:100%"></div>
    <div><label for="am-cat">Catégorie</label><select id="am-cat" name="cat">${CATS.map(c => `<option${c === m0.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
   <label for="am-q">Question</label><input id="am-q" name="q" value="${esc(m0.q || '')}" minlength="8" maxlength="200" required style="width:100%">
   <div class="ligne"><div><label for="am-s">Titre court</label><input id="am-s" name="short" value="${esc(m0.short || '')}" maxlength="60" style="width:100%"></div>
    <div class="court"><label for="am-d">Clôture</label><input id="am-d" name="date" type="date" value="${esc(m0.date || '')}" required></div>
    <div class="court"><label for="am-t">Heure</label><input id="am-t" name="time" type="time" value="${esc(m0.time || '23:59')}"></div></div>
   <div class="ligne"><div class="court"><label for="am-p">Valeur de référence (%)</label><input id="am-p" name="p" inputmode="decimal" value="${esc(m0.ref == null ? 50 : m0.ref)}" required></div>
    <div class="court"><label for="am-h">Activité des bots (0,5 à 4)</label><input id="am-h" name="heat" inputmode="decimal" value="${esc(m0.heat == null ? 1.5 : m0.heat)}" required></div></div>
   <label for="am-r">Règles de résolution</label><textarea id="am-r" name="rules" maxlength="600">${esc(m0.rules || '')}</textarea>
   <div class="actions" style="margin-top:10px"><button class="pr">${neuf ? 'Créer le marché' : 'Enregistrer'}</button>${neuf ? '' : '<button type="button" data-a="annuler-edition">Annuler</button>'}</div></form></div>`;
}
/* une mise partagée n'a pas de texte : on dit ce que montre sa carte */
const texteMsg = m => m.k === 'evt' && m.bet ? (m.bet.code === 'guerre' ? `Guerre de clans déclarée contre le clan ${m.bet.foe} (buy-in ${Number(m.bet.k) || 0} $)` : `Appel de clan : marché ${m.bet.m}, côté ${m.bet.s === 'oui' ? 'Oui' : 'Non'}`)
  : m.k === 'ana' && m.bet ? `Analyse partagée (marché ${m.bet.m}, ${Number(m.bet.ni) || 0} indicateur(s), ${Number(m.bet.nd) || 0} tracé(s))${m.text ? ' : ' + m.text : ''}` : m.k === 'bet' && m.bet ? `Mise partagée : ${Number(m.bet.amt) || 0} $ sur ${m.bet.s === 'oui' ? 'Oui' : 'Non'} (marché ${m.bet.m})` : m.text;
function vChat() {
  return `<h2>Chat : derniers messages des joueurs</h2><div class="carte" id="adm-chat">${E.msgs.length ? E.msgs.map(m => `<div class="rang"><span><b>${esc(m.n)}</b> <span class="puce">${esc(m.room)}</span><br>${esc(texteMsg(m))}<small>${quand(m.at)}</small></span>
   <button class="danger" data-a="masquer" data-id="${esc(m.id)}" data-confirme="Confirmer : masquer">Masquer</button></div>`).join('') : '<p class="vide">Aucun message de joueur.</p>'}</div>`;
}
function vBots() {
  const b = (E.chiffres && E.chiffres.bots_cfg) || {}, actif = b.actif !== false;
  return `<h2>Bots</h2><div class="carte"><p>Les 10 000 bots animent les marchés et le chat. État : <b data-v="bots">${actif ? 'en marche' : 'coupés'}</b>.</p>
  <form data-f="bots"><div class="ligne"><div class="court"><label for="ab-i">Intensité sur les marchés (0 à 3)</label><input id="ab-i" name="intensite" inputmode="decimal" value="${esc(b.intensite == null ? 1 : b.intensite)}" required></div>
   <div class="court"><label for="ab-c">Bavardage dans le chat (0 à 3)</label><input id="ab-c" name="chat" inputmode="decimal" value="${esc(b.chat == null ? 1 : b.chat)}" required></div><button class="pr">Enregistrer</button></div></form>
  <div class="actions"><button data-a="bots-actif" data-v="${actif ? 0 : 1}" class="${actif ? 'danger' : 'pr'}">${actif ? 'Couper les bots' : 'Remettre les bots en marche'}</button></div></div>`;
}
function vJournal() {
  return `<h2>Journal des décisions</h2><div class="carte" id="adm-journal">${E.journal.length ? E.journal.map(x => `<div class="rang"><span>${esc(ACTIONS_L[x.a] || x.a)}${x.cible ? ' · ' + esc(x.cible) : ''}<small>${quand(x.at)} · par ${esc(x.par || '?')}${detail(x.d) ? ' · ' + esc(detail(x.d)) : ''}</small></span></div>`).join('') : '<p class="vide">Rien pour l’instant.</p>'}</div>`;
}
const VUES = { chiffres: vChiffres, joueurs: vJoueurs, marches: vMarches, chat: vChat, bots: vBots, journal: vJournal };
function rendre() {
  menu();
  main().innerHTML = VUES[E.onglet]();
}

/* ----- Chargements ----- */
const CHARGER = {
  chiffres: async () => { E.chiffres = await adm('chiffres'); },
  joueurs: async () => { E.joueurs = (await adm('joueurs', { q: E.q })).joueurs; },
  marches: async () => { E.marches = (await adm('marches')).marches; },
  chat: async () => { E.msgs = (await adm('chat')).msgs; },
  bots: async () => { E.chiffres = await adm('chiffres'); },
  journal: async () => { E.journal = (await adm('journal')).journal; }
};
function menu() { $('#adm-nav').innerHTML = ONGLETS.map(([k, l]) => `<button data-onglet="${k}" aria-current="${k === E.onglet}">${l}</button>`).join(''); }
async function ouvrir(onglet) {
  E.onglet = onglet; menu(); main().innerHTML = '<p class="vide">Chargement…</p>';
  await essayer(CHARGER[onglet]);
  if (E.onglet === onglet) rendre();                                 // dessiné une seule fois, données chargées : aucune saisie n'est effacée
}

/* ----- Actions ----- */
const champs = f => Object.fromEntries(new FormData(f).entries());
const FORMS = {
  chercher: async f => { E.q = champs(f).q.trim(); E.fiche = null; await CHARGER.joueurs(); },
  solde: async f => { const c = champs(f); E.fiche = await adm('solde', { id: f.dataset.id, delta: String(c.delta).replace(',', '.'), motif: c.motif }); dire('Solde ajusté : ' + usd(E.fiche.j.balance), true); await CHARGER.joueurs(); },
  xp: async f => { E.fiche = await adm('xp', { id: f.dataset.id, delta: champs(f).delta }); dire('XP ajusté.', true); },
  suspendre: async f => { const c = champs(f); E.fiche = await adm('suspendre', { id: f.dataset.id, jours: c.jours, motif: c.motif }); dire('Compte suspendu.', true); await CHARGER.joueurs(); },
  marche: async f => { const c = champs(f); c.p = String(c.p).replace(',', '.'); c.heat = String(c.heat).replace(',', '.'); E.marches = (await adm('marche', c)).marches; E.edition = null; dire('Marché enregistré.', true); },
  bots: async f => { const c = champs(f); E.chiffres = await adm('bots', { intensite: String(c.intensite).replace(',', '.'), chat: String(c.chat).replace(',', '.') }); dire('Réglage des bots enregistré.', true); }
};
const CLICS = {
  fiche: async b => { E.fiche = await adm('joueur', { id: b.dataset.id }); },
  rang: async b => { const [t, d] = $('#ar-t').value.split('-'); E.fiche = await adm('rang', { id: b.dataset.id, t, d }); dire('Rang donné : ' + rang(E.fiche.j.t, E.fiche.j.d), true); },
  kyc: async b => { E.fiche = await adm('kyc', { id: b.dataset.id, ok: b.dataset.ok === '1' }); dire(E.fiche.j.kyc ? 'KYC validé.' : 'KYC retiré.', true); },
  lever: async b => { E.fiche = await adm('suspendre', { id: b.dataset.id, jours: 0 }); dire('Suspension levée.', true); await CHARGER.joueurs(); },
  editer: async b => { E.edition = E.marches.find(m => m.id === b.dataset.id) || null; },
  'annuler-edition': async () => { E.edition = null; },
  etat: async b => { E.marches = (await adm('marche_etat', { id: b.dataset.id, etat: b.dataset.etat })).marches; dire(b.dataset.etat === 'closed' ? 'Mises fermées.' : 'Mises rouvertes.', true); },
  resoudre: async b => { const r = await adm('resoudre', { id: b.dataset.id, issue: b.dataset.issue }); E.marches = r.marches; dire('Marché résolu : ' + usd(r.reglement.verse) + ' versés à ' + r.reglement.joueurs + ' position(s).', true); },
  masquer: async b => { E.msgs = (await adm('masquer', { id: b.dataset.id })).msgs; dire('Message masqué.', true); },
  'bots-actif': async b => { E.chiffres = await adm('bots', { actif: b.dataset.v === '1' }); dire(b.dataset.v === '1' ? 'Bots remis en marche.' : 'Bots coupés.', true); }
};
let occupe = false;
async function agir(fn, cible) {
  if (occupe) return; occupe = true;
  try { await essayer(() => fn(cible)); } finally { occupe = false; }
  if (!$('#adm-nav').hidden) rendre();                              // un compte non administrateur ne voit jamais les onglets
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-onglet]'); if (o) { ouvrir(o.dataset.onglet); return; }
  const b = e.target.closest('[data-a]'); if (!b || !CLICS[b.dataset.a]) return;
  if (b.dataset.confirme && !b.dataset.sur) {                         // premier clic : on demande confirmation, sur le bouton lui-même
    b.dataset.sur = '1'; b.dataset.libelle = b.textContent; b.textContent = b.dataset.confirme;
    setTimeout(() => { if (b.isConnected && b.dataset.sur) { delete b.dataset.sur; b.textContent = b.dataset.libelle; } }, 5000);
    return;
  }
  agir(CLICS[b.dataset.a], b);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-f]'); if (!f) return;
  e.preventDefault();
  if (f.dataset.f === 'connexion') { connecter(f); return; }
  if (FORMS[f.dataset.f]) agir(FORMS[f.dataset.f], f);
});

/* ----- Démarrage : session, puis contrôle « administrateur » par le serveur ----- */
function vConnexion(note) {
  main().innerHTML = `<div class="carte" style="max-width:420px;margin:30px auto"><h2>Connexion</h2><p>${esc(note || 'Connecte-toi avec un compte administrateur.')}</p>
  <form data-f="connexion"><label for="ac-i">Pseudo ou e-mail</label><input id="ac-i" name="i" autocomplete="username" required style="width:100%">
  <label for="ac-p" style="margin-top:10px">Mot de passe</label><input id="ac-p" name="p" type="password" autocomplete="current-password" required style="width:100%">
  <div class="actions" style="margin-top:12px"><button class="pr">Se connecter</button></div></form></div>`;
}
async function connecter(f) {
  const c = champs(f);
  const ok = await essayer(async () => { await API.signIn(c.i.trim(), c.p); return true; });
  if (ok) location.reload();
}
async function demarrer() {
  const mode = await API.pret;
  if (mode !== 'serveur') { vConnexion(); return; }
  let moi;
  try { moi = await adm('moi'); }
  catch (e) { if (e.code === 'session') { await API.signOut().catch(() => {}); vConnexion('Session expirée : reconnecte-toi.'); } else main().innerHTML = `<div class="carte"><h2>Indisponible</h2><p>${esc(ERR[e.code] || 'Le serveur ne répond pas. Réessaie dans un instant.')}</p></div>`; return; }
  $('#adm-qui').textContent = API.email || '';
  if (!moi.admin) {
    main().innerHTML = `<div class="carte" id="adm-refus"><h2>Accès réservé</h2><p>Ce compte n’est pas administrateur. Cette page ne lui montre rien et le serveur lui refuse toute action.</p>
    <div class="actions"><button data-a="deconnexion">Changer de compte</button></div></div>`;
    return;
  }
  $('#adm-nav').hidden = false;
  ouvrir('chiffres');
}
CLICS.deconnexion = async () => { await API.signOut().catch(() => {}); location.reload(); };
demarrer();
})();
