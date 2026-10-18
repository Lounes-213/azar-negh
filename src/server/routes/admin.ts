import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { AdminStats, AdminUser, AuditEntry, ListingStatus, Role } from "../../shared/types";
import {
  adminListingActionSchema,
  adminUserUpdateSchema,
  categoryInputSchema,
  paginationSchema,
} from "../../shared/validation";
import { HttpError, nowIso, pageCount, parseJson, parseQuery } from "../lib/http";
import { assertCsrf, assertAdminOrSecret, revokeAllSessions } from "../lib/auth";
import { recordAudit } from "../lib/audit";
import { notifyUser } from "../lib/notifications";
import { testAiProvider, getActiveAiConfig } from "../lib/gemini";

export const adminRoutes = new Hono<AppEnv>();

const ALL_STATUSES: ListingStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SOLD",
  "ARCHIVED",
];

adminRoutes.get("/admin/overview", async (c) => {
  assertAdminOrSecret(c);
  const [userCount, listingStats, volumeRow, openReports, pendingCount] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>(),
    c.env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM listings GROUP BY status",
    ).all<{ status: ListingStatus; count: number }>(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(price_da), 0) AS total_volume FROM listings WHERE status = 'APPROVED'",
    ).first<{ total_volume: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'OPEN'").first<{
      count: number;
    }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM listings WHERE status = 'PENDING'").first<{
      count: number;
    }>(),
  ]);

  let activeListings = 0;
  for (const row of listingStats.results ?? []) {
    if (row.status === "APPROVED") activeListings = row.count;
  }

  const aiConfig = await getActiveAiConfig(c.env);

  return c.json({
    totalRevenueVolumeDa: volumeRow?.total_volume ?? 0,
    totalUsers: userCount?.total ?? 0,
    activeListings,
    pendingModeration: pendingCount?.count ?? 0,
    openReports: openReports?.count ?? 0,
    aiProvider: aiConfig.provider,
    activeGeminiModel: `${aiConfig.model} (${aiConfig.keys.length} clés actives)`,
    keysCount: aiConfig.keys.length,
  });
});

