"use client";

import { useState } from "react";
import { EMPTY_INSIGHTS, GapsTable, KpiTiles, TopicBars, type InsightsData } from "@/components/insights";
import { Lead, Page, PageInner, TopBar, selectClass } from "@/components/ui";

const RANGES = [7, 30, 90] as const;

export function InsightsView() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  // Aggregates come from GET /api/insights?days= once the question log exists (build step 6).
  const [data] = useState<InsightsData>(EMPTY_INSIGHTS);

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
          onChange={(e) => setDays(Number(e.target.value) as (typeof RANGES)[number])}
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
        <KpiTiles data={data} />
        <div className="mobile:grid-cols-1 grid grid-cols-[1fr_1.4fr] items-start gap-4">
          <TopicBars topics={data.topTopics} />
          <GapsTable gaps={data.gaps} />
        </div>
      </PageInner>
    </Page>
  );
}
