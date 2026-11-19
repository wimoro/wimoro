/* WIMORO — passerelle vers le back */

'use strict';
/* =====================================================================================
 *  Passerelle unique vers le back (Supabase)
 *  ------------------------------------------------------------------------------------
 *  C'est le SEUL fichier qui touche le client Supabase. Le reste de l'application :
 *   - lit le mode avec SRV() : false = local (visiteur ou compte démo : rien ne sort du navigateur),
 *     true = serveur (session Supabase valide : le serveur fait autorité) ;
 *   - appelle des fonctions nommées : API.loadState(), API.signIn(), API.call('api_…', {…}) ;
 *   - écoute des événements : API.on('recuperation', …), API.on('marches', …).
 *
 *  Le mode est décidé UNE fois, avant le premier rendu (API.pret). Changer de mode recharge la page :
 *  on repart toujours d'un état propre, jamais d'un mélange de deux comptes.
 *
 *  Sans session enregistrée, la bibliothèque Supabase n'est même pas chargée : le mode Démo ne dépend
 *  d'aucun service extérieur. Elle se charge à la demande (connexion, inscription, mot de passe oublié).
 *
 *  Les erreurs sont toujours des objets { code, message } : `code` est un identifiant stable
 *  (« insufficient_balance », « reseau », « session »…) que l'interface traduit (voir errTxt dans serveur.js).
 * ===================================================================================== */
