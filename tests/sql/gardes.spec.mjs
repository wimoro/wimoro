// Preuve qu'un joueur non concerné ne voit aucune différence (panneau d'administration, lots 1 à 3).
//   1. Les fonctions existantes modifiées sont exactement celles prévues, et leur nouvelle définition ne diffère de
//      l'ancienne (sauvée au lot 0 dans backup_20261119.fonctions) que par des lignes marquées « [ajout] », des littéraux
//      remplacés par wm.reglage_num('<clé>', <le même littéral>) sur des lignes marquées « [réglage] », et un changement de
//      volatilité (IMMUTABLE → STABLE) pour celles qui lisent désormais un réglage. Les autres (frais, barème d'argent,
//      bonus) sont comparées sur leurs résultats : tests/sql/reglages-frais.spec.mjs.
//   2. Un scénario de référence est rejoué sur une base « avant » (sans aucune migration du panneau) et une base « après »
//      (toutes les migrations) : mêmes réponses, mêmes soldes, mêmes relevés, mêmes prix.
import { test, expect } from '@playwright/test';
import { creerBase, q, semer } from './base.mjs';

const AJOUTS_SEULS = ['wm.uid()', 'wm.is_admin()', 'wm.admin(text,jsonb)', 'wm.droits()', 'wm.buy(text,text,numeric,uuid,jsonb)',
  'srv_eclair_miser(uuid,jsonb)', 'srv_serie_start(uuid,jsonb)', 'srv_blitz_join(uuid,jsonb)', 'srv_blitz_rebuy(uuid,jsonb)',
  'wm.duel_create(jsonb)', 'wm.duel_accepter(bigint,uuid,integer,numeric)', 'srv_duel_eclair_creer(uuid,jsonb)', 'wm.combo_place(jsonb)',
  'wm.stack_create(jsonb)', 'wm.copy_start(jsonb)', 'wm.copie_executer(bigint,text,text,numeric,boolean)', 'wm.demo_deposit(jsonb,uuid)',
  'wm.demo_withdraw(jsonb,uuid)', 'wm.proposal_create(jsonb)', 'wm.clan_join(text,text)', 'wm.clan_apply(text)', 'wm.clan_create(jsonb)',
  'wm.clan_promote(uuid)', 'wm.clan_kick(uuid)', 'wm.clan_invite(uuid)', 'wm.clan_call(text,text)', 'wm.clan_war()', 'wm.clan_war_join()',
  'wm.chat_send(text,text)', 'wm.chat_share(text,text,text)', 'wm.chat_react(text,text,text)', 'wm.ana_share(jsonb,text[],text)', 'wm.dm_send(uuid,text)'];
// réécrites et vérifiées sur leurs résultats (lot 3)
export const PAR_RESULTATS = ['wm.fee_rate(text,boolean)', 'wm.argent()', 'wm.ref_bonus()'];
// lot 3 : réglages lus à la place de constantes (lignes « [réglage] »), et volatilité IMMUTABLE → STABLE permise
export const LOT3 = ['wm.combo_valeur(wm.combos)', 'wm.stacks_avant(uuid)', 'wm.clan_guerres_avancer(uuid)',
  'wm.quote_buy(double precision,double precision,text,boolean,text,double precision)'];
const VOLATILITE = new Set(['wm.quote_buy(double precision,double precision,text,boolean,text,double precision)']);

function diffLignes(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const retirees = [], ajoutees = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) retirees.push(a[i++]); else ajoutees.push(b[j++]); }
  while (i < n) retirees.push(a[i++]); while (j < m) ajoutees.push(b[j++]);
  return { retirees, ajoutees };
}
// une ligne « [réglage] » redevient la ligne d'avant quand on remet chaque littéral à la place de sa lecture de réglage :
//   not (x = any (wm.reglage_liste('k', array[L])))  →  x not in (L)
//   wm.reglage_num('k', L)                            →  L
//   (1 - 0.04)                                        →  0.96          (une commission réglée, à la place du facteur gardé)
//   interval '1 hour' * 48                            →  interval '48 hours'
const sansReglage = l => l.replace(/\s+-- \[réglage\].*$/, '')
  .replace(/not \((\w+) = any \(wm\.reglage_liste\('[a-z0-9_.]+', array\[([^\]]+)\]\)\)\)/g, '$1 not in ($2)')
  .replace(/wm\.reglage_num\('[a-z0-9_.]+', ([^()]+?)\)/g, '$1')
  .replace(/\(1 - (\d+(?:\.\d+)?)\)/g, (_, x) => String(Math.round((1 - Number(x)) * 1e9) / 1e9))
  .replace(/interval '1 hour' \* (\d+)/g, "interval '$1 hours'");

