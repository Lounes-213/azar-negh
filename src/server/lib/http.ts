import type { Context } from "hono";
import type { ZodType } from "zod";
import type { AppEnv } from "../types";
import type { ApiErrorBody } from "../../shared/types";

export class HttpError extends Error {
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

export function fail(
  c: Context<AppEnv>,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return c.json(body, status as 400);
}

export async function parseJson<T>(c: Context<AppEnv>, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        // keep raw
      }
    }
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Le corps de la requête doit être un JSON valide.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "Données invalides.", {
      fields: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function parseQuery<T>(query: Record<string, string>, schema: ZodType<T>): T {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== "" && value !== undefined && value !== null) cleaned[key] = value;
  }
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "Paramètres de requête invalides.", {
      fields: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoAfterDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
