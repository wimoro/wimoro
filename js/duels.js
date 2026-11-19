/* WIMORO — duels module */

'use strict';
/* =====================================================================================
 *  Duels 1 contre 1 entre amis
 *  ------------------------------------------------------------------------------------
 *  - Uniquement sur les marchés officiels de Wimoro : un marché classique (réglé à sa
 *    clôture) ou une manche éclair (réglée en 45 secondes, prix relevés comme preuve).
 *  - Le défieur choisit son camp et sa mise ; l'ami accepte en prenant le camp inverse.
 *    Les cotes viennent du marché au moment de l'acceptation : si Oui vaut 70 ¢, celui
 *    qui dit Oui engage 70 % de la cagnotte, l'autre 30 %, le gagnant prend tout.
 *    Concrètement : deux ordres qui se croisent sur le vrai carnet, au prix du marché.
 *  - Les deux mises sont bloquées sous séquestre Wimoro dès l'acceptation ; personne ne
 *    décide du résultat : la plateforme règle le duel avec la résolution du marché et
 *    affiche la preuve (prix relevé, résultat officiel) sur la carte.
 *  - Variante « duel de stack » : même buy-in, 1 000 jetons virtuels chacun, une semaine
 *    sur tous les marchés, le plus gros stack remporte la cagnotte.
 *  - Lien d'invitation : il contient le duel (marché, camp, mise, défieur) ; l'ami qui
 *    l'ouvre voit la règle et la source de résolution, puis accepte.
 *  Démo : les amis répondent en quelques secondes et des défis arrivent de temps en temps.
 * ===================================================================================== */
const DUEL={MIN:5,MAX:5000,EXPIRE:48*3600e3,STACK_DAYS:7,STACK_CHIPS:1000,STACK_FEE:.04};
const duelsAll=()=>S.me.duels||(S.me.duels=[]);
const duelOf=id=>duelsAll().find(d=>d.id===id);
const duelActive=()=>duelsAll().filter(d=>d.status==='active');
const duelOpenMine=()=>duelsAll().filter(d=>d.status==='open'&&d.by==='me');
const duelIncoming=()=>duelsAll().filter(d=>d.status==='open'&&d.by!=='me');
const duelDone=()=>duelsAll().filter(d=>['won','lost','void','expired','declined'].includes(d.status)).sort((a,b)=>(b.settleAt||b.at)-(a.settleAt||a.at));
const duelCode=()=>'D'+(Date.now().toString(36)+Math.floor(R()*1296).toString(36)).toUpperCase().slice(-6);
/* marché d'un duel : marché classique (MK) ou manche éclair (« flash:btc ») */
const duelIsFlash=d=>typeof d.m==='string'&&d.m.startsWith('flash:');
const duelGame=d=>duelIsFlash(d)?GM[d.m.slice(6)]:null;
function duelQ(d){const g=duelGame(d);if(g)return g.q;const m=MK[d.m];return m?m.q:d.q||'';}
function duelShort(d){const g=duelGame(d);if(g)return `${_t("Éclair {0}, manche {1}",[g.name,F.int(d.round)])}`;const m=MK[d.m];return m?m.short:d.q||'';}
function duelSideTxt(d,s){const g=duelGame(d);if(g)return s==='oui'?g.a:g.b;return s==='oui'?_t("Oui"):_t("Non");}
function duelSource(d){const g=duelGame(d);if(g)return g.kind==='dir'?`${_t("Prix {0} relevé par Wimoro au début et à la fin de la manche (flux Coinbase)",[g.name])}`:g.kind==='vol'?_t("Prix du Bitcoin relevé par Wimoro (flux Coinbase)"):_t("Score officiel relevé en direct par Wimoro");const m=MK[d.m];return m?m.rules:'';}
/* prix actuel (¢) du camp `s` */
function duelPrice(d,s){const g=duelGame(d);if(g){const pr=flashPrices(G(g.id));return s==='oui'?pr.o:pr.n;}const m=MK[d.m];return Math.round(s==='oui'?m.p:100-m.p);}
const duelOpp=s=>s==='oui'?'non':'oui';
const duelRate=()=>wmRate('Crypto',myRank().t>=5);
/* frais réels d'un camp pour une mise donnée : ceux du carnet (marché) ou de la cagnotte (éclair) */
function duelFee(d,side,amt){if(amt<=0)return 0;const disc=myRank().t>=5;const g=duelGame(d);if(g)return flashFee(g.cat,G(g.id),side,amt,disc);const m=MK[d.m];if(!m)return 0;const q=quoteBuy(m,side,amt,disc);return q.fee||0;}
/* mise du camp adverse pour une cagnotte donnée : cagnotte × prix adverse */
function duelSplit(stake,price){const pot=stake*100/price;return {pot,other:pot*(100-price)/100};}
const duelUserN=u=>u==='me'?S.me.n:(USERS[u]?userOf(u).n:u);
/* avatar d'un participant, y compris un défieur venu d'un lien (inconnu ici) */
const duelAvH=(u,size)=>(u==='me'||USERS[u])?avH(u,size,'span'):`<span class="av t2" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.4)}px">${esc(String(u)[0]||'?')}</span>`;
const duelMySide=d=>d.by==='me'?d.side:duelOpp(d.side);
const duelOppOf=d=>d.by==='me'?d.opp:d.by;

/* ---------- Création ---------- */
function duelCreate(m,side,stake,opp){if(!S.me.logged)return null;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return null;
 const fee=duelFee({m},side,stake);if(stake+fee>S.me.balance+1e-9){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return null;}
 const isF=m.startsWith('flash:');let round=0;if(isF){const ph=flashPhase();round=S.flash.round+(ph.openLeft<10000?1:0);}
 const d={id:'d'+now().toString(36)+Math.floor(R()*999),code:duelCode(),kind:'market',m,round,side,by:'me',opp:opp||null,stake,fee,status:'open',at:now(),expiresAt:isF?now()+120000:now()+DUEL.EXPIRE,price0:duelPrice({m},side)};
 S.me.balance-=stake+fee;S.me.realized-=fee;duelsAll().unshift(d);S.me.duelsMade=(S.me.duelsMade||0)+1;save();updateHeader();
 notif('swords',opp?`${_t("Défi envoyé à {0} : {1}, tu dis {2}, {3}.",[duelUserN(opp),duelShort(d),duelSideTxt(d,side),F.usd0(stake)])}`:`${_t("Duel créé : {0}, tu dis {1}, {2}. Envoie le lien à un ami.",[duelShort(d),duelSideTxt(d,side),F.usd0(stake)])}`,'#duel-'+d.id);
 duelScheduleBot(d);return d;}
