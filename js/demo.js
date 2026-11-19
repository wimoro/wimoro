/* WIMORO — demo module */

'use strict';
/* =====================================================================================
 *  Mode Pro, partie 3 : partager une analyse (dans les chats, ou en image hors de Wimoro), carte d'analyse dans les chats,
 *  analyses des autres joueurs, et bouton de grade du compte démo
 *  ------------------------------------------------------------------------------------
 *  Une analyse partagée est un INSTANTANÉ (proSnap) : bougies visibles, indicateurs calculés, tracés, commentaire.
 *  Il est publié comme un message de chat ordinaire (k:'ana') dans les salons existants : général, marché, clan, message privé.
 *  La démo n'a pas de serveur : les analyses du joueur sont gardées avec son compte (S.me.pro.sh) et remises dans les salons
 *  au chargement. Rien n'est envoyé à un autre appareil. Pour brancher un serveur : remplacer proPublish() et proRooms().
 * ===================================================================================== */
const proShareDate=(at,short)=>_t('{0} à {1}',[new Date(at).toLocaleDateString(LOC,{day:'numeric',month:short?'short':'long'}),hhmm(at)]);
const proCountsTxt=s=>_t('{0, plural, =0{Aucun indicateur} one{# indicateur} other{# indicateurs}}',[s.inds.length])+' · '+_t('{0, plural, =0{Aucun tracé} one{# tracé} other{# tracés}}',[s.dr.length]);

/* ---------- Carte d'analyse dans un chat ---------- */
function proCardSvg(s,W,H){const k='_svg'+W+'x'+H;if(s[k])return s[k];const v=proSnapSvg(s,W,H);Object.defineProperty(s,k,{value:v,enumerable:false,configurable:true});return v;}
function anaCardH(x){const s=x.ana;if(!s)return '';const m=MK[s.m],by=userOf(x.u).n;
 return `<div class="anac"><div class="an-h"><span class="an-k">${ic('chart',13)} ${_t('Analyse')}</span>${m?`<a class="an-m" href="#marche-${m.id}">${esc(m.short)}</a>`:`<span class="an-m">${esc(s.short)}</span>`}<span class="an-iv">${esc(pivLong(s.iv))}</span></div>
  <button class="an-pv" data-a="pro-view" data-id="${x.id}" aria-label="${esc(_t('Voir l’analyse de {0}',[by]))}" dir="ltr">${proCardSvg(s,360,190)}</button>
  <div class="an-f"><span class="an-meta"><span>${proCountsTxt(s)}</span><span class="an-at">${_t('Partagée le {0}',[proShareDate(s.at,true)])}</span></span><button class="btn b-ink sm" data-a="pro-view" data-id="${x.id}">${_t('Voir l’analyse')}</button></div></div>`;}

/* ---------- Publication ---------- */
const PRO_REPLY=[()=>_t('belle analyse, je surveille ce niveau.'),()=>_t('je vois la même chose sur ce graphique.'),()=>_t('pas d’accord, pour moi la tendance reste intacte.'),()=>_t('merci pour le partage, je garde ça sous le coude.'),()=>_t('propre. Tu entres maintenant ou tu attends ?')];
const PRO_DM=[()=>_t('Bien vu, ton analyse. Je regarde ça de près.'),()=>_t('Intéressant. Tu entres maintenant ou tu attends ?'),()=>_t('Merci, je la compare avec la mienne.')];
function proClanRoom(mc){const rid='clan:'+mc.id,cr=room(rid);cr.name=mc.name;cr.kind='clan';if(!cr.msgs.length&&typeof clanSeedRoom==='function')clanSeedRoom(mc);return rid;}
/* Publie l'instantané dans les salons choisis, comme n'importe quel message. */
/* Les analyses publiées sont gardées avec le compte, dans le stockage du navigateur (quelques Mo au total). Une analyse à très nombreux indicateurs
   pèse lourd : les plus anciennes cèdent la place, et une analyse qui dépasserait le budget à elle seule reste dans les chats jusqu'au rechargement. */
