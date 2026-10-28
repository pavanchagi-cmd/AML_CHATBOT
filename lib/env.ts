// Server-side configuration. Read lazily so a missing key fails the request that needs it,
// with a message that names the variable, instead of failing the whole build.

export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(
      `Missing environment variable ${variable}. Add it in Vercel (Settings → Environment Variables) or .env.local.`,
    );
    this.name = "MissingEnvError";
  }
}

function read(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = read(name);
  if (!v) throw new MissingEnvError(name);
  return v;
}

function numberEnv(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
  return n;
}

export const config = {
  geminiApiKey: () => requireEnv("GEMINI_API_KEY"),
  geminiChatModel: () => requireEnv("GEMINI_CHAT_MODEL"),
  geminiEmbedModel: () => read("GEMINI_EMBED_MODEL") ?? "gemini-embedding-001",
  embedDim: () => numberEnv("EMBED_DIM", 768),
  pineconeApiKey: () => requireEnv("PINECONE_API_KEY"),
  pineconeIndex: () => read("PINECONE_INDEX") ?? "aml-compass",
  pineconeNamespace: () => read("PINECONE_NAMESPACE") ?? "default",
  databaseUrl: () => requireEnv("DATABASE_URL"),
  adminPasscode: () => requireEnv("ADMIN_PASSCODE"),
  ragTopK: () => numberEnv("RAG_TOP_K", 8),
  ragMinScore: () => numberEnv("RAG_MIN_SCORE", 0.55),
};
