"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { CitationChip } from "@/components/CitationChip";
import { citationsToLinks, citeNumberFromHref } from "@/lib/citations";

// Answer text as Markdown (no raw HTML). Each valid [n] becomes a chip that opens passage n;
// numbers without a matching source are dropped.
export function Answer({
  text,
  sourceCount,
  onOpenSource,
}: {
  text: string;
  sourceCount: number;
  onOpenSource: (n: number) => void;
}) {
  const components: Components = {
    a: ({ href, children }) => {
      const n = citeNumberFromHref(href);
      // Other links are shown as text: answers should only point to the cited passages.
      return n ? <CitationChip n={n} onOpen={onOpenSource} /> : <span>{children}</span>;
    },
    p: ({ children }) => <p className="mt-0 mb-[0.75em]">{children}</p>,
    ul: ({ children }) => <ul className="mt-0 mb-[0.75em] list-disc pl-[1.3em]">{children}</ul>,
    ol: ({ children }) => <ol className="mt-0 mb-[0.75em] list-decimal pl-[1.3em]">{children}</ol>,
    li: ({ children }) => <li className="my-[0.2em]">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    h1: ({ children }) => <h4 className="mt-[1em] mb-[0.4em] font-sans text-[15px] font-semibold">{children}</h4>,
    h2: ({ children }) => <h4 className="mt-[1em] mb-[0.4em] font-sans text-[15px] font-semibold">{children}</h4>,
    h3: ({ children }) => <h4 className="mt-[1em] mb-[0.4em] font-sans text-[15px] font-semibold">{children}</h4>,
    h4: ({ children }) => <h4 className="mt-[1em] mb-[0.4em] font-sans text-[15px] font-semibold">{children}</h4>,
    img: () => null,
  };

  return (
    <div className="max-w-[68ch] font-serif text-[16.5px] leading-[1.65] [&>*:last-child]:mb-0">
      <ReactMarkdown components={components} skipHtml>
        {citationsToLinks(text, sourceCount)}
      </ReactMarkdown>
    </div>
  );
}
