import type { Metadata } from "next";
import { LibraryView } from "./LibraryView";

export const metadata: Metadata = { title: "Library · AML Compass" };

export default function LibraryPage() {
  return (
    <section aria-label="Library" className="flex min-h-0 flex-1 flex-col">
      <LibraryView />
    </section>
  );
}
