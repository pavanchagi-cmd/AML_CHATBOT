import { cn } from "@/lib/utils";

export const STAGES = ["Uploading", "Extracting text", "Chunking", "Embedding", "Indexing", "Ready"] as const;

export type PipelineState = { name: string; stage: number; message: string; error?: boolean };

export function PipelineProgress({ state }: { state: PipelineState }) {
  const { name, stage, message, error } = state;
  const ready = stage === STAGES.length - 1;

  return (
    <div
      className={cn("border-line bg-surface rounded-2xl border px-5 py-[18px]", error && "border-danger")}
      aria-live="polite"
    >
      <h3 className="m-0 mb-3 text-[15px] font-semibold">{name}</h3>
      <div className="mobile:grid-cols-3 grid grid-cols-6 gap-2">
        {STAGES.map((label, i) => {
          const done = i < stage || ready;
          const running = i === stage && !error && !ready;
          return (
            <div key={label} className={cn("text-ink-2 text-[12.5px]", (done || running) && "text-ink")}>
              <i
                className={cn("bg-surface-2 relative mb-1.5 block h-1 overflow-hidden rounded-xs", done && "bg-accent")}
              >
                {running && <span className="animate-stage bg-accent absolute inset-0 origin-left" />}
              </i>
              {label}
            </div>
          );
        })}
      </div>
      <div className={cn("text-ink-2 mt-3 text-[13px]", error && "text-danger")}>{message}</div>
    </div>
  );
}
