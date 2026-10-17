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
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
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

  if (response.status === 204) return null as T;

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
