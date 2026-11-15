// Connexion par pseudo.
//
// Supabase Auth ne sait ouvrir une session qu'avec un e-mail. Pour qu'un joueur puisse se connecter avec son
// pseudo SANS que son e-mail soit jamais envoyé au navigateur, la résolution pseudo → e-mail se fait ici,
// côté serveur, puis la session est ouverte auprès du service d'authentification et renvoyée au client.
//
// Appel : POST { pseudo, mot_de_passe }  →  200 { ok: true, access_token, refresh_token }
//                                         →  401 { ok: false, code: 'identifiants' }       (pseudo inconnu OU mauvais mot de passe)
//                                         →  429 { ok: false, code: 'trop_de_tentatives' } (10 essais par pseudo en 10 minutes)
// La fonction fait sa propre authentification (c'est une page de connexion) : verify_jwt est désactivé.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

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
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Clés : les nouvelles (dictionnaires JSON) si elles existent, sinon les anciennes.
const cle = (nouvelles: string, ancienne: string): string => {
  try {
    const d = JSON.parse(Deno.env.get(nouvelles) ?? "{}");
    if (d && typeof d.default === "string") return d.default;
  } catch (_) { /* ancienne clé */ }
  return Deno.env.get(ancienne) ?? "";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { ok: false, code: "methode" }, 405);

  let corps: { pseudo?: unknown; mot_de_passe?: unknown };
  try { corps = await req.json(); } catch (_) { return json(req, { ok: false, code: "requete" }, 400); }
  const pseudo = String(corps?.pseudo ?? "").trim();
  const motDePasse = String(corps?.mot_de_passe ?? "");
  if (!/^[A-Za-z0-9._]{3,20}$/.test(pseudo) || motDePasse.length < 8 || motDePasse.length > 200) {
    return json(req, { ok: false, code: "identifiants" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const secrete = cle("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const publique = cle("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const admin = createClient(url, secrete, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: email, error } = await admin.rpc("srv_login_lookup", { p_pseudo: pseudo });
  if (error) {
    if (/trop_de_tentatives/.test(error.message ?? "")) return json(req, { ok: false, code: "trop_de_tentatives" }, 429);
    console.error("recherche du pseudo :", error.message);
    return json(req, { ok: false, code: "serveur" }, 500);
  }
  if (!email) { await pause(350); return json(req, { ok: false, code: "identifiants" }, 401); }

  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publique, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: motDePasse }),
  });
  const s = await r.json().catch(() => ({}));
  if (!r.ok || !s.access_token) {
    if (r.status === 429) return json(req, { ok: false, code: "trop_de_tentatives" }, 429);
    await pause(350);
    return json(req, { ok: false, code: "identifiants" }, 401);
  }
  // Ni l'e-mail ni le profil ne sont renvoyés : seulement de quoi ouvrir la session.
  return json(req, { ok: true, access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in });
});
