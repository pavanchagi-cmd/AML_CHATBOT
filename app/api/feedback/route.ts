import { z } from "zod";
import { errorResponse, serverError } from "@/lib/api";
import { setFeedback } from "@/lib/questions";

const Body = z.object({
  questionId: z.string().uuid(),
  rating: z.enum(["up", "down"]).nullable(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "bad_request", "The feedback couldn't be read.");
  try {
    const found = await setFeedback(parsed.data.questionId, parsed.data.rating);
    if (!found) return errorResponse(404, "not_found", "That answer is no longer in the log.");
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
