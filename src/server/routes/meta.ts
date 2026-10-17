import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { Category, Wilaya } from "../../shared/types";
import { CONDITIONS, ITEM_TYPES } from "../../shared/types";
import { HttpError } from "../lib/http";

export const metaRoutes = new Hono<AppEnv>();

interface CategoryRow {
  id: number;
  slug: string;
  name_fr: string;
  name_ar: string;
  parent_id: number | null;
  icon: string;
  sort_order: number;
  listing_count: number;
}

export function buildCategoryTree(rows: CategoryRow[]): Category[] {
  const nodes = new Map<number, Category>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      slug: row.slug,
      nameFr: row.name_fr,
      nameAr: row.name_ar,
      parentId: row.parent_id,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: true,
      listingCount: row.listing_count,
      children: [],
    });
  }
  const roots: Category[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

metaRoutes.get("/meta", async (c) => {
  const [categories, wilayas] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.id, c.slug, c.name_fr, c.name_ar, c.parent_id, c.icon, c.sort_order,
        (SELECT COUNT(*) FROM listings l
          WHERE l.status = 'APPROVED'
            AND (l.category_id = c.id OR l.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = c.id))
        ) AS listing_count
       FROM categories c
       WHERE c.is_active = 1
       ORDER BY c.sort_order ASC, c.name_fr ASC`,
    ).all<CategoryRow>(),
    c.env.DB.prepare("SELECT id, slug, name_fr, name_ar FROM wilayas ORDER BY id ASC").all<{
      id: number;
      slug: string;
      name_fr: string;
      name_ar: string;
    }>(),
  ]);

  const response = {
    categories: buildCategoryTree(categories.results ?? []),
    wilayas: (wilayas.results ?? []).map(
      (row): Wilaya => ({
        id: row.id,
        slug: row.slug,
        nameFr: row.name_fr,
        nameAr: row.name_ar,
      }),
    ),
    conditions: CONDITIONS,
    itemTypes: ITEM_TYPES,
    maxImages: Number(c.env.MAX_IMAGES_PER_LISTING || "3"),
  };
  c.header("Cache-Control", "public, max-age=300");
  return c.json(response);
});

metaRoutes.get("/categories/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await c.env.DB.prepare(
    "SELECT id, slug, name_fr, name_ar, parent_id, icon, sort_order FROM categories WHERE slug = ? AND is_active = 1",
  )
    .bind(slug)
    .first<{
      id: number;
      slug: string;
      name_fr: string;
      name_ar: string;
      parent_id: number | null;
      icon: string;
      sort_order: number;
    }>();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Catégorie introuvable.");
  return c.json({
    category: {
      id: row.id,
      slug: row.slug,
      nameFr: row.name_fr,
      nameAr: row.name_ar,
      parentId: row.parent_id,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: true,
    },
  });
});

metaRoutes.get("/wilayas/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await c.env.DB.prepare(
    "SELECT id, slug, name_fr, name_ar FROM wilayas WHERE slug = ?",
  )
    .bind(slug)
    .first<{ id: number; slug: string; name_fr: string; name_ar: string }>();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Wilaya introuvable.");
  return c.json({
    wilaya: { id: row.id, slug: row.slug, nameFr: row.name_fr, nameAr: row.name_ar },
  });
});
