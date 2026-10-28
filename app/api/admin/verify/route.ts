import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { MissingEnvError } from "@/lib/env";

// Lets the Library check a passcode before using it for uploads, deletes and re-indexing.
export async function POST(req: Request) {
  try {
    return isAdmin(req) ? new Response(null, { status: 204 }) : unauthorized();
  } catch (err) {
    // Without ADMIN_PASSCODE nobody can sign in, so say exactly what to set.
    if (err instanceof MissingEnvError && err.variable === "ADMIN_PASSCODE") {
      return errorResponse(
        503,
        "admin_not_configured",
        "Admin sign-in isn't set up yet. Add ADMIN_PASSCODE in Vercel (Settings → Environment Variables), then redeploy.",
      );
    }
    return serverError(err);
  }
}
