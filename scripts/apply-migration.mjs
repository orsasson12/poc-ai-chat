// One-off migration runner. Reads DATABASE_URL from apps/web/.env.local and
// executes a single SQL file against Supabase using the same `postgres` driver
// the app uses. The SQL file must be self-wrapped in BEGIN/COMMIT — this
// script does NOT add a transaction of its own.
//
// Usage: node scripts/apply-migration.mjs supabase/migrations/0001_...sql

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envPath = resolve(process.cwd(), "apps/web/.env.local");
const envText = readFileSync(envPath, "utf8");
const match = envText.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in apps/web/.env.local");
  process.exit(1);
}
const databaseUrl = match[1].trim().replace(/^["']|["']$/g, "");

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-sql-file>");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), sqlFile);
const migrationSql = readFileSync(sqlPath, "utf8");

console.log(`\nApplying ${sqlFile}`);
console.log(`  bytes: ${migrationSql.length}`);
console.log(`  statements: approx. ${migrationSql.split(";").length - 1}\n`);

const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  // `simple: true` puts the driver into the Postgres simple query protocol,
  // which supports multi-statement SQL in one round trip. Required because
  // our migration file contains many statements.
});

try {
  await sql.unsafe(migrationSql).simple();
  console.log("✔ Migration applied successfully.");
} catch (err) {
  console.error("✘ Migration failed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
