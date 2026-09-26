const CACHE = "promjaeng-flood-public-v17";
const CACHE_FAMILY = CACHE.replace(/v\d+$/, "");
const LEGACY_CACHE_FAMILIES = ["khem-flood-rescue-pilot-shell-v", "khem-flood-rescue-public-v"];
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./intake_client.js", "./provinces.js", "./official_alerts.js", "./model.js", "./storage.js", "./qr.js", "./vendor/qrcode.mjs", "./manifest.webmanifest", "./icon.svg"];
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
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
