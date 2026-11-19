# Wimoro — plan de réparation front ↔ back

Ce fichier est le fil conducteur du chantier. Pour reprendre le travail dans une nouvelle session : **« Reprends docs/PLAN.md »**.
Chaque tâche a une case à cocher et un test d'acceptation. Une tâche n'est cochée que si son test a été vu passer.

- Branche de travail : `fix/harmonisation-front-back` (jamais de travail direct sur `main`)
- Retour arrière : tag `avant-reparation` (code) et schéma `backup_20261115` (base)
- Constat de départ : `docs/AUDIT.md`
- Projet Supabase : `brmwvxncyeypefsgiepf`

## Où en est le chantier (16 nov. 2026)

Tout ce que l'écran propose avec un compte est relié au serveur, à une exception près : les **ordres limites** (avec le
stop loss et le take profit), dont la migration attend une confirmation manuelle (voir « À faire par l'humain »). Restent
réservés au mode Démo, par nature : la connexion par portefeuille, le changement de rang à la main, l'outil de
simulation des clans. Les cases encore décochées plus bas sont des limites connues, des rangements facultatifs ou des
optimisations ; aucune ne bloque l'usage du site.

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
- [x] Les fiches arrivent par lots avec ce qui les utilise (état, chat, recherche, amis, classement) ; le classement vient du serveur (lot 4.6).
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
- [x] Combinés : livrés (voir 4.6, « Combinés »).
- [x] Propositions de marché, votes, mise en ligne : livrés (voir 4.6, « Propositions »).
- [x] Clôture et résolution depuis le panel admin (K05, K48) : livrées (voir Phase 6).

### 4.4 Pari éclair, Blitz, Série
- [x] `js/moteur-eclair.js` : moteur pur (horloge, trajectoires, issues, cagnottes, frais, gains), auquel `js/flash.js`
      délègue. _Test_ `tests/eclair-moteur.spec.mjs` : mêmes issues sur 19 jeux × 500 manches, mêmes prix, mêmes cagnottes
      que le code d'origine (référence produite avant l'extraction : `tests/fixtures/eclair-reference.json`).
