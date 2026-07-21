"use client";

import { useEffect } from "react";

/**
 * Gestion du service worker `/sw.js`.
 *
 * ⚠️ **Uniquement en PRODUCTION.** En dev, un SW qui met en cache les chunks
 * Turbopack (dont les noms changent à chaque HMR/rebuild) provoque des
 * `ChunkLoadError` → React ne s'hydrate plus → plus rien ne réagit (menu, onglets).
 * On l'a appris à nos dépens : en dev on **désenregistre** tout SW existant et on
 * **purge les caches** pour réparer les navigateurs déjà pollués.
 *
 * Rappel : un SW exige un contexte sécurisé (HTTPS ou localhost) — le vrai test
 * PWA se fait donc via Caddy/HTTPS, pas sur le LAN en http.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";

    if (!isProd) {
      // Dev : auto-réparation — retire tout SW et vide les caches. Si un SW
      // contrôlait déjà la page (chunks potentiellement périmés), on recharge
      // UNE fois (garde sessionStorage) pour repartir sur une page propre.
      const hadController = !!navigator.serviceWorker.controller;
      Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister()))),
        typeof caches !== "undefined"
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve(),
      ]).then(() => {
        const KEY = "dumtools-sw-cleaned";
        if (hadController && !sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, "1");
          window.location.reload();
        }
      });
      return;
    }

    if (!window.isSecureContext) return; // http → le SW ne s'enregistrerait pas.

    // Mise en cache PROACTIVE des pages clés : le tout premier chargement d'une
    // page n'est pas intercepté par le SW → sans ça, rouvrir l'app hors-ligne
    // après une seule visite affiche « site inaccessible ».
    const cachePages = () => {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({
            type: "CACHE_PAGES",
            urls: [
              window.location.pathname,
              "/",
              "/outils/visites",
              "/outils/visites/terrain",
            ],
          });
        })
        .catch(() => {});
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => {
        cachePages();
        // Un SW mis à jour prend le contrôle en cours de visite (skipWaiting +
        // claim) : re-poster au nouveau, l'ancien a pu ignorer le message.
        navigator.serviceWorker.addEventListener("controllerchange", cachePages);
      })
      .catch(() => {
        /* best-effort : ne bloque jamais l'app */
      });
  }, []);
  return null;
}
