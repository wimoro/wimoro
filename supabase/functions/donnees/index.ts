// Collecte des données réelles : la fonction va chercher les cours chez les sources, et la base les garde et les sert.
//
// Appelée UNIQUEMENT par la tâche planifiée wm-donnees (chaque minute), par pg_net, avec l'en-tête x-wm-jeton : le jeton
// est créé et gardé par la base dans Vault ; la fonction le fait vérifier par srv_jeton_ok (clé de service). Sans le bon
// jeton : refus 401, sans aucun travail. verify_jwt est désactivé (la tâche n'a pas de session de joueur).
//
//   POST { tache: 'boucle' }  →  202 tout de suite ; la boucle tourne ensuite environ 55 s (EdgeRuntime.waitUntil) :
//                                 un passage toutes les 3 s (cascade.js), chaque passage écrit par srv_cours_ingerer ;
//                                 en même temps, les fixations du pari éclair à chaque frontière de manche (fixations.js),
//                                 écrites par srv_eclair_fixer (lot 7) — dans la même invocation, sans appel de plus.
//   POST { tache: 'passe' }   →  un seul passage, rendu dans la réponse (diagnostic de l'équipe, même jeton).
//
// Les clés des sources sont lues dans les secrets des Edge Functions (FINNHUB_API_KEY, EODHD_API_TOKEN…) ; une clé absente
// rend seulement sa source inactive (la base l'affiche), et la cascade passe à la suivante. Leurs valeurs ne sont jamais
// écrites dans un journal ni envoyées à la base. Identifiant honnête : « WimoroBot/1.0 (https://wimoro.com) ».
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { UA, controler, etatInitial, passe, presenceDesCles, sansSecret } from "./cascade.js";
import { calendrier, essayer } from "./fixations.js";

const SECRETS = ["FINNHUB_API_KEY", "TWELVEDATA_API_KEY", "EODHD_API_TOKEN", "EXCHANGERATE_DEV_API_KEY", "GOLDPRICE_DEV_API_KEY", "EIA_API_KEY", "COINGECKO_API_KEY"];

// Clé de service : les nouvelles clés (dictionnaire JSON) si elles existent, sinon l'ancienne.
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

// Journal sobre : 100 événements par 10 s au plus sur l'offre gratuite. Une ligne par boucle, et les erreurs espacées.
let dernierCri = 0;
const crier = (...x: unknown[]) => { const t = Date.now(); if (t - dernierCri > 10000) { dernierCri = t; console.error(...x); } };

// Le jeton accepté est gardé 10 minutes en mémoire (une vérification en base par réveil au plus).
let jetonVu = "", jetonJusqua = 0;
async function jetonOk(j: string): Promise<boolean> {
  if (j.length < 32 || j.length > 200) return false;
  if (j === jetonVu && Date.now() < jetonJusqua) return true;
  const { data, error } = await base.rpc("srv_jeton_ok", { p_jeton: j });
  if (error) { crier("jeton :", error.message); return false; }
  if (data === true) { jetonVu = j; jetonJusqua = Date.now() + 600000; return true; }
  return false;
}

// Un appel à une source : délai borné, identifiant honnête, jamais d'exception (statut 0 : réseau ou délai dépassé).
// deno-lint-ignore no-explicit-any
async function chercher(url: string, o: { entetes?: Record<string, string>; texte?: boolean; delai?: number } = {}): Promise<any> {
  const t0 = Date.now();
  try {
    const rep = await fetch(url, {
      headers: { "User-Agent": UA, Accept: o.texte ? "text/csv, text/plain" : "application/json", ...(o.entetes ?? {}) },
      signal: AbortSignal.timeout(o.delai ?? 5000),
    });
    const brut = await rep.text();
    let corps: unknown = null;
    if (!o.texte && rep.ok) { try { corps = JSON.parse(brut); } catch (_) { corps = undefined; } }
    return { statut: rep.status, corps, texte: o.texte ? brut : null, ms: Date.now() - t0, retryAfter: Number(rep.headers.get("retry-after")) || 0 };
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const nom = (e as any)?.name;
    return { statut: 0, erreur: nom === "TimeoutError" ? "delai" : "reseau", ms: Date.now() - t0, url: sansSecret(url) };
  }
}

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));
const cles = () => Object.fromEntries(SECRETS.map((n) => [n, Deno.env.get(n) ?? ""]));

// deno-lint-ignore no-explicit-any
async function ingerer(p: any) {
  const { error } = await base.rpc("srv_cours_ingerer", { p });
  if (error) crier("ingestion :", error.message);
}

