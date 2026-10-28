"use client";

import { useLayoutEffect, useState } from "react";
import { Moon } from "lucide-react";
import { applyTheme, currentTheme, readSavedTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Re-apply the saved theme (React's dev remount clears it) and sync the label.
  useLayoutEffect(() => {
    const saved = readSavedTheme();
    if (saved) document.documentElement.dataset.theme = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- theme is only known in the browser
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "border-line text-ink-2 flex items-center gap-2 rounded-md border bg-transparent px-2.5 py-[7px] text-[13px]",
        className,
      )}
    >
      <Moon size={15} strokeWidth={1.8} aria-hidden="true" />
      <span suppressHydrationWarning>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
