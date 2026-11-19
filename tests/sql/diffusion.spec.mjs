// Panneau d'administration, lot 5 : ce que le serveur diffuse en temps réel quand l'équipe agit (côté serveur seulement).
//  * sujet public « site » : un réglage public changé (« cfg »), l'annonce (« annonce »), la maintenance (« maint »), le
//    titre d'un marché corrigé (« marche ») ; un seul événement par changement, avec l'état final de la transaction ;
//  * le salon concerné : ses règles changées (« regle » : mode lent, fermeture), sur le sujet du salon (privé pour le VIP
//    et les clans, comme ses messages) ;
//  * sujet privé « joueur:<id> » : un blocage posé (« bloc ») ou levé (« debloc »), une déconnexion forcée (« deco ») ;
//    lui seul peut les lire.
// Rien n'est diffusé pour un réglage interne, une valeur inchangée, une autre colonne d'un marché, ni pour un joueur que
// l'équipe ne touche pas.
import { test, expect } from '@playwright/test';
import { creerBase, creerJoueur, enTantQue, q, semer } from './base.mjs';

test.describe.configure({ mode: 'serial' });
let db, chef, alice, bob, carol;
test.beforeAll(async () => {
  db = await creerBase(); await semer(db);
  chef = await creerJoueur(db, 'chef', 0);
  alice = await creerJoueur(db, 'alice', 1000); bob = await creerJoueur(db, 'bob', 1000); carol = await creerJoueur(db, 'carol', 1000);
  await q(db, `insert into public.admin_users (user_id, role) values ($1, 'super_admin')`, [chef]);
});
test.afterAll(async () => { await db.close(); });

const eq = (qui, action, p = {}) => enTantQue(db, qui, s => s('select public.api_equipe($1, $2::jsonb) as r', [action, JSON.stringify(p)])).then(r => r[0].r);
const adm = (qui, action, p = {}) => enTantQue(db, qui, s => s('select public.api_admin($1, $2::jsonb) as r', [action, JSON.stringify(p)])).then(r => r[0].r);
const vider = () => q(db, 'truncate realtime.messages');
// les messages diffusés, dans un ordre stable (ceux d'une même transaction ont la même heure)
const recus = async () => (await q(db, 'select topic, event, private, payload from realtime.messages'))
  .sort((a, b) => (a.topic + a.event + JSON.stringify(a.payload)).localeCompare(b.topic + b.event + JSON.stringify(b.payload)));
const site = async () => (await recus()).filter(m => m.topic === 'site');
const rev = async () => (await q(db, `select rev::integer as r from wm.revisions where nom = 'reglages'`))[0].r;
// ce qu'un joueur connecté à un sujet peut lire (règles de Supabase Realtime sur realtime.messages)
const recevable = (uid, sujet) => enTantQue(db, uid, async s => {
  await s(`select set_config('realtime.topic', $1, true)`, [sujet]);
  return s('select event, payload from realtime.messages where topic = $1', [sujet]);
});
const NOUVEAUX = ['cfg', 'annonce', 'maint', 'marche', 'regle', 'bloc', 'debloc', 'deco'];

test('un réglage public changé : « cfg » sur le sujet public « site », avec la révision ; interne, inchangé ou autre colonne : rien', async () => {
  await vider();
  await eq(chef, 'reglage_modifier', { cle: 'frais.k', valeur: 0.6, motif: 'promotion de novembre' });
  expect(await recus()).toEqual([{ topic: 'site', event: 'cfg', private: false, payload: { cle: 'frais.k', v: 0.6, rev: await rev() } }]);
  await vider();
  await eq(chef, 'reglage_modifier', { cle: 'equipe.moderateur_solde_max', valeur: 500, motif: 'prudence' });
  await q(db, `update wm.reglages set valeur = valeur where cle = 'frais.k'`);                               // même valeur
  await q(db, `update wm.reglages set explication = explication || '' , ordre = ordre where cle = 'paris.mise_min'`);   // autre colonne
  expect(await recus()).toEqual([]);
  // l'annulation passe par la même voie : la valeur d'avant est diffusée
  const [{ id }] = await q(db, `select id from wm.journal where action = 'reglage_modifier' and cible = 'frais.k' order by id desc limit 1`);
  await eq(chef, 'journal_annuler', { id, motif: 'fin de la promotion' });
  expect(await recus()).toEqual([{ topic: 'site', event: 'cfg', private: false, payload: { cle: 'frais.k', v: 0.7, rev: await rev() } }]);
});

