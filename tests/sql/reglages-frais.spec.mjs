// Panneau d'administration, lot 3 : les frais et les limites sont lus dans wm.reglages par les fonctions du jeu.
//   * Avec les valeurs par défaut, les fonctions réécrites rendent EXACTEMENT ce qu'elles rendaient (comparaison avec une
//     base chargée sans les migrations du panneau).
//   * Un réglage changé par la porte de l'équipe vaut dès le pari suivant, et le serveur l'impose.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, q, semer } from './base.mjs';

const CATEGORIES = ['Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport', 'Sport live', 'Bourse', 'Matières', 'Devises', 'Inconnue', null];

test('valeurs par défaut : barème des frais, barème d’argent, bonus et cotations identiques à avant', async () => {
  const avant = await creerBase({ until: 'sauvegarde_20261119' }), apres = await creerBase();
  for (const cat of CATEGORIES) for (const disc of [false, true]) {
    const sql = 'select wm.fee_rate($1, $2) as r';
    expect((await q(apres, sql, [cat, disc]))[0].r, `${cat} ${disc}`).toBe((await q(avant, sql, [cat, disc]))[0].r);
  }
  expect((await q(apres, 'select wm.argent()::text as a'))[0].a).toBe((await q(avant, 'select wm.argent()::text as a'))[0].a);
  expect((await q(apres, 'select wm.ref_bonus()::text as b'))[0].b).toBe((await q(avant, 'select wm.ref_bonus()::text as b'))[0].b);
  // 300 cotations tirées au hasard (prix, profondeur, catégorie, remise, côté, montant) : au bit près
  let graine = 7;
  const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) {
    const p = [1 + alea() * 98, 400 + alea() * 40000, CATEGORIES[Math.floor(alea() * 12)], alea() < 0.3, alea() < 0.5 ? 'oui' : 'non', 1 + alea() * 3000];
    const sql = 'select row_to_json(x)::text as r from wm.quote_buy($1, $2, $3, $4, $5, $6) x';
    expect((await q(apres, sql, p))[0].r, JSON.stringify(p)).toBe((await q(avant, sql, p))[0].r);
  }
  expect((await q(apres, `select provolatile as v from pg_proc where oid = 'wm.fee_rate(text,boolean)'::regprocedure`))[0].v).toBe('s');
  await avant.close(); await apres.close();
});

