import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type {
  Category,
  ListingCondition,
  ListingSummary,
  MetaResponse,
  Paginated,
  SortOption,
} from "../../shared/types";
import { Icon } from "../components/Icons";
import { Avatar, EmptyState, Field, useToast } from "../components/ui";
import { CustomSelect } from "../components/CustomSelect";
import { ListingCard } from "../components/ListingCard";
import { api, errorMessage } from "../lib/api";

interface MatchingStore {
  id: string;
  displayName: string;
  storeName: string | null;
  storeSlug: string | null;
  logoUrl: string | null;
  commune: string | null;
  wilaya: { id: number; nameFr: string; nameAr: string };
  listingsCount: number;
}
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { trackCategoryInPersona, trackSearchInPersona, trackWilayaInPersona } from "../lib/persona";

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

interface SearchCacheEntry {
  items: ListingSummary[];
  currentPage: number;
  totalCount: number;
  totalPages: number;
  timestamp: number;
}

const searchCache = new Map<string, SearchCacheEntry>();

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
  const currentCategory = params.get("category") ?? "";
  const currentWilaya = params.get("wilaya") ?? "";
  const currentMinPrice = params.get("minPrice") ?? "";
  const currentMaxPrice = params.get("maxPrice") ?? "";
  const currentCondition = params.get("condition") ?? "";
  const currentQ = params.get("q") ?? "";

  const activeFiltersCount = [
    currentCategory,
    currentWilaya,
    currentMinPrice,
    currentMaxPrice,
    currentCondition,
    currentItemType,
    currentQ,
  ].filter(Boolean).length;

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

  const { push } = useToast();
  const sort = (params.get("sort") ?? "newest") as SortOption;

  const baseFilterQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (params.get("q")) query.set("q", params.get("q")!);
    if (effectiveCategory) query.set("category", String(effectiveCategory));
    if (effectiveWilaya) query.set("wilaya", String(effectiveWilaya));
    if (params.get("minPrice")) query.set("minPrice", params.get("minPrice")!);
    if (params.get("maxPrice")) query.set("maxPrice", params.get("maxPrice")!);
    if (params.get("condition")) query.set("condition", params.get("condition")!);
    if (params.get("itemType")) query.set("itemType", params.get("itemType")!);
    if (sort !== "newest") query.set("sort", sort);
    return query.toString();
  }, [effectiveCategory, effectiveWilaya, params, sort]);

  const initialCache = searchCache.get(baseFilterQuery);
  const [items, setItems] = useState<ListingSummary[]>(() => initialCache?.items ?? []);
  const [currentPage, setCurrentPage] = useState(() => initialCache?.currentPage ?? 1);
  const [totalCount, setTotalCount] = useState(() => initialCache?.totalCount ?? 0);
  const [totalPages, setTotalPages] = useState(() => initialCache?.totalPages ?? 1);
  const [initialLoading, setInitialLoading] = useState(() => !initialCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [matchingStores, setMatchingStores] = useState<MatchingStore[]>([]);

  useEffect(() => {
    const q = (params.get("q") ?? "").trim();
    if (q.length < 2) {
      setMatchingStores([]);
      return;
    }
    let active = true;
    api<{ stores: MatchingStore[] }>(`/sellers?q=${encodeURIComponent(q)}`)
      .then((res) => {
        if (active) setMatchingStores(res.stores.slice(0, 3));
      })
      .catch(() => {
        if (active) setMatchingStores([]);
      });
    return () => {
      active = false;
    };
  }, [params.get("q")]);

  const loadInitial = () => {
    const cached = searchCache.get(baseFilterQuery);
    if (cached && Date.now() - cached.timestamp < 120_000) {
      setItems(cached.items);
      setCurrentPage(cached.currentPage);
      setTotalCount(cached.totalCount);
      setTotalPages(cached.totalPages);
      setInitialLoading(false);
      return;
    }

    setInitialLoading(!cached);
    setFetchError(null);
    setCurrentPage(1);

    const qs = new URLSearchParams(baseFilterQuery);
    qs.set("page", "1");
    qs.set("perPage", "8");

    api<{ listings: Paginated<ListingSummary> }>(`/listings?${qs.toString()}`)
      .then((data) => {
        setItems(data.listings.items);
        setTotalCount(data.listings.total);
        setTotalPages(data.listings.totalPages);
        setInitialLoading(false);
        searchCache.set(baseFilterQuery, {
          items: data.listings.items,
          currentPage: 1,
          totalCount: data.listings.total,
          totalPages: data.listings.totalPages,
          timestamp: Date.now(),
        });
      })
      .catch((err) => {
        setFetchError(errorMessage(err));
        setInitialLoading(false);
      });
  };

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterQuery]);

  const handleLoadMore = async () => {
    if (loadingMore || currentPage >= totalPages) return;
    setLoadingMore(true);

    const nextPage = currentPage + 1;
    const qs = new URLSearchParams(baseFilterQuery);
    qs.set("page", String(nextPage));
    qs.set("perPage", "8");

    try {
      const data = await api<{ listings: Paginated<ListingSummary> }>(`/listings?${qs.toString()}`);
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const fresh = data.listings.items.filter((it) => !seen.has(it.id));
        const combined = [...prev, ...fresh];
        searchCache.set(baseFilterQuery, {
          items: combined,
          currentPage: nextPage,
          totalCount: data.listings.total,
          totalPages: data.listings.totalPages,
          timestamp: Date.now(),
        });
        return combined;
      });
      setCurrentPage(nextPage);
      setTotalCount(data.listings.total);
      setTotalPages(data.listings.totalPages);
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = items.length < totalCount && currentPage < totalPages;

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
    if (draft.q.trim()) {
      next.set("q", draft.q.trim());
      trackSearchInPersona(draft.q.trim());
    }
    if (draft.category) {
      next.set("category", draft.category);
      const cat = categoryOptions.find((o) => String(o.id) === draft.category);
      if (cat) trackCategoryInPersona(cat.label);
    }
    if (draft.wilaya) {
      next.set("wilaya", draft.wilaya);
      const wil = meta.data?.wilayas.find((w) => String(w.id) === draft.wilaya);
      if (wil) trackWilayaInPersona(lang === "ar" ? wil.nameAr : wil.nameFr);
    }
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
            {initialLoading
              ? t("common.loading")
              : `${totalCount} ${t("search.results")}`}
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
            className={`btn filter-toggle ${activeFiltersCount > 0 ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <Icon name="filter" size={16} />
            <span>{t("common.filters")}</span>
            {activeFiltersCount > 0 ? (
              <span
                style={{
                  background: "rgba(255, 255, 255, 0.3)",
                  color: "#ffffff",
                  padding: "1px 6px",
                  borderRadius: "99px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  marginLeft: 4,
                }}
              >
                {activeFiltersCount}
              </span>
            ) : null}
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
          {activeFiltersCount > 0 ? (
            <div className="active-filters" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <span className="small muted" style={{ fontWeight: 600 }}>
                {lang === "ar" ? "التصفيات النشطة:" : "Filtres actifs :"}
              </span>
              {currentCategory ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("category");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>{meta.data?.categories.find((c) => String(c.id) === currentCategory)?.[lang === "ar" ? "nameAr" : "nameFr"] || currentCategory}</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              {currentWilaya ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("wilaya");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>{meta.data?.wilayas.find((w) => String(w.id) === currentWilaya)?.[lang === "ar" ? "nameAr" : "nameFr"] || `Wilaya ${currentWilaya}`}</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              {currentMinPrice ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("minPrice");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>≥ {currentMinPrice} DA</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              {currentMaxPrice ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("maxPrice");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>≤ {currentMaxPrice} DA</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              {currentCondition ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("condition");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>{currentCondition === "NEW" ? (lang === "ar" ? "جديد" : "Neuf") : (lang === "ar" ? "مستعمل" : "Occasion")}</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              {currentItemType ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("itemType");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>{currentItemType}</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              {currentQ ? (
                <button
                  type="button"
                  style={{ background: "rgba(22, 163, 74, 0.12)", border: "1px solid var(--brand-600)", color: "var(--brand-700)", borderRadius: 99, padding: "3px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("q");
                    next.delete("page");
                    setParams(next);
                  }}
                >
                  <span>"{currentQ}"</span>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
              <button
                type="button"
                className="btn-link small"
                style={{ color: "var(--danger)", fontWeight: 600, paddingInline: 6 }}
                onClick={clearFilters}
              >
                {t("search.clear")}
              </button>
            </div>
          ) : null}

          {/* Matching Stores / Boutiques banner if search matches store name */}
          {matchingStores.length > 0 && (
            <div
              className="matching-stores-banner mb-5"
              style={{
                background: "linear-gradient(135deg, rgba(22, 163, 74, 0.06) 0%, rgba(21, 128, 61, 0.12) 100%)",
                border: "1.5px solid rgba(22, 163, 74, 0.25)",
                borderRadius: "var(--radius-lg)",
                padding: "14px 18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "var(--brand-800)",
                  marginBottom: 10,
                }}
              >
                <Icon name="store" size={16} />
                <span>
                  {lang === "ar"
                    ? "متاجر وبوتيكات مطابقة لبحثك :"
                    : "Boutiques correspondantes à votre recherche :"}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 10,
                }}
              >
                {matchingStores.map((st) => (
                  <div
                    key={st.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "var(--surface)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--line)",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Avatar name={st.storeName || st.displayName} imageUrl={st.logoUrl} withGreenRing />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="truncate">{st.storeName || st.displayName}</span>
                        </div>
                        <div className="small muted truncate">
                          {st.storeSlug ? `@${st.storeSlug} · ` : ""}
                          {lang === "ar" ? st.wilaya.nameAr : st.wilaya.nameFr}
                          {` · ${st.listingsCount} ${lang === "ar" ? "منتج" : "articles"}`}
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/boutique/${st.storeSlug || st.id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0, fontWeight: 700 }}
                    >
                      <Icon name="store" size={13} />
                      <span>{lang === "ar" ? "زيارة" : "Visiter"}</span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {initialLoading ? (
            <div className="results-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="ali-card"
                  style={{
                    height: 320,
                    padding: 12,
                    background: "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      height: 180,
                      background: "var(--surface-muted)",
                      borderRadius: 12,
                      animation: "pulse 1.5s infinite ease-in-out",
                    }}
                  />
                  <div
                    style={{
                      height: 16,
                      width: "75%",
                      background: "var(--surface-muted)",
                      borderRadius: 6,
                    }}
                  />
                  <div
                    style={{
                      height: 14,
                      width: "45%",
                      background: "var(--surface-muted)",
                      borderRadius: 6,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <EmptyState
              icon="alert"
              title={t("common.error")}
              text={fetchError}
              action={
                <button type="button" className="btn" onClick={loadInitial}>
                  {t("common.retry")}
                </button>
              }
            />
          ) : items.length > 0 ? (
            <>
              <div className="results-grid">
                {items.map((listing, index) => (
                  <div
                    key={listing.id}
                    className="card-animated-wrap"
                    style={{ animationDelay: `${(index % 8) * 35}ms` }}
                  >
                    <ListingCard listing={listing} />
                  </div>
                ))}
              </div>

              {/* Load more controls */}
              <div
                className="load-more-section"
                style={{
                  marginTop: 36,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  paddingBottom: 24,
                }}
              >
                {hasMore ? (
                  <button
                    type="button"
                    className="btn btn-load-more"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      minWidth: 220,
                      padding: "13px 36px",
                      borderRadius: "var(--radius-pill)",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      background: "var(--brand-700)",
                      color: "#fff",
                      border: "none",
                      boxShadow: "0 6px 20px rgba(20, 131, 63, 0.35)",
                      cursor: loadingMore ? "wait" : "pointer",
                      transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
                    }}
                  >
                    {loadingMore ? (
                      <>
                        <span
                          className="spinner"
                          style={{
                            width: 18,
                            height: 18,
                            borderWidth: 2,
                            borderColor: "rgba(255, 255, 255, 0.3)",
                            borderTopColor: "#fff",
                          }}
                        />
                        <span>{t("search.loadingMore")}</span>
                      </>
                    ) : (
                      <>
                        <Icon name="plus" size={18} />
                        <span>{t("search.loadMore")}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div
                    className="all-loaded-banner"
                    style={{
                      padding: "10px 22px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--line)",
                      color: "var(--muted)",
                      fontSize: "0.88rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="check" size={16} className="text-success" />
                    <span>{t("search.allLoaded")} ({totalCount})</span>
                  </div>
                )}

                {/* Progress bar and counter */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    maxWidth: 260,
                  }}
                >
                  <span className="small muted" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    {lang === "ar"
                      ? `تم عرض ${items.length} من أصل ${totalCount} منتج`
                      : `Affichage de ${items.length} sur ${totalCount} produits`}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: 5,
                      background: "var(--surface-muted)",
                      borderRadius: 99,
                      overflow: "hidden",
                      border: "1px solid var(--line)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${totalCount > 0 ? Math.min(100, Math.round((items.length / totalCount) * 100)) : 100}%`,
                        background: "var(--brand-600)",
                        borderRadius: 99,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
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
