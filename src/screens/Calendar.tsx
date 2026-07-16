import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, ScheduleBlock, Session } from '@/lib/types'
import { listGoals } from '@/services/goals'
import {
  createEvent,
  deleteEvent,
  listEventsInRange,
  updateEvent,
  type EventInput,
} from '@/services/events'
import { WEEKDAY_LABELS, groupByDate, inSameMonth, monthGrid, weekDays } from '@/domain/calendar'
import { WEEKDAY_PLURALS } from '@/domain/commitment'
import { dueBlocksForDate } from '@/domain/sessions'
import { listScheduleForUser, updateBlockStartTime } from '@/services/schedule'
import { createSpontaneousSession, listSessionsInRange, setSessionPlannedTime } from '@/services/sessions'
import { nicheAccent } from '@/lib/nicheAccent'
import { friendlyError } from '@/lib/errors'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/lib/formDraft'
import {
  addDays,
  addMonths,
  dayOfMonth,
  formatMonthYear,
  formatTime12,
  formatWeekday,
  isToday,
  todayISO,
} from '@/lib/date'
import { LoadingScreen } from '@/components/LoadingScreen'
import { IconArrowReturn, IconBack, IconClose, IconFlag, IconPlus } from '@/components/icons'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { NicheIcon } from '@/components/NicheGlyph'
import { useToast } from '@/app/toast'
import { Hint } from '@/components/Hint'
import { sessionCache } from '@/lib/sessionCache'
import { useCacheMirror } from '@/hooks/useCacheMirror'

type View = 'day' | 'week' | 'month'

/** Instantánea de datos cacheada por sesión (por rango de fechas) para pintar al instante. */
type CalSnapshot = { events: CalendarEvent[]; goals: Goal[]; blocks: ScheduleBlock[]; sessions: Session[] }

/** Una sesión tal como se ve en la agenda: real (fila en BD) o proyectada del compromiso. */
interface DayAgendaSession {
  key: string
  goal: Goal
  time: string | null
  state: 'pending' | 'running' | 'done' | 'partial' | 'missed' | 'unconfirmed' | 'projected'
  targetLabel: string
  session: Session | null
  block: ScheduleBlock | null
}

function sessionStateLabel(state: DayAgendaSession['state']): string {
  switch (state) {
    case 'done':
      return 'hecha'
    case 'partial':
      return 'parcial'
    case 'missed':
      return 'no pudiste'
    case 'running':
      return 'en curso'
    case 'unconfirmed':
      return 'sin confirmar'
    case 'projected':
      return 'comprometida'
    default:
      return 'pendiente'
  }
}

/**
 * Agenda / calendario propio del usuario (Sección 4): vistas día / semana / mes,
 * eventos con horario opcional y vínculo opcional a una meta. La semana arranca
 * el lunes. No sincroniza con Google (queda fuera del alcance de este MVP).
 */
