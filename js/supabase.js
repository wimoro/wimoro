/* === WIMORO x SUPABASE === */
(function(){
if(typeof supabase==='undefined')return;
var sb=supabase.createClient('https://brmwvxncyeypefsgiepf.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJybXd2eG5jeWV5cGVmc2dpZXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzYwODAsImV4cCI6MjExMDE1MjA4MH0.-AA2WyzSOyJiK-Nwogbzv-Rowej9A3fWRDpAGSXI3YM');
window.__sb=sb;var uid=null;

/* --- LOAD: fetch user data from Supabase, apply to S.me, re-render --- */
function sbLoad(){
if(!uid)return Promise.resolve();
return Promise.all([
sb.from('user_full_state').select('state').eq('user_id',uid).maybeSingle(),
sb.from('users').select('*').eq('id',uid).maybeSingle(),
sb.from('user_stats').select('*').eq('user_id',uid).maybeSingle()
]).then(function(r){
var blob=r[0].data,user=r[1].data,st=r[2].data;
if(blob&&blob.state&&blob.state.v)Object.assign(S.me,blob.state);
if(user){S.me.n=user.username||S.me.n;S.me.email=user.email||S.me.email;S.me.photo=user.avatar_photo||S.me.photo;S.me.color=user.avatar_color||S.me.color;S.me.kyc=!!user.kyc_verified;}
if(st){S.me.balance=Number(st.balance);S.me.xp=st.xp||0;S.me.played=st.bets_placed||0;S.me.wins=st.bets_won||0;S.me.settled=st.bets_settled||0;S.me.deposits=st.deposits_count||0;S.me.flashWins=st.flash_wins||0;S.me.followed=st.followed_bets_count||0;S.me.realized=Number(st.profit_realized)||0;S.me.streak=st.streak_current||1;S.me.bestStreak=st.streak_best||1;S.me.copiers=st.copiers_count||0;S.me.msgsTotal=st.messages_total||0;S.me.contraWins=st.contra_wins||0;S.me.flashStreak=st.flash_streak_current||0;S.me.flashBest=st.flash_streak_best||0;S.me.flashProfit=Number(st.flash_profit_total)||0;S.me.followers=st.followers_count||0;}
S.me.logged=true;S.me.onboarded=true;
if(typeof updateHeader==='function')updateHeader();
if(typeof render==='function')render(false);
}).catch(function(e){console.warn('sbLoad error',e);});
}

/* --- SAVE: save blob to Supabase (positions, history, etc) --- */
function sbSave(){
if(!uid||!S.me.logged)return;
sb.from('user_full_state').upsert({user_id:uid,state:Object.assign({},S.me)}).catch(function(){});
sb.from('users').update({username:S.me.n||'',avatar_photo:S.me.photo||'',avatar_color:S.me.color||'#2448FF',bio:S.me.bio||''}).eq('id',uid).catch(function(){});
}

/* --- REFRESH: read latest stats from DB (admin changes) --- */
function sbRefresh(){
if(!uid||!S.me.logged)return;
sb.from('user_stats').select('*').eq('user_id',uid).maybeSingle().then(function(r){
if(!r.data)return;var st=r.data;
S.me.balance=Number(st.balance);S.me.xp=st.xp||0;S.me.played=st.bets_placed||0;S.me.wins=st.bets_won||0;S.me.settled=st.bets_settled||0;S.me.deposits=st.deposits_count||0;S.me.flashWins=st.flash_wins||0;S.me.followed=st.followed_bets_count||0;S.me.realized=Number(st.profit_realized)||0;S.me.streak=st.streak_current||1;S.me.bestStreak=st.streak_best||1;S.me.copiers=st.copiers_count||0;S.me.msgsTotal=st.messages_total||0;
if(typeof updateHeader==='function')updateHeader();
}).catch(function(){});
}

/* --- BOOT: check Supabase session on page load --- */
sb.auth.getSession().then(function(r){
if(r.data&&r.data.session){uid=r.data.session.user.id;sbLoad();}
else if(S.me.logged&&S.me.email){
sb.from('users').select('id').ilike('email',S.me.email).maybeSingle().then(function(u){
if(u.data){uid=u.data.id;sbLoad();}}).catch(function(){});}
}).catch(function(){});

/* --- AUTH STATE: react to login/logout --- */
sb.auth.onAuthStateChange(function(ev,sess){
if(ev==='SIGNED_IN'&&sess&&sess.user){uid=sess.user.id;sbLoad();}
if(ev==='SIGNED_OUT'){uid=null;}
});

/* --- OVERRIDE LOGIN: use Supabase Auth --- */
FORMS.login=function(f){
var raw=f.email.value.trim(),pw=f.pw.value,err=f.querySelector('[data-autherr]');
if(!raw||raw.length<3){err.textContent='Entre ton e-mail ou pseudo.';return;}
if(pw.length<8){err.textContent='8 caract\u00e8res minimum.';return;}
err.textContent='Connexion...';
var btn=f.querySelector('[type=submit]');if(btn)btn.disabled=true;
var em=raw.toLowerCase();
var p=em.includes('@')?Promise.resolve(em):sb.from('users').select('email').ilike('username',em).maybeSingle().then(function(r){return r.data?r.data.email:null;});
p.then(function(email){
if(!email){err.textContent='Aucun compte trouv\u00e9.';if(btn)btn.disabled=false;return;}
sb.auth.signInWithPassword({email:email,password:pw}).then(function(res){
if(res.error){err.textContent='E-mail ou mot de passe incorrect.';if(btn)btn.disabled=false;return;}
uid=res.data.user.id;
AUTH.set(email,{id:uid.slice(0,12),key:email,email:email,pseudo:raw,sbId:uid,ph:''});
enterAccount({id:uid.slice(0,12),key:email,email:email,pseudo:raw,sbId:uid});
sbLoad().then(function(){if(typeof doLogin==='function')doLogin();});
}).catch(function(){err.textContent='Erreur.';if(btn)btn.disabled=false;});
}).catch(function(){err.textContent='Erreur.';if(btn)btn.disabled=false;});
};

/* --- OVERRIDE SIGNUP: use Supabase Auth --- */
var _origCreate=window.createAccount;
window.createAccount=function(n,e,pw,x){
var rec=_origCreate(n,e,pw,x);
if(e&&pw){sb.auth.signUp({email:e.toLowerCase(),password:pw}).then(function(r){
if(r.data&&r.data.user){uid=r.data.user.id;rec.sbId=uid;
sb.from('users').insert({id:uid,username:n,email:e.toLowerCase(),avatar_photo:'',avatar_color:'#2448FF',bio:'',onboarded:true,welcomed:true,is_demo:false}).catch(function(){});}
}).catch(function(){});}
return rec;
};

/* --- OVERRIDE LOGOUT --- */
var _origLogout=window.logout;
window.logout=function(){
  /* Sign out from Supabase first */
  uid=null;
  try{sb.auth.signOut();}catch(e){}
  /* Clear Supabase session storage */
  try{
    for(var i=localStorage.length-1;i>=0;i--){
      var k=localStorage.key(i);
      if(k&&(k.startsWith('sb-')||k.includes('supabase')))localStorage.removeItem(k);
    }
  }catch(e){}
  /* Run original logout (clears S.me, redirects to login) */
  _origLogout();
};

/* --- OVERRIDE FORGOT PASSWORD --- */
FORMS.forgot=function(f){
var err=f.querySelector('[data-ferr]');
var em=f.email?f.email.value.trim():'';
if(!em||!em.includes('@')){err.textContent='Entre une adresse e-mail valide.';return;}
err.textContent='Envoi en cours...';
var btn=f.querySelector('[type=submit]');if(btn)btn.disabled=true;
sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin}).then(function(r){
if(r.error){err.textContent=r.error.message;if(btn)btn.disabled=false;return;}
if(typeof closeModal==='function')closeModal();
if(typeof toast==='function')toast({tone:'blue',icon:'mail',title:'E-mail envoy\u00e9',text:'V\u00e9rifie ta bo\u00eete mail.'});
}).catch(function(){err.textContent='Erreur.';if(btn)btn.disabled=false;});
};

