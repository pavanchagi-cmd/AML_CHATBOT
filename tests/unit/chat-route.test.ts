import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/lib/chat-events";
import * as schema from "@/lib/db/schema";
import { readNdjson } from "@/lib/ndjson";
import type { ChunkMatch } from "@/lib/pinecone";

// Real Postgres (PGlite) and the real route; Gemini and Pinecone are stand-ins.
const pg = new PGlite();
const testDb = drizzle({ client: pg, schema });

const fake = vi.hoisted(() => ({
  matches: [] as unknown[],
  modelChunks: [] as string[],
  modelCalls: 0,
  lastPrompt: "",
  lastQuery: null as null | { topK: number; category?: string },
  failSearch: null as null | Error,
  failModel: null as null | Error,
}));

vi.mock("@/lib/db", () => ({ db: () => testDb, schema }));
vi.mock("@/lib/gemini", () => ({
  embed: async () => {
    if (fake.failSearch) throw fake.failSearch;
    return [[1, 0, 0]];
  },
  generateStream: async function* (prompt: string) {
    fake.modelCalls++;
    fake.lastPrompt = prompt;
    if (fake.failModel) throw fake.failModel;
    for (const c of fake.modelChunks) yield c;
  },
}));
vi.mock("@/lib/pinecone", () => ({
  queryChunks: async (_v: number[], opts: { topK: number; category?: string }) => {
    fake.lastQuery = opts;
    return fake.matches;
  },
}));

const { POST: chat } = await import("@/app/api/chat/route");
const { POST: feedback } = await import("@/app/api/feedback/route");

const match = (score: number, section: string, page?: number): ChunkMatch => ({
  id: `d_1#${section}`,
  score,
  metadata: {
    docId: "d_1",
    docTitle: "Pattern SOP",
    category: "Internal SOP",
    section,
    chunkIndex: 0,
    text: `About ${section}`,
    ...(page ? { page } : {}),
  },
});

