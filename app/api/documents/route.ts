import { connection } from "next/server";
import { serverError } from "@/lib/api";
import { expireStaleDocuments, listDocuments, toDto } from "@/lib/documents";
import { STALE_PROCESSING_MS } from "@/lib/limits";

export async function GET() {
  await connection();
  try {
    await expireStaleDocuments(STALE_PROCESSING_MS);
    const docs = await listDocuments();
    return Response.json(docs.map(toDto), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
