/* WIMORO — blitz module */

'use strict';
/* =====================================================================================
 *  Blitz : manches de 60 secondes enchaînées, deux modes sur le même moteur de prix
 *  ------------------------------------------------------------------------------------
 *  Blitz Royale (multijoueur) : buy-in, tout le monde dans la même salle, une manche
 *    de 60 s toutes les minutes sur le même événement en direct (bougie BTC/ETH…),
 *    choix Haut / Bas / Break even. Ceux qui ont faux sont éliminés ; après 10 manches
 *    les survivants se partagent la cagnotte. Personne ne survit : la cagnotte est
 *    reportée sur le Blitz suivant. Éliminé = spectateur, avec le chat. Un seul rachat,
 *    dans les limites de jeu responsable. La cagnotte = la somme des entrées : Wimoro
 *    n'est jamais exposé (commission 5 % sur la cagnotte distribuée).
 *    Rythme réel : un Blitz par heure, 24 h/24, prime time à 21 h (buy-in 25 $).
 *    Démo : un Blitz toutes les 10 minutes pour pouvoir jouer tout de suite.
 *  La Série (solo) : une mise, chaque bonne prédiction de 60 s multiplie le stack
 *    (manche éclair ordinaire jouée avec tout le stack, adossée au marché) ; entre
 *    deux manches : Encaisser ou Continuer. Break even = manche all-in à grosse cote.
 * ===================================================================================== */
const BZ={ROUNDS:10,ROUND_MS:60000,CHOICE_MS:30000,PAUSE_MS:10000,BUYIN:10,PRIME_BUYIN:25,REBUY:50,PRIME_H:21,RAKE:.05,LOBBY_MS:75000,PERIOD_MS:600000,GID:'btc',BOTS:[1900,3100],SHOW:14};
/* fenêtre de choix : les 30 premières secondes de la manche */
const bzOpen=r=>r.state==='live'&&!r.between&&now()<r.rStart+BZ.CHOICE_MS;
const bzGame=()=>GM[BZ.GID];
S.bz={royale:null,jackpot:0,history:[]};
const bzR=()=>S.bz.royale;
const bzAlive=r=>r.bots.filter(b=>b.alive).length+(r.me&&r.me.alive?1:0);
const bzPot=r=>r.pot;
const bzShare=r=>{const n=bzAlive(r);return n?r.pot*(1-BZ.RAKE)/n:0;};
const bzIsPrime=t=>new Date(t).getHours()===BZ.PRIME_H;
/* nouveau Blitz : salle d'attente ouverte, les joueurs arrivent peu à peu */
function bzNew(startAt){const prime=bzIsPrime(startAt);const r={id:'bz'+startAt.toString(36),state:'lobby',startAt,prime,buyin:prime?BZ.PRIME_BUYIN:BZ.BUYIN,carried:S.bz.jackpot,pot:S.bz.jackpot,bots:[],me:null,round:0,rStart:0,rEnd:0,p0:0,log:[],target:BZ.BOTS[0]+Math.floor(R()*(BZ.BOTS[1]-BZ.BOTS[0]))*(prime?2:1)};S.bz.jackpot=0;S.bz.royale=r;return r;}
function bzBotJoin(r,n){const ids=USER_IDS.filter(u=>!r.bots.some(b=>b.u===u));for(let i=0;i<n;i++){const u=ids.length?ids.splice(Math.floor(R()*ids.length),1)[0]:'bot'+(r.bots.length+1);r.bots.push({u,alive:true,rebuy:false,choice:null});r.pot+=r.buyin;}}
function bzJoin(){const r=bzR();if(!r||r.state!=='lobby'||!S.me.logged)return false;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return false;if(r.me)return false;
 if(r.buyin>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return false;}
 S.me.balance-=r.buyin;r.pot+=r.buyin;r.me={alive:true,rebuy:false,choice:null,paid:r.buyin};S.me.played++;S.me.bzPlayed=(S.me.bzPlayed||0)+1;updateHeader();save();gainXP(10);
 toast({tone:'blue',icon:'bolt',force:true,title:_t("Inscrit au Blitz Royale"),text:`${_t("Buy-in {0}. Départ dans {1} s, 10 manches de 60 secondes.",[F.usd0(r.buyin),Math.max(1,Math.round((r.startAt-now())/1000))])}`});return true;}
const bzCanRebuy=r=>!!(r&&r.state==='live'&&r.between&&r.round===1&&r.me&&!r.me.alive&&!r.me.rebuy&&r.me.outRound===1);
function bzRebuy(){const r=bzR();if(!bzCanRebuy(r))return false;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return false;
 if(BZ.REBUY>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return false;}
 S.me.balance-=BZ.REBUY;r.pot+=BZ.REBUY;r.me.alive=true;r.me.rebuy=true;r.me.choice=null;r.me.paid+=BZ.REBUY;updateHeader();save();bzRefresh();toast({tone:'blue',icon:'bolt',force:true,title:_t("Rachat accepté"),text:`${_t("{0} ajoutés à la cagnotte. Tu reviens en jeu à la manche {1}. C’était ton seul rachat.",[F.usd0(BZ.REBUY),r.round+1])}`});return true;}
function bzChoose(c){const r=bzR();if(!r||r.state!=='live'||!r.me||!r.me.alive||r.between)return;if(!bzOpen(r)){toast({tone:'amber',icon:'lock',title:_t("Choix fermés"),text:`${_t("Le choix se fait dans les {0} premières secondes de la manche.",[BZ.CHOICE_MS/1000])}`});return;}if(SRV()){srvBzChoisir(c);return;}r.me.choice=c;bzRefresh();}
/* résultat d'une manche : prix de fin contre prix de départ, bande break even du jeu */
function bzOutcome(r){const d=bzGame(),g=G(d.id),m=Math.abs(g.price/r.p0-1);if(m<=d.be)return 2;return g.price>r.p0?1:0;}
function bzStartRound(r){const g=G(BZ.GID);r.round++;r.rStart=now();r.rEnd=r.rStart+BZ.ROUND_MS;r.p0=g.price;r.path=[g.price];r.closed=false;r.bots.forEach(b=>{if(b.alive)b.choice=null;});if(r.me)r.me.choice=null;r.pend=r.p0;}
function bzBotChoices(r){const g=G(BZ.GID),up=g.price>r.p0;for(const b of r.bots){if(!b.alive||b.choice!==null)continue;if(R()<.08)continue;const x=R();b.choice=x<.04?2:x<.5+(up?.08:-.08)?1:0;}}
function bzEndRound(r){const out=bzOutcome(r),g=G(BZ.GID);let gone=0;for(const b of r.bots){if(b.alive&&b.choice!==out){b.alive=false;gone++;}}
 const meWas=r.me&&r.me.alive;if(r.me&&r.me.alive&&r.me.choice!==out){r.me.alive=false;r.me.outRound=r.round;gone++;}
 r.log.unshift({round:r.round,out,p0:r.p0,p1:g.price,gone,alive:bzAlive(r)});
 const lab=out===2?_t("Break even"):out===1?_t("Haut"):_t("Bas");
 if(r.me){if(meWas&&!r.me.alive){toast({tone:'red',icon:'bolt',flash:true,title:`${_t("Éliminé à la manche {0}",[r.round])}`,text:`${_t("C’était {0}. {1}",[lab,r.round===1&&!r.me.rebuy?`${_t("Rachat possible à {0} avant la manche 2.",[F.usd0(BZ.REBUY)])}`:_t("Tu restes en spectateur.")])}`,href:'#blitz'});}
  else if(r.me.alive)toast({tone:'green',icon:'bolt',flash:true,title:`${_t("Manche {0} : tu survis",[r.round])}`,text:`${_t("{0}. {1} en vie, ta part : {2}.",[lab,F.int(bzAlive(r)),F.usd(bzShare(r))])}`,href:'#blitz'});}
 addMsg('blitz',mkMsg({k:'evt',text:`${_t("Manche {0} : {1}. {2} éliminé{3}, {4} encore en vie.",[r.round,lab,gone,gone>1?'s':'',bzAlive(r)])}`}));
 if(r.round>=BZ.ROUNDS||bzAlive(r)===0)bzFinish(r);else{r.between=now()+BZ.PAUSE_MS;}}