export function Calendar() {
  const { userId, profile } = useSession()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Hora sugerida para el TimeSheet según el momento preferido del perfil.
  const suggestedTime =
    profile.preferredMoment === 'morning'
      ? '08:00'
      : profile.preferredMoment === 'midday'
        ? '13:00'
        : profile.preferredMoment === 'evening'
          ? '19:00'
          : null

  const [params] = useSearchParams()
  // ?d=YYYY-MM-DD (p. ej. al tocar un evento en Today) abre ese día directo.
  const dParam = params.get('d')
  const initialDate = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) ? dParam : null
  // En el teléfono la agenda abre en el DÍA (lo inmediato primero); en
  // escritorio abre en MES, que ahí es la vista de calendario completa.
  const [view, setView] = useState<View>(() => {
    try {
      return window.matchMedia('(min-width: 1024px)').matches ? 'month' : 'day'
    } catch {
      return 'day'
    }
  })
  const [anchor, setAnchor] = useState(initialDate ?? todayISO()) // mes / semana de referencia
  const [selected, setSelected] = useState(initialDate ?? todayISO()) // día activo
  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const week = useMemo(() => weekDays(anchor), [anchor])

  // Rango a traer según la vista (el de mes cubre la grilla completa de 6 semanas).
  const [from, to] = useMemo<[string, string]>(() => {
    if (view === 'week') return [week[0], week[6]]
    if (view === 'day') return [selected, selected]
    return [grid[0][0], grid[5][6]]
  }, [view, week, grid, selected])

  // Cache de sesión por rango: al volver a la agenda se pinta al instante lo último.
  const cacheKey = `cal:${userId}:${from}:${to}`
  const cached = sessionCache.get<CalSnapshot>(cacheKey)

  const [events, setEvents] = useState<CalendarEvent[]>(cached?.events ?? [])
  const [goals, setGoals] = useState<Goal[]>(cached?.goals ?? [])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(cached?.blocks ?? [])
  const [sessions, setSessions] = useState<Session[]>(cached?.sessions ?? [])
  const [timeSheet, setTimeSheet] = useState<{ goal: Goal; block: ScheduleBlock; session: Session | null } | null>(null)
  const [ready, setReady] = useState(cached !== undefined)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; date: string } | null>(null)
  // Día para el que se está sumando una sesión espontánea desde la agenda.
  const [planning, setPlanning] = useState<string | null>(null)
  // A qué rango pertenecen los datos actuales: al cambiar de mes sin recargar aún, evita
  // reflejar datos del mes anterior bajo la clave del nuevo rango.
  const loadedKeyRef = useRef<string | null>(cached !== undefined ? cacheKey : null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setError(null)
        const [evs, gs, blks, sess] = await Promise.all([
          listEventsInRange(userId, from, to),
          listGoals(userId),
          listScheduleForUser(userId),
          listSessionsInRange(userId, from, to),
        ])
        if (!active) return
        setEvents(evs)
        setGoals(gs)
        setBlocks(blks)
        setSessions(sess)
        loadedKeyRef.current = cacheKey
      } catch (err) {
        if (active) setError(friendlyError(err, 'No se pudo cargar tu agenda.'))
      } finally {
        if (active) setReady(true)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [userId, from, to, cacheKey])

  // Refleja al cache lo mostrado (incluidos cambios optimistas), solo cuando los datos
  // corresponden al rango actual, para que al volver a la agenda se pinte al instante.
  useCacheMirror(cacheKey, ready && !error && loadedKeyRef.current === cacheKey, {
    events,
    goals,
    blocks,
    sessions,
  })

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

  const today = todayISO()

  /** Sesiones del día: filas reales + proyección del compromiso hacia adelante. */
  function daySessions(day: string): DayAgendaSession[] {
    const real = sessions.filter((s) => s.date === day)
    const items: DayAgendaSession[] = []
    for (const s of real) {
      const goal = goalById.get(s.goalId)
      if (!goal) continue
      items.push({
        key: s.id,
        goal,
        time: s.plannedTime,
        state: s.status,
        targetLabel: s.targetKind === 'time' ? `${s.targetValue} min` : `${s.targetValue} ${s.unit ?? ''}`.trim(),
        session: s,
        block: blocks.find((b) => b.id === s.scheduleId) ?? null,
      })
    }
    if (day >= today) {
      for (const b of dueBlocksForDate(blocks, day)) {
        if (real.some((sx) => sx.scheduleId === b.id)) continue
        const goal = goalById.get(b.goalId)
        if (!goal || goal.status !== 'active') continue
        items.push({
          key: `p-${b.id}-${day}`,
          goal,
          time: b.startTime,
          state: 'projected',
          targetLabel: b.targetKind === 'time' ? `${b.targetValue} min` : `${b.targetValue} ${b.unit ?? ''}`.trim(),
          session: null,
          block: b,
        })
      }
    }
    return items.sort((a, b2) => (a.time ?? '99').localeCompare(b2.time ?? '99'))
  }

  function handleSession(it: DayAgendaSession) {
    // Hoy y abierta → directo al cronómetro. Lo demás → fijar hora del bloque.
    if (
      it.session &&
      it.session.date === today &&
      ['pending', 'running', 'unconfirmed'].includes(it.session.status)
    ) {
      navigate(`/sesion/${it.session.id}`)
      return
    }
    if (it.block) setTimeSheet({ goal: it.goal, block: it.block, session: it.session })
  }

  async function saveSessionTime(time: string | null) {
    const ts = timeSheet
    setTimeSheet(null)
    if (!ts) return
    try {
      const updatedBlock = await updateBlockStartTime(ts.block.id, time)
      setBlocks((prev) => prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)))
      if (ts.session) {
        const updatedSession = await setSessionPlannedTime(ts.session.id, time)
        setSessions((prev) => prev.map((sx) => (sx.id === updatedSession.id ? updatedSession : sx)))
      }
      toast(
        time
          ? `Listo: todos los ${WEEKDAY_PLURALS[ts.block.weekday]} a las ${formatTime12(time)}.`
          : 'Hora quitada.',
        'success',
      )
    } catch {
      toast('No se pudo guardar la hora.')
    }
  }

  /** Suma una sesión espontánea a una meta en el día elegido desde la agenda. */
  async function planSession(goal: Goal) {
    const date = planning
    setPlanning(null)
    if (!date) return
    try {
      const ownBlock = blocks.find((b) => b.goalId === goal.id)
      const created = await createSpontaneousSession(userId, goal.id, date, {
        targetKind: ownBlock?.targetKind ?? 'time',
        targetValue: ownBlock?.targetValue ?? profile.defaultSessionMinutes ?? 25,
        unit: ownBlock?.unit ?? null,
      })
      setSessions((prev) => [...prev, created])
      toast(`Sesión agregada para “${goal.title}”.`, 'success')
    } catch {
      toast('No se pudo agregar la sesión.')
    }
  }

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
    // Mantenemos en memoria solo lo que cae en el rango visible: si moviste un
    // evento a otra semana/mes, no queda como "fantasma" (se recarga al navegar allá).
    const inRange = (e: CalendarEvent) => e.date >= from && e.date <= to
    if (current) {
      const updated = await updateEvent(current.id, input)
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)).filter(inRange))
    } else {
      const created = await createEvent(userId, input)
      setEvents((prev) => [...prev, created].filter(inRange))
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
    sessions: daySessions(day),
    onSession: handleSession,
    events: eventsByDate.get(day) ?? [],
    deadlines: deadlinesByDate.get(day) ?? [],
    goalById,
    onAdd: () => setEditing({ event: null, date: day }),
    onOpen: (e: CalendarEvent) => setEditing({ event: e, date: e.date }),
    onGoal: (g: Goal) => navigate(`/metas/${g.id}`),
    onPlanSession:
      day >= today && activeGoals.length > 0 ? () => setPlanning(day) : undefined,
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
          <Hint id="calendar-uses-2026-06">
            Tus <strong>sesiones comprometidas</strong> aparecen aquí con su hora y estado — toca
            una para fijarle horario. También puedes agendar eventos propios y dejar notas.
          </Hint>
        </div>
      )}

      {!ready ? (
        <LoadingScreen error={error ?? undefined} />
      ) : view === 'month' ? (
        <div className="cal-month">
          <div className="cal-month__grid">
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
                      {daySessions(day).length > 0 && <span className="cal-dot cal-dot--session" />}
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.id} className="cal-dot" />
                      ))}
                      {evs.length > 3 && <span className="cal-cell__more">+{evs.length - 3}</span>}
                      {deadlinesByDate.has(day) && <span className="cal-dot cal-dot--goal" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="cal-month__day">
            <DaySection {...dayProps(selected)} />
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="stack cal-week">
          {week.map((day) => (
            <DaySection key={day} {...dayProps(day)} />
          ))}
        </div>
      ) : (
        <DaySection {...dayProps(selected)} />
      )}

      {timeSheet && (
        <TimeSheet
          goal={timeSheet.goal}
          block={timeSheet.block}
          suggested={suggestedTime}
          onClose={() => setTimeSheet(null)}
          onSave={(t) => void saveSessionTime(t)}
        />
      )}

      {planning && (
        <PlanSessionSheet
          date={planning}
          goals={activeGoals}
          onPick={(g) => void planSession(g)}
          onClose={() => setPlanning(null)}
        />
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
  sessions,
  onSession,
  events,
  deadlines,
  goalById,
  onAdd,
  onOpen,
  onGoal,
  onPlanSession,
}: {
  day: string
  sessions: DayAgendaSession[]
  onSession: (it: DayAgendaSession) => void
  events: CalendarEvent[]
  deadlines: Goal[]
  goalById: Map<string, Goal>
  onAdd: () => void
  onOpen: (e: CalendarEvent) => void
  onGoal: (g: Goal) => void
  /** Sumar una sesión espontánea este día (solo hoy o futuro, con metas activas). */
  onPlanSession?: () => void
}) {
  const empty = sessions.length === 0 && events.length === 0 && deadlines.length === 0
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
        <p className="faint small">Nada agendado. Toca + para sumar algo.</p>
      ) : (
        <div className="stack stack--sm">
          {sessions.map((it) => {
            const isClosed = ['done', 'partial', 'missed'].includes(it.state)
            return (
              <button
                key={it.key}
                className={`ev ev--session${isClosed ? ' ev--closed' : ''}`}
                style={nicheAccent(it.goal.area)}
                disabled={isClosed}
                onClick={() => onSession(it)}
                aria-label={`Sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}`}
              >
                <span className="ev__time">{it.time ? formatTime12(it.time) : '—'}</span>
                <span className="ev__body">
                  <span className="ev__title">Sesión · {it.goal.title}</span>
                  <span className="ev__meta">
                    <span className="tag">{sessionStateLabel(it.state)}</span>
                    <span className="faint tiny">{it.targetLabel}</span>
                  </span>
                </span>
              </button>
            )
          })}
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
                <span className="ev__time">{e.allDay || !e.startTime ? 'Día' : formatTime12(e.startTime)}</span>
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

      {onPlanSession && (
        <button
          type="button"
          className="btn--link"
          style={{ alignSelf: 'flex-start' }}
          onClick={onPlanSession}
        >
          + Sesión para una meta
        </button>
      )}
    </section>
  )
}

