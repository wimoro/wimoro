/* WIMORO — pro module */

'use strict';
/* =====================================================================================
 *  Mode Pro, partie 1 : données, indicateurs et dessin du graphique
 *  ------------------------------------------------------------------------------------
 *  HISTORIQUE. La démo n'a pas de serveur : chaque marché reçoit un historique simulé à la minute,
 *  fabriqué une seule fois puis figé (clé « wimoro-pro-data », indépendante des comptes comme
 *  « wimoro-markets »). Il passe par les mêmes repères que le graphique classique au moment de sa
 *  création : 50 % à l'ouverture, les valeurs de départ des périodes 1 sem., 1 j, 6 h et 1 h, le prix actuel.
 *  Ensuite, chaque minute réelle de la démo est enregistrée (ouverture, haut, bas, clôture, volume).
 *  Toutes les périodes (1 min à 1 semaine) sont des regroupements de ces mêmes minutes : une bougie
 *  d'une heure est exactement la somme de ses 60 minutes.
 *
 *  INDICATEURS. Calculés sur la série affichée, jamais décoratifs : SMA, EMA, bandes de Bollinger,
 *  VWAP (à partir du volume de chaque bougie), RSI (lissage de Wilder), MACD.
 *
 *  DESSIN. Un seul peintre (proPaint) pour deux supports : le canevas du Mode Pro (interactif) et
 *  une image SVG (aperçu d'une analyse partagée dans un chat). L'aperçu est donc fidèle par construction.
 *
 *  Pour brancher un vrai serveur : remplacer proData() (minutes d'un marché) et proTick() (flux en direct).
 * ===================================================================================== */
const PRO_KEY='wimoro-pro-data',PRO_GEN=1,PRO_SIG=.13,PRO_CAP=6,PRO_SPAN=150*1440,PRO_WK=4*1440;
const PD={};let PRO_ST=null,PRO_DIRTY=false;
/* Périodes proposées. « max » regroupe par jour et montre tout l'historique. */
const PIV=[{k:'1m',ms:6e4},{k:'5m',ms:3e5},{k:'15m',ms:9e5},{k:'1h',ms:36e5},{k:'4h',ms:144e5},{k:'1d',ms:864e5},{k:'1w',ms:6048e5},{k:'max',ms:864e5}];
const PIVK={};PIV.forEach(x=>PIVK[x.k]=x);
const pivLab=k=>({'1m':_t('1 min'),'5m':_t('5 min'),'15m':_t('15 min'),'1h':_t('1 h'),'4h':_t('4 h'),'1d':_t('1 j'),'1w':_t('1 sem.'),max:_t('Max')})[k];
const pivLong=k=>({'1m':_t('1 minute'),'5m':_t('5 minutes'),'15m':_t('15 minutes'),'1h':_t('1 heure'),'4h':_t('4 heures'),'1d':_t('1 jour'),'1w':_t('1 semaine'),max:_t('Tout l’historique')})[k];

/* ---------- Stockage de l'historique ---------- */
function proStore(){if(PRO_ST)return PRO_ST;try{const o=JSON.parse(LS.g(PRO_KEY)||'null');if(o&&o.v===1&&o.m)PRO_ST=o;}catch(e){}if(!PRO_ST)PRO_ST={v:1,m:{}};return PRO_ST;}
function proStoreSave(){if(!PRO_DIRTY||!PRO_ST)return;PRO_DIRTY=false;try{LS.s(PRO_KEY,JSON.stringify(PRO_ST));}catch(e){}}

/* ---------- Fabrication de l'historique ---------- */
const proG=r=>(r()+r()+r()-1.5)*2;                                  // bruit gaussien approché (somme de 3 tirages, écart type 1)
const proF=p=>{const q=p*(100-p)*4e-4;return q<.08?.2828:Math.sqrt(q);};   // une probabilité proche de 0 % ou de 100 % bouge moins (1 à 50 %)
/* Pont aléatoire entre deux points connus (déplacement du point milieu) : même graine, mêmes extrémités, même tracé. */
function proBridge(c,i0,i1,seed){if(i1-i0<2)return;const r=rng(seed),st=new Int32Array(96);let sp=0;st[sp++]=i0;st[sp++]=i1;
 while(sp){const b=st[--sp],a=st[--sp];if(b-a<2)continue;const m=(a+b)>>1,base=c[a]+(c[b]-c[a])*(m-a)/(b-a);
  c[m]=clamp(base+proG(r)*Math.min(PRO_CAP,PRO_SIG*Math.sqrt(b-a)*.5)*proF(base),1.5,98.5);st[sp++]=m;st[sp++]=b;st[sp++]=a;st[sp++]=m;}}
/* Agitation minute par minute autour du tracé de fond (bruit qui revient vers zéro, nul aux extrémités) : en direct, les prix de la démo bougent ainsi. */
function proNoise(c,i0,i1,seed){const r=rng(seed^0x2545f491);let n=0;for(let i=i0+1;i<i1;i++){n=n*.78+proG(r)*.28;c[i]=clamp(c[i]+n*Math.min(1,(i-i0)/6,(i1-i)/6)*proF(c[i]),1,99);}}
/* Haut, bas et volume des minutes i0+1 … i1 ; le volume total distribué vaut volTot. */
const PRO_DAY=(()=>{const t=new Float32Array(1440);for(let m=0;m<1440;m++)t[m]=1+.35*Math.sin((m/60-9)/24*2*Math.PI);return t;})();   // le volume suit l'heure de la journée
function proFill(D,i0,i1,seed,volTot,flat){const r=rng(seed^0x5bd1e995),c=D.c,h=D.h,l=D.l,v=D.v,n0=Math.max(1,D.n0-1);let sum=0;
 for(let i=i0+1;i<=i1;i++){const o=c[i-1],x=c[i],f=.34*proF(x),hi=o>x?o:x,lo=o>x?x:o;h[i]=Math.min(99,hi+r()*r()*f);l[i]=Math.max(1,lo-r()*r()*f);
  const q=i<n0?i/n0:1,tr=flat?1:.3+1.7*q*Math.sqrt(q),u=r(),mv=Math.abs(x-o)/.3;
  const w=(.3+1.4*u*u*Math.sqrt(u))*(.6+3*(mv<1?mv:1))*PRO_DAY[(((D.s+i)%1440)+1440)%1440]*tr;v[i]=w;sum+=w;}
 const k=sum>0?volTot/sum:0;for(let i=i0+1;i<=i1;i++)v[i]*=k;}
function proGrow(D,need){if(need<=D.cap)return;const cap=Math.ceil(need*1.3)+2000;for(const k of ['c','h','l','v']){const a=new Float32Array(cap);a.set(D[k].subarray(0,D.n));D[k]=a;}D.cap=cap;}
/* Pose la minute i (au-delà de la dernière connue). Un trou de plus de 3 minutes (onglet masqué, démo fermée) est comblé par un pont. */
function proPut(D,i,c,h,l,v,o){const L=D.n-1;
 if(i<=L){if(i===L){D.c[i]=c;D.h[i]=h===undefined?c:h;D.l[i]=l===undefined?c:l;D.v[i]=v||0;}return;}
 proGrow(D,i+2);
 if(i-L>3){D.c[i-1]=o===undefined?c:o;proBridge(D.c,L,i-1,hash(D.id+':'+(D.s+L)));proNoise(D.c,L,i-1,hash(D.id+':n'+(D.s+L)));proFill(D,L,i-1,hash(D.id+':g'+(D.s+L)),D.vpm*(i-1-L),true);}
 else for(let j=L+1;j<i;j++){D.c[j]=D.h[j]=D.l[j]=D.c[L];D.v[j]=0;}
 const op=D.c[i-1];D.c[i]=c;D.h[i]=h===undefined?Math.max(op,c):Math.max(h,op,c);D.l[i]=l===undefined?Math.min(op,c):Math.min(l,op,c);D.v[i]=v||0;D.n=i+1;}