adminRoutes.get("/admin/stats", async (c) => {
  assertAdminOrSecret(c);
  const [userStats, listingStats, reports, oldestPending] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
              SUM(CASE WHEN role IN ('MODERATOR','ADMIN') THEN 1 ELSE 0 END) AS staff
       FROM users`,
    ).first<{ total: number; suspended: number | null; staff: number | null }>(),
    c.env.DB.prepare("SELECT status, COUNT(*) AS count FROM listings GROUP BY status").all<{
      status: ListingStatus;
      count: number;
    }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'OPEN'").first<{
      count: number;
    }>(),
    c.env.DB.prepare(
      "SELECT MIN(submitted_at) AS oldest FROM listings WHERE status = 'PENDING'",
    ).first<{ oldest: string | null }>(),
  ]);

  const listings = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<
    ListingStatus,
    number
  >;
  for (const row of listingStats.results ?? []) listings[row.status] = row.count;

  const stats: AdminStats = {
    users: {
      total: userStats?.total ?? 0,
      suspended: userStats?.suspended ?? 0,
      moderators: userStats?.staff ?? 0,
    },
    listings,
    reports: { open: reports?.count ?? 0 },
    pendingOldest: oldestPending?.oldest ?? null,
  };
  return c.json({ stats });
});

adminRoutes.get("/admin/users", async (c) => {
  assertAdminOrSecret(c);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const role = c.req.query("role");
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    where.push("(u.email LIKE ? OR p.display_name LIKE ?)");
    const term = `%${q.replace(/[\\%_]/g, "")}%`;
    params.push(term, term);
  }
  if (role && ["USER", "MODERATOR", "ADMIN"].includes(role)) {
    where.push("u.role = ?");
    params.push(role);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * perPage;

  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.role, u.status, u.created_at, u.last_login_at,
              p.display_name, p.phone, w.name_fr AS wilaya_name,
              (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id) AS listings_count
       FROM users u
       LEFT JOIN seller_profiles p ON p.user_id = u.id
       LEFT JOIN wilayas w ON w.id = p.wilaya_id
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...params, perPage, offset)
      .all<{
        id: string;
        email: string;
        role: Role;
        status: "ACTIVE" | "SUSPENDED";
        created_at: string;
        last_login_at: string | null;
        display_name: string | null;
        phone: string | null;
        wilaya_name: string | null;
        listings_count: number;
      }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM users u LEFT JOIN seller_profiles p ON p.user_id = u.id ${whereSql}`,
    )
      .bind(...params)
      .first<{ count: number }>(),
  ]);

  const total = count?.count ?? 0;
  return c.json({
    users: {
      items: (rows.results ?? []).map(
        (row): AdminUser => ({
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          displayName: row.display_name,
          phone: row.phone,
          wilayaName: row.wilaya_name || "Algérie",
          createdAt: row.created_at,
          lastLoginAt: row.last_login_at,
          listingsCount: row.listings_count,
        }),
      ),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

adminRoutes.patch("/admin/users/:id", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const input = await parseJson(c, adminUserUpdateSchema);
  if (id === admin.id) {
    throw new HttpError(
      403,
      "SELF_MODIFICATION",
      "Vous ne pouvez pas modifier votre propre compte.",
    );
  }
  const target = await c.env.DB.prepare("SELECT id, email, role, status FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string; email: string; role: Role; status: "ACTIVE" | "SUSPENDED" }>();
  if (!target) throw new HttpError(404, "NOT_FOUND", "Utilisateur introuvable.");

  const nextRole = input.role ?? target.role;
  const nextStatus = input.status ?? target.status;
  // Protection: Un administrateur ne peut pas retirer les droits d'administration ni suspendre un autre administrateur
  if (target.role === "ADMIN" && (nextRole !== "ADMIN" || nextStatus !== "ACTIVE")) {
    throw new HttpError(
      403,
      "CANNOT_DEMOTE_ADMIN",
      "Un administrateur ne peut pas retirer les privilèges d'administration ni suspendre un autre administrateur.",
    );
  }

  await c.env.DB.prepare("UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(nextRole, nextStatus, nowIso(), id)
    .run();
  if (nextStatus === "SUSPENDED") {
    await revokeAllSessions(c.env, id);
  }
  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: "ADMIN_USER_UPDATED",
    entityType: "user",
    entityId: id,
    metadata: {
      from: { role: target.role, status: target.status },
      to: { role: nextRole, status: nextStatus },
    },
  });
  await notifyUser(c.env, {
    userId: id,
    type: "ACCOUNT_UPDATED",
    title: "Votre compte a été mis à jour",
    body:
      nextStatus === "SUSPENDED"
        ? "Votre compte est suspendu. Contactez le support."
        : `Nouveau rôle : ${nextRole}.`,
    link: "/compte",
  });
  return c.json({ user: { id, role: nextRole, status: nextStatus } });
});

adminRoutes.get("/admin/categories", async (c) => {
  assertAdminOrSecret(c);
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name_fr, c.name_ar, c.parent_id, c.icon, c.sort_order, c.is_active,
            (SELECT COUNT(*) FROM listings l WHERE l.category_id = c.id) AS listing_count
     FROM categories c
     ORDER BY c.sort_order ASC, c.name_fr ASC`,
  ).all<{
    id: number;
    slug: string;
    name_fr: string;
    name_ar: string;
    parent_id: number | null;
    icon: string;
    sort_order: number;
    is_active: number;
    listing_count: number;
  }>();
  return c.json({
    categories: (rows.results ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      nameFr: row.name_fr,
      nameAr: row.name_ar,
      parentId: row.parent_id,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: row.is_active === 1,
      listingCount: row.listing_count,
    })),
  });
});

adminRoutes.post("/admin/categories", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const input = await parseJson(c, categoryInputSchema);
  if (input.parentId) {
    const parent = await c.env.DB.prepare("SELECT id, parent_id FROM categories WHERE id = ?")
      .bind(input.parentId)
      .first<{ id: number; parent_id: number | null }>();
    if (!parent) throw new HttpError(422, "UNKNOWN_PARENT", "Catégorie parente inconnue.");
    if (parent.parent_id !== null) {
      throw new HttpError(422, "DEPTH_EXCEEDED", "La hiérarchie est limitée à deux niveaux.");
    }
  }
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO categories (slug, name_fr, name_ar, parent_id, icon, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.slug,
        input.nameFr,
        input.nameAr,
        input.parentId ?? null,
        input.icon,
        input.sortOrder,
        input.isActive ? 1 : 0,
        nowIso(),
        nowIso(),
      )
      .run();
    await recordAudit(c.env.DB, {
      actorId: admin.id,
      action: "CATEGORY_CREATED",
      entityType: "category",
      entityId: String(result.meta.last_row_id ?? ""),
      metadata: { slug: input.slug },
    });
    return c.json({ category: { id: result.meta.last_row_id, ...input } }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new HttpError(409, "SLUG_TAKEN", "Ce slug de catégorie existe déjà.");
    }
    throw error;
  }
});

adminRoutes.patch("/admin/categories/:id", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(422, "INVALID_ID", "Identifiant invalide.");
  const input = await parseJson(c, categoryInputSchema);
  const current = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first();
  if (!current) throw new HttpError(404, "NOT_FOUND", "Catégorie introuvable.");
  if (input.parentId === id) {
    throw new HttpError(422, "SELF_PARENT", "Une catégorie ne peut pas être son propre parent.");
  }
  if (input.parentId) {
    const parent = await c.env.DB.prepare("SELECT id, parent_id FROM categories WHERE id = ?")
      .bind(input.parentId)
      .first<{ id: number; parent_id: number | null }>();
    if (!parent) throw new HttpError(422, "UNKNOWN_PARENT", "Catégorie parente inconnue.");
    if (parent.parent_id !== null) {
      throw new HttpError(422, "DEPTH_EXCEEDED", "La hiérarchie est limitée à deux niveaux.");
    }
    if (input.parentId === id) {
      throw new HttpError(422, "SELF_PARENT", "Une catégorie ne peut pas être son propre parent.");
    }
  }
  try {
    await c.env.DB.prepare(
      `UPDATE categories SET slug = ?, name_fr = ?, name_ar = ?, parent_id = ?, icon = ?,
         sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(
        input.slug,
        input.nameFr,
        input.nameAr,
        input.parentId ?? null,
        input.icon,
        input.sortOrder,
        input.isActive ? 1 : 0,
        nowIso(),
        id,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new HttpError(409, "SLUG_TAKEN", "Ce slug de catégorie existe déjà.");
    }
    throw error;
  }
  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: "CATEGORY_UPDATED",
    entityType: "category",
    entityId: String(id),
    metadata: { slug: input.slug, isActive: input.isActive },
  });
  return c.json({ category: { id, ...input } });
});

