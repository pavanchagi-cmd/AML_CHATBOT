"use client";

export function CitationChip({ n, onOpen }: { n: number; onOpen: (n: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      aria-label={`Source ${n}`}
      className="rounded-chip border-amber-line bg-amber-soft text-amber-ink hover:bg-amber hover:text-surface mx-px inline-flex h-5 min-w-[22px] items-center justify-center border px-[5px] align-[2px] font-sans text-[11.5px] leading-none font-semibold"
    >
      {n}
    </button>
  );
}
