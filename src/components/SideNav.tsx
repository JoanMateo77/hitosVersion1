import { NavLink } from 'react-router-dom'
import { IconCalendar, IconGoals, IconHito, IconProfile, IconToday } from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

const NAV = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/perfil', label: 'Perfil', Icon: IconProfile },
] as const

/** Barra lateral (solo escritorio): marca arriba, navegación vertical, tema abajo. */
export function SideNav() {
  return (
    <aside className="sidenav" aria-label="Navegación principal">
      <span className="brand sidenav__brand">
        <span className="brand__mark">
          <IconHito size={22} />
        </span>
        Hito
      </span>

      <nav className="sidenav__nav">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidenav__item${isActive ? ' sidenav__item--active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidenav__footer">
        <ThemeSwitcher variant="stack" />
      </div>
    </aside>
  )
}
