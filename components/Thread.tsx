"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { BotAnswer, UserBubble } from "@/components/Message";
import type { ChatMessage, Rating } from "@/lib/types";

export const SUGGESTIONS = [
  "What are the red flags of a money mule account?",
  "How do I spot structuring?",
  "When should L1 escalate an alert to L2?",
  "What is trade-based money laundering and what should I check?",
  "What are the red flags for NPO misuse?",
  "What should an L2 case narrative contain?",
] as const;

export type Selection = { messageId: string; n: number } | null;

type Props = {
  messages: ChatMessage[];
  selection: Selection;
  libraryEmpty: boolean;
  onSuggest: (q: string) => void;
  onOpenSource: (messageId: string, n: number) => void;
  onCopy: (messageId: string) => void;
  onRate: (messageId: string, rating: Rating) => void;
};

export const Thread = forwardRef<HTMLDivElement, Props>(function Thread(
  { messages, selection, libraryEmpty, onSuggest, onOpenSource, onCopy, onRate },
  ref,
) {
  return (
    <div ref={ref} className="mobile:px-4 mobile:py-[18px] flex-1 overflow-y-auto p-7">
      <div className="mx-auto flex max-w-[740px] flex-col gap-[26px]">
        {messages.length === 0 ? (
          <div>
            <h2 className="mobile:text-[25px] mt-6 mb-2 font-serif text-[30px] leading-[1.2] font-semibold tracking-[-0.01em]">
              What do you need to check?
            </h2>
            <p className="text-ink-2 m-0 mb-[22px] max-w-[56ch]">
              Ask about a money-laundering pattern, a red flag or a procedure. Answers come only from the documents in
              your library, with the source for each point.
            </p>
            {libraryEmpty && (
              <div className="bg-amber-soft border-amber-line text-ink mb-[22px] rounded-lg border px-3 py-[9px] text-[13px]">
                The library has no documents yet, so there is nothing to answer from.{" "}
                <Link href="/library" className="text-ink font-semibold underline">
                  Add documents in the Library
                </Link>{" "}
                first.
              </div>
            )}
            <div className="mobile:grid-cols-1 grid grid-cols-2 gap-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggest(s)}
                  className="border-line bg-surface hover:border-accent hover:text-accent rounded-lg border px-3.5 py-3 text-left text-sm leading-[1.4]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={m.id} text={m.text} />
            ) : (
              <BotAnswer
                key={m.id}
                message={m}
                selectedN={selection?.messageId === m.id ? selection.n : null}
                onOpenSource={(n) => onOpenSource(m.id, n)}
                onCopy={() => onCopy(m.id)}
                onRate={(r) => onRate(m.id, r)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
});
