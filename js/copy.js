/* WIMORO — copy module */

'use strict';
/* =====================================================================================
 *  Profil public ou privé + copie automatique des paris (copy trading)
 *  ------------------------------------------------------------------------------------
 *  - Chaque joueur choisit dans « Modifier le profil » si son profil est public ou privé.
 *    Un profil privé ne montre que le pseudo, le rang et la place au classement (les amis voient tout)
 *    et ne peut pas être copié.
 *  - Copier un joueur : budget, mise fixe ou proportionnelle (x % de sa mise), catégories choisies,
 *    arrêt de perte. Chaque nouveau pari du joueur est reproduit par le même carnet d'ordres que
 *    tes propres paris (prix, impact, frais), et chaque vente est reproduite aussi.
 *  - Le joueur copié touche COPY.SHARE (20 %) des frais payés par ses copieurs, pris sur la part de
 *    Wimoro : aucun surcoût pour le copieur.
 *  - Débloqué au rang Or (voir FEATURES.copy), comme la création de paris.
 * ===================================================================================== */
const COPY={MIN_BETS:10,MIN_BUDGET:50,MIN_PER:5,MAX_ACTIVE:10,SHARE:.20,PCT:[5,10,25,50,100]};
const numIn=v=>F.parse(v);

/* ---------- Visibilité du profil ---------- */
const mePrefs=()=>Object.assign({},PREF_DEF,S.me.prefs||{});
const mePublic=()=>!!mePrefs().public;
const meCopyOk=()=>{const p=mePrefs();return !!(p.public&&p.copyok);};
const uPub=u=>u==='me'?mePublic():!!USERS[u]&&USERS[u].pub!==0;
const canSeeProfile=u=>uPub(u)||friendsOf().includes(u);
/* Un joueur est copiable s'il est public, autorise la copie et a un historique suffisant. */
function copyElig(u){const U=USERS[u];if(!U)return {ok:false,why:'none'};if(!uPub(u))return {ok:false,why:'private'};if(U.cp===0)return {ok:false,why:'off'};if(U.bets<COPY.MIN_BETS)return {ok:false,why:'few'};return {ok:true};}
const accLabel=a=>a>=65?[_t("Élevée"),'hi']:a>=58?[_t("Bonne"),'ok']:a>=52?[_t("Moyenne"),'mid']:[_t("Faible"),'lo'];
const gateName=()=>TIERS[GATES.copy.t].name;
/* Nombre de copieurs d'un joueur simulé (stable) et ce que la copie lui a rapporté. */
const copiersOf=u=>{const U=USERS[u];if(!U||!copyElig(u).ok)return 0;return 3+(hash('cp'+u)%30)+(U.acc>=65?25:U.acc>=58?8:0);};
const sharePct=()=>Math.round(COPY.SHARE*100);

function visMetaH(){const pub=mePublic(),n=S.me.copiers||0,e=S.me.copyEarn||0;return `<span class="vis-chip ${pub?'pub':'priv'}">${_t("{0} Profil {1}",[ic(pub?'eye':'lock',12),pub?_t("public"):_t("privé")])}</span>${meCopyOk()&&n?`<span>${_t("{0} copieur{1}{2}",[F.int(n),n>1?'s':'',e>=.005?` · <b class="pl-up">+${F.usd(e)}</b>`:''])}</span>`:''}`;}

/* ---------- Réglage dans Modifier le profil ---------- */
function privSectionH(){const p=S.ui.pe.prefs,pub=!!p.public;
 const row=(k,t,s2,dis)=>`<label class="tgl${dis?' dis':''}"><span class="tx"><b>${t}</b><small>${s2}</small></span><input type="checkbox" data-pe-pref="${k}"${p[k]&&!dis?' checked':''}${dis?' disabled':''}><span class="sl" aria-hidden="true"></span></label>`;
 const card=(on,k,icn,t,d)=>`<button type="button" role="radio" aria-checked="${on}" class="vc${on?' on':''}" data-a="pe-vis" data-v="${k}"><span class="vh">${ic(icn,18)}<b>${t}</b><i class="vr" aria-hidden="true"></i></span><small>${d}</small></button>`;
 return `<section class="pn pad step" data-pepriv><div class="step-h"><h3>${_t("Confidentialité")}</h3></div>
 <div class="vis" role="radiogroup" aria-label="${_t("Visibilité du profil")}">${card(pub,'pub','eye',_t("Profil public"),_t("Tout le monde voit ta précision, tes stats et ton historique. Tu peux autoriser la copie de tes paris."))}${card(!pub,'priv','lock',_t("Profil privé"),_t("Seuls ton pseudo, ton rang et ta place au classement restent visibles. Tes amis voient tout. Personne ne peut te copier."))}</div>
 <div class="tgls">${row('showpos',_t("Afficher mes positions"),_t("Les autres joueurs voient tes positions ouvertes."),!pub)}${row('copyok',_t("Autoriser la copie de mes paris"),`${_t("Les joueurs de rang {0} ou plus peuvent reproduire automatiquement chacun de tes nouveaux paris. Tu touches {1} % des frais qu’ils paient sur ces paris.",[gateName(),sharePct()])}`,!pub)}${row('dms',_t("Messages privés de tous"),_t("Les joueurs que tu ne suis pas peuvent t’écrire."),false)}</div>
 ${pub?'':`<p class="vis-note">${_t("{0} Un profil privé arrête aussi les copies de tes paris en cours.",[ic('info',14)])}</p>`}</section>`;}

/* Après l'enregistrement : passer en privé met fin aux copies dont on est la cible. */
{const base=FORMS.profile;FORMS.profile=function(...a){const wasPub=mePublic(),n=S.me.copiers||0;const r=base.apply(this,a);
 if(wasPub&&!mePublic()&&n){S.me.copiers=0;save();toast({icon:'lock',title:_t("Profil privé"),text:`${_t("{0} joueur{1} de te copier.",[F.int(n),n>1?_t("s ont arrêté"):_t(" a arrêté")])}`});}return r;};}

