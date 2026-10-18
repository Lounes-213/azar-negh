import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "./Icons";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { formatDa } from "../lib/format";

export interface SuggestionItem {
  id: string;
  title: string;
  priceDa: number;
  wilaya: { nameFr: string; nameAr: string };
  category: { nameFr: string; nameAr: string };
  coverImage: string | null;
}

export interface SuggestionCategory {
  id: number;
  slug: string;
  nameFr: string;
  nameAr: string;
}

export interface SuggestionStore {
  id: string;
  displayName: string;
  storeName: string | null;
  storeSlug: string | null;
  logoUrl: string | null;
  commune: string | null;
  wilaya: { id: number; nameFr: string; nameAr: string };
  listingsCount: number;
}

interface SuggestionsData {
  suggestions: SuggestionItem[];
  categories: SuggestionCategory[];
  stores?: SuggestionStore[];
}

interface SearchSuggestionsProps {
  query: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectQuery?: (query: string) => void;
}

export function SearchSuggestions({
  query,
  isOpen,
  onClose,
  onSelectQuery,
}: SearchSuggestionsProps) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<SuggestionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setData(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<SuggestionsData>(
          `/listings/suggestions?q=${encodeURIComponent(trimmed)}`,
        );
        if (active) setData(res);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  if (!isOpen || trimmed.length < 2) return null;

  const hasSuggestions = Boolean(
    data && (data.suggestions.length > 0 || data.categories.length > 0 || (data.stores && data.stores.length > 0)),
  );

  return (
    <div ref={containerRef} className="search-suggestions-dropdown" role="listbox">
      {/* Store / Boutique matches */}
      {data?.stores && data.stores.length > 0 ? (
        <div className="search-suggestions-section">
          <div className="search-suggestions-heading" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="store" size={13} className="text-accent" />
            <span>{lang === "ar" ? "المتاجر والبوتيكات" : "Boutiques"}</span>
          </div>
          {data.stores.map((store) => (
            <button
              key={store.id}
              type="button"
              className="search-suggestion-row store-row"
              onClick={() => {
                onClose();
                navigate(`/boutique/${store.storeSlug || store.id}`);
              }}
            >
              <div
                className="search-suggestion-thumb store-thumb"
                style={{
                  borderRadius: "50%",
                  border: "1.5px solid var(--brand-500)",
                  padding: 2,
                }}
              >
                {store.logoUrl ? (
                  <img
                    src={store.logoUrl}
                    alt={store.storeName || store.displayName}
                    loading="lazy"
                    style={{ borderRadius: "50%" }}
                  />
                ) : (
                  <Icon name="store" size={16} />
                )}
              </div>
              <div className="search-suggestion-details">
                <div className="search-suggestion-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong>{store.storeName || store.displayName}</strong>
                  {store.storeSlug ? (
                    <span className="search-suggestion-slug" style={{ fontSize: "0.75rem", color: "var(--brand-700)", fontWeight: 700 }}>
                      @{store.storeSlug}
                    </span>
                  ) : null}
                </div>
                <div className="search-suggestion-meta">
                  <span
                    style={{
                      background: "var(--brand-100)",
                      color: "var(--brand-800)",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 10,
                    }}
                  >
                    {lang === "ar" ? "متجر معتمد" : "Boutique"}
                  </span>
                  <span>·</span>
                  <span>{lang === "ar" ? store.wilaya.nameAr : store.wilaya.nameFr}</span>
                  <span>·</span>
                  <span>{store.listingsCount} {lang === "ar" ? "إعلان" : "articles"}</span>
                </div>
              </div>
              <Icon name="chevron-right" size={13} style={{ marginInlineStart: "auto", opacity: 0.5 }} />
            </button>
          ))}
        </div>
      ) : null}

      {/* Category matches */}
      {data?.categories && data.categories.length > 0 ? (
        <div className="search-suggestions-section">
          <div className="search-suggestions-heading">
            {lang === "ar" ? "الفئات المطابقة" : "Catégories"}
          </div>
          {data.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="search-suggestion-row cat-row"
              onClick={() => {
                onClose();
                navigate(`/annonces?category=${cat.id}`);
              }}
            >
              <span className="search-suggestion-icon">
                <Icon name="grid" size={14} />
              </span>
              <span className="search-suggestion-label">
                {lang === "ar" ? cat.nameAr : cat.nameFr}
              </span>
              <Icon name="chevron-right" size={13} style={{ marginInlineStart: "auto", opacity: 0.5 }} />
            </button>
          ))}
        </div>
      ) : null}

      {/* Product / Listing suggestions */}
      {data?.suggestions && data.suggestions.length > 0 ? (
        <div className="search-suggestions-section">
          <div className="search-suggestions-heading">
            {lang === "ar" ? "إعلانات مطابقة" : "Annonces"}
          </div>
          {data.suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="search-suggestion-row item-row"
              onClick={() => {
                onClose();
                navigate(`/annonces/${item.id}`);
              }}
            >
              <div className="search-suggestion-thumb">
                {item.coverImage ? (
                  <img src={item.coverImage} alt={item.title} loading="lazy" />
                ) : (
                  <Icon name="image" size={16} />
                )}
              </div>
              <div className="search-suggestion-details">
                <div className="search-suggestion-title">{item.title}</div>
                <div className="search-suggestion-meta">
                  <span className="search-suggestion-price">{formatDa(item.priceDa)}</span>
                  <span>·</span>
                  <span>{lang === "ar" ? item.wilaya.nameAr : item.wilaya.nameFr}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="search-suggestions-loading">
          <span>{lang === "ar" ? "جاري البحث..." : "Recherche..."}</span>
        </div>
      ) : null}

      {!loading && !hasSuggestions ? (
        <div className="search-suggestions-empty">
          <span>
            {lang === "ar" ? "لا توجد نتائج سريعة" : "Aucun résultat direct"}
          </span>
        </div>
      ) : null}

      {/* Direct Search query button */}
      <button
        type="button"
        className="search-suggestion-footer"
        onClick={() => {
          onClose();
          if (onSelectQuery) onSelectQuery(trimmed);
          navigate(`/annonces?q=${encodeURIComponent(trimmed)}`);
        }}
      >
        <Icon name="search" size={14} />
        <span>
          {lang === "ar"
            ? `عرض جميع النتائج لـ « ${trimmed} »`
            : `Voir tous les résultats pour « ${trimmed} »`}
        </span>
      </button>
    </div>
  );
}
