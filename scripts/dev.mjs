#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (!existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    `# Local development only. Never commit this file.\nSESSION_SECRET=${randomBytes(32).toString("hex")}\n`,
  );
  console.log("→ .dev.vars créé avec un secret local aléatoire.");
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const children = [];

function start(label, args, color) {
  const child = spawn(npx, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] terminé avec le code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  console.log(`\x1b[${color}m[${label}] démarré\x1b[0m`);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // already stopped
      }
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Azar Neɣ — développement local");
console.log("API  : http://127.0.0.1:8787");
console.log("Web  : http://localhost:5173\n");

start("api", ["wrangler", "dev", "--port", "8787", "--ip", "127.0.0.1"], "36");
start("web", ["vite", "--port", "5173"], "32");
