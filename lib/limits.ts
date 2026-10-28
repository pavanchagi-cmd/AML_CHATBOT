// Keep in sync with `export const maxDuration` in the ingest and reindex routes
// (Next.js needs that value written as a literal in each route file).
export const INGEST_MAX_DURATION_S = 300;

// A "processing" row older than this can no longer finish: its function has been stopped.
export const STALE_PROCESSING_MS = (INGEST_MAX_DURATION_S + 120) * 1000;
