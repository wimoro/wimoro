/* WIMORO — présentation ajoutée par la refonte du design
 *
 * Ce fichier ne contient que de l'affichage : des carrefours et des sous-navigations faits de blocs qui existaient déjà.
 * Aucune règle du jeu, aucun calcul d'argent, aucun appel au serveur. Chargé après tous les écrans, avant serveur.js.
 *
 *   - sous-navigation commune des destinations « Communauté » et « Éclair » ;
 *   - écran « Portefeuille » (solde, déposer, retirer, positions, historique) ;
 *   - profil allégé : les positions et l'historique vivent dans le portefeuille ;
 *   - présentation de Wimoro pour un visiteur, en tête de l'accueil.
 */
'use strict';

/* ===================== Sous-navigations ===================== */
/* items : [clé, adresse, libellé, compteur facultatif]. La classe .hubsw fait poser aria-current par ariaOne (views.js). */
function sousNavH(label,items,cur){return `<nav class="tabs subnav hubsw" aria-label="${label}">${items.map(([k,href,txt,n])=>`<a class="${k===cur?'on':''}" href="${href}">${txt}${n?` <span class="cnt2">${n}</span>`:''}</a>`).join('')}</nav>`;}
function comNavH(cur){const n=S.me.logged&&typeof fIn==='function'?fIn().length:0;
 return sousNavH(_t("Communauté"),[['chat','#chat',_t("Chat")],['clans','#clans',_t("Clans")],['classement','#classement',_t("Classement")],['amis','#amis',_t("Amis"),n],['copie','#copie',_t("Copies")]],cur);}
/* remplace la bascule « Clans / Joueurs » de clans.js : même fonction, cinq entrées */
function hubSwH(on){return comNavH(on==='clans'?'clans':'classement');}
/* une ligne d'explication par mode de jeu, à la première rencontre */
const JEU_AIDE={
 eclair:()=>_t("Éclair : un pari de 45 secondes. Le prix finira-t-il plus haut ou plus bas ?"),
 blitz:()=>_t("Blitz Royale : un tournoi en 10 manches. Une erreur t’élimine, les survivants se partagent la cagnotte."),
 serie:()=>_t("La Série : chaque bonne réponse multiplie ta mise. Encaisse quand tu veux, une erreur fait tout perdre."),
 duels:()=>_t("Duel : un défi à deux sur un marché. Les deux mises sont bloquées, le gagnant prend tout.")
};
function jeuxNavH(cur){const n=S.me.logged&&typeof duelIncoming==='function'?duelIncoming().length:0;
 return sousNavH(_t("Modes de jeu"),[['eclair','#eclair',_t("Éclair")],['blitz','#blitz',_t("Blitz Royale")],['serie','#serie',_t("La Série")],['duels','#duels',_t("Duels"),n]],cur)+(JEU_AIDE[cur]?`<p class="aide">${JEU_AIDE[cur]()}</p>`:'');}

/* Insère un bloc en tête d'un écran (juste après l'ouverture de son .wrap) et retire au besoin son fil d'Ariane. */
function enTete(html,bloc,sansFil){if(sansFil)html=html.replace(/<nav class="crumbs"[\s\S]*?<\/nav>/,'');const i=html.indexOf('class="wrap');if(i<0)return bloc+html;const j=html.indexOf('>',i);return html.slice(0,j+1)+bloc+html.slice(j+1);}
function habiller(nom,bloc,sansFil){const v=VIEWS[nom];if(!v)return;VIEWS[nom]=a=>{const h=v(a);return S.me.logged||!PROTECTED.has(nom)?enTete(h,bloc(),sansFil):h;};}
habiller('chat',()=>comNavH('chat'));
habiller('amis',()=>comNavH('amis'));
habiller('copie',()=>comNavH('copie'),true);
habiller('duels',()=>jeuxNavH('duels'),true);

/* ===================== Lignes de menu ===================== */
function ligneH(icone,texte,o){o=o||{};const fin=`${o.val?`<span class="mrow-v">${o.val}</span>`:''}${o.n?`<span class="cnt2">${o.n}</span>`:''}${o.plat?'':`<span class="mrow-c">${ic('right',16)}</span>`}`;
 const corps=`<span class="mrow-i">${ic(icone,20)}</span><span class="mrow-t">${texte}</span>${fin}`;
 return o.a?`<button class="mrow${o.cls?' '+o.cls:''}" data-a="${o.a}">${corps}</button>`:`<a class="mrow" href="${o.href}">${corps}</a>`;}

