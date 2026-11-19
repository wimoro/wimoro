// Marchés réels, lot 9 : le cycle de vie des marchés du catalogue (fermeture à l'heure, résolution automatique des marchés
// de prix et de sport avec la valeur et la source, actualité tranchée par l'équipe), le paiement par les fonctions
// existantes, l'annulation avec remboursement au prix d'achat, et les actions de l'équipe (porte api_equipe).
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, admin, modo, alice, bob;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  admin = await creerJoueur(db, 'chef_cycle', 0); modo = await creerJoueur(db, 'modo_cycle', 0);
  alice = await creerJoueur(db, 'alice_cycle', 1000); bob = await creerJoueur(db, 'bob_cycle', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [admin]);
  await q(db, `insert into wm.equipe_membres (user_id, role, ajoute_par) values ($1, 'moderateur', $2)`, [modo, admin]);
});
test.afterAll(async () => { await db.close(); });

const TX = { fr: { q: 'Une question de test assez longue ?', court: 'Test', critere: 'Critère de résolution précis.' },
  en: { q: 'A long enough test question?', court: 'Test', critere: 'Precise resolution criterion.' }, he: { q: 'שאלת בדיקה ארוכה מספיק?', court: 'בדיקה', critere: 'קריטריון הכרעה מדויק.' } };
const creer = (p) => q(db, 'select wm.fiche_creer($1::jsonb) as id', [JSON.stringify({ categorie: 'crypto', origine: 'actu', p0: 50, textes: TX, ferme_at: '2030-01-01T00:00:00Z', ...p })]).then(r => r[0].id);
const fiche = async id => (await q(db, 'select * from wm.fiches where id = $1', [id]))[0];
const tick = () => q(db, 'select wm.cycle_tick() as r').then(r => r[0].r);
const passe = (id, ferme = '2 minutes', res = '1 minute') => q(db, `update wm.fiches set ferme_at = now() - $2::interval, resolution_at = now() - $3::interval where id = $1`, [id, ferme, res]);
const echantillon = (actif, ilya, prix) => q(db, `insert into wm.px_echantillons (actif, slot, t, prix, source)
  values ($1, (floor(extract(epoch from now() - $2::interval) / 3)::bigint % 1200)::int, now() - $2::interval, $3, 'binance')
  on conflict (actif, slot) do update set t = excluded.t, prix = excluded.prix, source = excluded.source`, [actif, ilya, prix]);
