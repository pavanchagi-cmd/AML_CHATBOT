// File rules shared by the browser and the server (spec sections 6 and 10).

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const FILE_KINDS = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/x-markdown", "text/plain"],
} as const;

export type FileKind = keyof typeof FILE_KINDS;

export const ALLOWED_CONTENT_TYPES = [...new Set(Object.values(FILE_KINDS).flat())];

export const UNSUPPORTED_FILE_MESSAGE = "This file type isn't supported. Use PDF, DOCX, TXT or MD.";
export const TOO_LARGE_MESSAGE = "This file is over 20 MB. Split it into smaller files and upload each one.";

export function fileKind(fileName: string): FileKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ext in FILE_KINDS ? (ext as FileKind) : null;
}

// Content type must match the extension. Charset parameters (text/plain; charset=utf-8) are ignored.
export function contentTypeMatches(kind: FileKind, contentType: string | null | undefined): boolean {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return (FILE_KINDS[kind] as readonly string[]).includes(base);
}

export function titleFromFileName(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.[^.]+$/, "").trim() || base;
}
