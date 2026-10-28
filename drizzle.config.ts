import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same .env files as Next.js (.env.local etc.).
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
