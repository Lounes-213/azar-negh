import { describe, expect, it } from "vitest";
import WebSocket from "ws";

const BASE = process.env.INTEGRATION_BASE_URL ?? "http://127.0.0.1:8788";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = Date.now().toString(36);
const ADMIN_EMAIL = process.env.INTEGRATION_ADMIN_EMAIL ?? "admin@test.dz";
const ADMIN_PASSWORD = process.env.INTEGRATION_ADMIN_PASSWORD ?? "AdminTest1234";

type Json = Record<string, unknown>;

interface ApiResponse<T = Json> {
  status: number;
  data: T;
  headers: Headers;
}

class Client {
  cookie = "";
  csrf = "";
  ip: string;

  constructor(ip: string) {
    this.ip = ip;
  }

  async request<T = Json>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      skipCsrf?: boolean;
      headers?: Record<string, string>;
    } = {},
  ): Promise<ApiResponse<T>> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { "cf-connecting-ip": this.ip, ...options.headers };
    if (this.cookie) headers.cookie = this.cookie;
    if (method !== "GET" && this.csrf && !options.skipCsrf) headers["x-csrf-token"] = this.csrf;

    let body: BodyInit | undefined;
    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(BASE + path, { method, headers, body });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      if (cookie.startsWith("azar_session=")) {
        this.cookie = cookie.split(";")[0]!;
      }
    }
    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }
    const record = data as unknown as { user?: { csrfToken?: string } };
    if (record?.user?.csrfToken) this.csrf = record.user.csrfToken;
    return { status: response.status, data, headers: response.headers };
  }

  upload(bytes: Buffer, type = "image/png", name = "photo.png") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), name);
    return this.request<{ image: { id: string; url: string } }>("/api/images", {
      method: "POST",
      body: form,
    });
  }
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

interface Frame {
  type: string;
  unread?: number;
  notification?: { type: string; title: string; body: string | null };
}

interface SocketHandle {
  ws: WebSocket;
  waitFor: (predicate: (frame: Frame) => boolean, timeoutMs?: number) => Promise<Frame>;
  close: () => void;
}

async function openSocket(client: Client): Promise<SocketHandle> {
  const ws = new WebSocket(`${WS_BASE}/api/ws`, {
    headers: { cookie: client.cookie, "cf-connecting-ip": client.ip },
  });
  const frames: Frame[] = [];
  const waiters: {
    predicate: (frame: Frame) => boolean;
    resolve: (frame: Frame) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }[] = [];

  ws.on("message", (raw) => {
    let frame: Frame;
    try {
      frame = JSON.parse(raw.toString()) as Frame;
    } catch {
      return;
    }
    frames.push(frame);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(frame)) {
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(frame);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  return {
    ws,
    waitFor(predicate, timeoutMs = 12_000) {
      const existing = frames.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise<Frame>((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((item) => item.timer === timer);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Timeout en attente d'une trame WebSocket"));
        }, timeoutMs);
        waiters.push({ predicate, resolve, reject, timer });
      });
    },
    close() {
      try {
        ws.close(1000);
      } catch {
        // already closed
      }
    },
  };
}

const seller = new Client("10.10.0.11");
const buyer = new Client("10.10.0.12");
const moderator = new Client("10.10.0.13");
const admin = new Client("10.10.0.14");
const anonymous = new Client("10.10.0.15");

const sellerEmail = `seller-${RUN}@example.dz`;
const buyerEmail = `buyer-${RUN}@example.dz`;
const moderatorEmail = `mod-${RUN}@example.dz`;
const strongPassword = "MotDePasse123";

let listing1Id = "";
let listing1ImageId = "";
let moderatorId = "";

const listingPayload = {
  title: "Ordinateur portable Lenovo IdeaPad",
  description:
    "PC portable en très bon état, 16 Go de RAM, SSD 512 Go, chargeur et housse inclus. Alger centre.",
  categoryId: 13,
  wilayaId: 16,
  priceDa: 145000,
  negotiable: true,
  condition: "LIKE_NEW",
  contactPhonePublic: true,
  contactWhatsapp: true,
};