/* Données à la minute d'un marché (créées à la première demande, puis relues du stockage). */
function proData(m){if(PD[m.id])return PD[m.id];const st=proStore(),nowM=Math.floor(now()/6e4);let rec=st.m[m.id];
 if(!rec||rec.g!==PRO_GEN||!Array.isArray(rec.a)||rec.a.length<2||!Array.isArray(rec.P)){
  if(m.creator==='me'){const p0=r2(clamp(m.d0!==undefined?m.d0:m.p,2,98));rec={s:nowM-45,t0:nowM,a:[[nowM-45,p0],[nowM,r2(m.p)]],vol:Math.round(m.vol||0),P:[]};}
  else{const g=tf=>r2(clamp(series(m,tf)[0],2,98));rec={s:nowM-PRO_SPAN,t0:nowM,a:[[nowM-PRO_SPAN,50],[nowM-10080,g('1 sem.')],[nowM-1440,r2(clamp(m.d0,2,98))],[nowM-360,g('6 h')],[nowM-60,g('1 h')],[nowM,r2(m.p)]],vol:Math.round(m.vol||0),P:[]};}
  rec.g=PRO_GEN;rec.P.push([nowM,r2(m.p),r2(m.p),r2(m.p),0]);st.m[m.id]=rec;PRO_DIRTY=true;}
 const n0=rec.t0-rec.s+1,cap=n0+Math.max(4000,nowM-rec.t0+3000),N=()=>new Float32Array(cap);
 const D={id:m.id,s:rec.s,n:n0,n0,cap,c:N(),h:N(),l:N(),v:N(),ver:1,agg:{},rec,lastVol:m.vol||0,vpm:1,cur:null};
 const A=rec.a;D.c[0]=A[0][1];for(let k=1;k<A.length;k++){const i0=A[k-1][0]-rec.s,i1=A[k][0]-rec.s;D.c[i1]=A[k][1];proBridge(D.c,i0,i1,hash(m.id+':'+A[k-1][0]));proNoise(D.c,i0,i1,hash(m.id+':n'+A[k-1][0]));}
 D.h[0]=D.l[0]=D.c[0];proFill(D,0,n0-1,hash(m.id+':hl'),rec.vol,false);
 {let s=0,k=0;for(let i=Math.max(1,n0-1440);i<n0;i++){s+=D.v[i];k++;}D.vpm=k?s/k:1;}
 for(const p of rec.P)proPut(D,p[0]-rec.s,p[1],p[2],p[3],p[4],p[5]);
 {const lp=rec.P[rec.P.length-1];if(lp&&lp[0]===D.s+D.n-1)D.cur=lp;}
 PD[m.id]=D;proTick(m,undefined,true);return D;}
/* Une mise vient de bouger le prix (ou une minute vient de passer) : la minute en cours est mise à jour et enregistrée. */
function proTick(m,old,quiet){const D=PD[m.id];if(!D)return;const i=Math.floor(now()/6e4)-D.s,L=D.n-1,p=m.p,dv=quiet?0:Math.max(0,(m.vol||0)-D.lastVol);D.lastVol=m.vol||0;
 if(i>L){const gap=i-L>3;proPut(D,i,p,undefined,undefined,dv,gap?(old===undefined?p:old):undefined);D.cur=[D.s+i,r2(p),r2(D.h[i]),r2(D.l[i]),Math.round(D.v[i])];if(gap)D.cur[5]=r2(D.c[i-1]);D.rec.P.push(D.cur);proThin(D);}
 else if(i===L){D.c[i]=p;if(p>D.h[i])D.h[i]=p;if(p<D.l[i])D.l[i]=p;D.v[i]+=dv;const q=D.cur;if(q&&q[0]===D.s+i){q[1]=r2(p);q[2]=r2(D.h[i]);q[3]=r2(D.l[i]);q[4]=Math.round(D.v[i]);}}
 else return;
 D.ver++;PRO_DIRTY=true;if(typeof proLive==='function')proLive(m);}
/* Le stockage reste petit : au-delà de 600 minutes enregistrées, les plus anciennes ne gardent qu'un point toutes les 30 minutes
   (au rechargement, le détail entre deux points gardés est recréé par un pont, toujours le même). */
function proThin(D){const P=D.rec.P;if(P.length<=600)return;const keep=P.slice(-360),old=P.slice(0,-360).filter(p=>p[0]%30===0).slice(-400);
 const op=p=>{const i=p[0]-D.s;if(i>0&&i<D.n)p[5]=r2(D.c[i-1]);};old.forEach(op);op(keep[0]);D.rec.P=old.concat(keep);}
/* le prix d'un marché change : updateMarket prévient le Mode Pro */
const updateMarketP=updateMarket;
updateMarket=function(m,old,x){updateMarketP(m,old,x);if(PD[m.id])proTick(m,old);};

/* ---------- Regroupement par période ---------- */
/* L'époque Unix tombe un jeudi : les semaines commencent le lundi (décalage de 4 jours). */
function proAgg(D,ms){const mn=ms/6e4,off=mn===10080?PRO_WK:0,bk=i=>Math.floor((D.s+i-off)/mn),b0=bk(0),nb=bk(D.n-1)-b0+1;let A=D.agg[ms];
 if(!A||A.cap<nb){const cap=nb+600,N=()=>new Float32Array(cap);A=D.agg[ms]={ms,T0:(b0*mn+off)*6e4,cap,n:0,o:N(),h:N(),l:N(),c:N(),v:N(),done:0,ver:0,flip:null};}
 if(A.ver===D.ver)return A;
 let i=A.done>0?A.done-1:0;while(i>0&&bk(i-1)===bk(i))i--;
 for(;i<D.n;i++){const b=bk(i)-b0;if(i===0||bk(i-1)-b0!==b){A.o[b]=i?D.c[i-1]:D.c[0];A.h[b]=D.h[i];A.l[b]=D.l[i];A.v[b]=0;}
  if(D.h[i]>A.h[b])A.h[b]=D.h[i];if(D.l[i]<A.l[b])A.l[b]=D.l[i];A.c[b]=D.c[i];A.v[b]+=D.v[i];}
 A.n=nb;A.done=D.n;A.ver=D.ver;return A;}
/* Série affichée : côté Oui tel quel ; côté Non, le prix vaut 100 − Oui (le haut devient le bas). */
function proSerie(A,side){if(side!=='non')return A;let f=A.flip;if(f&&f.ver===A.ver&&f.n===A.n)return f;const n=A.n,N=()=>new Float32Array(n);f={ver:A.ver,n,o:N(),h:N(),l:N(),c:N()};
 for(let i=0;i<n;i++){f.o[i]=100-A.o[i];f.h[i]=100-A.l[i];f.l[i]=100-A.h[i];f.c[i]=100-A.c[i];}A.flip=f;return f;}
/* Une période n'est proposée que si l'historique contient au moins 3 bougies de cette taille. */
function proIvOk(D,k){if(k==='max')return true;return proAgg(D,PIVK[k].ms).n>=3;}
/* « Max » : la plus grande période qui donne encore au moins 60 bougies (sinon la plus fine). */
function proMaxMs(D){for(let i=6;i>=0;i--)if(proAgg(D,PIV[i].ms).n>=60)return PIV[i].ms;return PIV[0].ms;}

