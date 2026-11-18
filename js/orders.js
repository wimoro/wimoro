/* WIMORO — orders module */

'use strict';
/* =====================================================================================
 *  Ordres à cours limité, stop loss et take profit
 *  ------------------------------------------------------------------------------------
 *  - Ordre limite d'achat : le joueur fixe un prix maximum en ¢ et un montant. Ce qui peut être
 *    exécuté sous ce prix l'est tout de suite ; le reste attend dans le carnet et s'exécute quand
 *    le marché revient (exécutions partielles possibles). Le montant est réservé sur le solde.
 *  - Ordre limite de vente : prix minimum et nombre de parts.
 *  - Protection d'une position : stop loss (vente au marché si le prix tombe sous un seuil) et
 *    take profit (vente au marché si le prix atteint un objectif).
 *  Les ordres sont vérifiés à chaque mouvement de prix (updateMarket) et toutes les 2 secondes.
 * ===================================================================================== */
const ORD={DUST:.5,MINSH:.05};
const ordersAll=()=>S.me.orders||(S.me.orders=[]);
const ordersOpen=m=>ordersAll().filter(o=>o.status==='open'&&(!m||o.m===m));
const ordersDone=()=>ordersAll().filter(o=>o.status!=='open');
const guardsAll=()=>S.me.guards||(S.me.guards=[]);
const guardOf=(m,s)=>guardsAll().find(g=>g.m===m&&g.s===s);
const reservedCash=()=>ordersOpen().filter(o=>o.k==='buy').reduce((a,o)=>a+o.cash,0);
const newId=p=>p+now().toString(36)+Math.floor(R()*46656).toString(36);
const sideTxt=s=>s==='oui'?_t("Oui"):_t("Non");
const lpOf=st=>clamp(Math.round(numOf(st.lp)||0),1,99);
const curPx=(m,s)=>s==='oui'?m.p:100-m.p;

/* ---------- Calcul du ticket en mode limite ---------- */
function calcLimit(st){
 const m=MK[st.m],r=myRank(),disc=r.t>=5,lp=lpOf(st),v=Math.max(0,F.parse(st.amt));
 if(st.mode==='sell'){const p=posOf(st.m,st.side),sh=Math.min(v,p.sh),q=quoteSellCap(m,st.side,sh,lp/100),restPro=q.rest*lp/100,pro=q.pro+restPro;
  return {limit:true,sell:true,lp,q,sh,nowSh:q.sh,nowPro:q.pro,rest:q.rest,restPro,pro,pnl:pro-sh*p.avg/100,bid:bestBid(m,st.side),ok:sh>ORD.MINSH&&lp>=1&&lp<=99&&!!st.lp};}
 const q=quoteBuyCap(m,st.side,v,disc,lp/100),th=q.theta,restSh=q.rest>0?q.rest/((lp/100)*(1+th*(1-lp/100))):0,sh=q.sh+restSh,fee=q.fee+(q.rest-restSh*lp/100);
 return {limit:true,lp,q,amt:v,nowSh:q.sh,nowCost:q.total,rest:q.rest,restSh,sh,fee:Math.max(0,fee),gain:sh-v,ask:bestAsk(m,st.side),insuf:v>S.me.balance+1e-9,ok:v>=1&&v<=S.me.balance+1e-9&&lp>=1&&lp<=99&&!!st.lp};
}
/* Prix limite proposé par défaut : un peu sous le prix pour un achat, un peu au-dessus pour une vente. */
function lpDefault(st){const m=MK[st.m],px=curPx(m,st.side);return String(clamp(Math.round(st.mode==='sell'?px+2:px-2),1,99));}
function otypeH(ctx,st){return `<div class="seg otype" role="tablist" aria-label="${_t("Type d’ordre")}"><button class="${st.otype!=='limit'?'on':''}" data-a="otype" data-v="market" data-ctx="${ctx}">${_t("Au marché")}</button><button class="${st.otype==='limit'?'on':''}" data-a="otype" data-v="limit" data-ctx="${ctx}">${_t("Ordre limite")}</button></div>`;}
function lpFieldH(ctx,st){const m=MK[st.m],px=curPx(m,st.side),sell=st.mode==='sell';if(st.lp===undefined||st.lp==='')st.lp=lpDefault(st);
 const chips=(sell?[2,5,10]:[-2,-5,-10]).map(d=>`<button type="button" class="btn b-ghost sm" data-a="lpset" data-v="${clamp(Math.round(px+d),1,99)}" data-ctx="${ctx}">${bidi((d>0?'+':'−')+plain(F.c(Math.abs(d))))}</button>`).join('');
 return `<div class="amt-h"><b>${sell?_t("Prix de vente minimum"):_t("Prix d’achat maximum")}</b><span>${_t("Prix actuel")} <b class="num" data-${st.side==='oui'?'mc':'mcn'}="${m.id}">${F.c(px)}</b></span></div>
 <label class="amt lpw"><button type="button" class="stp" data-a="lpstep" data-v="-1" data-ctx="${ctx}" aria-label="${_t("Baisser le prix limite")}">${ic('minus',16)}</button><input data-tlp="${ctx}" inputmode="numeric" value="${esc(st.lp)}" aria-label="${_t("Prix limite en cents")}"><span>¢</span><button type="button" class="stp" data-a="lpstep" data-v="1" data-ctx="${ctx}" aria-label="${_t("Monter le prix limite")}">${ic('plus',16)}</button></label>
 <div class="presets">${chips}<button type="button" class="btn b-ghost sm" data-a="lpset" data-v="${Math.round(px)}" data-ctx="${ctx}">${_t("Prix actuel")}</button></div>`;}
