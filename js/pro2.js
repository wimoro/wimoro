/* WIMORO — pro2 module */

'use strict';
/* =====================================================================================
 *  Mode Pro, partie 2 : l'écran plein écran et ses interactions
 *  ------------------------------------------------------------------------------------
 *  proOpen(id)        ouvre le Mode Pro d'un marché (proOpen(null, instantané) : analyse partagée, en lecture seule)
 *  proClose()         revient au graphique classique
 *  Analyse du joueur  S.me.pro.mk[idMarché] = { iv, type, side, n, off, inds[], dr[] } : enregistrée avec le compte (save()),
 *                     donc retrouvée après un rechargement. Les indicateurs sont limités par le rang (proSlots), les tracés non.
 * ===================================================================================== */
Object.assign(ICP,{
 back:'<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
 expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
 cursor:'<path d="M5 3l14 7-6 2-2 6Z"/>',
 trend:'<path d="M5 18 19 6"/><circle cx="5" cy="18" r="1.7"/><circle cx="19" cy="6" r="1.7"/>',
 hline:'<path d="M3 12h18"/><circle cx="12" cy="12" r="1.9"/>',
 vline:'<path d="M12 3v18"/><circle cx="12" cy="12" r="1.9"/>',
 rect:'<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
 arrow:'<path d="M5 19 19 5"/><path d="M10 5h9v9"/>',
 text:'<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
 flag:'<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>',
 eyeOff:'<path d="M3 3l18 18"/><path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-2.6 3.3M6.2 6.6C3.9 8.3 3 12 3 12s3.5 7 9 7c1.3 0 2.5-.3 3.6-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
 sliders:'<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10"/><circle cx="15" cy="6" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>',
 pencil:'<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19Z"/><path d="m14.5 6.5 3 3"/>',
 tonow:'<path d="M5 6l7 6-7 6"/><path d="M19 5v14"/>',
 image:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L20 18"/>'
});
const PV={open:false,id:null,snap:null,st:null,D:null,tool:'cursor',sel:null,pend:null,hover:null,panel:'',want:null,L:null,M:null,raf:0,ptrs:new Map(),g:null,tools:true,pushed:false,vn:120,end:0,follow:true,W:0,H:0,legKey:'',timer:0,from:null,arm:0};
const PTOOL=['cursor'].concat(PDRAW);
const ptoolLab=k=>k==='cursor'?_t('Sélectionner et déplacer'):pdrawLab(k);
const PTIC={cursor:'cursor',trend:'trend',hline:'hline',vline:'vline',rect:'rect',arrow:'arrow',text:'text',level:'flag'};
const pcolName=c=>({ink:_t('Couleur du thème'),'#2448FF':_t('Bleu'),'#F59A0B':_t('Orange'),'#12A150':_t('Vert'),'#D92D20':_t('Rouge'),'#7A5AF8':_t('Violet')})[c]||c;
const proHex=c=>PVAR[c]?'var('+PVAR[c]+')':proColOk(c)?c:'var(--ink)';
const proPctS=v=>plain(F.pct1(v/100));
const proNum2=v=>plain(unit(NB(nf2.format(v)),'%'));

/* ---------- Analyse enregistrée du joueur ---------- */
function proMe(){const me=S.me;if(!me.pro||typeof me.pro!=='object')me.pro={v:1,mk:{},sh:[]};if(!me.pro.mk||typeof me.pro.mk!=='object')me.pro.mk={};if(!Array.isArray(me.pro.sh))me.pro.sh=[];return me.pro;}
const proPtOk=a=>Array.isArray(a)&&a.length===2&&isFinite(a[0])&&isFinite(a[1]);
function proDrOk(d){if(!d||!PDRAW.includes(d.k)||!proPtOk(d.a))return false;if((d.k==='trend'||d.k==='arrow'||d.k==='rect')&&!proPtOk(d.b))return false;if(!proColOk(d.c))d.c='#2448FF';d.w=clamp(Math.round(+d.w)||2,1,3);d.h=d.h?1:0;if(!d.id)d.id='d'+Math.random().toString(36).slice(2,8);if(d.txt!==undefined)d.txt=String(d.txt).slice(0,60);return true;}
function proSt(id){const P=proMe();let st=P.mk[id];if(!st||typeof st!=='object')st=P.mk[id]={};
 if(!PIVK[st.iv])st.iv='1h';if(st.type!=='courbe'&&st.type!=='bougies')st.type='bougies';if(st.side!=='non')st.side='oui';if(!(st.n>0))st.n=0;if(typeof st.off!=='number'||!isFinite(st.off))st.off=3;
 st.inds=(Array.isArray(st.inds)?st.inds:[]).slice(0,500).map(pindFix).filter(Boolean);st.dr=(Array.isArray(st.dr)?st.dr:[]).filter(proDrOk).slice(-300);st.ha=st.ha?1:0;return st;}
/* Les règles du rang sont appliquées aux données elles-mêmes : hors rang Radiant, un seul exemplaire de chaque indicateur (le premier est gardé),
   puis, au-delà du nombre permis par le rang, les derniers ajoutés sont retirés. */
function proEnforce(st,tell){const max=proSlots(),n0=st.inds.length;let L=proUnl()?st.inds:proUniq(st.inds);const dup=n0-L.length;if(L.length>max)L=L.slice(0,max);if(L.length===n0)return false;st.inds=L;save();
 if(tell)toast({tone:'amber',icon:'lock',title:_t('{0, plural, one{# indicateur} other{# indicateurs}} à la fois avec ton rang',[max]),text:dup?_t('Chaque indicateur une seule fois avec ton rang : les doublons et les indicateurs en trop ont été retirés. Tes tracés sont tous conservés.'):_t('Les indicateurs en trop ont été retirés. Tes tracés sont tous conservés.')});return true;}
/* Ajout d'un indicateur : refusé au-delà de la limite du rang, et refusé s'il est déjà affiché (plusieurs fois le même : rang Radiant).
   C'est cette fonction qui décide, pas l'affichage. */
const proHasInd=(k,exceptId)=>!!PV.st&&PV.st.inds.some(x=>x.k===k&&x.id!==exceptId);
function proAddInd(k,replaceId){const st=PV.st;if(!st||!PIND[k])return false;if(!proUnl()&&proHasInd(k,replaceId))return false;
 if(replaceId){const i=st.inds.findIndex(x=>x.id===replaceId);if(i<0)return false;st.inds.splice(i,1,pindNew(k,st.inds.filter(x=>x.id!==replaceId)));}
 else{if(st.inds.length>=proSlots())return false;st.inds.push(pindNew(k,st.inds));}
 save();return true;}

/* ---------- Données affichées ---------- */
function proA(){if(PV.snap)return proSnapA(PV.snap);return proAgg(PV.D,PV.st.iv==='max'?proMaxMs(PV.D):PIVK[PV.st.iv].ms);}
const proHasVol=A=>{for(let i=Math.max(0,A.n-400);i<A.n;i++)if(A.v[i]>0)return true;return false;};
function proClamp(A){const tot=A.n,pw=Math.max(120,PV.W-56),maxN=Math.max(12,Math.min(tot+8,Math.floor(pw/1.2))),minN=Math.min(8,Math.max(2,tot));PV.vn=clamp(PV.vn,minN,maxN);
 PV.end=PV.snap?clamp(PV.end,Math.min(tot,PV.vn*.5),tot+3):clamp(PV.end,Math.min(tot,PV.vn*.4),tot+PV.vn*.5);}
function proViewInit(fit){const A=proA(),tot=A.n,def=innerWidth>760?140:70;
 if(PV.snap){PV.vn=PV.snap.vn;PV.end=PV.snap.end;PV.follow=false;return;}
 const st=PV.st;if(fit||st.iv==='max'&&!st.n){PV.vn=tot+6;PV.end=tot+3;PV.follow=true;st.off=3;st.n=Math.round(PV.vn);return;}
 PV.vn=st.n>0?st.n:Math.min(def,tot+6);PV.end=tot+st.off;PV.follow=st.off>=0;}
