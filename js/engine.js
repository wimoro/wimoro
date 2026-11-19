/* WIMORO — engine module */

'use strict';
/* =====================================================================================
 *  Moteur de marché Wimoro
 *  ------------------------------------------------------------------------------------
 *  MARCHÉS CLASSIQUES : carnet d'ordres, comme Polymarket.
 *   - Une part gagnante rapporte 1 $. Une part Oui + une part Non = 1 $ verrouillé :
 *     chaque part achetée est financée par la mise de l'autre camp. Wimoro ne joue jamais
 *     contre les joueurs, donc aucune réserve à immobiliser et aucun pari ne peut la mettre en perte.
 *   - La profondeur du carnet dépend du volume du marché (BOOK_PCT du volume, par cent de prix).
 *   - Un ordre « mange » le carnet niveau par niveau : le prix moyen se dégrade avec la taille.
 *       coût(parts) = A0·parts + parts² / (2·D)     (A0 = meilleur prix, D = parts par 1 $ de prix)
 *   - Frais = taux · parts · p · (1 − p), comme Polymarket, avec des taux plus bas (PM_K).
 *     Payés à l'entrée seulement : revendre avant la clôture et encaisser les gains sont gratuits.
 *
 *  PARIS ÉCLAIR : vraie cagnotte (pari mutuel). Toutes les mises (nettes de frais) vont dans une
 *  cagnotte ; les gagnants se la partagent au prorata. Impossible de payer plus que ce qui est entré.
 * ===================================================================================== */
const ENG={
  BOOK_PCT:.006,     // profondeur : 0,6 % du volume en parts par cent de prix
  BOOK_MIN:400,      // profondeur minimale (marché neuf)
  LIQ_RATE:.01,      // part de l'écart rattrapée à chaque pas de croissance de la profondeur
  PM_K:.70,          // taux Wimoro = 70 % du taux Polymarket (30 % moins cher)
  RANK_DISC:.90,     // rang Diamant et au-dessus : −10 % sur les frais
  PMAX:.99,PMIN:.01, // bornes de prix du carnet
  CAP_BE:50,         // plafond absolu du break even éclair (sécurité : jamais plus que la cagnotte)
  BE_EDGE:.05,       // marge maison sur le break even : payé 95 % de sa cote équitable (le vert de la roulette rend 35 pour 36, soit 2,7 %)
  BE_MIN:5,BE_MAX:40 // bornes du multiplicateur break even
};
/* ---------- Break even : cote cohérente avec sa probabilité ---------- */
/* fonction d'erreur (Abramowitz-Stegun 7.1.26, précision 1,5e-7) */
function erf(x){const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+.3275911*x);const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return s*y;}
/* probabilité qu'une marche aléatoire (pas uniformes de largeur k, `ticks` pas) finisse dans ±band : P(|N(0,σ)| ≤ band), σ = k·√(ticks/12) */
function beProb(band,k,ticks){const sig=k*Math.sqrt(ticks/12);return Math.max(.002,Math.min(.5,erf(band/(sig*Math.SQRT2))));}
/* multiplicateur payé = (1 − marge) / probabilité, borné */
function beMultFair(p){return Math.max(ENG.BE_MIN,Math.min(ENG.BE_MAX,(1-ENG.BE_EDGE)/p));}
/* argent de la cagnotte encore disponible pour promettre des gains break even : mises Oui + Non, moins ce qui est déjà promis */
function beRoom(g){return Math.max(0,g.pool.o+g.pool.n-(g.pool.eProm||0));}
/* Barème public de Polymarket (docs.polymarket.com/trading/fees, nov. 2026) : frais = parts × taux × p × (1 − p) */
const PM_RATE={'Crypto':.07,'Football':.05,'Sport':.05,'Sport live':.05,'Tech et IA':.04,'Économie':.05,'Culture':.05,'Météo':.05,'Bourse':.04,'Matières':.04,'Devises':.04};
const pmRate=cat=>PM_RATE[cat]!==undefined?PM_RATE[cat]:.05;
/* Frais des paris sur les marchés : ceux du serveur (wm.fee_rate), lus dans ses réglages publics (api_site, puis l'événement
   « cfg » du sujet « site »). Taux de la catégorie × multiplicateur × remise du rang Diamant. Valeurs par défaut : les
   constantes ci-dessus, égales à celles du serveur ; tant qu'aucun réglage n'arrive, rien ne change. */
