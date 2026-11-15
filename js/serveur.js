/* WIMORO — mode serveur */

'use strict';
/* =====================================================================================
 *  Mode serveur (compte réel) : S.me est un cache de ce que dit le serveur
 *  ------------------------------------------------------------------------------------
 *   - hydrater(etat)    transforme la réponse de api_state en S.me (une seule fonction, un seul endroit) ;
 *   - srvAppliquer(r)   applique la réponse d'une action : état à jour + événements à afficher (XP, badge…) ;
 *   - srvSauver()       n'envoie que les préférences d'interface et les réglages de profil qui ont changé ;
 *   - srvGarde()        bloque clairement les actions qui ne sont pas encore reliées au serveur.
 *  Ce fichier n'utilise que la passerelle API : il ne touche jamais le client Supabase.
 * ===================================================================================== */

/* ----- Messages d'erreur : le serveur renvoie un code, l'interface le traduit ----- */
const ERR_TXT={
 reseau:()=>_t("Connexion au serveur impossible. Vérifie ta connexion et réessaie."),
 delai:()=>_t("Connexion au serveur impossible. Vérifie ta connexion et réessaie."),
 session:()=>_t("Ta session a expiré. Reconnecte-toi."),
 identifiants:()=>_t("Identifiant ou mot de passe incorrect."),
 email_pris:()=>_t("Un compte existe déjà avec cet e-mail. Connecte-toi."),
 email_non_confirme:()=>_t("Confirme d’abord ton adresse : clique sur le lien reçu par e-mail."),
 trop_de_tentatives:()=>_t("Trop de tentatives. Réessaie dans quelques minutes."),
 code_invalide:()=>_t("Code incorrect ou expiré."),
 mot_de_passe_faible:()=>_t("Mot de passe trop faible. Utilise au moins 8 caractères."),
 meme_mot_de_passe:()=>_t("Choisis un mot de passe différent de l’actuel."),
 inscriptions_fermees:()=>_t("Les inscriptions sont fermées pour le moment."),
 pseudo_pris:()=>_t("Ce pseudo est déjà pris."),
 pseudo_invalide:()=>_t("3 à 20 caractères : lettres, chiffres, point ou tiret bas."),
 bio_trop_longue:()=>_t("Ta bio est trop longue (160 caractères au plus)."),
 solde_insuffisant:()=>_t("Solde insuffisant. Dépose des fonds pour continuer."),
 liquidite:()=>_t("Pas assez de liquidité sur ce marché pour ce montant."),
 marche_ferme:()=>_t("Ce marché est fermé."),
 marche_inconnu:()=>_t("Ce marché est fermé."),
 montant_min:()=>_t("La mise minimale est de 1 $."),
 position_absente:()=>_t("Tu n’as plus cette position."),
 quantite_invalide:()=>_t("Tu n’as plus cette position."),
 pause:()=>_t("Tu es en pause : les paris et les dépôts sont bloqués."),
 limite_depot:()=>_t("Limite de dépôt atteinte"),
 kyc_requis:()=>_t("Fais d’abord le KYC pour utiliser ce moyen de paiement."),
 depot_min:()=>_t("Montant inférieur au minimum."),
 depot_max:()=>_t("Montant supérieur au maximum autorisé."),
 montant_invalide:()=>_t("Montant invalide."),
 adresse_invalide:()=>_t("Adresse invalide."),
 retrait_min:()=>_t("Montant inférieur au minimum."),
 kyc_nom:()=>_t("Renseigne ton prénom et ton nom."),
 kyc_age:()=>_t("Tu dois avoir 18 ans ou plus."),
 kyc_piece:()=>_t("Ajoute ta pièce d’identité."),
 mission_indisponible:()=>_t("Cette récompense a déjà été récupérée."),
 trop_vite:()=>_t("Pas si vite : attends une seconde entre deux messages."),
 message_repete:()=>_t("Tu viens d’envoyer ce message."),
 trop_de_messages:()=>_t("Trop de messages d’un coup. Réessaie dans une minute."),
 message_trop_long:()=>_t("Message trop long (280 caractères au plus)."),
 salon_indisponible:()=>_t("Ce salon n’est pas encore disponible avec ton compte."),
 mises_fermees:()=>_t("La prochaine manche arrive dans quelques secondes."),
 deja_mise:()=>_t("Une mise par pari et par manche. Tu peux jouer les autres paris éclair."),
 be_plein:()=>_t("La cagnotte de cette manche ne peut plus couvrir de break even.")
};
const errTxt=e=>{const c=e&&e.code||'';return ERR_TXT[c]?ERR_TXT[c]():_t("Une erreur est survenue. Réessaie.");};
const srvErreur=e=>{if(e&&e.code==='session'){srvSessionPerdue();return;}if(e&&e.code==='exclu'){srvExclu(e);return;}toast({tone:'red',icon:'info',force:true,title:_t("Action impossible"),text:errTxt(e)});};

/* ----- Ce qui n'est pas encore relié au serveur est clairement indisponible en mode serveur -----
   La liste se vide au fil des lots (voir docs/PLAN.md). Le test tests/compte/garde.spec.mjs vérifie qu'aucune action
   qui touche au solde, à l'XP ou à un état partagé n'est exécutée localement quand le serveur fait autorité. */