/* ---------- Acceptation : deux ordres croisés au prix du marché, mises sous séquestre ---------- */
function duelAccept(d,who){if(d.status!=='open')return false;const s=d.side,p=duelPrice(d,s);if(p<2||p>98)return false;const sp=duelSplit(d.stake,p),oppFee=duelFee(d,duelOpp(s),sp.other);
 if(who==='me'){if(typeof rgBlocked==='function'&&rgBlocked('bet'))return false;if(sp.other+oppFee>S.me.balance+1e-9){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:`${_t("Il te faut {0} pour accepter ce duel.",[F.usd(sp.other+oppFee)])}`,href:'#depot'});return false;}S.me.balance-=sp.other+oppFee;S.me.realized-=oppFee;d.opp='me';}
 else d.opp=who;
 d.price=p;d.oppStake=sp.other;d.pot=sp.pot;d.oppFee=oppFee;d.status='active';d.acceptAt=now();
 const m=MK[d.m];if(m){const old=m.p;const q1=quoteBuy(m,s,d.stake,false),q2=quoteBuy(m,duelOpp(s),sp.other,false);if(q1.full)applyBuy(m,q1);if(q2.full)applyBuy(m,q2);m.vol+=d.stake+sp.other;m.people++;addBet(m,{s:s==='oui'?1:0,a:Math.min(1,d.stake/300),me:d.by==='me'?1:0});addBet(m,{s:s==='oui'?0:1,a:Math.min(1,sp.other/300),me:d.opp==='me'?1:0});updateMarket(m,old);}
 save();updateHeader();return true;}
function duelRefund(d,reason){if(d.by==='me'&&['open','active'].includes(d.status)){S.me.balance+=d.stake;}if(d.opp==='me'&&d.status==='active')S.me.balance+=d.oppStake||0;d.status=reason;d.settleAt=now();save();updateHeader();}
/* ---------- Règlement ---------- */
function duelSettle(d,winSide,proof){if(d.status!=='active')return;const mine=duelMySide(d),meIn=d.by==='me'||d.opp==='me';const won=winSide===mine;d.winSide=winSide;d.proof=proof;d.settleAt=now();d.status=won?'won':'lost';
 if(meIn){const before=myRank();const myStake=d.by==='me'?d.stake:d.oppStake;const pnl=won?d.pot-myStake:-myStake;S.me.settled++;S.me.realized+=pnl;S.me.duelPnl=(S.me.duelPnl||0)+pnl;if(won){S.me.balance+=d.pot;S.me.wins++;S.me.duelWins=(S.me.duelWins||0)+1;gainXP(20);}
  S.me.history.unshift({k:'duel',q:`${_t("Duel contre {0} : {1}",[duelUserN(duelOppOf(d)),duelShort(d)])}`,s:mine,win:won,pnl,at:now()});
  toast({tone:won?'green':'red',icon:'swords',force:true,title:won?`${_t("Duel gagné : +{0}",[F.usd(d.pot-myStake)])}`:`${_t("Duel perdu : −{0}",[F.usd(myStake)])}`,text:`${duelShort(d)}. ${proof.txt}`,href:'#duel-'+d.id});notif('swords',`${_t("{0} contre {1} : {2}.",[won?_t("Duel gagné"):_t("Duel perdu"),duelUserN(duelOppOf(d)),duelShort(d)])}`,'#duel-'+d.id);
  if(won&&!$('.flres'))confetti(30);checkRank(before);checkBadges();}
 save();if((S.ui.route||'').startsWith('duel'))render(false);}
/* manches éclair : règlement avec les prix relevés */
const resolveFlash0=resolveFlash;
resolveFlash=function(){const round=S.flash.round,starts={},ends={};for(const g of GAMES){const gm=G(g.id);starts[g.id]=gm.start;ends[g.id]=g.kind==='dir'?gm.price:gm.start;}resolveFlash0();
 if(SRV()){srvDuelsApresManche(round);return;}                 /* mode Compte : c'est le serveur qui règle les duels de la manche */
 for(const d of duelsAll()){if(!duelIsFlash(d)||d.round!==round)continue;const g=duelGame(d),gm=G(g.id),r=gm.result;if(!r)continue;
  if(d.status==='open'){duelRefund(d,'expired');continue;}
  if(d.status!=='active')continue;
  if(r.out===2){duelRefund(d,'void');notif('swords',`${_t("Duel annulé : break even sur {0}, les deux mises sont rendues.",[g.name])}`,'#duel-'+d.id);continue;}
  const start=starts[g.id],end=ends[g.id],hist=gm.hist&&gm.hist[0];
  const proof=g.kind==='event'?{txt:r.out===1?g.rs(true):g.rs(false),src:duelSource(d),at:now()}:{txt:`${_t("Départ {0}, arrivée {1} ({2}).",[g.fp(start),g.fp(end),pctFx(hist?hist.ch:0)])}`,src:duelSource(d),at:now(),start,end};
  duelSettle(d,r.out===1?'oui':'non',proof);}
 duelStackTick();};
/* marchés classiques : réglés à la clôture (hors démo) ; passage des délais */
function duelTick(){if(document.hidden)return;for(const d of duelsAll()){if(d.status==='open'&&d.expiresAt&&now()>d.expiresAt){duelRefund(d,'expired');if(d.by==='me')notif('swords',`${_t("Duel expiré sans réponse : {0}. Ta mise t’est rendue.",[duelShort(d)])}`,'#duels');}}}

/* ---------- Amis simulés ---------- */
function duelScheduleBot(d){const ep=S.epoch;const who=d.opp||pick(friendsOf().length?friendsOf():USER_IDS);const delay=duelIsFlash(d)?2500+R()*5000:6000+R()*14000;
 setTimeout(()=>{if(ep!==S.epoch||d.status!=='open')return;if(R()<.12&&!d.opp){duelRefund(d,'declined');notif('swords',`${_t("{0} a décliné ton duel sur {1}. Ta mise t’est rendue.",[duelUserN(who),duelShort(d)])}`,'#duels');if((S.ui.route||'').startsWith('duel'))render(false);return;}
  if(duelAccept(d,who)){toast({tone:'blue',icon:'swords',force:true,title:`${_t("{0} accepte ton duel",[duelUserN(who)])}`,text:`${_t("{0} : {1} dit {2} pour {3}. Cagnotte {4}.",[duelShort(d),duelUserN(who),duelSideTxt(d,duelOpp(d.side)),F.usd(d.oppStake),F.usd(d.pot)])}`,href:'#duel-'+d.id});notif('swords',`${_t("{0} a accepté ton duel : {1}, cagnotte {2}.",[duelUserN(who),duelShort(d),F.usd(d.pot)])}`,'#duel-'+d.id);if((S.ui.route||'').startsWith('duel'))render(false);}},delay);}