/* ---------- Données de copie ---------- */
const copiesAll=()=>S.me.copies||(S.me.copies=[]);
const copiesLive=()=>copiesAll().filter(c=>c.status!=='stopped');
const copyOf=u=>copiesLive().find(c=>c.u===u);
const cOpen=c=>c.holds.reduce((a,h)=>a+h.cost,0);
function cUnreal(c){let v=0;for(const h of c.holds){const m=MK[h.m];if(!m)continue;const pr=h.s==='oui'?m.p:100-m.p;v+=h.sh*pr/100-h.cost;}return v;}
const cPnl=c=>c.status==='stopped'?c.endPnl:c.realized+cUnreal(c);
const cFree=c=>Math.max(0,c.budget+c.realized-cOpen(c));
const logC=(c,e)=>{e.at=now();c.log.unshift(e);c.log=c.log.slice(0,30);};
function copyTagH(p){for(const c of copiesLive()){if(c.holds.some(h=>h.m===p.m&&h.s===p.s))return ` <span class="cptag">${ic('copy',10)} ${esc(USERS[c.u].n)}</span>`;}return '';}
const copyCats=()=>[...new Set(MARKETS.map(m=>m.cat))];
const cModeTxt=c=>c.mode==='prop'?`${_t("{0} % de sa mise{1}",[c.pct,c.cap?`${_t(", {0} max",[F.usd0(c.cap)])}`:''])}`:`${_t("{0} par pari",[F.usd(c.per)])}`;
const cCatsTxt=c=>!c.cats||!c.cats.length?_t("Toutes les catégories"):c.cats.map(x=>_t(x)).join(', ');
/* Montant copié pour une mise du joueur copié. */
function copyAmt(c,traderAmt){if(c.mode!=='prop')return c.per;let a=(traderAmt||0)*c.pct/100;if(c.cap)a=Math.min(a,c.cap);return Math.max(0,a);}

/* ---------- Moteur : exécution d'un pari copié ---------- */
/* Même chemin que tes propres paris : prix moyen du carnet, impact sur le marché, frais d'entrée. */
function copyExec(c,m,s,traderAmt){
 if(c.cats&&c.cats.length&&!c.cats.includes(m.cat))return {ok:false,why:'cat'};
 let amt=copyAmt(c,traderAmt);
 if(c.mode==='prop')amt=Math.min(amt,cFree(c));                  // proportionnel : on copie ce que le budget permet encore
 if(amt<COPY.MIN_PER||cFree(c)<amt-1e-9)return {ok:false,why:'budget'};
 if(S.me.balance<amt)return {ok:false,why:'balance'};
 const q=quoteBuy(m,s,amt,myRank().t>=5);
 if(!q.full||q.sh<=0)return {ok:false,why:'liq'};
 S.me.balance-=amt;
 const p=S.me.positions.find(x=>x.m===m.id&&x.s===s);
 if(p){p.avg=(p.avg*p.sh+q.avg*q.sh)/(p.sh+q.sh);p.sh+=q.sh;}else S.me.positions.push({m:m.id,s,sh:q.sh,avg:q.avg});
 S.me.played++;S.me.maxBet=Math.max(S.me.maxBet||0,amt);S.me.realized-=q.fee;
 const old=m.p;applyBuy(m,q);m.anchor=clamp(m.anchor+q.impact*(s==='oui'?1:-1)*.7,5,95);m.people++;addBet(m,{s:s==='oui'?1:0,a:Math.min(1,amt/300),me:1});updateMarket(m,old);
 const h=c.holds.find(x=>x.m===m.id&&x.s===s);if(h){h.sh+=q.sh;h.cost+=q.a;}else c.holds.push({m:m.id,s,sh:q.sh,cost:q.a});
 const give=q.fee*COPY.SHARE;c.realized-=q.fee;c.n++;c.given=(c.given||0)+give;const U=USERS[c.u];if(U)U.earn=(U.earn||0)+give;
 return {ok:true,amt,q};
}
/* Le joueur copié place un pari : toutes les copies actives le reproduisent. */
function copyFire(u,m,s,traderAmt){
 if(!S.me.logged)return;let any=false;
 for(const c of copiesAll()){
  if(c.u!==u||c.status!=='active')continue;
  const U=USERS[u],side=s==='oui'?_t("Oui"):_t("Non"),r=copyExec(c,m,s,traderAmt);
  if(r.ok){any=true;logC(c,{k:'open',m:m.id,s,amt:r.amt});
   toast({tone:'blue',icon:'copy',title:`${_t("Copie de {0}",[U.n])}`,text:`${_t("{0} sur {1}, {2}",[F.usd(r.amt),side,m.short])}`,href:'#copie'});
   notif('copy',`${_t("Copie de {0} : {1} sur {2}, {3}.",[U.n,F.usd(r.amt),side,m.short])}`,'#copie');}
  else if(r.why==='budget'||r.why==='balance'){const k=r.why==='budget'?'dry':'dryB',t=r.why==='budget'?_t("Budget épuisé"):_t("Solde insuffisant");if(!c[k]){c[k]=1;logC(c,{k:'skip',m:m.id,s,why:r.why});notif('copy',`${_t("{0} sur la copie de {1} : ses nouveaux paris ne sont plus copiés.",[t,U.n])}`,'#copie');toast({tone:'amber',icon:'copy',title:F.kv(t,U.n),text:_t("Ses nouveaux paris ne sont plus copiés."),href:'#copie'});}}
  else if(r.why==='cat'){logC(c,{k:'skip',m:m.id,s,why:'cat'});}
  else{logC(c,{k:'skip',m:m.id,s,why:'liq'});}
 }
 if(any){updateHeader();checkBadges();copyGuard();save();copyRefresh();}
}
/* Vend (en tout ou partie) un lot copié ; renvoie le résultat net du lot. */
function copySell(c,h){
 const m=MK[h.m],U=USERS[c.u],p=S.me.positions.find(x=>x.m===h.m&&x.s===h.s),sh=Math.min(h.sh,p?p.sh:0);
 let pnl;
 if(sh>1e-6){
  const q=quoteSell(m,h.s,sh),sold=q.sh;
  if(sold<=1e-9)return 0;
  const cost=h.cost*(sold/h.sh);pnl=q.pro-cost;
  p.sh-=sold;S.me.balance+=q.pro;S.me.realized+=q.pro-sold*p.avg/100;
  if(p.sh<.05){S.me.positions=S.me.positions.filter(x=>x!==p);if(typeof dropGuard==='function')dropGuard(h.m,h.s);}
  S.me.history.unshift({k:'sell',m:m.id,q:m.q,s:h.s,win:pnl>=0,pnl,at:now(),via:'copy',of:U.n});
  const old=m.p;applySell(m,q);addBet(m,{s:h.s==='oui'?0:1,a:Math.min(1,q.pro/300),me:1});updateMarket(m,old);
  h.sh-=sold;h.cost-=cost;c.realized+=pnl;
  if(h.sh<.05)c.holds=c.holds.filter(x=>x!==h);
 }else{ // déjà vendu à la main : on le sort de la copie au prix du marché
  const pr=h.s==='oui'?m.p:100-m.p;pnl=h.sh*pr/100-h.cost;c.realized+=pnl;c.holds=c.holds.filter(x=>x!==h);
 }
 return pnl;
}
/* Le joueur copié vend : les copies actives qui détiennent ce lot le vendent aussi. */
function traderExit(u){
 const cs=copiesAll().filter(c=>c.u===u&&c.status==='active'&&c.holds.length);if(!cs.length)return;
 const c0=pick(cs),h0=pick(c0.holds),m=MK[h0.m],U=USERS[u],side=h0.s==='oui'?_t("Oui"):_t("Non");
 addMsg('m:'+m.id,mkMsg({k:'evt',text:`${_t("{0} a vendu ses parts {1}",[U.n,side])}`}));
 let any=false;
 for(const c of cs){const h=c.holds.find(x=>x.m===h0.m&&x.s===h0.s);if(!h)continue;const pnl=copySell(c,h);any=true;logC(c,{k:'exit',m:m.id,s:h0.s,pnl});
  toast({tone:pnl>=0?'green':'red',icon:'copy',title:`${_t("{0} a vendu, ta copie aussi",[U.n])}`,text:F.kv(m.short,F.signed(pnl)),href:'#copie'});
  notif('copy',`${_t("{0} a vendu ses parts {1} sur {2} : {3} sur ta copie.",[U.n,side,m.short,F.signed(pnl)])}`,'#copie');}
 if(any){updateHeader();copyGuard();save();copyRefresh();}
}
/* Arrêt de perte : si la perte de la copie atteint sa limite, elle s'arrête et vend ses positions. */
function copyGuard(){let hit=false;for(const c of copiesAll()){if(c.status==='stopped'||!c.stop)continue;if(c.realized+cUnreal(c)<=-c.budget*c.stop/100){copyStop(c,'stop',true);hit=true;}}return hit;}
function copyStop(c,why,close){
 if(c.status==='stopped')return;
 if(close)for(const h of c.holds.slice())copySell(c,h);
 c.endPnl=c.realized+cUnreal(c);c.kept=c.holds.length;c.holds=[];c.status='stopped';c.why=why;c.end=now();
 const U=USERS[c.u];
 if(why==='stop'){notif('copy',`${_t("Arrêt de perte atteint sur la copie de {0} : positions vendues, {1}.",[U.n,F.signed(c.endPnl)])}`,'#copie');toast({tone:'red',icon:'copy',title:`${_t("Arrêt de perte : {0}",[U.n])}`,text:`${_t("Copie arrêtée et positions vendues, {0}.",[F.signed(c.endPnl)])}`,href:'#copie',dur:6000});}
 updateHeader();save();copyRefresh();
}

