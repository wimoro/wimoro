/* WIMORO — core module */

'use strict';
/* Wimoro : démo front-end (version hybride). Aucune donnée réelle, tout est simulé dans le navigateur. */

/* ===================== Utilitaires ===================== */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now=()=>Date.now();
/* défilement doux, sauf si le joueur a demandé de réduire les animations */
const doux=()=>matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth';
const R=Math.random;
const pick=a=>a[Math.floor(R()*a.length)];
const NB=s=>String(s).replace(/[  ]/g,' ');
const nf0=new Intl.NumberFormat(LOC,{maximumFractionDigits:0}),nf1=new Intl.NumberFormat(LOC,{minimumFractionDigits:1,maximumFractionDigits:1}),nf2=new Intl.NumberFormat(LOC,{minimumFractionDigits:2,maximumFractionDigits:2});
/* Formats : « 1 000,00 $ » en français ; « $1,000.00 » en anglais et en hébreu (isolé pour rester lisible de droite à gauche). */
const SYMB=LANG!=='fr';
/* espace insécable ( ) entre le nombre et son symbole : « 949,01 $ » ou « 63 % » ne se coupent jamais en fin de ligne */
const money=s=>bidi(SYMB?'$'+s:s+' $');
const unit=(s,u)=>bidi(SYMB?s+u:s+' '+u);
const F={
 int:v=>bidi(NB(nf0.format(Math.round(v)))),
 d1:v=>bidi(NB(nf1.format(v))),
 d2:v=>bidi(NB(nf2.format(v))),
 usd:v=>money(NB(nf2.format(v))),
 usd0:v=>v===Infinity?_t('Illimitée'):money(NB(nf0.format(Math.round(v)))),
 /* C10 : le solde n'est jamais arrondi vers le haut. Centimes tant que la place le permet ; dans l'en-tête mobile, à partir de 100 000 $, tronqué à l'unité. */
 bal:(v,full)=>{const c=Math.floor(v*100+1e-6)/100;return money(NB(nf2.format(c)));}   /* un seul format par langue, centimes compris, à toutes les tailles d'écran */,
 signed:v=>bidi((Math.abs(v)<0.005?'':v>0?'+':'−')+plain(money(NB(nf2.format(Math.abs(v)))))),   /* « 0,00 $ » sans signe : ni gain ni perte */
 pct:p=>unit(Math.round(p),'%'),
 mult:p=>{const x=100/Math.max(1,p);return bidi('×'+NB((x>=10?nf1:nf2).format(x)));},
 c:p=>unit(Math.round(p),'¢'),
 c1:p=>unit(NB(nf1.format(p)),'¢'),
 pct1:r=>unit(NB(nf1.format(r*100)),'%'),
 /* C17 : un impact inférieur au centième de point est dit tel quel, plutôt que « +0,00 pt » */
 imp:d=>d===0?bidi('0 '+_t('pt')):Math.abs(d)<0.005?_t('{0} (négligeable)',[bidi('< '+NB(nf2.format(0.01))+' '+_t('pt'))]):bidi((d>=-0.004?'+':'−')+NB(nf2.format(Math.abs(d)))+' '+_t('pt')),
 compact:v=>bidi(SYMB?(v>=1e6?'$'+NB(nf1.format(v/1e6))+'M':v>=1e3?'$'+NB(nf0.format(v/1e3))+'K':'$'+NB(nf0.format(v))):(v>=1e6?NB(nf1.format(v/1e6))+' M$':v>=1e3?NB(nf0.format(v/1e3))+' k$':NB(nf0.format(v))+' $')),
 pts:d=>{const r=Math.round(d),a=Math.abs(r);return bidi((r>=0?'+':'−')+_t('{0, plural, one{# pt} other{# pts}}',[a]));},
 xp:v=>bidi(NB(nf0.format(Math.round(v)))+' XP'),
 parse:s=>{const n=numOf(s);return isNaN(n)?0:n;},
 inp:n=>LANG==='fr'?String(n).replace('.',','):String(n),
 /* pourcentage signé (« −10 % », « +20% »), rang (« 1 284e », « 1,284th ») et « libellé : valeur » selon la langue */
 spct:p=>bidi((p<0?'−':'+')+plain(unit(Math.abs(Math.round(p)),'%'))),
 ord:v=>{const n=Math.abs(Math.round(v));return bidi(NB(nf0.format(n))+ordinal(n).slice(String(n).length));},
 kv:(a,b)=>_t('{0} : {1}',[a,b])
};
/* Adresse publique du site : tous les liens partagés (invitation, parrainage, duel, profil, marché) partent d'ici. */
const SITE_URL='https://wimoro.com';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
/* heure : sur 24 h en français et en hébreu ; à l'américaine en anglais (« 11:59 PM ») */
const hhmm=t=>{const d=new Date(t);return LANG==='en'?d.toLocaleTimeString(LOC,{hour:'numeric',minute:'2-digit'}):String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
/* même règle pour une heure écrite « 23:59 » dans les données d'un marché */
const hTxt=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||''));if(LANG!=='en'||!m)return s;const d=new Date(2000,0,1,+m[1],+m[2]);return hhmm(d.getTime());};
function ago(ts){const s=(now()-ts)/1000;if(s<60)return _t('à l’instant');if(s<3600)return _t('il y a {0} min',[Math.floor(s/60)]);if(s<86400)return _t('il y a {0} h',[Math.floor(s/3600)]);return s<172800?_t('hier'):_t('il y a {0} j',[Math.floor(s/86400)]);}
const today=()=>new Date().toISOString().slice(0,10);
const norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/* ===================== Icônes ===================== */
/* Tracés du jeu d'icônes Lucide (https://lucide.dev), licence ISC, © Lucide Contributors. Un seul jeu au trait pour tout le site. */
const ICP={layers:'<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',swords:'<path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>',minus:'<path d="M5 12h14"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',moon:'<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',bellOff:'<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742"/><path d="m2 2 20 20"/><path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05"/>',userplus:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',card:'<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><path d="M6 14h2"/>',bank:'<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',paypal:'<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',logout:'<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',idc:'<path d="M13 19a4 4 0 00-8 0"/><path d="M16 10h2"/><path d="M16 14h2"/><circle cx="9" cy="12" r="3"/><rect x="2" y="5" width="20" height="14" rx="2"/>',rotate:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',layers:'<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',search:'<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',bell:'<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',copy:'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',send:'<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',chev:'<path d="m6 9 6 6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',check:'<path d="M20 6 9 17l-5-5"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',share:'<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',flame:'<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',up:'<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',chat:'<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',hash:'<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',star:'<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',bolt:'<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',trophy:'<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',smile:'<path d="M15 10V9"/><path d="M16.472 15a6 6 0 01-8.943 0"/><path d="M9 10V9"/><circle cx="12" cy="12" r="10"/>',wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',percent:'<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',crown:'<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',league:'<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',out:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',refresh:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',gift:'<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',down:'<path d="M17 7 7 17"/><path d="M17 17H7V7"/>'};
/* Une icône prend la couleur de son texte. Les anciennes couleurs écrites en dur dans les gabarits sont ramenées aux
   variables du thème ; le blanc devient « couleur du texte » (blanc sur un bouton coloré, sombre sur un bouton gris). */
const ICV={'#A3A8B2':'var(--text-4)','#7A808C':'var(--text-3)','#4A505C':'var(--text-2)','#2448FF':'var(--accent)','#9A5B00':'var(--text-2)','#C08A12':'var(--text-2)','#0B8247':'var(--yes)','#13804F':'var(--yes)'};
function ic(k,s=18,c='currentColor',sw=1.75){if(c==='#fff')c='currentColor';const v=ICV[c]||(/^var\(--/.test(c)?c:'');   /* une couleur du système (« var(--text-2) ») passe par la propriété color */return `<svg data-ic="${k}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${v?'currentColor':c}"${v?` style="color:${v}"`:''} stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICP[k]}</svg>`;}

/* ===================== Rangs (noms façon Valorant, emblèmes originaux) ===================== */
const TIERS=[
 {id:'fer',name:_t("Fer"),c:['#A4AAB2','#5B6068'],cond:{}},
 {id:'bronze',name:_t("Bronze"),c:['#DDA171','#8A5530'],cond:{settled:3}},
 {id:'argent',name:_t("Argent"),c:['#D3D9E1','#7E8896'],cond:{settled:10,deposits:1}},
 {id:'or',name:_t('Or'),c:['#F7D774','#C08A12'],cond:{settled:25,acc:50}},
 {id:'platine',name:_t("Platine"),c:['#7EE0D6','#1A8584'],cond:{settled:60,acc:55,flashWins:3}},
 {id:'diamant',name:_t("Diamant"),c:['#CDB9FF','#7350E3'],cond:{settled:120,acc:57,followed:25}},
 {id:'ascendant',name:_t("Ascendant"),c:['#82E6AC','#13804F'],cond:{settled:200,acc:58,followed:100}},
 {id:'immortel',name:_t("Immortel"),c:['#FF96A9','#AE2139'],cond:{settled:320,acc:60,followed:300}},
 {id:'radiant',name:_t("Radiant"),c:['#FFE27A','#E59A00'],cond:{top:100}}
];
const DIV_XP=[[0,100,200],[300,450,600],[800,1000,1200],[1450,1700,1950],[2250,2550,2850],[3200,3600,4000],[4500,5000,5500],[6100,6700,7300],[8000]];
const ROMAN=['I','II','III'];
const rankName=(t,d)=>TIERS[t].name+(t<8?' '+ROMAN[d]:'');
const FEATURES=[
 {g:'bet',t:0,ic:'target',label:_t("Parier sur tous les marchés"),href:'#accueil'},
 {g:'chat',t:0,ic:'chat',label:_t("Live chat global et de chaque marché"),href:'#chat'},
 {g:'flash',t:0,ic:'bolt',label:_t("Pari éclair : rotation ou tous les paris en parallèle"),href:'#eclair'},
 {g:'pro1',t:0,ic:'chart',label:_t("Mode Pro : 1 indicateur à la fois, outils de dessin illimités"),href:'#marche-btc150k'},
 {g:'dm',t:1,ic:'send',label:_t("Messages privés"),href:'#chat'},
 {g:'share',t:1,ic:'share',label:_t("Partager tes mises dans les chats"),href:'#chat'},
 {g:'follow',t:2,ic:'users',label:_t("Suivre la mise d’un joueur en un clic"),href:'#chat'},
 {g:'clan',t:2,ic:'shield',label:_t("Créer un clan"),href:'#clans'},
 {g:'pro2',t:2,ic:'chart',label:_t("Mode Pro : 2 indicateurs en même temps"),href:'#marche-btc150k'},
 {g:'propose',t:3,ic:'plus',label:_t("Créer un pari et le soumettre au vote"),href:'#creer'},
 {g:'copy',t:3,ic:'copy',label:_t("Copier automatiquement les paris d’un joueur"),href:'#copie'},
 {g:'stats',t:4,ic:'chart',label:_t("Statistiques avancées des marchés")},
 {g:'pro3',t:4,ic:'chart',label:_t("Mode Pro : 3 indicateurs en même temps"),href:'#marche-btc150k'},
 {g:'fees',t:5,ic:'percent',label:_t("Frais réduits de 10 %")},
 {g:'verified',t:5,ic:'shield',label:_t("Badge vérifié sur ton profil")},
 {g:'vip',t:6,ic:'crown',label:_t("Accès au salon VIP"),href:'#chat'},
 {g:'publish',t:7,ic:'out',label:_t("Publier un pari sans passer par le vote"),href:'#creer'},
 {g:'opinion',t:8,ic:'eye',label:_t("Ton avis affiché sur chaque marché")},
 {g:'pro4',t:8,ic:'chart',label:_t("Mode Pro : indicateurs illimités, plusieurs fois le même si tu veux"),href:'#marche-btc150k'}
];
const GATES={};FEATURES.forEach(f=>GATES[f.g]=f);
const CGO={xp:['#eclair',_t("Gagner de l’XP")],settled:['#eclair',_t("Jouer l’éclair")],acc:['#eclair',_t("Jouer l’éclair")],deposits:['#depot',_t("Déposer")],flashWins:['#eclair',_t("Jouer l’éclair")],followed:['#chat',_t("Partager une mise")],top:['#classement',_t("Classement")]};
const CHINT={xp:_t("Chaque action rapporte de l’XP."),settled:_t("Un pari compte quand son marché se termine. Une manche éclair se règle en 45 secondes."),acc:_t("La part de tes paris réglés qui ont gagné."),deposits:_t("Un premier dépôt suffit : crypto, carte, virement ou PayPal."),flashWins:_t("Gagne des manches au marché éclair."),followed:_t("Partage tes mises : chaque joueur qui en suit une compte."),top:_t("Termine la saison dans le top 100.")};

/* ===================== Joueurs fictifs ===================== */
const USERS={
 satoshi:{n:'satoshi_fr',t:8,d:0,tone:0,profit:48230,acc:71,bets:412,fol:3200,bio:_t("Crypto uniquement. Je poste toutes mes entrées dans le chat.")},
 lea:{n:'lea',t:8,d:0,tone:3,profit:31870,acc:68,bets:296,fol:2900,bio:_t("Football et crypto. Je partage chaque mise, gagnante ou pas.")},
 kaizen:{pub:0,n:'kaizen',t:8,d:0,tone:1,profit:27410,acc:66,bets:351,fol:1800,bio:_t("Macro et taux. Patience.")},
 maxou:{n:'maxou',t:7,d:2,tone:1,profit:19540,acc:66,bets:288,fol:1240,bio:_t("Momentum. J’entre tôt, je sors vite.")},
 karim:{n:'karim',t:7,d:1,tone:2,profit:15120,acc:62,bets:240,fol:880,bio:_t("Ligue des champions et Liga.")},
 orbital:{pub:0,n:'orbital',t:7,d:0,tone:0,profit:12980,acc:69,bets:199,fol:760,bio:_t("Tech, IA et espace.")},
 ines:{n:'ines',t:6,d:2,tone:3,profit:11460,acc:58,bets:305,fol:640,bio:_t("Marchés éclair tous les soirs.")},
 tomtom:{cp:0,n:'tomtom',t:6,d:1,tone:0,profit:9870,acc:61,bets:174,fol:410,bio:_t("Météo et culture.")},
 jules:{n:'jules',t:5,d:0,tone:1,profit:6120,acc:59,bets:150,fol:220,bio:_t("Foot, foot, foot.")},
 kdurand:{n:'k.durand',t:4,d:2,tone:2,profit:3480,acc:57,bets:122,fol:140,bio:_t("Je lis les règles avant de miser.")},
 sofia:{n:'sofia.b',t:2,d:0,tone:2,profit:640,acc:52,bets:48,fol:35,bio:_t("Nouvelle, mais je progresse vite.")},
 mehdi:{n:'mehdi',t:1,d:2,tone:1,profit:210,acc:50,bets:22,fol:12,bio:_t("J’apprends avec l’éclair.")},
 nina:{n:'nina',t:0,d:1,tone:0,profit:12,acc:50,bets:2,fol:3,bio:_t("Premier pari cette semaine.")}
};
const USER_IDS=Object.keys(USERS);
/* Joueur absent de l'annuaire : une fiche de secours complète (jamais undefined), remplacée quand le serveur répond. */
const FANTOMES={};
function fantome(u){const k=String(u);return FANTOMES[k]||(FANTOMES[k]={n:/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(k)?_t("Joueur"):k,t:0,d:0,tone:hash(k)%4,profit:0,acc:0,bets:0,fol:0,bio:'',inconnu:true});}
/* Minuteurs : chaque module déclare les siens ici, boot.js les lance selon le mode.
   'local' (par défaut) : simulateur d'état partagé (bots, faux joueurs), jamais lancé quand le serveur fait autorité ; 'tous' : affichage. */
/* Décors de départ du mode local (messages d'exemple dans les salons…) : déclarés par les modules, posés par boot.js en mode local seulement. */
const SEMIS=[];
const PLAN=[];
const planifier=(nom,ms,fn,quand)=>{PLAN.push({nom,ms,fn,quand:quand||'local'});};
/* vrai une fois le mode connu et le premier rendu fait : avant, les clics et la navigation sont ignorés */
let PRET=false;

/* Indice pour le testeur : petite mention toujours identique, jamais dans le libellé principal d'un bouton ou d'un titre. */
const demoB=()=>`<span class="demo-b">${_t('Mode démo')}</span>`;
const demoHint=(txt,tag='p')=>`<${tag} class="demo-h">${demoB()}<span>${txt}</span></${tag}>`;
/* ===================== Dates ===================== */
/* Un seul formateur par langue ; l'heure est sur 24 h (« 23:59 »), sauf en anglais (« 11:59 PM », voir hTxt). */
const DAYMS=864e5,isoDate=s=>{const [y,mo,d]=s.split('-').map(Number);return new Date(y,mo-1,d);};
const fmtDay=d=>d.toLocaleDateString(LOC,{day:'numeric',month:'long',year:'numeric'});
const fmtWhen=(iso,time)=>time?_t('{0} à {1}',[fmtDay(isoDate(iso)),hTxt(time)]):fmtDay(isoDate(iso));
const isoIn=n=>{const d=new Date(now()+n*DAYMS);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
/* Clôture d'un marché : la date longue et le délai affiché (« Dans 14 j ») sont calculés à partir de la même date. */
function closeOf(iso,time,lab){const d=isoDate(iso),days=Math.max(0,Math.ceil((d-now())/DAYMS));
 const close=lab==='d'?d.toLocaleDateString(LOC,{day:'numeric',month:'short'}):lab==='dy'?d.toLocaleDateString(LOC,{day:'numeric',month:'short',year:'numeric'}):lab==='long'?fmtDay(d):days<1?_t('Aujourd’hui'):days<60?_t('Dans {0} j',[days]):_t('Dans {0} mois',[Math.round(days/30)]);
 return {close,closeLong:fmtWhen(iso,time),days};}
/* ===================== Marchés ===================== */
const CATS=Array('Tout','Crypto','Football','Politique','Tech et IA','Économie','Culture','Météo','Sport');
const MARKETS=[
 {id:'btc150k',cat:'Crypto',q:_t("Le Bitcoin dépassera-t-il 150 000 $ avant le 31 décembre ?"),short:_t("Bitcoin à 150 000 $"),p:63,d0:51,vol:4.2e6,...closeOf('2026-12-31','23:59','d'),people:1284,msgs:312,heat:3.2,rules:_t("Ce marché se résout par Oui si le prix du Bitcoin atteint ou dépasse 150 000 $ sur Coinbase (paire BTC-USD) à n’importe quel moment avant le 31 décembre 2026 à 23:59, heure de Paris. Sinon, il se résout par Non.")},
 {id:'clasico',cat:'Football',q:_t("Le Barça gagnera-t-il le prochain Clásico ?"),short:_t("Barça au Clásico"),p:54,d0:50,vol:8.6e5,close:_t("Ce soir"),closeLong:_t('ce soir à {0}',[hTxt('21:00')]),days:0,people:1204,msgs:842,heat:2.6,rules:_t("Ce marché se résout par Oui si le FC Barcelone gagne le match dans le temps réglementaire. Un match nul ou une défaite donne Non.")},
 {id:'ia-olympiades',cat:'Tech et IA',q:_t("Une IA remportera-t-elle l’or aux Olympiades de maths 2027 ?"),short:_t("IA aux Olympiades"),p:72,d0:63,vol:1.3e6,...closeOf(isoIn(14)),people:2310,msgs:518,heat:2,rules:_t("Ce marché se résout par Oui si un système d’IA obtient un score de médaille d’or selon le barème officiel des Olympiades internationales de mathématiques 2027, confirmé par les organisateurs.")},
 {id:'eth6000',cat:'Crypto',q:_t("Ethereum finira-t-il novembre au-dessus de 6 000 $ ?"),short:_t("Ethereum à 6 000 $"),p:28,d0:33,vol:2.1e6,...closeOf('2026-11-30','23:59'),people:3045,msgs:276,heat:2.2,rules:_t("Ce marché se résout par Oui si le prix de clôture d’Ethereum (ETH-USD sur Coinbase) le 30 novembre 2026 à 23:59 est strictement supérieur à 6 000 $.")},
 {id:'box-office',cat:'Culture',q:_t("Le film le plus vu de 2026 dépassera-t-il 1 milliard $ ?"),short:_t("Un film à 1 milliard $"),p:46,d0:45,vol:5.4e5,...closeOf('2026-12-31'),people:688,msgs:94,heat:1,rules:_t("Ce marché se résout par Oui si au moins un film sorti en 2026 dépasse 1 milliard de dollars de recettes mondiales selon Box Office Mojo au 31 décembre 2026.")},
 {id:'neige-noel',cat:'Météo',q:_t("Neigera-t-il à Paris le jour de Noël ?"),short:_t("Neige à Paris à Noël"),p:17,d0:19,vol:2.1e5,...closeOf('2026-12-25','23:59'),people:1512,msgs:201,heat:1.2,rules:_t("Ce marché se résout par Oui si Météo-France relève des chutes de neige à la station Paris-Montsouris le 25 décembre 2026.")},
 {id:'bce',cat:'Économie',q:_t("La BCE baissera-t-elle ses taux en décembre ?"),short:_t("Baisse des taux de la BCE"),p:61,d0:58,vol:1.8e6,...closeOf('2026-12-17'),people:977,msgs:143,heat:1.4,rules:_t("Ce marché se résout par Oui si la Banque centrale européenne annonce une baisse de son taux de dépôt lors de sa réunion de décembre 2026.")},
 {id:'ldc',cat:'Football',q:_t("Un club français atteindra-t-il les demi-finales de la Ligue des champions ?"),short:_t("Un club français en demie"),p:33,d0:34,vol:9.5e5,...closeOf('2027-04-30'),people:1830,msgs:388,heat:1.6,rules:_t("Ce marché se résout par Oui si au moins un club de Ligue 1 se qualifie pour les demi-finales de la Ligue des champions 2026-2027.")},
 {id:'sol-eth',cat:'Crypto',q:_t("Solana dépassera-t-il Ethereum en volume quotidien cette semaine ?"),short:_t("Solana devant Ethereum"),p:41,d0:36,vol:7.2e5,...closeOf(isoIn(5)),people:1102,msgs:167,heat:1.8,rules:_t("Ce marché se résout par Oui si, au moins un jour de la semaine, le volume des plateformes décentralisées de Solana dépasse celui d’Ethereum selon DefiLlama.")},
 {id:'roland-garros',cat:'Sport',q:_t("Un Français atteindra-t-il la finale de Roland-Garros 2027 ?"),short:_t("Un Français en finale à Roland"),p:23,d0:21,vol:3.9e5,...closeOf('2027-06-06'),people:947,msgs:133,heat:.9,rules:_t("Ce marché se résout par Oui si un joueur français atteint la finale du simple messieurs de Roland-Garros 2027.")}
];
/* ===== Marchés à cotes multiples (façon Polymarket) : chaque issue est un sous-marché Oui/Non à part entière,
 *  adossé au même carnet d'ordres ; les chances des issues d'un même marché totalisent 100 %. ===== */
const GROUPS=[
 {id:'presid27',cat:'Politique',q:_t("Qui remportera l’élection présidentielle française de 2027 ?"),short:_t("Présidentielle 2027"),...closeOf('2027-05-09','20:00','long'),people:4120,msgs:962,heat:3,
  rules:_t("Ce marché se résout sur le résultat officiel du second tour, tel que proclamé par le Conseil constitutionnel. Une seule issue gagne : chaque part gagnante rapporte 1 $, les autres ne valent plus rien."),
  outcomes:[
   ['roux',_t("Camille Roux"),34,29,_t("Présidentielle 2027 : Camille Roux sera-t-elle élue ?")],
   ['lefevre',_t("Antoine Lefèvre"),27,30,_t("Présidentielle 2027 : Antoine Lefèvre sera-t-il élu ?")],
   ['benali',_t("Nadia Benali"),18,16,_t("Présidentielle 2027 : Nadia Benali sera-t-elle élue ?")],
   ['moreau',_t("Julien Moreau"),12,14,_t("Présidentielle 2027 : Julien Moreau sera-t-il élu ?")],
   ['autre',_t("Un autre candidat"),9,11,_t("Présidentielle 2027 : un autre candidat sera-t-il élu ?")]]},
 {id:'ldc27',cat:'Football',q:_t("Quelle équipe remportera la Ligue des champions 2026-2027 ?"),short:_t("Ligue des champions 2027"),...closeOf('2027-06-05','23:00','long'),people:5380,msgs:1410,heat:3.4,
  rules:_t("Ce marché se résout sur le vainqueur officiel de la finale de la Ligue des champions de l’UEFA 2026-2027, prolongation et tirs au but compris. Une seule issue gagne."),
  outcomes:[
   ['real',_t("Real Madrid"),22,20,_t("Ligue des champions 2027 : le Real Madrid soulèvera-t-il la coupe ?")],
   ['city',_t("Manchester City"),18,19,_t("Ligue des champions 2027 : Manchester City soulèvera-t-il la coupe ?")],
   ['psg',_t("Paris Saint-Germain"),15,13,_t("Ligue des champions 2027 : le PSG soulèvera-t-il la coupe ?")],
   ['barca',_t("FC Barcelone"),14,15,_t("Ligue des champions 2027 : le Barça soulèvera-t-il la coupe ?")],
   ['bayern',_t("Bayern Munich"),11,12,_t("Ligue des champions 2027 : le Bayern soulèvera-t-il la coupe ?")],
   ['liverpool',_t("Liverpool"),9,10,_t("Ligue des champions 2027 : Liverpool soulèvera-t-il la coupe ?")],
   ['autre',_t("Une autre équipe"),11,11,_t("Ligue des champions 2027 : une autre équipe soulèvera-t-elle la coupe ?")]]},
 {id:'crypto2',cat:'Crypto',q:_t("Quelle sera la deuxième cryptomonnaie par capitalisation au 31 décembre 2027 ?"),short:_t('2e crypto fin 2027'),...closeOf('2027-12-31','23:59','dy'),people:2210,msgs:388,heat:1.8,
  rules:_t("Ce marché se résout d’après le classement par capitalisation de CoinGecko le 31 décembre 2027 à 23:59 (UTC), stablecoins exclus. Une seule issue gagne."),
  outcomes:[
   ['eth','Ethereum',61,64,_t("Ethereum sera-t-il encore la 2e crypto fin 2027 ?")],
   ['sol','Solana',19,16,_t("Solana sera-t-il la 2e crypto fin 2027 ?")],
   ['xrp','XRP',9,10,_t("XRP sera-t-il la 2e crypto fin 2027 ?")],
   ['bnb','BNB',6,5,_t("BNB sera-t-il la 2e crypto fin 2027 ?")],
   ['autre',_t("Une autre crypto"),5,5,_t("Une autre crypto sera-t-elle la 2e fin 2027 ?")]]}
];
const GK={};
for(const g of GROUPS){GK[g.id]=g;const base=g.people*1300;g.outcomes=g.outcomes.map(([k,label,p,d0,q])=>{const m={id:g.id+'-'+k,parent:g.id,label,cat:g.cat,q,short:`${label} (${g.short})`,p,d0,vol:Math.round(base*(.25+p/100)),close:g.close,closeLong:g.closeLong,days:g.days,people:Math.round(g.people*(.3+p/100)),msgs:Math.round(g.msgs*(.1+p/150)),heat:Math.round(g.heat*(.2+p/100)*10)/10,rules:g.rules};MARKETS.push(m);return m;});}
const MK={};MARKETS.forEach(m=>{MK[m.id]=m;});
function seedPh(m){const rr=rng(hash(m.id+'ph'));const out=[];let w=0;for(let i=0;i<120;i++){const f=i/119;w+=(rr()-.5)*2.2;out.push(clamp(m.d0+(m.p-m.d0)*f+w*(1-f),2,98));}out[119]=m.p;return out;}
for(const m of MARKETS){const r=rng(hash(m.id));m.anchor=m.p;m.ph=seedPh(m);m.bets=[];for(let i=0;i<300;i++)m.bets.push({s:r()<m.p/100?1:0,a:Math.pow(r(),2.2),me:0});m.online=Math.round(m.people*.07);m.hotUntil=0;}

/* ===================== Crypto pour les dépôts ===================== */
const COINS={USDC:{n:_t("USD Coin"),note:_t("Sans conversion"),min:5,dec:2,nets:['Base','Ethereum','Arbitrum','Solana','Polygon']},USDT:{n:_t("Tether"),note:_t("Converti 1 pour 1"),min:5,dec:2,nets:['Ethereum',_t("Tron"),'Arbitrum','Solana']},ETH:{n:_t("Ether"),note:_t("Au cours du marché"),min:.002,dec:4,nets:['Ethereum','Base','Arbitrum']},BTC:{n:'Bitcoin',note:_t("Au cours du marché"),min:.0001,dec:5,nets:['Bitcoin',_t("Lightning")]},SOL:{n:'Solana',note:_t("Au cours du marché"),min:.03,dec:3,nets:['Solana']}};
const NETS={Base:{d:_t("Rapide et peu cher"),fee:_t("environ 0,01 $"),time:_t("Environ 1 min"),conf:12,fmt:'evm'},Ethereum:{d:_t("Le réseau d’origine"),fee:_t("environ 1,80 $"),time:_t("Environ 3 min"),conf:12,fmt:'evm'},Arbitrum:{d:_t("Réseau rapide compatible Ethereum"),fee:_t("environ 0,03 $"),time:_t("Environ 1 min"),conf:12,fmt:'evm'},Polygon:{d:_t("Très faibles frais"),fee:_t("environ 0,01 $"),time:_t("Environ 2 min"),conf:30,fmt:'evm'},Solana:{d:_t("Très rapide"),fee:_t("moins de 0,01 $"),time:_t("Environ 30 s"),conf:1,fmt:'sol'},Tron:{d:_t("Populaire pour l’USDT"),fee:_t("environ 1 $"),time:_t("Environ 1 min"),conf:20,fmt:'tron'},Bitcoin:{d:_t("Le réseau Bitcoin"),fee:_t("selon le réseau"),time:_t("Environ 20 min"),conf:2,fmt:'btc'},Lightning:{d:_t("Instantané, petits montants"),fee:_t("moins de 0,01 $"),time:_t("Instantané"),conf:1,fmt:'ln'}};
const REC_NET={USDC:'Base',USDT:_t("Tron"),ETH:'Base',BTC:'Bitcoin',SOL:'Solana'};
function coinUSD(c){return c==='BTC'?G('btc').price:c==='ETH'?G('eth').price:c==='SOL'?G('sol').price:1;}

/* ===================== État ===================== */
const T0=now();
function demoMe(){return {v:5,logged:true,onboarded:true,kyc:false,fmode:'free',falerts:[],contraWins:1,n:'User26',email:'user26@exemple.fr',photo:'g:renard',color:'#14161B',interests:[],since:new Date(2026,2,1).toLocaleDateString(LOC,{month:'long',year:'numeric'}),followers:128,xp:1840,balance:1000248.5,credit1m:true,bio:_t("Crypto le soir, foot le week-end. Je partage mes mises dans le chat."),wallet:'',prefs:{},ctype:'courbe',settled:186,wins:119,played:213,flashWins:0,flashStreak:0,flashBest:0,flashProfit:0,followed:18,deposits:1,depDay:'',streak:5,bestStreak:9,pos:1284,msgsTotal:64,chatXP:0,chatDay:'',maxBet:200,realized:1795.94,following:['lea','maxou'],watch:['btc150k'],props:[],voted:{},
 positions:[{m:'btc150k',s:'oui',sh:238.1,avg:54},{m:'clasico',s:'oui',sh:120,avg:50},{m:'eth6000',s:'non',sh:180.5,avg:66},{m:'neige-noel',s:'non',sh:150,avg:85},{m:'ia-olympiades',s:'oui',sh:200,avg:66}],
 history:[{k:'res',q:_t("La BCE baissera-t-elle ses taux en octobre ?"),s:'oui',win:true,pnl:38.2,at:T0-864e5},{k:'res',q:_t("Le PSG gagnera-t-il contre Monaco ?"),s:'non',win:false,pnl:-25,at:T0-1728e5},{k:'res',q:_t("Le Bitcoin finira-t-il octobre au-dessus de 90 000 $ ?"),s:'oui',win:true,pnl:61.4,at:T0-2592e5}],
 deps:[{coin:'USDC',net:'Base',amt:1e6,usd:1e6,at:T0-6e5,conf:12,need:12,label:'Crédit démo'},{coin:'ETH',net:'Arbitrum',amt:.015,usd:52.31,at:T0-8.64e7,conf:12,need:12},{coin:'USDT',net:'Ethereum',amt:100,usd:100,at:T0-4.3e8,conf:12,need:12},{coin:'BTC',net:'Bitcoin',amt:.0021,usd:201.77,at:T0-1.05e9,conf:2,need:2}],
 wds:[],
 notifs:[{id:1,ic:'users',text:_t("lea a suivi ta mise sur le Clásico."),href:'#profil',at:T0-36e5,read:false},{id:2,ic:'trophy',text:_t("Plus que 110 XP pour passer Or III."),href:'#rang',at:T0-72e5,read:false},{id:3,ic:'flame',text:_t("Signal de foule sur Bitcoin à 150 000 $."),href:'#marche-btc150k',at:T0-9e6,read:false}],
 missions:[{id:'bets2',type:'bet',label:_t("Place 2 paris"),goal:2,have:0,xp:40,go:'#accueil',claimed:false},{id:'chatm1',type:'chatm',label:_t("Écris dans le chat d’un marché"),goal:1,have:0,xp:30,go:'#marche-btc150k',claimed:false},{id:'flash1',type:'flashwin',label:_t("Gagne une manche au marché éclair"),goal:1,have:0,xp:60,go:'#eclair',claimed:false}],
 badges:[],copies:[],copiers:0,welcomed:false,blockedShown:''};}
function newMe(n,email){return {v:5,logged:true,onboarded:false,kyc:false,fmode:'free',falerts:[],contraWins:0,n,email,photo:'g:'+AV_GALLERY[hash(n||'')%AV_GALLERY.length].id,color:'#2448FF',interests:[],since:_t("aujourd’hui"),followers:0,xp:0,balance:1e6,credit1m:true,bio:'',wallet:'',prefs:{},ctype:'courbe',settled:0,wins:0,played:0,flashWins:0,flashStreak:0,flashBest:0,flashProfit:0,followed:0,deposits:0,depDay:'',streak:1,bestStreak:1,pos:38900,msgsTotal:0,chatXP:0,chatDay:'',maxBet:0,realized:0,following:[],watch:[],props:[],voted:{},positions:[],history:[],deps:[{coin:'USDC',net:'Base',amt:1e6,usd:1e6,at:now(),conf:12,need:12,label:'Crédit démo'}],wds:[],
 notifs:[{id:1,ic:'gift',text:_t("Bienvenue sur Wimoro ! Tes 100 XP de bienvenue t’attendent."),href:'#bienvenue',at:now(),read:false}],
 missions:[{id:'dep1',type:'dep',label:_t("Fais ton premier dépôt"),goal:1,have:0,xp:100,go:'#depot',claimed:false},{id:'fb1',type:'flashbet',label:_t("Joue une manche au marché éclair"),goal:1,have:0,xp:50,go:'#eclair',claimed:false},{id:'chat1',type:'chat',label:_t("Écris ton premier message"),goal:1,have:0,xp:20,go:'#chat',claimed:false}],
 badges:[],copies:[],copiers:0,welcomed:true,blockedShown:''};}
const S={
 me:demoMe(),
 rooms:{},
 ui:{cat:'Tout',sort:'actifs',tf:'1 j',homeRoom:'general',room:'general',mtab:'live',lbp:'Saison',ptab:'positions',ticket:{m:null,side:'oui',mode:'buy',amt:'50',announce:true},sheet:null,dep:{coin:'USDC',net:'Base',method:'crypto'},wd:{net:'Base',addr:'',amt:'',method:'crypto'},flashAmt:10,fgame:'btc',tmode:'line',fiat:{dep:'50',wd:''},kycd:{doc:false},q:'',ob:1,crTab:'form',draft:{q:'',cat:'Football',date:'',time:'21:00',src:'',rules:'',p0:50},authMode:'mail',after:'',authNote:''},
 online:2481,ethPrice:3482.6,solPrice:188.4
};

/* ===================== Persistance légère (confort uniquement) ===================== */
let KEY='wimoro-demo';
let saveT=null;
function save(){if(SRV()){srvSauver();return;}clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S.me));}catch(e){}},400);}
function load(){try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(d&&d.v===S.me.v)Object.assign(S.me,d);}catch(e){}
 /* compte démo enregistré sous l'ancien nom : on le renomme */
 if(KEY==='wimoro-demo'&&S.me.n==='dan.h'){S.me.n='User26';S.me.email='user26@exemple.fr';}}
