# Où apparaissent les noms de rangs

Relevé fait le 19 nov. 2026 (troisième passe, partie C), **sans rien changer**. Il sert à préparer un éventuel
changement de noms. Les neuf rangs : Fer, Bronze, Argent, Or, Platine, Diamant, Ascendant, Immortel, Radiant, chacun en
trois divisions (I, II, III), sauf Radiant.

## 1. La source unique : `js/core.js`, lignes 70 à 78

`TIERS` porte l'identifiant, le nom, les deux couleurs de l'emblème et les conditions de chaque rang ; `DIV_XP` (ligne 80)
porte les seuils d'XP ; `rankName(t, d)` (ligne 82) compose « Or II ». Tout écran qui affiche un rang passe par là :
**54 appels** à `rankName()` ou `TIERS[…].name`, dans `views.js` (20), `pro2.js` (6), `clans.js` (6), `core.js` (5),
`demo.js` (4), `copy.js` (4), `auth.js` (4), `serveur.js` (2), `responsible.js`, `referral.js`, `blitz.js` (1 chacun).
Changer un nom dans `TIERS` (et dans les catalogues, § 3) le change donc partout à l'écran.

| Rang | Français | Anglais | Hébreu |
|---|---|---|---|
| 0 | Fer | Iron | ברזל |
| 1 | Bronze | Bronze | ברונזה |
| 2 | Argent | Silver | כסף |
| 3 | Or | Gold | זהב |
| 4 | Platine | Platinum | פלטינה |
| 5 | Diamant | Diamond | יהלום |
| 6 | Ascendant | Ascendant | עולה |
| 7 | Immortel | Immortal | אלמותי |
| 8 | Radiant | Radiant | זוהר |

## 2. Les textes qui écrivent un nom de rang en toutes lettres

Ils ne passent pas par `TIERS` : il faudrait les réécrire un par un.

| Fichier | Ligne | Texte (français) |
|---|---:|---|
| `js/auth.js` | 18 | « Créer un pari se débloque au rang Or. Clique pour voir ce qu'il te manque. » |
| `js/auth.js` | 22 | « Réservé aux joueurs Immortel et Radiant. » |
| `js/auth.js` | 46 | « Des rangs de Fer à Radiant, qui débloquent les fonctions. » |
| `js/auth.js` | 55 | « Utiliser le compte démo (User26, Or II) » |
| `js/auth.js` | 62 | « Une minute, et tu commences au rang Fer I. » |
| `js/auth.js` | 110 | « Tu commences au rang Fer I » ; « Pour passer **Bronze** : 300 XP et 3 paris réglés… » |
| `js/auth.js` | 111 | « Tu es passé Fer II. Bravo ! » |
| `js/auth.js` | 276 | « Chaque pari rapporte de l'XP et te fait monter, de Fer à Radiant. » |
| `js/core.js` | 217 | « Plus que 110 XP pour passer Or III. » (notification d'exemple du compte démo) |
| `js/core.js` | 285 | messages d'exemple du chat : « Plus que 200 XP pour Immortel… », « Je viens de passer Platine… » |
| `js/core.js` | 294 | « lea vient de passer Radiant » (message d'exemple) |
| `js/flash.js` | 250 | « Victoires pour débloquer Platine » |
| `js/pro2.js` | 174 | « Rang Radiant : ajoute autant d'indicateurs que tu veux… » |
| `js/views.js` | 47 | pastille « Argent » sur « Suivre cette mise » |
| `js/views.js` | 164 | « −10 % dès Diamant » (ligne des frais du ticket) |
| `js/views.js` | 232 | « Ton avis s'affichera ici quand tu seras Radiant. » |
| `js/views.js` | 247, 250, 252 | salon VIP : « Le salon des Ascendant, Immortel et Radiant… », « Réservé au rang Ascendant » |
| `js/views.js` | 270 | classement : « …et le rang Radiant pour le top 100. » |
| `js/views.js` | 288 | page Rang : « …Radiant… » |
| `js/views.js` | 289 | page Rang : « Du Fer au Radiant, trois divisions par rang… » |
| `js/clans.js` | 27 | divisions des clans : `DIVS: ['bronze','argent','or','platine','diamant']`, affichées avec les noms de rangs |
| `js/admin.js` | 12 | panel d'administration : liste `RANGS` (noms français) pour changer le rang d'un joueur |

Faux amis, **à ne pas renommer avec les rangs** : `js/flash.js` lignes 36 et 37 utilisent les mêmes clés de traduction
« Or » et « Argent » pour les actifs de l'Éclair (l'or et l'argent, métaux) ; `js/avatars.js` ligne 25 « Diamant » est
un avatar ; `js/clans.js` ligne 30 « {0} de Fer » est un nom de clan ; `js/views.js` ligne 234 « Argent disponible dans
le carnet » parle d'argent (la monnaie). Conséquence : pour renommer les rangs Or et Argent, il faut changer leurs clés
dans `TIERS` (par exemple « Or (rang) ») et non les traductions de « Or » et « Argent ».

## 3. Les traductions

`js/i18n-1.js` (anglais) : 33 entrées dont la traduction contient un nom de rang ; `js/i18n-2.js` (hébreu) : 34. Ce
sont les noms eux-mêmes et les phrases du § 2.

## 4. Le serveur, les styles, les tests, la documentation

- **Serveur** : il ne manipule que des numéros de rang (0 à 8), jamais des noms ; les règles qui en dépendent sont écrites
  par numéro : remise sur les frais à partir du rang 5 (Diamant) dans `marches_moteur`, `marches_precision`, `eclair`,
  `duels_eclair` ; salon VIP à partir du rang 6 (Ascendant) dans `salon_vip`. Les noms n'y figurent qu'en commentaire.
  Exception sans effet : d'anciennes fonctions de `0000_baseline.sql` (15 lignes, par exemple `admin_get_player`)
  portent les noms français ; elles ne sont plus appelables depuis la fermeture de l'ancienne API (15 nov. 2026).
- **Styles** : `css/screens.css`, trois commentaires seulement (aucune règle ne dépend d'un nom).
- **Tests** qui lisent un nom de rang à l'écran : `tests/e2e/comptes.spec.mjs` (8), `tests/compte/salon-vip.spec.mjs` (3),
  `tests/compte/etat.spec.mjs` (2), `tests/helpers/fake-supabase.js` (2), `tests/compte/comptes.spec.mjs` (1),
  `tests/helpers/app.mjs` (1), et plusieurs tests SQL (commentaires).
- **Documentation** : `docs/AUDIT.md`, `docs/BACKEND.md`, `docs/PLAN.md`, `docs/refonte/inventaire/1 à 3`.