function limitCalcH(ctx,c){const st=tState(ctx),m=MK[st.m],Side=sideTxt(st.side);
 if(c.sell){const p=posOf(st.m,st.side);
  return `<div class="calc"><div class="line"><span>${_t("Prix minimum")}</span><b>${F.c(c.lp)}</b></div><div class="line"><span>${_t("Vendu tout de suite")}</span><b>${c.nowSh>ORD.MINSH?`${_t("{0} parts, {1}",[F.d1(c.nowSh),F.usd(c.nowPro)])}`:_t("Rien pour l’instant")}</b></div><div class="line"><span>${_t("En attente dans le carnet")}</span><b>${c.rest>ORD.MINSH?`${_t("{0} parts à {1}",[F.d1(c.rest),F.c(c.lp)])}`:_t("Rien")}</b></div><div class="line"><span>${_t("Ton prix moyen d’achat")}</span><b>${F.c1(p.avg)}</b></div><div class="line gain"><span>${_t("Si tout est vendu")}</span><b class="${plc(c.pnl)}">${F.usd(c.pro)} (${F.signed(c.pnl)})</b></div></div>
  ${c.lp<=c.bid&&c.ok?`<p class="note warn">${_t("Ton prix minimum ({0}) est sous la meilleure demande ({1}) : la vente est immédiate, comme un ordre au marché.",[F.c(c.lp),F.c1(c.bid)])}</p>`:''}
  <button class="btn b-ink lg full" data-a="limit-place" data-ctx="${ctx}"${c.ok?'':' disabled'}>${_t("Placer l’ordre de vente")}</button>
  <p class="note">${_t("L’ordre reste dans le carnet jusqu’à son exécution ou son annulation. Vendre est gratuit.")}</p>`;}
 return `<div class="calc"><div class="line"><span>${_t("Prix maximum")}</span><b>${F.c(c.lp)}</b></div><div class="line"><span>${_t("Exécuté tout de suite")}</span><b>${c.nowSh>ORD.MINSH?`${_t("{0} parts pour {1}",[F.d1(c.nowSh),F.usd(c.nowCost)])}`:_t("Rien pour l’instant")}</b></div><div class="line"><span>${_t("En attente dans le carnet")}</span><b>${c.rest>=ORD.DUST?_t('{0} à {1}',[F.usd(c.rest),F.c(c.lp)]):_t("Rien")}</b></div><div class="line"><span>${_t("Parts si tout est exécuté")}</span><b>${F.d2(Math.max(0,c.sh))}</b></div><div class="line"><span>${_t("Frais estimés")}</span><b>${F.usd(c.fee)}</b></div><div class="line gain"><span>${_t("Gain si {0}, tout exécuté",[Side])}</span><b>${F.signed(Math.max(0,c.gain))}</b></div></div>
 ${c.lp>=c.ask&&c.ok&&c.rest<ORD.DUST?`<p class="note warn">${_t("Ton prix maximum ({0}) est au-dessus de la meilleure offre ({1}) : l’ordre s’exécute entièrement tout de suite.",[F.c(c.lp),F.c1(c.ask)])}</p>`:''}
 ${c.insuf?`<a class="btn b-ink lg full" href="#depot" data-a="close">${_t("Solde insuffisant : déposer des fonds")}</a>`:`<button class="btn ${st.side==='oui'?'b-yes':'b-no'} lg full" data-a="limit-place" data-ctx="${ctx}"${c.ok?'':' disabled'}>${_t("Placer l’ordre limite {0}",[Side])}</button>`}
 <p class="note">${_t("Le montant est réservé sur ton solde tant que l’ordre attend. Tu peux l’annuler à tout moment, sans frais. Les frais ne sont prélevés que sur la partie exécutée.")}</p>`;}

