/* WIMORO — panneau d'administration : les réglages (écrans « Frais et argent » et « Jeux », réglages de l'équipe).
 *
 * Les réglages viennent du serveur (reglages_lire) : nom, phrase d'explication, valeur, valeur par défaut (la constante
 * d'avant), bornes, « pas encore appliqué ». Un changement passe par reglage_modifier : le serveur contrôle le type et les
 * bornes, l'écrit au journal, et le pousse aussitôt aux joueurs connectés (sujet « site », événement « cfg »).
 * L'exemple chiffré des frais se calcule avec le moteur du site (js/engine.js) : même formule que le serveur (wm.fee_rate). */
'use strict';

/* ----- Unité d'affichage et de saisie de chaque réglage (le serveur stocke 0,05 pour 5 %) ----- */
function unite(cle) {
  if (/^frais\.taux\.|^frais\.(blitz|combines|stacks|guerres)\.commission$|^frais\.copies\.part_copie$|^frais\.(depots|retraits)_fiat\.|^eclair\.be_marge$/.test(cle)) return 'pct';
  if (/^frais\.(k|eclair\.k|remise_rang|serie\.facteur)$|^combines\.encaisse_decote$|^eclair\.be_(min|max|plafond)$/.test(cle)) return 'mult';
  if (/^depots\.min\./.test(cle)) return 'coin';
  if (cle === 'duels.expiration_h') return 'h';
  if (/(max_ouverts|max_actifs|selections_max|max_actives)$/.test(cle)) return 'n';
  return 'usd';
}
const monnaie = cle => cle.split('.').pop().toUpperCase();
/* une valeur telle qu'on la lit (« 7 % », « × 0,70 », « 10,00 $ », « aucun plafond ») */
function fmtVal(r, v) {
  if (v === null || v === undefined) return r && r.facultatif ? 'aucun plafond' : '—';
  if (r && r.type === 'booleen') return v ? 'activé' : 'désactivé';
  if (r && r.type === 'liste') return Array.isArray(v) ? v.map(x => usd0(x)).join(', ') : '—';
  if (r && r.type === 'json') return Array.isArray(v) ? v.length + ' élément(s)' : '—';
  const u = unite(r ? r.cle : '');
  if (u === 'pct') return nfx(v * 100, 2) + NB + '%';
  if (u === 'mult') return '×' + NB + nfx(v, 3);
  if (u === 'coin') return nfx(v, 6) + NB + monnaie(r.cle);
  if (u === 'h') return nfx(v, 0) + NB + 'h';
  if (u === 'n') return nfx(v, 0);
  return usd0(v);
}
const suffixe = r => r.type === 'booleen' ? '' : r.type === 'liste' ? '$' : ({ pct: '%', mult: '×', coin: monnaie(r.cle), h: 'h', n: '', usd: '$' })[unite(r.cle)];
/* valeur du serveur → texte du champ de saisie, et retour */
function versSaisie(r, v) {
  if (v === null || v === undefined) return '';
  if (r.type === 'liste') return (v || []).map(x => nfx(x, 2)).join(' ; ');
  const u = unite(r.cle);
  return nfx(u === 'pct' ? v * 100 : v, u === 'pct' ? 4 : 6).replace(/ | /g, ' ');
}
function depuisSaisie(r, s) {
  if (r.type === 'booleen') return s === 'true';
  if (r.type === 'liste') { const L = String(s).split(/[;\n]/).map(x => x.trim()).filter(Boolean).map(lire); return L.some(isNaN) ? NaN : L; }
  if (String(s).trim() === '') return r.facultatif ? null : NaN;
  const n = lire(s); if (isNaN(n)) return NaN;
  return unite(r.cle) === 'pct' ? Math.round(n * 1e6) / 1e8 : n;
}
function bornesTxt(r) {
  if (r.type === 'booleen' || r.min == null && r.max == null) return '';
  const a = r.min != null ? fmtVal(r.type === 'liste' ? { cle: 'x' } : r, +r.min) : null, b = r.max != null ? fmtVal(r.type === 'liste' ? { cle: 'x' } : r, +r.max) : null;
  return (r.type === 'liste' ? 'Chaque montant entre ' : 'Entre ') + a + ' et ' + b + (r.facultatif ? ' ; vide : aucun plafond' : '') + (r.type === 'entier' ? ', nombre entier' : '');
}
/* contrôle à l'écran (le serveur refait le même) : un message clair avant même d'appeler */
function controle(r, v) {
  if (r.type === 'booleen') return '';
  if (r.type === 'liste') {
    if (!Array.isArray(v) || !v.length || v.length > 10 || v.some(x => typeof x !== 'number' || isNaN(x))) return 'Saisis de 1 à 10 montants, séparés par des points-virgules.';
    if (v.some(x => (r.min != null && x < +r.min) || (r.max != null && x > +r.max))) return 'Un montant sort des bornes : ' + bornesTxt(r) + '.';
    if (new Set(v).size !== v.length) return 'Chaque montant ne doit apparaître qu’une fois.';
    return '';
  }
  if (v === null) return r.facultatif ? '' : 'Ce réglage ne peut pas rester vide.';
  if (typeof v !== 'number' || isNaN(v)) return 'Saisis un nombre, par exemple ' + versSaisie(r, r.defaut ?? r.min ?? 1) + '.';
  if ((r.min != null && v < +r.min - 1e-12) || (r.max != null && v > +r.max + 1e-12)) return 'Valeur hors des bornes : ' + bornesTxt(r) + '.';
  if (r.type === 'entier' && v !== Math.trunc(v)) return 'Saisis un nombre entier.';
  return '';
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ----- Les groupes de réglages, écran par écran (un réglage non classé ici apparaît dans « Autres réglages ») ----- */
const CATS_MARCHES = [['Crypto', 'crypto'], ['Football', 'football'], ['Politique', 'politique'], ['Tech et IA', 'tech_ia'], ['Économie', 'economie'], ['Culture', 'culture'], ['Météo', 'meteo'], ['Sport', 'sport'], ['Sport live', 'sport_live'], ['Bourse', 'bourse'], ['Matières', 'matieres'], ['Devises', 'devises']];
const GROUPES_REG = {
  frais: [
    { id: 'g-frais-paris', titre: 'Frais des paris sur les marchés', phrase: 'Ce que Wimoro prélève sur chaque pari : le barème de la catégorie du marché, multiplié par le multiplicateur, avec une remise pour le rang Diamant. Revendre et encaisser restent gratuits.', exemple: true,
      cles: ['frais.k', 'frais.remise_rang', ...CATS_MARCHES.map(c => 'frais.taux.' + c[1]), 'frais.taux.defaut'] },
    { id: 'g-mises', titre: 'Mises sur les marchés', phrase: 'La plus petite et la plus grosse mise acceptées sur un marché.', cles: ['paris.mise_min', 'paris.mise_max'] },
    { id: 'g-depots', titre: 'Dépôts', phrase: 'Les bornes des dépôts et ce que coûte chaque moyen de paiement.', cles: ['depots.fiat_min', 'depots.fiat_max', 'depots.max', 'depots.max_jour', 'depots.min.usdc', 'depots.min.usdt', 'depots.min.eth', 'depots.min.btc', 'depots.min.sol', 'frais.depots_fiat.card', 'frais.depots_fiat.bank', 'frais.depots_fiat.paypal'] },
    { id: 'g-retraits', titre: 'Retraits', phrase: 'Les bornes des retraits et leurs frais, par réseau et par moyen de paiement.', cles: ['retraits.min', 'retraits.max', 'frais.retraits.base', 'frais.retraits.ethereum', 'frais.retraits.arbitrum', 'frais.retraits.polygon', 'frais.retraits.solana', 'frais.retraits_fiat.card', 'frais.retraits_fiat.bank', 'frais.retraits_fiat.paypal'] },
    { id: 'g-parrainage', titre: 'Parrainage', phrase: 'Le cadeau du filleul à son inscription, et celui du parrain au premier pari de son filleul.', cles: ['parrainage.bonus'] },
    { id: 'g-clans', titre: 'Clans', phrase: 'Ce que coûtent un clan et une guerre de clans.', cles: ['clans.frais_creation', 'clans.guerre_buyin', 'frais.guerres.commission'] }
  ],
  jeux: [
    { id: 'g-eclair', titre: 'Pari éclair', phrase: 'Les manches de 45 secondes : bornes des mises, frais et cote du break even.', cles: ['eclair.mise_min', 'eclair.mise_max', 'frais.eclair.k', 'eclair.be_marge', 'eclair.be_min', 'eclair.be_max', 'eclair.be_plafond'] },
    { id: 'g-serie', titre: 'La Série', phrase: 'Les mises de départ proposées et les frais de chaque manche.', cles: ['serie.mises', 'frais.serie.facteur'] },
    { id: 'g-blitz', titre: 'Blitz Royale', phrase: 'Le prix d’entrée, celui du Blitz de 21 h, le rachat et le prélèvement sur la cagnotte.', cles: ['blitz.buyin', 'blitz.buyin_prime', 'blitz.rachat', 'frais.blitz.commission'] },
    { id: 'g-duels', titre: 'Duels entre amis', phrase: 'Les mises d’un duel, son délai d’acceptation et le nombre de duels en attente.', cles: ['duels.mise_min', 'duels.mise_max', 'duels.expiration_h', 'duels.max_ouverts'] },
    { id: 'g-stacks', titre: 'Duels de stack', phrase: 'L’entrée d’un duel de stack, le nombre en cours et la part gardée par Wimoro.', cles: ['stacks.buyin_min', 'stacks.buyin_max', 'stacks.max_actifs', 'frais.stacks.commission'] },
    { id: 'g-combines', titre: 'Paris combinés', phrase: 'Les mises, le gain maximum, l’encaissement anticipé, le nombre de sélections et les frais.', cles: ['combines.mise_min', 'combines.mise_max', 'combines.gain_max', 'combines.encaisse_decote', 'combines.selections_max', 'frais.combines.commission'] },
    { id: 'g-copies', titre: 'Copie de joueurs', phrase: 'Le budget et la mise d’une copie, le nombre de copies et la part reversée au joueur copié.', cles: ['copies.budget_min', 'copies.mise_min', 'copies.max_actives', 'frais.copies.part_copie'] }
  ]
};
const CLES_ECRAN = { equipe: ['equipe.mfa_obligatoire', 'equipe.moderateur_solde_max'] };
const regDe = cle => (E.reglages || []).find(r => r.cle === cle) || null;
const classees = () => new Set([...Object.values(GROUPES_REG).flat().flatMap(g => g.cles), ...CLES_ECRAN.equipe]);
/* les réglages que le serveur connaît mais que ce panneau ne range nulle part (un lot futur) : visibles quand même */
const autres = () => { const c = classees(); return (E.reglages || []).filter(r => !c.has(r.cle) && !r.dedie && r.type !== 'json'); };
async function prechargerReglages() { try { const r = await eq('reglages_lire'); E.reglages = r.reglages || []; E.bots = r.bots || {}; } catch (e) { /* l'écran les redemandera */ } }
/* la recherche du bandeau : chaque réglage mène à son écran, à sa ligne */
function reglagesIndex() {
  if (!E.reglages) return [];
  const ecranDe = cle => GROUPES_REG.jeux.some(g => g.cles.includes(cle)) ? 'jeux' : CLES_ECRAN.equipe.includes(cle) ? 'equipe' : /^chat\./.test(cle) ? 'chat' : /^site\./.test(cle) ? 'site' : 'frais';
  return E.reglages.map(r => ({ g: 'Réglages', t: r.libelle, s: ECRANS[ecranDe(r.cle)] ? ECRANS[ecranDe(r.cle)].titre : '', cle: r.cle + ' ' + r.explication, h: '#' + ecranDe(r.cle) + '/' + r.cle }));
}

/* ----- Une ligne de réglage : nom, explication, valeur, défaut, « Revenir au défaut », modification ----- */
function regLigneH(r) {
  if (!r) return '';
  const ed = E.edition === r.cle, defaut = egal(r.valeur, r.defaut), inactif = !r.applique, dedie = !!r.dedie || r.type === 'json';
  const meta = r.maj_par || r.maj_at ? `<small class="reg-maj">Modifié le ${esc(quand(r.maj_at))}</small>` : '';
  return `<div class="reg${ed ? ' ouvert' : ''}${inactif ? ' inactif' : ''}" id="r-${esc(r.cle)}" data-cle="${esc(r.cle)}">
   <div class="reg-t"><b>${esc(r.libelle)}</b>${inactif ? ' <span class="puce att">pas encore appliqué</span>' : ''}<p>${esc(r.explication)}</p>
    <dl class="reg-vals"><div><dt>Valeur</dt><dd class="num" data-v="valeur">${esc(fmtVal(r, r.valeur))}</dd></div><div><dt>Par défaut</dt><dd class="num">${esc(fmtVal(r, r.defaut))}</dd></div></dl>${meta}</div>
   <div class="reg-a">${dedie ? '<small class="reg-maj">Se règle dans son écran</small>' : inactif ? '<small class="reg-maj">Le serveur ne l’applique pas encore : changement impossible pour l’instant</small>'
     : `<button class="btn b-white sm" data-a="reg-modifier" data-cle="${esc(r.cle)}"${ed ? ' hidden' : ''}>Modifier</button><button class="btn b-ghost sm" data-a="reg-defaut" data-cle="${esc(r.cle)}"${defaut ? ' disabled title="C’est déjà la valeur par défaut"' : ''}>Revenir au défaut</button>`}</div>
   ${ed ? regEditeurH(r) : ''}</div>`;
}
function regEditeurH(r) {
  const b = E.brouillons[r.cle], v = b === undefined ? r.valeur : b, id = 'ed-' + r.cle.replace(/\W/g, '-');
  const champ = r.type === 'booleen'
    ? `<select id="${id}" name="valeur"><option value="true"${v ? ' selected' : ''}>Activé</option><option value="false"${v ? '' : ' selected'}>Désactivé</option></select>`
    : `<span class="reg-champ"><input id="${id}" name="valeur" value="${esc(versSaisie(r, v))}" inputmode="${r.type === 'liste' ? 'text' : 'decimal'}" autocomplete="off"${r.facultatif ? ' placeholder="aucun plafond"' : ''}><span>${esc(suffixe(r))}</span></span>`;
  return `<form class="reg-ed" data-f="reglage" data-cle="${esc(r.cle)}" data-saisie="reglage" novalidate>
   <div class="field"><label for="${id}">Nouvelle valeur</label>${champ}<small class="reg-bornes">${esc(bornesTxt(r))}</small><p class="err" data-err></p></div>
   <div class="hbtns"><button class="btn b-pri">Vérifier et enregistrer</button><button type="button" class="btn b-ghost" data-a="reg-fermer" data-cle="${esc(r.cle)}">Annuler</button></div></form>`;
}
function groupeH(g) {
  const L = g.cles.map(regDe).filter(Boolean);
  if (!L.length) return '';
  return `<section class="pn pad adm-groupe" id="${g.id}"><h2 class="h2">${esc(g.titre)}</h2><p class="sub">${esc(g.phrase)}</p>${g.exemple ? exempleH() : ''}<div class="regs">${L.map(regLigneH).join('')}</div></section>`;
}

/* ----- L'exemple chiffré : « sur une mise de 100 $, le joueur paie … », aujourd'hui et avec le brouillon ----- */
function baremeDe(over) {
  const v = cle => { const r = regDe(cle); const b = over ? E.brouillons[cle] : undefined; return typeof b === 'number' ? b : r && typeof r.valeur === 'number' ? r.valeur : null; };
  const reg = JSON.parse(JSON.stringify(ENG_REG_DEF));
  if (v('frais.k') != null) reg.k = v('frais.k'); if (v('frais.remise_rang') != null) reg.remise = v('frais.remise_rang'); if (v('frais.taux.defaut') != null) reg.defaut = v('frais.taux.defaut');
  for (const [cat, k] of CATS_MARCHES) if (v('frais.taux.' + k) != null) reg.taux[cat] = v('frais.taux.' + k);
  return reg;
}
function exempleCalc(over) {
  const x = E.exemple, reg = baremeDe(over), th = regRate(reg, x.cat, x.diamant);
  const m = { id: 'exemple', cat: x.cat, p: x.prix, vol: 250000 };                                   // un marché ordinaire : 250 000 $ de volume
  const q = quoteBuy(m, 'oui', x.mise, x.diamant, th);
  return { fee: q.fee, sh: q.sh, taux: th, part: x.mise > 0 ? q.fee / x.mise : 0 };
}
function exempleH() {
  const x = E.exemple, a = exempleCalc(false), brouillon = Object.keys(E.brouillons).some(k => /^frais\.(k|remise_rang|taux\.)/.test(k)), b = brouillon ? exempleCalc(true) : null;
  return `<div class="exemple" data-saisie="exemple" aria-live="polite"><p class="exemple-t">Exemple chiffré</p>
   <div class="exemple-c"><div class="field"><label for="ex-cat">Catégorie du marché</label><select id="ex-cat" name="cat">${CATS_MARCHES.map(([c]) => `<option${c === x.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label for="ex-mise">Mise</label><span class="reg-champ"><input id="ex-mise" name="mise" value="${esc(nfx(x.mise, 2))}" inputmode="decimal"><span>$</span></span></div>
    <div class="field"><label for="ex-prix">Chance de Oui</label><span class="reg-champ"><input id="ex-prix" name="prix" value="${esc(nfx(x.prix, 1))}" inputmode="decimal"><span>%</span></span></div>
    <label class="chk"><input type="checkbox" name="diamant"${x.diamant ? ' checked' : ''}> Joueur du rang Diamant ou au-dessus</label></div>
   <p class="exemple-r" data-v="exemple">Sur une mise de <b>${esc(usd0(x.mise))}</b> sur Oui à ${esc(nfx(x.prix, 1))}${NB}% (${esc(x.cat)}), le joueur paie <b>${esc(usd(a.fee))}</b> de frais, soit ${esc(nfx(a.part * 100, 2))}${NB}% de sa mise, et reçoit ${esc(nfx(a.sh, 2))} parts.</p>
   ${b ? `<p class="exemple-r exemple-b" data-v="exemple-brouillon">Avec la nouvelle valeur : <b>${esc(usd(b.fee))}</b> de frais (${esc(signe(b.fee - a.fee))}).</p>` : ''}</div>`;
}
const exempleMaj = () => { const el = $('.exemple'); if (el) { const n = document.createElement('div'); n.innerHTML = exempleH(); el.replaceWith(n.firstElementChild); } };

/* ----- Écrans ----- */
async function chargerReglages() { const r = await eq('reglages_lire'); E.reglages = r.reglages || []; E.bots = r.bots || {}; }
function vReglages(ecran, titre, phrase) {
  const G = GROUPES_REG[ecran], extra = ecran === 'frais' ? autres() : [];
  return `<header class="adm-tete"><div><h1 class="ptitle">${titre}</h1><p class="plead">${phrase}</p></div></header>
  <nav class="chips adm-ancres" aria-label="Aller à un groupe">${G.filter(g => g.cles.some(regDe)).map(g => `<a class="chip" href="#${ecran}/${g.id}">${esc(g.titre)}</a>`).join('')}</nav>
  ${G.map(groupeH).join('')}
  ${extra.length ? `<section class="pn pad adm-groupe" id="g-autres"><h2 class="h2">Autres réglages</h2><p class="sub">Réglages ajoutés au serveur après ce panneau.</p><div class="regs">${extra.map(regLigneH).join('')}</div></section>` : ''}`;
}
ECRANS.frais = { titre: 'Frais et argent', groupe: 'reglages', icone: 'percent', phrase: 'frais des paris, mises, dépôts, retraits, parrainage, clans', acces: () => peut('reglages_lire'), charger: chargerReglages,
  rendre: () => vReglages('frais', 'Frais et argent', 'Chaque changement vaut dès le pari suivant, et l’aperçu du ticket des joueurs connectés se met à jour aussitôt. Il est écrit au journal et s’annule depuis le journal.') };
ECRANS.jeux = { titre: 'Jeux', groupe: 'reglages', icone: 'bolt', phrase: 'pari éclair, La Série, Blitz, duels, stacks, combinés, copies', acces: () => peut('reglages_lire'), charger: chargerReglages,
  rendre: () => vReglages('jeux', 'Jeux', 'Les règles des jeux, toujours dans des bornes sûres. Un réglage marqué « pas encore appliqué » est calculé par le moteur éclair avec ses propres valeurs : il se branchera avec la prochaine version du pari éclair.') };

/* ----- Actions ----- */
CLICS['reg-modifier'] = async b => { E.edition = b.dataset.cle; delete E.brouillons[b.dataset.cle]; };
CLICS['reg-fermer'] = async b => { delete E.brouillons[b.dataset.cle]; E.edition = null; };
CLICS['reg-defaut'] = async b => {
  const r = regDe(b.dataset.cle); if (!r) return;
  await enregistrerReglage(r, r.defaut, 'Revenir à la valeur par défaut');
};
FORMS.reglage = async f => {
  const r = regDe(f.dataset.cle), err = f.querySelector('[data-err]'), v = depuisSaisie(r, f.elements.valeur.value), msg = controle(r, v);
  if (msg) { err.textContent = msg; f.elements.valeur.focus(); throw annule(); }
  if (egal(v, r.valeur)) { err.textContent = ERR.reglage_inchange; throw annule(); }
  await enregistrerReglage(r, v, 'Modifier un réglage');
};
async function enregistrerReglage(r, v, titre) {
  const lignes = [[r.libelle, fmtVal(r, r.valeur), fmtVal(r, v)]];
  if (/^frais\.(k|remise_rang|taux\.)/.test(r.cle)) {                                                   // l'effet sur l'exemple chiffré, avant de valider
    const avant = exempleCalc(false), b0 = E.brouillons[r.cle]; E.brouillons[r.cle] = v; const apres = exempleCalc(true); if (b0 === undefined) delete E.brouillons[r.cle]; else E.brouillons[r.cle] = b0;
    lignes.push(['Frais sur ' + usd0(E.exemple.mise) + ' (' + E.exemple.cat + ')', usd(avant.fee), usd(apres.fee)]);
  }
  const motif = await confirmer({ titre, intro: 'Le serveur l’applique dès l’action suivante des joueurs, et l’écran des joueurs connectés se met à jour sans rechargement.', lignes,
    note: 'Écrit au journal avec ton nom ; il s’annule depuis le journal.', bouton: 'Enregistrer' });
  const rep = await eq('reglage_modifier', { cle: r.cle, valeur: v, motif });
  const i = E.reglages.findIndex(x => x.cle === r.cle); if (i >= 0 && rep.reglage) E.reglages[i] = rep.reglage;
  delete E.brouillons[r.cle]; E.edition = null;
  dire('Réglage enregistré : ' + r.libelle + ', ' + fmtVal(r, v) + '.', true);
}
SAISIES.reglage = (t, f) => {
  const r = regDe(f.dataset.cle); if (!r) return;
  const v = depuisSaisie(r, t.value), err = f.querySelector('[data-err]');
  err.textContent = t.value.trim() === '' && !r.facultatif ? '' : controle(r, v);
  if (typeof v === 'number' && !isNaN(v)) E.brouillons[r.cle] = v; else delete E.brouillons[r.cle];
  if (/^frais\.(k|remise_rang|taux\.)/.test(r.cle)) exempleMaj();
};
SAISIES.exemple = (t, box) => {
  const x = E.exemple;
  if (t.name === 'cat') x.cat = t.value;
  else if (t.name === 'diamant') x.diamant = t.checked;
  else { const n = lire(t.value); if (isNaN(n)) return; if (t.name === 'mise' && n > 0 && n <= 1e7) x.mise = n; if (t.name === 'prix' && n >= 1 && n <= 99) x.prix = n; }
  const r = box.querySelector('[data-v="exemple"]'), a = exempleCalc(false);
  if (r) r.innerHTML = `Sur une mise de <b>${esc(usd0(x.mise))}</b> sur Oui à ${esc(nfx(x.prix, 1))}${NB}% (${esc(x.cat)}), le joueur paie <b>${esc(usd(a.fee))}</b> de frais, soit ${esc(nfx(a.part * 100, 2))}${NB}% de sa mise, et reçoit ${esc(nfx(a.sh, 2))} parts.`;
  const rb = box.querySelector('[data-v="exemple-brouillon"]'); if (rb) { const b = exempleCalc(true); rb.innerHTML = `Avec la nouvelle valeur : <b>${esc(usd(b.fee))}</b> de frais (${esc(signe(b.fee - a.fee))}).`; }
};
