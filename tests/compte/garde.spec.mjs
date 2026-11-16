// Garde-fou du mode Compte : une action qui n'est pas encore reliée au serveur ne doit jamais sembler marcher
// puis s'annuler. Soit elle passe par le serveur, soit elle est clairement indisponible.
//
// 1. Analyse statique : toute action ou formulaire qui modifie un champ dont le serveur fait autorité (solde, XP,
//    positions, historique, amis, notifications…) est soit bloqué en mode Compte, soit dans la liste des actions
//    reliées au serveur ci-dessous. Ajouter une action reliée = l'ajouter ici, avec son test.
// 2. Dans le navigateur : cliquer sur une action bloquée affiche un message clair et ne change rien.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { ouvrir, lire } from '../helpers/app.mjs';

const AUTORITE = new Set(['balance', 'xp', 'played', 'wins', 'settled', 'deposits', 'flashWins', 'followed', 'realized', 'streak', 'bestStreak', 'copiers', 'msgsTotal', 'positions', 'history', 'deps', 'wds', 'missions', 'badges', 'friends', 'freqIn', 'freqOut', 'following', 'notifs', 'kyc', 'maxBet']);
// Actions libres en mode Compte qui touchent ces champs : chacune passe par le serveur (ou ne fait que lire).
const RELIEES = {
  'ACT.stk-create': 'api_stack_create (buy-in, stacks et règlement tenus par le serveur) — tests/compte/stacks.spec.mjs',
  'ACT.react': 'api_chat_react (compteurs tenus par le serveur, vus en direct) — tests/compte/reactions.spec.mjs',
  'ACT.share-pick': 'api_chat_share (carte, XP et suivis tenus par le serveur) — tests/compte/mises.spec.mjs',
  'ACT.follow-user': 'api_follow (liste et compteur d’abonnés tenus par le serveur) — tests/compte/suivre.spec.mjs',
  'ACT.cl-join': 'api_clan_join — tests/compte/clans.spec.mjs',
  'ACT.cl-apply': 'api_clan_apply (réponse de l’officier donnée par le serveur) — tests/compte/clans.spec.mjs',
  'ACT.cl-leave-do': 'api_clan_leave — tests/compte/clans.spec.mjs',
  'FORMS.clan': 'api_clan_create (frais, rang, ancienneté, tag unique) — tests/compte/clans.spec.mjs',
  'FORMS.clcode': 'api_clan_join par code — tests/compte/clans.spec.mjs',
  'ACT.cp-start': 'api_copy_start (copie créée ou réglée par le serveur) — tests/compte/copies.spec.mjs',
  'ACT.cp-pause': 'api_copy_set — tests/compte/copies.spec.mjs',
  'ACT.cp-stop-do': 'api_copy_set (arrêt, avec ou sans vente des positions) — tests/compte/copies.spec.mjs',
  'FORMS.create': 'api_proposal_create (rang, texte filtré, votes et mise en ligne par le serveur) — tests/compte/propositions.spec.mjs',
  'ACT.vote': 'api_proposal_vote — tests/compte/propositions.spec.mjs',
  'ACT.ref-copy': 'le code et le lien viennent du serveur (api_state → ref) — tests/compte/parrainage.spec.mjs',
  'ACT.ref-share': 'le code et le lien viennent du serveur (api_state → ref) — tests/compte/parrainage.spec.mjs',
  'ACT.cb-place': 'api_combo_place (prix bloqués, mise prise par le serveur) — tests/compte/combines.spec.mjs',
  'ACT.cb-cash': 'api_combo_cash — tests/compte/combines.spec.mjs',
  'ACT.dl-create': 'api_duel_create (mise sous séquestre) — tests/compte/duels.spec.mjs',
  'ACT.dl-accept': 'api_duel_accept — tests/compte/duels.spec.mjs',
  'ACT.dl-cancel': 'api_duel_close — tests/compte/duels.spec.mjs',
  'ACT.dl-decline': 'api_duel_close — tests/compte/duels.spec.mjs',
  'ACT.bz-join': 'Edge Function eclair, action blitz_join — tests/compte/blitz.spec.mjs',
  'ACT.bz-rebuy': 'blitz_rebuy — tests/compte/blitz.spec.mjs',
  'ACT.bz-choose': 'blitz_choose — tests/compte/blitz.spec.mjs',
  'ACT.sr-start': 'Edge Function eclair, action serie_start — tests/compte/serie.spec.mjs',
  'ACT.sr-play': 'serie_play — tests/compte/serie.spec.mjs',
  'ACT.sr-cash': 'serie_cash — tests/compte/serie.spec.mjs',
  'ACT.ob-next': 'api_onboarding (100 XP de bienvenue, fin de l’onboarding) — tests/compte/comptes.spec.mjs',
  'ACT.ob-done': 'api_onboarding — tests/compte/comptes.spec.mjs',
  'ACT.np-del': 'api_notif_hide — tests/compte/etat.spec.mjs',
  'ACT.np-clear': 'api_notif_hide — tests/compte/etat.spec.mjs',
  'ACT.buy': 'api_buy (écriture comptable faite par le serveur) — tests/compte/paris.spec.mjs',
  'ACT.sell': 'api_sell — tests/compte/paris.spec.mjs',
  'ACT.withdraw': 'api_demo_withdraw — tests/compte/argent.spec.mjs',
  'ACT.fiat-dep': 'api_demo_deposit (carte, virement, PayPal) — tests/compte/argent.spec.mjs',
  'ACT.fiat-wd': 'api_demo_withdraw — tests/compte/argent.spec.mjs',
  'FORMS.simdep': 'api_demo_deposit (crypto) — tests/compte/argent.spec.mjs',
  'FORMS.kyc': 'api_demo_kyc — tests/compte/argent.spec.mjs',
  'FORMS.rglim': 'api_rg_limit — tests/compte/argent.spec.mjs',
  'ACT.rg-pause-do': 'api_rg_pause — tests/compte/argent.spec.mjs',
  'ACT.rg-pend-cancel': 'api_rg_pend_cancel — tests/compte/argent.spec.mjs',
  'ACT.claim': 'api_mission_claim — tests/compte/etat.spec.mjs',
  'ACT.flash-bet': 'Edge Function « eclair » (mise et règlement) — tests/compte/eclair.spec.mjs',
  'ACT.fr-add': 'api_friend — tests/compte/amis.spec.mjs',
  'ACT.fr-accept': 'api_friend — tests/compte/amis.spec.mjs',
  'ACT.fr-cancel': 'api_friend — tests/compte/amis.spec.mjs',
  'ACT.fr-decline': 'api_friend — tests/compte/amis.spec.mjs',
  'ACT.fr-remove': 'api_friend — tests/compte/amis.spec.mjs',
  'ACT.dm': 'api_dm_history, api_dm_send (conversation privée) — tests/compte/prive.spec.mjs',
  'ACT.pro-sh-dst': 'lecture seule de la liste d’amis (choix du destinataire)',
  'ACT.pro-sh-dm': 'lecture seule de la liste d’amis (choix du destinataire)',
  'FORMS.settings': 'api_profile_update (pseudo unique) — tests/compte/etat.spec.mjs',
  'FORMS.pwchange': 'Supabase Auth (updateUser) — tests/compte/comptes.spec.mjs',
  'FORMS.profile': 'api_profile_update — tests/compte/etat.spec.mjs',
};

