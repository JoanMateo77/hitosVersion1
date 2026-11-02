import type { CSSProperties, MouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { fetchCurrentStreak } from '@/services/profile'
import { frameForStreak } from '@/domain/frames'
import { useCachedData } from '@/hooks/useCachedData'
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
import { avatarInitials } from '@/lib/avatar'

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
  const { userId, email, displayName, profile } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const initials = avatarInitials({ displayName, email })
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

  // Foto y marco por racha, igual que en la TopBar móvil (misma clave de cache:
  // un solo cálculo por sesión entre las tres superficies).
  const { data: streak } = useCachedData(
    `streak:${userId}`,
    () => fetchCurrentStreak(userId).catch(() => 0),
    [userId],
  )
  const frame = frameForStreak(streak ?? 0)

  return (
    <aside className="sidenav" aria-label="Navegación principal">
      <span className="brand sidenav__brand">
        <span className="brand__mark">
          <IconHito size={22} />
        </span>
        Lógralo
      </span>

      <div className="sidenav__identity">
        <span
          className={`avatar${frame ? ' avatar--ring' : ''}`}
          aria-hidden="true"
          // Anillo del marco ganado, igual que en la TopBar; sin marco, ninguno.
          style={frame ? ({ '--avatar-ring': frame.color } as CSSProperties) : undefined}
        >
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
        </span>
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
