# Wimoro — plan de réparation front ↔ back

Ce fichier est le fil conducteur du chantier. Pour reprendre le travail dans une nouvelle session : **« Reprends docs/PLAN.md »**.
Chaque tâche a une case à cocher et un test d'acceptation. Une tâche n'est cochée que si son test a été vu passer.

- Branche de travail : `fix/harmonisation-front-back` (jamais de travail direct sur `main`)
- Retour arrière : tag `avant-reparation` (code) et schéma `backup_20261115` (base)
- Constat de départ : `docs/AUDIT.md`
- Projet Supabase : `brmwvxncyeypefsgiepf`

## Comment reprendre

1. Lire le **journal** en bas de ce fichier, puis la première case non cochée.
2. `npm ci` puis `CHROME=1 npx playwright test` pour voir l'état des tests (aucun build nécessaire pour le site).
3. `node tools/serve.mjs` sert le site sur `http://127.0.0.1:4173`.
4. Toute modification de la base passe par `apply_migration`, puis le fichier est enregistré dans `supabase/migrations/`
   sous le numéro renvoyé par `list_migrations`.
5. Règles de la mission : pas de réécriture, pas de changement de design ni de textes, un correctif = un test, preuves avant affirmations.

## Décisions d'architecture retenues

Les douze décisions de la mission sont appliquées telles quelles. Précisions issues de l'audit :

| Sujet | Décision |
|---|---|
| Interrupteur de mode | `MODE.serveur` (session Supabase valide) ou local. Calculé dans `js/api.js`, lu partout ailleurs. |
| Passerelle | `js/api.js`, seul fichier à toucher le client Supabase, chargé avant `boot.js`. Le premier rendu attend la session (3 s maximum, puis repli local). |
| Actions d'argent | Chaque action garde son code d'origine pour la validation et l'interface. Seule l'écriture comptable est aiguillée : locale, ou RPC. Les aides de progression (`gainXP`, `mission`, `checkBadges`, `notif`) n'écrivent qu'en mode local ; en mode serveur, la réponse du RPC porte le nouvel état et la liste des événements à afficher. |
| État du joueur | Un RPC `get_state()` renvoie tout ; une fonction unique le transforme en `S.me`, qui devient un cache. Plus de relecture périodique. |
| Annuaire | `USERS` devient un registre ; clé = identifiant court en local, UUID en serveur ; `userOf()` renvoie toujours une fiche complète. Les 13 personnages d'origine sont créés côté serveur comme bots. |
| Temps réel | Diffusion (« Broadcast ») depuis la base : un sujet public `marches` (un message groupé par tick), un sujet par salon de chat ouvert, un sujet privé par joueur. Plus d'abonnement aux tables. |
| Bots | Un tick serveur toutes les 2 à 3 s, portage de `botBet` / `driftAnchors` / `burst` / `botBetCard`. Activité agrégée (bougies par minute), purge quotidienne. Contrepartie des paris : un compte « teneur de marché » par marché. |
| Pari éclair | Moteur extrait dans `js/moteur-eclair.js` (pur), réutilisé par une Edge Function. Règlement « à la demande » : au retour du joueur ou au chargement de l'état, sans cron. |
| Argent fictif | `demo_deposit`, `demo_withdraw`, `demo_kyc`. Les dépôts gardent leurs étapes de confirmation grâce à une heure de disponibilité enregistrée ; crédit à la demande. |
| Mot de passe oublié | Code à 6 chiffres (`verifyOtp`), plus prise en charge du lien. |

### Ce que l'audit remet en cause ou ajoute

1. **Sécurité en premier** (lot 3.0) : fermeture immédiate des trous K01 à K08, avant de publier l'audit dans le dépôt public.
   Effet connu sur le site actuellement en ligne : la connexion par **pseudo** ne marchera plus jusqu'à la livraison
   (elle reposait sur la lecture publique des e-mails). La connexion par e-mail continue de marcher.
2. **Bots serveur à réécrire** entièrement (K20 à K27).
3. **Pari éclair serveur à refaire** sur le moteur du front (K30 à K32).
4. **Publication du site** : passer GitHub Pages en mode « GitHub Actions » pour ne publier que le site (pas `docs/`,
   `supabase/`, `tests/`) et faire le cache-busting. Réglage du dépôt : **à confirmer au moment de la livraison**.
