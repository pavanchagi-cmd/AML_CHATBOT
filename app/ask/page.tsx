import { ThemeToggle } from "@/components/ThemeToggle";

// Step 1 placeholder: confirms fonts, tokens and theme. The full Ask screen comes in step 2.
export default function AskPage() {
  return (
    <main className="mx-auto flex max-w-[740px] flex-col gap-6 p-7">
      <h1 className="m-0 text-lg font-semibold tracking-[-0.01em]">Ask the library</h1>
      <h2 className="m-0 font-serif text-[30px] leading-[1.2] font-semibold tracking-[-0.01em]">
        What do you need to check?
      </h2>
      <p className="m-0 max-w-[56ch] text-ink-2">
        Ask about a money-laundering pattern, a red flag or a procedure. Answers come only from the documents in your
        library, with the source for each point.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["bg-accent", "bg-accent-soft", "bg-amber", "bg-amber-soft", "bg-danger", "bg-surface-2"] as const).map(
          (c) => (
            <span key={c} className={`h-8 w-8 rounded-md border border-line ${c}`} title={c} />
          ),
        )}
      </div>
      <ThemeToggle className="self-start" />
    </main>
  );
}
