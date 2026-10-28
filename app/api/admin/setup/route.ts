import { z } from "zod";
import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { runMigrations } from "@/lib/migrate";
import { ensureIndex } from "@/lib/pinecone-admin";

// Creating a Pinecone index waits until it is ready, which can take a few minutes.
export const maxDuration = 300;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("migrate") }),
  z.object({
    action: z.literal("create-index"),
    cloud: z.string().trim().min(2).max(20),
    region: z.string().trim().min(2).max(40),
  }),
]);

// Admin-only one-time setup actions offered by the Setup check.
export async function POST(req: Request) {
  try {
    if (!isAdmin(req)) return unauthorized();
  } catch (err) {
    return serverError(err);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "bad_request", "Unknown setup action.");

  try {
    if (parsed.data.action === "migrate") {
      await runMigrations();
      return Response.json({ message: "Database tables are ready." });
    }
    const message = await ensureIndex(parsed.data.cloud, parsed.data.region);
    return Response.json({ message });
  } catch (err) {
    console.error("Setup action failed:", err instanceof Error ? err.message : err);
    const detail = err instanceof Error ? err.message.slice(0, 300) : "Unknown error";
    return errorResponse(500, "setup_failed", `That didn't work: ${detail}`);
  }
}
