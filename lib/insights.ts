import { and, count, desc, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { InsightsData } from "@/lib/types";

export type { InsightsData };

export const TOP_TOPICS = 6;
export const MAX_GAPS = 50;

export async function getInsights(days: number, now = new Date()): Promise<InsightsData> {
  const { questions: q, feedback: f } = schema;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const inRange = gte(q.createdAt, since);

  const [totals] = await db()
    .select({
      total: count(),
      answered: sql<number>`count(*) filter (where ${q.answered})`.mapWith(Number),
    })
    .from(q)
    .where(inRange);

  const [ratings] = await db()
    .select({
      rated: count(),
      up: sql<number>`count(*) filter (where ${f.rating} = 'up')`.mapWith(Number),
    })
    .from(f)
    .innerJoin(q, eq(f.questionId, q.id))
    .where(inRange);

  const topics = await db()
    .select({ section: q.topSection, count: count() })
    .from(q)
    .where(and(inRange, eq(q.answered, true), isNotNull(q.topSection)))
    .groupBy(q.topSection)
    .orderBy(desc(count()), q.topSection)
    .limit(TOP_TOPICS);

  const gapRows = await db()
    .select({ id: q.id, question: q.question, answered: q.answered, createdAt: q.createdAt })
    .from(q)
    .leftJoin(f, eq(f.questionId, q.id))
    .where(and(inRange, or(eq(q.answered, false), eq(f.rating, "down"))))
    .orderBy(desc(q.createdAt))
    .limit(MAX_GAPS);

  return {
    total: totals.total,
    answered: totals.answered,
    notFound: totals.total - totals.answered,
    helpfulRate: ratings.rated ? ratings.up / ratings.rated : null,
    topTopics: topics.map((t) => ({ section: t.section as string, count: t.count })),
    gaps: gapRows.map((g) => ({
      id: g.id,
      question: g.question,
      reason: g.answered ? "unhelpful" : "notfound",
      createdAt: g.createdAt.toISOString(),
    })),
  };
}
