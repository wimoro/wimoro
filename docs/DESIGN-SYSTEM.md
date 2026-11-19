# Système de design de Wimoro

Ce document décrit le système mis en place par la refonte : ce qu'il contient, comment s'en servir, et ce qu'il interdit.
Il s'adresse à toute équipe qui reprend le front. Le site reste statique : aucun outil de build, aucune bibliothèque.

## 1. Les fichiers

| Fichier | Contenu | Quand y toucher |
|---|---|---|
| `css/tokens.css` | toutes les variables, pour le thème clair et le thème sombre | changer une couleur, une taille, un rayon… |
| `css/base.css` | remise à zéro, typographie, mise en page, classes utilitaires | rarement |
| `css/components.css` | navigation, boutons, champs, cartes, onglets, listes, badges, fenêtres, notifications | ajouter ou modifier un composant commun |
| `css/screens.css` | ce qui est propre à un écran | travailler un écran |
| `css/admin.css` | panel d'administration | — |
| `js/refonte.js` | sous-navigations, écran Portefeuille, profil, sections repliables | structure des écrans |
| `js/i18n-4.js` | traductions (anglais, hébreu) des textes ajoutés par la refonte | tout nouveau texte |

Les quatre feuilles se chargent dans cet ordre dans `index.html`. Après toute modification : `node tools/version.mjs`.

## 2. Les règles (à ne pas enfreindre)