const API=(()=>{
 const REF='brmwvxncyeypefsgiepf',BACK='https://'+REF+'.supabase.co';
 const CLE='sb_publishable_iw7LMAYTnX_ETs-mj9sIPQ_pnSdgOd2';                 /* clé publique (publishable) : sans danger dans le code client */
 const LIB='js/vendor/supabase-2.118.0.min.js';                              /* version figée, servie par le site lui-même */
 const CLE_SESSION='wimoro-auth',ANCIENNE_CLE='sb-'+REF+'-auth-token',DELAI=3000;
 let sb=null,uid=null,email='',mode='local',libP=null,decide=false;
 const H={},canaux={};
 const err=(code,cause)=>{const e=new Error(code);e.code=code;e.cause=cause||null;return e;};
 const on=(evt,fn)=>{(H[evt]=H[evt]||[]).push(fn);return ()=>{H[evt]=(H[evt]||[]).filter(x=>x!==fn);};};
 const emit=(evt,d)=>{(H[evt]||[]).slice().forEach(fn=>{try{fn(d);}catch(e){console.error('[api] écouteur',evt,e);}});};
 const delai=(p,ms)=>Promise.race([p,new Promise((_,ko)=>setTimeout(()=>ko(err('delai')),ms))]);
 const ls=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
 const sessionEnregistree=()=>!!ls(CLE_SESSION)||!!ls(ANCIENNE_CLE);
 /* retour d'un lien envoyé par e-mail (confirmation, mot de passe oublié) : les jetons arrivent dans le hash */
 const retourLien=()=>/[#&](access_token|refresh_token|error_description)=/.test(location.hash)||/[#&]type=recovery/.test(location.hash);

 /* ----- Bibliothèque : chargée une seule fois, à la demande ----- */
 function lib(){
  if(libP)return libP;
  libP=new Promise((ok,ko)=>{
   if(window.supabase&&window.supabase.createClient){ok();return;}
   const s=document.createElement('script');s.src=LIB;s.async=true;s.onload=()=>ok();s.onerror=()=>ko(err('reseau'));document.head.appendChild(s);
  }).then(()=>{
   /* une session ouverte avec l'ancienne version du site est reprise telle quelle */
   try{if(!ls(CLE_SESSION)&&ls(ANCIENNE_CLE)){localStorage.setItem(CLE_SESSION,ls(ANCIENNE_CLE));localStorage.removeItem(ANCIENNE_CLE);}}catch(e){}
   sb=window.supabase.createClient(BACK,CLE,{auth:{storageKey:CLE_SESSION,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   sb.auth.onAuthStateChange((ev,s)=>{
    if(ev==='PASSWORD_RECOVERY'){emit('recuperation',{});return;}
    if(!decide)return;
    /* la session a changé ailleurs (autre onglet, jeton révoqué) : on repart d'un état propre */
    const id=s&&s.user?s.user.id:null;
    if((ev==='SIGNED_OUT'&&mode==='serveur')||(ev==='SIGNED_IN'&&id&&id!==uid&&!API._interne))emit('session',{ev,uid:id});
   });
  });
  libP.catch(()=>{libP=null;});
  return libP;
 }

 /* ----- Mode : résolu une fois, avant le premier rendu ----- */
 const pret=(async()=>{
  if(sessionEnregistree()||retourLien()){
   try{
    await delai(lib(),DELAI);
    const r=await delai(sb.auth.getSession(),DELAI);
    const s=r&&r.data?r.data.session:null;
    if(s&&s.user){uid=s.user.id;email=s.user.email||'';mode='serveur';}
   }catch(e){console.warn('[api] session indisponible, démarrage en mode local',e&&e.code||e);}
  }
  decide=true;
  return mode;
 })();

 /* ----- Appels ----- */
 function codeDe(e){
  if(!e)return 'serveur';
  const m=String(e.message||''),c=String(e.code||'');
  if(/^[a-z][a-z0-9_]{2,40}$/.test(m))return m;                                   /* code métier levé par une fonction SQL */
  if(c==='PGRST301'||c==='401'||/JWT|not authenticated/i.test(m))return 'session';
  if(/Failed to fetch|NetworkError|Load failed|network/i.test(m))return 'reseau';
  if(c==='42501')return 'interdit';
  return 'serveur';
 }
 async function call(nom,args){
  await lib();
  let r;try{r=await sb.rpc(nom,args||{});}catch(e){throw err('reseau',e);}
  if(r.error)throw err(codeDe(r.error),r.error);
  return r.data;
 }
 async function fn(nom,corps){
  await lib();
  let r;try{r=await sb.functions.invoke(nom,{body:corps||{}});}catch(e){throw err('reseau',e);}
  if(r.error){let c='serveur';try{const j=await r.error.context.json();if(j&&j.code)c=j.code;}catch(e){}throw err(c,r.error);}
  if(r.data&&r.data.code&&r.data.ok===false)throw err(r.data.code);
  return r.data;
 }

 /* ----- Comptes ----- */
 const authErr=e=>{const m=String(e&&e.message||''),c=String(e&&e.code||'');
  if(/invalid login credentials/i.test(m)||c==='invalid_credentials')return 'identifiants';
  if(/already registered|already been registered/i.test(m)||c==='user_already_exists')return 'email_pris';
  if(/email not confirmed/i.test(m)||c==='email_not_confirmed')return 'email_non_confirme';
  if(/rate limit|too many/i.test(m)||c==='over_request_rate_limit'||c==='over_email_send_rate_limit')return 'trop_de_tentatives';
  if(/token has expired|invalid.*token|otp/i.test(m)||c==='otp_expired')return 'code_invalide';
  if(/password/i.test(m)&&/(least|weak|short)/i.test(m))return 'mot_de_passe_faible';
  if(/same.*password|different from the old/i.test(m)||c==='same_password')return 'meme_mot_de_passe';
  if(/signups? not allowed|disabled/i.test(m))return 'inscriptions_fermees';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))return 'reseau';
  return 'serveur';};
 /* identifiant = e-mail ou pseudo. Par pseudo, la résolution se fait côté serveur : aucun e-mail n'est exposé. */
 async function signIn(identifiant,motDePasse){
  await lib();API._interne=true;
  try{
   if(identifiant.indexOf('@')>=0){
    const r=await sb.auth.signInWithPassword({email:identifiant.toLowerCase(),password:motDePasse});
    if(r.error)throw err(authErr(r.error),r.error);
   }else{
    const d=await fn('connexion',{pseudo:identifiant,mot_de_passe:motDePasse});
    const r=await sb.auth.setSession({access_token:d.access_token,refresh_token:d.refresh_token});
    if(r.error)throw err(authErr(r.error),r.error);
   }
  }finally{API._interne=false;}
 }
 /* Renvoie 'connecte' (session ouverte) ou 'confirmer' (un e-mail de confirmation a été envoyé). */
 async function signUp(o){
  await lib();API._interne=true;
  try{
   const r=await sb.auth.signUp({email:o.email.toLowerCase(),password:o.motDePasse,options:{data:{username:o.pseudo,ref:o.ref||'',lang:o.lang||''},emailRedirectTo:location.origin+location.pathname}});
   if(r.error)throw err(authErr(r.error),r.error);
   /* e-mail déjà inscrit et confirmation active : Supabase répond sans erreur, avec un utilisateur sans identité */
   if(r.data&&r.data.user&&!r.data.session&&r.data.user.identities&&r.data.user.identities.length===0)throw err('email_pris');
   return r.data&&r.data.session?'connecte':'confirmer';
  }finally{API._interne=false;}
 }
 async function resendConfirmation(adresse){await lib();const r=await sb.auth.resend({type:'signup',email:adresse.toLowerCase(),options:{emailRedirectTo:location.origin+location.pathname}});if(r.error)throw err(authErr(r.error),r.error);}
 async function signOut(){if(!sb&&!sessionEnregistree())return;try{await lib();API._interne=true;await delai(sb.auth.signOut(),DELAI);}catch(e){}finally{API._interne=false;try{localStorage.removeItem(CLE_SESSION);}catch(e){}}}
 /* Mot de passe oublié : un code à 6 chiffres part par e-mail, puis verifyOtp ouvre la session et updateUser change le mot de passe. */
 async function resetRequest(adresse){await lib();const r=await sb.auth.resetPasswordForEmail(adresse.toLowerCase(),{redirectTo:location.origin+location.pathname});if(r.error)throw err(authErr(r.error),r.error);}
 async function resetConfirm(adresse,code,nouveau){
  await lib();API._interne=true;
  try{
   const r=await sb.auth.verifyOtp({email:adresse.toLowerCase(),token:code,type:'recovery'});
   if(r.error)throw err(authErr(r.error),r.error);
   const u=await sb.auth.updateUser({password:nouveau});
   if(u.error)throw err(authErr(u.error),u.error);
  }finally{API._interne=false;}
 }
 /* après un lien de récupération (événement « recuperation ») ou depuis le profil */
 async function updatePassword(nouveau){await lib();const u=await sb.auth.updateUser({password:nouveau});if(u.error)throw err(authErr(u.error),u.error);}

 /* ----- Double authentification de l'équipe (code à six chiffres d'une application, facteur TOTP de Supabase Auth) -----
    Une session validée par le code passe au niveau aal2 ; le serveur l'exige des membres qui ont enrôlé un code
    (réponse « mfa_requise »). La connexion des joueurs n'est pas touchée. */
 const mfaErr=e=>{const m=String(e&&e.message||''),c=String(e&&e.code||'');
  if(c==='mfa_verification_failed'||c==='mfa_challenge_expired'||/invalid totp|code.*(invalid|expired)|challenge.*expired/i.test(m))return 'code_invalide';
  if(c==='mfa_factor_name_conflict'||/friendly name/i.test(m))return 'mfa_nom_pris';
  if(c==='mfa_verification_rejected'||/too many/i.test(m)||c==='over_request_rate_limit')return 'trop_de_tentatives';
  if(c==='insufficient_aal')return 'mfa_requise';
  return authErr(e);};
 const mfa=async(fn,args)=>{await lib();let r;try{r=await sb.auth.mfa[fn](args);}catch(e){throw err('reseau',e);}if(r.error)throw err(mfaErr(r.error),r.error);return r.data;};
 /* facteurs du compte : all (vérifiés ou non), totp (vérifiés seulement) */
 const mfaFacteurs=()=>mfa('listFactors');
 /* niveau de la session : currentLevel (aal1 ou aal2) et nextLevel (aal2 dès qu'un code est vérifié) */
 const mfaNiveau=()=>mfa('getAuthenticatorAssuranceLevel');
 /* nouveau code : l'image du QR code (SVG en data URL, réencodée pour une balise img), la clé à saisir à la main et l'adresse otpauth */
 async function mfaEnroler(nom){const d=await mfa('enroll',{factorType:'totp',friendlyName:nom||undefined});const t=d.totp||{};let qr=String(t.qr_code||'');
  const brut=qr.match(/^data:image\/svg\+xml;utf-8,([\s\S]*)$/);if(brut)qr='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(brut[1]);
  return {id:d.id,qr,secret:t.secret||'',uri:t.uri||''};}
 const mfaDefi=id=>mfa('challenge',{factorId:id}).then(d=>d.id);
 /* vérifie le code : la session passe au niveau aal2 (le client garde la nouvelle session) */
 async function mfaVerifier(id,defi,code){await mfa('verify',{factorId:id,challengeId:defi||await mfaDefi(id),code:String(code||'').replace(/\D/g,'')});return true;}
 /* retire un facteur (un enrôlement abandonné, jamais vérifié, gênerait le suivant) */
 const mfaRetirer=id=>mfa('unenroll',{factorId:id});

 /* ----- Lectures publiques, ouvertes aux visiteurs : api_site(), api_live(), api_fixations() -----
    Avec une session, par le client ; sans session, par une lecture REST directe avec la clé publique (en-tête apikey
    seul), sans charger la bibliothèque : un visiteur ne dépend toujours d'aucun service extérieur pour s'afficher. */
 async function lecture(nom,args,rest){
  if(sb&&!rest)return call(nom,args);                                       /* rest : toujours la lecture REST, même avec une session */
  let r;try{r=await delai(fetch(BACK+'/rest/v1/rpc/'+nom,{method:'POST',headers:{apikey:CLE,'Content-Type':'application/json'},body:JSON.stringify(args||{}),cache:'no-store'}),DELAI);}
  catch(e){throw err(e&&e.code==='delai'?'delai':'reseau',e);}
  if(!r.ok)throw err('serveur');
  return r.json();
 }
 /* réglages publics du site, annonce, maintenance */
 const site=()=>lecture('api_site');
 /* données vivantes (partie D), dans tous les modes par la lecture REST (publiques, sans session) : les cours, et la courbe
    des 90 dernières secondes d'un actif (serie) */
 const live=serie=>lecture('api_live',serie?{p_serie:serie}:{},true);
 /* pari éclair à cours réels : les modes figés et les fixations d'un jeu, manches de à a (défaut : les 12 dernières) */
 const fixations=(jeu,de,a)=>lecture('api_fixations',Object.assign({p_jeu:jeu},de!=null?{p_de:de}:{},a!=null?{p_a:a}:{}),true);

 /* ----- Temps réel : diffusion par sujet. On ne s'abonne qu'à ce qui est à l'écran. ----- */
 async function subscribe(sujet,fnc,prive){
  await lib();if(canaux[sujet])return;
  if(prive&&sb.realtime&&sb.realtime.setAuth){try{await sb.realtime.setAuth();}catch(e){}}   /* un sujet privé exige le jeton du joueur */
  const c=sb.channel(sujet,{config:{private:!!prive}});
  c.on('broadcast',{event:'*'},m=>{try{fnc(m.event,m.payload||{});}catch(e){console.error('[api] sujet',sujet,e);}});
  canaux[sujet]=c;c.subscribe();
 }
 function unsubscribe(sujet){const c=canaux[sujet];if(!c)return;delete canaux[sujet];try{sb.removeChannel(c);}catch(e){}}

 return {
  pret,on,emit,call,fn,
  get mode(){return mode;},get uid(){return uid;},get email(){return email;},
  signIn,signUp,signOut,resendConfirmation,resetRequest,resetConfirm,updatePassword,
  mfaFacteurs,mfaNiveau,mfaEnroler,mfaDefi,mfaVerifier,mfaRetirer,site,live,fixations,
  subscribe,unsubscribe,topics:()=>Object.keys(canaux),
  /* État complet du joueur (profil, solde, positions, historique, notifications, préférences…) */
  loadState:()=>call('api_state'),
  _interne:false
 };
})();
/* Interrupteur de mode, lu partout : vrai si le serveur fait autorité. Ne change jamais après le démarrage. */
const SRV=()=>API.mode==='serveur';
