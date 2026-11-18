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
| 3. Audit et direction (unslop) | à faire |
| 4. Système de design (variables, composants, documentation) | à faire |
| 5. Navigation et structure | à faire |
| 6. Écrans, dans l'ordre du brief | à faire |
| 7. Nettoyage | à faire |
| 8. Vérification et livraison | à faire |

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

## Décisions prises sans consulter le propriétaire

| Sujet | Décision | Pourquoi |
|---|---|---|
| Fichier de suivi | `docs/REFONTE.md`, séparé de `docs/PLAN.md` | PLAN.md suit la réparation du back, un autre chantier |
| Captures | Compte démo, français, navigateur Chrome, hasard figé | Écrans les plus remplis ; captures comparables avant / après |
| Inventaire | Outil du dépôt pour les actions + cinq agents pour les écrans | 1,4 Mo de code : relevé parallèle, citations vérifiables |

## Journal

- **19 nov.** — Étape 0 : les deux plugins sont présents. Étape 1 : branche créée, inventaire automatique régénéré,
  cinq inventaires détaillés enregistrés, captures « avant » prises.