const PRO_SH_MAX=15e5;
function proPublish(snap,rooms){const P=proMe(),ep=S.epoch,size=x=>JSON.stringify(x).length;P.sh=P.sh.filter(x=>x&&x.id!==snap.id);P.sh.unshift({id:snap.id,at:snap.at,rooms:rooms.slice(),snap});P.sh=P.sh.slice(0,12);
 {let tot=P.sh.reduce((a,x)=>a+size(x),0);while(P.sh.length>1&&tot>PRO_SH_MAX)tot-=size(P.sh.pop());if(tot>PRO_SH_MAX){P.sh.shift();toast({tone:'amber',icon:'info',title:_t('Analyse très lourde'),text:_t('Elle est publiée, mais trop volumineuse pour être gardée après un rechargement de la page.'),dur:6000});}}
 rooms.forEach((rid,n)=>{const dm=rid.startsWith('dm:');if(rid.startsWith('clan:')){const mc=typeof myClan==='function'?myClan():null;if(mc&&'clan:'+mc.id===rid)proClanRoom(mc);}if(dm){const r=room(rid);if(!r.msgs.length)r.msgs.push(mkMsg({k:'evt',text:_t('Début de ta conversation avec {0}',[userOf(rid.slice(3)).n])}));}
  const x=mkMsg({u:'me',k:'ana',text:snap.txt||'',ana:snap,shid:snap.id,inj:1});addMsg(rid,x);
  setTimeout(()=>{if(ep!==S.epoch)return;const e=pick(['🎯','🔥','👀']);x.r[e]=(x.r[e]||0)+1+Math.floor(R()*3);refreshReacts(x);},1400+n*500+R()*1500);
  setTimeout(()=>{if(ep!==S.epoch)return;let u;if(dm)u=rid.slice(3);else if(rid.startsWith('clan:')){const mc=typeof myClan==='function'?myClan():null,mates=mc&&typeof clanMates==='function'?clanMates(mc):[];u=mates.length?pick(mates):pickUser();}else u=pickUser();
   addMsg(rid,mkMsg({u,k:'msg',text:dm?pick(PRO_DM)():'@'+S.me.n+' '+pick(PRO_REPLY)()}));},2600+n*900+R()*2600);});
 S.me.msgsTotal++;if(S.me.chatDay!==today()){S.me.chatDay=today();S.me.chatXP=0;}if(S.me.chatXP<20){const g=Math.min(2,20-S.me.chatXP);S.me.chatXP+=g;gainXP(g);}
 mission('chat');if(rooms.some(r=>r.startsWith('m:')))mission('chatm');checkBadges();save();}
/* Au chargement et à chaque changement de compte : les analyses du compte reviennent dans leurs salons (à leur date). */
function proRooms(){for(const id in S.rooms){const r=S.rooms[id];if(r.msgs.some(x=>x.inj))r.msgs=r.msgs.filter(x=>!x.inj);}
 if(!S.me.logged||SRV())return;const P=proMe(),mc=typeof myClan==='function'?myClan():null;   /* avec un compte, les analyses reviennent du serveur, dans l'historique des salons */
 for(const sh of P.sh.slice().reverse()){if(!sh||!sh.snap||!sh.snap.id||!Array.isArray(sh.rooms)||!Array.isArray(sh.snap.c))continue;
  for(const rid of sh.rooms){if(rid.startsWith('clan:')){if(!mc||'clan:'+mc.id!==rid)continue;proClanRoom(mc);}else if(rid.startsWith('dm:')){if(!USERS[rid.slice(3)])continue;}else if(rid.startsWith('m:')){if(!MK[rid.slice(2)]&&!(typeof GK!=='undefined'&&GK[rid.slice(2)]))continue;}else if(rid!=='general')continue;
   const r=room(rid);r.msgs.push(mkMsg({u:'me',k:'ana',text:sh.snap.txt||'',ana:sh.snap,shid:sh.snap.id,at:sh.at,inj:1}));r.msgs.sort((a,b)=>a.at-b.at);}}}

/* ---------- Fenêtre « Partager mon analyse » ---------- */
function proShareH(){const sh=PV.share,s=sh.snap,m=MK[s.m],mc=typeof myClan==='function'?myClan():null,fr=friendsOf(),dmOk=can('dm'),D=sh.dst;
 const opt=(k,icn,title,sub)=>`<button class="psh-o${D[k]?' on':''}" data-a="pro-sh-dst" data-v="${k}" role="checkbox" aria-checked="${!!D[k]}"><span class="psh-i">${icn}</span><span class="psh-t"><b>${title}</b><small>${sub}</small></span><i class="psh-ck" aria-hidden="true">${ic('check',13,'#fff',3)}</i></button>`;
 return `<div class="md pro-sh"><div class="md-h"><div><h3>${_t('Partager mon analyse')}</h3><p>${esc(m.short)} · ${esc(pivLong(s.iv))} · ${proCountsTxt(s)}</p></div><button class="x" data-a="close" aria-label="${esc(_t('Fermer'))}">${ic('x')}</button></div>
  <div class="psh-pv" dir="ltr">${innerWidth<=879?proSnapSvg(s,360,230):proSnapSvg(s,560,290)}</div>
  <p class="psh-note">${_t('C’est un instantané : si le prix bouge ensuite, ton analyse publiée ne change pas.')}</p>
  <label class="psh-c"><span>${_t('Ton commentaire (facultatif)')}</span><textarea data-psh-txt maxlength="280" rows="2" placeholder="${esc(_t('Explique ta lecture du marché'))}">${esc(sh.txt||'')}</textarea></label>
  <div class="psh-d" role="group" aria-label="${esc(_t('Où partager'))}"><div class="psh-dt">${_t('Où la partager ?')}</div>
   ${opt('gen',ic('chat',17),_t('Chat général'),_t('Toute la communauté Wimoro'))}
   ${opt('mkt',ic('hash',17),_t('Chat du marché'),esc(m.short))}
   ${mc?opt('clan',emblemH(mc,22),_t('Mon clan'),esc(mc.name)):`<a class="psh-o off" href="#clans" data-a="close"><span class="psh-i">${ic('shield',17)}</span><span class="psh-t"><b>${_t('Mon clan')}</b><small>${_t('Rejoins un clan pour partager avec lui')}</small></span><i class="psh-go">${ic('right',15)}</i></a>`}
   <div class="psh-o dm${D.dm?' on':''}"><span class="psh-i">${ic('send',17)}</span><span class="psh-t"><b>${_t('Message privé')}</b>${!dmOk?`<small>${_t('Les messages privés s’ouvrent au rang {0}',[TIERS[GATES.dm.t].name])}</small>`:fr.length?`<small>${_t('Choisis un ami')}</small><span class="psh-fr" role="group" aria-label="${esc(_t('Choisis un ami'))}">${fr.filter(u=>USERS[u]).map(u=>`<button class="chip${D.dm===u?' on':''}" data-a="pro-sh-dm" data-u="${u}" aria-pressed="${D.dm===u}">${avH(u,20,'span')}${esc(userOf(u).n)}</button>`).join('')}</span>`:`<small>${_t('Ajoute un ami pour lui envoyer ton analyse')}</small>`}</span>${!dmOk?`<button class="btn b-white sm" data-a="lock" data-g="dm">${ic('lock',12)} ${TIERS[GATES.dm.t].name}</button>`:fr.length?'':`<a class="btn b-white sm" href="#amis" data-a="close">${_t('Mes amis')}</a>`}</div></div>
  <div class="psh-d out"><div class="psh-dt">${_t('Ou en dehors de Wimoro')}</div>
   <button class="psh-o" data-a="pro-sh-img"><span class="psh-i">${ic('image',17)}</span><span class="psh-t"><b>${_t('Créer une image à partager')}</b><small>${_t('Ton graphique annoté et ton commentaire, pour une story ou un message')}</small></span><i class="psh-go">${ic('right',15)}</i></button></div>
  ${SRV()?'':demoHint(_t('Les autres joueurs sont simulés : ton analyse est enregistrée sur cet appareil, pas envoyée ailleurs.'))}
  <div class="md-acts"><button class="btn b-ink lg full" data-a="pro-sh-send"${proShareRooms().length?'':' disabled'}>${ic('share',16,'currentColor')} ${_t('Partager')}</button></div></div>`;}