/* État des marchés (prix, volumes, historique en direct) : gardé sous sa propre clé, indépendante des comptes,
   pour que les marchés reprennent là où ils en étaient après un rechargement. */
const MKKEY='wimoro-markets';
const r2=v=>Math.round(v*100)/100;
function marketsSave(){if(SRV())return;try{const o={v:1,at:now(),m:{}};for(const id in MK){const m=MK[id];if(m.creator==='me'||!m.ph)continue;o.m[id]={p:r2(m.p),d0:m.d0,vol:Math.round(m.vol),people:m.people,msgs:m.msgs,anchor:r2(m.anchor),liq:m.liq,ph:m.ph.map(r2)};}localStorage.setItem(MKKEY,JSON.stringify(o));}catch(e){}}
function marketsLoad(){try{const o=JSON.parse(localStorage.getItem(MKKEY)||'null');if(!o||o.v!==1||!o.m)return;for(const id in o.m){const m=MK[id],s=o.m[id];if(!m||!s||typeof s.p!=='number'||!Array.isArray(s.ph))continue;
  m.p=clamp(s.p,3,97);if(typeof s.d0==='number')m.d0=s.d0;if(s.vol>=m.vol)m.vol=s.vol;if(s.people>=m.people)m.people=s.people;if(s.msgs>=m.msgs)m.msgs=s.msgs;if(typeof s.anchor==='number')m.anchor=clamp(s.anchor,5,95);if(typeof s.liq==='number')m.liq=s.liq;if(s.ph.length)m.ph=s.ph.slice(-160);}}catch(e){}}
