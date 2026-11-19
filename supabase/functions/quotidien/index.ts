// Tâche quotidienne de Wimoro : propositions de marchés du jour, scores des matchs suivis, copie des images.
//
// Appelée UNIQUEMENT par les tâches planifiées (wm-quotidien à 05:30 UTC, wm-quotidien-reveil toutes les 10 minutes quand il
// y a du travail) et par le panneau (action quotidien_lancer), par pg_net, avec l'en-tête x-wm-jeton (jeton gardé par la base
// dans Vault, vérifié par srv_jeton_ok). Sans le bon jeton : refus 401, sans aucun travail. verify_jwt est désactivé.
//
//   POST { tache: 'jour' }            → 202 ; puis : calendriers sportifs (football-data.org, balldontlie avec leur clé ;
//                                        OpenLigaDB sans clé), gros titres (Currents avec sa clé, sinon Wikipédia « À la
//                                        une » en, fr, he et Hacker News), tendances (deux sites de marchés publics, usage
//                                        interne), rédaction (Groq ou la clé payante Gemini, réponse JSON contrôlée ; sinon
//                                        gabarits), enregistrement par srv_quotidien_enregistrer.
//   POST { taches: ['images', 'sport'] } → images à copier (Wikimedia Commons → 128 × 128 → bucket « marches ») ; scores
//                                        des matchs suivis (srv_sport_maj).
//
// Les clés sont lues dans les secrets des Edge Functions ; une clé absente rend sa source inactive (la base l'affiche) et
// la tâche passe à la suivante. Leurs valeurs ne sont jamais écrites dans un journal ni envoyées à la base. Identifiant
// honnête : « WimoroBot/1.0 (https://wimoro.com) ». Les modules lecteurs.js, redaction.js et images.js sont purs et testés
// sous Node sur des réponses enregistrées (tests/quotidien.spec.mjs).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import * as L from "./lecteurs.js";
import * as R from "./redaction.js";
import * as I from "./images.js";

const UA = "WimoroBot/1.0 (https://wimoro.com)";
const SECRETS = ["CURRENTS_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "FOOTBALL_DATA_API_KEY", "APISPORTS_API_KEY", "BALLDONTLIE_API_KEY"];
const SOURCE_DU_SECRET: Record<string, string> = { CURRENTS_API_KEY: "currents", GROQ_API_KEY: "groq", GEMINI_API_KEY: "gemini",
  FOOTBALL_DATA_API_KEY: "football_data", APISPORTS_API_KEY: "apisports", BALLDONTLIE_API_KEY: "balldontlie" };

const cle = (nouvelles: string, ancienne: string): string => {
  try {
    const d = JSON.parse(Deno.env.get(nouvelles) ?? "{}");
    if (d && typeof d.default === "string") return d.default;
  } catch (_) { /* ancienne clé */ }
  return Deno.env.get(ancienne) ?? "";
};
const base = createClient(Deno.env.get("SUPABASE_URL")!, cle("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json" } });
let dernierCri = 0;
const crier = (...x: unknown[]) => { const t = Date.now(); if (t - dernierCri > 5000) { dernierCri = t; console.error(...x); } };

let jetonVu = "", jetonJusqua = 0;
async function jetonOk(j: string): Promise<boolean> {
  if (j.length < 32 || j.length > 200) return false;
  if (j === jetonVu && Date.now() < jetonJusqua) return true;
  const { data, error } = await base.rpc("srv_jeton_ok", { p_jeton: j });
  if (error) { crier("jeton :", error.message); return false; }
  if (data === true) { jetonVu = j; jetonJusqua = Date.now() + 600000; return true; }
  return false;
}

// Bilan des sources pour la base (appels, succès, erreurs, présence de la clé ; jamais la clé elle-même).
type Bilan = { id: string; appels: number; ok: boolean; code?: number; ms?: number; erreur?: string; cle?: boolean };
const bilan = new Map<string, Bilan>();
const noter = (id: string, r: { statut: number; ms?: number; erreur?: string }) => {
  const b = bilan.get(id) ?? { id, appels: 0, ok: false };
  b.appels += 1; b.code = r.statut; b.ms = r.ms;
  if (r.statut >= 200 && r.statut < 300) b.ok = true; else b.erreur = r.erreur || ("HTTP " + r.statut);
  bilan.set(id, b);
};

