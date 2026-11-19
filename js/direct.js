/* WIMORO — données vivantes et pari éclair à cours réels (partie D) */

'use strict';
/* =====================================================================================
 *  Données vivantes et pari éclair à cours réels, dans tous les modes (visiteur, compte démo, vrai compte)
 *  ------------------------------------------------------------------------------------
 *  Lectures (js/api.js : API.live, API.fixations ; pour un visiteur et le compte démo, une lecture REST avec la clé
 *  publique, sans la bibliothèque Supabase) :
 *    - api_live() : le dernier cours de chaque actif et, pour le jeu à l'écran, la courbe de ses 90 dernières secondes ;
 *      toutes les 10 s sur l'éclair, le Blitz et la Série, toutes les 30 s ailleurs, seulement onglet visible ;
 *    - api_fixations(jeu) : les fixations de son actif (une par frontière de manche, écrites une fois) et les modes figés
 *      par la base ; une fois par manche quelques secondes après la frontière, de nouveau tant qu'il en manque une.
 *  Jamais d'échec bloquant : le dernier instantané reste affiché, marqué « retardée » quand il vieillit.
 *
 *  Le pari éclair à cours réels, PAR CLIENT : l'interrupteur global reste éteint (le site en ligne joue comme avant).
 *  Pour chaque jeu à vraie source (js/moteur-reel.js), une manche est :
 *    - réelle (r) : la fixation r − 2 de son actif est « ok » et écrite avant le début de la manche. Elle se joue sur les
 *      fixations avec le moteur v2 : départ = fixation r, fin = fixation r + 1, foule simulée penchée selon r − 2 ; le
 *      résultat est le même pour tous. Le compte démo et les visiteurs règlent ici, un vrai compte envoie « reel: true »
 *      et le serveur règle (Edge Function « eclair » v6) ;
 *    - en pause (p) : pas de fixation récente (place fermée, clé absente, données muettes) : « Marché fermé » ou
 *      « En pause », la dernière clôture, et la rotation propose les jeux ouverts 24 h sur 24 ;
 *    - simulée (s) : jeu sans vraie source (« simulé » à côté du prix), ou aucune fixation lisible depuis l'ouverture de
 *      la page : tout reste alors simulé, exactement comme avant.
 *  L'état simulé d'avant (S.games, G) n'est pas touché : La Série, le Blitz et les duels continuent de s'en servir. L'état
 *  d'une manche réelle vit à part (S.reel) ; l'écran de l'éclair le lit par GA() (js/flash.js).
 * ===================================================================================== */
const MR=MoteurReel;
const JEUX_REELS=Object.keys(MR.ACTIF);
/* le cours montré quand un jeu de bourse est en pause : l'indice lui-même pour le Nasdaq 100 et le S&P 500 */
const COURS_PAUSE={ndx:'ndx',spx:'spx'};
/* le cours suivi pendant une manche réelle : celui de l'actif des fixations (fonds QQQ et SPY pour les deux indices) */
const COURS_ACTIF={qqq:'qqq',spy:'spy'};
const DIR={live:null,liveLu:0,liveEssai:0,liveKo:0,liveEnCours:false,serie:{},F:{},jeux:{},modes:{},attente:{},lu:false};
S.reel=S.reel||{};

/* ===================== Lectures ===================== */
const routeDirect=()=>S.ui.route||(location.hash||'#accueil').slice(1).split(/[-?]/)[0]||'accueil';   /* avant le premier rendu : l'adresse */
const routeEclair=()=>['eclair','blitz','serie'].includes(routeDirect());
/* l'actif dont on demande la courbe : le jeu à l'écran sur l'éclair, le pari vedette sur l'accueil */
function directSerie(){const rt=routeDirect(),d=rt==='eclair'?AG():rt==='accueil'?SPOT():null;return d&&MR.ACTIF[d.id]?MR.ACTIF[d.id]:null;}
function directPoints(actif,pts){if(!actif||!Array.isArray(pts))return;const L=DIR.serie[actif]||(DIR.serie[actif]=[]),vus=new Set(L.map(x=>x[0]));
 for(const q of pts)if(Array.isArray(q)&&typeof q[0]==='number'&&typeof q[1]==='number'&&q[1]>0&&!vus.has(q[0])){L.push([q[0],q[1]]);vus.add(q[0]);}
 L.sort((a,b)=>a[0]-b[0]);const lim=L.length?L[L.length-1][0]-240000:0;while(L.length>2&&L[0][0]<lim)L.shift();}   /* 4 minutes, à l'heure du serveur */