function proViewSave(){if(PV.snap||!PV.st)return;const A=proA();PV.st.n=Math.round(PV.vn*100)/100;PV.st.off=Math.round((PV.end-A.n)*100)/100;PV.follow=PV.st.off>=0;save();}
function proModel(){const A=proA(),cmp=PV.W<560;
 if(PV.snap)return proSnapModel(PV.snap,PV.W,PV.H,{vn:PV.vn,end:PV.end,hover:PV.hover,compact:cmp});
 const st=PV.st,pos=S.me.logged?S.me.positions.filter(p=>p.m===PV.id).map(p=>{const yes=p.s==='oui'?p.avg:100-p.avg;return {p:st.side==='non'?100-yes:yes,s:p.s,label:_t('Ta position {0} à {1}',[p.s==='oui'?_t('Oui'):_t('Non'),plain(F.c(p.avg))])};}):[];
 return {W:PV.W,H:PV.H,A,side:st.side,type:st.type,vn:PV.vn,end:PV.end,inds:st.inds.map(d=>({id:d.id,k:d.k,p:d.p,c:d.c,w:d.w,h:d.h,vals:proCalc(d,A,st.side,[Math.floor(PV.end-PV.vn)-2,Math.ceil(PV.end)+1])})),draws:st.dr,hideAll:!!st.ha,sel:PV.sel,pend:PV.pend,hover:PV.hover,pos,compact:cmp,live:true};}
function proInval(){if(!PV.open||PV.raf)return;PV.raf=requestAnimationFrame(()=>{PV.raf=0;proDraw();});}
function proDraw(){if(!PV.open||!PV.cv)return;const cv=PV.cv,box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(W<60||H<60)return;const dpr=Math.min(2,window.devicePixelRatio||1);
 if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
 PV.W=W;PV.H=H;if(proLegCap()!==PV.legCap)proLegBuild();const A=proA();if(!PV.snap&&PV.follow)PV.end=A.n+PV.st.off;proClamp(A);
 if(!PV.snap){const hp=proHasPos(PV.id);if(PV.hp!==undefined&&hp!==PV.hp)$$('#pro .pro-buy').forEach(e=>{e.innerHTML=proBuyH(PV.id,MK[PV.id]);e.classList.toggle('has3',hp);fixText(e);});PV.hp=hp;}
 const ctx=PV.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 const M=proModel();PV.M=M;PV.L=proPaint(proCvG(ctx),M);proLegend(M);}
/* le prix du marché ouvert vient de bouger */
function proLive(m){if(PV.open&&!PV.snap&&PV.id===m.id)proInval();}

/* ---------- Légende (valeurs sous le réticule, ou dernière bougie) ---------- */
const proLegCap=()=>PV.W<560||PV.H<340?3:5;
function proLegBuild(){const el=$('#pro .pro-leg');if(!el)return;const ro=!!PV.snap,all=ro?PV.snap.inds:PV.st.inds,cap=PV.legCap=proLegCap(),many=all.length>cap,open=many&&!!PV.legAll,L=many&&!open?all.slice(0,cap-1):all;el.classList.toggle('all',open);
 const more=many?`<button class="pl-more" data-a="pro-leg-more" aria-expanded="${open}">${open?_t('Réduire la liste'):_t('{0, plural, one{+ # autre} other{+ # autres}}',[all.length-L.length])}</button>`:'';
 el.innerHTML=`<div class="pl-o" data-plo></div>`+(open?more:'')+L.map(d=>`<div class="pl-i${d.h?' off':''}"><i style="background:${proHex(d.c)}"></i><span class="pl-n">${esc(pindLab(d))}</span><b class="num" data-plv="${d.id}"></b>${ro?'':`<button data-a="pro-ind-eye" data-id="${d.id}" aria-pressed="${!!d.h}" aria-label="${esc(_t('Masquer ou afficher {0}',[pindLab(d)]))}">${ic(d.h?'eyeOff':'eye',14)}</button><button data-a="pro-panel" data-v="ind" data-keep="1" aria-label="${esc(_t('Régler {0}',[pindLab(d)]))}">${ic('sliders',14)}</button><button data-a="pro-ind-del" data-id="${d.id}" aria-label="${esc(_t('Retirer {0}',[pindLab(d)]))}">${ic('x',14)}</button>`}</div>`).join('')+(open?'':more);PV.legKey='';
 const c=$('[data-procnt]');if(c&&!ro)c.textContent=bidi(proCntTxt(PV.st.inds.length));const n=$('[data-prodn]');if(n&&!ro){n.textContent=PV.st.dr.length||'';n.hidden=!PV.st.dr.length;}}
function proLegend(M){const A=M.A,Sr=proSerie(A,M.side),i=M.hover&&M.hover.i!==undefined?clamp(M.hover.i,0,A.n-1):A.n-1,key=i+'|'+A.ver+'|'+M.side+'|'+M.type+'|'+A.ms+'|'+M.inds.map(d=>d.id+d.h+JSON.stringify(d.p)).join(',');if(key===PV.legKey)return;PV.legKey=key;
 const o=$('#pro [data-plo]');if(!o)return;const dr=RTL?' dir="rtl"':'';const when=i===A.n-1&&M.live!==false?_t('En direct'):proWhen(A.T0+i*A.ms,A.ms),side=M.side==='non'?_t('Non'):_t('Oui'),nz=v=>v===v&&v!==null;
 if(M.type==='bougies'){const ch=Sr.c[i]-Sr.o[i];o.innerHTML=`<span class="pl-w">${esc(when)}</span><span class="pl-s ${M.side}">${side}</span><span${dr}>${_t('Ouv.')} <b dir="ltr">${proPctS(Sr.o[i])}</b></span><span${dr}>${_tc('Haut','bougie')} <b dir="ltr">${proPctS(Sr.h[i])}</b></span><span${dr}>${_tc('Bas','bougie')} <b dir="ltr">${proPctS(Sr.l[i])}</b></span><span${dr}>${_tc('Clôt.','bougie')} <b dir="ltr" class="${ch>=0?'pl-up':'pl-dn'}">${proPctS(Sr.c[i])}</b></span><span class="pl-v"${dr}>${_t('Vol.')} <b dir="ltr">${plain(F.compact(A.v[i]||0))}</b></span>`;}
 else o.innerHTML=`<span class="pl-w">${esc(when)}</span><span class="pl-s ${M.side}">${side}</span><b dir="ltr">${proPctS(Sr.c[i])}</b><span class="pl-v"${dr}>${_t('Vol.')} <b dir="ltr">${plain(F.compact(A.v[i]||0))}</b></span>`;
 for(const d of M.inds){const el=$(`#pro [data-plv="${d.id}"]`);if(!el)continue;const V=d.vals,a=V.a[i];let s='–';
  if(d.h)s=_t('masqué');else if(d.k==='bb')s=nz(a)?proNum2(clamp(V.c[i],0,100))+' · '+proNum2(a)+' · '+proNum2(clamp(V.b[i],0,100)):'–';else if(d.k==='rsi')s=nz(a)?plain(F.d1(a)):'–';else if(d.k==='macd')s=nz(a)?proSgn(a)+(nz(V.b[i])?' · '+proSgn(V.b[i])+' · '+proSgn(V.c[i]):''):'–';else s=nz(a)?proNum2(a):'–';el.textContent=s;}}