let ip = 0;
async function ask(question: string, scope = "all", upTo?: number) {
  const res = await chat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}` },
      body: JSON.stringify({ question, scope, history: [], ...(upTo !== undefined ? { upTo } : {}) }),
    }),
  );
  const events: ChatEvent[] = [];
  if (res.ok) await readNdjson<ChatEvent>(res, (e) => events.push(e));
  return { res, events };
}

const logged = async () => (await testDb.select().from(schema.questions)).sort((a, b) => +a.createdAt - +b.createdAt);

beforeAll(async () => {
  const sql = readFileSync(path.join(__dirname, "../../drizzle/0000_init.sql"), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) await pg.exec(statement);
  process.env.RAG_MIN_SCORE = "0.55";
});

beforeEach(async () => {
  await pg.exec("delete from feedback; delete from questions;");
  Object.assign(fake, {
    matches: [],
    modelChunks: [],
    modelCalls: 0,
    lastQuery: null,
    failSearch: null,
    failModel: null,
  });
});

describe("POST /api/chat", () => {
  it("streams sources, then the answer, then done, and logs the question", async () => {
    fake.matches = [match(0.82, "5.1 Money mule account", 2), match(0.4, "Unrelated")];
    fake.modelChunks = ["Mule accounts receive many credits [1]", " and move them on fast [1]. Odd [5]."];
    const { events } = await ask("What are the red flags of a money mule account?");

    expect(events[0]).toMatchObject({
      type: "sources",
      sources: [{ n: 1, section: "5.1 Money mule account", page: 2 }],
    });
    expect((events[0] as { sources: unknown[] }).sources).toHaveLength(1);
    const text = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(text).toBe("Mule accounts receive many credits [1] and move them on fast [1]. Odd [5].");
    const done = events.at(-1) as { type: string; questionId: string };
    expect(done.type).toBe("done");

    const [row] = await logged();
    expect(row).toMatchObject({
      id: done.questionId,
      answered: true,
      topSection: "5.1 Money mule account",
      sourceIds: ["d_1#5.1 Money mule account"],
      answer: "Mule accounts receive many credits [1] and move them on fast [1]. Odd .",
    });
    expect(row.topScore).toBeCloseTo(0.82);
  });

  it("does not call the model when nothing passes the threshold, and logs a gap", async () => {
    fake.matches = [match(0.3, "Something else")];
    const { events } = await ask("What is the capital of France?");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("notfound");
    expect(fake.modelCalls).toBe(0);
    const [row] = await logged();
    expect(row).toMatchObject({ answered: false, topSection: null, answer: null, sourceIds: [] });
    expect(row.topScore).toBeCloseTo(0.3);
  });

  it("turns a NOT_FOUND reply into a not-found result without streaming it", async () => {
    fake.matches = [match(0.7, "4.1 Structuring")];
    fake.modelChunks = ["NOT_", "FOUND"];
    const { events } = await ask("What is the CTR threshold?");
    expect(events.map((e) => e.type)).toEqual(["sources", "notfound"]);
    expect((await logged())[0].answered).toBe(false);
  });

  it("reports search problems without logging a false not-found", async () => {
    fake.failSearch = new Error("pinecone down");
    const { events } = await ask("How do I spot structuring?");
    expect(events).toEqual([{ type: "error", message: "Search is unavailable right now. Try again in a minute." }]);
    expect(await logged()).toHaveLength(0);
  });

  it("explains when the answer service is busy", async () => {
    fake.matches = [match(0.7, "4.1 Structuring")];
    fake.failModel = Object.assign(new Error("quota"), { status: 429 });
    const { events } = await ask("How do I spot structuring?");
    expect(events.at(-1)).toEqual({ type: "error", message: "The answer service is busy. Try again in a minute." });
  });

  it("filters by category when a scope is chosen and validates input", async () => {
    expect((await ask("x")).res.status).toBe(400);
    expect((await ask("Valid question", "Gossip")).res.status).toBe(400);
    expect((await ask("Valid question", "FATF report")).res.status).toBe(200);
    expect(fake.lastQuery).toEqual({ topK: 8, category: "FATF report" });
    await ask("Valid question", "all");
    expect(fake.lastQuery).toEqual({ topK: 8, category: undefined });
  });

  it("rate-limits a client after 20 questions a minute", async () => {
    const req = () =>
      chat(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
          body: JSON.stringify({ question: "x" }),
        }),
      );
    for (let i = 0; i < 20; i++) expect((await req()).status).toBe(400);
    expect((await req()).status).toBe(429);
  });
});

describe("POST /api/chat with upTo (rewrite from passages 1..n)", () => {
  it("uses only passages 1..n, asks for brief points, and doesn't log a new question", async () => {
    fake.matches = [match(0.9, "4.2 Pass-through"), match(0.8, "8.1 Crypto"), match(0.7, "5.1 Money mule account")];
    fake.modelChunks = ["Pass-through: funds leave fast [1].", " Crypto: not about this pattern [2]."];
    const { events } = await ask("What is pass-through?", "all", 2);
    const sources = (events[0] as { sources: { section: string }[] }).sources;
    expect(sources.map((s) => s.section)).toEqual(["4.2 Pass-through", "8.1 Crypto"]);
    expect(fake.lastPrompt).toContain("use only blocks [1] to [2]");
    expect(fake.lastPrompt).not.toContain("5.1 Money mule account");
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(await logged()).toHaveLength(0);
  });

  it("rejects an invalid upTo", async () => {
    expect((await ask("What is pass-through?", "all", 0)).res.status).toBe(400);
  });
});

describe("POST /api/feedback", () => {
  const send = (body: unknown) =>
    feedback(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(body) }));

  it("stores one rating per answer, changes it, and removes it", async () => {
    fake.matches = [match(0.8, "5.1 Money mule account")];
    fake.modelChunks = ["Answer [1]."];
    const { events } = await ask("Mule red flags?");
    const questionId = (events.at(-1) as { questionId: string }).questionId;

    expect((await send({ questionId, rating: "up" })).status).toBe(204);
    expect((await send({ questionId, rating: "down" })).status).toBe(204);
    let rows = await testDb.select().from(schema.feedback);
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe("down");

    expect((await send({ questionId, rating: null })).status).toBe(204);
    rows = await testDb.select().from(schema.feedback);
    expect(rows).toHaveLength(0);
  });

  it("rejects unknown questions and bad input", async () => {
    expect((await send({ questionId: crypto.randomUUID(), rating: "up" })).status).toBe(404);
    expect((await send({ questionId: "nope", rating: "up" })).status).toBe(400);
    expect((await send({ questionId: crypto.randomUUID(), rating: "meh" })).status).toBe(400);
  });
});
