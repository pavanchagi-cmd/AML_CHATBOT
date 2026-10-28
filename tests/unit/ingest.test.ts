import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import type { IngestEvent } from "@/lib/ingest-events";
import type { ChunkVector } from "@/lib/pinecone";

// Real Postgres (PGlite, in memory) with the real migration; Blob, Gemini and Pinecone are stand-ins.
const pg = new PGlite();
const testDb = drizzle({ client: pg, schema });

const fake = vi.hoisted(() => ({
  files: new Map<string, { data: Uint8Array; contentType: string }>(),
  vectors: new Map<string, unknown>(),
  embedFails: false,
}));

vi.mock("@/lib/db", () => ({ db: () => testDb, schema }));

vi.mock("@/lib/blob", () => ({
  downloadBlob: async (url: string) => {
    const f = fake.files.get(url);
    if (!f) throw new Error("not found");
    return f;
  },
}));

vi.mock("@/lib/gemini", () => ({
  embed: async (texts: string[], _task: string, opts: { onProgress?: (d: number, t: number) => void }) => {
    if (fake.embedFails) throw Object.assign(new Error("quota"), { status: 429 });
    opts.onProgress?.(texts.length, texts.length);
    return texts.map(() => [1, 0, 0]);
  },
}));

vi.mock("@/lib/pinecone", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/pinecone")>();
  return {
    vectorId: real.vectorId,
    upsertChunks: async (vectors: ChunkVector[], onProgress?: (d: number, t: number) => void) => {
      for (const v of vectors) fake.vectors.set(v.id, v);
      onProgress?.(vectors.length, vectors.length);
    },
    deleteDocVectors: async (docId: string) => {
      for (const id of [...fake.vectors.keys()]) if (id.startsWith(`${docId}#`)) fake.vectors.delete(id);
    },
  };
});

const { runIngestion, reindexDocument } = await import("@/lib/ingest");
const { expireStaleDocuments, TIMED_OUT_MESSAGE } = await import("@/lib/documents");

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures", name)));

async function addDocument(id: string, fileName: string, data: Uint8Array, contentType: string) {
  const blobUrl = `https://store.private.blob.vercel-storage.com/documents/${fileName}`;
  fake.files.set(blobUrl, { data, contentType });
  const [doc] = await testDb
    .insert(schema.documents)
    .values({
      id,
      title: fileName.replace(/\.\w+$/, ""),
      category: "Internal SOP",
      fileName,
      blobUrl,
      mimeType: "",
      sizeBytes: 0,
    })
    .returning();
  return doc;
}

async function run(doc: schema.DocumentRecord, fn = runIngestion) {
  const events: IngestEvent[] = [];
  const result = await fn(doc, (e) => events.push(e));
  const [row] = await testDb.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
  return { result, events, row };
}

beforeAll(async () => {
  const sql = readFileSync(path.join(__dirname, "../../drizzle/0000_init.sql"), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) await pg.exec(statement);
});

beforeEach(() => {
  fake.vectors.clear();
  fake.embedFails = false;
});

