#!/usr/bin/env node
/**
 * Real integration run:
 *  1. fresh local D1 state (separate from `npm run dev`)
 *  2. apply all migrations + assert seed counts
 *  3. bootstrap an administrator through the documented CLI
 *  4. start `wrangler dev` on port 8788
 *  5. run vitest against the actual Worker (D1, R2, Durable Objects, WebSockets)
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const PERSIST = ".wrangler/test-state";
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const WRANGLER = "node_modules/wrangler/bin/wrangler.js";
const VITEST = "node_modules/vitest/vitest.mjs";

function run(args, env = {}) {
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function command(args) {
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let server = null;

function stopServer() {
  if (!server || server.killed) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
    } else {
      process.kill(-server.pid, "SIGTERM");
    }
  } catch {
    try {
      server.kill("SIGKILL");
    } catch {
      // already stopped
    }
  }
}

process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});

try {
  console.log("\n▶ Nettoyage de l'état de test local…");
  rmSync(PERSIST, { recursive: true, force: true });

  console.log("\n▶ Application des migrations D1 locales…");
  run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", PERSIST]);

  console.log("\n▶ Vérification des données de seed…");
  const seedOutput = command([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    PERSIST,
    "--json",
    "--command",
    "SELECT (SELECT COUNT(*) FROM wilayas) AS wilayas, (SELECT COUNT(*) FROM categories) AS categories;",
  ]);
  const parsed = JSON.parse(seedOutput.slice(seedOutput.indexOf("[")));
  const row = parsed[0]?.results?.[0];
  if (row?.wilayas !== 58) throw new Error(`Attendu 58 wilayas, obtenu ${row?.wilayas}`);
  if (row?.categories !== 24) throw new Error(`Attendu 24 catégories, obtenu ${row?.categories}`);
  console.log(`  ✔ ${row.wilayas} wilayas, ${row.categories} catégories`);

  console.log("\n▶ Création de l'administrateur de test…");
  execFileSync(
    process.execPath,
    [
      "scripts/bootstrap-admin.mjs",
      "--email=admin@test.dz",
      "--phone=0550001122",
      "--wilaya=16",
      "--name=Admin Test",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        BOOTSTRAP_ADMIN_PASSWORD: "AdminTest1234",
        WRANGLER_PERSIST_TO: PERSIST,
      },
    },
  );

  if (!existsSync(".dev.vars")) {
    throw new Error(
      ".dev.vars manquant : lancez `npm run dev` une fois ou créez-le depuis .dev.vars.example.",
    );
  }

  console.log(`\n▶ Démarrage du Worker sur ${BASE}…`);
  server = spawn(
    process.execPath,
    [
      WRANGLER,
      "dev",
      "--port",
      String(PORT),
      "--ip",
      "127.0.0.1",
      "--persist-to",
      PERSIST,
      "--var",
      "APP_ENV:test",
      "--var",
      `PUBLIC_ORIGIN:${BASE}`,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  server.stdout.on("data", (chunk) => process.stdout.write(`[worker] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[worker] ${chunk}`));

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // not up yet
    }
    await delay(500);
  }
  if (!ready) throw new Error("Le Worker n'a pas répondu sur /api/health dans les 90 secondes.");

  console.log("\n▶ Tests d'intégration…\n");
  execFileSync(process.execPath, [VITEST, "run", "--config", "vitest.integration.config.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      INTEGRATION_BASE_URL: BASE,
      INTEGRATION_ADMIN_EMAIL: "admin@test.dz",
      INTEGRATION_ADMIN_PASSWORD: "AdminTest1234",
    },
  });
} finally {
  stopServer();
}
