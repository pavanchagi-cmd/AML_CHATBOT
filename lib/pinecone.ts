import { Pinecone, type RecordMetadata } from "@pinecone-database/pinecone";
import { config } from "@/lib/env";

// Metadata stored with each chunk vector (spec section 5). Pinecone metadata cannot hold null,
// so `page` is left out for formats without pages (DOCX, TXT, MD).
export type ChunkMetadata = {
  docId: string;
  docTitle: string;
  category: string;
  page?: number;
  section: string;
  chunkIndex: number;
  text: string;
};

export type ChunkVector = { id: string; values: number[]; metadata: ChunkMetadata };

export type ChunkMatch = { id: string; score: number; metadata: ChunkMetadata };

export const UPSERT_BATCH_SIZE = 100;
const DELETE_BATCH_SIZE = 1000;

// The SDK retries failed requests itself (maxRetries, default 3).
let client: Pinecone | undefined;
export function pinecone() {
  return (client ??= new Pinecone({ apiKey: config.pineconeApiKey() }));
}

function index() {
  return pinecone().index<ChunkMetadata & RecordMetadata>({
    name: config.pineconeIndex(),
    namespace: config.pineconeNamespace(),
  });
}

// `{docId}#{chunkIndex}`, zero-padded, so every vector of a document shares the `{docId}#` prefix.
export function vectorId(docId: string, chunkIndex: number) {
  return `${docId}#${String(chunkIndex).padStart(4, "0")}`;
}

export function docIdPrefix(docId: string) {
  return `${docId}#`;
}

export async function upsertChunks(vectors: ChunkVector[], onProgress?: (done: number, total: number) => void) {
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    await index().upsert({
      records: batch.map((v) => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata as ChunkMetadata & RecordMetadata,
      })),
    });
    onProgress?.(Math.min(i + batch.length, vectors.length), vectors.length);
  }
}

export async function queryChunks(vector: number[], opts: { topK: number; category?: string }): Promise<ChunkMatch[]> {
  const res = await index().query({
    vector,
    topK: opts.topK,
    includeMetadata: true,
    ...(opts.category ? { filter: { category: { $eq: opts.category } } } : {}),
  });
  return (res.matches ?? [])
    .filter((m) => m.metadata && typeof m.score === "number")
    .map((m) => ({ id: m.id, score: m.score as number, metadata: m.metadata as ChunkMetadata }));
}

// Every vector id of a document, found by its id prefix.
export async function listDocVectorIds(docId: string): Promise<string[]> {
  const ids: string[] = [];
  let paginationToken: string | undefined;
  do {
    const page = await index().listPaginated({ prefix: docIdPrefix(docId), paginationToken });
    for (const v of page.vectors ?? []) if (v.id) ids.push(v.id);
    paginationToken = page.pagination?.next;
  } while (paginationToken);
  return ids;
}

export async function deleteDocVectors(docId: string): Promise<number> {
  const ids = await listDocVectorIds(docId);
  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    await index().deleteMany({ ids: ids.slice(i, i + DELETE_BATCH_SIZE) });
  }
  return ids.length;
}