/* ---------- Rémunération quand c'est toi qu'on copie ---------- */
/* À chacun de tes paris, tes copieurs le reproduisent avec leurs propres réglages ; tu touches une part de leurs frais. */
function copierFees(amt,feeRate){
 const n=S.me.copiers||0;if(!n||!meCopyOk()||!(amt>0)||!(feeRate>0))return 0;
 let tot=0;for(let i=0;i<n;i++){const st=Math.min(amt,pick([20,25,50,75,100,150,200,300,500]));tot+=st*feeRate*COPY.SHARE;}
 if(tot<.005)return 0;
 S.me.balance+=tot;S.me.copyEarn=(S.me.copyEarn||0)+tot;
 toast({tone:'green',icon:'copy',title:`${_t("Tes {0} copieurs t’ont rapporté {1}",[F.int(n),F.signed(tot)])}`,text:`${_t("{0} % des frais de leurs paris copiés, crédités sur ton solde.",[sharePct()])}`,href:'#copie',dur:3600});
 notif('copy',`${_t("Revenus de copie : {0} grâce à tes {1} copieurs.",[F.signed(tot),F.int(n)])}`,'#copie');
 return tot;
}

/* ---------- Joueurs simulés : leurs nouveaux paris et leurs ventes ---------- */
function copyDriver(){
 const act=copiesAll().filter(c=>c.status==='active');if(!act.length||R()<.25)return;
 const c=pick(act);
 if(c.holds.length&&R()<.3){traderExit(c.u);return;}
 const pool=c.cats&&c.cats.length?MARKETS.filter(m=>c.cats.includes(m.cat)):MARKETS;
 const m=pool.length&&R()<.7?pick(pool):weighted();botBetCard(R()<.5?'general':'m:'+m.id,m,c.u);
}
/* Des joueurs finissent par copier ton profil s'il est public, copiable et que tes résultats le méritent. */
function botCopier(){
 if(!meCopyOk())return;const st=stats();if(st.settled<COPY.MIN_BETS)return;
 if(R()>(st.acc>=60?.6:st.acc>=52?.3:.1))return;
 const n=S.me.copiers||0;if(n>=250)return;S.me.copiers=n+1;const u=pickUser();
 notif('copy',`${_t("{0} copie désormais tes paris.",[USERS[u].n])}`,'#copie');toast({icon:'copy',title:`${_t("{0} te copie",[USERS[u].n])}`,text:`${_t("{0} joueur{1} tes paris. Tu touches {2} % de leurs frais.",[F.int(n+1),n+1>1?'s copient':' copie',sharePct()])}`,href:'#copie'});save();
}

