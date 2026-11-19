// Sonde de la recherche D1 (19/11/2026) : désactivée après usage.
//
// Version 1 (déployée le temps du test) : appelait une liste FIGÉE de 32 adresses de sources gratuites, en parallèle,
// avec un délai maximal de 8 s, depuis la région demandée par l'en-tête `x-region`, et rendait pour chacune le code HTTP,
// la durée et le début de la réponse. Les résultats et la liste des adresses sont dans docs/DONNEES.md, § 1.3.
// Version 2 (actuelle) : ne fait plus rien et répond 410, pour qu'aucun inconnu ne puisse la faire tourner en boucle.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ ok: false, code: "desactivee" }), { status: 410, headers: { "Content-Type": "application/json" } }));
