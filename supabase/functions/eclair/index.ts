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
// La Série (manches de 60 secondes jouées avec tout le stack, même moteur, même principe) :
//   { action: 'serie_start', gid, stake, key }  →  { ok: true, now, me, ev, serie }      (heure et prix de départ : serveur)
//   { action: 'serie_play', gid, choice }       →  { ok: true, now, me, ev, serie }      (cote et frais : serveur)
//   { action: 'serie_cash' }                    →  { ok: true, now, me, ev, serie, hist, regle }
//   { action: 'serie_settle' }                  →  { ok: true, now, me, ev, serie, hist, regles }  (issue : serveur)
// Blitz Royale (un tournoi par créneau de 15 minutes ; la salle simulée se déduit de l'heure, les vrais joueurs sont en base) :
//   { action: 'blitz_state', id }           →  { ok: true, now, blitz }               (vrais joueurs, ma situation, clôture)
//   { action: 'blitz_join', id, key }       →  { ok: true, now, me, ev, blitz }       (buy-in : serveur)
//   { action: 'blitz_choose', id, choice }  →  { ok: true, now, me, ev, blitz }       (manche et fenêtre de choix : serveur)
//   { action: 'blitz_rebuy', id }           →  { ok: true, now, me, ev, blitz }
//   { action: 'blitz_settle', id }          →  { ok: true, now, me, ev, blitz, hist } (issues, survivants simulés, jackpot : serveur)
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

  // ── La Série ──
  // deno-lint-ignore no-explicit-any
  const appel = async (nom: string, args: Record<string, unknown>, quoi: string): Promise<{ data?: any; non?: Response }> => {
    const { data, error } = await admin.rpc(nom, args);
    if (!error) return { data };
    const c = codeDe(error.message);
    if (c === "serveur") console.error("%s : %s", quoi, error.message);
    return { non: refus(req, c, c === "serveur" ? 500 : 400) };
  };
  const actif = (gid: unknown) => { const d = ME.JEUX[String(gid ?? "")]; return d && d.kind === "dir" ? d : null; };   // la Série se joue sur un actif à trajectoire

  if (corps?.action === "serie_start") {
    const d = actif(corps.gid);
    if (!d) return refus(req, "jeu_inconnu");
    const t = Date.now();                                    // l'heure du serveur fixe le début de la manche et son prix de départ
    const r = await appel("srv_serie_start", { p_user: joueur, p: { gid: d.id, stake: Number(corps.stake), t, p0: ME.prixAu(d, t), key: corps.key ?? null } }, "série, lancement");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "serie_play") {
    const d = actif(corps.gid), choix = String(corps.choice ?? "");
    if (!d) return refus(req, "jeu_inconnu");
    if (!["oui", "non", "be"].includes(choix)) return refus(req, "cote_invalide");
    const cotes = ME.serieCotes(d, Date.now());              // la cote du moment, pas celle que l'écran affichait
    const r = await appel("srv_serie_play", { p_user: joueur, p: { gid: d.id, choice: choix, mult: cotes[choix], taux: ME.taux(d.cat, false) * .5, taux_remise: ME.taux(d.cat, true) * .5 } }, "série, choix");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "serie_cash") {
    const r = await appel("srv_serie_cash", { p_user: joueur }, "série, encaissement");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "serie_settle") {
    // Règle la manche terminée, puis les suivantes si le joueur revient plus tard (sans choix : encaissement ou mise rendue).
    // deno-lint-ignore no-explicit-any
    let dernier: any = null; const regles: unknown[] = [], hist: unknown[] = [];
    for (let i = 0; i < 14; i++) {
      const l = await appel("srv_serie_lire", { p_user: joueur }, "série, lecture");
      if (l.non) return l.non;
      const s = l.data?.serie, d = s ? ME.JEUX[s.gid] : null;
      if (!s || !d || Date.now() < Number(s.rStart) + ME.SERIE_MS) { if (!dernier) dernier = s ? { serie: s } : {}; break; }   // rien à régler
      const x = ME.serieIssue(d, Number(s.rStart));
      const r = await appel("srv_serie_regler", { p_user: joueur, p: { id: s.id, step: s.step, out: x.out, p1: x.p1 } }, "série, règlement");
      if (r.non) return r.non;
      dernier = r.data;
      if (r.data?.regle) regles.push(r.data.regle);
      hist.push(...(r.data?.hist ?? []));
      if (r.data?.serie?.state !== "running") break;
    }
    return json(req, { ok: true, now: Date.now(), ...dernier, regles, hist });
  }

  // ── Blitz Royale ──
  const BZ = ME.BZ;
  const issues = (id: number, n: number): number[] => Array.from({ length: n }, (_, k) => ME.bzIssue(id, k + 1).out);
  const finies = (id: number, t: number) => { let n = 0; for (let i = 1; i <= BZ.ROUNDS; i++) if (t >= ME.bzManche(id, i).fin) n = i; return n; };
  // un Blitz dont on peut parler maintenant : celui du créneau, le précédent (à régler) ou le suivant (inscriptions)
  const blitz = (id: unknown, t: number, avant = 1, apres = 1) => { const n = Number(id), k = ME.bzId(t); return Number.isInteger(n) && n >= k - avant && n <= k + apres ? n : null; };

  if (corps?.action === "blitz_state") {
    const t = Date.now(), id = blitz(corps.id, t);
    if (id === null) return refus(req, "blitz_inconnu");
    const r = await appel("srv_blitz_etat", { p_user: joueur, p: { id, issues: issues(id, finies(id, t)) } }, "blitz, état");
    return r.non ?? json(req, { ok: true, ...r.data, now: Date.now() });
  }

  if (corps?.action === "blitz_join") {
    const t = Date.now(), id = blitz(corps.id, t, 0, 1);
    if (id === null) return refus(req, "blitz_inconnu");
    const r = await appel("srv_blitz_join", { p_user: joueur, p: { id, buyin: ME.bzBots(id).buyin, debut: ME.bzDebut(id), key: corps.key ?? null } }, "blitz, entrée");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "blitz_choose") {
    const t = Date.now(), id = blitz(corps.id, t, 0, 0);
    const choix = ({ oui: 1, non: 0, be: 2 } as Record<string, number>)[String(corps.choice ?? "")];
    if (id === null) return refus(req, "blitz_inconnu");
    if (choix === undefined) return refus(req, "cote_invalide");
    let manche = 0;                                          // la manche dont les choix sont ouverts à l'heure du serveur
    for (let i = 1; i <= BZ.ROUNDS; i++) { const m = ME.bzManche(id, i); if (t >= m.debut && t < m.debut + BZ.CHOICE_MS) manche = i; }
    if (!manche) return refus(req, "choix_fermes");
    const r = await appel("srv_blitz_choose", { p_user: joueur, p: { id, manche, debut: ME.bzManche(id, manche).debut, choice: choix, issues: issues(id, manche - 1) } }, "blitz, choix");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "blitz_rebuy") {
    const t = Date.now(), id = blitz(corps.id, t, 0, 0);
    if (id === null) return refus(req, "blitz_inconnu");
    const r = await appel("srv_blitz_rebuy", { p_user: joueur, p: { id, issue1: ME.bzIssue(id, 1).out, fin1: ME.bzManche(id, 1).fin, debut2: ME.bzManche(id, 2).debut, prix: BZ.REBUY } }, "blitz, rachat");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "blitz_settle") {
    const t = Date.now(), id = blitz(corps.id, t, 3000, 0);   // un Blitz passé (jusqu'à un mois) ou celui du créneau
    if (id === null) return refus(req, "blitz_inconnu");
    const b = ME.bzBots(id);
    const vivants = Array.from({ length: BZ.ROUNDS }, (_, k) => b.manches[k] ? b.manches[k].vivants : 0);
    const r = await appel("srv_blitz_clore", { p_user: joueur, p: { id, debut: ME.bzDebut(id), issues: issues(id, BZ.ROUNDS), bots: { n: b.n, buyin: b.buyin, vivants }, report: ME.bzReport(id) } }, "blitz, clôture");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  return refus(req, "requete");
});
