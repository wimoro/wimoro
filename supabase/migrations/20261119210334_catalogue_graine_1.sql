-- Marchés réels, lot 8 (19 nov. 2026) : la graine du catalogue, partie 1 sur 6 — 12 fiches, de « btc-fin-decembre-2026 » à « bce-decembre-2026 ».
-- Texte généré à partir des recherches et des traductions du 19 nov. 2026 (docs/DONNEES.md § 7) ; chaque fiche passe par
-- wm.fiche_creer, avec les mêmes contrôles qu'une fiche écrite par l'équipe. Sans effet sur le site en ligne : catalogue.serveur
-- est éteint, aucune ligne du moteur n'est créée avant la mise en ligne.
select wm.catalogue_semer($graine$[
{
 "id": "btc-fin-decembre-2026",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "Le Bitcoin sera-t-il au-dessus de 65 000 $ le 31 décembre 2026 à 23h59 UTC ?",
   "court": "BTC > 65 000 $ au 31/12",
   "critere": "OUI si le prix de clôture de la bougie journalière BTC-USD de Coinbase Exchange datée du 31/12/2026 (bougie 00:00:00 → 23:59:59 UTC, c'est-à-dire le dernier prix échangé avant le 1er janvier 2027 00:00:00 UTC) est strictement supérieur à 65 000,00 $ ; sinon NON. En cas de report ou d'annulation : si Coinbase ne publie pas la bougie (panne, arrêt des échanges), on prend la clôture de la bougie journalière XBT/USD de Kraken du 31/12/2026 ; si les deux manquent, annulation et remboursement."
  },
  "en": {
   "q": "Will Bitcoin be above $65,000 on December 31, 2026 at 23:59 UTC?",
   "court": "BTC > $65K on Dec 31",
   "critere": "YES if the closing price of the Coinbase Exchange BTC-USD daily candle dated December 31, 2026 (candle from 00:00:00 to 23:59:59 UTC, i.e. the last traded price before January 1, 2027 00:00:00 UTC) is strictly above $65,000.00; otherwise NO. In case of postponement or cancellation: if Coinbase does not publish the candle (outage, trading halt), the close of the Kraken XBT/USD daily candle for December 31, 2026 is used; if both are missing, cancellation and refund."
  },
  "he": {
   "q": "האם הביטקוין ייסחר מעל 65,000 דולר ב-31 בדצמבר 2026 בשעה 23:59 UTC?",
   "court": "ביטקוין מעל 65K$ ב-31.12",
   "critere": "כן אם מחיר הסגירה של הנר היומי של BTC-USD ב-Coinbase Exchange מתאריך 31 בדצמבר 2026 (נר מ-00:00:00 עד 23:59:59 UTC, כלומר המחיר האחרון שנסחר לפני 1 בינואר 2027 בשעה 00:00:00 UTC) גבוה ממש מ-65,000.00 דולר; אחרת לא. במקרה של דחייה או ביטול: אם Coinbase אינה מפרסמת את הנר (תקלה, הפסקת מסחר), נלקחת סגירת הנר היומי של XBT/USD ב-Kraken מתאריך 31 בדצמבר 2026; אם שניהם חסרים, ביטול והחזר כספי."
  }
 },
 "image": {"fichier":"File:Bitcoin.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-01T00:05:00Z",
 "source": {
  "nom": "Coinbase Exchange, bougie journalière BTC-USD",
  "url": "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400"
 },
 "regle": {"type":"prix","actif":"btc","op":">","seuil":65000,"au":"2027-01-01T00:00:00Z","marge":0.004},
 "lien": {"actif":"btc"},
 "p0": 42,
 "p0_justif": "prix 63 674 $ (Coinbase, 19/11 13:40 UTC) ; seuil 65 000 $ (+2,1 %) ; σ = 45 % (réalisée sur bougies Coinbase : 49,6 % sur 20 j, 44,5 % sur 30 j, 39,0 % sur 90 j) ; T = 42,4 j ; σ√T = 0,45 × √(42,4/365) = 0,153 ; d2 = (ln(63 674/65 000) − 0,0118) / 0,153 = (−0,0206 − 0,0118) / 0,153 = −0,21 → N(−0,21) = 41,6 %. Contrôle : les marchés publics « BTC atteint 70 000 $ en novembre » (20,5 %) impliquent σ ≈ 42 %, ce qui donne 41,3 %. Contexte : BTC −23 % sur 30 jours, −27 % depuis le 1er janvier. Retenu 42 %.",
 "origine": "modele",
 "modele_id": "btc-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
  "https://api.coinbase.com/v2/prices/BTC-USD/spot",
  "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
  "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400",
  "https://gamma-api.polymarket.com/events?closed=false&limit=200&tag_slug=crypto&order=volume&ascending=false"
 ]
},
{
 "id": "sol-fin-novembre-2026",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "Le Solana sera-t-il au-dessus de 75 $ le 30 novembre 2026 à 23h59 UTC ?",
   "court": "SOL > 75 $ au 30/11",
   "critere": "OUI si la clôture de la bougie journalière SOL-USD de Coinbase Exchange datée du 30/11/2026 (dernier prix avant le 1er décembre 2026 00:00:00 UTC) est strictement supérieure à 75,00 $ ; sinon NON. En cas de report ou d'annulation : secours Kraken SOL/USD (bougie journalière du 30/11) ; si aucune donnée, annulation et remboursement."
  },
  "en": {
   "q": "Will Solana be above $75 on November 30, 2026 at 23:59 UTC?",
   "court": "SOL > $75 on Nov 30",
   "critere": "YES if the close of the Coinbase Exchange SOL-USD daily candle dated November 30, 2026 (last price before December 1, 2026 00:00:00 UTC) is strictly above $75.00; otherwise NO. In case of postponement or cancellation: fallback to Kraken SOL/USD (daily candle of November 30); if no data, cancellation and refund."
  },
  "he": {
   "q": "האם סולנה (SOL) תיסחר מעל 75 דולר ב-30 בנובמבר 2026 בשעה 23:59 UTC?",
   "court": "סולנה מעל 75$ ב-30.11",
   "critere": "כן אם סגירת הנר היומי של SOL-USD ב-Coinbase Exchange מתאריך 30 בנובמבר 2026 (המחיר האחרון לפני 1 בדצמבר 2026 בשעה 00:00:00 UTC) גבוהה ממש מ-75.00 דולר; אחרת לא. במקרה של דחייה או ביטול: מקור חלופי Kraken SOL/USD (הנר היומי של 30 בנובמבר); אם אין נתונים, ביטול והחזר כספי."
  }
 },
 "image": null,
 "ferme_at": "2026-11-29T23:59:00Z",
 "resolution_at": "2026-12-01T00:05:00Z",
 "source": {
  "nom": "Coinbase Exchange, bougie journalière SOL-USD",
  "url": "https://api.exchange.coinbase.com/products/SOL-USD/candles?granularity=86400"
 },
 "regle": {"type":"prix","actif":"sol","op":">","seuil":75,"au":"2026-12-01T00:00:00Z","marge":0.004},
 "lien": {"actif":"sol"},
 "p0": 47,
 "p0_justif": "prix 74,89 $ (Coinbase, 19/11 13:40 UTC) ; seuil 75 $ ; σ = 60 % (réalisée 68,6 % sur 20 j, 61,3 % sur 30 j, 55,3 % sur 60 j) ; T = 11,4 j ; σ√T = 0,60 × √(11,4/365) = 0,106 ; d2 = (ln(74,89/75) − 0,0056) / 0,106 = (−0,0015 − 0,0056) / 0,106 = −0,067 → 47,3 %. Retenu 47 %.",
 "origine": "modele",
 "modele_id": "sol-mensuel",
 "periode": "2026-11",
 "verifs": [
  "https://api.coinbase.com/v2/prices/SOL-USD/spot",
  "https://api.exchange.coinbase.com/products/SOL-USD/candles?granularity=86400",
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana"
 ]
},
{
 "id": "btc-semaine-2026-11-23",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "Le Bitcoin finira-t-il la semaine du 23 au 29 novembre 2026 en hausse ?",
   "court": "BTC en hausse sem. 23/11",
   "critere": "OUI si la clôture de la bougie journalière BTC-USD de Coinbase du dimanche 29/11/2026 (prix au 30/11 00:00:00 UTC) est strictement supérieure à l'ouverture de la bougie du lundi 23/11/2026 (prix au 23/11 00:00:00 UTC) ; sinon NON. En cas de report ou d'annulation : secours Kraken XBT/USD (mêmes bougies) ; si aucune donnée, annulation."
  },
  "en": {
   "q": "Will Bitcoin end the week of November 23–29, 2026 higher than it started?",
   "court": "BTC up, week of Nov 23",
   "critere": "YES if the close of the Coinbase BTC-USD daily candle for Sunday, November 29, 2026 (price at November 30, 00:00:00 UTC) is strictly above the open of the candle for Monday, November 23, 2026 (price at November 23, 00:00:00 UTC); otherwise NO. In case of postponement or cancellation: fallback to Kraken XBT/USD (same candles); if no data, cancellation."
  },
  "he": {
   "q": "האם הביטקוין יסיים בעלייה את השבוע של 23–29 בנובמבר 2026?",
   "court": "ביטקוין עולה בשבוע 23.11",
   "critere": "כן אם סגירת הנר היומי של BTC-USD ב-Coinbase של יום ראשון, 29 בנובמבר 2026 (המחיר ב-30 בנובמבר בשעה 00:00:00 UTC) גבוהה ממש מפתיחת הנר של יום שני, 23 בנובמבר 2026 (המחיר ב-23 בנובמבר בשעה 00:00:00 UTC); אחרת לא. במקרה של דחייה או ביטול: מקור חלופי Kraken XBT/USD (אותם נרות); אם אין נתונים, ביטול."
  }
 },
 "image": {"fichier":"File:Bitcoin.svg","genre":"logo"},
 "ferme_at": "2026-11-23T00:00:00Z",
 "resolution_at": "2026-11-30T00:05:00Z",
 "source": {
  "nom": "Coinbase Exchange, bougies journalières BTC-USD",
  "url": "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400"
 },
 "regle": {"type":"hausse","actif":"btc","debut":"2026-11-23T00:00:00Z","fin":"2026-11-30T00:00:00Z","marge":0.002},
 "lien": {"actif":"btc"},
 "p0": 48,
 "p0_justif": "aucune tendance prévisible sur 7 jours. Modèle sans dérive : P = N(−σ√T/2) avec σ√T = 0,45 × √(7/365) = 0,062 → 48,8 %. Sur les 49 dernières semaines (bougies Coinbase), 21 semaines en hausse (42,9 %, marché baissier). Retenu 48 %.",
 "origine": "modele",
 "modele_id": "btc-hebdo",
 "periode": "2026-W48",
 "verifs": ["https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400","https://api.coinbase.com/v2/prices/BTC-USD/spot"]
},
{
 "id": "xrp-fin-decembre-2026",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "Le XRP sera-t-il au-dessus de 1,00 $ le 31 décembre 2026 à 23h59 UTC ?",
   "court": "XRP > 1 $ au 31/12",
   "critere": "OUI si la clôture de la bougie journalière XRP-USD de Coinbase Exchange datée du 31/12/2026 (dernier prix avant le 1er janvier 2027 00:00:00 UTC) est strictement supérieure à 1,0000 $ ; sinon NON. En cas de report ou d'annulation : secours Kraken XRP/USD ; si aucune donnée, annulation."
  },
  "en": {
   "q": "Will XRP be above $1.00 on December 31, 2026 at 23:59 UTC?",
   "court": "XRP > $1 on Dec 31",
   "critere": "YES if the close of the Coinbase Exchange XRP-USD daily candle dated December 31, 2026 (last price before January 1, 2027 00:00:00 UTC) is strictly above $1.0000; otherwise NO. In case of postponement or cancellation: fallback to Kraken XRP/USD; if no data, cancellation."
  },
  "he": {
   "q": "האם XRP ייסחר מעל דולר אחד (1.00$) ב-31 בדצמבר 2026 בשעה 23:59 UTC?",
   "court": "XRP מעל 1$ ב-31.12",
   "critere": "כן אם סגירת הנר היומי של XRP-USD ב-Coinbase Exchange מתאריך 31 בדצמבר 2026 (המחיר האחרון לפני 1 בינואר 2027 בשעה 00:00:00 UTC) גבוהה ממש מ-1.0000 דולר; אחרת לא. במקרה של דחייה או ביטול: מקור חלופי Kraken XRP/USD; אם אין נתונים, ביטול."
  }
 },
 "image": {"fichier":"File:XRP Logo.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-01T00:05:00Z",
 "source": {
  "nom": "Coinbase Exchange, bougie journalière XRP-USD",
  "url": "https://api.exchange.coinbase.com/products/XRP-USD/candles?granularity=86400"
 },
 "regle": {"type":"prix","actif":"xrp","op":">","seuil":1,"au":"2027-01-01T00:00:00Z","marge":0.004},
 "lien": {"actif":"xrp"},
 "p0": 44,
 "p0_justif": "prix 0,989 $ (Coinbase, 19/11 13:40 UTC) ; seuil 1,00 $ (+1,1 %) ; σ = 62 % (réalisée 64,9 % sur 30 j, 58,6 % sur 60 j, 62,2 % sur 90 j) ; T = 42,4 j ; σ√T = 0,211 ; d2 = (ln(0,989) − 0,0223) / 0,211 = (−0,0111 − 0,0223) / 0,211 = −0,158 → 43,7 %. Retenu 44 %.",
 "origine": "modele",
 "modele_id": "xrp-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://api.coinbase.com/v2/prices/XRP-USD/spot",
  "https://api.exchange.coinbase.com/products/XRP-USD/candles?granularity=86400",
  "https://commons.wikimedia.org/wiki/File:XRP_Logo.svg"
 ]
},
{
 "id": "eth-2000-avant-2027",
 "nature": "binaire",
 "categorie": "crypto",
 "textes": {
  "fr": {
   "q": "L'Ether atteindra-t-il 2 000 $ avant la fin de 2026 ?",
   "court": "ETH à 2 000 $ en 2026 ?",
   "critere": "OUI si, entre l'ouverture du marché (19/11/2026 15:00 UTC, ou l'heure réelle de mise en ligne si plus tardive) et le 31/12/2026 23:59:59 UTC, le plus haut d'une bougie d'une minute ETH-USD de Coinbase Exchange atteint ou dépasse 2 000,00 $ ; sinon NON. En cas de report ou d'annulation : secours Kraken ETH/USD (bougies 1 minute) ; une interruption de Coinbase n'annule pas le marché si Kraken a des données."
  },
  "en": {
   "q": "Will Ether trade at $2,000 or more before the end of 2026?",
   "court": "ETH hits $2,000 in 2026",
   "critere": "YES if, between the market opening (November 19, 2026 15:00 UTC, or the actual go-live time if later) and December 31, 2026 23:59:59 UTC, the high of any Coinbase Exchange ETH-USD one-minute candle reaches or exceeds $2,000.00; otherwise NO. In case of postponement or cancellation: fallback to Kraken ETH/USD (1-minute candles); a Coinbase outage does not cancel the market if Kraken has data."
  },
  "he": {
   "q": "האם האת'ר (ETH) יגיע ל-2,000 דולר לפני סוף 2026?",
   "court": "ETH ל-2,000$ עד סוף 2026",
   "critere": "כן אם, בין פתיחת השוק (19 בנובמבר 2026 בשעה 15:00 UTC, או מועד העלייה לאוויר בפועל אם הוא מאוחר יותר) לבין 31 בדצמבר 2026 בשעה 23:59:59 UTC, השיא של נר דקה כלשהו של ETH-USD ב-Coinbase Exchange מגיע לרמה של 2,000.00 דולר או עולה עליה; אחרת לא. במקרה של דחייה או ביטול: מקור חלופי Kraken ETH/USD (נרות של דקה); הפסקת פעילות של Coinbase אינה מבטלת את השוק אם יש ל-Kraken נתונים."
  }
 },
 "image": {"fichier":"File:Ethereum-icon-purple.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-01T00:05:00Z",
 "source": {"nom":"Coinbase Exchange, bougies d’une minute ETH-USD","url":"https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=60"},
 "regle": {"type":"touche","actif":"eth","seuil":2000,"jusqua":"2027-01-01T00:00:00Z","marge":0.01},
 "lien": {"actif":"eth"},
 "p0": 56,
 "p0_justif": "prix 1 804 $ (Coinbase, 19/11 13:40 UTC) ; barrière 2 000 $ (+10,8 %). Probabilité d'atteinte ≈ 2·N(−ln(2000/1804)/σ√T). σ = 52 %, calibrée sur le marché public « ETH atteint 2 000 $ en novembre » (26,5 % ; la formule donne 26,3 %) ; σ√T = 0,52 × √(42,4/365) = 0,177 ; ln(2000/1804) = 0,103 → 2·N(−0,58) = 56,2 %. Avec la volatilité réalisée (60 %) : 61,5 %. Retenu 56 %.",
 "origine": "modele",
 "modele_id": "eth-touche",
 "periode": "2026-12",
 "verifs": [
  "https://api.coinbase.com/v2/prices/ETH-USD/spot",
  "https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=86400",
  "https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=60&start=2026-11-19T13:00:00Z&end=2026-11-19T13:05:00Z",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=crypto&order=volume&ascending=false"
 ]
},
{
 "id": "sp500-semaine-2026-11-23",
 "nature": "binaire",
 "categorie": "bourse",
 "textes": {
  "fr": {
   "q": "Le S&P 500 finira-t-il la semaine du 23 au 27 novembre 2026 en hausse ?",
   "court": "S&P 500 en hausse 23/11",
   "critere": "OUI si la clôture officielle du S&P 500 du vendredi 27/11/2026 (séance écourtée, fermeture à 13:00 heure de New York) est strictement supérieure à sa clôture officielle du vendredi 20/11/2026 ; sinon NON. Semaine courte : bourse fermée le jeudi 26/11 (Thanksgiving). En cas de report ou d'annulation : si la séance du 27/11 n'a pas lieu, on compare la dernière clôture de la semaine à celle du 20/11 ; si aucune séance n'a lieu de toute la semaine, annulation."
  },
  "en": {
   "q": "Will the S&P 500 end the week of November 23–27, 2026 higher than the previous week?",
   "court": "S&P 500 up week Nov 23",
   "critere": "YES if the official S&P 500 close on Friday, November 27, 2026 (shortened session, closing at 13:00 New York time) is strictly above its official close on Friday, November 20, 2026; otherwise NO. Short week: the exchange is closed on Thursday, November 26 (Thanksgiving). In case of postponement or cancellation: if the November 27 session does not take place, the last close of the week is compared with that of November 20; if no session takes place during the entire week, cancellation."
  },
  "he": {
   "q": "האם מדד S&P 500 יסיים בעלייה את השבוע של 23–27 בנובמבר 2026?",
   "court": "S&P 500 עולה בשבוע 23.11",
   "critere": "כן אם הסגירה הרשמית של מדד S&P 500 ביום שישי, 27 בנובמבר 2026 (יום מסחר מקוצר, נעילה בשעה 13:00 שעון ניו יורק) גבוהה ממש מהסגירה הרשמית שלו ביום שישי, 20 בנובמבר 2026; אחרת לא. שבוע קצר: הבורסה סגורה ביום חמישי, 26 בנובמבר (חג ההודיה). במקרה של דחייה או ביטול: אם יום המסחר של 27 בנובמבר אינו מתקיים, משווים את הסגירה האחרונה של השבוע לזו של 20 בנובמבר; אם לא מתקיים אף יום מסחר במשך כל השבוע, ביטול."
  }
 },
 "image": {"fichier":"File:NYSE127.jpg","genre":"photo"},
 "ferme_at": "2026-11-23T14:30:00Z",
 "resolution_at": "2026-11-27T18:30:00Z",
 "source": {"nom":"S&P Dow Jones Indices","url":"https://www.spglobal.com/spdji/en/indices/equity/sp-500/"},
 "regle": {
  "type": "hausse_cloture",
  "actif": "spx",
  "ref_jour": "2026-11-20",
  "jour": "2026-11-27",
  "place": "NYSE",
  "ref_cloture_at": "2026-11-20T21:00:00Z",
  "cloture_at": "2026-11-27T18:00:00Z",
  "marge": 0.0005
 },
 "lien": {"actif":"spx"},
 "p0": 52,
 "p0_justif": "sur les 52 dernières semaines, 28 semaines en hausse (53,8 %, données Yahoo ^GSPC) ; modèle sans dérive : 49,5 % (σ = 20 %, VIX 22). Dernière clôture 7 323,63 (18/11) ; contrats à terme en hausse d'environ 1,1 % le 19/11 avant l'ouverture. Retenu 52 %.",
 "origine": "modele",
 "modele_id": "sp500-hebdo",
 "periode": "2026-W48",
 "verifs": [
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1y&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=1d&interval=5m",
  "https://www.nyse.com/markets/hours-calendars",
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1y&interval=1d"
 ]
},
{
 "id": "nvda-fin-decembre-2026",
 "nature": "binaire",
 "categorie": "bourse",
 "textes": {
  "fr": {
   "q": "L'action Nvidia clôturera-t-elle au-dessus de 150 $ le 31 décembre 2026 ?",
   "court": "Nvidia > 150 $ au 31/12",
   "critere": "OUI si le cours de clôture officiel de Nvidia (NVDA, Nasdaq) du jeudi 31/12/2026 est strictement supérieur à 150,00 $ ; sinon NON. En cas de division d'actions avant le 31/12, le seuil est divisé par le même ratio. En cas de report ou d'annulation : si le Nasdaq est fermé le 31/12, on prend la dernière clôture officielle de 2026 ; si l'action est retirée de la cote, annulation."
  },
  "en": {
   "q": "Will Nvidia stock close above $150 on December 31, 2026?",
   "court": "NVDA > $150 on Dec 31",
   "critere": "YES if the official closing price of Nvidia (NVDA, Nasdaq) on Thursday, December 31, 2026 is strictly above $150.00; otherwise NO. In the event of a stock split before December 31, the threshold is divided by the same ratio. In case of postponement or cancellation: if the Nasdaq is closed on December 31, the last official close of 2026 is used; if the stock is delisted, cancellation."
  },
  "he": {
   "q": "האם מניית אנבידיה תיסגר מעל 150 דולר ב-31 בדצמבר 2026?",
   "court": "אנבידיה מעל 150$ ב-31.12",
   "critere": "כן אם מחיר הסגירה הרשמי של אנבידיה (NVDA, נאסד״ק) ביום חמישי, 31 בדצמבר 2026 גבוה ממש מ-150.00 דולר; אחרת לא. במקרה של פיצול מניות לפני 31 בדצמבר, הרף מחולק באותו יחס. במקרה של דחייה או ביטול: אם הנאסד״ק סגור ב-31 בדצמבר, נלקחת הסגירה הרשמית האחרונה של 2026; אם המניה נמחקת מהמסחר, ביטול."
  }
 },
 "image": {"fichier":"File:Nvidia logo.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2026-12-31T21:30:00Z",
 "source": {"nom":"Nasdaq, cours historiques NVDA","url":"https://www.nasdaq.com/market-activity/stocks/nvda/historical"},
 "regle": {"type":"cloture","actif":"nvda","op":">","seuil":150,"jour":"2026-12-31","cloture_at":"2026-12-31T21:00:00Z","place":"NYSE","marge":0.003},
 "lien": {"actif":"nvda"},
 "p0": 51,
 "p0_justif": "152,70 $ en pré-ouverture (19/11 13:41 UTC ; clôture du 18/11 : 150,96 $, −36 % en 30 séances après la démission du PDG) ; seuil 150 $ ; σ = 48 % (réalisée 51,7 % sur 20 j, 46,0 % sur 30 j, 44,1 % sur 60 j) ; T = 29 séances / 252 ; σ√T = 0,163 ; d2 = (ln(152,70/150) − 0,0133) / 0,163 = (0,0178 − 0,0133) / 0,163 = 0,028 → 51,1 %. Retenu 51 %.",
 "origine": "modele",
 "modele_id": "nvda-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=1y&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=1d&interval=1m&includePrePost=true",
  "https://companiesmarketcap.com/",
  "https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Third-Quarter-Fiscal-2027/default.aspx"
 ]
},
{
 "id": "cac40-annee-2026",
 "nature": "binaire",
 "categorie": "bourse",
 "textes": {
  "fr": {
   "q": "Le CAC 40 finira-t-il l'année 2026 en hausse (au-dessus de 8 149,50 points) ?",
   "court": "CAC 40 en hausse en 2026",
   "critere": "OUI si la clôture officielle du CAC 40 publiée par Euronext pour la séance du jeudi 31/12/2026 (demi-séance) est strictement supérieure à 8 149,50 points (clôture officielle du 31/12/2025) ; sinon NON. En cas de report ou d'annulation : si la séance du 31/12 n'a pas lieu, on prend la dernière clôture officielle de 2026. L'heure exacte de fin de la demi-séance du 31/12/2026 est « à annoncer » sur le site Euronext (vers 14h05 heure de Paris d'habitude, non vérifié pour 2026) : la résolution attend la publication officielle."
  },
  "en": {
   "q": "Will the CAC 40 finish 2026 higher than it ended 2025 (above 8,149.50 points)?",
   "court": "CAC 40 up in 2026",
   "critere": "YES if the official CAC 40 close published by Euronext for the session of Thursday, December 31, 2026 (half-day session) is strictly above 8,149.50 points (official close of December 31, 2025); otherwise NO. In case of postponement or cancellation: if the December 31 session does not take place, the last official close of 2026 is used. The exact end time of the December 31, 2026 half-day session is listed as ‘to be announced’ on the Euronext website (usually around 14:05 Paris time, not verified for 2026): resolution waits for the official publication."
  },
  "he": {
   "q": "האם מדד CAC 40 יסיים את 2026 בעלייה, כלומר מעל 8,149.50 נקודות?",
   "court": "CAC 40 בעלייה ב-2026",
   "critere": "כן אם הסגירה הרשמית של מדד CAC 40 שמפרסמת Euronext ליום המסחר של יום חמישי, 31 בדצמבר 2026 (חצי יום מסחר) גבוהה ממש מ-8,149.50 נקודות (הסגירה הרשמית של 31 בדצמבר 2025); אחרת לא. במקרה של דחייה או ביטול: אם יום המסחר של 31 בדצמבר אינו מתקיים, נלקחת הסגירה הרשמית האחרונה של 2026. שעת הסיום המדויקת של חצי יום המסחר ב-31 בדצמבר 2026 מופיעה באתר Euronext כ«תפורסם בהמשך» (בדרך כלל בסביבות 14:05 שעון פריז, לא אומת לגבי 2026): ההכרעה ממתינה לפרסום הרשמי."
  }
 },
 "image": {"fichier":"File:Palais Brongniart Facade.jpg","genre":"photo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2026-12-31T14:00:00Z",
 "source": {"nom":"Euronext, CAC 40","url":"https://live.euronext.com/fr/product/indices/FR0003500008-XPAR"},
 "regle": {
  "type": "cloture",
  "actif": "cac",
  "op": ">",
  "seuil": 8149.5,
  "jour": "2026-12-31",
  "cloture_at": "2026-12-31T13:00:00Z",
  "place": "EURONEXT",
  "marge": 0.002
 },
 "lien": {"actif":"cac"},
 "p0": 48,
 "p0_justif": "8 141,53 points (19/11 13:25 UTC), soit −0,10 % sur l'année ; seuil 8 149,50 ; σ = 14 % (réalisée 12,9 % sur 30 j, 14,6 % sur 180 j) ; T = 29,4 séances / 252 ; σ√T = 0,048 ; d2 = (ln(8141,53/8149,50) − 0,0011) / 0,048 = (−0,0010 − 0,0011) / 0,048 = −0,044 → 48,2 %. Retenu 48 %.",
 "origine": "modele",
 "modele_id": "cac40-annuel",
 "periode": "2026",
 "verifs": [
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?range=1y&interval=1d",
  "https://live.euronext.com/resources/trading-hours-holidays",
  "https://www.tradingsat.com/actualites/marches-financiers/le-cac-40-a-pris-1042-en-2025-une-performance-en-demi-teinte-1153343.html"
 ]
},
{
 "id": "top-capitalisation-fin-2026",
 "nature": "options",
 "categorie": "bourse",
 "textes": {
  "fr": {
   "q": "Quelle entreprise sera la première capitalisation boursière mondiale à la clôture du 31 décembre 2026 ?",
   "court": "N° 1 mondial en bourse",
   "critere": "l'option gagnante est l'entreprise classée n° 1 du classement mondial des capitalisations boursières sur la base des cours de clôture du 31/12/2026 (dernière séance de l'année de chaque place). Capitalisation = cours de clôture × nombre total d'actions en circulation (toutes catégories) d'après le dernier dépôt officiel. En cas de report ou d'annulation : en cas de doute (écart inférieur à 0,5 % entre les deux premiers), le calcul cours × actions à partir des dépôts officiels (SEC) fait foi ; une fusion qui fait disparaître une entreprise de la cote rend son option perdante."
  },
  "en": {
   "q": "Which company will be the world's largest by market capitalization at the close on December 31, 2026?",
   "court": "Top market cap Dec 31",
   "critere": "the winning option is the company ranked No. 1 in the global market capitalization ranking based on the closing prices of December 31, 2026 (last trading session of the year on each exchange). Market capitalization = closing price × total number of shares outstanding (all classes) according to the latest official filing. In case of postponement or cancellation: in case of doubt (gap of less than 0.5% between the top two), the price × shares calculation based on official filings (SEC) is authoritative; a merger that removes a company from the listing makes its option a losing one."
  },
  "he": {
   "q": "איזו חברה תהיה בעלת שווי השוק הגבוה ביותר בעולם בסגירת המסחר ב-31 בדצמבר 2026?",
   "court": "החברה הגדולה בעולם 31.12",
   "critere": "האופציה הזוכה היא החברה המדורגת במקום הראשון בדירוג העולמי של שווי השוק, על בסיס מחירי הסגירה של 31 בדצמבר 2026 (יום המסחר האחרון של השנה בכל בורסה). שווי שוק = מחיר הסגירה × המספר הכולל של המניות שבמחזור (מכל הסוגים) לפי הדיווח הרשמי האחרון. במקרה של דחייה או ביטול: במקרה של ספק (פער של פחות מ-0.5% בין שתי החברות הראשונות), החישוב מחיר × מניות על בסיס הדיווחים הרשמיים (SEC) הוא הקובע; מיזוג שבעקבותיו חברה נמחקת מהמסחר הופך את האופציה שלה לאופציה מפסידה."
  }
 },
 "image": null,
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2027-01-01T12:00:00Z",
 "source": {"nom":"companiesmarketcap.com","url":"https://companiesmarketcap.com/"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "capitalisations le 19/11 (companiesmarketcap) : Apple 5,12 T$, Microsoft 3,77 T$, Nvidia 3,65 T$, Alphabet 3,43 T$, Amazon 2,90 T$, SpaceX 1,95 T$. Apple a 36 % d'avance sur le n° 2 à six semaines de l'échéance. Marché public de prédiction (interne) : Apple 90,9 %, Nvidia 6 %, Alphabet 1,6 %, Microsoft 0,9 %, autres < 0,5 %. Retenu Apple 90 / Nvidia 5 / Alphabet 2 / Microsoft 2 / Autre 1.",
 "origine": "modele",
 "modele_id": "top-cap-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://companiesmarketcap.com/",
  "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1y&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/MSFT?range=1y&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/GOOGL?range=1y&interval=1d",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=economy&order=volume&ascending=false"
 ],
 "options": [
  {"code":"aapl","noms":{"fr":"Apple","en":"Apple","he":"אפל"},"p0":90,"image":{"fichier":"File:Apple logo black.svg","genre":"logo"}},
  {"code":"nvda","noms":{"fr":"Nvidia","en":"Nvidia","he":"אנבידיה"},"p0":5,"image":{"fichier":"File:Nvidia logo.svg","genre":"logo"}},
  {
   "code": "googl",
   "noms": {"fr":"Alphabet (Google)","en":"Alphabet (Google)","he":"אלפבית (גוגל)"},
   "p0": 2,
   "image": {"fichier":"File:Alphabet Inc Logo 2015.svg","genre":"logo"}
  },
  {
   "code": "msft",
   "noms": {"fr":"Microsoft","en":"Microsoft","he":"מיקרוסופט"},
   "p0": 2,
   "image": {"fichier":"File:Microsoft logo (2012).svg","genre":"logo"}
  },
  {"code":"autre","noms":{"fr":"Une autre entreprise","en":"Another company","he":"חברה אחרת"},"p0":1,"image":null}
 ]
},
{
 "id": "tsla-fin-decembre-2026",
 "nature": "binaire",
 "categorie": "bourse",
 "textes": {
  "fr": {
   "q": "L'action Tesla clôturera-t-elle au-dessus de 400 $ le 31 décembre 2026 ?",
   "court": "Tesla > 400 $ au 31/12",
   "critere": "OUI si le cours de clôture officiel de Tesla (TSLA, Nasdaq) du jeudi 31/12/2026 est strictement supérieur à 400,00 $ ; sinon NON. En cas de division d'actions avant le 31/12, le seuil est ajusté du même ratio. Si une fusion Tesla–SpaceX est annoncée, le marché continue tant que l'action TSLA est cotée. En cas de report ou d'annulation : si le Nasdaq est fermé le 31/12, dernière clôture officielle de 2026 ; si TSLA n'est plus cotée, annulation."
  },
  "en": {
   "q": "Will Tesla stock close above $400 on December 31, 2026?",
   "court": "TSLA > $400 on Dec 31",
   "critere": "YES if the official closing price of Tesla (TSLA, Nasdaq) on Thursday, December 31, 2026 is strictly above $400.00; otherwise NO. In the event of a stock split before December 31, the threshold is adjusted by the same ratio. If a Tesla–SpaceX merger is announced, the market continues as long as TSLA stock is listed. In case of postponement or cancellation: if the Nasdaq is closed on December 31, the last official close of 2026; if TSLA is no longer listed, cancellation."
  },
  "he": {
   "q": "האם מניית טסלה תיסגר מעל 400 דולר ב-31 בדצמבר 2026?",
   "court": "טסלה מעל 400$ ב-31.12",
   "critere": "כן אם מחיר הסגירה הרשמי של טסלה (TSLA, נאסד״ק) ביום חמישי, 31 בדצמבר 2026 גבוה ממש מ-400.00 דולר; אחרת לא. במקרה של פיצול מניות לפני 31 בדצמבר, הרף מותאם באותו יחס. אם יוכרז מיזוג בין טסלה ל-SpaceX, השוק נמשך כל עוד מניית TSLA רשומה למסחר. במקרה של דחייה או ביטול: אם הנאסד״ק סגור ב-31 בדצמבר, הסגירה הרשמית האחרונה של 2026; אם TSLA אינה רשומה עוד למסחר, ביטול."
  }
 },
 "image": {"fichier":"File:Tesla T symbol.svg","genre":"logo"},
 "ferme_at": "2026-12-30T23:59:00Z",
 "resolution_at": "2026-12-31T21:30:00Z",
 "source": {"nom":"Nasdaq, cours historiques TSLA","url":"https://www.nasdaq.com/market-activity/stocks/tsla/historical"},
 "regle": {"type":"cloture","actif":"tsla","op":">","seuil":400,"jour":"2026-12-31","cloture_at":"2026-12-31T21:00:00Z","place":"NYSE","marge":0.003},
 "lien": {"actif":"tsla"},
 "p0": 41,
 "p0_justif": "390,38 $ en pré-ouverture (19/11 13:41 UTC ; clôture du 18/11 : 383,72 $) ; seuil 400 $ ; σ = 52 % (réalisée 59,5 % sur 20 j, 52,0 % sur 30 j, 46,6 % sur 60 j) ; T = 29 séances / 252 ; σ√T = 0,176 ; d2 = (ln(390,38/400) − 0,0156) / 0,176 = (−0,0243 − 0,0156) / 0,176 = −0,226 → 41,1 %. Retenu 41 %.",
 "origine": "modele",
 "modele_id": "tsla-mensuel",
 "periode": "2026-12",
 "verifs": [
  "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?range=1y&interval=1d",
  "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?range=1d&interval=1m&includePrePost=true"
 ]
},
{
 "id": "fed-decembre-2026",
 "nature": "options",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "Que décidera la Réserve fédérale américaine lors de sa réunion des 8 et 9 décembre 2026 ?",
   "court": "Décision Fed 9 déc.",
   "critere": "on compare la borne haute de la fourchette cible des fed funds annoncée dans le communiqué du 9/12/2026 (publié à 14:00 heure de New York = 19:00 UTC) à la borne haute en vigueur la veille de la réunion (4,00 % aujourd'hui : fourchette 3,75 %–4,00 %). Baisse → option 1 ; inchangée → option 2 ; hausse inférieure à 0,375 point → option 3 ; hausse de 0,375 point ou plus → option 4. En cas de report ou d'annulation : si la réunion est déplacée, on retient la décision de la réunion reprogrammée si elle a lieu avant le 31/12/2026 ; sinon annulation. Un mouvement d'urgence entre deux réunions ne compte pas (il change seulement la référence « veille de la réunion »)."
  },
  "en": {
   "q": "What will the Federal Reserve decide at its December 8–9, 2026 meeting?",
   "court": "Fed decision Dec 9",
   "critere": "the upper bound of the federal funds target range announced in the statement of December 9, 2026 (released at 14:00 New York time = 19:00 UTC) is compared with the upper bound in effect on the day before the meeting (4.00% as of today: range 3.75%–4.00%). Cut → option 1; unchanged → option 2; hike of less than 0.375 percentage point → option 3; hike of 0.375 percentage point or more → option 4. In case of postponement or cancellation: if the meeting is moved, the decision of the rescheduled meeting is used if it takes place before December 31, 2026; otherwise cancellation. An emergency move between two meetings does not count (it only changes the ‘day before the meeting’ reference)."
  },
  "he": {
   "q": "מה יחליט הפדרל ריזרב (הפד) בישיבתו ב-8–9 בדצמבר 2026?",
   "court": "החלטת הפד ב-9 בדצמבר",
   "critere": "משווים את הגבול העליון של טווח היעד לריבית הפד (fed funds) שהוכרז בהודעה מ-9 בדצמבר 2026 (המתפרסמת בשעה 14:00 שעון ניו יורק = 19:00 UTC) לגבול העליון שבתוקף ביום שלפני הישיבה (4.00% כיום: טווח 3.75%–4.00%). הורדה: אופציה 1; ללא שינוי: אופציה 2; העלאה של פחות מ-0.375 נקודת אחוז: אופציה 3; העלאה של 0.375 נקודת אחוז או יותר: אופציה 4. במקרה של דחייה או ביטול: אם הישיבה מוזזת, נלקחת ההחלטה של הישיבה שנקבעה מחדש אם היא מתקיימת לפני 31 בדצמבר 2026; אחרת ביטול. מהלך חירום בין שתי ישיבות אינו נחשב (הוא משנה רק את נקודת הייחוס «היום שלפני הישיבה»)."
  }
 },
 "image": {"fichier":"File:Seal of the United States Federal Reserve System.svg","genre":"logo"},
 "ferme_at": "2026-12-09T18:00:00Z",
 "resolution_at": "2026-12-09T19:30:00Z",
 "source": {"nom":"Réserve fédérale (communiqué du FOMC)","url":"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"},
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "fourchette 3,75–4,00 % maintenue le 28/10/2026 par 10 voix contre 2 (Lisa Cook et Beth Hammack voulaient une hausse de 0,25 point) ; le communiqué juge l'inflation « élevée » ; glissement annuel de l'IPC 3,7 % en septembre. Deux marchés publics concordent : hausse 0,25 = 91–92 %, hausse > 0,25 = 6–7 %, statu quo = 2–2,5 %, baisse ≈ 0,5–1 %.",
 "origine": "modele",
 "modele_id": "fed-reunion",
 "periode": "2026-12",
 "verifs": [
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm",
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU&cosd=2026-10-01",
  "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/2.json",
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFEDDECISION&status=open&limit=100",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=fed-rates&order=volume&ascending=false"
 ],
 "options": [
  {"code":"baisse","noms":{"fr":"Baisse des taux","en":"Rate cut","he":"הורדת ריבית"},"p0":1,"image":null},
  {"code":"statu","noms":{"fr":"Statu quo","en":"No change","he":"ללא שינוי"},"p0":2,"image":null},
  {"code":"hausse25","noms":{"fr":"Hausse de 0,25 point","en":"Hike of 0.25 point","he":"העלאה של 0.25 נקודה"},"p0":91,"image":null},
  {"code":"hausse50","noms":{"fr":"Hausse de 0,50 ou plus","en":"Hike of 0.50 or more","he":"העלאה של 0.50 ומעלה"},"p0":6,"image":null}
 ]
},
{
 "id": "bce-decembre-2026",
 "nature": "options",
 "categorie": "economie",
 "textes": {
  "fr": {
   "q": "Que décidera la BCE pour son taux de dépôt le 17 décembre 2026 ?",
   "court": "Décision BCE 17 déc.",
   "critere": "on compare le taux de la facilité de dépôt annoncé dans le communiqué de politique monétaire du 17/12/2026 (publié à 14h15 heure de Francfort = 13:15 UTC) au taux en vigueur avant la réunion (2,50 %, depuis le 16/09/2026). Baisse → option 1 ; inchangé → option 2 ; hausse inférieure à 0,375 point → option 3 ; hausse de 0,375 point ou plus → option 4. En cas de report ou d'annulation : si la réunion est déplacée, on retient la décision de la réunion reprogrammée si elle a lieu avant le 31/12/2026 ; sinon annulation."
  },
  "en": {
   "q": "What will the ECB decide on its deposit facility rate on December 17, 2026?",
   "court": "ECB decision Dec 17",
   "critere": "the deposit facility rate announced in the monetary policy statement of December 17, 2026 (released at 14:15 Frankfurt time = 13:15 UTC) is compared with the rate in effect before the meeting (2.50%, since September 16, 2026). Cut → option 1; unchanged → option 2; hike of less than 0.375 percentage point → option 3; hike of 0.375 percentage point or more → option 4. In case of postponement or cancellation: if the meeting is moved, the decision of the rescheduled meeting is used if it takes place before December 31, 2026; otherwise cancellation."
  },
  "he": {
   "q": "מה יחליט הבנק המרכזי האירופי (ECB) לגבי ריבית הפיקדון ב-17 בדצמבר 2026?",
   "court": "החלטת ה-ECB ב-17.12",
   "critere": "משווים את ריבית הפיקדון (deposit facility rate) שהוכרזה בהודעת המדיניות המוניטרית מ-17 בדצמבר 2026 (המתפרסמת בשעה 14:15 שעון פרנקפורט = 13:15 UTC) לריבית שבתוקף לפני הישיבה (2.50%, מאז 16 בספטמבר 2026). הורדה: אופציה 1; ללא שינוי: אופציה 2; העלאה של פחות מ-0.375 נקודת אחוז: אופציה 3; העלאה של 0.375 נקודת אחוז או יותר: אופציה 4. במקרה של דחייה או ביטול: אם הישיבה מוזזת, נלקחת ההחלטה של הישיבה שנקבעה מחדש אם היא מתקיימת לפני 31 בדצמבר 2026; אחרת ביטול."
  }
 },
 "image": {"fichier":"File:Logo European Central Bank.svg","genre":"logo"},
 "ferme_at": "2026-12-17T12:15:00Z",
 "resolution_at": "2026-12-17T13:30:00Z",
 "source": {
  "nom": "Banque centrale européenne",
  "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html"
 },
 "regle": {"type":"manuel"},
 "lien": null,
 "p0_justif": "taux de dépôt 2,50 % après deux hausses (17/06/2026 et 16/09/2026). Marché public de prédiction (interne) : hausse 0,25 = 96,5 %, statu quo 2,3 %, hausse ≥ 0,50 = 1,6 %, baisse 0,5 %. Retenu 1 / 2 / 96 / 1.",
 "origine": "modele",
 "modele_id": "bce-reunion",
 "periode": "2026-12",
 "verifs": [
  "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html",
  "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=3&format=csvdata",
  "https://www.ecb.europa.eu/press/pressconf/html/press_conference.en.html",
  "https://gamma-api.polymarket.com/events?closed=false&limit=150&tag_slug=economy&order=volume&ascending=false"
 ],
 "options": [
  {"code":"baisse","noms":{"fr":"Baisse","en":"Rate cut","he":"הורדת ריבית"},"p0":1,"image":null},
  {"code":"statu","noms":{"fr":"Statu quo","en":"No change","he":"ללא שינוי"},"p0":2,"image":null},
  {"code":"hausse25","noms":{"fr":"Hausse de 0,25 point","en":"Hike of 0.25 point","he":"העלאה של 0.25 נקודה"},"p0":96,"image":null},
  {"code":"hausse50","noms":{"fr":"Hausse de 0,50 ou plus","en":"Hike of 0.50 or more","he":"העלאה של 0.50 ומעלה"},"p0":1,"image":null}
 ]
}
]$graine$::jsonb);

select wm.droits();