function resetDemo(){try{localStorage.removeItem(KEY);}catch(e){}location.hash='#accueil';location.reload();}
function flushSave(){if(SRV()){srvSauver(true);return;}clearTimeout(saveT);try{localStorage.setItem(KEY,JSON.stringify(S.me));}catch(e){}}

/* ===================== Rang : calculs ===================== */
function stats(){const m=S.me;return {xp:m.xp,settled:m.settled,acc:Math.round(m.wins/Math.max(1,m.settled)*100),deposits:m.deposits,flashWins:m.flashWins,followed:m.followed,pos:m.pos};}
function conds(i,st=stats()){const c=TIERS[i].cond,L=[];
 L.push({k:'xp',label:_t("Expérience"),have:st.xp,need:DIV_XP[i][0]});
 if(c.settled)L.push({k:'settled',label:_t("Paris réglés"),have:st.settled,need:c.settled});
 if(c.acc)L.push({k:'acc',label:_t("Précision"),have:st.acc,need:c.acc});
 if(c.deposits)L.push({k:'deposits',label:_t("Premier dépôt"),have:st.deposits,need:c.deposits});
 if(c.flashWins)L.push({k:'flashWins',label:_t("Victoires au marché éclair"),have:st.flashWins,need:c.flashWins});
 if(c.followed)L.push({k:'followed',label:_t("Mises suivies par d’autres joueurs"),have:st.followed,need:c.followed});
 if(c.top)L.push({k:'top',label:_t("Place au classement de la saison"),have:st.pos,need:c.top,rev:true});
 L.forEach(x=>{x.ok=x.rev?x.have<=x.need:x.have>=x.need;});return L;}
