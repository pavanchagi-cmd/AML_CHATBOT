"use client";

import { cn } from "@/lib/utils";
import { where, type Source } from "@/lib/types";

export function SourceTabs({
  sources,
  selectedN,
  onSelect,
}: {
  sources: Source[];
  selectedN: number | null;
  onSelect: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <button
          key={s.n}
          type="button"
          onClick={() => onSelect(s.n)}
          className={cn(
            "border-line border-l-amber bg-surface text-ink-2 flex max-w-full items-center gap-2 rounded-[4px_8px_8px_4px] border border-l-[3px] py-[5px] pr-2.5 pl-2 text-[12.5px]",
            "hover:border-amber-line hover:border-l-amber hover:bg-amber-soft hover:text-ink",
            selectedN === s.n && "border-amber-line border-l-amber bg-amber-soft text-ink",
          )}
        >
          <b className="text-amber font-semibold">{s.n}</b>
          <span className="max-w-[260px] truncate">
            {s.docTitle}, {where(s)}
          </span>
        </button>
      ))}
    </div>
  );
}
