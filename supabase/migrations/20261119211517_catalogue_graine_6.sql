-- Marchés réels, lot 8 (19 nov. 2026) : la graine du catalogue, partie 6 sur 6 — 5 fiches, de « bl-svw-hsv-2026-11-22 » à « news-sinner-ao-2027 ».
-- Texte généré à partir des recherches et des traductions du 19 nov. 2026 (docs/DONNEES.md § 7) ; chaque fiche passe par
-- wm.fiche_creer, avec les mêmes contrôles qu'une fiche écrite par l'équipe. Sans effet sur le site en ligne : catalogue.serveur
-- est éteint, aucune ligne du moteur n'est créée avant la mise en ligne.
select wm.catalogue_semer($graine$[
{
 "id": "bl-svw-hsv-2026-11-22",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : le Werder Brême, match nul ou le Hambourg SV ?",
   "court": "Werder – Hambourg",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de Werder Brême, match nul ou victoire de Hambourg SV. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (16:30 UTC)."
  },
  "en": {
   "q": "Who will win: Werder Bremen, draw, or Hamburger SV?",
   "court": "Werder – Hamburg",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Werder Bremen win, draw or Hamburger SV win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (16:30 UTC)."
  },
  "he": {
   "q": "מי תנצח: ורדר ברמן, תיקו או המבורג?",
   "court": "ורדר – המבורג",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של ורדר ברמן, תיקו או ניצחון של המבורג. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (16:30 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-22T16:30:00Z",
 "resolution_at": "2026-11-22T18:35:00Z",
 "source": {"nom":"Bundesliga (et OpenLigaDB)","url":"https://www.bundesliga.com"},
 "regle": {
  "type": "match",
  "sport": "foot",
  "competition": "BL",
  "debut": "2026-11-22T16:30:00Z",
  "dom": "Werder Bremen",
  "ext": "Hamburger SV",
  "openligadb": 83243,
  "lh": 1.91,
  "la": 1.03
 },
 "lien": {"match":{"sport":"foot","competition":"BL","debut":"2026-11-22T16:30:00Z","openligadb":83243}},
 "p0_justif": "Marché public de prédiction (interne) : 0,585 / 0,225 / 0,205 ; pas de cote de bookmaker publiée.",
 "origine": "sport",
 "verifs": [],
 "options": [
  {
   "code": "home",
   "noms": {"fr":"Werder Brême","en":"Werder Bremen","he":"ורדר ברמן"},
   "p0": 58,
   "image": {"fichier":"File:SV-Werder-Bremen-Logo.svg","genre":"logo"}
  },
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":22,"image":null},
  {
   "code": "away",
   "noms": {"fr":"Hambourg SV","en":"Hamburger SV","he":"המבורג"},
   "p0": 20,
   "image": {"fichier":"File:Hamburger SV logo.svg","genre":"logo"}
  }
 ]
},
{
 "id": "nba-okc-mia-2026-11-22",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Sport",
 "textes": {
  "fr": {
   "q": "Qui va gagner : l'Oklahoma City Thunder ou le Miami Heat ?",
   "court": "Thunder @ Heat",
   "critere": "Vainqueur du match Oklahoma City Thunder – Miami Heat, prolongations comprises. Match reporté de plus de 48 heures ou arrêté sans résultat officiel : marché annulé et mises remboursées. Les mises ferment au début du match (23:00 UTC)."
  },
  "en": {
   "q": "Who will win: Oklahoma City Thunder or Miami Heat?",
   "court": "Thunder @ Heat",
   "critere": "Winner of the Oklahoma City Thunder – Miami Heat game, overtime included. If the game is postponed by more than 48 hours or abandoned without an official result, the market is cancelled and stakes are refunded. Betting closes at tip-off (23:00 UTC)."
  },
  "he": {
   "q": "מי תנצח: אוקלהומה סיטי ת'אנדר או מיאמי היט?",
   "court": "אוקלהומה – מיאמי",
   "critere": "המנצחת במשחק אוקלהומה סיטי ת'אנדר – מיאמי היט, כולל הארכות. משחק שנדחה ביותר מ-48 שעות או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים. ההימורים נסגרים בתחילת המשחק (23:00 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-22T23:00:00Z",
 "resolution_at": "2026-11-23T02:00:00Z",
 "source": {"nom":"NBA","url":"https://www.nba.com"},
 "regle": {"type":"match","sport":"nba","competition":"NBA","debut":"2026-11-22T23:00:00Z","dom":"Miami Heat","ext":"Oklahoma City Thunder"},
 "lien": {"match":{"sport":"nba","competition":"NBA","debut":"2026-11-22T23:00:00Z"}},
 "p0_justif": "deux marchés prédictifs publics : Thunder 0,455 / Heat 0,545 et Thunder 0,45 / Heat 0,55 (milieux) → moyenne 45,25 / 54,75 → **45 / 55**. Remarque : le modèle BPI d'ESPN donne l'inverse (Thunder 57,1 %) ; je suis les deux marchés, qui concordent entre eux.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261122",
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401910030",
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?team=15",
  "https://gamma-api.polymarket.com/public-search?q=Thunder%20vs.%20Heat",
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXNBAGAME&status=open"
 ],
 "options": [
  {"code":"away","noms":{"fr":"Oklahoma City Thunder","en":"Oklahoma City Thunder","he":"אוקלהומה סיטי ת'אנדר"},"p0":45,"image":null},
  {"code":"home","noms":{"fr":"Miami Heat","en":"Miami Heat","he":"מיאמי היט"},"p0":55,"image":null}
 ]
},
{
 "id": "news-jaissle-newcastle-2026",
 "nature": "binaire",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Matthias Jaissle quittera-t-il son poste d'entraîneur de Newcastle avant le 1er janvier 2027 ?",
   "court": "Départ de Jaissle 2026 ?",
   "critere": "Oui si le club annonce officiellement que Jaissle n'est plus l'entraîneur principal (licenciement, démission ou départ d'un commun accord) avec effet avant le 1er janvier 2027 00:00 UTC. Un intérim pendant une simple absence (maladie, suspension) ne compte pas. Non sinon."
  },
  "en": {
   "q": "Will Matthias Jaissle cease to be Newcastle United head coach before 1 January 2027?",
   "court": "Jaissle out by 2027?",
   "critere": "Yes if the club officially announces that Jaissle is no longer the head coach (dismissal, resignation or departure by mutual agreement) effective before January 1, 2027 00:00 UTC. An interim during a mere absence (illness, suspension) does not count. No otherwise."
  },
  "he": {
   "q": "האם מתיאס יאיסלה יפסיק לאמן את ניוקאסל יונייטד לפני 1 בינואר 2027?",
   "court": "יאיסלה יעזוב עד 2027?",
   "critere": "כן אם המועדון מודיע באופן רשמי ש-Jaissle אינו עוד המאמן הראשי (פיטורים, התפטרות או עזיבה בהסכמה הדדית) בתוקף לפני 1 בינואר 2027 בשעה 00:00 UTC. מינוי מאמן זמני במהלך היעדרות בלבד (מחלה, הרחקה) אינו נחשב. לא אחרת."
  }
 },
 "image": null,
 "ferme_at": "2026-12-31T23:59:00Z",
 "resolution_at": "2027-01-01T12:00:00Z",
 "source": {"nom":"Newcastle United (site officiel)","url":"https://www.newcastleunited.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 32,
 "p0_justif": "marché prédictif public « Jaissle cesse d'être entraîneur de Newcastle avant le 1er janvier 2027 » : achat 0,31 / vente 0,32, dernier prix 0,32 → **32 / 68**.",
 "origine": "actu",
 "verifs": [
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXMANAGERSOUT&status=open",
  "https://www.livescore.com/en/news/football/premier-league/insider-reveals-matthias-jaissle-sack-update-with-newcastle-fans-infuriated-teamtalk/",
  "https://www.nst.com.my/amp/sports/football/2026/11/1569453/under-fire-jaissle-accepts-blame-newcastle-misery",
  "https://www.expressandstar.com/uk-sports/newcastle-confirm-appointment-of-matthias-jaissle-as-eddie-howes-successor-8844390",
  "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings"
 ]
},
{
 "id": "news-mancity-sanction-2027",
 "nature": "binaire",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Manchester City recevra-t-il une sanction sportive (retrait de points, rétrogradation ou exclusion) dans l'affaire des « 115 charges » avant le 1er juillet 2027 ?",
   "court": "Sanction sportive City ?",
   "critere": "Oui si, avant le 1er juillet 2027 00:00 UTC, la commission indépendante ou la commission d'appel impose officiellement à Manchester City, dans cette affaire, un retrait d'au moins 1 point en Premier League, une rétrogradation ou une exclusion, et que la décision est rendue publique. La première décision officielle compte, même si City fait appel ensuite. Une sanction avec sursis (non appliquée), une simple amende ou un retrait de titres sans retrait de points ne comptent pas. Non sinon (y compris s'il n'y a aucune décision à temps)."
  },
  "en": {
   "q": "Will Manchester City receive a sporting sanction (points deduction, relegation or expulsion) in the \"115 charges\" case before 1 July 2027?",
   "court": "Man City sanction?",
   "critere": "Yes if, before July 1, 2027 00:00 UTC, the independent commission or the appeal board officially imposes on Manchester City, in this case, a deduction of at least 1 Premier League point, a relegation or an expulsion, and the decision is made public. The first official decision counts, even if City subsequently appeals. A suspended sanction (not applied), a mere fine or a stripping of titles without a points deduction does not count. No otherwise (including if there is no decision in time)."
  },
  "he": {
   "q": "האם מנצ'סטר סיטי תקבל עונש ספורטיבי (הורדת נקודות, הורדת ליגה או הרחקה) בפרשת \"115 האישומים\" לפני 1 ביולי 2027?",
   "court": "עונש ספורטיבי לסיטי?",
   "critere": "כן אם, לפני 1 ביולי 2027 בשעה 00:00 UTC, הוועדה העצמאית או ועדת הערעורים מטילה באופן רשמי על מנצ׳סטר סיטי, בפרשה זו, הורדה של נקודה אחת לפחות בפרמייר ליג, הורדת ליגה או הרחקה מהליגה, וההחלטה מתפרסמת ברבים. ההחלטה הרשמית הראשונה נחשבת, גם אם סיטי מגישה ערעור לאחר מכן. עונש על תנאי (שאינו מופעל), קנס בלבד או שלילת תארים ללא הורדת נקודות אינם נחשבים. לא אחרת (לרבות אם לא התקבלה החלטה בזמן)."
  }
 },
 "image": null,
 "ferme_at": "2027-06-30T23:59:00Z",
 "resolution_at": "2027-07-01T12:00:00Z",
 "source": {"nom":"Premier League","url":"https://www.premierleague.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 76,
 "p0_justif": "marché prédictif public « retrait de points en Premier League d'ici le 30 juin 2027 » : prix 0,76 (achat 0,65 / vente 0,87 — marché peu liquide). Un autre marché public sur le nombre de points retirés donne « 0 point » à 0,24. Les deux concordent → **76 / 24**.",
 "origine": "actu",
 "verifs": [
  "https://gamma-api.polymarket.com/events?slug=will-manchester-city-be-deducted-premier-league-points-by-june-30-2027",
  "https://gamma-api.polymarket.com/events?slug=how-many-premier-league-points-will-manchester-city-be-deducted",
  "https://gamma-api.polymarket.com/events?slug=manchester-city-punishment-announced-by",
  "https://www.aljazeera.com/sports/2026/10/14/manchester-city-appeal-over-charges-to-be-heard-by-january-says-regulator",
  "https://abcnews.com/Sports/wireStory/man-city-guilty-115-financial-charges-premier-league-136859168",
  "https://gulfnews.com/sport/manchester-city-lodge-appeal-following-guilty-charges-1.500696157"
 ]
},
{
 "id": "news-sinner-ao-2027",
 "nature": "binaire",
 "categorie": "sport",
 "moteur_cat": "Sport",
 "textes": {
  "fr": {
   "q": "Jannik Sinner jouera-t-il un match en simple à l'Open d'Australie 2027 ?",
   "court": "Sinner à l'Open 2027 ?",
   "critere": "Oui si Sinner joue au moins un point d'un match de simple du tableau principal de l'Open d'Australie 2027 (un abandon en cours de match compte comme Oui). Non s'il déclare forfait ou ne joue aucun match de simple du tableau principal. Les exhibitions et le double ne comptent pas."
  },
  "en": {
   "q": "Will Jannik Sinner play a singles match at the 2027 Australian Open?",
   "court": "Sinner at AO 2027?",
   "critere": "Yes if Sinner plays at least one point of a singles match in the main draw of the 2027 Australian Open (a retirement during a match counts as Yes). No if he withdraws or does not play any main-draw singles match. Exhibitions and doubles do not count."
  },
  "he": {
   "q": "האם יאניק סינר ישחק משחק ביחידים באליפות אוסטרליה הפתוחה 2027?",
   "court": "סינר באוסטרליה 2027?",
   "critere": "כן אם סינר משחק לפחות נקודה אחת במשחק יחידים בטבלה הראשית של אליפות אוסטרליה הפתוחה 2027 (פרישה באמצע משחק נחשבת ככן). לא אם הוא מוותר על השתתפות או אינו משחק אף משחק יחידים בטבלה הראשית. משחקי ראווה ומשחקי זוגות אינם נחשבים."
  }
 },
 "image": {"fichier":"File:Jannik Sinner 2025 US Open.jpg","genre":"photo"},
 "ferme_at": "2027-01-16T23:59:00Z",
 "resolution_at": "2027-01-21T12:00:00Z",
 "source": {"nom":"Open d’Australie","url":"https://ausopen.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 65,
 "p0_justif": "**aucun marché public ni cote trouvés sur cette question précise → estimation de ma part**, fondée sur : (1) le 10/11, Sinner dit être confiant pour l'Australie (« The goal is to go to Australia »), sans vouloir forcer son retour ; (2) son genou a déjà fait échouer des retours prévus (US Open, tournée asiatique) ; (3) le marché public du vainqueur de l'Open d'Australie 2027 ne lui donne que 12 % alors qu'il a gagné Wimbledon 2026, signe d'un vrai doute. → 65 / 35, à ajuster dès qu'un marché ou une nouvelle apparaît.",
 "origine": "actu",
 "verifs": [
  "https://www.thestar.com.my/sport/tennis/2026/11/10/tennis-sinner-positive-on-australian-open-prospects-but-won039t-rush-return",
  "https://tennismajors.com/atp/sinner-ends-2026-season-due-to-knee-inflammation-misses-atp-finals-862687.html",
  "https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXATP-27AO",
  "https://www.melbournepark.com.au/event/australian-open-2027/",
  "https://commons.wikimedia.org/wiki/File:Jannik_Sinner_2025_US_Open.jpg"
 ]
}
]$graine$::jsonb);

select wm.droits();
