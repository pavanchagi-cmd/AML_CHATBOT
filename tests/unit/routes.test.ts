import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No service is reached in these tests: every request is rejected before any database or API call.
vi.mock("@/lib/db", () => ({
  db: () => {
    throw new Error("database should not be called");
  },
  schema: {},
}));

const { POST: ingest } = await import("@/app/api/ingest/route");
const { POST: verify } = await import("@/app/api/admin/verify/route");
const { POST: blobToken } = await import("@/app/api/blob/route");
const { DELETE: deleteDoc } = await import("@/app/api/documents/[id]/route");

const original = process.env.ADMIN_PASSCODE;
beforeAll(() => {
  process.env.ADMIN_PASSCODE = "s3cret";
});
afterAll(() => {
  process.env.ADMIN_PASSCODE = original;
});

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const admin = { "x-admin-passcode": "s3cret" };
const goodBody = {
  blobUrl: "https://abc.private.blob.vercel-storage.com/documents/sop-x1.pdf",
  fileName: "sop.pdf",
  category: "Internal SOP",
};

describe("admin-only routes", () => {
  it("reject requests without the passcode with the standard error shape", async () => {
    const res = await ingest(json(goodBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Enter the admin passcode to upload, delete or re-index documents." },
    });
    expect((await ingest(json(goodBody, { "x-admin-passcode": "wrong" }))).status).toBe(401);
    expect((await verify(json({}, { "x-admin-passcode": "wrong" }))).status).toBe(401);
    expect((await verify(json({}, admin))).status).toBe(204);
  });

  it("do not hand out upload tokens without the passcode", async () => {
    const body = {
      type: "blob.generate-client-token",
      payload: { pathname: "documents/a.pdf", clientPayload: null, multipart: false },
    };
    expect((await blobToken(json(body))).status).toBe(401);
  });

  it("protect delete", async () => {
    const req = new Request("http://localhost/api/documents/d_1", { method: "DELETE" });
    const res = await deleteDoc(req, { params: Promise.resolve({ id: "d_1" }) });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/ingest validation", () => {
  it("rejects URLs outside Vercel Blob, unknown categories and unsupported files", async () => {
    for (const body of [
      { ...goodBody, blobUrl: "https://example.com/sop.pdf" },
      { ...goodBody, category: "Gossip" },
      { ...goodBody, fileName: "" },
    ]) {
      const res = await ingest(json(body, admin));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
    }
    const res = await ingest(json({ ...goodBody, fileName: "sheet.xlsx" }, admin));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("This file type isn't supported. Use PDF, DOCX, TXT or MD.");
  });
});