function bzFinish(r){r.state='done';r.endAt=now();const alive=bzAlive(r);
 if(alive===0){S.bz.jackpot=r.pot;r.result='carry';addMsg('blitz',mkMsg({k:'evt',text:`${_t("Personne n’a survécu : {0} reportés sur le prochain Blitz.",[F.usd0(r.pot)])}`}));}
 else{const each=r.pot*(1-BZ.RAKE)/alive;r.result='paid';r.each=each;if(r.me&&r.me.alive){const before=myRank();S.me.balance+=each;S.me.wins++;S.me.settled++;S.me.realized+=each-r.me.paid;S.me.bzWins=(S.me.bzWins||0)+1;S.me.history.unshift({k:'blitz',q:`${_t("Blitz Royale : survivant sur {0}",[F.int(r.bots.length+1)])}`,s:'oui',win:true,pnl:each-r.me.paid,at:now()});gainXP(80);toast({tone:'green',icon:'trophy',force:true,title:`${_t("Blitz gagné : +{0}",[F.usd(each-r.me.paid)])}`,text:`${_t("{0} survivant{1} se partagent {2}.",[alive,alive>1?'s':'',F.usd0(r.pot)])}`,href:'#blitz'});confetti(60);checkRank(before);checkBadges();}
  else if(r.me){S.me.settled++;S.me.realized-=r.me.paid;S.me.history.unshift({k:'blitz',q:`${_t("Blitz Royale : éliminé")}`,s:'non',win:false,pnl:-r.me.paid,at:now()});}
  addMsg('blitz',mkMsg({k:'evt',text:`${_t("Fin du Blitz : {0} survivant{1}, {2} chacun.",[alive,alive>1?'s':'',F.usd(each)])}`}));}
 S.bz.history.unshift({id:r.id,at:r.endAt,pot:r.pot,players:r.bots.length+(r.me?1:0),alive,each:r.each||0,me:r.me?(r.me.alive?'won':'lost'):null,prime:r.prime});S.bz.history=S.bz.history.slice(0,8);save();
 const next=bzNextSlot();setTimeout(()=>{if(S.bz.royale===r)bzNew(next);bzRefresh();},6000);}
/* créneaux : toutes les 10 min en démo (toutes les heures en réel), prime time à 21 h */
function bzNextSlot(){const t=now();return t+BZ.PERIOD_MS-(t%BZ.PERIOD_MS)+BZ.LOBBY_MS;}
function bzTick(){let r=bzR();if(!r){r=bzNew(now()+BZ.LOBBY_MS);}
 if(r.state==='lobby'){const want=Math.min(r.target,Math.round(r.target*(1-Math.max(0,r.startAt-now())/(BZ.LOBBY_MS+BZ.PERIOD_MS))));if(r.bots.length<want)bzBotJoin(r,Math.min(want-r.bots.length,6+Math.floor(R()*18)));
  if(now()>=r.startAt){const min=Math.round(r.target*.88);if(r.bots.length<min)bzBotJoin(r,min-r.bots.length);r.state='live';addMsg('blitz',mkMsg({k:'evt',text:`${_t("Le Blitz commence : {0} joueurs, cagnotte {1}.",[F.int(r.bots.length+(r.me?1:0)),F.usd0(r.pot)])}`}));bzStartRound(r);}}
 else if(r.state==='live'){if(r.between){if(now()>=r.between){r.between=0;bzStartRound(r);}}else{if(bzOpen(r)){if(R()<.2)bzBotChoices(r);}else if(!r.closed){r.closed=true;bzBotChoices(r);bzRefresh();}if(now()>=r.rEnd)bzEndRound(r);}}
 bzRefresh(true);}
/* le chemin de prix des manches (Blitz, Série) suit le tick éclair de 250 ms : même graphique que l'Éclair */
{const flashTick0=flashTick;flashTick=function(){flashTick0();const r=bzR();if(r&&r.state==='live'&&!r.between){(r.path||(r.path=[r.p0])).push(G(BZ.GID).price);if(r.path.length>BZ.ROUND_MS/250+8)r.path.shift();}const s=typeof serieCur==='function'?serieCur():null;if(s&&s.state==='running'){(s.path||(s.path=[s.p0])).push(G(s.gid).price);if(s.path.length>SERIE.ROUND_MS/250+8)s.path.shift();}};}
/* ---------- Graphique de la manche : même rendu que l'Éclair (courbe ou bougies, zone break even, départ) ---------- */
function roundChartSvg(d,p0,path,durMs){return flashChart(false,d,{path:path&&path.length?path:[p0],start:p0,dur:durMs});}
const roundToolsH=()=>`<div class="chtools fl">${ctypeSeg()}<span class="cdur" data-cdur="flash">${cdurH('flash')}</span></div>`;
/* volume de la manche du Blitz : ce que les joueurs encore en vie ont choisi */
function bzVolH(r){const L=[...(r.me&&r.me.alive?[r.me]:[]),...r.bots.filter(b=>b.alive)];let o=0,e=0,n=0,u=0;for(const p of L){if(p.choice===1)o++;else if(p.choice===2)e++;else if(p.choice===0)n++;else u++;}const ch=o+e+n||1,P=v=>Math.round(v/ch*100);
 return `<div class="trh">${_t("<b>Volume de la manche</b>")}<span class="sub">${u?`${_t("{0} en vie n’ont pas encore choisi",[F.int(u)])}`:`${_t("{0} choix",[F.int(ch)])}`}</span></div><div class="pl2"><span class="up">${_t("Haut <b>{0}</b> · {1}",[F.int(o),F.pct(P(o))])}</span><span class="eqp">${_t("Break even <b>{0}</b> · {1}",[F.int(e),F.pct(P(e))])}</span><span class="dn">${_t("Bas <b>{0}</b> · {1}",[F.int(n),F.pct(P(n))])}</span></div><div class="split3"><i class="o" style="width:${P(o)}%"></i><i class="e" style="width:${P(e)}%"></i><i class="n" style="width:${P(n)}%"></i></div>`;}