const SRV_BLOQUE=new Set(('share-pick vote fr-add fr-accept fr-cancel fr-decline fr-remove '
 +'cp-start cp-stop-do cp-edit cp-manage cp-pause cp-stop cp-open limit-place ord-cancel guard guard-save guard-del dl-create dl-cancel dl-accept dl-share dl-decline duel-open stk-create stack-open '
 +'bz-join bz-rebuy bz-choose sr-start sr-cash sr-play sr-share cl-war-join cl-sim cl-join cl-apply cl-leave-do cl-share cl-promote cl-kick cl-invite cl-call-do cl-war cl-feedopt cl-create-open cl-leave cl-call-open cl-war-open '
 +'cb-place cb-cash cb-add cb-clear cb-rm cb-stake pro-sh-send pro-share follow-user follow-bet follow-pbet share dm ref-copy ref-share propose react '
 +'wallet wallet-modal demo-login demo-rank demo-rank-open demo-rank-reset').split(/\s+/));
const SRV_FORMS_BLOQUE=new Set(['create','clan','clcode']);
const srvBientot=()=>toast({tone:'amber',icon:'info',force:true,title:_t("Bientôt disponible avec ton compte"),text:_t("Cette fonction marche déjà en mode démo. Elle arrive pour les comptes.")});
function srvGarde(type,nom){
 if(!SRV())return true;
 if(!(type==='form'?SRV_FORMS_BLOQUE:SRV_BLOQUE).has(nom))return true;
 srvBientot();
 return false;
}

/* ----- Traductions de ce que le serveur envoie sous forme de code ----- */
const MISSION_L={dep1:()=>_t("Fais ton premier dépôt"),fb1:()=>_t("Joue une manche au marché éclair"),chat1:()=>_t("Écris ton premier message")};
const missionLabel=id=>MISSION_L[id]?MISSION_L[id]():id;
const badgeNom=id=>{const b=BADGES.find(x=>x.id===id);return b?b.n:id;};
const NOTIF_T={
 rank_up:p=>_t("Tu passes {0}.",[rankName(p.t,p.d)]),
 mission_done:p=>_t("Mission terminée : {0}. Récupère tes {1} XP.",[missionLabel(p.id),p.xp]),
 badge:p=>_t("Badge débloqué : {0}.",[badgeNom(p.id)]),
 bet_placed:p=>_t("Pari placé : {0} sur {1}, {2}.",[F.usd(+p.amt),p.s==='oui'?_t("Oui"):_t("Non"),MK[p.m]?MK[p.m].short:p.m]),
 dep_credited:p=>depNotifTxt({method:p.method,usd:+p.usd,amt:+p.amt,coin:p.coin,net:p.method&&FIAT[p.method]?FIAT[p.method].n:p.net}),
 wd_sent:p=>wdNotifTxt({method:p.method,amt:+p.recv,fee:0,net:p.method&&FIAT[p.method]?FIAT[p.method].n:p.net}),
 kyc_ok:()=>_t('Identité vérifiée : carte, virement et PayPal sont débloqués.'),
 rg_pause:p=>_t("Pause activée jusqu’au {0}.",[fmtDT(+p.at)]),
 flash_gagne:p=>_t("Éclair {0}, manche {1} : gagné, +{2}.",[GM[p.g]?GM[p.g].name:p.g,F.int(+p.r),F.usd(+p.pay)]),
 flash_perdu:p=>_t("Éclair {0}, manche {1} : perdu, −{2}.",[GM[p.g]?GM[p.g].name:p.g,F.int(+p.r),F.usd(+p.amt)]),
 rg_limite:p=>_t("Ta limite de dépôt {0} est maintenant {1}.",[winTxt(p.k),+p.v?F.usd0(+p.v):_t("retirée")])
};
const notifDe=n=>{let text=n.text||'';if(n.code&&NOTIF_T[n.code]){try{text=NOTIF_T[n.code](n.p||{});}catch(e){console.warn('[srv] notification illisible',n.code);}}return {id:n.id,ic:n.ic||'info',text,href:n.href||'',at:n.at,read:!!n.read};};
const missionDe=m=>({id:m.id,type:m.type,label:missionLabel(m.id),goal:m.goal,have:m.have,xp:m.xp,go:m.go||'#rang',claimed:!!m.claimed,day:today()});
/* dépôts, retraits et jeu responsable : du format du serveur à celui de l'écran */
const depDe=d=>({id:d.id,coin:d.coin,net:d.method&&FIAT[d.method]?FIAT[d.method].n:d.net,method:d.method||undefined,amt:+d.amt,fee:+d.fee||0,usd:+d.usd,at:d.at,due:d.due||0,conf:d.st==='pending'?(d.conf|0):(d.need||12),need:d.need||12,label:d.label||undefined});
const wdDe=w=>({id:w.id,net:w.method&&FIAT[w.method]?FIAT[w.method].n:w.net,addr:w.method&&FIAT[w.method]?FIAT[w.method].dest:w.addr,method:w.method||undefined,amt:+w.amt,fee:+w.fee||0,at:w.at,due:w.due||0,st:w.st});
const rgDe=r=>({lim:{day:+(r.lim||{}).day||0,week:+(r.lim||{}).week||0,month:+(r.lim||{}).month||0},pend:Object.assign({},r.pend||{}),pause:+r.pause||0,excl:+r.excl||0});
/* une ligne d'historique du pari éclair arrive sous la forme « eclair|jeu|manche » : son libellé est composé ici, dans la langue du lecteur */
const histDe=h=>{if(h.k==='flash'&&typeof h.q==='string'&&h.q.startsWith('eclair|')){const [,gid,r]=h.q.split('|'),d=GM[gid];
  return {k:'flash',q:d?_t("Éclair {0}, manche {1} : {2}",[d.name,F.int(+r),sideLabel(d,h.s)]):h.q,s:h.s==='non'?'non':'oui',eq:h.s==='be',win:!!h.win,pnl:+h.pnl,at:h.at};}
 return {k:h.k,m:h.m||undefined,q:h.m&&MK[h.m]?MK[h.m].q:(h.q||h.m||''),s:h.s,win:!!h.win,pnl:+h.pnl,at:h.at};};
