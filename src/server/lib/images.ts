import type { Env } from "../types";
import { HttpError } from "./http";

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export function detectImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionFor(mime: ImageMime): string {
  return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
}

export function assertImagePayload(
  bytes: Uint8Array,
  declaredType: string,
  maxBytes: number,
): ImageMime {
  if (bytes.byteLength === 0) {
    throw new HttpError(422, "EMPTY_FILE", "Le fichier est vide.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Image trop lourde (5 Mo maximum).");
  }
  const detected = detectImageType(bytes);
  if (!detected) {
    throw new HttpError(
      422,
      "INVALID_IMAGE",
      "Format non pris en charge. Utilisez une image JPEG, PNG ou WebP.",
    );
  }
  if (declaredType && declaredType !== detected) {
    throw new HttpError(
      422,
      "TYPE_MISMATCH",
      "Le contenu du fichier ne correspond pas à son type.",
    );
  }
  return detected;
}

export async function deleteR2Object(env: Env, key: string): Promise<void> {
  try {
    await env.IMAGES.delete(key);
  } catch {
    // Object may already be gone; the D1 row is the source of truth.
  }
}

/** Removes uploads left unattached for more than 24 hours. */
export async function cleanupAbandonedUploads(env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await env.DB.prepare(
    "SELECT id, r2_key FROM listing_images WHERE listing_id IS NULL AND created_at < ? LIMIT 200",
  )
    .bind(cutoff)
    .all<{ id: string; r2_key: string }>();
  const items = rows.results ?? [];
  for (const item of items) {
    await deleteR2Object(env, item.r2_key);
  }
  if (items.length > 0) {
    const placeholders = items.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM listing_images WHERE id IN (${placeholders})`)
      .bind(...items.map((item) => item.id))
      .run();
  }
  return items.length;
}