/* ---------- Construction de l'écran ---------- */
function proTopH(){const snap=PV.snap,id=PV.id,m=MK[id];
 if(snap){const by=snap.by||{n:'',t:0,d:0};return `<button class="pro-back" data-a="pro-close" aria-label="${esc(_t('Fermer l’analyse'))}">${ic('back',18)}<span>${_t('Fermer')}</span></button>
  <div class="pro-ttl"><b class="pro-q">${esc(m?m.short:snap.short)}</b><span class="pro-px">${_t('Analyse de {0}',[esc(by.n)])} ${rk(by.t,by.d)}<span class="pro-at">${_t('Partagée le {0}',[proShareDate(snap.at)])}</span></span></div>
  <div class="pro-ro">${m?`<button class="btn b-ink sm" data-a="pro-fork">${ic('pencil',15)}<span class="pro-l">${_t('Créer mon analyse à partir de celle-ci')}</span><span class="pro-s">${_t('Créer la mienne')}</span></button><a class="btn b-white sm" href="#marche-${m.id}" data-a="pro-goto"><span class="pro-l">${_t('Ouvrir le marché')}</span><span class="pro-s">${_t('Marché')}</span></a>`:''}</div>`;}
 const sib=m.parent&&GK[m.parent]?GK[m.parent].outcomes:null;
 return `<button class="pro-back" data-a="pro-close" aria-label="${esc(_t('Revenir au graphique classique'))}">${ic('back',18)}<span>${_t('Graphique classique')}</span></button>
  <div class="pro-ttl">${sib?`<select class="pro-out" data-pro-out aria-label="${esc(_t('Issue affichée'))}">${sib.map(o=>`<option value="${o.id}"${o.id===id?' selected':''}>${esc(o.label)}</option>`).join('')}</select>`:`<b class="pro-q">${esc(m.short)}</b>`}<span class="pro-px"><span class="num pro-pct" data-mp="${id}">${F.pct(m.p)}</span><span class="pro-oy">${_t('Oui')} <b data-mc="${id}">${F.c(m.p)}</b> · ${_t('Non')} <b data-mcn="${id}">${F.c(100-m.p)}</b></span><span class="delta ${m.p>=m.d0?'up':'dn'}" data-md="${id}">${F.pts(m.p-m.d0)}</span><span class="pro-24">${_t('sur 24 heures')}</span></span></div>
  <div class="pro-buy top${proHasPos(id)?' has3':''}">${proBuyH(id,m)}</div>
  <button class="btn b-ink sm pro-shareb" data-a="pro-share">${ic('share',15,'currentColor')}<span class="pro-l">${_t('Partager mon analyse')}</span><span class="pro-s">${_t('Partager')}</span></button>`;}
const proHasPos=id=>!!(S.me.logged&&S.me.positions.some(p=>p.m===id));
/* acheter et vendre restent à un appui : le ticket d'achat habituel s'ouvre par-dessus, « Vendre » ramène au ticket de la page en mode vente */
const proBuyH=(id,m)=>`<button class="btn b-oui sm" data-a="bet" data-m="${id}" data-s="oui">${_t('Oui')} <span data-mc="${id}">${F.c(m.p)}</span></button><button class="btn b-non sm" data-a="bet" data-m="${id}" data-s="non">${_t('Non')} <span data-mcn="${id}">${F.c(100-m.p)}</span></button>${proHasPos(id)?`<button class="btn b-white sm pro-sellb" data-a="pro-sell">${_t('Vendre')}</button>`:''}`;
function proBarH(){const snap=PV.snap;
 if(snap){const nI=snap.inds.length,nD=snap.dr.length;return `<div class="pro-scroll"><span class="pro-tag">${esc(pivLong(snap.iv))}</span><span class="pro-tag">${snap.type==='bougies'?_t('Bougies'):_t('Courbe')}</span><span class="pro-tag">${snap.side==='non'?_t('Prix du Non'):_t('Prix du Oui')}</span>${snap.p!==null?`<span class="pro-tag">${_t('Oui à {0} au moment du partage',[plain(F.pct(snap.p))])}</span>`:''}<span class="pro-tag">${_t('{0, plural, =0{Aucun indicateur} one{# indicateur} other{# indicateurs}}',[nI])}</span><span class="pro-tag">${_t('{0, plural, =0{Aucun tracé} one{# tracé} other{# tracés}}',[nD])}</span></div>`;}
 const st=PV.st,D=PV.D;
 return `<div class="pro-scroll"><div class="seg pro-iv" role="group" aria-label="${esc(_t('Période'))}">${PIV.map(x=>{const ok=proIvOk(D,x.k);return `<button class="${st.iv===x.k?'on':''}" data-a="pro-iv" data-v="${x.k}" aria-pressed="${st.iv===x.k}"${ok?'':` disabled title="${esc(_t('Pas encore assez d’historique'))}"`} aria-label="${esc(pivLong(x.k))}">${pivLab(x.k)}</button>`;}).join('')}</div>
  <div class="pro-row2"><div class="seg pro-type" role="group" aria-label="${esc(_t('Type de graphique'))}">${[['courbe',_t('Courbe')],['bougies',_t('Bougies')]].map(([k,l])=>`<button class="${st.type===k?'on':''}" data-a="pro-type" data-v="${k}" aria-pressed="${st.type===k}" aria-label="${esc(l)}">${CTI[k]}<span class="pro-l">${l}</span></button>`).join('')}</div>
  <div class="seg pro-side" role="group" aria-label="${esc(_t('Prix affiché'))}">${[['oui',_t('Oui')],['non',_t('Non')]].map(([k,l])=>`<button class="${st.side===k?'on':''}" data-a="pro-side" data-v="${k}" aria-pressed="${st.side===k}">${l}</button>`).join('')}</div>
  <button class="btn b-white sm pro-indb" data-a="pro-panel" data-v="ind" aria-expanded="${PV.panel==='ind'}">${ic('chart',15)} ${_t('Indicateurs')} <span class="pro-cnt num" data-procnt>${bidi(proCntTxt(st.inds.length))}</span></button>
  <button class="btn b-white sm pro-toolb" data-a="pro-tools-toggle" aria-pressed="${PV.tools}" aria-label="${esc(_t('Outils de dessin'))}">${ic('pencil',15)}<span class="pro-l"> ${_t('Outils')}</span></button></div></div>`;}
function proToolsH(){const st=PV.st;return PTOOL.map(k=>`<button class="pt${PV.tool===k?' on':''}" data-a="pro-tool" data-v="${k}" aria-pressed="${PV.tool===k}" aria-label="${esc(ptoolLab(k))}" title="${esc(ptoolLab(k))}">${ic(PTIC[k],19)}</button>`).join('')+`<span class="pt-sep" aria-hidden="true"></span>
 <button class="pt${PV.panel==='obj'?' on':''}" data-a="pro-panel" data-v="obj" aria-label="${esc(_t('Mes tracés'))}" title="${esc(_t('Mes tracés'))}">${ic('layers',19)}<i class="pt-n num" data-prodn${st.dr.length?'':' hidden'}>${st.dr.length||''}</i></button>
 <button class="pt${st.ha?' on':''}" data-a="pro-hide-all" aria-pressed="${!!st.ha}" aria-label="${esc(_t('Masquer tous les tracés'))}" title="${esc(_t('Masquer tous les tracés'))}">${ic(st.ha?'eyeOff':'eye',19)}</button>
 <button class="pt" data-a="pro-clear" aria-label="${esc(_t('Supprimer tous les tracés'))}" title="${esc(_t('Supprimer tous les tracés'))}">${ic('trash',19)}</button>`;}
