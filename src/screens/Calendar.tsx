import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal } from '@/lib/types'
import { listGoals } from '@/services/goals'
import {
  createEvent,
  deleteEvent,
  listEventsInRange,
  updateEvent,
  type EventInput,
} from '@/services/events'
import { WEEKDAY_LABELS, groupByDate, inSameMonth, monthGrid, weekDays } from '@/domain/calendar'
import {
  addDays,
  addMonths,
  dayOfMonth,
  formatMonthYear,
  formatWeekday,
  isToday,
  todayISO,
} from '@/lib/date'
import { LoadingScreen } from '@/components/LoadingScreen'
import { IconArrowReturn, IconBack, IconClose, IconFlag, IconPlus } from '@/components/icons'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useToast } from '@/app/toast'
import { Hint } from '@/components/Hint'

type View = 'day' | 'week' | 'month'

/**
 * Agenda / calendario propio del usuario (Sección 4): vistas día / semana / mes,
 * eventos con horario opcional y vínculo opcional a una meta. La semana arranca
 * el lunes. No sincroniza con Google (queda fuera del alcance de este MVP).
 */
export function Calendar() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(todayISO()) // mes / semana de referencia
  const [selected, setSelected] = useState(todayISO()) // día activo
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; date: string } | null>(null)

  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const week = useMemo(() => weekDays(anchor), [anchor])

  // Rango a traer según la vista (el de mes cubre la grilla completa de 6 semanas).
  const [from, to] = useMemo<[string, string]>(() => {
    if (view === 'week') return [week[0], week[6]]
    if (view === 'day') return [selected, selected]
    return [grid[0][0], grid[5][6]]
  }, [view, week, grid, selected])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setError(null)
        const [evs, gs] = await Promise.all([
          listEventsInRange(userId, from, to),
          listGoals(userId),
        ])
        if (!active) return
        setEvents(evs)
        setGoals(gs)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar tu agenda.')
      } finally {
        if (active) setReady(true)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [userId, from, to])

  const eventsByDate = useMemo(() => groupByDate(events), [events])
  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g] as const)), [goals])
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])

  // Fechas objetivo de metas activas, para marcarlas en la agenda (Sección 4.2).
  const deadlinesByDate = useMemo(() => {
    const m = new Map<string, Goal[]>()
    for (const g of goals) {
      if (g.status === 'active' && g.targetDate) {
        const list = m.get(g.targetDate)
        if (list) list.push(g)
        else m.set(g.targetDate, [g])
      }
    }
    return m
  }, [goals])

  function shift(dir: 1 | -1) {
    if (view === 'day') setSelected((s) => addDays(s, dir))
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7))
    else setAnchor((a) => addMonths(a, dir))
  }

  function goToday() {
    const t = todayISO()
    setSelected(t)
    setAnchor(t)
  }

  function changeView(v: View) {
    setAnchor(selected) // al cambiar de vista, centramos en el día activo
    setView(v)
  }

  function selectDay(d: string) {
    setSelected(d)
    if (view === 'month' && !inSameMonth(d, anchor)) setAnchor(d)
  }

  async function submitEvent(input: EventInput) {
    const current = editing?.event ?? null
    const wasLinked = current?.goalId ?? null
    if (current) {
      const updated = await updateEvent(current.id, input)
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    } else {
      const created = await createEvent(userId, input)
      setEvents((prev) => [...prev, created])
    }
    setEditing(null)
    // Si quedó vinculado a una meta (recién o ya estaba), cerramos el bucle: el
    // usuario ve cómo el tiempo de su agenda se conecta con lo que se propuso.
    if (input.goalId && input.goalId !== wasLinked) {
      const goal = goalById.get(input.goalId)
      if (goal) toast(`Lo sumamos a “${goal.title}”.`, 'success')
      else toast('Evento guardado.')
    } else {
      toast(current ? 'Evento actualizado.' : 'Evento guardado.')
    }
  }

  async function removeEditingEvent() {
    const current = editing?.event
    if (!current) return
    await deleteEvent(current.id)
    setEvents((prev) => prev.filter((e) => e.id !== current.id))
    setEditing(null)
    toast('Evento borrado.')
  }

  const headerTitle =
    view === 'day' ? formatWeekday(selected) : formatMonthYear(view === 'week' ? week[0] : anchor)

  const dayProps = (day: string) => ({
    day,
    events: eventsByDate.get(day) ?? [],
    deadlines: deadlinesByDate.get(day) ?? [],
    goalById,
    onAdd: () => setEditing({ event: null, date: day }),
    onOpen: (e: CalendarEvent) => setEditing({ event: e, date: e.date }),
    onGoal: (g: Goal) => navigate(`/metas/${g.id}`),
  })

  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">Tu agenda</p>
        <h1 className="screen__title">{headerTitle}</h1>
      </header>

      <div className="row row--between" style={{ marginBottom: 'var(--s4)' }}>
        <div className="row row--sm">
          <button className="iconbtn" onClick={() => shift(-1)} aria-label="Anterior">
            <IconBack />
          </button>
          <button className="btn btn--subtle btn--sm" onClick={goToday}>
            Hoy
          </button>
          <button className="iconbtn" onClick={() => shift(1)} aria-label="Siguiente">
            <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
              <IconBack />
            </span>
          </button>
        </div>
        <div className="seg" role="group" aria-label="Vista del calendario">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              className={`seg__btn${view === v ? ' seg__btn--active' : ''}`}
              aria-pressed={view === v}
              onClick={() => changeView(v)}
            >
              {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {ready && error && (
        <div className="alert alert--error" style={{ marginBottom: 'var(--s4)' }}>
          {error}
        </div>
      )}

      {ready && !error && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Hint id="calendar-uses-2026-05">
            Acá podés agendar reuniones, bloquear tiempo para una meta, y dejar{' '}
            <strong>notas</strong> en cada evento. Si lo vinculás a una meta, vemos cuánto tiempo
            le dedicás por semana.
          </Hint>
        </div>
      )}

      {!ready ? (
        <LoadingScreen error={error ?? undefined} />
      ) : view === 'month' ? (
        <>
          <div className="cal-grid" style={{ marginBottom: 'var(--s2)' }}>
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="cal-dow">
                {w}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {grid.flat().map((day) => {
              const evs = eventsByDate.get(day) ?? []
              const cls = ['cal-cell']
              if (!inSameMonth(day, anchor)) cls.push('cal-cell--out')
              if (isToday(day)) cls.push('cal-cell--today')
              if (day === selected) cls.push('cal-cell--selected')
              return (
                <button key={day} className={cls.join(' ')} onClick={() => selectDay(day)}>
                  <span>{dayOfMonth(day)}</span>
                  <span className="cal-cell__dots">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id} className="cal-dot" />
                    ))}
                    {deadlinesByDate.has(day) && <span className="cal-dot cal-dot--goal" />}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 'var(--s5)' }}>
            <DaySection {...dayProps(selected)} />
          </div>
        </>
      ) : view === 'week' ? (
        <div className="stack">
          {week.map((day) => (
            <DaySection key={day} {...dayProps(day)} />
          ))}
        </div>
      ) : (
        <DaySection {...dayProps(selected)} />
      )}

      {editing && (
        <EventEditor
          key={editing.event?.id ?? `new-${editing.date}`}
          initial={editing.event}
          date={editing.date}
          goals={activeGoals}
          onClose={() => setEditing(null)}
          onSubmit={submitEvent}
          onDelete={removeEditingEvent}
        />
      )}
    </div>
  )
}