/* ---------- Exécution ---------- */
function fillBuy(o,m){
 const q=quoteBuyCap(m,o.s,o.cash,myRank().t>=5,o.lp/100);if(q.sh<=1e-9)return null;
 const p=S.me.positions.find(x=>x.m===m.id&&x.s===o.s);
 if(p){p.avg=(p.avg*p.sh+q.avg*q.sh)/(p.sh+q.sh);p.sh+=q.sh;}else S.me.positions.push({m:m.id,s:o.s,sh:q.sh,avg:q.avg});
 if(!o.sh){S.me.played++;S.me.maxBet=Math.max(S.me.maxBet||0,o.init);}
 S.me.realized-=q.fee;
 const old=m.p;applyBuy(m,q);m.anchor=clamp(m.anchor+q.impact*(o.s==='oui'?1:-1)*.7,5,95);m.people++;addBet(m,{s:o.s==='oui'?1:0,a:Math.min(1,q.total/300),me:1});
 o.cash=q.rest;o.sh+=q.sh;o.spent+=q.total;o.fee=(o.fee||0)+q.fee;o.last=now();
 if(o.cash<ORD.DUST){S.me.balance+=o.cash;o.cash=0;o.status='filled';o.end=now();}
 updateMarket(m,old);return q;
}
function fillSell(o,m){
 const p=posOf(m.id,o.s),sh=Math.min(o.sh,p.sh);
 if(sh<=ORD.MINSH){o.status='cancelled';o.why='noshares';o.end=now();return null;}
 const q=quoteSellCap(m,o.s,sh,o.lp/100);if(q.sh<=1e-9)return null;
 const pnl=q.pro-q.sh*p.avg/100;p.sh-=q.sh;S.me.balance+=q.pro;S.me.realized+=pnl;
 if(p.sh<ORD.MINSH){S.me.positions=S.me.positions.filter(x=>x!==p);dropGuard(m.id,o.s);}
 S.me.history.unshift({k:'sell',m:m.id,q:m.q,s:o.s,win:pnl>=0,pnl,at:now(),via:'limit'});
 const old=m.p;applySell(m,q);addBet(m,{s:o.s==='oui'?0:1,a:Math.min(1,q.pro/300),me:1});
 o.sh-=q.sh;o.pro=(o.pro||0)+q.pro;o.pnl=(o.pnl||0)+pnl;o.last=now();
 if(o.sh<ORD.MINSH){o.sh=0;o.status='filled';o.end=now();}
 updateMarket(m,old);q.pnl=pnl;return q;
}
let ORD_BUSY=false;
function ordersCheck(m){
 if(ORD_BUSY||!S.me.logged)return;const L=ordersOpen(m.id),G=guardsAll().filter(g=>g.m===m.id);if(!L.length&&!G.length)return;
 ORD_BUSY=true;let touched=false;
 try{
  for(const o of L){
   const q=o.k==='buy'?fillBuy(o,m):fillSell(o,m);if(!q&&o.status==='open')continue;touched=true;
   const done=o.status!=='open';
   if(o.k==='buy'&&q)toast({tone:'blue',icon:'check',title:done?_t("Ordre limite exécuté"):_t("Ordre limite exécuté en partie"),text:`${_t("{0} parts {1} à {2} sur {3}",[F.d1(q.sh),sideTxt(o.s),F.c1(q.avg),m.short])}`,href:'#marche-'+m.id});
   else if(o.k==='sell'&&q)toast({tone:q.pnl>=0?'green':'red',icon:'check',title:done?_t("Vente limite exécutée"):_t("Vente limite exécutée en partie"),text:`${_t("{0} parts à {1} sur {2}, {3}",[F.d1(q.sh),F.c1(q.avg),m.short,F.signed(q.pnl)])}`,href:'#marche-'+m.id});
   else if(o.status==='cancelled')toast({tone:'amber',icon:'info',title:_t("Ordre de vente annulé"),text:`${_t("Tu n’as plus de parts {0} sur {1}.",[sideTxt(o.s),m.short])}`});
   if(q)notif('check',`${_t("{0} {1} : {2} parts {3} à {4}, {5}.",[o.k==='buy'?_t("Ordre limite"):_t("Vente limite"),done?_t("exécuté"):_t("exécuté en partie"),F.d1(q.sh),sideTxt(o.s),F.c1(q.avg),m.short])}`,'#marche-'+m.id);
  }
  for(const g of G){
   const p=posOf(m.id,g.s);if(p.sh<=ORD.MINSH){dropGuard(m.id,g.s);touched=true;continue;}
   const bid=bestBid(m,g.s),hitStop=g.stop&&bid<=g.stop,hitTp=g.tp&&bid>=g.tp;if(!hitStop&&!hitTp)continue;
   const q=quoteSell(m,g.s,p.sh);if(q.sh<=1e-9)continue;
   const pnl=q.pro-q.sh*p.avg/100;p.sh-=q.sh;S.me.balance+=q.pro;S.me.realized+=pnl;touched=true;
   if(p.sh<ORD.MINSH){S.me.positions=S.me.positions.filter(x=>x!==p);dropGuard(m.id,g.s);}
   S.me.history.unshift({k:'sell',m:m.id,q:m.q,s:g.s,win:pnl>=0,pnl,at:now(),via:hitStop?'stop':'tp'});
   const old=m.p;applySell(m,q);addBet(m,{s:g.s==='oui'?0:1,a:Math.min(1,q.pro/300),me:1});updateMarket(m,old);
   const ttl=hitStop?_t("Stop loss déclenché"):_t("Take profit atteint");
   toast({tone:pnl>=0?'green':'red',icon:'shield',title:ttl,text:`${_t("{0} parts {1} vendues à {2} sur {3} : {4}",[F.d1(q.sh),sideTxt(g.s),F.c1(q.avg),m.short,F.signed(pnl)])}`,href:'#profil',dur:6000});
   notif('shield',`${_t("{0} sur {1} : {2} parts {3} vendues à {4}, {5}.",[ttl,m.short,F.d1(q.sh),sideTxt(g.s),F.c1(q.avg),F.signed(pnl)])}`,'#profil');
  }
 }finally{ORD_BUSY=false;}
 if(touched){updateHeader();checkBadges();save();ordersRefresh();}
}
function ordersTick(){if(!S.me.logged)return;const ids=new Set([...ordersOpen().map(o=>o.m),...guardsAll().map(g=>g.m)]);for(const id of ids){const m=MK[id];if(m)ordersCheck(m);}}

