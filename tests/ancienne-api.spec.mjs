// Le site ne parle plus à l'ancienne API : seul js/api.js touche le client Supabase, il ne lit ni n'écrit aucune table
// directement, et toute fonction appelée s'appelle api_… (ou est une Edge Function connue). Ce test garde la porte :
// les anciennes fonctions (place_bet, demo_deposit, get_markets…) sont fermées côté base depuis la mise en ligne.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ANCIENNES = ['accept_duel', 'accept_friend_request', 'check_badges', 'claim_mission', 'clear_notifications', 'create_clan', 'create_duel',
  'decline_friend_request', 'delete_notification', 'demo_deposit', 'demo_withdrawal', 'flash_bet', 'get_chat_history', 'get_clan_members', 'get_clans',
  'get_friends', 'get_leaderboard', 'get_markets', 'get_my_badges', 'get_my_balance', 'get_my_clan', 'get_my_copies', 'get_my_deposits', 'get_my_friends',
  'get_my_history', 'get_my_notifications', 'get_my_positions', 'get_my_withdrawals', 'init_daily_missions', 'join_clan', 'leave_clan',
  'mark_notifications_read', 'newsletter_subscribe', 'newsletter_unsubscribe', 'place_bet', 'react_to_message', 'remove_friend', 'search_users',
  'sell_position', 'send_chat_message', 'send_friend_request', 'start_copy', 'stop_copy'];
const EDGE = ['connexion', 'eclair'];
const fichiers = fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join('js', f), 'utf8')]);

test('seul js/api.js touche le client Supabase, et jamais une table directement', () => {
  for (const [f, s] of fichiers) {
    if (f !== 'api.js') {
      expect(/supabase\.createClient|\bsb\.(rpc|from|auth|channel|functions)\b/.test(s), f + ' ne doit pas toucher le client Supabase').toBe(false);
      expect(/supabase\.co/.test(s), f + ' ne doit pas contenir d’adresse Supabase').toBe(false);
    }
  }
  const api = fichiers.find(([f]) => f === 'api.js')[1];
  expect(/\.from\s*\(/.test(api), 'aucun accès direct à une table').toBe(false);
  expect(/service_role|sb_secret_/.test(fichiers.map(x => x[1]).join('\n')), 'aucune clé secrète dans le site').toBe(false);
});

test('toute fonction appelée est une fonction api_… ou une Edge Function connue ; aucune ancienne fonction n’est citée', () => {
  const tout = fichiers.map(x => x[1]).join('\n');
  const appels = [...tout.matchAll(/API\.call\(\s*'([^']+)'/g)].map(m => m[1]).concat([...tout.matchAll(/srvRg\(\s*'([^']+)'/g)].map(m => m[1]))
    .filter(n => n !== 'api_…');                                                              // l'exemple donné dans l'en-tête de js/api.js
  expect(appels.length).toBeGreaterThan(25);
  expect(appels.filter(n => !/^api_[a-z_]+$/.test(n))).toEqual([]);
  const rpcDirects = [...tout.matchAll(/\.rpc\(\s*'([^']+)'/g)].map(m => m[1]);               // dans api.js : seulement api_state
  expect(rpcDirects.filter(n => !/^api_[a-z_]+$/.test(n))).toEqual([]);
  const edge = [...tout.matchAll(/API\.fn\(\s*'([^']+)'/g)].map(m => m[1]).concat([...tout.matchAll(/functions\.invoke\(\s*'([^']+)'/g)].map(m => m[1]));
  expect(edge.filter(n => !EDGE.includes(n))).toEqual([]);
  for (const nom of ANCIENNES) expect(new RegExp(`['"\`]${nom}['"\`]`).test(tout), 'ancienne fonction citée dans le site : ' + nom).toBe(false);
});

test('le fichier de fermeture couvre exactement ces anciennes fonctions', () => {
  const dossier = fs.existsSync('supabase/livraison/fermeture_ancienne_api.sql') ? 'supabase/livraison' : 'supabase/migrations';
  const f = fs.readdirSync(dossier).find(x => /fermeture_ancienne_api\.sql$/.test(x));
  expect(f, 'fichier de fermeture présent').toBeTruthy();
  const sql = fs.readFileSync(path.join(dossier, f), 'utf8');
  const cites = [...sql.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).filter(n => ANCIENNES.includes(n));
  expect([...new Set(cites)].sort()).toEqual([...ANCIENNES].sort());
});