/* --- PERIODIC: refresh from DB every 10s + save blob --- */
setInterval(function(){if(uid&&S.me.logged){sbRefresh();sbSave();}},10000);

/* --- PAGE CLOSE: save --- */
addEventListener('pagehide',function(){if(uid&&S.me.logged)sbSave();});

/* === SERVER-SIDE BALANCE === */
var SB_LIVE = {balance: true, markets: true, chat: true};

/* placeBet → server RPC */
var _origPlaceBet = window.placeBet;
window.placeBet = function(ctx, ev) {
  if (!SB_LIVE.balance || !uid) { _origPlaceBet(ctx, ev); return; }
  var st = tState(ctx), m = MK[st.m], c = calcT(st);
  if (!c.ok) return;
  if (typeof rgBlocked === 'function' && rgBlocked('bet')) return;
  var btn = ctx === 'sheet' ? document.querySelector('.md .btn[data-c="btn"]') : document.querySelector('[data-ticket="page"] .btn[data-c="btn"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  sb.rpc('place_bet', {p_market_id: m.id, p_side: st.side, p_amount: c.amt}).then(function(res) {
    if (res.error) { toast({tone:'red', icon:'info', title:'Erreur', text: res.error.message}); if(btn)btn.disabled=false; return; }
    var d = res.data;
    S.me.balance = Number(d.new_balance); S.me.played++;
    var p = S.me.positions.find(function(x){return x.m===m.id&&x.s===st.side;});
    if (p) { p.avg = Number(d.avg_price); p.sh = (p.sh||0) + Number(d.shares); }
    else { S.me.positions.push({m:m.id, s:st.side, sh:Number(d.shares), avg:Number(d.avg_price)}); }
    var old = m.p; m.p = Number(d.new_market_price);
    if (typeof updateMarket === 'function') updateMarket(m, old);
    updateHeader(); toast({tone:'blue', icon:'check', title:'Pari place', text:d.shares+' parts'}); save();
    if (ctx === 'sheet') closeModal(); else rerenderTicket();
  }).catch(function() { if(btn)btn.disabled=false; });
};

