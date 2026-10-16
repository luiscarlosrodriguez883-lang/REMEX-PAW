/* Service Worker de Remex.cu Ledger
   - Carga instantánea: la app se sirve desde el caché y se actualiza en segundo plano.
   - Funciona sin internet (las librerías de PDF/Excel/QR se guardan la primera vez que hay conexión).
   IMPORTANTE: cada vez que subas una versión nueva del index.html, cambia el número de VERSION
   (remex-v15, remex-v16, ...) para que el celular descargue la actualización. */
const VERSION = "remex-v14";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js"
];
// Solo se guardan respuestas legítimas de nuestro propio sitio (no redirecciones a páginas de login, ni errores)
const esPropia = (r) => r && r.ok && r.type === "basic" && !r.redirected;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(CORE.map(async (u) => { try { const r = await fetch(u, { cache: "reload" }); if (esPropia(r)) await c.put(u, r); } catch (err) {} }));
    await Promise.all(CDN.map((u) => c.add(new Request(u, { mode: "no-cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mismoOrigen = url.origin === self.location.origin;
  const esCDN = url.hostname === "cdnjs.cloudflare.com";
  if (!mismoOrigen && !esCDN) return; // WhatsApp, etc.: directo a la red

  // Páginas: respuesta inmediata del caché y actualización en segundo plano
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const guardado = (await c.match("./index.html")) || (await c.match("./"));
      const red = fetch(req).then((r) => { if (esPropia(r) && (r.headers.get("content-type") || "").includes("text/html")) c.put("./index.html", r.clone()); return r; }).catch(() => null);
      if (guardado) { e.waitUntil(red); return guardado; }
      return (await red) || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })());
    return;
  }

  // Archivos estáticos y librerías: primero el caché; si no existe se baja y se guarda
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const guardado = await c.match(req);
    if (guardado) return guardado;
    try {
      const r = await fetch(req);
      if (r && ((mismoOrigen && esPropia(r)) || (esCDN && (r.ok || r.type === "opaque")))) c.put(req, r.clone());
      return r;
    } catch (err) {
      return new Response("", { status: 504 });
    }
  })());
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
