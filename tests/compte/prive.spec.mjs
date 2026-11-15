// Messages privés et sujet personnel en mode Compte : la conversation est écrite par le serveur, les messages et les
// notifications arrivent en direct par le sujet PRIVÉ du joueur. Recette 5 (dernière partie) avec le faux serveur ;
// tests/sql/prive.spec.mjs prouve côté base qu'un troisième joueur ne peut ni recevoir ni lire.
import { test, expect } from '@playwright/test';
import { ouvrir, lire, aller, UID, AMI } from '../helpers/app.mjs';

const FICHE = { n: 'lea_reelle', t: 2, d: 1, tone: 1, color: '#13804F', photo: '', bio: '', profit: 0, acc: 0, bets: 4, fol: 0, bot: false, pub: 1 };
const SALON = 'dm:' + [UID, AMI].sort().join(':');
const AMIS = { me: { xp: 400, settled: 3 }, friends: [AMI], users: { [AMI]: FICHE } };               // rang Bronze : messages privés débloqués
const pret = page => expect(page.locator('#view > *').first()).toBeAttached();
const appels = (page, nom) => lire(page, nom => __fakeSB.journal().filter(c => c.kind === 'rpc' && c.name === nom).map(c => c.args), nom);
const messages = page => lire(page, u => room('dm:' + u).msgs.filter(x => x.k === 'msg').map(x => [x.u, x.text]), AMI);

test('recette 5 · écrire à un ami : conversation chargée, message enregistré par le serveur, retrouvée après rechargement', async ({ page }) => {
  const chat = { [SALON]: [{ id: 801, u: AMI, k: 'msg', text: 'Tu joues ce soir ?', at: Date.now() - 60000 }] };
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#amis', faux: { fiches: { [AMI]: FICHE }, etat: AMIS, chat } });
  await page.locator('.frow', { hasText: 'lea_reelle' }).locator('[data-a="dm"]').click();
  await expect(page).toHaveURL(/#chat/);
  const fil = page.locator(`.feed[data-room="dm:${AMI}"] .msg`);
  await expect(fil).toHaveCount(1);                                                          // l'historique vient du serveur
  await expect(fil.first()).toContainText('Tu joues ce soir ?');
  const champ = page.locator(`.composer input[data-in="dm:${AMI}"]`);
  await champ.fill('Oui, à 21 h'); await champ.press('Enter');
  await expect(fil).toHaveCount(2);
  expect(await messages(page)).toEqual([[AMI, 'Tu joues ce soir ?'], ['me', 'Oui, à 21 h']]);
  expect(await appels(page, 'api_dm_send')).toEqual([{ p_user: AMI, p_text: 'Oui, à 21 h' }]);
  await page.waitForTimeout(2500);
  expect(await messages(page), 'aucune réponse inventée par le navigateur').toHaveLength(2);
  // le sujet du joueur est privé, et une conversation privée n'ouvre aucun sujet public
  expect(await lire(page, () => __fakeSB.prives())).toEqual(['joueur:' + UID]);
  expect(await lire(page, () => __fakeSB.sujets().filter(s => s.startsWith('salon:dm')))).toEqual([]);
  await page.reload(); await pret(page);
  await aller(page, 'chat');
  await expect(page.locator(`[data-a="troom"][data-room="dm:${AMI}"]`).first()).toBeVisible();   // la conversation est dans la liste
  await page.locator(`[data-a="troom"][data-room="dm:${AMI}"]`).first().click();
  await expect(page.locator(`.feed[data-room="dm:${AMI}"] .msg`)).toHaveCount(2);
  expect(erreurs).toEqual([]);
});

test('un message privé et une demande d’ami arrivent en direct par le sujet privé du joueur', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { fiches: { [AMI]: FICHE }, etat: AMIS } });
  const n0 = await lire(page, () => __fakeSB.calls.length);
  await page.evaluate(([moi, ami, f]) => __fakeSB.emit('joueur:' + moi, 'dm', { id: 901, u: ami, k: 'msg', text: 'Bien joué hier !', at: Date.now(), f }), [UID, AMI, FICHE]);
  await expect.poll(() => messages(page)).toEqual([[AMI, 'Bien joué hier !']]);
  expect(await lire(page, u => room('dm:' + u).unread, AMI)).toBe(1);                         // la conversation n'est pas à l'écran : pastille « non lu »
  expect(await lire(page, n => __fakeSB.calls.slice(n).filter(c => c.kind === 'rpc').length, n0), 'aucune requête pour recevoir').toBe(0);
  // une notification poussée par le serveur : la cloche se met à jour, et les listes d'amis sont relues
  const autre = '44444444-4444-4444-8444-444444444444';
  await page.evaluate(([moi, autre, f]) => { const e = __fakeSB.etat(), n = { id: 'n-direct', ic: 'users', code: 'fr_demande', p: { u: autre, n: 'nouvel_ami' }, href: '#amis', at: Date.now(), read: false };
    e.freqIn.push(autre); e.users[autre] = { ...f, n: 'nouvel_ami' }; e.notifs.unshift(n); __fakeSB.db.fiches[autre] = { ...f, n: 'nouvel_ami' }; __fakeSB.persist();   // ce que le serveur a enregistré…
    __fakeSB.emit('joueur:' + moi, 'notif', { n }); }, [UID, autre, FICHE]);                                                                                          // … et ce qu'il pousse en direct
  await expect.poll(() => lire(page, () => S.me.notifs[0] && S.me.notifs[0].text)).toBe('nouvel_ami wants to add you as a friend.');
  await expect.poll(() => lire(page, () => S.me.freqIn.slice())).toEqual([autre]);
  expect(erreurs).toEqual([]);
});

test('le serveur refuse d’écrire à quelqu’un qui n’est pas un ami : message clair, rien n’est affiché', async ({ page }) => {
  await ouvrir(page, { mode: 'compte', hash: '#chat', faux: { fiches: { [AMI]: FICHE }, etat: { me: { xp: 400, settled: 3 } } } });
  await page.evaluate(u => { const i = document.createElement('input'); i.dataset.in = 'dm:' + u; i.value = 'coucou'; document.body.appendChild(i); sendMsg('dm:' + u); }, AMI);
  await expect(page.locator('.toast', { hasText: 'need to be friends' }).first()).toBeVisible();
  expect(await messages(page)).toEqual([]);
});
