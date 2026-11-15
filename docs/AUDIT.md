# Wimoro — audit complet du front et du back

État audité : commit `719cf76` (dernier commit de `main`, 15 nov. 2026) et projet Supabase `brmwvxncyeypefsgiepf`
tel qu'il était le 14 nov. 2026 à 23:39 UTC. Audit réalisé en lecture seule : aucune correction n'a été faite avant la fin de ce document.

## 1. En résumé

- **Le site charge avec une erreur JavaScript à chaque visite.** Elle coupe la fin du fichier qui relie le site au serveur.
  Conséquences directes : pas de bascule Démo ↔ Compte, et les bots du navigateur ne sont jamais éteints.
- **Le pari éclair ne marche plus du tout en mode Démo**, et en mode Compte il débite l'argent sans rien afficher ni régler.
- **En mode Compte, presque tout ce que fait le joueur est annulé en silence au bout de 15 secondes.** Sur 255 actions et
  formulaires, 4 seulement passent par le serveur ; 32 sont annulées (retraits, dépôts carte, missions, duels, combinés,
  clans, copy trading…) et 91 dépendent d'une sauvegarde fragile qui peut perdre les positions.
- **Les amis et le chat plantent** dès qu'un vrai utilisateur apparaît (le site ne connaît que 13 joueurs fictifs).
- **Côté serveur, les marchés sont cassés** : 24 marchés sur 27 sont bloqués à 2 % ou 98 %, parce que les bots poussent
  toujours le prix dans le même sens. Les marchés à plusieurs issues totalisent 10 %, 16 % ou 106 % au lieu de 100 %.
- **Le serveur a des trous de sécurité sérieux.** Avec la seule clé publique (visible dans le code du site), n'importe qui
  peut lire les e-mails de tous les comptes, et appeler les fonctions d'administration : changer le solde ou le rang de
  n'importe quel joueur, le bannir, résoudre un marché. Un joueur connecté peut aussi se donner le solde qu'il veut.
- **La base grossit sans limite** (environ 120 000 lignes par jour) et les tâches des bots échouent régulièrement
  (elles se bloquent entre elles).
- Bonne nouvelle : le découpage en fichiers n'a rien cassé (20 fichiers sur 23 sont identiques à l'original), le mode Démo
  d'origine est récupérable, le moteur de calcul des prix est propre et déjà prévu pour tourner aussi côté serveur, et il
  n'y a aucune clé secrète dans le dépôt ni dans son historique.

## 2. Méthode et preuves

| Preuve | Fichier | Comment la refaire |
|---|---|---|
| Schéma complet du back (tables, fonctions, policies, cron) | `supabase/migrations/0000_baseline.sql` | `supabase/tools/export_catalogue.sql` puis `node supabase/tools/build_baseline.mjs` |
| Les 22 migrations d'origine | `supabase/historique/` | idem |
| Inventaire du back | `docs/audit/inventaire-back.md` | `node tools/audit/inventaire-back.mjs <catalogue.json>` |
| Inventaire du front (242 actions, 13 formulaires, 26 écrans, minuteurs) | `docs/audit/inventaire-front.md` | `node tools/audit/inventaire.mjs` |
| Reproduction des bugs dans Chrome (faux serveur) | `docs/audit/preuves-front.txt` | `node tools/audit/reproduire.mjs` |
| Alertes Supabase (« advisors ») | résumées au § 6.6 | outil `get_advisors` |

Les bugs du front sont reproduits dans un vrai navigateur (Chrome sans interface), où le client Supabase est remplacé par un
faux serveur local (`tests/helpers/fake-supabase.js`) qui enregistre tous les appels. La base réelle n'est jamais modifiée.
Une seule sonde interroge la vraie base, en lecture seule et sans afficher de donnée personnelle (lignes « B10 » et « B20 »).

Les références du type `fichier:ligne` valent pour le commit `719cf76`. Les lignes de `0000_baseline.sql` valent pour ce dépôt.

## 3. Structure du front (points S1 à S6 : tous confirmés)

