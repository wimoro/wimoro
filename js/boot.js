/* WIMORO — boot module */

'use strict';
/* ===================== Démarrage =====================
   Le mode est connu AVANT le premier rendu (API.pret) : local (visiteur, compte démo) ou serveur (session valide).
   Tous les minuteurs périodiques sont lancés ici, une seule fois, selon ce mode. En mode serveur, aucun simulateur
   du navigateur ne tourne : prix, volumes, messages et joueurs viennent du serveur, les mêmes pour tout le monde. */
/* Les minuteurs lourds se mettent en pause quand l'onglet est caché (le pari éclair garde son horloge). */
const vis=fn=>()=>{if(!document.hidden)fn();};
/* planifier(nom, délai, fonction, quand) — 'local' (par défaut) : simulateur d'état partagé ; 'tous' : affichage ou décor.
   Les modules (copy, orders, referral, responsible, blitz, clans, pro) déclarent les leurs de la même façon. */
planifier('bots : mises',650,vis(botBet));
planifier('bots : messages',3600,vis(()=>{if(R()<.85)botChat();}));
planifier('bots : réactions',2600,vis(botReact));
planifier('bots : rafales et signaux de foule',26000,vis(()=>{if(R()<.55)burst();}));
planifier('bots : dérive des ancres',10000,vis(driftAnchors));
planifier('bots : grosses mises de l’accueil',5200,vis(()=>pushBig(false)));
planifier('bots : demandes d’amis',90000,vis(()=>{if(R()<.35)botFriendRequest();}));
planifier('bots : défis de duel',240000,vis(duelBotChallenge));
planifier('duels : règlement local',5000,duelTick);
planifier('carnet : croissance de la profondeur',15000,vis(()=>{MARKETS.forEach(growLiq);$$('[data-liq]').forEach(e=>{const k=MK[e.dataset.liq];if(k)e.textContent=F.compact(bookDepth(k)*10);});}));
/* Votes de la communauté sur les propositions */
planifier('propositions : votes simulés',1600,vis(()=>{voteTick();for(const p of COMM_PROPS){if(R()<.3&&p.for<p.need-2){p.for++;$$(`[data-prv="${p.id}"]`).forEach(e=>e.textContent=`${_t("{0} pour, {1} contre",[p.for,p.against])}`);$$(`[data-prb="${p.id}"]`).forEach(e=>e.style.width=Math.min(100,p.for/p.need*100)+'%');}}}));
planifier('marchés : mémoire locale',8000,vis(marketsSave));
planifier('éclair : moteur (déterministe)',250,flashTick,'tous');
planifier('affichage : chiffres en direct',1000,vis(()=>{refreshLive();syncSellBtns();}),'tous');
planifier('affichage : graphiques',2200,vis(()=>{if(!XH)refreshCharts();}),'tous');
planifier('décor : joueurs en ligne',3000,vis(()=>{S.online=clamp(S.online+Math.round((R()-.48)*14),2200,2900);$$('[data-online]').forEach(e=>e.textContent=F.int(S.online));for(const m of MARKETS)m.online=clamp(m.online+Math.round((R()-.5)*3),5,999);$$('[data-monline]').forEach(e=>{const m=MK[e.dataset.monline];if(m)e.textContent=F.int(m.online);});}),'tous');

let RECUP=false;
API.on('recuperation',()=>{RECUP=true;if(PRET)recupModal();});

async function demarrer(){
 const mode=await API.pret,srv=mode==='serveur';
 {const tm=LS.g('wimoro-tmode');if(tm==='bars')S.ui.tmode='bars';}
 if(srv){
  LS.r(SESK);                                             /* une session serveur l'emporte : jamais deux comptes à la fois */
  try{await bootServeur();}
  catch(e){if(e&&e.code==='session'){await API.signOut();srvRecharger('#connexion','expire');return;}
   S.me=guestMe();i18nStatic(document.body);PRET=true;ecranErreurServeur(e);return;}
  flashBoot();
  if(!S.me.onboarded&&location.hash!=='#bienvenue')location.replace('#bienvenue');
 }else{
  bootAuth();if(typeof rgBoot==='function')rgBoot();
  flashBoot();marketsLoad();
  (S.me.props||[]).forEach(pr=>{if(pr.status==='live')createMarketFromProposal(pr,false);});
  SEMIS.forEach(f=>f());seedRooms();checkBadges(true);if(!S.me.missions.some(m=>m.day)){S.me.missions.forEach(m=>m.day=today());}
  if(S.me.logged&&!S.me.onboarded&&location.hash!=='#bienvenue')location.replace('#bienvenue');
  for(let i=0;i<5;i++)pushBig(true);
 }
 i18nStatic(document.body);const md=document.querySelector('meta[name=description]');if(md&&LANG!=='fr'&&I18N[LANG][md.content])md.content=I18N[LANG][md.content];
 if(!srv){if(typeof duelSeed==='function'){duelSeed();duelLinkBoot();}if(typeof clanSeed==='function')clanSeed();if(typeof comboSeed==='function')comboSeed();if(typeof proBoot==='function')proBoot();}
 PRET=true;updateHeader();render(true);navMark();
 for(const t of PLAN)if(t.quand==='tous'||!srv)setInterval(t.fn,t.ms);
 if(!srv){setTimeout(catchUpVotes,1200);setTimeout(botFriendRequest,45000);setTimeout(burst,9000);setTimeout(()=>{if(S.me.logged&&!duelIncoming().length)duelBotChallenge();},150000);}
 MARKETS.forEach(bookDepth);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){flashTick();if(!srv)duelTick();updateFlash(true);refreshLive();if(typeof bzRefresh==='function')bzRefresh();if(typeof serieRefresh==='function')serieRefresh();if(!XH)refreshCharts();}});
 /* sauvegarde immédiate quand l'onglet se ferme ou se recharge (le save() ordinaire est différé) */
 addEventListener('pagehide',()=>{if(typeof flushSave==='function')flushSave();marketsSave();});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(typeof flushSave==='function')flushSave();marketsSave();}});
 if(!srv&&S.me.logged&&!S.me.welcomed)setTimeout(welcome,700);
 addEventListener('scroll',()=>{NAV.pos[NAV.cur]=window.scrollY;},{passive:true});
 srvApres();if(RECUP)recupModal();
}
demarrer();