/* ---------- Carte « Copier » sur un profil ---------- */
function copyKpiH(u){const U=USERS[u],[al,ac]=accLabel(U.acc),n=copiersOf(u);return `<div class="cp-kpis"><div><small>${_t("Précision")}</small><b class="num">${F.pct(U.acc)}</b><span class="cp-chip ${ac}">${al}</span></div><div><small>${_t("Paris joués")}</small><b class="num">${F.int(U.bets)}</b></div><div><small>${_t("Profit de la saison")}</small><b class="num pl-up">+${F.usd0(U.profit)}</b></div></div>${n?`<p class="sub cp-copiers">${_t("{0} Copié par {1} joueur{2}. Il touche {3} % des frais de ses copieurs, sans surcoût pour eux.",[ic('users',14),F.int(n),n>1?'s':'',sharePct()])}</p>`:''}`;}
function copyCardInner(u){
 const U=USERS[u],head=(t,s2)=>`<div class="cpx-h"><span class="cp-ic">${ic('copy',18)}</span><div><b>${t}</b><small>${s2}</small></div></div>`;
 if(!uPub(u))return head(_t("Copie impossible"),_t("Ce profil est privé. Tu le vois parce que vous êtes amis, mais seuls les profils publics peuvent être copiés."));
 const el=copyElig(u),c=copyOf(u);
 if(!el.ok)return head(_t("Copie indisponible"),el.why==='off'?`${_t("{0} n’autorise pas la copie de ses paris.",[esc(U.n)])}`:`${_t("{0} n’a pas encore assez de paris ({1} minimum) pour être copié.",[esc(U.n),COPY.MIN_BETS])}`)+copyKpiH(u);
 if(c){const pnl=cPnl(c);return head(`${_t("Tu copies {0}",[esc(U.n)])}`,`${_t("{0} depuis {1} · {2} · {3}",[c.status==='paused'?_t("Copie en pause"):_t("Copie active"),ago(c.at),cModeTxt(c),cCatsTxt(c)])}`)+`<div class="cp-kpis"><div><small>${_t("Résultat")}</small><b class="num ${plc(pnl)}">${F.signed(pnl)}</b></div><div><small>${_t("Paris copiés")}</small><b class="num">${F.int(c.n)}</b></div><div><small>${_t("En jeu")}</small><b class="num">${F.usd0(cOpen(c))}</b></div></div><button class="btn b-white lg full" data-a="cp-manage" data-id="${c.id}">${_t("Gérer la copie")}</button>`;}
 const lock=!can('copy');
 return head(`${_t("Copier {0}",[esc(U.n)])}`,_t("Chaque nouveau pari de ce joueur est reproduit automatiquement sur ton compte, avec ton budget et tes réglages."))+copyKpiH(u)
  +(lock?`<button class="btn b-ink lg full" data-a="lock" data-g="copy">${_t("{0} Se débloque au rang {1}",[ic('lock',14),gateName()])}</button>`:`<button class="btn b-oui lg full" data-a="cp-open" data-u="${u}">${_t("{0} Copier automatiquement",[ic('copy',16,'#fff')])}</button>`)
  +`<p class="note">${_t("Réservé au rang {0} et plus. Les performances passées ne garantissent pas les résultats futurs.",[gateName()])}</p>`;
}
const copyCardH=u=>`<section class="pn pad cp-card" data-cpcard="${u}">${copyCardInner(u)}</section>`;

/* ---------- Profil privé vu par un autre joueur ---------- */
function vPlayerLocked(u){const U=USERS[u];
 return `<div class="wrap"><section class="pn" style="overflow:hidden"><div class="pf-top"><div class="pf-id">${avH(u,88,'span')}<div><h1>${esc(U.n)}</h1><div class="pf-meta">${rk(U.t,U.d)}<span class="vis-chip priv">${_t("{0} Profil privé",[ic('lock',12)])}</span></div></div></div><div class="hbtns pl3">${friendBtnH(u)}${gateBtn('dm',ic('send',15)+_t(" Message privé"),'b-white',`data-u="${u}"`)}</div></div>
 <div class="pf-stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><small>${_t("Rang")}</small><b class="num">${rankName(U.t,U.d)}</b></div><div><small>${_t("Classement")}</small><b class="num">${F.ord(lbRank(u))}</b></div></div></section>
 <section class="pn pad priv-lock">${ic('lock',28,'#7A808C')}<h2>${_t("Ce profil est privé")}</h2><p>${_t("{0} garde ses statistiques, ses positions et son historique pour lui. Son pseudo, son rang et sa place au classement restent visibles.",[esc(U.n)])}</p><p>${_t("Ses amis voient tout. Un profil privé ne peut pas être copié.")}</p></section></div>`;}

/* ---------- Fenêtre « Copier » (création et modification) ---------- */
function copyOpenModal(u,editId){
 if(!can('copy')){lockModal('copy');return;}
 const el=copyElig(u);if(!el.ok)return;
 const ex=copyOf(u);if(ex&&!editId){copyManage(ex.id);return;}
 if(!editId&&copiesLive().length>=COPY.MAX_ACTIVE){toast({tone:'amber',icon:'copy',title:_t("Trop de copies actives"),text:`${_t("Tu peux copier {0} joueurs en même temps.",[COPY.MAX_ACTIVE])}`});return;}
 const c=editId?copiesAll().find(x=>x.id===editId):null;
 S.ui.cp=c?{u,edit:c.id,budget:F.inp(c.budget),mode:c.mode||'fixed',per:F.inp(c.per||50),pct:String(c.pct||10),cap:c.cap?F.inp(c.cap):'',cats:c.cats?c.cats.slice():[],stop:c.stop}
  :{u,budget:String(Math.min(1000,Math.floor(S.me.balance))),mode:'fixed',per:'50',pct:'10',cap:'',cats:[],stop:30};
 openModal(copyModalH(),'wide');
}
function cpCheck(st){const b=numIn(st.budget),p=numIn(st.per),pct=Math.round(numIn(st.pct)),cap=numIn(st.cap);let err='';const prop=st.mode==='prop';
 if(b<COPY.MIN_BUDGET)err=`${_t("Budget minimum : {0}.",[F.usd0(COPY.MIN_BUDGET)])}`;
 else if(!st.edit&&b>S.me.balance+1e-9)err=_t("Ce budget dépasse ton solde.");
 else if(!prop&&p<COPY.MIN_PER)err=`${_t("Mise minimale par pari : {0}.",[F.usd0(COPY.MIN_PER)])}`;
 else if(!prop&&p>b)err=_t("La mise par pari dépasse le budget.");
 else if(prop&&(pct<1||pct>100))err=_t("Le pourcentage doit être entre 1 et 100.");
 else if(prop&&cap&&cap<COPY.MIN_PER)err=`${_t("La mise maximale doit faire au moins {0}.",[F.usd0(COPY.MIN_PER)])}`;
 return {b,p,pct,cap,ok:!err,err,n:!prop&&p>0?Math.floor(b/p):0,stopAmt:st.stop?b*st.stop/100:0};}