/* ---------- Indicateurs (fonctions pures : mêmes entrées, mêmes sorties) ---------- */
const proNaN=n=>new Float64Array(n).fill(NaN);
/* Moyenne mobile simple : moyenne des `len` dernières clôtures. */
function proSMA(c,n,len){const out=proNaN(n);let s=0;for(let i=0;i<n;i++){s+=c[i];if(i>=len)s-=c[i-len];if(i>=len-1)out[i]=s/len;}return out;}
/* Moyenne mobile exponentielle : amorcée par la moyenne simple des `len` premières valeurs, puis k = 2 / (len + 1). */
function proEMA(c,n,len,from){from=from||0;const out=proNaN(n),k=2/(len+1);if(n-from<len)return out;let s=0;for(let i=from;i<from+len;i++)s+=c[i];let e=s/len;out[from+len-1]=e;for(let i=from+len;i<n;i++){e=c[i]*k+e*(1-k);out[i]=e;}return out;}
/* Bandes de Bollinger : moyenne simple ± k écarts types (écart type de la population, comme la convention usuelle). */
function proBB(c,n,len,k,from,to){const a=proNaN(n),b=proNaN(n),lo=proNaN(n),i0=Math.max(len-1,from||0),i1=to===undefined?n-1:Math.min(n-1,to);for(let i=i0;i<=i1;i++){let s=0;for(let j=i-len+1;j<=i;j++)s+=c[j];const m=s/len;let q=0;for(let j=i-len+1;j<=i;j++){const d=c[j]-m;q+=d*d;}const sd=Math.sqrt(q/len);a[i]=m;b[i]=m+k*sd;lo[i]=m-k*sd;}return {a,b,c:lo};}
/* RSI, lissage de Wilder : 100 − 100 / (1 + moyenne des hausses / moyenne des baisses). */
function proRSI(c,n,len){const out=proNaN(n);if(n<=len)return out;let g=0,d=0;for(let i=1;i<=len;i++){const x=c[i]-c[i-1];if(x>0)g+=x;else d-=x;}g/=len;d/=len;const f=()=>d===0?(g===0?50:100):100-100/(1+g/d);out[len]=f();
 for(let i=len+1;i<n;i++){const x=c[i]-c[i-1];g=(g*(len-1)+(x>0?x:0))/len;d=(d*(len-1)+(x<0?-x:0))/len;out[i]=f();}return out;}
/* MACD : EMA rapide − EMA lente ; signal = EMA du MACD ; histogramme = MACD − signal. */
function proMACD(c,n,fast,slow,sig){const ef=proEMA(c,n,fast),es=proEMA(c,n,slow),a=proNaN(n);for(let i=slow-1;i<n;i++)a[i]=ef[i]-es[i];const b=proEMA(a,n,sig,slow-1),h=proNaN(n);for(let i=0;i<n;i++)h[i]=a[i]-b[i];return {a,b,c:h};}
/* VWAP : somme (prix typique × volume) / somme des volumes, remise à zéro à chaque jour, semaine, ou jamais (« all »). */
function proVWAP(T0,ms,n,H,L,C,V,anc){const out=proNaN(n);let pv=0,vv=0,key=null;for(let i=0;i<n;i++){const t=T0+i*ms,k=anc==='all'?0:anc==='week'?Math.floor((t-PRO_WK*6e4)/6048e5):Math.floor(t/864e5);if(k!==key){key=k;pv=0;vv=0;}pv+=(H[i]+L[i]+C[i])/3*V[i];vv+=V[i];if(vv>0)out[i]=pv/vv;}return out;}
/* Ancrage effectif du VWAP : une remise à zéro plus courte que la bougie n'aurait aucun sens. */
function proAnc(anc,ms){const min=ms>=864e5?'all':ms>=144e5?'week':'day',rk={day:0,week:1,all:2};const want=anc==='auto'||!rk.hasOwnProperty(anc)?min:anc;return rk[want]<rk[min]?min:want;}
const PIND={
 sma:{n:'SMA',pane:0,def:{len:20},col:'#F59A0B'},
 ema:{n:'EMA',pane:0,def:{len:20},col:'#7A5AF8'},
 bb:{n:'Bollinger',pane:0,def:{len:20,k:2},col:'#12A150'},
 vwap:{n:'VWAP',pane:0,def:{anc:'auto'},col:'#D92D20'},
 rsi:{n:'RSI',pane:1,def:{len:14},col:'#7A5AF8'},
 macd:{n:'MACD',pane:1,def:{fast:12,slow:26,sig:9},col:'#2448FF'}
};
const PIND_K=Object.keys(PIND);
const pindFull=k=>({sma:_t('Moyenne mobile simple'),ema:_t('Moyenne mobile exponentielle'),bb:_t('Bandes de Bollinger'),vwap:_t('Prix moyen pondéré par le volume'),rsi:_t('Indice de force relative'),macd:_t('Convergence et divergence des moyennes mobiles')})[k];
function pindLab(d){const p=d.p;return d.k==='sma'||d.k==='ema'||d.k==='rsi'?PIND[d.k].n+' '+p.len:d.k==='bb'?'BB '+p.len+' · '+F.inp(p.k):d.k==='macd'?'MACD '+p.fast+' · '+p.slow+' · '+p.sig:'VWAP';}
/* Réglages remis dans leurs bornes : un réglage hors limite ne casse jamais le calcul. */
function pindFix(d){const P=PIND[d.k];if(!P)return null;const p=Object.assign({},P.def,d.p||{}),I=(v,a,b,df)=>{v=Math.round(+v);return isFinite(v)?clamp(v,a,b):df;};
 if('len' in P.def)p.len=I(p.len,2,400,P.def.len);if(d.k==='bb'){p.k=+p.k;p.k=isFinite(p.k)?clamp(Math.round(p.k*10)/10,.5,5):2;}
 if(d.k==='macd'){p.fast=I(p.fast,2,200,12);p.slow=I(p.slow,3,400,26);if(p.slow<=p.fast)p.slow=p.fast+1;p.sig=I(p.sig,2,100,9);}
 if(d.k==='vwap'&&!['auto','day','week','all'].includes(p.anc))p.anc='auto';
 d.p=p;d.c=proColOk(d.c)?d.c:P.col;d.w=clamp(Math.round(+d.w)||2,1,3);d.h=d.h?1:0;if(!d.id)d.id='i'+Math.random().toString(36).slice(2,8);return d;}
/* Valeurs d'un indicateur sur la série A (côté affiché). Résultat gardé tant que ni les données ni les réglages ne changent.
   win = [premier, dernier] indice utile : seules les bandes de Bollinger s'en servent (chaque valeur ne dépend que de sa fenêtre, inutile de calculer hors de l'écran). */
function proCalc(d,A,side,win){const wf=win&&d.k==='bb'?Math.max(0,win[0]>>9<<9):0,wt=win&&d.k==='bb'?Math.min(A.n-1,((win[1]>>9)+1<<9)):A.n-1,key=A.ms+'|'+A.T0+'|'+side+'|'+A.ver+'|'+A.n+'|'+wf+'|'+wt+'|'+JSON.stringify(d.p);if(d._k===key&&d._v)return d._v;const Sr=proSerie(A,side),n=A.n,p=d.p;let v;
 switch(d.k){case 'sma':v={a:proSMA(Sr.c,n,p.len)};break;case 'ema':v={a:proEMA(Sr.c,n,p.len)};break;case 'bb':v=proBB(Sr.c,n,p.len,p.k,wf,wt);break;
  case 'vwap':v={a:proVWAP(A.T0,A.ms,n,Sr.h,Sr.l,Sr.c,A.v,proAnc(p.anc,A.ms))};break;case 'rsi':v={a:proRSI(Sr.c,n,p.len)};break;default:v=proMACD(Sr.c,n,p.fast,p.slow,p.sig);}
 Object.defineProperty(d,'_k',{value:key,writable:true,enumerable:false,configurable:true});Object.defineProperty(d,'_v',{value:v,writable:true,enumerable:false,configurable:true});return v;}
