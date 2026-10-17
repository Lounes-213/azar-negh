import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import type {
  Category,
  ListingCondition,
  ListingSummary,
  MetaResponse,
  Paginated,
  SortOption,
} from "../../shared/types";
import { Icon } from "../components/Icons";
import { EmptyState, Field, Pagination, SkeletonStack } from "../components/ui";
import { CustomSelect } from "../components/CustomSelect";
import { ListingCard } from "../components/ListingCard";
import { api, errorMessage } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";

type Mode = "all" | "category" | "wilaya";

function findCategoryBySlug(
  categories: Category[],
  slug: string | undefined,
): Category | undefined {
  if (!slug) return undefined;
  for (const category of categories) {
    if (category.slug === slug) return category;
    const child = category.children?.find((item) => item.slug === slug);
    if (child) return child;
  }
  return undefined;
}

function flattenCategories(
  categories: Category[],
  lang?: "fr" | "ar",
): { id: number; label: string; depth: number }[] {
  const result: { id: number; label: string; depth: number }[] = [];
  for (const category of categories) {
    result.push({
      id: category.id,
      label: lang === "ar" ? category.nameAr : category.nameFr,
      depth: 0,
    });
    for (const child of category.children ?? []) {
      result.push({
        id: child.id,
        label: lang === "ar" ? child.nameAr : child.nameFr,
        depth: 1,
      });
    }
  }
  return result;
}