/** Hoja para sumar una sesión espontánea a una meta en el día elegido. */
function PlanSessionSheet({
  date,
  goals,
  onPick,
  onClose,
}: {
  date: string
  goals: Goal[]
  onPick: (g: Goal) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <div ref={panelRef} className="sheet__panel stack stack--lg">
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿A qué meta le sumas una sesión?</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Se agrega para el {formatWeekday(date)}, además de tu compromiso.
        </p>
        <div className="stack stack--sm">
          {goals.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip"
              style={{ justifyContent: 'flex-start' }}
              onClick={() => onPick(g)}
            >
              <NicheIcon area={g.area} size={14} /> {g.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Hoja para fijar la hora de una sesión comprometida ("todos los lunes a las 19:00"). */
function TimeSheet({
  goal,
  block,
  suggested,
  onClose,
  onSave,
}: {
  goal: Goal
  block: ScheduleBlock
  /** Hora sugerida según el momento preferido del perfil (editable). */
  suggested: string | null
  onClose: () => void
  onSave: (time: string | null) => void
}) {
  const [time, setTime] = useState(block.startTime ?? suggested ?? '')
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <div ref={panelRef} className="sheet__panel stack stack--lg">
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿A qué hora te queda cómodo?</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Sesión de <strong>{goal.title}</strong> · todos los {WEEKDAY_PLURALS[block.weekday]} ·{' '}
          {block.targetKind === 'time' ? `${block.targetValue} min` : `${block.targetValue} ${block.unit ?? ''}`}
        </p>
        <input
          className="input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Hora de la sesión"
        />
        <button className="btn btn--primary btn--block" disabled={!time} onClick={() => onSave(time)}>
          Guardar para todos los {WEEKDAY_PLURALS[block.weekday]}
        </button>
        {block.startTime && (
          <button className="btn btn--ghost btn--block" onClick={() => onSave(null)}>
            Quitar hora
          </button>
        )}
      </div>
    </div>
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
  // Borrador a prueba de la recarga automática de la PWA: lo que escribiste
  // vuelve al reabrir el editor. Guardar, borrar o cerrar a propósito lo limpia.
  const draftKey = `logralo.event-edit.${initial?.id ?? `new-${date}`}`
  const [draft] = useState(() =>
    loadFormDraft<{
      title: string
      eventDate: string
      allDay: boolean
      startTime: string
      endTime: string
      goalId: string
      notes: string
    }>(draftKey),
  )
  const [title, setTitle] = useState(
    typeof draft?.title === 'string' ? draft.title : (initial?.title ?? ''),
  )
  const [eventDate, setEventDate] = useState(
    typeof draft?.eventDate === 'string' ? draft.eventDate : (initial?.date ?? date),
  )
  const [allDay, setAllDay] = useState(
    typeof draft?.allDay === 'boolean' ? draft.allDay : (initial?.allDay ?? true),
  )
  const [startTime, setStartTime] = useState(
    typeof draft?.startTime === 'string' ? draft.startTime : (initial?.startTime ?? ''),
  )
  const [endTime, setEndTime] = useState(
    typeof draft?.endTime === 'string' ? draft.endTime : (initial?.endTime ?? ''),
  )
  const [goalId, setGoalId] = useState(
    typeof draft?.goalId === 'string' ? draft.goalId : (initial?.goalId ?? ''),
  )
  const [notes, setNotes] = useState(
    typeof draft?.notes === 'string' ? draft.notes : (initial?.notes ?? ''),
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const panelRef = useRef<HTMLFormElement>(null)

  function close() {
    clearFormDraft(draftKey)
    onClose()
  }
  useFocusTrap(panelRef, close)

  useEffect(() => {
    saveFormDraft(draftKey, { title, eventDate, allDay, startTime, endTime, goalId, notes })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, eventDate, allDay, startTime, endTime, goalId, notes])

  // Body-lock mientras el sheet está abierto: el fondo no scrollea, no hay leakage
  // de gestos. Restauramos el estado anterior al cerrar para no pisar usos previos.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Con horario, si hay fin debe ser posterior al inicio (comparación lexicográfica
  // = cronológica para HH:MM con cero a la izquierda).
  const timeRangeInvalid =
    !allDay && startTime.length > 0 && endTime.length > 0 && endTime <= startTime
  const canSave =
    title.trim().length > 0 && (allDay || startTime.length > 0) && !timeRangeInvalid

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
    })
      .then(() => clearFormDraft(draftKey))
      .catch((e2: unknown) => {
        setErr(friendlyError(e2, 'No se pudo guardar.'))
        setSaving(false)
      })
  }

  function handleDelete() {
    setSaving(true)
    setErr(null)
    onDelete()
      .then(() => clearFormDraft(draftKey))
      .catch((e2: unknown) => {
        setErr(friendlyError(e2, 'No se pudo borrar.'))
        setSaving(false)
      })
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={close} />
      <form ref={panelRef} className="sheet__panel stack stack--lg" onSubmit={handleSubmit}>
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{initial ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <input
          className="input"
          autoFocus
          placeholder="¿Qué tienes? Ej: Clase de inglés"
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
            <>
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
              {timeRangeInvalid && (
                <p className="alert alert--error" role="alert" style={{ marginTop: 'var(--s2)' }}>
                  La hora de fin tiene que ser posterior a la de inicio.
                </p>
              )}
            </>
          )}
        </div>

        {goals.length > 0 && (
          <div className="field">
            <span className="field__label">¿Es para una meta?</span>
            <span className="field__hint">
              Opcional. Vincularlo suma a lo agendado de esa meta.
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
