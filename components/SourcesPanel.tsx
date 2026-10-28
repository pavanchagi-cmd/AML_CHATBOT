"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { iconButtonClass } from "@/components/ui";
import { highlightParts, queryTerms } from "@/lib/highlight";
import { where, type Source } from "@/lib/types";

const STEPS = [
  ["Embed the question", "The question becomes a vector with the same model used for the documents."],
  ["Search the vector index", "The closest chunks are pulled from the index, filtered by “Search in”."],
  ["Check the match", "If nothing relevant is found, the bot says so instead of guessing, and logs a training gap."],
  ["Answer from the chunks only", "The language model writes the answer using only those chunks and cites each one."],
  ["Show the evidence", "Click a numbered source to read the exact passage here."],
] as const;

function HowAnswersAreFound() {
  return (
    <>
      <ol className="relative m-0 mt-1 list-none p-0">
        {STEPS.map(([title, text], i) => (
          <li
            key={title}
            className={cn(
              "relative pb-4 pl-[30px] text-[13.5px]",
              i < STEPS.length - 1 &&
                "before:bg-line before:absolute before:top-5 before:bottom-0 before:left-[9px] before:w-px before:content-['']",
            )}
          >
            <span className="border-accent bg-surface text-accent absolute top-0 left-0 grid h-[19px] w-[19px] place-items-center rounded-full border text-[11px] font-semibold">
              {i + 1}
            </span>
            <b className="block font-semibold">{title}</b>
            <span className="text-ink-2">{text}</span>
          </li>
        ))}
      </ol>
      <div className="bg-surface-2 text-ink-2 rounded-md px-3 py-2.5 text-[13px]">
        Questions and documents are embedded with Gemini and searched in a Pinecone vector index. A Gemini model then
        writes the answer from the matching passages only.
      </div>
    </>
  );
}

function PassageCard({ source, selected, terms }: { source: Source; selected: boolean; terms: Set<string> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={ref}
      className={cn(
        "border-line bg-surface rounded-lg border px-3.5 py-3 transition-[border-color,box-shadow] duration-200",
        selected && "border-amber shadow-[0_0_0_3px_var(--amber-soft)]",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded-chip border-amber-line bg-amber-soft text-amber-ink border px-1.5 py-px text-[12.5px] font-semibold">
          {source.n}
        </span>
        <span className="truncate text-[12.5px] font-semibold">{source.docTitle}</span>
      </div>
      <div className="text-ink-2 mb-2 text-xs">
        {where(source)}, {source.category}
      </div>
      <div className="max-h-[180px] overflow-auto font-serif text-[13.5px] leading-[1.55] whitespace-pre-wrap">
        {highlightParts(source.text, terms).map((part, i) =>
          part.hit ? (
            <mark key={i} className="bg-amber-soft border-amber border-b px-px text-inherit">
              {part.text}
            </mark>
          ) : (
            part.text
          ),
        )}
      </div>
      <div className="text-ink-2 mt-2 flex items-center gap-2 text-[11.5px]">
        Match
        <i className="bg-surface-2 relative h-1 flex-1 overflow-hidden rounded-xs">
          <span
            className="bg-accent absolute inset-y-0 left-0 rounded-xs"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, source.score)) * 100)}%` }}
          />
        </i>
      </div>
    </div>
  );
}

export function SourcesPanel({
  sources,
  question,
  selectedN,
  open,
  onClose,
}: {
  sources: Source[] | null;
  question: string;
  selectedN: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const hasSources = !!sources && sources.length > 0;
  const terms = useMemo(() => queryTerms(question), [question]);

  return (
    <>
      <div
        className={cn("fixed inset-0 z-25 hidden bg-black/30", open && "narrow:block")}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="Sources"
        className={cn(
          "border-line bg-surface flex min-h-0 w-[380px] flex-none flex-col border-l",
          "narrow:fixed narrow:inset-y-0 narrow:right-0 narrow:z-30 narrow:w-[min(400px,92vw)] narrow:translate-x-[105%] narrow:shadow-card narrow:transition-transform narrow:duration-250",
          "narrow:pt-[env(safe-area-inset-top,0px)] narrow:pb-[env(safe-area-inset-bottom,0px)]",
          open && "narrow:translate-x-0",
        )}
      >
        <div className="border-line flex items-center gap-2 border-b px-5 pt-[18px] pb-3">
          <div>
            <h2 className="m-0 text-sm font-semibold">
              {hasSources ? "Sources for this answer" : "How answers are found"}
            </h2>
            <div className="text-ink-2 text-[12.5px]">
              {hasSources ? `${sources.length} passages, best match first` : "Every question goes through these steps"}
            </div>
          </div>
          <button
            type="button"
            className={cn(iconButtonClass, "narrow:inline-flex ml-auto hidden")}
            onClick={onClose}
            aria-label="Close sources"
          >
            Close
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto px-5 pt-4 pb-6">
          {hasSources ? (
            sources.map((s) => <PassageCard key={s.n} source={s} selected={selectedN === s.n} terms={terms} />)
          ) : (
            <HowAnswersAreFound />
          )}
        </div>
      </aside>
    </>
  );
}
