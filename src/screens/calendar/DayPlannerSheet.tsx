import { useState } from 'react'
import { groupIntoBlocks } from '@/domain/agenda'
import { canResize, type DayContextHabit, type DayItem, type DayQuestion, type PlacedItem } from '@/domain/dayPlan'
import { DAY_MESSAGE_MAX } from '@/domain/dayPlanAi'
import type { DayOpExecutors } from '@/domain/dayOps'
import { useDayPlanner, type DayPlanner } from '@/hooks/useDayPlanner'
import { formatDuration, formatTime12, formatWeekday } from '@/lib/date'
import { Sheet } from '@/components/Sheet'
import { CoachComposer, CoachOrb } from '@/components/coach/CoachChatView'
import { IconClose } from '@/components/icons'
import { iaTour } from '@/components/tour/iaTour'
import { looseArea } from '@/domain/looseArea'
import { nicheAccent } from '@/lib/nicheAccent'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180]

/** Ejemplos que se tocan para empezar: muestran que sirve decir duraciones y horas. */
const DAY_EXAMPLES = [
  'Desde ahora: ordenar la casa 1 h, revisar la moto 45 min y estudiar inglés 30 min',
  'Reunión de 9 a 11, gimnasio 1 h en la tarde y llamar al banco cuando pueda',
]

/**
 * Hoja "Organizar el día": la persona cuenta su día, la IA lo entiende, la app
 * arma un borrador con preguntas y nada se guarda hasta "Aplicar".
 * Spec: docs/superpowers/specs/2026-11-07-ia-organizar-dia-design.md §5.2
 */