describe("Azar Neɣ — intégration réelle", () => {
  it("répond sur /api/health avec une base joignable", async () => {
    const response = await anonymous.request<{ status: string }>("/api/health");
    expect(response.status).toBe(200);
    expect(response.data.status).toBe("ok");
  });

  it("sert les 69 wilayas et la hiérarchie de catégories", async () => {
    const response = await anonymous.request<{
      wilayas: { id: number; nameFr: string; nameAr: string }[];
      categories: { slug: string; children: unknown[] }[];
      maxImages: number;
    }>("/api/meta");
    expect(response.status).toBe(200);
    expect(response.data.wilayas).toHaveLength(69);
    expect(response.data.wilayas[15]?.nameFr).toBe("Alger");
    expect(response.data.wilayas[57]?.nameFr).toBe("El Meniaa");
    expect(response.data.wilayas[68]?.nameFr).toBe("El Aricha");
    expect(response.data.categories.length).toBeGreaterThanOrEqual(10);
    expect(response.data.maxImages).toBe(6);
  });

  it("inscrit un vendeur, un acheteur et un modérateur", async () => {
    const reg = await seller.request<{ user: { id: string; role: string; csrfToken: string } }>(
      "/api/auth/register",
      {
        method: "POST",
        body: {
          email: sellerEmail,
          password: strongPassword,
          displayName: "Yacine Test",
          phone: "0551 00 00 11",
          wilayaId: 16,
          phonePublic: true,
          whatsappPublic: true,
        },
      },
    );
    expect(reg.status).toBe(201);
    expect(reg.data.user.role).toBe("USER");
    expect(reg.data.user.csrfToken).toHaveLength(64);

    const buyerReg = await buyer.request("/api/auth/register", {
      method: "POST",
      body: {
        email: buyerEmail,
        password: strongPassword,
        displayName: "Amina Acheteuse",
        phone: "0662000002",
        wilayaId: 31,
      },
    });
    expect(buyerReg.status).toBe(201);

    const modReg = await moderator.request<{ user: { id: string } }>("/api/auth/register", {
      method: "POST",
      body: {
        email: moderatorEmail,
        password: strongPassword,
        displayName: "Karim Modérateur",
        phone: "0770000003",
        wilayaId: 25,
      },
    });
    expect(modReg.status).toBe(201);
    moderatorId = modReg.data.user.id;
  });

  it("refuse un e-mail déjà utilisé et un mauvais mot de passe", async () => {
    const duplicate = await anonymous.request("/api/auth/register", {
      method: "POST",
      body: {
        email: sellerEmail,
        password: strongPassword,
        displayName: "Doublon",
        phone: "0551000099",
        wilayaId: 16,
      },
    });
    expect(duplicate.status).toBe(409);

    const wrong = await new Client("10.10.0.90").request("/api/auth/login", {
      method: "POST",
      body: { email: sellerEmail, password: "WrongPassword999" },
    });
    expect(wrong.status).toBe(401);
  });

  it("connecte le vendeur et expose /me avec un jeton CSRF", async () => {
    const login = await seller.request<{ user: { email: string; csrfToken: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        body: { email: sellerEmail, password: strongPassword },
      },
    );
    expect(login.status).toBe(200);
    expect(login.data.user.email).toBe(sellerEmail);

    const me = await seller.request<{ user: { email: string } | null }>("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.data.user?.email).toBe(sellerEmail);
  });

  it("connecte l'administrateur issu du bootstrap et promeut le modérateur", async () => {
    const login = await admin.request<{ user: { role: string } }>("/api/auth/login", {
      method: "POST",
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(login.data.user.role).toBe("ADMIN");

    const promote = await admin.request("/api/admin/users/" + moderatorId, {
      method: "PATCH",
      body: { role: "MODERATOR" },
    });
    expect(promote.status).toBe(200);

    const modLogin = await moderator.request<{ user: { role: string } }>("/api/auth/login", {
      method: "POST",
      body: { email: moderatorEmail, password: strongPassword },
    });
    expect(modLogin.status).toBe(200);
    expect(modLogin.data.user.role).toBe("MODERATOR");
  });

  it("applique les contrôles de rôle", async () => {
    const queue = await moderator.request("/api/moderation/queue");
    expect(queue.status).toBe(200);

    const buyerLogin = await buyer.request("/api/auth/login", {
      method: "POST",
      body: { email: buyerEmail, password: strongPassword },
    });
    expect(buyerLogin.status).toBe(200);

    const forbidden = await buyer.request("/api/moderation/queue");
    expect(forbidden.status).toBe(403);

    const adminDenied = await buyer.request("/api/admin/stats");
    expect(adminDenied.status).toBe(403);
  });

  it("refuse une mutation sans jeton CSRF", async () => {
    const noCsrf = await seller.request("/api/listings", {
      method: "POST",
      body: listingPayload,
      skipCsrf: true,
    });
    expect(noCsrf.status).toBe(403);
  });

  it("crée un brouillon privé", async () => {
    const created = await seller.request<{ listing: { id: string; status: string } }>(
      "/api/listings",
      {
        method: "POST",
        body: listingPayload,
      },
    );
    expect(created.status).toBe(201);
    expect(created.data.listing.status).toBe("DRAFT");
    listing1Id = created.data.listing.id;

    const anonDetail = await anonymous.request(`/api/listings/${listing1Id}`);
    expect(anonDetail.status).toBe(404);

    const buyerDetail = await buyer.request(`/api/listings/${listing1Id}`);
    expect(buyerDetail.status).toBe(404);

    const search = await anonymous.request<{ listings: { total: number } }>("/api/listings");
    expect(search.data.listings.total).toBe(0);
  });

  it("valide le contenu réel des images envoyées", async () => {
    const textAsPng = await seller.upload(Buffer.from("<html>not an image</html>"), "image/png");
    expect(textAsPng.status).toBe(422);

    const svg = await seller.upload(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      "image/svg+xml",
    );
    expect(svg.status).toBe(422);

    const mismatch = await seller.upload(PNG, "image/jpeg");
    expect(mismatch.status).toBe(422);

    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const tooLarge = await seller.upload(big, "image/png");
    expect(tooLarge.status).toBe(413);
  });

  it("envoie une image dans R2 et la garde privée avant publication", async () => {
    const upload = await seller.upload(PNG);
    expect(upload.status).toBe(201);
    listing1ImageId = upload.data.image.id;
    expect(upload.data.image.url).toBe(`/api/images/${listing1ImageId}`);

    const anon = await anonymous.request(`/api/images/${listing1ImageId}`);
    expect(anon.status).toBe(404);
  });

  it("attache l'image, soumet et masque l'annonce au public", async () => {
    const update = await seller.request<{ listing: { images: unknown[] } }>(
      `/api/listings/${listing1Id}`,
      {
        method: "PATCH",
        body: { ...listingPayload, imageIds: [listing1ImageId] },
      },
    );
    expect(update.status).toBe(200);
    expect(update.data.listing.images).toHaveLength(1);

    const submit = await seller.request<{ listing: { status: string } }>(
      `/api/listings/${listing1Id}/submit`,
      { method: "POST" },
    );
    expect(submit.status).toBe(200);
    expect(submit.data.listing.status).toBe("PENDING");

    const anonDetail = await anonymous.request(`/api/listings/${listing1Id}`);
    expect(anonDetail.status).toBe(404);
  });

  it("refuse un refus sans motif puis conserve la décision", async () => {
    const queue = await moderator.request<{ listings: { items: { id: string }[]; total: number } }>(
      "/api/moderation/queue",
    );
    expect(queue.data.listings.total).toBeGreaterThanOrEqual(1);

    const noReason = await moderator.request(`/api/moderation/listings/${listing1Id}/decision`, {
      method: "POST",
      body: { action: "REJECT" },
    });
    expect(noReason.status).toBe(422);

    const rejected = await moderator.request<{ listing: { status: string } }>(
      `/api/moderation/listings/${listing1Id}/decision`,
      {
        method: "POST",
        body: { action: "REJECT", reason: "Photos trop floues pour vérifier l'état." },
      },
    );
    expect(rejected.status).toBe(200);
    expect(rejected.data.listing.status).toBe("REJECTED");

    const notifications = await seller.request<{ notifications: { items: { type: string }[] } }>(
      "/api/notifications",
    );
    expect(
      notifications.data.notifications.items.some((item) => item.type === "LISTING_REJECTED"),
    ).toBe(true);

    const search = await anonymous.request<{ listings: { total: number } }>("/api/listings");
    expect(search.data.listings.total).toBe(0);
  });

  it("permet de corriger, resoumettre puis approuver", async () => {
    const edit = await seller.request<{ listing: { status: string } }>(
      `/api/listings/${listing1Id}`,
      {
        method: "PATCH",
        body: { ...listingPayload, imageIds: [listing1ImageId] },
      },
    );
    expect(edit.status).toBe(200);
    expect(edit.data.listing.status).toBe("DRAFT");

    await seller.request(`/api/listings/${listing1Id}/submit`, { method: "POST" });
    const approved = await moderator.request<{ listing: { status: string } }>(
      `/api/moderation/listings/${listing1Id}/decision`,
      { method: "POST", body: { action: "APPROVE" } },
    );
    expect(approved.status).toBe(200);
    expect(approved.data.listing.status).toBe("APPROVED");

    const detail = await anonymous.request<{
      listing: { status: string; images: { url: string }[] };
    }>(`/api/listings/${listing1Id}`);
    expect(detail.status).toBe(200);
    expect(detail.data.listing.status).toBe("APPROVED");

    const image = await fetch(BASE + `/api/images/${listing1ImageId}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("cache-control")).toContain("immutable");

    const search = await anonymous.request<{
      listings: { total: number; items: { id: string }[] };
    }>("/api/listings?q=Lenovo");
    expect(search.data.listings.total).toBe(1);
    expect(search.data.listings.items[0]?.id).toBe(listing1Id);
  });

  it("gère les favoris de façon idempotente", async () => {
    const add = await buyer.request<{ favorited: boolean }>(`/api/favorites/${listing1Id}`, {
      method: "POST",
    });
    expect(add.status).toBe(200);
    expect(add.data.favorited).toBe(true);

    const again = await buyer.request(`/api/favorites/${listing1Id}`, { method: "POST" });
    expect(again.status).toBe(200);

    const list = await buyer.request<{
      listings: { total: number; items: { isFavorite: boolean }[] };
    }>("/api/favorites");
    expect(list.data.listings.total).toBe(1);
    expect(list.data.listings.items[0]?.isFavorite).toBe(true);

    const remove = await buyer.request(`/api/favorites/${listing1Id}`, { method: "DELETE" });
    expect(remove.status).toBe(200);
    const empty = await buyer.request<{ listings: { total: number } }>("/api/favorites");
    expect(empty.data.listings.total).toBe(0);
  });

  it("accepte un signalement unique et le traite", async () => {
    const ownReport = await seller.request(`/api/listings/${listing1Id}/reports`, {
      method: "POST",
      body: { reason: "SPAM" },
    });
    expect(ownReport.status).toBe(422);

    const report = await buyer.request<{ report: { id: string } }>(
      `/api/listings/${listing1Id}/reports`,
      {
        method: "POST",
        body: { reason: "FRAUD", details: "Prix suspect et photos copiées." },
      },
    );
    expect(report.status).toBe(201);

    const duplicate = await buyer.request(`/api/listings/${listing1Id}/reports`, {
      method: "POST",
      body: { reason: "FRAUD" },
    });
    expect(duplicate.status).toBe(409);

    const queue = await moderator.request<{ reports: { items: { id: string }[] } }>(
      "/api/moderation/reports",
    );
    expect(queue.data.reports.items.some((item) => item.id === report.data.report.id)).toBe(true);

    const resolved = await moderator.request(
      `/api/moderation/reports/${report.data.report.id}/resolve`,
      {
        method: "POST",
        body: { status: "REVIEWED" },
      },
    );
    expect(resolved.status).toBe(200);
  });

  it("révoque la session à la déconnexion", async () => {
    const noCsrf = await seller.request("/api/auth/logout", { method: "POST", skipCsrf: true });
    expect(noCsrf.status).toBe(403);

    const logout = await seller.request("/api/auth/logout", { method: "POST" });
    expect(logout.status).toBe(204);

    const me = await seller.request<{ user: unknown }>("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.data.user).toBeNull();

    const relogin = await seller.request("/api/auth/login", {
      method: "POST",
      body: { email: sellerEmail, password: strongPassword },
    });
    expect(relogin.status).toBe(200);
  });

  it("refuse une connexion WebSocket non authentifiée", async () => {
    const ws = new WebSocket(`${WS_BASE}/api/ws`);
    const error = await new Promise<Error>((resolve) => {
      ws.once("error", (err) => resolve(err as Error));
      ws.once("open", () => resolve(new Error("Connexion inattendue")));
    });
    expect(error.message).toMatch(/401/);
  });

  it("livre en temps réel la soumission au modérateur et la décision au vendeur", async () => {
    const modSocket = await openSocket(moderator);
    const sellerSocket = await openSocket(seller);

    const ready = await modSocket.waitFor((frame) => frame.type === "ready");
    expect(ready.type).toBe("ready");

    try {
      const created = await seller.request<{ listing: { id: string } }>("/api/listings", {
        method: "POST",
        body: { ...listingPayload, title: "Vélo de ville Peugeot — révisé" },
      });
      expect(created.status).toBe(201);
      const id = created.data.listing.id;

      const upload = await seller.upload(PNG);
      await seller.request(`/api/listings/${id}`, {
        method: "PATCH",
        body: {
          ...listingPayload,
          title: "Vélo de ville Peugeot — révisé",
          imageIds: [upload.data.image.id],
        },
      });
      await seller.request(`/api/listings/${id}/submit`, { method: "POST" });

      const submitted = await modSocket.waitFor(
        (frame) =>
          frame.type === "notification" && frame.notification?.type === "LISTING_SUBMITTED",
      );
      expect(submitted.notification?.title).toContain("modérer");

      const approved = await moderator.request(`/api/moderation/listings/${id}/decision`, {
        method: "POST",
        body: { action: "APPROVE" },
      });
      expect(approved.status).toBe(200);

      const approvedFrame = await sellerSocket.waitFor(
        (frame) => frame.type === "notification" && frame.notification?.type === "LISTING_APPROVED",
      );
      expect(approvedFrame.notification?.title).toBe("Votre annonce est en ligne");

      const notifications = await seller.request<{ notifications: { items: { type: string }[] } }>(
        "/api/notifications",
      );
      expect(
        notifications.data.notifications.items.some((item) => item.type === "LISTING_APPROVED"),
      ).toBe(true);
    } finally {
      modSocket.close();
      sellerSocket.close();
    }
  });

  it("expose des statistiques et un journal d'audit à l'administrateur", async () => {
    const stats = await admin.request<{
      stats: {
        users: { total: number };
        listings: Record<string, number>;
        reports: { open: number };
      };
    }>("/api/admin/stats");
    expect(stats.status).toBe(200);
    expect(stats.data.stats.users.total).toBeGreaterThanOrEqual(4);
    expect(stats.data.stats.listings.APPROVED).toBeGreaterThanOrEqual(2);

    const audit = await admin.request<{ entries: { items: { action: string }[] } }>(
      "/api/admin/audit",
    );
    expect(audit.status).toBe(200);
    expect(audit.data.entries.items.some((entry) => entry.action === "MODERATION_APPROVE")).toBe(
      true,
    );

    const categories = await admin.request<{ categories: unknown[] }>("/api/admin/categories");
    expect(categories.status).toBe(200);
    expect(categories.data.categories.length).toBe(24);
  });
});
