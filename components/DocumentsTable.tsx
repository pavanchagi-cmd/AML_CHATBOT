"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentDto } from "@/lib/types";
import { TableWrap, formatDate, iconButtonClass, tdClass, thClass } from "@/components/ui";

export type DocumentRow = DocumentDto;

function Status({ doc }: { doc: DocumentRow }) {
  const base =
    "inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] before:h-[7px] before:w-[7px] before:rounded-full before:content-['']";
  if (doc.status === "ready") return <span className={cn(base, "before:bg-accent")}>Ready</span>;
  if (doc.status === "processing") return <span className={cn(base, "before:bg-amber")}>Processing</span>;
  return (
    <span className={cn(base, "before:bg-danger")} title={doc.error ?? undefined}>
      Failed
    </span>
  );
}

export function DocumentsTable({
  docs,
  disabled,
  onDelete,
  onReindex,
}: {
  docs: DocumentRow[];
  disabled?: boolean;
  onDelete: (doc: DocumentRow) => void;
  onReindex: (doc: DocumentRow) => void;
}) {
  if (docs.length === 0)
    return (
      <div className="border-line bg-surface text-ink-2 rounded-2xl border px-4 py-3 text-sm">
        No documents yet. Add a file above to start building the library.
      </div>
    );

  return (
    <TableWrap>
      <thead>
        <tr>
          {["Document", "Category", "Pages", "Chunks", "Added", "Status"].map((h) => (
            <th key={h} className={thClass}>
              {h}
            </th>
          ))}
          <th className={thClass}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.id}>
            <td className={cn(tdClass, "font-medium")}>{d.title}</td>
            <td className={tdClass}>
              <span className="bg-surface-2 text-ink-2 inline-block rounded-full px-[9px] py-0.5 text-xs whitespace-nowrap">
                {d.category}
              </span>
            </td>
            <td className={tdClass}>{d.pageCount ?? <span className="text-ink-2">n/a</span>}</td>
            <td className={tdClass}>{d.chunkCount || <span className="text-ink-2">0</span>}</td>
            <td className={cn(tdClass, "text-ink-2")}>{formatDate(d.createdAt)}</td>
            <td className={tdClass}>
              <Status doc={d} />
            </td>
            <td className={cn(tdClass, "whitespace-nowrap")}>
              {d.status !== "processing" && (
                <>
                  <button
                    type="button"
                    className={iconButtonClass}
                    disabled={disabled}
                    aria-label={`Re-index ${d.title}`}
                    onClick={() => onReindex(d)}
                  >
                    Re-index
                  </button>
                  <button
                    type="button"
                    className={cn(iconButtonClass, "hover:text-danger")}
                    disabled={disabled}
                    aria-label={`Remove ${d.title}`}
                    onClick={() => onDelete(d)}
                  >
                    <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                    Remove
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
