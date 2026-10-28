import { list } from "@vercel/blob";
import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { config } from "@/lib/env";
import { ai, embed } from "@/lib/gemini";
import { pinecone } from "@/lib/pinecone";
import { httpStatusOf } from "@/lib/retry";

// Admin-only diagnostics: which settings are missing and whether each service answers.
// Secret values are never returned, only whether they are set.

import type { Check, SetupReport } from "@/lib/setup-check-types";

export type { Check, SetupReport };

const REQUIRED = [
  ["GEMINI_API_KEY", "Gemini API key from Google AI Studio"],
  ["GEMINI_CHAT_MODEL", "Gemini model that writes the answers"],
  ["PINECONE_API_KEY", "Pinecone API key"],
  ["DATABASE_URL", "Added by the Neon Postgres integration (Storage tab)"],
  ["BLOB_READ_WRITE_TOKEN", "Added by the Vercel Blob integration (Storage tab)"],
  ["ADMIN_PASSCODE", "Passcode for upload, delete and re-index"],
] as const;

const isSet = (name: string) => Boolean(process.env[name]?.trim());

function settings(): Check[] {
  const required: Check[] = REQUIRED.map(([name, purpose]) =>
    isSet(name)
      ? { name, status: "ok", detail: name === "GEMINI_CHAT_MODEL" ? `Set to ${config.geminiChatModel()}` : "Set" }
      : { name, status: "missing", detail: `Not set. ${purpose}.` },
  );
  // Optional settings with defaults: show the value in use (none of these are secret).
  const optional: Check[] = [
    ["GEMINI_EMBED_MODEL", config.geminiEmbedModel()],
    ["EMBED_DIM", String(config.embedDim())],
    ["PINECONE_INDEX", config.pineconeIndex()],
    ["PINECONE_NAMESPACE", config.pineconeNamespace()],
    ["RAG_TOP_K", String(config.ragTopK())],
    ["RAG_MIN_SCORE", String(config.ragMinScore())],
  ].map(([name, value]) => ({ name, status: "ok", detail: `${isSet(name) ? "Set to" : "Default:"} ${value}` }));
  return [...required, ...optional];
}

function explain(err: unknown): string {
  const status = httpStatusOf(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403) return "The key was rejected. Check it is copied correctly and still active.";
  if (status === 429) return "Rate limit or quota reached. Try again later or check your plan.";
  if (/timed out/i.test(message)) return message;
  return `Failed: ${message.slice(0, 200)}`;
}

function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms / 1000} s.`)), ms)),
  ]);
}

async function run(name: string, needs: string[], fn: () => Promise<string>): Promise<Check> {
  const missing = needs.filter((n) => !isSet(n));
  if (missing.length) return { name, status: "missing", detail: `Skipped: set ${missing.join(", ")} first.` };
  try {
    return { name, status: "ok", detail: await withTimeout(fn()) };
  } catch (err) {
    return { name, status: "error", detail: explain(err) };
  }
}

async function checkDatabase() {
  try {
    const [row] = await db().select({ n: count() }).from(schema.documents);
    const [questions] = await db().select({ n: count() }).from(schema.questions);
    return `Connected. ${row.n} document(s), ${questions.n} logged question(s).`;
  } catch (err) {
    const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : "";
    if (/relation .* does not exist/i.test(text)) {
      throw new Error("Connected, but the tables don't exist yet. Run the database migrations (npm run db:migrate).");
    }
    throw err;
  }
}

async function checkPinecone() {
  const name = config.pineconeIndex();
  const indexes = (await pinecone().indexes.list()).indexes ?? [];
  if (!indexes.some((i) => i.name === name)) {
    throw new Error(`Key works, but there is no index named "${name}". Run npm run pinecone:create-index.`);
  }
  const model = await pinecone().indexes.describe(name);
  const field = model.schema.fields["_values"];
  if (!field || !("type" in field) || field.type !== "dense_vector") {
    throw new Error(`Index "${name}" is not a dense vector index.`);
  }
  if (field.dimension !== config.embedDim() || field.metric !== "cosine") {
    throw new Error(
      `Index "${name}" has dimension ${field.dimension} and metric ${field.metric}; it needs ${config.embedDim()} and cosine.`,
    );
  }
  const stats = await pinecone().index({ name, namespace: config.pineconeNamespace() }).describeIndexStats();
  const inNamespace = stats.namespaces?.[config.pineconeNamespace()]?.recordCount ?? 0;
  return `Index "${name}" is ready (${field.dimension} dimensions, cosine). ${inNamespace} passage(s) indexed.`;
}

async function checkEmbeddings() {
  const [vector] = await embed(["setup check"], "RETRIEVAL_QUERY", { retry: { attempts: 1 } });
  return `${config.geminiEmbedModel()} returned a ${vector.length}-dimension vector.`;
}

async function checkChatModel() {
  const model = await ai().models.get({ model: config.geminiChatModel() });
  return `Model ${config.geminiChatModel()} is available${model.displayName ? ` (${model.displayName})` : ""}.`;
}

async function checkBlob() {
  await list({ limit: 1 });
  return "Blob store reachable.";
}

export async function setupReport(): Promise<SetupReport> {
  const services = await Promise.all([
    run("Database (Neon Postgres)", ["DATABASE_URL"], checkDatabase),
    run("Vector index (Pinecone)", ["PINECONE_API_KEY"], checkPinecone),
    run("Embeddings (Gemini)", ["GEMINI_API_KEY"], checkEmbeddings),
    run("Answer model (Gemini)", ["GEMINI_API_KEY", "GEMINI_CHAT_MODEL"], checkChatModel),
    run("File storage (Vercel Blob)", ["BLOB_READ_WRITE_TOKEN"], checkBlob),
  ]);
  return { environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown", settings: settings(), services };
}
