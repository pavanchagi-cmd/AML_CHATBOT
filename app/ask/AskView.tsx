"use client";

import { useRef, useState } from "react";
import { Composer } from "@/components/Composer";
import { SourcesPanel } from "@/components/SourcesPanel";
import { Thread, type Selection } from "@/components/Thread";
import { useToast } from "@/components/Toast";
import { CATEGORIES, TopBar, buttonClass, selectClass } from "@/components/ui";
import type { BotMessage, ChatMessage, Rating } from "@/lib/types";

const newId = () => Math.random().toString(36).slice(2, 10);

export function AskView() {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scope, setScope] = useState("all");
  const [selection, setSelection] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const selectedMessage = selection
    ? (messages.find((m) => m.id === selection.messageId && m.role === "bot") as BotMessage | undefined)
    : undefined;

  function scrollToEnd() {
    requestAnimationFrame(() => {
      const t = threadRef.current;
      if (t) t.scrollTop = t.scrollHeight;
    });
  }

  function ask(q: string) {
    if (busy) return;
    // The chat pipeline (Gemini + Pinecone) is wired up in build step 5.
    setMessages((ms) => [
      ...ms,
      { id: newId(), role: "user", text: q },
      {
        id: newId(),
        role: "bot",
        status: "error",
        text: "",
        sources: [],
        error: "Answers aren't connected yet. They arrive in build step 5.",
      },
    ]);
    setSelection(null);
    scrollToEnd();
  }

  function openSource(messageId: string, n: number) {
    setSelection({ messageId, n });
    if (matchMedia("(max-width: 1100px)").matches) setDrawerOpen(true);
  }

  async function copy(messageId: string) {
    const m = messages.find((x) => x.id === messageId);
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.text.replace(/\s*\[\d+(?:,\s*\d+)*\]/g, ""));
      toast("Answer copied");
    } catch {
      toast("Copying isn’t allowed here. Select the text instead.");
    }
  }

  function rate(messageId: string, rating: Rating) {
    const current = messages.find((m) => m.id === messageId);
    if (!current || current.role !== "bot") return;
    const next = current.rating === rating ? null : rating;
    setMessages((ms) => ms.map((m) => (m.id === messageId && m.role === "bot" ? { ...m, rating: next } : m)));
    toast(next ? "Feedback saved" : "Feedback removed");
  }

  function newChat() {
    if (busy) return;
    setMessages([]);
    setSelection(null);
    setDrawerOpen(false);
  }

  return (
    <section aria-label="Ask" className="flex min-h-0 flex-1 flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title="Ask the library">
          <label className="text-ink-2 text-[13px]" htmlFor="scope">
            Search in
          </label>
          <select id="scope" className={selectClass} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">All sources</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button type="button" className={buttonClass()} onClick={newChat}>
            New chat
          </button>
        </TopBar>
        <Thread
          ref={threadRef}
          messages={messages}
          selection={selection}
          onSuggest={ask}
          onOpenSource={openSource}
          onCopy={copy}
          onRate={rate}
        />
        <Composer busy={busy} onSend={ask} />
      </div>
      <SourcesPanel
        sources={selectedMessage?.sources ?? null}
        selectedN={selection?.n ?? null}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </section>
  );
}
