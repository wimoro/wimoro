// Vérification de bout en bout sur la vraie base, par l'API publique, avec un compte de test jetable.
// Usage : node tools/e2e/verif-securite.mjs
import fs from 'node:fs';
const API = 'https://brmwvxncyeypefsgiepf.supabase.co';
const KEY = fs.readFileSync(new URL('../../js/supabase.js', import.meta.url), 'utf8').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)[0];
const stamp = Date.now().toString(36);
const email = `wimoro-e2e-${stamp}@${process.env.E2E_DOMAIN || 'example.com'}`, password = 'E2e-' + stamp + '-Xy9!';
const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const r = await fetch(API + path, { method, headers: { apikey: KEY, Authorization: 'Bearer ' + (token || KEY), 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
};
const out = (label, ok, detail) => console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);

const su = await call('/auth/v1/signup', { method: 'POST', body: { email, password, data: { username: 'e2e_' + stamp, test: true } } });
if (!su.j || !su.j.access_token) { console.log('inscription du compte de test impossible :', su.status, JSON.stringify(su.j).slice(0, 200)); process.exit(1); }
const token = su.j.access_token, uid = su.j.user.id;
console.log(`compte de test créé : e2e_${stamp} (${uid.slice(0, 8)}…)`);
const rpc = (name, args) => call('/rest/v1/rpc/' + name, { method: 'POST', body: args || {}, token });

let r = await call(`/rest/v1/users?select=username&id=eq.${uid}`, { token }); out('lire son profil public', r.status === 200 && r.j.length === 1, r.j && r.j[0] && r.j[0].username);
r = await call(`/rest/v1/user_stats?select=balance,xp&user_id=eq.${uid}`, { token }); out('lire ses statistiques', r.status === 200 && r.j.length === 1, JSON.stringify(r.j && r.j[0]));
r = await rpc('demo_deposit', { p_coin: 'USDC', p_network: 'Base', p_amount: 100 }); out('dépôt fictif de 100 $', r.status === 200 && Number(r.j.new_balance) === 100, 'solde ' + (r.j && r.j.new_balance));
r = await rpc('place_bet', { p_market_id: 'box-office', p_side: 'oui', p_amount: 10 }); out('pari de 10 $', r.status === 200 && Number(r.j.new_balance) < 100, JSON.stringify(r.j).slice(0, 110));
const shares = r.j && Number(r.j.shares);
r = await rpc('sell_position', { p_market_id: 'box-office', p_side: 'oui', p_shares: shares }); out('revente de la position', r.status === 200, JSON.stringify(r.j).slice(0, 100));
r = await rpc('get_markets'); out('liste des marchés', r.status === 200 && r.j.length === 27, (r.j || []).length + ' marchés');
r = await rpc('get_friends'); out('liste d\'amis', r.status === 200, (r.j || []).length + ' ami(s)');
r = await call(`/rest/v1/users?id=eq.${uid}`, { method: 'PATCH', body: { bio: 'compte de test automatique' }, token }); out('modifier sa bio', r.status === 204 || r.status === 200, 'HTTP ' + r.status);
r = await call('/rest/v1/user_full_state', { method: 'POST', body: { user_id: uid, state: { v: 5, test: true } }, token, headers: { Prefer: 'resolution=merge-duplicates' } }); out('enregistrer ses préférences (blob)', r.status === 201 || r.status === 200 || r.status === 204, 'HTTP ' + r.status);
r = await call(`/rest/v1/positions?select=market_id`, { token }); out('lire ses positions (table serveur)', r.status === 200, JSON.stringify(r.j));

console.log('--- ce qui doit être refusé ---');
const refuse = async (label, p) => { const x = await p; out('refusé : ' + label, x.status === 401 || x.status === 403 || (x.status === 200 && Array.isArray(x.j) && x.j.length === 0), 'HTTP ' + x.status + ' ' + ((x.j && (x.j.message || JSON.stringify(x.j))) || '').slice(0, 70)); };
await refuse('se donner 999 999 $', call(`/rest/v1/user_stats?user_id=eq.${uid}`, { method: 'PATCH', body: { balance: 999999 }, token }));
await refuse('créer une position', call('/rest/v1/positions', { method: 'POST', body: { user_id: uid, market_id: 'btc150k', side: 'oui', shares: 1000, average_price: 1 }, token }));
await refuse('changer le prix d\'un marché', call('/rest/v1/market_live_state?market_id=eq.btc150k', { method: 'PATCH', body: { current_probability: 50 }, token }));
await refuse('lire les e-mails', call('/rest/v1/users?select=email&limit=1', { token }));
await refuse('changer son e-mail de profil', call(`/rest/v1/users?id=eq.${uid}`, { method: 'PATCH', body: { email: 'x@y.z' }, token }));
await refuse('admin_set_balance', rpc('admin_set_balance', { target_username: 'e2e_' + stamp, new_balance: 5 }));
await refuse('admin_top_players', rpc('admin_top_players', { n: 3 }));
await refuse('settle_market', rpc('settle_market', { p_market_id: 'btc150k', p_outcome: 'yes' }));
await refuse('grant_xp', rpc('grant_xp', { p_user_id: uid, p_amount: 1000, p_source: 'x' }));
await refuse('create_notification', rpc('create_notification', { p_user_id: uid, p_icon: 'gift', p_text: 'x' }));
await refuse('insérer un message sans passer par la fonction', call('/rest/v1/chat_messages', { method: 'POST', body: { room_id: 'general', user_id: uid, text_content: 'x' }, token }));
await refuse('s\'attribuer un badge', call('/rest/v1/user_badges', { method: 'POST', body: { user_id: uid, badge_id: 'whale' }, token }));
r = await call(`/rest/v1/user_stats?select=balance&user_id=eq.${uid}`, { token }); console.log('solde final du compte de test :', r.j && r.j[0] && r.j[0].balance);
console.log('compte de test à supprimer :', email);
