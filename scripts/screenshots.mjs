#!/usr/bin/env node
/**
 * Design reference captures for docs/screens/.
 *
 * Drives an already-installed Chromium browser (Edge/Chrome) in headless mode,
 * so nothing heavy is added to the dependency tree and no browser is downloaded.
 *
 *   npm run dev                    # terminal 1 (api + web)
 *   npm run screenshots            # terminal 2
 *
 * Options:
 *   --base=http://localhost:5173   dev server origin
 *   --only=web|mobile              capture a single family
 *   --path=/annonces               capture one extra path on both families
 *   --lang=ar                      capture the Arabic/RTL locale as well
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "docs", "screens");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

const base = (
  args.get("base") ??
  process.env.SCREENSHOT_BASE_URL ??
  "http://localhost:5173"
).replace(/\/$/, "");
const only = args.get("only") ?? null;
const extraPath = args.get("path") ?? null;
const rtl = args.get("lang") === "ar";

const PROFILES = {
  web: { width: 1440, height: 950, label: "web" },
  mobile: { width: 390, height: 844, label: "mobile" },
};

const PAGES = [
  { name: "accueil", path: "/" },
  { name: "recherche", path: "/annonces" },
  { name: "annonce", path: null }, // resolved from the API below
  { name: "connexion", path: "/connexion" },
];

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter(Boolean);

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

async function reachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveSampleListing() {
  try {
    const response = await fetch(`${base}/api/listings?perPage=1`);
    if (!response.ok) return null;
    const payload = await response.json();
    const id = payload?.listings?.items?.[0]?.id;
    return id ? `/annonces/${id}` : null;
  } catch {
    return null;
  }
}

function capture(browser, url, file, size) {
  const profile = path.join(
    tmpdir(),
    `azar-neg-shot-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const result = spawnSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${size.width},${size.height}`,
      `--user-data-dir=${profile}`,
      `--screenshot=${file}`,
      url,
    ],
    { stdio: "ignore", timeout: 60_000 },
  );
  rmSync(profile, { recursive: true, force: true });
  if (result.error) return { ok: false, reason: result.error.message };
  if (!existsSync(file))
    return { ok: false, reason: `no file written (exit ${result.status ?? "?"})` };
  const bytes = statSync(file).size;
  if (bytes < 2048) return { ok: false, reason: `suspiciously small capture (${bytes} bytes)` };
  return { ok: true, bytes };
}

function withLang(url) {
  return rtl ? `${url}${url.includes("?") ? "&" : "?"}lang=ar` : url;
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error("No Chrome/Edge binary found. Set CHROME_PATH to one and retry.");
    process.exitCode = 1;
    return;
  }

  if (!(await reachable(`${base}/`))) {
    console.error(`Dev server not reachable at ${base}.`);
    console.error("Start it first:  npm run dev");
    process.exitCode = 1;
    return;
  }

  const pages = [...PAGES];
  const listingPath = pages.find((page) => page.name === "annonce");
  listingPath.path = extraPath ?? (await resolveSampleListing());
  if (!listingPath.path) {
    console.warn(
      "No published listing found — skipping the listing detail capture (run npm run demo:seed).",
    );
  }

  mkdirSync(outDir, { recursive: true });
  const families = Object.values(PROFILES).filter((profile) => !only || profile.label === only);
  let failures = 0;

  for (const profile of families) {
    for (const page of pages) {
      if (!page.path) continue;
      const suffix = rtl ? "-ar" : "";
      const file = path.join(outDir, `${profile.label}-${page.name}${suffix}.png`);
      const outcome = capture(browser, withLang(`${base}${page.path}`), file, profile);
      if (outcome.ok) {
        console.log(
          `✓ ${path.relative(root, file).replace(/\\/g, "/")} (${Math.round(outcome.bytes / 1024)} KB)`,
        );
      } else {
        failures += 1;
        console.error(`✗ ${profile.label}-${page.name}${suffix}: ${outcome.reason}`);
      }
    }
  }

  if (failures > 0) {
    console.error(`${failures} capture(s) failed.`);
    process.exitCode = 1;
  }
}

await main();
