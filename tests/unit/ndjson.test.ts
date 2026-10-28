import { describe, expect, it } from "vitest";
import { ndjsonResponse, readNdjson } from "@/lib/ndjson";

describe("NDJSON stream", () => {
  it("delivers every event in order", async () => {
    const res = ndjsonResponse<{ n: number }>(async (emit) => {
      for (let n = 1; n <= 3; n++) emit({ n });
    });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const seen: number[] = [];
    await readNdjson<{ n: number }>(res, (e) => seen.push(e.n));
    expect(seen).toEqual([1, 2, 3]);
  });

  it("parses lines split across network chunks", async () => {
    const parts = ['{"a":1}\n{"a"', ":2}\n", '{"a":3}'];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    });
    const seen: number[] = [];
    await readNdjson<{ a: number }>(new Response(body), (e) => seen.push(e.a));
    expect(seen).toEqual([1, 2, 3]);
  });
});