const REG_CAT={'Crypto':'crypto','Football':'football','Politique':'politique','Tech et IA':'tech_ia','Économie':'economie','Culture':'culture','Météo':'meteo','Sport':'sport','Sport live':'sport_live','Bourse':'bourse','Matières':'matieres','Devises':'devises'};
const ENG_REG_DEF={k:ENG.PM_K,remise:ENG.RANK_DISC,defaut:.05,taux:Object.assign({},PM_RATE,{'Politique':.05})};
const ENG_REG=JSON.parse(JSON.stringify(ENG_REG_DEF));
/* taux d'un barème donné (le barème en vigueur, ou un brouillon du panneau d'administration) */
const regRate=(reg,cat,disc)=>{const t=reg.taux[cat];return (typeof t==='number'?t:reg.defaut)*reg.k*(disc?reg.remise:1);};
const wmRate=(cat,disc)=>regRate(ENG_REG,cat,disc);
/* Applique des réglages du serveur ({clé: valeur}) ; une valeur absente ou d'un autre type garde la précédente.
   Rend vrai si les frais ont changé (l'écran recalcule alors les aperçus ouverts). */
function engReglages(v){if(!v||typeof v!=='object')return false;const avant=JSON.stringify(ENG_REG),n=x=>typeof x==='number'&&isFinite(x)&&x>=0;
 if(n(v['frais.k']))ENG_REG.k=v['frais.k'];if(n(v['frais.remise_rang']))ENG_REG.remise=v['frais.remise_rang'];if(n(v['frais.taux.defaut']))ENG_REG.defaut=v['frais.taux.defaut'];
 for(const cat in REG_CAT){const x=v['frais.taux.'+REG_CAT[cat]];if(n(x))ENG_REG.taux[cat]=x;}
 return JSON.stringify(ENG_REG)!==avant;}
/* Frais éclair, Série et Blitz : calculés par le moteur éclair du serveur avec ses propres constantes (js/moteur-eclair.js,
   copie conforme dans l'Edge Function « eclair »), qui ne lit pas encore les réglages : l'aperçu garde donc ces constantes. */
const eclairRate=(cat,disc)=>pmRate(cat)*ENG.PM_K*(disc?ENG.RANK_DISC:1);
const engClamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---------- Carnet ---------- */
/* La profondeur suit le volume avec un temps de retard (les teneurs de marché ajoutent de la liquidité au fil du temps) :
   elle ne bouge pas pendant un ordre, donc acheter puis revendre ne peut jamais rapporter de l'argent. Elle ne baisse jamais. */
const bookDepth=m=>{if(m.liq===undefined)m.liq=Math.max(ENG.BOOK_MIN,(m.vol||0)*ENG.BOOK_PCT);return Math.max(ENG.BOOK_MIN,m.liq);}; // parts par cent de prix
function growLiq(m){const tgt=Math.max(ENG.BOOK_MIN,(m.vol||0)*ENG.BOOK_PCT),cur=bookDepth(m);if(tgt>cur)m.liq=cur+(tgt-cur)*ENG.LIQ_RATE;return m.liq;}
const bookHalf=m=>engClamp(15/Math.sqrt(bookDepth(m)),.1,1.5)/100;                        // demi-écart acheteur/vendeur, en $
const sideMid=(m,side)=>(side==='oui'?m.p:100-m.p)/100;                                   // prix milieu du côté, en $

