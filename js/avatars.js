/* WIMORO — avatars module */

'use strict';
/* =====================================================================================
 *  Photos de profil
 *  ------------------------------------------------------------------------------------
 *  - galerie Wimoro : 16 avatars dessinés en SVG (originaux), identifiés « g:<id> » ;
 *  - import depuis l'appareil : la photo est recadrée au carré, réduite à 256 px et
 *    enregistrée en JPEG (data:URL) dans le profil, donc dans ce navigateur uniquement ;
 *  - sans photo : initiale sur la couleur choisie (ancien comportement).
 *  Les autres joueurs reçoivent un avatar de la galerie déterminé par leur identifiant.
 * ===================================================================================== */
const AV_GALLERY=[
 {id:'renard',n:_t("Renard"),bg:['#FFB347','#F97316'],svg:'<ellipse cx="32" cy="36" rx="17" ry="15" fill="#FFF3E0"/><path d="M15 30 12 12l14 12zM49 30l3-18-14 12z" fill="#F97316"/><path d="M16 29l-2-12 10 9zM48 29l2-12-10 9z" fill="#FFD9B3"/><circle cx="25" cy="34" r="2.6" fill="#14161B"/><circle cx="39" cy="34" r="2.6" fill="#14161B"/><path d="M29 42q3 3 6 0" stroke="#14161B" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="32" cy="41" r="2" fill="#14161B"/>'},
 {id:'robot',n:_t("Robot"),bg:['#60A5FA','#2448FF'],svg:'<rect x="14" y="20" width="36" height="30" rx="9" fill="#EEF2FF"/><rect x="29" y="10" width="6" height="10" rx="3" fill="#EEF2FF"/><circle cx="32" cy="9" r="3.5" fill="#F59A0B"/><rect x="21" y="29" width="8" height="8" rx="3" fill="#2448FF"/><rect x="35" y="29" width="8" height="8" rx="3" fill="#2448FF"/><rect x="24" y="42" width="16" height="3.5" rx="1.75" fill="#2448FF"/>'},
 {id:'chat',n:_t("Chaton"),bg:['#C4B5FD','#7350E3'],svg:'<path d="M15 34 13 12l13 11zM49 34l2-22-13 11z" fill="#F5F3FF"/><ellipse cx="32" cy="38" rx="18" ry="15" fill="#F5F3FF"/><circle cx="25" cy="37" r="2.6" fill="#14161B"/><circle cx="39" cy="37" r="2.6" fill="#14161B"/><path d="M32 42l-2.5-2.5h5z" fill="#F472B6"/><path d="M10 40h11M10 46h11M43 40h11M43 46h11" stroke="#F5F3FF" stroke-width="2" stroke-linecap="round"/>'},
 {id:'hibou',n:_t("Hibou"),bg:['#5EEAD4','#0F766E'],svg:'<path d="M18 22q14-14 28 0v22q0 12-14 12T18 44z" fill="#ECFEFF"/><circle cx="25" cy="31" r="7" fill="#fff"/><circle cx="39" cy="31" r="7" fill="#fff"/><circle cx="25" cy="31" r="3.5" fill="#14161B"/><circle cx="39" cy="31" r="3.5" fill="#14161B"/><path d="M32 36l-3 5h6z" fill="#F59A0B"/><path d="M18 22l3-7 5 6M46 22l-3-7-5 6" fill="#ECFEFF"/>'},
 {id:'astro',n:_t("Astronaute"),bg:['#334155','#0F172A'],svg:'<circle cx="32" cy="32" r="20" fill="#F8FAFC"/><path d="M18 32a14 11 0 0 1 28 0 14 11 0 0 1-28 0z" fill="#1E3A8A"/><path d="M22 28q10-8 20 0" stroke="#60A5FA" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="26" cy="31" r="1.6" fill="#93C5FD"/>'},
 {id:'fusee',n:_t("Fusée"),bg:['#818CF8','#4338CA'],svg:'<path d="M32 8q12 10 10 32H22q-2-22 10-32z" fill="#F8FAFC"/><path d="M22 40l-8 8 4-14zM42 40l8 8-4-14z" fill="#F59A0B"/><circle cx="32" cy="26" r="5" fill="#2448FF"/><path d="M27 44q5 14 10 0z" fill="#F97316"/><path d="M29 44q3 8 6 0z" fill="#FCD34D"/>'},
 {id:'planete',n:_t("Planète"),bg:['#38BDF8','#0369A1'],svg:'<circle cx="32" cy="32" r="14" fill="#FDE68A"/><path d="M24 25q6 4 14 2" stroke="#F59A0B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M8 36q24 14 48-8" stroke="#F8FAFC" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M26 38q10 4 20-2" stroke="#F59A0B" stroke-width="2.5" fill="none" stroke-linecap="round"/>'},
 {id:'baleine',n:_t("Baleine"),bg:['#93C5FD','#1D4ED8'],svg:'<path d="M12 34q14-18 36-6 6 4 4 10-8 10-26 8-8-1-14-12z" fill="#EFF6FF"/><path d="M48 28l9-8-1 14z" fill="#EFF6FF"/><circle cx="24" cy="33" r="2.4" fill="#14161B"/><path d="M26 16q-3 6 0 10M30 15q-2 6 1 10" stroke="#EFF6FF" stroke-width="2.5" fill="none" stroke-linecap="round"/>'},
 {id:'eclair',n:_t("Éclair"),bg:['#FDE047','#F59A0B'],svg:'<path d="M36 8 18 36h12l-4 20 20-30H34z" fill="#fff" stroke="#14161B" stroke-width="2.5" stroke-linejoin="round"/>'},
 {id:'taureau',n:_t("Taureau"),bg:['#86EFAC','#15803D'],svg:'<ellipse cx="32" cy="36" rx="16" ry="14" fill="#F0FDF4"/><path d="M14 22q-4-10 6-10 2 6 6 10zM50 22q4-10-6-10-2 6-6 10z" fill="#F0FDF4"/><circle cx="26" cy="34" r="2.6" fill="#14161B"/><circle cx="38" cy="34" r="2.6" fill="#14161B"/><ellipse cx="32" cy="44" rx="7" ry="4" fill="#BBF7D0"/><circle cx="29.5" cy="44" r="1.3" fill="#14161B"/><circle cx="34.5" cy="44" r="1.3" fill="#14161B"/>'},
 {id:'ours',n:_t("Ours"),bg:['#FCA5A5','#B91C1C'],svg:'<circle cx="19" cy="20" r="7" fill="#FFF1F2"/><circle cx="45" cy="20" r="7" fill="#FFF1F2"/><circle cx="32" cy="36" r="17" fill="#FFF1F2"/><circle cx="26" cy="33" r="2.5" fill="#14161B"/><circle cx="38" cy="33" r="2.5" fill="#14161B"/><ellipse cx="32" cy="42" rx="5" ry="3.5" fill="#FECACA"/><circle cx="32" cy="41" r="1.8" fill="#14161B"/>'},
 {id:'diamant',n:_t("Diamant"),bg:['#A5F3FC','#0891B2'],svg:'<path d="M20 20h24l10 12-22 24L10 32z" fill="#fff"/><path d="M20 20l12 36-22-24zM44 20 32 56l22-24z" fill="#CFFAFE"/><path d="M10 32h44" stroke="#0891B2" stroke-width="1.5"/><path d="M20 20l6 12 6-12 6 12 6-12" fill="none" stroke="#0891B2" stroke-width="1.5"/>'},
 {id:'fantome',n:_t("Fantôme"),bg:['#C7D2FE','#312E81'],svg:'<path d="M16 32a16 16 0 0 1 32 0v22l-5-4-6 4-5-4-6 4-5-4-5 4z" fill="#F8FAFC"/><circle cx="26" cy="30" r="3" fill="#14161B"/><circle cx="38" cy="30" r="3" fill="#14161B"/><ellipse cx="32" cy="39" rx="3" ry="2" fill="#14161B"/>'},
 {id:'panda',n:_t("Panda"),bg:['#F9A8D4','#BE185D'],svg:'<circle cx="18" cy="20" r="7" fill="#14161B"/><circle cx="46" cy="20" r="7" fill="#14161B"/><circle cx="32" cy="36" r="17" fill="#fff"/><ellipse cx="25" cy="34" rx="5" ry="6" fill="#14161B"/><ellipse cx="39" cy="34" rx="5" ry="6" fill="#14161B"/><circle cx="25.5" cy="33" r="1.8" fill="#fff"/><circle cx="38.5" cy="33" r="1.8" fill="#fff"/><ellipse cx="32" cy="43" rx="3" ry="2" fill="#14161B"/>'},
 {id:'alien',n:_t("Alien"),bg:['#BEF264','#4D7C0F'],svg:'<path d="M32 10c12 0 18 10 18 20 0 12-10 24-18 24S14 42 14 30c0-10 6-20 18-20z" fill="#ECFCCB"/><ellipse cx="25" cy="31" rx="5" ry="7" transform="rotate(-15 25 31)" fill="#14161B"/><ellipse cx="39" cy="31" rx="5" ry="7" transform="rotate(15 39 31)" fill="#14161B"/><path d="M29 44h6" stroke="#14161B" stroke-width="2" stroke-linecap="round"/>'},
 {id:'pingouin',n:_t("Pingouin"),bg:['#BAE6FD','#0C4A6E'],svg:'<ellipse cx="32" cy="36" rx="16" ry="20" fill="#14161B"/><ellipse cx="32" cy="40" rx="11" ry="14" fill="#F8FAFC"/><circle cx="27" cy="27" r="2.3" fill="#fff"/><circle cx="37" cy="27" r="2.3" fill="#fff"/><circle cx="27.5" cy="27" r="1.1" fill="#14161B"/><circle cx="37.5" cy="27" r="1.1" fill="#14161B"/><path d="M29 32l3 4 3-4z" fill="#F59A0B"/><path d="M24 54h6l-3 4zM34 54h6l-3 4z" fill="#F59A0B"/>'}
];
const AV_BY=Object.fromEntries(AV_GALLERY.map(a=>[a.id,a]));
let _avgid=0;
/* SVG d'un avatar de la galerie (dégradé de fond + dessin) */
function avSvg(id,size){const a=AV_BY[id];if(!a)return '';const g='avg'+(++_avgid);return `<svg viewBox="0 0 64 64" width="${size||32}" height="${size||32}" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient></defs><rect width="64" height="64" fill="url(#${g})"/>${a.svg}</svg>`;}
/* photo d'un joueur : « g:id », data:URL, ou '' (initiale) */
function photoOf(u){if(u==='me')return S.me.photo||'';const U=USERS[u];if(!U)return '';if(U.photo!==undefined)return U.photo;return 'g:'+AV_GALLERY[hash(u)%AV_GALLERY.length].id;}
/* contenu intérieur d'un .av : image ou initiale */
function avInner(u,size){const p=photoOf(u);if(p.startsWith('g:'))return avSvg(p.slice(2),size);if(p.startsWith('data:'))return `<img src="${p}" alt="">`;const U=userOf(u);return esc((U.n||'?')[0]);}
function avClass(u){const p=photoOf(u);return p?' av-img':'';}
/* Import d'une photo : recadrage carré, 256 px, JPEG */
function avImportFile(file,cb){if(!file||!/^image\//.test(file.type)){toast({tone:'amber',icon:'info',title:_t("Fichier non reconnu"),text:_t("Choisis une image (JPG, PNG, HEIC…).")});return;}
 const img=new Image(),url=URL.createObjectURL(file);
 img.onload=()=>{try{const S0=256,c=document.createElement('canvas');c.width=S0;c.height=S0;const x=c.getContext('2d'),s=Math.min(img.naturalWidth,img.naturalHeight);x.drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,0,0,S0,S0);cb(c.toDataURL('image/jpeg',.86));}catch(e){toast({tone:'amber',icon:'info',title:_t("Image illisible"),text:_t("Essaie une autre photo.")});}URL.revokeObjectURL(url);};
 img.onerror=()=>{URL.revokeObjectURL(url);toast({tone:'amber',icon:'info',title:_t("Image illisible"),text:_t("Essaie une autre photo.")});};
 img.src=url;}