function proShareRooms(){const sh=PV.share;if(!sh)return [];const D=sh.dst,R_=[],mc=typeof myClan==='function'?myClan():null;if(D.gen)R_.push('general');if(D.mkt)R_.push('m:'+sh.snap.m);if(D.clan&&mc)R_.push('clan:'+mc.id);if(D.dm&&can('dm')&&friendsOf().includes(D.dm)&&USERS[D.dm])R_.push('dm:'+D.dm);return R_;}
function proShareModal(){if(!PV.open||PV.snap||!PV.st)return;const st=PV.st;if(PV.edit)proTxtCommit();
 const snap=proSnap({A:proA(),end:PV.end,vn:PV.vn,m:PV.id,iv:st.iv,type:st.type,side:st.side,inds:st.inds,draws:st.dr,hideAll:st.ha});
 PV.share={snap,txt:'',dst:{gen:false,mkt:true,clan:false,dm:''}};openModal(proShareH(),'wide');}
function proShareSync(){const b=$('#ov [data-a="pro-sh-send"]');if(b)b.disabled=!proShareRooms().length;const D=PV.share.dst;$$('#ov [data-a="pro-sh-dst"]').forEach(o=>{const on=!!D[o.dataset.v];o.classList.toggle('on',on);o.setAttribute('aria-checked',String(on));});
 $$('#ov [data-a="pro-sh-dm"]').forEach(c=>{const on=D.dm===c.dataset.u;c.classList.toggle('on',on);c.setAttribute('aria-pressed',String(on));});const dm=$('#ov .psh-o.dm');if(dm)dm.classList.toggle('on',!!D.dm);}

/* ---------- Image d'une analyse, à partager en dehors de Wimoro ----------
   Même format et même pied que l'image d'un pari (1080 × 1350, pseudo, rang, code de parrainage) ; le graphique est dessiné par le peintre du Mode Pro,
   à partir de l'instantané : mêmes bougies, mêmes indicateurs, mêmes tracés que dans la carte publiée. Palette sombre fixe, quel que soit le thème. */
/* graphique de l'image : les couleurs du thème en cours, sous les noms du Mode Pro */
const proImgPal=()=>{const P=imgPal();return {ink:P.text,g2:P.text2,g3:P.text3,g4:cssVar('--text-4'),rule:P.line,soft:P.fill,panel:P.surface,bg:P.bg,oui:P.yes,non:P.no,up:P.yes,dn:P.no,be:P.text3};};
/* Texte dessiné dans un canevas : mêmes espaces insécables que dans la page (fixText), et retour à la ligne sur les seules espaces ordinaires
   (« 150 000 $ » ou « 31 décembre » ne sont jamais coupés en deux). */
const proTypo=s=>LANG==='fr'?String(s).replace(/(\d) (?=[\d$%¢A-Za-zÀ-ÿ])/g,'$1\u00A0').replace(/ ([?!:;%$¢»])/g,'\u00A0$1').replace(/« /g,'«\u00A0'):String(s).replace(FIX_UNIT,'$1\u00A0');
function proWrap(ctx,text,maxW,maxLines){const words=proTypo(text).split(' ').filter(Boolean),lines=[];let cur='';for(const w of words){const tst=cur?cur+' '+w:w;if(ctx.measureText(tst).width>maxW&&cur){lines.push(cur);cur=w;}else cur=tst;}if(cur)lines.push(cur);
 if(lines.length>maxLines){const L=lines.slice(0,maxLines);let last=L[maxLines-1];while(ctx.measureText(last+'…').width>maxW&&last.length>3)last=last.slice(0,-1).trim();L[maxLines-1]=last+'…';return L;}return lines;}