function tierOK(i,st){return conds(i,st).every(c=>c.ok);}
function rankFrom(st){let t=0;for(let i=1;i<TIERS.length;i++){if(tierOK(i,st))t=i;else break;}let d=0;DIV_XP[t].forEach((x,i)=>{if(st.xp>=x)d=i;});return {t,d};}
function myRank(){return rankFrom(stats());}
function can(g){return myRank().t>=GATES[g].t;}
function nextStep(r=myRank()){if(r.t===8)return null;if(r.d<2)return {t:r.t,d:r.d+1,xp:DIV_XP[r.t][r.d+1],tier:false};return {t:r.t+1,d:0,xp:DIV_XP[r.t+1][0],tier:true};}
function progress(){const r=myRank(),nx=nextStep(r),xp=S.me.xp,cur=DIV_XP[r.t][r.d];if(!nx)return {pct:100,left:0,next:xp,nx:null,blocked:false};const left=Math.max(0,nx.xp-xp);const blocked=left===0;return {pct:clamp((xp-cur)/(nx.xp-cur)*100,0,100),left,next:nx.xp,nx,blocked};}

/* ===================== Salons ===================== */
let MID=0;const MSG={};
function room(id){if(!S.rooms[id]){let name=_t("Général"),kind='global';if(id==='vip'){name=_t("Salon VIP");kind='vip';}else if(id.startsWith('m:')){name='#'+id.slice(2);kind='market';}else if(id.startsWith('dm:')){name=userOf(id.slice(3)).n;kind='dm';}else if(id.startsWith('clan:')){name=typeof CK!=='undefined'&&CK[id.slice(5)]?CK[id.slice(5)].name:_t("Clan");kind='clan';}S.rooms[id]={id,name,kind,msgs:[],unread:0};}return S.rooms[id];}
function roomLabel(id){const r=room(id);return r.kind==='market'?bidi('#'+id.slice(2)):r.name;}
function mkMsg(o){const x=Object.assign({id:++MID,at:now(),r:{},my:[],followers:0},o);MSG[x.id]=x;return x;}

