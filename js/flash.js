/* WIMORO — flash module */

'use strict';
/* ===================== Pari éclair (hybride) =====================
   Tous les paris tournent en parallèle sur une horloge commune de 45 s (30 s de mises, 15 s de résolution).
   Mode « Rotation » (Dan) : la page suit un pari vedette qui change à chaque manche, avec file d'attente et alertes.
   Mode « Libre » : on choisit son pari par catégorie et onglet, et on peut jouer chaque pari une fois par manche. */
/* FCAL : les amplitudes d'origine étaient environ 7 fois trop fortes pour 45 secondes (le Bitcoin bougeait de 100 à 250 $ en
   quelques secondes). Toutes les amplitudes ET les seuils qui en dépendent (demi-zone break even, seuil du pari Secousse) sont
   réduits du même facteur : les probabilités et les cotes affichées ne changent pas. */
const FCAL=1/7;
const FDUR=45000,FOPEN=30000,FVOL=.0035*FCAL;
const SIDEV={oui:1,non:0,be:2};
const FCATS=['Tout','Crypto','Bourse','Matières','Devises','Sport live'];
const nf4=new Intl.NumberFormat(LOC,{minimumFractionDigits:4,maximumFractionDigits:4});
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const lowerFirst=s=>s[0].toLowerCase()+s.slice(1);
let FRND=Math.random;/* aléa des tableaux de score et des cagnottes de départ : semé par manche (fRoundInit) */
const pk=a=>a[Math.floor(FRND()*a.length)];
const nfd={},nfD=n=>nfd[n]||(nfd[n]=new Intl.NumberFormat(LOC,{minimumFractionDigits:n,maximumFractionDigits:n})),fUd=n=>v=>money(NB(nfD(n).format(v))),fU3=fUd(3),fU4=fUd(4),f5=v=>bidi(NB(nfD(5).format(v))),fYen3=v=>bidi(SYMB?'¥'+NB(nfD(3).format(v)):NB(nfD(3).format(v))+' ¥');
/* petit pourcentage à un chiffre significatif (« ±0,003 % ») */
const pctS=v=>unit(NB(new Intl.NumberFormat(LOC,{maximumSignificantDigits:1}).format(v)),'%');
const fU=v=>F.usd(v),cU=v=>money(plain(F.d2(v))),fPt=v=>unit(plain(F.d2(v)),_t('pts')),fYen=v=>bidi(SYMB?'¥'+plain(F.d2(v)):plain(F.d2(v))+' ¥'),f4=v=>bidi(NB(nf4.format(v))),fC=v=>unit(Math.round(v),'¢');
const dirG=(id,code,cat,name,sub,k0,p0,fp,fc)=>{const k=k0*FCAL;return {id,code,cat,kind:'dir',name,tab:name,sub,q:`${_t("{0} sera-t-il plus haut dans 45 secondes ?",[cap(sub)])}`,a:_t("Plus haut"),b:_t("Plus bas"),e:_t("Break even"),ha:_t("Haut"),hb:_t("Bas"),he:'BE',be:k*.195,rs:u=>`${u?_t("{0} a monté",[cap(sub)]):_t("{0} a baissé",[cap(sub)])}.`,rbe:`${_t("{0} est resté pile sur son prix de départ.",[cap(sub)])}`,how:`${_t("Si {0} finit au-dessus de la bande de départ, « Plus haut » gagne ; en dessous, c’est « Plus bas ». S’il reste dans la zone break even autour de son prix de départ, c’est le break even : très rare et très bien payé, seule la mise « Break even » gagne.",[sub])}`,k,p0,fp,fc};};
const GAMES=[
 dirG('btc','BTC','Crypto',_t("Bitcoin"),_t("le Bitcoin"),.0011,97412.35,fU,cU),
 dirG('eth','ETH','Crypto',_t("Ethereum"),_t("l’Ethereum"),.0014,3482.6,fU,cU),
 dirG('sol','SOL','Crypto',_t("Solana"),_t("Solana"),.0019,188.42,fU3,fU3),
 dirG('doge','DOGE','Crypto',_t("Dogecoin"),_t("le Dogecoin"),.0024,.18425,f5,f5),
 {id:'vol',code:'SEC',cat:'Crypto',kind:'vol',name:_t("Secousse"),tab:_t("Secousse"),q:_t("Le Bitcoin va-t-il bouger de plus de 0,05 % en 45 secondes ?"),a:_t("Ça bouge"),b:_t("Ça reste calme"),e:_t("Break even"),ha:_t("Fort"),hb:_t("Calme"),he:'BE',be:.00022*FCAL,bed:_t("le Bitcoin reste quasi immobile (±0,003 %)"),fp:fU,fc:cU,rs:u=>u?_t("Le Bitcoin a fait une secousse."):_t("Le Bitcoin est resté calme."),rbe:_t("Le Bitcoin n’a quasiment pas bougé."),how:_t("Si le Bitcoin s’écarte de son prix de départ de plus de 0,05 %, dans un sens ou dans l’autre, « Ça bouge » gagne. S’il bouge peu, « Ça reste calme » gagne. S’il reste quasi immobile (±0,003 %), c’est le break even, très rare et très bien payé.")},
 dirG('ndx','NDX','Bourse',_t("Nasdaq 100"),_t("le Nasdaq 100"),.0004,25841.2,fPt,fPt),
 dirG('spx','SPX','Bourse','S&P 500',_t("le S&P 500"),.0006,6812.4,fPt,fPt),
 dirG('cac','CAC','Bourse','CAC 40',_t("le CAC 40"),.0007,8124.6,fPt,fPt),
 dirG('nvda','NVDA','Bourse',_t("Nvidia"),_t("Nvidia"),.0009,142.35,fU3,fU3),
 dirG('tsla','TSLA','Bourse',_t("Tesla"),_t("Tesla"),.0011,248.7,fU3,fU3),
 dirG('gold','XAU','Matières',_t('Or'),_t("l’or"),.0005,4126.8,fU,cU),
 dirG('silver','XAG','Matières',_t("Argent"),_t("l’argent"),.0009,48.62,fU4,fU4),
 dirG('oil','BRENT','Matières',_t("Pétrole Brent"),_t("le pétrole Brent"),.0009,64.2,fU4,fU4),
 dirG('eurusd','EUR','Devises',_t("Euro / dollar"),_t("l’euro face au dollar"),.00022,1.1642,f5,f5),
 dirG('gbpusd','GBP','Devises',_t("Livre / dollar"),_t('la livre face au dollar'),.00025,1.3125,f5,f5),
 dirG('usdjpy','JPY','Devises',_t("Dollar / yen"),_t('le dollar face au yen'),.0003,152.84,fYen3,fYen3),
 {id:'tennis',code:'TEN',cat:'Sport live',kind:'event',name:_t("Tennis"),tab:_t("Tennis"),q:_t("Marin va-t-il gagner le prochain point ?"),a:_t("Marin"),b:_t("Duval"),e:_t("Let"),ha:_t("Marin"),hb:_t("Duval"),he:_t("Let"),p:.58,bep:.04,bed:_t("le point est rejoué (let)"),fp:fC,fc:fC,rs:u=>u?_t("Point pour Marin."):_t("Point pour Duval."),rbe:_t("Let : le point est rejoué."),how:_t("Si Marin remporte le prochain point, « Marin » gagne ; si c’est Duval, « Duval » gagne. Si le point est rejoué (let), c’est le break even : très rare et très bien payé."),mk:()=>({board:`${_t("Marin {0}  {1} Duval",[pk(['6-4','7-5','4-6','6-3','3-6']),pk(['3-2','2-3','4-3','1-2','2-2'])])}`,sub:`${_t("Au service : {0}, {1}",[pk([_t("Marin"),_t("Duval")]),pk(['0-15','15-30','30-15','40-30','30-40'])])}`})},
 {id:'basket',code:'BSK',cat:'Sport live',kind:'event',name:_t("Basket"),tab:_t("Basket"),q:_t("Le prochain tir des Lions sera-t-il à 3 points ?"),a:_t("À 3 points"),b:_t("À 2 points"),e:_t("Balle perdue"),ha:'3 pts',hb:'2 pts',he:_t("Perte"),p:.38,bep:.04,bed:_t("aucun tir, la balle est perdue"),fp:fC,fc:fC,rs:u=>u?_t("Le tir était à 3 points."):_t("Le tir était à 2 points."),rbe:_t("Balle perdue, pas de tir."),how:_t("Si le prochain tir des Lions est à 3 points, « À 3 points » gagne ; à 2 points, « À 2 points » gagne. S’il n’y a aucun tir (balle perdue), c’est le break even : très rare et très bien payé."),mk:()=>{const a=60+Math.floor(FRND()*30),b=60+Math.floor(FRND()*30);return {board:`${_t("Lions {0} – {1} Aigles",[a,b])}`,sub:`${_t("3e quart-temps, {0}:{1}",[Math.floor(FRND()*11),String(Math.floor(FRND()*60)).padStart(2,'0')])}`};}},
 {id:'foot',code:'FOOT',cat:'Sport live',kind:'event',name:_t("Foot"),tab:_t("Foot"),q:_t("Y aura-t-il un corner dans la prochaine minute ?"),a:_t("Oui, un corner"),b:_t("Non"),e:_t("But"),ha:_t("Corner"),hb:_t("Rien"),he:_t("But"),p:.18,bep:.03,bed:_t("un but est marqué dans la minute"),fp:fC,fc:fC,rs:u=>u?_t("Un corner a été sifflé."):_t("Pas de corner."),rbe:_t("But marqué dans la minute."),how:_t("S’il y a un corner dans la minute, « Oui, un corner » gagne ; sinon « Non » gagne. Si un but est marqué dans la minute, c’est le break even : très rare et très bien payé."),mk:()=>({board:`${_t("Rouge {0} – {0} Bleu",[Math.floor(FRND()*3)])}`,sub:`${_t("{0}e minute",[20+Math.floor(FRND()*70)])}`})}
];
const GM={};GAMES.forEach((d,i)=>{GM[d.id]=d;d.i=i;});
const FCL={'Sport live':'Sport'};
/* probabilité du break even d'un jeu : événement = bep annoncé ; prix = marche aléatoire (pas de 250 ms sur 45 s) dans la bande ±be */
const beP=d=>d.kind==='event'?d.bep:beProb(d.be,d.kind==='vol'?GM.btc.k:d.k,FDUR/250);
/* cote break even du jeu (bloquée à la mise), et texte « ×24 » */
const beMult=d=>beMultFair(beP(d));
const beTxt=d=>bidi('×'+(beMult(d)>=10?Math.round(beMult(d)):F.d1(beMult(d))));
/* mise maximale acceptée sur le break even : la cagnotte Oui + Non doit couvrir la promesse */
const beMax=(g,d)=>Math.floor(beRoom(g)/beMult(d));
function flashPrices(g){const d=GM[g.gid]||GAMES[0],t=flashPool(g),e=Math.max(2,Math.min(20,Math.round(100/beMult(d)))),so=g.pool.o/(g.pool.o+g.pool.n);let o=Math.round((100-e)*so);o=clamp(o,2,98-e);return {o,e,n:100-e-o};}
function flashOdds(g){return flashPrices(g||G('btc')).o;}
const multTxt=p=>'×'+(100/p>=10?Math.round(100/p):F.d1(100/p));
const pctFx=v=>bidi((v>=0?'+':'−')+NB(nf2.format(Math.abs(v)))+(SYMB?'%':' %'));
/* ----- Horloge commune : les manches sont calées sur l'heure réelle -----
   Une manche commence à un multiple de 45 s ; son numéro, les prix, les cagnottes de départ, l'activité des autres joueurs
   et les résultats se déduisent de l'heure. Tout le monde voit donc la même manche au même moment, même après un
   rechargement ou un onglet resté en arrière-plan (les ticks manqués sont rejoués). */
