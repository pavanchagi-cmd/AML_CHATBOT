import { unauthorized, serverError } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

// Lets the Library check a passcode before using it for uploads, deletes and re-indexing.
export async function POST(req: Request) {
  try {
    return isAdmin(req) ? new Response(null, { status: 204 }) : unauthorized();
  } catch (err) {
    return serverError(err);
  }
}
