import path from "node:path";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { db } from "@/lib/db";

// Applies the SQL migrations in /drizzle that haven't run yet (same as `npm run db:migrate`).
// The folder is bundled with the admin setup route via outputFileTracingIncludes in next.config.ts.
export async function runMigrations() {
  await migrate(db(), { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
