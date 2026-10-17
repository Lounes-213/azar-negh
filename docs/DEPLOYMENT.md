# Deployment — Azar Neɣ

Everything runs on Cloudflare's free tier: **Workers** (app + API), **D1** (SQLite),
**R2** (images), **Durable Objects** (WebSocket notifications). No external database,
no image CDN, no paid API.

> Free tier is not unlimited. Read [`FREE_TIER_LIMITS.md`](./FREE_TIER_LIMITS.md) before
> going public; the quotas that bite first are D1 rows written/day and Durable Object
> request counts.

## 0. Prerequisites

- Node.js **≥ 22.12** and npm (check with `node -v`).
- A Cloudflare account (free plan is enough) and `npx wrangler login`.
- A Cloudflare plan that allows Durable Objects on the free tier — Workers Free supports
  SQLite-backed Durable Objects and D1/R2; no paid add-on is required for this project.

## 1. Local development

```bash
npm install

# Make sure a SESSION_SECRET exists (npm run dev creates one automatically)
cp .dev.vars.example .dev.vars   # optional if you run `npm run dev` first

npm run db:migrate:local         # applies migrations/0001…0003 to the local D1
npm run dev                      # API on :8787 + Vite on :5173 (proxied /api)
```

Create the first administrator (no default password exists anywhere in the repo):

```bash
npm run admin:bootstrap -- --email=admin@example.dz --phone="0550 12 34 56" --wilaya=16 --name="Admin"
# password is prompted with masked input, or supplied via BOOTSTRAP_ADMIN_PASSWORD
```

Optional demo content (always titled `[Démo]`, demo accounts use `@azar.local`):

```bash
DEMO_ADMIN_EMAIL=admin@example.dz DEMO_ADMIN_PASSWORD='…' npm run demo:seed
```

Other useful commands:

| Command                                   | Purpose                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                           | format check + lint + typecheck + unit tests + production build                                                                                          |
| `npm run test`                            | unit tests (Vitest, no network)                                                                                                                          |
| `npm run test:integration`                | real D1/R2/DO run: starts its own `wrangler dev`, applies migrations, exercises auth, listings lifecycle, moderation, notifications and a live WebSocket |
| `npm run screenshots`                     | design captures into `docs/screens/` (see `docs/DESIGN_SYSTEM.md`)                                                                                       |
| `npm run admin:set-password -- --email=…` | rotate an account password (add `--remote` for production)                                                                                               |

## 2. First production deploy

```bash
# 1. Create the resources and copy the real ids into wrangler.jsonc
npx wrangler d1 create azar-neg-db          # → paste database_id into wrangler.jsonc
npx wrangler r2 bucket create azar-neg-images

# 2. Secrets (never commit them)
npx wrangler secret put SESSION_SECRET      # 64 hex chars, e.g. node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Set production vars in wrangler.jsonc
#    APP_ENV       = "production"
#    PUBLIC_ORIGIN = "https://<your-worker>.workers.dev"   (or your custom domain)

# 4. Schema + seed data
npm run db:migrate:remote

# 5. Build the SPA and ship the Worker
npm run deploy                              # = vite build && wrangler deploy

# 6. Create the production administrator
npm run admin:bootstrap -- --remote --email=you@example.dz --phone="0550 12 34 56" --wilaya=16 --name="Admin"
```

Verify after the first deploy:

- `GET https://<worker>/api/health` returns 200 with the environment name.
- `/` serves the app and the fonts (`/assets/poppins-latin-*.woff2`).
- Sign up, publish a listing → it must stay **PENDING** until a moderator approves it.
- WebSocket: sign in and watch `/api/ws` connect (101) — it is what drives live notifications.

`wrangler.jsonc` keeps two deliberate placeholders (`d1_databases[0].database_id` and the R2
bucket name). The build does not check them; the deploy will fail loudly if they are wrong.

## 3. Custom domain

Add the domain under **Workers → your Worker → Settings → Domains & Routes**, then update
`PUBLIC_ORIGIN` and redeploy, so cookies and links use the final origin.

## 4. Rollback

`npx wrangler deployments list` then `npx wrangler rollback <deployment-id>`. D1 migrations
are forward-only: `0001…0003` are additive and safe to keep in place when rolling code back.

## 5. What stays out of the repository

`.dev.vars`, `.wrangler/`, `dist/`, and any `*.log`. Production secrets live only in
`wrangler secret`. `SESSION_SECRET` must differ between local and production.
