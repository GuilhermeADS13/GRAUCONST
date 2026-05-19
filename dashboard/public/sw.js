// ============================================================
// GrauConst — Service Worker
// Suporta: PWA install + notificações push
// ============================================================

const CACHE_NAME = 'grauconst-v1'
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json']

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  )
  self.skipWaiting()
})

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch (cache-first para assets, network-first para API) ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Supabase e APIs — sempre network
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/functions')) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => caches.match('/index.html'))
    })
  )
})

// ── Push Notifications ───────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'GrauConst', body: event.data.text() }
  }

  const { title, body, icon, tipo } = payload

  // Ícone e badge por tipo de alerta
  const iconMap = {
    temp_baixa: '🥶',
    temp_alta: '🔥',
    wifi_fraco: '📶',
    watchdog: '⚠️',
    temp_ok: '✅',
    watchdog_ok: '✅',
  }

  const options = {
    body: body || 'Nova notificação do sensor',
    icon: icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: tipo || 'grauconst-alert',       // agrupa notificações do mesmo tipo
    renotify: true,
    requireInteraction: tipo === 'watchdog' || tipo === 'temp_alta' || tipo === 'temp_baixa',
    data: { tipo, url: '/' },
    actions: [
      { action: 'open', title: 'Ver Dashboard' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(title || `GrauConst ${iconMap[tipo] || 'ℹ️'}`, options)
  )
})

// ── Notification click ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url.includes(self.location.origin))
        if (existing) return existing.focus()
        return clients.openWindow('/')
      })
  )
})
