/**
 * Web Push & VAPID engine for Cloudflare Workers.
 * Native Web Crypto implementation with zero external dependencies.
 */

export const VAPID_PUBLIC_KEY =
  "BL0m-wGBzmrFB1xhmh0nfvZH8WYd4LH6hZblX9Cs9TiK9gBxcI3day8RXXxeDnZ5Eh3XFgnZhGnanSzvT3_evxg";

const VAPID_PRIVATE_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "vSb7AYHOasUHXGGaHSd-9kfxZh3gsfqFluVf0Kz1OIo",
  y: "9gBxcI3day8RXXxeDnZ5Eh3XFgnZhGnanSzvT3_evxg",
  d: "1XsgkTB-D6-cV8bqLe0WIKxWN2Pz_sjU-aMb5JZ-aGc",
};

let cachedCryptoKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  if (!cachedCryptoKey) {
    cachedCryptoKey = await crypto.subtle.importKey(
      "jwk",
      VAPID_PRIVATE_JWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return cachedCryptoKey;
}

function base64url(buf: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Creates VAPID Authorization headers for a specific push service endpoint.
 */
export async function createVapidHeaders(endpointUrl: string): Promise<Record<string, string>> {
  const parsed = new URL(endpointUrl);
  const audience = `${parsed.protocol}//${parsed.host}`;

  const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 43200, // 12 hours
      sub: "mailto:contact@azarnegh.com",
    }),
  );

  const key = await getSigningKey();
  const dataToSign = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    key,
    dataToSign,
  );

  const jwt = `${header}.${payload}.${base64url(signature)}`;

  return {
    Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    TTL: "86400",
  };
}

export interface PushNotificationPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
}

/**
 * Sends a background web push notification to a device endpoint.
 */
export async function sendWebPush(
  db: D1Database,
  subscription: { id?: string; endpoint: string },
  payload?: PushNotificationPayload,
): Promise<boolean> {
  try {
    const headers = await createVapidHeaders(subscription.endpoint);
    headers["Content-Type"] = "application/json";

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    // 404 or 410 means the subscription expired or the user uninstalled/revoked permission
    if (res.status === 404 || res.status === 410) {
      if (subscription.id) {
        await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run();
      } else {
        await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      }
      return false;
    }

    return res.status >= 200 && res.status < 300;
  } catch (err) {
    console.error("sendWebPush error:", err);
    return false;
  }
}

/**
 * Dispatches a push notification to all active devices registered by a user.
 */
export async function sendPushToUser(
  db: D1Database,
  userId: string,
  payload: PushNotificationPayload,
): Promise<void> {
  try {
    const subs = await db
      .prepare("SELECT id, endpoint FROM push_subscriptions WHERE user_id = ?")
      .bind(userId)
      .all<{ id: string; endpoint: string }>();

    for (const sub of subs.results || []) {
      await sendWebPush(db, sub, payload);
    }
  } catch (err) {
    console.error("sendPushToUser error:", err);
  }
}
