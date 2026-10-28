// Passage sent to the client with each answer (spec section 7).
export type Source = {
  n: number;
  docId: string;
  docTitle: string;
  category: string;
  section: string;
  page: number | null;
  text: string;
  score: number;
};

export type Rating = "up" | "down";

export type UserMessage = { id: string; role: "user"; text: string };

export type BotMessage = {
  id: string;
  role: "bot";
  // The question this answers; its words are highlighted in the passages.
  question: string;
  // "Search in" scope used for the question, reused when rewriting from passages 1..n.
  scope?: string;
  status: "thinking" | "streaming" | "done" | "notfound" | "error";
  phase?: string;
  text: string;
  sources: Source[];
  questionId?: string;
  rating?: Rating | null;
  error?: string;
  // Source tab n rewrites the answer from passages 1..n. `upTo` is the version on screen
  // (undefined = the original answer); finished versions are kept so switching back is instant.
  original?: string;
  upTo?: number;
  versions?: Record<number, string>;
  rewriting?: number;
  rewriteError?: string;
};

export type ChatMessage = UserMessage | BotMessage;

export function where(s: Pick<Source, "section" | "page">) {
  return [s.section, s.page ? `page ${s.page}` : ""].filter(Boolean).join(", ");
}

export type DocumentStatus = "processing" | "ready" | "failed";

// A library document as the browser receives it (no file URL: files are private).
export type DocumentDto = {
  id: string;
  title: string;
  category: string;
  fileName: string;
  pageCount: number | null;
  chunkCount: number;
  status: DocumentStatus;
  error: string | null;
  createdAt: string;
};

// Shape of GET /api/insights (spec section 8).
export type InsightsData = {
  total: number;
  answered: number;
  notFound: number;
  // Share of rated answers marked helpful, 0–1; null when nothing was rated.
  helpfulRate: number | null;
  topTopics: { section: string; count: number }[];
  gaps: { id: string; question: string; reason: "notfound" | "unhelpful"; createdAt: string }[];
};