adminRoutes.delete("/admin/categories/:id", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, "INVALID_ID", "Identifiant invalide.");
  
  const countRow = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM listings WHERE category_id = ?")
    .bind(id)
    .first<{ count: number }>();
  if ((countRow?.count ?? 0) > 0) {
    throw new HttpError(409, "CATEGORY_IN_USE", "Impossible de supprimer une catégorie contenant des annonces.");
  }
  await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: "CATEGORY_DELETED",
    entityType: "category",
    entityId: String(id),
    metadata: {},
  });
  return c.json({ success: true, id });
});

adminRoutes.get("/admin/listings", async (c) => {
  assertAdminOrSecret(c);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const status = c.req.query("status");
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const where: string[] = [];
  const params: unknown[] = [];
  if (status && ALL_STATUSES.includes(status as ListingStatus)) {
    where.push("l.status = ?");
    params.push(status);
  }
  if (q) {
    where.push("l.title LIKE ?");
    params.push(`%${q.replace(/[\\%_]/g, "")}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * perPage;

  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.id, l.title, l.description, l.status, l.price_da, l.created_at, l.published_at,
              w.name_fr AS wilaya_name, c.name_fr AS category_name,
              u.email AS seller_email, sp.display_name AS seller_name,
              (SELECT COUNT(*) FROM listing_images i WHERE i.listing_id = l.id) AS images,
              (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
       FROM listings l
       JOIN users u ON u.id = l.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = l.seller_id
       LEFT JOIN wilayas w ON w.id = l.wilaya_id
       LEFT JOIN categories c ON c.id = l.category_id
       ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...params, perPage, offset)
      .all<{
        id: string;
        title: string;
        description: string | null;
        status: ListingStatus;
        price_da: number;
        created_at: string;
        published_at: string | null;
        wilaya_name: string | null;
        category_name: string | null;
        seller_email: string;
        seller_name: string | null;
        images: number;
        cover_id: string | null;
      }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM listings l ${whereSql}`)
      .bind(...params)
      .first<{ count: number }>(),
  ]);
  const total = count?.count ?? 0;
  return c.json({
    listings: {
      items: (rows.results ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        status: row.status,
        priceDa: row.price_da,
        createdAt: row.created_at,
        publishedAt: row.published_at,
        wilayaName: row.wilaya_name || "Algérie",
        categoryName: row.category_name || "Catégorie",
        sellerEmail: row.seller_email,
        sellerName: row.seller_name || row.seller_email,
        images: row.images,
        coverImage: row.cover_id ? `/api/images/${row.cover_id}` : null,
      })),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

adminRoutes.patch("/admin/listings/:id/status", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ status: ListingStatus; reason?: string }>();
  if (!ALL_STATUSES.includes(body.status)) {
    throw new HttpError(422, "INVALID_STATUS", "Statut invalide.");
  }
  const listing = await c.env.DB.prepare("SELECT id, seller_id, title, status FROM listings WHERE id = ?")
    .bind(id)
    .first<{ id: string; seller_id: string; title: string; status: ListingStatus }>();
  if (!listing) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");

  const now = nowIso();
  await c.env.DB.prepare(
    `UPDATE listings SET status = ?, updated_at = ?,
       published_at = CASE WHEN ? = 'APPROVED' THEN ? ELSE published_at END,
       archived_at = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_at END
     WHERE id = ?`,
  ).bind(body.status, now, body.status, now, body.status, now, id).run();

  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: `ADMIN_LISTING_${body.status}`,
    entityType: "listing",
    entityId: id,
    metadata: { from: listing.status, to: body.status, reason: body.reason },
  });

  await notifyUser(c.env, {
    userId: listing.seller_id,
    type: body.status === "APPROVED" ? "LISTING_APPROVED" : "LISTING_REMOVED",
    title: `Statut de votre annonce : ${body.status}`,
    body: listing.title,
    link: `/annonces/${id}`,
  });

  return c.json({ listing: { id, status: body.status } });
});

