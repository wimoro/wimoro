-- Marchés réels, lot 8 (19 nov. 2026) : la graine du catalogue, partie 4 sur 6 — 10 fiches, de « anthropic-prix-ipo-fin-2026 » à « tesla-spacex-accord-fusion ».
-- Texte généré à partir des recherches et des traductions du 19 nov. 2026 (docs/DONNEES.md § 7) ; chaque fiche passe par
-- wm.fiche_creer, avec les mêmes contrôles qu'une fiche écrite par l'équipe. Sans effet sur le site en ligne : catalogue.serveur
-- est éteint, aucune ligne du moteur n'est créée avant la mise en ligne.
select wm.catalogue_semer($graine$[
{
 "id": "anthropic-prix-ipo-fin-2026",
 "nature": "binaire",
 "categorie": "bourse",
 "textes": {
  "fr": {
   "q": "L'action Anthropic (ANT) finira-t-elle 2026 au-dessus de son prix d'introduction en Bourse ?",
   "court": "Anthropic > prix d'IPO",
   "critere": "OUI si le cours de clôture officiel d'Anthropic, PBC (ANT, Nasdaq) du jeudi 31/12/2026 est strictement supérieur au prix d'introduction des actions de classe A inscrit dans le prospectus final (83,00 $, prix fixé le 18/11/2026) ; sinon NON. En cas de report ou d'annulation : si l'action n'est pas cotée le 31/12/2026 (introduction annulée ou suspendue), annulation et remboursement ; division d'actions → prix d'introduction ajusté du même ratio."
  },
  "en": {
   "q": "Will Anthropic (ANT) stock end 2026 above its IPO price?",
   "court": "ANT above IPO price",
   "critere": "YES if the official closing price of Anthropic, PBC (ANT, Nasdaq) on Thursday, December 31, 2026 is strictly above the IPO price of the Class A shares stated in the final prospectus ($83.00, the price set on November 18, 2026); otherwise NO. In case of postponement or cancellation: if the stock is not listed on December 31, 2026 (IPO cancelled or suspended), cancellation and refund; stock split → IPO price adjusted by the same ratio."
  },
  "he": {
   "q": "האם מניית אנת'רופיק (ANT) תסיים את 2026 מעל מחיר ההנפקה שלה?",
   "court": "ANT מעל מחיר ההנפקה",
   "critere": "כן אם מחיר הסגירה הרשמי של Anthropic, PBC (ANT, נאסד״ק) ביום חמישי, 31 בדצמבר 2026 גבוה ממש ממחיר ההנפקה של מניות סוג A שנקבע בתשקיף הסופי (83.00 דולר, המחיר שנקבע ב-18 בנובמבר 2026); אחרת לא. במקרה של דחייה או ביטול: אם המניה אינה רשומה למסחר ב-31 בדצמבר 2026 (ההנפקה בוטלה או הושעתה), ביטול והחזר כספי; פיצול מניות: מחיר ההנפקה מותאם באותו יחס."
  }
 },
 "image": {"fichier":"File:Anthropic logo.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2026-12-31T21:30:00Z",
 "source": {"nom":"Nasdaq, cours historiques ANT","url":"https://www.nasdaq.com/market-activity/stocks/ant/historical"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 69,
 "p0_justif": "Introduction à 83 $ le 18/11/2026 ; premier jour de cotation le 19/11 : ouverture 111,50 $, 96,20 $ à 18:47 UTC (Yahoo, NasdaqGS). Modèle lognormal sans dérive, σ = 70 % (action nouvelle), T = 29 séances / 252 : σ√T = 0,2375 ; d2 = (ln(96,20/83) − 0,028) / 0,2375 = 0,50 → 69 %.",
 "origine": "actu",
 "verifs": [
  "https://www.stocktitan.net/articles/anthropic-ipo-live-ant-first-trading-day-2026",
  "https://www.rttnews.com/3712632/anthropic-sets-ipo-price-range-at-70-78-per-share-launches-roadshow.aspx?type=ipo",
  "https://query1.finance.yahoo.com/v8/finance/chart/ANT?range=5d&interval=1d",
  "https://query1.finance.yahoo.com/v1/finance/search?q=Anthropic",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=ipos&order=volume&ascending=false"
 ]
},
{
 "id": "shutdown-usa-decembre-2026",
 "nature": "binaire",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "Le gouvernement fédéral américain sera-t-il en « shutdown » d'ici le 12 décembre 2026 ?",
   "court": "Shutdown US au 12/12",
   "critere": "OUI si, au plus tard le samedi 12/12/2026 23:59 heure de New York (13/12 04:59 UTC), une interruption des crédits (« lapse in appropriations ») oblige au moins une agence fédérale à suspendre ses activités non essentielles : directive de l'OMB demandant d'exécuter les plans d'arrêt, ou statut officiel de l'OPM indiquant un arrêt pour défaut de crédits. Un shutdown partiel compte. Une interruption purement technique de quelques heures pendant un week-end, sans directive d'arrêt ni mise en chômage des agents, ne compte pas. Sinon NON. En cas de report ou d'annulation : si le Congrès vote une nouvelle loi de financement provisoire avant l'échéance, c'est NON (sauf interruption effective avant le 12/12)."
  },
  "en": {
   "q": "Will the US federal government go into a shutdown by December 12, 2026?",
   "court": "US shutdown by Dec 12",
   "critere": "YES if, no later than Saturday, December 12, 2026 23:59 New York time (December 13, 04:59 UTC), a lapse in appropriations forces at least one federal agency to suspend its non-essential activities: an OMB directive requesting the execution of shutdown plans, or an official OPM status indicating a shutdown due to a lapse in appropriations. A partial shutdown counts. A purely technical lapse of a few hours over a weekend, with no shutdown directive and no furlough of employees, does not count. Otherwise NO. In case of postponement or cancellation: if Congress passes a new stopgap funding law before the deadline, the result is NO (unless an actual lapse occurred before December 12)."
  },
  "he": {
   "q": "האם הממשל הפדרלי בארה״ב ייכנס להשבתה (שאטדאון) עד 12 בדצמבר 2026?",
   "court": "שאטדאון בארה״ב עד 12.12",
   "critere": "כן אם, לא יאוחר מיום שבת, 12 בדצמבר 2026 בשעה 23:59 שעון ניו יורק (13 בדצמבר בשעה 04:59 UTC), הפסקת תקציב («lapse in appropriations») מחייבת לפחות סוכנות פדרלית אחת להשעות את פעילויותיה שאינן חיוניות: הנחיה של ה-OMB להפעיל את תוכניות ההשבתה, או סטטוס רשמי של ה-OPM המציין השבתה עקב היעדר תקציב. השבתה חלקית נחשבת. הפסקה טכנית גרידא של כמה שעות במהלך סוף שבוע, ללא הנחיית השבתה וללא הוצאת עובדים לחופשה כפויה, אינה נחשבת. אחרת לא. במקרה של דחייה או ביטול: אם הקונגרס מאשר חוק מימון זמני חדש לפני המועד, התוצאה היא לא (אלא אם כן התרחשה הפסקה בפועל לפני 12 בדצמבר)."
  }
 },
 "image": {"fichier":"File:United States Capitol west front edit2.jpg","genre":"photo"},
 "ferme_at": "2026-12-11T23:00:00Z",
 "resolution_at": "2026-12-13T05:00:00Z",
 "source": {"nom":"OPM, statut des agences fédérales","url":"https://www.opm.gov/policy-data-oversight/snow-dismissal-procedures/current-status/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 33,
 "p0_justif": "la loi de financement provisoire (Division A de la P.L. 119-103, signée le 02/09/2026) court jusqu'au 11/12/2026 ; à défaut de nouvelle loi, interruption à partir du 12/12. Le Congrès est en session de fin de mandat après les élections du 03/11 ; trois interruptions de crédits depuis octobre 2025 (dont 43 jours fin 2025). Marché public (interne) : 34,5 % d'ici le 12/12, 36 % d'ici le 31/12. Retenu 33 %.",
 "origine": "actu",
 "verifs": [
  "https://www.everycrsreport.com/files/2026-09-17_R49353_98ddd8e7b1852b47b24e394ed7ddf6d6d53b4632.html",
  "https://wisconsinexaminer.com/2026/11/09/repub/gop-congress-faces-funding-deadline-farm-bill-lengthy-to-do-list-in-year-end-session/",
  "https://www.opm.gov/policy-data-oversight/snow-dismissal-procedures/current-status/",
  "https://gamma-api.polymarket.com/events?closed=false&limit=200&order=volume24hr&ascending=false"
 ]
},
{
 "id": "budget-france-2027",
 "nature": "binaire",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "La loi de finances pour 2027 sera-t-elle promulguée et publiée au Journal officiel d'ici le 31 décembre 2026 ?",
   "court": "Budget 2027 voté à temps",
   "critere": "OUI si la loi de finances pour 2027 (budget complet de l'État pour l'année 2027) est publiée au Journal officiel de la République française au plus tard le 31/12/2026 à 23h59 heure de Paris (22:59 UTC) ; sinon NON. Une « loi spéciale », une loi de finances partielle ou une mise en vigueur du budget par ordonnances (article 47 de la Constitution) ne comptent pas : il faut une loi de finances adoptée par le Parlement (y compris par le 49.3) et promulguée. En cas de report ou d'annulation : censure du gouvernement, dissolution ou report du vote → NON si aucune loi de finances 2027 n'est publiée au 31/12."
  },
  "en": {
   "q": "Will France's 2027 budget law be enacted and published by December 31, 2026?",
   "court": "France budget by Dec 31",
   "critere": "YES if the 2027 finance law (the complete State budget for the year 2027) is published in the Journal officiel de la République française no later than December 31, 2026 at 23:59 Paris time (22:59 UTC); otherwise NO. A ‘special law’ (loi spéciale), a partial finance law or the entry into force of the budget by ordinances (Article 47 of the Constitution) do not count: a finance law adopted by Parliament (including via Article 49.3) and promulgated is required. In case of postponement or cancellation: government censure (no-confidence vote), dissolution or postponement of the vote → NO if no 2027 finance law is published by December 31."
  },
  "he": {
   "q": "האם חוק התקציב של צרפת לשנת 2027 יאושר ויפורסם ברשומות עד 31 בדצמבר 2026?",
   "court": "תקציב צרפת 2027 בזמן",
   "critere": "כן אם חוק התקציב לשנת 2027 (תקציב המדינה המלא לשנת 2027) מתפרסם ב-Journal officiel de la République française (העיתון הרשמי) לא יאוחר מ-31 בדצמבר 2026 בשעה 23:59 שעון פריז (22:59 UTC); אחרת לא. «חוק מיוחד» (loi spéciale), חוק תקציב חלקי או הפעלת התקציב באמצעות צווים (סעיף 47 לחוקה) אינם נחשבים: נדרש חוק תקציב שאושר בפרלמנט (לרבות באמצעות סעיף 49.3) ונחתם בידי הנשיא. במקרה של דחייה או ביטול: הפלת הממשלה בהצבעת אי-אמון, פיזור האספה הלאומית או דחיית ההצבעה: לא, אם עד 31 בדצמבר לא פורסם חוק תקציב לשנת 2027."
  }
 },
 "image": {"fichier":"File:Assemblée Nationale, Palais Bourbon.jpg","genre":"photo"},
 "ferme_at": "2026-12-30T23:00:00Z",
 "resolution_at": "2027-01-01T09:00:00Z",
 "source": {"nom":"Légifrance (Journal officiel)","url":"https://www.legifrance.gouv.fr/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 35,
 "p0_justif": "l'Assemblée nationale a rejeté la partie « recettes » du projet de loi de finances 2027 le 04/11/2026 (0 pour, 458 contre), ce qui met fin à la 1re lecture ; le texte va au Sénat (examen du 20/11 au 08/12, vote solennel le 09/12) puis en commission mixte paritaire avant la mi-décembre ; délai constitutionnel de 70 jours jusqu'au 17/12 ; le gouvernement Lecornu peut recourir au 49.3 en nouvelle lecture, avec risque de censure. Les deux budgets précédents n'ont pas été adoptés avant le 31/12 (lois spéciales). Marché public (interne) : 37,5 % (achat 34 %, vente 41 %). Retenu 35 %.",
 "origine": "actu",
 "verifs": [
  "https://lcp.fr/actualites/budget-2027-l-assemblee-rejette-a-l-unanimite-la-partie-recettes-le-projet-de-loi-de",
  "https://datan.fr/votes/legislature-17/2026/11",
  "https://www.publicsenat.fr/actualites/politique/budget-2027-calendrier-49-3-ordonnancesquelles-sont-les-echeances-a-venir-et-les-scenarios-possibles",
  "https://www.senat.fr/ordre-du-jour/files/02_Calendrier_budgetaire_PLF2027_20261029.pdf",
  "https://gamma-api.polymarket.com/events?closed=false&limit=100&tag_slug=france&order=volume&ascending=false"
 ]
},
{
 "id": "boe-decembre-2026",
 "nature": "binaire",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "La Banque d'Angleterre relèvera-t-elle son taux directeur le 17 décembre 2026 ?",
   "court": "Hausse BoE le 17 déc.",
   "critere": "OUI si le Bank Rate annoncé le 17/12/2026 à 12:00 heure de Londres (12:00 UTC) est strictement supérieur au taux en vigueur avant l'annonce (4,00 %) ; sinon NON (statu quo ou baisse). En cas de report ou d'annulation : si l'annonce est déplacée, on retient la décision annoncée avant le 31/12/2026 ; sinon annulation. Une hausse d'urgence entre l'ouverture du marché et le 17/12 compterait aussi OUI."
  },
  "en": {
   "q": "Will the Bank of England raise Bank Rate on December 17, 2026?",
   "court": "BoE rate hike Dec 17",
   "critere": "YES if the Bank Rate announced on December 17, 2026 at 12:00 London time (12:00 UTC) is strictly above the rate in effect before the announcement (4.00%); otherwise NO (unchanged or cut). In case of postponement or cancellation: if the announcement is moved, the decision announced before December 31, 2026 is used; otherwise cancellation. An emergency hike between the market opening and December 17 would also count as YES."
  },
  "he": {
   "q": "האם בנק אנגליה יעלה את הריבית ב-17 בדצמבר 2026?",
   "court": "העלאת ריבית בבנק אנגליה",
   "critere": "כן אם ריבית הבנק (Bank Rate) של בנק אוף אינגלנד שתוכרז ב-17 בדצמבר 2026 בשעה 12:00 שעון לונדון (12:00 UTC) גבוהה ממש מהריבית שבתוקף לפני ההודעה (4.00%); אחרת לא (ללא שינוי או הורדה). במקרה של דחייה או ביטול: אם ההודעה מוזזת, נלקחת ההחלטה שהוכרזה לפני 31 בדצמבר 2026; אחרת ביטול. העלאת חירום בין פתיחת השוק ל-17 בדצמבר תיחשב גם היא כן."
  }
 },
 "image": {"fichier":"File:Bank of England Building, London, UK - Diliff.jpg","genre":"photo"},
 "ferme_at": "2026-12-17T11:00:00Z",
 "resolution_at": "2026-12-17T12:15:00Z",
 "source": {"nom":"Banque d’Angleterre (Bank Rate)","url":"https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 73,
 "p0_justif": "Bank Rate relevé de 3,75 % à 4,00 % le 05/11/2026 (vote 8–1). Marché public (interne) : hausse de 0,25 = 72,5 %, statu quo 26 %, hausse ≥ 0,50 = 0,5 %, baisse < 0,5 %. Retenu 73 %.",
 "origine": "actu",
 "verifs": [
  "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates",
  "https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp",
  "https://www.bankofengland.co.uk/-/media/boe/files/monetary-policy-summary-and-minutes/2026/monetary-policy-summary-and-minutes-november-2026.pdf",
  "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Oct/2026&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=economy&order=volume&ascending=false"
 ]
},
{
 "id": "espagne-legislatives-2026",
 "nature": "options",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Quel parti remportera le plus de sièges aux législatives espagnoles du 29 novembre ?",
   "court": "Espagne : 1er parti",
   "critere": "gagne le parti qui obtient le plus de sièges au Congrès des députés (350 sièges, majorité 176), d'après le dépouillement provisoire du ministère de l'Intérieur à 100 %. Les listes des fédérations régionales officielles comptent avec leur parti (ex. PSC avec PSOE). En cas d'égalité de sièges, gagne le parti qui a le plus de voix. En cas d'écart entre le provisoire et l'officiel, l'officiel l'emporte. En cas de report ou d'annulation : report = clôture déplacée à la veille du nouveau scrutin ; annulation = remboursement."
  },
  "en": {
   "q": "Which party will win the most seats in Spain's November 29 general election?",
   "court": "Spain: top party",
   "critere": "the winner is the party that wins the most seats in the Congress of Deputies (350 seats, majority 176), according to the Ministry of the Interior’s provisional count at 100%. Lists of official regional federations count with their party (e.g. PSC with PSOE). In the event of a tie in seats, the winner is the party with the most votes. In the event of a discrepancy between the provisional and official results, the official result prevails. In case of postponement or cancellation: postponement = close moved to the day before the new vote; cancellation = refund."
  },
  "he": {
   "q": "איזו מפלגה תזכה במספר המושבים הגדול ביותר בבחירות בספרד ב-29 בנובמבר?",
   "court": "ספרד: המפלגה הגדולה",
   "critere": "זוכה המפלגה שמקבלת את מספר המושבים הגדול ביותר בקונגרס הנבחרים (350 מושבים, רוב של 176), לפי הספירה הזמנית של משרד הפנים לאחר ספירת 100% מהקולות. רשימות של הפדרציות האזוריות הרשמיות נספרות יחד עם המפלגה שלהן (למשל PSC עם PSOE). במקרה של שוויון במושבים, זוכה המפלגה שקיבלה את מספר הקולות הגדול ביותר. במקרה של פער בין התוצאות הזמניות לתוצאות הרשמיות, התוצאות הרשמיות גוברות. במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז ליום שלפני הבחירות החדשות; ביטול = החזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2026-11-29T07:00:00Z",
 "resolution_at": "2026-11-30T06:00:00Z",
 "source": {"nom":"Ministère espagnol de l’Intérieur","url":"https://www.interior.gob.es"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "élection anticipée convoquée par Pedro Sánchez ; les Cortes ont été dissoutes le 6 octobre 2026 (décret au BOE) après le rejet de son plan logement. Huit sondages publiés du 26/10 au 18/11 (40dB/Prisa, Sigma Dos, Sondaxe, EM-Analytics, Public First, SW Demoscopia) : le PP est en tête dans sept, avec 28,5 à 32,4 % et 117 à 140 sièges ; le PSOE a 26,7 à 31,9 % et 108 à 134 sièges ; Vox 16,4 à 19,7 %. Un sondage (SW Demoscopia) place le PSOE devant. Marché public : PP 78,5 % (https://polymarket.com/event/spain-general-election-winner, interne).",
 "origine": "actu",
 "verifs": [
  "https://en.wikipedia.org/wiki/2026_Spanish_general_election",
  "https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Spanish_general_election"
 ],
 "options": [
  {
   "code": "pp",
   "noms": {"fr":"PP (Parti populaire)","en":"PP (People’s Party)","he":"המפלגה העממית (PP)"},
   "p0": 78,
   "image": {"fichier":"File:ALBERTO NÚÑEZ FEIJÓO.jpg","genre":"photo"}
  },
  {
   "code": "psoe",
   "noms": {"fr":"PSOE (socialistes)","en":"PSOE (Socialists)","he":"PSOE (הסוציאליסטים)"},
   "p0": 20,
   "image": {"fichier":"File:Pedro Sánchez 2026 Portrait (3x4 cropped).jpg","genre":"photo"}
  },
  {
   "code": "vox",
   "noms": {"fr":"Vox","en":"Vox","he":"ווקס (Vox)"},
   "p0": 1,
   "image": {"fichier":"File:Santiago Abascal portrait.jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":1,"image":null}
 ]
},
{
 "id": "israel-prochain-pm",
 "nature": "options",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Qui sera investi prochain Premier ministre d'Israël ?",
   "court": "Israël : prochain PM",
   "critere": "gagne la personne qui prête serment comme Premier ministre après l'approbation d'un nouveau gouvernement par la Knesset, entre le 19/11/2026 et le 30/06/2027. Le maintien de Benyamin Netanyahou comme Premier ministre de transition ne compte pas ; il gagne seulement s'il est investi à la tête d'un nouveau gouvernement. En cas de rotation, compte la personne investie Premier ministre en premier, pas le « Premier ministre alternant ». Si de nouvelles élections ont lieu et qu'un gouvernement est investi avant le 30/06/2027, ce Premier ministre gagne. Aucun gouvernement investi au 30/06/2027 = dernière option. En cas de report ou d'annulation : couvert par l'option « aucun gouvernement »."
  },
  "en": {
   "q": "Who will be sworn in as Israel's next prime minister?",
   "court": "Israel's next PM",
   "critere": "the winner is the person who is sworn in as Prime Minister after the Knesset approves a new government, between November 19, 2026 and June 30, 2027. Benjamin Netanyahu remaining as caretaker Prime Minister does not count; he wins only if he is sworn in at the head of a new government. In the event of a rotation, the person sworn in as Prime Minister first counts, not the ‘alternate Prime Minister’. If new elections take place and a government is sworn in before June 30, 2027, that Prime Minister wins. No government sworn in by June 30, 2027 = last option. In case of postponement or cancellation: covered by the ‘no government’ option."
  },
  "he": {
   "q": "מי יושבע כראש הממשלה הבא של ישראל?",
   "court": "ראש הממשלה הבא",
   "critere": "זוכה האדם שמושבע כראש הממשלה לאחר שהכנסת מאשרת ממשלה חדשה, בין 19 בנובמבר 2026 ל-30 ביוני 2027. המשך כהונתו של בנימין נתניהו כראש ממשלת מעבר אינו נחשב; הוא זוכה רק אם הוא מושבע בראש ממשלה חדשה. במקרה של רוטציה, נחשב מי שמושבע ראשון כראש הממשלה, ולא «ראש הממשלה החליפי». אם מתקיימות בחירות חדשות וממשלה מושבעת לפני 30 ביוני 2027, ראש הממשלה הזה זוכה. לא הושבעה ממשלה עד 30 ביוני 2027 = האופציה האחרונה. במקרה של דחייה או ביטול: מכוסה על ידי האופציה «אין ממשלה»."
  }
 },
 "image": null,
 "ferme_at": "2027-06-30T20:59:59Z",
 "resolution_at": "2027-07-01T12:00:00Z",
 "source": {"nom":"Knesset","url":"https://main.knesset.gov.il"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "élection du 27/10/2026 : bloc Netanyahou 53 sièges, alliance de quatre partis autour d'Eisenkot 48, partis arabes 19 (sur 120 ; majorité 61). Le président Herzog a confié le mandat à Gadi Eisenkot (67 recommandations contre 46 pour Netanyahou), remis le 8/11. Délai jusqu'au 6 décembre, prolongeable jusqu'au 20 décembre. En cas d'échec : autre candidat, puis éventuellement de nouvelles élections sous 90 jours. Scénario jugé le plus probable par des experts : bloc Eisenkot + Shas + Judaïsme unifié de la Torah = 61 sièges, avec des obstacles sur le service militaire. Discussions aussi avec le Likoud (« unité ») et piste d'un gouvernement minoritaire soutenu de l'extérieur par Ra'am. Marché public : Eisenkot 57,1 %, Netanyahou 23,8 %, Bennett 5,4 %, Lieberman 5 % (https://polymarket.com/event/who-will-be-the-next-prime-minister-of-israel-after-the-next-election, interne). Gouvernement formé avant le 31/12/2026 : 36,5 % (https://polymarket.com/event/next-israeli-government-formed-by, interne).",
 "origine": "actu",
 "verifs": [
  "https://www.aljazeera.com/news/2026/11/7/israels-president-picks-eisenkot-over-netanyahu-to-form-next-government",
  "https://www.aljazeera.com/news/2026/11/15/can-netanyahu-and-eisenkot-form-a-unity-government-in-israel",
  "https://www.aljazeera.com/news/2026/10/29/israel-election-result-shows-no-overall-majority-as-vote-count-complete",
  "https://www.israelhayom.com/2026/11/07/herzog-taps-eisenkot-to-form-next-government-after-securing-backing-of-67-mks/"
 ],
 "options": [
  {
   "code": "eisenkot",
   "noms": {"fr":"Gadi Eisenkot","en":"Gadi Eisenkot","he":"גדי איזנקוט"},
   "p0": 55,
   "image": {"fichier":"File:Gadi Eisenkot 2 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "netanyahu",
   "noms": {"fr":"Benyamin Netanyahou","en":"Benjamin Netanyahu","he":"בנימין נתניהו"},
   "p0": 24,
   "image": {"fichier":"File:Benjamin Netanyahu, February 2023 (cropped)(b).jpg","genre":"photo"}
  },
  {
   "code": "bennett",
   "noms": {"fr":"Naftali Bennett","en":"Naftali Bennett","he":"נפתלי בנט"},
   "p0": 5,
   "image": {"fichier":"File:Naftali Bennett official portrait.jpg","genre":"photo"}
  },
  {
   "code": "lieberman",
   "noms": {"fr":"Avigdor Lieberman","en":"Avigdor Lieberman","he":"אביגדור ליברמן"},
   "p0": 4,
   "image": {"fichier":"File:Avigdor Lieberman 2017.jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre ou aucun gouvernement","en":"Other or no government","he":"אחר או ללא ממשלה"},"p0":12,"image":null}
 ]
},
{
 "id": "le-pen-liste-officielle-2027",
 "nature": "binaire",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Marine Le Pen figurera-t-elle sur la liste officielle des candidats à la présidentielle 2027 ?",
   "court": "Le Pen sur la liste ?",
   "critere": "OUI si Marine Le Pen figure sur la liste des candidats au 1er tour arrêtée par le Conseil constitutionnel (décision publiée au Journal officiel). NON dans tous les autres cas : inéligibilité confirmée, retrait, remplacement par un autre candidat du RN, parrainages insuffisants… En cas de report ou d'annulation : en cas de report de l'élection, on prend la liste arrêtée pour le scrutin reporté."
  },
  "en": {
   "q": "Will Marine Le Pen be on the official candidate list for the 2027 French presidential election?",
   "court": "Le Pen on the ballot?",
   "critere": "YES if Marine Le Pen appears on the list of 1st-round candidates drawn up by the Constitutional Council (decision published in the Journal officiel). NO in all other cases: confirmed ineligibility, withdrawal, replacement by another RN candidate, insufficient sponsorships (parrainages)… In case of postponement or cancellation: if the election is postponed, the list drawn up for the postponed vote is used."
  },
  "he": {
   "q": "האם מרין לה פן תופיע ברשימת המועמדים הרשמית לבחירות לנשיאות צרפת 2027?",
   "court": "לה פן ברשימה?",
   "critere": "כן אם מרין לה פן מופיעה ברשימת המועמדים לסיבוב הראשון שקבעה המועצה החוקתית (החלטה שפורסמה ב-Journal officiel). לא בכל המקרים האחרים: שלילת הכשירות להתמודד שאושרה, פרישה, החלפתה במועמד אחר מטעם האיחוד הלאומי (RN), מספר לא מספיק של חתימות תמיכה (parrainages)… במקרה של דחייה או ביטול: במקרה של דחיית הבחירות, נלקחת הרשימה שנקבעה לבחירות שנדחו."
  }
 },
 "image": {"fichier":"File:Marine Le Pen 2025 (3x4 cropped).jpg","genre":"photo"},
 "ferme_at": "2027-03-12T17:00:00Z",
 "resolution_at": "2027-03-20T12:00:00Z",
 "source": {"nom":"Conseil constitutionnel","url":"https://www.conseil-constitutionnel.fr"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 92,
 "p0_justif": "la cour d'appel de Paris (7 juillet 2026) a prononcé 15 mois d'inéligibilité ferme, déjà purgés depuis le jugement du 31 mars 2025 ; elle reste donc éligible. Elle est candidate déclarée. Son pourvoi en cassation est en attente (LCP, 10/11/2026) ; selon la presse, la décision est attendue au plus tard début janvier 2027. Marchés publics : 93 % (achat 96 / vente 99, https://kalshi.com/markets/kxfrpresballot, interne) et 92,5 % (https://polymarket.com/event/2027-french-presidential-election-who-will-be-on-the-ballot, interne).",
 "origine": "actu",
 "verifs": [
  "https://lcp.fr/actualites/marine-le-pen-condamnee-par-la-justice-mais-eligible-comment-la-cour-d-appel-de-paris-a",
  "https://lcp.fr/actualites/presidentielle-2027-la-liste-des-candidats-declares-et-potentiels-444932",
  "https://www.slate.fr/politique/condamnation-appel-marine-le-pen-jugement-sans-consequences-politiques-decision-citoyens-gagnante-sequence-justice-rn-bardella-election-presidentielle-2027"
 ]
},
{
 "id": "taipei-maire-28-11-2026",
 "nature": "options",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Qui remportera l'élection du maire de Taipei le 28 novembre 2026 ?",
   "court": "Mairie de Taipei",
   "critere": "gagne le candidat déclaré élu maire de Taipei par la Commission électorale centrale (CEC) pour le scrutin du 28/11/2026. En cas de recompte, on attend le résultat certifié. En cas de report ou d'annulation : report = clôture déplacée ; annulation = remboursement."
  },
  "en": {
   "q": "Who will win the Taipei mayoral election on November 28, 2026?",
   "court": "Taipei mayor race",
   "critere": "the winner is the candidate declared elected Mayor of Taipei by the Central Election Commission (CEC) for the November 28, 2026 election. In the event of a recount, the certified result is awaited. In case of postponement or cancellation: postponement = close moved; cancellation = refund."
  },
  "he": {
   "q": "מי ינצח בבחירות לראשות עיריית טאיפיי ב-28 בנובמבר 2026?",
   "court": "ראשות עיריית טאיפיי",
   "critere": "זוכה המועמד שוועדת הבחירות המרכזית (CEC) הכריזה עליו כראש עיריית טאיפיי הנבחר בבחירות של 28 בנובמבר 2026. במקרה של ספירה חוזרת, ממתינים לתוצאה המאושרת. במקרה של דחייה או ביטול: דחייה = מועד הסגירה מוזז; ביטול = החזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2026-11-27T23:00:00Z",
 "resolution_at": "2026-11-28T15:00:00Z",
 "source": {"nom":"Commission électorale centrale de Taïwan","url":"https://db.cec.gov.tw"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "duel entre le maire sortant Chiang Wan-an (KMT) et le député Puma Shen (DPP, désigné le 13/05/2026). Les sondages se contredisent. Shen mène dans plusieurs : 52,6 % contre 35,3 % (enquête commandée par le Strategy and Public Research Institute, publiée le 3/11) et 44,7 % contre 43 % (Faith and Trust News Media). Chiang menait nettement au printemps (52,9 % contre 29,7 % en mai, Taiwan Brain Trust). La publication de sondages est interdite dans les derniers jours. Marché public : Chiang 59,5 % (https://polymarket.com/event/taipei-mayor-election-winner-20260813125857100, interne). Je reste proche du marché, légèrement réduit à cause des sondages.",
 "origine": "actu",
 "verifs": [
  "https://focustaiwan.tw/politics/202611140012",
  "https://www.taipeitimes.com/News/taiwan/archives/2026/11/03/2003867062",
  "https://www.taiwannews.com.tw/en/news/6476947"
 ],
 "options": [
  {
   "code": "chiang",
   "noms": {"fr":"Chiang Wan-an (KMT)","en":"Chiang Wan-an (KMT)","he":"צ'יאנג וואן-אן (KMT)"},
   "p0": 55,
   "image": {"fichier":"File:蔣萬安市長 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "shen",
   "noms": {"fr":"Puma Shen (DPP)","en":"Puma Shen (DPP)","he":"פומה שן (DPP)"},
   "p0": 44,
   "image": {"fichier":"File:Puma Shen 2024.jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":1,"image":null}
 ]
},
{
 "id": "nvidia-prochain-pdg",
 "nature": "options",
 "categorie": "tech",
 "textes": {
  "fr": {
   "q": "Qui sera nommé prochain PDG permanent de Nvidia ?",
   "court": "Prochain PDG de Nvidia",
   "critere": "gagne la personne qu'NVIDIA annonce officiellement (communiqué ou formulaire 8-K à la SEC) comme prochain PDG permanent, pas par intérim, entre le 19/11/2026 et le 30/06/2027, même si sa prise de fonction est postérieure. Colette Kress nommée PDG permanente = option Kress. Jensen Huang renommé PDG permanent = « Jensen Huang (retour) ». Personne non listée = « Autre ». Aucune annonce au 30/06/2027 = « Aucun ». En cas de report ou d'annulation : couvert par l'option « Aucun »."
  },
  "en": {
   "q": "Who will be named Nvidia's next permanent CEO?",
   "court": "Nvidia's next CEO",
   "critere": "the winner is the person NVIDIA officially announces (press release or Form 8-K filed with the SEC) as its next permanent CEO, not interim, between November 19, 2026 and June 30, 2027, even if they take office later. Colette Kress appointed permanent CEO = Kress option. Jensen Huang reappointed permanent CEO = ‘Jensen Huang (return)’. Unlisted person = ‘Other’. No announcement by June 30, 2027 = ‘None’. In case of postponement or cancellation: covered by the ‘None’ option."
  },
  "he": {
   "q": "מי ימונה למנכ״ל הקבוע הבא של אנבידיה?",
   "court": "המנכ״ל הבא של אנבידיה",
   "critere": "זוכה האדם שאנבידיה מכריזה עליו באופן רשמי (הודעה לעיתונות או טופס 8-K שהוגש ל-SEC) כמנכ״ל הקבוע הבא שלה, לא כמנכ״ל זמני, בין 19 בנובמבר 2026 ל-30 ביוני 2027, גם אם כניסתו לתפקיד מאוחרת יותר. קולט קרס מונתה למנכ״לית קבועה = האופציה של קרס. ג׳נסן הואנג מונה מחדש למנכ״ל קבוע = «ג׳נסן הואנג (חזרה)». אדם שאינו ברשימה = «אחר». אין הכרזה עד 30 ביוני 2027 = «אף אחד». במקרה של דחייה או ביטול: מכוסה על ידי האופציה «אף אחד»."
  }
 },
 "image": {"fichier":"File:Nvidia logo.svg","genre":"logo"},
 "ferme_at": "2027-06-30T20:59:59Z",
 "resolution_at": "2027-07-01T12:00:00Z",
 "source": {"nom":"Nvidia, communiqués","url":"https://nvidianews.nvidia.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "Jensen Huang a démissionné de ses postes de PDG et d'administrateur (démission acceptée le 11/11, annoncée le 12/11/2026). Colette Kress est PDG par intérim et Harvey C. Jones président du conseil. Le conseil cherche un PDG permanent, candidats internes et externes. Presse : Reuters cite Ian Buck (« strongest long-term internal candidate ») et Colette Kress ; un banquier juge Rene Haas (Arm) le plus « logique ». Selon des extraits de recherche non relus en entier : le Financial Times a rapporté une approche de Haas, et le 13/11 le conseil disait choisir encore un cabinet de recrutement et n'avoir approché personne formellement. Lisa Su est évoquée par certains médias seulement. Marchés publics : Haas 25,7 %, Buck 15,5 %, Huang « pas de changement » 11,6 %, Kress 8,1 %, Matt Murphy 7,5 %, Johny Srouji 5,9 %, Tim Cook 4,5 %, Lisa Su 2,5 % (https://polymarket.com/event/next-ceo-of-nvidia, interne). Annonce d'un PDG permanent avant le 1/2/2027 : 39 % ; avant le 1/5/2027 : 62 à 79 % (https://kalshi.com/markets/kxnvdaceodate, interne). D'où 22 % pour « Aucun ».",
 "origine": "actu",
 "verifs": [
  "https://nvidianews.nvidia.com/news/nvidia-announces-ceo-transition",
  "https://www.digitaltrends.com/computing/jensen-huang-steps-down-as-nvidia-chief-and-the-hunt-for-a-new-ceo-begins/",
  "https://gvwire.com/2026/11/12/who-would-be-next-ceo-at-nvidia-top-engineer-and-cfo-favored-as-candidates/",
  "https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000082/nvda-20261111.htm",
  "https://www.axios.com/2026/11/12/nvidia-next-ceo-jensen-huang-predictions"
 ],
 "options": [
  {
   "code": "haas",
   "noms": {"fr":"Rene Haas","en":"Rene Haas","he":"רנה האס"},
   "p0": 22,
   "image": {"fichier":"File:Rene Haas at SXSW 2025.jpg","genre":"photo"}
  },
  {"code":"buck","noms":{"fr":"Ian Buck","en":"Ian Buck","he":"איאן באק"},"p0":15,"image":null},
  {
   "code": "kress",
   "noms": {"fr":"Colette Kress","en":"Colette Kress","he":"קולט קרס"},
   "p0": 9,
   "image": {"fichier":"File:Colette Kress (1).png","genre":"photo"}
  },
  {
   "code": "huang",
   "noms": {"fr":"Jensen Huang (retour)","en":"Jensen Huang (return)","he":"ג'נסן הואנג (חזרה)"},
   "p0": 6,
   "image": {"fichier":"File:Jensen Huang Stanford 2026-04-30 010 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "su",
   "noms": {"fr":"Lisa Su","en":"Lisa Su","he":"ליסה סו"},
   "p0": 3,
   "image": {"fichier":"File:SXSW-2024-alih-OB7A0861-Lisa Su (cropped 2).jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":23,"image":null},
  {"code":"aucun","noms":{"fr":"Aucun avant le 30/06/2027","en":"None by June 30, 2027","he":"אף אחד עד 30.6.2027"},"p0":22,"image":null}
 ]
},
{
 "id": "tesla-spacex-accord-fusion",
 "nature": "binaire",
 "categorie": "tech",
 "textes": {
  "fr": {
   "q": "Tesla et SpaceX annonceront-elles un accord de fusion avant le 1er avril 2027 ?",
   "court": "Fusion Tesla–SpaceX",
   "critere": "OUI si, avant le 1er avril 2027 à 00:00 heure de New York, Tesla et/ou SpaceX annoncent officiellement (communiqué ou dépôt à la SEC, ex. 8-K) un accord définitif signé de fusion, ou d'acquisition totale de l'une par l'autre. Une lettre d'intention, une offre non engageante ou une simple « étude » ne comptent pas. Le vote des actionnaires n'est pas nécessaire pour OUI."
  },
  "en": {
   "q": "Will Tesla and SpaceX announce a merger agreement before April 1, 2027?",
   "court": "Tesla–SpaceX merger",
   "critere": "YES if, before April 1, 2027 at 00:00 New York time, Tesla and/or SpaceX officially announce (press release or SEC filing, e.g. 8-K) a signed definitive agreement for a merger, or for the full acquisition of one by the other. A letter of intent, a non-binding offer or a mere ‘study’ does not count. A shareholder vote is not required for YES."
  },
  "he": {
   "q": "האם טסלה ו-SpaceX יכריזו על הסכם מיזוג לפני 1 באפריל 2027?",
   "court": "מיזוג טסלה–SpaceX",
   "critere": "כן אם, לפני 1 באפריל 2027 בשעה 00:00 שעון ניו יורק, טסלה ו/או SpaceX מכריזות באופן רשמי (הודעה לעיתונות או דיווח ל-SEC, למשל 8-K) על הסכם סופי וחתום למיזוג, או לרכישה מלאה של אחת מהן על ידי האחרת. מכתב כוונות, הצעה לא מחייבת או «בחינה» בלבד אינם נחשבים. הצבעת בעלי המניות אינה נדרשת לתוצאה כן."
  }
 },
 "image": {"fichier":"File:Tesla T symbol.svg","genre":"logo"},
 "ferme_at": "2027-04-01T04:00:00Z",
 "resolution_at": "2027-04-01T12:00:00Z",
 "source": {"nom":"Tesla, relations investisseurs","url":"https://ir.tesla.com"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 55,
 "p0_justif": "le 20/10/2026, Elon Musk a annoncé que les conseils de Tesla et de SpaceX (cotée depuis son introduction en Bourse de 2026) avaient formé des comités spéciaux d'administrateurs indépendants pour étudier une fusion. Aucun accord sur les termes ; Musk se déporte. Côté Tesla, il faudrait l'accord de 50 % de tous les actionnaires. Marché public « fusion officiellement annoncée » : 16 % avant le 31/12/2026, 57 % avant le 28/02/2027, 70,5 % avant le 30/06/2027 (https://polymarket.com/event/tesla-and-spacex-merger-officially-announced-by-june-30, interne). J'abaisse un peu car j'exige un accord définitif signé.",
 "origine": "actu",
 "verifs": [
  "https://techcrunch.com/2026/10/20/spacex-and-tesla-boards-form-special-committees-to-review-merger/",
  "https://notateslaapp.com/news/4899/tesla-and-spacex-form-special-committees-to-discuss-potential-merger"
 ]
}
]$graine$::jsonb);

select wm.droits();
