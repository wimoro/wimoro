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
 suspendu:()=>_t("Ce compte est suspendu."),
 inscriptions_closes:()=>_t("Blitz en cours : les inscriptions sont closes. Suis la partie et le chat, le prochain Blitz arrive juste après."),
 deja_inscrit:()=>_t("Tu es déjà inscrit à ce Blitz."),
 elimine:()=>_t("Tu as été éliminé cette fois."),
 rachat_indisponible:()=>_t("Le rachat n’est plus possible."),
 rachat_fait:()=>_t("Le rachat n’est plus possible."),
 combine_incomplet:()=>_t("Combiné incomplet"),
 selection_en_double:()=>_t("Ce marché est déjà dans ton combiné."),
 combine_indisponible:()=>_t("Ce combiné n’est plus disponible."),
 duel_indisponible:()=>_t("Ce duel n’est plus disponible."),
 cote_indisponible:()=>_t("La cote du marché ne permet pas ce duel pour l’instant."),
 trop_de_duels:()=>_t("Tu as déjà trop de duels en attente de réponse."),
 serie_en_cours:()=>_t("Tu as déjà une série en cours."),
 serie_absente:()=>_t("Cette série est terminée."),
 deja_choisi:()=>_t("Ton choix est déjà fait pour cette manche."),
 choix_fermes:()=>_t("Choix fermés"),
 trop_vite:()=>_t("Pas si vite : attends une seconde entre deux messages."),
 message_repete:()=>_t("Tu viens d’envoyer ce message."),
 trop_de_messages:()=>_t("Trop de messages d’un coup. Réessaie dans une minute."),
 message_trop_long:()=>_t("Message trop long (280 caractères au plus)."),
 salon_indisponible:()=>_t("Ce salon n’est pas encore disponible avec ton compte."),
 pas_amis:()=>_t("Vous devez être amis pour vous écrire."),
 rang_insuffisant:()=>_t("Ton rang ne permet pas encore cette action."),
 joueur_inconnu:()=>_t("Ce joueur est introuvable."),
 demande_absente:()=>_t("Cette demande d’ami n’existe plus."),
 trop_de_demandes:()=>_t("Trop de demandes d’ami d’un coup. Réessaie dans une heure."),
 mises_fermees:()=>_t("La prochaine manche arrive dans quelques secondes."),
 deja_mise:()=>_t("Une mise par pari et par manche. Tu peux jouer les autres paris éclair."),
 be_plein:()=>_t("La cagnotte de cette manche ne peut plus couvrir de break even.")
};
const errTxt=e=>{const c=e&&e.code||'';return ERR_TXT[c]?ERR_TXT[c]():_t("Une erreur est survenue. Réessaie.");};
const srvErreur=e=>{if(e&&e.code==='session'){srvSessionPerdue();return;}if(e&&e.code==='exclu'){srvExclu(e);return;}if(e&&e.code==='suspendu'){srvSuspendu(e);return;}toast({tone:'red',icon:'info',force:true,title:_t("Action impossible"),text:errTxt(e)});};

/* ----- Ce qui n'est pas encore relié au serveur est clairement indisponible en mode serveur -----
   La liste se vide au fil des lots (voir docs/PLAN.md). Le test tests/compte/garde.spec.mjs vérifie qu'aucune action
   qui touche au solde, à l'XP ou à un état partagé n'est exécutée localement quand le serveur fait autorité. */