export function DayPlannerSheet({
  day,
  nowMin,
  baseItems,
  habits,
  goals,
  executors,
  onClose,
  onManual,
}: Readonly<{
  day: string
  nowMin: number | null
  baseItems: DayItem[]
  habits: DayContextHabit[]
  goals: Array<{ id: string; title: string }>
  executors: DayOpExecutors
  onClose: () => void
  /** Cierra esta hoja y abre "Reorganizar el día" (a mano). */
  onManual: () => void
}>) {
  const planner = useDayPlanner({
    date: day,
    nowMin,
    baseItems,
    habits,
    goals,
    executors,
  })
  // A dónde iba la persona cuando se le pidió confirmar: cerrar o reorganizar a mano.
  const [confirmExit, setConfirmExit] = useState<'close' | 'manual' | null>(null)
  // Ejemplo tocado: llena el cuadro para que la persona lo ajuste antes de enviar.
  const [example, setExample] = useState<{ text: string } | null>(null)
  const dirty = planner.changes > 0 && !planner.applied
  /** Salir solo si no hay borrador sin aplicar (si lo hay, pregunta primero). */
  const leave = (to: 'close' | 'manual') => {
    if (!dirty) return true
    setConfirmExit(to)
    return false
  }
  const weekday = formatWeekday(day)
  const title = `Organizar el ${weekday.charAt(0).toLowerCase()}${weekday.slice(1)}`

  return (
    <Sheet
      onClose={onClose}
      label={title}
      panelClassName="stack stack--lg dayplan"
      side
      // Mientras guarda no se cierra: el "Deshacer" se perdería a medias.
      guard={() => !planner.saving && leave('close')}
    >
      {(close, forceClose) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{title}</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
              <IconClose />
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Cuéntame qué tienes y qué quieres hacer. Nada se guarda sin tu sí.{' '}
            <button type="button" className="btn--link" onClick={() => iaTour().start('ia-composer')}>
              ¿Cómo funciona?
            </button>
          </p>

          {confirmExit && (
            <div className="dayplan-confirm" role="alertdialog" aria-label="¿Salir sin aplicar?">
              <p className="small" style={{ margin: 0 }}>
                ¿Salir sin aplicar? Se perderá el borrador.
              </p>
              <div className="row row--sm">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setConfirmExit(null)}>
                  Seguir
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={planner.saving}
                  onClick={confirmExit === 'manual' ? onManual : forceClose}
                >
                  Salir
                </button>
              </div>
            </div>
          )}

          <Thread planner={planner} onManual={() => leave('manual') && onManual()} />

          {!planner.applied && planner.questions.length > 0 && (
            <div className="stack stack--sm" aria-label="Preguntas para armar tu día">
              {planner.questions.map((q) => (
                <QuestionCard key={q.id} question={q} planner={planner} />
              ))}
            </div>
          )}

          <div className="stack stack--sm" data-tour="ia-composer">
            <CoachComposer
              onSend={(t) => void planner.send(t)}
              disabled={planner.pending || planner.applied}
              multiline
              maxLength={DAY_MESSAGE_MAX}
              label="Cuéntame tu día"
              placeholder="Ej.: reunión de 9 a 11, gimnasio, recoger a los niños a las 4…"
              autoFocus
              prefill={example}
            />
            {planner.messages.length === 0 && !planner.pending && (
              <div className="dayplan-examples" aria-label="Ejemplos para empezar">
                <span className="tiny muted">Prueba con un ejemplo:</span>
                {DAY_EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="chip chip--quiet dayplan-example" onClick={() => setExample({ text: ex })}>
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Draft planner={planner} />

          <div className="dayplan-footer">
            {planner.applied ? (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={planner.saving}
                  onClick={() => void planner.undo()}
                >
                  Deshacer
                </button>
                <button type="button" className="btn btn--primary" onClick={forceClose}>
                  Listo
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--block"
                data-tour="ia-apply"
                disabled={planner.changes === 0 || planner.saving || planner.pending}
                onClick={() => void planner.apply()}
              >
                {planner.saving
                  ? 'Guardando…'
                  : `Aplicar (${planner.changes} ${planner.changes === 1 ? 'cambio' : 'cambios'})`}
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}

function Thread({ planner, onManual }: Readonly<{ planner: DayPlanner; onManual: () => void }>) {
  if (planner.messages.length === 0 && !planner.pending && !planner.error) return null
  return (
    <div className="coach-thread" aria-live="polite">
      {planner.messages.map((m) => (
        <p key={m.id} className={`coach-msg coach-msg--${m.role}`}>
          {m.text}
        </p>
      ))}
      {planner.pending && (
        <p className="coach-msg coach-msg--coach coach-typing" aria-label="Organizando tu día">
          <i />
          <i />
          <i />
        </p>
      )}
      {planner.error && (
        <output className="small dayplan-error">
          {planner.error}{' '}
          <button type="button" className="btn--link" onClick={onManual}>
            Reorganizar a mano
          </button>
        </output>
      )}
    </div>
  )
}

function QuestionCard({ question, planner }: Readonly<{ question: DayQuestion; planner: DayPlanner }>) {
  const [free, setFree] = useState(false)
  return (
    <div className="dayplan-question">
      <div className="row row--sm" style={{ alignItems: 'flex-start' }}>
        <CoachOrb size={24} />
        <p className="small" style={{ margin: 0, flex: 1 }}>
          {question.text}
        </p>
      </div>
      <div className="dayplan-options">
        {question.options.map((o) => (
          <button
            key={o.label}
            type="button"
            className="chip"
            disabled={planner.pending}
            onClick={() => planner.choose(question, o)}
          >
            {o.label}
          </button>
        ))}
        {!free && (
          <button type="button" className="chip chip--quiet" onClick={() => setFree(true)}>
            Otra respuesta
          </button>
        )}
      </div>
      {free && (
        <CoachComposer
          onSend={(t) => {
            setFree(false)
            void planner.send(`${question.text} ${t}`)
          }}
          disabled={planner.pending}
          label={`Tu respuesta: ${question.text}`}
          placeholder="Escribe tu respuesta"
          autoFocus
        />
      )}
    </div>
  )
}

function tagsOf(p: PlacedItem, byRef: Map<string, DayItem>): string[] {
  const tags: string[] = []
  if (p.status === 'new') tags.push('Nuevo')
  if (p.status === 'moved') tags.push(p.from ? `Movido de ${formatTime12(p.from)}` : 'Con hora nueva')
  for (const ref of p.overlapsWith) {
    const other = byRef.get(ref)
    if (other) tags.push(`A la vez con ${other.title}`)
  }
  if (p.outsideWindow) tags.push('Fuera de su momento')
  return tags
}

function Draft({ planner }: Readonly<{ planner: DayPlanner }>) {
  const [editing, setEditing] = useState<string | null>(null)
  const byRef = new Map(planner.items.map((i) => [i.ref, i]))
  const placedByRef = new Map(planner.plan.placed.map((p) => [p.ref, p]))
  const blocks = groupIntoBlocks(
    planner.plan.placed.map((p) => ({
      key: p.ref,
      start: p.start,
      end: p.end,
    })),
  )
  const unplaced = planner.plan.conflicts.flatMap((c) => (c.kind === 'no_room' ? [c.ref] : []))

  if (planner.items.length === 0) {
    return <p className="faint small">Tu día está libre. Cuéntame qué quieres hacer.</p>
  }

  return (
    <section className="stack stack--sm" aria-label="Borrador del día">
      <p className="reorg-kicker">Tu día</p>
      {blocks.map((b) => (
        <div key={b.key} className="dayplan-block">
          {b.items.map((span) => {
            const it = byRef.get(span.key)
            const p = placedByRef.get(span.key)
            if (!it || !p) return null
            const tags = tagsOf(p, byRef)
            const open = editing === it.ref
            return (
              <div
                key={it.ref}
                className={`dayplan-item${p.status === 'same' ? '' : ' dayplan-item--changed'}${it.source === 'new' ? ' dayplan-item--area' : ''}`}
                // Lo nuevo se ve con el color del área que eligió la IA: el mismo que tendrá en la agenda.
                style={it.source === 'new' ? nicheAccent(looseArea(it.title, it.area)) : undefined}
              >
                <button
                  type="button"
                  className="dayplan-item__main"
                  aria-expanded={open}
                  // Mientras la IA responde no se edita: su respuesta lo pisaría.
                  disabled={planner.applied || planner.pending}
                  onClick={() => setEditing(open ? null : it.ref)}
                >
                  <span className="dayplan-item__time">
                    {formatTime12(p.start)} – {formatTime12(p.end)}
                  </span>
                  <span className="dayplan-item__title">{it.title}</span>
                  {tags.length > 0 && <span className="dayplan-item__tags">{tags.join(' · ')}</span>}
                </button>
                {open && !planner.pending && <ItemEditor item={it} start={p.start} planner={planner} />}
              </div>
            )
          })}
        </div>
      ))}

      {unplaced.length > 0 && (
        <>
          <p className="reorg-kicker">Por ubicar</p>
          {unplaced.map((ref) => (
            <p key={ref} className="small muted" style={{ margin: 0 }}>
              {byRef.get(ref)?.title}
            </p>
          ))}
        </>
      )}

      {planner.plan.untimed.length > 0 && (
        <>
          <p className="reorg-kicker">Sin hora</p>
          {planner.plan.untimed.map((ref) => (
            <p key={ref} className="small" style={{ margin: 0 }}>
              {byRef.get(ref)?.title}
            </p>
          ))}
        </>
      )}

      {planner.assumptions.length > 0 && (
        <ul className="dayplan-assumptions">
          {planner.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemEditor({ item, start, planner }: Readonly<{ item: DayItem; start: string; planner: DayPlanner }>) {
  const durations = DURATIONS.includes(item.durationMin)
    ? DURATIONS
    : [...DURATIONS, item.durationMin].sort((a, b) => a - b)
  return (
    <div className="dayplan-editor">
      <label className="dayplan-editor__field">
        <span className="tiny muted">Hora</span>
        <input
          className="input"
          type="time"
          value={item.start ?? start}
          onChange={(e) => planner.editItem(item.ref, { start: e.target.value || null })}
        />
      </label>
      {canResize(item) && (
        <label className="dayplan-editor__field">
          <span className="tiny muted">Duración</span>
          <select
            className="input"
            value={item.durationMin}
            onChange={(e) =>
              planner.editItem(item.ref, {
                durationMin: Number(e.target.value),
              })
            }
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="dayplan-editor__check">
        <input
          type="checkbox"
          checked={item.fixed}
          onChange={(e) =>
            planner.editItem(item.ref, {
              fixed: e.target.checked,
              start: item.start ?? start,
            })
          }
        />
        <span className="small">Hora fija</span>
      </label>
    </div>
  )
}