/* un ami te défie de temps en temps */
function duelBotChallenge(){if(!S.me.logged||!friendsOf().length||duelIncoming().length>=2||R()<.5)return;const who=pick(friendsOf()),m=pick(MARKETS.filter(x=>!x.creator)),side=R()<.5?'oui':'non',stake=pick([10,20,25,50,100]);
 const d={id:'d'+now().toString(36)+Math.floor(R()*999),code:duelCode(),kind:'market',m:m.id,round:0,side,by:who,opp:'me',stake,fee:0,status:'open',at:now(),expiresAt:now()+DUEL.EXPIRE,price0:Math.round(side==='oui'?m.p:100-m.p)};
 duelsAll().unshift(d);save();notif('swords',`${_t("{0} te défie : {1}, {0} dit {2} pour {3}.",[duelUserN(who),m.short,side==='oui'?_t("Oui"):_t("Non"),F.usd0(stake)])}`,'#duel-'+d.id);toast({tone:'blue',icon:'swords',title:`${_t("{0} te défie",[duelUserN(who)])}`,text:`${_t("{0} : {1} dit {2}, {3}. À toi de prendre l’autre camp.",[m.short,duelUserN(who),side==='oui'?_t("Oui"):_t("Non"),F.usd0(stake)])}`,href:'#duel-'+d.id});}

/* ---------- Duel de stack ---------- */
const stacksAll=()=>S.me.stacks||(S.me.stacks=[]);
function stackCreate(buyin,opp){if(!S.me.logged)return null;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return null;if(buyin>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return null;}
 const d={id:'s'+now().toString(36)+Math.floor(R()*999),kind:'stack',buyin,opp,status:'active',at:now(),endAt:now()+DUEL.STACK_DAYS*86400e3,ref:S.me.realized+portfolio().unreal,my:DUEL.STACK_CHIPS,theirs:DUEL.STACK_CHIPS,path:[DUEL.STACK_CHIPS],opath:[DUEL.STACK_CHIPS]};
 S.me.balance-=buyin;stacksAll().unshift(d);save();updateHeader();notif('swords',`${_t("Duel de stack lancé contre {0} : {1} chacun, {2} jetons, une semaine.",[duelUserN(opp),F.usd0(buyin),DUEL.STACK_CHIPS])}`,'#duels');return d;}
/* ton stack suit tes résultats réels depuis le départ (1 jeton = 1 $ de résultat) ; celui de l'adversaire est simulé */
function duelStackTick(){for(const d of stacksAll()){if(d.status!=='active')continue;const cur=S.me.realized+portfolio().unreal;d.my=Math.max(0,Math.round(DUEL.STACK_CHIPS+(cur-d.ref)));const rr=rng(hash(d.id+Math.floor(now()/60000)));d.theirs=Math.max(0,Math.round(d.theirs*(1+(rr()-.48)*.04)));
 if(now()-(d.lastPt||d.at)>3600e3){d.path.push(d.my);d.opath.push(d.theirs);d.lastPt=now();}
 if(now()>=d.endAt){const pot=d.buyin*2*(1-DUEL.STACK_FEE);const won=d.my>d.theirs,tie=d.my===d.theirs;d.status=tie?'void':won?'won':'lost';d.settleAt=now();if(tie)S.me.balance+=d.buyin;else if(won){S.me.balance+=pot;gainXP(30);}
  notif('swords',tie?_t("Duel de stack : égalité, buy-in rendu."):won?`${_t("Duel de stack gagné contre {0} : +{1}.",[duelUserN(d.opp),F.usd(pot-d.buyin)])}`:`${_t("Duel de stack perdu contre {0}.",[duelUserN(d.opp)])}`,'#duels');}}
 save();}

/* ---------- Carte en image (1080 × 1350) ---------- */
function duelCanvas(d){const c=document.createElement('canvas'),W=1080,H=1350;c.width=W;c.height=H;const ctx=c.getContext('2d');const P=imgPal(),sg=plain(cssVar('--sg')),font=(w,s)=>`${w} ${s}px ${sg}`;
 ctx.fillStyle=P.bg;ctx.fillRect(0,0,W,H);
 ctx.direction=RTL?'rtl':'ltr';const X=RTL?W-80:80;ctx.textAlign=RTL?'right':'left';const txt=s=>plain(String(s));
 ctx.font=font(600,54);ctx.fillStyle=P.text;ctx.fillText('wimoro',X+(RTL?-70:70),130);drawLogo(ctx,RTL?W-80-56:80,84,56);
 const me=duelUserN(d.by),opp=duelOppOf(d)?duelUserN(duelOppOf(d)):'?';const done=['won','lost','void'].includes(d.status);
 ctx.font=font(600,34);ctx.fillStyle=P.text3;ctx.fillText(txt(done?_t("Résultat du duel"):d.status==='active'?_t("Duel en cours"):`${_t("{0} te défie",[me])}`),X,230);
 ctx.font=font(600,56);ctx.fillStyle=P.text;const lines=wrapLines(ctx,txt(duelQ(d)),W-160);let y=300;for(const l of lines.slice(0,3)){ctx.fillText(l,X,y);y+=68;}
 y+=40;const col=[[me,duelSideTxt(d,d.side),d.by==='me'||d.opp?F.usd0(d.stake):F.usd0(d.stake)],[opp,duelSideTxt(d,duelOpp(d.side)),d.oppStake?F.usd0(d.oppStake):'…']];
 col.forEach(([n,s,amt],i)=>{const x=RTL?X-i*(W-160)/2:X+i*(W-160)/2;ctx.font=font(500,30);ctx.fillStyle=P.text3;ctx.fillText(txt(n),x,y);ctx.font=font(600,60);ctx.fillStyle=(i===0?d.side:duelOpp(d.side))==='oui'?P.yes:P.no;ctx.fillText(txt(s),x,y+72);ctx.font=font(600,44);ctx.fillStyle=P.text;ctx.direction='ltr';ctx.fillText(txt(amt),x,y+134);ctx.direction=RTL?'rtl':'ltr';});
 y+=210;ctx.font=font(500,30);ctx.fillStyle=P.text3;ctx.fillText(txt(d.pot?`${_t("Cagnotte {0} · cote du marché à l’acceptation : {1}",[plain(F.usd0(d.pot)),plain(F.c(d.price))])}`:`${_t("Cote actuelle : {0} pour {1}",[plain(F.c(d.price0||50)),duelSideTxt(d,d.side)])}`),X,y);
 if(done){y+=90;ctx.font=font(600,64);ctx.fillStyle=d.status==='void'?P.text:d.winSide==='oui'?P.yes:P.no;ctx.fillText(txt(d.status==='void'?_t("Égalité, mises rendues"):`${_t("{0} remporte {1}",[duelUserN(d.winSide===d.side?d.by:duelOppOf(d)),plain(F.usd0(d.pot))])}`),X,y);
  y+=70;ctx.font=font(500,30);ctx.fillStyle=P.text2;for(const l of wrapLines(ctx,txt(_t("Preuve : ")+(d.proof?d.proof.txt:'')),W-160).slice(0,3)){ctx.fillText(l,X,y);y+=40;}}
 y=H-250;ctx.strokeStyle=P.line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,y-40);ctx.lineTo(W-80,y-40);ctx.stroke();
 ctx.font=font(600,34);ctx.fillStyle=P.text;ctx.fillText(txt(`${_t("Résolution automatique par Wimoro, mises sous séquestre.")}`),X,y+10);
 ctx.font=font(500,28);ctx.fillStyle=P.text3;ctx.fillText(proWrap(ctx,txt(`${_t("Source : {0}{1}",[duelSource(d),''])}`),W-160,1)[0],X,y+62);
 ctx.font=font(600,30);ctx.fillStyle=P.accent;ctx.fillText('wimoro.com',X,y+118);return c;}
