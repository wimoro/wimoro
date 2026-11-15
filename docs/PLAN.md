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
- [ ] `tests/helpers/app.mjs` : ouvrir le site dans un mode et une langue donnés, collecter les erreurs console.
- [x] Base embarquée pour les tests SQL (`tests/sql/base.mjs`, PGlite) : bouchons Supabase → baseline → migrations, en moins d'une seconde.
- [ ] Intégration continue : `.github/workflows/tests.yml` sur chaque pull request.

### 3.2 Les trois bloquants

- [ ] **B01** — plus d'erreur au chargement. _Test_ `demo/chargement.spec` : zéro erreur console, 3 modes × 3 langues.
- [ ] **B02** — le pari éclair marche en mode Démo. _Test_ `demo/eclair.spec` : mise acceptée, affichée, réglée en fin de manche.
- [ ] **B04** — aucun simulateur du navigateur ne tourne en mode serveur. _Test_ `compte/simulateurs.spec` : en 10 s sans
      message du serveur, aucun prix, volume ni message de chat ne change.

### 3.3 Mode, passerelle, ordre de chargement

- [ ] `js/api.js` : client Supabase (version fixée), `MODE`, événements, attente de session avant le premier rendu.
- [ ] `boot.js` : planification des simulateurs conditionnée au mode ; inventaire des 35 minuteurs traité un par un
      (piloté par le serveur, décor conservé, ou éteint — tableau dans `docs/ARCHITECTURE.md`).
- [ ] Suppression de `js/supabase.js` (plus aucun remplacement de fonction après coup).
      _Test_ `compte/passerelle.spec` : un seul fichier contient `createClient` ; aucun `window.x = function` de remplacement.

### 3.4 Une seule authentification, zéro mélange (B07)

- [ ] Mode serveur = session Supabase, et rien d'autre. Les comptes `localStorage` ne servent qu'au mode Démo.
- [ ] Changement de mode = état remis à neuf. _Test_ `compte/modes.spec` (recette 8) : Démo → Compte → Démo, aucun champ ne fuit.

### 3.5 Annuaire de joueurs et robustesse (B11, B12, B17)

- [ ] Registre `USERS`, `userOf()` jamais `undefined`, chargement par lots, cache.
- [ ] Salon, marché ou jeu inconnu : ignoré et journalisé, jamais d'exception dans un rendu.
      _Test_ `compte/robustesse.spec` : ami inconnu, message d'un UUID inconnu, salon privé inconnu, marché inconnu.

### 3.6 Mode Démo identique à `3a1d258`

- [ ] Rétablir en mode local : pastilles « Mode démo », crédit de démonstration, onboarding.
      _Test_ `demo/parcours.spec` : inscription locale → onboarding → 1 000 000 $ → pari → vente.
- [ ] _Test_ `demo/ecrans.spec` : 26 écrans × 3 langues, zéro erreur.

### 3.7 Textes (B18)

- [ ] Toute chaîne ajoutée passe par `_t()` avec ses entrées anglaise et hébraïque.
      _Test_ `i18n.spec` : aucune clé utilisée n'est absente d'un catalogue.

## Phase 4 — Back et câblage, domaine par domaine

Pour chaque domaine : migration (tables, RPC, policies) → câblage via la passerelle → tests. On ne passe au suivant que si le précédent est vert.

### 4.1 Comptes
- [ ] Inscription : pseudo unique vérifié côté serveur, transmis à `signUp` ; profil créé par trigger ; aucun compte local fantôme (B08, F22).
- [ ] Écran « vérifie ta boîte mail » si la confirmation est active ; fonctionne dans les deux réglages.
- [ ] Connexion par e-mail ou pseudo via un RPC qui n'expose aucun e-mail (B10). Texte de la page mis à jour.
- [ ] Déconnexion propre (dernière sauvegarde attendue, F24, F25).
- [ ] Mot de passe oublié complet, par code et par lien (B09). _Recette 4._
- [ ] Onboarding réel des nouveaux comptes, piloté par l'état serveur (F21).
- [ ] Profil : pseudo unique, bio, couleur, avatar (taille bornée), visibilité, langue, thème.

### 4.2 État et solde
- [ ] `get_state()` et hydratation unique de `S.me` ; blob réduit aux préférences d'interface, versionné, écrit seulement s'il change (B05, B06, B19).
- [ ] Rafraîchissement à la reprise de l'onglet. _Recette 3_ : même état sur deux navigateurs.