/* ---------- Placement et annulation ---------- */
function placeLimit(ctx,ev){
 const st=tState(ctx),m=MK[st.m],c=calcLimit(st);if(!c.ok||!m)return;
 if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;
 const before=myRank();let o;
 if(c.sell){o={id:newId('o'),m:m.id,s:st.side,k:'sell',lp:c.lp,sh:c.sh,init:c.sh,pro:0,pnl:0,at:now(),status:'open'};ordersAll().unshift(o);const q=fillSell(o,m);
  const done=o.status!=='open';
  toast({tone:done?'green':'blue',icon:'check',title:done?_t("Vente exécutée"):q?_t("Vente exécutée en partie"):_t("Ordre de vente placé"),text:q?`${_t("{0} parts à {1}{2}",[F.d1(q.sh),F.c1(q.avg),done?'':`${_t(", le reste attend à {0}",[F.c(c.lp)])}`])}`:`${_t("{0} parts {1} à {2} minimum",[F.d1(c.sh),sideTxt(st.side),F.c(c.lp)])}`,href:'#marche-'+m.id});
  notif('check',`${_t("{0} : {1} parts {2} à {3}, {4}.",[done?_t("Vente exécutée"):_t("Ordre de vente placé"),F.d1(c.sh),sideTxt(st.side),F.c(c.lp),m.short])}`,'#marche-'+m.id);}
 else{S.me.balance-=c.amt;o={id:newId('o'),m:m.id,s:st.side,k:'buy',lp:c.lp,cash:c.amt,init:c.amt,sh:0,spent:0,at:now(),status:'open'};ordersAll().unshift(o);const q=fillBuy(o,m);
  const done=o.status!=='open';
  toast({tone:'blue',icon:'check',title:done?_t("Ordre exécuté"):q?_t("Ordre exécuté en partie"):_t("Ordre limite placé"),text:q?`${_t("{0} parts {1} à {2}{3}",[F.d1(q.sh),sideTxt(st.side),F.c1(q.avg),done?'':`${_t(", {0} attendent à {1}",[F.usd(o.cash),F.c(c.lp)])}`])}`:`${_t("{0} sur {1} à {2} maximum, {3}",[F.usd(c.amt),sideTxt(st.side),F.c(c.lp),m.short])}`,href:'#marche-'+m.id});
  notif('check',`${_t("{0} : {1} sur {2} à {3} maximum, {4}.",[done?_t("Ordre exécuté"):_t("Ordre limite placé"),F.usd(c.amt),sideTxt(st.side),F.c(c.lp),m.short])}`,'#marche-'+m.id);
  gainXP(10,ev);mission('bet');if(!S.me.limitXP){S.me.limitXP=1;setTimeout(()=>gainXP(15),600);}}
 updateHeader();checkBadges();checkRank(before);save();
 st.amt=st.mode==='sell'?'':'50';if(ctx==='sheet')closeModal();else rerenderTicket();ordersRefresh();
}
function cancelOrder(id){const o=ordersAll().find(x=>x.id===id);if(!o||o.status!=='open')return;const m=MK[o.m];
 if(o.k==='buy'){S.me.balance+=o.cash;o.cash=0;}o.status='cancelled';o.why='user';o.end=now();
 updateHeader();save();toast({icon:'x',title:_t("Ordre annulé"),text:o.k==='buy'?_t("Le montant réservé est de retour sur ton solde."):_t("Tes parts restent dans ton portefeuille."),dur:2600});ordersRefresh();if(m)rerenderTicket();}

