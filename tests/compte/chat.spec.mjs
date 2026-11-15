// Chat en mode Compte : salons publics (général et marchés). Le serveur enregistre et diffuse ; l'écran s'abonne
// seulement aux salons affichés, charge leur historique, et montre chaque message avec le pseudo et le rang de son auteur.
// Couvre la recette 5 (partie chat) avec le faux serveur ; tests/e2e/comptes.spec.mjs fait la même chose sur le vrai.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, aller, UID, AMI } from '../helpers/app.mjs';

const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const salons = page => lire(page, () => __fakeSB.sujets().filter(s => s.startsWith('salon:')).sort());
const FICHE = { n: 'lea_reelle', t: 3, d: 1, tone: 2, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 12, fol: 3, bot: false, pub: 1 };
const ecrire = async (page, salon, texte) => {
  const champ = page.locator(`.composer input[data-in="${salon}"]`);
  await champ.fill(texte); await champ.press('Enter');
};

test('recette 5 · écrire dans le salon général : enregistré par le serveur, affiché une seule fois, 2 XP, toujours là après rechargement', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat' });
  expect(await lire(page, () => room('general').msgs.length), 'aucun message inventé par le navigateur').toBe(0);
  await ecrire(page, 'general', 'Bonjour tout le monde');
  await expect(page.locator('.feed[data-room="general"] .msg.mine')).toHaveCount(1);
  await page.waitForTimeout(150);                                                           // la diffusion revient aussi à l'auteur : pas de doublon
  expect(await lire(page, () => room('general').msgs.map(x => [x.u, x.k, x.text]))).toEqual([['me', 'msg', 'Bonjour tout le monde']]);
  expect(await lire(page, () => ({ xp: S.me.xp, messages: S.me.msgsTotal, mission: S.me.missions.find(m => m.id === 'chat1').have }))).toEqual({ xp: 2, messages: 1, mission: 1 });
  expect(await appels(page, 'api_chat_send')).toEqual([{ p_room: 'general', p_text: 'Bonjour tout le monde' }]);
  await expect(page.locator('.composer input[data-in="general"]')).toHaveValue('');
  await page.reload(); await pret(page);
  await expect(page.locator('.feed[data-room="general"] .msg.mine')).toHaveCount(1);        // relu dans l'historique du serveur
  expect(await lire(page, () => ({ msgs: room('general').msgs.map(x => [x.u, x.text]), xp: S.me.xp }))).toEqual({ msgs: [['me', 'Bonjour tout le monde']], xp: 2 });
  expect(erreurs).toEqual([]);
});

test('recette 5 · un message d’un autre joueur arrive en direct, avec son pseudo et son rang ; l’historique aussi', async ({ page }) => {
  const chat = { general: [{ id: 501, u: AMI, k: 'msg', text: 'Qui suit le Clásico ce soir ?', at: Date.now() - 60000 }] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { chat, fiches: { [AMI]: FICHE } } });
  const messages = page.locator('.feed[data-room="general"] .msg');
  await expect(messages).toHaveCount(1);
  await expect(messages.first().locator('.un')).toHaveText('lea_reelle');
  await expect(messages.first()).toContainText('Qui suit le Clásico ce soir ?');
  const n0 = await lire(page, () => __fakeSB.calls.length);
  await page.evaluate(([u, f]) => __fakeSB.emit('salon:general', 'msg', { id: 502, u, k: 'msg', text: 'Moi <b>oui</b> !', at: Date.now(), f: { ...f, t: 4, d: 2 } }), [AMI, FICHE]);
  await expect(messages).toHaveCount(2);
  await expect(messages.nth(1).locator('.un')).toHaveText('lea_reelle');
  await expect(messages.nth(1).locator('.tx')).toHaveText('Moi <b>oui</b> !');              // le HTML est échappé à l'affichage
  expect(await lire(page, u => ({ n: USERS[u].n, t: USERS[u].t, d: USERS[u].d }), AMI)).toEqual({ n: 'lea_reelle', t: 4, d: 2 });   // le rang à jour arrive avec le message
  await page.evaluate(u => __fakeSB.emit('salon:general', 'msg', { id: 502, u, k: 'msg', text: 'doublon', at: Date.now() }), AMI);
  await expect(messages).toHaveCount(2);                                                     // même identifiant : ignoré
  expect(await lire(page, n => __fakeSB.calls.slice(n).filter(c => c.kind === 'rpc').length, n0), 'aucune requête pour recevoir un message').toBe(0);
  expect(erreurs).toEqual([]);
});

test('on ne s’abonne qu’aux salons à l’écran, et l’historique n’est demandé qu’à l’ouverture', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#profil' });
  expect(await salons(page)).toEqual([]);
  await aller(page, 'chat');
  await expect.poll(() => salons(page)).toEqual(['salon:general']);
  await aller(page, 'marche-btc150k');
  await expect.poll(() => salons(page)).toEqual(['salon:m:btc150k']);
  await ecrire(page, 'm:btc150k', 'Je le vois monter');
  await expect(page.locator('.feed[data-room="m:btc150k"] .msg.mine')).toHaveCount(1);
  await aller(page, 'profil');
  await expect.poll(() => salons(page)).toEqual([]);
  await aller(page, 'marche-btc150k');                                                      // retour : réabonnement, pas de doublon
  await expect(page.locator('.feed[data-room="m:btc150k"] .msg.mine')).toHaveCount(1);
  expect((await appels(page, 'api_chat_history')).map(a => a.p_room)).toEqual(['general', 'm:btc150k', 'm:btc150k']);
});

for (const [code, texte] of [['trop_vite', 'Not so fast'], ['trop_de_messages', 'Too many messages'], ['message_repete', 'You just sent that message']]) {
  test(`anti-spam (${code}) : message clair, rien n’est affiché, le texte reste dans le champ`, async ({ page }) => {
    await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { rpc: { api_chat_send: { error: { message: code, code: 'P0001' } } } } });
    await ecrire(page, 'general', 'encore moi');
    await expect(page.locator('.toast', { hasText: texte }).first()).toBeVisible();
    expect(await lire(page, () => ({ msgs: room('general').msgs.length, xp: S.me.xp }))).toEqual({ msgs: 0, xp: 0 });
    await expect(page.locator('.composer input[data-in="general"]')).toHaveValue('encore moi');
  });
}

test('un salon pas encore relié (clan, privé) est annoncé comme tel : aucun message local, aucun appel', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#chat' });
  await page.evaluate(() => { const i = document.createElement('input'); i.dataset.in = 'clan:test'; i.value = 'coucou le clan'; document.body.appendChild(i); sendMsg('clan:test'); i.remove(); });
  await expect(page.locator('.toast', { hasText: 'Coming soon for accounts' }).first()).toBeVisible();
  expect(await appels(page, 'api_chat_send')).toEqual([]);
  expect(await lire(page, () => Object.values(S.rooms).reduce((n, r) => n + r.msgs.length, 0))).toBe(0);
});
