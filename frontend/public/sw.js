/* Offline app shell. After one online visit the app opens with no signal, and the outbox
   (IndexedDB) keeps visit logs until the phone is back online. API calls are never cached here:
   loan data must be fresh, and a stale balance is worse than an error message. */
// The page registers /sw.js?v=<build id>, so every deploy gets its own cache and the old one is deleted.
const CACHE = "cc-shell-" + (new URL(self.location.href).searchParams.get("v") || "dev");
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png"];
const API_PREFIXES = ["/auth", "/my", "/manager", "/outcomes", "/reminders", "/health"];

// The build lists its own files in asset-manifest.json. Saving them all means every screen opens
// offline, not only the ones visited so far. If the list is missing (dev), the basic shell still works.
async function install() {
  const cache = await caches.open(CACHE);
  let built = [];
  try {
    const res = await fetch("/asset-manifest.json", { cache: "no-store" });
    if (res.ok) built = await res.json();
  } catch { /* offline during install: the shell alone is saved */ }
  await cache.addAll([...SHELL, ...built]);
  await self.skipWaiting();
}

self.addEventListener("install", (event) => event.waitUntil(install()));

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function put(request, response) {
  if (response && response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// Pages: the network when there is one, so a new deploy shows up; the saved shell when there is not.
async function page(request) {
  try {
    return await put("/", await fetch(request));
  } catch {
    return (await caches.match("/")) || Response.error();
  }
}

// /assets/* have a content hash in the name, so a cached copy never goes stale.
async function hashed(request) {
  return (await caches.match(request)) || put(request, await fetch(request));
}

// Icons, manifest: show the saved copy now, refresh it for next time.
async function other(request) {
  const cached = await caches.match(request);
  const fresh = fetch(request).then((r) => put(request, r)).catch(() => cached || Response.error());
  return cached || fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API and fonts are on other hosts
  // A page load is always the app, even at /manager; only fetch() calls to these paths are the API.
  if (request.mode === "navigate") { event.respondWith(page(request)); return; }
  if (API_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;
  if (url.pathname.startsWith("/assets/")) event.respondWith(hashed(request));
  else event.respondWith(other(request));
});
