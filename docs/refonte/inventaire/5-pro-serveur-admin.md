# Inventaire avant refonte — Mode Pro, mode serveur, outils de démonstration, administration

Relevé par l'agent `ecc:code-explorer` sur le commit `8b4489f`. Fichiers : `js/pro.js` (p1), `js/pro2.js` (p2),
`js/demo.js` (d), `js/serveur.js` (s), `js/admin.js` (a), `admin.html`. `js/engine.js` et `js/api.js` n'affichent rien.

## A. Mode Pro

- **Ouverture** : bouton `button.pro-open[data-a="pro-open"]` dans `chartToolsH` (auth.js:148), visible pour tous. Autre
  entrée : `pro-view` sur une carte d'analyse dans un chat (lecture seule). `proOpen` (p2:120) ajoute
  `<div id="pro" class="pro [ro] [notools]" role="dialog">` à `<body>` et pose `html.pro-lock`. Le bouton retour du
  navigateur, Échap ou `pro-close` le ferment.
- **Structure** (p2:124-130) : `.pro-top` (retour `.pro-back`, titre ou `select[data-pro-out]` pour changer d'issue, prix
  `data-mp`, boutons Oui / Non `bet` + « Vendre » `pro-sell`, partage `.pro-shareb`) ; `.pro-bar` (périodes `.seg.pro-iv`,
  type `.pro-type`, côté `.pro-side`, bouton indicateurs `.pro-indb`, bouton outils `.pro-toolb`) ; `.pro-body` (outils
  `nav.pro-tools`, scène `.pro-stage` avec `canvas.pro-cv`, légende `.pro-leg`, barre flottante `.pro-float`, zoom
  `.pro-zoom`, panneau `aside.pro-pan`) ; pied `.pro-foot > .pro-buy.foot`.
- **Fonctions** : `pro-open`, `pro-close`, `pro-goto`, `pro-sell`, `bet` ; `pro-iv` (1m, 5m, 15m, 1h, 4h, 1d, 1w, max),
  `pro-type` (courbe / bougies), `pro-side` (oui / non), `pro-zoom` (in / out / reset) ; indicateurs (SMA, EMA, Bollinger,
  VWAP, RSI, MACD) : `pro-panel`, `pro-ind-add`, `pro-ind-swap`, `pro-ind-del`, `pro-ind-eye`, `pro-ind-col`,
  `pro-ind-w`, `pro-ind-anc`, `pro-leg-more`, `pro-perks` ; outils de dessin (curseur, ligne de tendance, horizontale,
  verticale, zone, flèche, texte, repère de probabilité) : `pro-tool`, `pro-tools-toggle`, formulaire
  `data-form="pro-txt"` ; objets : `pro-obj-sel`, `pro-obj-eye`, `pro-obj-del`, `pro-hide-all`, `pro-clear`, `pro-dr-col`,
  `pro-dr-w`, `pro-dr-txt`, `pro-dr-eye`, `pro-dr-del`, `pro-dr-none`, `pro-tip-x` ; `demo-rank-open` (démo).
  Gestes : molette, pincement, glisser, double-clic, flèches, `+` / `-`.
- **Limite selon le rang** : nombre d'indicateurs affichés en même temps, `PRO_SLOTS=[1,1,2,2,3,3,3,3,∞]` (p1:148). Un
  indicateur en trop → bandeau `.pp-lock` avec « Remplacer X par Y » et « Découvrir les avantages des rangs ».
- **Dessin** : un seul peintre `proPaint` (p1:214) pour le canvas, l'aperçu SVG et l'image de partage. Les couleurs du
  thème sont lues par `PVAR` (p1:171) dans les variables CSS **`--ink --g2 --g3 --g4 --rule --soft2 --panel --bg --oui
  --non --gain --loss --be`** : ces noms doivent être conservés, ou `PVAR` mis à jour. La police vient de
  `getComputedStyle(body).fontFamily` et de `cssVar('--sg')`. Le cache est vidé quand `data-theme` change.
- **Couleurs en dur** : indicateurs (p1:122-127) SMA `#F59A0B`, EMA `#7A5AF8`, Bollinger `#12A150`, VWAP `#D92D20`, RSI
  `#7A5AF8`, MACD `#2448FF` ; palette de choix `PCOL` (p1:168) ; image de partage à palette sombre fixe `PRO_IMG` (d:73).
- **Partage d'analyse** : `pro-share` → modale `.md.pro-sh` (aperçu, commentaire `textarea[data-psh-txt]`, destinations
  `pro-sh-dst` : chat général, chat du marché, mon clan, message privé `pro-sh-dm` ; option image `pro-sh-img` ; envoi
  `pro-sh-send`). Carte dans le chat `anaCardH` (d:18). Lecture seule avec `pro-fork` « Créer mon analyse à partir de
  celle-ci ». Mode serveur : `srvAnaPartager`.

## B. Mode serveur (`serveur.js`)

- **Un seul écran construit** : `ecranErreurServeur` (s:1226) — « Connexion au serveur impossible », « Ton compte est
  intact… », boutons `srv-retry` (« Réessayer ») et `srv-demo` (« Passer en mode démo »).
