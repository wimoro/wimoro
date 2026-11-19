# Inventaire avant refonte — écrans principaux (`js/views.js`, `index.html`)

Relevé par l'agent `ecc:code-explorer` sur le commit `8b4489f` (avant toute modification). `V:n` = `js/views.js` ligne n ;
`H:n` = `index.html` ligne n. Sert de référence de non-régression : rien de ce qui est listé ici ne doit disparaître.

## A. Écrans

Routage : `parseHash` V:398 (hash `#vue-arg`, vue inconnue = accueil). `VIEWS` V:395 = accueil, marche, eclair, chat,
classement, rang, profil, joueur, depot, retrait (complétée par auth, clans, blitz, copy, combos, duels, groups, referral,
responsible). `PROTECTED` V:396 = profil, depot, retrait, rang, creer, bienvenue, modifier : un visiteur reçoit `vLogin()`
(+ `S.ui.after`, `S.ui.authNote`). `render()` V:416.

### accueil (`#accueil`) — `vHome` V:217
Liste des marchés et marché phare. Blocs, dans l'ordre :
1. `h1.vhid` (masqué visuellement).
2. `.g-home > .col` : `section.pn.pad.hero` (`heroH` V:203, toujours `MK.btc150k` : accroche « Le marché qui bouge le plus »,
   participants, question `.hq`, pourcentage `.hp` + variation 24 h, graphique `.trail.big`, légende `.tlegend`, pied `.hfoot` :
   2 boutons `b-oui`/`b-non`, `.kvs` Volume / Clôture / Messages).
3. `clanCardH('home')` (clans.js).
4. `flashTeaserH()` (flash.js:253).
5. `.filters` : `.tabs` (`homeTabs()`, `data-a="cat"`), `.fright` = `tmodeH()` + `label.sort > select[data-sort]` (actifs,
   variation, cloture, volume) + `gateBtn('propose')` « Créer un pari ».
6. `section.pn.board#board` = `boardH` V:215 : `.bd-cap`, `.hd`, lignes `.row` (`rowH` V:214) ou `groupRowH` (groups.js).
   Catégorie « Mes paris créés » = `myBoardH()` (auth.js:259).
7. `aside.col.home-side` : `homeSideH()` (auth.js:277) + `homeChatMiniH` V:221 (`section.pn.pad.hc-mini[data-hcmini]` :
   3 derniers messages, lien `#chat`, formulaire `.cin[data-form=general]`).

Actions : `cat`, `bet` (phare + lignes, ouvre `openBet`), `propose`/`lock`, `data-href` sur `.row`, liens `#marche-id`, `#chat`.
États : visiteur → `bet` renvoie vers `#connexion` (AUTH_ACT V:437). Rang < 3 → « Créer un pari » avec cadenas
(`data-a="lock" data-g="propose"`). Liste vide → `.empty` + bouton `cat=Tout`. Pas d'état de chargement ni d'erreur ici.
Code mort probable : `homeChatH` V:216 et `ACT.hroom` V:449.

### marche (`#marche-<id>`) — `vMarket` V:230 (remplacée par `groups.js:59`)
Page d'un marché (graphique, ticket, chat). Blocs :
1. `.mtop` : `nav.crumbs`, `h1.mq`, `.mmeta` (clôture, volume `data-mv`, liquidité `data-liq`, participants `data-people`,
   messages `data-mmsg`).
2. `.mact` : Défier (`duel-open`), Partager (`copylink`), Suivre le marché (`watch`, `data-watch`).
3. `.g-mkt` :
   - `section.pn.pad.a-chart` : `.cp-h` (% `data-mp`, variation `data-mdp`, périodes `.seg` `data-a="tf"`, `gateBtn('stats')`),
     `chartToolsH` (auth.js:148, Mode Pro), `.chart[data-chart]` (`chartInner` auth.js:156), `.xax`, `.pinleg` + `.pin`, `hr`,
     `.trh` (titre + `tmodeH` + `.legend`), `.trail.mid`.
   - `aside.col.a-side` : `section.pn.pad.ticket[data-ticket=page]`, `posBoxH` (position), `ordersBoxH` (orders.js),
     `radiantsH` V:228.
   - `chatH(rid,'mkt a-chat',mktChatHead)` : `.seg` En direct / Les plus utiles (`mtab`).
   - `section.pn.pad.a-rules` (règles).
