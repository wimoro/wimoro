// Recette 1 (mode Compte) : chaque écran se charge sans aucune erreur console, en anglais, français et hébreu,
// avec un état venu du serveur. Couvre B01 (erreur au chargement), B11 et B12 (joueurs inconnus du navigateur).
import { test, expect } from '@playwright/test';
import { ouvrir, aller, lire, ECRANS, UID, AMI } from '../helpers/app.mjs';

const MARCHES = [{ market_id: 'btc150k', current_probability: 70, anchor_probability: 68, volume_total: 9e6, participants_count: 3210, liquidity_depth: 54000, price_history: Array.from({ length: 60 }, (_, i) => 60 + i / 6) }];
const ETAT = {
  me: { balance: 742.5, xp: 1250, settled: 12, wins: 7, played: 20, deposits: 1 },
  positions: [{ m: 'btc150k', s: 'oui', sh: 120.5, avg: 61.2 }, { m: 'marche-disparu', s: 'non', sh: 3, avg: 40 }],
  history: [{ k: 'sell', m: 'clasico', q: null, s: 'oui', win: true, pnl: 12.4, at: Date.now() - 36e5 }],
  deps: [{ id: 'd1', coin: 'USDC', net: 'Base', amt: 100, usd: 100, conf: 12, need: 12, st: 'completed', at: Date.now() - 864e5 }],
  notifs: [{ id: 'n1', ic: 'trophy', code: 'rank_up', p: { t: 2, d: 0 }, href: '#rang', at: Date.now() - 6e4, read: false }, { id: 'n2', ic: 'gift', code: 'code_inconnu_du_front', p: {}, text: '', href: '', at: Date.now() - 12e4, read: true }],
  friends: [AMI], freqIn: ['33333333-3333-4333-8333-333333333333'],
  users: { [AMI]: { n: 'alice', t: 3, d: 1, tone: 2, photo: '', color: '#13804F', bio: 'Salut', profit: 320, acc: 61, bets: 44, fol: 12, bot: false, pub: 1 } },
};

for (const lang of ['en', 'fr', 'he']) {
  test(`B01 · compte · ${lang} : 26 écrans, zéro erreur console`, async ({ page }) => {
    const { erreurs } = await ouvrir(page, { mode: 'compte', lang, faux: { etat: ETAT, marches: MARCHES } });
    expect(erreurs, 'erreurs au chargement').toEqual([]);
    expect(await lire(page, () => SRV())).toBe(true);
    const vides = [];
    for (const e of [...ECRANS, 'joueur-' + AMI, 'joueur-99999999-9999-4999-8999-999999999999']) {
      await aller(page, e);
      if ((await page.locator('#view').innerText()).trim().length < 20) vides.push(e);
    }
    expect(erreurs, 'erreurs pendant le parcours des écrans').toEqual([]);
    expect(vides, 'écrans vides').toEqual([]);
  });
}

test('l’état affiché est celui du serveur : solde, XP, positions, notifications, amis', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', lang: 'fr', faux: { etat: ETAT, marches: MARCHES } });
  const s = await lire(page, () => ({ n: S.me.n, solde: S.me.balance, xp: S.me.xp, pos: S.me.positions, hist: S.me.history[0], notifs: S.me.notifs.map(n => n.text), amis: S.me.friends, demandes: S.me.freqIn, prix: MK.btc150k.p, liq: MK.btc150k.liq, annuaire: Object.keys(USERS), auth: S.auth }));
  expect(s).toMatchObject({ n: 'realuser', solde: 742.5, xp: 1250, prix: 70, liq: 54000, amis: [AMI] });
  expect(s.pos, 'la position sur un marché inconnu du front est ignorée, pas plantée').toEqual([{ m: 'btc150k', s: 'oui', sh: 120.5, avg: 61.2 }]);
  expect(s.hist.q).toContain('Clásico');                                   // la question vient du marché, dans la langue du lecteur
  expect(s.notifs[0]).toBe('Tu passes Argent I.');                          // notification traduite à partir de son code
  expect(s.annuaire, 'l’annuaire ne contient que des joueurs connus du serveur').toEqual([AMI]);
  expect(s.auth).toEqual({ key: 'srv:' + UID, demo: false, serveur: true });
  await expect(page.locator('[data-bal]').first()).toContainText('742,50');
  await aller(page, 'amis');
  await expect(page.locator('#view')).toContainText('alice');
  expect(erreurs).toEqual([]);
});

test('B11, B12 · un joueur inconnu ne fait jamais planter l’affichage', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', faux: { etat: ETAT, marches: MARCHES }, hash: '#chat' });
  const r = await lire(page, inconnu => {
    const o = {};
    o.fiche = userOf(inconnu);                                               // jamais undefined
    o.salonPrive = room('dm:' + inconnu).name;
    addMsg('general', mkMsg({ u: inconnu, k: 'msg', text: 'bonjour de bob' }));     // message d'un vrai joueur encore inconnu
    addMsg('m:marche-disparu', mkMsg({ u: inconnu, k: 'msg', text: 'ignoré' }));      // marché inconnu : ignoré
    addMsg('general', mkMsg({ u: inconnu, k: 'bet', text: '', bet: { m: 'marche-disparu', s: 'oui', amt: 10, price: 50 } }));
    render(false);
    o.messages = room('general').msgs.length;
    return o;
  }, '44444444-4444-4444-8444-444444444444');
  expect(r.fiche).toMatchObject({ t: 0, d: 0, inconnu: true });
  expect(typeof r.fiche.n).toBe('string');
  expect(r.salonPrive).toBe(r.fiche.n);
  expect(r.messages).toBe(2);
  await expect(page.locator('.feed').first()).toContainText('bonjour de bob');
  await aller(page, 'accueil'); await aller(page, 'chat');
  expect(erreurs).toEqual([]);
});
