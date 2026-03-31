import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env, hasSupabase } from "@/lib/env";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!hasSupabase()) return null;

  if (!db) {
    const connectionString = env.supabaseUrl;
    const client = postgres(connectionString);
    db = drizzle(client, { schema });
  }
  return db;
}
