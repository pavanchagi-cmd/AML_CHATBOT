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
  status: "thinking" | "streaming" | "done" | "notfound" | "error";
  phase?: string;
  text: string;
  sources: Source[];
  questionId?: string;
  rating?: Rating | null;
  error?: string;
};

export type ChatMessage = UserMessage | BotMessage;

export function where(s: Pick<Source, "section" | "page">) {
  return [s.section, s.page ? `page ${s.page}` : ""].filter(Boolean).join(", ");
}