// deno-lint-ignore no-explicit-any
async function chercher(url: string, o: { entetes?: Record<string, string>; methode?: string; corps?: unknown; delai?: number; binaire?: boolean } = {}): Promise<any> {
  const t0 = Date.now();
  try {
    const rep = await fetch(url, {
      method: o.methode ?? "GET",
      headers: { "User-Agent": UA, Accept: o.binaire ? "image/*" : "application/json", ...(o.corps ? { "Content-Type": "application/json" } : {}), ...(o.entetes ?? {}) },
      body: o.corps ? JSON.stringify(o.corps) : undefined,
      signal: AbortSignal.timeout(o.delai ?? 8000),
    });
    if (o.binaire) return { statut: rep.status, octets: rep.ok ? new Uint8Array(await rep.arrayBuffer()) : null, ms: Date.now() - t0 };
    const texte = await rep.text();
    let corps: unknown = null;
    if (rep.ok) { try { corps = JSON.parse(texte); } catch (_) { corps = undefined; } }
    return { statut: rep.status, corps, ms: Date.now() - t0 };
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    return { statut: 0, erreur: (e as any)?.name === "TimeoutError" ? "delai" : "reseau", ms: Date.now() - t0 };
  }
}
const jourIso = (t: number) => new Date(t).toISOString().slice(0, 10);