/* lien d'invitation : le duel voyage dans l'adresse */
function duelLink(d){const pay={c:d.code,m:d.m,s:d.side,k:d.stake,n:S.me.n,t:d.at,r:d.round||0};return REF.LINK()+'?d='+btoa(unescape(encodeURIComponent(JSON.stringify(pay)))).replace(/=+$/,'');}
function duelFromLink(){try{const q=new URLSearchParams(location.search).get('d');if(!q)return null;const pay=JSON.parse(decodeURIComponent(escape(atob(q))));if(!pay||!pay.m||!pay.s||!pay.k)return null;return pay;}catch(e){return null;}}

/* ---------- Fenêtre « Défier » ---------- */
function duelModalOpen(mid,opp){if(!S.me.logged){needLogin(_t("Connecte-toi pour défier un ami."));return;}S.ui.duel={m:mid||'btc150k',side:'oui',stake:'25',opp:opp||''};openModal(duelModalH(),'wide');}
function duelModalH(){const st=S.ui.duel,isF=st.m.startsWith('flash:'),stake=Math.max(0,F.parse(st.stake)),d={m:st.m,round:S.flash.round};const p=duelPrice(d,st.side),po=duelPrice(d,'oui'),sp=duelSplit(stake||1,p),fee=duelFee(d,st.side,stake||0),fr=friendsOf();
 const mkts=[...MARKETS.filter(m=>!m.creator),...GAMES.filter(g=>g.kind==='dir').slice(0,6).map(g=>({id:'flash:'+g.id,short:`${_t("Éclair : {0}, prochaine manche",[g.name])}`}))];
 return `<div class="md"><div class="md-h"><div><p>${_t("Duel 1 contre 1")}</p><h3>${_t("Défier un ami")}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <div class="field"><label for="dlm">${_t("Marché officiel")}</label><select id="dlm" data-dl="m">${mkts.map(m=>`<option value="${m.id}"${st.m===m.id?' selected':''}>${esc(m.short)}</option>`).join('')}</select></div>
 <div class="sides mt-3 mb-3">${['oui','non'].map(s=>`<button type="button" class="sd ${s}${st.side===s?' on':''}" data-a="dl-side" data-v="${s}">${mxH('dl',s,po)}<span>${duelSideTxt(d,s)}</span><b class="num">${F.c(duelPrice(d,s))}</b></button>`).join('')}</div>
 <div class="cpf"><span class="cpl">${_t("Ta mise (ce que tu engages)")}</span><label class="amt"><input data-dl="stake" inputmode="decimal" value="${esc(st.stake)}" aria-label="${_t("Ta mise")}"><span>$</span></label><div class="presets">${[10,25,50,100].map(v=>`<button type="button" class="btn b-ghost sm${+st.stake===v?' on':''}" data-a="dl-stake" data-v="${v}">${F.usd0(v)}</button>`).join('')}</div></div>
 <div class="calc"><div class="line"><span>${_t("Tu dis <b>{0}</b> à {1}",[duelSideTxt(d,st.side),F.c(p)])}</span><b>${F.usd(stake)}</b></div><div class="line"><span>${_t("Ton ami prendra <b>{0}</b> à {1}",[duelSideTxt(d,duelOpp(st.side)),F.c(100-p)])}</span><b>${F.usd(stake?sp.other:0)}</b></div><div class="line"><span>${_t("Le gagnant remporte")}</span><b class="pl-up">${F.usd(stake?sp.pot:0)}</b></div><div class="line"><span>${_t("Tes frais de marché{0}, chacun paie les siens",[stake?` (${F.pct1(fee/stake)})`:''])}</span><b>${F.usd(fee)}</b></div></div>
 ${fr.length?`<div class="cpf mt-3"><span class="cpl">${_t("Envoyer à")}</span><div class="chips">${fr.map(u=>`<button type="button" class="chip${st.opp===u?' on':''}" data-a="dl-opp" data-v="${u}">${avH(u,18,'span')} ${esc(userOf(u).n)}</button>`).join('')}<button type="button" class="chip${st.opp?'':' on'}" data-a="dl-opp" data-v="">${_t("Lien à partager")}</button></div></div>`:''}
 <p class="sub mt-3">${_t("Les montants définitifs se fixent au prix du marché au moment où ton ami accepte : deux ordres qui se croisent sur le carnet, mises sous séquestre, résultat réglé par Wimoro avec la preuve. {0}",[isF?_t("Manche éclair : ton ami doit accepter avant la fermeture des mises, sinon ta mise est rendue."):_t("Sans réponse sous 48 h, ta mise est rendue.")])}</p>
 <div class="cpm-acts mt-4"><button class="btn b-pri lg" data-a="dl-create"${stake<DUEL.MIN||stake>DUEL.MAX?' disabled':''}>${ic('swords',16,'#fff')} ${st.opp?`${_t("Défier {0}",[esc(duelUserN(st.opp))])}`:_t("Créer le duel et obtenir le lien")}</button></div>
 ${stake&&stake<DUEL.MIN?`<p class="note">${_t("Mise minimale : {0}",[F.usd0(DUEL.MIN)])}</p>`:stake>DUEL.MAX?`<p class="note">${_t("Mise maximale : {0} par duel",[F.usd0(DUEL.MAX)])}</p>`:''}</div>`;}
function duelModalRefresh(){const o=$('#ov .md');if(o){o.outerHTML=duelModalH();fixText($('#ov'));}}
async function duelShareOpen(d){try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}const url=duelCanvas(d).toDataURL('image/png');S.ui.shareImg=url;S.ui.shareTxt=`${_t("{0} te défie sur Wimoro : {1} · {0} dit {2}, {3}. Accepte ici : {4}",[S.me.n,duelQ(d),duelSideTxt(d,d.side),plain(F.usd0(d.stake)),duelLink(d)])}`;
 openModal(`<div class="md shm"><div class="md-h"><div><p>${_t("Duel créé")}</p><h3>${_t("Envoie le défi")}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div><img class="shimg" src="${url}" alt="${_t("Carte du duel")}"><div class="cpm-acts"><button class="btn b-ink lg" data-a="share-send">${_t("{0} Envoyer le lien et l’image",[ic('share',16,'#fff')])}</button><button type="button" class="btn b-white lg" data-a="share-copy">${_t("{0} Copier le lien",[ic('copy',16)])}</button></div><p class="note">${_t("Ton ami ouvre le lien, voit la règle et la source de résolution, et accepte en prenant le camp inverse. Sa mise et la tienne sont alors bloquées sous séquestre.")}</p><a class="btn b-ghost full" href="#duel-${d.id}" data-a="close">${_t("Voir le duel")}</a></div>`,'wide');}