/* volume de la cagnotte éclair sur laquelle s'adosse la Série */
function srVolH(g){const p=g.pool,tot=p.o+p.n+p.e||1,P=v=>Math.round(v/tot*100);
 return `<div class="trh">${_t("<b>Volume de la manche éclair</b>")}<span class="sub">${_t("{0} joueurs · {1}",[F.int(g.players),F.usd0(tot)])}</span></div><div class="pl2"><span class="up">${_t("Haut <b>{0}</b> · {1}",[F.usd0(p.o),F.pct(P(p.o))])}</span><span class="eqp">${_t("Break even <b>{0}</b> · {1}",[F.usd0(p.e),F.pct(P(p.e))])}</span><span class="dn">${_t("Bas <b>{0}</b> · {1}",[F.usd0(p.n),F.pct(P(p.n))])}</span></div><div class="split3"><i class="o" style="width:${P(p.o)}%"></i><i class="e" style="width:${P(p.e)}%"></i><i class="n" style="width:${P(p.n)}%"></i></div>`;}
/* ---------- Affichage ---------- */
/* sous-navigation commune des modes de jeu (Éclair, Blitz Royale, La Série, Duels) : voir refonte.js */
const bzModesH=cur=>jeuxNavH(cur);
function bzPhaseH(r){if(r.between)return `<div class="fl-phase">${_t('Pause, prochaine manche dans {0} s',[Math.ceil(Math.max(0,r.between-now())/1000)])}</div>`;const left=r.rStart+BZ.CHOICE_MS-now();return left>0?`<div class="fl-phase open">${_t('Choix ouverts encore {0} s',[Math.ceil(left/1000)])}</div>`:`<div class="fl-phase">${_t('Choix fermés, résultat dans {0} s',[Math.ceil(Math.max(0,r.rEnd-now())/1000)])}</div>`;}
function bzChoiceH(r){const d=bzGame(),g=G(d.id),me=r.me;const dis=!me||!me.alive||r.between||!bzOpen(r);const btn=(v,l,sub)=>`<button class="fsd ${v==='oui'?'oui':v==='non'?'non':'eq'}${me&&me.choice===(v==='oui'?1:v==='non'?0:2)?' on':''}" data-a="bz-choose" data-v="${v}"${dis?' disabled':''}><span>${l}</span><small>${sub}</small></button>`;
 return `<div class="fl-sides bz-sides">${btn('oui',_t("Haut"),`${_t("au-dessus de {0}",[d.fp(r.p0)])}`)}${btn('non',_t("Bas"),`${_t("en dessous de {0}",[d.fp(r.p0)])}`)}${btn('be',_t("Break even"),`${_t("entre {0} et {1}",[d.fp(r.p0*(1-d.be)),d.fp(r.p0*(1+d.be))])}`)}</div>`;}
function bzPlayersH(r){const all=[...(r.me?[{u:'me',alive:r.me.alive}]:[]),...r.bots],L=all.filter(p=>p.u==='me'||USERS[p.u]).slice(0,BZ.SHOW),rest=all.length-L.length;return `<div class="bzpl">${L.map(p=>`<span class="${p.alive?'':'out'}" title="${esc(duelUserN(p.u))}">${avH(p.u,26,'span')}</span>`).join('')}${rest>0?`<small>${_t("+{0} joueurs",[F.int(rest)])}</small>`:''}</div>`;}
/* Ordinateur (relecture) : la salle d'attente en deux colonnes. À gauche, la règle en une phrase, le compte à rebours et le
   bouton d'entrée ; à droite, la cagnotte, le buy-in, les inscrits, leurs avatars et l'heure du prime time. Mêmes repères
   [data-bz] que sur téléphone : bzRefresh met les chiffres à jour de la même façon. */
function bzSalleOrdiH(r,d,left){
 return `<div class="bzcard bzo"><div class="bzo-g">${r.prime?`<span class="bztag prime">${_t("Prime time 21 h")}</span>`:''}<h1>${_t("10 manches de 60 secondes sur {0}. Le dernier en vie prend tout.",[d.name])}</h1>
 <div class="bzo-cd"><small>${_t("Départ dans")}</small><b class="num" data-bz="cd">${_t('{0} s',[Math.ceil(left/1000)])}</b></div>
 ${r.me?`<div class="bzme ok">${_t("{0} Tu es inscrit. À chaque manche, choisis Haut, Bas ou Break even dans les {1} premières secondes.",[ic('check',16),BZ.CHOICE_MS/1000])}</div>`:`<button class="btn b-pri lg" data-a="bz-join">${_t("{0} Entrer pour {1}",[ic('bolt',16),F.usd0(r.buyin)])}</button>`}</div>
 <div class="bzo-d"><div class="bzo-pot"><small>${_t("Cagnotte")}</small><b class="num" data-bz="pot">${F.usd0(r.pot)}</b>${r.carried?`${_t("<em>dont {0} de jackpot reporté</em>",[F.usd0(r.carried)])}`:''}</div>
 <div class="bzo-kv"><div><small>${_t("Buy-in")}</small><b class="num">${F.usd0(r.buyin)}</b></div><div><small>${_t("Inscrits")}</small><b class="num" data-bz="n">${F.int(r.bots.length+(r.me?1:0))}</b></div></div>
 ${bzPlayersH(r)}${r.prime?'':`<p class="bzo-prime">${ic('bolt',14)} ${_t("Chaque soir à 21 h, prime time : buy-in de {0}, cagnotte bien plus grosse.",[F.usd0(BZ.PRIME_BUYIN)])}</p>`}</div></div>`;}
