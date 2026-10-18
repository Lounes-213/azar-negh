import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hmacHex,
  randomToken,
  sha256Hex,
  timingSafeEqual,
  verifyPassword,
} from "../../src/server/lib/crypto";
import { displayAlgerianPhone, normalizeAlgerianPhone } from "../../src/shared/phone";
import { assertImagePayload, detectImageType } from "../../src/server/lib/images";
import {
  allowedActions,
  assertTransition,
  canViewListing,
  statusAfterSellerEdit,
} from "../../src/server/policies/listings";
import { listingInputSchema, searchQuerySchema } from "../../src/shared/validation";

describe("Algerian phone numbers", () => {
  it("normalizes local and international mobile formats", () => {
    expect(normalizeAlgerianPhone("0551 23 45 67")).toBe("+213551234567");
    expect(normalizeAlgerianPhone("+213 661 23 45 67")).toBe("+213661234567");
    expect(normalizeAlgerianPhone("00213770112233")).toBe("+213770112233");
  });

  it("rejects landlines, wrong lengths and empty input", () => {
    expect(normalizeAlgerianPhone("021 23 45 67")).toBeNull();
    expect(normalizeAlgerianPhone("0551234")).toBeNull();
    expect(normalizeAlgerianPhone("")).toBeNull();
  });

  it("formats for display", () => {
    expect(displayAlgerianPhone("+213551234567")).toBe("0551 23 45 67");
  });
});

describe("password hashing (PBKDF2-SHA256)", () => {
  it("produces a salted hash and verifies it", async () => {
    const hash = await hashPassword("MotDePasse1234");
    expect(hash.startsWith("pbkdf2-sha256$600000$")).toBe(true);
    expect(hash).not.toContain("MotDePasse1234");
    expect(await verifyPassword("MotDePasse1234", hash)).toBe(true);
    expect(await verifyPassword("MotDePasse12345", hash)).toBe(false);
  }, 30_000);

  it("uses a unique salt per hash", async () => {
    const [first, second] = await Promise.all([
      hashPassword("SamePass123"),
      hashPassword("SamePass123"),
    ]);
    expect(first).not.toBe(second);
  }, 30_000);

  it("rejects malformed or weakened stored hashes", async () => {
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$1000$c2FsdA$aGFzaA")).toBe(false);
  }, 30_000);
});

describe("tokens and comparison", () => {
  it("generates unique url-safe tokens", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("computes stable SHA-256 and HMAC values", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await hmacHex("secret", "message")).toBe(await hmacHex("secret", "message"));
    expect(await hmacHex("secret", "message")).not.toBe(await hmacHex("secret", "message2"));
  });

  it("compares in constant time semantics", () => {
    expect(timingSafeEqual("abcdef", "abcdef")).toBe(true);
    expect(timingSafeEqual("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeEqual("a", "ab")).toBe(false);
  });
});

describe("image content validation", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);

  it("sniffs JPEG, PNG and WebP magic bytes", () => {
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(jpeg)).toBe("image/jpeg");
    expect(detectImageType(webp)).toBe("image/webp");
  });

  it("rejects SVG, HTML and empty payloads", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectImageType(svg)).toBeNull();
    expect(() => assertImagePayload(svg, "image/svg+xml", 1000)).toThrowError(/Format non pris/);
    expect(() => assertImagePayload(new Uint8Array(), "image/png", 1000)).toThrowError(/vide/);
  });

  it("rejects declared/stored type mismatches and oversized files", () => {
    expect(() => assertImagePayload(png, "image/jpeg", 1000)).toThrowError(/ne correspond pas/);
    expect(() => assertImagePayload(png, "image/png", 10)).toThrowError(/trop lourde/);
    expect(assertImagePayload(png, "image/png", 1000)).toBe("image/png");
  });
});

