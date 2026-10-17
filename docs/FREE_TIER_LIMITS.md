# Free-tier budget — Azar Neɣ

The project is **free-tier-first**: hosting, database, storage and real-time all stay on
Cloudflare. None of these allowances is unlimited, and one of them (Workers **CPU time**) is
the most likely thing to break this app in production. Numbers below are the current
published Cloudflare figures; verify them again before launch.

Sources:

- Workers pricing / limits — <https://developers.cloudflare.com/workers/platform/pricing/>, <https://developers.cloudflare.com/workers/platform/limits/>
- D1 pricing / limits — <https://developers.cloudflare.com/d1/platform/pricing/>, <https://developers.cloudflare.com/d1/platform/limits/>
- R2 pricing — <https://developers.cloudflare.com/r2/pricing/>
- Durable Objects pricing / overview — <https://developers.cloudflare.com/durable-objects/platform/pricing/>, <https://developers.cloudflare.com/durable-objects/>

## 1. The allowances that matter

| Service                        | Free allowance                                                                                                        | Reset            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Workers                        | 100,000 requests/day, **10 ms CPU per invocation**                                                                    | daily, 00:00 UTC |
| D1                             | 5,000,000 rows read/day · **100,000 rows written/day** · 5 GB total per account · **500 MB per database**             | daily / lifetime |
| R2                             | 10 GB-month storage · 1,000,000 Class A (writes)/month · 10,000,000 Class B (reads)/month · free egress               | monthly          |
| Durable Objects (Workers Free) | 100,000 requests/day · 13,000 GB-s/day · 5,000,000 SQLite rows read/day · 100,000 rows written/day · 5 GB SQL storage | daily            |

Durable Objects **are usable on the Workers Free plan** as long as they are SQLite-backed
(`new_sqlite_classes` in `wrangler.jsonc` — which is what this project uses). Key-value-backed
Durable Objects require a paid plan.

Both D1 and Durable Objects **return errors** once a daily limit is exceeded; they do not
silently degrade. Plan for that with the health check below.

## 2. What the app does with the budget

- **Images live in R2, never in D1.** `MAX_IMAGES_PER_LISTING=6` and `MAX_IMAGE_BYTES=5242880`
  (5 MB) are enforced in the API, so a listing costs at most 30 MB of R2 and zero D1 bytes.
  R2 Class A (uploads) and Class B (reads) are the counters to watch; the 10 GB-month free
  storage is roughly 300,000 listing images at 5 MB.
- **Sessions are revoked, not deleted, then purged by cron.** A daily cron
  (`17 3 * * *` → `runCleanup`) deletes expired sessions, read notifications older than
  90 days, uploaded-but-never-attached objects and stale rate-limit windows. That is a small,
  bounded number of writes per day, which keeps the 100,000 rows-written/day D1 budget free
  for listings, favourites and notifications.
- **Real-time is one Durable Object per user.** Each signed-in tab holds one WebSocket. Idle
  sockets are hibernated, so they do not consume duration, but every inbound frame counts
  against the DO request allowance. 100,000 DO requests/day is far above what a small
  marketplace needs, and one object per user keeps one noisy client from affecting others.
- **Rate limiting is fixed-window in D1** (`consumeRateLimit`), which costs one write per
  inspected request. It is applied to the routes that need it (auth, listing creation,
  reports, image upload) — _not_ to every request, precisely to protect the write budget.
- **Cron is a single daily tick**, so it never competes with user traffic for CPU.

## 3. Known risk: password hashing vs the 10 ms CPU limit

`hashPassword` in `src/server/lib/crypto.ts` uses **PBKDF2-HMAC-SHA256 with 600,000
iterations**, the OWASP recommendation. That is deliberately expensive, and the Workers
**Free** plan allows only **10 ms of CPU per invocation**.

**Measured in the real `workerd` runtime** (not estimated) with the throwaway benchmark
worker kept in the repo for exactly this question:

```bash
npx wrangler dev --config bench.wrangler.json --port 8801 --ip 127.0.0.1
curl "http://127.0.0.1:8801/?n=100000"   # → {"iterations":100000,"ms":71}
curl "http://127.0.0.1:8801/?n=600000"   # → {"iterations":600000,"ms":424}
```

| Iterations                | Measured time (pure compute, workerd) |
| ------------------------- | ------------------------------------- |
| 100,000                   | **71 ms**                             |
| 600,000 (current default) | **424 ms**                            |

`deriveBits` is CPU-bound, so those figures are effectively CPU time. The current default is
**≈ 42× the 10 ms free allowance**; extrapolating the benchmark, the largest count that fits the
free budget is roughly **10,000–14,000 iterations**, which is far too weak to be a defensible
password hash. Conclusion: **the Workers Free plan cannot host PBKDF2 with sane parameters.**
Sign-in and sign-up will fail on the free plan with an "exceeded CPU time" error even though
they pass locally.

Re-measure after the first deploy to confirm (the CPU figure below is what the platform bills):

```bash
npx wrangler tail --format pretty   # then sign in; read the CPU time of /api/auth/login
```

Then pick one of these, in order of preference:

1. **Keep 600k iterations and move to Workers Paid** ($5/month) — the only option that keeps
   both a defensible KDF cost and the Cloudflare-native architecture. This is the recommended
   path; the free plan is otherwise sufficient for every other feature.
2. **Lower the iteration count** to a value measured to fit the free budget (the stored hash
   format `pbkdf2-sha256$iterations$salt$hash` is already versioned, so existing hashes keep
   verifying and can be re-hashed on next successful login). Because the free-safe ceiling is
   around 10–14k iterations, this should only be a stop-gap for a private beta.
3. Offload hashing to an external service — rejected: it breaks the Cloudflare-only
   requirement and adds a paid dependency.

Whatever is chosen, record the measured CPU time and the date here, because the number is
runtime- and platform-dependent.

Until one of these is done, treat free-plan authentication as **unverified**.

## 4. Monitoring checklist

- Workers → _Metrics_: requests/day (vs 100,000), CPU time P99, error rate.
- D1 → _Metrics_: rows read/written per day; alert well before 100,000 writes.
- R2 → _Metrics_: Class A/B operations, storage GB-month.
- Durable Objects → _Metrics_: requests and GB-s per day.
- Logs: `wrangler tail` for `event: cleanup_completed` (cron health) and for
  `exceeded CPU` / `D1_ERROR` messages.

## 5. When the free tier stops being enough

The first paid step is Workers Paid ($5/month) for CPU headroom and the larger Durable Object
allowances; D1 and R2 overage is priced per million operations and per GB. Nothing in the
codebase has to change — the same bindings and migrations apply.
