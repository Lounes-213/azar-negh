/**
 * Cryptographic helpers that run on the Workers runtime using Web Crypto only.
 *
 * Password hashing: PBKDF2-HMAC-SHA256 with 600 000 iterations (OWASP current
 * recommendation for PBKDF2-SHA256). Measured in workerd during Phase 1:
 * 100k ≈ 71 ms, 600k ≈ 445 ms per hash. That exceeds the Workers Free plan's
 * 10 ms CPU budget, so production password auth requires Workers Paid. See
 * docs/FREE_TIER_LIMITS.md. Do not lower the iteration count silently.
 */
const PBKDF2_ITERATIONS = 600_000;
const KEY_BITS = 256;
const ALGO = "pbkdf2-sha256";

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return `${ALGO}$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGO) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  try {
    const salt = fromBase64Url(parts[2]!);
    const expected = parts[3]!;
    const derived = await derive(password, salt, iterations);
    return timingSafeEqual(toBase64Url(derived), expected);
  } catch {
    return false;
  }
}
