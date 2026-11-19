# Le back (Supabase)

Projet Supabase `brmwvxncyeypefsgiepf`, offre gratuite. Tout le back est versionné dans `supabase/` :

- `migrations/0000_baseline.sql` — photo du schéma au début de la réparation (46 tables, 71 fonctions, 92 règles) ;
- `migrations/2026…_nom.sql` — une migration par changement, dans l'ordre. Le nom de fichier porte le numéro de version
  attribué par Supabase, et son contenu est **identique, à l'octet près**, à ce qui a été appliqué (voir
  `tools/verifier-migrations.mjs`) ;
- `functions/connexion/` — l'Edge Function de connexion par pseudo ;
- `historique/` — les 22 anciennes migrations, pour mémoire ; `AUTH_REGLAGES.md` — les réglages d'authentification.

## 1. Principe

Le navigateur n'écrit **jamais** directement dans une table. Il appelle des fonctions, une par action :

- les fonctions publiques **`api_…`** (schéma `public`) sont les seules portes d'entrée. Ce sont de simples relais, sans
  privilège (`SECURITY INVOKER`) ;
- la logique vit dans le schéma privé **`wm`**, invisible de l'API. Ses fonctions s'exécutent avec les droits du
  propriétaire (`SECURITY DEFINER`), avec `search_path` vide, et vérifient toujours l'identité de l'appelant
  (`wm.uid()`) ;
