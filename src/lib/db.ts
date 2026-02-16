// Database connection: singleton to prevent hot-reload connection leaks in dev

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "./env";

const connectionString = requireEnv("DATABASE_URL");

// Singleton pattern for connection in dev (avoid hot-reload leaks)
const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const client = globalForDb.pgClient ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
