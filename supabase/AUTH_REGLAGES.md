# Réglages d'authentification Supabase — ce qui est observable

Relevé le 15 nov. 2026 sur le projet `brmwvxncyeypefsgiepf` (région `ap-southeast-2`, Postgres 17, offre gratuite).

Les réglages d'authentification ne vivent pas dans la base : ils se règlent dans le tableau de bord
Supabase. Ce fichier note ce qu'on peut constater de l'extérieur, et ce qui reste à vérifier à la main.

## Constaté (point d'accès public `auth/v1/settings`)

| Réglage | Valeur | Ce que ça veut dire |
|---|---|---|
| Inscription par e-mail | activée | on peut créer un compte avec e-mail + mot de passe |
| Inscriptions ouvertes (`disable_signup`) | oui (`false`) | n'importe qui peut s'inscrire |
| Confirmation d'e-mail (`mailer_autoconfirm`) | **désactivée** (`true`) | un compte est utilisable tout de suite, sans cliquer sur un lien |
| Connexion par téléphone | désactivée | |
| Comptes anonymes | désactivés | |
| Connexions sociales (Google, Apple, GitHub…) | toutes désactivées | |
| Passkeys / SAML | désactivés | |

## Constaté dans la base

- 19 comptes dans `auth.users`, tous confirmés. Aucun compte anonyme.
- Les 10 000 bots n'ont **pas** de compte d'authentification (ils n'existent que dans `public.users`).
- Un trigger `on_auth_user_created` sur `auth.users` appelle `public.handle_auth_user_created()` pour créer le profil.
- Aucune Edge Function, aucun bucket de stockage.

## Non observable de l'extérieur — à vérifier dans le tableau de bord

Chemin : **Authentication → URL Configuration** et **Authentication → Emails**.

- **Site URL** : doit être `https://wimoro.com`.
- **Redirect URLs** : doit contenir `https://wimoro.com/**` (et `http://localhost:*/**` pour les tests).
- **SMTP** : le service d'e-mail intégré de Supabase est limité (quelques e-mails par heure, et seulement
  vers les adresses des membres de l'organisation). Pour que « mot de passe oublié » fonctionne pour de
  vrais utilisateurs, il faut brancher un SMTP personnalisé.
- **Modèles d'e-mail** : le modèle « Reset Password » doit afficher le code à 6 chiffres (`{{ .Token }}`).
- **Longueur minimale du mot de passe** : le front exige 8 caractères.
