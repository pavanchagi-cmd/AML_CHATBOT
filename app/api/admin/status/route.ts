import { serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { setupReport } from "@/lib/setup-check";

export const maxDuration = 30;

// Admin-only setup check. POST so the passcode travels in a header and nothing is cached.
export async function POST(req: Request) {
  try {
    if (!isAdmin(req)) return unauthorized();
    return Response.json(await setupReport(), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
