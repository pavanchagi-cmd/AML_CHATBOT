"use client";

import { useEffect, useState } from "react";
import { EMPTY_INSIGHTS, GapsTable, KpiTiles, TopicBars, type InsightsData } from "@/components/insights";
import { Lead, Page, PageInner, TopBar, selectClass } from "@/components/ui";
import { apiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const UNAVAILABLE = "Insights are unavailable right now. Try again in a minute.";

type Result = { days: Range; data: InsightsData } | { days: Range; error: string };

export function InsightsView() {
  const [days, setDays] = useState<Range>(30);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/insights?days=${days}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw await apiError(res, UNAVAILABLE);
        setResult({ days, data: (await res.json()) as InsightsData });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ days, error: err instanceof Error && err.message ? err.message : UNAVAILABLE });
      });
    return () => controller.abort();
  }, [days]);

  // While a new range loads, the previous figures stay on screen (dimmed) to avoid layout shift.
  const loading = result?.days !== days;
  const data = result && "data" in result ? result.data : EMPTY_INSIGHTS;
  const error = result && "error" in result && !loading ? result.error : null;

  return (
    <Page>
      <TopBar title="Insights">
        <label className="text-ink-2 text-[13px]" htmlFor="range">
          Show
        </label>
        <select
          id="range"
          className={selectClass}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) as Range)}
        >
          {RANGES.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </TopBar>
      <PageInner>
        <Lead>
          See what analysts ask, what the library can’t answer yet, and where answers fell short. Unanswered questions
          point to L1 training gaps or missing documents.
        </Lead>
        {error ? (
          <div role="alert" className="border-line bg-surface text-danger rounded-2xl border px-4 py-3 text-sm">
            {error}
          </div>
        ) : (
          !loading &&
          data.total === 0 && (
            <div className="bg-amber-soft border-amber-line text-ink rounded-lg border px-3 py-[9px] text-[13px]">
              No questions in the last {days} days. Figures appear here as soon as analysts start asking.
            </div>
          )
        )}
        <div
          aria-busy={loading}
          className={cn("flex flex-col gap-[22px] transition-opacity", loading && result && "opacity-60")}
        >
          <KpiTiles data={data} />
          <div className="mobile:grid-cols-1 grid grid-cols-[1fr_1.4fr] items-start gap-4">
            <TopicBars topics={data.topTopics} />
            <GapsTable gaps={data.gaps} />
          </div>
        </div>
      </PageInner>
    </Page>
  );
}