test('annonce publiée puis retirée : « annonce » sur « site », avec l’annonce en cours (ou rien)', async () => {
  await vider();
  const { annonce } = await eq(chef, 'annonce_publier', { textes: { fr: 'Maintenance prévue dimanche à 3 h.' }, ton: 'alerte', motif: 'prévenir les joueurs' });
  expect(await recus()).toEqual([{ topic: 'site', event: 'annonce', private: false, payload: { annonce, rev: await rev() } }]);
  expect(annonce).toMatchObject({ t: { fr: 'Maintenance prévue dimanche à 3 h.' }, ton: 'alerte' });
  await vider();
  await eq(chef, 'annonce_retirer', { motif: 'maintenance faite' });
  expect(await recus()).toEqual([{ topic: 'site', event: 'annonce', private: false, payload: { annonce: null, rev: await rev() } }]);
});

test('maintenance : un seul « maint » par action, avec l’état final (en cours et message)', async () => {
  await vider();
  await eq(chef, 'maintenance', { actif: true, message: { fr: 'Retour dans dix minutes.' }, motif: 'mise à jour du serveur' });
  expect(await recus()).toEqual([{ topic: 'site', event: 'maint', private: false,
    payload: { actif: true, message: { fr: 'Retour dans dix minutes.' }, rev: await rev() } }]);
  await vider();
  await eq(chef, 'maintenance', { actif: false, motif: 'mise à jour terminée' });                         // le message reste
  expect(await recus()).toEqual([{ topic: 'site', event: 'maint', private: false,
    payload: { actif: false, message: { fr: 'Retour dans dix minutes.' }, rev: await rev() } }]);
});

test('règles d’un salon : « regle » sur le sujet du salon (privé pour le VIP et un clan), et « cfg » sur « site »', async () => {
  const regles = async () => (await recus()).filter(m => m.event === 'regle');
  await vider();
  await eq(chef, 'salon_regler', { salon: 'general', lent: 30, motif: 'trop de messages' });
  expect(await regles()).toEqual([{ topic: 'salon:general', event: 'regle', private: false, payload: { salon: 'general', lent: 30, ferme: false } }]);
  expect((await site()).map(m => [m.event, m.payload.cle, m.payload.v])).toEqual([['cfg', 'chat.salons', { general: { lent: 30, ferme: false } }]]);
  await vider();
  await eq(chef, 'salon_regler', { salon: 'vip', ferme: true, motif: 'nettoyage' });
  expect(await regles()).toEqual([{ topic: 'vip', event: 'regle', private: true, payload: { salon: 'vip', lent: 0, ferme: true } }]);
  await vider();
  await eq(chef, 'salon_regler', { salon: 'clan:u1', ferme: true, motif: 'clan à vérifier' });
  expect(await regles()).toEqual([{ topic: 'clan:u1', event: 'regle', private: true, payload: { salon: 'clan:u1', lent: 0, ferme: true } }]);
  await vider();
  await eq(chef, 'salon_regler', { salon: 'general', lent: 0, motif: 'calme revenu' });                  // retour à la normale
  expect(await regles()).toEqual([{ topic: 'salon:general', event: 'regle', private: false, payload: { salon: 'general', lent: 0, ferme: false } }]);
});

