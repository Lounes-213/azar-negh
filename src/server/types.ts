import type { Role, UserStatus } from "../shared/types";

export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  NOTIFICATIONS: DurableObjectNamespace;
  APP_ENV: string;
  PUBLIC_ORIGIN: string;
  SESSION_TTL_DAYS: string;
  MAX_IMAGES_PER_LISTING: string;
  MAX_IMAGE_BYTES: string;
  /** HMAC + CSRF signing secret. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEYS?: string;
  AI?: any;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string | null;
  avatarUrl?: string | null;
  phone: string | null;
  phonePublic: boolean;
  whatsappPublic: boolean;
  wilayaId: number | null;
  bio: string | null;
  profileComplete: boolean;
  storeName?: string | null;
  storeSlug?: string | null;
  commune?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: string | null;
  bannerUrl?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface AppVariables {
  user: AuthUser | null;
  session: AuthSession | null;
  csrfToken: string | null;
  ipHash: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};

export type AppContext = import("hono").Context<AppEnv>;
