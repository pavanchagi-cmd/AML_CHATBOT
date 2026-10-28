import type { Page, Route } from "@playwright/test";

// Canned API responses for the UI suites, so they run without Gemini, Pinecone or a database.

export const sources = [
  {
    n: 1,
    docId: "d_1",
    docTitle: "AML Pattern Analysis SOP",
    category: "Internal SOP",
    section: "5.1 Money mule account",
    page: 2,
    text: "What it looks like: an account receives many small or medium credits from unrelated individuals.\nRed flags: young, student or unemployed customer; many first-time remitters.",
    score: 0.83,
  },
  {
    n: 2,
    docId: "d_1",
    docTitle: "AML Pattern Analysis SOP",
    category: "Internal SOP",
    section: "4.6 Dormant account reactivation",
    page: null,
    text: "Often linked to money mule activity. Checks: login and device history.",
    score: 0.61,
  },
];

export const answer =
  "A **money mule account** receives many credits from unrelated people and moves the money on quickly [1].\n\n" +
  "- Red flags: student or unemployed customer, many first-time remitters [1]\n" +
  "- A dormant account that suddenly wakes up can also be a mule [2, 7]";

const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

export const readyDoc = {
  id: "d_1",
  title: "AML Pattern Analysis SOP",
  category: "Internal SOP",
  fileName: "sop.pdf",
  pageCount: 3,
  chunkCount: 5,
  status: "ready",
  error: null,
  createdAt: "2026-10-28T10:00:00.000Z",
};

export async function mockApi(page: Page, opts: { documents?: unknown[] } = {}) {
  const feedback: unknown[] = [];
  await page.route("**/api/documents", (r) => r.fulfill({ json: opts.documents ?? [readyDoc] }));
  await page.route("**/api/feedback", (r: Route) => {
    feedback.push(JSON.parse(r.request().postData() ?? "{}"));
    return r.fulfill({ status: 204 });
  });
  await page.route("**/api/chat", (r) => {
    const { question } = JSON.parse(r.request().postData() ?? "{}") as { question: string };
    const body = /France/i.test(question)
      ? ndjson([{ type: "notfound", questionId: "00000000-0000-4000-8000-000000000002" }])
      : ndjson([
          { type: "sources", sources },
          { type: "delta", text: answer.slice(0, 50) },
          { type: "delta", text: answer.slice(50) },
          { type: "done", questionId: "00000000-0000-4000-8000-000000000001" },
        ]);
    return r.fulfill({ contentType: "application/x-ndjson", body });
  });
  await page.route("**/api/insights**", (r) =>
    r.fulfill({
      json: {
        total: 4,
        answered: 3,
        notFound: 1,
        helpfulRate: 0.5,
        topTopics: [{ section: "5.1 Money mule account", count: 2 }],
        gaps: [
          {
            id: "g1",
            question: "What is the capital of France?",
            reason: "notfound",
            createdAt: "2026-10-28T09:00:00Z",
          },
        ],
      },
    }),
  );
  return { feedback };
}
