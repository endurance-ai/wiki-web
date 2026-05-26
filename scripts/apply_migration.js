#!/usr/bin/env node
/**
 * Apply a raw SQL migration file from database/migrations/ to the wiki schema.
 *
 * Usage:
 *   node scripts/apply_migration.js 003_propagate_instagram_handles.sql
 *   node scripts/apply_migration.js database/migrations/004_brand_instagram_posts.sql
 *
 * Reads DATABASE_URL from .env.local. Files are expected to wrap their own
 * BEGIN;/COMMIT; (matching the app's migration convention), so this runner just
 * sends the file as a single multi-statement query.
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// ── .env.local loader (same shape as the other scripts) ──────────────
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim().replace(/^"|"$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/apply_migration.js <migration-file.sql>");
    process.exit(1);
  }
  const file = arg.includes("/")
    ? path.resolve(arg)
    : path.join(__dirname, "..", "database", "migrations", arg);
  if (!fs.existsSync(file)) {
    console.error(`Migration not found: ${file}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(file, "utf-8");

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("Missing DATABASE_URL (.env.local)");
    process.exit(1);
  }
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("schema");

  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    options: "-c search_path=wiki,public",
  });

  await client.connect();
  console.log(`[apply] ${path.basename(file)}`);
  try {
    await client.query(sql);
    console.log("[ok] migration applied");
  } catch (e) {
    console.error("[fail]", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