test('fonctions existantes : seules celles prévues ont changé, et seulement par des lignes ajoutées ou des réglages', async () => {
  const db = await creerBase();
  const changees = await q(db, `select f.signature as sig, f.definition as avant, pg_get_functiondef(f.signature::regprocedure) as apres
    from backup_20261119.fonctions f where f.definition <> pg_get_functiondef(f.signature::regprocedure) order by 1`);
  const lot3 = changees.some(c => c.sig === 'wm.fee_rate(text,boolean)');
  const attendues = [...AJOUTS_SEULS, ...(lot3 ? [...PAR_RESULTATS, ...LOT3] : [])].sort();
  expect(changees.map(c => c.sig).sort()).toEqual(attendues);
  let ajouts = 0;
  for (const c of changees.filter(c => !PAR_RESULTATS.includes(c.sig))) {
    const { retirees, ajoutees } = diffLignes(c.avant.split('\n'), c.apres.split('\n'));
    for (const l of ajoutees) expect(/-- \[(ajout|réglage)\]/.test(l) || (VOLATILITE.has(c.sig) && l === ' STABLE'), `${c.sig} : ligne ajoutée non marquée\n${l}`).toBe(true);
    const reglages = ajoutees.filter(l => l.includes('-- [réglage]')).map(sansReglage);
    for (const l of retirees) expect(reglages.includes(l) || (VOLATILITE.has(c.sig) && l === ' IMMUTABLE'), `${c.sig} : ligne retirée\n${l}`).toBe(true);
    ajouts += ajoutees.length;
  }
  expect(ajouts).toBeGreaterThanOrEqual(40);
  await db.close();
});

// ── Scénario de référence ──
const ID = { alice: '00000000-0000-4000-8000-0000000000a1', bob: '00000000-0000-4000-8000-0000000000b0', bot: '00000000-0000-4000-8000-0000000000b1' };
const K = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VARIABLES = new Set(['code', 'manche', 'r', 'expire', 'fin', 'debut', 'due', 'now']);
function normaliser(v, k) {
  if (Array.isArray(v)) return v.map(x => normaliser(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, normaliser(x, kk)]));
  if (k && VARIABLES.has(k)) return 'VARIABLE';
  if (typeof v === 'string') return UUID.test(v) && !Object.values(ID).includes(v) && !K.includes(v) ? 'UUID' : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) ? 'DATE' : v;
  if (typeof v === 'number' && v > 1e12) return 'HEURE';
  return v;
}

async function preparer(db) {
  await semer(db);
  for (const [id, n] of [[ID.alice, 'alice'], [ID.bob, 'bob']]) {
    await q(db, `insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())`, [id, n + '@test.dev', JSON.stringify({ username: n })]);
    await q(db, `update public.user_stats set balance = 1000, xp = 300, bets_settled = 3 where user_id = $1`, [id]);
    await q(db, 'select wm.rank_refresh($1)', [id]);
  }
  await q(db, `insert into public.users (id, username, email, is_demo) values ($1, 'bot_alpha', 'bot_alpha@nulle.part', true)`, [ID.bot]);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted')`, [ID.alice, ID.bob]);
}

async function appel(db, qui, sql, params = []) {
  try {
    return await db.transaction(async tx => {
      await tx.query('select setseed(0.42)');
      if (qui === 'service') return (await tx.query(sql, params)).rows;
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(qui ? { sub: qui, role: 'authenticated' } : { role: 'anon' })]);
      await tx.exec(`set local role ${qui ? 'authenticated' : 'anon'}`);
      return (await tx.query(sql, params)).rows;
    });
  } catch (e) { return { erreur: e.message }; }
}