function cpSumH(st){const k=cpCheck(st);if(k.err)return `<p class="note warn">${k.err}</p>`;const prop=st.mode==='prop';
 const ex=prop?`<div class="line"><span>${_t("Exemple : il mise {0}",[F.usd0(500)])}</span>${_t("<b>tu mises {0}</b>",[F.usd(k.cap?Math.min(500*k.pct/100,k.cap):500*k.pct/100)])}</div>`:`<div class="line"><span>${_t("Paris ouverts en même temps")}</span>${_t("<b>jusqu’à {0}</b>",[F.int(k.n)])}</div>`;
 return `<div class="calc"><div class="line"><span>${prop?_t("Mise par pari copié"):_t("Mise par pari copié")}</span><b>${prop?`${_t("{0} % de sa mise{1}",[k.pct,k.cap?`${_t(", {0} max",[F.usd0(k.cap)])}`:''])}`:F.usd(k.p)}</b></div>${ex}<div class="line"><span>${_t("Catégories")}</span><b>${st.cats.length?st.cats.map(c=>esc(_t(c))).join(', '):_t("Toutes")}</b></div><div class="line"><span>${_t("Arrêt de perte")}</span><b>${st.stop?`${F.pct(st.stop)} (${F.usd0(k.stopAmt)})`:_t("Aucun")}</b></div></div><p class="cp-one">${cpOneH(st,k)}</p>`;}
/* C24 : tout le réglage en une phrase, juste au-dessus du bouton */
function cpOneH(st,k){const prop=st.mode==='prop',money=v=>Math.abs(v-Math.round(v))<.005?F.usd0(v):F.usd(v);
 const size=prop?_t('{0} de sa mise',[F.pct(k.pct)])+(k.cap?_t(', {0} max par pari',[money(k.cap)]):''):_t('{0} par pari',[money(k.p)]);
 return _t('Tu copies {0} : budget {1}, {2}, {3}, {4}.',[`<b>${esc(USERS[st.u].n)}</b>`,money(k.b),size,st.cats.length?st.cats.map(c=>esc(_t(c))).join(', '):_t('toutes catégories'),st.stop?_t('arrêt à {0}',[F.pct(st.stop)]):_t('sans arrêt de perte')]);}
function copyModalH(){const st=S.ui.cp,U=USERS[st.u],k=cpCheck(st),prop=st.mode==='prop',cats=copyCats();
 return `<div class="md cpm"><div class="md-h"><div><p>${_t("Copy trading")}</p><h3>${st.edit?_t("Réglages de la copie de"):_t("Copier")} ${esc(U.n)}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <div class="cpm-who">${avH(st.u,42,'span')}<div><b>${esc(U.n)}</b><small>${_t("{0} % de précision, {1} paris, {2}",[U.acc,F.int(U.bets),rankName(U.t,U.d)])}</small></div></div>
 <div class="cpf"><label class="cpl" for="cpb">${_t("Budget alloué à cette copie")}</label><label class="amt"><input id="cpb" data-cp="budget" inputmode="decimal" autocomplete="off" value="${esc(st.budget)}"><span>USDC</span></label><div class="presets">${[500,1000,5000,25000].map(v=>`<button type="button" class="btn b-ghost sm${+st.budget===v?' on':''}" data-a="cp-set" data-k="budget" data-v="${v}">${F.compact(v)}</button>`).join('')}</div></div>
 <div class="cpf"><span class="cpl">${_t("Taille de chaque pari copié")}</span><div class="seg" role="tablist"><button type="button" class="${prop?'':'on'}" data-a="cp-mode" data-v="fixed">${_t("Montant fixe")}</button><button type="button" class="${prop?'on':''}" data-a="cp-mode" data-v="prop">${_t("Proportionnel")}</button></div>
 ${prop?`<div class="chips" data-cppct>${COPY.PCT.map(v=>`<button type="button" class="chip${+st.pct===v?' on':''}" data-a="cp-pct" data-v="${v}">${F.pct(v)}</button>`).join('')}</div><label class="amt"><input id="cpc" data-cp="pct" inputmode="numeric" autocomplete="off" value="${esc(st.pct)}" aria-label="${_t("Pourcentage de sa mise")}"><span>${_t("% de sa mise")}</span></label><label class="amt"><input id="cpx" data-cp="cap" inputmode="decimal" autocomplete="off" value="${esc(st.cap)}" placeholder="${_t("Aucune")}" aria-label="${_t("Mise maximale par pari copié")}"><span>${_t("USDC max par pari")}</span></label><span class="sub">${_t("S’il mise {0}, tu mises {1}. Comme sur eToro, tes mises suivent les siennes à l’échelle de ton budget.",[F.usd0(1000),k.ok?F.usd(k.cap?Math.min(1000*k.pct/100,k.cap):1000*k.pct/100):'…'])}</span>`
 :`<label class="amt"><input id="cpp" data-cp="per" inputmode="decimal" autocomplete="off" value="${esc(st.per)}" aria-label="${_t("Mise pour chaque pari copié")}"><span>USDC</span></label><div class="presets">${[10,25,50,100].map(v=>`<button type="button" class="btn b-ghost sm${+st.per===v?' on':''}" data-a="cp-set" data-k="per" data-v="${v}">${F.usd0(v)}</button>`).join('')}</div><span class="sub">${_t("Le même montant à chaque pari, quelle que soit sa mise à lui.")}</span>`}</div>
 <div class="cpf"><span class="cpl">${_t("Catégories copiées")}</span><div class="chips" data-cpcats><button type="button" class="chip${st.cats.length?'':' on'}" data-a="cp-cat" data-v="">${_t("Toutes")}</button>${cats.map(c=>`<button type="button" class="chip${st.cats.includes(c)?' on':''}" data-a="cp-cat" data-v="${esc(c)}">${esc(_t(c))}</button>`).join('')}</div><span class="sub">${_t("Par exemple : copier seulement ses paris crypto.")}</span></div>
 <div class="cpf"><span class="cpl">${_t("Arrêt de perte")}</span><div class="chips" data-cpstop>${[[10,F.pct(10)],[20,F.pct(20)],[30,F.pct(30)],[50,F.pct(50)],[0,_t("Aucun")]].map(([v,l])=>`<button type="button" class="chip${st.stop===v?' on':''}" data-a="cp-stop-set" data-v="${v}">${l}</button>`).join('')}</div><span class="sub">${_t("La copie s’arrête et vend ses positions si sa perte atteint ce seuil de ton budget.")}</span></div>
 ${st.edit?'':`<label class="chk"><input type="checkbox" data-cp-existing checked> ${_t("Copier aussi ses mises en cours")}</label>`}
 <div data-cpsum>${cpSumH(st)}</div>
 <button class="btn b-oui lg full" data-a="cp-start" data-cpgo${k.ok?'':' disabled'}>${st.edit?_t("Enregistrer les réglages"):_t("Démarrer la copie")}</button>
 <p class="note">${_t("Chaque pari copié passe par le carnet d’ordres avec les frais d’entrée habituels ; {0} en touche {1} %, sans surcoût pour toi. Les paris éclair ne sont pas copiés. Les performances passées ne garantissent pas les résultats futurs. Tu peux arrêter à tout moment.",[esc(U.n),sharePct()])}</p></div>`;}
