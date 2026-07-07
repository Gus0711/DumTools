"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export interface ComboOption {
  value: string;
  tag?: string;
  /** Option « spéciale » (ex. saisie libre) toujours affichée en tête. */
  special?: boolean;
  label?: string;
}

/** Combobox à saisie libre + autocomplétion clavier/souris. */
export function Combobox({
  value,
  onInput,
  onPick,
  options,
  placeholder,
  className,
  inputClassName,
}: {
  value: string;
  onInput: (v: string) => void;
  onPick: (opt: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const filtered = useMemo(() => {
    const f = value.toLowerCase().trim();
    return options.filter((o) => o.special || o.value.toLowerCase().includes(f));
  }, [options, value]);

  function pick(o: ComboOption) {
    onPick(o);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onInput(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle",
          inputClassName,
        )}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-52 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg">
          {filtered.map((o, i) => (
            <button
              type="button"
              key={o.value + i}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-sm",
                i === active ? "bg-brand-soft text-brand" : "text-fg",
                o.special && "text-muted italic",
              )}
            >
              <span className="truncate">{o.label ?? o.value}</span>
              {o.tag && (
                <span className="shrink-0 text-xs text-subtle">{o.tag}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
