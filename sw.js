/* PLANIFICA — service worker: deja la app disponible sin conexión.
   Solo guarda en caché los archivos de la app. Tus datos NO pasan por aquí: viven en localStorage. */
const V = "planifica-app-v1"; // sube este número cuando publiques una versión nueva
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Responde desde caché al instante y actualiza en segundo plano (la nueva versión se ve en la siguiente apertura)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((guardado) => {
      const red = fetch(e.request).then((r) => {
        if (r && r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); }
        return r;
      }).catch(() => guardado);
      return guardado || red;
    }),
  );
});
