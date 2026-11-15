// Vérification de bout en bout du socle de l'API sur la vraie base, par l'API publique, avec un compte de test jetable :
// inscription avec pseudo, état du joueur, connexion par pseudo (Edge Function), onboarding, profil, préférences.
// Usage : node tools/e2e/verif-socle.mjs
const API = 'https://brmwvxncyeypefsgiepf.supabase.co';
const KEY = 'sb_publishable_iw7LMAYTnX_ETs-mj9sIPQ_pnSdgOd2';
const stamp = Date.now().toString(36);
const pseudo = 'e2e_' + stamp, email = `wimoro-e2e-${stamp}@example.com`, password = 'E2e-' + stamp + '-Xy9!';
const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const h = { apikey: KEY, 'content-type': 'application/json', ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
};
let echecs = 0;
const out = (label, ok, detail) => { if (!ok) echecs++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`); };

let r = await call('/rest/v1/rpc/api_pseudo_libre', { method: 'POST', body: { p_pseudo: pseudo } });
out('visiteur : le pseudo est libre avant l\'inscription', r.status === 200 && r.j === true, JSON.stringify(r.j));
const su = await call('/auth/v1/signup', { method: 'POST', body: { email, password, data: { username: pseudo, test: true } } });
if (!su.j || !su.j.access_token) { console.log('inscription impossible :', su.status, JSON.stringify(su.j).slice(0, 200)); process.exit(1); }
const token = su.j.access_token;
const rpc = (name, args, t = token) => call('/rest/v1/rpc/' + name, { method: 'POST', body: args || {}, token: t });

r = await rpc('api_state');
out('api_state après inscription', r.status === 200 && r.j.me && r.j.me.n === pseudo, r.j && r.j.me ? `pseudo « ${r.j.me.n} », solde ${r.j.me.balance}, onboarded=${r.j.me.onboarded}, missions=${(r.j.missions || []).map(m => m.id).join('/')}` : JSON.stringify(r.j).slice(0, 160));
out('le pseudo choisi est respecté et l\'onboarding reste à faire', r.j && r.j.me && r.j.me.n === pseudo && r.j.me.onboarded === false && r.j.me.email === email);
r = await call('/rest/v1/rpc/api_pseudo_libre', { method: 'POST', body: { p_pseudo: pseudo.toUpperCase() } });
out('le pseudo n\'est plus libre (même en majuscules)', r.j === false, JSON.stringify(r.j));
r = await call('/rest/v1/rpc/api_state', { method: 'POST', body: {} });
out('refusé : api_state sans connexion', r.status === 401 || r.status === 403, 'HTTP ' + r.status);

const fn = body => call('/functions/v1/connexion', { method: 'POST', body });
r = await fn({ pseudo, mot_de_passe: password });
out('connexion par pseudo', r.status === 200 && r.j.ok && !!r.j.access_token, 'HTTP ' + r.status + ' ; champs renvoyés : ' + Object.keys(r.j || {}).join(','));
const token2 = r.j && r.j.access_token;
out('la réponse ne contient ni e-mail ni profil', r.j && !JSON.stringify(r.j).includes('@') && !('user' in r.j));
if (token2) { const s = await rpc('api_state', {}, token2); out('la session ouverte par pseudo est bien celle du compte', s.j && s.j.me && s.j.me.n === pseudo); }
r = await fn({ pseudo, mot_de_passe: 'mauvais-mot-de-passe' }); out('refusé : mauvais mot de passe', r.status === 401 && r.j.code === 'identifiants', 'HTTP ' + r.status + ' ' + JSON.stringify(r.j));
r = await fn({ pseudo: 'inconnu_' + stamp, mot_de_passe: password }); out('refusé : pseudo inconnu (même réponse)', r.status === 401 && r.j.code === 'identifiants', 'HTTP ' + r.status + ' ' + JSON.stringify(r.j));
r = await rpc('srv_login_lookup', { p_pseudo: pseudo }); out('refusé : recherche d\'e-mail par un joueur connecté', r.status === 403 || r.status === 401, 'HTTP ' + r.status);
r = await call('/rest/v1/rpc/srv_login_lookup', { method: 'POST', body: { p_pseudo: pseudo } }); out('refusé : recherche d\'e-mail par un visiteur', r.status === 403 || r.status === 401, 'HTTP ' + r.status);

r = await rpc('api_onboarding', { p: { bonus: true } });
out('100 XP de bienvenue', r.status === 200 && r.j.me.xp === 100, r.j && r.j.ev ? 'événements : ' + r.j.ev.map(e => e.k + (e.n && e.n.code ? ':' + e.n.code : '')).join(', ') : JSON.stringify(r.j).slice(0, 120));
r = await rpc('api_onboarding', { p: { bonus: true, done: true } });
out('rejouer ne redonne rien ; onboarding terminé', r.status === 200 && r.j.me.xp === 100 && r.j.me.onboarded === true && r.j.ev.length === 0);
r = await rpc('api_profile_update', { p: { bio: 'compte de test automatique', color: '#13804F', photo: 'g:renard' } });
out('profil mis à jour', r.status === 200 && r.j.me.color === '#13804F', r.j && r.j.me ? r.j.me.bio : JSON.stringify(r.j).slice(0, 120));
r = await rpc('api_profile_update', { p: { n: 'admin' } }); out('refusé : pseudo réservé', r.status === 400 && r.j.message === 'pseudo_invalide', 'HTTP ' + r.status + ' ' + (r.j && r.j.message));
r = await rpc('api_prefs_save', { p_prefs: { v: 1, tmode: 'all' } }); out('préférences enregistrées', r.status === 204 || r.status === 200, 'HTTP ' + r.status);
r = await rpc('api_state'); out('état relu : préférences, notification de rang, XP', r.j.prefs.tmode === 'all' && r.j.notifs.length === 1 && r.j.notifs[0].code === 'rank_up' && r.j.me.xp === 100, `prefs=${JSON.stringify(r.j.prefs)} notifs=${r.j.notifs.map(n => n.code)}`);
r = await rpc('api_notifs_read'); r = await rpc('api_notif_hide', {}); r = await rpc('api_state'); out('notifications lues puis masquées', r.j.notifs.length === 0);
console.log(`\ncompte de test à supprimer : ${email}\n${echecs ? echecs + ' ÉCHEC(S)' : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
