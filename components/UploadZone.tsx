"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CATEGORIES, buttonClass, selectClass, type Category } from "@/components/ui";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;

// Returns an error message, or null when the file can be uploaded.
export function checkFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext))
    return "This file type isn't supported. Use PDF, DOCX, TXT or MD.";
  if (file.size > MAX_UPLOAD_BYTES) return "This file is over 20 MB. Split it into smaller files and upload each one.";
  return null;
}

export function UploadZone({
  onFile,
  disabled,
}: {
  onFile: (file: File, category: Category) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [category, setCategory] = useState<Category>("Internal SOP");

  function take(file: File | undefined) {
    if (file && !disabled) onFile(file, category);
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
      className={cn(
        "border-line bg-surface grid grid-cols-[1fr_auto] items-center gap-[18px] rounded-2xl border-[1.5px] border-dashed p-[26px]",
        "mobile:grid-cols-1",
        over && "border-accent bg-accent-soft",
      )}
    >
      <div>
        <h3 className="m-0 mb-1 text-base font-semibold">Add a document</h3>
        <p className="text-ink-2 m-0 text-sm">
          PDF, Word (.docx), text or Markdown, up to 20 MB. Drop a file here or choose one.
        </p>
      </div>
      <div className="mobile:justify-start flex flex-wrap items-center justify-end gap-2">
        <select
          className={selectClass}
          aria-label="Document category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label
          className={cn(
            buttonClass("primary"),
            "has-focus-visible:outline-accent relative cursor-pointer has-focus-visible:outline-2",
          )}
        >
          Choose file
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
