/* WIMORO — responsible module */

'use strict';
/* =====================================================================================
 *  Jeu responsable
 *  ------------------------------------------------------------------------------------
 *  - Limites de dépôt (jour, semaine, mois) fixées par le joueur : une baisse s'applique tout de
 *    suite, une hausse ou une suppression après RG.COOL heures de réflexion.
 *  - Pause : paris et dépôts bloqués pendant 24 h à 30 jours ; retraits et consultation possibles.
 *  - Auto-exclusion : 6 mois, 1 an, 3 ans ou définitive ; le compte est fermé et la connexion refusée.
 *  - Export de l'historique en Excel (.xlsx) ou PDF, générés ici même, sans bibliothèque.
 * ===================================================================================== */
const RG={COOL:48,PAUSES:[[24,_t('24 h')],[72,_t('3 jours')],[168,_t('7 jours')],[720,_t('30 jours')]],EXCL:[[6,_t('6 mois')],[12,_t('1 an')],[36,_t('3 ans')],[0,_t('Définitive')]],WIN:{day:86400e3,week:7*86400e3,month:30*86400e3}};
const rg=()=>S.me.rg||(S.me.rg={lim:{day:0,week:0,month:0},pend:{},pause:0,excl:0});
const HOUR=3600e3;
const fmtDT=ts=>new Date(ts).toLocaleString(LOC,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const fmtD=ts=>new Date(ts).toLocaleDateString(LOC,{day:'numeric',month:'long',year:'numeric'});
const rgPaused=()=>rg().pause>now();
const rgExcluded=()=>{const e=rg().excl;return e===-1||e>now();};
const winTxt=k=>({day:_t('par jour'),week:_t('par semaine'),month:_t('par mois')})[k];

/* ---------- Limites de dépôt ---------- */
function depSum(win){const t0=now()-win;return (S.me.deps||[]).filter(d=>!d.label&&d.at>=t0).reduce((a,d)=>a+(d.usd||0),0);}
/* Ce qu'il reste possible de déposer en respectant toutes les limites actives. */
function rgDepRoom(){rgApplyPending();let room=Infinity,bind=null;for(const k of ['day','week','month']){const l=rg().lim[k];if(!l)continue;const r=Math.max(0,l-depSum(RG.WIN[k]));if(r<room){room=r;bind=k;}}return {room,bind};}
function rgApplyPending(){const g=rg();let ch=false;for(const k of Object.keys(g.pend||{})){const p=g.pend[k];if(p&&p.at<=now()){g.lim[k]=p.v;delete g.pend[k];ch=true;notif('shield',`${_t("Ta limite de dépôt {0} est maintenant {1}.",[winTxt(k),p.v?F.usd0(p.v):_t("retirée")])}`,'#responsable');}}if(ch)save();}
function rgSetLimit(k,v){const g=rg(),cur=g.lim[k]||0;v=Math.max(0,Math.round(v));
 if(v===cur){delete g.pend[k];save();return 'same';}
 if(cur&&(v===0||v>cur)){g.pend[k]={v,at:now()+RG.COOL*HOUR};save();return 'pending';}   // hausse ou suppression : délai de réflexion
 g.lim[k]=v;delete g.pend[k];save();return 'now';}
/* Vérifie un dépôt (montant en dollars) ; explique le refus. */
function rgDepOk(usd){if(rgExcluded())return false;if(rgPaused()){toast({tone:'amber',icon:'shield',title:_t("Dépôts en pause"),text:`${_t("Tu as demandé une pause jusqu’au {0}.",[fmtDT(rg().pause)])}`,href:'#responsable'});return false;}
 const {room,bind}=rgDepRoom();if(usd>room+1e-9){toast({tone:'amber',icon:'shield',title:_t("Limite de dépôt atteinte"),text:room>0?`${_t("Il te reste {0} à déposer {1}.",[F.usd(room),winTxt(bind)])}`:`${_t("Tu as atteint ta limite {0}.",[winTxt(bind)])}`,href:'#responsable',dur:5000});return false;}return true;}
function rgDepNoteH(){const {room,bind}=rgDepRoom();if(room===Infinity)return '';return `<div class="limit${room<=0?' over':''}" data-rgroom><span>${room>0?`${_t("Limite de dépôt : il te reste <b>{0}</b> {1}.",[F.usd(room),winTxt(bind)])}`:`${_t("Limite de dépôt {0} atteinte.",[winTxt(bind)])}`} <a class="link" href="#responsable">${_t("Mes limites")}</a></span></div>`;}

/* ---------- Pause et auto-exclusion ---------- */
function rgBlocked(kind){if(rgExcluded())return true;if(!rgPaused())return false;toast({tone:'amber',icon:'shield',title:_t("Tu es en pause"),text:`${_t("Les paris {0}sont bloqués jusqu’au {1}.",[kind==='dep'?_t("et les dépôts "):'',fmtDT(rg().pause)])}`,href:'#responsable'});return true;}
/* pause : écriture (locale, ou api_rg_pause en mode serveur), puis les mêmes effets */
function rgPauseStart(h){if(SRV()){srvRg('api_rg_pause',{p_hours:h},rgPauseEffets);return;}
 rg().pause=now()+h*HOUR;for(const c of (S.me.copies||[]))if(c.status==='active'){c.status='paused';c.byPause=1;}flushSave();notif('shield',`${_t("Pause activée jusqu’au {0}.",[fmtDT(rg().pause)])}`,'#responsable');rgPauseEffets();}
function rgPauseEffets(){closeModal();toast({icon:'shield',title:_t("Pause activée"),text:`${_t("Paris et dépôts bloqués jusqu’au {0}. Tes copies sont en pause.",[fmtDT(rg().pause)])}`,dur:5000});rgSync();if(S.ui.route==='responsable')render(false);}
function rgPauseEnd(){const g=rg();if(!g.pause)return;g.pause=0;for(const c of (S.me.copies||[]))if(c.byPause){c.status='active';delete c.byPause;}save();notif('shield',_t('Ta pause est terminée : tu peux de nouveau parier et déposer.'),'#responsable');rgSync();}
function rgExcludeStart(months){if(SRV()){srvExclure(months);return;}const g=rg();g.excl=months?now()+months*30*86400e3:-1;g.pause=0;for(const c of (S.me.copies||[]))if(c.status!=='stopped'){c.status='stopped';c.why='excl';c.end=now();}
 const rec=accountOfMe();if(rec){rec.excl=g.excl;AUTH.set(rec.key,rec);}flushSave();closeModal();
 const msg=months?`${_t("Ton compte est fermé jusqu’au {0}.",[fmtD(g.excl)])}`:_t("Ton compte est fermé définitivement.");
 leaveAccount();LS.r(SESK);S.auth={key:'',demo:false};KEY='wimoro-guest';S.me=guestMe();S.ui.authNote=`${_t("Auto-exclusion enregistrée. {0}",[msg])}`;updateHeader();rgSync();if(location.hash!=='#connexion')location.hash='#connexion';else render(true);
 toast({icon:'shield',title:_t("Auto-exclusion enregistrée"),text:msg,dur:7000});}
/* À la connexion ou au démarrage : un compte auto-exclu ne peut pas entrer. */
function rgLoginBlocked(){if(!rgExcluded())return false;const e=rg().excl;S.me.logged=false;flushSave();LS.r(SESK);S.auth={key:'',demo:false};KEY='wimoro-guest';S.me=guestMe();
 S.ui.authNote=e===-1?_t("Ce compte est fermé définitivement à la demande de son titulaire (auto-exclusion)."):`${_t("Ce compte est en auto-exclusion jusqu’au {0}. La connexion est impossible avant cette date.",[fmtD(e)])}`;updateHeader();if(location.hash!=='#connexion')location.hash='#connexion';else render(true);return true;}
function rgBoot(){if(S.me.logged&&rgExcluded())rgLoginBlocked();}
function rgTick(){if(!S.me.logged)return;const g=rg();rgApplyPending();if(g.pause&&g.pause<=now())rgPauseEnd();}
/* Bandeau sous l'en-tête pendant une pause. */
function rgSync(){let bar=$('#rgbar');const on=S.me.logged&&rgPaused();if(!on){if(bar)bar.remove();return;}
 const html=`<div class="rgbar-in">${ic('shield',16)}<span>${_t("Pause en cours : paris et dépôts bloqués jusqu’au <b>{0}</b>.",[fmtDT(rg().pause)])}</span><a class="link" href="#responsable">${_t("Détails")}</a></div>`;
 if(!bar){bar=document.createElement('div');bar.id='rgbar';bar.className='rgbar';const v=$('#view');v.parentNode.insertBefore(bar,v);}bar.innerHTML=html;fixText(bar);}

/* ---------- Page « Jeu responsable » ---------- */
function rgLimitRowH(k){const g=rg(),cur=g.lim[k]||0,p=g.pend[k];
 return `<div class="rg-lim"><div class="rg-lim-h"><b>${({day:_t("Par jour"),week:_t("Par semaine"),month:_t("Par mois")})[k]}</b><span class="sub">${cur?`${_t("Limite actuelle : {0}, déjà déposé : {1}",[F.usd0(cur),F.usd0(depSum(RG.WIN[k]))])}`:_t("Aucune limite")}</span></div><form class="rg-lim-f" data-form="rglim" data-k="${k}"><label class="amt"><input name="v" inputmode="numeric" value="${cur?F.inp(cur):''}" placeholder="${_t("Aucune")}" aria-label="${_t("Limite {0}",[winTxt(k)])}"><span>$</span></label><button class="btn b-ink" type="submit">${_t("Appliquer")}</button></form>${p?`<p class="sub rg-pend">${_t("{0} {1} le {2} (délai de réflexion de {3} h).",[ic('info',13),p.v?`${_t("Passage à {0}",[F.usd0(p.v)])}`:_t("Suppression de la limite"),fmtDT(p.at),RG.COOL])} <button class="link" type="button" data-a="rg-pend-cancel" data-k="${k}">${_t("Annuler")}</button></p>`:''}</div>`;}
function vRG(){const g=rg(),paused=rgPaused();
 return `<div class="wrap"><nav class="crumbs"><a href="#profil">${_t("Ton profil")}</a><span>/</span><span>${_t("Jeu responsable")}</span></nav><div class="pagehead mt-3"><div><h1 class="ptitle">${_t("Jeu responsable")}</h1><p class="plead">${_t("Tu gardes la main : fixe tes limites de dépôt, fais une pause ou ferme ton compte pour la durée que tu choisis. Ces réglages ne peuvent pas être contournés, même par le support.")}</p></div></div>
 <div class="g-side"><div class="col">
 <section class="pn pad"><div class="h2">${_t("Limites de dépôt")}</div><p class="sub mt-1">${_t("Une baisse s’applique immédiatement. Une hausse ou une suppression prend effet après {0} h, le temps d’y réfléchir.",[RG.COOL])}</p><div class="rg-lims">${['day','week','month'].map(rgLimitRowH).join('')}</div></section>
 <section class="pn pad"><div class="h2">${_t("Faire une pause")}</div><p class="sub mt-1">${_t("Pendant la pause : aucun pari, aucun dépôt, copies suspendues. Tu peux toujours consulter tes positions et retirer tes fonds. La pause ne peut pas être écourtée.")}</p>
 ${paused?`<div class="limit over mt-3"><span>${_t("Pause en cours jusqu’au <b>{0}</b>.",[fmtDT(g.pause)])}</span></div>`:`<div class="chips mt-3">${RG.PAUSES.map(([h,l])=>`<button class="chip" data-a="rg-pause" data-h="${h}">${l}</button>`).join('')}</div>`}</section>
 <section class="pn pad"><div class="h2">${_t("Auto-exclusion")}</div><p class="sub mt-1">${_t("Ferme ton compte pour 6 mois, 1 an, 3 ans ou définitivement. La connexion est refusée pendant toute la durée, sans exception. Tes fonds restent retirables en contactant le support.")}</p><div class="chips mt-3">${RG.EXCL.map(([mo,l])=>`<button class="chip" data-a="rg-excl" data-m="${mo}">${l}</button>`).join('')}</div></section>
 </div><aside class="col">
 <section class="pn pad"><div class="h2">${_t("Mon historique")}</div><p class="sub mt-1">${_t("Tous tes paris, positions, ordres, dépôts et retraits, dans un fichier à garder.")}</p><div class="hbtns mt-3"><button class="btn b-white" data-a="rg-export" data-f="xlsx">${_t("{0} Excel (.xlsx)",[ic('down',16,'#fff')])}</button><button class="btn b-white" data-a="rg-export" data-f="pdf">${ic('down',16)} PDF</button></div></section>
 <section class="pn pad"><div class="h2">${_t("Besoin d’en parler ?")}</div><p class="sub mt-1 lh-p">${_t("Si le jeu devient un problème pour toi ou un proche, une aide gratuite et confidentielle existe.")}</p><div class="rg-help">${LANG==='fr'?`<b>Joueurs Info Service</b><span>${_t("09 74 75 13 13, appel non surtaxé, 8 h à 2 h")}</span><a class="link" href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener">${_t("joueurs-info-service.fr")}</a>`:`<b>Gambling Therapy</b><span>${_t('Aide gratuite, confidentielle et multilingue, 24 h/24.')}</span><a class="link" href="https://www.gamblingtherapy.org" target="_blank" rel="noopener">${_t("gamblingtherapy.org")}</a>`}</div><p class="sub mt-3">${_t("Wimoro est réservé aux personnes majeures. Joue avec de l’argent que tu peux te permettre de perdre.")}</p></section></aside></div></div>`;}
function rgPauseModal(h){const l=RG.PAUSES.find(x=>x[0]===h)[1];openModal(`<div class="md"><div class="md-h"><div><h3>${_t("Faire une pause de {0} ?",[l])}</h3><p>${_t("Jusqu’au {0} : aucun pari, aucun dépôt, copies suspendues. Impossible d’écourter la pause une fois lancée.",[fmtDT(now()+h*HOUR)])}</p></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div><button class="btn b-ink lg full" data-a="rg-pause-do" data-h="${h}">${_t("Confirmer la pause de {0}",[l])}</button><button class="btn b-ghost lg full" data-a="close">${_t("Annuler")}</button></div>`);}
function rgExclModal(mo){const l=RG.EXCL.find(x=>x[0]===mo)[1];openModal(`<div class="md"><div class="md-h"><div><h3>${_t("Auto-exclusion {0}",[mo?`${_t("de {0}",[l])}`:_t("définitive")])}</h3><p>${_t("{0} Tu seras déconnecté tout de suite et la connexion sera refusée pendant toute la durée. Cette décision ne peut pas être annulée.",[mo?`${_t("Ton compte sera fermé jusqu’au {0}.",[fmtD(now()+mo*30*86400e3)])}`:_t("Ton compte sera fermé pour toujours.")])}</p></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div><div class="field"><label for="rgx">${_t("Pour confirmer, écris <b>EXCLUSION</b>")}</label><input id="rgx" data-rgx autocomplete="off" autocapitalize="characters" placeholder="EXCLUSION"></div><button class="btn b-ink lg full" data-a="rg-excl-do" data-m="${mo}" data-rgxgo disabled>${_t("Fermer mon compte")}</button><button class="btn b-ghost lg full" data-a="close">${_t("Annuler")}</button></div>`);}
document.addEventListener('input',e=>{if(e.target.dataset&&e.target.dataset.rgx!==undefined){const b=$('[data-rgxgo]');if(b)b.disabled=e.target.value.trim().toUpperCase()!=='EXCLUSION';}});
FORMS.rglim=f=>{const k=f.dataset.k,v=F.parse(f.v.value);if(SRV()){srvRg('api_rg_limit',{p_k:k,p_v:Math.max(0,Math.round(v))},r=>rgLimiteEffets(k,v,r.r));return;}rgLimiteEffets(k,v,rgSetLimit(k,v));};
function rgLimiteEffets(k,v,r){
 if(r==='pending')toast({icon:'shield',title:_t("Changement enregistré"),text:`${_t("Il prendra effet le {0}, après {1} h de réflexion.",[fmtDT(rg().pend[k].at),RG.COOL])}`,dur:4500});
 else if(r==='now')toast({icon:'shield',title:v?`${_t("Limite {0} : {1}",[winTxt(k),F.usd0(v)])}`:_t("Limite retirée"),text:v?_t("Appliquée tout de suite."):'',dur:2600});
 render(false);}

/* ---------- Export : données ---------- */
function histKind(h){return h.k==='ajustement_admin'?_t("Ajustement admin"):h.k==='duel'?_t("Duel"):h.k==='blitz'?_t("Blitz Royale"):h.k==='serie'?_t("La Série"):h.k==='flash'?_t("Pari éclair"):h.k==='sell'?(h.via==='stop'?_t("Stop loss"):h.via==='tp'?_t("Take profit"):h.via==='limit'?_t("Vente limite"):h.via==='copy'?`${_t("Copie de {0}",[h.of||''])}`:_t("Revente")):_t("Marché réglé");}
function exportData(){const pf=portfolio(),r=myRank();
 const byAt=(a,b)=>(b.at||0)-(a.at||0);
 const hist=(S.me.history||[]).slice().sort(byAt).map(h=>[fmtDT(h.at),histKind(h),h.m&&MK[h.m]?MK[h.m].q:h.q,h.k==='ajustement_admin'?'':h.k==='flash'?(h.eq?_t("Égalité"):h.s==='oui'?_t("Haut"):_t("Bas")):(h.s==='oui'?_t("Oui"):_t("Non")),Math.round(h.pnl*100)/100]);
 const pos=(S.me.positions||[]).map(p=>{const m=MK[p.m];return [m?m.q:p.m,p.s==='oui'?_t("Oui"):_t("Non"),Math.round(p.sh*100)/100,Math.round(p.avg*10)/10,Math.round(posValue(p)*100)/100,Math.round(posPnl(p)*100)/100];});
 const ords=(S.me.orders||[]).slice().sort(byAt).map(o=>{const m=MK[o.m];return [fmtDT(o.at),m?m.q:o.m,o.s==='oui'?_t("Oui"):_t("Non"),o.k==='buy'?_t("Achat limite"):_t("Vente limite"),o.lp,o.k==='buy'?Math.round(o.init*100)/100:Math.round(o.init*100)/100,o.status==='open'?_t("En attente"):o.status==='filled'?_t("Exécuté"):_t("Annulé")];});
 const flows=[...(S.me.deps||[]).map(d=>({at:d.at,r:[fmtDT(d.at),d.label?depLabel(d.label):_t("Dépôt"),d.label?'Wimoro':(d.net||d.coin),Math.round(d.usd*100)/100]})),...(S.me.wds||[]).map(w=>({at:w.at,r:[fmtDT(w.at),_t("Retrait"),w.net||'',-Math.round(w.amt*100)/100]}))].sort(byAt).map(x=>x.r);
 return {hist,pos,ords,flows,me:{n:S.me.n,rank:rankName(r.t,r.d),bal:Math.round(S.me.balance*100)/100,realized:Math.round(S.me.realized*100)/100,value:Math.round(pf.value*100)/100,played:S.me.played,acc:stats().acc}};}
const EXPORT_COLS={hist:[_t("Date"),_t("Type"),_t("Marché"),_t("Côté"),_t("Résultat ($)")],pos:[_t("Marché"),_t("Côté"),_t("Parts"),_t("Prix moyen (¢)"),_t("Valeur ($)"),_t("Résultat latent ($)")],ords:[_t("Date"),_t("Marché"),_t("Côté"),_t("Type"),_t("Prix limite (¢)"),_t("Montant ou parts"),_t("Statut")],flows:[_t("Date"),_t("Type"),_t("Moyen"),_t("Montant ($)")]};
const EXPORT_TITLES={hist:_t("Paris"),pos:_t("Positions ouvertes"),ords:_t("Ordres limite"),flows:_t("Dépôts et retraits")};

/* ---------- Export : fichier .xlsx (zip minimal sans compression) ---------- */
const CRC_T=(()=>{const tb=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;tb[n]=c>>>0;}return tb;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC_T[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipStore(files){const enc=new TextEncoder(),parts=[],cd=[];let off=0;const u16=v=>[v&255,(v>>8)&255],u32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255];
 for(const f of files){const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data),n=data.length;
  const lh=new Uint8Array([0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(n),...u32(n),...u16(name.length),...u16(0)]);parts.push(lh,name,data);
  cd.push(new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(n),...u32(n),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),name);off+=lh.length+name.length+n;}
 let cdLen=0;for(const p of cd)cdLen+=p.length;const end=new Uint8Array([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cdLen),...u32(off),...u16(0)]);
 const out=new Uint8Array(off+cdLen+end.length);let p=0;for(const x of [...parts,...cd,end]){out.set(x,p);p+=x.length;}return out;}