adminRoutes.post("/admin/listings/:id/action", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const id = c.req.param("id");
  await parseJson(c, adminListingActionSchema);
  const listing = await c.env.DB.prepare(
    "SELECT id, seller_id, title, status FROM listings WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; seller_id: string; title: string; status: ListingStatus }>();
  if (!listing) throw new HttpError(404, "NOT_FOUND", "Annonce introuvable.");
  if (listing.status === "ARCHIVED") {
    throw new HttpError(409, "ALREADY_ARCHIVED", "Cette annonce est déjà archivée.");
  }
  await c.env.DB.prepare(
    "UPDATE listings SET status = 'ARCHIVED', archived_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), nowIso(), id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: "ADMIN_LISTING_ARCHIVED",
    entityType: "listing",
    entityId: id,
    metadata: { from: listing.status },
  });
  await notifyUser(c.env, {
    userId: listing.seller_id,
    type: "LISTING_REMOVED",
    title: "Votre annonce a été retirée",
    body: listing.title,
    link: "/compte/annonces",
  });
  return c.json({ listing: { id, status: "ARCHIVED" } });
});

adminRoutes.get("/admin/wilayas", async (c) => {
  assertAdminOrSecret(c);
  const rows = await c.env.DB.prepare(
    `SELECT w.id, w.code, w.name_fr, w.name_ar,
            (SELECT COUNT(*) FROM listings l WHERE l.wilaya_id = w.id) AS listings_count
     FROM wilayas w
     ORDER BY CAST(w.code AS INTEGER) ASC`,
  ).all<{ id: number; code: string; name_fr: string; name_ar: string; listings_count: number }>();

  return c.json({
    wilayas: (rows.results ?? []).map((w) => ({
      id: w.id,
      code: w.code,
      nameFr: w.name_fr,
      nameAr: w.name_ar,
      active: true,
      listingsCount: w.listings_count,
    })),
  });
});