/* ---------- Protection d'une position ---------- */
function dropGuard(m,s){const G=guardsAll(),i=G.findIndex(g=>g.m===m&&g.s===s);if(i>=0)G.splice(i,1);}
function guardTagH(p){const g=guardOf(p.m,p.s);if(!g)return '';return ` <span class="gtag" title="${_t("Protection active")}">${ic('shield',10)} ${g.stop?`SL ${F.c(g.stop)}`:''}${g.stop&&g.tp?' · ':''}${g.tp?`TP ${F.c(g.tp)}`:''}</span>`;}
function guardBtnH(mid){const L=S.me.positions.filter(p=>p.m===mid);if(!L.length)return '';const any=L.some(p=>guardOf(mid,p.s));return `<button class="btn b-white full" data-a="guard" data-m="${mid}" data-s="${L[0].s}" style="margin-top:8px">${ic('shield',16)} ${any?_t("Modifier la protection"):_t("Stop loss et take profit")}</button>`;}
function guardCalc(d){const m=MK[d.m],p=posOf(d.m,d.s),px=curPx(m,d.s),stop=d.stop===''?0:clamp(Math.round(numOf(d.stop)||0),1,99),tp=d.tp===''?0:clamp(Math.round(numOf(d.tp)||0),1,99);
 const pnlAt=x=>x?p.sh*(x-p.avg)/100:0;let err='';
 if(stop&&stop>=px)err=_t("Le stop loss doit être sous le prix actuel.");else if(tp&&tp<=px)err=_t("Le take profit doit être au-dessus du prix actuel.");else if(!stop&&!tp)err=_t("Indique au moins un seuil.");
 return {m,p,px,stop,tp,pnlStop:pnlAt(stop),pnlTp:pnlAt(tp),err,ok:!err,none:!stop&&!tp};}