test('blocage posé puis levé, déconnexion forcée : « bloc », « debloc », « deco » sur le sujet privé du joueur, lisible par lui seul', async () => {
  await vider();
  const r = await eq(chef, 'joueur_bloquer', { id: alice, acces: 'chat', salon: 'general', duree: '24h', motif: 'insultes' });
  const [m] = await recus();
  expect(await recus()).toEqual([{ topic: 'joueur:' + alice, event: 'bloc', private: true,
    payload: { id: r.blocage, acces: 'chat', salon: 'general', fin: expect.any(Number) } }]);
  expect(m.payload.fin).toBeGreaterThan(Date.now() + 23 * 3600000);
  // la même forme que ce que le joueur lit avec api_mes_blocages
  expect((await enTantQue(db, alice, s => s('select public.api_mes_blocages() as r')))[0].r.blocages).toEqual([m.payload]);
  expect((await recevable(alice, 'joueur:' + alice)).map(x => x.event)).toEqual(['bloc']);
  expect(await recevable(bob, 'joueur:' + alice)).toEqual([]);                                    // un autre joueur : rien
  await expect(recevable(null, 'joueur:' + alice)).rejects.toThrow(/permission denied/);          // un visiteur : refusé

  await vider();
  await eq(chef, 'joueur_debloquer', { id: r.blocage, motif: 'excuses présentées' });
  expect(await recus()).toEqual([{ topic: 'joueur:' + alice, event: 'debloc', private: true, payload: { id: r.blocage, acces: 'chat', salon: 'general' } }]);
  // annuler la levée remet le blocage : le joueur en est prévenu de la même façon
  await vider();
  const [{ id: j }] = await q(db, `select id from wm.journal where action = 'joueur_debloquer' order by id desc limit 1`);
  await eq(chef, 'journal_annuler', { id: j, motif: 'levée trop tôt' });
  expect((await recus()).map(x => [x.topic, x.event, x.payload.acces, x.payload.salon, x.payload.fin])).toEqual([['joueur:' + alice, 'bloc', 'chat', 'general', m.payload.fin]]);

  await vider();
  await eq(chef, 'joueur_bloquer', { id: bob, acces: 'site', duree: 'permanent', motif: 'fraude au parrainage' });
  expect((await recus()).map(x => [x.topic, x.event, x.payload.acces, x.payload.salon, x.payload.fin])).toEqual([['joueur:' + bob, 'bloc', 'site', null, -1]]);
  await vider();
  await eq(chef, 'joueur_deconnecter', { id: bob, motif: 'session volée' });
  expect(await recus()).toEqual([{ topic: 'joueur:' + bob, event: 'deco', private: true, payload: { at: expect.any(Number) } }]);
  expect((await recus())[0].payload.at).toBeGreaterThan(Date.now() - 60000);
});

test('titre d’un marché corrigé : « marche » sur « site » ; création, même titre ou autre colonne : rien sur « site »', async () => {
  const def = { id: 'pluie-paris', q: 'Pleuvra-t-il à Paris dimanche ?', short: 'Pluie à Paris', cat: 'Météo', date: '2027-03-07', time: '18:00', p: 40, heat: 2, rules: 'Oui si Météo-France relève au moins 1 mm.' };
  await vider();
  await adm(chef, 'marche', def);
  expect(await site()).toEqual([]);
  await adm(chef, 'marche', { ...def, q: 'Pleuvra-t-il à Paris dimanche après-midi ?' });
  expect(await site()).toEqual([{ topic: 'site', event: 'marche', private: false,
    payload: { id: 'pluie-paris', q: 'Pleuvra-t-il à Paris dimanche après-midi ?', short: 'Pluie à Paris' } }]);
  await vider();
  await adm(chef, 'marche', { ...def, q: 'Pleuvra-t-il à Paris dimanche après-midi ?', short: 'Pluie dimanche' });
  expect((await site()).map(m => m.payload)).toEqual([{ id: 'pluie-paris', q: 'Pleuvra-t-il à Paris dimanche après-midi ?', short: 'Pluie dimanche' }]);
  await vider();
  await adm(chef, 'marche', { ...def, q: 'Pleuvra-t-il à Paris dimanche après-midi ?', short: 'Pluie dimanche', p: 60 });   // même titre
  await q(db, `update public.markets set heat_level = 3, updated_at = now() where id = 'btc150k'`);                         // autre colonne
  expect(await site()).toEqual([]);
});

test('un joueur que l’équipe ne touche pas : ses actions ne diffusent aucun des nouveaux événements', async () => {
  await vider();
  await enTantQue(db, carol, s => s(`select public.api_buy('btc150k', 'oui', 10, gen_random_uuid())`));
  await enTantQue(db, carol, s => s(`select public.api_chat_send('general', 'bonjour à tous')`));
  await enTantQue(db, carol, s => s(`select public.api_demo_deposit('{"method":"crypto","coin":"USDC","net":"Base","amt":50}'::jsonb, gen_random_uuid())`));
  const m = await recus();
  expect(m.length).toBeGreaterThan(0);                                                            // les événements habituels (cours, salon…)
  expect(m.filter(x => NOUVEAUX.includes(x.event) || x.topic === 'site')).toEqual([]);
});
