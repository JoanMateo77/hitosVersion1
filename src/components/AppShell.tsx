import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { SideNav } from '@/components/SideNav'
import { TopBar } from '@/components/TopBar'

/**
 * Layout de las pantallas con navegación (Hoy, Metas, Agenda, Perfil).
 * - Móvil/tablet (<1024px): top bar fina + contenido + barra inferior.
 *   Hoy y Hábitos (lista y detalle) son la excepción: traen su propia cabecera
 *   (saludo + avatar, o "‹ Hábitos / Editar"), así que la TopBar con la marca
 *   no se muestra en "/" ni en "/habitos…" — dos cabeceras serían ruido.
 * - Escritorio (≥1024px): barra lateral + contenido con ancho de lectura.
 * Las tres piezas se renderizan siempre; el CSS decide cuál se muestra.
 */
export function AppShell() {
  const { pathname } = useLocation()
  const ownHeader = pathname === '/' || pathname.startsWith('/habitos')
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
