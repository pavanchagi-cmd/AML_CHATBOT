import type { DocumentDto } from "@/lib/types";

// Pipeline stages, in order. Shared by the server (which emits them) and the progress bar.
export const STAGE_KEYS = ["uploading", "extracting", "chunking", "embedding", "indexing", "ready"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

// Streamed as NDJSON by /api/ingest and /api/documents/:id/reindex (spec section 8).
export type IngestEvent =
  | { stage: StageKey; message: string; done?: number; total?: number }
  | { type: "ready"; document: DocumentDto }
  | { type: "error"; message: string };