function copyModalSync(){const st=S.ui.cp;if(!st)return;const k=cpCheck(st),s=$('[data-cpsum]'),b=$('[data-cpgo]');if(s){s.innerHTML=cpSumH(st);fixText(s);}if(b)b.disabled=!k.ok;
 $$('[data-cpstop] .chip').forEach(x=>x.classList.toggle('on',+x.dataset.v===st.stop));$$('[data-cppct] .chip').forEach(x=>x.classList.toggle('on',+x.dataset.v===+st.pct));
 $$('[data-cpcats] .chip').forEach(x=>x.classList.toggle('on',x.dataset.v?st.cats.includes(x.dataset.v):!st.cats.length));}
function copyModalRe(){const md=$('#ov .modal');if(md){md.innerHTML=copyModalH();fixText(md);}}
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.cp;if(!k||!S.ui.cp)return;S.ui.cp[k]=e.target.value;copyModalSync();});

function copyStart(){
 const st=S.ui.cp;if(!st)return;const k=cpCheck(st);if(!k.ok||!can('copy'))return;
 const u=st.u,el=copyElig(u);if(!el.ok)return;
 const cfg={budget:k.b,mode:st.mode,per:k.p,pct:k.pct,cap:st.mode==='prop'?k.cap:0,cats:st.cats.length?st.cats.slice():null,stop:st.stop};
 if(st.edit){const c=copiesAll().find(x=>x.id===st.edit);if(!c)return;Object.assign(c,cfg);S.ui.cp=null;closeModal();save();toast({icon:'check',title:`${_t("Réglages enregistrés")}`,text:`${cModeTxt(c)} · ${cCatsTxt(c)}`,dur:2600});copyRefresh();return;}
 if(copyOf(u))return;
 const withOpen=!!($('[data-cp-existing]')||{}).checked;
 const c=Object.assign({id:'cp'+Math.floor(now()%1e9)+Math.floor(R()*1000),u,at:now(),status:'active',holds:[],realized:0,n:0,log:[],endPnl:0,given:0},cfg);
 copiesAll().unshift(c);S.ui.cp=null;closeModal();
 let n=0;
 if(withOpen)for(const b of playerBets(u)){const r=copyExec(c,b.m,b.s,b.amt);if(r.ok){n++;logC(c,{k:'open',m:b.m.id,s:b.s,amt:r.amt});}}
 const U=USERS[u];
 toast({tone:'blue',icon:'copy',title:`${_t("Tu copies {0}",[U.n])}`,text:n?`${_t("{0} position{1} copiée{1}. Ses prochains paris seront copiés automatiquement.",[n,n>1?'s':''])}`:_t("Ses prochains paris seront copiés automatiquement."),href:'#copie'});
 notif('copy',`${_t("Tu copies maintenant {0} (budget {1}, {2}).",[U.n,F.usd0(k.b),cModeTxt(c)])}`,'#copie');
 if(!S.me.copyXP){S.me.copyXP=1;gainXP(15);}
 updateHeader();checkBadges();copyGuard();save();copyRefresh();
}

/* ---------- Gérer / arrêter une copie ---------- */
function copyManageH(c){const U=USERS[c.u],pnl=cPnl(c);
 const holds=c.holds.map(h=>{const m=MK[h.m],pr=h.s==='oui'?m.p:100-m.p,v=h.sh*pr/100-h.cost;return `<a class="prow cp-hold" href="#marche-${m.id}" data-a="close"><span class="nm">${esc(m.short)}</span><span class="sub"><span class="sidechip ${h.s}">${h.s==='oui'?_t("Oui"):_t("Non")}</span> ${F.usd(h.cost)}</span><b class="num ${plc(v)}">${F.signed(v)}</b></a>`;}).join('');
 return `<div class="md cpm"><div class="md-h"><div><p>${_t("Copy trading, {0}",[c.status==='paused'?_t('en pause'):_t('active')])}</p><h3>${esc(U.n)}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <div class="cp-kpis"><div><small>${_t("Résultat")}</small><b class="num ${plc(pnl)}">${F.signed(pnl)}</b></div><div><small>${_t("Paris copiés")}</small><b class="num">${F.int(c.n)}</b></div><div><small>${_t("En jeu")}</small><b class="num">${F.usd0(cOpen(c))}</b></div></div>
 <div class="calc"><div class="line"><span>${_t("Budget")}</span><b>${F.usd0(c.budget)}</b></div><div class="line"><span>${_t("Disponible")}</span><b>${F.usd(cFree(c))}</b></div><div class="line"><span>${_t("Mise par pari")}</span><b>${cModeTxt(c)}</b></div><div class="line"><span>${_t("Catégories")}</span><b>${cCatsTxt(c)}</b></div><div class="line"><span>${_t("Arrêt de perte")}</span><b>${c.stop?`${F.pct(c.stop)} (${F.usd0(c.budget*c.stop/100)})`:_t("Aucun")}</b></div><div class="line"><span>${_t("Reversé à {0}",[esc(U.n)])}</span><b>${F.usd(c.given||0)}</b></div></div>
 <div><div class="h2" style="font-size:15px;margin-bottom:2px">${_t("Positions copiées")}</div>${holds||`<p class="sub">${_t("Aucune position copiée ouverte pour l’instant.")}</p>`}</div>
 <div class="cpm-acts"><button class="btn b-white lg" data-a="cp-edit" data-id="${c.id}">${_t("{0} Modifier les réglages",[ic('user',15)])}</button><button class="btn b-white lg" data-a="cp-pause" data-id="${c.id}">${c.status==='paused'?_t("Reprendre la copie"):_t("Mettre en pause")}</button><button class="btn b-ghost lg" data-a="cp-stop" data-id="${c.id}">${_t("Arrêter la copie")}</button></div></div>`;}
