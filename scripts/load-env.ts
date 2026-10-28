import { loadEnvConfig } from "@next/env";

// Scripts read the same .env files as Next.js (.env.local etc.).
loadEnvConfig(process.cwd());