// Les fixations du pari éclair pendant la boucle : chaque essai à son heure (calendrier), écrit dès qu'il est prêt.
// deno-lint-ignore no-explicit-any
async function fixations(etat: any, porteur: string, fin: number) {
  const { data: cfgE, error } = await base.rpc("srv_eclair_config");
  if (error || !cfgE) { crier("éclair, configuration :", error?.message); return { essais: 0, ecrites: 0 }; }
  const acquis = {}, finies = new Set<string>();
  let essais = 0, ecrites = 0;
  for (const t of calendrier(cfgE, Date.now(), fin - 5000)) {
    await dormir(t.at - Date.now());
    if (Date.now() > fin - 4000) break;                                          // un essai (4 s au plus) finit avant le bail rendu
    // deno-lint-ignore no-explicit-any
    const actifs = cfgE.actifs.filter((a: any) => t.actifs.includes(a.id) && !finies.has(t.m + ":" + a.id));
    if (!actifs.length) continue;
    try {
      const r = await essayer(etat, t, actifs, acquis, Date.now(), chercher);
      essais++;
      const ids = Object.keys(r.ecrire);
      if (ids.length) {
        const { data, error: ef } = await base.rpc("srv_eclair_fixer", { p: { manche: t.m, actifs: r.ecrire } });
        if (ef && /trop_tard/.test(ef.message)) for (const id of ids) finies.add(t.m + ":" + id);   // délai écoulé : la base s'en charge
        else if (ef) { if (!/trop_tot/.test(ef.message)) crier("éclair, fixation :", ef.message); }   // trop tôt (horloges) : essai suivant
        else { for (const id of ids) finies.add(t.m + ":" + id); ecrites += (data?.ecrits ?? []).length; }
      }
      if (r.sources.length) await ingerer({ porteur, cours: [], sources: r.sources });
    } catch (e) {
      crier("éclair, essai :", String((e as Error)?.message ?? e));
    }
  }
  return { essais, ecrites };
}

// Une boucle : bail (une seule à la fois), configuration, puis un passage toutes les `cadence_s` secondes jusqu'à la fin.
async function boucle(unSeul = false) {
  const porteur = crypto.randomUUID(), debut = Date.now();
  const { data: bail, error: eb } = await base.rpc("srv_donnees_bail", { p_porteur: porteur, p_duree_s: 70 });
  if (eb) { crier("bail :", eb.message); return { ok: false, code: "bail" }; }
  if (bail !== true) return { ok: true, deja: true };                     // une autre boucle tourne : rien à faire
  const { data: cfg, error: ec } = await base.rpc("srv_donnees_config");
  if (ec || !cfg) { crier("configuration :", ec?.message); return { ok: false, code: "config" }; }
  if (!cfg.reglages?.actif) { await base.rpc("srv_donnees_bail", { p_porteur: porteur, p_duree_s: 0 }); return { ok: true, coupe: true }; }
  const etat = etatInitial(cfg, cles(), Date.now());
  const fin = debut + Math.min(110, Math.max(20, Number(cfg.reglages.boucle_s) || 55)) * 1000;
  const cadence = Math.min(10, Math.max(2, Number(cfg.reglages.cadence_s) || 3)) * 1000;
  let passes = 0, appels = 0, erreurs = 0, premier = true;
  // deno-lint-ignore no-explicit-any
  let dernier: any = null;
  const eclair = unSeul ? Promise.resolve(null) : fixations(etat, porteur, fin).catch((e) => { crier("éclair :", String(e?.message ?? e)); return null; });
  while (Date.now() < fin) {
    const t = Date.now();
    try {
      const r = await passe(etat, t, chercher);
      const c = await controler(etat, t, chercher);
      const sources = [...(premier ? presenceDesCles(etat) : []), ...r.sources, ...(c ? [c.source] : [])];
      premier = false;
      passes++; appels += r.sources.reduce((n: number, s: { appels: number }) => n + s.appels, 0);
      erreurs += r.sources.reduce((n: number, s: { err: number }) => n + s.err, 0);
      if (r.cours.length || sources.length || c) await ingerer({ porteur, cours: r.cours, sources, ...(c?.controle ? { controle: c.controle } : {}) });
      dernier = { cours: r.cours.length, manquants: r.manquants, sources: r.sources };
    } catch (e) {
      crier("passage :", String((e as Error)?.message ?? e));
    }
    if (unSeul) break;
    await dormir(Math.min(cadence - (Date.now() - t), fin - Date.now()));
  }
  const fix = await eclair;                                                    // ses essais s'arrêtent à `fin`, avant le bail rendu
  await base.rpc("srv_donnees_bail", { p_porteur: porteur, p_duree_s: 0 });
  console.log(JSON.stringify({ boucle: { passes, appels, erreurs, ms: Date.now() - debut, eclair: fix } }));
  return { ok: true, passes, appels, erreurs, dernier };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "methode" }, 405);
  const jeton = req.headers.get("x-wm-jeton") ?? "";
  if (!(await jetonOk(jeton))) return json({ ok: false, code: "jeton" }, 401);
  // deno-lint-ignore no-explicit-any
  let corps: any = {};
  try { corps = await req.json(); } catch (_) { /* corps vide */ }
  if (corps?.tache === "boucle") {
    EdgeRuntime.waitUntil(boucle().catch((e) => crier("boucle :", String(e?.message ?? e))));
    return json({ ok: true, lance: true }, 202);
  }
  if (corps?.tache === "passe") return json(await boucle(true));
  return json({ ok: false, code: "requete" }, 400);
});
