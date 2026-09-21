import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A module-level singleton pool, reused across hot reloads in dev so we
// don't exhaust Postgres connections.
declare global {
  // eslint-disable-next-line no-var
  var __herdbookPool: Pool | undefined;
}

const pool =
  global.__herdbookPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.__herdbookPool = pool;
}

export const db = drizzle(pool, { schema });
export * as schema from "./schema";
