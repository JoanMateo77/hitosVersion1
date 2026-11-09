import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { canResize, type DayContextHabit, type DayItem, type DayQuestion } from '@/domain/dayPlan'
import { appliedLabel, applyLabel, draftSections, type DraftRow } from '@/screens/calendar/dayDraftView'
import { DAY_MESSAGE_MAX } from '@/domain/dayPlanAi'
import type { DayOpExecutors } from '@/domain/dayOps'
import { useDayPlanner, type DayPlanner } from '@/hooks/useDayPlanner'
import { formatDuration, formatTime12, formatWeekday } from '@/lib/date'
import { Sheet } from '@/components/Sheet'
import { CoachComposer, CoachOrb } from '@/components/coach/CoachChatView'
import { IconChevronRight, IconClose } from '@/components/icons'
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
          <div className="row row--between dayplan-head">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{title}</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
              <IconClose />
            </button>
          </div>
          {/* Texto fijo: el detalle del modo automático vive en su interruptor. */}
          <p className="small muted" style={{ margin: 0 }}>
            Cuéntame qué tienes y qué quieres hacer.{' '}
            <button type="button" className="btn--link dayplan-help" onClick={() => iaTour().start('ia-composer')}>
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
              // Ni mientras guarda: un mensaje nuevo cambiaría el borrador ya guardado.
              disabled={planner.pending || planner.saving || planner.applied}
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

          <AutoSwitch planner={planner} />

          <Draft planner={planner} />

          <div className="dayplan-footer" data-tour="ia-apply">
            {/* Región viva siempre montada: así el lector de pantalla anuncia el cambio. */}
            <p className="dayplan-footer__status" role="status">
              {footerStatus(planner)}
            </p>
            {planner.applied ? (
              <div className="row row--sm dayplan-applied">
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
              </div>
            ) : (
              <ApplyButton planner={planner} />
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

/** Texto de la región viva del pie: lo guardado o lo que espera revisión. */
function footerStatus(planner: DayPlanner): string {
  if (planner.applied) return appliedLabel(planner.ops)
  if (planner.needsReview) return 'Esto mueve cosas que ya tenías: revísalo y guarda.'
  return ''
}

/** Interruptor "Aplicar solo": la IA guarda lo que agrega sin pasar por el botón. */
function AutoSwitch({ planner }: Readonly<{ planner: DayPlanner }>) {
  // Ya aplicado se queda a la vista (deshabilitado): desmontarlo movería la hoja.
  return (
    <div className="dayplan-auto">
      <span className="small">
        <span id="dayplan-auto-label">Aplicar solo</span>
        <span id="dayplan-auto-hint" className="field__hint" style={{ display: 'block' }}>
          Lo que la IA agrega se guarda al momento y lo puedes deshacer. Si tiene dudas, te pregunta primero.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={planner.auto}
        aria-labelledby="dayplan-auto-label"
        aria-describedby="dayplan-auto-hint"
        className="switch"
        disabled={planner.applied}
        onClick={() => planner.setAuto(!planner.auto)}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  )
}

/** Botón principal: dice qué pasa al tocarlo. Sin cambios no hay botón, solo la pista. */
function ApplyButton({ planner }: Readonly<{ planner: DayPlanner }>) {
  // El pulso se repite solo cuando hay MÁS por guardar (no al bajar ni al volver de "Guardando…").
  const [pulse, setPulse] = useState(0)
  const prev = useRef(planner.changes)
  useEffect(() => {
    if (planner.changes > prev.current) setPulse((n) => n + 1)
    prev.current = planner.changes
  }, [planner.changes])

  if (planner.changes === 0) {
    // Al empezar ya están los ejemplos: la pista solo aparece cuando hubo conversación.
    if (planner.messages.length === 0) return null
    return <p className="small muted dayplan-footer__hint">Cuando la IA proponga algo, aquí lo guardas en tu agenda.</p>
  }
  return (
    <button
      type="button"
      className="btn btn--primary btn--block dayplan-apply"
      disabled={planner.saving || planner.pending}
      onClick={() => void planner.apply()}
    >
      {pulse > 0 && <span key={pulse} className="dayplan-apply__pulse" aria-hidden="true" />}
      {planner.saving ? 'Guardando…' : applyLabel(planner.ops)}
    </button>
  )
}

function DraftCard({
  row,
  tag,
  index,
  planner,
  byRef,
  editing,
  onEdit,
}: Readonly<{
  row: DraftRow
  tag: string
  index: number
  planner: DayPlanner
  byRef: Map<string, DayItem>
  editing: string | null
  onEdit: (ref: string | null) => void
}>) {
  const it = row.item
  const open = editing === it.ref
  const together = row.placed.overlapsWith.flatMap((ref) => {
    const other = byRef.get(ref)
    return other ? [`A la vez con ${other.title}`] : []
  })
  const notes = [...together, ...(row.placed.outsideWindow ? ['Fuera de su momento'] : [])]
  const time = `${formatTime12(row.start)} – ${formatTime12(row.end)}`
  const label = [`Editar ${it.title}`, tag, time, row.from ? `antes ${formatTime12(row.from)}` : '', ...notes].filter(Boolean).join(', ')
  return (
    <div className="dayplan-card" style={cardStyle(it, index)}>
      <button
        type="button"
        className="dayplan-card__main"
        aria-expanded={open}
        aria-label={label}
        // Mientras la IA responde no se edita: su respuesta lo pisaría.
        disabled={planner.applied || planner.pending}
        onClick={() => onEdit(open ? null : it.ref)}
      >
        <span className="dayplan-card__tag">{tag}</span>
        <span className="dayplan-card__title">{it.title}</span>
        <span className="dayplan-card__time">
          {time}
          {row.from ? ` · antes ${formatTime12(row.from)}` : ''}
        </span>
        {notes.length > 0 && <span className="dayplan-card__notes">{notes.join(' · ')}</span>}
      </button>
      {open && !planner.pending && <ItemEditor item={it} start={row.start} planner={planner} />}
    </div>
  )
}

/** Color del área (solo lo nuevo; lo movido usa el azul de acción) y orden de entrada. */
function cardStyle(item: DayItem, index: number): CSSProperties {
  const accent = item.source === 'new' ? nicheAccent(looseArea(item.title, item.area)) : {}
  return { ...accent, '--i': Math.min(index, 5) } as CSSProperties
}

const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function Draft({ planner }: Readonly<{ planner: DayPlanner }>) {
  const [editing, setEditing] = useState<string | null>(null)
  const [showRest, setShowRest] = useState(false)
  const changesRef = useRef<HTMLElement>(null)
  const byRef = new Map(planner.items.map((i) => [i.ref, i]))
  const s = draftSections(planner.plan, planner.items)
  const hasChanges = s.added.length + s.addedUntimed.length + s.moved.length + s.unplaced.length > 0

  // Cuando la IA responde, la vista baja a lo que cambia: lo nuevo no se pierde.
  // Solo por respuestas (no al editar una hora a mano) y sin animar si se pidió menos movimiento.
  const replies = planner.messages.filter((m) => m.role === 'coach').length
  useEffect(() => {
    if (replies === 0) return
    changesRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [replies])

  if (planner.items.length === 0) {
    return <p className="muted small">Tu día está libre. Cuéntame qué quieres hacer.</p>
  }

  const done = planner.applied
  const newTag = done ? 'Agregado' : 'Nuevo'
  const cardProps = { planner, byRef, editing, onEdit: setEditing }
  let order = 0
  return (
    <section className="stack stack--sm" aria-label="Borrador del día">
      {hasChanges && (
        <section
          ref={changesRef}
          className={`dayplan-changes stack stack--sm${done ? ' dayplan-changes--saved' : ''}`}
          aria-label={done ? 'Lo que se guardó' : 'Lo que cambia'}
        >
          {(s.added.length > 0 || s.addedUntimed.length > 0) && (
            <p className="reorg-kicker">{done ? 'Se agregó a tu día' : 'Esto se agregará a tu día'}</p>
          )}
          {s.added.map((r) => (
            <DraftCard key={r.item.ref} row={r} tag={newTag} index={order++} {...cardProps} />
          ))}
          {s.addedUntimed.map((i) => (
            <div key={i.ref} className="dayplan-card" style={cardStyle(i, order++)}>
              <div className="dayplan-card__main dayplan-card__main--static">
                <span className="dayplan-card__tag">{newTag}</span>
                <span className="dayplan-card__title">{i.title}</span>
                <span className="dayplan-card__time">Sin hora · cuando puedas</span>
              </div>
            </div>
          ))}
          {s.moved.length > 0 && <p className="reorg-kicker">{done ? 'Cambió de hora' : 'Esto cambia de hora'}</p>}
          {s.moved.map((r) => (
            <DraftCard key={r.item.ref} row={r} tag="Movido" index={order++} {...cardProps} />
          ))}
          {s.unplaced.length > 0 && (
            <>
              <p className="reorg-kicker">No cupo este día</p>
              {s.unplaced.map((i) => (
                <p key={i.ref} className="small muted" style={{ margin: 0 }}>
                  {i.title}
                </p>
              ))}
            </>
          )}
        </section>
      )}

      {planner.assumptions.length > 0 && (
        <ul className="dayplan-assumptions">
          {planner.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {s.rest.length > 0 && (
        <div className="dayplan-rest">
          <button
            type="button"
            className="dayplan-rest__toggle"
            aria-expanded={showRest}
            aria-controls="dayplan-rest-list"
            onClick={() => setShowRest((v) => !v)}
          >
            {showRest ? 'Ocultar el resto de tu día' : `Ver el resto de tu día (${s.rest.length})`}
            <IconChevronRight size={16} className="dayplan-rest__chevron" />
          </button>
          {/* Siempre montada para animar la altura; cerrada es inert (ni foco ni lector). */}
          <div className="dayplan-rest__body" data-open={showRest} inert={!showRest}>
            <ul id="dayplan-rest-list" className="dayplan-rest__list">
              {s.rest.map((r) => (
                <li key={r.key}>
                  <span className="dayplan-rest__time">{r.starts.map(formatTime12).join(', ')}</span>
                  <span className="dayplan-rest__title">{r.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
