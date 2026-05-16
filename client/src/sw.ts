/// <reference lib="webworker" />
const CACHE_VERSION = 'member-check-shell-v2'
const SHELL_CACHE = `shell-${CACHE_VERSION}`

/** SPA shell routes — server returns index.html for each. */
const SHELL_PATHS = ['/', '/index.html', '/check', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const base = new URL(self.location.href).origin
      await Promise.all(
        SHELL_PATHS.map((path) =>
          cache.add(new Request(new URL(path, base), { cache: 'reload' })).catch(() => undefined),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(() => new Response('{"offline":true}', { status: 503, headers: { 'Content-Type': 'application/json' } })),
    )
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ success: false, offline: true, error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    return
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          void caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        if (req.mode === 'navigate' || req.destination === 'document') {
          const slash = await caches.match('/')
          if (slash) return slash
          return (await caches.match('/index.html')) ?? new Response('Offline', { status: 503 })
        }
        return (await caches.match(req)) ?? new Response('Offline', { status: 503 })
      }),
  )
})
