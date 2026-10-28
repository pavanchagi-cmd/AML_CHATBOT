import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { ExtractedPage } from "@/lib/extract";

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;
const MIN_CHUNK_CHARS = 20;

export type Chunk = { chunkIndex: number; section: string; page: number | null; text: string };

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""],
});

// Collapse runs of spaces and blank lines, but keep paragraph breaks.
export function normaliseWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v\u00A0 ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

function isTitleCase(line: string) {
  if (line.length > 80 || /[.:;,!?]$/.test(line)) return false;
  const words = line.split(" ").filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 2 || words.length > 10) return false;
  return words.every((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase())) || /^[("'“]?[A-Z0-9]/.test(w));
}

// Markdown `#` headings, numbered headings like "5.1 Money mule account", and short title-case lines.
export function headingOf(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;
  const md = line.match(/^#{1,6}\s+(\S.*)$/);
  if (md) return md[1].replace(/\s+#+\s*$/, "").trim();
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(line) && line.length < 90 && !/[.:;,]$/.test(line)) return line;
  if (isTitleCase(line)) return line;
  return null;
}

type Block = { section: string; page: number | null; text: string };

// The current section carries over from one page to the next until a new heading appears.
export function splitByHeadings(pages: ExtractedPage[], fallbackSection: string): Block[] {
  const blocks: Block[] = [];
  let section = fallbackSection;
  for (const p of pages) {
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join("\n").trim();
      if (text) blocks.push({ section, page: p.page, text });
      buf = [];
    };
    for (const line of normaliseWhitespace(p.text).split("\n")) {
      const heading = headingOf(line);
      if (heading) {
        flush();
        section = heading;
      } else {
        buf.push(line);
      }
    }
    flush();
  }
  return blocks;
}

export async function chunkPages(pages: ExtractedPage[], fallbackSection: string): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  for (const block of splitByHeadings(pages, fallbackSection)) {
    for (const piece of await splitter.splitText(block.text)) {
      const text = piece.trim();
      if (text.length < MIN_CHUNK_CHARS) continue;
      chunks.push({ chunkIndex: chunks.length, section: block.section, page: block.page, text });
    }
  }
  return chunks;
}

// What gets embedded: the section heading gives each chunk its topic, e.g. "5.1 Money mule account".
export function embeddingText(chunk: Pick<Chunk, "section" | "text">) {
  return `${chunk.section}\n\n${chunk.text}`;
}
