"use client";

import { cn } from "@/lib/utils";
import { Lead, Panel, TableWrap, formatDate, tdClass, thClass } from "@/components/ui";

// Shape of GET /api/insights (spec section 8).
export type InsightsData = {
  total: number;
  answered: number;
  notFound: number;
  helpfulRate: number | null;
  topTopics: { section: string; count: number }[];
  gaps: { id: string; question: string; reason: "notfound" | "unhelpful"; createdAt: string }[];
};

export const EMPTY_INSIGHTS: InsightsData = {
  total: 0,
  answered: 0,
  notFound: 0,
  helpfulRate: null,
  topTopics: [],
  gaps: [],
};

export function KpiTiles({ data }: { data: InsightsData }) {
  const tiles = [
    [String(data.total), "Questions asked"],
    [`${data.total ? Math.round((data.answered / data.total) * 100) : 0}%`, "Answered from library"],
    [String(data.notFound), "Not found"],
    [data.helpfulRate === null ? "–" : `${Math.round(data.helpfulRate * 100)}%`, "Rated helpful"],
  ];
  return (
    <div className="mobile:grid-cols-2 grid grid-cols-4 gap-3">
      {tiles.map(([v, l]) => (
        <div key={l} className="border-line bg-surface rounded-xl border px-[18px] py-4">
          <div className="font-serif text-[28px] leading-[1.1] font-semibold">{v}</div>
          <div className="text-ink-2 mt-1 text-[13px]">{l}</div>
        </div>
      ))}
    </div>
  );
}

export function TopicBars({ topics }: { topics: InsightsData["topTopics"] }) {
  const top = topics.slice(0, 6);
  const max = top.length ? top[0].count : 1;
  return (
    <Panel>
      <h3 className="m-0 mb-1 text-[15px] font-semibold">Most asked topics</h3>
      <Lead className="mb-3.5 text-[13.5px]">Sections that answered the most questions.</Lead>
      <div className="flex flex-col gap-2.5">
        {top.length ? (
          top.map((t) => (
            <div key={t.section} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 text-[13.5px]">
              <span>{t.section}</span>
              <span className="text-ink-2">{t.count}</span>
              <i className="bg-surface-2 relative col-span-full h-1.5 overflow-hidden rounded-[3px]">
                <span
                  className="bg-accent absolute inset-y-0 left-0 rounded-[3px]"
                  style={{ width: `${(t.count / max) * 100}%` }}
                />
              </i>
            </div>
          ))
        ) : (
          <span className="text-ink-2">No answered questions yet.</span>
        )}
      </div>
    </Panel>
  );
}

export function GapsTable({ gaps }: { gaps: InsightsData["gaps"] }) {
  return (
    <Panel>
      <h3 className="m-0 mb-1 text-[15px] font-semibold">Gaps to review</h3>
      <Lead className="mb-3.5 text-[13.5px]">Questions the library couldn’t answer, or answers marked unhelpful.</Lead>
      <TableWrap className="rounded-none border-0">
        <thead>
          <tr>
            <th className={thClass}>Question</th>
            <th className={thClass}>Reason</th>
            <th className={thClass}>Date</th>
          </tr>
        </thead>
        <tbody>
          {gaps.length ? (
            gaps.map((g) => (
              <tr key={g.id}>
                <td className={tdClass}>{g.question}</td>
                <td className={tdClass}>
                  <span
                    className={cn(
                      "rounded-full px-[9px] py-0.5 text-xs whitespace-nowrap",
                      g.reason === "notfound" ? "bg-amber-soft text-amber" : "bg-danger-soft text-danger",
                    )}
                  >
                    {g.reason === "notfound" ? "Not found" : "Marked unhelpful"}
                  </span>
                </td>
                <td className={cn(tdClass, "text-ink-2 whitespace-nowrap")}>{formatDate(g.createdAt)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className={cn(tdClass, "text-ink-2")}>
                No gaps so far.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </Panel>
  );
}
