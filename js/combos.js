/* WIMORO — combos module */

'use strict';
/* =====================================================================================
 *  Paris combinés
 *  ------------------------------------------------------------------------------------
 *  Plusieurs sélections Oui/Non sur des marchés différents, une seule mise : la cote du
 *  combiné est le produit des cotes de chaque sélection (cote = 100 / prix en ¢).
 *  Toutes les sélections doivent gagner. Wimoro prend 5 % du gain brut (le « vert » du
 *  combiné), plafonne le gain, et propose un encaissement anticipé à la valeur du moment.
 *  - le « slip » (S.me.slip) se remplit depuis le ticket de n'importe quel marché classique
 *    (bouton « Ajouter au combiné »), y compris les issues des marchés à cotes multiples ;
 *  - la barre en bas de l'écran rappelle le combiné en cours ; la fenêtre règle la mise ;
 *  - #combines : combinés en cours (valeur du moment, encaisser) et terminés.
 * ===================================================================================== */
const COMBO={MIN_LEGS:2,MAX_LEGS:6,MIN:2,MAX:1000,FEE:.05,MAX_PAY:50000,CASH_FEE:.05};
const slip=()=>S.me.slip||(S.me.slip={legs:[],stake:10});
const combosAll=()=>S.me.combos||(S.me.combos=[]);
const comboOf=id=>combosAll().find(c=>c.id===id)||null;
const legPrice=(m,s)=>s==='oui'?m.p:100-m.p;
const legMult=(m,s)=>100/Math.max(1,legPrice(m,s));
const cbSide=s=>s==='oui'?_t('Oui'):_t('Non');
const slipKey=m=>m.parent||m.id;
/* raison pour laquelle une sélection ne peut pas rejoindre le combiné ('' = possible) */
function slipCan(m){const L=slip().legs;if(!m||!MK[m.id])return _t("Marché introuvable.");if(L.length>=COMBO.MAX_LEGS)return `${_t("{0} sélections maximum par combiné.",[COMBO.MAX_LEGS])}`;
 if(L.some(l=>l.m===m.id))return _t("Ce marché est déjà dans ton combiné.");if(m.parent&&L.some(l=>MK[l.m]&&slipKey(MK[l.m])===slipKey(m)))return _t("Une seule issue par marché à cotes multiples.");return '';}
function slipAdd(mid,s){const m=MK[mid];const why=slipCan(m);if(why){toast({tone:'amber',icon:'info',title:_t("Impossible d’ajouter au combiné"),text:why});return false;}
 slip().legs.push({m:mid,s});save();slipBar();const n=slip().legs.length;
 toast({tone:'blue',icon:'layers',force:true,title:_t("Ajouté au combiné"),text:`${m.short} · ${_t('{0} à {1}',[cbSide(s),F.c(legPrice(m,s))])}. ${n===1?_t("Ajoute au moins une autre sélection."):`${_t("{0} sélections, cote ×{1}.",[n,F.d2(slipCalc().mult)])}`}`,dur:2600});return true;}
function slipRemove(mid){slip().legs=slip().legs.filter(l=>l.m!==mid);save();slipBar();comboModalRefresh();}
function slipClear(){slip().legs=[];save();slipBar();}
/* calcul du combiné en cours */
function slipCalc(){const L=slip().legs.map(l=>({m:l.m,s:l.s,mk:MK[l.m]})).filter(l=>l.mk);let mult=1,prob=1;for(const l of L){mult*=legMult(l.mk,l.s);prob*=legPrice(l.mk,l.s)/100;}
 const stake=clamp(F.parse(slip().stake)||0,0,COMBO.MAX),gross=stake*mult,fee=gross*COMBO.FEE;let pay=gross-fee;const capped=pay>COMBO.MAX_PAY;if(capped)pay=COMBO.MAX_PAY;
 const insuf=stake>S.me.balance;return {L,mult,prob,stake,gross,fee,pay,capped,insuf,ok:L.length>=COMBO.MIN_LEGS&&stake>=COMBO.MIN&&!insuf};}