const MLINES={
 btc150k:[_t("Les baleines rentrent, regardez le volume des dix dernières minutes."),_t("Il faudrait encore +38 % en sept semaines. Ça s’est déjà vu, mais rarement."),_t("Je renforce Oui, le momentum est trop propre."),_t("Les ETF achètent tous les jours. Oui sans hésiter."),_t("Je prends Non à 37, trop de hype ce soir.")],
 clasico:[_t("Barça à domicile, je ne vois pas comment ils perdent."),_t("Le Real a gagné les trois derniers. Non à 46, c’est cadeau."),_t("Composition officielle dans une heure, je reste prudent."),_t("Si Lamine Yamal joue, c’est Oui.")],
 'ia-olympiades':[_t("Les modèles ont déjà eu l’argent cette année."),_t("72 %, c’est trop haut : la géométrie reste dure pour eux."),_t("Je prends Oui, les progrès sont fous.")],
 eth6000:[_t("ETH doit prendre +40 % en un mois. Non tout le long."),_t("Je ne vois pas le catalyseur, je reste sur Non."),_t("Petite mise sur Oui, au cas où.")],
 'box-office':[_t("Trois films peuvent le faire cette année."),_t("Le box-office chinois va tout décider.")],
 'neige-noel':[_t("Les modèles météo disent plutôt non pour l’instant."),_t("17 %, je trouve ça bas. Il a déjà neigé un 25 décembre.")],
 bce:[_t("Lagarde l’a presque confirmé la semaine dernière."),_t("L’inflation de novembre va tout décider.")],
 ldc:[_t("Le PSG peut le faire, le tirage est clément."),_t("33 %, c’est juste.")],
 'sol-eth':[_t("Les memecoins font exploser le volume sur Solana."),_t("Ethereum garde l’avance sur les gros montants.")],
 'roland-garros':[_t("Il faudra un tableau parfait pour un Français."),_t("23 %, ça me paraît généreux.")]
};
const GEN_LINES=[_t("Je renforce {side} ici."),_t("{pct}, c’est trop {hb} pour moi."),_t("Le volume des dernières minutes est énorme."),_t("Je reste sur {side}, je ne bouge pas."),_t("Je prends mes gains et je sors."),_t("On en reparle à la clôture."),_t("Quelqu’un a une source fiable ?"),_t("Ce chat est en feu ce soir."),_t("Ceux qui ont vendu à {prev} doivent regretter.")];
const GLOBAL_LINES=[_t("Qui est chaud sur #{id} ?"),_t('#{id} à {pct}, c’est donné.'),_t("Je viens de prendre {side} sur #{id}."),_t("Éclair : je suis sur Plus haut, ça pousse."),_t("Ma série à l’éclair : 4 victoires. Qui fait mieux ?"),_t("GG à ceux qui ont suivi lea hier soir."),_t("Le chat de #{id} part en vrille."),_t("Je passe sur Non pour #{id}, trop de hype."),_t("Plus que 200 XP pour Immortel, je tente l’éclair."),_t("Quelqu’un a vu le volume sur #{id} ?"),_t("Nouvelle manche éclair toutes les 45 secondes, je ne décroche plus."),_t("Je viens de passer Platine grâce à l’éclair.")];
const REPLIES=['bien vu',_t("je te suis là-dessus"),_t("pas d’accord, Non est mieux placé"),_t("t’as une source ?"),_t("carré"),_t("on verra à la clôture"),_t("je viens de prendre la même"),_t("mdr tu vas pleurer à la clôture"),_t("propre, je copie")];
const DM_REPLIES=[_t("Salut ! Tu joues quoi ce soir ?"),_t("Je regarde le Clásico, et toi ?"),_t("Bien joué pour ton dernier pari."),_t("On monte un clan ensemble ?"),_t("Je partage mes entrées dans le live chat, suis-moi.")];
function fillT(t,m){m=m||weighted();const side=R()<m.p/100?_t("Oui"):_t("Non");return t.replace(/\{id\}/g,m.id).replace(/\{pct\}/g,F.pct(m.p)).replace(/\{side\}/g,side).replace(/\{hb\}/g,m.p>50?_t("haut"):_t("bas")).replace(/\{prev\}/g,Math.round(m.p-3));}
function seedRooms(){const g=room('general');const t=now();
 const base=[['jules',_t("Le Clásico à 54 %, c’est donné. Le Barça joue à domicile."),9],['sofia',_t("Personne ne parle de la neige à Noël ? 17 %, je trouve ça bas."),8],['tomtom',_t("@sofia.b les modèles météo disent plutôt non pour l’instant."),7],['maxou',_t("Je renforce Oui sur #btc150k. Le volume des dix dernières minutes est énorme."),6]];
 base.forEach(([u,txt,mn])=>g.msgs.push(mkMsg({u,k:'msg',text:txt,at:t-mn*60000,r:mn===6?{'🔥':12}:{}})));
 g.msgs.push(mkMsg({k:'sig',sig:{m:'btc150k',s:'oui',n:87,mins:5,from:59,to:63},at:t-5*60000}));
 g.msgs.push(mkMsg({u:'lea',k:'bet',text:_t("Je suis dedans."),bet:{m:'btc150k',s:'oui',amt:1200,price:61},followers:47,at:t-4*60000,r:{'🔥':31,'💸':9}}));
 g.msgs.push(mkMsg({k:'evt',text:_t("lea vient de passer Radiant"),rt:8,rd:0,at:t-4*60000}));
 g.msgs.push(mkMsg({u:'karim',k:'msg',text:_t("Ceux qui ont vendu à 55 doivent regretter."),at:t-3*60000,r:{'👀':4}}));
 g.msgs.push(mkMsg({u:'nina',k:'msg',text:_t("Premier pari : 20 $ sur #ia-olympiades."),at:t-2*60000,r:{'🎯':6}}));
 for(const m of MARKETS){const r=room('m:'+m.id),L=MLINES[m.id]||[],ids=USER_IDS.slice().sort(()=>R()-.5);let k=0;
  L.forEach((txt,i)=>r.msgs.push(mkMsg({u:ids[k++],k:'msg',text:txt,at:t-(14-i*2)*60000,r:i===0?{'🔥':Math.round(3+R()*14)}:{}})));
  const bu=ids[k++],bs=m.p>50?'oui':'non';r.msgs.push(mkMsg({u:bu,k:'bet',text:'',bet:{m:m.id,s:bs,amt:pick([150,300,500,800]),price:Math.round(bs==='oui'?m.p-2:100-m.p-2)},followers:Math.round(R()*30),at:t-3*60000}));
  r.msgs.push(mkMsg({u:ids[k++],k:'msg',text:fillT(pick(GEN_LINES),m),at:t-60000}));}
 room('vip');
}

