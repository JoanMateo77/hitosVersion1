import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useSession } from '@/app/session'
import { fetchCurrentStreak } from '@/services/profile'
import { frameForStreak } from '@/domain/frames'
import { useCachedData } from '@/hooks/useCachedData'
import { IconHito } from '@/components/icons'

/** Barra superior fina (solo móvil/tablet): la marca + acceso a Perfil.
 *  Perfil vive aquí (avatar) para que la barra inferior quede en 5 pestañas
 *  con zonas táctiles cómodas. El tema se cambia en Perfil → Apariencia.
 *
 *  Se esconde al scrollear hacia abajo y reaparece al subir o al llegar arriba
 *  (patrón iOS/Instagram): el contenido manda, la marca no estorba. */
export function TopBar() {
  const { userId, email, profile } = useSession()
  const initial = (email.charAt(0) || '·').toUpperCase()
  const [hidden, setHidden] = useState(false)

  // Marco por racha: misma métrica y misma clave de cache que Perfil, así solo
  // se calcula una vez por sesión. Si falla, simplemente no hay anillo.
  const { data: streak } = useCachedData(
    `streak:${userId}`,
    () => fetchCurrentStreak(userId).catch(() => 0),
    [userId],
  )
  const frame = frameForStreak(streak ?? 0)

  useEffect(() => {
    let last = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last
        // Umbral de 6px: ignora el jitter del rebote táctil.
        if (y < 32) setHidden(false)
        else if (delta > 6) setHidden(true)
        else if (delta < -6) setHidden(false)
        last = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`topbar${hidden ? ' topbar--hidden' : ''}`}>
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
        style={{
          overflow: 'hidden',
          // Anillo del marco ganado con la racha (ver src/domain/frames.ts).
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
      </NavLink>
    </header>
  )
}