/* Nombre d'indicateurs affichables en même temps, selon le rang (Fer, Bronze : 1 ; Argent, Or : 2 ; de Platine à l'avant-dernier rang : 3 ;
   Radiant : sans limite).
   Afficher plusieurs fois le MÊME indicateur (avec des réglages différents) est réservé au rang Radiant : aux autres rangs, chaque indicateur
   n'apparaît qu'une fois (proUniq retire les doublons, proAddInd les refuse). */
const PRO_SLOTS=[1,1,2,2,3,3,3,3,Infinity];
const proSlots=()=>PRO_SLOTS[myRank().t];
const proUnl=()=>proSlots()===Infinity;
/* Une liste d'indicateurs sans doublon : le premier de chaque type est gardé. */
const proUniq=L=>{const seen=new Set();return L.filter(d=>seen.has(d.k)?false:(seen.add(d.k),true));};
const proNextSlotTier=()=>{const t=myRank().t;for(let i=t+1;i<TIERS.length;i++)if(PRO_SLOTS[i]>PRO_SLOTS[t])return i;return null;};
/* « 2 / 3 », ou « 7 / ∞ » au rang Radiant */
const proCntTxt=n=>n+' / '+(proUnl()?'∞':proSlots());
/* Un indicateur ajouté alors que le même est déjà affiché prend les réglages classiques suivants et une couleur libre :
   deux moyennes identiques l'une sur l'autre ne serviraient à rien. Tout reste modifiable ensuite. */
const PIND_ALT={sma:[20,50,100,200,10,30],ema:[20,50,100,200,9,12,26],rsi:[14,7,21,28,9],bb:[[20,2],[50,2],[20,1],[10,2],[100,2]],macd:[[12,26,9],[5,35,5],[24,52,18],[8,17,9],[19,39,9]],vwap:['auto','day','week','all']};
function pindNew(k,L){const P=PIND[k];if(!P)return null;const same=L.filter(d=>d.k===k),d={k};
 if(same.length){const key=p=>JSON.stringify(p),used=new Set(same.map(x=>key(x.p))),mk=a=>k==='bb'?{len:a[0],k:a[1]}:k==='macd'?{fast:a[0],slow:a[1],sig:a[2]}:k==='vwap'?{anc:a}:{len:a};
  for(const a of PIND_ALT[k]){const f=pindFix({k,p:mk(a)});if(!used.has(key(f.p))){d.p=f.p;break;}}
  if(!d.p&&'len' in P.def){const lens=new Set(same.map(x=>x.p.len));let len=Math.max(...same.map(x=>x.p.len));do{len=len>=400?2:len+10;}while(lens.has(len)&&lens.size<399);d.p=Object.assign({},same[same.length-1].p,{len});}}
 /* couleur : celle de l'indicateur si elle est libre dans son volet, sinon la première couleur libre */
 const zone=L.filter(x=>P.pane?x.k===k:!PIND[x.k].pane),usedC=new Set(zone.map(x=>x.c)),pal=[P.col].concat(PCOL.filter(c=>c!=='ink'&&c!==P.col),['ink']);
 d.c=pal.find(c=>!usedC.has(c))||pal[zone.length%pal.length];return pindFix(d);}

/* ---------- Couleurs ---------- */
const PCOL=['ink','#2448FF','#F59A0B','#12A150','#D92D20','#7A5AF8'];
/* une couleur est soit un nom du thème, soit un code #RRGGBB : rien d'autre n'entre dans la page (les analyses viendront un jour d'un serveur) */
const proColOk=c=>typeof c==='string'&&(c==='ink'||/^#[0-9a-fA-F]{6}$/.test(c));
const PVAR={ink:'--ink',g2:'--g2',g3:'--g3',g4:'--g4',rule:'--rule',soft:'--soft2',panel:'--panel',bg:'--bg',oui:'--oui',non:'--non',up:'--gain',dn:'--loss',be:'--be'};
let PCSS=null,PCSS_T='';
function proCss(){const t=document.documentElement.getAttribute('data-theme')||'';if(PCSS&&PCSS_T===t)return PCSS;const cs=getComputedStyle(document.documentElement),o={};for(const k in PVAR)o[k]=cs.getPropertyValue(PVAR[k]).trim()||'#888';o.font=getComputedStyle(document.body).fontFamily||'sans-serif';PCSS=o;PCSS_T=t;return o;}

/* ---------- Supports de dessin : canevas (Mode Pro) et SVG (aperçu dans un chat) ---------- */
function proCvG(ctx,pal){const C=pal||proCss(),col=c=>C[c]||(proColOk(c)?c:C.ink);ctx.direction='ltr';
 const G={
  segs(a,c,w,al,dash){if(!a.length)return;ctx.save();ctx.globalAlpha=al===undefined?1:al;ctx.strokeStyle=col(c);ctx.lineWidth=w||1;ctx.lineCap='round';if(dash)ctx.setLineDash(dash);ctx.beginPath();for(let i=0;i<a.length;i+=4){ctx.moveTo(a[i],a[i+1]);ctx.lineTo(a[i+2],a[i+3]);}ctx.stroke();ctx.restore();},
  rects(a,c,al){if(!a.length)return;ctx.save();ctx.globalAlpha=al===undefined?1:al;ctx.fillStyle=col(c);for(let i=0;i<a.length;i+=4)ctx.fillRect(a[i],a[i+1],a[i+2],a[i+3]);ctx.restore();},
  box(x,y,w,h,c,lw,al,dash){ctx.save();ctx.globalAlpha=al===undefined?1:al;ctx.strokeStyle=col(c);ctx.lineWidth=lw||1;if(dash)ctx.setLineDash(dash);ctx.strokeRect(x,y,w,h);ctx.restore();},
  poly(a,c,w,al,dash){if(a.length<4)return;ctx.save();ctx.globalAlpha=al===undefined?1:al;ctx.strokeStyle=col(c);ctx.lineWidth=w||1.5;ctx.lineJoin='round';ctx.lineCap='round';if(dash)ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)ctx.lineTo(a[i],a[i+1]);ctx.stroke();ctx.restore();},
  area(a,c,al){if(a.length<6)return;ctx.save();ctx.globalAlpha=al===undefined?1:al;ctx.fillStyle=col(c);ctx.beginPath();ctx.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)ctx.lineTo(a[i],a[i+1]);ctx.closePath();ctx.fill();ctx.restore();},
  circle(x,y,r,fill,stroke,lw){ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=col(fill);ctx.fill();}if(stroke){ctx.strokeStyle=col(stroke);ctx.lineWidth=lw||1.5;ctx.stroke();}ctx.restore();},
  tw(s,o){ctx.save();ctx.font=(o&&o.w||500)+' '+(o&&o.s||11)+'px '+C.font;const w=ctx.measureText(s).width;ctx.restore();return w;},
  text(s,x,y,o){o=o||{};const sz=o.s||11,pad=o.pad===undefined?5:o.pad;ctx.save();ctx.font=(o.w||500)+' '+sz+'px '+C.font;const tw=ctx.measureText(s).width,al=o.a||'left';let x0=al==='right'?x-tw:al==='center'?x-tw/2:x;
   if(o.bg){const bx=x0-pad,by=y-sz/2-3,bw=tw+pad*2,bh=sz+6;ctx.globalAlpha=o.bga===undefined?1:o.bga;ctx.fillStyle=col(o.bg);ctx.beginPath();if(ctx.roundRect)ctx.roundRect(bx,by,bw,bh,4);else ctx.rect(bx,by,bw,bh);ctx.fill();ctx.globalAlpha=1;if(o.bc){ctx.strokeStyle=col(o.bc);ctx.lineWidth=1;ctx.stroke();}}
   ctx.fillStyle=col(o.c||'g3');ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(s,x0,y+.5);ctx.restore();return tw;},
  clip(x,y,w,h){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();},unclip(){ctx.restore();}
 };return G;}