const miseDe=m=>({id:m.id,s:m.s,amt:+m.amt,fee:+m.fee,net:+m.net,price:m.price,mult:+m.mult,tk:m.tk|0});

/* ----- Annuaire : les fiches des joueurs viennent du serveur, clé = identifiant du joueur ----- */
function srvFiches(map){for(const id in map||{}){const f=map[id];USERS[id]=Object.assign(USERS[id]||{},{n:f.n,t:f.t|0,d:f.d|0,tone:f.tone|0,profit:+f.profit||0,acc:f.acc|0,bets:f.bets|0,fol:f.fol|0,bio:f.bio||'',photo:f.photo||'',color:f.color||'',bot:!!f.bot,pub:f.pub===0?0:1});delete FANTOMES[id];}
 USER_IDS.length=0;USER_IDS.push(...Object.keys(USERS));}

/* ----- Hydratation : réponse de api_state → S.me ----- */
const SRV_PREFS=['fmode','fcat','falerts','fmute','ctype','tmode','watch','pro','blockedShown','refShared','prefs'];
const SRV_PROFIL=['color','interests'];
let SRV_VU={prefs:'',profil:''};
const prefsDe=me=>{const o={v:1};for(const k of SRV_PREFS)if(me[k]!==undefined)o[k]=me[k];return o;};
const profilDe=me=>JSON.stringify(SRV_PROFIL.map(k=>me[k]));
function hydrater(e){
 const b=e.me,me=newMe(b.n,b.email);                         /* tous les champs attendus par l'interface, à leur valeur de départ */
 Object.assign(me,{photo:'',deps:[],notifs:[],missions:[],friends:[],freqIn:[],freqOut:[]},b);
 me.logged=true;me.createdAt=b.since;me.since=new Date(b.since).toLocaleDateString(LOC,{month:'long',year:'numeric'});
 me.interests=(b.interests||[]).slice();
 me.positions=(e.positions||[]).filter(p=>MK[p.m]).map(p=>({m:p.m,s:p.s,sh:+p.sh,avg:+p.avg}));
 me.history=(e.history||[]).map(histDe);
 me.deps=(e.deps||[]).map(depDe);me.wds=(e.wds||[]).map(wdDe);if(e.rg)me.rg=rgDe(e.rg);
 /* pari éclair : les mises de la manche en cours sont rendues par le serveur (flashBoot les replace sur leurs paris) */
 {const b=e.eclair&&e.eclair.b||{};if(Object.keys(b).length){me.fmy={r:e.eclair.r,b:{}};for(const g in b)me.fmy.b[g]=miseDe(b[g]);}SRV_ECLAIR_DU=e.eclair?(e.eclair.du|0):0;}
 me.notifs=(e.notifs||[]).map(notifDe);me.missions=(e.missions||[]).map(missionDe);me.badges=(e.badges||[]).slice();
 me.friends=(e.friends||[]).slice();me.freqIn=(e.freqIn||[]).slice();me.freqOut=(e.freqOut||[]).slice();me.following=(e.following||[]).slice();
 const pr=e.prefs||{};for(const k of SRV_PREFS)if(pr[k]!==undefined)me[k]=pr[k];
 for(const id of USER_IDS.slice())delete USERS[id];        /* l'annuaire ne contient que des joueurs connus du serveur */
 srvFiches(e.users||{});
 S.me=me;S.auth={key:'srv:'+e.uid,demo:false,serveur:true};S.epoch++;KEY='wimoro-srv';
 SRV_VU={prefs:JSON.stringify(prefsDe(me)),profil:profilDe(me)};
 if(typeof FSKEW!=='undefined'&&typeof e.now==='number')FSKEW=e.now-Date.now();   /* le pari éclair suit l'horloge du serveur */
 /* le popup de rang ne se montre qu'une fois par rang et par compte : à l'arrivée, on enregistre le rang déjà atteint */
 const r=myRank(),rang=r.t*3+r.d;if(rang>(me.rankSeen|0)){me.rankSeen=rang;API.call('api_rank_seen',{p_rang:rang}).catch(()=>{});}
}

