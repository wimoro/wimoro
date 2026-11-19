/* WIMORO — referral module */

'use strict';
/* =====================================================================================
 *  Partage viral : image d'un pari à envoyer sur WhatsApp ou Instagram + parrainage
 *  ------------------------------------------------------------------------------------
 *  - L'image (1080 × 1350, format publication) est dessinée dans un canvas : question, côté,
 *    prix d'entrée, mise, gain possible (ou gain réalisé), pseudo, rang et code de parrainage.
 *    Sur iPhone elle part par la feuille de partage (Web Share) ; sinon elle se télécharge.
 *  - Parrainage : chaque joueur a un code et un lien. L'ami reçoit REF.BONUS à l'inscription,
 *    le parrain reçoit REF.BONUS au premier pari de son filleul.
 * ===================================================================================== */
const REF={BONUS:10,LINK:()=>SITE_URL+'/'};
const refCode=()=>{if(!S.me.refCode){const base=(S.me.n||'wim').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,8)||'WIM';S.me.refCode=base+'-'+(hash('ref'+(S.me.n||'')+(S.me.email||'')).toString(36).toUpperCase().slice(0,3).padStart(3,'X'));}return S.me.refCode;};
const refLink=()=>REF.LINK()+'?r='+refCode();
const refsAll=()=>S.me.referrals||(S.me.referrals=[]);
const refEarned=()=>refsAll().reduce((a,r)=>a+(r.paid||0),0);
const REF_RE=/^[A-Z0-9]{2,10}-[A-Z0-9]{3}$/i;
/* Lien d'invitation ouvert : on garde le code pour l'inscription et on nettoie l'adresse. */
{try{const q=new URLSearchParams(location.search).get('r');if(q&&REF_RE.test(q.trim())){LS.s('wimoro-ref',q.trim().toUpperCase());history.replaceState(null,'',location.pathname+location.hash);}}catch(e){}}
const pendingRef=()=>LS.g('wimoro-ref')||'';

/* ---------- Image d'un pari ---------- */
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#2448FF';
/* Images à partager (duel, série, clan, parrainage, analyse) : les couleurs du système, lues dans les variables du thème en
   cours (css/tokens.css) ; un fond uni, l'encre, l'accent ; le vert et le rouge pour Oui / Non et pour un gain / une perte. */