4. `.mbar` (barre d'achat fixe sur mobile, 2 boutons `bet`).

Actions : `tf`, `mtab`, `tmode`, `tside`, `preset`, `buy`, `sell`, `bet`, `watch`, `copylink`, `duel-open`, `stats`, `pin`,
`lock` (opinion, stats, fees), `react`, `cite`, `share`, `cb-add`, `follow-bet`.
États : visiteur → les actions renvoient vers `#connexion` et le ticket affiche « Se connecter » à la place du solde (V:146).
Marché inconnu → `vHome`. Verrous : stats (rang 4), share (1, case « Annoncer ma mise »), fees (5), opinion (8,
`radiantsH`), clan (`clanTicketH`). Vendre sans position → `.empty` + bouton Acheter (V:143). Ordre trop gros →
`.limit.over`. Solde insuffisant → bouton vers `#depot`.
Ouvre : `lockModal`, `statsModal`, `openBet` (via `.mbar`), `shareModal`, `citeModal`, duel.

### eclair (`#eclair`) — `vFlash(a)` flash.js:256
Ici : entrée de table, `TITLES.eclair`, `.flash-card` détecté pour `body.pg-flash` (V:418), `updateFlash(true)` à chaque
rendu, `ACT.fopen` appelé depuis la recherche (V:375, 500). Voir `3-modes-de-jeu.md`.

### chat (`#chat`) — `vChat` V:248
Salons de discussion. `h1.vhid` ; `.g-trib` :
- `aside.pn.rooms.t-rooms` : Général, VIP, clan si membre, lien `#clans`, chats des marchés (`data-monline`), messages privés.
- Centre : `.mobrooms` (pastilles mobiles) puis `chatH(rid,'trib',tribHead)` ou `vipH()` (VIP verrouillé).
- `aside.col.t-right` : marché le plus cité (`mostCited`, boutons `bet`), « En ligne » (6 joueurs), « Règles du chat ».

Actions : `troom`, `mtab`, `react`, `react-pal`, `cite`, `share`, `bet`, `lock` (vip), `feed-down`, formulaire
`data-form=<rid>`, liens `#clans`, `#clan-id`, `#joueur-u`, `#marche-id`, `#rang`.
États : visiteur → envoi, réaction, citation, partage renvoient vers `#connexion`. VIP verrouillé (rang 6) → `vipH` avec
faux messages floutés. Mode serveur → `srvChatEnvoyer`, `srvSalons`. Message privé vide → « Ouvre le profil d'un joueur… ».
Pas de clan → lien « Rejoindre un clan ».

### classement (`#classement`) — `vBoard` V:264
1. `hubSwH('joueurs')` (clans.js:231).
2. `.pagehead` : `h1.ptitle`, `p.plead` (texte fixe « Saison 3… »), `.lbh` = `.chips.lbsc` (Tous / Mes amis / Mon clan,
   `data-a="lbp"`) + `.seg.lbper` (Semaine / Mois / Saison).
3. `.g-side` : `section.pn.lb` (en-tête `.lh` + lignes `.lr` : 10 premières + « … » + ligne « moi »), `aside.col` :
   `guestRankH()` si visiteur, carte « Ta saison » (`#rang`), « Les rangs » (`.ladder.l3`, `data-a="tier"`),
   « Récompenses de la saison ».

Colonnes `.lr` : `.c-pos .c-pl .c-rk .c-pr .c-acc .c-bets .c-fol`. Actions : `lbp`, `follow-user`, `tier`, liens `#rang`,
`#clans`, `#clan-id`, `#amis`. États : « Mon clan » sans clan → `.empty` ; « Mes amis » sans ami → `.empty` + lien `#amis`.

### rang (`#rang`, protégé) — `vRank` V:277
1. `section.pn.pad.rk-hero` (emblème, titre, barre `.xpbar`, `.xprow`, boutons « Gagner de l'XP » → `#eclair` et « Voir le
   classement » ; si bloqué : `lastStepH(pg)`).
2. `demoRankH()` (demo.js:210).
3. Prochain palier (`conds(nt)` via `condH`).
4. Missions du jour (`[data-missions]`, `missionsH` V:276).
5. « Comment gagner de l'XP » (`EARN` V:274, 7 lignes).
6. « Ce que ton rang débloque » (FEATURES, `.perk` / `.perk.off`), « Des mises sans plafond ».
7. « Tous les rangs » (`.ladder`, `tierTile`).

Actions : `claim`, `lock`, `tier`. États : XP suffisante mais conditions manquantes (bloqué) ; rang maximal ; mission
réclamée / réalisable / à faire ; mode serveur → `srvReclamer`.

### profil (`#profil`, protégé) — `vProfile` V:297
1. `section.pn` : `.pf-top` (`.pf-id`, `.hbtns.own` : Amis `#amis`, Copy trading `#copie`, Partager `copylink`, Modifier
   `#modifier`) + `.pf-stats` (5 chiffres ; `data-live="profit"`, `data-live="pvalue"`).
2. `clanCardH('prof')`, `acctH()`, `profRankH(pg)`.
3. `.g-side` : onglets `.ptabs` (`data-a="ptab"` : positions, history, badges, settings, mine) avec `[data-ptab-body]`
   (`ptabH` V:293) ; à côté : Badges (6 premiers), Activité récente (6 notifications).

Onglets : positions = `posTable` (V:291) + `ordersTableH` ; history ; badges ; settings = `form[data-form=settings]`
(pseudo, compte, KYC, interrupteur sombre `.sw[data-a=theme]`, `settingsExtraH`, Réinitialiser `reset`, Déconnexion
`logout`) ; mine = `myBetsH`.
États : KYC non fait → « crypto uniquement » + bouton `data-a="kyc"` (V:296) ; compte démo / lié / e-mail ; vide :
« Aucune position ouverte », « Pas encore d'historique ».

### joueur (`#joueur-<id>`) — `vPlayer` V:307
`section.pn` (`.pf-top` avec `friendBtnH`, `followBtn`, `gateBtn('dm')` ; `.pf-stats`) ; `copyCardH(u)` (copy.js) ;
« Ses mises en cours » (3 mises, `follow-pbet` verrouillé par `follow`), « Derniers messages ».
États : identifiant inconnu → `vBoard()` ; profil privé → `vPlayerLocked(u)` ; visiteur → connexion.

### depot (`#depot`, protégé) — `vDeposit` V:319
`.pagehead` (titre + `.seg` Déposer / Retirer) ; `.g-dep` :
- principal : `methodsH('dep')`, puis `fiatDepH()` si méthode ≠ crypto, sinon 3 étapes `.step` : (1) `.coins`
  (`data-a="coin"`), (2) `.nets` (`data-a="net"`), (3) adresse `.addr-w` (QR, `.addr`, `copy`, `sim-dep`, `.warn`) +
  `.conds4` minimum / confirmations / délai / frais ;
- à côté : solde (`.balbig[data-bal]`), dépôts en cours `[data-pend]`, engagé, `rgDepNoteH()`, bonus « +100 XP », « Dépôts
  récents » `[data-deps]`, `refTeaserH()`, `whyH()`.

Ouvre `simDepModal` (V:328) : `form[data-form=simdep]`, `input[data-simamt]`, `[data-simusd]`, `[data-simerr]`.
États : confirmations 0/n → crédité ; limite de jeu responsable (`rgDepOk`) ; mode serveur → `srvDepot` ; KYC pour les
méthodes carte / virement / PayPal.

### retrait (`#retrait`, protégé) — `vWithdraw` V:352
`.pagehead` ; `methodsH('wd')` ; `fiatWdH()` ou étapes (1) `.nets` (`data-a="wnet"`), (2) champs `#wa` (`data-wd="addr"`),
`#wm` (`data-wd="amt"`), `wd-test`, `wd-max`, `[data-wdcalc]` (bouton `withdraw`) ; à côté : solde, retraits récents
`[data-wds]`. États : adresse invalide, montant < 5, montant > solde ; envoi simulé après 4,5 s ; mode serveur →
`srvRetrait`.

## B. Éléments transverses

- **En-tête** (H:17-42, `header.top`) : logo ; `nav.nav` 5 liens (Marchés, Éclair, Live chat, Clans, Classement) avec
  `data-nav` ; `.search.hsearch` ; `.right` : loupe `.hs-btn`, puce de rang `a.rkbtn[data-rankchip]`, solde `a.bal`
  (`b[data-bal]`), `a.btn.dep`, `a.dep-mini`, thème `button.thm`, langue `button.lgb`, cloche `button.bell` +
  `i[data-nbadge]`, avatar `a.av[data-a=umenu][data-me-ini]`, `a.login`, bouton S'inscrire. Visibilité par `.only-in` /
  `.only-out` (via `body.out`), libellés `.lg-only` / `.sm-only`. `updateHeader` V:84.
- **Barre d'onglets** (H:44-50, `nav.tabbar`) : Marchés, Éclair, Live chat, Clans, Profil (+ `.dotn[data-ndot]`).
- **Recherche** : champ d'en-tête (bureau) ou plein écran `#sov` (`searchOpen` V:369). Résultats `searchRes` V:361 :
  Marchés (5), Joueurs (3), Éclair (3) ; `.sr-g`, `.sr-0` (aucun résultat + `.sr-cats`). Clavier ↑ ↓ Entrée Échap.
- **Notifications** : `toggleNotifs` V:385, `#npanel.npanel` : `.nh` (Tout effacer `np-clear`, fermer), `npModeH()`
  (auth.js:309), `.nitem.unread > a.nlink + button.nx[data-a=np-del]`, vide `.empty`. Ouvrir marque tout comme lu.
- **Toasts** `toast` V:92 : `.toast <ton>` (blue, green, red, amber), `.ti`, `b`, `small`, `small.tsub`, `button.tx` ;
  3 au plus (1 sur mobile) ; 4,2 s.
- **XP flottante** `floatXP` V:93 (`.fxp`, `.pulse` sur la puce de rang). `confetti` V:94.
- **Passage de rang** `rankUp` V:95 : `.rankup[role=dialog] > .rays + .rc`.
- **Modales** : `openModal(html,cls)` V:116 → `#ov.ov > .modal` (focus piégé, `html.lock`, `--sbw`). `lockModal` V:127,
  `tierModal` V:128, `openBet` V:172, `welcome` V:388, `citeModal` V:389, `shareModal` V:390, `statsModal` V:392,
  `simDepModal` V:328.
- **Ticket de pari** `ticketInner` V:141 + `calcH` V:155 : contexte `page` (onglets Acheter / Vendre) ou `sheet` (modale,
  achat seulement). Pièces : `.sides` (`.sd.oui/.non`, `data-a=tside`, multiplicateur `.mx`) ; `otypeH` / `lpFieldH`
  (ordres limites) ; `label.amt > input[data-tamt]` ; `.presets` (+10 / +50 / +100 / Max ; vente 25 % / 50 % / 75 % / Tout) ;
  `[data-tcalc]` avec `.calc` (lignes `data-c=price|sh|imp|frp|fee|clan|gain`), `.tnotes`, `.limit`, case
  `input[data-announce]`, `.tbuy` (`button[data-a=buy]` ou lien « Solde insuffisant »), `button.cb-addbtn[data-a=cb-add]`.
  `placeBet` V:176 → `betEffets` V:183 ; `sellPos` V:195.
- **Carte de marché** : `rowH` V:214 (`.row[data-href][data-row]` : `.qcell`, `.pv`, `.tr > .trail`, `.vol`, `.acts`).
- **Message de chat** `msgH` V:47 : `evt`, `sig` (« Signal de foule »), `msg` / `bet` / `ana` : `.msg(.mine)` = avatar +
  `.mb` > `.mh` + `.tx` + carte de mise `.betc` (« Suivre cette mise ») + `.reacts[data-re]`. `composerH` V:51.

## C. Contrat DOM (à conserver dans toute réécriture du HTML)

1. **Attributs et identifiants (contrat fort)**
   - `data-a` (table `ACT` V:440-479) : bet, tside, tmode, preset, buy, sell, cat, tf, pin, hroom, troom, mtab, react,
     react-pal, follow-bet, follow-pbet, share, share-pick, cite, cite-pick, lock, tier, claim, propose, stats, dm,
     follow-user, lbp, ptab, watch, copylink, search-open, search-close, copy, coin, net, sim-dep, wnet, wd-test, wd-max,
     withdraw, notifs, npanel-close, close, feed-down, rankup-close, reset, noop.
   - Lus par les actions : `data-m`, `data-s`, `data-v`, `data-ctx`, `data-g`, `data-t`, `data-id`, `data-e`, `data-i`,
     `data-u`, `data-room`, `data-href`.
   - Formulaires : `data-form` = `settings`, `simdep`, ou un salon (`general`, `vip`, `m:*`, `dm:*`, `clan:*`, `blitz`).
   - Champs : `data-tamt`, `data-announce`, `data-search`, `data-sort`, `data-simamt`, `data-wd=addr|amt`, `data-in=<salon>`,
     `#pseudo`, `#wa`, `#wm`.
   - Mises à jour en direct : `data-mp`, `data-md`, `data-mdp`, `data-mc`, `data-mcn`, `data-mx`, `data-mv`, `data-people`,
     `data-mmsg`, `data-monline`, `data-liq`, `data-row`, `data-trail`, `data-watch`, `data-rsplit`, `data-fc`, `data-re`,
     `data-unread`, `data-online`, `data-cc`, `data-hcmini`, `data-chatbox`, `data-room`, `data-down`, `data-cap`.
   - Solde et position : `data-bal`, `data-bal-plain`, `data-rankchip`, `data-me-ini`, `data-nbadge`, `data-ndot`,
     `data-nav`, `data-live=profit|pvalue|punreal`, `data-pv`, `data-ppr`, `data-ppnl`, `data-pend`, `data-deps`,
     `data-wds`, `data-wdcalc`, `data-missions`, `data-ptab-body`.
   - Ticket : `data-ticket=page|sheet`, `data-tcalc`, `data-posbox`, `data-ordbox`, `data-c=…`, `data-chart`,
     `data-simusd`, `data-simerr`, `data-hot`.
   - Identifiants : `#view`, `#toasts`, `#ov`, `#sov`, `#npanel`, `#umenu`, `#board`, `#pseudo`, `#wa`, `#wm`.
2. **Classes utilisées comme crochets par le JavaScript** : `.feed`, `.msg`, `.palopen`, `.nm-w`, `.nm-pill`, `.reacts`,
   `.lim`, `.on`, `.hide`, `.sres` (+ `.open`, `.sel`), `.search`, `.hot`, `.tick-up`, `.tick-dn`, `.up`, `.dn`, `.pl-up`,
   `.pl-dn`, `.pulse`, `.tl`, `.big`, `.tdot`, `.xb i`, `.balbig`, `.blocked`, `.muted`, `.bell`, `.fxp`, `.cf`, `.rankup`,
   `.rc`, `.modal`, `.sov-in`, `.mbar`, `.flash-card`, `.fl-chart`, `.gchart`, `.a-side`, `.a-chat`, `.g-mkt`,
   `.filters .tabs button`, `.vin`, `.lk-prev`, `.tx`, `.hl`, `.toast`, `.chat`, `.trail` (barres `.b`, `.b.new`, `.b.me`),
   `.xpbar`, `.ptabs`. Sélecteurs ARIA (V:400) : `.seg>button`, `.seg>a`, `.chips>.chip`, `.presets>.btn`,
   `.fl-amts .btn`, `.qa>.btn`, `.fpill`, `.tabs>button`, `.tabs>a`, `.mobrooms>button`, `.room`, `.kopt`, `.coin`, `.sd`,
   `[data-nav]`, `.hubsw`.
3. **Classes posées sur `<body>` / `<html>`** : `body.has-mbar`, `body.pg-mbar`, `body.pg-flash`, `body.tk-vis`,
   `body.out` ; `html.lock` (+ `--sbw`) ; attributs `lang`, `dir`, `data-theme="dark"` ; `#view.vin` après chaque rendu.

## D. Styles en ligne et couleurs codées en dur

- Environ 141 attributs `style="…"` dans `views.js`, dont une quinzaine dynamiques (`width:${pct}%`…). Motifs : tailles de
  texte (`font-size:13|15|20|22|24|26|40|44px`), marges (`margin-top:4…24px`), `width:100%`, `display:flex;gap…`,
  `color:var(--ink)` / `var(--nonT)`. Doublon exact du style des liens Déposer / Retirer (V:320, 352).
- Couleurs en dur : `#fff` (icônes sur bouton), `#D5D9E0` (pastilles de division), dégradés de rang `TIERS[t].c`
  (core.js), `#2448FF` (V:94-95, 121, 132, 285, 295, 296, 302, 318, 322, 325, 356, logo V:489, H:8, H:19), `#F59A0B`
  (confettis, logo), confettis `['#2448FF','#F59A0B','#14161B','#7EE0D6','#F7D774']` V:94, `#7A808C` et `#A3A8B2`
  (cadenas), `#9A5B00` (avertissement V:324), halo `rgba(36,72,255,.35)` de `ACT.pin` V:448.

## E. Vocabulaire et problèmes relevés

- **Termes** : Éclair (expliqué par bribes : `EARN` V:274, recherche V:365, core.js:97 ; jamais sur l'accueil) ; Blitz et
  Série (aucune explication ici) ; signal de foule (jamais défini) ; XP (expliquée par fragments) ; rangs Fer → Radiant
  (expliqués sur `#rang`) ; Radiants, précision, impact sur le prix, liquidité, ordre max, parts, prix moyen, combiné,
  ordre limite, copy trading, défier, clan, saison, KYC (sans glossaire).
- **Doublons** : Déposer (bouton d'en-tête, mini-bouton, solde, profil, `#depot`, ticket) ; rang (puce d'en-tête, page
  rang, profil, classement, modale) ; thème (en-tête et profil) ; recherche (champ et loupe) ; achat (barre mobile, ticket,
  modale, lignes, marché phare) ; notifications (panneau et « Activité récente ») ; partage (3 mécanismes) ; chat (accueil,
  `#chat`, marché, clan).
- **Libellés ambigus** : « Suivre » désigne un joueur, une mise ou un marché ; « Copies » (mobile) contre « Copy trading »
  (bureau) ; « Mes paris créés » contre « Créer un pari » ; « Ordre max » contre « Liquidité ».
- **Écrans surchargés** : marché (9 blocs et plus), profil (10 et plus), rang (7 sections), accueil (phare + clan +
  éclair + filtres + liste + colonne + mini-chat), ticket (jusqu'à 9 lignes et 6 contrôles), dépôt, en-tête (9 contrôles
  une fois connecté).
- **Emojis** : réactions 🔥 👀 💸 🎯 (contenu du chat) ; flèche « ↓ » en texte dans « Nouveaux messages » (V:63) et l'aide
  clavier (V:379). Les icônes passent déjà par `ic('nom')` (core.js:57).
- **Autres** : chiffres fictifs en dur (« 38 900 joueurs », « Saison 3. Fin dans 12 jours »…) ; marché phare fixe malgré
  le libellé « qui bouge le plus » ; libellés français servant de clés de logique dans `S.ui.*` (`'Tout'`, `'Semaine'`,
  `'Mes amis'`…) : à conserver tels quels dans les `data-v`.
