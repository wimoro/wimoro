-- Marchés réels, lot 10 (19 nov. 2026) : les modèles des marchés permanents, partie 1 sur 2 — 20 modèles, de « btc-mensuel » à « ia-arena-mensuel ».
-- Texte généré (gabarits en trois langues, règles, calendriers) ; vérifié par tests/sql/modeles.spec.mjs.
select wm.modeles_semer($modeles$[
{
 "id": "btc-mensuel",
 "famille": "prix_seuil",
 "categorie": "crypto",
 "regle": {"actif":"btc","pas":[[20000,1000],[null,5000]],"sigma":0.45,"dec":0,"marge":0.004},
 "gabarit": {
  "fr": {
   "q": "Le Bitcoin sera-t-il au-dessus de {K} le {D} à 23h59 UTC ?",
   "court": "BTC > {Kc} au {d}",
   "critere": "OUI si la clôture de la bougie journalière BTC-USD de Coinbase Exchange datée du {Dn} (dernier prix échangé avant le {D1} 00:00:00 UTC) est strictement supérieure à {K2} ; sinon NON. En cas de report ou d'annulation : si Coinbase ne publie pas cette bougie, on prend la clôture de la bougie journalière de Kraken du même jour ; si les deux manquent, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will Bitcoin be above {K} on {D} at 23:59 UTC?",
   "court": "BTC > {Kc} on {d}",
   "critere": "YES if the close of the Coinbase Exchange BTC-USD daily candle dated {D} (last trade before {D1} 00:00:00 UTC) is strictly above {K2}; otherwise NO. If postponed or cancelled: if Coinbase does not publish this candle, the close of the Kraken daily candle for the same day is used; if both are missing, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם מחיר הביטקוין יהיה מעל {K} ב-{D} בשעה 23:59 UTC?",
   "court": "ביטקוין מעל {Kc} ב-{d}",
   "critere": "כן אם מחיר הסגירה של הנר היומי BTC-USD בבורסת Coinbase Exchange לתאריך {D} (העסקה האחרונה לפני {D1} בשעה 00:00:00 UTC) גבוה ממש מ-{K2}; אחרת לא. במקרה של דחייה או ביטול: אם Coinbase לא תפרסם את הנר, ייעשה שימוש במחיר הסגירה של הנר היומי ב-Kraken באותו יום; אם שניהם חסרים, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "sol-mensuel",
 "famille": "prix_seuil",
 "categorie": "crypto",
 "regle": {"actif":"sol","pas":[[20,1],[null,5]],"sigma":0.6,"dec":0,"marge":0.004},
 "gabarit": {
  "fr": {
   "q": "Le Solana sera-t-il au-dessus de {K} le {D} à 23h59 UTC ?",
   "court": "SOL > {Kc} au {d}",
   "critere": "OUI si la clôture de la bougie journalière SOL-USD de Coinbase Exchange datée du {Dn} (dernier prix échangé avant le {D1} 00:00:00 UTC) est strictement supérieure à {K2} ; sinon NON. En cas de report ou d'annulation : si Coinbase ne publie pas cette bougie, on prend la clôture de la bougie journalière de Kraken du même jour ; si les deux manquent, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will Solana be above {K} on {D} at 23:59 UTC?",
   "court": "SOL > {Kc} on {d}",
   "critere": "YES if the close of the Coinbase Exchange SOL-USD daily candle dated {D} (last trade before {D1} 00:00:00 UTC) is strictly above {K2}; otherwise NO. If postponed or cancelled: if Coinbase does not publish this candle, the close of the Kraken daily candle for the same day is used; if both are missing, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם מחיר סולנה (SOL) יהיה מעל {K} ב-{D} בשעה 23:59 UTC?",
   "court": "סולנה מעל {Kc} ב-{d}",
   "critere": "כן אם מחיר הסגירה של הנר היומי SOL-USD בבורסת Coinbase Exchange לתאריך {D} (העסקה האחרונה לפני {D1} בשעה 00:00:00 UTC) גבוה ממש מ-{K2}; אחרת לא. במקרה של דחייה או ביטול: אם Coinbase לא תפרסם את הנר, ייעשה שימוש במחיר הסגירה של הנר היומי ב-Kraken באותו יום; אם שניהם חסרים, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "btc-hebdo",
 "famille": "prix_hausse",
 "categorie": "crypto",
 "regle": {"actif":"btc","sigma":0.45,"marge":0.002},
 "gabarit": {
  "fr": {
   "q": "Le Bitcoin finira-t-il la semaine du {W1} au {W2} en hausse ?",
   "court": "BTC en hausse sem. {w}",
   "critere": "OUI si la clôture de la bougie journalière BTC-USD de Coinbase Exchange du {W2} (prix au {F} 00:00:00 UTC) est strictement supérieure à l'ouverture de la bougie du {W1L} (prix au {W1L} 00:00:00 UTC) ; sinon NON. En cas de report ou d'annulation : on prend les mêmes bougies XBT/USD de Kraken ; si aucune donnée n'existe, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will Bitcoin end the week of {W1}–{W2} higher than it started?",
   "court": "BTC up, week of {w}",
   "critere": "YES if the close of the Coinbase Exchange BTC-USD daily candle of {W2} (price at {F} 00:00:00 UTC) is strictly above the open of the {W1L} candle (price at {W1L} 00:00:00 UTC); otherwise NO. If postponed or cancelled: the same Kraken XBT/USD candles are used; if no data exists, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם הביטקוין יסיים בעלייה את השבוע של {W1}–{W2}?",
   "court": "ביטקוין עולה בשבוע {w}",
   "critere": "כן אם מחיר הסגירה של הנר היומי BTC-USD בבורסת Coinbase Exchange ב-{W2} (המחיר ב-{F} בשעה 00:00:00 UTC) גבוה ממש ממחיר הפתיחה של הנר של {W1L} (המחיר ב-{W1L} בשעה 00:00:00 UTC); אחרת לא. במקרה של דחייה או ביטול: ייעשה שימוש באותם נרות XBT/USD של Kraken; אם אין נתונים, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "xrp-mensuel",
 "famille": "prix_seuil",
 "categorie": "crypto",
 "regle": {"actif":"xrp","pas":[[null,0.1]],"sigma":0.62,"dec":2,"marge":0.004},
 "gabarit": {
  "fr": {
   "q": "Le XRP sera-t-il au-dessus de {K} le {D} à 23h59 UTC ?",
   "court": "XRP > {Kc} au {d}",
   "critere": "OUI si la clôture de la bougie journalière XRP-USD de Coinbase Exchange datée du {Dn} (dernier prix échangé avant le {D1} 00:00:00 UTC) est strictement supérieure à {K2} ; sinon NON. En cas de report ou d'annulation : si Coinbase ne publie pas cette bougie, on prend la clôture de la bougie journalière de Kraken du même jour ; si les deux manquent, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will XRP be above {K} on {D} at 23:59 UTC?",
   "court": "XRP > {Kc} on {d}",
   "critere": "YES if the close of the Coinbase Exchange XRP-USD daily candle dated {D} (last trade before {D1} 00:00:00 UTC) is strictly above {K2}; otherwise NO. If postponed or cancelled: if Coinbase does not publish this candle, the close of the Kraken daily candle for the same day is used; if both are missing, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם מחיר XRP יהיה מעל {K} ב-{D} בשעה 23:59 UTC?",
   "court": "XRP מעל {Kc} ב-{d}",
   "critere": "כן אם מחיר הסגירה של הנר היומי XRP-USD בבורסת Coinbase Exchange לתאריך {D} (העסקה האחרונה לפני {D1} בשעה 00:00:00 UTC) גבוה ממש מ-{K2}; אחרת לא. במקרה של דחייה או ביטול: אם Coinbase לא תפרסם את הנר, ייעשה שימוש במחיר הסגירה של הנר היומי ב-Kraken באותו יום; אם שניהם חסרים, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "eth-touche",
 "famille": "prix_touche",
 "categorie": "crypto",
 "regle": {"actif":"eth","facteur":1.1,"pas":[[null,100]],"sigma":0.52,"dec":0,"marge":0.01},
 "gabarit": {
  "fr": {
   "q": "L'Ether atteindra-t-il {K} en {M} ?",
   "court": "ETH à {K} en {Mc} ?",
   "critere": "OUI si, entre le {De} 00:00 UTC et le {D} 23:59:59 UTC, le plus haut d'une bougie d'une minute ETH-USD de Coinbase Exchange atteint ou dépasse {K2} ; sinon NON. En cas de report ou d'annulation : on prend les bougies d'une minute ETH/USD de Kraken ; une interruption de Coinbase n'annule pas le marché si Kraken a des données."
  },
  "en": {
   "q": "Will Ether trade at {K} or more in {M}?",
   "court": "ETH hits {K} in {Mc}",
   "critere": "YES if, between {De} 00:00 UTC and {D} 23:59:59 UTC, the high of a one-minute Coinbase Exchange ETH-USD candle reaches or exceeds {K2}; otherwise NO. If postponed or cancelled: Kraken ETH/USD one-minute candles are used; a Coinbase outage does not cancel the market if Kraken has data."
  },
  "he": {
   "q": "האם האת'ר (ETH) יגיע ל-{K} {M}?",
   "court": "ETH ל-{Kc} ב{Mc}",
   "critere": "כן אם בין {De} בשעה 00:00 UTC לבין {D} בשעה 23:59:59 UTC, השיא של נר דקה ETH-USD בבורסת Coinbase Exchange מגיע ל-{K2} או עובר אותו; אחרת לא. במקרה של דחייה או ביטול: ייעשה שימוש בנרות הדקה ETH/USD של Kraken; הפסקה ב-Coinbase אינה מבטלת את השוק אם יש נתונים ב-Kraken."
  }
 }
},
{
 "id": "sp500-hebdo",
 "famille": "hausse_cloture",
 "categorie": "bourse",
 "regle": {"actif":"spx","sigma":0.2,"place":"NYSE","marge":0.0005},
 "gabarit": {
  "fr": {
   "q": "Le S&P 500 finira-t-il la semaine du {W1} au {W2} en hausse ?",
   "court": "S&P 500 en hausse {w}",
   "critere": "OUI si la dernière clôture officielle du S&P 500 de la semaine (séance du {J}) est strictement supérieure à la dernière clôture officielle de la semaine précédente (séance du {R}) ; sinon NON. En cas de report ou d'annulation : si aucune séance n'a lieu de toute la semaine, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will the S&P 500 end the week of {W1}–{W2} higher than the previous week?",
   "court": "S&P 500 up week {w}",
   "critere": "YES if the last official S&P 500 close of the week ({J} session) is strictly above the last official close of the previous week ({R} session); otherwise NO. If postponed or cancelled: if no session takes place during the whole week, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם מדד S&P 500 יסיים בעלייה את השבוע של {W1}–{W2}?",
   "court": "S&P 500 עולה בשבוע {w}",
   "critere": "כן אם הסגירה הרשמית האחרונה של מדד S&P 500 בשבוע (המסחר של {J}) גבוהה ממש מהסגירה הרשמית האחרונה של השבוע הקודם (המסחר של {R}); אחרת לא. במקרה של דחייה או ביטול: אם לא מתקיים מסחר כלל במהלך השבוע, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "nvda-mensuel",
 "famille": "cloture_seuil",
 "categorie": "bourse",
 "regle": {"actif":"nvda","pas":[[null,10]],"sigma":0.48,"dec":0,"place":"NYSE","marge":0.003},
 "gabarit": {
  "fr": {
   "q": "L'action Nvidia clôturera-t-elle au-dessus de {K} le {D} ?",
   "court": "Nvidia > {K} au {d}",
   "critere": "OUI si le cours de clôture officiel de Nvidia (NVDA, Nasdaq) du {D} est strictement supérieur à {K2} ; sinon NON. En cas de division d'actions avant cette date, le seuil est ajusté du même ratio. En cas de report ou d'annulation : si le Nasdaq est fermé ce jour-là, on prend la dernière clôture officielle précédente ; si l'action n'est plus cotée, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will Nvidia stock close above {K} on {D}?",
   "court": "NVDA > {K} on {d}",
   "critere": "YES if the official closing price of Nvidia (NVDA, Nasdaq) on {D} is strictly above {K2}; otherwise NO. If a stock split occurs before that date, the threshold is adjusted by the same ratio. If postponed or cancelled: if the Nasdaq is closed that day, the last previous official close is used; if the stock is no longer listed, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם מניית אנבידיה תיסגר מעל {K} ב-{D}?",
   "court": "אנבידיה מעל {Kc} ב-{d}",
   "critere": "כן אם מחיר הסגירה הרשמי של מניית אנבידיה (NVDA, נאסד״ק) ב-{D} גבוה ממש מ-{K2}; אחרת לא. אם יבוצע פיצול מניות לפני מועד זה, הרף יותאם באותו יחס. במקרה של דחייה או ביטול: אם הנאסד״ק סגור באותו יום, ייעשה שימוש במחיר הסגירה הרשמי האחרון שלפניו; אם המניה אינה נסחרת עוד, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "cac40-annuel",
 "famille": "cloture_annuelle",
 "categorie": "bourse",
 "ouverture": "resolution",
 "regle": {"actif":"cac","sigma":0.14,"place":"EURONEXT","marge":0.002},
 "gabarit": {
  "fr": {
   "q": "Le CAC 40 finira-t-il l'année {Y} en hausse (au-dessus de {Kn} points) ?",
   "court": "CAC 40 en hausse en {Y}",
   "critere": "OUI si la clôture officielle du CAC 40 publiée par Euronext pour la séance du {D} est strictement supérieure à {Kn} points (clôture officielle du {Dp}) ; sinon NON. En cas de report ou d'annulation : si cette séance n'a pas lieu, on prend la dernière clôture officielle de {Y}."
  },
  "en": {
   "q": "Will the CAC 40 finish {Y} higher than it ended {Yp} (above {Kn} points)?",
   "court": "CAC 40 up in {Y}",
   "critere": "YES if the official CAC 40 close published by Euronext for the {D} session is strictly above {Kn} points (official close of {Dp}); otherwise NO. If postponed or cancelled: if that session does not take place, the last official close of {Y} is used."
  },
  "he": {
   "q": "האם מדד CAC 40 יסיים את {Y} בעלייה, כלומר מעל {Kn} נקודות?",
   "court": "CAC 40 בעלייה ב-{Y}",
   "critere": "כן אם הסגירה הרשמית של מדד CAC 40 שמפרסמת Euronext למסחר של {D} גבוהה ממש מ-{Kn} נקודות (הסגירה הרשמית של {Dp}); אחרת לא. במקרה של דחייה או ביטול: אם המסחר באותו יום אינו מתקיים, ייעשה שימוש בסגירה הרשמית האחרונה של {Y}."
  }
 }
},
{
 "id": "top-cap-mensuel",
 "famille": "classement",
 "categorie": "bourse",
 "regle": {"place":"NYSE","ferme_h":"-1 minute","resultat_h":"36 hours"},
 "gabarit": {
  "fr": {
   "q": "Quelle entreprise sera la première capitalisation boursière mondiale à la clôture du {D} ?",
   "court": "N° 1 en Bourse au {d}",
   "critere": "L'option gagnante est l'entreprise classée n° 1 du classement mondial des capitalisations boursières sur la base des cours de clôture du {D} (companiesmarketcap.com). En cas d'écart de moins de 0,5 % entre les deux premières, le calcul cours de clôture × actions en circulation des derniers dépôts officiels fait foi. Une fusion qui fait disparaître une entreprise de la cote rend son option perdante."
  },
  "en": {
   "q": "Which company will be the world's largest by market capitalization at the close on {D}?",
   "court": "Top market cap {d}",
   "critere": "The winning option is the company ranked #1 in the world market-capitalization ranking based on the closing prices of {D} (companiesmarketcap.com). If the top two are less than 0.5% apart, the calculation closing price × shares outstanding from the latest official filings prevails. A merger that removes a company from listing makes its option lose."
  },
  "he": {
   "q": "איזו חברה תהיה בעלת שווי השוק הגבוה ביותר בעולם בסגירת המסחר ב-{D}?",
   "court": "החברה הגדולה בעולם {d}",
   "critere": "האפשרות הזוכה היא החברה המדורגת ראשונה בדירוג העולמי של שווי השוק לפי מחירי הסגירה של {D} (companiesmarketcap.com). אם הפער בין שתי הראשונות קטן מ-0.5%, קובע החישוב מחיר סגירה × מניות במחזור לפי הדיווחים הרשמיים האחרונים. מיזוג שמוציא חברה מהמסחר הופך את האפשרות שלה למפסידה."
  }
 }
},
{
 "id": "tsla-mensuel",
 "famille": "cloture_seuil",
 "categorie": "bourse",
 "regle": {"actif":"tsla","pas":[[null,50]],"sigma":0.52,"dec":0,"place":"NYSE","marge":0.003},
 "gabarit": {
  "fr": {
   "q": "L'action Tesla clôturera-t-elle au-dessus de {K} le {D} ?",
   "court": "Tesla > {K} au {d}",
   "critere": "OUI si le cours de clôture officiel de Tesla (TSLA, Nasdaq) du {D} est strictement supérieur à {K2} ; sinon NON. En cas de division d'actions avant cette date, le seuil est ajusté du même ratio. En cas de report ou d'annulation : si le Nasdaq est fermé ce jour-là, on prend la dernière clôture officielle précédente ; si l'action n'est plus cotée, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will Tesla stock close above {K} on {D}?",
   "court": "TSLA > {K} on {d}",
   "critere": "YES if the official closing price of Tesla (TSLA, Nasdaq) on {D} is strictly above {K2}; otherwise NO. If a stock split occurs before that date, the threshold is adjusted by the same ratio. If postponed or cancelled: if the Nasdaq is closed that day, the last previous official close is used; if the stock is no longer listed, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם מניית טסלה תיסגר מעל {K} ב-{D}?",
   "court": "טסלה מעל {Kc} ב-{d}",
   "critere": "כן אם מחיר הסגירה הרשמי של מניית טסלה (TSLA, נאסד״ק) ב-{D} גבוה ממש מ-{K2}; אחרת לא. אם יבוצע פיצול מניות לפני מועד זה, הרף יותאם באותו יחס. במקרה של דחייה או ביטול: אם הנאסד״ק סגור באותו יום, ייעשה שימוש במחיר הסגירה הרשמי האחרון שלפניו; אם המניה אינה נסחרת עוד, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "fed-reunion",
 "famille": "reunion",
 "categorie": "economie",
 "options": [
  {"code":"baisse","noms":{"fr":"Baisse des taux","en":"Rate cut","he":"הורדת ריבית"},"p0":10},
  {"code":"statu","noms":{"fr":"Statu quo","en":"No change","he":"ללא שינוי"},"p0":55},
  {"code":"hausse25","noms":{"fr":"Hausse de 0,25 point","en":"Hike of 0.25 point","he":"העלאה של 0.25 נקודה"},"p0":30},
  {"code":"hausse50","noms":{"fr":"Hausse de 0,50 ou plus","en":"Hike of 0.50 or more","he":"העלאה של 0.50 ומעלה"},"p0":5}
 ],
 "calendrier": [
  {"periode":"2027-01","jour":"2027-01-27","ferme_at":"2027-01-27T18:00:00Z","resolution_at":"2027-01-27T19:30:00Z"},
  {"periode":"2027-03","jour":"2027-03-17","ferme_at":"2027-03-17T17:00:00Z","resolution_at":"2027-03-17T18:30:00Z"},
  {"periode":"2027-04","jour":"2027-04-28","ferme_at":"2027-04-28T17:00:00Z","resolution_at":"2027-04-28T18:30:00Z"},
  {"periode":"2027-06","jour":"2027-06-09","ferme_at":"2027-06-09T17:00:00Z","resolution_at":"2027-06-09T18:30:00Z"},
  {"periode":"2027-07","jour":"2027-07-28","ferme_at":"2027-07-28T17:00:00Z","resolution_at":"2027-07-28T18:30:00Z"},
  {"periode":"2027-09","jour":"2027-09-15","ferme_at":"2027-09-15T17:00:00Z","resolution_at":"2027-09-15T18:30:00Z"},
  {"periode":"2027-10","jour":"2027-10-27","ferme_at":"2027-10-27T17:00:00Z","resolution_at":"2027-10-27T18:30:00Z"},
  {"periode":"2027-11","jour":"2027-11-17","ferme_at":"2027-11-17T18:00:00Z","resolution_at":"2027-11-17T19:30:00Z"}
 ],
 "gabarit": {
  "fr": {
   "q": "Que décidera la Réserve fédérale américaine lors de sa réunion qui s'achève le {E} ?",
   "court": "Décision Fed {e}",
   "critere": "On compare la borne haute de la fourchette cible des fed funds annoncée dans le communiqué du {E} (14:00 heure de New York) à la borne haute en vigueur la veille de la réunion. Baisse : « Baisse des taux » ; inchangée : « Statu quo » ; hausse de moins de 0,375 point : « Hausse de 0,25 point » ; hausse de 0,375 point ou plus : « Hausse de 0,50 ou plus ». En cas de report ou d'annulation : si la réunion est déplacée, on retient la décision de la réunion reprogrammée si elle a lieu dans le mois ; sinon, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "What will the Federal Reserve decide at its meeting ending {E}?",
   "court": "Fed decision {e}",
   "critere": "The upper bound of the fed funds target range announced in the {E} statement (2:00 p.m. New York time) is compared with the upper bound in force the day before the meeting. Cut: ‘Rate cut’; unchanged: ‘No change’; hike of less than 0.375 point: ‘Hike of 0.25 point’; hike of 0.375 point or more: ‘Hike of 0.50 or more’. If postponed or cancelled: if the meeting is moved, the decision of the rescheduled meeting counts if it takes place within the month; otherwise the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "מה יחליט הפדרל ריזרב (הפד) בישיבתו שתסתיים ב-{E}?",
   "court": "החלטת הפד ב-{e}",
   "critere": "משווים את הגבול העליון של טווח היעד לריבית הפדרל פאנדס שיפורסם בהודעה של {E} (14:00 שעון ניו יורק) לגבול העליון שהיה בתוקף ערב הישיבה. הורדה: «הורדת ריבית»; ללא שינוי: «ללא שינוי»; העלאה של פחות מ-0.375 נקודה: «העלאה של 0.25 נקודה»; העלאה של 0.375 נקודה או יותר: «העלאה של 0.50 ומעלה». במקרה של דחייה או ביטול: אם הישיבה תוזז, תיחשב ההחלטה בישיבה שנקבעה מחדש אם תתקיים בתוך החודש; אחרת השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "bce-reunion",
 "famille": "reunion",
 "categorie": "economie",
 "options": [
  {"code":"baisse","noms":{"fr":"Baisse","en":"Rate cut","he":"הורדת ריבית"},"p0":10},
  {"code":"statu","noms":{"fr":"Statu quo","en":"No change","he":"ללא שינוי"},"p0":60},
  {"code":"hausse25","noms":{"fr":"Hausse de 0,25 point","en":"Hike of 0.25 point","he":"העלאה של 0.25 נקודה"},"p0":25},
  {"code":"hausse50","noms":{"fr":"Hausse de 0,50 ou plus","en":"Hike of 0.50 or more","he":"העלאה של 0.50 ומעלה"},"p0":5}
 ],
 "calendrier": [
  {"periode":"2027-02","jour":"2027-02-04","ferme_at":"2027-02-04T12:15:00Z","resolution_at":"2027-02-04T13:30:00Z"},
  {"periode":"2027-03","jour":"2027-03-18","ferme_at":"2027-03-18T12:15:00Z","resolution_at":"2027-03-18T13:30:00Z"},
  {"periode":"2027-04","jour":"2027-04-29","ferme_at":"2027-04-29T11:15:00Z","resolution_at":"2027-04-29T12:30:00Z"},
  {"periode":"2027-06","jour":"2027-06-10","ferme_at":"2027-06-10T11:15:00Z","resolution_at":"2027-06-10T12:30:00Z"},
  {"periode":"2027-07","jour":"2027-07-22","ferme_at":"2027-07-22T11:15:00Z","resolution_at":"2027-07-22T12:30:00Z"},
  {"periode":"2027-09","jour":"2027-09-09","ferme_at":"2027-09-09T11:15:00Z","resolution_at":"2027-09-09T12:30:00Z"},
  {"periode":"2027-10","jour":"2027-10-28","ferme_at":"2027-10-28T11:15:00Z","resolution_at":"2027-10-28T12:30:00Z"},
  {"periode":"2027-12","jour":"2027-12-16","ferme_at":"2027-12-16T12:15:00Z","resolution_at":"2027-12-16T13:30:00Z"}
 ],
 "gabarit": {
  "fr": {
   "q": "Que décidera la BCE pour son taux de dépôt le {E} ?",
   "court": "Décision BCE {e}",
   "critere": "On compare le taux de la facilité de dépôt annoncé dans le communiqué de politique monétaire du {E} (14h15, heure de Francfort) au taux en vigueur avant la réunion. Baisse : « Baisse » ; inchangé : « Statu quo » ; hausse de moins de 0,375 point : « Hausse de 0,25 point » ; hausse de 0,375 point ou plus : « Hausse de 0,50 ou plus ». En cas de report ou d'annulation : si la réunion est déplacée, on retient la décision de la réunion reprogrammée si elle a lieu dans le mois ; sinon, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "What will the ECB decide on its deposit facility rate on {E}?",
   "court": "ECB decision {e}",
   "critere": "The deposit facility rate announced in the {E} monetary policy statement (2:15 p.m. Frankfurt time) is compared with the rate in force before the meeting. Cut: ‘Rate cut’; unchanged: ‘No change’; hike of less than 0.375 point: ‘Hike of 0.25 point’; hike of 0.375 point or more: ‘Hike of 0.50 or more’. If postponed or cancelled: if the meeting is moved, the decision of the rescheduled meeting counts if it takes place within the month; otherwise the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "מה יחליט הבנק המרכזי האירופי (ECB) לגבי ריבית הפיקדון ב-{E}?",
   "court": "החלטת ה-ECB ב-{e}",
   "critere": "משווים את ריבית הפיקדון שתפורסם בהודעת המדיניות המוניטרית של {E} (14:15 שעון פרנקפורט) לריבית שהייתה בתוקף לפני הישיבה. הורדה: «הורדת ריבית»; ללא שינוי: «ללא שינוי»; העלאה של פחות מ-0.375 נקודה: «העלאה של 0.25 נקודה»; העלאה של 0.375 נקודה או יותר: «העלאה של 0.50 ומעלה». במקרה של דחייה או ביטול: אם הישיבה תוזז, תיחשב ההחלטה בישיבה שנקבעה מחדש אם תתקיים בתוך החודש; אחרת השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "cpi-usa",
 "famille": "indicateur",
 "categorie": "economie",
 "ouverture": "resolution",
 "calendrier": [
  {"periode":"2026-12","publication":"2027-01-13","ferme_at":"2027-01-13T12:30:00Z","resolution_at":"2027-01-13T13:45:00Z"},
  {"periode":"2027-01","publication":"2027-02-11","ferme_at":"2027-02-11T12:30:00Z","resolution_at":"2027-02-11T13:45:00Z"},
  {"periode":"2027-02","publication":"2027-03-10","ferme_at":"2027-03-10T12:30:00Z","resolution_at":"2027-03-10T13:45:00Z"},
  {"periode":"2027-03","publication":"2027-04-13","ferme_at":"2027-04-13T11:30:00Z","resolution_at":"2027-04-13T12:45:00Z"},
  {"periode":"2027-04","publication":"2027-05-12","ferme_at":"2027-05-12T11:30:00Z","resolution_at":"2027-05-12T12:45:00Z"},
  {"periode":"2027-05","publication":"2027-06-10","ferme_at":"2027-06-10T11:30:00Z","resolution_at":"2027-06-10T12:45:00Z"},
  {"periode":"2027-06","publication":"2027-07-14","ferme_at":"2027-07-14T11:30:00Z","resolution_at":"2027-07-14T12:45:00Z"},
  {"periode":"2027-07","publication":"2027-08-11","ferme_at":"2027-08-11T11:30:00Z","resolution_at":"2027-08-11T12:45:00Z"},
  {"periode":"2027-08","publication":"2027-09-14","ferme_at":"2027-09-14T11:30:00Z","resolution_at":"2027-09-14T12:45:00Z"},
  {"periode":"2027-09","publication":"2027-10-14","ferme_at":"2027-10-14T11:30:00Z","resolution_at":"2027-10-14T12:45:00Z"},
  {"periode":"2027-10","publication":"2027-11-10","ferme_at":"2027-11-10T12:30:00Z","resolution_at":"2027-11-10T13:45:00Z"},
  {"periode":"2027-11","publication":"2027-12-10","ferme_at":"2027-12-10T12:30:00Z","resolution_at":"2027-12-10T13:45:00Z"}
 ],
 "gabarit": {
  "fr": {
   "q": "L'inflation américaine sur un an (indice des prix de {R}) dépassera-t-elle {Kp} ?",
   "court": "IPC US {Rc} > {Kp}",
   "critere": "OUI si la variation sur 12 mois de l'indice CPI-U « All items » (non corrigé des variations saisonnières) pour {R}, telle que publiée par le BLS le {E} à 08:30 heure de New York (arrondie à 0,1 point), est strictement supérieure à {Kp} ; sinon NON. En cas de report ou d'annulation : si la publication est retardée, la résolution attend la publication."
  },
  "en": {
   "q": "Will US annual inflation (CPI for {R}) be above {Kp}?",
   "court": "US CPI {Rc} > {Kp}",
   "critere": "YES if the 12-month change of the CPI-U All items index (not seasonally adjusted) for {R}, as published by the BLS on {E} at 8:30 a.m. New York time (rounded to 0.1 point), is strictly above {Kp}; otherwise NO. If postponed or cancelled: if the release is delayed, resolution waits for the release."
  },
  "he": {
   "q": "האם האינפלציה השנתית בארה״ב (מדד המחירים לצרכן {R}) תהיה גבוהה מ-{Kp}?",
   "court": "אינפלציה בארה״ב מעל {Kp}",
   "critere": "כן אם השינוי ב-12 חודשים של מדד CPI-U All items (ללא ניכוי עונתיות) {R}, כפי שיפרסם ה-BLS ב-{E} בשעה 08:30 שעון ניו יורק (מעוגל ל-0.1 נקודה), גבוה ממש מ-{Kp}; אחרת לא. במקרה של דחייה או ביטול: אם הפרסום יתעכב, ההכרעה תמתין לפרסום."
  }
 }
},
{
 "id": "eurusd-mensuel",
 "famille": "reference_bce",
 "categorie": "economie",
 "regle": {"actif":"eurusd","pas":[[null,0.01]],"sigma":0.055,"dec":2,"marge":0.0005},
 "gabarit": {
  "fr": {
   "q": "L'euro vaudra-t-il plus de {K} le {D} (cours de référence de la BCE) ?",
   "court": "EUR/USD > {Kn} au {d}",
   "critere": "OUI si le cours de référence euro/dollar publié par la BCE pour le {D} est strictement supérieur à {Kn4} ; sinon NON. En cas de report ou d'annulation : si la BCE ne publie pas de cours ce jour-là, on prend le dernier cours publié avant."
  },
  "en": {
   "q": "Will the euro be worth more than {K} on {D} (ECB reference rate)?",
   "court": "EUR/USD > {Kn} {d}",
   "critere": "YES if the euro/dollar reference rate published by the ECB for {D} is strictly above {Kn4}; otherwise NO. If postponed or cancelled: if the ECB publishes no rate that day, the last rate published before is used."
  },
  "he": {
   "q": "האם שער האירו יהיה גבוה מ-{K} ב-{D} (שער הייחוס של ה-ECB)?",
   "court": "אירו מעל {Kn}$ ב-{d}",
   "critere": "כן אם שער הייחוס אירו/דולר שיפרסם ה-ECB ל-{D} גבוה ממש מ-{Kn4}; אחרת לא. במקרה של דחייה או ביטול: אם ה-ECB לא יפרסם שער באותו יום, ייעשה שימוש בשער האחרון שפורסם לפניו."
  }
 }
},
{
 "id": "or-mensuel",
 "famille": "prix_or",
 "categorie": "economie",
 "regle": {"actif":"xau","pas":[[null,100]],"sigma":0.24,"dec":0},
 "gabarit": {
  "fr": {
   "q": "L'or sera-t-il au-dessus de {K} l'once le {D} ?",
   "court": "Or > {K} au {d}",
   "critere": "OUI si le « LBMA Gold Price PM » en dollars du {D} est strictement supérieur à {K2} ; sinon NON. En cas de report ou d'annulation : si aucun prix PM n'est publié ce jour-là, on prend le prix AM du même jour, sinon le dernier prix publié avant."
  },
  "en": {
   "q": "Will gold be above {K} an ounce on {D}?",
   "court": "Gold > {K} {d}",
   "critere": "YES if the LBMA Gold Price PM in dollars on {D} is strictly above {K2}; otherwise NO. If postponed or cancelled: if no PM price is published that day, the AM price of the same day is used, otherwise the last price published before."
  },
  "he": {
   "q": "האם מחיר הזהב יהיה מעל {K} לאונקיה ב-{D}?",
   "court": "זהב מעל {Kc} ב-{d}",
   "critere": "כן אם מחיר ה-LBMA Gold Price PM בדולרים ב-{D} גבוה ממש מ-{K2}; אחרת לא. במקרה של דחייה או ביטול: אם לא יפורסם מחיר PM באותו יום, ייעשה שימוש במחיר ה-AM של אותו יום, ואחרת במחיר האחרון שפורסם לפניו."
  }
 }
},
{
 "id": "presidentielle-fr",
 "famille": "edition",
 "categorie": "politique",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":5},
 "gabarit": {
  "fr": {
   "q": "Qui remportera l'élection présidentielle française de {Y} ?",
   "court": "Présidentielle FR {Y}",
   "critere": "gagne l'option du candidat proclamé élu président de la République par le Conseil constitutionnel à l'issue de cette élection (1er tour 18 avril {Y}, 2nd tour 2 mai {Y}). Un candidat non listé qui gagne = « Autre ». Si l'élection est anticipée avant avril {Y}, le marché porte sur cette élection anticipée. En cas de report ou d'annulation : en cas de report (article 7 de la Constitution, ex. décès d'un candidat), le marché reste ouvert et la clôture est déplacée à la veille du nouveau 1er tour. Aucun président proclamé au 31/12/{Y} = marché annulé et remboursé."
  },
  "en": {
   "q": "Who will win the {Y} French presidential election?",
   "court": "France {Y} president",
   "critere": "the winning option is that of the candidate proclaimed elected President of the Republic by the Constitutional Council at the end of this election (1st round April 18, {Y}, 2nd round May 2, {Y}). An unlisted candidate who wins = ‘Other’. If the election is brought forward to before April {Y}, the market covers that early election. In case of postponement or cancellation: in the event of a postponement (Article 7 of the Constitution, e.g. death of a candidate), the market stays open and the close is moved to the day before the new 1st round. No president proclaimed by December 31, {Y} = market cancelled and refunded."
  },
  "he": {
   "q": "מי ינצח בבחירות לנשיאות צרפת ב-{Y}?",
   "court": "נשיאות צרפת {Y}",
   "critere": "זוכה האופציה של המועמד שהמועצה החוקתית הכריזה עליו כנשיא הרפובליקה הנבחר בתום הבחירות הללו (סיבוב ראשון ב-18 באפריל {Y}, סיבוב שני ב-2 במאי {Y}). מועמד שאינו ברשימה וזוכה = «אחר». אם הבחירות מוקדמות לפני אפריל {Y}, השוק מתייחס לבחירות המוקדמות הללו. במקרה של דחייה או ביטול: במקרה של דחייה (סעיף 7 לחוקה, למשל מות מועמד), השוק נשאר פתוח ומועד הסגירה נדחה ליום שלפני הסיבוב הראשון החדש. לא הוכרז נשיא עד 31 בדצמבר {Y} = השוק מבוטל והכסף מוחזר."
  }
 }
},
{
 "id": "presidentielle-us",
 "famille": "edition",
 "categorie": "politique",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":4},
 "gabarit": {
  "fr": {
   "q": "Qui remportera l'élection présidentielle américaine de {Y} ?",
   "court": "Présidentielle US {Y}",
   "critere": "gagne la personne qui obtient la majorité des voix du collège électoral, telle que certifiée par le Congrès. Résolution anticipée possible quand l'issue n'est plus contestable (tous les grands réseaux ont annoncé le vainqueur, aucun recours capable d'inverser le résultat). Si un litige dure, gagne la personne investie le 20 janvier 2029. Personne non listée = « Autre ». En cas de report ou d'annulation : date fixée par la loi fédérale ; si le scrutin n'a pas lieu en {Y}, marché annulé et remboursé."
  },
  "en": {
   "q": "Who will win the {Y} US presidential election?",
   "court": "US president {Y}",
   "critere": "the winner is the person who obtains a majority of Electoral College votes, as certified by Congress. Early resolution is possible once the outcome is no longer contestable (all major networks have called the winner, no appeal capable of reversing the result). If a dispute drags on, the winner is the person inaugurated on January 20, 2029. Unlisted person = ‘Other’. In case of postponement or cancellation: the date is set by federal law; if the vote does not take place in {Y}, market cancelled and refunded."
  },
  "he": {
   "q": "מי ינצח בבחירות לנשיאות ארצות הברית ב-{Y}?",
   "court": "נשיאות ארה״ב {Y}",
   "critere": "זוכה האדם שמקבל את רוב קולות חבר האלקטורים, כפי שמאשר הקונגרס. הכרעה מוקדמת אפשרית כאשר התוצאה כבר אינה ניתנת לערעור (כל הרשתות הגדולות הכריזו על המנצח, ואין ערעור שעשוי להפוך את התוצאה). אם מחלוקת נמשכת, זוכה האדם שמושבע לתפקיד ב-20 בינואר 2029. אדם שאינו ברשימה = «אחר». במקרה של דחייה או ביטול: המועד נקבע בחוק הפדרלי; אם הבחירות אינן מתקיימות ב-{Y}, השוק מבוטל והכסף מוחזר."
  }
 }
},
{
 "id": "trump-approbation",
 "famille": "seuil_manuel",
 "categorie": "politique",
 "ouverture": "resolution",
 "gabarit": {
  "fr": {
   "q": "La cote d'approbation de Trump sera-t-elle d'au moins {Kp} chez Silver Bulletin le {D} ?",
   "court": "Trump ≥ {Kp} au {d}",
   "critere": "OUI si le taux d'approbation de Donald Trump affiché par la moyenne Silver Bulletin (natesilver.net) pour le {D} est supérieur ou égal à {Kp1} ; sinon NON. Sans mise à jour ce jour-là, on prend la dernière valeur publiée avant. En cas de report ou d'annulation : si le suivi Silver Bulletin disparaît, on utilise la moyenne RealClearPolling du même jour ; si aucune des deux n'existe, le marché est annulé et les mises remboursées."
  },
  "en": {
   "q": "Will Trump's approval rating be at least {Kp} on Silver Bulletin on {D}?",
   "court": "Trump ≥ {Kp} on {d}",
   "critere": "YES if Donald Trump's approval rating shown by the Silver Bulletin average (natesilver.net) for {D} is greater than or equal to {Kp1}; otherwise NO. Without an update that day, the last value published before is used. If postponed or cancelled: if the Silver Bulletin tracker disappears, the RealClearPolling average of the same day is used; if neither exists, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "האם שיעור התמיכה בטראמפ יעמוד על {Kp} לפחות במדד Silver Bulletin ב-{D}?",
   "court": "טראמפ: תמיכה {Kp}+ {d}",
   "critere": "כן אם שיעור התמיכה בדונלד טראמפ שמוצג בממוצע של Silver Bulletin (natesilver.net) ל-{D} גבוה מ-{Kp1} או שווה לו; אחרת לא. ללא עדכון באותו יום, ייעשה שימוש בערך האחרון שפורסם לפניו. במקרה של דחייה או ביטול: אם מדד Silver Bulletin ייעלם, ייעשה שימוש בממוצע RealClearPolling של אותו יום; אם אף אחד מהם אינו קיים, השוק מבוטל וההימורים מוחזרים."
  }
 }
},
{
 "id": "pm-france",
 "famille": "edition",
 "categorie": "politique",
 "suite": "brouillon",
 "ouverture": "resolution",
 "regle": {"pas_annees":1},
 "gabarit": {
  "fr": {
   "q": "Sébastien Lecornu sera-t-il encore Premier ministre le 31 mars {Y} ?",
   "court": "Lecornu PM au 31 mars",
   "critere": "OUI si, le 31 mars {Y} à 23:59 heure de Paris, Sébastien Lecornu exerce la fonction de Premier ministre, y compris s'il a démissionné et expédie les affaires courantes tant qu'aucun successeur n'a été nommé par décret publié au Journal officiel. NON si un décret nommant une autre personne Premier ministre est publié avant cette heure. Une démission suivie d'une renomination de Lecornu = OUI."
  },
  "en": {
   "q": "Will Sébastien Lecornu still be Prime Minister of France on March 31, {Y}?",
   "court": "Lecornu PM on Mar 31",
   "critere": "YES if, on March 31, {Y} at 23:59 Paris time, Sébastien Lecornu holds the office of Prime Minister, including if he has resigned and is acting as caretaker (handling current affairs) as long as no successor has been appointed by a decree published in the Journal officiel. NO if a decree appointing another person as Prime Minister is published before that time. A resignation followed by Lecornu’s reappointment = YES."
  },
  "he": {
   "q": "האם סבסטיאן לקורנו עדיין יכהן כראש ממשלת צרפת ב-31 במרץ {Y}?",
   "court": "לקורנו רה״מ ב-31.3",
   "critere": "כן אם ב-31 במרץ {Y} בשעה 23:59 שעון פריז, סבסטיאן לקורנו מכהן כראש הממשלה, לרבות אם התפטר והוא ממשיך לנהל את העניינים השוטפים (ממשלת מעבר) כל עוד לא מונה מחליף בצו שפורסם ב-Journal officiel (העיתון הרשמי). לא אם צו הממנה אדם אחר לראש הממשלה מתפרסם לפני שעה זו. התפטרות שאחריה לקורנו ממונה מחדש = כן."
  }
 }
},
{
 "id": "ia-arena-mensuel",
 "famille": "classement",
 "categorie": "tech",
 "regle": {"ferme_h":"16 hours","resultat_h":"17 hours 30 minutes"},
 "gabarit": {
  "fr": {
   "q": "Quelle entreprise aura le modèle n°1 du classement texte d'Arena le {D} ?",
   "court": "IA n°1 sur Arena {d}",
   "critere": "Gagne l'entreprise qui développe le modèle classé 1er sur https://arena.ai/leaderboard/text, vue par défaut sans changer aucun filtre, relevée le {D} à 17:00 UTC avec capture d'écran. En cas d'égalité de rang, on départage au score affiché le plus élevé, puis par ordre alphabétique du nom d'entreprise (en lettres latines). Les modèles Grok comptent pour SpaceX. Si le site est indisponible, on fait le premier relevé réussi dans les 24 heures ; classement supprimé : marché annulé et mises remboursées."
  },
  "en": {
   "q": "Which company will have the #1 model on the Arena text leaderboard on {D}?",
   "court": "Top AI on Arena {d}",
   "critere": "The winner is the company developing the model ranked 1st on https://arena.ai/leaderboard/text, default view with no filter changed, read on {D} at 17:00 UTC with a screenshot. In case of a tie in rank, the highest displayed score wins, then the alphabetical order of the company name (in Latin letters). Grok models count for SpaceX. If the site is unavailable, the first successful reading within 24 hours is used; if the leaderboard is removed, the market is cancelled and stakes are refunded."
  },
  "he": {
   "q": "לאיזו חברה יהיה המודל המדורג ראשון בטבלת הטקסט של Arena ב-{D}?",
   "court": "מודל ה-AI המוביל {d}",
   "critere": "זוכה החברה שמפתחת את המודל המדורג ראשון ב-https://arena.ai/leaderboard/text, בתצוגת ברירת המחדל וללא שינוי מסננים, לפי קריאה ב-{D} בשעה 17:00 UTC עם צילום מסך. במקרה של שוויון בדירוג, מכריע הציון המוצג הגבוה ביותר, ולאחר מכן סדר האלף-בית של שם החברה (באותיות לטיניות). מודלי Grok נחשבים ל-SpaceX. אם האתר אינו זמין, ייעשה שימוש בקריאה המוצלחת הראשונה בתוך 24 שעות; אם הדירוג יוסר, השוק מבוטל וההימורים מוחזרים."
  }
 }
}
]$modeles$::jsonb);

select wm.droits();
