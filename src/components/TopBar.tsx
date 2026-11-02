import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useStreakFrame } from '@/hooks/useStreakFrame'
import { IconHito } from '@/components/icons'
import { UserAvatar } from '@/components/UserAvatar'

/** Barra superior fina (solo móvil/tablet): la marca + acceso a Perfil.
 *  Perfil vive aquí (avatar) para que la barra inferior quede en 5 pestañas
 *  con zonas táctiles cómodas. El tema se cambia en Perfil → Apariencia.
 *
 *  Se esconde al scrollear hacia abajo y reaparece al subir o al llegar arriba
 *  (patrón iOS/Instagram): el contenido manda, la marca no estorba. */
export function TopBar() {
  const [hidden, setHidden] = useState(false)
  // Marco por racha: misma métrica y misma cache que Perfil y la barra lateral.
  const { frame } = useStreakFrame()

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
        className="avatar-link topbar__avatar"
      >
        <UserAvatar frame={frame} />
      </NavLink>
    </header>
  )
}