export function Search({ mode }: { mode: Mode }) {
  const { t, lang } = useI18n();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const [showFilters, setShowFilters] = useState(false);

  const categoryFromSlug =
    mode === "category" ? findCategoryBySlug(meta.data?.categories ?? [], slug) : undefined;
  const wilayaFromSlug =
    mode === "wilaya" ? meta.data?.wilayas.find((item) => item.slug === slug) : undefined;

  const effectiveCategory =
    mode === "category" ? categoryFromSlug?.id : Number(params.get("category")) || undefined;
  const effectiveWilaya =
    mode === "wilaya" ? wilayaFromSlug?.id : Number(params.get("wilaya")) || undefined;

  const currentItemType = params.get("itemType") ?? "";

  const [draft, setDraft] = useState({
    q: params.get("q") ?? "",
    category: effectiveCategory ? String(effectiveCategory) : "",
    wilaya: effectiveWilaya ? String(effectiveWilaya) : "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    condition: params.get("condition") ?? "",
    itemType: currentItemType,
  });

  useEffect(() => {
    setDraft({
      q: params.get("q") ?? "",
      category: effectiveCategory ? String(effectiveCategory) : "",
      wilaya: effectiveWilaya ? String(effectiveWilaya) : "",
      minPrice: params.get("minPrice") ?? "",
      maxPrice: params.get("maxPrice") ?? "",
      condition: params.get("condition") ?? "",
      itemType: params.get("itemType") ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), effectiveCategory, effectiveWilaya]);

  const sort = (params.get("sort") ?? "newest") as SortOption;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    if (params.get("q")) query.set("q", params.get("q")!);
    if (effectiveCategory) query.set("category", String(effectiveCategory));
    if (effectiveWilaya) query.set("wilaya", String(effectiveWilaya));
    if (params.get("minPrice")) query.set("minPrice", params.get("minPrice")!);
    if (params.get("maxPrice")) query.set("maxPrice", params.get("maxPrice")!);
    if (params.get("condition")) query.set("condition", params.get("condition")!);
    if (params.get("itemType")) query.set("itemType", params.get("itemType")!);
    query.set("sort", sort);
    query.set("page", String(page));
    query.set("perPage", "24");
    return query.toString();
  }, [effectiveCategory, effectiveWilaya, params, sort, page]);

  const results = useAsync(
    () => api<{ listings: Paginated<ListingSummary> }>(`/listings?${queryString}`),
    [queryString],
  );

  const title =
    mode === "category" && categoryFromSlug
      ? lang === "ar"
        ? categoryFromSlug.nameAr
        : categoryFromSlug.nameFr
      : mode === "wilaya" && wilayaFromSlug
        ? lang === "ar"
          ? wilayaFromSlug.nameAr
          : wilayaFromSlug.nameFr
        : t("search.title");
  useDocumentTitle(title);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (draft.q.trim()) next.set("q", draft.q.trim());
    if (draft.category) next.set("category", draft.category);
    if (draft.wilaya) next.set("wilaya", draft.wilaya);
    if (draft.minPrice) next.set("minPrice", draft.minPrice);
    if (draft.maxPrice) next.set("maxPrice", draft.maxPrice);
    if (draft.condition) next.set("condition", draft.condition);
    if (draft.itemType) next.set("itemType", draft.itemType);
    if (sort !== "newest") next.set("sort", sort);
    setParams(next);
    setShowFilters(false);
  };

  const updateSort = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === "newest") next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    setParams(next);
  };

  const updateItemType = (type: string) => {
    const next = new URLSearchParams(params);
    if (!type) next.delete("itemType");
    else next.set("itemType", type);
    next.delete("page");
    setParams(next);
  };

  const clearFilters = () => {
    setParams(new URLSearchParams());
  };

  const changePage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const categoryOptions = useMemo(
    () => flattenCategories(meta.data?.categories ?? [], lang),
    [meta.data, lang],
  );

  const sortOptions = useMemo(
    () => [
      { value: "newest", label: t("common.newest") },
      { value: "oldest", label: t("common.oldest") },
      { value: "price_asc", label: t("common.priceAsc") },
      { value: "price_desc", label: t("common.priceDesc") },
    ],
    [t],
  );

  const categoryFilterOptions = useMemo(
    () => [
      { value: "", label: t("common.allF") },
      ...categoryOptions.map((opt) => ({
        value: String(opt.id),
        label: opt.depth > 0 ? `— ${opt.label}` : opt.label,
      })),
    ],
    [categoryOptions, t],
  );

  const wilayaFilterOptions = useMemo(
    () => [
      { value: "", label: t("common.allF") },
      ...(meta.data?.wilayas ?? []).map((w) => ({
        value: String(w.id),
        label: `${w.id.toString().padStart(2, "0")} — ${lang === "ar" ? w.nameAr : w.nameFr}`,
        sublabel: lang === "ar" ? w.nameFr : w.nameAr,
      })),
    ],
    [meta.data, lang, t],
  );

  const conditionFilterOptions = useMemo(
    () => [
      { value: "", label: t("common.all") },
      ...(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"] as ListingCondition[]).map((c) => ({
        value: c,
        label: t(`cond.${c}`),
      })),
    ],
    [t],
  );

  const itemTypeFilterOptions = useMemo(
    () => [
      { value: "", label: lang === "ar" ? "كل الأنواع" : "Tous les types" },
      { value: "PRODUCT", label: lang === "ar" ? "منتجات مادية" : "Produits physiques" },
      { value: "SERVICE", label: lang === "ar" ? "خدمات" : "Services" },
      { value: "DIGITAL", label: lang === "ar" ? "منتجات رقمية" : "Produits numériques" },
    ],
    [lang],
  );

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>
            {results.loading
              ? t("common.loading")
              : `${results.data?.listings.total ?? 0} ${t("search.results")}`}
            {mode === "wilaya"
              ? ` · ${lang === "ar" ? "كل الولايات" : "wilaya"} ${wilayaFromSlug?.id ?? ""}`
              : ""}
          </p>
        </div>
        <div className="row">
          <label className="sr-only" htmlFor="sort">
            {t("common.sort")}
          </label>
          <CustomSelect
            id="sort"
            value={sort}
            onChange={updateSort}
            options={sortOptions}
            size="sm"
            style={{ width: "auto", minWidth: 175 }}
          />
          <button
            type="button"
            className="btn btn-secondary filter-toggle"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <Icon name="filter" size={16} /> {t("common.filters")}
          </button>
        </div>
      </div>

      {/* Modern Type Filter Chips with Smooth Scroll & Gradient Indicators */}
      <div
        className="scroll-indicator-wrap mb-4"
        style={{
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 6,
            paddingTop: 2,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${!currentItemType ? "btn-primary" : "btn-secondary"}`}
            onClick={() => updateItemType("")}
            style={{ borderRadius: "20px", whiteSpace: "nowrap", paddingInline: 14 }}
          >
            {lang === "ar" ? "كل العروض" : "Tous les types"}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${currentItemType === "PRODUCT" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => updateItemType("PRODUCT")}
            style={{ borderRadius: "20px", whiteSpace: "nowrap", paddingInline: 14 }}
          >
            {lang === "ar" ? "المنتجات" : "Produits"}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${currentItemType === "SERVICE" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => updateItemType("SERVICE")}
            style={{ borderRadius: "20px", whiteSpace: "nowrap", paddingInline: 14 }}
          >
            {lang === "ar" ? "الخدمات" : "Services"}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${currentItemType === "DIGITAL" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => updateItemType("DIGITAL")}
            style={{ borderRadius: "20px", whiteSpace: "nowrap", paddingInline: 14 }}
          >
            {lang === "ar" ? "منتجات رقمية" : "Produits numériques"}
          </button>
        </div>
      </div>

      <div className="search-layout">
        <form className={`filters ${showFilters ? "open" : ""}`} onSubmit={applyFilters}>
          <div className="filters-head">
            <h2>{t("common.filters")}</h2>
            <button type="button" className="btn-link small" onClick={clearFilters}>
              {t("search.clear")}
            </button>
          </div>

          <Field label={t("common.search")} htmlFor="filter-q">
            <input
              id="filter-q"
              className="input"
              value={draft.q}
              onChange={(event) => setDraft({ ...draft, q: event.target.value })}
              placeholder="Titre, mot-clé…"
              maxLength={80}
            />
          </Field>

          <Field label={t("common.category")} htmlFor="filter-category">
            <CustomSelect
              id="filter-category"
              value={draft.category}
              onChange={(value) => setDraft({ ...draft, category: value })}
              options={categoryFilterOptions}
              searchable
              searchPlaceholder={lang === "ar" ? "ابحث عن فئة..." : "Rechercher catégorie..."}
            />
          </Field>

          <Field label={t("common.wilaya")} htmlFor="filter-wilaya">
            <CustomSelect
              id="filter-wilaya"
              value={draft.wilaya}
              onChange={(value) => setDraft({ ...draft, wilaya: value })}
              options={wilayaFilterOptions}
              searchable
              searchPlaceholder={lang === "ar" ? "ابحث عن ولاية..." : "Rechercher wilaya..."}
            />
          </Field>

          <div className="filter-group">
            <span className="label">{t("common.price")} (DA)</span>
            <div className="price-range">
              <input
                className="input"
                type="number"
                min={0}
                max={1_000_000_000}
                inputMode="numeric"
                placeholder={t("common.min")}
                aria-label={`${t("common.price")} ${t("common.min")}`}
                value={draft.minPrice}
                onChange={(event) => setDraft({ ...draft, minPrice: event.target.value })}
              />
              <input
                className="input"
                type="number"
                min={0}
                max={1_000_000_000}
                inputMode="numeric"
                placeholder={t("common.max")}
                aria-label={`${t("common.price")} ${t("common.max")}`}
                value={draft.maxPrice}
                onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
              />
            </div>
          </div>

          <Field label={t("common.condition")} htmlFor="filter-condition">
            <CustomSelect
              id="filter-condition"
              value={draft.condition}
              onChange={(value) => setDraft({ ...draft, condition: value })}
              options={conditionFilterOptions}
            />
          </Field>

          <Field label={lang === "ar" ? "نوع العرض" : "Type d'offre"} htmlFor="filter-item-type">
            <CustomSelect
              id="filter-item-type"
              value={draft.itemType}
              onChange={(value) => setDraft({ ...draft, itemType: value })}
              options={itemTypeFilterOptions}
            />
          </Field>

          <button type="submit" className="btn btn-block">
            {t("search.apply")}
          </button>
        </form>

        <div>
          {results.loading ? (
            <SkeletonStack count={6} />
          ) : results.error ? (
            <EmptyState
              icon="alert"
              title={t("common.error")}
              text={errorMessage(results.error)}
              action={
                <button type="button" className="btn" onClick={results.reload}>
                  {t("common.retry")}
                </button>
              }
            />
          ) : results.data && results.data.listings.items.length > 0 ? (
            <>
              <div className="results-grid">
                {results.data.listings.items.map((listing, index) => (
                  <div key={listing.id} className="card-animated-wrap" style={{ animationDelay: `${index * 40}ms` }}>
                    <ListingCard listing={listing} />
                  </div>
                ))}
              </div>
              <Pagination
                page={results.data.listings.page}
                totalPages={results.data.listings.totalPages}
                onChange={changePage}
              />
            </>
          ) : (
            <EmptyState
              icon="search"
              title={t("search.noResults")}
              text={t("search.noResultsText")}
              action={
                <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                  {t("search.clear")}
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