const xmlEsc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const colL=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
function sheetXml(cols,rows,widths){const row=(r,cells,hdr)=>`<row r="${r}">${cells.map((v,i)=>typeof v==='number'?`<c r="${colL(i)}${r}" s="2"><v>${v}</v></c>`:`<c r="${colL(i)}${r}" t="inlineStr"${hdr?' s="1"':''}><is><t xml:space="preserve">${xmlEsc(plain(v==null?'':v))}</t></is></c>`).join('')}</row>`;
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${RTL?' rightToLeft="1"':''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${row(1,cols,true)}${rows.map((r,i)=>row(i+2,r,false)).join('')}</sheetData></worksheet>`;}
function buildXlsx(){const d=exportData(),sheets=[['hist',[14,16,60,10,14]],['pos',[60,10,12,14,14,16]],['ords',[16,60,10,14,14,16,14]],['flows',[16,20,14,14]]];
 const files=[{name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
  {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
  {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlEsc(EXPORT_TITLES[s[0]])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
  {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
  {name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`}];
 sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(EXPORT_COLS[s[0]],d[s[0]],s[1])}));
 return zipStore(files);}

/* ---------- Export : fichier PDF ---------- */
/* Mise en page commune (A4, points) : une liste de pages, chacune une liste de textes. */
function pdfLayout(){const d=exportData(),W=595.28,Hh=841.89,M=40,pages=[];let pg=[],y=M;const line=(x,text,o={})=>pg.push(Object.assign({x,y,text:plain(String(text)),size:10,bold:false,align:'left'},o));
 const newPage=()=>{pages.push(pg);pg=[];y=M;};const need=h=>{if(y+h>Hh-M)newPage();};
 line(M,'Wimoro',{size:20,bold:true});line(W-M,_t('Relevé de compte'),{size:11,align:'right'});y+=30;line(M,_t('{0} · {1} · édité le {2}',[d.me.n,d.me.rank,fmtDT(now())]),{size:10});y+=18;
 line(M,_t('Solde : {0}   Résultat réalisé : {1}   Positions : {2}   Paris joués : {3}   Précision : {4} %',[F.usd(d.me.bal),F.signed(d.me.realized),F.usd(d.me.value),F.int(d.me.played),d.me.acc]),{size:10});y+=26;
 /* Largeurs calculées sur le texte réel : chaque colonne prend la place de sa plus longue valeur, la colonne élastique
    (le marché) prend le reste et se tronque ; un en-tête plus large que sa colonne passe sur deux lignes. */
 const SZ=9,GAP=12,tw=(s,b)=>pdfTextW(s,SZ,b),cellS=v=>typeof v==='number'?F.d2(v):plain(String(v==null?'':v));
 const fit=(s,w)=>{if(tw(s)<=w)return s;let n=s.length;while(n>1&&tw(s.slice(0,n)+'…')>w)n--;return s.slice(0,n)+'…';};
 const split=c=>{const p=c.split(' ');if(p.length<2)return [c];let best=[c],bw=tw(c,true);for(let i=1;i<p.length;i++){const l=[p.slice(0,i).join(' '),p.slice(i).join(' ')],m=Math.max(tw(l[0],true),tw(l[1],true));if(m<bw){bw=m;best=l;}}return best;};
 const table=(key,cols,rows,aligns,flex)=>{need(46);line(M,EXPORT_TITLES[key],{size:13,bold:true});y+=18;
  const R=rows.map(r=>r.map(cellS)),n=cols.length,cw=cols.map((c,i)=>R.reduce((m,r)=>Math.max(m,tw(r[i])),0));
  const hl=cols.map((c,i)=>i===flex||tw(c,true)<=cw[i]?[c]:split(c));hl.forEach((l,i)=>{if(i!==flex)cw[i]=Math.max(cw[i],...l.map(x=>tw(x,true)));});
  const used=cw.reduce((a,w,i)=>a+(i===flex?0:w),0)+GAP*(n-1);cw[flex]=Math.max(60,W-2*M-used);
  const xl=[];let x=M;for(let i=0;i<n;i++){xl.push(x);x+=cw[i]+GAP;}
  const at=i=>aligns[i]==='right'?xl[i]+cw[i]:xl[i],hh=Math.max(...hl.map(l=>l.length));
  const hdr=()=>{hl.forEach((l,i)=>l.forEach((t,k)=>pg.push({x:at(i),y:y+(hh-l.length+k)*11,text:fit(t,cw[i]),size:SZ,bold:true,align:aligns[i]})));y+=hh*11+4;};hdr();
  if(!R.length){line(M,_t('Aucune ligne.'),{size:SZ});y+=16;}
  for(const r of R){if(y+14>Hh-M){newPage();hdr();}r.forEach((v,i)=>line(at(i),fit(v,cw[i]),{size:SZ,align:aligns[i]}));y+=13;}y+=14;};
 table('hist',EXPORT_COLS.hist,d.hist,['left','left','left','left','right'],2);
 table('pos',EXPORT_COLS.pos,d.pos,['left','left','right','right','right','right'],0);
 table('ords',EXPORT_COLS.ords,d.ords,['left','left','left','left','right','right','right'],1);
 table('flows',EXPORT_COLS.flows,d.flows,['left','left','left','right'],2);
 pages.push(pg);return {pages,W,H:Hh};}