/* ----- Réponse d'une action : { me, ev, … } ----- */
function srvAppliquer(r,ev){if(!r)return;srvEtat(r);srvEvenements(r,ev);}
/* 1. l'état : ce que dit le serveur remplace ce que l'écran croyait */
function srvEtat(r){
 if(r.me){const garde={since:S.me.since,createdAt:S.me.createdAt,logged:true,interests:(r.me.interests||S.me.interests||[]).slice()};Object.assign(S.me,r.me,garde);}
}
/* 2. les événements : XP gagnée, notification, badge, mission, passage de rang */
function srvEvenements(r,ev){
 for(const e of r.ev||[]){
  if(e.k==='xp')floatXP('+'+e.n+' XP',ev);
  else if(e.k==='notif'){S.me.notifs.unshift(notifDe(e.n));S.me.notifs=S.me.notifs.slice(0,30);}
  else if(e.k==='badge'){if(!S.me.badges.includes(e.id))S.me.badges.push(e.id);toast({tone:'blue',icon:'star',title:_t("Badge débloqué"),text:badgeNom(e.id),href:'#profil'});}
  else if(e.k==='mission'){const m=S.me.missions.find(x=>x.id===e.id);if(m){m.have=e.have;if(e.have>=e.goal)toast({tone:'blue',icon:'gift',title:_t("Mission terminée"),text:_t("{0} : récupère tes {1} XP.",[m.label,m.xp]),href:'#rang'});}}
 }
 updateHeader();updateBell();refreshRankBits();
 const rg=myRank(),rang=rg.t*3+rg.d;
 if(rang>(S.me.rankSeen|0)){S.me.rankSeen=rang;setTimeout(()=>rankUp(rg),450);API.call('api_rank_seen',{p_rang:rang}).catch(()=>{});}
}

/* ----- Sauvegarde : seulement ce qui a changé, seulement les réglages (jamais d'argent, jamais d'XP) ----- */
let srvT=null;
function srvSauver(tout){clearTimeout(srvT);if(tout)srvEnvoyer();else srvT=setTimeout(srvEnvoyer,700);}
function srvEnvoyer(){
 if(!SRV()||!S.me.logged)return;
 const pj=JSON.stringify(prefsDe(S.me));
 if(pj!==SRV_VU.prefs){const avant=SRV_VU.prefs;SRV_VU.prefs=pj;API.call('api_prefs_save',{p_prefs:JSON.parse(pj)}).catch(e=>{SRV_VU.prefs=avant;console.warn('[srv] préférences non enregistrées',e.code);});}
 const fj=profilDe(S.me);
 if(fj!==SRV_VU.profil){const avant=SRV_VU.profil;SRV_VU.profil=fj;API.call('api_profile_update',{p:{color:S.me.color,interests:S.me.interests}}).catch(e=>{SRV_VU.profil=avant;console.warn('[srv] profil non enregistré',e.code);});}
}

/* ----- Marchés : état partagé, lu sur le serveur et tenu à jour par ses diffusions ----- */
async function srvMarches(){
 const r=await API.call('api_markets');
 for(const id in r.m||{}){const m=MK[id],x=r.m[id];if(!m)continue;
  m.p=+x.p;m.anchor=m.p;if(x.d0!=null)m.d0=+x.d0;m.vol=+x.vol;m.people=x.people|0;if(x.liq!=null)m.liq=+x.liq;m.hotUntil=x.hot||0;
  if(Array.isArray(x.ph)&&x.ph.length>1){m.ph=x.ph.slice(-160).map(Number);m.ph[m.ph.length-1]=m.p;}}
}
/* map : identifiant du marché → [prix, volume, participants, profondeur]. Le serveur a déjà recalculé les issues sœurs :
   updateMarket reçoit donc noGroup=true, pour ne pas rééquilibrer une seconde fois dans le navigateur (B16). */
function srvMarchesMaj(map){
 const vus=[];
 for(const id in map||{}){const m=MK[id],v=map[id];if(!m||!v)continue;const old=m.p,bouge=+v[0]!==m.p||+v[1]!==m.vol;m.p=+v[0];m.vol=+v[1];m.people=v[2]|0;if(v[3]!=null)m.liq=+v[3];
  if(bouge)vus.push([m,old]);else $$(`[data-liq="${id}"]`).forEach(e=>e.textContent=F.compact(bookDepth(m)*10));}   /* seule la profondeur a changé : pas de nouveau point sur la courbe */
 for(const [m,old] of vus)updateMarket(m,old,true);
 if(typeof groupRefresh==='function')for(const g of new Set(vus.map(x=>x[0].parent).filter(Boolean)))if(GK[g])groupRefresh(GK[g]);
}
/* un tick du serveur : marchés modifiés, traînée des mises des bots, signal de foule éventuel */
function srvTick(d){
 srvMarchesMaj(d.m);
 for(const b of d.b||[]){const m=MK[b[0]];if(m)addBet(m,{s:b[1]>0?1:0,a:+b[2]||0,me:0});}
 if(d.sig)srvSignal(d.sig);
}
function srvSignal(sig){const m=MK[sig.m];if(!m)return;m.hotUntil=now()+90000;
 for(let i=0;i<12;i++)addBet(m,{s:sig.s==='oui'?1:0,a:.25+Math.random()*.75,me:0});   /* la rafale laisse sa traînée, comme en mode local */
 addMsg('general',mkMsg({k:'sig',sig}));addMsg('m:'+m.id,mkMsg({k:'sig',sig}));markHot(m);
 toast({tone:sig.s==='oui'?'blue':'amber',icon:'flame',title:_t("Signal de foule"),text:_t("{0} personnes sur {1} : {2}",[sig.n,sig.s==='oui'?_t("Oui"):_t("Non"),m.short]),href:'#marche-'+m.id});}

