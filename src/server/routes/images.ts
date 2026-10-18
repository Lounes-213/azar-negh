import { Hono } from "hono";
import type { AppEnv, Env } from "../types";
import { HttpError, nowIso } from "../lib/http";
import { assertCsrf, hashIp, requestIp, requireUser } from "../lib/auth";
import { randomId } from "../lib/crypto";
import { consumeRateLimit } from "../lib/rate-limit";
import { assertImagePayload, deleteR2Object, extensionFor } from "../lib/images";
import { recordAudit } from "../lib/audit";

export const imageRoutes = new Hono<AppEnv>();

interface ImageRow {
  id: string;
  listing_id: string | null;
  uploader_id: string;
  r2_key: string;
  content_type: string;
  size_bytes: number;
  listing_status: string | null;
  seller_id: string | null;
}

export async function attachImagesToNewListing(
  env: Env,
  listingId: string,
  uploaderId: string,
  imageIds: string[],
  maxImages: number,
): Promise<void> {
  if (imageIds.length > maxImages) {
    throw new HttpError(422, "TOO_MANY_IMAGES", `${maxImages} images maximum par annonce.`);
  }
  if (imageIds.length === 0) return;
  const unique = [...new Set(imageIds)];
  if (unique.length !== imageIds.length) {
    throw new HttpError(422, "DUPLICATE_IMAGES", "Image dupliquée.");
  }
  const placeholders = unique.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, uploader_id, listing_id FROM listing_images WHERE id IN (${placeholders})`,
  )
    .bind(...unique)
    .all<{ id: string; uploader_id: string; listing_id: string | null }>();

  const found = rows.results ?? [];
  if (found.length !== unique.length) {
    throw new HttpError(422, "UNKNOWN_IMAGE", "Une image est introuvable.");
  }
  for (const row of found) {
    if (row.uploader_id !== uploaderId || row.listing_id !== null) {
      throw new HttpError(403, "IMAGE_FORBIDDEN", "Image non autorisée.");
    }
  }
  const statements = unique.map((id, index) =>
    env.DB.prepare(
      "UPDATE listing_images SET listing_id = ?, position = ? WHERE id = ? AND uploader_id = ?",
    ).bind(listingId, index, id, uploaderId),
  );
  await env.DB.batch(statements);
}

export async function syncListingImages(
  env: Env,
  listingId: string,
  uploaderId: string,
  imageIds: string[],
  maxImages: number,
): Promise<void> {
  if (imageIds.length > maxImages) {
    throw new HttpError(422, "TOO_MANY_IMAGES", `${maxImages} images maximum par annonce.`);
  }
  const unique = [...new Set(imageIds)];
  if (unique.length !== imageIds.length) {
    throw new HttpError(422, "DUPLICATE_IMAGES", "Image dupliquée.");
  }

  const current = await env.DB.prepare("SELECT id, r2_key FROM listing_images WHERE listing_id = ?")
    .bind(listingId)
    .all<{ id: string; r2_key: string }>();
  const currentRows = current.results ?? [];
  const keep = new Set(unique);
  const toRemove = currentRows.filter((row) => !keep.has(row.id));

  for (const row of toRemove) {
    await deleteR2Object(env, row.r2_key);
  }
  if (toRemove.length > 0) {
    const placeholders = toRemove.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM listing_images WHERE id IN (${placeholders})`)
      .bind(...toRemove.map((row) => row.id))
      .run();
  }

  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < unique.length; index += 1) {
    const id = unique[index]!;
    statements.push(
      env.DB.prepare(
        "UPDATE listing_images SET listing_id = ?, position = ? WHERE id = ? AND uploader_id = ? AND (listing_id IS NULL OR listing_id = ?)",
      ).bind(listingId, index, id, uploaderId, listingId),
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);

  const finalCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ?",
  )
    .bind(listingId)
    .first<{ count: number }>();
  if ((finalCount?.count ?? 0) !== unique.length) {
    throw new HttpError(422, "UNKNOWN_IMAGE", "Une image est introuvable ou déjà utilisée.");
  }
}

imageRoutes.post("/images", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  if (!user.profileComplete) {
    throw new HttpError(
      403,
      "PROFILE_INCOMPLETE",
      "Complétez votre profil avant d'ajouter des images.",
    );
  }
  const ipHash = await hashIp(c.env, requestIp(c));
  const limit = await consumeRateLimit(c.env.DB, `upload:user:${user.id}`, 40, 3600);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Trop d'envois d'images. Réessayez plus tard.", {
      retryAfter: limit.retryAfterSeconds,
    });
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new HttpError(400, "INVALID_FORM", "Envoi multipart invalide.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new HttpError(422, "MISSING_FILE", "Aucun fichier reçu.");
  }
  const maxBytes = Number(c.env.MAX_IMAGE_BYTES || "5242880");
  if (file.size > maxBytes) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Image trop lourde (5 Mo maximum).");
  }

  const buffer = await file.arrayBuffer();
  const mime = assertImagePayload(new Uint8Array(buffer), file.type, maxBytes);
  const id = randomId();
  const key = `listings/${user.id}/${id}.${extensionFor(mime)}`;

  await c.env.IMAGES.put(key, buffer, {
    httpMetadata: { contentType: mime, cacheControl: "private, max-age=0" },
    customMetadata: { uploader: user.id, imageId: id },
  });

  try {
    await c.env.DB.prepare(
      "INSERT INTO listing_images (id, listing_id, uploader_id, r2_key, content_type, size_bytes, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)",
    )
      .bind(id, user.id, key, mime, file.size, nowIso())
      .run();
  } catch (error) {
    await deleteR2Object(c.env, key);
    throw error;
  }

  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "IMAGE_UPLOADED",
    entityType: "image",
    entityId: id,
    metadata: { bytes: file.size, mime },
    ipHash,
  });

  return c.json({ image: { id, url: `/api/images/${id}` } }, 201);
});

