import { z } from "zod";
import { normalizeAlgerianPhone } from "./phone";

export const phoneSchema = z
  .string()
  .trim()
  .max(24)
  .transform((value, ctx) => {
    const normalized = normalizeAlgerianPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Numéro algérien invalide (ex. 0551 23 45 67).",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(128, "Le mot de passe est trop long.")
  .regex(/[A-Za-z]/, "Le mot de passe doit contenir une lettre.")
  .regex(/\d/, "Le mot de passe doit contenir un chiffre.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Adresse e-mail invalide."));

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(60),
  phone: phoneSchema,
  wilayaId: z.coerce.number().int().min(1).max(58),
  phonePublic: z.boolean().optional().default(false),
  whatsappPublic: z.boolean().optional().default(false),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  phone: phoneSchema,
  phonePublic: z.boolean(),
  whatsappPublic: z.boolean(),
  wilayaId: z.coerce.number().int().min(1).max(58),
  bio: z.string().trim().max(500).optional().nullable(),
});

export const listingInputSchema = z.object({
  title: z.string().trim().min(8, "Titre trop court (8 caractères minimum).").max(100),
  description: z
    .string()
    .trim()
    .min(20, "Description trop courte (20 caractères minimum).")
    .max(4000),
  categoryId: z.coerce.number().int().positive(),
  wilayaId: z.coerce.number().int().min(1).max(58),
  priceDa: z.coerce.number().int().min(0).max(1_000_000_000),
  negotiable: z.boolean().default(false),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).default("NEW"),
  itemType: z.enum(["PRODUCT", "SERVICE", "DIGITAL"]).default("PRODUCT"),
  contactPhone: phoneSchema.optional().nullable(),
  contactPhonePublic: z.boolean().default(true),
  contactWhatsapp: z.boolean().default(false),
  imageIds: z
    .array(z.string().uuid())
    .max(3, "3 images maximum par annonce.")
    .default([]),
});

export type ListingInput = z.infer<typeof listingInputSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.coerce.number().int().positive().optional(),
  wilaya: z.coerce.number().int().min(1).max(58).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).optional(),
  itemType: z.enum(["PRODUCT", "SERVICE", "DIGITAL"]).optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(24),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const reportSchema = z.object({
  reason: z.enum(["FRAUD", "PROHIBITED", "WRONG_CATEGORY", "SPAM", "OTHER"]),
  details: z.string().trim().max(1000).optional().nullable(),
});

export const moderationDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REMOVE"]),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const reportResolutionSchema = z.object({
  status: z.enum(["REVIEWED", "DISMISSED"]),
});

export const adminUserUpdateSchema = z.object({
  role: z.enum(["USER", "MODERATOR", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export const adminListingActionSchema = z.object({
  action: z.enum(["ARCHIVE"]),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const categoryInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide."),
  nameFr: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().min(2).max(80),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  icon: z.string().trim().max(40).default("tag"),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(100),
  isActive: z.boolean().default(false),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export const storeProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  storeName: z.string().trim().max(80).optional().nullable(),
  storeSlug: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Identifiant boutique invalide (lettres minuscules, chiffres, tirets).")
    .optional()
    .nullable(),
  commune: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(160).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  openingHours: z.string().trim().max(120).optional().nullable(),
  bannerUrl: z.string().trim().max(500).optional().nullable(),
  phone: phoneSchema,
  phonePublic: z.boolean(),
  whatsappPublic: z.boolean(),
  wilayaId: z.coerce.number().int().min(1).max(58),
  bio: z.string().trim().max(500).optional().nullable(),
});

export const reorderListingsSchema = z.object({
  listingIds: z.array(z.string().uuid()).max(200),
});

export const storeReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional().nullable(),
});

export const clickTrackSchema = z.object({
  clickType: z.enum(["CALL", "BUY_ORDER", "WHATSAPP"]),
});

export const googleAuthSchema = z.object({
  credential: z.string().optional(),
  email: emailSchema.optional(),
  name: z.string().trim().max(100).optional(),
});

