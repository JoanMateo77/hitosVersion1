import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '@/app/session'
import { fetchCurrentStreak } from '@/services/profile'
import { frameForStreak } from '@/domain/frames'
import { useCachedData } from '@/hooks/useCachedData'
import {
  IconCalendar,
  IconFlame,
  IconGoals,
  IconHito,
  IconProfile,
  IconProgress,
  IconToday,
} from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

const NAV = [
  { to: '/', label: 'Hoy', Icon: IconToday },
  { to: '/habitos', label: 'Hábitos', Icon: IconFlame },
  { to: '/metas', label: 'Metas', Icon: IconGoals },
  { to: '/calendario', label: 'Agenda', Icon: IconCalendar },
  { to: '/progreso', label: 'Crecer', Icon: IconProgress, alsoMatch: '/aprender' },
  { to: '/perfil', label: 'Perfil', Icon: IconProfile },
] as const

/** Barra lateral (solo escritorio): marca + identidad del usuario + navegación + tema. */
export function SideNav() {
  const { userId, email, profile } = useSession()
  const { pathname } = useLocation()
  const initial = (email.charAt(0) || '·').toUpperCase()
  const days = daysSince(profile.createdAt)

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
          className="sidenav__avatar"
          aria-hidden="true"
          style={{
            overflow: 'hidden',
            boxShadow: frame ? `0 0 0 3px ${frame.color}` : undefined,
          }}
        >
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            initial
          )}
        </span>
        <div className="sidenav__identity-text">
          <span className="sidenav__email" title={email}>
            {email}
          </span>
          <span className="kicker sidenav__day">
            {frame ? `${frame.label} · racha de ${streak}` : `Día ${days} en Lógralo`}
          </span>
        </div>
      </div>

      <nav className="sidenav__nav">
        {NAV.map((item) => {
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
            >
              <Icon size={20} />
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
