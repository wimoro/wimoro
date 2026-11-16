// Propositions de marché en mode Compte : l'envoi, les votes et la mise en ligne sont tenus par le serveur.
// L'écran suit le vote (relecture toutes les 3 secondes tant qu'une proposition est en vote) et reçoit le marché validé.
import { test, expect } from '@playwright/test';
import { ouvrir, lire } from '../helpers/app.mjs';

const toast = (page, texte) => page.locator('.toast', { hasText: texte }).first();
const OR = { xp: 1500, settled: 25, wins: 15, deposits: 1, balance: 100 };                        // rang Or : peut proposer
const props = page => lire(page, () => (S.me.props || []).map(p => ({ id: p.id, q: p.q, status: p.status, for: p.for, against: p.against, need: p.need, mid: p.mid })));
const appels = (page, re) => lire(page, src => __fakeSB.journal().filter(c => c.kind === 'rpc' && new RegExp(src).test(c.name)).map(c => [c.name, c.args.p || c.args]), re.source);
const vieillir = (page, ms) => page.evaluate(ms => { __fakeSB.db.props.find(x => !x.code).at -= ms; __fakeSB.persist(); return srvPropsTick(); }, ms);

test('proposer un pari : envoyé au serveur, vote suivi sans recharger, mise en ligne : le marché arrive avec +50 XP', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#creer', faux: { etat: { me: OR } } });
  await page.locator('#cq').fill("L'OM gagnera-t-il la Ligue 1 en 2027 ?");
  await page.locator('[data-a="cr-cat"][data-v="Football"]').click();
  await page.locator('#cs').fill('Site officiel de la Ligue 1');
  await page.locator('#crr').fill('Ce marché se résout par Oui si l’OM est champion de France 2027.');
  await page.locator('[data-crsubmit]').click();
  await expect(toast(page, 'Proposal sent to the vote')).toBeVisible();
  const [p] = await props(page);
  expect(p).toMatchObject({ q: 'L’OM gagnera-t-il la Ligue 1 en 2027 ?', status: 'vote', for: 1, against: 0, need: 25 });
  expect(await lire(page, () => S.me.xp)).toBe(1510);                                             // +10 XP, donnés par le serveur
  const [[nom, envoye]] = await appels(page, /^api_proposal/);
  expect(nom).toBe('api_proposal_create');
  expect(envoye).toMatchObject({ q: "L'OM gagnera-t-il la Ligue 1 en 2027 ?", cat: 'Football', time: '21:00', src: 'Site officiel de la Ligue 1', p0: 50 });
  await expect(page.locator(`[data-prop="${p.id}"]`)).toContainText('In vote');
  expect(await lire(page, () => PLAN.filter(x => /propositions/.test(x.nom)).map(x => x.quand).sort())).toEqual(['local', 'serveur']);   // les votes simulés à l'écran ne tournent pas en mode Compte

  await vieillir(page, 20000);                                                                    // 20 secondes : la communauté a voté
  const [p2] = await props(page);
  expect(p2.status).toBe('vote'); expect(p2.for).toBeGreaterThanOrEqual(14);
  await expect(page.locator(`[data-prv="${p.id}"]`).first()).toHaveText(await lire(page, ([a, b]) => _t("{0} pour, {1} contre", [a, b]), [p2.for, p2.against]));   // compteur mis à jour sur place
  expect(await page.locator(`[data-prb="${p.id}"]`).first().evaluate(e => parseFloat(e.style.width))).toBeCloseTo(p2.for / 25 * 100, 1);
  await vieillir(page, 40000);                                                                    // le compte y est : en ligne
  await expect(toast(page, 'Your market is live')).toBeVisible();
  const [p3] = await props(page);
  expect(p3).toMatchObject({ status: 'live', for: 25 }); expect(p3.mid).toMatch(/^perso-l-om-gagnera-t-il-la-lig-\d+$/);
  expect(await lire(page, mid => ({ q: MK[mid].q, p: MK[mid].p, srv: MK[mid].srv, xp: S.me.xp, notif: S.me.notifs[0].text }), p3.mid))
    .toEqual({ q: 'L’OM gagnera-t-il la Ligue 1 en 2027 ?', p: 50, srv: true, xp: 1560, notif: await lire(page, () => _t("Ton pari « {0} » est en ligne.", [shortOf('L’OM gagnera-t-il la Ligue 1 en 2027 ?')])) });
  await page.evaluate(mid => { location.hash = '#marche-' + mid; }, p3.mid);
  await expect(page.locator('#view')).toContainText('L’OM gagnera-t-il la Ligue 1 en 2027 ?');
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();            // tout vient du serveur
  expect((await props(page))[0]).toMatchObject({ status: 'live', mid: p3.mid });
  expect(await lire(page, mid => !!MK[mid], p3.mid)).toBe(true);
  expect(await lire(page, () => localStorage.getItem('wimoro-accounts'))).toBeNull();
  expect(erreurs).toEqual([]);
});

test('voter pour une proposition de la communauté : une fois, +2 XP, compte tenu par le serveur ; un texte refusé par le serveur est affiché', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#creer', faux: { etat: { me: OR } } });
  await page.locator('[data-a="cr-tab"][data-v="vote"]').click();
  await expect(page.locator('.prop')).toHaveCount(3);
  const psg = await lire(page, () => { const p = COMM_PROPS.find(x => x.for === 38); return { id: p.id, q: p.q, traduit: _t("Le PSG sera-t-il champion de France 2027 ?") }; });
  expect(psg.q, 'le contenu de démonstration garde son titre traduit').toBe(psg.traduit);
  await page.locator(`[data-a="vote"][data-id="${psg.id}"][data-v="for"]`).click();
  await expect.poll(() => lire(page, id => S.me.voted[id], psg.id)).toBe('for');
  expect(await lire(page, id => ({ xp: S.me.xp, pour: COMM_PROPS.find(x => x.id === id).for }), psg.id)).toEqual({ xp: 1502, pour: 39 });
  await expect(page.locator(`[data-prop="${psg.id}"] [data-a="vote"]`)).toHaveCount(0);           // on ne vote qu'une fois
  expect(await appels(page, /^api_proposal/)).toEqual([['api_proposal_vote', { p_id: +psg.id, p_vote: 'for' }]]);
  await page.reload(); await expect(page.locator('#view > *').first()).toBeAttached();
  expect(await lire(page, id => S.me.voted[id], psg.id)).toBe('for');

  await page.locator('[data-a="cr-tab"][data-v="form"]').click();
  await page.locator('#cq').fill('Le PSG <b>gagnera</b>-t-il la coupe en 2027 ?');
  await page.locator('#cs').fill('Site officiel de la Ligue 1');
  await page.locator('#crr').fill('Ce marché se résout par Oui si le PSG gagne la coupe 2027.');
  await page.locator('[data-crsubmit]').click();
  await expect(toast(page, 'Some characters are not accepted')).toBeVisible();
  expect(await props(page)).toEqual([]);
  expect(await lire(page, () => S.me.xp)).toBe(1502);
  expect(erreurs).toEqual([]);
});