let PSVG=0;
function proSvgG(){const out=[],col=c=>PVAR[c]?'var('+PVAR[c]+')':proColOk(c)?c:'var(--ink)',f=v=>(Math.round(v*10)/10),al=a=>a===undefined||a===1?'':` opacity="${a}"`,ds=d=>d?` stroke-dasharray="${d.join(' ')}"`:'';
 const G={out,
  segs(a,c,w,o,dash){if(!a.length)return;let d='';for(let i=0;i<a.length;i+=4)d+=`M${f(a[i])} ${f(a[i+1])}L${f(a[i+2])} ${f(a[i+3])}`;out.push(`<path d="${d}" fill="none" stroke="${col(c)}" stroke-width="${w||1}" stroke-linecap="round"${al(o)}${ds(dash)}/>`);},
  rects(a,c,o){if(!a.length)return;let d='';for(let i=0;i<a.length;i+=4)d+=`M${f(a[i])} ${f(a[i+1])}h${f(a[i+2])}v${f(a[i+3])}h${f(-a[i+2])}z`;out.push(`<path d="${d}" fill="${col(c)}"${al(o)}/>`);},
  box(x,y,w,h,c,lw,o,dash){out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(Math.abs(w))}" height="${f(Math.abs(h))}" fill="none" stroke="${col(c)}" stroke-width="${lw||1}"${al(o)}${ds(dash)}/>`);},
  poly(a,c,w,o,dash){if(a.length<4)return;let d='M'+f(a[0])+' '+f(a[1]);for(let i=2;i<a.length;i+=2)d+='L'+f(a[i])+' '+f(a[i+1]);out.push(`<path d="${d}" fill="none" stroke="${col(c)}" stroke-width="${w||1.5}" stroke-linejoin="round" stroke-linecap="round"${al(o)}${ds(dash)}/>`);},
  area(a,c,o){if(a.length<6)return;let d='M'+f(a[0])+' '+f(a[1]);for(let i=2;i<a.length;i+=2)d+='L'+f(a[i])+' '+f(a[i+1]);out.push(`<path d="${d}Z" fill="${col(c)}"${al(o)}/>`);},
  circle(x,y,r,fill,stroke,lw){out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill?col(fill):'none'}"${stroke?` stroke="${col(stroke)}" stroke-width="${lw||1.5}"`:''}/>`);},
  tw(s,o){return String(s).length*(o&&o.s||11)*((o&&o.w||500)>=600?.6:.56);},
  text(s,x,y,o){o=o||{};const sz=o.s||11,pad=o.pad===undefined?5:o.pad,tw=G.tw(s,o),a=o.a||'left',x0=a==='right'?x-tw:a==='center'?x-tw/2:x;
   if(o.bg)out.push(`<rect x="${f(x0-pad)}" y="${f(y-sz/2-3)}" width="${f(tw+pad*2)}" height="${sz+6}" rx="4" fill="${col(o.bg)}"${al(o.bga)}${o.bc?` stroke="${col(o.bc)}"`:''}/>`);
   out.push(`<text x="${f(o.bg?x0+tw/2:x)}" y="${f(y)}" font-size="${sz}" font-weight="${o.w||500}" fill="${col(o.c||'g3')}" dominant-baseline="central" text-anchor="${o.bg?'middle':a==='right'?'end':a==='center'?'middle':'start'}">${esc(s)}</text>`);return tw;},
  clip(x,y,w,h){const id='pcl'+(++PSVG);out.push(`<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath><g clip-path="url(#${id})">`);},unclip(){out.push('</g>');}
 };return G;}

/* ---------- Le peintre ---------- */
const proStep=(span,nb)=>{const raw=span/Math.max(1,nb),p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p;};
const proPct=(v,step)=>plain(step>=1?F.pct(v):F.pct1(v/100));
const PTSTEP=[6e4,3e5,9e5,18e5,36e5,72e5,144e5,216e5,432e5,864e5,1728e5,6048e5,12096e5,2592e6,7776e6];
function proDate(t,long){const d=new Date(t);return d.toLocaleDateString(LOC,long?{day:'numeric',month:'short',year:'numeric'}:{day:'numeric',month:'short'});}
function proWhen(t,ms){return ms>=864e5?proDate(t,true):proDate(t)+' '+hhmm(t);}
/* M : { W, H, A (bougies), side, type, vn (bougies visibles), end (indice du bord droit), inds, draws, hideAll, sel, pend, hover, pos, compact, noAxis }
   Renvoie la mise en page (échelles) pour les interactions. */
