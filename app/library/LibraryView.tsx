"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useState } from "react";
import { DocumentsTable } from "@/components/DocumentsTable";
import { PipelineProgress, type PipelineState } from "@/components/PipelineProgress";
import { SetupCheck } from "@/components/SetupCheck";
import { useToast } from "@/components/Toast";
import { UploadZone, checkFile } from "@/components/UploadZone";
import { Lead, Page, PageInner, Panel, TopBar, buttonClass, iconButtonClass } from "@/components/ui";
import { ADMIN_HEADER, ADMIN_STORAGE_KEY } from "@/lib/admin-header";
import { apiError } from "@/lib/api-client";
import type { Category } from "@/lib/categories";
import { STAGE_KEYS, type IngestEvent } from "@/lib/ingest-events";
import { readNdjson } from "@/lib/ndjson";
import { announceDocuments } from "@/lib/library-events";
import type { DocumentDto } from "@/lib/types";

const LIST_ERROR = "The library is unavailable right now. Try again in a minute.";

function readPasscode() {
  try {
    return sessionStorage.getItem(ADMIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function savePasscode(value: string | null) {
  try {
    if (value) sessionStorage.setItem(ADMIN_STORAGE_KEY, value);
    else sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch {
    // Storage blocked: the passcode lasts until the page is closed.
  }
}

// The Blob client only reports "Failed to retrieve the client token", so ask the token route
// directly for its reason (a token request uploads nothing).
async function explainUploadFailure(err: unknown, fileName: string, code: string): Promise<string> {
  const fallback = "The upload didn't go through. Check your connection and try again.";
  try {
    const res = await fetch("/api/blob", {
      method: "POST",
      headers: { "content-type": "application/json", [ADMIN_HEADER]: code },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: { pathname: `documents/${fileName}`, clientPayload: null, multipart: false },
      }),
    });
    if (!res.ok) return (await apiError(res, fallback)).message;
  } catch {
    return fallback;
  }
  // The token route works, so the transfer itself failed.
  const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
  return `The upload to file storage failed${detail}. Try again; if it keeps failing, run the Setup check.`;
}

function PasscodePrompt({ onUnlock, onCancel }: { onUnlock: (passcode: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/verify", { method: "POST", headers: { [ADMIN_HEADER]: value } });
      if (res.ok) onUnlock(value);
      else if (res.status === 401) setError("That passcode isn't right.");
      else setError((await apiError(res, LIST_ERROR)).message);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <h3 className="m-0 mb-1 text-[15px] font-semibold">Admin passcode</h3>
          <Lead className="text-sm">Enter the admin passcode to upload, delete or re-index documents.</Lead>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            aria-label="Admin passcode"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border-line bg-surface min-w-0 flex-1 rounded-md border px-2.5 py-[7px] text-sm"
          />
          <button type="submit" className={buttonClass("primary")} disabled={checking || !value}>
            {checking ? "Checking…" : "Unlock"}
          </button>
          <button type="button" className={buttonClass()} onClick={onCancel}>
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="text-danger m-0 text-[13px]">
            {error}
          </p>
        )}
      </form>
    </Panel>
  );
}

export function LibraryView() {
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentDto[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [prompting, setPrompting] = useState(false);
  const [pending, setPending] = useState<{ file: File; category: Category } | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      if (!res.ok) throw await apiError(res, LIST_ERROR);
      const list = (await res.json()) as DocumentDto[];
      setDocs(list);
      setListError(null);
      announceDocuments(list);
    } catch (err) {
      setListError(err instanceof Error && err.message ? err.message : LIST_ERROR);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser
    setPasscode(readPasscode());
    void refresh();
  }, [refresh]);

  function lock(message?: string) {
    savePasscode(null);
    setPasscode(null);
    if (message) toast(message);
  }

  // Drives the progress bar from the server's stage events until "ready" or "error".
  async function followPipeline(res: Response, name: string) {
    if (!res.ok) {
      const err = await apiError(res, "Indexing couldn't start. Try again in a minute.");
      if (res.status === 401) lock();
      setPipeline((p) => ({ name, stage: p?.stage ?? 1, message: err.message, error: true }));
      return;
    }
    let stage = 1;
    let refreshed = false;
    await readNdjson<IngestEvent>(res, (event) => {
      if ("stage" in event) {
        stage = STAGE_KEYS.indexOf(event.stage);
        setPipeline({ name, stage, message: event.message });
        // The row exists once the server has started; show it as Processing.
        if (!refreshed) {
          refreshed = true;
          void refresh();
        }
      } else if (event.type === "error") {
        setPipeline({ name, stage, message: event.message, error: true });
      }
    });
    await refresh();
  }

  async function uploadAndIngest(file: File, category: Category, code: string) {
    setBusy(true);
    setPipeline({ name: file.name, stage: 0, message: "Reading the file…" });
    try {
      let blobUrl: string;
      try {
        const blob = await upload(`documents/${file.name}`, file, {
          access: "private",
          handleUploadUrl: "/api/blob",
          headers: { [ADMIN_HEADER]: code },
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) =>
            setPipeline({ name: file.name, stage: 0, message: `Uploading… ${Math.round(percentage)}%` }),
        });
        blobUrl = blob.url;
      } catch (err) {
        setPipeline({
          name: file.name,
          stage: 0,
          message: await explainUploadFailure(err, file.name, code),
          error: true,
        });
        return;
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json", [ADMIN_HEADER]: code },
        body: JSON.stringify({ blobUrl, fileName: file.name, category }),
      });
      await followPipeline(res, file.name);
    } catch {
      setPipeline((p) => ({
        name: file.name,
        stage: p?.stage ?? 1,
        message: "Lost the connection while indexing. Refresh the list to see whether it finished.",
        error: true,
      }));
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleFile(file: File, category: Category) {
    const problem = checkFile(file);
    if (problem) {
      setPipeline({ name: file.name, stage: 0, message: problem, error: true });
      return;
    }
    if (!passcode) {
      setPending({ file, category });
      setPrompting(true);
      return;
    }
    void uploadAndIngest(file, category, passcode);
  }

  function unlock(code: string) {
    savePasscode(code);
    setPasscode(code);
    setPrompting(false);
    if (pending) {
      const { file, category } = pending;
      setPending(null);
      void uploadAndIngest(file, category, code);
    }
  }

  async function remove(doc: DocumentDto) {
    if (!passcode || busy) return;
    if (!confirm(`Delete “${doc.title}” and its ${doc.chunkCount} chunks from the index?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, {
        method: "DELETE",
        headers: { [ADMIN_HEADER]: passcode },
      });
      if (res.status === 401) lock("Enter the admin passcode again.");
      else if (!res.ok) toast((await apiError(res, "Couldn't delete the document. Try again.")).message);
      else toast("Document deleted");
    } catch {
      toast("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function reindex(doc: DocumentDto) {
    if (!passcode || busy) return;
    setBusy(true);
    setPipeline({ name: doc.title, stage: 1, message: "Removing the old chunks…" });
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/reindex`, {
        method: "POST",
        headers: { [ADMIN_HEADER]: passcode },
      });
      await followPipeline(res, doc.title);
    } catch {
      setPipeline((p) => ({
        name: doc.title,
        stage: p?.stage ?? 1,
        message: "Lost the connection while indexing. Refresh the list to see whether it finished.",
        error: true,
      }));
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <TopBar title="Library">
        {passcode ? (
          <button type="button" className={iconButtonClass} onClick={() => lock("Admin actions locked")}>
            Lock admin actions
          </button>
        ) : (
          !prompting && (
            <button type="button" className={buttonClass()} onClick={() => setPrompting(true)}>
              Admin sign-in
            </button>
          )
        )}
      </TopBar>
      <PageInner>
        <Lead>
          Upload FATF reports, Indian AML rules or internal SOPs. Each file is split into overlapping chunks and
          indexed, so analysts can ask questions about it straight away.
        </Lead>
        {prompting && (
          <PasscodePrompt
            onUnlock={unlock}
            onCancel={() => {
              setPrompting(false);
              setPending(null);
            }}
          />
        )}
        {passcode && <SetupCheck passcode={passcode} onUnauthorized={() => lock("Enter the admin passcode again.")} />}
        <UploadZone onFile={handleFile} disabled={busy} />
        {pipeline && <PipelineProgress state={pipeline} />}
        {listError ? (
          <div role="alert" className="border-line bg-surface text-danger rounded-2xl border px-4 py-3 text-sm">
            {listError}
          </div>
        ) : docs === null ? (
          <div className="border-line bg-surface text-ink-2 rounded-2xl border px-4 py-3 text-sm">
            Loading documents…
          </div>
        ) : (
          <DocumentsTable docs={docs} isAdmin={!!passcode && !busy} onDelete={remove} onReindex={reindex} />
        )}
      </PageInner>
    </Page>
  );
}