### 4.3 Marchés et paris
- [ ] État des marchés, historique de prix, volume, participants depuis le serveur.
- [ ] Acheter et vendre : parité complète des effets (B15), aperçu = exécution (K40, K41, F23), clé d'idempotence.
- [ ] Issues multiples : total à 100 % garanti par le serveur, pas de double rééquilibrage (B16, K21).
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
- [ ] `demo_deposit` (crypto et moyens classiques), `demo_withdraw`, `demo_kyc` (B13, B14, K42). _Recette 7._
- [ ] Limites de jeu responsable côté serveur. _Recette 10._

### 4.8 Progression
- [ ] XP, rangs, missions, badges, séries, notifications attribués par le serveur dans les RPC d'action.
- [ ] Popup de rang une seule fois par rang et par compte.

## Phase 5 — Les 10 000 bots et le market making
- [ ] Un seul peuple de bots, marqué comme tel, sans e-mail ; les 13 personnages d'origine en font partie (K27).
- [ ] Tick serveur : ancre, retour vers l'ancre, rafales et signaux de foule ; issues multiples cohérentes (K20, K21).
- [ ] Contrepartie des paris des joueurs dans la limite de la liquidité (K22).
- [ ] Budget mesuré : durée d'un tick, écritures par tick, messages par seconde, croissance par jour ; purges (K24, K25).
- [ ] Messages des bots stockés en gabarit + paramètres (K26).
- [ ] Marche/arrêt et intensité depuis le panel admin. _Recette 9._

## Phase 6 — Panel d'administration
- [ ] Page séparée, contrôle `is_admin()` dans chaque RPC : joueurs, soldes (motif journalisé), rang, KYC, suspension ;
      marchés ; modération du chat ; bots ; chiffres.

## Phase 7 — Sécurité
- [ ] Relecture des policies une à une ; aucune écriture directe du client sur solde, positions, statistiques, marchés.
- [ ] Limites de fréquence sur le chat et les actions d'argent.
- [ ] Advisors sans alerte ouverte, ou alertes restantes justifiées.

## Phase 8 — Optimisation du front
- [ ] Cache-busting systématique ; catalogue de la seule langue active ; Mode Pro chargé à la demande.
- [ ] Regroupement et minification pour la production, sans build en développement.
- [ ] Mesure avant/après sur mobile.

## Phase 9 — Tests et recette
- [ ] Suite Playwright sur chaque pull request ; comptes de test marqués et nettoyés.
- [ ] Tests SQL des invariants : solde jamais négatif, paris simultanés, rejeu d'une même clé.
- [ ] Recette finale, 10 points, dans les deux modes.

## Phase 10 — Livraison
- [ ] `README.md`, `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/EXPLOITATION.md`.
- [ ] Pull request vers `main`. Fusion seulement si la recette est verte.
- [ ] Vérification en production, en navigation privée.

---

## À faire par l'humain (tableau de bord Supabase ou GitHub)

1. **Accepter la confirmation Supabase** quand elle s'affiche pendant une session de travail : l'outil de base de données
   demande un accord manuel pour toute instruction qui supprime quelque chose, et la demande expire après 2 minutes.
   Deux opérations l'attendent : la migration `securite_urgence_nettoyage` (retrait de règles devenues inutiles) et la
   suppression des comptes de test `wimoro-e2e-…@example.com`.
2. La liste se complétera au fil du chantier (modèle d'e-mail du code à 6 chiffres, URL de redirection, SMTP, mode de
   publication GitHub Pages).

## Journal

| Date | Fait | Preuve |
|---|---|---|
| 15 nov. 2026 | Phase 0 : accès, tag, branche, export du back, sauvegarde. | commits `17ff4c5`, `9ed0350` ; migration `20261114234523_backup_avant_reparation` |
| 15 nov. 2026 | Phase 1 : audit complet. Phase 2 : ce plan. | `docs/AUDIT.md`, `docs/audit/` |
| 15 nov. 2026 | 3.0 : trous de sécurité K01 à K13 fermés en production. Base de test embarquée. | migration `20261115032907_securite_urgence_droits` ; 13 tests SQL ; `tools/e2e/verif-securite.mjs` |
