import type { CSSProperties, MouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  IconCalendar,
  IconFlame,
  IconGoals,
  IconProgress,
  IconToday,
} from '@/components/icons'
import { withViewTransition } from '@/lib/viewTransition'

// 5 pestañas máximo: Perfil vive en el avatar del TopBar para que cada zona
// táctil quede cómoda en pantallas chicas.
// `alsoMatch`: rutas de la misma zona que también marcan la pestaña (Aprender
// forma parte de Crecer, así el usuario nunca queda sin saber dónde está).
const TABS = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/habitos', label: 'Hábitos', Icon: IconFlame },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/progreso', label: 'Crecer', Icon: IconProgress, alsoMatch: '/aprender' },
] as const

export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeIndex = TABS.findIndex((tab) => {
    const alsoMatch = 'alsoMatch' in tab ? tab.alsoMatch : undefined
    return tab.to === '/'
      ? pathname === '/'
      : pathname.startsWith(tab.to) ||
          (alsoMatch !== undefined && pathname.startsWith(alsoMatch))
  })
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      <div
        className="bottomnav__inner"
        style={activeIndex >= 0 ? ({ '--tab': activeIndex } as CSSProperties) : undefined}
        data-active={activeIndex >= 0 ? '' : undefined}
      >
        {TABS.map((tab, index) => {
          const alsoMatch = 'alsoMatch' in tab ? tab.alsoMatch : undefined
          const { to, label, Icon } = tab
          const active = index === activeIndex
          return (
            <NavLink
              key={to}
              to={to}
              // 'end' en "/" evita que quede activa en todas las rutas.
              end={to === '/'}
              className={({ isActive }) =>
                `bottomnav__item${
                  isActive || (alsoMatch && pathname.startsWith(alsoMatch))
                    ? ' bottomnav__item--active'
                    : ''
                }`
              }
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                withViewTransition(() => navigate(to))
              }}
            >
              <Icon size={23} filled={active} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