const FEPOCH=Date.UTC(2026,10,1),FTICK=250,FK=FDUR/FTICK,FPHI=.985,FJ=1200;
let FSKEW=0;/* décalage d'horloge, réservé aux tests */
const fNow=()=>now()+FSKEW;
const fRound=t=>Math.floor((t-FEPOCH)/FDUR)+1,fT0=r=>FEPOCH+(r-1)*FDUR;
/* Le calcul déterministe (graines, niveaux, trajectoires, issues, cagnottes) vit dans js/moteur-eclair.js, module pur que
   le serveur utilise à l'identique pour régler les mises en mode Compte. Ce fichier-ci garde l'affichage et l'état. */
const fSeed=MoteurEclair.graine;
/* niveau d'un actif (logarithme du prix rapporté à son prix de base) au début de la manche r :
   somme amortie des aléas des manches précédentes, donc bornée et identique pour tous */
const fLevel=MoteurEclair.niveau;
/* trajectoire d'une manche (un prix par tick de 250 ms) : marche aléatoire semée, recalée pour finir au niveau de la manche suivante */
const fPlan=MoteurEclair.plan;
/* issue d'une manche : 1 = premier côté, 0 = second, 2 = break even */
const fOutcome=MoteurEclair.issue;
function fHistEntry(d,r){const out=fOutcome(d,r);let ch,path;
 if(d.kind==='event'){ch=out===1?.5:-.5;const g=rng(fSeed(d,r,'h'));let v=0;path=[0];for(let k=1;k<23;k++){v+=(g()-.5)*.3+ch/23;path.push(v);}path.push(ch);}
 else{const P=fPlan(d.kind==='vol'?GM.btc:d,r),st=Math.floor(FK/24);path=[];for(let k=0;k<FK;k+=st)path.push((P[k]/P[0]-1)*100);ch=(P[FK]/P[0]-1)*100;path.push(ch);}
 return {o:out===2?'e':out===1?'u':'d',ch,r,at:fT0(r+1),path,my:null,code:d.code,name:d.name};}
/* met un pari au début de la manche r : trajectoire, cagnotte de départ et tableau de score semés par la manche */
const FPRE=40;/* ticks de la manche précédente rappelés au début du graphique (10 secondes) */
function fTail(d){const g=G(d.id);if(!g.tail){const P=fPlan(d,S.flash.round-1);g.tail=Array.from(P.slice(FK-FPRE,FK));}return g.tail;}
function fRoundInit(g,d,r){const dep=MoteurEclair.depart(d,r);FRND=dep.alea;g.pool=dep.pool;g.players=dep.players;g.my=null;g.bets=[];g.tk=0;g.tail=null;
 if(d.kind==='dir'){g.plan=fPlan(d,r);g.start=g.price=g.plan[0];g.path=[g.start];}
 if(d.mk){const b=d.mk();g.board=b.board;g.sub=b.sub;}
 FRND=Math.random;
 if(d.kind==='event'){g.start=flashOdds(g);g.path=[g.start];}}
/* avance un pari jusqu'au tick k de la manche r ; les mises des autres joueurs sont semées par tick, donc rejouables */
function fAdvance(d,g,r,k,live){
 for(let i=g.tk+1;i<=k;i++){
  if(d.kind==='dir'){g.price=g.plan[i];g.path.push(g.price);}
  {const b=MoteurEclair.mises(d,g,r,i,d.kind==='event'?null:(d.kind==='vol'?G('btc'):g).plan);if(b){g.bets.push(b);if(live&&d.id===S.ui.fgame)trailPush('flash',b);}}
  if(d.kind==='event')g.path.push(flashOdds(g));
 }
 if(k>g.tk)g.tk=k;}
/* douze dernières manches d'un pari, calculées à la première lecture (du plus ancien au plus récent : chaque niveau se déduit du précédent) */
function fHistBuild(d,r){const s=d.kind==='vol'?GM.btc:d;if(s.kind==='dir')for(let q=r-13;q<=r;q++)fLevel(s,q);return Array.from({length:12},(_,i)=>fHistEntry(d,r-1-i));}
function mkGame(d,r){const g={gid:d.id,price:d.p0||0,start:d.p0||0,path:[d.p0||0],pool:null,bets:[],hs:null,my:null,players:0,result:null,tk:0};
 Object.defineProperty(g,'hist',{enumerable:true,get(){return g.hs||(g.hs=fHistBuild(d,S.flash.round));},set(v){g.hs=v;}});fRoundInit(g,d,r);return g;}
const S_FLASH={round:fRound(now()),t0:0,dur:FDUR,open:FOPEN,spot:0,hs:null,result:null};S_FLASH.t0=fT0(S_FLASH.round);
/* historique des paris vedettes : recalculé à la demande (remis à null à chaque manche et à chaque changement de catégorie) */
Object.defineProperty(S_FLASH,'hist',{enumerable:true,get(){return S_FLASH.hs||(S_FLASH.hs=fSpotHist());},set(v){S_FLASH.hs=v;}});
S.flash=S_FLASH;S.games={};
GAMES.forEach(d=>{S.games[d.id]=mkGame(d,S.flash.round);});
const G=id=>S.games[id]||S.games.btc;
const AG=()=>GM[S.ui.fgame]||GAMES[0];
const src=d=>d.kind==='vol'?G('btc'):G(d.id);
function gOut(d){if(d.kind==='event')return -1;const s=src(d),m=Math.abs(s.price/s.start-1);if(m<=d.be)return 2;return d.kind==='vol'?(m>FVOL?1:0):(s.price>s.start?1:0);}
function beBand(d){const s=src(d);return [s.start*(1-d.be),s.start*(1+d.be)];}
function bedTxt(d){if(d.kind==='dir'){const [lo,hi]=beBand(d);return `${_t("reste entre {0} et {1}",[d.fp(lo),d.fp(hi)])}`;}return d.bed;}
function sideLabel(d,s){return s==='oui'?d.a:s==='non'?d.b:d.e;}
/* ----- Catégorie, rotation, vedette ----- */
const fcat=()=>FCATS.includes(S.me.fcat)?S.me.fcat:'Tout';
const inCat=d=>fcat()==='Tout'||d.cat===fcat();
const fmode=()=>S.me.fmode==='rot'?'rot':'free';
/* pari vedette de la manche r : rotation dans la catégorie choisie, déduite du numéro de manche */
function fSpot(r){const L=[];GAMES.forEach((d,i)=>{if(inCat(d))L.push(i);});const n=L.length||GAMES.length,j=((r%n)+n)%n;return L.length?L[j]:j;}
function nthSpot(n){return fSpot(S.flash.round+n);}
const SPOT=()=>GAMES[fSpot(S.flash.round)];
/* historique des paris vedettes : pour chaque manche passée, le résultat du pari qui était à l'affiche */
function fSpotHist(){const r=S.flash.round,L=[];for(let i=1;i<=12;i++){const d=GAMES[fSpot(r-i)],g=G(d.id),h=g.hs?g.hs.find(x=>x.r===r-i):null;L.push(h||fHistEntry(d,r-i));}return L;}
function flashPhase(){const f=S.flash,t=fNow()-f.t0;return {t,left:Math.max(0,f.dur-t),open:t<f.open,openLeft:Math.max(0,f.open-t)};}
/* ----- Moteur ----- */
function flashTick(){if(document.hidden)return;/* E1 : rattrapé au retour (les ticks manqués sont rejoués à partir de l'heure) */const f=S.flash,t=fNow(),r=fRound(t);
 if(r!==f.round){for(const d of GAMES)fAdvance(d,G(d.id),f.round,FK,false);resolveFlash();}
 const k=Math.min(FK,Math.floor((t-f.t0)/FTICK));
 for(const d of GAMES)fAdvance(d,G(d.id),f.round,k,true);
 S.ethPrice=G('eth').price;S.solPrice=G('sol').price;
 updateFlash();}
function flashBet(side,ev,gid){const d=GM[gid||S.ui.fgame]||GAMES[0],g=G(d.id),ph=flashPhase();if(!S.me.logged||!(side in SIDEV))return;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;if(!ph.open){toast({tone:'amber',icon:'lock',title:_t("Mises fermées"),text:_t("La prochaine manche arrive dans quelques secondes.")});return;}
 if(g.my){toast({icon:'info',title:_t("Tu as déjà misé sur ce pari"),text:_t("Une mise par pari et par manche. Tu peux jouer les autres paris éclair.")});return;}
 const amt=S.ui.flashAmt;if(amt>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return;}
 const pr=flashPrices(g),price=side==='oui'?pr.o:side==='non'?pr.n:pr.e;const fee=flashFee(d.cat,g,side,amt,myRank().t>=5),net=amt-fee;
 if(side==='be'){const mx=beMax(g,d);if(amt>mx){toast({tone:'amber',icon:'info',title:_t("Mise trop grosse pour le break even"),text:mx>=1?`${_t("La cagnotte de cette manche couvre au plus {0} sur le break even à {1}.",[F.usd0(mx),beTxt(d)])}`:_t("La cagnotte de cette manche ne peut plus couvrir de break even.")});return;}}
 /* écriture : en mode serveur, l'Edge Function « eclair » enregistre la mise avec son horloge et son calcul des frais */
 if(SRV()){srvEclairMiser(d,g,side,amt,ev);return;}
 S.me.balance-=amt;S.me.played++;flashPoser(d,g,{s:side,amt,fee,net,price,mult:side==='be'?beMult(d):0,tk:g.tk});
 updateHeader();gainXP(10,ev);mission('flashbet');updateFlash(true);save();}