test.describe('un réglage changé vaut dès le pari suivant', () => {
  test.describe.configure({ mode: 'serial' });
  let db, chef, alice, bob, bot;
  const eq = async (action, p) => (await enTantQue(db, chef, s => s('select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)])))[0].r;
  const regler = (cle, valeur) => eq('reglage_modifier', { cle, valeur, motif: 'essai du lot 3' });
  const api = async (qui, sql, params) => (await enTantQue(db, qui, s => s(sql, params)))[0].r;
  const non = (qui, sql, params) => enTantQue(db, qui, s => s(sql, params)).then(() => null, e => e.message);
  const srv = (f, u, p) => q(db, `select public.${f}($1, $2::jsonb) as r`, [u, JSON.stringify(p)]).then(r => r[0].r, e => ({ erreur: e.message }));
  const solde = async u => Number((await q(db, 'select balance from public.user_stats where user_id = $1', [u]))[0].balance);
  test.beforeAll(async () => {
    db = await creerBase(); await semer(db);
    chef = await creerJoueur(db, 'chef', 0); alice = await creerJoueur(db, 'alice', 100000); bob = await creerJoueur(db, 'bob', 100000);
    await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [chef]);
    [{ id: bot }] = await q(db, `insert into public.users (username, email, is_demo) values ('bot_alpha', 'bot_alpha@nulle.part', true) returning id`);
    await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted')`, [alice, bob]);
  });
  test.afterAll(async () => { await db.close(); });

  test('frais des paris : multiplicateur, barème d’une catégorie, remise du rang Diamant', async () => {
    const devis = async (cat, disc, montant) => (await q(db, `select (wm.quote_buy(l.current_probability::float8, wm.depth(l.volume_total::float8, l.liquidity_depth::float8), $1, $2, 'oui', $3)).fee as f
      from public.market_live_state l where l.market_id = 'btc150k'`, [cat, disc, montant]))[0].f;
    const entre = (x, a, b) => { expect(x).toBeGreaterThan(a); expect(x).toBeLessThan(b); };
    const achat = async () => (await api(alice, `select public.api_buy('btc150k', 'oui', 100, gen_random_uuid()) as r`)).q.fee;
    const f0 = await devis('Crypto', false, 100);
    expect(await achat()).toBeCloseTo(f0, 2);                                                // frais par défaut : le devis du serveur
    const g0 = await devis('Crypto', false, 100);                                            // (le prix a bougé : nouveau devis)
    await regler('frais.k', 0.35);                                                           // la moitié, dès le pari suivant
    const g1 = await devis('Crypto', false, 100);
    entre(g1 / g0, 0.49, 0.51);
    expect(await achat()).toBeCloseTo(g1, 2);
    const h0 = await devis('Crypto', false, 100);
    await regler('frais.taux.crypto', 0.14);                                                 // barème Crypto doublé
    const h1 = await devis('Crypto', false, 100);
    entre(h1 / h0, 1.95, 2.05);
    expect(await achat()).toBeCloseTo(h1, 2);
    await regler('frais.taux.crypto', 0.07); await regler('frais.k', 0.7);
    const fn = await devis('Crypto', false, 100);
    await regler('frais.remise_rang', 0.5);
    entre(await devis('Crypto', true, 100) / fn, 0.49, 0.51);
    await regler('frais.remise_rang', 0.9);
    entre(await devis('Crypto', true, 100) / fn, 0.89, 0.91);
  });

  test('bornes : mise des paris, mise éclair, duels, combinés (frais et gain), stacks, copies', async () => {
    await regler('paris.mise_min', 5); await regler('paris.mise_max', 200);
    expect(await non(alice, `select public.api_buy('btc150k', 'oui', 3, gen_random_uuid())`)).toMatch(/montant_min/);
    expect(await non(alice, `select public.api_buy('btc150k', 'oui', 250, gen_random_uuid())`)).toMatch(/montant_max/);
    expect((await api(alice, `select public.api_buy('btc150k', 'oui', 200, gen_random_uuid()) as r`)).q.total).toBe(200);
    await regler('paris.mise_max', null); await regler('paris.mise_min', 1);
    expect((await api(alice, `select public.api_buy('btc150k', 'oui', 2, gen_random_uuid()) as r`)).q.total).toBe(2);

    await regler('eclair.mise_max', 500);
    expect((await srv('srv_eclair_miser', alice, { manche: 1, jeu: 'btc', cote: 'oui', amt: 600, key: crypto.randomUUID() })).erreur).toMatch(/montant_invalide/);
    expect((await srv('srv_eclair_miser', alice, { manche: 1, jeu: 'btc', cote: 'oui', amt: 400, key: crypto.randomUUID() })).erreur).toMatch(/mises_fermees/);   // passe la borne
    await regler('eclair.mise_max', 10000);

    await regler('duels.mise_max', 100); await regler('duels.max_ouverts', 1);
    const duel = s => `select public.api_duel_create('{"m":"btc150k","side":"oui","stake":${s},"opp":"${bob}","key":"${crypto.randomUUID()}"}'::jsonb) as r`;
    expect(await non(alice, duel(150))).toMatch(/montant_invalide/);
    expect((await api(alice, duel(50))).duel).toBeTruthy();
    expect(await non(alice, duel(50))).toMatch(/trop_de_duels/);
    await regler('duels.max_ouverts', 10); await regler('duels.mise_max', 5000);
    await regler('duels.expiration_h', 2);
    const d2 = (await api(alice, duel(20))).duel;
    const [{ h }] = await q(db, `select round(extract(epoch from (expire_at - now())) / 3600) as h from wm.duels where id = $1`, [d2.id]);
    expect(Number(h)).toBe(2);
    await regler('duels.expiration_h', 48);

    await regler('frais.combines.commission', 0.1); await regler('combines.gain_max', 1000); await regler('combines.mise_max', 50);
    const combi = m => `select public.api_combo_place('{"stake":${m},"key":"${crypto.randomUUID()}","legs":[{"m":"btc150k","s":"non"},{"m":"clasico","s":"non"}]}'::jsonb) as r`;
    expect(await non(alice, combi(60))).toMatch(/montant_invalide/);
    const c = (await api(alice, combi(40))).combo;
    const [{ brut }] = await q(db, `select round((40 * mult)::numeric, 2) as brut from wm.combos where id = $1`, [c.id]);
    const [{ frais, gain }] = await q(db, `select frais, gain from wm.combos where id = $1`, [c.id]);
    expect(Number(frais)).toBeCloseTo(Number(brut) * 0.1, 2);
    expect(Number(gain)).toBe(Math.min(Number(brut) - Number(frais), 1000));
    await regler('combines.encaisse_decote', 0.8);
    const [{ v8 }] = await q(db, `select wm.combo_valeur(c) as v8 from wm.combos c where c.id = $1`, [c.id]);
    await regler('combines.encaisse_decote', 0.95);
    const [{ v95 }] = await q(db, `select wm.combo_valeur(c) as v95 from wm.combos c where c.id = $1`, [c.id]);
    expect(Number(v8) / Number(v95)).toBeCloseTo(0.8 / 0.95, 2);
    await regler('frais.combines.commission', 0.05); await regler('combines.gain_max', 50000); await regler('combines.mise_max', 1000);

    await regler('stacks.buyin_max', 50);
    expect(await non(alice, `select public.api_stack_create('{"buyin":60,"key":"${crypto.randomUUID()}","opp":"${bot}"}'::jsonb)`)).toMatch(/montant_invalide/);
    await regler('stacks.buyin_max', 1000);
    await regler('copies.budget_min', 500);
    await eq('joueur_rang', { id: alice, t: 3, d: 0, motif: 'rang Or pour copier' });
    expect(await non(alice, `select public.api_copy_start('{"u":"${bot}","budget":100,"per":10}'::jsonb)`)).toMatch(/budget_min/);
    await regler('copies.budget_min', 50);
  });

  test('duel de stack : la commission réglée s’applique au règlement', async () => {
    await regler('frais.stacks.commission', 0.1);
    const [{ id }] = await q(db, `insert into wm.stacks (user_id, adv, buyin, ref, fin_at) values ($1, $2, 100, -100000, now() - interval '1 minute') returning id`, [bob, bot]);
    const s0 = await solde(bob);
    await q(db, 'select wm.stacks_avant($1)', [bob]);
    const [st] = await q(db, 'select etat from wm.stacks where id = $1', [id]);
    expect(st.etat).toBe('won');                                                             // l'adversaire simulé part de très loin
    expect(await solde(bob)).toBeCloseTo(s0 + 100 * 2 * 0.9, 2);
    await regler('frais.stacks.commission', 0.04);
  });

  test('argent : frais et bornes des dépôts et retraits, plafond du site, bonus de parrainage, création de clan', async () => {
    await eq('joueur_kyc', { id: bob, ok: true });
    const depot = p => `select public.api_demo_deposit('${JSON.stringify(p)}'::jsonb, gen_random_uuid()) as r`;
    const retrait = p => `select public.api_demo_withdraw('${JSON.stringify({ method: 'crypto', net: 'Base', addr: '0x1111111111111111111111111111111111111111', ...p })}'::jsonb, gen_random_uuid()) as r`;
    await regler('frais.depots_fiat.card', 0.05);
    expect((await api(bob, depot({ method: 'card', amt: 100 }))).dep).toMatchObject({ fee: 5 });
    await regler('depots.fiat_max', 300);
    expect(await non(bob, depot({ method: 'card', amt: 400 }))).toMatch(/depot_max/);
    await regler('depots.min.usdc', 20);
    expect(await non(bob, depot({ method: 'crypto', coin: 'USDC', net: 'Base', amt: 10 }))).toMatch(/depot_min/);
    await regler('depots.max_jour', 250);
    expect(await non(bob, depot({ method: 'card', amt: 200 }))).toMatch(/limite_depot/);   // 100 déjà déposés aujourd'hui
    await regler('depots.max_jour', null); await regler('depots.fiat_max', 5000); await regler('depots.min.usdc', 5); await regler('frais.depots_fiat.card', 0.025);
    await regler('frais.retraits.base', 1);
    expect((await api(bob, retrait({ amt: 20 }))).wd).toMatchObject({ fee: 1 });
    await regler('retraits.min', 30);
    expect(await non(bob, retrait({ amt: 20 }))).toMatch(/retrait_min/);
    await regler('retraits.max', 1000);
    expect(await non(bob, retrait({ amt: 2000 }))).toMatch(/retrait_max/);
    await regler('retraits.max', null); await regler('retraits.min', 5); await regler('frais.retraits.base', 0.05);

    await regler('parrainage.bonus', 25);
    const [{ code }] = await q(db, `select wm.ref_code($1) as code`, [alice]).catch(() => q(db, `select code from wm.ref_codes where user_id = $1`, [alice]));
    const [{ id: filleul }] = await q(db, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('filleul@test.dev', $1, now()) returning id`, [JSON.stringify({ username: 'filleul', ref: code })]);
    expect(await solde(filleul)).toBe(25);
    await regler('parrainage.bonus', 10);

    await q(db, `update public.users set created_at = now() - interval '30 days' where id = $1`, [bob]);
    await eq('joueur_rang', { id: bob, t: 2, d: 0, motif: 'rang Argent pour créer un clan' });
    await regler('clans.frais_creation', 80);
    const s0 = await solde(bob);
    const c = await api(bob, `select public.api_clan_create('{"name":"Les Réglés","tag":"REG"}'::jsonb) as r`);
    expect(await solde(bob)).toBeCloseTo(s0 - 80, 2);
    expect((await q(db, `select amount from public.balance_ledger where user_id = $1 and kind = 'clan'`, [bob]))[0].amount).toBe('-80.00');
    await regler('clans.frais_creation', 50);
    await regler('clans.guerre_buyin', 35);
    const g = await api(bob, 'select public.api_clan_war() as r');
    expect(Number((await q(db, `select buyin from wm.clan_guerres where clan_id = $1`, [c.id]))[0].buyin)).toBe(35);
    expect(g.clan).toBeTruthy();
    await regler('clans.guerre_buyin', 20);
  });

  test('ce que le serveur n’applique pas encore est refusé ; La Série suit sa liste ; le Blitz garde ses prix tant que l’Edge Function ne les lit pas', async () => {
    for (const cle of ['frais.eclair.k', 'frais.serie.facteur', 'frais.blitz.commission', 'eclair.be_marge', 'blitz.buyin', 'blitz.buyin_prime', 'blitz.rachat'])
      expect(await enTantQue(db, chef, s => s('select public.api_equipe($1, $2::jsonb)', ['reglage_modifier', JSON.stringify({ cle, valeur: 1, motif: 'essai' })])).then(() => null, e => e.message), cle).toMatch(/reglage_inactif/);
    await regler('serie.mises', [10, 20]);
    expect((await srv('srv_serie_start', alice, { gid: 'btc', t: Date.now(), p0: 100, stake: 5, key: crypto.randomUUID() })).erreur).toMatch(/montant_invalide/);
    expect((await srv('srv_serie_start', alice, { gid: 'btc', t: Date.now(), p0: 100, stake: 20, key: crypto.randomUUID() })).serie).toBeTruthy();
    await regler('serie.mises', [5, 10, 25, 50, 100]);
    expect((await srv('srv_blitz_join', bob, { id: 3, debut: Date.now() + 600000, buyin: 10, key: crypto.randomUUID() })).blitz).toBeTruthy();
    expect((await srv('srv_blitz_join', bob, { id: 4, debut: Date.now() + 600000, buyin: 15, key: crypto.randomUUID() })).erreur).toMatch(/requete/);
  });
});
