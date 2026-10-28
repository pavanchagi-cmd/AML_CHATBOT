import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extract, NO_TEXT_MESSAGE } from "@/lib/extract";
import { UNSUPPORTED_FILE_MESSAGE } from "@/lib/files";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures", name)));
const utf8 = (s: string) => new TextEncoder().encode(s);

describe("extract", () => {
  it("reads a PDF page by page with page numbers", async () => {
    const { pages, pageCount } = await extract(fixture("pattern-sop.pdf"), "pattern-sop.pdf");
    expect(pageCount).toBe(3);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages[1].text).toContain("5.1 Money mule account");
  });

  it("reads a DOCX without page numbers", async () => {
    const { pages, pageCount } = await extract(fixture("shell-companies.docx"), "shell-companies.docx");
    expect(pageCount).toBeNull();
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBeNull();
    expect(pages[0].text).toContain("6.1 Shell company");
  });

  it("reads TXT and MD as UTF-8 and strips a byte-order mark", async () => {
    const text = "﻿# Section\n\nPassage about structuring and smurfing with enough text to count.";
    const { pages } = await extract(utf8(text), "notes.md");
    expect(pages[0].text.startsWith("# Section")).toBe(true);
    expect((await extract(utf8(text), "notes.txt")).pageCount).toBeNull();
  });

  it("rejects a file with almost no text", async () => {
    await expect(extract(fixture("blank.pdf"), "scan.pdf")).rejects.toThrow(NO_TEXT_MESSAGE);
    await expect(extract(utf8("too short"), "a.txt")).rejects.toThrow(NO_TEXT_MESSAGE);
  });

  it("rejects unsupported file types", async () => {
    await expect(extract(utf8("x".repeat(100)), "sheet.xlsx")).rejects.toThrow(UNSUPPORTED_FILE_MESSAGE);
  });
});
