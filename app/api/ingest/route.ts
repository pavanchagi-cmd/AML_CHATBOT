import { z } from "zod";
import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { isBlobStoreUrl } from "@/lib/blob";
import { CATEGORIES } from "@/lib/categories";
import { db, schema } from "@/lib/db";
import { newDocumentId } from "@/lib/documents";
import { UNSUPPORTED_FILE_MESSAGE, fileKind, titleFromFileName } from "@/lib/files";
import { runIngestion, type IngestEvent } from "@/lib/ingest";
import { ndjsonResponse } from "@/lib/ndjson";

// Highest value allowed by the Vercel plan; see lib/limits.ts.
export const maxDuration = 300;

const Body = z.object({
  blobUrl: z.string().url().refine(isBlobStoreUrl, "Not a Vercel Blob URL."),
  fileName: z.string().trim().min(1).max(255),
  category: z.enum(CATEGORIES),
});

export async function POST(req: Request) {
  try {
    if (!isAdmin(req)) return unauthorized();
  } catch (err) {
    return serverError(err);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "bad_request", "The upload details are missing or invalid.");
  const { blobUrl, fileName, category } = parsed.data;
  if (!fileKind(fileName)) return errorResponse(400, "unsupported_file", UNSUPPORTED_FILE_MESSAGE);

  return ndjsonResponse<IngestEvent>(async (emit) => {
    let doc;
    try {
      // Size and type are filled in once the file is downloaded.
      [doc] = await db()
        .insert(schema.documents)
        .values({
          id: newDocumentId(),
          title: titleFromFileName(fileName),
          category,
          fileName,
          blobUrl,
          mimeType: "",
          sizeBytes: 0,
          status: "processing",
        })
        .returning();
    } catch (err) {
      console.error("Could not create document row:", err instanceof Error ? err.message : err);
      emit({ type: "error", message: "The library database is unavailable right now. Try again in a minute." });
      return;
    }
    await runIngestion(doc, emit);
  });
}