function proPaint(G,M){const W=M.W,H=M.H,A=M.A,Sr=proSerie(A,M.side),cmp=!!M.compact,padR=M.noAxis?0:cmp?42:56,padB=M.noAxis?0:20,fs=cmp?10:11,cand=M.type==='bougies';
 /* un volet par type d'indicateur : dix RSI partagent le même volet (même échelle), le graphique des prix garde sa place */
 const subs=[];for(const d of M.inds){if(d.h||!PIND[d.k].pane)continue;let g=subs.find(q=>q.k===d.k);if(!g)subs.push(g={k:d.k,ds:[]});g.ds.push(d);}
 const subH=subs.length?clamp(Math.round((H-padB)*(subs.length>1?.2:.25)),cmp?44:64,160):0;
 const pw=W-padR,mh=H-padB-subs.length*subH,vn=M.vn,start=M.end-vn,cw=pw/vn,x=i=>(i-start)*cw;
 const i0=clamp(Math.floor(start),0,A.n-1),i1=clamp(Math.ceil(M.end)-1,0,A.n-1);
 let lo=1e9,hi=-1e9;for(let i=i0;i<=i1;i++){const a=cand?Sr.l[i]:Sr.c[i],b=cand?Sr.h[i]:Sr.c[i];if(a<lo)lo=a;if(b>hi)hi=b;}
 for(const d of M.inds){if(d.h||PIND[d.k].pane)continue;const V=d.vals;for(const key of (d.k==='bb'?['b','c']:['a'])){const arr=V[key];for(let i=i0;i<=i1;i++){const z=arr[i];if(z===z&&z!==null){if(z<lo)lo=z;if(z>hi)hi=z;}}}}
 if(lo>hi){lo=40;hi=60;}{const pad=Math.max(.5,(hi-lo)*.1);lo=Math.max(0,lo-pad);hi=Math.min(100,hi+pad);if(hi-lo<3){const mid=(hi+lo)/2;lo=Math.max(0,mid-1.5);hi=Math.min(100,lo+3);lo=Math.max(0,hi-3);}}
 const y=p=>6+(hi-p)/(hi-lo)*(mh-12),py=Y=>hi-(Y-6)/(mh-12)*(hi-lo),T=i=>A.T0+i*A.ms,X=t=>x((t-A.T0)/A.ms),SP=p=>M.side==='non'?100-p:p;
 const L={W,H,pw,mh,padR,padB,subH,subs,cw,start,i0,i1,lo,hi,x,y,py,T,X,SP,ix:px=>start+px/cw,panes:[]};
 /* grille ; les graduations sont écrites plus bas, une fois connues les étiquettes qui pourraient les recouvrir */
 const step=proStep(hi-lo,mh/(cmp?38:46)),gl=[],yl=[];for(let v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step){const Y=y(v);if(Y<8||Y>mh-4)continue;gl.push(0,Y,pw,Y);yl.push([Y,proPct(v,step)]);}
 G.segs(gl,'rule',1,.9);
 const vl=[],tl=[];if(!M.noAxis){const want=(cmp?64:92)/cw*A.ms;let ts=PTSTEP[PTSTEP.length-1];for(const s of PTSTEP)if(s>=want){ts=s;break;}
  const tz=-new Date(T(M.end)).getTimezoneOffset()*6e4;
  for(let t=Math.ceil((T(start)+tz)/ts)*ts-tz;t<=T(M.end);t+=ts){const X0=X(t);if(X0<24||X0>pw-24)continue;vl.push(X0,0,X0,H-padB);tl.push([X0,ts>=864e5||hhmm(t)==='00:00'?proDate(t):hhmm(t)]);}}
 G.segs(vl,'rule',1,.55);
 G.clip(0,0,pw,mh);
 /* volume, en bas du volet principal */
 /* l'échelle suit le volume habituel de la fenêtre (9e décile) : une minute exceptionnelle remplit la hauteur sans écraser les autres barres */
 {const vs=[];for(let i=i0;i<=i1;i++)vs.push(A.v[i]||0);vs.sort((a,b)=>a-b);const vm=Math.max(vs[Math.floor((vs.length-1)*.9)]*1.5,vs[vs.length-1]*.12);if(vm>0){const vh=mh*.15,bw=Math.max(1,cw*.68),up=[],dn=[];for(let i=i0;i<=i1;i++){const hh=Math.min(1,A.v[i]/vm)*vh;if(hh<.3)continue;(cand&&Sr.c[i]<Sr.o[i]?dn:up).push(x(i+.5)-bw/2,mh-hh,bw,hh);}G.rects(up,cand?'up':'g4',cand?.24:.3);G.rects(dn,'dn',.24);}}
 /* prix */
 const lineC=M.side==='non'?'non':'oui';
 if(cand){const uw=[],dw=[],ub=[],db=[],bw=Math.max(1,Math.min(cw*.68,18));for(let i=i0;i<=i1;i++){const o=Sr.o[i],c=Sr.c[i],up=c>=o,cx=x(i+.5);(up?uw:dw).push(cx,y(Sr.h[i]),cx,y(Sr.l[i]));if(cw>=3){const yt=y(Math.max(o,c)),yb=y(Math.min(o,c));(up?ub:db).push(cx-bw/2,yt,bw,Math.max(1,yb-yt));}}
  G.segs(uw,'up',1);G.segs(dw,'dn',1);G.rects(ub,'up');G.rects(db,'dn');}
 else{const a=[];for(let i=i0;i<=i1;i++)a.push(x(i+.5),y(Sr.c[i]));if(a.length>=4){G.area(a.concat([a[a.length-2],mh,a[0],mh]),lineC,.08);G.poly(a,lineC,2);}}
 /* indicateurs posés sur le prix */
 const lineOf=(arr,f,raw)=>{const R=[];let cur=[];for(let i=Math.max(0,i0-1);i<=Math.min(A.n-1,i1+1);i++){const z=arr[i];if(z===z&&z!==null)cur.push(x(i+.5),f(raw?z:clamp(z,0,100)));else if(cur.length){R.push(cur);cur=[];}}if(cur.length)R.push(cur);return R;};
 for(const d of M.inds){if(d.h||PIND[d.k].pane)continue;const V=d.vals;
  if(d.k==='bb'){const U=lineOf(V.b,y),Lo=lineOf(V.c,y);if(U.length&&Lo.length&&U[0].length===Lo[0].length){const a=U[0].slice();for(let i=Lo[0].length-2;i>=0;i-=2)a.push(Lo[0][i],Lo[0][i+1]);G.area(a,d.c,.07);}U.forEach(a=>G.poly(a,d.c,Math.max(1,d.w-.5),.9));Lo.forEach(a=>G.poly(a,d.c,Math.max(1,d.w-.5),.9));lineOf(V.a,y).forEach(a=>G.poly(a,d.c,1,.75,[4,3]));}
  else lineOf(V.a,y).forEach(a=>G.poly(a,d.c,d.w));}
 /* positions du joueur : prix moyen d'achat */
 for(const q of M.pos||[]){const Y=y(q.p);if(Y>4&&Y<mh-4){G.segs([0,Y,pw,Y],q.s==='oui'?'oui':'non',1,.7,[2,4]);G.text(q.label,8,Y-9,{s:fs,c:q.s==='oui'?'oui':'non',w:600,bg:'panel',bga:.85});}}
 /* tracés */
 const tags=[];if(!M.hideAll)for(const d of M.draws){if(d.h)continue;proDrawOne(G,L,M,d,tags);}
 if(M.pend)proDrawOne(G,L,M,M.pend,tags,true);
 G.unclip();
 /* dernier prix, graduations et étiquettes de l'axe des prix (une graduation recouverte par une étiquette n'est pas écrite) */
 const last=Sr.c[A.n-1],lastUp=cand?Sr.c[A.n-1]>=Sr.o[A.n-1]:true,lc=cand?(lastUp?'up':'dn'):lineC,lastY=y(last),showLast=M.live!==false&&lastY>2&&lastY<mh-2,hv=M.hover&&M.hover.i!==undefined?M.hover:null;
 if(showLast)G.segs([0,lastY,pw,lastY],lc,1,.55,[3,3]);
 if(!M.noAxis){const avY=tags.filter(t=>t.ax==='y').map(t=>t.y);if(showLast)avY.push(lastY);if(hv&&hv.y!==undefined&&hv.y<mh)avY.push(hv.y);
  for(const [Y,s] of yl)if(avY.every(a=>Math.abs(a-Y)>fs+3))G.text(s,pw+6,Y,{s:fs,c:'g3'});
  for(const t of tags)if(t.ax==='y'&&t.y>6&&t.y<mh-6)G.text(t.s,pw+4,t.y,{s:fs,c:proOn(t.c),w:600,bg:t.c,pad:3});
  if(showLast)G.text(plain(F.pct1(last/100)),pw+4,lastY,{s:fs,c:proOn(lc),w:700,bg:lc,pad:3});}
 /* volets secondaires : RSI, MACD */
 subs.forEach((g,k)=>{const top=mh+k*subH,ph=subH,ds=g.ds,multi=ds.length>1,rsi=g.k==='rsi';G.segs([0,top,W,top],'rule',1);let slo,shi;
  if(rsi){slo=0;shi=100;}else{let m=1e-6;for(const d of ds)for(let i=i0;i<=i1;i++)for(const key of ['a','b','c']){const z=d.vals[key][i];if(z===z&&z!==null&&Math.abs(z)>m)m=Math.abs(z);}slo=-m*1.15;shi=m*1.15;}
  const sy=v=>top+5+(shi-v)/(shi-slo)*(ph-10),spy=Y=>shi-(Y-top-5)/(ph-10)*(shi-slo);L.panes.push({k:g.k,d:ds[0],ds,top,h:ph,y:sy,py:spy});
  G.clip(0,top,pw,ph);
  if(rsi){G.rects([0,sy(70),pw,sy(30)-sy(70)],multi?'g4':ds[0].c,multi?.1:.06);G.segs([0,sy(70),pw,sy(70),0,sy(30),pw,sy(30)],'g4',1,.8,[3,3]);for(const d of ds)lineOf(d.vals.a,sy).forEach(a=>G.poly(a,d.c,d.w));}
  else{const bw=Math.max(1,cw*.6),z0=sy(0),al=multi?Math.max(.14,.45/ds.length):.45;
   for(const d of ds){const up=[],dn=[];for(let i=i0;i<=i1;i++){const z=d.vals.c[i];if(!(z===z)||z===null)continue;const Y=sy(z);(z>=0?up:dn).push(x(i+.5)-bw/2,Math.min(Y,z0),bw,Math.max(1,Math.abs(Y-z0)));}G.rects(up,'up',al);G.rects(dn,'dn',al);}
   G.segs([0,z0,pw,z0],'g4',1,.7);
   /* un seul MACD : signal orange, comme d'habitude ; plusieurs : chaque signal en pointillé, de la couleur de son MACD */
   for(const d of ds){lineOf(d.vals.a,sy,true).forEach(a=>G.poly(a,d.c,d.w));lineOf(d.vals.b,sy,true).forEach(a=>multi?G.poly(a,d.c,Math.max(1,d.w-.5),.9,[4,3]):G.poly(a,'#F59A0B',Math.max(1,d.w-.5)));}}
  G.unclip();
  if(!M.noAxis){if(rsi){G.text('70',pw+6,sy(70),{s:fs,c:'g3'});G.text('30',pw+6,sy(30),{s:fs,c:'g3'});}else G.text('0',pw+6,sy(0),{s:fs,c:'g3'});}
  const hi_=hv?clamp(hv.i,0,A.n-1):A.n-1,nz=v=>v===v&&v!==null,valOf=d=>{const V=d.vals;return rsi?(nz(V.a[hi_])?F.d1(V.a[hi_]):'–'):multi?(nz(V.a[hi_])?proSgn(V.a[hi_]):'–'):(nz(V.a[hi_])?proSgn(V.a[hi_]):'–')+'  '+(nz(V.b[hi_])?proSgn(V.b[hi_]):'–')+'  '+(nz(V.c[hi_])?proSgn(V.c[hi_]):'–');};
  if(!multi)G.text(pindLab(ds[0])+'   '+plain(valOf(ds[0])),8,top+11,{s:fs,c:'g2',w:600,bg:'panel',bga:.8,pad:4});
  else{/* une étiquette par indicateur, précédée de sa couleur ; ce qui ne tient pas dans la largeur est résumé par « +N » */
   let lx=8;for(let j=0;j<ds.length;j++){const d=ds[j],t=pindLab(d)+'  '+plain(valOf(d)),tw=G.tw(t,{s:fs,w:600}),rest=ds.length-j,more='+'+rest,need=11+tw+8+(rest>1?G.tw('+'+(rest-1),{s:fs,w:600})+14:0);
    if(j&&lx+need>pw-6){G.text(more,lx+4,top+11,{s:fs,c:'g2',w:600,bg:'panel',bga:.8,pad:4});break;}
    G.rects([lx,top+7,7,7],d.c);G.text(t,lx+15,top+11,{s:fs,c:'g2',w:600,bg:'panel',bga:.8,pad:4});lx+=15+tw+14;}}});
 /* axe du temps : graduations, puis étiquettes des lignes verticales, puis réticule */
 const hcx=hv?x(clamp(hv.i,0,A.n-1)+.5):-1,hvOn=hv&&hcx>=0&&hcx<=pw;
 if(!M.noAxis){G.segs([0,H-padB,W,H-padB],'rule',1);G.segs([pw,0,pw,H-padB],'rule',1);const avX=tags.filter(t=>t.ax==='x'&&t.x>30&&t.x<pw-30).map(t=>[t.x,G.tw(t.s,{s:fs,w:600})/2+6]);if(hvOn)avX.push([clamp(hcx,60,pw-60),G.tw(proWhen(T(clamp(hv.i,0,A.n-1)),A.ms),{s:fs,w:600})/2+8]);
  for(const [X0,s] of tl){const hw=G.tw(s,{s:fs})/2+4;if(avX.every(a=>Math.abs(a[0]-X0)>a[1]+hw))G.text(s,X0,H-padB+10,{s:fs,c:'g3',a:'center'});}
  for(const t of tags)if(t.ax==='x'&&t.x>30&&t.x<pw-30)G.text(t.s,t.x,H-padB+10,{s:fs,c:proOn(t.c),w:600,bg:t.c,pad:4,a:'center'});}
 if(hvOn){G.segs([hcx,0,hcx,H-padB],'g3',1,.8,[3,3]);if(!M.noAxis)G.text(proWhen(T(clamp(hv.i,0,A.n-1)),A.ms),clamp(hcx,60,pw-60),H-padB+10,{s:fs,c:'panel',w:600,bg:'ink',pad:5,a:'center'});}
 if(hv&&hv.y!==undefined&&hv.y>0&&hv.y<H-padB){G.segs([0,hv.y,pw,hv.y],'g3',1,.8,[3,3]);if(!M.noAxis){let s='';if(hv.y<mh)s=plain(F.pct1(py(hv.y)/100));else{const pn=L.panes.find(q=>hv.y>=q.top&&hv.y<q.top+q.h);if(pn)s=pn.d.k==='rsi'?plain(F.d1(pn.py(hv.y))):plain(proSgn(pn.py(hv.y)));}if(s)G.text(s,pw+4,hv.y,{s:fs,c:'panel',w:600,bg:'ink',pad:3});}}
 /* poignées du tracé sélectionné */
 if(M.sel&&!M.sel.h&&!M.hideAll){for(const [hx,hy] of proHandles(L,M,M.sel))G.circle(hx,hy,5,'panel',M.sel.c,2);}
 return L;}