/* Achat : on dépense `cost` (hors frais) en mangeant les offres de A0 vers le haut. */
function bookBuy(m,side,cost){
  const D=bookDepth(m)*100,mid=sideMid(m,side),A0=Math.min(ENG.PMAX,mid+bookHalf(m));
  const cap=Math.max(0,D*(ENG.PMAX-A0)),maxCost=A0*cap+cap*cap/(2*D);                      // parts / coût max jusqu'à 99 ¢
  const c=Math.max(0,Math.min(cost,maxCost));
  const sh=c>0?2*c/(A0+Math.sqrt(A0*A0+2*c/D)):0;                                         // forme stable de D(√(A0²+2c/D) − A0)
  return {sh,cost:c,first:A0,avg:sh>0?c/sh:A0,mid0:mid,mid1:mid+sh/D,cap,maxCost,full:cost<=maxCost+1e-9};
}
/* Vente : on vend `sh` parts en mangeant les demandes de B0 vers le bas. */
function bookSell(m,side,sh){
  const D=bookDepth(m)*100,mid=sideMid(m,side),B0=Math.max(ENG.PMIN,mid-bookHalf(m));
  const cap=Math.max(0,D*(B0-ENG.PMIN)),s=Math.max(0,Math.min(sh,cap));
  const pro=s*B0-s*s/(2*D);
  return {sh:s,pro,first:B0,avg:s>0?pro/s:B0,mid0:mid,mid1:mid-s/D,cap,full:sh<=cap+1e-9};
}

/* Devis d'achat : `total` = ce que le joueur débite, frais compris. Frais = coût · taux · (1 − prix moyen).
   `taux` (facultatif) : un taux donné, pour comparer deux barèmes (exemple chiffré du panneau d'administration). */
function quoteBuy(m,side,total,disc,taux){
  const th=typeof taux==='number'?taux:wmRate(m.cat,disc);let a=total/(1+th/2),r=bookBuy(m,side,a);
  for(let i=0;i<12;i++){r=bookBuy(m,side,a);const fee=r.cost*th*(1-r.avg);const na=Math.max(0,total-fee);if(Math.abs(na-a)<1e-10){a=na;break;}a=na;}
  r=bookBuy(m,side,a);const fee=r.cost*th*(1-r.avg),totalFee=r.cost+fee;
  const capFee=r.maxCost*th*(1-(r.cap>0?r.maxCost/r.cap:r.first));
  return {side,total:r.full?total:totalFee,req:total,a:r.cost,fee,sh:r.sh,avg:r.avg*100,first:r.first*100,theta:th,feeRate:r.cost>0?fee/(r.cost+fee):th*(1-r.first),
    impact:(r.mid1-r.mid0)*100,mid1:r.mid1*100,spread:(r.first-r.mid0)*100,full:r.full,maxTotal:r.maxCost+capFee,
    pm:r.cost*pmRate(m.cat)*(1-r.avg),gain:r.sh-(r.full?total:totalFee)};
}
function quoteSell(m,side,sh){const r=bookSell(m,side,sh);return {side,sh:r.sh,pro:r.pro,avg:r.avg*100,first:r.first*100,impact:(r.mid0-r.mid1)*100,mid1:r.mid1*100,full:r.full,cap:r.cap};}

/* Exécution : le prix du marché se déplace de l'impact de l'ordre (en points de %). */
function applyBuy(m,q){const d=q.impact*(q.side==='oui'?1:-1);m.p=engClamp(m.p+d,1,99);m.vol+=q.a;return m.p;}
function applySell(m,q){const d=q.impact*(q.side==='oui'?-1:1);m.p=engClamp(m.p+d,1,99);m.vol+=q.pro;return m.p;}
/* Valeur de sortie d'une position (ce qu'elle rapporterait si on la vendait maintenant). */
const liqValue=(m,side,sh)=>bookSell(m,side,sh).pro;
/* Meilleure offre et meilleure demande du carnet, en ¢. */
const bestAsk=(m,side)=>Math.min(ENG.PMAX,sideMid(m,side)+bookHalf(m))*100;
const bestBid=(m,side)=>Math.max(ENG.PMIN,sideMid(m,side)-bookHalf(m))*100;