test('aucune action qui touche à l’argent, à l’XP ou au social ne s’exécute localement en mode Compte', async () => {
  execFileSync(process.execPath, ['tools/audit/inventaire.mjs', '--sortie', 'test-results/inventaire'], { stdio: 'ignore' });
  const inv = JSON.parse(fs.readFileSync('test-results/inventaire/inventaire-front.json', 'utf8'));
  const src = fs.readFileSync('js/serveur.js', 'utf8');
  const bloque = new Set(src.match(/const SRV_BLOQUE=new Set\(\(([\s\S]*?)\)\.split/)[1].replace(/['+\n]/g, ' ').split(/\s+/).filter(Boolean));
  const formsBloque = new Set(JSON.parse(src.match(/const SRV_FORMS_BLOQUE=new Set\((\[[^\]]*\])\)/)[1].replace(/'/g, '"')));
  const actions = inv.rows.filter(r => r.reg === 'ACT'), forms = inv.rows.filter(r => r.reg === 'FORMS');
  expect(actions.length).toBeGreaterThan(230);

  const fuites = inv.rows.filter(r => r.reg !== 'VIEWS' && !(r.reg === 'ACT' ? bloque : formsBloque).has(r.key) && r.me.some(c => AUTORITE.has(c)) && !RELIEES[r.reg + '.' + r.key])
    .map(r => `${r.reg}.${r.key} (${r.file}:${r.line}) modifie ${r.me.filter(c => AUTORITE.has(c)).join(', ')}`);
  expect(fuites, 'actions à bloquer dans SRV_BLOQUE, ou à relier au serveur et déclarer dans RELIEES').toEqual([]);

  // les listes ne contiennent pas de nom périmé
  const noms = new Set(actions.map(r => r.key)), nomsF = new Set(forms.map(r => r.key));
  expect([...bloque].filter(k => !noms.has(k)), 'actions bloquées inexistantes').toEqual([]);
  expect([...formsBloque].filter(k => k !== 'chat' && !nomsF.has(k)), 'formulaires bloqués inexistants').toEqual([]);
  expect(Object.keys(RELIEES).filter(k => !inv.rows.some(r => r.reg + '.' + r.key === k)), 'actions reliées inexistantes').toEqual([]);
  // une action ne peut pas être à la fois bloquée et déclarée reliée
  expect(Object.keys(RELIEES).filter(k => (k.startsWith('ACT.') ? bloque : formsBloque).has(k.split('.')[1]))).toEqual([]);
});

test('une action pas encore reliée est clairement indisponible : message, et rien ne change', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#marche-btc150k', faux: { marches: [{ market_id: 'btc150k', current_probability: 60, anchor_probability: 60, volume_total: 5e6, liquidity_depth: 30000 }] } });
  const avant = await lire(page, () => JSON.stringify({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions, hist: S.me.history, notifs: S.me.notifs.length, prix: MK.btc150k.p, messages: Object.values(S.rooms).reduce((n, r) => n + r.msgs.length, 0) }));
  const n0 = await lire(page, () => __fakeSB.calls.length);
  await page.locator('[data-a="limit-place"], [data-a="otype"][data-v="limit"]').first().click({ force: true }).catch(() => {});
  await page.evaluate(() => { location.hash = '#chat'; });
  await page.evaluate(() => { location.hash = '#eclair'; });
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'cl-war'; document.body.appendChild(b); b.click(); b.remove(); });   // guerres de clans
  await expect(page.locator('.toast', { hasText: 'Coming soon for accounts' }).first()).toBeVisible();
  await page.evaluate(() => { ACT.withdraw && document.dispatchEvent(new Event('x')); });
  for (const a of ['cl-kick', 'cl-war', 'cl-war-join', 'limit-place', 'pro-share'])
    await page.evaluate(nom => { const b = document.createElement('button'); b.dataset.a = nom; b.dataset.u = 'x'; b.dataset.m = 'btc150k'; document.body.appendChild(b); b.click(); b.remove(); }, a);
  const apres = await lire(page, () => JSON.stringify({ solde: S.me.balance, xp: S.me.xp, pos: S.me.positions, hist: S.me.history, notifs: S.me.notifs.length, prix: MK.btc150k.p, messages: Object.values(S.rooms).reduce((n, r) => n + r.msgs.filter(x => x.k !== 'evt').length, 0) }));
  expect(apres).toBe(avant);
  // seules des lectures ont eu lieu (ouverture du salon général) : aucune écriture
  expect(await lire(page, n => __fakeSB.calls.slice(n).map(c => c.name).filter(nom => !['api_chat_history', 'api_dm_list', 'api_leaderboard'].includes(nom) && !nom.startsWith('salon:')), n0), 'aucune écriture sur le serveur').toEqual([]);
  expect(erreurs).toEqual([]);
});

test('en mode Démo, les mêmes actions marchent comme avant (aucun blocage)', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', hash: '#marche-btc150k' });
  const s0 = await lire(page, () => S.me.balance);
  await page.locator('[data-ticket="page"] [data-a="buy"]').click();
  expect(await lire(page, () => S.me.balance)).toBeLessThan(s0);
  await page.evaluate(() => { location.hash = '#chat'; });
  await page.locator('.composer input[data-in="general"]').fill('bonjour');
  await page.locator('.composer input[data-in="general"]').press('Enter');
  expect(await lire(page, () => room('general').msgs.some(x => x.u === 'me' && x.text === 'bonjour'))).toBe(true);
});
