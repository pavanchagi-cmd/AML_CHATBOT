"use client";

import { useState } from "react";
import { Lead, Panel, buttonClass } from "@/components/ui";
import { ADMIN_HEADER } from "@/lib/admin-header";
import { apiError } from "@/lib/api-client";
import type { Check, SetupAction, SetupReport } from "@/lib/setup-check-types";
import { cn } from "@/lib/utils";

const MARK = { ok: "✓", missing: "!", error: "✕" } as const;
const LABEL = { ok: "OK", missing: "Missing", error: "Problem" } as const;

const inputClass = "border-line bg-surface w-32 rounded-md border px-2.5 py-[7px] text-sm";

// One-click fix for a failing item: create the database tables, or create the Pinecone index.
function Fix({ action, onRun }: { action: SetupAction; onRun: (body: Record<string, string>) => Promise<void> }) {
  const [cloud, setCloud] = useState("aws");
  const [region, setRegion] = useState("us-east-1");
  const [busy, setBusy] = useState(false);

  async function go(body: Record<string, string>) {
    setBusy(true);
    try {
      await onRun(body);
    } finally {
      setBusy(false);
    }
  }

  if (action === "migrate") {
    return (
      <button
        type="button"
        className={cn(buttonClass("primary"), "mt-2")}
        disabled={busy}
        onClick={() => go({ action })}
      >
        {busy ? "Creating tables…" : "Create database tables"}
      </button>
    );
  }
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void go({ action, cloud, region });
      }}
    >
      <label className="text-ink-2 flex flex-col gap-1 text-xs">
        Cloud
        <input className={inputClass} value={cloud} onChange={(e) => setCloud(e.target.value)} required />
      </label>
      <label className="text-ink-2 flex flex-col gap-1 text-xs">
        Region
        <input className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)} required />
      </label>
      <button type="submit" className={buttonClass("primary")} disabled={busy}>
        {busy ? "Creating index (up to a few minutes)…" : "Create Pinecone index"}
      </button>
    </form>
  );
}

function Row({ check, onFix }: { check: Check; onFix: (body: Record<string, string>) => Promise<void> }) {
  return (
    <li className="border-line flex items-start gap-3 border-b py-2 text-sm last:border-b-0">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-xs font-semibold",
          check.status === "ok" && "bg-accent-soft text-accent",
          check.status === "missing" && "bg-amber-soft text-amber-ink",
          check.status === "error" && "bg-danger-soft text-danger",
        )}
      >
        {MARK[check.status]}
      </span>
      <div className="min-w-0">
        <div className="font-medium break-words">
          {check.name} <span className="sr-only">: {LABEL[check.status]}</span>
        </div>
        <div className="text-ink-2 break-words">{check.detail}</div>
        {check.action && <Fix action={check.action} onRun={onFix} />}
      </div>
    </li>
  );
}

export function SetupCheck({ passcode, onUnauthorized }: { passcode: string; onUnauthorized: () => void }) {
  const [report, setReport] = useState<SetupReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/status", { method: "POST", headers: { [ADMIN_HEADER]: passcode } });
      if (res.status === 401) return onUnauthorized();
      if (!res.ok) throw await apiError(res, "The setup check couldn't run. Try again.");
      setReport((await res.json()) as SetupReport);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The setup check couldn't run. Try again.");
    } finally {
      setRunning(false);
    }
  }

  async function runFix(body: Record<string, string>) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "content-type": "application/json", [ADMIN_HEADER]: passcode },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return onUnauthorized();
      if (!res.ok) throw await apiError(res, "That didn't work. Try again.");
      setNotice(((await res.json()) as { message: string }).message);
      await runCheck();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That didn't work. Try again.");
    }
  }

  const problems = report ? [...report.settings, ...report.services].filter((c) => c.status !== "ok").length : 0;

  return (
    <Panel>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 mb-1 text-[15px] font-semibold">Setup check</h3>
          <Lead className="text-sm">
            Checks which settings are missing and whether the database, Pinecone, Gemini and file storage respond.
            Secret values are never shown.
          </Lead>
        </div>
        <button type="button" className={buttonClass()} onClick={runCheck} disabled={running}>
          {running ? "Checking…" : report ? "Check again" : "Run setup check"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger m-0 mt-3 text-[13px]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-accent m-0 mt-3 text-[13px] font-medium">
          {notice}
        </p>
      )}
      {report && (
        <div className="mt-3 flex flex-col gap-4" aria-live="polite">
          <p className="m-0 text-sm">
            {problems === 0
              ? "Everything is set up. Upload documents and analysts can start asking questions."
              : `${problems} item${problems === 1 ? " needs" : "s need"} attention. After changing settings in Vercel, redeploy before checking again.`}{" "}
            <span className="text-ink-2">Environment: {report.environment}.</span>
          </p>
          <div>
            <h4 className="m-0 mb-1 text-[13px] font-semibold">Services</h4>
            <ul className="m-0 list-none p-0">
              {report.services.map((c) => (
                <Row key={c.name} check={c} onFix={runFix} />
              ))}
            </ul>
          </div>
          <div>
            <h4 className="m-0 mb-1 text-[13px] font-semibold">Settings</h4>
            <ul className="m-0 list-none p-0">
              {report.settings.map((c) => (
                <Row key={c.name} check={c} onFix={runFix} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}