async function directLive(){if(DIR.liveEnCours)return;DIR.liveEnCours=true;DIR.liveEssai=Date.now();const serie=directSerie();
 try{const x=await API.live(serie);if(!x||typeof x!=='object'||!x.cours)throw new Error('vide');
  DIR.live=x;DIR.liveLu=Date.now();DIR.liveKo=0;if(serie)directPoints(serie,x.serie);
  for(const a of Object.values(MR.ACTIF)){const c=x.cours[COURS_ACTIF[a]||a];if(c&&c.e!=='s'&&typeof c.t==='number')directPoints(a,[[c.t,+c.p]]);}
  reelApresDonnees();}
 catch(e){DIR.liveKo++;}
 finally{DIR.liveEnCours=false;}}
/* les fixations d'un jeu : la première lecture prend douze manches (l'historique), les suivantes la fenêtre de la manche */
async function directFix(gid,de,a){const j=DIR.jeux[gid]||(DIR.jeux[gid]={});if(j.enCours)return;j.enCours=true;j.essai=Date.now();const r=fRound(fNow());
 try{const x=await API.fixations(gid,de!=null?de:(j.lu?r-1:r-11),a!=null?a:r);if(!x||typeof x!=='object'||typeof x.F!=='object')throw new Error('vide');
  directFixMettre(gid,x);j.lu=Date.now();j.luSrv=fNow();j.ko=0;DIR.lu=true;reelApresDonnees(gid);}
 catch(e){j.ko=(j.ko||0)+1;}
 finally{j.enCours=false;}}
function directFixMettre(gid,x){const j=DIR.jeux[gid],actif=x.actif||MR.ACTIF[gid];if(x.config)j.config=x.config;
 const M=j.manches||(j.manches={});for(const k in x.manches||{})M[+k]=x.manches[k];
 if(actif){const F=DIR.F[actif]||(DIR.F[actif]={});for(const k in x.F||{}){const f=x.F[k];if(f&&typeof f==='object')F[+k]=f;}
  const garde=fRound(fNow())-40;for(const k of Object.keys(F))if(+k<garde&&!Object.values(DIR.attente).some(z=>z.r+1>=+k&&MR.ACTIF[z.gid]===actif))delete F[k];}
 for(const k of Object.keys(M))if(+k<fRound(fNow())-40)delete M[k];}
/* les jeux dont on lit les fixations : tous sur l'éclair et l'accueil ; ailleurs, ceux dont une mise ou un résultat attend */
function jeuxALire(){const rt=routeDirect();if(rt==='eclair'||rt==='accueil')return JEUX_REELS;const s=new Set();for(const z of Object.values(DIR.attente))s.add(z.gid);return [...s];}
/* faut-il relire les fixations d'un jeu maintenant ? */
function fixDue(gid,t){const j=DIR.jeux[gid]||(DIR.jeux[gid]={});if(j.enCours)return false;const depuis=t-(j.essai||0);
 if(!j.lu)return depuis>=Math.min(60000,(j.ko||0)*5000);
 const r=fRound(fNow()),ms=fNow()-fT0(r),F=DIR.F[MR.ACTIF[gid]]||{};
 /* une fin de manche qui attend sa fixation (résultat à vérifier) : toutes les 3 s au début, puis toutes les 10 s */
 const attend=Object.values(DIR.attente).some(z=>z.gid===gid&&!F[z.r+1]);
 if(attend&&ms>=3500)return depuis>=(ms<20000?3000:10000);
 const muet=!Object.keys(F).some(k=>+k>=r-10);                                           /* jeu sans fixation récente (bourse fermée…) */
 if(!F[r-2]&&!muet)return depuis>=10000;                                                 /* le mode de la manche n'est pas encore connu (retour d'une autre page) */
 if(F[r])return false;                                                                   /* le départ de la manche est connu */
 if(ms<3500)return false;                                                                /* la fixation s'écrit 3 à 4 s après la frontière */
 if(muet)return depuis>=180000;
 return depuis>=(ms<20000?3000:15000);}
/* une manche ancienne dont la fin manque (mise retrouvée au chargement) : sa fenêtre précise */
function fixAncienne(t){for(const z of Object.values(DIR.attente)){const F=DIR.F[MR.ACTIF[z.gid]]||{},j=DIR.jeux[z.gid]||(DIR.jeux[z.gid]={});if(F[z.r]&&F[z.r+1]||j.enCours||t-(j.essai||0)<10000)continue;
  if(z.r<fRound(fNow())-2){directFix(z.gid,z.r,z.r);return;}}}
