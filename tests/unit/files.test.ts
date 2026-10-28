import { describe, expect, it } from "vitest";
import { isBlobStoreUrl } from "@/lib/blob";
import { contentTypeMatches, fileKind, titleFromFileName } from "@/lib/files";

describe("file rules", () => {
  it("recognises the four allowed extensions, case-insensitively", () => {
    expect(fileKind("FATF Report.PDF")).toBe("pdf");
    expect(fileKind("sop.docx")).toBe("docx");
    expect(fileKind("notes.md")).toBe("md");
    expect(fileKind("notes.txt")).toBe("txt");
    expect(fileKind("old.doc")).toBeNull();
    expect(fileKind("noext")).toBeNull();
  });

  it("requires the content type to match the extension", () => {
    expect(contentTypeMatches("pdf", "application/pdf")).toBe(true);
    expect(contentTypeMatches("txt", "text/plain; charset=utf-8")).toBe(true);
    expect(contentTypeMatches("md", "text/markdown")).toBe(true);
    expect(contentTypeMatches("pdf", "text/plain")).toBe(false);
    expect(contentTypeMatches("docx", "application/zip")).toBe(false);
    expect(contentTypeMatches("pdf", null)).toBe(false);
  });

  it("uses the file name without its extension as the title", () => {
    expect(titleFromFileName("FATF Professional Money Laundering 2018.pdf")).toBe(
      "FATF Professional Money Laundering 2018",
    );
    expect(titleFromFileName("folder/sop.v2.docx")).toBe("sop.v2");
  });
});

describe("isBlobStoreUrl", () => {
  it("accepts only HTTPS Vercel Blob URLs", () => {
    expect(isBlobStoreUrl("https://abc123.private.blob.vercel-storage.com/documents/a-x1.pdf")).toBe(true);
    expect(isBlobStoreUrl("http://abc123.private.blob.vercel-storage.com/a.pdf")).toBe(false);
    expect(isBlobStoreUrl("https://evil.example.com/blob.vercel-storage.com/a.pdf")).toBe(false);
    expect(isBlobStoreUrl("https://blob.vercel-storage.com.evil.com/a.pdf")).toBe(false);
    expect(isBlobStoreUrl("not a url")).toBe(false);
  });
});