- [x] Edge Function `eclair` (copie conforme du moteur) : miser avec l'horloge du serveur, régler en rejouant la manche ;
      écritures par `srv_eclair_…`, réservées à la clé de service. Une mise par pari et par manche, pause respectée, mise
      rendue après rechargement, manches manquées réglées au retour avec notification. _Recette 2._ _Tests_
      `tests/sql/eclair.spec.mjs`, `tests/compte/eclair.spec.mjs`, `tests/e2e/comptes.spec.mjs` (le gain payé par le vrai
      serveur est celui que l'écran avait calculé).
- [ ] Limite connue : la cagnotte d'une manche est celle des joueurs simulés plus la mise du joueur, comme en mode Démo ;
      les mises des autres vrais joueurs n'y entrent pas encore.
- [x] La Série en mode Compte : lancée, jouée, réglée et encaissée par le serveur (Edge Function `eclair`, actions `serie_…` ;
      fonctions `srv_serie_…` réservées à la clé de service). Heure de début, prix de départ, cote et issue viennent du
      serveur. _Tests_ `tests/sql/serie.spec.mjs` (7), `tests/compte/serie.spec.mjs` (3), `tests/e2e/comptes.spec.mjs`
      (une manche gagnée puis encaissée contre le vrai serveur : le stack payé est celui que l'écran annonce).
- [x] Blitz Royale en mode Compte : la salle (joueurs simulés, choix, issues, jackpot reporté) se déduit de l'heure avec le
      moteur partagé ; l'entrée, les choix, le rachat et le gain des vrais joueurs sont écrits par le serveur (Edge Function
      `eclair`, actions `blitz_…` ; fonctions `srv_blitz_…`). _Tests_ `tests/sql/blitz.spec.mjs` (5),
      `tests/compte/blitz.spec.mjs` (3 : dix manches gagnées, chute + rachat, spectateur), `tests/e2e/comptes.spec.mjs`
      (salle et inscription contre le vrai serveur).
- [ ] Limite : un Blitz entier (dix manches puis le paiement) n'a pas été joué contre le vrai serveur — il faudrait attendre
      un créneau réel de 15 minutes dans un test. Le paiement est prouvé dans la base embarquée et avec le faux serveur.
- [x] Chat du Blitz (« Joueurs et spectateurs ») : relié. C'est un salon public de plus (`blitz`) : écrire, relire, réagir
      y suivent les règles du salon général. Les bots y parlent quand quelqu'un regarde, avec les phrases du chat du
      Blitz de la démo (gabarit « Z ») ; le salon s'ouvre avec six messages récents ; le panel d'administration voit et
      masque ses messages. Les salons VIP et de clan sont reliés eux aussi (voir 4.5 et 4.6). _Tests_
      `tests/sql/chat-blitz.spec.mjs` (2), `tests/compte/blitz.spec.mjs` (1 de plus), `tests/e2e/comptes.spec.mjs` (le
      vrai serveur ouvre le salon avec ses messages de bots, le joueur y écrit et retrouve son message après
      rechargement).
- [ ] Limite : les lignes d'événement du Blitz (« Manche 3 : Haut. 41 éliminés… ») que la démo écrit dans ce chat ne sont
      pas reprises en mode Compte : le déroulé de la manche se lit sur la carte du Blitz, pas dans le chat.
- [ ] Limite assumée de la maquette : le pari éclair, la Série, le Blitz et les duels éclair sont **déterministes** (tout se
      déduit de l'heure, avec un moteur public). Un joueur qui lit le code peut donc connaître l'issue d'une manche à
      l'avance — y compris pour défier un autre joueur. Sans conséquence avec de l'argent fictif ; à remplacer par un
      tirage secret côté serveur avant tout argent réel.

### 4.5 Chat
- [x] Salons publics (général et salon de chaque marché) : historique, envoi, réception en direct ; on ne s'abonne qu'au
      salon à l'écran ; chaque message arrive avec le pseudo et le rang de son auteur. _Recette 5 (partie chat)._
      _Tests_ `tests/sql/chat.spec.mjs`, `tests/compte/chat.spec.mjs`, `tests/e2e/comptes.spec.mjs` (deux comptes).
- [x] Anti-spam côté serveur (K13) : une seconde entre deux messages, pas deux fois le même, 12 par minute au plus,
      280 caractères ; 2 XP par message, 20 XP par jour au plus.
- [x] Les anciens messages figés en français (11 989, écrits par les anciens bots) ne sont plus servis (K26) ; ils ne
      sont pas supprimés.
- [x] Messages privés entre amis (`api_dm_send`, `api_dm_history`, `api_dm_list`) et **sujet privé par joueur**
      (`joueur:<identifiant>`, règle d'accès sur `realtime.messages`) : un message de A à B n'est ni recevable ni lisible
      par un troisième joueur (K09). _Recette 5 (fin)._ _Tests_ `tests/sql/prive.spec.mjs`, `tests/compte/prive.spec.mjs`,
      `tests/e2e/comptes.spec.mjs` (un tiers abonné au sujet privé d'un autre ne reçoit rien, sur le vrai temps réel).
- [x] Les notifications destinées à un autre joueur (demande d'ami, acceptation, message reçu) lui arrivent en direct.
- [x] Salon VIP : relié pour les joueurs du rang Ascendant et au-dessus (les autres gardent l'aperçu verrouillé de
      l'écran). Écrire, relire, réagir, partager une mise ou une analyse y suivent les règles des autres salons ; sans le
      rang, le serveur répond « rang insuffisant ». Ses messages passent par le sujet **privé** « vip », qu'une règle
      d'accès n'ouvre qu'à ce rang (`wm.vip_ok`, règle `wm_vip_lit_son_salon`). Les bots n'y parlent pas (comme dans la
      démo) ; ils y réagissent. Le panel d'administration voit et peut masquer ses messages. _Tests_
      `tests/sql/salon-vip.spec.mjs` (3), `tests/compte/salon-vip.spec.mjs` (2), `tests/e2e/comptes.spec.mjs` (refus du
      vrai serveur sans le rang).
- [x] Corrigé au passage : suivre une mise partagée demande d'avoir accès au salon où elle a été publiée. Avant, un joueur
      extérieur à un clan pouvait suivre, par son numéro, une mise partagée dans le chat de ce clan (test ajouté : il
      échouait avant la correction).
- [ ] Limites du salon VIP : (1) aucun compte de test n'a le rang Ascendant : le salon n'a pas été joué de bout en bout
      contre la vraie base (il l'est dans la base embarquée et avec le faux serveur) ; (2) comme pour les clans, le droit
      d'écouter le sujet privé est vérifié à l'abonnement puis gardé jusqu'à l'expiration du jeton (une heure au plus).
- [ ] Limite : écrire en privé demande le rang Bronze (300 XP et 3 paris réglés), comme à l'écran ; le scénario complet
      entre deux vrais comptes neufs n'a donc pas pu être joué de bout en bout (il l'est côté base et avec le faux serveur).
- [x] Cartes de mise et d'analyse, réactions, « suivre cette mise » : reliées au serveur (voir plus bas). Mentions et
      citations de marché : affichées.
- [x] Messages des bots dans le chat (K26) : le serveur envoie un gabarit et ses paramètres, l'écran compose la phrase
      dans la langue du lecteur. Les bots ne parlent que dans les salons qu'un joueur regarde ; un salon s'ouvre avec six
      messages récents ; aucune ligne créée (anneau de 30 messages par salon). _Tests_ `tests/sql/chat-bots.spec.mjs`,
      `tests/compte/chat.spec.mjs`, `tests/e2e/comptes.spec.mjs` (un message de bot arrive en direct, sur le vrai serveur).

### 4.6 Social
- [x] Amis : recherche d'un joueur par son pseudo (`api_users_search`), demande, annulation, acceptation, refus, retrait
      (`api_friend`) (B11, K10, K44). Rien n'est supprimé ; 15 XP par nouvelle amitié, une seule fois par paire ; un bot
      accepte tout de suite ; 30 demandes par heure au plus. _Recette 5 (partie amis)._ _Tests_ `tests/sql/amis.spec.mjs`,
      `tests/compte/amis.spec.mjs`, `tests/e2e/comptes.spec.mjs` (deux vrais comptes).
- [x] La demande reçue apparaît à la seconde, par le sujet privé du joueur (voir 4.5).
- [x] Classement servi par le serveur (`api_leaderboard` : 50 fiches publiques, vrais joueurs et bots) : l'écran n'est plus vide en mode Compte (B17). _Tests_ `tests/sql/classement.spec.mjs`, `tests/compte/amis.spec.mjs`. Vérifié avec le faux serveur et par requête sur la base, pas encore par un test de bout en bout.
- [ ] Classement par période tenu par le serveur (K46) : aujourd'hui « Semaine » et « Mois » sont déduits du total, comme en mode Démo. (Suivre un joueur : livré, voir plus bas.)
- [x] Duels entre amis sur un marché : défier (mise et frais pris tout de suite), accepter au prix du marché, refuser, annuler,
      expirer après 48 heures, lien d'invitation, bot défié qui accepte aussitôt ; réglés avec la résolution du marché (panel
      d'administration). `api_duel_create`, `api_duel_accept`, `api_duel_close`, `api_duel_code`, `api_duels`. _Tests_
      `tests/sql/duels.spec.mjs` (5), `tests/compte/duels.spec.mjs` (3), `tests/e2e/comptes.spec.mjs` (deux vrais comptes : défi,
      refus faute de solde, remboursement ; duel contre un bot).
- [x] Duels sur une manche éclair : défier un ami sur la manche en cours (ou la suivante s'il reste moins de dix secondes
      de mises), mise et frais pris tout de suite ; l'ami prend l'autre camp au prix du moment, avant la fermeture des
      mises ; le gagnant prend la cagnotte à la fin de la manche ; un « break even » annule le duel et rend les deux mises ;
      sans réponse, la mise du défieur lui est rendue ; un bot défié accepte aussitôt. Prix, frais et issue viennent du
      moteur éclair exécuté par le serveur (Edge Function `eclair`, actions `duel_create`, `duel_accept`, `duel_settle`),
      la manche de l'horloge de la base. _Tests_ `tests/sql/duels-eclair.spec.mjs` (5), `tests/compte/duels-eclair.spec.mjs`
      (4), `tests/e2e/comptes.spec.mjs` (duel contre un bot joué jusqu'au règlement par le vrai serveur).
- [ ] Limite : un duel éclair entre deux vrais joueurs n'a pas été joué contre la vraie base (il est prouvé dans la base
      embarquée et avec le faux serveur) ; contre un bot, il l'est de bout en bout. Comme le pari éclair, il repose sur le
      moteur déterministe : voir la limite assumée ci-dessus.
- [x] Duels de stack contre un joueur simulé (`api_stack_create`, `api_stacks`) : même buy-in, 1 000 jetons chacun, sept
      jours ; le stack du joueur suit ses résultats réels (ce qu'il a gagné ou perdu, plus la valeur de ses positions) ; le
      plus gros stack remporte la cagnotte (deux buy-in moins 4 %) et 30 XP ; à égalité, le buy-in est rendu. _Choix_ :
      le stack de l'adversaire simulé suit une trajectoire semée par le duel, calculée par le serveur heure par heure
      (elle finit le plus souvent entre 800 et 1 300 jetons — dans la démo, il grossissait sans limite tant que la page
      restait ouverte) ; cinq duels de stack en cours au plus ; le règlement se fait au premier passage du joueur après
      les sept jours. _Tests_ `tests/sql/stacks.spec.mjs` (4), `tests/compte/stacks.spec.mjs` (2),
      `tests/e2e/comptes.spec.mjs` (buy-in pris par le vrai serveur, duel retrouvé après rechargement, refus).
- [ ] Duel de stack contre un vrai joueur : refusé clairement par le serveur (« pas encore disponible : choisis un autre
      adversaire »). Il faudrait que l'ami donne son accord et sa mise, et l'écran n'a pas cette étape.
- [ ] Limite : le règlement d'un duel de stack n'a pas été joué contre la vraie base (il faut sept jours) ; il est prouvé
      dans la base embarquée et avec le faux serveur.
- [ ] Limite : le paiement d'un duel gagné n'a pas été joué contre la vraie base (il faudrait résoudre un vrai marché) ; il est
      prouvé dans la base embarquée et avec le faux serveur.
- [x] Clans, première partie : rejoindre un clan ouvert ou entrer avec un code d'invitation, candidater (un officier répond en
      quelques secondes, comme dans la démo), quitter (7 jours d'attente), créer un clan (rang Argent, compte de 14 jours,
      50 $ de frais, tag unique) ; le tag suit le joueur aux yeux des autres ; chaque mise compte pour le clan (2 000 $ par
      jour au plus). L'annuaire des 100 clans de démonstration est le même à l'écran et sur le serveur
      (`tests/fixtures/clans-demo.json`, vérifié des deux côtés) ; les clans créés par des joueurs s'y ajoutent. _Tests_
      `tests/sql/clans.spec.mjs` (7), `tests/compte/clans.spec.mjs` (4), `tests/e2e/comptes.spec.mjs` (rejoindre pour de vrai,
      tag vu par un autre joueur, mise comptée, attente après départ).
- [x] Suivre un joueur (`api_follow`) : liste et compteur d'abonnés tenus par le serveur. Partages en image de la Série et du
      clan : disponibles (ils ne font que dessiner une image, avec le vrai code de parrainage). _Tests_
      `tests/sql/suivre.spec.mjs`, `tests/compte/suivre.spec.mjs`, `tests/e2e/comptes.spec.mjs` (suivre pour de vrai).
- [x] Partager une mise dans le chat et la suivre (`api_chat_share`, `api_chat_follow`), mêmes règles que la démo : rang
      Bronze pour partager une de ses positions (+5 XP), la carte est vue en direct par les lecteurs du salon ; un à trois
      joueurs la suivent dans les vingt secondes, chaque suivi rapporte 20 XP à l'auteur et compte pour ses rangs (« mises
      suivies ») ; rang Argent pour suivre la mise d'un autre joueur après avoir parié comme lui (+5 XP). La case « Annoncer
      ma mise dans le chat du marché » du ticket passe par la même fonction. _Choix_ : une même position (marché et côté) ne
      se partage qu'une fois par 24 heures et une mise ne se suit qu'une fois — bornes ajoutées côté serveur pour que les XP
      ne se fabriquent pas en boucle ; quand la borne refuse l'annonce automatique d'un pari, l'écran ne dit rien (le pari,
      lui, est passé). Les suivis des bots sont programmés au moment du partage et crédités par la tâche `wm-suivis` (toutes
      les 5 secondes, sans effet tant que personne ne partage). _Tests_ `tests/sql/chat-mises.spec.mjs` (3),
      `tests/compte/mises.spec.mjs` (2), `tests/e2e/comptes.spec.mjs` (partage pour de vrai, carte reçue en direct par un
      autre joueur, suivis crédités par le vrai serveur, refus sans le rang Argent).
- [x] Partager une mise dans une conversation privée (bouton « Partager une mise » d'une conversation : il répondait
      « Bientôt disponible ») : mêmes conditions qu'un message privé (amis, rang Bronze) ; la carte n'est poussée qu'à
      l'ami, sur son sujet privé ; lui seul peut la suivre, et le compteur de suivis n'est alors envoyé qu'aux deux
      participants. _Choix_ : aucun joueur simulé ne suit une mise partagée en privé ; la règle « une fois par 24 heures
      et par position » vaut tous salons confondus. _Tests_ `tests/sql/mise-privee.spec.mjs` (2),
      `tests/compte/prive.spec.mjs` (1 de plus), `tests/e2e/comptes.spec.mjs` (refus du vrai serveur : pas à soi-même,
      pas à un inconnu, pas à un joueur qui n'est pas un ami).
- [ ] Limite : une mise partagée en privé puis suivie par l'ami n'a pas été jouée contre la vraie base (les messages
      privés demandent le rang Bronze, que les comptes de test n'ont pas) ; elle est prouvée dans la base embarquée et
      avec le faux serveur.
- [ ] Limite : un vrai joueur qui suit la mise d'un autre n'a pas été joué contre la vraie base (les comptes de test n'ont
      pas le rang Argent) ; c'est prouvé dans la base embarquée et avec le faux serveur. Le refus, lui, est joué pour de vrai.
- [x] Réactions sous les messages (`api_chat_react`), mêmes règles que la démo : quatre réactions, un clic pose la sienne,
      un second la retire ; le compteur est tenu par le serveur et vu en direct par les lecteurs du salon, ou par l'autre
      participant d'une conversation privée. Les bots réagissent aussi aux derniers messages des salons regardés (environ
      une réaction toutes les 20 secondes par salon) ; quand c'est au message d'un joueur, une fois sur deux il reçoit une
      bulle et 1 XP, comme dans la démo. _Choix_ : le serveur n'envoie que des compteurs, jamais qui a réagi ; retirer sa
      réaction marque la ligne inactive (rien n'est supprimé) ; 40 réactions par minute et par joueur au plus (nouveau
      compteur `wm.debit`, réutilisable pour d'autres actions) ; la réaction d'un vrai joueur ne donne pas d'XP à l'auteur
      (deux comptes pourraient s'en fabriquer) ; un message de bot reste ouvert aux réactions tant qu'il est parmi les 30
      derniers de son salon. Le panel d'administration nomme désormais les mises partagées (leur texte est vide).
      _Tests_ `tests/sql/reactions.spec.mjs` (6), `tests/compte/reactions.spec.mjs` (2), `tests/e2e/comptes.spec.mjs`
      (deux vrais comptes : compteur vu en direct par l'autre, message de bot, retrait, refus du vrai serveur).
- [ ] Limite : une réaction dans une conversation privée n'a pas été jouée contre la vraie base ; elle est prouvée dans la
      base embarquée (y compris : un tiers ne peut ni réagir ni rien recevoir) et avec le faux serveur.
- [x] Conséquence pour les scénarios réels : les XP d'un compte peuvent monter d'un point à tout moment (réaction d'un bot à
      son message). Les vérifications d'XP « à l'unité près » de `tests/e2e/comptes.spec.mjs` acceptent ces points en plus
      (`xpVaut`), et rien d'autre.
- [x] Mode Pro, partager son analyse (`api_ana_share`, `api_ana`) : dans le chat général, le chat du marché analysé, le
      chat de son clan ou à un ami en message privé (un à quatre salons) ; elle compte comme un message (2 XP,
      missions). Une analyse est un instantané du graphique : bougies visibles, indicateurs calculés, tracés,
      commentaire. Les prix du Mode Pro sont simulés par l'écran : le serveur ne peut pas les vérifier. Il traite donc
      l'instantané comme un contenu écrit par un joueur et le **remet au propre** avant de le garder
      (`wm.ana_propre` : seuls les champs connus sont repris, nombres bornés, couleurs et réglages vérifiés,
      identifiants refaits, textes des tracés débarrassés de tout caractère lisible comme du code) ; l'écran refait la
      même remise au propre avant de dessiner l'analyse d'un autre joueur (`srvAnaPropre`). Le message de chat ne porte
      qu'une référence ; l'instantané se lit à part, avec les droits du salon, et plus du tout une fois le message
      masqué par l'administration. Dans un salon public regardé, un joueur simulé répond quelques secondes plus tard
      (gabarit « A », phrases de la démo). _Choix_ : 12 analyses par 24 heures et par joueur, 400 Ko au plus chacune ;
      les bots ne publient pas d'analyses en mode Compte ; la mention « enregistrée sur cet appareil » de la fenêtre de
      partage n'est plus affichée avec un compte (elle serait fausse). _Tests_ `tests/sql/analyses.spec.mjs` (5, dont 38
      instantanés hors format refusés), `tests/compte/analyses.spec.mjs` (3, dont une analyse piégée redessinée sans
      danger : ce test échoue si l'on retire la remise au propre de l'écran), `tests/compte/admin.spec.mjs` (libellés du
      panel), `tests/e2e/comptes.spec.mjs` (deux vrais comptes : A partage, B reçoit la carte en direct et l'ouvre, un
      joueur simulé répond, refus du vrai serveur).
- [ ] Limites du partage d'analyse : (1) les bougies et les valeurs d'indicateurs sont celles que l'écran de l'auteur a
      envoyées : le serveur les borne mais ne peut pas les authentifier (une analyse peut donc montrer un graphique
      inventé, comme un message peut dire une chose fausse) ; (2) le partage dans le chat d'un clan et en message privé
      n'a pas été joué contre la vraie base (il l'est dans la base embarquée et avec le faux serveur) ; (3) seuls les
      partages réussis sont comptés : des envois refusés à répétition ne sont pas freinés ; (4) la réponse d'un joueur
      simulé cite le pseudo de l'auteur : si l'analyse disparaît (message masqué, compte supprimé), cette réponse n'est
      plus servie, mais elle reste dans la mémoire interne du salon jusqu'à ce que 30 messages plus récents la chassent.
- [ ] La connexion par portefeuille et les outils « démo » (changer de rang à la main, simuler un clan) n'existent, par
      nature, qu'en mode Démo.
- [x] Chat de clan : un salon réservé aux membres (`clan:<identifiant>`). Écrire, relire, réagir et partager une mise y
      suivent les règles des autres salons ; un joueur d'un autre clan reçoit « salon indisponible ». Les messages ne passent
      par aucun sujet public : ils sont diffusés sur le sujet **privé** du clan, qu'une règle d'accès n'ouvre qu'à ses
      membres (`wm.clan_sujet`, règle `wm_membre_lit_son_clan`). À sa première ouverture, le salon reçoit du serveur les
      trois messages d'accueil de la démo ; les bots n'y parlent pas ensuite, mais ils y réagissent. Le panel
      d'administration voit et peut masquer les messages des salons de clan (pas les messages privés). _Tests_
      `tests/sql/clan-chat.spec.mjs` (5), `tests/compte/clan-chat.spec.mjs` (1), `tests/e2e/comptes.spec.mjs` (trois vrais
      comptes : un membre écrit, l'autre membre le reçoit en direct, le joueur hors du clan qui écoutait ne reçoit rien).
- [ ] Limite connue (Supabase Realtime) : le droit d'écouter un sujet privé est vérifié à l'abonnement, puis gardé jusqu'à
      l'expiration du jeton du joueur (une heure au plus). Un membre qui vient de quitter son clan peut donc encore recevoir
      les nouveaux messages pendant ce délai s'il garde sa connexion ouverte ; il ne peut plus ni relire l'historique, ni
      écrire, ni réagir, et un nouvel abonnement lui est refusé. L'écran, lui, se désabonne dès le départ.
- [x] Fil d'activité du clan, tenu par le serveur : arrivées, départs, fondation, mises des membres qui l'acceptent (réglage
      « Partager mes mises… », coché par défaut), promotions, exclusions, appels. Il ne se lit que de l'intérieur du clan.
- [x] Outils du chef et des officiers (`api_clan_promote`, `api_clan_kick`, `api_clan_invite`, `api_clan_call`) : le chef
      nomme jusqu'à 5 officiers ; chef et officiers excluent (un officier n'exclut qu'un simple membre), invitent un ami,
      lancent un appel de clan (épinglé en tête du fil, annoncé dans le chat du clan, suivi quelques secondes plus tard
      par 2 à 5 membres : son auteur en est prévenu). _Choix_ : un ami simulé (bot) invité rejoint aussitôt, comme dans la
      démo ; un vrai joueur n'est **jamais** ajouté d'office : il reçoit une notification avec le code d'invitation et
      décide ; un membre exclu attend 7 jours comme après un départ ; quand le chef s'en va, un vrai membre lui succède
      plutôt qu'un bot ; six appels par heure au plus. _Tests_ `tests/sql/clans-chefs.spec.mjs` (5),
      `tests/compte/clans-chefs.spec.mjs` (3), `tests/e2e/comptes.spec.mjs` (fil d'activité lu sur le vrai serveur,
      refus des pouvoirs de chef à un simple membre).
- [ ] Limite : les outils de chef n'ont pas été joués contre la vraie base (il faut créer un clan : rang Argent et compte de
      14 jours, que les comptes de test n'ont pas) ; ils sont prouvés dans la base embarquée et avec le faux serveur.
- [x] Guerres de clans (`api_clan_war`, `api_clan_war_join`), aux règles de la démo : le chef déclare la guerre à un clan de
      sa division, tiré au sort ; elle dure 48 heures ; chaque membre peut y participer pour un buy-in de 20 $ (pris par le
      serveur, une seule fois) ; ses points valent sa contribution au clan divisée par dix ; à la fin, on additionne les dix
      meilleurs de chaque camp : le clan vainqueur se partage la cagnotte moins 4 %, à parts égales, et chaque vrai
      participant gagne 50 XP ; à égalité, les buy-in sont rendus. La guerre est annoncée dans le fil et dans le chat du
      clan ; les guerres terminées sont listées dans l'onglet « Guerre ». _Choix_ : le clan adverse est un clan de
      démonstration, dont les dix participants sont simulés par le serveur (200 à 1 100 points au départ, +50 % au plus sur
      la durée de la guerre) ; les membres simulés de notre clan (bots invités, sept au plus) participent d'office : leur
      buy-in entre dans la cagnotte et leur part du gain ne va à personne ; un clan de joueurs se bat en division Bronze ;
      le règlement se fait au premier passage d'un membre du clan ou d'un participant après les 48 heures (un participant
      qui a quitté le clan entre-temps touche quand même sa part : ses points valent alors zéro). _Tests_
      `tests/sql/clans-guerres.spec.mjs` (4), `tests/compte/clans-guerres.spec.mjs` (2), `tests/e2e/comptes.spec.mjs` (refus
      du vrai serveur : un simple membre ne déclare pas la guerre, aucun buy-in n'est pris sans guerre en cours).
- [ ] Limites des guerres de clans : (1) elles n'ont pas été jouées contre la vraie base (il faut être chef d'un clan de
      joueurs : rang Argent et compte de 14 jours) ; elles sont prouvées dans la base embarquée et avec le faux serveur ;
      (2) les points des participants simulés se calculent à l'avance à partir du code public et, comme dans la démo, on
      peut rejoindre une guerre jusqu'à sa dernière minute, quand l'issue est presque connue : acceptable pour une maquette
      en argent fictif, à revoir avant tout argent réel ; (3) il n'y a pas de tâche planifiée : une guerre terminée n'est
      réglée qu'au passage d'un de ses membres ou participants.
- [ ] Le classement et les divisions des clans de démonstration restent ceux de l'écran (ils ne bougent pas en mode
      Compte). L'outil « simuler » des clans (`cl-sim`) n'existe, par nature, qu'en mode Démo.
- [ ] Limite : la création d'un clan n'a pas été jouée contre la vraie base (rang Argent et compte de 14 jours demandés) ;
      elle est prouvée dans la base embarquée et avec le faux serveur.
- [x] Copy trading : à partir du rang Or, copier un profil public qui l'autorise (budget, mise fixe ou pourcentage, catégories,
      arrêt de perte) ; chaque pari et chaque vente du joueur copié sont reproduits par le serveur, avec le même carnet que les
      paris ordinaires ; pause, réglages, arrêt en gardant ou en vendant les positions ; 20 % des frais reversés au joueur
      copié ; un joueur qui passe en profil privé n'est plus copié. Les bots copiés placent des paris au rythme de la démo
      (tâche `wm-copies`, toutes les 20 secondes, sans effet tant que personne ne copie). _Tests_ `tests/sql/copies.spec.mjs` (7),
      `tests/compte/copies.spec.mjs` (2), `tests/e2e/comptes.spec.mjs` (page lue sur le vrai serveur, refus sans le rang Or,
      pari ordinaire toujours accepté avec le nouveau suivi).
- [ ] Limites : une copie n'a pas été jouée contre la vraie base (les comptes de test n'ont pas le rang Or) ; elle est prouvée
      dans la base embarquée et avec le faux serveur. Le cas « copieur occupé au même instant » (il n'est alors pas attendu, sa
      copie saute ce pari) demande deux connexions simultanées, que la base embarquée n'a pas.
- [x] Propositions de marché : à partir du rang Or, un joueur propose un pari ; la communauté (les bots) vote au rythme de la
      démo, les autres joueurs peuvent voter (+2 XP) ; à 25 votes le pari passe en ligne pour tout le monde, avec son carnet
      et son chat (+10 XP à l'envoi, +50 XP à la mise en ligne). Les trois propositions « À voter » de la démo existent sur
      le serveur comme contenu de démonstration. _Tests_ `tests/sql/propositions.spec.mjs` (4),
      `tests/compte/propositions.spec.mjs` (2), `tests/e2e/comptes.spec.mjs` (refus du vrai serveur sans le rang Or, vote réel).
- [ ] Limite : l'envoi d'une proposition et sa mise en ligne n'ont pas été joués contre la vraie base (les comptes de test
      n'ont pas le rang Or, et je ne modifie pas le rang d'un compte à la main) ; ils sont prouvés dans la base embarquée
      et avec le faux serveur.
- [ ] **Ordres limites, stop loss, take profit : lot prêt et testé, en attente de ta confirmation.** L'outil Supabase a demandé
      une confirmation manuelle pour cette migration (elle contient des suppressions de lignes dans ses fonctions) ; personne
      n'était là, la demande a expiré, et je n'ai pas contourné ce garde-fou. Le lot est rangé dans la branche
      `lot/ordres-limites` (pull request ouverte, à ne fusionner qu'après application de la migration). En attendant, ces
      fonctions restent « Bientôt disponible » pour les comptes : rien n'est cassé. Ce qui est prouvé dans la branche :
      devis identiques à ceux de l'écran sur 600 cas, montant réservé, exécutions partielles, annulation, stop loss, take
      profit, marché résolu (7 tests de base, 2 tests d'écran).
- [x] Organisation : l'état du joueur (`api_state`) et les suites d'une résolution de marché s'assemblent à partir de blocs
      enregistrés (`wm.etat_blocs`, `wm.suites_blocs`). Un lot ajoute sa ligne sans réécrire les fonctions communes, donc
      un lot appliqué en retard n'efface plus rien. _Tests_ `tests/sql/etat-blocs.spec.mjs` (3).
- [x] Parrainage, correctif : le bonus du parrain n'attend jamais un parrain occupé (deux paris simultanés sur le même
      marché pouvaient se bloquer l'un l'autre) ; il est alors versé au chargement suivant. _Limite_ : ce cas demande deux
      connexions en même temps, la base embarquée des tests n'en a qu'une ; le chemin normal reste couvert par
      `tests/sql/parrainage.spec.mjs`.
- [x] Parrainage : un code par joueur (PSEUDO-XXX) donné par le serveur, 10 $ pour l'ami à la création de son compte, 10 $ pour
      le parrain au premier pari de son filleul (quel que soit le jeu), filleuls et gains affichés depuis le serveur, en direct.
      Le code est lu une seule fois, à la création du compte. Une panne du parrainage n'empêche ni de créer un compte ni de
      parier ; un bonus manqué est rattrapé au chargement suivant du parrain. _Tests_ `tests/sql/parrainage.spec.mjs` (5),
      `tests/compte/parrainage.spec.mjs` (3), `tests/e2e/comptes.spec.mjs` (lien d'invitation, bonus de l'ami, bonus du parrain
      en direct contre le vrai serveur).
- [x] Correctif trouvé en chemin : après un duel expiré, la réponse du chargement portait encore l'ancien solde (la mise
      rendue n'apparaissait qu'au chargement suivant). Ce qui se règle au chargement passe maintenant avant la lecture.
      _Test_ `tests/sql/duels.spec.mjs` (« la réponse elle-même porte la mise rendue » : échouait avant, passe après).
- [x] Paris combinés : 2 à 6 sélections, prix bloqués à la validation, 5 % du gain brut, gain plafonné à 50 000 $, encaissement
      anticipé à la valeur du moment, règlement sélection par sélection à la résolution des marchés (`api_combo_place`,
      `api_combo_cash`, `api_combos`). La sélection en cours (le « slip ») reste locale à l'écran. _Tests_
      `tests/sql/combines.spec.mjs` (3), `tests/compte/combines.spec.mjs` (2), `tests/e2e/comptes.spec.mjs` (composé, validé,
      rechargé, encaissé contre le vrai serveur).
- [ ] Limite : le paiement d'un combiné gagné n'a pas été joué contre la vraie base (il faudrait résoudre de vrais marchés) ; il
      est prouvé dans la base embarquée et avec le faux serveur.

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
- [x] Rappel renforcé (2 % de l'écart, réglable par `rappel` dans `wm.config`) : avec 0,5 %, un marché très actif s'écartait
      encore trop. Migration `bots_rappel`.
- [x] Tenue dans le temps : les ancres sont rappelées vers la valeur de référence de chaque marché. Sans cela, la logique
      du mode Démo, laissée tourner jour et nuit, polarisait les prix vers 5 % ou 95 % en quelques heures (test « sur la
      durée » : 3 échecs sur 3 sans le correctif, 3 succès sur 3 avec). Migration `bots_ancres`.
- [x] Purge du journal de pg_cron (30 000 lignes, 6 Mo par jour) : migration `purge_journal_cron` appliquée le 15 nov. 2026
      avec l'accord explicite du propriétaire ; la tâche `wm-purge-cron` tourne chaque heure et ne garde que six heures
      de journal (vérifié le 16 nov. : 16 500 lignes, la plus ancienne de 6 h 30).
- [x] Messages des bots dans le chat, en gabarit + paramètres (K26) : voir 4.5.
- [x] Marche/arrêt, intensité et bavardage des bots depuis le panel d'administration (onglet « Bots »). _Recette 9._

## Phase 6 — Panel d'administration
- [x] Page séparée `admin.html`, une seule porte côté serveur (`api_admin`) qui vérifie à chaque appel que le compte est
      dans `public.admin_users` ; tout ce qui modifie est journalisé (`wm.admin_journal`). Joueurs : recherche, solde avec
      motif, XP, rang, KYC fictif, suspension. Marchés : création, modification, fermeture des mises, **résolution**
      (1 $ par part gagnante, positions réglées, joueurs prévenus). Chat : masquer un message. Bots. Chiffres. Journal.
      _Tests_ `tests/sql/admin.spec.mjs` (7), `tests/compte/admin.spec.mjs` (4), `tests/compte/marches-etat.spec.mjs` (5),
      `tests/e2e/comptes.spec.mjs` (un compte ordinaire est refusé par le vrai serveur).
- [ ] Limite : le parcours d'un vrai administrateur n'a pas été joué contre la vraie base (je n'ai pas le mot de passe du
      compte `WimoroAdmin`, et je n'ai pas voulu créer de marché d'essai en production). Il est prouvé dans la base
      embarquée et avec le faux serveur.
- [x] Nouveau panneau, **côté serveur** (19 nov. 2026, branche `marches-et-admin`), détail dans `docs/BACKEND.md`, § 9 :
      sauvegarde avant tout (lot 0) ; réglages, équipe à deux rôles (administrateur, modérateur), journal en ajout seul à
      empreintes chaînées, porte unique `api_equipe` avec double authentification (lot 1) ; blocages par accès,
      déconnexion forcée, maintenance, actions sur les joueurs, le chat, les clans et le site (lot 2) ; frais et limites
      lus dans les réglages (lot 3) ; diffusion en direct sur les sujets `site`, des salons et `joueur:<id>` (lot 5).
      _Tests_ `tests/sql/sauvegarde-20261119`, `equipe`, `blocages`, `gardes`, `reglages-frais`, `diffusion`.
- [ ] Écran du nouveau panneau, enrôlement du code de double authentification, lecture d'`api_site()` par le site
      (annonce, maintenance, frais à jour dans l'aperçu du ticket) et des nouveaux codes d'erreur : lot de l'interface.
- [ ] Prix du Blitz, Bet Exact, frais du pari éclair et de La Série : réglages créés mais « pas encore appliqués »,
      à brancher avec l'Edge Function `eclair`. Résolution et annulation de marchés par la nouvelle porte : lot du cycle de
      vie des marchés (l'ancien panel les fait toujours).

## Phase 7 — Sécurité
- [x] Aucune écriture directe du client sur solde, positions, statistiques, dépôts, marchés (migration `securite_urgence_droits`,
      tests `tests/sql/securite*.spec.mjs`, `argent.spec.mjs`).
- [x] Ancienne API fermée après la mise en ligne (migration `fermeture_ancienne_api`) : plus aucun droit direct sur les
      tables, plus aucune fonction appelable hors `api_…`. Test avant/après et retour arrière : `tests/sql/fermeture.spec.mjs`.
      Le rangement des policies devenues inutiles (`securite_urgence_nettoyage`) attend une confirmation manuelle ; il n'est
      pas nécessaire à la sécurité.
- [ ] Limites de fréquence sur le chat et les actions d'argent. _Fait_ : chat (1 message par seconde, 12 par minute),
      réactions (40 par minute, compteur générique `wm.debit`), propositions (5 par jour), partage de mise (une fois par
      jour et par position). _Reste_ : brancher `wm.debit` sur les actions d'argent (paris, dépôts et retraits fictifs).
- [x] Advisors : les 50 alertes « fonction SECURITY DEFINER appelable » portaient sur les anciennes fonctions, fermées
      par `fermeture_ancienne_api`. Restent des notes volontaires (« RLS sans règle » : aucun accès client) et l'alerte
      « mots de passe compromis » (réglage du tableau de bord, offre payante).

## Phase 8 — Optimisation du front
- [x] Cache-busting systématique : `tools/version.mjs` (empreinte du contenu dans l'adresse de chaque fichier), vérifié par
      l'intégration continue. Client Supabase en version précise, chargé seulement en mode Compte.
- [ ] Catalogue de la seule langue active ; Mode Pro chargé à la demande.
- [ ] Regroupement et minification pour la production, sans build en développement.
- [ ] Mesure avant/après sur mobile.
- [ ] Côté serveur : deux déclencheurs de l'ancienne application (`sync_stats_to_blob`, `sync_users_to_blob`) recopient encore
      chaque changement de statistiques dans une ancienne table (`user_full_state`) que plus rien ne lit. Les retirer
      allégerait chaque écriture ; c'est une instruction `drop`, qui demande la confirmation manuelle de l'outil Supabase.

## Phase 9 — Tests et recette
- [x] Suite Playwright sur chaque pull request. Les comptes de test se suppriment eux-mêmes à la fin de la suite
      (`api_test_end`) ; les 27 accumulés pendant les travaux ont été supprimés.
- [x] Tests SQL des invariants : solde jamais négatif, paris et retraits simultanés, rejeu d'une même clé, argent ni créé ni perdu.
- [x] Fenêtres à plusieurs champs : 60 ms après l'ouverture, le curseur revenait de force au premier champ, même si le joueur
      avait déjà choisi le suivant (sur un appareil lent, le mot de passe tapé partait dans le champ « code » et se perdait).
      Trouvé par un échec de l'intégration continue sur « mot de passe oublié ». _Test_ `tests/compte/comptes.spec.mjs`
      (« fenêtre à plusieurs champs »), qui échouait avant et passe après.
- [x] Recette finale, 10 points, le 16 nov. 2026, sur le site en ligne (<https://wimoro.com>) : 130 tests d'écran (mode Démo,
      visiteur et mode Compte avec le faux serveur, trois langues) et 18 scénarios avec de vrais comptes contre le vrai
      serveur, tous verts ; en local, 264 tests dont 134 sur la base. Depuis, chaque lot a rejoué la suite : au dernier
      lot du 16 nov. 2026, 336 tests en local (dont 179 sur la base) et 25 scénarios avec de vrais comptes, en local
      puis sur le site en ligne. Point par point :

      | N° | Ce qui est vérifié | Preuve | Réserve |
      |---|---|---|---|
      | 1 | Chaque écran s'ouvre sans erreur, en anglais, français, hébreu | `tests/demo/chargement.spec.mjs`, `tests/compte/chargement.spec.mjs`, `tests/i18n.spec.mjs`, e2e « recette 1 » | aucune |
      | 2 | Pari éclair : accepté, gardé après rechargement, réglé | `tests/compte/eclair.spec.mjs`, e2e « recette 2 » | aucune |
      | 3 | Inscription → dépôt → achat → vente → reconnexion, deux navigateurs | e2e « recette 3 », « connexion par pseudo » | aucune |
      | 4 | Mot de passe oublié | `tests/compte/comptes.spec.mjs` (B09), avec le faux serveur | **non joué avec un vrai e-mail** : à vérifier une fois par le propriétaire |
      | 5 | Deux joueurs : prix, chat, amis, message privé | e2e « marchés en direct », « recette 5 » (chat, amis, sujet privé) | aucune |
      | 6 | Rien ne s'annule après 20 secondes en mode Compte | `tests/compte/garde.spec.mjs` et les tests de chaque lot (retrait, dépôt carte, mission, clan, duel, combiné, copy trading, parrainage) | **ordre limite** : pas encore pour les comptes (annoncé « Bientôt disponible », jamais simulé puis annulé) |
      | 7 | KYC fictif : validé, gardé, moyens de paiement débloqués | `tests/compte/argent.spec.mjs`, `tests/sql/argent.spec.mjs` | aucune |
      | 8 | Démo → Compte → Démo sans mélange | `tests/compte/comptes.spec.mjs` (recette 8) | aucune |
      | 9 | Les prix bougent seuls, identiques sur deux navigateurs | e2e « marchés en direct », `tests/sql/bots.spec.mjs` | aucune |
      | 10 | Plafond de dépôt et pause appliqués par le serveur | `tests/sql/argent.spec.mjs`, `tests/compte/argent.spec.mjs` | aucune |

## Phase 10 — Livraison
- [x] `README.md`, `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/EXPLOITATION.md`.
- [x] Pull request n° 1 fusionnée dans `main` le 15 nov. 2026 à la demande du propriétaire (commit de fusion `13f224e`).
- [x] Vérification en production, navigateur neuf à chaque test : mode Démo et visiteur dans les trois langues (14 tests),
      mode Compte avec de vrais comptes dans les trois langues (9 scénarios), avant puis après la fermeture de l'ancienne API.
- [x] Depuis, chaque lot passe par sa propre pull request, fusionnée dès que ses tests sont verts.

---

## Décisions prises sans te consulter (consigne du 15 nov. 2026 : « décide, note tes choix »)

| Sujet | Choix | Pourquoi |
|---|---|---|
| Fermeture de l'ancienne API | Retirer aussi **tout** droit direct sur les tables (lecture comprise), pas seulement les 43 fonctions. | L'ancien site lisait les tables directement ; le nouveau n'en lit aucune. Un seul chemin à surveiller : les fonctions `api_…`. |
| Ancienne tâche du pari éclair | Arrêtée (`flash-tick-server`, une manche par minute). | Le pari éclair du nouveau site est réglé par l'Edge Function `eclair` ; l'ancienne tâche remplissait une table que plus personne ne lit. |
| Policies inutiles et publication temps réel | Laissées en place, dans une migration à part qui attend une confirmation. | L'outil exige un accord manuel pour tout `drop`. Je ne contourne pas ce garde-fou ; ce rangement n'apporte rien à la sécurité. |
| Comptes de test | 27 supprimés au lieu des 21 annoncés. | Les 6 de plus venaient de mes deux vérifications du jour, même adresse `wimoro-e2e-…@example.com`. Aucun vrai compte touché (20 avant, 20 après). |
| Comptes de test à l'avenir | Chaque compte de test se supprime lui-même à la fin de la suite (`api_test_end`). | Plus rien ne s'accumule dans la vraie base ; la fonction refuse toute adresse qui n'est pas une adresse de test. |
| Branche de travail | On garde `fix/harmonisation-front-back` ; une pull request par lot. | C'est la branche fixée au départ ; chaque fusion reste annulable séparément. |
| Bots dans le chat | Ils ne parlent que dans les salons regardés (signalés par l'écran), environ un message toutes les 7 secondes ; leurs messages vivent dans un anneau de 30 par salon, pas dans la table des messages. | Un chat vivant là où quelqu'un lit, sans faire grossir la base ni exiger de purge. |
| Rang donné par un administrateur | On relève les compteurs dont le rang dépend (XP, paris réglés, précision…) ; jamais de baisse. | Le rang n'est pas une valeur stockée librement : l'écran et le serveur le recalculent. Un rang « forcé » aurait été contredit à l'écran. |
| Marché créé depuis le panel | Texte dans une seule langue (celle saisie), sans traduction ; catégories limitées à celles du site. | Le catalogue d'origine est traduit dans le code ; un marché ajouté à chaud n'a que le texte de l'administrateur. |
| Marché résolu | Il quitte les listes du site ; son nom reste connu pour l'historique. Un marché « fermé » reste visible, le serveur y refuse les mises. | Le mode Démo n'a jamais eu d'écran « marché terminé » : pas de nouvel écran inventé. |
| Suspension | Le serveur refuse toute action du joueur suspendu ; l'écran le déconnecte et l'explique. Un administrateur ne peut pas être suspendu. | Même mécanisme que l'auto-exclusion, déjà éprouvé. |
| Démarrage du direct | Les marchés sont relus une fois juste après l'abonnement au temps réel. | Un changement de prix pouvait être manqué entre la première lecture et l'abonnement (constaté par un test contre le vrai serveur). |
| La Série : XP et « paris réglés » | Les 10 XP sont donnés au premier choix (pas au lancement) ; une série reprise avant tout gain ne compte pas comme un pari réglé. | En mode Démo, lancer puis reprendre sa mise rapportait 10 XP et un « pari réglé » : sur un serveur, c'était une faille (rang gratuit). |
| La Série : cote | La cote retenue est celle que le serveur calcule à la réception du choix, pas celle affichée une fraction de seconde plus tôt. | Le serveur fait autorité ; l'écran affiche ensuite la cote retenue. |
| Blitz : cadence | Un Blitz toutes les 15 minutes en mode Compte (10 minutes en mode Démo) : inscriptions jusqu'à 2 minutes après le début du créneau, puis au plus 10 manches. | Un Blitz complet dure 11 minutes 40 : avec un créneau fixe de 15 minutes, tous les écrans et le serveur calculent la même salle sans se parler. |
| Blitz : prime time | 21 h, heure de Paris en hiver (20 h UTC), pour tout le monde. | En mode Démo c'était 21 h à l'heure de chaque appareil ; un serveur doit choisir une seule heure. |
| Blitz : joueurs simulés | Leurs choix sont tirés une fois par manche (1 % ne choisit pas) ; le jackpot reporté ne compte que leurs entrées. | Même allure qu'en mode Démo, mais calculable à l'identique par l'écran et le serveur. |
| Blitz : paiement | Réglé à la demande : le premier inscrit qui revient après la fin déclenche le paiement de tous les inscrits. | Pas de tâche planifiée capable d'exécuter le moteur (JavaScript) ; aucun gain ne se perd, il attend au plus le retour d'un inscrit (un mois). |
| Duels | Seuls les duels sur un marché sont reliés. Les frais d'ouverture ne sont pas rendus si le duel est refusé ou expire (règle du mode Démo). Un duel accepté ajoute son montant au volume du marché, sans déplacer le prix. | Les duels éclair demandent le moteur côté serveur (lot à part) ; le duel de stack dure une semaine et repose sur un adversaire simulé. |
| Ordre des lots restants | Combinés avant clans. | Les clans sont le plus gros module, presque entièrement simulé (annuaire de 100 clans, divisions, guerres) : je traite d'abord les fonctions à règles nettes (combinés, ordres limites, parrainage, copy trading, propositions). |
| Parrainage | Sans limite de filleuls, comme en mode Démo ; code accepté seulement à la création du compte. | Règle du jeu inchangée. Limite connue : une même personne peut créer plusieurs comptes pour se parrainer elle-même (argent fictif ; chaque compte demande une adresse e-mail distincte). |
| Garde-fou de l'outil Supabase | Jamais contourné. | Quand l'outil demande une confirmation manuelle et que personne ne répond, la migration n'est pas appliquée et le lot attend, sans être fusionné. Je ne réécris pas le SQL pour échapper au contrôle et je ne passe pas par un autre chemin. |
| Ordres limites : XP | 10 XP à la première exécution d'un achat limite, et non au dépôt de l'ordre (15 XP du premier ordre limite : inchangé). | Plus strict que la démo : sinon placer puis annuler un ordre rapporterait de l'XP sans jamais parier. |
| Propositions : texte des joueurs | Refusé s'il contient des chevrons, des guillemets droits, un accent grave ou une barre oblique inverse ; apostrophes rendues typographiques ; une seule ligne. | Ce texte est montré à tous les joueurs : il ne doit jamais pouvoir être lu comme du code par un navigateur. |
| Propositions : votes | Les votes de la communauté se déduisent du temps écoulé (un vote favorable toutes les 1,5 seconde), sans tâche de fond ; la mise en ligne se fait au premier passage d'un joueur. Les votes des joueurs sont comptés dans la table des votes. | Même rythme que la démo, sans rien faire tourner en permanence ; le vote d'un compte supprimé disparaît avec lui. |
| Propositions : bornes | 5 propositions par joueur et par 24 heures. | Borne technique : chaque proposition validée crée un vrai marché visible par tous et rapporte de l'XP. |
| Propositions : modération | Comme dans la démo, 25 votes suffisent : pas de validation préalable. | Règle du jeu inchangée. Un marché proposé par un joueur apparaît dans le panel d'administration, d'où il peut être fermé ou résolu. |
| Copy trading : pas de chaîne | Un pari copié ne déclenche pas les copies de ceux qui copient le copieur. | Sinon deux joueurs qui se copient l'un l'autre boucleraient sans fin. Seuls les paris placés par un joueur lui-même sont suivis. |
| Copy trading : bots copiés | Leurs paris sont créés par une tâche de fond, seulement pour les bots copiés, au rythme de la démo. | Les 10 000 bots animent les marchés en masse et n'ont pas de paris individuels ; il faut bien que le joueur copié « parie » pour que la copie vive, comme dans la démo. |
| Copy trading : rien n'est supprimé | Une copie arrêtée et un lot vendu restent en base à l'état terminé. | L'historique d'une copie reste lisible, et aucune ligne n'est effacée. |
| Clans : candidature | La réponse vient du serveur au bout de 6 secondes, favorable 8 fois sur 10, y compris pour un clan créé par un joueur. | Même règle que la démo. Une validation par un vrai officier demanderait un écran de plus ; elle fait partie de la seconde partie. |
| Clans : bots | 4 bots sur 5 portent le tag d'un clan de démonstration (c61 à c100), choisi d'après leur identifiant. | Comme dans la démo, où la plupart des joueurs simulés ont un clan : le chat et les classements montrent des tags. |
| Protection de `main` | Non activée. | Elle changerait ta façon de publier ; elle reste proposée, facultative. |
| Guerres de clans : adversaires | Le clan adverse est un clan de démonstration ; ses dix participants et les membres simulés de notre clan ont des points calculés par le serveur (départ semé, +50 % au plus). | La démo faisait grossir ces points sans limite tant que la page restait ouverte : impossible à tenir à l'identique pour deux joueurs. |
| Guerres de clans : règlement | Au premier passage d'un membre ou d'un participant après 48 heures ; un participant sorti du clan touche quand même sa part. | Pas de tâche planifiée de plus ; un buy-in payé ne doit jamais rester bloqué. |
| Partage d'analyse : confiance | L'instantané est traité comme un contenu écrit par un joueur : remis au propre par le serveur avant d'être gardé, puis une seconde fois par l'écran avant d'être dessiné. | Les prix du Mode Pro sont simulés par l'écran : le serveur ne peut pas les vérifier, il peut seulement garantir qu'aucun code n'y passe. |
| Partage d'analyse : bornes | 12 analyses par 24 heures et par joueur, 400 Ko au plus chacune ; les bots n'en publient pas, ils y répondent. | Borne technique (une analyse pèse lourd) ; publier des analyses de bots demanderait de fabriquer des graphiques côté serveur. |
| Mention « enregistrée sur cet appareil » | Retirée de la fenêtre de partage quand un compte est connecté. | Seule exception à « ne change pas les textes » : avec un compte, la phrase serait fausse. |
| Salon VIP | Sujet temps réel privé, ouvert par une règle d'accès au rang Ascendant ; les bots n'y parlent pas. | Un sujet public aurait laissé n'importe qui écouter le salon ; dans la démo, ce salon ne contient que les messages des joueurs. |
| Suivre une mise partagée | Refusé si l'on n'a pas accès au salon où elle a été publiée. | Sinon un joueur hors d'un clan pouvait suivre, par son numéro, une mise partagée dans le chat de ce clan. |
| Mise partagée en privé | Poussée au seul ami ; pas de suivi par des joueurs simulés ; compteur envoyé aux deux participants seulement. | Une conversation privée ne doit rien laisser passer par un sujet public. |
| Chat du Blitz | Salon public ; les bots y disent les phrases du Blitz de la démo ; les lignes d'événement de manche ne sont pas reprises. | Le déroulé d'un Blitz est calculé par l'écran (moteur partagé) : le chat ne porte que la conversation. |
| Rôles de l'équipe (19 nov. 2026) | Nouvelle table `wm.equipe_membres` ; les comptes de `public.admin_users` sont administrateurs ; la table et sa contrainte ne changent pas. | Règle : ne pas modifier une contrainte existante. L'ancien panel et `WimoroAdmin` marchent sans changement. |
| Journal en ajout seul | Déclencheurs actifs en toutes circonstances (`ENABLE ALWAYS`) et empreintes SHA-256 chaînées ; l'ancien journal y est recopié. | « Personne, pas même un admin, ne peut le modifier ou l'effacer » ; et si quelqu'un coupait un jour les déclencheurs, la chaîne le montrerait. |
| Double authentification | Exigée dès qu'un membre a un code vérifié ; l'obligation pour tous est un réglage, désactivé. | L'écran d'enrôlement n'existe pas encore : l'imposer à tous aujourd'hui bloquerait `WimoroAdmin`. |
| Blocages | Vendre une position et quitter un clan restent toujours possibles ; un blocage du site répond `suspendu`, comme une suspension. | Un joueur bloqué ne doit jamais avoir d'argent piégé ; l'écran sait déjà expliquer une suspension. |
| Déconnexion forcée | Rien n'est supprimé dans l'authentification : le serveur refuse toute session ouverte avant la décision. | Règle : ne pas toucher à l'inscription ni à la connexion ; le joueur se reconnecte normalement. |
| Chat | Un message est masqué, jamais effacé ; l'équipe ne lit jamais les messages privés ; le mode lent et les mots interdits ne visent pas l'équipe. | Pouvoir revenir sur une erreur (restaurer) ; respect des conversations privées. |
| Dissolution d'un clan | Les membres sortent (le délai de 7 jours avant un autre clan s'applique), les candidatures sont annulées, le salon est fermé, le clan reste en base ; refusée pendant une guerre. | Aucune donnée supprimée ; la mise d'une guerre en cours ne doit pas se perdre. |
| Modérateur | Ajustement de solde plafonné à 1 000 $ (réglage), jamais sur un membre de l'équipe ; il ne lit au journal que ses décisions, ou celles qui visent un joueur. | « Joueurs et chat seulement » : le reste est l'affaire d'un administrateur. |
| Frais et limites | Un changement vaut dès le pari suivant ; les positions ouvertes ne sont pas recalculées. Trois plafonds nouveaux (mise, dépôts par jour, retrait), vides par défaut. | Les valeurs par défaut sont les constantes d'avant : rien ne change tant qu'on ne touche à rien. |
| Prix du Blitz, Bet Exact, frais éclair et Série | Réglages créés mais marqués « pas encore appliqués » (le serveur refuse de les changer). | L'Edge Function `eclair` envoie ses propres montants : les changer d'un seul côté bloquerait le jeu. À brancher avec elle. |
| Marchés | Résoudre ou annuler un marché ne passe pas encore par la nouvelle porte. | C'est le lot du cycle de vie des marchés ; l'ancien panel le fait toujours, journalisé. |
| Ajouter un membre avant l'écran | Par une migration de deux lignes, écrite au journal avec l'origine « migration » (`docs/EXPLOITATION.md`, § 8). | Le journal dit toujours d'où vient une décision ; pas de mot de passe d'administrateur à me confier. |
| Diffusion en direct | Les réglages partent à la fin de la transaction, une fois chacun ; un blocage arrivé à sa fin n'envoie rien. | La maintenance écrit deux réglages : un seul message, juste. L'écran connaît la fin d'un blocage. |

## À faire par l'humain

Rien d'obligatoire. Le détail et les constats sont dans `docs/EXPLOITATION.md`, § 5.

1. **Une fois** : demander « mot de passe oublié » avec ta propre adresse, pour vérifier que l'e-mail arrive (un service
   d'envoi est déjà branché ; je ne peux pas voir si son domaine est validé).
2. **Pour mettre en ligne les ordres limites** : demander « applique la migration des ordres limites » pendant une session et
   accepter la confirmation que l'outil Supabase affiche (dans les 2 minutes). Tout le reste est prêt : la branche
   `lot/ordres-limites` (pull request n° 11, en brouillon) a été remise à niveau avec `main` le 16 nov. 2026, 345 tests
   verts en local. Il restera à jouer les scénarios réels puis à fusionner, ce que la session fera d'elle-même.
2 bis. Facultatif : même chose pour la migration de rangement `securite_urgence_nettoyage`.
3. Facultatif : ajouter `Ton code : {{ .Token }}` au modèle d'e-mail « Reset Password ».
4. Facultatif : protéger la branche `main` sur GitHub.
5. Pour administrer : ouvrir <https://wimoro.com/admin.html> et se connecter avec le compte `WimoroAdmin` (le seul
   administrateur aujourd'hui). Mode d'emploi : `docs/EXPLOITATION.md`, § 7.

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
| 15 nov. 2026 | 4.5 : chat des salons publics par le serveur (historique, envoi, direct, anti-spam). Bots : ancres rappelées vers la valeur de référence (plus de polarisation dans le temps). | migrations `chat`, `bots_ancres` ; 133 tests (60 SQL) ; 5 tests de bout en bout dont le chat entre deux comptes |
| 15 nov. 2026 | 4.4 : pari éclair par le serveur. Moteur extrait dans un module pur, Edge Function `eclair`, mise et règlement. Test du mode Démo rendu stable dans l'intégration continue. | migration `eclair` (empreinte identique) ; 151 tests (65 SQL) ; 6 tests de bout en bout contre le vrai back |
| 15 nov. 2026 | 4.6 (début) : amis par le serveur. Bots : rappel des ancres renforcé et réglable. | migrations `amis`, `bots_rappel` (empreintes identiques) ; 159 tests (69 SQL) ; 7 tests de bout en bout contre le vrai back |
| 15 nov. 2026 | 4.5 (suite) : messages privés entre amis et sujet temps réel privé par joueur ; notifications en direct. | migration `messages_prives` (empreinte identique) ; 166 tests (73 SQL) ; 8 tests de bout en bout contre le vrai back |
| 15 nov. 2026 | 4.6 (suite) : classement servi par le serveur. | migration `classement` (empreinte identique) ; 168 tests (74 SQL) |
| 15 nov. 2026 | Mise en ligne : pull request n° 1 fusionnée, wimoro.com vérifié (Démo, Compte, trois langues). Ancienne API fermée après contrôle des journaux. Purge horaire du journal de pg_cron. 27 comptes de test supprimés ; la suite nettoie désormais derrière elle. | fusion `13f224e` ; migrations `purge_journal_cron`, `fermeture_ancienne_api`, `comptes_test` (empreintes identiques) ; 174 tests (77 SQL) ; 9 scénarios contre le site en ligne, avant et après la fermeture |
| 16 nov. 2026 | 4.5 (fin) : messages des bots dans le chat, en gabarit + paramètres. | migration `chat_bots` (empreinte identique) ; 180 tests (81 SQL) ; 9 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Phase 6 : panel d'administration (joueurs, marchés avec résolution, chat, bots, chiffres, journal). Bots du chat : un rythme par salon regardé. Démarrage du direct : relecture de rattrapage. | migrations `admin`, `chat_bots_rythme` (empreintes identiques) ; 196 tests (88 SQL) ; 10 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | 4.4 (suite) : La Série en mode Compte. | migration `serie` (empreinte identique), Edge Function `eclair` version 2 ; 206 tests (95 SQL) ; 11 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | 4.4 (fin) : Blitz Royale en mode Compte. | migration `blitz` (empreinte identique), Edge Function `eclair` version 3 ; 214 tests (100 SQL) ; 12 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | 4.6 (suite) : duels entre amis sur un marché. Stabilité : page d'administration et tests du Blitz. | migration `duels` (empreinte identique) ; 222 tests (105 SQL) ; 13 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Paris combinés en mode Compte. | migration `combines` (empreinte identique) ; 227 tests (108 SQL) ; 14 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Parrainage en mode Compte. Correctif : solde à jour dès la réponse du chargement après un duel expiré. | migration `parrainage` (empreinte identique) ; 235 tests (113 SQL) ; 15 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | État du joueur assemblé par blocs enregistrés ; parrainage sans attente ; ordres limites prêts mais en attente de confirmation (branche `lot/ordres-limites`). | migrations `parrainage_sans_attente` et `etat_blocs` (empreintes identiques) ; 238 tests (116 SQL) ; 15 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Propositions de marché en mode Compte. | migrations `propositions` et `propositions_votes` (empreintes identiques) ; 244 tests (120 SQL) ; 16 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Copy trading en mode Compte. Test de La Série : comparaison de prix rendue proportionnelle (elle échouait par hasard sur un prix élevé). | migration `copies` (empreinte identique) ; 253 tests (127 SQL) ; 17 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Clans en mode Compte, première partie (appartenance, création, contribution, tag public). | migration `clans` (empreinte identique) ; 264 tests (134 SQL) ; 18 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Recette finale sur le site en ligne. Lot « ordres limites » remis à niveau dans sa branche (273 tests, dont 141 SQL), toujours en attente de la confirmation Supabase. | 130 tests d'écran et 18 scénarios réels sur <https://wimoro.com> ; base : 20 comptes, 10 000 bots, aucun compte de test, 56 migrations, aucune erreur de tâche planifiée |
| 16 nov. 2026 | Suivre un joueur ; partages en image de la Série et du clan. | migration `suivre` (empreinte identique) ; 267 tests (135 SQL) ; 19 scénarios de bout en bout contre le vrai back |
| 16 nov. 2026 | Partager une mise dans le chat et la suivre. | migration `chat_mises` (empreinte identique) ; 272 tests (138 SQL) ; 20 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Correctif : le curseur d'une fenêtre n'est plus repris au champ que le joueur a choisi (échec intermittent de l'intégration continue sur « mot de passe oublié »). | test ajouté (échoue avant, passe après) ; 273 tests (138 SQL) |
| 16 nov. 2026 | Réactions sous les messages (joueurs, bots, messages privés). | migration `reactions` (empreinte identique) ; 281 tests (144 SQL) ; 21 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Chat de clan, réservé aux membres (sujet privé). | migration `clan_chat` (empreinte identique) ; 287 tests (149 SQL) ; 21 scénarios de bout en bout contre le vrai back, dont trois comptes sur le chat du clan ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Duels sur une manche éclair. | migration `duels_eclair` (empreinte identique), Edge Function `eclair` version 4 ; 296 tests (154 SQL) ; 22 scénarios de bout en bout contre le vrai back, dont un duel éclair réglé par le vrai serveur ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Duels de stack contre un joueur simulé. | migration `stacks` (empreinte identique) ; 302 tests (158 SQL) ; 23 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Clans : fil d'activité, outils du chef et des officiers, appels de clan. | migration `clans_chefs` (empreinte identique) ; 310 tests (163 SQL) ; 23 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Guerres de clans. | migrations `clans_guerres` et `clans_guerres_participants` (empreintes identiques) ; 316 tests (167 SQL) ; 23 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Mode Pro : partager son analyse dans les chats. | migration `analyses` (empreinte identique) ; 325 tests (172 SQL) ; 24 scénarios de bout en bout contre le vrai back, dont deux comptes sur le partage d'analyse ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Salon VIP (rang Ascendant) ; suivi d'une mise réservé aux lecteurs de son salon. | migration `salon_vip` (empreinte identique) ; 330 tests (175 SQL) ; 24 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Chat du Blitz ; cases du plan remises à jour. | migration `chat_blitz` (empreinte identique) ; 333 tests (177 SQL) ; 24 scénarios de bout en bout contre le vrai back, dont le chat du Blitz ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Mise partagée dans une conversation privée. | migration `mise_privee` (empreinte identique) ; 336 tests (179 SQL) ; 25 scénarios de bout en bout contre le vrai back ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test |
| 16 nov. 2026 | Vérification finale sur le site en ligne ; branche des ordres limites remise à niveau. | sur <https://wimoro.com> : 157 tests d'écran (mode Démo, visiteur, mode Compte avec le faux serveur, trois langues, ordinateur et téléphone) et 25 scénarios avec de vrais comptes, tous verts ; base après la suite : 20 comptes, 10 000 bots, aucun compte de test, aucune tâche planifiée en échec ; branche `lot/ordres-limites` : 345 tests verts en local, migration toujours en attente |
| 19 nov. 2026 | Nouveau panneau, lot 0 : sauvegarde (385 fonctions, 12 tables, données et définitions) avant toute modification. | migration `sauvegarde_20261119` (empreinte identique) ; commit `f1026d7` ; 398 tests |
| 19 nov. 2026 | Lot 1 : réglages (82, valeurs par défaut = constantes d'avant), équipe à deux rôles, journal en ajout seul, porte `api_equipe`, `api_site`. | migrations `equipe_reglages_journal`, `journal_ajout_seul` (empreintes identiques) ; commit `8d39196` ; 407 tests |
| 19 nov. 2026 | Lot 2 : blocages par accès, déconnexion forcée, maintenance, règles du chat ; actions sur les joueurs, le chat, les clans, le site. 30 fonctions existantes reçoivent une ligne de contrôle. | 5 migrations `blocages_…` (empreintes identiques) ; commit `cb2416e` ; 422 tests, dont la preuve « rien d'autre n'a changé » (`gardes.spec.mjs`) |
| 19 nov. 2026 | Lot 3 : frais et limites lus dans les réglages (72 appliqués), un changement vaut dès le pari suivant. | 4 migrations `reglages_frais_…` (empreintes identiques ; 24 définitions de production égales à celles testées) ; commit `5a6b9c3` ; 428 tests |
| 19 nov. 2026 | Lot 5 : diffusion en direct (`site`, salons, `joueur:<id>`). Documentation (`BACKEND.md` § 9, `EXPLOITATION.md` § 8) ; retour arrière complet testé. | migration `diffusion_temps_reel` (empreinte identique) ; commit `9a0f877` ; 437 tests en local (220 sur la base) |
