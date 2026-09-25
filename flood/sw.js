const CACHE = "khem-flood-rescue-public-v4";
const CACHE_FAMILY = CACHE.replace(/v\d+$/, "");
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./model.js", "./storage.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_FAMILY) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const path = new URL(request.url).pathname;
  if (!SHELL.some(entry => new URL(entry, self.registration.scope).pathname === path)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