/* C15 : chaque raccourci annonce le prix du seuil et le résultat sur la position (par rapport au prix moyen) ; un seuil ramené à 99 ¢ ou 1 ¢ est signalé */
const guardPre=(c,x)=>{const raw=Math.round(c.px*(1+x)),v=clamp(raw,1,99);return {l:F.spct(x*100),v,cap:raw>99?_t('max'):raw<1?_t('min'):'',r:c.p.avg>0?(v-c.p.avg)/c.p.avg*100:0};};
const guardRes=(c,v)=>c.p.avg>0?(v-c.p.avg)/c.p.avg*100:0;
function guardHint(c,k){const v=c[k];if(!v)return k==='stop'?_t('Limite ta perte si le marché se retourne.'):_t('Encaisse automatiquement quand ton objectif est atteint.');
 return _t('Vente de toutes les parts au marché à {0} : {1} sur ta position, résultat estimé {2}.',[F.c(v),fmtPct(guardRes(c,v)),F.signed(k==='stop'?c.pnlStop:c.pnlTp)])+(v>=99?' '+_t('{0} est le plafond : une part ne peut pas valoir plus.',[F.c(99)]):'');}
/* C16 : tant que rien n'est saisi, un simple rappel ; l'avertissement n'apparaît que si on valide sans seuil */
const guardSumH=(c,d)=>!c.err?'':c.none&&!d.tried?`<p class="note gd-n">${_t('Indique au moins un seuil, stop loss ou take profit, pour activer la protection.')}</p>`:`<p class="note warn">${c.err}</p>`;
function guardModalH(d){const c=guardCalc(d),m=c.m,p=c.p;
 const row=(k,lab,hint,chips)=>`<div class="cpf"><span class="cpl">${lab}</span><label class="amt lpw"><input data-gd="${k}" inputmode="numeric" value="${esc(d[k])}" placeholder="—" aria-label="${lab}"><span>¢</span></label><div class="presets gpre">${chips.map(o=>`<button type="button" class="btn b-ghost sm gp${String(d[k])===String(o.v)?' on':''}" data-a="guard-set" data-k="${k}" data-v="${o.v}" aria-label="${esc(plain(_t('{0} : seuil à {1}, {2} sur ta position',[o.l,F.c(o.v)+(o.cap?' '+o.cap:''),fmtPct(o.r)])))}"><b>${o.l}</b><small><span>${F.c(o.v)}${o.cap?' '+o.cap:''}</span><span class="${o.r>=0?'pl-up':'pl-dn'}">${fmtPct(o.r)}</span></small></button>`).join('')}<button type="button" class="btn b-ghost sm gp0" data-a="guard-set" data-k="${k}" data-v="">${_t("Aucun")}</button></div><span class="sub" data-ghint="${k}">${hint}</span></div>`;
 return `<div class="md cpm"><div class="md-h"><div><p>${_t("Protéger ma position {0}",[sideTxt(d.s)])}</p><h3>${esc(m.short)}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <div class="cp-kpis"><div><small>${_t("Parts")}</small><b class="num">${F.d1(p.sh)}</b></div><div><small>${_t("Prix moyen")}</small><b class="num">${F.c1(p.avg)}</b></div><div><small>${_t("Prix actuel")}</small><b class="num">${F.c(c.px)}</b></div></div>
 <p class="sub gp-cap">${_t("Sous chaque raccourci : le prix du seuil, puis le résultat sur ta position par rapport à ton prix moyen ({0}).",[F.c1(p.avg)])}</p>
 ${row('stop',_t("Stop loss : vendre si le prix tombe à"),guardHint(c,'stop'),[-.1,-.2,-.3].map(x=>guardPre(c,x)))}
 ${row('tp',_t("Take profit : vendre si le prix monte à"),guardHint(c,'tp'),[.2,.5,1].map(x=>guardPre(c,x)))}
 <div data-gsum>${guardSumH(c,d)}</div>
 <div class="cpm-acts"><button class="btn b-ink lg" data-a="guard-save" data-gsave${c.ok||c.none?'':' disabled'}>${_t("Activer la protection")}</button>${guardOf(d.m,d.s)?`<button class="btn b-ghost lg" data-a="guard-del">${_t("Retirer la protection")}</button>`:`<button class="btn b-ghost lg" data-a="close">${_t("Annuler")}</button>`}</div>
 <p class="note">${_t("Le déclenchement vend au marché, au prix disponible à ce moment-là : en cas de mouvement brutal, le prix de vente peut différer du seuil.")}</p></div>`;}