async function comme(uid, sql, params) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql, params)).rows;
  });
}
const eq = (qui, action, p = {}) => comme(qui, 'select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)]).then(r => r[0].r);
const eqNon = (qui, action, p = {}) => eq(qui, action, p).then(() => null, e => e.message);
const solde = async u => Number((await q(db, 'select balance from public.user_stats where user_id = $1', [u]))[0].balance);
const compte = async t => Number((await q(db, `select count(*) from ${t}`))[0].count);

test('prix : fermé à l’heure, puis résolu automatiquement avec la valeur et la source enregistrées', async () => {
  const id = await creer({ id: 'cy-prix', regle: { type: 'prix', actif: 'btc', op: '>', seuil: 60000, au: new Date(Date.now() - 120000).toISOString(), marge: 0.004 } });
  await echantillon('btc', '2 minutes', 63000);
  await passe(id);
  await tick();
  const f = await fiche(id);
  expect(f).toMatchObject({ cycle: 'resolu', resolu_issue: 'oui', resolu_source: 'binance' });
  expect(f.resolu_valeur).toMatchObject({ v: 63000, seuil: 60000, op: '>' });
  const j = await q(db, `select action, origine, admin_id from wm.journal where cible = $1 order by id`, [id]);
  expect(j.map(x => x.action)).toEqual(['marche_fermer', 'marche_resoudre']);
  expect(j.every(x => x.origine === 'automate' && x.admin_id === null)).toBe(true);
});

test('prix trop proche du seuil, ou donnée absente après le délai : le marché est confié à l’équipe', async () => {
  const id = await creer({ id: 'cy-proche', regle: { type: 'prix', actif: 'eth', op: '>', seuil: 2000, au: new Date(Date.now() - 120000).toISOString(), marge: 0.004 } });
  await echantillon('eth', '2 minutes', 2003);
  await passe(id); await tick();
  let f = await fiche(id);
  expect(f.cycle).toBe('a_resoudre');
  expect(f.propose).toMatchObject({ raison: 'trop_proche', issue: 'oui' });
  const id2 = await creer({ id: 'cy-absent', regle: { type: 'prix', actif: 'sol', op: '>', seuil: 70, au: new Date(Date.now() - 120000).toISOString() } });
  await passe(id2); await tick();
  expect((await fiche(id2)).cycle).toBe('ferme');                // la donnée peut encore arriver
  await passe(id2, '3 hours', '2 hours'); await tick();
  f = await fiche(id2);
  expect(f.cycle).toBe('a_resoudre');
  expect(f.propose).toEqual({ raison: 'donnee_absente' });
});

test('clôture d’une séance, semaine en hausse (référence relevée), seuil atteint avant la date', async () => {
  const t = new Date(Date.now() - 600000).toISOString();
  const c = await creer({ id: 'cy-cloture', categorie: 'bourse', regle: { type: 'cloture', actif: 'nvda', op: '>', seuil: 150, cloture_at: t, marge: 0.003 } });
  await q(db, `insert into wm.px_dernier (actif, prix, source, source_t, t) values ('nvda', 152.5, 'yahoo', $1, now())
    on conflict (actif) do update set prix = excluded.prix, source = excluded.source, source_t = excluded.source_t, t = excluded.t`, [t]);
  await passe(c); await tick();
  expect(await fiche(c)).toMatchObject({ cycle: 'resolu', resolu_issue: 'oui', resolu_source: 'yahoo' });

  const debut = new Date(Date.now() - 30 * 60000).toISOString(), fin = new Date(Date.now() - 3 * 60000).toISOString();
  const h = await creer({ id: 'cy-hausse', regle: { type: 'hausse', actif: 'btc', debut, fin, marge: 0.002 } });
  await echantillon('btc', '30 minutes', 61000); await echantillon('btc', '3 minutes', 60000);
  await passe(h, '30 minutes', '1 minute'); await tick();
  const fh = await fiche(h);
  expect(fh.regle.ref.v).toBe(61000);
  expect(fh).toMatchObject({ cycle: 'resolu', resolu_issue: 'non' });
  expect(fh.resolu_valeur.fin.v).toBe(60000);

  const k = await creer({ id: 'cy-touche', regle: { type: 'touche', actif: 'eth', seuil: 2100, jusqua: '2030-01-01T00:00:00Z' } });
  await echantillon('eth', '30 seconds', 2125);
  await tick();
  const fk = await fiche(k);
  expect(fk).toMatchObject({ cycle: 'resolu', resolu_issue: 'oui' });
  expect(fk.resolu_valeur.v).toBe(2125);
  expect(new Date(fk.ferme_at) > new Date()).toBe(true);        // résolu avant la date prévue
});

test('sport : score final d’une source, sinon confié à l’équipe ; actualité : toujours tranchée par un membre de l’équipe', async () => {
  const opts = [{ code: 'home', p0: 50, noms: { fr: 'Dom', en: 'Home', he: 'בית' } }, { code: 'draw', p0: 25, noms: { fr: 'Nul', en: 'Draw', he: 'תיקו' } },
    { code: 'away', p0: 25, noms: { fr: 'Ext', en: 'Away', he: 'חוץ' } }];
  const m = await creer({ id: 'cy-match', categorie: 'sport', nature: 'options', origine: 'sport', options: opts,
    regle: { type: 'match', sport: 'foot', debut: new Date(Date.now() - 3 * 3600000).toISOString(), dom: 'Werder Bremen', ext: 'Hamburger SV', openligadb: 999 } });
  await q(db, `insert into wm.sport_matchs (id, sport, debut_at, dom, ext, statut, score_dom, score_ext, source, final_at)
    values ('oldb:999', 'foot', now() - interval '3 hours', '{"nom":"SV Werder Bremen"}', '{"nom":"Hamburger SV"}', 'termine', 2, 1, 'openligadb', now() - interval '1 hour')`);
  await passe(m, '3 hours', '1 hour'); await tick();
  const fm = await fiche(m);
  expect(fm).toMatchObject({ cycle: 'resolu', resolu_issue: 'cy-match-home', resolu_source: 'openligadb' });
  expect(fm.resolu_valeur.score).toEqual([2, 1]);

  const s = await creer({ id: 'cy-match2', categorie: 'sport', nature: 'options', origine: 'sport', options: opts, regle: { type: 'match', sport: 'foot', debut: new Date().toISOString(), dom: 'A', ext: 'B' } });
  await passe(s, '5 hours', '3 hours'); await tick();
  expect(await fiche(s)).toMatchObject({ cycle: 'a_resoudre', propose: { raison: 'score_absent' } });

  const a = await creer({ id: 'cy-actu', categorie: 'politique' });
  await passe(a); await tick();
  expect((await fiche(a)).cycle).toBe('a_resoudre');
  expect(await eqNon(admin, 'marche_resoudre', { id: a, issue: 'oui', motif: 'résultat officiel' })).toBe('preuve_requise');
  expect(await eqNon(modo, 'marche_resoudre', { id: a, issue: 'oui', preuve: 'https://example.org/a', motif: 'résultat officiel' })).toBe('interdit');
  expect(await eqNon(alice, 'marche_resoudre', { id: a, issue: 'oui', preuve: 'https://example.org/a', motif: 'résultat officiel' })).toBe('interdit');
  const r = await eq(admin, 'marche_resoudre', { id: a, issue: 'non', preuve: 'https://example.org/officiel', motif: 'résultat officiel publié' });
  expect(r.issue).toBe('non');
  expect(await fiche(a)).toMatchObject({ cycle: 'resolu', resolu_issue: 'non', resolu_preuve: 'https://example.org/officiel', resolu_par: admin });
  const j = (await q(db, `select origine, motif, role from wm.journal where cible = $1 and action = 'marche_resoudre'`, [a]))[0];
  expect(j).toMatchObject({ origine: 'panneau', motif: 'résultat officiel publié', role: 'administrateur' });
  expect(await eqNon(admin, 'marche_resoudre', { id: a, issue: 'oui', preuve: 'https://example.org/x', motif: 'encore' })).toBe('deja_resolu');
});

test('catalogue en ligne : paiement exactement comme aujourd’hui (1 $ par part gagnante, wm.marche_regler)', async () => {
  await q(db, `update wm.reglages set valeur = 'true' where cle = 'catalogue.serveur'`);
  const id = await creer({ id: 'cy-paye', p0: 40 });
  expect((await fiche(id)).moteur).toBe(true);
  for (const [u, s, m] of [[alice, 'oui', 50], [bob, 'non', 30]]) await comme(u, `select public.api_buy($1, $2, $3, gen_random_uuid())`, [id, s, m]);
  const pos = await q(db, `select user_id, side, shares from public.positions where market_id = $1`, [id]);
  const [sa, sb] = [await solde(alice), await solde(bob)];
  await eq(admin, 'marche_resoudre', { id, issue: 'oui', preuve: 'https://example.org/p', motif: 'source officielle' });
  const gainA = Math.trunc(Number(pos.find(p => p.user_id === alice).shares) * 100) / 100;
  expect(await solde(alice)).toBeCloseTo(sa + gainA, 2);
  expect(await solde(bob)).toBe(sb);
  expect((await q(db, `select status, resolution_outcome from public.markets where id = $1`, [id]))[0]).toEqual({ status: 'resolved', resolution_outcome: 'yes' });
  expect(Number((await q(db, `select count(*) from public.positions where market_id = $1 and shares > 0`, [id]))[0].count)).toBe(0);
  expect((await q(db, `select kind from public.balance_ledger where user_id = $1 order by id desc limit 1`, [alice]))[0].kind).toBe('res');
});

test('annulation : positions remboursées au prix d’achat, duel rendu, combiné recalculé, lots de copie libérés, rien supprimé', async () => {
  const id = await creer({ id: 'cy-annule', p0: 50 });
  await comme(alice, `select public.api_buy($1, 'oui', 40, gen_random_uuid())`, [id]);
  await comme(bob, `select public.api_buy($1, 'non', 25, gen_random_uuid())`, [id]);
  await q(db, `insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted') on conflict do nothing`, [alice, bob]);
  const d = await comme(alice, 'select public.api_duel_create($1::jsonb) as r', [JSON.stringify({ m: id, side: 'oui', stake: 10, opp: bob, key: crypto.randomUUID() })]);
  await comme(bob, 'select public.api_duel_accept($1::jsonb) as r', [JSON.stringify({ id: d[0].r.duel.id })]);
  await comme(alice, 'select public.api_combo_place($1::jsonb) as r', [JSON.stringify({ stake: 5, key: crypto.randomUUID(), legs: [{ m: id, s: 'oui' }, { m: 'btc150k', s: 'oui' }] })]);
  const combo0 = (await q(db, `select * from wm.combos where user_id = $1 order by id desc limit 1`, [alice]))[0];
  const avant = { pos: await compte('public.positions'), led: await compte('public.balance_ledger'), duels: await compte('wm.duels'), combos: await compte('wm.combos') };
  const pos = await q(db, `select user_id, shares, average_price from public.positions where market_id = $1 and shares > 0`, [id]);
  const ap = await eq(admin, 'marche_annuler_apercu', { id });
  expect(ap.joueurs).toBe(2);
  expect(ap.duels).toBe(1);
  expect(ap.combines).toBe(1);
  expect(ap.positions[0].joueur).toMatch(/^[0-9a-f]{10}$/);
  const [sa, sb] = [await solde(alice), await solde(bob)];
  const r = await eq(admin, 'marche_annuler', { id, motif: 'question mal posée' });
  const rembA = Math.round(Number(pos.find(p => p.user_id === alice).shares) * Number(pos.find(p => p.user_id === alice).average_price)) / 100;
  const rembB = Math.round(Number(pos.find(p => p.user_id === bob).shares) * Number(pos.find(p => p.user_id === bob).average_price)) / 100;
  expect(r.rembourse).toBeCloseTo(rembA + rembB, 2);
  expect(ap.total).toBeCloseTo(rembA + rembB, 2);
  expect(await solde(alice)).toBeCloseTo(sa + rembA + 10, 2);   // position au prix d'achat + mise du duel
  expect(await solde(bob)).toBeCloseTo(sb + rembB + 10, 2);
  const kinds = (await q(db, `select kind from public.balance_ledger where ref_id like $1 order by id`, [id + '%'])).map(x => x.kind);
  expect(kinds.filter(k => k === 'annulation').length).toBe(2);
  expect((await q(db, `select etat from wm.duels where m = $1`, [id]))[0].etat).toBe('void');
  const combo = (await q(db, `select * from wm.combos where id = $1`, [combo0.id]))[0];
  expect(combo.etat).toBe('open');
  expect(combo.legs.find(l => l.m === id).res).toBe('void');
  expect(combo.mult).toBeCloseTo(combo0.mult / combo0.legs.find(l => l.m === id).mult, 6);
  expect((await q(db, `select status, resolution_outcome from public.markets where id = $1`, [id]))[0]).toEqual({ status: 'resolved', resolution_outcome: 'voided' });
  expect(await fiche(id)).toMatchObject({ cycle: 'annule', annule_motif: 'question mal posée', annule_par: admin });
  expect(await compte('public.positions')).toBe(avant.pos);
  expect(await compte('public.balance_ledger')).toBeGreaterThan(avant.led);
  expect(await compte('wm.duels')).toBe(avant.duels);
  expect(await compte('wm.combos')).toBe(avant.combos);
  expect(await eqNon(admin, 'marche_annuler', { id, motif: 'deux fois' })).toBe('deja_resolu');
});

test('panneau : modifier, suspendre, rouvrir ; annuler une modification depuis le journal ; « déjà modifié »', async () => {
  const id = await creer({ id: 'cy-panneau', categorie: 'tech' });
  expect((await eq(admin, 'marches_liste', { etat: 'ouvert' })).marches.some(m => m.id === id)).toBe(true);
  expect(await eqNon(modo, 'marches_liste')).toBe('interdit');
  const textes = { ...TX, fr: { ...TX.fr, court: 'Nouveau libellé' } };
  const m1 = await eq(admin, 'marche_modifier', { id, textes, image: { fichier: 'File:Bitcoin.svg' }, motif: 'libellé plus clair' });
  expect(m1.marche.t.fr.s).toBe('Nouveau libellé');
  expect(await eqNon(admin, 'marche_modifier', { id, textes, image: { fichier: 'File:Bitcoin.svg' }, motif: 'rien' })).toBe('reglage_inchange');
  const e1 = (await q(db, `select id from wm.journal where action = 'marche_modifier' and cible = $1 order by id desc limit 1`, [id]))[0].id;
  await eq(admin, 'journal_annuler', { id: e1, motif: 'retour au libellé' });
  expect((await fiche(id)).textes.fr.court).toBe('Test');
  expect((await fiche(id)).image_id).toBeNull();
  await eq(admin, 'marche_modifier', { id, textes, motif: 'à nouveau' });
  const e2 = (await q(db, `select id from wm.journal where action = 'marche_modifier' and cible = $1 order by id desc limit 1`, [id]))[0].id;
  await eq(admin, 'marche_modifier', { id, source: { nom: 'Source', url: 'https://example.org/s' }, motif: 'source' });
  expect(await eqNon(admin, 'journal_annuler', { id: e2, motif: 'trop tard' })).toBe('deja_modifie');
  await eq(admin, 'marche_suspendre', { id, motif: 'vérification en cours' });
  expect(await fiche(id)).toMatchObject({ cycle: 'suspendu', suspendu_motif: 'vérification en cours' });
  expect((await q(db, `select status from public.markets where id = $1`, [id]))[0].status).toBe('closed');
  await eq(admin, 'marche_rouvrir', { id, motif: 'vérifié' });
  expect((await q(db, `select status from public.markets where id = $1`, [id]))[0].status).toBe('open');
  await eq(admin, 'marche_suspendre', { id, jusqua: new Date(Date.now() + 60000).toISOString(), motif: 'pause courte' });
  await q(db, `update wm.fiches set suspendu_jusqua = now() - interval '1 second' where id = $1`, [id]);
  await tick();
  expect((await fiche(id)).cycle).toBe('ouvert');
});

test('actions demandées par le panneau : clans dissous, mots interdits (modérateur), XP (plafond), en ligne, relevés d’argent', async () => {
  const clan = 'cy1';
  await q(db, `insert into wm.clans_joueurs (id, nom, tag, code, chef) values ($1, 'Les Testeurs', 'TST', 'CYCLE-TST', $2)`, [clan, alice]);
  await eq(modo, 'clan_dissoudre', { id: clan, motif: 'nom trompeur' });
  const cl = await eq(modo, 'clans_liste', { dissous: true });
  expect(cl.clans.map(c => c.id)).toEqual([clan]);
  expect(cl.clans[0]).toMatchObject({ dissous: true, motif: 'nom trompeur' });
  expect(await eqNon(modo, 'reglages_lire')).toBe('interdit');
  expect(await eq(modo, 'mots_interdits_lire')).toEqual({ mots: [], prives: false });
  const x0 = Number((await q(db, 'select xp from public.user_stats where user_id = $1', [bob]))[0].xp);
  expect(await eqNon(modo, 'joueur_xp', { id: bob, delta: 5000, motif: 'trop' })).toBe('plafond_moderateur');
  await eq(modo, 'joueur_xp', { id: bob, delta: 250, motif: 'concours du chat' });
  expect(Number((await q(db, 'select xp from public.user_stats where user_id = $1', [bob]))[0].xp)).toBe(x0 + 250);
  const e = (await q(db, `select id from wm.journal where action = 'joueur_xp' order by id desc limit 1`))[0].id;
  await eq(modo, 'journal_annuler', { id: e, motif: 'erreur de joueur' });
  expect(Number((await q(db, 'select xp from public.user_stats where user_id = $1', [bob]))[0].xp)).toBe(x0);
  await comme(alice, 'select public.api_presence()'); await comme(bob, 'select public.api_presence()');
  expect((await eq(modo, 'en_ligne')).joueurs).toBe(2);
  const ops = await eq(modo, 'joueur_operations', { id: alice, n: 3 });
  expect(ops.operations.length).toBe(3);
  const mes = (await comme(alice, 'select public.api_operations(null, 50) as r'))[0].r;
  expect(mes.operations.some(o => ['annulation', 'bet', 'res'].includes(o.k))).toBe(true);
  expect(mes.operations.every(o => typeof o.montant === 'number' || typeof o.montant === 'string')).toBe(true);
  expect(await eqNon(alice, 'en_ligne')).toBe('interdit');
});
