import { NavLink } from 'react-router-dom'
import { useSession } from '@/app/session'
import {
  IconCalendar,
  IconGoals,
  IconHito,
  IconProfile,
  IconProgress,
  IconToday,
} from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

const NAV = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/progreso', label: 'Progreso', Icon: IconProgress },
  { to: '/perfil', label: 'Perfil', Icon: IconProfile },
] as const

/** Barra lateral (solo escritorio): marca + identidad del usuario + navegación + tema. */
export function SideNav() {
  const { email, profile } = useSession()
  const initial = (email.charAt(0) || '·').toUpperCase()
  const days = daysSince(profile.createdAt)

  return (
    <aside className="sidenav" aria-label="Navegación principal">
      <span className="brand sidenav__brand">
        <span className="brand__mark">
          <IconHito size={22} />
        </span>
        Hito
      </span>

      <div className="sidenav__identity">
        <span className="sidenav__avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="sidenav__identity-text">
          <span className="sidenav__email" title={email}>
            {email}
          </span>
          <span className="kicker sidenav__day">
            Día {days} en Hito
          </span>
        </div>
      </div>

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

function daysSince(createdAtISO: string): number {
  const start = new Date(createdAtISO).getTime()
  const diffMs = Date.now() - start
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1)
}