adminRoutes.patch("/admin/wilayas/:id", async (c) => {
  assertAdminOrSecret(c);
  assertCsrf(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ nameFr?: string; nameAr?: string }>();
  if (body.nameFr || body.nameAr) {
    await c.env.DB.prepare(
      "UPDATE wilayas SET name_fr = COALESCE(?, name_fr), name_ar = COALESCE(?, name_ar) WHERE id = ?",
    )
      .bind(body.nameFr ?? null, body.nameAr ?? null, id)
      .run();
  }
  return c.json({ success: true, id });
});

adminRoutes.get("/admin/reports", async (c) => {
  assertAdminOrSecret(c);
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.listing_id, r.reason, r.details, r.status, r.created_at,
            l.title AS listing_title, l.status AS listing_status,
            sp.display_name AS reporter_name
     FROM reports r
     JOIN listings l ON l.id = r.listing_id
     LEFT JOIN seller_profiles sp ON sp.user_id = r.reporter_id
     ORDER BY r.created_at DESC
     LIMIT 100`,
  ).all<{
    id: string;
    listing_id: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    listing_title: string;
    listing_status: string;
    reporter_name: string | null;
  }>();

  return c.json({
    reports: (rows.results ?? []).map((r) => ({
      id: r.id,
      listingId: r.listing_id,
      listingTitle: r.listing_title,
      reporterName: r.reporter_name || "Anonyme",
      reason: r.reason,
      details: r.details || "",
      status: r.status === "OPEN" ? "PENDING" : r.status,
      createdAt: Date.parse(r.created_at) || Date.now(),
    })),
  });
});

adminRoutes.patch("/admin/reports/:id", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ status: "RESOLVED" | "DISMISSED" }>();
  await c.env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?")
    .bind(body.status === "DISMISSED" ? "DISMISSED" : "RESOLVED", id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: `REPORT_${body.status}`,
    entityType: "report",
    entityId: id,
    metadata: { status: body.status },
  });
  return c.json({ success: true, id, status: body.status });
});

adminRoutes.get("/admin/ai-config", async (c) => {
  assertAdminOrSecret(c);
  const rows = await c.env.DB.prepare(
    "SELECT id, provider, model_name, api_keys, is_active, settings_json, updated_at FROM ai_config ORDER BY updated_at DESC",
  ).all<{
    id: string;
    provider: string;
    model_name: string;
    api_keys: string;
    is_active: number;
    settings_json: string | null;
    updated_at: string;
  }>();

  const configs = (rows.results ?? []).map((row) => {
    let keys: string[] = [];
    try {
      keys = JSON.parse(row.api_keys);
    } catch {}
    const maskedKeys = keys.map((k) => {
      const s = String(k).trim();
      if (s.length <= 10) return "••••••••";
      return `${s.slice(0, 10)}...${s.slice(-4)}`;
    });
    return {
      id: row.id,
      provider: row.provider,
      modelName: row.model_name,
      keysCount: keys.length,
      keysMasked: maskedKeys,
      isActive: row.is_active === 1,
      settings: row.settings_json ? JSON.parse(row.settings_json) : null,
      updatedAt: row.updated_at,
    };
  });

  return c.json({ configs });
});

adminRoutes.post("/admin/ai-config", async (c) => {
  const admin = assertAdminOrSecret(c);
  assertCsrf(c);
  const body = await c.req.json<{
    id?: string;
    provider: string;
    modelName: string;
    apiKeys: string[];
    isActive?: boolean;
    settings?: any;
  }>();

  if (!body.provider || !body.modelName || !Array.isArray(body.apiKeys) || body.apiKeys.length === 0) {
    throw new HttpError(422, "INVALID_INPUT", "Fournisseur, modèle et au moins une clé API requis.");
  }

  const id = body.id || `${body.provider}_${Date.now()}`;
  const now = nowIso();
  const isActive = body.isActive ?? true;

  await c.env.DB.prepare(
    `INSERT INTO ai_config (id, provider, model_name, api_keys, is_active, settings_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider = excluded.provider,
       model_name = excluded.model_name,
       api_keys = excluded.api_keys,
       is_active = excluded.is_active,
       settings_json = excluded.settings_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      body.provider,
      body.modelName,
      JSON.stringify(body.apiKeys),
      isActive ? 1 : 0,
      body.settings ? JSON.stringify(body.settings) : null,
      now,
    )
    .run();

  await recordAudit(c.env.DB, {
    actorId: admin.id,
    action: "AI_CONFIG_SAVED",
    entityType: "ai_config",
    entityId: id,
    metadata: { provider: body.provider, model: body.modelName, keysCount: body.apiKeys.length },
  });

  return c.json({ success: true, id });
});

