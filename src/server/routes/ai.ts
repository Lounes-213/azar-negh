import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, parseJson } from "../lib/http";
import { requireUser } from "../lib/auth";
import { consumeRateLimit } from "../lib/rate-limit";
import {
  generateListingDescription,
  improveDescriptionText,
  translateDescriptionText,
} from "../lib/gemini";
import { z } from "zod";

export const aiRoutes = new Hono<AppEnv>();

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
  const user = requireUser(c);

  // Rate limit: 40 AI queries per hour per user
  const limit = await consumeRateLimit(c.env.DB, `ai:assist:${user.id}`, 40, 3600);
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
