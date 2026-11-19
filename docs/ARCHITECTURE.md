# Architecture du front

Le site est une page unique (`index.html`) et 29 fichiers JavaScript chargés dans l'ordre, sans framework ni étape de
construction. Ce document explique comment les deux modes cohabitent sans se mélanger.

## 1. Deux modes, un seul interrupteur

| | Mode local (Démo) | Mode serveur (Compte) |
|---|---|---|
| Quand | visiteur, ou compte démo | une session Supabase valide existe |
| Test dans le code | `SRV()` renvoie `false` | `SRV()` renvoie `true` |
| Données du joueur | `localStorage` | tables du serveur ; `S.me` n'en est qu'une copie |
| Marchés, chat, joueurs | simulés dans le navigateur | diffusés par le serveur, les mêmes pour tous |

Le mode est connu **avant le premier rendu** : `boot.js` attend `API.pret` (le client Supabase est chargé puis la session lue, avec
3 secondes au plus pour chaque étape ; au-delà, repli en mode local). Changer de mode (se connecter, se déconnecter) **recharge la page** : aucun état n'est fusionné.

## 2. Ordre de chargement

```
i18n ×5  →  api.js  →  core, engine, moteur-eclair, views, auth, …, demo  →  refonte.js  →  serveur.js  →  boot.js
```

- Feuilles de style, dans l'ordre : `css/tokens.css` → `base.css` → `components.css` → `screens.css` (`index.html`).
- Traductions : `js/i18n.js`, puis `i18n-1.js` à `i18n-4.js` (`i18n-4.js` porte les textes ajoutés par la refonte).
- `js/refonte.js` vient juste après `demo.js` et avant `serveur.js`.

- `js/api.js` — **la seule passerelle vers le back**. Seul fichier à toucher le client Supabase (version 2.118.0, figée
  dans `js/vendor/`, chargée seulement si nécessaire). Il expose `API.call(nom, arguments)` pour les fonctions du
  serveur, `API.fn` pour les Edge Functions, l'authentification, et `API.subscribe(sujet, fonction)` pour le temps réel.
  Les erreurs sont ramenées à un **code stable** (`solde_insuffisant`, `pause`, `session`, `reseau`…).
- `js/serveur.js` — tout ce qui est propre au mode serveur : `hydrater` (réponse de `api_state` → `S.me`),
  `srvAppliquer` (réponse d'une action → état et événements à afficher), les écritures (`srvAcheter`, `srvDepot`…),
  la garde des fonctions pas encore reliées (`srvGarde`), la traduction des codes d'erreur et des notifications.
- `js/boot.js` — démarrage, et la **table unique des minuteurs** (voir § 5).

## 3. Une action d'argent = trois temps

Chaque action (parier, vendre, déposer, retirer, valider le KYC, réclamer une mission, régler ses limites) est découpée :

1. **validation et aperçu** — inchangés, communs aux deux modes (`calcT`, `wdCheck`, `fiatCalc`, `rgDepOk`…) ;
2. **écriture comptable** — la seule étape qui dépend du mode : en local, comme avant ; en serveur, un appel à une
   fonction `api_…` dont la réponse fait autorité ;
3. **effets d'interface** — une seule fonction pour les deux modes (`betEffets`, `sellEffets`, `depDetecte`,
   `depCredite`, `wdLance`, `wdEnvoye`, `kycDone`, `rgPauseEffets`, `rgLimiteEffets`).

Le pari éclair suit la même règle : `flashBet` valide, puis écrit (`flashPoser` en local, `srvEclairMiser` → Edge Function
`eclair` en serveur) ; à la fin de la manche, `fSettle` calcule le résultat pour l'affichage et, en mode serveur, c'est
`srvEclairRegler` qui apporte l'écriture comptable ; l'annonce (`flashAnnonce`) est commune.

Exemple, acheter : `placeBet` → (local) débit et position dans `S.me`, ou (serveur) `srvAcheter` → `api_buy` → la
réponse `{me, ev, pos, q, marches}` est appliquée → `betEffets`. L'écran affiche ce que le serveur a exécuté, même si le
prix a bougé entre l'aperçu et l'ordre.

Une réponse du serveur contient toujours `me` (le profil et les compteurs à jour) et `ev` (ce qu'il faut montrer : XP
gagnée, notification, badge, mission, dépôt crédité). Les gains d'XP, de rang, de badge et les notifications ne sont
**jamais** calculés par le navigateur en mode serveur : `gainXP`, `mission`, `notif`, `checkBadges` ne font rien si
`SRV()`.

## 4. Ce qui n'est pas encore relié

Une fonction qui n'a pas encore sa fonction serveur ne doit jamais sembler marcher puis s'annuler. `srvGarde` la bloque
en mode serveur avec un message clair (« Bientôt disponible avec ton compte »). Les listes sont dans `js/serveur.js`
(`SRV_BLOQUE`, `SRV_FORMS_BLOQUE`) et se vident lot après lot.

