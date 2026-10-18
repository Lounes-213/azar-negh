import { Hono } from "hono";
import type { AppEnv } from "../types";
import { paginationSchema, reorderListingsSchema, storeReviewSchema } from "../../shared/validation";
import { HttpError, nowIso, pageCount, parseJson, parseQuery } from "../lib/http";
import { rowToSummary, type ListingRow } from "../lib/listings";
import { assertCsrf, requireUser } from "../lib/auth";
import { randomId } from "../lib/crypto";

export const sellerRoutes = new Hono<AppEnv>();

// List all active registered stores, optionally filtered or sorted by proximity to GPS coords
sellerRoutes.get("/sellers", async (c) => {
  const wilayaId = c.req.query("wilayaId");
  const latStr = c.req.query("lat");
  const lngStr = c.req.query("lng");
  const userLat = latStr ? parseFloat(latStr) : null;
  const userLng = lngStr ? parseFloat(lngStr) : null;

  let query = `
    SELECT u.id, u.avatar_url, p.display_name, p.logo_url, p.store_name, p.store_slug,
           p.commune, p.address, p.latitude, p.longitude, p.wilaya_id, p.banner_url,
           w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
           (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id AND l.status = 'APPROVED') AS listings_count
    FROM users u
    JOIN seller_profiles p ON p.user_id = u.id
    JOIN wilayas w ON w.id = p.wilaya_id
    WHERE u.status = 'ACTIVE' AND (p.store_name IS NOT NULL OR p.store_slug IS NOT NULL)
  `;
  const params: unknown[] = [];

  if (wilayaId) {
    query += " AND p.wilaya_id = ?";
    params.push(Number(wilayaId));
  }

  query += " ORDER BY listings_count DESC LIMIT 60";

  const rows = await c.env.DB.prepare(query)
    .bind(...params)
    .all<{
      id: string;
      avatar_url: string | null;
      display_name: string;
      logo_url: string | null;
      store_name: string | null;
      store_slug: string | null;
      commune: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      wilaya_id: number;
      banner_url: string | null;
      wilaya_name_fr: string;
      wilaya_name_ar: string;
      listings_count: number;
    }>();

  const stores = (rows.results ?? []).map((row) => {
    let distanceKm: number | null = null;
    if (userLat !== null && userLng !== null && row.latitude && row.longitude) {
      const R = 6371; // km
      const dLat = ((row.latitude - userLat) * Math.PI) / 180;
      const dLon = ((row.longitude - userLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLat * Math.PI) / 180) *
          Math.cos((row.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const cVal = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceKm = Math.round(R * cVal * 10) / 10;
    }

    return {
      id: row.id,
      displayName: row.display_name,
      storeName: row.store_name,
      storeSlug: row.store_slug,
      logoUrl: row.logo_url || row.avatar_url,
      commune: row.commune,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      bannerUrl: row.banner_url,
      wilaya: {
        id: row.wilaya_id,
        nameFr: row.wilaya_name_fr,
        nameAr: row.wilaya_name_ar,
      },
      listingsCount: row.listings_count,
      distanceKm,
    };
  });

  if (userLat !== null && userLng !== null) {
    stores.sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return b.listingsCount - a.listingsCount;
    });
  }

  return c.json({ stores });
});

