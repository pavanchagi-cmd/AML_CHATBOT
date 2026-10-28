import { describe, expect, it } from "vitest";
import { breakdownRange, composeBreakdown, parseBreakdown } from "@/lib/breakdown";

describe("parseBreakdown", () => {
  it("splits one bullet per passage by citation number, even out of order", () => {
    const text = [
      "- **8.1 Crypto**: not about this pattern [2]",
      "- **4.2 Pass-through**: funds leave within hours [1]",
      "- **5.1 Money mule account**: many small credits [3]",
    ].join("\n");
    const b = parseBreakdown(text, 3);
    expect(composeBreakdown(b, 2)).toBe(
      "- **4.2 Pass-through**: funds leave within hours [1]\n- **8.1 Crypto**: not about this pattern [2]",
    );
    expect(composeBreakdown(b, 3).split("\n")).toHaveLength(3);
    expect(breakdownRange(b, 2, 3)).toBe(2);
  });

  it("falls back to bullet order when citations are missing", () => {
    const b = parseBreakdown("- first\n- second", 2);
    expect(composeBreakdown(b, 1)).toBe("- first");
  });

  it("shows the whole reply when it can't be split per passage", () => {
    const b = parseBreakdown("Intro text without bullets [1] [2].", 3);
    expect(composeBreakdown(b, 2)).toBe("Intro text without bullets [1] [2].");
    expect(breakdownRange(b, 2, 3)).toBe(3);
  });
});