/* la mise entre dans la cagnotte du pari et dans la mémoire de la manche (commun aux deux modes) */
function flashPoser(d,g,my){g.my=my;g.pool[poolKey(my.s)]+=my.net;if(my.s==='be')g.pool.eProm=(g.pool.eProm||0)+my.net*my.mult;const b={s:SIDEV[my.s],a:Math.min(1,my.amt/60),me:1};g.bets.push(b);if(d.id===S.ui.fgame)trailPush('flash',b);
 if(!S.me.fmy||S.me.fmy.r!==S.flash.round)S.me.fmy={r:S.flash.round,b:{}};S.me.fmy.b[d.id]=my;}
/* règle la mise du joueur sur un pari terminé (quiet : manche réglée après coup, au retour sur le site) */
function fSettle(d,g,out,round,h,quiet){const key=out===2?'e':out===1?'o':'n',tot=g.pool.o+g.pool.n+g.pool.e,right=Math.round(g.pool[key]/tot*100);
 const win=SIDEV[g.my.s]===out;const pay=win?flashPayout(g,g.my):0,pnl=pay-g.my.amt;
 /* mode serveur : ce calcul (le même que celui du serveur) n'alimente que l'affichage du résultat ; l'écriture comptable et
    l'annonce arrivent avec la réponse du serveur (srvEclairRegler) */
 if(SRV()){if(h)h.my={win,pnl};return {win,pay,pnl,amt:g.my.amt,be:g.my.s==='be'};}
 const before=myRank();S.me.balance+=pay;S.me.settled++;S.me.flashProfit+=pnl;S.me.realized+=pnl;
 if(win){S.me.wins++;S.me.flashWins++;S.me.flashStreak++;if(right<=30)S.me.contraWins=(S.me.contraWins||0)+1;S.me.flashBest=Math.max(S.me.flashBest,S.me.flashStreak);}else S.me.flashStreak=0;
 S.me.history.unshift({k:'flash',q:`${_t("Éclair {0}, manche {1} : {2}",[d.name,F.int(round),sideLabel(d,g.my.s)])}`,s:g.my.s==='non'?'non':'oui',eq:g.my.s==='be',win,pnl,at:fT0(round+1)});if(h)h.my={win,pnl};
 flashAnnonce(d,round,g.my,win,pay,quiet);
 updateHeader();checkRank(before);checkBadges();
 return {win,pay,pnl,amt:g.my.amt,be:g.my.s==='be'};}
/* annonce d'une manche réglée (quiet : réglée après coup, au retour sur le site) — commune aux deux modes */
function flashAnnonce(d,round,my,win,pay,quiet){
 if(quiet){notif('bolt',win?`${_t("Éclair {0}, manche {1} : gagné, +{2}.",[d.name,F.int(round),F.usd(pay)])}`:`${_t("Éclair {0}, manche {1} : perdu, −{2}.",[d.name,F.int(round),F.usd(my.amt)])}`,'#eclair');if(win){gainXP(my.s==='be'?120:40);mission('flashwin');}}
 else if(win){toast({tone:'green',icon:'bolt',flash:true,title:`${my.s==='be'?_t("Break even : "):_t("Gagné : ")}+${F.usd(pay)}`,text:`${_t("{0}, manche {1}. Série de victoires : {2}.",[d.name,F.int(round),S.me.flashStreak])}`,href:'#eclair'});gainXP(my.s==='be'?120:40);mission('flashwin');if(!$('.flres'))confetti(my.s==='be'?60:28);}
 else toast({tone:'red',icon:'bolt',flash:true,title:`${_t("Perdu : −{0}",[F.usd(my.amt)])}`,text:`${_t("{0}. La prochaine manche est déjà ouverte.",[d.name])}`,href:'#eclair'});
}
function resolveFlash(){const f=S.flash,spotId=SPOT().id,rn=fRound(fNow());let aRegler=0;
 for(const d of GAMES){const g=G(d.id),out=d.kind==='event'?fOutcome(d,f.round):gOut(d);
  const h=g.hs||g.my?fHistEntry(d,f.round):null;
  const key=out===2?'e':out===1?'o':'n',tot=g.pool.o+g.pool.n+g.pool.e,right=Math.round(g.pool[key]/tot*100);let res=null;
  if(g.my){res=fSettle(d,g,out,f.round,h,false);aRegler++;}
  if(d.id===spotId)addMsg('general',mkMsg({k:'evt',text:out===2?`${_t("Éclair, manche {0} : break even sur {1}. Seulement {2} % des joueurs l’avaient vu venir.",[F.int(f.round),d.name,right])}`:`${_t("Éclair, manche {0} : {1}. {2} % des joueurs avaient raison.",[F.int(f.round),d.kind==='event'?(out===1?d.a:d.b):(out===1?_t("{0} a monté",[d.name]):_t("{0} a baissé",[d.name])),right])}`}));
  {const s=src(d);g.result={out,res,round:f.round,at:now(),p0:d.kind==='event'?undefined:s.start,p1:d.kind==='event'?undefined:s.price};}
  /* douze dernières manches, y compris celles passées pendant que l'onglet dormait ; mes résultats sont conservés */
  if(h){const old={};for(const x of g.hs||[])old[x.r]=x;old[h.r]=h;const sd=d.kind==='vol'?GM.btc:d;if(sd.kind==='dir')for(let q=rn-13;q<=rn;q++)fLevel(sd,q);g.hs=Array.from({length:12},(_,i)=>old[rn-1-i]||fHistEntry(d,rn-1-i));}}
 if(S.me.fmy){delete S.me.fmy;save();}
 f.lastSpot=spotId;f.round=rn;f.t0=fT0(rn);
 for(const d of GAMES)fRoundInit(G(d.id),d,rn);
 f.spot=fSpot(rn);f.hist=null;
 if(fmode()==='rot')S.ui.fgame=SPOT().id;
 $$('[data-trail="flash"]').forEach(el=>{el.innerHTML='';});
 if($('[data-flashcard]'))render(false);else updateFlashStatic();
 showFlashResult();flashAlert();
 if(SRV()&&aRegler)srvEclairApresManche(aRegler);}
/* Au chargement (après la connexion) : pari vedette de la catégorie du joueur, ticks déjà écoulés rejoués,
   mises de la manche en cours retrouvées, mises d'une manche terminée entre-temps réglées. */
/* UX12 : résultat de la manche précédente, recalculé à partir de l'heure (issue, prix de départ et d'arrivée). Le résultat du joueur vient de son
   historique : le montant net est connu, pas la mise d'origine, d'où « Ton résultat ». */
function fResMine(d,r){if(!S.me.logged)return null;const at=fT0(r+1),L=(S.me.history||[]).filter(h=>h.k==='flash'&&h.at===at);if(!L.length)return null;const M=L.filter(h=>String(h.q).includes(d.name));return M.length===1?{win:!!M[0].win,pnl:M[0].pnl,late:true}:{unk:true};}
function fResBoot(){const f=S.flash,r=f.round-1;if(!f.lastSpot)f.lastSpot=GAMES[fSpot(r)].id;
 for(const d of GAMES){const g=G(d.id);if(g.result&&g.result.round===r)continue;const out=fOutcome(d,r);let p0,p1;if(d.kind!=='event'){const P=fPlan(d.kind==='vol'?GM.btc:d,r);p0=P[0];p1=P[FK];}
  g.result={out,res:fResMine(d,r),round:r,at:fT0(r+1),p0,p1};}}
function flashBoot(){const f=S.flash,t=fNow(),k=Math.min(FK,Math.floor((t-f.t0)/FTICK));
 for(const d of GAMES)fAdvance(d,G(d.id),f.round,k,false);
 f.spot=fSpot(f.round);f.hist=null;fResBoot();
 const fm=S.me.logged&&S.me.fmy;if(!fm)return;
 for(const id in fm.b){const d=GM[id],my=fm.b[id];if(!d||!my)continue;
  if(fm.r===f.round){const g=G(id);g.my=my;g.pool[poolKey(my.s)]+=my.net;if(my.s==='be')g.pool.eProm=(g.pool.eProm||0)+my.net*my.mult;g.bets.push({s:SIDEV[my.s],a:Math.min(1,my.amt/60),me:1});}
  else if(fm.r<f.round){const g={gid:id,hist:[]};fRoundInit(g,d,fm.r);if(d.kind==='vol'&&!G('btc').plan)continue;const keep=d.kind==='vol'?G('btc').plan:null;if(keep)G('btc').plan=fPlan(GM.btc,fm.r);fAdvance(d,g,fm.r,FK,false);if(keep)G('btc').plan=keep;
   g.my=my;g.pool[poolKey(my.s)]+=my.net;if(my.s==='be')g.pool.eProm=(g.pool.eProm||0)+my.net*my.mult;const h=G(id).hist.find(x=>x.r===fm.r);const rs=fSettle(d,g,fOutcome(d,fm.r),fm.r,h||null,true);if(fm.r===f.round-1&&G(id).result)G(id).result.res=rs;}}
 if(fm.r!==f.round){delete S.me.fmy;save();}}
