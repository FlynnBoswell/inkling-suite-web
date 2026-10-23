// Offline support. Network first (so updates arrive immediately), falling back to the last cached copy when offline,
// or when the network is too slow to answer within 3 seconds (a crowded ground with one bar of signal).
// Only this app's own files are cached; user data lives in IndexedDB, not here.
const CACHE = "inkling-suite-v5";
const SLOW_MS = 3000;
const OFFLINE_PAGE = "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Inkling Suite: offline</title><body style=\"font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1324;color:#eef2f8\"><main style=\"max-width:30rem;padding:1.5rem\"><h1 style=\"font-size:1.4rem\">No connection yet</h1><p>Inkling Suite needs to be opened once with a connection. After that it works offline, including Whistle at the ground.</p><p><button onclick=\"location.reload()\" style=\"font:inherit;padding:.6rem 1.2rem;border-radius:.6rem;border:0;background:#16a085;color:#fff\">Try again</button></p></main></body>";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    // The browser's cache can fail (a full disk, private browsing): then pages still load from the network, just not offline.
    const cached = () => caches.match(e.request, { ignoreSearch: true }).then(async (hit) => hit ?? (e.request.mode === "navigate" ? await caches.match("./index.html") ?? await caches.match("./") : undefined)).catch(() => undefined);
    const network = fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => undefined); } return res; });
    network.catch(() => undefined); // a failure is handled below
    const quick = await Promise.race([network.catch(() => null), new Promise((r) => setTimeout(() => r(null), SLOW_MS))]);
    if (quick) return quick;
    const hit = await cached(); if (hit) return hit; // slow or offline: the saved copy now (the fresh one is still saved when it arrives)
    try { return await network; } catch { return e.request.mode === "navigate" ? new Response(OFFLINE_PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("Offline", { status: 503 }); }
  })());
});
