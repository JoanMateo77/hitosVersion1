import { IconHito } from '@/components/icons'

/** Barra superior fina (solo móvil/tablet): la marca, sin ruido.
 *  El tema se cambia en Perfil → Apariencia. */
export function TopBar() {
  return (
    <header className="topbar">
      <span className="brand" style={{ fontSize: 'var(--fs-lg)' }}>
        <span className="brand__mark">
          <IconHito size={20} />
        </span>
        Lógralo
      </span>
    </header>
  )
}
