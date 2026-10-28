"use client";

import { useLayoutEffect, useRef, useState } from "react";

export function Composer({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to 160 px, like the prototype.
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function send() {
    const q = value.trim();
    if (!q || busy) return;
    onSend(q);
    setValue("");
  }

  return (
    <div className="border-line bg-bg mobile:px-3 mobile:pt-2.5 mobile:pb-3 border-t px-7 pt-3.5 pb-[18px]">
      <div className="border-line bg-surface shadow-card focus-within:border-accent mx-auto flex max-w-[740px] items-end gap-2 rounded-[14px] border py-2 pr-2 pl-3.5">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about a pattern, red flag or procedure…"
          aria-label="Your question"
          className="max-h-40 flex-1 resize-none border-0 bg-transparent py-1.5 leading-[1.45] outline-none focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !value.trim()}
          aria-label="Send question"
          className="bg-accent text-accent-ink grid h-[38px] w-[38px] flex-none place-items-center rounded-lg border-0 disabled:cursor-default disabled:opacity-40"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="text-ink-2 mx-auto mt-2 max-w-[740px] text-xs">
        Answers come only from documents in your library. Don&apos;t paste customer details.
      </div>
    </div>
  );
}
