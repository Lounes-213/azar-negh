import type {
  ItemType,
  ListingCondition,
  ListingDetail,
  ListingImage,
  ListingStatus,
  ListingSummary,
  SortOption,
} from "../../shared/types";
import type { SearchQuery } from "../../shared/validation";
import { escapeLike, pageCount } from "./http";
import { allowedActions } from "../policies/listings";

export interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_da: number;
  negotiable: number;
  condition: ListingCondition;
  item_type?: ItemType;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  view_count: number;
  wilaya_id: number;
  wilaya_name_fr: string;
  wilaya_name_ar: string;
  category_id: number;
  category_slug: string;
  category_name_fr: string;
  category_name_ar: string;
  seller_display_name: string | null;
  seller_phone: string | null;
  seller_phone_public: number | null;
  seller_whatsapp_public: number | null;
  seller_bio: string | null;
  seller_created_at: string | null;
  seller_wilaya_id: number | null;
  contact_phone: string | null;
  contact_phone_public: number;
  contact_whatsapp: number;
  last_decision_reason: string | null;
  cover_id: string | null;
  is_favorite: number;
  call_clicks?: number;
  order_clicks?: number;
  original_price_da?: number | null;
  sort_order?: number;
  store_name?: string | null;
  store_slug?: string | null;
}

const SUMMARY_SELECT = `
  SELECT
    l.id, l.seller_id, l.title, l.description, l.price_da, l.negotiable, l.condition, l.item_type, l.status,
    l.created_at, l.updated_at, l.published_at, l.view_count,
    l.wilaya_id, w.name_fr AS wilaya_name_fr, w.name_ar AS wilaya_name_ar,
    l.category_id, c.slug AS category_slug, c.name_fr AS category_name_fr, c.name_ar AS category_name_ar,
    l.contact_phone, l.contact_phone_public, l.contact_whatsapp, l.last_decision_reason,
    l.call_clicks, l.order_clicks, l.original_price_da, l.sort_order,
    p.display_name AS seller_display_name, p.phone AS seller_phone,
    p.phone_public AS seller_phone_public, p.whatsapp_public AS seller_whatsapp_public,
    p.bio AS seller_bio, p.wilaya_id AS seller_wilaya_id, u.created_at AS seller_created_at,
    p.store_name AS store_name, p.store_slug AS store_slug,
    (SELECT li.id FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.position ASC LIMIT 1) AS cover_id,
    EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.user_id = ?) AS is_favorite
  FROM listings l
  JOIN wilayas w ON w.id = l.wilaya_id
  JOIN categories c ON c.id = l.category_id
  JOIN users u ON u.id = l.seller_id
  LEFT JOIN seller_profiles p ON p.user_id = l.seller_id
`;

export function imageUrl(id: string | null): string | null {
  return id ? `/api/images/${id}` : null;
}

export function rowToSummary(row: ListingRow): ListingSummary {
  return {
    id: row.id,
    title: row.title,
    priceDa: row.price_da,
    originalPriceDa: row.original_price_da ?? null,
    negotiable: row.negotiable === 1,
    condition: row.condition,
    itemType: (row.item_type ?? "PRODUCT") as ItemType,
    status: row.status,
    wilaya: { id: row.wilaya_id, nameFr: row.wilaya_name_fr, nameAr: row.wilaya_name_ar },
    category: {
      id: row.category_id,
      slug: row.category_slug,
      nameFr: row.category_name_fr,
      nameAr: row.category_name_ar,
    },
    coverImage: imageUrl(row.cover_id),
    createdAt: row.created_at,
    publishedAt: row.published_at,
    sellerDisplayName: row.seller_display_name ?? "Vendeur",
    storeName: row.store_name ?? null,
    storeSlug: row.store_slug ?? null,
    isFavorite: row.is_favorite === 1,
    callClicks: row.call_clicks ?? 0,
    orderClicks: row.order_clicks ?? 0,
    averageRating: 5,
  };
}

export function rowToDetail(
  row: ListingRow,
  images: ListingImage[],
  viewer: { id: string; role: "USER" | "MODERATOR" | "ADMIN" } | null,
): ListingDetail {
  const isOwner = viewer?.id === row.seller_id;
  const profilePhonePublic = row.seller_phone_public === 1;
  const listingPhonePublic = row.contact_phone_public === 1;
  const canSeePhone =
    isOwner || (listingPhonePublic && (row.contact_phone !== null || profilePhonePublic));
  const phone = isOwner
    ? (row.contact_phone ?? row.seller_phone)
    : canSeePhone
      ? (row.contact_phone ?? row.seller_phone)
      : null;
  const whatsapp = isOwner ? row.contact_whatsapp === 1 : row.contact_whatsapp === 1 && canSeePhone;

  return {
    ...rowToSummary(row),
    description: row.description,
    images,
    seller: {
      id: row.seller_id,
      displayName: row.seller_display_name ?? "Vendeur",
      storeName: row.store_name ?? null,
      storeSlug: row.store_slug ?? null,
      wilayaId: row.seller_wilaya_id ?? row.wilaya_id,
      bio: row.seller_bio,
      phone: isOwner ? row.seller_phone : profilePhonePublic ? row.seller_phone : null,
      phonePublic: profilePhonePublic,
      whatsappPublic: row.seller_whatsapp_public === 1,
      memberSince: row.seller_created_at ?? row.created_at,
    },
    contactPhone: phone,
    contactPhonePublic: listingPhonePublic,
    contactWhatsapp: whatsapp,
    rejectionReason: isOwner || viewer?.role !== "USER" ? row.last_decision_reason : null,
    viewCount: row.view_count,
    updatedAt: row.updated_at,
    allowedActions: allowedActions(row.status, isOwner, viewer?.role ?? "USER"),
    isFavorite: row.is_favorite === 1,
    isOwner,
  };
}

