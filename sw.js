/* PLANIFICA — service worker: deja la app disponible sin conexión.
   Solo guarda en caché los archivos de la app. Tus datos NO pasan por aquí: viven en IndexedDB
   (con respaldo en localStorage si IndexedDB no está disponible). */
const V = "planifica-app-v5"; // súbelo cuando cambies la lista ARCHIVOS
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

// Tolerante: si falta un archivo (p. ej. un ícono), los demás igual se guardan y el SW se instala.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(V)
      .then((c) => Promise.allSettled(ARCHIVOS.map((a) => c.add(a))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Caché primero y actualización en segundo plano (la versión nueva se ve en la siguiente apertura).
// Solo mismo origen; sin conexión y sin caché, una navegación cae a index.html en vez de fallar.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const guardado = await caches.match(req, { ignoreSearch: true });
    const esDoc = req.mode === "navigate" || /\/(index\.html)?$/.test(new URL(req.url).pathname);
    const previo = esDoc && guardado ? guardado.clone() : null; // copia para comparar; la página consume la original
    const red = fetch(req);
    const refresco = red
      .then(async (r) => {
        if (!r || !r.ok) return;
        const cp = r.clone(); // se clona de inmediato, antes de que la página lea el cuerpo
        const nuevo = previo ? r.clone() : null;
        await caches.open(V).then((c) => c.put(req, cp));
        if (previo && nuevo && (await previo.text()) !== (await nuevo.text())) { // la app cambió: avisa a las pestañas abiertas
          (await self.clients.matchAll({ type: "window" })).forEach((cl) => cl.postMessage({ tipo: "nueva-version" }));
        }
      })
      .catch(() => {});
    e.waitUntil(refresco); // evita que el navegador cierre el SW a mitad de la escritura
    if (guardado) return guardado;
    try { return await red; }
    catch (_) {
      if (req.mode === "navigate") { const p = await caches.match("./index.html"); if (p) return p; }
      return Response.error();
    }
  })());
});
