// The per-passage breakdown: one request asks Gemini for one brief bullet per retrieved passage,
// so source tab n can show bullets 1..n instantly.

export type Breakdown = { points: string[] } | { fallback: string };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

// Splits the reply into one bullet per passage, matched by citation number (or by order).
// Returns a fallback with the whole text when the reply doesn't have one bullet per passage.
export function parseBreakdown(text: string, count: number): Breakdown {
  const bullets = text
    .split("\n")
    .filter((line) => BULLET.test(line))
    .map((line) => line.trim());
  const byNumber: (string | undefined)[] = new Array(count).fill(undefined);
  for (const line of bullets) {
    const cited = [...line.matchAll(/\[(\d+)(?:\s*,\s*\d+)*\]/g)].map((m) => Number(m[1]));
    const n = cited.find((c) => c >= 1 && c <= count && !byNumber[c - 1]);
    if (n) byNumber[n - 1] = line;
  }
  if (byNumber.every(Boolean)) return { points: byNumber as string[] };
  if (bullets.length === count) return { points: bullets };
  return { fallback: text.trim() };
}

// Bullets 1..n as Markdown; with a fallback, the whole breakdown.
export function composeBreakdown(b: Breakdown, n: number): string {
  return "points" in b ? b.points.slice(0, n).join("\n") : b.fallback;
}

// Which passages the text on screen covers: 1..n, or all of them when showing the fallback.
export function breakdownRange(b: Breakdown, n: number, count: number) {
  return "points" in b ? n : count;
}
