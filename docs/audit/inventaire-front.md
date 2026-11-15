# Inventaire statique du front

Généré par `tools/audit/inventaire.mjs` (analyse du code avec acorn, rien n'est exécuté) — code applicatif du commit 719cf76.

- **986** fonctions globales dans 22 fichiers (hors catalogues de traduction) ; **27** sont définies plusieurs fois (enveloppes).
- **242** actions `ACT`, **13** formulaires `FORMS`, **26** écrans `VIEWS`.
- Actions/formulaires qui touchent au **solde** : 26 ; à l'**XP** : 21.
- Branchés au back : 4. Annulés par la relecture périodique (B05) : 32. Dépendants du blob : 91. Purement locaux : 2. Interface seule : 126.

## Fonctions redéfinies (couches empilées dans l'ordre de chargement)

| Fonction | Définitions successives |
|---|---|
| `botBet` | core.js:284 → supabase.js:279 |
| `botChat` | core.js:288 → supabase.js:280 |
| `botReact` | core.js:302 → supabase.js:281 |
| `burst` | core.js:307 → supabase.js:282 |
| `clanSeedRoom` | clans.js:194 → demo.js:179 |
| `createAccount` | account.js:29 → supabase.js:120 |
| `driftAnchors` | core.js:285 → supabase.js:283 |
| `enterAccount` | account.js:16 → demo.js:184 |
| `fIn` | auth.js:298 → supabase.js:249 |
| `fOut` | auth.js:299 → supabase.js:250 |
| `flashBet` | flash.js:140 → clans.js:260 |
| `flashTick` | flash.js:134 → blitz.js:69 |
| `friendsOf` | auth.js:297 → supabase.js:248 |
| `live` | copy.js:314 → orders.js:186 → referral.js:104 → responsible.js:198 |
| `logout` | account.js:24 → demo.js:184 → supabase.js:130 |
| `marketsLoad` | core.js:219 → supabase.js:285 |
| `marketsSave` | core.js:218 → supabase.js:284 |
| `placeBet` | views.js:174 → groups.js:62 → clans.js:259 → supabase.js:152 |
| `rankUp` | views.js:95 → supabase.js:254 |
| `render` | views.js:387 → auth.js:347 → combos.js:109 |
| `resolveFlash` | flash.js:158 → duels.js:76 |
| `save` | core.js:210 → clans.js:274 |
| `sellPos` | views.js:185 → groups.js:63 → supabase.js:172 |
| `sendMsg` | views.js:399 → supabase.js:230 |
| `startDeposit` | views.js:317 → supabase.js:205 |
| `umenuH` | account.js:73 → supabase.js:269 |
| `updateMarket` | views.js:75 → groups.js:27 → combos.js:93 → pro.js:85 |

## Écritures directes du solde et appels à gainXP, par fichier

| Fichier | `S.me.balance` modifié dans | `gainXP()` appelé dans | accès `USERS[…]` |
|---|---|---|---|
| core.js | — | 1 : botReact | 4 |
| views.js | 4 : placeBet, sellPos, startDeposit, ACT.withdraw | 6 : placeBet, scheduleFollowers, startDeposit, sendMsg, ACT.share-pick, ACT.claim | 21 |
| auth.js | — | 6 : createMarketFromProposal, frAccepted, ACT.vote, ACT.ob-next, ACT.fr-accept, FORMS.create | 17 |
| avatars.js | — | — | 1 |
| account.js | 3 : leaveAccount, startFiatDeposit, startFiatWd | 1 : startFiatDeposit | — |
| flash.js | 2 : flashBet, fSettle | 2 : flashBet, fSettle | 1 |
| copy.js | 3 : copyExec, copySell, copierFees | 1 : copyStart | 27 |
| orders.js | 5 : fillBuy, fillSell, ordersCheck, placeLimit, cancelOrder | 1 : placeLimit | — |
| referral.js | 2 : refApplyAtSignup, botReferral | — | — |
| duels.js | 6 : duelCreate, duelAccept, duelRefund, duelSettle, stackCreate, duelStackTick | 3 : duelSettle, duelStackTick, ACT.dl-accept | 5 |
| blitz.js | 6 : bzJoin, bzRebuy, bzFinish, serieStart, serieEnd, serieCash | 4 : bzJoin, bzFinish, serieStart, serieCash | 2 |
| clans.js | 3 : clanCreate, clanWarJoin, clanWarTick | 2 : clanWarTick, clanWeekAward | 11 |
| combos.js | 3 : comboPlace, comboCash, comboOnResolve | 2 : comboPlace, comboCash | — |
| demo.js | — | 1 : proPublish | 8 |
| supabase.js | 6 : placeBet, sellPos, startDeposit, sbLoad, sbRefresh, ACT.flash-bet | — | — |
| **Total** | **43** fonctions | **30** fonctions | **97** |

## Actions (242)

| Action | Où | Champs de `S.me` modifiés | État partagé modifié | Persistance en mode Démo | Persistance en mode Compte (état actuel) |
|---|---|---|---|---|---|
| `umenu` | account.js:76 | — | — | localStorage (compte du navigateur) | interface seule |
| `uclose` | account.js:77 | — | — | localStorage (compte du navigateur) | interface seule |
| `kyc` | account.js:78 | — | — | localStorage (compte du navigateur) | interface seule |
| `kycdoc` | account.js:79 | — | — | localStorage (compte du navigateur) | interface seule |
| `theme` | account.js:80 | — | — | localStorage (compte du navigateur) | interface seule |
| `tm-cycle` | account.js:81 | clanLive, tmode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cmode` | account.js:82 | — | — | localStorage (compte du navigateur) | interface seule |
| `dmethod` | account.js:83 | — | — | localStorage (compte du navigateur) | interface seule |
| `wmethod` | account.js:83 | — | — | localStorage (compte du navigateur) | interface seule |
| `fiat-q` | account.js:84 | — | — | localStorage (compte du navigateur) | interface seule |
| `fiat-dep` | account.js:84 | badges, balance, blockedShown, clanLive, depDay, deposits, deps, notifs, rg, xp | messages de chat | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `fiat-wd` | account.js:84 | balance, clanLive, notifs, wds | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `fiat-max` | account.js:85 | — | — | localStorage (compte du navigateur) | interface seule |
| `cr-tab` | auth.js:37 | — | — | localStorage (compte du navigateur) | interface seule |
| `cr-cat` | auth.js:38 | — | — | localStorage (compte du navigateur) | interface seule |
| `cr-rules` | auth.js:39 | — | — | localStorage (compte du navigateur) | interface seule |
| `vote` | auth.js:40 | badges, blockedShown, clanLive, notifs, voted, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `auth-mode` | auth.js:81 | — | — | localStorage (compte du navigateur) | interface seule |
| `pw-toggle` | auth.js:82 | — | — | localStorage (compte du navigateur) | interface seule |
| `forgot` | auth.js:83 | — | — | localStorage (compte du navigateur) | interface seule |
| `wallet` | auth.js:84 | (objet entier), balance, clan, clanLive, clanSeeded, clanVol, clanXP, comboSeeded, combos, createdAt, deps, duelSeedLang, duelSeeded, duelWins, duels, history, logged, notifs, refBy, refCode, rg, stacks | messages de chat, fiches joueurs | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `wallet-modal` | auth.js:85 | — | — | localStorage (compte du navigateur) | interface seule |
| `demo-login` | auth.js:86 | (objet entier), clan, clanLive, clanSeeded, clanVol, clanXP, comboSeeded, combos, createdAt, duelSeedLang, duelSeeded, duelWins, duels, history, logged, notifs, rg, stacks, welcomed | messages de chat, fiches joueurs | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `logout` | auth.js:87 | — | — | localStorage (compte du navigateur) | interface seule |
| `ob-color` | auth.js:102 | clanLive, color | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `ob-int` | auth.js:103 | clanLive, interests | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `ob-back` | auth.js:104 | — | — | localStorage (compte du navigateur) | interface seule |
| `ob-kpick` | auth.js:105 | — | — | localStorage (compte du navigateur) | interface seule |
| `ob-kyc` | auth.js:106 | — | — | localStorage (compte du navigateur) | interface seule |
| `ob-next` | auth.js:107 | badges, blockedShown, clanLive, notifs, obBonus, onboarded, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `ob-done` | auth.js:108 | clanLive, onboarded | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `ctype` | auth.js:176 | clanLive, ctype | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pe-color` | auth.js:229 | — | — | localStorage (compte du navigateur) | interface seule |
| `pe-int` | auth.js:230 | — | — | localStorage (compte du navigateur) | interface seule |
| `pe-wallet` | auth.js:231 | — | — | localStorage (compte du navigateur) | interface seule |
| `pe-pw` | auth.js:232 | — | — | localStorage (compte du navigateur) | interface seule |
| `np-mode` | auth.js:290 | clanLive, tmode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `np-del` | auth.js:291 | clanLive, notifs | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `np-clear` | auth.js:292 | clanLive, notifs | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `fr-add` | auth.js:321 | badges, blockedShown, clanLive, freqIn, freqOut, friends, notifs, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `fr-cancel` | auth.js:322 | clanLive, freqOut | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `fr-accept` | auth.js:323 | badges, blockedShown, clanLive, freqIn, friends, notifs, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `fr-decline` | auth.js:324 | clanLive, freqIn, friends | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `fr-remove` | auth.js:325 | clanLive, friends | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `fr-menu` | auth.js:326 | — | — | localStorage (compte du navigateur) | interface seule |
| `fr-invite` | auth.js:327 | — | — | localStorage (compte du navigateur) | interface seule |
| `pe-photo` | avatars.js:51 | — | — | localStorage (compte du navigateur) | interface seule |
| `bz-join` | blitz.js:190 | badges, balance, blockedShown, bzPlayed, clanLive, notifs, played, rg, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `bz-rebuy` | blitz.js:191 | balance, clanLive, rg | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `bz-choose` | blitz.js:192 | — | — | localStorage (compte du navigateur) | interface seule |
| `sr-gid` | blitz.js:193 | — | — | localStorage (compte du navigateur) | interface seule |
| `sr-stake` | blitz.js:194 | — | — | localStorage (compte du navigateur) | interface seule |
| `sr-start` | blitz.js:195 | badges, balance, blockedShown, clanLive, notifs, played, rg, serie, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `sr-play` | blitz.js:196 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `sr-cash` | blitz.js:197 | badges, balance, blockedShown, clanLive, history, notifs, realized, serieBest, serieToday, settled, wins, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `sr-share` | blitz.js:198 | refCode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-tab` | clans.js:232 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-div` | clans.js:233 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-ctab` | clans.js:234 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-create-open` | clans.js:235 | — | — | localStorage (compte du navigateur) | interface seule |
| `clc-ic` | clans.js:236 | — | — | localStorage (compte du navigateur) | interface seule |
| `clc-col` | clans.js:236 | — | — | localStorage (compte du navigateur) | interface seule |
| `clc-lang` | clans.js:237 | — | — | localStorage (compte du navigateur) | interface seule |
| `clc-cat` | clans.js:238 | — | — | localStorage (compte du navigateur) | interface seule |
| `clc-access` | clans.js:239 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-sim` | clans.js:240 | clanLive, clanSim | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-join` | clans.js:241 | clan, clanLive, clanVol, clanXP, notifs | messages de chat | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-apply` | clans.js:242 | clan, clanApps, clanLive, clanVol, clanXP, notifs | messages de chat | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-leave` | clans.js:243 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-leave-do` | clans.js:244 | clan, clanLeftAt, clanLive, clanVol | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-share` | clans.js:245 | refCode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-promote` | clans.js:246 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-kick` | clans.js:247 | clanLive | fiches joueurs | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-invite` | clans.js:248 | clanLive, friends | fiches joueurs | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-call-open` | clans.js:249 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-call-do` | clans.js:250 | clanLive, notifs | messages de chat | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-war` | clans.js:251 | clanLive | messages de chat | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cl-war-open` | clans.js:252 | — | — | localStorage (compte du navigateur) | interface seule |
| `cl-war-join` | clans.js:253 | balance, clanLive, rg | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `cl-feedopt` | clans.js:254 | clanLive, prefs | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cb-add` | combos.js:98 | clanLive, slip | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cb-open` | combos.js:99 | — | — | localStorage (compte du navigateur) | interface seule |
| `cb-clear` | combos.js:100 | clanLive, slip | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cb-rm` | combos.js:101 | clanLive, slip | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cb-stake` | combos.js:102 | clanLive, slip | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cb-place` | combos.js:103 | badges, balance, blockedShown, cbPlayed, clanLive, clanSkipped, clanVol, clanXP, combos, notifs, played, rg, slip, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `cb-cash` | combos.js:104 | badges, balance, blockedShown, clanLive, combos, history, notifs, realized, settled, wins, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `cb-tab` | combos.js:105 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-open` | copy.js:294 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-edit` | copy.js:295 | copies | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cp-set` | copy.js:296 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-mode` | copy.js:297 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-pct` | copy.js:298 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-cat` | copy.js:299 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-stop-set` | copy.js:300 | — | — | localStorage (compte du navigateur) | interface seule |
| `cp-start` | copy.js:301 | badges, balance, blockedShown, clanLive, combos, copies, copyXP, guards, history, maxBet, notifs, orders, played, positions, realized, xp | prix/volume des marchés | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `cp-manage` | copy.js:302 | copies | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cp-pause` | copy.js:303 | clanLive, copies | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cp-stop` | copy.js:304 | copies | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `cp-stop-do` | copy.js:308 | badges, balance, clanLive, combos, copies, guards, history, maxBet, notifs, orders, played, positions, realized | prix/volume des marchés | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `pe-vis` | copy.js:309 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-share` | demo.js:144 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-sh-dst` | demo.js:145 | friends | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-sh-dm` | demo.js:146 | friends | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-sh-send` | demo.js:147 | badges, blockedShown, chatDay, chatXP, clanLive, friends, msgsTotal, notifs, pro, xp | prix/volume des marchés, messages de chat | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `pro-sh-img` | demo.js:150 | clanLive, refCode, refShared | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-sh-back` | demo.js:151 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-view` | demo.js:152 | clanLive, pro | prix/volume des marchés | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-fork` | demo.js:153 | clanLive, pro | prix/volume des marchés | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `demo-rank` | demo.js:212 | [], badges, blockedShown, clanLive, deposits, flashWins, followed, notifs, pos, rank0, settled, wins, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `demo-rank-reset` | demo.js:212 | [], badges, blockedShown, clanLive, notifs, rank0 | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `demo-rank-open` | demo.js:212 | — | — | localStorage (compte du navigateur) | interface seule |
| `duel-open` | duels.js:192 | — | — | localStorage (compte du navigateur) | interface seule |
| `dl-side` | duels.js:193 | — | — | localStorage (compte du navigateur) | interface seule |
| `dl-stake` | duels.js:194 | — | — | localStorage (compte du navigateur) | interface seule |
| `dl-opp` | duels.js:195 | — | — | localStorage (compte du navigateur) | interface seule |
| `dl-create` | duels.js:196 | badges, balance, clanLive, combos, duels, duelsMade, friends, guards, history, maxBet, notifs, orders, played, positions, realized, rg | prix/volume des marchés | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `dl-share` | duels.js:197 | duels | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `dl-cancel` | duels.js:198 | balance, clanLive, duels | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `dl-accept` | duels.js:199 | badges, balance, blockedShown, clanLive, combos, duels, guards, history, maxBet, notifs, orders, played, positions, realized, rg, xp | prix/volume des marchés | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `dl-login` | duels.js:201 | — | — | localStorage (compte du navigateur) | interface seule |
| `dl-decline` | duels.js:202 | clanLive, duels | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `dtab` | duels.js:203 | — | — | localStorage (compte du navigateur) | interface seule |
| `stack-open` | duels.js:204 | — | — | localStorage (compte du navigateur) | interface seule |
| `stk-buyin` | duels.js:205 | — | — | localStorage (compte du navigateur) | interface seule |
| `stk-opp` | duels.js:206 | — | — | localStorage (compte du navigateur) | interface seule |
| `stk-create` | duels.js:207 | balance, clanLive, notifs, rg, stacks | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `flash-amt` | flash.js:305 | — | — | localStorage (compte du navigateur) | interface seule |
| `flres-close` | flash.js:306 | — | — | localStorage (compte du navigateur) | interface seule |
| `fhelp` | flash.js:307 | — | — | localStorage (compte du navigateur) | interface seule |
| `fopen` | flash.js:308 | clanLive, fcat, fmode | état éclair | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `fgame` | flash.js:309 | — | — | localStorage (compte du navigateur) | interface seule |
| `fmode` | flash.js:310 | clanLive, fmode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `fcat` | flash.js:311 | clanLive, fcat | état éclair | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `falert` | flash.js:312 | clanLive, falerts | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `tscroll` | flash.js:326 | — | — | localStorage (compte du navigateur) | interface seule |
| `otype` | orders.js:175 | — | — | localStorage (compte du navigateur) | interface seule |
| `lpset` | orders.js:176 | — | — | localStorage (compte du navigateur) | interface seule |
| `lpstep` | orders.js:177 | — | — | localStorage (compte du navigateur) | interface seule |
| `limit-place` | orders.js:178 | badges, balance, blockedShown, clanLive, combos, guards, history, limitXP, maxBet, notifs, orders, played, positions, realized, rg, xp | prix/volume des marchés | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `ord-cancel` | orders.js:179 | balance, clanLive, orders | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `guard` | orders.js:180 | guards | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `guard-set` | orders.js:181 | — | — | localStorage (compte du navigateur) | interface seule |
| `guard-save` | orders.js:182 | clanLive, guards | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `guard-del` | orders.js:184 | clanLive, guards | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-open` | pro2.js:239 | clanLive, pro | prix/volume des marchés | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-close` | pro2.js:240 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-goto` | pro2.js:240 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-sell` | pro2.js:241 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-iv` | pro2.js:242 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-type` | pro2.js:245 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-side` | pro2.js:246 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-panel` | pro2.js:247 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-ind-add` | pro2.js:248 | clanLive | prix/volume des marchés | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-ind-swap` | pro2.js:249 | clanLive | prix/volume des marchés | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-ind-del` | pro2.js:250 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-ind-eye` | pro2.js:251 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-ind-col` | pro2.js:252 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-ind-w` | pro2.js:253 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-leg-more` | pro2.js:254 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-ind-anc` | pro2.js:255 | clanLive | prix/volume des marchés | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-perks` | pro2.js:257 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-tool` | pro2.js:258 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-tools-toggle` | pro2.js:259 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-hide-all` | pro2.js:260 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-clear` | pro2.js:261 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-obj-sel` | pro2.js:264 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-obj-eye` | pro2.js:265 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-obj-del` | pro2.js:266 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-dr-col` | pro2.js:267 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-dr-w` | pro2.js:268 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-dr-txt` | pro2.js:269 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-dr-eye` | pro2.js:270 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-dr-del` | pro2.js:271 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `pro-dr-none` | pro2.js:272 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-tip-x` | pro2.js:272 | — | — | localStorage (compte du navigateur) | interface seule |
| `pro-zoom` | pro2.js:273 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `share-open` | referral.js:95 | clanLive, refCode, refShared | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `share-send` | referral.js:96 | refCode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `share-save` | referral.js:97 | — | — | localStorage (compte du navigateur) | interface seule |
| `share-copy` | referral.js:98 | refCode | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `ref-copy` | referral.js:99 | clanLive, refShared | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `ref-share` | referral.js:100 | clanLive, refCode, refShared | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `rg-pause` | responsible.js:192 | — | — | localStorage (compte du navigateur) | interface seule |
| `rg-pause-do` | responsible.js:192 | clanLive, notifs, rg | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `rg-excl` | responsible.js:193 | — | — | localStorage (compte du navigateur) | interface seule |
| `rg-excl-do` | responsible.js:193 | (objet entier), rg | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `rg-pend-cancel` | responsible.js:194 | clanLive, rg | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `rg-export` | responsible.js:195 | — | — | localStorage (compte du navigateur) | interface seule |
| `lang-set` | responsible.js:207 | — | — | localStorage (compte du navigateur) | interface seule |
| `lang-pick` | responsible.js:207 | — | — | localStorage (compte du navigateur) | interface seule |
| `flash-bet` | supabase.js:189 (remplace flash.js:304) | balance, played | — | localStorage (compte du navigateur) | RPC flash_bet (partiel) |
| `switch-to-account` | supabase.js:262 | — | — | localStorage (compte du navigateur) | interface seule |
| `switch-to-demo` | supabase.js:263 | (objet entier), clan, clanLive, clanSeeded, clanVol, clanXP, comboSeeded, combos, createdAt, duelSeedLang, duelSeeded, duelWins, duels, history, logged, notifs, rg, stacks, welcomed | messages de chat, fiches joueurs | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `bet` | views.js:411 | — | — | localStorage (compte du navigateur) | interface seule |
| `tside` | views.js:412 | — | — | localStorage (compte du navigateur) | interface seule |
| `tmode` | views.js:413 | — | — | localStorage (compte du navigateur) | interface seule |
| `preset` | views.js:414 | — | prix/volume des marchés | localStorage (compte du navigateur) | local à ce navigateur, non partagé |
| `buy` | views.js:415 | badges, balance, blockedShown, clanLive, clanSkipped, clanVol, clanXP, combos, copyEarn, followed, guards, history, maxBet, notifs, orders, played, positions, realized, rg, xp | prix/volume des marchés, messages de chat | localStorage (compte du navigateur) | RPC place_bet (partiel) |
| `sell` | views.js:415 | badges, balance, clanLive, combos, guards, history, maxBet, notifs, orders, played, positions, realized | prix/volume des marchés | localStorage (compte du navigateur) | RPC sell_position (partiel) |
| `cat` | views.js:416 | — | — | localStorage (compte du navigateur) | interface seule |
| `tf` | views.js:417 | — | — | localStorage (compte du navigateur) | interface seule |
| `pin` | views.js:418 | — | — | localStorage (compte du navigateur) | interface seule |
| `hroom` | views.js:419 | — | — | localStorage (compte du navigateur) | interface seule |
| `troom` | views.js:420 | — | — | localStorage (compte du navigateur) | interface seule |
| `mtab` | views.js:421 | — | — | localStorage (compte du navigateur) | interface seule |
| `react` | views.js:422 | — | — | localStorage (compte du navigateur) | interface seule |
| `react-pal` | views.js:423 | — | — | localStorage (compte du navigateur) | interface seule |
| `follow-bet` | views.js:424 | — | — | localStorage (compte du navigateur) | interface seule |
| `follow-pbet` | views.js:425 | — | — | localStorage (compte du navigateur) | interface seule |
| `share` | views.js:426 | — | — | localStorage (compte du navigateur) | interface seule |
| `share-pick` | views.js:427 | badges, blockedShown, clanLive, followed, notifs, xp | messages de chat | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `cite` | views.js:428 | — | — | localStorage (compte du navigateur) | interface seule |
| `cite-pick` | views.js:429 | — | — | localStorage (compte du navigateur) | interface seule |
| `lock` | views.js:430 | — | — | localStorage (compte du navigateur) | interface seule |
| `tier` | views.js:430 | — | — | localStorage (compte du navigateur) | interface seule |
| `claim` | views.js:431 | badges, blockedShown, clanLive, notifs, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `propose` | views.js:432 | — | — | localStorage (compte du navigateur) | interface seule |
| `stats` | views.js:432 | — | — | localStorage (compte du navigateur) | interface seule |
| `dm` | views.js:433 | — | messages de chat | localStorage (compte du navigateur) | local à ce navigateur, non partagé |
| `follow-user` | views.js:434 | clanLive, following | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `lbp` | views.js:435 | — | — | localStorage (compte du navigateur) | interface seule |
| `ptab` | views.js:435 | — | — | localStorage (compte du navigateur) | interface seule |
| `watch` | views.js:436 | clanLive, watch | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `copylink` | views.js:437 | — | — | localStorage (compte du navigateur) | interface seule |
| `search-open` | views.js:437 | — | — | localStorage (compte du navigateur) | interface seule |
| `search-close` | views.js:437 | — | — | localStorage (compte du navigateur) | interface seule |
| `copy` | views.js:437 | — | — | localStorage (compte du navigateur) | interface seule |
| `coin` | views.js:438 | — | — | localStorage (compte du navigateur) | interface seule |
| `net` | views.js:438 | — | — | localStorage (compte du navigateur) | interface seule |
| `sim-dep` | views.js:438 | — | — | localStorage (compte du navigateur) | interface seule |
| `wnet` | views.js:439 | — | — | localStorage (compte du navigateur) | interface seule |
| `wd-test` | views.js:439 | — | — | localStorage (compte du navigateur) | interface seule |
| `wd-max` | views.js:440 | — | — | localStorage (compte du navigateur) | interface seule |
| `withdraw` | views.js:441 | balance, clanLive, notifs, wds | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `notifs` | views.js:442 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `npanel-close` | views.js:442 | — | — | localStorage (compte du navigateur) | interface seule |
| `close` | views.js:443 | — | — | localStorage (compte du navigateur) | interface seule |
| `feed-down` | views.js:443 | — | — | localStorage (compte du navigateur) | interface seule |
| `rankup-close` | views.js:443 | — | — | localStorage (compte du navigateur) | interface seule |
| `reset` | views.js:444 | — | — | localStorage (compte du navigateur) | interface seule |
| `noop` | views.js:444 | — | — | localStorage (compte du navigateur) | interface seule |

## Formulaires (13)

| Formulaire | Où | Champs de `S.me` modifiés | État partagé modifié | Persistance en mode Démo | Persistance en mode Compte (état actuel) |
|---|---|---|---|---|---|
| `kyc` | account.js:59 | clanLive, kyc, kycAt, notifs | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `create` | auth.js:29 | badges, blockedShown, clanLive, notifs, props, xp | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `signup` | auth.js:74 | balance, deps, notifs, refBy, refCode | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `pwchange` | auth.js:224 | clanLive, notifs | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `clcode` | clans.js:175 | clan, clanLive, clanVol, clanXP, notifs | messages de chat | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `clan` | clans.js:176 | balance, clan, clanCreated, clanLive, clanVol, clanXP, notifs, realized | messages de chat | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `profile` | copy.js:46 (remplace auth.js:225) | clanLive, copiers | — | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `pro-txt` | pro2.js:275 | clanLive | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `rglim` | responsible.js:72 | clanLive, rg | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `login` | supabase.js:99 (remplace auth.js:73) | (objet entier), balance, bestStreak, clan, clanLive, clanSeeded, clanVol, clanXP, color, comboSeeded, combos, contraWins, copiers, createdAt, deposits, duelSeedLang, duelSeeded, duelWins, duels, email, flashBest, flashProfit, flashStreak, flashWins, followed, followers, freqIn, freqOut, friends, history, kyc, logged, msgsTotal, n, notifs, onboarded, photo, played, realized, rg, settled, stacks, streak, wins, xp | messages de chat, fiches joueurs | localStorage (compte du navigateur) | ANNULÉ en 15 s max (B05) |
| `forgot` | supabase.js:137 (remplace auth.js:77) | — | — | localStorage (compte du navigateur) | interface seule |
| `settings` | views.js:451 | clanLive, n | — | localStorage (compte du navigateur) | blob JSON toutes les 17 s (fragile : B06, B07) |
| `simdep` | views.js:452 | badges, balance, blockedShown, clanLive, depDay, deposits, deps, notifs, rg, xp | messages de chat | localStorage (compte du navigateur) | RPC demo_deposit (partiel) |

## Écrans (26)

| Écran | Où | Champs de `S.me` modifiés au rendu | État partagé modifié | — | — |
|---|---|---|---|---|---|
| `creer` | auth.js:112 | — | — | — | affichage |
| `connexion` | auth.js:112 | — | — | — | affichage |
| `inscription` | auth.js:112 | — | — | — | affichage |
| `bienvenue` | auth.js:112 | — | — | — | affichage |
| `modifier` | auth.js:234 | — | — | — | affichage |
| `amis` | auth.js:332 | — | — | — | affichage |
| `blitz` | blitz.js:188 | — | — | — | affichage |
| `serie` | blitz.js:188 | — | — | — | affichage |
| `clans` | clans.js:230 | — | — | — | affichage |
| `clan` | clans.js:230 | — | — | — | affichage |
| `combines` | combos.js:91 | — | — | — | affichage |
| `copie` | copy.js:311 | — | — | — | affichage |
| `duels` | duels.js:190 | — | — | — | affichage |
| `duel` | duels.js:190 | — | — | — | affichage |
| `marche` | groups.js:59 (remplace views.js:366) | — | — | — | affichage |
| `parrainage` | referral.js:103 | — | — | — | affichage |
| `responsable` | responsible.js:197 | — | — | — | affichage |
| `accueil` | views.js:366 | — | — | — | affichage |
| `eclair` | views.js:366 | — | — | — | affichage |
| `chat` | views.js:366 | — | — | — | affichage |
| `classement` | views.js:366 | — | — | — | affichage |
| `rang` | views.js:366 | — | — | — | affichage |
| `profil` | views.js:366 | — | — | — | affichage |
| `joueur` | views.js:366 | — | — | — | affichage |
| `depot` | views.js:366 | — | — | — | affichage |
| `retrait` | views.js:366 | — | — | — | affichage |

## Minuteurs (35 setInterval, 49 setTimeout)

| Type | Où | Délai | Ce qui est lancé |
|---|---|---|---|
| setInterval | core.js:308 | 170 | `()=>{addBet(m,{s:side==='oui'?1:0,a:.25+R()*.75,me:0});const old=m.p;m.p=clamp(m.p+(side==` |
| setInterval | views.js:318 | 650 | `()=>{if(ep!==S.epoch){clearInterval(iv);return;}d.conf++;refreshDeps();if(d.conf>=d.need){` |
| setInterval | account.js:53 | m==='bank'?700:650 | `()=>{if(ep!==S.epoch){clearInterval(iv);return;}d.conf++;refreshDeps();if(d.conf>=d.need){` |
| setInterval | copy.js:315 | 4000 | `live(copyGuard)` |
| setInterval | copy.js:315 | 20000 | `live(copyDriver)` |
| setInterval | copy.js:315 | 52000 | `live(botCopier)` |
| setInterval | orders.js:186 | 2000 | `live(ordersTick)` |
| setInterval | referral.js:104 | 70000 | `live(botReferral)` |
| setInterval | responsible.js:198 | 30000 | `live(rgTick)` |
| setInterval | blitz.js:115 | 7000 | `()=>{if(document.hidden\|\|R()<.6)return;const r=bzR();if(!r)return;const L=r.bots.filter(b=` |
| setInterval | blitz.js:200 | 1000 | `()=>{bzTick();serieTick();}` |
| setInterval | clans.js:61 | 700 | `()=>{if(!CTIP\|\|!document.contains(CTIP.a)\|\|!CTIP.a.matches(':hover'))ctipHide();}` |
| setInterval | clans.js:229 | 20000 | `()=>{if(document.hidden)return;const c=myClan();if(!c)return;clanWarTick();clanWeekAward()` |
| setInterval | pro2.js:136 | 5000 | `()=>{if(!PV.open\|\|PV.snap\|\|document.hidden)return;const mm=MK[PV.id],D=PV.D;if(mm&&D&&Math` |
| setInterval | pro2.js:290 | 20000 | `()=>{if(!document.hidden)proStoreSave();}` |
| setInterval | demo.js:182 | 150000 | `()=>{if(!document.hidden&&R()<.4)proBotShare();}` |
| setInterval | boot.js:17 | 90000 | `vis(()=>{if(R()<.35)botFriendRequest();})` |
| setInterval | boot.js:17 | 5200 | `vis(()=>pushBig(false))` |
| setInterval | boot.js:18 | 650 | `vis(botBet)` |
| setInterval | boot.js:18 | 3600 | `vis(()=>{if(R()<.85)botChat();})` |
| setInterval | boot.js:18 | 2600 | `vis(botReact)` |
| setInterval | boot.js:18 | 26000 | `vis(()=>{if(R()<.55)burst();})` |
| setInterval | boot.js:19 | 250 | `flashTick` |
| setInterval | boot.js:19 | 5000 | `duelTick` |
| setInterval | boot.js:19 | 240000 | `vis(duelBotChallenge)` |
| setInterval | boot.js:19 | 10000 | `vis(driftAnchors)` |
| setInterval | boot.js:19 | 1000 | `vis(()=>{refreshLive();syncSellBtns();})` |
| setInterval | boot.js:20 | 2200 | `vis(()=>{if(!XH)refreshCharts();})` |
| setInterval | boot.js:21 | 15000 | `vis(()=>{MARKETS.forEach(growLiq);$$('[data-liq]').forEach(e=>{const k=MK[e.dataset.liq];i` |
| setInterval | boot.js:22 | 3000 | `vis(()=>{S.online=clamp(S.online+Math.round((R()-.48)*14),2200,2900);$$('[data-online]').f` |
| setInterval | boot.js:24 | 1600 | `vis(()=>{voteTick();for(const p of COMM_PROPS){if(R()<.3&&p.for<p.need-2){p.for++;$$(`[dat` |
| setInterval | boot.js:28 | 8000 | `vis(marketsSave)` |
| setInterval | supabase.js:93 | 15000 | `function(){if(uid&&S.me.logged)sbRefresh();}` |
| setInterval | supabase.js:94 | 17000 | `function(){if(uid&&S.me.logged)sbSave();}` |
| setInterval | supabase.js:95 | 20000 | `function(){if(uid&&S.me.logged)sbLoadFriends();}` |

## Clés localStorage (via `LS`)

| Clé | Fichiers |
|---|---|
| `<ACCK>` | account.js |
| `<PRO_KEY>` | pro.js |
| `<SESK>` | account.js, responsible.js |
| `<k>` | account.js |
| `<old>` | account.js |
| `wimoro-ref` | referral.js |
| `wimoro-theme` | account.js |
| `wimoro-tmode` | account.js, boot.js |

## Appels au client Supabase

| Où | Appel |
|---|---|
| supabase.js:17 | `sb.from('user_full_state')` |
| supabase.js:18 | `sb.from('users')` |
| supabase.js:19 | `sb.from('user_stats')` |
| supabase.js:36 | `sb.rpc('get_friends')` |
| supabase.js:55 | `sb.from('user_full_state')` |
| supabase.js:57 | `sb.from('users')` |
| supabase.js:64 | `sb.from('user_stats')` |
| supabase.js:75 | `sb.auth.getSession()` |
| supabase.js:83 | `sb.auth.onAuthStateChange()` |
| supabase.js:106 | `sb.from('users')` |
| supabase.js:109 | `sb.auth.signInWithPassword()` |
| supabase.js:122 | `sb.auth.signUp()` |
| supabase.js:124 | `sb.from('users')` |
| supabase.js:132 | `sb.auth.signOut()` |
| supabase.js:143 | `sb.auth.resetPasswordForEmail()` |
| supabase.js:158 | `sb.rpc('place_bet')` |
| supabase.js:175 | `sb.rpc('sell_position')` |
| supabase.js:195 | `sb.rpc('flash_bet')` |
| supabase.js:208 | `sb.rpc('demo_deposit')` |
| supabase.js:216 | `sb.rpc('get_markets')` |
| supabase.js:222 | `sb.channel('mkt-live')` |
| supabase.js:235 | `sb.rpc('send_chat_message')` |
| supabase.js:240 | `sb.channel('chat-live')` |
| supabase.js:264 | `sb.auth.signOut()` |
