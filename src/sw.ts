/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

type PushPayload = {
  title?: string
  body?: string
  badgeCount?: number
  url?: string
  tag?: string
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

function badgeCountOf(data: PushPayload) {
  const count = Number(data.badgeCount)
  if (!Number.isFinite(count)) return 1
  return Math.max(0, Math.min(99, Math.round(count)))
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = {}
  }
  const count = badgeCountOf(data)
  const nav = self.navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  const title = data.title || 'New word'
  const options: NotificationOptions = {
    body: data.body || 'A friend sent you a word.',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag || 'retain-share',
    renotify: true,
    data: { url: typeof data.url === 'string' ? data.url : '/inbox' },
  }

  event.waitUntil(
    (async () => {
      const badge = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
      await badge?.catch(() => {})
      try {
        await self.registration.showNotification(title, options)
      } catch {
        const fallback = { ...options }
        delete fallback.renotify
        await self.registration.showNotification(title, fallback)
      }
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) client.postMessage({ type: 'shares-changed', badgeCount: count })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/inbox',
    self.location.origin,
  )
  if (target.origin !== self.location.origin) return

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        client.postMessage({ type: 'navigate', url: `${target.pathname}${target.search}` })
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
