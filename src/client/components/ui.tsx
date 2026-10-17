import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Icon, type IconName } from "./Icons";
import { useI18n } from "../lib/i18n";
import { formatPrice, statusBadgeClass } from "../lib/format";
import type { ListingStatus } from "../../shared/types";

/* ------------------------------------------------------------------ button */
type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  block?: boolean;
  icon?: IconName;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  icon,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? ""
      : variant === "secondary"
        ? "btn-secondary"
        : variant === "ghost"
          ? "btn-ghost"
          : "btn-danger";
  const sizeClass = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${block ? "btn-block" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={18} />
      ) : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ fields */
interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`.trim()} {...props} />;
}

/* ------------------------------------------------------------------ badges */
export function Badge({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`.trim()}>{children}</span>;
}

export function StatusBadge({ status }: { status: ListingStatus }) {
  const { t } = useI18n();
  return <span className={`badge ${statusBadgeClass(status)}`}>{t(`status.${status}`)}</span>;
}

export function Price({
  amount,
  negotiable = false,
  size,
}: {
  amount: number;
  negotiable?: boolean;
  size?: "lg";
}) {
  const { lang, t } = useI18n();
  return (
    <span className={size === "lg" ? "detail-price" : "price"}>
      {formatPrice(amount, lang)}
      {negotiable ? <small> · {t("common.negotiable")}</small> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ loading */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="small">{label ?? "Chargement…"}</span>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-media" />
      <div className="skeleton skeleton-line" style={{ width: "55%" }} />
      <div className="skeleton skeleton-line" style={{ width: "85%" }} />
      <div className="skeleton skeleton-line" style={{ width: "40%", marginBottom: 16 }} />
    </div>
  );
}

export function SkeletonStack({ count = 8 }: { count?: number }) {
  return (
    <div className="listing-grid">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ empty */
export function EmptyState({
  icon = "search",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "danger" | "warning" | "success";
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea, button, [href]",
      );
      focusable?.focus();
    }, 20);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
        {footer ? <div className="dialog-actions">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ toasts */
interface ToastItem {
  id: number;
  message: string;
  tone: "default" | "success" | "error";
}

interface ToastValue {
  push: (message: string, tone?: ToastItem["tone"]) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastItem["tone"] = "default") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            <span>{toast.message}</span>
            <button
              type="button"
              className="close"
              aria-label="Fermer"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

/* --------------------------------------------------------------- pagination */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  const push = (value: number | "…") => {
    if (pages[pages.length - 1] !== value) pages.push(value);
  };
  push(1);
  if (page > 3) push("…");
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i += 1) push(i);
  if (page < totalPages - 2) push("…");
  if (totalPages > 1) push(totalPages);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t("common.previous")}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      {pages.map((item, index) =>
        item === "…" ? (
          <span key={`gap-${index}`} className="ellipsis">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={item === page ? "active" : ""}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t("common.next")}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------- misc */
export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, size }: { name: string | null | undefined; size?: "lg" | "xl" }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={`avatar ${size === "xl" ? "avatar-xl" : size === "lg" ? "avatar-lg" : ""}`}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}
