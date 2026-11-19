-- Marchés réels, lot 8 (19 nov. 2026) : la graine du catalogue, partie 2 sur 6 — 10 fiches, de « cpi-usa-novembre-2026 » à « starship-vol-16-avant-2027 ».
-- Texte généré à partir des recherches et des traductions du 19 nov. 2026 (docs/DONNEES.md § 7) ; chaque fiche passe par
-- wm.fiche_creer, avec les mêmes contrôles qu'une fiche écrite par l'équipe. Sans effet sur le site en ligne : catalogue.serveur
-- est éteint, aucune ligne du moteur n'est créée avant la mise en ligne.
select wm.catalogue_semer($graine$[
{
 "id": "cpi-usa-novembre-2026",
 "nature": "binaire",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "L'inflation américaine sur un an (indice des prix de novembre 2026) dépassera-t-elle 3,7 % ?",
   "court": "IPC US nov. > 3,7 %",
   "critere": "OUI si la variation sur 12 mois de l'indice CPI-U « All items » (non corrigé des variations saisonnières) pour novembre 2026, telle que publiée par le BLS (arrondie à 0,1 point), est strictement supérieure à 3,7 % (donc 3,8 % ou plus) ; sinon NON. Publication prévue le jeudi 10/12/2026 à 08:30 heure de New York (13:30 UTC). En cas de report ou d'annulation : si la publication est retardée, la résolution attend la publication ; si le BLS ne publie pas le taux sur 12 mois, on le calcule à partir des indices (novembre 2026 / novembre 2025 − 1, arrondi à 0,1) ; sans publication de l'indice au 31/03/2027, annulation."
  },
  "en": {
   "q": "Will US annual inflation (CPI for November 2026) be above 3.7%?",
   "court": "US CPI Nov > 3.7%",
   "critere": "YES if the 12-month change in the CPI-U ‘All items’ index (not seasonally adjusted) for November 2026, as published by the BLS (rounded to 0.1 point), is strictly above 3.7% (i.e. 3.8% or more); otherwise NO. Release scheduled for Thursday, December 10, 2026 at 08:30 New York time (13:30 UTC). In case of postponement or cancellation: if the release is delayed, resolution waits for the release; if the BLS does not publish the 12-month rate, it is calculated from the index levels (November 2026 / November 2025 − 1, rounded to 0.1); if the index has not been published by March 31, 2027, cancellation."
  },
  "he": {
   "q": "האם האינפלציה השנתית בארה״ב (מדד המחירים לצרכן לנובמבר 2026) תהיה גבוהה מ-3.7%?",
   "court": "אינפלציה בארה״ב מעל 3.7%",
   "critere": "כן אם השינוי ב-12 החודשים של מדד CPI-U «All items» (לא מנוכה עונתיות) לחודש נובמבר 2026, כפי שמפרסמת ה-BLS (מעוגל ל-0.1 נקודה), גבוה ממש מ-3.7% (כלומר 3.8% או יותר); אחרת לא. הפרסום צפוי ביום חמישי, 10 בדצמבר 2026 בשעה 08:30 שעון ניו יורק (13:30 UTC). במקרה של דחייה או ביטול: אם הפרסום מתעכב, ההכרעה ממתינה לפרסום; אם ה-BLS אינה מפרסמת את השיעור ל-12 חודשים, הוא מחושב מתוך רמות המדד (נובמבר 2026 / נובמבר 2025 − 1, מעוגל ל-0.1); אם המדד לא פורסם עד 31 במרץ 2027, ביטול."
  }
 },
 "image": {"fichier":"File:Bureau of Labor Statistics logo.svg","genre":"logo"},
 "ferme_at": "2026-12-10T12:30:00Z",
 "resolution_at": "2026-12-10T13:45:00Z",
 "source": {"nom":"Bureau of Labor Statistics (CPI)","url":"https://www.bls.gov/news.release/cpi.nr0.htm"},
 "regle": {"type":"manuel","seuil":3.7,"unite":"%"},
 "lien": null,
 "p0": 38,
 "p0_justif": "indices BLS non corrigés : novembre 2025 = 324,122 ; octobre 2026 = 337,511 (soit +4,13 % si l'indice de novembre restait stable). Le BLS n'a pas publié de taux sur 12 mois pour octobre (pas de collecte en octobre 2025) ; septembre 2026 = 3,74 % (calculé), août 3,40 %. De 2022 à 2024, l'indice brut de novembre a baissé de 0,10 %, 0,20 % et 0,05 % sur octobre, soit environ 0,35 point de moins que l'indice corrigé des variations saisonnières (+0,26 %, +0,15 %, +0,28 %) ; les marchés publics attendent une variation mensuelle corrigée d'environ −0,1 % (pétrole Brent −20 % sur 20 jours) → indice brut ≈ −0,45 % → glissement ≈ 337,511 × 0,9955 / 324,122 − 1 = 3,66 %, publié 3,7 % ; avec une variation corrigée de 0,0 % on obtiendrait 3,8 %. Marchés publics (interne) : « > 3,7 % » ≈ 38 %, « > 3,6 % » ≈ 80 %, « > 3,8 % » ≈ 12,5 %. Retenu 38 %.",
 "origine": "modele",
 "modele_id": "cpi-usa",
 "periode": "2026-11",
 "verifs": [
  "https://www.bls.gov/schedule/news_release/cpi.htm",
  "https://www.bls.gov/news.release/cpi.nr0.htm",
  "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",
  "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0L1E",
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXCPIYOY&status=open&limit=100",
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXCPI&status=open&limit=100"
 ]
},
{
 "id": "eurusd-fin-decembre-2026",
 "nature": "binaire",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "L'euro vaudra-t-il plus de 1,10 $ le 31 décembre 2026 (cours de référence de la BCE) ?",
   "court": "EUR/USD > 1,10 au 31/12",
   "critere": "OUI si le cours de référence euro/dollar publié par la BCE pour le jeudi 31/12/2026 est strictement supérieur à 1,1000 ; sinon NON. En cas de report ou d'annulation : si la BCE ne publie pas de cours le 31/12 (jour sans cotation), on prend le dernier cours publié avant le 31/12. (La BCE en a publié un le 31/12/2025 : 1,1750.)"
  },
  "en": {
   "q": "Will the euro be worth more than $1.10 on December 31, 2026 (ECB reference rate)?",
   "court": "EUR/USD > 1.10 Dec 31",
   "critere": "YES if the euro/dollar reference rate published by the ECB for Thursday, December 31, 2026 is strictly above 1.1000; otherwise NO. In case of postponement or cancellation: if the ECB does not publish a rate on December 31 (a day without a quotation), the last rate published before December 31 is used. (The ECB did publish one on December 31, 2025: 1.1750.)"
  },
  "he": {
   "q": "האם שער האירו יהיה גבוה מ-1.10 דולר ב-31 בדצמבר 2026 (שער הייחוס של ה-ECB)?",
   "court": "אירו מעל 1.10$ ב-31.12",
   "critere": "כן אם שער הייחוס אירו/דולר שמפרסם הבנק המרכזי האירופי (ECB) ליום חמישי, 31 בדצמבר 2026 גבוה ממש מ-1.1000; אחרת לא. במקרה של דחייה או ביטול: אם ה-ECB אינו מפרסם שער ב-31 בדצמבר (יום שבו לא נקבע שער), נלקח השער האחרון שפורסם לפני 31 בדצמבר. (ה-ECB פרסם שער כזה ב-31 בדצמבר 2025: 1.1750.)"
  }
 },
 "image": {"fichier":"File:Euro symbol.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2026-12-31T16:00:00Z",
 "source": {
  "nom": "BCE, cours de référence euro/dollar",
  "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html"
 },
 "regle": {"type":"reference_bce","actif":"eurusd","op":">","seuil":1.1,"jour":"2026-12-31","marge":0.0005},
 "lien": {"actif":"eurusd"},
 "p0": 49,
 "p0_justif": "1,0998 en séance (19/11 13:40 UTC) ; cours de référence BCE du 18/11 : 1,0968 ; seuil 1,10 ; σ = 5,5 % (réalisée 5,2 % sur 30 j, 5,0 % sur 90 j) ; T = 29,5 jours ouvrés / 252 ; σ√T = 0,0188 ; d2 = (ln(1,0998/1,10) − 0,0002) / 0,0188 = −0,019 → 49,2 %. Retenu 49 %.",
 "origine": "modele",
 "modele_id": "eurusd-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,JPY,CHF",
  "https://api.frankfurter.dev/v1/2026-05-01..2026-11-19?base=EUR&symbols=USD",
  "https://api.frankfurter.dev/v1/2025-12-22..2026-01-05?base=EUR&symbols=USD",
  "https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?range=1y&interval=1d"
 ]
},
{
 "id": "or-fin-decembre-2026",
 "nature": "binaire",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "L'or sera-t-il au-dessus de 3 700 $ l'once le 31 décembre 2026 ?",
   "court": "Or > 3 700 $ au 31/12",
   "critere": "OUI si le « LBMA Gold Price PM » en dollars du jeudi 31/12/2026 est strictement supérieur à 3 700,00 $ ; sinon NON. En cas de report ou d'annulation : si aucun prix PM n'est publié ce jour-là, on prend le dernier LBMA Gold Price publié ce jour-là (AM), sinon le dernier publié avant le 31/12."
  },
  "en": {
   "q": "Will gold be above $3,700 an ounce on December 31, 2026?",
   "court": "Gold > $3,700 Dec 31",
   "critere": "YES if the US dollar ‘LBMA Gold Price PM’ for Thursday, December 31, 2026 is strictly above $3,700.00; otherwise NO. In case of postponement or cancellation: if no PM price is published that day, the last LBMA Gold Price published that day (AM) is used, otherwise the last one published before December 31."
  },
  "he": {
   "q": "האם מחיר הזהב יהיה מעל 3,700 דולר לאונקיה ב-31 בדצמבר 2026?",
   "court": "זהב מעל 3,700$ ב-31.12",
   "critere": "כן אם מחיר «LBMA Gold Price PM» בדולרים ליום חמישי, 31 בדצמבר 2026 גבוה ממש מ-3,700.00 דולר; אחרת לא. במקרה של דחייה או ביטול: אם לא מתפרסם מחיר PM באותו יום, נלקח ה-LBMA Gold Price האחרון שפורסם באותו יום (AM), ואם אין כזה, האחרון שפורסם לפני 31 בדצמבר."
  }
 },
 "image": {"fichier":"File:Gold bullion bars.jpg","genre":"photo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-01T12:00:00Z",
 "source": {"nom":"LBMA Gold Price PM","url":"https://www.lbma.org.uk/prices-and-data/precious-metal-prices"},
 "regle": {"type":"manuel","indicatif":{"actif":"xau","op":">","seuil":3700,"au":"2026-12-31T15:00:00Z"}},
 "lien": {"actif":"xau"},
 "p0": 50,
 "p0_justif": "contrat COMEX décembre 2026 : 3 727,8 $ ; contrat février 2027 : 3 758,1 $ (19/11 13:33 UTC). Le comptant est en général un peu sous le contrat le plus proche (≈ 0,4 %/mois) → ≈ 3 710 $ (estimation, comptant non vérifié directement). Seuil 3 700 $ ; σ = 24 % (réalisée 23,9 % sur 30 j, 22,3 % sur 90 j) ; σ√T = 0,081 ; d2 = (ln(3710/3700) − 0,0033) / 0,081 = −0,007 → ≈ 50 %. Contexte : la presse signalait le 16/11 un plus bas d'un an (3 830,74 $, −31,5 % depuis le record de janvier) ; le contrat le plus proche est descendu plus bas encore le 19/11 (plus bas de séance 3 694,50 $). Retenu 50 %.",
 "origine": "modele",
 "modele_id": "or-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1y&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/GCZ26.CMX?range=5d&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/GCG27.CMX?range=5d&interval=1d",
  "https://prices.lbma.org.uk/json/gold_pm.json",
  "https://www.nationthailand.com/business/trading-investment/40073583"
 ]
},
{
 "id": "presidentielle-france-2027",
 "nature": "options",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Qui remportera l'élection présidentielle française de 2027 ?",
   "court": "Présidentielle FR 2027",
   "critere": "gagne l'option du candidat proclamé élu président de la République par le Conseil constitutionnel à l'issue de cette élection (1er tour 18 avril 2027, 2nd tour 2 mai 2027). Un candidat non listé qui gagne = « Autre ». Si l'élection est anticipée avant avril 2027, le marché porte sur cette élection anticipée. En cas de report ou d'annulation : en cas de report (article 7 de la Constitution, ex. décès d'un candidat), le marché reste ouvert et la clôture est déplacée à la veille du nouveau 1er tour. Aucun président proclamé au 31/12/2027 = marché annulé et remboursé."
  },
  "en": {
   "q": "Who will win the 2027 French presidential election?",
   "court": "France 2027 president",
   "critere": "the winning option is that of the candidate proclaimed elected President of the Republic by the Constitutional Council at the end of this election (1st round April 18, 2027, 2nd round May 2, 2027). An unlisted candidate who wins = ‘Other’. If the election is brought forward to before April 2027, the market covers that early election. In case of postponement or cancellation: in the event of a postponement (Article 7 of the Constitution, e.g. death of a candidate), the market stays open and the close is moved to the day before the new 1st round. No president proclaimed by December 31, 2027 = market cancelled and refunded."
  },
  "he": {
   "q": "מי ינצח בבחירות לנשיאות צרפת ב-2027?",
   "court": "נשיאות צרפת 2027",
   "critere": "זוכה האופציה של המועמד שהמועצה החוקתית הכריזה עליו כנשיא הרפובליקה הנבחר בתום הבחירות הללו (סיבוב ראשון ב-18 באפריל 2027, סיבוב שני ב-2 במאי 2027). מועמד שאינו ברשימה וזוכה = «אחר». אם הבחירות מוקדמות לפני אפריל 2027, השוק מתייחס לבחירות המוקדמות הללו. במקרה של דחייה או ביטול: במקרה של דחייה (סעיף 7 לחוקה, למשל מות מועמד), השוק נשאר פתוח ומועד הסגירה נדחה ליום שלפני הסיבוב הראשון החדש. לא הוכרז נשיא עד 31 בדצמבר 2027 = השוק מבוטל והכסף מוחזר."
  }
 },
 "image": null,
 "ferme_at": "2027-04-17T00:00:00Z",
 "resolution_at": "2027-05-02T20:00:00Z",
 "source": {"nom":"Conseil constitutionnel","url":"https://www.conseil-constitutionnel.fr"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "marché public « Next French Presidential Election » ce jour : Le Pen 45,7 %, Lisnard 19,6 %, Mélenchon 14,5 %, Philippe 5,5 %, Lagarde 4,4 %, Hollande 3,2 %, Bardella 1,7 %, Glucksmann 1,5 % (https://polymarket.com/event/next-french-presidential-election, interne). Sondages 1er tour de novembre 2026 (YouGov 12–17/11, Ifop 13–16/11, Elabe 12–13/11, OpinionWay, Cluster17) : Le Pen 27–34 %, Mélenchon 16–19 %, Philippe 8–15 %, Glucksmann 8–13,5 %, Lisnard 8–10 %, Retailleau 4–6 %, Attal 2–5 %. Second tour Harris Interactive (3–5/11/2026) : Le Pen 58 – Philippe 42 ; 60 – Glucksmann 40 ; 68 – Mélenchon 32. Le Pen est éligible depuis l'arrêt d'appel du 7 juillet 2026 (15 mois d'inéligibilité ferme déjà purgés) mais un pourvoi en cassation est pendant (LCP, 10/11/2026) : d'où Bardella en solution de repli. J'ai réduit Lisnard (14 %) par rapport au marché public car ses sondages sont au niveau de Philippe.",
 "origine": "modele",
 "modele_id": "presidentielle-fr",
 "periode": "2027",
 "verifs": [
  "https://lcp.fr/actualites/presidentielle-2027-la-liste-des-candidats-declares-et-potentiels-444932",
  "https://www.publicsenat.fr/actualites/politique/la-prochaine-election-presidentielle-aura-lieu-les-18-avril-et-2-mai-2027",
  "https://www.info.gouv.fr/index.php/actualite/presidentielle-2027-date-a-retenir-et-informations-cles",
  "https://en.wikipedia.org/wiki/Opinion_polling_for_the_2027_French_presidential_election",
  "https://lcp.fr/actualites/marine-le-pen-condamnee-par-la-justice-mais-eligible-comment-la-cour-d-appel-de-paris-a",
  "https://kalshi.com/markets/kxfrpresadvance"
 ],
 "options": [
  {
   "code": "lepen",
   "noms": {"fr":"Marine Le Pen","en":"Marine Le Pen","he":"מרין לה פן"},
   "p0": 45,
   "image": {"fichier":"File:Marine Le Pen 2025 (3x4 cropped).jpg","genre":"photo"}
  },
  {
   "code": "lisnard",
   "noms": {"fr":"David Lisnard","en":"David Lisnard","he":"דוד ליסנאר"},
   "p0": 14,
   "image": {"fichier":"File:David Lisnard en 2026.jpg","genre":"photo"}
  },
  {
   "code": "melenchon",
   "noms": {"fr":"Jean-Luc Mélenchon","en":"Jean-Luc Mélenchon","he":"ז'אן-לוק מלנשון"},
   "p0": 12,
   "image": {"fichier":"File:Jean Luc Mélenchon en mai 2026- 55261894422 (cropped).jpg","genre":"photo"}
  },
  {
   "code": "philippe",
   "noms": {"fr":"Édouard Philippe","en":"Édouard Philippe","he":"אדואר פיליפ"},
   "p0": 9,
   "image": {"fichier":"File:Edouard Philippe 3x4 crop.jpg","genre":"photo"}
  },
  {
   "code": "glucksman",
   "noms": {"fr":"Raphaël Glucksmann","en":"Raphaël Glucksmann","he":"רפאל גלוקסמן"},
   "p0": 5,
   "image": {"fichier":"File:1720448398743 20240708 GLUCKSMANN Raphael FR 006.jpg","genre":"photo"}
  },
  {
   "code": "bardella",
   "noms": {"fr":"Jordan Bardella","en":"Jordan Bardella","he":"ז'ורדן ברדלה"},
   "p0": 3,
   "image": {"fichier":"File:MEP Jordan Bardella.jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":12,"image":null}
 ]
},
{
 "id": "presidentielle-usa-2028",
 "nature": "options",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Qui remportera l'élection présidentielle américaine de 2028 ?",
   "court": "Présidentielle US 2028",
   "critere": "gagne la personne qui obtient la majorité des voix du collège électoral, telle que certifiée par le Congrès. Résolution anticipée possible quand l'issue n'est plus contestable (tous les grands réseaux ont annoncé le vainqueur, aucun recours capable d'inverser le résultat). Si un litige dure, gagne la personne investie le 20 janvier 2029. Personne non listée = « Autre ». En cas de report ou d'annulation : date fixée par la loi fédérale ; si le scrutin n'a pas lieu en 2028, marché annulé et remboursé."
  },
  "en": {
   "q": "Who will win the 2028 US presidential election?",
   "court": "US president 2028",
   "critere": "the winner is the person who obtains a majority of Electoral College votes, as certified by Congress. Early resolution is possible once the outcome is no longer contestable (all major networks have called the winner, no appeal capable of reversing the result). If a dispute drags on, the winner is the person inaugurated on January 20, 2029. Unlisted person = ‘Other’. In case of postponement or cancellation: the date is set by federal law; if the vote does not take place in 2028, market cancelled and refunded."
  },
  "he": {
   "q": "מי ינצח בבחירות לנשיאות ארצות הברית ב-2028?",
   "court": "נשיאות ארה״ב 2028",
   "critere": "זוכה האדם שמקבל את רוב קולות חבר האלקטורים, כפי שמאשר הקונגרס. הכרעה מוקדמת אפשרית כאשר התוצאה כבר אינה ניתנת לערעור (כל הרשתות הגדולות הכריזו על המנצח, ואין ערעור שעשוי להפוך את התוצאה). אם מחלוקת נמשכת, זוכה האדם שמושבע לתפקיד ב-20 בינואר 2029. אדם שאינו ברשימה = «אחר». במקרה של דחייה או ביטול: המועד נקבע בחוק הפדרלי; אם הבחירות אינן מתקיימות ב-2028, השוק מבוטל והכסף מוחזר."
  }
 },
 "image": null,
 "ferme_at": "2028-11-07T04:00:00Z",
 "resolution_at": "2028-11-08T12:00:00Z",
 "source": {"nom":"Archives nationales des États-Unis (collège électoral)","url":"https://www.archives.gov/electoral-college"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "marché public « Presidential Election Winner 2028 » ce jour : Ossoff 17,1 %, Vance 15,5 %, Ocasio-Cortez 9,4 %, Rubio 8,8 %, Newsom 7,2 %, DeSantis 6,5 %, Harris 3,1 %, Buttigieg 2,9 % (https://polymarket.com/event/presidential-election-winner-2028, interne). Aucun candidat majeur déclaré après les midterms du 3/11/2026 ; Vance a dit qu'il déciderait après les midterms ; Ossoff répète ne pas vouloir se présenter. « Autre » fort (38 %) car le champ est très ouvert à deux ans du scrutin.",
 "origine": "modele",
 "modele_id": "presidentielle-us",
 "periode": "2028",
 "verifs": [
  "https://www.fox19.com/2026/11/05/2028-white-house-talk-begins-after-historic-midterm-election-day/",
  "https://www.newsweek.com/jd-vance-chances-against-ossoff-buttigieg-and-aoc-latest-2028-polls-12468482"
 ],
 "options": [
  {
   "code": "vance",
   "noms": {"fr":"JD Vance","en":"JD Vance","he":"ג'יי די ואנס"},
   "p0": 16,
   "image": {"fichier":"File:March 2026 Official Vice Presidential Portrait of JD Vance (medium crop) (2).jpg","genre":"photo"}
  },
  {
   "code": "ossoff",
   "noms": {"fr":"Jon Ossoff","en":"Jon Ossoff","he":"ג'ון אוסוף"},
   "p0": 15,
   "image": {"fichier":"File:Jon Ossoff Senate Portrait 2021.jpg","genre":"photo"}
  },
  {
   "code": "aoc",
   "noms": {"fr":"Alexandria Ocasio-Cortez","en":"Alexandria Ocasio-Cortez","he":"אלכסנדריה אוקסיו-קורטז"},
   "p0": 9,
   "image": {"fichier":"File:Alexandria Ocasio-Cortez Official Portrait.jpg","genre":"photo"}
  },
  {
   "code": "rubio",
   "noms": {"fr":"Marco Rubio","en":"Marco Rubio","he":"מרקו רוביו"},
   "p0": 9,
   "image": {"fichier":"File:Official portrait of Secretary Marco Rubio (cropped)(2).jpg","genre":"photo"}
  },
  {
   "code": "newsom",
   "noms": {"fr":"Gavin Newsom","en":"Gavin Newsom","he":"גאווין ניוסום"},
   "p0": 7,
   "image": {"fichier":"File:Governor of California Gavin Newsom (cropped 3x4).jpg","genre":"photo"}
  },
  {
   "code": "desantis",
   "noms": {"fr":"Ron DeSantis","en":"Ron DeSantis","he":"רון דסנטיס"},
   "p0": 6,
   "image": {"fichier":"File:Ron DeSantis official photo.jpg","genre":"photo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":38,"image":null}
 ]
},
{
 "id": "approbation-trump-31-12-2026",
 "nature": "binaire",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "La cote d'approbation de Trump sera-t-elle d'au moins 38 % chez Silver Bulletin le 31 décembre 2026 ?",
   "court": "Trump ≥ 38 % au 31/12",
   "critere": "OUI si le taux d'approbation de Donald Trump affiché par la moyenne Silver Bulletin (natesilver.net) pour le 31 décembre 2026 est supérieur ou égal à 38,0 %. Sans mise à jour ce jour-là, on prend la dernière valeur publiée avant le 1er janvier 2027 00:00 heure de New York. Si une valeur décimale est affichée, on l'utilise ; si la page publique n'affiche qu'un entier (« X percent »), on utilise cet entier. En cas de report ou d'annulation : si le suivi Silver Bulletin disparaît, on utilise la moyenne RealClearPolling du 31/12/2026 ; si aucune des deux n'existe, marché annulé et remboursé."
  },
  "en": {
   "q": "Will Trump's approval rating be at least 38% on Silver Bulletin on December 31, 2026?",
   "court": "Trump approval ≥38%",
   "critere": "YES if Donald Trump’s approval rating shown by the Silver Bulletin average (natesilver.net) for December 31, 2026 is greater than or equal to 38.0%. If there is no update that day, the last value published before January 1, 2027 00:00 New York time is used. If a decimal value is displayed, it is used; if the public page only displays a whole number (‘X percent’), that whole number is used. In case of postponement or cancellation: if the Silver Bulletin tracker disappears, the RealClearPolling average for December 31, 2026 is used; if neither exists, market cancelled and refunded."
  },
  "he": {
   "q": "האם שיעור התמיכה בטראמפ יעמוד על 38% לפחות במדד Silver Bulletin ב-31 בדצמבר 2026?",
   "court": "טראמפ: תמיכה 38%+",
   "critere": "כן אם שיעור התמיכה בדונלד טראמפ המוצג בממוצע של Silver Bulletin (natesilver.net) ל-31 בדצמבר 2026 גבוה מ-38.0% או שווה לו. אם אין עדכון באותו יום, נלקח הערך האחרון שפורסם לפני 1 בינואר 2027 בשעה 00:00 שעון ניו יורק. אם מוצג ערך עשרוני, משתמשים בו; אם הדף הציבורי מציג רק מספר שלם («X percent»), משתמשים במספר השלם הזה. במקרה של דחייה או ביטול: אם המעקב של Silver Bulletin נעלם, משתמשים בממוצע של RealClearPolling ל-31 בדצמבר 2026; אם אף אחד מהשניים אינו קיים, השוק מבוטל והכסף מוחזר."
  }
 },
 "image": {"fichier":"File:Official Presidential Portrait of President Donald J. Trump (2025).jpg","genre":"photo"},
 "ferme_at": "2026-12-31T05:00:00Z",
 "resolution_at": "2027-01-01T12:00:00Z",
 "source": {"nom":"Silver Bulletin (moyenne de Nate Silver)","url":"https://www.natesilver.net/p/trump-approval-ratings-nate-silver-bulletin"},
 "regle": {"type":"manuel","seuil":38,"unite":"%"},
 "lien": null,
 "p0": 30,
 "p0_justif": "la page publique indique 37 % d'approbation et 60 % de désapprobation au 18 novembre 2026. La presse cite 37,6 % au 12 novembre et un sursaut à 38,4 % début novembre après un plus bas à 36,3 %. Un marché public sur un autre agrégat (moyenne VoteHub au-dessus de 38,5 % le 20/11) cote 1 % (https://kalshi.com/markets/kxtrumpvh, interne). Il faudrait donc un net rebond en six semaines.",
 "origine": "modele",
 "modele_id": "trump-approbation",
 "periode": "2026-12",
 "verifs": [
  "https://www.natesilver.net/p/trump-approval-ratings-nate-silver-bulletin",
  "https://newsweek.com/donald-trump-approval-rating-falling-midterm-losses-12709719"
 ]
},
{
 "id": "lecornu-premier-ministre-31-03-2027",
 "nature": "binaire",
 "categorie": "politique",
 "textes": {
  "fr": {
   "q": "Sébastien Lecornu sera-t-il encore Premier ministre le 31 mars 2027 ?",
   "court": "Lecornu PM au 31 mars",
   "critere": "OUI si, le 31 mars 2027 à 23:59 heure de Paris, Sébastien Lecornu exerce la fonction de Premier ministre, y compris s'il a démissionné et expédie les affaires courantes tant qu'aucun successeur n'a été nommé par décret publié au Journal officiel. NON si un décret nommant une autre personne Premier ministre est publié avant cette heure. Une démission suivie d'une renomination de Lecornu = OUI."
  },
  "en": {
   "q": "Will Sébastien Lecornu still be Prime Minister of France on March 31, 2027?",
   "court": "Lecornu PM on Mar 31",
   "critere": "YES if, on March 31, 2027 at 23:59 Paris time, Sébastien Lecornu holds the office of Prime Minister, including if he has resigned and is acting as caretaker (handling current affairs) as long as no successor has been appointed by a decree published in the Journal officiel. NO if a decree appointing another person as Prime Minister is published before that time. A resignation followed by Lecornu’s reappointment = YES."
  },
  "he": {
   "q": "האם סבסטיאן לקורנו עדיין יכהן כראש ממשלת צרפת ב-31 במרץ 2027?",
   "court": "לקורנו רה״מ ב-31.3",
   "critere": "כן אם ב-31 במרץ 2027 בשעה 23:59 שעון פריז, סבסטיאן לקורנו מכהן כראש הממשלה, לרבות אם התפטר והוא ממשיך לנהל את העניינים השוטפים (ממשלת מעבר) כל עוד לא מונה מחליף בצו שפורסם ב-Journal officiel (העיתון הרשמי). לא אם צו הממנה אדם אחר לראש הממשלה מתפרסם לפני שעה זו. התפטרות שאחריה לקורנו ממונה מחדש = כן."
  }
 },
 "image": {"fichier":"File:Portrait officiel de Sébastien Lecornu - Ministre des Armées (cropped).jpg","genre":"photo"},
 "ferme_at": "2027-03-31T21:59:59Z",
 "resolution_at": "2027-04-01T08:00:00Z",
 "source": {"nom":"Légifrance (Journal officiel)","url":"https://www.legifrance.gouv.fr"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 70,
 "p0_justif": "le 4 novembre 2026, l'Assemblée a rejeté à l'unanimité (458 voix contre 0) la partie recettes du budget 2027. Le texte passe au Sénat. Le gouvernement pourrait utiliser le 49.3, ce qui l'exposerait à une censure, ou adopter le budget par ordonnances après le délai de 70 jours (« 17 décembre à minuit » selon LCP). Marchés publics ce jour : « motion de censure adoptée en France avant 2027 » ≈ 22 % (achat 18 / vente 25) et « 49.3 sur le budget 2027 avant le 1er janvier » 58 % (https://kalshi.com/markets/kxvoncfr et https://kalshi.com/markets/kxfrance493, interne). J'ajoute environ 8 % de risque au 1er trimestre 2027. Précédent : il a survécu à toutes les censures de l'hiver 2025-2026.",
 "origine": "modele",
 "modele_id": "pm-france",
 "periode": "2027-03",
 "verifs": [
  "https://en.wikipedia.org/wiki/Sébastien_Lecornu",
  "https://lcp.fr/actualites/budget-2027-l-assemblee-rejette-a-l-unanimite-la-partie-recettes-le-projet-de-loi-de"
 ]
},
{
 "id": "ia-arena-texte-31-12-2026",
 "nature": "options",
 "categorie": "tech",
 "textes": {
  "fr": {
   "q": "Quelle entreprise aura le modèle n°1 du classement texte d'Arena le 31 décembre 2026 ?",
   "court": "IA n°1 sur Arena 31/12",
   "critere": "gagne l'entreprise qui développe le modèle classé 1er sur https://arena.ai/leaderboard/text (ex-LMArena), vue par défaut sans changer aucun filtre, relevée le 31/12/2026 à 17:00 UTC avec capture d'écran. En cas d'égalité de rang, on départage au score affiché le plus élevé ; si l'égalité persiste, par ordre alphabétique du nom d'entreprise. Les modèles Grok comptent pour « SpaceX (Grok, ex-xAI) ». Si le site est indisponible, on fait le premier relevé réussi dans les 24 h. En cas de report ou d'annulation : classement supprimé = marché annulé et remboursé."
  },
  "en": {
   "q": "Which company will have the #1 model on the Arena text leaderboard on December 31, 2026?",
   "court": "Top AI on Arena Dec 31",
   "critere": "the winner is the company that develops the model ranked 1st on https://arena.ai/leaderboard/text (formerly LMArena), default view without changing any filter, recorded on December 31, 2026 at 17:00 UTC with a screenshot. In the event of a tie in rank, the tie is broken by the highest displayed score; if the tie persists, by alphabetical order of company name. Grok models count for ‘SpaceX (Grok, ex-xAI)’. If the site is unavailable, the first successful reading within 24 hours is used. In case of postponement or cancellation: leaderboard removed = market cancelled and refunded."
  },
  "he": {
   "q": "לאיזו חברה יהיה המודל המדורג ראשון בטבלת הטקסט של Arena ב-31 בדצמבר 2026?",
   "court": "מודל ה-AI המוביל",
   "critere": "זוכה החברה שמפתחת את המודל המדורג במקום הראשון באתר https://arena.ai/leaderboard/text (לשעבר LMArena), בתצוגת ברירת המחדל וללא שינוי של אף מסנן; הבדיקה נעשית ב-31 בדצמבר 2026 בשעה 17:00 UTC ומתועדת בצילום מסך. במקרה של שוויון בדירוג, ההכרעה היא לפי הציון המוצג הגבוה ביותר; אם השוויון נמשך, לפי סדר אלפביתי של שם החברה. מודלי Grok נחשבים ל«SpaceX (Grok, לשעבר xAI)». אם האתר אינו זמין, נלקחת הבדיקה המוצלחת הראשונה בתוך 24 שעות. במקרה של דחייה או ביטול: הדירוג הוסר = השוק מבוטל והכסף מוחזר."
  }
 },
 "image": null,
 "ferme_at": "2026-12-31T16:00:00Z",
 "resolution_at": "2026-12-31T17:30:00Z",
 "source": {"nom":"Arena, classement texte","url":"https://arena.ai/leaderboard/text"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "classement lu aujourd'hui (daté du 18 novembre 2026) : 1. Gemini 4 Carbon (High) 1 526 ; 2. Gemini 4 Argon (High) 1 521 ; 3. Gemini 4 Neon (High) 1 518 ; 4. Muse Wonder (Max), Meta, 1 511 ; 5. Claude Opus 5.5 (High), Anthropic, 1 507. Les trois premiers modèles sont des Gemini de Google. Marché public « meilleur modèle fin 2026 » : Google 83 %, Anthropic 11 %, OpenAI 2,8 %, Meta 0,8 % (https://polymarket.com/event/which-company-has-best-ai-model-end-of-2026, interne). xAI appartient à SpaceX depuis le 2/2/2026 (renommée SpaceXAI puis « SpaceX Super Intelligence »). Note de neutralité : je suis un modèle d'Anthropic ; les probabilités suivent les données publiques.",
 "origine": "modele",
 "modele_id": "ia-arena-mensuel",
 "periode": "2026-12",
 "verifs": ["https://arena.ai/leaderboard/text","https://lmarena.ai/leaderboard/text","https://en.wikipedia.org/wiki/SpaceXAI"],
 "options": [
  {
   "code": "google",
   "noms": {"fr":"Google (Gemini)","en":"Google (Gemini)","he":"גוגל (Gemini)"},
   "p0": 80,
   "image": {"fichier":"File:Google 2015 logo.svg","genre":"logo"}
  },
  {
   "code": "anthropic",
   "noms": {"fr":"Anthropic (Claude)","en":"Anthropic (Claude)","he":"Anthropic (Claude)"},
   "p0": 11,
   "image": {"fichier":"File:Anthropic logo.svg","genre":"logo"}
  },
  {
   "code": "meta",
   "noms": {"fr":"Meta (Muse)","en":"Meta (Muse)","he":"מטא (Muse)"},
   "p0": 4,
   "image": {"fichier":"File:Meta Platforms Inc. logo.svg","genre":"logo"}
  },
  {
   "code": "openai",
   "noms": {"fr":"OpenAI (GPT)","en":"OpenAI (GPT)","he":"OpenAI (GPT)"},
   "p0": 3,
   "image": {"fichier":"File:OpenAI logo 2025 (symbol).svg","genre":"logo"}
  },
  {
   "code": "spacex",
   "noms": {"fr":"SpaceX (Grok)","en":"SpaceX (Grok)","he":"SpaceX (Grok)"},
   "p0": 1,
   "image": {"fichier":"File:SpaceX logo black.svg","genre":"logo"}
  },
  {"code":"autre","noms":{"fr":"Autre","en":"Other","he":"אחר"},"p0":1,"image":null}
 ]
},
{
 "id": "cap-2e-place-fin-2026",
 "nature": "options",
 "categorie": "tech",
 "textes": {
  "fr": {
   "q": "Quelle entreprise sera la 2e capitalisation boursière mondiale le 31 décembre 2026 ?",
   "court": "2e capitalisation 31/12",
   "critere": "gagne l'entreprise classée 2e mondiale par capitalisation boursière à la clôture du 31 décembre 2026, d'après le classement de companiesmarketcap.com relevé après la clôture américaine (après 21:00 UTC). En cas de doute, on recalcule avec le cours de clôture multiplié par le nombre d'actions publié dans les documents officiels. En cas de report ou d'annulation : marchés fermés ce jour-là = dernière clôture disponible."
  },
  "en": {
   "q": "Which company will be the world's second-largest by market cap on December 31, 2026?",
   "court": "#2 market cap Dec 31",
   "critere": "the winner is the company ranked 2nd worldwide by market capitalization at the close of December 31, 2026, according to the companiesmarketcap.com ranking recorded after the US close (after 21:00 UTC). In case of doubt, it is recalculated using the closing price multiplied by the number of shares published in official documents. In case of postponement or cancellation: markets closed that day = last available close."
  },
  "he": {
   "q": "איזו חברה תהיה השנייה בשווי השוק בעולם ב-31 בדצמבר 2026?",
   "court": "מקום 2 בשווי שוק",
   "critere": "זוכה החברה המדורגת במקום השני בעולם לפי שווי שוק בסגירת המסחר של 31 בדצמבר 2026, על פי הדירוג של companiesmarketcap.com כפי שנבדק לאחר סגירת המסחר בארה״ב (אחרי 21:00 UTC). במקרה של ספק, מחשבים מחדש לפי מחיר הסגירה כפול מספר המניות שפורסם במסמכים הרשמיים. במקרה של דחייה או ביטול: השווקים סגורים באותו יום = הסגירה האחרונה הזמינה."
  }
 },
 "image": null,
 "ferme_at": "2026-12-31T14:30:00Z",
 "resolution_at": "2027-01-01T12:00:00Z",
 "source": {"nom":"companiesmarketcap.com","url":"https://companiesmarketcap.com/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "classement du jour : Apple 5,121 T$, Microsoft 3,774 T$, NVIDIA 3,645 T$, Alphabet 3,432 T$, Amazon 2,895 T$, SpaceX 1,948 T$ (cotée), TSMC 1,880 T$. Apple est très loin devant, d'où cette question sur la 2e place, plus disputée. NVIDIA (en recul après la démission de son PDG le 12/11, selon la presse) n'est qu'à 3,5 % de Microsoft. Pour la 1re place, le marché public donne Apple à 90,8 % (https://polymarket.com/event/largest-company-end-of-december-2026, interne).",
 "origine": "modele",
 "modele_id": "cap2-mensuel",
 "periode": "2026-12",
 "verifs": ["https://companiesmarketcap.com/"],
 "options": [
  {
   "code": "msft",
   "noms": {"fr":"Microsoft","en":"Microsoft","he":"מיקרוסופט"},
   "p0": 42,
   "image": {"fichier":"File:Microsoft logo (2012).svg","genre":"logo"}
  },
  {"code":"nvda","noms":{"fr":"Nvidia","en":"Nvidia","he":"אנבידיה"},"p0":32,"image":{"fichier":"File:Nvidia logo.svg","genre":"logo"}},
  {
   "code": "googl",
   "noms": {"fr":"Alphabet (Google)","en":"Alphabet (Google)","he":"אלפבית (גוגל)"},
   "p0": 21,
   "image": {"fichier":"File:Alphabet Inc Logo 2015.svg","genre":"logo"}
  },
  {"code":"amzn","noms":{"fr":"Amazon","en":"Amazon","he":"אמזון"},"p0":3,"image":{"fichier":"File:Amazon logo.svg","genre":"logo"}},
  {"code":"autre","noms":{"fr":"Autre (Apple comprise)","en":"Other (incl. Apple)","he":"אחר (כולל אפל)"},"p0":2,"image":null}
 ]
},
{
 "id": "starship-vol-16-avant-2027",
 "nature": "binaire",
 "categorie": "tech",
 "textes": {
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
 },
 "image": {"fichier":"File:SpaceX Starship ignition during IFT-5.jpg","genre":"photo"},
 "ferme_at": "2026-12-31T23:59:59Z",
 "resolution_at": "2027-01-01T06:00:00Z",
 "source": {"nom":"SpaceX, lancements","url":"https://www.spacex.com/launches/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0": 35,
 "p0_justif": "vol 15 le 13/11/2026, réussi (premier rattrapage du vaisseau par la tour). Le vol 16 est prévu « au plus tôt le 10 décembre 2026 » depuis le pas LC-39A en Floride : ce serait le premier départ de Floride, nouveau pas de tir, donc risque de glissement. Marché public : autre lancement Starship avant le 1/1/2027 à 37 %, avant le 15/12 à 6 % (https://kalshi.com/markets/kxspacexstarship, interne).",
 "origine": "modele",
 "modele_id": "starship",
 "periode": "vol-16",
 "verifs": ["https://en.wikipedia.org/wiki/SpaceX_Starship_flight_tests"]
}
]$graine$::jsonb);

select wm.droits();
