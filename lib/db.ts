import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

type DB = PostgresJsDatabase<typeof schema>;

// Reuse one client across hot reloads and warm serverless invocations.
const g = globalThis as unknown as { __db?: DB };

function connect(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps it compatible with Neon's pooled (PgBouncer) endpoint.
  // The local PGlite server accepts one connection, so .env.local sets DB_POOL_MAX=1.
  const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX) || 5 });
  return drizzle(client, { schema });
}

export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    g.__db ??= connect();
    return Reflect.get(g.__db, prop);
  },
});
