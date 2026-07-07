"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";
const KEY = "dumtools-theme";
const EVT = "dumtools-theme-change";

/* Le thème vit dans un système externe (attribut data-theme + localStorage),
 * pas dans l'état React → useSyncExternalStore est le pattern adapté. */
function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(EVT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVT, onChange);
  };
}

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Bascule light/dark : n'écrit QUE l'attribut data-theme (étage sémantique). */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Changer de thème"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {theme === "dark" ? (
        <Sun className="h-4.5 w-4.5" />
      ) : (
        <Moon className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
