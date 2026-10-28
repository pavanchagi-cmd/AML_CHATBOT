import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { DocumentRecord } from "@/lib/db/schema";
import { deleteDocVectors } from "@/lib/pinecone";
import type { DocumentDto } from "@/lib/types";

export type { DocumentDto };

export function toDto(d: DocumentRecord): DocumentDto {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    fileName: d.fileName,
    pageCount: d.pageCount,
    chunkCount: d.chunkCount,
    status: d.status,
    error: d.error,
    createdAt: d.createdAt.toISOString(),
  };
}

export function newDocumentId() {
  return `d_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function listDocuments() {
  return db().select().from(schema.documents).orderBy(desc(schema.documents.createdAt));
}

export async function getDocument(id: string) {
  const [row] = await db().select().from(schema.documents).where(eq(schema.documents.id, id));
  return row;
}

export const TIMED_OUT_MESSAGE =
  "Indexing didn't finish in time. Re-index it, or split the file and upload the parts separately.";

// A run that outlives the function time limit leaves its row in "processing". Once it is clearly
// past that limit, mark it failed and remove any vectors it wrote, so it is never half-indexed.
export async function expireStaleDocuments(olderThanMs: number) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db()
    .update(schema.documents)
    .set({ status: "failed", error: TIMED_OUT_MESSAGE, chunkCount: 0 })
    .where(and(eq(schema.documents.status, "processing"), lt(schema.documents.updatedAt, cutoff)))
    .returning({ id: schema.documents.id });
  for (const { id } of stale) {
    try {
      await deleteDocVectors(id);
    } catch (err) {
      console.error(`Could not remove vectors of timed-out document ${id}:`, err instanceof Error ? err.message : err);
    }
  }
}