describe("listing state machine", () => {
  it("allows the documented transitions and blocks the rest", () => {
    expect(() => assertTransition("DRAFT", "PENDING")).not.toThrow();
    expect(() => assertTransition("PENDING", "APPROVED")).not.toThrow();
    expect(() => assertTransition("PENDING", "REJECTED")).not.toThrow();
    expect(() => assertTransition("APPROVED", "PENDING")).not.toThrow();
    expect(() => assertTransition("SOLD", "APPROVED")).not.toThrow();
    expect(() => assertTransition("PENDING", "SOLD")).toThrowError(/Transition/);
    expect(() => assertTransition("DRAFT", "APPROVED")).toThrowError(/Transition/);
    expect(() => assertTransition("ARCHIVED", "APPROVED")).toThrowError(/Transition/);
  });

  it("forces moderation after editing a published listing", () => {
    expect(statusAfterSellerEdit("APPROVED")).toBe("PENDING");
    expect(statusAfterSellerEdit("DRAFT")).toBe("DRAFT");
    expect(statusAfterSellerEdit("REJECTED")).toBe("DRAFT");
    expect(() => statusAfterSellerEdit("PENDING")).toThrowError(/ne peut plus/);
    expect(() => statusAfterSellerEdit("SOLD")).toThrowError(/ne peut plus/);
  });

  it("keeps unpublished listings private", () => {
    const owner = { id: "seller-1", role: "USER" as const };
    const stranger = { id: "buyer-1", role: "USER" as const };
    const moderator = { id: "mod-1", role: "MODERATOR" as const };
    expect(canViewListing("DRAFT", "seller-1", owner)).toBe(true);
    expect(canViewListing("DRAFT", "seller-1", stranger)).toBe(false);
    expect(canViewListing("PENDING", "seller-1", moderator)).toBe(true);
    expect(canViewListing("APPROVED", "seller-1", null)).toBe(true);
    expect(canViewListing("REJECTED", "seller-1", stranger)).toBe(false);
  });

  it("exposes owner actions consistent with status", () => {
    expect(allowedActions("DRAFT", true, "USER")).toEqual(["edit", "submit", "delete", "archive"]);
    expect(allowedActions("APPROVED", true, "USER")).toEqual(["edit", "mark_sold", "archive"]);
    expect(allowedActions("SOLD", true, "USER")).toEqual(["archive", "relist"]);
    expect(allowedActions("APPROVED", false, "USER")).toEqual([]);
    expect(allowedActions("PENDING", false, "ADMIN")).toEqual([]);
  });
});

describe("request validation", () => {
  const validListing = {
    title: "Vélo de ville en bon état",
    description: "Vélo peu utilisé, révisé récemment, deux paniers inclus.",
    categoryId: 8,
    wilayaId: 16,
    priceDa: 18000,
    condition: "GOOD",
  };

  it("accepts a valid listing payload with defaults", () => {
    const parsed = listingInputSchema.parse(validListing);
    expect(parsed.negotiable).toBe(false);
    expect(parsed.contactPhonePublic).toBe(true);
    expect(parsed.imageIds).toEqual([]);
  });

  it("rejects short titles, short descriptions and negative prices", () => {
    expect(listingInputSchema.safeParse({ ...validListing, title: "Vélo" }).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...validListing, description: "Court" }).success).toBe(
      false,
    );
    expect(listingInputSchema.safeParse({ ...validListing, priceDa: -1 }).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...validListing, condition: "BROKEN" }).success).toBe(
      false,
    );
    expect(listingInputSchema.safeParse({ ...validListing, wilayaId: 70 }).success).toBe(false);
  });

  it("clamps search parameters and defaults sorting", () => {
    const parsed = searchQuerySchema.parse({ page: "2", perPage: "24", sort: "price_asc" });
    expect(parsed.page).toBe(2);
    expect(parsed.sort).toBe("price_asc");
    expect(searchQuerySchema.parse({}).sort).toBe("newest");
    expect(searchQuerySchema.safeParse({ perPage: "500" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
  });
});
