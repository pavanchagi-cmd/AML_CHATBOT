import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_HEADER, isAdmin, passcodeMatches } from "@/lib/auth";

describe("passcodeMatches", () => {
  it("accepts only the exact passcode", () => {
    expect(passcodeMatches("s3cret", "s3cret")).toBe(true);
    expect(passcodeMatches("s3cre", "s3cret")).toBe(false);
    expect(passcodeMatches("S3CRET", "s3cret")).toBe(false);
  });

  it("never matches an empty expected passcode", () => {
    expect(passcodeMatches("", "")).toBe(false);
  });
});

describe("isAdmin", () => {
  const original = process.env.ADMIN_PASSCODE;
  afterEach(() => {
    process.env.ADMIN_PASSCODE = original;
  });

  it("checks the x-admin-passcode header", () => {
    process.env.ADMIN_PASSCODE = "s3cret";
    const req = (h?: string) => new Request("http://x", { headers: h ? { [ADMIN_HEADER]: h } : {} });
    expect(isAdmin(req("s3cret"))).toBe(true);
    expect(isAdmin(req("nope"))).toBe(false);
    expect(isAdmin(req())).toBe(false);
  });

  it("fails loudly when ADMIN_PASSCODE is not set", () => {
    delete process.env.ADMIN_PASSCODE;
    const req = new Request("http://x", { headers: { [ADMIN_HEADER]: "anything" } });
    expect(() => isAdmin(req)).toThrow(/ADMIN_PASSCODE/);
  });
});