function bzCardH(){const r=bzR();if(!r)return '';const d=bzGame(),g=G(d.id),t=now();
 if(r.state==='lobby'&&GRAND())return bzSalleOrdiH(r,d,Math.max(0,r.startAt-t));
 if(r.state==='lobby'){const left=Math.max(0,r.startAt-t);return `<div class="bzcard bz-salle"><div class="bzk">${r.prime?`<span class="bztag prime">${_t("Prime time 21 h")}</span>`:''}<span class="sub">${_t("Départ dans")} <b class="num" data-bz="cd">${_t('{0} s',[Math.ceil(left/1000)])}</b></span></div>
 <h1>${_t("10 manches de 60 secondes sur {0}. Le dernier en vie prend tout.",[d.name])}</h1>
 <div class="bzkv"><div><small>${_t("Buy-in")}</small><b class="num">${F.usd0(r.buyin)}</b></div><div><small>${_t("Cagnotte")}</small><b class="num" data-bz="pot">${F.usd0(r.pot)}</b>${r.carried?`${_t("<em>dont {0} de jackpot reporté</em>",[F.usd0(r.carried)])}`:''}</div><div><small>${_t("Inscrits")}</small><b class="num" data-bz="n">${F.int(r.bots.length+(r.me?1:0))}</b></div></div>
 ${r.me?`<div class="bzme ok">${_t("{0} Tu es inscrit. À chaque manche, choisis Haut, Bas ou Break even dans les {1} premières secondes.",[ic('check',16),BZ.CHOICE_MS/1000])}</div>`:`<button class="btn b-pri lg full" data-a="bz-join">${_t("{0} Entrer pour {1}",[ic('bolt',16,'#fff'),F.usd0(r.buyin)])}</button>`}
 ${bzPlayersH(r)}</div>`;}
 if(r.state==='live'){const left=Math.max(0,(r.between?r.between:r.rEnd)-t),me=r.me,alive=bzAlive(r);const chg=(g.price/r.p0-1)*100;
  return `<div class="bzcard onair"><div class="bzk"><span class="bztag onair"><i class="live"></i> ${_t("Manche")} <b data-bz="round">${r.round}</b> / ${BZ.ROUNDS}</span><span class="sub">${r.between?_t("Prochaine manche dans"):_t("Fin de la manche dans")} <b class="num" data-bz="cd">${_t('{0} s',[Math.ceil(left/1000)])}</b></span></div>
  <div class="bzbar"><i data-bz="bar" style="width:${r.between?0:(100-left/BZ.ROUND_MS*100).toFixed(1)}%"></i></div>
  <div class="bzprice"><div><small>${_t("Départ")}</small><b class="num">${d.fp(r.p0)}</b></div><div><small>${_t("Maintenant")}</small><b class="num" data-bz="price">${d.fp(g.price)}</b><span class="delta ${chg>=0?'up':'dn'}" data-bz="chg">${pctFx(chg)}</span></div><div><small>${_t("En vie")}</small><b class="num" data-bz="alive">${F.int(alive)}</b>${_t("<em>sur {0}</em>",[F.int(r.bots.length+(me?1:0))])}</div><div><small>${_t("Ta part si tu survis")}</small><b class="num pl-up" data-bz="share">${F.usd(bzShare(r))}</b>${_t("<em>cagnotte {0}</em>",[F.usd0(r.pot)])}</div></div>
  ${me?(me.alive?`<div class="bzme ok">${_t("{0} En vie{1}",[ic('check',16),me.choice===null&&!r.between?(bzOpen(r)?` ${_t("· choisis dans les {0} premières secondes, sinon tu es éliminé",[BZ.CHOICE_MS/1000])}`:_t(" · pas de choix : tu seras éliminé à la fin de la manche")):me.choice!==null?` ${_t("· tu dis {0}",[me.choice===1?_t("Haut"):me.choice===0?_t("Bas"):_t("Break even")])}`:''])}</div>`:`<div class="bzme out">${_t("{0} Éliminé à la manche {1}. Tu suis la fin en spectateur.{2}",[ic('x',16),me.outRound||r.round,bzCanRebuy(r)?` <button class="btn b-ink sm" data-a="bz-rebuy">${_t("Rachat {0} avant la manche 2",[F.usd0(BZ.REBUY)])}</button>`:''])}</div>`):`<div class="bzme">${_t("Blitz en cours : les inscriptions sont closes. Suis la partie et le chat, le prochain Blitz arrive juste après.")}</div>`}
  ${roundToolsH()}<div class="fl-chart bz-chart" data-bz="chart">${roundChartSvg(d,r.p0,r.path,BZ.ROUND_MS)}</div><div data-bz="phase">${bzPhaseH(r)}</div>
  ${bzChoiceH(r)}
  <div class="bzvol" data-bz="vol">${bzVolH(r)}</div>
  ${bzPlayersH(r)}
  ${r.log.length?`<div class="bzlog">${r.log.slice(0,10).map(l=>`<span>${_t("<b>M{0}</b> {1} · {2} éliminé{3}, {4} en vie",[l.round,l.out===2?'BE':l.out===1?_t("Haut"):_t("Bas"),l.gone,l.gone>1?'s':'',l.alive])}</span>`).join('')}</div>`:''}</div>`;}
 const h=S.bz.history[0];return `<div class="bzcard done"><div class="bzk"><span class="bztag">${_t("Blitz terminé")}</span></div><h1>${h&&h.alive?`${_t("{0} survivant{1} se partagent {2}",[h.alive,h.alive>1?'s':'',F.usd0(h.pot)])}`:`${_t("Personne n’a survécu : {0} reportés sur le prochain Blitz",[F.usd0(h?h.pot:0)])}`}</h1>${h&&h.me?`<div class="bzme ${h.me==='won'?'ok':'out'}">${h.me==='won'?`${_t("Tu as gagné {0}.",[F.usd(h.each)])}`:_t("Tu as été éliminé cette fois.")}</div>`:''}<p class="sub">${_t("Le prochain Blitz s’ouvre dans quelques secondes.")}</p></div>`;}
/* Ordinateur : la partie (salle d'attente, manche en direct ou fin) et sa règle à gauche ; le chat du Blitz dans la colonne
   latérale, à la hauteur de l'écran, qui reste visible au défilement. Téléphone : inchangé. */
/* Ordinateur (relecture) : la règle en une bande de cinq étapes d'une ligne ; le texte complet reste à un clic (« Règles
   complètes »). */
const bzEtapesH=()=>`<ol class="jx-bande">${[_t("Un buy-in, une seule salle"),_t("10 manches de 60 s"),_t("Haut, Bas ou Break even, choisi dans les {0} premières secondes",[BZ.CHOICE_MS/1000]),_t("Une erreur, et tu es éliminé"),_t("Les survivants se partagent la cagnotte")].map(x=>`<li>${x}</li>`).join('')}</ol>`;
function vBlitz(){const d=bzGame(),ordi=GRAND();return `<div class="wrap jx jx-blitz">${bzModesH('blitz')}<div class="g-side"><div class="col"><section class="pn pad" data-bzcard>${bzCardH()}</section>
 <section class="pn pad jx-how">${ordi?`<div class="h2 mb-4">${_t("Comment ça marche")}</div>${bzEtapesH()}<details class="tdet jx-regles"><summary>${_t("Règles complètes")}</summary>`:`<div class="h2 mb-4">${_t("Comment ça marche")}</div>`}<ol class="steps"><li>${_t("Un buy-in, tout le monde dans la même salle. Un Blitz par heure, 24 h/24, prime time à 21 h avec un buy-in de {0} et une cagnotte bien plus grosse.",[F.usd0(BZ.PRIME_BUYIN)])}</li><li>${_t("Une manche de 60 secondes sur la bougie {0} en direct : Haut, Bas ou Break even (dans la bande de ±{1}). Le choix se fait dans les {2} premières secondes, puis la bougie finit sans toi.",[d.name,pctS(d.be*100),BZ.CHOICE_MS/1000])}</li><li>${_t("Ceux qui ont faux sont éliminés. Ta part si tu survis grossit à chaque élimination.")}</li><li>${_t("Après 10 manches, les survivants se partagent la cagnotte (commission Wimoro {0}). Personne ne survit : la cagnotte est reportée, le jackpot gonfle.",[F.pct(BZ.RAKE*100)])}</li><li>${_t("Éliminé, tu restes en spectateur avec le chat. Un seul rachat, à {0}, uniquement si tu tombes à la première manche et avant la manche 2, dans tes limites de jeu responsable. La cagnotte est la somme des entrées : Wimoro n’est jamais exposé.",[F.usd0(BZ.REBUY)])}</li></ol>${ordi?'</details>':''}</section>
 ${S.bz.history.length?`<section class="pn pad"><div class="h2">${_t("Derniers Blitz")}</div>${S.bz.history.map(h=>`<div class="bzh"><span>${fmtDT(h.at)}${h.prime?_t(" · prime time"):''}</span><span>${_t("{0} joueurs",[F.int(h.players)])}</span><span>${h.alive?`${_t("{0} survivant{1}, {2} chacun",[h.alive,h.alive>1?'s':'',F.usd(h.each)])}`:_t("jackpot reporté")}</span></div>`).join('')}</section>`:''}</div>
 <aside class="col rail-fixe">${chatH('blitz','a-chat',`<div class="chat-h"><div class="tt"><div><h2>${_t("Chat du Blitz")}</h2><div class="sub">${_t("Joueurs et spectateurs")}</div></div></div></div>`)}</aside></div></div>`;}