describe("runIngestion", () => {
  it("indexes a PDF and marks the document ready with page and chunk counts", async () => {
    const doc = await addDocument("d_pdf", "pattern-sop.pdf", fixture("pattern-sop.pdf"), "application/pdf");
    const { result, events, row } = await run(doc);

    expect(result?.status).toBe("ready");
    expect(row).toMatchObject({ status: "ready", pageCount: 3, error: null, mimeType: "application/pdf" });
    expect(row.chunkCount).toBe(fake.vectors.size);
    expect(row.sizeBytes).toBeGreaterThan(0);

    const stages = events.flatMap((e) => ("stage" in e ? [e.stage] : []));
    expect([...new Set(stages)]).toEqual(["extracting", "chunking", "embedding", "indexing", "ready"]);
    expect(events.at(-1)).toMatchObject({ type: "ready", document: { id: "d_pdf", status: "ready", pageCount: 3 } });

    const mule = [...fake.vectors.values()].find(
      (v) => (v as ChunkVector).metadata.section === "5.1 Money mule account",
    ) as ChunkVector;
    expect(mule.id).toMatch(/^d_pdf#\d{4}$/);
    expect(mule.metadata).toMatchObject({ docId: "d_pdf", docTitle: "pattern-sop", category: "Internal SOP", page: 2 });
  });

  it("leaves out page numbers for a DOCX", async () => {
    const doc = await addDocument(
      "d_docx",
      "shell-companies.docx",
      fixture("shell-companies.docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const { row } = await run(doc);
    expect(row).toMatchObject({ status: "ready", pageCount: null, chunkCount: 2 });
    for (const v of fake.vectors.values()) expect("page" in (v as ChunkVector).metadata).toBe(false);
  });

  it("fails with the OCR message when a PDF has no text", async () => {
    const doc = await addDocument("d_blank", "scan.pdf", fixture("blank.pdf"), "application/pdf");
    const { result, events, row } = await run(doc);
    expect(result).toBeNull();
    expect(row).toMatchObject({ status: "failed", chunkCount: 0 });
    expect(row.error).toMatch(/scanned PDF, run it through OCR/);
    expect(events.at(-1)).toEqual({ type: "error", message: row.error });
  });

  it("rejects a file whose content type doesn't match its extension", async () => {
    const doc = await addDocument("d_fake", "report.pdf", new TextEncoder().encode("x".repeat(200)), "text/plain");
    const { row } = await run(doc);
    expect(row).toMatchObject({ status: "failed", error: "This file type isn't supported. Use PDF, DOCX, TXT or MD." });
  });

  it("removes partial vectors and explains a busy embedding service", async () => {
    const doc = await addDocument("d_busy", "busy.pdf", fixture("pattern-sop.pdf"), "application/pdf");
    fake.vectors.set("d_busy#0000", { stale: true });
    fake.embedFails = true;
    const { row } = await run(doc);
    expect(row).toMatchObject({
      status: "failed",
      error: "The embedding service is busy. Try again in a few minutes.",
    });
    expect([...fake.vectors.keys()].some((id) => id.startsWith("d_busy#"))).toBe(false);
  });
});

describe("reindexDocument", () => {
  it("replaces the old vectors and returns the document to ready", async () => {
    const doc = await addDocument("d_re", "pattern-sop-2.pdf", fixture("pattern-sop.pdf"), "application/pdf");
    await run(doc);
    const before = fake.vectors.size;
    fake.vectors.set("d_re#9999", { leftover: true });

    const [current] = await testDb.select().from(schema.documents).where(eq(schema.documents.id, "d_re"));
    const { row } = await run(current, reindexDocument);
    expect(row.status).toBe("ready");
    expect(fake.vectors.has("d_re#9999")).toBe(false);
    expect(fake.vectors.size).toBe(before);
    expect(row.chunkCount).toBe(before);
  });
});

describe("expireStaleDocuments", () => {
  it("fails documents stuck in processing past the time limit and removes their vectors", async () => {
    const stuck = await addDocument("d_stuck", "stuck.pdf", fixture("pattern-sop.pdf"), "application/pdf");
    const fresh = await addDocument("d_fresh", "fresh.pdf", fixture("pattern-sop.pdf"), "application/pdf");
    await pg.query("update documents set updated_at = now() - interval '1 hour' where id = $1", [stuck.id]);
    fake.vectors.set("d_stuck#0000", {});

    await expireStaleDocuments(10 * 60 * 1000);

    const rows = await testDb.select().from(schema.documents);
    expect(rows.find((r) => r.id === "d_stuck")).toMatchObject({ status: "failed", error: TIMED_OUT_MESSAGE });
    expect(rows.find((r) => r.id === fresh.id)?.status).toBe("processing");
    expect(fake.vectors.has("d_stuck#0000")).toBe(false);
  });
});
