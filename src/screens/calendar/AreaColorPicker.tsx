import { useRef, type KeyboardEvent } from 'react'
import { DAY_AREAS, type DayArea } from '@/domain/dayPlan'
import { looseArea } from '@/domain/looseArea'
import { getNiche } from '@/domain/niches'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconCheck } from '@/components/icons'

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * Color de un evento sin meta: el área a la que pertenece. Sin elegir (null)
 * marca el que la agenda ya le da por el título, para que lo que se ve aquí
 * sea lo que se ve en la agenda. Radiogroup con flechas, como el color de meta.
 */
export function AreaColorPicker({
  title,
  value,
  onChange,
}: Readonly<{ title: string; value: DayArea | null; onChange: (v: DayArea) => void }>) {
  const groupRef = useRef<HTMLDivElement>(null)
  const current = value ?? looseArea(title, null)
  const selectedIndex = DAY_AREAS.indexOf(current)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = ARROW_STEP[e.key]
    if (!step) return
    e.preventDefault()
    const next = (selectedIndex + step + DAY_AREAS.length) % DAY_AREAS.length
    onChange(DAY_AREAS[next])
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div className="field">
      <span className="field__label" id="event-area-label">
        Color
      </span>
      <div ref={groupRef} className="goal-swatches" role="radiogroup" aria-labelledby="event-area-label" onKeyDown={onKeyDown}>
        {DAY_AREAS.map((area, i) => {
          const selected = i === selectedIndex
          const label = getNiche(area).label
          return (
            <button
              key={area}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              tabIndex={selected ? 0 : -1}
              className="goal-swatch"
              style={nicheAccent(area)}
              onClick={() => onChange(area)}
            >
              {selected && <IconCheck size={18} />}
            </button>
          )
        })}
      </div>
      <span className="field__hint">El área de tu vida a la que pertenece. Le da su color en la agenda.</span>
    </div>
  )
}