function copyManage(id){const c=copiesAll().find(x=>x.id===id);if(!c||c.status==='stopped')return;openModal(copyManageH(c),'wide');}

/* ---------- Page « Copy trading » ---------- */
function copyRowH(c){const U=USERS[c.u],pnl=cPnl(c),st=c.status,
 stl=st==='active'?_t("Active"):st==='paused'?_t("En pause"):c.why==='stop'?_t("Arrêt de perte"):_t("Arrêtée"),
 last=c.log.find(e=>e.k==='open'||e.k==='exit'),lm=last&&MK[last.m]?`${F.kv(last.k==='open'?_t('Copié'):_t('Vendu'),esc(MK[last.m].short))}, ${ago(last.at)}`:_t("Aucun pari copié pour l’instant");
 return `<div class="cp-row ${st}"><a class="cp-who" href="#joueur-${c.u}">${avH(c.u,42,'span')}<span><b>${esc(U.n)}</b><small>${cModeTxt(c)} · ${cCatsTxt(c)}</small></span></a><span class="cp-st ${st}">${stl}</span>
 <div class="cp-nums"><div><small>${_t("Résultat")}</small><b class="num ${plc(pnl)}">${F.signed(pnl)}</b></div><div><small>${_t("Budget")}</small><b class="num">${F.usd0(c.budget)}</b></div><div><small>${_t("En jeu")}</small><b class="num">${F.usd0(cOpen(c))}</b></div><div><small>${_t("Paris copiés")}</small><b class="num">${F.int(c.n)}</b></div></div>
 <div class="cp-last">${lm}</div>${st!=='stopped'?`<div class="cp-acts"><button class="btn b-white sm" data-a="cp-manage" data-id="${c.id}">${_t("Gérer")}</button></div>`:''}</div>`;}
function copiersSectionH(){const n=S.me.copiers||0,e=S.me.copyEarn||0,ok=meCopyOk();
 return `<section class="pn pad"><div class="ph" style="margin-bottom:6px"><div><div class="h2">${_t("Tes copieurs")}</div><div class="sub">${ok?`${_t("Tu touches {0} % des frais payés par les joueurs qui copient tes paris.",[sharePct()])}`:_t("Active « Autoriser la copie de mes paris » sur un profil public pour être copié et toucher une part des frais de tes copieurs.")}</div></div>${ok?'':`<a class="btn b-white sm" href="#modifier">${_t("Activer")}</a>`}</div>
 ${ok?`<div class="cp-kpis"><div><small>${_t("Joueurs qui te copient")}</small><b class="num">${F.int(n)}</b></div><div><small>${_t("Revenus de copie")}</small><b class="num ${e>=.005?'pl-up':''}">${e>=.005?F.signed(e):F.usd(e)}</b></div><div><small>${_t("Ta part des frais")}</small><b class="num">${F.pct(sharePct())}</b></div></div>`:''}</section>`;}
function copyBodyH(){
 const L=copiesAll(),live=L.filter(c=>c.status!=='stopped'),old=L.filter(c=>c.status==='stopped');
 const alloc=live.reduce((a,c)=>a+c.budget,0),pnl=L.reduce((a,c)=>a+cPnl(c),0);
 const top=USER_IDS.filter(u=>copyElig(u).ok&&!copyOf(u)).sort((a,b)=>USERS[b].acc-USERS[a].acc).slice(0,6);
 return `<section class="pn pad"><div class="cp-kpis big"><div><small>${_t("Copies actives")}</small><b class="num">${live.length}</b></div><div><small>${_t("Budget alloué")}</small><b class="num">${F.usd0(alloc)}</b></div><div><small>${_t("Résultat total")}</small><b class="num ${plc(pnl)}">${F.signed(pnl)}</b></div></div></section>
 <section class="pn pad"><div class="h2" style="margin-bottom:6px">${_t("Mes copies")}</div>${live.length?live.map(copyRowH).join(''):`<div class="empty" style="padding:18px 0">${_t("Tu ne copies personne pour l’instant. Ouvre un profil public à forte précision et touche « Copier automatiquement ».")}<div class="emp-a"><a class="btn b-white sm" href="#classement">${_t("Voir le classement")}</a></div></div>`}</section>
 ${copiersSectionH()}
 <section class="pn pad"><div class="ph" style="margin-bottom:6px"><div><div class="h2">${_t("Joueurs à copier")}</div><div class="sub">${_t("Profils publics qui autorisent la copie, classés par précision.")}</div></div><a class="link" href="#classement" style="font-size:13px">${_t("Classement")}</a></div>${top.map(u=>{const U=USERS[u],[al,ac]=accLabel(U.acc);return `<a class="cp-pick" href="#joueur-${u}">${avH(u,38,'span')}<span class="cpk-n"><b>${esc(U.n)}</b>${rk(U.t,U.d)}</span><span class="cpk-a"><b class="num">${F.pct(U.acc)}</b><span class="cp-chip ${ac}">${al}</span></span><span class="cpk-p num pl-up">+${F.usd0(U.profit)}</span></a>`;}).join('')||`<p class="sub">${_t("Aucun joueur à copier pour l’instant.")}</p>`}</section>
 ${old.length?`<section class="pn pad"><div class="h2" style="margin-bottom:6px">${_t("Copies terminées")}</div>${old.slice(0,8).map(copyRowH).join('')}</section>`:''}`;}