/* ----- Acheter et vendre : l'écriture comptable est faite par le serveur, les effets d'interface sont ceux du mode local ----- */
const cleOp=()=>(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g,()=>Math.floor(Math.random()*16).toString(16));
function srvPosition(pos){const L=S.me.positions,i=L.findIndex(p=>p.m===pos.m&&p.s===pos.s);
 if(!(+pos.sh>0)){if(i>=0)L.splice(i,1);if(typeof dropGuard==='function')dropGuard(pos.m,pos.s);return;}
 if(i>=0){L[i].sh=+pos.sh;L[i].avg=+pos.avg;}else L.push({m:pos.m,s:pos.s,sh:+pos.sh,avg:+pos.avg});}
let srvOccupe=false;
const srvBoutons=oui=>$$('[data-a="buy"],[data-a="sell"]').forEach(b=>{b.disabled=!!oui;});
/* un seul ordre à la fois : les boutons restent grisés jusqu'à la réponse, même si l'écran est redessiné entre-temps */
const srvDebut=()=>{if(srvOccupe)return false;srvOccupe=true;srvBoutons(true);queueMicrotask(()=>{if(srvOccupe)srvBoutons(true);});return true;};
const srvFin=()=>{srvOccupe=false;updTicket('page');updTicket('sheet');};   /* le ticket recalcule l'état de ses boutons */
const surGroupe=m=>m&&m.parent&&(S.ui.route||'')==='marche-'+m.parent;
async function srvAcheter(ctx,ev,st,m,c){
 if(!srvDebut())return;
 try{
  const r=await API.call('api_buy',{p_market:m.id,p_side:st.side,p_total:Math.round(c.amt*100)/100,p_key:cleOp(),p_opts:{}});
  srvPosition(r.pos);
  /* le ticket affiche ce qui a réellement été exécuté */
  c.amt=+r.q.total;c.sh=+r.q.sh;c.price=+r.q.avg;c.fee=+r.q.fee;
  addBet(m,{s:st.side==='oui'?1:0,a:Math.min(1,c.amt/300),me:1});
  srvMarchesMaj(r.marches);srvEtat(r);
  betEffets(ctx,ev,st,m,c,null);srvEvenements(r,ev);                 /* même ordre qu'en mode local : « Pari placé », puis XP, badge, rang */
  if(surGroupe(m))render(false);
 }catch(e){srvErreur(e);}
 finally{srvFin();}
}
async function srvVendre(ctx,st,c){
 if(!srvDebut())return;
 try{
  const m=MK[st.m],r=await API.call('api_sell',{p_market:st.m,p_side:st.side,p_shares:c.sh,p_key:cleOp()});
  srvPosition(r.pos);S.me.history.unshift(histDe(r.hist));
  addBet(m,{s:st.side==='oui'?0:1,a:Math.min(1,(+r.q.pro)/300),me:1});
  srvMarchesMaj(r.marches);srvEtat(r);
  sellEffets(st,{pnl:+r.q.pnl,pro:+r.q.pro});srvEvenements(r);
  if(surGroupe(m))render(false);
 }catch(e){srvErreur(e);}
 finally{srvFin();}
}

/* ----- Argent fictif (dépôts, retraits, KYC) : l'écriture est faite par le serveur -----
   Un dépôt naît « en attente » ; l'écran fait défiler ses confirmations (affichage seulement) puis demande le règlement.
   Si l'onglet est fermé avant, le serveur règle de lui-même au chargement suivant : rien ne reste bloqué ni ne s'annule. */