function imgPal(){const v=cssVar;return {bg:v('--bg'),surface:v('--surface'),fill:v('--fill'),line:v('--line-2'),text:v('--text'),text2:v('--text-2'),text3:v('--text-3'),accent:v('--accent'),accentBg:v('--accent-bg'),on:v('--on-color'),yes:v('--yes'),no:v('--no'),yesBg:v('--yes-bg'),noBg:v('--no-bg')};}
function wrapLines(ctx,text,maxW,maxLines){const words=String(text).split(/\s+/),lines=[];let cur='';for(const w of words){const tst=cur?cur+' '+w:w;if(ctx.measureText(tst).width>maxW&&cur){lines.push(cur);cur=w;}else cur=tst;}if(cur)lines.push(cur);if(lines.length>maxLines){const L=lines.slice(0,maxLines);let last=L[maxLines-1];while(ctx.measureText(last+'…').width>maxW&&last.length>3)last=last.slice(0,-1).trim();L[maxLines-1]=last+'…';return L;}return lines;}
function rrect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function drawLogo(ctx,x,y,s){rrect(ctx,x,y,s,s,s*.29);ctx.fillStyle='#2448FF';ctx.fill();ctx.save();ctx.translate(x,y);ctx.scale(s/28,s/28);ctx.strokeStyle='#fff';ctx.lineWidth=2.7;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(5,9);ctx.lineTo(9.5,20);ctx.lineTo(14,11.5);ctx.lineTo(18.5,20);ctx.lineTo(23,9);ctx.stroke();ctx.beginPath();ctx.arc(23,9,2.8,0,Math.PI*2);ctx.fillStyle='#F59A0B';ctx.fill();ctx.strokeStyle='#2448FF';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
/* d = {kind:'bet'|'win', q, s, price, amt, gain, mult, pnl} */
function shareCanvas(d){
 const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
 const P=imgPal(),sg=plain(cssVar('--sg')),font=(w,px)=>`${w} ${px}px ${sg}`,oui=d.s==='oui',accent=oui?P.yesBg:P.noBg,txt=s=>plain(String(s));
 ctx.fillStyle=P.bg;ctx.fillRect(0,0,W,H);
 ctx.direction=RTL?'rtl':'ltr';const X=RTL?W-80:80;ctx.textAlign=RTL?'right':'left';
 drawLogo(ctx,RTL?W-80-64:80,80,64);ctx.fillStyle=P.text;ctx.font=font(600,52);ctx.textBaseline='middle';ctx.fillText('wimoro',RTL?W-80-64-18:80+64+18,112);
 ctx.font=font(500,30);ctx.fillStyle=P.text3;ctx.textBaseline='alphabetic';ctx.fillText(txt(d.kind==='win'?_t('J’ai gagné sur Wimoro'):_t('Mon pari sur Wimoro')),X,215);
 /* taille de la question selon sa longueur (2 lignes : 84 px, 3 : 74, davantage : 62), puis bloc centré entre le titre et le pied */
 let qf=62,lines;for(const [z,mx] of [[84,2],[74,3],[62,4]]){ctx.font=font(600,z);lines=wrapLines(ctx,txt(d.q),W-160,4);qf=z;if(lines.length<=mx)break;}
 const lh=Math.round(qf*1.2),big=lines.length<=3,vf=big?72:56,G1=44,G2=96,blockH=lines.length*lh+G1+90+G2+36+vf+20,top=250,bot=H-290;
 ctx.font=font(600,qf);ctx.fillStyle=P.text;let y=top+Math.max(0,Math.round((bot-top-blockH)/2))+qf;for(const l of lines){ctx.fillText(l,X,y);y+=lh;}
 y+=G1-lh+qf*.2+52;ctx.font=font(600,44);const chipW=ctx.measureText(txt(oui?_t('Oui'):_t('Non'))).width+76;rrect(ctx,RTL?X-chipW:X,y-56,chipW,90,24);ctx.fillStyle=accent;ctx.fill();ctx.fillStyle=P.on;ctx.fillText(txt(oui?_t('Oui'):_t('Non')),RTL?X-38:X+38,y+4);
 y+=34+G2+36;const cols=d.kind==='win'?[[_t('Résultat'),F.signed(d.pnl),P.yes],[_t('Côté'),oui?_t('Oui'):_t('Non'),P.text]]:[[_t('Prix d’entrée'),F.c(d.price),P.text],[_t('Mise'),F.usd0(d.amt),P.text],[_t('Gain possible'),F.signed(d.gain)+(d.mult?` (×${F.d1(d.mult)})`:''),P.yes]];
 const wts=cols.length>2?[1,1,1.8]:[1,1],wsum=wts.reduce((a,b)=>a+b,0),cws=wts.map(w=>(W-160)*w/wsum);let vz=cols.length>2?(big?58:48):vf;ctx.font=font(600,vz);while(vz>34&&cols.some((c,i)=>ctx.measureText(plain(c[1])).width>cws[i]-28)){vz-=2;ctx.font=font(600,vz);}cols.forEach(([k,v,col],i)=>{const off=cws.slice(0,i).reduce((a,b)=>a+b,0),cx=RTL?X-off:X+off;ctx.font=font(500,big?32:28);ctx.fillStyle=P.text3;ctx.fillText(txt(k),cx,y);ctx.font=font(600,vz);ctx.fillStyle=col;const num=/\d/.test(v);if(num)ctx.direction='ltr';ctx.fillText(num?plain(v):txt(v),cx,y+(big?84:66));if(num)ctx.direction=RTL?'rtl':'ltr';});
 y=H-250;ctx.strokeStyle=P.line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,y-40);ctx.lineTo(W-80,y-40);ctx.stroke();
 const r=myRank();ctx.font=font(600,34);ctx.fillStyle=P.text;ctx.fillText(txt(`\u200e@${S.me.n} · ${rankName(r.t,r.d)}`),X,y+10);
 ctx.font=font(500,28);ctx.fillStyle=P.text3;ctx.fillText(txt(_t('Rejoins-moi avec le code {0} : {1} offerts.',[refCode(),F.usd0(REF.BONUS)])),X,y+62);
 ctx.font=font(600,30);ctx.fillStyle=P.accent;ctx.fillText('wimoro.com',X,y+118);
 return c;
}
function shareData(kind,o){const m=MK[o.m];if(kind==='win')return {kind:'win',q:o.q,s:o.s,pnl:o.pnl};const p=posOf(o.m,o.s),cost=p.sh*p.avg/100,gain=p.sh-cost;return {kind:'bet',q:m?m.q:o.q,s:o.s,price:p.avg,amt:cost,gain,mult:p.avg>0?100/p.avg:0};}
async function shareOpen(kind,o){
 const d=shareData(kind,o);if(!d.q)return;
 try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
 const cv=shareCanvas(d),url=cv.toDataURL('image/png');S.ui.shareImg=url;S.ui.shareTxt=d.kind==='win'?_t('J’ai gagné {0} sur Wimoro. Rejoins-moi avec le code {1}, {2} offerts : {3}',[plain(F.signed(d.pnl)),refCode(),plain(F.usd0(REF.BONUS)),refLink()]):_t('Mon pari sur Wimoro : {0} sur « {1} ». Rejoins-moi avec le code {2}, {3} offerts : {4}',[d.s==='oui'?_t('Oui'):_t('Non'),d.q,refCode(),plain(F.usd0(REF.BONUS)),refLink()]);
 openModal(`<div class="md shm"><div class="md-h"><div><p>${_t("Partager")}</p><h3>${d.kind==='win'?_t("Ta victoire en image"):_t("Ton pari en image")}</h3></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div>
 <img class="shimg" src="${url}" alt="${_t("Image de ton pari")}">
 <div class="cpm-acts"><button class="btn b-ink lg" data-a="share-send">${_t("{0} Partager l’image",[ic('share',16,'#fff')])}</button><button type="button" class="btn b-white lg" data-a="share-save" data-name="wimoro-${d.kind==='win'?'victoire':'pari'}.png">${_t("{0} Enregistrer l’image",[ic('down',16)])}</button></div>
 <button class="btn b-ghost full" data-a="share-copy">${_t("{0} Copier le texte et mon lien de parrainage",[ic('copy',16)])}</button>
 <p class="note">${_t("L’image contient ton code de parrainage : chaque ami qui s’inscrit avec reçoit {0}, et toi aussi dès son premier pari.",[F.usd0(REF.BONUS)])}</p></div>`,'wide');
 if(!S.me.refShared){S.me.refShared=true;save();}
}
function dataToFile(url,name){const b=atob(url.split(',')[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new File([a],name,{type:'image/png'});}
async function shareSend(){const url=S.ui.shareImg;if(!url)return;const file=dataToFile(url,'wimoro.png');
 const hs=await hostSave(file);if(hs===true){toast({icon:'check',title:_t("Image enregistrée"),dur:1800});return;}if(hs===false)return;
 try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Wimoro',text:S.ui.shareTxt});toast({icon:'check',title:_t("Partagé"),dur:1800});return;}
  if(navigator.share){await navigator.share({title:'Wimoro',text:S.ui.shareTxt,url:refLink()});return;}}catch(e){if(e&&e.name==='AbortError')return;}
 const a=document.createElement('a');a.href=url;a.download='wimoro.png';document.body.appendChild(a);a.click();a.remove();toast({icon:'down',title:_t("Image enregistrée"),text:_t("Le partage direct n’est pas disponible ici : l’image est téléchargée."),dur:3200});}
function shareBtnH(kind,o,cls='ibtn'){return `<button class="${cls}" data-a="share-open" data-k="${kind}" data-m="${esc(o.m||'')}" data-s="${o.s}" data-q="${esc(o.q||'')}" data-pnl="${o.pnl||0}" aria-label="${_t("Partager")}" title="${_t("Partager en image")}">${ic('share',14)}</button>`;}

/* ---------- Parrainage ---------- */
const REF_NAMES=['max_b','clara.p','yoni','sarah.l','tomas','emma_k','rafael','noa.z','lucas.m','ines.d','adam_r','lior'];
function refApplyAtSignup(code){code=(code||'').trim().toUpperCase();if(!code)return false;if(!REF_RE.test(code)||code===refCode())return false;
 S.me.refBy=code;S.me.balance+=REF.BONUS;(S.me.deps=S.me.deps||[]).unshift({coin:'USDC',net:'Wimoro',amt:REF.BONUS,usd:REF.BONUS,at:now(),conf:12,need:12,label:_t("Bonus de parrainage")});
 S.me.notifs.unshift({id:now()+R(),ic:'gift',text:`${_t("Bonus de parrainage : {0} offerts grâce au code {1}.",[F.usd0(REF.BONUS),code])}`,href:'#parrainage',at:now(),read:false});LS.r('wimoro-ref');return true;}
/* Un ami rejoint Wimoro grâce à ton lien, puis place son premier pari. */
function botReferral(){if(!S.me.logged||!S.me.refShared)return;const L=refsAll();
 const pend=L.find(r=>r.st==='pending');
 if(pend&&R()<.5){pend.st='done';pend.paid=REF.BONUS;pend.doneAt=now();S.me.balance+=REF.BONUS;updateHeader();
  toast({tone:'green',icon:'gift',title:`${_t("{0} a placé son premier pari",[pend.n])}`,text:`${_t("{0} de parrainage crédités sur ton solde.",[F.usd0(REF.BONUS)])}`,href:'#parrainage'});notif('gift',`${_t("Parrainage : {0} a placé son premier pari, {1} pour toi.",[pend.n,F.usd0(REF.BONUS)])}`,'#parrainage');save();return;}
 if(L.length>=12||R()>.3)return;const n=pick(REF_NAMES.filter(x=>!L.some(r=>r.n===x)))||('ami'+Math.floor(R()*900+100));L.unshift({n,at:now(),st:'pending',paid:0});
 toast({icon:'users',title:`${_t("{0} a rejoint Wimoro avec ton code",[n])}`,text:`${_t("Tu recevras {0} dès son premier pari.",[F.usd0(REF.BONUS)])}`,href:'#parrainage'});notif('users',`${_t("{0} s’est inscrit avec ton code de parrainage.",[n])}`,'#parrainage');save();}
/* Les trois étapes (téléphone : carte « Comment ça marche » ; ordinateur : à côté du code) */
const refEtapesH=()=>`<div class="refsteps">${[['share',_t("Partage ton lien ou ton code"),_t("Par message, dans une story, ou avec l’image d’un de tes paris.")],['userplus',`${_t("Ton ami s’inscrit : {0} pour lui",[F.usd0(REF.BONUS)])}`,_t("Le bonus arrive sur son solde dès la création de son compte.")],['gift',`${_t("Il place son premier pari : {0} pour toi",[F.usd0(REF.BONUS)])}`,_t("Crédités automatiquement, sans rien faire.")]].map(([i,t2,s2],k)=>`<div class="refstep"><span class="rs-n">${k+1}</span><span class="rs-i">${ic(i,18)}</span><div><b>${t2}</b><small>${s2}</small></div></div>`).join('')}</div>`;
const refKpisH=(L,done)=>`<div class="cp-kpis"><div><small>${_t("Filleuls")}</small><b class="num">${F.int(L.length)}</b></div><div><small>${_t("Premier pari placé")}</small><b class="num">${F.int(done)}</b></div><div><small>${_t("Gagné")}</small><b class="num ${refEarned()>0?'pl-up':''}">${F.usd(refEarned())}</b></div></div>`;
const refListeH=L=>L.length?L.map(r=>`<div class="act"><span><b class="c-1">${esc(r.n)}</b><small class="d-block mt-1">${r.st==='done'?`${_t("Premier pari placé, {0}",[ago(r.doneAt)])}`:`${_t("Inscrit {0}, en attente de son premier pari",[ago(r.at)])}`}</small></span><b class="num ${r.st==='done'?'pl-up':''}">${r.st==='done'?F.signed(r.paid):'—'}</b></div>`).join(''):`<p class="sub">${_t("Personne pour l’instant. Partage ton lien pour commencer.")}</p>`;
/* Ordinateur (relecture) : une carte « inviter » composée pour le grand écran. À gauche, le code (son bouton « copier »
   à côté), le lien (le sien dans le champ) et un seul bouton bleu à la largeur de son texte ; à droite, les trois étapes.
   Colonne de droite : une seule carte « Tes filleuls », les trois chiffres en tête et la liste dessous. Mêmes actions
   (ref-share, ref-copy) ; le bouton « copier le code » reste le dernier ref-copy de la page. */
function refOrdiH(L,done,code,link){
 return `<div class="wrap refw"><nav class="crumbs"><a href="#profil">${_t("Ton profil")}</a><span>/</span><span>${_t("Parrainage")}</span></nav><div class="pagehead mt-3"><div><h1 class="ptitle">${_t("Invite tes amis")}</h1><p class="plead">${_t("Ton ami reçoit {0} à son inscription avec ton code. Tu reçois {0} dès qu’il place son premier pari. Sans limite.",[F.usd0(REF.BONUS)])}</p></div></div>
 <div class="g-side"><div class="col"><section class="pn pad refcard refo"><div class="refo-code"><div class="sub">${_t("Ton code de parrainage")}</div><div class="refcode num">${esc(code)}</div>
  <div class="reflink"><span>${esc(link)}</span><button class="ibtn" data-a="ref-copy" data-v="${esc(link)}" aria-label="${_t("Copier le lien")}" title="${_t("Copier le lien")}">${ic('copy',16)}</button></div>
  <button class="btn b-pri lg refo-go" data-a="ref-share">${_t("{0} Partager mon lien",[ic('share',16)])}</button>
  <button class="ibtn refo-cc" data-a="ref-copy" data-v="${esc(code)}" aria-label="${_t("Copier le code")}" title="${_t("Copier le code")}">${ic('copy',16)}</button></div>
  <div class="refo-how"><div class="h2 mb-4">${_t("Comment ça marche")}</div>${refEtapesH()}</div></section></div>
 <aside class="col"><section class="pn pad refo-fil"><div class="h2 mb-4">${_t("Tes filleuls")}</div>${refKpisH(L,done)}<div class="refo-l">${refListeH(L)}</div></section>
 ${S.me.refBy?`<section class="pn pad"><div class="sub">${_t("Tu as été parrainé avec le code <b>{0}</b> : {1} offerts à ton inscription.",[esc(S.me.refBy),F.usd0(REF.BONUS)])}</div></section>`:''}</aside></div></div>`;}
function vReferral(){const L=refsAll(),done=L.filter(r=>r.st==='done').length,code=refCode(),link=refLink();
 if(GRAND())return refOrdiH(L,done,code,link);
 return `<div class="wrap"><nav class="crumbs"><a href="#profil">${_t("Ton profil")}</a><span>/</span><span>${_t("Parrainage")}</span></nav><div class="pagehead mt-3"><div><h1 class="ptitle">${_t("Invite tes amis")}</h1><p class="plead">${_t("Ton ami reçoit {0} à son inscription avec ton code. Tu reçois {0} dès qu’il place son premier pari. Sans limite.",[F.usd0(REF.BONUS)])}</p></div></div>
 <div class="g-side"><div class="col">
 <section class="pn pad refcard"><div class="sub">${_t("Ton code de parrainage")}</div><div class="refcode num">${esc(code)}</div><div class="reflink"><span>${esc(link)}</span></div><div class="hbtns"><button class="btn b-pri" data-a="ref-share">${_t("{0} Partager mon lien",[ic('share',16,'#fff')])}</button><button class="btn b-white" data-a="ref-copy" data-v="${esc(link)}">${_t("{0} Copier le lien",[ic('copy',16)])}</button><button class="btn b-white" data-a="ref-copy" data-v="${esc(code)}">${_t("Copier le code")}</button></div></section>
 <section class="pn pad"><div class="h2 mb-2">${_t("Comment ça marche")}</div><div class="refsteps">${[['share',_t("Partage ton lien ou ton code"),_t("Par message, dans une story, ou avec l’image d’un de tes paris.")],['userplus',`${_t("Ton ami s’inscrit : {0} pour lui",[F.usd0(REF.BONUS)])}`,_t("Le bonus arrive sur son solde dès la création de son compte.")],['gift',`${_t("Il place son premier pari : {0} pour toi",[F.usd0(REF.BONUS)])}`,_t("Crédités automatiquement, sans rien faire.")]].map(([i,t2,s2],k)=>`<div class="refstep"><span class="rs-n">${k+1}</span><span class="rs-i">${ic(i,18)}</span><div><b>${t2}</b><small>${s2}</small></div></div>`).join('')}</div></section></div>
 <aside class="col"><section class="pn pad"><div class="cp-kpis"><div><small>${_t("Filleuls")}</small><b class="num">${F.int(L.length)}</b></div><div><small>${_t("Premier pari placé")}</small><b class="num">${F.int(done)}</b></div><div><small>${_t("Gagné")}</small><b class="num ${refEarned()>0?'pl-up':''}">${F.usd(refEarned())}</b></div></div></section>
 <section class="pn pad"><div class="h2 mb-1">${_t("Tes filleuls")}</div>${L.length?L.map(r=>`<div class="act"><span><b class="c-1">${esc(r.n)}</b><small class="d-block mt-1">${r.st==='done'?`${_t("Premier pari placé, {0}",[ago(r.doneAt)])}`:`${_t("Inscrit {0}, en attente de son premier pari",[ago(r.at)])}`}</small></span><b class="num ${r.st==='done'?'pl-up':''}">${r.st==='done'?F.signed(r.paid):'—'}</b></div>`).join(''):`<p class="sub">${_t("Personne pour l’instant. Partage ton lien pour commencer.")}</p>`}</section>
 ${S.me.refBy?`<section class="pn pad"><div class="sub">${_t("Tu as été parrainé avec le code <b>{0}</b> : {1} offerts à ton inscription.",[esc(S.me.refBy),F.usd0(REF.BONUS)])}</div></section>`:''}</aside></div></div>`;}
/* Encart sur la page Dépôt et dans les réglages. */
function refTeaserH(){return `<section class="pn pad refteaser"><div class="cpx-h"><span class="cp-ic">${ic('gift',18)}</span><div>${_t("<b>Invite un ami : {0} pour lui, {0} pour toi</b>",[F.usd0(REF.BONUS)])}<small>${_t("Ton code :")} <b class="num">${esc(refCode())}</b></small></div></div><a class="btn b-white full" href="#parrainage">${_t("Voir mon lien de parrainage")}</a></section>`;}

Object.assign(ACT,{
 'share-open':a=>shareOpen(a.dataset.k,{m:a.dataset.m,s:a.dataset.s,q:a.dataset.q,pnl:parseFloat(a.dataset.pnl)||0}),
 'share-send':()=>shareSend(),
 'share-save':async a=>{const url=S.ui.shareImg;if(!url)return;const name=a.dataset.name||'wimoro.png';const hs=await hostSave(dataToFile(url,name));if(hs===true){toast({icon:'check',title:_t("Image enregistrée"),dur:1800});return;}if(hs===false)return;const l=document.createElement('a');l.href=url;l.download=name;document.body.appendChild(l);l.click();l.remove();toast({icon:'down',title:_t("Image enregistrée"),dur:1800});},
 'share-copy':()=>copyText(S.ui.shareTxt||refLink(),_t("Texte copié")),
 'ref-copy':a=>{copyText(a.dataset.v,_t("Copié"));if(!S.me.refShared){S.me.refShared=true;save();}},
 'ref-share':async()=>{if(!S.me.refShared){S.me.refShared=true;save();}const text=_t('Rejoins-moi sur Wimoro avec mon code {0} : {1} offerts à ton inscription.',[refCode(),plain(F.usd0(REF.BONUS))]);
  try{if(navigator.share){await navigator.share({title:'Wimoro',text,url:refLink()});return;}}catch(e){if(e&&e.name==='AbortError')return;}copyText(text+' '+refLink(),_t("Lien copié"));}
});
Object.assign(VIEWS,{parrainage:vReferral});PROTECTED.add('parrainage');TITLES.parrainage=_t("Parrainage");
{const live=fn=>()=>{if(!document.hidden)fn();};planifier('parrainage : faux filleuls',70000,live(botReferral));}

