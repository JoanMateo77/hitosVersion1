import type { MouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { IconCalendar, IconFlame, IconGoals, IconNote, IconToday } from '@/components/icons'
import { withViewTransition } from '@/lib/viewTransition'

// 5 pestañas máximo: Perfil vive en el avatar del TopBar para que cada zona
// táctil quede cómoda en pantallas chicas. Progreso y Aprender (ex "Crecer")
// se abren desde Perfil; en escritorio siguen en la barra lateral.
const TABS = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/habitos', label: 'Hábitos', Icon: IconFlame },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/notas', label: 'Notas', Icon: IconNote },
] as const

export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeIndex = TABS.findIndex((tab) =>
    tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to),
  )
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      <div className="bottomnav__inner">
        {TABS.map((tab, index) => {
          const { to, label, Icon } = tab
          const active = index === activeIndex
          return (
            <NavLink
              key={to}
              to={to}
              // 'end' en "/" evita que quede activa en todas las rutas.
              end={to === '/'}
              className={({ isActive }) =>
                `bottomnav__item${isActive ? ' bottomnav__item--active' : ''}`
              }
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                withViewTransition(() => navigate(to))
              }}
            >
              <Icon size={26} filled={active} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
