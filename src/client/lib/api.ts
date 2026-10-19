import type { ApiErrorBody } from "../../shared/types";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  bypassCache?: boolean;
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const apiGetCache = new Map<string, CacheEntry>();

export function clearApiCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    apiGetCache.clear();
    return;
  }
  for (const key of apiGetCache.keys()) {
    if (key.startsWith(pathPrefix)) {
      apiGetCache.delete(key);
    }
  }
}

function getCacheTtl(path: string): number {
  if (path.startsWith("/notifications") || path.startsWith("/auth/me")) {
    return 0; // Never cache real-time auth or notification checks
  }
  if (path.startsWith("/meta") || path.startsWith("/categories") || path.startsWith("/wilayas")) {
    return 300_000; // 5 minutes for static metadata
  }
  if (path.startsWith("/listings") || path.startsWith("/sellers")) {
    return 30_000; // 30 seconds for listings & store catalogs
  }
  if (path.startsWith("/account/stats") || path.startsWith("/favorites")) {
    return 15_000; // 15 seconds
  }
  return 15_000;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";

  // Check in-memory cache for GET requests
  if (method === "GET" && !options.bypassCache) {
    const cached = apiGetCache.get(path);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }
  }

  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (typeof options.body === "string") {
    headers["content-type"] = "application/json";
    body = options.body;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (method !== "GET" && csrfToken) headers["x-csrf-token"] = csrfToken;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: options.signal,
  });

  if (response.status === 204) {
    // Mutation succeeded: invalidate cached GET data
    if (method !== "GET") clearApiCache();
    return null as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!response.ok) {
      throw new ApiError(response.status, "HTTP_ERROR", `Erreur ${response.status}.`);
    }
    return null as T;
  }

  const data = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    const error = data as ApiErrorBody;
    throw new ApiError(
      response.status,
      error.error?.code ?? "ERROR",
      error.error?.message ?? "Une erreur est survenue.",
      error.error?.details,
    );
  }

  // On successful mutation, invalidate cached queries
  if (method !== "GET") {
    clearApiCache();
  } else {
    // Cache successful GET responses if eligible
    const ttl = getCacheTtl(path);
    if (ttl > 0) {
      apiGetCache.set(path, {
        data,
        expiresAt: Date.now() + ttl,
      });
      // Cap memory usage to max 120 entries
      if (apiGetCache.size > 120) {
        const oldestKey = apiGetCache.keys().next().value;
        if (oldestKey) apiGetCache.delete(oldestKey);
      }
    }
  }

  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue.";
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const details = error.details as { fields?: { path: string; message: string }[] } | undefined;
  const result: Record<string, string> = {};
  for (const field of details?.fields ?? []) {
    if (field.path) result[field.path] = field.message;
  }
  return result;
}