/* sellPos → server RPC */
var _origSellPos = window.sellPos;
window.sellPos = function(ctx) {
  if (!SB_LIVE.balance || !uid) { _origSellPos(ctx); return; }
  var st = tState(ctx), c = calcT(st);
  if (!c.ok) return;
  sb.rpc('sell_position', {p_market_id: st.m, p_side: st.side, p_shares: c.sh}).then(function(res) {
    if (res.error) { toast({tone:'red', icon:'info', title:'Erreur', text:res.error.message}); return; }
    var d = res.data;
    S.me.balance = Number(d.new_balance);
    var p = S.me.positions.find(function(x){return x.m===st.m&&x.s===st.side;});
    if (p) { p.sh -= Number(d.shares_sold); if (p.sh < 0.05) S.me.positions = S.me.positions.filter(function(x){return x!==p;}); }
    var m = MK[st.m], old = m.p; m.p = Number(d.new_market_price);
    if (typeof updateMarket === 'function') updateMarket(m, old);
    updateHeader(); toast({tone:'blue', icon:'check', title:'Vendu', text:d.proceeds+'$'});
    st.amt=''; rerenderTicket(); save();
  }).catch(function() {});
};

/* flashBet → server RPC (NO original call to prevent loops) */
if(typeof ACT!=='undefined'&&ACT['flash-bet']){
  var _flashLock=false;
  ACT['flash-bet']=function(a,ev){
    if(!uid||_flashLock)return;
    _flashLock=true;
    var gid=a.dataset.fg||S.ui.fgame||'btc', amt=S.ui.flashAmt||10;
    var fside=a?a.dataset.v:'oui';
    var rside=fside==='oui'?'a':fside==='non'?'b':'be';
    /* Disable ALL flash buttons to prevent multiple selections */
    document.querySelectorAll('[data-a="flash-bet"]').forEach(function(b){b.disabled=true;});
    sb.rpc('flash_bet',{p_game_id:gid,p_side:rside,p_amount:amt}).then(function(res){
      _flashLock=false;
      document.querySelectorAll('[data-a="flash-bet"]').forEach(function(b){b.disabled=false;});
      if(res.error){toast({tone:'red',icon:'info',title:'Erreur',text:res.error.message});return;}
      S.me.balance=Number(res.data.new_balance); S.me.played++;
      updateHeader(); toast({tone:'blue',icon:'bolt',title:'Pari eclair',text:amt+'$'});
    }).catch(function(){
      _flashLock=false;
      document.querySelectorAll('[data-a="flash-bet"]').forEach(function(b){b.disabled=false;});
    });
  };
}