// ── La tâche du jour ──
// deno-lint-ignore no-explicit-any
async function tacheJour(cfg: any, cles: Record<string, string>) {
  const now = Date.now(), jour = jourIso(now), dans7 = jourIso(now + 7 * 86400e3);
  // deno-lint-ignore no-explicit-any
  const matchs: any[] = [];
  if (cles.FOOTBALL_DATA_API_KEY) {
    const r = await chercher(`https://api.football-data.org/v4/matches?dateFrom=${jour}&dateTo=${dans7}&competitions=PL,PD,SA,BL1,FL1,CL`, { entetes: { "X-Auth-Token": cles.FOOTBALL_DATA_API_KEY } });
    noter("football_data", r); matchs.push(...L.footballData(r.corps));
  }
  if (cles.BALLDONTLIE_API_KEY) {
    const r = await chercher(`https://api.balldontlie.io/v1/games?start_date=${jour}&end_date=${jourIso(now + 3 * 86400e3)}&per_page=100`, { entetes: { Authorization: cles.BALLDONTLIE_API_KEY } });
    noter("balldontlie", r); matchs.push(...L.balldontlie(r.corps));
  }
  const g = await chercher("https://api.openligadb.de/getcurrentgroup/bl1");
  noter("openligadb", g);
  const n = Number(g.corps?.groupOrderID) || 0;
  for (const k of n ? [n, n + 1] : []) {
    const r = await chercher(`https://api.openligadb.de/getmatchdata/bl1/${cfg.saison_bl}/${k}`);
    noter("openligadb", r);
    for (const m of L.openLigaDb(r.corps)) if (!matchs.some(x => x.debut === m.debut && x.dom.nom === m.dom.nom)) matchs.push(m);
  }
  // gros titres et tendances
  // deno-lint-ignore no-explicit-any
  const nouvelles: any[] = [], tendances: any[] = [];
  if (cles.CURRENTS_API_KEY) {
    for (const l of ["fr", "en"]) {
      const r = await chercher(`https://api.currentsapi.services/v1/latest-news?language=${l}&apiKey=${encodeURIComponent(cles.CURRENTS_API_KEY)}`);
      noter("currents", { ...r, erreur: r.erreur }); nouvelles.push(...L.currents(r.corps));
    }
  }
  const [a, m, d] = jour.split("-");
  for (const l of ["en", "fr", "he"]) {
    const r = await chercher(`https://${l}.wikipedia.org/api/rest_v1/feed/featured/${a}/${m}/${d}`);
    noter("wikipedia", r);
    const w = L.wikipediaUne(r.corps, l);
    if (!cles.CURRENTS_API_KEY) nouvelles.push(...w.nouvelles);
    tendances.push(...w.lus.map(x => ({ terme: x.terme, source: "wikipedia" })));
  }
  if (!cles.CURRENTS_API_KEY) {
    const r = await chercher("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30");
    noter("hackernews", r); nouvelles.push(...L.hackerNews(r.corps).slice(0, 8));
  }
  const ta = await chercher("https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=40");
  noter("tendances_a", ta); tendances.push(...L.polymarketEvenements(ta.corps));
  const tb = await chercher("https://api.manifold.markets/v0/search-markets?sort=24-hour-vol&filter=open&limit=40");
  noter("tendances_b", tb); tendances.push(...L.manifoldMarches(tb.corps));

  // propositions : matchs des sept prochains jours (ouverts d'office), sujets (à valider)
  const connues = new Set(cfg.cles_connues || []);
  // deno-lint-ignore no-explicit-any
  const props: any[] = matchs.filter(x => x.statut === "prevu" && x.debut > now + 3 * 3600e3 && x.debut < now + 7 * 86400e3).map(R.brouillonMatch)
    .filter(p => !connues.has(p.cle));
  const places = Math.max(0, cfg.actus_max - cfg.actus_ouvertes);
  const sujets = R.choisirSujets(nouvelles, tendances, cfg.exclus, Math.max(6, Math.ceil(places * 1.5))).filter(s => !connues.has(s.cle));
  // deno-lint-ignore no-explicit-any
  let ia: any = null, refus: any[] = [];
  if (cfg.ia && sujets.length && (cles.GROQ_API_KEY || cles.GEMINI_API_KEY)) {
    const pr = R.promptIA(sujets, jour);
    if (cles.GROQ_API_KEY) {
      const r = await chercher("https://api.groq.com/openai/v1/chat/completions", { methode: "POST", delai: 60000, entetes: { Authorization: "Bearer " + cles.GROQ_API_KEY },
        corps: { model: "openai/gpt-oss-120b", temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "system", content: pr.system }, { role: "user", content: pr.user }] } });
      noter("groq", r); ia = L.reponseIA(r.corps);
    } else {
      const r = await chercher(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(cles.GEMINI_API_KEY)}`,
        { methode: "POST", delai: 60000, corps: { contents: [{ parts: [{ text: pr.system + "\n\n" + pr.user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } } });
      noter("gemini", r); ia = L.reponseIA(r.corps);
    }
  }
  if (ia) {
    const v = R.validerIA(ia, now);
    refus = v.refus;
    props.push(...v.ok.filter(p => !connues.has(p.cle)));
  } else {
    props.push(...sujets.map(R.brouillonSujet));
  }
  const { error } = await base.rpc("srv_quotidien_enregistrer", { p: { propositions: props, matchs, sources: [...bilan.values()], ia: ia ? "oui" : "non", refus } });
  if (error) crier("enregistrement :", error.message);
}

// ── Les scores des matchs suivis ──
// deno-lint-ignore no-explicit-any
async function tacheSport(cfg: any, cles: Record<string, string>) {
  // deno-lint-ignore no-explicit-any
  const matchs: any[] = [];
  for (const id of cfg.matchs_suivis || []) {
    const [src, n] = String(id).split(":");
    if (src === "oldb") { const r = await chercher(`https://api.openligadb.de/getmatchdata/${encodeURIComponent(n)}`); noter("openligadb", r); matchs.push(...L.openLigaDb(r.corps)); }
    else if (src === "fd" && cles.FOOTBALL_DATA_API_KEY) {
      const r = await chercher(`https://api.football-data.org/v4/matches/${encodeURIComponent(n)}`, { entetes: { "X-Auth-Token": cles.FOOTBALL_DATA_API_KEY } });
      noter("football_data", r); matchs.push(...L.footballData({ matches: r.corps ? [r.corps] : [] }));
    } else if (src === "as" && cles.APISPORTS_API_KEY) {
      const r = await chercher(`https://v3.football.api-sports.io/fixtures?id=${encodeURIComponent(n)}`, { entetes: { "x-apisports-key": cles.APISPORTS_API_KEY } });
      noter("apisports", r); matchs.push(...L.apiSports(r.corps));
    } else if (src === "bdl" && cles.BALLDONTLIE_API_KEY) {
      const r = await chercher(`https://api.balldontlie.io/v1/games/${encodeURIComponent(n)}`, { entetes: { Authorization: cles.BALLDONTLIE_API_KEY } });
      noter("balldontlie", r); matchs.push(...L.balldontlie({ data: r.corps?.data ? [r.corps.data] : [] }));
    }
  }
  const { error } = await base.rpc("srv_sport_maj", { p: { matchs, sources: [...bilan.values()] } });
  if (error) crier("scores :", error.message);
}

