import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { ListingCondition, ListingStatus } from "../../shared/types";
import {
  clickTrackSchema,
  listingInputSchema,
  paginationSchema,
  searchQuerySchema,
} from "../../shared/validation";
import { HttpError, nowIso, pageCount, parseJson, parseQuery } from "../lib/http";
import { assertCsrf, hashIp, requestIp, requireUser } from "../lib/auth";
import {
  imageUrl,
  loadListingImages,
  loadListingRow,
  relatedListings,
  rowToDetail,
  rowToSummary,
  searchListings,
  type ListingRow,
} from "../lib/listings";
import { assertTransition, canViewListing, statusAfterSellerEdit } from "../policies/listings";
import { consumeRateLimit } from "../lib/rate-limit";
import { randomId } from "../lib/crypto";
import { recordAudit } from "../lib/audit";
import { notifyStaff } from "../lib/notifications";
import { attachImagesToNewListing, syncListingImages } from "./images";
import { deleteR2Object } from "../lib/images";

export const listingRoutes = new Hono<AppEnv>();

interface RawListing {
  id: string;
  seller_id: string;
  status: ListingStatus;
  title: string;
  category_id: number;
  images: number;
}

async function loadRawListing(db: D1Database, id: string): Promise<RawListing | null> {
  const row = await db
    .prepare(
      `SELECT l.id, l.seller_id, l.status, l.title, l.category_id,
              (SELECT COUNT(*) FROM listing_images i WHERE i.listing_id = l.id) AS images
       FROM listings l WHERE l.id = ?`,
    )
    .bind(id)
    .first<RawListing>();
  return row ?? null;
}

async function assertCategoryActive(db: D1Database, categoryId: number): Promise<void> {
  const category = await db
    .prepare("SELECT id FROM categories WHERE id = ? AND is_active = 1")
    .bind(categoryId)
    .first();
  if (!category) throw new HttpError(422, "UNKNOWN_CATEGORY", "Catégorie inconnue ou inactive.");
}

async function assertWilaya(db: D1Database, wilayaId: number): Promise<void> {
  const row = await db.prepare("SELECT id FROM wilayas WHERE id = ?").bind(wilayaId).first();
  if (!row) throw new HttpError(422, "UNKNOWN_WILAYA", "Wilaya inconnue.");
}

async function respondDetail(
  c: import("hono").Context<AppEnv>,
  id: string,
  status: 200 | 201 = 200,
) {
  const viewer = c.get("user");
  const row = await loadListingRow(c.env.DB, id, viewer?.id ?? "");
  if (!row) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (!canViewListing(row.status, row.seller_id, viewer)) {
    throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  }
  const images = await loadListingImages(c.env.DB, id);
  const related = await relatedListings(
    c.env.DB,
    { id: row.id, categoryId: row.category_id, wilayaId: row.wilaya_id, priceDa: row.price_da },
    viewer?.id ?? "",
  );
  return c.json({ listing: rowToDetail(row, images, viewer), related }, status);
}

