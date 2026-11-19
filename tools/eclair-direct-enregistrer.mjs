// Enregistre des réponses réelles d'api_live et d'api_fixations (lecture seule, clé publique) pour les tests du pari
// éclair à cours réels (tests/eclair-direct.spec.mjs) : les tests les rejouent avec une horloge simulée, sans jamais
// appeler le vrai serveur. Usage : node tools/eclair-direct-enregistrer.mjs   →   tests/fixtures/eclair-direct/enregistrement.json
import fs from 'node:fs';
const BACK = 'https://brmwvxncyeypefsgiepf.supabase.co/rest/v1/rpc/', CLE = 'sb_publishable_iw7LMAYTnX_ETs-mj9sIPQ_pnSdgOd2';
const lire = async (nom, corps) => { const r = await fetch(BACK + nom, { method: 'POST', headers: { apikey: CLE, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }); if (!r.ok) throw new Error(nom + ' ' + r.status); return r.json(); };
const EPOCH = Date.UTC(2026, 10, 1), manche = t => Math.floor((t - EPOCH) / 45000) + 1;
// au milieu d'une manche : la fixation de son départ est écrite (3 à 4 s après la frontière)
for (;;) { const ms = (Date.now() - EPOCH) % 45000; if (ms > 9000 && ms < 30000) break; await new Promise(ok => setTimeout(ok, 1000)); }
const t = Date.now(), r = manche(t);
const jeux = ['btc', 'eth', 'sol', 'doge', 'vol', 'ndx', 'spx', 'nvda', 'tsla', 'gold'];
const fixations = {};
for (const j of jeux) fixations[j] = await lire('api_fixations', { p_jeu: j, p_de: r - 30, p_a: r });
const live = await lire('api_live', { p_serie: 'btc' });
fs.mkdirSync('tests/fixtures/eclair-direct', { recursive: true });
fs.writeFileSync('tests/fixtures/eclair-direct/enregistrement.json', JSON.stringify({ note: 'Réponses réelles d’api_live et d’api_fixations (production, lecture seule), enregistrées par tools/eclair-direct-enregistrer.mjs', t, r, live, fixations }, null, 1) + '\n');
console.log('enregistré : manche', r, new Date(t).toISOString(), 'fixations btc :', Object.keys(fixations.btc.F).length, 'courbe :', (live.serie || []).length, 'points');