/* valider : la mise est débitée, les prix sont bloqués sélection par sélection */
function comboPlace(){if(!S.me.logged){needLogin(_t("Connecte-toi pour valider un combiné."));return false;}if(typeof rgBlocked==='function'&&rgBlocked('bet'))return false;const c=slipCalc();
 if(c.L.length<COMBO.MIN_LEGS){toast({tone:'amber',icon:'info',title:_t("Combiné incomplet"),text:`${_t("Il faut au moins {0} sélections.",[COMBO.MIN_LEGS])}`});return false;}
 if(c.stake<COMBO.MIN){toast({tone:'amber',icon:'info',title:_t("Mise trop petite"),text:`${_t("Mise minimale : {0}",[F.usd0(COMBO.MIN)])}`});return false;}
 if(c.insuf){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return false;}
 if(SRV()){srvComboValider(c);return false;}                   /* mode Compte : prix bloqués et mise prise par le serveur */
 const before=myRank();S.me.balance-=c.stake;const cb={id:'cb'+now().toString(36)+Math.floor(R()*1e3).toString(36),at:now(),stake:c.stake,mult:c.mult,fee:c.fee,pay:c.pay,status:'open',legs:c.L.map(l=>({m:l.m,s:l.s,price:legPrice(l.mk,l.s),mult:legMult(l.mk,l.s),res:null}))};
 combosAll().unshift(cb);S.me.played++;S.me.cbPlayed=(S.me.cbPlayed||0)+1;slip().legs=[];gainXP(10+5*cb.legs.length);if(typeof clanRecordBet==='function')clanRecordBet(null,c.stake);updateHeader();save();slipBar();closeModal();checkRank(before);
 toast({tone:'green',icon:'layers',force:true,title:`${_t("Combiné validé : {0} à ×{1}",[F.usd(cb.stake),F.d2(cb.mult)])}`,text:`${_t("{0} sélections. Gain si tout passe : {1}. Tu peux encaisser à tout moment avant la clôture.",[cb.legs.length,F.usd(cb.pay)])}`,href:'#combines'});
 if((S.ui.route||'')==='combines')render(false);return cb;}
/* valeur du moment : gain promis × probabilité implicite actuelle, moins les frais d'encaissement */
function comboValue(cb){if(cb.status!=='open')return 0;let p=1;for(const l of cb.legs){const m=MK[l.m];if(!m)return 0;if(l.res==='lost')return 0;if(l.res!=='won')p*=legPrice(m,l.s)/100;}return cb.pay*p*(1-COMBO.CASH_FEE);}
function comboCash(id){const cb=comboOf(id);if(!cb||cb.status!=='open')return false;const v=comboValue(cb);if(v<=0)return false;if(SRV()){srvComboEncaisser(cb);return false;}const before=myRank();cb.status='cashed';cb.cash=v;cb.endAt=now();S.me.balance+=v;S.me.settled++;const pnl=v-cb.stake;if(pnl>=0)S.me.wins++;S.me.realized+=pnl;
 S.me.history.unshift({k:'combo',q:`${_t("Combiné {0} sélections, encaissé à {1}",[cb.legs.length,F.usd(v)])}`,s:'oui',win:pnl>=0,pnl,at:now()});gainXP(10);updateHeader();save();checkRank(before);checkBadges();
 toast({tone:pnl>=0?'green':'amber',icon:'wallet',force:true,title:`${_t("Encaissé : {0}",[F.usd(v)])}`,text:`${_t("{0}{1} par rapport à ta mise de {2}.",[pnl>=0?'+':'−',F.usd(Math.abs(pnl)),F.usd(cb.stake)])}`});if((S.ui.route||'')==='combines')render(false);return true;}
/* règlement d'un marché : toute sélection perdante fait tomber le combiné, toutes gagnantes = payé */
function comboOnResolve(mid,outcome){for(const cb of combosAll()){if(cb.status!=='open')continue;const l=cb.legs.find(x=>x.m===mid);if(!l||l.res)continue;l.res=l.s===outcome?'won':'lost';
 if(l.res==='lost'){cb.status='lost';cb.endAt=now();S.me.settled++;S.me.realized-=cb.stake;S.me.history.unshift({k:'combo',q:`${_t("Combiné {0} sélections : perdu sur {1}",[cb.legs.length,MK[mid]?MK[mid].short:mid])}`,s:'non',win:false,pnl:-cb.stake,at:now()});}
 else if(cb.legs.every(x=>x.res==='won')){cb.status='won';cb.endAt=now();S.me.balance+=cb.pay;S.me.settled++;S.me.wins++;S.me.realized+=cb.pay-cb.stake;S.me.history.unshift({k:'combo',q:`${_t("Combiné {0} sélections gagné à ×{1}",[cb.legs.length,F.d2(cb.mult)])}`,s:'oui',win:true,pnl:cb.pay-cb.stake,at:now()});toast({tone:'green',icon:'trophy',force:true,title:`${_t("Combiné gagné : +{0}",[F.usd(cb.pay-cb.stake)])}`,text:`${_t("{0} sur {0}, ×{1}.",[cb.legs.length,F.d2(cb.mult)])}`,href:'#combines'});confetti(50);}}
 save();}

