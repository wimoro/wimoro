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
  joueurs connectés (avec la fonction `wm.x` qu'elle appelle) ; seules `api_markets` et `api_pseudo_libre` sont ouvertes
  aux visiteurs ; tout le reste de `wm` est fermé. Test : `tests/sql/missions.spec.mjs`.

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
| `api_chat_history(salon)` | joueur | les 60 derniers messages d'un salon public et la fiche de leurs auteurs |
| `api_chat_seen(salons)` | joueur | « j'ai toujours ces salons à l'écran » : les bots ne parlent que là où quelqu'un lit |
| `api_chat_send(salon, texte)` | joueur | écrire dans le salon général ou celui d'un marché ; anti-spam ; diffusé aux lecteurs du salon |
| `api_dm_send(joueur, texte)`, `api_dm_history(joueur)`, `api_dm_list()` | joueur | messages privés entre amis (rang Bronze pour écrire) ; conversations de leurs deux participants seulement |
| `api_leaderboard()` | joueur | les 50 meilleurs gains (fiches publiques, vrais joueurs et bots) |
| `api_users_search(texte)` | joueur | dix joueurs au plus dont le pseudo contient le texte (fiches publiques, jamais d'e-mail) |
| `api_friend(action, joueur)` | joueur | `add`, `accept`, `cancel`, `decline`, `remove` ; rend les trois listes à jour |
| Edge Function `connexion` | visiteur | connexion par pseudo, sans jamais révéler d'e-mail ; limite les tentatives |
| Edge Function `eclair` | joueur | pari éclair : `bet` (miser) et `settle` (régler les manches terminées) |

| `api_admin(action, paramètres)` | administrateur | la seule porte du panel d'administration : `moi`, `chiffres`, `joueurs`, `joueur`, `solde`, `xp`, `rang`, `kyc`, `suspendre`, `marches`, `marche`, `marche_etat`, `resoudre`, `chat`, `masquer`, `bots`, `journal`. Refusée (`interdit`) à tout compte absent de `public.admin_users` ; chaque modification est écrite dans `wm.admin_journal` |
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
- Après une modification de `js/moteur-eclair.js` : recopier le fichier dans `supabase/functions/eclair/` et redéployer
  la fonction, sinon l'écran et le serveur ne calculeraient plus la même chose.

## 5. Argent fictif et jeu responsable

Tout est nommé « démo » dans le code et la base (`api_demo_…`, `wm.demo_…`, écritures `demo_deposit` et `demo_withdraw`
du journal `balance_ledger`). Les barèmes (monnaies, réseaux, minimums, frais) sont dans `wm.argent()`, copie de ceux du
front. Un dépôt naît « en attente » avec une échéance (`due_at` = nombre de confirmations × 650 ms) ; `wm.demo_regler`
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
| `salon:general`, `salon:m:<marché>` | public | messages du chat du salon |
| `joueur:<identifiant>` | **privé** : la règle `wm_joueur_lit_son_sujet` sur `realtime.messages` n'y admet que ce joueur | ses messages privés reçus (`dm`) et ses notifications (`notif`) |

## 7. Tests du back

`tests/sql/` charge une vraie base Postgres embarquée (PGlite) avec la photo du schéma puis toutes les migrations du
dépôt, en moins d'une seconde, et exécute les fonctions « en tant que » un visiteur ou un joueur. 74 tests : sécurité,
comptes, moteur, bots, argent fictif, jeu responsable, missions, chat, pari éclair, amis, messages privés, invariants (solde jamais négatif, opérations
simultanées, rejeu d'une clé).

## 8. Ajouter une fonction

1. Écrire `wm.ma_fonction(...)` et son relais `public.api_ma_fonction(...)` dans une nouvelle migration, terminée par
   `select wm.droits();`.
2. Écrire son test dans `tests/sql/`.
3. L'appliquer comme migration (jamais de SQL à la main), renommer le fichier avec le numéro de version attribué, et
   vérifier l'empreinte avec `tools/verifier-migrations.mjs`.
4. Brancher le front (`API.call('api_ma_fonction', …)`), le faux serveur des tests, et les tests d'écran.
