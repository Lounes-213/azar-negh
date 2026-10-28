import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";
import { useI18n } from "../lib/i18n";

export interface SelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  badge?: string;
  /** Leading disc artwork (category icons). Omitted for the text-only lists. */
  image?: string | null;
}

export interface CustomSelectProps {
  id?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  searchable?: boolean;
  searchPlaceholder?: string;
  size?: "sm" | "md";
}

export function CustomSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = "",
  style,
  searchable,
  searchPlaceholder,
  size = "md",
}: CustomSelectProps) {
  const { lang } = useI18n();
  const autoId = useId();
  const selectId = id || autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const shouldSearch = searchable ?? options.length > 7;

  const selectedOption = useMemo(
    () => options.find((opt) => String(opt.value) === String(value)),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        String(opt.value).includes(q),
    );
  }, [options, query]);

  // Handle scroll indicators (début et fin)
  const updateScrollIndicators = () => {
    const el = listRef.current;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight;
    setCanScrollUp(hasOverflow && el.scrollTop > 6);
    setCanScrollDown(hasOverflow && el.scrollTop < el.scrollHeight - el.clientHeight - 6);
  };

  useEffect(() => {
    if (open) {
      updateScrollIndicators();
    }
  }, [open, filteredOptions]);

  // Click outside listener
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (val: string | number) => {
    onChange(String(val));
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrap ${className}`.trim()}
      style={{ position: "relative", width: "100%", ...style }}
    >
      <button
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`custom-select-trigger ${size === "sm" ? "is-sm" : ""} ${open ? "is-open" : ""}`}
      >
        <span className={`custom-select-label ${!selectedOption ? "is-placeholder" : ""}`}>
          {selectedOption ? (
            <span className="custom-select-text">
              {selectedOption.image ? (
                <img
                  className="custom-select-thumb"
                  src={selectedOption.image}
                  width={22}
                  height={22}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
              <span>{selectedOption.label}</span>
              {selectedOption.sublabel ? (
                <small className="custom-select-sublabel">({selectedOption.sublabel})</small>
              ) : null}
            </span>
          ) : (
            placeholder || (lang === "ar" ? "اختر..." : "Sélectionner...")
          )}
        </span>
        <span className={`custom-select-arrow ${open ? "is-open" : ""}`}>
          <Icon name="chevron-down" size={15} />
        </span>
      </button>

      {open ? (
        <div className="custom-select-dropdown" role="listbox">
          {shouldSearch ? (
            <div className="custom-select-search-wrap">
              <Icon name="search" size={14} />
              <input
                ref={searchInputRef}
                type="text"
                className="custom-select-search-input"
                placeholder={
                  searchPlaceholder || (lang === "ar" ? "بحث سريع..." : "Rechercher...")
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {query ? (
                <button
                  type="button"
                  className="custom-select-search-clear"
                  onClick={() => setQuery("")}
                >
                  <Icon name="close" size={12} />
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Top Scroll Indicator */}
          <div className={`custom-scroll-indicator top ${canScrollUp ? "active" : ""}`}>
            <span className="scroll-arrow">▲</span>
          </div>

          <div
            ref={listRef}
            className="custom-select-list"
            onScroll={updateScrollIndicators}
          >
            {filteredOptions.length === 0 ? (
              <div className="custom-select-empty">
                {lang === "ar" ? "لا توجد نتائج" : "Aucun résultat"}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`custom-select-item ${isSelected ? "is-selected" : ""}`}
                  >
                    <span className="custom-select-item-text">
                      {opt.image ? (
                        <img
                          className="custom-select-thumb"
                          src={opt.image}
                          width={20}
                          height={20}
                          alt=""
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="custom-select-item-label">{opt.label}</span>
                      {opt.sublabel ? (
                        <small className="custom-select-item-sublabel">{opt.sublabel}</small>
                      ) : null}
                    </span>
                    {opt.badge ? (
                      <span className="custom-select-item-badge">{opt.badge}</span>
                    ) : null}
                    {isSelected ? (
                      <span className="custom-select-check">
                        <Icon name="check" size={14} />
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Scroll Indicator */}
          <div className={`custom-scroll-indicator bottom ${canScrollDown ? "active" : ""}`}>
            <span className="scroll-arrow">▼</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
