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
 return sousNavH(_t("Modes de jeu"),[['eclair','#eclair',_t("Éclair")],['blitz','#blitz',_t("Blitz Royale")],['serie','#serie',_t("La Série")],['duels','#duels',_t("Duels"),n]],cur)+(JEU_AIDE[cur]&&!(S.me.played>0)?`<p class="aide">${JEU_AIDE[cur]()}</p>`:'');}   /* la ligne d'aide, à la première rencontre seulement */
/* Jeux sur ordinateur (troisième passe, partie A) : à partir de 880 px, Éclair, Blitz Royale, La Série et Duels sont composés
   pour le grand écran (colonne latérale qui reste visible) ; leurs blocs ne se replient plus que sur téléphone. Le passage
   du seuil redessine l'écran (l'Éclair le fait déjà lui-même : js/flash.js, FLSIDE). */
const JEUX_ORDI={eclair:1,blitz:1,serie:1,duels:1,duel:1};
const routeJeu=()=>JEUX_ORDI[(S.ui.route||'accueil').split('-')[0]];
{const rp=replier;replier=function(){if(routeJeu()&&GRAND())return;rp();};}
try{matchMedia('(min-width:880px)').addEventListener('change',()=>{if(PRET&&routeJeu()&&!$('[data-flashcard]'))render(false);});}catch(e){}

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

/* ===================== Communauté : la page d'entrée =====================
   Téléphone : cinq entrées, une ligne d'explication chacune ; chaque section est à un geste.
   Ordinateur (880 px et plus) : un carrefour composé sur la grille de 12 colonnes. En haut, le salon Général en direct
   (son fil et son champ : on y écrit sans quitter la page) et le haut du classement avec ta place ; dessous, tes amis,
   les clans et le copy trading. Le titre de chaque bloc mène à sa section. Les chiffres sont ceux des écrans visés :
   [data-online] est tenu à jour par le minuteur de boot.js, le fil reçoit les messages comme la page du chat (addMsg). */
function vCommunaute(){return GRAND()?hubOrdiH():hubTelH();}
function hubTelH(){const demandes=S.me.logged&&typeof fIn==='function'?fIn().length:0;
 return `<div class="wrap hub"><div class="pagehead"><h1 class="ptitle">${_t("Communauté")}</h1></div>
 <section class="pn menu-l">${ligneH('chat',_t("Live chat"),{href:'#chat',sub:`<span class="num" data-online>${F.int(S.online)}</span> ${_t("connectés")}`})}${ligneH('shield',_t("Clans"),{href:'#clans',sub:_t("Rejoins une équipe et joue avec elle")})}${ligneH('users',_t("Amis"),{href:'#amis',sub:_t("Vois les mises de tes amis en direct"),n:demandes})}${ligneH('trophy',_t("Classement"),{href:'#classement',sub:_t("Compare-toi aux meilleurs joueurs de la saison")})}${ligneH('copy',_t("Copy trading"),{href:'#copie',sub:_t("Copie automatiquement les paris d’un joueur")})}</section></div>`;}
/* tête d'un bloc du carrefour : le titre mène à la section, la méta (chiffres en direct) se range à droite */
const hubTete=(href,titre,meta)=>`<div class="hub-h"><h2 class="h2"><a class="hub-t" href="${href}">${titre}${ic('right',18)}</a></h2>${meta?`<span class="hub-m">${meta}</span>`:''}</div>`;
const hubGain=v=>bidi((v>=0?'+':'−')+plain(F.usd0(Math.abs(v))));
/* nom d'un joueur : tronqué par sa fin s'il manque de place, son tag de clan jamais coupé */
const hubNom=u=>`<span class="hub-n"><bdi dir="ltr">${esc(userOf(u).n)}</bdi>${typeof tagH==='function'?tagH(u,1):''}</span>`;
const hubAv=(u,on)=>`<span class="hub-av">${avH(u,32,'span')}${on?'<i class="ondot" aria-hidden="true"></i>':''}</span>`;
function hubOrdiH(){
 return `<div class="wrap hub hubd"><div class="pagehead"><h1 class="ptitle">${_t("Communauté")}</h1></div>
 <div class="hubg">${hubChatH()}${hubClassementH()}${hubAmisH()}${hubClansH()}${hubCopieH()}</div></div>`;}
