import type { Metadata } from "next";
import { InsightsView } from "./InsightsView";

export const metadata: Metadata = { title: "Insights · AML Compass" };

export default function InsightsPage() {
  return (
    <section aria-label="Insights" className="flex min-h-0 flex-1 flex-col">
      <InsightsView />
    </section>
  );
}