function proOpen(id,snap){const m=MK[snap?snap.m:id];if(!snap&&!m)return;if(PV.open)proClose(true);
 PV.from=document.activeElement&&document.activeElement!==document.body?document.activeElement:null;
 Object.assign(PV,{hp:undefined,open:true,id:snap?snap.m:id,snap:snap||null,tool:'cursor',sel:null,pend:null,hover:null,panel:'',want:null,g:null,ptrs:new Map(),legKey:'',legAll:false,legCap:0,arm:0,L:null,M:null});
 if(!snap){PV.st=proSt(id);PV.D=proData(m);proEnforce(PV.st,true);if(!proIvOk(PV.D,PV.st.iv))PV.st.iv=['1h','15m','5m','1m'].find(k=>proIvOk(PV.D,k))||'1m';}else{PV.st=null;PV.D=null;}
 const el=document.createElement('div');el.id='pro';el.className='pro'+(snap?' ro':'')+(PV.tools?'':' notools');el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',snap?_t('Analyse partagée'):_t('Mode Pro'));
 el.innerHTML=`<div class="pro-top">${proTopH()}</div><div class="pro-bar">${proBarH()}</div>${snap&&snap.txt?`<p class="pro-cmt">${richText(snap.txt)}</p>`:''}
  <div class="pro-body">${snap?'':`<nav class="pro-tools" aria-label="${esc(_t('Outils de dessin'))}">${proToolsH()}</nav>`}
   <div class="pro-stage" dir="ltr"><canvas class="pro-cv" tabindex="0" aria-label="${esc(_t('Graphique du marché : glisse pour te déplacer, pince ou utilise la molette pour zoomer'))}"></canvas><div class="pro-leg"></div><div class="pro-float" aria-live="polite"></div>
    <div class="pro-zoom"><button data-a="pro-zoom" data-v="out" aria-label="${esc(_t('Dézoomer'))}">${ic('minus',16)}</button><button data-a="pro-zoom" data-v="in" aria-label="${esc(_t('Zoomer'))}">${ic('plus',16)}</button><button data-a="pro-zoom" data-v="reset" aria-label="${esc(snap?_t('Revenir à la vue partagée'):_t('Revenir au présent'))}">${ic('tonow',16)}</button></div></div>
   <aside class="pro-pan" hidden></aside></div>
  ${snap?'':`<div class="pro-foot"><div class="pro-buy foot${proHasPos(PV.id)?' has3':''}">${proBuyH(PV.id,m)}</div></div>`}`;
 document.body.appendChild(el);document.documentElement.classList.add('pro-lock');fixText(el);
 PV.cv=el.querySelector('canvas');PV.ctx=PV.cv.getContext('2d');proBind(el);
 const box=PV.cv.parentElement;PV.W=box.clientWidth;PV.H=box.clientHeight;proLegBuild();proViewInit();proDraw();
 /* une entrée d'historique par ouverture : le bouton « retour » du téléphone ferme le Mode Pro sans quitter la page */
 PV.pid='p'+now().toString(36)+Math.floor(R()*1e4);try{const hs=history.state||{};if(hs.pro)history.replaceState(Object.assign({},hs,{pro:PV.pid}),'');else history.pushState(Object.assign({},hs,{pro:PV.pid}),'');PV.pushed=true;}catch(e){PV.pushed=false;}
 clearInterval(PV.timer);PV.timer=setInterval(()=>{if(!PV.open||PV.snap||document.hidden)return;const mm=MK[PV.id],D=PV.D;if(mm&&D&&Math.floor(now()/6e4)-D.s>D.n-1)proTick(mm,undefined,true);},5000);
 if(!snap){const P=proMe();if(!P.tip){P.tip=1;save();PV.tip=now()+6500;proFloat();setTimeout(()=>{if(PV.open&&PV.tip&&now()>=PV.tip){PV.tip=0;proFloat();}},6600);}else PV.tip=0;}
 try{el.querySelector('.pro-back').focus({preventScroll:true});}catch(e){}}
function proClose(silent){if(!PV.open)return;proViewSave();PV.open=false;clearInterval(PV.timer);if(PV.raf){cancelAnimationFrame(PV.raf);PV.raf=0;}if(PV.ro){PV.ro.disconnect();PV.ro=null;}
 const el=$('#pro');if(el)el.remove();document.documentElement.classList.remove('pro-lock');PV.cv=null;PV.ctx=null;PV.sel=null;PV.pend=null;proStoreSave();
 const back=PV.pushed;PV.pushed=false;if(!silent&&back){try{if(history.state&&history.state.pro===PV.pid)history.back();}catch(e){}}
 const f=PV.from;PV.from=null;if(f&&document.contains(f))try{f.focus({preventScroll:true});}catch(e){}else{const b=$('[data-a="pro-open"]');if(b)try{b.focus({preventScroll:true});}catch(e){}}}
/* Rafraîchit les barres (périodes, outils) sans reconstruire le canevas. */
function proBars(){const el=$('#pro');if(!el)return;const b=el.querySelector('.pro-bar');if(b){const Q=['.pro-scroll','.pro-iv','.pro-row2'],X=Q.map(q=>{const e=b.querySelector(q);return e?e.scrollLeft:0;});b.innerHTML=proBarH();fixText(b);Q.forEach((q,i)=>{const e=b.querySelector(q);if(e)e.scrollLeft=X[i];});}const t=el.querySelector('.pro-tools');if(t&&!PV.snap){t.innerHTML=proToolsH();}el.classList.toggle('notools',!PV.tools);proFloat();}

/* ---------- Barre flottante : tracé sélectionné, saisie d'un texte, aide de l'outil ---------- */
function proFloat(){const f=$('#pro .pro-float');if(!f||PV.snap)return;const d=PV.sel;
 if(PV.edit){const e=PV.edit;f.innerHTML=`<form class="pro-txt" data-form="pro-txt"><input data-protxt maxlength="60" value="${esc(e.txt||'')}" placeholder="${esc(e.k==='level'?_t('Nom du repère (facultatif)'):_t('Ton annotation'))}" aria-label="${esc(_t('Texte de l’annotation'))}" autocomplete="off" enterkeyhint="done"><button class="btn b-ink sm" type="submit">${_t('OK')}</button></form>`;const i=f.querySelector('input');setTimeout(()=>{try{i.focus();i.select();}catch(e){}},30);return;}
 if(PV.tool!=='cursor'){f.innerHTML=`<div class="pro-hint">${ic(PTIC[PV.tool],14)}<span>${PV.pend?_t('Touche le graphique pour poser le second point'):(PV.tool==='trend'||PV.tool==='arrow'||PV.tool==='rect')?_t('Glisse sur le graphique pour tracer, ou touche deux points'):_t('Touche le graphique pour placer')}</span><button data-a="pro-tool" data-v="cursor" aria-label="${esc(_t('Annuler'))}">${ic('x',13)}</button></div>`;return;}
 if(!d){f.innerHTML=PV.tip&&now()<PV.tip?`<div class="pro-hint tip">${ic('info',14)}<span>${matchMedia('(pointer:coarse)').matches?_t('Pince pour zoomer, glisse pour remonter dans l’historique'):_t('Molette pour zoomer, glisser pour remonter dans l’historique')}</span><button data-a="pro-tip-x" aria-label="${esc(_t('Fermer'))}">${ic('x',13)}</button></div>`:'';return;}
 f.innerHTML=`<div class="pro-selb" role="toolbar" aria-label="${esc(_t('Tracé sélectionné'))}"><span class="ps-n">${ic(PTIC[d.k],15)}<span>${esc(pdrawLab(d.k))}</span></span><span class="ps-c" role="group" aria-label="${esc(_t('Couleur'))}">${PCOL.map(c=>`<button class="psw${d.c===c?' on':''}" style="--sw:${proHex(c)}" data-a="pro-dr-col" data-v="${c}" aria-pressed="${d.c===c}" aria-label="${esc(pcolName(c))}"></button>`).join('')}</span>
  <span class="seg ps-w" role="group" aria-label="${esc(_t('Épaisseur'))}">${[1,2,3].map(w=>`<button class="${d.w===w?'on':''}" data-a="pro-dr-w" data-v="${w}" aria-pressed="${d.w===w}" aria-label="${esc(_t('Épaisseur {0}',[w]))}"><i style="height:${w+.5}px"></i></button>`).join('')}</span>
  ${d.k==='text'||d.k==='level'?`<button class="pp-b" data-a="pro-dr-txt" aria-label="${esc(_t('Modifier le texte'))}" title="${esc(_t('Modifier le texte'))}">${ic('text',16)}</button>`:''}<button class="pp-b" data-a="pro-dr-eye" aria-label="${esc(_t('Masquer ce tracé'))}" title="${esc(_t('Masquer ce tracé'))}">${ic('eyeOff',16)}</button><button class="pp-b" data-a="pro-dr-del" aria-label="${esc(_t('Supprimer ce tracé'))}" title="${esc(_t('Supprimer ce tracé'))}">${ic('trash',16)}</button><button class="pp-b" data-a="pro-dr-none" aria-label="${esc(_t('Désélectionner'))}">${ic('x',15)}</button></div>`;}
function proSelect(d){PV.sel=d||null;PV.edit=null;proFloat();if(PV.panel==='obj')proPanel();proInval();}

