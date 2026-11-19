# Refonte du design de Wimoro — fichier de suivi

Ce fichier est le fil conducteur de la refonte. **Pour reprendre le travail dans une nouvelle session : lire ce fichier,
puis `git log --oneline refonte-design`.** Le suivi de la réparation du back reste dans [PLAN.md](PLAN.md).

- Branche : `refonte-design` (partie de `8b4489f`, identique à `main` au départ). Rien n'est poussé sur `main`.
- Brief : refonte complète du frontend, sobre, dans l'esprit d'Apple. Aucune fonction ajoutée ni retirée. Back-end hors
  périmètre. Trois langues (français, anglais, hébreu de droite à gauche). Site statique, sans étape de build.
- Lancer le site : `node tools/serve.mjs` → <http://127.0.0.1:4173>. Tests : `CHROME=1 npx playwright test`.
- Avant chaque commit touchant un fichier du site : `node tools/version.mjs`.

## Avancement

| Étape | État |
|---|---|
| 0. Plugins vérifiés | fait |
| 1. État des lieux (inventaire, captures « avant ») | fait |
| 2. Plan (agents ECC `planner` et `architect`) | fait |
| 3. Audit et direction (unslop) | fait |
| 4. Système de design (variables, composants, documentation) | fait — voir [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) |
| 5. Navigation et structure | fait |
| 6. Écrans, dans l'ordre du brief | fait |
| 7. Nettoyage | fait (`css/main.css` et code mort retirés) |
| 8. Vérification et livraison | fait : pull request ouverte, non fusionnée ; rien n'est en ligne |

## TROISIÈME PASSE (demandée le 19 nov. 2026, après-midi) — à lire en premier

Mission : finir la refonte (ordinateur dessiné pour le grand écran, téléphone encore amélioré), brancher de vrais
marchés en direct (cours, scores, actualité) et un panel d'administration complet. Brief complet du propriétaire :
parties A (ordinateur), B (téléphone), C (points en attente), D (données réelles, 60 marchés), E (panel). Règles
principales : unslop, ECC (plan, revues, tests, vérification) et frontend-design réellement utilisés ; rien sur `main` ;
un commit par étape ; aucune fonction ne disparaît ; Supabase modifiable depuis cette machine **après sauvegarde du schéma
et des données des tables touchées**, en ajoutant plutôt qu'en modifiant (une fonction existante ne reçoit qu'une
vérification de plus, sans changer le comportement d'un joueur non concerné) ; ne rien supprimer ; inscription et
connexion inchangées ; clés d'API seulement dans les secrets Supabase ; aucun « argent fictif », « play money » ni
« démo » à l'écran (sauf pour le compte démo), aucun concurrent nommé ; trois langues (anglais par défaut, français,
hébreu) pour tout texte vu par un joueur. Seul arrêt permis : une action sur le serveur que ces règles n'autorisent pas.

Ordre : (1) lecture et accès → (2) D1, recherche des sources, puis un message au propriétaire (comptes gratuits à créer,
adresse du compte à passer administrateur) → (3) C, A, B sur `refonte-design` → (4) D puis E sur la branche
`marches-et-admin` (créée depuis `refonte-design`) → bilan.

### Avancement de la troisième passe
| Étape | État |
|---|---|
| 1. Lecture des documents, accès Supabase (projet `brmwvxncyeypefsgiepf`, sain, droits complets), plugins (unslop, ECC, frontend-design présents) | fait |
| 2. D1 : recherche des sources (6 recherches parallèles, ~1 000 appels ; test depuis les serveurs Supabase dans 3 régions) | fait : [docs/DONNEES.md](DONNEES.md) § 1, notes détaillées dans `docs/donnees/` |
| 3. Message au propriétaire (comptes gratuits à créer, adresse du compte à passer administrateur) | fait (19 nov., 15 h 40) ; correctif envoyé : API-Sports indispensable (ESPN refuse les robots), AcesAPI conseillé (tennis) |
| 4. Partie C | fait (commit `b52824f`) |
| 5. Partie A (ordinateur) | en cours : grille commune (3 paliers, `tokens.css`, `base.css`, DESIGN-SYSTEM § 3) et accueil faits (commit `8b5327c`) ; fiche marché et ticket faits ici. En parallèle, trois agents travaillent chacun dans un worktree, sur une branche à fusionner dans `refonte-design` : `refonte-a-jeux` (Éclair, Blitz, Série, Duels), `refonte-a-argent` (portefeuille, dépôt, retrait, profil, rang, connexion, inscription), `refonte-a-communaute` (entrée, chat, clans, classement, amis, copies, joueur). Chacun écrit son CSS et ses traductions entre ses repères (`[jeux]`, `[argent]`, `[communaute]`) dans `screens.css` et `i18n-5.js`. Fusionnés : `refonte-a-jeux` (`42843ff`), `refonte-a-argent` (`02dc554`), 396 tests verts après chaque fusion |
| 6. Partie B (téléphone) | à faire |
| 7. Partie D (branche `marches-et-admin`) | à faire (branche créée depuis `f9cc269`) |
| 8. Partie E (panel) | en cours côté serveur : un agent (worktree, branche `marches-et-admin`) fait les lots 0 à 3b et 5 du plan (`architecture-d-e.md`) : sauvegarde `backup_20261119`, réglages `wm.reglages`, équipe et rôles, journal en ajout seul, porte `api_equipe`, blocages, frais lus dans les réglages, sujet temps réel `site` |
| 9. Vérification, revues, bilan | à faire |

