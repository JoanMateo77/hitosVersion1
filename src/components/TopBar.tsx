import { NavLink } from 'react-router-dom'
import { useSession } from '@/app/session'
import { IconHito } from '@/components/icons'

/** Barra superior fina (solo móvil/tablet): la marca + acceso a Perfil.
 *  Perfil vive aquí (avatar) para que la barra inferior quede en 5 pestañas
 *  con zonas táctiles cómodas. El tema se cambia en Perfil → Apariencia. */
export function TopBar() {
  const { email } = useSession()
  const initial = (email.charAt(0) || '·').toUpperCase()
  return (
    <header className="topbar">
      <span className="brand" style={{ fontSize: 'var(--fs-lg)' }}>
        <span className="brand__mark">
          <IconHito size={20} />
        </span>
        Lógralo
      </span>
      <NavLink
        to="/perfil"
        aria-label="Tu perfil"
        className={({ isActive }) => `topbar__avatar${isActive ? ' topbar__avatar--active' : ''}`}
      >
        {initial}
      </NavLink>
    </header>
  )
}