let _bzLast=0;
function bzRefresh(light){if(document.hidden||(S.ui.route||'')!=='blitz')return;const r=bzR();if(!r)return;const box=$('[data-bzcard]');if(!box)return;
 const key=r.state+':'+r.round+':'+(r.between?'b':'r')+(bzOpen(r)?'o':'c')+':'+(r.me?(r.me.alive?'a':'o')+(r.me.choice===null?'-':r.me.choice)+(r.me.rebuy?'R':''):'x')+':'+r.bots.length+':'+bzAlive(r);
 if(!light||box.dataset.key!==key){box.dataset.key=key;box.innerHTML=bzCardH();fixText(box);if(FTIP)ftipDraw();return;}
 const t=now(),g=G(BZ.GID);const set=(k,f)=>$$(`[data-bz="${k}"]`,box).forEach(f);
 if(r.state==='lobby'){set('cd',e=>e.textContent=_t('{0} s',[Math.ceil(Math.max(0,r.startAt-t)/1000)]));set('pot',e=>e.textContent=F.usd0(r.pot));set('n',e=>e.textContent=F.int(r.bots.length+(r.me?1:0)));}
 else if(r.state==='live'){const left=Math.max(0,(r.between?r.between:r.rEnd)-t),chg=(g.price/r.p0-1)*100;set('cd',e=>e.textContent=_t('{0} s',[Math.ceil(left/1000)]));set('bar',e=>e.style.width=(r.between?0:100-left/BZ.ROUND_MS*100).toFixed(1)+'%');set('price',e=>e.textContent=bzGame().fp(g.price));set('chg',e=>{e.textContent=pctFx(chg);e.className='delta '+(chg>=0?'up':'dn');});set('share',e=>e.textContent=F.usd(bzShare(r)));set('alive',e=>e.textContent=F.int(bzAlive(r)));if(!r.between)set('chart',e=>e.innerHTML=roundChartSvg(bzGame(),r.p0,r.path,BZ.ROUND_MS));set('phase',e=>e.innerHTML=bzPhaseH(r));set('vol',e=>e.innerHTML=bzVolH(r));if(FTIP)ftipDraw();}}
/* bavardage du Blitz */
const BZ_LINES=[_t("Haut évidemment, regardez la bougie."),_t("Je passe Break even cette manche, ça stagne."),_t("Encore en vie, on y croit."),_t("Éliminé à la 3, je suis spectateur maintenant."),_t("La cagnotte est énorme ce soir."),_t("Qui a pris Bas ? Bravo."),_t("Rachat fait, deuxième chance."),_t("Ma part monte à chaque manche, ne bougez pas.")];
planifier('blitz : messages des bots',7000,()=>{if(document.hidden||R()<.6)return;const r=bzR();if(!r)return;const L=r.bots.filter(b=>USERS[b.u]);if(!L.length)return;addMsg('blitz',mkMsg({u:pick(L).u,k:'msg',text:pick(BZ_LINES)}));});

/* =====================================================================================
 *  La Série (solo)
 * ===================================================================================== */
const SERIE={MAX:12,ROUND_MS:60000,CHOICE_MS:30000};
/* une manche dure 60 s ; le choix (ou l'encaissement) se fait dans les 30 premières secondes */
const serieOpen=s=>!!s&&s.state==='running'&&s.choice===null&&now()<s.rStart+SERIE.CHOICE_MS;
const serieCur=()=>S.me.serie||null;
const serieToday=()=>S.me.serieToday||(S.me.serieToday=[]);
function serieMults(gid){const d=GM[gid],g=G(gid),pr=flashPrices(g);return {oui:100/pr.o,non:100/pr.n,be:beMultFair(beProb(d.be,d.k,SERIE.ROUND_MS/250))};}
function serieRoundStart(s){const g=G(s.gid);s.step++;s.state='running';s.choice=null;s.mult=0;s.fee=0;s.rStart=now();s.rEnd=s.rStart+SERIE.ROUND_MS;s.p0=g.price;s.path=[g.price];}
function serieStart(gid,stake){if(!S.me.logged)return false;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return false;if(serieCur()&&serieCur().state!=='lost'&&serieCur().state!=='cashed')return false;
 if(stake>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return false;}
 S.me.balance-=stake;S.me.played++;S.me.serie={gid,stake,stack:stake,step:0,state:'running',hist:[],at:now()};serieRoundStart(S.me.serie);updateHeader();save();gainXP(10);return true;}
/* choisir Haut / Bas / Break even : seulement pendant la fenêtre de choix de la manche en cours */
function seriePlay(side){const s=serieCur();if(!s||s.state!=='running'||s.choice!==null)return;if(!serieOpen(s)){toast({tone:'amber',icon:'lock',title:_t("Choix fermés"),text:`${_t("Le choix se fait dans les {0} premières secondes de la manche.",[SERIE.CHOICE_MS/1000])}`});return;}if(SRV()){srvSerieChoisir(side);return;}                       /* mode Compte : la cote et les frais sont fixés par le serveur */
 const d=GM[s.gid],M=serieMults(s.gid),rate=wmRate(d.cat,myRank().t>=5)*.5;s.choice=side;s.mult=M[side];s.fee=s.stack*rate;save();serieRefresh();}
function serieEnd(){const s=serieCur();if(!s||s.state!=='running')return;if(SRV()){srvSerieRegler();return;}    /* mode Compte : l'issue est calculée et payée par le serveur */
 const d=GM[s.gid],g=G(s.gid);
 if(s.choice===null){s.step--;if(s.step<=0){s.state='cashed';s.endAt=now();S.me.balance+=s.stake;S.me.settled++;toast({tone:'amber',icon:'wallet',force:true,title:_t("Série annulée"),text:_t("Aucun choix dans les 30 secondes : ta mise t’est rendue."),href:'#serie'});updateHeader();save();serieRefresh();return;}
  toast({tone:'amber',icon:'wallet',force:true,title:_t("Encaissement automatique"),text:`${_t("Aucun choix dans les {0} secondes : {1} encaissés.",[SERIE.CHOICE_MS/1000,F.usd(s.stack)])}`,href:'#serie'});serieCash(true);return;}
 const m=Math.abs(g.price/s.p0-1),out=m<=d.be?'be':g.price>s.p0?'oui':'non';const win=out===s.choice;
 s.hist.push({step:s.step,choice:s.choice,out,mult:s.mult,p0:s.p0,p1:g.price,win});
 if(win){s.stack=(s.stack-s.fee)*s.mult;toast({tone:'green',icon:'bolt',flash:true,title:`${_t("Manche {0} gagnée : stack {1}",[s.step,F.usd(s.stack)])}`,text:`${_t("{0} Encaisse ou continue dans les {1} secondes.",[out==='be'?_t("Break even."):out==='oui'?_t("Haut."):_t("Bas."),SERIE.CHOICE_MS/1000])}`,href:'#serie'});if(s.step>=SERIE.MAX){serieCash(true);return;}serieRoundStart(s);}
 else{s.state='lost';s.stack=0;s.endAt=now();S.me.settled++;S.me.realized-=s.stake;S.me.history.unshift({k:'serie',q:`${_t("La Série {0} : {1} sur {2}",[d.name,s.step-1,s.step])}`,s:'non',win:false,pnl:-s.stake,at:now()});toast({tone:'red',icon:'bolt',flash:true,title:`${_t("Série perdue à la manche {0}",[s.step])}`,text:`${_t("C’était {0}. Mise perdue : {1}.",[out==='be'?'break even':out==='oui'?_t("Haut"):_t("Bas"),F.usd(s.stake)])}`,href:'#serie'});}
 save();serieRefresh();}