/* le salon Général : son fil en direct et son champ (envoi, connexion demandée à un visiteur : comme la page du chat) */
function hubChatH(){const rid='general';room(rid).unread=0;
 return `<section class="pn hub-b hub-chat">${hubTete('#chat',_t("Live chat"),`<span># ${_t("Général")}</span><span class="hub-on"><i class="live" aria-hidden="true"></i><span><span class="num" data-online>${F.int(S.online)}</span> ${_t("connectés")}</span></span>`)}<div class="feed" data-room="${rid}">${feedH(rid)}</div>${composerH(rid)}</section>`;}
/* le haut de la saison (5 lignes, 8 sur très grand écran ; une de plus pour un visiteur), puis ta place (connecté) */
function hubClassementH(){const rows=lbRows('Saison').slice(0,9),r=myRank();
 const ligne=(x,i)=>`<a class="hub-r" href="${uHref(x.u)}"><span class="num hub-i">${F.int(i+1)}</span>${avH(x.u,32,'span')}${hubNom(x.u)}<b class="num ${plc(x.profit)}">${hubGain(x.profit)}</b></a>`;
 return `<section class="pn hub-b hub-lb">${hubTete('#classement',_t("Classement"),_t("Saison 3, fin dans {0} jours",[12]))}${rows.length?`<div class="hub-l">${rows.map(ligne).join('')}</div>`:`<p class="hub-p">${_t("Compare-toi aux meilleurs joueurs de la saison")}</p>`}
 ${S.me.logged?`<a class="hub-me" href="#rang">${emb(r.t,r.d)}<span class="hub-n2"><small>${_t("Ta place")}</small><b>${rankName(r.t,r.d)}</b></span><b class="num hub-pos">${F.ord(S.me.pos)}</b></a>`:''}</section>`;}
/* tes amis, ceux en ligne d'abord ; sans ami (ou pour un visiteur), des joueurs croisés dans les chats */
function hubAmisH(){const moi=S.me.logged,L=moi?friendsOf():[],In=moi?fIn():[],on=L.filter(isOnline),tri=L.slice().sort((a,b)=>isOnline(b)-isOnline(a)).slice(0,5);
 const ligne=u=>{const U=userOf(u);return `<a class="hub-r hub-r2" href="#joueur-${u}">${hubAv(u,isOnline(u))}${hubNom(u)}${rk(U.t,U.d)}</a>`;};
 const gens=L.length?[]:USER_IDS.filter(x=>!In.includes(x)&&!(moi&&fOut().includes(x))).slice(0,4);
 const sugg=u=>`<div class="hub-r hub-r2">${hubAv(u,isOnline(u))}<a class="hub-n" href="#joueur-${u}"><bdi dir="ltr">${esc(userOf(u).n)}</bdi></a>${moi?friendBtnH(u,true):rk(userOf(u).t,userOf(u).d)}</div>`;
 return `<section class="pn hub-b hub-fr">${hubTete('#amis',_t("Amis"),L.length?_t("{0} en ligne",[F.int(on.length)]):'')}
 ${moi?'':`<p class="hub-p">${_t("Vois les mises de tes amis en direct")}</p>`}
 ${In.length?`<a class="hub-req" href="#amis"><span class="cnt2">${F.int(In.length)}</span><span>${_t("{0, plural, one{demande reçue} other{demandes reçues}}",[In.length])}</span>${ic('right',16)}</a>`:''}
 ${L.length?`<div class="hub-l">${tri.map(ligne).join('')}</div>`:gens.length?`<div class="hub-k">${_t("Joueurs que tu croises dans les chats")}</div><div class="hub-l">${gens.map(sugg).join('')}</div>`:moi?`<p class="hub-p">${_t("Vois les mises de tes amis en direct")}</p><div class="hub-f"><a class="btn b-white" href="#amis">${_t("Ajouter des amis")}</a></div>`:''}
 ${moi?'':`<div class="hub-f"><a class="btn b-white" href="#connexion">${_t("Se connecter")}</a></div>`}</section>`;}
/* ton clan (ou le clan recommandé), puis le top 3 du mois */
function hubClansH(){const mine=S.me.logged?myClan():null,rec=S.me.logged&&!mine?clanRecommended():null,top=clansSorted().slice(0,3);
 const carte=(c,k)=>`<a class="hub-mine" href="#clan-${c.id}">${emblemH(c,40)}<span class="hub-n2"><small>${k}</small><b><span class="hub-nm">${esc(c.name)}</span><span class="ctg${clanWorldRank(c)<=3?' gold':''}">${esc(c.tag)}</span></b><small>${clanPosTxt(c)}</small></span></a>`;
 const ligne=(c,i)=>`<a class="hub-r" href="#clan-${c.id}"><span class="num hub-i">${F.int(i+1)}</span>${emblemH(c,28)}<span class="hub-n"><span class="hub-nm">${esc(c.name)}</span><span class="ctg gold">${esc(c.tag)}</span></span><b class="num">${F.int(c.score)}</b></a>`;
 return `<section class="pn hub-b hub-cl">${hubTete('#clans',_t("Clans"),_t("{0} clans",[F.int(clansActive().length)]))}${mine?carte(mine,_t("Mon clan")):rec?carte(rec,_t("Clan recommandé")):''}
 <div class="hub-k">${_t("Top 3 mondial")}</div><div class="hub-l">${top.map(ligne).join('')}</div></section>`;}
/* tes copies en cours, puis les joueurs à copier (les plus précis) */
function hubCopieH(){const live=S.me.logged?copiesLive():[],top=USER_IDS.filter(u=>copyElig(u).ok&&!copyOf(u)).sort((a,b)=>userOf(b).acc-userOf(a).acc).slice(0,live.length?2:4);
 const copie=c=>{const p=cPnl(c);return `<a class="hub-r hub-r2" href="#copie">${hubAv(c.u)}${hubNom(c.u)}<b class="num ${plc(p)}">${F.signed(p)}</b></a>`;};
 const joueur=u=>{const U=userOf(u);return `<a class="hub-r hub-r2" href="#joueur-${u}">${hubAv(u)}${hubNom(u)}<span class="hub-v"><b class="num">${F.pct(U.acc)}</b><small>${_t("de précision")}</small></span></a>`;};
 return `<section class="pn hub-b hub-cp">${hubTete('#copie',_t("Copy trading"),live.length?_t("{0, plural, one{# copie active} other{# copies actives}}",[live.length]):'')}
 ${live.length?`<div class="hub-l">${live.slice(0,3).map(copie).join('')}</div>`:''}${top.length?`<div class="hub-k">${_t("Joueurs à copier")}</div><div class="hub-l">${top.map(joueur).join('')}</div>`:live.length?'':`<p class="hub-p">${_t("Copie automatiquement les paris d’un joueur")}</p>`}</section>`;}
VIEWS.communaute=vCommunaute;TITLES.communaute=_t("Communauté");
/* Passage téléphone ↔ ordinateur : la page d'entrée Communauté, l'annuaire des clans et la page d'un clan changent de
   composition ; le classement et une fiche joueur ouvrent ou replient leurs blocs latéraux. */
try{matchMedia('(min-width:880px)').addEventListener('change',()=>{const r=(S.ui.route||'').split('-')[0];if(PRET&&['communaute','clans','clan','classement','joueur'].includes(r))render(false);});}catch(e){}
/* Échap ferme aussi la palette de réactions d'un message (chat) et la bulle du nom d'un clan (tag survolé). */
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;$$('.msg.palopen').forEach(m=>m.classList.remove('palopen'));if(typeof ctipHide==='function')ctipHide();});
/* Communauté sur ordinateur : dès 880 px, la colonne latérale du classement, d'un clan et d'une fiche joueur est à côté du
   contenu ; ses blocs restent ouverts (ils se replient toujours sur téléphone : replier, plus bas). */
{const r0=replier;replier=function(){const r=(S.ui.route||'accueil').split('-')[0];if(GRAND()&&(r==='classement'||r==='clan'||r==='joueur'||r==='chat'))return;r0();};}

