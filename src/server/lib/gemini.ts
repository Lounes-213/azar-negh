import type { Env } from "../types";

let currentKeyIndex = 0;

/**
 * Extracts all configured Gemini API keys from environment.
 * Supports comma-separated GEMINI_API_KEYS or single GEMINI_API_KEY.
 */
function getGeminiKeys(env: Env): string[] {
  const list: string[] = [];
  if (env.GEMINI_API_KEYS) {
    const split = env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    list.push(...split);
  }
  if (env.GEMINI_API_KEY && !list.includes(env.GEMINI_API_KEY.trim())) {
    list.push(env.GEMINI_API_KEY.trim());
  }
  return list;
}

/**
 * Calls Gemini REST API using round-robin and automatic key rotation on rate-limits (HTTP 429).
 */
async function callGemini(env: Env, prompt: string, systemInstruction?: string): Promise<string | null> {
  const keys = getGeminiKeys(env);
  if (keys.length === 0) return null;

  // Try each key up to keys.length times if rate-limited
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[(currentKeyIndex + attempt) % keys.length];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const payload: any = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 429 || res.status === 403) {
        // Quota exceeded for this key, advance index and try next key
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        continue;
      }

      if (!res.ok) {
        continue;
      }

      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && typeof text === "string") {
        currentKeyIndex = (currentKeyIndex + attempt) % keys.length;
        return text.trim();
      }
    } catch {
      // Network error, advance and try next key
      continue;
    }
  }

  return null;
}

export interface GenerateDescriptionInput {
  title: string;
  categoryName?: string;
  wilayaName?: string;
  priceDa?: number;
  condition?: string;
  itemType?: string;
  lang?: "fr" | "ar";
}

/**
 * Generates an appealing, structured Algerian marketplace listing description.
 */
export async function generateListingDescription(
  env: Env,
  input: GenerateDescriptionInput,
): Promise<string> {
  const isAr = input.lang === "ar";

  const systemInstruction = isAr
    ? "أنت خبير محترف في كتابة إعلانات البيع والتسويق في الجزائر على منصة Azar Neɣ. اكتب نص إعلان جذاب، منظم وواضح بدون مقدمات أو خاتمات زائفة، جاهز للنشر مباشرة مع نقاط محددة (الحالة، المميزات، التوصيل/الاستلام، السعر)."
    : "Tu es un expert en e-commerce et petites annonces en Algérie pour la plateforme Azar Neɣ. Rédige une description de vente vendeuse, structurée, claire et directe, sans blabla ni formule de politesse introductive. Format prêt à être publié avec puces claires (État, Caractéristiques, Remise en main propre / Livraison, Prix).";

  const prompt = isAr
    ? `اكتب وصف إعلان بيع للمنتج التالي:
- العنوان: ${input.title}
- نوع العرض: ${input.itemType === "SERVICE" ? "خدمة" : input.itemType === "DIGITAL" ? "منتج رقمي" : "منتج"}
- الفئة: ${input.categoryName ?? "عام"}
- الولاية: ${input.wilayaName ?? "الجزائر"}
- الحالة: ${input.condition ?? "جيدة"}
- السعر: ${input.priceDa ? `${input.priceDa} دج` : "حسب الاتفاق"}

اكتب نصا مقنعا وواضحا باللهجة واللغة المناسبة للمشترين في الجزائر.`
    : `Rédige une description pour cette annonce :
- Titre : ${input.title}
- Type d'offre : ${input.itemType === "SERVICE" ? "Service" : input.itemType === "DIGITAL" ? "Produit numérique" : "Produit"}
- Catégorie : ${input.categoryName ?? "Général"}
- Wilaya : ${input.wilayaName ?? "Algérie"}
- État : ${input.condition ?? "Bon état"}
- Prix : ${input.priceDa ? `${input.priceDa} DA` : "À discuter"}

Fournis un texte vendeur, propre et bien aéré avec des puces.`;

  const aiResult = await callGemini(env, prompt, systemInstruction);
  if (aiResult) return aiResult;

  // High quality structured fallback if Gemini is offline or keys exhausted
  if (isAr) {
    return `📌 ${input.title}

✨ تفاصيل العرض :
• الحالة : ${input.condition === "NEW" ? "جديد تماما" : "حالة ممتازة وجاهز للاستعمال"}
• الفئة : ${input.categoryName ?? "متوفر حاليا"}
• السعر : ${input.priceDa ? `${input.priceDa} دج` : "قابل للتفاوض"}

📍 الموقع والتسليم :
• متوفر في ولاية ${input.wilayaName ?? "الجزائر"}
• إمكانية المعاينة والتسليم يدا بيد أو التوصيل حسب الاتفاق.

📞 للمزيد من المعلومات أو الطلب، يرجى التواصل عبر الهاتف أو الواتساب.`;
  }

  return `📌 ${input.title}

✨ Détails & Caractéristiques :
• État : ${input.condition === "NEW" ? "Neuf sous emballage" : "Très bon état, fonctionne parfaitement"}
• Catégorie : ${input.categoryName ?? "Disponible immédiatement"}
• Prix : ${input.priceDa ? `${input.priceDa} DA` : "Prix négociable dans la limite du raisonnable"}

📍 Localisation & Disponibilité :
• Disponible sur ${input.wilayaName ?? "votre région"}
• Remise en main propre privilégiée ou livraison selon accord.

📞 Pour toute question ou pour commander, contactez-moi par appel ou WhatsApp.`;
}

/**
 * Polishes and improves an existing draft description (formatting, typo fixing, persuasiveness).
 */
export async function improveDescriptionText(
  env: Env,
  text: string,
  lang?: "fr" | "ar",
): Promise<string> {
  const isAr = lang === "ar" || /[\u0600-\u06FF]/.test(text);

  const systemInstruction = isAr
    ? "أنت مصحح وكاتب إعلانات محترف. قم بتحسين وتنسيق النص التالي ليكون جذاباً ومنظماً بنقاط واضحة، مع تصحيح الأخطاء اللغوية دون تغيير المعلومات الأساسية. أرجع النص المحسن مباشرة بدون تعليق."
    : "Tu es un copywriter professionnel. Corrige les fautes, aère le texte avec des puces propres, et rends l'annonce plus attrayante et vendeuse sans inventer de fausses caractéristiques. Renvoie uniquement le texte amélioré.";

  const prompt = `Voici le texte à améliorer :\n\n${text}`;
  const result = await callGemini(env, prompt, systemInstruction);
  if (result) return result;

  // Fallback: tidy up lines
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n• ");
}

/**
 * Translates description text between French and Arabic.
 */
export async function translateDescriptionText(
  env: Env,
  text: string,
  targetLang: "fr" | "ar",
): Promise<string> {
  const isTargetAr = targetLang === "ar";

  const systemInstruction = isTargetAr
    ? "أنت مترجم محترف لسوق التجارة الإلكترونية الجزائري. ترجم النص التالي إلى لغة عربية سليمة ومفهومة ومناسبة لإعلانات البيع في الجزائر. أرجع النص المترجم مباشرة."
    : "Tu es un traducteur professionnel spécialisé dans le e-commerce algérien. Traduis ce texte en français clair, naturel et professionnel pour une annonce de vente. Renvoie uniquement la traduction.";

  const prompt = `Texte à traduire vers ${isTargetAr ? "l'arabe" : "le français"} :\n\n${text}`;
  const result = await callGemini(env, prompt, systemInstruction);
  if (result) return result;

  return text;
}
