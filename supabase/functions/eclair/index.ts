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
// Duels sur une manche éclair (prix et frais du moment : moteur ; manche : horloge de la base ; issue : moteur) :
//   { action: 'duel_create', gid, side, stake, opp, key }  →  { ok: true, now, me, ev, duel, duels }
//   { action: 'duel_accept', id | code }                    →  { ok: true, now, me, ev, duel, duels }
//   { action: 'duel_settle' }                               →  { ok: true, now, me, ev, duels, regles }
// Refus : { ok: false, code } avec un code stable (mises_fermees, deja_mise, solde_insuffisant, pause, be_plein…).
// La fonction vérifie elle-même la session auprès du service d'authentification (getUser) : verify_jwt est désactivé.
//
// Cours réels (lot 7, interrupteur wm.reglages « eclair.cours_reels », éteint par défaut) : la base fige le mode de chaque
// jeu pour chaque manche (réel, en pause, simulé, retiré) et garde les fixations ; srv_eclair_contexte les rend. Une manche
// réelle se calcule avec le moteur v2 (etatReel, prixReel, reglerReel) sur ces fixations ; une manche simulée, comme avant.
// La base refuse une mise calculée dans un autre mode que celui figé (« mode_change » : la fonction recommence une fois) et
// toute mise sur un jeu en pause (« jeu_en_pause »). Une manche réelle annulée (fixation absente) rend les mises :
// srv_eclair_rembourser ; le règlement renvoie alors aussi « rembourses ». La Série et Blitz Royale ne changent pas.
//
// Nouveau front, cours réels PAR CLIENT (partie D, v6) : l'interrupteur reste éteint, la base fige toutes les manches
// « simulées » et le site en ligne (l'ancien front) joue comme avant. Le nouveau front envoie
//   { action: 'bet', gid, side, amt, key, reel: true }  →  { ok: true, now, me, ev, mise, reel: true }
// pour une manche qu'il joue sur les vrais cours : la règle du module pur moteur-reel.js (copie conforme de
// js/moteur-reel.js) dit si elle est réelle (fixation r − 2 « ok », écrite avant le début de la manche) ; sinon refus
// « jeu_en_pause ». La mise est calculée par le moteur v2 (etatReel, prixReel, beMultReel, beMaxReel) et passe par
// srv_eclair_miser_reelle (srv_eclair_miser inchangée, puis la marque, dans la même transaction). Au règlement, les mises
// marquées (srv_eclair_reelles) se règlent par reglerReel sur les fixations ; manche annulée → srv_eclair_rembourser_reelles
// (« rembourses »). Une mise sans marque suit exactement le chemin d'avant.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import "./moteur-eclair.js";
import "./moteur-reel.js";

// deno-lint-ignore no-explicit-any
const ME = (globalThis as any).MoteurEclair;
// deno-lint-ignore no-explicit-any
const MR = (globalThis as any).MoteurReel;

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

