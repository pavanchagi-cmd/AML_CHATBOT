import { list } from "@vercel/blob";
import { blobCredentialsConfigured } from "@/lib/blob";
import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { config } from "@/lib/env";
import { ai, embed } from "@/lib/gemini";
import { isMissingTable } from "@/lib/db-errors";
import { pinecone } from "@/lib/pinecone";
import { inspectIndex } from "@/lib/pinecone-admin";
import { httpStatusOf } from "@/lib/retry";
import type { Check, SetupAction, SetupReport } from "@/lib/setup-check-types";

// Admin-only diagnostics: which settings are missing and whether each service answers.
// Secret values are never returned, only whether they are set.

// A problem the Setup check can fix with one click.
class FixableError extends Error {
  constructor(
    message: string,
    public readonly action: SetupAction,
  ) {
    super(message);
  }
}

export type { Check, SetupReport };

const REQUIRED = [
  ["GEMINI_API_KEY", "Gemini API key from Google AI Studio"],
  ["GEMINI_CHAT_MODEL", "Gemini model that writes the answers"],
  ["PINECONE_API_KEY", "Pinecone API key"],
  ["DATABASE_URL", "Added by the Neon Postgres integration (Storage tab)"],
  ["ADMIN_PASSCODE", "Passcode for upload, delete and re-index"],
] as const;

const isSet = (name: string) => Boolean(process.env[name]?.trim());

// Blob stores connect with OIDC (BLOB_STORE_ID) or, on older setups, BLOB_READ_WRITE_TOKEN.
function blobSetting(): Check {
  const name = "Vercel Blob (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN)";
  if (isSet("BLOB_STORE_ID")) return { name, status: "ok", detail: "Connected with OIDC (BLOB_STORE_ID is set)." };
  if (isSet("BLOB_READ_WRITE_TOKEN")) return { name, status: "ok", detail: "BLOB_READ_WRITE_TOKEN is set." };
  return {
    name,
    status: "missing",
    detail: "Not set. Connect a Blob store to this project in the Storage tab (all environments), then redeploy.",
  };
}

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
  return [...required, blobSetting(), ...optional];
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
  const missing = needs.filter((n) => (n === "BLOB" ? !blobCredentialsConfigured() : !isSet(n)));
  if (missing.length)
    return {
      name,
      status: "missing",
      detail: `Skipped: set ${missing.map((n) => (n === "BLOB" ? "up a Blob store connection" : n)).join(", ")} first.`,
    };
  try {
    return { name, status: "ok", detail: await withTimeout(fn()) };
  } catch (err) {
    if (err instanceof FixableError) return { name, status: "error", detail: err.message, action: err.action };
    return { name, status: "error", detail: explain(err) };
  }
}

async function checkDatabase() {
  try {
    const [row] = await db().select({ n: count() }).from(schema.documents);
    const [questions] = await db().select({ n: count() }).from(schema.questions);
    return `Connected. ${row.n} document(s), ${questions.n} logged question(s).`;
  } catch (err) {
    if (isMissingTable(err)) throw new FixableError("Connected, but the tables don't exist yet.", "migrate");
    throw err;
  }
}

async function checkPinecone() {
  const index = await inspectIndex();
  if (index.state === "missing") {
    throw new FixableError(`Key works, but there is no index named "${index.name}" yet.`, "create-index");
  }
  if (index.state === "wrong-shape") throw new Error(index.message);
  const stats = await pinecone()
    .index({ name: index.name, namespace: config.pineconeNamespace() })
    .describeIndexStats();
  const inNamespace = stats.namespaces?.[config.pineconeNamespace()]?.recordCount ?? 0;
  return `Index "${index.name}" is ready (${index.dimension} dimensions, cosine). ${inNamespace} passage(s) indexed.`;
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
    run("File storage (Vercel Blob)", ["BLOB"], checkBlob),
  ]);
  return { environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown", settings: settings(), services };
}