/* le cadenceur : une fois par seconde, rien quand l'onglet est caché */
function directTick(){if(document.hidden)return;const t=Date.now(),cad=Math.max(routeEclair()?10000:30000,(DIR.live&&+DIR.live.next)||0);
 if(t-DIR.liveEssai>=(DIR.liveKo?Math.min(60000,cad*DIR.liveKo):cad))directLive();
 for(const gid of jeuxALire())if(fixDue(gid,t))directFix(gid);
 fixAncienne(t);reelVerifier();
 /* vrai compte : des mises restent à régler (manche réelle finie pendant l'absence) : le serveur est relancé, sans excès */
 if(SRV()&&typeof SRV_ECLAIR_DU!=='undefined'&&SRV_ECLAIR_DU>0&&t-(DIR.regleEssai||0)>20000){DIR.regleEssai=t;srvEclairRegler(0,3);}}
/* changement de compte sur ce navigateur : les mises en attente partent avec leur compte (et reviennent avec lui) */
function reelCompte(){for(const k of Object.keys(DIR.attente))if(DIR.attente[k].my)delete DIR.attente[k];for(const k in S.reel)S.reel[k].my=null;}
/* première lecture, avant le premier rendu (boot.js, 1,5 s au plus) : cours, et fixations des jeux à vraie source */
function directDemarrer(){return Promise.all([directLive(),...JEUX_REELS.map(g=>directFix(g))]).catch(()=>{});}
/* l'onglet revient : tout de suite */
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&PRET){DIR.liveEssai=0;directTick();}});

/* ===================== Le mode de chaque manche, pour ce client ===================== */
/* 'r' réelle, 'p' en pause, 's' simulée, 'x' retirée ; une décision sûre est gardée (une manche ne change jamais de mode) */
const MODE_SIMULE=Object.freeze({m:'s',raison:'pas_de_source',def:true});
function modeJeu(gid,r){if(!MR.ACTIF[gid])return MODE_SIMULE;const k=gid+':'+r,m=DIR.modes[k];if(m&&m.def)return m;const x=modeCalcul(gid,r);if(x.def)DIR.modes[k]=x;return x;}
/* les décisions des manches anciennes ne servent plus (historique : 12 manches) */
function modesRanger(r){if(r%20)return;for(const k of Object.keys(DIR.modes))if(+k.split(':')[1]<r-60)delete DIR.modes[k];}
function modeCalcul(gid,r){const actif=MR.ACTIF[gid],j=DIR.jeux[gid];
 if(!actif)return {m:'s',raison:'pas_de_source',def:true};
 if(!j||!j.lu)return {m:'s',raison:'hors_ligne',def:false};                              /* aucune lecture réussie : comme avant */
 const man=j.manches&&j.manches[r];
 if(j.config==='retire'||(man&&man.mode==='retire'))return {m:'x',raison:'retire',def:!!man};
 if(j.config&&j.config!=='reel')return {m:'s',raison:'pas_de_source',def:true};
 if(man&&man.mode==='reel')return {m:'r',raison:'serveur',P:man.P,def:true};             /* interrupteur allumé : la base décide */
 if(man&&man.mode==='pause')return {m:'p',raison:man.raison||'donnees',def:true};
 if(MR.reelle(gid,r,DIR.F[actif]))return {m:'r',raison:'client',def:true};
 return {m:'p',raison:pauseRaison(gid),def:(j.luSrv||0)>=fT0(r)+5000};}
/* une manche figée pour de bon (une mise y est posée) */
function modeFiger(gid,r,m){DIR.modes[gid+':'+r]=Object.assign({},m||modeJeu(gid,r),{def:true});}
/* jeu proposé dans la rotation pour la manche r (une manche à venir prend le mode de la manche en cours) */
function jeuOuvert(gid,r){const m=modeJeu(gid,Math.min(r,S.flash.round)).m;return m!=='p'&&m!=='x';}
/* la place d'un jeu de bourse est-elle fermée ? (indicateur « o » d'api_live, calendrier de la base) */
function placeFermee(gid){const c=DIR.live&&DIR.live.cours&&DIR.live.cours[COURS_PAUSE[gid]||MR.ACTIF[gid]];return !!c&&c.o===0;}
const pauseRaison=gid=>placeFermee(gid)?'ferme':'donnees';
/* réouverture de la Bourse de New York (séance 9 h 30 – 16 h, heure de New York ; jours fériés de wm.px_feries) */
const NYSE_FERIES=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
 '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
 '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25']);