/* ===================== Moteurs « en direct » ===================== */
function weighted(){let tot=0;for(const m of MARKETS)tot+=m.heat;let x=R()*tot;for(const m of MARKETS){x-=m.heat;if(x<=0)return m;}return MARKETS[0];}
function curMarket(){const h=S.ui.route||'';return h.startsWith('marche-')?MK[h.slice(7)]:null;}
function addBet(m,b){m.bets.push(b);if(m.bets.length>420)m.bets.shift();trailPush(m.id,b);}
function botBet(){const cur=curMarket();const m=cur&&R()<.4?cur:weighted();const po=clamp(.5+(m.anchor-m.p)*.05,.12,.88);const s=R()<po?1:0;const a=Math.pow(R(),2.3);addBet(m,{s,a,me:0});const old=m.p;m.p=clamp(m.p+(s?1:-1)*(.04+a*.5),3,97);m.vol+=Math.round(30+a*2800);if(R()<.3)m.people++;updateMarket(m,old);}
function driftAnchors(){for(const m of MARKETS)m.anchor=clamp(m.anchor+(R()-.5)*1.4,5,95);}
function pickUser(not){let u;do{u=pick(USER_IDS);}while(u===not);return u;}
let lastSpeaker={};
function botChat(){const cur=curMarket();let rid;const x=R();
 if(cur&&x<.45)rid='m:'+cur.id;else if(x<.72)rid='general';else rid='m:'+weighted().id;
 const u=pickUser(lastSpeaker[rid]);lastSpeaker[rid]=u;const k=R();
 if(rid==='general'){
  if(k<.12)botRankUp();
  else if(k<.32)botBetCard('general',weighted(),u);
  else addMsg('general',mkMsg({u,k:'msg',text:fillT(pick(GLOBAL_LINES))}));
 }else{const m=MK[rid.slice(2)];if(k<.28)botBetCard(rid,m,u);else addMsg(rid,mkMsg({u,k:'msg',text:fillT(pick((MLINES[m.id]||[]).concat(GEN_LINES)),m)}));}
}
function botBetCard(rid,m,u){const s=R()<clamp(.5+(m.anchor-m.p)*.05+(m.p-50)/150,.2,.8)?'oui':'non';const amt=pick([50,80,120,200,300,500,750,1200]);const price=Math.round(s==='oui'?m.p:100-m.p);
 addMsg(rid,mkMsg({u,k:'bet',text:pick(['',_t("Je suis dedans."),_t("Allez."),_t("Petite entrée."),_t("Je charge."),_t("Gros pari ce soir.")]),bet:{m:m.id,s,amt,price},followers:0}));
 addBet(m,{s:s==='oui'?1:0,a:Math.min(1,amt/1300),me:0});const old=m.p;m.p=clamp(m.p+(s==='oui'?1:-1)*Math.min(1.6,amt/700),3,97);m.vol+=amt;updateMarket(m,old);if(u&&u!=='me')copyFire(u,m,s,amt);}