listingRoutes.get("/listings/suggestions", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json({ suggestions: [], categories: [] });
  }

  const pattern = `%${q}%`;
  const [items, categories] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.id, l.title, l.price_da, l.wilaya_id,
              w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
              cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
              (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
       FROM listings l
       JOIN wilayas w ON w.id = l.wilaya_id
       JOIN categories cat ON cat.id = l.category_id
       WHERE l.status = 'APPROVED' AND (l.title LIKE ? OR l.description LIKE ?)
       ORDER BY (COALESCE(l.order_clicks, 0) + COALESCE(l.call_clicks, 0) + l.view_count) DESC, l.published_at DESC
       LIMIT 5`,
    )
      .bind(pattern, pattern)
      .all<{
        id: string;
        title: string;
        price_da: number;
        wilaya_id: number;
        wilaya_name_fr: string;
        wilaya_name_ar: string;
        category_name_fr: string;
        category_name_ar: string;
        cover_id: string | null;
      }>(),
    c.env.DB.prepare(
      `SELECT id, slug, name_fr, name_ar FROM categories
       WHERE is_active = 1 AND (name_fr LIKE ? OR name_ar LIKE ?)
       LIMIT 3`,
    )
      .bind(pattern, pattern)
      .all<{ id: number; slug: string; name_fr: string; name_ar: string }>(),
  ]);

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    suggestions: (items.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      priceDa: row.price_da,
      wilaya: { id: row.wilaya_id, nameFr: row.wilaya_name_fr, nameAr: row.wilaya_name_ar },
      category: { nameFr: row.category_name_fr, nameAr: row.category_name_ar },
      coverImage: imageUrl(row.cover_id),
    })),
    categories: (categories.results ?? []).map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      nameFr: cat.name_fr,
      nameAr: cat.name_ar,
    })),
  });
});

listingRoutes.get("/listings", async (c) => {
  const query = parseQuery(c.req.query(), searchQuerySchema);
  if (
    query.minPrice !== undefined &&
    query.maxPrice !== undefined &&
    query.minPrice > query.maxPrice
  ) {
    throw new HttpError(422, "INVALID_PRICE_RANGE", "Le prix minimum dépasse le prix maximum.");
  }
  const result = await searchListings(c.env.DB, query, c.get("user")?.id ?? "");
  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    listings: {
      items: result.rows.map(rowToSummary),
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

listingRoutes.get("/listings/:id", async (c) => {
  const id = c.req.param("id");
  const viewer = c.get("user");
  const row = await loadListingRow(c.env.DB, id, viewer?.id ?? "");
  if (!row) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (!canViewListing(row.status, row.seller_id, viewer)) {
    throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  }
  if ((row.status === "APPROVED" || row.status === "SOLD") && viewer?.id !== row.seller_id) {
    await c.env.DB.prepare("UPDATE listings SET view_count = view_count + 1 WHERE id = ?")
      .bind(id)
      .run();
  }
  const images = await loadListingImages(c.env.DB, id);
  const related = await relatedListings(
    c.env.DB,
    { id: row.id, categoryId: row.category_id, wilayaId: row.wilaya_id, priceDa: row.price_da },
    viewer?.id ?? "",
  );
  c.header("Cache-Control", "private, max-age=0");
  return c.json({ listing: rowToDetail(row, images, viewer), related });
});

listingRoutes.post("/listings", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  if (!user.profileComplete) {
    throw new HttpError(403, "PROFILE_INCOMPLETE", "Complétez votre profil avant de publier.");
  }
  const limit = await consumeRateLimit(c.env.DB, `listing:create:${user.id}`, 10, 86400);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Limite de publications atteinte pour aujourd'hui.");
  }
  const input = await parseJson(c, listingInputSchema);
  await assertCategoryActive(c.env.DB, input.categoryId);
  await assertWilaya(c.env.DB, input.wilayaId);
  const maxImages = Number(c.env.MAX_IMAGES_PER_LISTING || "6");

  const id = randomId();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO listings
      (id, seller_id, category_id, wilaya_id, title, description, price_da, negotiable, condition, item_type,
       status, contact_phone, contact_phone_public, contact_whatsapp, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      input.categoryId,
      input.wilayaId,
      input.title,
      input.description,
      input.priceDa,
      input.negotiable ? 1 : 0,
      input.condition as ListingCondition,
      input.itemType,
      input.contactPhone ?? null,
      input.contactPhonePublic ? 1 : 0,
      input.contactWhatsapp ? 1 : 0,
      now,
      now,
    )
    .run();

  try {
    await attachImagesToNewListing(c.env, id, user.id, input.imageIds, maxImages);
  } catch (error) {
    await c.env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id).run();
    throw error;
  }

  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "LISTING_CREATED",
    entityType: "listing",
    entityId: id,
    metadata: { title: input.title },
    ipHash: await hashIp(c.env, requestIp(c)),
  });
  return respondDetail(c, id, 201);
});

listingRoutes.patch("/listings/:id", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const raw = await loadRawListing(c.env.DB, id);
  if (!raw) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (raw.seller_id !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "Cette annonce ne vous appartient pas.");
  }
  const nextStatus = statusAfterSellerEdit(raw.status);
  const input = await parseJson(c, listingInputSchema);
  await assertCategoryActive(c.env.DB, input.categoryId);
  await assertWilaya(c.env.DB, input.wilayaId);
  const maxImages = Number(c.env.MAX_IMAGES_PER_LISTING || "6");

  await c.env.DB.prepare(
    `UPDATE listings SET
       category_id = ?, wilaya_id = ?, title = ?, description = ?, price_da = ?, negotiable = ?,
       condition = ?, item_type = ?, contact_phone = ?, contact_phone_public = ?, contact_whatsapp = ?,
       status = ?, submitted_at = NULL, last_decision_reason = NULL, updated_at = ?
     WHERE id = ? AND seller_id = ?`,
  )
    .bind(
      input.categoryId,
      input.wilayaId,
      input.title,
      input.description,
      input.priceDa,
      input.negotiable ? 1 : 0,
      input.condition as ListingCondition,
      input.itemType,
      input.contactPhone ?? null,
      input.contactPhonePublic ? 1 : 0,
      input.contactWhatsapp ? 1 : 0,
      nextStatus,
      nowIso(),
      id,
      user.id,
    )
    .run();

  await syncListingImages(c.env, id, user.id, input.imageIds, maxImages);
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: raw.status === "APPROVED" ? "LISTING_EDITED_REQUEUED" : "LISTING_EDITED",
    entityType: "listing",
    entityId: id,
    metadata: { from: raw.status, to: nextStatus },
  });
  return respondDetail(c, id);
});

listingRoutes.post("/listings/:id/submit", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  if (!user.profileComplete) {
    throw new HttpError(403, "PROFILE_INCOMPLETE", "Complétez votre profil avant de soumettre.");
  }
  const id = c.req.param("id");
  const raw = await loadRawListing(c.env.DB, id);
  if (!raw) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (raw.seller_id !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "Cette annonce ne vous appartient pas.");
  }
  assertTransition(raw.status, "PENDING");
  if (raw.images < 1) {
    throw new HttpError(422, "IMAGES_REQUIRED", "Ajoutez au moins une photo avant de soumettre.");
  }

  await c.env.DB.prepare(
    "UPDATE listings SET status = 'PENDING', submitted_at = ?, last_decision_reason = NULL, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), nowIso(), id)
    .run();

  await notifyStaff(c.env, ["MODERATOR", "ADMIN"], {
    type: "LISTING_SUBMITTED",
    title: "Nouvelle annonce à modérer",
    body: raw.title,
    link: `/mod/annonces/${id}`,
  });
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "LISTING_SUBMITTED",
    entityType: "listing",
    entityId: id,
  });
  return respondDetail(c, id);
});

listingRoutes.post("/listings/:id/sold", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const raw = await loadRawListing(c.env.DB, id);
  if (!raw) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (raw.seller_id !== user.id) throw new HttpError(403, "FORBIDDEN", "Action non autorisée.");
  assertTransition(raw.status, "SOLD");
  await c.env.DB.prepare(
    "UPDATE listings SET status = 'SOLD', sold_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), nowIso(), id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "LISTING_MARKED_SOLD",
    entityType: "listing",
    entityId: id,
  });
  return respondDetail(c, id);
});

listingRoutes.post("/listings/:id/relist", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const raw = await loadRawListing(c.env.DB, id);
  if (!raw) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (raw.seller_id !== user.id) throw new HttpError(403, "FORBIDDEN", "Action non autorisée.");
  assertTransition(raw.status, "APPROVED");
  await c.env.DB.prepare(
    "UPDATE listings SET status = 'APPROVED', sold_at = NULL, published_at = ?, archived_at = NULL, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), nowIso(), id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "LISTING_RELISTED",
    entityType: "listing",
    entityId: id,
  });
  return respondDetail(c, id);
});

listingRoutes.post("/listings/:id/archive", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const raw = await loadRawListing(c.env.DB, id);
  if (!raw) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (raw.seller_id !== user.id) throw new HttpError(403, "FORBIDDEN", "Action non autorisée.");
  assertTransition(raw.status, "ARCHIVED");
  await c.env.DB.prepare(
    "UPDATE listings SET status = 'ARCHIVED', archived_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), nowIso(), id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "LISTING_ARCHIVED",
    entityType: "listing",
    entityId: id,
    metadata: { from: raw.status },
  });
  return respondDetail(c, id);
});

listingRoutes.delete("/listings/:id", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const raw = await loadRawListing(c.env.DB, id);
  if (!raw) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (raw.seller_id !== user.id) throw new HttpError(403, "FORBIDDEN", "Action non autorisée.");
  if (!["DRAFT", "REJECTED", "ARCHIVED"].includes(raw.status)) {
    throw new HttpError(
      409,
      "DELETE_NOT_ALLOWED",
      "Archivez l'annonce avant de la supprimer (les annonces publiées ou en vente ne sont pas supprimables directement).",
    );
  }
  const images = await c.env.DB.prepare("SELECT r2_key FROM listing_images WHERE listing_id = ?")
    .bind(id)
    .all<{ r2_key: string }>();
  for (const image of images.results ?? []) {
    await deleteR2Object(c.env, image.r2_key);
  }
  await c.env.DB.prepare("DELETE FROM listings WHERE id = ? AND seller_id = ?")
    .bind(id, user.id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "LISTING_DELETED",
    entityType: "listing",
    entityId: id,
    metadata: { title: raw.title, status: raw.status },
  });
  return c.body(null, 204);
});

listingRoutes.get("/account/listings", async (c) => {
  const user = requireUser(c);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const status = c.req.query("status");
  const allowed: ListingStatus[] = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "SOLD", "ARCHIVED"];
  if (status && !allowed.includes(status as ListingStatus)) {
    throw new HttpError(422, "INVALID_STATUS", "Statut inconnu.");
  }
  const offset = (page - 1) * perPage;
  const where = status ? "l.seller_id = ? AND l.status = ?" : "l.seller_id = ?";
  const params: unknown[] = status ? [user.id, status] : [user.id];

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
              0 AS is_favorite
       FROM listings l
       JOIN wilayas w ON w.id = l.wilaya_id
       JOIN categories cat ON cat.id = l.category_id
       JOIN users u ON u.id = l.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = l.seller_id
       WHERE ${where}
       ORDER BY l.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...params, perPage, offset)
      .all<ListingRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM listings l WHERE ${where}`)
      .bind(...params)
      .first<{ count: number }>(),
  ]);

  const total = count?.count ?? 0;
  return c.json({
    listings: {
      items: (rows.results ?? []).map((row) => ({
        ...rowToSummary(row),
        coverImage: imageUrl(row.cover_id),
        rejectionReason: row.last_decision_reason,
      })),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

listingRoutes.post("/listings/:id/track-click", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  // Clicks are counted ONLY if user is authenticated (Google / local), not guest
  if (!user) {
    return c.json({ counted: false, reason: "guest_not_authenticated" });
  }

  const body = await parseJson(c, clickTrackSchema);
  const clickId = randomId();
  const now = nowIso();

  const column = body.clickType === "CALL" ? "call_clicks" : "order_clicks";
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO listing_clicks (id, listing_id, user_id, click_type, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(clickId, id, user.id, body.clickType, now),
    c.env.DB.prepare(
      `UPDATE listings SET ${column} = ${column} + 1 WHERE id = ?`,
    ).bind(id),
  ]);

  const updated = await c.env.DB.prepare(
    "SELECT call_clicks, order_clicks FROM listings WHERE id = ?",
  ).bind(id).first<{ call_clicks: number; order_clicks: number }>();

  return c.json({
    counted: true,
    callClicks: updated?.call_clicks ?? 0,
    orderClicks: updated?.order_clicks ?? 0,
  });
});