const NY_FMT=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function nyParts(t){const o={};for(const p of NY_FMT.formatToParts(new Date(t)))o[p.type]=+p.value||p.value;return o;}
const nyDecalage=t=>{const p=nyParts(t);return Date.UTC(p.year,p.month-1,p.day,p.hour%24,p.minute,p.second)-Math.floor(t/1000)*1000;};
function nyReouverture(t){for(let i=0;i<10;i++){const p=nyParts(t+i*864e5),jour=`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`,sem=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
  if(sem===0||sem===6||NYSE_FERIES.has(jour))continue;const g=Date.UTC(p.year,p.month-1,p.day,9,30),u=g-nyDecalage(g);if(u>t)return u;}
 return null;}
/* « rouvre lundi à 15:30 » dans la langue et le fuseau du lecteur (les jeux de bourse suivent tous New York ; gardé 30 s) */
const ROUVRE={t:0,v:''};
function rouvreTxt(){if(Date.now()-ROUVRE.t<30000)return ROUVRE.v;ROUVRE.t=Date.now();const u=nyReouverture(Date.now());if(!u)return (ROUVRE.v='');
 const d=new Date(u),j=new Date();j.setHours(0,0,0,0);const jours=Math.round((new Date(d).setHours(0,0,0,0)-j)/864e5);
 const h=hhmm(u),jr=jours<=0?_t('aujourd’hui'):jours===1?_t('demain'):d.toLocaleDateString(LOC,{weekday:'long'});return (ROUVRE.v=_t('Rouvre {0} à {1}',[jr,h]));}

/* ===================== L'état d'une manche réelle (ou en pause) ===================== */
function reelEtat(gid){let x=S.reel[gid];if(x)return x;x=S.reel[gid]={gid,actif:MR.ACTIF[gid],reel:true,r:0,mode:'s',raison:'',ctx:null,pool:{o:1,n:1,e:0},players:0,bets:[],my:null,tk:0,start:0,startOk:false,price:0,path:[0],tail:null,result:null,hs:null,mes:{},board:'',sub:''};
 Object.defineProperty(x,'hist',{enumerable:true,get(){return x.hs||(x.hs=reelHist(GM[gid],x));},set(v){x.hs=v;}});return x;}
/* les manches de tous les jeux à vraie source pour la manche r ; « maj » : de nouvelles données sont arrivées en cours de manche */
function reelManche(r,maj){modesRanger(r);for(const gid of JEUX_REELS){const d=GM[gid];if(!d)continue;const x=reelEtat(gid);
  if(x.r===r&&(x.my||G(gid).my))continue;                                                 /* une mise est posée : la manche garde son mode */
  const m=modeJeu(gid,r);if(x.r===r&&x.mode===m.m){if(maj&&m.m==='r')reelCtx(x,d);continue;}
  if(G(gid).my&&m.m!=='s'){modeFiger(gid,r,{m:'s',raison:'mise_simulee'});x.r=r;x.mode='s';continue;}   /* mise posée avant les données : simulée */
  reelInit(x,d,r,m);}}
function reelInit(x,d,r,m){x.r=r;x.mode=m.m;x.raison=m.raison;x.P=m.P||null;x.my=null;x.bets=[];x.tk=0;x.tail=null;x.result=x.result&&x.result.round>=r-1?x.result:null;x.hs=null;
 /* Nasdaq 100 et S&P 500 : une manche réelle suit le fonds (QQQ, SPY), en dollars ; en pause, l'indice, en points */
 if(COURS_ACTIF[x.actif]){if(!d.fpIndice){d.fpIndice=d.fp;d.fcIndice=d.fc;}d.fp=m.m==='r'?fU:d.fpIndice;d.fc=m.m==='r'?cU:d.fcIndice;}
 const dep=MoteurEclair.depart(d,r);x.pool=dep.pool;x.players=dep.players;x.ctx=null;
 if(m.m==='r'){reelCtx(x,d);reelAvancer(d,x,Math.min(FK,Math.max(0,Math.floor((fNow()-fT0(r))/FTICK))),false);}
 reelPrix(x,d);}
/* le contexte du moteur v2 (paramètres, fixations r − 2 à r + 1) ; si le penchant de la foule change, la cagnotte est refaite */
function reelCtx(x,d){const F=DIR.F[x.actif]||{},r=x.r;x.ctx=x.raison==='serveur'?{mode:'reel',P:x.P||MR.parametres(d.id),F:MR.fenetre(F,r)}:MR.ctx(d.id,r,F);
 const pen=d.kind==='vol'?0:MoteurEclair.penchant(r,x.ctx.F);if(pen!==x.pen&&x.tk>0){x.pen=pen;reelRefaire(x,d);}else x.pen=pen;}
