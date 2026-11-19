# Inventaire avant refonte — clans, copy trading, ordres, marchés à plusieurs issues

Relevé par l'agent `ecc:code-explorer` sur le commit `8b4489f`. Fichiers : `js/clans.js`, `js/copy.js`, `js/orders.js`,
`js/groups.js`. Ces fichiers enveloppent des fonctions communes (`placeBet`, `sellPos`, `flashBet`, `updateMarket`,
`FORMS.profile`, `save`) : ne pas toucher à l'ordre de chargement.

## A. Écrans

### `#clans` — `vClans` (clans.js:150)
Annuaire public. Blocs :
1. `nav.seg.hubsw` : bascule Clans / Joueurs (`hubSwH` clans.js:231).
2. `.pagehead` : titre, texte, bouton « Mon clan » (membre) ou `cl-create-open`.
3. `.clsim` : bascule de démonstration `cl-sim` (12 clans / 100 clans).
4. `.g-side.clg` : onglets `cl-tab` — **annuaire** (filtres `select[data-clf=div|lang|cat]`, 40 lignes `a.clrow`),
   **classement** (divisions `cl-div` ou classement mondial, tableau `.cltable`, top 3), **règles** (6 paragraphes). À
   côté : « Mon clan » ou « Clan recommandé », « Rejoindre avec un code » (`form[data-form=clcode]`), « Créer ton clan ».

États : visiteur → créer demande une connexion. Création impossible (déjà membre, rang inférieur à 2, compte de moins de
14 jours, solde inférieur à 50 $) → toast avec le motif. Filtres sans résultat → liste vide sans message.

### `#clan-<id>` — `vClan` (clans.js:181)
1. `.pagehead.clph` : fil d'Ariane, emblème, nom + tag `.ctg`, position ; boutons selon le cas : copier le code,
   `cl-share`, `cl-leave` (membre) ; `cl-join`, `cl-apply`, ou bouton désactivé (non-membre).
2. Onglets `cl-ctab` : **activité** (fil `.clfeed`, case `cl-feedopt`, appels de clan avec bouton `bet`, `cl-call-open`
   pour un officier), **semaine** (classement interne), **chat**, **membres** (`cl-promote`, `cl-kick`, `cl-invite`),
   **positions**, **guerre** (`cl-war`, `cl-war-join`, guerres passées), **infos**.
3. À côté : « Score du mois », « Ta contribution ».

Rôles : membre, officier (appels, exclusion, invitation), chef (promotion, guerre). Modales : quitter (`cl-leave-do`),
appel de clan (`clanCallModal` clans.js:201), image de récap (`clanShare`). L'onglet choisi reste mémorisé d'un clan à
l'autre.

### Modale « Créer un clan » (clans.js:165)
`form[data-form=clan]` : nom `#cln`, tag `#clt`, description `#cld`, rang minimum `#clr`, emblème `clc-ic`, couleur
`clc-col`, langues `clc-lang`, catégories `clc-cat`, accès `clc-access`, frais de 50 $. Chaque clic réécrit la modale.

### `#copie` — `vCopy` (copy.js:284, protégé)
Fil d'Ariane, titre ; si rang inférieur à 3 : panneau de verrou `.cp-lockp`. Corps `[data-copyroot]` : 3 chiffres, « Mes
copies » (`cp-manage`), « Tes copieurs », « Joueurs à copier », « Copies terminées ».
Modales : réglages `copyModalH` (copy.js:217 : budget, mode fixe / proportionnel, catégories, arrêt de perte, case
« copier les positions existantes », résumé, `cp-start`) ; gérer (`cp-edit`, `cp-pause`, `cp-stop`) ; arrêter
(`cp-stop-do`).

### `#marche-<groupe>` — `vGroup` (groups.js:46)
Marché à plusieurs issues (`presid27`, `ldc27`, `crypto2`). En-tête, actions (`duel-open`, `copylink`, `watch`),
`pro-open`, graphique `.gchart[data-gchart]` (5 premières issues), tableau `.orows` (une ligne `.orow` par issue avec
2 boutons `bet`), panneau « Tes positions sur ce marché » ou « Comment ça marche », chat, règles. Pas de ticket permanent.

### `#marche-<groupe>-<issue>`
Page de marché ordinaire avec un fil d'Ariane à 3 niveaux et la mention « N issues ».

## B. Ce que ces fichiers ajoutent ailleurs

- **Ticket de pari** (orders.js) : type d'ordre `.seg.otype` (`otype` : au marché / limite) ; en limite, champ
  `input[data-tlp]` avec `lpstep` (±1) et raccourcis `lpset` ; calcul `limitCalcH` et bouton `limit-place`. Boîte « Tes
  ordres en attente » `[data-ordbox]` (`ord-cancel`). Dans le profil : `ordersTableH`.