Le test `tests/compte/garde.spec.mjs` analyse le code : toute action qui modifie un champ dont le serveur fait autorité
(solde, XP, positions, amis…) doit être soit bloquée, soit déclarée reliée avec son test. Relier une fonction, c'est :
écrire la fonction serveur et son test SQL, brancher l'étape 2, retirer le nom de `SRV_BLOQUE`, l'ajouter à `RELIEES`.

## 5. Minuteurs

Tous les minuteurs périodiques sont déclarés par `planifier(nom, délai, fonction, quand)` et lancés une seule fois par
`boot.js`, selon le mode. `quand` vaut `local` (par défaut), `tous` ou `serveur`.

| Minuteur | Délai | Mode local | Mode serveur |
|---|---|---|---|
| bots : mises, dérive des ancres, rafales et signaux de foule, croissance de la profondeur | 0,65 s à 26 s | tourne | **éteint** : fait par le serveur (`wm.bots_tick`) et diffusé |
| bots : messages, réactions, grosses mises de l'accueil, demandes d'amis, défis de duel | 2,6 s à 4 min | tourne | **éteint** |
| duels, ordres limites, copy trading, clans, blitz et série, parrainage, votes simulés, analyses du Mode Pro | 1 s à 2,5 min | tourne | **éteint** (fonctions pas encore reliées) |
| marchés : mémoire locale ; jeu responsable : échéances locales | 8 s, 30 s | tourne | **éteint** (le serveur fait autorité) |
| éclair : moteur déterministe (affichage des manches) | 250 ms | tourne | tourne (calculé à partir de l'heure, identique pour tous) |
| affichage : chiffres en direct, graphiques ; décor : joueurs en ligne ; mémoire du graphique du Mode Pro | 1 s à 20 s | tourne | tourne (affichage seulement) |
| serveur : présence | 4 min | — | tourne (onglet visible seulement) |

En mode serveur, le site ne lit ni n'écrit rien tout seul, à une exception près : le signal de présence, qui permet aux
bots du serveur de se mettre en veille quand personne ne regarde (`tests/compte/simulateurs.spec.mjs`).

## 6. Temps réel

Le sujet public **`marches`** est suivi en permanence en mode serveur. Le serveur y envoie un message par « tick » (toutes
les 3 secondes quand un joueur est présent) avec les marchés modifiés `{identifiant: [prix, volume, participants,
profondeur]}`, la traînée des mises des bots et, parfois, un signal de foule. Un achat ou une vente d'un joueur envoie
aussi son message : les autres voient le prix bouger sans recharger. Le navigateur applique ces valeurs telles quelles
(`srvTick`), sans recalcul — en particulier pour les marchés à plusieurs issues, dont le total à 100 % est garanti par
le serveur.

Le chat suit la règle « on ne s'abonne qu'à ce qui est à l'écran » : après chaque rendu, `srvSalons` compare les salons
affichés à ceux suivis, s'abonne aux nouveaux (sujets `salon:general`, `salon:m:<marché>`) en chargeant leur historique,
et se désabonne des autres. Chaque message diffusé porte la fiche de son auteur (pseudo, rang).

## 7. Annuaire des joueurs

`USERS` est un registre rempli à l'exécution (fiches envoyées par le serveur, clé = identifiant du joueur).
`userOf(id)` ne renvoie jamais `undefined` : un joueur inconnu reçoit une fiche de secours. Un salon, un marché ou un
joueur inconnu est ignoré et journalisé, jamais une exception dans un rendu.

## 8. Textes

Toute chaîne passe par `_t()` et possède ses entrées anglaise et hébraïque (`js/i18n-1.js`, `-2.js`, `-3.js` pour les
ajouts). Le serveur n'envoie jamais de phrase : il envoie un **code et des paramètres** (notifications, erreurs),
traduits chez le lecteur (`NOTIF_T`, `ERR_TXT` dans `js/serveur.js`). `tests/i18n.spec.mjs` vérifie qu'aucune chaîne
n'est orpheline.

## 9. Présentation

- Cinq destinations, dans l'en-tête et dans la barre d'onglets du téléphone, portées par l'attribut `data-nav` (`index.html`) : Marchés (`#accueil`), Éclair (`#eclair`), Portefeuille (`#portefeuille`), Communauté (`#chat`), Profil (`#profil`).
- Sous-navigations dans `js/refonte.js` : `comNavH` (Chat, Clans, Classement, Amis, Copies) et `jeuxNavH` (Éclair, Blitz Royale, La Série, Duels).
- Thème clair par défaut. Le thème sombre est activé par `:root[data-theme="dark"]`, défini dans `css/tokens.css` (`components.css` ne fait que choisir l'icône soleil ou lune).
- Détails et règles : [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).
