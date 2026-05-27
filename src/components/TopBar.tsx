import { IconHito } from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

/** Barra superior fina (solo móvil/tablet): marca a la izquierda, tema a la derecha. */
export function TopBar() {
  return (
    <header className="topbar">
      <span className="brand" style={{ fontSize: 'var(--fs-lg)' }}>
        <span className="brand__mark">
          <IconHito size={20} />
        </span>
        Hito
      </span>
      <ThemeSwitcher variant="compact" />
    </header>
  )
}
