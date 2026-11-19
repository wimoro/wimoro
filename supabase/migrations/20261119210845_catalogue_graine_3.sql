-- Marchés réels, lot 8 (19 nov. 2026) : la graine du catalogue, partie 3 sur 6 — 11 fiches, de « app-store-top-fin-2026 » à « kraken-ipo-juin-2027 ».
-- Texte généré à partir des recherches et des traductions du 19 nov. 2026 (docs/DONNEES.md § 7) ; chaque fiche passe par
-- wm.fiche_creer, avec les mêmes contrôles qu'une fiche écrite par l'équipe. Sans effet sur le site en ligne : catalogue.serveur
-- est éteint, aucune ligne du moteur n'est créée avant la mise en ligne.
select wm.catalogue_semer($graine$[
{
 "id": "app-store-top-fin-2026",
 "nature": "options",
 "categorie": "tech",
 "textes": {
  "fr": {
   "q": "Quelle appli sera n°1 des applis iPhone gratuites aux États-Unis le 31 décembre 2026 ?",
   "court": "Appli n°1 US au 31/12",
   "critere": "gagne l'appli classée 1re du classement officiel Apple « Top Free » iPhone, toutes catégories, boutique des États-Unis, lu le 31/12/2026 à 18:00 UTC (±10 min) dans le flux public https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json, avec capture d'écran. Si le flux est indisponible : capture de l'onglet Classements de l'App Store américain à la même heure. En cas de report ou d'annulation : flux et App Store indisponibles toute la journée = annulé et remboursé."
  },
  "en": {
   "q": "Which app will be #1 among free iPhone apps in the US on December 31, 2026?",
   "court": "#1 free app Dec 31",
   "critere": "the winner is the app ranked 1st in Apple’s official ‘Top Free’ iPhone chart, all categories, US store, read on December 31, 2026 at 18:00 UTC (±10 min) from the public feed https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json, with a screenshot. If the feed is unavailable: screenshot of the Charts tab of the US App Store at the same time. In case of postponement or cancellation: feed and App Store unavailable all day = cancelled and refunded."
  },
  "he": {
   "q": "איזו אפליקציה תדורג ראשונה בין האפליקציות החינמיות לאייפון בארה״ב ב-31 בדצמבר 2026?",
   "court": "האפליקציה מס' 1",
   "critere": "זוכה האפליקציה המדורגת במקום הראשון בדירוג הרשמי של אפל «Top Free» לאייפון, בכל הקטגוריות, בחנות של ארה״ב, כפי שנקרא ב-31 בדצמבר 2026 בשעה 18:00 UTC (±10 דקות) מתוך הפיד הציבורי https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json, עם צילום מסך. אם הפיד אינו זמין: צילום מסך של לשונית הדירוגים (Charts) ב-App Store האמריקאי באותה שעה. במקרה של דחייה או ביטול: הפיד וה-App Store אינם זמינים במשך כל היום = ביטול והחזר כספי."
  }
 },
 "image": {"fichier":"File:Apple logo black.svg","genre":"logo"},
 "ferme_at": "2026-12-31T12:00:00Z",
 "resolution_at": "2026-12-31T18:30:00Z",
 "source": {"nom":"Apple, classement Top Free (États-Unis)","url":"https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "classement lu aujourd'hui à 13:31 UTC : 1. TikTok Pro – Events, 2. Muse from Meta, 3. ChatGPT, 4. Vinted, 5. Claude by Anthropic, 6. Reco Social, 7. Google Gemini. Marché public pour le 20/11 : TikTok Pro – Events 90,5 % (https://polymarket.com/event/1-free-app-in-the-us-apple-app-store-on-november-20, interne). Je baisse fortement le favori à six semaines, car les fêtes de fin d'année peuvent bouleverser le classement (effet non vérifié).",
 "origine": "modele",
 "modele_id": "app-store-mensuel",
 "periode": "2026-12",
 "verifs": ["https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/25/apps.json"],
 "options": [
  {"code":"tiktok","noms":{"fr":"TikTok Pro – Events","en":"TikTok Pro – Events","he":"TikTok Pro – Events"},"p0":35,"image":null},
  {
   "code": "chatgpt",
   "noms": {"fr":"ChatGPT","en":"ChatGPT","he":"ChatGPT"},
   "p0": 22,
   "image": {"fichier":"File:ChatGPT logo.svg","genre":"logo"}
  },
  {
   "code": "muse",
   "noms": {"fr":"Muse from Meta","en":"Muse from Meta","he":"Muse from Meta"},
   "p0": 10,
   "image": {"fichier":"File:Meta Platforms Inc. logo.svg","genre":"logo"}
  },
  {
   "code": "gemini",
   "noms": {"fr":"Google Gemini","en":"Google Gemini","he":"Google Gemini"},
   "p0": 8,
   "image": {"fichier":"File:Google Gemini logo.svg","genre":"logo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":25,"image":null}
 ]
},
{
 "id": "game-awards-2026",
 "nature": "options",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "Quel jeu remportera le titre de Jeu de l'année aux Game Awards 2026 ?",
   "court": "Jeu de l'année TGA 2026",
   "critere": "gagne le jeu proclamé « Game of the Year » pendant la cérémonie des Game Awards 2026, confirmé sur thegameawards.com. En cas d'ex-æquo officiel, gagne le titre qui vient en premier par ordre alphabétique. En cas de report ou d'annulation : report = clôture déplacée ; aucun lauréat au 31/12/2026 = annulé et remboursé."
  },
  "en": {
   "q": "Which game will win Game of the Year at The Game Awards 2026?",
   "court": "TGA 2026 Game of Year",
   "critere": "the winner is the game proclaimed ‘Game of the Year’ during The Game Awards 2026 ceremony, as confirmed on thegameawards.com. In the event of an official tie, the winner is the title that comes first in alphabetical order. In case of postponement or cancellation: postponement = close moved; no winner by December 31, 2026 = cancelled and refunded."
  },
  "he": {
   "q": "איזה משחק יזכה בתואר משחק השנה ב-The Game Awards 2026?",
   "court": "משחק השנה TGA",
   "critere": "זוכה המשחק שהוכרז כ«Game of the Year» במהלך טקס The Game Awards 2026, כפי שאושר באתר thegameawards.com. במקרה של שוויון רשמי, זוכה הכותר שמופיע ראשון לפי סדר אלפביתי. במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; אין זוכה עד 31 בדצמבר 2026 = ביטול והחזר כספי."
  }
 },
 "image": {"fichier":"File:The Game Awards Logo 2024.svg","genre":"logo"},
 "ferme_at": "2026-12-10T23:00:00Z",
 "resolution_at": "2026-12-11T06:00:00Z",
 "source": {"nom":"The Game Awards","url":"https://thegameawards.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "nommés annoncés le 17/11/2026 ; GTA VI en tête avec 8 nominations. Le jeu est sorti le 19/11/2026 sur PS5 et Xbox Series X/S (date limite d'éligibilité : 20/11), noté 99/100 sur Metacritic. Marchés publics : GTA VI 94,7 %, Zelda 3,6 %, RE Requiem 1,1 %, Phantom Blade Zero 0,3 %, Control Resonant 0,2 % (https://polymarket.com/event/the-game-awards-game-of-the-year-20260804145650, interne) ; GTA VI 93 % (https://kalshi.com/markets/kxgameawards, interne). Je garde un plancher de 1 % par nommé.",
 "origine": "modele",
 "modele_id": "game-awards",
 "periode": "2026",
 "verifs": [
  "https://en.wikipedia.org/wiki/The_Game_Awards_2026",
  "https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI",
  "https://www.gematsu.com/2026/11/the-game-awards-2026-nominees-announced"
 ],
 "options": [
  {"code":"gta6","noms":{"fr":"Grand Theft Auto VI","en":"Grand Theft Auto VI","he":"Grand Theft Auto VI"},"p0":91,"image":null},
  {"code":"zelda","noms":{"fr":"Zelda: Ocarina of Time","en":"Zelda: Ocarina of Time","he":"Zelda: Ocarina of Time"},"p0":4,"image":null},
  {"code":"re","noms":{"fr":"Resident Evil Requiem","en":"Resident Evil Requiem","he":"Resident Evil Requiem"},"p0":2,"image":null},
  {"code":"phantom","noms":{"fr":"Phantom Blade Zero","en":"Phantom Blade Zero","he":"Phantom Blade Zero"},"p0":1,"image":null},
  {"code":"bond","noms":{"fr":"007 First Light","en":"007 First Light","he":"007 First Light"},"p0":1,"image":null},
  {"code":"control","noms":{"fr":"Control Resonant","en":"Control Resonant","he":"Control Resonant"},"p0":1,"image":null}
 ]
},
{
 "id": "oscars-2027-meilleur-film",
 "nature": "options",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "Quel film remportera l'Oscar du meilleur film en 2027 ?",
   "court": "Oscar du meilleur film",
   "critere": "gagne le film proclamé « Best Picture » à la 99e cérémonie des Oscars (Dolby Theatre, Hollywood). Un film listé non nommé le 21/01/2027 ne peut plus gagner. Film non listé lauréat = « Autre ». En cas de report ou d'annulation : report = clôture déplacée ; aucun lauréat au 30/06/2027 = annulé et remboursé."
  },
  "en": {
   "q": "Which film will win Best Picture at the 2027 Oscars?",
   "court": "Oscars Best Picture",
   "critere": "the winner is the film proclaimed ‘Best Picture’ at the 99th Academy Awards ceremony (Dolby Theatre, Hollywood). A listed film that is not nominated on January 21, 2027 can no longer win. Unlisted winning film = ‘Other’. In case of postponement or cancellation: postponement = close moved; no winner by June 30, 2027 = cancelled and refunded."
  },
  "he": {
   "q": "איזה סרט יזכה באוסקר לסרט הטוב ביותר ב-2027?",
   "court": "אוסקר לסרט הטוב",
   "critere": "זוכה הסרט שהוכרז כזוכה בפרס «Best Picture» (הסרט הטוב ביותר) בטקס האוסקר ה-99 (Dolby Theatre, הוליווד). סרט שברשימה ולא קיבל מועמדות ב-21 בינואר 2027 אינו יכול עוד לזכות. סרט זוכה שאינו ברשימה = «אחר». במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; אין זוכה עד 30 ביוני 2027 = ביטול והחזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2027-03-14T22:00:00Z",
 "resolution_at": "2027-03-15T06:00:00Z",
 "source": {"nom":"Académie des Oscars","url":"https://www.oscars.org"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "calendrier : vote préliminaire du 7 au 11/12/2026, nominations le 21/01/2027, cérémonie le 14/03/2027, présentée par Conan O'Brien. La presse spécialisée tient The Odyssey pour favori (World of Reel, octobre). A24 fait campagne pour un documentaire en « meilleur film », ce qui serait une première. Marchés publics : The Odyssey 54 %, You Can See Everything 20 %, The Black Ball 11 %, Dune: Part Three 10 % (https://kalshi.com/markets/kxoscarpic, interne) ; The Odyssey 52,5 %, You Can See Everything 22,2 %, La Bola Negra 9,5 %, Dune 8,5 %, Digger 3,1 % (https://polymarket.com/event/oscars-2027-best-picture-winner-20260727173620857, interne).",
 "origine": "modele",
 "modele_id": "oscars",
 "periode": "2027",
 "verifs": [
  "https://en.wikipedia.org/wiki/99th_Academy_Awards",
  "https://www.worldofreel.com/blog/2026/10/6/oscars-2027-the-odyssey-is-still-the-the-best-picture-frontrunner",
  "https://www.motionpictures.org/2026/09/nathan-fielder-lance-oppenheims-elizabeth-holmes-doc-you-can-see-everything-stuns-telluride/",
  "https://www.espinof.com/premios-oscar/javis-van-busca-oscar-bola-negra-representara-a-espana-como-mejor-pelicula-internacional"
 ],
 "options": [
  {"code":"odyssey","noms":{"fr":"The Odyssey","en":"The Odyssey","he":"The Odyssey"},"p0":50,"image":null},
  {"code":"fielder","noms":{"fr":"You Can See Everything","en":"You Can See Everything","he":"You Can See Everything"},"p0":20,"image":null},
  {"code":"bola","noms":{"fr":"La bola negra","en":"The Black Ball","he":"La bola negra"},"p0":10,"image":null},
  {"code":"dune","noms":{"fr":"Dune: Part Three","en":"Dune: Part Three","he":"Dune: Part Three"},"p0":9,"image":null},
  {"code":"digger","noms":{"fr":"Digger","en":"Digger","he":"Digger"},"p0":3,"image":null},
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":8,"image":null}
 ]
},
{
 "id": "grammys-2027-album-de-l-annee",
 "nature": "options",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "Quel album remportera l'album de l'année aux Grammy Awards 2027 ?",
   "court": "Grammy album de l'année",
   "critere": "gagne l'album proclamé « Album of the Year » à la 69e cérémonie des Grammy Awards (Crypto.com Arena, Los Angeles), confirmé sur grammy.com. Ex-æquo officiel = annulé et remboursé. En cas de report ou d'annulation : report = clôture déplacée ; aucune remise au 30/06/2027 = annulé et remboursé."
  },
  "en": {
   "q": "Which album will win Album of the Year at the 2027 Grammys?",
   "court": "Grammys Album of Year",
   "critere": "the winner is the album proclaimed ‘Album of the Year’ at the 69th Grammy Awards ceremony (Crypto.com Arena, Los Angeles), as confirmed on grammy.com. Official tie = cancelled and refunded. In case of postponement or cancellation: postponement = close moved; no award presented by June 30, 2027 = cancelled and refunded."
  },
  "he": {
   "q": "איזה אלבום יזכה בפרס אלבום השנה בטקס הגראמי 2027?",
   "court": "אלבום השנה בגראמי",
   "critere": "זוכה האלבום שהוכרז כ«Album of the Year» בטקס פרסי הגראמי ה-69 (Crypto.com Arena, לוס אנג׳לס), כפי שאושר באתר grammy.com. שוויון רשמי = ביטול והחזר כספי. במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; לא הוענק פרס עד 30 ביוני 2027 = ביטול והחזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2027-02-07T20:00:00Z",
 "resolution_at": "2027-02-08T08:00:00Z",
 "source": {"nom":"Recording Academy (Grammy Awards)","url":"https://www.grammy.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "nominations annoncées le 16/11/2026, cérémonie le 07/02/2027 ; RAYE a le plus de nominations (11). Marché public : Lux 51 %, Rodrigo 26 %, RAYE 11 %, The Art of Loving 9 %, Lost Weekend 4 %, The Life of a Showgirl 3 %, Dandelion 3 %, The Romantic 2 % (https://kalshi.com/markets/kxgramaoty, interne). Total ramené à 100.",
 "origine": "modele",
 "modele_id": "grammys",
 "periode": "2027",
 "verifs": [
  "https://stereogum.com/2518141/album-of-the-year-grammy-nominees-2027-include-rosalia-phoebe-bridgers-taylor-swift/news",
  "https://abc7chicago.com/story/2027-grammy-nominations-announced-live-updates/20038587/"
 ],
 "options": [
  {
   "code": "lux",
   "noms": {"fr":"LUX – Rosalía","en":"LUX – Rosalía","he":"LUX – רוסליה"},
   "p0": 47,
   "image": {"fichier":"File:27th Latin GRAMMY Awards - Red Carpet 0292 -Rosalía Vila Tobella (cropped).jpg","genre":"photo"}
  },
  {
   "code": "rodrigo",
   "noms": {"fr":"you seem pretty sad… – Olivia Rodrigo","en":"you seem pretty sad… – Olivia Rodrigo","he":"you seem pretty sad… – אוליביה רודריגו"},
   "p0": 24,
   "image": {"fichier":"File:Glasto2025-546 (cropped) 2.jpg","genre":"photo"}
  },
  {
   "code": "raye",
   "noms": {"fr":"This Music May Contain Hope – RAYE","en":"This Music May Contain Hope – RAYE","he":"This Music May Contain Hope – ריי"},
   "p0": 10,
   "image": null
  },
  {
   "code": "dean",
   "noms": {"fr":"The Art of Loving – Olivia Dean","en":"The Art of Loving – Olivia Dean","he":"The Art of Loving – אוליביה דין"},
   "p0": 8,
   "image": {"fichier":"File:Olivia Dean - Sabrina Carpenter at BST Hyde Park - 20250706 - 115 (cropped) (cropped).jpg","genre":"photo"}
  },
  {
   "code": "bridgers",
   "noms": {"fr":"Lost Weekend – Phoebe Bridgers","en":"Lost Weekend – Phoebe Bridgers","he":"Lost Weekend – פיבי ברידג'רס"},
   "p0": 4,
   "image": {"fichier":"File:BoygeniusKingstonEarly240823 (29 of 45) (53138924957) Cropped.jpg","genre":"photo"}
  },
  {
   "code": "swift",
   "noms": {"fr":"The Life of a Showgirl – Taylor Swift","en":"The Life of a Showgirl – Taylor Swift","he":"The Life of a Showgirl – טיילור סוויפט"},
   "p0": 3,
   "image": {"fichier":"File:Taylor Swift at the 2023 MTV Video Music Awards (3).png","genre":"photo"}
  },
  {
   "code": "langley",
   "noms": {"fr":"Dandelion – Ella Langley","en":"Dandelion – Ella Langley","he":"Dandelion – אלה לנגלי"},
   "p0": 2,
   "image": {"fichier":"File:Ella Langley 2026 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "mars",
   "noms": {"fr":"The Romantic – Bruno Mars","en":"The Romantic – Bruno Mars","he":"The Romantic – ברונו מארס"},
   "p0": 2,
   "image": {"fichier":"File:BrunoMars24KMagicWorldTourLive (cropped).jpg","genre":"photo"}
  }
 ]
},
{
 "id": "ucl-winner-2026-27",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui remportera la Ligue des champions 2026-2027 ?",
   "court": "Vainqueur LDC 2026-27",
   "critere": "club qui remporte la finale (prolongation et tirs au but compris). Une option devient perdante dès que le club est éliminé."
  },
  "en": {
   "q": "Who will win the 2026-27 UEFA Champions League?",
   "court": "UCL winner 2026-27",
   "critere": "club that wins the final (including extra time and penalty shoot-out). An option becomes a losing one as soon as the club is eliminated."
  },
  "he": {
   "q": "מי תזכה בליגת האלופות 2026-27?",
   "court": "זוכת ליגת האלופות 27",
   "critere": "המועדון שזוכה בגמר (כולל הארכה ודו-קרב פנדלים). אופציה הופכת למפסידה ברגע שהמועדון מודח."
  }
 },
 "image": null,
 "ferme_at": "2027-06-05T19:00:00Z",
 "resolution_at": "2027-06-05T22:00:00Z",
 "source": {"nom":"UEFA","url":"https://www.uefa.com/uefachampionsleague/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "prix d'un marché prédictif public ce jour (milieu achat/vente) : Barcelone 0,225 ; PSG 0,185 ; Arsenal 0,135 ; Real 0,135 ; Bayern 0,125 ; City 0,055 ; Liverpool 0,0355 ; les 29 autres clubs encore listés font 0,119 ensemble. Total 1,0145 → on divise par 1,0145 : 22,18 / 18,24 / 13,31 / 13,31 / 12,32 / 5,42 / 3,50 / 11,73 → arrondi 22 / 18 / 13 / 13 / 12 / 6 / 4 / 12.",
 "origine": "modele",
 "modele_id": "ucl",
 "periode": "2026-27",
 "verifs": [
  "https://gamma-api.polymarket.com/events?slug=uefa-champions-league-2027-champion-20260701202025549",
  "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20261124",
  "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20261125",
  "https://www.beinsports.com/en-us/soccer/uefa-champions-league/articles/when-and-where-will-the-2026-27-uefa-champions-league-final-be-played-2026-08-20",
  "https://global.espn.com/football/story/_/id/46222719/madrid-metropolitano-stadium-host-27-champions-league-final"
 ],
 "options": [
  {"code":"bar","noms":{"fr":"FC Barcelone","en":"Barcelona","he":"ברצלונה"},"p0":22,"image":null},
  {"code":"psg","noms":{"fr":"Paris Saint-Germain","en":"Paris Saint-Germain","he":"פריז סן ז'רמן"},"p0":18,"image":null},
  {"code":"ars","noms":{"fr":"Arsenal","en":"Arsenal","he":"ארסנל"},"p0":13,"image":null},
  {"code":"rma","noms":{"fr":"Real Madrid","en":"Real Madrid","he":"ריאל מדריד"},"p0":13,"image":null},
  {
   "code": "bay",
   "noms": {"fr":"Bayern Munich","en":"Bayern Munich","he":"באיירן מינכן"},
   "p0": 12,
   "image": {"fichier":"File:FC Bayern München logo (2017).svg","genre":"logo"}
  },
  {"code":"mci","noms":{"fr":"Manchester City","en":"Manchester City","he":"מנצ'סטר סיטי"},"p0":6,"image":null},
  {"code":"liv","noms":{"fr":"Liverpool","en":"Liverpool","he":"ליברפול"},"p0":4,"image":null},
  {"code":"other","noms":{"fr":"Autre club","en":"Other club","he":"קבוצה אחרת"},"p0":12,"image":null}
 ]
},
{
 "id": "nba-champion-2027",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Sport",
 "textes": {
  "fr": {"q":"Qui sera champion NBA en 2027 ?","court":"Champion NBA 2027","critere":"équipe qui gagne les Finales NBA 2027 (4 victoires)."},
  "en": {"q":"Who will win the 2027 NBA championship?","court":"NBA champion 2027","critere":"team that wins the 2027 NBA Finals (4 wins)."},
  "he": {"q":"מי תזכה באליפות ה-NBA ב-2027?","court":"אלופת ה-NBA 2027","critere":"הקבוצה שזוכה בגמר ה-NBA של 2027 (4 ניצחונות)."}
 },
 "image": null,
 "ferme_at": "2027-06-01T00:00:00Z",
 "resolution_at": "2027-06-25T00:00:00Z",
 "source": {"nom":"NBA","url":"https://www.nba.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "marché prédictif public ce jour : Spurs 0,225 ; Thunder 0,135 ; Celtics 0,105 ; 76ers 0,0945 ; Knicks 0,075 ; Wolves 0,0685 ; Rockets 0,0525 ; Lakers 0,0475 ; total des 30 équipes 1,045 → division par 1,045 : 21,53 / 12,92 / 10,05 / 9,04 / 7,18 / 6,56 / 5,02 / 4,55 / autres 23,16 → arrondi 21 / 13 / 10 / 9 / 7 / 7 / 5 / 5 / 23.",
 "origine": "modele",
 "modele_id": "nba",
 "periode": "2026-27",
 "verifs": [
  "https://gamma-api.polymarket.com/events?slug=nba-2027-champion",
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261121",
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?team=15",
  "https://www.nba.com/news/key-dates"
 ],
 "options": [
  {"code":"sas","noms":{"fr":"San Antonio Spurs","en":"San Antonio Spurs","he":"סן אנטוניו ספרס"},"p0":21,"image":null},
  {"code":"okc","noms":{"fr":"Oklahoma City Thunder","en":"Oklahoma City Thunder","he":"אוקלהומה סיטי ת'אנדר"},"p0":13,"image":null},
  {"code":"bos","noms":{"fr":"Boston Celtics","en":"Boston Celtics","he":"בוסטון סלטיקס"},"p0":10,"image":null},
  {"code":"phi","noms":{"fr":"Philadelphia 76ers","en":"Philadelphia 76ers","he":"פילדלפיה סבנטי סיקסרס"},"p0":9,"image":null},
  {"code":"nyk","noms":{"fr":"New York Knicks","en":"New York Knicks","he":"ניו יורק ניקס"},"p0":7,"image":null},
  {"code":"min","noms":{"fr":"Minnesota Timberwolves","en":"Minnesota Timberwolves","he":"מינסוטה טימברוולבס"},"p0":7,"image":null},
  {"code":"hou","noms":{"fr":"Houston Rockets","en":"Houston Rockets","he":"יוסטון רוקטס"},"p0":5,"image":null},
  {
   "code": "lal",
   "noms": {"fr":"Los Angeles Lakers","en":"Los Angeles Lakers","he":"לוס אנג'לס לייקרס"},
   "p0": 5,
   "image": {"fichier":"File:Los Angeles Lakers logo.svg","genre":"logo"}
  },
  {"code":"other","noms":{"fr":"Autre équipe","en":"Other team","he":"קבוצה אחרת"},"p0":23,"image":null}
 ]
},
{
 "id": "pl-winner-2026-27",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui sera champion de Premier League 2026-2027 ?",
   "court": "Champion PL 2026-27",
   "critere": "1er du classement officiel de la Premier League après la dernière journée (en tenant compte des retraits de points appliqués pendant la saison). Une décision prise après cette date (titre retiré, etc.) ne change pas le résultat du marché."
  },
  "en": {
   "q": "Who will win the 2026-27 Premier League?",
   "court": "PL winner 2026-27",
   "critere": "1st place in the official Premier League table after the final matchday (taking into account any point deductions applied during the season). A decision made after that date (title stripped, etc.) does not change the market result."
  },
  "he": {
   "q": "מי תזכה באליפות הפרמייר ליג 2026-27?",
   "court": "אלופת הפרמייר ליג 27",
   "critere": "המקום הראשון בטבלה הרשמית של הפרמייר ליג אחרי המחזור האחרון (בהתחשב בהורדות נקודות שהוחלו במהלך העונה). החלטה שתתקבל אחרי מועד זה (שלילת תואר וכדומה) אינה משנה את תוצאת השוק."
  }
 },
 "image": null,
 "ferme_at": "2027-05-30T15:00:00Z",
 "resolution_at": "2027-05-30T18:00:00Z",
 "source": {"nom":"Premier League","url":"https://www.premierleague.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "marché prédictif public ce jour : Arsenal 0,755 ; Brighton 0,0695 ; Liverpool 0,055 ; City 0,055 ; Chelsea 0,0145 ; 15 autres clubs 0,0205 ; total 0,9695 → division par 0,9695 : 77,88 / 7,17 / 5,67 / 5,67 / 1,50 / 2,11 → arrondi 78 / 7 / 6 / 6 / 1 / 2.",
 "origine": "modele",
 "modele_id": "pl",
 "periode": "2026-27",
 "verifs": [
  "https://gamma-api.polymarket.com/events?slug=epl-2027-champion-20260701200428749",
  "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings",
  "https://www.premierleague.com/en/news/4625358"
 ],
 "options": [
  {"code":"ars","noms":{"fr":"Arsenal","en":"Arsenal","he":"ארסנל"},"p0":78,"image":null},
  {"code":"bha","noms":{"fr":"Brighton","en":"Brighton & Hove Albion","he":"ברייטון"},"p0":7,"image":null},
  {"code":"liv","noms":{"fr":"Liverpool","en":"Liverpool","he":"ליברפול"},"p0":6,"image":null},
  {"code":"mci","noms":{"fr":"Manchester City","en":"Manchester City","he":"מנצ'סטר סיטי"},"p0":6,"image":null},
  {"code":"che","noms":{"fr":"Chelsea","en":"Chelsea","he":"צ'לסי"},"p0":1,"image":null},
  {"code":"other","noms":{"fr":"Autre club","en":"Other club","he":"קבוצה אחרת"},"p0":2,"image":null}
 ]
},
{
 "id": "ao-men-2027",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Sport",
 "textes": {
  "fr": {
   "q": "Qui remportera le simple messieurs de l'Open d'Australie 2027 ?",
   "court": "Open d'Australie 2027 H",
   "critere": "vainqueur officiel du simple messieurs. Si le tournoi n'a pas lieu : marché annulé. Un joueur qui ne participe pas devient perdant."
  },
  "en": {
   "q": "Who will win the 2027 Australian Open men's singles title?",
   "court": "AO 2027 men's winner",
   "critere": "official winner of the men’s singles. If the tournament does not take place: market cancelled. A player who does not take part becomes a losing option."
  },
  "he": {
   "q": "מי יזכה באליפות אוסטרליה הפתוחה 2027 ביחידים לגברים?",
   "court": "אליפות אוסטרליה 2027",
   "critere": "הזוכה הרשמי בתחרות היחידים לגברים. אם הטורניר אינו מתקיים: השוק מבוטל. שחקן שאינו משתתף הופך לאופציה מפסידה."
  }
 },
 "image": null,
 "ferme_at": "2027-01-31T08:30:00Z",
 "resolution_at": "2027-01-31T13:00:00Z",
 "source": {"nom":"Open d’Australie","url":"https://ausopen.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "marché prédictif public ce jour (25 joueurs, somme des milieux = 1,000) : Alcaraz 0,47 ; Zverev 0,155 ; Sinner 0,12 ; Shelton 0,055 ; Medvedev 0,035 ; Djokovic 0,025 ; tous les autres 0,14 (dont Jódar, Fils, Fritz 0,015 chacun). Arrondi 47 / 16 / 12 / 6 / 3 / 2 / 14 (les égalités à ,5 départagées par le dernier prix échangé : Zverev 0,16, Shelton 0,07).",
 "origine": "modele",
 "modele_id": "ao-hommes",
 "periode": "2027",
 "verifs": [
  "https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXATP-27AO",
  "https://www.thestar.com.my/sport/tennis/2026/11/10/tennis-sinner-positive-on-australian-open-prospects-but-won039t-rush-return",
  "https://www.melbournepark.com.au/event/australian-open-2027/",
  "https://commons.wikimedia.org/w/api.php"
 ],
 "options": [
  {
   "code": "alcaraz",
   "noms": {"fr":"Carlos Alcaraz","en":"Carlos Alcaraz","he":"קרלוס אלקראס"},
   "p0": 47,
   "image": {"fichier":"File:Carlos Alcaraz Wimbledon 2025 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "zverev",
   "noms": {"fr":"Alexander Zverev","en":"Alexander Zverev","he":"אלכסנדר זברב"},
   "p0": 16,
   "image": {"fichier":"File:BMW Open 2025 Zverev Aufschlag.jpg","genre":"photo"}
  },
  {
   "code": "sinner",
   "noms": {"fr":"Jannik Sinner","en":"Jannik Sinner","he":"יאניק סינר"},
   "p0": 12,
   "image": {"fichier":"File:Jannik Sinner 2025 US Open.jpg","genre":"photo"}
  },
  {
   "code": "shelton",
   "noms": {"fr":"Ben Shelton","en":"Ben Shelton","he":"בן שלטון"},
   "p0": 6,
   "image": {"fichier":"File:Ben Shelton (2025 DC Open) 02.jpg","genre":"photo"}
  },
  {
   "code": "medvedev",
   "noms": {"fr":"Daniil Medvedev","en":"Daniil Medvedev","he":"דניל מדבדב"},
   "p0": 3,
   "image": {"fichier":"File:Daniil Medvedev US Open 2023 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "djokovic",
   "noms": {"fr":"Novak Djokovic","en":"Novak Djokovic","he":"נובאק ג'וקוביץ'"},
   "p0": 2,
   "image": {"fichier":"File:Novak Djokovic at 2025 Miami Open (cropped).jpg","genre":"photo"}
  },
  {"code":"other","noms":{"fr":"Autre joueur","en":"Other player","he":"שחקן אחר"},"p0":14,"image":null}
 ]
},
{
 "id": "btc-vs-or-2026",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "Le Bitcoin fera-t-il mieux que l'or sur l'ensemble de l'année 2026 ?",
   "court": "Bitcoin bat l'or en 2026",
   "critere": "OUI si la performance 2026 du Bitcoin est strictement supérieure à celle de l'or. Bitcoin = clôture de la bougie journalière BTC-USD de Coinbase du 31/12/2026 ÷ clôture de celle du 31/12/2025 (87 497,94 $) − 1. Or = LBMA Gold Price PM du 31/12/2026 ÷ LBMA Gold Price PM du 31/12/2025 − 1 (même règle de repli que or-fin-decembre-2026 si pas de prix PM). En cas de report ou d'annulation : si une donnée manque, mêmes secours que btc-fin-decembre-2026 (Kraken) et or-fin-decembre-2026 ; pas d'annulation pour simple retard de publication."
  },
  "en": {
   "q": "Will Bitcoin outperform gold over 2026?",
   "court": "Bitcoin beats gold 2026",
   "critere": "YES if Bitcoin’s 2026 performance is strictly above that of gold. Bitcoin = close of the Coinbase BTC-USD daily candle of December 31, 2026 ÷ close of that of December 31, 2025 ($87,497.94) − 1. Gold = LBMA Gold Price PM of December 31, 2026 ÷ LBMA Gold Price PM of December 31, 2025 − 1 (same fallback rule as or-fin-decembre-2026 if there is no PM price). In case of postponement or cancellation: if a data point is missing, same fallbacks as btc-fin-decembre-2026 (Kraken) and or-fin-decembre-2026; no cancellation for a mere publication delay."
  },
  "he": {
   "q": "האם הביטקוין יניב תשואה טובה יותר מהזהב בשנת 2026?",
   "court": "ביטקוין מול זהב 2026",
   "critere": "כן אם התשואה של הביטקוין ב-2026 גבוהה ממש מזו של הזהב. ביטקוין = סגירת הנר היומי של BTC-USD ב-Coinbase מ-31 בדצמבר 2026 ÷ סגירת הנר מ-31 בדצמבר 2025 (87,497.94 דולר) − 1. זהב = LBMA Gold Price PM מ-31 בדצמבר 2026 ÷ LBMA Gold Price PM מ-31 בדצמבר 2025 − 1 (אותו כלל חלופי כמו ב-or-fin-decembre-2026 אם אין מחיר PM). במקרה של דחייה או ביטול: אם נתון כלשהו חסר, אותם מקורות חלופיים כמו ב-btc-fin-decembre-2026 (Kraken) וב-or-fin-decembre-2026; אין ביטול בשל עיכוב בפרסום בלבד."
  }
 },
 "image": {"fichier":"File:Bitcoin.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-01T12:00:00Z",
 "source": {"nom":"Coinbase Exchange et LBMA","url":"https://www.lbma.org.uk/prices-and-data/precious-metal-prices"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 13,
 "p0_justif": "depuis le 31/12/2025, Bitcoin −27,2 % (87 497,94 → 63 674 $) ; or −14,2 % (contrat COMEX le plus proche : 4 341,10 → 3 723 $, utilisé ici comme approximation du LBMA). Il faudrait que le rapport BTC/or monte de 17,9 % en 6 semaines. σ du rapport ≈ 47 % (σ BTC 45 %, σ or 24 %, corrélation supposée 0,2) → σ√T = 0,16 → P = N((ln(0,8485) − 0,0128)/0,16) = 13,3 %. Marché public (interne) : 13,5 %. Retenu 13 %.",
 "origine": "actu",
 "verifs": [
  "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400",
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1y&interval=1d",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=crypto&order=volume&ascending=false"
 ]
},
{
 "id": "strategy-vente-btc-2026",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "Strategy (ex-MicroStrategy) annoncera-t-elle une vente de bitcoins d'ici le 31 décembre 2026 ?",
   "court": "Strategy vend du BTC ?",
   "critere": "OUI si Strategy Inc. déclare officiellement (formulaire 8-K, communiqué ou page officielle de suivi de ses bitcoins) avoir vendu des bitcoins à une date comprise entre le 19/11/2026 et le 31/12/2026, l'annonce étant faite au plus tard le 08/01/2027 ; une vente compte même si la société achète davantage sur la même période. Les transferts entre portefeuilles, prêts ou nantissements ne comptent pas. Sinon NON. En cas de report ou d'annulation : en cas de fusion ou de changement de nom, l'entité qui détient les bitcoins de Strategy reste visée."
  },
  "en": {
   "q": "Will Strategy (formerly MicroStrategy) announce a bitcoin sale by December 31, 2026?",
   "court": "Strategy sells BTC?",
   "critere": "YES if Strategy Inc. officially declares (Form 8-K, press release or official page tracking its bitcoin holdings) that it sold bitcoins on a date between November 19, 2026 and December 31, 2026, with the announcement made no later than January 8, 2027; a sale counts even if the company buys more over the same period. Transfers between wallets, loans or pledges do not count. Otherwise NO. In case of postponement or cancellation: in the event of a merger or name change, the entity holding Strategy’s bitcoins remains the one covered."
  },
  "he": {
   "q": "האם חברת Strategy (לשעבר MicroStrategy) תודיע על מכירת ביטקוין עד 31 בדצמבר 2026?",
   "court": "Strategy מוכרת ביטקוין?",
   "critere": "כן אם Strategy Inc. מצהירה באופן רשמי (טופס 8-K, הודעה לעיתונות או הדף הרשמי למעקב אחר אחזקות הביטקוין שלה) שמכרה ביטקוינים במועד שבין 19 בנובמבר 2026 ל-31 בדצמבר 2026, ובלבד שההודעה נמסרה לא יאוחר מ-8 בינואר 2027; מכירה נחשבת גם אם החברה קונה כמות גדולה יותר באותה תקופה. העברות בין ארנקים, הלוואות או שעבודים אינם נחשבים. אחרת לא. במקרה של דחייה או ביטול: במקרה של מיזוג או שינוי שם, הישות המחזיקה בביטקוינים של Strategy נותרת הישות הרלוונטית."
  }
 },
 "image": {"fichier":"File:Strategy logo (2025).svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-08T23:00:00Z",
 "source": {"nom":"SEC EDGAR (Strategy Inc)","url":"https://www.sec.gov/edgar/search/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 35,
 "p0_justif": "Strategy a vendu des bitcoins plusieurs fois en 2026 (32 BTC le 1er juin pour un dividende ; ≈ 216 M$ début juillet ; 1 638 BTC début août ; 5 552 BTC vendus au T3 selon une analyse de ses dépôts SEC), puis est redevenue acheteuse : 811 BTC (2/11), 1 036 BTC (9/11), 485 BTC (16/11), 850 849 BTC détenus au 15/11, réserve de 4,75 Md$ en dollars. Depuis, l'action a perdu 41 % en 20 séances (90,32 $ le 18/11) et le BTC 23 % en 30 jours ; sa politique (annoncée fin 2025, élargie en juin 2026 quand la société a valu moins que ses bitcoins) autorise des ventes pour financer dividendes et rachats. Pas de marché public trouvé sur cette question précise : estimation 35 % (incertaine).",
 "origine": "actu",
 "verifs": [
  "https://theblock.co/news/business/2026-11-16-this-dip-could-use-a-little-orange-michael-saylor-strategy-bitcoin-tumbles-440886",
  "https://theblock.co/news/business/2026-11-09-connecting-the-dots-michael-saylor-strategy-bitcoin-436094",
  "https://fortune.com/2026/07/06/michael-saylor-strategy-216-million-bitcoin-sale-largest-ever/",
  "https://fxstreet.com/cryptocurrencies/news/strategy-offloads-1-638-bitcoin-sells-mstr-shares-as-usd-reserves-reach-4b-202608031720",
  "https://sec-api.io/insights/strategy-mstr-q3-2026-earnings-sec-filing-analysis",
  "https://query1.finance.yahoo.com/v8/finance/chart/MSTR?range=1y&interval=1d"
 ]
},
{
 "id": "kraken-ipo-juin-2027",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "La plateforme crypto Kraken entrera-t-elle en Bourse d'ici le 30 juin 2027 ?",
   "court": "Kraken en Bourse 06/2027",
   "critere": "OUI si des actions de Payward, Inc. (société mère de Kraken) ou de son successeur commencent à être échangées sur une bourse réglementée (Nasdaq, NYSE ou bourse étrangère réglementée) au plus tard le 30/06/2027 23:59 heure de New York, que ce soit par introduction classique, cotation directe ou fusion avec une société d'acquisition (SPAC) ; sinon NON. Un simple dépôt de dossier ou l'annonce d'un prix ne suffit pas : il faut la première cotation. En cas de report ou d'annulation : un report au-delà du 30/06/2027 donne NON."
  },
  "en": {
   "q": "Will the crypto exchange Kraken go public by June 30, 2027?",
   "court": "Kraken IPO by June 2027",
   "critere": "YES if shares of Payward, Inc. (Kraken’s parent company) or of its successor begin trading on a regulated exchange (Nasdaq, NYSE or a regulated foreign exchange) no later than June 30, 2027 23:59 New York time, whether through a traditional IPO, a direct listing or a merger with a special purpose acquisition company (SPAC); otherwise NO. A mere filing or a price announcement is not enough: the first listing is required. In case of postponement or cancellation: a postponement beyond June 30, 2027 results in NO."
  },
  "he": {
   "q": "האם בורסת הקריפטו קראקן תונפק בבורסה עד 30 ביוני 2027?",
   "court": "הנפקת קראקן עד 6.2027",
   "critere": "כן אם מניות של Payward, Inc. (חברת האם של Kraken) או של החברה היורשת שלה מתחילות להיסחר בבורסה מוסדרת (נאסד״ק, NYSE או בורסה זרה מוסדרת) לא יאוחר מ-30 ביוני 2027 בשעה 23:59 שעון ניו יורק, בין באמצעות הנפקה רגילה, רישום ישיר למסחר או מיזוג עם חברת רכש ייעודית (SPAC); אחרת לא. הגשת מסמכים בלבד או הודעה על מחיר אינן מספיקות: נדרשת תחילת המסחר בפועל. במקרה של דחייה או ביטול: דחייה אל מעבר ל-30 ביוני 2027 משמעה לא."
  }
 },
 "image": {"fichier":"File:K-logo-wikipedia.svg","genre":"logo"},
 "ferme_at": "2027-06-29T23:59:00Z",
 "resolution_at": "2027-07-01T04:00:00Z",
 "source": {"nom":"Kraken (blog officiel)","url":"https://blog.kraken.com/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 22,
 "p0_justif": "dépôt confidentiel en novembre 2025, préparation suspendue en mars 2026 (repli du marché crypto), dépôt confirmé en avril 2026 (valorisation ≈ 13,3 Md$) ; selon une information de mars 2026, pas d'introduction avant le 2e trimestre 2027. Marché public (interne) : 24,5 % avant le 30/06/2027 (achat 20 %, vente 29 %), 6 % avant le 31/03/2027, 2,3 % avant fin 2026. Le marché crypto a encore baissé depuis (BTC −23 % en 30 j). Retenu 22 %.",
 "origine": "actu",
 "verifs": [
  "https://www.financemagnates.com/cryptocurrency/kraken-parent-pushes-ipo-to-q2-2027-at-earliest/",
  "https://ambcrypto.com/kraken-crypto-ipo-pushed-to-q2-2027-at-earliest-report/",
  "https://thedefiant.io/news/cefi/kraken-confirms-confidential-ipo-filing-as-deutsche-boerse-takes-usd200m-stake",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=crypto&order=volume&ascending=false"
 ]
}
]$graine$::jsonb);

select wm.droits();
