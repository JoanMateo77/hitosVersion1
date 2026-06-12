import { NavLink } from 'react-router-dom'
import {
  IconCalendar,
  IconFlame,
  IconGoals,
  IconProgress,
  IconToday,
} from '@/components/icons'

// 5 pestañas máximo: Perfil vive en el avatar del TopBar para que cada zona
// táctil quede cómoda en pantallas chicas.
const TABS = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/habitos', label: 'Hábitos', Icon: IconFlame },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/progreso', label: 'Crecer', Icon: IconProgress },
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
