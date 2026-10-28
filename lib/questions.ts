import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Rating } from "@/lib/types";

export type QuestionLog = {
  id: string;
  question: string;
  categoryScope: string;
  answered: boolean;
  topScore: number | null;
  topSection: string | null;
  sourceIds: string[];
  answer: string | null;
  latencyMs: number;
};

export async function logQuestion(entry: QuestionLog) {
  await db().insert(schema.questions).values(entry);
}

// One feedback row per question: a rating replaces the previous one, null removes it.
// Returns false when the question doesn't exist.
export async function setFeedback(questionId: string, rating: Rating | null): Promise<boolean> {
  const [question] = await db()
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  if (!question) return false;
  if (rating === null) {
    await db().delete(schema.feedback).where(eq(schema.feedback.questionId, questionId));
  } else {
    await db()
      .insert(schema.feedback)
      .values({ questionId, rating })
      .onConflictDoUpdate({ target: schema.feedback.questionId, set: { rating, createdAt: new Date() } });
  }
  return true;
}
