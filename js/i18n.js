/* WIMORO — i18n module */

'use strict';
/* =====================================================================================
 *  Langues : anglais (par défaut), français, hébreu (écriture de droite à gauche)
 *  ------------------------------------------------------------------------------------
 *  Le code source est écrit en français : chaque texte passe par t('texte français', [args]).
 *  Les catalogues I18N.en et I18N.he traduisent ces clés ; une clé absente s'affiche en français.
 *  Les textes peuvent contenir des blocs au format ICU :
 *     {0}                                   l'argument n° 0
 *     {0, plural, one{# pari} other{# paris}} pluriel selon la langue (# = la valeur)
 *     {0, select, oui{Oui} non{Non} other{…}}  variante selon la valeur
 *  Changer de langue enregistre le choix et recharge la page (toutes les données sont recréées).
 * ===================================================================================== */
const LANGS={en:{n:'English',dir:'ltr',loc:'en-US',short:'EN'},fr:{n:'Français',dir:'ltr',loc:'fr-FR',short:'FR'},he:{n:'עברית',dir:'rtl',loc:'he-IL',short:'HE'}};
const LANG=(()=>{try{const l=localStorage.getItem('wimoro-lang');if(l&&LANGS[l])return l;}catch(e){}return 'en';})();
const LOC=LANGS[LANG].loc,RTL=LANGS[LANG].dir==='rtl';
document.documentElement.lang=LANG;document.documentElement.dir=LANGS[LANG].dir;
const I18N={en:{},he:{}};
/* Les fichiers lang_*.js ajoutent leurs entrées ici ; les clés sont normalisées (espaces insécables → espaces). */
function I18N_ADD(lang,obj){const cat=I18N[lang];for(const k in obj)cat[k.replace(/[\u00a0\u202f]/g,' ')]=obj[k];}
function setLang(l){if(!LANGS[l]||l===LANG)return;try{localStorage.setItem('wimoro-lang',l);}catch(e){}location.reload();}

/* ---------- Pluriels ---------- */
function plCat(n){n=Math.abs(n);if(LANG==='fr')return n<=1?'one':'other';if(LANG==='he')return n===1?'one':n===2?'two':'other';return n===1?'one':'other';}
/* Lit un nombre tel qu'il est affiché ou saisi dans la langue courante (« 1 000,50 », « 1,000.50 »). */
function numOf(v){if(typeof v==='number')return v;let s=String(v).replace(/[\u2066-\u2069\s\u00a0\u202f]/g,'');
 /* Tolérance : « 12.5 » en français ou « 12,5 » en anglais sont lus comme des décimales (un seul séparateur, pas un groupe de trois chiffres). */
 if(LANG==='fr'){if(s.indexOf(',')<0&&(s.match(/\./g)||[]).length===1&&!/\.\d{3}$/.test(s))s=s.replace('.',',');s=s.replace(/\./g,'').replace(',','.');}
 else{if(s.indexOf('.')<0&&(s.match(/,/g)||[]).length===1&&!/,\d{3}$/.test(s))s=s.replace(',','.');s=s.replace(/,/g,'');}
 const m=s.match(/-?\d+(?:\.\d+)?/);return m?parseFloat(m[0]):NaN;}

