// Quick verification that the compliance+analytics migration landed cleanly.
// Reads DATABASE_URL from apps/web/.env.local and introspects information_schema.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envText = readFileSync(resolve(process.cwd(), "apps/web/.env.local"), "utf8");
const databaseUrl = envText.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  const expectedTenantCols = [
    "cost_per_ticket_cents",
    "data_region",
    "retention_days_conversations",
    "retention_days_leads",
    "retention_days_security_events",
    "ai_disclosure_mode",
    "ai_disclosure_text",
    "dpa_accepted_at",
    "dpa_accepted_version",
  ];

  const tenantCols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = ANY(${expectedTenantCols})
    ORDER BY column_name
  `;
  console.log("\ntenants — new columns:");
  for (const c of tenantCols) {
    console.log(
      `  ${c.column_name.padEnd(34)} ${c.data_type.padEnd(20)} ${c.is_nullable === "NO" ? "NOT NULL" : "NULL    "}  default=${c.column_default ?? "—"}`,
    );
  }
  const missing = expectedTenantCols.filter((n) => !tenantCols.find((c) => c.column_name === n));
  if (missing.length) console.log("  ⚠ missing:", missing.join(", "));

  const assistantCol = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'assistants' AND column_name = 'cookieless_mode'
  `;
  console.log("\nassistants — cookieless_mode:");
  console.log(assistantCol.length ? `  ${assistantCol[0].data_type} default=${assistantCol[0].column_default}` : "  ⚠ MISSING");

  const expectedTables = [
    "analytics_daily",
    "question_clusters",
    "clustered_questions",
    "sar_requests",
    "data_deletion_audit",
  ];
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${expectedTables})
    ORDER BY table_name
  `;
  console.log("\nNew tables:");
  for (const t of tables) console.log(`  ✔ ${t.table_name}`);
  const tablesMissing = expectedTables.filter((n) => !tables.find((t) => t.table_name === n));
  if (tablesMissing.length) console.log("  ⚠ missing:", tablesMissing.join(", "));

  const indexes = await sql`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY(${expectedTables})
    ORDER BY tablename, indexname
  `;
  console.log("\nIndexes on new tables:");
  for (const i of indexes) console.log(`  ${i.tablename.padEnd(22)} ${i.indexname}`);

  console.log("\nAll checks done.");
} finally {
  await sql.end({ timeout: 5 });
}