/* Bloc « Photo de profil » de l'éditeur */
function avPickerH(p){const cur=p.photo||'';return `<div class="pe-photo"><div class="pe-photo-h"><span class="av av-lg${cur?' av-img':''}" data-peav style="background:${p.color}">${cur.startsWith('g:')?avSvg(cur.slice(2),72):cur.startsWith('data:')?`<img src="${cur}" alt="">`:iniOf(p.n)}</span><div>${_t("<b>Photo de profil</b>")}<small>${_t("Choisis un avatar Wimoro ou importe une photo depuis ton appareil. Sans photo, ton initiale s’affiche sur ta couleur.")}</small></div></div>
 <div class="hbtns pe-photo-btns"><label class="btn b-ghost sm" for="avfile">${_t("{0} Importer une photo",[ic('down',14)])}<input id="avfile" type="file" accept="image/*" data-avfile hidden></label>${cur?`<button type="button" class="btn b-ghost sm" data-a="pe-photo" data-v="">${_t("{0} Retirer la photo",[ic('x',14)])}</button>`:''}</div>
 <div class="avgrid" role="group" aria-label="${_t("Galerie Wimoro")}">${AV_GALLERY.map(a=>`<button type="button" class="${cur==='g:'+a.id?'on':''}" data-a="pe-photo" data-v="g:${a.id}" aria-label="${a.n}" title="${a.n}">${avSvg(a.id,56)}</button>`).join('')}</div></div>`;}
function avPeApply(v){if(!S.ui.pe)return;S.ui.pe.photo=v;const box=$('[data-pephoto]');if(box){box.innerHTML=avPickerH(S.ui.pe);fixText(box);}peRefresh();}
Object.assign(ACT,{'pe-photo':a=>avPeApply(a.dataset.v)});
document.addEventListener('change',e=>{const i=e.target.closest('[data-avfile]');if(!i||!i.files||!i.files[0])return;avImportFile(i.files[0],url=>{avPeApply(url);toast({icon:'check',title:_t("Photo importée"),text:_t("Enregistre pour la garder."),dur:2200});});i.value='';});