/* ----- Alertes éclair (Dan) ----- */
function flashAlert(){const d=SPOT();if(S.me.fmute)return;const al=S.me.falerts||[];if(!(S.me.fall||al.includes(d.id)))return;const txt=`${_t("Manche {0} ouverte : {1} secondes pour miser.",[F.int(S.flash.round),FOPEN/1000])}`;notif('bell',`${_t("{0} passe en vedette. {1}",[d.name,txt])}`,'#eclair');if((S.ui.route||'')!=='eclair')toast({tone:'blue',icon:'bell',flash:true,title:`${_t("{0} en éclair",[d.name])}`,text:txt,href:'#eclair'});}
/* ----- Rendu ----- */
/* o (facultatif) : {path,start,dur} pour dessiner une manche qui n'est pas celle du jeu éclair (Blitz Royale, La Série) */
/* Graphique d'une manche.
   - Échelle verticale stable : au moins ±1,6 écart-type d'une manche entière autour du prix de départ (une trentaine de fois la
     demi-zone break even), élargie seulement si le prix en sort : plus de pics écrasés en début de manche.
   - Courbe lissée (moyenne sur 3 points), précédée en gris des 10 dernières secondes de la manche d'avant.
   - Zone break even d'au moins 6 px de haut ; les étiquettes « Départ » et « Zone break even » sont posées au-dessus du graphique (CSS). */
