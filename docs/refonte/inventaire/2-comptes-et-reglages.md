# Inventaire avant refonte — comptes, réglages, parrainage, jeu responsable

Relevé par l'agent `ecc:code-explorer` sur le commit `8b4489f`. Fichiers : `js/auth.js`, `js/account.js`, `js/avatars.js`,
`js/responsible.js`, `js/referral.js`, `js/i18n.js`. Routes protégées (un visiteur voit la connexion) : `creer`,
`bienvenue`, `modifier`, `amis`, `responsable`, `parrainage`.

## A. Écrans

### `#creer` — `vCreate` (auth.js:15)
Proposer un marché, le soumettre au vote, voter. En-tête `.pagehead` + onglets `.tabs.utabs` (`data-a="cr-tab"` :
`form` « Nouveau pari », `mine` « Mes propositions (n) », `vote` « À voter »).
- **form** : si rang insuffisant, bandeau `button.lockrow` (`lock`, `propose`, rang Or). `form[data-form=create]` en
  4 étapes `.step` : (1) question `#cq[data-cr=q]` + catégories `cr-cat` ; (2) clôture `#cd`, `#ct`, source `#cs`, règles
  `#crr`, bouton `cr-rules` ; (3) cote de départ `#cp.range[data-cr=p0]` ; (4) publication (vote communautaire, ou
  publication directe verrouillée `publish`, rang Immortel) + bouton `[data-crsubmit]`. À côté : aperçu `[data-crprev]`,
  liste de contrôle `[data-crcheck]` (5 lignes), bloc « Ce qui est refusé ».
- **mine** : `propRowH(p,true)` ou `.empty`. **vote** : 3 propositions (`COMM_PROPS`), boutons `vote` (`for` / `against`).
- États : rang `propose` = 3, `publish` = 7 ; mode serveur → `srvPropCreer`, `srvPropVoter` ; erreur → toast « Il manque
  quelque chose ». Incohérence relevée : « 25 votes » dans le texte contre `need:50` sur les propositions d'exemple.

### `#connexion` — `vLogin` (auth.js:50)
`authShell` (auth.js:47) : `.auth > .auth-main` (`.auth-card` + `langRowH()`) et `aside.auth-side` (4 arguments, 6
emblèmes). Carte : titre, note éventuelle `.limit.over` (`S.ui.authNote` : auto-exclusion, session expirée, « Connecte-toi
pour… »), `.seg` `auth-mode` (mail / wallet), `form[data-form=login]` (`#le[name=email]`, `#lp[name=pw]`, `pw-toggle`,
`forgot`, `p.err[data-autherr]`), ou 3 portefeuilles `[data-a=wallet]` ; puis « ou », `demo-login`, lien `#inscription`.
Ouvre `forgotModal`. Un connecté est renvoyé vers l'accueil.

### `#inscription` — `vSignup` (auth.js:62)
`form[data-form=signup]` : `#sn[name=pseudo]`, `#se[name=email]`, `#sp[name=pw]` + jauge `.strength[data-sus]`,
`#sr[name=ref]` (code de parrainage), cases `age` et `cgu`, `p.err[data-signerr]`. Puis `wallet-modal`, lien `#connexion`.
Variante d'attente (`S.ui.authWait`) : « Vérifie ta boîte mail », `auth-wait-done`, `auth-resend`.

### `#bienvenue` — `vOnboarding` (auth.js:105)
5 étapes (`S.ui.ob`), `.ob > .pn.ob-card` : points `.ob-dots`, corps, actions (`ob-back`, `ob-next`).
1. Couleur (`ob-color`, 6 couleurs). 2. Centres d'intérêt (`ob-int`, au moins un). 3. KYC : choix `ob-kpick` (avec /
sans), formulaire `kycFormH('ob')`, ou « Identité vérifiée ». 4. Rangs (échelle des 9 emblèmes). 5. Missions et
« Récupérer mes 100 XP », puis 3 liens `ob-done` (`#depot`, `#eclair`, `#clans`).

