export interface UserPersona {
  preferredWilaya?: string;
  recentSearches: string[];
  favoriteCategories: string[];
  categoryCounts: Record<string, number>;
}

const STORAGE_KEY = "azar_user_persona";

export function getLocalUserPersona(): UserPersona {
  if (typeof window === "undefined") {
    return { recentSearches: [], favoriteCategories: [], categoryCounts: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { recentSearches: [], favoriteCategories: [], categoryCounts: {} };
    return JSON.parse(raw);
  } catch {
    return { recentSearches: [], favoriteCategories: [], categoryCounts: {} };
  }
}

export function saveUserPersona(persona: UserPersona): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persona));
  } catch {
    // Quota or private mode fallback
  }
}

export function trackSearchInPersona(query: string): void {
  if (!query || query.trim().length < 2) return;
  const persona = getLocalUserPersona();
  const clean = query.trim();
  const filtered = persona.recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase());
  filtered.unshift(clean);
  persona.recentSearches = filtered.slice(0, 8);
  saveUserPersona(persona);
}

export function trackCategoryInPersona(categoryName: string): void {
  if (!categoryName) return;
  const persona = getLocalUserPersona();
  persona.categoryCounts = persona.categoryCounts || {};
  persona.categoryCounts[categoryName] = (persona.categoryCounts[categoryName] || 0) + 1;

  // Re-sort favorite categories by visit frequency
  const sorted = Object.entries(persona.categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat)
    .slice(0, 5);

  persona.favoriteCategories = sorted;
  saveUserPersona(persona);
}

export function trackWilayaInPersona(wilayaName: string): void {
  if (!wilayaName) return;
  const persona = getLocalUserPersona();
  persona.preferredWilaya = wilayaName;
  saveUserPersona(persona);
}