/* ---------- Traduction ---------- */
const I18N_MISSING=new Set();
/* Les catalogues sont indexés avec des espaces simples ; le code source contient parfois des espaces insécables. */
const nkey=k=>(k.indexOf('\u00a0')<0&&k.indexOf('\u202f')<0)?k:k.replace(/[\u00a0\u202f]/g,' ');
function _t(key,args){
 const cat=I18N[LANG];let s=cat?cat[nkey(key)]:undefined;
 if(s===undefined){s=key;if(cat&&LANG!=='fr')I18N_MISSING.add(nkey(key));}
 if(s.indexOf('{')<0)return s;
 return icu(s,args||[]);
}
/* Même mot français, deux sens : _tc('Retirer','ami') cherche d'abord la clé « Retirer [ami] » du catalogue. */
function _tc(key,ctx,args){const cat=I18N[LANG],s=cat?cat[nkey(key)+' ['+ctx+']']:undefined;if(s===undefined)return _t(key,args);return s.indexOf('{')<0?s:icu(s,args||[]);}
/* Ordinaux : 1er/2e en français, 1st/2nd en anglais, nombre seul en hébreu. */
function ordinal(n){const v=Math.abs(Math.round(n));if(LANG==='en'){const m10=v%10,m100=v%100;return v+(m10===1&&m100!==11?'st':m10===2&&m100!==12?'nd':m10===3&&m100!==13?'rd':'th');}if(LANG==='fr')return v+(v===1?'er':'e');return String(v);}
/* Interprète les blocs {…} d'une chaîne traduite. */
function icu(s,args){
 let out='',i=0;
 while(i<s.length){
  const c=s[i];
  if(c!=='{'){out+=c;i++;continue;}
  let depth=0,j=i;
  for(;j<s.length;j++){if(s[j]==='{')depth++;else if(s[j]==='}'){depth--;if(depth===0)break;}}
  if(j>=s.length){out+=s.slice(i);break;}
  const body=s.slice(i+1,j);i=j+1;
  const m=body.match(/^\s*(\d+)\s*(?:,\s*(plural|select|ordinal)\s*,?([\s\S]*))?$/);
  if(!m){out+='{'+body+'}';continue;}
  const a=args[+m[1]];
  if(!m[2]){out+=a===undefined||a===null?'':String(a);continue;}
  if(m[2]==='ordinal'){const n=numOf(a);out+=isNaN(n)?String(a):ordinal(n);continue;}
  const opts=icuOpts(m[3]);let pickd;
  if(m[2]==='plural'){const n=numOf(a);pickd=opts['='+n]!==undefined?opts['='+n]:opts[plCat(isNaN(n)?0:n)]!==undefined?opts[plCat(isNaN(n)?0:n)]:opts.other;}
  else{const k=a===undefined||a===null?'':String(a);pickd=opts[k]!==undefined?opts[k]:opts.other;}
  if(pickd===undefined)pickd='';
  out+=icu(pickd.replace(/#/g,()=>a===undefined||a===null?'':String(a)),args);
 }
 return out;
}
function icuOpts(src){const o={};let i=0;while(i<src.length){while(i<src.length&&/\s/.test(src[i]))i++;let k='';while(i<src.length&&src[i]!=='{'&&!/\s/.test(src[i])){k+=src[i];i++;}while(i<src.length&&/\s/.test(src[i]))i++;if(src[i]!=='{')break;let d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}o[k]=src.slice(i+1,j);i=j+1;}return o;}

/* ---------- Textes statiques de la page (en-tête, barre d'onglets, description) ----------
   Le HTML de départ est écrit dans la langue par défaut (anglais). Chaque texte y porte sa clé française :
   data-i18n pour le contenu d'un élément, data-i18n-<attribut> pour un attribut (aria-label, title, placeholder, content).
   Appelée dès que les catalogues sont chargés (index.html), puis au démarrage : le résultat est le même à chaque appel.
   La classe « tr » posée sur <html> lève le masquage des libellés pour les langues autres que l'anglais (css/base.css). */
const I18N_ATTRS=['placeholder','aria-label','title','alt','content'];
function i18nStatic(root){
 if(!root)return;
 for(const el of root.querySelectorAll('[data-i18n]'))el.textContent=_t(el.getAttribute('data-i18n'));
 for(const at of I18N_ATTRS)for(const el of root.querySelectorAll('[data-i18n-'+at+']'))el.setAttribute(at,plain(_t(el.getAttribute('data-i18n-'+at))));
 document.documentElement.classList.add('tr');
}
/* Les nombres restent lisibles de gauche à droite dans un texte hébreu. */
const bidi=s=>RTL?'⁦'+s+'⁩':s;
const plain=s=>String(s).replace(/[⁦-⁩]/g,'');

