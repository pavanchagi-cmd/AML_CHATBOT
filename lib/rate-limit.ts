// Basic in-memory limit per client IP (spec section 10). Each serverless instance keeps its own
// counts, so this slows down bursts rather than enforcing an exact global limit.

const hits = new Map<string, number[]>();

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function rateLimited(key: string, limit = 20, windowMs = 60_000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return false;
}
