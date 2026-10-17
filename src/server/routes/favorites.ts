import { Hono } from "hono";
import type { AppEnv } from "../types";
import { paginationSchema } from "../../shared/validation";
import { HttpError, pageCount, parseQuery } from "../lib/http";
import { assertCsrf, requireUser } from "../lib/auth";
import { loadSummariesByIds } from "../lib/listings";
import { recordAudit } from "../lib/audit";

export const favoriteRoutes = new Hono<AppEnv>();

favoriteRoutes.get("/favorites", async (c) => {
  const user = requireUser(c);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const offset = (page - 1) * perPage;

  const [ids, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT f.listing_id
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       WHERE f.user_id = ? AND l.status IN ('APPROVED', 'SOLD')
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(user.id, perPage, offset)
      .all<{ listing_id: string }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       WHERE f.user_id = ? AND l.status IN ('APPROVED', 'SOLD')`,
    )
      .bind(user.id)
      .first<{ count: number }>(),
  ]);

  const items = await loadSummariesByIds(
    c.env.DB,
    (ids.results ?? []).map((row) => row.listing_id),
    user.id,
  );
  const total = count?.count ?? 0;
  return c.json({
    listings: {
      items: items.map((item) => ({ ...item, isFavorite: true })),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

favoriteRoutes.post("/favorites/:listingId", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const listingId = c.req.param("listingId");
  const listing = await c.env.DB.prepare("SELECT id, status FROM listings WHERE id = ?")
    .bind(listingId)
    .first<{ id: string; status: string }>();
  if (!listing || listing.status !== "APPROVED") {
    throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  }
  await c.env.DB.prepare(
    "INSERT INTO favorites (user_id, listing_id) VALUES (?, ?) ON CONFLICT (user_id, listing_id) DO NOTHING",
  )
    .bind(user.id, listingId)
    .run();
  return c.json({ favorited: true });
});

favoriteRoutes.delete("/favorites/:listingId", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const listingId = c.req.param("listingId");
  await c.env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?")
    .bind(user.id, listingId)
    .run();
  return c.json({ favorited: false });
});

favoriteRoutes.delete("/favorites", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const result = await c.env.DB.prepare("DELETE FROM favorites WHERE user_id = ?")
    .bind(user.id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "FAVORITES_CLEARED",
    entityType: "user",
    entityId: user.id,
    metadata: { count: result.meta.changes ?? 0 },
  });
  return c.body(null, 204);
});