/* ===================== Portefeuille ===================== */
/* Liens du portefeuille : combinés, jeu responsable, KYC (téléphone et ordinateur) */
function walLiensH(nc,tel){return `<section class="pn menu-l">${ligneH('layers',_t("Mes combinés"),{href:'#combines',n:nc})}${ligneH('shield',_t("Jeu responsable"),{href:'#responsable'})}${S.me.kyc?'':tel?ligneH('lock',_t("Faire le KYC"),{a:'kyc',sub:_t("KYC non fait : crypto uniquement")}):ligneH('lock',_t("KYC non fait : crypto uniquement"),{a:'kyc',val:_t("Faire le KYC")})}</section>`;}   /* tel : sur téléphone, l'action en titre et l'état dessous (la ligne était serrée sur deux lignes par sa valeur) */
/* Ordinateur : un tableau de bord sur la grille de 12 colonnes. Une bande pour le solde, ses deux chiffres et les deux
   actions (alignées sur la colonne de droite) ; dessous, les positions puis les derniers dépôts et retraits (8 colonnes),
   et l'historique (4 colonnes). Les listes [data-deps] et [data-wds] se mettent à jour seules (refreshDeps, wdEnvoye). */
function walletOrdiH(pf,nc){const n=S.me.positions.length;
 return `<div class="wrap wal wal-o"><h1 class="vhid">${_t("Portefeuille")}</h1><div class="grille12">
 <section class="pn wal-top"><div class="wal-sol"><small class="wal-k">${_t("Solde")}</small><b class="num wal-b" data-bal-plain>${F.bal(S.me.balance,true)}</b></div>
  <div class="wal-kv"><div><small>${_t("Valeur des positions")}</small><b class="num" data-live="pvalue">${F.usd(pf.value)}</b></div><div><small>${_t("Profit total")}</small><b class="num ${plc(pf.profit)}" data-live="profit">${F.signed(pf.profit)}</b></div></div>
  <div class="wal-a"><a class="btn b-pri lg" href="#depot">${_t("Déposer")}</a><a class="btn b-ink lg" href="#retrait">${_t("Retirer")}</a></div></section>
 <div class="col wal-main s8"><section class="pn clip"><div class="pn-tete"><h2 class="h2">${_t("Positions")}</h2>${n?`<span class="sub m-0 num">${F.int(n)}</span>`:''}</div><div data-ptab-body>${ptabH('positions')}</div></section>
  <div class="wal-mvt"><section class="pn pad"><div class="h2 mb-1">${_t("Dépôts récents")}</div><div data-deps>${depsH()}</div></section><section class="pn pad"><div class="h2 mb-1">${_t("Retraits récents")}</div><div data-wds>${wdsH()}</div></section></div></div>
 <div class="col wal-side s4"><section class="pn clip"><div class="pn-tete"><h2 class="h2">${_t("Historique")}</h2></div>${ptabH('history',8)}</section>${walLiensH(nc)}</div></div></div>`;}
