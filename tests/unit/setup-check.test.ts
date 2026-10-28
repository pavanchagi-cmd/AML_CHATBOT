import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  dbError: null as null | Error,
  indexes: [] as { name: string }[],
  setupCalls: [] as unknown[],
}));

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
vi.mock("@/lib/migrate", () => ({
  runMigrations: async () => {
    fake.setupCalls.push("migrate");
  },
}));

const { setupReport } = await import("@/lib/setup-check");
const { POST: status } = await import("@/app/api/admin/status/route");
const { POST: verify } = await import("@/app/api/admin/verify/route");
const { POST: setup } = await import("@/app/api/admin/setup/route");
const { POST: blobToken } = await import("@/app/api/blob/route");
const { serverError } = await import("@/lib/api");

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
    fake.dbError = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error('relation "documents" does not exist'), { code: "42P01" }),
    });
    let report = await setupReport();
    expect(byName(report.services, "Vector index (Pinecone)")).toMatchObject({
      status: "error",
      action: "create-index",
    });
    expect(byName(report.services, "Database (Neon Postgres)")).toMatchObject({
      status: "error",
      detail: "Connected, but the tables don't exist yet.",
      action: "migrate",
    });

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

describe("setup actions", () => {
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const admin = { "x-admin-passcode": "s3cret" };

  it("need the passcode and a known action", async () => {
    process.env.ADMIN_PASSCODE = "s3cret";
    expect((await setup(json({ action: "migrate" }))).status).toBe(401);
    expect((await setup(json({ action: "drop-everything" }, admin))).status).toBe(400);
    expect((await setup(json({ action: "create-index" }, admin))).status).toBe(400);
  });

  it("create the database tables", async () => {
    process.env.ADMIN_PASSCODE = "s3cret";
    fake.setupCalls = [];
    const res = await setup(json({ action: "migrate" }, admin));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Database tables are ready." });
    expect(fake.setupCalls).toEqual(["migrate"]);
  });

  it("report an existing index without recreating it", async () => {
    setAll();
    const res = await setup(
      json({ action: "create-index", cloud: "aws", region: "us-east-1" }, { "x-admin-passcode": "secret-value" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Index "aml-compass" already exists. Nothing to do.');
  });
});

describe("clear errors", () => {
  it("names missing database tables instead of a generic error", async () => {
    const err = Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("x"), { code: "42P01" }) });
    const res = serverError(err);
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toContain("database tables haven't been created yet");
  });

  it("says when file storage isn't connected", async () => {
    process.env.ADMIN_PASSCODE = "s3cret";
    const res = await blobToken(
      new Request("http://localhost/api/blob", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": "s3cret" },
        body: JSON.stringify({
          type: "blob.generate-client-token",
          payload: { pathname: "documents/a.pdf", clientPayload: null, multipart: false },
        }),
      }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toContain("File storage isn't connected");
  });
});
