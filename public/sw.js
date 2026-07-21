/*
 * Service worker DumTools — hand-rolled (pas de Serwist : compat Next 16 non
 * validée, et on maîtrise ce qu'on met en cache).
 *
 * Doctrine PRUDENTE : ne JAMAIS servir du périmé en ligne.
 *  - Navigations (documents) : network-first, repli cache seulement hors-ligne.
 *  - Assets statiques immuables (_next/static, icône) : cache-first (hashés).
 *  - Tout le reste (server actions POST, /api, auth) : réseau direct, non caché.
 *
 * Mise en cache PROACTIVE des pages (message CACHE_PAGES) : le tout premier
 * chargement d'une page n'est pas intercepté par le SW (il ne contrôle la page
 * qu'après son activation) — sans ça, rouvrir l'app hors-ligne après un premier
 * et unique chargement affiche « site inaccessible ». Les pages clés (îlots
 * terrain) sont donc demandées et cachées explicitement par le client.
 *
 * ⚠️ Un service worker exige un CONTEXTE SÉCURISÉ (HTTPS ou localhost). Sur le
 * LAN en http://192.168.x, il ne s'enregistre pas : tester via Caddy/HTTPS.
 */

const VERSION = "v3";
const SHELL_CACHE = `dumtools-shell-${VERSION}`;
const NAV_CACHE = `dumtools-nav-${VERSION}`;

const PRECACHE = [
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* Le client demande la mise en cache de pages (îlots offline). On ne cache que
 * du HTML servi authentifié SANS redirection (une redirection = session absente
 * → on cacherait la page de login à la place de l'îlot). */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_PAGES" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(NAV_CACHE).then((cache) =>
      Promise.all(
        data.urls.map(async (u) => {
          try {
            const res = await fetch(u, {
              credentials: "same-origin",
              headers: { accept: "text/html" },
            });
            const type = res.headers.get("content-type") || "";
            if (res.ok && !res.redirected && type.includes("text/html")) {
              await cache.put(u, res);
            }
          } catch {
            /* hors-ligne pendant la demande : on garde l'entrée existante */
          }
        }),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST/server actions : réseau direct.

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // pas de cross-origin.

  // Ne jamais toucher à l'auth ni aux API dynamiques.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/login")) return;

  // Assets immuables hashés : cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-")) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // Navigations (pages) : network-first avec repli cache hors-ligne.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, NAV_CACHE));
    return;
  }
});

/* ignoreVary : Next varie ses réponses sur des en-têtes internes (RSC,
 * Next-Router-State-Tree…) absents des navigations réelles — sans ignoreVary,
 * cache.match ne retrouve jamais l'entrée et l'offline échoue. */
const MATCH_OPTS = { ignoreVary: true };

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, MATCH_OPTS);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, MATCH_OPTS);
    if (hit) return hit;
    // Même URL sans query string (PWA rouverte avec ?source=pwa etc.).
    const sansQuery = await cache.match(new URL(req.url).pathname, MATCH_OPTS);
    if (sansQuery) return sansQuery;
    // Dernier recours : page hors-ligne explicite plutôt que l'erreur navigateur.
    const fallback = await caches.open(SHELL_CACHE).then((c) => c.match("/offline.html"));
    if (fallback) return fallback;
    throw e;
  }
}
