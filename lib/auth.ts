import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/env";

export const ADMIN_HEADER = "x-admin-passcode";

// Constant-time comparison; hashing first makes both inputs the same length.
export function passcodeMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && expected.length > 0;
}

export function isAdmin(req: Request): boolean {
  const given = req.headers.get(ADMIN_HEADER);
  if (!given) return false;
  return passcodeMatches(given, config.adminPasscode());
}
