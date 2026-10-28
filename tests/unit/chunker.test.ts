import { describe, expect, it } from "vitest";
import { CHUNK_OVERLAP, CHUNK_SIZE, chunkPages, embeddingText, headingOf, normaliseWhitespace } from "@/lib/chunker";

const sentence = (i: number) => `Sentence number ${i} explains one more detail about the alert review process.`;
const longParagraph = (n: number) => Array.from({ length: n }, (_, i) => sentence(i)).join(" ");

describe("headingOf", () => {
  it("detects Markdown headings", () => {
    expect(headingOf("## 5.1 Money mule account")).toBe("5.1 Money mule account");
    expect(headingOf("# Purpose ##")).toBe("Purpose");
  });

  it("detects numbered headings", () => {
    expect(headingOf("5.1 Money mule account")).toBe("5.1 Money mule account");
    expect(headingOf("12. Escalation, closure and STR decision rules")).toBe(
      "12. Escalation, closure and STR decision rules",
    );
  });

  it("detects short title-case lines", () => {
    expect(headingOf("Trade-Based Money Laundering")).toBe("Trade-Based Money Laundering");
    expect(headingOf("Roles and Responsibilities of the MLRO")).toBe("Roles and Responsibilities of the MLRO");
  });

  it("ignores ordinary sentences and numbered steps", () => {
    expect(headingOf("Red flags: amounts repeatedly just under a threshold.")).toBeNull();
    expect(headingOf("1. Read the alert: note the rule or scenario that fired.")).toBeNull();
    expect(headingOf("the customer asks about reporting limits")).toBeNull();
    expect(headingOf("")).toBeNull();
  });
});

describe("normaliseWhitespace", () => {
  it("collapses spaces and extra blank lines but keeps paragraph breaks", () => {
    expect(normaliseWhitespace("a   b\t c\r\n\r\n\r\n\r\nnext  para \n")).toBe("a b c\n\nnext para");
  });
});

describe("chunkPages", () => {
  it("keeps chunks within the size limit and drops tiny ones", async () => {
    const chunks = await chunkPages([{ page: 1, text: longParagraph(60) + "\n\nok" }], "Doc");
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(CHUNK_SIZE);
      expect(c.text.length).toBeGreaterThanOrEqual(20);
      expect(c.text.trim()).toBe(c.text);
    }
    expect(chunks.some((c) => c.text === "ok")).toBe(false);
  });

  it("overlaps consecutive chunks", async () => {
    const chunks = await chunkPages([{ page: 1, text: longParagraph(60) }], "Doc");
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].text.slice(-CHUNK_OVERLAP / 2);
      const lastWords = tail.split(" ").slice(-3).join(" ");
      expect(chunks[i].text.slice(0, CHUNK_OVERLAP + 100)).toContain(lastWords);
    }
  });

  it("assigns each chunk the heading above it and numbers chunks in order", async () => {
    const chunks = await chunkPages(
      [
        {
          page: 1,
          text: "Intro text that comes before any heading.\n4.1 Structuring (smurfing)\nMany cash deposits below thresholds.",
        },
        {
          page: 2,
          text: "More structuring detail on the next page.\n5.1 Money mule account\nMany small credits from unrelated people.",
        },
      ],
      "Pattern SOP",
    );
    expect(chunks.map((c) => [c.chunkIndex, c.page, c.section])).toEqual([
      [0, 1, "Pattern SOP"],
      [1, 1, "4.1 Structuring (smurfing)"],
      [2, 2, "4.1 Structuring (smurfing)"],
      [3, 2, "5.1 Money mule account"],
    ]);
  });

  it("returns no chunks for empty pages", async () => {
    expect(await chunkPages([{ page: null, text: "  \n\n " }], "Doc")).toEqual([]);
  });
});

describe("embeddingText", () => {
  it("puts the section heading before the chunk text", () => {
    expect(embeddingText({ section: "5.1 Money mule account", text: "Red flags: …" })).toBe(
      "5.1 Money mule account\n\nRed flags: …",
    );
  });
});
