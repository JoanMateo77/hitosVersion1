/* Manejadores de Web Push para el service worker de Lógralo.
   Se inyecta vía workbox.importScripts: convive con el precaché de la PWA. */

self.addEventListener('push', (event) => {
  let data = { title: 'Lógralo', body: 'Tienes una sesión esperándote.', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* payload no-JSON: usamos defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
      tag: data.tag || 'logralo',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url)
          return w.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