ACT['hist-all']=()=>{S.ui.histAll=!S.ui.histAll;render(false);};
/* passer le palier de 880 px redessine les écrans qui ont un gabarit d'ordinateur (argentOrdi, js/views.js) */
try{matchMedia('(min-width:880px)').addEventListener('change',()=>{if(PRET&&/^(portefeuille|depot|retrait|profil|rang)$/.test(S.ui.route||''))render(false);});}catch(e){}
function vWallet(){const pf=portfolio(),t=S.ui.ptab==='history'?'history':'positions',nc=typeof combosAll==='function'?combosAll().filter(c=>c.status==='open').length:0;
 if(argentOrdi())return walletOrdiH(pf,nc);
 return `<div class="wrap wal"><h1 class="vhid">${_t("Portefeuille")}</h1>
 <section class="pn pad wal-top"><small class="wal-k">${_t("Solde")}</small><b class="num wal-b" data-bal-plain>${F.bal(S.me.balance,true)}</b>
  <div class="wal-kv"><div><small>${_t("Valeur des positions")}</small><b class="num" data-live="pvalue">${F.usd(pf.value)}</b></div><div><small>${_t("Profit total")}</small><b class="num ${plc(pf.profit)}" data-live="profit">${F.signed(pf.profit)}</b></div></div>
  <div class="wal-a"><a class="btn b-pri lg" href="#depot">${_t("Déposer")}</a><a class="btn b-ink lg" href="#retrait">${_t("Retirer")}</a></div></section>
 <section class="pn clip"><div class="wal-tabs"><div class="tabs ptabs">${[['positions',_t("Positions")],['history',_t("Historique")]].map(([k,l])=>`<button class="${t===k?'on':''}" data-a="ptab" data-v="${k}">${l}</button>`).join('')}</div></div><div data-ptab-body>${ptabH(t)}</div></section>
 ${walLiensH(nc,true)}</div>`;}
