/* PLANIFICA — service worker: deja la app disponible sin conexión.
   Solo guarda en caché los archivos de la app. Tus datos NO pasan por aquí: viven en IndexedDB
   (con respaldo en localStorage si IndexedDB no está disponible).

   Estrategia: caché primero con actualización en segundo plano. La app abre al instante, incluso sin red;
   si el servidor tiene una versión distinta de index.html, se avisa a las pestañas abiertas para que
   ofrezcan «Actualizar». */
const V = "planifica-app-v6"; // súbelo cuando cambies la lista ARCHIVOS
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
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("planifica-") && k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "saltar-espera") self.skipWaiting();
});

async function avisarNuevaVersion() {
  const cs = await self.clients.matchAll({ type: "window" });
  cs.forEach((c) => c.postMessage({ tipo: "nueva-version" }));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range") || new URL(req.url).origin !== self.location.origin) return;
  const esDoc = req.mode === "navigate" || /\/(index\.html)?$/.test(new URL(req.url).pathname);

  // La vida del evento se declara aquí, de forma síncrona, y se libera cuando termina el refresco.
  let liberar;
  e.waitUntil(new Promise((r) => (liberar = r)));

  e.respondWith((async () => {
    const guardado = await caches.match(req, { ignoreSearch: true });
    const previo = esDoc && guardado ? guardado.clone() : null; // copia para comparar; la página consume la original
    const red = fetch(req).then(async (r) => {
      if (!r || !r.ok || r.type !== "basic" || r.redirected) return r;
      const paraCache = r.clone(); // se clona de inmediato, antes de que la página lea el cuerpo
      const paraComparar = previo ? r.clone() : null;
      await caches.open(V).then((c) => c.put(req, paraCache));
      if (previo && paraComparar && (await previo.text()) !== (await paraComparar.text())) await avisarNuevaVersion();
      return r;
    });
    red.catch(() => {}).then(() => liberar());

    if (guardado) return guardado;
    try {
      return await red;
    } catch (_) {
      // Sin conexión y sin copia: una navegación cae a index.html en vez de fallar
      if (req.mode === "navigate") {
        const p = await caches.match("./index.html");
        if (p) return p;
      }
      return new Response("Sin conexión", { status: 503, statusText: "Sin conexión", headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

// Al tocar una notificación de la app, enfoca la ventana abierta o abre una nueva
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const w = cs.find((c) => "focus" in c);
      return w ? w.focus() : self.clients.openWindow("./");
    }),
  );
});
