import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const pg = new PGlite();
const testDb = drizzle({ client: pg, schema });
vi.mock("@/lib/db", () => ({ db: () => testDb, schema }));

const { getInsights } = await import("@/lib/insights");
const { GET } = await import("@/app/api/insights/route");

const NOW = new Date("2026-10-28T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

async function addQuestion(
  question: string,
  opts: { answered: boolean; section?: string; age: number; rating?: "up" | "down" },
) {
  const [row] = await testDb
    .insert(schema.questions)
    .values({
      question,
      categoryScope: "all",
      answered: opts.answered,
      topScore: opts.answered ? 0.8 : 0.2,
      topSection: opts.section ?? null,
      latencyMs: 900,
      createdAt: daysAgo(opts.age),
    })
    .returning();
  if (opts.rating) await testDb.insert(schema.feedback).values({ questionId: row.id, rating: opts.rating });
  return row;
}

beforeAll(async () => {
  const sql = readFileSync(path.join(__dirname, "../../drizzle/0000_init.sql"), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) await pg.exec(statement);
});

beforeEach(async () => {
  await pg.exec("delete from feedback; delete from questions;");
});

describe("getInsights", () => {
  it("returns zeros and no helpful rate when nothing was asked", async () => {
    expect(await getInsights(30, NOW)).toEqual({
      total: 0,
      answered: 0,
      notFound: 0,
      helpfulRate: null,
      topTopics: [],
      gaps: [],
    });
  });

  it("aggregates KPIs, topics and gaps within the range", async () => {
    await addQuestion("Mule red flags?", { answered: true, section: "5.1 Money mule account", age: 1, rating: "up" });
    await addQuestion("How do mules move money?", { answered: true, section: "5.1 Money mule account", age: 2 });
    await addQuestion("What counts as a PEP relative?", {
      answered: true,
      section: "10.1 PEP family or associate fronts",
      age: 3,
      rating: "down",
    });
    await addQuestion("What is the CTR threshold?", { answered: false, age: 4 });
    await addQuestion("Capital of France?", { answered: false, age: 0.5 });
    await addQuestion("Too old to count", { answered: false, age: 40 });

    const data = await getInsights(30, NOW);
    expect(data).toMatchObject({ total: 5, answered: 3, notFound: 2, helpfulRate: 0.5 });
    expect(data.topTopics).toEqual([
      { section: "5.1 Money mule account", count: 2 },
      { section: "10.1 PEP family or associate fronts", count: 1 },
    ]);
    expect(data.gaps.map((g) => [g.question, g.reason])).toEqual([
      ["Capital of France?", "notfound"],
      ["What counts as a PEP relative?", "unhelpful"],
      ["What is the CTR threshold?", "notfound"],
    ]);

    const week = await getInsights(2, NOW);
    expect(week).toMatchObject({ total: 3, answered: 2, notFound: 1, helpfulRate: 1 });
  });

  it("lists at most six topics", async () => {
    for (let i = 0; i < 8; i++) await addQuestion(`q${i}`, { answered: true, section: `Section ${i}`, age: 1 });
    expect((await getInsights(30, NOW)).topTopics).toHaveLength(6);
  });
});

describe("GET /api/insights", () => {
  it("validates the range", async () => {
    expect((await GET(new Request("http://localhost/api/insights?days=abc"))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/insights?days=0"))).status).toBe(400);
    const res = await GET(new Request("http://localhost/api/insights?days=7"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0, gaps: [] });
  });
});