const proSidePx=s=>s.p===null||s.p===undefined?'':s.side==='non'?_t('Non à {0}',[plain(F.pct(100-s.p))]):_t('Oui à {0}',[plain(F.pct(s.p))]);
function proShareCanvas(s,cm){
 const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
 const P=imgPal(),PRO_IMG=proImgPal(),sg=plain(cssVar('--sg')),font=(w,px)=>`${w} ${px}px ${sg}`,t=x=>plain(String(x)),non=s.side==='non',accent=non?P.noBg:P.yesBg,m=MK[s.m],M_=70,sgn=RTL?-1:1;
 const dir=()=>{ctx.direction=RTL?'rtl':'ltr';ctx.textAlign=RTL?'right':'left';ctx.textBaseline='alphabetic';},X=RTL?W-M_:M_,XE=RTL?M_:W-M_;
 ctx.fillStyle=P.bg;ctx.fillRect(0,0,W,H);
 /* en-tête : logo, et « Mon analyse » à l'opposé */
 dir();drawLogo(ctx,RTL?W-M_-56:M_,62,56);ctx.fillStyle=P.text;ctx.font=font(600,46);ctx.textBaseline='middle';ctx.fillText('wimoro',RTL?W-M_-56-16:M_+56+16,91);
 ctx.font=font(600,28);ctx.fillStyle=P.text3;ctx.textAlign=RTL?'left':'right';ctx.fillText(t(_t('Mon analyse')),XE,91);dir();
 /* question du marché : deux lignes au plus */
 const q=t(m?m.q:(s.q||s.short));let qf=58,lines=[];for(const z of [58,50]){qf=z;ctx.font=font(600,z);lines=proWrap(ctx,q,W-2*M_,3);if(lines.length<=2)break;}if(lines.length>2)lines=proWrap(ctx,q,W-2*M_,2);
 const lh=Math.round(qf*1.18);let y=148+qf;ctx.fillStyle=P.text;for(const l of lines){ctx.fillText(l,X,y);y+=lh;}y+=30-lh;
 /* pastilles : période et prix au moment du partage ; date à l'opposé si elle tient */
 const chip=(label,fill,col,x)=>{ctx.font=font(600,28);const w=ctx.measureText(label).width+44;rrect(ctx,RTL?x-w:x,y,w,56,28);ctx.fillStyle=fill;ctx.fill();ctx.fillStyle=col;ctx.textBaseline='middle';ctx.fillText(label,x+sgn*22,y+29);ctx.textBaseline='alphabetic';return w;};
 let cx=X;cx+=sgn*(chip(t(pivLong(s.iv)),P.fill,P.text,cx)+12);const px=proSidePx(s);if(px)cx+=sgn*(chip(t(px),accent,P.on,cx)+12);
 {const d=t(proShareDate(s.at,true));ctx.font=font(500,26);if(Math.abs(XE-cx)>ctx.measureText(d).width+16){ctx.fillStyle=P.text3;ctx.textAlign=RTL?'left':'right';ctx.textBaseline='middle';ctx.fillText(d,XE,y+29);dir();}}
 y+=56+26;
 /* sous le graphique : la liste des indicateurs, puis le commentaire (deux lignes au plus) */
 const FY=H-222,legH=s.inds.length||s.dr.length?40:0;ctx.font=font(500,32);const cl=cm?proWrap(ctx,t(_t('« {0} »',[cm])),W-2*M_,2):[],cmH=cl.length*42;
 const top=y,bot=FY-40-28-(cmH?cmH+16:0)-(legH?legH+14:0),CH=bot-top,pad=18,k=2,cw=(W-100-pad*2)/k,ch=(CH-pad*2)/k;
 rrect(ctx,50,top,W-100,CH,28);ctx.fillStyle=PRO_IMG.panel;ctx.fill();ctx.strokeStyle=P.line;ctx.lineWidth=2;ctx.stroke();
 ctx.save();ctx.translate(50+pad,top+pad);ctx.scale(k,k);proPaint(proCvG(ctx,Object.assign({font:sg},PRO_IMG)),proSnapModel(s,cw,ch,{compact:true}));ctx.restore();dir();
 if(legH){const by=bot+14+29,maxW=W-2*M_,colI=c=>PRO_IMG[c]||c,tail=s.dr.length?t(_t('{0, plural, =0{Aucun tracé} one{# tracé} other{# tracés}}',[s.dr.length])):'';
  ctx.font=font(600,26);const tailW=tail?ctx.measureText(tail).width+(s.inds.length?30:0):0;let used=0,shown=0;ctx.direction='ltr';
  for(const d of s.inds){const l=pindLab(d),w=28+ctx.measureText(l).width+26,rest=s.inds.length-shown-1,moreW=rest>0?ctx.measureText('+'+rest).width+26:0;if(shown&&used+w+moreW+tailW>maxW)break;
   ctx.beginPath();ctx.arc(X+sgn*(used+9),by-9,9,0,Math.PI*2);ctx.fillStyle=colI(d.c);ctx.fill();ctx.fillStyle=P.text2;ctx.fillText(l,X+sgn*(used+28),by);used+=w;shown++;}
  if(shown<s.inds.length){const l='+'+(s.inds.length-shown);ctx.fillStyle=P.text2;ctx.fillText(l,X+sgn*used,by);used+=ctx.measureText(l).width+26;}
  dir();if(tail){ctx.font=font(500,26);ctx.fillStyle=P.text3;ctx.fillText(tail,X+sgn*(used+(s.inds.length?4:0)),by);}}
 if(cl.length){ctx.font=font(500,32);ctx.fillStyle=P.text2;let cy=bot+(legH?legH+14:0)+16+32;for(const l of cl){ctx.fillText(l,X,cy);cy+=42;}}
 /* pied : comme l'image d'un pari */
 ctx.strokeStyle=P.line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(M_,FY-40);ctx.lineTo(W-M_,FY-40);ctx.stroke();
 const r=myRank();ctx.font=font(600,34);ctx.fillStyle=P.text;ctx.fillText(t(`\u200E@${S.me.n} · ${rankName(r.t,r.d)}`),X,FY+10);
 ctx.font=font(500,28);ctx.fillStyle=P.text3;ctx.fillText(t(_t('Rejoins-moi avec le code {0} : {1} offerts.',[refCode(),F.usd0(REF.BONUS)])),X,FY+62);
 ctx.font=font(600,30);ctx.fillStyle=P.accent;ctx.fillText('wimoro.com',X,FY+118);
 return c;}