VIEWS.portefeuille=vWallet;PROTECTED.add('portefeuille');TITLES.portefeuille=_t("Portefeuille");
/* les onglets Positions et Historique vivent dans le portefeuille, les autres dans le profil */
ACT.ptab=a=>{const v=a.dataset.v,ou=v==='positions'||v==='history'?'portefeuille':'profil';S.ui.ptab=v;if((S.ui.route||'')!==ou){location.hash='#'+ou;return;}render(false);};


/* ===================== Accueil : la colonne latérale ne garde que les grosses mises en direct ===================== */
/* Le rang est dans Profil, le classement et le chat dans Communauté. Le fil [data-bigs] est alimenté par pushBig (auth.js). */
function bigsBlocH(){return `<section class="pn pad"><div class="ph"><div><div class="h2">${_t("Grosses mises en direct")}</div><div class="sub">${_t("Les plus gros paris de la dernière heure")}</div></div></div><div class="bigs" data-bigs>${bigsH()}</div></section>`;}

/* ===================== Accueil : Wimoro en une phrase, pour un visiteur ===================== */
/* Sur ordinateur, le texte et le marché phare (vedette) sont côte à côte ; sur téléphone, l'un sous l'autre.
   Le bouton « S'inscrire » de l'en-tête se cache tant que celui de la présentation est à l'écran (un seul bouton bleu). */
function introH(vedette){return `<section class="intro"><div class="intro-txt"><h2 class="intro-t">${_t("Parie sur ce qui va arriver")}</h2><p class="plead">${_t("Crypto, sport, politique, tech : réponds Oui ou Non et gagne si tu as vu juste.")}</p><div class="hbtns"><a class="btn b-pri lg" href="#inscription" data-cta>${_t("S’inscrire")}</a><button class="btn b-ink lg" data-a="demo-login">${_t("Explorer avec le compte démo")}</button></div></div>${vedette||''}</section>`;}
let introObs=null;
function introVue(view){if(introObs){introObs.disconnect();introObs=null;}document.body.classList.remove('intro-vue');const b=view.querySelector('.intro [data-cta]');if(!b)return;
 document.body.classList.add('intro-vue');if(typeof IntersectionObserver!=='function')return;
 introObs=new IntersectionObserver(L=>{for(const e of L)document.body.classList.toggle('intro-vue',e.isIntersecting);},{rootMargin:'-56px 0px 0px 0px'});introObs.observe(b);}
/* Info-bulle sur la courbe du marché phare (souris ou doigt) : la chance et l'heure du point le plus proche. Les points
   de départ couvrent les 24 dernières heures (le marché phare affiche sa variation sur 24 h) ; chaque nouveau prix porte
   son heure réelle (updateMarket, js/views.js). La courbe d'une fiche de marché a déjà son réticule (js/auth.js). */