5. **Tests du back sans toucher la production** : base Postgres embarquée (PGlite) chargée avec `0000_baseline.sql` puis les
   migrations, pour vérifier chaque migration et les invariants avant de l'appliquer en vrai.

---

## Phase 0 — Accès et filet de sécurité ✅

- [x] Accès Supabase confirmés (tables, SQL, migrations, logs, advisors).
- [x] Tag `avant-reparation` posé sur `719cf76` et poussé ; branche `fix/harmonisation-front-back` créée.
- [x] Back exporté : `supabase/migrations/0000_baseline.sql`, `supabase/historique/`, `supabase/AUTH_REGLAGES.md`.
- [x] Sauvegarde : schéma `backup_20261115` (46 tables sur 46, 22 Mo, inaccessible par l'API). L'offre gratuite n'a pas de sauvegarde automatique.
- [x] Aucune clé secrète dans le dépôt ni dans son historique (une seule clé, publique).
- [ ] _Sans objet_ : restauration de la prod (`RESTAURER_LA_PROD_PENDANT_LES_TRAVAUX = non`).

## Phase 1 — Audit ✅

- [x] `docs/AUDIT.md` et ses annexes `docs/audit/` (inventaires front et back, preuves).

## Phase 2 — Plan ✅

- [x] Ce fichier.

## Phase 3 — Fondations

### 3.0 Urgence sécurité (base)

- [x] Migration `20261115032907_securite_urgence_droits` (appliquée) : e-mails illisibles par l'API ; fonctions `admin_*`,
      `bot_*`, règlements et aides internes fermées aux clients ; plus aucune écriture directe sur l'argent, le jeu et le
      social ; chat privé réservé aux membres ; XP d'amitié corrigée ; chat borné ; `search_path` fixé partout ;
      droits par défaut resserrés.
      _Preuves_ : `tests/sql/securite.spec.mjs` (12 tests), `tests/sql/securite-partie1.spec.mjs`,
      `tools/e2e/verif-securite.mjs` sur la vraie base (22 contrôles), catalogue relu (4 tables seulement restent
      inscriptibles par un joueur, sur ses propres lignes ; 7 fonctions ouvertes aux visiteurs).
- [x] L'ancien front en ligne marche toujours pour : connexion par e-mail, pari, vente, dépôt, marchés, amis, profil.
      Régression connue et voulue : la connexion par pseudo (elle lisait les e-mails).
- [ ] Migration `securite_urgence_nettoyage` : retirer les policies d'écriture devenues sans objet et sortir `users` /
      `user_stats` de la publication temps réel. **En attente : la base demande une confirmation manuelle** (voir « À faire
      par l'humain »). Sans risque en attendant : les droits d'écriture sont déjà retirés.
- [x] Pousser la branche sur GitHub (l'audit ne devient public qu'une fois les trous fermés).

### 3.1 Outillage de test

- [x] Serveur local `tools/serve.mjs`, configuration Playwright, faux client Supabase `tests/helpers/fake-supabase.js`.
- [x] `tests/helpers/app.mjs` : ouvrir le site dans un mode et une langue donnés, collecter les erreurs console, figer l'horloge.
- [x] Base embarquée pour les tests SQL (`tests/sql/base.mjs`, PGlite) : bouchons Supabase → baseline → migrations, en moins d'une seconde.
- [x] Faux serveur aligné sur le contrat `api_*` ; tests de bout en bout contre le vrai back sur demande (`E2E=1`, projet `e2e`).
- [x] Intégration continue : `.github/workflows/tests.yml` sur chaque pull request (aucun secret nécessaire, actions épinglées).

### 3.2 Les trois bloquants

- [x] **B01** — plus d'erreur au chargement (mode local). _Test_ `tests/demo/chargement.spec.mjs` : zéro erreur console, visiteur et Démo × 3 langues × 26 écrans. Le mode Compte sera couvert par `tests/compte/` à l'étape 3.3.
- [x] **B02** — le pari éclair marche en mode Démo. _Test_ `tests/demo/eclair.spec.mjs` : mise acceptée, affichée, réglée en fin de manche, conservée après rechargement, une seule mise par pari.
- [x] **B04** — aucun simulateur du navigateur ne tourne en mode serveur. _Test_ `tests/compte/simulateurs.spec.mjs` : en
      3 minutes sans message du serveur, aucun prix, volume, message, demande d'ami ni solde ne change ; zéro appel périodique.

### 3.3 Mode, passerelle, ordre de chargement

- [x] `js/api.js` : seul fichier à toucher le client Supabase (2.118.0, figé dans `js/vendor/`, chargé à la demande) ; `SRV()` ;
      événements ; le premier rendu attend la session (3 s au plus, puis repli local ; écran clair si le serveur est injoignable).
- [x] `boot.js` : une seule table de minuteurs (`planifier`), lancée selon le mode ; les modules y déclarent les leurs ;
      les décors de départ (messages d'exemple) passent par `SEMIS`, posés en mode local seulement.
- [x] Tableau des minuteurs et de leur sort dans `docs/ARCHITECTURE.md` (§ 5).
- [x] Suppression de `js/supabase.js` (plus aucun remplacement de fonction après coup) ; `js/serveur.js` porte la logique du
      mode serveur sans jamais toucher le client. _Tests_ `tests/compte/simulateurs.spec.mjs` (aucun accès direct aux tables),
      `tests/compte/garde.spec.mjs` (aucune action d'argent exécutée localement en mode serveur).

### 3.4 Une seule authentification, zéro mélange (B07)

- [x] Mode serveur = session Supabase, et rien d'autre. Les comptes `localStorage` ne servent qu'au mode Démo.
- [x] Changement de mode = rechargement, état remis à neuf. _Test_ `tests/compte/comptes.spec.mjs` (recette 8) :
      Démo → Compte → Démo, aucun champ ne fuit ; une session serveur l'emporte toujours sur une session locale.

### 3.5 Annuaire de joueurs et robustesse (B11, B12, B17)

- [x] Registre `USERS` alimenté par le serveur (clé = identifiant du joueur), `userOf()` jamais `undefined` (fiche de secours),
      75 accès directs convertis.
- [ ] Chargement par lots des fiches inconnues (`api_fiches`) et classement réel : avec le lot 4.6.
- [x] Salon, marché ou joueur inconnu : ignoré et journalisé, jamais d'exception dans un rendu.
      _Test_ `tests/compte/chargement.spec.mjs` : 26 écrans × 3 langues, ami et joueur inconnus, message d'un inconnu,
      marché inconnu, carte de mise sur un marché disparu.

### 3.6 Mode Démo identique à `3a1d258`

- [x] Rétablir en mode local : pastilles « Mode démo », crédit de démonstration, onboarding. Les 23 fichiers JS et le CSS
      sont redevenus identiques à `3a1d258` (vérifié par `tools/audit/reproduire.mjs --only=S1` : 23/23).
      _Test_ `tests/demo/parcours.spec.mjs` : inscription locale → onboarding → 1 000 000 $ → achat → vente.
- [x] _Test_ `tests/demo/chargement.spec.mjs` : 26 écrans × 3 langues, zéro erreur, et aucun débordement sur téléphone.

### 3.7 Textes (B18)

- [x] Toute chaîne ajoutée passe par `_t()` avec ses entrées anglaise et hébraïque (`js/i18n-3.js`).
      _Test_ `tests/i18n.spec.mjs` : les 2 500+ textes du code existent dans les deux catalogues ; aucun texte en dur dans
      `api.js`, `serveur.js`, `boot.js`.

## Phase 4 — Back et câblage, domaine par domaine

Pour chaque domaine : migration (tables, RPC, policies) → câblage via la passerelle → tests. On ne passe au suivant que si le précédent est vert.

### 4.1 Comptes
- [x] Inscription : pseudo unique vérifié côté serveur, transmis à `signUp` ; profil créé par trigger ; aucun compte local fantôme (B08, F22).
- [x] Écran « vérifie ta boîte mail » si la confirmation est active, avec renvoi ; fonctionne dans les deux réglages.
- [x] Connexion par e-mail ou pseudo ; par pseudo, via l'Edge Function `connexion` qui n'expose aucun e-mail (B10). Texte de la page mis à jour.
- [x] Déconnexion propre : réglages envoyés, session fermée, rechargement en visiteur (F24, F25).
- [x] Mot de passe oublié par code à 6 chiffres (`verifyOtp` puis `updateUser`) et par lien (`PASSWORD_RECOVERY`) (B09).
      Testé avec le faux serveur. **Reste à l'humain** : mettre le code dans le modèle d'e-mail (voir plus bas), puis _recette 4_ en vrai.
- [x] Onboarding réel des nouveaux comptes, piloté par l'état serveur ; 100 XP de bienvenue donnés une seule fois (F21).
- [x] Profil : pseudo unique, bio, couleur, avatar de la galerie, visibilité.
- [ ] Profil : photo importée (stockage de fichiers), langue et thème synchronisés, portefeuille.

### 4.2 État et solde
- [x] `api_state()` et hydratation unique de `S.me` (`hydrater`) ; préférences d'interface dans `wm.user_prefs`, versionnées,
      écrites seulement si elles changent ; plus aucune relecture ni écriture périodique (B05, B06, B14, B19).
- [x] Rafraîchissement à la reprise de l'onglet. _Recette 3_ (comptes) : même état sur deux navigateurs, vérifié contre le vrai
      back (`tests/e2e/comptes.spec.mjs`).

### 4.3 Marchés et paris
- [x] État des marchés, historique de prix, volume, participants depuis le serveur : `api_markets` au démarrage, puis les
      diffusions du sujet public « marches » (aucune requête périodique). _Tests_ `tests/compte/paris.spec.mjs`,
      `tests/e2e/comptes.spec.mjs` (deux navigateurs, mêmes prix).
- [x] Acheter et vendre : le serveur fait l'écriture (`api_buy`, `api_sell`), l'écran affiche ce qui a été exécuté ; parité
      des effets (B15), aperçu = exécution (K40, K41, F23 : 600 cas comparés, écart < 1e-9), clé d'idempotence, un seul
      ordre à la fois, refus clairs. Le code d'achat est en trois temps (validation, écriture, effets) : seul le deuxième
      change selon le mode. _Tests_ `tests/sql/moteur.spec.mjs`, `tests/compte/paris.spec.mjs`.
- [x] Issues multiples : total à 100 % garanti par le serveur, pas de double rééquilibrage (B16, K21).
- [x] Prix à 6 décimales : un petit ordre fait bouger le prix, un ordre découpé paie le même impact.
- [ ] Ordres limites, stop, take-profit exécutés côté serveur.
- [ ] Combinés.
- [ ] Propositions de marché, votes, mise en ligne.
- [ ] Clôture et résolution depuis le panel admin (K05, K48).

### 4.4 Pari éclair, Blitz, Série
- [ ] `js/moteur-eclair.js` : moteur pur. _Test_ : mêmes prix et issues que le code d'origine sur 500 manches.
- [ ] Edge Function `eclair` : miser, régler ; horloge alignée (`FSKEW`). _Recette 2._
- [ ] Blitz et Série.

### 4.5 Chat
- [ ] Historique, envoi, réception en direct par salon ; salons privés réellement privés (K09).
- [ ] Cartes de mise et d'analyse, réactions, « suivre cette mise », mentions.
- [ ] Anti-spam côté serveur (K13). _Recette 5._

### 4.6 Social
- [ ] Amis : recherche, demande, annulation, acceptation, refus, retrait (B11, K10, K44).
- [ ] Suivre un joueur, profils, classement réel par période (B17, K46).
- [ ] Duels, clans, copy trading, parrainage.

### 4.7 Argent fictif et KYC
- [x] `api_demo_deposit` (crypto, carte, virement, PayPal), `api_demo_withdraw`, `api_demo_kyc`, `api_demo_settle`
      (B13, B14, K42) : écrits et journalisés par le serveur, clairement nommés « démo », animations et écrans d'origine
      conservés. Un dépôt naît « en attente » et n'est crédité qu'à la fin de ses confirmations ; fermé en route, il est
      crédité au chargement suivant. Les nom, prénom et date de naissance du KYC ne sont pas conservés. _Recettes 3, 6
      et 7._ _Tests_ `tests/sql/argent.spec.mjs`, `tests/compte/argent.spec.mjs`, `tests/e2e/comptes.spec.mjs`.
- [x] Jeu responsable appliqué par le serveur : plafonds de dépôt (baisse immédiate, hausse après 48 h), pause (ni pari
      ni dépôt, retrait possible, impossible à écourter), auto-exclusion (plus aucune fonction du compte ne répond, la
      connexion est refusée). _Recette 10._ L'export de l'historique marche avec les données du serveur.
- [ ] Reste limité : le cours BTC / ETH / SOL d'un dépôt vient de l'écran (moteur éclair) ; le serveur borne le montant
      (1 000 000 $ par dépôt fictif). À resserrer quand le moteur éclair tournera aussi côté serveur (4.4).

### 4.8 Progression
- [x] XP, rangs, missions, badges, notifications attribués par le serveur dans chaque fonction d'action déjà reliée
      (bienvenue, pari, dépôt, mission réclamée) ; le navigateur n'en calcule plus aucun en mode Compte.
- [x] Mission réclamée : `api_mission_claim`, une seule fois. _Recette 6._ _Tests_ `tests/sql/missions.spec.mjs`, `tests/compte/etat.spec.mjs`.
- [x] Popup de rang une seule fois par rang et par compte (`api_rank_seen`).
- [ ] Missions quotidiennes renouvelées chaque jour, séries de jours consécutifs : pas encore côté serveur.

## Phase 5 — Les 10 000 bots et le market making
- [ ] Un seul peuple de bots, marqué comme tel, sans e-mail ; les 13 personnages d'origine en font partie (K27).
- [x] Tick serveur (`wm.bots_tick`, toutes les 3 s) : ancre, retour vers l'ancre, rafales et signaux de foule ; issues
      multiples cohérentes (K20, K21). Les deux anciennes tâches, qui collaient 24 marchés sur 27 à 2 % ou 98 %, sont
      arrêtées. _Tests_ `tests/sql/bots.spec.mjs`.
- [x] Contrepartie des paris des joueurs dans la limite de la liquidité (K22) : `open_yes`, `open_no`, `mm_cash`.
- [x] Budget mesuré en production (K24, K25) : tick de 22 ms en moyenne (132 ms au pire) ; aucune ligne créée par action
      de bot ; un message par tick, 920 octets en moyenne. Diffuser en permanence aurait coûté environ 150 Mo sur les
      500 Mo gratuits : les bots passent donc en **veille** quand aucun joueur n'est présent depuis 6 minutes (un tick
      sur dix, aucune diffusion) et se réveillent dès qu'un joueur charge les marchés.
- [ ] Purge du journal de pg_cron (30 000 lignes, 6 Mo par jour) : migration `purge_journal_cron` prête, **attend ta
      confirmation** (voir « À faire par l'humain »).
- [ ] Messages des bots stockés en gabarit + paramètres (K26).
- [ ] Marche/arrêt et intensité depuis le panel admin. _Recette 9._ Le réglage existe déjà côté serveur
      (`wm.config`, clé « bots » : `actif`, `intensite` de 0 à 3) ; il reste à le poser dans le panel.

## Phase 6 — Panel d'administration
- [ ] Page séparée, contrôle `is_admin()` dans chaque RPC : joueurs, soldes (motif journalisé), rang, KYC, suspension ;
      marchés ; modération du chat ; bots ; chiffres.

## Phase 7 — Sécurité
- [x] Aucune écriture directe du client sur solde, positions, statistiques, dépôts, marchés (migration `securite_urgence_droits`,
      tests `tests/sql/securite*.spec.mjs`, `argent.spec.mjs`). Le nettoyage des règles devenues inutiles attend ta confirmation.
- [ ] Limites de fréquence sur le chat et les actions d'argent.
- [ ] Advisors (relevé du 15 nov. 2026) : 50 alertes « fonction SECURITY DEFINER appelable » qui portent toutes sur les
      **anciennes** fonctions, encore nécessaires à l'ancien site → fermées à la livraison par
      `supabase/livraison/fermeture_ancienne_api.sql` ; 52 notes « RLS sans règle » volontaires (schéma `wm`, sauvegarde :
      aucun accès client) ; 1 alerte « mots de passe compromis » (réglage du tableau de bord, offre payante).

## Phase 8 — Optimisation du front
- [x] Cache-busting systématique : `tools/version.mjs` (empreinte du contenu dans l'adresse de chaque fichier), vérifié par
      l'intégration continue. Client Supabase en version précise, chargé seulement en mode Compte.
- [ ] Catalogue de la seule langue active ; Mode Pro chargé à la demande.
- [ ] Regroupement et minification pour la production, sans build en développement.
- [ ] Mesure avant/après sur mobile.

## Phase 9 — Tests et recette
- [x] Suite Playwright sur chaque pull request. Comptes de test marqués ; leur suppression attend ta confirmation.
- [x] Tests SQL des invariants : solde jamais négatif, paris et retraits simultanés, rejeu d'une même clé, argent ni créé ni perdu.
- [ ] Recette finale, 10 points, dans les deux modes.

## Phase 10 — Livraison
- [x] `README.md`, `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/EXPLOITATION.md`.
- [x] Pull request vers `main` ouverte. **Pas fusionnée** : la recette n'est pas entièrement verte (pari éclair, chat et
      social ne sont pas encore reliés au serveur en mode Compte ; ils y sont annoncés comme indisponibles).
- [ ] Vérification en production, en navigation privée.

---

## À faire par l'humain (tableau de bord Supabase ou GitHub)

1. **Accepter la confirmation Supabase** quand elle s'affiche pendant une session de travail : l'outil de base de données
   demande un accord manuel pour toute instruction qui supprime quelque chose, et la demande expire après 2 minutes.
   Trois opérations l'attendent : la migration `securite_urgence_nettoyage` (retrait de règles devenues inutiles), la
   migration `purge_journal_cron` (nettoyage horaire du journal technique des tâches planifiées, qui grossit de 6 Mo
   par jour) et la suppression des comptes de test `wimoro-e2e-…@example.com`.
2. **Modèle d'e-mail « mot de passe oublié »** : tableau de bord Supabase → Authentication → Emails → « Reset Password ».
   Ajouter dans le texte la ligne `Ton code : {{ .Token }}` (le site demande un code à 6 chiffres). Sans cette ligne,
   l'e-mail ne contient que le lien, qui marche aussi.
3. **URL du site** : Authentication → URL Configuration → Site URL = `https://wimoro.com` ; Redirect URLs : ajouter
   `https://wimoro.com/**`.
4. **Envoi des e-mails** : le service intégré est limité à quelques e-mails par heure. Pour de vrais utilisateurs,
   brancher un SMTP (Authentication → Emails → SMTP Settings).
5. **À la mise en ligne du nouveau site** : faire appliquer `supabase/livraison/fermeture_ancienne_api.sql` (voir
   `docs/EXPLOITATION.md`, § 1).
6. Facultatif : protéger la branche `main` sur GitHub (pull request et tests obligatoires).

## Journal

| Date | Fait | Preuve |
|---|---|---|
| 15 nov. 2026 | Phase 0 : accès, tag, branche, export du back, sauvegarde. | commits `17ff4c5`, `9ed0350` ; migration `20261114234523_backup_avant_reparation` |
| 15 nov. 2026 | Phase 1 : audit complet. Phase 2 : ce plan. | `docs/AUDIT.md`, `docs/audit/` |
| 15 nov. 2026 | 3.3 à 3.5, 3.7, 4.1, 4.2 : passerelle `js/api.js`, mode Compte sans simulateurs, comptes réels (inscription, connexion par pseudo, mot de passe oublié, onboarding, profil), état du joueur servi par `api_state`. | 67 tests (24 SQL, 14 Démo, 27 Compte, traductions) ; 3 tests de bout en bout contre le vrai back |
| 15 nov. 2026 | 3.2, 3.6 : `js/supabase.js` retiré ; mode Démo redevenu identique à `3a1d258` ; B01 et B02 corrigés. | 14 tests Playwright dans `tests/demo/` |
| 15 nov. 2026 | 3.0 : trous de sécurité K01 à K13 fermés en production. Base de test embarquée. | migration `20261115032907_securite_urgence_droits` ; 13 tests SQL ; `tools/e2e/verif-securite.mjs` |
| 15 nov. 2026 | 4.3 et phase 5 : moteur de marché côté serveur (portage exact de `js/engine.js`), achat et vente reliés, bots teneurs de marché avec veille, prix diffusés en direct. Les 27 marchés sont revenus à des prix sains. | migrations `marches_moteur`, `bots_marche`, `marches_precision`, `bots_veille` (empreintes identiques au dépôt) ; 99 tests (42 SQL) ; 4 tests de bout en bout contre le vrai back |
| 15 nov. 2026 | 4.7 : argent fictif et KYC écrits par le serveur ; jeu responsable appliqué par le serveur. Recette 3 complète contre le vrai back : inscription → onboarding → dépôt → achat → rechargement → vente → reconnexion par pseudo depuis un autre navigateur. | migration `argent_demo` (empreinte identique) ; 117 tests (52 SQL) ; 4 tests de bout en bout |
| 15 nov. 2026 | Mission réclamée côté serveur ; droits d'appel dérivés des fonctions `api_`. Anti-cache, intégration continue, documentation (README, architecture, back, exploitation). | migration `missions` ; `tools/version.mjs` ; `.github/workflows/tests.yml` ; 120 tests (54 SQL) |
