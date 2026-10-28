import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ dbError: null as null | Error, indexes: [] as { name: string }[] }));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: () => ({
      from: async () => {
        if (fake.dbError) throw fake.dbError;
        return [{ n: 3 }];
      },
    }),
  }),
  schema: { documents: {}, questions: {} },
}));
vi.mock("@/lib/pinecone", () => ({
  pinecone: () => ({
    indexes: {
      list: async () => ({ indexes: fake.indexes }),
      describe: async () => ({
        schema: { fields: { _values: { type: "dense_vector", dimension: 768, metric: "cosine" } } },
      }),
    },
    index: () => ({ describeIndexStats: async () => ({ namespaces: { default: { recordCount: 42 } } }) }),
  }),
}));
vi.mock("@/lib/gemini", () => ({
  embed: async () => [new Array(768).fill(0)],
  ai: () => ({ models: { get: async () => ({ displayName: "Test Flash" }) } }),
}));
vi.mock("@vercel/blob", () => ({ list: async () => ({ blobs: [] }) }));

const { setupReport } = await import("@/lib/setup-check");
const { POST: status } = await import("@/app/api/admin/status/route");
const { POST: verify } = await import("@/app/api/admin/verify/route");

const KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_CHAT_MODEL",
  "PINECONE_API_KEY",
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "ADMIN_PASSCODE",
];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  fake.dbError = null;
  fake.indexes = [{ name: "aml-compass" }];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const setAll = () => {
  for (const k of KEYS) process.env[k] = k === "GEMINI_CHAT_MODEL" ? "test-flash" : "secret-value";
};
const byName = (checks: { name: string; status: string; detail: string }[], name: string) =>
  checks.find((c) => c.name === name)!;

describe("setupReport", () => {
  it("lists missing settings and skips the services that need them", async () => {
    const report = await setupReport();
    expect(byName(report.settings, "GEMINI_API_KEY")).toMatchObject({ status: "missing" });
    expect(byName(report.settings, "PINECONE_INDEX")).toMatchObject({ status: "ok", detail: "Default: aml-compass" });
    expect(report.services.every((s) => s.status === "missing" && s.detail.startsWith("Skipped: set"))).toBe(true);
  });

  it("reports every service as working when everything is set", async () => {
    setAll();
    const report = await setupReport();
    expect(report.settings.every((s) => s.status === "ok")).toBe(true);
    expect(report.services.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(byName(report.settings, "GEMINI_CHAT_MODEL").detail).toBe("Set to test-flash");
    expect(JSON.stringify(report)).not.toContain("secret-value");
    expect(byName(report.services, "Vector index (Pinecone)").detail).toContain("42 passage(s) indexed");
  });

  it("explains a missing index, missing tables and a rejected key", async () => {
    setAll();
    fake.indexes = [];
    fake.dbError = Object.assign(new Error("query failed"), { cause: 'relation "documents" does not exist' });
    let report = await setupReport();
    expect(byName(report.services, "Vector index (Pinecone)").detail).toContain("npm run pinecone:create-index");
    expect(byName(report.services, "Database (Neon Postgres)").detail).toContain("npm run db:migrate");

    fake.dbError = Object.assign(new Error("denied"), { status: 401 });
    report = await setupReport();
    expect(byName(report.services, "Database (Neon Postgres)").detail).toContain("key was rejected");
  });
});

describe("admin routes", () => {
  const post = (headers: Record<string, string> = {}) => new Request("http://localhost/x", { method: "POST", headers });

  it("setup check needs the passcode", async () => {
    process.env.ADMIN_PASSCODE = "s3cret";
    expect((await status(post())).status).toBe(401);
    expect((await status(post({ "x-admin-passcode": "s3cret" }))).status).toBe(200);
  });

  it("sign-in explains when ADMIN_PASSCODE isn't set", async () => {
    const res = await verify(post({ "x-admin-passcode": "anything" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toContain("Add ADMIN_PASSCODE in Vercel");
  });
});
