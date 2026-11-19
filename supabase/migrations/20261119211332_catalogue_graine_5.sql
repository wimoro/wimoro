-- Marchés réels, lot 8 (19 nov. 2026) : la graine du catalogue, partie 5 sur 6 — 12 fiches, de « openai-introduction-en-bourse » à « ucl-psg-rom-2026-11-25 ».
-- Texte généré à partir des recherches et des traductions du 19 nov. 2026 (docs/DONNEES.md § 7) ; chaque fiche passe par
-- wm.fiche_creer, avec les mêmes contrôles qu'une fiche écrite par l'équipe. Sans effet sur le site en ligne : catalogue.serveur
-- est éteint, aucune ligne du moteur n'est créée avant la mise en ligne.
select wm.catalogue_semer($graine$[
{
 "id": "openai-introduction-en-bourse",
 "nature": "binaire",
 "categorie": "tech",
 "textes": {
  "fr": {
   "q": "Les actions d'OpenAI seront-elles cotées en Bourse avant le 1er juillet 2027 ?",
   "court": "OpenAI en Bourse ?",
   "critere": "OUI si, avant le 1er juillet 2027 à 00:00 heure de New York, les actions de l'entité qui porte l'activité d'OpenAI commencent à être échangées sur une Bourse réglementée (NYSE, Nasdaq ou autre grande Bourse) : introduction en Bourse, cotation directe ou fusion avec une société cotée. Un dépôt public de prospectus (S-1) seul ne suffit pas."
  },
  "en": {
   "q": "Will OpenAI shares start trading on a stock exchange before July 1, 2027?",
   "court": "OpenAI IPO by July",
   "critere": "YES if, before July 1, 2027 at 00:00 New York time, shares of the entity carrying OpenAI’s business begin trading on a regulated stock exchange (NYSE, Nasdaq or another major exchange): IPO, direct listing or merger with a listed company. A public prospectus filing (S-1) alone is not enough."
  },
  "he": {
   "q": "האם מניות OpenAI ייסחרו בבורסה לפני 1 ביולי 2027?",
   "court": "הנפקת OpenAI",
   "critere": "כן אם, לפני 1 ביולי 2027 בשעה 00:00 שעון ניו יורק, מניות הישות שבה מתנהלת הפעילות של OpenAI מתחילות להיסחר בבורסה מוסדרת (NYSE, נאסד״ק או בורסה גדולה אחרת): הנפקה ראשונית לציבור, רישום ישיר למסחר או מיזוג עם חברה הנסחרת בבורסה. הגשה פומבית של תשקיף (S-1) לבדה אינה מספיקה."
  }
 },
 "image": {"fichier":"File:OpenAI logo 2025 (symbol).svg","genre":"logo"},
 "ferme_at": "2027-07-01T04:00:00Z",
 "resolution_at": "2027-07-01T12:00:00Z",
 "source": {"nom":"OpenAI, actualités","url":"https://openai.com/news"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 45,
 "p0_justif": "OpenAI a confirmé le 8 juin 2026 un dépôt confidentiel de S-1 : « We have not decided on timing yet; it may be a while. » Les concurrents vont en Bourse : SpaceX est cotée (classement companiesmarketcap lu aujourd'hui). D'après les marchés publics, l'introduction d'Anthropic est annoncée et prévue en novembre 2026 ; aucun article ne l'a confirmé aujourd'hui (non vérifié). Marché public « introduction d'OpenAI avant le 30/06/2027 » : 47,5 % ; avant le 31/03/2027 : 15 % (https://polymarket.com/event/openai-ipo-by, interne).",
 "origine": "actu",
 "verifs": [
  "https://decrypt.co/370468/openai-confidential-ipo-filing-keeps-timing-open",
  "https://www.techrepublic.com/article/news-openai-confidential-sec-ipo-filing/"
 ]
},
{
 "id": "avengers-doomsday-premier-week-end",
 "nature": "binaire",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "Avengers: Doomsday dépassera-t-il 400 millions de dollars lors de son premier week-end en Amérique du Nord ?",
   "court": "Avengers > 400 M$ ?",
   "critere": "OUI si les recettes du premier week-end aux États-Unis et au Canada (vendredi 18 – dimanche 20 décembre 2026, avant-premières du jeudi incluses), publiées comme chiffres réels par Box Office Mojo, dépassent strictement 400 000 000 $. Les estimations du dimanche ne comptent pas. En cas de report ou d'annulation : si la sortie est déplacée, le marché porte sur le premier week-end (vendredi-dimanche) de sortie nationale, clôture déplacée à 3 jours avant ; sortie après le 30/06/2027 ou annulée = remboursement."
  },
  "en": {
   "q": "Will Avengers: Doomsday gross over $400 million in its US opening weekend?",
   "court": "Avengers $400M opening",
   "critere": "YES if the opening weekend gross in the United States and Canada (Friday, December 18 – Sunday, December 20, 2026, Thursday previews included), published as actuals by Box Office Mojo, strictly exceeds $400,000,000. Sunday estimates do not count. In case of postponement or cancellation: if the release is moved, the market covers the first weekend (Friday–Sunday) of the nationwide release, with the close moved to 3 days before; release after June 30, 2027 or cancelled = refund."
  },
  "he": {
   "q": "האם Avengers: Doomsday יכניס יותר מ-400 מיליון דולר בסוף השבוע הראשון שלו בצפון אמריקה?",
   "court": "אוונג'רס מעל 400 מ'",
   "critere": "כן אם ההכנסות מסוף השבוע הראשון בארה״ב ובקנדה (שישי, 18 בדצמבר – ראשון, 20 בדצמבר 2026, כולל ההקרנות המוקדמות של יום חמישי), כפי שפורסמו כנתונים בפועל באתר Box Office Mojo, גבוהות ממש מ-400,000,000 דולר. ההערכות של יום ראשון אינן נחשבות. במקרה של דחייה או ביטול: אם מועד ההפצה מוזז, השוק מתייחס לסוף השבוע הראשון (שישי–ראשון) של ההפצה הכלל-ארצית, ומועד הסגירה מוזז ל-3 ימים לפני כן; הפצה אחרי 30 ביוני 2027 או ביטול ההפצה = החזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2026-12-15T23:00:00Z",
 "resolution_at": "2026-12-21T20:00:00Z",
 "source": {"nom":"Box Office Mojo","url":"https://www.boxofficemojo.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 60,
 "p0_justif": "sortie le 18/12/2026 (Disney, réalisé par les Russo), le même jour que Dune: Part Three. Préventes : 125 M$ fin octobre. Box Office Theory projette 340 M$ ; un suivi de mi-novembre évoque 410 M$. Record actuel du premier week-end : Spider-Man: Brand New Day, environ 360 M$ (août 2026). Marché public : plus de 400 M$ 68 %, 360–400 M$ 23,5 % (https://polymarket.com/event/avengers-doomsday-opening-weekend-box-office, interne). J'abaisse un peu à cause de la concurrence de Dune.",
 "origine": "actu",
 "verifs": [
  "https://en.wikipedia.org/wiki/Avengers:_Doomsday",
  "https://www.boxofficemojo.com/calendar/2026-11-20/",
  "https://comicbookmovie.com/avengers/avengers-doomsday/avengers-doomsday-early-tracking-points-to-gargantuan-410-million-opening-weekend-a230990",
  "https://abcnews.com/culture/story/spider-man-brand-new-day-biggest-opening-weekend-135310254"
 ]
},
{
 "id": "gta6-sur-pc-avant-avril-2027",
 "nature": "binaire",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "GTA VI sortira-t-il sur PC avant le 1er avril 2027 ?",
   "court": "GTA VI PC avant avril",
   "critere": "OUI si, avant le 1er avril 2027 00:00 UTC, Grand Theft Auto VI peut être acheté et joué sur PC Windows via une boutique officielle (Steam, Epic Games Store, Rockstar Games Launcher…). Une simple annonce, une précommande ou le jeu en streaming (cloud) depuis un PC ne comptent pas."
  },
  "en": {
   "q": "Will GTA VI be released on PC before April 1, 2027?",
   "court": "GTA VI on PC by April",
   "critere": "YES if, before April 1, 2027 00:00 UTC, Grand Theft Auto VI can be purchased and played on Windows PC through an official store (Steam, Epic Games Store, Rockstar Games Launcher…). A mere announcement, a pre-order or playing the game via streaming (cloud) from a PC does not count."
  },
  "he": {
   "q": "האם GTA VI ייצא למחשב (PC) לפני 1 באפריל 2027?",
   "court": "GTA VI ל-PC עד אפריל",
   "critere": "כן אם, לפני 1 באפריל 2027 בשעה 00:00 UTC, ניתן לרכוש את Grand Theft Auto VI ולשחק בו במחשב Windows דרך חנות רשמית (Steam, Epic Games Store, Rockstar Games Launcher…). הכרזה בלבד, הזמנה מוקדמת או משחק בסטרימינג (ענן) ממחשב אינם נחשבים."
  }
 },
 "image": null,
 "ferme_at": "2027-04-01T00:00:00Z",
 "resolution_at": "2027-04-01T12:00:00Z",
 "source": {"nom":"Rockstar Games Newswire","url":"https://www.rockstargames.com/newswire"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 30,
 "p0_justif": "sorti aujourd'hui (19/11/2026) sur PS5 et Xbox Series X/S uniquement ; jouable sur Xbox One via le cloud. Aucune version Windows annoncée ; des sources du secteur citées par Wikipedia évoquaient en octobre 2026 un portage au 1er trimestre 2027. Take-Two reste évasif. Une partie de la presse table sur 2027 au plus tôt, voire 2028 (GTA V était arrivé sur PC 19 mois après les consoles). Marché public : avant janvier 2027 2,8 %, janvier 3,7 %, février 1,9 %, mars 24,3 %, après mars 70 % (https://polymarket.com/event/gta-vi-on-pc-in-what-month-20261021185317733, interne).",
 "origine": "actu",
 "verifs": [
  "https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI",
  "https://www.digitalcitizen.life/gta-6-keeps-november-19-release-date-as-take-two-stays-quiet-on-pc-version/",
  "https://www.pcgameshardware.de/GTA-6-Spiel-55239/News/Take-Two-bestaetigt-Release-und-8-Milliarden-Prognose-1536100/"
 ]
},
{
 "id": "time-personnalite-2026",
 "nature": "options",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "Qui sera la Personnalité de l'année 2026 du magazine TIME ?",
   "court": "Personnalité TIME 2026",
   "critere": "gagne l'option qui correspond à l'annonce officielle de TIME pour 2026. Une seule personne listée = cette personne. Deux personnes ou plus, un groupe, un mouvement ou un concept (comme « The Architects of AI » en 2025) = « Un groupe, un duo ou un concept », même si une personne listée en fait partie ou figure sur une couverture. Une seule personne non listée = « Autre personne ». En cas de report ou d'annulation : aucune annonce au 31/01/2027 = annulé et remboursé."
  },
  "en": {
   "q": "Who will be TIME's Person of the Year 2026?",
   "court": "TIME Person of 2026",
   "critere": "the winning option is the one matching TIME’s official announcement for 2026. A single listed person = that person. Two or more people, a group, a movement or a concept (such as ‘The Architects of AI’ in 2025) = ‘A group, a duo or a concept’, even if a listed person is part of it or appears on a cover. A single unlisted person = ‘Other person’. In case of postponement or cancellation: no announcement by January 31, 2027 = cancelled and refunded."
  },
  "he": {
   "q": "מי ייבחר לאיש השנה 2026 של מגזין TIME?",
   "court": "איש השנה של TIME",
   "critere": "זוכה האופציה התואמת את ההכרזה הרשמית של TIME לשנת 2026. אדם יחיד שברשימה = אותו אדם. שני אנשים או יותר, קבוצה, תנועה או מושג (כמו «The Architects of AI» ב-2025) = «קבוצה, צמד או מושג», גם אם אדם שברשימה הוא חלק מהם או מופיע על אחד השערים. אדם יחיד שאינו ברשימה = «אדם אחר». במקרה של דחייה או ביטול: אין הכרזה עד 31 בינואר 2027 = ביטול והחזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2026-12-04T00:00:00Z",
 "resolution_at": "2026-12-11T18:00:00Z",
 "source": {"nom":"TIME, Person of the Year","url":"https://time.com/person-of-the-year/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "TIME choisit souvent un groupe, un duo ou un concept : 2014, 2017, 2018, 2020, 2022 (en partie) et 2025, d'après la liste de Wikipedia. D'où 35 % pour cette option. Marchés publics (contrats séparés, qui comptent aussi une personne incluse dans un groupe) : Mamdani 25 %, Talarico 22 %, El-Sayed 19 %, Carney 10 %, Ossoff 10 %, Léon XIV 8 % (https://kalshi.com/markets/kxtime, interne) ; Talarico 25,2 %, Mamdani 20,5 %, El-Sayed 15,5 %, Ossoff 11 %, Carney 9 %, Léon XIV 6,5 %, Trump 5,1 % (https://polymarket.com/event/time-person-of-the-year-2026, interne). Quatre personnalités moins connues (Scott Colom, Annie Andrews, Adam Hamilton, Joshua Turek) y sont cotées 16 à 18 % chacune, signe que ces marchés anticipent un choix collectif (interprétation non vérifiée). J'ai donc retiré cette part « groupe » des prix individuels.",
 "origine": "actu",
 "verifs": [
  "https://en.wikipedia.org/wiki/Time_Person_of_the_Year",
  "https://abc7ny.com/post/time-magazine-names-architects-ai-person-year-2025/18275255/"
 ],
 "options": [
  {
   "code": "groupe",
   "noms": {"fr":"Un groupe, un duo ou un concept","en":"A group, pair or concept","he":"קבוצה, צמד או רעיון"},
   "p0": 35,
   "image": null
  },
  {
   "code": "mamdani",
   "noms": {"fr":"Zohran Mamdani","en":"Zohran Mamdani","he":"זוהראן ממדאני"},
   "p0": 12,
   "image": {"fichier":"File:Zohran Mamdani 05.25.25 (b) (cropped).jpg","genre":"photo"}
  },
  {
   "code": "talarico",
   "noms": {"fr":"James Talarico","en":"James Talarico","he":"ג'יימס טלאריקו"},
   "p0": 10,
   "image": {"fichier":"File:James Talarico Press Conference (cropped).jpg","genre":"photo"}
  },
  {
   "code": "carney",
   "noms": {"fr":"Mark Carney","en":"Mark Carney","he":"מארק קרני"},
   "p0": 7,
   "image": {"fichier":"File:Mark Carney Argentina v Spain 19 July 2026-303 (3x4 close up cropped).jpg","genre":"photo"}
  },
  {
   "code": "elsayed",
   "noms": {"fr":"Abdul El-Sayed","en":"Abdul El-Sayed","he":"עבדול אל-סייד"},
   "p0": 6,
   "image": {"fichier":"File:Abdul El-Sayed meet-and-greet by Conlan Houston 5 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "leon14",
   "noms": {"fr":"Pape Léon XIV","en":"Pope Leo XIV","he":"האפיפיור לאו ה-14"},
   "p0": 6,
   "image": {"fichier":"File:Pope Leo XIV 3 (3x4 cropped).png","genre":"photo"}
  },
  {
   "code": "trump",
   "noms": {"fr":"Donald Trump","en":"Donald Trump","he":"דונלד טראמפ"},
   "p0": 5,
   "image": {"fichier":"File:Official Presidential Portrait of President Donald J. Trump (2025).jpg","genre":"photo"}
  },
  {
   "code": "ossoff",
   "noms": {"fr":"Jon Ossoff","en":"Jon Ossoff","he":"ג'ון אוסוף"},
   "p0": 4,
   "image": {"fichier":"File:Jon Ossoff Senate Portrait 2021.jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre personne","en":"Another person","he":"אדם אחר"},"p0":15,"image":null}
 ]
},
{
 "id": "box-office-thanksgiving-2026",
 "nature": "options",
 "categorie": "culture",
 "textes": {
  "fr": {
   "q": "Quel film sera n°1 du box-office nord-américain le week-end de Thanksgiving (27-29 novembre) ?",
   "court": "Box-office Thanksgiving",
   "critere": "gagne le film classé 1er du classement national du week-end de Box Office Mojo pour le vendredi 27 – dimanche 29 novembre 2026 (recettes du vendredi au dimanche, chiffres réels ; pas les cumuls sur 5 jours). En cas d'égalité exacte, annulé et remboursé. En cas de report ou d'annulation : si un film listé change de date, il reste dans le marché ; il gagne seulement s'il est n°1 ce week-end-là."
  },
  "en": {
   "q": "Which film will top the US box office on the November 27–29 Thanksgiving weekend?",
   "court": "Thanksgiving box office",
   "critere": "the winner is the film ranked 1st in Box Office Mojo’s domestic weekend chart for Friday, November 27 – Sunday, November 29, 2026 (Friday-to-Sunday grosses, actuals; not 5-day totals). In the event of an exact tie, cancelled and refunded. In case of postponement or cancellation: if a listed film changes its release date, it stays in the market; it wins only if it is No. 1 that weekend."
  },
  "he": {
   "q": "איזה סרט יוביל בקופות בצפון אמריקה בסוף השבוע של חג ההודיה (27–29 בנובמבר)?",
   "court": "קופות חג ההודיה",
   "critere": "זוכה הסרט המדורג במקום הראשון בדירוג סוף השבוע הכלל-ארצי (domestic) של Box Office Mojo לימים שישי, 27 בנובמבר – ראשון, 29 בנובמבר 2026 (הכנסות משישי עד ראשון, נתונים בפועל; לא הסיכומים המצטברים של 5 ימים). במקרה של שוויון מדויק, ביטול והחזר כספי. במקרה של דחייה או ביטול: אם סרט שברשימה משנה את מועד יציאתו, הוא נשאר בשוק; הוא זוכה רק אם הוא במקום הראשון באותו סוף שבוע."
  }
 },
 "image": null,
 "ferme_at": "2026-11-24T22:00:00Z",
 "resolution_at": "2026-11-30T20:00:00Z",
 "source": {"nom":"Box Office Mojo, week-end 2026W48","url":"https://www.boxofficemojo.com/weekend/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "projections de Boxoffice Pro : Hexed 35–45 M$ sur 3 jours (50–70 M$ sur 5 jours), Focker-in-Law 30–40 M$ (45–65 M$ sur 5 jours). Deadline donne 40–50 M$ sur 5 jours à chacun. Hunger Games : projections du premier week-end de 55 à plus de 100 M$ ; marché public « premier week-end ≥ 105 M$ » à 90 % (https://polymarket.com/event/the-hunger-games-sunrise-on-the-reaping-opening-weekend-box-office, interne). Avec une baisse de 35 à 55 % au 2e week-end (ordre de grandeur tiré des films précédents de la saga, non revérifié aujourd'hui), il ferait environ 45–55 M$, au niveau des nouveautés. Son vrai premier week-end sera connu le 22/11, avant la clôture.",
 "origine": "actu",
 "verifs": [
  "https://www.boxofficemojo.com/calendar/2026-11-20/",
  "https://www.comicbasics.com/?p=202121",
  "https://www.boxofficepro.com/?p=46471",
  "https://movies.disney.com/hexed"
 ],
 "options": [
  {
   "code": "hunger",
   "noms": {"fr":"Hunger Games: Sunrise on the Reaping","en":"Hunger Games: Sunrise on the Reaping","he":"Hunger Games: Sunrise on the Reaping"},
   "p0": 50,
   "image": null
  },
  {"code":"hexed","noms":{"fr":"Hexed","en":"Hexed","he":"Hexed"},"p0":32,"image":null},
  {"code":"focker","noms":{"fr":"Focker-in-Law","en":"Focker-in-Law","he":"Focker-in-Law"},"p0":16,"image":null},
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":2,"image":null}
 ]
},
{
 "id": "pl-new-ars-2026-11-21",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : Newcastle, match nul ou Arsenal ?",
   "court": "Newcastle – Arsenal",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de Newcastle, match nul ou victoire de Arsenal. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (17:30 UTC)."
  },
  "en": {
   "q": "Who will win: Newcastle, draw, or Arsenal?",
   "court": "Newcastle – Arsenal",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Newcastle United win, draw or Arsenal win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (17:30 UTC)."
  },
  "he": {
   "q": "מי תנצח: ניוקאסל, תיקו או ארסנל?",
   "court": "ניוקאסל – ארסנל",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של ניוקאסל, תיקו או ניצחון של ארסנל. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (17:30 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-21T17:30:00Z",
 "resolution_at": "2026-11-21T19:35:00Z",
 "source": {"nom":"Premier League","url":"https://www.premierleague.com"},
 "regle": {
  "type": "match",
  "sport": "foot",
  "competition": "PL",
  "debut": "2026-11-21T17:30:00Z",
  "dom": "Newcastle United",
  "ext": "Arsenal",
  "lh": 0.87,
  "la": 1.87
 },
 "lien": {"match":{"sport":"foot","competition":"PL","debut":"2026-11-21T17:30:00Z"}},
 "p0_justif": "DraftKings (via ESPN) +450 / +330 / −175 → 18,18 % / 23,26 % / 63,64 % (somme 105,07 %) → sans marge 17,30 / 22,13 / 60,56. Marché prédictif public 0,155 / 0,225 / 0,615 (somme 0,995) → 15,58 / 22,61 / 61,81. Moyenne 16,44 / 22,37 / 61,19 → **17 / 22 / 61**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261121",
  "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401879232",
  "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings",
  "https://gamma-api.polymarket.com/events?slug=epl-new-ars-2026-11-21"
 ],
 "options": [
  {"code":"home","noms":{"fr":"Newcastle","en":"Newcastle United","he":"ניוקאסל"},"p0":17,"image":null},
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":22,"image":null},
  {"code":"away","noms":{"fr":"Arsenal","en":"Arsenal","he":"ארסנל"},"p0":61,"image":null}
 ]
},
{
 "id": "pl-liv-mun-2026-11-22",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : Liverpool, match nul ou Manchester United ?",
   "court": "Liverpool – Man United",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de Liverpool, match nul ou victoire de Manchester United. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (16:30 UTC)."
  },
  "en": {
   "q": "Who will win: Liverpool, draw, or Manchester United?",
   "court": "Liverpool – Man United",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Liverpool win, draw or Manchester United win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (16:30 UTC)."
  },
  "he": {
   "q": "מי תנצח: ליברפול, תיקו או מנצ'סטר יונייטד?",
   "court": "ליברפול – יונייטד",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של ליברפול, תיקו או ניצחון של מנצ'סטר יונייטד. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (16:30 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-22T16:30:00Z",
 "resolution_at": "2026-11-22T18:35:00Z",
 "source": {"nom":"Premier League","url":"https://www.premierleague.com"},
 "regle": {
  "type": "match",
  "sport": "foot",
  "competition": "PL",
  "debut": "2026-11-22T16:30:00Z",
  "dom": "Liverpool",
  "ext": "Manchester United",
  "lh": 1.95,
  "la": 1.19
 },
 "lien": {"match":{"sport":"foot","competition":"PL","debut":"2026-11-22T16:30:00Z"}},
 "p0_justif": "DraftKings −135 / +320 / +300 → 57,45 / 23,81 / 25,00 (somme 106,26) → sans marge 54,06 / 22,41 / 23,53. Marché public 0,555 / 0,225 / 0,225 (somme 1,005) → 55,22 / 22,39 / 22,39. Moyenne 54,64 / 22,40 / 22,96 → **55 / 22 / 23**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261122",
  "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings",
  "https://gamma-api.polymarket.com/events?slug=epl-liv-mun-2026-11-22",
  "https://www.beinsports.com/en-us/soccer/premier-league/articles/man-utd-confirm-pochettino-as-new-head-coach-2026-11-13",
  "https://www.irishtimes.com/sport/soccer/2026/11/12/michael-carrick-sacked-as-manchester-united-manager/"
 ],
 "options": [
  {"code":"home","noms":{"fr":"Liverpool","en":"Liverpool","he":"ליברפול"},"p0":55,"image":null},
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":22,"image":null},
  {"code":"away","noms":{"fr":"Manchester United","en":"Manchester United","he":"מנצ'סטר יונייטד"},"p0":23,"image":null}
 ]
},
{
 "id": "liga-sev-bet-2026-11-21",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : le FC Séville, match nul ou le Betis ?",
   "court": "Séville – Betis",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de FC Séville, match nul ou victoire de Betis Séville. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (17:30 UTC)."
  },
  "en": {
   "q": "Who will win: Sevilla, draw, or Real Betis?",
   "court": "Sevilla – Betis",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Sevilla win, draw or Real Betis win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (17:30 UTC)."
  },
  "he": {
   "q": "מי תנצח: סביליה, תיקו או ריאל בטיס?",
   "court": "סביליה – בטיס",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של סביליה, תיקו או ניצחון של ריאל בטיס. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (17:30 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-21T17:30:00Z",
 "resolution_at": "2026-11-21T19:35:00Z",
 "source": {"nom":"LaLiga","url":"https://www.laliga.com"},
 "regle": {"type":"match","sport":"foot","competition":"LIGA","debut":"2026-11-21T17:30:00Z","dom":"Sevilla","ext":"Real Betis","lh":1.09,"la":1.25},
 "lien": {"match":{"sport":"foot","competition":"LIGA","debut":"2026-11-21T17:30:00Z"}},
 "p0_justif": "DraftKings +195 / +245 / +140 → 33,90 / 28,99 / 41,67 (somme 104,55) → sans marge 32,42 / 27,72 / 39,85. Marché public 0,315 / 0,275 / 0,405 (somme 0,995) → 31,66 / 27,64 / 40,70. Moyenne 32,04 / 27,68 / 40,28 → **32 / 28 / 40**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261121",
  "https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings",
  "https://gamma-api.polymarket.com/public-search?q=Sevilla%20Real%20Betis"
 ],
 "options": [
  {"code":"home","noms":{"fr":"FC Séville","en":"Sevilla","he":"סביליה"},"p0":32,"image":null},
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":28,"image":null},
  {"code":"away","noms":{"fr":"Betis Séville","en":"Real Betis","he":"ריאל בטיס"},"p0":40,"image":null}
 ]
},
{
 "id": "sa-ata-int-2026-11-22",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : l'Atalanta, match nul ou l'Inter ?",
   "court": "Atalanta – Inter",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de Atalanta, match nul ou victoire de Inter Milan. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (19:45 UTC)."
  },
  "en": {
   "q": "Who will win: Atalanta, draw, or Inter?",
   "court": "Atalanta – Inter",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Atalanta win, draw or Inter win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (19:45 UTC)."
  },
  "he": {
   "q": "מי תנצח: אטאלנטה, תיקו או אינטר?",
   "court": "אטאלנטה – אינטר",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של אטאלנטה, תיקו או ניצחון של אינטר. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (19:45 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-22T19:45:00Z",
 "resolution_at": "2026-11-22T21:50:00Z",
 "source": {"nom":"Lega Serie A","url":"https://www.legaseriea.it"},
 "regle": {"type":"match","sport":"foot","competition":"SA","debut":"2026-11-22T19:45:00Z","dom":"Atalanta","ext":"Inter","lh":1.06,"la":2.04},
 "lien": {"match":{"sport":"foot","competition":"SA","debut":"2026-11-22T19:45:00Z"}},
 "p0_justif": "DraftKings +360 / +330 / −180 → 21,74 / 23,26 / 64,29 (somme 109,28) → sans marge 19,89 / 21,28 / 58,83. Marché public 0,185 / 0,205 / 0,605 (somme 0,995) → 18,59 / 20,60 / 60,80. Moyenne 19,24 / 20,94 / 59,82 → **19 / 21 / 60**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20261122",
  "https://site.api.espn.com/apis/v2/sports/soccer/ita.1/standings",
  "https://gamma-api.polymarket.com/public-search?q=Atalanta%20Inter",
  "https://commons.wikimedia.org/wiki/File:Atalanta_BC.png",
  "https://commons.wikimedia.org/wiki/File:FC_Internazionale_Milano_2021.svg"
 ],
 "options": [
  {"code":"home","noms":{"fr":"Atalanta","en":"Atalanta","he":"אטאלנטה"},"p0":19,"image":{"fichier":"File:Atalanta BC.png","genre":"logo"}},
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":21,"image":null},
  {
   "code": "away",
   "noms": {"fr":"Inter Milan","en":"Inter","he":"אינטר"},
   "p0": 60,
   "image": {"fichier":"File:FC Internazionale Milano 2021.svg","genre":"logo"}
  }
 ]
},
{
 "id": "bl-bmg-bvb-2026-11-21",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : le Borussia Mönchengladbach, match nul ou le Borussia Dortmund ?",
   "court": "Gladbach – Dortmund",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de Borussia Mönchengladbach, match nul ou victoire de Borussia Dortmund. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (14:30 UTC)."
  },
  "en": {
   "q": "Who will win: Borussia Mönchengladbach, draw, or Borussia Dortmund?",
   "court": "Gladbach – Dortmund",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Borussia Mönchengladbach win, draw or Borussia Dortmund win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (14:30 UTC)."
  },
  "he": {
   "q": "מי תנצח: בורוסיה מנשנגלדבאך, תיקו או בורוסיה דורטמונד?",
   "court": "גלדבאך – דורטמונד",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של בורוסיה מנשנגלדבאך, תיקו או ניצחון של בורוסיה דורטמונד. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (14:30 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-21T14:30:00Z",
 "resolution_at": "2026-11-21T16:35:00Z",
 "source": {"nom":"Bundesliga (et OpenLigaDB)","url":"https://www.bundesliga.com"},
 "regle": {
  "type": "match",
  "sport": "foot",
  "competition": "BL",
  "debut": "2026-11-21T14:30:00Z",
  "dom": "Borussia Mönchengladbach",
  "ext": "Borussia Dortmund",
  "openligadb": 83242,
  "lh": 0.93,
  "la": 1.9
 },
 "lien": {"match":{"sport":"foot","competition":"BL","debut":"2026-11-21T14:30:00Z","openligadb":83242}},
 "p0_justif": "DraftKings +380 / +330 / −175 → 20,83 / 23,26 / 63,64 (somme 107,73) → sans marge 19,34 / 21,59 / 59,07. Marché public 0,175 / 0,215 / 0,615 (somme 1,005) → 17,41 / 21,39 / 61,19. Moyenne 18,38 / 21,49 / 60,13 → **18 / 22 / 60**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates=20261121",
  "https://site.api.espn.com/apis/v2/sports/soccer/ger.1/standings",
  "https://api.openligadb.de/getmatchdata/bl1/2026/10",
  "https://api.openligadb.de/getmatchdata/83242",
  "https://gamma-api.polymarket.com/public-search?q=Dortmund",
  "https://commons.wikimedia.org/wiki/File:Borussia_Dortmund_logo.svg",
  "https://commons.wikimedia.org/wiki/File:Borussia_M%C3%B6nchengladbach_logo.svg"
 ],
 "options": [
  {
   "code": "home",
   "noms": {"fr":"Borussia Mönchengladbach","en":"Borussia Mönchengladbach","he":"בורוסיה מנשנגלדבאך"},
   "p0": 18,
   "image": {"fichier":"File:Borussia Mönchengladbach logo.svg","genre":"logo"}
  },
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":22,"image":null},
  {
   "code": "away",
   "noms": {"fr":"Borussia Dortmund","en":"Borussia Dortmund","he":"בורוסיה דורטמונד"},
   "p0": 60,
   "image": {"fichier":"File:Borussia Dortmund logo.svg","genre":"logo"}
  }
 ]
},
{
 "id": "l1-lil-lyo-2026-11-21",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : Lille, match nul ou Lyon ?",
   "court": "Lille – Lyon",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de LOSC Lille, match nul ou victoire de Olympique lyonnais. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (19:45 UTC)."
  },
  "en": {
   "q": "Who will win: Lille, draw, or Lyon?",
   "court": "Lille – Lyon",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Lille win, draw or Lyon win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (19:45 UTC)."
  },
  "he": {
   "q": "מי תנצח: ליל, תיקו או ליון?",
   "court": "ליל – ליון",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של ליל, תיקו או ניצחון של ליון. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (19:45 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-21T19:45:00Z",
 "resolution_at": "2026-11-21T21:50:00Z",
 "source": {"nom":"Ligue 1","url":"https://ligue1.com"},
 "regle": {"type":"match","sport":"foot","competition":"L1","debut":"2026-11-21T19:45:00Z","dom":"Lille","ext":"Lyon","lh":1.22,"la":0.96},
 "lien": {"match":{"sport":"foot","competition":"L1","debut":"2026-11-21T19:45:00Z"}},
 "p0_justif": "DraftKings +130 / +230 / +225 → 43,48 / 30,30 / 30,77 (somme 104,55) → sans marge 41,59 / 28,98 / 29,43. Marché public 0,415 / 0,295 / 0,295 (somme 1,005) → 41,29 / 29,35 / 29,35. Moyenne 41,44 / 29,17 / 29,39 → **42 / 29 / 29**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261121",
  "https://site.api.espn.com/apis/v2/sports/soccer/fra.1/standings",
  "https://gamma-api.polymarket.com/public-search?q=Lille%20Lyon"
 ],
 "options": [
  {"code":"home","noms":{"fr":"LOSC Lille","en":"Lille","he":"ליל"},"p0":42,"image":null},
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":29,"image":null},
  {"code":"away","noms":{"fr":"Olympique lyonnais","en":"Lyon","he":"ליון"},"p0":29,"image":null}
 ]
},
{
 "id": "ucl-psg-rom-2026-11-25",
 "nature": "options",
 "categorie": "sport",
 "moteur_cat": "Football",
 "textes": {
  "fr": {
   "q": "Qui va gagner : le Paris Saint-Germain, match nul ou l'AS Rome ?",
   "court": "PSG – AS Rome",
   "critere": "Résultat à la fin du temps réglementaire (90 minutes et arrêts de jeu ; ni prolongation ni tirs au but) : victoire de Paris Saint-Germain, match nul ou victoire de AS Rome. Match reporté de plus de 48 heures, ou arrêté sans résultat officiel : marché annulé et mises remboursées ; un score homologué par l'instance officielle dans les 48 heures fait foi. Les mises ferment au coup d'envoi (20:00 UTC)."
  },
  "en": {
   "q": "Who will win: Paris Saint-Germain, draw, or Roma?",
   "court": "PSG – Roma",
   "critere": "Result at the end of regulation time (90 minutes plus stoppage time; no extra time or penalty shoot-out): Paris Saint-Germain win, draw or Roma win. If the match is postponed by more than 48 hours, or abandoned without an official result, the market is cancelled and stakes are refunded; a score ratified by the official body within 48 hours stands. Betting closes at kick-off (20:00 UTC)."
  },
  "he": {
   "q": "מי תנצח: פריז סן ז'רמן, תיקו או רומא?",
   "court": "פריז סן ז'רמן – רומא",
   "critere": "התוצאה בסיום הזמן החוקי (90 דקות ותוספת זמן; ללא הארכה ודו-קרב פנדלים): ניצחון של פריז סן ז'רמן, תיקו או ניצחון של רומא. משחק שנדחה ביותר מ-48 שעות, או שהופסק ללא תוצאה רשמית: השוק מבוטל וההימורים מוחזרים; תוצאה שאושרה על ידי הגוף הרשמי בתוך 48 שעות קובעת. ההימורים נסגרים בשריקת הפתיחה (20:00 UTC)."
  }
 },
 "image": null,
 "ferme_at": "2026-11-25T20:00:00Z",
 "resolution_at": "2026-11-25T22:05:00Z",
 "source": {"nom":"UEFA","url":"https://www.uefa.com/uefachampionsleague/"},
 "regle": {
  "type": "match",
  "sport": "foot",
  "competition": "UCL",
  "debut": "2026-11-25T20:00:00Z",
  "dom": "Paris Saint-Germain",
  "ext": "Roma",
  "lh": 2.58,
  "la": 0.97
 },
 "lien": {"match":{"sport":"foot","competition":"UCL","debut":"2026-11-25T20:00:00Z"}},
 "p0_justif": "DraftKings −310 / +475 / +650 → 75,61 / 17,39 / 13,33 (somme 106,33) → sans marge 71,11 / 16,36 / 12,54. Marché public 0,725 / 0,16 / 0,115 (somme 1,00). Moyenne 71,80 / 16,18 / 12,02 → **72 / 16 / 12**.",
 "origine": "sport",
 "verifs": [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20261125",
  "https://gamma-api.polymarket.com/public-search?q=Paris%20Saint-Germain%20Roma"
 ],
 "options": [
  {"code":"home","noms":{"fr":"Paris Saint-Germain","en":"Paris Saint-Germain","he":"פריז סן ז'רמן"},"p0":72,"image":null},
  {"code":"draw","noms":{"fr":"Match nul","en":"Draw","he":"תיקו"},"p0":16,"image":null},
  {"code":"away","noms":{"fr":"AS Rome","en":"Roma","he":"רומא"},"p0":12,"image":null}
 ]
}
]$graine$::jsonb);

select wm.droits();