let srvArgentT=null,srvRegle=false,srvArgentOccupe=false;
const srvHeure=()=>Date.now()+(typeof FSKEW!=='undefined'?FSKEW:0);
function srvArgentSuivre(){
 if(srvArgentT)return;
 srvArgentT=setInterval(()=>{
  const deps=S.me.deps.filter(d=>d.id&&d.due&&d.conf<d.need),wds=S.me.wds.filter(x=>x.id&&x.due&&x.st!=='sent');
  if(!deps.length&&!wds.length){clearInterval(srvArgentT);srvArgentT=null;return;}
  const t=srvHeure();let du=false;
  for(const d of deps){if(t>=d.due)du=true;d.conf=Math.min(d.need-1,Math.max(d.conf,Math.floor(d.need*(t-d.at)/Math.max(1,d.due-d.at))));}
  for(const x of wds)if(t>=x.due)du=true;
  if(deps.length)refreshDeps();
  if(du)srvRegler();
 },325);
}
async function srvRegler(){
 if(srvRegle)return;srvRegle=true;
 try{
  const r=await API.call('api_demo_settle');
  srvEtat(r);S.me.deps=(r.deps||[]).map(depDe);S.me.wds=(r.wds||[]).map(wdDe);
  const credites=(r.ev||[]).filter(e=>e.k==='dep').map(e=>S.me.deps.find(d=>d.id===e.id)).filter(Boolean);
  credites.forEach(depCredite);
  (r.ev||[]).filter(e=>e.k==='wd').map(e=>S.me.wds.find(x=>x.id===e.id)).filter(Boolean).forEach(wdEnvoye);
  srvEvenements(r);refreshDeps();
  if(credites.length)depRendu();
 }catch(e){if(e.code==='session'||e.code==='exclu')srvErreur(e);else console.warn('[srv] règlement remis à plus tard',e.code);}
 finally{srvRegle=false;}
}
async function srvDepot(p){
 if(srvArgentOccupe)return;srvArgentOccupe=true;
 try{const r=await API.call('api_demo_deposit',{p,p_key:cleOp()});const d=depDe(r.dep);S.me.deps.unshift(d);srvAppliquer(r);depDetecte(d);srvArgentSuivre();}
 catch(e){srvErreur(e);}
 finally{srvArgentOccupe=false;}
}
async function srvRetrait(p,apres){
 if(srvArgentOccupe)return;srvArgentOccupe=true;
 try{const r=await API.call('api_demo_withdraw',{p,p_key:cleOp()});const x=wdDe(r.wd);S.me.wds.unshift(x);srvEtat(r);if(apres)apres();wdLance(x);srvEvenements(r);srvArgentSuivre();}
 catch(e){srvErreur(e);}
 finally{srvArgentOccupe=false;}
}
/* la « vérification » dure au moins 1,5 s, comme en mode local */
async function srvKyc(p,fini,echec){
 try{const [r]=await Promise.all([API.call('api_demo_kyc',{p}),new Promise(ok=>setTimeout(ok,1500))]);srvAppliquer(r);fini();}
 catch(e){srvErreur(e);if(echec)echec();}
}

/* ----- Pari éclair : la mise et le règlement sont faits par l'Edge Function « eclair », avec le même moteur que l'écran -----
   Miser : l'heure du serveur décide de la manche et du tick ; la réponse rend la mise telle qu'elle a été enregistrée.
   Régler : à la fin d'une manche (ou au chargement s'il reste des manches à régler), le serveur rejoue la manche et crédite. */
let SRV_ECLAIR_DU=0,srvEclairOccupe=false,srvEclairRegle=false;
function srvEclairPoser(d,g,m){const my=miseDe(m),e=MoteurEclair.etat(d,S.flash.round,g.tk,my);g.pool=e.pool;g.players=e.players;g.my=my;
 const b={s:SIDEV[my.s],a:Math.min(1,my.amt/60),me:1};g.bets.push(b);if(d.id===S.ui.fgame)trailPush('flash',b);
 if(!S.me.fmy||S.me.fmy.r!==S.flash.round)S.me.fmy={r:S.flash.round,b:{}};S.me.fmy.b[d.id]=my;}
async function srvEclairMiser(d,g,side,amt,ev){
 if(srvEclairOccupe)return;srvEclairOccupe=true;
 try{
  const r=await API.fn('eclair',{action:'bet',gid:d.id,side,amt,key:cleOp()});
  if(typeof r.now==='number')FSKEW=r.now-Date.now();
  if(r.mise&&r.mise.r===S.flash.round&&!g.my)srvEclairPoser(d,g,r.mise);
  srvAppliquer(r,ev);updateFlash(true);
 }catch(e){
  if(e.code==='mises_fermees')toast({tone:'amber',icon:'lock',title:_t("Mises fermées"),text:errTxt(e)});
  else if(e.code==='deja_mise')toast({icon:'info',title:_t("Tu as déjà misé sur ce pari"),text:errTxt(e)});
  else if(e.code==='be_plein')toast({tone:'amber',icon:'info',title:_t("Mise trop grosse pour le break even"),text:errTxt(e)});
  else srvErreur(e);
 }finally{srvEclairOccupe=false;}
}
/* fin de manche : on laisse une petite seconde à l'horloge du serveur pour changer de manche, puis on demande le règlement */
function srvEclairApresManche(n){setTimeout(()=>srvEclairRegler(n,0),900);}
async function srvEclairRegler(attendus,essai){
 if(srvEclairRegle)return;srvEclairRegle=true;let encore=0;
 try{
  const r=await API.fn('eclair',{action:'settle'});
  if(typeof r.now==='number')FSKEW=r.now-Date.now();
  srvEtat(r);
  for(const h of r.hist||[])S.me.history.unshift(histDe(h));
  for(const x of r.regles||[]){const d=GM[x.g];if(d)flashAnnonce(d,+x.r,{s:x.s,amt:+x.amt},!!x.win,+x.pay,!!x.tard);}
  srvEvenements(r);SRV_ECLAIR_DU=r.eclair?(r.eclair.du|0):0;
  encore=(attendus|0)-(r.regles||[]).length;
 }catch(e){if(e.code==='session'||e.code==='exclu')srvErreur(e);else console.warn('[srv] règlement éclair remis à plus tard',e.code);}
 finally{srvEclairRegle=false;}
 if(encore>0&&(essai|0)<3)setTimeout(()=>srvEclairRegler(encore,(essai|0)+1),1500);   /* l'horloge du serveur était encore dans la manche */
}

/* ----- Chat : salons publics (général et marchés) -----
   On ne s'abonne qu'aux salons affichés (srvSalons, appelé après chaque rendu). À l'ouverture d'un salon : son historique,
   puis les messages en direct. Chaque message diffusé porte la fiche de son auteur (pseudo, rang) : pas d'autre requête. */
