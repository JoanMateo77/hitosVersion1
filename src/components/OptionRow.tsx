import type { ReactNode } from 'react'
import type { NicheId } from '@/lib/types'
import { IconCheck } from '@/components/icons'
import { nicheAccent } from '@/lib/nicheAccent'

interface OptionRowProps {
  /** Ícono dibujado (componente del set) — va en un disco neutro a la izquierda. */
  icon?: ReactNode
  /** Si la opción representa un área: disco sólido de su color y, elegida,
   *  la opción entera se pinta del área con relieve (full color). */
  area?: NicheId
  label: string
  desc?: string
  selected?: boolean
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}

/** Opción grande seleccionable. Base de onboarding, wizard y sugerencias. */
export function OptionRow({
  icon,
  area,
  label,
  desc,
  selected = false,
  disabled = false,
  busy = false,
  onClick,
}: Readonly<OptionRowProps>) {
  return (
    <button
      type="button"
      className={`option${area ? ' option--area' : ''}${selected ? ' option--selected' : ''}`}
      style={area ? nicheAccent(area) : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-busy={busy || undefined}
    >
      {icon && (
        <span className="option__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="option__body">
        <span className="option__label">{label}</span>
        {desc && <span className="option__desc">{desc}</span>}
      </span>
      {selected && (
        <span className="option__check">
          <IconCheck size={20} />
        </span>
      )}
    </button>
  )
}