let FCPX=0,FCPXT=0;
function fChartPx(){const t=Date.now();if(t-FCPXT>1500){FCPXT=t;const e=$('.fl-chart:not(.spark) svg'),h=e?e.getBoundingClientRect().height:0;FCPX=h>20?h:(innerWidth<=879?112:200);}return FCPX;}
function flashChart(sp,d,ov){const f=ov||src(d),a=f.path,st=f.start,DUR=ov&&ov.dur||FDUR,W=600,H=sp?44:200,NT=DUR/250,ev=d.kind==='event',sd=ev?null:(d.kind==='vol'?GM.btc:d);
 const pre=!ov&&!sp&&sd?fTail(sd):[],NP=pre.length,bd=d.kind==='vol'?[st*(1+FVOL),st*(1-FVOL)]:[];let mn,mx;
 if(ev){mn=Math.min(st,...a);mx=Math.max(st,...a);const pad=(mx-mn)*.12||1;mn-=pad;mx+=pad;}
 else{let half=1.6*sd.k*Math.sqrt(NT/12)*st;for(const q of a)half=Math.max(half,Math.abs(q-st));for(const q of pre)half=Math.max(half,Math.abs(q-st));if(bd.length)half=Math.max(half,FVOL*st*1.1);half*=1.14;mn=st-half;mx=st+half;}
 const y=q=>H-(q-mn)/(mx-mn)*H,o=gOut(d),hi=d.kind==='vol'?o===1:a[a.length-1]>=st,NX=NP+Math.max(a.length,NT)-1,x=i=>(i+NP)/NX*W;
 let band='',lab2='';if(!ev&&!sp){const [lo,up]=ov?[st*(1-d.be),st*(1+d.be)]:beBand(d),y1=y(up),y2=y(lo),hh=Math.max(6.5*H/fChartPx(),y2-y1),yc=(y1+y2)/2;band=`<rect class="beband" x="${x(0).toFixed(1)}" width="${(W-x(0)).toFixed(1)}" y="${(yc-hh/2).toFixed(1)}" height="${hh.toFixed(1)}"/>`;lab2=`<span class="lab2">${_t("Zone break even")}</span>`;}
 /* échelle du tracé, lue par l'info-bulle de la courbe (ftipDraw) */
 const dat=sp?'':` data-mn="${mn}" data-mx="${mx}" data-np="${NP}" data-nx="${NX}"`;
 const base=band+`<line class="base" x1="${x(0).toFixed(1)}" x2="${W}" y1="${y(st).toFixed(1)}" y2="${y(st).toFixed(1)}"/>`+bd.map(q=>`<line class="base" x1="${x(0).toFixed(1)}" x2="${W}" y1="${y(q).toFixed(1)}" y2="${y(q).toFixed(1)}"/>`).join('')+(NP?`<line class="t0" x1="${x(0).toFixed(1)}" x2="${x(0).toFixed(1)}" y1="0" y2="${H}"/>`:''),lab=sp?'':`<span class="lab">${_t("Départ : {0}",[d.fp(st)])}</span>${lab2}`;
 const sm=L=>L.map((v,i)=>i===L.length-1?v:(L[Math.max(0,i-1)]+v+L[i+1])/3),pth=(L,i0)=>L.map((q,i)=>(i?'L':'M')+x(i+i0).toFixed(1)+' '+y(q).toFixed(1)).join('');
 const preP=NP?`<path class="ln pre" d="${pth(sm(pre.concat([st])),-NP)}"/>`:'';
 if(!sp&&typeof ctype==='function'&&ctype()==='bougies'&&!ev){const per=8,N=Math.ceil(NT/per),sw=(W-x(0))/N,bw=sw*.56;let body='';for(let k=0;k*per<a.length&&k<N;k++){const seg=a.slice(k*per,(k+1)*per),o2=k?a[k*per-1]:st,c=seg[seg.length-1],h=Math.max(o2,...seg),l=Math.min(o2,...seg),cl=c>=o2?'up':'dn',cx=x(0)+sw*(k+.5),yt=y(Math.max(o2,c)),yb=y(Math.min(o2,c));body+=`<line class="wk ${cl}" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(h).toFixed(1)}" y2="${y(l).toFixed(1)}"/><rect class="bd ${cl}" x="${(cx-bw/2).toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.6,yb-yt).toFixed(1)}"/>`;}
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"${dat}>${base}${preP}${body}</svg>${lab}`;}
 return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"${dat}>${base}${preP}<path class="ln" d="${pth(sm(a),0)}" style="stroke:${hi?'var(--yes)':'var(--no)'}"/></svg>${lab}`;}
const ARU='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const ARD='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
const ARE='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>';
function sparkH(P,up){const W=72,H=26,mn=Math.min(0,...P),mx=Math.max(0,...P),sp=(mx-mn)||1,y=v=>(H-3-(v-mn)/sp*(H-6)).toFixed(1),x=i=>(i/(P.length-1)*W).toFixed(1);return `<svg class="hsp" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="b" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/><polyline class="${up?'u':'d'}" points="${P.map((v,i)=>x(i)+','+y(v)).join(' ')}"/><circle class="${up?'u':'d'}" cx="${W}" cy="${y(P[P.length-1])}" r="2.6"/></svg>`;}
function histH(list,d){const L=list.slice(0,12);if(!L.length)return `<p class="sub">${_t("Pas encore de manche terminée.")}</p>`;const eq=L.filter(h=>h.o==='e').length,up=L.filter(h=>h.o==='u').length,dn=L.length-up-eq,n=Math.max(1,L.length),ev=d&&d.kind==='event',lab=h=>{const dd=GAMES.find(x=>x.code===h.code)||d;return h.o==='e'?(dd?dd.e:_t("Break even")):ev||(dd&&dd.kind==='event')?(h.o==='u'?dd.a:dd.b):(h.o==='u'?_t("hausse"):_t("baisse"));};
 return `<div class="hsum"><span class="hu">${ARU}${ev?`${up} ${d.ha}`:_t('{0, plural, one{# hausse} other{# hausses}}',[up])}</span><div class="hbar"><i style="width:${(up/n*100).toFixed(1)}%"></i>${eq?`<i class="eqs" style="width:${(eq/n*100).toFixed(1)}%"></i>`:''}</div><span class="hd">${ev?`${dn} ${d.hb}`:_t('{0, plural, one{# baisse} other{# baisses}}',[dn])}${ARD}</span></div>${eq?`<div class="heq">${_t("{0}{1} break even",[ARE,eq])}</div>`:''}
 <div class="beads" role="list">${L.map((h,i)=>`<span role="listitem" class="bead ${h.o}${i===0?' last':''}${h.my?' me':''}" title="${_t("{0}, manche {1} : {2}{3}",[esc(h.name),F.int(h.r),esc(lab(h)),h.my?(h.my.win?_t(", tu as gagné"):_t(", tu as perdu")):''])}">${h.o==='e'?ARE:h.o==='u'?ARU:ARD}</span>`).join('')}</div>
 <div class="blab"><span>${_t("Plus récente")}</span><span>${cap(ago(L[L.length-1].at))}</span></div>
 <div class="rrows">${L.slice(0,4).map((h,i)=>{const dd=GAMES.find(x=>x.code===h.code)||d,evh=dd&&dd.kind==='event';return `<div class="rrow${i===0?' fresh':''}"><span class="fxa">${esc(h.code)}</span><span class="hn"><b>${esc(h.name)}</b><small>${cap(ago(h.at))}</small></span>${sparkH(h.path,h.o==='u')}<span class="hv"><b class="${h.o==='e'?'eqv':h.o==='u'?'dir-u':'dir-d'}">${h.o==='e'?ARE:h.o==='u'?ARU:ARD}${evh?esc(lab(h)):bidi(plain(pctFx(h.ch)).slice(1))}</b>${h.my?`<small class="${h.my.win?'pl-up':'pl-dn'}">${(h.my.win?_t("Gagné "):_t("Perdu "))+F.signed(h.my.pnl)}</small>`:(h.o==='e'?`<small class="eqv">${_t("Break even")}</small>`:`<small>${_t("Pas joué")}</small>`)}</span></div>`;}).join('')}</div>`;}
function fcatsH(){const c=fcat();return `<div class="fpills" role="tablist" aria-label="${_t("Catégories du pari éclair")}">${FCATS.map(k=>`<button class="fpill${c===k?' on':''}${k!=='Tout'&&GAMES.some(x=>x.cat===k&&G(x.id).my)?' has':''}" data-a="fcat" data-v="${k}" role="tab" aria-selected="${c===k}">${_t(FCL[k]||k)}</button>`).join('')}</div>`;}
function ftabsH(d){const L=GAMES.filter(inCat);if(fmode()==='rot')return '';return `<div class="tabs fl-tabs" role="tablist" aria-label="${_t("Choisir un pari éclair")}">${L.map(x=>`<button class="${x.id===d.id?'on':''}${G(x.id).my?' has':''}" data-a="fgame" data-v="${x.id}" data-fgtab="${x.id}" role="tab" aria-selected="${x.id===d.id}">${esc(x.tab)}</button>`).join('')}</div>`;}
/* LG6 : cote estimée nette de frais (les frais sont proportionnels à la mise : la cote nette ne dépend pas du montant) */
const fMx=(d,g,side)=>{const amt=S.ui.flashAmt||10,net=amt-flashFee(d.cat,g,side,amt,myRank().t>=5),T=flashPool(g),W=g.pool[poolKey(side)];return F.mult(100*amt/Math.max(.01,net*(T+net)/(W+net)));};
/* UX1 : où sont rendus la mise et les boutons (colonne latérale à partir de 880 px, GRAND) ; un passage de seuil redessine la page */
let FLSIDE=null;
addEventListener('resize',()=>{if(FLSIDE!==null&&$('[data-flashcard]')&&GRAND()!==FLSIDE)render(false);});
/* UX3 : sur mobile, les catégories tiennent dans une liste déroulante, sur la rangée du mode de jeu */
function fcatSelH(){const c=fcat();return `<label class="fcat-sel"><select data-fcatsel aria-label="${_t('Catégories du pari éclair')}">${FCATS.map(k=>`<option value="${k}"${c===k?' selected':''}>${_t(FCL[k]||k)}${k!=='Tout'&&GAMES.some(x=>x.cat===k&&G(x.id).my)?' •':''}</option>`).join('')}</select></label>`;}
/* la phrase d'explication du mode reste affichée tant que le joueur n'a jamais joué de pari éclair ; ensuite elle s'ouvre avec « ? » */
const flashKnown=()=>S.me.logged&&(S.me.flashWins>0||S.me.flashBest>0||!!S.me.fmy||(S.me.history||[]).some(h=>h.k==='flash'));
const fhelpOpen=()=>S.ui.fmh===undefined?!flashKnown():!!S.ui.fmh;
document.addEventListener('change',e=>{const s=e.target.closest&&e.target.closest('select[data-fcatsel]');if(s)ACT.fcat({dataset:{v:s.value}});});
function fmodeH(){const m=fmode();return `<div class="seg fmode" role="group" aria-label="${_t("Mode de jeu")}"><button class="${m==='rot'?'on':''}" data-a="fmode" data-v="rot" title="${_t("Un pari vedette à la fois, qui change à chaque manche")}">${_t("{0} Rotation",[ic('rotate',14)])}</button><button class="${m==='free'?'on':''}" data-a="fmode" data-v="free" title="${_t("Tous les paris en parallèle, à toi de choisir")}">${_t("{0} Libre",[ic('layers',14)])}</button></div>`;}
function nextSubH(){return (fcat()==='Tout'?_t("Un pari différent"):_t("Catégorie ")+_t(fcat())+_t(", un pari différent"))+` ${_t("toutes les {0} secondes",[FDUR/1000])}`;}
function nextH(){const ph=flashPhase(),al=S.me.falerts||[];return [1,2,3].map(i=>{const d=GAMES[nthSpot(i)],s=Math.ceil(ph.left/1000)+(i-1)*FDUR/1000,on=al.includes(d.id);return `<div class="line nx"><span class="nxl"><span class="fxa">${d.code}</span><span class="nxn">${esc(d.name)}</span></span><span class="nxr">${_t("<b>dans {0} s</b>",[s])}<button class="bellt${on?' on':''}" data-a="falert" data-v="${d.id}" aria-pressed="${on}" aria-label="${_t("{0} l’alerte {1}",[on?_t("Désactiver"):_t("Activer"),esc(d.name)])}" title="${on?_t("Alerte activée"):_t("Me prévenir")}">${ic('bell',15)}</button></span></div>`;}).join('');}
function alertsCardH(){return `<section class="pn pad" data-falerts><div class="ph mb-1"><div><div class="h2">${_t("Notifications éclair")}</div><div class="sub">${_t("La cloche à côté d’un pari te prévient quand il passe en vedette.")}</div></div></div>
 <div class="tgls"><label class="tgl"><span class="tx">${_t("<b>Prévenir à chaque manche</b>")}<small>${_t("Une alerte à chaque nouveau pari vedette de ta catégorie.")}</small></span><input type="checkbox" data-fpref="fall"${S.me.fall?' checked':''}><span class="sl" aria-hidden="true"></span></label>
 <label class="tgl"><span class="tx">${_t("<b>Masquer les notifications éclair</b>")}<small>${_t("Plus de pop-up pour les résultats et les alertes éclair.")}</small></span><input type="checkbox" data-fpref="fmute"${S.me.fmute?' checked':''}><span class="sl" aria-hidden="true"></span></label></div></section>`;}
function friendsFlashH(){const F0=friendsOf(),f=S.flash,d=AG();if(!F0.length)return `<section class="pn pad"><div class="h2">${_t("Joue avec tes amis")}</div><div class="sub mt-1 mb-4">${_t("Ajoute des amis pour voir leurs mises sur chaque manche.")}</div><a class="btn b-ink full" href="#amis">${_t("{0} Ajouter des amis",[ic('plus',16,'#fff')])}</a></section>`;
 const L=F0.map(u=>{const r=rng(hash(u+d.id+f.round));const plays=r()<.62;const s=r()<.08?'be':r()<.5?'oui':'non';return {u,plays,s,amt:[5,10,25,50,100][Math.floor(r()*5)]};});const on=L.filter(x=>x.plays);
 return `<section class="pn pad"><div class="ph mb-1"><div><div class="h2">${_t("Tes amis sur ce pari")}</div><div class="sub">${on.length?`${_t("{0} sur {1} ont misé",[on.length,L.length])}`:_t("Aucun ami n’a encore misé")}</div></div><a class="link t-2" href="#amis">${_t("Ajouter")}</a></div>${L.map(x=>`<div class="frow sm"><a class="frl" href="#joueur-${x.u}">${avH(x.u,32,'span')}<span class="frn"><b>${esc(userOf(x.u).n)}${tagH(x.u,1)}</b></span></a><span class="fra">${x.plays?`<span class="fpick ${x.s==='be'?'eq':x.s}">${esc(sideLabel(d,x.s))}</span><small>${F.usd0(x.amt)}</small>`:`<small>${_t('Regarde')}</small>`}</span></div>`).join('')}</section>`;}
function flashGoalH(){const r=myRank();if(r.t>=4)return '';const need=TIERS[4].cond.flashWins,have=Math.min(need,S.me.flashWins);return `<a class="lockrow" href="#rang" style="margin-top:16px;flex-direction:column;align-items:stretch;gap:8px"><span class="fgoal-t t-1 fw-6"><span>${_t("Victoires pour débloquer Platine")}</span><bdi dir="ltr" data-fx="goal">${have} / ${need}</bdi></span><span class="xpbar sm"><i data-fx="goalbar" style="width:${have/need*100}%"></i></span></a>`;}
/* anneau : phase « Mises » (bleu, 30 s) puis phase « Résultat » (15 s), avec le nom de la phase dessous */
function ringH(){return `<div class="ringw"><div class="ring" data-fx="ring"><svg viewBox="0 0 60 60"><circle class="bgc" cx="30" cy="30" r="26"/><circle class="fgc" cx="30" cy="30" r="26" stroke-dasharray="163.4" stroke-dashoffset="0"/></svg><b data-fx="secs">${FOPEN/1000}</b></div><small class="rph" data-fx="rph">${_t('Mises')}</small></div>`;}
/* Carte Éclair de l'accueil (colonne latérale sur ordinateur, sous le marché phare sur téléphone). Un état clair à chaque
   instant, sur une seule ligne (data-fx="phase") : mises ouvertes avec le temps restant, ou fermées avec le temps avant le
   résultat, ou ta mise déjà placée. Pour un visiteur, les boutons restent actifs et mènent à l'inscription. */
function flashTeaserH(){const d=SPOT(),g=G(d.id),pr=flashPrices(g),s=src(d),vis=!S.me.logged;
 const bouton=(v,cls,lab,prix)=>vis?`<a class="btn ${cls}" href="#inscription" data-fgv="${v}">${esc(lab)} ${prix}</a>`:`<button class="btn ${cls}" data-a="flash-bet" data-fg="${d.id}" data-v="${v}">${esc(lab)} ${prix}</button>`;
 return `<section class="pn pad flt" data-flt><div class="flt-h"><span class="kick"><span class="bolt">${ic('bolt',13,'#fff',2.2)}</span>${_t("Éclair")} <span class="fxa" data-fx="asset">${d.code}</span></span>${ringH()}</div>
 <h3 data-fx="q">${qNw(d.q)}</h3>
 <div class="fp"><b class="num" data-fx="price">${d.kind==='event'?esc(g.board):d.fp(s.price)}</b><span class="delta" data-fx="chg"></span></div>
 <div class="fl-chart spark" data-fx="spark"></div>
 <div class="fbt">${bouton('oui','b-yes',d.a,`<span data-fx="po">${pr.o} ¢</span>`)}${bouton('non','b-no',d.b,`<span data-fx="pn">${pr.n} ¢</span>`)}</div>
 <p class="flt-st" data-fx="phase" aria-live="polite"></p>
 <div class="flt-f">${bouton('be','b-ghost sm eqb',d.e,`<span class="eqx" data-fx="mult">${beTxt(d)}</span>`)}<a class="link t-2" href="#eclair" data-fx="nextmini">${_t("Ensuite : {0}",[esc(GAMES[nthSpot(1)].name)])}</a></div></section>`;}
/* Écran Éclair.
   Téléphone : la carte du pari puis les blocs secondaires (repliés par refonte.js) ; la mise et les trois boutons forment
   la barre fixe du bas.
   Ordinateur (880 px et plus, GRAND) : composé pour le grand écran.
   - colonne latérale qui reste visible (.rail-fixe) : l'état de la manche sur une ligne, la mise, les trois boutons, ta mise
     ou le résultat de la manche précédente, puis les prochains paris vedettes ;
   - colonne principale : la carte du pari (question, prix, courbe et ses outils, cagnottes, volume), puis les blocs
     secondaires sur deux colonnes (dernières manches et règle à gauche, tes manches, amis et notifications à droite).
   Visiteur : les boutons restent actifs et mènent à l'inscription, comme sur la carte Éclair de l'accueil. */
function vFlash(){if(fmode()==='rot')S.ui.fgame=SPOT().id;const d=AG(),g=G(d.id),s=src(d),f=S.flash,pr=flashPrices(g),me=S.me,rot=fmode()==='rot',vis=!me.logged;
 const side=FLSIDE=GRAND(),help=fhelpOpen();
 const stkH=`<div class="fl-stk"><span class="lbl">${_t("Mise")} <b data-fa>${F.usd0(S.ui.flashAmt)}</b></span>${[5,10,25,50,100].map(q=>`<button class="btn b-ghost sm${S.ui.flashAmt===q?' on':''}" data-a="flash-amt" data-v="${q}">${F.usd0(q)}</button>`).join('')}</div>`;
 const fsdH=(cls,v,inner)=>vis?`<a class="fsd ${cls}" href="#inscription" data-fvis="${v}">${inner}</a>`:`<button class="fsd ${cls}" data-a="flash-bet" data-v="${v}">${inner}</button>`;
 const sidesH=`<div class="fl-sides">${fsdH('oui','oui',`<i class="mx" data-fx="mxo">${_t('{0} estimé',[fMx(d,g,'oui',pr.o)])}</i><span>${esc(d.a)}</span><b class="num" data-fx="po">${pr.o} ¢</b>`)}${fsdH('non','non',`<i class="mx" data-fx="mxn">${_t('{0} estimé',[fMx(d,g,'non',pr.n)])}</i><span>${esc(d.b)}</span><b class="num" data-fx="pn">${pr.n} ¢</b>`)}
 ${fsdH('eq','be',`<span class="eqt"><b>${esc(d.e)}</b><small data-fx="bed">${esc(bedTxt(d))}</small></span><span class="eqr"><b class="num" data-fx="mult">${beTxt(d)}</b><small data-fx="pe">${_t("{0} ¢ · {1} de chances",[pr.e,F.pct(Math.round(beP(d)*100))])}</small></span>`)}</div>`;
 const duelH=d.kind==='dir'?`<button class="btn b-white sm fl-duel" data-a="duel-open" data-m="flash:${d.id}">${_t("{0} Défier un ami",[ic('swords',14)])}</button>`:'';
 const outilsH=d.kind==='event'?'':`<div class="chtools fl">${ctypeSeg()}<span class="cdur" data-cdur="flash">${cdurH('flash')}</span>${side?duelH:''}</div>`;
 const phaseH='<div class="fl-phase" data-fx="phase"></div>',myH='<div class="fl-my" data-fx="my"></div>';
 const carteH=`<section class="pn pad flash-card" data-flashcard><div class="fl-top">${fcatsH()}${fcatSelH()}<div class="fmode-w">${fmodeH()}<button class="fhelp${help?' on':''}" data-a="fhelp" aria-expanded="${help}" aria-controls="fmode-h" aria-label="${_t('Expliquer les modes Rotation et Libre')}">${ic('info',16)}</button></div><p class="fmode-h" id="fmode-h"${help?'':' hidden'}>${rot?_t('Rotation : la page suit le pari vedette, qui change à chaque manche.'):_t('Libre : tu choisis ton pari et tu peux en jouer plusieurs par manche.')}</p></div>${ftabsH(d)}
 <div class="fl-h"><div><div class="kick"><i class="live"></i><span class="kt"><span class="kx">${_t("Pari éclair,")} </span>${_t("manche")} <b data-fx="round">${F.int(f.round)}</b>, <span data-fx="players">${F.int(g.players)}</span> ${_t("joueurs")}</span><span class="fxa" data-fx="asset">${d.code}</span>${rot?`<span class="xpc">${_t('Vedette')}</span>`:''}</div><h1 class="ptitle" data-fx="q">${qNw(d.q)}</h1></div>${ringH()}</div>
 <div class="fl-price${d.kind==='event'?' ev':''}"><b class="num" data-fx="price">${d.kind==='event'?esc(g.board):d.fp(s.price)}</b><span data-fx="chg"></span></div><div class="fl-chart" data-fx="chart"></div>${outilsH}${side?'':`${phaseH}
 <div class="fl-amts">${stkH}${duelH}</div>
 ${sidesH}
 ${myH}`}<div class="fl-pool"><div class="pl2"><span class="up" data-fx="poolo"></span><span class="eqp" data-fx="poole"></span><span class="dn" data-fx="pooln"></span></div><div class="split"><i data-fx="split"></i></div></div>
 <div class="mt-5"><div class="trh">${_t("<b>Volume de la manche</b>")}<span class="legend"><span><i class="sw-o"></i>${esc(d.a)}</span><span><i class="sw-n"></i>${esc(d.b)}</span><span><i class="sw-be"></i>${esc(d.e)}</span><span><i class="sw-me"></i>${_t("Toi")}</span></span></div><div class="trail mid" data-trail="flash"></div></div></section>`;
 /* blocs secondaires (sur ordinateur, la phrase sur le mode Libre disparaît : l'aide « ? » du mode l'explique déjà) */
 const nextC=`<section class="pn pad"><div class="ph mb-2"><div><div class="h2">${_t("Prochains paris vedettes")}</div><div class="sub" data-fx="nextsub">${nextSubH()}</div></div></div><div data-fx="next">${nextH()}</div>${rot||side?'':`<p class="sub mt-3">${_t("En mode Libre, tous les paris tournent en même temps : la vedette ne sert qu’aux alertes et à l’accueil.")}</p>`}</section>`;
 const mesC=`<section class="pn pad"><div class="h2">${_t("Tes manches")}</div><div class="pf-stats" style="grid-template-columns:repeat(2,minmax(0,1fr));padding:16px 0 0;border:0"><div><small>${_t("Victoires")}</small><b class="num" data-fx="wins">${me.flashWins}</b></div><div><small>${_t("Série en cours")}</small><b class="num" data-fx="streak">${me.flashStreak}</b></div><div><small>${_t("Meilleure série")}</small><b class="num" data-fx="best">${me.flashBest}</b></div><div><small>${_t("Gains éclair")}</small><b class="num ${plc(me.flashProfit)}" data-fx="fprofit">${F.signed(me.flashProfit)}</b></div></div>${flashGoalH()}</section>`;
 const histC=`<section class="pn pad"><div class="ph mb-4"><div><div class="h2">${_t("Dernières manches{0}",[rot?'':', '+esc(d.tab)])}</div><div class="sub">${rot?_t("Les 12 derniers paris vedettes"):_t("Les 12 dernières manches de ce pari")}</div></div></div><div class="rounds" data-fx="hist">${histH(rot?f.hist:g.hist,rot?null:d)}</div></section>`;
 const howC=`<section class="pn pad"><div class="h2 mb-4">${_t("Comment ça marche")}</div><ol class="steps"><li>${_t("Une manche de {0} secondes, {1} paris en parallèle. En mode Rotation, la page suit le pari vedette qui change à chaque manche ; en mode Libre, tu choisis ton pari et tu peux en jouer plusieurs par manche.",[FDUR/1000,GAMES.length])}</li><li>${_t("Choisis ta mise, puis ton camp ou le break even pendant les {0} premières secondes. Les mises se ferment pendant les {1} dernières.",[FOPEN/1000,(FDUR-FOPEN)/1000])}</li><li>${esc(d.how)}</li><li>${_t("Les gagnants se partagent les mises des perdants : plus il y a d’argent de ton côté, plus ta cote baisse. Les frais dépendent du pari et de la cote.")}</li></ol>${demoHint(_t('Les prix, les scores et les résultats sont simulés.'))}</section>`;
 const tete=`<div class="wrap jx jx-eclair">${bzModesH('eclair')}${typeof clanWarBarH==='function'?clanWarBarH():''}`;
 if(!side)return `${tete}<div class="g-side"><div class="col">${carteH}</div>
 <div class="col">${nextC}${me.logged?`<div data-ffr>${friendsFlashH()}</div>${alertsCardH()}
 ${mesC}`:''}
 ${histC}
 ${howC}</div></div></div>`;
 return `${tete}<div class="g-side"><div class="col">${carteH}
 <div class="grille12 fl-plus">${me.logged?`<div class="col s7">${histC}${howC}</div><div class="col s5">${mesC}<div data-ffr>${friendsFlashH()}</div>${alertsCardH()}</div>`:`<div class="col s7">${histC}</div><div class="col s5">${howC}</div>`}</div></div>
 <div class="col rail-fixe"><section class="pn pad fl-bet" data-flbet aria-label="${_t('Miser sur ce pari')}">${phaseH}<div class="fl-amts">${stkH}</div>${sidesH}${myH}</section>${nextC}</div></div></div>`;}
let FXEL=null;
function fxCache(){FXEL={};$$('[data-fx]').forEach(e=>{(FXEL[e.dataset.fx]=FXEL[e.dataset.fx]||[]).push(e);});FXEL._bets=$$('[data-a="flash-bet"]');FXEL._tabs=$$('[data-fgtab]');FXEL._cats=$$('[data-fcat]');}
/* E2, FL1 : n'écrire dans la page que ce qui change (texte ou bloc identique : aucune écriture) */
const fxT=(e,v)=>{v=String(v);if(e._v!==v){e._v=v;e.textContent=v;}};
const fxH=(e,h)=>{if(e._h!==h){e._h=h;e.innerHTML=h;}};
/* FL2 : graphique de la manche. Tant que l'échelle, la zone break even et les repères ne changent pas, seul le tracé est mis à jour. */
function fxChart(e,h){if(e._h===h)return;const k=h.lastIndexOf('<path class="ln" d="'),m=k<0?null:/^<path class="ln" d="([^"]*)" style="stroke:([^"]*)"\/><\/svg>/.exec(h.slice(k)),key=m?h.slice(0,k)+'|'+h.slice(k+m[0].length):null;
 const p=key!==null&&e._k===key?e.querySelector('svg>path.ln:last-of-type'):null;if(p){p.setAttribute('d',m[1]);p.style.stroke=m[2];}else{e.innerHTML=h;e._k=key;}e._h=h;}
function updateFlash(force){if(!FXEL||force)fxCache();const f=S.flash,ph=flashPhase(),onPage=!!$('[data-flashcard]'),d=onPage?AG():SPOT(),g=G(d.id),s=src(d),pr=flashPrices(g),secs=Math.ceil(ph.left/1000),ch=s.price-s.start,ev=d.kind==='event';const set=(k,fn)=>{const L=FXEL[k];if(L)for(const e of L)fn(e);},slow=force||Math.floor(ph.left/250)%2===0,setS=(k,fn)=>{if(slow)set(k,fn);};
 setS('price',e=>{const t=ev?g.board:d.fp(s.price);if(e._t!==t){e._t=t;if(!ev&&(d.fp===fU3||d.fp===fYen3))e.innerHTML=esc(t).replace(/(\d)(\D*)$/,'<i class="d3">$1</i>$2');else e.textContent=t;}const p=e.parentElement;if(p&&p.classList.contains('fl-price'))p.classList.toggle('ev',ev);});
 setS('chg',e=>{let t,c;if(ev){t=g.sub;c='delta';}else if(d.kind==='vol'){const pc=Math.abs(s.price/s.start-1)*100,big=gOut(d)===1;t=`${_t("Mouvement : {0} % (seuil {1} %)",[F.d2(pc),F.d2(FVOL*100)])}`;c='delta '+(big?'up':'dn');}else if(!/[1-9]/.test(plain(d.fc(Math.abs(ch))))){t=_t('Stable depuis le départ');c='delta';}else{t=`${_t("{0} depuis le départ",[bidi((ch>=0?'+':'−')+plain(d.fc(Math.abs(ch))))])}`;c='delta '+(ch>=0?'up':'dn');}if(e._v!==t){e._v=t;e.textContent=t;}if(e.className!==c)e.className=c;});
 const pl=ph.open?ph.openLeft:ph.left,ptot=ph.open?f.open:f.dur-f.open,pname=ph.open?_t('Mises'):_t('Résultat');
 set('secs',e=>fxT(e,Math.ceil(pl/1000)));set('ring',e=>{e.classList.toggle('lockd',!ph.open);const c=e.querySelector('.fgc');if(c)c.style.strokeDashoffset=(163.4*(1-pl/ptot)).toFixed(1);});set('rph',e=>{if(e.textContent!==pname)e.textContent=pname;});
 set('round',e=>fxT(e,F.int(f.round)));setS('players',e=>fxT(e,F.int(g.players)));setS('po',e=>fxT(e,F.c(pr.o)));setS('pn',e=>fxT(e,F.c(pr.n)));setS('mxo',e=>fxT(e,_t('{0} estimé',[fMx(d,g,'oui',pr.o)])));setS('mxn',e=>fxT(e,_t('{0} estimé',[fMx(d,g,'non',pr.n)])));setS('pe',e=>fxT(e,_t('{0} ¢ · {1} de chances',[pr.e,F.pct(Math.round(beP(d)*100))])));set('mult',e=>fxT(e,beTxt(d)));set('bed',e=>fxT(e,bedTxt(d)));
 set('phase',e=>{const gm=e.closest('[data-flt]')?G(SPOT().id):g;fxH(e,!S.me.logged&&!ph.open?`${ic('rotate',16)} ${_t("Prochaine manche dans {0} s",[secs])}`:gm.my?`${ic('check',16)} ${_t("Ta mise est placée, résultat dans {0} s",[secs])}`:ph.open?`<i class="live"></i>${_t("Mises ouvertes encore {0} s",[Math.ceil(ph.openLeft/1000)])}`:`${ic('lock',16)} <span class="pl">${_t("Mises fermées,")}</span><span class="ps">${_t("Fermé,")}</span> ${_t("résultat dans {0} s",[secs])}`);});
 for(const b of FXEL._bets)b.disabled=!ph.open||!!G(b.dataset.fg||d.id).my;
 for(const b of FXEL._tabs)b.classList.toggle('has',!!G(b.dataset.fgtab).my);
 const tot=g.pool.o+g.pool.n;set('split',e=>{const w=(g.pool.o/tot*100).toFixed(1)+'%';if(e._v!==w){e._v=w;e.style.width=w;}});setS('poolo',e=>fxH(e,`<small>${esc(d.a)}</small><b>${F.usd0(g.pool.o)}</b>`));setS('pooln',e=>fxH(e,`<small>${esc(d.b)}</small><b>${F.usd0(g.pool.n)}</b>`));setS('poole',e=>fxH(e,`<small>${esc(d.e)}</small><b>${F.usd0(g.pool.e)}</b>`));
 set('my',e=>{let cls,h,fx=false;if(g.my){cls='fl-my has';const lab=sideLabel(d,g.my.s);const est=flashPayout(g,g.my),l1=`<span>${_t("Ta mise : <b>{0}</b> sur {1}, frais {2}",[F.usd(g.my.amt),esc(lab),F.usd(g.my.fee)])}</span>`,cl=typeof clanFlashH==='function'?clanFlashH(d.id):'';
   if(ev){h=l1+`<span>${F.kv('<b>'+_t('Gain estimé si tu gagnes')+'</b>',F.usd(est))}</span>`+cl;}
   else{const w=SIDEV[g.my.s]===gOut(d);h=l1+`<span class="${w?'pl-up':'pl-dn'}">${w?_t('Pour l’instant : {0} · gain estimé : {1}',['<b>'+_t('gagnant')+'</b>',F.usd(est)]):_t('Pour l’instant : {0} · gain si ça se retourne : {1}',['<b>'+_t('perdant')+'</b>',F.usd(est)])}</span>`+cl;}}
  else{/* résultat de la manche qui vient de finir, affiché jusqu'à la suivante */
   const rd=onPage&&fmode()==='rot'?(GM[f.lastSpot]||d):d,rr=G(rd.id).result,res=rr&&rr.round===f.round-1?rr:null;
   const kn=flashKnown(),hint=(kn?'':`<span class="fh-t"><span class="${ph.open?'on':''}">${_t("Choisis ta mise, puis {0}, {1} ou {2}.",[esc(d.a),esc(d.b),esc(d.e)])}</span><span class="${ph.open?'':'on'}">${_t("Mises fermées pour cette manche. La suivante arrive.")}</span></span>`)+`<span class="xpc"${ph.open?'':' aria-hidden="true" style="visibility:hidden"'}>${_t("+10 XP par mise, +40 XP si tu gagnes")}</span>`;
   if(res){cls='fl-my res'+(kn?' kn':'');fx=true;const out=res.out===2?rd.e:res.out===1?rd.a:rd.b,oc=res.out===2?'eqv':res.out===1?'dir-u':'dir-d';
    h=`<div class="fl-res"><span class="fr1"><b>${_t('{0}, manche {1}',[esc(rd.name),F.int(res.round)])}</b>${rd.kind==='event'||res.p0===undefined?'':` · ${bidi(plain(rd.fp(res.p0))+' → '+plain(rd.fp(res.p1)))}`} · <b class="${oc}">${esc(out)}</b></span>${res.res&&res.res.unk?'':`<span class="fr2 ${res.res?(res.res.win?'pl-up':'pl-dn'):''}">${res.res?(res.res.late?_t('Ton résultat : {0}',[F.signed(res.res.pnl)]):res.res.win?_t('Gagné : {0}',[bidi('+'+plain(F.usd(res.res.pay)))]):_t('Perdu : {0}',[bidi('−'+plain(F.usd(res.res.amt)))]))+' · '+_t('Série de victoires : {0}',[S.me.flashStreak]):_t('Tu n’as pas joué cette manche.')}</span>`}</div><div class="fl-hint">${hint}</div>`;}
   else{cls='fl-my'+(kn?' kn':'');h=hint;}}
  if(e._h===h&&e.className===cls)return;e._h=h;e.className=cls;e.innerHTML=h;if(fx)fixText(e);});
 set('chart',e=>fxChart(e,flashChart(false,d)));set('spark',e=>fxChart(e,flashChart(true,SPOT())));if(Math.floor(ph.left/250)%4===0)set('next',e=>{const h=nextH();if(e._h!==h){e._h=h;e.innerHTML=h;fixText(e);}});
 if(FTIP)ftipDraw();}
/* Info-bulle d'une courbe de manche (Éclair, Blitz Royale, La Série), à la souris ou au doigt : un trait vertical, un point
   sur la courbe et « 97 706,41 $ · 14:05:31 ». Les points viennent de l'état du jeu ; l'échelle, des attributs data-mn,
   data-mx, data-np et data-nx que flashChart pose sur le dessin. Redessinée à chaque mise à jour tant que le pointeur reste
   sur la courbe (le dessin est parfois remplacé en entier). La courbe d'une fiche de marché a son propre réticule (auth.js). */
let FTIP=null,FTIPT=0;
const hms=t=>{const x=new Date(t);return LANG==='en'?x.toLocaleTimeString(LOC,{hour:'numeric',minute:'2-digit',second:'2-digit'}):[x.getHours(),x.getMinutes(),x.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');};
function ftipData(el){
 if(el.dataset.fx==='chart'){const d=AG(),f=src(d),sd=d.kind==='event'?null:(d.kind==='vol'?GM.btc:d);return {d,a:f.path,pre:sd?fTail(sd).concat([f.start]):[],t0:S.flash.t0};}
 if(el.dataset.bz==='chart'){const r=bzR();return r&&r.path?{d:bzGame(),a:r.path,pre:[],t0:r.rStart}:null;}
 if(el.dataset.sr==='chart'){const s=serieCur();return s&&s.path?{d:GM[s.gid],a:s.path,pre:[],t0:s.rStart}:null;}
 return null;}
/* valeur lissée comme le tracé (moyenne sur 3 points), pour poser le point sur la ligne */
const ftipLisse=(L,i)=>i>=L.length-1?L[i]:(L[Math.max(0,i-1)]+L[i]+L[i+1])/3;
function ftipDraw(){const el=FTIP&&FTIP.el;if(!el||!el.isConnected){FTIP=null;return;}const svg=el.querySelector('svg'),D=svg&&ftipData(el);if(!D||!D.a.length)return;
 const mn=+svg.dataset.mn,mx=+svg.dataset.mx,NP=+svg.dataset.np||0,NX=+svg.dataset.nx;if(!(mx>mn)||!(NX>0))return;
 const pre=NP?D.pre:[],j=clamp(Math.round(FTIP.fx*NX),0,NP+D.a.length-1),ante=j<NP,L=ante?pre:D.a,i=ante?j:j-NP,v=L[i],vl=ftipLisse(L,i);if(typeof v!=='number')return;
 const X=j/NX*100,Y=(1-(vl-mn)/(mx-mn))*100,d=D.d,val=d.kind==='event'?`${esc(d.a)} ${d.fp(v)}`:d.fp(v);
 let o=el.querySelector('.ftip');if(!o){o=document.createElement('div');o.className='ftip';o.setAttribute('aria-hidden','true');el.appendChild(o);}
 const cl='ftl'+(Y<24?' bas':'')+(X<14?' deb':X>86?' fin':''),pos=`inset-inline-start:${X.toFixed(2)}%`;
 o.innerHTML=`<i class="vx" style="${pos}"></i><i class="hd" style="${pos};top:${Y.toFixed(2)}%"></i><span class="${cl}" style="${pos};top:${Y.toFixed(2)}%"><b>${val}</b> <span>${hms(D.t0+(j-NP)*FTICK)}</span></span>`;}
function ftipClear(){FTIP=null;$$('.fl-chart .ftip').forEach(x=>x.remove());}
function ftipAt(e){const el=e.target&&e.target.closest?e.target.closest('.fl-chart:not(.spark)'):null;if(!el){if(FTIP)ftipClear();return;}clearTimeout(FTIPT);const r=el.getBoundingClientRect();if(!r.width)return;
 if(FTIP&&FTIP.el!==el)ftipClear();FTIP={el,fx:clamp((e.clientX-r.left)/r.width,0,1)};ftipDraw();}
document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||FTIP)ftipAt(e);},{passive:true});
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')ftipAt(e);},{passive:true});
{const fin=e=>{if(e.pointerType!=='mouse'&&FTIP){clearTimeout(FTIPT);FTIPT=setTimeout(ftipClear,1800);}};document.addEventListener('pointerup',fin,{passive:true});document.addEventListener('pointercancel',fin,{passive:true});}
document.addEventListener('mouseout',e=>{if(!e.relatedTarget&&FTIP)ftipClear();});
/* Échap referme l'explication des modes Rotation et Libre (si aucune fenêtre n'est ouverte) ; le focus revient sur « ? » */
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||(S.ui.route||'')!=='eclair'||$('#ov')||!fhelpOpen())return;S.ui.fmh=false;render(false);const b=$('[data-a="fhelp"]');if(b)b.focus();});
function updateFlashStatic(){const d=SPOT(),g=G(d.id),pr=flashPrices(g);$$('[data-fx="q"]').forEach(e=>{e.innerHTML=qNw(d.q);fixText(e);swapIn(e);});   /* « sera-t-il » ne se coupe pas au trait d'union (qNw) */$$('[data-fx="asset"]').forEach(e=>{e.textContent=d.code;swapIn(e);});$$('[data-fx="nextmini"]').forEach(e=>e.textContent=_t("Ensuite : ")+GAMES[nthSpot(1)].name);$$('[data-fx="next"]').forEach(e=>{e.innerHTML=nextH();fixText(e);});$$('[data-a="flash-bet"][data-fg]').forEach(b=>{b.dataset.fg=d.id;const t=b.dataset.v;b.firstChild.textContent=(t==='oui'?d.a:t==='non'?d.b:d.e)+' ';});$$('[data-fgv]').forEach(b=>{const t=b.dataset.fgv;b.firstChild.textContent=(t==='oui'?d.a:t==='non'?d.b:d.e)+' ';});fxCache();}
function swapIn(e){e.classList.remove('swap');void e.offsetWidth;e.classList.add('swap');}
function showFlashResult(){const d=fmode()==='rot'?(GM[S.flash.lastSpot]||AG()):AG(),r=G(d.id).result;set2();const card=$('[data-flashcard]');if(!card||!r)return;const me=r.res,o=document.createElement('div');o.className='flres '+(me?(me.win?'win':'lose'):(r.out===2?'eq':''));const lab=[d.b,d.a,d.e][r.out];
 const sub=me?(me.win?(me.be?_t("Break even, +120 XP"):_t("Gagné, +40 XP")):_t("Perdu cette fois")):esc(r.out===2?d.rbe:d.kind==='event'?(r.out===1?d.rs(true):d.rs(false)):d.rs(r.out===1));
 o.setAttribute('role','status');o.innerHTML=`<div class="flr-in"><div class="flr-t"><div class="kick">${_t("{0}, manche {1} terminée",[esc(d.name),F.int(r.round)])}</div><p class="muted">${sub} ${fmode()==='rot'?_t("Prochain pari vedette : ")+esc(SPOT().name)+'.':_t("La manche suivante est ouverte.")}</p></div><div class="big">${me?(me.win?'+'+F.usd(me.pay):'−'+F.usd(me.amt)):esc(lab)}</div><button class="x" data-a="flres-close" aria-label="${_t('Fermer')}">${ic('x',16)}</button></div>`;card.appendChild(o);fixText(o);if(me&&me.win)confetti(me.be?80:40);setTimeout(()=>o.remove(),2800);}
