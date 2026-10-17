import { Hono } from "hono";
import type { AppEnv } from "../types";
import { reportSchema } from "../../shared/validation";
import { HttpError, nowIso, parseJson } from "../lib/http";
import { assertCsrf, hashIp, requestIp, requireUser } from "../lib/auth";
import { randomId } from "../lib/crypto";
import { consumeRateLimit } from "../lib/rate-limit";
import { recordAudit } from "../lib/audit";
import { notifyStaff } from "../lib/notifications";

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.post("/listings/:id/reports", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const ipHash = await hashIp(c.env, requestIp(c));
  const limit = await consumeRateLimit(c.env.DB, `report:user:${user.id}`, 10, 86400);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Trop de signalements envoyés aujourd'hui.");
  }

  const listingId = c.req.param("id");
  const listing = await c.env.DB.prepare(
    "SELECT id, seller_id, status, title FROM listings WHERE id = ?",
  )
    .bind(listingId)
    .first<{ id: string; seller_id: string; status: string; title: string }>();
  if (!listing || listing.status !== "APPROVED") {
    throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  }
  if (listing.seller_id === user.id) {
    throw new HttpError(422, "OWN_LISTING", "Vous ne pouvez pas signaler votre propre annonce.");
  }

  const input = await parseJson(c, reportSchema);
  const id = randomId();
  try {
    await c.env.DB.prepare(
      "INSERT INTO reports (id, listing_id, reporter_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, 'OPEN', ?)",
    )
      .bind(id, listingId, user.id, input.reason, input.details?.trim() || null, nowIso())
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new HttpError(409, "ALREADY_REPORTED", "Vous avez déjà signalé cette annonce.");
    }
    throw error;
  }

  await notifyStaff(c.env, ["MODERATOR", "ADMIN"], {
    type: "REPORT_CREATED",
    title: "Nouveau signalement",
    body: listing.title,
    link: "/mod/signalements",
  });
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "REPORT_CREATED",
    entityType: "report",
    entityId: id,
    metadata: { listingId, reason: input.reason },
    ipHash,
  });
  return c.json({ report: { id, status: "OPEN" } }, 201);
});
