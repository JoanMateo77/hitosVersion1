import { useState } from 'react'
import type { ScheduleBlock } from '@/lib/types'
import { WEEKDAY_LABELS, WEEKDAY_PLURALS, durationStep } from '@/domain/commitment'
import type { EditScope } from '@/domain/scheduleEdit'
import { formatDuration, todayISO } from '@/lib/date'
import { canSkip, goalWeekdays, type SessionState } from '@/screens/calendar/agendaItems'

/**
 * Guardar un cambio de valor u hora desde un bloque. Si la meta tiene más de
 * un bloque se pregunta el alcance ("solo los lunes" / "todos los días");
 * con uno solo no hay nada que preguntar.
 */
export function ScopeSave({
  weekday,
  multi,
  disabled,
  label,
  onSave,
}: {
  weekday: number
  /** La meta tiene más de un bloque. */
  multi: boolean
  disabled: boolean
  /** Texto del botón cuando no hay pregunta. */
  label: string
  onSave: (scope: EditScope) => void
}) {
  if (!multi) {
    return (
      <button className="btn btn--primary btn--block" disabled={disabled} onClick={() => onSave('this')}>
        {label}
      </button>
    )
  }
  const plural = WEEKDAY_PLURALS[weekday]
  return (
    <div className="stack stack--sm">
      <p className="small muted" style={{ margin: 0 }}>
        ¿Solo los {plural} o todos los días de esta meta?
      </p>
      <div className="row">
        <button
          className="btn btn--primary btn--sm"
          style={{ flex: 1 }}
          disabled={disabled}
          onClick={() => onSave('this')}
        >
          Solo los {plural}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          style={{ flex: 1 }}
          disabled={disabled}
          onClick={() => onSave('all')}
        >
          Todos los días
        </button>
      </div>
    </div>
  )
}

/**
 * Sección "Editar" de la hoja de un bloque: días de la meta, duración o
 * cantidad, saltar solo este día y sacar la meta de la agenda. Los cambios los
 * aplica Calendar (por diferencias, sin perder historial); aquí solo se arma
 * lo que el usuario quiere.
 */
export function BlockEditSection({
  block,
  goalBlocks,
  state,
  day,
  onSaveDays,
  onSaveValue,
  onSkip,
  onUnskip,
  onRemoveFromAgenda,
}: {
  /** El bloque tocado. */
  block: ScheduleBlock
  /** Todos los bloques de la meta (puede haber varios el mismo día). */
  goalBlocks: ScheduleBlock[]
  /** Estado de la sesión de este día. */
  state: SessionState
  /** Día (ISO) de la sesión: un día pasado no se salta. */
  day: string
  onSaveDays: (weekdays: number[]) => Promise<void>
  onSaveValue: (value: number, scope: EditScope) => Promise<void>
  onSkip: () => Promise<void>
  onUnskip: () => Promise<void>
  onRemoveFromAgenda: () => Promise<void>
}) {
  const currentDays = goalWeekdays(goalBlocks)
  const [days, setDays] = useState<number[]>(currentDays)
  const [value, setValue] = useState(block.targetValue)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const isTime = block.targetKind === 'time'
  const minValue = isTime ? 5 : 1
  const daysChanged = days.length !== currentDays.length || days.some((d) => !currentDays.includes(d))

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  function toggleDay(weekday: number) {
    setDays((prev) =>
      prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday].sort((a, b) => a - b),
    )
  }

  return (
    <div className="stack stack--sm">
      <span className="kicker">Editar</span>

      <div className="row wrap" role="group" aria-label="Días de esta meta">
        {WEEKDAY_LABELS.map((label, weekday) => (
          <button
            key={label}
            type="button"
            className={`chip${days.includes(weekday) ? ' chip--selected' : ''}`}
            aria-pressed={days.includes(weekday)}
            onClick={() => toggleDay(weekday)}
          >
            {label}
          </button>
        ))}
      </div>
      {days.length === 0 && (
        <p className="faint tiny" style={{ margin: 0 }} role="status">
          Deja al menos un día. Para quitarle todos, usa “Sacar la meta de la agenda”.
        </p>
      )}
      {daysChanged && (
        <button
          className="btn btn--primary btn--block"
          disabled={busy || days.length === 0}
          onClick={() => void run(() => onSaveDays(days))}
        >
          Guardar los días
        </button>
      )}

      <div className="row" style={{ alignItems: 'center' }}>
        <button
          type="button"
          className="iconbtn"
          aria-label="Restar"
          disabled={value <= minValue}
          onClick={() => setValue((v) => Math.max(minValue, v - (isTime ? durationStep(v, -1) : 1)))}
        >
          −
        </button>
        <span style={{ minWidth: 76, textAlign: 'center', fontWeight: 700 }} aria-live="polite">
          {isTime ? formatDuration(value) : `${value} ${block.unit ?? ''}`.trim()}
        </span>
        <button
          type="button"
          className="iconbtn"
          aria-label="Sumar"
          onClick={() => setValue((v) => v + (isTime ? durationStep(v, 1) : 1))}
        >
          +
        </button>
      </div>
      {value !== block.targetValue && (
        <ScopeSave
          weekday={block.weekday}
          multi={goalBlocks.length > 1}
          disabled={busy}
          label={isTime ? 'Guardar la duración' : 'Guardar la cantidad'}
          onSave={(scope) => void run(() => onSaveValue(value, scope))}
        />
      )}

      {canSkip(state, day, todayISO()) && (
        <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => void run(onSkip)}>
          Saltar solo este día
        </button>
      )}
      {state === 'skipped' && (
        <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => void run(onUnskip)}>
          Deshacer salto
        </button>
      )}

      {!confirmRemove ? (
        <button
          className="btn--link"
          style={{ color: 'var(--danger)', alignSelf: 'center' }}
          onClick={() => setConfirmRemove(true)}
        >
          Sacar la meta de la agenda
        </button>
      ) : (
        <div className="card card--tight stack stack--sm" style={{ borderColor: 'var(--danger)' }}>
          <p className="small" style={{ margin: 0 }}>
            La meta queda sin horario; la seguirás viendo arriba en Hoy. Tu historial se conserva.
          </p>
          <div className="row wrap">
            <button
              className="btn btn--danger btn--sm"
              disabled={busy}
              onClick={() => void run(onRemoveFromAgenda)}
            >
              Sacar de la agenda
            </button>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirmRemove(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