/* Largeurs Helvetica des caractères courants dans les nombres (sur 1000). */
const HW={' ':278,'$':556,'%':889,'+':584,',':278,'-':333,'.':278,'¢':556,'−':584,'×':584,'/':278,':':278,'(':333,')':333};
const HWL={a:556,b:556,c:500,d:556,e:556,f:278,g:556,h:556,i:222,j:222,k:500,l:222,m:833,n:556,o:556,p:556,q:556,r:333,s:500,t:278,u:556,v:500,w:722,x:500,y:500,z:500,
 A:667,B:667,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:500,K:667,L:556,M:833,N:722,O:778,P:667,Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611,'’':222,"'":191,'·':278,'…':1000,'«':556,'»':556,'!':278,'?':556,';':278,'&':667,'#':556,'@':1015,'_':556,'=':584,'*':389,'"':355,'[':278,']':278};
const helvW=(s,size)=>{let w=0;for(const ch of s){const b=ch.normalize('NFD')[0];w+=HW[ch]!==undefined?HW[ch]:/[0-9]/.test(ch)?556:HWL[ch]!==undefined?HWL[ch]:HWL[b]!==undefined?HWL[b]:556;}return w/1000*size;};
let PDFCTX=null;
function pdfTextW(s,size,bold){s=plain(String(s));if(LANG!=='he')return helvW(s,size)*(bold?1.06:1);
 if(!PDFCTX)PDFCTX=document.createElement('canvas').getContext('2d');PDFCTX.font=`${bold?'700':'400'} ${size*4}px ${plain(cssVar('--sg'))}`;return PDFCTX.measureText(s).width/4;}
