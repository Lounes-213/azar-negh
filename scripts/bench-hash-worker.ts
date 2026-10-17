// Temporary benchmark worker — not part of the app. Used in Phase 1 to measure
// PBKDF2 cost inside the real workerd runtime.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const iterations = Number(url.searchParams.get("n") ?? "100000");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("benchmark-password"),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const start = performance.now();
    let error: string | null = null;
    try {
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: encoder.encode("azar-neg-benchmark-salt"),
          iterations,
        },
        key,
        256,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return Response.json({ iterations, ms: Math.round(performance.now() - start), error });
  },
};
