export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter persisted in D1, so every isolate shares the same
 * counter. Keys are stored hashed by callers (no raw IP addresses at rest).
 */
export async function consumeRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count, window_start`,
    )
    .bind(key, windowStart)
    .first<{ count: number; window_start: number }>();

  const count = row?.count ?? 1;
  const start = row?.window_start ?? windowStart;
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(0, start + windowSeconds - nowSeconds),
  };
}

export async function cleanupRateLimits(db: D1Database, olderThanSeconds = 86400): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoff).run();
}
