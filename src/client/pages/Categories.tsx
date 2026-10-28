import { useState, useMemo } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { Icon } from "../components/Icons";
import { CategoryAvatar } from "../components/CategoryAvatar";
import { Spinner, EmptyState } from "../components/ui";
import type { MetaResponse, Category } from "../../shared/types";

export function Categories() {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  useDocumentTitle(isAr ? "جميع الفئات — Azar Neɣ" : "Toutes les catégories — Azar Neɣ");

  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const [searchTerm, setSearchTerm] = useState("");

  const categories: Category[] = meta.data?.categories ?? [];

  // Filter categories and subcategories by search term
  const filteredCategories: Category[] = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const term = searchTerm.toLowerCase().trim();

    return categories
      .map((cat: Category) => {
        const matchesParent =
          cat.nameFr.toLowerCase().includes(term) ||
          cat.nameAr.toLowerCase().includes(term);

        const matchingChildren = (cat.children || []).filter(
          (sub: Category) =>
            sub.nameFr.toLowerCase().includes(term) ||
            sub.nameAr.toLowerCase().includes(term)
        );

        if (matchesParent) {
          return cat;
        }

        if (matchingChildren.length > 0) {
          return {
            ...cat,
            children: matchingChildren,
          };
        }

        return null;
      })
      .filter((cat): cat is Category => Boolean(cat));
  }, [categories, searchTerm]);

  return (
    <div className="container page" style={{ maxWidth: 1160, paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Link to="/" className="btn-link small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="chevron-left" size={14} />
            <span>{isAr ? "الرئيسية" : "Accueil"}</span>
          </Link>
          <span className="muted">/</span>
          <span className="small muted">{isAr ? "الفئات" : "Catégories"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
              {isAr ? "جميع الفئات والتصنيفات" : "Toutes les catégories"}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>
              {isAr
                ? "استكشف كل الأقسام والتصنيفات الفرعية المتاحة في منصة Azar Neɣ."
                : "Explorez l'ensemble des univers et sous-catégories disponibles sur Azar Neɣ."}
            </p>
          </div>

          {/* Quick Search */}
          <div style={{ position: "relative", width: "100%", maxWidth: 300 }}>
            <input
              type="text"
              className="input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? "ابحث عن فئة أو منتج..." : "Rechercher une catégorie..."}
              style={{ paddingInlineStart: 36, borderRadius: "var(--radius-pill)" }}
            />
            <span
              style={{
                position: "absolute",
                insetInlineStart: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                pointerEvents: "none",
                display: "grid",
              }}
            >
              <Icon name="search" size={16} />
            </span>
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{
                  position: "absolute",
                  insetInlineEnd: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--muted)",
                }}
              >
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Content */}
      {meta.loading ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <Spinner label={t("common.loading")} />
        </div>
      ) : filteredCategories.length === 0 ? (
        <EmptyState
          icon="search"
          title={isAr ? "لا توجد نتائج" : "Aucune catégorie trouvée"}
          text={isAr ? `لم نجد فئات تطابق "${searchTerm}"` : `Aucun résultat pour "${searchTerm}"`}
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setSearchTerm("")}>
              {isAr ? "إعادة تعيين البحث" : "Réinitialiser la recherche"}
            </button>
          }
        />
      ) : (
        <div className="categories-full-grid" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {filteredCategories.map((parent) => {
            const parentName = isAr ? parent.nameAr : parent.nameFr;
            const children = parent.children || [];

            return (
              <div
                key={parent.id}
                className="category-master-card"
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--line)",
                  padding: "20px 22px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
                  transition: "border-color 0.15s ease",
                }}
              >
                {/* Parent Category Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: 16,
                    borderBottom: "1px solid var(--line-subtle, var(--line))",
                    marginBottom: 16,
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <CategoryAvatar slug={parent.slug} icon={parent.icon} size={46} />
                    <div>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: "1.2rem",
                          fontWeight: 800,
                          color: "var(--ink)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Link
                          to={`/categories/${parent.slug}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {parentName}
                        </Link>
                      </h2>
                      <span className="small muted">
                        {parent.listingCount
                          ? `${parent.listingCount} ${isAr ? "إعلان" : parent.listingCount > 1 ? "annonces" : "annonce"}`
                          : isAr
                            ? "اكتشف"
                            : "Découvrir"}
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/categories/${parent.slug}`}
                    className="btn btn-secondary btn-sm"
                    style={{ borderRadius: "var(--radius-pill)", gap: 6 }}
                  >
                    <span>{isAr ? "تصفح الكل" : "Tout voir"}</span>
                    <Icon name="arrow-right" size={14} />
                  </Link>
                </div>

                {/* Subcategories Grid */}
                {children.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {children.map((sub) => {
                      const subName = isAr ? sub.nameAr : sub.nameFr;
                      return (
                        <Link
                          key={sub.id}
                          to={`/categories/${sub.slug}`}
                          className="subcat-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "9px 12px",
                            borderRadius: "var(--radius-md)",
                            background: "var(--surface-muted)",
                            border: "1px solid transparent",
                            textDecoration: "none",
                            color: "var(--ink)",
                            transition: "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
                          }}
                        >
                          <CategoryAvatar slug={sub.slug} icon={sub.icon} size={32} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: "0.88rem",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {subName}
                            </div>
                            {sub.listingCount ? (
                              <div
                                className="small muted"
                                style={{ fontSize: "0.75rem", opacity: 0.8 }}
                              >
                                {sub.listingCount} {isAr ? "إعلان" : "annonces"}
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="small muted" style={{ padding: "8px 0" }}>
                    {isAr
                      ? "اضغط على زر تصفح الكل لمشاهدة جميع الإعلانات في هذا القسم."
                      : "Cliquez sur Tout voir pour explorer les annonces de cette catégorie."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