### `#modifier` — `vEditProfile` (auth.js:203)
`form[data-form=profile]`, 8 sections `.step` : Identité (photo `avPickerH` avatars.js:47, galerie de 16 avatars, couleur
`pe-color`, pseudo `#pen`, bio `#peb`) ; Centres d'intérêt (`pe-int`) ; Compte (e-mail `#pee`, mot de passe `pe-pw`,
portefeuille `pe-wallet`) ; KYC (`kyc`) ; Notifications (4 interrupteurs `data-pe-pref` + `np-mode` tous / importants /
aucun) ; Apparence (`theme`) ; Confidentialité (`privSectionH` copy.js:37 : `pe-vis` public / privé + 3 interrupteurs) ;
Session (`logout`, `reset`). Barre d'enregistrement `.savebar`. À côté : aperçu en direct `[data-peprev]`.
Ouvre `pwModal`, `kycModal`. Mode serveur : photo importée refusée (toast).

### `#amis` — `vFriends` (auth.js:319)
Bouton `fr-invite`. Colonne : « Demandes reçues » (`fr-accept`, `fr-decline`), « Tes amis » (`duel-open`, `dm` si rang 1,
`fr-remove`), « Demandes envoyées » (`fr-cancel`). À côté : recherche `input[data-fq]` → `[data-fres]`, suggestions
(`fr-add`), lien d'invitation (`copy`). Modale `fr-menu`.

### `#parrainage` — `vReferral` (referral.js:83)
Carte code + lien (`ref-share`, `ref-copy`), « Comment ça marche » (3 étapes), 3 chiffres, liste des filleuls.

### `#responsable` — `vRG` (responsible.js:61)
« Limites de dépôt » (3 formulaires `data-form=rglim` jour / semaine / mois, annulation `rg-pend-cancel`), « Faire une
pause » (`rg-pause` 24 h / 3 j / 7 j / 30 j), « Auto-exclusion » (`rg-excl` 6 mois / 1 an / 3 ans / définitive),
« Mon historique » (`rg-export` xlsx / pdf), « Besoin d'en parler ? ». Bandeau `#rgbar` inséré avant `#view` pendant
une pause. Modales : pause, auto-exclusion (saisir le mot « EXCLUSION »).

## B. Éléments transverses

- **Menu du compte** `#umenu` (account.js:78-82), 14 entrées dans l'ordre : Mon profil, Mes amis (+ pastille), Mon clan /
  Clans, Mes duels, Mes combinés, Déposer, Retirer, Faire le KYC (si non fait), Changer de rang (démo), Langue, Thème,
  Pop-up (`tm-cycle`), Modifier le profil, Se déconnecter. Les mêmes entrées sont reprises dans le profil par `acctH()`.
- **Modales** : portefeuille (auth.js:56), mot de passe oublié en 2 étapes (auth.js:89), nouveau mot de passe (auth.js:87,
  sans bouton fermer), changer le mot de passe (auth.js:235), menu ami (auth.js:349), KYC (account.js:60), langue
  (responsible.js:206), partage (referral.js:56), pause, auto-exclusion.
- **Dépôt et retrait par carte, virement, PayPal** : `methodsH`, `fiatDepH`, `fiatWdH` (account.js:38-51), actions
  `dmethod`, `wmethod`, `fiat-q`, `fiat-dep`, `fiat-wd`, `fiat-max` ; tuiles verrouillées tant que le KYC n'est pas fait.
- **Pastilles « Mode démo »** : `demoB`, `demoHint` (core.js:129-130).
- **Langues** : `en` (par défaut), `fr`, `he` (droite à gauche). `_t('texte français')` cherche la traduction ; changer de
  langue recharge la page. `i18nStatic` traduit les textes de `index.html` d'après leur texte français exact : tout
  libellé de la coquille doit donc exister tel quel dans les catalogues. `fixText` pose les espaces insécables après
  chaque rendu. `bidi()` isole les nombres en hébreu.

## C. Contrat DOM (essentiel)

- **Champs lus par nom** : login `email`, `pw` ; signup `pseudo`, `email`, `pw`, `age`, `cgu`, `ref` ; forgot `email`,
  `code`, `pw` ; pwchange `cur`, `pw`, `pw2` ; kyc `fn`, `ln`, `bd`, `co` ; rglim `v`.
- **Identifiants** : `#le #lp #sn #se #sp #sr #cq #cd #ct #cs #crr #cp #pen #peb #pee #avfile #pw0 #pw1 #pw2 #fc #fp #rp
  #rgx #rgbar`.
