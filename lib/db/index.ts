import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "@/lib/env";
import * as schema from "@/lib/db/schema";

function createDb() {
  return drizzle({ client: neon(config.databaseUrl()), schema });
}

let instance: ReturnType<typeof createDb> | undefined;

// Neon over HTTP: no connection pool to manage in serverless functions.
export function db() {
  return (instance ??= createDb());
}

export { schema };