imageRoutes.delete("/images/:id", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT i.id, i.r2_key, i.uploader_id, i.listing_id, l.status AS listing_status
     FROM listing_images i LEFT JOIN listings l ON l.id = i.listing_id
     WHERE i.id = ?`,
  )
    .bind(id)
    .first<ImageRow>();
  if (!row || row.uploader_id !== user.id) {
    throw new HttpError(404, "NOT_FOUND", "Image introuvable.");
  }
  if (row.listing_id && row.listing_status !== "DRAFT" && row.listing_status !== "REJECTED") {
    throw new HttpError(409, "IMAGE_LOCKED", "Cette image est utilisée par une annonce publiée.");
  }
  await deleteR2Object(c.env, row.r2_key);
  await c.env.DB.prepare("DELETE FROM listing_images WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

imageRoutes.get("/images/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT i.id, i.r2_key, i.uploader_id, i.listing_id, i.content_type,
            l.status AS listing_status, l.seller_id
     FROM listing_images i
     LEFT JOIN listings l ON l.id = i.listing_id
     WHERE i.id = ?`,
  )
    .bind(id)
    .first<ImageRow>();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Image introuvable.");

  const viewer = c.get("user");
  const isPublic = row.listing_id !== null;
  const isPrivileged =
    viewer !== null &&
    (viewer.id === row.uploader_id ||
      viewer.id === row.seller_id ||
      viewer.role === "MODERATOR" ||
      viewer.role === "ADMIN");
  if (!isPublic && !isPrivileged) {
    throw new HttpError(404, "NOT_FOUND", "Image introuvable.");
  }

  const object = await c.env.IMAGES.get(row.r2_key);
  if (!object) throw new HttpError(404, "NOT_FOUND", "Image introuvable.");

  const headers = new Headers();
  headers.set("Content-Type", row.content_type);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");
  headers.set("Content-Length", String(object.size));
  headers.set(
    "Cache-Control",
    isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
  );
  headers.set("ETag", object.httpEtag);
  if (!isPublic) headers.set("Vary", "Cookie");

  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && (ifNoneMatch === object.httpEtag || ifNoneMatch.includes(object.httpEtag))) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
});

// Profile avatar endpoints
imageRoutes.get("/images/avatar/:userId/:filename", async (c) => {
  const userId = c.req.param("userId");
  const filename = c.req.param("filename");
  const key = `avatars/${userId}/${filename}`;
  const object = await c.env.IMAGES.get(key);
  if (!object) throw new HttpError(404, "NOT_FOUND", "Avatar introuvable.");

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "public, max-age=86400");
  if (object.httpEtag) {
    headers.set("ETag", object.httpEtag);
    const ifNoneMatch = c.req.header("if-none-match");
    if (ifNoneMatch && (ifNoneMatch === object.httpEtag || ifNoneMatch.includes(object.httpEtag))) {
      return new Response(null, { status: 304, headers });
    }
  }
  return new Response(object.body, { headers });
});

imageRoutes.post("/account/avatar", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new HttpError(400, "INVALID_FORM", "Envoi multipart invalide.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new HttpError(422, "MISSING_FILE", "Aucun fichier reçu.");
  }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Image trop lourde (5 Mo maximum).");
  }

  const buffer = await file.arrayBuffer();
  const mime = assertImagePayload(new Uint8Array(buffer), file.type, maxBytes);
  const ext = extensionFor(mime);
  const fileId = randomId();
  const newKey = `avatars/${user.id}/${fileId}.${ext}`;

  // If old avatar was stored in R2, delete it immediately to free space
  const currentUser = await c.env.DB.prepare("SELECT avatar_url FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ avatar_url: string | null }>();
  if (currentUser?.avatar_url && currentUser.avatar_url.includes("/api/images/avatar/")) {
    const parts = currentUser.avatar_url.split("/api/images/avatar/")[1];
    if (parts) {
      await deleteR2Object(c.env, `avatars/${parts}`);
    }
  }

  // Upload new avatar to R2
  await c.env.IMAGES.put(newKey, buffer, {
    httpMetadata: { contentType: mime, cacheControl: "public, max-age=86400" },
    customMetadata: { uploader: user.id },
  });

  const newAvatarUrl = `/api/images/avatar/${user.id}/${fileId}.${ext}`;
  await c.env.DB.prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?")
    .bind(newAvatarUrl, nowIso(), user.id)
    .run();

  return c.json({ avatarUrl: newAvatarUrl });
});

imageRoutes.delete("/account/avatar", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);

  const currentUser = await c.env.DB.prepare("SELECT avatar_url FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ avatar_url: string | null }>();
  if (currentUser?.avatar_url && currentUser.avatar_url.includes("/api/images/avatar/")) {
    const parts = currentUser.avatar_url.split("/api/images/avatar/")[1];
    if (parts) {
      await deleteR2Object(c.env, `avatars/${parts}`);
    }
  }

  await c.env.DB.prepare("UPDATE users SET avatar_url = NULL, updated_at = ? WHERE id = ?")
    .bind(nowIso(), user.id)
    .run();

  return c.json({ avatarUrl: null });
});