/* startDeposit → server RPC */
var _origDep = window.startDeposit;
if (_origDep) window.startDeposit = function(amt) {
  if (!SB_LIVE.balance || !uid) { _origDep(amt); return; }
  var st = S.ui.dep;
  sb.rpc('demo_deposit', {p_coin:st.coin, p_network:st.net, p_amount:amt*(typeof coinUSD==='function'?coinUSD(st.coin):1)}).then(function(res) {
    if (res.error) return;
    S.me.balance = Number(res.data.new_balance); S.me.deposits++;
    updateHeader(); save(); toast({tone:'blue', icon:'check', title:'Depot', text:'+'+amt});
    if(typeof render==='function')render(false);
  }).catch(function(){});
};

/* === SHARED MARKETS === */
sb.rpc('get_markets').then(function(res){
  if(!res.data)return;
  res.data.forEach(function(row){
    var m=MK[row.market_id];if(!m)return;
    m.p=Number(row.current_probability); m.anchor=Number(row.anchor_probability)||m.p;
    if(Number(row.volume_total)>m.vol)m.vol=Number(row.volume_total);
  });
}).catch(function(){});

sb.channel('mkt-live').on('postgres_changes',{event:'UPDATE',schema:'public',table:'market_live_state'},function(p){
  var row=p.new;if(!row)return;var m=MK[row.market_id];if(!m)return;
  var old=m.p;m.p=Number(row.current_probability);
  if(typeof updateMarket==='function')updateMarket(m,old);
}).subscribe();

/* === CHAT === */
var _origSM=window.sendMsg;
window.sendMsg=function(rid){
  if(!SB_LIVE.chat||!uid){_origSM(rid);return;}
  var inp=document.querySelector('[data-in="'+CSS.escape(rid)+'"]');
  if(!inp)return;var text=inp.value.trim();if(!text)return;
  inp.value='';inp.focus();
  sb.rpc('send_chat_message',{p_room_id:rid,p_text:text}).then(function(res){
    if(res.error)return;
    if(typeof addMsg==='function'&&typeof mkMsg==='function')addMsg(rid,mkMsg({u:'me',k:'msg',text:text}));
  }).catch(function(){});
};

sb.channel('chat-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},function(p){
  var msg=p.new;if(!msg||msg.user_id===uid)return;
  if(typeof room==='function'&&typeof addMsg==='function'&&typeof mkMsg==='function')
    addMsg(msg.room_id,mkMsg({u:msg.user_id,k:msg.message_type||'msg',text:msg.text_content||''}));
}).subscribe();

/* === FRIEND SEARCH === */
var _fqT=null;
document.addEventListener('input',function(e){
  if(!e.target.matches||!e.target.matches('[data-fq]')||!uid)return;
  var q=(e.target.value||'').trim();if(q.length<2)return;
  clearTimeout(_fqT);
  _fqT=setTimeout(function(){
    sb.rpc('search_users',{p_query:q,p_limit:10}).then(function(res){
      if(!res.data||!Array.isArray(res.data)||!res.data.length)return;
      var box=document.querySelector('[data-fres]');if(!box)return;
      box.innerHTML=res.data.map(function(u){
        return '<div class="fr-row"><span class="av" style="background:'+(u.avatar_color||'#2448FF')+'">'+(u.username?u.username[0].toUpperCase():'?')+'</span><span class="nm">'+u.username+'</span><button class="btn b-ink sm" data-a="fr-add-sb" data-uname="'+u.username+'">Ajouter</button></div>';
      }).join('');
      if(typeof fixText==='function')fixText(box);
    }).catch(function(){});
  },300);
});
ACT['fr-add-sb']=function(a){
  var uname=a.dataset.uname;if(!uname||!uid)return;
  sb.rpc('send_friend_request',{p_target_username:uname}).then(function(r){
    if(r.error){toast({tone:'red',icon:'info',title:'Erreur',text:r.error.message});return;}
    toast({icon:'check',title:'Demande envoyee',dur:2500});
    a.disabled=true;a.textContent='Envoyee';a.className='btn b-white sm';
  }).catch(function(){});
};

