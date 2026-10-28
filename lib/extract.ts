import mammoth from "mammoth";
import { extractText as extractPdfText } from "unpdf";
import { UNSUPPORTED_FILE_MESSAGE, fileKind } from "@/lib/files";

export type ExtractedPage = { page: number | null; text: string };
export type Extracted = { pages: ExtractedPage[]; pageCount: number | null };

export const NO_TEXT_MESSAGE = "No readable text found. If this is a scanned PDF, run it through OCR first.";
const MIN_CHARS = 50;

export class ExtractionError extends Error {}

function decodeUtf8(data: Uint8Array) {
  return new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
}

// PDF keeps one entry per page with its page number; DOCX, TXT and MD have no pages.
export async function extract(data: Uint8Array, fileName: string): Promise<Extracted> {
  const kind = fileKind(fileName);
  let result: Extracted;

  if (kind === "pdf") {
    // unpdf may transfer the buffer to its worker, so give it a copy.
    const { totalPages, text } = await extractPdfText(new Uint8Array(data), { mergePages: false });
    result = { pages: text.map((t, i) => ({ page: i + 1, text: t })), pageCount: totalPages };
  } else if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    result = { pages: [{ page: null, text: value }], pageCount: null };
  } else if (kind === "txt" || kind === "md") {
    result = { pages: [{ page: null, text: decodeUtf8(data) }], pageCount: null };
  } else {
    throw new ExtractionError(UNSUPPORTED_FILE_MESSAGE);
  }

  const chars = result.pages.reduce((n, p) => n + p.text.trim().length, 0);
  if (chars < MIN_CHARS) throw new ExtractionError(NO_TEXT_MESSAGE);
  return result;
}
