import { describe, expect, it } from "vitest";
import { l2normalize } from "@/lib/gemini";

describe("l2normalize", () => {
  it("returns a unit-length vector in the same direction", () => {
    const v = l2normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it("normalises a 768-dimension vector", () => {
    const v = l2normalize(Array.from({ length: 768 }, (_, i) => Math.sin(i) * 5));
    expect(Math.hypot(...v)).toBeCloseTo(1, 10);
  });

  it("leaves a zero vector unchanged instead of dividing by zero", () => {
    expect(l2normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