/* ---------- Barre en bas de l'écran ---------- */
function slipBar(){let b=$('#slipbar');const L=slip().legs.filter(l=>MK[l.m]);if(!L.length||!S.me.logged||/^(connexion|inscription|bienvenue)/.test(S.ui.route||'')){if(b)b.remove();document.body.classList.remove('has-slip');return;}document.body.classList.add('has-slip');
 if(!b){b=document.createElement('div');b.id='slipbar';b.className='slipbar';document.body.appendChild(b);}const c=slipCalc();
 b.innerHTML=`<button class="sb-main" data-a="cb-open">${ic('layers',16)}<span>${_t("<b>Combiné ×{0}</b>",[F.d2(c.mult)])}<small>${_t('{0} sélection{1}',[L.length,L.length>1?'s':''])}</small></span></button><button class="btn b-ink sm" data-a="cb-open">${L.length<COMBO.MIN_LEGS?_t("Compléter"):_t("Miser")}</button><button class="sb-x" data-a="cb-clear" aria-label="${_t('Vider le combiné')}">${ic('x',16)}</button>`;fixText(b);}
/* ---------- Fenêtre du combiné ---------- */
function comboLegH(l,rm){const m=l.mk||MK[l.m];if(!m)return '';const pr=l.price||legPrice(m,l.s),mu=l.mult||legMult(m,l.s);
 return `<div class="cb-leg"><div class="cb-lt"><a href="#marche-${m.id}" data-a="close">${esc(m.short)}</a><small>${esc(m.q)}</small></div><span class="cb-side ${l.s}">${cbSide(l.s)} <b class="num">${F.c(pr)}</b></span><b class="num cb-mult">×${F.d2(mu)}</b>${rm?`<button class="x" data-a="cb-rm" data-m="${m.id}" aria-label="${_t('Retirer')}">${ic('x',14)}</button>`:''}</div>`;}
function comboModalH(){const c=slipCalc(),st=slip();
 if(!c.L.length)return `<div class="md"><div class="md-h"><div><h3>${_t("Pari combiné")}</h3><p>${_t("Plusieurs sélections, une seule mise, les cotes se multiplient.")}</p></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div><div class="empty" style="padding:24px 0">${_t("Ton combiné est vide. Ouvre un marché, choisis Oui ou Non, puis « Ajouter au combiné ».")}</div><div class="hbtns"><a class="btn b-ink full" href="#accueil" data-a="close">${_t("Voir les marchés")}</a><a class="btn b-white full" href="#combines" data-a="close">${_t("Mes combinés")}</a></div></div>`;
 return `<div class="md"><div class="md-h"><div><h3>${_t("Pari combiné")}</h3><p>${_t("{0} · toutes doivent gagner",[_t('{0} sélection{1}',[c.L.length,c.L.length>1?'s':''])])}</p></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <div class="cb-legs">${c.L.map(l=>comboLegH(l,true)).join('')}</div>
 ${c.L.length<COMBO.MAX_LEGS?`<a class="link t-2" href="#accueil" data-a="close">${_t("{0} Ajouter une sélection depuis un marché",[ic('plus',13)])}</a>`:''}
 <div class="cpf mt-4"><span class="cpl">${_t("Ta mise")}</span><div class="presets">${[5,10,25,50,100].map(v=>`<button type="button" class="btn b-ghost sm${+st.stake===v?' on':''}" data-a="cb-stake" data-v="${v}">${F.usd0(v)}</button>`).join('')}</div></div>
 <div class="field"><input class="amt" data-cb="stake" inputmode="decimal" value="${esc(String(st.stake))}" aria-label="${_t('Ta mise')}"></div>
 <div class="calc" data-cb="calc">${comboCalcH(c)}</div>
 ${c.insuf?`<a class="btn b-ink lg full" href="#depot" data-a="close">${_t("Solde insuffisant : déposer des fonds")}</a>`:`<button class="btn b-pri lg full" data-a="cb-place"${c.ok?'':' disabled'} data-cb="btn">${_t("{0} Valider le combiné pour {1}",[ic('layers',16,'#fff'),F.usd(c.stake)])}</button>`}
 <p class="note">${_t("Les prix de chaque sélection sont bloqués à la validation. Wimoro prend {0} du gain brut, gain plafonné à {1}. Encaissement anticipé possible à tout moment à la valeur du moment, moins {2}.",[F.pct(COMBO.FEE*100),F.usd0(COMBO.MAX_PAY),F.pct(COMBO.CASH_FEE*100)])}</p>
 <a class="link t-2 ta-c d-block" href="#combines" data-a="close">${_t("Mes combinés")}</a></div>`;}