/* Le texte qui accompagne l'image (feuille de partage du téléphone, ou bouton « Copier ») */
function proShareText(s,cm){const m=MK[s.m],q=plain(m?m.q:(s.q||s.short)),px=plain(proSidePx(s)||pivLong(s.iv)),join=_t('Rejoins-moi sur Wimoro avec le code {0}, {1} offerts : {2}',[refCode(),plain(F.usd0(REF.BONUS)),refLink()]);
 if(cm&&!/[.!?…]$/.test(cm))cm+='.';
 return cm?_t('Mon analyse de « {0} » ({1}) : {2} Tu en penses quoi ? {3}',[q,px,cm,join]):_t('Je viens de poser mon analyse sur « {0} » ({1}). Tu vois la même chose ? {2}',[q,px,join]);}
async function proShareImg(){const sh=PV.share;if(!sh)return;const ta=$('#ov [data-psh-txt]');if(ta)sh.txt=ta.value.slice(0,280);const cm=(sh.txt||'').trim().replace(/\s+/g,' '),s=sh.snap;s.at=now();
 try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
 if(PV.share!==sh)return;const url=proShareCanvas(s,cm).toDataURL('image/png');S.ui.shareImg=url;S.ui.shareTxt=proShareText(s,cm);
 openModal(`<div class="md shm pro-shi"><div class="md-h"><div><p>${_t('Partager')}</p><h3>${_t('Ton analyse en image')}</h3></div><button class="x" data-a="close" aria-label="${esc(_t('Fermer'))}">${ic('x')}</button></div>
  <img class="shimg" src="${url}" alt="${esc(_t('Image de ton analyse'))}">
  <div class="psh-tx"><span>${_t('Le texte qui l’accompagne')}</span><p dir="auto">${esc(S.ui.shareTxt)}</p></div>
  <div class="cpm-acts"><button class="btn b-ink lg" data-a="share-send">${_t('{0} Partager l’image',[ic('share',16,'currentColor')])}</button><button type="button" class="btn b-white lg" data-a="share-save" data-name="wimoro-analyse.png">${_t('{0} Enregistrer l’image',[ic('down',16)])}</button></div>
  <button class="btn b-ghost full" data-a="share-copy">${_t('{0} Copier le texte et mon lien de parrainage',[ic('copy',16)])}</button>
  <p class="note">${_t('L’image contient ton code de parrainage : chaque ami qui s’inscrit avec reçoit {0}, et toi aussi dès son premier pari.',[F.usd0(REF.BONUS)])}</p>
  <button class="link psh-back" data-a="pro-sh-back">${_t('Revenir au partage dans Wimoro')}</button></div>`,'wide');
 if(!S.me.refShared){S.me.refShared=true;save();}}