const WIN_MAP={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159,'−':45,' ':32,' ':32};
function winAnsi(s){let o='';for(const ch of plain(s)){const c=ch.codePointAt(0);if(WIN_MAP[ch]!==undefined)o+=String.fromCharCode(WIN_MAP[ch]);else if(c<256)o+=ch;else o+='?';}return o.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
const latinBytes=s=>{const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i)&255;return u;};
function pdfFromObjects(objs){let out='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offs=[];objs.forEach((o,i)=>{offs.push(out.length);out+=`${i+1} 0 obj
${o}
endobj
`;});const xref=out.length;out+=`xref
0 ${objs.length+1}
0000000000 65535 f 
`;for(const o of offs)out+=String(o).padStart(10,'0')+' 00000 n \n';out+=`trailer
<< /Size ${objs.length+1} /Root 1 0 R >>
startxref
${xref}
%%EOF
`;return out;}
function buildPdfText(){const L=pdfLayout(),objs=[];const pageIds=[];
 objs.push('<< /Type /Catalog /Pages 2 0 R >>');objs.push('');objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 for(const pg of L.pages){let cs='';for(const it of pg){const w=helvW(it.text,it.size),x=it.align==='right'?it.x-w:it.align==='center'?it.x-w/2:it.x;cs+=`BT /${it.bold?'F2':'F1'} ${it.size} Tf ${x.toFixed(2)} ${(L.H-it.y-it.size).toFixed(2)} Td (${winAnsi(it.text)}) Tj ET
`;}
  objs.push(`<< /Length ${cs.length} >>
stream
${cs}endstream`);const cId=objs.length;objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L.W} ${L.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>`);pageIds.push(objs.length);}
 objs[1]=`<< /Type /Pages /Kids [${pageIds.map(i=>i+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
 return latinBytes(pdfFromObjects(objs));}
/* Hébreu : les polices de base du PDF n'ont pas ces lettres, chaque page est dessinée dans un canvas puis incluse en image. */
function buildPdfImage(){const L=pdfLayout(),K=2.5,objs=[];const pageIds=[];const sg=plain(cssVar('--sg'));
 objs.push('<< /Type /Catalog /Pages 2 0 R >>');objs.push('');
 for(const pg of L.pages){const c=document.createElement('canvas');c.width=Math.round(L.W*K);c.height=Math.round(L.H*K);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#14161B';ctx.textBaseline='top';
  for(const it of pg){ctx.font=`${it.bold?'700':'400'} ${it.size*K}px ${sg}`;ctx.direction=RTL&&!/^[\s\d.,+\-−$%¢×()\u2066-\u2069]+$/.test(it.text)?'rtl':'ltr';let x=it.x*K;if(RTL){x=(L.W-it.x)*K;ctx.textAlign=it.align==='right'?'left':it.align==='center'?'center':'right';}else ctx.textAlign=it.align;ctx.fillText(it.text,x,it.y*K);}
  const jpg=c.toDataURL('image/jpeg',.86),bin=atob(jpg.split(',')[1]);
  objs.push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bin.length} >>
stream
${bin}
endstream`);const im=objs.length;
  const cs=`q ${L.W} 0 0 ${L.H} 0 0 cm /Im${im} Do Q
`;objs.push(`<< /Length ${cs.length} >>
stream
${cs}endstream`);const cId=objs.length;
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L.W} ${L.H}] /Resources << /XObject << /Im${im} ${im} 0 R >> >> /Contents ${cId} 0 R >>`);pageIds.push(objs.length);}
 objs[1]=`<< /Type /Pages /Kids [${pageIds.map(i=>i+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
 return latinBytes(pdfFromObjects(objs));}
const buildPdf=()=>LANG==='he'?buildPdfImage():buildPdfText();
async function rgExport(fmt){const bytes=fmt==='xlsx'?buildXlsx():buildPdf(),type=fmt==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',name=`wimoro-${S.me.n}-${today()}.${fmt}`,file=new File([bytes],name,{type});
 const hs=await hostSave(file);if(hs===true){toast({icon:'check',title:_t("Fichier enregistré"),text:name,dur:2500});return;}if(hs===false)return;
 try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return;}}catch(e){if(e&&e.name==='AbortError')return;}
 const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast({icon:'down',title:_t("Fichier prêt"),text:name,dur:3000});}