function guardOpen(mid,s){const p=posOf(mid,s);if(p.sh<=ORD.MINSH)return;const g=guardOf(mid,s);S.ui.guard={m:mid,s,stop:g&&g.stop?String(g.stop):'',tp:g&&g.tp?String(g.tp):''};openModal(guardModalH(S.ui.guard),'wide');}
function guardSync(){const d=S.ui.guard;if(!d)return;const c=guardCalc(d),s=$('[data-gsum]'),b=$('[data-gsave]');if(s){s.innerHTML=guardSumH(c,d);fixText(s);}if(b)b.disabled=!c.ok&&!c.none;
 $$('[data-ghint]').forEach(h=>{h.textContent=guardHint(c,h.dataset.ghint);fixText(h);});
 $$('.gpre .gp').forEach(x=>x.classList.toggle('on',String(d[x.dataset.k])===x.dataset.v));}
document.addEventListener('input',e=>{const el=e.target,d=el.dataset||{};
 if(d.tlp!==undefined){const st=tState(d.tlp);st.lp=el.value.replace(/[^\d]/g,'').slice(0,2);updTicket(d.tlp);return;}
 if(d.gd!==undefined&&S.ui.guard){S.ui.guard[d.gd]=el.value.replace(/[^\d]/g,'').slice(0,2);guardSync();}});

/* ---------- Affichage des ordres ---------- */
function ordRowH(o,full){const m=MK[o.m];if(!m)return '';const pct=o.k==='buy'?(o.init>0?(1-o.cash/o.init)*100:0):(o.init>0?(1-o.sh/o.init)*100:0);
 const what=o.k==='buy'?`${_t("{0} sur {1} à {2} max",[F.usd(o.init),sideTxt(o.s),F.c(o.lp)])}`:`${_t("{0} parts {1} à {2} min",[F.d1(o.init),sideTxt(o.s),F.c(o.lp)])}`;
 const st=o.status==='open'?(pct>0?`${_t("Exécuté à {0} %",[Math.round(pct)])}`:_t("En attente")):o.status==='filled'?_t("Exécuté"):_t("Annulé");
 return `<div class="ord-row ${o.status}"><div class="ord-main">${full?`<a class="nm" href="#marche-${m.id}">${esc(m.short)}</a>`:''}<span class="sub">${what}</span><span class="ord-bar"><i style="width:${Math.round(pct)}%"></i></span><small>${st}${o.sh&&o.k==='buy'?`${_t(", {0} parts obtenues",[F.d1(o.sh)])}`:''}${o.k==='sell'&&o.pro?`${_t(", {0} encaissés",[F.usd(o.pro)])}`:''} · ${ago(o.at)}</small></div>${o.status==='open'?`<button class="btn b-ghost sm" data-a="ord-cancel" data-id="${o.id}">${_t("Annuler")}</button>`:''}</div>`;}
