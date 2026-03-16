const CACHE_NAME = "abr-catalogo-v2026-03-16-3";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Nunca interceptar chamadas da API
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Nunca interceptar métodos diferentes de GET
  if (request.method !== "GET") {
    return;
  }

  // Navegação SPA: network first, fallback index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets estáticos: cache first com fallback network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        // Só cacheia respostas válidas e do mesmo domínio
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          url.origin === self.location.origin
        ) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }

        return networkResponse;
      });
    })
  );
});