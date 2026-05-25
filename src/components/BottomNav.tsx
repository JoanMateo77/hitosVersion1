import { NavLink } from 'react-router-dom'
import { IconCalendar, IconGoals, IconProfile, IconToday } from '@/components/icons'

const TABS = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/perfil', label: 'Perfil', Icon: IconProfile },
] as const

export function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      <div className="bottomnav__inner">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            // 'end' en "/" evita que quede activa en todas las rutas.
            end={to === '/'}
            className={({ isActive }) =>
              `bottomnav__item${isActive ? ' bottomnav__item--active' : ''}`
            }
          >
            <Icon size={23} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