- **S1 — le découpage n'est pas la cause des pannes.** Comparaison automatique avec `3a1d258` : 20 fichiers sur 23 sont
  identiques au bloc `<script>` d'origine, et `css/main.css` est identique au `<style>` d'origine. Les 5 lignes modifiées :

  | Fichier | Avant (`3a1d258`) | Maintenant |
  |---|---|---|
  | `core.js:118` | `demoB` affiche la pastille « Mode démo » | renvoie `''` |
  | `core.js:119` | `demoHint` affiche l'indication | renvoie `''` |
  | `core.js:196` | `newMe` : `onboarded:false`, `balance:1e6` | `onboarded:true`, `balance:0` (mais l'historique garde « Crédit démo 1 000 000 ») |
  | `account.js:17` | crédit de 1 M$ pour les anciens comptes dans `enterAccount` | ligne supprimée |
  | `boot.js:10` | redirection vers `#bienvenue` si l'onboarding n'est pas fait | commentaire « handled by sbLoad » (ce n'est pas le cas) |

- **S2 — un seul espace global, des couches empilées.** 986 définitions de fonctions globales dans 22 fichiers, 242 actions
  `ACT`, 13 formulaires `FORMS`, 26 écrans `VIEWS`. 27 fonctions sont redéfinies par un fichier chargé plus tard, par exemple
  `placeBet` (views → groups → clans → supabase), `updateMarket` (views → groups → combos → pro), `logout`
  (account → demo → supabase), `render` (views → auth → combos). Liste complète dans `inventaire-front.md`.
- **S3 — `js/supabase.js` est chargé en dernier**, après `boot.js` (`index.html:76-77`), et remplace des fonctions après coup.
  Toute la liaison avec le back tient dans ses 288 lignes.
- **S4 — le back n'était pas dans le dépôt.** C'est corrigé par l'export de la phase 0.
- **S5 — pas de cache-busting.** 24 `<script src>` sans version ; 1,23 Mo de JavaScript et 230 Ko de CSS non minifiés ; les
  deux catalogues de traduction (449 Ko) sont chargés quelle que soit la langue. Le client Supabase est chargé avec
  l'étiquette flottante `@2` (`index.html:15`), donc sa version peut changer sans prévenir.
- **S6 — `README.md` est le modèle de profil GitHub.** Aucune documentation.

Point nouveau lié à la structure : **GitHub Pages publie tout le dépôt.** Les dossiers `docs/`, `supabase/`, `tests/` seront
servis sur `wimoro.com` dès la fusion, sauf si on les exclut. À traiter à la livraison (voir `PLAN.md`).

## 4. Front — les 20 bugs annoncés

Tous sont confirmés. La colonne « Mesure » cite `docs/audit/preuves-front.txt`.

| N° | Constat | Où | Mesure |
|---|---|---|---|
| **B01** bloquant | `TypeError: Assignment to constant variable` à chaque chargement, dans les 3 modes et les 3 langues. Les lignes 248 à 287 ne s'exécutent jamais. | `supabase.js:248` (réaffecte `friendsOf`, déclaré `const` dans `auth.js:297`) | « [SB] Initialized » absent ; `ACT['switch-to-account']` et `ACT['switch-to-demo']` valent `undefined` |
| **B02** bloquant | En mode Démo, cliquer sur un bouton de pari éclair ne fait rien. | `supabase.js:189-190` remplace `ACT['flash-bet']` par une fonction qui s'arrête si `uid` est vide | solde 1 000 248,50 → 1 000 248,50, mise `null`. L'appel direct de `flashBet()` marche : 1 000 248,50 → 1 000 238,50 |
| **B03** | En mode Compte, le pari éclair débite le solde mais rien n'est enregistré côté client : pas de mise affichée, pas de règlement, pas d'XP, pas de mission. | `supabase.js:189-201` | RPC appelé 1 fois, solde 500 → 490, `G().my = null`, `S.me.fmy = null`, XP 0 → 0 |
| **B04** | Les bots du navigateur tournent en mode Compte. | `boot.js:18-19, 28` a déjà capturé les fonctions d'origine | prix serveur 70 → 70,50 en 6 s sans message du serveur ; 19 marchés sur 27 ont bougé seuls ; 30 minuteurs actifs |
| **B05** | Tout changement local du solde, de l'XP ou des statistiques est écrasé en 15 s. | `supabase.js:62-71, 93` | retrait de 100 $ : 500 → 400 → 500 ; XP 0 → 150 → 0 ; le retrait reste affiché dans l'historique alors que l'argent est revenu |
| **B06** | Positions perdues si la sauvegarde du blob échoue. La table `positions` du serveur n'est jamais lue. | `supabase.js:17-22, 55, 96` | après achat puis rechargement : solde 450, positions affichées 0, table serveur 1 |
| **B07** | Mélange d'états entre le compte démo et un vrai compte ; puis l'hybride est envoyé au serveur. | `supabase.js:22, 55` ; `account.js:25-28` | pseudo « realuser », solde 500, mais les 5 positions de User26 ; 17 s plus tard le blob du vrai compte contient ces 5 positions. Variante : compte local sans session Supabase, « connecté » mais rien n'est sauvegardé |
| **B08** | Inscription : compte local créé même si `signUp` échoue ; `signUp` sans options ; onboarding sauté ; solde 0 avec « Crédit démo 1 000 000 » dans l'historique ; unicité du pseudo vérifiée contre 17 noms codés en dur. | `supabase.js:119-127` ; `auth.js:58` ; `core.js:196` | `signUp` reçu avec `options: null` ; avec confirmation d'e-mail active : « connecté » à l'écran sans session, et `insert` dans `users` tenté en anonyme |
| **B09** | Mot de passe oublié : le lien est envoyé mais rien ne gère le retour. | `supabase.js:137-148` | 0 occurrence de `PASSWORD_RECOVERY`, `updateUser`, `verifyOtp` ; l'arrivée par `#access_token=…&type=recovery` affiche l'accueil |
| **B10** | Connexion par pseudo : lit la colonne `email` de `users` avec la clé publique, sans échapper `%` ni `_`. | `supabase.js:106` | sonde réelle : `GET users?select=email` → HTTP 200 ; 21 profils de vrais utilisateurs lisibles par un visiteur |
| **B11** | `#amis` plante dès qu'un ami réel existe. La recherche et les actions amis ne sont plus branchées au serveur. | `views.js:17` (`avH`) appelé par `auth.js:303` | `TypeError: Cannot read properties of undefined (reading 'tone')` ; aucun appel `search_users` / `send_friend_request` / `accept_friend_request` dans `supabase.js` |
| **B12** | Un message temps réel d'un vrai utilisateur fait planter le chat, puis chaque nouveau rendu de `#chat`. Pas d'historique chargé, abonnement sans filtre. | `views.js:47-48` (`msgH`), `core.js:244` (`room`), `views.js:54-55` (`addMsg`) | même `TypeError` ; `room('dm:inconnu')` et `addMsg('m:inconnu')` plantent aussi ; `chat_messages` lisible sans connexion |
| **B13** | Dépôt crypto en mode Compte : solde crédité, mais la fenêtre reste ouverte, rien dans l'historique, plus d'animation, limites de jeu responsable ignorées, erreurs silencieuses. | `supabase.js:204-213` | solde 500 → 600, lignes d'historique 0 → 0, fenêtre toujours ouverte |
| **B14** | KYC non persistant. | `account.js:58` ; `supabase.js:23` | `kyc = true`, puis `false` après rechargement (la colonne `users.kyc_verified`, jamais écrite, gagne sur le blob) |
| **B15** | Les paris « serveur » sautent tous les effets de l'original. | `supabase.js:152-170` contre `views.js:174-183` | Démo : XP +10, 2 notifications, plus grosse mise, annonce dans le chat, mission, badge. Compte : rien de tout cela |
| **B16** | Double rééquilibrage des marchés à issues multiples. | `supabase.js:225` appelle `updateMarket(m, old)` sans le 3ᵉ argument ; `groups.js:27` rééquilibre alors localement | lecture du code. Et côté serveur les issues ne sont pas rééquilibrées du tout (voir K07) |
| **B17** | Deux populations de bots sans rapport : 13 joueurs locaux partout dans l'interface, 10 000 bots serveur invisibles. | `core.js:100-115` ; 97 accès directs `USERS[…]` | aucun des 13 personnages n'existe côté serveur |
| **B18** | 17 textes en français en dur dans `supabase.js`, hors `_t()`. Texte faux sur la page de connexion. | `supabase.js:101-273` ; `auth.js` (`vLogin`) | « Les comptes créés ici restent dans ce navigateur… » |
| **B19** | Le blob complet et la ligne `users` sont réécrits toutes les 17 s, même sans changement. | `supabase.js:52-60, 94` | 35 s sans rien toucher : 2 écritures du blob, 2 mises à jour de `users`, 3 lectures de `user_stats`, 2 `get_friends` |
| **B20** | Droits trop larges : voir § 6.2, c'est pire qu'annoncé. | policies et fonctions | sonde réelle : `admin_get_player` répond en HTTP 200 sans connexion |

## 5. Front — constats supplémentaires

| N° | Constat | Où |
|---|---|---|
| F21 | `sbLoad` force `S.me.onboarded = true` : aucun nouveau compte ne voit l'onboarding. | `supabase.js:25` |
| F22 | Le pseudo choisi à l'inscription est perdu : le trigger serveur crée d'abord le profil avec un pseudo automatique (`debut_de_l_email_xxxx`), puis l'`insert` du client échoue sur la clé. 3 comptes réels sur 21 portent un pseudo automatique. | `supabase.js:124` ; `handle_auth_user_created` |
| F23 | L'aperçu du ticket utilise la profondeur locale du carnet (`m.liq`), jamais celle du serveur (`liquidity_depth`, pourtant renvoyée par `get_markets`). L'aperçu et l'exécution ne peuvent donc pas correspondre. | `supabase.js:218` ; `engine.js:49` |
| F24 | La déconnexion efface toutes les clés `localStorage` contenant « supabase » ou commençant par « sb- », sans attendre `signOut`. | `supabase.js:130-135` |
| F25 | `leaveAccount` rembourse localement les mises éclair en cours et crédite les dépôts en attente : en mode Compte, cela fabrique du solde local. | `account.js:23` |
| F26 | Réponses automatiques de bots à chaque message envoyé (« @toi bien vu »), fausses réactions (+1 XP), faux « X a suivi ta mise » (+20 XP) : tout cela reste actif en mode Compte. | `views.js:184, 403-404` ; `core.js:302-305` |
| F27 | `get_markets` renvoie aussi `price_history` (200 points par marché) à chaque chargement, et chaque mise à jour temps réel renvoie la ligne entière. | `supabase.js:216-226` |
| F28 | En mode Compte, 30 minuteurs périodiques tournent, dont 3 de synchronisation (15 s, 17 s, 20 s). Aucun n'est suspendu quand l'onglet est caché côté `supabase.js`. | `preuves-front.txt`, lignes B04 |

### Tous les écrans, trois langues, trois modes

Parcours automatique de 26 écrans en anglais, français et hébreu, en visiteur, en Démo et en Compte (9 passes) : **1 erreur au
chargement à chaque fois (B01), puis 0 écran en erreur sur 26** tant qu'aucune donnée réelle n'arrive (ami, message).
En mobile (390 px) : aucun débordement horizontal.

### Les simulateurs du navigateur

Ce sont eux qui font « vivre » la démo. En mode Compte ils doivent être éteints à la source, sinon chaque navigateur invente
ses propres prix. Inventaire complet des 35 `setInterval` dans `inventaire-front.md`. Les principaux :

| Simulateur | Lancé par | Ce qu'il invente |
|---|---|---|
| `botBet` (650 ms), `burst` (9 s puis 26 s), `driftAnchors` (10 s) | `boot.js:18-19` | prix, volumes, participants, « signaux de foule » |
| `growLiq` (15 s), compteur « en ligne » (3 s) | `boot.js:21-22` | profondeur du carnet, nombre de joueurs en ligne |
| `botChat` (3,6 s), `botReact` (2,6 s) | `boot.js:18` | messages, cartes de mise, réactions, « X vient de passer Radiant » |
| `pushBig` (5,2 s) | `boot.js:17` | bandeau des grosses mises de l'accueil |
| `botFriendRequest` (45 s, puis 90 s) | `boot.js:17` | fausses demandes d'amis |
| `duelBotChallenge` (150 s, puis 240 s), `duelTick` (5 s) | `boot.js:19` | défis de duel, règlement des duels |
| `voteTick` et votes des propositions (1,6 s), `catchUpVotes` | `boot.js:17, 24` | votes de la communauté |
| `copyDriver` (20 s), `botCopier` (52 s), `copyGuard` (4 s) | `copy.js:315` | mises du joueur copié, faux copieurs |
| `ordersTick` (2 s) | `orders.js:186` | exécution des ordres limites, stop, take-profit |
| `botReferral` (70 s) | `referral.js:104` | faux filleuls |
| bots du Blitz (7 s), `bzTick` / `serieTick` (1 s) | `blitz.js:115, 200` | joueurs du Blitz Royale |
| `clanWarTick`, `clanWeekAward` (20 s) | `clans.js:229` | guerres et classement de clans |
| `proBotShare` (150 s) | `demo.js:182` | analyses « Mode Pro » publiées par des bots |
| `marketsSave` (8 s) et `marketsLoad` | `boot.js:7, 28` | mémoire locale des prix |
| `flashTick` (250 ms) | `boot.js:19` | moteur du pari éclair (déterministe : à garder) |

## 6. Back — état des lieux

Détail complet : `docs/audit/inventaire-back.md` et `supabase/migrations/0000_baseline.sql`.

### 6.1 Vue d'ensemble

- Projet créé le 13 nov. 2026, région `ap-southeast-2` (Sydney), Postgres 17.11, **offre gratuite** : pas de sauvegarde
  automatique, 500 Mo de base, 200 connexions temps réel simultanées, 100 messages temps réel par seconde, mise en pause
  après une semaine sans activité.
- Base : 47 Mo avant la sauvegarde. 46 tables, toutes avec RLS activée ; 92 policies ; 71 fonctions ; 1 vue ; 3 tâches cron.
- Aucune Edge Function, aucun fichier stocké.
- 22 migrations enregistrées (du 13 et du 14 nov.), désormais archivées dans `supabase/historique/`.
- Authentification : e-mail + mot de passe, **confirmation d'e-mail désactivée**, inscriptions ouvertes, aucun fournisseur
  social. 19 comptes, tous confirmés. Détail et points à vérifier dans le tableau de bord : `supabase/AUTH_REGLAGES.md`.
- `public.users` contient 10 021 lignes : 10 000 bots (`is_demo = true`, e-mails en `@wimoro.internal`, sans compte
  d'authentification), 19 vrais comptes, et 2 profils orphelins sans compte d'authentification.
- Le « panel d'administration » se résume à 8 fonctions SQL `admin_*` à lancer depuis l'éditeur SQL du tableau de bord.
  Il n'existe aucune page d'administration.

### 6.2 Sécurité (à traiter en priorité)

> **Mise à jour du 15 nov. 2026 :** les trous K01 à K13 ci-dessous sont **fermés** par la migration
> `20261115032907_securite_urgence_droits`. Vérifié sur la vraie base par l'API publique avec un compte de test
> (`tools/e2e/verif-securite.mjs` : 10 actions normales acceptées, 12 actions interdites refusées) et par 13 tests
> SQL (`tests/sql/securite*.spec.mjs`). Le tableau décrit l'état trouvé pendant l'audit.

Vérifié sur la vraie base, en lecture seule, avec la seule clé publique.

| N° | Constat | Preuve |
|---|---|---|
| **K01** critique | **Les e-mails de tous les comptes sont lisibles par n'importe qui.** La policy de lecture de `users` est `true`. La colonne `password_hash` est lisible aussi (elle est vide partout, heureusement). | sonde B10 : HTTP 200 ; `content-range: 0-20/21` pour les vrais profils |
| **K02** critique | **Les 8 fonctions `admin_*` n'ont aucun contrôle et sont exécutables par un visiteur anonyme** : lire les e-mails (`admin_get_player`, `admin_top_players`), fixer ou ajuster un solde, changer l'XP ou le rang, bannir (met le solde à 0). | sonde B20 : `admin_get_player` répond HTTP 200 sans connexion ; `0000_baseline.sql:925-1225` |
| **K03** critique | La vue `admin_players_view` (e-mails et soldes de tout le monde) contourne la RLS et est lisible par un visiteur. | sonde B20 : HTTP 200 ; alerte Supabase de niveau ERREUR |
| **K04** critique | **Un joueur connecté peut se donner le solde, l'XP et le rang qu'il veut** : il a le droit de modifier sa propre ligne de `user_stats`. Il peut aussi créer, modifier et supprimer ses `positions`, puis les « revendre » contre du solde. | policies « Users can update own stats », « Users insert/update/delete own positions » |
| **K05** critique | `settle_market` (résoudre un marché et payer les gagnants) est appelable par n'importe qui. Le code dit lui-même : « In production, add admin check here ». | `0000_baseline.sql:2610-2672` |
| **K06** | Tout joueur connecté peut modifier le prix de n'importe quel marché (`market_live_state`) et écrire dans l'historique des prix. | policies « Authenticated users update market state », « …insert price history » |
| **K07** | Fonctions internes exécutables par n'importe qui : `grant_xp(p_user_id…)`, `progress_mission(p_user_id…)`, `create_notification(p_user_id…)` (envoyer une notification à n'importe quel joueur, avec un lien), `bot_tick`, `bot_market_make`, `bot_chat_activity`, `flash_settle_round`, `flash_tick_server`. | 25 fonctions `SECURITY DEFINER` sans aucun `auth.uid()` |
| **K08** | `accept_friend_request` donne 15 XP à l'appelant **et** à l'identifiant passé en paramètre, même si aucune demande n'existe, même sans être connecté. Répétable à volonté. | `0000_baseline.sql:905-922` |
| **K09** | Tous les messages de chat sont lisibles par tout le monde, salons privés et de clan compris. Un joueur peut aussi insérer directement dans `chat_messages`, dans n'importe quel salon. | policy « Chat messages are publicly readable » (`true`) |
| **K10** | Amitiés : chaque partie peut modifier la ligne, donc l'expéditeur peut accepter sa propre demande. Écritures directes aussi possibles sur `deposits`, `withdrawals`, `flash_bets`, `notifications`, `user_badges` (s'attribuer un badge), `missions` (se déclarer une mission finie), `orders`, `clans`, `clan_members`. | 92 policies, voir `inventaire-back.md` |
| **K11** | Les tables `users` (avec les e-mails) et `user_stats` sont dans la publication temps réel : leurs changements sont diffusés à tout abonné. | publication `supabase_realtime` |
| **K12** | Les 71 fonctions sont exécutables par `anon` ; 67 sont `SECURITY DEFINER` ; aucune ne fixe `search_path`. | alertes Supabase : 71 + 67 + 67 |
| **K13** | Aucune limite de fréquence ni de longueur sur le chat ; +2 XP par message sans plafond côté serveur. Aucune limite de jeu responsable côté serveur. Aucune clé d'idempotence sur les opérations d'argent. | `send_chat_message`, `place_bet`, `demo_deposit` |
| K14 | Protection contre les mots de passe compromis désactivée. | alerte Supabase |

Rien à signaler côté secrets : **une seule clé dans tout l'historique git, la clé publique** (`role = anon`). Aucune clé
`service_role`.

### 6.3 Les bots et les marchés

| N° | Constat | Preuve |
|---|---|---|
| **K20** | **24 marchés sur 27 sont bloqués à 2 % ou 98 %.** `bot_market_make` choisit le côté avec une probabilité égale au prix, puis pousse le prix du même côté : plus un marché monte, plus il monte. L'ancre (`anchor_probability`) n'est jamais utilisée. | prix relevés : `btc150k` 2 % (ancre 61), `clasico` 98 % (ancre 62), `bce` 97,84 % (ancre 56)… ; `0000_baseline.sql:1358-1397` |
| **K21** | Marchés à issues multiples : chaque issue bouge seule. Totaux relevés : `presid27` 10 %, `ldc27` 16,5 %, `crypto2` 106 %. | même relevé |
| **K22** | Les bots ne prennent jamais de position, n'ont pas de carnet, et ne servent donc pas de contrepartie : ils déplacent un nombre. Ils écrivent une ligne `market_bets` par action. | `bot_market_make` |
| **K23** | Tâches cron : `bot-tick` (chaque minute), `bot-burst` (toutes les 5 min), `flash-tick-server` (chaque minute). **106 échecs sur 2 644 exécutions** : interblocages quand deux tâches tombent sur la même minute, et violations de la contrainte « solde non négatif ». | `cron.job_run_details` |
| **K24** | **Croissance sans limite.** Mesuré sur une heure : 2 382 `flash_bets`, 1 140 `flash_rounds`, 786 `balance_ledger`, 430 `market_bets`, 311 `chat_messages`, soit environ 120 000 lignes par jour. Le journal de cron n'est jamais purgé. À ce rythme, la limite de 500 Mo est atteinte en quelques semaines. | relevé du 14 nov. |
| **K25** | Chaque bot a une ligne dans `user_full_state` (7 Mo de blobs inutiles), et deux triggers recopient `user_stats` et `users` dans ce blob à chaque modification : chaque écriture de bot en déclenche une seconde. | `sync_stats_to_blob`, `sync_users_to_blob` |
| **K26** | Les messages des bots sont 30 phrases françaises en dur, tirées au hasard, sans rapport avec le marché du salon. 9 296 messages de bots dans les salons de marché, contre 15 messages de vrais joueurs au total. | `bot_chat_activity` |
| K27 | Les 10 000 bots ont un rang et un solde moyen de 988 440 $ ; aucun des 13 personnages du front (lea, maxou, satoshi_fr…) n'existe côté serveur. | relevé |

### 6.4 Le pari éclair côté serveur

| N° | Constat |
|---|---|
| **K30** | **L'issue d'une manche est tirée au hasard par le serveur** (`floor(random()*3)`), alors que le front affiche une issue calculée à partir de l'heure. Le joueur voit une chose, le serveur en paie une autre. `0000_baseline.sql:1824` |
| **K31** | Les manches durent 45 s mais ne sont réglées que par un cron chaque minute. Le gain est un partage de cagnotte entre mises nettes, sans rapport avec ce que le front annonce (`flashPayout`). |
| **K32** | `bot_flash_activity` contient un second « règlement » qui marque des manches comme réglées **sans payer personne**. |
| K33 | 19 jeux côté serveur. 27 000 lignes de mises éclair de bots par jour, qui ne servent à rien d'autre qu'à remplir la cagnotte. |

### 6.5 Les fonctions d'action

| N° | Fonction | Écarts avec le front |
|---|---|---|
| K40 | `place_bet` | Même formule que `engine.js` pour le prix, mais : pas de plafond de liquidité (le front s'arrête à 99 ¢), pas de remise de frais des rangs Diamant et plus, prix borné à 3–97 (front : 1–99, bots : 2–98), pas de contrôle « marché ouvert », `participants_count + 1` à chaque pari, pas de mission, pas de badge, pas de notification, pas d'historique de prix. |
| K41 | `sell_position` | Pas de plafond non plus ; n'écrit l'historique que si la position est entièrement vendue. |
| K42 | `demo_deposit` | Enregistre le montant en dollars comme quantité de crypto. Crédite immédiatement (pas d'étapes de confirmation). Pas de limite de jeu responsable. |
| K43 | `demo_withdrawal` | Existe, jamais appelée par le front. |
| K44 | `send_friend_request`, `remove_friend`, `start_copy`… | Recherche par `ILIKE` sans échapper les jokers : un pseudo contenant `_` ou `%` peut désigner un autre joueur. Une demande A → B n'empêche pas une demande B → A. Aucune fonction pour annuler une demande. |
| K45 | `join_clan` | Augmente le nombre de membres même si le joueur est déjà membre ; n'empêche pas d'appartenir à plusieurs clans. |
| K46 | `get_leaderboard` | Ignore la période demandée. |
| K47 | `handle_auth_user_created` | Crée le profil avec `onboarded = true` et un pseudo non validé. |
| K48 | `settle_market` | Attend `yes` / `no` alors que les positions utilisent `oui` / `non` ; ne gère pas les marchés à issues multiples. |
| **K49** | `place_bet` puis `sell_position` | **Acheter puis revendre tout de suite rapporte de l'argent** quand le prix est sous 3 % : le prix est forcé à 3 % après l'achat, quel que soit le montant. Mesuré avec un compte de test : 10 $ misés à 2,2 ¢ la part, revendus aussitôt 12,25 $. |

Il n'existe rien côté serveur pour : les ordres limites, stop et take-profit (table `orders` vide), les combinés, le règlement
des duels, le KYC, les dépôts par carte, les limites de jeu responsable, le parrainage, les propositions de marché et leurs
votes, les rôles et guerres de clans, l'exécution du copy trading, les profils publics, le Blitz et la Série.

### 6.6 Alertes Supabase

| Niveau | Alerte | Nombre |
|---|---|---:|
| ERREUR | Vue en `SECURITY DEFINER` (`admin_players_view`) | 1 |
| Avertissement | Fonction `SECURITY DEFINER` exécutable par `anon` | 67 |
| Avertissement | Fonction `SECURITY DEFINER` exécutable par `authenticated` | 67 |
| Avertissement | `search_path` de fonction non fixé | 71 |
| Avertissement | Protection contre les mots de passe compromis désactivée | 1 |
| Avertissement | Policy RLS qui recalcule `auth.uid()` à chaque ligne | 66 |
| Avertissement | Plusieurs policies permissives pour la même action | 12 |
| Info | Clé étrangère sans index | 19 |
| Info | Index jamais utilisé | 23 |
| Info | RLS activée sans policy / table sans clé primaire | 47 / 46, dont 46 dues au schéma de sauvegarde `backup_20261115` (voulu, disparaîtra avec lui) |

## 7. Contrat front ↔ back

### Ce que le front appelle aujourd'hui

| Appel du front | Où | Objet du back | Verdict |
|---|---|---|---|
| `rpc('get_markets')` | `supabase.js:216` | `get_markets()` | conforme, mais renvoie trop (historique complet) et le front ignore la profondeur |
| `rpc('place_bet', {p_market_id, p_side, p_amount})` | `supabase.js:158` | `place_bet(text, text, numeric)` | signature conforme ; effets incomplets (K40, B15) |
| `rpc('sell_position', {p_market_id, p_side, p_shares})` | `supabase.js:175` | `sell_position(text, text, numeric)` | signature conforme (K41) |
| `rpc('flash_bet', {p_game_id, p_side, p_amount})` | `supabase.js:195` | `flash_bet(text, text, numeric)` | signature conforme ; logique sans rapport avec le front (K30 à K32) |
| `rpc('demo_deposit', {p_coin, p_network, p_amount})` | `supabase.js:208` | `demo_deposit(text, text, numeric)` | conforme ; le front perd tout le reste (B13) |
| `rpc('send_chat_message', {p_room_id, p_text})` | `supabase.js:235` | `send_chat_message(text, text, text)` | conforme ; aucun contrôle de salon |
| `rpc('get_friends')` | `supabase.js:36` | `get_friends()` | conforme ; le front plante à l'affichage (B11) |
| `from('user_full_state')` lecture et écriture | `supabase.js:17, 55` | table | fonctionne ; c'est le problème (B05 à B07, B19) |
| `from('users')` lecture de sa ligne, mise à jour | `supabase.js:18, 57` | table | fonctionne |
| `from('users').select('email').ilike('username', …)` | `supabase.js:106` | table | ne fonctionne que grâce au trou K01 |
| `from('users').insert(…)` | `supabase.js:124` | table | échoue toujours : le trigger a déjà créé la ligne (F22) |
| `from('user_stats')` lecture | `supabase.js:19, 64` | table | fonctionne |
| temps réel `market_live_state` (UPDATE) | `supabase.js:222` | publication | fonctionne ; double rééquilibrage (B16) |
| temps réel `chat_messages` (INSERT, sans filtre) | `supabase.js:240` | publication | fonctionne ; plante à l'affichage (B12) |
| `auth.signUp`, `signInWithPassword`, `signOut`, `getSession`, `resetPasswordForEmail` | `supabase.js:75-143` | Auth | voir B08, B09 |

### Ce qui existe au back et que le front n'appelle pas (orphelins)

`accept_duel`, `create_duel`, `accept_friend_request`, `decline_friend_request`, `send_friend_request`, `remove_friend`,
`search_users`, `check_badges`, `claim_mission`, `init_daily_missions`, `progress_mission`, `clear_notifications`,
`delete_notification`, `mark_notifications_read`, `create_notification`, `create_clan`, `join_clan`, `leave_clan`,
`get_clans`, `get_clan_members`, `get_my_clan`, `demo_withdrawal`, `get_chat_history`, `react_to_message`,
`get_leaderboard`, `get_my_badges`, `get_my_balance`, `get_my_copies`, `get_my_deposits`, `get_my_friends`,
`get_my_history`, `get_my_notifications`, `get_my_positions`, `get_my_withdrawals`, `grant_xp`, `start_copy`, `stop_copy`,
`settle_market`, `newsletter_subscribe`, `newsletter_unsubscribe`, les 8 `admin_*`.

Tables jamais lues ni écrites par le front : toutes sauf `users`, `user_stats`, `user_full_state`, `market_live_state`,
`chat_messages`. En particulier `positions`, `position_history`, `deposits`, `withdrawals`, `notifications`, `friendships`,
`missions`, `user_badges`, `clans`, `duels`, `orders`, `combos`.

### Ce que le front fait et que le back ne sait pas faire (manquants)

Annulation d'une demande d'ami ; suivre un joueur ; liste de surveillance ; profil (pseudo unique, bio, couleur, avatar,
visibilité) ; KYC fictif ; dépôts et retraits par carte, virement, PayPal ; limites de dépôt, pause, auto-exclusion ;
ordres limites, stop, take-profit ; combinés ; duels (défi, acceptation, règlement, remboursement) ; clans (candidature,
rôles, exclusion, appels, guerres, classement) ; copy trading (budget, exécution des copies, rémunération) ; parrainage ;
propositions de marché et votes ; cartes de mise et d'analyse dans le chat, réactions, messages privés ; Blitz et Série ;
alertes éclair ; classement par période ; profils des autres joueurs.

### Identifiants

- Marchés : les 27 identifiants du serveur correspondent à ceux du front (10 marchés simples et 17 issues de 3 groupes).
- Jeux éclair : 19 côté serveur.
- Joueurs : le front utilise des identifiants courts (`lea`, `maxou`…) et la valeur spéciale `me` ; le serveur des UUID.
  C'est la cause directe de B11 et B12.

## 8. Ce que l'audit change dans le plan prévu

Les décisions d'architecture de la mission tiennent toutes. Quatre points sont à signaler, repris dans `docs/PLAN.md` :

1. **La sécurité passe en premier.** Les trous K01 à K05 exposent dès aujourd'hui les e-mails de vrais utilisateurs et
   laissent n'importe qui modifier n'importe quel compte. Ils sont fermés par une migration dédiée avant tout le reste,
   et avant que ce document soit publié dans le dépôt (qui est public).
2. **Les bots serveur sont à réécrire, pas à régler.** Leur logique actuelle détruit les prix (K20, K21) et ne fait pas
   office de contrepartie (K22).
3. **Le pari éclair serveur est à refaire** sur le moteur déterministe du front (K30 à K32). Aucune Edge Function
   n'existe encore ; la décision 9 reste applicable.
4. **Le mode de publication du site devra changer** pour ne pas servir `docs/`, `supabase/` et `tests/` sur `wimoro.com`,
   et pour permettre le cache-busting (S5). Cela demande un réglage du dépôt GitHub, donc une confirmation.
