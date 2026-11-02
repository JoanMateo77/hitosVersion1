import { useRef, useState, type KeyboardEvent } from 'react'
import type { Goal, GoalColor, NicheId } from '@/lib/types'
import { GOAL_COLORS } from '@/lib/goalAccent'
import { nicheAccent } from '@/lib/nicheAccent'
import { friendlyError } from '@/lib/errors'
import { getNiche } from '@/domain/niches'
import { removeGoalCover, uploadGoalCover } from '@/services/goalCovers'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { IconCheck } from '@/components/icons'

/* ===== Color: radiogroup con flechas ======================================= */

/** Una opción del selector: null = "Color del área" (sin color propio). */
interface ColorOption {
  key: string
  value: GoalColor | null
  tone: NicheId
  label: string
}

function colorOptions(area: NicheId): ColorOption[] {
  const areaLabel = getNiche(area).label
  return [
    { key: 'area', value: null, tone: area, label: `Color del área (${areaLabel})` },
    ...GOAL_COLORS.map((c) => ({ key: c.id, value: c.id, tone: c.id, label: c.label })),
  ]
}

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

function GoalColorPicker({
  area,
  value,
  onChange,
}: Readonly<{ area: NicheId; value: GoalColor | null; onChange: (v: GoalColor | null) => void }>) {
  const options = colorOptions(area)
  const groupRef = useRef<HTMLDivElement>(null)
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = ARROW_STEP[e.key]
    if (!step) return
    e.preventDefault()
    const next = (selectedIndex + step + options.length) % options.length
    onChange(options[next].value)
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div className="field">
      <span className="field__label" id="edit-color-label">
        Color
      </span>
      <div
        ref={groupRef}
        className="goal-swatches"
        role="radiogroup"
        aria-labelledby="edit-color-label"
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => {
          const selected = i === selectedIndex
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              title={o.label}
              tabIndex={selected ? 0 : -1}
              className={`goal-swatch${o.value === null ? ' goal-swatch--area' : ''}`}
              style={nicheAccent(o.tone)}
              onClick={() => onChange(o.value)}
            >
              {selected && <IconCheck size={18} />}
            </button>
          )
        })}
      </div>
      <span className="field__hint">El ícono sigue siendo el del área; el color pinta la tarjeta, la cabecera y la barra.</span>
    </div>
  )
}

/* ===== Foto de portada ======================================================= */

type CoverStatus = 'idle' | 'uploading' | 'removing'

function coverBusyLabel(status: CoverStatus): string | null {
  if (status === 'uploading') return 'Subiendo la foto…'
  if (status === 'removing') return 'Quitando la foto…'
  return null
}

function GoalCoverPicker({
  goal,
  onGoalChange,
}: Readonly<{ goal: Goal; onGoalChange: (g: Goal) => void }>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<CoverStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const url = useCoverUrl(goal.coverPath)
  const busy = status !== 'idle'
  const busyLabel = coverBusyLabel(status)

  async function onFile(file: File | undefined) {
    if (!file) return
    setStatus('uploading')
    setError(null)
    try {
      onGoalChange(await uploadGoalCover(goal, file))
    } catch (e) {
      setError(friendlyError(e, 'No se pudo subir la foto. Inténtalo de nuevo.'))
    } finally {
      setStatus('idle')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove() {
    setStatus('removing')
    setError(null)
    try {
      onGoalChange(await removeGoalCover(goal))
    } catch (e) {
      setError(friendlyError(e, 'No se pudo quitar la foto. Inténtalo de nuevo.'))
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className="field">
      <span className="field__label" id="edit-cover-label">
        Foto de portada
      </span>
      {goal.coverPath && (
        <div className="goal-cover-preview" aria-hidden="true">
          {url && <img src={url} alt="" />}
        </div>
      )}
      <input
        ref={inputRef}
        id="edit-cover-input"
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        aria-labelledby="edit-cover-label"
        disabled={busy}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <div className="row wrap">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {goal.coverPath ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {goal.coverPath && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void remove()}>
            Quitar foto
          </button>
        )}
      </div>
      {busyLabel && (
        <output className="field__hint" aria-live="polite">
          {busyLabel}
        </output>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <span className="field__hint">
        Se guarda al subirla. JPG, PNG, WebP o HEIC de hasta 10 MB; la reducimos y le quitamos los datos de ubicación.
      </span>
    </div>
  )
}

/* ===== Sección "Apariencia" ================================================= */

export interface GoalAppearanceProps {
  goal: Goal
  /** Área elegida en el formulario (puede no estar guardada aún). */
  area: NicheId
  color: GoalColor | null
  onColorChange: (v: GoalColor | null) => void
  coverOnCard: boolean
  onCoverOnCardChange: (v: boolean) => void
  /** La foto se guarda al subirla: devuelve la meta actualizada. */
  onGoalChange: (g: Goal) => void
}

/** Sección "Apariencia" del modo editar: color propio, portada y si va en la tarjeta. */
export function GoalAppearance({
  goal,
  area,
  color,
  onColorChange,
  coverOnCard,
  onCoverOnCardChange,
  onGoalChange,
}: Readonly<GoalAppearanceProps>) {
  return (
    <section className="goal-appearance stack" aria-labelledby="edit-appearance-title">
      <h2 className="section-title" id="edit-appearance-title">
        Apariencia
      </h2>
      <GoalColorPicker area={area} value={color} onChange={onColorChange} />
      <GoalCoverPicker goal={goal} onGoalChange={onGoalChange} />
      {goal.coverPath && (
        <div className="row row--between goal-appearance__toggle">
          <span className="small">
            Mostrar también en la tarjeta
            <span className="field__hint" style={{ display: 'block' }}>
              En la cabecera de la meta se ve siempre.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={coverOnCard}
            aria-label="Mostrar también en la tarjeta"
            className="goal-switch"
            onClick={() => onCoverOnCardChange(!coverOnCard)}
          >
            <span className="goal-switch__knob" />
          </button>
        </div>
      )}
    </section>
  )
}