/* encaisser : pendant la fenêtre de choix, après au moins une manche gagnée */
function serieCash(auto){const s=serieCur();if(!s||s.state!=='running'||(s.choice!==null&&!auto))return;if(SRV()){if(!auto)srvSerieEncaisser();return;}
 const won=s.hist.filter(h=>h.win).length;if(!won){s.state='cashed';s.endAt=now();S.me.balance+=s.stake;S.me.settled++;updateHeader();save();serieRefresh();return;}const d=GM[s.gid],before=myRank();const tot=s.stack/s.stake;s.state='cashed';s.endAt=now();s.step=won;S.me.balance+=s.stack;S.me.settled++;S.me.wins++;S.me.realized+=s.stack-s.stake;
 S.me.history.unshift({k:'serie',q:`${_t("La Série {0} : {1} sur {1}, encaissé à ×{2}",[d.name,s.step,F.d1(tot)])}`,s:'oui',win:true,pnl:s.stack-s.stake,at:now()});
 const e={u:'me',steps:s.step,mult:tot,cashed:s.stack,at:now()};serieToday().unshift(e);S.me.serieBest=Math.max(S.me.serieBest||0,s.step);gainXP(20+s.step*10);
 toast({tone:'green',icon:'trophy',force:true,title:`${_t("Encaissé : {0} (×{1})",[F.usd(s.stack),F.d1(tot)])}`,text:`${_t("{0} sur {0} sur {1}. Bravo.",[s.step,d.name])}`,href:'#serie'});if(!auto)confetti(36);checkRank(before);checkBadges();updateHeader();save();serieRefresh();}
function serieTick(){const s=serieCur();if(s&&s.state==='running'){if(now()>=s.rEnd)serieEnd();else if(s.choice===null&&!s.closed&&now()>=s.rStart+SERIE.CHOICE_MS){s.closed=true;serieRefresh();}if(s.closed&&s.choice!==null)s.closed=false;}serieRefresh(true);}
/* classement du jour : joueurs simulés + toi */
function serieBoardH(){const rr=rng(hash('serie'+today()));const bots=USER_IDS.slice(0,7).map(u=>({u,steps:3+Math.floor(rr()*7),mult:0,cashed:0,at:now()-rr()*5*3600e3}));bots.forEach(b=>{b.mult=Math.pow(1.92,b.steps)*(0.85+rr()*.3);b.cashed=Math.round(b.mult*pick([5,10,25,50]));});
 const L=[...serieToday(),...bots].sort((a,b)=>b.steps-a.steps||b.mult-a.mult).slice(0,8);
 return `<div class="srbd">${L.map((e,i)=>`<div class="srrow${e.u==='me'?' me':''}"><span class="pos">${i+1}</span>${avH(e.u,28,'span')}<span class="nm">${esc(duelUserN(e.u))}</span>${_t("<b>{0} sur {0}</b>",[e.steps])}<span class="num">×${F.d1(e.mult)}</span><span class="num pl-up">${F.usd0(e.cashed)}</span></div>`).join('')}</div>`;}