function comboCalcH(c){return `<div class="line"><span>${_t("Cote combinée")}</span><b class="num">×${F.d2(c.mult)}</b></div><div class="line"><span>${_t("Probabilité implicite")}</span><b class="num">${F.pct1(c.prob)}</b></div><div class="line"><span>${_t("Frais Wimoro ({0} du gain)",[F.pct(COMBO.FEE*100)])}</span><b class="num">${F.usd(c.fee)}</b></div><div class="line gain"><span>${_t("Gain si tout passe")}</span><b class="num">${F.usd(c.pay)}</b></div>${c.capped?`<div class="tnotes"><span class="tn warn">${_t("{0} Gain plafonné à {1} par combiné.",[ic('info',12),F.usd0(COMBO.MAX_PAY)])}</span></div>`:''}${c.L.length<COMBO.MIN_LEGS?`<div class="tnotes"><span class="tn">${_t("{0} Ajoute au moins {1} sélections.",[ic('info',12),COMBO.MIN_LEGS])}</span></div>`:''}`;}
function comboModalOpen(){openModal(comboModalH(),'wide');}
function comboModalRefresh(){const box=$('.ov .md');if(!box||!$('[data-cb="calc"]',box))return;const c=slipCalc();const calc=$('[data-cb="calc"]',box);calc.innerHTML=comboCalcH(c);fixText(calc);const b=$('[data-cb="btn"]',box);if(b){b.disabled=!c.ok;b.innerHTML=`${ic('layers',16,'#fff')} ${_t('Valider le combiné pour {0}',[F.usd(c.stake)])}`;}
 $$('[data-a="cb-stake"]',box).forEach(x=>x.classList.toggle('on',+x.dataset.v===+slip().stake));if(!c.L.length||$$('.cb-leg',box).length!==c.L.length){box.outerHTML=comboModalH();fixText($('.ov .md'));}}

/* ---------- Page Mes combinés ---------- */
function comboCardH(cb){const open=cb.status==='open',v=open?comboValue(cb):0,won=cb.status==='won',st=open?_t("En cours"):won?_t("Gagné"):cb.status==='cashed'?_t("Encaissé"):_t("Perdu");
 const legs=cb.legs.map(l=>{const m=MK[l.m];if(!m)return '';const cur=legPrice(m,l.s),d=cur-l.price,res=l.res||(open?'':cb.status);return `<div class="cb-leg sm"><div class="cb-lt"><a href="#marche-${m.id}">${esc(m.short)}</a><small>${cbSide(l.s)} ${_t('à {0}',[F.c(l.price)])} · ×${F.d2(l.mult)}</small></div>${open?`<span class="cb-cur ${d>=0?'up':'dn'}" data-cbcur="${m.id}">${F.c(cur)} <small>${bidi((d>=0?'+':'−')+F.int(Math.abs(d)))}</small></span>`:`<span class="cb-res ${res==='won'?'ok':res==='lost'?'ko':''}">${res==='won'?_t('Gagnée'):res==='lost'?_t('Perdue'):'—'}</span>`}</div>`;}).join('');
 return `<div class="cbcard ${cb.status}"><div class="cb-h"><div><span class="bztag ${open?'onair':''}">${open?`<i class="live"></i> `:''}${st}</span><b>${_t('{0} sélection{1}',[cb.legs.length,cb.legs.length>1?'s':''])} · ×${F.d2(cb.mult)}</b><small>${_t("{0} · mise {1}",[fmtDT(cb.at),F.usd(cb.stake)])}</small></div><div class="cb-pay"><small>${open?_t("Gain net si tout passe"):won?_t("Gain"):cb.status==='cashed'?_t("Encaissé"):_t("Mise perdue")}</small><b class="num ${open?'':won||(cb.status==='cashed'&&cb.cash>=cb.stake)?'pl-up':'pl-dn'}">${open?F.usd(cb.pay):won?F.usd(cb.pay):cb.status==='cashed'?F.usd(cb.cash):'−'+F.usd(cb.stake)}</b></div></div>
 <div class="cb-legs">${legs}</div>
 ${open?`<div class="cb-cash"><div><small>${_t("Valeur du moment")}</small><b class="num ${v>=cb.stake?'pl-up':'pl-dn'}" data-cbval="${cb.id}">${F.usd(v)}</b></div><button class="btn b-ink" data-a="cb-cash" data-id="${cb.id}"${v>0?'':' disabled'}>${_t("{0} Encaisser {1}",[ic('wallet',16,'#fff'),F.usd(v)])}</button></div>`:''}</div>`;}
