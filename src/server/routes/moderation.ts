import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { ListingStatus, ModerationReview, ReportReason } from "../../shared/types";
import {
  moderationDecisionSchema,
  paginationSchema,
  reportResolutionSchema,
} from "../../shared/validation";
import { HttpError, nowIso, pageCount, parseJson, parseQuery } from "../lib/http";
import { assertCsrf, requireRole } from "../lib/auth";
import {
  loadListingImages,
  loadListingRow,
  rowToDetail,
  rowToSummary,
  type ListingRow,
} from "../lib/listings";
import { assertTransition } from "../policies/listings";
import { randomId } from "../lib/crypto";
import { recordAudit } from "../lib/audit";
import { notifyUser } from "../lib/notifications";

export const moderationRoutes = new Hono<AppEnv>();

moderationRoutes.get("/moderation/queue", async (c) => {
  requireRole(c, ["MODERATOR", "ADMIN"]);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const offset = (page - 1) * perPage;
  const viewerId = c.get("user")?.id ?? "";

  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.id, l.seller_id, l.title, l.description, l.price_da, l.negotiable, l.condition, l.status,
              l.created_at, l.updated_at, l.published_at, l.view_count, l.wilaya_id,
              w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
              l.category_id, cat.slug AS category_slug, cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
              l.contact_phone, l.contact_phone_public, l.contact_whatsapp, l.last_decision_reason,
              sp.display_name AS seller_display_name, sp.phone AS seller_phone,
              sp.phone_public AS seller_phone_public, sp.whatsapp_public AS seller_whatsapp_public,
              sp.bio AS seller_bio, sp.wilaya_id AS seller_wilaya_id, u.created_at AS seller_created_at,
              (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id,
              EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.user_id = ?) AS is_favorite
       FROM listings l
       JOIN wilayas w ON w.id = l.wilaya_id
       JOIN categories cat ON cat.id = l.category_id
       JOIN users u ON u.id = l.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = l.seller_id
       WHERE l.status = 'PENDING'
       ORDER BY l.submitted_at ASC, l.created_at ASC
       LIMIT ? OFFSET ?`,
    )
      .bind(viewerId, perPage, offset)
      .all<ListingRow>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM listings WHERE status = 'PENDING'").first<{
      count: number;
    }>(),
  ]);

  const total = count?.count ?? 0;
  return c.json({
    listings: {
      items: (rows.results ?? []).map(rowToSummary),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

moderationRoutes.get("/moderation/listings/:id", async (c) => {
  requireRole(c, ["MODERATOR", "ADMIN"]);
  const id = c.req.param("id");
  const viewer = c.get("user");
  const row = await loadListingRow(c.env.DB, id, viewer?.id ?? "");
  if (!row) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  const images = await loadListingImages(c.env.DB, id);
  const reviews = await c.env.DB.prepare(
    `SELECT r.id, r.listing_id, r.moderator_id, r.action, r.reason, r.created_at,
            p.display_name AS moderator_name
     FROM moderation_reviews r
     LEFT JOIN seller_profiles p ON p.user_id = r.moderator_id
     WHERE r.listing_id = ?
     ORDER BY r.created_at DESC`,
  )
    .bind(id)
    .all<{
      id: string;
      listing_id: string;
      moderator_id: string | null;
      action: ModerationReview["action"];
      reason: string | null;
      created_at: string;
      moderator_name: string | null;
    }>();

  return c.json({
    listing: rowToDetail(row, images, viewer),
    reviews: (reviews.results ?? []).map(
      (review): ModerationReview => ({
        id: review.id,
        listingId: review.listing_id,
        moderatorId: review.moderator_id,
        moderatorName: review.moderator_name,
        action: review.action,
        reason: review.reason,
        createdAt: review.created_at,
      }),
    ),
  });
});

moderationRoutes.post("/moderation/listings/:id/decision", async (c) => {
  const moderator = requireRole(c, ["MODERATOR", "ADMIN"]);
  assertCsrf(c);
  const id = c.req.param("id");
  const input = await parseJson(c, moderationDecisionSchema);
  const listing = await c.env.DB.prepare(
    "SELECT id, seller_id, title, status FROM listings WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; seller_id: string; title: string; status: ListingStatus }>();
  if (!listing) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (listing.status !== "PENDING") {
    throw new HttpError(409, "NOT_PENDING", "Cette annonce n'est pas en attente de modération.");
  }

  const now = nowIso();
  let nextStatus: ListingStatus;
  if (input.action === "APPROVE") {
    nextStatus = "APPROVED";
  } else if (input.action === "REJECT") {
    if (!input.reason || input.reason.trim().length < 5) {
      throw new HttpError(
        422,
        "REASON_REQUIRED",
        "Un motif de refus est obligatoire (5 caractères min).",
      );
    }
    nextStatus = "REJECTED";
  } else {
    if (moderator.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Seul un administrateur peut retirer une annonce.");
    }
    nextStatus = "ARCHIVED";
  }
  assertTransition(listing.status, nextStatus);
  const reason = input.reason?.trim() || null;

  const statements = [
    c.env.DB.prepare(
      `UPDATE listings SET status = ?, published_at = CASE WHEN ? = 'APPROVED' THEN ? ELSE published_at END,
         archived_at = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_at END,
         last_decision_reason = ?, updated_at = ? WHERE id = ?`,
    ).bind(nextStatus, nextStatus, now, nextStatus, now, reason, now, id),
    c.env.DB.prepare(
      "INSERT INTO moderation_reviews (id, listing_id, moderator_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(randomId(), id, moderator.id, input.action, reason, now),
  ];
  await c.env.DB.batch(statements);

  await recordAudit(c.env.DB, {
    actorId: moderator.id,
    action: `MODERATION_${input.action}`,
    entityType: "listing",
    entityId: id,
    metadata: { from: listing.status, to: nextStatus, reason },
  });

  if (nextStatus === "APPROVED") {
    await notifyUser(c.env, {
      userId: listing.seller_id,
      type: "LISTING_APPROVED",
      title: "Votre annonce est en ligne",
      body: listing.title,
      link: `/annonces/${id}`,
    });
  } else if (nextStatus === "REJECTED") {
    await notifyUser(c.env, {
      userId: listing.seller_id,
      type: "LISTING_REJECTED",
      title: "Votre annonce a été refusée",
      body: reason ?? "Consultez le motif dans votre espace vendeur.",
      link: "/compte/annonces",
    });
  } else {
    await notifyUser(c.env, {
      userId: listing.seller_id,
      type: "LISTING_REMOVED",
      title: "Votre annonce a été retirée",
      body: reason ?? "Annonce retirée par la modération.",
      link: "/compte/annonces",
    });
  }

  const row = await loadListingRow(c.env.DB, id, moderator.id);
  const images = await loadListingImages(c.env.DB, id);
  return c.json({ listing: row ? rowToDetail(row, images, moderator) : null });
});

moderationRoutes.get("/moderation/reports", async (c) => {
  requireRole(c, ["MODERATOR", "ADMIN"]);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const offset = (page - 1) * perPage;
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT r.id, r.listing_id, r.reason, r.details, r.status, r.created_at,
              l.title AS listing_title, l.status AS listing_status,
              sp.display_name AS reporter_name
       FROM reports r
       JOIN listings l ON l.id = r.listing_id
       LEFT JOIN seller_profiles sp ON sp.user_id = r.reporter_id
       WHERE r.status = 'OPEN'
       ORDER BY r.created_at ASC
       LIMIT ? OFFSET ?`,
    )
      .bind(perPage, offset)
      .all<{
        id: string;
        listing_id: string;
        reason: ReportReason;
        details: string | null;
        status: "OPEN";
        created_at: string;
        listing_title: string;
        listing_status: ListingStatus;
        reporter_name: string | null;
      }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'OPEN'").first<{
      count: number;
    }>(),
  ]);
  const total = count?.count ?? 0;
  return c.json({
    reports: {
      items: (rows.results ?? []).map((row) => ({
        id: row.id,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        listingStatus: row.listing_status,
        reason: row.reason,
        details: row.details,
        status: row.status,
        createdAt: row.created_at,
        reporterName: row.reporter_name ?? "Utilisateur",
      })),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

moderationRoutes.post("/moderation/reports/:id/resolve", async (c) => {
  const moderator = requireRole(c, ["MODERATOR", "ADMIN"]);
  assertCsrf(c);
  const id = c.req.param("id");
  const input = await parseJson(c, reportResolutionSchema);
  const report = await c.env.DB.prepare("SELECT id, status FROM reports WHERE id = ?")
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!report) throw new HttpError(404, "NOT_FOUND", "Signalement introuvable.");
  if (report.status !== "OPEN") {
    throw new HttpError(409, "ALREADY_RESOLVED", "Ce signalement est déjà traité.");
  }
  await c.env.DB.prepare(
    "UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?",
  )
    .bind(input.status, moderator.id, nowIso(), id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: moderator.id,
    action: "REPORT_RESOLVED",
    entityType: "report",
    entityId: id,
    metadata: { status: input.status },
  });
  return c.json({ report: { id, status: input.status } });
});