/* === RANK POPUP (show once, persist in localStorage) === */
var _origRankUp=window.rankUp;
if(_origRankUp)window.rankUp=function(r){
  var key=r.t+'.'+r.d;
  try{if(localStorage.getItem('wimoro-rank-seen')===key)return;}catch(e){}
  try{localStorage.setItem('wimoro-rank-seen',key);}catch(e){}
  _origRankUp(r);
};

/* Fix onboarding: set onboarded=true as default for returning users.
   The boot script checks this synchronously before sbLoad finishes.
   sbLoad will confirm from DB. New users start with onboarded=false
   in newMe() but the Supabase trigger sets onboarded=true in DB. */
/* onboarding: newMe defaults to onboarded=true, sbLoad confirms from DB */

/* === MODE SWITCH: Demo ↔ Account === */

/* Add "Create Account" button when in demo mode */
/* Add "Demo Mode" button when logged in with account */
ACT['switch-to-account'] = function() {
  /* From demo → go to login/signup page */
  if (typeof logout === 'function') logout();
  location.hash = '#connexion';
};

ACT['switch-to-demo'] = function() {
  /* From account → switch to demo */
  uid = null;
  try { sb.auth.signOut(); } catch(e) {}
  try {
    for(var i=localStorage.length-1;i>=0;i--){
      var k=localStorage.key(i);
      if(k&&(k.startsWith('sb-')||k.includes('supabase')))localStorage.removeItem(k);
    }
  } catch(e) {}
  /* Enter demo account */
  if (typeof DEMO_ACC !== 'undefined' && typeof enterAccount === 'function') {
    enterAccount(DEMO_ACC);
    S.me.welcomed = true;
    if (typeof doLogin === 'function') doLogin('Mode Demo');
  }
};

/* Inject switch button into user menu */
var _origUmenuH = window.umenuH;
if (typeof umenuH === 'function') {
  window.umenuH = function() {
    var html = _origUmenuH();
    /* Add switch button at the bottom */
    var isDemoMode = S.auth && S.auth.demo;
    var switchBtn = isDemoMode
      ? '<a class="ui" href="#connexion" data-a="switch-to-account" style="border-top:1px solid var(--rule);padding-top:12px;margin-top:8px">' + ic('user',16) + ' Creer un compte / Se connecter</a>'
      : '<button class="ui" data-a="switch-to-demo" style="border-top:1px solid var(--rule);padding-top:12px;margin-top:8px">' + ic('refresh',16) + ' Passer en mode Demo</button>';
    /* Insert before the closing </div> of umenu */
    return html + switchBtn;
  };
}

/* === MULTI-USER SYNC: disable client-side bots === */
/* Server pg_cron (bot_tick) handles market prices, chat, reactions.
   Client bots would desync prices between browsers. */
var _origBotBet=window.botBet, _origBotChat=window.botChat;
var _origBotReact=window.botReact, _origBurst=window.burst;
var _origDriftAnchors=window.driftAnchors;
var _origMarketsSave=window.marketsSave, _origMarketsLoad=window.marketsLoad;

window.botBet=function(){if(!uid)_origBotBet();};
window.botChat=function(){if(!uid)_origBotChat();};
window.botReact=function(){if(!uid)_origBotReact();};
window.burst=function(i){if(!uid)_origBurst(i);};
window.driftAnchors=function(){if(!uid)_origDriftAnchors();};
window.marketsSave=function(){if(!uid)_origMarketsSave();};
window.marketsLoad=function(){if(!uid)_origMarketsLoad();};

/* === FRIENDS: Sync from Supabase on boot + periodically === */
window._sbFriendMap = {};
var _friendsLoaded = false;

