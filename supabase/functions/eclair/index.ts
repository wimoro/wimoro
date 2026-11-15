// Pari éclair : miser et régler, côté serveur.
//
// Le pari éclair est déterministe : la manche, les prix, la cagnotte et l'issue se déduisent de l'heure. Cette fonction
// exécute le MÊME moteur que le navigateur (moteur-eclair.js, copie conforme de js/moteur-eclair.js du site) avec
// l'horloge du serveur, puis écrit en base par des fonctions réservées à la clé de service (srv_eclair_…).
// Le joueur ne choisit donc ni la manche, ni ses frais, ni son gain.
//
// Appel (session du joueur obligatoire) : POST
//   { action: 'bet', gid, side, amt, key }  →  { ok: true, now, me, ev, mise }
//   { action: 'settle' }                    →  { ok: true, now, me, ev, regles, hist, eclair }
// Refus : { ok: false, code } avec un code stable (mises_fermees, deja_mise, solde_insuffisant, pause, be_plein…).
// La fonction vérifie elle-même la session auprès du service d'authentification (getUser) : verify_jwt est désactivé.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import "./moteur-eclair.js";

// deno-lint-ignore no-explicit-any
const ME = (globalThis as any).MoteurEclair;

const ORIGINES = [/^https:\/\/(www\.)?wimoro\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const cors = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINES.some((re) => re.test(o)) ? o : "https://wimoro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const json = (req: Request, corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors(req), "Content-Type": "application/json" } });
const refus = (req: Request, code: string, statut = 400) => json(req, { ok: false, code, now: Date.now() }, statut);

// Clés : les nouvelles (dictionnaires JSON) si elles existent, sinon les anciennes.
const cle = (nouvelles: string, ancienne: string): string => {
  try {
    const d = JSON.parse(Deno.env.get(nouvelles) ?? "{}");
    if (d && typeof d.default === "string") return d.default;
  } catch (_) { /* ancienne clé */ }
  return Deno.env.get(ancienne) ?? "";
};
// Une erreur levée par la base porte un code métier dans son message (« pause », « deja_mise »…).
const codeDe = (message: string | undefined) => /^[a-z][a-z0-9_]{2,40}$/.test(message ?? "") ? (message as string) : "serveur";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return refus(req, "methode", 405);

  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, cle("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: qui, error: errQui } = await admin.auth.getUser(jeton);
  if (errQui || !qui?.user) return refus(req, "session", 401);
  const joueur = qui.user.id;

  // deno-lint-ignore no-explicit-any
  let corps: any;
  try { corps = await req.json(); } catch (_) { return refus(req, "requete"); }

  if (corps?.action === "bet") {
    const d = ME.JEUX[String(corps.gid ?? "")];
    const cote = String(corps.side ?? "");
    const amt = Math.round(Number(corps.amt) * 100) / 100;
    if (!d) return refus(req, "jeu_inconnu");
    if (!["oui", "non", "be"].includes(cote)) return refus(req, "cote_invalide");
    if (!(amt >= 1) || !(amt <= 10000)) return refus(req, "montant_invalide");
    // l'heure du serveur décide de la manche et du tick ; les mises ne sont ouvertes que 30 secondes
    const t = Date.now();
    if (!ME.ouvert(t)) return refus(req, "mises_fermees");
    const manche = ME.round(t), tk = ME.tick(t);
    const g = ME.etat(d, manche, tk), px = ME.prix(d, g);
    const p = {
      manche, jeu: d.id, cote, amt, tk, key: corps.key ?? null,
      fee: ME.frais(d, g, cote, amt, false), fee_remise: ME.frais(d, g, cote, amt, true),
      mult: ME.beMult(d), prix: cote === "oui" ? px.o : cote === "non" ? px.n : px.e, be_max: ME.beMax(g, d),
    };
    const { data, error } = await admin.rpc("srv_eclair_miser", { p_user: joueur, p });
    if (error) {
      const c = codeDe(error.message);
      if (c === "serveur") console.error("mise :", error.message);
      return refus(req, c, c === "serveur" ? 500 : 400);
    }
    return json(req, { ok: true, now: Date.now(), ...data });
  }

  if (corps?.action === "settle") {
    const { data: o, error: e1 } = await admin.rpc("srv_eclair_ouvertes", { p_user: joueur });
    if (e1) { const c = codeDe(e1.message); if (c === "serveur") console.error("mises à régler :", e1.message); return refus(req, c, c === "serveur" ? 500 : 400); }
    // deno-lint-ignore no-explicit-any
    const res = (o?.mises ?? []).filter((m: any) => ME.JEUX[m.g]).map((m: any) => {
      const x = ME.regler(ME.JEUX[m.g], Number(m.r), { s: m.s, amt: Number(m.amt), net: Number(m.net), mult: Number(m.mult), tk: Number(m.tk) });
      return { id: m.id, win: x.win, pay: x.pay, part: x.part };
    });
    const { data, error } = await admin.rpc("srv_eclair_regler", { p_user: joueur, p_res: res });
    if (error) { const c = codeDe(error.message); if (c === "serveur") console.error("règlement :", error.message); return refus(req, c, c === "serveur" ? 500 : 400); }
    return json(req, { ok: true, now: Date.now(), ...data });
  }

  return refus(req, "requete");
});
