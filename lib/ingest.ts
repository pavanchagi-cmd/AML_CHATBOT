import { eq } from "drizzle-orm";
import { downloadBlob } from "@/lib/blob";
import { chunkPages, CHUNK_OVERLAP, CHUNK_SIZE, embeddingText } from "@/lib/chunker";
import { db, schema } from "@/lib/db";
import type { DocumentRecord } from "@/lib/db/schema";
import { toDto } from "@/lib/documents";
import { MissingEnvError } from "@/lib/env";
import { extract, ExtractionError, NO_TEXT_MESSAGE } from "@/lib/extract";
import { contentTypeMatches, fileKind, UNSUPPORTED_FILE_MESSAGE } from "@/lib/files";
import { embed } from "@/lib/gemini";
import type { IngestEvent } from "@/lib/ingest-events";
import type { Emit } from "@/lib/ndjson";
import { deleteDocVectors, upsertChunks, vectorId } from "@/lib/pinecone";
import { httpStatusOf } from "@/lib/retry";

export type { IngestEvent };

class UserFacingError extends Error {}

function friendlyMessage(err: unknown): string {
  if (err instanceof ExtractionError || err instanceof UserFacingError) return err.message;
  if (err instanceof MissingEnvError)
    return "The app isn't fully set up yet. An admin can run the Setup check in the Library to see what's missing.";
  if (httpStatusOf(err) === 429) return "The embedding service is busy. Try again in a few minutes.";
  return "Indexing failed. Try again, and if it keeps failing, check the file opens normally.";
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

// Stages 2–6 for a document row that is already in "processing" with its blob stored.
// Ends with the row either "ready" with every vector, or "failed" with none.
export async function runIngestion(doc: DocumentRecord, emit: Emit<IngestEvent>): Promise<DocumentRecord | null> {
  const update = (values: Partial<typeof schema.documents.$inferInsert>) =>
    db().update(schema.documents).set(values).where(eq(schema.documents.id, doc.id)).returning();

  try {
    // 2. Extracting text
    emit({ stage: "extracting", message: "Pulling out the text and page numbers…" });
    const kind = fileKind(doc.fileName);
    if (!kind) throw new UserFacingError(UNSUPPORTED_FILE_MESSAGE);
    const { data, contentType } = await downloadBlob(doc.blobUrl);
    if (!contentTypeMatches(kind, contentType)) throw new UserFacingError(UNSUPPORTED_FILE_MESSAGE);
    await update({ sizeBytes: data.byteLength, mimeType: contentType });
    const { pages, pageCount } = await extract(data, doc.fileName);
    const chars = pages.reduce((n, p) => n + p.text.trim().length, 0);

    // 3. Chunking
    emit({
      stage: "chunking",
      message: `Splitting ${plural(chars, "character")} into ${CHUNK_SIZE}-character chunks with ${CHUNK_OVERLAP} overlap…`,
    });
    const chunks = await chunkPages(pages, doc.title);
    if (chunks.length === 0) throw new UserFacingError(NO_TEXT_MESSAGE);

    // 4. Embedding
    const total = chunks.length;
    emit({ stage: "embedding", message: `Embedding 0 of ${plural(total, "chunk")}`, done: 0, total });
    const vectors = await embed(chunks.map(embeddingText), "RETRIEVAL_DOCUMENT", {
      title: doc.title,
      onProgress: (done) =>
        emit({ stage: "embedding", message: `Embedding ${done} of ${plural(total, "chunk")}`, done, total }),
    });

    // 5. Indexing
    emit({ stage: "indexing", message: `Indexing 0 of ${plural(total, "chunk")}`, done: 0, total });
    await upsertChunks(
      chunks.map((c, i) => ({
        id: vectorId(doc.id, c.chunkIndex),
        values: vectors[i],
        metadata: {
          docId: doc.id,
          docTitle: doc.title,
          category: doc.category,
          ...(c.page !== null ? { page: c.page } : {}),
          section: c.section,
          chunkIndex: c.chunkIndex,
          text: c.text,
        },
      })),
      (done) => emit({ stage: "indexing", message: `Indexing ${done} of ${plural(total, "chunk")}`, done, total }),
    );

    // 6. Ready
    const [ready] = await update({ status: "ready", error: null, pageCount, chunkCount: total });
    const pagesNote = pageCount ? ` from ${plural(pageCount, "page")}` : "";
    emit({ stage: "ready", message: `Ready. ${plural(total, "chunk")}${pagesNote} can now be searched.` });
    emit({ type: "ready", document: toDto(ready) });
    return ready;
  } catch (err) {
    console.error(`Ingestion failed for ${doc.id}:`, err instanceof Error ? err.message : err);
    const message = friendlyMessage(err);
    try {
      await deleteDocVectors(doc.id);
    } catch (cleanupErr) {
      console.error(
        `Could not remove vectors of ${doc.id}:`,
        cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
      );
    }
    try {
      await update({ status: "failed", error: message, chunkCount: 0 });
    } catch (dbErr) {
      console.error(`Could not mark ${doc.id} failed:`, dbErr instanceof Error ? dbErr.message : dbErr);
    }
    emit({ type: "error", message });
    return null;
  }
}

// Re-index: remove the old vectors, then run stages 2–6 again from the stored file.
export async function reindexDocument(doc: DocumentRecord, emit: Emit<IngestEvent>) {
  await deleteDocVectors(doc.id);
  const [row] = await db()
    .update(schema.documents)
    .set({ status: "processing", error: null, chunkCount: 0 })
    .where(eq(schema.documents.id, doc.id))
    .returning();
  return runIngestion(row, emit);
}