function vCopy(){
 const lock=!can('copy'),L=lock?conds(GATES.copy.t):[],r=myRank();
 return `<div class="wrap"><nav class="crumbs"><a href="#profil">${_t("Ton profil")}</a><span>/</span><span>${_t("Copy trading")}</span></nav><div class="pagehead" style="margin-top:10px"><div><h1 class="ptitle">${_t("Copy trading")}</h1><p class="plead">${_t("Copie automatiquement les meilleurs joueurs. Quand l’un d’eux place ou vend un pari, le même mouvement est reproduit sur ton compte avec ton propre budget. Et si on te copie, tu touches {0} % des frais de tes copieurs.",[sharePct()])}</p></div></div>
 ${lock?`<section class="pn pad cp-lockp"><div class="cpx-h"><span class="cp-ic">${ic('lock',18)}</span><div>${_t("<b>Se débloque au rang {0}</b>",[gateName()])}<small>${_t("Tu es {0}. Voici ce qu’il te manque :",[rankName(r.t,r.d)])}</small></div></div><div class="conds-l">${L.map(condH).join('')}</div><a class="btn b-ink lg full" href="#rang">${_t("Voir mon rang en détail")}</a></section>`:''}
 <div class="col" data-copyroot>${copyBodyH()}</div></div>`;}
/* Rafraîchit les éléments de copie visibles (page, cartes de profil, tableau de positions). */
function copyRefresh(){
 const root=$('[data-copyroot]');if(root){root.innerHTML=copyBodyH();fixText(root);}
 $$('[data-cpcard]').forEach(el=>{el.innerHTML=copyCardInner(el.dataset.cpcard);fixText(el);});
 if(S.ui.route==='profil')render(false);
}

Object.assign(ACT,{
 'cp-open':a=>copyOpenModal(a.dataset.u),
 'cp-edit':a=>{const c=copiesAll().find(x=>x.id===a.dataset.id);if(!c||c.status==='stopped')return;copyOpenModal(c.u,c.id);},
 'cp-set':a=>{const st=S.ui.cp;if(!st)return;const k=a.dataset.k;st[k]=a.dataset.v;const i=$(`[data-cp="${k}"]`);if(i)i.value=a.dataset.v;stkMark('[data-a="cp-set"][data-k="'+k+'"]',a.dataset.v);copyModalSync();},
 'cp-mode':a=>{const st=S.ui.cp;if(!st)return;st.mode=a.dataset.v;copyModalRe();},
 'cp-pct':a=>{const st=S.ui.cp;if(!st)return;st.pct=a.dataset.v;const i=$('[data-cp="pct"]');if(i)i.value=st.pct;copyModalSync();},
 'cp-cat':a=>{const st=S.ui.cp;if(!st)return;const v=a.dataset.v;if(!v)st.cats=[];else{const i=st.cats.indexOf(v);if(i>=0)st.cats.splice(i,1);else st.cats.push(v);}copyModalSync();},
 'cp-stop-set':a=>{const st=S.ui.cp;if(!st)return;st.stop=+a.dataset.v;copyModalSync();},
 'cp-start':()=>copyStart(),
 'cp-manage':a=>copyManage(a.dataset.id),
 'cp-pause':a=>{const c=copiesAll().find(x=>x.id===a.dataset.id);if(!c||c.status==='stopped')return;c.status=c.status==='paused'?'active':'paused';save();toast({icon:'copy',title:c.status==='paused'?`${_t("Copie de {0} en pause",[USERS[c.u].n])}`:`${_t("Copie de {0} reprise",[USERS[c.u].n])}`,text:c.status==='paused'?_t("Ses nouveaux paris ne sont plus copiés, tes positions restent ouvertes."):_t("Ses prochains paris seront copiés."),force:true,dur:2600});const md=a.closest('.modal');if(md){md.innerHTML=copyManageH(c);fixText(md);}copyRefresh();},
 'cp-stop':a=>{const c=copiesAll().find(x=>x.id===a.dataset.id);if(!c||c.status==='stopped')return;const U=USERS[c.u],n=c.holds.length;
  openModal(`<div class="md"><div class="md-h"><div><h3>${_t("Arrêter la copie de {0} ?",[esc(U.n)])}</h3><p>${n?`${_t("Ses prochains paris ne seront plus copiés. Que fais-tu des {0} position{1} copiée{1} encore ouverte{1} ?",[n,n>1?'s':''])}`:_t("Ses prochains paris ne seront plus copiés.")}</p></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
  ${n?`<button class="btn b-ink lg full" data-a="cp-stop-do" data-id="${c.id}" data-close="0">${_t("Arrêter et garder mes positions")}</button><button class="btn b-white lg full" data-a="cp-stop-do" data-id="${c.id}" data-close="1">${_t("Arrêter et tout vendre au prix du marché")}</button>`:`<button class="btn b-ink lg full" data-a="cp-stop-do" data-id="${c.id}" data-close="0">${_t("Arrêter la copie")}</button>`}
  <button class="btn b-ghost lg full" data-a="close">${_t("Annuler")}</button></div>`);},
 'cp-stop-do':a=>{const c=copiesAll().find(x=>x.id===a.dataset.id);if(!c)return;const close=a.dataset.close==='1';copyStop(c,'manual',close);closeModal();toast({icon:'check',force:true,title:`${_t("Copie de {0} arrêtée",[USERS[c.u].n])}`,text:close?`${_t("Positions vendues, {0}.",[F.signed(c.endPnl)])}`:c.kept?`${_t("{0} position{1} dans ton portefeuille.",[c.kept,c.kept>1?'s restent ouvertes':' reste ouverte'])}`:'',dur:3200});},
 'pe-vis':a=>{if(!S.ui.pe)return;S.ui.pe.prefs.public=a.dataset.v==='pub';const el=$('[data-pepriv]');if(el){el.outerHTML=privSectionH();fixText($('[data-pepriv]'));}peRefresh();}
});
Object.assign(VIEWS,{copie:vCopy});PROTECTED.add('copie');TITLES.copie=_t("Copy trading");

/* Minuteurs : arrêts de perte, paris des joueurs copiés, nouveaux copieurs. */
{const live=fn=>()=>{if(!document.hidden&&S.me.logged)fn();};
 setInterval(live(copyGuard),4000);setInterval(live(copyDriver),20000);setInterval(live(botCopier),52000);}

/* D10 : le bouton du montant choisi reste marqué, y compris quand le montant est saisi au clavier */
function stkMark(sel,v){$$(sel).forEach(b=>b.classList.toggle('on',+b.dataset.v===+F.parse(String(v))));}
document.addEventListener('input',e=>{const t=e.target;if(!t.dataset)return;if(t.dataset.cp==='budget'||t.dataset.cp==='per')stkMark('[data-a="cp-set"][data-k="'+t.dataset.cp+'"]',t.value);else if(t.dataset.fiat==='dep')stkMark('[data-a="fiat-q"][data-k="dep"]',t.value);});