1. **Aucune valeur en dur** hors de `tokens.css` : pas de `#hex`, pas de `rgb()`, pas de taille de texte en pixels,
   pas de rayon ni d'ombre libres (une exception documentée au § 3 : les couleurs des issues d'un marché à plusieurs issues). Le thème sombre n'existe **que** dans `tokens.css` : aucun sélecteur `[data-theme]`
   ailleurs (une exception documentée : l'icône lune / soleil du bouton de thème).
2. **Une seule couleur d'accent**, le bleu du logo : actions principales, éléments actifs, liens.
   **Le vert et le rouge ne portent que du sens** : Oui / Non, hausse / baisse, gain / perte, erreur.
3. **Une action principale par écran** (`b-pri`). Les autres boutons sont gris, à contour ou en texte seul.
4. **Cinq tailles de texte, trois graisses.** La taille `--fs-display` est réservée aux deux temps forts : la chance
   d'un marché et le pari Éclair.
5. **Grille de 4 px** pour tous les espacements (`--sp-*`).
6. **Pas de bordure et d'ombre à la fois.** Les cartes n'ont ni l'une ni l'autre : elles se détachent par leur fond.
   Seul ce qui flotte (menu, fenêtre, notification) porte une ombre. Les filets servent à séparer des lignes.
7. **Propriétés logiques uniquement** (`margin-inline-start`, `inset-inline-end`, `text-align:start`…) : l'hébreu
   s'écrit de droite à gauche et la page se retourne seule. Exception documentée : le chevron des blocs repliables est
   dessiné avec `border-right` (une flèche vers le bas ne se retourne pas).
8. **Animations de 150 à 250 ms** (`--dur-1` à `--dur-3`, courbe `--ease`), sur `opacity`, `transform`, `background`,
   `color`. Rien ne tourne en boucle, sauf le compte à rebours de l'Éclair. « Réduire les animations » est respecté.
9. **Cibles tactiles de 44 px** (`--tap`), par une seule règle : la section « Écrans tactiles » à la fin de
   `components.css` (`@media (pointer:coarse)`). Un petit contrôle garde son dessin et reçoit une zone d'appui de
   44 × 44 px centrée sur lui (pseudo-élément) ; les champs, les listes déroulantes et les boutons mesurent vraiment
   44 px. Pour un nouveau petit contrôle : l'ajouter aux deux listes de cette règle, rien d'autre. Un contrôle qui rogne
   son contenu (`overflow:hidden`) ne peut pas porter de zone élargie : il grandit par `min-height` ou par une marge
   intérieure compensée (`padding-block` + `margin-block` négatif).
10. **Tout texte passe par `_t('texte français')`** et reçoit ses traductions anglaise et hébraïque dans `js/i18n-4.js`.
11. **Les icônes viennent d'un seul jeu**, Lucide (licence ISC), par `ic('nom')` (`js/core.js`). Elles prennent la
    couleur du texte. Pas d'emoji en guise d'icône (les réactions du chat sont du contenu, pas des icônes).
12. **Le JavaScript s'accroche aux attributs `data-*` et aux identifiants**, pas à l'apparence : on peut changer le
    HTML et les classes d'un gabarit tant que ces attributs restent en place.
13. **Un seul palier de navigation : 879 / 880 px.** Jusqu'à 879 px (téléphones, tablettes en portrait), les cinq
    destinations sont dans la barre d'onglets du bas ; à partir de 880 px, dans l'en-tête. Le reste se plie tout seul :
    grilles et `flex` qui passent à la ligne, `clamp()` pour les marges (`--gutter`), jamais de largeur fixe. Un écran doit
    tenir sans défilement horizontal de 320 à 1920 px, et en paysage sur téléphone (844 × 390). Sur ordinateur, chaque
    écran est **composé** sur la grille des grands écrans (§ 3 « La grille ») : la largeur sert à montrer plus de
    contenu, jamais à creuser des marges.
19. **Sur ordinateur** : tout ce qui se clique a un état de survol ; toute courbe a une info-bulle (valeur et date) ;
    le focus clavier est visible ; la touche Échap ferme les fenêtres et les panneaux ; aucun texte utile sous 13 px
    (`--fs-1` passe à 13 px à partir de 880 px) ; les titres de page grandissent (`--fs-titre`) ; à 1 440 × 900, l'action
    principale de chaque écran est visible sans défiler ; un seul bouton bleu (`b-pri`) à l'écran à la fois.
14. **Tout ce qui se pose en bas de l'écran part de `--bas`** (barre d'achat d'un marché, zone de pari Éclair, combiné
    en cours, barre d'enregistrement) : `--bas` vaut la zone sûre seule, ou la barre d'onglets plus la zone sûre. Aucun
    décalage en pixels écrit en dur.
15. **Sur téléphone, on lit et on écrit en 16 px** : paragraphes, messages du chat, champs (un champ plus petit fait
    zoomer l'iPhone). 14 px pour les étiquettes et le texte secondaire, 12 px pour les légendes ; rien en dessous.
16. **Un seul libellé par action, partout et à toutes les tailles** : « Se connecter », « S'inscrire ». Pas de version
    courte pour le téléphone : si un libellé ne tient pas, c'est la mise en page qui s'adapte.
17. **Un seul format de montant par langue**, par la fonction `money()` (`js/core.js`) : « 248,50 $ » en français,
    « $248.50 » en anglais et en hébreu. Avec centimes pour l'argent du joueur (solde, mise, gain, valeur) ; en dollars
    entiers pour les seuils, les mises rapides et les montants des autres joueurs ; en abrégé pour les volumes
    (`F.usd`, `F.usd0`, `F.compact`). Aucun montant fabriqué à la main dans un gabarit.
18. **La page de départ ne contient aucune valeur fictive.** `index.html` est écrit dans la langue par défaut (anglais) ;
    chaque texte y porte sa clé française (`data-i18n` pour le contenu, `data-i18n-<attribut>` pour un attribut), traduite par
    `i18nStatic` dès que les catalogues sont chargés. Tant que le site démarre, `<body>` n'a ni la classe `in` ni la classe
    `out` : les éléments réservés à un état (`only-in`, `only-out`) restent cachés et un bloc neutre tient leur place.

## 3. Les variables

### Couleurs
| Variable | Rôle | Clair | Sombre |
|---|---|---|---|
| `--bg` | fond de page | `#F5F5F7` | `#0A0A0C` |
| `--surface` | cartes, barres, feuilles | `#FFFFFF` | `#17171A` |
| `--fill`, `--fill-2` | champs, pistes, pastilles ; survol | `#F0F0F3`, `#E6E6EB` | `#222226`, `#2D2D32` |
| `--line`, `--line-2` | filets ; contour d'un contrôle | noir à 9 % et 18 % | blanc à 10 % et 22 % |
| `--text`, `--text-2`, `--text-3` | texte principal, secondaire, légende | `#1D1D1F`, `#48484C`, `#66666B` | `#F5F5F7`, `#C2C2C9`, `#94949C` |
| `--text-4` | désactivé et décor (jamais un texte à lire) | `#A1A1A8` | `#5E5E66` |
| `--accent`, `--accent-bg`, `--accent-soft` | accent : texte, fond plein, fond doux | `#2448FF`, `#2448FF`, `#EAEEFF` | `#8AA0FF`, `#4463FF`, `#1A2147` |
| `--yes`, `--yes-bg`, `--yes-soft` | Oui, hausse, gain | `#0B7A3B`, `#0B7A3B`, `#E4F4EA` | `#3DD68C`, `#12803F`, `#10291C` |
| `--no`, `--no-bg`, `--no-soft` | Non, baisse, perte, erreur | `#C4142B`, `#C4142B`, `#FCE9EB` | `#FF6B6B`, `#C22A3A`, `#331417` |
| `--ink-bg`, `--on-ink` | élément inversé (bulle d'aide, barre des combinés) | `#1D1D1F`, blanc | `#F5F5F7`, `#1D1D1F` |
| `--seg-on` | segment actif d'un contrôle segmenté (`.seg`), plus clair que sa piste | `--surface` | `#3A3A40` |
| `--side-bg`, `--on-side` | panneau latéral de la connexion et de l'inscription | `--ink-bg`, `--on-ink` | `--fill`, `--text` |

Chaque teinte a trois emplois : `--x` pour un texte ou un trait posé sur une surface, `--x-bg` pour un fond plein portant
du texte blanc (`--on-color`), `--x-soft` pour un fond teinté. Tous ces couples atteignent le contraste AA (4,5:1) ; ils
sont vérifiés par le contrôle automatique décrit plus bas.

**Exception documentée : les couleurs des issues d'un marché à plusieurs issues.** Elles sont écrites dans `js/groups.js`
(`GCOL`), parce que chaque issue garde la même couleur dans le graphique, ses pastilles et sa barre : ambre `#C77700`,
violet `#8B5CF6`, bleu-vert `#0E918C`, rose `#D23D8F`, ardoise `#64748B`, brun `#A3623A`, indigo clair `#7B83EB`.
Aucune n'est le bleu d'accent, le vert ou le rouge (ils portent déjà un sens) ; chacune atteint 3:1 sur `--surface` dans
les deux thèmes. Elles ne servent qu'aux traits, aux points et aux barres : le texte d'une issue reste à l'encre (`--text`).

### Typographie
Une seule famille : la pile système (`--font`). Chiffres tabulaires par la classe `.num`.

| Variable | Taille | Emploi |
|---|---|---|
| `--fs-1` | 12 px | onglets du bas, axes, pastilles |
| `--fs-2` | 14 px | légendes, méta, petits boutons |
| `--fs-3` | 16 px | texte courant, champs, boutons |
| `--fs-4` | 20 px | titre de section, chiffre de carte |
| `--fs-5` | 28 px | titre de page, grand chiffre |
| `--fs-display` | 40 px | chance d'un marché, pari Éclair |
| `--fs-titre` | 28 px (téléphone), 32 px (S), 36 px (M, L) | titre de page (`.ptitle`) |
| `--fs-hero` | 36 à 56 px selon le palier | titre de la présentation de l'accueil pour un visiteur, et lui seul |

Graisses : 400, 500, 600 (`b` et `strong` valent 600). Les titres (20 px et plus) sont resserrés par `--track-title`
(sauf en hébreu, où il vaut 0).

### Espacements, rayons, ombres, durées
- Espacements : `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 ·
  `--sp-10` 40 · `--sp-12` 48 · `--sp-16` 64.
- Rayons : `--r-xs` 4 (barres) · `--r-sm` 8 (pastilles) · `--r-md` 12 (boutons, champs) · `--r-lg` 16 (cartes) ·
  `--r-xl` 20 (fenêtres) · `--r-pill`.
- Ombres : `--shadow-1` (poignée d'un interrupteur), `--shadow-2` (menu, notification), `--shadow-3` (fenêtre).
- Durées : `--dur-1` 150 ms (survol, appui) · `--dur-2` 200 ms (menus, onglets) · `--dur-3` 250 ms (feuilles, fenêtres).
- Mise en page : `--page`, largeur maximale de la page, marges comprises (1 840 px) ; `--gutter`, marge de page ;
  `--col-gap`, gouttière ; `--rail`, colonne latérale ; `--carte-min`, largeur minimale d'une carte (voir « La grille »
  ci-dessous) ; `--bar-h` et `--tab-h` 56 px ; `--bas`, la place prise en bas de l'écran (règle 14) ; `--mbar-h`, la
  hauteur de la barre d'achat fixe d'un marché ; `--tap` 44 px.

### La grille des grands écrans

Une seule grille pour tous les écrans de l'ordinateur, avec trois paliers. Les valeurs sont dans `css/tokens.css` (fin du
fichier) ; les mises en page qui s'en servent, dans `css/base.css` (« La grille des grands écrans »).

| Palier | Largeur de fenêtre | Marge (`--gutter`) | Gouttière (`--col-gap`) | Colonne latérale (`--rail`) | Carte (`--carte-min`) | Titre de page (`--fs-titre`) | Titre de présentation (`--fs-hero`) |
|---|---|---|---|---|---|---|---|
| Téléphone | jusqu'à 879 px | 16 à 24 px (fluide) | 16 px | sous le contenu | une par ligne | 28 px | 36 px |
| S | 880 à 1 279 px | 24 px | 20 px | 300 px | 240 px | 32 px | 44 px |
| M | 1 280 à 1 679 px | 32 px | 24 px | 400 px | 240 px | 36 px | 52 px |
| L | 1 680 px et plus | 40 px | 32 px | 440 px | 280 px | 36 px | 56 px |

La page s'arrête à 1 840 px, marges comprises (1 760 px de contenu sur un écran de 1 920 px). Sur ordinateur, `--fs-1`
vaut 13 px : aucun texte utile n'est plus petit.

Trois mises en page, toutes empilées sur une colonne sur téléphone :

| Classe | Rôle | Exemple |
|---|---|---|
| `.lay-rail` (et les grilles d'écran `.g-home`, `.g-side`, `.g-mkt`, `.g-dep`) | contenu fluide + colonne latérale de largeur `--rail` | accueil : marchés + Éclair et grosses mises ; fiche d'un marché : graphique + ticket |
| `.rail-fixe` | la colonne latérale reste visible au défilement (collée sous l'en-tête, défile seule si elle dépasse) | colonne de l'accueil |
| `.cartes` (et `.board` de l'accueil) | grille de cartes qui ajoute une colonne dès qu'il y a la place d'une carte de `--carte-min` | marchés : 2 colonnes à 1 024 px, 3 à 1 440 px, 4 à 1 920 px |
| `.grille12` + `.s3` à `.s9` | 12 colonnes pour un tableau de bord ; `.sN` occupe N colonnes au palier M et L (au palier S : `.s3` = 4, `.s4` à `.s8` = 6) | portefeuille, profil |

Exemple — un écran avec sa colonne latérale :

```html
<div class="wrap">
  <div class="lay-rail">
    <div class="col">…contenu principal…</div>
    <aside class="col rail-fixe">…colonne latérale…</aside>
  </div>
</div>
```

Quatre façons de composer, introduites par les écrans Communauté (section `[communaute]` de `screens.css`) :

- **Tableau** (classement, annuaire des clans) : chaque ligne est une grille ; les colonnes s'ajoutent selon la largeur
  *du tableau* (requête de conteneur `@container`, avec `container-type:inline-size` sur le tableau), pas selon la
  fenêtre : le même tableau sert en pleine page comme dans une carte. Un nom se tronque, jamais un tag de clan ni un
  chiffre. L'en-tête des colonnes reste sous la barre du site (`position:sticky`) ; le tableau rogne par
  `overflow:clip`, qui ne crée pas de défilement (avec `overflow:hidden`, `sticky` ne colle plus).
- **Pleine hauteur** (live chat, `.tribw`) : la page prend la hauteur de la fenêtre moins l'en-tête ; chaque colonne
  défile seule et le champ du message reste en bas de l'écran.
- **Carrefour** (entrée Communauté, `.hubg`) : des blocs sur 12 colonnes ; une ligne a la hauteur de son bloc au contenu
  fixe (le classement), le bloc qui défile (le chat) ne pèse pas sur elle (`contain:size`).
- **Cartes sur le fond de la page** (amis, copy trading) : la section devient une grille de cartes (`--carte-min`) et
  ses lignes deviennent des cartes ; sur téléphone, la même section reste une liste.

Les anciens noms (`--ink`, `--g2`, `--oui`, `--non`, `--panel`, `--sg`…) restent définis à la fin de `tokens.css` :
le JavaScript des graphiques du Mode Pro et des images partagées les lit encore.

## 4. Les composants

| Composant | Classes | Notes |
|---|---|---|
| Bouton | `btn` + `b-pri` (principal), `b-yes` / `b-no` (Oui / Non), `b-yes-soft` / `b-no-soft` (listes), `b-ink` (secondaire gris), `b-white` (gris clair), `b-ghost` (contour) ; tailles `sm`, `lg` ; `full` | une seule `b-pri` par écran |
| Lien | `link` | accent |
| Champ | `field` (étiquette + `input`, `select`, `textarea`), `amt` (montant), `pw` (mot de passe), `err` | 48 px de haut, 16 px de texte |
| Choix | `chk` (case), `tgl` + `sl` ou `sw` (interrupteur), `range`, `presets` | |
| Onglets | `tabs` (soulignés), `utabs` (avec filet), `subnav` (sous-navigation d'une destination) | l'état actif est la classe `on` |
| Contrôle segmenté | `seg` | deux à quatre choix courts |
| Pastille | `chip` dans `chips` ; `xpc`, `demo-b`, `cnt2` (compteur), `lk` (verrou) | |
| Carte | `pn`, avec `pad` | ni bordure ni ombre |
| Ligne | `line` dans `calc` (libellé / valeur), `mrow` dans `menu-l` (ligne de menu), `lockrow`, `pickl` | |
| Message | `limit` (information, `over` pour une erreur), `warn`, `note`, `empty` (état vide) | |
| Détail à la demande | `<details class="tdet">`, sections `.repli` (posées par `js/refonte.js`) | l'essentiel reste visible |
| Fenêtre | `ov` > `modal` > `md` (`md-h`, `md-acts`) ; bouton `x` | feuille en bas sur téléphone |
| Panneau flottant | `npanel` (notifications), `umenu` (menu du compte) | |
| Notification | `toasts` > `toast` (`blue`, `green`, `red`, `amber`) | |
| Navigation | `top` (en-tête), `nav`, `tabbar` (téléphone), `search` | 5 destinations |

Exemple — une carte avec une action :

```html
<section class="pn pad">
  <div class="h2">Titre de la carte</div>
  <p class="sub">Une ligne d'explication.</p>
  <div class="calc mt-4">
    <div class="line"><span>Libellé</span><b>12,50 $</b></div>
  </div>
  <button class="btn b-pri lg full mt-4" data-a="mon-action">Valider</button>
</section>
```

Utilitaires de `base.css` : tailles `t-1` à `t-5`, graisses `fw-5` `fw-6`, couleurs `c-1` `c-2` `c-3` `c-yes` `c-no`
`c-accent`, marges `mt-1` à `mt-6`, `mb-1` à `mb-4`, `w-full`, `d-block`, `ta-c`, `ta-s`, `clip`, `row-c`, `grow`.
Ils remplacent les styles en ligne ; un gabarit ne doit plus contenir de `style="…"`, sauf pour une valeur calculée
(largeur d'une barre, couleur d'un avatar).

## 5. Ajouter un écran

1. Écrire la fonction de rendu (un gabarit qui commence par `<div class="wrap">`) et l'inscrire dans `VIEWS`.
2. Le rattacher à l'une des cinq destinations : ajouter son nom à l'attribut `data-nav` du lien de l'en-tête **et** de la
   barre d'onglets (`index.html`).
3. Composer avec les composants ci-dessus. Les styles propres à l'écran vont dans une section de `screens.css`.
4. Chaque texte passe par `_t()` ; ajouter les deux traductions dans `js/i18n-4.js`.
5. Vérifier : `CHROME=1 npx playwright test`, puis l'écran en clair et en sombre, connecté et déconnecté, en français,
   en anglais et en hébreu, à 320, 390, 768 et 1440 px. Élargir la fenêtre de 320 à 1920 px : rien ne doit déborder
   ni se couper, à aucune largeur.

## 6. Contrôles

- `npx playwright test` : 397 scénarios (back, écrans sur ordinateur et téléphone), lancés sur chaque pull request.
  Dont `tests/refonte/parcours.spec.mjs` (parcours de la navigation, de l'en-tête de départ, des libellés, de la langue,
  des montants) et `tests/refonte/responsive.spec.mjs` (12 écrans, de 320 à 1920 px et en paysage : pas de défilement
  horizontal, en-tête et barre d'onglets entiers, champs en 16 px sur téléphone).
- Contrôle automatique des écrans (contraste AA de chaque texte, débordement, texte coupé, tailles de texte, cibles
  tactiles de 44 px, éléments masqués par une barre fixe) : principe décrit dans `docs/REFONTE.md` (sections 8 et
  « Seconde passe »), à relancer après un changement de couleur ou de mise en page.
