import type { Source } from "@/lib/types";

// Streamed as NDJSON by POST /api/chat (spec section 7).
export type ChatEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "done"; questionId?: string }
  | { type: "notfound"; questionId?: string }
  | { type: "error"; message: string };

export const BUSY_MESSAGE = "The answer service is busy. Try again in a minute.";
export const SEARCH_UNAVAILABLE_MESSAGE = "Search is unavailable right now. Try again in a minute.";
