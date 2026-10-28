"use client";

import { useRef, useState } from "react";
import { Composer } from "@/components/Composer";
import { SourcesPanel } from "@/components/SourcesPanel";
import { Thread, type Selection } from "@/components/Thread";
import { useToast } from "@/components/Toast";
import { CATEGORIES, TopBar, buttonClass, selectClass } from "@/components/ui";
import { apiError } from "@/lib/api-client";
import type { ChatEvent } from "@/lib/chat-events";
import { copyText, stripAllCitations } from "@/lib/citations";
import { useReadyCount } from "@/lib/library-events";
import { readNdjson } from "@/lib/ndjson";
import type { BotMessage, ChatMessage, Rating } from "@/lib/types";

const newId = () => crypto.randomUUID();
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const CUT_OFF = "The answer was cut off. Try asking again.";

// Questions and answers already completed, for follow-up questions (the server uses the last few).
function historyFrom(messages: ChatMessage[]) {
  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const q = messages[i];
    const a = messages[i + 1];
    if (q.role === "user" && a.role === "bot" && a.status === "done") {
      out.push({ role: "user", text: q.text }, { role: "assistant", text: stripAllCitations(a.text) });
    }
  }
  return out.slice(-6);
}

export function AskView() {
  const toast = useToast();
  const readyCount = useReadyCount();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scope, setScope] = useState("all");
  const [selection, setSelection] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const selectedMessage = selection
    ? (messages.find((m) => m.id === selection.messageId && m.role === "bot") as BotMessage | undefined)
    : undefined;

  function scrollToEnd(onlyIfNear = false) {
    requestAnimationFrame(() => {
      const t = threadRef.current;
      if (!t) return;
      if (!onlyIfNear || t.scrollHeight - t.scrollTop - t.clientHeight < 240) t.scrollTop = t.scrollHeight;
    });
  }

  function updateBot(id: string, change: (m: BotMessage) => Partial<BotMessage>) {
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === "bot" ? { ...m, ...change(m) } : m)));
  }

  async function ask(question: string) {
    if (busy) return;
    const botId = newId();
    const history = historyFrom(messages);
    setMessages((ms) => [
      ...ms,
      { id: newId(), role: "user", text: question },
      {
        id: botId,
        role: "bot",
        question,
        scope,
        status: "thinking",
        phase: "Searching the library",
        text: "",
        sources: [],
      },
    ]);
    setBusy(true);
    setSelection(null);
    scrollToEnd();

    let finished = false;
    let sourceCount = 0;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, scope, history }),
      });
      if (!res.ok) {
        const err = await apiError(res, OFFLINE);
        updateBot(botId, () => ({ status: "error", error: err.message }));
        finished = true;
        return;
      }
      await readNdjson<ChatEvent>(res, (event) => {
        switch (event.type) {
          case "sources":
            sourceCount = event.sources.length;
            updateBot(botId, () => ({
              status: "streaming",
              sources: event.sources,
              phase: `Reading ${sourceCount} passage${sourceCount === 1 ? "" : "s"}`,
            }));
            break;
          case "delta":
            updateBot(botId, (m) => ({ status: "streaming", text: m.text + event.text }));
            scrollToEnd(true);
            break;
          case "done":
            finished = true;
            updateBot(botId, () => ({ status: "done", questionId: event.questionId }));
            break;
          case "notfound":
            finished = true;
            sourceCount = 0;
            updateBot(botId, () => ({ status: "notfound", sources: [], questionId: event.questionId }));
            break;
          case "error":
            finished = true;
            updateBot(botId, () => ({ status: "error", error: event.message }));
            break;
        }
      });
      if (!finished) updateBot(botId, () => ({ status: "error", error: CUT_OFF }));
    } catch {
      if (!finished) updateBot(botId, () => ({ status: "error", error: OFFLINE }));
    } finally {
      setBusy(false);
      // Like the prototype, the Sources panel shows the passages of the latest answer.
      if (sourceCount > 0) setSelection({ messageId: botId, n: 1 });
      scrollToEnd(true);
    }
  }

  function openSource(messageId: string, n: number) {
    setSelection({ messageId, n });
    if (matchMedia("(max-width: 1100px)").matches) setDrawerOpen(true);
  }

  // Source tab n: show passage n, and rewrite the answer briefly from passages 1..n (tab 1 = original answer).
  async function selectTab(messageId: string, n: number) {
    openSource(messageId, n);
    const m = messages.find((x) => x.id === messageId);
    if (!m || m.role !== "bot" || m.status !== "done" || busy || m.rewriting) return;
    const original = m.original ?? m.text;
    if (n === 1 || n > m.sources.length) {
      updateBot(messageId, () => ({ text: original, upTo: undefined, rewriteError: undefined }));
      return;
    }
    const saved = m.versions?.[n];
    if (saved) {
      updateBot(messageId, () => ({ text: saved, upTo: n, rewriteError: undefined }));
      return;
    }

    const shown = { text: m.text, upTo: m.upTo };
    const restore = (error: string) =>
      updateBot(messageId, () => ({ ...shown, rewriting: undefined, rewriteError: error }));
    updateBot(messageId, () => ({ original, rewriting: n, rewriteError: undefined }));
    setBusy(true);
    let text = "";
    let finished = false;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: m.question, scope: m.scope ?? "all", history: [], upTo: n }),
      });
      if (!res.ok) {
        restore((await apiError(res, OFFLINE)).message);
        finished = true;
        return;
      }
      await readNdjson<ChatEvent>(res, (event) => {
        if (event.type === "delta") {
          text += event.text;
          updateBot(messageId, () => ({ text, upTo: n, rewriting: undefined }));
          scrollToEnd(true);
        } else if (event.type === "done") {
          finished = true;
          const done = text;
          updateBot(messageId, (cur) => ({ versions: { ...cur.versions, [n]: done } }));
        } else if (event.type === "notfound") {
          finished = true;
          restore(`Passages 1–${n} don't add anything to this answer.`);
        } else if (event.type === "error") {
          finished = true;
          restore(event.message);
        }
      });
      if (!finished) restore(CUT_OFF);
    } catch {
      if (!finished) restore(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  async function copy(messageId: string) {
    const m = messages.find((x) => x.id === messageId);
    if (!m) return;
    try {
      await navigator.clipboard.writeText(copyText(m.text));
      toast("Answer copied");
    } catch {
      toast("Copying isn’t allowed here. Select the text instead.");
    }
  }

  async function rate(messageId: string, rating: Rating) {
    const current = messages.find((m) => m.id === messageId);
    if (!current || current.role !== "bot") return;
    if (!current.questionId) {
      toast("Feedback can't be saved for this answer.");
      return;
    }
    const previous = current.rating ?? null;
    const next = previous === rating ? null : rating;
    updateBot(messageId, () => ({ rating: next }));
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: current.questionId, rating: next }),
      });
      if (!res.ok) throw await apiError(res, "Couldn't save your feedback. Try again.");
      toast(next ? "Feedback saved" : "Feedback removed");
    } catch (err) {
      updateBot(messageId, () => ({ rating: previous }));
      toast(err instanceof Error && err.message ? err.message : "Couldn't save your feedback. Try again.");
    }
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
          libraryEmpty={readyCount === 0}
          onSuggest={ask}
          onOpenSource={openSource}
          onSelectTab={selectTab}
          onCopy={copy}
          onRate={rate}
        />
        <Composer busy={busy} onSend={ask} />
      </div>
      <SourcesPanel
        sources={selectedMessage?.sources ?? null}
        question={selectedMessage?.question ?? ""}
        selectedN={selection?.n ?? null}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </section>
  );
}
