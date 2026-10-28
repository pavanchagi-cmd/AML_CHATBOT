"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useReadyCount } from "@/lib/library-events";
import { cn } from "@/lib/utils";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const NAV = [
  {
    href: "/ask",
    label: "Ask",
    icon: (
      <svg {...iconProps}>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
    ),
  },
  {
    href: "/library",
    label: "Library",
    icon: (
      <svg {...iconProps}>
        <path d="M4 5h6v14H4zM14 5l5 1.2-3 13.6-5-1.2z" />
      </svg>
    ),
  },
  {
    href: "/insights",
    label: "Insights",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
] as const;

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="flex-none">
      <circle cx="15" cy="15" r="13" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M15 6 L18.5 15 L15 24 L11.5 15 Z" fill="var(--accent)" />
      <circle cx="15" cy="15" r="2" fill="var(--surface)" />
    </svg>
  );
}

export function Rail() {
  const pathname = usePathname();
  // Number of ready documents; hidden until it is known.
  const readyCount = useReadyCount();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "border-line bg-surface flex min-h-0 flex-col gap-[22px] border-r px-3.5 py-5",
        "mobile:order-2 mobile:flex-row mobile:gap-0 mobile:border-t mobile:border-r-0 mobile:px-2 mobile:py-1.5",
      )}
    >
      <div className="mobile:hidden flex items-center gap-2.5 px-1.5">
        <Logo />
        <div>
          <b className="text-[17px] font-semibold tracking-[-0.01em]">AML Compass</b>
          <small className="text-ink-2 block text-xs leading-[1.2]">Analyst training library</small>
        </div>
      </div>

      <div className="mobile:flex-1 mobile:flex-row mobile:justify-around flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-ink-2 flex items-center gap-2.5 rounded-md px-2.5 py-[9px] font-medium no-underline",
                "hover:bg-surface-2 hover:text-ink",
                "aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent",
                "mobile:flex-col mobile:gap-0.5 mobile:px-2.5 mobile:py-1.5 mobile:text-[11.5px]",
              )}
            >
              {item.icon}
              {item.label}
              {item.href === "/library" && readyCount !== undefined && (
                <span className="text-ink-2 mobile:hidden ml-auto text-xs font-normal">{readyCount}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mobile:hidden mt-auto flex flex-col gap-3">
        <ThemeToggle />
      </div>
    </nav>
  );
}
