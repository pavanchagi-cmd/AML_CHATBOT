import { describe, expect, it } from "vitest";
import { isRetryable, withRetry } from "@/lib/retry";

const noSleep = async () => {};
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe("withRetry", () => {
  it("retries 429 and 5xx errors, then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw httpError(429);
        if (calls === 2) throw httpError(503);
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("stops after the maximum number of attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw httpError(500);
        },
        { attempts: 5, sleep: noSleep },
      ),
    ).rejects.toThrow("HTTP 500");
    expect(calls).toBe(5);
  });

  it("does not retry client errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw httpError(400);
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow("HTTP 400");
    expect(calls).toBe(1);
  });

  it("waits with exponential backoff", async () => {
    const waits: number[] = [];
    await expect(
      withRetry(
        async () => {
          throw httpError(429);
        },
        { attempts: 4, baseDelayMs: 100, sleep: async (ms) => void waits.push(ms) },
      ),
    ).rejects.toThrow();
    expect(waits).toHaveLength(3);
    waits.forEach((w, i) => {
      expect(w).toBeGreaterThanOrEqual(100 * 2 ** i);
      expect(w).toBeLessThanOrEqual(100 * 2 ** i * 1.2);
    });
  });
});

describe("isRetryable", () => {
  it("recognises rate limits and server errors only", () => {
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(502))).toBe(true);
    expect(isRetryable(httpError(404))).toBe(false);
    expect(isRetryable(new Error("network"))).toBe(false);
  });
});