- **Attributs** : `data-cr`, `data-crprev`, `data-crcheck`, `data-crsubmit`, `data-crcount`, `data-crp`, `data-prv`,
  `data-prb`, `data-prc`, `data-su`, `data-sun`, `data-sue`, `data-sus`, `data-sul`, `data-autherr`, `data-signerr`,
  `data-ferr`, `data-pwerr`, `data-waiterr`, `data-pe`, `data-pe-pref`, `data-peav`, `data-pen`, `data-pebc`, `data-pee`,
  `data-pedirty`, `data-peprev`, `data-pephoto`, `data-pewrow`, `data-pepriv`, `data-avfile`, `data-fq`, `data-fres`,
  `data-fiat`, `data-ficalc`, `data-kerr`, `data-ksub`, `data-rgx`, `data-rgxgo`, `data-acct`.
- **Classes servant de crochets** : `on`, `ok`, `busy`, `kopt`, `sw`, `ui`, `me-av`, `av-img`, `over`, `is-gain`,
  `is-loss`, `b-gain`, `b-loss`, `b-ink`, `b-white`, `b-soft`, `b-ghost`.
- **Thème** : `html[data-theme=dark|light]` (account.js:72-73) ; le bouton `[data-a=theme]` se comporte différemment selon
  qu'il porte la classe `sw` (interrupteur) ou `ui` (entrée de menu).
- **Variables CSS lues par le JavaScript** : `--sg` (pile de polices, pour les images et PDF générés), `--oui`, `--nonT`,
  `--g2`, `--g3`, `--g4`, `--ink`.

## D. Styles en ligne et couleurs en dur

- `style="…"` : auth.js 87, account.js 15, responsible.js 20, referral.js 6, avatars.js 1.
- Palette de profil `OB_COLORS` (auth.js:103) : `#2448FF #F59A0B #14161B #13804F #AE2139 #7350E3` — **enregistrée dans le
  profil** (`me.color`), à ne pas changer.
- Jauge de mot de passe (auth.js:74) : `#F59A0B`, `#F7C35B`, `#2448FF`. Galerie d'avatars (avatars.js:14-29) : 16 dégradés.
- Icônes à couleur fixe (insensibles au thème) : `#9A5B00`, `#0B8247`, `#13804F`, `#fff`. Images de partage et PDF :
  couleurs fixes.

## E. Textes dont le sens ne doit pas changer

- **Juridique** : mention « 18 ans ou plus » et conditions (auth.js:56, 67, 79) ; « Wimoro est réservé aux personnes
  majeures. Joue avec de l'argent que tu peux te permettre de perdre. » (responsible.js:70) ; signature de portefeuille
  « Aucune transaction, aucun frais. » ; frais et délais par moyen de paiement (account.js:33-34, 42) ; conditions du
  parrainage (auth.js:66, referral.js:84-92) ; règles de modération « Ce qui est refusé » (auth.js:23).
- **KYC** : `methodsH`, `whyH` « Pourquoi le KYC ? » (account.js:38-40), formulaire et messages (account.js:59-70),
  onglet d'onboarding (auth.js:104-109), ligne du profil (auth.js:219).
- **Jeu responsable** : constantes `RG` (délai de réflexion 48 h, durées), messages de blocage (responsible.js:32-37),
  page `vRG` (« Ces réglages ne peuvent pas être contournés, même par le support. », « La pause ne peut pas être
  écourtée. »), modales (responsible.js:71-72), aide (Joueurs Info Service en français, Gambling Therapy ailleurs).
  **Le mot « EXCLUSION » est comparé en dur dans le code** : ne pas le traduire ni le reformuler.

## F. Problèmes relevés

- **Doublons** : thème (en-tête, menu, modifier) ; langue (en-tête visiteur, pied de connexion, menu, réglages du profil) ;
  KYC (menu, modifier, dépôt, retrait, onboarding) ; déconnexion (menu et modifier) ; mode des pop-up (`tm-cycle` et
  `np-mode`) ; parrainage (page, réglages, dépôt, partage, lien d'invitation des amis à la récompense différente) ; export
  de l'historique (responsable et réglages).
- **Libellés ambigus** : « Retirer » (argent, ami, photo) ; « Annuler » (4 sens) ; « pari » désigne à la fois une mise et
  un marché proposé ; « Pour / Contre » à côté de « Oui / Non » ; « Sans KYC » = « crypto uniquement ».
- **Écrans surchargés** : modifier (8 sections, environ 40 contrôles) ; créer (4 étapes + aperçu + contrôle + règles) ;
  responsable ; menu du compte (14 entrées).
- **Code mort** : `authThemeBtn` (auth.js:49), `PRIV` (auth.js:193), action `ob-kyc` (aucun gabarit ne l'émet).
- **Emojis** : aucun dans ces fichiers.
