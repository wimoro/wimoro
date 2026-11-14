/* WIMORO — groups module */

'use strict';
/* =====================================================================================
 *  Marchés à cotes multiples
 *  ------------------------------------------------------------------------------------
 *  Un marché « groupe » (GROUPS, défini dans core.js) regroupe N issues qui s'excluent.
 *  Chaque issue est un sous-marché Oui/Non ordinaire (carnet, positions, ordres limite,
 *  copie, graphique) ; ici : la page du groupe, la ligne de liste, et le couplage des prix
 *  (quand une issue monte, les autres baissent au prorata : la somme reste à 100 %).
 * ===================================================================================== */
const GCOL=['#2448FF','#F59A0B','#12A150','#7350E3','#E11D74','#0E9AA7','#8D94A0'];
const groupOf=m=>m&&m.parent?GK[m.parent]:null;
const gSum=g=>g.outcomes.reduce((t,o)=>t+o.p,0);
const gVol=g=>g.outcomes.reduce((t,o)=>t+o.vol,0);
const gSorted=g=>g.outcomes.slice().sort((a,b)=>b.p-a.p);
/* objet « ligne de liste » d'un groupe : mêmes champs que les tris des marchés */
function groupProxy(g){const top=gSorted(g)[0];return {group:g,id:g.id,cat:g.cat,vol:gVol(g),days:g.days,people:g.people,msgs:g.msgs,heat:g.heat,p:top.p,d0:top.d0,creator:''};}
/* Une issue a bougé de `delta` points : les autres compensent au prorata de leur poids */
function groupRebalance(m,delta){const g=groupOf(m);if(!g||!delta)return;const others=g.outcomes.filter(o=>o!==m),tot=others.reduce((t,o)=>t+o.p,0);if(tot<=0)return;
 for(const o of others){const old=o.p;o.p=clamp(o.p-delta*o.p/tot,1,97);if(Math.abs(o.p-old)>1e-9)updateMarket(o,old,true);}
 groupRefresh(g);}
function groupRefresh(g){$$(`[data-gsum="${g.id}"]`).forEach(el=>el.textContent=F.pct(Math.round(gSum(g))));for(const o of g.outcomes){$$(`[data-obar="${o.id}"] i`).forEach(i=>i.style.width=clamp(o.p,1,100)+'%');}
 const box=$(`[data-gchart="${g.id}"]`);if(box)box.innerHTML=groupChartH(g);}
/* le rafraîchissement d'un marché entraîne le rééquilibrage de ses frères */
const updateMarket0=updateMarket;
updateMarket=function(m,old,noGroup){updateMarket0(m,old);if(!noGroup&&m.parent&&old!==undefined){const d=m.p-old;if(Math.abs(d)>1e-9)groupRebalance(m,d);}};

/* ---------- Ligne de liste : question, puces des issues en tête, volume, bouton ---------- */
function groupRowH(g){const L=gSorted(g),top=L.slice(0,4),rest=L.length-top.length,vol=gVol(g);
 return `<div class="row grow" data-href="#marche-${g.id}" data-row="${g.id}"><div class="qcell"><div class="cat">${_t(g.cat)}<span class="ctag multi">${_t("{0} issues",[g.outcomes.length])}</span></div><a class="q" href="#marche-${g.id}">${esc(g.q)}</a></div>
 <div class="gchips">${top.map(o=>`<a class="gchip" href="#marche-${o.id}"><i style="background:${gColor(g,o)}"></i><span>${esc(o.label)}</span><b class="num" data-mp="${o.id}">${F.pct(o.p)}</b></a>`).join('')}${rest>0?`<a class="gchip more" href="#marche-${g.id}">+${rest}</a>`:''}</div>
 <div class="vol"><div class="v">${F.compact(vol)}</div><div class="c">${g.close}</div></div>
 <div class="acts"><a class="btn b-white sm full" href="#marche-${g.id}">${_t("Voir les {0} issues",[g.outcomes.length])}</a></div></div>`;}
/* couleur stable d'une issue : son rang à l'ouverture (ne change pas quand les prix bougent) */
function gColor(g,o){if(!g._col){g._col={};g.outcomes.slice().sort((a,b)=>b.d0-a.d0).forEach((x,i)=>g._col[x.id]=GCOL[Math.min(i,GCOL.length-1)]);}return g._col[o.id]||GCOL[GCOL.length-1];}

