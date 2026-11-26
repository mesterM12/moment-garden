/// <reference lib="webworker" />
export {}

declare const self: ServiceWorkerGlobalScope
// Injected by the TypeScript build script, not maintained as a second asset list.
declare const __PRECACHE_URLS__: string[]
declare const __CACHE_VERSION__: string

const scope = new URL(self.registration.scope)
const cacheName = `flowers-for-you-${encodeURIComponent(scope.pathname)}-${__CACHE_VERSION__}`
const shell = new URL('./', scope).href

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(__PRECACHE_URLS__)))
})
self.addEventListener('activate', event => {
  const prefix = `flowers-for-you-${encodeURIComponent(scope.pathname)}-`
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)))))
})
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== scope.origin) return
  const isHome = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`
  if (request.mode === 'navigate' && isHome) {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(cacheName)).match(shell)
      return cached || new Response('Open these flowers online once before going offline.', { status: 503 })
    }))
  } else if (__PRECACHE_URLS__.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache => {
      const cached = await cache.match(request)
      if (!cached) return fetch(request)
      // Turbopack puts dedicated worker config in the script URL's fragment.
      // A Cache API response has a fragment-less URL; returning it directly
      // replaces the worker's location. A synthetic response preserves it.
      if (request.destination === 'worker') return new Response(cached.body, { headers: cached.headers })
      return cached
    }))
  }
})