function vCombos(){if(!S.me.logged){S.ui.after='#combines';location.hash='#connexion';return '';}const all=combosAll(),open=all.filter(c=>c.status==='open'),done=all.filter(c=>c.status!=='open'),tab=S.ui.cbtab||'cours',L=tab==='cours'?open:done,sc=slipCalc();
 return `<div class="wrap"><div class="pagehead"><div><h1 class="ptitle">${_t("Mes combinés")}</h1><p class="plead">${_t("Plusieurs sélections Oui/Non sur des marchés différents, une seule mise : les cotes se multiplient. Toutes doivent gagner, et tu peux encaisser avant la fin.")}</p></div><div class="hbtns"><button class="btn b-pri" data-a="cb-open">${ic('layers',16,'#fff')} ${sc.L.length?_t('Combiné en cours ({0})',[sc.L.length]):_t("Nouveau combiné")}</button></div></div>
 <div class="g-side"><div class="col"><div class="tabs utabs"><button class="${tab==='cours'?'on':''}" data-a="cb-tab" data-v="cours">${_t("En cours{0}",[open.length?` (${open.length})`:''])}</button><button class="${tab==='fini'?'on':''}" data-a="cb-tab" data-v="fini">${_t("Terminés{0}",[done.length?` (${done.length})`:''])}</button></div>
 ${L.length?L.map(comboCardH).join(''):`<section class="pn pad"><div class="empty" style="padding:28px 0">${tab==='cours'?_t("Aucun combiné en cours. Ouvre un marché, choisis Oui ou Non, puis « Ajouter au combiné »."):_t("Aucun combiné terminé pour l’instant.")}${tab==='cours'?`<div class="emp-a"><a class="btn b-white sm" href="#accueil">${_t("Voir les marchés")}</a></div>`:''}</div></section>`}</div>
 <aside class="col"><section class="pn pad"><div class="h2 mb-3">${_t("Comment ça marche")}</div><ol class="steps"><li>${_t("Sur un marché, choisis Oui ou Non et touche « Ajouter au combiné » dans le ticket. {0} à {1} sélections, une seule par marché.",[COMBO.MIN_LEGS,COMBO.MAX_LEGS])}</li><li>${_t("La cote du combiné est le produit des cotes : trois sélections à ×2 donnent ×8.")}</li><li>${_t("Une seule mise, prix bloqués à la validation. Toutes les sélections doivent gagner. Wimoro prend {0} du gain brut, plafonné à {1}.",[F.pct(COMBO.FEE*100),F.usd0(COMBO.MAX_PAY)])}</li><li>${_t("Avant la clôture, tu peux encaisser à la valeur du moment (gain promis × probabilité actuelle), moins {0}.",[F.pct(COMBO.CASH_FEE*100)])}</li></ol></section>
 <section class="pn pad"><div class="h2">${_t("Mise et limites")}</div><p class="sub mt-2">${_t("De {0} à {1} par combiné. Les limites de jeu responsable s’appliquent comme pour n’importe quel pari.",[F.usd0(COMBO.MIN),F.usd0(COMBO.MAX)])}</p></section></aside></div></div>`;}
