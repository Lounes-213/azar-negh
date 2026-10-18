import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, parseJson } from "../lib/http";
import { hashIp, requestIp } from "../lib/auth";
import { consumeRateLimit } from "../lib/rate-limit";
import {
  autoFillListing,
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

const SYNONYM_MAP: Record<string, string[]> = {
  // Football / Sports
  كرة: ["ballon", "foot", "sport"],
  قدم: ["ballon", "foot", "sport"],
  كورة: ["ballon", "foot", "sport"],
  بالو: ["ballon", "foot", "sport"],
  ballon: ["كرة", "قدم", "foot", "sport"],
  foot: ["كرة", "قدم", "ballon", "sport"],
  football: ["كرة", "قدم", "ballon", "sport"],
  dabax: ["كرة", "قدم", "ballon", "sport"],

  // Phones & Smartphones
  هاتف: ["iphone", "samsung", "galaxy", "smartphone", "portable", "telephone", "tilifun"],
  هواتف: ["iphone", "samsung", "galaxy", "smartphone", "portable", "telephone", "tilifun"],
  تليفون: ["iphone", "samsung", "galaxy", "smartphone", "portable", "telephone", "tilifun"],
  تيليفون: ["iphone", "samsung", "galaxy", "smartphone", "portable", "telephone", "tilifun"],
  موبايل: ["iphone", "samsung", "galaxy", "smartphone", "portable", "telephone"],
  tilifun: ["iphone", "samsung", "galaxy", "smartphone", "portable", "telephone", "هاتف"],
  telephone: ["iphone", "samsung", "galaxy", "smartphone", "هاتف", "هواتف"],
  portable: ["iphone", "samsung", "galaxy", "smartphone", "هاتف", "هواتف"],
  smartphone: ["iphone", "samsung", "galaxy", "هاتف", "هواتف"],
  iphone: ["آيفون", "ايفون", "apple", "promax", "هاتف"],
  samsung: ["سامسونج", "سامسونغ", "galaxy", "ultra", "هاتف"],

  // Computers / Laptops
  حاسوب: ["macbook", "ordinateur", "laptop", "pc", "informatique"],
  كمبيوتر: ["macbook", "ordinateur", "laptop", "pc", "informatique"],
  بيسي: ["macbook", "ordinateur", "laptop", "pc"],
  ordinateur: ["macbook", "laptop", "pc", "حاسوب"],
  laptop: ["macbook", "ordinateur", "pc", "حاسوب"],
  macbook: ["apple", "laptop", "ordinateur", "حاسوب"],

  // Headphones / Audio
  سماعات: ["airpods", "ecouteurs", "casque", "audio"],
  ليزيكوتور: ["airpods", "ecouteurs", "casque"],
  ecouteurs: ["airpods", "سماعات"],
  airpods: ["سماعات", "apple", "ecouteurs"],

  // Cars / Auto Parts
  سيارة: ["voiture", "clio", "golf", "audi", "renault", "volkswagen", "jantes", "phares"],
  طوموبيل: ["voiture", "clio", "golf", "audi", "renault", "volkswagen", "jantes", "phares"],
  سيارات: ["voiture", "vehicules", "مركبات"],
  voiture: ["سيارة", "clio", "golf", "audi"],
  golf: ["volkswagen", "phares", "led", "سيارة"],
  clio: ["renault", "distribution", "سيارة"],
  audi: ["jantes", "sline", "سيارة"],
  جوانط: ["jantes", "audi", "aluminium"],
  jantes: ["جوانط", "audi", "roue"],
  أضواء: ["phares", "led", "golf"],
  phares: ["أضواء", "led", "golf"],

  // Traditional Berber / Pottery / Jewelry / Carpets
  زربية: ["tapis", "berbere", "laine"],
  زرابي: ["tapis", "berbere", "laine"],
  tapis: ["زربية", "berbere", "laine"],
  فخار: ["vase", "poterie", "argile", "terre"],
  مزهرية: ["vase", "poterie"],
  vase: ["فخار", "مزهرية", "poterie"],
  فضة: ["argent", "bracelet", "tabzimt", "bijoux"],
  مجوهرات: ["argent", "bracelet", "tabzimt", "bijoux"],
  bracelet: ["فضة", "tabzimt", "argent", "سوار"],
  tabzimt: ["فضة", "argent", "bracelet"],

  // Furniture / House
  صالون: ["salon", "canape", "fauteuil", "meuble"],
  salon: ["صالون", "angle", "canape"],
  طاولة: ["table", "manger", "chaises", "meuble"],
  طابلة: ["table", "manger", "chaises", "meuble"],
  table: ["طاولة", "manger", "bois", "chaises"],
  meuble: ["أثاث", "salon", "table"],
  أثاث: ["meubles", "salon", "table"],
};

/**
 * Extracts searchable keywords from a query string and expands them with multi-lingual synonyms.
 */
function extractKeywords(query?: string): string[] {
  if (!query) return [];
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  const expanded = new Set<string>();
  for (const w of words) {
    expanded.add(w);
    if (SYNONYM_MAP[w]) {
      for (const syn of SYNONYM_MAP[w]) {
        expanded.add(syn);
      }
    }
  }
  return Array.from(expanded).slice(0, 10);
}

/**
 * Loads a compact, token-efficient serialization of approved listings for AI reasoning
 * and collects candidate product cards with images.
 */
async function loadCatalogContext(db: D1Database, query?: string): Promise<CatalogContextResult> {
  try {
    const keywords = extractKeywords(query);
    const seenIds = new Set<string>();
    const allResults: any[] = [];

    // 1. If we have keywords, fetch keyword/synonym-matching listings first
    if (keywords.length > 0) {
      const conditions = keywords.map(
        () => "(l.title LIKE ? OR l.description LIKE ? OR cat.name_ar LIKE ? OR cat.name_fr LIKE ? OR w.name_ar LIKE ? OR w.name_fr LIKE ?)",
      );
      const params: string[] = [];
      for (const kw of keywords) {
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`);
      }

      const kwRows = await db
        .prepare(
          `SELECT l.id, l.title, l.description, l.price_da, l.original_price_da, l.condition, l.item_type,
                  w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
                  cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
                  (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
           FROM listings l
           LEFT JOIN wilayas w ON w.id = l.wilaya_id
           LEFT JOIN categories cat ON cat.id = l.category_id
           WHERE l.status = 'APPROVED' AND (${conditions.join(" OR ")})
           ORDER BY (COALESCE(l.order_clicks, 0) + COALESCE(l.call_clicks, 0) + l.view_count) DESC, l.published_at DESC
           LIMIT 20`,
        )
        .bind(...params)
        .all<any>();

      for (const row of kwRows.results || []) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          allResults.push(row);
        }
      }
    }

    // 2. ALWAYS append all other approved listings (up to 30) so the AI has full visibility of the platform inventory
    const generalRows = await db
      .prepare(
        `SELECT l.id, l.title, l.description, l.price_da, l.original_price_da, l.condition, l.item_type,
                w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
                cat.name_fr AS category_name_fr, cat.name_ar AS category_name_ar,
                (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
         FROM listings l
         LEFT JOIN wilayas w ON w.id = l.wilaya_id
         LEFT JOIN categories cat ON cat.id = l.category_id
         WHERE l.status = 'APPROVED'
         ORDER BY (COALESCE(l.order_clicks, 0) + COALESCE(l.call_clicks, 0) + l.view_count) DESC, l.published_at DESC
         LIMIT 30`,
      )
      .all<any>();

    for (const row of generalRows.results || []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        allResults.push(row);
      }
    }

    if (allResults.length === 0) {
      return { contextText: "لا توجد منتجات مسجلة حالياً في قاعدة البيانات.", candidates: [] };
    }

    const candidates: BotProductCard[] = allResults.map((r) => ({
      id: r.id,
      title: r.title,
      priceDa: r.price_da,
      originalPriceDa: r.original_price_da,
      wilayaName: r.wilaya_name_ar || r.wilaya_name_fr || "الجزائر",
      condition: r.condition,
      itemType: r.item_type || "PRODUCT",
      imageUrl: r.cover_id ? `/api/images/${r.cover_id}` : null,
    }));

    const contextText = allResults
      .map(
        (r) =>
          `- [${r.title}](/annonces/${r.id}) (ID: ${r.id}) | السعر: ${r.price_da} DA | الولاية: ${r.wilaya_name_ar || ""} (${r.wilaya_name_fr || ""}) | الفئة: ${r.category_name_ar || ""} (${r.category_name_fr || ""}) | الحالة: ${r.condition || "مستعمل"}${r.description ? ` | تفاصيل: ${r.description.slice(0, 100).replace(/\r?\n/g, " ")}` : ""}`,
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
  audio: z
    .object({
      mimeType: z.string().max(50),
      data: z.string().max(10 * 1024 * 1024), // Max ~7MB binary base64
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
  // When user provides audio, avoid extracting literal keywords from "استفسار صوتي"
  const searchQuery = input.audio ? undefined : lastUserMsg;

  // Extract catalog slice matching user search or recent products
  const catalogResult = await loadCatalogContext(c.env.DB, searchQuery);

  try {
    const rawReply = await chatWithAzarBot(
      c.env,
      input.messages,
      catalogResult.contextText,
      input.userPersona,
      input.lang || "ar",
      input.image,
      input.audio,
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
        let found = catalogResult.candidates.find((p) => p.id === id);
        if (!found) {
          try {
            const dbItem = await c.env.DB.prepare(
              `SELECT l.id, l.title, l.price_da, l.original_price_da, l.condition, l.item_type,
                      w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
                      (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
               FROM listings l
               LEFT JOIN wilayas w ON w.id = l.wilaya_id
               WHERE l.id = ? AND l.status = 'APPROVED' LIMIT 1`,
            )
              .bind(id)
              .first<any>();
            if (dbItem) {
              found = {
                id: dbItem.id,
                title: dbItem.title,
                priceDa: dbItem.price_da,
                originalPriceDa: dbItem.original_price_da,
                wilayaName: dbItem.wilaya_name_ar || dbItem.wilaya_name_fr || "الجزائر",
                condition: dbItem.condition,
                itemType: dbItem.item_type || "PRODUCT",
                imageUrl: dbItem.cover_id ? `/api/images/${dbItem.cover_id}` : null,
              };
            }
          } catch {}
        }
        if (found && !matchedProducts.some((p) => p.id === found!.id)) {
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
        let found = catalogResult.candidates.find((p) => p.id === id);
        if (!found) {
          try {
            const dbItem = await c.env.DB.prepare(
              `SELECT l.id, l.title, l.price_da, l.original_price_da, l.condition, l.item_type,
                      w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
                      (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id
               FROM listings l
               LEFT JOIN wilayas w ON w.id = l.wilaya_id
               WHERE l.id = ? AND l.status = 'APPROVED' LIMIT 1`,
            )
              .bind(id)
              .first<any>();
            if (dbItem) {
              found = {
                id: dbItem.id,
                title: dbItem.title,
                priceDa: dbItem.price_da,
                originalPriceDa: dbItem.original_price_da,
                wilayaName: dbItem.wilaya_name_ar || dbItem.wilaya_name_fr || "الجزائر",
                condition: dbItem.condition,
                itemType: dbItem.item_type || "PRODUCT",
                imageUrl: dbItem.cover_id ? `/api/images/${dbItem.cover_id}` : null,
              };
            }
          } catch {}
        }
        if (found && !matchedProducts.some((p) => p.id === found!.id)) {
          matchedProducts.push(found);
        }
      }
    }

    // If matchedProducts is still empty, detect if any candidate listing is explicitly mentioned in reply text
    if (matchedProducts.length === 0) {
      for (const cand of catalogResult.candidates) {
        const cleanTitle = cand.title.toLowerCase();
        if (cleanTitle.length >= 5 && reply.toLowerCase().includes(cleanTitle)) {
          matchedProducts.push(cand);
          if (matchedProducts.length >= 3) break;
        }
      }
    }

    // If user provided an image and matched products are still empty, attach top visual candidates (max 3)
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
          ? "مرحباً بك! أنا مساعدك آزار شات. كيف يمكنني مساعدتك اليوم في تصفح المنتجات أو العثور على أفضل الأسعار بالقرب منك؟"
          : "Bonjour ! Je suis l'assistant Azar Chat. Comment puis-je vous aider à trouver les meilleures affaires et produits près de chez vous ?",
      products: [],
    });
  }
});

const aiAssistSchema = z.object({
  action: z.enum(["generate", "improve", "translate", "auto_fill"]),
  title: z.string().max(120).optional(),
  categoryName: z.string().max(80).optional(),
  wilayaName: z.string().max(80).optional(),
  priceDa: z.number().nonnegative().optional(),
  condition: z.string().max(40).optional(),
  itemType: z.string().max(40).optional(),
  text: z.string().max(4000).optional(),
  lang: z.enum(["fr", "ar"]).optional(),
  targetLang: z.enum(["fr", "ar"]).optional(),
  imageId: z.string().optional(),
  imageBase64: z.string().max(7 * 1024 * 1024).optional(),
  imageMimeType: z.string().max(50).optional(),
});

aiRoutes.post("/ai/assist", async (c) => {
  const user = c.get("user");
  const ip = requestIp(c);
  const actorKey = user ? `user:${user.id}` : `ip:${await hashIp(c.env, ip)}`;

  // Rate limit: 40 AI queries per hour
  try {
    const limit = await consumeRateLimit(c.env.DB, `ai:assist:${actorKey}`, 40, 3600);
    if (!limit.ok) {
      throw new HttpError(429, "RATE_LIMITED", "Limite de requêtes IA atteinte pour cette heure.");
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Transient rate limit table fallback: gracefully continue
  }

  const input = await parseJson(c, aiAssistSchema);

  if (input.action === "auto_fill") {
    let imageData = input.imageBase64;
    let mimeType = input.imageMimeType || "image/jpeg";

    if (!imageData && input.imageId) {
      try {
        const imgRow = await c.env.DB.prepare(
          "SELECT r2_key, content_type FROM listing_images WHERE id = ?",
        )
          .bind(input.imageId)
          .first<{ r2_key: string; content_type: string }>();

        if (imgRow) {
          mimeType = imgRow.content_type || "image/jpeg";
          const obj = await c.env.IMAGES.get(imgRow.r2_key);
          if (obj) {
            const buf = await obj.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            imageData = btoa(binary);
          }
        }
      } catch (err) {
        console.error("Failed to load image from R2 for auto_fill:", err);
      }
    }

    const catRows = await c.env.DB.prepare(
      "SELECT id, name_fr, name_ar FROM categories WHERE is_active = 1 ORDER BY sort_order ASC",
    ).all<{ id: number; name_fr: string; name_ar: string }>();

    const categories = (catRows.results ?? []).map((r) => ({
      id: r.id,
      nameFr: r.name_fr,
      nameAr: r.name_ar,
    }));

    const result = await autoFillListing(c.env, {
      itemType: input.itemType || "PRODUCT",
      draftTitle: input.title,
      image: imageData ? { mimeType, data: imageData } : undefined,
      categories,
      lang: input.lang || "ar",
    });

    return c.json(result);
  }

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
