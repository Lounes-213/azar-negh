#!/usr/bin/env node
/**
 * Admin-assisted account recovery (Cloudflare-only constraint: no e-mail
 * delivery is configured, so there is no self-service reset link).
 *
 * A user who lost their password contacts the operator, proves ownership out
 * of band, and the operator runs this command. All existing sessions are
 * revoked, which is recorded in the audit log.
 *
 * Usage:
 *   npm run admin:set-password -- --email=user@example.dz
 *   npm run admin:set-password -- --remote --email=...
 */
import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
};
const remote = args.includes("--remote");
const email = (getArg("email") ?? "").trim().toLowerCase();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("\n✖ --email est requis et doit être valide.\n");
  process.exit(1);
}

function readPassword() {
  const fromEnv = process.env.NEW_PASSWORD;
  if (fromEnv) return Promise.resolve(fromEnv);
  if (!process.stdin.isTTY) {
    console.error("\n✖ Mot de passe requis via NEW_PASSWORD ou en mode interactif.\n");
    process.exit(1);
  }
  process.stdout.write("Nouveau mot de passe (saisie masquée) : ");
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (char) => {
      if (char === "\r" || char === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u0003") process.exit(1);
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    process.stdin.on("data", onData);
  });
}

const password = await readPassword();
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error(
    "\n✖ Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.\n",
  );
  process.exit(1);
}

const iterations = 600_000;
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const b64url = (buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(derived)}`;
const escaped = email.replace(/'/g, "''");

const sql = `
PRAGMA foreign_keys = ON;
UPDATE users SET password_hash = '${hash}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE email = '${escaped}';
UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = '${escaped}');
INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT '${randomUUID()}', NULL, 'PASSWORD_RESET_CLI', 'user', id, json_object('method', 'cli'),
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE email = '${escaped}';
`;

const dir = mkdtempSync(join(tmpdir(), "azar-neg-password-"));
const file = join(dir, "reset.sql");
writeFileSync(file, sql, { mode: 0o600 });

const wranglerArgs = [
  "wrangler",
  "d1",
  "execute",
  "DB",
  remote ? "--remote" : "--local",
  "--file",
  file,
];
if (process.env.WRANGLER_PERSIST_TO)
  wranglerArgs.push("--persist-to", process.env.WRANGLER_PERSIST_TO);

try {
  console.log(`\n→ ${remote ? "Production" : "Local"} : réinitialisation de ${email}\n`);
  if (process.platform === "win32") {
    const command = ["npx", ...wranglerArgs]
      .map((part) => (/\s/.test(part) ? `"${part}"` : part))
      .join(" ");
    execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
      stdio: "inherit",
    });
  } else {
    execFileSync("npx", wranglerArgs, { stdio: "inherit" });
  }
  console.log("\n✔ Mot de passe réinitialisé, sessions révoquées et action auditée.\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