- **Session expirée** : retour à la connexion + toast. **Compte suspendu** et **auto-exclusion** : note affichée sur
  l'écran de connexion (`S.ui.authNote`).
- **« Bientôt disponible avec ton compte »** : toast de `srvBientot` (s:128). Actions bloquées (`SRV_BLOQUE` s:123-126) :
  `limit-place ord-cancel guard guard-save guard-del cl-sim wallet wallet-modal demo-login demo-rank demo-rank-open
  demo-rank-reset`.
- **Erreurs** : `srvErreur` (s:118) affiche un toast rouge « Action impossible » avec le texte de `ERR_TXT` (s:15-115,
  100 codes). Dans les formulaires de connexion et d'inscription, le message s'écrit dans le formulaire. Ni bandeau ni
  modale d'erreur. **Aucun écran de chargement** : seulement « Connexion… », « Création du compte… » et des boutons
  désactivés.
- **Notifications** : `NOTIF_T` (s:140-196, 55 codes) traduit dans la langue du lecteur.

## C. Outils de démonstration (`demo.js:189-215`)

- « Changer de rang » : section `demoRankH` sur la page Rang, entrée `demo-rank-open` dans le menu du compte, modale
  `demoRankModal` (un bouton `demo-rank` par rang, `demo-rank-reset`). Démo seulement (bloqué en mode serveur).
- Pastilles `demoB` / `demoHint`.

## D. Panel d'administration

- `admin.html` (57 lignes) : feuille de style **embarquée** de 39 lignes, aucune feuille partagée avec le site ; thème
  sombre par `prefers-color-scheme` (et non par `data-theme`) ; scripts `js/api.js` et `js/admin.js` seulement ; tout en
  français, non traduit.
- Éléments fixes : `header`, `nav#adm-nav`, `main#adm-main`, `div#adm-msg` (retour vert ou rouge, 6 s).
- **Accès** : hors mode serveur → formulaire de connexion ; non administrateur → carte « Accès réservé » ; le serveur
  revérifie chaque appel.
- **Onglets** (a:26) : Chiffres (12 chiffres), Joueurs (recherche, fiche, formulaires solde / XP / rang / suspension,
  tableau « Dernières opérations »), Marchés (liste, création / modification, résolution), Chat (masquer un message),
  Bots (intensité, bavardage), Journal.
- **Formulaires** `data-f` : chercher, solde, xp, suspendre, marche, bots, connexion. **Actions** `data-a` : fiche, rang,
  kyc, lever, editer, annuler-edition, etat, resoudre, masquer, bots-actif, deconnexion. Confirmation en deux clics pour
  `data-confirme`.
- **Classes propres** : `.carte .grille .chiffre .ligne .rang .actions .puce .vide .plus .moins .pr .danger` ;
  identifiants `#adm-msg #adm-main #adm-nav #adm-qui #ar-t #adm-fiche #adm-refus`. Attributs `data-v="solde|xp|rang|kyc|
  susp|bots"` utilisés par les tests.

## E. Contrat DOM (essentiel)

- **Mode Pro** : `#pro`, `.pro-stage` (son seul enfant dimensionné doit rester le `<canvas>`), `data-plo`, `data-plv`,
  `data-procnt`, `data-prodn`, `data-pin` + `data-k`, `data-pro-out`, `data-protxt`, `data-psh-txt` ; classes `.ro`,
  `.notools`, `.pan`, `.pro-bar`, `.pro-tools`, `.pro-pan`, `.pro-float`, `.pro-leg`, `.pro-back`, `.pro-buy` (`has3`),
  `.pro-scroll`, `.pro-iv`, `.pro-row2`, `.pp-ind`, `.arm`, `.all`.
- **Sur `<html>`** : `pro-lock`, `data-theme` (observé).
- **Mode serveur** : `[data-a="buy"]`, `[data-a="sell"]`, `[data-liq]`, `.feed[data-room]`, `[data-hcmini]`,
  `[data-prv]`, `[data-prb]`, `[data-prc]`, `[data-cp-existing]`, `[type=submit]`.

## F. Problèmes relevés

- **Mode Pro surchargé sur téléphone** : plus de 25 contrôles visibles (8 périodes, 2 types, 2 côtés, 7 outils, zoom,
  légende, achat en haut **et** en bas, partage).
- **Doublons** : œil et suppression d'un indicateur ou d'un tracé à deux endroits ; boutons Oui / Non / Vendre en haut et
  en bas.
- **Libellés** : « Graphique classique » contre « Mode Pro » sans explication ; « Max » ; « Outils », « Mes tracés » pour
  les mêmes objets ; ponctuation inégale des messages d'erreur.
- **Administration** : onglet Joueurs très long ; codes bruts dans le journal quand l'action est inconnue.
- **Styles en ligne** : pro2.js 7 (dynamiques), serveur.js 3, admin.js 12.
- **Emojis** : réactions simulées 🎯 🔥 👀 dans les chats (démo). Aucun ailleurs.
