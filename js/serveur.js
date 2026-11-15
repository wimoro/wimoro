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
 bio_trop_longue:()=>_t("Ta bio est trop longue (160 caractères au plus).")
};
const errTxt=e=>{const c=e&&e.code||'';return ERR_TXT[c]?ERR_TXT[c]():_t("Une erreur est survenue. Réessaie.");};
const srvErreur=e=>{if(e&&e.code==='session'){srvSessionPerdue();return;}toast({tone:'red',icon:'info',force:true,title:_t("Action impossible"),text:errTxt(e)});};

/* ----- Ce qui n'est pas encore relié au serveur est clairement indisponible en mode serveur -----
   La liste se vide au fil des lots (voir docs/PLAN.md). Le test tests/compte/garde.spec.mjs vérifie qu'aucune action
   qui touche au solde, à l'XP ou à un état partagé n'est exécutée localement quand le serveur fait autorité. */
const SRV_BLOQUE=new Set(('buy sell flash-bet share-pick claim withdraw vote fr-add fr-accept fr-cancel fr-decline fr-remove fiat-dep fiat-wd sim-dep '
 +'cp-start cp-stop-do cp-edit cp-manage cp-pause cp-stop cp-open limit-place ord-cancel guard guard-save guard-del dl-create dl-cancel dl-accept dl-share dl-decline duel-open stk-create stack-open '
 +'bz-join bz-rebuy bz-choose sr-start sr-cash sr-play sr-share cl-war-join cl-sim cl-join cl-apply cl-leave-do cl-share cl-promote cl-kick cl-invite cl-call-do cl-war cl-feedopt cl-create-open cl-leave cl-call-open cl-war-open '
 +'cb-place cb-cash cb-add cb-clear cb-rm cb-stake pro-sh-send pro-share follow-user follow-bet follow-pbet share dm ref-copy ref-share rg-pause-do rg-excl-do rg-pend-cancel rg-pause rg-excl kyc propose react '
 +'wallet wallet-modal demo-login demo-rank demo-rank-open demo-rank-reset').split(/\s+/));
const SRV_FORMS_BLOQUE=new Set(['create','clan','clcode','rglim','kyc','simdep','chat']);
function srvGarde(type,nom){
 if(!SRV())return true;
 if(!(type==='form'?SRV_FORMS_BLOQUE:SRV_BLOQUE).has(nom))return true;
 toast({tone:'amber',icon:'info',force:true,title:_t("Bientôt disponible avec ton compte"),text:_t("Cette fonction marche déjà en mode démo. Elle arrive pour les comptes.")});
 return false;
}

/* ----- Traductions de ce que le serveur envoie sous forme de code ----- */
const MISSION_L={dep1:()=>_t("Fais ton premier dépôt"),fb1:()=>_t("Joue une manche au marché éclair"),chat1:()=>_t("Écris ton premier message")};
const missionLabel=id=>MISSION_L[id]?MISSION_L[id]():id;
const badgeNom=id=>{const b=BADGES.find(x=>x.id===id);return b?b.n:id;};
const NOTIF_T={
 rank_up:p=>_t("Tu passes {0}.",[rankName(p.t,p.d)]),
 mission_done:p=>_t("Mission terminée : {0}. Récupère tes {1} XP.",[missionLabel(p.id),p.xp]),
 badge:p=>_t("Badge débloqué : {0}.",[badgeNom(p.id)])
};
const notifDe=n=>{let text=n.text||'';if(n.code&&NOTIF_T[n.code]){try{text=NOTIF_T[n.code](n.p||{});}catch(e){console.warn('[srv] notification illisible',n.code);}}return {id:n.id,ic:n.ic||'info',text,href:n.href||'',at:n.at,read:!!n.read};};
const missionDe=m=>({id:m.id,type:m.type,label:missionLabel(m.id),goal:m.goal,have:m.have,xp:m.xp,go:m.go||'#rang',claimed:!!m.claimed,day:today()});
const histDe=h=>({k:h.k,m:h.m||undefined,q:h.m&&MK[h.m]?MK[h.m].q:(h.q||h.m||''),s:h.s,win:!!h.win,pnl:+h.pnl,at:h.at});

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
 me.deps=(e.deps||[]).map(d=>({coin:d.coin,net:d.net,amt:+d.amt,usd:+d.usd,at:d.at,conf:d.st==='pending'?(d.conf|0):(d.need||12),need:d.need||12,label:d.label||undefined}));
 me.wds=(e.wds||[]).map(w=>({net:w.net,addr:w.addr,amt:+w.amt,fee:0,at:w.at,st:w.st}));
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
function srvAppliquer(r,ev){
 if(!r)return;
 if(r.me){const garde={since:S.me.since,createdAt:S.me.createdAt,logged:true,interests:(r.me.interests||S.me.interests||[]).slice()};Object.assign(S.me,r.me,garde);}
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

/* ----- Marchés : état partagé, lu sur le serveur ----- */
async function srvMarches(){
 const rows=await API.call('get_markets');
 for(const row of rows||[]){const m=MK[row.market_id];if(!m)continue;
  m.p=clamp(+row.current_probability,1,99);if(row.anchor_probability!=null)m.anchor=clamp(+row.anchor_probability,5,95);
  if(row.volume_total!=null)m.vol=+row.volume_total;if(row.participants_count!=null)m.people=row.participants_count|0;
  if(row.liquidity_depth!=null)m.liq=+row.liquidity_depth;
  const ph=row.price_history;if(Array.isArray(ph)&&ph.length>10){m.ph=ph.slice(-160).map(Number);m.ph[m.ph.length-1]=m.p;m.d0=m.ph[0];}}
}

/* ----- Démarrage en mode serveur ----- */
async function bootServeur(){
 const [etat]=await Promise.all([API.loadState(),srvMarches().catch(e=>console.warn('[srv] marchés indisponibles',e.code))]);
 hydrater(etat);
 API.on('session',()=>srvSessionPerdue());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)srvRafraichir();});
}
/* au retour sur l'onglet : on relit l'état (un autre appareil a pu jouer entre-temps) */
let srvVu=0;
async function srvRafraichir(){
 if(!SRV()||Date.now()-srvVu<15000)return;srvVu=Date.now();
 try{const [etat]=await Promise.all([API.loadState(),srvMarches().catch(()=>{})]);const ui={ob:S.ui.ob};hydrater(etat);S.ui.ob=ui.ob;updateHeader();updateBell();render(false);}
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