// ── La copie des images ──
async function sha256(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return [...h].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function tacheImages() {
  const { data: liste, error } = await base.rpc("srv_images_a_copier", { p_n: 8 });
  if (error) { crier("images :", error.message); return; }
  for (const img of liste || []) {
    // deno-lint-ignore no-explicit-any
    const fin = async (p: any) => { const { error: e } = await base.rpc("srv_image_enregistrer", { p: { id: img.id, ...p } }); if (e) crier("image enregistrée :", e.message); };
    try {
      const r = await chercher(I.urlImageinfo(img.fichier, I.largeurPour(img.genre)));
      noter("commons", r);
      const info = L.commonsImage(r.corps);
      if (!info || !info.vignette) { await fin({ etat: r.statut === 200 ? "refusee" : "echec", erreur: r.statut === 200 ? "fichier introuvable" : "HTTP " + r.statut }); continue; }
      if (!I.licenceLibre(info.credit)) { await fin({ etat: "refusee", erreur: "licence non libre : " + info.credit.licence, credit: info.credit }); continue; }
      const b = await chercher(info.vignette, { binaire: true, delai: 10000 });
      if (!b.octets) { await fin({ etat: "echec", erreur: "vignette HTTP " + b.statut }); continue; }
      const src = await Image.decode(b.octets);
      const px = I.vignette(src.bitmap, src.width, src.height, img.genre);
      const out = new Image(I.COTE, I.COTE);
      let mime = img.genre === "photo" ? "image/jpeg" : "image/png", octets: Uint8Array;
      if (mime === "image/png") {
        out.bitmap.set(px); octets = await out.encode(3);
        if (octets.length > I.MAX_OCTETS) { out.bitmap.set(I.aplatir(px)); octets = await out.encodeJPEG(80); mime = "image/jpeg"; }
      } else {
        out.bitmap.set(I.aplatir(px)); octets = await out.encodeJPEG(80);
        if (octets.length > I.MAX_OCTETS) octets = await out.encodeJPEG(65);
      }
      const sha = await sha256(octets), chemin = I.nomFichier(sha, mime);
      const up = await base.storage.from("marches").upload(chemin, octets, { contentType: mime, upsert: true, cacheControl: "31536000" });
      if (up.error) { await fin({ etat: "echec", erreur: "stockage : " + up.error.message }); continue; }
      await fin({ etat: "copiee", chemin, mime, largeur: I.COTE, hauteur: I.COTE, octets: octets.length, sha256: sha, credit: info.credit });
    } catch (e) {
      await fin({ etat: "echec", erreur: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  const { error: e2 } = await base.rpc("srv_sport_maj", { p: { matchs: [], sources: [...bilan.values()] } });
  if (e2) crier("bilan :", e2.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "methode" }, 405);
  if (!(await jetonOk(req.headers.get("x-wm-jeton") ?? ""))) return json({ ok: false, code: "jeton" }, 401);
  // deno-lint-ignore no-explicit-any
  let corps: any = {};
  try { corps = await req.json(); } catch (_) { /* corps vide */ }
  const taches = (Array.isArray(corps?.taches) ? corps.taches : [corps?.tache || "jour"]).filter((t: string) => ["jour", "images", "sport"].includes(t));
  const cles = Object.fromEntries(SECRETS.map(n => [n, Deno.env.get(n) ?? ""]));
  bilan.clear();
  for (const n of SECRETS) bilan.set(SOURCE_DU_SECRET[n], { id: SOURCE_DU_SECRET[n], appels: 0, ok: false, cle: !!cles[n] });
  const travail = (async () => {
    const { data: cfg, error } = await base.rpc("srv_quotidien_config");
    if (error || !cfg) { crier("configuration :", error?.message); return; }
    for (const t of taches) {
      try {
        if (t === "jour" && cfg.actif) await tacheJour(cfg, cles);
        else if (t === "sport") await tacheSport(cfg, cles);
        else if (t === "images") await tacheImages();
      } catch (e) { crier("tâche", t, ":", (e as Error)?.message ?? e); }
    }
    console.log(JSON.stringify({ quotidien: taches, sources: [...bilan.values()].filter(b => b.appels).map(b => `${b.id}:${b.appels}${b.ok ? "" : "!"}`) }));
  })();
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(travail);
  return json({ ok: true, taches }, 202);
});
