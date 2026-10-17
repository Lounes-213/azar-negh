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
import { assertCsrf, requireRole, revokeAllSessions } from "../lib/auth";
import { recordAudit } from "../lib/audit";
import { notifyUser } from "../lib/notifications";

export const adminRoutes = new Hono<AppEnv>();

const ALL_STATUSES: ListingStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SOLD",
  "ARCHIVED",
];

adminRoutes.get("/admin/stats", async (c) => {
  requireRole(c, ["ADMIN"]);
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
  requireRole(c, ["ADMIN"]);
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
              p.display_name,
              (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id) AS listings_count
       FROM users u
       LEFT JOIN seller_profiles p ON p.user_id = u.id
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
  const admin = requireRole(c, ["ADMIN"]);
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
  const losesAdmin =
    target.role === "ADMIN" &&
    target.status === "ACTIVE" &&
    (nextRole !== "ADMIN" || nextStatus !== "ACTIVE");
  if (losesAdmin) {
    const admins = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'",
    ).first<{ count: number }>();
    if ((admins?.count ?? 0) <= 1) {
      throw new HttpError(
        409,
        "LAST_ADMIN",
        "Le dernier administrateur actif ne peut pas être retiré.",
      );
    }
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
  requireRole(c, ["ADMIN"]);
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
  const admin = requireRole(c, ["ADMIN"]);
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
  const admin = requireRole(c, ["ADMIN"]);
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

adminRoutes.get("/admin/listings", async (c) => {
  requireRole(c, ["ADMIN"]);
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
      `SELECT l.id, l.title, l.status, l.price_da, l.created_at, l.published_at,
              u.email AS seller_email, sp.display_name AS seller_name,
              (SELECT COUNT(*) FROM listing_images i WHERE i.listing_id = l.id) AS images
       FROM listings l
       JOIN users u ON u.id = l.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = l.seller_id
       ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...params, perPage, offset)
      .all<{
        id: string;
        title: string;
        status: ListingStatus;
        price_da: number;
        created_at: string;
        published_at: string | null;
        seller_email: string;
        seller_name: string | null;
        images: number;
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
        status: row.status,
        priceDa: row.price_da,
        createdAt: row.created_at,
        publishedAt: row.published_at,
        sellerEmail: row.seller_email,
        sellerName: row.seller_name,
        images: row.images,
      })),
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
  });
});

adminRoutes.post("/admin/listings/:id/action", async (c) => {
  const admin = requireRole(c, ["ADMIN"]);
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

adminRoutes.get("/admin/audit", async (c) => {
  requireRole(c, ["ADMIN"]);
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
          metadata: row.metadata_json
            ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
            : null,
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