/* ---------- Créer sa propre analyse à partir d'une analyse partagée (l'original n'est jamais modifié) ---------- */
function proFork(snap){const m=MK[snap.m];if(!m)return;const st=proSt(m.id),has=st.inds.length||st.dr.length;
 if(has&&!(PV.arm&&now()<PV.arm)){PV.arm=now()+5000;const b=$('#pro [data-a="pro-fork"]');if(b){b.classList.add('arm');b.querySelectorAll('span').forEach(s=>s.textContent=_t('Remplacer mon analyse ?'));}
  toast({tone:'amber',icon:'info',title:_t('Tu as déjà une analyse sur ce marché'),text:_t('Appuie encore une fois pour la remplacer par une copie de celle-ci.'),dur:4800});return;}
 PV.arm=0;const max=proSlots(),all=snap.inds.map(d=>pindFix({k:d.k,p:Object.assign({},d.p),c:d.c,w:d.w})).filter(Boolean),kept=(proUnl()?all:proUniq(all)).slice(0,max),lost=all.length-kept.length;
 st.iv=PIVK[snap.iv]?snap.iv:'1h';st.type=snap.type==='courbe'?'courbe':'bougies';st.side=snap.side==='non'?'non':'oui';st.inds=kept;st.ha=0;
 st.dr=snap.dr.map((d,i)=>({id:'d'+now().toString(36)+i,k:d.k,a:d.a.slice(),b:d.b?d.b.slice():undefined,c:d.c,w:d.w,txt:d.txt,h:0})).filter(proDrOk);
 const tEnd=snap.T0+snap.end*snap.ms,vn=snap.vn;save();proClose(true);proOpen(m.id);
 if(PV.open&&!PV.snap){const A=proA();PV.vn=vn;PV.end=(tEnd-A.T0)/A.ms;proClamp(A);PV.follow=PV.end>=A.n-.5;if(PV.follow)PV.end=Math.max(PV.end,A.n+3);PV.st.off=PV.end-A.n;proViewSave();proInval();}
 toast({tone:'blue',icon:'check',title:_t('Analyse copiée dans ton Mode Pro'),text:lost>0?_t('Ton rang affiche {0, plural, one{# indicateur} other{# indicateurs}} à la fois : {1} en trop, non repris. L’original n’est pas modifié.',[max,lost]):_t('Modifie-la librement : l’original n’est pas modifié.'),dur:6000});}

Object.assign(ACT,{
 'pro-share':()=>proShareModal(),
 'pro-sh-dst':a=>{if(!PV.share)return;const k=a.dataset.v;if(k==='gen'||k==='mkt'||k==='clan'){PV.share.dst[k]=!PV.share.dst[k];proShareSync();}},
 'pro-sh-dm':a=>{if(!PV.share)return;PV.share.dst.dm=PV.share.dst.dm===a.dataset.u?'':a.dataset.u;proShareSync();},
 'pro-sh-send':()=>{const sh=PV.share;if(!sh)return;const rooms=proShareRooms();if(!rooms.length)return;const t=$('#ov [data-psh-txt]');sh.snap.txt=t?t.value.trim().slice(0,280):'';sh.snap.at=now();
  if(SRV()){srvAnaPartager(sh,rooms);return;}
  proPublish(sh.snap,rooms);PV.share=null;closeModal();S.ui.room=rooms.find(r=>!r.startsWith('m:'))||rooms[0];
  toast({tone:'blue',icon:'share',title:_t('Analyse partagée'),text:rooms.map(r=>r==='general'?_t('Chat général'):r.startsWith('m:')?_t('Chat du marché'):r.startsWith('clan:')?_t('Mon clan'):userOf(r.slice(3)).n).join(', '),href:'#chat',dur:5200});},
 'pro-sh-img':()=>proShareImg(),
 'pro-sh-back':()=>{if(PV.share)openModal(proShareH(),'wide');else closeModal();},
 'pro-view':a=>{const x=MSG[a.dataset.id];if(x&&x.ana){const s=x.ana;if(!s.by||!s.by.n){const U=userOf(x.u);s.by={u:x.u,n:U.n,t:U.t,d:U.d};}proOpen(null,s);}},
 'pro-fork':()=>{if(PV.snap)proFork(PV.snap);}
});
AUTH_ACT.add('pro-share');AUTH_MSG['pro-share']=_t('Connecte-toi pour partager ton analyse.');

/* ---------- Analyses des autres joueurs (simulés, comme le reste des chats) ---------- */
/* Tracés posés à partir des données : un support entre deux creux, une zone sur la fin de la fenêtre, un repère, une note. */
function proBotDraws(A,i0,i1,kind){const T=i=>A.T0+(i+.5)*A.ms,mid=(i0+i1)>>1,minIn=(a,b)=>{let k=a;for(let i=a;i<=b;i++)if(A.l[i]<A.l[k])k=i;return k;},maxIn=(a,b)=>{let k=a;for(let i=a;i<=b;i++)if(A.h[i]>A.h[k])k=i;return k;};
 const la=minIn(i0,mid),lb=minIn(mid+1,i1),hb=maxIn(Math.max(i0,mid-Math.round((i1-i0)*.2)),Math.max(mid,i1-Math.round((i1-i0)*.18))),z0=Math.max(i0,i1-Math.round((i1-i0)*.28)),zl=A.l[minIn(z0,i1)],zh=A.h[maxIn(z0,i1)],r=v=>Math.round(v*100)/100,id=k=>'b'+k+i1;
 if(kind==='zone')return [{id:id(1),k:'rect',a:[T(z0),r(zh+.3)],b:[T(i1),r(zl-.3)],c:'#F59A0B',w:2},{id:id(2),k:'arrow',a:[T(Math.max(i0,z0-8)),r(zh+1.6)],b:[T(z0+1),r(zh+.4)],c:'#2448FF',w:2},{id:id(3),k:'text',a:[T(Math.max(i0,z0-14)),r(zh+1.9)],c:'ink',w:2,txt:_t('Zone à surveiller')}];
 if(kind==='level')return [{id:id(1),k:'level',a:[T(hb),r(A.h[hb])],c:'#12A150',w:2,txt:_t('Résistance')},{id:id(2),k:'hline',a:[T(la),r(A.l[la])],c:'#D92D20',w:1}];
 return [{id:id(1),k:'trend',a:[T(la),r(A.l[la])],b:[T(lb),r(A.l[lb])],c:'#2448FF',w:2},{id:id(2),k:'level',a:[T(hb),r(A.h[hb])],c:'#12A150',w:2,txt:_t('Résistance')},{id:id(3),k:'text',a:[T(lb),r(A.l[lb]-.9)],c:'ink',w:2,txt:_t('Support')}];}