function phT(m){if(!m.pht||m.pht.length!==m.ph.length){const n=m.ph.length,t=now();m.pht=m.ph.map((_,i)=>t-DAYMS*(1-i/Math.max(1,n-1)));}return m.pht;}
const quandPt=t=>new Date(t).toDateString()===new Date().toDateString()?hhmm(t):_t('hier {0}',[hhmm(t)]);
function trailTip(e){const el=e.target&&e.target.closest?e.target.closest('.trail.big.tl'):null;$$('.trail .tip').forEach(x=>{if(x.parentElement!==el)x.remove();});if(!el)return;
 const m=MK[el.dataset.trail];if(!m||!m.ph||m.ph.length<2)return;const N=Math.min(120,m.ph.length),off=m.ph.length-N,r=el.getBoundingClientRect(),k=Math.round(clamp((e.clientX-r.left)/r.width,0,1)*(N-1));
 let o=el.querySelector('.tip');if(!o){o=document.createElement('div');o.className='tip';o.setAttribute('aria-hidden','true');el.appendChild(o);}
 o.style.left=(k/(N-1)*100).toFixed(2)+'%';o.innerHTML=`<i></i><span><b>${F.pct(m.ph[off+k])}</b> ${esc(quandPt(phT(m)[off+k]))}</span>`;}
document.addEventListener('pointermove',trailTip,{passive:true});
document.addEventListener('pointerleave',e=>{if(e.target&&e.target.classList&&e.target.classList.contains('trail'))$$('.tip',e.target).forEach(x=>x.remove());},true);
/* Après chaque rendu d'écran (appelé par render, js/views.js). */
function apresRendu(view,v,top){introVue(view);titreFocus(view,top);$$('input.range',view).forEach(curseurRempli);barreEclair(view);}
/* Éclair sur téléphone : la barre des mises se pose exactement sur la barre fixe des trois paris, quelle que soit sa hauteur
   (le Break even passe sur deux ou trois lignes à 320 px) ; css/screens.css lit --fl-sides-h. */
let FLRO=null;
function barreEclair(view){if(FLRO){FLRO.disconnect();FLRO=null;}const s=view.querySelector('.flash-card .fl-sides');if(!s||typeof ResizeObserver!=='function')return;
 FLRO=new ResizeObserver(()=>{const h=Math.round(s.getBoundingClientRect().height);if(h>0)document.documentElement.style.setProperty('--fl-sides-h',h+'px');});FLRO.observe(s);}

/* ===================== Accessibilité (troisième passe, partie B) ===================== */
/* Changement d'écran : le focus clavier va au titre de la page (h1, visible ou réservé aux lecteurs d'écran), pour que la
   lecture reprenne en haut du nouvel écran. Ni au premier affichage, ni quand un écran se redessine sur place. */
let ECRAN_VU=null;
function titreFocus(view,top){const r=S.ui.route||'accueil',avant=ECRAN_VU;ECRAN_VU=r;if(!top||avant===null||avant===r)return;
 const h=view.querySelector('h1');if(!h)return;if(!h.hasAttribute('tabindex'))h.setAttribute('tabindex','-1');try{h.focus({preventScroll:true});}catch(e){h.focus();}}
/* La cloche et le bouton du menu du compte annoncent l'état de leur panneau (aria-expanded, aria-controls), quelle que soit
   la façon dont il s'ouvre ou se ferme (clic, Échap, changement d'écran, clic ailleurs). Ouvert au clavier, le panneau
   reçoit le focus ; fermé par Échap, le focus revient au bouton. */
const PANNEAUX=[['npanel','[data-a="notifs"]'],['umenu','[data-a="umenu"]']];
let PANNEAU_CLAVIER=null;
function panneauxEtat(){for(const [id,sel] of PANNEAUX){const p=document.getElementById(id),ouvert=!!p;$$(sel).forEach(b=>{if(b.getAttribute('aria-expanded')===String(ouvert))return;b.setAttribute('aria-expanded',String(ouvert));if(ouvert)b.setAttribute('aria-controls',id);else b.removeAttribute('aria-controls');});
  if(p&&!p.dataset.vu){p.dataset.vu='1';if(!p.hasAttribute('role')){p.setAttribute('role','region');p.setAttribute('aria-label',id==='npanel'?_t('Notifications'):_t('Menu du compte'));}const b=$(sel);if(b&&b.matches(':focus-visible')){const c=p.querySelector('a[href],button');if(c)c.focus();}}}}