// L'interrupteur des cours réels, vu au dernier contexte : gardé 30 s en mémoire pour ne pas ajouter d'appel à chaque mise
// tant qu'il est éteint (sans risque : la base refuse une mise calculée dans un mode qui n'est pas celui de la manche).
let reelsVu = false, reelsJusqua = 0;
const reelsPossibles = () => reelsVu || Date.now() > reelsJusqua;
// Contextes de manches { 'jeu:manche': { mode, raison, P, F, attente } } (lecture ; la base fige d'abord les modes à venir).
// deno-lint-ignore no-explicit-any
async function contextes(admin: any, items: { jeu: string; manche: number }[]): Promise<Record<string, any>> {
  if (!items.length) return {};
  const { data, error } = await admin.rpc("srv_eclair_contexte", { p: { items: items.slice(0, 60) } });
  if (error) throw error;
  reelsVu = !!data?.cours_reels; reelsJusqua = Date.now() + 30000;
  // deno-lint-ignore no-explicit-any
  return Object.fromEntries((data?.items ?? []).map((c: any) => [c.jeu + ":" + c.r, c]));
}
// Nouveau front : contextes avec les fixations de l'actif quel que soit le mode figé (p.items, une mise), ou les mises
// marquées parmi des mises ouvertes (p.ids, un règlement) — srv_eclair_reelles.
// deno-lint-ignore no-explicit-any
async function reelles(admin: any, joueur: string, p: Record<string, unknown>): Promise<any> {
  const { data, error } = await admin.rpc("srv_eclair_reelles", { p_user: joueur, p });
  if (error) throw error;
  return data;
}
const enPause = (c: { mode?: string } | undefined) => !!c && (c.mode === "pause" || c.mode === "retire");
// L'état de la cagnotte d'un jeu à un tick, dans le mode de la manche : { g, px } (cours réels : moteur v2).
// deno-lint-ignore no-explicit-any
const etatDe = (d: any, manche: number, tk: number, c: any) =>
  c && c.mode === "reel" ? (() => { const g = ME.etatReel(d, manche, tk, null, c); return { g, px: ME.prixReel(d, g, c.P), reel: true }; })()
    : (() => { const g = ME.etat(d, manche, tk); return { g, px: ME.prix(d, g), reel: false }; })();

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
    // Nouveau front, cours réels par client (voir l'en-tête). Interrupteur allumé et manche figée réelle : le chemin d'avant
    // s'en charge (paramètres de la base, sans marque).
    if (corps.reel === true) {
      const t = Date.now();
      if (!ME.ouvert(t)) return refus(req, "mises_fermees");
      const manche = ME.round(t), tk = ME.tick(t);
      // deno-lint-ignore no-explicit-any
      let item: any = null;
      try { item = ((await reelles(admin, joueur, { items: [{ jeu: d.id, manche }] }))?.items ?? [])[0] ?? null; }
      catch (e) { const k = codeDe((e as Error)?.message); if (k === "serveur") console.error("mise réelle, contexte :", (e as Error)?.message ?? e); return refus(req, k, k === "serveur" ? 500 : 400); }
      if (!item || item.mode !== "reel") {
        if (enPause(item)) return refus(req, "jeu_en_pause");
        const cc = MR.contexteMise(d.id, manche, item);
        if (!cc) return refus(req, "jeu_en_pause");                                     // pas réelle pour le client : en pause
        const g = ME.etatReel(d, manche, tk, null, cc), px = ME.prixReel(d, g, cc.P);
        const p = {
          manche, jeu: d.id, cote, amt, tk, key: corps.key ?? null, mode: "simule",        // le mode figé par la base (interrupteur éteint)
          fee: ME.frais(d, g, cote, amt, false), fee_remise: ME.frais(d, g, cote, amt, true),
          mult: ME.beMultReel(d, cc.P), prix: cote === "oui" ? px.o : cote === "non" ? px.n : px.e, be_max: ME.beMaxReel(g, d, cc.P),
        };
        const { data, error } = await admin.rpc("srv_eclair_miser_reelle", { p_user: joueur, p });
        if (error) { const k = codeDe(error.message); if (k === "serveur") console.error("mise réelle :", error.message); return refus(req, k, k === "serveur" ? 500 : 400); }
        return json(req, { ok: true, now: Date.now(), ...data });
      }
    }
    // l'heure du serveur décide de la manche et du tick ; les mises ne sont ouvertes que 30 secondes
    // deno-lint-ignore no-explicit-any
    const miser = async (force: boolean): Promise<{ data?: any; error?: any; non?: Response }> => {
      const t = Date.now();
      if (!ME.ouvert(t)) return { non: refus(req, "mises_fermees") };
      const manche = ME.round(t), tk = ME.tick(t);
      // deno-lint-ignore no-explicit-any
      let c: any = null;
      if (force || reelsPossibles()) {
        try { c = (await contextes(admin, [{ jeu: d.id, manche }]))[d.id + ":" + manche] ?? null; }
        catch (e) { console.error("mise, contexte :", (e as Error)?.message ?? e); return { non: refus(req, "serveur", 500) }; }
      }
      if (enPause(c)) return { non: refus(req, "jeu_en_pause") };
      const { g, px, reel } = etatDe(d, manche, tk, c);
      const p = {
        manche, jeu: d.id, cote, amt, tk, key: corps.key ?? null, mode: reel ? "reel" : "simule",
        fee: ME.frais(d, g, cote, amt, false), fee_remise: ME.frais(d, g, cote, amt, true),
        mult: reel ? ME.beMultReel(d, c.P) : ME.beMult(d), prix: cote === "oui" ? px.o : cote === "non" ? px.n : px.e,
        be_max: reel ? ME.beMaxReel(g, d, c.P) : ME.beMax(g, d),
      };
      return await admin.rpc("srv_eclair_miser", { p_user: joueur, p });
    };
    let r = await miser(false);
    if (r.error && codeDe(r.error.message) === "mode_change") r = await miser(true);   // l'interrupteur vient de changer : on recalcule
    if (r.non) return r.non;
    const { data, error } = r;
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
    // le mode de chaque manche (et, réelle, ses fixations) : la base le dit ; 60 manches au plus par appel, le reste au suivant
    // deno-lint-ignore no-explicit-any
    const toutes = (o?.mises ?? []).filter((m: any) => ME.JEUX[m.g]);
    // les mises du nouveau front (marquées « reel ») et leur contexte, fixations comprises ; les autres : comme avant
    // deno-lint-ignore no-explicit-any
    let marques: Record<string, any> = {}, grace = MR.GRACE_S;
    if (toutes.length) {
      try {
        // deno-lint-ignore no-explicit-any
        const rr = await reelles(admin, joueur, { ids: toutes.map((m: any) => m.id) });
        grace = Number(rr?.grace_s) > 0 ? Number(rr.grace_s) : MR.GRACE_S;
        // deno-lint-ignore no-explicit-any
        marques = Object.fromEntries((rr?.mises ?? []).map((x: any) => [String(x.id), x]));
      } catch (e) { console.error("règlement, mises réelles :", (e as Error)?.message ?? e); return refus(req, "serveur", 500); }
    }
    // deno-lint-ignore no-explicit-any
    const items = [...new Map(toutes.filter((m: any) => !marques[String(m.id)]).map((m: any) => [m.g + ":" + m.r, { jeu: m.g, manche: Number(m.r) }])).values()].slice(0, 60) as { jeu: string; manche: number }[];
    // deno-lint-ignore no-explicit-any
    let ctx: Record<string, any> = {};
    try { ctx = await contextes(admin, items); }
    catch (e) { console.error("règlement, contextes :", (e as Error)?.message ?? e); return refus(req, "serveur", 500); }
    const res: unknown[] = [], remb: unknown[] = [], rembR: unknown[] = [];
    for (const m of toutes) {
      const mk = marques[String(m.id)];
      if (mk) {                                                                // nouveau front : réglée sur les fixations
        const d = ME.JEUX[m.g], r = Number(m.r), my = { s: m.s, amt: Number(m.amt), net: Number(m.net), mult: Number(m.mult), tk: Number(m.tk) };
        const cc = MR.ctx(m.g, r, mk.Fc ?? {});
        if (MR.attente(r, cc.F, Date.now(), grace)) continue;                  // fin pas encore fixée : la mise attend
        const x = ME.reglerReel(d, r, my, cc);
        if (x.annule) rembR.push({ id: m.id, motif: x.motif }); else res.push({ id: m.id, win: x.win, pay: x.pay, part: x.part });
        continue;
      }
      const c = ctx[m.g + ":" + m.r];
      if (!c) continue;                                                        // au-delà des 60 : au prochain règlement
      const d = ME.JEUX[m.g], my = { s: m.s, amt: Number(m.amt), net: Number(m.net), mult: Number(m.mult), tk: Number(m.tk) };
      if (c.mode === "reel") {
        if (c.attente) continue;                                               // fin pas encore fixée : la mise attend
        const x = ME.reglerReel(d, Number(m.r), my, c);
        if (x.annule) remb.push({ id: m.id, motif: x.motif }); else res.push({ id: m.id, win: x.win, pay: x.pay, part: x.part });
      } else {
        const x = ME.regler(d, Number(m.r), my);
        res.push({ id: m.id, win: x.win, pay: x.pay, part: x.part });
      }
    }
    const { data, error } = await admin.rpc("srv_eclair_regler", { p_user: joueur, p_res: res });
    if (error) { const c = codeDe(error.message); if (c === "serveur") console.error("règlement :", error.message); return refus(req, c, c === "serveur" ? 500 : 400); }
    if (!remb.length && !rembR.length) return json(req, { ok: true, now: Date.now(), ...data, rembourses: [] });
    // les mises rendues : celles d'une manche réelle figée par la base (srv_eclair_rembourser), puis celles du nouveau front
    // deno-lint-ignore no-explicit-any
    let rep: any = { ...data }, rembourses: unknown[] = [], ev: unknown[] = [...(data?.ev ?? [])];
    for (const [nom, liste] of [["srv_eclair_rembourser", remb], ["srv_eclair_rembourser_reelles", rembR]] as [string, unknown[]][]) {
      if (!liste.length) continue;
      const { data: b, error: e3 } = await admin.rpc(nom, { p_user: joueur, p_res: liste });
      if (e3) { console.error("remboursement :", e3.message); continue; }
      rep = { ...rep, ...b }; rembourses = rembourses.concat(b?.rembourses ?? []); ev = ev.concat(b?.ev ?? []);
    }
    return json(req, { ok: true, now: Date.now(), ...rep, rembourses, ev, regles: data?.regles ?? [], hist: data?.hist ?? [] });
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

  // ── Duels sur une manche éclair ──
  // Le prix d'un camp est celui du jeu à l'instant de l'appel (état de la manche en cours), comme à l'écran. La manche du
  // duel est fixée par l'horloge de la base ; l'issue vient du moteur, une fois la manche terminée.
  // Cours réels : le prix du moment vient de la cagnotte réelle si la manche en cours est réelle ; l'issue du duel suit le
  // mode de SA manche (figé par la base), réglée sur les fixations ; manche réelle annulée → issue 2 (mises rendues).
  // deno-lint-ignore no-explicit-any
  const coteDuJeu = async (d: any, plus: number[] = []) => {
    const t = Date.now(), r = ME.round(t);
    // deno-lint-ignore no-explicit-any
    const ctx: Record<string, any> = reelsPossibles() ? await contextes(admin, [r, ...plus.map((k) => r + k)].map((manche) => ({ jeu: d.id, manche }))) : {};
    return { ...etatDe(d, r, ME.tick(t), ctx[d.id + ":" + r]), r, ms: t - ME.t0(r), ctx };
  };

  if (corps?.action === "duel_create") {
    const d = ME.JEUX[String(corps.gid ?? "")], camp = String(corps.side ?? ""), mise = Math.round(Number(corps.stake) * 100) / 100;
    if (!d) return refus(req, "jeu_inconnu");
    if (!["oui", "non"].includes(camp)) return refus(req, "cote_invalide");
    if (!(mise >= 5) || !(mise <= 5000)) return refus(req, "montant_invalide");
    let cj;
    try { cj = await coteDuJeu(d, [1]); } catch (e) { console.error("duel, contexte :", (e as Error)?.message ?? e); return refus(req, "serveur", 500); }
    const { g, px } = cj;
    // la manche du duel : celle en cours, ou la suivante s'il reste moins de dix secondes de mises (la base tranche)
    const modeDe = (manche: number) => (cj.ctx[d.id + ":" + manche]?.mode === "reel" ? "reel" : "simule");
    const prevue = cj.ms >= 20000 ? cj.r + 1 : cj.r;
    if (enPause(cj.ctx[d.id + ":" + prevue])) return refus(req, "jeu_en_pause");
    const creer = (mode: string) => admin.rpc("srv_duel_eclair_creer", { p_user: joueur, p: {
      gid: d.id, side: camp, stake: mise, opp: corps.opp ?? null, key: corps.key ?? null, mode,
      prix: camp === "oui" ? px.o : px.n, frais: ME.frais(d, g, camp, mise, false), frais_remise: ME.frais(d, g, camp, mise, true),
    } });
    let rc = await creer(modeDe(prevue));
    if (rc.error && codeDe(rc.error.message) === "mode_change") rc = await creer(modeDe(prevue === cj.r ? cj.r + 1 : cj.r));   // l'autre manche
    if (rc.error) { const c = codeDe(rc.error.message); if (c === "serveur") console.error("duel éclair, création :", rc.error.message); return refus(req, c, c === "serveur" ? 500 : 400); }
    return json(req, { ok: true, now: Date.now(), ...rc.data });
  }

  if (corps?.action === "duel_accept") {
    const l = await appel("srv_duel_eclair_lire", { p_user: joueur, p: { id: corps.id ?? null, code: corps.code ?? null } }, "duel éclair, lecture");
    if (l.non) return l.non;
    const d = ME.JEUX[String(l.data?.gid ?? "")];
    if (!d) return refus(req, "jeu_inconnu");
    let cj;
    try { cj = await coteDuJeu(d); } catch (e) { console.error("duel, contexte :", (e as Error)?.message ?? e); return refus(req, "serveur", 500); }
    const { g, px } = cj;
    const prix = l.data.side === "oui" ? px.o : px.n, autre = Math.round(Number(l.data.stake) * 100 / prix * (100 - prix)) / 100, camp = l.data.side === "oui" ? "non" : "oui";
    const r = await appel("srv_duel_eclair_accepter", { p_user: joueur, p: {
      id: l.data.id, prix, frais: ME.frais(d, g, camp, autre, false), frais_remise: ME.frais(d, g, camp, autre, true),
    } }, "duel éclair, acceptation");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

  if (corps?.action === "duel_settle") {
    const o = await appel("srv_duel_eclair_ouverts", { p_user: joueur }, "duels éclair à régler");
    if (o.non) return o.non;
    // deno-lint-ignore no-explicit-any
    const duels = (o.data?.duels ?? []).filter((x: any) => ME.JEUX[x.gid]);
    // deno-lint-ignore no-explicit-any
    let ctx: Record<string, any> = {};
    // deno-lint-ignore no-explicit-any
    try { ctx = await contextes(admin, [...new Map(duels.map((x: any) => [x.gid + ":" + x.round, { jeu: x.gid, manche: Number(x.round) }])).values()] as { jeu: string; manche: number }[]); }
    catch (e) { console.error("duels, contextes :", (e as Error)?.message ?? e); return refus(req, "serveur", 500); }
    const res: unknown[] = [];
    for (const x of duels) {
      const c = ctx[x.gid + ":" + x.round], d = ME.JEUX[x.gid], r = Number(x.round);
      if (!c) continue;
      if (c.mode === "reel") {
        if (c.attente) continue;                                               // fin pas encore fixée : le duel attend
        const out = ME.issueReelle(d, c.F[r], c.F[r + 1], c.P);
        res.push({ id: x.id, out: out === null ? 2 : out });                    // manche annulée : les deux mises sont rendues
      } else res.push({ id: x.id, out: ME.issue(d, r) });
    }
    const r = await appel("srv_duel_eclair_regler", { p_user: joueur, p_res: res }, "duels éclair, règlement");
    return r.non ?? json(req, { ok: true, now: Date.now(), ...r.data });
  }

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