function proBotSnap(u,mid,cfg){const m=MK[mid],U=USERS[u];if(!m||!U)return null;const D=proData(m),A=proAgg(D,PIVK[cfg.iv].ms),at=now()-(cfg.ago||0),i1=clamp(Math.floor((at-A.T0)/A.ms),10,A.n-1),vn=Math.min(cfg.vn,i1+3),end=i1+3,i0=Math.max(0,Math.floor(end-vn));
 const s=proSnap({A,end,vn,m:mid,iv:cfg.iv,type:cfg.type,side:'oui',inds:cfg.inds.map(pindFix),draws:proBotDraws(A,i0,i1,cfg.draw).filter(proDrOk),maxI:i1,by:{u,n:U.n,t:U.t,d:U.d}});s.at=at;s.txt=cfg.txt||'';return s;}
const PRO_BOT=[
 {iv:'1h',vn:96,type:'bougies',inds:[{k:'ema',p:{len:20}},{k:'rsi',p:{len:14}},{k:'macd'}],draw:'trend',txt:()=>_t('Le support a tenu. Tant que la ligne tient, je reste sur Oui.')},
 {iv:'15m',vn:80,type:'courbe',inds:[{k:'bb',p:{len:20,k:2}}],draw:'zone',txt:()=>_t('Le prix revient sur le bas de la bande. Zone à surveiller.')},
 {iv:'4h',vn:90,type:'bougies',inds:[{k:'sma',p:{len:50}},{k:'vwap'}],draw:'level',txt:()=>_t('Vue 4 heures : on reste au-dessus de la moyenne, la résistance est juste là.')},
 {iv:'5m',vn:72,type:'bougies',inds:[{k:'sma',p:{len:20}}],draw:'trend',txt:()=>_t('Tendance propre depuis ce matin.')}
];
/* Message d'analyse d'un autre joueur : l'instantané n'est fabriqué qu'au moment où la carte est affichée. */
function proBotMsg(u,mid,k,ago){const cfg=PRO_BOT[k%PRO_BOT.length],at=now()-(ago||0),x=mkMsg({u,k:'ana',text:cfg.txt()+(mid?' #'+mid:''),at,r:ago?{'🎯':3+Math.floor(R()*9),'🔥':1+Math.floor(R()*6)}:{}});let s;
 Object.defineProperty(x,'ana',{enumerable:true,configurable:true,get(){if(s===undefined){try{s=proBotSnap(u,mid,Object.assign({},cfg,{txt:x.text,ago:now()-at}));}catch(e){s=null;}}return s;}});return x;}
function proSeedBots(){const t=5.5*6e4,g=room('general');if(!g.msgs.some(x=>x.k==='ana'&&x.u!=='me')){g.msgs.push(proBotMsg('satoshi','btc150k',0,t));g.msgs.sort((a,b)=>a.at-b.at);}
 const r=room('m:btc150k');if(!r.msgs.some(x=>x.k==='ana'&&x.u!=='me')){r.msgs.push(proBotMsg('lea','btc150k',1,8*6e4));r.msgs.sort((a,b)=>a.at-b.at);}
 const c=room('m:clasico');if(MK.clasico&&!c.msgs.some(x=>x.k==='ana'&&x.u!=='me')){c.msgs.push(proBotMsg('karim','clasico',3,7*6e4));c.msgs.sort((a,b)=>a.at-b.at);}}
/* le salon d'un clan reçoit aussi une analyse d'un membre */
if(typeof clanSeedRoom==='function'){const clanSeedRoomP=clanSeedRoom;clanSeedRoom=function(c){clanSeedRoomP(c);const rid='clan:'+c.id,mates=typeof clanMates==='function'?clanMates(c):[],u=mates.length?mates[0]:'maxou';if(USERS[u]&&!room(rid).msgs.some(x=>x.k==='ana')){const x=proBotMsg(u,'btc150k',2,6*6e4);room(rid).msgs.push(x);room(rid).msgs.sort((a,b)=>a.at-b.at);}};}
/* de temps en temps, un joueur partage une analyse d'un marché déjà ouvert en Mode Pro */
function proBotShare(){const ids=Object.keys(PD).filter(id=>MK[id]&&!MK[id].creator);if(!ids.length)return;const mid=pick(ids),rid=R()<.5?'general':'m:'+mid,r=room(rid);if(r.msgs.slice(-40).filter(x=>x.k==='ana').length>=2)return;addMsg(rid,proBotMsg(pickUser(),mid,Math.floor(R()*PRO_BOT.length),0));}
function proBoot(){PRO_UP=true;proRooms();proSeedBots();}
planifier('mode pro : analyses publiées par des bots',150000,()=>{if(PRO_UP&&!document.hidden&&R()<.4)proBotShare();});
/* changement de compte : les analyses publiées suivent le compte */
{const enterAccountP=enterAccount;enterAccount=function(rec,fresh,quiet){if(PV.open)proClose(true);enterAccountP(rec,fresh,quiet);if(PRO_UP)proRooms();};const logoutP=logout;logout=function(){if(PV.open)proClose(true);logoutP();proRooms();};}
let PRO_UP=false;

