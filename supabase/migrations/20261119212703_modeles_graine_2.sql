-- Marchés réels, lot 10 (19 nov. 2026) : les modèles des marchés permanents, partie 2 sur 2 — 10 modèles, de « cap2-mensuel » à « ao-hommes ».
-- Texte généré (gabarits en trois langues, règles, calendriers) ; vérifié par tests/sql/modeles.spec.mjs.
-- La dernière partie calcule aussitôt les probabilités du modèle, puis lance la tâche wm-ancres (toutes les 30 s).
select wm.modeles_semer($modeles$[
{
 "id": "cap2-mensuel",
 "famille": "classement",
 "categorie": "tech",
 "regle": {"place":"NYSE","ferme_h":"14 hours 30 minutes","resultat_h":"36 hours"},
 "gabarit": {
  "fr": {
   "q": "Quelle entreprise sera la 2e capitalisation boursière mondiale le {D} ?",
   "court": "2e capitalisation {d}",
   "critere": "Gagne l'entreprise classée 2e mondiale par capitalisation boursière à la clôture du {D}, d'après le classement de companiesmarketcap.com relevé après la clôture américaine (après 21:00 UTC). En cas de doute, on recalcule avec le cours de clôture multiplié par le nombre d'actions publié dans les documents officiels. En cas de report ou d'annulation : marchés fermés ce jour-là, on prend la dernière clôture disponible."
  },
  "en": {
   "q": "Which company will be the world's second-largest by market cap on {D}?",
   "court": "#2 market cap {d}",
   "critere": "The winner is the company ranked 2nd in the world by market capitalization at the close on {D}, according to the companiesmarketcap.com ranking read after the US close (after 21:00 UTC). In case of doubt, it is recalculated with the closing price multiplied by the number of shares published in official filings. If postponed or cancelled: if markets are closed that day, the last available close is used."
  },
  "he": {
   "q": "איזו חברה תהיה השנייה בשווי השוק בעולם ב-{D}?",
   "court": "מקום 2 בשווי שוק {d}",
   "critere": "זוכה החברה המדורגת שנייה בעולם בשווי השוק בסגירת המסחר ב-{D}, לפי דירוג companiesmarketcap.com שנקרא לאחר הסגירה האמריקאית (אחרי 21:00 UTC). במקרה של ספק, החישוב ייעשה מחדש לפי מחיר הסגירה כפול מספר המניות שפורסם בדיווחים הרשמיים. במקרה של דחייה או ביטול: אם השווקים סגורים באותו יום, ייעשה שימוש בסגירה האחרונה הזמינה."
  }
 }
},
{
 "id": "starship",
 "famille": "edition",
 "categorie": "tech",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":1},
 "gabarit": {
  "fr": {
   "q": "SpaceX lancera-t-elle le vol 16 de Starship avant le 1er janvier 2027 ?",
   "court": "Starship vol 16 en 2026",
   "critere": "OUI si le lanceur Starship complet (Super Heavy + vaisseau), pour le vol d'essai intégré qui suit le vol 15 du 13/11/2026 (« Flight 16 »), décolle avant le 1er janvier 2027 00:00 UTC, quel que soit le résultat de la mission. Les essais statiques et les arrêts sur le pas de tir ne comptent pas. Si SpaceX renumérote, c'est le prochain vol intégré après le vol 15 qui compte. En cas de report ou d'annulation : un report après le 31/12 = NON."
  },
  "en": {
   "q": "Will SpaceX launch Starship Flight 16 before January 1, 2027?",
   "court": "Starship Flight 16 2026",
   "critere": "YES if the full Starship launch vehicle (Super Heavy + Ship), for the integrated test flight following Flight 15 of November 13, 2026 (‘Flight 16’), lifts off before January 1, 2027 00:00 UTC, regardless of the mission outcome. Static fire tests and aborts on the launch pad do not count. If SpaceX renumbers its flights, the next integrated flight after Flight 15 is the one that counts. In case of postponement or cancellation: a postponement past December 31 = NO."
  },
  "he": {
   "q": "האם SpaceX תשגר את טיסה 16 של סטארשיפ לפני 1 בינואר 2027?",
   "court": "סטארשיפ טיסה 16",
   "critere": "כן אם משגר ה-Starship המלא (Super Heavy + החללית), בטיסת הניסוי המשולבת שאחרי טיסה 15 מ-13 בנובמבר 2026 («Flight 16»), ממריא לפני 1 בינואר 2027 בשעה 00:00 UTC, ללא קשר לתוצאת המשימה. ניסויי הפעלה סטטיים ועצירות על משטח השיגור אינם נחשבים. אם SpaceX משנה את מספור הטיסות, הטיסה המשולבת הבאה אחרי טיסה 15 היא זו שנחשבת. במקרה של דחייה או ביטול: דחייה אל מעבר ל-31 בדצמבר = לא."
  }
 }
},
{
 "id": "app-store-mensuel",
 "famille": "classement",
 "categorie": "tech",
 "regle": {"ferme_h":"12 hours","resultat_h":"18 hours 30 minutes"},
 "gabarit": {
  "fr": {
   "q": "Quelle appli sera n°1 des applis iPhone gratuites aux États-Unis le {D} ?",
   "court": "Appli n°1 US au {d}",
   "critere": "Gagne l'appli classée 1re du classement officiel Apple « Top Free » iPhone, toutes catégories, boutique des États-Unis, lu le {D} à 18:00 UTC (± 10 min) dans le flux public https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json, avec capture d'écran. Si le flux est indisponible : capture de l'onglet Classements de l'App Store américain à la même heure. En cas de report ou d'annulation : flux et App Store indisponibles toute la journée, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Which app will be #1 among free iPhone apps in the US on {D}?",
   "court": "#1 free app {d}",
   "critere": "The winner is the app ranked 1st in Apple's official Top Free iPhone chart, all categories, US store, read on {D} at 18:00 UTC (± 10 min) in the public feed https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json, with a screenshot. If the feed is unavailable: a screenshot of the US App Store Charts tab at the same time. If postponed or cancelled: if the feed and the App Store are unavailable all day, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "איזו אפליקציה תדורג ראשונה בין האפליקציות החינמיות לאייפון בארה״ב ב-{D}?",
   "court": "האפליקציה מס' 1 {d}",
   "critere": "זוכה האפליקציה המדורגת ראשונה בדירוג הרשמי של Apple Top Free לאייפון, כל הקטגוריות, החנות האמריקאית, לפי קריאה ב-{D} בשעה 18:00 UTC (± 10 דקות) בפיד הציבורי https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json, עם צילום מסך. אם הפיד אינו זמין: צילום מסך של לשונית הדירוגים ב-App Store האמריקאי באותה שעה. במקרה של דחייה או ביטול: אם הפיד וה-App Store אינם זמינים כל היום, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "game-awards",
 "famille": "edition",
 "categorie": "culture",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":1},
 "gabarit": {
  "fr": {
   "q": "Quel jeu remportera le titre de Jeu de l'année aux Game Awards {Y} ?",
   "court": "Jeu de l'année TGA {Y}",
   "critere": "gagne le jeu proclamé « Game of the Year » pendant la cérémonie des Game Awards {Y}, confirmé sur thegameawards.com. En cas d'ex-æquo officiel, gagne le titre qui vient en premier par ordre alphabétique. En cas de report ou d'annulation : report = clôture déplacée ; aucun lauréat au 31/12/{Y} = annulé et remboursé."
  },
  "en": {
   "q": "Which game will win Game of the Year at The Game Awards {Y}?",
   "court": "TGA {Y} Game of Year",
   "critere": "the winner is the game proclaimed ‘Game of the Year’ during The Game Awards {Y} ceremony, as confirmed on thegameawards.com. In the event of an official tie, the winner is the title that comes first in alphabetical order. In case of postponement or cancellation: postponement = close moved; no winner by December 31, {Y} = cancelled and refunded."
  },
  "he": {
   "q": "איזה משחק יזכה בתואר משחק השנה ב-The Game Awards {Y}?",
   "court": "משחק השנה TGA",
   "critere": "זוכה המשחק שהוכרז כ«Game of the Year» במהלך טקס The Game Awards {Y}, כפי שאושר באתר thegameawards.com. במקרה של שוויון רשמי, זוכה הכותר שמופיע ראשון לפי סדר אלפביתי. במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; אין זוכה עד 31 בדצמבר {Y} = ביטול והחזר כספי."
  }
 }
},
{
 "id": "oscars",
 "famille": "edition",
 "categorie": "culture",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":1},
 "gabarit": {
  "fr": {
   "q": "Quel film remportera l'Oscar du meilleur film en {Y} ?",
   "court": "Oscar du meilleur film",
   "critere": "gagne le film proclamé « Best Picture » à la 99e cérémonie des Oscars (Dolby Theatre, Hollywood). Un film listé non nommé le 21/01/{Y} ne peut plus gagner. Film non listé lauréat = « Autre ». En cas de report ou d'annulation : report = clôture déplacée ; aucun lauréat au 30/06/{Y} = annulé et remboursé."
  },
  "en": {
   "q": "Which film will win Best Picture at the {Y} Oscars?",
   "court": "Oscars Best Picture",
   "critere": "the winner is the film proclaimed ‘Best Picture’ at the 99th Academy Awards ceremony (Dolby Theatre, Hollywood). A listed film that is not nominated on January 21, {Y} can no longer win. Unlisted winning film = ‘Other’. In case of postponement or cancellation: postponement = close moved; no winner by June 30, {Y} = cancelled and refunded."
  },
  "he": {
   "q": "איזה סרט יזכה באוסקר לסרט הטוב ביותר ב-{Y}?",
   "court": "אוסקר לסרט הטוב",
   "critere": "זוכה הסרט שהוכרז כזוכה בפרס «Best Picture» (הסרט הטוב ביותר) בטקס האוסקר ה-99 (Dolby Theatre, הוליווד). סרט שברשימה ולא קיבל מועמדות ב-21 בינואר {Y} אינו יכול עוד לזכות. סרט זוכה שאינו ברשימה = «אחר». במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; אין זוכה עד 30 ביוני {Y} = ביטול והחזר כספי."
  }
 }
},
{
 "id": "grammys",
 "famille": "edition",
 "categorie": "culture",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":1},
 "gabarit": {
  "fr": {
   "q": "Quel album remportera l'album de l'année aux Grammy Awards {Y} ?",
   "court": "Grammy album de l'année",
   "critere": "gagne l'album proclamé « Album of the Year » à la 69e cérémonie des Grammy Awards (Crypto.com Arena, Los Angeles), confirmé sur grammy.com. Ex-æquo officiel = annulé et remboursé. En cas de report ou d'annulation : report = clôture déplacée ; aucune remise au 30/06/{Y} = annulé et remboursé."
  },
  "en": {
   "q": "Which album will win Album of the Year at the {Y} Grammys?",
   "court": "Grammys Album of Year",
   "critere": "the winner is the album proclaimed ‘Album of the Year’ at the 69th Grammy Awards ceremony (Crypto.com Arena, Los Angeles), as confirmed on grammy.com. Official tie = cancelled and refunded. In case of postponement or cancellation: postponement = close moved; no award presented by June 30, {Y} = cancelled and refunded."
  },
  "he": {
   "q": "איזה אלבום יזכה בפרס אלבום השנה בטקס הגראמי {Y}?",
   "court": "אלבום השנה בגראמי",
   "critere": "זוכה האלבום שהוכרז כ«Album of the Year» בטקס פרסי הגראמי ה-69 (Crypto.com Arena, לוס אנג׳לס), כפי שאושר באתר grammy.com. שוויון רשמי = ביטול והחזר כספי. במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; לא הוענק פרס עד 30 ביוני {Y} = ביטול והחזר כספי."
  }
 }
},
{
 "id": "ucl",
 "famille": "saison",
 "categorie": "sport",
 "moteur_cat": "Football",
 "ouverture": "resolution",
 "gabarit": {
  "fr": {
   "q": "Qui remportera la Ligue des champions {Sl} ?",
   "court": "Vainqueur LDC {S}",
   "critere": "club qui remporte la finale (prolongation et tirs au but compris). Une option devient perdante dès que le club est éliminé."
  },
  "en": {
   "q": "Who will win the {S} UEFA Champions League?",
   "court": "UCL winner {S}",
   "critere": "club that wins the final (including extra time and penalty shoot-out). An option becomes a losing one as soon as the club is eliminated."
  },
  "he": {
   "q": "מי תזכה בליגת האלופות {S}?",
   "court": "ליגת האלופות {S}",
   "critere": "המועדון שזוכה בגמר (כולל הארכה ודו-קרב פנדלים). אופציה הופכת למפסידה ברגע שהמועדון מודח."
  }
 }
},
{
 "id": "nba",
 "famille": "saison",
 "categorie": "sport",
 "moteur_cat": "Sport",
 "ouverture": "resolution",
 "gabarit": {
  "fr": {"q":"Qui sera champion NBA en {Yf} ?","court":"Champion NBA {Yf}","critere":"équipe qui gagne les Finales NBA {Yf} (4 victoires)."},
  "en": {"q":"Who will win the {Yf} NBA championship?","court":"NBA champion {Yf}","critere":"team that wins the {Yf} NBA Finals (4 wins)."},
  "he": {"q":"מי תזכה באליפות ה-NBA ב-{Yf}?","court":"אלופת ה-NBA {Yf}","critere":"הקבוצה שזוכה בגמר ה-NBA של {Yf} (4 ניצחונות)."}
 }
},
{
 "id": "pl",
 "famille": "saison",
 "categorie": "sport",
 "moteur_cat": "Football",
 "ouverture": "resolution",
 "gabarit": {
  "fr": {
   "q": "Qui sera champion de Premier League {Sl} ?",
   "court": "Champion PL {S}",
   "critere": "1er du classement officiel de la Premier League après la dernière journée (en tenant compte des retraits de points appliqués pendant la saison). Une décision prise après cette date (titre retiré, etc.) ne change pas le résultat du marché."
  },
  "en": {
   "q": "Who will win the {S} Premier League?",
   "court": "PL winner {S}",
   "critere": "1st place in the official Premier League table after the final matchday (taking into account any point deductions applied during the season). A decision made after that date (title stripped, etc.) does not change the market result."
  },
  "he": {
   "q": "מי תזכה באליפות הפרמייר ליג {S}?",
   "court": "הפרמייר ליג {S}",
   "critere": "המקום הראשון בטבלה הרשמית של הפרמייר ליג אחרי המחזור האחרון (בהתחשב בהורדות נקודות שהוחלו במהלך העונה). החלטה שתתקבל אחרי מועד זה (שלילת תואר וכדומה) אינה משנה את תוצאת השוק."
  }
 }
},
{
 "id": "ao-hommes",
 "famille": "saison",
 "categorie": "sport",
 "moteur_cat": "Sport",
 "ouverture": "resolution",
 "gabarit": {
  "fr": {
   "q": "Qui remportera le simple messieurs de l'Open d'Australie {Y} ?",
   "court": "Open d'Australie {Y} H",
   "critere": "vainqueur officiel du simple messieurs. Si le tournoi n'a pas lieu : marché annulé. Un joueur qui ne participe pas devient perdant."
  },
  "en": {
   "q": "Who will win the {Y} Australian Open men's singles title?",
   "court": "AO {Y} men's winner",
   "critere": "official winner of the men’s singles. If the tournament does not take place: market cancelled. A player who does not take part becomes a losing option."
  },
  "he": {
   "q": "מי יזכה באליפות אוסטרליה הפתוחה {Y} ביחידים לגברים?",
   "court": "אליפות אוסטרליה {Y}",
   "critere": "הזוכה הרשמי בתחרות היחידים לגברים. אם הטורניר אינו מתקיים: השוק מבוטל. שחקן שאינו משתתף הופך לאופציה מפסידה."
  }
 }
}
]$modeles$::jsonb);

-- Probabilités du modèle tout de suite (prix servis avant la mise en ligne), puis toutes les 30 s.
select wm.ancres_tick();
select cron.schedule('wm-ancres', '30 seconds', 'select wm.ancres_tick()');

select wm.droits();