/* ---------- Graphique des issues (depuis l'ouverture) ---------- */
function groupChartH(g){const L=gSorted(g).slice(0,5),W=640,H=200,n=Math.min(...L.map(o=>o.ph?o.ph.length:0));if(n<2)return '';const mx=Math.min(100,Math.max(...L.map(o=>Math.max(...o.ph.slice(-n))))*1.18+2);
 const x=i=>i/(n-1)*W,y=v=>H-v/mx*H;const grid=[0,25,50,75].filter(v=>v<mx*.92).map(v=>`<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gg"/><text x="0" y="${(y(v)-5).toFixed(1)}" class="gt">${F.pct(v)}</text>`).join('');
 const lead=L[0],la=lead.ph.slice(-n),area=`<defs><linearGradient id="ga-${g.id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${gColor(g,lead)}" stop-opacity=".22"/><stop offset="1" stop-color="${gColor(g,lead)}" stop-opacity="0"/></linearGradient></defs><path d="${la.map((v,k)=>(k?'L':'M')+x(k).toFixed(1)+' '+y(v).toFixed(1)).join('')}L${W} ${H}L0 ${H}Z" fill="url(#ga-${g.id})"/>`;
 const paths=L.slice().reverse().map(o=>{const a=o.ph.slice(-n),c=gColor(g,o);return `<path d="${a.map((v,k)=>(k?'L':'M')+x(k).toFixed(1)+' '+y(v).toFixed(1)).join('')}" fill="none" stroke="${c}" stroke-width="${o===lead?3:2.2}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${W}" cy="${y(a[a.length-1]).toFixed(1)}" r="4" fill="${c}" stroke="var(--panel)" stroke-width="2"/>`;}).join('');
 return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="gsvg" aria-hidden="true">${grid}${area}${paths}</svg><div class="glegend">${L.map(o=>`<span><i style="background:${gColor(g,o)}"></i>${esc(o.label)} <b class="num" data-mp="${o.id}">${F.pct(o.p)}</b></span>`).join('')}</div>`;}

/* ---------- Page du groupe ---------- */
function vGroup(id){const g=GK[id],rid='m:'+id;room(rid).unread=0;const L=gSorted(g),vol=gVol(g),mine=S.me.positions.filter(p=>p.m&&MK[p.m]&&MK[p.m].parent===id);
 const rows=L.map(o=>{const d=o.p-o.d0,c=gColor(g,o);return `<div class="orow" data-row="${o.id}"><a class="oem" href="#marche-${o.id}" style="color:${c};background:${c}1F" aria-hidden="true">${esc(o.label.replace(/^(Une?|Le|La|Les|L’)\s+/i,'').charAt(0).toUpperCase())}</a>
  <div class="ol"><a class="on" href="#marche-${o.id}">${esc(o.label)}</a><small>${F.compact(o.vol)} · <span data-people="${o.id}">${F.int(o.people)}</span> ${_t("participants")}</small><span class="gb obar" data-obar="${o.id}"><i style="width:${clamp(o.p,1,100)}%;background:${c}"></i></span></div>
  <div class="opv"><b class="num" data-mp="${o.id}">${F.pct(o.p)}</b><span class="delta ${d>=0?'up':'dn'}" data-md="${o.id}">${F.pts(d)}</span></div>
  <div class="acts"><button class="btn b-ouis" data-a="bet" data-m="${o.id}" data-s="oui">${mxH(o.id,'oui',o.p)}${buyLbl(o.id,'oui',o.p)}</button><button class="btn b-nons" data-a="bet" data-m="${o.id}" data-s="non">${mxH(o.id,'non',o.p)}${buyLbl(o.id,'non',100-o.p)}</button></div></div>`;}).join('');
 return `<div class="wrap"><div class="mtop"><div><nav class="crumbs"><a href="#accueil">${_t("Marchés")}</a><span>/</span><a href="#accueil" data-a="cat" data-v="${g.cat}">${_t(g.cat)}</a></nav><h1 class="mq">${esc(g.q)}</h1><div class="mmeta"><span class="ctag multi">${_t("{0} issues",[g.outcomes.length])}</span><span>${_t("Clôture : <b>{0}</b>",[g.closeLong])}</span><span>${_t("Volume <b>{0}</b>",[F.compact(vol)])}</span><span>${_t("<b>{0}</b> participants",[F.int(g.people)])}</span><span>${_t("<b>{0}</b> messages dans le chat",[F.int(g.msgs)])}</span></div></div><div class="mact"><button class="btn b-white" data-a="duel-open" data-m="${L[0].id}">${_t("{0} Défier",[ic('swords',16)])}</button><button class="btn b-white" data-a="copylink" data-v="#marche-${id}">${_t("{0} Partager",[ic('share',16)])}</button><button class="btn b-white" data-a="watch" data-m="${id}" aria-pressed="${S.me.watch.includes(id)}">${ic('star',16)} <span data-watch="${id}">${watchTxt(S.me.watch.includes(id))}</span></button></div></div>
 <div class="g-mkt"><section class="pn a-chart"><div class="pad" style="padding-bottom:0"><div class="cp-h"><div class="cp-p"><b class="num" style="color:${gColor(g,L[0])}" data-mp="${L[0].id}">${F.pct(L[0].p)}</b><div><div class="cpt">${_t("pour {0}, en tête",[esc(L[0].label)])}</div><div class="sub">${_t("Les {0} issues s’excluent : la somme des chances fait",[g.outcomes.length])} <b data-gsum="${id}">${F.pct(Math.round(gSum(g)))}</b>.</div></div></div><button class="btn b-ink sm pro-open" data-a="pro-open" data-m="${L[0].id}">${_t("{0} Mode Pro",[ic('expand',15)])}</button></div></div>
 <div class="gchart" data-gchart="${id}">${groupChartH(g)}</div><div class="xax" style="padding:0 20px 12px"><span>${_t("Ouverture")}</span><span>${_t("Maintenant")}</span></div>
 <div class="orows"><div class="bd-cap">${_t("Variations sur 24 heures")}</div><div class="orows-h"><span>${_t("Issue")}</span><span>${_t("Chance")}<small class="hd-s">${_t("variation sur 24 h")}</small></span><span>${_t("Miser")}</span></div>${rows}</div>
 <p class="sub" style="padding:12px 20px 18px">${_t("Chaque issue se joue comme un marché Oui/Non : tu peux acheter Oui sur une issue, ou Non sur plusieurs. Touche le nom d’une issue pour son graphique détaillé, son carnet et ses ordres limite.")}</p></section>
 <aside class="col a-side">${mine.length?`<section class="pn pad"><div class="h2">${_t("Tes positions sur ce marché")}</div>${L.filter(o=>mine.some(p=>p.m===o.id)).map(o=>`<div class="gpos"><b>${esc(o.label)}</b>${posBoxH(o)}</div>`).join('')}</section>`:`<section class="pn pad"><div class="h2">${_t("Comment ça marche")}</div><p class="sub" style="margin-top:6px">${_t("Une seule issue gagne à la clôture. Chaque part Oui sur l’issue gagnante rapporte 1 $ ; chaque part Non sur une issue perdante rapporte 1 $ aussi.")}</p><p class="sub">${_t("Les prix bougent avec les ordres : quand une issue monte, les autres descendent, comme sur Polymarket.")}</p></section>`}${radiantsH(L[0])}</aside>
 ${chatH(rid,'mkt a-chat',mktChatHead(Object.assign({id,msgs:g.msgs,online:Math.round(g.people*.07)},{})))}
 <section class="pn pad a-rules"><div class="h2">${_t("Règles de résolution")}</div><p class="plead" style="font-size:15px">${esc(g.rules)}</p></section></div></div>`;}
VIEWS.marche=id=>GK[id]?vGroup(id):vMarket(id);
/* sur la page d'un groupe, le panneau « Tes positions » se rafraîchit après un achat ou une vente */
{const placeBet1=placeBet,sellPos1=sellPos;const onGroup=ctx=>{const st=tState(ctx),m=st&&MK[st.m];return m&&m.parent&&(S.ui.route||'')==='marche-'+m.parent;};
 placeBet=function(ctx,ev){const g=onGroup(ctx);placeBet1(ctx,ev);if(g)render(false);};
 sellPos=function(ctx){const g=onGroup(ctx);sellPos1(ctx);if(g)render(false);};}

/* ---------- Chat des groupes : quelques lignes au départ ---------- */
{const t=now(),ids=USER_IDS.slice().sort(()=>R()-.5);const GL={
 presid27:[_t("Roux prend 5 points en une semaine, le marché suit les sondages."),_t("Je garde Non sur Lefèvre à 73 ¢, c’est le meilleur rendement du marché."),_t("Quelqu’un a une source sur le retrait de Moreau ?")],
 ldc27:[_t("Le Real à 22 % c’est cher pour une équipe qui perd ses matchs de poule."),_t("City favori comme chaque année, et comme chaque année…"),_t("Le PSG à 15 ¢, je prends 100 $, on verra au printemps.")],
 crypto2:[_t("Ethereum à 61 %, ça reste le pari sûr."),_t("Solana a doublé son volume en six mois, 19 % c’est bas."),_t("XRP à 9 ¢ pour un simple retour au classement de 2025, pourquoi pas.")]};
 for(const g of GROUPS){const r=room('m:'+g.id);let k=0;(GL[g.id]||[]).forEach((txt,i)=>r.msgs.push(mkMsg({u:ids[k++],k:'msg',text:txt,at:t-(16-i*4)*60000,r:i===0?{'🔥':Math.round(3+R()*12)}:{}})));
  const o=gSorted(g)[1];r.msgs.push(mkMsg({u:ids[k++],k:'bet',text:'',bet:{m:o.id,s:'oui',amt:pick([100,200,300,500]),price:Math.round(o.p)},followers:Math.round(R()*20),at:t-2*60000}));}}

