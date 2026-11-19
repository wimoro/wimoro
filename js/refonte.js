/* WIMORO — présentation ajoutée par la refonte du design
 *
 * Ce fichier ne contient que de l'affichage : des carrefours et des sous-navigations faits de blocs qui existaient déjà.
 * Aucune règle du jeu, aucun calcul d'argent, aucun appel au serveur. Chargé après tous les écrans, avant serveur.js.
 *
 *   - sous-navigation commune des destinations « Communauté » et « Éclair » ;
 *   - écran « Portefeuille » (solde, déposer, retirer, positions, historique) ;
 *   - onglets du profil : les positions et l'historique vivent dans le portefeuille ;
 *   - présentation de Wimoro pour un visiteur, en tête de l'accueil.
 */
'use strict';

/* ===================== Sous-navigations ===================== */
/* items : [clé, adresse, libellé, compteur facultatif]. La classe .hubsw fait poser aria-current par ariaOne (views.js). */
function sousNavH(label,items,cur){return `<nav class="tabs subnav hubsw" aria-label="${label}">${items.map(([k,href,txt,n])=>`<a class="${k===cur?'on':''}" href="${href}">${txt}${n?` <span class="cnt2">${n}</span>`:''}</a>`).join('')}</nav>`;}
function comNavH(cur){const n=S.me.logged&&typeof fIn==='function'?fIn().length:0;
 return sousNavH(_t("Communauté"),[['chat','#chat',_t("Live chat")],['clans','#clans',_t("Clans")],['amis','#amis',_t("Amis"),n],['classement','#classement',_t("Classement")],['copie','#copie',_t("Copy trading")]],cur);}
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
/* o.sub : une ligne d'explication sous le libellé ; o.val : une valeur à droite ; o.n : un compteur */
function ligneH(icone,texte,o){o=o||{};const fin=`${o.val?`<span class="mrow-v">${o.val}</span>`:''}${o.n?`<span class="cnt2">${o.n}</span>`:''}${o.plat?'':`<span class="mrow-c">${ic('right',16)}</span>`}`;
 const corps=`<span class="mrow-i">${ic(icone,20)}</span><span class="mrow-t">${o.sub?`<b>${texte}</b><small>${o.sub}</small>`:texte}</span>${fin}`;
 const cls=`mrow${o.sub?' mrow-2':''}${o.cls?' '+o.cls:''}`;
 return o.a?`<button class="${cls}" data-a="${o.a}">${corps}</button>`:`<a class="${cls}" href="${o.href}">${corps}</a>`;}

/* ===================== Communauté : la page d'entrée ===================== */
/* Cinq entrées, une ligne d'explication chacune : chaque section est à un geste. Les chiffres sont ceux des écrans visés
   (joueurs connectés du chat, demandes d'amis reçues) ; [data-online] est tenu à jour par le minuteur de boot.js. */
function vCommunaute(){const demandes=S.me.logged&&typeof fIn==='function'?fIn().length:0;
 return `<div class="wrap hub"><h1 class="ptitle">${_t("Communauté")}</h1>
 <section class="pn menu-l">${ligneH('chat',_t("Live chat"),{href:'#chat',sub:_t("Discute en direct avec les autres joueurs"),val:`<span class="num" data-online>${F.int(S.online)}</span> ${_t("connectés")}`})}${ligneH('shield',_t("Clans"),{href:'#clans',sub:_t("Rejoins une équipe et joue avec elle")})}${ligneH('users',_t("Amis"),{href:'#amis',sub:_t("Vois les mises de tes amis en direct"),n:demandes})}${ligneH('trophy',_t("Classement"),{href:'#classement',sub:_t("Compare-toi aux meilleurs joueurs de la saison")})}${ligneH('copy',_t("Copy trading"),{href:'#copie',sub:_t("Copie automatiquement les paris d’un joueur")})}</section></div>`;}
VIEWS.communaute=vCommunaute;TITLES.communaute=_t("Communauté");

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


/* ===================== Accueil : la colonne latérale ne garde que les grosses mises en direct ===================== */
/* Le rang est dans Profil, le classement et le chat dans Communauté. Le fil [data-bigs] est alimenté par pushBig (auth.js). */
function bigsBlocH(){return `<section class="pn pad"><div class="ph"><div><div class="h2">${_t("Grosses mises en direct")}</div><div class="sub">${_t("Les plus gros paris de la dernière heure")}</div></div></div><div class="bigs" data-bigs>${bigsH()}</div></section>`;}

/* ===================== Accueil : Wimoro en une phrase, pour un visiteur ===================== */
function introH(){return `<section class="intro"><h2 class="ptitle">${_t("Parie sur ce qui va arriver")}</h2><p class="plead">${_t("Choisis un marché, réponds Oui ou Non, et gagne si tu as vu juste. Ici, tout l’argent est fictif.")}</p><div class="hbtns"><a class="btn b-pri lg" href="#inscription">${_t("S’inscrire")}</a><button class="btn b-ink lg" data-a="demo-login">${_t("Explorer avec le compte démo")}</button></div></section>`;}
{const v=VIEWS.accueil;VIEWS.accueil=a=>{const h=v(a);return S.me.logged?h:enTete(h,introH());};}

/* ===================== Sections repliables : l'essentiel d'abord, le détail à la demande =====================
   Sur téléphone et tablette (colonnes empilées, 1100 px et moins), les blocs de la colonne secondaire des écrans listés
   ci-dessous arrivent repliés : seul leur titre s'affiche, un appui les déplie. Rien n'est retiré du document : les
   mises à jour en direct (data-fx, data-bz…) continuent d'écrire dedans. Le choix est gardé le temps de la visite. */
const REPLI={ouvert:new Set(),routes:{eclair:1,blitz:1,serie:1,duels:1,duel:1,combines:1,clan:1,classement:1,joueur:1},
 sel:'aside.col>section.pn:not(.chat):not(.ticket),.g-side>.col+.col>section.pn:not([data-flbet])'};
function replier(){const view=$('#view');if(!view)return;const r=(S.ui.route||'accueil').split('-')[0];if(!REPLI.routes[r]||innerWidth>1100)return;
 view.querySelectorAll(REPLI.sel).forEach(sec=>{const tete=sec.firstElementChild;if(!tete||sec.classList.contains('repli'))return;const titre=tete.matches('.h2,h2,h3')?tete:tete.querySelector('.h2,h2,h3');if(!titre)return;
  const cle=r+':'+titre.textContent.trim(),o=REPLI.ouvert.has(cle);sec.classList.add('repli');sec.classList.toggle('plie',!o);sec.dataset.repli=cle;tete.classList.add('repli-t');const b=document.createElement('button');b.type='button';b.className='repli-b';b.setAttribute('aria-expanded',String(o));b.setAttribute('aria-label',titre.textContent.trim());tete.appendChild(b);});}
function repliBascule(tete){const sec=tete.parentElement,o=sec.classList.toggle('plie'),b=tete.querySelector('.repli-b');if(b)b.setAttribute('aria-expanded',String(!o));if(o)REPLI.ouvert.delete(sec.dataset.repli);else REPLI.ouvert.add(sec.dataset.repli);}
document.addEventListener('click',e=>{const t=e.target.closest('.repli-t');if(t&&(e.target.closest('.repli-b')||!e.target.closest('a,button,input,select,label')))repliBascule(t);});
{const r0=render;render=function(top){r0(top);replier();};}