/* ---------- Pages ---------- */
/* C6 : chaque duel de la liste est une carte lisible, dans le style de la page du duel : statut, question, les deux camps
   (avatar, pseudo, camp, mise), puis la cagnotte et l'échéance. */
const duelLeft=t=>{const s=Math.max(0,(t-now())/1000);return s<3600?_t('dans {0} min',[Math.max(1,Math.ceil(s/60))]):s<172800?_t('dans {0} h',[Math.round(s/3600)]):_t('dans {0} j',[Math.round(s/86400)]);};
function duelCardH(d){const g=duelGame(d),m=MK[d.m],done=['won','lost','void','expired','declined'].includes(d.status);const st={open:d.by==='me'?_t('En attente de réponse'):_t('Défi reçu'),active:_t('En cours'),won:_t('Gagné'),lost:_t('Perdu'),void:_t('Annulé'),expired:_t('Expiré'),declined:_t('Décliné')}[d.status];
 const sp=d.status==='open'&&(g||m)?duelSplit(d.stake,duelPrice(d,d.side)):null,amtB=d.oppStake||(sp?sp.other:0),pot=d.pot||(sp?sp.pot:0);
 const side=(u,s,amt)=>`<div class="dc-side ${s}">${u?duelAvH(u,34):'<span class="av" style="width:34px;height:34px;font-size:14px">?</span>'}<b class="dc-n"><bdi>${u?esc(duelUserN(u)):_t('Ton ami')}</bdi>${u?tagH(u):''}</b><span class="dsid">${duelSideTxt(d,s)}</span><b class="num">${amt?F.usd0(amt):'…'}</b></div>`;
 const dl=d.status==='open'&&d.expiresAt?_t('Expire {0}',[duelLeft(d.expiresAt)]):d.status==='active'?(g?_t('Manche {0}',[F.int(d.round)]):m?_t('Clôture : {0}',[m.closeLong]):''):'';
 const res=done&&d.pot&&d.status!=='void'?`<b class="num ${d.status==='won'?'pl-up':'pl-dn'}">${bidi((d.status==='won'?'+':'−')+plain(F.usd(d.status==='won'?d.pot-(d.by==='me'?d.stake:d.oppStake):(d.by==='me'?d.stake:d.oppStake))))}</b>`:'';
 const foot=[pot?`<span>${d.pot?_t('Cagnotte'):_t('Cagnotte si accepté')} <b>${F.usd(pot)}</b></span>`:'',dl?`<span>${esc(dl)}</span>`:'',res].filter(Boolean).join('');
 /* Ordinateur (relecture) : un défi reçu se règle depuis sa carte. Mêmes actions que la page du duel (dl-accept, dl-decline) ;
    le bouton d'acceptation porte la couleur du camp qu'on prend, comme les boutons d'achat d'un marché. */
 const opp=duelOpp(d.side),rep=GRAND()&&S.me.logged&&d.status==='open'&&d.by!=='me'?`<div class="dc-acts"><button class="btn ${opp==='non'?'b-no':'b-yes'}" data-a="dl-accept" data-id="${d.id}">${_t("Accepter {0} ({1})",[amtB?F.usd0(amtB):'…',duelSideTxt(d,opp)])}</button><button class="btn b-ghost" data-a="dl-decline" data-id="${d.id}">${_t("Refuser")}</button></div>`:'';
 return `<div class="dcard ${d.status}" data-href="#duel-${d.id}"><div class="dc-h"><span class="dc-st">${st}</span><small>${ago(d.settleAt||d.acceptAt||d.at)}</small></div><a class="dc-q" href="#duel-${d.id}">${esc(duelQ(d))}</a><div class="dc-vs">${side(d.by,d.side,d.stake)}<i>vs</i>${side(d.opp,opp,amtB)}</div>${foot?`<div class="dc-f">${foot}</div>`:''}${rep}</div>`;}
/* Ordinateur : « Défier un ami » et « Duel de stack » sur la ligne de la sous-navigation des jeux ; les duels en grille de
   cartes (deux ou trois par ligne) ; les duels de stack et la règle dans la colonne latérale, qui reste visible. */