VIEWS.combines=vCombos;PROTECTED.add('combines');TITLES.combines=_t("Mes combinés");
/* valeurs du moment rafraîchies avec les prix */
{const upd0=updateMarket;updateMarket=function(m,old,noGroup){upd0(m,old,noGroup);if((S.ui.route||'')!=='combines')return;for(const cb of combosAll()){if(cb.status!=='open'||!cb.legs.some(l=>l.m===m.id))continue;const e=$(`[data-cbval="${cb.id}"]`);if(e){const v=comboValue(cb);e.textContent=F.usd(v);e.className='num '+(v>=cb.stake?'pl-up':'pl-dn');const b=e.closest('.cb-cash')&&e.closest('.cb-cash').querySelector('[data-a="cb-cash"]');if(b)b.innerHTML=`${ic('wallet',16,'#fff')} ${_t('Encaisser {0}',[F.usd(v)])}`;}
 const l=cb.legs.find(x=>x.m===m.id),c=$(`[data-cbcur="${m.id}"]`);if(c&&l){const cur=legPrice(m,l.s),d=cur-l.price;c.innerHTML=`${F.c(cur)} <small>${bidi((d>=0?'+':'−')+F.int(Math.abs(d)))}</small>`;c.className='cb-cur '+(d>=0?'up':'dn');}}};}

/* ---------- Actions ---------- */
Object.assign(ACT,{
 'cb-add':a=>{if(!S.me.logged){needLogin(_t("Connecte-toi pour créer un combiné."));return;}if(slipAdd(a.dataset.m,a.dataset.s)&&a.dataset.ctx==='sheet')closeModal();},
 'cb-open':()=>comboModalOpen(),
 'cb-clear':()=>{slipClear();toast({icon:'check',force:true,title:_t("Combiné vidé"),dur:1400});},
 'cb-rm':a=>slipRemove(a.dataset.m),
 'cb-stake':a=>{slip().stake=+a.dataset.v;save();const i=$('.ov [data-cb="stake"]');if(i)i.value=String(slip().stake);comboModalRefresh();},
 'cb-place':()=>comboPlace(),
 'cb-cash':a=>comboCash(a.dataset.id),
 'cb-tab':a=>{S.ui.cbtab=a.dataset.v;render(false);}
});
document.addEventListener('input',e=>{const i=e.target.closest&&e.target.closest('[data-cb="stake"]');if(!i)return;slip().stake=i.value;comboModalRefresh();});
/* la barre suit la navigation */
{const render0=render;render=function(first){render0(first);slipBar();};}
/* démo : User26 a un combiné en cours et un encaissé */
function comboSeed(){if(!S.me.logged||S.me.n!=='User26'||S.me.comboSeeded)return;S.me.comboSeeded=true;const t=now();const mk=(legs,stake,at)=>{let mult=1;for(const l of legs)mult*=100/l.price;const gross=stake*mult,fee=gross*COMBO.FEE;return {id:'cbseed'+at.toString(36),at,stake,mult,fee,pay:Math.min(COMBO.MAX_PAY,gross-fee),status:'open',legs:legs.map(l=>({m:l.m,s:l.s,price:l.price,mult:100/l.price,res:null}))};};
 const pick2=[['btc150k','oui'],['clasico','non'],['eth6000','oui']].filter(([m])=>MK[m]).slice(0,3);if(pick2.length>=2){const open=mk(pick2.map(([m,s])=>({m,s,price:Math.max(3,Math.min(97,Math.round(legPrice(MK[m],s)+(s==='oui'?-4:3))))})),25,t-2*86400e3);combosAll().push(open);}
 const pk=[['neige-noel','oui'],['bce','non']].filter(([m])=>MK[m]);if(pk.length>=2){const c=mk(pk.map(([m,s])=>({m,s,price:Math.max(3,Math.min(97,Math.round(legPrice(MK[m],s)-6)))})),20,t-6*86400e3);c.status='cashed';c.cash=Math.round(c.stake*1.9*100)/100;c.endAt=t-86400e3;combosAll().push(c);S.me.history.push({k:'combo',q:`${_t("Combiné 2 sélections, encaissé à {0}",[F.usd(c.cash)])}`,s:'oui',win:true,pnl:c.cash-c.stake,at:c.endAt});}
 save();}

