import { useState } from 'react'
import { WEEKDAY_PLURALS } from '@/domain/commitment'
import { remindersLabel } from '@/domain/habits'
import { getNiche } from '@/domain/niches'
import { HabitIcon } from '@/components/HabitIcon'
import { IconChevronRight, IconMinus, IconPlus, IconTrash } from '@/components/icons'
import type { HabitDraft } from '@/screens/habits/habitDraft'

/** Iniciales de los círculos de días (lunes = 0), como en el mockup. */
const DAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Límites del stepper "Veces al día". */
const MIN_TIMES = 2
const MAX_TIMES = 20

/** Hora que se propone al encender los recordatorios sin ninguna guardada. */
const FIRST_TIME = '09:00'

/**
 * Paso 2: cada cuánto toca. Frecuencia (una o varias veces), qué días y a qué
 * horas avisar. "Todos los días" se guarda como lista de días vacía, que es la
 * semántica que ya usa el dominio.
 */
export function SheetStepFrequency({
  draft,
  patch,
  reminders,
  onReminders,
}: {
  draft: HabitDraft
  patch: (over: Partial<HabitDraft>) => void
  /** Interruptor de recordatorios (apagado ⇒ se guardan sin horas). */
  reminders: boolean
  onReminders: (on: boolean) => void
}) {
  const [hoursOpen, setHoursOpen] = useState(false)
  const multi = draft.timesPerDay > 1
  const selected = draft.weekdays.length === 0 ? ALL_DAYS : draft.weekdays

  function toggleDay(day: number) {
    const next = selected.includes(day)
      ? selected.filter((d) => d !== day)
      : [...selected, day].sort((a, b) => a - b)
    // Un hábito sin ningún día no existiría: el último no se puede quitar.
    if (next.length === 0) return
    patch({ weekdays: next.length === 7 ? [] : next })
  }

  function setTimesPerDay(value: number) {
    patch({ timesPerDay: Math.min(MAX_TIMES, Math.max(MIN_TIMES, value)) })
  }

  function setHour(index: number, value: string) {
    if (!value) return
    const next = draft.times.map((t, i) => (i === index ? value : t))
    patch({ times: next })
  }

  function addHour() {
    setHoursOpen(true)
    patch({ times: [...draft.times, FIRST_TIME] })
  }

  function toggleReminders() {
    const on = !reminders
    onReminders(on)
    if (on && draft.times.length === 0) patch({ times: [FIRST_TIME] })
    if (!on) setHoursOpen(false)
  }

  return (
    <>
      <div className="hsheet-summary">
        <HabitIcon icon={draft.icon} color={draft.color} size="md" />
        <div className="hsheet-summary__main">
          <span className="hsheet-summary__title">
            {draft.title.trim() || 'Nuevo hábito'}
          </span>
          <span className="hsheet-summary__sub">{getNiche(draft.area).label}</span>
        </div>
      </div>

      <section className="hsheet-group">
        <span className="hab-kicker">Frecuencia</span>
        <div className="hsheet-seg">
          <button
            type="button"
            className="hsheet-seg__btn"
            aria-pressed={!multi}
            onClick={() => patch({ timesPerDay: 1 })}
          >
            Una vez al día
          </button>
          <button
            type="button"
            className="hsheet-seg__btn"
            aria-pressed={multi}
            onClick={() => patch({ timesPerDay: Math.max(MIN_TIMES, draft.timesPerDay) })}
          >
            Varias veces al día
          </button>
        </div>
        {multi && (
          <>
            <div className="hsheet-stepper">
              <span className="hsheet-stepper__label" id="hsheet-times-label">
                Veces al día
              </span>
              <div className="hsheet-stepper__controls">
                <button
                  type="button"
                  className="hsheet-step-btn"
                  aria-label="Una vez menos"
                  disabled={draft.timesPerDay <= MIN_TIMES}
                  onClick={() => setTimesPerDay(draft.timesPerDay - 1)}
                >
                  <IconMinus size={20} />
                </button>
                <span className="hsheet-stepper__value" aria-labelledby="hsheet-times-label">
                  {draft.timesPerDay}
                  {draft.unit && draft.unit.trim().length > 0 && (
                    <span className="hsheet-stepper__unit"> {draft.unit.trim()}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="hsheet-step-btn"
                  aria-label="Una vez más"
                  disabled={draft.timesPerDay >= MAX_TIMES}
                  onClick={() => setTimesPerDay(draft.timesPerDay + 1)}
                >
                  <IconPlus size={20} />
                </button>
              </div>
            </div>
            <label className="hsheet-field" htmlFor="hsheet-unit">
              <span className="hsheet-field__label">Unidad (opcional)</span>
              <input
                id="hsheet-unit"
                className="hsheet-field__input"
                type="text"
                value={draft.unit ?? ''}
                maxLength={16}
                placeholder="vasos, páginas…"
                onChange={(e) => patch({ unit: e.target.value })}
              />
            </label>
          </>
        )}
      </section>

      <section className="hsheet-group">
        <span className="hab-kicker">Días</span>
        <div className="hsheet-days">
          {DAY_INITIALS.map((letter, day) => (
            <button
              key={letter}
              type="button"
              className="hsheet-day"
              aria-label={`Los ${WEEKDAY_PLURALS[day]}`}
              aria-pressed={selected.includes(day)}
              onClick={() => toggleDay(day)}
            >
              {letter}
            </button>
          ))}
        </div>
        <div className="hsheet-links">
          <button type="button" className="hsheet-link" onClick={() => patch({ weekdays: [] })}>
            Todos
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="hsheet-link"
            onClick={() => patch({ weekdays: [0, 1, 2, 3, 4] })}
          >
            Entre semana
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="hsheet-link"
            onClick={() => patch({ weekdays: [5, 6] })}
          >
            Fin de semana
          </button>
        </div>
      </section>

      <div className="hsheet-card">
        <div className="hsheet-row">
          <span className="hsheet-row__label">Recordatorios</span>
          <button
            type="button"
            className="hsheet-switch"
            role="switch"
            aria-checked={reminders}
            aria-label="Recordatorios"
            onClick={toggleReminders}
          >
            <span className="hsheet-switch__knob" />
          </button>
        </div>
        {reminders && (
          <button
            type="button"
            className="hsheet-row hsheet-row--tap"
            aria-expanded={hoursOpen}
            onClick={() => setHoursOpen((v) => !v)}
          >
            <span className="hsheet-row__label">Horas</span>
            <span className="hsheet-row__value">{remindersLabel(draft.times)}</span>
            <IconChevronRight size={16} className="hsheet-row__chevron" />
          </button>
        )}
        {reminders && hoursOpen && (
          <div className="hsheet-hours">
            {draft.times.map((time, index) => (
              // El índice es la identidad aquí: con la hora como clave, cada
              // tecla remontaría el input y se perdería el foco.
              <div className="hsheet-hour" key={index}>
                <input
                  className="hsheet-hour__input"
                  type="time"
                  value={time}
                  aria-label={`Hora ${index + 1}`}
                  onChange={(e) => setHour(index, e.target.value)}
                />
                <button
                  type="button"
                  className="hsheet-hour__remove"
                  aria-label={`Quitar la hora ${index + 1}`}
                  onClick={() => patch({ times: draft.times.filter((_, i) => i !== index) })}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="hsheet-link hsheet-link--block" onClick={addHour}>
              + agregar hora
            </button>
          </div>
        )}
      </div>
    </>
  )
}
