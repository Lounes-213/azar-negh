import type { ListingCondition, ListingStatus } from "../../shared/types";

export function formatPrice(amount: number, lang: "fr" | "ar" = "fr"): string {
  const formatted = new Intl.NumberFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formatted} DA`;
}

export function formatDa(amount: number, lang: "fr" | "ar" = "fr"): string {
  return formatPrice(amount, lang);
}

export function formatDate(iso: string | null | undefined, lang: "fr" | "ar" = "fr"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(iso: string | null | undefined, lang: "fr" | "ar" = "fr"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(iso: string | null | undefined, lang: "fr" | "ar" = "fr"): string {
  if (!iso) return "—";
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return "—";
  const diff = Math.max(0, Date.now() - date);
  const minutes = Math.floor(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "fr", { numeric: "auto" });
  if (minutes < 1) return lang === "ar" ? "الآن" : "à l'instant";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

export const STATUS_TONE: Record<ListingStatus, string> = {
  DRAFT: "badge",
  PENDING: "badge-warning",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  SOLD: "badge-info",
  ARCHIVED: "badge",
};

export function statusBadgeClass(status: ListingStatus): string {
  return STATUS_TONE[status] ?? "badge";
}

export const CONDITION_KEY: Record<ListingCondition, string> = {
  NEW: "cond.NEW",
  LIKE_NEW: "cond.LIKE_NEW",
  GOOD: "cond.GOOD",
  FAIR: "cond.FAIR",
  FOR_PARTS: "cond.FOR_PARTS",
};

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function phoneDisplay(phone: string | null): string {
  if (!phone) return "";
  if (phone.startsWith("+213")) {
    const local = `0${phone.slice(4)}`;
    return local.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
  }
  return phone;
}

export function whatsappLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function formatPhoneForInput(phone: string | null | undefined): string {
  if (!phone) return "";
  return phoneDisplay(phone);
}