function sbLoadFriends() {
  if (!uid) return;
  sb.rpc('get_friends').then(function(res) {
    if (!res.data || !Array.isArray(res.data)) return;
    var friends = res.data;
    var accepted = [], incoming = [], outgoing = [];
    friends.forEach(function(f) {
      window._sbFriendMap[f.username] = f.user_id;
      if (f.status === 'accepted') accepted.push(f.username);
      else if (f.status === 'pending' && f.direction === 'in') incoming.push(f.username);
      else if (f.status === 'pending' && f.direction === 'out') outgoing.push(f.username);
    });
    S.me.friends = accepted;
    S.me.freqIn = incoming;
    S.me.freqOut = outgoing;
    _friendsLoaded = true;
    if (typeof refreshFriends === 'function') refreshFriends();
  }).catch(function(){});
}

/* Load friends right after sbLoad completes */
var _origSbLoad = sbLoad;
sbLoad = function() {
  return _origSbLoad().then(function() {
    sbLoadFriends();
  });
};

/* Also refresh friends every 15 seconds */
setInterval(function() { if (uid && S.me.logged) sbLoadFriends(); }, 15000);

/* Override fr-add to use Supabase (for bot usernames that aren't in DB) */
ACT['fr-add'] = function(a) {
  if (!uid) return;
  var u = a.dataset.u;
  var uname = (typeof USERS !== 'undefined' && USERS[u]) ? USERS[u].n : u;
  sb.rpc('send_friend_request', {p_target_username: uname}).then(function(r) {
    if (r.error) { toast({tone:'red', icon:'info', title:'Erreur', text:r.error.message}); return; }
    if (!S.me.freqOut) S.me.freqOut = [];
    S.me.freqOut.push(u);
    toast({icon:'check', title:'Demande envoyee', dur:2000});
    if (typeof refreshFriends === 'function') refreshFriends();
  }).catch(function(){});
};

/* Override fr-accept to use Supabase */
ACT['fr-accept'] = function(a) {
  if (!uid) return;
  var u = a.dataset.u;
  var targetUid = window._sbFriendMap[u] || null;
  if (!targetUid) {
    sb.from('users').select('id').ilike('username', u).maybeSingle().then(function(r) {
      if (!r.data) return;
      targetUid = r.data.id;
      doAccept(u, targetUid);
    });
    return;
  }
  doAccept(u, targetUid);
};

function doAccept(u, targetUid) {
  sb.rpc('accept_friend_request', {p_from_user_id: targetUid}).then(function(r) {
    if (r.error) { toast({tone:'red', icon:'info', title:'Erreur', text:r.error.message}); return; }
    toast({icon:'users', title:'Ami accepte'});
    S.me.freqIn = (S.me.freqIn||[]).filter(function(x){return x!==u;});
    if (!(S.me.friends||[]).includes(u)) (S.me.friends=S.me.friends||[]).push(u);
    save();
    if (typeof refreshFriends === 'function') refreshFriends();
  }).catch(function(){});
}

/* Override fr-decline to use Supabase */
ACT['fr-decline'] = function(a) {
  if (!uid) return;
  var u = a.dataset.u;
  var targetUid = window._sbFriendMap[u] || null;
  if (!targetUid) return;
  sb.rpc('decline_friend_request', {p_from_user_id: targetUid}).then(function() {
    S.me.freqIn = (S.me.freqIn||[]).filter(function(x){return x!==u;});
    save();
    if (typeof refreshFriends === 'function') refreshFriends();
    toast({icon:'check', title:'Demande refusee'});
  }).catch(function(){});
};

/* Override fr-remove to use Supabase */
ACT['fr-remove'] = function(a) {
  if (!uid) return;
  var u = a.dataset.u;
  sb.rpc('remove_friend', {p_friend_username: u}).then(function() {
    S.me.friends = (S.me.friends||[]).filter(function(f){return f!==u;});
    save();
    if (typeof closeModal === 'function') closeModal();
    if (typeof refreshFriends === 'function') refreshFriends();
    toast({icon:'check', title:'Ami supprime'});
  }).catch(function(){});
};

console.log('Wimoro x Supabase OK — friends synced from DB');
})();