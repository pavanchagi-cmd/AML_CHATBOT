import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { getDocument } from "@/lib/documents";
import { reindexDocument, type IngestEvent } from "@/lib/ingest";
import { ndjsonResponse } from "@/lib/ndjson";

// Highest value allowed by the Vercel plan; see lib/limits.ts.
export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/documents/[id]/reindex">) {
  let doc;
  try {
    if (!isAdmin(req)) return unauthorized();
    const { id } = await ctx.params;
    doc = await getDocument(id);
  } catch (err) {
    return serverError(err);
  }
  if (!doc) return errorResponse(404, "not_found", "That document no longer exists.");
  if (doc.status === "processing") {
    return errorResponse(409, "busy", "This document is already being indexed.");
  }

  return ndjsonResponse<IngestEvent>(async (emit) => {
    try {
      await reindexDocument(doc, emit);
    } catch (err) {
      console.error("Re-index failed to start:", err instanceof Error ? err.message : err);
      emit({ type: "error", message: "Search is unavailable right now. Try again in a minute." });
    }
  });
}