if(typeof MutationObserver==='function')new MutationObserver(panneauxEtat).observe(document.body,{childList:true});
panneauxEtat();
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const a=document.activeElement;for(const [id,sel] of PANNEAUX){const p=document.getElementById(id);if(p&&a&&p.contains(a))PANNEAU_CLAVIER=sel;}if(PANNEAU_CLAVIER)setTimeout(()=>{const b=$(PANNEAU_CLAVIER);PANNEAU_CLAVIER=null;if(b)b.focus();},0);},true);
/* Curseur (input.range) : la partie remplie de la piste suit la pastille ; Chrome et Safari ne la dessinent pas d'eux-mêmes
   (css/components.css lit --val). Au clavier comme au doigt, l'événement input la met à jour. */
function curseurRempli(r){const mn=r.min===''?0:+r.min,mx=r.max===''?100:+r.max,v=+r.value;r.style.setProperty('--val',(mx>mn?(v-mn)/(mx-mn)*100:0)+'%');}
document.addEventListener('input',e=>{const t=e.target;if(t&&t.matches&&t.matches('input.range'))curseurRempli(t);});
/* Passage téléphone ↔ ordinateur : l'accueil se recompose (la carte Éclair change de colonne). */
try{matchMedia('(min-width:880px)').addEventListener('change',()=>{if(PRET&&(S.ui.route||'accueil')==='accueil')render(false);});}catch(e){}

/* ===================== Sections repliables : l'essentiel d'abord, le détail à la demande =====================
   Sur téléphone et tablette (colonnes empilées, 1100 px et moins), les blocs de la colonne secondaire des écrans listés
   ci-dessous arrivent repliés : seul leur titre s'affiche, un appui les déplie. Rien n'est retiré du document : les
   mises à jour en direct (data-fx, data-bz…) continuent d'écrire dedans. Le choix est gardé le temps de la visite. */
const REPLI={ouvert:new Set(),routes:{eclair:1,blitz:1,serie:1,duels:1,duel:1,combines:1,clan:1,classement:1,joueur:1,rang:1,depot:1,retrait:1,chat:1},   /* chat (partie B) : « En ligne » et « Règles du chat » repliés sous le fil, sur téléphone */
 sel:'aside.col>section.pn:not(.chat):not(.ticket):not(.tri-m),.g-side>.col+.col>section.pn:not([data-flbet]),.g-side>.col+.col>[data-ffr]>section.pn,[data-bzcard]~section.pn,[data-srcard]~section.pn'};
function replier(){const view=$('#view');if(!view)return;const r=(S.ui.route||'accueil').split('-')[0];if(!REPLI.routes[r]||innerWidth>1100)return;
 view.querySelectorAll(REPLI.sel).forEach(sec=>{const tete=sec.firstElementChild;if(!tete||sec.classList.contains('repli'))return;const titre=tete.matches('.h2,h2,h3')?tete:tete.querySelector('.h2,h2,h3,.cpx-h b');if(!titre)return;   /* .cpx-h b : titre d'une carte à icône (parrainage du dépôt) */
  const cle=r+':'+titre.textContent.trim(),o=REPLI.ouvert.has(cle);sec.classList.add('repli');sec.classList.toggle('plie',!o);sec.dataset.repli=cle;tete.classList.add('repli-t');const b=document.createElement('button');b.type='button';b.className='repli-b';b.setAttribute('aria-expanded',String(o));b.setAttribute('aria-label',titre.textContent.trim());tete.appendChild(b);});}
function repliBascule(tete){const sec=tete.parentElement,o=sec.classList.toggle('plie'),b=tete.querySelector('.repli-b');if(b)b.setAttribute('aria-expanded',String(!o));if(o)REPLI.ouvert.delete(sec.dataset.repli);else REPLI.ouvert.add(sec.dataset.repli);}
document.addEventListener('click',e=>{const t=e.target.closest('.repli-t');if(t&&(e.target.closest('.repli-b')||!e.target.closest('a,button,input,select,label')))repliBascule(t);});
{const r0=render;render=function(top){const a=document.activeElement,titre=!!(a&&a.matches&&a.matches('#view h1'));r0(top);replier();
 /* un écran redessiné sur place garde le focus sur son titre s'il l'avait (le titre vient d'être remplacé) */
 if(titre&&document.activeElement===document.body){const h=$('#view h1');if(h){h.setAttribute('tabindex','-1');try{h.focus({preventScroll:true});}catch(e){h.focus();}}}};}
