import type { MouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useStreakFrame } from '@/hooks/useStreakFrame'
import {
  IconCalendar,
  IconFlame,
  IconGoals,
  IconHito,
  IconNote,
  IconProfile,
  IconProgress,
  IconToday,
} from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { withViewTransition } from '@/lib/viewTransition'
import { UserAvatar } from '@/components/UserAvatar'

const NAV = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/habitos', label: 'Hábitos', Icon: IconFlame },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/notas', label: 'Notas', Icon: IconNote },
  // Mismo nombre que el título de la pantalla; /aprender también la marca activa.
  { to: '/progreso', label: 'Progreso', Icon: IconProgress, alsoMatch: '/aprender' },
  { to: '/perfil', label: 'Perfil', Icon: IconProfile },
] as const

/** Barra lateral (solo escritorio): marca + identidad del usuario + navegación + tema. */
export function SideNav() {
  const { email, displayName, profile } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Se muestra el nombre; el email solo si no hay nombre.
  const identity = displayName.trim() || email
  const days = daysSince(profile.createdAt)
  const activeIndex = NAV.findIndex((item) => {
    const alsoMatch = 'alsoMatch' in item ? item.alsoMatch : undefined
    return item.to === '/'
      ? pathname === '/'
      : pathname.startsWith(item.to) ||
          (alsoMatch !== undefined && pathname.startsWith(alsoMatch))
  })

  // Marco por racha, igual que en la TopBar móvil (misma cache).
  const { streak, frame } = useStreakFrame()

  return (
    <aside className="sidenav" aria-label="Navegación principal">
      <span className="brand sidenav__brand">
        <span className="brand__mark">
          <IconHito size={22} />
        </span>
        Lógralo
      </span>

      <div className="sidenav__identity">
        {/* Decorativo: el nombre va escrito al lado. */}
        <UserAvatar frame={frame} />
        <div className="sidenav__identity-text">
          <span className="sidenav__name" title={identity}>
            {identity}
          </span>
          <span className="sidenav__day">
            {frame ? `${frame.label} · racha de ${streak}` : `Día ${days} en Lógralo`}
          </span>
        </div>
      </div>

      <nav className="sidenav__nav">
        {NAV.map((item, index) => {
          const alsoMatch = 'alsoMatch' in item ? item.alsoMatch : undefined
          const { to, label, Icon } = item
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `sidenav__item${
                  isActive || (alsoMatch && pathname.startsWith(alsoMatch))
                    ? ' sidenav__item--active'
                    : ''
                }`
              }
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                withViewTransition(() => navigate(to))
              }}
            >
              <Icon size={20} filled={index === activeIndex} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="sidenav__footer">
        <ThemeSwitcher variant="stack" />
      </div>
    </aside>
  )
}

function daysSince(createdAtISO: string): number {
  const start = new Date(createdAtISO).getTime()
  const diffMs = Date.now() - start
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1)
}
