import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ issued: [] as unknown[], presigned: [] as unknown[] }));

vi.mock("@vercel/blob", () => ({
  issueSignedToken: async (opts: unknown) => {
    calls.issued.push(opts);
    return { delegationToken: "d", clientSigningToken: "c", validUntil: Date.now() + 1000 };
  },
}));
vi.mock("@vercel/blob/client", () => ({
  handleUploadPresigned: async (opts: {
    body: { payload: { pathname: string } };
    webhookPublicKey: string;
    getSignedToken: (p: string, c: null, m: boolean) => Promise<{ token: unknown; urlOptions: unknown }>;
  }) => {
    const signed = await opts.getSignedToken(opts.body.payload.pathname, null, false);
    calls.presigned.push({ webhookPublicKey: opts.webhookPublicKey, ...signed });
    return {
      type: "blob.generate-presigned-url",
      presignedUrlPayload: { delegationToken: "d", signature: "s", params: {} },
    };
  },
}));

const { POST } = await import("@/app/api/blob/route");

const KEYS = ["ADMIN_PASSCODE", "BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.ADMIN_PASSCODE = "s3cret";
  calls.issued = [];
  calls.presigned = [];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const request = (pathname: string, opts: { type?: string; passcode?: string } = {}) =>
  POST(
    new Request("http://localhost/api/blob", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-passcode": opts.passcode ?? "s3cret" },
      body: JSON.stringify({
        type: opts.type ?? "blob.generate-presigned-url",
        payload: { pathname, clientPayload: null, multipart: false },
      }),
    }),
  );

describe("POST /api/blob (presigned uploads)", () => {
  it("works with an OIDC-connected store (BLOB_STORE_ID only)", async () => {
    process.env.BLOB_STORE_ID = "store_abc";
    const res = await request("documents/1234/SOP.pdf");
    expect(res.status).toBe(200);
    expect((await res.json()).presignedUrlPayload).toBeDefined();
    expect(calls.issued).toHaveLength(1);
    expect(calls.issued[0]).toMatchObject({
      pathname: "documents/1234/SOP.pdf",
      operations: ["put"],
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 20 * 1024 * 1024,
    });
    expect(calls.presigned[0]).toMatchObject({
      urlOptions: { allowOverwrite: false, allowedContentTypes: ["application/pdf"] },
    });
  });

  it("also works with a read-write token", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_x";
    expect((await request("documents/1/notes.md")).status).toBe(200);
    expect(calls.issued[0]).toMatchObject({ allowedContentTypes: ["text/markdown", "text/x-markdown", "text/plain"] });
  });

  it("explains when no Blob store is connected", async () => {
    const res = await request("documents/1/SOP.pdf");
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toContain("File storage isn't connected");
  });

  it("rejects wrong passcodes, other file types, other folders and callbacks", async () => {
    process.env.BLOB_STORE_ID = "store_abc";
    expect((await request("documents/1/SOP.pdf", { passcode: "nope" })).status).toBe(401);
    expect((await request("documents/1/sheet.xlsx")).status).toBe(400);
    expect((await request("other/SOP.pdf")).status).toBe(400);
    expect((await request("documents/../SOP.pdf")).status).toBe(400);
    expect((await request("documents/1/SOP.pdf", { type: "blob.upload-completed" })).status).toBe(400);
    expect(calls.issued).toHaveLength(0);
  });
});