const SRV_BLOQUE=new Set(('share-pick vote '
 +'cp-start cp-stop-do cp-edit cp-manage cp-pause cp-stop cp-open limit-place ord-cancel guard guard-save guard-del stk-create stack-open '
 +'sr-share cl-war-join cl-sim cl-join cl-apply cl-leave-do cl-share cl-promote cl-kick cl-invite cl-call-do cl-war cl-feedopt cl-create-open cl-leave cl-call-open cl-war-open '
 +'pro-sh-send pro-share follow-user follow-bet follow-pbet share ref-copy ref-share propose react '
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
 marche_resolu:p=>+p.pay>0?_t("Marché résolu : {0}. Tu gagnes {1}.",[MK[p.m]?MK[p.m].short:p.m,F.usd(+p.pay)]):_t("Marché résolu : {0}. Ta position {1} est perdue.",[MK[p.m]?MK[p.m].short:p.m,p.s==='oui'?_t("Oui"):_t("Non")]),
 duel_recu:p=>_t("{0} te défie : {1}, {0} dit {2} pour {3}.",[userOf(p.u).n,MK[p.m]?MK[p.m].short:p.m,p.s==='oui'?_t("Oui"):_t("Non"),F.usd0(+p.k)]),
 duel_accepte:p=>_t("{0} a accepté ton duel : {1}, cagnotte {2}.",[userOf(p.u).n,MK[p.m]?MK[p.m].short:p.m,F.usd(+p.pot)]),
 duel_decline:p=>_t("{0} a décliné ton duel sur {1}. Ta mise t’est rendue.",[userOf(p.u).n,MK[p.m]?MK[p.m].short:p.m]),
 duel_expire:p=>_t("Duel expiré sans réponse : {0}. Ta mise t’est rendue.",[MK[p.m]?MK[p.m].short:p.m]),
 duel_gagne:p=>_t("{0} contre {1} : {2}.",[_t("Duel gagné"),userOf(p.u).n,MK[p.m]?MK[p.m].short:p.m]),
 duel_perdu:p=>_t("{0} contre {1} : {2}.",[_t("Duel perdu"),userOf(p.u).n,MK[p.m]?MK[p.m].short:p.m]),
 combo_gagne:p=>_t("Combiné gagné : +{0}",[F.usd(+p.gain)]),
 combo_perdu:p=>_t("Combiné {0} sélections : perdu sur {1}",[p.n,MK[p.m]?MK[p.m].short:p.m]),
 blitz_gagne:p=>_t("Blitz gagné : +{0}",[F.usd(+p.gain-+p.paye)]),
 admin_solde:p=>+p.delta>=0?_t("Ton solde a été crédité de {0} par l’équipe Wimoro.",[F.usd(+p.delta)]):_t("Ton solde a été débité de {0} par l’équipe Wimoro.",[F.usd(-p.delta)]),
 dep_credited:p=>depNotifTxt({method:p.method,usd:+p.usd,amt:+p.amt,coin:p.coin,net:p.method&&FIAT[p.method]?FIAT[p.method].n:p.net}),
 wd_sent:p=>wdNotifTxt({method:p.method,amt:+p.recv,fee:0,net:p.method&&FIAT[p.method]?FIAT[p.method].n:p.net}),
 kyc_ok:()=>_t('Identité vérifiée : carte, virement et PayPal sont débloqués.'),
 rg_pause:p=>_t("Pause activée jusqu’au {0}.",[fmtDT(+p.at)]),
 dm_recu:p=>_t("{0} t’a écrit.",[p.n||'']),
 fr_demande:p=>_t("{0} veut t’ajouter en ami.",[p.n||'']),
 fr_acceptee:p=>_t("{0} a accepté ta demande d’ami.",[p.n||'']),
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
/* une ligne d'historique du pari éclair arrive sous la forme « eclair|jeu|manche », une série sous la forme
   « serie|jeu|manches gagnées|manche atteinte|multiplicateur » : leur libellé est composé ici, dans la langue du lecteur */
const histSerie=h=>{const [,gid,won,step,mult]=h.q.split('|'),nom=GM[gid]?GM[gid].name:gid;
 return {k:'serie',q:h.win?_t("La Série {0} : {1} sur {1}, encaissé à ×{2}",[nom,won,F.d1(+mult)]):_t("La Série {0} : {1} sur {2}",[nom,won,step]),s:h.s,win:!!h.win,pnl:+h.pnl,at:h.at};};
const histBlitz=h=>{const [,res,n]=h.q.split('|');return {k:'blitz',q:res==='g'?_t("Blitz Royale : survivant sur {0}",[F.int(+n)]):_t("Blitz Royale : éliminé"),s:h.s,win:!!h.win,pnl:+h.pnl,at:h.at};};
const histDuel=h=>{const [,u,m]=h.q.split('|');return {k:'duel',q:_t("Duel contre {0} : {1}",[userOf(u).n,MK[m]?MK[m].short:m]),s:h.s,win:!!h.win,pnl:+h.pnl,at:h.at};};
const histCombo=h=>{const [,res,n,x]=h.q.split('|');
 return {k:'combo',q:res==='c'?_t("Combiné {0} sélections, encaissé à {1}",[n,F.usd(+x)]):res==='g'?_t("Combiné {0} sélections gagné à ×{1}",[n,F.d2(+x)]):_t("Combiné {0} sélections : perdu sur {1}",[n,MK[x]?MK[x].short:x]),s:h.s,win:!!h.win,pnl:+h.pnl,at:h.at};};
const histDe=h=>{if(typeof h.q==='string'&&h.q.startsWith('combo|'))return histCombo(h);if(typeof h.q==='string'&&h.q.startsWith('duel|'))return histDuel(h);if(h.k==='flash'&&typeof h.q==='string'&&h.q.startsWith('serie|'))return histSerie(h);if(h.k==='flash'&&typeof h.q==='string'&&h.q.startsWith('blitz|'))return histBlitz(h);if(h.k==='flash'&&typeof h.q==='string'&&h.q.startsWith('eclair|')){const [,gid,r]=h.q.split('|'),d=GM[gid];
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
 me.serie=serieDe(e.serie);SRV_BZ.aRegler=(e.blitz||[]).slice();
 me.combos=(e.combos||[]).map(comboDe);
 if(e.duels){srvFiches(e.duels.users);me.duels=(e.duels.liste||[]).map(x=>duelDe(x,e.uid));}   /* au démarrage, l'identifiant du joueur vient de l'état lui-même */
 me.notifs=(e.notifs||[]).map(notifDe);me.missions=(e.missions||[]).map(missionDe);me.badges=(e.badges||[]).slice();
 me.friends=(e.friends||[]).slice();me.freqIn=(e.freqIn||[]).slice();me.freqOut=(e.freqOut||[]).slice();me.following=(e.following||[]).slice();
 const pr=e.prefs||{};for(const k of SRV_PREFS)if(pr[k]!==undefined)me[k]=pr[k];
 for(const id of USER_IDS.slice())delete USERS[id];        /* l'annuaire ne contient que des joueurs connus du serveur */
 if(typeof srvClassementVu!=='undefined')srvClassementVu=0;   /* l'annuaire est vidé : le classement sera redemandé */
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
/* Un marché créé depuis le panel d'administration : le serveur le décrit (x.def), l'écran l'ajoute à son catalogue. */
function srvMarcheAjouter(id,x){const d=x.def;if(!d||MK[id])return;
 const m=Object.assign({id,cat:d.cat,q:d.q,short:d.short,p:+x.p,d0:x.d0!=null?+x.d0:+x.p,vol:+x.vol||0,people:x.people|0,msgs:0,heat:+d.heat||1.5,rules:d.rules||'',srv:true},closeOf(d.date,d.time));
 m.anchor=m.p;m.ph=seedPh(m);m.bets=[];m.online=0;m.hotUntil=0;MARKETS.push(m);MK[id]=m;}
/* Un marché résolu quitte les listes (et son groupe d'issues) ; il reste connu par son identifiant, pour l'historique. */
function srvMarcheRetirer(id){const m=MK[id];if(!m||m.st==='resolved')return;m.st='resolved';
 const i=MARKETS.indexOf(m);if(i>=0)MARKETS.splice(i,1);
 const g=m.parent&&GK[m.parent];if(g){g.outcomes=g.outcomes.filter(o=>o!==m);if(!g.outcomes.length){const k=GROUPS.indexOf(g);if(k>=0)GROUPS.splice(k,1);delete GK[g.id];}}
 const w=S.me.watch||[],k=w.indexOf(id);if(k>=0)w.splice(k,1);
 const h=S.ui.route||'';if(h==='marche-'+id||(m.parent&&h==='marche-'+m.parent&&!GK[m.parent]))location.hash='#accueil';}
/* Le serveur annonce un changement d'état (fermé, rouvert, résolu, créé, modifié) : on relit les marchés, une seule fois
   même si plusieurs issues changent d'un coup. */
let srvEtatT=0;
function srvMarchesEtat(){clearTimeout(srvEtatT);srvEtatT=setTimeout(()=>{srvMarches().then(()=>render(false)).catch(e=>console.warn('[srv] marchés indisponibles',e.code));},300);}
async function srvMarches(){
 const r=await API.call('api_markets');
 for(const id in r.m||{}){const x=r.m[id];
  if(x.st==='resolved'){srvMarcheRetirer(id);continue;}
  if(!MK[id])srvMarcheAjouter(id,x);
  const m=MK[id];if(!m)continue;m.st=x.st||'open';
  if(m.srv&&x.def){const d=x.def;Object.assign(m,{q:d.q,short:d.short,cat:d.cat,rules:d.rules||''},closeOf(d.date,d.time));}   /* modifié depuis le panel */
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
/* Entre la première lecture des marchés et l'abonnement au direct, un tick a pu passer sans être reçu : une fois abonné, on
   relit une fois et on applique ce qui a changé — sauf pour un marché dont un tick plus récent est déjà arrivé. */
async function srvMarchesRattraper(){
 const r=await API.call('api_markets'),map={};
 for(const id in r.m||{}){const x=r.m[id];if(!MK[id]||x.st==='resolved'||SRV_TICK_T[id]>r.now)continue;map[id]=[+x.p,+x.vol,x.people|0,x.liq];}
 srvMarchesMaj(map);
}
/* un tick du serveur : marchés modifiés, traînée des mises des bots, signal de foule éventuel */
const SRV_TICK_T={};                                           /* marché → heure (serveur) du dernier tick appliqué */
function srvTick(d){
 srvMarchesMaj(d.m);
 for(const id in d.m||{})SRV_TICK_T[id]=+d.t||0;
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
 }catch(e){if(e.code==='session'||e.code==='exclu'||e.code==='suspendu')srvErreur(e);else console.warn('[srv] règlement remis à plus tard',e.code);}
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
 }catch(e){if(e.code==='session'||e.code==='exclu'||e.code==='suspendu')srvErreur(e);else console.warn('[srv] règlement éclair remis à plus tard',e.code);}
 finally{srvEclairRegle=false;}
 if(encore>0&&(essai|0)<3)setTimeout(()=>srvEclairRegler(encore,(essai|0)+1),1500);   /* l'horloge du serveur était encore dans la manche */
}

/* ----- Amis : l'écriture est faite par le serveur, qui rend les trois listes à jour ----- */
let srvAmiOccupe=false;
async function srvAmi(action,u,el){
 if(srvAmiOccupe)return;srvAmiOccupe=true;
 try{
  const r=await API.call('api_friend',{p_action:action,p_user:u});
  srvFiches(r.users);S.me.friends=(r.friends||[]).slice();S.me.freqIn=(r.freqIn||[]).slice();S.me.freqOut=(r.freqOut||[]).slice();
  if(r.r==='envoyee'||r.r==='amis'||r.r==='retire')frAnnonce(r.r,u);
  srvAppliquer(r,frOu(el));refreshFriends();
 }catch(e){srvErreur(e);}
 finally{srvAmiOccupe=false;}
}
/* recherche d'un joueur : le serveur complète l'annuaire, puis la liste des résultats est redessinée */
let srvChercheT=null,srvChercheN=0;
function srvChercher(texte){
 clearTimeout(srvChercheT);const q=String(texte||'').trim().toLowerCase();if(q.length<2)return;
 srvChercheT=setTimeout(async()=>{const n=++srvChercheN;
  try{const r=await API.call('api_users_search',{p_q:q});if(n!==srvChercheN)return;srvFiches(r.users);if((S.ui.fq||'').trim().toLowerCase()===q)frResultats();}
  catch(e){console.warn('[srv] recherche de joueur',e.code);}},300);
}

/* ----- Chat : salons publics (général et marchés) -----
   On ne s'abonne qu'aux salons affichés (srvSalons, appelé après chaque rendu). À l'ouverture d'un salon : son historique,
   puis les messages en direct. Chaque message diffusé porte la fiche de son auteur (pseudo, rang) : pas d'autre requête. */
const SRV_SALONS=new Set(),SRV_MSG_VUS=new Set();
const srvSalonOuvert=r=>r==='general'||r.startsWith('m:')||r.startsWith('dm:');
const srvPrive=r=>r.startsWith('dm:');
const srvMoi=()=>String(S.auth.key||'').slice(4);
function srvChatAjouter(rid,m){
 if(!m||SRV_MSG_VUS.has(m.id))return;SRV_MSG_VUS.add(m.id);
 if(m.f)srvFiches({[m.u]:m.f});
 const text=m.tpl?srvBotTexte(m.tpl):m.text;if(m.tpl&&!text)return;             /* gabarit sur un marché inconnu de l'écran : ignoré */
 addMsg(rid,mkMsg({u:m.u===srvMoi()?'me':m.u,k:'msg',text,at:m.at,sid:m.id}));
}
function srvChatRetirer(rid,id){const R=S.rooms[rid];if(!R)return;const i=R.msgs.findIndex(x=>x.sid===id);if(i<0)return;R.msgs.splice(i,1);render(false);}
/* Message d'un bot : le serveur envoie un gabarit et ses paramètres ({g,i,m,p,s}) ; la phrase est composée ici, dans la
   langue du lecteur, avec les mêmes listes de phrases que le mode Démo. */
function srvBotTexte(t){
 const m=MK[t.m];if(!m)return '';
 const lignes=t.g==='G'?GLOBAL_LINES:(MLINES[t.m]||[]).concat(GEN_LINES),p=Number(t.p)||0;
 return lignes[Math.abs(t.i|0)%lignes.length].replace(/\{id\}/g,m.id).replace(/\{pct\}/g,F.pct(p)).replace(/\{side\}/g,t.s?_t("Oui"):_t("Non"))
  .replace(/\{hb\}/g,p>50?_t("haut"):_t("bas")).replace(/\{prev\}/g,Math.round(p-3));
}
function srvSalons(){
 const vus=new Set(Array.from(document.querySelectorAll('.feed[data-room]')).map(f=>f.dataset.room).filter(srvSalonOuvert));
 if(document.querySelector('[data-hcmini]'))vus.add('general');
 for(const r of vus)if(!SRV_SALONS.has(r)){SRV_SALONS.add(r);srvSalonOuvrir(r);}
 for(const r of Array.from(SRV_SALONS))if(!vus.has(r)){SRV_SALONS.delete(r);if(!srvPrive(r))API.unsubscribe('salon:'+r);}
 if((S.ui.route||'')==='chat'&&!srvDmListeVue){srvDmListeVue=true;srvDmListe();}
 if((S.ui.route||'')==='classement')srvClassement();
}
/* classement : les 50 meilleures fiches viennent du serveur et remplissent l'annuaire (relues au plus une fois par minute) */
let srvClassementVu=0;
async function srvClassement(){
 if(Date.now()-srvClassementVu<60000)return;srvClassementVu=Date.now();
 try{const r=await API.call('api_leaderboard');srvFiches(r.users);if((S.ui.route||'')==='classement')render(false);}
 catch(e){srvClassementVu=0;console.warn('[srv] classement indisponible',e.code);}
}
/* les conversations privées du joueur, pour la colonne des salons */
let srvDmListeVue=false;
async function srvDmListe(){try{const r=await API.call('api_dm_list');srvFiches(r.users);(r.ids||[]).forEach(u=>room('dm:'+u));if((r.ids||[]).length&&(S.ui.route||'')==='chat')render(false);}catch(e){console.warn('[srv] conversations privées',e.code);}}
async function srvSalonOuvrir(r){
 try{
  if(srvPrive(r)){const h=await API.call('api_dm_history',{p_user:r.slice(3)});srvFiches(h.users);(h.msgs||[]).forEach(m=>srvChatAjouter(r,m));return;}
  await API.subscribe('salon:'+r,(evt,d)=>{if(evt==='msg')srvChatAjouter(r,d);else if(evt==='del')srvChatRetirer(r,d&&d.id);});
  const h=await API.call('api_chat_history',{p_room:r});
  srvFiches(h.users);(h.msgs||[]).forEach(m=>srvChatAjouter(r,m));
 }catch(e){SRV_SALONS.delete(r);console.warn('[srv] salon indisponible',r,e.code);}
}
let srvChatOccupe=false;
async function srvChatEnvoyer(rid,inp,text){
 if(!srvSalonOuvert(rid)){srvBientot();return;}                 /* VIP, clan, privé : pas encore reliés */
 if(srvChatOccupe)return;srvChatOccupe=true;
 try{
  const r=srvPrive(rid)?await API.call('api_dm_send',{p_user:rid.slice(3),p_text:text}):await API.call('api_chat_send',{p_room:rid,p_text:text});
  if(inp.value.trim()===text)inp.value='';
  srvChatAjouter(rid,r.msg);
  const b=inp.getBoundingClientRect();srvAppliquer(r,{clientX:b.left+Math.min(b.width-40,160),clientY:b.top});
 }catch(e){srvErreur(e);}
 finally{srvChatOccupe=false;}
}

/* ----- La Série : lancée, jouée et réglée par le serveur (Edge Function « eclair », actions serie_…) -----
   Le serveur donne l'heure de début de la manche, le prix de départ, la cote retenue et l'issue ; l'écran garde son
   affichage (compte à rebours, courbe, cotes du moment) et annonce les résultats avec les mêmes messages qu'en mode Démo. */
const serieDe=x=>x?{sid:x.id,gid:x.gid,stake:+x.stake,stack:+x.stack,step:x.step|0,state:x.state,hist:(x.hist||[]).map(h=>Object.assign({},h)),at:+x.at||0,endAt:+x.endAt||0,
 rStart:(+x.rStart||0)-FSKEW,rEnd:(+x.rStart||0)-FSKEW+SERIE.ROUND_MS,p0:+x.p0,choice:x.choice||null,mult:+x.mult||0,fee:+x.fee||0,path:[+x.p0],closed:false}:null;
function srvSerieEtat(x){const avant=S.me.serie,s=serieDe(x);if(avant&&s&&avant.sid===s.sid&&avant.step===s.step&&avant.path)s.path=avant.path;S.me.serie=s;}
let srvSerieOccupe=false,srvSerieApres=0;
async function srvSerieAppel(action,corps,ev){
 const r=await API.fn('eclair',Object.assign({action},corps||{}));
 if(typeof r.now==='number')FSKEW=r.now-Date.now();
 srvAppliquer(r,ev);if('serie' in r)srvSerieEtat(r.serie);
 for(const h of r.hist||[])S.me.history.unshift(histDe(h));
 return r;
}
/* les annonces d'une manche réglée ou d'un encaissement : mêmes messages qu'en mode Démo */
function srvSerieAnnonce(x){const d=GM[x.gid]||{name:x.gid};
 if(x.r==='gagnee')toast({tone:'green',icon:'bolt',flash:true,title:`${_t("Manche {0} gagnée : stack {1}",[x.step,F.usd(+x.stack)])}`,text:`${_t("{0} Encaisse ou continue dans les {1} secondes.",[x.out==='be'?_t("Break even !"):x.out==='oui'?_t("Haut."):_t("Bas."),SERIE.CHOICE_MS/1000])}`,href:'#serie'});
 else if(x.r==='perdue')toast({tone:'red',icon:'bolt',flash:true,title:`${_t("Série perdue à la manche {0}",[x.step])}`,text:`${_t("C’était {0}. Mise perdue : {1}.",[x.out==='be'?'break even':x.out==='oui'?_t("Haut"):_t("Bas"),F.usd(+x.stake)])}`,href:'#serie'});
 else if(x.r==='rendue'){if(x.out)toast({tone:'amber',icon:'wallet',force:true,title:_t("Série annulée"),text:_t("Aucun choix dans les 30 secondes : ta mise t’est rendue."),href:'#serie'});}
 else{const tot=+x.stack/+x.stake;
  if(x.r==='auto')toast({tone:'amber',icon:'wallet',force:true,title:_t("Encaissement automatique"),text:`${_t("Aucun choix dans les {0} secondes : {1} encaissés.",[SERIE.CHOICE_MS/1000,F.usd(+x.stack)])}`,href:'#serie'});
  serieToday().unshift({u:'me',steps:x.won|0,mult:tot,cashed:+x.stack,at:now()});S.me.serieBest=Math.max(S.me.serieBest||0,x.won|0);
  toast({tone:'green',icon:'trophy',force:true,title:`${_t("Encaissé : {0} (×{1})",[F.usd(+x.stack),F.d1(tot)])}`,text:`${_t("{0} sur {0} sur {1}. Bravo.",[x.won|0,d.name])}`,href:'#serie'});if(x.r==='encaissee')confetti(36);}
}
async function srvSerieLancer(gid,stake){
 if(srvSerieOccupe)return;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;
 if(stake>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return;}
 srvSerieOccupe=true;
 try{await srvSerieAppel('serie_start',{gid,stake,key:cleOp()});
  toast({tone:'blue',icon:'bolt',force:true,title:`${_t("Série lancée à {0}",[F.usd0(stake)])}`,text:_t("Choisis Haut, Bas ou Break even pour la première manche.")});}
 catch(e){srvErreur(e);}
 finally{srvSerieOccupe=false;updateHeader();serieRefresh();}
}
async function srvSerieChoisir(side){
 const s=serieCur();if(!s||srvSerieOccupe)return;srvSerieOccupe=true;
 try{await srvSerieAppel('serie_play',{gid:s.gid,choice:side});}
 catch(e){if(e.code==='choix_fermes')toast({tone:'amber',icon:'lock',title:_t("Choix fermés"),text:`${_t("Le choix se fait dans les {0} premières secondes de la manche.",[SERIE.CHOICE_MS/1000])}`});else srvErreur(e);}
 finally{srvSerieOccupe=false;serieRefresh();}
}
async function srvSerieEncaisser(){
 if(srvSerieOccupe)return;srvSerieOccupe=true;
 try{const r=await srvSerieAppel('serie_cash');if(r.regle)srvSerieAnnonce(r.regle);}
 catch(e){if(e.code==='choix_fermes'||e.code==='deja_choisi')srvSerieApres=0;else srvErreur(e);}
 finally{srvSerieOccupe=false;updateHeader();serieRefresh();}
}
/* fin d'une manche : le serveur la règle (et celles d'après si l'on revient plus tard) ; si son horloge est encore dans la
   manche, on redemande une seconde plus tard */
async function srvSerieRegler(){
 if(srvSerieOccupe||now()<srvSerieApres)return;srvSerieOccupe=true;srvSerieApres=now()+1200;
 try{const r=await srvSerieAppel('serie_settle');for(const x of r.regles||[])srvSerieAnnonce(x);}
 catch(e){if(e.code==='session'||e.code==='exclu'||e.code==='suspendu')srvErreur(e);else{srvSerieApres=now()+4000;console.warn('[srv] règlement de la série remis à plus tard',e.code);}}
 finally{srvSerieOccupe=false;updateHeader();serieRefresh();}
}
planifier('serveur : série',1000,()=>{if(typeof serieTick==='function')serieTick();},'serveur');

/* ----- Paris combinés : prix bloqués, mise et gain tenus par le serveur ; le « slip » reste une sélection locale ----- */
const comboDe=x=>({id:String(x.id),at:+x.at,stake:+x.stake,mult:+x.mult,fee:+x.fee,pay:+x.pay,status:x.status,cash:x.cash==null?undefined:+x.cash,endAt:x.endAt||undefined,
 legs:(x.legs||[]).map(l=>({m:l.m,s:l.s,price:+l.price,mult:+l.mult,res:l.res||null}))});
let srvComboOccupe=false;
async function srvComboValider(c){if(srvComboOccupe)return;srvComboOccupe=true;
 try{const r=await API.call('api_combo_place',{p:{legs:c.L.map(l=>({m:l.m,s:l.s})),stake:c.stake,key:cleOp()}});
  srvAppliquer(r);S.me.combos=(r.combos||[]).map(comboDe);const cb=comboDe(r.combo);slip().legs=[];updateHeader();slipBar();closeModal();
  toast({tone:'green',icon:'layers',force:true,title:`${_t("Combiné validé : {0} à ×{1}",[F.usd(cb.stake),F.d2(cb.mult)])}`,text:`${_t("{0} sélections. Gain si tout passe : {1}. Tu peux encaisser à tout moment avant la clôture.",[cb.legs.length,F.usd(cb.pay)])}`,href:'#combines'});
  if((S.ui.route||'')==='combines')render(false);}
 catch(e){srvErreur(e);}
 finally{srvComboOccupe=false;}
}
async function srvComboEncaisser(cb){if(srvComboOccupe)return;srvComboOccupe=true;
 try{const r=await API.call('api_combo_cash',{p_id:+cb.id});
  srvAppliquer(r);S.me.combos=(r.combos||[]).map(comboDe);for(const h of r.hist||[])S.me.history.unshift(histDe(h));updateHeader();
  const v=+r.combo.cash,pnl=v-(+r.combo.stake);
  toast({tone:pnl>=0?'green':'amber',icon:'wallet',force:true,title:`${_t("Encaissé : {0}",[F.usd(v)])}`,text:`${_t("{0}{1} par rapport à ta mise de {2}.",[pnl>=0?'+':'−',F.usd(Math.abs(pnl)),F.usd(+r.combo.stake)])}`});
  if((S.ui.route||'')==='combines')render(false);}
 catch(e){srvErreur(e);}
 finally{srvComboOccupe=false;}
}

/* ----- Duels entre amis sur un marché : mises sous séquestre et règlement tenus par le serveur -----
   Le serveur rend les duels du joueur (créés ou reçus) ; l'écran les met à sa forme et garde son affichage. Les duels
   sur une manche éclair et les duels de stack ne sont pas encore reliés. */
const duelDe=(x,qui)=>{const moi=qui||srvMoi(),par=x.by===moi?'me':x.by,adv=x.opp?(x.opp===moi?'me':x.opp):null,mien=par==='me'?x.side:(x.side==='oui'?'non':'oui');
 const st=x.st==='regle'?(x.winSide===mien?'won':'lost'):x.st;
 return {id:String(x.id),code:x.code,kind:'market',m:x.m,round:0,side:x.side,by:par,opp:adv,stake:+x.stake,fee:+x.fee||0,status:st,at:+x.at,expiresAt:+x.expiresAt,price0:x.price0||0,
  price:x.price||undefined,oppStake:x.oppStake==null?undefined:+x.oppStake,oppFee:+x.oppFee||0,pot:x.pot==null?undefined:+x.pot,acceptAt:x.acceptAt||undefined,settleAt:x.settleAt||undefined,winSide:x.winSide||undefined,
  proof:x.winSide?{txt:_t("Résultat officiel du marché : {0}.",[x.winSide==='oui'?_t("Oui"):_t("Non")]),at:x.settleAt}:undefined};};
function srvDuelsEtat(x){if(!x)return;srvFiches(x.users);S.me.duels=(x.liste||[]).map(d=>duelDe(d));}
let srvDuelOccupe=false;
async function srvDuelAppel(nom,args){if(srvDuelOccupe)return null;srvDuelOccupe=true;
 try{const r=await API.call(nom,args);srvAppliquer(r);srvDuelsEtat(r.duels);updateHeader();return r;}
 catch(e){srvErreur(e);return null;}
 finally{srvDuelOccupe=false;}
}
async function srvDuelCreer(st){const stake=F.parse(st.stake);
 if(String(st.m).startsWith('flash:')){srvBientot();return;}                              /* duel sur une manche éclair : pas encore relié */
 if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;
 const r=await srvDuelAppel('api_duel_create',{p:{m:st.m,side:st.side,stake,opp:st.opp||null,key:cleOp()}});if(!r)return;
 const d=duelOf(String(r.duel.id));closeModal();if(!d)return;
 if(st.opp){toast({tone:'blue',icon:'swords',force:true,title:`${_t("Défi envoyé à {0}",[duelUserN(st.opp)])}`,text:`${_t("{0} : tu dis {1} pour {2}. Ta mise est bloquée sous séquestre.",[duelShort(d),duelSideTxt(d,d.side),F.usd0(stake)])}`,href:'#duel-'+d.id});if((S.ui.route||'').startsWith('duel'))render(false);}
 else duelShareOpen(d);
}
async function srvDuelAccepter(id){const connu=duelOf(id),lien=!connu&&S.ui.duelLink?S.ui.duelLink:null;if(!connu&&!lien)return;
 if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;
 const r=await srvDuelAppel('api_duel_accept',{p:lien?{code:lien.c}:{id:+id}});if(!r)return;
 S.ui.duelLink=null;const d=duelOf(String(r.duel.id));if(!d)return;
 toast({tone:'blue',icon:'swords',force:true,title:_t("Duel accepté"),text:`${_t("Tu dis {0} pour {1}. Cagnotte {2} sous séquestre.",[duelSideTxt(d,duelMySide(d)),F.usd(d.oppStake),F.usd(d.pot)])}`,href:'#duel-'+d.id});
 location.hash='#duel-'+d.id;render(false);
}
async function srvDuelFermer(d,action){
 const r=await srvDuelAppel('api_duel_close',{p_id:+d.id,p_action:action});if(!r)return;
 if(action==='cancel'){toast({icon:'check',title:_t("Duel annulé"),text:_t("Ta mise est de retour sur ton solde.")});render(false);}
 else{toast({icon:'check',title:_t("Duel refusé")});location.hash='#duels';}
}

/* ----- Blitz Royale -----
   La salle se déduit de l'heure avec le moteur partagé (joueurs simulés, choix, issues, jackpot reporté) : l'écran la
   reconstruit chaque seconde et la donne au même affichage qu'en mode Démo. Le serveur tient les vrais joueurs : il est
   interrogé à l'ouverture de l'écran, pendant les inscriptions, après chaque manche et pour la clôture. */
const SRV_BZ={vues:{},lu:{},annonce:{},clos:{},aRegler:[],occupe:false,cle:'',salle:null};
const srvBzVue=id=>SRV_BZ.vues[id]||{id,n:0,pot:0,vivants:[],moi:null,clos:null};
const srvBzChute=(moi,issues,n)=>{for(let i=1;i<=n;i++){const c=moi.choix?moi.choix[i]:undefined;if(c===undefined||c===null||+c!==issues[i-1]){if(i===1&&moi.rachat)continue;return i;}}return 0;};
async function srvBzAppel(action,corps,ev){
 const r=await API.fn('eclair',Object.assign({action},corps||{}));
 if(typeof r.now==='number')FSKEW=r.now-Date.now();
 if(r.blitz)SRV_BZ.vues[r.blitz.id]=r.blitz;
 if(r.me)srvAppliquer(r,ev);
 for(const h of r.hist||[])S.me.history.unshift(histDe(h));
 return r;
}
/* où en est le Blitz `id` à l'heure t (serveur) : salle d'attente, manche en cours (ou pause), terminé */
function srvBzPhase(id,t){const M=MoteurEclair,B=M.BZ,b=M.bzBots(id),v=srvBzVue(id),debut=M.bzDebut(id),log=[],issues=[];
 if(t<debut)return {id,b,v,phase:'lobby',debut,log,issues,vivB:b.n};
 let vivB=b.n;
 for(let i=1;i<=B.ROUNDS;i++){const m=M.bzManche(id,i),x=M.bzIssue(id,i);
  if(t<m.fin)return {id,b,v,phase:'live',i,m,x,pause:t<m.debut,debut,log,issues,vivB};
  issues.push(x.out);const mb=b.manches[i-1],apres=mb?mb.vivants:0,moiVivant=v.moi&&srvBzChute(v.moi,issues,i)===0?1:0,reels=v.vivants[i-1]!==undefined?v.vivants[i-1]|0:moiVivant;
  log.unshift({round:i,out:x.out,p0:x.p0,p1:x.p1,gone:vivB-apres,alive:apres+reels});vivB=apres;
  if(apres+reels===0||i===B.ROUNDS)return {id,b,v,phase:'done',i,fin:m.fin,debut,log,issues,vivB,reels};
 }
}
/* la salle au format de l'écran (S.bz.royale). Les heures sont converties à l'horloge de l'appareil. */
function srvBzSalle(e,t){const M=MoteurEclair,B=M.BZ,b=e.b,v=e.v,d=MoteurEclair.JEUX[B.GID];
 const nb=e.phase==='lobby'?Math.round(b.n*clamp(1-(e.debut-t)/600000,.12,1)):b.n;
 const cle=e.id+':'+e.phase+':'+(e.i||0)+':'+(e.pause?1:0)+':'+nb+':'+e.vivB;
 let r=SRV_BZ.salle;
 if(SRV_BZ.cle!==cle||!r){SRV_BZ.cle=cle;const bots=new Array(nb);for(let k=0;k<nb;k++)bots[k]={u:USER_IDS[k]||('bot'+(k+1)),alive:k<e.vivB,rebuy:false,choice:null};
  r=SRV_BZ.salle={id:'bz'+e.id,sid:e.id,bots,log:e.log,path:null,closed:false};}
 const moi=v.moi,faites=e.issues.length,chute=moi?srvBzChute(moi,e.issues,faites):0;
 Object.assign(r,{state:e.phase,startAt:e.debut-FSKEW,prime:b.prime,buyin:b.buyin,carried:M.bzReport(e.id),target:b.n,log:e.log,
  pot:M.bzReport(e.id)+nb*b.buyin+(+v.pot||0),
  me:moi?{alive:chute===0,rebuy:!!moi.rachat,choice:null,paid:+moi.paye,outRound:chute||undefined}:null});
 if(e.phase==='live'){const m=e.pause?M.bzManche(e.id,e.i-1):e.m,x=e.pause?M.bzIssue(e.id,e.i-1):e.x;
  r.round=e.pause?e.i-1:e.i;r.rStart=m.debut-FSKEW;r.rEnd=m.fin-FSKEW;r.p0=x.p0;r.between=e.pause?e.m.debut-FSKEW:0;
  if(!e.pause){if(!r.path||r.pathDe!==e.i){r.path=[x.p0];r.pathDe=e.i;}
   const mb=b.manches[e.i-1],f=clamp((t-e.m.debut)/B.CHOICE_MS,0,1),nO=mb?Math.round(mb.haut*f):0,nE=mb?Math.round(mb.be*f):0,nN=mb?Math.round(mb.bas*f):0;
   for(let k=0;k<e.vivB&&k<r.bots.length;k++)r.bots[k].choice=k<nO?1:k<nO+nE?2:k<nO+nE+nN?0:null;
   if(r.me&&r.me.alive&&moi.choix&&moi.choix[e.i]!==undefined)r.me.choice=+moi.choix[e.i];}
  else r.path=null;}
 else{r.round=e.i||0;r.between=0;}
 return r;
}
/* annonces de fin de manche et de fin de Blitz : mêmes messages qu'en mode Démo */
function srvBzAnnoncer(e){const B=MoteurEclair.BZ,v=e.v,moi=v.moi;if(!moi)return;
 for(let i=1;i<=e.issues.length;i++){const k=e.id+':'+i;if(SRV_BZ.annonce[k])continue;SRV_BZ.annonce[k]=1;
  const out=e.issues[i-1],lab=out===2?_t("Break even"):out===1?_t("Haut"):_t("Bas"),avant=srvBzChute(moi,e.issues,i-1),apres=srvBzChute(moi,e.issues,i);
  if(avant!==0||(e.phase==='done'&&i===e.issues.length))continue;                              /* déjà éliminé, ou dernière manche : c'est la clôture qui parle */
  const ligne=e.log.find(l=>l.round===i)||{alive:0},part=ligne.alive?S.bz.royale.pot*(1-B.RAKE)/ligne.alive:0;
  if(apres)toast({tone:'red',icon:'bolt',flash:true,title:`${_t("Éliminé à la manche {0}",[i])}`,text:`${_t("C’était {0}. {1}",[lab,i===1&&!moi.rachat?`${_t("Rachat possible à {0} avant la manche 2.",[F.usd0(B.REBUY)])}`:_t("Tu restes en spectateur.")])}`,href:'#blitz'});
  else toast({tone:'green',icon:'bolt',flash:true,title:`${_t("Manche {0} : tu survis",[i])}`,text:`${_t("{0}. {1} en vie, ta part : {2}.",[lab,F.int(ligne.alive),F.usd(part)])}`,href:'#blitz'});}
}
function srvBzFin(id,vue){const c=vue.clos,moi=vue.moi;if(!c||SRV_BZ.clos[id])return;SRV_BZ.clos[id]=1;
 S.bz.history.unshift({id:'bz'+id,at:now(),pot:+c.cagnotte,players:c.joueurs,alive:c.survivants,each:+c.chacun,me:moi?(moi.gagne?'won':'lost'):null,prime:MoteurEclair.bzPrime(id)});S.bz.history=S.bz.history.slice(0,8);
 if(moi&&moi.gagne){toast({tone:'green',icon:'trophy',force:true,title:`${_t("Blitz gagné : +{0}",[F.usd(+moi.gain-+moi.paye)])}`,text:`${_t("{0} survivant{1} se partagent {2}.",[c.survivants,c.survivants>1?'s':'',F.usd0(+c.cagnotte)])}`,href:'#blitz'});confetti(60);}
}
async function srvBzLire(id,cle){if(SRV_BZ.lu[id]===cle||SRV_BZ.occupe)return;SRV_BZ.lu[id]=cle;try{await srvBzAppel('blitz_state',{id});srvBzTick();}catch(e){delete SRV_BZ.lu[id];console.warn('[srv] Blitz indisponible',e.code);}}   /* la salle est refaite aussitôt avec ce que dit le serveur */
async function srvBzClore(id){if(SRV_BZ.occupe||now()<(SRV_BZ.apres||0))return;SRV_BZ.occupe=true;SRV_BZ.apres=now()+1500;
 try{const r=await srvBzAppel('blitz_settle',{id});SRV_BZ.aRegler=SRV_BZ.aRegler.filter(x=>x!==id);if(r.blitz)srvBzFin(id,r.blitz);updateHeader();}
 catch(e){if(e.code==='session'||e.code==='exclu'||e.code==='suspendu')srvErreur(e);else{SRV_BZ.apres=now()+(e.code==='blitz_en_cours'?1500:6000);if(e.code!=='blitz_en_cours')console.warn('[srv] clôture du Blitz remise à plus tard',e.code);}}
 finally{SRV_BZ.occupe=false;}
}
/* chaque seconde : la salle du moment, les lectures du serveur aux moments utiles, la clôture quand le Blitz est fini */
function srvBzTick(){
 if(!S.me.logged||typeof bzRefresh!=='function')return;
 const M=MoteurEclair,t=fNow(),vu=(S.ui.route||'')==='blitz';let id=M.bzId(t),e=srvBzPhase(id,t);
 const mien=!!e.v.moi||SRV_BZ.aRegler.length>0;
 if(!vu&&!mien){const suivant=srvBzVue(id+1);if(!suivant.moi)return;}                    /* ni sur l'écran, ni inscrit : rien à faire */
 if(e.phase==='done'){
  if(e.v.moi&&!e.v.moi.regle)srvBzClore(id);else if(vu&&!e.v.clos)srvBzLire(id,'fin');
  if(e.v.clos)srvBzFin(id,e.v);
  if(t>=e.fin+6000){id++;e=srvBzPhase(id,t);}}
 for(const vieux of SRV_BZ.aRegler)if(vieux<M.bzId(t)){srvBzClore(vieux);break;}             /* un Blitz joué avant de partir, à régler au retour */
 if(vu||e.v.moi)srvBzLire(e.id,e.phase==='lobby'?'l'+Math.floor(t/30000):e.phase+':'+e.issues.length);
 S.bz.royale=srvBzSalle(e,t);
 if(e.phase!=='lobby')srvBzAnnoncer(e);
 bzRefresh(true);
}
planifier('serveur : blitz',1000,srvBzTick,'serveur');
async function srvBzEntrer(){const r=bzR();if(!r||r.state!=='lobby'||SRV_BZ.occupe)return;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;
 if(r.buyin>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return;}
 SRV_BZ.occupe=true;
 try{await srvBzAppel('blitz_join',{id:r.sid,key:cleOp()});
  toast({tone:'blue',icon:'bolt',force:true,title:_t("Inscrit au Blitz Royale"),text:`${_t("Buy-in {0}. Départ dans {1} s, 10 manches de 60 secondes.",[F.usd0(r.buyin),Math.max(1,Math.round((r.startAt-now())/1000))])}`});}
 catch(e){srvErreur(e);}
 finally{SRV_BZ.occupe=false;updateHeader();srvBzTick();}
}
async function srvBzChoisir(c){const r=bzR();if(!r||SRV_BZ.occupe)return;SRV_BZ.occupe=true;
 try{await srvBzAppel('blitz_choose',{id:r.sid,choice:c===1?'oui':c===0?'non':'be'});}
 catch(e){if(e.code==='choix_fermes')toast({tone:'amber',icon:'lock',title:_t("Choix fermés"),text:`${_t("Le choix se fait dans les {0} premières secondes de la manche.",[BZ.CHOICE_MS/1000])}`});else srvErreur(e);}
 finally{SRV_BZ.occupe=false;srvBzTick();}
}
async function srvBzRacheter(){const r=bzR();if(!r||!bzCanRebuy(r)||SRV_BZ.occupe)return;if(typeof rgBlocked==='function'&&rgBlocked('bet'))return;
 if(BZ.REBUY>S.me.balance){toast({tone:'amber',icon:'wallet',title:_t("Solde insuffisant"),text:_t("Dépose des fonds pour continuer."),href:'#depot'});return;}
 SRV_BZ.occupe=true;
 try{await srvBzAppel('blitz_rebuy',{id:r.sid});
  toast({tone:'blue',icon:'bolt',force:true,title:_t("Rachat accepté"),text:`${_t("{0} ajoutés à la cagnotte. Tu reviens en jeu à la manche {1}. C’était ton seul rachat.",[F.usd0(BZ.REBUY),r.round+1])}`});}
 catch(e){srvErreur(e);}
 finally{SRV_BZ.occupe=false;updateHeader();srvBzTick();}
}

/* ----- Sujet privé du joueur : ses messages privés et ses notifications arrivent en direct, à lui seul ----- */
function srvPerso(evt,d){
 if(evt==='dm'){if(d&&d.u)srvChatAjouter('dm:'+d.u,d);return;}
 if(evt==='notif'&&d&&d.n){
  if(S.me.notifs.some(x=>x.id===d.n.id))return;
  S.me.notifs.unshift(notifDe(d.n));S.me.notifs=S.me.notifs.slice(0,30);updateBell();
  if(/^fr_|^duel_|^combo_|^marche_resolu$|^admin_solde$|^kyc_ok$|^blitz_gagne$/.test(d.n.code||'')){srvVu=0;srvRafraichir();}                   /* demande d'ami ou acceptation : les listes viennent du serveur */
 }
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
function srvSuspendu(e){if(srvExcluVu)return;srvExcluVu=true;const d=+(e&&e.cause&&e.cause.details);
 srvNote(d>0?_t("Ce compte est suspendu jusqu’au {0}.",[fmtD(d)]):_t("Ce compte est suspendu."));
 API.signOut().then(()=>{LS.r(SESK);srvRecharger('#connexion');});}
function srvExclu(e){if(srvExcluVu)return;srvExcluVu=true;const d=+(e&&e.cause&&e.cause.details);
 srvNote(d===-1?_t("Ce compte est fermé définitivement à la demande de son titulaire (auto-exclusion)."):_t("Ce compte est en auto-exclusion jusqu’au {0}. La connexion est impossible avant cette date.",[fmtD(d)]));
 API.signOut().then(()=>{LS.r(SESK);srvRecharger('#connexion');});}

/* Présence : tant que l'onglet est visible, le site dit au serveur qu'un joueur regarde (toutes les 4 minutes). Sans joueur
   présent, les bots du serveur passent en veille et ne diffusent plus rien (voir supabase/migrations/…_bots_veille.sql). */
planifier('serveur : présence',240000,()=>{if(document.hidden||!S.me.logged)return;API.call('api_present').catch(()=>{});
 const salons=Array.from(SRV_SALONS).filter(r=>!srvPrive(r));if(salons.length)API.call('api_chat_seen',{p_rooms:salons}).catch(()=>{});   /* les bots ne parlent que dans les salons regardés */
},'serveur');

/* ----- Démarrage en mode serveur ----- */
async function bootServeur(){
 const [etat]=await Promise.all([API.loadState(),srvMarches().catch(e=>console.warn('[srv] marchés indisponibles',e.code))]);
 hydrater(etat);srvArgentSuivre();
 if(SRV_ECLAIR_DU>0)setTimeout(()=>srvEclairRegler(0,3),1200);                 /* des manches jouées avant le rechargement restent à régler */
 API.on('session',()=>srvSessionPerdue());
 API.subscribe('marches',(evt,d)=>{if(evt==='tick')srvTick(d);else if(evt==='etat')srvMarchesEtat();}).then(srvMarchesRattraper).catch(e=>console.warn('[srv] temps réel indisponible',e.code));
 API.subscribe('joueur:'+etat.uid,srvPerso,true).catch(e=>console.warn('[srv] sujet privé indisponible',e.code));
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
