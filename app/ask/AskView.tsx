"use client";

import { useRef, useState } from "react";
import { Composer } from "@/components/Composer";
import { SourcesPanel } from "@/components/SourcesPanel";
import { Thread, type Selection } from "@/components/Thread";
import { useToast } from "@/components/Toast";
import { CATEGORIES, TopBar, buttonClass, selectClass } from "@/components/ui";
import { apiError } from "@/lib/api-client";
import { breakdownRange, composeBreakdown, parseBreakdown, type Breakdown } from "@/lib/breakdown";
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
    let answered = false;
    let sourceCount = 0;
    let sources: BotMessage["sources"] = [];
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
            sources = event.sources;
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
            answered = true;
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
      // Get the per-passage breakdown ready in the background, so source tabs respond instantly.
      if (answered && sources.length > 1) {
        fetchBreakdown({ id: botId, role: "bot", question, scope, status: "done", text: "", sources }).promise.catch(
          () => {},
        );
      }
    }
  }

  function openSource(messageId: string, n: number) {
    setSelection({ messageId, n });
    if (matchMedia("(max-width: 1100px)").matches) setDrawerOpen(true);
  }

  // One background request per answer fetches a brief bullet for every passage; tab n then shows bullets 1..n.
  const breakdowns = useRef(new Map<string, { promise: Promise<Breakdown>; result?: Breakdown }>());

  function fetchBreakdown(m: BotMessage) {
    const cached = breakdowns.current.get(m.id);
    if (cached) return cached;
    const entry: { promise: Promise<Breakdown>; result?: Breakdown } = {
      promise: (async () => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: m.question, scope: m.scope ?? "all", history: [], upTo: m.sources.length }),
        });
        if (!res.ok) throw await apiError(res, OFFLINE);
        let text = "";
        let outcome: "done" | "notfound" | string | null = null;
        await readNdjson<ChatEvent>(res, (event) => {
          if (event.type === "delta") text += event.text;
          else if (event.type === "done") outcome = "done";
          else if (event.type === "notfound") outcome = "notfound";
          else if (event.type === "error") outcome = event.message;
        });
        if (outcome === "notfound") throw new Error("These passages don't add anything to this answer.");
        if (outcome !== "done") throw new Error(outcome ?? CUT_OFF);
        return parseBreakdown(text, m.sources.length);
      })(),
    };
    entry.promise.then(
      (result) => (entry.result = result),
      () => breakdowns.current.delete(m.id), // allow a retry on the next click
    );
    breakdowns.current.set(m.id, entry);
    return entry;
  }

  function showBreakdown(messageId: string, n: number, count: number, b: Breakdown) {
    updateBot(messageId, () => ({
      text: composeBreakdown(b, n),
      upTo: breakdownRange(b, n, count),
      rewriting: undefined,
    }));
  }

  // Source tab n: show passage n, and the brief points for passages 1..n (tab 1 = original answer).
  async function selectTab(messageId: string, n: number) {
    openSource(messageId, n);
    const m = messages.find((x) => x.id === messageId);
    if (!m || m.role !== "bot" || m.status !== "done") return;
    const original = m.original ?? m.text;
    if (n === 1 || n > m.sources.length) {
      updateBot(messageId, () => ({ text: original, upTo: undefined, rewriting: undefined, rewriteError: undefined }));
      return;
    }
    const entry = fetchBreakdown(m);
    if (entry.result) {
      updateBot(messageId, () => ({ original, rewriteError: undefined }));
      showBreakdown(messageId, n, m.sources.length, entry.result);
      return;
    }
    const shown = { text: m.text, upTo: m.upTo };
    updateBot(messageId, () => ({ original, rewriting: n, rewriteError: undefined }));
    try {
      const result = await entry.promise;
      // Only apply if the analyst hasn't picked another tab meanwhile.
      setMessages((ms) => {
        const cur = ms.find((x) => x.id === messageId);
        if (cur?.role === "bot" && cur.rewriting === n) {
          return ms.map((x) =>
            x.id === messageId && x.role === "bot"
              ? {
                  ...x,
                  text: composeBreakdown(result, n),
                  upTo: breakdownRange(result, n, m.sources.length),
                  rewriting: undefined,
                }
              : x,
          );
        }
        return ms;
      });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : OFFLINE;
      updateBot(messageId, () => ({ ...shown, rewriting: undefined, rewriteError: message }));
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
    breakdowns.current.clear();
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