function vDuels(){const act=duelActive(),mine=duelOpenMine(),inc=duelIncoming(),done=duelDone(),stacks=stacksAll();const tab=S.ui.dtab||'cours';
 if(GRAND())return duelsOrdiH(inc,mine,act,done,stacks);
 const list=tab==='cours'?[...inc,...mine,...act]:done;
 return `<div class="wrap jx jx-duels"><div class="pagehead"><div><nav class="crumbs"><a href="#profil">${_t("Ton profil")}</a><span>/</span><span>${_t("Mes duels")}</span></nav><h1 class="vhid">${_t("Mes duels")}</h1></div><div class="hbtns"><button class="btn b-pri" data-a="duel-open">${_t("{0} Défier un ami",[ic('swords',16,'#fff')])}</button><button class="btn b-white" data-a="stack-open">${_t("{0} Duel de stack",[ic('layers',16)])}</button></div></div>
 <div class="g-side"><div class="col"><section class="pn dl-main"><div class="ph" style="padding:16px 20px 0"><div class="tabs utabs">${[['cours',_t("En cours")],['fini',_t("Terminés")]].map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="dtab" data-v="${k}">${l}</button>`).join('')}</div></div>
 <div class="pad dl-list">${list.length?list.map(duelCardH).join(''):`<div class="empty">${tab==='cours'?_t("Aucun duel en cours. Défie un ami depuis un marché ou d’ici."):_t("Aucun duel terminé pour l’instant.")}${tab==='cours'?`<div class="emp-a"><button class="btn b-white sm" data-a="duel-open">${_t("{0} Défier un ami",[ic('swords',14)])}</button></div>`:''}</div>`}</div></section></div>
 <aside class="col rail-fixe"><section class="pn pad"><div class="h2">${_t("Duels de stack")}</div><p class="sub mt-1">${_t("Une semaine sur tous les marchés : le plus gros stack remporte la cagnotte (frais {0}).",[F.pct(DUEL.STACK_FEE*100)])}</p>
 ${stacks.length?stacks.map(stackCardH).join(''):`<div class="empty p-4-0">${_t("Aucun duel de stack")}</div>`}
 </section><section class="pn pad"><div class="h2 mb-4">${_t("Comment ça marche")}</div>${duelReglesH()}</section></aside></div></div>`;}
/* une carte de duel de stack (colonne latérale des duels) */
const stackCardH=s=>`<div class="stk ${s.status}"><div class="stk-h"><b>${esc(duelUserN('me'))} vs ${esc(duelUserN(s.opp))}</b><small>${s.status==='active'?`${_t("Fin {0}",[new Date(s.endAt).toLocaleDateString(LOC,{day:'numeric',month:'short'})])}`:{won:_t("Gagné"),lost:_t("Perdu"),void:_t("Égalité")}[s.status]}</small></div><div class="stk-b"><div><small>${_t("Ton stack")}</small><b class="num ${s.my>=s.theirs?'pl-up':''}">${F.int(s.my)}</b></div><div><small>${esc(duelUserN(s.opp))}</small><b class="num ${s.theirs>s.my?'pl-up':''}">${F.int(s.theirs)}</b></div><div><small>${_t("Cagnotte")}</small><b class="num">${F.usd0(s.buyin*2*(1-DUEL.STACK_FEE))}</b></div></div></div>`;
const duelReglesH=()=>`<ol class="steps"><li>${_t("Choisis un marché officiel, ton camp et ta mise.")}</li><li>${_t("Ton ami accepte en prenant le camp inverse ; les cotes du marché fixent les montants.")}</li><li>${_t("Les deux mises sont bloquées sous séquestre Wimoro.")}</li><li>${_t("À la résolution, le gagnant reçoit la cagnotte et la preuve s’affiche sur la carte.")}</li></ol>`;
/* Ordinateur (relecture) : les défis reçus en tête, avec leurs boutons ; les duels terminés sous ceux en cours, plutôt que
   derrière un onglet ; « Défier un ami » et « Duel de stack » en tête du contenu, hors de la ligne de la sous-navigation
   (qui garde ainsi la même hauteur sur les quatre pages des jeux) ; la règle repliée dans la colonne latérale. */
function duelsOrdiH(inc,mine,act,done,stacks){const cours=[...inc,...mine,...act];
 const bloc=(titre,L,vide,acts)=>`<section class="pn dl-main"><div class="dl-tete"><h2 class="h2">${titre}${L.length?` <span class="num dl-n">${F.int(L.length)}</span>`:''}</h2>${acts||''}</div><div class="pad dl-list">${L.length?L.map(duelCardH).join(''):`<div class="empty">${vide}</div>`}</div></section>`;
 return `<div class="wrap jx jx-duels"><h1 class="vhid">${_t("Mes duels")}</h1>
 <div class="g-side"><div class="col">${bloc(_t("En cours"),cours,_t("Aucun duel en cours. Défie un ami depuis un marché ou d’ici."),`<div class="hbtns"><button class="btn b-pri" data-a="duel-open">${_t("{0} Défier un ami",[ic('swords',16)])}</button><button class="btn b-white" data-a="stack-open">${_t("{0} Duel de stack",[ic('layers',16)])}</button></div>`)}${done.length?bloc(_t("Terminés"),done,''):''}</div>
 <aside class="col rail-fixe"><section class="pn pad"><div class="h2">${_t("Duels de stack")}</div><p class="sub mt-1">${_t("Une semaine sur tous les marchés : le plus gros stack remporte la cagnotte (frais {0}).",[F.pct(DUEL.STACK_FEE*100)])}</p>
 ${stacks.length?stacks.map(stackCardH).join(''):`<div class="empty p-4-0">${_t("Aucun duel de stack")}</div>`}</section>
 <section class="pn pad"><details class="tdet dl-regle"><summary>${_t("Comment ça marche")}</summary>${duelReglesH()}</details></section></aside></div></div>`;}
function vDuel(id){let d=duelOf(id);if(!d){const pay=S.ui.duelLink;if(pay&&(pay.c===id||id==='lien')){d={id:'lien',code:pay.c,kind:'market',m:pay.m,round:pay.r||0,side:pay.s,by:pay.n,opp:null,stake:pay.k,status:'open',at:pay.t||now(),price0:0,fromLink:true};}}
 if(!d)return `<div class="wrap jx jx-duel"><div class="pagehead"><div><h1 class="ptitle">${_t("Duel introuvable")}</h1><p class="plead">${_t("Ce duel n’existe plus, ou il a déjà été réglé.")}</p></div></div><a class="btn b-ink" href="#duels">${_t("Mes duels")}</a></div>`;
 const g=duelGame(d),m=MK[d.m],mine=duelMySide(d),opp=duelOppOf(d),p=duelPrice(d,d.side),sp=duelSplit(d.stake,p),canAccept=d.status==='open'&&d.by!=='me',done=['won','lost','void','expired','declined'].includes(d.status);
 const steps=[[_t("Défi lancé"),true],[_t("Accepté, mises sous séquestre"),d.status!=='open'&&d.status!=='expired'&&d.status!=='declined'],[_t("Résolution par Wimoro"),done&&d.status!=='expired'&&d.status!=='declined']];
 return `<div class="wrap jx jx-duel"><div class="pagehead"><div><nav class="crumbs"><a href="#duels">${_t("Mes duels")}</a><span>/</span><span>${_t("Duel")}</span></nav><h1 class="ptitle">${esc(duelShort(d))}</h1><p class="plead">${esc(duelQ(d))}</p></div></div>
 <div class="g-side"><div class="col"><section class="pn pad"><div class="dvs">${[[d.by,d.side,d.stake],[d.opp,duelOpp(d.side),d.oppStake||(d.status==='open'?sp.other:0)]].map(([u,s,amt],i)=>`<div class="dside ${s}"><div class="dav">${u?duelAvH(u,56):'<span class="av" style="width:56px;height:56px;font-size:22px">?</span>'}</div><b>${u?esc(duelUserN(u)):_t("Ton ami")}${u?tagH(u):''}</b><span class="dsid">${duelSideTxt(d,s)}</span><b class="num">${F.usd(amt)}</b><small>${_t('à {0}',[F.c(i===0?(d.price||p):100-(d.price||p))])}</small>${done&&d.winSide===s?`<span class="dwin">${_t('Gagnant')}</span>`:''}</div>`).join('<div class="dvs-x">vs</div>')}</div>
 <div class="dsteps">${steps.map(([l,ok])=>`<span class="${ok?'ok':''}">${ic(ok?'check':'info',14)} ${l}</span>`).join('')}</div>
 ${d.pot?`<div class="calc mt-4"><div class="line"><span>${_t("Cagnotte sous séquestre")}</span><b>${F.usd(d.pot)}</b></div><div class="line"><span>${_t("Prix du marché à l’acceptation")}</span>${_t("<b>{0} pour {1}</b>",[F.c(d.price),duelSideTxt(d,d.side)])}</div>${done&&d.status!=='void'?`<div class="line"><span>${_t("Résultat")}</span><b class="${d.status==='won'?'pl-up':'pl-dn'}">${d.status==='won'?'+':'−'}${F.usd(d.status==='won'?d.pot-(d.by==='me'?d.stake:d.oppStake):(d.by==='me'?d.stake:d.oppStake))}</b></div>`:''}</div>`:''}
 ${d.proof?`<div class="dproof">${_t("<b>{0} Preuve de résolution</b>",[ic('shield',14)])}<p>${esc(d.proof.txt)}</p><small>${esc(d.proof.src||duelSource(d))} · ${fmtDT(d.proof.at)}</small></div>`:''}
 ${canAccept&&!S.me.logged?`<div class="dacc"><p>${_t("{0} te défie : il dit <b>{1}</b> pour {2}. Connecte-toi ou crée ton compte pour prendre le camp <b>{3}</b>.",[esc(duelUserN(d.by)),duelSideTxt(d,d.side),F.usd0(d.stake),duelSideTxt(d,duelOpp(d.side))])}</p><div class="hbtns"><a class="btn b-pri lg" href="#connexion" data-a="dl-login">${_t("{0} Se connecter pour accepter",[ic('user',16,'#fff')])}</a></div></div>`:''}
 ${canAccept&&S.me.logged?`<div class="dacc"><p>${_t("Tu prends le camp <b>{0}</b> à {1} : tu engages <b>{2}</b> (+ {3} de frais). Le gagnant remporte <b>{4}</b>.",[duelSideTxt(d,duelOpp(d.side)),F.c(100-p),F.usd(sp.other),F.usd(duelFee(d,duelOpp(d.side),sp.other)),F.usd(sp.pot)])}</p><div class="hbtns"><button class="btn b-pri lg" data-a="dl-accept" data-id="${d.id}">${_t("{0} Accepter le duel",[ic('swords',16,'#fff')])}</button><button class="btn b-white lg" data-a="dl-decline" data-id="${d.id}">${_t("Refuser")}</button></div></div>`:''}
 ${d.status==='open'&&d.by==='me'?`<div class="hbtns mt-4"><button class="btn b-ink" data-a="dl-share" data-id="${d.id}">${_t("{0} Envoyer le lien",[ic('share',16,'#fff')])}</button><button class="btn b-white" data-a="dl-cancel" data-id="${d.id}">${_t("Annuler, récupérer ma mise")}</button></div>`:''}
 ${done||d.status==='active'?`<div class="hbtns mt-4"><button class="btn b-white" data-a="dl-share" data-id="${d.id}">${_t("{0} Partager la carte",[ic('share',16)])}</button></div>`:''}</section></div>
 <aside class="col rail-fixe"><section class="pn pad"><div class="h2">${_t("Règle du marché")}</div><p class="sub mt-2">${esc(duelSource(d))}</p>${g?`<p class="sub">${_t("Manche {0} : {1}",[F.int(d.round),esc(g.q)])}</p>`:m?`<p class="sub">${_t("Clôture : {0}",[esc(m.closeLong)])} <a class="link" href="#marche-${m.id}">${_t("Voir le marché")}</a></p>`:''}</section>
 <section class="pn pad"><div class="h2">${_t("Séquestre et résolution")}</div><p class="sub mt-2">${_t("Les deux mises sont bloquées par Wimoro dès l’acceptation. Personne ne décide du résultat : le duel suit la résolution du marché, et la preuve (prix relevé, résultat officiel) s’affiche ici et sur la carte.")}</p></section></aside></div></div>`;}
/* les adversaires proposés : ses amis ; sans ami, quelques joueurs (en mode Compte : des joueurs simulés, les seuls qu'on peut défier sans leur accord) */
const stackAdversaires=()=>{const fr=friendsOf();if(fr.length)return fr;return (SRV()?USER_IDS.filter(u=>USERS[u]&&USERS[u].bot):USER_IDS).slice(0,4);};
function stackModalOpen(){if(!S.me.logged){needLogin(_t("Connecte-toi pour lancer un duel de stack."));return;}const fr=stackAdversaires();S.ui.stack={buyin:'25',opp:fr[0]||''};openModal(stackModalH());}
function stackModalH(){const st=S.ui.stack,fr=stackAdversaires(),b=F.parse(st.buyin)||0;return `<div class="md"><div class="md-h"><div><p>${_t("Duel de stack")}</p><h3>${_t("Une semaine, tous les marchés")}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <p class="sub">${_t("Même buy-in, {0} jetons virtuels chacun. Ton stack suit tes résultats réels pendant 7 jours (1 jeton = 1 $ de résultat). Le plus gros stack à la fin remporte la cagnotte, frais {1}.",[F.int(DUEL.STACK_CHIPS),F.pct(DUEL.STACK_FEE*100)])}</p>
 <div class="cpf"><span class="cpl">${_t("Buy-in")}</span><div class="presets">${[10,25,50,100].map(v=>`<button type="button" class="btn b-ghost sm${+st.buyin===v?' on':''}" data-a="stk-buyin" data-v="${v}">${F.usd0(v)}</button>`).join('')}</div></div>
 <div class="cpf"><span class="cpl">${_t("Adversaire")}</span><div class="chips">${fr.map(u=>`<button type="button" class="chip${st.opp===u?' on':''}" data-a="stk-opp" data-v="${u}">${avH(u,18,'span')} ${esc(userOf(u).n)}</button>`).join('')}</div></div>
 <div class="calc"><div class="line"><span>${_t("Cagnotte")}</span><b>${F.usd(b*2)}</b></div><div class="line"><span>${_t("Le gagnant reçoit")}</span><b class="pl-up">${F.usd(b*2*(1-DUEL.STACK_FEE))}</b></div></div>
 <div class="cpm-acts mt-4"><button class="btn b-pri lg" data-a="stk-create">${_t("{0} Lancer le duel de stack",[ic('layers',16,'#fff')])}</button></div></div>`;}
function stackModalRefresh(){const o=$('#ov .md');if(o){o.outerHTML=stackModalH();fixText($('#ov'));}}

Object.assign(VIEWS,{duels:vDuels,duel:vDuel});PROTECTED.add('duels');TITLES.duels=_t("Mes duels");TITLES.duel=_t("Duel");
Object.assign(ACT,{
 'duel-open':a=>duelModalOpen(a.dataset.m||(curMarket()?curMarket().id:'btc150k'),a.dataset.u||''),
 'dl-side':a=>{S.ui.duel.side=a.dataset.v;duelModalRefresh();},
 'dl-stake':a=>{S.ui.duel.stake=a.dataset.v;duelModalRefresh();},
 'dl-opp':a=>{S.ui.duel.opp=a.dataset.v;duelModalRefresh();},
 'dl-create':()=>{const st=S.ui.duel,stake=F.parse(st.stake);if(SRV()){srvDuelCreer(st);return;}const d=duelCreate(st.m,st.side,stake,st.opp);if(!d)return;closeModal();if(st.opp){toast({tone:'blue',icon:'swords',force:true,title:`${_t("Défi envoyé à {0}",[duelUserN(st.opp)])}`,text:`${_t("{0} : tu dis {1} pour {2}. Ta mise est bloquée sous séquestre.",[duelShort(d),duelSideTxt(d,d.side),F.usd0(stake)])}`,href:'#duel-'+d.id});if((S.ui.route||'').startsWith('duel'))render(false);}else duelShareOpen(d);},
 'dl-share':a=>{const d=duelOf(a.dataset.id);if(d)duelShareOpen(d);},
 'dl-cancel':a=>{const d=duelOf(a.dataset.id);if(!d||d.status!=='open'||d.by!=='me')return;if(SRV()){srvDuelFermer(d,'cancel');return;}duelRefund(d,'declined');d.status='expired';toast({icon:'check',title:_t("Duel annulé"),text:_t("Ta mise est de retour sur ton solde.")});render(false);},
 'dl-accept':a=>{if(SRV()){srvDuelAccepter(a.dataset.id);return;}let d=duelOf(a.dataset.id);if(!d&&S.ui.duelLink){const pay=S.ui.duelLink;d={id:'d'+now().toString(36)+Math.floor(R()*999),code:pay.c,kind:'market',m:pay.m,round:pay.r||S.flash.round,side:pay.s,by:pay.n,opp:'me',stake:pay.k,fee:0,status:'open',at:pay.t||now(),expiresAt:now()+DUEL.EXPIRE,price0:0};duelsAll().unshift(d);S.ui.duelLink=null;}
  if(!d)return;if(duelAccept(d,'me')){toast({tone:'blue',icon:'swords',force:true,title:_t("Duel accepté"),text:`${_t("Tu dis {0} pour {1}. Cagnotte {2} sous séquestre.",[duelSideTxt(d,duelMySide(d)),F.usd(d.oppStake),F.usd(d.pot)])}`,href:'#duel-'+d.id});notif('swords',`${_t("Tu as accepté le duel de {0} : {1}.",[duelUserN(d.by),duelShort(d)])}`,'#duel-'+d.id);gainXP(5);location.hash='#duel-'+d.id;render(false);}},
 'dl-login':()=>{S.ui.after=location.hash;S.ui.authNote=_t("Connecte-toi pour accepter le duel.");},
 'dl-decline':a=>{const d=duelOf(a.dataset.id);if(SRV()&&d){srvDuelFermer(d,'decline');return;}if(d){d.status='declined';d.settleAt=now();save();}else S.ui.duelLink=null;toast({icon:'check',title:_t("Duel refusé")});location.hash='#duels';},
 dtab:a=>{S.ui.dtab=a.dataset.v;render(false);},
 'stack-open':()=>stackModalOpen(),
 'stk-buyin':a=>{S.ui.stack.buyin=a.dataset.v;stackModalRefresh();},
 'stk-opp':a=>{S.ui.stack.opp=a.dataset.v;stackModalRefresh();},
 'stk-create':()=>{const st=S.ui.stack;if(SRV()){srvStackCreer(st);return;}const d=stackCreate(F.parse(st.buyin),st.opp);if(!d)return;closeModal();toast({tone:'blue',icon:'layers',force:true,title:_t("Duel de stack lancé"),text:`${_t("{0} chacun contre {1}, {2} jetons, une semaine.",[F.usd0(d.buyin),duelUserN(d.opp),F.int(DUEL.STACK_CHIPS)])}`,href:'#duels'});render(false);}
});
document.addEventListener('input',e=>{const i=e.target.closest('[data-dl]');if(!i||!S.ui.duel)return;S.ui.duel[i.dataset.dl]=i.value;if(i.dataset.dl==='m'||i.dataset.dl==='stake'){const f=document.activeElement===i&&i.dataset.dl==='stake';if(!f)duelModalRefresh();else{const o=$('#ov .calc');if(o){const tmp=document.createElement('div');tmp.innerHTML=duelModalH();const nc=tmp.querySelector('.calc');if(nc)o.outerHTML=nc.outerHTML;const btn=$('#ov [data-a="dl-create"]'),nb=tmp.querySelector('[data-a="dl-create"]');if(btn&&nb)btn.disabled=nb.disabled;}}}});
document.addEventListener('change',e=>{const i=e.target.closest('select[data-dl]');if(i&&S.ui.duel){S.ui.duel.m=i.value;duelModalRefresh();}});

/* ---------- Démo : duels passés et lien ouvert ---------- */
/* textes de démo, recalculés dans la langue courante */
const DSEED_TXT=()=>({d1:_t('Départ 97 388,20 $, arrivée 97 455,10 $ (+0,07 %).'),d2:_t('Départ 3 486,40 $, arrivée 3 481,90 $ (−0,13 %).'),n4:_t('lea te défie : Ethereum à 6 000 $, lea dit Non pour 30 $.')});
function duelSeed(){if(!S.me.logged||S.me.n!=='User26')return;const T=DSEED_TXT();
 if(S.me.duelSeeded){if(S.me.duelSeedLang!==LANG){const a=duelOf('dseed1'),b=duelOf('dseed2');if(a&&a.proof)a.proof.txt=T.d1;if(b&&b.proof)b.proof.txt=T.d2;const n=S.me.notifs.find(x=>x.href==='#duel-dseed4');if(n)n.text=T.n4;S.me.duelSeedLang=LANG;save();}return;}
 S.me.duelSeeded=true;S.me.duelSeedLang=LANG;const t=now();
 duelsAll().push({id:'dseed1',code:'DSEED1',kind:'market',m:'flash:btc',round:S.flash.round-9,side:'oui',by:'me',opp:'lea',stake:25,fee:.6,price:52,oppStake:23.08,pot:48.08,status:'won',winSide:'oui',at:t-26*60000,acceptAt:t-25*60000,settleAt:t-24*60000,proof:{txt:T.d1,at:t-24*60000}});
 duelsAll().push({id:'dseed2',code:'DSEED2',kind:'market',m:'flash:eth',round:S.flash.round-31,side:'non',by:'maxou',opp:'me',stake:20,fee:0,price:47,oppStake:22.55,pot:42.55,status:'lost',winSide:'non',at:t-3*3600e3,acceptAt:t-3*3600e3+40000,settleAt:t-3*3600e3+90000,proof:{txt:T.d2,at:t-3*3600e3+90000}});
 duelsAll().push({id:'dseed3',code:'DSEED3',kind:'market',m:'clasico',round:0,side:'oui',by:'me',opp:'jules',stake:50,fee:1.2,price:54,oppStake:42.59,pot:92.59,status:'active',at:t-2*86400e3,acceptAt:t-2*86400e3+600000});
 duelsAll().push({id:'dseed4',code:'DSEED4',kind:'market',m:'eth6000',round:0,side:'non',by:'lea',opp:'me',stake:30,fee:0,status:'open',at:t-20*60000,expiresAt:t+46*3600e3,price0:72});
 stacksAll().push({id:'sseed1',kind:'stack',buyin:25,opp:'maxou',status:'won',at:t-9*86400e3,endAt:t-2*86400e3,settleAt:t-2*86400e3,ref:0,my:1184,theirs:962,path:[1000,1040,1010,1090,1150,1120,1184],opath:[1000,990,1030,1005,940,970,962]});
 S.me.duelWins=1;S.me.notifs.unshift({id:t+R(),ic:'swords',text:T.n4,href:'#duel-dseed4',at:t-20*60000,read:false});save();}
const duelLinkBoot=()=>{const pay=duelFromLink();if(!pay)return;S.ui.duelLink=pay;try{history.replaceState(null,'',location.pathname+'#duel-lien');}catch(e){}location.hash='#duel-lien';};

