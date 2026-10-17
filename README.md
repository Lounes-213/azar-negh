# Azar Neɣ

Marketplace de petites annonces pour l'Algérie — 58 wilayas, DZD, interface française avec
support arabe/RTL, modération obligatoire avant publication, contact direct vendeur ↔ acheteur
et **aucun paiement en ligne**.

Tout tourne sur le plan gratuit de Cloudflare : **Workers** (app + API), **D1** (SQLite),
**R2** (photos), **Durable Objects** (notifications WebSocket).

```
React 19 + Vite (SPA)  ──►  Cloudflare Worker (Hono)  ──►  D1  (données)
                                     │                     R2  (photos)
                                     └──►  Durable Object NotificationHub  ──►  WebSocket
```

## Démarrage rapide

```bash
npm install
npm run db:migrate:local                 # schéma + 58 wilayas + catégories
npm run dev                              # API :8787 · Web :5173

npm run admin:bootstrap -- --email=admin@example.dz --phone="0550 12 34 56" --wilaya=16
DEMO_ADMIN_EMAIL=admin@example.dz DEMO_ADMIN_PASSWORD='…' npm run demo:seed   # optionnel
```

Node ≥ 22.12 requis. `npm run dev` crée un `.dev.vars` local avec un `SESSION_SECRET` aléatoire.

## Commandes

| Commande                                         | Effet                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `npm run dev`                                    | API Worker + Vite en parallèle                                                          |
| `npm run build`                                  | build de production du SPA (`dist/client`)                                              |
| `npm run deploy`                                 | build + `wrangler deploy`                                                               |
| `npm run check`                                  | format + lint + typecheck + tests unitaires + build                                     |
| `npm run test` / `npm run test:integration`      | 19 tests unitaires / 20 tests réels D1+R2+DO+WebSocket                                  |
| `npm run screenshots`                            | captures web + mobile dans `docs/screens/` (Edge/Chrome local, `--lang=ar` pour le RTL) |
| `npm run admin:bootstrap` / `admin:set-password` | premier administrateur / rotation de mot de passe (`--remote` en production)            |

## Ce qui est implémenté

- **Comptes** : inscription et connexion par e-mail + mot de passe (PBKDF2-HMAC-SHA256, 600 000
  itérations), sessions opaques en base (le jeton n'est jamais stocké en clair), CSRF sur toutes
  les écritures, limitation de débit par IP hachée, liste et révocation des sessions actives.
- **Annonces** : création en plusieurs étapes, brouillon → soumission → `PENDING` → décision de
  modération → `APPROVED`/`REJECTED`, cycle de vie complet (vendu, archivé, remis en ligne,
  refusé), 6 photos max de 5 Mo, upload direct en R2 avec rattachement contrôlé.
- **Recherche** : plein texte, filtres wilaya/catégorie/prix/état, tri, pagination.
- **Modération** : file d'attente, décision motivée, signalements utilisateurs, journal d'audit.
- **Notifications** : centre de notifications et poussette temps réel par WebSocket (un Durable
  Object par utilisateur, hibernation activée).
- **Admin** : statistiques, gestion des catégories et des utilisateurs, audit.
- **UI** : shell web à barre latérale, feed mobile type application, 3 langues de mise en page
  (web / tablette / téléphone), RTL complet pour l'arabe. Voir [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md).

## Documentation

| Document                                                                   | Contenu                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)                               | mise en production pas à pas, secrets, rollback                         |
| [`docs/FREE_TIER_LIMITS.md`](./docs/FREE_TIER_LIMITS.md)                   | quotas Cloudflare, budget de l'app, risques connus                      |
| [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md)                         | palette, typographie, grilles, RTL, régénération des captures           |
| [`docs/ARCHITECTURE_AUTH_SECTION.md`](./docs/ARCHITECTURE_AUTH_SECTION.md) | proposition d'architecture d'authentification (voir la note ci-dessous) |
| `docs/screens/`                                                            | captures web/mobile, FR et AR, générées depuis l'app réelle             |

## État vérifié (honnêtement)

- ✅ `npm run check` : format, lint, typecheck, 19/19 tests unitaires, build de production.
- ✅ `npm run test:integration` : 20/20 contre un vrai runtime Workers local (migrations D1
  appliquées, R2, Durable Object et WebSocket réel, envoi de notification de bout en bout).
- ✅ Design vérifié aux largeurs 390 px / 820 px / 1440 px, sans débordement horizontal.
- ⚠️ **Rien n'a encore été déployé** : la production n'existe pas pour l'instant. `wrangler.jsonc`
  contient deux valeurs à remplacer (`database_id`, nom du bucket R2).
- ⚠️ **Authentification non compatible avec le plan gratuit en l'état** : mesuré dans `workerd`,
  PBKDF2 600 000 itérations coûte **424 ms** de calcul, contre **10 ms** de CPU autorisées par
  requête sur le plan gratuit (≈ 42× le budget). Options et chiffres dans
  [`docs/FREE_TIER_LIMITS.md`](./docs/FREE_TIER_LIMITS.md) §3.
- ⚠️ **Écart d'architecture assumé** : `docs/ARCHITECTURE_AUTH_SECTION.md` propose
  « Google Sign-In, aucun mot de passe stocké ». L'implémentation livrée utilise
  e-mail + mot de passe, sans dépendre d'un fournisseur d'identité externe ni de secrets
  Google inexistants. Aucun identifiant Google n'a été inventé.

## Sécurité en bref

Aucun paiement, aucune donnée bancaire. Le téléphone de l'acheteur n'est pas affiché avant
connexion, l'e-mail du vendeur n'est jamais public, et seuls les numéros que le vendeur accepte
de publier sont exposés (WhatsApp optionnel). Toutes les décisions de modération sont journalisées.