/* la cagnotte refaite depuis le départ, comme etatReel (mise du joueur posée à son tick) */
function reelRefaire(x,d){const dep=MoteurEclair.depart(d,x.r),k=x.tk,my=x.my,pose=my?Math.max(0,Math.min(k,my.tk|0)):-1;x.pool=dep.pool;x.players=dep.players;x.bets=[];
 for(let i=1;i<=k;i++){if(i-1===pose)reelPoser(x,my);const b=MoteurEclair.misesReel(d,x,x.r,i,x.pen,x.ctx.P);if(b)x.bets.push(b);}
 if(pose===k)reelPoser(x,my);}
const reelPoser=(x,my)=>{MoteurEclair.poser(x,my);x.bets.push({s:SIDEV[my.s],a:Math.min(1,my.amt/60),me:1});};
/* la foule simulée jusqu'au tick k (une mise au plus par tick, penchée selon la manche r − 2) */
function reelAvancer(d,x,k,live){if(x.mode!=='r'||!x.ctx)return;for(let i=x.tk+1;i<=k;i++){const b=MoteurEclair.misesReel(d,x,x.r,i,x.pen,x.ctx.P);if(b){x.bets.push(b);if(live&&d.id===S.ui.fgame&&typeof trailPush==='function')trailPush('flash',b);}}if(k>x.tk)x.tk=k;}
/* appelé à chaque tick de 250 ms (flash.js) */
function reelAvance(k){for(const gid of JEUX_REELS){const x=S.reel[gid];if(!x||x.r!==S.flash.round||x.mode!=='r')continue;const d=GM[gid];reelAvancer(d,x,k,true);reelPrix(x,d);}}
/* départ, cours, courbe de la manche (un point par tick, tiré des cours relevés) et les 10 dernières secondes d'avant */
function reelPrix(x,d){const r=x.r,t0=fT0(r),F=DIR.F[x.actif]||{},f0=F[r],P=DIR.serie[x.actif]||[];
 if(x.mode==='p'){const c=DIR.live&&DIR.live.cours&&DIR.live.cours[COURS_PAUSE[d.id]||COURS_ACTIF[x.actif]||x.actif];x.price=x.start=c?+c.p:(P.length?P[P.length-1][1]:0);x.path=[x.price];x.startOk=false;return;}
 const avant=valeurA(P,t0,null);x.startOk=!!(f0&&f0.e==='ok');x.start=x.startOk?f0.p:(avant!=null?avant:(P.length?P[P.length-1][1]:0));
 const k=Math.min(FK,Math.max(0,Math.floor((fNow()-t0)/FTICK)));x.path=chemin(P,t0,x.start,k);x.price=x.path[x.path.length-1];
 x.tail=P.some(q=>q[0]<t0)?Array.from({length:40},(_,j)=>valeurA(P,t0-10000+j*FTICK,x.start)):null;}
/* valeur à l'instant t : interpolée entre deux relevés, sinon le plus proche (avant le premier : « defaut ») */
function valeurA(P,t,defaut){if(!P.length||t<P[0][0])return defaut;let j=0;while(j+1<P.length&&P[j+1][0]<=t)j++;const a=P[j],b=P[j+1];return b?a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]):a[1];}
function chemin(P,t0,p0,k){const pts=[[t0,p0]];for(const q of P)if(q[0]>t0)pts.push(q);const out=new Array(k+1);let j=0;
 for(let i=0;i<=k;i++){const t=t0+i*FTICK;while(j+1<pts.length&&pts[j+1][0]<=t)j++;const a=pts[j],b=pts[j+1];out[i]=b?a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]):a[1];}
 return out;}

/* ===================== Fin de manche, vérification du résultat, règlement ===================== */
/* la manche r se termine : les jeux joués à cours réels attendent leur fixation de fin (« Résultat en cours de vérification ») */
function reelFin(r){const fini={},vus=new Set([GAMES[fSpot(r)]&&GAMES[fSpot(r)].id,S.ui.fgame]);
 for(const gid of JEUX_REELS){const x=S.reel[gid];if(!x||x.r!==r||x.mode!=='r')continue;const d=GM[gid];reelAvancer(d,x,FK,false);fini[gid]=x;
  x.result={round:r,attente:true,p0:x.startOk?x.start:null,at:now(),res:x.my?{attente:true,amt:x.my.amt,s:x.my.s}:null};
  /* attendent leur fixation de fin : les mises, le pari vedette (annonce du chat) et le jeu à l'écran */
  if(x.my||vus.has(gid))DIR.attente[gid+':'+r]={gid,r,my:x.my?Object.assign({},x.my):null};}
 /* une mise de la démo qui attend est gardée avec le compte (rechargement compris) */
 if(!SRV()&&S.me.logged){const L=S.me.freel=(S.me.freel||[]).filter(z=>z.r>=r-200);for(const gid in fini)if(fini[gid].my)L.push({g:gid,r,my:fini[gid].my});save();}
 return fini;}
