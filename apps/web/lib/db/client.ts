import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env, hasDatabase } from "@/lib/env";

// Store on globalThis to survive Next.js hot reloads in dev mode.
// Without this, each reload opens new connections and exhausts the pool.
const globalForDb = globalThis as unknown as {
  _db?: ReturnType<typeof drizzle<typeof schema>>;
  _sql?: ReturnType<typeof postgres>;
};

export function getDb() {
  if (!hasDatabase()) return null;

  if (!globalForDb._db) {
    globalForDb._sql = postgres(env.databaseUrl.trim(), {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    globalForDb._db = drizzle(globalForDb._sql, { schema });
  }
  return globalForDb._db;
}
