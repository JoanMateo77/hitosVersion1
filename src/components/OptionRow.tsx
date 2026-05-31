import { IconCheck } from '@/components/icons'

interface OptionRowProps {
  emoji?: string
  label: string
  desc?: string
  selected?: boolean
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}

/** Opción grande seleccionable. Base de onboarding, wizard y sugerencias. */
export function OptionRow({
  emoji,
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
      {emoji && <span className="option__emoji">{emoji}</span>}
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