const SRV_SALONS=new Set(),SRV_MSG_VUS=new Set();
const srvSalonOuvert=r=>r==='general'||r.startsWith('m:');
const srvMoi=()=>String(S.auth.key||'').slice(4);
function srvChatAjouter(rid,m){
 if(!m||SRV_MSG_VUS.has(m.id))return;SRV_MSG_VUS.add(m.id);
 if(m.f)srvFiches({[m.u]:m.f});
 addMsg(rid,mkMsg({u:m.u===srvMoi()?'me':m.u,k:'msg',text:m.text,at:m.at,sid:m.id}));
}
function srvSalons(){
 const vus=new Set(Array.from(document.querySelectorAll('.feed[data-room]')).map(f=>f.dataset.room).filter(srvSalonOuvert));
 if(document.querySelector('[data-hcmini]'))vus.add('general');
 for(const r of vus)if(!SRV_SALONS.has(r)){SRV_SALONS.add(r);srvSalonOuvrir(r);}
 for(const r of Array.from(SRV_SALONS))if(!vus.has(r)){SRV_SALONS.delete(r);API.unsubscribe('salon:'+r);}
}
async function srvSalonOuvrir(r){
 try{
  await API.subscribe('salon:'+r,(evt,d)=>{if(evt==='msg')srvChatAjouter(r,d);});
  const h=await API.call('api_chat_history',{p_room:r});
  srvFiches(h.users);(h.msgs||[]).forEach(m=>srvChatAjouter(r,m));
 }catch(e){SRV_SALONS.delete(r);console.warn('[srv] salon indisponible',r,e.code);}
}
let srvChatOccupe=false;
async function srvChatEnvoyer(rid,inp,text){
 if(!srvSalonOuvert(rid)){srvBientot();return;}                 /* VIP, clan, privé : pas encore reliés */
 if(srvChatOccupe)return;srvChatOccupe=true;
 try{
  const r=await API.call('api_chat_send',{p_room:rid,p_text:text});
  if(inp.value.trim()===text)inp.value='';
  srvChatAjouter(rid,r.msg);
  const b=inp.getBoundingClientRect();srvAppliquer(r,{clientX:b.left+Math.min(b.width-40,160),clientY:b.top});
 }catch(e){srvErreur(e);}
 finally{srvChatOccupe=false;}
}

/* ----- Missions : la récompense est donnée par le serveur ----- */
async function srvReclamer(m,ev,fini){
 try{const r=await API.call('api_mission_claim',{p_id:m.id});if(r.missions)S.me.missions=r.missions.map(missionDe);else m.claimed=true;srvAppliquer(r,ev);fini();}
 catch(e){srvErreur(e);if(e.code==='mission_indisponible'){m.claimed=true;fini();}}
}

/* ----- Jeu responsable : plafonds, pause, auto-exclusion décidés par le serveur ----- */
async function srvRg(nom,args,apres){
 try{const r=await API.call(nom,args);if(r.rg)S.me.rg=rgDe(r.rg);srvAppliquer(r);if(apres)apres(r);}
 catch(e){srvErreur(e);}
}
const srvNote=t=>{try{sessionStorage.setItem('wimoro-note',t);}catch(e){}};
async function srvExclure(mois){
 try{
  const r=await API.call('api_rg_exclude',{p_months:mois});
  srvNote(_t("Auto-exclusion enregistrée. {0}",[r.excl===-1?_t("Ton compte est fermé définitivement."):_t("Ton compte est fermé jusqu’au {0}.",[fmtD(+r.excl)])]));
  await API.signOut();LS.r(SESK);srvRecharger('#connexion');
 }catch(e){srvErreur(e);}
}
/* le serveur refuse toute fonction à un compte en auto-exclusion : on ferme la session et on explique pourquoi */
let srvExcluVu=false;
function srvExclu(e){if(srvExcluVu)return;srvExcluVu=true;const d=+(e&&e.cause&&e.cause.details);
 srvNote(d===-1?_t("Ce compte est fermé définitivement à la demande de son titulaire (auto-exclusion)."):_t("Ce compte est en auto-exclusion jusqu’au {0}. La connexion est impossible avant cette date.",[fmtD(d)]));
 API.signOut().then(()=>{LS.r(SESK);srvRecharger('#connexion');});}

/* Présence : tant que l'onglet est visible, le site dit au serveur qu'un joueur regarde (toutes les 4 minutes). Sans joueur
   présent, les bots du serveur passent en veille et ne diffusent plus rien (voir supabase/migrations/…_bots_veille.sql). */
planifier('serveur : présence',240000,()=>{if(!document.hidden&&S.me.logged)API.call('api_present').catch(()=>{});},'serveur');

