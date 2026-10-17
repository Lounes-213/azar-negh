import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, parseJson } from "../lib/http";
import { hashIp, requestIp } from "../lib/auth";
import { consumeRateLimit } from "../lib/rate-limit";
import {
  chatWithAzarBot,
  generateListingDescription,
  improveDescriptionText,
  translateDescriptionText,
} from "../lib/gemini";
import { z } from "zod";

export const aiRoutes = new Hono<AppEnv>();

/**
 * Loads a compact, token-efficient serialization of approved listings for AI reasoning.
 */
async function loadCatalogContext(db: D1Database, query?: string): Promise<string> {
  const where =
    query && query.trim()
      ? "l.status = 'APPROVED' AND (l.title LIKE ? OR l.description LIKE ?)"
      : "l.status = 'APPROVED'";
  const params = query && query.trim() ? [`%${query.trim()}%`, `%${query.trim()}%`] : [];

  const rows = await db
    .prepare(
      `SELECT l.id, l.title, l.price_da, l.condition, l.item_type,
              w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
              cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar
       FROM listings l
       JOIN wilayas w ON w.id = l.wilaya_id
       JOIN categories cat ON cat.id = l.category_id
       WHERE ${where}
       ORDER BY (COALESCE(l.order_clicks, 0) + COALESCE(l.call_clicks, 0) + l.view_count) DESC, l.published_at DESC
       LIMIT 25`,
    )
    .bind(...params)
    .all<{
      id: string;
      title: string;
      price_da: number;
      condition: string;
      item_type: string;
      wilaya_name_fr: string;
      wilaya_name_ar: string;
      category_name_fr: string;
      category_name_ar: string;
    }>();

  if (!rows.results || rows.results.length === 0) {
    return "لا توجد منتجات مسجلة حالياً تطابق هذا الطلب.";
  }

  return rows.results
    .map(
      (r) =>
        `- [${r.title}](/annonces/${r.id}) | السعر: ${r.price_da} DA | الولاية: ${r.wilaya_name_ar} (${r.wilaya_name_fr}) | الفئة: ${r.category_name_ar} | الحالة: ${r.condition}`,
    )
    .join("\n");
}

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string().max(1200),
      }),
    )
    .min(1)
    .max(25),
  userPersona: z
    .object({
      preferredWilaya: z.string().max(60).optional(),
      recentSearches: z.array(z.string().max(60)).max(10).optional(),
      favoriteCategories: z.array(z.string().max(60)).max(10).optional(),
    })
    .optional(),
  lang: z.enum(["fr", "ar"]).optional(),
});

/**
 * Intelligent shopping assistant chat endpoint.
 * Syncs user chat locally on client (no chat logs saved in DB = 100% free & private).
 */
aiRoutes.post("/ai/chat", async (c) => {
  const user = c.get("user");
  const ip = requestIp(c);
  const actorKey = user ? `user:${user.id}` : `ip:${await hashIp(c.env, ip)}`;

  // Rate limit: 30 chat messages per 10 minutes (prevents bot abuse while allowing fluid discussion)
  const limit = await consumeRateLimit(c.env.DB, `ai:chat:${actorKey}`, 30, 600);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Veuillez patienter un moment avant de renvoyer un message.");
  }

  const input = await parseJson(c, chatSchema);
  const lastUserMsg = [...input.messages].reverse().find((m) => m.role === "user")?.content || "";

  // Extract keywords to retrieve matching catalog slice
  const catalogContext = await loadCatalogContext(c.env.DB, lastUserMsg.slice(0, 40));

  const reply = await chatWithAzarBot(
    c.env,
    input.messages,
    catalogContext,
    input.userPersona,
    input.lang || "ar",
  );

  return c.json({ reply });
});

const aiAssistSchema = z.object({
  action: z.enum(["generate", "improve", "translate"]),
  title: z.string().max(120).optional(),
  categoryName: z.string().max(80).optional(),
  wilayaName: z.string().max(80).optional(),
  priceDa: z.number().nonnegative().optional(),
  condition: z.string().max(40).optional(),
  itemType: z.string().max(40).optional(),
  text: z.string().max(4000).optional(),
  lang: z.enum(["fr", "ar"]).optional(),
  targetLang: z.enum(["fr", "ar"]).optional(),
});

aiRoutes.post("/ai/assist", async (c) => {
  const user = c.get("user");
  const ip = requestIp(c);
  const actorKey = user ? `user:${user.id}` : `ip:${await hashIp(c.env, ip)}`;

  // Rate limit: 40 AI queries per hour
  const limit = await consumeRateLimit(c.env.DB, `ai:assist:${actorKey}`, 40, 3600);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Limite de requêtes IA atteinte pour cette heure.");
  }

  const input = await parseJson(c, aiAssistSchema);

  if (input.action === "generate") {
    if (!input.title || input.title.trim().length < 2) {
      throw new HttpError(422, "TITLE_REQUIRED", "Un titre est requis pour générer la description.");
    }
    const text = await generateListingDescription(c.env, {
      title: input.title,
      categoryName: input.categoryName,
      wilayaName: input.wilayaName,
      priceDa: input.priceDa,
      condition: input.condition,
      itemType: input.itemType,
      lang: input.lang,
    });
    return c.json({ text });
  }

  if (input.action === "improve") {
    if (!input.text || input.text.trim().length < 5) {
      throw new HttpError(422, "TEXT_TOO_SHORT", "Le texte à améliorer est trop court.");
    }
    const text = await improveDescriptionText(c.env, input.text, input.lang);
    return c.json({ text });
  }

  if (input.action === "translate") {
    if (!input.text || input.text.trim().length < 3) {
      throw new HttpError(422, "TEXT_TOO_SHORT", "Le texte à traduire est trop court.");
    }
    const targetLang = input.targetLang || (input.lang === "ar" ? "fr" : "ar");
    const text = await translateDescriptionText(c.env, input.text, targetLang);
    return c.json({ text });
  }

  throw new HttpError(400, "INVALID_ACTION", "Action non supportée.");
});
