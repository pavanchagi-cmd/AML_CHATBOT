import { eq } from "drizzle-orm";
import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { deleteBlob } from "@/lib/blob";
import { db, schema } from "@/lib/db";
import { getDocument } from "@/lib/documents";
import { deleteDocVectors } from "@/lib/pinecone";

// Removes the document's vectors, its file and its row.
export async function DELETE(req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  try {
    if (!isAdmin(req)) return unauthorized();
    const { id } = await ctx.params;
    const doc = await getDocument(id);
    if (!doc) return errorResponse(404, "not_found", "That document no longer exists.");
    if (doc.status === "processing") {
      return errorResponse(409, "busy", "This document is still being indexed. Try again when it has finished.");
    }
    await deleteDocVectors(id);
    await deleteBlob(doc.blobUrl);
    await db().delete(schema.documents).where(eq(schema.documents.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
