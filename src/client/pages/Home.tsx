import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon, type IconName } from "../components/Icons";
import { EmptyState, SkeletonStack, Spinner } from "../components/ui";
import { ListingCard } from "../components/ListingCard";
import { HeroCarousel } from "../components/HeroCarousel";
import { SearchSuggestions } from "../components/SearchSuggestions";
import { api } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import type { ListingSummary, MetaResponse, Paginated } from "../../shared/types";

const POPULAR_WILAYAS = [16, 31, 25, 23, 19, 9, 15, 6];

const TABS = [
  { key: "deals", label: "Prix du jour", labelAr: "أفضل الأسعار", to: "/annonces?sort=price_asc" },
  { key: "fresh", label: "Nouveautés", labelAr: "جديد", to: "/annonces?sort=newest" },
];

interface HomeCache {
  listings: ListingSummary[];
  total: number;
  page: number;
  timestamp: number;
}

let homeCache: HomeCache | null = null;

export function Home() {
  const { t, lang } = useI18n();
  useDocumentTitle("");
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const [homeListings, setHomeListings] = useState<ListingSummary[]>(() => homeCache?.listings ?? []);
  const [homeTotal, setHomeTotal] = useState(() => homeCache?.total ?? 0);
  const [homePage, setHomePage] = useState(() => homeCache?.page ?? 1);
  const [homeLoading, setHomeLoading] = useState(() => !homeCache);
  const [homeLoadingMore, setHomeLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    // If cached within the last 2 minutes, keep instant render without resetting scroll
    if (homeCache && Date.now() - homeCache.timestamp < 120_000) {
      setHomeLoading(false);
      return;
    }
    setHomeLoading(!homeCache);
    api<{ listings: Paginated<ListingSummary> }>("/listings?sort=newest&perPage=8&page=1")
      .then((res) => {
        if (!active) return;
        setHomeListings(res.listings.items);
        setHomeTotal(res.listings.total);
        setHomePage(1);
        homeCache = {
          listings: res.listings.items,
          total: res.listings.total,
          page: 1,
          timestamp: Date.now(),
        };
      })
      .catch(() => {
        // silent
      })
      .finally(() => {
        if (active) setHomeLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleHomeLoadMore = async () => {
    if (homeLoadingMore || homeListings.length >= homeTotal) return;
    setHomeLoadingMore(true);
    const nextPage = homePage + 1;
    try {
      const res = await api<{ listings: Paginated<ListingSummary> }>(
        `/listings?sort=newest&perPage=8&page=${nextPage}`,
      );
      setHomeListings((prev) => {
        const nextListings = [...prev, ...res.listings.items];
        homeCache = {
          listings: nextListings,
          total: res.listings.total,
          page: nextPage,
          timestamp: Date.now(),
        };
        return nextListings;
      });
      setHomePage(nextPage);
      setHomeTotal(res.listings.total);
    } catch {
      // silent
    } finally {
      setHomeLoadingMore(false);
    }
  };

  const [detectedPlace, setDetectedPlace] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("azar:detected_location");
      if (saved) return JSON.parse(saved).name;
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    const onLocUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ name: string }>;
      if (custom.detail?.name) setDetectedPlace(custom.detail.name);
    };
    window.addEventListener("azar:location-updated", onLocUpdated);
    return () => window.removeEventListener("azar:location-updated", onLocUpdated);
  }, []);

  const popular = useMemo(() => {
    if (!meta.data) return [];
    return POPULAR_WILAYAS.map((id) => meta.data!.wilayas.find((item) => item.id === id)).filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    );
  }, [meta.data]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (term.trim()) params.set("q", term.trim());
    navigate(`/annonces${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <div className="container page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Icon name="shield" size={14} /> {t("home.kicker")}
          </span>
          <h1 id="hero-title">
            {t("home.titleA")} <em>{t("home.titleB")}</em>
          </h1>
          <p className="hero-lead">{t("home.lead")}</p>

          <div style={{ position: "relative", width: "100%", maxWidth: "620px" }}>
            <form className="hero-search" onSubmit={submitSearch} role="search">
              <label className="sr-only" htmlFor="home-search">
                {t("common.search")}
              </label>
              <input
                id="home-search"
                className="input"
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={t("home.searchPlaceholder")}
                maxLength={80}
                autoComplete="off"
              />
              <button type="submit" className="btn">
                <Icon name="search" size={18} />
                {lang === "ar" ? "استكشف" : "Explorer"}
              </button>
            </form>
            <SearchSuggestions
              query={term}
              isOpen={showSuggestions}
              onClose={() => setShowSuggestions(false)}
              onSelectQuery={(q) => setTerm(q)}
            />
          </div>

          <div className="hero-meta">
            <span>
              <Icon name="shield" size={15} /> {t("home.trust1")}
            </span>
            <span>
              <Icon name="phone" size={15} /> {t("home.trust2")}
            </span>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("azar:open-location"))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(22, 163, 74, 0.08)",
                border: "1px solid rgba(22, 163, 74, 0.25)",
                borderRadius: "var(--radius-pill)",
                padding: "4px 12px",
                color: "var(--brand-700)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "inherit",
                transition: "background 0.15s ease",
              }}
              title={lang === "ar" ? "تحديد موقعي" : "Ma localisation"}
            >
              <Icon name="map-pin" size={15} />
              <span>{detectedPlace ? `📍 ${detectedPlace}` : (lang === "ar" ? "تحديد موقعي" : "Ma position")}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="section section-categories" aria-labelledby="categories-title">
        <div className="section-head">
          <div>
            <h2 id="categories-title">{t("home.categories")}</h2>
            <p>
              {lang === "ar"
                ? "كل ما تحتاجه، قريب منك."
                : "Tout ce dont vous avez besoin, près de chez vous."}
            </p>
          </div>
          <Link to="/categories" className="btn btn-ghost btn-sm">
            {t("common.more")} <Icon name="arrow-right" size={16} />
          </Link>
        </div>

        {meta.loading ? (
          <Spinner label={t("common.loading")} />
        ) : (
          <div className="cat-rail">
            <Link to="/annonces" className="cat-card" aria-current="page">
              <span className="cat-thumb">
                <Icon name="grid" size={22} />
              </span>
              <strong>{t("common.allM")}</strong>
            </Link>
            {meta.data?.categories.slice(0, 12).map((category) => (
              <Link key={category.id} to={`/categories/${category.slug}`} className="cat-card">
                <span className="cat-thumb">
                  <Icon name={category.icon as IconName} size={22} />
                </span>
                <strong>{lang === "ar" ? category.nameAr : category.nameFr}</strong>
                <small>
                  {category.listingCount
                    ? `${category.listingCount} ${lang === "ar" ? "إعلان" : category.listingCount > 1 ? "annonces" : "annonce"}`
                    : lang === "ar"
                      ? "اكتشف"
                      : "Découvrir"}
                </small>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section
        className="section section-hero-carousel"
        style={{ marginTop: 10, marginBottom: 8 }}
        aria-label={lang === "ar" ? "عروض وإعلانات مميزة" : "Offres et bannières"}
      >
        <HeroCarousel />
      </section>

      <section className="section" aria-labelledby="recent-title">
        <div className="segment-rail-head">
          <div className="segment-row">
            <Link to="/annonces?sort=newest" className="segment active">
              <Icon name="star" size={15} /> {lang === "ar" ? "من أجلك" : "Pour vous"}
            </Link>
            {TABS.map((tab) => (
              <Link key={tab.key} to={tab.to} className="segment">
                {lang === "ar" ? tab.labelAr : tab.label}
              </Link>
            ))}
          </div>
          <Link to="/annonces" className="btn btn-ghost btn-sm">
            {t("common.more")} <Icon name="arrow-right" size={16} />
          </Link>
        </div>
        <h2 id="recent-title" className="sr-only">
          {t("home.recent")}
        </h2>

        {homeLoading ? (
          <SkeletonStack count={4} />
        ) : homeListings.length > 0 ? (
          <>
            <div className="listing-grid">
              {homeListings.map((listing, index) => (
                <div
                  key={listing.id}
                  className="card-animated-wrap"
                  style={{ animationDelay: `${(index % 8) * 35}ms` }}
                >
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>

            {/* Voir plus (+8) button under the product list */}
            {homeListings.length < homeTotal ? (
              <div className="home-load-more-wrap">
                <button
                  type="button"
                  className="btn btn-load-more"
                  onClick={handleHomeLoadMore}
                  disabled={homeLoadingMore}
                >
                  {homeLoadingMore ? (
                    <>
                      <span
                        className="spinner"
                        style={{
                          width: 15,
                          height: 15,
                          borderWidth: 2,
                          borderColor: "rgba(255, 255, 255, 0.3)",
                          borderTopColor: "#fff",
                          margin: 0,
                          display: "inline-block",
                        }}
                      />
                      <span>{lang === "ar" ? "جارِ التحميل..." : "Chargement..."}</span>
                    </>
                  ) : (
                    <>
                      <Icon name="arrow-down" size={15} />
                      <span>{t("search.loadMore")}</span>
                    </>
                  )}
                </button>
                <span className="home-load-more-count">
                  {lang === "ar"
                    ? `عرض ${homeListings.length} من ${homeTotal} إعلان`
                    : `${homeListings.length} sur ${homeTotal} annonces`}
                </span>
              </div>
            ) : (
              <div className="home-all-loaded">
                <span>
                  {lang === "ar"
                    ? "✓ تم عرض جميع الإعلانات الأخيرة"
                    : "✓ Toutes les annonces récentes sont affichées"}
                </span>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon="tag"
            title={t("home.emptyTitle")}
            text={t("home.emptyText")}
            action={
              <Link to="/vendre" className="btn">
                {t("home.cta")}
              </Link>
            }
          />
        )}
      </section>

      <section className="section" aria-labelledby="wilayas-title">
        <div className="section-head">
          <div>
            <h2 id="wilayas-title">{t("home.wilayas")}</h2>
            <p>
              {lang === "ar"
                ? "اختر ولايتك لعرض الإعلانات القريبة."
                : "Choisissez votre wilaya pour voir les annonces proches."}
            </p>
          </div>
        </div>
        <div className="row wrap">
          {popular.map((item) => (
            <Link key={item.id} to={`/wilayas/${item.slug}`} className="chip">
              <Icon name="map-pin" size={14} />
              {lang === "ar" ? item.nameAr : item.nameFr}
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div
          className="panel row-between"
          style={{ background: "var(--brand-50)", borderColor: "var(--brand-100)" }}
        >
          <div>
            <h2 className="panel-title">{t("home.cta")}</h2>
            <p className="muted small">
              {lang === "ar"
                ? "بِيع ما لم تعد تحتاجه. إعلانك يظهر بعد المراجعة فقط."
                : "Vendez ce dont vous ne vous servez plus. Votre annonce paraît après validation."}
            </p>
          </div>
          <Link to="/vendre" className="btn btn-lg">
            <Icon name="plus" size={18} /> {t("home.cta")}
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="trust-grid">
          {[
            { icon: "shield" as IconName, title: t("home.trust1"), text: t("home.trust1Text") },
            { icon: "phone" as IconName, title: t("home.trust2"), text: t("home.trust2Text") },
            { icon: "map-pin" as IconName, title: t("home.trust3"), text: t("home.trust3Text") },
          ].map((item) => (
            <div key={item.title} className="card" style={{ padding: 20 }}>
              <span className="category-icon">
                <Icon name={item.icon} size={22} />
              </span>
              <h3 className="mt-3" style={{ fontSize: "var(--text-md)" }}>
                {item.title}
              </h3>
              <p className="small muted mt-2">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
