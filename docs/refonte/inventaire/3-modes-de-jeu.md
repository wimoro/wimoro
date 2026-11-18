# Inventaire avant refonte — modes de jeu

Relevé par l'agent `ecc:code-explorer` sur le commit `8b4489f`. Fichiers : `js/flash.js` (Éclair), `js/blitz.js` (Blitz et
Série), `js/duels.js` (duels et duels de stack), `js/combos.js` (combinés). `js/moteur-eclair.js` ne touche pas à l'écran.

Aucun verrou de rang ni de KYC dans ces fichiers. Seules différences selon le rang : remise de frais au rang 5 et plus,
barre « Victoires pour débloquer Platine » sous le rang 4. Une pause de jeu responsable bloque les mises (`rgBlocked`).
Routes protégées : `duels`, `combines`. Publiques : `eclair`, `blitz`, `serie`, `duel`.

## A. Écrans

### `#eclair` — `vFlash` (flash.js:256)
Parier Haut / Bas / Break even sur une manche de 45 s (30 s de mises, 15 s de résultat).
1. `bzModesH('eclair')` (blitz.js:80) : `.bzmodes`, 3 liens Éclair / Blitz / Série.
2. `clanWarBarH()` (si guerre de clans).
3. `section.pn.pad.flash-card[data-flashcard]` :
   - `.fl-top` : catégories `.fpills` (`fcat`) doublées d'un `select[data-fcatsel]` sur mobile ; `.seg.fmode` (`fmode`
     rotation / libre) + aide `fhelp` (`p#fmode-h`).
   - `.tabs.fl-tabs` (mode Libre) : `fgame`.
   - `.fl-h` : accroche (`i.live`, actif `[data-fx=asset]`, pastille « Vedette »), `h1[data-fx=q]`, anneau
     `.ring[data-fx=ring]` avec `b[data-fx=secs]`.
   - `.fl-price` (`[data-fx=price]`, `[data-fx=chg]`), `.chtools.fl` (courbe / bougies `ctype`), `.fl-chart[data-fx=chart]`,
     `.fl-phase[data-fx=phase]`.
   - `.fl-amts` (`flash-amt` 5 / 10 / 25 / 50 / 100) et `.fl-sides` (3 boutons `.fsd` `flash-bet` oui / non / be), bouton
     `duel-open`.
   - `.fl-my[data-fx=my]` (ma mise), `.fl-pool` (3 cagnottes), « Volume de la manche » (`.trail[data-trail=flash]`).
   - Superposition `.flres` (résultat, 2,8 s).
4. Colonne de droite : `section.fl-bet[data-flbet]` (mise et boutons au-delà de 1100 px), « Prochains paris vedettes »
   (`falert`), amis `[data-ffr]`, alertes `[data-falerts]`, « Tes manches » (4 chiffres + objectif), « Dernières manches »
   (`[data-fx=hist]`), « Comment ça marche » (4 points).

États : visiteur → `flash-bet`, `fmode`, `falert` ouvrent la connexion. Phases : ouvert, fermé (verrou), résultat. Mode
événement (tennis, basket, foot) : tableau de score à la place du graphique. Vide : « Pas encore de manche terminée ».
Mode serveur : `srvEclairMiser`. Carte d'accueil : `flashTeaserH` (flash.js:253).

### `#blitz` — `vBlitz` (blitz.js:102)
Tournoi Blitz Royale. `.bzmodes` ; `section[data-bzcard]` (`bzCardH` blitz.js:85) en 3 états : **lobby** (compte à
rebours, buy-in, cagnotte, inscrits, bouton `bz-join`), **live** (`.bzcard.onair` : manche, barre, prix, statut, graphique,
phase, 3 boutons `bz-choose`, volume, joueurs, journal ; `bz-rebuy` si rachat possible), **done** (résultat). Puis
« Comment ça marche » (5 points), « Derniers Blitz », chat `blitz`.

### `#serie` — `vSerie` (blitz.js:172)
Jeu solo. `section[data-srcard]` : **préparation** (actif `sr-gid`, mise `sr-stake`, calcul, bouton `sr-start`, dernière
série + `sr-share`), **en cours** (stack, prix, graphique, 3 boutons `sr-play`, `sr-cash` pour encaisser, journal). Puis
« Comment ça marche », « Les plus longues séries du jour ». Modale de partage (image).

### `#duels` — `vDuels` (duels.js:159)
`.pagehead` (boutons `duel-open`, `stack-open`), onglets `dtab` (en cours / terminés), cartes `.dcard` (statuts : en
attente, défi reçu, en cours, gagné, perdu, annulé, expiré, décliné), `.empty`. À côté : « Duels de stack », « Comment ça
marche ». Modales : Défier (`duelModalH` duels.js:133 : marché `select#dlm`, camp `dl-side`, mise `dl-stake`, adversaire
`dl-opp`, `dl-create`), stack (`stk-buyin`, `stk-opp`, `stk-create`), partage.

### `#duel-<id>` et `#duel-lien` — `vDuel` (duels.js:167)
Face-à-face `.dvs` (2 camps), étapes `.dsteps`, calcul, preuve, puis selon le cas : `dl-login` (visiteur invité),
`dl-accept` + `dl-decline`, `dl-share` + `dl-cancel`, ou `dl-share`. À côté : règle du marché, séquestre et résolution.
Introuvable → « Duel introuvable ». Lien d'invitation `?d=…`.

