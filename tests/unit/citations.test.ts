import { describe, expect, it } from "vitest";
import {
  citationsToLinks,
  citeNumberFromHref,
  copyText,
  stripAllCitations,
  stripInvalidCitations,
} from "@/lib/citations";
import { highlightParts, queryTerms } from "@/lib/highlight";

describe("citation post-processing", () => {
  it("removes citation numbers that have no source", () => {
    expect(stripInvalidCitations("Mules move money fast [2]. Odd claim [9].", 3)).toBe(
      "Mules move money fast [2]. Odd claim .",
    );
    expect(stripInvalidCitations("Both [1, 4, 3].", 3)).toBe("Both [1, 3].");
    expect(stripInvalidCitations("None [0].", 3)).toBe("None .");
  });

  it("strips every citation for copying", () => {
    expect(stripAllCitations("Red flags [1]. Checks [2, 3].")).toBe("Red flags. Checks.");
    expect(copyText("A **money mule** moves funds [1].")).toBe("A money mule moves funds.");
  });

  it("turns valid citations into chip links and drops invalid ones", () => {
    expect(citationsToLinks("Fact [1, 2]. Other [7].", 2)).toBe("Fact [1](#cite-1)[2](#cite-2). Other .");
    expect(citeNumberFromHref("#cite-12")).toBe(12);
    expect(citeNumberFromHref("https://example.com")).toBeNull();
  });
});

describe("query term highlighting", () => {
  it("ignores common words and matches word forms", () => {
    const terms = queryTerms("What are the red flags of a money mule account?");
    expect([...terms]).toEqual(["red", "flag", "money", "mule", "account"]);
    const parts = highlightParts("Red flags: many accounts of mules.", terms);
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Red", "flags", "accounts", "mules"]);
    expect(parts.map((p) => p.text).join("")).toBe("Red flags: many accounts of mules.");
  });
});