/* ---------- Panneaux : indicateurs, tracés ---------- */
function proDrDesc(d){const p=v=>proPctS(v);if(d.k==='hline')return p(d.a[1]);if(d.k==='level')return p(d.a[1])+(d.txt?' · '+d.txt:'');if(d.k==='vline')return proWhen(d.a[0],36e5);if(d.k==='text')return d.txt||'';return _t('de {0} à {1}',[p(d.a[1]),p(d.b[1])]);}
function proIndFieldsH(d){const P=d.p,num=(k,l,min,max,step)=>`<label class="pp-f"><span>${l}</span><input type="number" inputmode="${step<1?'decimal':'numeric'}" min="${min}" max="${max}" step="${step}" value="${P[k]}" data-pin="${d.id}" data-k="${k}" aria-label="${esc(l+' ('+pindLab(d)+')')}"></label>`;
 if(d.k==='bb')return num('len',_t('Période'),2,400,1)+num('k',_t('Écarts types'),.5,5,.1);
 if(d.k==='macd')return num('fast',_t('Rapide'),2,200,1)+num('slow',_t('Lente'),3,400,1)+num('sig',_t('Signal'),2,100,1);
 if(d.k==='vwap'){const eff=proAnc(P.anc,proA().ms),L=[['auto',_t('Auto')],['day',_t('Jour')],['week',_t('Semaine')],['all',_t('Depuis l’ouverture')]];return `<div class="pp-f wide"><span>${_t('Remise à zéro')}</span><div class="seg pp-anc" role="group" aria-label="${esc(_t('Remise à zéro'))}">${L.map(([k,l])=>`<button class="${P.anc===k?'on':''}" data-a="pro-ind-anc" data-id="${d.id}" data-v="${k}" aria-pressed="${P.anc===k}">${l}</button>`).join('')}</div><small>${eff==='day'?_t('Recalculé chaque jour à 00:00 UTC.'):eff==='week'?_t('Recalculé chaque lundi.'):_t('Calculé depuis l’ouverture du marché.')}</small></div>`;}
 return num('len',_t('Période'),2,400,1);}
function proIndPanH(){const st=PV.st,max=proSlots(),n=st.inds.length,full=n>=max,r=myRank(),nt=proNextSlotTier(),want=PV.want,A=proA(),vol=proHasVol(A),unl=max===Infinity,top=TIERS.length-1,dup=!!want&&!unl&&proHasInd(want);
 const lock=dup?`<div class="pp-lock" role="alert">${emb(top,0,'e44')}<div><b>${_t('{0} est déjà affiché',[PIND[want].n])}</b><p>${_t('Afficher plusieurs fois le même indicateur, avec des réglages différents, est réservé au rang {0}. Tu peux modifier les réglages de celui qui est affiché.',[TIERS[top].name])}</p>
   <div class="pp-la"><button class="btn b-ink sm" data-a="pro-perks" data-t="${top}">${_t('Découvrir les avantages des rangs')}</button></div></div></div>`:want&&full?`<div class="pp-lock" role="alert">${emb(nt!==null?nt:r.t,0,'e44')}<div><b>${nt===null?_t('Tu affiches déjà le maximum d’indicateurs'):PRO_SLOTS[nt]===Infinity?_t('Indicateurs illimités à partir du rang {0}',[TIERS[nt].name]):_t('{0, plural, one{# indicateur} other{# indicateurs}} en même temps à partir du rang {1}',[PRO_SLOTS[nt],TIERS[nt].name])}</b><p>${_t('Ton rang {0} en affiche {1} à la fois. Tu peux remplacer un indicateur autant de fois que tu veux, et les outils de dessin restent illimités.',[rankName(r.t,r.d),max])}</p>
   <div class="pp-la">${st.inds.map(d=>`<button class="btn b-white sm" data-a="pro-ind-swap" data-id="${d.id}">${_t('Remplacer {0} par {1}',[pindLab(d),PIND[want].n])}</button>`).join('')}${nt!==null?`<button class="btn b-ink sm" data-a="pro-perks">${_t('Découvrir les avantages des rangs')}</button>`:''}</div></div></div>`:'';
 const act=st.inds.map(d=>`<div class="pp-ind${d.h?' off':''}"><div class="pp-ih"><i style="background:${proHex(d.c)}"></i><div><b>${esc(pindLab(d))}</b><small>${pindFull(d.k)}</small></div><button class="pp-b" data-a="pro-ind-eye" data-id="${d.id}" aria-pressed="${!!d.h}" aria-label="${esc(_t('Masquer ou afficher {0}',[pindLab(d)]))}">${ic(d.h?'eyeOff':'eye',16)}</button><button class="pp-b" data-a="pro-ind-del" data-id="${d.id}" aria-label="${esc(_t('Retirer {0}',[pindLab(d)]))}">${ic('trash',16)}</button></div>
   <div class="pp-set">${proIndFieldsH(d)}<div class="pp-f wide"><span>${_t('Couleur et épaisseur')}</span><div class="pp-cw"><span class="ps-c" role="group" aria-label="${esc(_t('Couleur'))}">${PCOL.map(c=>`<button class="psw${d.c===c?' on':''}" style="--sw:${proHex(c)}" data-a="pro-ind-col" data-id="${d.id}" data-v="${c}" aria-pressed="${d.c===c}" aria-label="${esc(pcolName(c))}"></button>`).join('')}</span><span class="seg ps-w" role="group" aria-label="${esc(_t('Épaisseur'))}">${[1,2,3].map(w=>`<button class="${d.w===w?'on':''}" data-a="pro-ind-w" data-id="${d.id}" data-v="${w}" aria-pressed="${d.w===w}" aria-label="${esc(_t('Épaisseur {0}',[w]))}"><i style="height:${w+.5}px"></i></button>`).join('')}</span></div></div></div>
   ${d.k==='bb'?`<p class="pp-note">${_t('Les bandes sont dessinées entre 0 % et 100 % : une probabilité ne sort jamais de cet intervalle.')}</p>`:d.k==='rsi'?`<p class="pp-note">${_t('De 0 à 100. Au-dessus de 70, le prix a beaucoup monté ; sous 30, il a beaucoup baissé.')}</p>`:''}</div>`).join('');
 const cat=PIND_K.map(k=>{const off=k==='vwap'&&!vol,has=!unl&&proHasInd(k);return `<button class="pp-add${has?' has':''}" data-a="pro-ind-add" data-v="${k}"${off?' disabled':''}><span><b>${PIND[k].n}</b><small>${pindFull(k)} · ${off?_t('pas encore de volume sur ce marché'):has?_t('déjà affiché'):PIND[k].pane?_t('volet séparé'):_t('sur le prix')}</small></span><span class="pp-plus">${ic(has?'check':full?'lock':'plus',15)}</span></button>`;}).join('');
 return `<div class="pp-h"><div><h3>${_t('Indicateurs')}</h3><p>${max===Infinity?_t('{0, plural, =0{Aucun indicateur affiché} one{# indicateur affiché} other{# indicateurs affichés}}, sans limite. Rang {1}.',[n,rankName(r.t,r.d)]):_t('{0} sur {1} affichés. Rang {2}.',[n,max,rankName(r.t,r.d)])}</p></div><button class="x" data-a="pro-panel" data-v="" aria-label="${esc(_t('Fermer'))}">${ic('x')}</button></div>
  ${lock}${act?`<div class="pp-l">${act}</div>`:`<p class="pp-emp">${_t('Aucun indicateur affiché. Choisis-en un ci-dessous : il est calculé sur les données du graphique.')}</p>`}
  <div class="pp-ct">${full?_t('Remplacer par un autre indicateur'):_t('Ajouter un indicateur')}</div><div class="pp-cat">${cat}</div>
  <p class="pp-note">${max===Infinity?_t('Rang Radiant : ajoute autant d’indicateurs que tu veux, y compris plusieurs fois le même. Chaque ajout prend d’autres réglages, que tu peux modifier.'):_t('Les outils de dessin ne comptent pas dans cette limite : lignes, zones, flèches et textes sont illimités.')}</p>
  ${S.auth&&S.auth.demo?`<button class="pp-demo" data-a="demo-rank-open">${demoB()}<span>${_t('Changer de rang pour tester')}</span></button>`:''}`;}