/* ---------- Ordres à cours limité ---------- */
/* Achat limité : on dépense `total` (frais compris) mais seulement tant que le prix reste ≤ pcap ($).
   Si le carnet ne permet pas de tout exécuter sous ce prix, la part exécutable l'est tout de suite et `rest` attend. */
function quoteBuyCap(m,side,total,disc,pcap){
  const th=wmRate(m.cat,disc),D=bookDepth(m)*100,mid=sideMid(m,side),A0=Math.min(ENG.PMAX,mid+bookHalf(m)),P=Math.min(pcap,ENG.PMAX);
  if(P<=A0+1e-12)return {side,sh:0,a:0,fee:0,total:0,rest:total,avg:A0*100,first:A0*100,impact:0,mid1:mid*100,theta:th,full:false,marketable:false,partial:false};
  const capSh=D*(P-A0),capCost=A0*capSh+capSh*capSh/(2*D),capAvg=capSh>0?capCost/capSh:A0,capFee=capCost*th*(1-capAvg);
  if(total>=capCost+capFee-1e-9)return {side,sh:capSh,a:capCost,fee:capFee,total:capCost+capFee,rest:total-capCost-capFee,avg:capAvg*100,first:A0*100,impact:capSh/D*100,mid1:(mid+capSh/D)*100,theta:th,feeRate:capCost>0?capFee/(capCost+capFee):0,full:true,marketable:true,partial:true};
  const q=quoteBuy(m,side,total,disc);q.rest=0;q.marketable=true;q.partial=false;return q;
}
/* Vente limitée : on vend `sh` parts mais seulement tant que le prix reste ≥ pfloor ($). */
function quoteSellCap(m,side,sh,pfloor){
  const D=bookDepth(m)*100,mid=sideMid(m,side),B0=Math.max(ENG.PMIN,mid-bookHalf(m)),P=Math.max(pfloor,ENG.PMIN);
  if(B0<=P+1e-12)return {side,sh:0,pro:0,rest:sh,avg:B0*100,first:B0*100,impact:0,mid1:mid*100,full:false,marketable:false,partial:false};
  const capSh=D*(B0-P);
  if(sh>capSh+1e-9){const pro=B0*capSh-capSh*capSh/(2*D);return {side,sh:capSh,pro,rest:sh-capSh,avg:capSh>0?pro/capSh*100:B0*100,first:B0*100,impact:capSh/D*100,mid1:(mid-capSh/D)*100,full:true,marketable:true,partial:true};}
  const q=quoteSell(m,side,sh);q.rest=0;q.marketable=true;q.partial=false;return q;
}

/* ---------- Paris éclair : cagnotte ---------- */
const flashPool=g=>g.pool.o+g.pool.n+g.pool.e;
const poolKey=side=>side==='oui'?'o':side==='non'?'n':'e';
/* frais prélevés à la mise : taux · (1 − part de la cagnotte déjà sur ce côté) */
function flashFee(cat,g,side,amt,disc){const T=flashPool(g),share=T>0?g.pool[poolKey(side)]/T:.5;return amt*eclairRate(cat,disc)*(1-share);}
/* gain si le côté gagne : Oui/Non = mise nette × (cagnotte / mises du côté) ; break even = mise nette × cote bloquée à la mise (beMultFair), jamais plus que la cagnotte */
function flashPayout(g,my){const key=poolKey(my.s),T=flashPool(g),W=g.pool[key];if(W<=0)return my.net;let mult=T/W;if(my.s==='be')mult=Math.min(mult,my.mult||ENG.CAP_BE,ENG.CAP_BE);return my.net*mult;}

if(typeof module!=='undefined')module.exports={ENG,PM_RATE,pmRate,wmRate,eclairRate,regRate,engReglages,ENG_REG,ENG_REG_DEF,REG_CAT,bookDepth,growLiq,bookHalf,sideMid,bookBuy,bookSell,quoteBuy,quoteSell,applyBuy,applySell,liqValue,bestAsk,bestBid,quoteBuyCap,quoteSellCap,flashPool,poolKey,flashFee,flashPayout,erf,beProb,beMultFair,beRoom};