function botRankUp(){const ids=USER_IDS.filter(u=>userOf(u).t<8);const u=pick(ids),U=userOf(u);if(U.d<2&&U.t<8)U.d++;else{U.t=Math.min(8,U.t+1);U.d=0;}
 addMsg('general',mkMsg({k:'evt',text:`${_t("{0} vient de passer {1}",[U.n,rankName(U.t,U.d)])}`,rt:U.t,rd:U.d}));}
function botReact(){const pool=[];for(const id of ['general',...MARKETS.map(m=>'m:'+m.id)]){const r=S.rooms[id];if(!r)continue;r.msgs.slice(-8).forEach(x=>{if(x.k==='msg'||x.k==='bet'||x.k==='ana')pool.push(x);});}
 const mine=pool.filter(x=>x.u==='me');const x=mine.length&&R()<.35?pick(mine):pick(pool);if(!x)return;const e=x.k==='bet'?pick(['🔥','💸']):pick(['🔥','👀','💸','🎯']);x.r[e]=(x.r[e]||0)+1;refreshReacts(x);
 if(x.k==='bet'&&x.u!=='me'&&R()<.6){x.followers++;setFc(x);}
 if(x.u==='me'&&R()<.5){const u=pickUser();toast({icon:'smile',title:`${_t("{0} a réagi {1} à ton message",[userOf(u).n,e])}`,text:'+1 XP',href:''});gainXP(1);}}
let burstOn=false;
function burst(){if(burstOn)return;burstOn=true;const cur=curMarket();const m=cur&&R()<.5?cur:weighted();const side=R()<.6?(m.p>50?'oui':'non'):(m.p>50?'non':'oui');const n=10+Math.floor(R()*10);const from=m.p;let i=0;
 const iv=setInterval(()=>{addBet(m,{s:side==='oui'?1:0,a:.25+R()*.75,me:0});const old=m.p;m.p=clamp(m.p+(side==='oui'?1:-1)*(.22+R()*.3),3,97);m.anchor=clamp(m.anchor+(side==='oui'?1:-1)*.2,5,95);m.vol+=600+R()*3000;m.people+=R()<.5?1:0;updateMarket(m,old);
  if(++i>=n){clearInterval(iv);burstOn=false;const ppl=40+Math.floor(R()*80);m.hotUntil=now()+90000;const sig={m:m.id,s:side,n:ppl,mins:5,from:Math.round(from),to:Math.round(m.p)};
   addMsg('general',mkMsg({k:'sig',sig}));addMsg('m:'+m.id,mkMsg({k:'sig',sig}));markHot(m);
   const watched=S.me.watch.includes(m.id)||S.me.positions.some(p=>p.m===m.id);
   toast({tone:side==='oui'?'blue':'amber',icon:'flame',title:_t("Signal de foule"),text:`${_t("{0} personnes sur {1} : {2}",[ppl,side==='oui'?_t("Oui"):_t("Non"),m.short])}`,href:'#marche-'+m.id});
   if(watched)notif('flame',`${_t("Signal de foule sur {0} : de {1} % à {2} %.",[m.short,sig.from,sig.to])}`,'#marche-'+m.id);}},170);}