function proObjPanH(){const st=PV.st,L=st.dr;
 return `<div class="pp-h"><div><h3>${_t('Mes tracés')}</h3><p>${_t('{0, plural, =0{Aucun tracé sur ce marché} one{# tracé sur ce marché} other{# tracés sur ce marché}}',[L.length])}. ${_t('Enregistrés automatiquement.')}</p></div><button class="x" data-a="pro-panel" data-v="" aria-label="${esc(_t('Fermer'))}">${ic('x')}</button></div>
  ${L.length?`<div class="pp-l">${L.slice().reverse().map(d=>`<div class="pp-obj${PV.sel===d?' on':''}${d.h?' off':''}"><button class="pp-os" data-a="pro-obj-sel" data-id="${d.id}"><i style="color:${proHex(d.c)}">${ic(PTIC[d.k],17)}</i><span><b>${esc(pdrawLab(d.k))}</b><small>${esc(proDrDesc(d))}</small></span></button><button class="pp-b" data-a="pro-obj-eye" data-id="${d.id}" aria-pressed="${!!d.h}" aria-label="${esc(_t('Masquer ou afficher ce tracé'))}">${ic(d.h?'eyeOff':'eye',16)}</button><button class="pp-b" data-a="pro-obj-del" data-id="${d.id}" aria-label="${esc(_t('Supprimer ce tracé'))}">${ic('trash',16)}</button></div>`).join('')}</div>
  <div class="pp-la"><button class="btn b-white sm" data-a="pro-hide-all">${ic(st.ha?'eye':'eyeOff',15)} ${st.ha?_t('Tout afficher'):_t('Tout masquer')}</button><button class="btn b-white sm" data-a="pro-clear">${ic('trash',15)} ${PV.arm&&now()<PV.arm?_t('Confirmer la suppression'):_t('Tout supprimer')}</button></div>`
  :`<p class="pp-emp">${_t('Aucun tracé pour l’instant. Choisis un outil, puis touche le graphique.')}</p>`}`;}
function proPanel(){const p=$('#pro .pro-pan');if(!p)return;const el=$('#pro');if(!PV.panel||PV.snap){p.hidden=true;p.innerHTML='';el.classList.remove('pan');}else{const y=p.scrollTop;p.hidden=false;p.innerHTML=PV.panel==='ind'?proIndPanH():proObjPanH();fixText(p);el.classList.add('pan');p.scrollTop=PV.want?0:y;}
 $$('#pro [data-a="pro-panel"][data-v="ind"]').forEach(b=>b.setAttribute('aria-expanded',String(PV.panel==='ind')));const ob=$('#pro .pro-tools [data-a="pro-panel"]');if(ob)ob.classList.toggle('on',PV.panel==='obj');proInval();}
function proRefresh(){proLegBuild();if(PV.panel)proPanel();proInval();}

