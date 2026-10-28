import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { BUSY_MESSAGE, SEARCH_UNAVAILABLE_MESSAGE, type ChatEvent } from "@/lib/chat-events";
import { stripInvalidCitations } from "@/lib/citations";
import { MissingEnvError } from "@/lib/env";
import { generateStream } from "@/lib/gemini";
import { ndjsonResponse } from "@/lib/ndjson";
import { logQuestion } from "@/lib/questions";
import { buildPrompt, isNotFound, mightBeNotFound, retrieve, SYSTEM_INSTRUCTION } from "@/lib/rag";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { httpStatusOf } from "@/lib/retry";

export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(2).max(1000),
  scope: z.union([z.literal("all"), z.enum(CATEGORIES)]),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
    .max(6)
    .default([]),
});

const NOT_SET_UP = "The app isn't fully set up yet. An admin can run the Setup check in the Library to see what's missing.";

function describe(err: unknown, fallback: string) {
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof MissingEnvError) return NOT_SET_UP;
  if (httpStatusOf(err) === 429) return BUSY_MESSAGE;
  return fallback;
}

export async function POST(req: Request) {
  if (rateLimited(`chat:${clientIp(req)}`)) {
    return errorResponse(429, "rate_limited", "You're asking questions very quickly. Wait a minute and try again.");
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(400, "bad_request", "Questions must be between 2 and 1,000 characters.");
  }
  const { question, scope, history } = parsed.data;

  return ndjsonResponse<ChatEvent>(async (emit) => {
    const started = Date.now();
    const questionId = crypto.randomUUID();

    // Search problems are reported as errors, never logged as a false "not found".
    let retrieval;
    try {
      retrieval = await retrieve(question, scope);
    } catch (err) {
      emit({ type: "error", message: describe(err, SEARCH_UNAVAILABLE_MESSAGE) });
      return;
    }
    const { sources, topScore, sourceIds } = retrieval;

    const log = async (answered: boolean, answer: string | null) => {
      try {
        await logQuestion({
          id: questionId,
          question,
          categoryScope: scope,
          answered,
          topScore,
          topSection: answered ? sources[0].section : null,
          sourceIds: answered ? sourceIds : [],
          answer,
          latencyMs: Date.now() - started,
        });
        return questionId;
      } catch (err) {
        console.error("Could not log question:", err instanceof Error ? err.message : err);
        return undefined;
      }
    };

    // Nothing relevant: the model is not called.
    if (sources.length === 0) {
      emit({ type: "notfound", questionId: await log(false, null) });
      return;
    }

    emit({ type: "sources", sources });

    let text = "";
    let sent = 0;
    try {
      for await (const delta of generateStream(buildPrompt(sources, history, question), SYSTEM_INSTRUCTION)) {
        text += delta;
        if (mightBeNotFound(text)) continue;
        emit({ type: "delta", text: text.slice(sent) });
        sent = text.length;
      }
    } catch (err) {
      emit({ type: "error", message: describe(err, BUSY_MESSAGE) });
      return;
    }

    if (isNotFound(text)) {
      emit({ type: "notfound", questionId: await log(false, null) });
      return;
    }
    const answer = stripInvalidCitations(text, sources.length).trim();
    emit({ type: "done", questionId: await log(true, answer) });
  });
}