function set2(){const me=S.me,d=AG();const s=(k,q)=>$$(`[data-fx="${k}"]`).forEach(e=>e.textContent=q);s('wins',me.flashWins);s('streak',me.flashStreak);s('best',me.flashBest);s('fprofit',F.signed(me.flashProfit));$$('[data-fx="fprofit"]').forEach(e=>e.className='num '+plc(me.flashProfit));$$('[data-fx="hist"]').forEach(e=>e.innerHTML=histH(fmode()==='rot'?S.flash.hist:G(d.id).hist,fmode()==='rot'?null:d));const need=TIERS[4].cond.flashWins;s('goal',Math.min(need,me.flashWins)+' / '+need);$$('[data-fx="goalbar"]').forEach(e=>e.style.width=Math.min(100,me.flashWins/need*100)+'%');}
Object.assign(ACT,{
 'flash-bet':(a,e)=>flashBet(a.dataset.v,e,a.dataset.fg),
 'flash-amt':a=>{S.ui.flashAmt=+a.dataset.v;$$('[data-a="flash-amt"]').forEach(b=>b.classList.toggle('on',+b.dataset.v===S.ui.flashAmt));$$('[data-fa]').forEach(e=>e.textContent=F.usd0(S.ui.flashAmt));},
 'flres-close':a=>{const o=a.closest('.flres');if(o)o.remove();},
 fhelp:()=>{S.ui.fmh=!fhelpOpen();render(false);},
 fopen:a=>{const d=GM[a.dataset.v];if(!d||!S.me.logged)return;S.me.fmode='free';if(!inCat(d)){S.me.fcat='Tout';S.flash.spot=fSpot(S.flash.round);S.flash.hist=null;}S.ui.fgame=d.id;save();if((S.ui.route||'')==='eclair')render(false);},
 fgame:a=>{S.ui.fgame=a.dataset.v;render(false);},
 fmode:a=>{S.me.fmode=a.dataset.v==='rot'?'rot':'free';if(S.me.fmode==='rot')S.ui.fgame=SPOT().id;save();render(false);},
 fcat:a=>{const v=a.dataset.v;if(v===fcat())return;S.me.fcat=v;save();S.flash.spot=fSpot(S.flash.round);S.flash.hist=null;if(!inCat(AG()))S.ui.fgame=(GAMES.find(inCat)||GAMES[0]).id;if(fmode()==='rot')S.ui.fgame=SPOT().id;render(false);},
 falert:a=>{const k=a.dataset.v,L=S.me.falerts=(S.me.falerts||[]);const i=L.indexOf(k);if(i>=0)L.splice(i,1);else L.push(k);save();const on=i<0;$$(`[data-a="falert"][data-v="${k}"]`).forEach(b=>{b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});toast({icon:'info',force:true,title:on?`${_t("Alerte activée : {0}",[GM[k].name])}`:`${_t("Alerte retirée : {0}",[GM[k].name])}`,text:on?_t("Tu seras prévenu quand il passe en vedette."):_t("Plus de notification pour ce pari."),dur:2400});}
});
document.addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.fpref;if(!k)return;S.me[k]=e.target.checked;save();toast({icon:'info',force:true,title:k==='fmute'?(e.target.checked?_t("Notifications éclair masquées"):_t("Notifications éclair réactivées")):(e.target.checked?_t("Alerte à chaque manche activée"):_t("Alerte à chaque manche coupée")),dur:2200});});

