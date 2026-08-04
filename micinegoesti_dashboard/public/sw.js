const CACHE_NAME = "micinegoesti-dashboard-v7";
const APP_SHELL = [
  "/",
  "/admin",
  "/admin-login",
  "/offline",
  "/manifest.webmanifest",
  "/assets/brand/cropped-LogoWebsite.png",
  "/uploads/2026/02/cropped-LogoWebsite-1-192x192.png",
  "/uploads/2026/02/cropped-LogoWebsite-1.png",
  "/uploads/2026/02/cropped-LogoWebsite-1-180x180.png",
  "/uploads/2026/02/icon-maskable-192.png",
  "/uploads/2026/02/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        APP_SHELL.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) await cache.put(url, response);
        })
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

async function safeCacheMatch(request) {
  try {
    const response = await caches.match(request);
    return response instanceof Response ? response : null;
  } catch {
    return null;
  }
}

async function safeCachePut(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // A failed cache write must never turn a valid network response into a
    // rejected FetchEvent (notably in Safari private/corrupted cache states).
  }
}

async function navigationFallback() {
  const cached =
    (await safeCacheMatch("/offline")) ||
    (await safeCacheMatch("/")) ||
    (await safeCacheMatch("/index.html"));

  if (cached) return cached;

  return new Response("<!doctype html><title>Offline</title><p>Conexiunea nu este disponibilă.</p>", {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (!response.ok) return response;

          await safeCachePut("/", response.clone());
          return response;
        } catch {
          return navigationFallback();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await safeCacheMatch(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          await safeCachePut(request, response.clone());
        }
        return response;
      } catch {
        return new Response("", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Cache-Control": "no-store" }
        });
      }
    })()
  );
});
