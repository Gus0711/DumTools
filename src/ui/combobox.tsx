"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface ComboOption {
  value: string;
  tag?: string;
  /** Option « spéciale » (ex. saisie libre) toujours affichée en tête. */
  special?: boolean;
  label?: string;
}

/** Position calculée de la liste flottante (coordonnées viewport, `fixed`).
 *  Ancrée par le haut (ouverture vers le bas) ou par le bas (vers le haut) —
 *  ainsi la liste reste collée à l'input quel que soit son nombre d'options. */
type Coords = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

/** Combobox à saisie libre + autocomplétion clavier/souris. */
export function Combobox({
  value,
  onInput,
  onPick,
  options,
  placeholder,
  className,
  inputClassName,
  autoFocus,
  onInputKeyDown,
}: {
  value: string;
  onInput: (v: string) => void;
  onPick: (opt: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** Handler clavier additionnel sur l'input (ex. Tab → nouveau point). */
  onInputKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [coords, setCoords] = useState<Coords | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const f = value.toLowerCase().trim();
    return options.filter((o) => o.special || o.value.toLowerCase().includes(f));
  }, [options, value]);

  // La liste est rendue dans un portail (document.body) en position fixe, pour
  // passer AU-DESSUS de tout et ne jamais étendre un conteneur à défilement.
  // On recalcule sa position à chaque ouverture, puis sur scroll / resize.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(256, (openUp ? spaceAbove : spaceBelow) - 12);
      const width = Math.max(r.width, 208);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setCoords(
        openUp
          ? { bottom: window.innerHeight - r.top + gap, left, width, maxHeight }
          : { top: r.bottom + gap, left, width, maxHeight },
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, filtered.length]);

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
    onInputKeyDown?.(e);
  }

  const showList = open && filtered.length > 0 && coords;

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
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
      {showList &&
        createPortal(
          <div
            className="fixed z-[100] overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg"
            style={{
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