- **Protection d'une position** : étiquette `.gtag` (« SL 40 ¢ · TP 80 ¢ »), bouton `guard`, modale « Protéger ma
  position » (`input[data-gd=stop|tp]`, raccourcis `guard-set`, `guard-save`, `guard-del`).
- **Mode serveur** : `limit-place`, `ord-cancel`, `guard`, `guard-save`, `guard-del` sont bloqués (« Bientôt disponible
  avec ton compte »), mais l'interface s'affiche jusqu'au dernier clic.
- **Ligne de clan dans le ticket** : `.line.tclan[data-c=clan]`.
- **Fiche d'un joueur** : `copyCardH` (`[data-cpcard]`, bouton `cp-open` ou verrou) ; profil privé → `vPlayerLocked`.
- **Mon profil** : pastille public / privé, lien `#copie`, carte de clan. **Modifier** : section Confidentialité.
- **Tag de clan** `tagH` à côté des pseudos (chat, profil, duels, éclair) + infobulle `ctip` ajoutée à `<body>`.
- **Accueil** : carte de clan `clanCardH('home')` (`[data-clhome]`). **Éclair** : bandeau de guerre `a.clwarbar`.
- **Chat** : salon `clan:<id>`.

## C. Contrat DOM (essentiel)

- **Clans** : `data-clf`, `data-clerr`, `#cln #clt #cld #clr #clcm`, `data-clcs`, `data-tip`, `data-clhome`,
  `data-unread="clan:<id>"`, champs `name`, `tag`, `desc`, `minRank`, `code`.
- **Copie** : `data-cp=budget|per|pct|cap`, `#cpb #cpp #cpc #cpx`, `data-cppct`, `data-cpcats`, `data-cpstop`,
  `data-cp-existing`, `data-cpsum`, `data-cpgo`, `data-copyroot`, `data-cpcard`, `data-pepriv`.
- **Ordres** : `data-tlp`, `data-gd`, `data-ghint`, `data-gsum`, `data-gsave`, `data-ordbox` (attribut `hidden`),
  `data-posbox`.
- **Groupes** : `data-gsum`, `data-obar` (l'enfant `<i>` reçoit la largeur), `data-gchart`.
- **Classes servant de crochets** : `.on`, `.ctg`, `.ctip`, `.tch`, `.sd`, `.modal`, `.chip`, `.gp`, `.gpre`, `.feed`,
  `.tclan`, `.gtag`, `.cptag`. Deux boutons « Quitter le clan » (`.cl-leave-h`, `.cl-leave-m`) sont arbitrés par le CSS.

## D. Styles et couleurs en dur

- `style="…"` : clans.js 30, copy.js 10, groups.js 10, orders.js 5.
- Palette d'emblèmes de clan `CL_COLS` (clans.js:33), 10 couleurs — **un clan enregistre sa couleur** : à ne pas changer.
- Palette des issues `GCOL` (groups.js:12) : `#2448FF #F59A0B #12A150 #7350E3 #E11D74 #0E9AA7 #8D94A0` (courbes).
- Doré du top 3 : `#C08A12`. Image de récap : fond `#0F1115`.

## E. Vocabulaire et problèmes relevés

- **Termes** : clan (50 joueurs au plus, un tag à côté du pseudo) ; division (groupe de 20 clans, la division 1 est la plus
  haute) ; score du mois = XP de clan × coefficient ; guerre de clans (48 h, buy-in de 20 $) ; appel de clan (un officier
  épingle un marché et un côté) ; copy trading (reproduire automatiquement les paris d'un joueur) ; copieur ; ordre limite
  (prix maximum à l'achat, minimum à la vente) ; stop loss / take profit (vente automatique) ; issue (une des réponses
  d'un marché à plusieurs issues). « SL / TP » restent en anglais abrégé dans l'étiquette.
- **Doublons** : quatre « classements » (joueurs, clans du mois, semaine du clan, mondial) ; « Mon clan » à 7 endroits ;
  « Copie », « Copy trading », « Copier » pour la même fonction ; « Arrêt de perte » (copie) et « Stop loss » (ordres).
- **Écrans surchargés** : fiche de clan (7 onglets + 2 panneaux) ; règles des clans (environ 400 mots) ; modale de copie
  (7 blocs + note longue) ; modale de protection (explications à 3 endroits).
- **Emojis** : « 🏆 » dans le classement mondial des clans (clans.js:155), flèches « ↑ » « ↓ » en texte pour montée et
  descente ; « 🔥 » comme réaction dans un message d'exemple (groups.js:70).
- **Code mort** : `clanTopH` (clans.js:232).
