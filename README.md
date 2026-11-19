# Wimoro

Maquette de présentation d'une plateforme de marchés de prédiction : paris sur des marchés, paris éclair, chat, amis,
clans. **Tout l'argent est fictif** : dépôts, retraits et vérification d'identité (KYC) sont simulés, aucun prestataire
de paiement n'est branché.

- Site : <https://wimoro.com> (GitHub Pages, branche `main`)
- Back : Supabase (base Postgres, authentification, temps réel, une Edge Function)

## Deux modes

| Mode | Qui | Où vivent les données |
|---|---|---|
| **Démo** | visiteur, ou compte démo « User26 » | dans le navigateur ; les marchés, le chat et les joueurs sont simulés sur place |
| **Compte** | personne connectée avec un vrai compte | sur le serveur ; l'écran n'est que le reflet de ce que le serveur a enregistré |

On ne mélange jamais les deux : passer de l'un à l'autre recharge la page et repart d'un état propre.

## Lancer le site en local

Le site n'a besoin d'aucune installation ni d'aucune étape de construction : ce sont des fichiers statiques.

```bash
node tools/serve.mjs          # http://127.0.0.1:4173
```

## Tests

```bash
npm ci
npx playwright install chromium
npx playwright test           # environ 363 tests : back (base embarquée), écrans bureau et mobile
E2E=1 npx playwright test --project=e2e    # bout en bout contre le VRAI back (crée un compte de test jetable)
```

Les tests n'ont besoin d'aucun secret : le front est testé avec un faux serveur (`tests/helpers/fake-supabase.js`), le
back avec une base Postgres embarquée chargée avec les migrations du dépôt (`tests/sql/base.mjs`). Ils tournent
automatiquement sur chaque pull request (`.github/workflows/tests.yml`).

## Avant d'enregistrer une modification du front

```bash
node tools/version.mjs        # met à jour l'empreinte anti-cache des fichiers dans index.html
```

## Où trouver quoi

| Dossier | Contenu |
|---|---|
| `admin.html`, `js/admin.js` | le panel d'administration (réservé aux comptes administrateurs, contrôle fait par le serveur) |
| `index.html`, `css/`, `js/` | le site. `js/api.js` est le seul fichier qui parle à Supabase ; `js/serveur.js` porte le mode Compte |
| `css/` | `tokens.css` (couleurs, tailles, espacements, thème clair et sombre), `base.css` (socle et mise en page), `components.css` (boutons, champs, cartes, navigation), `screens.css` (écrans), `admin.css` (panel d'administration) |
| `js/refonte.js` | présentation de la refonte : sous-navigations (Communauté, Éclair), écran Portefeuille, profil, sections repliables |
| `js/i18n-4.js` | traductions (anglais et hébreu) des textes ajoutés par la refonte |
| `supabase/migrations/` | le back, versionné : photo de départ (`0000_baseline.sql`) puis une migration par changement |
| `supabase/functions/` | Edge Functions : connexion par pseudo ; pari éclair (avec une copie conforme de `js/moteur-eclair.js`) |
| `tests/` | `sql/` (back), `demo/` et `compte/` (écrans), `e2e/` (vrai back), `refonte/` (parcours de navigation) |
| `tools/` | serveur local, anti-cache, audit, vérification des migrations |
| `docs/` | [audit](docs/AUDIT.md), [plan et avancement](docs/PLAN.md), [architecture](docs/ARCHITECTURE.md), [back](docs/BACKEND.md), [exploitation](docs/EXPLOITATION.md), [suivi de la refonte du design](docs/REFONTE.md), [système de design](docs/DESIGN-SYSTEM.md), [données réelles : sources, quotas, architecture](docs/DONNEES.md) |

## État

Le détail, case par case, est dans [docs/PLAN.md](docs/PLAN.md). En bref, en mode Compte :

- **marche par le serveur** : inscription, connexion par e-mail ou pseudo, mot de passe oublié, onboarding, profil,
  marchés en direct animés par les bots, achat et vente, dépôts, retraits et KYC fictifs, limites de jeu responsable,
  pause, auto-exclusion, pari éclair (mise et règlement), chat du salon général et des marchés, messages privés entre amis,
  amis, classement, missions,
  XP, rangs, badges, notifications ;
- **pas encore relié, annoncé comme tel à l'écran** (« Bientôt disponible avec ton compte ») : Blitz, Série,
  salons VIP et de clan, duels, clans, combinés, ordres limites, copy trading, parrainage, propositions
  de marché.

Le mode Démo, lui, fait tout fonctionner localement.