adminRoutes.patch("/admin/ai-config/:id/toggle", async (c) => {
  assertAdminOrSecret(c);
  assertCsrf(c);
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE ai_config SET is_active = 1 - is_active, updated_at = ? WHERE id = ?")
    .bind(nowIso(), id)
    .run();
  return c.json({ success: true, id });
});

adminRoutes.delete("/admin/ai-config/:id", async (c) => {
  assertAdminOrSecret(c);
  assertCsrf(c);
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM ai_config WHERE id = ?").bind(id).run();
  return c.json({ success: true, id });
});

adminRoutes.post("/admin/ai-config/test", async (c) => {
  assertAdminOrSecret(c);
  const body = await c.req.json<{
    provider: string;
    modelName: string;
    apiKey: string;
    prompt: string;
  }>();

  if (!body.provider || !body.modelName || !body.apiKey || !body.prompt) {
    throw new HttpError(422, "MISSING_FIELDS", "Champs de test incomplets.");
  }

  try {
    const res = await testAiProvider(body.provider, body.modelName, body.apiKey, body.prompt);
    return c.json({ success: true, text: res.text, latencyMs: res.latencyMs });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Erreur lors du test IA" }, 400);
  }
});

adminRoutes.get("/admin/audit", async (c) => {
  assertAdminOrSecret(c);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const offset = (page - 1) * perPage;
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT a.id, a.actor_id, a.action, a.entity_type, a.entity_id, a.metadata_json, a.created_at,
              u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(perPage, offset)
      .all<{
        id: string;
        actor_id: string | null;
        action: string;
        entity_type: string | null;
        entity_id: string | null;
        metadata_json: string | null;
        created_at: string;
        actor_email: string | null;
      }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs").first<{ count: number }>(),
  ]);
  const total = count?.count ?? 0;
  return c.json({
    entries: {
      items: (rows.results ?? []).map(
        (row): AuditEntry => ({
          id: row.id,
          actorId: row.actor_id,
          actorEmail: row.actor_email,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          metadata: null,
          createdAt: row.created_at,
        }),
      ),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});
