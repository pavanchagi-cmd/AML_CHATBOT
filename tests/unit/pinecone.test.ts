import { describe, expect, it } from "vitest";
import { docIdPrefix, vectorId } from "@/lib/pinecone";

describe("vectorId", () => {
  it("zero-pads the chunk index after the document id", () => {
    expect(vectorId("d_8f3a", 42)).toBe("d_8f3a#0042");
    expect(vectorId("d_8f3a", 0)).toBe("d_8f3a#0000");
  });

  it("starts with the document prefix used for listing and deleting", () => {
    expect(vectorId("d_8f3a", 7).startsWith(docIdPrefix("d_8f3a"))).toBe(true);
    // A different document whose id starts the same way must not match.
    expect(vectorId("d_8f3ab", 7).startsWith(docIdPrefix("d_8f3a"))).toBe(false);
  });
});