/* ===================== Portefeuille ===================== */
function vWallet(){const pf=portfolio(),t=S.ui.ptab==='history'?'history':'positions',nc=typeof combosAll==='function'?combosAll().filter(c=>c.status==='open').length:0;
 return `<div class="wrap wal"><h1 class="vhid">${_t("Portefeuille")}</h1>
 <section class="pn pad wal-top"><small class="wal-k">${_t("Solde")}</small><b class="num wal-b" data-bal-plain>${F.bal(S.me.balance,true)}</b>
  <div class="wal-kv"><div><small>${_t("Valeur des positions")}</small><b class="num" data-live="pvalue">${F.usd(pf.value)}</b></div><div><small>${_t("Profit total")}</small><b class="num ${plc(pf.profit)}" data-live="profit">${F.signed(pf.profit)}</b></div></div>
  <div class="wal-a"><a class="btn b-pri lg" href="#depot">${_t("Déposer")}</a><a class="btn b-ink lg" href="#retrait">${_t("Retirer")}</a></div></section>
 ${S.me.kyc?'':`<section class="pn pad"><div class="kycrow"><span class="kyc-badge">${_t("{0} KYC non fait : crypto uniquement",[ic('lock',13)])}</span><button class="btn b-ink sm" type="button" data-a="kyc">${_t("Faire le KYC")}</button></div></section>`}
 <section class="pn clip"><div class="wal-tabs"><div class="tabs ptabs">${[['positions',_t("Positions")],['history',_t("Historique")]].map(([k,l])=>`<button class="${t===k?'on':''}" data-a="ptab" data-v="${k}">${l}</button>`).join('')}</div></div><div data-ptab-body>${ptabH(t)}</div></section>
 <section class="pn menu-l">${ligneH('layers',_t("Mes combinés"),{href:'#combines',n:nc})}${ligneH('shield',_t("Jeu responsable"),{href:'#responsable'})}</section></div>`;}
VIEWS.portefeuille=vWallet;PROTECTED.add('portefeuille');TITLES.portefeuille=_t("Portefeuille");
/* les onglets Positions et Historique vivent dans le portefeuille, les autres dans le profil */
ACT.ptab=a=>{const v=a.dataset.v,ou=v==='positions'||v==='history'?'portefeuille':'profil';S.ui.ptab=v;if((S.ui.route||'')!==ou){location.hash='#'+ou;return;}render(false);};

/* ===================== Profil ===================== */
function vProfil(){const r=myRank(),st=stats(),pf=portfolio(),pg=progress(),t=['badges','settings','mine'].includes(S.ui.ptab)?S.ui.ptab:'badges';
 return `<div class="wrap prof"><section class="pn clip"><div class="pf-top"><div class="pf-id"><span class="av t-me${avClass('me')}" style="background:${S.me.color}">${avInner('me',88)}</span><div><h1>${esc(S.me.n)} ${tagH('me')}</h1>${S.me.bio?`<p class="pf-bio">${esc(S.me.bio)}</p>`:''}<div class="pf-meta"><a href="#rang">${rk(r.t,r.d)}</a><span>${_t("Membre depuis {0}",[esc(S.me.since||_t("aujourd’hui"))])}</span><span>${_t("{0} abonné{1}",[F.int(S.me.followers||0),(S.me.followers||0)>1?'s':''])}</span><span>${_t("{0} abonnements",[S.me.following.length])}</span>${visMetaH()}</div></div></div>
  <div class="hbtns own"><a class="btn b-pri" href="#modifier">${_t("Modifier le profil")}</a><button class="btn b-ink" data-a="copylink" data-v="#profil">${ic('share',16)} <span>${_t("Partager")}</span></button></div></div>
  <div class="pf-stats"><div><small>${_t("Profit total")}</small><b class="num ${plc(pf.profit)}" data-live="profit">${F.signed(pf.profit)}</b></div><div><small>${_t("Précision")}</small><b class="num">${F.pct(st.acc)}</b></div><div><small>${_t("Paris joués")}</small><b class="num">${F.int(S.me.played)}</b></div><div><small>${_t("Série en cours")}</small><b class="num">${_t("{0} jours",[S.me.streak])}</b></div></div></section>
 ${profRankH(pg)}${acctH()}
 <section class="pn clip"><div class="wal-tabs"><div class="tabs ptabs">${[['badges',_t("Badges")],['settings',_t("Paramètres")],['mine',`<span class="lg-only">${_t("Mes paris créés")}</span><span class="sm-only">${_t("Créés")}</span>${(S.me.props||[]).length?' ('+S.me.props.length+')':''}`]].map(([k,l])=>`<button class="${t===k?'on':''}" data-a="ptab" data-v="${k}">${l}</button>`).join('')}</div></div><div data-ptab-body>${ptabH(t)}</div></section></div>`;}
VIEWS.profil=vProfil;

/* ===================== Accueil : Wimoro en une phrase, pour un visiteur ===================== */
function introH(){return `<section class="intro"><h2 class="ptitle">${_t("Parie sur ce qui va arriver")}</h2><p class="plead">${_t("Choisis un marché, réponds Oui ou Non, et gagne si tu as vu juste. Ici, tout l’argent est fictif.")}</p><div class="hbtns"><a class="btn b-pri lg" href="#inscription">${_t("Créer un compte")}</a><button class="btn b-ink lg" data-a="demo-login">${_t("Explorer avec le compte démo")}</button></div></section>`;}
{const v=VIEWS.accueil;VIEWS.accueil=a=>{const h=v(a);return S.me.logged?h:enTete(h,introH());};}