Object.assign(ACT,{
 'rg-pause':a=>rgPauseModal(+a.dataset.h),'rg-pause-do':a=>rgPauseStart(+a.dataset.h),
 'rg-excl':a=>rgExclModal(+a.dataset.m),'rg-excl-do':a=>{const i=$('[data-rgx]');if(!i||i.value.trim().toUpperCase()!=='EXCLUSION')return;rgExcludeStart(+a.dataset.m);},
 'rg-pend-cancel':a=>{const fin=()=>{render(false);toast({icon:'shield',title:_t("Changement annulé"),dur:2000});};if(SRV()){srvRg('api_rg_pend_cancel',{p_k:a.dataset.k},fin);return;}delete rg().pend[a.dataset.k];save();fin();},
 'rg-export':a=>rgExport(a.dataset.f)
});
Object.assign(VIEWS,{responsable:vRG});PROTECTED.add('responsable');TITLES.responsable=_t("Jeu responsable");
{const live=fn=>()=>{if(!document.hidden)fn();};planifier('jeu responsable : échéances locales',30000,live(rgTick));}

/* ---------- Langue et réglages supplémentaires de l'onglet Paramètres ---------- */
function langBtnsH(){return Object.keys(LANGS).map(k=>`<button type="button" class="${k===LANG?'on':''}" data-a="lang-set" data-v="${k}" lang="${k}" dir="${LANGS[k].dir}">${LANGS[k].n}</button>`).join('');}
function langRowH(){return `<div class="langrow"><span class="sub">${_t("{0} Langue",[ic('globe',14)])}</span><div class="seg langseg" role="group" aria-label="${_t("Langue")}">${langBtnsH()}</div></div>`;}
function langModalH(){return `<div class="md"><div class="md-h"><div><h3>${_t("Langue")}</h3><p>${_t("La page se recharge dans la langue choisie. Tes données restent en place.")}</p></div><button class="x" data-a="close" aria-label="${_t("Fermer")}">${ic('x')}</button></div><div class="pickl">${Object.keys(LANGS).map(k=>`<button data-a="lang-set" data-v="${k}"><span><b lang="${k}" dir="${LANGS[k].dir}">${LANGS[k].n}</b></span>${k===LANG?ic('check',18,'#2448FF',2.6):ic('right',18)}</button>`).join('')}</div></div>`;}
function settingsExtraH(){return `<hr><div><div class="h2 t-3">${_t("Langue")}</div><p class="sub mt-1">${_t("Les montants et les dates suivent la langue choisie.")}</p><div class="seg langseg mt-3" role="group" aria-label="${_t("Langue")}">${langBtnsH()}</div></div>
<hr><div><div class="h2 t-3">${_t("Parrainage")}</div><p class="sub mt-1">${_t("{0} pour ton ami à son inscription, {0} pour toi à son premier pari.",[F.usd0(REF.BONUS)])}</p><a class="btn b-white" href="#parrainage" style="margin-top:10px;display:inline-flex">${_t("{0} Mon lien de parrainage",[ic('gift',16)])}</a></div>
<hr><div><div class="h2 t-3">${_t("Jeu responsable")}</div><p class="sub mt-1">${_t("Limites de dépôt, pause, auto-exclusion, et ton historique complet à télécharger.")}</p><div class="hbtns mt-3"><a class="btn b-white" href="#responsable">${_t("{0} Mes limites et ma pause",[ic('shield',16)])}</a><button class="btn b-ghost" type="button" data-a="rg-export" data-f="xlsx">${_t("{0} Excel",[ic('down',16)])}</button><button class="btn b-ghost" type="button" data-a="rg-export" data-f="pdf">${ic('down',16)} PDF</button></div></div>`;}
Object.assign(ACT,{'lang-set':a=>setLang(a.dataset.v),'lang-pick':()=>{const u=$('#umenu');if(u)u.remove();openModal(langModalH());}});