const proOn=c=>c==='ink'?'panel':c==='non'||c==='#F59A0B'?'#14161B':'#fff';
const proSgn=v=>plain(bidi((v>=0?'+':'−')+NB(nf2.format(Math.abs(v)))));
/* ---------- Tracés ---------- */
/* rectangle occupé par l'étiquette d'un tracé (pour le sélectionner au toucher) : gardé hors du tracé, qui est enregistré tel quel */
const PBB=new WeakMap();
const PDRAW=['trend','hline','vline','rect','arrow','text','level'];
const pdrawLab=k=>({trend:_t('Ligne de tendance'),hline:_t('Ligne horizontale'),vline:_t('Ligne verticale'),rect:_t('Zone'),arrow:_t('Flèche'),text:_t('Texte'),level:_t('Repère de probabilité')})[k];
function proDrawOne(G,L,M,d,tags,ghost){const c=d.c||'oui',w=d.w||2,al=ghost?.6:1,ax=L.X(d.a[0]),ay=L.y(L.SP(d.a[1])),two=d.b&&(d.k==='trend'||d.k==='arrow'||d.k==='rect'),bx=two?L.X(d.b[0]):ax,by=two?L.y(L.SP(d.b[1])):ay;
 if(d.k==='trend')G.segs([ax,ay,bx,by],c,w,al);
 else if(d.k==='arrow'){G.segs([ax,ay,bx,by],c,w,al);const an=Math.atan2(by-ay,bx-ax),hl=8+w*2;if(Math.hypot(bx-ax,by-ay)>4)G.segs([bx,by,bx-hl*Math.cos(an-.45),by-hl*Math.sin(an-.45),bx,by,bx-hl*Math.cos(an+.45),by-hl*Math.sin(an+.45)],c,w,al);}
 else if(d.k==='rect'){const rx=Math.min(ax,bx),ry=Math.min(ay,by),rw=Math.abs(bx-ax),rh=Math.abs(by-ay);G.rects([rx,ry,rw,rh],c,.12*al);G.box(rx,ry,rw,rh,c,w,al);}
 else if(d.k==='hline'){G.segs([0,ay,L.pw,ay],c,w,al);tags.push({ax:'y',y:ay,s:plain(F.pct1(L.SP(d.a[1])/100)),c});}
 else if(d.k==='vline'){G.segs([ax,0,ax,L.mh],c,w,al);tags.push({ax:'x',x:ax,s:proWhen(d.a[0],M.A.ms),c});}
 else if(d.k==='level'){G.segs([ax,ay,L.pw,ay],c,w,al,[6,4]);G.circle(ax,ay,3.5,c);const s=plain(F.pct1(L.SP(d.a[1])/100))+(d.txt?' · '+d.txt:'');const tw=G.tw(s,{s:11,w:600});let lx=L.pw-tw-12;if(ax>lx-12)lx=Math.max(6,ax-tw-16);G.text(s,lx,ay-11,{s:11,c:proOn(c),w:600,bg:c,pad:5});PBB.set(d,[lx-5,ay-21,tw+10,20]);tags.push({ax:'y',y:ay,s:plain(F.pct1(L.SP(d.a[1])/100)),c});}
 else if(d.k==='text'){const s=d.txt||_t('Texte'),tw=G.tw(s,{s:12,w:600});G.circle(ax,ay,3,c);G.text(s,ax+10,ay-12,{s:12,c:c==='ink'?'ink':c,w:600,bg:'panel',bga:.92,bc:c,pad:6});PBB.set(d,[ax+4,ay-23,tw+12,22]);}}