### `#combines` — `vCombos` (combos.js:86)
`.pagehead` (bouton `cb-open`), onglets `cb-tab`, cartes `.cbcard` (sélections, valeur du moment `[data-cbval]`, bouton
`cb-cash`), `.empty`. À côté : « Comment ça marche », « Mise et limites ». Modale combiné (`comboModalH` combos.js:64 :
sélections `cb-rm`, mise `cb-stake` + `input[data-cb=stake]`, calcul, `cb-place`). Barre fixe `#slipbar` (ajoutée à
`<body>`, visible dès une sélection : `cb-open`, `cb-clear`). L'ajout se fait par `cb-add` depuis le ticket d'un marché.

## B. Règles à expliquer à un nouveau venu (d'après le code)

- **Éclair** : une manche dure 45 s. On mise 5 à 100 $ pendant les 30 premières secondes sur Haut, Bas ou Break even.
  Les gagnants se partagent les mises des perdants.
- **Break even (« BE »)** : le prix finit presque inchangé ; rare et très bien payé. « BE » apparaît abrégé dans les
  journaux du Blitz et de la Série (blitz.js:100, 171).
- **Rotation / Libre** : en rotation, un seul pari vedette change à chaque manche ; en Libre, on choisit parmi tous.
- **Blitz Royale** : tournoi à buy-in, 10 manches de 60 s sur le Bitcoin ; une mauvaise réponse élimine ; les survivants se
  partagent la cagnotte. Rachat possible une fois, si éliminé à la première manche.
- **La Série** : seul, chaque bonne réponse multiplie la mise ; on encaisse quand on veut, une erreur fait tout perdre.
- **Duel** : défi à deux sur un marché ou une manche Éclair ; les deux mises sont bloquées, le gagnant prend tout.
- **Duel de stack** : même buy-in, 1 000 jetons chacun pendant 7 jours ; le plus gros stack gagne.
- **Combiné** : 2 à 6 sélections sur des marchés différents ; les cotes se multiplient ; tout doit gagner. Encaissement
  anticipé possible.
- Non expliqués à l'écran aujourd'hui : le « ¢ » (prix d'un camp, 100 ¢ = 1 $), le « × estimé », « Vedette ».

## C. Contrat DOM (essentiel)

- **Éclair, mis à jour toutes les 250 ms** (`updateFlash` flash.js:280-300) : éléments `[data-fx=…]` = price, chg, secs,
  ring, rph, round, players, po, pn, mxo, mxn, pe, mult, bed, phase, split, poolo, pooln, poole, my, chart, spark, next,
  q, asset, nextmini, wins, streak, best, fprofit, hist, goal, goalbar. Aussi `data-flashcard`, `data-fg`, `data-fa`,
  `data-fgtab`, `data-fcatsel`, `data-fpref`, `data-trail="flash"`, `data-cdur="flash"`, `#fmode-h`.
- **Classes réécrites par le code** : `fl-my` / `has` / `res` / `kn` ; `delta up|dn` ; `num pl-up|pl-dn` ; `.lockd` (anneau) ;
  `.ev` ; `.swap` ; `.has` ; `.flres` (+ `win`, `lose`, `eq`) ; `.fsd.on` ; `.fl-phase.open`.
- **Graphique** : la hauteur est lue sur `.fl-chart:not(.spark) svg` ; `fxChart` (flash.js:278) relit le SVG par
  expression régulière : la forme `<path class="ln" d="…" style="stroke:…"/>` est contractuelle.
- **Seuil codé en dur** : `innerWidth > 1100` déplace la mise et les boutons dans la colonne de droite (flash.js:257).
- **Blitz / Série** : `[data-bzcard]`, `[data-bz=cd|pot|n|bar|price|chg|share|alive|chart|phase|vol|round]`,
  `[data-srcard]`, `[data-sr=cd|cd2|bar|price|chg|chart|vol]`.
- **Duels** : `#ov .md`, `#ov .calc`, `[data-dl=m|stake]`, `#dlm` ; les routes `duels` et `duel` doivent garder le préfixe
  `duel`. **Combinés** : `#slipbar`, `.ov .md`, `[data-cb=calc|btn|stake]`, `[data-cbval]`, `[data-cbcur]`, `.cb-cash`.
- **Sur `<body>`** : `pg-flash`, `has-slip`.

## D. Styles et couleurs en dur

- `style="…"` : flash.js 18, duels.js 16, blitz.js 10, combos.js 7.
- Trait du graphique Éclair : `#2448FF` (hausse) / `#F59A0B` (baisse), flash.js:218. Icônes `ic(…,'#fff')` nombreuses.
- Images de partage (canvas) à couleurs fixes : duels.js:112-126, blitz.js:180-189.
- Animations : `.swap` 0,45 s ; `.flres` 0,25 à 0,28 s ; anneau 0,25 s ; confettis.

## E. Problèmes relevés

- **Éclair surchargé** : 6 catégories + liste déroulante, bascule de mode + aide, titre, anneau, prix, bascule courbe /
  bougies, graphique, phase, 5 montants, 3 boutons, ma mise, 3 cagnottes, volume ; et 6 sections à droite.
- **Doublons** : catégories en pastilles et en liste ; explication du mode à 4 endroits ; « +10 XP par mise, +40 XP si tu
  gagnes » à 2 endroits ; bouton « Défier un ami » à 3 endroits.
- **Libellés ambigus** : « Libre » (écran) contre « parallèle » (texte) ; « Haut / Bas » contre « Plus haut / Plus bas » ;
  « BE » contre « Break even » ; « Stack » (2 sens) ; « Cagnotte » (4 sens) ; « Série » (le jeu, et la série de
  victoires) ; « Vedette » présenté comme une pastille d'XP.
- **Navigation** : « Éclair » regroupe aussi Blitz et Série ; Duels et Combinés n'ont pas d'entrée propre (sous Profil).
- **À déplier** : amis, alertes, statistiques, historique, « Comment ça marche », journaux, volume de la manche.
- **Emojis** : aucun comme icône dans ces fichiers.