/* de nouvelles fixations ou un nouveau cours : les manches en cours se mettent à jour, les résultats attendus se vérifient */
function reelApresDonnees(){if(!PRET)return;const r=S.flash.round;
 for(const gid of JEUX_REELS){const x=S.reel[gid],d=GM[gid];if(!x||!d)continue;
  if(x.r===r){const m=modeJeu(gid,r);if(m.m!==x.mode&&!x.my&&!G(gid).my){reelInit(x,d,r,m);x.hs=null;if(typeof render==='function'&&(S.ui.route==='eclair'||S.ui.route==='accueil'))render(false);continue;}
   if(x.mode==='r')reelCtx(x,d);reelPrix(x,d);}
  x.hs=null;}
 reelVerifier();}
/* les résultats attendus dont la fin est fixée (ou dont le délai de grâce est passé) */
function reelVerifier(){const t=fNow();for(const k of Object.keys(DIR.attente)){const z=DIR.attente[k],d=GM[z.gid],F=DIR.F[MR.ACTIF[z.gid]]||{},j=DIR.jeux[z.gid]||{};if(!d){delete DIR.attente[k];continue;}
  const grace=(DIR.live&&DIR.live.eclair&&+DIR.live.eclair.grace_s)||MR.GRACE_S,sur=(j.luSrv||0)>fT0(z.r+1)+grace*1000+5000;
  if(MR.attente(z.r,F,t,grace)||(!(F[z.r]&&F[z.r+1])&&!sur))continue;            /* fin pas encore fixée (ou pas encore vérifiée après le délai) */
  delete DIR.attente[k];reelResultat(d,z,MR.ctx(z.gid,z.r,F));}}
function reelResultat(d,z,ctx){const F=ctx.F,f0=F[z.r],f1=F[z.r+1],out=MoteurEclair.issueReelle(d,f0,f1,ctx.P),annule=out===null,motif=annule?MoteurEclair.motifAnnule(d,f0,f1,ctx.P):null;
 let res=null;
 if(z.my){const my=z.my,x=MoteurEclair.reglerReel(d,z.r,my,ctx);res=x.annule?{annule:true,amt:my.amt,motif:x.motif}:{win:x.win,pay:x.pay,pnl:x.pnl,amt:my.amt,be:my.s==='be',part:x.part};
  if(!SRV()&&S.me.logged)reelRegler(d,z,x);}
 const x=reelEtat(d.id),rr={round:z.r,out:annule?null:out,annule,motif,res,at:now(),p0:f0&&f0.e==='ok'?f0.p:null,p1:f1&&f1.e==='ok'?f1.p:null};
 if(!x.result||x.result.round<=z.r)x.result=rr;
 if(res&&!res.annule)x.mes[z.r]={win:res.win,pnl:res.pnl};x.hs=null;
 /* le pari vedette de la manche : l'annonce dans le chat général, comme pour une manche simulée */
 if(fSpot(z.r)===d.i&&!annule){const key=out===2?'e':out===1?'o':'n',g=MoteurEclair.etatReel(d,z.r,FK,null,ctx),right=Math.round(g.pool[key]/(g.pool.o+g.pool.n+g.pool.e)*100);
  addMsg('general',mkMsg({k:'evt',text:out===2?`${_t("Éclair, manche {0} : break even sur {1}. Seulement {2} % des joueurs l’avaient vu venir.",[F_INT(z.r),d.name,right])}`:`${_t("Éclair, manche {0} : {1}. {2} % des joueurs avaient raison.",[F_INT(z.r),out===1?_t("{0} a monté",[d.name]):_t("{0} a baissé",[d.name]),right])}`}));}
 /* un vrai compte : le serveur règle sur les mêmes fixations (et rend la mise d'une manche annulée) */
 if(z.my&&SRV()&&typeof srvEclairRegler==='function')setTimeout(()=>srvEclairRegler(1,0),200);
 if(typeof updateFlash==='function')updateFlash(true);
 const vu=fmode()==='rot'?S.flash.lastSpot:S.ui.fgame;if(vu===d.id&&z.r===S.flash.round-1&&typeof showFlashResult==='function')showFlashResult();
 if(typeof set2==='function'&&(S.ui.route||'')==='eclair')set2();}
