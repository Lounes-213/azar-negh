#!/usr/bin/env node
/**
 * Secure first-administrator bootstrap.
 *
 * Creates (or promotes) an administrator with a password you supply. There is
 * no default password anywhere in this repository. The password only exists in
 * this process, is hashed with the same PBKDF2 parameters as the Worker, and is
 * never written to disk or to the shell history.
 *
 * Usage:
 *   npm run admin:bootstrap -- --email=admin@example.dz --phone="0550 00 00 00" --wilaya=16 --name="Admin"
 *   npm run admin:bootstrap -- --remote --email=... (after `wrangler login`)
 */
import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const remote = hasFlag("remote");
const email = (getArg("email") ?? "").trim().toLowerCase();
const name = getArg("name") ?? "Administrateur";
const wilaya = Number(getArg("wilaya") ?? "16");
const rawPhone = getArg("phone") ?? "";

function normalizePhone(raw) {
  const digits = raw.replace(/[\s().-]/g, "");
  const match = digits.match(/^(?:\+213|00213|0)([567]\d{8})$/);
  return match ? `+213${match[1]}` : null;
}

const phone = normalizePhone(rawPhone);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("--email est requis et doit être valide.");
if (!phone) fail('--phone est requis (mobile algérien, ex. "0551 23 45 67").');
if (!Number.isInteger(wilaya) || wilaya < 1 || wilaya > 58)
  fail("--wilaya doit être un numéro de 1 à 58.");

async function readPassword() {
  const fromEnv = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  const fromArg = getArg("password");
  if (fromArg) {
    console.warn(
      "⚠ --password est visible dans l'historique du shell. Préférez la saisie interactive.",
    );
    return fromArg;
  }
  if (!process.stdin.isTTY)
    fail("Mot de passe requis via BOOTSTRAP_ADMIN_PASSWORD ou en mode interactif.");

  process.stdout.write("Mot de passe administrateur (saisie masquée) : ");
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
      if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(1);
      }
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
  fail("Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.");
}

const iterations = 600_000;
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const b64url = (buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const passwordHash = `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(derived)}`;

const id = randomUUID();
const sqlEscape = (value) => value.replace(/'/g, "''");
const sql = `
PRAGMA foreign_keys = ON;
INSERT INTO users (id, email, password_hash, password_algo, role, status, created_at, updated_at)
VALUES ('${id}', '${sqlEscape(email)}', '${passwordHash}', 'pbkdf2-sha256', 'ADMIN', 'ACTIVE',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT (email) DO UPDATE SET
  password_hash = excluded.password_hash,
  role = 'ADMIN',
  status = 'ACTIVE',
  updated_at = excluded.updated_at;

INSERT INTO seller_profiles
  (user_id, display_name, phone, phone_public, whatsapp_public, wilaya_id, onboarded_at, created_at, updated_at)
SELECT id, '${sqlEscape(name)}', '${phone}', 0, 0, ${wilaya},
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE email = '${sqlEscape(email)}'
ON CONFLICT (user_id) DO UPDATE SET
  display_name = excluded.display_name,
  phone = excluded.phone,
  wilaya_id = excluded.wilaya_id,
  updated_at = excluded.updated_at;

INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT '${randomUUID()}', id, 'ADMIN_BOOTSTRAP', 'user', id,
       json_object('method', 'cli'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE email = '${sqlEscape(email)}';
`;

const dir = mkdtempSync(join(tmpdir(), "azar-neg-bootstrap-"));
const file = join(dir, "bootstrap.sql");
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
if (process.env.WRANGLER_PERSIST_TO) {
  wranglerArgs.push("--persist-to", process.env.WRANGLER_PERSIST_TO);
}
try {
  console.log(
    `\n→ ${remote ? "Production" : "Local"} : création/promotion de l'administrateur ${email}\n`,
  );
  if (!existsSync(join(process.cwd(), "wrangler.jsonc"))) {
    fail("Exécutez cette commande depuis la racine du projet.");
  }
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
  console.log(
    `\n✔ Administrateur prêt : ${email}. Aucun mot de passe n'a été enregistré sur disque.\n`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