**Pour reprendre (notes de travail hors dépôt, dossier temporaire de la session `…\scratchpad\`)** : `d1/*.md` (recherche
des sources, recopiée dans `docs/donnees/`) ; `d3/crypto-bourse-economie.md`, `d3/politique-tech-culture.md`,
`d3/sport.md` (64 marchés réels vérifiés le 19/11 : questions en 3 langues, critères, sources, probabilités de départ,
images) ; `architecture-d-e.md` (plan technique des parties D et E, agent ECC `architect`) ; `inventaire-admin-brut.txt`
(inventaire du panel actuel : 17 actions ; ~175 valeurs écrites en dur, dont ~92 réglables) ; `outils/capture2.mjs`
(captures à plusieurs tailles), `outils/passe2.mjs` (mesure responsive) ; captures « avant » dans `captures/avant/`
(serveur du commit `cb382a6` : worktree `../wimoro-avant`, port 4176). Faits marquants : ESPN refuse les robots (écarté),
API-Sports indispensable ; BTC à ~63 700 $ le 19/11 ; GTA VI sorti le 19/11 ; succession en cours chez Nvidia.

## SECONDE PASSE (demandée le 19 nov. 2026)

Le propriétaire a mis la première version en prévisualisation et demande une seconde passe sur la même branche
(`refonte-design`, pull request n° 29). Mêmes règles : unslop et ECC réellement utilisés, back-end intouché, aucune
fonction ajoutée ni retirée, rien sur `main`, tout d'une traite, réponses en français simple.

### A. Défauts signalés par le propriétaire
| N° | Défaut | État |
|---|---|---|
| 1 | En-tête : le HTML de départ contient un solde fictif (« 248,50 $ »), un avatar (« D ») et les boutons de connexion en même temps. Attendu : état neutre (squelette) avant le chargement, puis connecté OU déconnecté, sans clignotement | fait |
| 2 | Libellés doublés « Se connecter » / « Connexion », « Créer un compte » / « S'inscrire ». Un seul libellé par action, partout, à toutes les tailles | fait |
| 3 | Montants : un seul format par langue, par une fonction unique (soldes, mises, gains, cotes, pourcentages) | fait |
| 4 | Langue : la langue par défaut du code est l'anglais (`js/i18n.js`) ; le HTML de départ (lang, titre, description, textes visibles avant JavaScript) doit la respecter ; aucun texte dans une seule langue | fait |
| 5 | Métadonnées et message sans JavaScript : ils parlent de « démo ». Dire où, proposer une formulation produit, lister les changements | fait |
| 6 | Onglet Communauté : il ouvre le chat. En faire une page d'entrée : chat, clans, amis, classement, copy trading en un geste | fait |

### B. Travail demandé ensuite
1. **Revue critique écran par écran** (ordre : Profil, Accueil, fiche marché et ticket, Éclair, Portefeuille, puis le
   reste de l'inventaire) : captures 390 × 844 et 1440 × 900, clair et sombre, connecté et déconnecté ; audit unslop sur
   la capture ; juger (action principale visible en premier ? nombre de chiffres et de blocs sans dérouler ? texte
   coupé, débordement, alignement, contraste ? uniquement les variables et composants du système ?) ; corriger ;
   recapturer ; comparer. Cohérence d'ensemble ; sombre aussi soigné que le clair ; états vides, de chargement, d'erreur.
2. **Responsive (priorité de la passe)** : largeurs 320, 360, 390, 430, 768, 1024, 1280, 1440, 1920 et paysage 844 × 390.
   Aucun défilement horizontal ; aucun texte coupé ou trop petit (16 px au moins pour le texte courant et les champs
   sur mobile) ; cibles de 44 px ; la barre d'onglets ne masque rien et respecte les zones sûres ; fenêtres, panneaux
   et ticket tiennent dans l'écran, clavier ouvert compris ; tableaux, listes et graphiques s'adaptent ; libellés longs
   dans les trois langues ; pas d'étirement sur grand écran ; balayer de 320 à 1920 px pour trouver les largeurs qui
   cassent. Préférer les mises en page fluides (grilles, flex, clamp, requêtes de conteneur).
3. **Revue de design avec un regard neuf** : hiérarchie, respiration, typographie, couleur, finition, cohérence,
   sobriété. Classer en gênant / perfectible / détail ; corriger les deux premiers niveaux ; lister les détails.
4. **Vérification et livraison** : rejouer les parcours critiques sans erreur de console ; reprendre le tableau de
   non-régression ; faire relire le diff par `code-reviewer` et `security-reviewer` ; pousser sur la même branche ; bilan
   court : (1) défauts par écran avec capture et correction, (2) grille de captures par écran à 320, 390, 768 et
   1440 px, (3) détails restants, (4) non vérifié, (5) skills, agents et commandes réellement utilisés.

### C. Journal de la seconde passe

**Outils (hors dépôt, dossier temporaire de la session)** : `passe2.mjs` — `mesure` (29 écrans × 10 largeurs : défilement
horizontal, commande hors écran ou rognée, texte coupé, texte sous 12 px, champ ou phrase sous 16 px sur téléphone,
cible tactile sous 44 px, cibles superposées, zone d'appui échappée, bloc masqué par une barre fixe, fenêtre hors écran),
`balaye` (toutes les largeurs de 320 à 1920 px), `capture`, `planche` (320, 390, 768, 1440 côte à côte) ; `sonde.mjs`
(évalue une expression dans un écran à une largeur donnée).

**Fait (commit `392718d`)**
1. *En-tête de départ* : plus aucune valeur fictive dans `index.html`. Avant le démarrage, `<body>` n'a ni la classe
   `in` ni la classe `out` : un bloc neutre (`.sk`) tient la place ; `render()` pose ensuite `in` ou `out`, jamais les deux.
2. *Libellés* : « Se connecter » et « S'inscrire », partout et à toutes les tailles (titres de page, boutons, liens).
3. *Montants* : tout passe par `money()` (`js/core.js`) ; le solde garde ses centimes à toutes les tailles (l'en-tête mobile
   les retirait). Règle : mon argent (solde, mise, gain) avec centimes ; seuils, mises rapides et montants des autres
   joueurs en dollars entiers ; volumes en abrégé. Les catalogues anglais et hébreu ont été contrôlés (aucun montant au
   format français).
4. *Langue* : la langue par défaut du code est l'anglais ; `index.html` est écrit en anglais, chaque texte porte sa clé
   française (`data-i18n`, `data-i18n-<attribut>`), traduite dès que les catalogues sont chargés (`i18nStatic`). Dans une autre
   langue, les libellés restent invisibles (place gardée) jusqu'à leur traduction : pas de clignotement.
5. *Métadonnées* : la description et le message sans JavaScript ne parlent plus de « démo » (texte avant / après dans le
   bilan). Le message sans JavaScript est écrit dans les trois langues.
6. *Communauté* : nouvelle page d'entrée `#communaute` (`vCommunaute`, `js/refonte.js`) : Live chat, Clans, Amis,
   Classement, Copy trading, chacun avec une ligne d'explication.

**Défauts de la première passe trouvés et corrigés**
- Ticket de pari : les boutons Oui / Non étaient à 35 % d'opacité pour tout le monde (style prévu pour un bouton désactivé,
  devenu permanent lors du remplacement des styles en ligne). Seul cas de ce genre, vérifié sur le code d'origine.
- Accueil sur téléphone : la ligne de filtres débordait des deux côtés (« Créer un pari » coupé).
- En-tête : débordait à 320 px (connecté) et jusqu'à 390 px (visiteur, bouton d'inscription coupé).
- Mode Pro : une zone d'appui invisible recouvrait le bouton « Mode Pro » sur téléphone.

**Décisions de structure**
- La barre d'onglets du bas sert jusqu'à 879 px (téléphones, tablettes en portrait) ; le menu du haut à partir de 880 px,
  là où cinq liens et les boutons tiennent sans rien couper. Palier unique 879 / 880 (au lieu de 760 / 761).
- `--bas` (`css/tokens.css`) : place prise en bas de l'écran (zone sûre seule, ou barre d'onglets + zone sûre). Tout ce
  qui se pose en bas en part ; les anciens décalages en dur (62, 76, 142 px…) et la variable `--tabh` ont disparu.
- Le nom « wimoro » s'efface de lui-même quand la place manque (sans palier) ; la barre d'onglets partage sa largeur en
  cinq parts égales, sauf si un libellé est plus long que sa part.
- Sur téléphone, visiteur : recherche, langue, thème et « S'inscrire » dans l'en-tête ; « Se connecter » est le cinquième
  onglet du bas. Sur ordinateur : les deux boutons dans l'en-tête.
- Écrans tactiles : une seule règle (fin de `css/components.css`) donne 44 px à chaque commande.
- Sur téléphone, le texte courant, les messages du chat et les champs sont en 16 px.
- Accueil sur téléphone : « Créer un pari » passe sous la liste des marchés.

**Suite** : voir la section D (bilan de la seconde passe).

### D. Bilan de la seconde passe

**Comment la revue a été faite.** Six relecteurs, un par groupe d'écrans (Profil et compte ; Accueil et Marché ; Éclair et
jeux ; Portefeuille et comptes ; Communauté ; anglais et hébreu), ont chacun chargé le skill `unslop:unslop` et appliqué sa
grille (`references/signs.md`, et `references/rtl.md` pour l'hébreu) à des captures 390 et 1440 px, en clair et en sombre,
connecté, visiteur et compte neuf, fenêtres ouvertes. L'agent `ecc:a11y-architect` a relu le système (contrastes, focus,
états, cibles tactiles, ARIA). Les corrections retenues ont été appliquées par lots (lot 1 : profil ; lot 2 : Communauté,
Accueil et Marché, Portefeuille et comptes ; lot 3 : jeux ; lot 4 : langues), chacun suivi des tests, de la mesure
automatique et de captures. Listes complètes des points, avec ce qui a été fait ou écarté et pourquoi : notes de travail
`lot-communaute-marche.md`, `lot-jeux.md`, `lot-langues.md` (dossier temporaire de la session), résumées ici.

**Ce qui a été trouvé, par groupe d'écrans** ([G] gênant, [P] perfectible ; les [D] corrigés quand c'était sans risque)

| Groupe | [G] | [P] | Principaux défauts gênants corrigés |
|---|---:|---:|---|
| Les six défauts signalés | 6 | — | voir A et C : en-tête de départ, libellés, montants, langue, « démo », Communauté |
| Défauts de la première passe | 4 | — | boutons Oui / Non du ticket à 35 % d'opacité ; filtres de l'accueil et en-tête qui débordaient ; zone d'appui fantôme sur « Mode Pro » |
| Profil, rang, bienvenue, parrainage, jeu responsable | 2 | 13 | chiffres du profil coupés à 1440 ; carte de bienvenue étirée de bord à bord |
| Communauté | 3 | 14 | colonne « Joueur » du classement réduite à 0 px à 1440 ; bas du chat sous la barre d'onglets ; « 38 901e sur 38 900 joueurs » |
| Accueil et Marché | 3 | 19 | « Non » choisi illisible (2,8:1) ; question d'un marché en 6 lignes à 1440 ; courbe verte à côté d'une baisse |
| Portefeuille, dépôt, retrait, connexion | 3 | 18 | QR code invisible en sombre ; titre du panneau de connexion invisible en sombre ; côté Oui / Non d'une position absent sur téléphone |
| Éclair, Blitz, Série, Duels, Combinés | 4 | 19 | survol de Break even illisible ; boutons du Blitz en manche sous la barre d'onglets ; « $ » seul en fin de ligne |
| Anglais et hébreu | 3 | 19 | champ mot de passe cassé en hébreu ; « a » français dans une phrase traduite ; flèche du résultat Éclair à l'envers |
| Accessibilité | — | 12 | fenêtres sans nom, focus invisible dans les listes, onglet actif distingué par la seule couleur, contrastes de 4 éléments |

**Captures** (`docs/refonte/captures/passe2/`, à retirer avant la mise en ligne avec le reste du dossier) :
- `defauts/` : 18 défauts, chacun en `-avant` (version livrée à la première passe) et `-apres` ;
- `grille/` : une planche par écran aux largeurs 320, 390, 768 et 1440 px (tous les écrans en clair ; visiteur, sombre et
  hébreu pour les écrans principaux).

**Vérification finale** (format du skill `ecc:verification-loop`)

| Contrôle | Résultat |
|---|---|
| Construction | `node --check` passe sur les 30 fichiers JavaScript ; `node tools/version.mjs --verifier` passe |
| Tests | **396 passent**, 1 ignoré (test « téléphone » dans le projet ordinateur) ; dont 30 nouveaux (`tests/refonte/parcours.spec.mjs`, `tests/refonte/responsive.spec.mjs`) ; 5 tests adaptés à des changements voulus (Quitter le clan dans l'onglet Infos ×2, en-tête lu hors de l'accueil, gain du parrainage au centime, langue dans « Mon compte ») |
| Parcours critiques | connexion, pari classique, pari Éclair, dépôt, retrait, chat, langue, thème : rejoués par les tests, sans erreur de console |
| Mesure automatique | 29 écrans × 10 largeurs (320 → 1920 et paysage) en démo, visiteur, compte neuf, anglais et hébreu ; balayage de 320 à 1920 px tous les 10 à 24 px : aucun défilement horizontal, aucun texte coupé, aucune cible tactile sous 44 px ; restent deux étiquettes de clan rognées à 320 px |
| Revue de code (`ecc:code-reviewer`) | 1 élevé : la place par défaut d'un nouveau compte avait été modifiée (logique de rang) → remise à 38 901, l'incohérence est corrigée à l'affichage ; 1 moyen (signe d'un montant nul, voulu) ; 5 faibles : seuils de couleur alignés, commentaire corrigé, identifiant de fenêtre unique ; 2 laissés (courbe dans un bloc replié, durée héritée de 0,6 s) |
| Revue de sécurité (`ecc:security-reviewer`) | aucun constat critique, élevé ni moyen ; 1 faible (attribut `data-t` partagé avec les boutons de rang) → l'attribut de traduction de la page de départ s'appelle désormais `data-i18n` |
| Contrôle Semgrep | caractères d'isolement invisibles dans deux traductions hébraïques → écrits sous forme visible (`⁦`, `⁩`) ; alerte générique sur l'insertion HTML du rendu : les données des joueurs y sont échappées (`esc()`), vérifié par la revue de sécurité |
| Cible | NON APPLICABLE : aucun déploiement, wimoro.com intact |

**Plugins réellement utilisés dans la seconde passe**
- unslop : skill `unslop:unslop` chargé par moi au début de la revue, puis par chacun des six relecteurs (grille `signs.md`) ; `rtl.md` pour l'hébreu. Mode « polish » (direction de la première passe gardée). Ni image générée, ni vidéo.
- ECC, agents : `a11y-architect` (accessibilité du système), `e2e-runner` (30 tests), `code-reviewer` et `security-reviewer` (diff final).
- ECC, skill : `verification-loop` (vérification finale ci-dessus).
- Les six relecteurs et l'agent qui a appliqué les lots 2 à 4 sont des agents généralistes (sans équivalent ECC pour une relecture visuelle) ; ils ont travaillé avec le skill unslop et les règles de `docs/DESIGN-SYSTEM.md`.
- Garde-fou ECC « Fact-Forcing Gate » : il a refusé une quinzaine de premières écritures de fichiers et redemandé les faits ; ils ont été donnés à chaque fois, le garde-fou n'a pas été désactivé.

**Détails restants, non traités** (choix assumés ou hors périmètre)
- Étiquettes de clan rognées à 320 px dans les Duels et le Classement (le pseudo passe d'abord).
- Points d'exclamation dans quelques notifications et légendes de chat terminées par un point (textes à retraduire).
- « +12 pts » en hébreu : le nombre et l'unité restent dans un seul isolant ; registre de l'hébreu à harmoniser (masculin
  singulier dans les anciens textes, pluriel impersonnel dans les nouveaux).
- Emblèmes de rang en dégradé avec reflet ; images à partager (duel, série, clan, analyse) avec leur palette d'origine.
- Espacements de 10 px hors de la grille de 4 px et icônes de tailles diverses dans les écrans anciens.
- Montant par défaut de 25 $ dans la feuille et 50 $ sur la fiche ; « comme sur Polymarket » dans une aide ; vocabulaire
  anglais pour un public francophone (« Break even », « Stop loss », « Copy trading »).
- Accessibilité : le focus ne va pas au titre quand on change d'écran ; le menu du compte et la cloche n'annoncent pas
  leur état ouvert / fermé ; le curseur « Cote de départ » n'a plus de partie remplie dans Chrome.
- Un vrai compte reçoit sa place au classement (38 901) du serveur : à corriger côté serveur, hors périmètre.

**Ce qui n'a pas pu être vérifié**
- Un vrai téléphone, Safari et Firefox : tout a été vu dans Chrome, en émulation (tailles, toucher, paysage).
- Le clavier ouvert : simulé en réduisant la hauteur de la fenêtre (390 × 480), pas avec un vrai clavier virtuel.
- Un lecteur d'écran (VoiceOver, TalkBack).
- Le vrai back-end : la suite `E2E=1` n'a pas été lancée (elle crée des comptes en production) ; tout le mode Compte a été
  vérifié sur le faux serveur des tests.

## Reprise (mis à jour à chaque étape)

**Où j'en suis** : première et seconde passes livrées dans la pull request n° 29 (branche `refonte-design`), non
fusionnée. Rien n'est en ligne. Les étapes 0 à 8 de la première passe et toute la seconde passe (section « Seconde
passe » en tête de ce fichier) sont faites ; la liste « Reste à faire » ci-dessous est gardée comme trace de l'ordre
suivi. Avant la mise en ligne : supprimer `docs/refonte/captures/` (première passe, 9,6 Mo ; seconde passe, 5,4 Mo).

**Ce qui est fait dans le code**
- `css/main.css` n'est plus chargé (supprimé à l'étape 7). Le site charge `tokens.css`, `base.css`, `components.css`,
  `screens.css`. Plus de polices Google. Thème clair par défaut (le choix enregistré `wimoro-theme` est seul pris en compte).
- `index.html` : en-tête et barre d'onglets à 5 destinations ; la puce de rang et les boutons « Déposer » de l'en-tête
  sont retirés (rang dans Profil, dépôt dans Portefeuille).
- `js/refonte.js` (nouveau, chargé avant `serveur.js`) : sous-navigations `comNavH` et `jeuxNavH`, écran `#portefeuille`
  (`vWallet`), profil allégé (`vProfil`), présentation visiteur (`introH`), `ACT.ptab` aiguillé (positions et historique
  → portefeuille).
- `js/i18n-4.js` (nouveau) : traductions anglaise et hébraïque de tout texte ajouté par la refonte.
- `js/account.js` : menu du compte réduit ; l'ancienne version reste sous `umenuAncienItemsH` (marquée `ANCIEN-MENU`,
  à supprimer au nettoyage). `js/blitz.js` : `bzModesH` renvoie à `jeuxNavH`.
- Classes de bouton renommées dans tous les gabarits : `b-pri`, `b-yes`, `b-no`, `b-yes-soft`, `b-no-soft`.

**Reste à faire, dans l'ordre**
1. Accueil et liste des marchés (alléger : une colonne latérale courte, boutons Oui / Non côte à côte).
2. Fiche d'un marché et ticket (détails repliés, 3 gestes pour parier).
3. Éclair, Blitz, Série, duels, combinés.
4. Inscription, connexion, onboarding, KYC.
5. Portefeuille, dépôt, retrait.
6. Profil, rang, réglages, notifications.
7. Communauté : chat, clans, amis, classement, copies.
8. Mode Pro. 9. Pages secondaires. 10. Administration (`css/admin.css`).
11. Icônes : un seul jeu au trait sous licence libre (Lucide) dans `ICP` (`js/core.js`) et `index.html`.
12. Styles en ligne des gabarits → classes (utilitaires `t-1…5`, `mt-1…6`, etc. dans `base.css`).
13. Couleurs codées en dur dans le JavaScript des graphiques (`flash.js:218`, `account.js:97`, `ICV` dans `core.js:56`).
14. Nettoyage (`main.css`, `umenuAncienItemsH`, code mort relevé dans l'inventaire), documentation du système de design.
15. Vérification complète (345 tests, parcours, captures clair et sombre, hébreu), puis livraison (pull request).

**Outils de travail (hors dépôt)** : dossier `scratchpad/outils` de la session — `capture.mjs` (captures Playwright :
`node capture.mjs <dossier> --mode=demo|visiteur|compte --lang=fr|en|he --theme=light|dark [--only=…] [--viewport]
[--jpeg --dpr=1.5 --maxh=1800 --q=55]`), `classes.mjs` (inventaire des classes), `migrer-css.mjs` + `composants.txt` +
`roles.txt` (migration de l'ancien CSS, déjà appliquée), `renommer-boutons.cjs` (déjà appliqué). S'ils ont disparu,
ils se réécrivent en quelques minutes : seul `capture.mjs` sert encore. Les captures « avant » se refont à tout moment
depuis `main` (`git worktree add ../avant origin/main` puis `node tools/serve.mjs 4174` dans ce dossier).

**Pièges rencontrés**
- Garde-fou ECC : la première création ou modification d'un fichier est refusée ; énoncer les faits demandés puis
  réessayer. Pour un nouveau fichier, écrire d'abord une ligne, puis le vrai contenu.
- Les commandes `node -e` et les heredocs abîment les barres obliques inverses : écrire les scripts dans des fichiers.
- Ne pas lancer deux suites Playwright (`npx playwright test`) en même temps dans le dépôt.

## 0. Plugins disponibles dans la session

**unslop** (`unslop@heydamir`, version `620163eedb35`) : un skill, `unslop:unslop` (`/unslop`). Il apporte une méthode
(audit, direction en cinq lignes, neuf passes : espacement, couleur, icônes, textes, typographie, mise en page, détails,
visuels, animation) et des références (`signs.md`, `tokens.md`, `rtl.md`, `visuals.md`). Non utilisés, comme demandé :
la génération d'images payante et la vidéo « story ».

**ECC** (`ecc@ecc`, version 2.2.3) : 72 agents, 327 skills, 98 commandes `/ecc:…`, et des hooks (garde-fous).
- Agents prévus pour cette mission : `ecc:planner`, `ecc:architect`, `ecc:code-explorer`, `ecc:e2e-runner`,
  `ecc:code-reviewer`, `ecc:security-reviewer`, `ecc:refactor-cleaner`, `ecc:doc-updater`, `ecc:a11y-architect`.
- Skills et commandes prévus : `ecc:plan`, `ecc:frontend-patterns`, `ecc:coding-standards`, `ecc:verification-loop`,
  `ecc:e2e-testing`, `ecc:accessibility`, `ecc:design-system`, `ecc:click-path-audit`.
- Écartés, comme demandé : les commandes `ecc:multi-*` (runtime externe), `ecc:astra-review` et tout ce qui envoie le
  code à un service tiers (`ecc:santa-loop`, `ecc:council-multi-model`).
- Autres skills utiles disponibles : `frontend-design:frontend-design`.

**Hooks rencontrés** (jamais désactivés) : le « Fact-Forcing Gate » d'ECC refuse la première commande de la session et la
première création de chaque fichier tant que quelques faits ne sont pas énoncés (qui appelle le fichier, absence de
doublon, consigne citée). Conséquence : chaque nouveau fichier demande deux essais.

## 1. État des lieux

### Le site en chiffres (commit `8b4489f`)
- Une page (`index.html`), une feuille de style (`css/main.css`, 227 Ko, 968 classes), 27 fichiers JavaScript (1,4 Mo
  dont 470 Ko de traductions), un panel d'administration (`admin.html`, feuille de style embarquée).
- **26 écrans, 244 actions, 14 formulaires** (inventaire automatique : `node tools/audit/inventaire.mjs`).
- Environ 400 styles en ligne dans les gabarits JavaScript ; 3 polices Google (Geist, Big Shoulders Display, Heebo).
- 345 tests Playwright, lancés sur chaque pull request. Ils s'appuient surtout sur les attributs `data-a`, `data-form`
  et `data-*` (40 classes CSS seulement y sont citées).

### Inventaire détaillé (relevé par cinq agents `ecc:code-explorer`)
1. [Écrans principaux](refonte/inventaire/1-ecrans-principaux.md) : accueil, marché, chat, classement, rang, profil,
   joueur, dépôt, retrait, en-tête, recherche, notifications, ticket de pari.
2. [Comptes et réglages](refonte/inventaire/2-comptes-et-reglages.md) : créer un pari, connexion, inscription,
   onboarding, modifier le profil, amis, parrainage, jeu responsable, KYC, langues.
3. [Modes de jeu](refonte/inventaire/3-modes-de-jeu.md) : Éclair, Blitz, Série, duels, combinés.
4. [Social et ordres](refonte/inventaire/4-social-et-ordres.md) : clans, copy trading, ordres limites, marchés à
   plusieurs issues.
5. [Mode Pro, mode serveur, administration](refonte/inventaire/5-pro-serveur-admin.md).

### Les 26 écrans
`accueil` · `marche` (simple, groupe, issue) · `eclair` · `blitz` · `serie` · `chat` · `clans` · `clan` · `classement` ·
`rang` · `profil` · `joueur` · `depot` · `retrait` · `creer` · `modifier` · `amis` · `copie` · `parrainage` ·
`responsable` · `duels` · `duel` · `combines` · `bienvenue` · `connexion` · `inscription`.
Hors routeur : Mode Pro (plein écran `#pro`), recherche (`#sov`), notifications (`#npanel`), menu du compte (`#umenu`),
modales (`#ov`), toasts, barre des combinés (`#slipbar`), bandeau de pause (`#rgbar`), écran d'erreur serveur.

### États particuliers à ne pas oublier
- **Visiteur / connecté** ; **compte démo** (pastilles « Mode démo ») ; **mode serveur** (compte réel).
- **Rang** : messages privés et partage (rang 1), suivre une mise, créer un clan, 2 indicateurs Pro (2), créer un pari,
  copy trading (3), statistiques avancées, 3 indicateurs (4), frais réduits, badge vérifié (5), salon VIP (6), publier
  sans vote (7), avis affiché, indicateurs illimités (8).
- **KYC** : carte, virement et PayPal verrouillés tant qu'il n'est pas fait.
- **Jeu responsable** : pause (bandeau, mises et dépôts bloqués), limites, auto-exclusion.
- **Mode serveur** : « Bientôt disponible avec ton compte » pour les ordres limites et les protections ; écran
  « Connexion au serveur impossible » ; session expirée ; compte suspendu.

### Captures « avant »
Prises dans Chrome avec Playwright, compte démo, français, thème clair : 26 écrans + une vingtaine d'états (ticket,
notifications, recherche, modales…) en 390 × 844 et 1440 × 900. Rangées dans `docs/refonte/captures/avant/`.

## 2. Plan

Établi avec les agents ECC `planner` (plan par phases, arborescence, risques) et `architect` (architecture du CSS). Leurs
critiques ont changé trois points de la stratégie de départ : pas de `@layer` (une règle hors couche l'emporterait
pendant la transition) ; l'ancien nom `--oui` reste un alias de l'**accent** et non du vert, le sens « Oui / hausse »
étant converti explicitement ; les styles en ligne des gabarits ont leur propre passe.

### Nouvelle arborescence (5 destinations)

| Destination | Écran d'arrivée | Ce qu'elle regroupe | Gestes depuis l'accueil |
|---|---|---|---|
| **Marchés** | `#accueil` | liste, fiche d'un marché (simple, groupe, issue), ticket, Mode Pro, créer un pari, combinés | marché : 1 · pari confirmé : 3 · Mode Pro : 2 · créer un pari : 1 |
| **Éclair** | `#eclair` | Éclair, Blitz, Série, duels (contrôle segmenté commun) | 1 à 2 |
| **Portefeuille** | `#portefeuille` (nouveau carrefour fait de blocs existants) | solde, déposer, retirer, positions, ordres, combinés, historique, KYC | 1 à 2 |
| **Communauté** | `#chat` | chat, clans, classement, amis, copy trading (sous-navigation commune) ; fiche d'un clan, d'un joueur | 1 à 3 |
| **Profil** | `#profil` | identité, rang et missions, parrainage, jeu responsable, réglages, langue, thème, déconnexion ; pour un visiteur : connexion et inscription | 1 à 2 |

Barre du haut : logo, recherche, solde (vers Portefeuille), notifications ; sur ordinateur s'ajoutent les 5 destinations
et l'avatar (menu du compte conservé). Sur téléphone : barre d'onglets en bas. Toutes les anciennes adresses (`#…`)
continuent de fonctionner.

### Architecture du CSS (sans étape de build)

| Fichier | Rôle |
|---|---|
| `css/tokens.css` | variables des deux thèmes ; le thème sombre ne vit **que** là |
| `css/base.css` | remise à zéro, typographie, mise en page, quelques classes utilitaires |
| `css/components.css` | boutons, champs, cartes, onglets, listes, badges, fenêtres, notifications, navigation |
| `css/screens.css` | styles propres à chaque écran, dans l'ordre de l'ancien fichier |
| `css/admin.css` | panel d'administration |

Règles : aucune couleur écrite en dur ni sélecteur `[data-theme]` hors de `tokens.css` ; propriétés logiques uniquement
(hébreu) ; spécificité plate. `css/main.css` est supprimé à la fin.

### Remplacement de l'ancien CSS
1. Base et composants écrits à la main (nouveaux fichiers).
2. Le reste de `main.css` passe par un script de migration qui ne fait que **substituer des valeurs** d'après une table
   fermée (couleurs → variables, polices → pile système, tailles → 5 valeurs, graisses ≤ 600, rayons → échelle, ombres,
   durées) et retire les règles du thème sombre devenues inutiles. Il garde l'ordre des règles, ne touche ni aux
   dimensions ni aux positions, et signale ce qu'il ne sait pas traduire. Les usages de l'ancien bleu sont classés à la
   main (accent ou « Oui »).
3. Reprise à la main, écran par écran, captures à l'appui.
4. Classes de bouton renommées dans les gabarits : `b-pri` (action principale), `b-yes`, `b-no`.
5. Styles en ligne : remplacés par des classes ; seuls restent les styles dynamiques (largeur d'une barre, couleur
   d'un avatar).

### Risques et parades
1. Contrat avec le JavaScript cassé sans bruit (variables lues par les graphiques, hauteurs mesurées, seuil de 1100 px)
   → anciens noms de variables conservés en alias, attributs `data-*` intacts, 345 tests relancés à chaque étape.
2. Sens des couleurs → accent, Oui / Non et hausse / baisse séparés dès les variables ; palettes enregistrées (couleur
   de profil, de clan, tracés du Mode Pro) inchangées.
3. Traductions → chaque libellé nouveau entre dans les 3 catalogues ; captures en hébreu.
4. Tests qui s'effilochent → on n'adapte que des sélecteurs, jamais une valeur attendue.
5. Chantier à moitié fini → le site reste cohérent à chaque commit (tout passe par les variables).
6. Poids → polices Google retirées ; total du CSS inférieur à l'ancien.

## 3. Audit et direction (plugin unslop)

Skill `unslop:unslop` invoqué sur l'ensemble des écrans, à partir des captures « avant » et du code. Sa méthode : relever
les signes d'une interface « générée », fixer une direction en cinq lignes, puis corriger en neuf passes, dans l'ordre.
Il prévoit d'attendre une validation de la direction : elle était accordée d'avance par le brief.

### Ce que l'audit a relevé
| Famille | Constat (avant) |
|---|---|
| Couleur | le bleu sert à la fois d'accent, de « Oui » et de hausse ; l'ambre sert de « Non », de baisse et d'avertissement ; pastilles teintées partout ; pastilles noires « ×1,59 » posées sur chaque bouton |
| Typographie | une police d'affichage condensée pour tous les chiffres ; graisses 700 et 800 ; 44 tailles de texte différentes ; 13 libellés forcés en majuscules |
| Icônes | tracés maison ; un emoji 🏆 dans le classement des clans ; flèches ↑ ↓ en texte |
| Espacement | valeurs hors grille (5, 7, 9, 13, 14, 18, 22 px…) ; environ 400 styles écrits en ligne |
| Textes | explications répétées à plusieurs endroits ; comparaison commerciale « Chez Polymarket… » dans le ticket |
| Composants | badges de rang et pastilles d'XP sur presque chaque ligne ; accueil en 7 blocs et 4 encarts ; ticket de 9 lignes et 6 contrôles |
| Animation | 5 animations en boucle (pulsation, flottement, reflet, rotation) ; rebonds |
| Droite à gauche | déjà en propriétés logiques, quelques rustines `[dir=rtl]` |

Verdict : une interface dessinée, mais surchargée. La direction étant fixée par le brief, le processus complet s'applique.

### La direction, en cinq lignes
- **Produit** : Wimoro fait parier par Oui ou par Non sur l'actualité, et toutes les 45 secondes sur un prix, entre
  amis, avec de l'argent fictif.
- **Caractère** : posé, précis, vif.
- **Monde** : le tableau des cotes. Papier blanc, encre, chiffres alignés.
- **Temps forts** : la chance d'un marché avec sa courbe ; le compte à rebours du pari Éclair. Ce sont les deux seuls
  endroits où le texte passe à 40 px et où l'écran s'anime.
- **Signature** : le couple Oui / Non, toujours côte à côte, en vert et en rouge, avec son prix en chiffres tabulaires.
  On le retrouve à l'identique sur le marché phare, dans les listes, dans le ticket et dans les cartes de mise.

### Les neuf passes
| Passe | Ce qui a changé |
|---|---|
| 1. Espacement | grille de 4 px (`--sp-*`) ; les valeurs hors grille de l'ancien CSS ramenées à la grille ; styles en ligne remplacés par des classes |
| 2. Couleur | une rampe de gris neutres, trois rôles de texte, un accent ; vert et rouge réservés au sens ; ni dégradé, ni halo, ni ombre colorée |
| 3. Icônes | un seul jeu, Lucide ; les icônes prennent la couleur de leur texte |
| 4. Textes | libellés courts ; une ligne d'explication par mode de jeu ; le détail du pari replié |
| 5. Typographie | pile système, 5 tailles, graisses 400 à 600, plus de majuscules forcées, chiffres tabulaires |
| 6. Mise en page | 5 destinations ; accueil recentré sur les marchés ; portefeuille et profil en une colonne |
| 7. Détails | rayons emboîtés (8, 12, 16, 20) ; cartes sans bordure ni ombre ; pastilles discrètes ; focus visible |
| 8. Visuels | aucun visuel généré ; les temps forts viennent du produit (courbes, compte à rebours) |
| 9. Animation | 150 à 250 ms, une seule courbe ; boucles retirées ; « réduire les animations » respecté |

Écart assumé avec unslop : il recommande une police dessinée pour l'hébreu ; le brief impose la pile système, qui
l'emporte (les familles système qui dessinent bien l'hébreu passent en tête, voir `tokens.css`).

## 7. Non-régression

### Comparaison automatique avant / après
Outil du dépôt (`tools/audit/inventaire.mjs`) et comparaison des gabarits du commit `8b4489f` avec ceux de la branche :

| Mesure | Avant (`8b4489f`) | Après la seconde passe | Disparu, et pourquoi |
|---|---:|---:|---|
| Actions (`ACT`) | 244 | 244 | aucune |
| Actions ayant un déclencheur `data-a` dans les gabarits | 244 | 244 | aucune |
| Formulaires (`FORMS`) | 14 | 14 | aucun |
| Formulaires écrits en clair (`data-form="…"`) | 15 | 14 | `general` : le mini-chat de l'accueil (première passe). Le salon général s'ouvre dans Communauté → Live chat, dont le formulaire porte un nom calculé |
| Écrans (`VIEWS`) | 26 | 28 | aucun (ajouts : `portefeuille`, `communaute`) |
| Attributs `data-*` posés par les gabarits | 180 | 181 | `data-rankchip` (puce de rang de l'en-tête), `data-clhome` (carte de clan de l'accueil), `data-hcmini` (mini-chat de l'accueil) : trois blocs retirés de l'écran à la première passe, leurs fonctions sont dans Profil et Communauté |
| Identifiants | 71 | 71 | aucun |
| Liens écrits en clair (`href="#…"`) | 23 | 23 | `#chat` et `#copie` ne sont plus écrits en clair : la page Communauté et la sous-navigation les construisent (`ligneH`, `sousNavH`) |
| Tests Playwright | 336 | 396 (+ 1 ignoré) | aucun retiré ; 2 adaptés à la nouvelle navigation (voir journal) |

### Où se trouve chaque fonction
| Fonction | Où elle se trouve maintenant | Comment c'est vérifié |
|---|---|---|
| Parcourir les marchés, catégories, tri, courbe ou volume | Marchés (`#accueil`) | `demo/chargement`, `compte/marches-etat`, parcours 1 |
| Marché phare, grosses mises en direct | Marchés (colonne de droite ; sous la liste sur téléphone) | `compte/simulateurs`, captures |
| Recherche (marchés, joueurs, paris Éclair) | en-tête : champ sur ordinateur, loupe sur téléphone | capture « recherche » |
| Fiche d'un marché : graphique, périodes, règles, chat du marché | `#marche-…` (inchangé) | `demo/chargement`, captures |
| Acheter Oui ou Non, vendre, montants rapides, annoncer sa mise | ticket de la fiche, ou feuille ouverte depuis une liste | `demo/parcours`, `compte/paris`, parcours 2 et 3 |
| Détail d'un pari (prix moyen, parts, impact, frais, ordre max) | dans le ticket, replié sous « Détail du pari » | parcours 3 |
| Ordre limite, stop loss et take profit | ticket (« Ordre limite ») et bouton de la position | `compte/garde` ; capture « marché, ordre limite » |
| Combinés | « Ajouter au combiné » dans le détail du ticket ; barre des combinés ; `#combines` depuis Portefeuille | `compte/combines` |
| Marchés à plusieurs issues | inchangé | `compte/paris` (K21), captures |
| Mode Pro : indicateurs, tracés, partage d'analyse | bouton « Mode Pro » du graphique (inchangé) | `compte/analyses`, capture |
| Suivre un marché, partager, défier | boutons en tête de la fiche | `compte/duels` |
| Pari Éclair : mise, rotation ou libre, catégories, alertes, aide | Éclair (`#eclair`) ; blocs secondaires repliés sur téléphone | `demo/eclair`, `compte/eclair`, parcours 4 |
| Blitz Royale, La Série | Éclair, sous-navigation | `compte/blitz`, `compte/serie` |
| Duels et duels de stack | Éclair, sous-navigation (`#duels`) ; bouton « Défier » | `compte/duels`, `compte/duels-eclair`, `compte/stacks` |
| Créer un pari, voter | Marchés, bouton « Créer un pari » (`#creer`) | `compte/propositions` |
| Solde, positions, historique | Portefeuille (`#portefeuille`) | `compte/argent`, `compte/paris`, parcours 5 |
| Déposer : crypto, carte, virement, PayPal, dépôt simulé | Portefeuille → Déposer (`#depot`) | `compte/argent`, parcours 6 |
| Retirer | Portefeuille → Retirer (`#retrait`) | `compte/argent`, parcours 7 |
| KYC | Portefeuille, Profil (« Faire le KYC »), page de dépôt | `compte/argent`, `compte/comptes` |
| Chat : général, marchés, VIP, clan, messages privés, réactions, partager une mise, citer | Communauté (`#communaute`) → Live chat (`#chat`) | `compte/chat`, `prive`, `reactions`, `salon-vip`, `mises`, parcours 8 et 21 |
| Clans : annuaire, fiche, créer, rejoindre, guerres, appels, outils du chef | Communauté → Clans | `compte/clans`, `clans-chefs`, `clans-guerres`, `clan-chat`, parcours 13 et 21 |
| Classement, fiche d'un joueur, suivre un joueur | Communauté → Classement | `compte/suivre`, parcours 9, 13 et 21 |
| Amis : demandes, recherche, invitation | Communauté → Amis | `compte/amis`, parcours 9, 13 et 21 |
| Copy trading | Communauté → Copy trading ; fiche d'un joueur | `compte/copies`, parcours 13 et 21 |
| Profil : identité, statistiques, badges, paris créés | Profil (`#profil`) | captures |
| Rang, missions, avantages | Profil → Mon rang (`#rang`) | `compte/etat`, parcours 13 |
| Modifier le profil : photo, couleur, bio, confidentialité, mot de passe | Profil → Modifier le profil | `compte/comptes` |
| Notifications : panneau, effacer, réglage des pop-up | cloche de l'en-tête ; Profil | capture « notifications » |
| Langue (anglais par défaut, français, hébreu) | Profil ; en-tête pour un visiteur ; pied de la connexion | `i18n`, parcours 10, 17 et 18 |
| Thème clair ou sombre | bouton de l'en-tête (ordinateur ; visiteur sur téléphone) ; Profil | parcours 11 |
| Parrainage | Profil → Parrainage | `compte/parrainage` |
| Jeu responsable : limites, pause, auto-exclusion, export, aide | Profil et Portefeuille → Jeu responsable | `compte/argent`, `compte/comptes` |
| Inscription, connexion (e-mail, pseudo, portefeuille, compte démo), mot de passe oublié, onboarding | visiteur : « S’inscrire » dans l'en-tête, « Se connecter » dans l'en-tête (ordinateur) ou cinquième onglet (téléphone) ; présentation en tête de l'accueil | `compte/comptes`, `demo/parcours`, parcours 14, 16 et 22 |
| Déconnexion | Profil (« Mon compte ») et menu du compte | `demo/parcours`, parcours 12 |
| Outils de démonstration : changer de rang, réinitialiser | Profil | `compte/analyses` |
| États du mode Compte : serveur injoignable, session expirée, compte suspendu, « Bientôt disponible » | inchangés | `compte/garde`, `compte/comptes`, `compte/chargement` |
| Administration | `admin.html` (mêmes écrans, nouvel habillage) | `compte/admin` |

Les « parcours » renvoient à `tests/refonte/parcours.spec.mjs`, écrit par l'agent `ecc:e2e-runner`.

### Ce qui a été retiré de l'écran (sans retirer de fonction)
- En-tête : la puce de rang et les deux boutons « Déposer ». Le rang est dans Profil, le dépôt dans Portefeuille (2 gestes).
- Accueil : la carte de clan, la carte de rang, le « Top de la semaine » et le mini-chat. Ils doublaient Communauté et Profil.
- Profil : les onglets Positions et Historique (déplacés dans Portefeuille), l'encart « Activité récente » (doublon du
  panneau de notifications) et la carte de clan.
- Menu du compte : Amis, Clan, Duels, Combinés, Déposer, Retirer, désormais portés par les destinations.

## 8. Vérification

Rapport au format du skill `ecc:verification-loop`, adapté à un site sans build :

| Contrôle | Résultat |
|---|---|
| Construction | sans objet (site statique) ; `node --check` et `node tools/version.mjs --verifier` passent |
| Tests | **364 passent**, 1 ignoré (le test « téléphone » ne tourne que dans le projet mobile) : les 336 d'origine + 28 parcours de la refonte (`tests/refonte/parcours.spec.mjs`, agent `ecc:e2e-runner`) |
| Sécurité | agent `ecc:security-reviewer` : aucun constat critique, élevé ni moyen ; plus aucune requête vers un tiers au chargement |
| Revue de code | agent `ecc:code-reviewer` : 4 rafraîchissements visaient encore l'ancien emplacement des positions, corrigés ; un défaut d'accessibilité des sections repliables, corrigé |
| Différences | 244 actions, 14 formulaires, 26 écrans conservés (section 7) |
| Cible | NON RÉALISÉE : rien n'est déployé, wimoro.com est intact |

**Contrôle automatique des écrans** (script hors dépôt : il ouvre les 28 écrans dans Chrome et mesure le contraste de
chaque texte avec son fond réel, le débordement horizontal, les tailles de texte, les erreurs de console). Résultat après
corrections : aucun débordement, aucune erreur, aucun contraste sous le seuil AA, en clair et en sombre, sur téléphone
et ordinateur, pour un visiteur (6 écrans) et en hébreu (7 écrans). Avant corrections : 10 motifs fautifs en clair.

**Captures** : `docs/refonte/captures/` — `avant/` (26 écrans), `apres-clair/` et `apres-sombre/` (27 écrans), en
`mobile/` (390 × 844) et `desktop/` (1440 × 900), compte démo, français. 9,6 Mo : **à retirer avant la mise en ligne.**

**Poids** : CSS 226 Ko (48,4 Ko compressé) contre 222 Ko (47,4 Ko) ; JavaScript 1 369 Ko contre 1 366 Ko ; polices
externes supprimées (2 familles Google, 1 pour l'hébreu, 3 requêtes vers un tiers en moins).

**Non vérifié** : le vrai back-end (la suite `E2E=1` crée des comptes en production et n'a pas été lancée ; elle reste à
adapter à la nouvelle navigation) ; un vrai téléphone et Safari (tout a été vu dans Chrome en émulation) ; un lecteur
d'écran ; le Mode Pro, l'administration et les états d'erreur du mode Compte n'ont pas été regardés en capture (ils
sont couverts par les tests et le contrôle automatique) ; sur les 108 captures « après », une quinzaine ont été
regardées de près.

## 9. Améliorations repérées, hors périmètre
- Ordres limites et protections : toujours bloqués en mode Compte (migration en attente, voir PLAN.md).
- `js/auth.js` : deux valeurs du brouillon « créer un pari » ne passent pas par `esc()` (déjà le cas avant).
- Code mort d'avant la refonte : `homeChatH`, `ACT.hroom`, `authThemeBtn`, `PRIV`, l'action `ob-kyc`.
- Chiffres écrits en dur dans des textes (« Saison 3. Fin dans 12 jours », « 38 900 joueurs ») ; « 25 votes » contre 50.
- Le marché phare de l'accueil est toujours le Bitcoin, malgré son libellé « qui bouge le plus ».
- Images partagées (duel, série, clan, analyse) : palette d'origine. Administration : 12 styles en ligne, non traduite.
- `css/screens.css` garde l'ordre de l'ancienne feuille, avec des sections « Reprise à la main » : à fusionner écran par
  écran. Les anciens noms de variables restent en alias dans `css/tokens.css` (lus par le Mode Pro).

## Décisions prises sans consulter le propriétaire

| Sujet | Décision | Pourquoi |
|---|---|---|
| Fichier de suivi | `docs/REFONTE.md`, séparé de `docs/PLAN.md` | PLAN.md suit la réparation du back, un autre chantier |
| Captures | Compte démo, français, navigateur Chrome, hasard figé | Écrans les plus remplis ; captures comparables avant / après |
| Inventaire | Outil du dépôt pour les actions + cinq agents pour les écrans | 1,4 Mo de code : relevé parallèle, citations vérifiables |
| Couleurs | Accent = le bleu du logo ; Oui en vert, Non en rouge (avant : bleu et ambre) | Demandé par le brief : le vert et le rouge portent le sens |
| Troisième issue de l'Éclair (« break even ») | Neutre (gris), plus de doré | Une seule couleur d'accent ; ni Oui ni Non |
| Tailles de texte | 12, 14, 16, 20, 28 px ; 40 px pour les deux temps forts | Proche des tailles d'origine : aucun débordement ; 16 px dans les champs (pas de zoom sur iPhone) |
| Boutons secondaires | Gris (ancien bouton noir) ; une seule action en couleur par écran | Le noir concurrençait l'action principale |
| Thème | Clair par défaut, même si l'appareil est en sombre ; le choix fait avec le bouton est retenu | Demandé par le brief |
| Polices | Pile système ; plus aucune police Google | Brief ; trois requêtes externes en moins |
| Icônes | Jeu Lucide (licence ISC), tracés copiés dans `js/core.js` | Un seul jeu au trait, sous licence libre, sans dépendance |
| Accueil | Carte de clan, carte de rang, « Top de la semaine » et mini-chat retirés | Doublons de Communauté et de Profil ; l'accueil répond à « sur quoi parier ? » |
| Présentation pour un visiteur | Un titre, une phrase et deux boutons en tête de l'accueil | Comprendre Wimoro en cinq secondes ; les deux boutons existaient déjà |
| Ticket de pari | Gain et bouton visibles ; prix moyen, parts, impact, frais, ordre max, combiné sous « Détail du pari » | L'essentiel d'abord ; la case « Annoncer ma mise » reste visible car elle est cochée par défaut |
| Blocs secondaires | Repliés sur téléphone pour Éclair, Blitz, Série, duels, combinés, clan, classement, joueur | Écrans très longs ; un appui les déplie ; dépôt, retrait, amis et jeu responsable restent dépliés |
| Menu du compte | Conservé sur ordinateur, réduit à ce que les destinations ne portent pas | Aucune action retirée de l'inventaire |
| Sous-navigation Communauté | Libellé « Copies » | Trois noms désignaient la même fonction ; celui-ci existait déjà dans les trois langues |
| Test `compte/simulateurs` | S'ouvre sur l'écran du chat ; la liste des lectures au démarrage gagne `api_dm_list` | L'accueil n'affiche plus de salon ; ce que le test protège (aucun appel périodique) est inchangé |
| Captures | JPEG allégés, hauteur limitée à 1 600 px | Garder le dépôt léger ; dossier à retirer avant la mise en ligne |

## Journal

- **19 nov.** — Étape 0 : les deux plugins sont présents. Étape 1 : branche créée, inventaire automatique régénéré,
  cinq inventaires détaillés enregistrés, captures « avant » prises.
