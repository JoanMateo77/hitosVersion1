import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { SideNav } from '@/components/SideNav'
import { TopBar } from '@/components/TopBar'

/** "/metas/<id>" (detalle), no "/metas" a secas. */
const GOAL_DETAIL_PATH = /^\/metas\/[^/]+/

/**
 * Layout de las pantallas con navegación (Hoy, Metas, Agenda, Perfil).
 * - Móvil/tablet (<1024px): top bar fina + contenido + barra inferior.
 *   Hoy, Hábitos (lista y detalle) y el detalle de una meta son la excepción:
 *   traen su propia cabecera (saludo + avatar, "‹ Hábitos / Editar" o el hero
 *   de color con "‹ Atrás / Editar"), así que la TopBar con la marca no se
 *   muestra en "/", "/habitos…" ni "/metas/:id" — dos cabeceras serían ruido.
 *   La lista "/metas" sí la conserva. La barra inferior sigue en todas.
 * - Escritorio (≥1024px): barra lateral + contenido con ancho de lectura.
 * Las tres piezas se renderizan siempre; el CSS decide cuál se muestra.
 */
export function AppShell() {
  const { pathname } = useLocation()
  const ownHeader =
    pathname === '/' || pathname.startsWith('/habitos') || GOAL_DETAIL_PATH.test(pathname)
  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <SideNav />
      <div className="shell__main">
        {!ownHeader && <TopBar />}
        <main id="contenido" className="shell__content">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