export interface SearchResult {
  rows: ListingRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export async function searchListings(
  db: D1Database,
  query: SearchQuery,
  viewerId: string,
): Promise<SearchResult> {
  const where: string[] = ["l.status = 'APPROVED'"];
  const params: unknown[] = [viewerId];

  if (query.category) {
    const children = await db
      .prepare("SELECT id FROM categories WHERE parent_id = ? AND is_active = 1")
      .bind(query.category)
      .all<{ id: number }>();
    const ids = [query.category, ...(children.results ?? []).map((r) => r.id)];
    where.push(`l.category_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  if (query.wilaya) {
    where.push("l.wilaya_id = ?");
    params.push(query.wilaya);
  }
  if (query.minPrice !== undefined) {
    where.push("l.price_da >= ?");
    params.push(query.minPrice);
  }
  if (query.maxPrice !== undefined) {
    where.push("l.price_da <= ?");
    params.push(query.maxPrice);
  }
  if (query.condition) {
    where.push("l.condition = ?");
    params.push(query.condition);
  }
  if (query.itemType) {
    where.push("l.item_type = ?");
    params.push(query.itemType);
  }
  if (query.q) {
    const term = `%${escapeLike(query.q)}%`;
    where.push("(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')");
    params.push(term, term);
  }

  const orderBy: Record<SortOption, string> = {
    newest: "l.published_at DESC, l.id DESC",
    oldest: "l.published_at ASC, l.id ASC",
    price_asc: "l.price_da ASC, l.published_at DESC",
    price_desc: "l.price_da DESC, l.published_at DESC",
  };

  const whereSql = where.join(" AND ");
  const offset = (query.page - 1) * query.perPage;

  const [rowsResult, countRow] = await Promise.all([
    db
      .prepare(
        `${SUMMARY_SELECT} WHERE ${whereSql} ORDER BY ${orderBy[query.sort]} LIMIT ? OFFSET ?`,
      )
      .bind(...params, query.perPage, offset)
      .all<ListingRow>(),
    db
      .prepare(`SELECT COUNT(*) AS count FROM listings l WHERE ${whereSql}`)
      .bind(...params.slice(1))
      .first<{ count: number }>(),
  ]);

  const total = countRow?.count ?? 0;
  return {
    rows: rowsResult.results ?? [],
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: pageCount(total, query.perPage),
  };
}

export async function loadListingRow(
  db: D1Database,
  id: string,
  viewerId: string,
): Promise<ListingRow | null> {
  return db.prepare(`${SUMMARY_SELECT} WHERE l.id = ?`).bind(viewerId, id).first<ListingRow>();
}

export async function loadSummariesByIds(
  db: D1Database,
  ids: string[],
  viewerId: string,
): Promise<ListingSummary[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db
    .prepare(`${SUMMARY_SELECT} WHERE l.id IN (${placeholders})`)
    .bind(viewerId, ...ids)
    .all<ListingRow>();
  const byId = new Map((rows.results ?? []).map((row) => [row.id, rowToSummary(row)]));
  return ids.map((id) => byId.get(id)).filter((item): item is ListingSummary => Boolean(item));
}

export async function loadListingImages(
  db: D1Database,
  listingId: string,
): Promise<ListingImage[]> {
  const result = await db
    .prepare(
      "SELECT id, position FROM listing_images WHERE listing_id = ? ORDER BY position ASC, created_at ASC",
    )
    .bind(listingId)
    .all<{ id: string; position: number }>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    url: `/api/images/${row.id}`,
    position: row.position,
  }));
}

export async function relatedListings(
  db: D1Database,
  listing: { id: string; categoryId: number; wilayaId: number; priceDa?: number },
  viewerId: string,
): Promise<ListingSummary[]> {
  const price = listing.priceDa ?? 0;
  const minPrice = Math.max(0, Math.floor(price * 0.55));
  const maxPrice = Math.ceil(price * 1.6);

  const rows = await db
    .prepare(
      `${SUMMARY_SELECT}
       WHERE l.status = 'APPROVED' AND l.id != ? AND (l.category_id = ? OR l.wilaya_id = ?)
       ORDER BY (
         (CASE WHEN l.category_id = ? THEN 100 ELSE 0 END) +
         (CASE WHEN l.wilaya_id = ? THEN 40 ELSE 0 END) +
         (CASE WHEN ? > 0 AND l.price_da BETWEEN ? AND ? THEN 30 ELSE 0 END) +
         (COALESCE(l.order_clicks, 0) * 3 + COALESCE(l.call_clicks, 0) * 2)
       ) DESC, l.published_at DESC
       LIMIT 6`,
    )
    .bind(
      viewerId,
      listing.id,
      listing.categoryId,
      listing.wilayaId,
      listing.categoryId,
      listing.wilayaId,
      price,
      minPrice,
      maxPrice,
    )
    .all<ListingRow>();
  return (rows.results ?? []).map(rowToSummary);
}