function proHandles(L,M,d){const ax=L.X(d.a[0]),ay=L.y(L.SP(d.a[1]));if(d.k==='hline')return [[L.pw/2,ay]];if(d.k==='vline')return [[ax,L.mh/2]];if(d.k==='text'||d.k==='level')return [[ax,ay]];return [[ax,ay],[L.X(d.b[0]),L.y(L.SP(d.b[1]))]];}
const proSegD=(px,py,x1,y1,x2,y2)=>{const dx=x2-x1,dy=y2-y1,q=dx*dx+dy*dy,t=q?clamp(((px-x1)*dx+(py-y1)*dy)/q,0,1):0;return Math.hypot(px-x1-t*dx,py-y1-t*dy);};
/* Quel tracé se trouve sous le pointeur ? (le dernier tracé posé est au-dessus) */
function proHit(L,M,px,py,tol){if(M.hideAll||py>L.mh)return null;const one=(d)=>{if(d.h)return null;const H=proHandles(L,M,d);for(let k=0;k<H.length;k++)if(Math.hypot(px-H[k][0],py-H[k][1])<=tol+3)return {d,part:H.length===2?(k?'b':'a'):'body'};
  const ax=L.X(d.a[0]),ay=L.y(L.SP(d.a[1]));if(d.k==='hline')return Math.abs(py-ay)<=tol?{d,part:'body'}:null;if(d.k==='vline')return Math.abs(px-ax)<=tol?{d,part:'body'}:null;
  if(d.k==='text'||d.k==='level'){const b=PBB.get(d);if(b&&px>=b[0]-4&&px<=b[0]+b[2]+4&&py>=b[1]-4&&py<=b[1]+b[3]+4)return {d,part:'body'};if(d.k==='level'&&px>=ax&&Math.abs(py-ay)<=tol)return {d,part:'body'};return null;}
  const bx=L.X(d.b[0]),by=L.y(L.SP(d.b[1]));if(d.k==='rect'){const x0=Math.min(ax,bx),x1=Math.max(ax,bx),y0=Math.min(ay,by),y1=Math.max(ay,by);return px>=x0-tol&&px<=x1+tol&&py>=y0-tol&&py<=y1+tol?{d,part:'body'}:null;}
  return proSegD(px,py,ax,ay,bx,by)<=tol?{d,part:'body'}:null;};
 if(M.sel){const h=one(M.sel);if(h)return h;}for(let i=M.draws.length-1;i>=0;i--){const h=one(M.draws[i]);if(h)return h;}return null;}

/* ---------- Instantané d'une analyse (ce qui est partagé) ---------- */
const proR2=v=>v===v&&v!==null&&isFinite(v)?Math.round(v*100)/100:null;
/* Fige exactement ce qui est à l'écran : bougies visibles, indicateurs calculés, tracés. Les prix qui bougent ensuite ne le modifient pas. */
function proSnap(o){const A=o.A,start=o.end-o.vn,a=clamp(Math.floor(start)-2,0,A.n-1),b=clamp(Math.min(Math.ceil(o.end)+1,o.maxI===undefined?A.n-1:o.maxI),0,A.n-1),n=b-a+1,sl=arr=>{const out=new Array(n);for(let i=0;i<n;i++)out[i]=proR2(arr[a+i]);return out;};
 const m=MK[o.m],r=myRank();
 return {v:1,id:'a'+now().toString(36)+Math.floor(R()*1e4).toString(36),m:o.m,short:m?m.short:'',q:m?m.q:'',iv:o.iv,type:o.type,side:o.side,at:now(),p:m?r2(m.p):null,
  ms:A.ms,T0:A.T0+a*A.ms,n,o:sl(A.o),h:sl(A.h),l:sl(A.l),c:sl(A.c),vol:Array.from({length:n},(_,i)=>Math.round(A.v[a+i])),end:Math.min(o.end-a,n+o.vn*.5),vn:o.vn,
  inds:o.inds.filter(d=>!d.h).map(d=>{const V=proCalc(d,A,o.side,[a,b]),vals={};for(const k in V)vals[k]=sl(V[k]);return {id:d.id,k:d.k,p:Object.assign({},d.p),c:d.c,w:d.w,vals};}),
  dr:o.hideAll?[]:o.draws.filter(d=>!d.h).map(d=>({id:d.id,k:d.k,a:d.a.slice(),b:d.b?d.b.slice():undefined,c:d.c,w:d.w,txt:d.txt||''})),
  by:o.by||{u:'me',n:S.me.n,t:r.t,d:r.d}};}
/* Bougies d'un instantané, au format attendu par le peintre. */
function proSnapA(s){if(s._A)return s._A;const A={ms:s.ms,T0:s.T0,n:s.n,o:s.o,h:s.h,l:s.l,c:s.c,v:s.vol,ver:1,flip:null,snap:true};Object.defineProperty(s,'_A',{value:A,enumerable:false,writable:true,configurable:true});return A;}
/* Un instantané se dessine comme le direct : bougies et tracés en valeurs « Oui », retournés par le peintre si le côté partagé est « Non ».
   Les valeurs des indicateurs sont celles calculées au moment du partage : rien n'est recalculé. */
function proSnapModel(s,W,H,extra){return Object.assign({W,H,A:proSnapA(s),side:s.side,type:s.type,vn:s.vn,end:s.end,inds:s.inds,draws:s.dr,hideAll:false,sel:null,pend:null,hover:null,live:false},extra||{});}
/* Aperçu SVG d'un instantané (carte d'analyse, fenêtre de partage). */
function proSnapSvg(s,W,H,o){const G=proSvgG();proPaint(G,proSnapModel(s,W,H,Object.assign({compact:true},o||{})));
 return `<svg class="pro-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(_t('Graphique de l’analyse : {0}',[s.short]))}" direction="ltr">${G.out.join('')}</svg>`;}

