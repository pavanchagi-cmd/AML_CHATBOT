import { cn } from "@/lib/utils";

// Small building blocks shared by the three screens, styled like the prototype.

export { CATEGORIES, type Category } from "@/lib/categories";

export function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border-line bg-bg mobile:flex-wrap mobile:px-4 mobile:py-3 flex items-center gap-3 border-b px-7 py-4">
      <h1 className="m-0 text-lg font-semibold tracking-[-0.01em]">{title}</h1>
      {children && (
        <>
          <div className="flex-1" />
          {children}
        </>
      )}
    </div>
  );
}

export const selectClass = "rounded-md border border-line bg-surface px-2.5 py-[7px] text-sm";

export function buttonClass(variant: "default" | "primary" = "default") {
  return cn(
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-[7px] text-sm font-medium",
    variant === "primary"
      ? "border-accent bg-accent text-accent-ink hover:brightness-[1.07]"
      : "border-line bg-surface hover:border-ink-2",
  );
}

export const iconButtonClass = cn(
  "inline-flex items-center gap-[5px] rounded-sm border-0 bg-transparent px-[7px] py-[5px] text-[12.5px] text-ink-2",
  "hover:bg-surface-2 hover:text-ink aria-pressed:text-accent",
);

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>;
}

export function PageInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mobile:px-4 mobile:py-[18px] mx-auto flex w-full max-w-[1040px] flex-col gap-[22px] p-7">
      {children}
    </div>
  );
}

export function Lead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-ink-2 m-0 max-w-[70ch]", className)}>{children}</p>;
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-line bg-surface rounded-2xl border px-5 py-[18px]", className)}>{children}</div>;
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-line bg-surface relative overflow-x-auto rounded-2xl border", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export const thClass =
  "whitespace-nowrap border-b border-line px-4 py-[11px] text-left text-[12.5px] font-medium text-ink-2";
export const tdClass = "border-b border-line px-4 py-3 align-middle [tr:last-child>&]:border-b-0";

export function formatDate(value: string | number | Date) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
