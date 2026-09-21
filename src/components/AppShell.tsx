import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { SideNav } from '@/components/SideNav'
import { TopBar } from '@/components/TopBar'

/**
 * Layout de las pantallas con navegación (Hoy, Metas, Agenda, Perfil).
 * - Móvil/tablet (<1024px): top bar fina + contenido + barra inferior.
 *   Hoy es la excepción: trae su propia cabecera (saludo + avatar), así que la
 *   TopBar con la marca no se muestra en "/" — dos cabeceras serían ruido.
 * - Escritorio (≥1024px): barra lateral + contenido con ancho de lectura.
 * Las tres piezas se renderizan siempre; el CSS decide cuál se muestra.
 */
export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <SideNav />
      <div className="shell__main">
        {pathname !== '/' && <TopBar />}
        <main id="contenido" className="shell__content">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