/* ----- Progression du joueur ----- */
/* En mode serveur, l'XP, les missions, les badges et les notifications sont attribués par le serveur : ces aides ne font
   rien, et l'affichage vient de sa réponse (srvAppliquer dans serveur.js). */
function gainXP(n,ev){if(!n||SRV())return;const before=myRank();S.me.xp+=n;floatXP('+'+n+' XP',ev);updateHeader();checkRank(before);refreshRankBits();save();}
function checkRank(before){if(SRV())return;const after=myRank();if(after.t>before.t||(after.t===before.t&&after.d>before.d)){setTimeout(()=>rankUp(after),450);notif('trophy',`${_t("Tu passes {0}.",[rankName(after.t,after.d)])}`,'#rang');checkBadges();return;}
 const nx=nextStep(after);if(nx&&nx.tier&&S.me.xp>=nx.xp){const miss=conds(nx.t).filter(c=>!c.ok&&c.k!=='xp');const key=nx.t+':'+miss.map(c=>c.k).join(',');if(miss.length&&S.me.blockedShown!==key){S.me.blockedShown=key;toast({tone:'amber',icon:'lock',title:`${_t("XP suffisante pour {0}",[rankName(nx.t,0)])}`,text:_t("Il te manque : ")+miss.map(c=>c.label.toLowerCase()).join(', ')+'.',href:'#rang',dur:7000});notif('lock',`${_t("Pour passer {0}, il te manque : {1}.",[rankName(nx.t,0),miss.map(c=>c.label.toLowerCase()).join(', ')])}`,'#rang');}}}
function mission(type,n=1){if(SRV())return;let ch=false;for(const m of S.me.missions){if(m.type!==type||m.claimed||m.have>=m.goal)continue;m.have=Math.min(m.goal,m.have+n);ch=true;if(m.have>=m.goal){toast({tone:'blue',icon:'gift',title:_t("Mission terminée"),text:`${_t("{0} : récupère tes {1} XP.",[m.label,m.xp])}`,href:'#rang'});notif('gift',`${_t("Mission terminée : {0}. Récupère tes {1} XP.",[m.label,m.xp])}`,'#rang');}}if(ch){refreshRankBits();save();}}
const BADGES=[{id:'first',n:_t("Premier pari"),ic:'check',ok:me=>me.played>=1,how:_t("Place ton premier pari.")},{id:'streak7',n:_t("Série de 7 jours"),ic:'flame',ok:me=>me.bestStreak>=7,how:_t("Joue 7 jours d’affilée.")},{id:'contra',n:_t("Contre la foule"),ic:'down',ok:me=>(me.contraWins||0)>=1,how:_t("Gagne un pari pris contre 70 % des joueurs.")},{id:'voice',n:_t("Voix du live chat"),ic:'chat',ok:me=>me.msgsTotal>=50,how:_t("Écris 50 messages dans les chats.")},{id:'dep',n:_t("Premier dépôt"),ic:'wallet',ok:me=>me.deposits>=1,how:_t("Fais ton premier dépôt.")},{id:'flash3',n:_t("Triplé éclair"),ic:'bolt',ok:me=>me.flashWins>=3,how:_t("Gagne 3 manches au marché éclair.")},{id:'fol25',n:_t("Suivi par 25"),ic:'users',ok:me=>me.followed>=25,how:_t("25 mises suivies par d’autres joueurs.")},{id:'clanfounder',n:_t("Fondateur de clan"),ic:'shield',ok:me=>!!me.clanCreated,how:_t("Crée ton clan.")},{id:'clanweek',n:_t("Champion de clan"),ic:'trophy',ok:me=>(me.weekChamp||0)>=1,how:_t("Termine premier du classement de la semaine de ton clan.")},{id:'whale',n:_t("Grosse mise"),ic:'target',ok:me=>me.maxBet>=500,how:_t("Place un pari de 500 $ ou plus.")}];
function checkBadges(silent){if(SRV())return;for(const b of BADGES){if(b.ok(S.me)&&!S.me.badges.includes(b.id)){S.me.badges.push(b.id);if(!silent){toast({tone:'blue',icon:'star',title:_t("Badge débloqué"),text:b.n,href:'#profil'});notif('star',`${_t("Badge débloqué : {0}.",[b.n])}`,'#profil');}}}}
function notif(icon,text,href){if(SRV())return;S.me.notifs.unshift({id:now()+R(),ic:icon,text,href,at:now(),read:false});S.me.notifs=S.me.notifs.slice(0,30);updateBell();save();}
function posValue(p){const m=MK[p.m],pr=p.s==='oui'?m.p:100-m.p;return p.sh*pr/100;}
function posPnl(p){const m=MK[p.m],pr=p.s==='oui'?m.p:100-m.p;return p.sh*(pr-p.avg)/100;}
/* gain réel si on vendait tout maintenant : on mange le carnet, donc c'est un peu moins que le prix milieu */
function liqPnl(p){const m=MK[p.m];return liqValue(m,p.s,p.sh)-p.sh*p.avg/100;}
function portfolio(){let v=0,u=0;for(const p of S.me.positions){v+=posValue(p);u+=posPnl(p);}return {value:v,unreal:u,profit:S.me.realized+u};}

/* ----- Adresses et QR de dépôt (fictifs) ----- */
function addrFor(coin,net){const r=rng(hash(coin+net+S.me.n));const g=(al,n)=>Array.from({length:n},()=>al[Math.floor(r()*al.length)]).join('');const b58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',b32='023456789acdefghjklmnpqrstuvwxyz';const f=NETS[net].fmt;
 if(f==='evm')return '0x'+g('0123456789abcdefABCDEF',40);if(f==='sol')return g(b58,44);if(f==='tron')return 'T'+g(b58,33);if(f==='btc')return 'bc1q'+g(b32,38);return 'lnbc1'+g(b32,58);}
const grp=a=>a.replace(/(.{4})/g,'$1 ').trim();
function qrSVG(text){const n=25,m=6,r=rng(hash(text));let d='';const fin=(x,y)=>(x<8&&y<8)||(x>=n-8&&y<8)||(x<8&&y>=n-8);for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(fin(x,y))continue;if(r()<.5)d+=`M${x*m} ${y*m}h${m}v${m}h-${m}z`;}let f='';for(const [fx,fy] of [[0,0],[n-7,0],[0,n-7]]){const X=fx*m,Y=fy*m;f+=`<rect x="${X+m/2}" y="${Y+m/2}" width="${6*m}" height="${6*m}" fill="none" stroke="#14161B" stroke-width="${m}"/><rect x="${X+2*m}" y="${Y+2*m}" width="${3*m}" height="${3*m}" fill="#14161B"/>`;}return `<svg viewBox="0 0 ${n*m} ${n*m}" shape-rendering="crispEdges" aria-label="${_t("QR code de l’adresse")}"><path d="${d}" fill="#14161B"/>${f}</svg>`;}
const ADDR_RE={evm:/^0x[0-9a-fA-F]{40}$/,sol:/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,tron:/^T[1-9A-HJ-NP-Za-km-z]{33}$/,btc:/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,ln:/^ln[a-z0-9]{20,}$/};

/* Fichiers générés (image, Excel, PDF) : dans la visionneuse d'artefacts Claude, l'enregistrement passe par window.claude ;
 * ailleurs (wimoro.com), partage natif ou lien de téléchargement classique. Renvoie true (enregistré), false (refusé) ou null (non disponible ici). */
async function hostSave(file){try{if(window.claude&&typeof window.claude.use==='function'){const d=await window.claude.use('downloads');if(d){await d.save({filename:file.name,data:file});return true;}}}catch(e){if(e&&(e.code==='declined'||e.code==='rate_limited'))return false;}return null;}

