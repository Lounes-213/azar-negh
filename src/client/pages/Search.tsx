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
import { EmptyState, Field, Pagination, Select, SkeletonStack } from "../components/ui";
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

function flattenCategories(categories: Category[]): { id: number; label: string; depth: number }[] {
  const result: { id: number; label: string; depth: number }[] = [];
  for (const category of categories) {
    result.push({ id: category.id, label: category.nameFr, depth: 0 });
    for (const child of category.children ?? []) {
      result.push({ id: child.id, label: child.nameFr, depth: 1 });
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

  const [draft, setDraft] = useState({
    q: params.get("q") ?? "",
    category: effectiveCategory ? String(effectiveCategory) : "",
    wilaya: effectiveWilaya ? String(effectiveWilaya) : "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    condition: params.get("condition") ?? "",
  });

  useEffect(() => {
    setDraft({
      q: params.get("q") ?? "",
      category: effectiveCategory ? String(effectiveCategory) : "",
      wilaya: effectiveWilaya ? String(effectiveWilaya) : "",
      minPrice: params.get("minPrice") ?? "",
      maxPrice: params.get("maxPrice") ?? "",
      condition: params.get("condition") ?? "",
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
    () => flattenCategories(meta.data?.categories ?? []),
    [meta.data],
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
          <Select
            id="sort"
            value={sort}
            onChange={(event) => updateSort(event.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="newest">{t("common.newest")}</option>
            <option value="oldest">{t("common.oldest")}</option>
            <option value="price_asc">{t("common.priceAsc")}</option>
            <option value="price_desc">{t("common.priceDesc")}</option>
          </Select>
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
            <select
              id="filter-category"
              className="select"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            >
              <option value="">{t("common.allF")}</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.depth > 0 ? "— " : ""}
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("common.wilaya")} htmlFor="filter-wilaya">
            <select
              id="filter-wilaya"
              className="select"
              value={draft.wilaya}
              onChange={(event) => setDraft({ ...draft, wilaya: event.target.value })}
            >
              <option value="">{t("common.allF")}</option>
              {meta.data?.wilayas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id.toString().padStart(2, "0")} —{" "}
                  {lang === "ar" ? item.nameAr : item.nameFr}
                </option>
              ))}
            </select>
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
            <select
              id="filter-condition"
              className="select"
              value={draft.condition}
              onChange={(event) => setDraft({ ...draft, condition: event.target.value })}
            >
              <option value="">{t("common.all")}</option>
              {(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"] as ListingCondition[]).map(
                (condition) => (
                  <option key={condition} value={condition}>
                    {t(`cond.${condition}`)}
                  </option>
                ),
              )}
            </select>
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