sellerRoutes.get("/sellers/:id", async (c) => {
  const idOrSlug = c.req.param("id");
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const viewerId = c.get("user")?.id ?? "";

  const seller = await c.env.DB.prepare(
    `SELECT u.id, u.created_at, u.status, u.avatar_url, p.display_name, p.logo_url, p.phone, p.phone_public,
            p.whatsapp_public, p.wilaya_id, p.bio, w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
            p.store_name, p.store_slug, p.commune, p.address, p.latitude, p.longitude,
            p.opening_hours, p.banner_url, p.custom_sort_order,
            (SELECT COUNT(*) FROM store_follows WHERE seller_id = u.id) AS followers_count,
            EXISTS (SELECT 1 FROM store_follows WHERE seller_id = u.id AND user_id = ?) AS is_following,
            COALESCE((SELECT CAST(ROUND(AVG(rating)) AS INTEGER) FROM store_reviews WHERE store_seller_id = u.id), 5) AS avg_rating,
            (SELECT COUNT(*) FROM store_reviews WHERE store_seller_id = u.id) AS reviews_count
     FROM users u
     JOIN seller_profiles p ON p.user_id = u.id
     JOIN wilayas w ON w.id = p.wilaya_id
     WHERE u.id = ? OR p.store_slug = ?`,
  )
    .bind(viewerId, idOrSlug, idOrSlug)
    .first<{
      id: string;
      created_at: string;
      status: string;
      avatar_url: string | null;
      display_name: string;
      logo_url: string | null;
      phone: string;
      phone_public: number;
      whatsapp_public: number;
      wilaya_id: number;
      bio: string | null;
      wilaya_name_fr: string;
      wilaya_name_ar: string;
      store_name: string | null;
      store_slug: string | null;
      commune: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      opening_hours: string | null;
      banner_url: string | null;
      custom_sort_order: string | null;
      followers_count: number;
      is_following: number;
      avg_rating: number;
      reviews_count: number;
    }>();

  if (!seller || seller.status !== "ACTIVE") {
    throw new HttpError(404, "NOT_FOUND", "Boutique ou profil introuvable.");
  }

  const offset = (page - 1) * perPage;
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.id, l.seller_id, l.title, l.description, l.price_da, l.negotiable, l.condition, l.status,
              l.created_at, l.updated_at, l.published_at, l.view_count, l.wilaya_id,
              w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
              l.category_id, cat.slug AS category_slug, cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
              l.contact_phone, l.contact_phone_public, l.contact_whatsapp, l.last_decision_reason,
              l.call_clicks, l.order_clicks, l.original_price_da, l.sort_order, l.seller_remark,
              sp.display_name AS seller_display_name, sp.phone AS seller_phone,
              sp.phone_public AS seller_phone_public, sp.whatsapp_public AS seller_whatsapp_public,
              sp.bio AS seller_bio, sp.wilaya_id AS seller_wilaya_id, u.created_at AS seller_created_at,
              u.avatar_url AS seller_avatar_url, COALESCE(sp.logo_url, u.avatar_url) AS store_logo_url,
              sp.store_name AS store_name, sp.store_slug AS store_slug,
              (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id,
              EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.user_id = ?) AS is_favorite
       FROM listings l
       JOIN wilayas w ON w.id = l.wilaya_id
       JOIN categories cat ON cat.id = l.category_id
       JOIN users u ON u.id = l.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = l.seller_id
       WHERE l.seller_id = ? AND l.status = 'APPROVED'
       ORDER BY l.sort_order ASC, l.published_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(viewerId, seller.id, perPage, offset)
      .all<ListingRow>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM listings WHERE seller_id = ? AND status = 'APPROVED'",
    )
      .bind(seller.id)
      .first<{ count: number }>(),
  ]);

  const total = count?.count ?? 0;
  let customOrder: string[] | null = null;
  if (seller.custom_sort_order) {
    try {
      customOrder = JSON.parse(seller.custom_sort_order);
    } catch {
      customOrder = null;
    }
  }

  return c.json({
    seller: {
      id: seller.id,
      displayName: seller.display_name,
      storeName: seller.store_name,
      storeSlug: seller.store_slug,
      logoUrl: seller.logo_url || seller.avatar_url || null,
      avatarUrl: seller.avatar_url || null,
      commune: seller.commune,
      address: seller.address,
      latitude: seller.latitude,
      longitude: seller.longitude,
      openingHours: seller.opening_hours,
      bannerUrl: seller.banner_url,
      wilaya: {
        id: seller.wilaya_id,
        nameFr: seller.wilaya_name_fr,
        nameAr: seller.wilaya_name_ar,
      },
      phone: seller.phone_public === 1 ? seller.phone : null,
      whatsappPublic: seller.whatsapp_public === 1,
      bio: seller.bio,
      memberSince: seller.created_at,
      followersCount: seller.followers_count ?? 0,
      isFollowing: seller.is_following === 1,
      averageRating: seller.avg_rating ?? 5,
      reviewsCount: seller.reviews_count ?? 0,
      customSortOrder: customOrder,
    },
    listings: {
      items: (rows.results ?? []).map(rowToSummary),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

// Follow or unfollow a store
sellerRoutes.post("/sellers/:id/follow", async (c) => {
  const sellerId = c.req.param("id");
  const user = requireUser(c);
  assertCsrf(c);

  if (user.id === sellerId) {
    throw new HttpError(400, "SELF_FOLLOW", "Vous ne pouvez pas vous abonner à votre propre boutique.");
  }

  const existing = await c.env.DB.prepare(
    "SELECT user_id FROM store_follows WHERE user_id = ? AND seller_id = ?",
  )
    .bind(user.id, sellerId)
    .first();

  let isFollowing = false;
  if (existing) {
    await c.env.DB.prepare("DELETE FROM store_follows WHERE user_id = ? AND seller_id = ?")
      .bind(user.id, sellerId)
      .run();
    isFollowing = false;
  } else {
    await c.env.DB.prepare(
      "INSERT INTO store_follows (user_id, seller_id, created_at) VALUES (?, ?, ?)",
    )
      .bind(user.id, sellerId, nowIso())
      .run();
    isFollowing = true;
  }

  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM store_follows WHERE seller_id = ?",
  )
    .bind(sellerId)
    .first<{ count: number }>();

  return c.json({
    isFollowing,
    followersCount: countRow?.count ?? 0,
  });
});

// Leave a rating / review for a store (Natural number 1..5)
sellerRoutes.post("/sellers/:id/reviews", async (c) => {
  const sellerId = c.req.param("id");
  const user = requireUser(c);
  assertCsrf(c);

  if (user.id === sellerId) {
    throw new HttpError(400, "SELF_REVIEW", "Vous ne pouvez pas noter votre propre boutique.");
  }

  const body = await parseJson(c, storeReviewSchema);
  const reviewId = randomId();
  const now = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO store_reviews (id, store_seller_id, reviewer_id, rating, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_seller_id, reviewer_id) DO UPDATE SET
       rating = excluded.rating,
       comment = excluded.comment,
       created_at = excluded.created_at`,
  )
    .bind(reviewId, sellerId, user.id, body.rating, body.comment?.trim() || null, now)
    .run();

  const stats = await c.env.DB.prepare(
    `SELECT CAST(ROUND(AVG(rating)) AS INTEGER) AS avg_rating, COUNT(*) AS count
     FROM store_reviews WHERE store_seller_id = ?`,
  )
    .bind(sellerId)
    .first<{ avg_rating: number; count: number }>();

  return c.json({
    averageRating: stats?.avg_rating ?? body.rating,
    reviewsCount: stats?.count ?? 1,
  });
});

// Get reviews for a store
sellerRoutes.get("/sellers/:id/reviews", async (c) => {
  const sellerId = c.req.param("id");
  const reviews = await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.comment, r.created_at, sp.display_name AS reviewer_name
     FROM store_reviews r
     JOIN users u ON u.id = r.reviewer_id
     LEFT JOIN seller_profiles sp ON sp.user_id = u.id
     WHERE r.store_seller_id = ?
     ORDER BY r.created_at DESC
     LIMIT 20`,
  )
    .bind(sellerId)
    .all<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string;
      reviewer_name: string | null;
    }>();

  return c.json({
    reviews: (reviews.results ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      reviewerName: r.reviewer_name ?? "Client",
    })),
  });
});

// Reorder merchant's listings
sellerRoutes.post("/sellers/my-store/reorder", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const body = await parseJson(c, reorderListingsSchema);

  // Update order for each listing in batch
  const queries = body.listingIds.map((listingId, index) =>
    c.env.DB.prepare("UPDATE listings SET sort_order = ? WHERE id = ? AND seller_id = ?").bind(
      index,
      listingId,
      user.id,
    ),
  );

  // Also save the JSON array on the profile
  queries.push(
    c.env.DB.prepare("UPDATE seller_profiles SET custom_sort_order = ? WHERE user_id = ?").bind(
      JSON.stringify(body.listingIds),
      user.id,
    ),
  );

  await c.env.DB.batch(queries);

  return c.json({ ok: true, count: body.listingIds.length });
});