function serieCardH(){const s=serieCur(),t=now();
 if(!s||s.state==='lost'||s.state==='cashed'){const st=S.ui.serie||(S.ui.serie={gid:'btc',stake:10});const M=serieMults(st.gid),d=GM[st.gid];
  return `<div class="srcard"><div class="bzk"><span class="sub">${_t("Solo, 60 s par manche")}</span></div><h1>${_t("Une mise, un stack qui grossit à chaque bonne manche. Encaisse quand tu veux.")}</h1>
  ${s?`<div class="bzme ${s.state==='cashed'?'ok':'out'}">${s.state==='cashed'?`${_t("Dernière série : {0} sur {0}, encaissée à ×{1} ({2}).",[s.step,F.d1(s.stack/s.stake),F.usd(s.stack)])}`:`${_t("Dernière série perdue à la manche {0} sur {1}.",[s.step,d.name])}`}${s.step?` <button class="btn b-white sm" data-a="sr-share">${_t("{0} Carte",[ic('share',14)])}</button>`:''}</div>`:''}
  <div class="sr-grid"><div class="sr-cfg"><div class="cpf"><span class="cpl">${_t("Actif")}</span><div class="chips">${GAMES.filter(x=>x.kind==='dir').slice(0,6).map(x=>`<button type="button" class="chip${st.gid===x.id?' on':''}" data-a="sr-gid" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div></div>
  <div class="cpf"><span class="cpl">${_t("Mise de départ")}</span><div class="presets">${[5,10,25,50,100].map(v=>`<button type="button" class="btn b-ghost sm${st.stake===v?' on':''}" data-a="sr-stake" data-v="${v}">${F.usd0(v)}</button>`).join('')}</div></div></div>
  <div class="sr-proj"><div class="calc"><div class="line"><span>${_t("Haut ou Bas à chaque manche")}</span><b>×${F.d2(M.oui)} / ×${F.d2(M.non)}</b></div><div class="line"><span>${_t("Break even, la manche all-in")}</span><b>×${Math.round(M.be)}</b></div><div class="line"><span>${_t("8 bonnes manches d’affilée (Haut/Bas)")}</span><b class="pl-up">≈ ${F.usd0(st.stake*Math.pow((M.oui+M.non)/2*.985,8))}</b></div></div>
  <button class="btn b-pri lg full mt-3" data-a="sr-start">${_t("{0} Lancer une série à {1}",[ic('bolt',16,'#fff'),F.usd0(st.stake)])}</button></div></div>${GRAND()?serieEchelleH(st.stake,M):''}</div>`;}
 const d=GM[s.gid],g=G(s.gid),M=serieMults(s.gid),left=Math.max(0,s.rEnd-t),chg=(g.price/s.p0-1)*100,open=serieOpen(s),chosen=s.choice!==null,won=s.hist.filter(h=>h.win).length;
 const cd=v=>`<span data-sr="cd2">${v}</span>`,sideL=s.choice==='oui'?_t('Haut'):s.choice==='non'?_t('Bas'):_t('Break even'),cl=Math.ceil(Math.max(0,s.rStart+SERIE.CHOICE_MS-t)/1000),rl=Math.ceil(left/1000);
 const phase=chosen?`<div class="fl-phase">${_t('Tu dis {0}, résultat dans {1} s',[sideL,cd(rl)])}</div>`:open?`<div class="fl-phase open">${won?_t('Choisis ou encaisse, encore {0} s',[cd(cl)]):_t('Choisis, encore {0} s',[cd(cl)])}</div>`:`<div class="fl-phase">${won?_t('Choix fermés, encaissement automatique dans {0} s',[cd(rl)]):_t('Choix fermés, mise rendue dans {0} s',[cd(rl)])}</div>`;
 return `<div class="srcard onair"><div class="bzk"><span class="bztag onair"><i class="live"></i> ${_t("Série {0} · manche {1}",[d.name,s.step])}</span><span class="sub">${_t("Fin dans")} <b class="num" data-sr="cd">${_t('{0} s',[Math.ceil(left/1000)])}</b></span></div>
 <div class="bzbar"><i data-sr="bar" style="width:${(100-left/SERIE.ROUND_MS*100).toFixed(1)}%"></i></div>
 <div class="bzprice"><div><small>${_t("Stack")}</small><b class="num" data-sr="stack">${F.usd(s.stack)}</b>${_t("<em>mise {0}, ×{1}</em>",[F.usd0(s.stake),F.d1(s.stack/s.stake)])}</div><div><small>${_t("Départ")}</small><b class="num">${d.fp(s.p0)}</b></div><div><small>${_t("Maintenant")}</small><b class="num" data-sr="price">${d.fp(g.price)}</b><span class="delta ${chg>=0?'up':'dn'}" data-sr="chg">${pctFx(chg)}</span></div>${chosen?`<div><small>${_t("Tu dis")}</small>${_t("<b>{0}</b><em>×{1} si juste</em>",[s.choice==='oui'?_t("Haut"):s.choice==='non'?_t("Bas"):_t("Break even"),F.d2(s.mult)])}</div>`:`<div><small>${_t("Si tu gagnes la manche")}</small><b class="num pl-up">${F.usd(s.stack*.985*M.oui)}</b>${_t("<em>Haut, ×{0}</em>",[F.d2(M.oui)])}</div>`}</div>
 ${roundToolsH()}<div class="fl-chart bz-chart" data-sr="chart">${roundChartSvg(d,s.p0,s.path,SERIE.ROUND_MS)}</div><div data-sr="phase">${phase}</div>
 ${chosen?'':`<div class="fl-sides bz-sides"><button class="fsd oui" data-a="sr-play" data-v="oui"${open?'':' disabled'}><i class="mx">×${F.d2(M.oui)}</i><span>${_t("Haut")}</span><small>${_t("tout le stack")}</small></button><button class="fsd non" data-a="sr-play" data-v="non"${open?'':' disabled'}><i class="mx">×${F.d2(M.non)}</i><span>${_t("Bas")}</span><small>${_t("tout le stack")}</small></button><button class="fsd eq" data-a="sr-play" data-v="be"${open?'':' disabled'}><i class="mx">×${Math.round(M.be)}</i><span>${_t("Break even")}</span><small>${_t("all-in, ±{0}",[pctS(d.be*100)])}</small></button></div>
 ${won&&open?`<button class="btn b-ink lg full mt-3" data-a="sr-cash">${_t("{0} Encaisser {1}",[ic('wallet',16,'#fff'),F.usd(s.stack)])}</button>`:''}`}
 <div class="bzvol" data-sr="vol">${srVolH(g)}</div>
 ${s.hist.length?`<div class="bzlog">${s.hist.map(h=>`<span class="${h.win?'ok':'ko'}"><b>${_t('M{0}',[h.step])}</b> ${h.choice==='oui'?_t("Haut"):h.choice==='non'?_t("Bas"):'BE'} ×${F.d2(h.mult)} · ${h.win?_t('gagnée'):_t('perdue')}</span>`).join('')}</div>`:''}</div>`;}
/* Ordinateur : la série (réglages et projection côte à côte, ou la manche en direct) et sa règle à gauche ; le classement
   du jour dans la colonne latérale, qui reste visible au défilement. Téléphone : inchangé. */
/* Ordinateur (relecture) : l'échelle des 12 manches montre le stack qui grossit pour la mise choisie (même calcul que la
   ligne « 8 bonnes manches d'affilée » : cote moyenne Haut/Bas, frais déduits) ; la règle tient en une ligne, le texte
   complet reste à un clic ; « Tes séries » (record, séries encaissées aujourd'hui, série en cours) sous le classement. */
function serieEchelleH(stake,M){const k=(M.oui+M.non)/2*.985;
 return `<div class="sr-ech"><div class="sr-ech-h"><b>${_t("Ton stack, manche après manche")}</b><small>${_t("Encaisse quand tu veux · Break even : ×{0}",[Math.round(M.be)])}</small></div><ol>${Array.from({length:SERIE.MAX},(_,i)=>`<li class="${i===7?'cle':''}"><small>${_t('M{0}',[i+1])}</small><b class="num">${(v=>v<1e4?F.usd0(v):F.compact(v))(stake*Math.pow(k,i+1))}</b></li>`).join('')}</ol></div>`;}
function serieMoiH(){const s=serieCur(),L=serieToday().filter(e=>e.u==='me'),best=S.me.serieBest||0,run=s&&s.state==='running';
 return `<section class="pn pad sr-moi"><div class="h2">${_t("Tes séries")}</div><div class="cp-kpis mt-3"><div><small>${_t("Record")}</small><b class="num">${best?_t("{0, plural, one{# manche} other{# manches}}",[best]):'—'}</b></div><div><small>${_t("Encaissées aujourd’hui")}</small><b class="num">${F.int(L.length)}</b></div><div><small>${_t("En cours")}</small><b class="num">${run?_t('Manche {0}',[s.step]):'—'}</b></div></div></section>`;}
function vSerie(){const ordi=GRAND();return `<div class="wrap jx jx-serie">${bzModesH('serie')}<div class="g-side"><div class="col"><section class="pn pad" data-srcard>${serieCardH()}</section>
 <section class="pn pad jx-how">${ordi?`<div class="h2 mb-2">${_t("Comment ça marche")}</div><p class="sub">${JEU_AIDE.serie()}</p><details class="tdet jx-regles"><summary>${_t("Règles complètes")}</summary>`:`<div class="h2 mb-4">${_t("Comment ça marche")}</div>`}<ol class="steps"><li>${_t("Tu mises une fois. Chaque manche est un pari éclair ordinaire joué avec tout ton stack, adossé au marché : la cote Haut/Bas est celle de la cagnotte éclair du moment.")}</li><li>${_t("Une manche de 60 secondes : tu choisis Haut, Bas ou Break even dans les {0} premières secondes, la bougie finit ensuite. Bonne prédiction : le stack est multiplié et la manche suivante démarre ; tu as alors {0} secondes pour Encaisser ou Continuer, sinon le stack est encaissé automatiquement. Mauvaise prédiction : le stack est perdu.",[SERIE.CHOICE_MS/1000])}</li><li>${_t("Break even est la manche all-in à grosse cote, payée sur la base de sa probabilité réelle avec une marge de 5 %.")}</li><li>${_t("{0} manches maximum, puis l’encaissement est automatique.",[SERIE.MAX])}</li></ol>${ordi?'</details>':''}</section></div>
 <aside class="col rail-fixe"><section class="pn pad"><div class="h2">${_t("Les plus longues séries du jour")}</div>${serieBoardH()}</section>${ordi?serieMoiH():''}</aside></div></div>`;}
function serieRefresh(light){if(document.hidden||(S.ui.route||'')!=='serie')return;const box=$('[data-srcard]');if(!box)return;const s=serieCur();const key=s?s.state+':'+s.step+':'+(s.choice===null?'-':s.choice)+':'+(serieOpen(s)?'o':'c')+':'+Math.round(s.stack*100):'none:'+(S.ui.serie?S.ui.serie.gid+S.ui.serie.stake:'');
 if(!light||box.dataset.key!==key){box.dataset.key=key;box.innerHTML=serieCardH();fixText(box);if(FTIP)ftipDraw();return;}
 if(s&&s.state==='running'){const g=G(s.gid),d=GM[s.gid],t=now(),left=Math.max(0,s.rEnd-t),chg=(g.price/s.p0-1)*100;const set=(k,f)=>$$(`[data-sr="${k}"]`,box).forEach(f);set('cd',e=>e.textContent=_t('{0} s',[Math.ceil(left/1000)]));set('cd2',e=>e.textContent=String(Math.ceil((s.choice===null&&serieOpen(s)?Math.max(0,s.rStart+SERIE.CHOICE_MS-t):left)/1000)));set('bar',e=>e.style.width=(100-left/SERIE.ROUND_MS*100).toFixed(1)+'%');set('price',e=>e.textContent=d.fp(g.price));set('chg',e=>{e.textContent=pctFx(chg);e.className='delta '+(chg>=0?'up':'dn');});set('chart',e=>e.innerHTML=roundChartSvg(d,s.p0,s.path,SERIE.ROUND_MS));set('vol',e=>e.innerHTML=srVolH(g));if(FTIP)ftipDraw();}}
/* carte à partager : « 8 sur 8, encaissé à 256× » */
function serieCanvas(s){const c=document.createElement('canvas'),W=1080,H=1350;c.width=W;c.height=H;const ctx=c.getContext('2d');const sg=plain(cssVar('--sg')),font=(w,z)=>`${w} ${z}px ${sg}`;const d=GM[s.gid];
 const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0F1115');bg.addColorStop(1,'#2A1E05');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.direction=RTL?'rtl':'ltr';const X=RTL?W-80:80;ctx.textAlign=RTL?'right':'left';const txt=z=>plain(String(z));
 ctx.font=font(800,54);ctx.fillStyle='#fff';ctx.fillText('wimoro',X+(RTL?-70:70),130);ctx.fillStyle='#F59A0B';ctx.beginPath();ctx.roundRect(RTL?W-80-56:80,84,56,56,16);ctx.fill();ctx.font=font(800,34);ctx.fillStyle='#fff';ctx.fillText('W',RTL?W-80-40:96,125);
 ctx.font=font(600,34);ctx.fillStyle='rgba(255,255,255,.6)';ctx.fillText(txt(`${_t("La Série · {0}",[d.name])}`),X,240);
 ctx.font=font(800,150);ctx.fillStyle='#FFC46B';ctx.direction='ltr';ctx.fillText(txt(`${_t("{0} sur {0}",[s.step])}`),X,400);ctx.direction=RTL?'rtl':'ltr';
 ctx.font=font(700,64);ctx.fillStyle='#fff';ctx.fillText(txt(s.state==='cashed'?`${_t("Encaissé à ×{0}",[F.d1(s.stack/s.stake)])}`:`${_t("Perdu à la manche {0}",[s.step])}`),X,500);
 ctx.font=font(500,36);ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillText(txt(s.state==='cashed'?`${_t("{0} devenus {1}",[plain(F.usd0(s.stake)),plain(F.usd(s.stack))])}`:`${_t("Mise {0}",[plain(F.usd0(s.stake))])}`),X,570);
 let y=680;ctx.font=font(600,30);for(const h of s.hist.slice(-8)){ctx.fillStyle=h.win?'#4ADE80':'#FF6B6B';ctx.fillText(txt(`${_t("Manche {0} · {1} ×{2} · {3}",[h.step,h.choice==='oui'?_t("Haut"):h.choice==='non'?_t("Bas"):_t("Break even"),F.d2(h.mult),h.win?_t('gagnée'):_t('perdue')])}`),X,y);y+=46;}
 y=H-250;ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,y-40);ctx.lineTo(W-80,y-40);ctx.stroke();ctx.font=font(600,34);ctx.fillStyle='#fff';ctx.fillText(txt(`@${S.me.n} · ${rankName(myRank().t,myRank().d)}`),X,y+10);ctx.font=font(500,28);ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(txt(_t('Rejoins-moi avec le code {0} : {1} offerts.',[refCode(),F.usd0(REF.BONUS)])),X,y+62);ctx.font=font(700,30);ctx.fillStyle='#FFC46B';ctx.fillText('wimoro.com',X,y+118);return c;}
async function serieShare(){const s=serieCur();if(!s||!s.step)return;try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}const url=serieCanvas(s).toDataURL('image/png');S.ui.shareImg=url;S.ui.shareTxt=`${_t("{0} sur {0} sur Wimoro, encaissé à ×{1}. Rejoins-moi avec le code {2} : {3}",[s.step,F.d1(s.stack/s.stake),refCode(),refLink()])}`;
 openModal(`<div class="md shm"><div class="md-h"><div><p>${_t("La Série")}</p><h3>${_t("Ta série en image")}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div><img class="shimg" src="${url}" alt="${_t("Carte de ta série")}"><div class="cpm-acts"><button class="btn b-ink lg" data-a="share-send">${_t("{0} Partager l’image",[ic('share',16,'#fff')])}</button><button type="button" class="btn b-white lg" data-a="share-save" data-name="wimoro-serie.png">${_t("{0} Enregistrer l’image",[ic('down',16)])}</button></div></div>`,'wide');}

Object.assign(VIEWS,{blitz:vBlitz,serie:vSerie});TITLES.blitz=_t("Blitz Royale");TITLES.serie=_t("La Série");
Object.assign(ACT,{
 'bz-join':()=>{if(!S.me.logged){needLogin(_t("Connecte-toi pour entrer dans le Blitz."));return;}if(SRV()){srvBzEntrer();return;}if(bzJoin())bzRefresh();},
 'bz-rebuy':()=>{if(SRV()){srvBzRacheter();return;}if(bzRebuy())bzRefresh();},
 'bz-choose':a=>{if(!S.me.logged){needLogin(_t("Connecte-toi pour jouer."));return;}bzChoose(a.dataset.v==='oui'?1:a.dataset.v==='non'?0:2);},
 'sr-gid':a=>{S.ui.serie=S.ui.serie||{gid:'btc',stake:10};S.ui.serie.gid=a.dataset.v;serieRefresh();},
 'sr-stake':a=>{S.ui.serie=S.ui.serie||{gid:'btc',stake:10};S.ui.serie.stake=+a.dataset.v;serieRefresh();},
 'sr-start':()=>{if(!S.me.logged){needLogin(_t("Connecte-toi pour lancer une série."));return;}const st=S.ui.serie||{gid:'btc',stake:10};if(SRV()){srvSerieLancer(st.gid,st.stake);return;}if(serieStart(st.gid,st.stake)){toast({tone:'blue',icon:'bolt',force:true,title:`${_t("Série lancée à {0}",[F.usd0(st.stake)])}`,text:_t("Choisis Haut, Bas ou Break even pour la première manche.")});serieRefresh();}},
 'sr-play':a=>seriePlay(a.dataset.v),
 'sr-cash':()=>serieCash(false),
 'sr-share':()=>serieShare()
});
planifier('blitz et série : moteur local',1000,()=>{bzTick();serieTick();});
/* salle de chat du Blitz */
{const r=room('blitz');r.name=_t("Blitz Royale");r.kind='blitz';SEMIS.push(()=>{if(r.msgs.length)return;const t=now(),ids=USER_IDS.slice().sort(()=>R()-.5);[_t("Le Blitz de 20 h a fini sur 3 survivants, 412 $ chacun."),_t("Je rentre dès l’ouverture, le jackpot est reporté."),_t("Conseil : Break even quand la bougie stagne, ça m’a sauvé deux fois.")].forEach((x,i)=>r.msgs.push(mkMsg({u:ids[i],k:'msg',text:x,at:t-(9-i*3)*60000})));});}

