"use client";

import { useSyncExternalStore } from "react";

/* Le thème de l'app vit dans un système externe (attribut data-theme +
 * localStorage, voir src/components/theme-toggle.tsx). BlockNote veut un
 * "light" | "dark" explicite → on l'observe avec useSyncExternalStore. */

const EVT = "dumtools-theme-change";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(EVT, onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVT, onChange);
    observer.disconnect();
  };
}

function getSnapshot(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Thème effectif de l'app, pour la prop `theme` de BlockNoteView. */
export function useThemeNote(): "light" | "dark" {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light");
}
