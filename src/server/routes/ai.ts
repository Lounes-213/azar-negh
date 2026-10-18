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
export interface BotProductCard {
  id: string;
  title: string;
  priceDa: number;
  originalPriceDa?: number | null;
  wilayaName: string;
  condition: string;
  itemType: string;
  imageUrl: string | null;
}

interface CatalogContextResult {
  contextText: string;
  candidates: BotProductCard[];
}

const STOPWORDS = new Set([
  "salam", "bonjour", "salut", "svp", "merci", "wach", "kayen", "3ndkum", "andi", "hab", "bghit",
  "les", "des", "une", "pour", "dans", "avec", "sur", "par", "est", "sont", "quel", "quelle",
  "من", "في", "على", "إلى", "هل", "عندكم", "كاين", "سلام", "عليكم", "حاب", "نحوس", "اريد", "بدي", "عطيني", "واش", "عندك"
]);

/**
 * Extracts searchable keywords from a query string.
 */
function extractKeywords(query?: string): string[] {
  if (!query) return [];
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 5);
}

/**
 * Loads a compact, token-efficient serialization of approved listings for AI reasoning
 * and collects candidate product cards with images.
 */
async function loadCatalogContext(db: D1Database, query?: string): Promise<CatalogContextResult> {
  try {
    const keywords = extractKeywords(query);
    let where = "l.status = 'APPROVED'";
    const params: string[] = [];

    if (keywords.length > 0) {
      const conditions = keywords.map(() => "(l.title LIKE ? OR l.description LIKE ?)");
      where += ` AND (${conditions.join(" OR ")})`;
      for (const kw of keywords) {
        params.push(`%${kw}%`, `%${kw}%`);
      }
    }

    let rows = await db
      .prepare(
        `SELECT l.id, l.title, l.price_da, l.original_price_da, l.condition, l.item_type,
                w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
                cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
                (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
         FROM listings l
         LEFT JOIN wilayas w ON w.id = l.wilaya_id
         LEFT JOIN categories cat ON cat.id = l.category_id
         WHERE ${where}
         ORDER BY (COALESCE(l.order_clicks, 0) + COALESCE(l.call_clicks, 0) + l.view_count) DESC, l.published_at DESC
         LIMIT 12`,
      )
      .bind(...params)
      .all<{
        id: string;
        title: string;
        price_da: number;
        original_price_da: number | null;
        condition: string;
        item_type: string;
        wilaya_name_fr: string;
        wilaya_name_ar: string;
        category_name_fr: string;
        category_name_ar: string;
        cover_id: string | null;
      }>();

    // If keyword query yielded 0 results, fall back to top general catalog
    if ((!rows.results || rows.results.length === 0) && keywords.length > 0) {
      rows = await db
        .prepare(
          `SELECT l.id, l.title, l.price_da, l.original_price_da, l.condition, l.item_type,
                  w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
                  cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
                  (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
           FROM listings l
           LEFT JOIN wilayas w ON w.id = l.wilaya_id
           LEFT JOIN categories cat ON cat.id = l.category_id
           WHERE l.status = 'APPROVED'
           ORDER BY (COALESCE(l.order_clicks, 0) + COALESCE(l.call_clicks, 0) + l.view_count) DESC, l.published_at DESC
           LIMIT 10`,
        )
        .all();
    }

    const results = rows.results || [];
    if (results.length === 0) {
      return { contextText: "لا توجد منتجات مسجلة حالياً.", candidates: [] };
    }

    const candidates: BotProductCard[] = results.map((r) => ({
      id: r.id,
      title: r.title,
      priceDa: r.price_da,
      originalPriceDa: r.original_price_da,
      wilayaName: r.wilaya_name_ar || r.wilaya_name_fr || "الجزائر",
      condition: r.condition,
      itemType: r.item_type || "PRODUCT",
      imageUrl: r.cover_id ? `/api/images/${r.cover_id}` : null,
    }));

    const contextText = results
      .map(
        (r) =>
          `- [${r.title}](/annonces/${r.id}) (ID: ${r.id}) | السعر: ${r.price_da} DA | الولاية: ${r.wilaya_name_ar || ""} (${r.wilaya_name_fr || ""}) | الفئة: ${r.category_name_ar || ""} | الحالة: ${r.condition || ""}`,
      )
      .join("\n");

    return { contextText, candidates };
  } catch (err) {
    console.error("loadCatalogContext error:", err);
    return { contextText: "لا توجد منتجات مسجلة حالياً.", candidates: [] };
  }
}

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(50),
  image: z
    .object({
      mimeType: z.string().max(50),
      data: z.string().max(7 * 1024 * 1024), // Max ~5MB binary base64
    })
    .optional(),
  userPersona: z
    .object({
      preferredWilaya: z.string().max(100).optional(),
      recentSearches: z.array(z.string().max(100)).optional(),
      favoriteCategories: z.array(z.string().max(100)).optional(),
    })
    .passthrough()
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
  const actorKey = user ? `user:${user.id}` : `ip:${c.get("ipHash") || (await hashIp(c.env, ip))}`;

  // Rate limit: 30 chat messages per 10 minutes (prevents bot abuse while allowing fluid discussion)
  try {
    const limit = await consumeRateLimit(c.env.DB, `ai:chat:${actorKey}`, 30, 600);
    if (!limit.ok) {
      throw new HttpError(429, "RATE_LIMITED", "Veuillez patienter un moment avant de renvoyer un message.");
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Database rate limit table degradation fallback: continue gracefully
  }

  let raw: any;
  try {
    raw = await c.req.json();
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        // keep raw
      }
    }
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Le corps de la requête doit être un JSON valide.");
  }

  const parsed = chatSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "Données invalides.", {
      fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;

  const lastUserMsg = [...input.messages].reverse().find((m) => m.role === "user")?.content || "";

  // Extract catalog slice matching user search or recent products
  const catalogResult = await loadCatalogContext(c.env.DB, lastUserMsg);

  try {
    const rawReply = await chatWithAzarBot(
      c.env,
      input.messages,
      catalogResult.contextText,
      input.userPersona,
      input.lang || "ar",
      input.image,
    );

    // Extract product IDs if suggested by AI: [MATCHED_PRODUCTS: id1, id2, id3]
    let reply = rawReply;
    const matchedProducts: BotProductCard[] = [];
    const matchedTagRegex = /\[MATCHED_PRODUCTS:\s*([a-zA-Z0-9_,\s-]+)\]/i;
    const match = matchedTagRegex.exec(rawReply);

    if (match && match[1]) {
      reply = rawReply.replace(matchedTagRegex, "").trim();
      const ids = match[1]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      for (const id of ids) {
        const found = catalogResult.candidates.find((p) => p.id === id);
        if (found && !matchedProducts.some((p) => p.id === found.id)) {
          matchedProducts.push(found);
          if (matchedProducts.length >= 3) break;
        }
      }
    }

    // Also detect markdown links [Name](/annonces/id) if less than 3 matched products
    if (matchedProducts.length < 3) {
      const linkRegex = /\/annonces\/([a-zA-Z0-9_-]+)/g;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(reply)) !== null && matchedProducts.length < 3) {
        const id = linkMatch[1];
        const found = catalogResult.candidates.find((p) => p.id === id);
        if (found && !matchedProducts.some((p) => p.id === found.id)) {
          matchedProducts.push(found);
        }
      }
    }

    // If user provided an image and matched products are still empty, attach top relevant candidates (max 3)
    if (input.image && matchedProducts.length === 0 && catalogResult.candidates.length > 0) {
      matchedProducts.push(...catalogResult.candidates.slice(0, 3));
    }

    return c.json({
      reply,
      products: matchedProducts.slice(0, 3), // Strictly max 3 products
    });
  } catch (err) {
    console.error("chatWithAzarBot error:", err);
    return c.json({
      reply:
        input.lang === "ar"
          ? "مرحباً بك! أنا مساعد آزار الذكي. كيف يمكنني مساعدتك اليوم في تصفح المنتجات أو العثور على أفضل الأسعار بالقرب منك؟"
          : "Bonjour ! Je suis l'assistant Azar Bot. Comment puis-je vous aider à trouver les meilleures affaires et produits près de chez vous ?",
      products: [],
    });
  }
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