/* barre des paris : recentre la puce active (la vue est reconstruite à chaque choix) */
/* rangées d'onglets défilantes : l'onglet actif est ramené dans la vue */
function centerTabs(){$$('.fl-tabs,.filters .tabs,.ptabs,.ctabs,.fl-top .fpills,.tabs.subnav').forEach(   /* .subnav : sous 370 px, l'onglet actif d'une destination reste à l'écran */tb=>{const on=tb.querySelector('.on');if(!on||tb.scrollWidth<=tb.clientWidth+1)return;const b=tb.getBoundingClientRect(),r=on.getBoundingClientRect();tb.scrollLeft+=(r.left+r.width/2)-(b.left+b.width/2);});tabArrows();tabFades();}
/* fondu aussi au début d'une rangée une fois qu'elle a défilé (le fondu de fin est toujours là) */
function tabFades(){$$('.fl-tabs,.filters .tabs,.ptabs,.ctabs,.fl-top .fpills').forEach(tb=>{if(tb.dataset.fd)return;tb.dataset.fd=1;const upd=()=>tb.classList.toggle('at-s',Math.abs(tb.scrollLeft)>6);tb.addEventListener('scroll',upd,{passive:true});upd();});}
/* B6 : sur un écran à souris, une rangée d'onglets qui déborde reçoit deux flèches de défilement ‹ › */
function tabArrows(){if(!matchMedia('(hover:hover) and (pointer:fine)').matches)return;$$('.fl-tabs,.filters .tabs').forEach(tb=>{if(tb.querySelector('.tarr'))return;if(tb.scrollWidth<=tb.clientWidth+1)return;
  const mk=d=>{const b=document.createElement('button');b.type='button';b.className='tarr '+d;b.dataset.a='tscroll';b.dataset.v=d;b.setAttribute('aria-label',d==='prev'?_t('Précédent'):_t('Suivant'));b.innerHTML=ic('right',16);return b;};
  const p=mk('prev'),n=mk('next');tb.insertBefore(p,tb.firstChild);tb.appendChild(n);tb.classList.add('has-arr');
  const upd=()=>{const x=Math.abs(tb.scrollLeft),mx=tb.scrollWidth-tb.clientWidth;p.classList.toggle('off',x<4);n.classList.toggle('off',x>mx-4);};tb.addEventListener('scroll',upd,{passive:true});upd();});}
ACT.tscroll=a=>{const tb=a.parentElement;tb.scrollBy({left:(a.dataset.v==='next'?1:-1)*(RTL?-1:1)*tb.clientWidth*.7,behavior:doux()});};