/* ---------- Gestes sur le graphique ---------- */
const proXY=e=>{const r=PV.cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
/* point du graphique (heure, prix en valeur « Oui ») sous un pixel ; l'heure est calée sur le milieu d'une bougie */
function proAt(pt){const L=PV.L,A=PV.M.A,i=Math.floor(L.ix(pt.x)),p=clamp(L.py(clamp(pt.y,0,L.mh)),0,100);return [A.T0+(i+.5)*A.ms,Math.round((PV.st.side==='non'?100-p:p)*100)/100];}
function proZoomAt(k,px){const L=PV.L;if(!L)return;const fx=clamp((px===undefined?L.pw:px)/L.pw,0,1),idx=PV.end-PV.vn+fx*PV.vn,A=proA();PV.vn=PV.vn*k;proClamp(A);PV.end=idx+(1-fx)*PV.vn;proClamp(A);PV.follow=PV.end>=A.n;if(!PV.snap)PV.st.off=PV.end-A.n;proInval();}
function proHover(pt,keep){const L=PV.L;if(!L||!pt||pt.x>L.pw||pt.y>L.H-L.padB){if(!keep&&PV.hover){PV.hover=null;proInval();}return;}PV.hover={i:Math.floor(L.ix(pt.x)),y:pt.y};proInval();}
function proNewDrawing(k,a){return {id:'d'+now().toString(36)+Math.floor(R()*1e3).toString(36),k,a,b:k==='trend'||k==='arrow'||k==='rect'?a.slice():undefined,c:k==='rect'?'#F59A0B':k==='level'?'#12A150':'#2448FF',w:2,txt:k==='text'||k==='level'?'':undefined,h:0};}
function proCommit(d){const st=PV.st;if((d.k==='trend'||d.k==='arrow'||d.k==='rect')&&PV.L){const L=PV.L;if(Math.hypot(L.X(d.a[0])-L.X(d.b[0]),L.y(d.a[1])-L.y(d.b[1]))<6){PV.pend=null;proFloat();proInval();return;}}
 st.dr.push(d);if(st.dr.length>300)st.dr.shift();st.ha=0;PV.pend=null;PV.tool='cursor';PV.sel=d;save();proBars();proLegBuild();if(PV.panel==='obj')proPanel();
 if(d.k==='text'){PV.edit=d;proFloat();}proInval();}
function proDown(e){if(!PV.L)return;if(PV.tip){PV.tip=0;proFloat();}const pt=proXY(e);try{PV.cv.setPointerCapture(e.pointerId);}catch(x){}PV.ptrs.set(e.pointerId,pt);const ro=!!PV.snap,L=PV.L;
 if(PV.ptrs.size===2){const P=[...PV.ptrs.values()];if(PV.g&&PV.g.k==='new2'&&!PV.g.moved)PV.pend=null;PV.g={k:'pinch',d0:Math.max(20,Math.hypot(P[0].x-P[1].x,P[0].y-P[1].y)),n0:PV.vn,cx:(P[0].x+P[1].x)/2,idx:PV.end-PV.vn+clamp((P[0].x+P[1].x)/2/L.pw,0,1)*PV.vn};return;}
 if(PV.ptrs.size>2)return;
 if(PV.edit){proTxtCommit();}
 if(!ro&&PV.tool!=='cursor'&&pt.x<=L.pw&&pt.y<=L.mh){const q=proAt(pt),k=PV.tool;
  if(PV.pend){PV.pend.b=q;PV.g={k:'new2',d:PV.pend,x0:pt.x,y0:pt.y,moved:true,second:true};proInval();return;}
  if(k==='trend'||k==='arrow'||k==='rect'){const d=proNewDrawing(k,q);PV.pend=d;PV.g={k:'new2',d,x0:pt.x,y0:pt.y,moved:false};}else PV.g={k:'new1',x0:pt.x,y0:pt.y,q};proInval();return;}
 if(!ro){const hit=proHit(L,PV.M,pt.x,pt.y,e.pointerType==='mouse'?6:14);if(hit){if(PV.sel!==hit.d)proSelect(hit.d);const d=hit.d;PV.g={k:'drag',d,part:hit.part,x0:pt.x,y0:pt.y,a0:d.a.slice(),b0:d.b?d.b.slice():null,moved:false};return;}}
 PV.g={k:'pan',x0:pt.x,y0:pt.y,end0:PV.end,moved:false,touch:e.pointerType!=='mouse'};}
function proMove(e){if(!PV.L)return;const pt=proXY(e),L=PV.L,A=PV.M.A;if(PV.ptrs.has(e.pointerId))PV.ptrs.set(e.pointerId,pt);const g=PV.g;
 if(!PV.ptrs.size){if(e.pointerType==='mouse'){if(PV.pend&&PV.tool!=='cursor'){PV.pend.b=proAt(pt);}proHover(pt);PV.cv.style.cursor=PV.tool!=='cursor'&&!PV.snap?'crosshair':(!PV.snap&&proHit(L,PV.M,pt.x,pt.y,6)?'move':'');}return;}
 if(!g)return;
 if(g.k==='pinch'){if(PV.ptrs.size<2)return;const P=[...PV.ptrs.values()],d=Math.max(20,Math.hypot(P[0].x-P[1].x,P[0].y-P[1].y)),cx=(P[0].x+P[1].x)/2;PV.vn=g.n0*g.d0/d;proClamp(A);PV.end=g.idx+(1-clamp(cx/L.pw,0,1))*PV.vn;proClamp(A);PV.follow=PV.end>=A.n;if(!PV.snap)PV.st.off=PV.end-A.n;PV.hover=null;proInval();return;}
 const dx=pt.x-g.x0,dy=pt.y-g.y0;if(!g.moved&&Math.hypot(dx,dy)>5)g.moved=true;
 if(g.k==='pan'){if(!g.moved)return;PV.end=g.end0-dx/L.cw;proClamp(A);PV.follow=PV.end>=A.n;if(!PV.snap)PV.st.off=PV.end-A.n;if(e.pointerType==='mouse')PV.hover={i:Math.floor(L.ix(pt.x)),y:pt.y};else PV.hover=null;proInval();}
 else if(g.k==='new2'){if(g.moved){g.d.b=proAt(pt);proInval();}}
 else if(g.k==='drag'){if(!g.moved)return;const d=g.d,dt=dx/L.cw*A.ms,dp=(L.py(pt.y)-L.py(g.y0))*(PV.st.side==='non'?-1:1),snap=t=>A.T0+(Math.round((t-A.T0)/A.ms-.5)+.5)*A.ms,P=v=>Math.round(clamp(v,0,100)*100)/100;
  if(g.part==='a'||g.part==='body')d.a=[d.k==='hline'?g.a0[0]:snap(g.a0[0]+dt),d.k==='vline'?g.a0[1]:P(g.a0[1]+dp)];
  if(g.b0&&(g.part==='b'||g.part==='body'))d.b=[snap(g.b0[0]+dt),P(g.b0[1]+dp)];proInval();}}
function proUp(e){const pt=PV.ptrs.get(e.pointerId)||proXY(e);PV.ptrs.delete(e.pointerId);try{PV.cv.releasePointerCapture(e.pointerId);}catch(x){}const g=PV.g;if(!g)return;
 if(g.k==='pinch'){if(PV.ptrs.size<2){PV.g=null;proViewSave();}return;}
 PV.g=null;
 if(g.k==='pan'){if(g.moved)proViewSave();else{if(PV.sel)proSelect(null);if(g.touch){const same=PV.hover&&PV.L&&Math.abs(PV.L.x(PV.hover.i+.5)-pt.x)<14;if(same){PV.hover=null;proInval();}else proHover(pt,true);}}return;}
 if(g.k==='new1'){if(e.type==='pointercancel')return;const d=proNewDrawing(PV.tool,g.q);if(d.k==='level'||d.k==='hline'||d.k==='vline'||d.k==='text')proCommit(d);return;}
 if(g.k==='new2'){if(e.type==='pointercancel'){PV.pend=null;proInval();return;}if(g.moved){g.d.b=proAt(pt);proCommit(g.d);}else{proFloat();proInval();}return;}
 if(g.k==='drag'){if(g.moved){save();if(PV.panel==='obj')proPanel();}}}
function proTxtCommit(f){const d=PV.edit;if(!d)return;const i=f?f.querySelector('[data-protxt]'):$('#pro [data-protxt]');const v=i?i.value.trim().slice(0,60):'';PV.edit=null;
 if(d.k==='text'&&!v){const st=PV.st,k=st.dr.indexOf(d);if(k>=0)st.dr.splice(k,1);if(PV.sel===d)PV.sel=null;}else d.txt=v;save();proLegBuild();proFloat();if(PV.panel==='obj')proPanel();proInval();}
function proBind(el){const cv=PV.cv;
 cv.addEventListener('pointerdown',proDown);cv.addEventListener('pointermove',proMove);cv.addEventListener('pointerup',proUp);cv.addEventListener('pointercancel',proUp);
 cv.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!PV.ptrs.size&&PV.hover){PV.hover=null;proInval();}});
 cv.addEventListener('wheel',e=>{e.preventDefault();const pt=proXY(e),L=PV.L;if(!L)return;if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){const A=proA();PV.end+=e.deltaX/L.cw;proClamp(A);PV.follow=PV.end>=A.n;if(!PV.snap)PV.st.off=PV.end-A.n;proInval();}else proZoomAt(Math.exp(clamp(e.deltaY,-120,120)*.0022),pt.x);clearTimeout(PV.wt);PV.wt=setTimeout(proViewSave,300);},{passive:false});
 cv.addEventListener('dblclick',()=>{if(PV.tool==='cursor'&&!PV.sel)ACT['pro-zoom']({dataset:{v:'reset'}});});
 cv.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('change',e=>{const t=e.target;if(t.dataset.proOut!==undefined){const id=t.value;if(MK[id]){proViewSave();const tools=PV.tools;proClose(true);PV.tools=tools;proOpen(id);}return;}if(t.dataset.pin)proPin(t,true);});
 el.addEventListener('input',e=>{const t=e.target;if(t.dataset.pin)proPin(t,false);});
 if(typeof ResizeObserver!=='undefined'){PV.ro=new ResizeObserver(()=>proInval());PV.ro.observe(cv.parentElement);}}
/* un réglage d'indicateur change : le calcul est refait tout de suite */
function proPin(t,final){const d=PV.st.inds.find(x=>x.id===t.dataset.pin);if(!d)return;const v=F.parse(t.value);if(!t.value.trim()||!isFinite(v)||v<=0){if(final)t.value=d.p[t.dataset.k];return;}
 const before=JSON.stringify(d.p);d.p[t.dataset.k]=v;pindFix(d);if(final)$$(`#pro [data-pin="${d.id}"]`).forEach(i=>{i.value=d.p[i.dataset.k];});if(JSON.stringify(d.p)!==before){save();proLegBuild();const h=$$('#pro .pp-ind').find(x=>x.querySelector(`[data-pin="${d.id}"]`));if(h){const b=h.querySelector('.pp-ih b');if(b)b.textContent=pindLab(d);}proInval();}}