const F_INT=v=>F.int(v);
/* compte démo : la mise réglée ici, avec le même moteur que le serveur (le même résultat pour tous) */
function reelRegler(d,z,x){const my=z.my;S.me.freel=(S.me.freel||[]).filter(y=>!(y.g===z.gid&&y.r===z.r));
 if(x.annule){S.me.balance+=my.amt;notif('bolt',_t("Éclair {0}, manche {1} : annulée, ta mise de {2} t’est rendue.",[d.name,F.int(z.r),F.usd(my.amt)]),'#eclair');
  toast({tone:'amber',icon:'bolt',flash:true,title:_t("Manche annulée : mise rendue"),text:_t("{0}, manche {1} : {2}.",[d.name,F.int(z.r),motifTxt(x.motif)]),href:'#eclair'});updateHeader();save();return;}
 const before=myRank(),win=x.win,pay=x.pay,pnl=pay-my.amt;S.me.balance+=pay;S.me.settled++;S.me.flashProfit+=pnl;S.me.realized+=pnl;
 if(win){S.me.wins++;S.me.flashWins++;S.me.flashStreak++;if(x.part<=30)S.me.contraWins=(S.me.contraWins||0)+1;S.me.flashBest=Math.max(S.me.flashBest,S.me.flashStreak);}else S.me.flashStreak=0;
 S.me.history.unshift({k:'flash',q:`${_t("Éclair {0}, manche {1} : {2}",[d.name,F.int(z.r),sideLabel(d,my.s)])}`,s:my.s==='non'?'non':'oui',eq:my.s==='be',win,pnl,at:fT0(z.r+1)});
 flashAnnonce(d,z.r,my,win,pay,z.r<S.flash.round-1);updateHeader();checkRank(before);checkBadges();save();}
/* pourquoi une manche a été annulée */
function motifTxt(m){return m==='sources_insuffisantes'?_t("pas assez de sources communes au départ et à la fin"):m==='egalite_sans_break_even'?_t("égalité alors que le break even était fermé"):_t("le cours de fin n’a pas pu être fixé");}
/* au chargement : les mises de la démo qui attendaient leur résultat */
function reelBoot(){for(const z of S.me.freel||[])if(z&&GM[z.g]&&z.my)DIR.attente[z.g+':'+z.r]={gid:z.g,r:z.r,my:z.my};}
/* au chargement : le résultat de la manche précédente, sur les fixations (ou « en cours de vérification ») */
function reelResBoot(d,r){const x=reelEtat(d.id);if(x.result&&x.result.round===r)return;const F=DIR.F[x.actif]||{},ok=f=>f&&f.e==='ok'?f.p:null;
 if(F[r]&&F[r+1]){const ctx=MR.ctx(d.id,r,F),out=MoteurEclair.issueReelle(d,F[r],F[r+1],ctx.P);
  x.result={round:r,out,annule:out===null,motif:out===null?MoteurEclair.motifAnnule(d,F[r],F[r+1],ctx.P):null,res:fResMine(d,r),at:fT0(r+1),p0:ok(F[r]),p1:ok(F[r+1])};return;}
 x.result={round:r,attente:true,p0:ok(F[r]),at:now(),res:fResMine(d,r)};if(!DIR.attente[d.id+':'+r])DIR.attente[d.id+':'+r]={gid:d.id,r,my:null};}

/* ===================== Historique des manches réelles ===================== */
function reelHist(d,x){const F=DIR.F[x.actif]||{},r=S.flash.round,L=[];
 for(let k=r-1;k>=r-12;k--){const m=modeJeu(d.id,k);if(m.m!=='r')continue;const a=F[k],b=F[k+1];if(!a||!b||a.e!=='ok'||b.e!=='ok')continue;
  const P=m.raison==='serveur'?(m.P||MR.parametres(d.id)):MR.parametres(d.id),out=MoteurEclair.issueReelle(d,a,b,P);if(out===null)continue;
  const ch=(b.p/a.p-1)*100,S2=(DIR.serie[x.actif]||[]).filter(q=>q[0]>fT0(k)&&q[0]<fT0(k+1)).map(q=>(q[1]/a.p-1)*100);
  L.push({o:out===2?'e':out===1?'u':'d',ch,r:k,at:fT0(k+1),path:[0,...S2,ch],my:x.mes[k]||null,code:d.code,name:d.name});}
 return L;}
