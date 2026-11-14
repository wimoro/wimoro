/* WIMORO — boot module */

'use strict';
/* ===================== Démarrage ===================== */
{const tm=LS.g('wimoro-tmode');if(tm==='bars')S.ui.tmode='bars';}
bootAuth();if(typeof rgBoot==='function')rgBoot();
flashBoot();marketsLoad();
(S.me.props||[]).forEach(pr=>{if(pr.status==='live')createMarketFromProposal(pr,false);});
seedRooms();checkBadges(true);if(!S.me.missions.some(m=>m.day)){S.me.missions.forEach(m=>m.day=today());}
/* onboarding redirect handled by sbLoad */
for(let i=0;i<5;i++)pushBig(true);
i18nStatic(document.body);const md=document.querySelector('meta[name=description]');if(md&&LANG!=='fr'&&I18N[LANG][md.content])md.content=I18N[LANG][md.content];
if(typeof duelSeed==='function'){duelSeed();duelLinkBoot();}if(typeof clanSeed==='function')clanSeed();if(typeof comboSeed==='function')comboSeed();if(typeof proBoot==='function')proBoot();
updateHeader();render(true);navMark();
/* Les minuteurs lourds se mettent en pause quand l'onglet est caché (le pari éclair garde son horloge). */
const vis=fn=>()=>{if(!document.hidden)fn();};
setTimeout(catchUpVotes,1200);setTimeout(botFriendRequest,45000);setInterval(vis(()=>{if(R()<.35)botFriendRequest();}),90000);setInterval(vis(()=>pushBig(false)),5200);
setInterval(vis(botBet),650);setInterval(vis(()=>{if(R()<.85)botChat();}),3600);setInterval(vis(botReact),2600);setTimeout(burst,9000);setInterval(vis(()=>{if(R()<.55)burst();}),26000);
setInterval(flashTick,250);setInterval(duelTick,5000);setInterval(vis(duelBotChallenge),240000);setTimeout(()=>{if(S.me.logged&&!duelIncoming().length)duelBotChallenge();},150000);setInterval(vis(driftAnchors),10000);setInterval(vis(()=>{refreshLive();syncSellBtns();}),1000);
setInterval(vis(()=>{if(!XH)refreshCharts();}),2200);
MARKETS.forEach(bookDepth);setInterval(vis(()=>{MARKETS.forEach(growLiq);$$('[data-liq]').forEach(e=>{const k=MK[e.dataset.liq];if(k)e.textContent=F.compact(bookDepth(k)*10);});}),15000);
setInterval(vis(()=>{S.online=clamp(S.online+Math.round((R()-.48)*14),2200,2900);$$('[data-online]').forEach(e=>e.textContent=F.int(S.online));for(const m of MARKETS)m.online=clamp(m.online+Math.round((R()-.5)*3),5,999);$$('[data-monline]').forEach(e=>{const m=MK[e.dataset.monline];if(m)e.textContent=F.int(m.online);});}),3000);
/* Votes de la communauté sur les propositions */
setInterval(vis(()=>{voteTick();for(const p of COMM_PROPS){if(R()<.3&&p.for<p.need-2){p.for++;$$(`[data-prv="${p.id}"]`).forEach(e=>e.textContent=`${_t("{0} pour, {1} contre",[p.for,p.against])}`);$$(`[data-prb="${p.id}"]`).forEach(e=>e.style.width=Math.min(100,p.for/p.need*100)+'%');}}}),1600);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){flashTick();duelTick();updateFlash(true);refreshLive();if(typeof bzRefresh==='function')bzRefresh();if(typeof serieRefresh==='function')serieRefresh();if(!XH)refreshCharts();}});
/* sauvegarde immédiate quand l'onglet se ferme ou se recharge (le save() ordinaire est différé de 400 ms) */
addEventListener('pagehide',()=>{if(typeof flushSave==='function')flushSave();marketsSave();});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(typeof flushSave==='function')flushSave();marketsSave();}});
setInterval(vis(marketsSave),8000);
if(S.me.logged&&!S.me.welcomed)setTimeout(welcome,700);
addEventListener('scroll',()=>{NAV.pos[NAV.cur]=window.scrollY;},{passive:true});

