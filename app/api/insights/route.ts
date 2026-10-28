import { z } from "zod";
import { errorResponse, serverError } from "@/lib/api";
import { getInsights } from "@/lib/insights";

const Query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

// Reading req.url keeps this handler request-time (never prerendered at build).
export async function GET(req: Request) {
  const parsed = Query.safeParse({ days: new URL(req.url).searchParams.get("days") ?? undefined });
  if (!parsed.success) return errorResponse(400, "bad_request", "Choose a range between 1 and 365 days.");
  try {
    const data = await getInsights(parsed.data.days);
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
