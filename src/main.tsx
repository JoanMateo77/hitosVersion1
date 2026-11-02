import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from '@/App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from '@/app/ThemeProvider'
import { ToastProvider } from '@/app/toast'
import { reloadOnceForStaleChunk } from '@/lib/staleChunk'

import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/components.css'
import '@/styles/coach.css'
// Full color: piezas base y luego cada grupo de pantallas (spec 2026-11-02).
import '@/styles/fullcolor.css'
import '@/styles/screens/metas.css'
import '@/styles/screens/asistente.css'
import '@/styles/screens/agenda-progreso.css'
import '@/styles/screens/cuenta.css'

// Actualización automática de la PWA: cuando hay versión nueva, el service
// worker la activa y ESTA pestaña se recarga sola — sin esto, una pestaña
// abierta seguía mostrando el bundle viejo indefinidamente.
registerSW({ immediate: true })

// Vite avisa cuando no puede precargar un módulo o su CSS (hash de un deploy
// anterior): recargamos antes de que la pantalla llegue a fallar. Si no
// recargamos (ya se intentó hace poco), el error sigue y lo muestra ErrorBoundary.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault()
})

// En desarrollo no hay service worker: si quedó uno de un build anterior en
// localhost, seguiría sirviendo la versión vieja desde su caché.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()))
  if ('caches' in window) void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)))
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('No se encontró el elemento #root')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
