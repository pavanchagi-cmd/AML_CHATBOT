"use client";

import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { Answer } from "@/components/Answer";
import { iconButtonClass } from "@/components/ui";
import { SourceTabs } from "@/components/SourceTabs";
import type { BotMessage, Rating } from "@/lib/types";
import { cn } from "@/lib/utils";

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="bg-accent text-accent-ink max-w-[80%] self-end rounded-[14px_14px_4px_14px] px-3.5 py-2.5">
      {text}
    </div>
  );
}

function Thinking({ phase }: { phase?: string }) {
  return (
    <div className="text-ink-2 flex items-center gap-2 font-sans text-sm">
      <span aria-hidden="true">
        {[0, 0.15, 0.3].map((d) => (
          <span
            key={d}
            className="animate-dot bg-ink-2 mr-[3px] inline-block h-[5px] w-[5px] rounded-full"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </span>
      {phase || "Searching the library"}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-line text-ink-2 max-w-[68ch] rounded-lg border border-dashed px-3.5 py-3 text-[14.5px]">
      <strong className="text-ink mb-0.5 block">{title}</strong>
      {children}
    </div>
  );
}

export function BotAnswer({
  message,
  selectedN,
  onOpenSource,
  onSelectTab,
  onCopy,
  onRate,
}: {
  message: BotMessage;
  selectedN: number | null;
  onOpenSource: (n: number) => void;
  onSelectTab: (n: number) => void;
  onCopy: () => void;
  onRate: (rating: Rating) => void;
}) {
  const m = message;
  let body: React.ReactNode;
  if (m.status === "thinking") body = <Thinking phase={m.phase} />;
  else if (m.status === "notfound")
    body = (
      <Notice title="Not found in your library">
        None of the uploaded documents cover this. Try different words, widen “Search in”, or add a document that covers
        it. This question is logged under Insights as a training gap.
      </Notice>
    );
  else if (m.status === "error") body = <Notice title="No answer">{m.error}</Notice>;
  else if (m.status === "streaming" && !m.text) body = <Thinking phase={m.phase} />;
  else if (m.rewriting) body = <Thinking phase={`Preparing brief points for passages 1–${m.rewriting}`} />;
  else
    body = (
      <>
        {m.upTo && (
          <div className="text-ink-2 font-sans text-[13px]">
            Brief answer from passages 1–{m.upTo}.{" "}
            <button type="button" className="text-accent underline" onClick={() => onSelectTab(1)}>
              Show the original answer
            </button>
          </div>
        )}
        <Answer text={m.text} sourceCount={m.upTo ?? m.sources.length} onOpenSource={onOpenSource} />
        {m.rewriteError && <p className="text-danger m-0 font-sans text-[13px]">{m.rewriteError}</p>}
      </>
    );

  const showSources = m.sources.length > 0 && (m.status === "done" || m.status === "streaming");

  return (
    <div className="flex flex-col gap-3">
      {body}
      {showSources && (
        <SourceTabs
          sources={m.sources}
          selectedN={selectedN}
          usedUpTo={m.upTo}
          onSelect={m.status === "done" ? onSelectTab : onOpenSource}
        />
      )}
      {m.status === "done" && (
        <div className="flex items-center gap-1">
          <button type="button" className={iconButtonClass} onClick={onCopy} aria-label="Copy answer">
            <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
            Copy
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-pressed={m.rating === "up"}
            aria-label="Helpful"
            onClick={() => onRate("up")}
          >
            <ThumbsUp size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-pressed={m.rating === "down"}
            aria-label="Not helpful"
            onClick={() => onRate("down")}
          >
            <ThumbsDown size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {m.sources.length > 0 && (
            <button
              type="button"
              className={cn(iconButtonClass, "narrow:inline-flex hidden")}
              onClick={() => onOpenSource(1)}
            >
              Sources ({m.sources.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