function ordersBoxH(m){const L=ordersOpen(m.id);return `<section class="pn pad" data-ordbox="${m.id}"${L.length?'':' hidden'}><div class="h2">${_t("Tes ordres en attente")}</div><div class="sub">${_t("Réservé : {0}",[F.usd(L.filter(o=>o.k==='buy').reduce((a,o)=>a+o.cash,0))])}</div>${L.map(o=>ordRowH(o,false)).join('')}</section>`;}
function ordersTableH(){const L=ordersOpen(),D=ordersDone().slice(0,6);if(!L.length&&!D.length)return '';
 return `<div class="ords"><div class="ph" style="padding:14px 20px 4px"><div><div class="h2" style="font-size:15px">${_t("Ordres limite")}</div><div class="sub">${L.length?`${_t("{0} en attente, {1} réservés sur ton solde",[L.length,F.usd(reservedCash())])}`:_t("Aucun ordre en attente")}</div></div></div><div style="padding:0 20px 12px">${L.map(o=>ordRowH(o,true)).join('')}${D.length?`<details class="ord-old"><summary>${_t("Ordres terminés ({0})",[D.length])}</summary>${D.map(o=>ordRowH(o,true)).join('')}</details>`:''}</div></div>`;}
function ordersRefresh(){$$('[data-ordbox]').forEach(el=>{const m=MK[el.dataset.ordbox];if(!m)return;el.outerHTML=ordersBoxH(m);const n=$(`[data-ordbox="${m.id}"]`);if(n)fixText(n);});
 if(S.ui.route==='profil'&&S.ui.ptab==='positions'){const pt=$('[data-ptab-body]');if(pt){pt.innerHTML=ptabH('positions');fixText(pt);}}
 const pb=$('[data-posbox]');if(pb&&MK[pb.dataset.posbox]){pb.outerHTML=posBoxH(MK[pb.dataset.posbox]);const n=$('[data-posbox]');if(n)fixText(n);}}

Object.assign(ACT,{
 otype:a=>{const ctx=a.dataset.ctx,st=tState(ctx);st.otype=a.dataset.v;if(st.otype==='limit'&&!st.lp)st.lp=lpDefault(st);const box=$(`[data-ticket="${ctx}"]`);if(box){box.innerHTML=ticketInner(ctx);fixText(box);}},
 lpset:a=>{const ctx=a.dataset.ctx,st=tState(ctx);st.lp=a.dataset.v;const i=$(`[data-tlp="${ctx}"]`);if(i)i.value=st.lp;updTicket(ctx);},
 lpstep:a=>{const ctx=a.dataset.ctx,st=tState(ctx);st.lp=String(clamp((numOf(st.lp)||0)+(+a.dataset.v),1,99));const i=$(`[data-tlp="${ctx}"]`);if(i)i.value=st.lp;updTicket(ctx);},
 'limit-place':(a,e)=>placeLimit(a.dataset.ctx,e),
 'ord-cancel':a=>cancelOrder(a.dataset.id),
 guard:a=>guardOpen(a.dataset.m,a.dataset.s),
 'guard-set':a=>{const d=S.ui.guard;if(!d)return;d[a.dataset.k]=a.dataset.v;const i=$(`[data-gd="${a.dataset.k}"]`);if(i)i.value=d[a.dataset.k];guardSync();},
 'guard-save':()=>{const d=S.ui.guard;if(!d)return;const c=guardCalc(d);if(!c.ok){if(c.none){d.tried=true;guardSync();const i=$('[data-gd="stop"]');if(i)i.focus();}return;}dropGuard(d.m,d.s);guardsAll().push({m:d.m,s:d.s,stop:c.stop||0,tp:c.tp||0,at:now()});S.ui.guard=null;closeModal();save();
  toast({icon:'shield',title:_t("Protection activée"),text:`${_t("{0}{1}{2} sur {3}.",[c.stop?`${_t("Stop loss à {0}",[F.c(c.stop)])}`:'',c.stop&&c.tp?', ':'',c.tp?`${_t("take profit à {0}",[F.c(c.tp)])}`:'',c.m.short])}`,dur:3200});ordersRefresh();if(S.ui.route==='profil')render(false);},
 'guard-del':()=>{const d=S.ui.guard;if(!d)return;dropGuard(d.m,d.s);S.ui.guard=null;closeModal();save();toast({icon:'shield',title:_t("Protection retirée"),dur:2200});ordersRefresh();if(S.ui.route==='profil')render(false);}
});
{const live=fn=>()=>{if(!document.hidden)fn();};planifier('ordres : exécution locale',2000,live(ordersTick));}