- **`wm.droits()`** distribue les droits d'appel, à la fin de chaque migration : toute fonction `api_x` est ouverte aux
  joueurs connectés (avec la fonction `wm.x` qu'elle appelle) ; seules `api_markets`, `api_pseudo_libre`, `api_site`,
  `api_live` et `api_fixations` sont ouvertes aux visiteurs (la liste se complète par la table `wm.droits_liste`, sans réécrire `wm.droits`) ;
  tout le reste de `wm` est fermé. Test : `tests/sql/missions.spec.mjs`.

Une fonction qui modifie quelque chose renvoie `{ me, ev, … }` : `me` est le profil et les compteurs à jour, `ev` la liste
de ce que l'écran doit montrer (`xp`, `notif`, `badge`, `mission`, `dep`, `wd`). Une erreur métier est un **code**
(`solde_insuffisant`, `pause`…), jamais une phrase. Les opérations d'argent prennent une **clé d'idempotence** : rejouée
avec la même clé, l'opération n'est appliquée qu'une fois et renvoie le même résultat (table `wm.ops`).

## 2. Les fonctions

| Fonction | Qui | Rôle |
|---|---|---|
| `api_state()` | joueur | tout l'état du joueur : profil, positions, historique, dépôts, retraits, notifications, missions, badges, amis, préférences, jeu responsable. Règle au passage les dépôts et retraits arrivés à échéance |
| `api_pseudo_libre(pseudo)` | visiteur | le pseudo est-il disponible ? |
| `api_profile_update(p)` | joueur | pseudo (unique), bio, couleur, avatar, centres d'intérêt, profil public ou privé |
| `api_onboarding(p)` | joueur | étapes de bienvenue ; 100 XP une seule fois |
| `api_prefs_save(prefs)` | joueur | préférences d'interface (rien d'autre) |
| `api_rank_seen(rang)`, `api_notifs_read()`, `api_notif_hide(id)` | joueur | popup de rang déjà vu, notifications lues ou masquées |
| `api_markets()` | visiteur | état de tous les marchés (prix, volume, participants, profondeur, courbe) ; signale une présence |
| `api_present()` | joueur | « quelqu'un regarde » : garde les bots éveillés |
| `api_buy(marché, côté, montant, clé)` | joueur | achat au carnet d'ordres ; refuse pendant une pause |
| `api_sell(marché, côté, parts, clé)` | joueur | vente |
| `api_demo_deposit(p, clé)` | joueur | dépôt **fictif** (crypto, carte, virement, PayPal) : en attente, crédité à l'échéance |
| `api_demo_withdraw(p, clé)` | joueur | retrait **fictif** : débité tout de suite, « envoyé » à l'échéance |
| `api_demo_settle()` | joueur | règle ce qui est arrivé à échéance |
| `api_demo_kyc(p)` | joueur | KYC **fictif** ; les données saisies ne sont pas conservées |
| `api_rg_limit(k, v)`, `api_rg_pend_cancel(k)` | joueur | plafond de dépôt par jour, semaine ou mois |
| `api_rg_pause(heures)`, `api_rg_exclude(mois)` | joueur | pause ; auto-exclusion |
| `api_mission_claim(id)` | joueur | récupérer les XP d'une mission terminée |
| `api_chat_history(salon)` | joueur | les 60 derniers messages d'un salon (le général, celui d'un marché, ou `clan:<identifiant>` pour un membre de ce clan), la fiche de leurs auteurs et les réactions du lecteur (`mes`) |
| `api_chat_react(salon, message, réaction)` | joueur | poser ou retirer sa réaction (🔥 👀 💸 🎯) sous un message de joueur, de bot ou privé (`salon` = `dm:<ami>`). Compteurs dans `chat_messages.reactions` (joueurs) ou dans l'anneau `wm.chat_bots` (bots) ; `wm.chat_reactions` ne garde que les réactions des vrais joueurs ; 40 par minute (`wm.debit`). Les bots réagissent par `wm.chat_bot_reagir`, appelée par la tâche `wm-bots-chat` |
| `api_chat_seen(salons)` | joueur | « j'ai toujours ces salons à l'écran » : les bots ne parlent que là où quelqu'un lit |
| `api_chat_send(salon, texte)` | joueur | écrire dans le salon général ou celui d'un marché ; anti-spam ; diffusé aux lecteurs du salon |
| `api_chat_share(salon, marché, côté)`, `api_chat_follow(message)` | joueur | partager une de ses positions dans un salon (rang Bronze, une fois par 24 heures et par position) et suivre la mise partagée par un autre joueur (rang Argent, même pari demandé). Les suivis sont notés dans `wm.chat_suivis` ; ceux des bots, programmés au partage, sont crédités par `wm.chat_suivis_tick` (tâche `wm-suivis`) : compteur de la carte, 20 XP et une « mise suivie » pour l'auteur |
| `api_dm_send(joueur, texte)`, `api_dm_history(joueur)`, `api_dm_list()` | joueur | messages privés entre amis (rang Bronze pour écrire) ; conversations de leurs deux participants seulement |
| `api_leaderboard()` | joueur | les 50 meilleurs gains (fiches publiques, vrais joueurs et bots) |
| `api_users_search(texte)` | joueur | dix joueurs au plus dont le pseudo contient le texte (fiches publiques, jamais d'e-mail) |
| `api_friend(action, joueur)` | joueur | `add`, `accept`, `cancel`, `decline`, `remove` ; rend les trois listes à jour |
| Edge Function `connexion` | visiteur | connexion par pseudo, sans jamais révéler d'e-mail ; limite les tentatives |
| Edge Function `eclair` | joueur | pari éclair : `bet` (miser ; `reel: true` pour une manche que le nouveau front joue sur les vrais cours, § 10) et `settle` (régler les manches terminées). La Série : `serie_start`, `serie_play`, `serie_cash`, `serie_settle` — le moteur du serveur fixe l'heure de début, le prix de départ, la cote et l'issue ; l'argent et l'état sont tenus par `srv_serie_…` (clé de service seulement, table `wm.series`). Blitz Royale : `blitz_state`, `blitz_join`, `blitz_choose`, `blitz_rebuy`, `blitz_settle` — la salle simulée vient du moteur, les vrais joueurs de `wm.blitz_joueurs` (fonctions `srv_blitz_…`) |

| `api_duel_create(p)`, `api_duel_accept(p)`, `api_duel_close(id, action)`, `api_duel_code(code)`, `api_duels()` | joueur | duels entre amis sur un marché : mise sous séquestre, cote du marché à l'acceptation, remboursement si refusé ou expiré ; réglés par la résolution du marché (`wm.duels`). Refuser, annuler, lire un lien et lister valent aussi pour les duels éclair |
| `api_stack_create(p)`, `api_stacks()` | joueur | duels de stack (`wm.stacks`) : buy-in pris, stack du joueur lu sur ses résultats réels (`wm.resultat`), adversaire simulé (`wm.stack_adverse`), règlement au premier passage après sept jours (`wm.stacks_avant`, étape de `api_state`) ; un vrai joueur ne peut pas être défié (`stack_joueur_reel`) |
| Edge Function `eclair`, actions `duel_create`, `duel_accept`, `duel_settle` | joueur | duels sur une manche éclair (`wm.duels`, `m = flash:<jeu>`, colonne `manche`) : le moteur donne le prix du camp, les frais et l'issue ; la base fixe la manche, garde les mises et règle, par les fonctions `srv_duel_eclair_…` réservées à la clé de service |
| `api_proposal_create(p)`, `api_proposal_vote(id, vote)`, `api_proposals()` | joueur | propositions de marché : rang Or pour proposer, texte filtré, votes de la communauté déduits du temps écoulé, mise en ligne à 25 votes (`wm.prop_promouvoir` crée le marché, son carnet et son chat). Tables `wm.propositions`, `wm.propositions_votes` |
| `api_copy_start(p)`, `api_copy_set(id, action)` | joueur | copy trading : créer ou régler une copie, pause, reprise, arrêt. Les paris copiés sont exécutés par `wm.copie_executer` (même carnet que `api_buy`), déclenchés à la fin de l'opération du joueur copié (déclencheur différé sur `balance_ledger`) ou par la tâche `wm-copies` pour les bots copiés. Tables `wm.copies`, `wm.copies_lots`, `wm.copies_journal` |
| `api_clan_join(clan, code)`, `api_clan_apply(clan)`, `api_clan_leave()`, `api_clan_create(p)`, `api_clan()` | joueur | clans : appartenance (un clan à la fois, 7 jours d'attente après un départ), candidature, création (frais de 50 $), contribution (déclencheur `clan_compter` sur `balance_ledger`). La fiche publique (`wm.fiche`) porte le clan du joueur. Tables `wm.clans_demo` (annuaire de démonstration), `wm.clans_joueurs`, `wm.clan_membres`, `wm.clan_candidatures` |
| `api_clan_promote(joueur)`, `api_clan_kick(joueur)`, `api_clan_invite(joueur)`, `api_clan_call(marché, côté)` | chef, officier | nommer un officier (chef seul, 5 au plus), exclure, inviter un ami (un bot rejoint, un vrai joueur reçoit le code), lancer un appel de clan. Le fil d'activité (`wm.clan_fil`) et les appels (`wm.clan_appels`) reviennent avec `api_clan` (`feed`, `calls`) |
| `api_clan_war()`, `api_clan_war_join()` | chef ; membre | déclarer la guerre (48 heures, clan adverse de démonstration tiré au sort dans la division) ; y participer (buy-in de 20 $, une seule fois). La guerre en cours (`war`) et les guerres terminées (`wars`) reviennent avec `api_clan` ; le règlement (`wm.clan_guerres_avancer` : dix meilleurs de chaque camp, cagnotte moins 4 %, 50 XP) se fait avec `api_state` et `api_clan`, au passage d'un membre du clan ou d'un participant. Tables `wm.clan_guerres`, `wm.clan_guerre_joueurs` |
| `api_ana_share(instantané, salons, commentaire)`, `api_ana(messages)` | joueur | partager une analyse du Mode Pro dans un à quatre salons (général, marché analysé, son clan, un ami) : l'instantané est remis au propre (`wm.ana_propre`) puis gardé dans `wm.analyses` ; chaque message de chat (type `ana`) ne porte qu'une référence. `api_ana` rend les instantanés de six messages au plus, avec les droits du salon de chaque message |
| salon `vip` (par `api_chat_send`, `api_chat_history`, `api_chat_react`, `api_chat_share`, `api_ana_share`) | joueur du rang Ascendant | le salon VIP suit les règles des autres salons ; `wm.chat_salon_ok` décide de l'accès à un salon (général, marché, son clan, VIP avec le rang) ; diffusion sur le sujet privé `vip` (`wm.chat_diffuser`, règle `wm_vip_lit_son_salon`) |
| salon `blitz` (par `api_chat_send`, `api_chat_history`, `api_chat_react`) | joueur | le chat du Blitz, salon public (sujet `salon:blitz`) ; les bots y parlent par le gabarit « Z » (`wm.chat_bot_msg`) |
| `api_chat_share('dm:<ami>', marché, côté)` | joueur (rang Bronze, ami) | partager une mise dans une conversation privée : carte poussée au seul ami (`joueur:<ami>`, événement `dm`) ; `api_chat_follow` n'y est ouvert qu'à l'autre participant, et le compteur (`fc`) part sur les deux sujets privés |
| `api_follow(joueur, oui)` | joueur | suivre ou ne plus suivre un joueur (`public.user_following`, compteurs d'abonnés dans `user_stats`) |
| (organisation) `wm.etat_blocs`, `wm.suites_blocs` | interne | blocs de `api_state` et étapes exécutées après la résolution d'un marché : un lot enregistre sa fonction dans la table au lieu de réécrire `wm.state()` ou `wm.marche_suites()` |
| (pas de fonction dédiée : `api_state` → `ref`) | joueur | parrainage : code du joueur, code qui l'a parrainé, filleuls. Le code saisi à l'inscription est lu par le déclencheur de création du compte (`wm.ref_appliquer`) ; le bonus du parrain part au premier pari du filleul (déclencheur `ref_premier_pari` sur `user_stats`, rattrapage par `wm.ref_regler` au chargement). Tables `wm.ref_codes`, `wm.parrainages` |
| `api_combo_place(p)`, `api_combo_cash(id)`, `api_combos()` | joueur | paris combinés : prix bloqués à la validation, encaissement à la valeur du moment, règlement à la résolution des marchés (`wm.combos`) |
| `api_admin(action, paramètres)` | administrateur | la porte de l'ancien panel d'administration (`admin.html`) : `moi`, `chiffres`, `joueurs`, `joueur`, `solde`, `xp`, `rang`, `kyc`, `suspendre`, `marches`, `marche`, `marche_etat`, `resoudre`, `chat`, `masquer`, `bots`, `journal`. Refusée (`interdit`) à tout compte absent de `public.admin_users`, ou présent mais retiré de l'équipe (ou devenu modérateur) ; `mfa_requise` si le compte a un code de double authentification et que la session n'est pas `aal2`. Chaque modification est écrite dans `wm.admin_journal`, et recopiée dans `wm.journal` (§ 9) |
| `api_equipe(action, paramètres)` | équipe (administrateur, modérateur) | la porte du nouveau panneau : rôle vérifié à chaque appel, registre des actions, double authentification, motif, journal en ajout seul. Détail au § 9 |
| `api_site()` | visiteur | ce que l'écran doit savoir du site : réglages publics (`v`), révision (`rev`), annonce en cours, maintenance (`{actif, message}`). Ne réveille pas les bots |
| `api_live(serie)` | visiteur | l'instantané des données réelles (§ 10) : `cours` (37 actifs : prix `p`, état `e` d/r/s, heure `t`, place ouverte `o`), `familles`, `eclair` (lot 7 : modes des manches et dernières fixations ; `{on: false, r}` tant que tout est simulé), `next` (rythme conseillé, ms) ; avec `serie` = un actif, la courbe de ses 90 dernières secondes. Un seul accès à la base, ne réveille pas les bots |
| `api_fixations(jeu, de, a)` | visiteur | pari éclair à cours réels (§ 10, lot 7) : les modes figés des manches `de` à `a` (100 au plus, 48 h au plus) et les fixations de `de − 2` à `a + 1` — de quoi calculer l'issue, la cagnotte et les gains avec le moteur, exactement comme le serveur (compte Démo, visiteurs) |
| `api_mes_blocages()` | joueur | ses blocages en cours : `[{id, acces, salon, fin}]` (`fin` en millisecondes, -1 : sans fin). Pour griser un bouton ; le serveur refuse de toute façon |
| `api_test_end()` | compte de test | un compte `wimoro-e2e-…@example.com` se supprime lui-même à la fin des tests ; refusée à tout autre compte |

Les **anciennes fonctions** (`place_bet`, `demo_deposit`, `get_markets`, `send_chat_message`…) existent toujours dans
la base, mais **plus personne ne peut les appeler** depuis la mise en ligne du 15 novembre 2026 (migration
`fermeture_ancienne_api`). De même, les visiteurs et les joueurs n'ont plus aucun droit direct sur les tables : tout
passe par les fonctions `api_…`. Les policies de lecture sont restées en place, sans effet tant qu'aucun droit de
lecture n'est rendu. Retour arrière : `supabase/livraison/retour_ancienne_api.sql` (voir `docs/EXPLOITATION.md`, § 2).

## 3. Marchés et moteur de prix

- `wm.quote_buy`, `wm.quote_sell` : portage exact de `js/engine.js` (carnet d'ordres, frais, impact). Le test
  `tests/sql/moteur.spec.mjs` compare les deux sur 600 cas tirés au hasard : même résultat à 1e-9 près. L'aperçu du
  ticket et l'exécution donnent donc la même chose pour un même état du marché.
- `wm.buy`, `wm.sell` : atomiques. Verrou du joueur, puis du marché et de ses issues sœurs, toujours dans le même ordre.
- Contrepartie : chaque part achetée par un joueur est tenue en face par le teneur de marché (`open_yes`, `open_no`,
  `mm_cash`, `fees` dans `market_live_state`). Débit du joueur = coût + frais, au centime. Seule la liquidité du marché
  limite une mise (pas de plafond lié au rang).
- Marchés à plusieurs issues : `wm.group_rebalance` garde le total à exactement 100 %.
- Prix à 6 décimales : un petit ordre fait bouger le prix ; un ordre découpé paie le même impact.
- Les frais (`wm.fee_rate` : taux de la catégorie × multiplicateur × remise du rang Diamant) et les bornes des mises
  lisent les réglages (`wm.reglages`, § 9) ; `wm.fee_rate` et `wm.quote_buy` sont `STABLE` depuis le 19 nov. 2026. Avec
  les valeurs par défaut, le résultat est exactement celui d'avant (`tests/sql/reglages-frais.spec.mjs`). **Attention** :
  l'aperçu du ticket est calculé par `js/engine.js` avec ses propres constantes ; si un administrateur change un frais,
  l'aperçu restera faux tant que l'écran ne lit pas `api_site()` (lot de l'interface).

## 4. Bots teneurs de marché

`wm.bots_tick()`, lancé toutes les 3 secondes par pg_cron (tâche `wm-bots`) : chaque marché a une ancre qui dérive
lentement ; les bots misent de façon à ramener le prix vers l'ancre ; de temps en temps une rafale dans un sens (signal
de foule) ; la profondeur du carnet suit le volume avec retard. C'est la logique du mode Démo (`botBet`, `driftAnchors`,
`burst`, `growLiq`).

- **Aucune ligne créée par action de bot** : les marchés sont mis à jour en place. Un seul message diffusé par tick.
- **Veille** : sans joueur présent depuis 6 minutes, un tick sur dix seulement et aucune diffusion.
- **Tenue dans le temps** : chaque ancre est rappelée de 2 % de son écart vers la probabilité de référence du marché
  (table `markets`) ; sans cela les prix se polarisent vers 5 % ou 95 % en quelques heures.
- **Réglage** : table `wm.config`, clé `bots`, valeur `{"actif": true, "intensite": 1, "rappel": 0.02}` (intensité de 0 à 3,
  rappel de 0 à 0,2).
- Mesuré en production : 22 ms par tick en moyenne, 920 octets par message.

## 4 bis. Pari éclair

Le pari éclair est déterministe : la manche, les prix, la cagnotte de départ, les mises des joueurs simulés et l'issue se
déduisent de l'heure. Le calcul vit dans `js/moteur-eclair.js`, module pur ; l'Edge Function `eclair` en embarque une
**copie conforme** (`supabase/functions/eclair/moteur-eclair.js` ; un test vérifie que les deux fichiers sont identiques).

- **Miser** : l'Edge Function lit SON horloge (manche, tick, mises ouvertes 30 secondes), calcule les frais et la cote du
  break even avec le moteur, puis appelle `srv_eclair_miser`. La base revérifie l'heure, la pause, le solde et l'unicité
  (une mise par pari et par manche), puis débite. Table `wm.eclair_mises`.
- **Régler** : `srv_eclair_ouvertes` rend les mises des manches terminées ; l'Edge Function rejoue chaque manche (cagnotte,
  issue, gain) ; `srv_eclair_regler` crédite, tient les statistiques (série, victoires contre la foule), l'historique, les
  XP (40, ou 120 sur un break even), les missions, et crée une notification si la manche est réglée après coup.
- Les fonctions `srv_…` ne sont appelables qu'avec la clé de service : un joueur ne fixe ni ses frais ni son gain.
- Après une modification de `js/moteur-eclair.js` : recopier le fichier dans `supabase/functions/eclair/` **et**
  `supabase/functions/donnees/` (lot 7), redéployer les deux fonctions et relancer `node tools/version.mjs` (empreinte
  anti-cache de la page), sinon l'écran et le serveur ne calculeraient plus la même chose.
- Cours réels (lot 7, interrupteur `eclair.cours_reels`, éteint) : voir le § 10 et `docs/DONNEES.md` § 2.5.
- Le nouveau front joue déjà les vrais cours, par client, interrupteur éteint (partie D) : règle commune dans
  `js/moteur-reel.js`, copie conforme dans `supabase/functions/eclair/` (même consigne : recopier, redéployer `eclair`,
  `node tools/version.mjs`). Voir le § 10 et `docs/DONNEES.md` § 2.6.

## 5. Argent fictif et jeu responsable

Tout est nommé « démo » dans le code et la base (`api_demo_…`, `wm.demo_…`, écritures `demo_deposit` et `demo_withdraw`
du journal `balance_ledger`). Les barèmes (monnaies, réseaux, minimums, frais) sont dans `wm.argent()`, copie de ceux du
front ; depuis le 19 nov. 2026, chaque valeur réglable y est remplacée par son réglage (`wm.argent_regle`), et deux
plafonds du site s'ajoutent, vides par défaut : `depots.max_jour` (`limite_depot`) et `retraits.max` (`retrait_max`). Un dépôt naît « en attente » avec une échéance (`due_at` = nombre de confirmations × 650 ms) ; `wm.demo_regler`
le crédite quand elle est passée, avec ses effets (mission, 100 XP au premier dépôt du jour, rang, badge).

Jeu responsable (`wm.rg`) : plafonds de dépôt (une baisse est immédiate, une hausse attend 48 heures), pause (ni pari ni
dépôt, retrait possible, impossible à écourter), auto-exclusion (`wm.uid()` refuse alors toute fonction du compte).

## 6. Sécurité

- RLS activée sur toutes les tables. Les tables du schéma `wm` et celles de la sauvegarde n'ont volontairement aucune
  règle : aucun client n'y accède, seules les fonctions le peuvent.
- Aucun e-mail n'est lisible par un autre utilisateur ni par un visiteur (droits par colonne sur `users`).
- Aucune écriture directe du client sur le solde, les positions, les statistiques, les dépôts ou l'état des marchés.
- Seule la clé publique figure dans le code du site. La clé de service n'existe que dans les Edge Functions.

### Sujets temps réel

| Sujet | Accès | Contenu |
|---|---|---|
| `marches` | public | un message par tick des bots et par achat ou vente : marchés modifiés, mises, signal de foule |
| `site` | public | ce que l'équipe change pour tout le monde (déclencheurs de la migration `diffusion_temps_reel`) : un réglage public (`cfg` : `{cle, v, rev}`), l'annonce (`annonce` : `{annonce, rev}`, `null` si retirée), la maintenance (`maint` : `{actif, message, rev}`), le titre d'un marché corrigé (`marche` : `{id, q, short}`). Un seul événement par réglage et par transaction, avec la valeur finale ; `rev` est celle d'`api_site()` |
| `salon:general`, `salon:blitz`, `salon:m:<marché>` | public | messages du chat du salon (`msg`), message retiré (`del`), nouveau nombre de suivis d'une mise partagée (`fc`), nouveaux compteurs de réactions d'un message (`re`, sans dire qui a réagi), règles du salon changées par l'équipe (`regle` : `{salon, lent, ferme}`) |
| `clan:<identifiant>`, `vip` | **privé** : la règle `wm_membre_lit_son_clan` n'admet que les membres actuels du clan (`wm.clan_sujet()`), `wm_vip_lit_son_salon` les joueurs du rang Ascendant | tout ce qui se passe dans le salon : `msg`, `del`, `fc`, `re`, `regle` (mêmes événements que les salons publics, choisis par `wm.chat_diffuser`) |
| `joueur:<identifiant>` | **privé** : la règle `wm_joueur_lit_son_sujet` sur `realtime.messages` n'y admet que ce joueur | ses messages privés reçus (`dm`), ses notifications (`notif`), une réaction de l'autre participant dans une conversation privée (`re`), un bot qui a réagi à l'un de ses messages (`reac`, +1 XP) ; et de l'équipe : son état à relire (`etat` : solde, rang ou KYC changés), un blocage posé (`bloc` : `{id, acces, salon, fin}`, comme `api_mes_blocages`) ou levé (`debloc` : `{id, acces, salon}`), une déconnexion forcée (`deco` : `{at}`) |

## 7. Tests du back

`tests/sql/` charge une vraie base Postgres embarquée (PGlite) avec la photo du schéma puis toutes les migrations du
dépôt, en moins d'une seconde, et exécute les fonctions « en tant que » un visiteur ou un joueur. 259 tests au 19 nov.
2026 : sécurité, comptes, moteur, bots, argent fictif, jeu responsable, missions, chat, pari éclair, amis, messages privés,
invariants (solde jamais négatif, opérations simultanées, rejeu d'une clé), le panneau d'administration (§ 9 :
`sauvegarde-20261119`, `equipe`, `blocages`, `gardes`, `reglages-frais`, `diffusion`) et les données réelles (§ 10 :
`donnees`, `donnees-cascade`, `donnees-fixations`, `eclair-reel`, et `eclair-edge`, qui exécute le texte même de l'Edge
Function `eclair`, types retirés, contre la base embarquée ; `eclair-mises-reelles` (partie D) fait de même avec la v6 et la
v5 qui était en ligne, pour prouver qu'une mise sans marque se règle exactement comme avant). Les bouchons de Vault et de pg_net
(`tests/sql/supabase-stubs.sql`) rangent les requêtes au lieu de les envoyer.

## 8. Ajouter une fonction

1. Écrire `wm.ma_fonction(...)` et son relais `public.api_ma_fonction(...)` dans une nouvelle migration, terminée par
   `select wm.droits();`.
2. Écrire son test dans `tests/sql/`.
3. L'appliquer comme migration (jamais de SQL à la main), renommer le fichier avec le numéro de version attribué, et
   vérifier l'empreinte avec `tools/verifier-migrations.mjs`.
4. Brancher le front (`API.call('api_ma_fonction', …)`), le faux serveur des tests, et les tests d'écran.

Pour **ajouter un contrôle à une fonction existante** (blocage, réglage) sans rien changer d'autre :
`tools/garde-fonctions.mjs` part de sa définition en vigueur et n'ajoute que des lignes marquées `-- [ajout]` ou ne remplace
qu'un littéral par `wm.reglage_num('<clé>', <le même littéral>)` (`-- [réglage]`) ; `tests/sql/gardes.spec.mjs` vérifie
qu'aucune autre fonction n'a bougé, qu'aucune autre ligne n'a changé, et rejoue un scénario de référence avant et après.

## 9. Panneau d'administration : équipe, réglages, blocages, journal (19 nov. 2026)

Le serveur ci-dessous ; l'écran est `admin.html` depuis la partie E (voir « L'écran et le site », en fin de section).
Migrations : `sauvegarde_20261119` (lot 0), `equipe_reglages_journal` et `journal_ajout_seul` (lot 1), `blocages_actions`
et `blocages_controles_…` (lot 2), `reglages_frais_…` (lot 3), `diffusion_temps_reel` (lot 5).
Mode d'emploi (ajouter un membre, double authentification, retour arrière) : `docs/EXPLOITATION.md`, § 8.

### La porte : `api_equipe(action, paramètres)`

Relais de `wm.equipe`, qui, à **chaque** appel :

1. `moi` répond à tout compte connecté : rôle, permissions, niveau `aal` de la session, nombre de codes enrôlés,
   `mfa_requise`, accès à l'ancien panneau ;
2. lit le rôle (`wm.role_equipe` : la ligne de `wm.equipe_membres`, sinon `administrateur` pour un compte de
   `public.admin_users` qui n'y figure pas, comme `WimoroAdmin`). Sans rôle : `interdit`, quelle que soit l'action ;
3. cherche l'action dans le registre `wm.equipe_actions` (`action_inconnue`) et vérifie que le rôle y a droit (`interdit`) ;
4. exige une session `aal2` (`mfa_requise`) si le membre a un code de double authentification vérifié
   (`auth.mfa_factors`), ou pour tous si le réglage `equipe.mfa_obligatoire` est vrai ;
5. pour une écriture : motif d'au moins 3 caractères quand le registre l'exige (`motif_requis`), 120 écritures par minute
   au plus (`trop_vite`) ;
6. appelle `wm.eq_<action>(membre, paramètres)` ; toute écriture ajoute une entrée au journal (`wm.journal`).

Les fonctions `wm.eq_…` ne sont appelables par aucun client. Un joueur ordinaire est refusé pour chaque action, un
visiteur n'a pas accès à la porte, et nul ne peut se donner un rôle (`tests/sql/equipe.spec.mjs`).

| Famille | Actions — A : administrateur, M : modérateur ; (m) motif obligatoire ; (a) annulable depuis le journal |
|---|---|
| tableau | `tableau` (A) : chiffres du site, équipe, blocages en cours, maintenance, tête du journal |
| réglages | `reglages_lire` (A) ; `reglage_modifier` (A, m, a) : `{cle, valeur}`, type et bornes contrôlés (`reglage_invalide`, `reglage_inchange`, `reglage_incoherent`, `reglage_dedie`, `reglage_inactif`) |
| équipe | `equipe_liste` (A) ; `equipe_ajouter` (A, m, a) : `{email ou id, role}`, refusé pour un bot, un compte de test ou une adresse non confirmée (`compte_refuse`) ; `equipe_role` (A, m, a) ; `equipe_retirer` (A, m, a) : jamais le dernier administrateur (`dernier_administrateur`) ; rien n'est supprimé (`retire_at`) |
| journal | `journal_lire` (A, M : ses propres décisions, ou celles qui visent un joueur donné) ; `journal_csv` (A) ; `journal_verifier` (A) ; `journal_annuler` (A, M, m) |
| joueurs | `joueurs_chercher` (pseudo, e-mail ou identifiant), `joueur_fiche`, `joueur_activite` (connexions, argent, dépôts, retraits, messages hors privés, rangs, KYC, décisions de l'équipe ; pages par date) ; `joueur_solde` (m, a) : opération `ajustement_admin` dans `balance_ledger`, jamais en dessous de zéro, modérateur plafonné par `equipe.moderateur_solde_max` (`plafond_moderateur`) ; `joueur_rang` (m) ; `joueur_kyc` (a) ; `joueur_bloquer` (m, a) ; `joueur_debloquer` (m, a) ; `joueur_deconnecter`. Toutes (A, M) ; un modérateur n'agit pas sur un membre de l'équipe, personne sur soi-même ni ne bloque un administrateur (`interdit`) |
| chat | `chat_messages` ; `chat_supprimer`, `chat_restaurer` (a) : le message est masqué (`source = 'masque'`), jamais effacé ; `salon_regler` (a) : mode lent de 0 à 300 secondes, salon fermé ; `mots_interdits` (a) ; `clan_renommer` (a) ; `clan_dissoudre` (m) : les membres sortent, candidatures annulées, salon fermé, le clan reste en base. Toutes (A, M) |
| site | `annonce_publier`, `annonce_retirer`, `maintenance`, `activite_simulee` (bots : la clé `bots` de `wm.config`, comme l'ancien panneau). Toutes (A, a) |

### Les réglages : `wm.reglages`

Une ligne par constante du jeu : clé, catégorie, libellé et phrase d'explication en français, type (`nombre`, `entier`,
`booleen`, `liste`, `json`), valeur, **valeur par défaut = la constante d'avant**, bornes, `facultatif` (vide : « aucun
plafond »), `public` (lu par `api_site`), `applique` (faux : le serveur ne l'applique pas encore, `reglage_modifier` le
refuse), `dedie` (écrit par une action dédiée : annonce, maintenance, salons, mots interdits), auteur et date du dernier
changement. Lecture par `wm.reglage_num`, `wm.reglage_bool`, `wm.reglage_json`, `wm.reglage_liste` : jamais d'erreur ; une
clé absente ou d'un autre type rend la constante d'avant. Écriture par `wm.reglage_ecrire` seulement (révision dans
`wm.revisions`). Les fonctions qui les lisent sont `STABLE` : un changement vaut dès l'appel suivant.

- **Appliqués (72 sur 82)** : frais des paris par catégorie, multiplicateur et remise Diamant (`wm.fee_rate`), barème
  d'argent (`wm.argent`), bonus de parrainage (`wm.ref_bonus`), bornes des paris, de la mise éclair, des duels, des
  combinés (frais, gain maximal, décote d'encaissement), des stacks (commission), des copies (part du copié), mises de La
  Série, frais de création d'un clan, mise et commission des guerres, plafonds du site (`paris.mise_max` → `montant_max`,
  `depots.max_jour` → `limite_depot`, `retraits.max` → `retrait_max`, vides par défaut).
- **Pas encore appliqués** : prix du Blitz (`blitz.buyin`, `blitz.buyin_prime`, `blitz.rachat`), Bet Exact
  (`eclair.be_…`), frais du pari éclair (`frais.eclair.k`), facteur de La Série, commission du Blitz : l'Edge Function
  `eclair` les calcule avec ses propres constantes ; à brancher avec elle.
- `api_site()` les donne à l'écran : `{rev, v: {clé: valeur} des réglages publics, annonce, maintenance}`.

### Blocages, déconnexion forcée, maintenance, règles du chat

- `wm.blocages` : un accès d'un joueur — `site`, `chat` (tous les salons, ou un seul : `general`, `vip`, `blitz`, `dm`,
  `m:<marché>`, `clan:<identifiant>`), `paris`, `depots`, `retraits`, `creation` (propositions de marché), `clans` — pour
  1 h, 24 h, 7 j, 30 j ou sans fin. Levé (`leve_at`), jamais effacé.
- Le contrôle est **ajouté** aux fonctions existantes (lignes `-- [ajout]`), sans effet pour un joueur non concerné :
  `wm.garde(joueur, accès)` lève `bloque` (détail JSON `{acces, salon, fin}`) dans `wm.buy`, `wm.duel_create`,
  `wm.duel_accepter`, `wm.combo_place`, `wm.stack_create`, `wm.copy_start`, `srv_eclair_miser`, `srv_serie_start`,
  `srv_blitz_join`, `srv_blitz_rebuy`, `srv_duel_eclair_creer` (paris), `wm.demo_deposit` (dépôts), `wm.demo_withdraw`
  (retraits), `wm.proposal_create` (création), les fonctions de clan (adhésion, candidature, création, chef, guerre) et
  du chat (`chat_send`, `chat_share`, `chat_react`, `ana_share`, `dm_send`). Une copie d'un joueur bloqué ne s'exécute
  pas (`wm.copie_executer`, sans erreur). Vendre et quitter un clan restent toujours possibles.
- `wm.uid()` (donc aussi les Edge Functions, par `wm.agir_pour`) refuse : une session ouverte avant une déconnexion forcée
  (`session` ; table `wm.deconnexions`, rien n'est supprimé de `auth`), un blocage du site (`suspendu`, détail : fin en
  millisecondes ou -1), la maintenance pour qui n'est pas de l'équipe (`maintenance`).
- Règles du chat (`wm.chat_regles`) : salon fermé (`salon_ferme`), mode lent (`mode_lent`, détail : secondes restantes),
  mot interdit (`mot_interdit` ; dans les messages privés seulement si `chat.mots_prives`). L'équipe n'y est pas soumise.
  Plus personne n'entre dans un clan dissous (adhésion, candidature : `clan_indisponible`).

### Le journal : `wm.journal`, en ajout seul

Qui (membre et rôle), quand, d'où (`panneau`, `ancien_panneau`, `migration`), quoi, sur quoi, avant, après, motif, et
l'action qui l'annulerait. Les décisions de l'ancien panneau (`wm.admin_journal`) y sont recopiées. Chaque entrée porte
l'empreinte SHA-256 de son contenu et de l'entrée précédente : `journal_verifier` (ou `select wm.journal_verifier();`)
refait la chaîne et rend `{n, ok, tete, rompue}`, `rompue` étant la première entrée altérée. Modifier, effacer ou vider `wm.journal` ou
`wm.admin_journal` est refusé à tous, y compris au propriétaire de la base (déclencheurs `ENABLE ALWAYS`,
`journal_immuable`). Annuler (`journal_annuler {id, motif}`) applique l'inverse par la même porte et l'écrit à son tour
(une seule fois, `deja_annule` ; refusé si la valeur a changé depuis, `deja_modifie`). L'export CSV (`journal_csv`, 10 000
lignes au plus) est fait par le serveur : UTF-8 avec BOM, champs entre guillemets, formules neutralisées.

### Sauvegarde du 19 nov. 2026 : schéma `backup_20261119`

Avant tout changement : copie des données des tables touchées (`public.admin_users`, `markets`, `users`, `user_stats`,
`balance_ledger`, `notifications`, `chat_messages`, `wm.admin_journal`, `config`, `clans_joueurs`, `clan_membres`, `rg`),
leur définition (`backup_20261119.tables` : colonnes, contraintes, index, déclencheurs, règles, droits), et la définition
des 385 fonctions de `public` et `wm` (`backup_20261119.fonctions`). 40 d'entre elles ont changé depuis : lignes de
contrôle ajoutées, littéraux remplacés par leur réglage, et `wm.fee_rate`, `wm.argent`, `wm.ref_bonus` réécrites pour lire
les réglages.
`backup_20261119.restaurer('<signature>')` remet une fonction telle qu'elle était. Aucun client n'a accès à ce schéma.

### L'écran et le site (partie E, 19 nov. 2026)

- **Le panneau** : `admin.html` (une page, routes par le hash), `js/admin.js` (appels, erreurs en français, navigation,
  recherche, confirmation avant → après avec motif, double authentification), `js/admin-ecrans.js` (accueil, joueurs,
  chat et communauté, site, marchés, administrateurs, journal, mon compte), `js/admin-reglages.js` (frais et argent, jeux,
  exemple chiffré calculé par `js/engine.js`), `css/admin.css` (après `base.css` et `components.css`). Tout passe par
  `api_equipe` ; l'XP, les marchés (créer, modifier, fermer, résoudre) et la levée d'une ancienne suspension passent
  encore par `api_admin`, qui n'a pas d'équivalent dans la nouvelle porte. La liste des clans est lue par `api_clan()`
  (liste publique des clans de joueurs). Double authentification : `API.mfaFacteurs`, `mfaNiveau`, `mfaEnroler`,
  `mfaDefi`, `mfaVerifier`, `mfaRetirer` (`js/api.js`) ; le panneau demande le code dès que le serveur répond `mfa_requise`.
- **Le site** (`js/serveur.js`, « Partie E ») : `api_site()` au démarrage (par le client pour un compte ; par une lecture
  REST avec la clé publique, sans la bibliothèque, pour un visiteur ou le compte démo, relue toutes les 3 minutes onglet
  visible) ; un compte s'abonne au sujet `site` (`cfg`, `annonce`, `maint`, `marche`). Les frais du ticket viennent des
  réglages (`engReglages`, `js/engine.js`) ; l'éclair, La Série et le Blitz gardent les constantes du moteur éclair tant
  que l'Edge Function ne lit pas les siens. `api_mes_blocages()` au démarrage, puis `bloc`, `debloc`, `deco`, `etat` sur
  `joueur:<id>`. Chaque refus (`bloque`, `suspendu`, `maintenance`, `mode_lent`, `salon_ferme`, `mot_interdit`,
  `montant_max`, `retrait_max`, `limite_depot`, `clan_indisponible`, `trop_vite`) est dit à l'endroit bloqué.
- **Ce qui manque côté serveur** (l'écran ne l'invente pas) : résoudre et annuler un marché par `api_equipe`, avec motif
  (partie D ; l'ancienne résolution ne garde pas le motif) ; lister les clans de joueurs, dissous compris ; lire les mots
  interdits pour un modérateur (le réglage n'est pas public et `reglages_lire` est réservé aux administrateurs) ;
  réinitialiser la double authentification d'un membre (`mfa_reinitialiser`) ; ajuster l'XP ; le nombre exact de joueurs
  en ligne ; les opérations du relevé (`balance_ledger`) dans `api_state` (l'historique du joueur montre un ajustement par
  sa notification `admin_solde`) ; le détail `{acces, salon, fin}` d'un refus `bloque` venu de l'Edge Function `eclair`.

## 10. Données réelles (lots 6 et 7, 19 nov. 2026)

Le détail (sources, cascade, quotas, budget, tables) est dans `docs/DONNEES.md`, § 2 à 4. Côté serveur :

### Lot 6 : le socle (migration `donnees_socle`)

- **Réveil des Edge Functions sans secret dans le dépôt.** La migration crée elle-même, dans Vault, un jeton de 64
  caractères (`wm_cron_jeton`). `wm.appeler(fonction, corps)` (aucun droit client) l'envoie par pg_net dans l'en-tête
  `x-wm-jeton`, avec `x-region: ap-southeast-2` (la région de la base) ; l'Edge Function le fait vérifier par
  `srv_jeton_ok(jeton)` (empreintes SHA-256, clé de service) et répond 401 sans rien faire s'il est faux. Le jeton n'est ni
  dans le texte de la tâche planifiée, ni dans un journal. Le renouveler : une migration
  `select vault.update_secret((select id from vault.secrets where name = 'wm_cron_jeton'), encode(extensions.gen_random_bytes(32), 'hex'));`.
- **Edge Function `donnees`** (`supabase/functions/donnees/`, `verify_jwt` désactivé) : `index.ts` (requête, bail, boucle,
  réseau), `cascade.js` (quelle source appeler, quotas, pauses ; module pur) et `lecteurs.js` (réponse → cotations ; module
  pur). Les deux modules purs sont testés sous Node sur des réponses enregistrées (`tests/fixtures/donnees/`, outil
  `tools/donnees-enregistrer.mjs`) ; un test remplace `fetch` par une garde : aucun test n'appelle une vraie API.
- **Fonctions de service** (clé de service seulement) : `srv_jeton_ok`, `srv_donnees_bail(porteur, durée)` (une boucle à
  la fois), `srv_donnees_config()` (sources, compteurs du jour, heure du dernier appel, actifs, places ouvertes, réglages
  `donnees.*`), `srv_cours_ingerer(p)` (cotations, bilan des sources, contrôle des places ; refait l'instantané).
- **Calendrier** : `wm.marche_ouvert(place, t)` et `wm.marche_prochaine_ouverture(place, t)` (fuseaux IANA, jours fériés,
  fermetures anticipées, pause de midi de Tokyo, semaine « hebdo » du CME et de l'ICE).
- **Lecture** : `api_live(serie)` (visiteurs compris), un seul accès à `wm.live_cache`.
- **Panneau** : actions `sources_etat` (administrateur) et `source_activer` (administrateur, motif, annulable depuis le
  journal) ajoutées au registre `wm.equipe_actions`.
- **Réglages** (non publics) : `donnees.actif` (couper la collecte), `donnees.cadence_s` (3), `donnees.boucle_s` (55).
- Aucune fonction existante n'est modifiée ; les tables où le lot écrit sont sauvées avant (`backup_20261119`).

### Lot 7 : le pari éclair à cours réels (migration `eclair_reel`)

- **Interrupteur** `eclair.cours_reels` (réglage public, **éteint**) : éteint, rien ne change pour les joueurs (tous les
  jeux simulés, moteur d'avant). Réglages `eclair.secours_simule`, `eclair.grace_s` (120), `eclair.pbe_max` (0,08).
- **Fixations** : l'Edge Function `donnees` (v4) les écrit à chaque frontière de manche par `srv_eclair_fixer(p)`
  (`{ manche, actifs: { actif: { s: {source: cours}, x: [écartées], final } } }` ; `trop_tot`, `trop_tard` ; une
  fixation écrite ne change plus), après `srv_eclair_config()` (actifs, sources, place ouverte, frontières déjà fixées).
  Module pur `supabase/functions/donnees/fixations.js` (calendrier des essais, sources, secours, quotas).
- **Modes figés** deux manches d'avance (`wm.eclair_figer`, tâche `wm-eclair-fix` toutes les 10 s, ou la première mise) :
  `wm.eclair_mode_calcul(jeu, manche)` (place ouverte une minute avant et cinq après, clé, sources, données fraîches).
- **Edge Function `eclair` (v5)** : avant de miser, `srv_eclair_contexte({ items: [{jeu, manche}] })` rend pour chaque
  manche `{ jeu, r, mode, raison, actif, P: { pbe, smin, beoff }, F: { manche: fixation }, attente }` ; manche réelle :
  moteur v2 (`etatReel`, `prixReel`, `beMultReel`, `beMaxReel`), le mode part avec la mise (`p.mode`). L'interrupteur
  éteint est gardé 30 s en mémoire : aucun appel de plus par mise tant qu'il l'est. Le règlement prend les contextes des
  manches des mises ouvertes, règle les réelles par `reglerReel`, laisse attendre celles dont la fin n'est pas fixée et
  rend les mises des manches annulées par `srv_eclair_rembourser(p_user, [{ id, motif }])` ; la réponse de `settle`
  porte en plus `rembourses: [{ id, g, r, s, amt, motif }]`. Duels : le mode de la manche du duel part avec la création ;
  une manche réelle annulée règle le duel en issue 2 (les deux mises rendues). La Série et Blitz Royale ne changent pas.
- **Contrôle ajouté** à deux fonctions existantes (`srv_eclair_miser`, `srv_duel_eclair_creer`), une ligne
  `-- [ajout]` chacune, produite par `tools/garde-fonctions.mjs` (lot 7) et vérifiée par `tests/sql/gardes.spec.mjs` :
  `wm.eclair_garde(jeu, manche, mode)` refuse `jeu_en_pause` (manche en pause, retirée, ou départ réel « absent ») et
  `mode_change` (calcul fait dans un autre mode : l'Edge Function recommence une fois). Interrupteur éteint : la manche est
  figée « simulée » et la mise passe exactement comme avant. Définitions d'avant : `backup_20261119.fonctions_lots`.
- **Remboursement** sans changer de contrainte : table `wm.eclair_remboursements`, écriture `flash_rembourse` du journal
  d'argent, notification `flash_rembourse` (texte de secours en français, code et paramètres `{g, r, amt, motif}`) ; la
  mise est close « perdue », gain = mise ; ni XP, ni série, ni pari réglé.
- **Lecture** : `api_fixations(jeu, de, a)` (visiteurs compris) et la partie `eclair` d'`api_live`.
- **Tâches** : `wm-eclair-fix` (10 s : figer, déclarer absentes, garder la preuve des mises oubliées au bout de 40 h,
  refaire l'instantané) et `wm-eclair-calibrage` (chaque heure : fréquence du break even observée).

### Partie D : les mises du nouveau front à cours réels (migration `eclair_mises_reelles`, Edge Function `eclair` v6)

L'interrupteur reste éteint (le site en ligne joue comme avant) ; le nouveau front joue les vrais cours **par client**,
avec la règle du module pur `js/moteur-reel.js` (manche r réelle si la fixation r − 2 de l'actif est « ok » et écrite
avant le début de la manche). Détail : `docs/DONNEES.md` § 2.6. Côté serveur, des ajouts seulement :

- **Table** `wm.eclair_mises_reelles` (RLS, aucun droit client) : la marque d'une mise du nouveau front.
- **Fonctions de service** (clé de service seulement) : `srv_eclair_reelles(p_user, p)` (`p.items` : contextes avec les
  fixations quel que soit le mode figé, après avoir figé les modes à venir ; `p.ids` : les mises ouvertes et marquées du
  joueur parmi celles données, avec leur contexte), `srv_eclair_miser_reelle(p_user, p)` (`srv_eclair_miser` inchangée,
  puis la marque, dans la même transaction ; une clé rejouée ne marque rien de plus), `srv_eclair_rembourser_reelles(p_user,
  p_res)` (comme `srv_eclair_rembourser`, pour les mises marquées, et seulement après le délai de grâce si une fixation
  manque) ; aide `wm.eclair_reel_un(jeu, manche)`.
- **Edge Function `eclair` v6** : `bet` avec `reel: true` → la règle (refus `jeu_en_pause` sinon), le moteur v2 avec les
  paramètres du client, `srv_eclair_miser_reelle` ; réponse `{ …, mise, reel: true }`. `settle` → une lecture de plus
  (`srv_eclair_reelles`), les mises marquées réglées par `reglerReel` ou rendues (`rembourses`) ; les autres exactement comme
  avant. Interrupteur allumé et manche figée réelle : la marque est ignorée (chemin du lot 7).
- Sauvegarde : `wm.eclair_remboursements`. Aucune fonction existante n'est modifiée.