/* une entrée de l'historique des paris vedettes pour une manche passée jouée à cours réels (null : inconnue) */
function reelHistEntree(d,r){const x=S.reel[d.id];if(!x)return null;return (x.hist||[]).find(h=>h.r===r)||null;}

/* ===================== Ce que l'écran montre ===================== */
/* le cours est-il retardé ? (dernière lecture trop ancienne, ou cours « r » chez le serveur) */
function coursRetard(actif){if(!DIR.liveLu)return false;const vieux=Date.now()-DIR.liveLu>(routeEclair()?25000:75000),c=DIR.live&&DIR.live.cours&&DIR.live.cours[COURS_ACTIF[actif]||actif];return vieux||(!!c&&c.e==='r');}
/* la pastille à côté du prix : « simulé » (avec son explication), « retardée », ou rien pour un cours réel à jour */
function srcH(d){const g=GA(d.id);
 if(g.reel&&g.mode==='r')return (COURS_ACTIF[g.actif]?`<span class="fl-src">${_t("via le fonds {0}",[g.actif.toUpperCase()])}</span>`:'')+(coursRetard(g.actif)?`<span class="fl-src retard" title="${esc(_t("Le dernier cours reçu date de plus de quelques secondes."))}">${_t("retardée")}</span>`:'');
 if(g.reel&&g.mode==='p')return '';
 const ev=d.kind==='event',ex=ev?_t("Match simulé : suivre un vrai match point par point demande un flux de données payant."):_t("Cours simulé : un cours réel à la seconde pour ce jeu demande un flux de données payant.");
 return `<button type="button" class="fl-src sim" data-a="fl-sim" data-v="${d.id}" title="${esc(ex)}" aria-label="${esc(_t("Simulé")+' : '+ex)}">${_t("simulé")}</button>`;}
/* jeu en pause : la ligne d'état, la dernière clôture et l'heure de réouverture */
function pauseTxt(d){const g=GA(d.id);if(!g.reel||g.mode!=='p')return '';return g.raison==='ferme'?_t("Marché fermé"):_t("En pause");}
function pauseH(d){const g=GA(d.id),ferme=g.raison==='ferme',rv=ferme?rouvreTxt(d.id):'';
 const jeux=MR.H24.map(id=>GM[id]).filter(Boolean);
 return `<div class="fl-pause" role="status"><span class="fp1">${ic('lock',16)} <b>${ferme?_t("Marché fermé"):_t("En pause")}</b>${rv?` · ${esc(rv)}`:''}</span><span class="fp2">${ferme?_t("Dernière clôture : {0}",[d.fp(g.price)]):_t("Cours en direct indisponibles pour le moment. Dernier cours : {0}",[d.fp(g.price)])}</span>
 <span class="fp3"><span>${_t("Ouverts 24 h sur 24 :")}</span> ${jeux.map(x=>`<button type="button" class="chip" data-a="fl-jeu" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</span></div>`;}
/* compte démo, sous « Comment ça marche » : les jeux qui se jouent sur les vrais cours en ce moment (vide : tous simulés) */
function coursReelsTxt(){const L=JEUX_REELS.filter(g=>modeJeu(g,S.flash.round).m==='r').map(g=>GM[g].name);
 return L.length?_t("Sur les vrais cours en ce moment : {0}. Les autres prix, scores et résultats sont simulés.",[L.join(', ')]):'';}
/* la phrase « départ » du graphique tant que la fixation n'est pas arrivée */
const departEnCours=d=>{const g=GA(d.id);return !!(g.reel&&g.mode==='r'&&!g.startOk);};

Object.assign(ACT,{
 'fl-sim':a=>{const d=GM[a.dataset.v];if(!d)return;toast({icon:'info',force:true,title:d.kind==='event'?_t("Match simulé"):_t("Cours simulé"),text:a.getAttribute('title')||'',dur:6000});},
 /* un jeu ouvert 24 h sur 24 à la place d'un jeu en pause (visiteurs compris) */
 'fl-jeu':a=>{const d=GM[a.dataset.v];if(!d)return;S.me.fmode='free';if(!inCat(d)){S.me.fcat='Tout';S.flash.spot=fSpot(S.flash.round);S.flash.hist=null;}S.ui.fgame=d.id;save();if((S.ui.route||'')==='eclair')render(false);else location.hash='#eclair';}
});
planifier('données : direct',1000,directTick,'tous');