/** Un día con sus eventos. Se reutiliza en las vistas día, semana y mes. */
function DaySection({
  day,
  events,
  deadlines,
  goalById,
  onAdd,
  onOpen,
  onGoal,
}: {
  day: string
  events: CalendarEvent[]
  deadlines: Goal[]
  goalById: Map<string, Goal>
  onAdd: () => void
  onOpen: (e: CalendarEvent) => void
  onGoal: (g: Goal) => void
}) {
  const empty = events.length === 0 && deadlines.length === 0
  return (
    <section className="cal-day stack stack--sm">
      <div className="row row--between">
        <span className={`cal-day__label${isToday(day) ? ' cal-day__label--today' : ''}`}>
          {formatWeekday(day)}
        </span>
        <button className="iconbtn iconbtn--sm" onClick={onAdd} aria-label="Agregar evento">
          <IconPlus size={18} />
        </button>
      </div>

      {empty ? (
        <p className="faint small">Sin eventos.</p>
      ) : (
        <div className="stack stack--sm">
          {deadlines.map((g) => (
            <button key={`d-${g.id}`} className="ev ev--goal" onClick={() => onGoal(g)}>
              <span className="ev__time" style={{ display: 'inline-flex', justifyContent: 'flex-start' }}>
                <IconFlag size={14} className="muted" />
              </span>
              <span className="ev__title">
                Meta: {g.title} <span className="faint tiny">· fecha objetivo</span>
              </span>
            </button>
          ))}
          {events.map((e) => {
            const goal = e.goalId ? goalById.get(e.goalId) : null
            const notePreview = e.notes ? e.notes.trim().split('\n')[0] : null
            return (
              <button key={e.id} className="ev" onClick={() => onOpen(e)}>
                <span className="ev__time">{e.allDay ? 'Día' : e.startTime}</span>
                <span className="ev__body">
                  <span className="ev__title">{e.title}</span>
                  {(goal || notePreview) && (
                    <span className="ev__meta">
                      {goal && (
                        <span className="tag">
                          <IconArrowReturn size={11} /> {goal.title}
                        </span>
                      )}
                      {notePreview && (
                        <span className="ev__note" title={e.notes ?? undefined}>
                          {notePreview}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Hoja inferior para crear / editar / borrar un evento. */
function EventEditor({
  initial,
  date,
  goals,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: CalendarEvent | null
  date: string
  goals: Goal[]
  onClose: () => void
  onSubmit: (input: EventInput) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [eventDate, setEventDate] = useState(initial?.date ?? date)
  const [allDay, setAllDay] = useState(initial?.allDay ?? true)
  const [startTime, setStartTime] = useState(initial?.startTime ?? '')
  const [endTime, setEndTime] = useState(initial?.endTime ?? '')
  const [goalId, setGoalId] = useState(initial?.goalId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const panelRef = useRef<HTMLFormElement>(null)
  useFocusTrap(panelRef, onClose)

  // Body-lock mientras el sheet está abierto: el fondo no scrollea, no hay leakage
  // de gestos. Restauramos el estado anterior al cerrar para no pisar usos previos.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const canSave = title.trim().length > 0 && (allDay || startTime.length > 0)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setErr(null)
    onSubmit({
      title: title.trim(),
      date: eventDate,
      allDay,
      startTime: allDay ? null : startTime || null,
      endTime: allDay ? null : endTime || null,
      goalId: goalId || null,
      notes: notes.trim() || null,
    }).catch((e2: unknown) => {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar.')
      setSaving(false)
    })
  }

  function handleDelete() {
    setSaving(true)
    setErr(null)
    onDelete().catch((e2: unknown) => {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo borrar.')
      setSaving(false)
    })
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <form ref={panelRef} className="sheet__panel stack stack--lg" onSubmit={handleSubmit}>
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{initial ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <input
          className="input"
          autoFocus
          placeholder="¿Qué tenés? Ej: Clase de inglés"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="next"
          inputMode="text"
        />

        <div className="field">
          <span className="field__label">Cuándo</span>
          {eventDate && <span className="muted small">{formatWeekday(eventDate)}</span>}
          <input
            className="input"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <div className="seg" role="group" aria-label="Tipo de evento" style={{ alignSelf: 'flex-start' }}>
            <button
              type="button"
              className={`seg__btn${allDay ? ' seg__btn--active' : ''}`}
              aria-pressed={allDay}
              onClick={() => setAllDay(true)}
            >
              Todo el día
            </button>
            <button
              type="button"
              className={`seg__btn${!allDay ? ' seg__btn--active' : ''}`}
              aria-pressed={!allDay}
              onClick={() => setAllDay(false)}
            >
              Con horario
            </button>
          </div>
          {!allDay && (
            <div className="row">
              <input
                className="input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="Hora de inicio"
              />
              <span className="faint">a</span>
              <input
                className="input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="Hora de fin"
              />
            </div>
          )}
        </div>

        {goals.length > 0 && (
          <div className="field">
            <span className="field__label">¿Es para una meta?</span>
            <span className="field__hint">
              Opcional. Ligarlo te muestra cuánto le dedicás a esa meta.
            </span>
            <select className="input" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">Sin meta</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <span className="field__label">Notas</span>
          <textarea
            className="textarea"
            placeholder="Detalles, lugar, link… (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoCapitalize="sentences"
            autoCorrect="on"
            enterKeyHint="enter"
          />
        </div>

        {err && <div className="alert alert--error">{err}</div>}

        <button className="btn btn--primary btn--block" type="submit" disabled={!canSave || saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear evento'}
        </button>
        {initial && (
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={handleDelete}
            disabled={saving}
          >
            Borrar evento
          </button>
        )}
      </form>
    </div>
  )
}
