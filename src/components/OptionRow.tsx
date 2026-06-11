import type { ReactNode } from 'react'
import { IconCheck } from '@/components/icons'

interface OptionRowProps {
  /** Ícono dibujado (componente del set) — va en un disco neutro a la izquierda. */
  icon?: ReactNode
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
  label,
  desc,
  selected = false,
  disabled = false,
  busy = false,
  onClick,
}: OptionRowProps) {
  return (
    <button
      type="button"
      className={`option${selected ? ' option--selected' : ''}`}
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