test('scénario de référence : mêmes réponses, mêmes soldes, mêmes prix avant et après les migrations du panneau', async () => {
  const avant = await creerBase({ until: 'sauvegarde_20261119' }), apres = await creerBase();
  expect((await q(avant, `select to_regclass('wm.reglages') as t`))[0].t).toBeNull();
  for (const db of [avant, apres]) await preparer(db);
  const now = Date.now();
  const etapes = [
    [ID.alice, 'select public.api_state() as r'],
    [ID.alice, `select public.api_buy('btc150k', 'oui', 20, $1) as r`, [K[0]]],
    [ID.bob, `select public.api_buy('clasico', 'non', 15, $1) as r`, [K[1]]],
    [ID.alice, `select public.api_sell('btc150k', 'oui', 5, $1) as r`, [K[2]]],
    [ID.alice, `select public.api_buy('btc150k', 'oui', 0.5, $1) as r`, [K[3]]],
    [ID.alice, `select public.api_demo_deposit('{"method":"crypto","coin":"USDC","net":"Base","amt":50}'::jsonb, $1) as r`, [K[4]]],
    [ID.alice, `select public.api_demo_deposit('{"method":"card","amt":50}'::jsonb, $1) as r`, [K[5]]],
    [ID.alice, `select public.api_demo_withdraw('{"method":"crypto","net":"Base","addr":"0x1111111111111111111111111111111111111111","amt":10}'::jsonb, $1) as r`, [K[6]]],
    [ID.alice, `select public.api_chat_send('general', 'bonjour à tous') as r`],
    [ID.bob, `select public.api_chat_react('general', '1', '🔥') as r`],
    'pause',
    [ID.alice, `select public.api_dm_send($1, 'salut') as r`, [ID.bob]],
    [ID.alice, `select public.api_combo_place($1::jsonb) as r`, [JSON.stringify({ stake: 5, key: K[7], legs: [{ m: 'btc150k', s: 'oui' }, { m: 'clasico', s: 'non' }] })]],
    [ID.alice, `select public.api_duel_create($1::jsonb) as r`, [JSON.stringify({ m: 'btc150k', side: 'oui', stake: 10, opp: ID.bob, key: K[8] })]],
    [ID.bob, `select public.api_duel_accept('{"id":1}'::jsonb) as r`],
    [ID.alice, `select public.api_stack_create($1::jsonb) as r`, [JSON.stringify({ buyin: 10, key: K[9], opp: ID.bot })]],
    [ID.alice, `select public.api_proposal_create('{"q":"Le Bitcoin passera-t-il 200 000 $ cette année ?"}'::jsonb) as r`],
    [ID.alice, `select public.api_clan_create('{"name":"Les Essais","tag":"ESS"}'::jsonb) as r`],
    [ID.alice, `select public.api_clan_join('c61', null) as r`],
    [ID.alice, `select public.api_copy_start($1::jsonb) as r`, [JSON.stringify({ u: ID.bob, budget: 100, per: 10 })]],
    [ID.bob, `select public.api_chat_share('general', 'clasico', 'non') as r`],
    ['service', `select public.srv_eclair_miser($1, $2::jsonb) as r`, [ID.alice, JSON.stringify({ manche: 1, jeu: 'btc', cote: 'oui', amt: 10, key: K[10], fee: 0.3, fee_remise: 0.27 })]],
    ['service', `select public.srv_serie_start($1, $2::jsonb) as r`, [ID.alice, JSON.stringify({ gid: 'btc', t: now, p0: 100, stake: 10, key: K[11] })]],
    ['service', `select public.srv_blitz_join($1, $2::jsonb) as r`, [ID.alice, JSON.stringify({ id: 7, debut: now + 600000, buyin: 10, key: K[12] })]],
    ['service', `select public.srv_duel_eclair_creer($1, $2::jsonb) as r`, [ID.alice, JSON.stringify({ gid: 'btc', side: 'oui', stake: 10, opp: ID.bob, key: K[13], prix: 50, frais: 0.3, frais_remise: 0.27 })]],
    [ID.alice, 'select public.api_state() as r'],
    [ID.bob, 'select public.api_state() as r'],
    [null, 'select public.api_markets() as r'],
  ];
  let reussies = 0;
  for (const e of etapes) {
    if (e === 'pause') { await new Promise(r => setTimeout(r, 1100)); continue; }
    const [qui, sql, params] = e;
    const ra = normaliser(await appel(avant, qui, sql, params)), rb = normaliser(await appel(apres, qui, sql, params));
    expect(rb, sql).toEqual(ra);
    if (!ra.erreur) reussies++;
  }
  expect(reussies).toBeGreaterThanOrEqual(18);                                               // le scénario passe bien par les fonctions modifiées
  const TABLES = [
    'select user_id, balance::text, xp, bets_placed, bets_settled, profit_realized::text, rank_tier, rank_division from public.user_stats where user_id in ($1, $2) order by user_id',
    'select user_id, amount::text, balance_after::text, kind, ref_id from public.balance_ledger where user_id in ($1, $2) order by id',
    'select user_id, market_id, side, shares::text, average_price::text from public.positions where user_id in ($1, $2) order by user_id, market_id, side',
  ];
  for (const sql of TABLES) expect(normaliser(await q(apres, sql, [ID.alice, ID.bob])), sql).toEqual(normaliser(await q(avant, sql, [ID.alice, ID.bob])));
  const prix = 'select market_id, current_probability::text, volume_total::text, liquidity_depth::text, open_yes::text, open_no::text, fees::text from public.market_live_state order by 1';
  expect(await q(apres, prix)).toEqual(await q(avant, prix));
  await avant.close(); await apres.close();
});