/* =====================================================================================
 *  Compte démo : passer au grade voulu en un clic
 *  Les valeurs d'origine du compte sont gardées (S.me.rank0) : « Revenir à mon grade d'origine » les rétablit.
 *  Le grade n'est pas forcé : l'XP et les conditions du grade choisi sont réellement remplies, donc toutes les pages restent cohérentes.
 * ===================================================================================== */
const DEMO_RK=['xp','settled','wins','deposits','flashWins','followed','pos'];
const isDemoAcc=()=>!!(S.auth&&S.auth.demo&&S.me.logged);
function demoRankAfter(){const me=S.me;me.blockedShown='';checkBadges(true);save();updateHeader();const r=myRank();closeModal();
 if(PV.open&&!PV.snap){proEnforce(PV.st,true);proBars();proRefresh();}render(false);
 toast({tone:'blue',icon:'trophy',title:_t('Tu es maintenant {0}',[rankName(r.t,r.d)]),text:_t('Mode démo : les conditions de ce rang sont remplies sur ton compte.')});}
function demoRankSet(t){if(!isDemoAcc()||!TIERS[t])return;const me=S.me;if(!me.rank0){me.rank0={badges:(me.badges||[]).slice()};DEMO_RK.forEach(k=>me.rank0[k]=me[k]);}
 const b=me.rank0;DEMO_RK.forEach(k=>me[k]=b[k]);me.badges=b.badges.slice();
 if(rankFrom(stats()).t===t){delete me.rank0;demoRankAfter();return;}
 const need={settled:0,acc:0,deposits:0,flashWins:0,followed:0};for(let i=1;i<=t;i++){const c=TIERS[i].cond;for(const k in need)if(c[k])need[k]=Math.max(need[k],c[k]);}
 me.xp=t===8?Math.max(DIV_XP[8][0],b.xp):DIV_XP[t][0];me.settled=Math.max(b.settled,need.settled);me.wins=Math.min(me.settled,Math.max(b.wins,Math.ceil((need.acc+.5)/100*me.settled)));
 me.deposits=Math.max(b.deposits,need.deposits);me.flashWins=Math.max(b.flashWins,need.flashWins);me.followed=Math.max(b.followed,need.followed);if(t===8)me.pos=Math.min(b.pos,87);
 demoRankAfter();}
function demoRankReset(){if(!isDemoAcc()||!S.me.rank0)return;const me=S.me,b=me.rank0;DEMO_RK.forEach(k=>me[k]=b[k]);me.badges=b.badges.slice();delete me.rank0;demoRankAfter();}
function demoRankListH(){const r=myRank();return `<div class="drk-l" role="group" aria-label="${esc(_t('Choisir un rang'))}">${TIERS.map((T,i)=>`<button class="drk${i===r.t?' on':''}" data-a="demo-rank" data-t="${i}" aria-pressed="${i===r.t}">${emb(i,i===r.t?r.d:0)}<b>${T.name}</b><small>${PRO_SLOTS[i]===Infinity?_t('Illimités'):_t('{0, plural, one{# indicateur} other{# indicateurs}}',[PRO_SLOTS[i]])}</small></button>`).join('')}</div>${S.me.rank0?`<button class="link drk-r" data-a="demo-rank-reset">${_t('Revenir à mon rang d’origine')}</button>`:''}`;}
const DEMO_RK_SUB=()=>_t('Un clic sur un rang et ton compte démo y passe tout de suite, avec ses conditions remplies. Sous chaque rang : le nombre d’indicateurs du Mode Pro.');
/* bloc de la page « Ton rang » (compte démo seulement) */
function demoRankH(){if(!isDemoAcc())return '';return `<section class="pn pad demo-rk"><div class="h2">${demoB()} ${_t('Changer de rang')}</div><div class="sub">${DEMO_RK_SUB()}</div>${demoRankListH()}</section>`;}
function demoRankModal(){if(!isDemoAcc())return;openModal(`<div class="md demo-rk"><div class="md-h"><div><h3>${_t('Changer de rang')}</h3><p>${DEMO_RK_SUB()}</p></div><button class="x" data-a="close" aria-label="${esc(_t('Fermer'))}">${ic('x')}</button></div>${demoRankListH()}</div>`,'wide');}
/* entrée du menu du compte et de « Mon compte » (compte démo seulement) */
const demoRankItemH=()=>isDemoAcc()?`<button class="ui" data-a="demo-rank-open">${ic('layers',16)} ${_t('Changer de rang')}${demoB()}</button>`:'';
Object.assign(ACT,{'demo-rank':a=>demoRankSet(+a.dataset.t),'demo-rank-reset':()=>demoRankReset(),'demo-rank-open':()=>{const u=$('#umenu');if(u)u.remove();demoRankModal();}});

