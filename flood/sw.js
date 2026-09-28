const CACHE = "promjaeng-flood-public-v28";
const CACHE_FAMILY = CACHE.replace(/v\d+$/, "");
const LEGACY_CACHE_FAMILIES = ["khem-flood-rescue-pilot-shell-v", "khem-flood-rescue-public-v"];
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./intake_client.js", "./provinces.js", "./official_alerts.js", "./model.js", "./storage.js", "./qr.js", "./vendor/qrcode.mjs", "./manifest.webmanifest", "./icon.svg", "./kamphaeng-phet/", "./kamphaeng-phet/index.html", "./kamphaeng-phet/styles.css", "./kamphaeng-phet/snapshot.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(CACHE_FAMILY) || LEGACY_CACHE_FAMILIES.some(prefix => key.startsWith(prefix))) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const path = new URL(request.url).pathname;
  if (!SHELL.some(entry => new URL(entry, self.registration.scope).pathname === path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(request, { cache: "no-store", signal: controller.signal });
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch { /* a full cache must not block online use */ }
        return response;
      }
    } catch {
      // A previously opened page remains usable when the network is unavailable.
    } finally {
      clearTimeout(timeout);
    }
    return cached || Response.error();
  })());
});