/* ----- Démarrage en mode serveur ----- */
async function bootServeur(){
 const [etat]=await Promise.all([API.loadState(),srvMarches().catch(e=>console.warn('[srv] marchés indisponibles',e.code))]);
 hydrater(etat);srvArgentSuivre();
 if(SRV_ECLAIR_DU>0)setTimeout(()=>srvEclairRegler(0,3),1200);                 /* des manches jouées avant le rechargement restent à régler */
 API.on('session',()=>srvSessionPerdue());
 API.subscribe('marches',(evt,d)=>{if(evt==='tick')srvTick(d);}).catch(e=>console.warn('[srv] temps réel indisponible',e.code));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)srvRafraichir();});
}
/* au retour sur l'onglet : on relit l'état (un autre appareil a pu jouer entre-temps) */
let srvVu=0;
async function srvRafraichir(){
 if(!SRV()||Date.now()-srvVu<15000)return;srvVu=Date.now();
 try{const [etat]=await Promise.all([API.loadState(),srvMarches().catch(()=>{})]);const ui={ob:S.ui.ob};hydrater(etat);S.ui.ob=ui.ob;srvArgentSuivre();updateHeader();updateBell();render(false);}
 catch(e){if(e.code==='session')srvSessionPerdue();}
}
function srvRecharger(hash,apres){try{if(apres)sessionStorage.setItem('wimoro-apres',apres);}catch(e){}try{history.replaceState(null,'',location.pathname+location.search+(hash||'#accueil'));}catch(e){location.hash=hash||'#accueil';}location.reload();}
let srvPerdue=false;
function srvSessionPerdue(){if(srvPerdue)return;srvPerdue=true;srvRecharger('#connexion','expire');}
function ecranErreurServeur(e){
 $('#view').innerHTML=`<div class="wrap"><div class="pn pad" style="max-width:520px;margin:48px auto;text-align:center"><div class="h2">${_t("Connexion au serveur impossible")}</div><p class="sub" style="margin:10px 0 18px;font-size:15px;line-height:1.55">${_t("Ton compte est intact. Vérifie ta connexion, puis réessaie. Tu peux aussi explorer le mode démo en attendant.")}</p><div class="hbtns" style="justify-content:center"><button class="btn b-oui lg" data-a="srv-retry">${_t("Réessayer")}</button><button class="btn b-white lg" data-a="srv-demo">${_t("Passer en mode démo")}</button></div></div></div>`;
 document.body.classList.add('out');console.warn('[srv] démarrage impossible',e&&e.code);
}

/* ----- Comptes ----- */
const btnOccupe=(f,oui)=>{const b=f&&f.querySelector('[type=submit]');if(b)b.disabled=!!oui;};
async function srvConnexion(f,identifiant,motDePasse,err){
 err.textContent=_t("Connexion…");btnOccupe(f,true);
 try{await API.signIn(identifiant,motDePasse);srvRecharger(S.ui.after&&!/connexion|inscription/.test(S.ui.after)?S.ui.after:'#accueil','connexion');}
 catch(e){err.textContent=errTxt(e);btnOccupe(f,false);}
}
async function srvInscription(f,o,err){
 err.textContent=_t("Création du compte…");btnOccupe(f,true);
 try{
  if(!(await API.call('api_pseudo_libre',{p_pseudo:o.pseudo}))){err.textContent=_t("Ce pseudo est déjà pris.");btnOccupe(f,false);return;}
  const etat=await API.signUp(o);
  if(etat==='connecte'){srvRecharger('#bienvenue','inscription');return;}
  S.ui.authWait=o.email;err.textContent='';render(false);            /* confirmation d'e-mail active : écran « vérifie ta boîte mail » */
 }catch(e){err.textContent=errTxt(e);btnOccupe(f,false);}
}
async function srvDeconnexion(){clearTimeout(srvT);srvEnvoyer();await API.signOut();LS.r(SESK);srvRecharger('#connexion','deconnexion');}
/* message affiché après le rechargement qui suit un changement de mode */
function srvApres(){let k='';try{k=sessionStorage.getItem('wimoro-apres')||'';sessionStorage.removeItem('wimoro-apres');}catch(e){}
 if(k==='connexion'&&SRV())toast({tone:'blue',icon:'check',title:_t("Content de te revoir, {0}",[S.me.n]),text:_t("{0}, solde {1}",[rankName(myRank().t,myRank().d),F.usd(S.me.balance)])});
 else if(k==='inscription'&&SRV())toast({tone:'blue',icon:'check',title:_t("Compte créé, bienvenue {0} !",[S.me.n]),text:_t("Encore 5 petites étapes.")});
 else if(k==='deconnexion')toast({icon:'out',title:_t("Tu es déconnecté"),text:_t("À bientôt sur Wimoro.")});
 else if(k==='expire')toast({tone:'amber',icon:'lock',force:true,title:_t("Ta session a expiré. Reconnecte-toi.")});
 else if(k==='motdepasse'&&SRV())toast({tone:'blue',icon:'check',title:_t("Mot de passe mis à jour"),text:_t("Tu es connecté avec ton nouveau mot de passe.")});}

/* ----- Onboarding et profil ----- */
async function srvOnboarding(p,ev){try{const r=await API.call('api_onboarding',{p});srvAppliquer(r,ev);return true;}catch(e){srvErreur(e);return false;}}
async function srvProfil(patch){const r=await API.call('api_profile_update',{p:patch});srvAppliquer(r);SRV_VU.profil=profilDe(S.me);return r;}

Object.assign(ACT,{
 'srv-retry':()=>location.reload(),
 'srv-demo':async()=>{await API.signOut();LS.s(SESK,'__demo__');srvRecharger('#accueil');}
});