/* ---------- Actions ---------- */
const proInd=id=>PV.st?PV.st.inds.find(d=>d.id===id):null,proDr=id=>PV.st?PV.st.dr.find(d=>d.id===id):null;
Object.assign(ACT,{
 'pro-open':a=>proOpen(a.dataset.m),
 'pro-close':()=>proClose(),'pro-goto':()=>proClose(true),
 'pro-sell':()=>{const id=PV.id,go=()=>{if(S.me.positions.some(p=>p.m===id))ACT.tmode({dataset:{v:'sell'}});};if((S.ui.route||'')!=='marche-'+id){proClose(true);location.hash='#marche-'+id;setTimeout(go,160);}else{proClose();go();}},
 'pro-iv':a=>{const st=PV.st,k=a.dataset.v;if(!st||!PIVK[k]||!proIvOk(PV.D,k))return;const A0=proA(),tEnd=A0.T0+PV.end*A0.ms,fol=PV.follow,off=st.off;st.iv=k;const A=proA();
  if(k==='max')proViewInit(true);else{if(fol)PV.end=A.n+Math.min(off,6);else PV.end=(tEnd-A.T0)/A.ms;PV.vn=Math.min(PV.vn,A.n+8);proClamp(A);PV.follow=PV.end>=A.n;st.off=PV.end-A.n;}
  PV.hover=null;proViewSave();proBars();proRefresh();},
 'pro-type':a=>{if(!PV.st)return;PV.st.type=a.dataset.v==='courbe'?'courbe':'bougies';save();proBars();proInval();},
 'pro-side':a=>{if(!PV.st)return;PV.st.side=a.dataset.v==='non'?'non':'oui';save();proBars();proRefresh();},
 'pro-panel':a=>{const v=a.dataset.v||'';PV.panel=a.dataset.keep?v:(PV.panel===v?'':v);PV.want=null;PV.arm=0;proPanel();},
 'pro-ind-add':a=>{const k=a.dataset.v;if(!PV.st||!PIND[k])return;if(proAddInd(k)){PV.want=null;proRefresh();}else{PV.want=k;proPanel();}},
 'pro-ind-swap':a=>{if(!PV.want)return;if(proAddInd(PV.want,a.dataset.id)){PV.want=null;proRefresh();}},
 'pro-ind-del':a=>{const st=PV.st;if(!st)return;const i=st.inds.findIndex(d=>d.id===a.dataset.id);if(i<0)return;st.inds.splice(i,1);PV.want=null;save();proRefresh();},
 'pro-ind-eye':a=>{const d=proInd(a.dataset.id);if(!d)return;d.h=d.h?0:1;save();proRefresh();},
 'pro-ind-col':a=>{const d=proInd(a.dataset.id);if(!d||!PCOL.includes(a.dataset.v))return;d.c=a.dataset.v;save();proRefresh();},
 'pro-ind-w':a=>{const d=proInd(a.dataset.id);if(!d)return;d.w=clamp(+a.dataset.v||2,1,3);save();proRefresh();},
 'pro-leg-more':()=>{PV.legAll=!PV.legAll;proLegBuild();PV.legKey='';proInval();},
 'pro-ind-anc':a=>{const d=proInd(a.dataset.id);if(!d)return;d.p.anc=a.dataset.v;pindFix(d);save();proRefresh();},
 /* « Découvrir les avantages des rangs » : la fenêtre existante du rang visé (conditions, et tout ce qu'il débloque) */
 'pro-perks':a=>{const t=a&&a.dataset&&a.dataset.t!==undefined?+a.dataset.t:proNextSlotTier();tierModal(t!==null&&TIERS[t]?t:myRank().t);},
 'pro-tool':a=>{if(PV.snap)return;if(PV.edit)proTxtCommit();PV.tool=PTOOL.includes(a.dataset.v)?a.dataset.v:'cursor';PV.pend=null;if(PV.tool!=='cursor')PV.sel=null;$$('#pro .pro-tools [data-a="pro-tool"]').forEach(b=>{const on=b.dataset.v===PV.tool;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});proFloat();proInval();},
 'pro-tools-toggle':()=>{PV.tools=!PV.tools;const el=$('#pro');if(el)el.classList.toggle('notools',!PV.tools);$$('#pro [data-a="pro-tools-toggle"]').forEach(b=>b.setAttribute('aria-pressed',String(PV.tools)));if(!PV.tools&&PV.tool!=='cursor')ACT['pro-tool']({dataset:{v:'cursor'}});proInval();},
 'pro-hide-all':()=>{const st=PV.st;if(!st)return;st.ha=st.ha?0:1;if(st.ha)PV.sel=null;save();proBars();if(PV.panel==='obj')proPanel();proInval();},
 'pro-clear':()=>{const st=PV.st;if(!st||!st.dr.length){toast({icon:'info',title:_t('Aucun tracé à supprimer')});return;}
  if(!(PV.arm&&now()<PV.arm)){PV.arm=now()+4000;if(PV.panel==='obj')proPanel();else toast({tone:'amber',icon:'info',title:_t('Supprimer tous les tracés ?'),text:_t('Appuie une seconde fois sur la corbeille pour confirmer.'),dur:3800});return;}
  PV.arm=0;st.dr=[];PV.sel=null;PV.pend=null;save();proBars();proLegBuild();if(PV.panel==='obj')proPanel();proInval();toast({icon:'check',title:_t('Tracés supprimés')});},
 'pro-obj-sel':a=>{const d=proDr(a.dataset.id);if(!d)return;if(d.h){d.h=0;save();}if(PV.st.ha){PV.st.ha=0;proBars();}proSelect(d);},
 'pro-obj-eye':a=>{const d=proDr(a.dataset.id);if(!d)return;d.h=d.h?0:1;if(d.h&&PV.sel===d)PV.sel=null;save();proFloat();proPanel();},
 'pro-obj-del':a=>{const st=PV.st,i=st?st.dr.findIndex(d=>d.id===a.dataset.id):-1;if(i<0)return;if(PV.sel===st.dr[i])PV.sel=null;st.dr.splice(i,1);save();proFloat();proLegBuild();proPanel();},
 'pro-dr-col':a=>{const d=PV.sel;if(!d||!PCOL.includes(a.dataset.v))return;d.c=a.dataset.v;save();proFloat();if(PV.panel==='obj')proPanel();proInval();},
 'pro-dr-w':a=>{const d=PV.sel;if(!d)return;d.w=clamp(+a.dataset.v||2,1,3);save();proFloat();proInval();},
 'pro-dr-txt':()=>{if(!PV.sel)return;PV.edit=PV.sel;proFloat();},
 'pro-dr-eye':()=>{const d=PV.sel;if(!d)return;d.h=1;PV.sel=null;save();proFloat();if(PV.panel==='obj')proPanel();proInval();toast({icon:'eye',title:_t('Tracé masqué'),text:_t('Retrouve-le dans « Mes tracés ».')});},
 'pro-dr-del':()=>{const d=PV.sel,st=PV.st;if(!d||!st)return;const i=st.dr.indexOf(d);if(i>=0)st.dr.splice(i,1);PV.sel=null;PV.edit=null;save();proFloat();proLegBuild();if(PV.panel==='obj')proPanel();proInval();},
 'pro-dr-none':()=>proSelect(null),'pro-tip-x':()=>{PV.tip=0;proFloat();},
 'pro-zoom':a=>{const v=a.dataset.v;if(v==='in')proZoomAt(.7);else if(v==='out')proZoomAt(1/.7);else{if(PV.snap){PV.vn=PV.snap.vn;PV.end=PV.snap.end;}else{const A=proA();PV.st.off=3;PV.follow=true;if(PV.st.iv==='max')PV.vn=A.n+6;PV.end=A.n+3;}PV.hover=null;proInval();}clearTimeout(PV.wt);PV.wt=setTimeout(proViewSave,200);}
});
FORMS['pro-txt']=f=>proTxtCommit(f);

/* ---------- Clavier, retour arrière, thème ---------- */
document.addEventListener('keydown',e=>{if(!PV.open||$('#ov')||$('#sov')||$('.rankup'))return;const t=e.target,typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT');
 if(e.key==='Escape'){e.stopPropagation();if(PV.edit){proTxtCommit();return;}if(PV.pend||PV.tool!=='cursor'){ACT['pro-tool']({dataset:{v:'cursor'}});return;}if(PV.sel){proSelect(null);return;}if(PV.panel){PV.panel='';PV.want=null;proPanel();return;}proClose();return;}
 if(e.key==='Tab'){const L=$$(FOCUSABLE,$('#pro')).filter(x=>x.getClientRects().length);if(!L.length)return;const a=document.activeElement,first=L[0],last=L[L.length-1];if(!$('#pro').contains(a)){e.preventDefault();first.focus();}else if(e.shiftKey&&a===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}return;}
 if(typing)return;
 if((e.key==='Delete'||e.key==='Backspace')&&PV.sel){e.preventDefault();ACT['pro-dr-del']();return;}
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const A=proA();PV.end+=(e.key==='ArrowLeft'?-1:1)*Math.max(1,PV.vn*.1);proClamp(A);PV.follow=PV.end>=A.n;if(!PV.snap)PV.st.off=PV.end-A.n;proInval();clearTimeout(PV.wt);PV.wt=setTimeout(proViewSave,300);return;}
 if(e.key==='+'||e.key==='='){proZoomAt(.8);return;}if(e.key==='-'){proZoomAt(1.25);return;}},true);
window.addEventListener('popstate',()=>{if(PV.open&&!(history.state&&history.state.pro===PV.pid))proClose(true);});
window.addEventListener('hashchange',()=>{if(PV.open)proClose(true);});
window.addEventListener('resize',()=>proInval());
new MutationObserver(()=>{PCSS=null;proInval();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
addEventListener('pagehide',proStoreSave);document.addEventListener('visibilitychange',()=>{if(document.hidden)proStoreSave();else proInval();});
planifier('mode pro : mémoire locale du graphique',20000,()=>{if(!document.hidden)proStoreSave();},'tous');

